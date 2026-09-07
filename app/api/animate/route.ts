import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { randomUUID } from "crypto";
import { getFalKey } from "@/lib/fal";
import { animateImageToVideo, describeFalVideoError } from "@/lib/fal-video";
import { getReplicateKey } from "@/lib/replicate";
import { animateImageToVideoReplicate, describeReplicateVideoError } from "@/lib/replicate-video";
import { VIDEO_CREDIT_COST } from "@/lib/presets";
import { getSupabaseAdmin, getUserFromAuthHeader, Profile } from "@/lib/supabase";
import { isRateLimited, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
// Veo 3.1 generation is a single, non-parallel call (no CANDIDATE_COUNT
// judging like /api/impress — at ~1.60$ for one 4s clip, generating
// several attempts to pick the best isn't affordable) but video synthesis
// itself commonly takes well over a minute. Requested high; actual ceiling
// still depends on the plan (see the identical caveat on /api/impress).
export const maxDuration = 300;

const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const MAX_DESCRIPTION = 400;
// Long enough that leaving the tab open for a while and coming back still
// works, without needing to revisit /historique for the same result.
const SIGNED_URL_TTL_SECONDS = 6 * 60 * 60;

export async function POST(req: NextRequest) {
  if (isRateLimited(`animate:${getClientIp(req)}`, 5, 10 * 60 * 1000)) {
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
  let provider: "fal" | "replicate" | null = null;
  async function releaseReservationIfNeeded() {
    if (!reservation) return;
    if (reservation !== "ok_trial" && reservation !== "ok_credits") return;
    try {
      await admin!.rpc("release_credits_reservation", {
        p_user_id: authUser!.id,
        p_reservation: reservation,
        p_cost: VIDEO_CREDIT_COST,
      });
    } catch (err) {
      console.error("release_credits_reservation error", err);
    }
  }

  try {
    const formData = await req.formData();
    const file = formData.get("image");
    const description = String(formData.get("description") ?? "").trim().slice(0, MAX_DESCRIPTION);

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Aucune image reçue." }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "Image trop lourde (12 Mo max)." }, { status: 400 });
    }
    if (!description) {
      return NextResponse.json(
        { error: "Décris le mouvement/l'animation que tu veux voir." },
        { status: 400 }
      );
    }

    // Same provider precedent as the image pipeline (app/api/impress/
    // route.ts): fal.ai first if configured, else Replicate — whichever key
    // is actually set decides which host serves Veo 3.1. Checked before the
    // credit reservation below so a missing key never debits credits for a
    // request that was never going to run.
    provider = getFalKey() ? "fal" : getReplicateKey() ? "replicate" : null;
    if (!provider) {
      return NextResponse.json(
        { error: "Aucun fournisseur vidéo configuré (FAL_KEY ou REPLICATE_API_TOKEN manquantes)." },
        { status: 500 }
      );
    }

    // Real credit reservation, deliberately without the `p_force_paid`
    // bypass /api/impress grants its owner account (which returns
    // 'ok_owner' and never touches the balance) — video always costs real
    // credits, owner account included, unlike the image path.
    const { data: reserved, error: reserveError } = await admin.rpc("reserve_credits", {
      p_user_id: authUser.id,
      p_cost: VIDEO_CREDIT_COST,
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
          error: `Crédits insuffisants (il faut ${VIDEO_CREDIT_COST} crédits pour une vidéo). Achète un pack sur /pricing pour continuer.`,
        },
        { status: 403 }
      );
    }

    let normalizedInput: Buffer;
    let aspectRatio: "16:9" | "9:16" = "16:9";
    try {
      const rotated = sharp(Buffer.from(await file.arrayBuffer())).rotate();
      const meta = await rotated.metadata();
      // metadata() reports the file's raw pixel dimensions, not the
      // visually-correct ones — a phone photo commonly stores portrait
      // pixels landscape-swapped plus an EXIF orientation tag (5-8 means a
      // 90°/270° rotation), so width/height need swapping before comparing
      // or every EXIF-rotated portrait photo would be misread as landscape.
      let { width, height } = meta;
      if (meta.orientation && meta.orientation >= 5 && width && height) {
        [width, height] = [height, width];
      }
      // Matches the output video's orientation to the uploaded photo's own
      // orientation instead of always defaulting to landscape — without
      // this, a portrait photo got squeezed/shrunk into a 16:9 frame
      // instead of producing a portrait video.
      if (width && height && height > width) {
        aspectRatio = "9:16";
      }
      normalizedInput = await rotated.png().toBuffer();
    } catch {
      await releaseReservationIfNeeded();
      return NextResponse.json(
        { error: "Cette photo n'a pas pu être lue par le serveur. Essaie de la réexporter en JPEG ou PNG." },
        { status: 400 }
      );
    }

    const rawVideoUrl =
      provider === "fal"
        ? await animateImageToVideo(normalizedInput, description, aspectRatio, req.signal)
        : await animateImageToVideoReplicate(normalizedInput, description, aspectRatio, req.signal);

    // fal.ai/Replicate's returned URL points at the provider's own hosted
    // copy, which isn't guaranteed to stay reachable indefinitely
    // (Replicate's in particular can expire) — re-download and re-upload to
    // our own 'videos' bucket so the result survives a page reload or a
    // slow viewer, the same way /api/impress persists every image result to
    // 'thumbnails'. Also recorded in `generations` so it shows up in
    // /historique like every other generation. A failure here is logged but
    // never discards an already-paid-for generation: the provider's own URL
    // is returned as a fallback either way.
    let videoUrl = rawVideoUrl;
    try {
      const videoRes = await fetch(rawVideoUrl, { signal: req.signal });
      if (!videoRes.ok) {
        throw new Error(`download failed (${videoRes.status})`);
      }
      const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
      const storagePath = `${authUser.id}/${randomUUID()}.mp4`;

      const { error: uploadError } = await admin.storage
        .from("videos")
        .upload(storagePath, videoBuffer, { contentType: "video/mp4" });
      if (uploadError) throw uploadError;

      const { data: signed } = await admin.storage
        .from("videos")
        .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
      if (signed?.signedUrl) videoUrl = signed.signedUrl;

      await admin.from("generations").insert({
        user_id: authUser.id,
        storage_path: storagePath,
        storage_bucket: "videos",
        kind: "video",
        preset_id: "impress-video",
        used_ai: true,
      });
    } catch (err) {
      console.error("animate history save error", err);
    }

    return NextResponse.json({ video: videoUrl });
  } catch (err) {
    await releaseReservationIfNeeded();
    if (req.signal.aborted) {
      return NextResponse.json({ error: "Génération annulée." }, { status: 499 });
    }
    console.error("animate error", err);
    const message =
      provider === "replicate" ? describeReplicateVideoError(err) : describeFalVideoError(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
