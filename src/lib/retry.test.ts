import { describe, expect, it, vi } from "vitest";
import { withRetry } from "@/lib/retry";

/**
 * Clock and sleep are faked, so these assert the policy -- how many calls, how
 * long waited -- without any real delay. `sleep` advances the fake clock the
 * way a real wait would, which is what makes the deadline assertions mean
 * anything.
 */
function harness(startMs = 0) {
  let clock = startMs;
  const waits: number[] = [];
  return {
    now: () => clock,
    advance: (ms: number) => {
      clock += ms;
    },
    waits,
    sleep: async (ms: number) => {
      waits.push(ms);
      clock += ms;
    },
  };
}

const RETRYABLE = "retryable";
const isRetryable = (e: unknown) => e instanceof Error && e.message === RETRYABLE;

describe("withRetry", () => {
  it("returns the first success without sleeping", async () => {
    const h = harness();
    const run = vi.fn(async () => "ok");

    const result = await withRetry(run, {
      attempts: 3,
      backoffMs: [500, 1500],
      deadline: 25_000,
      isRetryable,
      now: h.now,
      sleep: h.sleep,
    });

    expect(result).toBe("ok");
    expect(run).toHaveBeenCalledTimes(1);
    expect(h.waits).toEqual([]);
  });

  it("recovers from a transient failure on the next attempt", async () => {
    const h = harness();
    // The shape of the real bug: one fast upstream 503, then a normal answer.
    const run = vi
      .fn<(remainingMs: number) => Promise<string>>()
      .mockRejectedValueOnce(new Error(RETRYABLE))
      .mockResolvedValueOnce("answer");

    const result = await withRetry(run, {
      attempts: 3,
      backoffMs: [500, 1500],
      deadline: 25_000,
      isRetryable,
      now: h.now,
      sleep: h.sleep,
    });

    expect(result).toBe("answer");
    expect(run).toHaveBeenCalledTimes(2);
    expect(h.waits).toEqual([500]);
  });

  it("gives up after the last attempt and throws the final error", async () => {
    const h = harness();
    const run = vi.fn(async () => {
      throw new Error(RETRYABLE);
    });

    await expect(
      withRetry(run, {
        attempts: 3,
        backoffMs: [500, 1500],
        deadline: 25_000,
        isRetryable,
        now: h.now,
        sleep: h.sleep,
      }),
    ).rejects.toThrow(RETRYABLE);

    expect(run).toHaveBeenCalledTimes(3);
    // No backoff after the final attempt -- nothing follows it.
    expect(h.waits).toEqual([500, 1500]);
  });

  it("does not retry an error the caller calls permanent", async () => {
    const h = harness();
    const run = vi.fn(async () => {
      throw new Error("bad request");
    });

    await expect(
      withRetry(run, {
        attempts: 3,
        backoffMs: [500, 1500],
        deadline: 25_000,
        isRetryable,
        now: h.now,
        sleep: h.sleep,
      }),
    ).rejects.toThrow("bad request");

    expect(run).toHaveBeenCalledTimes(1);
    expect(h.waits).toEqual([]);
  });

  it("hands each attempt the budget it has left", async () => {
    const h = harness();
    const seen: number[] = [];
    const run = vi.fn(async (remainingMs: number) => {
      seen.push(remainingMs);
      h.advance(2_000); // the call itself takes time
      throw new Error(RETRYABLE);
    });

    await expect(
      withRetry(run, {
        attempts: 3,
        backoffMs: [500, 1500],
        deadline: 25_000,
        isRetryable,
        now: h.now,
        sleep: h.sleep,
      }),
    ).rejects.toThrow(RETRYABLE);

    // 25000, then minus 2000 call + 500 backoff, then minus 2000 + 1500.
    expect(seen).toEqual([25_000, 22_500, 19_000]);
  });

  it("stops rather than starting an attempt past the deadline", async () => {
    const h = harness();
    const run = vi.fn(async () => {
      h.advance(20_000);
      throw new Error(RETRYABLE);
    });

    await expect(
      withRetry(run, {
        attempts: 5,
        backoffMs: [500, 500, 500, 500],
        deadline: 25_000,
        isRetryable,
        now: h.now,
        sleep: h.sleep,
      }),
    ).rejects.toThrow(RETRYABLE);

    // 0 -> 20000 (+500 backoff) -> 20500 -> 40500, which is past the deadline,
    // so no third attempt is started.
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("skips a backoff it cannot afford instead of burning the budget", async () => {
    const h = harness();
    const run = vi.fn(async () => {
      h.advance(24_800);
      throw new Error(RETRYABLE);
    });

    await expect(
      withRetry(run, {
        attempts: 3,
        backoffMs: [500, 500],
        deadline: 25_000,
        isRetryable,
        now: h.now,
        sleep: h.sleep,
      }),
    ).rejects.toThrow(RETRYABLE);

    expect(run).toHaveBeenCalledTimes(1);
    expect(h.waits).toEqual([]);
  });

  it("reports every failed attempt to onError", async () => {
    const h = harness();
    const attempts: number[] = [];
    const run = vi.fn(async () => {
      throw new Error(RETRYABLE);
    });

    await expect(
      withRetry(run, {
        attempts: 3,
        backoffMs: [500, 1500],
        deadline: 25_000,
        isRetryable,
        onError: (_e, attempt) => attempts.push(attempt),
        now: h.now,
        sleep: h.sleep,
      }),
    ).rejects.toThrow(RETRYABLE);

    expect(attempts).toEqual([1, 2, 3]);
  });

  it("throws explicitly when the deadline has already passed", async () => {
    const h = harness(30_000);
    const run = vi.fn(async () => "unreachable");

    await expect(
      withRetry(run, {
        attempts: 3,
        backoffMs: [500],
        deadline: 25_000,
        isRetryable,
        now: h.now,
        sleep: h.sleep,
      }),
    ).rejects.toThrow("retry budget exhausted before the first attempt");

    expect(run).not.toHaveBeenCalled();
  });
});
