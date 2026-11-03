"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { useSession } from "@/components/providers/session";
import { api } from "@/lib/api";
import type { Place, PlaceKind } from "@/lib/domain";
import { coarsen } from "@/lib/geo";

/*
 * Lugares guardados. Con cuenta: en Supabase (RLS). Sin cuenta ("modo local"): solo en este navegador,
 * con la misma minimización (3 decimales). La lista nunca sale del dispositivo en modo local.
 */
const KEY = "meteolab.places.v1";
const EVT = "meteolab:places";

function readLocal(): Place[] {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? "[]") as Place[];
    // El auto vencido se elimina también en el navegador.
    return all.filter((p) => p.kind !== "auto" || (p.watchUntil && new Date(p.watchUntil) > new Date()));
  } catch {
    return [];
  }
}
let cache: { raw: string | null; value: Place[] } = { raw: null, value: [] };
function snapshot() {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {}
  if (raw !== cache.raw) cache = { raw, value: readLocal() };
  return cache.value;
}
function writeLocal(places: Place[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(places));
  } catch {}
  window.dispatchEvent(new Event(EVT));
}
function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(EVT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVT, cb);
  };
}
const EMPTY: Place[] = [];

export function usePlaces() {
  const { accounts, user } = useSession();
  const remote = accounts && !!user;
  const qc = useQueryClient();
  const local = useSyncExternalStore(subscribe, snapshot, () => EMPTY);
  const q = useQuery({ queryKey: ["places"], queryFn: () => api<Place[]>("/places"), enabled: remote });

  const add = useMutation({
    mutationFn: async (p: { kind: Exclude<PlaceKind, "auto">; label: string; lat: number; lon: number }) => {
      if (remote) return api("/places", { method: "POST", body: JSON.stringify(p) });
      const list = readLocal();
      if (list.length >= 10) throw new Error("Llegaste al máximo de 10 lugares guardados");
      writeLocal([...list, { ...p, lat: coarsen(p.lat), lon: coarsen(p.lon), id: crypto.randomUUID(), watchUntil: null, createdAt: new Date().toISOString() }]);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["places"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      if (remote) return api(`/places/${id}`, { method: "DELETE" });
      writeLocal(readLocal().filter((p) => p.id !== id));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["places"] }),
  });

  const parkCar = useMutation({
    mutationFn: async ({ lat, lon, hours }: { lat: number; lon: number; hours: number }) => {
      if (remote) return api("/car", { method: "POST", body: JSON.stringify({ lat, lon, hours }) });
      const others = readLocal().filter((p) => p.kind !== "auto");
      writeLocal([...others, { id: crypto.randomUUID(), kind: "auto", label: "Mi auto", lat: coarsen(lat), lon: coarsen(lon), watchUntil: new Date(Date.now() + hours * 3_600_000).toISOString(), createdAt: new Date().toISOString() }]);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["places"] }),
  });

  return { places: remote ? q.data ?? EMPTY : local, loading: remote && q.isLoading, remote, add, remove, parkCar };
}
