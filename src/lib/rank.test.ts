import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  RANKS,
  isRank,
  patternsBeforeRank,
  patternsForRank,
  rankOfPattern,
  rankRecord,
} from "@/lib/rank";
import { patterns } from "@/lib/patterns";
import { syllabus } from "@/lib/syllabus";

describe("RANKS", () => {
  it("matches syllabus.json exactly, in curriculum order", () => {
    expect([...RANKS]).toEqual(syllabus.map((r) => r.rank));
  });

  it("matches the rank list hardcoded in firestore.rules", () => {
    // firestore.rules cannot import JSON, so the vocabulary is duplicated
    // there. If this fails, the rules will reject a rank the app considers
    // valid (or accept one it does not) -- update both.
    const rules = readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8");
    const block = /function isValidRank\(rank\)\s*{[\s\S]*?\[([\s\S]*?)\]/.exec(rules);

    expect(block, "isValidRank not found in firestore.rules").not.toBeNull();

    const inRules = [...(block?.[1] ?? "").matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(inRules).toEqual([...RANKS]);
  });
});

describe("isRank", () => {
  it("accepts every real rank", () => {
    for (const rank of RANKS) expect(isRank(rank)).toBe(true);
  });

  it("rejects free text, near-misses, and non-strings", () => {
    for (const value of [
      "7th Gup", // wrong case
      "7th gup ", // stray whitespace
      "Green Tip / 7th Gup", // the patterns.json spelling
      "black belt",
      "",
      null,
      undefined,
      7,
      {},
    ]) {
      expect(isRank(value)).toBe(false);
    }
  });
});

describe("rankOfPattern", () => {
  it("maps every pattern in the data to a known rank", () => {
    // Guards the join between patterns.json and syllabus.json, which spell
    // ranks differently. A data edit on either side fails here.
    for (const pattern of patterns) {
      expect(rankOfPattern(pattern.rank), `${pattern.name} (${pattern.rank})`).not.toBeNull();
    }
  });

  it("normalises both the belt-prefixed and bare spellings", () => {
    expect(rankOfPattern("Yellow Tip / 9th Gup")).toBe("9th gup");
    expect(rankOfPattern("White Belt / 10th Gup")).toBe("10th gup");
    expect(rankOfPattern("Black Tip / 1st Gup")).toBe("1st gup");
    expect(rankOfPattern("1st Dan")).toBe("1st dan");
    expect(rankOfPattern("6th Dan")).toBe("6th dan");
  });

  it("returns null rather than guessing at an unknown label", () => {
    expect(rankOfPattern("Purple Belt / 12th Gup")).toBeNull();
    expect(rankOfPattern("")).toBeNull();
  });

  it("covers every rank, so no rank renders an empty pattern list", () => {
    for (const rank of RANKS) {
      expect(patternsForRank(rank).length, rank).toBeGreaterThan(0);
    }
  });
});

describe("rank selectors", () => {
  it("returns the syllabus record for every rank", () => {
    for (const rank of RANKS) {
      expect(rankRecord(rank)?.rank, rank).toBe(rank);
    }
  });

  it("puts each pattern at exactly one rank", () => {
    const total = RANKS.reduce((n, rank) => n + patternsForRank(rank).length, 0);
    expect(total).toBe(patterns.length);
  });

  it("returns nothing before the first rank and everything before the last", () => {
    expect(patternsBeforeRank("10th gup")).toEqual([]);
    expect(patternsBeforeRank("6th dan").length).toBe(
      patterns.length - patternsForRank("6th dan").length,
    );
  });

  it("excludes the student's own rank from earlier ranks", () => {
    const own = patternsForRank("8th gup").map((p) => p.slug);
    const earlier = patternsBeforeRank("8th gup").map((p) => p.slug);

    expect(earlier).not.toEqual(expect.arrayContaining(own));
    expect(earlier).toEqual(expect.arrayContaining(["chon-ji"]));
  });
});
