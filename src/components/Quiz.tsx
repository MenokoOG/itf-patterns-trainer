"use client";

import { useEffect, useMemo, useState } from "react";
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

export default function Quiz({ pattern, slug }: { pattern: Pattern; slug: string }) {
  const { user } = useAuth();
  const [round, setRound] = useState(0);
  // `round` is bumped by "Try again" purely to force a fresh shuffle; it is
  // intentionally a dependency even though the callback does not read it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const questions = useMemo(() => buildQuestions(pattern), [pattern, round]);
  const [qi, setQi] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const done = qi >= questions.length;
  const pct = questions.length ? Math.round((score / questions.length) * 100) : 0;

  useEffect(() => {
    if (done) void saveProgress(user?.uid ?? null, slug, { quizBest: pct });
  }, [done, pct, slug, user]);

  if (done) {
    return (
      <div className="space-y-4 rounded-lg border border-zinc-800 bg-zinc-900 p-5 text-center">
        <p className="text-3xl font-bold">{pct}%</p>
        <p className="text-sm text-zinc-400">
          {score} of {questions.length} correct
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setRound((r) => r + 1);
              setQi(0);
              setScore(0);
              setPicked(null);
            }}
            className="flex-1 rounded-lg bg-blue-600 py-3 font-semibold text-white"
          >
            Try again
          </button>
          <Link
            href={`/patterns/${slug}`}
            className="flex-1 rounded-lg border border-zinc-700 py-3 font-semibold"
          >
            Back to pattern
          </Link>
        </div>
      </div>
    );
  }

  const q = questions[qi];
  if (!q) return null;

  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-500">
        Question {qi + 1} of {questions.length}
      </p>
      <p className="text-sm leading-relaxed">{q.prompt}</p>
      <div className="space-y-2">
        {q.options.map((opt, i) => {
          const state =
            picked === null
              ? "border-zinc-700 hover:border-blue-600"
              : i === q.answer
                ? "border-emerald-500 bg-emerald-950"
                : i === picked
                  ? "border-red-500 bg-red-950"
                  : "border-zinc-800 opacity-60";
          return (
            <button
              key={i}
              disabled={picked !== null}
              onClick={() => {
                setPicked(i);
                if (i === q.answer) setScore((s) => s + 1);
              }}
              className={`block w-full rounded-lg border p-3 text-left text-sm leading-relaxed ${state}`}
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
          className="w-full rounded-lg bg-blue-600 py-3 font-semibold text-white"
        >
          {qi + 1 === questions.length ? "See score" : "Next question"}
        </button>
      )}
    </div>
  );
}
