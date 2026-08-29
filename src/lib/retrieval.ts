import { CHUNKS, type Chunk } from "@/lib/corpus";

/**
 * Lightweight lexical retrieval over the corpus (RAG retrieval stage).
 * TF-IDF-weighted token overlap; no external calls, deterministic.
 * Prototype note: swap for embedding search later without changing callers.
 */

export type { Chunk };

const STOP = new Set(
  "a an and the to with while of in on for is it as at by or be this that".split(" "),
);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

const DF: Map<string, number> = (() => {
  const df = new Map<string, number>();
  for (const c of CHUNKS) {
    for (const t of new Set(tokenize(c.text))) df.set(t, (df.get(t) ?? 0) + 1);
  }
  return df;
})();

export function retrieve(query: string, k = 8): Chunk[] {
  const qTokens = tokenize(query);
  if (qTokens.length === 0) return [];
  const n = CHUNKS.length;
  const lowered = query.toLowerCase();
  const scored = CHUNKS.map((c) => {
    const cTokens = new Set(tokenize(c.text));
    let score = 0;
    for (const t of qTokens) {
      if (cTokens.has(t)) score += Math.log(1 + n / (DF.get(t) ?? 1));
    }
    // Normalise by chunk length. Syllabus sections are far longer than single
    // movements, and without this they win on sheer token count: a question
    // about one rank pulls in unrelated ranks whose sections happen to be long.
    score /= Math.sqrt(cTokens.size || 1);
    // strong boost when the query names the pattern or rank outright
    if (lowered.includes(c.label.toLowerCase())) score += 6;
    return { c, score };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((s) => s.c);
}
