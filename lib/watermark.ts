import fs from "fs/promises";
import path from "path";
import * as opentype from "opentype.js";
import * as wawoff2 from "wawoff2";

// Text is drawn as vector paths (glyph outlines), not <text> elements, so
// rendering never depends on fonts installed on the host. Production
// servers (e.g. Vercel's serverless runtime) ship no system fonts at all —
// letting librsvg resolve fonts (via CSS @font-face or fontconfig) silently
// fails there and text renders as empty boxes. Loading the font ourselves
// with opentype.js and pre-computing outlines sidesteps that entirely.
let fontPromise: Promise<opentype.Font> | null = null;
export async function loadFont(): Promise<opentype.Font> {
  if (!fontPromise) {
    fontPromise = (async () => {
      const woff2Buf = await fs.readFile(
        path.join(process.cwd(), "lib/fonts/heading.woff2")
      );
      const ttfBuf = await wawoff2.decompress(woff2Buf);
      const arrayBuffer = ttfBuf.buffer.slice(
        ttfBuf.byteOffset,
        ttfBuf.byteOffset + ttfBuf.byteLength
      );
      return opentype.parse(arrayBuffer);
    })();
  }
  return fontPromise;
}

export function buildWatermarkSvg(
  font: opentype.Font,
  text: string,
  canvasWidth: number,
  canvasHeight: number
): string {
  const fontSize = 20;
  const width = font.getAdvanceWidth(text, fontSize);
  const x = canvasWidth - 24 - width;
  const y = canvasHeight - 24;
  const glyphPath = font.getPath(text, x, y, fontSize);

  return `<svg width="${canvasWidth}" height="${canvasHeight}" xmlns="http://www.w3.org/2000/svg">
    <path d="${glyphPath.toPathData(2)}" fill="#ffffff" fill-opacity="0.55" />
  </svg>`;
}
