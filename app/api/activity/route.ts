import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isRateLimited, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

// Public, unauthenticated (the homepage's live activity feed needs to work
// for logged-out visitors) — but only ever returns aggregate/anonymous data:
// a total count and a handful of recent event *kinds* with a relative
// timestamp, never a user_id, email, or any other identifying detail. See
// supabase/schema.sql's activity_events comment for why this table exists
// separately from generations (which does have to store user_id, but that
// column is never selected here).
type Kind = "generation" | "pack" | "subscription";

export async function GET(req: NextRequest) {
  if (isRateLimited(`activity:${getClientIp(req)}`, 30, 60 * 1000)) {
    return NextResponse.json({ error: "Trop de requêtes." }, { status: 429 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ total: 0, recent: [] });
  }

  const [{ count: total }, { data: recentGenerations }, { data: recentEvents }] = await Promise.all([
    admin.from("generations").select("id", { count: "exact", head: true }),
    admin.from("generations").select("created_at").order("created_at", { ascending: false }).limit(5),
    admin.from("activity_events").select("kind, created_at").order("created_at", { ascending: false }).limit(5),
  ]);

  const merged: { kind: Kind; createdAt: string }[] = [
    ...(recentGenerations ?? []).map((r) => ({ kind: "generation" as Kind, createdAt: r.created_at as string })),
    ...(recentEvents ?? []).map((r) => ({ kind: r.kind as Kind, createdAt: r.created_at as string })),
  ]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  return NextResponse.json({
    total: total ?? 0,
    recent: merged.map((e) => ({
      kind: e.kind,
      secondsAgo: Math.max(0, Math.round((Date.now() - new Date(e.createdAt).getTime()) / 1000)),
    })),
  });
}
