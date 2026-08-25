import { NextRequest, NextResponse } from "next/server";
import sharp, { OverlayOptions } from "sharp";
import fs from "fs/promises";
import path from "path";
import * as opentype from "opentype.js";
import * as wawoff2 from "wawoff2";
import { getPreset, Preset } from "@/lib/presets";

export const runtime = "nodejs";

const CANVAS_WIDTH = 1280;
const CANVAS_HEIGHT = 720;
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const TEXT_MARGIN_X = 64;

// Text is drawn as vector paths (glyph outlines), not <text> elements, so
// rendering never depends on fonts installed on the host. Production
// servers (e.g. Vercel's serverless runtime) ship no system fonts at all —
// letting librsvg resolve fonts (via CSS @font-face or fontconfig) silently
// fails there and text renders as empty boxes. Loading the font ourselves
// with opentype.js and pre-computing outlines sidesteps that entirely.
let fontPromise: Promise<opentype.Font> | null = null;
async function loadFont(): Promise<opentype.Font> {
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

function wrapTextByWidth(
  font: opentype.Font,
  text: string,
  fontSize: number,
  maxWidth: number,
  maxLines: number
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    const width = font.getAdvanceWidth(candidate, fontSize);
    if (width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
    if (lines.length === maxLines) break;
  }
  if (current && lines.length < maxLines) lines.push(current);
  return lines.slice(0, maxLines);
}

function buildTextOverlaySvg(
  font: opentype.Font,
  text: string,
  preset: Preset
): string {
  const fontSize = 88;
  const lineHeight = fontSize * 1.08;
  const maxWidth = CANVAS_WIDTH - TEXT_MARGIN_X * 2;
  const lines = wrapTextByWidth(font, text, fontSize, maxWidth, 3);
  const totalHeight = lines.length * lineHeight;
  const startY = CANVAS_HEIGHT - 60 - totalHeight + fontSize * 0.8;

  const longestLineWidth = Math.max(
    ...lines.map((line) => font.getAdvanceWidth(line, fontSize))
  );

  const paths = lines
    .map((line, i) => {
      const y = startY + i * lineHeight;
      const glyphPath = font.getPath(line, TEXT_MARGIN_X, y, fontSize);
      return `<path d="${glyphPath.toPathData(
        2
      )}" fill="${preset.textColor}" stroke="${preset.strokeColor}" stroke-width="${
        preset.strokeWidth
      }" stroke-linejoin="round" paint-order="stroke fill" />`;
    })
    .join("\n");

  // A dark backing panel behind the text keeps it legible on any photo and
  // reads closer to real high-CTR thumbnails than text floating on a photo.
  const panelTop = startY - fontSize * 0.95;
  const panelBottom = startY + (lines.length - 1) * lineHeight + fontSize * 0.32;
  const panelWidth = Math.min(
    longestLineWidth + TEXT_MARGIN_X * 1.5,
    CANVAS_WIDTH - TEXT_MARGIN_X
  );

  return `<svg width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${preset.gradientFrom}" />
        <stop offset="100%" stop-color="${preset.gradientTo}" />
      </linearGradient>
    </defs>
    <rect x="0" y="${CANVAS_HEIGHT * 0.35}" width="${CANVAS_WIDTH}" height="${
    CANVAS_HEIGHT * 0.65
  }" fill="url(#grad)" opacity="${preset.gradientOpacity}" />
    <rect x="${TEXT_MARGIN_X - 24}" y="${panelTop}" width="${panelWidth}" height="${
    panelBottom - panelTop
  }" rx="14" fill="#000000" opacity="0.32" />
    ${paths}
  </svg>`;
}

function buildWatermarkSvg(
  font: opentype.Font,
  text: string
): string {
  const fontSize = 20;
  const width = font.getAdvanceWidth(text, fontSize);
  const x = CANVAS_WIDTH - 24 - width;
  const y = CANVAS_HEIGHT - 24;
  const glyphPath = font.getPath(text, x, y, fontSize);

  return `<svg width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <path d="${glyphPath.toPathData(2)}" fill="#ffffff" fill-opacity="0.55" />
  </svg>`;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("image");
    const presetId = String(formData.get("presetId") ?? "bold-impact");
    const title = String(formData.get("title") ?? "").slice(0, 120);
    const watermark = String(formData.get("watermark") ?? "true") === "true";

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Aucune image reçue." }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: "Image trop lourde (12 Mo max)." },
        { status: 400 }
      );
    }
    if (!title.trim()) {
      return NextResponse.json(
        { error: "Ajoute un titre pour ta miniature." },
        { status: 400 }
      );
    }

    const preset = getPreset(presetId);
    const font = await loadFont();
    const arrayBuffer = await file.arrayBuffer();
    const inputBuffer = Buffer.from(arrayBuffer);

    const base = sharp(inputBuffer)
      .rotate()
      .resize(CANVAS_WIDTH, CANVAS_HEIGHT, { fit: "cover", position: "attention" })
      .modulate({ brightness: preset.brightness, saturation: preset.saturation })
      .linear(preset.contrastA, preset.contrastB)
      .sharpen();

    const overlays: OverlayOptions[] = [
      {
        input: Buffer.from(buildTextOverlaySvg(font, title, preset)),
        top: 0,
        left: 0,
      },
    ];

    if (watermark) {
      overlays.push({
        input: Buffer.from(buildWatermarkSvg(font, "ThumbAI — version gratuite")),
        top: 0,
        left: 0,
      });
    }

    const outputBuffer = await base.composite(overlays).png().toBuffer();
    const base64 = outputBuffer.toString("base64");

    return NextResponse.json({
      image: `data:image/png;base64,${base64}`,
    });
  } catch (err) {
    console.error("generate error", err);
    return NextResponse.json(
      { error: "Erreur pendant la génération. Réessaie avec une autre image." },
      { status: 500 }
    );
  }
}
