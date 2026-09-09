import { NextRequest, NextResponse } from "next/server";
import { getReplicateKey } from "@/lib/replicate";
import {
  startVideoEdit,
  cancelVideoEditPrediction,
  describeReplicateVideoError,
} from "@/lib/replicate-video";
import { getVideoDurationSeconds } from "@/lib/probe-video";
import { normalizeVideoForSeedance } from "@/lib/video-normalize";
import { VIDEO_EDIT_CREDIT_COST } from "@/lib/presets";
import { getSupabaseAdmin, getUserFromAuthHeader, Profile } from "@/lib/supabase";
import { isRateLimited, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
// Only starts the Replicate job and returns its id — the actual generation
// is polled separately (app/api/video-edit/status/route.ts), so this route
// only ever needs long enough for validation, the ffprobe duration check,
// and one fast predictions.create() call, not the whole edit's runtime. See
// lib/replicate-video.ts's startVideoEdit comment for why this route can't
// just block until the job finishes instead.
export const maxDuration = 60;

// Sanity ceiling against memory exhaustion in the serverless function, not
// a deliberate product limit on its own — MAX_EDIT_VIDEO_SECONDS below is
// the real, cost-driven limit for this route (see lib/presets.ts's
// VIDEO_EDIT_CREDIT_COST comment for the full cost math).
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
// Kept in sync with MAX_DESCRIPTION in app/api/impress/route.ts and
// app/api/animate/route.ts.
const MAX_DESCRIPTION = 1200;
// This mode's `duration: -1` requirement (lib/replicate-video.ts) means the
// output follows the input clip's own length, and billing follows it too —
// at Replicate's "video_in" 720p rate ($0.9676/s), a 30s upload (the
// longest Seedance itself accepts as a reference) would cost ~29$ for a
// single generation. MIN_EDIT_VIDEO_SECONDS is not our own choice — a live
// test confirmed Seedance's editing mode hard-rejects any reference video
// under 4s outright ("the video selected must satisfy the duration
// requirement of 4 to 30 seconds", straight from its own error message),
// so 4s is a real provider floor, not a design decision. MAX_EDIT_VIDEO_
// SECONDS keeps the worst case around ~5.80$ (matching VIDEO_EDIT_CREDIT_
// COST's cost basis, see lib/presets.ts) while leaving enough room above
// the 4s floor for a real export to land inside the window without users
// needing to trim to the exact second.
const MIN_EDIT_VIDEO_SECONDS = 4;
const MAX_EDIT_VIDEO_SECONDS = 6;

// Mirrors Seedance 2.5's own documented convention for this mode (its
// model README, not guessed): reference the uploaded clip as [Video1] and
// state both what to change and what to keep, so the model has an explicit
// anchor for "the video" instead of inferring it's the only reference
// passed. The plate/logo fidelity and "don't reinvent the scene" rules
// mirror buildAnimatePrompt in app/api/animate/route.ts — the same visual
// consistency failure modes apply to an edited clip as to an animated one.
function buildVideoEditPrompt(userDescription: string): string {
  return `Tu modifies [Video1], une vidéo réelle existante, selon UN SEUL changement précis — pas une nouvelle scène générée de zéro. Garde absolument tout le reste de [Video1] identique : le mouvement de caméra, le décor, la lumière, le cadrage et le rythme d'origine ne doivent pas changer.

Règles :
- N'applique que le changement décrit ci-dessous. Ne réinvente rien d'autre dans la scène : mêmes personnages/objets non concernés, même arrière-plan, mêmes couleurs ambiantes.
- Le mouvement de caméra et le mouvement des sujets dans [Video1] doivent rester exactement les mêmes après modification — seul l'élément demandé change, jamais la manière dont la caméra bouge ou dont la scène évolue dans le temps.
- Les logos, badges, plaques d'immatriculation et tout texte/inscription déjà visibles dans [Video1] (autres que ceux concernés par le changement demandé) doivent rester exactement tels quels sur toute la durée du clip — ne les réinvente jamais, ne les fais jamais flouter ni se déformer.
- Le son d'origine (bruits, ambiance) doit rester cohérent avec la nouvelle scène ; ne change pas la bande sonore pour une raison sans rapport avec le changement demandé.

Changement demandé dans [Video1] : ${userDescription}`;
}

export async function POST(req: NextRequest) {
  if (isRateLimited(`video-edit:${getClientIp(req)}`, 5, 10 * 60 * 1000)) {
    return NextResponse.json(
      { error: "Trop de tentatives. Réessaie dans quelques minutes." },
      { status: 429 }
    );
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: "Connecte-toi et choisis un plan pour utiliser cette fonctionnalité." },
      { status: 401 }
    );
  }

  const authUser = await getUserFromAuthHeader(req.headers.get("authorization"));
  if (!authUser) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }

  const { data } = await admin.from("profiles").select("*").eq("id", authUser.id).single();
  const profile = data as Profile | null;
  if (!profile) {
    return NextResponse.json(
      { error: "Profil introuvable. Déconnecte-toi puis reconnecte-toi." },
      { status: 401 }
    );
  }

  let reservation: string | null = null;
  async function releaseReservationIfNeeded() {
    if (!reservation) return;
    if (reservation !== "ok_trial" && reservation !== "ok_credits") return;
    try {
      await admin!.rpc("release_credits_reservation", {
        p_user_id: authUser!.id,
        p_reservation: reservation,
        p_cost: VIDEO_EDIT_CREDIT_COST,
      });
    } catch (err) {
      console.error("release_credits_reservation error", err);
    }
  }

  try {
    const formData = await req.formData();
    const file = formData.get("video");
    const description = String(formData.get("description") ?? "").trim().slice(0, MAX_DESCRIPTION);

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Aucune vidéo reçue." }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "Vidéo trop lourde (50 Mo max)." }, { status: 400 });
    }
    if (!description) {
      return NextResponse.json(
        { error: "Décris le changement que tu veux voir dans la vidéo." },
        { status: 400 }
      );
    }

    // This feature is Seedance 2.5 (Replicate) only — no fal.ai fallback,
    // since Veo 3.1 never had a video-to-video editing mode at all (only
    // ever accepted a still image), so there's nothing to fall back to.
    if (!getReplicateKey()) {
      return NextResponse.json(
        { error: "Aucun fournisseur vidéo configuré (REPLICATE_API_TOKEN manquante)." },
        { status: 500 }
      );
    }

    const videoBuffer = Buffer.from(await file.arrayBuffer());

    let durationSeconds: number;
    try {
      durationSeconds = await getVideoDurationSeconds(videoBuffer);
    } catch {
      return NextResponse.json(
        { error: "Cette vidéo n'a pas pu être lue par le serveur. Essaie de la réexporter en MP4." },
        { status: 400 }
      );
    }
    if (durationSeconds < MIN_EDIT_VIDEO_SECONDS) {
      return NextResponse.json(
        {
          error: `Vidéo trop courte (${durationSeconds.toFixed(1)}s) — Seedance exige au moins ${MIN_EDIT_VIDEO_SECONDS} secondes pour ce mode d'édition. Utilise une vidéo un peu plus longue.`,
        },
        { status: 400 }
      );
    }
    if (durationSeconds > MAX_EDIT_VIDEO_SECONDS) {
      return NextResponse.json(
        {
          error: `Vidéo trop longue (${durationSeconds.toFixed(1)}s) — entre ${MIN_EDIT_VIDEO_SECONDS} et ${MAX_EDIT_VIDEO_SECONDS} secondes pour cette fonctionnalité. Recadre-la avant de l'envoyer.`,
        },
        { status: 400 }
      );
    }

    let normalizedVideo: Buffer;
    try {
      normalizedVideo = await normalizeVideoForSeedance(videoBuffer);
    } catch (err) {
      console.error("normalizeVideoForSeedance error", err);
      return NextResponse.json(
        { error: "Cette vidéo n'a pas pu être préparée par le serveur. Essaie de la réexporter en MP4." },
        { status: 400 }
      );
    }

    // Real credit reservation — same as app/api/animate/route.ts, no
    // free-trial/owner bypass, since this always costs real money to
    // generate.
    const { data: reserved, error: reserveError } = await admin.rpc("reserve_credits", {
      p_user_id: authUser.id,
      p_cost: VIDEO_EDIT_CREDIT_COST,
    });

    if (reserveError) {
      console.error("reserve_credits error", reserveError);
      return NextResponse.json(
        { error: "Erreur pendant la vérification des crédits." },
        { status: 500 }
      );
    }

    reservation = reserved as string;
    if (reservation === "insufficient_credits") {
      return NextResponse.json(
        {
          error: `Crédits insuffisants (il faut ${VIDEO_EDIT_CREDIT_COST} crédits pour éditer une vidéo). Achète un pack sur /pricing pour continuer.`,
        },
        { status: 403 }
      );
    }

    const prompt = buildVideoEditPrompt(description);
    const predictionId = await startVideoEdit(normalizedVideo, prompt);

    // Ownership + reservation are recorded server-side (video_edit_jobs),
    // not carried by the client as a token — status/route.ts is a separate,
    // stateless request with no memory of this one, and trusting a
    // client-supplied reservation there would let anyone replay it against
    // the same predictionId to refund credits repeatedly. This row is both
    // the ownership check (only this user's polls can act on this job) and
    // the single source of truth for whether it's already been settled.
    const { error: insertError } = await admin.from("video_edit_jobs").insert({
      prediction_id: predictionId,
      user_id: authUser.id,
      reservation,
    });
    if (insertError) {
      console.error("video_edit_jobs insert error", insertError);
      // Without this row, status/route.ts has no way to verify ownership,
      // find the reservation to refund, or persist the result — the job
      // would run for real (billing our Replicate account) with no way for
      // this user to ever see or be refunded for it. Cancel it best-effort
      // and refund now rather than hand back a predictionId that leads
      // nowhere.
      await cancelVideoEditPrediction(predictionId);
      await releaseReservationIfNeeded();
      return NextResponse.json(
        { error: "Erreur pendant le démarrage de l'édition. Réessaie." },
        { status: 500 }
      );
    }

    return NextResponse.json({ predictionId });
  } catch (err) {
    await releaseReservationIfNeeded();
    if (req.signal.aborted) {
      return NextResponse.json({ error: "Génération annulée." }, { status: 499 });
    }
    console.error("video-edit error", err);
    return NextResponse.json({ error: describeReplicateVideoError(err) }, { status: 502 });
  }
}
