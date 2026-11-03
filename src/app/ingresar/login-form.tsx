"use client";

import { Mail } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Logo, Wordmark } from "@/components/ui/logo";
import { Button, Field, Glass, inputClass } from "@/components/ui/primitives";
import { api } from "@/lib/api";

export function LoginForm({ linkError }: { linkError: boolean }) {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(linkError ? "El enlace venció o ya se usó. Pedí uno nuevo." : null);
  const [busy, setBusy] = useState(false);
  return (
    <main className="grid min-h-dvh place-items-center p-4">
      <div className="sky-scene" aria-hidden />
      <Glass strong className="w-full max-w-sm p-7">
        <Link href="/resumen" className="flex items-center gap-2"><Logo /><Wordmark /></Link>
        <h1 className="display-title mt-6 text-3xl">Ingresar</h1>
        <p className="mt-1 text-sm text-muted-foreground">Te enviamos un enlace de un solo uso. Sin contraseñas.</p>
        <form
          className="mt-5 grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const r = await api<{ message: string }>("/auth/login", { method: "POST", body: JSON.stringify({ email }) });
              setMsg(r.message);
            } catch (err) {
              setMsg(err instanceof Error ? err.message : "Error");
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Correo electrónico">
            <input type="email" required autoComplete="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Button type="submit" disabled={busy}><Mail /> Enviarme el enlace</Button>
        </form>
        {msg && <p role="status" className="mt-4 text-sm">{msg}</p>}
        <p className="mt-6 text-xs text-muted-foreground">También podés usar Meteo-LAB sin cuenta: tus lugares quedan solo en este navegador.</p>
      </Glass>
    </main>
  );
}
