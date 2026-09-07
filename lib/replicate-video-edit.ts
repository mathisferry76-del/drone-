import Replicate, { type ApiError } from "replicate";
import { getReplicateKey } from "./replicate";

// Runway Aleph 2.0 — true video-to-video editing, unlike lib/replicate-
// video.ts's Veo 3.1 (image-to-video, animates a single still photo). Aleph
// takes a video the user already filmed and applies one described change
// while preserving everything else — motion, performance, camera movement —
// untouched.
//
// Deliberately NOT using replicate.run() (a blocking helper that polls
// until completion inside the same call) the way every other provider
// integration in this codebase does: a full video-to-video edit run
// genuinely takes longer than a single HTTP request can safely stay open
// for, whatever the platform's configured function-duration ceiling is —
// confirmed in production, where a live attempt failed with a non-JSON
// "server took too long" crash even after adding an internal deadline well
// under the requested maxDuration (see the removed EDIT_VIDEO_DEADLINE_MS
// in app/api/edit-video/route.ts's git history). Splitting the request into
// a fast "start" call (this file's startVideoEdit) and a separate,
// independently-fast "check status" call (getVideoEditStatus, polled by the
// client every few seconds — see app/api/edit-video/status/route.ts) means
// no single request ever needs to stay open longer than one quick API
// round-trip, regardless of how long the actual generation takes.
//
// Schema confirmed only from Runway's own docs/marketing pages (a video
// input + a text prompt as the two required fields; output aspect ratio
// automatically matches the input's) — replicate.com itself is blocked by
// this sandbox's network egress, so the exact Replicate-wrapped field names
// couldn't be verified against the live schema (same caveat already
// accepted for lib/replicate-video.ts's Veo integration). Cog-based
// Replicate schemas reject any unrecognized input field outright, so if
// these two names are wrong the very first live call fails outright — but
// with an error naming the actual expected fields, making it a one-line fix
// once that happens rather than a silent wrong result.
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

function wrapApiError(err: unknown): never {
  if (err instanceof Error && "response" in err) {
    const apiErr = err as ApiError;
    throw new ReplicateVideoEditApiError(apiErr.response?.status ?? 500, apiErr.message);
  }
  throw err;
}

// Kicks off the edit and returns immediately with Replicate's prediction id
// — does not wait for the job to finish. `wait` is deliberately omitted
// (defaults to false) so this call itself only ever takes as long as
// Replicate's own API needs to accept the job, typically well under a
// second.
export async function startVideoEdit(video: Buffer, prompt: string): Promise<{ id: string }> {
  const key = getReplicateKey();
  if (!key) {
    throw new Error("Replicate n'est pas configuré (REPLICATE_API_TOKEN manquante).");
  }
  const replicate = getClient(key);

  try {
    const prediction = await replicate.predictions.create({
      model: ALEPH_MODEL,
      input: {
        video,
        prompt,
      },
    });
    return { id: prediction.id };
  } catch (err) {
    wrapApiError(err);
  }
}

export interface VideoEditStatus {
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled" | "aborted";
  // Set only when status is "succeeded" — Replicate's raw predictions API
  // (unlike replicate.run()'s convenience wrapper) returns the output
  // exactly as the model produced it: a plain URL string for this model, in
  // every case observed so far, but defensively unwrapped from an array too
  // in case that ever changes.
  videoUrl?: string;
  // Set only when status is "failed" — the model's own error message
  // (e.g. an input validation complaint), distinct from a transport-level
  // ReplicateVideoEditApiError.
  errorMessage?: string;
}

export async function getVideoEditStatus(id: string): Promise<VideoEditStatus> {
  const key = getReplicateKey();
  if (!key) {
    throw new Error("Replicate n'est pas configuré (REPLICATE_API_TOKEN manquante).");
  }
  const replicate = getClient(key);

  try {
    const prediction = await replicate.predictions.get(id);
    const status = prediction.status;
    if (status === "succeeded") {
      const raw = prediction.output;
      const videoUrl = Array.isArray(raw) ? raw[0] : raw;
      if (typeof videoUrl !== "string") {
        return { status: "failed", errorMessage: "Réponse inattendue de Replicate (aucune URL vidéo)." };
      }
      return { status, videoUrl };
    }
    if (status === "failed") {
      return { status, errorMessage: typeof prediction.error === "string" ? prediction.error : String(prediction.error ?? "Échec inconnu") };
    }
    return { status: status === "aborted" ? "aborted" : status };
  } catch (err) {
    wrapApiError(err);
  }
}

export async function cancelVideoEdit(id: string): Promise<void> {
  const key = getReplicateKey();
  if (!key) return;
  const replicate = getClient(key);
  try {
    await replicate.predictions.cancel(id);
  } catch (err) {
    console.error("cancelVideoEdit error", err);
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
