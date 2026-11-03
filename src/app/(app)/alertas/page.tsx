import type { Metadata } from "next";
import { AlertsCenter } from "./alerts-center";

export const metadata: Metadata = { title: "Centro de alertas" };

export default function Page() {
  return <AlertsCenter />;
}
