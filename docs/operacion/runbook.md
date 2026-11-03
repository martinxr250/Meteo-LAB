# Runbook de operación

## Despliegue
- `main` → producción en Vercel (automático). Ramas → previews. Región de funciones: `gru1` (São Paulo).
- Migraciones: `supabase db push` desde CI o manual. **Solo aditivas** (nunca borrar columnas en el mismo despliegue).

## Rollback
1. Vercel → Deployments → despliegue anterior → **Instant Rollback**.
2. Si hubo migración: aplicar la migración inversa ya preparada (las aditivas no requieren rollback).
3. Si un modelo/regla causó el problema: volver `registry.json` al commit anterior (queda auditado en git) o `update model_registry set status='retired'`.

## Fuente caída
- La app muestra "Datos parciales" y cada aviso dice "sin confirmar"; los avisos activos pasan a **degradado**, no a resuelto.
- Verificar `/api/status` y el panel /operaciones.

## Incidente de seguridad
1. Rotar `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET` y claves VAPID en Vercel y redeployar.
2. Revocar sesiones en Supabase Auth si hay sospecha de robo de sesión.
3. Revisar `audit_log` y logs de Vercel (sin coordenadas precisas ni tokens).
4. Notificar a las personas afectadas según la Ley 25.326 de Protección de Datos Personales.

## Backups
- Supabase Pro: backups diarios + PITR. **Pendiente: probar una restauración completa en un proyecto de staging** y registrar el tiempo.
