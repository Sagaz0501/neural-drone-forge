# Cambios de PBDMM

## 2.0 · en diseño

Propuesta en [`PBDMM2_PLAN.md`](../PBDMM2_PLAN.md):

- `dron(…)` y `mision(…)` también **devuelven un objeto** para leer (`d.empuje_peso`, `m.pide`), además de `ficha()`,
  `hangar()`, `inventario()` y `modelo_de()`.
- `revisar(d, m)`: el programa compara el dron con lo que pide la misión antes de entrenar, solo si usa `dron(…)`.
- Narrador y diagnósticos en la terminal, `e.cambio` y `explicar()`.
- `tabla()`, `barra()` y `color()` para la terminal.
- La **ruta del programador**: cada dron nuevo abre un capítulo con un programa guiado y un reto.

## 1.0 · 15-10-2026

- El lenguaje: un subconjunto de Python (números, textos, f-textos con formato, listas, tuplas, diccionarios,
  `if`/`elif`/`else`, `for`, `def`/`return` con valores por defecto, `global`, comprensiones, `x if c else y`,
  `f(*lista, **dicc)`, desempaquetar). Sin `while` ni `import`. Con límite de operaciones.
- Configuración: `modelo(desde=)`, `red(capas=)`, `mision`/`nivel`, `dron`, `drones`, `entrenar_en`, `velocidad`,
  `viento`, `aprendizaje(lr, exploracion)`.
- `premios(…)` y `castigos(…)`, separados y en escala 0 a 10.
- Funciones especiales: `al_empezar(e)`, `cada_generacion(e)` y `al_terminar(e)`, con el objeto `e`. En vivo:
  `pausar`, `seguir`, `guardar`, `detener` y `avisar`.
- Bilingüe: cada nombre en español o en inglés, y el comando `traducir`/`translate`.
- El Estudio: editor con colores y autocompletado, terminal con comandos, ayuda, 7 lecciones, 6 ejemplos, gráfica
  y la red neuronal en vivo.
