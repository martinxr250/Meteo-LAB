# Privacidad y retención

| Dato | Precisión guardada | Retención | Borrado |
|---|---|---|---|
| Lugares (casa, trabajo, otro) | 3 decimales (~110 m) | Mientras exista la cuenta | El usuario lo borra en Lugares; cascada al borrar la cuenta |
| Auto ("Dejé el auto acá") | 3 decimales | Hasta `watch_until` (máx. 24 h) | `apply_retention()` diaria; en modo local, al vencer se ignora y se descarta |
| Reportes comunitarios | 2 decimales (~1 km) | Rechazados: 30 días · Aprobados: mientras sean útiles | Su autor puede borrarlos |
| Avisos y eventos | — | 90 días tras cerrarse | `apply_retention()` |
| Entregas push | — | 90 días | `apply_retention()` |
| Datos crudos de fuentes públicas | Original | 30 días en BD | `apply_retention()` |

- A proveedores externos se envía la **celda de 0,05°** (~5 km), nunca la ubicación exacta.
- Sin cuenta, la lista de lugares **no sale del navegador**: el servidor solo recibe consultas de punto sin identificar a la persona.
- Logs: coordenadas a 1 decimal (~11 km), sin tokens ni endpoints de push.
