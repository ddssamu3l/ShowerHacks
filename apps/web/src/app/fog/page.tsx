import type { Metadata } from "next";
import { FogWipe } from "@/components/fog/FogWipe";

export const metadata: Metadata = { title: "Fog Wipe · Vibecodemaxxing" };

export default function FogPage() {
  return <FogWipe />;
}
