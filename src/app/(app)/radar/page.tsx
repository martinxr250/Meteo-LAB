import type { Metadata } from "next";
import { RadarView } from "./radar-view";

export const metadata: Metadata = { title: "Radar" };

export default function Page() {
  return <RadarView />;
}
