import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Meteo-LAB — Prevención meteorológica",
    short_name: "Meteo-LAB",
    description: "Granizo, lluvia intensa y anegamientos en tus lugares de Córdoba.",
    start_url: "/resumen",
    display: "standalone",
    background_color: "#eaf3fb",
    theme_color: "#1f4fc2",
    lang: "es-AR",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
