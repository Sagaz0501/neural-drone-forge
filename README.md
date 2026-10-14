# drone-rl

Una IA que aprende a volar un quadcopter desde cero con aprendizaje por refuerzo (PPO).
Los niveles se diseñan y los vuelos se ven en **Blender**, usando el frame de 5" modelado para el proyecto.

> Proyecto de aprendizaje de **Santiago Bernal**: física de drones, redes neuronales y RL,
> conectado con Blender.

```
 Blender (diseñar nivel) ──export_level.py──▶ levels/*.json
                                                  │
                                                  ▼
 drone_rl/ (física + entorno Gymnasium) ◀── scripts/train.py (PPO, 8 drones en paralelo)
                                                  │
                                                  ▼
 Blender (ver el vuelo) ◀──import_trajectory.py── scripts/evaluate.py ──▶ trajectories/*.json
```

---

## Estado actual

| Nivel | Tarea | Piloto PD (clásico) | IA (PPO) | Pasos de entrenamiento |
|---|---|---|---|---|
| 0 · hover | despegar y quedarse 1 s a 1.5 m | 100 % | **100 %** | 400 k |
| 1 · goal_fixed | ir a (5, 0, 2) | 100 % | **100 %** | 0 (lo resolvió el modelo de hover) |
| 2 · goal_random | meta aleatoria a 3–8 m, orientación aleatoria | 100 % | **100 %** (llega ~25 % más rápido) | 800 k |
| 3 · obstacles | meta aleatoria con columnas en el camino | 50 % | 42 % sin entrenar este nivel · _siguiente paso_ | — |
| 4 · multi_goal | 3 metas seguidas con columnas | 28 % | _pendiente_ | — |
| 5 · circuit | circuito de 4 aros, **2 vueltas** (8 pasadas en orden) | 100 % | **100 %** con el modelo del nivel 2, sin entrenarlo | 0 |
| `levels/ejemplo.json` | 3 metas + 4 obstáculos (hecho para Blender) | 0 % | _pendiente_ | — |

El **piloto PD** es un controlador clásico, sin IA, que vuela en línea recta a la meta
(`drone_rl/controller.py`). Es la vara que hay que superar: en los niveles con obstáculos choca
porque no sabe esquivar, y ahí es donde la IA tiene que ganarle.

## Roadmap

- [x] Frame de 5" paramétrico en Blender
- [x] Simulador manual en Blender (teclado, física a 60 Hz, HUD) — `blender/drone_sim.py`
- [x] Física en numpy idéntica a la de Blender — `drone_rl/physics.py`
- [x] Entorno Gymnasium con currículum, obstáculos, sensores de distancia y recompensa — `drone_rl/env.py`
- [x] Piloto PD de referencia y pruebas automáticas (`pytest`)
- [x] Entrenamiento PPO + evaluación + exportar trayectorias
- [x] Blender ⇄ JSON: diseñar niveles y reproducir vuelos
- [x] Guía de redes neuronales + red hecha desde cero en numpy — `docs/`, `learn/`
- [x] Nivel 0 (hover) y nivel 1 resueltos
- [x] Nivel 2: metas aleatorias
- [ ] Niveles 3–4: esquivar obstáculos (superar al piloto PD)
- [ ] Volar `levels/ejemplo.json` y un nivel propio hecho en Blender
- [ ] Modo **acro**: control de velocidad angular, torque por motor y un PID dentro del simulador
- [ ] Medidas reales del frame (masa, motores, hélices) en `QuadParams`
- [x] Drone Lab: entrenamiento en vivo con N drones y parámetros ajustables desde Blender
- [x] Misiones explícitas, aros por estado y red neuronal en vivo en Blender
- [x] Nivel 5: circuito de 2 vueltas
- [x] Bodega 3D: la IA entrenada vuela en vivo dentro de Blender (Piloto IA)
- [ ] Video de la IA volando en Blender para el portafolio

## Bitácora

**2026-10-13**
- Modelé un frame de 5" paramétrico en Blender y le agregué un simulador manual (W/A/S/D, gas, HUD).
- Pasé la física a numpy y armé el entorno Gymnasium. El piloto PD resuelve los niveles 0–2 al 100 %,
  lo que prueba que el entorno se puede resolver.
- **Primer intento de PPO en hover: falló de una forma instructiva.** La IA bajó los crashes de 100 % a
  0 %, pero lo logró *quedándose en el suelo*. La causa: una red recién creada saca acciones cerca de 0,
  que en el mapeo original de gas equivalían a 50 %, y eso la mandaba hacia arriba hasta salirse del área.
  Así aprendió que volar era peligroso y quedarse quieta era seguro (un óptimo local).
