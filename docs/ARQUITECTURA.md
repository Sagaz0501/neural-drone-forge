# Arquitectura

Cómo se conectan las piezas de **Neural Drone Forge**. Para la base de la que nace (el simulador y la IA de
`drone-rl`), ver [PROYECTO.md](PROYECTO.md); para las reglas de trabajo, [CLAUDE.md](../CLAUDE.md).

## El mapa

```
 ┌──────────────────────── navegador (app/, sin build: módulos ES + three.js) ────────────────────────┐
 │  main.js        pantallas, garaje, pedidos, vuelo, Laboratorio                                     │
 │  partida.js     la partida (localStorage): plata, inventario por unidades, hangar, modo normal/dev │
 │  banco.js / ui_banco.js   el banco de armado (pines, cortos, firmware, motores) y su pantalla       │
 │  mision_sim.js  un vuelo sin pantalla: game/sim.js (la física) + la red + batería + calificación   │
 │  vuelo.js       el mismo vuelo con pantalla (hereda de mision_sim): 3D, cámara del dron, video     │
 │  negocio.js / celular.js / flota.js   los clientes, el chat y la flota (vuela con mision_sim)      │
 │  pbdmm.js / autocompletar.js / estudio.js   el lenguaje PBDMM, su autocompletado y el IDE          │
 └───────────────┬──────────────────────────────────────────────────────────────▲─────────────────────┘
                 │ POST /api/lab (entrenar: modelo, misión, dron, premios, lr, capas…)│ GET /api/lab, /api/red,
                 │ POST /api/modelo, /api/stl, /api/partida                          │ /api/modelos, modelo_web.json
 ┌───────────────▼──────────────────────────────────────────────────────────────┴─────────────────────┐
 │ scripts/jugar.py   servidor local (127.0.0.1:8765): sirve el juego y es el "puente" con el entrenador │
 │                    · en segundo plano: lanza live_train.py (máx. 1, puertos UDP propios)              │
 │                    · en Blender: escribe models/lab_pedido.json y Blender lo toma                     │
 └───────┬──────────────────────────────────────────────────────────────────────────┬─────────────────┘
         │ lanza (fondo)                                                              │ lab_pedido.json
 ┌───────▼───────────────────────────┐   UDP (telemetría + control)   ┌─────────────▼─────────────────┐
 │ scripts/live_train.py             │ ◀────────────────────────────▶ │ blender/drone_lab.py           │
 │ PPO (stable-baselines3 + PyTorch) │  "f" posiciones, "a" la red,   │ Drone Lab: los drones, la red, │
 │ sobre drone_rl/ (Gymnasium)       │  "s" estadísticas · lr, premios│ las curvas; lanza live_train   │
 │ escribe: modelo.zip, modelo.json, │  pausa, watch, stop            │                                │
 │ modelo_web.json, entrenando.json, │                                └────────────────────────────────┘
 │ entrenando_red.json               │
 └───────────────────────────────────┘
```

## El simulador, dos veces

`drone_rl/` (Python) es donde la IA entrena; `game/sim.js` es la **copia exacta** en JavaScript donde juegas.
Física del quad, sensores (los 38 números), colisiones, pájaros, tomas de cámara: lo mismo, número por número.
`python game/make_fixture.py && node game/test_sim.mjs` genera casos en Python y los repite en JS
("Todo igual que Python."). Si cambias uno, cambias el otro.

La red se exporta a JSON (`modelo_web.json`: capas, pesos, sesgos) y el navegador la ejecuta con `Policy`
(`game/sim.js`): MLP con `tanh`, salida recortada a [-1, 1] → gas, roll, pitch, yaw.

## Las 38 entradas

Orden fijo (`drone_rl/sensing.py → build_obs`, tabla en [PROYECTO.md](PROYECTO.md)): meta, velocidad, actitud,
altura, palancas anteriores, 10 sensores de distancia, cómo se mueve la meta, el sujeto que graba (27-29), la toma
(30-33) y la física del dron (34-37). Las entradas nuevas van **al final**; un modelo con menos entradas sigue
volando (usa las primeras) y el entrenador lo amplía solo (`drone_rl/upgrade.py`, con copia en
`models/anteriores/`).

## Los modelos

| Dónde | Qué |
|---|---|
| `models/modelo.zip` (+ `.json`, `_web.json`) | la IA **base** (local, no va en git) |
| `models/publico/` | copia fija de la base que **sí** va en el repo; `jugar.py` la copia si falta la tuya |
| `models/drones/<slug>/` | la IA de cada dron o de cada programa PBDMM: `modelo.zip`, `modelo.json` (historia: `[gen, pasos, éxito, choque, nivel, calidad]`), `modelo_web.json`, `info.json` (de dónde salió, `capas`) |
| `…/entrenando.json` | el progreso en vivo (generación, éxito, choques, premios, parámetros) |
| `…/entrenando_red.json` | la red del dron que mira el entrenador, 4 veces por segundo (activaciones + conexiones fuertes) |
| `models/drones/_papelera/` | lo que borras (nunca se borra de verdad) |

