"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import type { Pattern } from "@/lib/types";
import { useAuth } from "@/context/AuthContext";
import { saveProgress } from "@/lib/progress";

interface Question {
  prompt: string;
  options: string[];
  answer: number; // index into options
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const ai = a[i] as T;
    a[i] = a[j] as T;
    a[j] = ai;
  }
  return a;
}

function buildQuestions(pattern: Pattern): Question[] {
  const qs: Question[] = [];
  const mvs = pattern.movements;

  // "what comes next" questions
  const starts = shuffle(mvs.slice(0, -1).map((m) => m.number)).slice(0, 5);
  for (const n of starts) {
    const correct = mvs.find((m) => m.number === n + 1);
    const current = mvs.find((m) => m.number === n);
    if (!correct || !current) continue;
    const distractors = shuffle(
      mvs.filter((m) => m.number !== n + 1 && m.number !== n).map((m) => m.text),
    ).slice(0, 3);
    const options = shuffle([correct.text, ...distractors]);
    qs.push({
      prompt: `Movement ${n} is: “${current.text}” — what comes next?`,
      options,
      answer: options.indexOf(correct.text),
    });
  }

  // movement count
  const count = pattern.movementCount;
  const countOpts = shuffle([count, count + 2, Math.max(4, count - 2), count + 5]).map(String);
  qs.push({
    prompt: `How many movements does ${pattern.name} have?`,
    options: countOpts,
    answer: countOpts.indexOf(String(count)),
  });

  // ready stance
  const stances = [
    "Parallel Ready Stance",
    "Closed Ready Stance A",
    "Closed Ready Stance B",
    "Closed Ready Stance C",
    "Warrior Ready Stance A",
    "Warrior Ready Stance B",
  ];
  const wrong = shuffle(stances.filter((s) => s !== pattern.readyStance)).slice(0, 3);
  const stanceOpts = shuffle([pattern.readyStance, ...wrong]);
  qs.push({
    prompt: `What is the ready posture for ${pattern.name}?`,
    options: stanceOpts,
    answer: stanceOpts.indexOf(pattern.readyStance),
  });

  return shuffle(qs);
}

/** Never notifies: the snapshot flips once, when React swaps server for client. */
const neverSubscribe = (): (() => void) => () => {};

/**
 * True only once hydration has happened.
 *
 * `useSyncExternalStore` is the hydration-safe way to ask "am I on the
 * client": React uses the server snapshot for SSR *and* for the first client
 * render, so the two agree, then re-renders with the client snapshot. A plain
 * `useState(false)` + effect would do the same job but trips
 * `react-hooks/set-state-in-effect`.
 */
function useHydrated(): boolean {
  return useSyncExternalStore(
    neverSubscribe,
    () => true,
    () => false,
  );
}

export default function Quiz({ pattern, slug }: { pattern: Pattern; slug: string }) {
  const { user } = useAuth();
  const [round, setRound] = useState(0);
  const [qi, setQi] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);

  // Questions are shuffled, so they must be built on the client only. This
  // route is prerendered, so building them during render shuffles once at
  // build time and again in the browser; the two never match and React throws
  // a hydration error on every quiz load. Before hydration this is `null`,
  // which renders the same placeholder on the server and on the first client
  // render — that is what makes hydration agree.
  //
  // `round` is bumped by "Try again" purely to force a fresh shuffle; it is
  // intentionally a dependency even though the callback does not read it.
  const hydrated = useHydrated();
  const questions = useMemo(
    () => (hydrated ? buildQuestions(pattern) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hydrated, pattern, round],
  );

  const total = questions?.length ?? 0;
  // Guarded on `questions`: before they exist `qi` and `total` are both 0, and
  // an unguarded `qi >= total` would report the quiz finished and save 0%.
  const done = questions !== null && qi >= total;
  const pct = total ? Math.round((score / total) * 100) : 0;

  useEffect(() => {
    if (done) void saveProgress(user?.uid ?? null, slug, { quizBest: pct });
  }, [done, pct, slug, user]);

  if (questions === null) {
    return <p className="pulp-meta">Building your quiz…</p>;
  }

  if (done) {
    return (
      <div className="pulp-cover flex flex-col gap-4.5 rounded-lg px-5 py-8 text-center">
        <p
          className="font-display text-[64px] font-bold leading-none text-gold"
          style={{ textShadow: "0 0 32px rgba(255,217,138,0.55)" }}
        >
          {pct}%
        </p>
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-on-ink">
          {score} of {questions.length} correct
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => {
              setRound((r) => r + 1);
              setQi(0);
              setScore(0);
              setPicked(null);
            }}
            className="pulp-btn pulp-btn-gold flex-1"
          >
            Try again
          </button>
          <Link
            href={`/patterns/${slug}`}
            className="pulp-btn flex-1 border border-cream/55 text-cream hover:bg-cream/10"
          >
            Back to pattern
          </Link>
        </div>
      </div>
    );
  }

  const q = questions[qi];
  if (!q) return null;

  const progress = Math.round(((qi + 1) / questions.length) * 100);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2.5">
        <span className="pulp-meta whitespace-nowrap">
          Question {qi + 1} / {questions.length}
        </span>
        <span className="h-1 flex-1 overflow-hidden rounded-full bg-ink/15">
          <span
            className="block h-full bg-gold transition-[width] duration-300"
            style={{ width: `${progress}%`, boxShadow: "0 0 12px rgba(255,217,138,0.8)" }}
          />
        </span>
      </div>

      <p className="text-base leading-[1.7] text-pretty">{q.prompt}</p>

      <div className="flex flex-col gap-3">
        {q.options.map((opt, i) => {
          const state =
            picked === null
              ? "border-muted/55 bg-gradient-to-b from-cream-lift to-cream-shade hover:border-gold hover:-translate-y-0.5"
              : i === q.answer
                ? "border-gold bg-gradient-to-b from-[#fff3d6] to-[#f7e7c0] shadow-[0_0_22px_rgba(255,217,138,0.55)]"
                : i === picked
                  ? "border-ink bg-ink text-on-ink"
                  : "border-muted/40 bg-cream-shade opacity-55";
          return (
            <button
              key={i}
              disabled={picked !== null}
              onClick={() => {
                setPicked(i);
                if (i === q.answer) setScore((s) => s + 1);
              }}
              className={`block w-full rounded-md border px-4 py-3.5 text-left text-[15px] leading-[1.65] transition duration-200 ${state}`}
            >
              {opt}
            </button>
          );
        })}
      </div>

      {picked !== null && (
        <button
          onClick={() => {
            setQi((n) => n + 1);
            setPicked(null);
          }}
          className="pulp-btn pulp-btn-ink w-full"
        >
          {qi + 1 === questions.length ? "See score" : "Next question"}
        </button>
      )}
    </div>
  );
}