- **Arreglo:** (1) gas centrado, para que la acción 0 sea gas de hover; (2) exploración inicial más suave
  (`log_std_init=-0.7`); (3) en hover, un premio continuo por estar cerca de la meta.
  Resultado: 100 % de éxito a los 300 k pasos (unos 5 minutos en 2 núcleos de CPU).
- **Transferencia gratis:** el modelo de hover resolvió el nivel 1 sin entrenamiento adicional. La
  observación usa la posición de la meta *relativa al dron*, así que aprendió "ir hacia la meta" en
  general, no "subir 1.5 m".
- **Nivel 2 resuelto** (800 k pasos, unos 6 minutos), arrancando desde el modelo de hover: 100 % de
  éxito en 50 episodios que nunca vio. Empata al piloto PD en éxito pero llega más rápido
  (1.5 s contra 2.0 s en la misma meta).
- Probé ese modelo en el nivel 3 sin entrenarlo para obstáculos: 42 % de éxito y todos los
  crashes son contra columnas. Es lo esperado, porque nunca vio una. **Siguiente paso: entrenar el nivel 3.**
- **Drone Lab** (entrenamiento en vivo en Blender), red neuronal visible, misiones explícitas y nivel 5
  (circuito de 2 vueltas). Probé repetir el nivel fallado hasta pasarlo, pero lo quité porque no era
  lo que buscábamos.
- **Nivel 3 (columnas al azar)**: 900 k pasos más de entrenamiento y se quedó en ~40 % de éxito.
  Esquivar obstáculos al azar le cuesta mucho a este diseño.
- **Bodega.** Diseñé un nivel fijo con una ruta de 15 puntos (`scripts/make_warehouse.py`) y entrené
  en él, haciendo que cada intento empiece en un tramo al azar de la ruta. El primer modelo dominó
  **12 de 15 tramos** (incluido pasar por debajo del letrero), pero chocaba el **100 %** de las veces
  en los 3 tramos con algo en la línea recta: montacargas, columna y torre de pallets.
  **Diagnóstico:** el ruido de exploración había bajado a σ ≈ 0.1, así que la red casi nunca probaba
  desviarse. **Arreglo:** subir σ a 0.4, hacer que los tramos bloqueados salgan 6 veces más seguido
  y un castigo por cercanía que se siente *antes* del choque.

---

## Instalación (macOS / Linux / Windows)

```bash
git clone https://github.com/Sagaz0501/drone-rl.git
cd drone-rl
python3 -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
pytest -q                                                # 12 pruebas deberían pasar
```

En Mac con Apple Silicon, PyTorch se instala solo desde pip. Para estas redes chicas la CPU es
más rápida que la GPU, así que no hace falta configurar nada.

## Uso

### 1. Entrenar (currículum)

```bash
python scripts/train.py --stage 0 --steps 400000                                  # hover
python scripts/train.py --stage 2 --steps 800000  --init models/stage0.zip        # metas aleatorias
python scripts/train.py --stage 3 --steps 2000000 --init models/stage2.zip        # obstáculos
python scripts/train.py --stage 4 --steps 2000000 --init models/stage3.zip        # varias metas
python scripts/train.py --level levels/ejemplo.json --steps 1000000 --init models/stage4.zip
```

Cada 20 k pasos imprime la tasa de éxito y de crash. Con `tensorboard` instalado:
`tensorboard --logdir runs`. Si tu máquina tiene muchos núcleos, agrega `--subproc --envs 16`.

### 2. Evaluar y exportar trayectorias

```bash
python scripts/evaluate.py --model models/stage2.zip --stage 2 --episodes 50
python scripts/evaluate.py --pd --stage 3                     # comparar con el piloto clásico
```

Las trayectorias quedan en `trajectories/*.json`.

### 3. Blender

Abre cada script en el **Text Editor** de Blender y córrelo con **Alt+P**.

| Script | Qué hace |
|---|---|
| `blender/drone_sim.py` | Simulador manual. Después: menú **View › Drone Fly**. Controles: W/S pitch, A/D roll, Q/E yaw, Espacio/↑ más gas, Shift/↓ menos gas, H hover, R reset, F cámara, ESC salir. Crea `Drone_Root`, el padre del frame. |
| `blender/export_level.py` | La primera vez crea un nivel de ejemplo (colecciones `Obstacles` y `Goals`). Edítalo y vuelve a correrlo para exportar a `levels/mi_nivel.json`. |
| `blender/import_trajectory.py` | Pon la ruta en `TRAJ_PATH`. Anima `Drone_Root` con el vuelo de la IA y reconstruye el nivel. Dale Play. |

Las unidades se convierten solas: la escena está en mm y el entrenamiento usa metros.

