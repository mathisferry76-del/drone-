// Extracts a YouTube video ID from any common URL shape (watch, youtu.be,
// shorts, embed) — deliberately permissive since users paste links copied
// from all sorts of places (share sheets, browser bars, mobile apps).
export function extractYoutubeId(url: string): string | null {
  try {
    const u = new URL(url.trim());
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      return u.pathname.slice(1).split("/")[0] || null;
    }
    if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
      if (u.pathname === "/watch") return u.searchParams.get("v");
      const shortsMatch = u.pathname.match(/^\/shorts\/([^/]+)/);
      if (shortsMatch) return shortsMatch[1];
      const embedMatch = u.pathname.match(/^\/embed\/([^/]+)/);
      if (embedMatch) return embedMatch[1];
    }
    return null;
  } catch {
    return null;
  }
}

export interface VideoInfo {
  title: string;
  description: string | null;
}

// oEmbed needs no API key and reliably returns the title — used as the
// baseline every deployment gets for free. If YOUTUBE_API_KEY is set, the
// Data API v3 call below additionally pulls the description, which gives
// the thumbnail-prompt generator much richer context (the title alone is
// often just a hook, not the actual subject of the video).
async function fetchOEmbedTitle(videoId: string): Promise<string | null> {
  const res = await fetch(
    `https://www.youtube.com/oembed?url=${encodeURIComponent(
      `https://www.youtube.com/watch?v=${videoId}`
    )}&format=json`
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { title?: string };
  return data.title ?? null;
}

async function fetchDataApiInfo(videoId: string, apiKey: string): Promise<VideoInfo | null> {
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${apiKey}`
  );
  if (!res.ok) return null;
  const data = (await res.json()) as {
    items?: { snippet?: { title?: string; description?: string } }[];
  };
  const snippet = data.items?.[0]?.snippet;
  if (!snippet?.title) return null;
  return { title: snippet.title, description: snippet.description?.slice(0, 1500) ?? null };
}

// Shared between the Gemini and OpenAI text paths (lib/gemini.ts /
// lib/openai.ts) so the two providers are held to the exact same bar,
// instead of two copies drifting apart.
//
// The first version of this just asked for "a scene matching the video's
// subject" — too weak a brief: with only a title like "Ce mec est
// réellement malchanceux" the model produced a generic reaction shot with
// no real scene, nothing a viewer would actually click on. Two changes
// fix that: (1) an explicit two-step instruction — first identify the
// single most shocking/funny/tense concrete moment the title (and
// description, when available) implies, then stage a thumbnail around
// exactly that moment, not a vague mood; (2) a worked example at the
// target level of specificity, since "be detailed" alone doesn't reliably
// produce it — the model needs to see the bar, not just be told where it is.
export function buildVideoThumbnailInstruction(
  title: string,
  description: string | null,
  presetName: string
): string {
  return `Tu es un designer de miniatures YouTube professionnel. Une bonne miniature vend un moment précis de la vidéo, pas une ambiance vague — les gens cliquent parce qu'ils veulent savoir ce qui se passe sur l'image.

Voici les infos d'une vraie vidéo YouTube :

Titre : ${title}
${description ? `Description : ${description}` : "(pas de description disponible — base-toi uniquement sur le titre, mais reste aussi concret que possible : invente un moment plausible et spécifique plutôt qu'une scène générique)"}

Style de miniature choisi : ${presetName}

Étape 1 (raisonnement interne, ne l'écris pas dans ta réponse) : identifie LE moment le plus choquant, drôle ou tendu que cette vidéo contient probablement, d'après le titre et la description. Sois précis — pas "une situation difficile" mais "il glisse et tombe dans la boue devant tout le monde", pas "un moment drôle" mais "il se prend un seau d'eau glacée en pleine tête".

Étape 2 : écris UNE SEULE description de scène en français, prête à coller dans un champ de génération IA par photo, qui met en scène EXACTEMENT ce moment précis. Exemple du niveau de détail et du format attendus (sur un tout autre sujet, juste pour calibrer) :

"Miniature YouTube 16:9, cadrage buste, je suis positionné sur le tiers droit de l'image avec de l'espace à gauche pour le titre, caméra au niveau des yeux, légère contre-plongée. Garde mon identité faciale reconnaissable, mais adapte mon expression à la scène : expression choquée et stupéfaite, yeux écarquillés, bouche entrouverte, comme si je venais de recevoir un seau d'eau glacée en pleine tête — cheveux et t-shirt trempés, quelques gouttes encore en suspension dans l'air. Arrière-plan : un jardin en été avec une piscine gonflable visible sur le côté, un seau métallique vide au sol juste devant moi, une silhouette floutée d'un ami qui rit, tenant un second seau. Éclairage naturel de plein jour, contraste net entre moi et le fond légèrement flou. Photoréalisme poussé, qualité cinématographique."

Ta description doit être à ce niveau de précision (action concrète en cours, objets identifiables liés à cette action précise, pas un décor générique) mais adaptée au VRAI moment de la vidéo donnée plus haut, pas à cet exemple. Respecte aussi ces règles :
- Cadrage buste, sujet décalé pour laisser de l'espace pour un titre, angle de caméra précisé
- Identité du visage reconnaissable, mais expression/pose/tenue libres pour coller au moment
- Décor concret avec objets précis liés à l'action, pas vague
- Source de lumière identifiable et ambiance générale
- Ne mentionne aucun texte à afficher dans l'image (le titre est ajouté séparément)

Réponds uniquement avec le texte de la description finale (étape 2), sans introduction, sans mentionner l'étape 1, sans guillemets.`;
}

export async function getVideoInfo(videoId: string): Promise<VideoInfo | null> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (apiKey) {
    const viaDataApi = await fetchDataApiInfo(videoId, apiKey);
    if (viaDataApi) return viaDataApi;
  }
  const title = await fetchOEmbedTitle(videoId);
  if (!title) return null;
  return { title, description: null };
}
