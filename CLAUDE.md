# Dron Maker — guía para Claude Code

Claude Code lee este archivo solo al abrir una sesión en esta carpeta. Es el resumen operativo.

| Para… | Lee |
|---|---|
| **qué juego vamos a hacer** (la idea, el ciclo, las etapas, los hitos) | [`docs/PLAN_JUEGO.md`](docs/PLAN_JUEGO.md) |
| **la campaña**: capítulos, misiones, qué piezas y qué entrenamiento pide cada una | [`docs/HISTORIA.md`](docs/HISTORIA.md) |
| **cómo funciona la base que ya existe** (modelo, Blender, juego web) | [`docs/PROYECTO.md`](docs/PROYECTO.md) |
| la historia día a día del proyecto base (bitácora, experimentos) | [`docs/README_drone-rl.md`](docs/README_drone-rl.md) |
| **el lenguaje PBDMM** del modo desarrollador (se genera desde `app/data/pbdmm.json`) | [`docs/PBDMM.md`](docs/PBDMM.md) |

## La idea

Un **juego 3D en el navegador** de construir y volar drones. Empiezas en un garaje con piezas
rústicas (chasis de madera, motores baratos, cámara de juguete), ganas plata vendiendo drones y
grabando videos con ellos, compras mejor equipo y, en un punto del juego, **entrenas una IA** para
tener varios drones autónomos grabando desde distintos ángulos. A futuro, **entregas de paquetes**.

La base ya existe: este proyecto viene de `drone-rl` (un simulador de dron con una IA que aprendió a
volar sola con aprendizaje por refuerzo, un laboratorio en Blender y un juego web con Three.js). El
juego nuevo se construye **encima** de eso, en el navegador.

**Ya se puede jugar el primer tramo** (`app/`): menú de entrada, garaje con $150, armar el dron de
madera, el primer pedido (grabar una casa), batería, video `.webm`, estrellas, plata y daños. La IA
puede grabar el pedido ("Que grabe la IA") con el último modelo que Santiago entrene en el nivel
**11 · Grabar** del Drone Lab con el dron **Madera**.

## Con quién trabajas

- **Santiago** (ingeniero embedded / QA). Proyecto propio, de aprendizaje y de portafolio.
- Háblale **en español, casual y directo**. Respuestas cortas. El juego también va en español.
- Cuando algo falla, quiere un **diagnóstico preciso con números** (medir, no adivinar).
- Le gusta entender el porqué: explica qué cambiaste y qué tiene que hacer él.
- **Él da la idea; tú decides el resto** (diseño, economía, UI, cómo organizar y mostrar las cosas)
  **sin preguntarle**. Cuenta en corto qué decidiste. Si algo no le gusta o tiene ideas, te lo dice.
  Pregunta solo cuando necesites algo de él (una acción en su máquina, algo irreversible).
- **No entrenes la IA por tu cuenta.** Él entrena en el Drone Lab de Blender y quiere ver el
  desarrollo. Puedes *evaluar* el modelo (correr episodios y medir) y hacer pruebas de código, pero
  no lanzar entrenamientos ni sobrescribir `models/modelo.zip`.
- Git: rama `main`; remoto público en GitHub (cuenta personal **Sagaz0501**, repo `dron-maker`). Commits con
  el nombre y el correo personales de Santiago (configurados en el repo; no el del trabajo). No hagas push sin que lo pida.

## Mapa

