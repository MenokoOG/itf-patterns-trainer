import Link from "next/link";
import { groupedByRank } from "@/lib/patterns";

export default function HomePage() {
  const groups = groupedByRank();
  return (
    <div className="space-y-6">
      <p className="text-sm text-zinc-400">
        Chang-Hon tuls from white belt to 6th dan. Tap a pattern to study its
        movements, then quiz yourself or ask the coach.
      </p>
      {groups.map((g) => (
        <section key={g.rank} aria-label={g.rank}>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-500">
            {g.rank}
          </h2>
          <ul className="space-y-2">
            {g.items.map((p) => (
              <li key={p.slug}>
                <Link
                  href={`/patterns/${p.slug}`}
                  className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 hover:border-blue-700"
                >
                  <span className="font-medium">{p.name}</span>
                  <span className="text-xs text-zinc-500">{p.movementCount} moves</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
