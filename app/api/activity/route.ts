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
type ActivityRow = { kind: Kind; createdAt: string; pseudo: string | null };

// Calendar-day boundary in French local time, not a rolling 24h window —
// "générations aujourd'hui" should reset at Paris midnight like a visitor
// would expect, not drift with when they happen to load the page. Whole-hour
// offset only (France is always +1/+2), which is all Europe/Paris ever is.
function startOfTodayInTimezoneISO(timeZone: string): string {
  const now = new Date();
  const dateParts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const y = dateParts.find((p) => p.type === "year")!.value;
  const m = dateParts.find((p) => p.type === "month")!.value;
  const d = dateParts.find((p) => p.type === "day")!.value;

  const offsetParts = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "shortOffset" }).formatToParts(now);
  const tzName = offsetParts.find((p) => p.type === "timeZoneName")?.value ?? "GMT+0";
  const offset = tzName.replace("GMT", "") || "+0";
  const sign = offset.startsWith("-") ? "-" : "+";
  const hours = offset.replace(/[+-]/, "").padStart(2, "0");

  return `${y}-${m}-${d}T00:00:00${sign}${hours}:00`;
}

export async function GET(req: NextRequest) {
  if (isRateLimited(`activity:${getClientIp(req)}`, 30, 60 * 1000)) {
    return NextResponse.json({ error: "Trop de requêtes." }, { status: 429 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ total: 0, today: 0, recent: [] });
  }

  const todaySince = startOfTodayInTimezoneISO("Europe/Paris");

  const [{ count: total }, { count: today }, { data: recentGenerations }, { data: recentEvents }] = await Promise.all([
    admin.from("generations").select("id", { count: "exact", head: true }),
    admin.from("generations").select("id", { count: "exact", head: true }).gte("created_at", todaySince),
    admin.from("generations").select("created_at").order("created_at", { ascending: false }).limit(5),
    admin.from("activity_events").select("kind, created_at, pseudo").order("created_at", { ascending: false }).limit(5),
  ]);

  const merged: ActivityRow[] = [
    ...(recentGenerations ?? []).map((r) => ({ kind: "generation" as Kind, createdAt: r.created_at as string, pseudo: null })),
    ...(recentEvents ?? []).map((r) => ({
      kind: r.kind as Kind,
      createdAt: r.created_at as string,
      pseudo: (r.pseudo as string | null) ?? null,
    })),
  ]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  return NextResponse.json({
    total: total ?? 0,
    today: today ?? 0,
    recent: merged.map((e) => ({
      kind: e.kind,
      pseudo: e.pseudo,
      secondsAgo: Math.max(0, Math.round((Date.now() - new Date(e.createdAt).getTime()) / 1000)),
    })),
  });
}
