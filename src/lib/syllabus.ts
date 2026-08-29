import raw from "@/data/syllabus.json";
import type { SyllabusRank } from "@/lib/types";

/**
 * Rank syllabus data, in curriculum order: 10th gup through 1st gup, then
 * 1st dan through 6th dan. Extracted from the TITF handbooks by
 * tools/parse_syllabus.py; see docs/adr/0002 for provenance.
 */
export const syllabus: readonly SyllabusRank[] = raw as unknown as SyllabusRank[];

/** URL-safe id for a rank, e.g. "10th gup" -> "10th-gup". */
export function rankSlug(rank: string): string {
  return rank.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function rankBySlug(slug: string): SyllabusRank | undefined {
  return syllabus.find((r) => rankSlug(r.rank) === slug);
}
