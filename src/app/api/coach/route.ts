import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { retrieve } from "@/lib/retrieval";

/**
 * RAG coach endpoint. Retrieval is local (lexical over pattern data);
 * generation is Gemini. External call policy: 25s timeout, no retry
 * (student just re-asks), errors returned as structured JSON.
 */

export const runtime = "nodejs";

interface CoachRequest {
  question: string;
  pattern?: string;
}

const MAX_QUESTION_LEN = 1000;

export async function POST(req: Request): Promise<NextResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Coach is not configured (missing GEMINI_API_KEY)." },
      { status: 503 },
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
    "Answer ONLY from the provided pattern excerpts. If the excerpts do not contain " +
    "the answer, say you don't have that in the pattern manual and suggest asking " +
    "their instructor. Be brief, clear, and encouraging. Never invent movements. " +
    "This is study help, not a substitute for instruction in the dojang.";

  const model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
  const ai = new GoogleGenAI({ apiKey });

  try {
    const result = await ai.models.generateContent({
      model,
      contents: `${system}\n\nPattern excerpts:\n${context || "(no matching excerpts)"}\n\nStudent question: ${question}`,
      config: { abortSignal: AbortSignal.timeout(25_000), maxOutputTokens: 4000 },
    });
    const text = result.text ?? "";
    if (!text) {
      console.error("coach: empty model response", { model });
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