```
docs/              PLAN_JUEGO.md (el juego nuevo), PROYECTO.md (la base), README_drone-rl.md (historia)
app/               EL JUEGO (Dron Maker): usa los módulos de game/
  main.js          pantallas: inicio, garaje, pedidos, briefing, HUD, resultado
  partida.js       la partida v3 (localStorage): plata, reputación, INVENTARIO de unidades (cada pieza comprada,
                   con su vida), el HANGAR (varios drones: nombre, propósito, piezas, banco, su IA), daños, cobrar.
                   Migra las v1/v2 (un dron) y deja respaldo en localStorage "dronmaker.partida_v2"
  banco.js         el banco de armado (lógica, sin pantalla): componentes y pines, cableado del manual, revisar()
                   (qué se quema / no funciona / falta), firmwares, orden y sentido de motores, estado() = pasos
                   test: node app/test_banco.mjs
  ui_banco.js      la pantalla del banco: imprimir (forma, tu STL, carcasa, descargar STL), armar (animación),
                   mesa de cableado (SVG), prueba de humo, programar (flashear, calibrar, puertos, radio, motores, IA),
                   hélices, prueba atada
  tienda.js        tienda por categorías con cantidades + carrito, inventario (vender usado), importar STL
  stl.js           leer STL (binario/ASCII), volumen -> peso impreso, puntas de los brazos -> motores, exportar STL
  parts.js         piezas -> física (masa, twr, drag…) + batería y vel. máx.   test: node app/test_parts.mjs
  dron3d.js        el dron en 3D armado con sus piezas (formas, tu STL, carcasa, cables, piezas "fantasma" sin instalar)
  garaje.js        la escena del garaje + el banco: impresora 3D, portátil con USB, animaciones (instalar, chispas,
                   humo, motores girando, prueba atada, la caja del pedido) y los sonidos (sintetizados)
  vuelo.js         un vuelo: física del dron armado, batería, cámara del dron, grabar, calificar, IA
  casa.js          la casa (mismas cajas que level.py house_boxes), las rutas de las tomas (RutasView, tomasPedido)
  lugares.js       los lugares de los pedidos: casa, finca (viento), restaurante (postes): colisiones + cómo se ven
  data/            piezas.json (catálogo con ESC, radio, montaje, extras, herramientas, estilo), misiones.json
                   (capítulos + pedidos = guion de tomas + requisitos + cómo entrenar), entrenamiento.json (laboratorio)
  exportar_dron.mjs  un dron del juego -> drones/<nombre>.json (para entrenar con su física)
  pbdmm.js         MODO DESARROLLADOR: el lenguaje PBDMM (subconjunto de Python interpretado en JS, sin import/while,
                   con límite de operaciones) y compilar(): programa -> pedido de /api/lab + hooks (al_empezar,
                   cada_generacion(e), al_terminar). test: node app/test_pbdmm.mjs
  estudio.js       el Estudio PBDMM (editor con colores, terminal con comandos, ayuda, lecciones, gráfica en vivo);
                   lee GET /api/lab cada 1,5 s y llama los hooks. Programas en localStorage "dronmaker.pbdmm.archivos"
  autocompletar.js el autocompletado del editor PBDMM: contexto(texto antes del cursor) + opciones() (las fijas en
                   data/pbdmm.json "opciones"; $drones/$misiones/$modelos/$premios salen del juego). Pruebas en test_pbdmm
  doc_pbdmm.mjs    genera docs/PBDMM.md desde data/pbdmm.json (ayuda, comandos, lecciones, ejemplos)
drones/            madera.json (el dron del kit) y rango_juego.json (física al azar: --dron azar)

Laboratorio de IA (pantalla del juego) -> entrenar en Blender:
  app (POST /api/lab) -> scripts/jugar.py -> models/lab_pedido.json (+ drones/mi_dron.json, el dron del jugador)
  -> drone_lab.py (vigilante cada 1 s: cambia nivel/dron/premios y da Iniciar) -> live_train.py
  Blender escribe models/lab_estado.json (vivo; "estado": esperando|iniciando|entrenando|deteniendo|error, "error",
  "pedido" = id del último pedido leído, "pedido_txt"); el entrenador models/entrenando.json (progreso).
  POST /api/lab responde con el "id" del pedido: el juego sabe cuándo Blender lo leyó.
  Grabar en Blender: el mensaje "l" trae "film" (sujeto, zona, casa) y "f" trae "q"/"fg" por dron (cono de la
  cámara rojo→verde según film_quality, aro que se llena con la toma). Historia: [gen, pasos, éxito, choque, nivel, calidad].
  Puertos del Drone Lab: 9011/9012 (DRONMAKER_LAB_PORTS="9021,9022" para probar sin chocar con el que está abierto).
  Premios recomendados por misión: app/data/entrenamiento.json. La partida del navegador se copia en partida.json.
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
  jugar.py         servidor local: http://localhost:8765/app/ (el juego) · --arena: /game/
  live_train.py    el entrenador del Drone Lab (PPO + UDP con Blender) · --dron drones/madera.json | azar
  export_policy.py, evaluate.py, train.py
blender/           drone_lab.py (laboratorio de IA), laboratorio.blend, bodega.blend, escenas 3D
models/            modelo.zip (la IA "base"), modelo.json (su historia), modelo_web.json (pesos para el navegador)
                   publico/ = copia fija de la IA base que va en el repo (jugar.py la copia si falta models/modelo.zip)
                   drones/<slug>/ el modelo de cada dron del hangar (mismos archivos) · _papelera/
stl/               los STL que importa el jugador (index.json + <id>.stl), fuera de git
tests/             pytest
```

