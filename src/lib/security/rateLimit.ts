import { AppError } from "../errors/AppError";

type Bucket = {
  tokens: number;
  lastRefillMs: number;
};

const buckets = new Map<string, Bucket>();

export type RateLimitOptions = {
  key: string;
  limit: number;
  windowMs: number;
  cost?: number;
};

function refill(bucket: Bucket, limit: number, windowMs: number, nowMs: number): void {
  const ratePerMs = limit / windowMs;
  const elapsed = Math.max(0, nowMs - bucket.lastRefillMs);
  bucket.tokens = Math.min(limit, bucket.tokens + elapsed * ratePerMs);
  bucket.lastRefillMs = nowMs;
}

export function checkRateLimit(options: RateLimitOptions): { ok: true } | { ok: false; retryAfterSeconds: number } {
  const { key, limit, windowMs, cost = 1 } = options;
  const nowMs = Date.now();

  const bucket = buckets.get(key) ?? { tokens: limit, lastRefillMs: nowMs };
  refill(bucket, limit, windowMs, nowMs);

  if (bucket.tokens < cost) {
    const missing = cost - bucket.tokens;
    const ratePerMs = limit / windowMs;
    const retryMs = missing / ratePerMs;
    buckets.set(key, bucket);
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil(retryMs / 1000)) };
  }

  bucket.tokens -= cost;
  buckets.set(key, bucket);
  return { ok: true };
}

export function enforceRateLimit(options: RateLimitOptions): void {
  const result = checkRateLimit(options);
  if (!result.ok) {
    throw new AppError(429, "RATE_LIMITED", "Too many requests.", {
      retryAfterSeconds: result.retryAfterSeconds,
    });
  }
}
