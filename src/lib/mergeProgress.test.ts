import { describe, expect, it } from "vitest";
import { mergeChangesRemote, mergeProgress } from "@/lib/mergeProgress";
import type { ProgressMap } from "@/lib/types";

function entry(practiced: number, quizBest: number, updatedAt: number) {
  return { practiced, quizBest, updatedAt };
}

describe("mergeProgress", () => {
  it("keeps patterns that exist on only one side", () => {
    const local: ProgressMap = { "chon-ji": entry(2, 80, 100) };
    const remote: ProgressMap = { "dan-gun": entry(1, 60, 200) };

    expect(mergeProgress(local, remote)).toEqual({
      "chon-ji": entry(2, 80, 100),
      "dan-gun": entry(1, 60, 200),
    });
  });

  it("takes the max of every field when both sides have the pattern", () => {
    const local: ProgressMap = { "chon-ji": entry(5, 40, 100) };
    const remote: ProgressMap = { "chon-ji": entry(2, 90, 300) };

    expect(mergeProgress(local, remote)).toEqual({ "chon-ji": entry(5, 90, 300) });
  });

  it("is idempotent, so a retried sign-in cannot double-count", () => {
    const local: ProgressMap = { "chon-ji": entry(3, 70, 100) };
    const remote: ProgressMap = { "chon-ji": entry(1, 90, 50) };

    const once = mergeProgress(local, remote);
    const twice = mergeProgress(local, once);

    expect(twice).toEqual(once);
  });

  it("does not mutate either input", () => {
    const local: ProgressMap = { "chon-ji": entry(3, 70, 100) };
    const remote: ProgressMap = { "chon-ji": entry(1, 90, 50) };

    mergeProgress(local, remote);

    expect(local).toEqual({ "chon-ji": entry(3, 70, 100) });
    expect(remote).toEqual({ "chon-ji": entry(1, 90, 50) });
  });

  it("handles either side being empty", () => {
    const some: ProgressMap = { "chon-ji": entry(1, 50, 10) };

    expect(mergeProgress({}, some)).toEqual(some);
    expect(mergeProgress(some, {})).toEqual(some);
    expect(mergeProgress({}, {})).toEqual({});
  });

  it("recovers the signed-out history that used to be discarded on sign-in", () => {
    // The regression this exists to prevent: a week of signed-out practice
    // against a brand-new account.
    const local: ProgressMap = {
      "chon-ji": entry(7, 100, 500),
      "dan-gun": entry(3, 80, 400),
    };

    expect(mergeProgress(local, {})).toEqual(local);
  });
});

describe("mergeChangesRemote", () => {
  it("is false when local adds nothing, so sign-in spends no write", () => {
    const local: ProgressMap = { "chon-ji": entry(1, 50, 10) };
    const remote: ProgressMap = { "chon-ji": entry(4, 90, 90) };

    expect(mergeChangesRemote(local, remote)).toBe(false);
    expect(mergeChangesRemote({}, remote)).toBe(false);
  });

  it("is true when local knows a pattern the account does not", () => {
    expect(mergeChangesRemote({ "chon-ji": entry(1, 0, 10) }, {})).toBe(true);
  });

  it("is true when any single field is ahead locally", () => {
    const remote: ProgressMap = { "chon-ji": entry(2, 50, 100) };

    expect(mergeChangesRemote({ "chon-ji": entry(3, 50, 100) }, remote)).toBe(true);
    expect(mergeChangesRemote({ "chon-ji": entry(2, 60, 100) }, remote)).toBe(true);
    expect(mergeChangesRemote({ "chon-ji": entry(2, 50, 101) }, remote)).toBe(true);
  });
});
