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
    <div className="flex flex-col gap-5">
      {pattern && (
        <p className="pulp-meta tracking-[0.16em]">
          Focused on <span className="border-b border-gold text-ink">{pattern}</span>
        </p>
      )}
      <div className="flex flex-col gap-3.5" aria-live="polite">
        {turns.length === 0 && (
          <p className="pulp-ghost text-[15px] leading-[1.7] text-muted-deep">
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
                ? "max-w-[82%] self-end rounded-[16px_16px_4px_16px] bg-ink px-4 py-3.5 text-[15px] leading-[1.65] text-cream"
                : "max-w-[88%] self-start whitespace-pre-wrap rounded-[16px_16px_16px_4px] border border-muted/55 bg-cream-lift px-4 py-3.5 text-[15px] leading-[1.7] shadow-[0_6px_18px_rgba(32,24,16,0.1)]"
            }
          >
            {t.text}
          </div>
        ))}
        {busy && <p className="pulp-meta tracking-[0.16em]">Coach is thinking…</p>}
        <div ref={bottomRef} />
      </div>
      {!enabled ? (
        <p className="pulp-panel text-[15px] leading-[1.7] text-muted-deep">
          The coach is unavailable because sign-in is not configured.
        </p>
      ) : !user ? (
        <div className="pulp-panel text-[15px] leading-[1.7] text-muted-deep">
          <p>Sign in to ask the coach. The rest of the trainer works without an account.</p>
          <button
            type="button"
            onClick={() => void signIn()}
            className="pulp-btn pulp-btn-ink mt-3.5"
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
          className="sticky bottom-0 flex gap-2.5 bg-cream py-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask the coach…"
            aria-label="Question for the coach"
            maxLength={1000}
            className="pulp-input min-w-0 flex-1"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="pulp-btn pulp-btn-gold"
          >
            Ask
          </button>
        </form>
      )}
    </div>
  );
}
