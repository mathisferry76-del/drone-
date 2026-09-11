import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

// Every 1000 total generations (1000, 2000, 3000...) unlocks a real,
// site-wide -10% code, valid 24h, on any pack or subscription — an
// explicit growth mechanic ("mode objectif") rather than a one-off.
export const MILESTONE_STEP = 1000;
const PROMO_PERCENT_OFF = 10;
const PROMO_DURATION_HOURS = 24;

interface PromoMilestoneRow {
  threshold: number;
  promo_code: string | null;
  stripe_promotion_code_id: string | null;
  expires_at: string | null;
}

export function currentMilestoneThreshold(total: number): number {
  return Math.floor(total / MILESTONE_STEP) * MILESTONE_STEP;
}

// Idempotent: safe to call on every /api/activity poll (many concurrent
// visitors). Only the request that wins the unique "threshold" insert ever
// talks to Stripe — see the schema.sql comment on promo_milestones for why.
export async function ensureMilestonePromo(
  admin: SupabaseClient,
  stripe: Stripe | null,
  total: number
): Promise<void> {
  const threshold = currentMilestoneThreshold(total);
  if (threshold <= 0 || !stripe) return;

  const { error: claimError } = await admin.from("promo_milestones").insert({ threshold });
  if (claimError) {
    if (claimError.code !== "23505") {
      console.error("promo_milestones claim error", claimError);
    }
    return; // Either already handled, or a real error not worth blocking the page load on.
  }

  try {
    const code = `MERCI${threshold}`;
    const coupon = await stripe.coupons.create({
      percent_off: PROMO_PERCENT_OFF,
      duration: "once",
      name: `Objectif ${threshold} générations`,
    });
    const expiresAtUnix = Math.floor(Date.now() / 1000) + PROMO_DURATION_HOURS * 3600;
    const promotionCode = await stripe.promotionCodes.create({
      promotion: { type: "coupon", coupon: coupon.id },
      code,
      expires_at: expiresAtUnix,
    });

    await admin
      .from("promo_milestones")
      .update({
        promo_code: code,
        stripe_coupon_id: coupon.id,
        stripe_promotion_code_id: promotionCode.id,
        expires_at: new Date(expiresAtUnix * 1000).toISOString(),
      })
      .eq("threshold", threshold);
  } catch (err) {
    console.error("promo_milestones stripe error", err);
    // Undo the claim so a later poll can retry instead of leaving this
    // threshold permanently stuck with no real code behind it.
    await admin.from("promo_milestones").delete().eq("threshold", threshold);
  }
}

export interface ActiveMilestonePromo {
  code: string;
  threshold: number;
  expiresAt: string;
}

export async function getActiveMilestonePromo(admin: SupabaseClient): Promise<ActiveMilestonePromo | null> {
  const { data } = await admin
    .from("promo_milestones")
    .select("threshold, promo_code, stripe_promotion_code_id, expires_at")
    .not("promo_code", "is", null)
    .gt("expires_at", new Date().toISOString())
    .order("threshold", { ascending: false })
    .limit(1)
    .maybeSingle();

  const row = data as PromoMilestoneRow | null;
  if (!row || !row.promo_code || !row.expires_at) return null;

  return { code: row.promo_code, threshold: row.threshold, expiresAt: row.expires_at };
}
