import type { Metadata } from "next";
import { AccountGate } from "@/components/shell/account-gate";
import { OpsView } from "./ops-view";

export const metadata: Metadata = { title: "Operaciones" };

export default function Page() {
  return (
    <AccountGate title="Operaciones" what="Panel interno. Requiere cuenta de administración con verificación en dos pasos.">
      <OpsView />
    </AccountGate>
  );
}
