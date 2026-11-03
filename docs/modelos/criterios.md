# Criterios de promoción de modelos

Un modelo pasa de `shadow` → `candidate` solo si, **en el conjunto de prueba final** (no usado para ajustar):
1. Brier skill score > 0 contra la climatología mensual.
2. CSI ≥ al del mejor baseline determinista individual (hoy, GFS ≥ 20 mm).
3. Al menos **15 días con evento** en prueba (por debajo, la evaluación no es concluyente).

Y de `candidate` → `promoted` solo con:
4. Revisión meteorológica documentada (umbrales, textos, casos de falsa alarma y omisión).
5. Cuatro semanas en modo sombra en producción, con métricas en línea consistentes con la evaluación.

Sensibilidad mínima: el umbral de decisión se elige como el de **menor FAR con POD ≥ 0,6** en validación.
La curva completa POD/FAR se reporta en `ml/reports/evaluacion.json`. No se fijan objetivos como "99 % de precisión".
