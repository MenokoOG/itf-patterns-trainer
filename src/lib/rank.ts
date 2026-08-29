import { syllabus } from "@/lib/syllabus";
import { summaries } from "@/lib/patterns";
import type { PatternSummary, SyllabusRank } from "@/lib/types";

/**
 * A student's rank, plus the join between two data files that spell ranks
 * differently.
 *
 * `syllabus.json` names a rank "9th gup". `patterns.json` labels the same rank
 * "Yellow Tip / 9th Gup". Everything here joins on the syllabus spelling, which
 * is also what `users/{uid}.rank` stores and what firestore.rules validates.
 *
 * Rank is set by the student, never inferred from progress: practising Do-San
 * does not make someone 7th gup, an examiner does.
 */

/**
 * The 16 ranks, in curriculum order.
 *
 * Written out rather than derived from syllabus.json so the values are literal
 * types, and because firestore.rules needs the same list and cannot import
 * JSON. Both copies are pinned by tests in rank.test.ts -- if a rank is ever
 * renamed in the handbook data, those fail rather than the app silently
 * rejecting a valid rank.
 */
export const RANKS = [
  "10th gup",
  "9th gup",
  "8th gup",
  "7th gup",
  "6th gup",
  "5th gup",
  "4th gup",
  "3rd gup",
  "2nd gup",
  "1st gup",
  "1st dan",
  "2nd dan",
  "3rd dan",
  "4th dan",
  "5th dan",
  "6th dan",
] as const;

export type RankId = (typeof RANKS)[number];

/** Guards anything read back from Firestore or localStorage. */
export function isRank(value: unknown): value is RankId {
  return typeof value === "string" && (RANKS as readonly string[]).includes(value);
}

/**
 * Normalises a `Pattern.rank` label to its syllabus rank:
 * "Yellow Tip / 9th Gup" -> "9th gup", "1st Dan" -> "1st dan".
 *
 * Returns null rather than guessing, so a future data edit surfaces as a
 * missing pattern instead of a wrong one.
 */
export function rankOfPattern(patternRank: string): RankId | null {
  const tail = patternRank.split("/").pop()?.trim().toLowerCase() ?? "";
  return isRank(tail) ? tail : null;
}

/** Curriculum position; higher means more senior. */
export function rankIndex(rank: RankId): number {
  return RANKS.indexOf(rank);
}

export function rankRecord(rank: RankId): SyllabusRank | undefined {
  return syllabus.find((r) => r.rank === rank);
}

/** Patterns introduced at this rank. */
export function patternsForRank(rank: RankId): PatternSummary[] {
  return summaries().filter((p) => rankOfPattern(p.rank) === rank);
}

/**
 * Patterns from every rank below this one, in curriculum order. ITF grading
 * tests retention of earlier patterns, not only the current rank's.
 */
export function patternsBeforeRank(rank: RankId): PatternSummary[] {
  const limit = rankIndex(rank);
  return summaries().filter((p) => {
    const r = rankOfPattern(p.rank);
    return r !== null && rankIndex(r) < limit;
  });
}
