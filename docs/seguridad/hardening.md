# Matriz de requisitos de seguridad (OWASP ASVS 5.0, objetivo nivel 2) y API Top 10 2023

> ASVS 5.0.0 es la versión vigente (publicada en mayo de 2025). Esta matriz cubre los controles **aplicables**
> a la arquitectura actual. **No declara cumplimiento**: cada fila indica evidencia y estado verificable.

Estados: ✅ implementado y verificado con prueba · 🟡 implementado sin prueba automatizada · ⏳ pendiente · ➖ no aplica.

| ID | Requisito (resumen) | Ref. | Evidencia | Estado |
|---|---|---|---|---|
| H-01 | Autorización a nivel de objeto en cada recurso | ASVS V8 · API1 | RLS en `places`, `notices`, `push_subscriptions`, `notification_prefs`, `community_reports`; `supabase/tests/rls_test.sql` | ✅ |
| H-02 | Autorización a nivel de función (admin/moderación) | ASVS V8 · API5 | `has_role()` + políticas; `/api/ops`, `/api/reports/[id]` | ✅ |
| H-03 | MFA para funciones administrativas | ASVS V6 | `has_role()` exige `aal=aal2`; enrolamiento TOTP en `/api/auth/mfa` | ✅ (BD) / 🟡 (UI) |
| H-04 | Autenticación sin contraseñas débiles | ASVS V6 | OTP por correo (Supabase); respuesta idéntica exista o no la cuenta | 🟡 |
| H-05 | Sesiones en cookies `HttpOnly`, `Secure`, `SameSite` | ASVS V7 | `src/server/db/supabase.ts`, `src/proxy.ts` | 🟡 |
| H-06 | Protección CSRF | ASVS V3 | `sameOrigin()` en todas las mutaciones | 🟡 |
| H-07 | Validación estricta de entradas | ASVS V2 · API3 | Esquemas Zod `.strict()` en todas las rutas; límites de tamaño de cuerpo | 🟡 |
| H-08 | Consultas parametrizadas | ASVS V1 | Solo PostgREST/supabase-js; sin SQL dinámico | ✅ (por diseño) |
| H-09 | CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy | ASVS V3 | `next.config.ts`, `src/proxy.ts` (nonce por request) | 🟡 |
| H-10 | CORS restrictivo | ASVS V3 | No se emiten cabeceras CORS: solo mismo origen | ✅ (por diseño) |
| H-11 | SSRF | ASVS V1 · API7 | Lista blanca de hosts en `fetchSource`; `isAllowedPushEndpoint` | 🟡 |
| H-12 | Rate limiting y cuotas | API4 | Rate limit por IP en `/api/risk`, `/api/reports`, login, MFA; cuotas de 10 lugares y 5 reportes/h en BD | 🟡 (falta regla global en Vercel Firewall) |
| H-13 | Límites de tiempo y tamaño en llamadas salientes | API4 | `timeoutMs`, `maxBytes` en `fetchSource`; ZIP con tope de descompresión | ✅ |
| H-14 | Gestión de secretos | ASVS V13 | Solo variables de entorno; `.env*` ignorado; `service_role` solo en servidor | 🟡 (+ gitleaks en CI) |
| H-15 | Logs sin datos sensibles | ASVS V16 | `redact()` + prueba en `tests/risk.test.ts` | ✅ |
| H-16 | Minimización y retención de ubicaciones | ASVS V14 | 3 decimales en lugares, 2 en reportes; auto ≤ 24 h; `apply_retention()` probada | ✅ |
| H-17 | Auditoría de cambios en modelos, umbrales y reglas | ASVS V16 | Triggers `audit_changes` | ✅ (moderación) / 🟡 (modelos) |
| H-18 | Artefactos de modelos seguros | — | JSON sin código; validación de rangos; `loadPromotedModel` | ✅ |
| H-19 | Envenenamiento de datos | — | Reportes nunca etiquetas; hash de crudos; flags QC | 🟡 |
| H-20 | Archivos subidos | ASVS V5 | **No se aceptan archivos** en esta fase (reportes sin fotos) | ➖ |
| H-21 | Escaneo de dependencias, secretos y código | ASVS V15 | CI: `pnpm audit`, gitleaks, osv-scanner, CodeQL | 🟡 (configurado, sin ejecutar en GitHub) |
| H-22 | Base de datos sin exposición innecesaria | — | Supabase gestionado; el cliente no recibe la URL ni la clave anon (BFF) | 🟡 |
| H-23 | Backups con restauración probada | — | Supabase PITR (plan Pro) — **restauración no probada aún** | ⏳ |
| H-24 | Rollback | — | Vercel "Instant Rollback"; migraciones solo aditivas | ⏳ (procedimiento en `docs/operacion/runbook.md`) |
| H-25 | Respuesta a incidentes | — | `docs/operacion/runbook.md` | 🟡 |
| H-26 | DAST / pentest | ASVS | — | ⏳ |
