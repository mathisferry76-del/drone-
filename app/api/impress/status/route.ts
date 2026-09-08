import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, getUserFromAuthHeader } from "@/lib/supabase";
import { isRateLimited, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

// Long enough for a slow client-side poll loop to still get a fresh-ish
// answer, short enough that a stale/expired signed URL is never handed out
// — this only ever needs to survive one client poll cycle (app/impress/
// page.tsx polls every few seconds and immediately uses whatever URL comes
// back), unlike the main route's SIGNED_URL_TTL_SECONDS which has to
// survive a page reload hours later.
const SIGNED_URL_TTL_SECONDS = 10 * 60;

// Paired with the jobId-based storage path in app/api/impress/route.ts (see
// the comment there): lets the client recover a result that finished
// generating server-side even when the original POST's own response never
// made it back — a dropped mobile connection on a long-held request looks
// identical, from the client's fetch, to the generation itself having
// failed, but the server-side work (and the file it writes to Storage) has
// no idea the connection dropped and keeps going regardless. Polling this
// after a failed/timed-out generation request recovers that result instead
// of discarding a generation that actually succeeded.
export async function GET(req: NextRequest) {
  // The client polls every 4s for up to 5 minutes (see pollForImpressResult
  // in app/impress/page.tsx) — 75 polls in the worst case, so the limit
  // needs headroom above that rather than a round number that would
  // silently start rate-limiting the client's own legitimate recovery
  // polling before it ever gets an answer.
  if (isRateLimited(`impress-status:${getClientIp(req)}`, 90, 5 * 60 * 1000)) {
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

  const jobId = req.nextUrl.searchParams.get("jobId") ?? "";
  if (!/^[0-9a-f-]{16,64}$/i.test(jobId)) {
    return NextResponse.json({ error: "jobId invalide." }, { status: 400 });
  }

  const storagePath = `${authUser.id}/${jobId}.png`;
  const { data: signed } = await admin.storage
    .from("thumbnails")
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

  // No distinction made here between "not generated yet" and "never will
  // be" (a genuinely failed generation also never writes this file) — the
  // client-side poll loop already has its own overall time budget and
  // falls back to the normal error message once that's exhausted, so this
  // endpoint only ever needs to answer "is it there yet or not".
  if (!signed?.signedUrl) {
    return NextResponse.json({ status: "pending" });
  }

  return NextResponse.json({ status: "done", image: signed.signedUrl });
}
