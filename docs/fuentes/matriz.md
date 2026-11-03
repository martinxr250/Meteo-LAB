# Matriz de fuentes

La matriz completa (variables, cobertura, resolución, latencia, historial, acceso, licencia, atribución, costo y limitaciones)
vive en código, en [`src/lib/sources-catalog.ts`](../../src/lib/sources-catalog.ts), y se publica en la app en **/fuentes**,
así la documentación y el producto no divergen.

| Fuente | Estado | Probado | Uso |
|---|---|---|---|
| SMN — Alertas y avisos CAP | Acceso probado | 2026-11-02 | Avisos oficiales |
| SMN — Estado del tiempo (datos abiertos) | Acceso probado | 2026-11-02 | Contexto, operación |
| INA — a5 (RHN) | Acceso probado | 2026-11-02 | Etiquetas de lluvia diaria |
| Open-Meteo (pronósticos, ensambles, corridas previas, DEM) | Acceso probado | 2026-11-02 | Lluvia, granizo, topografía |
| NOAA GOES-19 (GLM/ABI) en AWS | Acceso probado | 2026-11-02 | Pendiente: decodificar NetCDF |
| NASA GIBS — GOES-19 infrarrojo | Acceso probado | 2026-11-03 | Pantalla Radar |
| RainViewer | Descartada: no cubre Córdoba | 2026-11-03 | — |
| IDECOR (GeoServer) | Acceso probado | 2026-11-02 | Pendiente: Carlos Paz |
| SINARAME / RMA1 | Bloqueada (convenio) | — | Nowcasting, granizo en altura |
| OHMC / SIHM-APRHI | Bloqueada (sin respuesta, convenio) | 2026-11-02 | Intensidad subdiaria |
| NASA GPM IMERG | Bloqueada (credenciales) | 2026-11-02 | Verificación |
| Municipalidad de Córdoba | Identificada | 2026-11-02 | Susceptibilidad urbana |
| CONAE | Identificada | — | Etiquetas de inundación |

## Resultados de las pruebas de acceso (2026-11-02, ~23 h ART)
- `ssl.smn.gob.ar/CAP/AR.php`: 200, 124 ítems; documentos CAP con `<polygon>`; ese día había una alerta naranja por tormentas con granizo sobre Córdoba Capital.
- `ws1.smn.gob.ar/v1/warning/alert/area/1`: **401** (requiere token del visor) → **no se usa**.
- `ssl.smn.gob.ar/dpd/zipopendata.php?dato=tiepre`: 200, ZIP con TXT Latin-1; `dato=pron5d` llegó **vacío**.
- `alerta.ina.gob.ar/a5/obs/puntual/series?var_id=1`: 200 (932 series); 53 en Córdoba y alrededores.
- `previous-runs-api.open-meteo.com`: corridas previas de ECMWF y GFS disponibles desde 2023.
- `noaa-goes19.s3.amazonaws.com`: listado de GLM-L2-LCFA al día.
- `ohmc.psi.unc.edu.ar`, `sihm.cba.gov.ar`: **sin respuesta** (timeout 20 s).
- `datos.cba.gov.ar` (CKAN): sin respuesta; portal municipal renderizado en el cliente, sin API documentada.

## Independencia de las evidencias
- `best_match` de Open-Meteo y los ensambles ECMWF-ENS/GEFS comparten insumos de los centros que los producen. ECMWF y NCEP son sistemas distintos, pero el determinista y el ensamble de un mismo centro **no** son evidencias independientes.
- Los avisos del SMN usan, entre otros, esos mismos modelos: una coincidencia entre el aviso y nuestra estimación **no** suma confianza como si fueran fuentes independientes.