## Comandos

```bash
source .venv/bin/activate              # Python 3.13 (se crea con: python3 -m venv .venv && pip install -r requirements.txt)
python scripts/jugar.py                # servidor + abre el juego (app/); --arena abre game/
python -m pytest -q                    # pruebas del simulador (Python) y del servidor (modelos por dron, STL)
python game/make_fixture.py && node game/test_sim.mjs    # JS == Python ("Todo igual que Python.")
node app/test_parts.mjs                # piezas -> física
node app/test_banco.mjs                # banco de armado + partida v3 (migra la partida.json si existe)
node app/test_pbdmm.mjs                # el lenguaje PBDMM (intérprete, errores, compilar los ejemplos)
node app/doc_pbdmm.mjs                 # vuelve a escribir docs/PBDMM.md si cambias app/data/pbdmm.json
node app/exportar_dron.mjs             # vuelve a escribir drones/madera.json si cambian las piezas
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
3. **Las 38 entradas de la red tienen un orden fijo** (`drone_rl/sensing.py` → `build_obs`, tabla en
   `docs/PROYECTO.md`; 27-29 sujeto, 30-33 toma, 34-37 física del dron). Entradas nuevas van **al
   final**. Un modelo con menos entradas sigue funcionando (la red usa las primeras) y el entrenador
   lo amplía solo (`upgrade.py`, con copia en `models/anteriores/`).
4. **Un modelo de IA por dron:** cada dron del hangar tiene el suyo en `models/drones/<slug>/`
   (`modelo.zip`, `modelo.json`, `modelo_web.json`; + `entrenando.json/.log` si entrena en el fondo).
   El slug `"base"` = los archivos de siempre (`models/modelo.zip` …). Un dron nuevo parte de una copia
   del base, de otro dron o de cero (`base_de`); nunca se toca el original. `live_train.py --model` escribe
   todo en la carpeta del modelo (`--estado` = progreso). El juego puede entrenar en Blender (uno) o en el
   fondo (`"donde": "fondo"`, jugar.py lanza live_train sin Blender; máx. 2). API en el docstring de
   `scripts/jugar.py` (`/api/lab`, `/api/modelos`, `/api/modelo`, `/api/stl`). Cada modelo sabe qué drones
   vuela por `meta.rango_fisica` (lo escribe `live_train.py` según `--dron`); el juego lo lee para avisar si
   el dron del jugador está fuera de lo que conoce. Borrar = mover a `models/drones/_papelera/`.
5. **Datos del juego en JSON** (`app/data/`): piezas, misiones, clientes. Balancear = editar números.

## Estado

- **Base (M0) lista:** simulador, IA entrenada, juego web con 4 mundos, editor de rutas, pilotear a
  mano (ratón + teclado + control), 6 cámaras (incluida FPV), HUD con las palancas y los sensores,
  modo caza (pájaros que huyen), récords.
- **Modelo copiado aquí:** generación 2120 (copia del 14-10-2026). El entrenamiento de Santiago
  sigue corriendo en `~/Documents/drone-rl`; para entrenar desde esta carpeta, en el panel Drone Lab
  cambia *Proyecto* y *Python* a esta carpeta y su `.venv`.
- **Hangar, tienda y banco (15-10-2026):** varios drones, cada uno con nombre, propósito y su propia IA
  (`models/drones/<slug>/`, entrenable en Blender o en segundo plano, hasta 2 a la vez). Tienda por categorías
  con cantidades; inventario por unidades. Para volar, cada dron pasa por el banco: imprimir (forma o STL
  propio) -> armar -> cablear (cortos y piezas quemadas de verdad) -> prueba de humo -> firmware -> configurar
  -> motores -> hélices -> prueba atada (+ cargar su IA). Herramientas nuevas: probador de humo y multímetro.
  Siguiente idea: un video con varios drones a la vez (multi-cámara).
- **Juego nuevo (`app/`):** campaña por capítulos (`docs/HISTORIA.md`). Jugables: 1 casa, 2 finca (viento
  2,5 m/s, radio, empuje/peso), 3 restaurante (protectores, cámara ≥ 50; IA con ToF). Catálogo con nombres
  reales (ESP32, STM32F405/F722/H743, ExpressLRS, BLHeli_32…), ESC que limita el empuje, radio con
  failsafe, vibración → nitidez del video, pintura y forma del chasis (impresora 3D). Los demás pedidos
  están planeados ("Próximamente"). Siguiente: concesionario (tomas bajas) y la toma **seguir** (nivel 13).
- **Modo desarrollador + PBDMM (15-10-2026):** al empezar partida se elige normal (la campaña) o desarrollador
  (todo abierto, $99999, 2 drones armados: "Madera (dev)" y "Cine (dev)"; `PT.nuevaPartidaDev`). El desarrollador
  crea modelos con el **Estudio PBDMM**: `modelo(…, desde=)`, `red(capas=)`, `mision/nivel`, `dron`, `drones`,
  `entrenar_en("fondo"|"blender")`, `premios`, `aprendizaje(lr, exploracion)` + hooks; terminal: correr, estado,
  modelos, info, pausar/seguir/detener, copiar/renombrar/borrar, blender, volar. Backend: `/api/lab` acepta `lr`,
  `ent`, `capas` (-> info.json; `live_train.py --capas` o la lee de ahí) y `accion: "guardar"`; `/api/modelos` trae
  `red`, `ultimo` (última fila de la historia) y `mejor_exito`. "Que grabe la IA" ya no se bloquea: vuela con la IA
  del dron (o la base), se carga sola, y si no entrega el video cuesta 2 de reputación.
- **Nivel 12 · Grabar entre postes**: como el 11 con postes a 1,5 m de la ruta (`level.film_posts`).
- **Nivel 11 · Grabar: tomas con ruta** (`env.py`, `tomas.py`, `missions.json`, Drone Lab): una casa al azar y
  una toma al azar (fija, órbita, revelar). La toma es una RUTA: llegar al inicio y seguir el punto de cámara con
  la casa al centro. Calidad estricta = encuadre × seguimiento × ritmo × estable (`sensing.film_quality` =
  `sim.js filmQuality`; `tomas.Toma` = `sim.js Toma`). Un piloto PD que sigue la ruta saca 0,7-0,9.
- El pedido de la casa es un guion de 3 tomas (`app/data/misiones.json`), cada una se califica aparte.

## Problemas conocidos

- **El juego se ve vacío / los botones no hacen nada:** Chrome con la aceleración por hardware
  apagada (WebGL falla). `chrome://settings/system` → activar → reiniciar Chrome. Safari funciona.
- `scripts/jugar.py` exporta `modelo_web.json` desde el zip si hace falta: necesita el `.venv` con
  PyTorch. Sin eso, el juego usa el `modelo_web.json` que haya.
- Si el puerto 8765 ya lo usa el servidor de `~/Documents/drone-rl`, `jugar.py` abre ESE (otro
  proyecto, sin `app/`). Ciérralo o usa `--port 8766`.
