import { describe, expect, it } from "vitest";
import { COOLDOWN_MIN, decide, HYSTERESIS_MIN, type Candidate, type Notice } from "@/server/modules/alerts/engine";

const t0 = new Date("2026-11-03T12:00:00Z");
const at = (min: number) => new Date(t0.getTime() + min * 60_000);
const opts = (now: Date, extra = {}) => ({ now, ownEstimatesMode: "live" as const, minLevel: "atento" as const, ...extra });

const est = (level: Candidate["level"], validTo: string | null = null): Candidate => ({
  key: "p1:estimacion:granizo", placeId: "p1", phenomenon: "granizo", kind: "estimacion", level, title: "t", body: "b", source: "m", validTo,
});
const off = (level: Candidate["level"], validTo: string): Candidate => ({ ...est(level, validTo), key: "p1:oficial:alerta:granizo", kind: "oficial" });

function run(steps: { min: number; c: Candidate[]; o?: object }[]) {
  let state: Notice[] = [];
  const log: { change: string; notify: boolean }[] = [];
  for (const s of steps) {
    const d = decide(state, s.c, opts(at(s.min), s.o));
    state = d.map((x) => x.notice);
    log.push(...d.map((x) => ({ change: x.change, notify: x.notify })));
  }
  return { state, log };
}

describe("motor de avisos", () => {
  it("notifica un aviso nuevo una sola vez aunque llegue repetido", () => {
    const { log } = run([{ min: 0, c: [est("alto"), est("alto")] }, { min: 10, c: [est("alto")] }, { min: 20, c: [est("alto")] }]);
    expect(log.filter((l) => l.notify)).toHaveLength(1);
  });

  it("escala de inmediato y no renotifica el mismo nivel dentro del enfriamiento", () => {
    const { log } = run([{ min: 0, c: [est("atento")] }, { min: 10, c: [est("alto")] }, { min: 20, c: [est("alto")] }]);
    expect(log.map((l) => l.change)).toEqual(["nuevo", "escalado", "sin_cambio"]);
    expect(log.filter((l) => l.notify)).toHaveLength(2);
  });

  it("no oscila: una bajada breve no cambia el estado (histéresis)", () => {
    const { state, log } = run([
      { min: 0, c: [est("alto")] },
      { min: 10, c: [est("atento")] },
      { min: 20, c: [est("alto")] },
      { min: 30, c: [est("atento")] },
    ]);
    expect(state[0].level).toBe("alto");
    expect(log.filter((l) => l.notify)).toHaveLength(1);
  });

  it("reduce el nivel solo tras sostenerse la bajada", () => {
    const { state } = run([{ min: 0, c: [est("alto")] }, { min: 10, c: [est("atento")] }, { min: 10 + HYSTERESIS_MIN, c: [est("atento")] }]);
    expect(state[0].level).toBe("atento");
    expect(state[0].state).toBe("activo");
  });

  it("resuelve una estimación cuando la señal desaparece de forma sostenida y avisa el cierre", () => {
    const { state, log } = run([{ min: 0, c: [est("alto")] }, { min: 10, c: [] }, { min: 10 + HYSTERESIS_MIN, c: [] }]);
    expect(state[0].state).toBe("resuelto");
    expect(log.at(-1)).toEqual({ change: "resuelto", notify: true });
  });

  it("los avisos oficiales vencen con su vigencia", () => {
    const { state } = run([{ min: 0, c: [off("alto", at(30).toISOString())] }, { min: 45, c: [off("alto", at(30).toISOString())] }]);
    expect(state[0].state).toBe("vencido");
  });

  it("un aviso oficial de nivel atento se notifica aunque el usuario pida solo 'alto' para estimaciones", () => {
    const d = decide([], [off("atento", at(60).toISOString())], opts(t0, { minLevel: "alto" }));
    expect(d[0].notify).toBe(true);
  });

  it("modo sombra: registra la estimación sin enviarla", () => {
    const d = decide([], [est("muy_alto")], opts(t0, { ownEstimatesMode: "shadow" }));
    expect(d[0].notice.shadow).toBe(true);
    expect(d[0].notify).toBe(false);
  });

  it("si la fuente cae, el aviso queda degradado, no resuelto", () => {
    const first = decide([], [est("alto")], opts(t0)).map((d) => d.notice);
    const d = decide(first, [], opts(at(90), { degradedKinds: ["estimacion"] }));
    expect(d[0].change).toBe("degradado");
    expect(d[0].notice.state).toBe("degradado");
  });

  it("no crea avisos con 'sin datos' ni con señal baja", () => {
    expect(decide([], [est("sin_datos"), { ...est("bajo"), key: "x" }], opts(t0))).toHaveLength(0);
  });

  it("recuerda tras el enfriamiento solo si cambió el nivel notificado", () => {
    const { log } = run([{ min: 0, c: [est("alto")] }, { min: COOLDOWN_MIN + 1, c: [est("alto")] }]);
    expect(log.filter((l) => l.notify)).toHaveLength(1);
  });
});
