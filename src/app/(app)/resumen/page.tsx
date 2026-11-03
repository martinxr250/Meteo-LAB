import type { Metadata } from "next";
import { Overview } from "./overview";

export const metadata: Metadata = { title: "Resumen" };

export default function Page() {
  return <Overview />;
}
