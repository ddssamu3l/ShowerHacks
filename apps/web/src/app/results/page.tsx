import type { Metadata } from "next";
import { Results } from "@/components/results/Results";

export const metadata: Metadata = { title: "Results · Vibecodemaxxing" };

export default function ResultsPage() {
  return <Results />;
}
