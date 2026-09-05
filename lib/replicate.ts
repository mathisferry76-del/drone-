import Replicate, { type ApiError, type FileOutput } from "replicate";

// FLUX.1 Kontext [Max] (Black Forest Labs) via Replicate — the exact same
// model as lib/fal.ts's fal.ai integration, just hosted on a different
// platform. Kept as a separate provider (not a fallback path inside
// lib/fal.ts) so either can be configured independently: whichever of
// FAL_KEY / REPLICATE_API_TOKEN is set decides which host serves this
// model, see the provider selection in app/api/impress/route.ts.
const REPLICATE_MODEL = "black-forest-labs/flux-kontext-max";

export function getReplicateKey(): string | null {
  return process.env.REPLICATE_API_TOKEN || null;
}

let client: Replicate | null = null;
function getClient(key: string): Replicate {
  if (!client) {
    client = new Replicate({ auth: key });
  }
  return client;
}

export class ReplicateApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ReplicateApiError";
  }
}

// Sends the reference photo + prompt to FLUX.1 Kontext [Max] and returns the
// resulting image bytes. Passing a raw Buffer as `input_image` works because
// Replicate's client walks the input object and auto-uploads any Blob/Buffer
// it finds to Replicate's own file storage before sending the request (see
// node_modules/replicate/lib/util.js transformFileInputs) — no manual
// replicate.files.create() call needed, mirroring editImageWithFlux in
// lib/fal.ts. `aspect_ratio: "match_input_image"` is what keeps the output
// the same shape as the uploaded photo instead of forcing a fixed ratio.
export async function editImageWithReplicate(
  image: Buffer,
  prompt: string,
  signal?: AbortSignal
): Promise<Buffer> {
  const key = getReplicateKey();
  if (!key) {
    throw new Error("Replicate n'est pas configuré (REPLICATE_API_TOKEN manquante).");
  }
  const replicate = getClient(key);

  try {
    const output = (await replicate.run(
      REPLICATE_MODEL,
      {
        input: {
          prompt,
          input_image: image,
          aspect_ratio: "match_input_image",
          output_format: "png",
        },
        signal,
      }
    )) as FileOutput;

    const blob = await output.blob();
    return Buffer.from(await blob.arrayBuffer());
  } catch (err) {
    if (err instanceof Error && "response" in err) {
      const apiErr = err as ApiError;
      throw new ReplicateApiError(apiErr.response?.status ?? 500, apiErr.message);
    }
    throw err;
  }
}

export function describeReplicateError(err: unknown): string {
  if (err instanceof ReplicateApiError) {
    switch (err.status) {
      case 401:
      case 403:
        return "Clé Replicate invalide ou refusée. Vérifie REPLICATE_API_TOKEN sur Vercel.";
      case 422:
        return "Photo ou description refusée par Replicate (requête invalide). Essaie une autre photo.";
      case 429:
        return "Quota Replicate atteint ou compte sans crédit. Vérifie la facturation sur replicate.com/account/billing.";
      default:
        return `Erreur Replicate (${err.status}) : ${err.message}`;
    }
  }
  if (err instanceof Error) return err.message;
  return "Erreur inconnue pendant la retouche (Replicate).";
}
