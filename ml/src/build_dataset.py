"""
Construye el dataset de lluvia diaria para Gran Córdoba.

Etiqueta: precipitación acumulada 12Z→12Z medida por pluviómetros INA/RHN (a5).
Predictores: lluvia pronosticada por ECMWF IFS 0.25° y GFS para la misma ventana, tomada de
corridas emitidas al menos 48 h antes de cada hora (Open-Meteo `previous_day2`).
Así cada predictor estaba disponible ANTES del inicio de la ventana: no hay fuga temporal.

Los datos crudos se guardan tal cual (data/raw) con su hash; el dataset normalizado va a data/dataset.csv.
Uso:  python -I ml/src/build_dataset.py
"""
from __future__ import annotations

import hashlib
import ssl
import json
import pathlib
import time
import urllib.parse
import urllib.request

import certifi
import pandas as pd

ROOT = pathlib.Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
RAW.mkdir(parents=True, exist_ok=True)
SSL = ssl.create_default_context(cafile=certifi.where())
UA = "MeteoLAB-ml/0.1 (+https://github.com/martinxr250/Meteo-LAB)"

# Mismas series que src/server/modules/sources/ina-a5.ts (coordenadas publicadas por a5).
STATIONS = [
    (33354, "Jesus Maria", -30.9769, -64.1394),
    (39490, "Bosque Alegre", -31.5975, -64.5503),
    (39491, "Falda del Carmen", -31.5214, -64.4656),
    (39493, "Pilar", -31.6678, -63.8817),
    (39510, "Santa Sabina", -30.8558, -64.3086),
]
START, END = "2023-01-01", "2026-11-01"
MODELS = {"ecmwf": "ecmwf_ifs025", "gfs": "gfs_seamless"}


def fetch(url: str, name: str) -> bytes:
    path = RAW / name
    if path.exists():
        return path.read_bytes()
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=120, context=SSL) as r:
                body = r.read()
            path.write_bytes(body)
            (RAW / f"{name}.sha256").write_text(hashlib.sha256(body).hexdigest())
            time.sleep(1.0)  # cortesía con los servicios públicos
            return body
        except Exception as e:  # noqa: BLE001
            if attempt == 3:
                raise
            time.sleep(5 * (attempt + 1))
    raise RuntimeError("inalcanzable")


def observations(sid: int) -> pd.DataFrame:
    q = urllib.parse.urlencode({"timestart": START, "timeend": END, "format": "json"})
    body = fetch(f"https://alerta.ina.gob.ar/a5/obs/puntual/series/{sid}/observaciones?{q}", f"ina_{sid}.json")
    rows = json.loads(body)
    df = pd.DataFrame(rows)[["timestart", "timeend", "valor"]]
    df["end"] = pd.to_datetime(df["timeend"], utc=True)
    df["start"] = pd.to_datetime(df["timestart"], utc=True)
    df = df[(df["end"] - df["start"]) == pd.Timedelta(hours=24)]
    df = df.rename(columns={"valor": "obs_mm"})[["start", "end", "obs_mm"]]
    # Control de calidad: negativos fuera; extremos marcados (no se descartan sin revisión).
    df = df[df["obs_mm"] >= 0]
    df["qc_extreme"] = df["obs_mm"] > 250
    return df.drop_duplicates("end").sort_values("end")


def forecasts(lat: float, lon: float, sid: int) -> pd.DataFrame:
    frames = []
    for short, model in MODELS.items():
        q = urllib.parse.urlencode({
            "latitude": lat, "longitude": lon, "hourly": "precipitation_previous_day2",
            "models": model, "start_date": START, "end_date": END, "timezone": "UTC",
        })
        body = fetch(f"https://previous-runs-api.open-meteo.com/v1/forecast?{q}", f"om_{short}_{sid}.json")
        h = json.loads(body)["hourly"]
        s = pd.Series(h["precipitation_previous_day2"], index=pd.to_datetime(h["time"], utc=True), name=short, dtype="float64")
        frames.append(s)
    return pd.concat(frames, axis=1)


def window_features(hourly: pd.DataFrame, start: pd.Timestamp, end: pd.Timestamp) -> dict:
    w = hourly.loc[(hourly.index >= start) & (hourly.index < end)]
    out = {}
    for c in hourly.columns:
        v = w[c]
        complete = v.notna().sum() >= 22
        out[f"{c}_sum"] = float(v.sum()) if complete else None
        out[f"{c}_max1h"] = float(v.max()) if complete else None
        out[f"{c}_max3h"] = float(v.rolling(3).sum().max()) if complete else None
    return out


def main() -> None:
    rows = []
    for sid, name, lat, lon in STATIONS:
        obs = observations(sid)
        fc = forecasts(lat, lon, sid)
        prev = obs.set_index("end")["obs_mm"]
        for r in obs.itertuples():
            f = window_features(fc, r.start, r.end)
            # Persistencia: lo observado en la ventana anterior (disponible a las 12Z, al inicio de la ventana).
            yesterday = prev.get(r.start)
            rows.append({
                "station": sid, "name": name, "start": r.start, "end": r.end, "month": r.end.month,
                "obs_mm": r.obs_mm, "qc_extreme": r.qc_extreme, "persist_mm": yesterday, **f,
            })
        print(f"{name}: {len(obs)} días observados")
    df = pd.DataFrame(rows)
    df.to_csv(ROOT / "data" / "dataset.csv", index=False)
    print(f"dataset: {len(df)} filas → ml/data/dataset.csv")


if __name__ == "__main__":
    main()
