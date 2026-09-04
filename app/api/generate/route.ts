import { NextRequest, NextResponse } from "next/server";
import sharp, { OverlayOptions } from "sharp";
import * as opentype from "opentype.js";
import OpenAI, { toFile } from "openai";
import { randomUUID } from "crypto";
import {
  getPreset,
  Preset,
  AI_QUALITY_DIRECTIVE,
  FACE_ZONE_BASE_RX,
  FACE_ZONE_BASE_RY,
  EDIT_ZONE_BASE_RX,
  EDIT_ZONE_BASE_RY,
  GENERATION_CREDIT_COST,
} from "@/lib/presets";
import { getOpenAI } from "@/lib/openai";
import { getGeminiKey, editImageWithGemini, GeminiApiError, describeGeminiError } from "@/lib/gemini";
import { getSupabaseAdmin, getUserFromAuthHeader, Profile } from "@/lib/supabase";
import { isRateLimited, getClientIp } from "@/lib/rate-limit";
import { getFormat, RESOLUTION_MULTIPLIERS, isResolutionTier } from "@/lib/formats";
import { loadFont, buildWatermarkSvg } from "@/lib/watermark";

export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const MAX_CURVE_ANGLE = 0.8; // radians of total arc sweep at curve = ±100
const MAX_TEXT_LAYERS = 5;
const MAX_SHAPES = 8;
const MAX_REFERENCE_IMAGES = 3;

type BackgroundStyle = "panel" | "shadow" | "none";
type ShapeType = "arrow" | "circle" | "rectangle";

interface TextLayerInput {
  text: string;
  color: string;
  strokeColor: string;
  backgroundStyle: BackgroundStyle;
  x: number;
  y: number;
  curve: number;
  fontSize: number;
}

interface ShapeInput {
  type: ShapeType;
  color: string;
  x: number;
  y: number;
  size: number;
  rotation: number;
}

function isValidHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{3,8}$/.test(value);
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

interface FacePreserve {
  x: number;
  y: number;
  sizeX: number;
  sizeY: number;
}

// The "face zone" ellipse is defined client-side, in normalized coordinates
// of the *original* uploaded photo. Parsed defensively since it comes from
// an untrusted client-supplied JSON string.
function parseFacePreserve(raw: unknown): FacePreserve | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      x: clampNumber(parsed.x, 0, 1, 0.5),
      y: clampNumber(parsed.y, 0, 1, 0.38),
      sizeX: clampNumber(parsed.sizeX, 0.4, 2.5, 1),
      sizeY: clampNumber(parsed.sizeY, 0.4, 2.5, 1),
    };
  } catch {
    return null;
  }
}

// Builds a PNG mask for OpenAI's images.edit: fully transparent pixels mark
// the area the model is allowed to regenerate, fully opaque pixels are
// preserved untouched. We render a feathered opaque rounded rectangle over
// the face zone the user marked, so the face comes back pixel-for-pixel
// identical — no amount of prompting can guarantee that the way a real
// pixel mask does.
//
// Deliberately a rectangle, not an ellipse: an ellipse inscribed in the
// same bounding box excludes its four corners (~20% of the area) by
// construction. On a face, those corners are exactly the jawline/beard and
// the temples/eyes — so even a well-sized, well-centered ellipse routinely
// left the beard and eyes unprotected and let the model regenerate them,
// which is the actual failure users were hitting. A rounded rect covers
// the full box, corners included.
async function buildFaceMask(
  width: number,
  height: number,
  face: FacePreserve
): Promise<Buffer> {
  const cx = face.x * width;
  const cy = face.y * height;
  const halfW = FACE_ZONE_BASE_RX * face.sizeX * width;
  const halfH = FACE_ZONE_BASE_RY * face.sizeY * height;
  const blur = Math.max(halfW, halfH) * 0.2;
  const rectX = cx - halfW;
  const rectY = cy - halfH;
  const corner = Math.min(halfW, halfH) * 0.4;
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="feather" x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur stdDeviation="${blur.toFixed(1)}" />
      </filter>
    </defs>
    <rect x="${rectX.toFixed(1)}" y="${rectY.toFixed(1)}" width="${(halfW * 2).toFixed(1)}" height="${(halfH * 2).toFixed(1)}" rx="${corner.toFixed(1)}" ry="${corner.toFixed(1)}" fill="#000" filter="url(#feather)" />
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

interface EditZone {
  x: number;
  y: number;
  sizeX: number;
  sizeY: number;
}

// The "zone à retoucher" the user marks for a targeted local edit (tone down
// a color, nudge an object over) instead of regenerating the whole photo.
function parseEditZone(raw: unknown): EditZone | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      x: clampNumber(parsed.x, 0, 1, 0.5),
      y: clampNumber(parsed.y, 0, 1, 0.5),
      sizeX: clampNumber(parsed.sizeX, 0.15, 2.5, 1),
      sizeY: clampNumber(parsed.sizeY, 0.15, 2.5, 1),
    };
  } catch {
    return null;
  }
}

