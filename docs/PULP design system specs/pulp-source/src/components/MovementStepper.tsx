"use client";

import { useRef, useState } from "react";
import type { Pattern } from "@/lib/types";
import { useAuth } from "@/context/AuthContext";
import { saveProgress } from "@/lib/progress";

/**
 * One movement at a time (practice view) or the full numbered list.
 * Counts a run-through when the student reaches the final movement.
 */
export default function MovementStepper({
  pattern,
  slug,
}: {
  pattern: Pattern;
  slug: string;
}) {
  const [idx, setIdx] = useState(0);
  const [listView, setListView] = useState(false);
  const { user } = useAuth();
  const total = pattern.movements.length;
  const mv = pattern.movements[idx];

  // `practiced` counts run-throughs, so the last movement must score once per
  // run, not once per arrival -- otherwise Back-then-Next inflates the count.
  // Returning to the first movement starts a new run.
  const counted = useRef(false);

  function go(delta: number): void {
    const next = Math.min(total - 1, Math.max(0, idx + delta));
    setIdx(next);
    if (next === 0) counted.current = false;
    if (next === total - 1 && !counted.current) {
      counted.current = true;
      void saveProgress(user?.uid ?? null, slug, { practiced: 1 });
    }
  }

  return (
    <section aria-label="Movements" className="flex flex-col gap-3.5">
      <div className="flex items-center justify-between">
        <h2 className="pulp-label">Movements</h2>
        <button onClick={() => setListView((v) => !v)} className="pulp-link text-ink">
          {listView ? "Step through" : "See full list"}
        </button>
      </div>

      {listView ? (
        <ol className="flex flex-col gap-3">
          {pattern.movements.map((m) => (
            <li key={m.number} className="pulp-card">
              <span className="mr-2.5 font-mono text-xs font-bold tracking-[0.1em] text-muted">
                {String(m.number).padStart(2, "0")}
              </span>
              <span className="text-[15px] leading-[1.7]">{m.text}</span>
              {m.note && (
                <p className="mt-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-deep">
                  {m.note}
                </p>
              )}
            </li>
          ))}
          <li className="pulp-card border-gold bg-none bg-gold/15">
            <span className="mr-2.5 font-mono text-xs font-bold uppercase tracking-[0.18em] text-muted-deep">
              End
            </span>
            <span className="text-[15px] leading-[1.7]">{pattern.end}</span>
          </li>
        </ol>
      ) : (
        <div className="pulp-panel relative overflow-hidden">
          <span
            className="pointer-events-none absolute -top-4 right-1.5 font-display text-[130px] font-bold leading-none text-ink/[0.07]"
            aria-hidden="true"
          >
            {String(mv?.number ?? 0).padStart(2, "0")}
          </span>
          <div className="relative">
            <p className="pulp-meta mb-3 tracking-[0.16em]">
              Movement {mv?.number} of {total}
            </p>
            <p className="min-h-28 text-[17px] leading-[1.7] text-pretty">{mv?.text}</p>
            {mv?.note && (
              <p className="mt-2.5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-deep">
                {mv.note}
              </p>
            )}
            {idx === total - 1 && (
              <p
                className="mt-4 rounded-md border border-gold bg-gold/20 p-3 text-[15px] leading-[1.65]"
                style={{ boxShadow: "0 0 22px rgba(255,217,138,0.45)" }}
              >
                <span className="mr-2 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-muted-deep">
                  End
                </span>
                {pattern.end}
              </p>
            )}
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => go(-1)}
                disabled={idx === 0}
                className="pulp-btn pulp-btn-outline flex-1"
              >
                Back
              </button>
              <button
                onClick={() => go(1)}
                disabled={idx === total - 1}
                className="pulp-btn pulp-btn-ink flex-1"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
