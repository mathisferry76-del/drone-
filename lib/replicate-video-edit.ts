import Replicate, { type ApiError, type FileOutput } from "replicate";
import { getReplicateKey } from "./replicate";

// Runway Aleph 2.0 — true video-to-video editing, unlike lib/replicate-
// video.ts's Veo 3.1 (image-to-video, animates a single still photo). Aleph
// takes a video the user already filmed and applies one described change
// while preserving everything else — motion, performance, camera movement —
// untouched. This is what makes "record yourself gesturing at your car,
// then have the car itself replaced" possible at all: no image-to-video
// model can do that since it only ever starts from one still frame with no
// real motion to preserve.
//
// Schema confirmed only from Runway's own docs/marketing pages (a video
// input + a text prompt as the two required fields; output aspect ratio
// automatically matches the input's, so no aspect_ratio param is sent) —
// replicate.com itself is blocked by this sandbox's network egress, so the
// exact Replicate-wrapped field names couldn't be verified against the live
// schema the way every other provider integration in this codebase
// normally is (same caveat already accepted for lib/replicate-video.ts's
// Veo integration). Cog-based Replicate schemas reject any unrecognized
// input field outright, so if these two names are wrong the very first live
// call fails outright — but with an error naming the actual expected
// fields, making it a one-line fix once that happens rather than a silent
// wrong result.
const ALEPH_MODEL = "runwayml/aleph-2";

let client: Replicate | null = null;
function getClient(key: string): Replicate {
  if (!client) {
    client = new Replicate({ auth: key });
  }
  return client;
}

export class ReplicateVideoEditApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ReplicateVideoEditApiError";
  }
}

// Returns Replicate's own hosted URL for the transformed clip — same
// precedent as animateImageToVideoReplicate (lib/replicate-video.ts): a
// multi-second 1080p clip is multiple MB, too large to comfortably proxy
// through a serverless function's JSON response, so the caller re-downloads
// and re-uploads it to our own storage instead of round-tripping the bytes
// through this function.
export async function editVideoWithReplicate(
  video: Buffer,
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
      ALEPH_MODEL,
      {
        input: {
          video,
          prompt,
        },
        signal,
      }
    );
    // Defensive: Replicate's generic client type allows an array output for
    // some models, mirroring the same unwrap already done for Veo above.
    const output = (Array.isArray(raw) ? raw[0] : raw) as FileOutput;
    return output.url().toString();
  } catch (err) {
    if (err instanceof Error && "response" in err) {
      const apiErr = err as ApiError;
      throw new ReplicateVideoEditApiError(apiErr.response?.status ?? 500, apiErr.message);
    }
    throw err;
  }
}

export function describeReplicateVideoEditError(err: unknown): string {
  if (err instanceof ReplicateVideoEditApiError) {
    switch (err.status) {
      case 401:
      case 403:
        return "Clé Replicate invalide ou refusée. Vérifie REPLICATE_API_TOKEN sur Vercel.";
      case 422:
        return "Vidéo ou description refusée par Replicate (requête invalide) — vérifie la durée/le format de ta vidéo.";
      case 429:
        return "Quota Replicate atteint ou compte sans crédit. Vérifie la facturation sur replicate.com/account/billing.";
      default:
        return `Erreur Replicate Aleph 2.0 (${err.status}) : ${err.message}`;
    }
  }
  if (err instanceof Error) return err.message;
  return "Erreur inconnue pendant la transformation vidéo (Replicate).";
}
