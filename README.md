# Meteo-LAB

Plataforma de prevención meteorológica para **Córdoba Capital y alrededores**: granizo, lluvia intensa y anegamientos
en tus lugares guardados (casa, trabajo, **auto**), con los **avisos oficiales del SMN** atribuidos y estimaciones
propias rotuladas, explicadas y en **modo sombra** hasta su revisión profesional.

> No prometemos precisión absoluta ni predicción de granizo por domicilio. Ante cualquier duda, prevalecen los avisos del
> Servicio Meteorológico Nacional y las indicaciones de las autoridades locales.

## Arquitectura
Monolito modular Full Stack en **Next.js 16 + React 19 + TypeScript**, desplegado completo en **Vercel** (región `gru1`,
São Paulo) con **Supabase / PostgreSQL + PostGIS** (sa-east-1).

```
src/
  app/                 páginas (PWA) y API (route handlers)
    (app)/             resumen, mapa, lugares, alertas, reportes, preferencias, fuentes, operaciones
    api/               risk, official-alerts, radar, status, places, car, notices, prefs, push, reports, ops, auth/*, cron/*
  server/
    core/              env, salida HTTP con lista blanca (SSRF), logs con redacción, rate limit, cron
    db/                clientes Supabase (usuario con RLS / servicio)
    modules/
      sources/         conectores: SMN CAP, SMN observaciones, INA a5, Open-Meteo
      risk/            lluvia (ensambles), granizo (ingredientes), anegamiento (condiciones + DEM), calibración
      alerts/          motor de decisión: deduplicación, histéresis, vencimiento, modo sombra
      notify/          Web Push (VAPID)
      ops/             pipeline de ingesta → inferencia → decisión → envío
  lib/                 dominio compartido, geometría, catálogo de fuentes
supabase/migrations/   esquema + RLS + auditoría + retención
supabase/tests/        pruebas de aislamiento RLS en PostGIS efímero (Docker)
ml/                    dataset reproducible, baselines, entrenamiento y evaluación (Python)
docs/                  viabilidad, fuentes, modelos, seguridad, operación, costos
```

Integraciones (GitLab REST/Webhooks/MCP): la capa `server/modules/*` expone funciones puras reutilizables desde nuevas
rutas `/api/integrations/*`; no hay integraciones activas en esta fase.

## Puesta en marcha
```bash
pnpm install
cp .env.example .env.local   # opcional: sin Supabase corre en "modo local" con datos públicos en vivo
pnpm dev
```
- **Modo local** (sin variables de Supabase): resumen, mapa, alertas y fuentes funcionan con datos reales; los lugares se guardan en el navegador.
- **Con Supabase**: crear proyecto en sa-east-1, aplicar `supabase/migrations/*`, completar `.env.local`.
- **Notificaciones**: `npx web-push generate-vapid-keys` y cargar las claves.

## Pruebas
```bash
pnpm test                    # unitarias (parsers con muestras reales, motor de avisos, riesgo, privacidad)
supabase/tests/run.sh        # migración + RLS (requiere Docker)
pnpm lint && pnpm typecheck && pnpm build
```

## Modelos
```bash
python3 -m venv ml/.venv && ml/.venv/bin/pip install -r ml/requirements.txt
ml/.venv/bin/python -I ml/src/build_dataset.py   # descarga INA + corridas previas de Open-Meteo
ml/.venv/bin/python -I ml/src/train_eval.py      # baselines, candidatos, ablaciones, IC bootstrap
```
Resultados: [`ml/reports/evaluacion.md`](ml/reports/evaluacion.md) · Model card: [`docs/modelos/model-card-lluvia-diaria.md`](docs/modelos/model-card-lluvia-diaria.md).

## Despliegue (Vercel)
1. Importar el repo en Vercel; rama de producción `main` (CI/CD automático).
2. Variables de entorno de `.env.example` en Production/Preview (separadas).
3. `vercel.json` programa la ingesta y la retención. En plan **Hobby** los cron corren 1×/día; para cada 10 min se necesita **Pro**
   (o un `pg_cron` de Supabase que llame a `/api/cron/ingest` con el `CRON_SECRET`).

## Documentación
- [Viabilidad](docs/viabilidad.md) · [Matriz de fuentes](docs/fuentes/matriz.md) · [Definiciones](docs/modelos/definiciones.md) · [Criterios de promoción](docs/modelos/criterios.md)
- [Modelo de amenazas](docs/seguridad/modelo-amenazas.md) · [Matriz ASVS](docs/seguridad/hardening.md) · [Privacidad](docs/seguridad/privacidad.md)
- [Runbook](docs/operacion/runbook.md) · [Lanzamiento](docs/operacion/lanzamiento.md) · [Costos](docs/costos.md)

Atribuciones: Servicio Meteorológico Nacional (CC BY 4.0) · Instituto Nacional del Agua · Open-Meteo.com (CC BY 4.0) · ECMWF · NOAA ·
RainViewer · © OpenStreetMap / OpenFreeMap.
