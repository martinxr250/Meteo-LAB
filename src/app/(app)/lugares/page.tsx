import type { Metadata } from "next";
import { AccountGate } from "@/components/shell/account-gate";
import { PlacesView } from "./places-view";

export const metadata: Metadata = { title: "Lugares" };

export default function Page() {
  return (
    <AccountGate title="Lugares" what="Guardá tu casa, tu trabajo o dónde dejaste el auto y te avisamos si se viene una tormenta fuerte ahí.">
      <PlacesView />
    </AccountGate>
  );
}
