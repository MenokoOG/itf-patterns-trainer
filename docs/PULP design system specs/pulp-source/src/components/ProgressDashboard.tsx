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
        className={
          untouched
            ? "flex items-center justify-between gap-3 rounded-md border border-dashed border-muted/70 px-4 py-3.5 transition duration-200 hover:border-gold"
            : "pulp-row"
        }
      >
        <span className="min-w-0">
          <span className="block truncate font-display text-[19px] font-bold">{p.name}</span>
          <span className="pulp-meta block tracking-[0.12em]">{p.movementCount} mv</span>
        </span>
        {untouched ? (
          <span className="pulp-tag pulp-tag-outline shrink-0">Not started</span>
        ) : (
          <span className="flex shrink-0 gap-1.5">
            <span
              className="pulp-tag pulp-tag-ink"
              title="Completed run-throughs in the stepper"
            >
              {practiced}× practised
            </span>
            <span
              className={
                quizBest >= 80
                  ? "pulp-tag pulp-tag-gold"
                  : quizBest > 0
                    ? "pulp-tag border border-gold/70 text-muted-deep"
                    : "pulp-tag pulp-tag-outline"
              }
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
    return <p className="pulp-meta">Loading your progress…</p>;
  }

  const record = rank ? rankRecord(rank) : undefined;
  const current = rank ? patternsForRank(rank) : [];
  const earlier = rank ? patternsBeforeRank(rank) : [];
  const started = Object.keys(progress).length;

  return (
    <div className="flex flex-col gap-7">
      <section
        aria-label="Rank"
        className="pulp-cover flex flex-col gap-3.5 rounded-lg px-5 py-5.5"
      >
        <span className="pulp-cover-glow -right-16 -top-20 h-52 w-52" aria-hidden="true" />
        <label
          htmlFor="rank"
          className="relative font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-gold"
        >
          My rank
        </label>
        <select
          id="rank"
          value={rank ?? ""}
          onChange={(e) => void onPickRank(e.target.value as RankId)}
          className="pulp-select relative"
        >
          <option value="" disabled>
            Choose your rank…
          </option>
          {RANKS.map((r) => {
            const rec = rankRecord(r);
            return (
              <option key={r} value={r} className="text-ink">
                {r}
                {rec ? ` — ${rec.belt}` : ""}
              </option>
            );
          })}
        </select>
        {record ? (
          <p className="relative text-[15px] leading-[1.7] text-on-ink">
            {record.belt}, testing for <strong className="text-gold">{record.promotesTo}</strong>.
          </p>
        ) : (
          <p className="relative text-[15px] leading-[1.7] text-on-ink">
            Pick your rank to see what your next grading covers. Your instructor
            sets your rank — this is just so the app knows what to show you.
          </p>
        )}
        {!enabled && (
          <p className="relative font-mono text-[11px] leading-relaxed tracking-[0.06em] text-muted">
            Saved on this device only. Sign-in is not configured.
          </p>
        )}
        {enabled && !user && (
          <p className="relative font-mono text-[11px] leading-relaxed tracking-[0.06em] text-muted">
            Saved on this device. Sign in to keep it across devices — your
            existing progress comes with you.
          </p>
        )}
      </section>

      {!rank && started > 0 && (
        <p className="text-[15px] leading-[1.7] text-muted-deep">
          You have progress on {started} pattern{started === 1 ? "" : "s"} so far.
        </p>
      )}

      {rank && record && (
        <>
          <section aria-label={`Patterns for ${rank}`}>
            <div className="pulp-rule">
              <h2 className="pulp-label whitespace-nowrap">Patterns for {rank}</h2>
            </div>
            <ul className="flex flex-col gap-3">
              {current.map((p) => (
                <PatternRow key={p.slug} p={p} entry={progress[p.slug]} />
              ))}
            </ul>
          </section>

          <section aria-label="What the grading covers">
            <div className="pulp-rule mb-2.5">
              <h2 className="pulp-label whitespace-nowrap">What the grading covers</h2>
            </div>
            <p className="mb-4 text-[13px] leading-[1.65] text-muted-deep">
              From the TITF handbook for {rank}. Only patterns are tracked by this
              app — everything else is between you and your instructor.
            </p>
            <ul className="flex flex-col gap-3">
              {record.sections.map((s) => (
                <li key={`${s.n}-${s.title}`} className="pulp-card bg-none bg-cream-lift">
                  <p className="font-display text-base font-bold">
                    <span className="mr-2 font-mono text-xs text-muted">{s.n}</span>
                    {s.title}
                  </p>
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {s.items.map((item, i) => (
                      <li key={i} className="text-[13px] leading-[1.6] text-muted-deep">
                        {item.english}
                        {item.korean && (
                          <span className="font-mono text-[11px] text-muted"> · {item.korean}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </section>

          {earlier.length > 0 && (
            <details className="pulp-panel">
              <summary className="pulp-label cursor-pointer">
                Earlier patterns ({earlier.length})
              </summary>
              <p className="mb-3 mt-2.5 text-[13px] leading-[1.65] text-muted-deep">
                Grading tests what you already hold, not only the new material.
              </p>
              <ul className="flex flex-col gap-3">
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
