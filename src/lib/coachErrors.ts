import { APIConnectionError, APIConnectionTimeoutError, APIError, APIUserAbortError } from "openai";

/**
 * Classification of OpenAI failures, which is what decides the message a
 * student sees. Kept out of the route so it can be tested directly: the route
 * needs a signed-in request and a live API call, these need neither.
 *
 * The SDK parses the error body for us, so unlike the Gemini version this
 * reads `status` and `code` off the error rather than re-parsing JSON out of
 * the message.
 *
 * Note the class hierarchy: `APIUserAbortError` and `APIConnectionError` both
 * extend `APIError` with an undefined `status`, which is why `statusIn` tests
 * for a number rather than trusting the type.
 */

function statusIn(e: unknown, codes: readonly number[]): boolean {
  return e instanceof APIError && typeof e.status === "number" && codes.includes(e.status);
}

/**
 * Upstream failures worth another attempt.
 *
 * 5xx and dropped connections are transient and usually clear on the next
 * call. `APIConnectionError` covers DNS/socket failures and the SDK's own
 * connection timeout; `APIUserAbortError` is a different class, so our own
 * budget abort does not land here.
 *
 * 429 is deliberately absent: OpenAI's rate limits are per-minute windows and
 * an insufficient_quota is a billing ceiling. Neither clears inside the two
 * seconds of backoff this route can afford.
 */
export function isRetryable(e: unknown): boolean {
  if (e instanceof APIConnectionError) return true;
  return statusIn(e, [500, 502, 503, 504]);
}

export function isOverloaded(e: unknown): boolean {
  return statusIn(e, [429, 503]);
}

/**
 * The endpoint is deployed fine but pointed at something it cannot use: an
 * OPENAI_MODEL that does not exist or the project cannot reach (404), a
 * rejected key (401), or a key whose project lacks access (403). Only a
 * deploy or a dashboard change fixes it, so it must not read as "try again".
 *
 * 400 also covers a malformed request, which is our bug rather than our
 * config, but the advice is the same either way: this will not fix itself.
 */
export function isMisconfigured(e: unknown): boolean {
  return statusIn(e, [400, 401, 403, 404]);
}

/**
 * A 429 that is an exhausted billing balance rather than a burst limit.
 *
 * The two need opposite advice. A rate limit clears within the minute; an
 * `insufficient_quota` means the project is out of credit and stays broken
 * until somebody tops it up, so "ask again in a moment" would be a lie -- the
 * exact kind of misleading message this endpoint has already burned us with
 * once, under Gemini's daily free-tier cap.
 */
export function isQuotaExhausted(e: unknown): boolean {
  return e instanceof APIError && e.status === 429 && e.code === "insufficient_quota";
}

/**
 * Ran out of time: our own budget abort, or the SDK giving up on a connection.
 * The string fallback catches an abort raised before the SDK wraps it.
 */
export function isTimeout(e: unknown): boolean {
  if (e instanceof APIUserAbortError || e instanceof APIConnectionTimeoutError) return true;
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return msg.includes("abort") || msg.includes("timeout");
}
