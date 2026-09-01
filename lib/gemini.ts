// Gemini's image model does real "conversational" editing — it takes the
// reference photo(s) plus a text instruction and returns a new image, with
// no separate alpha-mask parameter the way OpenAI's images.edit has. Its
// identity preservation from the text instruction alone tested reliably
// strong (verified against the same face-lock phrasing used here), which is
// why the pixel-mask machinery built for OpenAI (see buildFaceMask in
// app/api/generate/route.ts) isn't replicated for this provider.
const GEMINI_MODEL = "gemini-2.5-flash-image";

export function getGeminiKey(): string | null {
  return process.env.GEMINI_API_KEY || null;
}

export class GeminiApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "GeminiApiError";
  }
}

interface GeminiImageInput {
  buffer: Buffer;
  mimeType?: string;
}

// Sends the reference image(s) + prompt to Gemini's generateContent and
// returns the first inline image found in the response. Throws
// GeminiApiError on an HTTP-level failure (bad key, quota/billing not
// enabled...) or a plain Error if the call succeeded but returned no image
// (the model can also just reply with text, e.g. refusing the request).
export async function editImageWithGemini(
  images: GeminiImageInput[],
  prompt: string
): Promise<Buffer> {
  const key = getGeminiKey();
  if (!key) {
    throw new Error("Gemini n'est pas configuré (GEMINI_API_KEY manquante).");
  }

  const parts: Record<string, unknown>[] = [{ text: prompt }];
  for (const img of images) {
    parts.push({
      inline_data: { mime_type: img.mimeType ?? "image/png", data: img.buffer.toString("base64") },
    });
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts }] }),
    }
  );

  const data = await res.json();
  if (!res.ok) {
    const message =
      (data as { error?: { message?: string } })?.error?.message ?? `Erreur Gemini (${res.status}).`;
    throw new GeminiApiError(res.status, message);
  }

  const responseParts =
    (data as { candidates?: { content?: { parts?: Record<string, unknown>[] } }[] })
      .candidates?.[0]?.content?.parts ?? [];
  for (const part of responseParts) {
    const inline =
      (part.inlineData as { data?: string } | undefined)?.data ??
      (part.inline_data as { data?: string } | undefined)?.data;
    if (inline) return Buffer.from(inline, "base64");
  }

  throw new Error("Gemini n'a renvoyé aucune image (voir les logs pour la réponse texte).");
}

export function describeGeminiError(err: unknown): string {
  if (err instanceof GeminiApiError) {
    switch (err.status) {
      case 400:
        return `Photo refusée par Gemini (${err.message || "requête invalide"}). Essaie une autre photo.`;
      case 401:
      case 403:
        return "Clé Gemini invalide ou refusée. Vérifie GEMINI_API_KEY sur Vercel.";
      case 429:
        return "Quota Gemini atteint ou facturation non activée. Vérifie la facturation sur aistudio.google.com.";
      default:
        return `Erreur Gemini (${err.status}) : ${err.message}`;
    }
  }
  if (err instanceof Error) return err.message;
  return "Erreur inconnue pendant l'amélioration IA (Gemini).";
}