`live_train.py --model <zip>` escribe todo junto a ese zip. Un modelo nuevo copia la base, otro modelo o arranca
de cero (`base_de`), y nunca toca el original. `--capas 64,64` (o `capas` en `info.json`) define una red nueva.

## La API del servidor

Documentada en el docstring de [`scripts/jugar.py`](../scripts/jugar.py). Resumen:

| | |
|---|---|
| `POST /api/lab` | `accion`: iniciar, ajustar, pausar, detener, guardar · `modelo`, `base_de`, `donde` (blender/fondo), `nivel`, `dron`, `drones`, `velocidad`, `viento`, `premios` (valores reales), `lr`, `ent`, `capas`, `watch` |
| `GET /api/lab` | el estado de Blender, del entrenador y de los del fondo |
| `GET /api/red?modelo=` | la red en vivo del dron que mira |
| `POST /api/simular` | **Simular prueba**: una prueba al azar del nivel que entrena el modelo, volada con su `modelo_web.json` (`scripts/simulacion.py`, numpy + `drone_rl`, sin PyTorch) → una grabación |
| `GET /api/avance?modelo=` | **Avance del modelo**: el mejor y el peor intento por nivel (`<carpeta>/avance.json`, lo escribe `live_train.py`) |
| `GET /api/modelos` · `POST /api/modelo` | listar · copiar, renombrar, borrar (a la papelera) |
| `POST /api/stl` · `GET /api/stl` | los STL que importa el jugador (`stl/`) |
| `POST /api/partida` | una copia de la partida del navegador en `partida.json` (para revisarla afuera) |

## Simulaciones (Avance y Simular prueba)

`scripts/simulacion.py` define una **grabación**: el nivel (`Level.to_dict()`), la toma, cuadros a 25 Hz (posición,
actitud, palancas, calidad, avance de la toma, premio acumulado), la red cada 0,2 s (entradas, capas ocultas, salida)
y el resultado. Dos productores: `simular()` (para `POST /api/simular`: la misma prueba que entrena, con la red en
numpy) y `live_train.py` (`LiveLink.grabar`: graba cada intento de cada dron y guarda el mejor y el peor por premio
total en `avance.json`). Un consumidor: `app/simulacion.js` (el visor 3D) + `app/ui_sim.js` (la pantalla).

## Premios y castigos

El entrenador usa valores reales (`DEFAULT_REWARD` en `drone_rl/env.py`, por ejemplo `crash` 10 y `tilt` 0.01). El juego
muestra todo **de 0 a 10**: `real = nivel / 10 × escala_premios[k]` (`app/data/entrenamiento.json`), con la escala
elegida para que lo recomendado por las misiones quede en ~4. Cada uno tiene un `tipo` (premio / castigo):
PBDMM separa `premios()` y `castigos()` con eso.

## PBDMM por dentro

`app/pbdmm.js`: léxico (con sangría) → árbol → intérprete de un subconjunto de Python (sin `import`/`while`, con
límite de operaciones). `compilar()` corre la parte de arriba del archivo y devuelve la configuración
(`pedidoDe()` → el `POST /api/lab`) y las funciones especiales. `app/estudio.js` lee `GET /api/lab` cada 1,5 s y,
si subió la generación, llama `cada_generacion(e)`; lo que pida (premios, lr, detener…) vuelve como `ajustar`.
La ayuda, los comandos, las lecciones, los ejemplos y las opciones del autocompletado son datos:
`app/data/pbdmm.json` (y `node app/doc_pbdmm.mjs` genera [PBDMM.md](PBDMM.md)).

## Datos del juego

Todo lo que se balancea es JSON en `app/data/`: `piezas.json` (catálogo, herramientas, estilo), `misiones.json`
(capítulos, pedidos = guion de tomas + requisitos), `entrenamiento.json` (misiones del Laboratorio, premios y su
escala), `pbdmm.json` (el lenguaje).

## Pruebas

| | |
|---|---|
| `python -m pytest -q` | física, entorno, sensores, niveles, servidor (modelos por dron, STL, red en vivo) |
| `node game/test_sim.mjs` | JS == Python |
| `node app/test_parts.mjs` | piezas → física (masa, empuje/peso, batería) |
| `node app/test_banco.mjs` | banco de armado, partida v3, modo desarrollador |
| `node app/test_pbdmm.mjs` | el lenguaje, sus errores, compilar los ejemplos, el autocompletado |
| `tests/test_simulacion.py` | la red en numpy, simular una prueba, el mejor y el peor |

GitHub Actions las corre en cada push (`.github/workflows/pruebas.yml`).
