import { getOpenAI } from "./openai";

// Detects whether an "Impressionne tes potes" description is asking to
// replace a vehicle with a specific make/model, and extracts that
// make/model as a plain search string — the input to
// lib/car-reference.ts's real-photo lookup. A cheap, separate text-only
// call rather than regex/keyword matching because "make/model precise
// enough to look up" is exactly the kind of free-text judgment call a
// small LLM handles reliably and hand-rolled parsing wouldn't (brand
// abbreviations, model trims, languages, typos).
export async function extractVehicleModel(description: string): Promise<string | null> {
  const openai = getOpenAI();
  if (!openai) return null;

  try {
    const result = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: `Cette description demande-t-elle de remplacer un véhicule (voiture, moto...) par un modèle précis d'une marque identifiable ? Description : "${description}".

Si oui, réponds UNIQUEMENT avec "marque modèle" en anglais/nom commercial standard, sans autre mot (ex : "Audi RS6 Avant", "Ferrari 812 Superfast", "Porsche 911 Turbo S").
Si non — pas de véhicule concerné, ou modèle trop vague pour être identifié précisément ("une voiture de sport", "un SUV") — réponds UNIQUEMENT avec "NON".`,
        },
      ],
      max_tokens: 20,
    });

    const text = result.choices[0]?.message?.content?.trim() ?? "";
    if (!text || /^non$/i.test(text)) return null;
    return text;
  } catch (err) {
    console.error("extractVehicleModel error", err);
    return null;
  }
}
