# Neural Drone Forge (Dron Maker) — guía para Claude Code

Claude Code lee este archivo solo al abrir una sesión en esta carpeta. Es el resumen operativo.

| Para… | Lee |
|---|---|
| **el plan maestro**: en qué fase vamos, la historia completa en 5 actos, misiones y recompensas, gráficos, la app de escritorio (manda sobre los demás si chocan) | [`docs/PLAN_MAESTRO.md`](docs/PLAN_MAESTRO.md) |
| **qué sigue: el roadmap paso a paso** (fases, ideas de Santiago anotadas como 📝) | [`docs/ROADMAP.md`](docs/ROADMAP.md) |
| cómo se juega (para el jugador) · cómo se conecta todo (para quien programa) | [`docs/GUIA.md`](docs/GUIA.md) · [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md) |
| **qué juego vamos a hacer** (la idea original, el ciclo, las etapas) | [`docs/PLAN_JUEGO.md`](docs/PLAN_JUEGO.md) |
| **la campaña**: capítulos, misiones, qué piezas y qué entrenamiento pide cada una | [`docs/HISTORIA.md`](docs/HISTORIA.md) |
| **cómo funciona la base que ya existe** (modelo, Blender, juego web) | [`docs/PROYECTO.md`](docs/PROYECTO.md) |
| la historia día a día del proyecto base (bitácora, experimentos) | [`docs/README_drone-rl.md`](docs/README_drone-rl.md) |
| **el lenguaje PBDMM** del modo desarrollador: la API (se genera desde `app/data/pbdmm.json`) · la documentación completa (tutorial, referencia, gramática, biblioteca, errores; a mano: si cambias `pbdmm.js`, actualízala) · el plan de PBDMM 2 | [`docs/PBDMM.md`](docs/PBDMM.md) · [`docs/pbdmm/`](docs/pbdmm/README.md) · [`docs/PBDMM2_PLAN.md`](docs/PBDMM2_PLAN.md) |
| **la plata**: de dónde sale y a dónde va, los precios, el camino de la demo con su libro de caja (`node app/test_economia.mjs`) | [`docs/ECONOMIA.md`](docs/ECONOMIA.md) |
| **el negocio**: clientes que escriben al celular, trabajos repetibles ★–★★★★, tipos de trabajo, tutorial del día 1 | [`docs/NEGOCIO.md`](docs/NEGOCIO.md) |
| **la carrera del taller**: todo desde el computador, personas, pedidos chicos y misiones grandes, entregas, retos, ventas, calendario, misiones manuales; modelos reales | [`docs/PLAN_CARRERA.md`](docs/PLAN_CARRERA.md) |
| **cuánto tarda cada escenario E1-E12 y qué premios funcionan** (entrenado y medido; de aquí salen las pistas ⏱️ de los programas) | [`docs/ENTRENAMIENTO_PROBADO.md`](docs/ENTRENAMIENTO_PROBADO.md) |
| **el armado de verdad** (Fase 2): la mesa, soldar con la estación, atornillar, la guía aparte, la batería; las piezas 3D hechas por script en Blender (`blender/piezas/` → `app/modelos/*.glb`) | [`docs/ARMADO_PLAN.md`](docs/ARMADO_PLAN.md) |

## La idea

**Nombre del producto: Neural Drone Forge** ("Arma el dron. Entrena su cerebro. Míralo aprender a volar.").
"Dron Maker" es el taller dentro del juego y el nombre de la carpeta. Se vende como videojuego: la **IA es la
protagonista** (Santiago: las misiones se prueban con el modelo entrenado). README + docs/ son la cara pública.

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
- Git: rama `main`; remoto público en GitHub: **Sagaz0501/neural-drone-forge** (cuenta personal: push con esa cuenta). Commits con
  el nombre y el correo personales de Santiago (configurados en el repo; no el del trabajo). No hagas push sin que lo pida.

## Mapa

