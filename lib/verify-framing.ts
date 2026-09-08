import OpenAI from "openai";
import { getOpenAI } from "./openai";
import { getGeminiKey, GEMINI_TEXT_MODEL } from "./gemini";

// A third, deliberately narrow check alongside verifyChangeApplied — added
// after a full-vehicle-replacement request (a normal car -> a low, wide
// supercar) came back with the replaced car rendered noticeably larger/
// closer than the original, twice in a row, despite buildImpressPrompt's
// own explicit "exact same framing/zoom" rule (in app/api/impress/
// route.ts). Prompt wording alone isn't reliably winning against the
// model's own strong training bias toward tight, dramatic supercar shots
// specifically — a real generation-model tendency, not a prompt gap. This
// catches it after the fact instead of trusting the prompt to prevent it:
// a real comparison against the original photo, not just reading the
// candidate alone (that's the point of sending both images — see
// pickBestImage.ts for the same already-proven "original + candidate(s) in
// one vision call" shape via chat.completions.create, unrelated to the
// separate images.edit multi-image issue documented in
// lib/describe-reference.ts).
//
// Returns null (never a hard "reject") when the check itself fails to run
// or answer clearly — same fail-open posture as verifyChangeApplied: this
// exists to catch a specific, confirmed failure mode, not to become a new
// way for a flaky classifier call to block otherwise-good results.
function buildFramingInstruction(): string {
  return `La première image est une photo originale. La deuxième image est une tentative de retouche IA de cette même photo (un objet, le plus souvent un véhicule, y a été remplacé ou modifié).

Réponds UNIQUEMENT par OUI ou NON à cette question : l'objet retouché dans la deuxième image occupe-t-il APPROXIMATIVEMENT la même taille apparente et la même position dans le cadre que l'objet d'origine dans la première image — sans avoir été rendu visiblement plus grand, plus proche ou plus zoomé ?

Réponds NON si l'objet semble nettement plus grand/plus proche/plus zoomé dans la deuxième image, ou si l'espace libre autour de lui (ciel, plafond, décor visible au-dessus/autour) a nettement diminué par rapport à la première image — même si le reste (angle, décor, modèle de l'objet) semble par ailleurs correct. Réponds OUI si la taille et la position dans le cadre sont globalement cohérentes avec l'originale.

Réponds seulement par ce mot, OUI ou NON, sans aucun autre texte.`;
}

function parseYesNo(text: string): boolean | null {
  const normalized = text.trim().toLowerCase();
  if (/^oui/.test(normalized)) return true;
  if (/^non/.test(normalized)) return false;
  return null;
}

async function verifyWithOpenAI(
  openai: OpenAI,
  original: Buffer,
  candidate: Buffer,
  signal: AbortSignal | undefined
): Promise<boolean | null> {
  const result = await openai.chat.completions.create(
    {
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: buildFramingInstruction() },
            { type: "text", text: "Image 1 (originale) :" },
            {
              type: "image_url",
              // "low" is enough — this only needs overall scale/position,
              // not fine detail, same reasoning as verifyChangeApplied.
              image_url: { url: `data:image/png;base64,${original.toString("base64")}`, detail: "low" },
            },
            { type: "text", text: "Image 2 (retouchée) :" },
            {
              type: "image_url",
              image_url: { url: `data:image/png;base64,${candidate.toString("base64")}`, detail: "low" },
            },
          ],
        },
      ],
      max_tokens: 5,
    },
    { signal }
  );

  const text = result.choices[0]?.message?.content ?? "";
  return parseYesNo(text);
}

async function verifyWithGemini(
  original: Buffer,
  candidate: Buffer,
  signal: AbortSignal | undefined
): Promise<boolean | null> {
  const key = getGeminiKey();
  if (!key) return null;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TEXT_MODEL}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: buildFramingInstruction() },
              { text: "Image 1 (originale) :" },
              { inline_data: { mime_type: "image/png", data: original.toString("base64") } },
              { text: "Image 2 (retouchée) :" },
              { inline_data: { mime_type: "image/png", data: candidate.toString("base64") } },
            ],
          },
        ],
      }),
      signal,
    }
  );
  if (!res.ok) return null;

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return parseYesNo(text);
}

export async function verifyFramingPreserved(
  original: Buffer,
  candidate: Buffer,
  signal?: AbortSignal
): Promise<boolean | null> {
  const openai = getOpenAI();
  if (openai) {
    try {
      const verdict = await verifyWithOpenAI(openai, original, candidate, signal);
      if (verdict !== null) return verdict;
    } catch (err) {
      console.error("verifyFramingPreserved openai error", err);
    }
  }

  if (getGeminiKey()) {
    try {
      const verdict = await verifyWithGemini(original, candidate, signal);
      if (verdict !== null) return verdict;
    } catch (err) {
      console.error("verifyFramingPreserved gemini error", err);
    }
  }

  return null;
}
