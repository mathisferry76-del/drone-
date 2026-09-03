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
