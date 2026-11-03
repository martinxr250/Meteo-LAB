"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/components/providers/session";
import { api } from "@/lib/api";
import type { Place, PlaceKind } from "@/lib/domain";

/*
 * Lugares guardados: solo con cuenta. Son datos personales (casa, trabajo, auto) y se guardan
 * en Supabase con RLS; sin sesión, la lista está vacía y la app usa Córdoba o tu ubicación del momento.
 */
const EMPTY: Place[] = [];

export function usePlaces() {
  const { accounts, user } = useSession();
  const enabled = accounts && !!user;
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["places"], queryFn: () => api<Place[]>("/places"), enabled });
  const done = { onSuccess: () => qc.invalidateQueries({ queryKey: ["places"] }) };

  const add = useMutation({
    mutationFn: (p: { kind: Exclude<PlaceKind, "auto">; label: string; lat: number; lon: number }) => api("/places", { method: "POST", body: JSON.stringify(p) }),
    ...done,
  });
  const remove = useMutation({ mutationFn: (id: string) => api(`/places/${id}`, { method: "DELETE" }), ...done });
  const parkCar = useMutation({
    mutationFn: ({ lat, lon, hours }: { lat: number; lon: number; hours: number }) => api("/car", { method: "POST", body: JSON.stringify({ lat, lon, hours }) }),
    ...done,
  });

  return { places: enabled ? q.data ?? EMPTY : EMPTY, loading: enabled && q.isLoading, enabled, add, remove, parkCar };
}
