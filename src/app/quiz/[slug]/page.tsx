import { notFound } from "next/navigation";
import { allSlugs, bySlug } from "@/lib/patterns";
import Quiz from "@/components/Quiz";

export function generateStaticParams() {
  return allSlugs().map((slug) => ({ slug }));
}

export default async function QuizPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const pattern = bySlug(slug);
  if (!pattern) notFound();
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{pattern.name} quiz</h1>
      <Quiz pattern={pattern} slug={slug} />
    </div>
  );
}
