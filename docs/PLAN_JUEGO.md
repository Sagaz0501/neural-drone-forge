# Dron Maker — plan del juego

> **Nota (15-10-2026):** este es el plan original. El juego ahora se llama **Neural Drone Forge** y lo que sigue
> está en [ROADMAP.md](ROADMAP.md). Lo de aquí sigue valiendo como idea de fondo (etapas, sistemas, números).
>
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

### 4.4 La IA de grabación (etapa 3-4)

**Idea de Santiago (14-10-2026):** un modelo que se entrena **en su computador** (Drone Lab, sin
importar cuánto se demore) con la física del juego, enfocado en **grabar**: estabilidad, seguir al
sujeto y que **la propia IA escoja cómo volar** según la toma que se pide (si necesita velocidad,
altura, rodear…). El juego **toma el último modelo** entrenado y lo usa. Qué tan bien graba depende
de las piezas: con algunos drones le cuesta, con otros es imposible (no da la velocidad, no da la
altura, no da la batería).

**Cómo llega el modelo al juego:** ya funciona así. El Drone Lab guarda `models/modelo_web.json`
cada 10 generaciones y el juego lo vuelve a leer sin caché cada vez que se vuela
(`game/main.js:113`). El juego nuevo hace lo mismo: siempre usa el último. En el `meta` del archivo
el entrenador escribe qué sabe el modelo (generación, tipos de toma, `rango_fisica`).

**En el juego:** la controladora con chip de IA es una pieza; el *software* (Tomas fijas → Entre
obstáculos → Seguir y orbitar) desbloquea qué tomas le puedes pedir. Todos usan el mismo modelo.
Mientras se entrena, el pedido de la casa tiene el botón **Que grabe la IA** (prueba del laboratorio).

**Hecho (14-10-2026):** pasos 1-5 de abajo: física por vuelo (`sim.js`, `pilot.js`), `--dron` en el
entrenador (un `drones/*.json` o `azar`), nivel **11 · Grabar: tomas con ruta** (una casa; tomas fija, órbita y revelar: ver "Tomas con ruta" abajo),
entradas 27-37, ampliación 27 → 38 y `meta.rango_fisica`/`tomas`. Falta el paso 6 (entrenar) y las
otras tomas (revelar, seguir, órbita).

#### Tomas con ruta (14-10-2026, lo que hay hoy)

Una toma NO es llegar y quedarse: es una **ruta de cámara** (`drone_rl/tomas.py` = `game/sim.js Toma`). El punto
de cámara espera en el inicio; cuando el dron llega (< 1,5 m y < 2 m/s) empieza a grabar y el punto recorre la
ruta (con suavizado: arranca y frena despacio). El dron tiene que ir **pegado** al punto con la casa **al centro**.

| Toma | Ruta |
|---|---|
| fija | quieto en un punto exacto, 5-7 s |
| órbita | arco de 70-150° alrededor del sujeto, a 1-2 m/s |
| revelar | de bajo y cerca a alto y lejos (sube alejándose) |
| seguir | (falta) sujetos que se mueven |

**Calidad de imagen (estricta)** = encuadre (sujeto a ±20° del centro horizontal, ±15° vertical) × seguimiento
(< 1,2 m del punto) × ritmo (velocidad de la ruta ± 1 m/s) × estable (sin sacudidas de roll/pitch ni paneos
bruscos; el gimbal quita casi todo). Una toma cuenta si su calidad media es ≥ 50 %.

**Pedido = guion de tomas** (`app/data/misiones.json`): la casa pide *El frente* (fija), *Media vuelta* (órbita) y
*Revelar desde el jardín*. Puntaje del video = 75 % calidad media de las tomas + 25 % la cámara; las 3 tienen que
pasar del 50 %. Con la cámara de juguete el máximo es 80 (★★); ★★★ pide mejor cámara.

**Entrenamiento (nivel 11):** una casa al azar + una toma al azar; premio por segundo grabado = calidad; al
terminar la ruta, + "toma terminada" × calidad media. Un piloto clásico que sigue la ruta saca 0,7-0,9 de calidad
(si no choca con la casa yendo al inicio: la IA tiene que esquivarla con sus sensores).

#### La tarea nueva que se entrena: "grabar"

En cada intento hay un **sujeto** (quieto, o que se mueve: persona, ciclista, balón) y un **tipo de
toma**. No se le da ruta: solo qué toma se quiere y cómo se califica. PPO encuentra el camino.