// The inverse of buildFaceMask: opaque (preserved) everywhere *except* a
// feathered hole over the zone the user wants changed. If a face zone is
// also set, it's re-protected even where it overlaps the edit zone, so a
// targeted retouch can never accidentally regenerate the face.
async function buildEditZoneMask(
  width: number,
  height: number,
  zone: EditZone,
  face: FacePreserve | null
): Promise<Buffer> {
  const cx = zone.x * width;
  const cy = zone.y * height;
  const rx = EDIT_ZONE_BASE_RX * zone.sizeX * width;
  const ry = EDIT_ZONE_BASE_RY * zone.sizeY * height;
  const blur = Math.max(rx, ry) * 0.15;
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <mask id="hole">
        <rect width="${width}" height="${height}" fill="#fff" />
        <ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="#000" style="filter:blur(${blur.toFixed(1)}px)" />
      </mask>
    </defs>
    <rect width="${width}" height="${height}" fill="#000" mask="url(#hole)" />
  </svg>`;
  let maskBuffer = await sharp(Buffer.from(svg)).png().toBuffer();

  if (face) {
    const faceMask = await buildFaceMask(width, height, face);
    maskBuffer = await sharp(maskBuffer).composite([{ input: faceMask, blend: "over" }]).png().toBuffer();
  }

  return maskBuffer;
}

// Sends a second, targeted images.edit call scoped to just the marked zone —
// used for "tone this down" / "move that object over" style fixes on an
// already-generated photo, without regenerating (and risking) the rest of
// the image or the protected face.
async function applyTargetedEdit(
  baseBuffer: Buffer,
  instruction: string,
  zone: EditZone,
  face: FacePreserve | null,
  signal?: AbortSignal
): Promise<Buffer> {
  const openai = getOpenAI();
  if (!openai) {
    throw new AiNotConfiguredError();
  }

  const meta = await sharp(baseBuffer).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) {
    throw new Error("Image invalide pour la retouche ciblée.");
  }

  const maskBuffer = await buildEditZoneMask(width, height, zone, face);
  const uploadable = await toFile(baseBuffer, "photo.png", { type: "image/png" });
  const maskUploadable = await toFile(maskBuffer, "edit-zone-mask.png", { type: "image/png" });

  const prompt = `Apply this specific local edit only within the editable (unmasked) region, blending it seamlessly with the surrounding lighting, colors and style: ${instruction.trim()}. Everything outside that region — including the subject and the rest of the background — must remain exactly as it is in the input image.`;

  // baseBuffer's own aspect decides which fixed size to declare — it's
  // already sized to one of the three buckets when it came out of
  // applyAiEnhancement, but bucketing here from its real dimensions (rather
  // than assuming landscape) keeps this correct for portrait/square target
  // formats too.
  const { size: editSize } = pickOpenAiSize(width, height);

  const result = await openai.images.edit(
    {
      model: "gpt-image-1",
      image: uploadable,
      mask: maskUploadable,
      prompt,
      size: editSize,
      quality: "high",
      input_fidelity: "high",
    },
    { signal }
  );

  const b64 = result.data?.[0]?.b64_json;
  if (!b64) {
    throw new Error("OpenAI n'a renvoyé aucune image pour la retouche ciblée.");
  }
  return Buffer.from(b64, "base64");
}

// A pure contrast/brightness/saturation touch-up pivoted around neutral gray
// (128), independent of any preset — used to let the user correct an AI
// generation's colors (or reuse a cached AI base for a free re-composite)
// without re-grading it like a filter preset would.
function fineOnlyAdjustments(
  fineBrightness: number,
  fineContrast: number,
  fineSaturation: number
) {
  const contrastA = 1 + fineContrast / 100;
  return {
    brightness: 1 + fineBrightness / 100,
    saturation: 1 + fineSaturation / 100,
    contrastA,
    contrastB: 128 * (1 - contrastA),
  };
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

// Renders one text layer (its own color/outline/background/curve/size) as
// a self-contained fragment: optional <defs> (for a per-layer drop-shadow
// filter, uniquely named so multiple layers don't clash) plus the visible
// markup. Several of these are combined into one overlay SVG.
function buildTextLayerFragment(
  font: opentype.Font,
  layer: TextLayerInput,
  layerIndex: number,
  canvasWidth: number,
  canvasHeight: number
): { defs: string; markup: string } {
  const fontSize = layer.fontSize;
  const lineHeight = fontSize * 1.08;
  // The text is centered on x, so how much width fits before running off
  // canvas depends on how close that anchor is to an edge — wrap against
  // that instead of a fixed width, or a title near the edge would render
  // partly outside the frame.
  const edgeMargin = 40;
  const safeHalfWidth = Math.min(layer.x, 1 - layer.x) * canvasWidth - edgeMargin;
  const maxWidth = Math.max(160, Math.min(canvasWidth * 0.86, safeHalfWidth * 2));
  const lines = wrapTextByWidth(font, layer.text, fontSize, maxWidth, 3);
  const totalHeight = lines.length * lineHeight;

  const centerX = layer.x * canvasWidth;
  const rawBlockTop = layer.y * canvasHeight - totalHeight / 2;
  const blockTop = Math.max(
    edgeMargin,
    Math.min(canvasHeight - edgeMargin - totalHeight, rawBlockTop)
  );

  const bbox: Bbox = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  const glyphGroups = lines
    .map((line, i) => {
      const baselineY = blockTop + i * lineHeight + fontSize * 0.78;
      return layoutLine(font, line, fontSize, centerX, baselineY, layer.curve, bbox);
    })
    .join("");

  const hasBox = Number.isFinite(bbox.minX);
  const panelPadding = 24;
  const strokeWidth = Math.max(1, Math.round(fontSize * 0.09));

  let defs = "";
  let backdrop = "";
  let filterAttr = "";
  const filterId = `textShadow${layerIndex}`;

  if (layer.backgroundStyle === "panel" && hasBox) {
    backdrop = `<rect x="${bbox.minX - panelPadding}" y="${
      bbox.minY - panelPadding * 0.6
    }" width="${bbox.maxX - bbox.minX + panelPadding * 2}" height="${
      bbox.maxY - bbox.minY + panelPadding * 1.2
    }" rx="14" fill="#000000" opacity="0.32" />`;
  } else if (layer.backgroundStyle === "shadow") {
    defs = `<filter id="${filterId}" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="4" dy="6" stdDeviation="6" flood-color="#000000" flood-opacity="0.65" />
    </filter>`;
    filterAttr = ` filter="url(#${filterId})"`;
  }

  const markup = `${backdrop}<g${filterAttr} fill="${layer.color}" stroke="${layer.strokeColor}" stroke-width="${strokeWidth}" stroke-linejoin="round" paint-order="stroke fill">${glyphGroups}</g>`;

  return { defs, markup };
}

