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
| 6 · forest | cruzar un bosque hasta un aro a 9–14 m | — | 40 % sin entrenarlo (modelo de columnas) | — |
| 7 · forest_multi | slalom de 3 aros dentro del bosque | — | _pendiente_ | — |

Estos números son de los modelos de referencia en `models/anteriores/`. Desde ahora el proyecto
entrena **un solo modelo**, `models/modelo.zip` (ver Drone Lab).

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
- [x] Bosque (niveles 6 y 7): troncos, copas, arbustos y rocas; escena 3D con pasto, flores, neblina y sol
- [x] Viento con ráfagas, premios por rapidez y estabilidad, castigo por peligro, volar de frente
- [x] Un solo modelo (`models/modelo.zip`) para todo: entrenamiento y pruebas 3D
- [ ] Bosque resuelto con el modelo único
- [x] Juego en el navegador: menú, mundos, poner aros con el mouse, la IA o tú vuelan (`game/`)
- [ ] Video de la IA volando para el portafolio

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

**2026-10-14**
- **Bosque** (nivel 6) y **bosque con 3 aros** (nivel 7). La física ahora tiene cilindros verticales
  (troncos) además de cajas y esferas, y los sensores se calculan todos a la vez (vectorizados),
  porque un bosque tiene cientos de piezas. Las copas altas dejan ~2.6 m libres abajo, y los
  obstáculos de verdad son los troncos, los árboles jóvenes y los arbustos. La escena 3D usa
  exactamente las mismas piezas, vestidas con corteza, copas con racimos de hojas, pinos en capas,
  pasto y flores (Geometry Nodes), neblina y sol de tarde. Se arma en menos de 1 segundo.
- **Opciones nuevas para entrenar:** viento con ráfagas (sirve para cualquier nivel), densidad del
  bosque, *premio por rapidez* (velocidad media de cada tramo al pasar el aro), *castigo por
  inestabilidad* (giros bruscos de roll/pitch y yaw) y *castigo por peligro* (ir rápido hacia algo
  que se ve, a menos de 1 s de chocarlo). El HUD muestra la velocidad media y el giro medio de los
  que llegan.
- **Volar de frente** (*Ir de frente*, 1.0 por defecto): el modelo de la generación ~1100 volaba de
  frente solo el 3–7 % del tiempo (~46 % de espaldas, el resto de lado) y giraba ~120°/s. Arranca
  mirando a cualquier lado y, como los sensores ven 360°, nada lo obligaba a voltearse. Ahora cuesta
  hasta 1 por segundo no llevar la nariz hacia donde va (0 de frente, la mitad de lado, todo de
  espaldas). Es solo castigo a propósito: un premio por ir de frente le haría preferir dar vueltas en
  vez de terminar la ruta. El laboratorio muestra "vuela de frente el X %"; en el juego, la nariz es
  la flecha verde con las hélices naranjas, y el HUD dice *de frente / de lado / de espaldas*.
- **Sensores en cono:** cada sensor horizontal mide 3 rayos (−15°, 0°, +15°), como un ToF real.
  Antes, un tronco delgado podía quedar escondido entre dos sensores.
- **Experimentos** (mismo punto de partida, 2–3 M pasos en el bosque):
  - Sensores en cono contra rayos finos: 40 % contra 39 %. **No cambió el éxito.**
  - Diagnóstico de los choques: el **100 %** de las veces el dron *veía* el árbol medio segundo antes,
    y chocaba a ~7 m/s. El problema no era ver, era ir demasiado rápido: con *rapidez* = 1 aprendió
    a correr. Se dejó en 0.3.
  - *Castigo por peligro* = 0.2: se volvió miedoso. Bajaron los choques, pero se quedaba flotando
    hasta que se acababa el tiempo (éxito 11 %). Queda en 0 por defecto.
- **Un solo modelo.** Antes cada entrenamiento creaba otro archivo (`live_*`, `_genN`, pruebas...).
  Ahora todo vive en `models/modelo.zip`: el laboratorio lo continúa siempre y todas las pruebas 3D
  vuelan con él. Los modelos viejos están en `models/anteriores/`.
- **Pruebas 3D que fallaban sin avisar:** Blender guardaba en memoria la versión vieja del código
  (sin el bosque), así que la prueba fallaba en silencio. Ahora se recarga y, si algo falla, lo dice
  en el panel. También se arregló que los ajustes del laboratorio se leían de la escena que estabas
  viendo (la de prueba tiene los suyos), lo que hacía que "Volver al laboratorio" no volviera.
- **De Blender a videojuego.** La prueba 3D en Blender iba a ~20 cuadros por segundo, con trabones de
  medio segundo. Pasé la física, los sensores y la red a JavaScript (`game/sim.js`, verificado contra
  Python) e hice un juego en el navegador con Three.js: menú, cuatro mundos, editor de aros con el
  mouse, vuelo de la IA o manual, y un HUD con las palancas que mueve la red. El entrenador guarda el
  modelo para el juego cada 10 generaciones.

---

## Instalación (macOS / Linux / Windows)

```bash
git clone https://github.com/Sagaz0501/drone-rl.git
cd drone-rl
python3 -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
pytest -q                                                # 18 pruebas deberían pasar
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
python scripts/train.py --stage 6 --density 1.0 --wind 2 --init models/stage3.zip  # bosque con viento
python scripts/train.py --level levels/ejemplo.json --steps 1000000 --init models/stage4.zip
```

