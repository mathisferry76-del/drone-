import { getOpenAI } from "./openai";

// Bridges a reference photo into the text prompt sent to gpt-image-1,
// instead of attaching the reference image itself as a second entry in
// images.edit's `image` array. Confirmed in production, three separate
// times on three different call shapes (mask + reference together,
// reference alone resized to match the mask's canvas, and a mask-free
// 2-image refinement pass on the generation's own result) that ANY
// images.edit call with more than one image reliably crashes hard enough
// to bypass this route's own error handling — every single-image call has
// worked, every 2-image call has failed, mask or no mask. Rather than
// guess at a fourth variant of the same broken shape, this avoids a
// second image entirely: a normal single-image vision call (the same
// shape lib/detect-replacement-region.ts already uses successfully)
// describes the reference photo's design in detail, and that text is
// folded into the single-image edit prompt instead.
export async function describeReferenceImage(
  reference: Buffer,
  signal?: AbortSignal
): Promise<string | null> {
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
                text: `Décris en détail, en français, le design visuel exact de l'objet/logo/motif montré sur cette photo de référence — assez précisément pour qu'un autre artiste puisse le redessiner fidèlement sans jamais voir cette photo. Concentre-toi sur : la forme et les proportions exactes du logo/emblème, ses couleurs précises, sa position/son cadrage sur l'objet, tout texte visible (orthographe exacte, police), et tout détail de matière/texture/finition visible. Réponds uniquement par cette description, sans phrase d'introduction ni commentaire.`,
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/png;base64,${reference.toString("base64")}`,
                  detail: "high",
                },
              },
            ],
          },
        ],
        max_tokens: 400,
      },
      { signal }
    );

    const text = result.choices[0]?.message?.content?.trim();
    return text || null;
  } catch (err) {
    console.error("describeReferenceImage error", err);
    return null;
  }
}
