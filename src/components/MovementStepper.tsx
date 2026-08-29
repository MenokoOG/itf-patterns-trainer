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
    <section aria-label="Movements" className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
          Movements
        </h2>
        <button
          onClick={() => setListView((v) => !v)}
          className="rounded px-2 py-1 text-sm text-blue-300 hover:bg-zinc-800"
        >
          {listView ? "Step through" : "See full list"}
        </button>
      </div>

      {listView ? (
        <ol className="space-y-3">
          {pattern.movements.map((m) => (
            <li key={m.number} className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
              <span className="mr-2 font-bold text-blue-400">{m.number}.</span>
              <span className="text-sm leading-relaxed">{m.text}</span>
              {m.note && <p className="mt-1 text-xs italic text-amber-300">{m.note}</p>}
            </li>
          ))}
          <li className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-sm">
            <span className="mr-2 font-bold text-emerald-400">END:</span>
            {pattern.end}
          </li>
        </ol>
      ) : (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <p className="mb-2 text-xs text-zinc-500">
            Movement {mv?.number} of {total}
          </p>
          <p className="min-h-28 text-base leading-relaxed">{mv?.text}</p>
          {mv?.note && <p className="mt-2 text-sm italic text-amber-300">{mv.note}</p>}
          {idx === total - 1 && (
            <p className="mt-3 rounded bg-emerald-950 p-2 text-sm text-emerald-300">
              END: {pattern.end}
            </p>
          )}
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => go(-1)}
              disabled={idx === 0}
              className="flex-1 rounded-lg border border-zinc-700 py-3 font-semibold disabled:opacity-40"
            >
              Back
            </button>
            <button
              onClick={() => go(1)}
              disabled={idx === total - 1}
              className="flex-1 rounded-lg bg-blue-600 py-3 font-semibold text-white disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