Esto es entrenar sin Blender, por consola. Lo normal ahora es el **Drone Lab**, que usa un solo
modelo (`models/modelo.zip`). Los modelos de referencia de antes están en `models/anteriores/`.

Cada 20 k pasos imprime la tasa de éxito y de crash. Con `tensorboard` instalado:
`tensorboard --logdir runs`. Si tu máquina tiene muchos núcleos, agrega `--subproc --envs 16`.

### 2. Evaluar y exportar trayectorias

```bash
python scripts/evaluate.py --model models/modelo.zip --stage 6 --episodes 50
python scripts/evaluate.py --model models/anteriores/stage2.zip --stage 2 --episodes 50
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

**Un solo modelo.** Todo se entrena en `models/modelo.zip`. La primera vez que le das Iniciar se
crea una red nueva al azar. Después, **cada Iniciar continúa el mismo modelo**, aunque cambies de
nivel o de número de drones. Así ves su desarrollo completo: Hover → Metas → Columnas → Bosque. Los
N drones son N copias del **mismo** cerebro, y todo lo que viven entrena esa única red. Se guarda solo
cada 10 generaciones y al detener. Su historia (pasos, generaciones, curva de éxito y en qué niveles
entrenó) va en `models/modelo.json`, y la curva del HUD muestra toda su vida, con una marca cada vez
que cambiaste de nivel. **Empezar de cero** archiva el modelo en `models/anteriores/`.

Ojo: una red que se entrena solo en un nivel nuevo puede **olvidar** parte del anterior. Si después
del bosque vuelve a fallar en el circuito, es eso.

**En vivo, sin reiniciar:** learning rate, exploración (σ y entropía), velocidad (tiempo real o
máxima), los pesos de la recompensa y el ambiente (viento, densidad del bosque). **Requiere
reiniciar:** número de drones y nivel. **Probar en 3D** abre un escenario aleatorio del mismo tipo
(el bosque incluido) y el modelo vuela en vivo con la generación de ese momento.

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
levels/bodega.json ──▶ Drone Lab (nivel JSON) ──▶ models/modelo.zip
        │                                              │ scripts/export_policy.py (automático)
        ▼                                              ▼
blender/build_bodega.py ──▶ bodega.blend  ◀── Piloto IA (numpy) ◀── models/modelo.npz
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

### 6. El juego: tu modelo vuela en el navegador

```
models/modelo.zip ──(el laboratorio lo guarda cada 10 generaciones)──▶ models/modelo_web.json
                                                                              │
game/ (Three.js) ◀── scripts/jugar.py (servidor local, http://localhost:8765/game/) ◀──┘
```

En Drone Lab dale **Jugar en el navegador**, o en la terminal `python scripts/jugar.py`.

1. **Menú.** Escoge el mundo (Bosque, Columnas, Bodega o Campo libre), la densidad del bosque, el
   viento y la calidad gráfica.
2. **Diseñar la ruta.** Haz clic en el suelo para poner aros, a la altura que marques. También
   puedes mover la salida, deshacer o pedir una ruta al azar. En el bosque se quitan solos los
   árboles que tapan un aro, como en el entrenamiento.
3. **Volar con la IA.** Tu modelo vuela en vivo y aterriza bajo el último aro. Abajo a la izquierda
   ves *las manos de la IA*: las dos palancas de un control de radio, moviéndose como las mueve la
   red. Abajo a la derecha ves sus 10 sensores. Con **N** ves el cerebro (24 entradas, 128 + 128
   neuronas, 4 palancas).
4. **Pilotear yo.** El mismo dron y la misma física.
   - **Ratón:** gira a los lados, las vueltas que quieras. Haz clic para atraparlo y Esc lo suelta.
   - **Espacio:** sube mientras lo mantienes; al soltar se queda a esa altura. **Shift** baja.
   - **WASD:** moverse.
   - También sirve un control de videojuego, en modo 2 o modo 1.

   Sin aros es **vuelo libre**. En **Controles** (tecla H) están las ayudas *mantener altura* y
   *frenar solo* (al soltar WASD se queda quieto, como un dron con GPS), además de sensibilidad,
   sensibilidad del ratón, suavizado, y la inclinación y el campo de visión de la cámara FPV. Cada
   ruta guarda tu mejor tiempo y el de la IA.

Cámaras (teclas 1 a 6, o C para pasar a la siguiente): **persecución**; **FPV** (la cámara del dron,
inclinada hacia arriba como en los drones de carreras, con horizonte artificial); **piloto** (parado
en la salida, con zoom que lo sigue); **cine** (gira alrededor del dron); **arriba**; y **libre**.
Además: **R** otra vez, **E** editar la ruta, **+/−** velocidad, **P** pausa, **Esc** menú.

Cada vez que le das Volar, el juego vuelve a leer el modelo. Si estás entrenando, vuela con la última
generación guardada.

**¿Por qué no en Blender?** Blender dibuja cada cuadro como una película (neblina volumétrica,
sombras suaves, cientos de miles de triángulos) y en la prueba 3D daba ~20 cuadros por segundo con
trabones. El juego usa *instancing*: miles de árboles y matas de pasto en pocas llamadas a la tarjeta
de video.

**Es el mismo simulador.** `game/sim.js` es la física, los sensores y la red pasados a JavaScript.
`game/test_sim.mjs` lo compara con Python: sensores y física iguales hasta 1e-13, y un vuelo completo
de 15 s con aterrizaje igual a menos de 0.001 mm.

```bash
python game/make_fixture.py && node game/test_sim.mjs
```

### 7. Aprender cómo funcionan las redes neuronales

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
