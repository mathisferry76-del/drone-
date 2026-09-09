import { execFile } from "child_process";
import { promisify } from "util";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import ffmpegPath from "@ffmpeg-installer/ffmpeg";

const execFileAsync = promisify(execFile);

// A raw phone-shot video handed straight to a video-understanding model
// routinely fails in ways that have nothing to do with its actual content —
// this exact class of failure (cryptic model-side "Bad Request"/parsing
// errors) was already root-caused, one real cause at a time, on a different
// video-editing integration this session (the now-removed Runway Aleph
// feature): a 60fps source rejected outright (Aleph's documented 30fps
// cap), rotation stored as separate container metadata instead of baked
// into the pixels (confused a resolution parser expecting a plain "WxH"),
// and a non-standard pixel format/codec. Seedance 2.5's reference_videos
// input hit an equally opaque "Bad Request" in production with zero
// detail — normalizing defensively up front, the same way that was
// eventually necessary for Aleph, is a better first move than guessing at
// one undocumented constraint at a time from a blank error message.
//
// -map_metadata -1 strips container/stream metadata (incl. any rotation
// tag), the scale+fps filtergraph physically bakes rotation into the
// output pixels and caps both dimensions and frame rate to broadly
// supported values, -pix_fmt yuv420p avoids 10-bit/4:2:2 variants some
// phones default to, and re-encoding to libx264/aac in a plain mp4
// guards against an HEVC/ProRes source a Cog-based model may not accept
// even though most video players do.
export async function normalizeVideoForSeedance(video: Buffer): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), "video-normalize-"));
  const inputPath = join(dir, "input.mp4");
  const outputPath = join(dir, "output.mp4");

  try {
    await writeFile(inputPath, video);

    await execFileAsync(ffmpegPath.path, [
      "-y",
      "-i",
      inputPath,
      "-map_metadata",
      "-1",
      "-vf",
      "fps=30,scale='min(1280,iw)':'-2'",
      "-pix_fmt",
      "yuv420p",
      "-c:v",
      "libx264",
      "-crf",
      "20",
      "-c:a",
      "aac",
      "-movflags",
      "+faststart",
      outputPath,
    ]);

    return await readFile(outputPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
