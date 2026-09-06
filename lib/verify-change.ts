import OpenAI from "openai";
import { getOpenAI } from "./openai";
import { getGeminiKey, GEMINI_TEXT_MODEL } from "./gemini";

// A second, deliberately narrow check on top of pickBestImage's scene-
// fidelity judge — added after that judge repeatedly let through a
// candidate that changed the requested object's COLOR but kept its
// original SILHOUETTE (a Renault kept as a Renault, just repainted black,
// instead of becoming the requested BMW M4). That judge asks one call to
// juggle scene-fidelity, "was anything changed at all", AND logo/realism
// ranking across up to 5 images at once — too much for a cheap
// vision-classifier model to reliably get right on every sub-criterion
// every time. Splitting "was the SPECIFIC requested object actually
// produced" into its own single-image, single-question, yes/no check is a
// much smaller ask, and doesn't depend on comparing against the original at
// all — this only needs to look at one candidate and the description.
//
// Returns null (never a hard "reject") when the check itself fails to run
// or answer clearly (no provider configured, parse failure, API error) —
// mirroring pickBestImage's own fail-open posture: this check exists to
// catch a specific, confirmed failure mode, not to become a new way for a
// flaky classifier call to block otherwise-good results.
function buildVerifyInstruction(description: string): string {
  return `Ce changement a été demandé sur une photo : "${description}".

Cette image est UNE tentative de retouche IA pour ce changement. Réponds UNIQUEMENT par OUI ou NON à cette question : le changement demandé a-t-il été RÉELLEMENT appliqué, pas seulement partiellement ou superficiellement ?

Cas précis à vérifier si la demande est un REMPLACEMENT d'objet par un modèle précis (ex : "remplace ma voiture par une BMW M4") : réponds NON si l'objet visible a juste changé de couleur/finition mais garde clairement la même forme/carrosserie/silhouette que l'objet d'origine plutôt que de devenir authentiquement le modèle demandé — un objet repeint n'est PAS un objet remplacé. Réponds OUI seulement si l'objet visible correspond vraiment, dans sa forme, au modèle demandé.

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
  candidate: Buffer,
  description: string
): Promise<boolean | null> {
  const result = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: buildVerifyInstruction(description) },
          {
            type: "image_url",
            image_url: {
              url: `data:image/png;base64,${candidate.toString("base64")}`,
              detail: "high",
            },
          },
        ],
      },
    ],
    max_tokens: 5,
  });

  const text = result.choices[0]?.message?.content ?? "";
  return parseYesNo(text);
}

async function verifyWithGemini(candidate: Buffer, description: string): Promise<boolean | null> {
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
              { text: buildVerifyInstruction(description) },
              { inline_data: { mime_type: "image/png", data: candidate.toString("base64") } },
            ],
          },
        ],
      }),
    }
  );
  if (!res.ok) return null;

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return parseYesNo(text);
}

// Returns true/false when a provider gave a clear answer, or null when
// neither could (see file-level comment — null is treated as "don't reject
// over this" by the caller).
export async function verifyChangeApplied(
  candidate: Buffer,
  description: string
): Promise<boolean | null> {
  const openai = getOpenAI();
  if (openai) {
    try {
      const verdict = await verifyWithOpenAI(openai, candidate, description);
      if (verdict !== null) return verdict;
    } catch (err) {
      console.error("verifyChangeApplied openai error", err);
    }
  }

  if (getGeminiKey()) {
    try {
      const verdict = await verifyWithGemini(candidate, description);
      if (verdict !== null) return verdict;
    } catch (err) {
      console.error("verifyChangeApplied gemini error", err);
    }
  }

  return null;
}