### 4. Drone Lab: ver a 50 drones aprender en vivo

```
 scripts/live_train.py  ──UDP :9001 (posiciones, estadísticas)──▶  blender/drone_lab.py
 (PPO + N drones)       ◀──UDP :9002 (parámetros en vivo)───────   (panel + HUD + curva)
```

1. En Blender abre `blender/drone_lab.py` en el Text Editor y presiona **Alt+P**.
2. En el viewport, tecla **N** › pestaña **Drone Lab**. Revisa que `Proyecto` y `Python` apunten
   a esta carpeta y a `.venv/bin/python`.
3. Elige drones, nivel y vista (cuadrícula o enjambre) y dale **Iniciar entrenamiento**.

Cada **generación** es un ciclo de PPO. Primero los drones **vuelan** y juntan experiencia, y
luego se quedan quietos mientras PPO **aprende** (actualiza la red). El HUD muestra la fase, el
éxito y el porcentaje de crashes, y una curva por generación. Un destello **rojo** es un crash,
**verde** es meta alcanzada y **ámbar** es que se acabó el tiempo.

**En vivo, sin reiniciar:** learning rate, exploración (entropía), velocidad (tiempo real o
máxima) y los 7 pesos de la recompensa. **Requiere reiniciar:** número de drones, nivel y
neuronas por capa. "Detener y guardar" guarda el modelo en `models/live_*.zip`, y lo puedes usar
en "Continuar desde" para seguir otro día.

**Misiones:** el panel muestra para cada nivel qué cuenta como éxito y como fallo, y qué paga la
recompensa (el texto vive en `drone_rl/missions.json`). Los aros cambian de color según el orden:
**verde** el que toca, **celeste** el siguiente, **gris** los que faltan. En hover el aro se pone
**amarillo** mientras el dron aguanta su segundo. En el **Circuito (2 vueltas)**, el aro de la segunda
vuelta es un poco más grande.

