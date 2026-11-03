# Plan de validación y lanzamiento

| Fase | Qué | Criterio de salida | Estado |
|---|---|---|---|
| 0. Replays | Reprocesar tormentas pasadas con datos disponibles en cada momento | Avisos oficiales correctos en ≥ 95 % de los casos; sin duplicados | ⏳ requiere archivo CAP propio (el SMN no publica historial) |
| 1. Sombra | Ingesta cada 10 min; estimaciones registradas en `predictions` sin notificar | 4 semanas estables; latencia p95 dato → decisión < 5 min | ⏳ |
| 2. Avisos oficiales | Notificar solo avisos del SMN atribuidos | Fallos de entrega < 2 %; sin spam (≤ 1 notificación/aviso/lugar) | Listo para activar con Supabase + VAPID |
| 3. Revisión profesional | Meteorólogo/a e hidrólogo/a revisan umbrales y textos | Acta firmada | ⏳ |
| 4. Estimaciones propias | `OWN_ESTIMATES_MODE=live` | Criterios de `docs/modelos/criterios.md` | ⏳ |

Nada de lo anterior se declara completado hasta ejecutarse.
