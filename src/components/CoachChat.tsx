"use client";

import { useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";

interface Turn {
  role: "student" | "coach";
  text: string;
}

export default function CoachChat({ pattern }: { pattern?: string }) {
  const { user, enabled, signIn } = useAuth();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function ask(): Promise<void> {
    const question = input.trim();
    if (!question || busy || !user) return;
    setInput("");
    setTurns((t) => [...t, { role: "student", text: question }]);
    setBusy(true);
    try {
      // Sent on every request: tokens are short-lived, and the SDK refreshes
      // from cache, so this is cheap and avoids replaying a stale token.
      const token = await user.getIdToken();
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ question, pattern }),
        signal: AbortSignal.timeout(30_000),
      });
      const data = (await res.json()) as { answer?: string; error?: string };
      const text = res.ok && data.answer ? data.answer : (data.error ?? "Something went wrong.");
      setTurns((t) => [...t, { role: "coach", text }]);
    } catch {
      setTurns((t) => [...t, { role: "coach", text: "Network problem — try again." }]);
    } finally {
      setBusy(false);
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {pattern && (
        <p className="text-xs text-zinc-500">
          Focused on <span className="font-semibold text-zinc-300">{pattern}</span>
        </p>
      )}
      <div className="space-y-3" aria-live="polite">
        {turns.length === 0 && (
          <p className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
            Ask anything about the patterns — “What is movement 12 of Yul-Gok?”,
            “Why does Chon-Ji have 19 movements?”, “Which patterns use a
            bending ready stance?”
          </p>
        )}
        {turns.map((t, i) => (
          <div
            key={i}
            className={
              t.role === "student"
                ? "ml-8 rounded-lg bg-blue-950 p-3 text-sm"
                : "mr-8 whitespace-pre-wrap rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-sm leading-relaxed"
            }
          >
            {t.text}
          </div>
        ))}
        {busy && <p className="text-sm text-zinc-500">Coach is thinking…</p>}
        <div ref={bottomRef} />
      </div>
      {!enabled ? (
        <p className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
          The coach is unavailable because sign-in is not configured.
        </p>
      ) : !user ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
          <p>Sign in to ask the coach. The rest of the trainer works without an account.</p>
          <button
            type="button"
            onClick={() => void signIn()}
            className="mt-3 rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white"
          >
            Sign in
          </button>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void ask();
          }}
          className="sticky bottom-0 flex gap-2 bg-zinc-950 py-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask the coach…"
            aria-label="Question for the coach"
            maxLength={1000}
            className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-3 text-sm placeholder:text-zinc-500"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white disabled:opacity-40"
          >
            Ask
          </button>
        </form>
      )}
    </div>
  );
}
