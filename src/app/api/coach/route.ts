import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { retrieve } from "@/lib/retrieval";
import { bearerFrom, verifyIdToken } from "@/lib/verifyIdToken";
import { rateLimit } from "@/lib/rateLimit";

/**
 * RAG coach endpoint. Retrieval is local (lexical over pattern data);
 * generation is Gemini. External call policy: 25s timeout, no retry
 * (student just re-asks), errors returned as structured JSON.
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
  // maxOutputTokens alongside the answer. Measured on a representative coach
  // prompt (8 retrieved chunks): ~650-950 thinking tokens to ~100-130 of
  // answer, so 4000 leaves roughly 3x headroom. If that budget is ever
  // exhausted the model returns MAX_TOKENS with empty text, which is why the
  // finish reason is logged below.
  const model = process.env.GEMINI_MODEL ?? "gemini-3.6-flash";
  const ai = new GoogleGenAI({ apiKey });

  try {
    const result = await ai.models.generateContent({
      model,
      contents: `${system}\n\nExcerpts:\n${context || "(no matching excerpts)"}\n\nStudent question: ${question}`,
      config: { abortSignal: AbortSignal.timeout(25_000), maxOutputTokens: 4000 },
    });
    const text = result.text ?? "";
    if (!text) {
      // finishReason separates "thinking ate the token budget" (MAX_TOKENS)
      // from a safety block or a genuinely empty candidate. Without it every
      // one of those looks like the same opaque 502 in the browser.
      console.error("coach: empty model response", {
        model,
        finishReason: result.candidates?.[0]?.finishReason,
        usage: result.usageMetadata,
      });
      return NextResponse.json({ error: "The coach had no answer. Try again." }, { status: 502 });
    }
    return NextResponse.json({ answer: text, sources: chunks.map((c) => c.id) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("coach: generation failed", { model, msg });
    const timedOut = msg.toLowerCase().includes("abort") || msg.toLowerCase().includes("timeout");
    return NextResponse.json(
      { error: timedOut ? "The coach timed out. Ask again." : "The coach hit an error. Try again." },
      { status: 502 },
    );
  }
}
