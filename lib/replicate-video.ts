import Replicate, { type ApiError, type FileOutput } from "replicate";
import { getReplicateKey } from "./replicate";

// Switched from Veo 3.1 to Seedance 2.5 (ByteDance), hosted on Replicate —
// explicit request to move providers, both for cost and because Seedance
// 2.5 has a real video-to-video "editing" mode (via `reference_videos`,
// "for motion transfer, style reference, editing, and extension") that Veo
// never had — Veo only ever accepted an image, never an existing video.
// This function only wires up the plain image-to-video path for now (same
// feature as before, cheaper underlying model); a true video-to-video
// "transform an existing clip" feature is a separate, larger addition
// (new upload UI, new route, its own pricing) not built here yet.
//
// Schema confirmed directly from Replicate's own "API > Schema" page for
// bytedance/seedance-2.5 (replicate.com/bytedance/seedance-2.5/api/schema)
// — every field below is a real, verified input, not guessed: Replicate's
// Cog-based schemas reject unrecognized fields outright, so an unconfirmed
// one risks breaking every call. Confirmed fields relevant here: `image`
// (uri — "first-frame image for image-to-video", exactly our case),
// `prompt`, `duration` (integer, default 5, min -1/max 30 — -1 means
// "intelligent duration" and is REQUIRED for editing/extension modes, not
// used here since we're not using reference_videos), `resolution` (string,
// default "720p" — no 1080p tier was visible in Replicate's own pricing
// page for this model, so this is a real resolution drop from Veo's 1080p,
// not just a cost optimization), `aspect_ratio` (string, default "16:9" —
// "adaptive" is only required for first/last-frame/editing/extension
// modes, plain image-to-video keeps explicit "16:9" like before), and
// `generate_audio` (boolean, default true).
//
// Pricing confirmed on Replicate's own pricing page: this plain
// image-to-video shape (no reference videos/images/audios attached) is
// the cheaper "non_video_in" tier — $0.2312/s at 720p, so a 4s clip is
// ~$0.92 — notably cheaper than Veo's ~$1.60/clip this was replacing.
const SEEDANCE_MODEL = "bytedance/seedance-2.5";

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
  signal?: AbortSignal
): Promise<string> {
  const key = getReplicateKey();
  if (!key) {
    throw new Error("Replicate n'est pas configuré (REPLICATE_API_TOKEN manquante).");
  }
  const replicate = getClient(key);

  try {
    const raw = await replicate.run(
      SEEDANCE_MODEL,
      {
        input: {
          image,
          prompt,
          duration: 4,
          resolution: "720p",
          aspect_ratio: "16:9",
          generate_audio: true,
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
        return `Erreur Replicate Seedance 2.5 (${err.status}) : ${err.message}`;
    }
  }
  if (err instanceof Error) return err.message;
  return "Erreur inconnue pendant l'animation vidéo (Replicate).";
}
