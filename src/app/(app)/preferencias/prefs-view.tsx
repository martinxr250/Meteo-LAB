"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { BellRing, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { useSession } from "@/components/providers/session";
import { Button, Field, Glass, inputClass, SectionTitle } from "@/components/ui/primitives";
import { api } from "@/lib/api";

interface Prefs { push_enabled: boolean; min_level: "atento" | "alto" | "muy_alto"; phenomena: string[]; quiet_start: number | null; quiet_end: number | null }
const PH = [["granizo", "Granizo"], ["lluvia_intensa", "Lluvia intensa"], ["anegamiento", "Anegamientos"], ["tormenta", "Tormentas"]] as const;

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function PrefsView() {
  const s = useSession();
  const enabled = s.accounts && !!s.user;
  const q = useQuery({ queryKey: ["prefs"], queryFn: () => api<Prefs>("/prefs"), enabled });
  const [edit, setP] = useState<Prefs | null>(null);
  const p = edit ?? q.data ?? null;
  const initialPerm = useSyncExternalStore(
    () => () => {},
    () => (typeof Notification === "undefined" ? "no-soportado" : Notification.permission),
    () => "default" as const,
  );
  const [askedPerm, setPerm] = useState<NotificationPermission | null>(null);
  const perm = askedPerm ?? initialPerm;

  const save = useMutation({
    mutationFn: (next: Prefs) => api("/prefs", { method: "PUT", body: JSON.stringify(next) }),
    onSuccess: () => toast.success("Preferencias guardadas"),
  });

  async function enablePush() {
    if (!s.vapidPublicKey) return toast.error("Las notificaciones push no están configuradas en este entorno");
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return toast.error("Tu navegador no admite notificaciones push");
    const result = await Notification.requestPermission();
    setPerm(result);
    if (result !== "granted") return toast.error("Sin permiso no podemos enviarte avisos");
    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(s.vapidPublicKey) });
    await api("/push", { method: "POST", body: JSON.stringify(sub.toJSON()) });
    const next = { ...(p as Prefs), push_enabled: true };
    setP(next);
    save.mutate(next);
  }

  if (!enabled) {
    return (
      <div className="mx-auto grid max-w-3xl gap-6 pt-2">
        <h1 className="display-title text-4xl">Preferencias</h1>
        <Glass className="p-5 text-sm">
          {s.accounts ? <><Link href="/ingresar" className="text-primary underline">Ingresá</Link> para recibir notificaciones.</> : "Notificaciones disponibles con cuenta (no configurado en este entorno)."}
        </Glass>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-3xl gap-6 pt-2">
      <h1 className="display-title text-4xl">Preferencias</h1>

      <Glass className="grid gap-4 p-5">
        <SectionTitle title="Avisos en este dispositivo" />
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <BellRing className="size-5 text-primary" />
          <span>Permiso del navegador: <strong>{perm === "granted" ? "concedido" : perm === "denied" ? "bloqueado" : perm === "no-soportado" ? "no disponible" : "sin pedir"}</strong></span>
          <Button size="sm" onClick={enablePush} disabled={perm === "denied"}>Activar notificaciones</Button>
        </div>
        <p className="text-xs text-muted-foreground">Los avisos del SMN te llegan siempre, incluso en horario silencioso.</p>
        {p && (
          <>
            <Field label="Nivel mínimo para estimaciones del sistema">
              <select className={inputClass} value={p.min_level} onChange={(e) => setP({ ...p, min_level: e.target.value as Prefs["min_level"] })}>
                <option value="atento">Atención o más</option>
                <option value="alto">Alto o más</option>
                <option value="muy_alto">Solo muy alto</option>
              </select>
            </Field>
            <fieldset className="grid gap-2 text-sm">
              <legend className="mb-1 font-medium">Fenómenos</legend>
              <div className="flex flex-wrap gap-2">
                {PH.map(([k, label]) => {
                  const on = p.phenomena.includes(k);
                  return (
                    <button key={k} aria-pressed={on} onClick={() => setP({ ...p, phenomena: on ? p.phenomena.filter((x) => x !== k) : [...p.phenomena, k] })} className={`rounded-full px-3.5 py-2 ${on ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{label}</button>
                  );
                })}
              </div>
            </fieldset>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Silencio desde (h)">
                <input type="number" min={0} max={23} className={inputClass} value={p.quiet_start ?? ""} onChange={(e) => setP({ ...p, quiet_start: e.target.value === "" ? null : Number(e.target.value) })} />
              </Field>
              <Field label="Hasta (h)">
                <input type="number" min={0} max={23} className={inputClass} value={p.quiet_end ?? ""} onChange={(e) => setP({ ...p, quiet_end: e.target.value === "" ? null : Number(e.target.value) })} />
              </Field>
            </div>
            <Button onClick={() => save.mutate(p)} disabled={save.isPending} className="justify-self-start">Guardar</Button>
          </>
        )}
      </Glass>

      <MfaCard active={s.mfa} />
    </div>
  );
}

function MfaCard({ active }: { active: boolean }) {
  const [enroll, setEnroll] = useState<{ factorId: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const start = useMutation({ mutationFn: () => api<{ factorId: string; qr: string; secret: string }>("/auth/mfa", { method: "POST", body: JSON.stringify({ action: "enroll" }) }), onSuccess: setEnroll });
  const verify = useMutation({
    mutationFn: () => api("/auth/mfa", { method: "POST", body: JSON.stringify({ action: "verify", factorId: enroll!.factorId, code }) }),
    onSuccess: () => {
      toast.success("Verificación en dos pasos activa");
      location.reload();
    },
  });
  return (
    <Glass className="grid gap-3 p-5">
      <SectionTitle title="Verificación en dos pasos" />
      <p className="flex items-center gap-2 text-sm"><ShieldCheck className="size-5 text-primary" /> {active ? "Sesión verificada con segundo factor." : "Obligatoria para moderar reportes y entrar al panel operativo."}</p>
      {!active && !enroll && <Button size="sm" className="justify-self-start" onClick={() => start.mutate()}>Configurar app de autenticación</Button>}
      {enroll && (
        <div className="grid gap-3">
          {/* El QR lo genera Supabase como data URI SVG. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={enroll.qr} alt="Código QR para la app de autenticación" className="size-44 rounded-xl bg-white p-2" />
          <p className="text-xs text-muted-foreground">O ingresá la clave manualmente: <code className="break-all">{enroll.secret}</code></p>
          <div className="flex gap-2">
            <input className={inputClass} inputMode="numeric" maxLength={6} placeholder="Código de 6 dígitos" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
            <Button onClick={() => verify.mutate()} disabled={code.length !== 6}>Verificar</Button>
          </div>
        </div>
      )}
    </Glass>
  );
}
