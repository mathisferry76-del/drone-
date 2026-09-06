import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
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
    // "resource_missing" here means Stripe has no record at all of this
    // customer id — happens when the stored id was created under a
    // different mode/account than the one STRIPE_SECRET_KEY now points to
    // (e.g. leftover from test-mode testing before going live). No portal
    // session can ever work for an id Stripe doesn't recognize, and it'll
    // fail the exact same way every time, so clear it (and the now-equally
    // orphaned subscription id) instead of leaving the account permanently
    // stuck on both this and the checkout tier-switch guard in
    // /api/checkout, which also gates on stripe_subscription_id. Next
    // attempt falls through to the normal "no billing history yet" reply
    // below, pointing them back to /pricing to start fresh.
    if (err instanceof Stripe.errors.StripeInvalidRequestError && err.code === "resource_missing") {
      await admin
        .from("profiles")
        .update({ stripe_customer_id: null, stripe_subscription_id: null })
        .eq("id", user.id);
      return NextResponse.json(
        { error: "Aucun historique de paiement. Achète des crédits sur /pricing." },
        { status: 404 }
      );
    }
    // Stripe's own message here is what actually says "you must activate
    // the customer portal" (a one-time dashboard setup step, separate for
    // test/live mode, at dashboard.stripe.com/settings/billing/portal) —
    // by far the most common reason this call fails on a deployment that
    // has never opened the portal before. Surfacing it (Stripe writes these
    // for developers, nothing sensitive in them) beats a dead-end generic
    // message with no way to self-diagnose without server log access.
    const message =
      err instanceof Stripe.errors.StripeError
        ? `Stripe : ${err.message}`
        : "Impossible d'ouvrir la gestion du compte.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
