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

---

## Instalación (macOS / Linux / Windows)

```bash
git clone https://github.com/Sagaz0501/drone-rl.git
cd drone-rl
python3 -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
pytest -q                                                # 8 pruebas deberían pasar
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

### 4. Aprender cómo funcionan las redes neuronales

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
  controller.py   piloto PD clásico (referencia)
scripts/
  train.py        entrenamiento PPO
  evaluate.py     evaluación + exportar trayectorias para Blender
blender/
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
