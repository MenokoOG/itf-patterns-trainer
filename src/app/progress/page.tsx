import type { Metadata } from "next";
import ProgressDashboard from "@/components/ProgressDashboard";

export const metadata: Metadata = {
  title: "My progress — ITF Patterns Trainer",
  description: "Where you stand against the syllabus for your rank.",
};

export default function ProgressPage() {
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">My progress</h1>
      <ProgressDashboard />
    </div>
  );
}
