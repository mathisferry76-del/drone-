interface Bucket {
  count: number;
  resetAt: number;
}

// In-memory only — resets on cold start and isn't shared across serverless
// instances/regions, so this is a best-effort abuse throttle, not a hard
// guarantee. It still stops naive single-origin floods (contact spam,
// repeated multipart uploads hammering /api/generate before auth is even
// checked), which is the actual gap this closes.
const buckets = new Map<string, Bucket>();
const MAX_TRACKED_KEYS = 5000;

export function isRateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();

  if (buckets.size > MAX_TRACKED_KEYS) {
    for (const [k, b] of buckets) {
      if (now > b.resetAt) buckets.delete(k);
    }
  }

  const bucket = buckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  bucket.count += 1;
  return bucket.count > limit;
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
