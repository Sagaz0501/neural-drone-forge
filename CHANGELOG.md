# Cambios

## v3.1.2 · La versión a la vista (19-10-2026)

- **La versión del juego en el inicio** (abajo, en chiquito): la del código que corre, también después de una
  actualización. Es la primera versión que llega sola con «Actualizar ahora».

## v3.1.1 · Actualizaciones sin reinstalar (19-10-2026)

- **La app se actualiza sola:** al abrir mira el último release de GitHub; si hay código nuevo del juego (~11 MB) pregunta
  «Actualizar ahora», lo baja, revisa su sha256 y lo deja en la carpeta de datos (`actualizaciones/<versión>`). Las
  partidas y las IA no se tocan, y si la actualización no arranca vuelve sola al código de la app. Solo hay que
  reinstalar cuando cambia el motor (Electron o el Python). La versión del código va en el título de la ventana.
  **Quien tiene la 3.1.0 instala la 3.1.1 una vez a mano**; de ahí en adelante, solo.
- **Gráficos:** las hélices mate (el foco del garaje las quemaba con el bloom) y el humo al soldar como nube (era un
  cuadrado gris). Freestyle: modo espectador para grabar a la IA (videos y tráiler).
- **Arreglado:** en el IDE, el programa del tutorial «dejaba de entrenar» a las pocas generaciones aunque Blender seguía
  entrenando (un sondeo sin noticias de Blender bastaba; ahora cuenta el progreso del entrenador y espera 15 s).

## v3.1 · Demo: el instalador de Mac (19-10-2026)

- **Instalador para Mac** (`.dmg`, chip Apple): se instala como cualquier app, sin Python ni terminal. Trae adentro el
  servidor y PyTorch (`desktop/empaquetar.sh`: PyInstaller + electron-builder). Las partidas, las IA y los STL van en la
  carpeta del usuario. **Blender** sigue funcionando con la app instalada (el del jugador, si lo tiene). Windows: el
  workflow `Instaladores` de GitHub Actions.
- **Partidas en archivos:** varias partidas (📂 Partidas: jugar, renombrar, exportar, importar, borrar a la papelera con
  sus IA). Los programas `.pbd` son de cada partida. Botón **🚪 Salir al escritorio** y **☰ Menú** en el garaje.
- **Piezas 3D hechas en Blender por script:** el chasis de contrachapado del kit, el ESC 4 en 1 (se suelda en sus pads
  de verdad), los 6 motores, las 6 baterías y la ESP32-CAM; hélices con forma. Arreglado: en la mesa, mover un motor
  arrastraba a 3 y no dejaba seguir.
- **Gráficos:** el garaje con reflejos, foco y contraluz sobre el dron, bloom y viñeta, polvo en la luz, la ventana, el
  portátil, la estación de soldar y herramientas de verdad; la mesa de trabajo más sobria; el vuelo con sol de tarde.
- **Pedidos según lo que sabes hacer:** mientras solo tienes fotos llegan fotos (3 por día, de varios tipos); los videos
  cuando ya puedes comprar E6. **Clientes que mienten** sobre el viento.
- **Arreglado:** la primera IA de una partida nueva nacía como copia de la IA base (3.500 generaciones); ahora parte de
  cero. Un solo entrenamiento a la vez en todo el juego. Los entrenamientos de la app no se frenan cuando su ventana
  queda atrás (App Nap).

## v3.0 · La app y el aprendizaje paso a paso (18-10-2026)

- **App de escritorio** (`desktop/`, Electron): el juego en su propia ventana, sin navegador; arranca el servidor solo
  y lo cierra al salir. `cd desktop && npm install && npm start`. Arreglado: la app se caía al esperar al servidor
  (`AssertionError: assert(!this.paused)`).
- **La partida empieza en cero:** sin la IA base ni programas; los modelos del juego (corredor, cazador…) quedan
  reservados. Todo lo entrena el jugador.
- **Escenarios E1-E12:** de lo básico a lo difícil. Nuevos: **E1 Despegar y quedarse** (nivel 19), **E2 Ir a un punto**
  mirando al sujeto (nivel 20; también hace las fotos fáciles) y **E3 Seguir una línea** (nivel 21). Un piloto
  automático los pasa al 100 % (pytest).
- **Examen 🎓** por escenario (20 intentos sin ruido, ≥ 80 %), **⭐ modelo base** (aprueba E1-E4 + E6), cada escenario
  parte del modelo que aprobó el anterior y **repasa** lo aprendido (el 20 % de los intentos: `tarea.repaso`).
