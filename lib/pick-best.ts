import OpenAI from "openai";
import { getOpenAI } from "./openai";
import { getGeminiKey, GEMINI_TEXT_MODEL } from "./gemini";

// "Impressionne tes potes" now generates several candidates per request
// instead of 1 (see CANDIDATE_COUNT in app/api/impress/route.ts) and picks
// the better one automatically — cars/watches/luxury goods are inconsistent
// enough (a logo readable in one attempt, a smudge in another) that more
// rolls of the dice measurably improve the odds of a usable result, the same way
// a competitor's showcased examples are themselves picked from several
// attempts rather than a guaranteed first try. This judge is what picks
// between them without a human in the loop, using whichever cheap
// vision-capable model is already configured on this deployment (gpt-4o-mini
// mirrors the model already used elsewhere for text — see lib/openai.ts —
// so no new provider account is required).
function buildJudgeInstruction(candidateCount: number, description: string): string {
  return `Ces ${candidateCount} images sont des tentatives séparées de retouche photo IA pour ce changement demandé : "${description}". Réponds UNIQUEMENT avec le numéro (1, 2, ...) de l'image qui a l'air la plus réaliste et physiquement intégrée à la scène, et dont le logo/badge de marque (s'il y en a un visible) est le plus net, le plus fidèle à la vraie marque et le moins flou ou déformé. Réponds seulement avec ce chiffre, sans aucun autre mot.`;
}

function parseIndexFromJudgeReply(text: string, candidateCount: number): number | null {
  const match = text.match(/\d+/);
  if (!match) return null;
  const n = parseInt(match[0], 10);
  if (Number.isInteger(n) && n >= 1 && n <= candidateCount) {
    return n - 1;
  }
  return null;
}

async function judgeWithOpenAI(
  openai: OpenAI,
  candidates: Buffer[],
  description: string
): Promise<number | null> {
  const content: OpenAI.ChatCompletionContentPart[] = [
    { type: "text", text: buildJudgeInstruction(candidates.length, description) },
  ];
  candidates.forEach((buf, i) => {
    content.push({ type: "text", text: `Image ${i + 1} :` });
    content.push({
      type: "image_url",
      // "high" detail matters here specifically — "low" forces OpenAI to
      // downscale to a fixed ~512x512 tile before the model ever sees it,
      // which would blur out exactly the fine detail (logo crispness,
      // badge legibility) this judge exists to compare between candidates.
      image_url: { url: `data:image/png;base64,${buf.toString("base64")}`, detail: "high" },
    });
  });

  const result = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content }],
    max_tokens: 5,
  });

  const text = result.choices[0]?.message?.content?.trim() ?? "";
  return parseIndexFromJudgeReply(text, candidates.length);
}

async function judgeWithGemini(candidates: Buffer[], description: string): Promise<number | null> {
  const key = getGeminiKey();
  if (!key) return null;

  const parts: Record<string, unknown>[] = [
    { text: buildJudgeInstruction(candidates.length, description) },
  ];
  candidates.forEach((buf, i) => {
    parts.push({ text: `Image ${i + 1} :` });
    parts.push({ inline_data: { mime_type: "image/png", data: buf.toString("base64") } });
  });

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TEXT_MODEL}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts }] }),
    }
  );
  if (!res.ok) return null;

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return parseIndexFromJudgeReply(text, candidates.length);
}

// Returns the index of the best candidate. Never throws — a judge failure
// (provider error, unparseable reply) just falls back to the next judge,
// and ultimately to candidate 0, so a flaky judge call never costs the user
// the generation they already paid credits for.
export async function pickBestImage(candidates: Buffer[], description: string): Promise<number> {
  if (candidates.length <= 1) return 0;

  const openai = getOpenAI();
  if (openai) {
    try {
      const idx = await judgeWithOpenAI(openai, candidates, description);
      if (idx !== null) return idx;
    } catch (err) {
      console.error("pickBestImage openai judge error", err);
    }
  }

  if (getGeminiKey()) {
    try {
      const idx = await judgeWithGemini(candidates, description);
      if (idx !== null) return idx;
    } catch (err) {
      console.error("pickBestImage gemini judge error", err);
    }
  }

  return 0;
}
