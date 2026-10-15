# drone-rl: cómo funciona todo

Guía completa de la **base** de Dron Maker (el proyecto `drone-rl`, tal como estaba el 14 de octubre
de 2026): la idea, el modelo, el laboratorio en Blender, la página/juego web y todos sus mecanismos.
El juego nuevo que se construye encima está en [`PLAN_JUEGO.md`](PLAN_JUEGO.md). Para el resumen
operativo (reglas, comandos) ver [`CLAUDE.md`](../CLAUDE.md). La historia día a día está en la
*Bitácora* de [`README_drone-rl.md`](README_drone-rl.md).

---

## 1. La idea

Una red neuronal aprende **sola** a volar un quadcopter. Nadie le programa cómo volar: solo recibe
premios y castigos (llegar a la meta suma, chocar resta), y con **aprendizaje por refuerzo (PPO)**
va ajustando sus pesos hasta que vuela bien.

```
           ┌────────────── Blender: Drone Lab ───────────────┐
           │  30-80 drones (copias del MISMO cerebro)        │
           │  HUD, curva de aprendizaje, red neuronal en vivo│
           └──────▲───────────────────────────────┬──────────┘
      UDP :9001   │ posiciones, estadísticas      │ UDP :9002 parámetros en vivo
                  │                               ▼
           scripts/live_train.py  (PPO de stable-baselines3 + drone_rl/)
                  │  guarda cada 10 generaciones
                  ▼
      models/modelo.zip ──▶ modelo_web.json ──▶ game/ (Three.js, en el navegador)
                       └──▶ modelo.npz ──────▶ Blender: Prueba IA / Piloto IA (numpy)
```

- **El simulador** (`drone_rl/`) es física simple pero honesta: empuje, gravedad, arrastre, viento,
  y un dron que se inclina para moverse.
- **Lo que ve el dron** es lo que tendría un dron real sin cámara: dónde está la meta, su velocidad,
  su inclinación, su altura y 10 sensores de distancia (como un ToF VL53L1X).
- **Se aprende por niveles** (currículum): primero despegar y flotar, luego ir a metas, esquivar
  columnas, cruzar un bosque y, al final, cazar pájaros que huyen.
- **Un solo modelo** (`models/modelo.zip`) acumula todo lo aprendido. Cada vez que se entrena, se
  continúa el mismo.
- **Blender** sirve para *ver aprender* (muchos drones a la vez, la red encendiéndose).
- **El juego** sirve para *ver volar* con fluidez, diseñar rutas, poner pájaros y pilotear a mano.

Objetivo de fondo: aprender RL, redes y física de drones para el portafolio, y algún día correr el
modelo en el dron ESP32 de Santiago (necesitaría sensores ToF y una estimación de su velocidad y
posición; la red es chica, 27 → 128 → 128 → 4, y cabe en un microcontrolador).

---

## 2. El modelo

### 2.1 Física (`drone_rl/physics.py`)

Modo **angle** (auto-nivelado), como el modo para principiantes de Betaflight:

| Parámetro | Valor | Qué significa |
|---|---|---|
| masa | 0.6 kg | |
| empuje/peso | 2.5 | gas de hover = 1/2.5 = 40 % |
| inclinación máx. | 35° | roll y pitch |
| giro (yaw) máx. | 180°/s | |
| respuesta de ángulo | 8 /s | el ángulo real persigue al pedido (filtro de 1er orden) |
| arrastre | 0.03 | F = −c·\|v\|·v (contra el aire, así el viento empuja) |
| choque | > 4 m/s contra el piso, tocar un obstáculo, o salir de ±30 m / 15 m de alto | |
| radio del dron | 0.15 m | |

- Control a **50 Hz**, física a **100 Hz** (2 subpasos), Euler semi-implícito.
- **Viento:** una dirección base por intento + ráfagas (proceso de Ornstein-Uhlenbeck, τ = 1.5 s).
  El dron no lo "ve"; solo nota que su velocidad cambia.

### 2.2 Lo que ve: 38 entradas (`drone_rl/sensing.py`, `build_obs`)

Todo va rotado al **marco del dron** (X adelante, Y izquierda, Z arriba). Así "la meta está adelante
a la izquierda" significa lo mismo mirando al norte o al sur.

