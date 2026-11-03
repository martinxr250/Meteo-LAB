import type { Metadata } from "next";
import { SourcesView } from "./sources-view";

export const metadata: Metadata = { title: "Fuentes y metodología" };

export default function Page() {
  return <SourcesView />;
}
