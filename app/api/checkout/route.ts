import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getUserFromAuthHeader } from "@/lib/supabase";
import { PAID_PLAN_IDS, PRICING_TIERS } from "@/lib/presets";
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

  // A subscription has to be linked to an account so the webhook knows
  // whose profile to upgrade — no anonymous checkout once accounts exist.
  const user = await getUserFromAuthHeader(req.headers.get("authorization"));
  if (!user) {
    return NextResponse.json(
      { error: "Connecte-toi avant de passer sur un plan payant." },
      { status: 401 }
    );
  }

  try {
    const { priceId, tier } = (await req.json()) as {
      priceId?: string;
      tier?: string;
    };
    if (!priceId) {
      return NextResponse.json({ error: "priceId manquant." }, { status: 400 });
    }
    // Only ever create a checkout session for one of our own configured
    // plan prices — never trust an arbitrary priceId string from the
    // client, in case a differently-priced object ever exists in the same
    // Stripe account (e.g. an internal test price).
    const knownPriceIds = PRICING_TIERS.map((t) => t.priceId).filter(Boolean);
    if (!knownPriceIds.includes(priceId)) {
      return NextResponse.json({ error: "Plan inconnu." }, { status: 400 });
    }

    const origin = req.headers.get("origin") ?? "http://localhost:3000";
    const safeTier = PAID_PLAN_IDS.includes(tier as (typeof PAID_PLAN_IDS)[number])
      ? tier
      : "creator";

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/generate?success=true&tier=${safeTier}`,
      cancel_url: `${origin}/pricing?canceled=true`,
      allow_promotion_codes: true,
      client_reference_id: user.id,
      customer_email: user.email ?? undefined,
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
