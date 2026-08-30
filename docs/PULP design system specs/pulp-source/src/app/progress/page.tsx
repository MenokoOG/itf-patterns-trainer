import type { Metadata } from "next";
import ProgressDashboard from "@/components/ProgressDashboard";

export const metadata: Metadata = {
  title: "My progress — ITF Patterns Trainer",
  description: "Where you stand against the syllabus for your rank.",
};

export default function ProgressPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-7 px-4 pt-7">
      <h1 className="pulp-h1">My progress</h1>
      <ProgressDashboard />
    </div>
  );
}
