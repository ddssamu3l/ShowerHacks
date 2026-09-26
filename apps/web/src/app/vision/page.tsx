import type { Metadata } from "next";
import { ScrubChallengeView } from "./scrub-challenge";

export const metadata: Metadata = { title: "Soap Rush · ShowerHacks" };
export default function VisionPage() { return <ScrubChallengeView />; }
