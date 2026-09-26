import type { Metadata } from "next";
import { Play } from "@/components/play/Play";

export const metadata: Metadata = { title: "Playing · Vibecodemaxxing" };

export default function PlayPage() {
  return <Play />;
}
