// Turns a real email into a partial, non-reversible-to-full-identity label
// for public display in the homepage's live activity feed (e.g. "ma***76").
// Never expose the full email or domain here — only this masked form is
// ever written to activity_events, so even a bug in the read path can't leak
// a full email to an anonymous visitor.
export function maskEmailForDisplay(email: string): string {
  const local = email.split("@")[0] ?? "";
  if (local.length <= 2) return `${local[0] ?? ""}***`;
  if (local.length <= 5) return `${local.slice(0, 2)}***`;
  return `${local.slice(0, 2)}***${local.slice(-2)}`;
}
