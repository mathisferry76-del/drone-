import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, getUserFromAuthHeader } from "@/lib/supabase";
import { isRateLimited, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

// Vercel serverless functions hard-cap the REQUEST body they can receive at
// a few MB, platform-level — not configurable via maxDuration or any code
// setting. This session already hit and root-caused the exact same failure
// once on a different video-editing feature: a raw video upload sent
// straight through our own Next.js route (multipart FormData) got silently
// rejected by the platform before our code ever ran, surfacing to the
// client as a generic "server took too long/connection cut" with no JSON
// body — indistinguishable from every other failure mode until traced back
// to this. A phone-shot clip, even just 4-6 seconds long, routinely
// exceeds that cap.
//
// The fix is architectural, not a bigger limit: the browser uploads the
// video directly to Supabase Storage (whose limits are separate and far
// higher), bypassing our server for the large binary entirely. This route
// only ever hands back a signed one-time upload URL — always a fast, tiny
// JSON response, never at risk of hitting the same ceiling itself.
// app/api/video-edit/route.ts then downloads the file server-to-server via
// the Storage SDK, an outbound call Vercel's inbound body cap doesn't
// apply to.
export async function POST(req: NextRequest) {
  if (isRateLimited(`video-edit-upload-url:${getClientIp(req)}`, 10, 10 * 60 * 1000)) {
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
  // by app/api/video-edit/route.ts once it's read the upload into memory.
  const path = `${authUser.id}/video-edit-tmp/${randomUUID()}.mp4`;

  const { data, error } = await admin.storage.from("videos").createSignedUploadUrl(path);
  if (error || !data) {
    console.error("createSignedUploadUrl error", error);
    return NextResponse.json(
      { error: "Impossible de préparer l'upload. Réessaie." },
      { status: 500 }
    );
  }

  return NextResponse.json({ path: data.path, token: data.token });
}
