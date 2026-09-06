import sharp from "sharp";

// A code-level backstop against a specific, recurring failure on
// "Impressionne tes potes": FLUX Kontext occasionally returns a candidate
// that is visually indistinguishable from the input photo — no edit applied
// at all — and the LLM judge (see lib/pick-best.ts), asked to compare 5
// images against a multi-part rubric, doesn't reliably catch this simple
// case every time. This doesn't need language-model judgment — it's
// answerable by comparing pixels directly, so do that instead of relying on
// a fallible vision-model rubric for it.
//
// Resized to a small-but-not-tiny grid, then split into blocks and scored
// by the WORST block rather than a whole-image average — this is
// deliberate, not just a resolution choice, after an earlier whole-image
// mean-diff version produced false positives in production: the edited
// object (a car) only ever covers a fraction of the frame, and every
// "correct" result leaves the rest of the scene untouched by design (see
// buildImpressPrompt's scope rules in app/api/impress/route.ts) — so a
// whole-image average dilutes a real, substantial, localized change with
// all the correctly-unchanged background around it, and can end up reading
// as "basically unchanged" for exactly the results that most respect the
// framing/lighting rules. Scoring by the single worst block instead means
// one genuinely changed region is enough to register, regardless of how
// much of the rest of the frame (correctly) didn't move.
const GRID_SIZE = 64;
const BLOCK_SIZE = 8; // GRID_SIZE / BLOCK_SIZE = 8x8 blocks to score

// Mean absolute per-channel difference (0-255 scale) a block must reach to
// count as "this region actually changed". Pure re-encoding/resize noise
// between providers sits within a few levels even in the worst block; any
// real edit — a differently-shaped car, a different color, an inserted
// object — produces a far larger jump in at least the block(s) it occupies.
const CHANGED_BLOCK_THRESHOLD = 20;

async function toComparableRgb(
  image: Buffer
): Promise<{ data: Buffer; width: number; height: number; channels: number }> {
  const { data, info } = await sharp(image)
    .resize(GRID_SIZE, GRID_SIZE, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels };
}

// Returns true when `candidate` is close enough to `original` everywhere
// that no meaningful edit can have happened anywhere in the frame — the
// caller's cue to discard it before it ever reaches the LLM judge,
// regardless of what that judge would have said about it.
export async function looksUnchanged(original: Buffer, candidate: Buffer): Promise<boolean> {
  const [a, b] = await Promise.all([toComparableRgb(original), toComparableRgb(candidate)]);
  const { data: dataA, width, height, channels } = a;
  const { data: dataB } = b;

  let maxBlockMeanDiff = 0;
  for (let blockY = 0; blockY < height; blockY += BLOCK_SIZE) {
    for (let blockX = 0; blockX < width; blockX += BLOCK_SIZE) {
      let sum = 0;
      let count = 0;
      for (let y = blockY; y < blockY + BLOCK_SIZE && y < height; y++) {
        for (let x = blockX; x < blockX + BLOCK_SIZE && x < width; x++) {
          const idx = (y * width + x) * channels;
          for (let c = 0; c < channels; c++) {
            sum += Math.abs(dataA[idx + c] - dataB[idx + c]);
            count++;
          }
        }
      }
      const blockMeanDiff = sum / count;
      if (blockMeanDiff > maxBlockMeanDiff) maxBlockMeanDiff = blockMeanDiff;
    }
  }

  return maxBlockMeanDiff < CHANGED_BLOCK_THRESHOLD;
}
