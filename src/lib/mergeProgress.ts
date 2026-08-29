import type { PatternProgress, ProgressMap } from "@/lib/types";

/**
 * Reconciling signed-out progress with an account.
 *
 * Progress is written to localStorage while signed out and to Firestore while
 * signed in. Before this existed, signing in simply read the Firestore document
 * and the local map was abandoned: a student who practised for a week, then
 * signed in, watched the history disappear.
 *
 * The rule is per-pattern `max` on every field rather than a sum, because the
 * merge must be idempotent. It runs on every sign-in, and a write that fails
 * and is retried must not double-count. The cost is that practising the same
 * pattern both signed-out and signed-in collapses the two runs instead of
 * adding them -- an undercount, which is the safe direction to be wrong in.
 *
 * Pure and dependency-free (the only import is erased at compile time) so it is
 * testable without Firebase.
 */

function mergeOne(a: PatternProgress, b: PatternProgress): PatternProgress {
  return {
    practiced: Math.max(a.practiced, b.practiced),
    quizBest: Math.max(a.quizBest, b.quizBest),
    updatedAt: Math.max(a.updatedAt, b.updatedAt),
  };
}

export function mergeProgress(local: ProgressMap, remote: ProgressMap): ProgressMap {
  const merged: ProgressMap = { ...remote };
  for (const [slug, localEntry] of Object.entries(local)) {
    const remoteEntry = merged[slug];
    merged[slug] = remoteEntry ? mergeOne(localEntry, remoteEntry) : localEntry;
  }
  return merged;
}

/**
 * True when merging would actually change the account, so a sign-in that has
 * nothing to contribute does not spend a write.
 */
export function mergeChangesRemote(local: ProgressMap, remote: ProgressMap): boolean {
  for (const [slug, localEntry] of Object.entries(local)) {
    const remoteEntry = remote[slug];
    if (!remoteEntry) return true;
    if (
      localEntry.practiced > remoteEntry.practiced ||
      localEntry.quizBest > remoteEntry.quizBest ||
      localEntry.updatedAt > remoteEntry.updatedAt
    ) {
      return true;
    }
  }
  return false;
}