- **Tutorial nuevo:** el **nivel 0** (la foto de Doña Marta) se gana con la primera IA en dos pasos, E1 y E2. En el modo
  desarrollador, paso a paso en el IDE: abrir el ejemplo, la línea que cambia (👉), ▶ Correr. La primera vez pregunta
  si tienes Blender (recomendado). Los pedidos de la campaña ahora dicen su nivel.
- **Prueba de motores en un botón:** cada motor ✓ o ✗ y el arreglo que toca (programar el orden, el sentido o volver a
  soldar).
- **La mesa:** los pads chicos (la ESP32) se tocan aunque no les atines exacto (el flux no entraba); fuera del tutorial
  la placa ya no dice qué cable va en cada pin; tres máquinas caras de nivel avanzado: 🤖 auto-atornillador,
  auto-conectores y auto-soldador.
- README nuevo con capturas de la app.

## v2.1 · Freestyle *(sale dentro de la v3.0)*

- **Freestyle** (🏁 en el inicio): 3 mapas (la fábrica abandonada, el cañón, el estadio de noche con neón), control
  PS5/Xbox o teclado, cámara FPV, vuelo **Estable** (la física de la IA) o **Acro** (rate mode con flips, solo aquí).
  Modos: libre, **carrera contra la IA** (1-3 rivales con un modelo entrenado), **contrarreloj** (con el fantasma de tu
  mejor vuelta) y **persecución** (drones con IA te persiguen: 60 s, 3 vidas). Tus drones del hangar también vuelan.
  El control vibra al chocar. Bloom de verdad en el estadio (`game/vendor/postprocessing`, three.js r169).
- **Tres pruebas nuevas para la IA:** nivel **16 Carrera** (portales lejos, rápido), **17 Entrega** (plataforma lejos
  entre edificios, quedarse 1 s encima) y **18 Persecución** (alcanzar a la liebre). En el juego: simuladores 📦 🏁 🐇
  después de *Entre postes*, con su misión en el Laboratorio y en PBDMM.
- **Modelos nuevos** entrenados con esas pruebas: *corredor* (el rival: 95 % de las pistas a 10 m/s, el doble de
  rápido que la IA base) y *cazador* (alcanza a la liebre a 10 m/s el 95 % de las veces).
- **Plan maestro** ([`docs/PLAN_MAESTRO.md`](docs/PLAN_MAESTRO.md)): fases hasta Steam, la historia completa en 5 actos,
  misiones y recompensas, gráficos y la app de escritorio. Prototipo de la app en `desktop/` (Electron).
- **Arreglado:** PBDMM dejaba pedir `foto(calidad=0.9)`, que ni un piloto automático perfecto alcanza (saca ~0,56): la
  IA nunca tenía un éxito y no aprendía. Ahora va de 0,3 a 0,7.

## v2.0 · El taller de verdad (16-10-2026)

- **El regalo de mamá** y un **tutorial obligatorio** (los dos modos): ponerle nombre al dron, armarlo con el
  computador apagado, el tour del computador y la primera IA; al 80 % en la foto escribe Doña Marta.
- **La mesa de trabajo 3D:** cajas que llegan, montar cada pieza con su procedimiento, atornillar hasta el clic,
  **soldar** con estación, cautín, estaño y flux (juntas frías, puentes, pads levantados que la mesa no avisa).
- **El computador es el centro del juego**, con apps en ventanas; **simuladores** que se compran en orden y abren
  misiones de la IA; **PBDMM 3** (el plan de vuelo); **la flota**; niveles **13 Foto** y **14 Set de fotos**.
- Diálogos del juego en vez de los del navegador.

## v1.0 · El negocio (16-10-2026)

- Los clientes escriben al 📱 celular; trabajos repetibles ★-★★★★; relación y recomendaciones; arriendo; PBDMM 2.0.

## v0.3 · English

- **PBDMM bilingüe:** todo nombre se escribe en español o en inglés, siempre (`model("x", start_from="zero")`,
  `mission("film")`, `rewards(film=6)`, `def every_generation(e): if e.success > 0.9: stop()`…); se pueden mezclar y un
  programa guardado en español sigue funcionando. En inglés, la ayuda, el autocompletado, los ejemplos y los comandos
  (`run`, `check`, `load`, `models`…) salen en inglés. Comando nuevo `translate` / `traducir`.

- **Arreglado (Blender):** al cerrar Blender, su entrenador seguía corriendo sin ventana y el Blender nuevo no podía
  entrenar ("Address already in use"). Ahora el entrenador lanzado por Blender guarda y termina solo si Blender se
  cierra (`live_train.py --salir-sin-padre`), y si al empezar el puerto está ocupado, Blender le pide al huérfano que
  guarde y se detenga (`liberar_ctrl`).

