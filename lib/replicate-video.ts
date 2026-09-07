import Replicate, { type ApiError, type FileOutput } from "replicate";
import { getReplicateKey } from "./replicate";

// Veo 3.1 (Google), same model as lib/fal-video.ts's fal.ai integration —
// just hosted on Replicate instead, for whoever only has REPLICATE_API_TOKEN
// configured and not FAL_KEY. Mirrors the existing image pipeline's
// precedent (lib/replicate.ts's FLUX.1 Kontext [Max]): same underlying
// model, independent hosts, selected by whichever key is actually set (see
// the provider check in app/api/animate/route.ts).
//
// Schema confirmed only from Replicate's own published example (`image`,
// `prompt`, `duration`: 4/6/8, `resolution`: "720p"/"1080p") plus
// `aspect_ratio` ("16:9"/"9:16", confirmed via Veo 3.1's own portrait-mode
// announcement) — this sandbox's network egress blocks replicate.com
// itself, so an audio-generation flag couldn't be verified and is
// deliberately left out rather than guessed: Replicate's Cog-based schemas
// reject unrecognized input fields outright, so an unconfirmed field risks
// breaking every call instead of just this one. Pricing (~0.40$/s with
// audio at 1080p on Replicate too, same ballpark as fal.ai) matches
// VIDEO_CREDIT_COST's assumption in lib/presets.ts without changes.
const VEO_MODEL = "google/veo-3.1";

let client: Replicate | null = null;
function getClient(key: string): Replicate {
  if (!client) {
    client = new Replicate({ auth: key });
  }
  return client;
}

export class ReplicateVideoApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ReplicateVideoApiError";
  }
}

export async function animateImageToVideoReplicate(
  image: Buffer,
  prompt: string,
  aspectRatio: "16:9" | "9:16",
  signal?: AbortSignal
): Promise<string> {
  const key = getReplicateKey();
  if (!key) {
    throw new Error("Replicate n'est pas configuré (REPLICATE_API_TOKEN manquante).");
  }
  const replicate = getClient(key);

  try {
    const raw = await replicate.run(
      VEO_MODEL,
      {
        input: {
          image,
          prompt,
          duration: 4,
          resolution: "1080p",
          aspect_ratio: aspectRatio,
        },
        signal,
      }
    );
    // Defensive: this model has always returned a single file in testing
    // elsewhere, but Replicate's generic client type allows an array output
    // for some models — unwrap it the same way rather than assume.
    const output = (Array.isArray(raw) ? raw[0] : raw) as FileOutput;
    return output.url().toString();
  } catch (err) {
    if (err instanceof Error && "response" in err) {
      const apiErr = err as ApiError;
      throw new ReplicateVideoApiError(apiErr.response?.status ?? 500, apiErr.message);
    }
    throw err;
  }
}

export function describeReplicateVideoError(err: unknown): string {
  if (err instanceof ReplicateVideoApiError) {
    switch (err.status) {
      case 401:
      case 403:
        return "Clé Replicate invalide ou refusée. Vérifie REPLICATE_API_TOKEN sur Vercel.";
      case 422:
        return "Photo ou description refusée par Replicate (requête invalide). Essaie une autre photo.";
      case 429:
        return "Quota Replicate atteint ou compte sans crédit. Vérifie la facturation sur replicate.com/account/billing.";
      default:
        return `Erreur Replicate Veo 3.1 (${err.status}) : ${err.message}`;
    }
  }
  if (err instanceof Error) return err.message;
  return "Erreur inconnue pendant l'animation vidéo (Replicate).";
}
