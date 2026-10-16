# Cambios

## v2.1 · Freestyle *(en curso)*

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
