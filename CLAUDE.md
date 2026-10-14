# Dron Maker — guía para Claude Code

Claude Code lee este archivo solo al abrir una sesión en esta carpeta. Es el resumen operativo.

| Para… | Lee |
|---|---|
| **qué juego vamos a hacer** (la idea, el ciclo, las etapas, los hitos) | [`docs/PLAN_JUEGO.md`](docs/PLAN_JUEGO.md) |
| **cómo funciona la base que ya existe** (modelo, Blender, juego web) | [`docs/PROYECTO.md`](docs/PROYECTO.md) |
| la historia día a día del proyecto base (bitácora, experimentos) | [`docs/README_drone-rl.md`](docs/README_drone-rl.md) |

## La idea

Un **juego 3D en el navegador** de construir y volar drones. Empiezas en un garaje con piezas
rústicas (chasis de madera, motores baratos, cámara de juguete), ganas plata vendiendo drones y
grabando videos con ellos, compras mejor equipo y, en un punto del juego, **entrenas una IA** para
tener varios drones autónomos grabando desde distintos ángulos. A futuro, **entregas de paquetes**.

La base ya existe: este proyecto viene de `drone-rl` (un simulador de dron con una IA que aprendió a
volar sola con aprendizaje por refuerzo, un laboratorio en Blender y un juego web con Three.js). El
juego nuevo se construye **encima** de eso, en el navegador.

**Primer paso: el hito M1 · Taller** (ver `docs/PLAN_JUEGO.md`, sección 6): armar un dron con piezas,
verlo en 3D, ver sus estadísticas y volarlo con física y batería según sus piezas.

## Con quién trabajas

- **Santiago** (ingeniero embedded / QA). Proyecto propio, de aprendizaje y de portafolio.
- Háblale **en español, casual y directo**. Respuestas cortas. El juego también va en español.
- Cuando algo falla, quiere un **diagnóstico preciso con números** (medir, no adivinar).
- Le gusta entender el porqué: explica qué cambiaste y qué tiene que hacer él.
- Para decisiones de diseño grandes (estilo visual, economía, mapa), propón 2-3 opciones con tu
  recomendación y pregunta. Las preguntas abiertas están al final del plan.
- **No entrenes la IA por tu cuenta.** Él entrena en el Drone Lab de Blender y quiere ver el
  desarrollo. Puedes *evaluar* el modelo (correr episodios y medir) y hacer pruebas de código, pero
  no lanzar entrenamientos ni sobrescribir `models/modelo.zip`.
- Git: repo local (rama `main`, sin `remote`). No hagas push sin que lo pida.

## Mapa

```
docs/              PLAN_JUEGO.md (el juego nuevo), PROYECTO.md (la base), README_drone-rl.md (historia)
app/               (por crear, M1) el juego nuevo: taller, misiones, tienda... usa los módulos de game/
game/              la base del juego web (sin build: módulos ES + three.js en game/vendor/)
  sim.js           física, sensores, red neuronal, pájaros: COPIA EXACTA de drone_rl/ en JS
  worlds.js        mundos (bosque, columnas, bodega, campo)
  scene.js         todo lo 3D (dron, árboles, aros, pájaros, rayos)
  pilot.js         pilotear a mano (ratón, Espacio/Shift, WASD, control de videojuego)
  main.js          menú, editor de rutas, vuelo, cámaras, HUD (el "simulador/arena" actual)
  test_sim.mjs     compara sim.js con Python (make_fixture.py genera los casos)
drone_rl/          el simulador en Python (lo usan el entrenamiento y Blender)
  physics.py       física del quad (QuadParams: masa, empuje/peso, arrastre…) + viento
  level.py, sensing.py, env.py, birds.py, runtime.py, upgrade.py, controller.py, missions.json
scripts/
  jugar.py         servidor local: http://localhost:8765/game/ (y /app/ cuando exista)
  live_train.py    el entrenador del Drone Lab (PPO + UDP con Blender)
  export_policy.py, evaluate.py, train.py
blender/           drone_lab.py (laboratorio de IA), laboratorio.blend, bodega.blend, escenas 3D
models/            modelo.zip (la IA), modelo.json (su historia), modelo_web.json (pesos para el navegador)
tests/             pytest
```

## Comandos

```bash
source .venv/bin/activate              # Python 3.13 (se crea con: python3 -m venv .venv && pip install -r requirements.txt)
python scripts/jugar.py                # servidor + abre el juego en el navegador
python -m pytest -q                    # 23 pruebas del simulador en Python
python game/make_fixture.py && node game/test_sim.mjs    # JS == Python ("Todo igual que Python.")
```

Node v22 está en `/opt/homebrew/bin/node`. Blender 5.2 en `/Applications/Blender.app`.

## Reglas que no se pueden romper

1. **Python y JavaScript hacen las mismas cuentas.** Si cambias la física, los sensores, las
   colisiones o los pájaros en `drone_rl/`, cambia lo mismo en `game/sim.js` (y al revés) y corre
   `make_fixture.py` + `test_sim.mjs`. Todo debe salir `ok`. Lo que es **solo del juego** (batería,
   daños, plata, misiones) puede vivir solo en JS, pero no debe cambiar la física que ve la IA.
2. **No rompas `game/`.** El juego nuevo va en `app/` y *importa* de `game/`. Si hay que cambiar algo
   de `game/` (por ejemplo, física por dron en vez del `P` global), que el comportamiento por defecto
   quede igual y las pruebas sigan pasando.
3. **Las 27 entradas de la red tienen un orden fijo** (`drone_rl/sensing.py` → `build_obs`, tabla en
   `docs/PROYECTO.md`). Entradas nuevas van **al final**. Un modelo con menos entradas sigue
   funcionando (la red usa las primeras).
4. **Un solo modelo de IA:** `models/modelo.zip`. Ojo: se entrenó con **un solo dron** (0.6 kg,
   empuje/peso 2.5). Para que vuele drones armados por el jugador hace falta entrenarlo con física al
   azar (ver plan, sección 4.4).
5. **Datos del juego en JSON** (`app/data/`): piezas, misiones, clientes. Balancear = editar números.

## Estado

- **Base (M0) lista:** simulador, IA entrenada, juego web con 4 mundos, editor de rutas, pilotear a
  mano (ratón + teclado + control), 6 cámaras (incluida FPV), HUD con las palancas y los sensores,
  modo caza (pájaros que huyen), récords.
- **Modelo copiado aquí:** generación 2120 (copia del 14-10-2026). El entrenamiento de Santiago
  sigue corriendo en `~/Documents/drone-rl`; para entrenar desde esta carpeta, en el panel Drone Lab
  cambia *Proyecto* y *Python* a esta carpeta y su `.venv`.
- **Juego nuevo:** solo el plan. Siguiente: **M1 · Taller**.

## Problemas conocidos

- **El juego se ve vacío / los botones no hacen nada:** Chrome con la aceleración por hardware
  apagada (WebGL falla). `chrome://settings/system` → activar → reiniciar Chrome. Safari funciona.
- `scripts/jugar.py` exporta `modelo_web.json` desde el zip si hace falta: necesita el `.venv` con
  PyTorch. Sin eso, el juego usa el `modelo_web.json` que haya.
