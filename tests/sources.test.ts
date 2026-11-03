import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { pointInPolygon } from "@/lib/geo";
import { supersede } from "@/server/modules/sources/official";
import { parseEnsemble, parseForecast } from "@/server/modules/sources/open-meteo";
import { isActive, parseCapAlert, parseCapIndex, parseCapPolygon } from "@/server/modules/sources/smn-cap";
import { parseEstadoTiempo } from "@/server/modules/sources/smn-obs";
import { readZipEntries } from "@/server/modules/sources/zip";

const fx = (f: string) => readFileSync(path.join(__dirname, "fixtures", f));

describe("SMN CAP (muestras reales del 2026-11-02)", () => {
  it("lee el índice RSS y solo acepta enlaces del dominio oficial", () => {
    const links = parseCapIndex(fx("smn_cap_index.xml").toString());
    expect(links.length).toBeGreaterThan(100);
    expect(links.every((l) => l.startsWith("https://ssl.smn.gob.ar/feeds/CAP/"))).toBe(true);
  });

  it("interpreta un aviso a corto plazo con color, vigencia y polígono", () => {
    const a = parseCapAlert(fx("cap_aviso_corto.xml").toString(), "https://ssl.smn.gob.ar/feeds/CAP/avisocortoplazo/x.xml")!;
    expect(a.product).toBe("aviso_corto_plazo");
    expect(a.color).toBe("naranja");
    expect(a.colorFrom).toBe("titular");
    expect(a.expires).toBe("2026-11-03T02:34:00-03:00");
    expect(a.polygons).toHaveLength(1);
    // Pringles, San Luis: el polígono contiene un punto interior y no contiene Córdoba Capital.
    expect(pointInPolygon([-66.4, -33.5], a.polygons[0])).toBe(true);
    expect(pointInPolygon([-64.18, -31.42], a.polygons[0])).toBe(false);
    expect(a.instruction).toMatch(/zonas inundables/);
  });

  it("interpreta una alerta por zonas como actualización con referencias y menciona granizo", () => {
    const a = parseCapAlert(fx("cap_alerta.xml").toString(), "https://ssl.smn.gob.ar/feeds/CAP/xml_generados/x.xml")!;
    expect(a.product).toBe("alerta");
    expect(a.msgType).toBe("Update");
    expect(a.references.length).toBe(1);
    expect(a.phenomena).toContain("granizo");
    expect(a.colorFrom).toBe("severidad_cap");
    expect(a.color).toBe("naranja");
  });

  it("vence y respeta cancelaciones", () => {
    const a = parseCapAlert(fx("cap_aviso_corto.xml").toString(), "https://ssl.smn.gob.ar/feeds/CAP/avisocortoplazo/x.xml")!;
    expect(isActive(a, new Date("2026-11-03T04:00:00Z"))).toBe(true);
    expect(isActive(a, new Date("2026-11-03T06:00:00Z"))).toBe(false);
    expect(isActive({ ...a, msgType: "Cancel" }, new Date("2026-11-03T04:00:00Z"))).toBe(false);
  });

  it("descarta el mensaje reemplazado por una actualización", () => {
    const base = parseCapAlert(fx("cap_aviso_corto.xml").toString(), "https://ssl.smn.gob.ar/feeds/CAP/avisocortoplazo/x.xml")!;
    const old = { ...base, id: "urn:a" };
    const upd = { ...base, id: "urn:b", msgType: "Update", references: ["smn@smn.gob.ar,urn:a,2026-11-03T00:00:00-03:00"] };
    expect(supersede([old, upd, upd]).map((a) => a.id)).toEqual(["urn:b"]);
  });

  it("rechaza polígonos degenerados y cierra los abiertos", () => {
    expect(parseCapPolygon("-31,-64 -31.1,-64")).toBeNull();
    const p = parseCapPolygon("-31,-64 -31,-63 -32,-63")!;
    expect(p[0][0]).toEqual(p[0][p[0].length - 1]);
  });
});

describe("SMN estado del tiempo", () => {
  it("descomprime el ZIP oficial y lee estaciones de Córdoba con hora UTC", () => {
    const [entry] = readZipEntries(fx("smn_tiepre.zip"));
    expect(entry.name).toMatch(/estado_tiempo/);
    const obs = parseEstadoTiempo(entry.data.toString("latin1"));
    const cba = obs.find((o) => o.station === "Córdoba Observatorio")!;
    expect(cba).toBeTruthy();
    expect(cba.stationId).toBe("87345");
    expect(cba.observedAt).toBe("2026-11-03T01:00:00.000Z");
    expect(cba.temperatureC).toBeCloseTo(23.8);
  });
});

describe("Open-Meteo", () => {
  it("agrupa miembros por sistema de ensamble", () => {
    const e = parseEnsemble(fx("openmeteo_ens.json").toString());
    expect(Object.keys(e.systems).sort()).toEqual(["ECMWF-ENS", "NCEP-GEFS"]);
    expect(e.systems["ECMWF-ENS"].length).toBeGreaterThanOrEqual(50);
    expect(e.time[0]).toMatch(/Z$/);
  });
  it("normaliza la serie determinista", () => {
    const f = parseForecast(fx("openmeteo_forecast.json").toString());
    expect(f.time.length).toBe(f.precipitation.length);
  });
});
