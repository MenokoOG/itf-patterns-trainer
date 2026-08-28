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
    <article className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold">{pattern.name}</h1>
        <p className="mt-1 text-sm text-zinc-400">
          {pattern.rank} · {pattern.movementCount} movements · {pattern.readyStance}
        </p>
      </header>

      <section aria-label="Meaning" className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="mb-1 text-xs font-semibold uppercase tracking-widest text-zinc-500">
          Meaning
        </h2>
        <p className="text-sm leading-relaxed text-zinc-300">{pattern.meaning}</p>
      </section>

      <div className="flex gap-2">
        <Link
          href={`/quiz/${slug}`}
          className="flex-1 rounded-lg bg-blue-600 px-4 py-3 text-center font-semibold text-white hover:bg-blue-500"
        >
          Quiz me
        </Link>
        <Link
          href={`/coach?pattern=${encodeURIComponent(pattern.name)}`}
          className="flex-1 rounded-lg border border-zinc-700 px-4 py-3 text-center font-semibold hover:border-blue-700"
        >
          Ask the coach
        </Link>
      </div>

      <MovementStepper pattern={pattern} slug={slug} />
    </article>
  );
}
