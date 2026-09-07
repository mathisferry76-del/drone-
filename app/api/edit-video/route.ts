import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";
import { mkdtemp, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import ffprobePath from "@ffprobe-installer/ffprobe";
import { getReplicateKey } from "@/lib/replicate";
import { editVideoWithReplicate, describeReplicateVideoEditError } from "@/lib/replicate-video-edit";
import { VIDEO_EDIT_CREDIT_COST } from "@/lib/presets";
import { getSupabaseAdmin, getUserFromAuthHeader, Profile } from "@/lib/supabase";
import { isRateLimited, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
// Aleph 2.0 is a single, non-parallel call (no CANDIDATE_COUNT judging like
// /api/impress) but a full video-to-video edit run commonly takes well over
// a minute — same reasoning as /api/animate's maxDuration.
export const maxDuration = 300;

// Runway Aleph 2.0's own hard cap on input file size.
const MAX_UPLOAD_BYTES = 16 * 1024 * 1024;
const MAX_DESCRIPTION = 1200;
// Aleph 2.0 itself accepts 2-30s inputs, but VIDEO_EDIT_CREDIT_COST is a
// flat price calibrated for a short clip (see lib/presets.ts) — real API
// cost scales with duration, so a much longer clip would be sold under
// cost. Capped tight rather than accepting the full 30s range Aleph allows.
const MIN_DURATION_SECONDS = 2;
const MAX_DURATION_SECONDS = 4;
// Long enough that leaving the tab open for a while and coming back still
// works, without needing to revisit /historique for the same result.
const SIGNED_URL_TTL_SECONDS = 6 * 60 * 60;
// Vercel's *actual* enforced function timeout depends on the account's plan
// and dashboard/project settings, which `maxDuration` above can only ever
// request, not guarantee (same caveat as /api/impress) — if the real
// ceiling turns out lower than requested, the platform kills the function
// outright and the client gets a non-JSON error page, which crashes
// `await res.json()` client-side (confirmed in production: a real
// transformation attempt failed with the generic "le serveur a mis trop de
// temps" fallback, consistent with a platform-level kill rather than a
// clean application error). This internal deadline fires comfortably
// before that, so a slow (or genuinely too-long) transformation always
// gets a clean, specific JSON error and its in-flight Replicate call
// aborted, instead of an opaque crash. A full video-to-video edit is
// plausibly slower than Veo's image-to-video (every frame of real footage
// has to stay consistent, not just one fresh generation), which is the
// likely reason /api/animate hasn't needed this same guard yet.
const EDIT_VIDEO_DEADLINE_MS = 270_000;

const execFileAsync = promisify(execFile);

async function getVideoDurationSeconds(video: Buffer): Promise<number> {
  const dir = await mkdtemp(join(tmpdir(), "edit-video-probe-"));
  const inputPath = join(dir, "input.mp4");
  try {
    await writeFile(inputPath, video);
    const { stdout } = await execFileAsync(ffprobePath.path, [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "csv=p=0",
      inputPath,
    ]);
    const duration = Number(stdout.trim());
    if (!duration || Number.isNaN(duration)) {
      throw new Error(`ffprobe n'a pas pu lire la durée de la vidéo (${stdout.trim()}).`);
    }
    return duration;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function POST(req: NextRequest) {
  if (isRateLimited(`edit-video:${getClientIp(req)}`, 5, 10 * 60 * 1000)) {
    return NextResponse.json(
      { error: "Trop de tentatives. Réessaie dans quelques minutes." },
      { status: 429 }
    );
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: "Connecte-toi et choisis un plan pour utiliser cette fonctionnalité." },
      { status: 401 }
    );
  }

  const authUser = await getUserFromAuthHeader(req.headers.get("authorization"));
  if (!authUser) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }

  const { data } = await admin.from("profiles").select("*").eq("id", authUser.id).single();
  const profile = data as Profile | null;
  if (!profile) {
    return NextResponse.json(
      { error: "Profil introuvable. Déconnecte-toi puis reconnecte-toi." },
      { status: 401 }
    );
  }

  let reservation: string | null = null;
  async function releaseReservationIfNeeded() {
    if (!reservation) return;
    if (reservation !== "ok_trial" && reservation !== "ok_credits") return;
    try {
      await admin!.rpc("release_credits_reservation", {
        p_user_id: authUser!.id,
        p_reservation: reservation,
        p_cost: VIDEO_EDIT_CREDIT_COST,
      });
    } catch (err) {
      console.error("release_credits_reservation error", err);
    }
  }

  try {
    const formData = await req.formData();
    const file = formData.get("video");
    const description = String(formData.get("description") ?? "").trim().slice(0, MAX_DESCRIPTION);

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Aucune vidéo reçue." }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "Vidéo trop lourde (16 Mo max)." }, { status: 400 });
    }
    if (!description) {
      return NextResponse.json(
        { error: "Décris le changement que tu veux voir sur ta vidéo." },
        { status: 400 }
      );
    }

    if (!getReplicateKey()) {
      return NextResponse.json(
        { error: "Aucun fournisseur de transformation vidéo configuré (REPLICATE_API_TOKEN manquante)." },
        { status: 500 }
      );
    }

    const videoBuffer = Buffer.from(await file.arrayBuffer());

    let duration: number;
    try {
      duration = await getVideoDurationSeconds(videoBuffer);
    } catch {
      return NextResponse.json(
        { error: "Cette vidéo n'a pas pu être lue par le serveur. Essaie de la réexporter en MP4." },
        { status: 400 }
      );
    }
    if (duration < MIN_DURATION_SECONDS || duration > MAX_DURATION_SECONDS) {
      return NextResponse.json(
        {
          error: `La vidéo doit durer entre ${MIN_DURATION_SECONDS} et ${MAX_DURATION_SECONDS} secondes (${duration.toFixed(
            1
          )}s reçues). Recadre ta vidéo et réessaie.`,
        },
        { status: 400 }
      );
    }

    // Real credit reservation, no owner bypass — same deliberate choice as
    // /api/animate: this feature's real paid flow gets validated for every
    // account, owner included.
    const { data: reserved, error: reserveError } = await admin.rpc("reserve_credits", {
      p_user_id: authUser.id,
      p_cost: VIDEO_EDIT_CREDIT_COST,
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
          error: `Crédits insuffisants (il faut ${VIDEO_EDIT_CREDIT_COST} crédits pour transformer une vidéo). Achète un pack sur /pricing pour continuer.`,
        },
        { status: 403 }
      );
    }

    // Merges the client's own cancel (req.signal) with our internal deadline
    // into one signal, same pattern as /api/impress — either way, the
    // in-flight Replicate call gets aborted instead of left running after
    // we've already told the client it failed.
    const internalController = new AbortController();
    if (req.signal.aborted) {
      internalController.abort(req.signal.reason);
    } else {
      req.signal.addEventListener("abort", () => internalController.abort(req.signal.reason), {
        once: true,
      });
    }
    let timedOut = false;
    const deadlineTimer = setTimeout(() => {
      timedOut = true;
      internalController.abort(new DOMException("Délai interne dépassé", "TimeoutError"));
    }, EDIT_VIDEO_DEADLINE_MS);

    let rawVideoUrl: string;
    try {
      rawVideoUrl = await editVideoWithReplicate(videoBuffer, description, internalController.signal);
      clearTimeout(deadlineTimer);
    } catch (err) {
      clearTimeout(deadlineTimer);
      await releaseReservationIfNeeded();
      if (timedOut) {
        return NextResponse.json(
          {
            error:
              "La transformation a pris trop de temps et a été interrompue. Réessaie avec une vidéo plus courte ou une description plus simple.",
          },
          { status: 504 }
        );
      }
      if (req.signal.aborted) {
        return NextResponse.json({ error: "Transformation annulée." }, { status: 499 });
      }
      console.error("edit-video error", err);
      return NextResponse.json({ error: describeReplicateVideoEditError(err) }, { status: 502 });
    }

    // Re-downloaded and persisted to our own 'videos' bucket for the same
    // reason as /api/animate: Replicate's own hosted URL isn't guaranteed
    // to stay reachable indefinitely, and this makes the result show up in
    // /historique like every other generation (same bucket/kind, so no
    // schema or /historique changes needed).
    let videoUrl = rawVideoUrl;
    try {
      const videoRes = await fetch(rawVideoUrl, { signal: req.signal });
      if (!videoRes.ok) {
        throw new Error(`download failed (${videoRes.status})`);
      }
      const resultBuffer = Buffer.from(await videoRes.arrayBuffer());
      const storagePath = `${authUser.id}/${randomUUID()}.mp4`;

      const { error: uploadError } = await admin.storage
        .from("videos")
        .upload(storagePath, resultBuffer, { contentType: "video/mp4" });
      if (uploadError) throw uploadError;

      const { data: signed } = await admin.storage
        .from("videos")
        .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
      if (signed?.signedUrl) videoUrl = signed.signedUrl;

      await admin.from("generations").insert({
        user_id: authUser.id,
        storage_path: storagePath,
        storage_bucket: "videos",
        kind: "video",
        preset_id: "edit-video",
        used_ai: true,
      });
    } catch (err) {
      console.error("edit-video history save error", err);
    }

    return NextResponse.json({ video: videoUrl });
  } catch (err) {
    await releaseReservationIfNeeded();
    if (req.signal.aborted) {
      return NextResponse.json({ error: "Transformation annulée." }, { status: 499 });
    }
    console.error("edit-video error", err);
    return NextResponse.json({ error: describeReplicateVideoEditError(err) }, { status: 502 });
  }
}
