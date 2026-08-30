import CoachChat from "@/components/CoachChat";

export default async function CoachPage({
  searchParams,
}: {
  searchParams: Promise<{ pattern?: string }>;
}) {
  const { pattern } = await searchParams;
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 px-4 pt-7">
      <h1 className="pulp-h1">Study coach</h1>
      <CoachChat pattern={pattern} />
    </div>
  );
}
