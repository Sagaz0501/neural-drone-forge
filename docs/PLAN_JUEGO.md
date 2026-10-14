# Dron Maker — plan del juego

> Documento vivo. Es la idea principal de Santiago (14 de octubre de 2026) ordenada en un plan.
> "Después la pulimos": todo lo que tiene números o nombres es una **propuesta para empezar**, se
> ajusta jugando. Las preguntas abiertas están al final.

## 1. La idea en una frase

Un **simulador 3D en el navegador** donde construyes tu propio dron desde piezas rústicas, ganas plata
con él (vendiendo drones y grabando videos), compras mejor equipo y, más adelante, **entrenas una IA**
para tener varios drones autónomos grabando desde distintos ángulos, y al final **entregando paquetes**.

## 2. El ciclo del juego

```
   ┌──────────────┐     ┌─────────────────┐     ┌──────────────────────┐
   │  TALLER      │ ──▶ │ VUELO DE PRUEBA │ ──▶ │ MISIÓN               │
   │ armar/mejorar│     │ ¿vuela? ¿cuánto │     │ grabar un video,     │
   │ el dron      │     │ dura la batería?│     │ vender un dron, ...  │
   └──────▲───────┘     └─────────────────┘     └──────────┬───────────┘
          │                                                │ plata + reputación
          │          ┌────────────────────┐                │ (y daños si chocaste)
          └───────── │ TIENDA / MEJORAS   │ ◀──────────────┘
                     │ piezas, herramientas│
                     └────────────────────┘
```

Al principio pilotas tú (con los controles que ya existen). Más adelante, la IA vuela por ti y
puedes tener varios drones a la vez.

## 3. Etapas del juego (lo que vive el jugador)

| Etapa | Qué tienes | Cómo ganas plata | Qué desbloqueas |
|---|---|---|---|
| **1. Garaje rústico** | chasis de madera, motores baratos, batería chica, cámara de juguete | fotos simples de una casa o un campo; vender tu primer dron armado | taller básico, primeras piezas |
| **2. Pequeño negocio** | chasis impreso o de aluminio, brushless, cámara de acción | videos para clientes (eventos, fincas, autos), drones por encargo | estabilizador (gimbal), GPS, mejores baterías |
| **3. Estudio de video** | carbono, cámara con gimbal, 2-3 drones | tomas exigentes (seguir un auto, órbitas, tomas en el bosque) | **laboratorio de IA**, sensores de distancia |
| **4. Flota con IA** | chip de IA, varios drones autónomos | tomas multi-cámara: tú diriges uno, la IA graba desde otros ángulos | mejores versiones del chip (esquivar, seguir objetos) |
| **5. Entregas** (futuro) | drones de carga, gancho, baterías grandes | entregar paquetes en el pueblo/ciudad | rutas, clima, contratos |

## 4. Sistemas

### 4.1 Taller: armar el dron

El dron es la suma de sus piezas. Cada pieza tiene **precio, peso, durabilidad** y lo que aporta.

| Ranura | Opciones (de rústico a pro) | Afecta |
|---|---|---|
| Chasis | madera (pesado, frágil, barato) → plástico impreso → aluminio → carbono | peso, arrastre, resistencia a choques, tamaño de hélice que acepta |
| Motores (x4) | con escobillas de juguete → brushless básicos → brushless potentes | empuje total, consumo, giro (yaw) |
| Hélices | 3" / 5" / 7" | eficiencia, empuje, qué tan rápido responde |
| Batería | 2S chica → 3S → 4S → Li-ion de largo alcance | **tiempo de vuelo**, peso |
| Controladora | "solo estabiliza" → con barómetro (mantener altura) → con GPS (frena y se queda quieto) → **con chip de IA** | qué ayudas tiene al pilotear, si puede volar sola |
| Cámara | de juguete → acción 1080p → con gimbal 4K | calidad del video (paga más), estabilidad de la imagen |
| Extras | sensores de distancia (ToF), GPS, gancho de carga, luces | la IA **necesita** los sensores para esquivar; el gancho para entregas |

**La clave técnica:** la física ya existe (`game/sim.js`, igual que `drone_rl/physics.py`) y depende
de unos pocos números: masa, empuje/peso, arrastre, inclinación máxima, respuesta y giro. **El taller
solo tiene que calcular esos números a partir de las piezas.** Un dron de madera con motores baratos
queda con empuje/peso de ~1.4 (lento y torpe); uno de carbono con buenos motores, ~4 (ágil).