// Renders one annotation shape (arrow / highlight ring / highlight box) as
// an SVG fragment centered at its own point and rotated in place — the
// kind of "point at this" or "circle this" markup real thumbnail
// designers add on top of the photo.
function buildShapeFragment(shape: ShapeInput, canvasWidth: number, canvasHeight: number): string {
  const cx = shape.x * canvasWidth;
  const cy = shape.y * canvasHeight;
  const size = shape.size * canvasWidth;
  const transform = `translate(${cx.toFixed(2)},${cy.toFixed(2)}) rotate(${shape.rotation.toFixed(2)})`;

  if (shape.type === "arrow") {
    const headLen = size * 0.35;
    const headWidth = size * 0.32;
    const shaftWidth = size * 0.1;
    const d = `M ${-size / 2} ${-shaftWidth / 2} L ${size / 2 - headLen} ${-shaftWidth / 2} L ${
      size / 2 - headLen
    } ${-headWidth / 2} L ${size / 2} 0 L ${size / 2 - headLen} ${headWidth / 2} L ${
      size / 2 - headLen
    } ${shaftWidth / 2} L ${-size / 2} ${shaftWidth / 2} Z`;
    return `<g transform="${transform}"><path d="${d}" fill="${shape.color}" stroke="#000000" stroke-width="${Math.max(
      2,
      size * 0.02
    )}" stroke-linejoin="round" /></g>`;
  }

  if (shape.type === "circle") {
    const strokeWidth = Math.max(6, size * 0.06);
    return `<g transform="${transform}"><circle cx="0" cy="0" r="${(
      size / 2
    ).toFixed(2)}" fill="none" stroke="${shape.color}" stroke-width="${strokeWidth.toFixed(
      2
    )}" /></g>`;
  }

  const height = size * 0.6;
  const strokeWidth = Math.max(6, size * 0.05);
  return `<g transform="${transform}"><rect x="${(-size / 2).toFixed(2)}" y="${(
    -height / 2
  ).toFixed(2)}" width="${size.toFixed(2)}" height="${height.toFixed(2)}" rx="${(
    size * 0.08
  ).toFixed(2)}" fill="none" stroke="${shape.color}" stroke-width="${strokeWidth.toFixed(
    2
  )}" /></g>`;
}

function buildVignetteFragment(canvasWidth: number, canvasHeight: number): string {
  return `<defs>
    <radialGradient id="vignette" cx="50%" cy="50%" r="75%">
      <stop offset="55%" stop-color="#000000" stop-opacity="0" />
      <stop offset="100%" stop-color="#000000" stop-opacity="0.55" />
    </radialGradient>
  </defs>
  <rect x="0" y="0" width="${canvasWidth}" height="${canvasHeight}" fill="url(#vignette)" />`;
}

function buildBorderFragment(color: string, canvasWidth: number, canvasHeight: number): string {
  const width = 14;
  return `<rect x="${width / 2}" y="${width / 2}" width="${canvasWidth - width}" height="${
    canvasHeight - width
  }" fill="none" stroke="${color}" stroke-width="${width}" />`;
}

// Combines the vignette, every shape and every text layer into one overlay
// SVG (shapes under text, vignette under everything) so they composite
// onto the photo in a single pass.
function buildContentSvg(
  font: opentype.Font,
  textLayers: TextLayerInput[],
  shapes: ShapeInput[],
  vignette: boolean,
  canvasWidth: number,
  canvasHeight: number
): string {
  const shapeMarkup = shapes.map((s) => buildShapeFragment(s, canvasWidth, canvasHeight)).join("");
  let defs = "";
  let textMarkup = "";
  textLayers.forEach((layer, i) => {
    const { defs: layerDefs, markup } = buildTextLayerFragment(font, layer, i, canvasWidth, canvasHeight);
    defs += layerDefs;
    textMarkup += markup;
  });

  return `<svg width="${canvasWidth}" height="${canvasHeight}" xmlns="http://www.w3.org/2000/svg">
    <defs>${defs}</defs>
    ${vignette ? buildVignetteFragment(canvasWidth, canvasHeight) : ""}
    ${shapeMarkup}
    ${textMarkup}
  </svg>`;
}

function buildBorderSvg(color: string, canvasWidth: number, canvasHeight: number): string {
  return `<svg width="${canvasWidth}" height="${canvasHeight}" xmlns="http://www.w3.org/2000/svg">${buildBorderFragment(
    color,
    canvasWidth,
    canvasHeight
  )}</svg>`;
}

// Blends a preset's filter strength between neutral (0, photo untouched)
// and the preset's full effect (1), so the intensity slider in the UI can
// dial a style up or down instead of it being all-or-nothing. Fine
// brightness/contrast/saturation nudges (each -50..50, from the "advanced
// adjustments" sliders) are then layered on top for manual color grading.
function scalePresetIntensity(
  preset: Preset,
  t: number,
  fineBrightness: number,
  fineContrast: number,
  fineSaturation: number
) {
  const base = {
    brightness: 1 + (preset.brightness - 1) * t,
    saturation: 1 + (preset.saturation - 1) * t,
    contrastA: 1 + (preset.contrastA - 1) * t,
    contrastB: preset.contrastB * t,
  };
  return {
    brightness: base.brightness * (1 + fineBrightness / 100),
    saturation: base.saturation * (1 + fineSaturation / 100),
    contrastA: base.contrastA * (1 + fineContrast / 100),
    contrastB: base.contrastB,
  };
}

// gpt-image-1 only accepts 1024x1024, 1024x1536 or 1536x1024 as an output
// size — never our thumbnail's actual target dimensions, and (crucially)
// never whatever arbitrary aspect ratio the user's uploaded photo happens
// to be (4:3, 9:16 phone photos are the common case). When input and
// requested output aspect ratios differ, OpenAI has to reconcile them
// somehow before generating — and our face mask, built in the *original*
// photo's pixel coordinates, has no guarantee of landing in the same place
// once OpenAI does that. Cropping and resizing to the exact target size
// ourselves, centered on the face the user marked, removes that ambiguity
// entirely: the image we send already matches `size`, so nothing needs
// reconciling, and we can remap the face zone into the new frame with
// simple pixel math instead of hoping OpenAI's internal handling matches
// our assumptions.
//
// Which of the three fixed sizes to request depends on the *target output
// format* the user picked (16:9 YouTube vs. 9:16 Shorts/TikTok/Stories vs.
// 1:1 Instagram, etc.) — landscape formats get the landscape bucket,
// portrait formats the portrait bucket, everything close to square gets
// the square bucket. This keeps the final face-centered crop (down to the
// exact target canvas) as tight as possible instead of always cropping a
// fixed 3:2 image regardless of what shape was actually requested.
interface OpenAiImageSize {
  width: number;
  height: number;
  size: "1024x1024" | "1024x1536" | "1536x1024";
}

