import { NextResponse } from "next/server";
import { ApiError, GoogleGenAI } from "@google/genai";
import { retrieve } from "@/lib/retrieval";
import { withRetry } from "@/lib/retry";
import { bearerFrom, verifyIdToken } from "@/lib/verifyIdToken";
import { rateLimit } from "@/lib/rateLimit";

/**
 * RAG coach endpoint. Retrieval is local (lexical over pattern data);
 * generation is Gemini. External call policy: 25s total budget, transient
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

/**
 * Upstream failures worth another attempt.
 *
 * Gemini returns 503 UNAVAILABLE ("this model is currently experiencing high
 * demand") intermittently -- reproduced at roughly one call in seven on
 * gemini-3.6-flash -- and it comes back in well under a second, so a retry is
 * cheap and usually succeeds. Without one, a single unlucky call was the whole
 * of "the coach is not working": a 654ms 502 that looked nothing like an
 * overload because every error mapped to the same message.
 *
 * 429 is deliberately absent. Gemini's 429 is quota exhaustion measured over a
 * minute or a day, so it cannot clear inside our backoff -- retrying it only
 * adds seconds to an error the student is going to see anyway. It is answered
 * immediately instead, with Retry-After.
 */
function isRetryable(e: unknown): boolean {
  return e instanceof ApiError && [500, 502, 503, 504].includes(e.status);
}

function isOverloaded(e: unknown): boolean {
  return e instanceof ApiError && (e.status === 429 || e.status === 503);
}

/**
 * The endpoint is deployed fine but pointed at something it cannot use: a
 * GEMINI_MODEL Google has retired (404), a rejected key (400 API_KEY_INVALID),
 * or a key without access (403). This is the failure that hit us before, and
 * it is indistinguishable from an overload by timing alone -- a retired model
 * came back in 327ms, an overload in 654ms -- so it gets its own branch rather
 * than another anonymous 502. Retrying is pointless; only a deploy fixes it.
 *
 * 400 also covers a malformed request, which is our bug rather than our
 * config, but the advice to the student is the same either way: this one will
 * not fix itself, so tell someone.
 */
function isMisconfigured(e: unknown): boolean {
  return e instanceof ApiError && [400, 403, 404].includes(e.status);
}

function isTimeout(e: unknown): boolean {
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return msg.includes("abort") || msg.includes("timeout");
}

export async function POST(req: Request): Promise<NextResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Coach is not configured (missing GEMINI_API_KEY)." },
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

  // Keep this in step with GEMINI_MODEL wherever the app is deployed. Google
  // retires models: gemini-2.5-flash started returning 404 ("no longer
  // available to new users"), which surfaced here as a blanket 502.
  //
  // This is a thinking model, and thinking tokens are charged against
  // maxOutputTokens alongside the answer. Measured on representative coach
  // prompts (8 retrieved chunks): ~500-1150 thinking tokens to ~100-420 of
  // answer, so 4000 leaves roughly 3x headroom. If that budget is ever
  // exhausted the model returns MAX_TOKENS with empty text, which is why the
  // finish reason is logged below.
  const model = process.env.GEMINI_MODEL ?? "gemini-3.6-flash";
  const ai = new GoogleGenAI({ apiKey });
  const prompt = `${system}\n\nExcerpts:\n${context || "(no matching excerpts)"}\n\nStudent question: ${question}`;
  const deadline = Date.now() + GENERATION_BUDGET_MS;

  try {
    const result = await withRetry(
      // Each attempt is bounded by what is left of the shared budget, so a
      // retry can never push the request past GENERATION_BUDGET_MS.
      (remainingMs) =>
        ai.models.generateContent({
          model,
          contents: prompt,
          config: { abortSignal: AbortSignal.timeout(remainingMs), maxOutputTokens: 4000 },
        }),
      {
        attempts: MAX_ATTEMPTS,
        backoffMs: BACKOFF_MS,
        deadline,
        isRetryable,
        onError: (e, attempt) => {
          const status = e instanceof ApiError ? e.status : undefined;
          const msg = e instanceof Error ? e.message : String(e);
          console.error("coach: generation failed", { model, attempt, status, msg });
        },
      },
    );

    const text = result.text ?? "";
    if (!text) {
      // finishReason separates "thinking ate the token budget" (MAX_TOKENS)
      // from a safety block or a genuinely empty candidate. Without it every
      // one of those looks like the same opaque 502 in the browser. Not
      // retried: the same prompt lands in the same place.
      console.error("coach: empty model response", {
        model,
        finishReason: result.candidates?.[0]?.finishReason,
        usage: result.usageMetadata,
      });
      return NextResponse.json({ error: "The coach had no answer. Try again." }, { status: 502 });
    }
    return NextResponse.json({ answer: text, sources: chunks.map((c) => c.id) });
  } catch (e) {
    // Distinct statuses so the next person reading a log or a network panel
    // can tell an upstream capacity blip from a genuine fault. The blanket 502
    // is what made this one take a debugging session to identify.
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
