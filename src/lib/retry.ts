/**
 * Bounded retry against a wall-clock deadline.
 *
 * Pulled out of the coach route so the policy can be tested without spending
 * OpenAI credit: `now` and `sleep` are injectable, so the tests run instantly
 * and deterministically. The route keeps the decision of *what* is worth
 * retrying; this only decides *how many times* and *how long*.
 */

export interface RetryOptions {
  /** Total attempts, including the first. */
  readonly attempts: number;
  /** Delay before attempt N+1. Shorter than the list means no further waits. */
  readonly backoffMs: readonly number[];
  /** Epoch ms after which no new attempt starts and no backoff is waited out. */
  readonly deadline: number;
  readonly isRetryable: (e: unknown) => boolean;
  /** Called for every failed attempt, for logging. */
  readonly onError?: (e: unknown, attempt: number) => void;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Runs `run` until it succeeds, the attempts are used up, the error is not
 * retryable, or the deadline leaves no room. `run` receives the milliseconds
 * left in the budget so it can bound its own call -- that is what stops a
 * retry from pushing the request past the deadline.
 *
 * Throws the last error seen. A caller that never got to attempt anything
 * (deadline already passed) gets an explicit error rather than a silent
 * undefined.
 */
export async function withRetry<T>(
  run: (remainingMs: number) => Promise<T>,
  opts: RetryOptions,
): Promise<T> {
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? defaultSleep;

  let lastError: unknown;
  let attempted = false;

  for (let attempt = 1; attempt <= opts.attempts; attempt++) {
    const remaining = opts.deadline - now();
    if (remaining <= 0) break;

    try {
      attempted = true;
      return await run(remaining);
    } catch (e) {
      lastError = e;
      opts.onError?.(e, attempt);
      if (attempt === opts.attempts || !opts.isRetryable(e)) break;

      const backoff = opts.backoffMs[attempt - 1] ?? 0;
      // Waiting out a backoff we cannot afford would burn the rest of the
      // budget and still leave no time to retry.
      if (opts.deadline - now() <= backoff) break;
      await sleep(backoff);
    }
  }

  if (!attempted) throw new Error("retry budget exhausted before the first attempt");
  throw lastError;
}
