# drone-rl — guía para Claude Code

Claude Code lee este archivo solo al abrir una sesión en esta carpeta. Es el resumen operativo.
La explicación completa (la idea, el modelo, Blender, el juego y todos sus mecanismos) está en
**[`docs/PROYECTO.md`](docs/PROYECTO.md)**. Léelo antes de cambiar algo grande.

## Con quién trabajas

- **Santiago** (embedded / QA). Este es un proyecto de aprendizaje y de portafolio.
- Háblale **en español, casual y directo**. Respuestas cortas.
- Cuando algo falla, quiere un **diagnóstico preciso con números** (medir, no adivinar).
- **No entrenes nada por tu cuenta.** Él entrena en el Drone Lab de Blender y quiere ver el
  desarrollo. Puedes *evaluar* el modelo (correr episodios y medir) y hacer pruebas de código,
  pero no lanzar entrenamientos ni sobrescribir `models/modelo.zip`.
- Le gusta entender el porqué: explica qué cambiaste y qué tiene que hacer él (por ejemplo,
  "Detener → Iniciar para que el entrenador tome el código nuevo").
- GitHub: el repo es local (rama `main`, sin `remote`). El push a `Sagaz0501/drone-rl` quedó
  pendiente; no hagas push sin que lo pida.

## La idea en 6 líneas

Una red neuronal aprende **desde cero** a volar un quadcopter simulado con aprendizaje por refuerzo
(PPO). Ve lo que vería un dron real (dónde está la meta, su velocidad, su inclinación y 10 sensores de
distancia tipo ToF) y mueve las 4 palancas de un control de radio. Se entrena por niveles: hover →
metas → columnas → bosque → caza de pájaros que huyen. **Blender** es el laboratorio: 30–80 drones
aprendiendo en vivo con la red visible. El **juego web** (Three.js) es donde se ve volar el modelo con
fluidez, se diseñan rutas y se puede pilotear a mano. Meta futura: llevarlo a su dron ESP32.

## Mapa

```
drone_rl/          el simulador (numpy). Lo usan el entrenamiento Y Blender
  physics.py       física del quad (modo angle) + viento con ráfagas
  level.py         niveles: cajas, esferas, cilindros; colisiones, raycast, bosque, columnas
  sensing.py       las 27 entradas de la red + 10 sensores en cono
  env.py           entorno Gymnasium: niveles 0-10, recompensa, DEFAULT_REWARD
  birds.py         caza: pájaros que pasean, huyen y esquivan obstáculos
  runtime.py       vuelo solo-numpy (Blender): NumpyPolicy + Flight
  upgrade.py       cargar un modelo de 24 entradas ampliándolo a 27 sin cambiarlo
  controller.py    piloto PD clásico (referencia, aterrizaje)
  missions.json    texto de cada nivel (lo muestran Blender y el entrenador)
scripts/
  live_train.py    EL entrenador del Drone Lab (PPO + UDP con Blender)
  jugar.py         servidor del juego en http://localhost:8765/game/
  export_policy.py zip de SB3 -> .npz (Blender) y -> JSON (juego)
  evaluate.py      medir un modelo por consola (--pd para el piloto clásico)
  train.py         entrenar por consola (viejo; lo normal es el Drone Lab)
blender/
  drone_lab.py     panel Drone Lab (N > Drone Lab): entrenar en vivo, HUD, red neuronal
  prueba_aleatoria.py, bosque.py, escena_lib.py   escena "Prueba IA" (bosque 3D)
  piloto_ia.py     panel Piloto IA (la red vuela en bodega.blend / prueba)
  laboratorio.blend  la escena del laboratorio con el frame del dron (no está en git)
game/              el juego (sin build: módulos ES + three.js en game/vendor/)
  sim.js           física, sensores, red, pájaros: COPIA EXACTA de drone_rl en JS
  worlds.js        mundos (bosque, columnas, bodega, campo)
  scene.js         todo lo 3D (dron, árboles, aros, pájaros, rayos)
  pilot.js         pilotear a mano (ratón, Espacio/Shift, WASD, control)
  main.js          menú, editor, vuelo, cámaras, HUD
  test_sim.mjs     compara sim.js con Python (make_fixture.py genera los casos)
models/            modelo.zip (EL modelo), modelo.json (su historia), modelo_web.json (juego)
tests/             pytest
docs/              PROYECTO.md (todo explicado), redes-neuronales.md (la teoría)
```

