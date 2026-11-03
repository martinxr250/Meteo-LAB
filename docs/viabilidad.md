# Informe de viabilidad — Córdoba Capital y alrededores

Fecha: 2026-11-03. Basado en pruebas de acceso reales (ver `docs/fuentes/matriz.md` y `/fuentes` en la app).

## Qué podemos modelar hoy con evidencia
| Fenómeno | Qué ofrecemos | Evidencia | Qué falta para más |
|---|---|---|---|
| **Avisos oficiales** (todos los fenómenos) | Alertas y avisos a corto plazo del SMN cruzados con tus lugares, con color, vigencia, instrucciones y autoría | Feed CAP 1.2 con polígonos, CC BY 4.0, probado | Monitorear disponibilidad 30 días |
| **Lluvia intensa diaria** | Frecuencia en ensambles (ECMWF/GEFS) de superar umbrales 1 h/3 h/24 h; modelo logístico diario evaluado contra pluviómetros INA (en sombra) | 3 979 días-estación, 57 eventos ≥ 20 mm; evaluación en `ml/reports/evaluacion.md` | Más eventos para cerrar intervalos; pluviómetros subdiarios (OHMC/municipio) para intensidad horaria |
| **Granizo** | Solo **condiciones favorables** (ingredientes: CAPE, nivel de congelación, disparo convectivo) | Datos de modelo disponibles; **sin etiquetas verificadas de granizo en superficie** | Radar polarimétrico RMA1 (convenio SINARAME) y un registro verificado de granizo (p. ej., reportes moderados + aseguradoras + SMN) |
| **Anegamientos urbanos** | Condiciones favorables (lluvia prevista + antecedente + indicador topográfico DEM 90 m) | DEM Copernicus vía Open-Meteo | Puntos críticos y red de drenaje municipales; registro histórico de anegamientos |
| **Crecidas fluviales / repentinas** | **No se estiman** | INA a5 no tiene pronóstico para arroyos de la Capital | Pronóstico hidrológico del INA o de la APRHI; niveles en tiempo real del Suquía y La Cañada |
| **Nowcasting 0–60 min** | No. Se muestra satélite GOES-19 infrarrojo (topes de tormenta) cada 10 min | No hay radar público para Córdoba; RainViewer no la cubre | Volúmenes RMA1 en tiempo real (convenio) |

## Producto útil mientras tanto
1. Avisos oficiales del SMN geolocalizados para casa, trabajo y **auto** (con vigilancia temporal), con notificaciones push.
2. Estimaciones propias rotuladas, explicadas y en **modo sombra** hasta la revisión profesional.
3. Transparencia total: estado de fuentes, antigüedad de cada dato y degradación visible.

## Bloqueos y gestiones necesarias
| Bloqueo | Gestión | Responsable sugerido |
|---|---|---|
| Radar RMA1 (SINARAME) | Convenio de datos con SMN / Subsecretaría de Recursos Hídricos | Dirección del proyecto |
| Red provincial (OHMC, SIHM-APRHI) | Convenio de datos; los portales no respondieron en la prueba | Dirección del proyecto |
| Pluviómetros y puntos críticos municipales | Pedido a Defensa Civil de la Municipalidad de Córdoba | Dirección del proyecto |
| Uso comercial de Open-Meteo | Plan pago o acuerdo si el producto se comercializa | Dirección del proyecto |
| Revisión meteorológica e hidrológica | Profesional matriculado/a revisa umbrales, textos y resultados antes de activar avisos propios | Dirección del proyecto |
| NASA Earthdata (GPM IMERG) | Crear credenciales gratuitas | Equipo técnico |
