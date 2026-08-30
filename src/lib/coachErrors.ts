import { ApiError } from "@google/genai";

/**
 * Classification of Gemini failures, which is what decides the message a
 * student sees. Kept out of the route so it can be tested directly: the route
 * needs a signed-in request and a live API call, these need neither.
 *
 * ApiError.message is the response body re-serialised by the SDK
 * (`JSON.stringify(errorBody)` in throwErrorIfNotOK), so the structured error
 * details Google sends are still available to parse back out.
 */

interface QuotaViolation {
  readonly quotaId?: string;
  readonly quotaMetric?: string;
}

/**
 * Upstream failures worth another attempt.
 *
 * Gemini returns 503 UNAVAILABLE ("this model is currently experiencing high
 * demand") intermittently -- reproduced at roughly one call in seven on
 * gemini-3.6-flash -- and it comes back in well under a second, so a retry is
 * cheap and usually succeeds.
 *
 * 429 is deliberately absent: it is a quota ceiling, not a blip, and no
 * backoff we could afford will clear it.
 */
export function isRetryable(e: unknown): boolean {
  return e instanceof ApiError && [500, 502, 503, 504].includes(e.status);
}

export function isOverloaded(e: unknown): boolean {
  return e instanceof ApiError && (e.status === 429 || e.status === 503);
}

/**
 * The endpoint is deployed fine but pointed at something it cannot use: a
 * GEMINI_MODEL Google has retired (404), a rejected key (400 API_KEY_INVALID),
 * or a key without access (403). Indistinguishable from an overload by timing
 * alone -- a retired model came back in 327ms, an overload in 654ms -- so it
 * gets its own branch rather than an anonymous 502. Only a deploy fixes it.
 *
 * 400 also covers a malformed request, which is our bug rather than our
 * config, but the advice is the same either way: this will not fix itself.
 */
export function isMisconfigured(e: unknown): boolean {
  return e instanceof ApiError && [400, 403, 404].includes(e.status);
}

/**
 * A 429 that is the *daily* free-tier allowance rather than a burst limit.
 *
 * This matters because the two need opposite advice and the free-tier daily
 * allowance is small enough to hit in normal teaching use -- 20 requests per
 * day per model at the time of writing, which a single class can exhaust
 * before lunch. Telling a student to "ask again in a moment" when the quota
 * resets at midnight is exactly the kind of misleading message this endpoint
 * has already burned us with once.
 *
 * Google identifies it in a QuotaFailure detail:
 *   quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier"
 * Per-minute ceilings carry PerMinute ids instead. Anything unparseable falls
 * back to false, so an unrecognised 429 keeps the softer "busy" message.
 */
export function isDailyQuotaExhausted(e: unknown): boolean {
  if (!(e instanceof ApiError) || e.status !== 429) return false;

  let violations: readonly QuotaViolation[];
  try {
    const body: unknown = JSON.parse(e.message);
    const details = (body as { error?: { details?: unknown } })?.error?.details;
    if (!Array.isArray(details)) return false;
    const quotaFailure = details.find(
      (d): d is { violations?: unknown } =>
        typeof d === "object" &&
        d !== null &&
        typeof (d as { "@type"?: unknown })["@type"] === "string" &&
        (d as { "@type": string })["@type"].includes("QuotaFailure"),
    );
    if (!quotaFailure || !Array.isArray(quotaFailure.violations)) return false;
    violations = quotaFailure.violations as readonly QuotaViolation[];
  } catch {
    return false;
  }

  return violations.some((v) => (v.quotaId ?? "").includes("PerDay"));
}

export function isTimeout(e: unknown): boolean {
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return msg.includes("abort") || msg.includes("timeout");
}
