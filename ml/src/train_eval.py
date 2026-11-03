"""
Entrenamiento y evaluación: lluvia diaria ≥ UMBRAL mm (12Z→12Z) en pluviómetros del Gran Córdoba.

Partición temporal por bloques completos (sin mezclar días entre conjuntos; todas las estaciones de
un mismo día quedan en el mismo conjunto, porque una tormenta afecta a varias a la vez):
  entrenamiento  < 2025-10-01
  validación     2025-10-01 … 2025-12-31   (solo para elegir umbral de decisión)
  prueba final   ≥ 2026-01-01               (no se usa para ajustar nada)

Baselines: climatología mensual, persistencia, ECMWF determinista, GFS determinista.
Candidatos: regresión logística (calibrada por construcción) y gradient boosting, con ablaciones.
Salidas: ml/reports/evaluacion.json, ml/reports/evaluacion.md y, si corresponde, el modelo en JSON.
Uso:  python -I ml/src/train_eval.py [--threshold 20]
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, brier_score_loss

ROOT = pathlib.Path(__file__).resolve().parents[1]
REPO = ROOT.parent
RNG = np.random.default_rng(20261103)
TRAIN_END, VAL_END = pd.Timestamp("2025-10-01", tz="UTC"), pd.Timestamp("2026-01-01", tz="UTC")


# ───────────── Métricas (definiciones explícitas) ─────────────
# POD = TP/(TP+FN) · FAR (false alarm RATIO) = FP/(TP+FP) · CSI = TP/(TP+FP+FN)
# No se usa el false positive RATE = FP/(FP+TN), que en eventos raros luce engañosamente bajo.
def contingency(y: np.ndarray, yhat: np.ndarray) -> dict:
    tp = int(((y == 1) & (yhat == 1)).sum()); fp = int(((y == 0) & (yhat == 1)).sum())
    fn = int(((y == 1) & (yhat == 0)).sum()); tn = int(((y == 0) & (yhat == 0)).sum())
    pod = tp / (tp + fn) if tp + fn else None
    far = fp / (tp + fp) if tp + fp else None
    csi = tp / (tp + fp + fn) if tp + fp + fn else None
    return {"tp": tp, "fp": fp, "fn": fn, "tn": tn, "pod": pod, "far": far, "csi": csi}


def prob_metrics(y: np.ndarray, p: np.ndarray, clim: float) -> dict:
    bs = brier_score_loss(y, p)
    bs_ref = brier_score_loss(y, np.full_like(p, clim))
    return {
        "brier": bs,
        "bss_vs_climatologia": 1 - bs / bs_ref if bs_ref > 0 else None,
        "pr_auc": average_precision_score(y, p) if y.sum() else None,
    }


def bootstrap_ci(days: np.ndarray, y: np.ndarray, p: np.ndarray, fn, n=1000) -> tuple[float, float] | None:
    """IC 90 % remuestreando DÍAS completos (respeta la correlación entre estaciones del mismo evento)."""
    uniq, inv = np.unique(days, return_inverse=True)
    groups = [np.flatnonzero(inv == i) for i in range(len(uniq))]
    vals = []
    for _ in range(n):
        idx = np.concatenate([groups[i] for i in RNG.integers(0, len(groups), len(groups))])
        v = fn(y[idx], p[idx])
        if v is not None and np.isfinite(v):
            vals.append(v)
    return (float(np.percentile(vals, 5)), float(np.percentile(vals, 95))) if len(vals) > 50 else None


def reliability(y: np.ndarray, p: np.ndarray, bins=(0, 0.05, 0.1, 0.2, 0.4, 0.6, 1.0001)) -> list[dict]:
    out = []
    for lo, hi in zip(bins[:-1], bins[1:]):
        m = (p >= lo) & (p < hi)
        if m.sum():
            out.append({"rango": f"{lo:.2f}–{min(hi, 1):.2f}", "n": int(m.sum()), "p_media": float(p[m].mean()), "frecuencia_observada": float(y[m].mean())})
    return out


# ───────────── Features ─────────────
def features(df: pd.DataFrame, cols: list[str]) -> np.ndarray:
    # log1p estabiliza la cola larga de la lluvia.
    return np.column_stack([np.log1p(df[c].to_numpy()) for c in cols])


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--threshold", type=float, default=20.0)
    args = ap.parse_args()
    T = args.threshold

    df = pd.read_csv(ROOT / "data" / "dataset.csv", parse_dates=["start", "end"])
    df = df[~df["qc_extreme"]].dropna(subset=["ecmwf_sum", "gfs_sum"]).copy()
    df["y"] = (df["obs_mm"] >= T).astype(int)
    tr, va, te = df[df["end"] < TRAIN_END], df[(df["end"] >= TRAIN_END) & (df["end"] < VAL_END)], df[df["end"] >= VAL_END]
    clim_month = tr.groupby("month")["y"].mean()
    clim_all = float(tr["y"].mean())

    def clim_p(d: pd.DataFrame) -> np.ndarray:
        return d["month"].map(clim_month).fillna(clim_all).to_numpy()

    report: dict = {
        "generado": dt.datetime.now(dt.UTC).isoformat(timespec="seconds"),
        "evento": f"lluvia acumulada 12Z→12Z ≥ {T:g} mm en el pluviómetro",
        "datos": {
            "estaciones": sorted(df["name"].unique().tolist()),
            "filas": {"entrenamiento": len(tr), "validacion": len(va), "prueba": len(te)},
            "eventos": {"entrenamiento": int(tr["y"].sum()), "validacion": int(va["y"].sum()), "prueba": int(te["y"].sum())},
            "dias_con_evento_prueba": int(te.groupby("end")["y"].max().sum()),
            "excluidas_qc": "obs > 250 mm (marcadas para revisión) y días sin pronóstico completo",
        },
        "modelos": {},
    }

    # Candidatos probabilísticos.
    sets = {"ecmwf+gfs": ["ecmwf_sum", "gfs_sum"], "solo_ecmwf": ["ecmwf_sum"], "solo_gfs": ["gfs_sum"],
            "ecmwf+gfs+max3h": ["ecmwf_sum", "gfs_sum", "ecmwf_max3h", "gfs_max3h"]}
    probs: dict[str, tuple[np.ndarray, np.ndarray]] = {}
    fitted: dict[str, LogisticRegression] = {}
    for name, cols in sets.items():
        lr = LogisticRegression(C=1.0, max_iter=1000).fit(features(tr, cols), tr["y"])
        fitted[name] = lr
        probs[f"logistica[{name}]"] = (lr.predict_proba(features(va, cols))[:, 1], lr.predict_proba(features(te, cols))[:, 1])
    gb = HistGradientBoostingClassifier(max_depth=3, max_iter=150, learning_rate=0.05, min_samples_leaf=40, random_state=0)
    cols_gb = sets["ecmwf+gfs+max3h"] + ["month"]
    Xgb = lambda d: np.column_stack([features(d, cols_gb[:-1]), d["month"].to_numpy()])  # noqa: E731
    gb.fit(Xgb(tr), tr["y"])
    probs["gradient_boosting[ecmwf+gfs+max3h+mes]"] = (gb.predict_proba(Xgb(va))[:, 1], gb.predict_proba(Xgb(te))[:, 1])
    probs["climatologia_mensual"] = (clim_p(va), clim_p(te))

    # Umbral de decisión elegido SOLO en validación: menor FAR con POD ≥ 0.6 (sensibilidad mínima para eventos peligrosos).
    def pick_threshold(y: np.ndarray, p: np.ndarray) -> float:
        best, best_far = 0.5, 1.1
        for t in np.linspace(0.02, 0.8, 79):
            c = contingency(y, (p >= t).astype(int))
            if c["pod"] is not None and c["pod"] >= 0.6 and (c["far"] if c["far"] is not None else 1) < best_far:
                best, best_far = float(t), c["far"] if c["far"] is not None else 1
        return best

    yte = te["y"].to_numpy()
    for name, (pva, pte) in probs.items():
        t = pick_threshold(va["y"].to_numpy(), pva)
        c = contingency(yte, (pte >= t).astype(int))
        days = te["end"].to_numpy()
        report["modelos"][name] = {
            "tipo": "probabilistico",
            "umbral_decision_validacion": t,
            **c,
            **prob_metrics(yte, pte, clim_all),
            "ic90_csi": bootstrap_ci(days, yte, pte, lambda yy, pp: contingency(yy, (pp >= t).astype(int))["csi"]),
            "ic90_brier": bootstrap_ci(days, yte, pte, lambda yy, pp: float(np.mean((pp - yy) ** 2))),
            "confiabilidad": reliability(yte, pte),
        }

    # Baselines deterministas (umbral físico fijo, sin ajuste).
    for name, col in {"ecmwf_determinista": "ecmwf_sum", "gfs_determinista": "gfs_sum", "persistencia": "persist_mm"}.items():
        d = te.dropna(subset=[col])
        yhat = (d[col].to_numpy() >= T).astype(int)
        report["modelos"][name] = {
            "tipo": "determinista", "regla": f"{col} ≥ {T:g} mm", **contingency(d["y"].to_numpy(), yhat),
            "ic90_csi": bootstrap_ci(d["end"].to_numpy(), d["y"].to_numpy(), yhat, lambda yy, hh: contingency(yy, hh)["csi"]),
        }

    # Criterio de promoción (acordado en docs/modelos/criterios.md):
    #  1. Brier en prueba menor que climatología (BSS > 0) con IC que no cruce el de climatología.
    #  2. CSI ≥ al mejor baseline determinista individual.
    #  3. ≥ 15 días con evento en el conjunto de prueba (si no, la evaluación no es concluyente).
    #  4. Revisión meteorológica humana (no automatizable): siempre pendiente aquí.
    best_det = max((m["csi"] or 0) for k, m in report["modelos"].items() if m["tipo"] == "determinista")
    cand = report["modelos"]["logistica[ecmwf+gfs]"]
    checks = {
        "bss_positivo": (cand["bss_vs_climatologia"] or 0) > 0,
        "csi_supera_mejor_baseline": (cand["csi"] or 0) >= best_det,
        "muestra_suficiente": report["datos"]["dias_con_evento_prueba"] >= 15,
        "revision_meteorologica": False,
    }
    status = "candidate" if all(v for k, v in checks.items() if k != "revision_meteorologica") else "shadow"
    report["promocion"] = {"candidato": "logistica[ecmwf+gfs]", "criterios": checks, "estado": status,
                           "nota": "Ningún modelo pasa a 'promoted' sin revisión meteorológica documentada."}

    lr = fitted["ecmwf+gfs"]
    model = {
        "name": "rain-daily", "version": f"lluvia-diaria-logistica-v1-{T:g}mm", "status": status,
        "event": report["evento"],
        "features": ["log1p_ecmwf_sum24h", "log1p_gfs_sum24h"],
        "coef": [float(c) for c in lr.coef_[0]], "intercept": float(lr.intercept_[0]),
        "ranges": {"log1p_ecmwf_sum24h": [0, float(np.log1p(df["ecmwf_sum"].max()))], "log1p_gfs_sum24h": [0, float(np.log1p(df["gfs_sum"].max()))]},
        "metrics": {k: cand[k] for k in ("pod", "far", "csi", "brier", "bss_vs_climatologia", "pr_auc")},
        "trainedOn": {"hasta": str(TRAIN_END.date()), "filas": len(tr), "eventos": int(tr["y"].sum())},
    }
    (ROOT / "reports").mkdir(exist_ok=True)
    (ROOT / "reports" / "evaluacion.json").write_text(json.dumps(report, indent=2, ensure_ascii=False, default=float))
    reg_path = REPO / "src" / "server" / "modules" / "risk" / "models" / "registry.json"
    reg = json.loads(reg_path.read_text())
    reg["models"] = [m for m in reg["models"] if m["version"] != model["version"]] + [model]
    reg_path.write_text(json.dumps(reg, indent=2, ensure_ascii=False) + "\n")
    write_markdown(report)
    print(json.dumps({k: {kk: (round(vv, 3) if isinstance(vv, float) else vv) for kk, vv in v.items() if kk in ("pod", "far", "csi", "brier", "bss_vs_climatologia", "pr_auc")} for k, v in report["modelos"].items()}, indent=1, ensure_ascii=False))
    print("promoción:", report["promocion"])


def write_markdown(r: dict) -> None:
    f = lambda v: "—" if v is None else (f"{v:.3f}" if isinstance(v, float) else str(v))  # noqa: E731
    ci = lambda v: "—" if not v else f"[{v[0]:.2f}, {v[1]:.2f}]"  # noqa: E731
    lines = [
        f"# Evaluación — {r['evento']}", "", f"Generado: {r['generado']} (reproducible con `python -I ml/src/train_eval.py`).", "",
        "## Datos", "", f"- Estaciones: {', '.join(r['datos']['estaciones'])}",
        f"- Filas (entrenamiento/validación/prueba): {r['datos']['filas']}", f"- Eventos: {r['datos']['eventos']}",
        f"- Días con evento en prueba: {r['datos']['dias_con_evento_prueba']}", f"- Exclusiones: {r['datos']['excluidas_qc']}", "",
        "## Resultados en el conjunto de prueba (≥ 2026-01-01, nunca usado para ajustar)", "",
        "| Modelo | POD | FAR | CSI (IC 90 %) | Brier | BSS vs clim. | PR-AUC |", "|---|---|---|---|---|---|---|",
    ]
    for k, m in r["modelos"].items():
        lines.append(f"| {k} | {f(m['pod'])} | {f(m['far'])} | {f(m['csi'])} {ci(m.get('ic90_csi'))} | {f(m.get('brier'))} | {f(m.get('bss_vs_climatologia'))} | {f(m.get('pr_auc'))} |")
    lines += ["", "POD = TP/(TP+FN); FAR = FP/(TP+FP) (razón de falsas alarmas, no tasa de falsos positivos); CSI = TP/(TP+FP+FN).",
              "Umbral de decisión de los modelos probabilísticos: el de menor FAR con POD ≥ 0,6 en validación.", "",
              "## Promoción", "", "```json", json.dumps(r["promocion"], indent=2, ensure_ascii=False), "```", ""]
    (ROOT / "reports" / "evaluacion.md").write_text("\n".join(lines))


if __name__ == "__main__":
    main()
