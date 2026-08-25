import { NextRequest, NextResponse } from "next/server";
import sharp, { OverlayOptions } from "sharp";
import fs from "fs/promises";
import path from "path";
import * as opentype from "opentype.js";
import * as wawoff2 from "wawoff2";
import OpenAI, { toFile } from "openai";
import { getPreset, Preset } from "@/lib/presets";
import { getOpenAI } from "@/lib/openai";

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

// Blends a preset's filter strength between neutral (0, photo untouched)
// and the preset's full effect (1), so the intensity slider in the UI can
// dial a style up or down instead of it being all-or-nothing.
function scalePresetIntensity(preset: Preset, t: number) {
  return {
    brightness: 1 + (preset.brightness - 1) * t,
    saturation: 1 + (preset.saturation - 1) * t,
    contrastA: 1 + (preset.contrastA - 1) * t,
    contrastB: preset.contrastB * t,
  };
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

// Calls OpenAI's image editing model to actually regenerate the photo's
// lighting/atmosphere/background per the preset's prompt — a real
// generative transformation, not a deterministic color filter. Reserved
// for the Pro plan; requires OPENAI_API_KEY to be configured.
async function applyAiEnhancement(
  inputBuffer: Buffer,
  mimeType: string,
  preset: Preset,
  userDescription: string
): Promise<Buffer> {
  const openai = getOpenAI();
  if (!openai) {
    throw new AiNotConfiguredError();
  }

  const uploadable = await toFile(inputBuffer, "photo.png", {
    type: mimeType || "image/png",
  });

  const prompt = userDescription.trim()
    ? `${preset.aiPrompt} Also incorporate these specific instructions from the user: ${userDescription.trim()}`
    : preset.aiPrompt;

  const result = await openai.images.edit({
    model: "gpt-image-1",
    image: uploadable,
    prompt,
    size: "1536x1024",
  });

  const b64 = result.data?.[0]?.b64_json;
  if (!b64) {
    throw new Error("OpenAI n'a renvoyé aucune image.");
  }
  return Buffer.from(b64, "base64");
}

class AiNotConfiguredError extends Error {
  constructor() {
    super(
      "L'amélioration IA n'est pas configurée sur ce déploiement (OPENAI_API_KEY manquante)."
    );
  }
}

// Turns an OpenAI SDK error into a specific, actionable French message
// instead of a generic "ça n'a pas marché" — the difference between a
// wrong API key, an unverified org, an empty wallet, and a genuinely
// refused image all need different fixes from the user.
function describeAiError(err: unknown): string {
  if (err instanceof OpenAI.APIError) {
    switch (err.status) {
      case 401:
        return "Clé OpenAI invalide ou expirée. Vérifie OPENAI_API_KEY sur Vercel.";
      case 403:
        return "Accès refusé par OpenAI : ton organisation doit être vérifiée pour utiliser gpt-image-1 (platform.openai.com → Settings → Organization → Verification).";
      case 429:
        return "Quota OpenAI atteint ou compte sans crédit. Vérifie Billing sur platform.openai.com.";
      case 400:
        return `Photo refusée par OpenAI (${err.message || "requête invalide"}). Essaie une autre photo.`;
      default:
        return `Erreur OpenAI (${err.status ?? "inconnue"}) : ${err.message}`;
    }
  }
  if (err instanceof Error) return err.message;
  return "Erreur inconnue pendant l'amélioration IA.";
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("image");
    const presetId = String(formData.get("presetId") ?? "bold-impact");
    const title = String(formData.get("title") ?? "").slice(0, 120);
    const watermark = String(formData.get("watermark") ?? "true") === "true";
    const aiEnhance = String(formData.get("aiEnhance") ?? "false") === "true";
    const aiDescription = String(formData.get("aiDescription") ?? "").slice(0, 600);
    const intensityRaw = Number(formData.get("intensity") ?? "100");
    const intensity = Number.isFinite(intensityRaw)
      ? Math.min(100, Math.max(0, intensityRaw))
      : 100;

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

    let base: ReturnType<typeof sharp>;

    if (aiEnhance) {
      let aiBuffer: Buffer;
      try {
        aiBuffer = await applyAiEnhancement(
          inputBuffer,
          file.type,
          preset,
          aiDescription
        );
      } catch (err) {
        if (err instanceof AiNotConfiguredError) {
          return NextResponse.json({ error: err.message }, { status: 501 });
        }
        console.error("openai enhancement error", err);
        return NextResponse.json(
          { error: describeAiError(err) },
          { status: 502 }
        );
      }
      base = sharp(aiBuffer)
        .resize(CANVAS_WIDTH, CANVAS_HEIGHT, { fit: "cover", position: "attention" })
        .sharpen();
    } else {
      const scaled = scalePresetIntensity(preset, intensity / 100);
      base = sharp(inputBuffer)
        .rotate()
        .resize(CANVAS_WIDTH, CANVAS_HEIGHT, { fit: "cover", position: "attention" })
        .modulate({ brightness: scaled.brightness, saturation: scaled.saturation })
        .linear(scaled.contrastA, scaled.contrastB)
        .sharpen();
    }

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
