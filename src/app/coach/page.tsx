import CoachChat from "@/components/CoachChat";

export default async function CoachPage({
  searchParams,
}: {
  searchParams: Promise<{ pattern?: string }>;
}) {
  const { pattern } = await searchParams;
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Study coach</h1>
      <CoachChat pattern={pattern} />
    </div>
  );
}