| Número de la física | Sale de |
|---|---|
| masa | suma de pesos |
| empuje/peso | empuje de los motores (con la hélice) ÷ (masa × g) |
| arrastre | chasis + cámara + extras |
| inclinación máx. y respuesta | controladora + peso |
| giro (yaw) | motores |
| **batería** (nuevo) | Wh de la batería ÷ potencia para flotar (que crece con la masa) → minutos de vuelo |

**La batería es un mecanismo nuevo e importante:** se gasta según el gas que uses. Hay que volver
antes de que se acabe, o el dron cae. Eso le da tensión a cada misión.

**Daños:** chocar daña piezas según la velocidad del golpe y la durabilidad. Repararlas cuesta plata.
Volar con cuidado tiene sentido.

En la pantalla del taller se ve el dron armándose en 3D, pieza por pieza, girando sobre la mesa, con
un panel de estadísticas que cambia en vivo (peso, empuje/peso, minutos de vuelo, agilidad,
calidad de video, precio).

### 4.2 Misiones y plata

| Tipo | Qué pide el cliente | Cómo se califica |
|---|---|---|
| **Fotos / video de un lugar** | "quiero tomas de mi casa / finca / cancha" | tener el sujeto encuadrado X segundos, a cierta altura y distancia, imagen estable |
| **Seguir algo que se mueve** | un auto, un ciclista, un caballo | mantenerlo en cuadro mientras se mueve (es la habilidad de la **caza** que ya entrena el modelo) |
| **Vender un dron** | "un dron de carreras de menos de 400 g con empuje/peso > 3, máximo $X" | cumplir la especificación; la ganancia es precio − costo de piezas |
| **Entregas** (futuro) | llevar un paquete de A a B | llegar, sin romper el paquete, a tiempo, con batería |

- **Calificación de un video:** encuadre (el sujeto dentro del cuadro de la cámara del dron, cerca
  del centro), estabilidad (sin sacudidas: es la misma métrica de "estabilidad" del entrenamiento),
  suavidad, duración y la calidad de la cámara. Da estrellas, plata y **reputación**.
- **Reputación** desbloquea clientes mejores, lugares nuevos y piezas en la tienda.
- **Los videos de verdad:** el juego puede grabar el canvas de la cámara del dron (`MediaRecorder`)
  y guardar un `.webm`. Así el jugador tiene una galería "Mis videos" con lo que grabó.

### 4.3 Tienda y mejoras

- Piezas por etapas (se desbloquean con reputación).
- Herramientas del taller: impresora 3D (chasis propios más baratos), estación de soldadura (reparar
  más barato), banco de pruebas (ver el empuje real antes de volar).
- Lugares: campo → pueblo → bosque → ciudad → montaña (los mundos que ya existen sirven de base).

### 4.4 La IA dentro del juego (etapa 3-4)

Aquí se conecta todo lo que ya se hizo en `drone-rl`:

- El **chip de IA** es una pieza de la controladora. Sus versiones son lo que el modelo ya sabe:
  - v1 ir a puntos (metas);
  - v2 esquivar obstáculos (columnas, bosque) — **necesita los sensores ToF**;
  - v3 seguir algo que se mueve (la **caza**: las 3 entradas de "cómo se mueve la meta").
- **Tomas multi-cámara:** tú vuelas el dron principal y asignas a cada dron con IA una posición
  alrededor del sujeto (de frente, de lado, desde arriba, órbita). Esa posición se mueve con el
  sujeto, y para la red es simplemente **una meta que se mueve**: exactamente lo que aprendió en la caza.
- **"Entrenar" dentro del juego:** el jugador visita el laboratorio y ve a su IA aprender (como el
  Drone Lab). Opciones técnicas, de más fácil a más difícil:
  1. el juego trae versiones ya entrenadas del modelo y el "entrenamiento" las desbloquea (con una
     animación de drones aprendiendo);
  2. el entrenamiento real corre en Python (el Drone Lab / `live_train.py`) y el juego importa el
     `modelo_web.json`;
  3. entrenar de verdad en el navegador (PPO pequeño en JavaScript o TensorFlow.js). Es lo más
     difícil y lento.
- **Riesgo técnico importante:** el modelo de hoy se entrenó con **un solo dron** (0.6 kg,
  empuje/peso 2.5). Un dron armado por el jugador puede pesar el doble o tener la mitad de empuje, y
  la red podría volarlo mal. **Solución:** entrenar con física al azar en cada intento (masa,
  empuje/peso, arrastre, respuesta dentro de rangos: *domain randomization*), así la red aprende a
  volar "cualquier dron". Es un cambio en `env.py` (y su par en `sim.js`) y un entrenamiento nuevo.

### 4.5 Entregas (futuro)

