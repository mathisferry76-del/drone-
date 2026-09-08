import { execFile } from "child_process";
import { promisify } from "util";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import ffmpegPath from "@ffmpeg-installer/ffmpeg";

const execFileAsync = promisify(execFile);

// Veo 3.1's image-to-video mode only ever renders 16:9 internally, with no
// way to request a real 9:16 output (see app/api/animate/route.ts and
// lib/fal-video.ts/lib/replicate-video.ts for the full story — it's a
// documented Google-side limitation, not something fixable by changing
// what we send the provider). For anyone who specifically wants a portrait
// clip (e.g. for a Story), the only way to get one is to reframe the real
// 16:9 output ourselves after generation.
//
// This used to do a hard center crop (keep only the middle ~32% of the
// width), which is mathematically guaranteed to cut off part of a subject
// that spans much of the 16:9 frame — confirmed in production: a car
// filling most of the width came back with its front or rear end sliced
// off no matter how well-framed the source clip was, since that's just
// what discarding two-thirds of the width does. Switched to a scale-and-
// pad composite instead (the same technique Instagram/TikTok's own
// "fit to story" option uses for landscape footage): the full frame is
// scaled down to fit the 1080-wide portrait canvas with nothing cut off,
// centered vertically, with the remaining top/bottom space filled by a
// blurred, scaled-up copy of the same frame instead of solid black bars —
// fills the whole screen without ever losing part of the subject.
//
// A close-up source crop (e.g. a car's rear bumper filling most of the
// 16:9 width) leaves a lot of top/bottom canvas to fill, and a light blur
// wasn't enough to hide what's back there: a plate or badge in that
// region stayed just barely recognizable as a second, warped copy of
// itself behind the sharp one — reads as a glitch, not a backdrop.
// Stronger blur plus more darkening and desaturation pushes it past the
// point where any text/logo shape survives, while still tracking the
// clip's real colors instead of going flat black.
export async function fitVideoToPortrait(video: Buffer): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), "video-portrait-"));
  const inputPath = join(dir, "input.mp4");
  const outputPath = join(dir, "output.mp4");

  try {
    await writeFile(inputPath, video);

    await execFileAsync(ffmpegPath.path, [
      "-y",
      "-i",
      inputPath,
      "-filter_complex",
      "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,gblur=sigma=60,eq=brightness=-0.2:saturation=0.5[bg];" +
        "[0:v]scale=1080:-2[fg];" +
        "[bg][fg]overlay=(W-w)/2:(H-h)/2:eof_action=repeat[outv]",
      "-map",
      "[outv]",
      "-map",
      "0:a?",
      "-c:a",
      "copy",
      outputPath,
    ]);

    return await readFile(outputPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
