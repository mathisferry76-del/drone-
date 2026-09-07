import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { randomUUID } from "crypto";
import { getFalKey } from "@/lib/fal";
import { animateImageToVideo, describeFalVideoError } from "@/lib/fal-video";
import { getReplicateKey } from "@/lib/replicate";
import { animateImageToVideoReplicate, describeReplicateVideoError } from "@/lib/replicate-video";
import { cropVideoToPortrait } from "@/lib/video-crop";
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
// Kept in sync with DESCRIPTION_MAX in app/impress/page.tsx (shared
// textarea component for image and video mode) and MAX_DESCRIPTION in
// app/api/impress/route.ts.
const MAX_DESCRIPTION = 1200;
// Long enough that leaving the tab open for a while and coming back still
// works, without needing to revisit /historique for the same result.
const SIGNED_URL_TTL_SECONDS = 6 * 60 * 60;

// The user's raw description used to be sent to Veo completely unwrapped —
// unlike /api/impress's buildImpressPrompt, no system-level guidance at
// all. Confirmed in production, twice: (1) a "camera orbits around the
// car" request reveals the sides/rear that were never in the source
// photo, so Veo has to invent that geometry and can drift to a visibly
// different body style (an invented sedan silhouette for a photo that
// showed wagon-style roof rails); (2) recommending a zoom as the "safe"
// default instead made the subject zoom in so far it left the frame
// entirely on the very next test — trading one framing problem for
// another. Neither a reveal-style rotation nor a strong zoom is what this
// needs by default: the main subject staying fully, comfortably in frame
// for the whole clip is the actual requirement, and only mild motion that
// doesn't require inventing unseen geometry reliably delivers that.
function buildAnimatePrompt(userDescription: string, wantsPortrait: boolean): string {
  // Veo only ever renders 16:9; a portrait request crops that output down
  // to roughly the center third of its width afterward (lib/video-crop.ts).
  // "Stay in frame" alone only protects against leaving the full 16:9
  // canvas — confirmed in production to be nowhere near enough for
  // portrait: an orbit that keeps the subject safely inside the wide frame
  // the whole time can still drift out of that much narrower center column
  // partway through, so the cropped result shows the subject sliding off
  // one edge even though the raw 16:9 clip never technically "lost" it.
  const portraitRule = wantsPortrait
    ? `\n- Cette vidéo sera recadrée verticalement après coup, en ne conservant que la bande centrale (environ le tiers central de la largeur de l'image). Le sujet principal doit donc rester dans cette bande centrale étroite du premier au dernier photogramme, pas seulement "dans le cadre" au sens large — tout mouvement de caméra (travelling, orbite, révélation d'un côté) qui déplace le sujet vers les bords gauche/droite le fera disparaître du résultat final même s'il reste visible dans le cadre large. Privilégie donc un mouvement quasi immobile ou une rotation très légère qui garde le sujet bien centré horizontalement en permanence.`
    : "";
  return `Tu animes une photo réelle fixe en un clip vidéo court et réaliste, pas une scène générée de zéro. Un seul angle de caméra a été réellement photographié — tout le reste (côtés, arrière, dessous) n'existe dans aucune donnée réelle et doit être traité avec prudence.

Règles de mouvement de caméra :
- Le sujet principal (véhicule/personne/objet demandé) doit rester ENTIÈREMENT visible dans le cadre du premier au dernier photogramme, à une taille comparable à celle de la photo d'origine — ni recadré, ni coupé sur les bords, ni sorti du cadre. C'est la règle la plus importante, plus importante que le style du mouvement demandé.
- Sauf si la description ci-dessous demande explicitement un zoom prononcé, n'utilise PAS de zoom avant marqué — un zoom qui grossit trop le sujet finit par le faire sortir du cadre, ce qui est un échec pire que l'absence de mouvement. Privilégie par défaut un mouvement discret qui ne change presque rien au cadrage : très léger travelling ou parallaxe (quelques % de déplacement latéral maximum), inclinaison verticale à peine perceptible, ou simplement les reflets/lumières/éléments du décor (feuillage, cheveux, vêtements) qui bougent doucement pendant que la caméra reste quasiment fixe.
- Si la description demande explicitement de tourner autour du sujet ou de révéler un côté/l'arrière non visible sur la photo d'origine, tu peux le faire, mais toute partie nouvellement visible (carrosserie, silhouette, structure) doit rester STRICTEMENT cohérente avec le style de carrosserie, les proportions et les lignes de design déjà visibles sur la photo (ex : une voiture qui a des barres de toit et l'allure d'un break/Avant sur la photo d'origine doit rester un break/Avant une fois le côté ou l'arrière révélé, jamais dériver vers une silhouette de berline ou de coupé). Ne change JAMAIS le type de carrosserie, le nombre de portes visibles ou les proportions générales du sujet entre le début et la fin du clip.
- Garde le décor, la lumière, les couleurs et l'identité exacte du sujet (même véhicule/objet, mêmes finitions) cohérents sur toute la durée du clip — aucun élément ne doit se transformer, apparaître ou disparaître de façon incohérente.${portraitRule}

Mouvement demandé : ${userDescription}`;
}

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
    // Veo itself only ever renders 16:9 (see the crop logic below and
    // lib/fal-video.ts/lib/replicate-video.ts) — "portrait" here means
    // cropping that real 16:9 output into 9:16 ourselves afterward, not
    // requesting a different aspect ratio from the provider.
    const wantsPortrait = formData.get("format") === "portrait";

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

      if (width && height) {
        // Veo 3.1's image-to-video mode only ever actually renders 16:9
        // internally — per Google's own docs, portrait 9:16 is explicitly
        // excluded from that mode (only supported for text-to-video), and
        // is independently confirmed by users hitting the same "accepts
        // 9:16, silently renders 16:9 anyway" behavior on the official
        // forum. Passing "9:16" to the provider doesn't produce a portrait
        // video — it produces the same 16:9 content letterboxed into a
        // taller canvas, which is what made a photo that filled the whole
        // screen show up shrunk with black bars top and bottom. Always
        // cropping to 16:9 ourselves first — trimming only the minimum off
        // whichever side is oversized, centered, no resampling/zoom — is
        // what actually fills the real (always-landscape) output frame
        // with the source photo, whatever orientation it was shot in.
        const targetRatio = 16 / 9;
        const currentRatio = width / height;
        let cropWidth = width;
        let cropHeight = height;
        if (currentRatio > targetRatio) {
          cropWidth = Math.round(height * targetRatio);
        } else {
          cropHeight = Math.round(width / targetRatio);
        }
        const left = Math.round((width - cropWidth) / 2);
        const top = Math.round((height - cropHeight) / 2);
        normalizedInput = await rotated
          .extract({ left, top, width: cropWidth, height: cropHeight })
          .png()
          .toBuffer();
      } else {
        normalizedInput = await rotated.png().toBuffer();
      }
    } catch {
      await releaseReservationIfNeeded();
      return NextResponse.json(
        { error: "Cette photo n'a pas pu être lue par le serveur. Essaie de la réexporter en JPEG ou PNG." },
        { status: 400 }
      );
    }

    const prompt = buildAnimatePrompt(description, wantsPortrait);
    const rawVideoUrl =
      provider === "fal"
        ? await animateImageToVideo(normalizedInput, prompt, req.signal)
        : await animateImageToVideoReplicate(normalizedInput, prompt, req.signal);

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
      let videoBuffer: Buffer<ArrayBufferLike> = Buffer.from(await videoRes.arrayBuffer());
      if (wantsPortrait) {
        try {
          videoBuffer = await cropVideoToPortrait(videoBuffer);
        } catch (err) {
          // Falls back to the real 16:9 clip rather than losing an
          // already-paid-for generation over a cropping failure.
          console.error("cropVideoToPortrait error", err);
        }
      }
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
