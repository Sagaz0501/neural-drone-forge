# Cambios de PBDMM

## El Estudio como computador · 16-10-2026

No cambia el lenguaje. El Estudio pasa a ser un computador con apps en ventanas que se mueven y se agrandan: IDE,
**Documentación** (Manual con buscador, Ruta y Lecciones; **F1** sobre una palabra del editor), Mensajes, Tienda,
Inventario, Simuladores (gráfica y red en vivo) y Finanzas.

## 2.1 · 16-10-2026

- **Misiones de fotos:** `mision("foto")` (nivel 13: llegar, frenar y quedarse quieto) y `mision("set_fotos")` (nivel 14:
  2-4 fotos seguidas). En inglés `mission("photo")` y `mission("photo_set")`. `nivel()` llega hasta el 14.
- **Premios y castigos nuevos** (Fase 1b): `premios(encuadre=…, quieto=…)` y `castigos(altura=…, paneo=…,
  exceso_velocidad=…, gas=…)`; en inglés `framing`, `settle`, `altitude`, `pan`, `overspeed`, `energy`.
- `explicar()` también explica cada premio y castigo: `explicar("encuadre")`, `explicar("gas")`.

## 2.0 · 15-10-2026

Plan y decisiones en [`PBDMM2_PLAN.md`](../PBDMM2_PLAN.md).

- **Leer el juego:** `dron(…)` y `mision(…)` también devuelven un objeto (`d.empuje_peso`, `m.pide`), y hay
  `dron_info()`, `mision_info()`, `modelo_info()`, `hangar()` e `inventario()`. Campos en español y en inglés.
- **Revisar el dron contra la misión:** `revisar(d, m)`, y automático al revisar/correr si el programa usa `dron(…)`
  con un dron del hangar (empuje/peso con viento, radio, batería, cámara, protectores, sensores ToF).
- **La terminal:** `ficha()`, `tabla()`, `barra()`, `color()`, `explicar()` y `narrar(cada=5)` (cuenta cómo va y avisa
  lo que se nota: se estancó, olvida, pagas por lo que no es, choca mucho). `e.cambio` y `e.diagnosticos`.
- **Más Python:** rebanadas `x[a:b]`, closures, valores por defecto calculados al definir, `True + 1 = 2`, `round` como
  Python, `max([])` da error, `sorted`/`reversed`/`enumerate`/`zip`/`any`/`all` (con `key=` y `reverse=`).
- **La ruta del programador:** 8 capítulos; cada dron que creas en el modo desarrollador abre uno, con un programa
  guiado y un reto que el juego mide solo (pestaña **Ruta** del Estudio).
- `traducir` también pasa los campos de los objetos (`d.empuje_peso` ↔ `d.thrust_weight`).

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
