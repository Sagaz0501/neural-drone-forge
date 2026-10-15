# Cambios

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
