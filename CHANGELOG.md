# Cambios

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