| Toma | La "meta" (el punto de cámara) | Lo que se premia |
|---|---|---|
| fija | un punto a cierta distancia/altura/ángulo del sujeto | llegar, quedarse quieto y encuadrar |
| revelar | arranca bajo y cerca, sube y se aleja despacio | movimiento suave y continuo |
| seguir | detrás/al lado del sujeto, **se mueve con él** (como la caza) | mantener la distancia y el encuadre |
| órbita | da vueltas alrededor del sujeto | velocidad angular pareja, encuadre |
| obstáculos | cualquiera de las anteriores en bosque/columnas | lo mismo, sin chocar (necesita ToF) |

**Recompensa de grabación** (se suma a las de vuelo que ya existen):
- **encuadre**: la nariz (la cámara) apunta al sujeto, cerca del centro del cuadro. Es "Ir de
  frente" pero hacia el *sujeto* en vez de hacia la meta (mismo truco del potencial);
- **estabilidad** y **suavidad**: las que ya existen (sin sacudidas de roll/pitch, palancas suaves);
- **distancia y altura** dentro del rango de la toma;
- **batería**: castigo por gastar energía (potencia ∝ gas^1.5), así no corre si no hace falta;
- chocar: igual que hoy.

**Entradas nuevas** (van al final, regla 3; `upgrade.py` amplía 27 → 38 sin cambiar cómo vuela):

| # | Entradas | Por qué |
|---|---|---|
| 27-29 | dónde está el **sujeto** (marco del dron) | la meta es el punto de cámara; el sujeto es lo que hay que encuadrar |
| 30-33 | tipo de toma (fija, revelar, seguir, órbita) | para que escoja cómo volar según lo que se pide |
| 34-37 | **la física de su dron**: empuje/peso, masa, arrastre, respuesta | sabe qué tan ágil es el dron que maneja |

**Física al azar (el punto clave):** el modelo de hoy solo conoce **un** dron (0.6 kg, empuje/peso
2.5). Para grabar con drones armados por el jugador, en cada intento se sortea la física **dentro de
lo que se puede armar en el juego** (`app/parts.js`): masa 0.45-1.0 kg, empuje/peso 1.5-9, arrastre
0.02-0.06, respuesta 4-12/s. El entrenador escribe ese rango en `meta.rango_fisica`; si el dron del
jugador queda fuera, el taller avisa "la IA no conoce un dron así".

**Difícil o imposible, de verdad:**
- *Imposible*: el taller revisa antes de aceptar el pedido. Velocidad máx. del dron < 1.3 × velocidad
  del sujeto, batería que no alcanza para grabar + ir y volver, o cámara bajo el mínimo.
- *Difícil*: el mismo modelo graba peor con un dron pesado y lento (más sacudidas, se queda atrás).
  No hay que programarlo: sale de la física. **Banco de pruebas de IA** (herramienta del taller):
  corre ~20 intentos rápidos de la toma en el navegador con la física de *tu* dron y te muestra el
  % de encuadre esperado antes de aceptar el pedido. Esto *evalúa* el modelo, no lo entrena.

**Pasos técnicos** (en orden):
1. Física por vuelo en `sim.js` (`new Flight(level, policy, { params })`), `P` por defecto.
2. Física al azar en `env.py` (opción del Drone Lab, apagada por defecto) + su par en `sim.js`.
3. Nivel "Grabar" en `env.py`/`missions.json` + su par en `sim.js`; sujetos que se mueven (reusa
   `birds.py`: un sujeto es un "pájaro" que no huye y va por un camino).
4. Entradas 27-37 en `sensing.py`/`sim.js` + ampliación en `upgrade.py`; pruebas JS == Python.
5. El entrenador escribe `tomas` y `rango_fisica` en el `meta`.
6. **Santiago entrena** en el Drone Lab (el modelo actual sigue: ya sabe volar, esquivar y cazar).
   Ojo con el olvido: mezclar de vez en cuando los niveles viejos.

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
| **M1 · Taller** (etapa 1 hecha) | armar un dron con ~3-4 opciones por ranura (etapa rústica), verlo en 3D, ver sus estadísticas y **volarlo** con física y batería según sus piezas | dos drones distintos vuelan **notablemente** distinto y la batería obliga a volver |
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

## 7. Decisiones y preguntas abiertas

