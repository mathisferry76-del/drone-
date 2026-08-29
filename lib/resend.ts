import { Resend } from "resend";

let resendClient: Resend | null = null;

/**
 * Server-only Resend client for transactional emails (contact form, etc.).
 * Separate from Supabase's own SMTP config (used for auth emails) — this is
 * for emails the app sends directly. Returns null if not configured.
 */
export function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!resendClient) {
    resendClient = new Resend(key);
  }
  return resendClient;
}
