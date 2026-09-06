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
// Same model, multi-reference-image variant — takes `image_urls` (plural)
// instead of a single `image_url`. Used when a real reference photo of the
// exact requested car model was found (see lib/car-reference.ts) so the
// model has an actual photo to match shape/proportions/logo against
// instead of only its own memorized training data, which kept producing
// wrong-brand or approximate results on less iconic models even with
// extensive prompt tuning (see app/api/impress/route.ts).
const FAL_MODEL_MULTI = "fal-ai/flux-pro/kontext/max/multi";

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

// Shared quality/moderation settings between the single- and multi-image
// Kontext calls below — see their original inline comments (now here) for
// why each is set the way it is.
const SHARED_KONTEXT_INPUT = {
  // Defaults to lossy "jpeg" if left unset — explicit "png" avoids
  // unnecessary compression artifacts on the final output.
  output_format: "png" as const,
  // Default is 3.5. This route's whole prompt (see buildImpressPrompt in
  // app/api/impress/route.ts) is a long, specific instruction list — real
  // brand logo fidelity above all — and a low default CFG gives the model
  // more room to drift from that instead of sticking to it. Nudged up, not
  // maxed: too high starts introducing oversaturation/artifacts, which the
  // prompt explicitly asks against.
  guidance_scale: 4.5,
  // Default is "2" (fairly strict). BFL's moderation on this tier is known
  // to soften/genericize outputs it flags as borderline — real,
  // identifiable brand logos and named car/watch models are exactly the
  // kind of trademarked content that can trip it, which would show up as
  // exactly the blurry/generic logo the user is asking us to fix. Maxed
  // out since this route is legitimate product photo editing, not
  // open-ended generation.
  safety_tolerance: "6" as const,
};

async function runKontext(model: string, input: Record<string, unknown>, signal?: AbortSignal) {
  try {
    const result = await fal.subscribe(model, { input, abortSignal: signal });

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

  return runKontext(
    FAL_MODEL,
    {
      prompt,
      image_url: new Blob([new Uint8Array(image)], { type: "image/png" }),
      ...SHARED_KONTEXT_INPUT,
    },
    signal
  );
}

// Same as editImageWithFlux but gives the model a second, real reference
// photo of the exact requested make/model (see lib/car-reference.ts) —
// `image_urls` accepts a mix of Blobs (auto-uploaded, same mechanism as
// editImageWithFlux) and plain URL strings (passed through untouched by
// fal's transformInput), so the already-fetched reference URL is passed
// directly with no extra upload step. `referenceImageUrl` must be the
// second element — the prompt (see buildImpressPrompt's reference-image
// note) refers to it explicitly as "image 2".
export async function editImageWithFluxMulti(
  image: Buffer,
  referenceImageUrl: string,
  prompt: string,
  signal?: AbortSignal
): Promise<Buffer> {
  const key = getFalKey();
  if (!key) {
    throw new Error("fal.ai n'est pas configuré (FAL_KEY manquante).");
  }
  ensureConfigured(key);

  return runKontext(
    FAL_MODEL_MULTI,
    {
      prompt,
      image_urls: [new Blob([new Uint8Array(image)], { type: "image/png" }), referenceImageUrl],
      ...SHARED_KONTEXT_INPUT,
    },
    signal
  );
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
