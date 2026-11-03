import type { Metadata } from "next";
import { AccountGate } from "@/components/shell/account-gate";
import { ReportsView } from "./reports-view";

export const metadata: Metadata = { title: "Reportes comunitarios" };

export default function Page() {
  return (
    <AccountGate title="Reportes" what="Contá si cae piedra o se inunda tu calle. Con cuenta para poder moderar.">
      <ReportsView />
    </AccountGate>
  );
}
