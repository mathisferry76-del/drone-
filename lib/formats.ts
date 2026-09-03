// Output format + resolution registry shared between the generator UI
// (app/generate/page.tsx) and the generation API (app/api/generate/route.ts)
// so both sides agree on the same ids/dimensions instead of two lists
// drifting apart.

export interface FormatSpec {
  id: string;
  label: string;
  // Base ("1K"-tier) pixel dimensions. The resolution multiplier below is
  // applied on top of these as a final upscale step, not a re-generation —
  // see RESOLUTION_MULTIPLIERS.
  width: number;
  height: number;
}

export const FORMATS: FormatSpec[] = [
  { id: "youtube", label: "YouTube (16:9)", width: 1280, height: 720 },
  { id: "youtube-shorts", label: "YouTube Shorts (9:16)", width: 720, height: 1280 },
  { id: "tiktok", label: "TikTok (9:16)", width: 720, height: 1280 },
  { id: "instagram-post", label: "Instagram Post (1:1)", width: 1080, height: 1080 },
  { id: "instagram-story", label: "Instagram Story (9:16)", width: 1080, height: 1920 },
  { id: "instagram-reel", label: "Instagram Reel (9:16)", width: 1080, height: 1920 },
  { id: "facebook-post", label: "Facebook Post (1.91:1)", width: 1200, height: 630 },
  { id: "twitter-post", label: "Twitter / X Post (16:9)", width: 1280, height: 720 },
  { id: "linkedin-post", label: "LinkedIn Post (1.91:1)", width: 1200, height: 627 },
];

export const DEFAULT_FORMAT_ID = "youtube";

export function getFormat(id: string | null | undefined): FormatSpec {
  return FORMATS.find((f) => f.id === id) ?? FORMATS[0];
}

export type ResolutionTier = "1k" | "2k" | "4k";

// A multiplier applied to the base format dimensions as a final sharp
// resize, AFTER the AI generation and compositing are done — it is a real
// upscale (more pixels to fit platform requirements), not extra detail the
// AI invents. 2x/3x are picked so a 16:9 format lands exactly on the real
// 2560x1440 / 3840x2160 (4K UHD) pixel counts, matching what "2K"/"4K"
// mean in practice, even though neither AI provider natively renders that
// many real pixels.
export const RESOLUTION_MULTIPLIERS: Record<ResolutionTier, number> = {
  "1k": 1,
  "2k": 2,
  "4k": 3,
};

export const DEFAULT_RESOLUTION: ResolutionTier = "1k";

export function isResolutionTier(value: unknown): value is ResolutionTier {
  return value === "1k" || value === "2k" || value === "4k";
}
