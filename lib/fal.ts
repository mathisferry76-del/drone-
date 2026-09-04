import { fal, ApiError } from "@fal-ai/client";

// FLUX.1 Kontext [Max] (Black Forest Labs, served via fal.ai) — chosen
// specifically for "Impressionne tes potes" over OpenAI/Gemini because it
// tested as the strongest model for the exact task this route needs:
// inserting/swapping one real-world object into an existing photo while
// keeping everything else pixel-for-pixel untouched. Unlike gpt-image-1's
// edit endpoint (3 fixed canvases — see app/api/impress/route.ts's
// aspect-ratio picker), Kontext preserves the input photo's own dimensions
// when `aspect_ratio` is left unset, so no square/16:9 workaround is needed
// on this path at all.
const FAL_MODEL = "fal-ai/flux-pro/kontext/max";

export function getFalKey(): string | null {
  return process.env.FAL_KEY || null;
}

// fal's client is a lazy singleton (`fal.config` mutates shared module
// state) — only call it once we know a key exists, mirroring getOpenAI's
// lazy-init pattern instead of configuring at import time.
let configured = false;
function ensureConfigured(key: string) {
  if (configured) return;
  fal.config({ credentials: key });
  configured = true;
}

export class FalApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "FalApiError";
  }
}

// Sends the reference photo + prompt to FLUX.1 Kontext [Max] and returns
// the resulting image bytes. Passing a Blob directly as `image_url` works
// because fal's client walks the input object and auto-uploads any
// Blob/File it finds to fal's storage before sending the request (see
// node_modules/@fal-ai/client/src/storage.js transformInput) — no manual
// fal.storage.upload() call needed.
export async function editImageWithFlux(
  image: Buffer,
  prompt: string,
  signal?: AbortSignal
): Promise<Buffer> {
  const key = getFalKey();
  if (!key) {
    throw new Error("fal.ai n'est pas configuré (FAL_KEY manquante).");
  }
  ensureConfigured(key);

  try {
    const result = await fal.subscribe(FAL_MODEL, {
      input: {
        prompt,
        image_url: new Blob([new Uint8Array(image)], { type: "image/png" }),
      },
      abortSignal: signal,
    });

    const url = result.data.images?.[0]?.url;
    if (!url) {
      throw new Error("fal.ai n'a renvoyé aucune image.");
    }

    const res = await fetch(url, { signal });
    if (!res.ok) {
      throw new Error(`Téléchargement de l'image générée par fal.ai impossible (${res.status}).`);
    }
    return Buffer.from(await res.arrayBuffer());
  } catch (err) {
    if (err instanceof ApiError) {
      throw new FalApiError(err.status, err.message);
    }
    throw err;
  }
}

export function describeFalError(err: unknown): string {
  if (err instanceof FalApiError) {
    switch (err.status) {
      case 401:
      case 403:
        return "Clé fal.ai invalide ou refusée. Vérifie FAL_KEY sur Vercel.";
      case 422:
        return "Photo ou description refusée par fal.ai (requête invalide). Essaie une autre photo.";
      case 429:
        return "Quota fal.ai atteint ou compte sans crédit. Vérifie la facturation sur fal.ai/dashboard/billing.";
      default:
        return `Erreur fal.ai (${err.status}) : ${err.message}`;
    }
  }
  if (err instanceof Error) return err.message;
  return "Erreur inconnue pendant la retouche (fal.ai).";
}
