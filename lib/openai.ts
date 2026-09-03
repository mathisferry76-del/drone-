import OpenAI from "openai";
import { buildVideoThumbnailInstruction } from "./youtube";

let client: OpenAI | null = null;

export function getOpenAI(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  if (!client) {
    client = new OpenAI({ apiKey: key });
  }
  return client;
}

// Text-only fallback for generateThumbnailPromptFromVideo (lib/gemini.ts)
// when GEMINI_API_KEY isn't configured — same purpose, cheap chat model.
export async function generateThumbnailPromptFromVideoOpenAI(
  title: string,
  description: string | null,
  presetName: string
): Promise<string> {
  const openai = getOpenAI();
  if (!openai) {
    throw new Error("Aucun fournisseur IA configuré (GEMINI_API_KEY ou OPENAI_API_KEY).");
  }

  const instruction = buildVideoThumbnailInstruction(title, description, presetName);

  const result = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: instruction }],
  });

  const text = result.choices[0]?.message?.content;
  if (!text) {
    throw new Error("OpenAI n'a renvoyé aucun texte pour cette vidéo.");
  }
  return text.trim();
}
