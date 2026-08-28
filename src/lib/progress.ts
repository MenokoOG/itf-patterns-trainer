"use client";

import { doc, getDoc, setDoc } from "firebase/firestore";
import { firestoreDb } from "@/lib/firebase";
import type { PatternProgress, ProgressMap } from "@/lib/types";

/**
 * Per-student progress. Firestore when signed in (users/{uid} doc,
 * `progress` field keyed by pattern slug); localStorage otherwise.
 * All failures degrade to local state and are logged, never thrown to UI.
 */

const LS_KEY = "itf-progress-v1";

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

export async function loadProgress(uid: string | null): Promise<ProgressMap> {
  const db = firestoreDb();
  if (uid && db) {
    try {
      const snap = await getDoc(doc(db, "users", uid));
      const data = snap.data();
      return (data?.progress as ProgressMap | undefined) ?? {};
    } catch (e) {
      console.error("progress: firestore read failed, using local", e);
    }
  }
  return readLocal();
}

export async function saveProgress(
  uid: string | null,
  slug: string,
  update: Partial<PatternProgress>,
): Promise<ProgressMap> {
  const current = await loadProgress(uid);
  const prev: PatternProgress = current[slug] ?? { practiced: 0, quizBest: 0, updatedAt: 0 };
  const next: PatternProgress = {
    practiced: update.practiced ?? prev.practiced,
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
