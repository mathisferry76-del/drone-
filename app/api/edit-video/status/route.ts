import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import {
  getVideoEditStatus,
  cancelVideoEdit,
  describeReplicateVideoEditError,
} from "@/lib/replicate-video-edit";
import { VIDEO_EDIT_CREDIT_COST } from "@/lib/presets";
import { getSupabaseAdmin, getUserFromAuthHeader } from "@/lib/supabase";
import { isRateLimited, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
// Each call here only ever does one fast Replicate status check (plus,
// on the terminal "succeeded" call, one video download/upload) — polled
// by the client every few seconds while app/api/edit-video/route.ts's job
// runs in the background, so this never needs anywhere near as much
// headroom as a route that waits for the whole generation.
export const maxDuration = 60;

const SIGNED_URL_TTL_SECONDS = 6 * 60 * 60;

async function releaseReservation(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  userId: string,
  reservation: string | null
) {
  if (!reservation) return;
  if (reservation !== "ok_trial" && reservation !== "ok_credits") return;
  try {
    await admin.rpc("release_credits_reservation", {
      p_user_id: userId,
      p_reservation: reservation,
      p_cost: VIDEO_EDIT_CREDIT_COST,
    });
  } catch (err) {
    console.error("release_credits_reservation error", err);
  }
}

export async function GET(req: NextRequest) {
  // Generous compared to the start route: a single generation is polled
  // every few seconds for as long as it takes, easily dozens of calls.
  if (isRateLimited(`edit-video-status:${getClientIp(req)}`, 120, 10 * 60 * 1000)) {
    return NextResponse.json(
      { error: "Trop de requêtes. Réessaie dans quelques minutes." },
      { status: 429 }
    );
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Connecte-toi." }, { status: 401 });
  }
  const authUser = await getUserFromAuthHeader(req.headers.get("authorization"));
  if (!authUser) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get("id");
  const reservation = req.nextUrl.searchParams.get("reservation");
  if (!id) {
    return NextResponse.json({ error: "Identifiant de tâche manquant." }, { status: 400 });
  }

  try {
    const result = await getVideoEditStatus(id);

    if (result.status === "starting" || result.status === "processing") {
      return NextResponse.json({ status: "processing" });
    }

    if (result.status === "succeeded" && result.videoUrl) {
      // Re-downloaded and persisted to our own 'videos' bucket for the same
      // reason as /api/animate: Replicate's own hosted URL isn't guaranteed
      // to stay reachable indefinitely, and this makes the result show up
      // in /historique like every other generation (same bucket/kind, so
      // no schema or /historique changes needed).
      let videoUrl = result.videoUrl;
      try {
        const videoRes = await fetch(result.videoUrl);
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

      return NextResponse.json({ status: "done", video: videoUrl });
    }

    // failed / canceled / aborted, or "succeeded" with no output somehow —
    // no generation was delivered either way, so refund.
    await releaseReservation(admin, authUser.id, reservation);
    const message =
      result.errorMessage ??
      "La transformation vidéo a échoué. Réessaie avec une autre vidéo ou une description différente.";
    return NextResponse.json({ status: "error", error: message });
  } catch (err) {
    console.error("edit-video status error", err);
    await releaseReservation(admin, authUser.id, reservation);
    return NextResponse.json({ status: "error", error: describeReplicateVideoEditError(err) });
  }
}

// Called when the user clicks "Annuler" — actually stops the Replicate job
// (rather than just walking away from it client-side, which would leave it
// running and billing at Runway/Replicate for nothing) and refunds the
// reservation, since no generation will ever be delivered for it.
export async function DELETE(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Connecte-toi." }, { status: 401 });
  }
  const authUser = await getUserFromAuthHeader(req.headers.get("authorization"));
  if (!authUser) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get("id");
  const reservation = req.nextUrl.searchParams.get("reservation");
  if (!id) {
    return NextResponse.json({ error: "Identifiant de tâche manquant." }, { status: 400 });
  }

  await cancelVideoEdit(id);
  await releaseReservation(admin, authUser.id, reservation);
  return NextResponse.json({ status: "canceled" });
}
