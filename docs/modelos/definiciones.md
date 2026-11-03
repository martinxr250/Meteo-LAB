# Definiciones de los problemas predictivos

| Salida | Área | Horizonte | Definición del evento | Métrica mostrada | Se abstiene cuando |
|---|---|---|---|---|---|
| Lluvia intensa — ensamble | Celda 0,25° (~25 km) | 0–24 h | Máximo de la suma móvil de 1 h ≥ 10 mm, 3 h ≥ 30 mm o 24 h ≥ 50 mm | Frecuencia de miembros, sistemas con igual peso (sin calibrar) | No hay ensamble |
| Lluvia diaria — logística | Pluviómetro | Ventana 12Z→12Z, emitida ≥ 48 h antes | Acumulado ≥ 20 mm | Probabilidad (modo sombra) | Variables fuera del rango de entrenamiento |
| Granizo — condiciones | Celda del modelo | 0–24 h | **No** es ocurrencia: índice de ingredientes 0–5 | Nivel (bajo/atención/alto) | Falta CAPE |
| Anegamiento — condiciones | Punto ~110 m (topografía) + celda (lluvia) | 0–24 h | **No** es probabilidad de anegamiento | Nivel | Falta ensamble |
| Crecidas | — | — | No se estiman | — | Siempre (sin datos) |

Umbrales de lluvia **provisorios**: 10 mm/h y 30 mm/3 h son intensidades a partir de las cuales en Córdoba Capital se
reportan anegamientos de calles en la prensa; 50 mm/24 h se acerca a los acumulados de las alertas amarillas del SMN.
Requieren revisión meteorológica local.

Granizo en altura vs. en superficie: sin radar polarimétrico no podemos ver granizo en altura; sin registro verificado,
no podemos confirmar granizo en superficie. Nunca se muestra "granizo confirmado" salvo que provenga de una observación oficial.