function pickOpenAiSize(targetWidth: number, targetHeight: number): OpenAiImageSize {
  const aspect = targetWidth / targetHeight;
  if (aspect > 1.15) return { width: 1536, height: 1024, size: "1536x1024" };
  if (aspect < 0.87) return { width: 1024, height: 1536, size: "1024x1536" };
  return { width: 1024, height: 1024, size: "1024x1024" };
}

async function prepareAiInput(
  input: Buffer,
  facePreserve: FacePreserve | null,
  aiOutputWidth: number,
  aiOutputHeight: number
): Promise<{ buffer: Buffer; face: FacePreserve | null }> {
  const meta = await sharp(input).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) return { buffer: input, face: facePreserve };

  const targetAspect = aiOutputWidth / aiOutputHeight;
  const currentAspect = width / height;

  let cropWidth = width;
  let cropHeight = height;
  if (currentAspect > targetAspect) {
    cropWidth = Math.round(height * targetAspect);
  } else if (currentAspect < targetAspect) {
    cropHeight = Math.round(width / targetAspect);
  }

  // Center the crop on the marked face when we have one, clamped so the
  // crop window never runs outside the actual photo.
  const faceCx = facePreserve ? facePreserve.x * width : width / 2;
  const faceCy = facePreserve ? facePreserve.y * height : height / 2;
  const cropX = Math.min(Math.max(Math.round(faceCx - cropWidth / 2), 0), width - cropWidth);
  const cropY = Math.min(Math.max(Math.round(faceCy - cropHeight / 2), 0), height - cropHeight);

  const needsCrop = cropWidth !== width || cropHeight !== height;
  const pipeline = needsCrop
    ? sharp(input).extract({ left: cropX, top: cropY, width: cropWidth, height: cropHeight })
    : sharp(input);
  const buffer = await pipeline
    .resize(aiOutputWidth, aiOutputHeight, { fit: "fill" })
    .png()
    .toBuffer();

  if (!facePreserve) return { buffer, face: null };

  const scaleX = aiOutputWidth / cropWidth;
  const scaleY = aiOutputHeight / cropHeight;
  const cxOrig = facePreserve.x * width;
  const cyOrig = facePreserve.y * height;
  const rxOrig = FACE_ZONE_BASE_RX * facePreserve.sizeX * width;
  const ryOrig = FACE_ZONE_BASE_RY * facePreserve.sizeY * height;

  const face: FacePreserve = {
    x: ((cxOrig - cropX) * scaleX) / aiOutputWidth,
    y: ((cyOrig - cropY) * scaleY) / aiOutputHeight,
    sizeX: (rxOrig * scaleX) / (FACE_ZONE_BASE_RX * aiOutputWidth),
    sizeY: (ryOrig * scaleY) / (FACE_ZONE_BASE_RY * aiOutputHeight),
  };
  return { buffer, face };
}

// The AI output (one of OpenAI's three fixed sizes, see pickOpenAiSize) has
// to be cropped down to the thumbnail's actual target canvas — a real crop,
// not just a resize, since the aspect ratios can differ. Sharp's
// `position: "attention"` (content-based
// auto-crop) has no idea where the face mask we sent OpenAI actually was,
// so it can just as easily crop the subject's face itself off-frame or
// push it awkwardly off-center — this was a real, reproducible cause of
// disappointing results even when the AI generation itself was good. When
// we know exactly where the face sits in *this* buffer (a fresh generation
// this request — see the `hasCachedAiBase` guard at the call site, since a
// cached base's face position can't be trusted the same way), crop
// centered on it directly instead.
async function resizeCoverCenteredOnFace(
  buffer: Buffer,
  width: number,
  height: number,
  face: FacePreserve | null
): Promise<ReturnType<typeof sharp>> {
  if (!face) {
    return sharp(buffer).resize(width, height, { fit: "cover", position: "attention" });
  }

  const meta = await sharp(buffer).metadata();
  const srcWidth = meta.width ?? width;
  const srcHeight = meta.height ?? height;
  const targetAspect = width / height;
  const srcAspect = srcWidth / srcHeight;

  let cropWidth = srcWidth;
  let cropHeight = srcHeight;
  if (srcAspect > targetAspect) {
    cropWidth = Math.round(srcHeight * targetAspect);
  } else if (srcAspect < targetAspect) {
    cropHeight = Math.round(srcWidth / targetAspect);
  }

  const faceCx = face.x * srcWidth;
  const faceCy = face.y * srcHeight;
  const cropX = Math.min(Math.max(Math.round(faceCx - cropWidth / 2), 0), srcWidth - cropWidth);
  const cropY = Math.min(Math.max(Math.round(faceCy - cropHeight / 2), 0), srcHeight - cropHeight);

  const needsCrop = cropWidth !== srcWidth || cropHeight !== srcHeight;
  const pipeline = needsCrop
    ? sharp(buffer).extract({ left: cropX, top: cropY, width: cropWidth, height: cropHeight })
    : sharp(buffer);
  return pipeline.resize(width, height, { fit: "fill" });
}