| # | Entradas | Escala |
|---|---|---|
| 0-2 | dónde está la meta (adelante, izquierda, arriba) | ÷10, recortado a ±2 |
| 3 | distancia a la meta | ÷10, máx. 2 |
| 4-6 | velocidad del dron | ÷10, ±2 |
| 7-8 | roll, pitch | ÷35° |
| 9 | altura | ÷10 |
| 10-13 | las 4 palancas del paso anterior | [-1, 1] |
| 14-21 | 8 sensores horizontales (0°, 45°, …, 315°, contra reloj desde adelante) | ÷5 m (1 = libre) |
| 22-23 | sensor arriba, sensor abajo | ÷5 m |
| 24-26 | **cómo se mueve la meta** (adelante, izquierda, arriba) | ÷5 m/s, ±2 |
| 27-29 | **dónde está el sujeto** a grabar (sin sujeto: igual que 0-2) | ÷10, ±2 |
| 30-33 | **qué toma** se pide: fija, revelar, seguir, órbita (una en 1; todo 0 si no graba) | 0/1 |
| 34-37 | **la física de su dron**: empuje/peso ÷5, masa (kg), arrastre ×20, respuesta ÷10 | ~0-2 |

- **Sensores en cono:** cada horizontal mide 3 rayos (−15°, 0°, +15°) y reporta el más corto, como
  un ToF real de ~27°. Alcance 5 m.
- **Las entradas 24-26 se agregaron para la caza.** Con aros quietos valen 0. Son la velocidad de la
  presa estimada con lo que se movió en los últimos 0.1 s (5 pasos), como un tracker de cámara.
  Van al final a propósito: un modelo viejo de 24 entradas usa las primeras 24 y vuela igual.

### 2.3 Lo que hace: 4 palancas (acción en [-1, 1])

| Palanca | Qué hace |
|---|---|
| gas | **centrado en hover**: 0 = 40 % (flota), +1 = 100 %, −1 = 0 % |
| roll | × 35° de inclinación lateral |
| pitch | × 35° hacia adelante (+) o atrás |
| yaw | × 180°/s de giro (+ = izquierda) |

Lo de centrar el gas en hover fue un arreglo clave: una red recién nacida saca acciones cerca de 0,
y si 0 fuera 50 % de gas, salía disparada hacia arriba y aprendía que volar es peligroso.

### 2.4 La red y PPO

