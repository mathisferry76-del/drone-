import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, getUserFromAuthHeader } from "@/lib/supabase";
import { isRateLimited, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

// Confirmed in production via Vercel's own function logs: a full-vehicle-
// replacement request with a reference photo attached failed with a raw
// 413 FUNCTION_PAYLOAD_TOO_LARGE — Vercel's platform-level cap on the
// REQUEST body a serverless function can receive, hit before our code ever
// ran, even after client-side compression (lib/compress-image.ts) already
// cut typical photo sizes down 80-95%. Two compressed photos (source +
// reference) plus multipart overhead can still land over that ceiling.
// This route hands back a signed one-time upload URL for ONE file at a
// time (called once for the source photo, again for an optional reference
// photo) — always a fast, tiny JSON response — so the browser can upload
// each photo directly to Supabase Storage instead, the same fix already
// proven for the video-editing feature's identical failure mode.
export async function POST(req: NextRequest) {
  if (isRateLimited(`impress-upload-url:${getClientIp(req)}`, 20, 10 * 60 * 1000)) {
    return NextResponse.json(
      { error: "Trop de tentatives. Réessaie dans quelques minutes." },
      { status: 429 }
    );
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Service indisponible." }, { status: 401 });
  }

  const authUser = await getUserFromAuthHeader(req.headers.get("authorization"));
  if (!authUser) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }

  // Temp path, distinct from the final result's storage path — cleaned up
  // by app/api/impress/route.ts once it's read the upload into memory.
  const path = `${authUser.id}/impress-tmp/${randomUUID()}.jpg`;

  const { data, error } = await admin.storage.from("thumbnails").createSignedUploadUrl(path);
  if (error || !data) {
    console.error("createSignedUploadUrl error", error);
    return NextResponse.json(
      { error: "Impossible de préparer l'upload. Réessaie." },
      { status: 500 }
    );
  }

  return NextResponse.json({ path: data.path, token: data.token });
}
