import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, getUserFromAuthHeader } from "@/lib/supabase";

// Returns the current user's referral code, current credits balance (which
// includes any referral bonus credits already granted), and how many people
// signed up through their link — via the admin client so we can safely
// count referred rows without exposing their emails/data to the referrer
// through RLS.
export async function GET(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: "Le parrainage n'est pas configuré sur ce déploiement." },
      { status: 501 }
    );
  }

  const user = await getUserFromAuthHeader(req.headers.get("authorization"));
  if (!user) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }

  const { data: profile, error } = await admin
    .from("profiles")
    .select("referral_code, credits_balance")
    .eq("id", user.id)
    .single();

  if (error || !profile) {
    return NextResponse.json({ error: "Profil introuvable." }, { status: 404 });
  }

  const { count } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("referred_by", user.id);

  return NextResponse.json({
    code: profile.referral_code,
    creditsBalance: profile.credits_balance,
    referredCount: count ?? 0,
  });
}
