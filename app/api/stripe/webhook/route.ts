import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase";
import { SUBSCRIPTION_TIERS } from "@/lib/presets";

export const runtime = "nodejs";

function tierFromPriceId(priceId: string | null | undefined) {
  if (!priceId) return null;
  return SUBSCRIPTION_TIERS.find((t) => t.priceId === priceId) ?? null;
}

// Stripe payment events keep the profiles table in sync with reality
// server-side — this is what makes the credits balance and subscription
// status checks in the app trustworthy instead of a client-reported value
// anyone could fake.
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

        if (!userId) {
          console.error("stripe webhook: missing userId", { sessionId: session.id });
          break;
        }

        if (session.mode === "subscription") {
          // Crediting happens on invoice.paid instead (fired for this first
          // invoice too, and for every renewal) — this event just links the
          // subscription to the profile so invoice.paid knows who to credit
          // and /compte can show the active plan.
          const subscriptionId =
            typeof session.subscription === "string"
              ? session.subscription
              : session.subscription?.id;
          const plan = session.metadata?.plan ?? null;

          await admin
            .from("profiles")
            .update({
              plan,
              stripe_customer_id: customerId ?? null,
              stripe_subscription_id: subscriptionId ?? null,
            })
            .eq("id", userId);
          break;
        }

        // One-shot credit pack purchase: read the amount from the metadata
        // set at checkout creation (see /api/checkout) rather than
        // re-deriving it from the price — the price was already validated
        // against CREDIT_PACKS server-side before the session was created.
        const credits = Number(session.metadata?.credits);
        if (!Number.isFinite(credits) || credits <= 0) {
          console.error("stripe webhook: missing credits in metadata", {
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

      // Fires for every successful subscription invoice — the first one
      // (right after checkout.session.completed) and every renewal after
      // it. Using this single event as the only place credits get added
      // for a subscription avoids double-crediting the first invoice.
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId =
          typeof invoice.parent?.subscription_details?.subscription === "string"
            ? invoice.parent.subscription_details.subscription
            : invoice.parent?.subscription_details?.subscription?.id;
        if (!subscriptionId) break; // not a subscription invoice

        const customerId =
          typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
        const priceId = invoice.lines.data[0]?.pricing?.price_details?.price;
        const tier = tierFromPriceId(typeof priceId === "string" ? priceId : undefined);

        if (!customerId || !tier) {
          console.error("stripe webhook: unrecognized subscription invoice", {
            customerId,
            priceId,
          });
          break;
        }

        const { data: profile } = await admin
          .from("profiles")
          .select("id")
          .eq("stripe_customer_id", customerId)
          .single();
        if (!profile) {
          console.error("stripe webhook: no profile for customer", { customerId });
          break;
        }

        const { error: creditError } = await admin.rpc("add_credits", {
          p_user_id: profile.id,
          p_amount: tier.credits,
        });
        if (creditError) {
          console.error("stripe webhook: add_credits failed (subscription)", creditError);
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId =
          typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
        const tier = tierFromPriceId(subscription.items.data[0]?.price.id);

        await admin
          .from("profiles")
          .update({ plan: tier?.id ?? null, stripe_subscription_id: subscription.id })
          .eq("stripe_customer_id", customerId);
        break;
      }

      // The subscription stops renewing — credits already granted are kept
      // (they never expire), only the active-plan flag is cleared so
      // /compte stops showing an active subscription and offers to
      // resubscribe instead of "manage subscription".
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId =
          typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;

        await admin
          .from("profiles")
          .update({ plan: null, stripe_subscription_id: null })
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
