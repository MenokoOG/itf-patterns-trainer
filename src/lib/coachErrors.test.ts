import { APIConnectionError, APIConnectionTimeoutError, APIError, APIUserAbortError } from "openai";
import { describe, expect, it } from "vitest";
import {
  isMisconfigured,
  isOverloaded,
  isQuotaExhausted,
  isRetryable,
  isTimeout,
} from "@/lib/coachErrors";

/**
 * Errors are built through `APIError.generate`, the same factory the SDK uses
 * on a non-2xx response, from OpenAI's documented error-body shape. Building
 * them by hand would skip the unwrapping of `body.error` -- which is where
 * `code` comes from, and `code` is the whole basis of the quota check.
 */
const errorBody = (message: string, type: string, code: string | null) => ({
  error: { message, type, param: null, code },
});

const fromBody = (status: number, body: object): APIError =>
  APIError.generate(status, body, undefined, new Headers());

const insufficientQuota429 = fromBody(
  429,
  errorBody(
    "You exceeded your current quota, please check your plan and billing details.",
    "insufficient_quota",
    "insufficient_quota",
  ),
);

const rateLimit429 = fromBody(
  429,
  errorBody(
    "Rate limit reached for gpt-5-mini in organization org-x",
    "tokens",
    "rate_limit_exceeded",
  ),
);

const serverError = (status: number) =>
  fromBody(
    status,
    errorBody("The server had an error while processing your request.", "server_error", null),
  );

const invalidKey401 = fromBody(
  401,
  errorBody("Incorrect API key provided.", "invalid_request_error", "invalid_api_key"),
);

const modelNotFound404 = fromBody(
  404,
  errorBody(
    "The model 'gpt-nonexistent' does not exist.",
    "invalid_request_error",
    "model_not_found",
  ),
);

describe("isRetryable", () => {
  it("retries the transient upstream 5xx family", () => {
    for (const status of [500, 502, 503, 504]) {
      expect(isRetryable(serverError(status))).toBe(true);
    }
  });

  it("retries a dropped connection", () => {
    expect(isRetryable(new APIConnectionError({ message: "Connection error." }))).toBe(true);
    expect(isRetryable(new APIConnectionTimeoutError())).toBe(true);
  });

  it("does not retry our own budget abort, which has no time left to spend", () => {
    expect(isRetryable(new APIUserAbortError())).toBe(false);
  });

  it("does not retry a 429, which two seconds of backoff cannot clear", () => {
    expect(isRetryable(insufficientQuota429)).toBe(false);
    expect(isRetryable(rateLimit429)).toBe(false);
  });

  it("does not retry permanent configuration faults", () => {
    expect(isRetryable(invalidKey401)).toBe(false);
    expect(isRetryable(modelNotFound404)).toBe(false);
  });

  it("ignores errors that are not from the API at all", () => {
    expect(isRetryable(new Error("socket hang up"))).toBe(false);
    expect(isRetryable("nope")).toBe(false);
  });
});

describe("isOverloaded", () => {
  it("covers both capacity signals", () => {
    expect(isOverloaded(serverError(503))).toBe(true);
    expect(isOverloaded(rateLimit429)).toBe(true);
  });

  it("leaves other failures alone", () => {
    expect(isOverloaded(modelNotFound404)).toBe(false);
    expect(isOverloaded(serverError(500))).toBe(false);
    expect(isOverloaded(new Error("boom"))).toBe(false);
  });

  it("does not match an abort, whose status is undefined", () => {
    expect(isOverloaded(new APIUserAbortError())).toBe(false);
  });
});

describe("isMisconfigured", () => {
  it("catches a retired model, a rejected key and a forbidden key", () => {
    expect(isMisconfigured(modelNotFound404)).toBe(true);
    expect(isMisconfigured(invalidKey401)).toBe(true);
    for (const status of [400, 403]) {
      expect(isMisconfigured(fromBody(status, errorBody("no", "invalid_request_error", null)))).toBe(
        true,
      );
    }
  });

  it("does not claim a capacity problem is a config problem", () => {
    expect(isMisconfigured(serverError(503))).toBe(false);
    expect(isMisconfigured(rateLimit429)).toBe(false);
  });

  it("does not match an abort, whose status is undefined", () => {
    expect(isMisconfigured(new APIUserAbortError())).toBe(false);
  });
});

describe("isQuotaExhausted", () => {
  it("recognises an exhausted billing balance", () => {
    expect(isQuotaExhausted(insufficientQuota429)).toBe(true);
  });

  it("does not fire for an ordinary rate limit, which needs the opposite advice", () => {
    expect(isQuotaExhausted(rateLimit429)).toBe(false);
  });

  it("does not fire for a 429 with no code at all", () => {
    expect(isQuotaExhausted(fromBody(429, {}))).toBe(false);
    expect(isQuotaExhausted(fromBody(429, errorBody("odd", "tokens", null)))).toBe(false);
  });

  it("does not fire for a non-429 carrying the same code", () => {
    expect(
      isQuotaExhausted(fromBody(503, errorBody("busy", "insufficient_quota", "insufficient_quota"))),
    ).toBe(false);
  });

  it("ignores non-API errors", () => {
    expect(isQuotaExhausted(new Error("insufficient_quota"))).toBe(false);
  });
});

describe("isTimeout", () => {
  it("recognises our own budget abort and the SDK's connection timeout", () => {
    expect(isTimeout(new APIUserAbortError())).toBe(true);
    expect(isTimeout(new APIConnectionTimeoutError())).toBe(true);
  });

  it("recognises an abort raised before the SDK wraps it", () => {
    expect(isTimeout(new Error("This operation was aborted"))).toBe(true);
    expect(isTimeout(new Error("Request timeout"))).toBe(true);
  });

  it("does not treat an ordinary failure as a timeout", () => {
    expect(isTimeout(serverError(503))).toBe(false);
  });
});
