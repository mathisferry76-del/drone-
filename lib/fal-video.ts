import { fal, ApiError } from "@fal-ai/client";
import { getFalKey } from "./fal";

// Veo 3.1 (Google, served via fal.ai) — same fal.ai account already used
// for FLUX Kontext (lib/fal.ts), no new provider to set up. Chosen because
// it's the top-tier option with native synchronized audio, which is
// specifically what was asked for here ("haut de gamme avec son").
const VEO_MODEL = "fal-ai/veo3.1/image-to-video";

// fal's client is a lazy singleton (`fal.config` mutates shared module
// state) — reuses the exact same pattern as lib/fal.ts's ensureConfigured,
// duplicated rather than imported since fal.config is idempotent to call
// twice and this keeps the two files independent.
let configured = false;
function ensureConfigured(key: string) {
  if (configured) return;
  fal.config({ credentials: key });
  configured = true;
}

export class FalVideoApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "FalVideoApiError";
  }
}

// Animates a still image into a short video clip with Veo 3.1 and returns
// fal's own hosted URL for the result — deliberately NOT downloaded and
// re-encoded as base64 the way lib/fal.ts's image path does for images.
// A 4s/1080p/audio clip is multiple MB, and proxying that through a
// serverless function's JSON response risks Vercel's response-size limits
// in a way a single generated photo never does; fal's storage URL is
// perfectly playable directly in a <video> tag, so there's no reason to
// round-trip the bytes through our own server at all. `duration` is capped
// at "4s" — Veo 3.1's own minimum, and also the cheapest option at 0.40$/s
// with audio (~1.60$ for a 4s clip at 1080p) — there's no way to get a
// shorter/cheaper clip from this model.
export async function animateImageToVideo(
  image: Buffer,
  prompt: string,
  aspectRatio: "16:9" | "9:16",
  signal?: AbortSignal
): Promise<string> {
  const key = getFalKey();
  if (!key) {
    throw new Error("fal.ai n'est pas configuré (FAL_KEY manquante).");
  }
  ensureConfigured(key);

  try {
    const result = await fal.subscribe(VEO_MODEL, {
      input: {
        image_url: new Blob([new Uint8Array(image)], { type: "image/png" }),
        prompt,
        duration: "4s",
        resolution: "1080p",
        generate_audio: true,
        // Explicit rather than "auto" — matched to the uploaded photo's own
        // orientation (see app/api/animate/route.ts) so a portrait photo
        // reliably produces a portrait video instead of being shrunk to fit
        // a landscape frame.
        aspect_ratio: aspectRatio,
      },
      abortSignal: signal,
    });

    const url = result.data.video?.url;
    if (!url) {
      throw new Error("fal.ai (Veo 3.1) n'a renvoyé aucune vidéo.");
    }
    return url;
  } catch (err) {
    if (err instanceof ApiError) {
      throw new FalVideoApiError(err.status, err.message);
    }
    throw err;
  }
}

export function describeFalVideoError(err: unknown): string {
  if (err instanceof FalVideoApiError) {
    switch (err.status) {
      case 401:
      case 403:
        return "Clé fal.ai invalide ou refusée. Vérifie FAL_KEY sur Vercel.";
      case 422:
        return "Photo ou description refusée par fal.ai (requête invalide). Essaie une autre photo.";
      case 429:
        return "Quota fal.ai atteint ou compte sans crédit. Vérifie la facturation sur fal.ai/dashboard/billing.";
      default:
        return `Erreur fal.ai Veo 3.1 (${err.status}) : ${err.message}`;
    }
  }
  if (err instanceof Error) return err.message;
  return "Erreur inconnue pendant l'animation vidéo.";
}
