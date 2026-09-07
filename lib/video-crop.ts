import { execFile } from "child_process";
import { promisify } from "util";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import ffmpegPath from "@ffmpeg-installer/ffmpeg";
import ffprobePath from "@ffprobe-installer/ffprobe";

const execFileAsync = promisify(execFile);

// Veo 3.1's image-to-video mode only ever renders 16:9 internally, with no
// way to request a real 9:16 output (see app/api/animate/route.ts and
// lib/fal-video.ts/lib/replicate-video.ts for the full story — it's a
// documented Google-side limitation, not something fixable by changing
// what we send the provider). For anyone who specifically wants a portrait
// clip (e.g. for a Story), the only way to actually get one is to crop the
// real 16:9 output ourselves after generation — this loses the left/right
// edges of the frame, but produces a genuine full-height 9:16 file instead
// of the always-16:9 content letterboxed into a taller canvas that
// requesting "9:16" from the provider actually produces.
export async function cropVideoToPortrait(video: Buffer): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), "video-crop-"));
  const inputPath = join(dir, "input.mp4");
  const outputPath = join(dir, "output.mp4");

  try {
    await writeFile(inputPath, video);

    const { stdout } = await execFileAsync(ffprobePath.path, [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height",
      "-of",
      "csv=p=0",
      inputPath,
    ]);
    const [widthStr, heightStr] = stdout.trim().split(",");
    const width = Number(widthStr);
    const height = Number(heightStr);
    if (!width || !height) {
      throw new Error(`ffprobe n'a pas pu lire les dimensions de la vidéo (${stdout.trim()}).`);
    }

    // Same centered-crop math as the source photo (app/api/animate/
    // route.ts), rounded to an even number of pixels — x264's default
    // yuv420p pixel format requires even width/height, and an odd crop
    // width here would make the encode fail outright.
    let cropWidth = Math.round((height * 9) / 16 / 2) * 2;
    if (cropWidth > width) cropWidth = width % 2 === 0 ? width : width - 1;
    const left = Math.round((width - cropWidth) / 2 / 2) * 2;

    await execFileAsync(ffmpegPath.path, [
      "-y",
      "-i",
      inputPath,
      "-vf",
      `crop=${cropWidth}:${height}:${left}:0`,
      "-c:a",
      "copy",
      outputPath,
    ]);

    return await readFile(outputPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
