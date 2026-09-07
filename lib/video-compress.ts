import { execFile } from "child_process";
import { promisify } from "util";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import ffmpegPath from "@ffmpeg-installer/ffmpeg";

const execFileAsync = promisify(execFile);

// Runway Aleph 2.0's own hard cap on input file size is 16MB — a real
// provider constraint, not something raising app/api/edit-video/route.ts's
// own check would ever get around (Aleph would just reject it instead,
// with a worse error). A modern phone shooting 4K/60fps or ProRes can
// easily produce a multi-second clip well over that, for reasons that have
// nothing to do with how long the clip is or how good it needs to look —
// so instead of asking users to fight their camera settings, an oversized
// upload is transparently re-encoded down to something that comfortably
// clears the limit before it's ever sent to Aleph.
//
// Left alone entirely when already under maxBytes — re-encoding is lossy
// and pointless work for a clip that's already fine.
export async function compressVideoIfNeeded(video: Buffer, maxBytes: number): Promise<Buffer> {
  if (video.byteLength <= maxBytes) return video;

  const dir = await mkdtemp(join(tmpdir(), "video-compress-"));
  const inputPath = join(dir, "input.mp4");
  const outputPath = join(dir, "output.mp4");

  try {
    await writeFile(inputPath, video);

    // Downscales only (never upscales) to a 1080p-max frame and re-encodes
    // at a moderate, broadly-compatible bitrate — for a clip this short
    // (2-4s, enforced elsewhere in app/api/edit-video/route.ts), this
    // reliably lands at a few MB regardless of how the source was shot,
    // with no perceptible quality loss at the scale Aleph analyzes anyway.
    await execFileAsync(ffmpegPath.path, [
      "-y",
      "-i",
      inputPath,
      "-vf",
      "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease",
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
      outputPath,
    ]);

    return await readFile(outputPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
