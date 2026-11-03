import type { Metadata } from "next";
import { PrefsView } from "./prefs-view";

export const metadata: Metadata = { title: "Preferencias" };

export default function Page() {
  return <PrefsView />;
}
