import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import {
  getVideoEditPrediction,
  cancelVideoEditPrediction,
  describeReplicateVideoError,
} from "@/lib/replicate-video";
import { getSupabaseAdmin, getUserFromAuthHeader } from "@/lib/supabase";
import { isRateLimited, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
// Only ever does one Replicate status check plus, at most once per job, a
// video download/upload — nowhere near what the actual generation needs
// (see app/api/video-edit/route.ts and lib/replicate-video.ts's
// startVideoEdit comment for why the generation itself is never awaited in
// a single request).
export const maxDuration = 60;

const SIGNED_URL_TTL_SECONDS = 6 * 60 * 60;

type Row = {
  prediction_id: string;
  user_id: string;
  reservation: string;
  cost: number;
  status: "processing" | "finalizing" | "done" | "failed";
  storage_path: string | null;
  error_message: string | null;
};

async function loadOwnedJob(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  predictionId: string,
  userId: string
): Promise<Row | null> {
  const { data } = await admin
    .from("video_edit_jobs")
    .select("*")
    .eq("prediction_id", predictionId)
    .eq("user_id", userId)
    .single();
  return (data as Row) ?? null;
}

async function refund(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  row: Row
) {
  if (row.reservation !== "ok_trial" && row.reservation !== "ok_credits") return;
  try {
    await admin.rpc("release_credits_reservation", {
      p_user_id: row.user_id,
      p_reservation: row.reservation,
      p_cost: row.cost,
    });
  } catch (err) {
    console.error("release_credits_reservation error", err);
  }
}

// Atomically claims the transition out of 'processing' — the WHERE clause
// on the current status means only the poll that actually flips the row
// wins the race against any other poll running at the same moment, so the
// refund/finalize logic that follows a successful claim only ever runs
// once per job regardless of how many overlapping polls hit this route.
async function tryClaim(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  predictionId: string
): Promise<boolean> {
  const { data } = await admin
    .from("video_edit_jobs")
    .update({ status: "finalizing" })
    .eq("prediction_id", predictionId)
    .eq("status", "processing")
    .select("prediction_id");
  return Boolean(data && data.length > 0);
}

export async function GET(req: NextRequest) {
  // Matches app/api/impress/status/route.ts's rate limit reasoning — a
  // client polling every few seconds for a few minutes needs headroom
  // above what a single generation's worth of polls would use.
  if (isRateLimited(`video-edit-status:${getClientIp(req)}`, 90, 5 * 60 * 1000)) {
    return NextResponse.json({ error: "Trop de requêtes." }, { status: 429 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Service indisponible." }, { status: 401 });
  }

  const authUser = await getUserFromAuthHeader(req.headers.get("authorization"));
  if (!authUser) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }

  const predictionId = req.nextUrl.searchParams.get("predictionId") ?? "";
  if (!predictionId) {
    return NextResponse.json({ error: "predictionId manquant." }, { status: 400 });
  }

  const row = await loadOwnedJob(admin, predictionId, authUser.id);
  if (!row) {
    return NextResponse.json({ error: "Édition introuvable." }, { status: 404 });
  }

  if (row.status === "done") {
    if (!row.storage_path) {
      return NextResponse.json({ error: "Résultat introuvable." }, { status: 500 });
    }
    const { data: signed } = await admin.storage
      .from("videos")
      .createSignedUrl(row.storage_path, SIGNED_URL_TTL_SECONDS);
    return NextResponse.json({ status: "done", video: signed?.signedUrl ?? null });
  }

  if (row.status === "failed") {
    return NextResponse.json({ status: "failed", error: row.error_message });
  }

  if (row.status === "finalizing") {
    // Another poll (or this same job right after a claim below) is mid-
    // download/refund — from the client's point of view this is still
    // "not done yet", the same as plain "processing".
    return NextResponse.json({ status: "processing" });
  }

  // row.status === "processing": actually check the job.
  let prediction;
  try {
    prediction = await getVideoEditPrediction(predictionId);
  } catch (err) {
    console.error("getVideoEditPrediction error", err);
    return NextResponse.json({ status: "processing" });
  }

  if (prediction.status === "starting" || prediction.status === "processing") {
    return NextResponse.json({ status: "processing" });
  }

  if (prediction.status === "succeeded") {
    if (!(await tryClaim(admin, predictionId))) {
      return NextResponse.json({ status: "processing" });
    }
    try {
      const output = prediction.output;
      const rawUrl = Array.isArray(output) ? output[0] : output;
      if (typeof rawUrl !== "string") {
        throw new Error("Sortie Replicate inattendue (pas d'URL vidéo).");
      }
      const videoRes = await fetch(rawUrl, { signal: req.signal });
      if (!videoRes.ok) {
        throw new Error(`download failed (${videoRes.status})`);
      }
      const resultBuffer = Buffer.from(await videoRes.arrayBuffer());
      const storagePath = `${authUser.id}/${randomUUID()}.mp4`;

      const { error: uploadError } = await admin.storage
        .from("videos")
        .upload(storagePath, resultBuffer, { contentType: "video/mp4" });
      if (uploadError) throw uploadError;

      await admin.from("generations").insert({
        user_id: authUser.id,
        storage_path: storagePath,
        storage_bucket: "videos",
        kind: "video",
        preset_id: "video-edit",
        used_ai: true,
      });

      await admin
        .from("video_edit_jobs")
        .update({ status: "done", storage_path: storagePath })
        .eq("prediction_id", predictionId);

      const { data: signed } = await admin.storage
        .from("videos")
        .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
      return NextResponse.json({ status: "done", video: signed?.signedUrl ?? null });
    } catch (err) {
      // The generation itself succeeded and was already paid for — a
      // failure here is our own persistence breaking, not a reason to
      // refund. Leave the row in 'finalizing' rather than mark it 'failed'
      // (which would trigger a refund for a generation that did work) —
      // next poll retries the same finalize step since it's cheap/safe to
      // repeat (download+upload again) and 'finalizing' isn't claimable a
      // second time by this same code path — so unclaim it back to
      // 'processing' to allow a retry.
      console.error("video-edit finalize error", err);
      await admin
        .from("video_edit_jobs")
        .update({ status: "processing" })
        .eq("prediction_id", predictionId)
        .eq("status", "finalizing");
      return NextResponse.json({ status: "processing" });
    }
  }

  // failed / canceled / aborted
  if (!(await tryClaim(admin, predictionId))) {
    return NextResponse.json({ status: "processing" });
  }
  await refund(admin, row);
  const errObj =
    prediction.error instanceof Error
      ? prediction.error
      : new Error(String(prediction.error ?? "Échec de la génération."));
  const message = describeReplicateVideoError(errObj);
  await admin
    .from("video_edit_jobs")
    .update({ status: "failed", error_message: message })
    .eq("prediction_id", predictionId);
  return NextResponse.json({ status: "failed", error: message });
}

export async function DELETE(req: NextRequest) {
  if (isRateLimited(`video-edit-cancel:${getClientIp(req)}`, 20, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Trop de requêtes." }, { status: 429 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Service indisponible." }, { status: 401 });
  }

  const authUser = await getUserFromAuthHeader(req.headers.get("authorization"));
  if (!authUser) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }

  const predictionId = req.nextUrl.searchParams.get("predictionId") ?? "";
  if (!predictionId) {
    return NextResponse.json({ error: "predictionId manquant." }, { status: 400 });
  }

  const row = await loadOwnedJob(admin, predictionId, authUser.id);
  if (!row) {
    return NextResponse.json({ error: "Édition introuvable." }, { status: 404 });
  }

  if (row.status !== "processing") {
    // Already settled (done/failed) or another request is mid-finalize —
    // nothing left to cancel either way.
    return NextResponse.json({ status: row.status === "finalizing" ? "processing" : row.status });
  }

  if (!(await tryClaim(admin, predictionId))) {
    return NextResponse.json({ status: "processing" });
  }

  await cancelVideoEditPrediction(predictionId);
  await refund(admin, row);
  await admin
    .from("video_edit_jobs")
    .update({ status: "failed", error_message: "Annulé." })
    .eq("prediction_id", predictionId);

  return NextResponse.json({ status: "canceled" });
}
