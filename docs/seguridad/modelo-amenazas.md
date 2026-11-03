# Modelo de amenazas (STRIDE) — Meteo-LAB

Versión 0.1 · 2026-11-03 · Alcance: monolito Next.js en Vercel (región `gru1`) + Supabase (sa-east-1).

## Activos
| Activo | Sensibilidad | Dónde vive |
|---|---|---|
| Ubicaciones guardadas (casa, trabajo, auto) | **Alta**: permiten inferir rutinas y domicilio | `places` (3 decimales ≈ 110 m), navegador en modo local |
| Suscripciones push | Media (endpoint + claves) | `push_subscriptions` |
| Avisos y entregas por persona | Media | `notices`, `deliveries` |
| Reportes comunitarios | Media; riesgo de abuso | `community_reports` (2 decimales ≈ 1 km) |
| Modelos, umbrales y reglas | **Integridad crítica**: un cambio malicioso silencia avisos | `registry.json` (repo), `model_registry`, `alert_rules` |
| Claves (service_role, VAPID, CRON_SECRET) | Crítica | Variables de entorno de Vercel |

## Límites de confianza
```
Navegador ──HTTPS──▶ Vercel (Next.js: páginas + /api, proxy con CSP)
                         │  cookies httpOnly (BFF: el navegador nunca habla con Supabase)
                         ├──▶ Supabase Auth / PostgREST (anon + JWT del usuario → RLS)
                         ├──▶ Supabase con service_role (solo /api/cron/*, autenticado con CRON_SECRET)
                         ├──▶ Fuentes externas (lista blanca de hosts, solo HTTPS, sin redirecciones)
                         └──▶ Servicios de push (lista blanca de dominios)
Vercel Cron ──Bearer CRON_SECRET──▶ /api/cron/*
```

## Amenazas y controles
| # | STRIDE | Amenaza | Control implementado | Estado |
|---|---|---|---|---|
| T1 | I | Leer ubicaciones o avisos de otra persona (IDOR/BOLA) | RLS `user_id = auth.uid()` en todas las tablas personales; rutas sin IDs de usuario en la URL | Probado (`supabase/tests/rls_test.sql`) |
| T2 | E | Escalar a admin/moderador | Rol sin permisos de escritura del cliente; `has_role()` exige `aal2` (MFA) | Probado |
| T3 | T | Autoaprobar reportes o marcarlos como verdad de entrenamiento | Trigger fuerza `pendiente` y `usable_for_training=false` | Probado |
| T4 | S | CSRF en mutaciones | Cookies `SameSite=Lax` + verificación de `Origin` en toda mutación | Implementado |
| T5 | T/I | XSS a partir de textos del SMN o de reportes | React escapa; sin `dangerouslySetInnerHTML`; CSP con nonce y `strict-dynamic` | Implementado |
| T6 | I | SSRF vía endpoints de push o URLs de fuentes | Lista blanca de hosts de fuentes y de servicios de push; `redirect: manual` | Implementado + pruebas parciales |
| T7 | D | Abuso de `/api/risk` (cada llamada consulta terceros) | Rate limit por IP, celdas de 0.05° cacheadas, `maxDuration` | Implementado (límite por instancia; ver H-12) |
| T8 | T | Envenenamiento de datos de entrada (feed falso, observación manipulada) | Solo HTTPS a hosts oficiales; hash SHA-256 de cada crudo; flags de calidad; reportes nunca entran a entrenamiento sin verificación | Implementado |
| T9 | T | Artefacto de modelo malicioso (pickle) | Modelos exportados como JSON de coeficientes; validación de forma y rangos; sin ejecución de código al cargar | Implementado |
| T10 | R | Cambios no trazables en modelos/reglas | Trigger de auditoría en `model_registry`, `alert_rules`, `profiles`, moderación | Probado (moderación) |
| T11 | I | Coordenadas en logs | `redact()` reduce coordenadas a 1 decimal y quita secretos | Probado |
| T12 | I | Filtrar la ubicación exacta a terceros | A Open-Meteo se envía la celda (~5 km); al DEM, 3 decimales | Implementado |
| T13 | S | Llamar al cron sin autorización | `Bearer CRON_SECRET` comparado en tiempo constante; sin secreto (< 32 car.) se rechaza todo | Implementado |
| T14 | D | XML hostil en el feed CAP | Parser sin entidades externas, límites de tamaño y de cantidad de documentos | Implementado |
| T15 | I | Falsa sensación de seguridad ("sin riesgo") | Nivel `sin_datos` explícito, estado de fuentes visible, avisos oficiales nunca filtrados por el modelo | Implementado (de producto) |

## Riesgos residuales
- El rate limit en memoria es por instancia de Vercel: configurar reglas de **Vercel Firewall** por ruta antes del lanzamiento.
- Sin escaneo DAST todavía. Sin pentest externo.
- La disponibilidad depende de fuentes sin SLA (SMN, INA, Open-Meteo).
