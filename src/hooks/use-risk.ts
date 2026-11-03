"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { PointRisk } from "@/lib/domain";

export function useRisk(point: { lat: number; lon: number } | null) {
  return useQuery({
    queryKey: ["risk", point?.lat, point?.lon],
    queryFn: () => api<PointRisk>(`/risk?lat=${point!.lat}&lon=${point!.lon}`),
    enabled: !!point,
    staleTime: 2 * 60_000,
  });
}

export interface StatusResponse {
  generatedAt: string;
  sources: PointRisk["sources"];
  degraded: string[];
  ownEstimatesMode: "shadow" | "live";
}

export function useStatus() {
  return useQuery({ queryKey: ["status"], queryFn: () => api<StatusResponse>("/status"), staleTime: 2 * 60_000 });
}