- El paquete suma masa (y cambia cómo vuela) y hay que soltarlo en el lugar.
- La IA que entrega necesita: esquivar (v2) + llevar carga (entrenamiento con masa variable) + volver
  a la base con batería.

## 5. Plan técnico

- **Navegador + Three.js, como el juego actual.** Módulos ES sin build (`import` directo, three.js en
  `game/vendor/`). Si el código crece mucho, más adelante se puede pasar a Vite.
- **La base es `game/`**: `sim.js` (física, sensores, red, pájaros), `scene.js` (mundos, dron, aros,
  pájaros), `pilot.js` (pilotear a mano), `worlds.js`. Todo está probado contra Python.
- **El juego nuevo va en `app/`** y usa esos módulos (`import … from "../game/sim.js"`). Así
  `game/` sigue funcionando como "arena de pruebas" del modelo, y sus pruebas siguen valiendo.
- **Datos en JSON:** `app/data/piezas.json` (catálogo), `app/data/misiones.json`, `app/data/clientes.json`.
  Balancear el juego = editar números, no código.
- **Guardar partida:** `localStorage` (plata, piezas, drones armados, reputación, videos), con
  exportar/importar a un archivo.
- **Física por dron:** hoy `sim.js` usa un objeto `P` global. Hay que pasarlo **por vuelo/dron**
  (`new Flight(level, policy, { params })`), con `P` actual como valor por defecto para que todas las
  pruebas sigan pasando. `drone_rl/physics.py` ya funciona así (`QuadParams`).
- **Servidor:** `python scripts/jugar.py` ya sirve todo el proyecto en `http://localhost:8765/`; el
  juego nuevo quedaría en `http://localhost:8765/app/`.

## 6. Hitos

| Hito | Qué se puede hacer al terminarlo | Listo cuando… |
|---|---|---|
| **M0 · Base** (hecho) | simulador, sensores, IA entrenada, juego con mundos, pilotear a mano, cámaras, caza | — |
| **M1 · Taller** | armar un dron con ~3-4 opciones por ranura (etapa rústica), verlo en 3D, ver sus estadísticas y **volarlo** con física y batería según sus piezas | dos drones distintos vuelan **notablemente** distinto y la batería obliga a volver |
| **M2 · Plata** | plata, tienda, 3 misiones (fotos de un lugar, video siguiendo algo, vender un dron por encargo), daños y reparación, guardar partida | se puede jugar ~30 min subiendo de la etapa 1 a la 2 |
| **M3 · Videos** | cámara del dron con encuadre calificado, repetición, grabar `.webm`, galería | el jugador ve y guarda los videos que grabó |
| **M4 · IA** | chip de IA (versiones del modelo), tomas multi-cámara con drones autónomos; entrenamiento con física al azar para que la IA vuele drones del jugador | un dron armado por el jugador vuela solo con el chip y graba desde otro ángulo |
| **M5 · Entregas** | carga, ciudad, rutas, contratos | entregar paquetes con un dron propio y con IA |

### M1 en detalle (lo primero que hay que hacer)

1. `app/index.html` + `app/main.js` con una pantalla **Taller** (estilo del juego actual: verde
   musgo, Chakra Petch, paneles translúcidos).
2. `app/data/piezas.json` con la etapa rústica (3-4 opciones por ranura, con peso, precio,
   durabilidad y lo que aportan).
3. `app/parts.js`: piezas → números de la física (`masa`, `twr`, `drag`, `maxAngle`, `attResp`,
   `yawRate`) + minutos de batería. Con pruebas en node (ej. "más batería = más minutos pero más
   masa").
4. `app/builder3d.js`: el dron armado en 3D a partir de las piezas (chasis, brazos, motores,
   hélices, batería, cámara), girando en la mesa del taller.
5. Refactor de `sim.js`: parámetros por vuelo (sin romper `test_sim.mjs`).
6. **Vuelo de prueba** en el campo con `pilot.js`, la batería en el HUD (y aterrizaje forzado al 0 %).

## 7. Preguntas abiertas (para decidir con Santiago)

- ¿Estilo visual? (low-poly "rústico" como el juego actual, o más realista)
- ¿Un mapa con lugares (taller, campo, pueblo) o un menú de misiones?
- ¿Qué tan "simulador" vs "arcade"? (ej. ¿el jugador elige motores por KV y celdas, o por estrellas?)
- ¿Cuánto dura una partida hasta la IA? ¿Cuántas misiones por etapa?
- ¿El jugador puede diseñar el chasis (largo de brazos, forma) o solo elegir modelos?
- Nombre del juego (por ahora: **Dron Maker**).
