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
export interface PickBestResult {
  index: number;
  // true when no judge that actually answered could confirm this candidate
  // passes the scene-fidelity/correct-change criteria — every judge that
  // answered flagged every candidate as failing at least one of them. The
  // index still points at the least-bad candidate (the judge is asked to
  // name one even when rejecting) so the caller can show it with a warning
  // instead of discarding the generation the user already paid for and
  // leaving the failure undiagnosable.
  imperfect: boolean;
}

function buildJudgeInstruction(candidateCount: number, description: string): string {
  return `L'image 0 est la photo originale (AVANT retouche). Les ${candidateCount} images suivantes, numérotées 1 à ${candidateCount}, sont des tentatives séparées de retouche IA de cette même photo pour ce changement demandé : "${description}".

Élimine toute image qui rate l'une de ces deux choses (les deux comptent, ne confonds pas l'une avec l'autre) :
(a) LE DÉCOR NE CORRESPOND PLUS : arrière-plan, lieu, cadrage/zoom ou tout autre élément NON mentionné dans la description a changé par rapport à l'image 0 — ça inclut le cas extrême où l'image entière n'a plus rien à voir avec l'image 0 (mauvaise scène, mauvais lieu).
(b) LE CHANGEMENT DEMANDÉ N'EST PAS FAIT CORRECTEMENT : soit l'ajout demandé est absent (ex : pas de montre visible si on a demandé une montre), soit — pour un REMPLACEMENT d'objet par un modèle précis (ex : "remplace ma voiture par une Audi RS6") — l'objet a gardé la silhouette/forme de l'original, SOIT il a bien changé mais vers le MAUVAIS modèle ou la mauvaise marque (ex : une Ferrari alors qu'on a demandé une Audi RS6, ou un coupé 2 portes alors que le modèle demandé est un break/SUV/berline), SOIT ses proportions/son orientation ne respectent pas le format réel standard de ce type d'objet (ex : une carte bancaire trop carrée ou tournée dans le mauvais sens, un ordinateur portable avec de mauvaises proportions), SOIT un texte de logo/badge/emblème visible sur l'objet est mal orthographié, déformé ou illisible au point de ne plus épeler correctement le vrai nom de la marque ou du modèle (ex : "LAMPOCHINI" ou "LANBORGHINI" au lieu de "LAMBORGHINI", "RSC" au lieu de "RS6") — un texte de marque faux ou baragouiné est un échec à part entière, au même titre qu'un mauvais modèle, MÊME si le reste de l'objet (forme, couleur, intégration) est par ailleurs correct. Un objet qui a clairement changé mais ne correspond pas au modèle/format exact demandé, ou dont le texte de marque est faux, est un échec au même titre qu'un objet inchangé.

Important : le critère (a) porte sur le DÉCOR/CONTEXTE autour de l'objet concerné, jamais sur l'objet lui-même quand la description demande justement de le changer ou de le remplacer — dans ce cas, que cet objet ait l'air différent de l'image 0 est le résultat ATTENDU, pas un défaut. Ne rejette jamais une image uniquement parce que l'objet demandé a changé d'apparence.

Parmi les images qui passent ces deux critères, la netteté et la fidélité du logo/badge de marque ET des inscriptions de modèle (ex : "RS6", "GTI", "M4") restent le critère de classement LE PLUS IMPORTANT, avant même le réalisme général — une image dont le logo/texte est nettement plus net et plus fidèle doit être préférée à une autre plus réaliste ailleurs mais dont le logo est flou/approximatif (ex : un cheval cabré Ferrari qui ressemble à une tache). Choisis celle qui a l'air la plus réaliste et physiquement intégrée à la scène en départageant à partir de ces critères.

Réponds sur une seule ligne avec deux éléments séparés par un espace : d'abord le numéro (1 à ${candidateCount}) de la meilleure image — même si AUCUNE ne passe vraiment (a) et (b), désigne quand même la moins mauvaise, la plus proche de réussir, ne réponds jamais "0" ou "aucune" — puis le mot OK si cette image passe réellement (a) et (b), ou BAD si elle y échoue quand même malgré tout (c'est juste la moins pire des ratées). Exemple de réponse : "2 OK" ou "3 BAD". Réponds uniquement ces deux mots, rien d'autre.`;
}

