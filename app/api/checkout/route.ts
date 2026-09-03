import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getUserFromAuthHeader, getSupabaseAdmin, Profile } from "@/lib/supabase";
import { CREDIT_PACKS, SUBSCRIPTION_TIERS } from "@/lib/presets";
import { isRateLimited, getClientIp } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  if (isRateLimited(`checkout:${getClientIp(req)}`, 10, 10 * 60 * 1000)) {
    return NextResponse.json(
      { error: "Trop de tentatives. Réessaie dans quelques minutes." },
      { status: 429 }
    );
  }

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json(
      {
        error:
          "Stripe n'est pas configuré sur ce déploiement. Ajoute STRIPE_SECRET_KEY dans les variables d'environnement (voir README).",
      },
      { status: 501 }
    );
  }

  // A purchase has to be linked to an account so the webhook knows whose
  // balance to credit — no anonymous checkout once accounts exist.
  const user = await getUserFromAuthHeader(req.headers.get("authorization"));
  if (!user) {
    return NextResponse.json(
      { error: "Connecte-toi avant d'acheter des crédits." },
      { status: 401 }
    );
  }

  try {
    const { priceId } = (await req.json()) as { priceId?: string };
    if (!priceId) {
      return NextResponse.json({ error: "priceId manquant." }, { status: 400 });
    }
    // Only ever create a checkout session for one of our own configured
    // prices — never trust an arbitrary priceId string from the client, in
    // case a differently-priced object ever exists in the same Stripe
    // account (e.g. an internal test price).
    const pack = CREDIT_PACKS.find((p) => p.priceId === priceId);
    const tier = SUBSCRIPTION_TIERS.find((t) => t.priceId === priceId);
    if (!pack && !tier) {
      return NextResponse.json({ error: "Offre inconnue." }, { status: 400 });
    }

    const origin = req.headers.get("origin") ?? "http://localhost:3000";

    if (tier) {
      // A user who already has an active subscription must switch tiers
      // through the Stripe portal (/api/portal), which prorates the change
      // on the *existing* subscription — creating a second Checkout session
      // here would start a second, separately-billed subscription. This
      // check only applies to subscriptions: a one-shot credit pack (below)
      // is always fine to buy regardless of subscription status.
      const admin = getSupabaseAdmin();
      if (admin) {
        const { data } = await admin
          .from("profiles")
          .select("plan, stripe_subscription_id")
          .eq("id", user.id)
          .single();
        const profile = data as Pick<Profile, "plan" | "stripe_subscription_id"> | null;
        if (profile?.stripe_subscription_id && profile.plan) {
          return NextResponse.json(
            {
              error: "changer_de_plan",
              message:
                "Tu as déjà un abonnement actif. Gère ton changement de palier depuis la page Mon compte.",
            },
            { status: 409 }
          );
        }
      }

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${origin}/generate?success=true`,
        cancel_url: `${origin}/pricing?canceled=true`,
        allow_promotion_codes: true,
        client_reference_id: user.id,
        customer_email: user.email ?? undefined,
        metadata: { user_id: user.id, plan: tier.id },
      });

      return NextResponse.json({ url: session.url });
    }

    // One-shot payment, not a subscription — credits never expire and
    // there's nothing to renew, so a purchase never conflicts with a prior
    // one the way starting a second subscription would.
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/generate?success=true`,
      cancel_url: `${origin}/pricing?canceled=true`,
      allow_promotion_codes: true,
      client_reference_id: user.id,
      customer_email: user.email ?? undefined,
      metadata: { user_id: user.id, credits: String(pack!.credits) },
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("checkout error", err);
    return NextResponse.json(
      { error: "Impossible de créer la session de paiement." },
      { status: 500 }
    );
  }
}
