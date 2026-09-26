import type { Metadata } from "next";
import { VisionArcade } from "../vision-arcade";

export const metadata: Metadata = { title: "Scrub Fighter · Vision Arcade" };
export default function ArcadePage() { return <VisionArcade />; }
