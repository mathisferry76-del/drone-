import { getOpenAI } from "./openai";

export interface ReplacementRegion {
  // Percentages (0-100) of the photo's own width/height.
  left: number;
  top: number;
  right: number;
  bottom: number;
}

// Detects whether an "Impressionne tes potes" description asks to fully
// replace one dominant object in the photo (almost always a vehicle) with a
// different, possibly differently-shaped model, and if so, locates that
// object's bounding box — used to build an inpainting mask (see
// app/api/impress/route.ts and lib/mask.ts) so gpt-image-1 can fully
// regenerate that region instead of softly "editing" it.
//
// Why this exists: FLUX Kontext (this route's primary provider) has no
// masking primitive at all, and in production kept a strong bias toward
// preserving the original object's silhouette even when explicitly and
// repeatedly instructed otherwise — a wrong-shaped car (or no shape change
// at all) despite the prompt naming the exact target model. A pixel mask is
// a structural constraint the model can't partially ignore the way it can
// ignore a sentence in a prompt, which is what makes this worth the extra
// call for this specific failure mode.
//
// Returns null on anything but a confident, well-formed detection — this
// must never block the existing single-image path, only opt a request into
// the mask-based one when it looks like the right tool for the job.
export async function detectReplacementRegion(
  image: Buffer,
  description: string,
  signal?: AbortSignal
): Promise<ReplacementRegion | null> {
  const openai = getOpenAI();
  if (!openai) return null;

  try {
    const result = await openai.chat.completions.create(
      {
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Cette description demande-t-elle de REMPLACER ENTIÈREMENT un objet dominant de la photo (le plus souvent un véhicule) par un modèle différent, avec une forme/silhouette potentiellement différente ? Description : "${description}".

Si oui, réponds UNIQUEMENT avec un JSON compact de cette forme exacte, sans aucun autre texte : {"left":N,"top":N,"right":N,"bottom":N} où chaque N est un pourcentage entier (0-100) de la position du cadre englobant CET OBJET dans la photo (0=bord gauche/haut, 100=bord droit/bas). Élargis légèrement la boîte (quelques % de marge) pour être sûr d'inclure tout l'objet.

Si non — la demande n'est pas un remplacement d'objet complet (ex : ajout d'un accessoire, changement de couleur/matière, changement de décor) — réponds UNIQUEMENT avec "NON".`,
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/png;base64,${image.toString("base64")}`,
                  detail: "low",
                },
              },
            ],
          },
        ],
        max_tokens: 60,
      },
      { signal }
    );

    const text = result.choices[0]?.message?.content?.trim() ?? "";
    if (!text || /^non\b/i.test(text)) return null;

    const match = text.match(/\{[^}]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as Partial<
      Record<"left" | "top" | "right" | "bottom", number>
    >;
    const { left, top, right, bottom } = parsed;
    if (
      typeof left !== "number" ||
      typeof top !== "number" ||
      typeof right !== "number" ||
      typeof bottom !== "number" ||
      left < 0 ||
      top < 0 ||
      right > 100 ||
      bottom > 100 ||
      right <= left ||
      bottom <= top
    ) {
      return null;
    }
    return { left, top, right, bottom };
  } catch (err) {
    console.error("detectReplacementRegion error", err);
    return null;
  }
}