- **El juego en inglés:** la primera vez pregunta Español / English; se cambia en el inicio. 1.200 textos traducidos
  (`app/i18n/en/`), los datos con una capa en inglés (`app/data/en/`), el HTML fijo traducido al cargar.
  `node app/test_i18n.mjs` revisa que no falte nada. `README.en.md`. Plan y glosario: `docs/I18N.md`.
- **`cargar [modelo] [dron]`** en la terminal del Estudio: guarda la generación de ahora (si entrena) y la sube al dron
  con una animación de "subida".

## v0.2 · Fase 1, primera parte

- **Blender = la pantalla del entrenamiento:** el panel Drone Lab ya no tiene controles; muestra qué entrena y tiene
  **Modo video** (sin menús, grilla ni gizmos, a pantalla completa) para grabar. El panel viejo: `DRONMAKER_LAB_AVANZADO=1`.
- **Avance del modelo:** el entrenador guarda solo el mejor y el peor intento de cada nivel (`avance.json`).
- **Simular prueba:** una prueba al azar como las del entrenamiento, con la última generación, sin detenerlo y sin
  tocar la partida (`POST /api/simular`).
- **Visor de simulaciones:** recorrido, ruta de la cámara, tres cámaras, red neuronal en cada instante, gráficas y
  línea de tiempo.
- **Pedidos al azar:** cada intento las tomas cambian (dentro de rangos como los del entrenamiento y sin chocar).
- **Aviso antes de que vuele una IA que no está lista** (nunca bloquea).
- **Avance completo:** primer intento, peor, mejor, último (cada minuto) y "Ahora"; los botones preguntan con qué IA
  (cada modelo con su generación guardada). Un dron sin IA propia ya no cae en la IA base.
- **El primer video:** 25 drones aprendiendo en Blender (GIF en el README, MP4 en `docs/media/`).
- Arreglado: la red neuronal en vivo del Estudio no se dibujaba (un nombre repetido la tapaba) y, al recargar la
  página, no sabía qué modelo mirar: ahora muestra sola el que está entrenando y tiene un selector de modelo.

## v0.1 · La demo (octubre de 2026)

**El juego**
- Nombre: **Neural Drone Forge** ("Dron Maker" queda como el taller dentro del juego).
- Dos modos al empezar: **normal** (la campaña, con el Laboratorio de IA) y **desarrollador** (el Estudio PBDMM:
  todo desbloqueado). Cada modo tiene solo su herramienta.
- Garaje 3D con hangar de varios drones; tienda por categorías con carrito; inventario por unidades (vender usado).
- Banco de armado: imprimir el chasis (formas o tu STL, carcasas, descargar STL), armar con animaciones, mesa de
  cableado con pines reales (ESP32, STM32, ExpressLRS, GPS, ToF, LED) y fallas (cortos, polaridad, voltajes,
  TX con TX), prueba de humo, firmware, configurar, motores (orden y sentido de Betaflight, vista del piloto,
  diagrama), hélices y prueba atada.
- Campaña: la casa, la finca con viento y el restaurante entre postes; tomas con ruta calificadas, video `.webm`.

**La IA**
- Un modelo por dron (`models/drones/<nombre>/`), desde la base, otro modelo o cero; entrenable en Blender o en
  segundo plano (2 a la vez).
- "Que grabe la IA" siempre disponible: carga sola la última versión; si no entrega el video, −2 de reputación.
- Premios y castigos de 0 a 10 en todo el juego (el entrenador recibe los valores reales).
- La red neuronal en vivo de cualquiera de los drones que entrenan (`entrenando_red.json`, `GET /api/red`).

**PBDMM** (Python Base Dron Model Maker)
- Lenguaje con cara de Python interpretado en el navegador: variables, listas, diccionarios, tuplas, `if/for/def`,
  comprensiones, f-strings, `*lista`/`**dicc`; sin `import` ni `while`.
- `modelo`, `red`, `mision`/`nivel`, `dron`, `drones`, `entrenar_en`, `velocidad`, `viento`, `aprendizaje`,
  `premios`, `castigos`, y `al_empezar` / `cada_generacion` / `al_terminar`.
- Estudio: editor con colores y autocompletado (conoce tus drones, modelos y variables), terminal, ayuda,
  7 lecciones, 6 ejemplos, gráficas.

**Proyecto**
- README, guía del jugador, referencia de PBDMM, arquitectura, roadmap. Pruebas en GitHub Actions.
- `models/publico/`: la IA base viene con el repo.
