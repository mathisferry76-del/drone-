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
const MAX_CURVE_ANGLE = 0.8; // radians of total arc sweep at curve = ±100

type BackgroundStyle = "panel" | "shadow" | "none";

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

interface Bbox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function growBbox(box: Bbox, x: number, y: number, padding: number) {
  box.minX = Math.min(box.minX, x - padding);
  box.maxX = Math.max(box.maxX, x + padding);
  box.minY = Math.min(box.minY, y - padding);
  box.maxY = Math.max(box.maxY, y + padding);
}

// Lays out one line of text as individual glyph paths along a (possibly
// curved) baseline. curveAmount === 0 degenerates to a normal straight
// line. Returns the SVG <g> markup for the glyphs plus the bounding box
// they occupy, so the caller can size a background panel/shadow to match.
function layoutLine(
  font: opentype.Font,
  line: string,
  fontSize: number,
  centerX: number,
  baselineY: number,
  curveAmount: number,
  bbox: Bbox
): string {
  const glyphs = font.stringToGlyphs(line);
  const scale = fontSize / font.unitsPerEm;
  const advances = glyphs.map((g) => (g.advanceWidth ?? 0) * scale);
  const kerning = glyphs.map((g, i) => {
    if (i === 0) return 0;
    return font.getKerningValue(glyphs[i - 1], g) * scale;
  });

  let cursor = 0;
  const centers: number[] = [];
  for (let i = 0; i < glyphs.length; i++) {
    cursor += kerning[i];
    centers.push(cursor + advances[i] / 2);
    cursor += advances[i];
  }
  const totalWidth = cursor;
  const angleSpan = (curveAmount / 100) * MAX_CURVE_ANGLE;
  const sign = curveAmount >= 0 ? 1 : -1;
  const radius = Math.abs(angleSpan) > 1e-6 ? totalWidth / Math.abs(angleSpan) : 0;

  const parts: string[] = [];
  for (let i = 0; i < glyphs.length; i++) {
    const t = totalWidth > 0 ? centers[i] / totalWidth : 0.5;
    let x: number;
    let y: number;
    let angleDeg: number;

    if (radius === 0) {
      x = centerX + (centers[i] - totalWidth / 2);
      y = baselineY;
      angleDeg = 0;
    } else {
      const angle = (t - 0.5) * angleSpan;
      x = centerX + radius * Math.sin(angle);
      y = baselineY - sign * radius * (1 - Math.cos(angle));
      angleDeg = (angle * 180) / Math.PI;
    }

    const glyphPath = glyphs[i].getPath(0, 0, fontSize);
    const d = glyphPath.toPathData(2);
    if (d) {
      // The glyph's own path is anchored at its left edge (x=0), so after
      // moving to its center point on the (possibly curved) baseline and
      // rotating around that point, shift back by half its advance width
      // to actually center it there instead of starting the glyph there.
      const halfAdvance = advances[i] / 2;
      parts.push(
        `<g transform="translate(${x.toFixed(2)},${y.toFixed(
          2
        )}) rotate(${angleDeg.toFixed(2)}) translate(${(-halfAdvance).toFixed(
          2
        )},0)"><path d="${d}"/></g>`
      );
    }
    growBbox(bbox, x, y, fontSize * 0.7);
  }

  return parts.join("");
}

function buildTextOverlaySvg(
  font: opentype.Font,
  text: string,
  textColor: string,
  strokeColor: string,
  strokeWidth: number,
  backgroundStyle: BackgroundStyle,
  anchorX: number,
  anchorY: number,
  curveAmount: number
): string {
  const fontSize = 88;
  const lineHeight = fontSize * 1.08;
  // The text is centered on anchorX, so how much width fits before running
  // off-canvas depends on how close that anchor is to an edge — wrap
  // against that instead of a fixed width, or a title near the edge would
  // render partly outside the frame.
  const edgeMargin = 40;
  const safeHalfWidth = Math.min(anchorX, 1 - anchorX) * CANVAS_WIDTH - edgeMargin;
  const maxWidth = Math.max(220, Math.min(CANVAS_WIDTH * 0.86, safeHalfWidth * 2));
  const lines = wrapTextByWidth(font, text, fontSize, maxWidth, 3);
  const totalHeight = lines.length * lineHeight;

  const centerX = anchorX * CANVAS_WIDTH;
  const rawBlockTop = anchorY * CANVAS_HEIGHT - totalHeight / 2;
  const blockTop = Math.max(
    edgeMargin,
    Math.min(CANVAS_HEIGHT - edgeMargin - totalHeight, rawBlockTop)
  );

  const bbox: Bbox = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  const glyphGroups = lines
    .map((line, i) => {
      const baselineY = blockTop + i * lineHeight + fontSize * 0.78;
      return layoutLine(font, line, fontSize, centerX, baselineY, curveAmount, bbox);
    })
    .join("");

  const hasBox = Number.isFinite(bbox.minX);
  const panelPadding = 24;

  let defs = "";
  let backdrop = "";
  let filterAttr = "";

  if (backgroundStyle === "panel" && hasBox) {
    backdrop = `<rect x="${bbox.minX - panelPadding}" y="${
      bbox.minY - panelPadding * 0.6
    }" width="${bbox.maxX - bbox.minX + panelPadding * 2}" height="${
      bbox.maxY - bbox.minY + panelPadding * 1.2
    }" rx="14" fill="#000000" opacity="0.32" />`;
  } else if (backgroundStyle === "shadow") {
    defs = `<filter id="textShadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="4" dy="6" stdDeviation="6" flood-color="#000000" flood-opacity="0.65" />
    </filter>`;
    filterAttr = ` filter="url(#textShadow)"`;
  }

  return `<svg width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs>${defs}</defs>
    ${backdrop}
    <g${filterAttr} fill="${textColor}" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-linejoin="round" paint-order="stroke fill">
      ${glyphGroups}
    </g>
  </svg>`;
}

