import type { Metadata } from "next";
import { MapView } from "./map-view";

export const metadata: Metadata = { title: "Mapa" };

export default function Page() {
  return <MapView />;
}
