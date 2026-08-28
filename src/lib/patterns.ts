import raw from "@/data/patterns.json";
import type { Pattern, PatternSummary } from "@/lib/types";

/** All patterns in curriculum order, as extracted from the source PDF. */
export const patterns: readonly Pattern[] = raw as unknown as Pattern[];

export function slugOf(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function bySlug(slug: string): Pattern | undefined {
  return patterns.find((p) => slugOf(p.name) === slug);
}

export function summaries(): PatternSummary[] {
  return patterns.map((p) => ({
    slug: slugOf(p.name),
    name: p.name,
    rank: p.rank,
    movementCount: p.movementCount,
  }));
}

/** Groups in curriculum order: color-belt gup ranks, then dan ranks. */
export function groupedByRank(): { rank: string; items: PatternSummary[] }[] {
  const groups: { rank: string; items: PatternSummary[] }[] = [];
  for (const s of summaries()) {
    const last = groups[groups.length - 1];
    if (last && last.rank === s.rank) last.items.push(s);
    else groups.push({ rank: s.rank, items: [s] });
  }
  return groups;
}

export function allSlugs(): string[] {
  return patterns.map((p) => slugOf(p.name));
}
