import { NextResponse } from "next/server";
import OpenAI, { APIError } from "openai";
import {
  isMisconfigured,
  isOverloaded,
  isQuotaExhausted,
  isRetryable,
  isTimeout,
} from "@/lib/coachErrors";
import { retrieve } from "@/lib/retrieval";
import { withRetry } from "@/lib/retry";
import { bearerFrom, verifyIdToken } from "@/lib/verifyIdToken";
import { rateLimit } from "@/lib/rateLimit";

/**
 * RAG coach endpoint. Retrieval is local (lexical over pattern data);
 * generation is OpenAI. External call policy: 25s total budget, transient
 * upstream failures retried within it, errors returned as structured JSON.
 *
 * Access: sign-in required. The endpoint spends money on every call, so it is
 * gated on a verified Firebase ID token and rate limited per uid. The rest of
 * the app stays sign-in free; only the coach costs anything to serve.
 */

export const runtime = "nodejs";

interface CoachRequest {
  question: string;
  pattern?: string;
}

const MAX_QUESTION_LEN = 1000;
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 5 * 60 * 1000;

/**
 * Wall-clock budget for generation, retries and backoff included. Netlify's
 * synchronous function limit is 60s, so this stays the binding constraint and
 * a request can never be cut off mid-retry by the platform.
 */
const GENERATION_BUDGET_MS = 25_000;
/** The first call plus two retries. */
const MAX_ATTEMPTS = 3;
/** Delay before attempt N+1. */
const BACKOFF_MS = [500, 1500];

export async function POST(req: Request): Promise<NextResponse> {
  // OPENAI_API_KEY is the SDK's own convention; OPEN_AI_KEY is accepted
  // because that is the name the Netlify environment was set up with.
  const apiKey = process.env.OPENAI_API_KEY ?? process.env.OPEN_AI_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Coach is not configured (missing OPENAI_API_KEY)." },
      { status: 503 },
    );
  }

  const user = await verifyIdToken(bearerFrom(req));
  if (!user) {
    return NextResponse.json({ error: "Sign in to ask the coach." }, { status: 401 });
  }

  const limit = rateLimit(user.uid, RATE_LIMIT, RATE_WINDOW_MS);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "You have asked a lot of questions just now. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let body: CoachRequest;
  try {
    body = (await req.json()) as CoachRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question || question.length > MAX_QUESTION_LEN) {
    return NextResponse.json(
      { error: `Question must be 1-${MAX_QUESTION_LEN} characters.` },
      { status: 400 },
    );
  }

  const query = body.pattern ? `${body.pattern} ${question}` : question;
  const chunks = retrieve(query, 8);
  const context = chunks.map((c) => `[${c.id}] ${c.text}`).join("\n");

  const system =
    "You are a Taekwon-Do study coach for students learning Chang-Hon (ITF) patterns. " +
    "The excerpts below come from two sources: pattern movement instructions, and " +
    "the TITF rank syllabus listing what each gup and dan grade must show. " +
    "Answer ONLY from the provided excerpts. If they do not contain the answer, say " +
    "you don't have that in the manual and suggest asking their instructor. Be brief, " +
    "clear, and encouraging. Never invent movements or grading requirements. " +
    "Give Korean terms alongside English when the excerpts provide them. " +
    "This is study help, not a substitute for instruction in the dojang.";

  // Keep this in step with OPENAI_MODEL wherever the app is deployed. Models
  // get retired, and a name this project cannot reach comes back as a 404,
  // which isMisconfigured turns into "tell your instructor" rather than the
  // blanket 502 that cost a debugging session under Gemini.
  const model = process.env.OPENAI_MODEL ?? "gpt-5-mini";
  // maxRetries: 0 because withRetry below owns the retry policy. Leaving the
  // SDK default of 2 in place would multiply out to nine upstream calls and
  // spend the shared budget on backoff we did not choose.
  const openai = new OpenAI({ apiKey, maxRetries: 0 });
  const prompt = `Excerpts:\n${context || "(no matching excerpts)"}\n\nStudent question: ${question}`;
  const deadline = Date.now() + GENERATION_BUDGET_MS;

  try {
    const result = await withRetry(
      // Each attempt is bounded by what is left of the shared budget, so a
      // retry can never push the request past GENERATION_BUDGET_MS.
      (remainingMs) =>
        openai.responses.create(
          {
            model,
            instructions: system,
            input: prompt,
            // Reasoning tokens are charged against max_output_tokens alongside
            // the answer. Grounded recall over eight short excerpts needs very
            // little deliberation, so low effort holds latency and cost down
            // and leaves the budget to the answer itself.
            reasoning: { effort: "low" },
            max_output_tokens: 4000,
          },
          { signal: AbortSignal.timeout(remainingMs) },
        ),
      {
        attempts: MAX_ATTEMPTS,
        backoffMs: BACKOFF_MS,
        deadline,
        isRetryable,
        onError: (e, attempt) => {
          const status = e instanceof APIError ? e.status : undefined;
          const msg = e instanceof Error ? e.message : String(e);
          console.error("coach: generation failed", { model, attempt, status, msg });
        },
      },
    );

    const text = result.output_text.trim();
    if (!text) {
      // incomplete_details separates "reasoning ate the token budget"
      // (max_output_tokens) from a content filter, and status separates both
      // from a generation that failed outright. Without them every one of
      // those looks like the same opaque 502 in the browser. Not retried: the
      // same prompt lands in the same place.
      console.error("coach: empty model response", {
        model,
        status: result.status,
        incompleteReason: result.incomplete_details?.reason,
        usage: result.usage,
      });
      return NextResponse.json({ error: "The coach had no answer. Try again." }, { status: 502 });
    }
    return NextResponse.json({ answer: text, sources: chunks.map((c) => c.id) });
  } catch (e) {
    // Distinct statuses so the next person reading a log or a network panel
    // can tell an upstream capacity blip from a genuine fault. The blanket 502
    // is what made this one take a debugging session to identify.
    //
    // Checked before isOverloaded, which also matches 429: an exhausted
    // balance is the more specific case and needs the opposite advice.
    if (isQuotaExhausted(e)) {
      // The project is out of credit. Nothing the student does clears this and
      // it will not fix itself overnight, so the message points at the only
      // person who can act on it.
      return NextResponse.json(
        {
          error:
            "The coach has run out of its usage allowance and cannot answer until it is topped up. Please tell your instructor.",
        },
        { status: 503 },
      );
    }
    if (isOverloaded(e)) {
      return NextResponse.json(
        { error: "The coach is busy right now. Ask again in a moment." },
        { status: 503, headers: { "Retry-After": "5" } },
      );
    }
    if (isMisconfigured(e)) {
      // Deliberately not "try again" -- repeating the question cannot help,
      // and a student staring at a retry prompt that never works is worse than
      // being told to report it.
      return NextResponse.json(
        { error: "The coach is unavailable and needs attention. Please tell your instructor." },
        { status: 503 },
      );
    }
    if (isTimeout(e)) {
      return NextResponse.json({ error: "The coach timed out. Ask again." }, { status: 504 });
    }
    return NextResponse.json({ error: "The coach hit an error. Try again." }, { status: 502 });
  }
}
