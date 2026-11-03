# Evaluación — lluvia acumulada 12Z→12Z ≥ 20 mm en el pluviómetro

Generado: 2026-11-03T02:50:32+00:00 (reproducible con `python -I ml/src/train_eval.py`).

## Datos

- Estaciones: Bosque Alegre, Falda del Carmen, Jesus Maria, Pilar, Santa Sabina
- Filas (entrenamiento/validación/prueba): {'entrenamiento': 2124, 'validacion': 368, 'prueba': 1160}
- Eventos: {'entrenamiento': 33, 'validacion': 8, 'prueba': 16}
- Días con evento en prueba: 8
- Exclusiones: obs > 250 mm (marcadas para revisión) y días sin pronóstico completo

## Resultados en el conjunto de prueba (≥ 2026-01-01, nunca usado para ajustar)

| Modelo | POD | FAR | CSI (IC 90 %) | Brier | BSS vs clim. | PR-AUC |
|---|---|---|---|---|---|---|
| logistica[ecmwf+gfs] | 0.625 | 0.844 | 0.143 [0.04, 0.24] | 0.012 | 0.155 | 0.324 |
| logistica[solo_ecmwf] | 0.875 | 0.928 | 0.071 [0.03, 0.12] | 0.013 | 0.072 | 0.171 |
| logistica[solo_gfs] | 0.625 | 0.722 | 0.238 [0.06, 0.40] | 0.011 | 0.206 | 0.452 |
| logistica[ecmwf+gfs+max3h] | 0.625 | 0.863 | 0.127 [0.02, 0.22] | 0.012 | 0.151 | 0.322 |
| gradient_boosting[ecmwf+gfs+max3h+mes] | 0.188 | 0.700 | 0.130 [0.00, 0.19] | 0.014 | -0.001 | 0.176 |
| climatologia_mensual | 0.000 | — | 0.000 [0.00, 0.00] | 0.013 | 0.022 | 0.049 |
| ecmwf_determinista | 0.250 | 0.852 | 0.103 [0.00, 0.18] | — | — | — |
| gfs_determinista | 0.562 | 0.308 | 0.450 [0.17, 0.65] | — | — | — |
| persistencia | 0.062 | 0.938 | 0.032 [0.00, 0.09] | — | — | — |

POD = TP/(TP+FN); FAR = FP/(TP+FP) (razón de falsas alarmas, no tasa de falsos positivos); CSI = TP/(TP+FP+FN).
Umbral de decisión de los modelos probabilísticos: el de menor FAR con POD ≥ 0,6 en validación.

## Promoción

```json
{
  "candidato": "logistica[ecmwf+gfs]",
  "criterios": {
    "bss_positivo": true,
    "csi_supera_mejor_baseline": false,
    "muestra_suficiente": false,
    "revision_meteorologica": false
  },
  "estado": "shadow",
  "nota": "Ningún modelo pasa a 'promoted' sin revisión meteorológica documentada."
}
```
