/**
 * Fixed-window in-memory rate limiter.
 *
 * Scope note: state lives in the process, so it resets on cold start and is not
 * shared across serverless instances. That is enough to stop a single client
 * draining the Gemini quota, and not enough to be a hard guarantee. A durable
 * limiter (Firestore counter or Redis) is the upgrade path when this app runs
 * on more than one instance.
 */

interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();

/** Drop expired windows so the map cannot grow without bound. */
function prune(now: number): void {
  for (const [key, win] of windows) {
    if (win.resetAt <= now) windows.delete(key);
  }
}

export interface RateLimitResult {
  readonly allowed: boolean;
  /** Requests left in the current window. */
  readonly remaining: number;
  /** Seconds until the window resets; suitable for a Retry-After header. */
  readonly retryAfterSeconds: number;
}

/**
 * Count one request against `key` and report whether it is allowed.
 *
 * @param key    Identity to limit on, e.g. a Firebase uid.
 * @param limit  Requests permitted per window.
 * @param windowMs Window length in milliseconds.
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  prune(now);

  const win = windows.get(key);
  if (!win || win.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  win.count += 1;
  const remaining = Math.max(0, limit - win.count);
  return {
    allowed: win.count <= limit,
    remaining,
    retryAfterSeconds: Math.max(1, Math.ceil((win.resetAt - now) / 1000)),
  };
}
