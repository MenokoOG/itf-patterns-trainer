import Link from "next/link";
import { notFound } from "next/navigation";
import { allSlugs, bySlug } from "@/lib/patterns";
import MovementStepper from "@/components/MovementStepper";

export function generateStaticParams() {
  return allSlugs().map((slug) => ({ slug }));
}

export default async function PatternPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const pattern = bySlug(slug);
  if (!pattern) notFound();

  return (
    <article>
      <header className="pulp-cover px-6 py-7">
        <span className="pulp-cover-glow -bottom-28 -left-12 h-64 w-64" aria-hidden="true" />
        <div className="relative mx-auto max-w-2xl">
          <h1 className="pulp-h1 pulp-glow-text">{pattern.name}</h1>
          <p className="mt-3.5 font-mono text-[11px] uppercase leading-relaxed tracking-[0.16em] text-gold">
            {pattern.rank} · {pattern.movementCount} movements
            <br />
            <span className="text-on-ink">{pattern.readyStance}</span>
          </p>
        </div>
      </header>

      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 pt-6">
        <section aria-label="Meaning" className="pulp-panel">
          <h2 className="pulp-label mb-2.5">Meaning</h2>
          <p className="text-[15px] leading-[1.75] text-pretty">{pattern.meaning}</p>
        </section>

        <div className="flex gap-3">
          <Link href={`/quiz/${slug}`} className="pulp-btn pulp-btn-gold flex-1">
            Quiz me
          </Link>
          <Link
            href={`/coach?pattern=${encodeURIComponent(pattern.name)}`}
            className="pulp-btn pulp-btn-outline flex-1"
          >
            Ask the coach
          </Link>
        </div>

        <MovementStepper pattern={pattern} slug={slug} />
      </div>
    </article>
  );
}