- **Red:** MLP 27 → 128 → 128 → 4 con tanh (actor) y otra igual → 1 (crítico, el que estima "qué
  tan bueno es este momento"). Stable-Baselines3 `MlpPolicy`.
- **PPO:** cada **generación**, los N drones vuelan ~12 800 pasos en total juntando experiencia, y
  luego la red aprende de esa experiencia (10 pasadas, lotes de 1024, lr 3e-4, γ = 0.99,
  λ = 0.95, clip 0.2).
- **γ = 0.99 a 50 Hz** quiere decir que la red "ve" ~2 s hacia adelante. Un premio que llega más tarde
  casi no lo siente. Por eso varios premios dan aviso inmediato (ver "Ir de frente").
- **Exploración:** PPO suma ruido gaussiano (σ) a las palancas para probar cosas nuevas. Si σ baja
  demasiado (< 0.15), la red repite siempre lo mismo y no aprende a esquivar. Se controla en vivo.

### 2.5 Recompensa (`DEFAULT_REWARD` en `env.py`, sliders en el panel)

| Clave | Por defecto | Qué hace |
|---|---|---|
| progress | 2.0 | + por cada metro que se acerca a la meta |
| goal | 10 | + al pasar un aro / cazar un pájaro |
| crash | 10 | − al chocar |
| time | 0.01 | − por paso (apura) |
| smooth | 0.05 | − por cambios bruscos de palancas (ojo: también cobra el ruido de exploración) |
| tilt | 0.01 | − por inclinarse |
| near | 0.3 | solo hover: + continuo por estar cerca |
| clearance | 0 | − por pasar a menos de 1.2 m de algo |
| speed | 0.3 | al pasar un aro: + velocidad media del tramo |
| stability | 0.5 | − por segundo de sacudidas de roll/pitch |
| danger | 0 | − por ir rápido hacia algo que se ve (< 1 s para chocar) |
| heading | 2.0 | **Ir de frente**: nariz hacia la meta (ver abajo) |

**Ir de frente** (la historia completa está en la bitácora): el modelo volaba de espaldas o de lado
el 95 % del tiempo, girando sobre sí mismo, porque arranca mirando a cualquier lado y sus sensores ven
360°. La versión que funciona:
- `phi` = qué tan mal mira a la meta (0 mirándola, −½ de lado, −1 de espaldas);
- cuesta `heading × phi` por segundo;
- y cada paso paga `heading × (phi − phi_anterior)`: girar hacia la meta paga **en el acto**.
  Esa parte suma "phi final − phi inicial" en todo el episodio, así que dar vueltas no paga;
- *stability* ya no cobra el yaw (antes cobraba justo el giro para ponerse de frente).
Resultado: de 3 % a ~75-80 % del tiempo volando de frente.

### 2.6 Los niveles (currículum) — `env.py` + `missions.json`

| # | Nombre | Qué hay que hacer | Tiempo |
|---|---|---|---|
| 0 | Hover | despegar y quedarse 1 s dentro de un aro a 1.5 m | 10 s |
| 1 | Meta fija | ir a (5, 0, 2) | 10 s |
| 2 | Metas aleatorias | un aro a 3-8 m, arrancando mirando a cualquier lado | 15 s |
| 3 | Columnas | un aro con columnas en el camino | 15 s |
| 4 | Varias metas | 3 aros en orden, con columnas | 25 s |
| 5 | Circuito | 4 aros, 2 vueltas | 30 s |
| 6 | Bosque | cruzar un bosque hasta un aro a 9-14 m | 25 s |
| 7 | Bosque: 3 aros | slalom de 3 aros en el bosque | 40 s |
| 8 | Caza | tocar 5 pájaros que vuelan solos y huyen | 60 s |
| 9 | Caza entre columnas | lo mismo, entre 9-14 columnas altas | 60 s |
| 10 | Caza en el bosque | lo mismo, debajo de las copas | 60 s |
| LEVEL | Nivel JSON | un nivel fijo hecho en Blender (ej. `levels/bodega.json`) | 25 s |

- Un aro se pasa a menos de 0.5 m; un pájaro se caza a menos de 0.7 m.
- **Bosque** (`level.py`): muestreo de Poisson con especies (árbol, pino, joven, arbusto, roca). Las
  copas altas dejan ~2.6 m libres abajo; lo que hay que esquivar son troncos, árboles jóvenes y
  arbustos. `density` lo hace más claro o más denso.
- Opciones en vivo para todos los niveles: viento (m/s) y, en el bosque, densidad.

### 2.7 La caza (`drone_rl/birds.py`)

Cada pájaro, 50 veces por segundo:
1. **pasea:** su rumbo, su subir/bajar y su rapidez cambian al azar, suave (ruido con memoria);
2. **se queda en el área:** a 12 m de la salida; cerca del borde, del piso o del techo gira hacia adentro;
3. **huye:** si el dron está a menos de 4 m, gira para alejarse y acelera hasta 1.5x;
4. **esquiva** (niveles 9-10): mira 1.2 m adelante; si hay algo, gira al lado libre. Si el paso
   siguiente lo metería en un obstáculo, rebota. Nunca queda adentro de nada;
5. en el bosque vuela **debajo de las copas** (0.9-2.4 m).

- **La presa** es el pájaro vivo más cercano. Solo cambia si otro queda a menos del 60 % de la
  distancia, para que no dude.
- **Todo el azar entra de afuera** (`noise`), así el juego en JavaScript hace exactamente lo mismo.
- **¿Se puede?** Un piloto automático que va a donde el pájaro *está* los caza a 2 m/s, pero a 3 m/s
  caza 0 %. Si se *adelanta* con las entradas 24-26, caza el 45 %. Eso es lo que la red aprende.
- Velocidad y cantidad de pájaros se cambian en vivo ("Velocidad pájaros", "Pájaros").

### 2.8 Un solo modelo (`models/`)

| Archivo | Qué es |
|---|---|
| `modelo.zip` | EL modelo (PPO de SB3: actor + crítico + optimizador). El lab siempre lo continúa |
| `modelo.json` | su historia: generaciones, pasos, `historia` = [generación, pasos, éxito, choque, nivel] por generación, pasos por nivel, sesiones, ampliaciones |
| `modelo_web.json` | los pesos del actor para el juego (se escribe en cada guardado) |
| `modelo.npz` | el actor en numpy para Blender (Prueba IA, Piloto IA) |
| `anteriores/` | modelos archivados ("Empezar de cero", copia antes de ampliar a 27 entradas) y los de referencia |

- Se guarda solo **cada 10 generaciones** y al detener (con reemplazo atómico: nunca queda a medias).
- **Ampliar 24 → 27** (`drone_rl/upgrade.py`): la primera capa recibe 3 columnas de pesos en cero,
  así vuela exactamente igual (hay una prueba). Pasa solo al darle Iniciar con un modelo viejo.
- **Olvido:** si se entrena mucho solo un nivel, puede empeorar en otros. Conviene volver de vez en
  cuando a los anteriores.

### 2.9 Lecciones (por qué las cosas son como son)

- **Quedarse en el suelo** es un óptimo local típico: si volar casi siempre termina en choque (−10 o
  −30), la red aprende a no despegar. Con el modelo nuevo hay que empezar por niveles fáciles (0 → 2)
  y con *crash* moderado.
- **Suavidad × ruido:** *smooth* cobra sobre todo el ruido de exploración: con *smooth* = 0.1 y
  σ = 0.3 son ~−3.6 por segundo (−140 en un episodio de 40 s) aunque vuele perfecto, y eso empuja a σ
  a colapsar.
- **Choques en el bosque:** el 100 % de las veces el dron *veía* el árbol 0.5 s antes; chocaba por ir
  a ~7 m/s (con *speed* = 1 aprendió a correr). Por eso *speed* = 0.3.
- **Caza con obstáculos (gen 679):** 100 % en campo abierto, pero 60 % con columnas y 7-17 % en el
  bosque. Perseguía sin esquivar, igual que un piloto automático. Para eso están los niveles 9 y 10.

---

## 3. Blender: el laboratorio

### 3.1 Cómo abrirlo

1. Abre **`blender/laboratorio.blend`** (escena "Scene" con el frame del dron, `Drone_Root`, y la
   escena "Prueba IA"). Si pregunta por ejecutar scripts, **Allow**.
2. Text Editor → `drone_lab.py` (está enlazado a `blender/drone_lab.py`; si dice que cambió en el
   disco, **Reload**) → **Run Script** (Alt+P).
3. En el viewport: tecla **N** → pestaña **Drone Lab**. Revisa que *Proyecto* sea
   `~/Documents/drone-rl` y *Python* `.venv/bin/python`.

Sin `Drone_Root` el laboratorio funciona igual, pero dibuja los drones como una cruz simple.

### 3.2 El panel Drone Lab (`blender/drone_lab.py`)

- **Modelo:** generación, pasos, en qué niveles entrenó. *Empezar de cero* archiva el modelo.
- **Entrenamiento:** drones (N), nivel, vista (cuadrícula o enjambre), tamaño de los drones.
  **Iniciar entrenamiento**, **Detener y guardar**, **Pausa / Seguir**, **Guardar modelo ahora**.
- **Red neuronal:** "Mostrar red neuronal" dibuja la red del dron observado (luz celeste): las 27
  entradas, 128 + 128 neuronas, 4 palancas y las conexiones más fuertes, iluminadas según cuánto
  influyen en ese instante.
- **Probar en escenario aleatorio:** arma la escena "Prueba IA" (un escenario nuevo del tipo del
  nivel; el bosque con pasto, flores, neblina y sol) y el modelo vuela en vivo con la generación de
  ese momento. *Otro escenario aleatorio* / *Volver al laboratorio*. Los niveles de caza (8-10) se
  prueban en el juego.
- **Jugar en el navegador:** levanta `scripts/jugar.py` y abre el juego.
- **Ambiente (en vivo):** densidad del bosque, viento, pájaros y su velocidad.
- **Aprendizaje (en vivo):** learning rate, exploración σ, entropía, velocidad (*real* = tiempo
  real, para mirar; *rápido* = lo más rápido posible).
- **Recompensa (en vivo):** un slider por clave de `DEFAULT_REWARD` + *Valores por defecto*.
- **Rutas:** carpeta del proyecto y Python; *Borrar drones de la escena*.

**En vivo** = cambia sin reiniciar. **Requiere Detener → Iniciar:** número de drones, nivel y
cualquier cambio de código del entrenador.

### 3.3 Qué pasa al darle Iniciar

1. Blender lanza `.venv/bin/python -u scripts/live_train.py --drones N --stage S … --model
   models/modelo.zip` (salida en `live_train.log`) y escucha UDP en `127.0.0.1:9001`.
2. El entrenador carga el modelo (o crea uno nuevo, o lo amplía a 27 entradas) y crea N entornos.
3. Cada paso manda un **frame** con la pose de cada dron (y, en la caza, a quién persigue y dónde está
   cada pájaro). Un timer de Blender (~30 Hz) mueve los drones (instancias de `Drone_Root`).
4. Cada vez que un dron termina, manda su nivel nuevo (aros, columnas, árboles, pájaros) y un
   **destello**: rojo = choque, verde = éxito, ámbar = se acabó el tiempo.
5. Al terminar la generación, los drones se quedan quietos mientras PPO aprende ("aprendiendo").

**Mensajes UDP** (JSON; los grandes se parten en pedazos `c` porque macOS limita a ~9 KB):

| Del entrenador (:9001) | Qué lleva |
|---|---|
| `h` hola | drones, nivel, modelo, parámetros, misión, nombres de entradas/salidas |
| `s` estadísticas | generación, pasos, éxito, choque, recompensa, % de frente, pájaros cazados, curva |
| `f` frame | pose de cada dron (+ presa y pájaros) y eventos (destellos) |
| `l` nivel | aros/pájaros, cajas, esferas, cilindros de un dron (máx. ~36-60 piezas dibujadas) |
| `w` pesos | las conexiones más fuertes de la red |
| `a` activaciones | entradas, neuronas y palancas del dron observado |
| `x` exportado | el modelo está listo para "Probar" |

| De Blender (:9002) | Qué cambia |
|---|---|
| `lr`, `log_std`, `ent` | aprendizaje y exploración |
| `reward` | pesos de la recompensa (dict compartido por todos los drones) |
| `env` | densidad, viento, velocidad y cantidad de pájaros |
| `speed`, `pause`, `watch` | tiempo real/rápido, pausa, dron observado |
| `save`, `export`, `resend`, `stop` | guardar, exportar para probar, reenviar niveles, detener |

### 3.4 El HUD

Arriba a la izquierda del viewport: fase (volando / aprendiendo), generación, pasos, éxito y choque,
recompensa media, σ, "vuela de frente el X %", velocidad y giro medio de los que llegan, pájaros
cazados por intento (caza), los pesos de la recompensa y la **curva** de toda la vida del modelo,
con una marca cada vez que cambió de nivel. Debajo, la misión (objetivo, éxito, falla, premio).

En la cuadrícula: aros verde = el que toca, celeste = el siguiente, gris = los que faltan. Pájaros:
rojo = la presa, amarillo = los demás. En la caza en el bosque no se dibujan las copas altas (tapan a
los pájaros); la física sí las usa.

### 3.5 Otros scripts de Blender

| Script | Qué hace |
|---|---|
| `prueba_aleatoria.py` | arma la escena "Prueba IA" y vuela el modelo (la llama "Probar") |
| `bosque.py`, `escena_lib.py` | el bosque 3D (mallas en numpy, pasto con Geometry Nodes, neblina, sol) y piezas comunes (dron, cámaras) |
| `piloto_ia.py` | panel **Piloto IA**: la red vuela dentro de una escena (lee los obstáculos de la escena), graba el vuelo como keyframes para render |
| `build_bodega.py` | construye `bodega.blend` desde `levels/bodega.json` (se corre en segundo plano) |
| `drone_sim.py` | vuelo manual en el viewport (W/A/S/D, gas, HUD) |
| `export_level.py` / `import_trajectory.py` | Blender → `levels/*.json` / vuelo exportado → animación |

---

## 4. El juego web (`game/`)

### 4.1 Cómo abrirlo

- En el lab: **Jugar en el navegador**. O en la terminal: `python scripts/jugar.py`.
- Abre `http://localhost:8765/game/`. El servidor solo escucha en tu compu.
- Cada vez que pides `models/modelo_web.json`, si `modelo.zip` es más nuevo, lo exporta primero.
  El juego vuelve a leer el modelo cada vez que le das volar: **siempre vuela con la última
  generación guardada**, aunque estés entrenando.
- Necesita WebGL: en Chrome, la **aceleración por hardware** tiene que estar activada.

### 4.2 Por qué un juego y no Blender

Blender dibuja cada cuadro como una película (neblina volumétrica, sombras suaves, cientos de miles
de triángulos) y la prueba 3D iba a ~20 cuadros por segundo con trabones. El juego usa
*instancing*: miles de árboles y matas de pasto en pocas llamadas a la tarjeta de video.

### 4.3 Es el mismo simulador

`game/sim.js` es una copia de `drone_rl/` en JavaScript: física, viento, colisiones, raycast,
sensores en cono, las 27 entradas, la red, el PD de aterrizaje, el vuelo y los pájaros.
`test_sim.mjs` lo comprueba contra casos que genera Python (`make_fixture.py`):

| Caso | Tolerancia |
|---|---|
| raycast, colisiones, sensores, física con viento | 1e-9 |
| 27 entradas / 4 salidas de la red | 1e-6 / 1e-5 |
| vuelos completos de la red (bosque, circuito con aterrizaje) | 1 mm |
| pájaros: pasear + huir + borde; esquivando en el bosque | 1e-9 |
| caza completa con una red de 27 entradas | 1 mm, misma presa paso a paso |

### 4.4 Archivos

| Archivo | Qué hace |
|---|---|
| `index.html` | estilos, menú, editor, HUD, panel de controles, aviso de error de WebGL |
| `main.js` | estado, menú, editor, vuelo (bucle fijo de 50 Hz), cámaras, HUD, récords |
| `sim.js` | el simulador (ver arriba). No usa nada del navegador: corre en node |
| `worlds.js` | los mundos: bosque (semilla + densidad), columnas, bodega (`levels/bodega.json`), campo |
| `scene.js` | todo lo 3D: cielo, luces, pasto y árboles instanciados, aros, dron, rayos, estela, pájaros |
| `pilot.js` | pilotear a mano: teclado, ratón, control, ayudas |
| `vendor/` | three.js r169 (sin internet ni build) |

**Coordenadas:** la simulación usa Z arriba (X adelante, Y izquierda). Three.js usa Y arriba:
`V(x, y, z) = Vector3(x, z, −y)`. El dron usa Euler "YZX" (roll, yaw, −pitch).

**Bucle:** la física corre a 50 Hz fijos (acumulador, hasta 20 pasos por cuadro). El dibujo
interpola entre el paso anterior y el actual, así se ve suave a cualquier fps. La velocidad del
juego (×0.25 a ×2) cambia cuántos pasos corren por segundo, no la física.

### 4.5 Menú

- **Juego:** *Aros* (pones aros y la IA los pasa en orden y aterriza) o *Caza* (pones pájaros y la IA
  los caza).
- **Mundo:** Bosque, Columnas, Bodega, Campo libre. "Otro mundo" cambia la semilla.
- **Condiciones:** densidad del bosque, velocidad de los pájaros, viento, calidad gráfica.
- Muestra qué modelo hay (generación, pasos, en qué niveles entrenó). También se puede soltar un
  `modelo_web.json` en la página.

### 4.6 Editor

- Clic en el suelo: pone un aro (o un pájaro) a la altura del slider. "Mover la salida" mueve el
  punto de despegue.
- *Ruta al azar* / *Pájaros al azar*, *Deshacer* (Ctrl+Z), *Borrar*, lista con ✕ para quitar uno.
- En el bosque, con aros, se quitan solos los árboles que tapan un aro o la salida (como en el
  entrenamiento). Con pájaros no: los pájaros se ponen lejos de los árboles y a la altura de debajo
  de las copas.
- Botones: *Volar con la IA* / *Que cace la IA*, *Pilotear yo* / *Cazar yo* (sin aros = vuelo libre).

### 4.7 Vuelo

- **Fases:** ruta → aterrizaje (el piloto PD baja bajo el último aro) → aterrizado, o choque, o
  cazado. La IA tiene un límite de tiempo (15 s + 8 por aro; 60 s en la caza); tú, más.
- **HUD:**
  - arriba izquierda: quién vuela y la generación, aro N de M o pájaros cazados, tiempo, y
    *de frente / de lado / de espaldas* con el % de frente;
  - arriba derecha: km/h, m/s, altura (y la altura fijada si pilotas tú), viento y, en la caza,
    a qué distancia está la presa y qué tan rápido vuela;
  - abajo izquierda: **las manos de la IA**, las dos palancas moviéndose como las mueve la red;
  - abajo derecha: **sensores**: los 8 conos (verde libre → rojo cerca), arriba/abajo, una flecha
    hacia donde se mueve (verde de frente, amarillo de lado, rojo de espaldas) y, en la caza, un punto
    rojo donde está la presa con una rayita hacia donde se mueve;
  - **N**: el cerebro (todas las neuronas encendiéndose).
- **Resultado:** llegó / chocó (contra qué) / se acabó el tiempo, % de frente, cuántas veces llegó
  la IA en la sesión y los **récords** de esa ruta (tú contra la IA, guardados en el navegador).

**El dron:** la nariz es la flecha verde encima; las hélices de adelante son naranjas y las de atrás
grises; luz roja atrás.

**Caza:** la presa es roja con una flecha encima, los demás amarillos y aleteando. La línea blanca
punteada es lo que la red "sabe": dónde estaría la presa en 0.6 s si siguiera igual. Al cazar uno
salen plumas.

### 4.8 Pilotear yo (`pilot.js`)

| Control | Qué hace |
|---|---|
| **Ratón** | girar (las vueltas que quieras). Clic para atraparlo, Esc lo suelta |
| **Espacio / Shift** (o ↑ ↓) | subir / bajar. Con *mantener altura*, al soltar se queda a esa altura |
| **WASD** | inclinarse adelante/atrás/lados (el dron va hacia donde se inclina) |
| ← → | girar con el teclado |
| Control de videojuego | modo 2 (gas a la izquierda) o modo 1. A = otra vez, B = cámara, Start = pausa |

**Ayudas** (panel **Controles**, tecla H): *mantener altura* (un PD con anticipación lleva la altura
fijada), *frenar solo* (al soltar WASD se inclina en contra de su velocidad hasta parar, como con
GPS), sensibilidad, sensibilidad del ratón, suavizado, inclinación y campo de visión de la FPV.

### 4.9 Cámaras (1-6, o C)

**Persecución** (se acerca sola si un árbol tapa), **FPV** (la cámara del dron, inclinada hacia
arriba como en los de carreras, con horizonte artificial), **Piloto** (parado en la salida, con zoom),
**Cine** (gira alrededor), **Arriba**, **Libre** (arrastra para girar).

Otras teclas: **R** otra vez, **E** editar, **N** cerebro, **+/−** velocidad, **P** pausa,
**Esc** menú, **F** fps.

Lo que se guarda en el navegador (`localStorage`, claves `dronerl.*`): mundo, juego, densidad,
viento, calidad, cámara, controles, velocidad de los pájaros y récords.

---

## 5. Cómo se ha trabajado

- Santiago entrena y mira en el **Drone Lab**; los cambios de código se prueban con `pytest` y
  `test_sim.mjs`, y él aplica los cambios del entrenador con **Detener → Iniciar** (el mismo modelo
  continúa).
- Para diagnosticar, se **evalúa** el modelo actual con episodios fijos (semillas) y se mide: éxito,
  choques y contra qué, % de frente, giro medio, qué pasa si se fuerza algo (ej. la nariz al aro).
  Se compara con un piloto automático de referencia para saber si el nivel se puede resolver.
- Nada de entrenar por cuenta propia: los entrenamientos los decide y los ve él.

## 6. Pendiente

- Caza en el bosque (nivel 10) y bajar los choques de la caza con obstáculos (nivel 9: 64 % / 36 %).
- Bosque con aros (niveles 6-7) con el modelo único.
- Video de la IA volando para el portafolio (Piloto IA graba keyframes; el juego tiene cámara cine).
- Push a GitHub (`Sagaz0501/drone-rl`).
- Modo acro y medidas reales del frame (`QuadParams`); pasar el modelo al dron ESP32.
