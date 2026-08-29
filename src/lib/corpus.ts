import { patterns, slugOf } from "@/lib/patterns";
import { rankSlug, syllabus } from "@/lib/syllabus";

/**
 * The retrievable corpus: everything the coach is allowed to answer from.
 *
 * Two sources, deliberately chunked differently. Pattern movements are short
 * and self-contained, so one chunk each. Syllabus sections are only meaningful
 * as a group -- "the defensive techniques for 7th gup" is the answer a student
 * wants, not one technique out of context -- so a section is one chunk.
 *
 * Kept apart from retrieval.ts: this decides what the corpus contains, that
 * decides how it is ranked.
 */

export interface Chunk {
  readonly id: string;
  /**
   * Name the chunk is known by -- a pattern name or a rank. Retrieval boosts a
   * chunk when the query names it outright.
   */
  readonly label: string;
  readonly text: string;
}

function patternChunks(): Chunk[] {
  const chunks: Chunk[] = [];
  for (const p of patterns) {
    const slug = slugOf(p.name);
    chunks.push({
      id: `${slug}:meta`,
      label: p.name,
      text:
        `${p.name} (${p.rank}). ${p.movementCount} movements. ` +
        `Ready posture: ${p.readyStance}. Meaning: ${p.meaning} End: ${p.end}`,
    });
    for (const m of p.movements) {
      chunks.push({
        id: `${slug}:${m.number}`,
        label: p.name,
        text: `${p.name} movement ${m.number}: ${m.text}${m.note ? ` (${m.note})` : ""}`,
      });
    }
  }
  return chunks;
}

function syllabusChunks(): Chunk[] {
  const chunks: Chunk[] = [];
  for (const r of syllabus) {
    const slug = rankSlug(r.rank);
    chunks.push({
      id: `${slug}:meta`,
      label: r.rank,
      text:
        `${r.belt} is ${r.rank}, testing for promotion to ${r.promotesTo}. ` +
        `Its syllabus covers: ${r.sections.map((s) => s.title).join(", ")}.`,
    });
    for (const s of r.sections) {
      // Both names are kept in the text so a student can ask in either language.
      const items = s.items
        .map((i) => (i.korean ? `${i.english} (${i.korean})` : i.english))
        .join("; ");
      chunks.push({
        id: `${slug}:${s.n}`,
        label: r.rank,
        text: `${r.rank} (${r.belt}) ${s.title}: ${items}`,
      });
    }
  }
  return chunks;
}

export const CHUNKS: readonly Chunk[] = [...patternChunks(), ...syllabusChunks()];
