import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, getUserFromAuthHeader } from "@/lib/supabase";

export const runtime = "nodejs";

// The owner account's image generations always bypass the credits balance
// entirely (reserve_credits' `ok_owner` path — see app/api/impress/
// route.ts), so it has never had a reason to hold real credits. Video
// generation deliberately does NOT get that bypass (app/api/animate/
// route.ts), to validate the real reserve/release flow before opening it up
// — but that leaves no way to fund the owner's own test account short of an
// actual Stripe purchase. This is that funding step: owner-only, no request
// body, adds a fixed amount via the same add_credits RPC the Stripe webhook
// uses for a real purchase. Internal testing tool, not a public endpoint.
const OWNER_EMAIL = "mathis.ferry76@gmail.com";
const GRANT_AMOUNT = 3000;

export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Supabase non configuré." }, { status: 500 });
  }

  const authUser = await getUserFromAuthHeader(req.headers.get("authorization"));
  if (!authUser || authUser.email?.toLowerCase() !== OWNER_EMAIL) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
  }

  const { error } = await admin.rpc("add_credits", {
    p_user_id: authUser.id,
    p_amount: GRANT_AMOUNT,
  });
  if (error) {
    console.error("grant-test-credits error", error);
    return NextResponse.json({ error: "Erreur pendant l'ajout de crédits." }, { status: 500 });
  }

  return NextResponse.json({ granted: GRANT_AMOUNT });
}
