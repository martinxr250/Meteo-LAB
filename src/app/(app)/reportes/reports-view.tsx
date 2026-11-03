"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Crosshair, Send } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { useSession } from "@/components/providers/session";
import { KindBadge } from "@/components/risk/badges";
import { Button, Field, Glass, inputClass, Pill, SectionTitle } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { ago } from "@/lib/format";
import { inCoverage } from "@/lib/geo";

interface Report { id: string; phenomenon: string; hail_size: string | null; lat: number; lon: number; observed_at: string; description: string | null; status: string; mine: boolean }
const PH = { granizo: "Granizo", lluvia_intensa: "Lluvia intensa", anegamiento: "Calle anegada", otro: "Otro" } as const;
const HAIL = { menor_1cm: "Menor a 1 cm (arveja)", "1_2cm": "1–2 cm (uva)", "2_4cm": "2–4 cm (nuez)", mayor_4cm: "Más de 4 cm (pelota de golf)" } as const;

export function ReportsView() {
  const { accounts, user } = useSession();
  const qc = useQueryClient();
  const enabled = accounts && !!user;
  const list = useQuery({ queryKey: ["reports"], queryFn: () => api<Report[]>("/reports"), enabled });
  const [ph, setPh] = useState<keyof typeof PH>("granizo");
  const [size, setSize] = useState<keyof typeof HAIL>("menor_1cm");
  const [desc, setDesc] = useState("");
  const [pos, setPos] = useState<{ lat: number; lon: number } | null>(null);

  const send = useMutation({
    mutationFn: () => api("/reports", { method: "POST", body: JSON.stringify({ phenomenon: ph, hail_size: ph === "granizo" ? size : null, lat: pos!.lat, lon: pos!.lon, observed_at: new Date().toISOString(), description: desc || undefined }) }),
    onSuccess: () => {
      toast.success("Gracias. Tu reporte queda pendiente de moderación.");
      setDesc("");
      qc.invalidateQueries({ queryKey: ["reports"] });
    },
  });

  function locate() {
    navigator.geolocation?.getCurrentPosition(
      (p) => (inCoverage(p.coords.latitude, p.coords.longitude) ? setPos({ lat: p.coords.latitude, lon: p.coords.longitude }) : toast.error("Fuera del área de cobertura")),
      () => toast.error("No pudimos obtener tu ubicación"),
    );
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-6 pt-2">
      <div>
        <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Comunidad</p>
        <h1 className="display-title text-4xl sm:text-5xl">Reportes comunitarios</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Contanos qué ves. Los reportes se moderan antes de mostrarse, se publican con ubicación aproximada (~1 km) y <strong>no se usan como verdad para entrenar modelos</strong> sin verificación cruzada.
        </p>
      </div>

      {!enabled ? (
        <Glass className="p-5 text-sm">
          {accounts ? <>Para enviar reportes necesitás <Link href="/ingresar" className="text-primary underline">ingresar</Link>. Así evitamos abusos y podemos moderar.</> : "Los reportes requieren cuentas, que no están configuradas en este entorno (modo local)."}
        </Glass>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Glass className="grid gap-3 p-5">
            <SectionTitle title="Nuevo reporte" />
            <div className="flex flex-wrap gap-2">
              {(Object.keys(PH) as (keyof typeof PH)[]).map((k) => (
                <button key={k} onClick={() => setPh(k)} aria-pressed={ph === k} className={`rounded-full px-3.5 py-2 text-sm ${ph === k ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{PH[k]}</button>
              ))}
            </div>
            {ph === "granizo" && (
              <Field label="Tamaño aproximado">
                <select className={inputClass} value={size} onChange={(e) => setSize(e.target.value as keyof typeof HAIL)}>
                  {(Object.keys(HAIL) as (keyof typeof HAIL)[]).map((k) => <option key={k} value={k}>{HAIL[k]}</option>)}
                </select>
              </Field>
            )}
            <Field label="Descripción (opcional)" hint="Sin datos personales. Máximo 500 caracteres.">
              <textarea className={`${inputClass} h-24 py-2`} maxLength={500} value={desc} onChange={(e) => setDesc(e.target.value)} />
            </Field>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="glass" onClick={locate}><Crosshair /> {pos ? "Ubicación lista" : "Usar mi ubicación"}</Button>
              <Button disabled={!pos || send.isPending} onClick={() => send.mutate()}><Send /> Enviar</Button>
            </div>
          </Glass>
          <Glass className="p-5">
            <SectionTitle title="Últimas 48 h" />
            <ul className="mt-3 grid gap-2">
              {list.data?.length === 0 && <li className="text-sm text-muted-foreground">Sin reportes aprobados recientes.</li>}
              {list.data?.map((r) => (
                <li key={r.id} className="rounded-2xl bg-[var(--glass-strong)] p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <KindBadge kind="reporte_comunitario" />
                    <span className="font-medium">{PH[r.phenomenon as keyof typeof PH] ?? r.phenomenon}</span>
                    {r.hail_size && <span className="text-xs text-muted-foreground">{HAIL[r.hail_size as keyof typeof HAIL]}</span>}
                    {r.status !== "aprobado" && <Pill className="bg-lvl-watch/20">{r.status}</Pill>}
                  </div>
                  {r.description && <p className="mt-1">{r.description}</p>}
                  <p className="mt-1 text-xs text-muted-foreground">{ago(r.observed_at)} · zona {Number(r.lat).toFixed(2)}, {Number(r.lon).toFixed(2)}{r.mine ? " · tuyo" : ""}</p>
                </li>
              ))}
            </ul>
          </Glass>
        </div>
      )}
    </div>
  );
}
