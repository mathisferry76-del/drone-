import { createClient, SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;
let adminClient: SupabaseClient | null = null;

/**
 * Client-side Supabase client (anon key, respects Row Level Security).
 * Used for auth (magic link) and for reading/writing the current user's
 * own rows directly from the browser. Returns null if the project isn't
 * configured — every caller must handle that (same pattern as Stripe/OpenAI).
 */
export function getSupabaseBrowser(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  if (!browserClient) {
    browserClient = createClient(url, anonKey);
  }
  return browserClient;
}

/**
 * Server-only Supabase client using the service role key: bypasses RLS,
 * used to verify a user's access token and to read/write on their behalf
 * (profile, quota, generation history, Stripe webhook updates). Never
 * expose this client or its key to the browser.
 */
export function getSupabaseAdmin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  if (!adminClient) {
    adminClient = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return adminClient;
}

export interface Profile {
  id: string;
  email: string | null;
  plan: "free" | "starter" | "creator" | "pro" | "studio";
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  free_generations_used: number;
  ai_uses_this_month: number;
  ai_uses_month_key: string | null;
  referral_code: string | null;
  referred_by: string | null;
  bonus_generations: number;
}

/** Resolves the authenticated user (if any) from a request's bearer token. */
export async function getUserFromAuthHeader(
  authHeader: string | null
): Promise<{ id: string; email: string | null } | null> {
  const admin = getSupabaseAdmin();
  if (!admin || !authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}
