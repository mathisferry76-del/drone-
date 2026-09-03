import { NextRequest, NextResponse } from "next/server";
import { extractYoutubeId, getVideoInfo } from "@/lib/youtube";
import { getGeminiKey, generateThumbnailPromptFromVideo, describeGeminiError, GeminiApiError } from "@/lib/gemini";
import { generateThumbnailPromptFromVideoOpenAI } from "@/lib/openai";
import { getPreset } from "@/lib/presets";
import { getUserFromAuthHeader } from "@/lib/supabase";
import { isRateLimited, getClientIp } from "@/lib/rate-limit";

// Behind auth like the rest of /api/generate's AI features — a text-only
// LLM call is cheap, but still a real paid call worth gating, and per-IP
// rate limiting alone wouldn't stop one signed-in account from hammering it.
export async function POST(req: NextRequest) {
  if (isRateLimited(`analyze-video:${getClientIp(req)}`, 15, 5 * 60 * 1000)) {
    return NextResponse.json(
      { error: "Trop de requêtes. Réessaie dans quelques minutes." },
      { status: 429 }
    );
  }

  const user = await getUserFromAuthHeader(req.headers.get("authorization"));
  if (!user) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }

  const { url, presetId } = (await req.json().catch(() => ({}))) as {
    url?: string;
    presetId?: string;
  };
  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "Lien YouTube manquant." }, { status: 400 });
  }

  const videoId = extractYoutubeId(url);
  if (!videoId) {
    return NextResponse.json(
      { error: "Lien YouTube invalide. Colle un lien du type youtube.com/watch?v=... ou youtu.be/..." },
      { status: 400 }
    );
  }

  const info = await getVideoInfo(videoId);
  if (!info) {
    return NextResponse.json(
      { error: "Impossible de récupérer les informations de cette vidéo. Vérifie qu'elle est publique." },
      { status: 502 }
    );
  }

  const preset = getPreset(presetId ?? "bold-impact");
  const useGemini = Boolean(getGeminiKey());

  try {
    const prompt = useGemini
      ? await generateThumbnailPromptFromVideo(info.title, info.description, preset.name)
      : await generateThumbnailPromptFromVideoOpenAI(info.title, info.description, preset.name);
    return NextResponse.json({ prompt, videoTitle: info.title });
  } catch (err) {
    console.error("analyze-video error", err);
    const message =
      useGemini || err instanceof GeminiApiError
        ? describeGeminiError(err)
        : err instanceof Error
          ? err.message
          : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