**Decidido (14-10-2026):**
- Piezas **semi-reales**: nombres y datos reales simplificados (motor 2204 2300KV, LiPo 3S 1300 mAh,
  hélice 5"), con barras de estadísticas.
- IA: **un solo modelo entrenado en el computador de Santiago**; el juego usa el último. El
  software de IA desbloquea tipos de toma (sección 4.4).
- Misiones: **tablero de pedidos** en el taller.

**Abiertas:**

- ¿Estilo visual? (low-poly "rústico" como el juego actual, o más realista)
- ¿Cuánto dura una partida hasta la IA? ¿Cuántas misiones por etapa?
- ¿El jugador puede diseñar el chasis (largo de brazos, forma) o solo elegir modelos?
- Nombre del juego (por ahora: **Dron Maker**).

## 8. Números del juego (primera versión)

Datos: `app/data/piezas.json` (piezas) y `app/data/misiones.json` (pedidos). Cálculo:
`app/parts.js`. Pruebas: `node app/test_parts.mjs`.

### Piezas → física

| Número | Fórmula |
|---|---|
| masa | base 50 g + chasis + 4 × motor + hélices + batería + controladora + cámara + extras |
| empuje | 4 × empuje del motor × f_hélice × (celdas / celdas máx. del motor)² (× 0.85 si es Li-ion) |
| f_hélice | más chica que la del motor: (d/ref)²; más grande: (d/ref)^0.5 |
| empuje/peso | empuje ÷ masa (en gramos) |
| arrastre | chasis + cámara + extras |
| inclinación máx. | la controladora (30° básica, 35° las demás) |
| respuesta | controladora × (5/d)^0.7 × √(empuje/peso ÷ 2.5) (recortado a 0.6-1.2) |
| giro (yaw) | 180°/s × giro del motor × el mismo factor |
| choque | `aguante_ms` del chasis (madera 3 m/s … carbono 5 m/s) |
| batería (Wh) | celdas × 3.7 V × mAh / 1000, se usa el 80 % |
| potencia para flotar | masa (g) ÷ eficiencia del motor (g/W) × (d/ref)^0.6 |
| potencia con gas g | potencia de flotar × (g / gas de flotar)^1.5 |
| minutos (flotando) | Wh usable ÷ potencia de flotar × 60 |
| velocidad máx. | √(m·g·tan(a) ÷ arrastre), a = mín(inclinación máx., acos(1 / empuje/peso)) |

No se puede armar si: la hélice no cabe en el chasis, la batería tiene más celdas de las que aguanta
el motor (se quema) o menos de las que necesita, o empuje/peso ≤ 1.05 (no despega).

### Drones de ejemplo (calculados)

| Dron | Masa | Empuje/peso | Min. flotando | Vel. máx. | Costo |
|---|---|---|---|---|---|
| Rústico: madera, motores reciclados, 3S 1300, cámara de juguete | 627 g | 1.9 | 4.4 | 8.4 m/s | $91 |
| El mismo con batería 2S | 567 g | 0.9 | — | no despega | $76 |
| PLA + 2204 + barómetro + cámara de acción | 530 g | 3.6 | 5.9 | 9.7 m/s | $226 |
| Negocio: aluminio + 2306 + 4S + GPS + 4K | 709 g | 5.6 | 7.5 | 11.6 m/s | $486 |
| Carreras: carbono 5" + 2207 + 4S | 568 g | 8.8 | 10.3 | 12.2 m/s | $456 |
| Cine: carbono 7" + 2806 + Li-ion 4S + gimbal | 933 g | 5.1 | 17.1 | 13.3 m/s | $870 |

(Los minutos son flotando; volando rápido se gastan antes porque la potencia crece con el gas.)

### Pedidos, calificación y plata

- **Antes de aceptar** un pedido el taller revisa: cámara ≥ `calidad_min`, vel. máx. ≥ 1.3 × vel.
  del sujeto, minutos de batería ≥ `grabar_s` + ida y vuelta.
- **Puntaje** de la toma (0-100) = 50 % encuadre (tiempo con el sujeto cerca del centro, a la
  distancia y altura pedidas) + 30 % estabilidad (sin sacudidas; el gimbal quita el 70 %) + 20 %
  calidad de la cámara.
- **Estrellas:** < 40 → 0★, 40-64 → 1★, 65-84 → 2★, ≥ 85 → 3★.
- **Pago** = pago del pedido × [0, 0.5, 1.0, 1.3] según estrellas. **Reputación** [−1, 0, +1, +2].
- **Daños:** si el golpe supera `aguante_ms`, cada pieza pierde (velocidad − aguante) × 15 /
  durabilidad × 100 % de vida. A 0 % se rompe. Reparar = precio × % perdido × 0.6.
- **Inicio:** $100. El rústico cuesta ~$91. Los pedidos de etapa 1 pagan $30-60, y un dron de etapa
  2 cuesta ~$230-490: unos 6-10 pedidos para el salto.
