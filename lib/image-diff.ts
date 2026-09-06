import sharp from "sharp";

// A code-level backstop against a specific, recurring failure on
// "Impressionne tes potes": FLUX Kontext occasionally returns a candidate
// that is visually indistinguishable from the input photo — no edit applied
// at all — and the LLM judge (see lib/pick-best.ts), asked to compare 5
// images against a multi-part rubric, doesn't reliably catch this simple
// case every time (confirmed in production: a "remplace ma voiture par une
// Audi RS6" request came back with the literal, unedited original photo,
// twice, despite the judge's explicit instruction to reject an unchanged
// object). This doesn't need language-model judgment — it's answerable by
// comparing pixels directly, so do that instead of relying on a fallible
// vision-model rubric for it.
//
// Downsampling to a tiny, blurred thumbnail before comparing is deliberate:
// it averages away the recompression/re-encoding noise every candidate
// picks up just from round-tripping through a different image pipeline
// (PNG re-encode, possible minor resize), so only a genuine, substantial
// visual change survives to be measured — a real edit (even a small
// inserted object) still shows up at this resolution, since it occupies a
// non-trivial fraction of a 16x16 grid, while pure re-encoding noise
// averages out to near zero.
const COMPARE_SIZE = 16;

// Mean absolute per-pixel difference (0-255 scale) below which a candidate
// is treated as "no real edit happened". Calibrated to sit well above
// typical re-encoding noise (a handful of levels at most) and well below
// what any genuine edit — full replacement or a small localized addition —
// produces once averaged over a 16x16 grid.
const UNCHANGED_THRESHOLD = 6;

async function toComparableGrayscale(image: Buffer): Promise<Buffer> {
  return sharp(image)
    .resize(COMPARE_SIZE, COMPARE_SIZE, { fit: "fill" })
    .grayscale()
    .raw()
    .toBuffer();
}

// Returns true when `candidate` is close enough to `original` that no
// meaningful edit can have happened — the caller's cue to discard it before
// it ever reaches the LLM judge, regardless of what that judge would have
// said about it.
export async function looksUnchanged(original: Buffer, candidate: Buffer): Promise<boolean> {
  const [a, b] = await Promise.all([
    toComparableGrayscale(original),
    toComparableGrayscale(candidate),
  ]);

  let totalDiff = 0;
  for (let i = 0; i < a.length; i++) {
    totalDiff += Math.abs(a[i] - b[i]);
  }
  const meanDiff = totalDiff / a.length;
  return meanDiff < UNCHANGED_THRESHOLD;
}