**Red neuronal en vivo:** con "Mostrar red neuronal" se dibuja la red del dron con luz celeste (eliges
cuál con "Dron observado"). Se ven las 24 entradas con su valor, las 2 capas de 128 neuronas, las
4 palancas y las 1 312 conexiones más fuertes, iluminadas según cuánto influyen en ese instante.
La explicación completa está en [`docs/redes-neuronales.md`](docs/redes-neuronales.md#10-las-neuronas-de-este-dron-y-cómo-verlas-en-blender).

Experimentos para probar:
- Castigo por chocar en 0: ¿qué aprende?
- Learning rate muy alto (log10 = -2): mira cómo la curva se vuelve inestable.
- Hover con 10 drones contra 100: ¿cuál aprende antes en tiempo real?
- Quitar el "premio cerca": vuelve el óptimo local de quedarse en el suelo (ver bitácora).

### 5. Bodega: la IA entrenada vuela en una escena 3D

`blender/bodega.blend` es una escena aparte: una bodega de 36 × 22 m con estanterías, montacargas,
columnas, un letrero colgante y una estación de carga. Hay una ruta de 15 puntos, y **cada vez que le
das "Volar con la IA", la red entrenada vuela el dron en vivo**: lee sus 10 sensores, decide las 4
palancas y la física del proyecto lo mueve, 50 veces por segundo. No es una grabación.

```
levels/bodega.json ──▶ entrenamiento (scripts/train.py --level ...) ──▶ models/bodega.zip
        │                                                                    │ scripts/export_policy.py
        ▼                                                                    ▼
blender/build_bodega.py ──▶ bodega.blend  ◀── Piloto IA (numpy) ◀── models/policy_bodega.npz
```

- Abre `blender/bodega.blend` (si Blender pide permiso para ejecutar scripts, dale **Allow**).
- Tecla **N** › pestaña **Piloto IA** › **Volar con la IA**.
- Cada vuelo sale de un punto un poco distinto ("Variación de salida"), así que la IA tiene que
  reaccionar cada vez.
- Puedes **mover el montacargas, las cajas o los puntos de la ruta** y volver a volar. El piloto lee
  la escena en cada vuelo (cada objeto lleva su colisión como hija).
- **Grabar vuelo** guarda un vuelo como keyframes para renderizar un video, con cámaras de
  persecución, FPV y general.
- Los sensores se dibujan en vivo: verde = libre, de amarillo a rojo = algo cerca.

Para que esto funcione, Blender corre la **misma** física (`physics.py`) y los **mismos** sensores
(`sensing.py`) que el entrenamiento, y la red exportada a numpy (`runtime.py`). Una prueba
automática verifica que un vuelo en numpy sea idéntico al del entorno de entrenamiento (diferencia
de menos de 0.001 mm).

Para regenerar la escena:
`/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python blender/build_bodega.py -- --preview`

### 6. Aprender cómo funcionan las redes neuronales

Lee [`docs/redes-neuronales.md`](docs/redes-neuronales.md) y corre
`python learn/red_neuronal_desde_cero.py`. Es una red hecha solo con numpy, con backpropagation
escrito a mano. Aprende XOR, aprende una forma 2D (la ves aprender en la terminal) y al final aprende
a volar este mismo dron imitando al piloto PD.

---

## Cómo funciona

### Física (`drone_rl/physics.py`)

Es un modelo en **modo angle** (auto-nivelado), como el modo para principiantes de Betaflight:

- El empuje (gas × relación empuje/peso × peso) apunta en el eje Z del dron. Al inclinarlo, parte del
  empuje se va hacia los lados y por eso el dron se mueve.
- Fuerzas: empuje + gravedad + arrastre cuadrático (−c·|v|·v), integradas con Euler semi-implícito a 100 Hz.
- El ángulo real sigue al ángulo pedido con un filtro de primer orden. Eso imita el lazo de
  estabilización del flight controller.
- Choque: tocar el suelo a más de 4 m/s, tocar un obstáculo o salir del área.

| Parámetro | Valor | Nota |
|---|---|---|
| masa | 0.6 kg | inventado; falta medir el dron real |
| empuje/peso | 2.5 | hover ≈ 40 % de gas |
| inclinación máx. | 35° | |
| yaw | 180 °/s | |
| radio de colisión | 0.15 m | |

### Lo que ve la IA (observación, 24 números)

| # | Qué | Por qué |
|---|---|---|
| 3 | vector a la meta, en el marco del dron | saber hacia dónde ir |
| 1 | distancia a la meta | |
| 3 | velocidad, en el marco del dron | para poder frenar |
| 2 | roll, pitch | estado de inclinación |
| 1 | altura | no estrellarse contra el piso |
| 4 | acción anterior | suavidad |
| 10 | sensores de distancia: 8 horizontales cada 45°, 1 arriba, 1 abajo (alcance 5 m) | ver obstáculos, como un ToF o LiDAR de un punto |

Las posiciones y velocidades van rotadas al marco del dron. Así la IA no depende de hacia dónde
apunta: "la meta está adelante a la izquierda" significa lo mismo mirando al norte o al sur.

### Lo que controla (acción, 4 números en [-1, 1])

gas (0 = hover), roll, pitch, yaw. Las mismas 4 palancas que un control de radio.

### Recompensa

+2 por metro que se acerca a la meta · +10 al llegar · −10 al chocar · −0.01 por paso ·
castigos pequeños por movimientos bruscos y por inclinarse mucho. Los detalles y el porqué están en
[`docs/redes-neuronales.md`](docs/redes-neuronales.md#9-aprendizaje-por-refuerzo-y-ppo).

### PPO

Usa [Stable-Baselines3](https://stable-baselines3.readthedocs.io/). Son dos redes de 24 → 128 → 128:
el **actor** saca 4 acciones y el **crítico** saca 1 valor. Simula 8 drones en paralelo, lotes de 8192
pasos y 10 épocas por lote. El simulador corre a unos 4 000 pasos por segundo por núcleo.

## Estructura

```
drone_rl/
  physics.py      física del quad (numpy)
  level.py        niveles JSON, colisiones, raycasts, generador de columnas
  env.py          entorno Gymnasium + currículum + recompensa
  missions.json   texto de cada misión (lo leen el entorno y Blender)
  controller.py   piloto PD clásico (referencia)
  sensing.py      sensores y las 24 entradas (compartido por el entorno y Blender)
  runtime.py      vuelo con solo numpy: la IA dentro de Blender
scripts/
  live_train.py   entrenamiento en vivo para Drone Lab (UDP)
  train.py        entrenamiento PPO
  evaluate.py     evaluación + exportar trayectorias para Blender
  export_policy.py  red de PPO -> .npz (numpy), verificada contra PyTorch
  make_warehouse.py diseña la bodega -> levels/bodega.json
blender/
  drone_lab.py         Drone Lab: panel, N drones en vivo, HUD
  build_bodega.py      construye bodega.blend (escena, dron, cámaras, luces)
  piloto_ia.py         panel "Piloto IA": la red vuela en vivo dentro de la escena
  drone_sim.py         vuelo manual en el viewport
  export_level.py      Blender -> levels/*.json
  import_trajectory.py trajectories/*.json -> animación
learn/
  red_neuronal_desde_cero.py
docs/
  redes-neuronales.md
levels/
  ejemplo.json
tests/
  test_physics_env.py
```

## Licencia

MIT
