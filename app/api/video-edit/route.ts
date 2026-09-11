import { NextRequest, NextResponse } from "next/server";
import { getReplicateKey } from "@/lib/replicate";
import {
  startVideoEdit,
  cancelVideoEditPrediction,
  describeReplicateVideoError,
} from "@/lib/replicate-video";
import { getVideoDurationSeconds, hasAudioStream } from "@/lib/probe-video";
import { normalizeVideoForSeedance } from "@/lib/video-normalize";
import {
  MIN_EDIT_VIDEO_SECONDS,
  MAX_EDIT_VIDEO_SECONDS,
  getVideoEditCreditCost,
} from "@/lib/presets";
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

// Kept in sync with MAX_DESCRIPTION in app/api/impress/route.ts and
// app/api/animate/route.ts.
const MAX_DESCRIPTION = 1200;

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

  // Set once the video's real duration is known (before reservation) —
  // pricing is proportional to actual duration, not a flat fee, so the
  // exact amount reserved has to be known here to refund the right
  // amount on any failure after that point.
  let reservation: string | null = null;
  let cost = 0;
  async function releaseReservationIfNeeded() {
    if (!reservation) return;
    if (reservation !== "ok_trial" && reservation !== "ok_credits") return;
    try {
      await admin!.rpc("release_credits_reservation", {
        p_user_id: authUser!.id,
        p_reservation: reservation,
        p_cost: cost,
      });
    } catch (err) {
      console.error("release_credits_reservation error", err);
    }
  }

  // Cleans up the temp upload (app/api/video-edit/upload-url/route.ts) on
  // every exit path once it's been read into memory — nothing downstream
  // needs it anymore, and leaving it would slowly accumulate orphaned
  // files in the 'videos' bucket.
  let tempStoragePath: string | null = null;
  async function cleanupTempUpload() {
    if (!tempStoragePath) return;
    try {
      await admin!.storage.from("videos").remove([tempStoragePath]);
    } catch (err) {
      console.error("temp upload cleanup error", err);
    }
  }

  try {
    // The video itself never passes through this route's own request body
    // — see app/api/video-edit/upload-url/route.ts for why (Vercel's
    // request body ceiling, hit in production on a real 4-6s phone clip).
    // The browser uploads it straight to Supabase Storage and only sends
    // us the resulting path, a few bytes of JSON.
    const body = (await req.json()) as { storagePath?: string; description?: string };
    const storagePath = body.storagePath ?? "";
    const description = String(body.description ?? "").trim().slice(0, MAX_DESCRIPTION);

    // Defense in depth: the path is scoped to this user's own folder by
    // construction (upload-url/route.ts), but never trust a client-
    // supplied path without checking it actually belongs to the caller —
    // otherwise any authenticated user could point this at another
    // user's temp upload.
    if (!storagePath || !storagePath.startsWith(`${authUser.id}/video-edit-tmp/`)) {
      return NextResponse.json({ error: "Vidéo introuvable." }, { status: 400 });
    }
    tempStoragePath = storagePath;

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
      await cleanupTempUpload();
      return NextResponse.json(
        { error: "Aucun fournisseur vidéo configuré (REPLICATE_API_TOKEN manquante)." },
        { status: 500 }
      );
    }

    const { data: downloaded, error: downloadError } = await admin.storage
      .from("videos")
      .download(storagePath);
    if (downloadError || !downloaded) {
      console.error("video-edit download error", downloadError);
      return NextResponse.json(
        { error: "Impossible de récupérer la vidéo envoyée. Réessaie." },
        { status: 400 }
      );
    }
    const videoBuffer = Buffer.from(await downloaded.arrayBuffer());
    // Nothing past this point still needs the temp upload, success or
    // failure — clean it up now rather than scattering the same call
    // across every subsequent early return.
    await cleanupTempUpload();

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

    // Proportional to the real, measured duration — not a flat fee — so a
    // 4s clip costs less than a 7s one, matching the real API cost this
    // feature bills against (see lib/presets.ts's comment for the math).
    cost = getVideoEditCreditCost(durationSeconds);

    // Real credit reservation — same as app/api/animate/route.ts, no
    // free-trial/owner bypass, since this always costs real money to
    // generate.
    const { data: reserved, error: reserveError } = await admin.rpc("reserve_credits", {
      p_user_id: authUser.id,
      p_cost: cost,
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
          error: `Crédits insuffisants (il faut ${cost} crédits pour éditer cette vidéo de ${durationSeconds.toFixed(1)}s). Achète un pack sur /pricing pour continuer.`,
        },
        { status: 403 }
      );
    }

    // Requesting generated audio "consistent with the original ambience"
    // (generate_audio: true) on a source clip with no audio track at all
    // has nothing to stay consistent with — only ask for it when there's
    // real source audio to anchor to.
    const generateAudio = await hasAudioStream(normalizedVideo);

    const prompt = buildVideoEditPrompt(description);
    const predictionId = await startVideoEdit(normalizedVideo, prompt, generateAudio);

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
      cost,
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

    return NextResponse.json({ predictionId, cost });
  } catch (err) {
    await cleanupTempUpload();
    await releaseReservationIfNeeded();
    if (req.signal.aborted) {
      return NextResponse.json({ error: "Génération annulée." }, { status: 499 });
    }
    console.error("video-edit error", err);
    return NextResponse.json({ error: describeReplicateVideoError(err) }, { status: 502 });
  }
}
