import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

// Stripe payment events keep the profiles table in sync with reality
// server-side — this is what makes the credits balance checks in
// /api/generate and /api/impress trustworthy instead of a client-reported
// value anyone could fake.
export async function POST(req: NextRequest) {
  const stripe = getStripe();
  const admin = getSupabaseAdmin();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripe || !admin || !webhookSecret) {
    return NextResponse.json(
      { error: "Webhook Stripe non configuré (STRIPE_WEBHOOK_SECRET ou Supabase manquant)." },
      { status: 501 }
    );
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Signature manquante." }, { status: 400 });
  }

  const rawBody = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error("stripe webhook signature error", err);
    return NextResponse.json({ error: "Signature invalide." }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id;
        const customerId =
          typeof session.customer === "string" ? session.customer : session.customer?.id;
        // Read the credit amount from the metadata set at checkout creation
        // (see /api/checkout) rather than re-deriving it from the price —
        // the price was already validated against CREDIT_PACKS server-side
        // before the session was ever created.
        const credits = Number(session.metadata?.credits);

        if (!userId || !Number.isFinite(credits) || credits <= 0) {
          console.error("stripe webhook: missing userId or credits", {
            userId,
            credits: session.metadata?.credits,
          });
          break;
        }

        if (customerId) {
          await admin.from("profiles").update({ stripe_customer_id: customerId }).eq("id", userId);
        }

        const { error: creditError } = await admin.rpc("add_credits", {
          p_user_id: userId,
          p_amount: credits,
        });
        if (creditError) {
          console.error("stripe webhook: add_credits failed", creditError);
        }
        break;
      }

      default:
        break;
    }
  } catch (err) {
    console.error("stripe webhook handling error", err);
    return NextResponse.json({ error: "Erreur pendant le traitement du webhook." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