// Calls OpenAI's image editing model to actually regenerate the photo's
// lighting/atmosphere/background per the preset's prompt — a real
// generative transformation, not a deterministic color filter. Optional
// reference images can be supplied so the user can ask for specific
// elements from them (e.g. "add the logo from this image").
async function applyAiEnhancement(
  inputBuffer: Buffer,
  preset: Preset,
  userDescription: string,
  references: { buffer: Buffer }[],
  facePreserve: FacePreserve | null,
  targetWidth: number,
  targetHeight: number,
  signal?: AbortSignal
): Promise<{ buffer: Buffer; face: FacePreserve | null }> {
  const openai = getOpenAI();
  if (!openai) {
    throw new AiNotConfiguredError();
  }

  // Always re-encode to real PNG bytes before sending to OpenAI, regardless
  // of the source format. Two real bugs otherwise: (1) the filename was
  // hardcoded to "photo.png" while the declared content-type followed
  // whatever the browser reported (jpeg, webp...) — a mismatch some clients
  // reject outright; (2) formats OpenAI doesn't accept at all (HEIC/HEIF,
  // the default on iPhone camera rolls) would get forwarded as-is and
  // rejected with a generic "invalid image file" error. sharp can decode
  // all of these and re-encode to a guaranteed-valid PNG.
  let normalizedInput: Buffer;
  try {
    normalizedInput = await sharp(inputBuffer).png().toBuffer();
  } catch {
    throw new Error(
      "Cette photo n'a pas pu être lue par le serveur. Essaie de la réexporter en JPEG ou PNG."
    );
  }

  // Which fixed OpenAI size to request depends on the target output format
  // (landscape/portrait/square) — see pickOpenAiSize.
  const aiSize = pickOpenAiSize(targetWidth, targetHeight);

  // Crop/resize to exactly match the size we're about to request from
  // OpenAI (see prepareAiInput above) — the face zone comes back remapped
  // into this same frame, so the mask we build from it is guaranteed to
  // line up with what OpenAI actually receives, regardless of the photo's
  // original aspect ratio.
  const { buffer: aiReadyInput, face: mappedFace } = await prepareAiInput(
    normalizedInput,
    facePreserve,
    aiSize.width,
    aiSize.height
  );

  const uploadable = await toFile(aiReadyInput, "photo.png", { type: "image/png" });

  const images = [uploadable];
  let referenceNote = "";
  if (references.length > 0) {
    for (let i = 0; i < references.length; i++) {
      let normalizedRef: Buffer;
      try {
        normalizedRef = await sharp(references[i].buffer).png().toBuffer();
      } catch {
        continue;
      }
      images.push(await toFile(normalizedRef, `reference-${i}.png`, { type: "image/png" }));
    }
    referenceNote =
      ` ${references.length} additional reference image(s) are also provided — use them only for the specific elements the user describes below (e.g. a logo, an object, a color palette), and blend them naturally into the main photo. Do not otherwise let a reference image replace the main subject.`;
  }

  // Hard pixel-level guarantee on top of the prompt instructions: the mask's
  // opaque zone over the face is preserved byte-for-byte by OpenAI, it
  // cannot be regenerated no matter what the rest of the prompt asks for.
  // Built from aiReadyInput/mappedFace, not the original photo/facePreserve
  // — see prepareAiInput for why that distinction matters.
  let maskUploadable: Awaited<ReturnType<typeof toFile>> | undefined;
  if (mappedFace) {
    const maskBuffer = await buildFaceMask(aiSize.width, aiSize.height, mappedFace);
    maskUploadable = await toFile(maskBuffer, "face-mask.png", { type: "image/png" });
  }

  const faceLockNote = maskUploadable
    ? " The subject's face is protected by an edit mask and cannot be altered at all by you — put all of your creative effort into the background, lighting, decor and atmosphere around them instead."
    : "";

  const basePrompt = `${preset.aiPrompt} ${AI_QUALITY_DIRECTIVE}`;
  const prompt = userDescription.trim()
    ? `${basePrompt}${faceLockNote}${referenceNote} Also incorporate these specific instructions from the user: ${userDescription.trim()}`
    : `${basePrompt}${faceLockNote}${referenceNote}`;

  const result = await openai.images.edit(
    {
      model: "gpt-image-1",
      image: images.length > 1 ? images : images[0],
      ...(maskUploadable ? { mask: maskUploadable } : {}),
      prompt,
      size: aiSize.size,
      quality: "high",
      // Defaults to "low" — tells the model to spend real effort matching the
      // input's facial features instead of loosely reinterpreting them. Kept
      // even with a mask: it also governs fidelity right at the mask's edge
      // (hair, ears) where the model still has creative freedom.
      input_fidelity: "high",
    },
    { signal }
  );

  const b64 = result.data?.[0]?.b64_json;
  if (!b64) {
    throw new Error("OpenAI n'a renvoyé aucune image.");
  }
  return { buffer: Buffer.from(b64, "base64"), face: mappedFace };
}

