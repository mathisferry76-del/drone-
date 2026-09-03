import OpenAI from "openai";

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

  const instruction = `Tu aides à écrire une description pour générer une miniature YouTube par IA (photo de la personne + décor généré). Voici les infos d'une vraie vidéo YouTube :

Titre : ${title}
${description ? `Description : ${description}` : ""}

Style de miniature choisi : ${presetName}

Écris UNE SEULE description de scène en français, prête à coller dans un champ de génération IA, qui correspond au sujet réel de cette vidéo. Suis strictement ce format et ce niveau de détail :
- Précise le cadrage (buste, position du sujet décalée pour laisser de l'espace pour un titre, angle de caméra)
- Garde l'identité du visage reconnaissable mais laisse l'expression/pose/tenue s'adapter à la scène
- Décris un décor concret avec des objets précis (pas vague), cohérent avec le sujet de la vidéo
- Précise une source de lumière identifiable et l'ambiance générale
- Ne mentionne aucun texte à afficher dans l'image (le titre est ajouté séparément)

Réponds uniquement avec le texte de la description, sans introduction ni guillemets.`;

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
