"use client";

import { Briefcase, Car, Crosshair, Home, MapPin, Trash2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";
import { toast } from "sonner";
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
  const { places, add, remove, parkCar } = usePlaces();
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
        <h1 className="display-title text-4xl">Lugares</h1>
      </div>

      <Glass strong id="auto" className="grid gap-4 p-5 sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <h2 className="font-semibold">Mi auto</h2>
          <p className="text-sm text-muted-foreground">
            {car?.watchUntil ? `Guardado ${fmtDateTime(car.createdAt)} · ${until(car.watchUntil)}` : "Guardá dónde lo dejaste y te avisamos si se viene piedra."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={hours} onChange={(e) => setHours(Number(e.target.value))} className={`${inputClass} h-10 w-auto`} aria-label="Duración de la vigilancia">
            {[2, 4, 8, 12, 24].map((h) => <option key={h} value={h}>{h} h</option>)}
          </select>
          <Button onClick={park} disabled={parkCar.isPending}>{car ? "Actualizar" : "Dejé el auto acá"}</Button>
          {car && <Button variant="ghost" size="icon" aria-label="Dejar de vigilar el auto" onClick={() => remove.mutate(car.id)}><Trash2 /></Button>}
        </div>
      </Glass>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <Glass className="p-5">
          <SectionTitle title="Agregar lugar" />
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
            <Field label="Nombre">
              <input className={inputClass} value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} placeholder={PLACE_KIND_LABEL[kind]} />
            </Field>
            <div className="rounded-xl bg-muted/60 p-3 text-sm">
              {draft ? "Punto elegido en el mapa" : "Tocá el mapa o usá tu ubicación"}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="glass" onClick={useMyLocation}><Crosshair /> Mi ubicación</Button>
              <Button onClick={save} disabled={!draft || add.isPending}>Guardar</Button>
            </div>
          </div>

          <SectionTitle className="mt-6" title="Guardados" meta={`${places.length} de 10`} />
          <ul className="mt-3 grid gap-2">
            {!places.length && <li className="text-sm text-muted-foreground">Todavía no guardaste lugares.</li>}
            {places.map((p) => {
              const Icon = ICON[p.kind];
              return (
                <li key={p.id} className="flex items-center gap-3 rounded-2xl bg-[var(--glass-strong)] p-3">
                  <Icon className="size-4 text-muted-foreground" />
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
            showAlerts={false}
            onPick={(lat, lon) => setDraft({ lat, lon })}
          />
        </div>
      </div>
    </div>
  );
}