// Gemini's image model (gemini-2.5-flash-image, aka "Nano Banana") does
// real conversational editing from the reference photo + a text
// instruction — no separate alpha-mask parameter like OpenAI's images.edit,
// so face preservation here relies entirely on the prompt's explicit
// face-lock instruction rather than a pixel-level guarantee. Verified
// against real photos to hold up reliably in practice, which is the reason
// this provider was added: gpt-image-1's face fidelity kept disappointing
// even with the pixel mask, while Gemini's built-in identity preservation
// from the instruction alone tested consistently stronger.
async function applyGeminiEnhancement(
  inputBuffer: Buffer,
  preset: Preset,
  userDescription: string,
  references: { buffer: Buffer }[],
  facePreserve: FacePreserve | null,
  signal?: AbortSignal
): Promise<{ buffer: Buffer; face: FacePreserve | null }> {
  let normalizedInput: Buffer;
  try {
    normalizedInput = await sharp(inputBuffer).png().toBuffer();
  } catch {
    throw new Error(
      "Cette photo n'a pas pu être lue par le serveur. Essaie de la réexporter en JPEG ou PNG."
    );
  }

  const images: { buffer: Buffer }[] = [{ buffer: normalizedInput }];
  let referenceNote = "";
  if (references.length > 0) {
    for (const ref of references) {
      try {
        images.push({ buffer: await sharp(ref.buffer).png().toBuffer() });
      } catch {
        continue;
      }
    }
    referenceNote =
      ` ${references.length} additional reference image(s) are also provided — use them only for the specific elements the user describes below (e.g. a logo, an object, a color palette), and blend them naturally into the main photo. Do not otherwise let a reference image replace the main subject.`;
  }

  // Locks identity, not the whole photo: an earlier version also froze
  // expression/pose/clothing ("same expression... do not alter their face
  // in any way"), which made Gemini paste the source photo back almost
  // unchanged — including framing gpt-image-1 used to freely restage. The
  // actual goal is that the person stays recognizably themselves while the
  // model is free to reinterpret expression, pose and outfit for the scene.
  const faceLockNote =
    " Keep this exact person's facial identity clearly recognizable — same face shape, eyes, nose, mouth and skin tone as in the reference photo, not a different-looking person. Within that constraint, feel free to adjust their expression, pose, angle and clothing to naturally fit the requested scene and mood. Do not beautify or idealize their face into a generic-looking person.";

  const basePrompt = `${preset.aiPrompt} ${AI_QUALITY_DIRECTIVE}${faceLockNote}${referenceNote}`;
  const prompt = userDescription.trim()
    ? `${basePrompt} Also incorporate these specific instructions from the user: ${userDescription.trim()}`
    : basePrompt;

  const buffer = await editImageWithGemini(images, prompt, signal);
  // Unlike OpenAI, nothing here forces the output into a fixed frame that
  // needs the face zone remapped (see prepareAiInput) — Gemini preserves
  // the input's overall framing closely in practice, so the *original*
  // normalized facePreserve position (fraction of width/height, resolution
  // independent) still lands close to correct on the output. Passing it
  // through — rather than null — is what the final face-centered crop
  // needs: without it, a visually busy background (a black hole, a
  // cityscape...) can pull sharp's "attention" auto-crop away from the
  // face entirely, cropping it almost out of frame even though the
  // generation itself was fine. It's an approximation, not the pixel
  // guarantee OpenAI's mask gives, but reliably closer than no position
  // at all.
  return { buffer, face: facePreserve };
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

// Parses and validates the JSON-encoded text layer / shape arrays sent
// from the client — never trust their contents blindly, every field is
// clamped or falls back to a safe default.
function parseTextLayers(raw: string, preset: Preset): TextLayerInput[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  return parsed.slice(0, MAX_TEXT_LAYERS).map((item) => {
    const obj = (item ?? {}) as Record<string, unknown>;
    const bg = String(obj.backgroundStyle ?? "panel");
    return {
      text: String(obj.text ?? "").slice(0, 120),
      color: isValidHexColor(obj.color) ? obj.color : preset.textColor,
      strokeColor: isValidHexColor(obj.strokeColor) ? obj.strokeColor : preset.strokeColor,
      backgroundStyle: (["panel", "shadow", "none"].includes(bg) ? bg : "panel") as BackgroundStyle,
      x: clampNumber(obj.x, 0.05, 0.95, 0.5),
      y: clampNumber(obj.y, 0.08, 0.95, 0.85),
      curve: clampNumber(obj.curve, -100, 100, 0),
      fontSize: clampNumber(obj.fontSize, 28, 160, 88),
    };
  });
}

function parseShapes(raw: string): ShapeInput[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  return parsed.slice(0, MAX_SHAPES).map((item) => {
    const obj = (item ?? {}) as Record<string, unknown>;
    const type = String(obj.type ?? "arrow");
    return {
      type: (["arrow", "circle", "rectangle"].includes(type) ? type : "arrow") as ShapeType,
      color: isValidHexColor(obj.color) ? obj.color : "#FFE000",
      x: clampNumber(obj.x, 0.05, 0.95, 0.5),
      y: clampNumber(obj.y, 0.05, 0.95, 0.5),
      size: clampNumber(obj.size, 0.05, 0.6, 0.2),
      rotation: clampNumber(obj.rotation, -180, 180, 0),
    };
  });
}

export async function POST(req: NextRequest) {
  // Checked before the multipart body is even parsed — otherwise an
  // unauthenticated flood could still force the server to decode up to
  // ~48MB of uploaded images per request (main photo + 3 references)
  // before the auth check below ever rejects it.
  if (isRateLimited(`generate:${getClientIp(req)}`, 20, 5 * 60 * 1000)) {
    return NextResponse.json(
      { error: "Trop de requêtes. Réessaie dans quelques minutes." },
      { status: 429 }
    );
  }

  const admin = getSupabaseAdmin();
  let authUser: { id: string; email: string | null } | null = null;
  let reservation: string | null = null;

  // Releases an atomically-reserved credits spend if the generation ends up
  // failing after the reservation was made — otherwise a failed AI call
  // would still cost the user their trial or credits for nothing.
  async function releaseReservationIfNeeded() {
    if (!reservation || !admin || !authUser) return;
    if (reservation !== "ok_trial" && reservation !== "ok_credits") return;
    try {
      await admin.rpc("release_credits_reservation", {
        p_user_id: authUser.id,
        p_reservation: reservation,
        p_cost: GENERATION_CREDIT_COST,
      });
    } catch (err) {
      console.error("release_credits_reservation error", err);
    }
  }

  try {
    const formData = await req.formData();
    const file = formData.get("image");
    const presetId = String(formData.get("presetId") ?? "bold-impact");
    const aiEnhance = String(formData.get("aiEnhance") ?? "false") === "true";
    const aiDescription = String(formData.get("aiDescription") ?? "").slice(0, 3000);
    const editInstruction = String(formData.get("editInstruction") ?? "").trim().slice(0, 300);
    const intensity = clampNumber(formData.get("intensity"), 0, 100, 100);
    const fineBrightness = clampNumber(formData.get("fineBrightness"), -50, 50, 0);
    const fineContrast = clampNumber(formData.get("fineContrast"), -50, 50, 0);
    const fineSaturation = clampNumber(formData.get("fineSaturation"), -50, 50, 0);
    const vignette = String(formData.get("vignette") ?? "false") === "true";
    const borderEnabled = String(formData.get("border") ?? "false") === "true";
    const borderColorRaw = formData.get("borderColor");
    const borderColor = isValidHexColor(borderColorRaw) ? borderColorRaw : "#FFE000";

    const preset = getPreset(presetId);
    const format = getFormat(String(formData.get("format") ?? ""));
    const canvasWidth = format.width;
    const canvasHeight = format.height;
    const resolutionRaw = formData.get("resolution");
    const resolutionTier = isResolutionTier(resolutionRaw) ? resolutionRaw : "1k";
    const resolutionMultiplier = RESOLUTION_MULTIPLIERS[resolutionTier];
    const textLayers = parseTextLayers(String(formData.get("textLayers") ?? "[]"), preset);
    const shapes = parseShapes(String(formData.get("shapes") ?? "[]"));
    const facePreserve = parseFacePreserve(formData.get("facePreserve"));
    const editZone = parseEditZone(formData.get("editZone"));

    const referenceFiles = formData
      .getAll("referenceImages")
      .filter((f): f is File => f instanceof File)
      .slice(0, MAX_REFERENCE_IMAGES);

    // Reusing a cached AI base (see below) to only re-composite text/colors/
    // shapes is free — it never calls OpenAI again. Except a targeted edit
    // (editZone + instruction) always makes a real, separate paid call even
    // on top of a cached base. This — not the raw aiEnhance flag — is what
    // should actually be charged against the quota below: charging on raw
    // aiEnhance would both bill paid users for free cache-only retouches and
    // let a free-trial user dodge the paywall entirely by sending a
    // fabricated aiBaseImage to skip the real generation.
    const cachedAiBaseField = formData.get("aiBaseImage");
    const hasCachedAiBase = cachedAiBaseField instanceof File;
    const willCallOpenAi = aiEnhance && (!hasCachedAiBase || Boolean(editZone && editInstruction));

    // Validate the request shape before touching the database — a
    // malformed request shouldn't consume a quota reservation.
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Aucune image reçue." }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: "Image trop lourde (12 Mo max)." },
        { status: 400 }
      );
    }
    for (const ref of referenceFiles) {
      if (ref.size > MAX_UPLOAD_BYTES) {
        return NextResponse.json(
          { error: "Une image de référence est trop lourde (12 Mo max)." },
          { status: 400 }
        );
      }
    }
    // Vrai paywall : aucune génération (filtre ou IA) sans compte connecté
    // avec un abonnement actif — plus d'essai gratuit ni de simulation
    // côté client. Le plan et le quota ne sont jamais lus ailleurs que dans
    // la ligne Supabase de l'utilisateur, jamais depuis une valeur envoyée
    // par le navigateur. La réservation du quota (reserve_generation) est
    // atomique côté base — un verrou de ligne empêche des requêtes
    // concurrentes de dépasser le quota en lisant toutes le même compteur
    // avant qu'aucune d'elles ne l'ait incrémenté.
    let profile: Profile | null = null;
    let effectiveWatermark = false;

    if (!admin) {
      return NextResponse.json(
        { error: "Connecte-toi et choisis un plan pour créer une miniature." },
        { status: 401 }
      );
    }
    authUser = await getUserFromAuthHeader(req.headers.get("authorization"));
    if (!authUser) {
      return NextResponse.json(
        { error: "Connecte-toi et choisis un plan pour créer une miniature." },
        { status: 401 }
      );
    }

    {
      const { data } = await admin
        .from("profiles")
        .select("*")
        .eq("id", authUser.id)
        .single();
      profile = (data as Profile | null) ?? null;

      if (!profile) {
        return NextResponse.json(
          { error: "Profil introuvable. Déconnecte-toi puis reconnecte-toi." },
          { status: 401 }
        );
      }

      // Compte propriétaire du site — accès illimité, sans passer par
      // Stripe. Ne modifie pas la ligne réelle en base : seul le comptage
      // de la réservation ci-dessous change, en bypassant complètement le
      // débit de crédits.
      const isOwnerAccount = authUser.email?.toLowerCase() === "mathis.ferry76@gmail.com";

      // Les styles filtres (sans IA) sont gratuits et illimités pour tout
      // compte connecté — coût serveur négligeable, et ça sert de porte
      // d'entrée vers l'achat de crédits pour l'IA générative, qui elle
      // coûte réellement à chaque appel et débite donc le solde prépayé.
      if (willCallOpenAi) {
        const { data: reserved, error: reserveError } = await admin.rpc("reserve_credits", {
          p_user_id: authUser.id,
          p_cost: GENERATION_CREDIT_COST,
          p_force_paid: isOwnerAccount,
        });

        if (reserveError) {
          console.error("reserve_credits error", reserveError);
          return NextResponse.json(
            { error: "Erreur pendant la vérification des crédits." },
            { status: 500 }
          );
        }

        reservation = reserved as string;

        if (reservation === "insufficient_credits") {
          return NextResponse.json(
            {
              error: `Crédits insuffisants (il faut ${GENERATION_CREDIT_COST} crédits). Achète un pack sur /pricing pour continuer.`,
            },
            { status: 403 }
          );
        }
        if (reservation === "ok_trial") {
          effectiveWatermark = true;
        }
      }
    }

    const font = await loadFont();
    const arrayBuffer = await file.arrayBuffer();
    const inputBuffer = Buffer.from(arrayBuffer);

    let base: ReturnType<typeof sharp>;
    let aiBaseForResponse: Buffer | null = null;
    let usedOpenAiCall = false;

    if (aiEnhance) {
      // If the client already has the AI-generated base from a previous
      // call for these exact AI inputs (same photo/preset/description/
      // references/face zone), it sends it back here instead of the raw
      // photo — lets the user retouch text, colors, shapes etc. for free
      // and instantly, without paying for a new OpenAI generation.
      let aiBuffer: Buffer;
      // The face zone the user marked is in the *original* photo's
      // coordinates. A fresh generation remaps it into the cropped/resized
      // frame actually sent to OpenAI (see prepareAiInput) and we reuse
      // that remapped version below for the targeted-edit mask too, so it
      // stays aligned with the real pixels in aiBuffer. On a cache hit we
      // don't have the original photo to redo that math (the client sends
      // a placeholder instead) — same known limitation as before this fix,
      // just no longer masking the wrong region on top of it.
      let faceForEdits = facePreserve;
      if (hasCachedAiBase) {
        aiBuffer = Buffer.from(await (cachedAiBaseField as File).arrayBuffer());
      } else {
        const references: { buffer: Buffer }[] = [];
        for (const ref of referenceFiles) {
          references.push({ buffer: Buffer.from(await ref.arrayBuffer()) });
        }
        // Gemini's identity preservation from the prompt alone tested more
        // reliable than gpt-image-1's pixel mask in practice, so it's the
        // preferred provider whenever configured — OpenAI stays as the
        // fallback (and is still what powers the targeted-edit feature
        // below, regardless of which provider produced this base image).
        const useGemini = Boolean(getGeminiKey());
        try {
          if (useGemini) {
            const enhanced = await applyGeminiEnhancement(
              inputBuffer,
              preset,
              aiDescription,
              references,
              facePreserve,
              req.signal
            );
            aiBuffer = enhanced.buffer;
            faceForEdits = enhanced.face;
          } else {
            const enhanced = await applyAiEnhancement(
              inputBuffer,
              preset,
              aiDescription,
              references,
              facePreserve,
              canvasWidth,
              canvasHeight,
              req.signal
            );
            aiBuffer = enhanced.buffer;
            faceForEdits = enhanced.face;
          }
          usedOpenAiCall = true;
        } catch (err) {
          // Refunds the reservation whether the call genuinely failed or the
          // client cancelled (see the Annuler button in the UI) — either
          // way no generation was delivered. req.signal was threaded into
          // the OpenAI/Gemini call above too, so cancelling also aborts the
          // actual outbound request instead of letting it finish uselessly.
          await releaseReservationIfNeeded();
          if (req.signal.aborted) {
            return NextResponse.json({ error: "Génération annulée." }, { status: 499 });
          }
          if (err instanceof AiNotConfiguredError) {
            return NextResponse.json({ error: err.message }, { status: 501 });
          }
          console.error(useGemini ? "gemini enhancement error" : "openai enhancement error", err);
          return NextResponse.json(
            { error: useGemini || err instanceof GeminiApiError ? describeGeminiError(err) : describeAiError(err) },
            { status: 502 }
          );
        }
      }

      // A "zone à retoucher" + instruction always triggers a real, targeted
      // second call — a deliberate local fix (tone this down, move that
      // over), scoped to just that region, on top of whichever base image
      // we ended up with above (fresh or cached).
      if (editZone && editInstruction) {
        try {
          aiBuffer = await applyTargetedEdit(aiBuffer, editInstruction, editZone, faceForEdits, req.signal);
          usedOpenAiCall = true;
        } catch (err) {
          await releaseReservationIfNeeded();
          if (req.signal.aborted) {
            return NextResponse.json({ error: "Génération annulée." }, { status: 499 });
          }
          if (err instanceof AiNotConfiguredError) {
            return NextResponse.json({ error: err.message }, { status: 501 });
          }
          console.error("openai targeted edit error", err);
          return NextResponse.json(
            { error: describeAiError(err) },
            { status: 502 }
          );
        }
      }

      aiBaseForResponse = aiBuffer;
      const fine = fineOnlyAdjustments(fineBrightness, fineContrast, fineSaturation);
      // Only trust faceForEdits for this crop when aiBuffer was actually
      // generated fresh this request — on a cache hit it's still in the
      // *original* photo's coordinate frame, not this buffer's (see the
      // comment above `faceForEdits`), so it would crop the wrong region.
      const knownFaceForCrop = hasCachedAiBase ? null : faceForEdits;
      base = (
        await resizeCoverCenteredOnFace(aiBuffer, canvasWidth, canvasHeight, knownFaceForCrop)
      )
        .modulate({ brightness: fine.brightness, saturation: fine.saturation })
        .linear(fine.contrastA, fine.contrastB)
        // OpenAI's output is already crisp — the default sharpen() strength
        // (tuned for softening from JPEG-compressed phone photos in the
        // filter-only branch below) over-sharpens fine texture here
        // (rock, foliage) into a noisy/pixelated look.
        .sharpen({ sigma: 0.5 });
    } else {
      const scaled = scalePresetIntensity(
        preset,
        intensity / 100,
        fineBrightness,
        fineContrast,
        fineSaturation
      );
      base = sharp(inputBuffer)
        .rotate()
        .resize(canvasWidth, canvasHeight, { fit: "cover", position: "attention" })
        .modulate({ brightness: scaled.brightness, saturation: scaled.saturation })
        .linear(scaled.contrastA, scaled.contrastB)
        .sharpen();
    }

    const overlays: OverlayOptions[] = [
      {
        input: Buffer.from(buildContentSvg(font, textLayers, shapes, vignette, canvasWidth, canvasHeight)),
        top: 0,
        left: 0,
      },
    ];

    if (borderEnabled) {
      overlays.push({
        input: Buffer.from(buildBorderSvg(borderColor, canvasWidth, canvasHeight)),
        top: 0,
        left: 0,
      });
    }

    if (effectiveWatermark) {
      overlays.push({
        input: Buffer.from(buildWatermarkSvg(font, "MIN IA — essai gratuit", canvasWidth, canvasHeight)),
        top: 0,
        left: 0,
      });
    }

    let outputBuffer = await base.composite(overlays).png().toBuffer();

    // The resolution tier is a final upscale on top of the finished
    // thumbnail (composited at the format's base "1K" dimensions above),
    // not a second, higher-detail AI generation — neither Gemini nor
    // gpt-image-1 natively renders anywhere near 4K. This delivers the
    // correct pixel dimensions platforms expect at that tier, using a
    // high-quality resize, but it cannot add real detail the AI never
    // generated in the first place.
    if (resolutionMultiplier !== 1) {
      const finalWidth = Math.round(canvasWidth * resolutionMultiplier);
      const finalHeight = Math.round(canvasHeight * resolutionMultiplier);
      outputBuffer = await sharp(outputBuffer).resize(finalWidth, finalHeight, { fit: "fill" }).png().toBuffer();
    }

    const base64 = outputBuffer.toString("base64");

    // Best-effort: save to the user's history. Quota counters were already
    // updated atomically by reserve_generation before generation started —
    // incrementing them again here would double-count. Never let a
    // storage/DB hiccup break the generation the user is actually waiting on.
    if (authUser && admin && profile) {
      try {
        const storagePath = `${authUser.id}/${randomUUID()}.png`;
        const { error: uploadError } = await admin.storage
          .from("thumbnails")
          .upload(storagePath, outputBuffer, { contentType: "image/png" });

        if (!uploadError) {
          await admin.from("generations").insert({
            user_id: authUser.id,
            storage_path: storagePath,
            preset_id: presetId,
            used_ai: usedOpenAiCall,
          });
        } else {
          console.error("history upload error", uploadError);
        }
      } catch (err) {
        console.error("history save error", err);
      }
    }

    return NextResponse.json({
      image: `data:image/png;base64,${base64}`,
      // Sent back so the client can cache it and, next time only text/
      // colors/shapes change, resend it as `aiBaseImage` instead of
      // triggering a brand new (paid) OpenAI generation.
      aiBase: aiBaseForResponse
        ? `data:image/png;base64,${aiBaseForResponse.toString("base64")}`
        : undefined,
      // Authoritative flag: did this request actually call OpenAI (fresh
      // generation and/or targeted edit)? The client uses this — not its
      // own guess — to decide whether to count against the AI quota.
      usedOpenAiCall,
    });
  } catch (err) {
    await releaseReservationIfNeeded();
    console.error("generate error", err);
    return NextResponse.json(
      { error: "Erreur pendant la génération. Réessaie avec une autre image." },
      { status: 500 }
    );
  }
}
