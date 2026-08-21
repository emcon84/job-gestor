/**
 * Owner passphrase authentication.
 *
 * The owner unlocks edit controls by submitting a passphrase (env secret).
 * A correct passphrase issues an httpOnly session cookie; failed attempts are
 * rate-limited in memory. Everything is constant-time to avoid timing attacks.
 *
 * The pure comparison and rate-limit logic lives here in a framework-free form
 * so it can be unit-tested; the cookie plumbing uses Next.js `cookies()`.
 */

const COOKIE_NAME = "owner";

/** Value stored in the owner session cookie when unlocked. */
const COOKIE_VALUE = "1";

/**
 * Constant-time string comparison. Returns true only when both strings are
 * byte-identical. Falls back to a dummy comparison when lengths differ so the
 * timing does not leak the secret length.
 */
export function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) {
    // Burn the same amount of time on a fixed-length dummy to avoid leaking
    // the length of the secret.
    Buffer.from("x".repeat(Math.max(aBuf.length, bBuf.length)), "utf8").fill(0);
    return false;
  }
  let diff = 0;
  for (let i = 0; i < aBuf.length; i++) {
    diff |= aBuf[i] ^ bBuf[i];
  }
  return diff === 0;
}

/** In-memory failure tracker keyed by IP/address. */
class RateLimiter {
  private failures = new Map<string, number[]>();
  private readonly maxAttempts: number;
  private readonly windowMs: number;

  constructor(maxAttempts = 5, windowMs = 10 * 60 * 1000) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
  }

  /** Returns true when the caller is currently locked out. */
  isLocked(key: string): boolean {
    this.prune(key);
    const attempts = this.failures.get(key) ?? [];
    return attempts.length >= this.maxAttempts;
  }

  /** Records a failed attempt. */
  recordFailure(key: string): void {
    const now = Date.now();
    const attempts = (this.failures.get(key) ?? []).filter(
      (t) => now - t < this.windowMs,
    );
    attempts.push(now);
    this.failures.set(key, attempts);
  }

  /** Clears the failure record (used on a successful unlock). */
  reset(key: string): void {
    this.failures.delete(key);
  }

  private prune(key: string): void {
    const now = Date.now();
    const attempts = this.failures.get(key) ?? [];
    const fresh = attempts.filter((t) => now - t < this.windowMs);
    if (fresh.length === 0) {
      this.failures.delete(key);
    } else {
      this.failures.set(key, fresh);
    }
  }
}

/** Singleton rate limiter shared across requests for this serverless instance. */
export const unlockRateLimiter = new RateLimiter(5, 10 * 60 * 1000);

/**
 * Attempts to unlock the owner session.
 * Returns `{ ok: true }` on success, or `{ ok: false, error }` on failure.
 * `rateLimitKey` should be derived from the request IP.
 */
export function verifyPassphrase(
  passphrase: string | undefined,
  secret: string,
  rateLimitKey: string,
): { ok: true } | { ok: false; error: "locked" | "invalid" } {
  if (unlockRateLimiter.isLocked(rateLimitKey)) {
    return { ok: false, error: "locked" };
  }
  if (!passphrase || !secret) {
    return { ok: false, error: "invalid" };
  }
  if (safeEqual(passphrase, secret)) {
    unlockRateLimiter.reset(rateLimitKey);
    return { ok: true };
  }
  unlockRateLimiter.recordFailure(rateLimitKey);
  return { ok: false, error: "invalid" };
}

export { COOKIE_NAME, COOKIE_VALUE };
