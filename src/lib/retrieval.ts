import { patterns, slugOf } from "@/lib/patterns";

/**
 * Lightweight lexical retrieval over pattern content (RAG retrieval stage).
 * TF-IDF-weighted token overlap; no external calls, deterministic.
 * Prototype note: swap for embedding search later without changing callers.
 */

export interface Chunk {
  readonly id: string;
  readonly patternName: string;
  readonly text: string;
}

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

function buildChunks(): Chunk[] {
  const chunks: Chunk[] = [];
  for (const p of patterns) {
    const slug = slugOf(p.name);
    chunks.push({
      id: `${slug}:meta`,
      patternName: p.name,
      text:
        `${p.name} (${p.rank}). ${p.movementCount} movements. ` +
        `Ready posture: ${p.readyStance}. Meaning: ${p.meaning} End: ${p.end}`,
    });
    for (const m of p.movements) {
      chunks.push({
        id: `${slug}:${m.number}`,
        patternName: p.name,
        text: `${p.name} movement ${m.number}: ${m.text}${m.note ? ` (${m.note})` : ""}`,
      });
    }
  }
  return chunks;
}

const CHUNKS: Chunk[] = buildChunks();

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
  const scored = CHUNKS.map((c) => {
    const cTokens = new Set(tokenize(c.text));
    let score = 0;
    for (const t of qTokens) {
      if (cTokens.has(t)) score += Math.log(1 + n / (DF.get(t) ?? 1));
    }
    // strong boost when the query names the pattern
    if (query.toLowerCase().includes(c.patternName.toLowerCase())) score += 6;
    return { c, score };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((s) => s.c);
}
