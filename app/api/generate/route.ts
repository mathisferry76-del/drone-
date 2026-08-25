import { NextRequest, NextResponse } from "next/server";
import sharp, { OverlayOptions } from "sharp";
import path from "path";
import { getPreset } from "@/lib/presets";

export const runtime = "nodejs";

const CANVAS_WIDTH = 1280;
const CANVAS_HEIGHT = 720;
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

// The text is drawn via an SVG rendered by sharp/librsvg, which resolves
// fonts through fontconfig — not via CSS @font-face. Production servers
// (e.g. Vercel's serverless runtime) ship no system fonts at all, so the
// default fontconfig lookup finds nothing and text renders as empty boxes.
// Pointing FONTCONFIG_PATH at our own bundled font makes it discoverable
// everywhere, independent of what the host has installed.
process.env.FONTCONFIG_PATH = path.join(process.cwd(), "lib/fonts");
const HEADING_FONT_FAMILY = "Archivo Black";

function escapeXml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function wrapText(text: string, maxCharsPerLine: number, maxLines: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxCharsPerLine && current) {
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
  text: string,
  preset: ReturnType<typeof getPreset>
): string {
  const fontSize = 84;
  const lineHeight = fontSize * 1.08;
  const lines = wrapText(text, 16, 3);
  const totalHeight = lines.length * lineHeight;
  const startY = CANVAS_HEIGHT - 56 - totalHeight + fontSize * 0.8;

  const tspans = lines
    .map((line, i) => {
      const y = startY + i * lineHeight;
      return `<text x="64" y="${y}" font-family="${HEADING_FONT_FAMILY}, sans-serif" font-size="${fontSize}" fill="${preset.textColor}" stroke="${preset.strokeColor}" stroke-width="${preset.strokeWidth}" paint-order="stroke fill" stroke-linejoin="round">${escapeXml(
        line
      )}</text>`;
    })
    .join("\n");

  return `<svg width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${preset.gradientFrom}" />
        <stop offset="100%" stop-color="${preset.gradientTo}" />
      </linearGradient>
    </defs>
    <rect x="0" y="${CANVAS_HEIGHT * 0.4}" width="${CANVAS_WIDTH}" height="${
    CANVAS_HEIGHT * 0.6
  }" fill="url(#grad)" opacity="${preset.gradientOpacity}" />
    ${tspans}
  </svg>`;
}

function buildWatermarkSvg(): string {
  return `<svg width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <text x="${CANVAS_WIDTH - 24}" y="${
    CANVAS_HEIGHT - 24
  }" text-anchor="end" font-family="${HEADING_FONT_FAMILY}, sans-serif" font-size="18" fill="#ffffff" fill-opacity="0.55">ThumbAI — version gratuite</text>
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
        input: Buffer.from(buildTextOverlaySvg(title, preset)),
        top: 0,
        left: 0,
      },
    ];

    if (watermark) {
      overlays.push({
        input: Buffer.from(buildWatermarkSvg()),
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
