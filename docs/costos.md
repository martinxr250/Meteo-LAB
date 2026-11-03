# Costos estimados (USD/mes)

Supuestos: 5 000 personas activas, 2 lugares promedio, ingesta cada 10 min, ~1 500 celdas únicas de 0,05°.

| Rubro | Escenario inicial (no comercial) | Escenario comercial | Notas |
|---|---|---|---|
| Vercel | 0 (Hobby) | 20 por miembro (Pro) | Hobby: cron 1×/día y sin uso comercial. Pro: cron cada 10 min, `maxDuration` 300 s |
| Supabase (sa-east-1) | 0 (Free) | 25 (Pro) + cómputo | PITR y backups diarios requieren Pro |
| Open-Meteo | 0 | ~29–99 | Uso comercial requiere plan; ~1 500 celdas × 2 llamadas × 6/h ≈ 430 k llamadas/día → plan "Professional" |
| NASA GIBS (satélite) | 0 | 0 | Uso libre con atribución |
| SMN, INA, NOAA | 0 | 0 | Licencias abiertas con atribución |
| Web Push | 0 | 0 | Servicios de push de los navegadores |
| Correo (OTP) | 0 (SMTP de Supabase, limitado) | ~10–20 | Proveedor SMTP propio para producción |
| Entrenamiento | 0 | 0 | Corre en segundos en una laptop (regresión logística) |
| **Total** | **~0** | **~100–200** | Sin incluir convenios de datos ni revisión profesional |
