import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getUserFromAuthHeader } from "@/lib/supabase";
import { CREDIT_PACKS } from "@/lib/presets";
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
    // credit packs — never trust an arbitrary priceId string from the
    // client, in case a differently-priced object ever exists in the same
    // Stripe account (e.g. an internal test price).
    const pack = CREDIT_PACKS.find((p) => p.priceId === priceId);
    if (!pack) {
      return NextResponse.json({ error: "Pack de crédits inconnu." }, { status: 400 });
    }

    const origin = req.headers.get("origin") ?? "http://localhost:3000";

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
      metadata: { user_id: user.id, credits: String(pack.credits) },
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
