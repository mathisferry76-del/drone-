import sharp from "sharp";
import type { ReplacementRegion } from "./detect-replacement-region";

// Builds an OpenAI images.edit mask: opaque everywhere except the target
// region, which is fully transparent — transparent is what tells gpt-image-1
// where it's allowed to generate new content, per OpenAI's edit-mask
// convention (the mask's own color never matters, only its alpha channel).
// Must exactly match the source image's own width/height — an OpenAI API
// requirement.
export async function buildReplacementMask(
  width: number,
  height: number,
  region: ReplacementRegion
): Promise<Buffer> {
  const left = Math.round((region.left / 100) * width);
  const top = Math.round((region.top / 100) * height);
  const boxWidth = Math.min(width - left, Math.round(((region.right - region.left) / 100) * width));
  const boxHeight = Math.min(
    height - top,
    Math.round(((region.bottom - region.top) / 100) * height)
  );

  // An opaque rectangle composited with "dest-out" erases the base image's
  // alpha wherever it overlaps, regardless of the rectangle's own color —
  // this is what punches the transparent hole into the otherwise-opaque
  // canvas below.
  const holePunch = await sharp({
    create: {
      width: Math.max(1, boxWidth),
      height: Math.max(1, boxHeight),
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    },
  })
    .png()
    .toBuffer();

  return sharp({
    create: { width, height, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
  })
    .composite([{ input: holePunch, left, top, blend: "dest-out" }])
    .png()
    .toBuffer();
}
