"use client";

import { Briefcase, Car, Crosshair, Home, MapPin, Plus, Trash2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";
import { toast } from "sonner";
import { useSession } from "@/components/providers/session";
import { Button, Field, Glass, inputClass, SectionTitle } from "@/components/ui/primitives";
import { usePlaces } from "@/hooks/use-places";
import { PLACE_KIND_LABEL, type PlaceKind } from "@/lib/domain";
import { fmtDateTime, until } from "@/lib/format";
import { inCoverage } from "@/lib/geo";

const WeatherMap = dynamic(() => import("@/components/map/weather-map").then((m) => m.WeatherMap), { ssr: false });
const ICON = { casa: Home, trabajo: Briefcase, auto: Car, otro: MapPin };

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject(new Error("Tu navegador no permite obtener la ubicación"));
    navigator.geolocation.getCurrentPosition(resolve, () => reject(new Error("No pudimos obtener tu ubicación")), { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 });
  });
}

export function PlacesView() {
  const { places, add, remove, parkCar, remote } = usePlaces();
  const { accounts, user } = useSession();
  const [draft, setDraft] = useState<{ lat: number; lon: number } | null>(null);
  const [kind, setKind] = useState<Exclude<PlaceKind, "auto">>("casa");
  const [label, setLabel] = useState("");
  const [hours, setHours] = useState(8);
  const car = places.find((p) => p.kind === "auto");

  async function park() {
    try {
      const pos = await getPosition();
      const { latitude: lat, longitude: lon } = pos.coords;
      if (!inCoverage(lat, lon)) throw new Error("Estás fuera del área de cobertura (Córdoba y alrededores).");
      await parkCar.mutateAsync({ lat, lon, hours });
      toast.success(`Vigilamos tu auto durante ${hours} h`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    }
  }

  async function useMyLocation() {
    try {
      const pos = await getPosition();
      setDraft({ lat: pos.coords.latitude, lon: pos.coords.longitude });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    }
  }

  async function save() {
    if (!draft) return toast.error("Elegí un punto en el mapa o usá tu ubicación");
    if (!inCoverage(draft.lat, draft.lon)) return toast.error("Ese punto está fuera del área de cobertura.");
    await add.mutateAsync({ kind, label: label.trim() || PLACE_KIND_LABEL[kind], lat: draft.lat, lon: draft.lon });
    setDraft(null);
    setLabel("");
    toast.success("Lugar guardado");
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-6 pt-2">
      <div>
        <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Tus lugares</p>
        <h1 className="display-title text-4xl sm:text-5xl">Lugares guardados</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          {remote
            ? "Se guardan en tu cuenta con una precisión de ~110 m (no necesitamos más: los pronósticos tienen celdas de varios km)."
            : accounts && !user
              ? "Sin sesión iniciada: tus lugares se guardan solo en este navegador. Ingresá para recibir notificaciones."
              : "Modo local: tus lugares se guardan solo en este navegador, con una precisión de ~110 m."}
        </p>
      </div>

      <Glass strong className="grid gap-4 p-5 sm:grid-cols-[auto_1fr_auto] sm:items-center">
        <span className="grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30"><Car className="size-6" /></span>
        <div>
          <h2 className="text-lg font-semibold">Dejé el auto acá</h2>
          <p className="text-sm text-muted-foreground">
            {car?.watchUntil
              ? `Vigilando tu auto desde ${fmtDateTime(car.createdAt)} · ${until(car.watchUntil)}. Al vencer, borramos la ubicación.`
              : "Guarda tu ubicación actual y vigila granizo cerca del auto por un tiempo limitado. Después se borra sola."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={hours} onChange={(e) => setHours(Number(e.target.value))} className={`${inputClass} h-10 w-auto`} aria-label="Duración de la vigilancia">
            {[2, 4, 8, 12, 24].map((h) => <option key={h} value={h}>{h} h</option>)}
          </select>
          <Button onClick={park} disabled={parkCar.isPending}><Crosshair /> {car ? "Actualizar" : "Dejé el auto acá"}</Button>
          {car && <Button variant="ghost" size="icon" aria-label="Dejar de vigilar el auto" onClick={() => remove.mutate(car.id)}><Trash2 /></Button>}
        </div>
      </Glass>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <Glass className="p-5">
          <SectionTitle eyebrow="Nuevo lugar" title="Agregar casa, trabajo u otro" />
          <div className="mt-4 grid gap-3">
            <div className="flex flex-wrap gap-2">
              {(["casa", "trabajo", "otro"] as const).map((k) => {
                const Icon = ICON[k];
                return (
                  <button key={k} onClick={() => setKind(k)} aria-pressed={kind === k} className={`flex items-center gap-2 rounded-full px-3.5 py-2 text-sm ${kind === k ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                    <Icon className="size-4" /> {PLACE_KIND_LABEL[k]}
                  </button>
                );
              })}
            </div>
            <Field label="Nombre" hint="Opcional. Evitá poner tu dirección exacta.">
              <input className={inputClass} value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} placeholder={PLACE_KIND_LABEL[kind]} />
            </Field>
            <div className="rounded-xl bg-muted/60 p-3 text-sm">
              {draft ? <>Punto elegido: {draft.lat.toFixed(3)}, {draft.lon.toFixed(3)}</> : "Tocá el mapa para elegir el punto o usá tu ubicación."}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="glass" onClick={useMyLocation}><Crosshair /> Usar mi ubicación</Button>
              <Button onClick={save} disabled={!draft || add.isPending}><Plus /> Guardar lugar</Button>
            </div>
          </div>

          <SectionTitle className="mt-6" eyebrow={`${places.length} de 10`} title="Guardados" />
          <ul className="mt-3 grid gap-2">
            {!places.length && <li className="text-sm text-muted-foreground">Todavía no guardaste lugares.</li>}
            {places.map((p) => {
              const Icon = ICON[p.kind];
              return (
                <li key={p.id} className="flex items-center gap-3 rounded-2xl bg-[var(--glass-strong)] p-3">
                  <span className="grid size-9 place-items-center rounded-xl bg-primary-soft text-primary"><Icon className="size-4" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{p.label}</p>
                    <p className="text-xs text-muted-foreground">{PLACE_KIND_LABEL[p.kind]}{p.watchUntil ? ` · ${until(p.watchUntil)}` : ""}</p>
                  </div>
                  <Button variant="ghost" size="icon-sm" aria-label={`Eliminar ${p.label}`} onClick={() => remove.mutate(p.id)}><Trash2 /></Button>
                </li>
              );
            })}
          </ul>
        </Glass>
        <div className="h-[28rem] overflow-hidden rounded-3xl lg:h-auto lg:min-h-[32rem]">
          <WeatherMap
            alerts={null}
            places={[...places, ...(draft ? [{ id: "draft", label: "Nuevo", lat: draft.lat, lon: draft.lon, kind: "otro" as const, watchUntil: null, createdAt: "" }] : [])]}
            radar={null}
            radarHost={null}
            showAlerts={false}
            radarOpacity={0}
            onPick={(lat, lon) => setDraft({ lat, lon })}
          />
        </div>
      </div>
    </div>
  );
}