function buildWatermarkSvg(font: opentype.Font, text: string): string {
  const fontSize = 20;
  const width = font.getAdvanceWidth(text, fontSize);
  const x = CANVAS_WIDTH - 24 - width;
  const y = CANVAS_HEIGHT - 24;
  const glyphPath = font.getPath(text, x, y, fontSize);

  return `<svg width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <path d="${glyphPath.toPathData(2)}" fill="#ffffff" fill-opacity="0.55" />
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

// Calls OpenAI's image editing model to actually regenerate the photo's
// lighting/atmosphere/background per the preset's prompt — a real
// generative transformation, not a deterministic color filter. An optional
// second reference image can be supplied so the user can ask for a
// specific element from it (e.g. "add the logo from this image").
async function applyAiEnhancement(
  inputBuffer: Buffer,
  mimeType: string,
  preset: Preset,
  userDescription: string,
  referenceBuffer: Buffer | null,
  referenceMimeType: string
): Promise<Buffer> {
  const openai = getOpenAI();
  if (!openai) {
    throw new AiNotConfiguredError();
  }

  const uploadable = await toFile(inputBuffer, "photo.png", {
    type: mimeType || "image/png",
  });

  const images = [uploadable];
  let referenceNote = "";
  if (referenceBuffer) {
    const referenceUploadable = await toFile(referenceBuffer, "reference.png", {
      type: referenceMimeType || "image/png",
    });
    images.push(referenceUploadable);
    referenceNote =
      " A second reference image is also provided — use it only for the specific element the user describes below (e.g. a logo, an object, a color palette), and blend it naturally into the main photo. Do not otherwise let the reference image replace the main subject.";
  }

  const prompt = userDescription.trim()
    ? `${preset.aiPrompt}${referenceNote} Also incorporate these specific instructions from the user: ${userDescription.trim()}`
    : `${preset.aiPrompt}${referenceNote}`;

  const result = await openai.images.edit({
    model: "gpt-image-1",
    image: images.length > 1 ? images : images[0],
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

function isValidHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{3,8}$/.test(value);
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("image");
    const presetId = String(formData.get("presetId") ?? "bold-impact");
    const title = String(formData.get("title") ?? "").slice(0, 120);
    const watermark = String(formData.get("watermark") ?? "true") === "true";
    const aiEnhance = String(formData.get("aiEnhance") ?? "false") === "true";
    const aiDescription = String(formData.get("aiDescription") ?? "").slice(0, 1200);
    const intensityRaw = Number(formData.get("intensity") ?? "100");
    const intensity = Number.isFinite(intensityRaw)
      ? Math.min(100, Math.max(0, intensityRaw))
      : 100;

    const textColorRaw = String(formData.get("textColor") ?? "");
    const strokeColorRaw = String(formData.get("strokeColor") ?? "");
    const backgroundStyleRaw = String(formData.get("backgroundStyle") ?? "panel");
    const backgroundStyle: BackgroundStyle = ["panel", "shadow", "none"].includes(
      backgroundStyleRaw
    )
      ? (backgroundStyleRaw as BackgroundStyle)
      : "panel";
    const anchorXRaw = Number(formData.get("textX") ?? "0.5");
    const anchorYRaw = Number(formData.get("textY") ?? "0.85");
    const anchorX = Number.isFinite(anchorXRaw) ? Math.min(0.95, Math.max(0.05, anchorXRaw)) : 0.5;
    const anchorY = Number.isFinite(anchorYRaw) ? Math.min(0.95, Math.max(0.1, anchorYRaw)) : 0.85;
    const curveRaw = Number(formData.get("curve") ?? "0");
    const curve = Number.isFinite(curveRaw) ? Math.min(100, Math.max(-100, curveRaw)) : 0;

    const referenceImage = formData.get("referenceImage");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Aucune image reçue." }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: "Image trop lourde (12 Mo max)." },
        { status: 400 }
      );
    }
    if (referenceImage instanceof File && referenceImage.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: "Image de référence trop lourde (12 Mo max)." },
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

    const textColor = isValidHexColor(textColorRaw) ? textColorRaw : preset.textColor;
    const strokeColor = isValidHexColor(strokeColorRaw) ? strokeColorRaw : preset.strokeColor;

    let base: ReturnType<typeof sharp>;

    if (aiEnhance) {
      let referenceBuffer: Buffer | null = null;
      let referenceMimeType = "";
      if (referenceImage instanceof File) {
        referenceBuffer = Buffer.from(await referenceImage.arrayBuffer());
        referenceMimeType = referenceImage.type;
      }

      let aiBuffer: Buffer;
      try {
        aiBuffer = await applyAiEnhancement(
          inputBuffer,
          file.type,
          preset,
          aiDescription,
          referenceBuffer,
          referenceMimeType
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
        input: Buffer.from(
          buildTextOverlaySvg(
            font,
            title,
            textColor,
            strokeColor,
            preset.strokeWidth,
            backgroundStyle,
            anchorX,
            anchorY,
            curve
          )
        ),
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
