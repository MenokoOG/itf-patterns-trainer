"use client";

import { doc, getDoc, setDoc } from "firebase/firestore";
import { firestoreDb } from "@/lib/firebase";
import { isRank, type RankId } from "@/lib/rank";
import { mergeChangesRemote, mergeProgress } from "@/lib/mergeProgress";
import type { PatternProgress, ProgressMap } from "@/lib/types";

/**
 * Per-student progress and rank. Firestore when signed in (users/{uid} doc,
 * a `progress` map keyed by pattern slug plus a `rank` string); localStorage
 * otherwise. All failures degrade to local state and are logged, never thrown
 * to UI.
 *
 * The document shape is pinned by firestore.rules, which validates `rank`
 * against the same 16 strings as src/lib/rank.ts.
 */

const LS_KEY = "itf-progress-v1";
const LS_RANK_KEY = "itf-rank-v1";

export interface UserDoc {
  progress: ProgressMap;
  rank: RankId | null;
}

function readLocal(): ProgressMap {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? "{}") as ProgressMap;
  } catch {
    return {};
  }
}

function writeLocal(map: ProgressMap): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(map));
  } catch (e) {
    console.warn("progress: localStorage write failed", e);
  }
}

function readLocalRank(): RankId | null {
  try {
    const raw = localStorage.getItem(LS_RANK_KEY);
    return isRank(raw) ? raw : null;
  } catch {
    return null;
  }
}

function writeLocalRank(rank: RankId): void {
  try {
    localStorage.setItem(LS_RANK_KEY, rank);
  } catch (e) {
    console.warn("progress: localStorage rank write failed", e);
  }
}

function clearLocal(): void {
  try {
    localStorage.removeItem(LS_KEY);
    localStorage.removeItem(LS_RANK_KEY);
  } catch (e) {
    console.warn("progress: localStorage clear failed", e);
  }
}

/** Progress and rank in a single read. */
export async function loadUserDoc(uid: string | null): Promise<UserDoc> {
  const db = firestoreDb();
  if (uid && db) {
    try {
      const snap = await getDoc(doc(db, "users", uid));
      const data = snap.data();
      const rank = data?.rank;
      return {
        progress: (data?.progress as ProgressMap | undefined) ?? {},
        rank: isRank(rank) ? rank : null,
      };
    } catch (e) {
      console.error("progress: firestore read failed, using local", e);
    }
  }
  return { progress: readLocal(), rank: readLocalRank() };
}

export async function loadProgress(uid: string | null): Promise<ProgressMap> {
  return (await loadUserDoc(uid)).progress;
}

export async function saveProgress(
  uid: string | null,
  slug: string,
  update: Partial<PatternProgress>,
): Promise<ProgressMap> {
  const current = await loadProgress(uid);
  const prev: PatternProgress = current[slug] ?? { practiced: 0, quizBest: 0, updatedAt: 0 };
  const next: PatternProgress = {
    // `practiced` is a count of completed run-throughs, so an update adds to it.
    // It used to assign, which pinned every student's count at 1 forever.
    practiced: prev.practiced + (update.practiced ?? 0),
    quizBest: Math.max(prev.quizBest, update.quizBest ?? 0),
    updatedAt: Date.now(),
  };
  const map = { ...current, [slug]: next };
  const db = firestoreDb();
  if (uid && db) {
    try {
      await setDoc(doc(db, "users", uid), { progress: map }, { merge: true });
    } catch (e) {
      console.error("progress: firestore write failed, using local", e);
      writeLocal(map);
    }
  } else {
    writeLocal(map);
  }
  return map;
}

export async function saveRank(uid: string | null, rank: RankId): Promise<void> {
  const db = firestoreDb();
  if (uid && db) {
    try {
      await setDoc(doc(db, "users", uid), { rank }, { merge: true });
      return;
    } catch (e) {
      console.error("progress: firestore rank write failed, using local", e);
    }
  }
  writeLocalRank(rank);
}

/**
 * Folds signed-out progress into the account on sign-in, then clears the local
 * copy. Runs once per sign-in from AuthContext, before any page reads progress.
 *
 * Safe to run repeatedly: mergeProgress takes the max of each field, so a retry
 * after a failed write cannot double-count. Local state is cleared only after
 * the write resolves -- if it throws, the local copy survives for the next
 * attempt.
 *
 * Rank follows a simpler rule: one already on the account wins, since it may
 * have come from another device.
 */
export async function mergeLocalIntoAccount(uid: string): Promise<void> {
  const db = firestoreDb();
  if (!db) return;

  const local = readLocal();
  const localRank = readLocalRank();
  if (Object.keys(local).length === 0 && !localRank) return;

  try {
    const remote = await loadUserDoc(uid);
    const needsProgress = mergeChangesRemote(local, remote.progress);
    const needsRank = localRank !== null && remote.rank === null;

    if (needsProgress || needsRank) {
      const payload: { progress?: ProgressMap; rank?: RankId } = {};
      if (needsProgress) payload.progress = mergeProgress(local, remote.progress);
      if (needsRank && localRank) payload.rank = localRank;
      await setDoc(doc(db, "users", uid), payload, { merge: true });
    }
    clearLocal();
  } catch (e) {
    // Keep the local copy so the next sign-in retries rather than losing it.
    console.error("progress: sign-in merge failed, keeping local copy", e);
  }
}
