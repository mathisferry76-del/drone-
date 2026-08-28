import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { PaidPlan } from "@/lib/presets";

export const runtime = "nodejs";

function planFromPriceId(priceId: string | null | undefined): PaidPlan | null {
  if (!priceId) return null;
  if (priceId === process.env.NEXT_PUBLIC_STRIPE_PRICE_STARTER) return "starter";
  if (priceId === process.env.NEXT_PUBLIC_STRIPE_PRICE_CREATOR) return "creator";
  if (priceId === process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO) return "pro";
  if (priceId === process.env.NEXT_PUBLIC_STRIPE_PRICE_STUDIO) return "studio";
  return null;
}

// Stripe subscription events keep the profiles table in sync with reality
// server-side — this is what makes the plan/quota checks in /api/generate
// trustworthy instead of a client-reported flag anyone could fake.
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
        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id;

        if (!userId || !subscriptionId) {
          console.error("stripe webhook: missing userId or subscriptionId", {
            userId,
            subscriptionId,
          });
          break;
        }

        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const priceId = subscription.items.data[0]?.price.id;
        const plan = planFromPriceId(priceId);
        if (!plan) {
          console.error("stripe webhook: unrecognized price id", { priceId });
          break;
        }

        const { error: updateError, count } = await admin
          .from("profiles")
          .update({
            plan,
            stripe_customer_id: customerId ?? null,
            stripe_subscription_id: subscriptionId,
          })
          .eq("id", userId)
          .select("id", { count: "exact" });
        if (updateError) {
          console.error("stripe webhook: profile update failed", updateError);
        } else if (!count) {
          console.error("stripe webhook: no profile matched userId", { userId });
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const plan = planFromPriceId(subscription.items.data[0]?.price.id);
        const customerId =
          typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
        if (!plan) break;

        await admin
          .from("profiles")
          .update({ plan, stripe_subscription_id: subscription.id })
          .eq("stripe_customer_id", customerId);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId =
          typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;

        await admin
          .from("profiles")
          .update({ plan: "free", stripe_subscription_id: null })
          .eq("stripe_customer_id", customerId);
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
