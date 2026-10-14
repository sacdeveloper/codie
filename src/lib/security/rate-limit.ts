/**
 * Fixed-window in-memory rate limiter. Suitable for a single Node.js instance.
 * For multi-instance deployments replace the store with Redis/Upstash (same interface).
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export class RateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly limit: number, private readonly windowMs: number, private readonly now: () => number = Date.now) {}

  check(key: string): RateLimitResult {
    const t = this.now();
    if (this.hits.size > 10_000) this.sweep(t);
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= t) {
      const resetAt = t + this.windowMs;
      this.hits.set(key, { count: 1, resetAt });
      return { allowed: true, remaining: this.limit - 1, resetAt };
    }
    entry.count++;
    return { allowed: entry.count <= this.limit, remaining: Math.max(0, this.limit - entry.count), resetAt: entry.resetAt };
  }

  private sweep(t: number) {
    for (const [k, v] of this.hits) if (v.resetAt <= t) this.hits.delete(k);
  }
}

const limiters = new Map<string, RateLimiter>();

export function getLimiter(name: string, perMinute: number): RateLimiter {
  let l = limiters.get(name);
  if (!l) {
    l = new RateLimiter(perMinute, 60_000);
    limiters.set(name, l);
  }
  return l;
}

export function clientKeyFromHeaders(h: Headers): string {
  const fwd = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || h.get("x-real-ip") || "unknown";
}
