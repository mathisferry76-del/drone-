import { execFile } from "child_process";
import { promisify } from "util";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import ffprobePath from "@ffprobe-installer/ffprobe";

const execFileAsync = promisify(execFile);

// Used to enforce a hard duration cap on video uploads before they're sent
// to Seedance 2.5's "editing" mode (app/api/video-edit/route.ts) — that
// mode bills per second of the reference video at its priciest tier
// ($0.9676/s at 720p, confirmed on Replicate's own pricing page), and its
// `duration: -1` requirement means we can't just tell the model to render
// a shorter clip than what's uploaded. Checking real duration server-side
// (not just trusting a client-reported value) is what actually bounds the
// cost per generation.
export async function getVideoDurationSeconds(video: Buffer): Promise<number> {
  const dir = await mkdtemp(join(tmpdir(), "video-probe-"));
  const inputPath = join(dir, "input.mp4");
  try {
    await writeFile(inputPath, video);
    const { stdout } = await execFileAsync(ffprobePath.path, [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      inputPath,
    ]);
    const seconds = parseFloat(stdout.trim());
    if (!Number.isFinite(seconds) || seconds <= 0) {
      throw new Error("durée introuvable");
    }
    return seconds;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// A silent source clip (no audio track at all) asked to "generate audio
// consistent with the original ambience" (generate_audio: true in
// startVideoEdit) has nothing to stay consistent with — a plausible real
// trigger for Seedance's (E006) "invalid input" rejection seen in
// production on a video-edit request, distinct from anything about the
// prompt wording (two different prompts failed identically on the same
// silent-seeming clip, while a different clip with a much bigger visual
// change succeeded). Used to fall back to generate_audio: false only when
// there's truly no source audio to anchor to.
export async function hasAudioStream(video: Buffer): Promise<boolean> {
  const dir = await mkdtemp(join(tmpdir(), "video-probe-audio-"));
  const inputPath = join(dir, "input.mp4");
  try {
    await writeFile(inputPath, video);
    const { stdout } = await execFileAsync(ffprobePath.path, [
      "-v",
      "error",
      "-select_streams",
      "a",
      "-show_entries",
      "stream=codec_type",
      "-of",
      "csv=p=0",
      inputPath,
    ]);
    return stdout.trim().length > 0;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