```
docs/              PLAN_JUEGO.md (el juego nuevo), PROYECTO.md (la base), README_drone-rl.md (historia)
app/               EL JUEGO (Dron Maker): usa los módulos de game/
  main.js          pantallas: inicio, garaje, pedidos, briefing, HUD, resultado
  negocio.js       EL NEGOCIO (docs/NEGOCIO.md): días, pedidos repetibles desde plantillas con dificultad 1-4, clientes,
                   relación, recomendaciones, arriendo, pedidos especiales, tutorial (pasoTutorial). Sin pantalla.
                   partida.negocio. test: node app/test_negocio.mjs
  celular.js       la pantalla del celular: chats, tarjetas (aceptar, ¿qué me falta?, volar), terminar el día
  requisitos.js    qué pide un pedido/misión y si un dron cumple (briefing, celular y PBDMM revisar usan este)
  ruta.js          la ruta del programador (PBDMM 2): 1 capítulo por dron creado en modo dev, retos medidos solos; partida.ruta
  partida.js       la partida v3: un ARCHIVO por partida (jugar.py partidas/<id>.json; $DRONMAKER_DATOS/partidas en la app
                   instalada) + la que juegas en localStorage; 📂 Partidas en el inicio (jugar, renombrar, exportar, importar,
                   borrar = papelera + sus IA); sus programas .pbd van adentro (p.pbdmm). plata, reputación, INVENTARIO de unidades (cada pieza comprada,
                   con su vida), el HANGAR (varios drones: nombre, propósito, piezas, banco, su IA), daños, cobrar.
                   Migra las v1/v2 (un dron) y deja respaldo en localStorage "dronmaker.partida_v2"
  taller.js        EL OFICIO (lógica, sin pantalla): envíos (las piezas llegan en caja: hoy, mañana o en 2 días; u.caja,
                   u.llega), tornillos (mantener hasta el clic; si sigues, se barre la rosca), soldar (estación que calienta,
                   punta que se ensucia, flux, estaño que solo moja si el pad está caliente) -> junta buena/fría/puente/
                   levantado en d.banco.juntas; efectivos() = el cableado que conduce. test: node app/test_taller.mjs
  tutorial.js      EL TUTORIAL del primer dron (los dos modos, obligatorio): p.tuto.etapa = regalo -> nombre -> armar (computador
                   cerrado, negocio.espera: nadie escribe) -> pc (comprar Mensajes + Simulador/IDE en 🛍️ Apps) -> modelo (nivel 13 ≥ 80 % SIN ruido: candidatosFoto
                   + GET /api/evaluar = 20 intentos fijos con la red tal cual; si no hay servidor, exitoFoto con "recientes") -> cliente (NG.primerCliente: Doña Marta).
                   notas(p, contexto) = la nota del paso + consejos
  notas.js         el tutorial es un BOTÓN 🎯 «¿Qué sigo?» arriba a la derecha que se abre y se cierra (el paso nuevo se asoma 6 s
                   y se guarda); lo que hay que tocar brilla siempre. POCO TEXTO: una línea que dice qué tocar (pedido de Santiago).
                   main.js notasTutorial cada 0,5 s; la mesa señala el pad con un aro amarillo y la herramienta de la bandeja
  software.js      EL SOFTWARE del computador (data/software.json): de fábrica solo 🛍️ Apps y 🛒 Tienda; se compran 💬 Mensajes,
                   🧠 Simulador de IA (normal: Laboratorio + Simuladores) o 💻 IDE (dev: IDE, docs, monitor, simuladores),
                   Calendario, Finanzas, Campaña, Videos, 🖼️ Fondos. p.software (sin él = partida vieja = todo). Ajustes y el
                   banco van en la barra de tareas (del sistema). El tutorial "pc" = comprar Mensajes + Simulador/IDE
  freestyle.html   EL FREESTYLE (página aparte, botón en el inicio): freestyle.js = modos (libre, carrera contra la IA,
                   contrarreloj, persecución), tu dron en 4 modos: Fácil (sim.js, como la IA) o Angle/Horizon/Acro como una radio
                   (SOLO aquí: la IA nunca los ve; rates Betaflight, propwash, timer de batería) con 2 SENSACIONES por control
                   (RA.sensacionDe, perfil.sensacion): Juego (mando/teclado por defecto: gas al centro = flotar, se arma solo,
                   rates de mando PRESETS_JUEGO, Acro suave que se endereza, teclado en rampa) y Real (radio USB: gas absoluto,
                   armar con el gas abajo); radio.js = la lógica pura (rates, gas, calibración, perfiles, armar, pasoRadio = el
                   cuerpo de esos 3 modos; test_radio.mjs) y radio_ui.js =
                   🎮 Radio (radios USB EdgeTX/TBS como joystick: asistente que calibra y detecta cada canal, asignar, invertir,
                   zona muerta, Modo 1/2, rates con su curva) + las palancas en el HUD; cfg.radios[id del control] en localStorage,
                   los rivales con su red (sim.js step/buildObs/sensorRays + Policy; modelos corredor = nivel 16, cazador = 18),
                   HUD, minimapa, sonido, récords en localStorage "dronmaker.freestyle"; freestyle_mapas.js = los 3 mapas (solo
                   datos: cajas/cilindros/esferas + portales con TRAMOS recta/picada/splits/hueco/cerrada y M.dirs + lineaCarrera;
                   test: node app/test_freestyle.mjs revisa que la pista y la línea queden libres y que cada tramo sea lo que dice);
                   freestyle_vista.js = texturas en canvas con relieve, color por vértice (sombra abajo), cielo con nubes/estrellas,
                   mapa de entorno (PMREM), deco animada (humo, agua, público, pantalla, luces de largada), InstancedMesh, bloom;
                   freestyle_camaras.js = la intro que vuela la pista antes de la cuenta, la cámara de atrás y la repetición
                   (el fantasma con cámaras de tele). 🎮 Volar mientras entrena (Laboratorio y barra del computador): volar.js
                   abre el freestyle en un iframe encima del juego (el entrenamiento sigue en el servidor; el garaje no se dibuja
                   y el reloj del negocio no corre); adentro, una insignia lee GET /api/lab (generación y éxito)
  dialogo.js       confirmar() / pedirTexto(): los diálogos del juego (NO usar confirm/prompt/alert del navegador)
  escenarios.js    LOS SIMULADORES (lógica): comprar en orden, qué misiones/funciones abren (disponibles), iaPuede
  mesa.js          LA MESA DE TRABAJO (3D, su propio canvas): abrir cajas; montar cada pieza con su PROCEDIMIENTO (taller.js:
                   arrastrar al fantasma y girar con R, voltear el dron, tornillos por abajo/de lado, separadores, tuercas,
                   gomas, correa; el orden = taller.js MONTAJE, lo de arriba tapa; desmontar); soldar: el cautín es el ratón y
                   la OTRA MANO se toma de la BANDEJA 3D a la derecha de la placa (jeringa de flux: tocas el pad y queda la gota;
                   estaño: Espacio; bomba: Espacio chupa; malla; esponja = limpiar; atajos F/E/X/M/C; M.mano2), enchufar el
                   arnés, multímetro (T); NO avisa
                   si una junta salió mal. Gasta p.insumos (estaño, flux, cable, malla: PT.gastar); el cautín = PT.cautinDe
  modelos3d.js     las piezas hechas en Blender (blender/piezas/*.py -> app/modelos/*.glb: ESP32, ESC 4 en 1, ESP32-CAM,
                   motores, baterías, el chasis de madera del kit con su tapa): precargar() al abrir; dron3d/mesa/tienda piden modelo(nombre) y si es null dibujan cajas
  miniaturas.js    las fotos de la tienda: cada pieza dibujada una vez en 3D (dron3d.js, los GLB de Blender), en cola
  banco.js         el banco de armado (lógica, sin pantalla): componentes y pines, cableado del manual, revisar()
                   (qué se quema / no funciona / falta), firmwares, orden y sentido de motores, estado() = pasos
                   test: node app/test_banco.mjs
  ui_banco.js      la pantalla del banco: imprimir (forma, tu STL, carcasa, descargar STL), armar (animación),
                   mesa de cableado (SVG), prueba de humo, programar (flashear, calibrar, puertos, radio, motores, IA),
                   hélices, prueba atada
  tienda.js        la tienda virtual (🛒 DronMarket): secciones, tarjetas con foto y barras de stats, detalle que compara con
                   tu dron, canasta (envío, saldo); inventario (vender usado, insumos), importar STL
  stl.js           leer STL (binario/ASCII), volumen -> peso impreso, puntas de los brazos -> motores, exportar STL
  parts.js         piezas -> física (masa, twr, drag…) + batería y vel. máx.   test: node app/test_parts.mjs
  dron3d.js        el dron en 3D armado con sus piezas (formas, tu STL, carcasa, cables, piezas "fantasma" sin instalar)
  garaje.js        la escena del garaje + el banco: impresora 3D, portátil con USB, animaciones (instalar, chispas,
                   humo, motores girando, prueba atada, la caja del pedido) y los sonidos (sintetizados)
  mision_sim.js    un vuelo SIN pantalla (física del dron armado, batería, radio, tomas, calificación, IA): la flota
  vuelo.js         el mismo vuelo con pantalla (class Vuelo extends MisionSim): 3D, cámara del dron, grabar video, fotos
  flota.js         LA FLOTA: los pedidos asignados a un dron (pe.flota) los vuela su IA al terminar el día (mision_sim)
                   test: node --import ./app/three_node.mjs app/test_flota.mjs (three_node.mjs = "three" en Node)
  simulacion.js    el visor de grabaciones (Avance del modelo / Simular prueba): escena, recorrido, cámaras, gráficas
  ui_sim.js        su pantalla (pestañas mejor/peor, línea de tiempo, cámaras, red del instante)
  redviz.js        dibujar una red neuronal en un canvas (Estudio y visor)
  casa.js          la casa (mismas cajas que level.py house_boxes), las rutas de las tomas (RutasView, tomasPedido)
  lugares.js       los lugares de los pedidos: casa, finca (viento), restaurante (postes): colisiones + cómo se ven
  data/            clientes.json + trabajos.json (el negocio: clientes, mensajes, plantillas, dificultades)
                   piezas.json (catálogo con ESC, radio, montaje, extras, herramientas, estilo), misiones.json
                   (capítulos + pedidos = guion de tomas + requisitos + cómo entrenar), entrenamiento.json (laboratorio)
  exportar_dron.mjs  un dron del juego -> drones/<nombre>.json (para entrenar con su física)
  pbdmm.js         MODO DESARROLLADOR: el lenguaje PBDMM (subconjunto de Python interpretado en JS, sin import/while,
                   con límite de operaciones) y compilar(): programa -> pedido de /api/lab + hooks (al_empezar,
                   cada_generacion(e), al_terminar). test: node app/test_pbdmm.mjs
  estudio.js       el Estudio PBDMM: un COMPUTADOR con apps en ventanas (IDE, Documentación, Mensajes/Tienda/Inventario =
                   las pantallas del juego metidas en una ventana (alojar), Simuladores, Finanzas = p.movimientos; layout en
                   localStorage "dronmaker.pbdmm.escritorio") y una barra de tareas;
                   lee GET /api/lab cada 1,5 s y llama los hooks. Programas en localStorage "dronmaker.pbdmm.archivos"
  casino.js        APAGADO (20-10-2026, Santiago no lo quiere: software.json "oculto": true) · EL CASINO (app gratis 🎰 de 🛍️ Apps, pedido de Santiago 19-10-2026): Blackjack, Video póker (Jacks or
                   Better 9/6) y Mayor o menor; lógica pura con rng inyectable, apuestas de $1 a $50 (máx. 25 % de la plata),
                   todo anotado en Finanzas. Pantalla: casino_ui.js (ventana #es-casino del computador). test: node app/test_casino.mjs
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
  liebre.py        nivel 18 · Persecución: el blanco que corre (en el juego, el jugador). level.py race_track/delivery_level = 16/17
  physics.py       física del quad (QuadParams: masa, empuje/peso, arrastre…) + viento
  level.py, sensing.py, env.py, birds.py, runtime.py, upgrade.py, controller.py, missions.json
scripts/
  jugar.py         servidor local: http://localhost:8765/app/ (el juego) · --arena: /game/
  simulacion.py    grabaciones de pruebas: simular() (Simular prueba) y Avance (el mejor y el peor, desde live_train)
  live_train.py    el entrenador del Drone Lab (PPO + UDP con Blender) · --dron drones/madera.json | azar
  export_policy.py, evaluate.py, train.py
blender/           drone_lab.py (laboratorio de IA), laboratorio.blend, bodega.blend, escenas 3D
models/            modelo.zip (la IA "base"), modelo.json (su historia), modelo_web.json (pesos para el navegador)
                   publico/ = copia fija de la IA base que va en el repo (jugar.py la copia si falta models/modelo.zip)
                   drones/<slug>/ el modelo de cada dron del hangar (mismos archivos) · _papelera/
                   RESERVADOS (jugar.py: corredor, cazador = rivales del freestyle; fotografo, repartidor = pruebas):
                   el jugador no los ve, no los entrena ni parte de ellos (DRONMAKER_INTERNO=1 = Santiago sí)
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
node app/test_pbdmm.mjs                # el lenguaje PBDMM (intérprete, errores, ejemplos, PBDMM 2, la ruta)
node app/test_taller.mjs               # el oficio: envíos, tornillos, soldar, cómo cuenta cada junta en el cableado
node app/test_negocio.mjs              # el negocio (clientes, días, pedidos, tutorial, flota) y requisitos.js
node app/test_economia.mjs [-v]        # la plata de la demo: E3-E6 + el 2.º dron en ≤ 5 días con 1 ★ (40 partidas); -v = libro de caja
node --import ./app/three_node.mjs app/test_flota.mjs   # la flota y el vuelo sin pantalla (vuelos de verdad con la IA base)
node app/test_i18n.mjs                 # las traducciones (cada t() con su inglés, el HTML, las capas de datos)
node app/test_modulos.mjs              # que nada importado quede tapado por una variable local
node app/test_demo.mjs           # la demo: hasta E6 + la finca (demo.js ACTIVA); el final al comprar E7/E8
node app/test_freestyle.mjs            # los mapas del freestyle: la pista libre, salida y portales adentro
node app/test_casino.mjs               # el casino: baraja, blackjack, póker, mayor o menor, la plata y la ventaja de la casa
node app/test_radio.mjs                # la radio del freestyle: rates Betaflight, curva del gas, calibración, armar, modos
node app/doc_pbdmm.mjs                 # vuelve a escribir docs/PBDMM.md y docs/pbdmm/tutorial.md si cambias app/data/pbdmm.json
node app/exportar_dron.mjs             # vuelve a escribir drones/madera.json si cambian las piezas
cd desktop && npm start                # LA APP DE ESCRITORIO (Electron): "abre el juego" = esto, no el navegador
cd desktop && npm run dist             # EL INSTALADOR: desktop/empaquetar.sh = PyInstaller (servidor.spec + scripts/lanzador.py:
                                       # el Python congelado con PyTorch CPU) + el código en build/juego + electron-builder -> dist/*.dmg
                                       # (.exe: GitHub Actions "Instaladores"). Instalada: código en los recursos (solo lectura),
                                       # datos (models/, drones/ del jugador, stl/, partidas/) en la carpeta del usuario: jugar.py datos()
                                       # Blender: el del jugador (jugar.py _buscar_blender) abre recursos/juego/blender; drone_lab.py datos_de()
cd desktop && sh actualizacion.sh      # LA ACTUALIZACIÓN sin reinstalar: el código (codigo.sh) -> dist/juego-<v>.tar.gz + actualizacion.json
                                       # (instaladores.yml los sube al release con el tag v<package.json version>). La app (actualizar.js)
                                       # los baja a <datos>/actualizaciones/<v>/ si "motor" coincide: cambiaste Electron/Python -> sube "motor"
node desktop/test_actualizar.js        # elegir qué código usar, limpiar, descartar una actualización mala
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
   fondo (`"donde": "fondo"`, jugar.py lanza live_train sin Blender; UNO a la vez en todo el juego: al iniciar otro, el anterior guarda y se detiene, `solo_uno`). API en el docstring de
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
  (`models/drones/<slug>/`, entrenable en Blender o en segundo plano, uno a la vez). Tienda por categorías
  con cantidades; inventario por unidades. Para volar, cada dron pasa por el banco: imprimir (forma o STL
  propio) -> armar -> cablear (cortos y piezas quemadas de verdad) -> prueba de humo -> firmware -> configurar
  -> motores -> hélices -> prueba atada (+ cargar su IA). Herramientas nuevas: probador de humo y multímetro.
  Siguiente idea: un video con varios drones a la vez (multi-cámara).
- **Juego nuevo (`app/`):** campaña por capítulos (`docs/HISTORIA.md`). Jugables: 1 casa, 2 finca (viento
  2,5 m/s, radio, empuje/peso), 3 restaurante (protectores, cámara ≥ 50; IA con ToF). Catálogo con nombres
  reales (ESP32, STM32F405/F722/H743, ExpressLRS, BLHeli_32…), ESC que limita el empuje, radio con
  failsafe, vibración → nitidez del video, pintura y forma del chasis (impresora 3D). Los demás pedidos
  están planeados ("Próximamente"). Siguiente: concesionario (tomas bajas) y la toma **seguir** (será el nivel 15: el 13 y el 14 son las fotos).
- **El negocio (15-10-2026, docs/NEGOCIO.md):** los clientes escriben al 📱 celular; pedidos repetibles (📷 foto,
  🔎 inspección, 🎬 video) desde plantillas (`data/trabajos.json`) con dificultad 1-4 (viento, distancia, estrellas,
  pago, plazo; los requisitos salen de la dificultad), 4 clientes (`data/clientes.json`) con relación ♥ y
  recomendaciones, días y plazos, arriendo, la campaña como pedidos especiales ⭐ por el chat, tutorial del día 1 (la foto
  de Doña Marta, guía abajo). Fotos = tomas fijas cortas; el cuadro de la cámara se guarda como foto (`vuelo.js`).
- **PBDMM 2.0 (15-10-2026):** objetos del juego (`d = dron(…)`, `dron_info`, `mision_info`, `modelo_info`, `hangar()`,
  `inventario()`; campos bilingües con `bi()`), revisión automática del dron de `dron(…)` contra la misión
  (`requisitos.js`; `entrenamiento.json` misiones: `pedido` y `requisitos_ia`), `ficha/tabla/barra/color/explicar`,
  `narrar(cada=)` + `e.cambio` + `e.diagnosticos`, más Python (rebanadas, closures, sorted…) y la ruta del programador
  (`ruta.js`, `pbdmm.json "ruta"`). Docs: `docs/pbdmm/` (tutorial generado desde la ruta).
- **v1.0 publicada (16-10-2026)**: tag `v1.0.0` y release en GitHub.
- **La flota (16-10-2026):** 🤖 A la flota en la tarjeta del pedido (un trabajo por dron); al terminar el día cada IA vuela
  su trabajo sin pantalla (`mision_sim.js`, la misma clase de la que hereda `Vuelo`) y sale el reporte en el celular.
- **Fase 1b, parte 1 (16-10-2026):** niveles **13 Foto** y **14 Set de fotos** (`drone_rl/tomas.py random_foto/random_fotos`;
  env: `self.shots` = el set, `shot_q` = la calidad de cada foto, la meta pasa a la siguiente; 30 % miran el techo) y 6
  premios nuevos en `DEFAULT_REWARD` (framing, settle, altitude, pan, overspeed, energy; en 0 por defecto). Un premio nuevo va
  en: env.py, jugar.py `REWARD_KEYS`, drone_lab.py (`REWARD_KEYS` + `rw_<k>`), entrenamiento.json (premios con `grupo`,
  `escala_premios`, las `premios` de cada misión), pbdmm.json (`alias_premios`, `alias_en.premios`, params) + capas en inglés;
  `test_reward_keys_everywhere` lo revisa. Las inspecciones del juego miran el techo (`lugares.js techo`).
- **Menús más visuales (16-10-2026):** briefing (etiquetas, fichas de tomas, requisitos con el porqué en chiquito, tarjeta
  de la IA), resultado (casillas grandes + barras por toma), Laboratorio (misiones en mosaico con `icono`, premios por grupo
  con ⓘ, los que no se usan plegados).
- **El armado de verdad (16-10-2026, Fase 2a-2c):** lo que compras llega en caja (el aluminio al otro día); en la mesa de
  trabajo (mesa.js) cortas la cinta, montas cada pieza y atornillas (mantener hasta el clic); para cablear prendes la
  estación, pones cada cable en su pad y sueldas con el cautín (ratón) + estaño (Espacio), flux (F) y limpiar (C). Las
  juntas salen buenas, frías (se pueden soltar en vuelo: mision_sim.js frias), con puente (corto) o con el pad levantado;
  la mesa no avisa (cablear queda ✓ si todo está conectado): se descubre con el multímetro o en la prueba de humo.
  Soldar gasta insumos (piezas.json "soldadura": cautines con potencia, extractor, estaño, flux, cable, malla).
  El diagrama viejo quedó como la 📄 Guía de conexión (solo mirar). Falta: la batería y el multímetro en la mesa.
- **Simuladores y PBDMM 3 (16-10-2026):** `app/data/escenarios.json` + `escenarios.js` (p.escenarios; el primero gratis):
  cada simulador abre su misión (Laboratorio, PBDMM, la IA en esos trabajos y la flota) y funciones del lenguaje ("abre").
  PBDMM 3 = el plan de vuelo (despegar, ir_a, mantener, foto, aterrizar, grabar, seguir_ruta, esquivar) -> `cfg.tarea`
  -> /api/lab "tarea" -> live_train --tarea -> env.py (foto_seg, foto_ok, fotos); queda en info.json para Simular.
  compilar() bloquea con data.bloqueadas/misionesDisponibles/planes (los tests sin esos datos no cambian).
  El 🗄️ estante (tienda.js abrirEstante) va junto al Computador; el hangar solo elige lo que tienes; el kit está en la Tienda.
- **El computador es el centro del juego (16-10-2026, los dos modos):** afuera solo el hangar (+ 💻 Computador o tocar el
  portátil); dentro, las apps (Mensajes, Calendario, Campaña, Laboratorio, Tienda, Inventario, Finanzas, Videos, Ajustes;
  + IDE, Documentación y Simuladores en el modo dev). estudio.js `abrir(app)`; el escritorio se guarda por modo.
- **El Estudio como computador (16-10-2026):** íconos de apps (IDE, Documentación, Mensajes, Tienda, Inventario,
  Simuladores, Finanzas, Banco de armado), ventanas que se mueven y una barra de tareas. Toda plata que entra o sale se
  anota con `PT.anotar(p, monto, texto)` (`p.movimientos`). Plan "perder plata" en el ROADMAP (negocio parte 2).
- **Menos texto y la tienda de apps (17-10-2026, pedido de Santiago tras probarlo con alguien sin experiencia):** el tutorial
  es un botón que se abre/cierra con una línea por paso; el banco y la mesa con textos de una línea; la bandeja de
  herramientas 3D en la mesa de soldar; el software del computador se compra (software.js).
- **La partida empieza en cero (17-10-2026, pedido de Santiago):** una partida nueva no trae NINGÚN modelo (ni la IA base
  ni los del juego) ni programas .pbd: `p.modelos` = los slugs que entrenó ella (`PT.modelosVisibles`, `PT.anotarModelo`;
  sin `p.modelos` = partida de antes = ve todos menos los reservados y vuela con la base). Sin IA propia, la IA no vuela.
  PBDMM: `desde=` es "cero" por defecto, `desde="base"` y los nombres de otra partida (`ocupados`) son error; los ejemplos
  se adaptan solos (`adaptarEjemplo`). Tutorial dev (etapa modelo): abrir el IDE → menú → ejemplo foto_fija → 👉 la línea
  dron(…) (estudio.marcar) → ▶ Correr. OJO: desde cero el nivel 13 aprende lento (sagaz_model_v1: 0 % a 20 M de pasos con
  foto_ok 0,8; el ejemplo ahora pide 0,5): falta medir cuánto tarda en llegar al 80 % del tutorial.
- **Escenarios E1-E12 y el nivel 0 (17-10-2026, pedido de Santiago tras grabar el tutorial):** NIVELES = los pedidos (0 = la
  foto de Doña Marta, el del tutorial; la campaña 1, 2, 3… en orden de misiones.json) y ESCENARIOS = dónde se entrena, de lo
  básico a lo difícil (escenarios.json "num"): E1 despegar y quedarse (nivel 19, gratis), E2 ir a un punto mirando al sujeto
  (20, gratis; también hace las fotos fáciles: "tambien"), E3 seguir una línea (21), E4 foto (13)… E12 persecución (18). Los
  números de Python NO se cambiaron (los modelos viejos siguen). Examen 🎓 por escenario en Simuladores (GET /api/evaluar,
  ≥ 80 %: p.examenes); aprobar E1-E4 + E6 = ⭐ modelo base. Un escenario parte del modelo que aprobó el anterior
  (ESC.desdePara) y REPASA lo que ese modelo aprobó (tarea.repaso -> env.py: el 20 % de los intentos; info["repaso"] no
  cuenta en el éxito). El tutorial (etapa modelo) = 🛫 E1 (ejemplo despegar) y 📍 E2 (ejemplo ir_a_punto, desde= el de
  E1; p.tuto.e1); la 1.ª vez que corre pregunta si tiene Blender (p.tuto.blender). También: la prueba de motores es un
  botón (✓/✗ por motor + Programar el orden / el sentido / Volver a soldar), los pads chicos se tocan a 22 px (flux en la
  ESP32), fuera del tutorial la placa no colorea los pines, y 3 máquinas caras (🤖 auto-atornillador, auto-conectores,
  auto-soldador; piezas.json herramientas, etapa 4-5). Falta medir cuánto tarda E1 desde cero.
- **Premios progresivos y e.examen (19-10-2026, pedido de Santiago):** cada simulador abre su programa (`pbdmm.json`
  `escenarios_codigo`, con capa en inglés): E1 lo mínimo y cada uno agrega pocas líneas `← NUEVO`. Premios por simulador
  (`escenarios.json` `premios_modo`): E1-E3 libres (los pone la misión), E4-E5 "pista" (el programa los muestra), E6-E12
  "obligatorio" (sin premios()/castigos() no corre y lo que no escribe = 0; compilar() en pbdmm.js). `e.examen` = la nota
  sin ruido (el estudio pide /api/evaluar cada 3 min): el éxito con ruido miente en la foto. `aprendizaje()` se abre en E4.
  "Que grabe la IA" y la flota ya no se bloquean si falta el simulador (solo avisan). Tiempos: docs/ENTRENAMIENTO_PROBADO.md.
- **El reloj del negocio (19-10-2026, v3.1.4):** un día despierto (7:00-23:00) = 30 min jugando; los pedidos llegan a su hora
  (negocio.agenda), vencen a las 23:00, a las 23:00 se duerme solo (flota + día nuevo). `NG.tick` cada 1 s en main.js; sin
  reloj (las pruebas) todo llega al tiro. Con 1 ★ la relación sube (si no, solo Doña Marta). docs/NEGOCIO.md «Los días».
- **Lo siguiente (docs/ROADMAP.md):** Fase 1b parte 2 (la física del dron en el entrenamiento), encargos de armado,
  pruebas de drones (QA), a mano, entregas. Decidido: el tutorial es el modo desarrollador (la demo grabada);
  imágenes y rendimiento se mejoran sobre la marcha.
- **Idiomas (15-10-2026):** español (original) + inglés. `app/i18n.js`: `t("texto en español", {vars})` (la clave es el
  español), diccionarios `app/i18n/en/<parte>.json`, capas de datos `app/data/en/*.json` (se mezclan por id/k o por
  posición), `traducirHTML()` para index.html, la elección en `localStorage["dronmaker.idioma"]` (la primera vez se
  pregunta). TODO texto nuevo visible va con t() y su traducción (`node app/test_i18n.mjs`). Plan, fases y glosario:
  `docs/I18N.md`. PBDMM es bilingüe (tabla `alias_en` en data/pbdmm.json; en compilar() los nombres en inglés son
  alias; `traducirCodigo()`; la capa data/en/pbdmm.json trae el CÓDIGO en inglés). Falta: mensajes del servidor/Blender (fase 4).
- **Fase 1 (15-10-2026):** Blender solo MUESTRA (panel de solo lectura + Modo video; el panel viejo con
  `DRONMAKER_LAB_AVANZADO=1`). Tres botones por IA: **Avance del modelo** (mejor y peor intento por nivel: live_train
  `LiveLink.grabar` -> `<carpeta del modelo>/avance.json`, `GET /api/avance`), **Simular prueba** (`POST /api/simular`:
  `scripts/simulacion.py` corre la misma prueba del entrenamiento con modelo_web.json en numpy) y Pedidos. Visor:
  `app/simulacion.js` + `app/ui_sim.js` (pantalla "sim"); la red se dibuja con `app/redviz.js` (también el Estudio).
  Pedidos al azar: `pedido.variante` (semilla nueva en cada intento) -> `lugares.js tomasVariante` + `rutaLibre`.
  "Que grabe la IA" avisa (`riesgosIA`) pero nunca bloquea.
- **Cada modo con su herramienta:** en modo desarrollador no se ve el Laboratorio (todo `abrirLab()` abre el
  Estudio) y en modo normal el Estudio no abre. Lo siguiente está en `docs/ROADMAP.md` (Fase 1: GIFs y videos,
  tutorial, misiones solo con la IA; Fase 2 📝: soldar, multímetro, piezas dañadas; Fase 3 📝: mando de PS5,
  freestyle / FPV / vuelo libre).
- **Modo desarrollador + PBDMM (15-10-2026):** al empezar partida se elige normal (la campaña) o desarrollador
  (desde el 16-10-2026 empieza IGUAL que el normal: el regalo de mamá, $150, simuladores por comprar; `PT.nuevaPartidaDesarrollador`;
  `PT.nuevaPartidaDev` = la partida con todo abierto, solo para las pruebas). El desarrollador
  crea modelos con el **Estudio PBDMM**: `modelo(…, desde=)`, `red(capas=)`, `mision/nivel`, `dron`, `drones`,
  `entrenar_en("fondo"|"blender")`, `premios(grabar=…)` y `castigos(chocar=…)` (separados: cada uno solo
  acepta los suyos, según "tipo" en entrenamiento.json; al entrenador le llegan juntos). En el juego (PBDMM y el
  Laboratorio) premios y castigos van de 0 a 10 (4 = lo normal): real = nivel/10 × `escala_premios` (entrenamiento.json,
  elegida para que lo recomendado quede en ~4); `pbdmm.js` realDe/nivelDe/recomendados. El backend sigue en valores reales, `aprendizaje(lr, exploracion)` + hooks; terminal: correr, estado,
  modelos, info, pausar/seguir/detener, copiar/renombrar/borrar, blender, volar. Backend: `/api/lab` acepta `lr`,
  `ent`, `capas` (-> info.json; `live_train.py --capas` o la lee de ahí) y `accion: "guardar"`; `/api/modelos` trae
  `red`, `ultimo` (última fila de la historia) y `mejor_exito`. La red EN VIVO (la app Simuladores del Estudio): live_train escribe
  `<estado>_red.json` (4/s: activaciones del dron que mira + conexiones fuertes por capa), `GET /api/red?modelo=`,
  y `watch: i` en `/api/lab` cambia el dron que mira (fondo o Blender).
  PBDMM también tiene variables, tuplas, `[x for x in …]`, `x if c else y`, `f(*lista, **dicc)`; el autocompletado ofrece
  tus variables donde sirven. `desde="otro"` se revisa contra `/api/modelos` (si no existe, error: el servidor
  arrancaría con una red al azar); el estudio recarga esa lista al correr y al pedir opciones de `modelo(`. "Que grabe la IA" ya no se bloquea: vuela con la IA
  del dron (o la base), se carga sola, y si no entrega el video cuesta 2 de reputación.
- **Freestyle y niveles 16-18 (16-10-2026, v2.1):** `app/freestyle.html` (3 mapas: la fábrica, el cañón, el estadio de noche;
  control PS5/Xbox, FPV, acro). Niveles nuevos de la IA (solo Python, para entrenar): **16 Carrera** (6-9 portales a 7-15 m,
  campo de 60 m, portal de 1 m de radio), **17 Entrega** (plataforma a 14-32 m entre edificios, quedarse 1 s), **18 Persecución**
  (la liebre a 2-6 m/s, o hasta `bird_speed` si es mayor). El 15 queda para la toma seguir. `drones/fs_racer.json` = el dron de los rivales.
  `foto(calidad=)` de PBDMM va de 0,3 a 0,7: un piloto PD perfecto saca ~0,56; con 0,8 la IA nunca pasa y no aprende.
- **Nivel 12 · Grabar entre postes**: como el 11 con postes a 1,5 m de la ruta (`level.film_posts`).
- **Niveles 13 · Foto y 14 · Set de fotos** (Fase 1b): tomas fijas cortas; ver arriba.
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