## Comandos

```bash
source .venv/bin/activate              # Python 3.13, SB3 2.9, torch, gymnasium 1.4
python -m pytest -q                    # 23 pruebas
python game/make_fixture.py && node game/test_sim.mjs    # JS == Python ("Todo igual que Python.")
python scripts/jugar.py                # abre el juego (exporta modelo_web.json si el zip es más nuevo)
python scripts/evaluate.py --model models/modelo.zip --stage 9 --episodes 50
```

Blender 5.2 (`/Applications/Blender.app`). El panel se carga abriendo `blender/drone_lab.py` en el
Text Editor y dándole **Run Script** (Alt+P). Después: viewport → tecla **N** → pestaña **Drone Lab**.

## Reglas que no se pueden romper

1. **Python y JavaScript hacen las mismas cuentas.** Si cambias `physics.py`, `sensing.py`,
   `level.py` (colisiones/raycast), `birds.py` o la parte de `runtime.py` que vuela, cambia lo mismo
   en `game/sim.js` y corre `make_fixture.py` + `test_sim.mjs`. Todo debe salir `ok`.
2. **Las 27 entradas tienen un orden fijo** (ver `sensing.build_obs` y la tabla en
   `docs/PROYECTO.md`). Las entradas nuevas van **al final** y valen 0 cuando no aplican. Así un
   modelo viejo sigue funcionando: `NumpyPolicy` y `Policy` (JS) cortan las que sobran, y
   `upgrade.load_ppo` amplía la primera capa con pesos en 0.
3. **Un solo modelo:** `models/modelo.zip`. El laboratorio siempre lo continúa. No crees otros
   archivos de modelo; las pruebas y el juego usan ese.
4. **Blender corre `drone_rl/` directamente.** Un cambio ahí afecta al entrenador, a Piloto IA y a
   la prueba 3D. El entrenador es un proceso aparte: no ve código nuevo hasta Detener → Iniciar.
   Dentro de Blender, "Probar" recarga los módulos del proyecto (`_reload_project_modules`). Si
   cambias `drone_lab.py`, hay que volver a correrlo (Run Script) para que el panel cambie.
5. **Agregar un nivel** = `env.py` (`STAGES`, `_make_level`, reset), `missions.json` (y la prueba
   que cuenta las misiones), `drone_lab.py` (`STAGE_ITEMS`, `STAGE_NAMES`, `cell_size`), `NIVELES`
   en `game/main.js` y una prueba en `tests/`.
6. La recompensa vive en `DEFAULT_REWARD` (env.py) y en los sliders `rw_*` del panel
   (`REWARD_KEYS`). El dict se comparte entre todos los drones y se cambia en vivo por UDP.

## Estado (2026-10-14, noche)

- Modelo: generación **1980**, 25.4 M pasos, red 27 → 128 → 128 → 4.
- Historia: hover (gen 1-39) → metas (40-238, 100 %) → varias metas con columnas (239-617, 54 %)
  → caza en campo abierto (618-678, **100 %** con pájaros a 2.7 m/s) → caza entre columnas
  (679-1980, **64 % éxito / 36 % choques**, entrenando).
- Vuela de frente ~75-80 % del tiempo (antes 3 %: ver "Ir de frente" en docs/PROYECTO.md).
- Siguiente: caza en el bosque (nivel 10), bajar los choques en la caza con obstáculos, video para
  el portafolio, push a GitHub, y algún día pasar el modelo al dron ESP32 (sensores ToF, sin cámara).

## Problemas conocidos

- **El juego se ve vacío / los botones no hacen nada:** Chrome con la aceleración por hardware
  apagada (WebGL falla). `chrome://settings/system` → activar → reiniciar Chrome. Safari funciona.
- **Los drones del lab no se mueven:** el entrenador se cerró; mira `live_train.log` (el panel
  muestra las últimas líneas del error).
- **"No entrenes por tu cuenta" incluye pruebas largas:** para revisar un cambio en el entrenador,
  basta con unos cientos de pasos sobre una **copia** temporal de un modelo viejo
  (`models/anteriores/stage2.zip`), nunca sobre `models/modelo.zip`.
