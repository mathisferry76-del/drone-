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
// REJECT_ALL is what the judge is asked to answer with "0" — a scene-fidelity
// gate, not just a tie-breaker: it exists because the tie-breaking criteria
// alone (logo crispness, realism) say nothing about whether a candidate is
// even still a retouch of the original photo. FLUX Kontext occasionally
// ignores the input image entirely and hallucinates an unrelated scene on
// every single candidate — e.g. asking for a watch on a wrist coming back
// with a photo of pool-deck clutter, no wrist or watch anywhere in it. Aim
// judgment at that failure mode explicitly, since "most realistic of 4
// hallucinations" would otherwise still confidently ship one.
const REJECT_ALL = -1;

function buildJudgeInstruction(candidateCount: number, description: string): string {
  return `L'image 0 est la photo originale (AVANT retouche). Les ${candidateCount} images suivantes, numérotées 1 à ${candidateCount}, sont des tentatives séparées de retouche IA de cette même photo pour ce changement demandé : "${description}".

D'abord, élimine toute image qui ne correspond plus à une retouche de la photo originale : scène, décor, cadrage ou sujet clairement différents de l'image 0, ou qui ne montre tout simplement pas le changement demandé (ex : pas de montre visible si on a demandé une montre). Parmi celles qui restent, choisis celle qui a l'air la plus réaliste et physiquement intégrée à la scène, avec le logo/badge de marque (s'il y en a un) le plus net et le plus fidèle.

Réponds UNIQUEMENT avec le numéro (1, 2, ...) de la meilleure image restante, ou avec "0" si TOUTES les images échouent le premier critère (aucune n'est une retouche fidèle de la photo originale). Réponds seulement avec ce chiffre, sans aucun autre mot.`;
}

function parseIndexFromJudgeReply(text: string, candidateCount: number): number | null {
  const match = text.match(/\d+/);
  if (!match) return null;
  const n = parseInt(match[0], 10);
  if (n === 0) return REJECT_ALL;
  if (Number.isInteger(n) && n >= 1 && n <= candidateCount) {
    return n - 1;
  }
  return null;
}

async function judgeWithOpenAI(
  openai: OpenAI,
  original: Buffer,
  candidates: Buffer[],
  description: string
): Promise<number | null> {
  const content: OpenAI.ChatCompletionContentPart[] = [
    { type: "text", text: buildJudgeInstruction(candidates.length, description) },
  ];
  content.push({ type: "text", text: "Image 0 (originale, AVANT) :" });
  content.push({
    type: "image_url",
    image_url: { url: `data:image/png;base64,${original.toString("base64")}`, detail: "high" },
  });
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

async function judgeWithGemini(
  original: Buffer,
  candidates: Buffer[],
  description: string
): Promise<number | null> {
  const key = getGeminiKey();
  if (!key) return null;

  const parts: Record<string, unknown>[] = [
    { text: buildJudgeInstruction(candidates.length, description) },
  ];
  parts.push({ text: "Image 0 (originale, AVANT) :" });
  parts.push({ inline_data: { mime_type: "image/png", data: original.toString("base64") } });
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

// Returns the index of the best candidate, or null if every judge that
// managed to answer explicitly rejected all candidates as unfaithful to the
// original photo (see REJECT_ALL above) — that's the caller's cue to error
// out and refund instead of shipping a hallucinated result. A judge that
// fails outright (provider error, unparseable reply) just falls back to the
// next judge, and ultimately to candidate 0 if none could answer at all, so
// a flaky judge call never costs the user the generation they already paid
// credits for — only a genuine "none of these are usable" verdict does.
export async function pickBestImage(
  original: Buffer,
  candidates: Buffer[],
  description: string
): Promise<number | null> {
  if (candidates.length <= 1) return 0;

  let sawRejectAll = false;

  const openai = getOpenAI();
  if (openai) {
    try {
      const idx = await judgeWithOpenAI(openai, original, candidates, description);
      if (idx !== null && idx !== REJECT_ALL) return idx;
      if (idx === REJECT_ALL) sawRejectAll = true;
    } catch (err) {
      console.error("pickBestImage openai judge error", err);
    }
  }

  if (getGeminiKey()) {
    try {
      const idx = await judgeWithGemini(original, candidates, description);
      if (idx !== null && idx !== REJECT_ALL) return idx;
      if (idx === REJECT_ALL) sawRejectAll = true;
    } catch (err) {
      console.error("pickBestImage gemini judge error", err);
    }
  }

  return sawRejectAll ? null : 0;
}
