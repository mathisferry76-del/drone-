import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getUserFromAuthHeader, getSupabaseAdmin, Profile } from "@/lib/supabase";
import { isRateLimited, getClientIp } from "@/lib/rate-limit";

// Hands off plan changes, payment method updates and cancellation to
// Stripe's own hosted portal instead of us reimplementing proration and
// invoicing — it operates directly on the user's existing subscription
// (when there is one; a customer with only one-shot pack purchases and no
// subscription still gets a portal session to review past invoices), which
// is also what keeps a tier switch from ever creating a second,
// separately-billed subscription (see the check in /api/checkout).
export async function POST(req: NextRequest) {
  if (isRateLimited(`portal:${getClientIp(req)}`, 10, 10 * 60 * 1000)) {
    return NextResponse.json(
      { error: "Trop de tentatives. Réessaie dans quelques minutes." },
      { status: 429 }
    );
  }

  const stripe = getStripe();
  const admin = getSupabaseAdmin();
  if (!stripe || !admin) {
    return NextResponse.json(
      { error: "Stripe n'est pas configuré sur ce déploiement." },
      { status: 501 }
    );
  }

  const user = await getUserFromAuthHeader(req.headers.get("authorization"));
  if (!user) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }

  const { data } = await admin
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .single();
  const profile = data as Pick<Profile, "stripe_customer_id"> | null;

  if (!profile?.stripe_customer_id) {
    return NextResponse.json(
      { error: "Aucun historique de paiement. Achète des crédits sur /pricing." },
      { status: 404 }
    );
  }

  try {
    const origin = req.headers.get("origin") ?? "http://localhost:3000";
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${origin}/compte`,
    });
    return NextResponse.json({ url: portalSession.url });
  } catch (err) {
    console.error("billing portal error", err);
    return NextResponse.json(
      { error: "Impossible d'ouvrir la gestion du compte." },
      { status: 500 }
    );
  }
}
