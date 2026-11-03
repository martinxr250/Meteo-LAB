import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { distanceToPolygonKm, pointInPolygon, snapPoint } from "@/lib/geo";
import { redact } from "@/server/core/log";
import { applyCalibration, type LogisticModel } from "@/server/modules/risk/calibration";
import { floodLevel, topographicIndex } from "@/server/modules/risk/flood";
import { assessHail, hailLevel } from "@/server/modules/risk/hail";
import { assessRain, combineSystems, exceedanceBySystem } from "@/server/modules/risk/rain";
import type { EnsembleSeries, ForecastSeries } from "@/server/modules/sources/open-meteo";
import { parseEnsemble } from "@/server/modules/sources/open-meteo";

const now = new Date("2026-11-03T00:00:00Z");
const hours = (n: number) => Array.from({ length: n }, (_, i) => new Date(now.getTime() + i * 3_600_000).toISOString().replace(".000", ""));

function ens(ecmwf: number[][], gefs: number[][]): EnsembleSeries {
  return { time: hours(ecmwf[0].length), systems: { "ECMWF-ENS": ecmwf, "NCEP-GEFS": gefs } };
}

describe("lluvia intensa", () => {
  it("cada sistema pesa igual, sin importar cuántos miembros tenga", () => {
    const wet = Array(24).fill(0).map((_, i) => (i === 5 ? 15 : 0));
    const dry = Array(24).fill(0);
    // ECMWF: 50 de 50 superan; GEFS: 0 de 30.
    const e = ens(Array(50).fill(wet), Array(30).fill(dry));
    const by = exceedanceBySystem(e, now, 24, 1, 10);
    expect(by["ECMWF-ENS"].p).toBe(1);
    expect(by["NCEP-GEFS"].p).toBe(0);
    expect(combineSystems(by)).toBe(0.5);
  });

  it("suma móvil de 3 h", () => {
    const m = Array(24).fill(0).map((_, i) => (i >= 3 && i < 6 ? 11 : 0));
    const by = exceedanceBySystem(ens([m], [m]), now, 24, 3, 30);
    expect(combineSystems(by)).toBe(1);
  });

  it("sin ensamble se abstiene y lo dice", () => {
    const a = assessRain(null, null, now, null);
    expect(a.level).toBe("sin_datos");
    expect(a.abstained).toBeTruthy();
  });

  it("con datos reales devuelve una métrica rotulada como sin calibrar", () => {
    const e = parseEnsemble(readFileSync(path.join(__dirname, "fixtures/openmeteo_ens.json"), "utf8"));
    const a = assessRain(e, null, new Date(e.time[0]), "x");
    expect(a.level).not.toBe("sin_datos");
    expect(a.metric).toMatch(/sin calibrar/);
  });
});

describe("granizo (condiciones favorables)", () => {
  const fc = (cape: number, fz: number, precip: number, code = 3): ForecastSeries => {
    const n = 24;
    return { time: hours(n), cape: Array(n).fill(cape), freezing_level_height: Array(n).fill(fz), precipitation: Array(n).fill(precip), precipitation_probability: Array(n).fill(50), lifted_index: Array(n).fill(-4), weather_code: Array(n).fill(code), wind_gusts_10m: Array(n).fill(30) };
  };
  it("sin disparo convectivo no sube aunque haya inestabilidad", () => {
    expect(hailLevel(3, false)).toBe("bajo");
    expect(assessHail(fc(3000, 3800, 0), null, [], now, null).level).toBe("bajo");
  });
  it("con ingredientes completos marca alto, nunca 'muy alto' por regla propia", () => {
    const a = assessHail(fc(2500, 3900, 8, 96), null, [], now, null);
    expect(a.level).toBe("alto");
    expect(a.probability).toBeNull();
    expect(a.summary).toMatch(/No indica que vaya a granizar/);
  });
  it("sin CAPE se abstiene", () => {
    const f = fc(0, 0, 0);
    f.cape = Array(24).fill(null);
    expect(assessHail(f, null, [], now, null).level).toBe("sin_datos");
  });
});

describe("anegamientos", () => {
  it("indicador topográfico: un bajo de 5 m es 'bajo topográfico'", () => {
    expect(topographicIndex([395, 400, 400, 400, 400, 400, 400, 400, 400])!.low).toBe(true);
    expect(topographicIndex([400, 400, 400, 400, 400, 400, 400, 400, 400])!.low).toBe(false);
    expect(topographicIndex(null)).toBeNull();
  });
  it("sin pronóstico no estima y no dice 'sin riesgo'", () => {
    expect(floodLevel(null, null, 100, true)).toBe("sin_datos");
  });
  it("combina lluvia prevista, antecedente y relieve", () => {
    expect(floodLevel(0.4, 0.3, 50, true)).toBe("alto");
    expect(floodLevel(0.05, 0, 0, false)).toBe("bajo");
  });
});

describe("geometría y privacidad", () => {
  it("el punto se ajusta a la celda de 0.05°", () => {
    expect(snapPoint(-31.4167, -64.1833)).toEqual({ lat: -31.4, lon: -64.2, step: 0.05 });
  });
  it("distancia al polígono", () => {
    const sq: [number, number][] = [[-64, -31], [-63, -31], [-63, -32], [-64, -32], [-64, -31]];
    expect(pointInPolygon([-63.5, -31.5], [sq])).toBe(true);
    expect(distanceToPolygonKm([-63.5, -31.5], [sq])).toBe(0);
    expect(distanceToPolygonKm([-64.1, -31.5], [sq])).toBeGreaterThan(9);
  });
  it("los logs no llevan secretos ni coordenadas precisas", () => {
    const r = redact({ lat: -31.41234, lon: -64.18765, token: "abc", nested: { authorization: "Bearer x.y.z" }, msg: "Bearer abc.def" }) as Record<string, unknown>;
    expect(r.lat).toBe(-31.4);
    expect(r.token).toBe("[redactado]");
    expect(JSON.stringify(r)).not.toContain("abc.def");
  });
});

describe("calibración", () => {
  const m: LogisticModel = { name: "rain-daily", version: "t", status: "promoted", features: ["x"], coef: [2], intercept: -1, ranges: { x: [0, 1] } };
  it("aplica la logística dentro del rango y se abstiene fuera", () => {
    expect(applyCalibration(m, { x: 0.5 })).toBeCloseTo(0.5);
    expect(applyCalibration(m, { x: 2 })).toBeNull();
  });
});
