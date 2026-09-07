import { execFile } from "child_process";
import { promisify } from "util";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import ffmpegPath from "@ffmpeg-installer/ffmpeg";

const execFileAsync = promisify(execFile);

// Every upload is re-encoded through here before being sent to Aleph 2.0 —
// not just oversized ones — for two separate reasons found in production:
//
// 1. Runway Aleph 2.0's own hard cap on input file size is 16MB. A modern
//    phone shooting 4K/60fps or ProRes can easily produce a multi-second
//    clip well over that, for reasons that have nothing to do with how
//    long the clip is (2-4s, enforced in app/api/edit-video/route.ts) or
//    how good it needs to look at the scale Aleph analyzes it — so instead
//    of asking users to fight their camera settings, an oversized upload
//    is transparently re-encoded down.
// 2. A live test's video was accepted (past the size/duration checks) but
//    then failed inside Aleph itself with "Failed to parse video
//    resolution: too many values to unpack (expected 2)" — a classic
//    symptom of a phone video's rotation stored as separate metadata (the
//    legacy `rotate` tag, or a displaymatrix side-data entry) rather than
//    baked into the pixels, confusing a downstream parser that expects a
//    plain "WxH" string with no ambiguity between "stored" and "displayed"
//    dimensions. `-map_metadata -1` strips all of that, and ffmpeg already
//    physically applies any such rotation to the pixels themselves when a
//    filtergraph (the -vf scale below) is present — so the output's own
//    width/height always directly match what's actually visible, with
//    nothing left for any parser to misread.
// 3. A later live test failed with a genuinely precise error straight from
//    Replicate's own logs (visible on replicate.com/predictions, not
//    surfaced by our own error message): "Input video exceeds the 30fps
//    limit: source is 59.94fps. Use a source video at or below 30fps."
//    (failureCode INPUT_VALIDATION.VIDEO.UNSUPPORTED_FPS) — a modern phone
//    commonly defaults to 60fps for casual video capture, which Aleph 2.0
//    hard-rejects outright. `fps=30` in the filtergraph below forces the
//    output to 30fps regardless of the source's own frame rate.
//
// Always running this (not just when oversized) means every upload Aleph
// ever sees has the same clean, unambiguous shape — worth the modest fixed
// cost of one fast re-encode given how short these clips are capped to be.
export async function normalizeVideoForAleph(video: Buffer): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), "video-compress-"));
  const inputPath = join(dir, "input.mp4");
  const outputPath = join(dir, "output.mp4");

  try {
    await writeFile(inputPath, video);

    // Downscales only (never upscales) to a 1080p-max frame and re-encodes
    // at a moderate, broadly-compatible bitrate — for a clip this short,
    // this reliably lands at a few MB regardless of how the source was
    // shot, with no perceptible quality loss at the scale Aleph analyzes
    // anyway. fps=30 caps the frame rate at Aleph's own hard limit
    // (chained after scale in the same filtergraph, standard ffmpeg
    // syntax) — a clip already at or below 30fps passes through
    // unaffected. yuv420p is the most broadly-compatible pixel format
    // (some phones default to 10-bit/4:2:2 variants a stricter decoder can
    // choke on); +faststart is just good MP4 hygiene for anything served
    // over HTTP, unrelated to the bugs this fixes.
    await execFileAsync(ffmpegPath.path, [
      "-y",
      "-i",
      inputPath,
      "-map_metadata",
      "-1",
      "-vf",
      "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease,fps=30",
      "-pix_fmt",
      "yuv420p",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "26",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      outputPath,
    ]);

    // The caller (app/api/edit-video/route.ts) still checks the result
    // against MAX_UPLOAD_BYTES afterward and rejects it if a
    // pathologically busy clip somehow re-encodes larger than the cap —
    // vanishingly unlikely for a 2-4s clip, but not this function's job to
    // paper over.
    return await readFile(outputPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
