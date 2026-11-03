import type { Metadata } from "next";
import { OpsView } from "./ops-view";

export const metadata: Metadata = { title: "Operaciones" };

export default function Page() {
  return <OpsView />;
}
