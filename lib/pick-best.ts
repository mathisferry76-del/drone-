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

Élimine toute image qui rate l'une de ces deux choses (les deux comptent, ne confonds pas l'une avec l'autre) :
(a) LE DÉCOR NE CORRESPOND PLUS : arrière-plan, lieu, cadrage/zoom ou tout autre élément NON mentionné dans la description a changé par rapport à l'image 0 — ça inclut le cas extrême où l'image entière n'a plus rien à voir avec l'image 0 (mauvaise scène, mauvais lieu).
(b) LE CHANGEMENT DEMANDÉ N'EST PAS FAIT CORRECTEMENT : soit l'ajout demandé est absent (ex : pas de montre visible si on a demandé une montre), soit — pour un REMPLACEMENT d'objet par un modèle précis (ex : "remplace ma voiture par une Audi RS6") — l'objet a gardé la silhouette/forme de l'original, SOIT il a bien changé mais vers le MAUVAIS modèle ou la mauvaise marque (ex : une Ferrari alors qu'on a demandé une Audi RS6, ou un coupé 2 portes alors que le modèle demandé est un break/SUV/berline), SOIT ses proportions/son orientation ne respectent pas le format réel standard de ce type d'objet (ex : une carte bancaire trop carrée ou tournée dans le mauvais sens, un ordinateur portable avec de mauvaises proportions). Un objet qui a clairement changé mais ne correspond pas au modèle/format exact demandé est un échec au même titre qu'un objet inchangé.

Important : le critère (a) porte sur le DÉCOR/CONTEXTE autour de l'objet concerné, jamais sur l'objet lui-même quand la description demande justement de le changer ou de le remplacer — dans ce cas, que cet objet ait l'air différent de l'image 0 est le résultat ATTENDU, pas un défaut. Ne rejette jamais une image uniquement parce que l'objet demandé a changé d'apparence.

Parmi les images qui passent ces deux critères, la netteté et la fidélité du logo/badge de marque ET des inscriptions de modèle (ex : "RS6", "GTI", "M4") sont le critère de classement LE PLUS IMPORTANT, avant même le réalisme général — une image dont le logo/texte est nettement plus net et plus fidèle doit être préférée à une autre plus réaliste ailleurs mais dont le logo est flou/approximatif (ex : un cheval cabré Ferrari qui ressemble à une tache) ou dont le texte du badge est presque juste sans être exact (ex : "RSC" au lieu de "RS6"). Choisis celle qui a l'air la plus réaliste et physiquement intégrée à la scène en départageant à partir de ces critères.

Réponds UNIQUEMENT avec le numéro (1, 2, ...) de la meilleure image restante, ou avec "0" si TOUTES les images échouent (a) ou (b). Réponds seulement avec ce chiffre, sans aucun autre mot.`;
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
