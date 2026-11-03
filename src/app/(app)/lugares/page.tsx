import type { Metadata } from "next";
import { PlacesView } from "./places-view";

export const metadata: Metadata = { title: "Lugares" };

export default function Page() {
  return <PlacesView />;
}
