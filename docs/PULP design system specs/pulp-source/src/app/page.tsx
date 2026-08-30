import Link from "next/link";
import { groupedByRank } from "@/lib/patterns";

export default function HomePage() {
  const groups = groupedByRank();
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  return (
    <div>
      <section className="pulp-cover px-6 pb-9 pt-8">
        <span className="pulp-cover-glow -right-16 -top-20 h-56 w-56" aria-hidden="true" />
        <div className="relative mx-auto max-w-2xl">
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-gold">
            {total} tuls · Chang-Hon
          </p>
          <h1 className="pulp-h1 pulp-glow-text mt-4">
            The Patterns
            <br />
            Trainer
          </h1>
          <div
            className="mt-4 h-[3px] w-16 bg-gold"
            style={{ boxShadow: "0 0 14px rgba(255,217,138,0.6)" }}
            aria-hidden="true"
          />
          <p className="mt-4 max-w-[330px] text-[15px] leading-relaxed text-on-ink">
            Chang-Hon tuls from white belt to 6th dan. Tap a pattern to study its
            movements, then quiz yourself or ask the coach.
          </p>
        </div>
      </section>

      <div className="mx-auto flex max-w-2xl flex-col gap-8 px-4 pt-8">
        {groups.map((g) => (
          <section key={g.rank} aria-label={g.rank}>
            <div className="pulp-rule">
              <h2 className="pulp-label whitespace-nowrap">{g.rank}</h2>
            </div>
            <ul className="flex flex-col gap-3">
              {g.items.map((p) => (
                <li key={p.slug}>
                  <Link href={`/patterns/${p.slug}`} className="pulp-row">
                    <span className="font-display text-[19px] font-bold">{p.name}</span>
                    <span className="pulp-meta tracking-[0.12em]">{p.movementCount} mv</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
