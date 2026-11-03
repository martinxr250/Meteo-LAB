"use client";
import type { FeatureCollection } from "geojson";

import "maplibre-gl/dist/maplibre-gl.css";
import maplibregl, { type GeoJSONSource, type Map as MLMap } from "maplibre-gl";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { COVERAGE } from "@/lib/geo";

export interface MapPlace { id: string; label: string; lat: number; lon: number; kind: string }
export interface RadarFrame { time: string; path: string }

const STYLE = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
};

/**
 * Mapa base OpenFreeMap (datos © OpenStreetMap). Capas: alertas del SMN (polígonos oficiales),
 * radar RainViewer (visual, no comercial) y lugares guardados.
 */
export function WeatherMap({
  alerts, places, radar, radarHost, showAlerts, radarOpacity, onPick, onAlertClick,
}: {
  alerts: FeatureCollection | null;
  places: MapPlace[];
  radar: RadarFrame | null;
  radarHost: string | null;
  showAlerts: boolean;
  radarOpacity: number;
  onPick?: (lat: number, lon: number) => void;
  onAlertClick?: (props: Record<string, unknown>) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const [ready, setReady] = useState(0);
  const { resolvedTheme } = useTheme();
  const theme = resolvedTheme === "dark" ? "dark" : "light";
  const pickRef = useRef(onPick);
  const alertRef = useRef(onAlertClick);
  useEffect(() => {
    pickRef.current = onPick;
    alertRef.current = onAlertClick;
  });

  useEffect(() => {
    if (!ref.current) return;
    const m = new maplibregl.Map({
      container: ref.current,
      style: STYLE[theme],
      center: [COVERAGE.center.lon, COVERAGE.center.lat],
      zoom: 9.2,
      attributionControl: { compact: true, customAttribution: "Alertas: SMN (CC BY 4.0) · Radar: RainViewer" },
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    m.on("load", () => setReady((r) => r + 1));
    m.on("style.load", () => setReady((r) => r + 1));
    m.on("click", (e) => {
      const hit = m.queryRenderedFeatures(e.point, { layers: m.getLayer("alerts-fill") ? ["alerts-fill"] : [] });
      if (hit[0] && alertRef.current) alertRef.current(hit[0].properties as Record<string, unknown>);
      else pickRef.current?.(e.lngLat.lat, e.lngLat.lng);
    });
    map.current = m;
    return () => m.remove();
    // El estilo se cambia en otro efecto; el mapa se crea una sola vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    map.current?.setStyle(STYLE[theme]);
  }, [theme]);

  // Capas de datos (se reponen tras cada cambio de estilo).
  useEffect(() => {
    const m = map.current;
    if (!m || !m.isStyleLoaded()) return;

    const alertsData = alerts ?? { type: "FeatureCollection", features: [] };
    if (m.getSource("alerts")) (m.getSource("alerts") as GeoJSONSource).setData(alertsData);
    else {
      m.addSource("alerts", { type: "geojson", data: alertsData });
      const color = ["match", ["get", "color"], "amarilla", "#f2d43a", "naranja", "#f08a24", "roja", "#d93a2b", "#8899aa"] as unknown as string;
      m.addLayer({ id: "alerts-fill", type: "fill", source: "alerts", paint: { "fill-color": color, "fill-opacity": 0.28 } });
      m.addLayer({ id: "alerts-line", type: "line", source: "alerts", paint: { "line-color": color, "line-width": 1.5 } });
    }
    for (const id of ["alerts-fill", "alerts-line"]) m.setLayoutProperty(id, "visibility", showAlerts ? "visible" : "none");

    if (m.getLayer("radar")) m.removeLayer("radar");
    if (m.getSource("radar")) m.removeSource("radar");
    if (radar && radarHost) {
      m.addSource("radar", { type: "raster", tiles: [`${radarHost}${radar.path}/256/{z}/{x}/{y}/2/1_1.png`], tileSize: 256, maxzoom: 7, attribution: "RainViewer" });
      m.addLayer({ id: "radar", type: "raster", source: "radar", paint: { "raster-opacity": radarOpacity } });
    }

    const pts: FeatureCollection = {
      type: "FeatureCollection",
      features: places.map((p) => ({ type: "Feature", geometry: { type: "Point", coordinates: [p.lon, p.lat] }, properties: { label: p.label, kind: p.kind } })),
    };
    if (m.getSource("places")) (m.getSource("places") as GeoJSONSource).setData(pts);
    else {
      m.addSource("places", { type: "geojson", data: pts });
      m.addLayer({ id: "places", type: "circle", source: "places", paint: { "circle-radius": 7, "circle-color": "#2f6fe0", "circle-stroke-color": "#fff", "circle-stroke-width": 2.5 } });
    }
    if (m.getLayer("places")) m.moveLayer("places");
  }, [alerts, places, radar, radarHost, showAlerts, radarOpacity, ready]);

  return <div ref={ref} className="h-full w-full" role="application" aria-label="Mapa de alertas, radar y lugares" />;
}
