import { ApiError } from "@google/genai";
import { describe, expect, it } from "vitest";
import {
  isDailyQuotaExhausted,
  isMisconfigured,
  isOverloaded,
  isRetryable,
  isTimeout,
} from "@/lib/coachErrors";

/**
 * The bodies below are the real ones, captured from the live API while
 * debugging the coach outage, trimmed only of the prose in `message`. Matching
 * on invented shapes would defeat the point: the daily-quota check reads a
 * field Google chose, and it has to keep matching what Google actually sends.
 */
const dailyQuota429 = JSON.stringify({
  error: {
    code: 429,
    status: "RESOURCE_EXHAUSTED",
    message: "You exceeded your current quota",
    details: [
      {
        "@type": "type.googleapis.com/google.rpc.Help",
        links: [{ description: "Learn more", url: "https://ai.google.dev/" }],
      },
      {
        "@type": "type.googleapis.com/google.rpc.QuotaFailure",
        violations: [
          {
            quotaMetric: "generativelanguage.googleapis.com/generate_content_free_tier_requests",
            quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier",
            quotaDimensions: { location: "global", model: "gemini-3.6-flash" },
            quotaValue: "20",
          },
        ],
      },
      { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "39s" },
    ],
  },
});

const perMinuteQuota429 = JSON.stringify({
  error: {
    code: 429,
    status: "RESOURCE_EXHAUSTED",
    details: [
      {
        "@type": "type.googleapis.com/google.rpc.QuotaFailure",
        violations: [{ quotaId: "GenerateRequestsPerMinutePerProjectPerModel-FreeTier" }],
      },
    ],
  },
});

const overload503 = JSON.stringify({
  error: {
    code: 503,
    status: "UNAVAILABLE",
    message: "This model is currently experiencing high demand.",
  },
});

const apiError = (status: number, message: string) => new ApiError({ status, message });

describe("isRetryable", () => {
  it("retries the transient upstream 5xx family", () => {
    for (const status of [500, 502, 503, 504]) {
      expect(isRetryable(apiError(status, overload503))).toBe(true);
    }
  });

  it("does not retry a quota ceiling, which no backoff can clear", () => {
    expect(isRetryable(apiError(429, dailyQuota429))).toBe(false);
  });

  it("does not retry permanent configuration faults", () => {
    for (const status of [400, 403, 404]) {
      expect(isRetryable(apiError(status, "{}"))).toBe(false);
    }
  });

  it("ignores errors that are not from the API at all", () => {
    expect(isRetryable(new Error("socket hang up"))).toBe(false);
    expect(isRetryable("nope")).toBe(false);
  });
});

describe("isOverloaded", () => {
  it("covers both capacity signals", () => {
    expect(isOverloaded(apiError(503, overload503))).toBe(true);
    expect(isOverloaded(apiError(429, dailyQuota429))).toBe(true);
  });

  it("leaves other failures alone", () => {
    expect(isOverloaded(apiError(404, "{}"))).toBe(false);
    expect(isOverloaded(new Error("boom"))).toBe(false);
  });
});

describe("isMisconfigured", () => {
  it("catches a retired model, a rejected key and a forbidden key", () => {
    for (const status of [400, 403, 404]) {
      expect(isMisconfigured(apiError(status, "{}"))).toBe(true);
    }
  });

  it("does not claim a capacity problem is a config problem", () => {
    expect(isMisconfigured(apiError(503, overload503))).toBe(false);
    expect(isMisconfigured(apiError(429, dailyQuota429))).toBe(false);
  });
});

describe("isDailyQuotaExhausted", () => {
  it("recognises the free-tier daily allowance from the real 429 body", () => {
    expect(isDailyQuotaExhausted(apiError(429, dailyQuota429))).toBe(true);
  });

  it("does not fire for a per-minute burst limit", () => {
    expect(isDailyQuotaExhausted(apiError(429, perMinuteQuota429))).toBe(false);
  });

  it("does not fire for a non-429, even one mentioning a daily quota", () => {
    expect(isDailyQuotaExhausted(apiError(503, dailyQuota429))).toBe(false);
  });

  it("falls back to the softer message when the body is unparseable", () => {
    expect(isDailyQuotaExhausted(apiError(429, "upstream returned html"))).toBe(false);
    expect(isDailyQuotaExhausted(apiError(429, "{}"))).toBe(false);
    expect(isDailyQuotaExhausted(apiError(429, JSON.stringify({ error: { details: "odd" } })))).toBe(
      false,
    );
    expect(
      isDailyQuotaExhausted(
        apiError(429, JSON.stringify({ error: { details: [{ "@type": 42 }] } })),
      ),
    ).toBe(false);
  });

  it("ignores non-API errors", () => {
    expect(isDailyQuotaExhausted(new Error("PerDay"))).toBe(false);
  });
});

describe("isTimeout", () => {
  it("recognises an aborted request", () => {
    expect(isTimeout(new Error("This operation was aborted"))).toBe(true);
    expect(isTimeout(new Error("Request timeout"))).toBe(true);
  });

  it("does not treat an ordinary failure as a timeout", () => {
    expect(isTimeout(apiError(503, overload503))).toBe(false);
  });
});
