import Replicate, { type ApiError, type FileOutput } from "replicate";
import { getReplicateKey } from "./replicate";

// ByteDance Seedream 5.0 Pro, hosted on Replicate — explicit request to try
// it as the top-priority provider for /api/impress's general edit path
// (add an object, change a color/material, change a background — anything
// that doesn't go through gpt-image-1's masked full-replacement path,
// which is unaffected by this and stays on OpenAI regardless of which
// provider is selected here, see app/api/impress/route.ts). Comparative
// reviews (checked via web search, not guessed) rate this and Google's
// "Nano Banana 2" (Gemini 3.1 Flash Image) closely on brand/logo fidelity;
// Nano Banana 2 specifically was already tried once on this app tonight
// and rolled back after real production regressions, so this is the
// untested option to try first instead.
//
// Schema confirmed directly by the user from Replicate's own Input Schema
// page for bytedance/seedream-5-pro, not guessed — Cog-based schemas
// reject unrecognized fields outright. Fields used here: `prompt` (string,
// max 4000 chars), `image_input` (array, default [] — "1-10 reference
// images for image-to-image generation" in standard/non-layer-
// decomposition mode, exactly this route's case), `aspect_ratio` (string,
// default "match_input_image" — keeps the output the same shape as the
// input instead of a fixed ratio), `output_format` (string, default
// "png"), `size` (string, default "2K" — "1K and 2K" in standard mode).
// `layer_decomposition` (boolean, splits one image into element layers)
// is a real field but not used here — this route always wants one
// composited result, not separated layers.
const SEEDREAM_MODEL = "bytedance/seedream-5-pro";

let client: Replicate | null = null;
function getClient(key: string): Replicate {
  if (!client) {
    client = new Replicate({ auth: key });
  }
  return client;
}

export class SeedreamApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "SeedreamApiError";
  }
}

// `images` can be just the source photo, or [source, reference] — Seedream
// natively accepts multiple reference images in one call (up to 10),
// unlike gpt-image-1's images.edit endpoint (see the extensive comments in
// app/api/impress/route.ts about why a 2-image array reliably crashes that
// specific endpoint) — no equivalent restriction is documented for this
// model, and Gemini's own multi-image path has shown no such issue either.
export async function editImageWithSeedream(
  images: Buffer[],
  prompt: string,
  signal?: AbortSignal
): Promise<Buffer> {
  const key = getReplicateKey();
  if (!key) {
    throw new Error("Replicate n'est pas configuré (REPLICATE_API_TOKEN manquante).");
  }
  const replicate = getClient(key);

  try {
    const raw = await replicate.run(
      SEEDREAM_MODEL,
      {
        input: {
          prompt,
          image_input: images,
          aspect_ratio: "match_input_image",
          output_format: "png",
          size: "2K",
        },
        signal,
      }
    );
    // Defensive: FileOutput directly for a single-image result is what
    // FLUX Kontext (lib/replicate.ts) returns, but some Replicate models
    // wrap output in an array even for one image — unwrap the same way
    // lib/replicate-video.ts already does rather than assume.
    const output = (Array.isArray(raw) ? raw[0] : raw) as FileOutput;
    const blob = await output.blob();
    return Buffer.from(await blob.arrayBuffer());
  } catch (err) {
    if (err instanceof Error && "response" in err) {
      const apiErr = err as ApiError;
      throw new SeedreamApiError(apiErr.response?.status ?? 500, apiErr.message);
    }
    throw err;
  }
}

export function describeSeedreamError(err: unknown): string {
  if (err instanceof SeedreamApiError) {
    switch (err.status) {
      case 401:
      case 403:
        return "Clé Replicate invalide ou refusée. Vérifie REPLICATE_API_TOKEN sur Vercel.";
      case 422:
        return "Photo ou description refusée par Replicate (requête invalide). Essaie une autre photo.";
      case 429:
        return "Quota Replicate atteint ou compte sans crédit. Vérifie la facturation sur replicate.com/account/billing.";
      default:
        return `Erreur Replicate Seedream 5 Pro (${err.status}) : ${err.message}`;
    }
  }
  if (err instanceof Error) return err.message;
  return "Erreur inconnue pendant la retouche (Seedream).";
}
