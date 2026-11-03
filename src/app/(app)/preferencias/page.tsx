import type { Metadata } from "next";
import { AccountGate } from "@/components/shell/account-gate";
import { PrefsView } from "./prefs-view";

export const metadata: Metadata = { title: "Notificaciones" };

export default function Page() {
  return (
    <AccountGate title="Notificaciones" what="Elegí qué avisos te llegan al celular y en qué horario.">
      <PrefsView />
    </AccountGate>
  );
}
