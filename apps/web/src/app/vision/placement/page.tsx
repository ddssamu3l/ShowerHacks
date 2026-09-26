import type { Metadata } from "next";
import { HandPlacementViewer } from "../hand-placement-viewer";
export const metadata: Metadata = { title: "Tracking Lab · ShowerHacks" };
export default function PlacementPage() { return <HandPlacementViewer />; }