// Parses a judge reply expected to look like "2 OK" or "3 BAD" — always a
// 1-based candidate index (the judge is told to name one even when
// rejecting every candidate), plus whether that candidate actually passed
// the fidelity criteria. Falls back to treating a bare/malformed verdict
// word as a pass, matching the older bare-number-means-pass reply shape in
// case a judge model doesn't follow the two-token format exactly.
function parseJudgeVerdict(
  text: string,
  candidateCount: number
): { index: number; passed: boolean } | null {
  const match = text.match(/(\d+)\D*(OK|BAD)?/i);
  if (!match) return null;
  const n = parseInt(match[1], 10);
  if (!Number.isInteger(n) || n < 1 || n > candidateCount) return null;
  const passed = match[2]?.toUpperCase() !== "BAD";
  return { index: n - 1, passed };
}

async function judgeWithOpenAI(
  openai: OpenAI,
  original: Buffer,
  candidates: Buffer[],
  description: string,
  signal: AbortSignal | undefined
): Promise<{ index: number; passed: boolean } | null> {
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

  const result = await openai.chat.completions.create(
    {
      model: "gpt-4o-mini",
      messages: [{ role: "user", content }],
      max_tokens: 8,
    },
    { signal }
  );

  const text = result.choices[0]?.message?.content?.trim() ?? "";
  return parseJudgeVerdict(text, candidates.length);
}

async function judgeWithGemini(
  original: Buffer,
  candidates: Buffer[],
  description: string,
  signal: AbortSignal | undefined
): Promise<{ index: number; passed: boolean } | null> {
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
      signal,
    }
  );
  if (!res.ok) return null;

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return parseJudgeVerdict(text, candidates.length);
}

// Returns the best candidate along with whether any judge that actually
// answered confirmed it's faithful to the original photo. Previously, a
// judge explicitly rejecting every candidate (none faithful to the original
// photo / requested change not correctly applied) made this return null,
// which the caller treated as a hard failure — refunding credits and
// discarding every candidate with no way for anyone to see what went wrong.
// Now the judge is always asked to name a best-of-a-bad-lot candidate even
// when rejecting, so that verdict surfaces as `imperfect: true` on the
// least-bad candidate instead of erasing the attempt entirely — the caller
// decides whether to ship it with a warning. A judge that fails outright
// (provider error, unparseable reply) just falls back to the next judge, and
// ultimately to candidate 0 marked as not imperfect if neither could answer
// at all, so a flaky judge call never costs the user the generation they
// already paid credits for.
// `signal` is the same internal-deadline AbortSignal app/api/impress/
// route.ts passes into the generation calls and into verifyChangeApplied —
// without it, this judge (up to two sequential provider calls, each
// sending "high"-detail images) ran fully unbounded, able on its own to
// push a request well past the deadline meant to guarantee a clean JSON
// error instead of the platform killing the function outright. An abort
// here just falls through to the existing fail-open paths below (next
// judge, then candidate 0) instead of hanging.
export async function pickBestImage(
  original: Buffer,
  candidates: Buffer[],
  description: string,
  signal?: AbortSignal
): Promise<PickBestResult> {
  if (candidates.length <= 1) return { index: 0, imperfect: false };

  let bestGuess: number | null = null;

  const openai = getOpenAI();
  if (openai) {
    try {
      const verdict = await judgeWithOpenAI(openai, original, candidates, description, signal);
      if (verdict) {
        if (verdict.passed) return { index: verdict.index, imperfect: false };
        if (bestGuess === null) bestGuess = verdict.index;
      }
    } catch (err) {
      console.error("pickBestImage openai judge error", err);
    }
  }

  if (getGeminiKey()) {
    try {
      const verdict = await judgeWithGemini(original, candidates, description, signal);
      if (verdict) {
        if (verdict.passed) return { index: verdict.index, imperfect: false };
        if (bestGuess === null) bestGuess = verdict.index;
      }
    } catch (err) {
      console.error("pickBestImage gemini judge error", err);
    }
  }

  if (bestGuess !== null) return { index: bestGuess, imperfect: true };

  return { index: 0, imperfect: false };
}
