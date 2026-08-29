"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { loadUserDoc, saveRank } from "@/lib/progress";
import {
  RANKS,
  patternsBeforeRank,
  patternsForRank,
  rankRecord,
  type RankId,
} from "@/lib/rank";
import type { PatternSummary, ProgressMap } from "@/lib/types";

/**
 * Where a student stands against the syllabus for their own rank.
 *
 * Two honesty constraints shape this view:
 *
 * 1. Rank is chosen by the student, never inferred from progress. An examiner
 *    grants rank; practising a pattern does not.
 * 2. The app has data on patterns only. It knows nothing about a student's
 *    stances, sparring, self-defense or theory, so the syllabus requirements
 *    are shown as reference and are visibly marked untracked. A completion bar
 *    over requirements nothing measures would be a lie.
 */

function PatternRow({ p, entry }: { p: PatternSummary; entry?: ProgressMap[string] }) {
  const practiced = entry?.practiced ?? 0;
  const quizBest = entry?.quizBest ?? 0;
  const untouched = !entry || (practiced === 0 && quizBest === 0);

  return (
    <li>
      <Link
        href={`/patterns/${p.slug}`}
        className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 hover:border-blue-700"
      >
        <span className="min-w-0">
          <span className="block truncate font-medium">{p.name}</span>
          <span className="block text-xs text-zinc-500">{p.movementCount} moves</span>
        </span>
        {untouched ? (
          <span className="shrink-0 rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-400">
            Not started
          </span>
        ) : (
          <span className="flex shrink-0 gap-1.5 text-xs">
            <span
              className="rounded bg-blue-950 px-2 py-1 text-blue-300"
              title="Completed run-throughs in the stepper"
            >
              {practiced}× practised
            </span>
            <span
              className={`rounded px-2 py-1 ${
                quizBest >= 80
                  ? "bg-emerald-950 text-emerald-300"
                  : quizBest > 0
                    ? "bg-amber-950 text-amber-300"
                    : "bg-zinc-800 text-zinc-400"
              }`}
              title="Best quiz score"
            >
              {quizBest > 0 ? `${quizBest}%` : "No quiz"}
            </span>
          </span>
        )}
      </Link>
    </li>
  );
}

export default function ProgressDashboard() {
  const { user, enabled, ready } = useAuth();
  const [progress, setProgress] = useState<ProgressMap>({});
  const [rank, setRank] = useState<RankId | null>(null);
  const [loading, setLoading] = useState(true);

  const uid = user?.uid ?? null;

  useEffect(() => {
    // Wait for any sign-in merge to finish, or this reads a half-merged account.
    if (!ready) return;
    let cancelled = false;
    void (async () => {
      const docData = await loadUserDoc(uid);
      if (cancelled) return;
      setProgress(docData.progress);
      setRank(docData.rank);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, uid]);

  async function onPickRank(next: RankId): Promise<void> {
    setRank(next);
    await saveRank(uid, next);
  }

  if (loading || !ready) {
    return <p className="text-sm text-zinc-500">Loading your progress…</p>;
  }

  const record = rank ? rankRecord(rank) : undefined;
  const current = rank ? patternsForRank(rank) : [];
  const earlier = rank ? patternsBeforeRank(rank) : [];
  const started = Object.keys(progress).length;

  return (
    <div className="space-y-6">
      <section
        aria-label="Rank"
        className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900 p-4"
      >
        <label htmlFor="rank" className="block text-xs font-semibold uppercase tracking-widest text-zinc-500">
          My rank
        </label>
        <select
          id="rank"
          value={rank ?? ""}
          onChange={(e) => void onPickRank(e.target.value as RankId)}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-base"
        >
          <option value="" disabled>
            Choose your rank…
          </option>
          {RANKS.map((r) => {
            const rec = rankRecord(r);
            return (
              <option key={r} value={r}>
                {r}
                {rec ? ` — ${rec.belt}` : ""}
              </option>
            );
          })}
        </select>
        {record ? (
          <p className="text-sm text-zinc-400">
            {record.belt}, testing for <strong className="text-zinc-200">{record.promotesTo}</strong>.
          </p>
        ) : (
          <p className="text-sm text-zinc-400">
            Pick your rank to see what your next grading covers. Your instructor
            sets your rank — this is just so the app knows what to show you.
          </p>
        )}
        {!enabled && (
          <p className="text-xs text-zinc-500">
            Saved on this device only. Sign-in is not configured.
          </p>
        )}
        {enabled && !user && (
          <p className="text-xs text-zinc-500">
            Saved on this device. Sign in to keep it across devices — your
            existing progress comes with you.
          </p>
        )}
      </section>

      {!rank && started > 0 && (
        <p className="text-sm text-zinc-400">
          You have progress on {started} pattern{started === 1 ? "" : "s"} so far.
        </p>
      )}

      {rank && record && (
        <>
          <section aria-label={`Patterns for ${rank}`}>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-500">
              Patterns for {rank}
            </h2>
            <ul className="space-y-2">
              {current.map((p) => (
                <PatternRow key={p.slug} p={p} entry={progress[p.slug]} />
              ))}
            </ul>
          </section>

          <section aria-label="What the grading covers">
            <h2 className="mb-1 text-xs font-semibold uppercase tracking-widest text-zinc-500">
              What the grading covers
            </h2>
            <p className="mb-2 text-xs text-zinc-500">
              From the TITF handbook for {rank}. Only patterns are tracked by this
              app — everything else is between you and your instructor.
            </p>
            <ul className="space-y-2">
              {record.sections.map((s) => (
                <li
                  key={`${s.n}-${s.title}`}
                  className="rounded-lg border border-zinc-800 bg-zinc-900 p-3"
                >
                  <p className="text-sm font-medium">
                    <span className="mr-1.5 text-zinc-500">{s.n}.</span>
                    {s.title}
                  </p>
                  <ul className="mt-1.5 space-y-1">
                    {s.items.map((item, i) => (
                      <li key={i} className="text-xs leading-relaxed text-zinc-400">
                        {item.english}
                        {item.korean && (
                          <span className="text-zinc-500"> · {item.korean}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </section>

          {earlier.length > 0 && (
            <details className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-widest text-zinc-500">
                Earlier patterns ({earlier.length})
              </summary>
              <p className="mb-2 mt-2 text-xs text-zinc-500">
                Grading tests what you already hold, not only the new material.
              </p>
              <ul className="space-y-2">
                {earlier.map((p) => (
                  <PatternRow key={p.slug} p={p} entry={progress[p.slug]} />
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}
