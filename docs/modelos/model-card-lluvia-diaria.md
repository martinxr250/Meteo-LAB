# Model card — `lluvia-diaria-logistica-v1-20mm`

- **Estado:** `shadow` (no promovido). Se registra en `src/server/modules/risk/models/registry.json` pero **no se aplica**.
- **Tarea:** probabilidad de lluvia ≥ 20 mm en 24 h (12Z→12Z) en un pluviómetro del Gran Córdoba.
- **Entradas:** `log1p` de la lluvia de 24 h pronosticada por ECMWF IFS 0,25° y GFS, de corridas emitidas ≥ 48 h antes de cada hora.
- **Datos:** INA a5, 5 pluviómetros RHN-SAT (Jesús María desde 2023-01; Bosque Alegre, Falda del Carmen, Pilar y Santa Sabina desde 2024-07).
- **Partición:** entrenamiento < 2025-10-01; validación 2025-10 a 2025-12; prueba ≥ 2026-01-01. Bootstrap por días completos.

## Resultados (prueba)
| Modelo | POD | FAR | CSI (IC 90 %) | BSS |
|---|---|---|---|---|
| Logística ECMWF+GFS | 0,63 | 0,84 | 0,14 [0,04–0,24] | 0,16 |
| Logística solo GFS | 0,63 | 0,72 | 0,24 [0,06–0,40] | 0,21 |
| Gradient boosting | 0,19 | 0,70 | 0,13 [0,00–0,19] | ≈ 0 |
| **GFS determinista ≥ 20 mm** | 0,56 | 0,31 | **0,45 [0,17–0,65]** | — |
| Climatología mensual | 0 | — | 0 | 0,02 |

## Interpretación
- Las probabilidades logísticas tienen habilidad sobre la climatología (BSS > 0), pero el umbral elegido en validación
  (solo 8 eventos) produce muchas falsas alarmas en prueba.
- **Ningún candidato supera al GFS determinista**, y con solo 8 días con evento en prueba los intervalos se superponen.
- Agregar ECMWF empeoró el CSI frente a "solo GFS" (ablación): en esta muestra, ECMWF a ≥ 48 h sobreestima lluvias débiles.
- El gradient boosting no se justifica con esta cantidad de datos.

## Sesgos y limitaciones
- Solo 5 pluviómetros, ninguno dentro del ejido de la Capital.
- Etiquetas diarias: no sirven para intensidad horaria.
- La prueba cubre un único verano (2026); años El Niño/La Niña no están balanceados.
- En producción el plazo es menor (≤ 24 h) que en entrenamiento (≥ 48 h): la habilidad real puede ser mayor, pero no se asume.
