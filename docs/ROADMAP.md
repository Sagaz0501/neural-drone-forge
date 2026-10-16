# Roadmap: de la demo a un juego completo

> Documento vivo. Orden propuesto: cada fase deja el juego mejor que antes y se puede mostrar sola.
> ✅ hecho · 🔜 lo siguiente · 📝 idea anotada (todavía no se empieza).
> Las ideas marcadas *(Santiago)* son tuyas tal cual las pediste; las demás son propuestas para discutir.

## La visión en una frase

**La IA es la protagonista.** Armas el dron como en la vida real, pero las misiones las cumple **el modelo que
tú entrenaste**: si el dron no aprendió, el cliente no recibe su video. Tú decides la física (las piezas), el
cerebro (la red) y la forma de enseñarle (premios, castigos, currículum). Y mientras entrena, puedes ver cómo
aprende en Blender o salir a volar por gusto con un mando.

---

## Fase 0 · La demo (v0.1) ✅

- ✅ Simulador del quad en Python y JavaScript con las mismas cuentas (prueba de paridad).
- ✅ IA con PPO, 38 sensores, entrenable en Blender (Drone Lab) o en segundo plano.
- ✅ Garaje 3D, tienda por categorías, inventario por unidades, hangar con varios drones.
- ✅ Banco de armado: imprimir (formas o STL propio), armar, cablear con pines reales (cortos y piezas quemadas),
  prueba de humo, firmware, configurar, motores (orden y sentido), hélices, prueba atada.
- ✅ Campaña: 3 pedidos jugables (casa, finca con viento, restaurante entre postes), tomas calificadas, video.
- ✅ Una IA por dron (`models/drones/<nombre>/`), con la opción "Que grabe la IA" (si falla, cuesta reputación).
- ✅ Modo desarrollador + **PBDMM**: IDE, terminal, autocompletado, variables, premios y castigos de 0 a 10,
  gráficas, red neuronal en vivo de cualquiera de los drones que entrenan.
- ✅ Cada modo con su herramienta *(Santiago)*: el desarrollador solo ve el Estudio (IDE + consola); el normal,
  solo el Laboratorio.
- ✅ Documentación: README, guía, PBDMM, arquitectura, roadmap. Pruebas automáticas en GitHub.

## Fase 1 · Que la demo enamore 🔜

El objetivo: que alguien que llega al GitHub entienda en 10 segundos qué es y quiera probarlo.

Ya hecho en esta fase:
- ✅ **Blender = la pantalla del entrenamiento** *(Santiago)*: el panel Drone Lab ya no tiene controles (todo se
  maneja desde el juego); solo muestra qué entrena y tiene **Modo video** (sin menús ni grilla, pantalla completa).
  Si se cierra Blender, su entrenamiento guarda y termina solo (ya no quedan entrenamientos huérfanos).
- ✅ **Tres botones por IA** *(Santiago)*: **Avance del modelo** (primer intento, peor, mejor, último y "Ahora"),
  **Simular prueba** (una prueba al azar como las del entrenamiento, con la última generación, sin detenerlo; no da
  plata ni daña nada) y **Pedidos**. Las simulaciones muestran el recorrido, la red neuronal en cada instante,
  gráficas y tres cámaras, con línea de tiempo. Preguntan con qué IA (cada modelo con su generación guardada).
- ✅ **Pedidos al azar** *(Santiago)*: cada intento las tomas cambian (ángulo, distancia, altura, sentido de la órbita).
- ✅ **La IA nunca se bloquea** *(Santiago)*: con una IA sin entrenar sale un aviso (reputación y daños) y puedes
  intentarlo igual.
- ✅ **`cargar <modelo> <dron>`** *(Santiago)*: sube la última generación al dron, con animación.
- ✅ **El juego en inglés** *(Santiago)*: pregunta el idioma al abrir; PBDMM bilingüe (`model()` = `modelo()`).
- ✅ **Videos en el README** *(Santiago)*: 25 drones aprendiendo en Blender (GIF + MP4) y la demo del modo
  desarrollador (GIF del visor de simulaciones + MP4 de 4½ min), en `docs/media/`.

Decisiones (Santiago, 15-10-2026):
- ✅ **El tutorial es el modo desarrollador.** El juego se enfoca en crear la IA (PBDMM + Blender); el modo normal
  queda como la opción fácil. La demo grabada (`docs/media/demo_estudio.mp4`) es el tutorial de referencia.
- ♻️ **Imágenes y videos: se agregan con el tiempo,** cada vez que algo mejora (por ejemplo, cuando el banco de
  armado tenga soldadura y multímetro de verdad: fotos de los componentes, de las quemaduras, del multímetro).
- ♻️ **Rendimiento: se mejora sobre la marcha,** en cada fase.

Lo que queda abierto de la Fase 1:

1. 🔜 **Arreglos que se ven en la demo:** en *Avance del modelo* el selector de modelo puede mostrar "base" aunque se
   esté viendo otro; con el juego en inglés, los nombres de los sensores de la red ("meta adelante"…) y algunos
   mensajes del servidor y de Blender siguen en español (fase 4 de los idiomas, `docs/I18N.md`).
2. 🔜 **Las misiones las cumple la IA** *(Santiago: "las misiones se prueban exclusivamente con el modelo
   entrenado")*. Propuesta: los pedidos se entregan solo con "Que grabe la IA"; volar tú queda para practicar,
   para los modos libres (Fase 3) y para "mostrarle a la IA" (Fase 4: aprender de tu vuelo).
   Por decidir: ¿volar tú sigue dando plata en los primeros pedidos (antes de tener IA)?
3. 🔜 **El momento "wow" en el juego:** al terminar una generación buena, una repetición corta del mejor dron
   (el Avance ya muestra antes y después; falta que aparezca solo, como una celebración).
4. 🔜 **Pulido:** sonidos (motores según el gas, el bip del ESC, el clic del relé), transiciones de cámara, pantalla
   de carga, ajustes (volumen y calidad en el mismo lugar que el idioma).

## ⏭️ Lo siguiente · PBDMM 2: entrenar con más claridad y programas "de verdad" *(Santiago, 15-10-2026)*

> Plan detallado (nombres de funciones, ruta del programador por dron, orden de trabajo): [`PBDMM2_PLAN.md`](PBDMM2_PLAN.md).

El modo desarrollador es el corazón del juego, así que PBDMM crece:

1. **Más claro en el entrenamiento:** qué hace cada parámetro de entrenamiento, qué cambió entre generaciones, por
   qué sube o baja el éxito. Mensajes y ayudas pensados para aprender ML mientras se juega.
2. **Funciones incorporadas para leer el juego** (para imprimir y mostrar cosas en la terminal, como un monitor
   serial de un microcontrolador):
   - `dron_especificaciones("Cine (dev)")` / `drone_specs(…)`: peso, empuje/peso, motores, hélices, batería,
     controladora, radio y su alcance, cámara, sensores, minutos de vuelo…
   - `mision_info("grabar_postes")` / `mission_info(…)`: qué pide la misión (viento, alcance, sensores, tomas…).
   - `modelo_info("colibri")`, `mis_drones()`, `mis_modelos()`, `piezas("motores")`… (nombres por definir).
   - Salida "de consola" más vistosa: tablas, barras, colores (por ejemplo `tabla(...)`, `barra(valor)`).
3. **El programa revisa al dron contra la misión,** pero **solo si el programa elige un dron con `dron(…)`** (si no
   hay `dron()`, no se toma ningún dron y no se revisa nada). Ejemplo: entrenar para la misión del restaurante con
   un dron sin sensores ToF, o con motores que no aguantan el viento de la finca, o con una radio ESP-NOW para una
   misión de largo alcance → el programa avisa al revisarlo/correrlo: *"d.motores: empuje/peso 1,9 < 2,5 que pide el
   viento de la finca"*, *"falta: sensores ToF (los postes)"*, para conseguir las piezas **antes** de entrenar.
   Se apoya en los requisitos de cada pedido que ya existen (alcance de la radio, empuje/peso con viento,
   protectores, cámara) y crece con la Fase 1b.
4. Después: lo que la Fase 1b agregue (premios y castigos nuevos) llega también a PBDMM.

## ⏭️ También · El negocio: los clientes te escriben 📝 *(Santiago, 15-10-2026)*

> Diseño completo en [`NEGOCIO.md`](NEGOCIO.md).

El juego pasa de "lista de misiones" a **un negocio**: los clientes escriben al celular (una app de chat del juego), con
trabajos **repetibles** de 4 dificultades (★–★★★★) que piden más piezas cuanto más difíciles. Tipos: 📷 foto (el
tutorial, el más fácil), 🎬 video, 🔎 inspección, 🛠️ encargos de armado, 🧪 pruebas de drones (QA), 🎮 a mano y
📦 entregas. Reutilizas y gastas drones, la relación con cada cliente crece y **lo repetitivo se lo das a la IA**
(flota). La campaña sigue: sus pedidos pasan a ser los **pedidos especiales ⭐**.
Primero: `requisitos.js` (compartido con PBDMM 2), el trabajo 📷 foto y el celular con el tutorial del día 1.

## Fase 1b · Premios, castigos y misiones que exigen al dron 📝 *(Santiago, 15-10-2026)*

> Idea anotada, todavía no se empieza. Podría ir justo después de la Fase 1 porque cambia cómo se entrena.

**Premios y castigos mejor pensados.** Hoy son pocos y genéricos (acercarse, grabar, chocar, sacudidas…). La idea es
un **catálogo amplio, con nombres claros**, que haya que combinar y ajustar según la misión:
- **Estabilidad de altura:** mantenerse a la misma altura cuando la toma lo pide (no confundir con "sin sacudidas").
- **Velocidad:** ir al ritmo que pide la ruta, ni más rápido ni más lento; castigo por pasarse del límite.
- **Enfoque:** el sujeto al centro y a la distancia correcta (encuadre), separado de "mirar al sujeto".
- Otros candidatos: suavidad en las curvas, ahorro de batería (menos gas inútil), distancia segura a personas,
  aterrizar suave en la base, no salirse de la zona del cliente, compensar el viento, mantener la línea de vista
  con el piloto (alcance de la radio).
- Cada misión diría cuáles importan y en qué rango; el Laboratorio y PBDMM los mostrarían agrupados (vuelo, cámara,
  seguridad, energía). Por dentro, cada premio nuevo es una entrada más del entrenador (`drone_rl/env.py`) y lo que el
  dron "siente" para lograrlo (las 38 entradas solo pueden crecer **al final**).

**Misiones que dependen de la física del dron.** Una misión no se puede cumplir con cualquier dron, y el
entrenamiento debería reflejarlo:
- **Alcance de la radio:** un dron con ESP-NOW (ESP32) no llega lejos; una misión de largo alcance pide ExpressLRS o
  una antena mejor (hoy el juego ya revisa el alcance y activa el failsafe: llevarlo también al entrenamiento,
  con pérdida de señal).
- **Viento fuerte y motores débiles:** con poco empuje/peso el dron no puede contra ráfagas fuertes; la misión debe
  decirlo antes (hoy hay un aviso de empuje/peso con viento: hacerlo parte de la física que aprende la IA).
- **Batería, peso de la cámara y del gimbal, sensores** (sin ToF no ve los postes, sin GPS no frena solo…).
- Cada misión declararía sus **requisitos** (alcance, empuje/peso con su viento, minutos de vuelo, sensores) y el
  juego explicaría qué pieza falta y por qué, antes de entrenar y antes de volar.

## Fase 2 · El banco de armado de verdad 📝 *(Santiago: "más complejo, más problemas, más uso del multímetro")*

Hoy cablear es "tocar un pin y otro". La idea es que armar sea un oficio, pero simple de jugar.

1. 📝 **Soldar** *(Santiago)*: calentar el cautín (temperatura: frío = soldadura fría que falla después;
   muy caliente = levantas el pad), poner flux, estañar la punta, estañar el pad y el cable, y soldar.
   Un minijuego corto por punto de soldadura: los cables de los motores, el XT60, los pines del receptor.
   - Resultados posibles: buena, fría (funciona y falla en vuelo por vibración), puente de estaño (corto con el
     pad de al lado), pad levantado (hay que puentear con un cable).
   - Herramientas nuevas: cautín (barato / con temperatura), estaño, flux, malla desoldante, tercera mano.
2. 📝 **Multímetro de verdad** *(Santiago)*: modos de continuidad (pita si hay corto), voltaje (¿llegan 5 V al
   receptor?) y resistencia (¿el motor tiene una fase abierta?). Medir antes de conectar la batería salva piezas.
3. 📝 **Componentes dañados** *(Santiago)*: piezas que llegan malas de fábrica o que se dañaron en un choque,
   y que solo se descubren midiendo: un ESC con un MOSFET quemado, un motor con un bobinado abierto, un
   regulador de 5 V que entrega 3,8 V, una antena con el cable cortado (alcance a la mitad).
4. 📝 **Más problemas realistas:** cables muy cortos o muy largos, calibre equivocado (se calientan), conectores
   (JST, XT30/XT60), ruido eléctrico (la cámara con rayas si el cable del video pasa junto al de la batería),
   capacitor de bajo ESR en la entrada del ESC, calibración del ESC, versión del bootloader.
5. 📝 **Diagnóstico como en un taller:** síntomas ("el dron se va a la derecha", "la imagen tiembla", "pierde la
   señal a 30 m") y el jugador encuentra la causa con las herramientas.

## Fase 3 · Volar por gusto mientras la IA entrena 📝 *(Santiago)*

Entrenar toma minutos u horas. Que ese tiempo también sea juego.

1. 📝 **Mando de PS5 (y Xbox)** *(Santiago)*: ya existe una base con la Gamepad API (`game/pilot.js` lee
   cualquier mando con 4 ejes). Falta: verificar y mapear el DualSense (botones, gatillos), pantalla de
   calibración (centro y extremos de los sticks), modo 1 / modo 2, *rates* y *expo*, vibración al chocar.
2. 📝 **Tres ambientes para volar** *(Santiago)*:
   - **Freestyle:** un parque o una fábrica abandonada con obstáculos para trucos (flips, rolls, *power loops*).
   - **FPV / carreras:** un circuito con puertas, cronómetro, fantasma de tu mejor vuelta.
   - **Vuelo libre:** un mapa grande y abierto (pueblo, playa, montaña) para pasear y grabar.
3. 📝 **Modos de vuelo:** *angle* (se nivela solo, como hoy), *horizon* y *acro* (el de freestyle de verdad).
4. 📝 **Tu vuelo contra el de la IA:** correr el circuito contra tu modelo entrenado (su fantasma).
5. 📝 Aviso en pantalla cuando el entrenamiento termina o llega a la meta que pusiste.

## Fase 4 · Más IA 📝

1. 📝 **Video con varios drones a la vez:** un pedido con 2-3 drones, cada uno con su IA y su ángulo, y un editor
   simple que corta entre cámaras.
2. 📝 **Nuevas tomas y misiones:** *seguir* (un auto o una persona, nivel 13), el concesionario (tomas bajas),
   entregas de paquetes (el gancho ya está en el catálogo), inspección de un techo, buscar a alguien en el bosque.
3. 📝 **Arena de modelos:** poner dos modelos en la misma misión con la misma semilla y comparar (éxito, choques,
   calidad). Un ranking de tus modelos por misión.
4. 📝 **Aprender de tu vuelo (imitación):** grabar cómo vuelas tú una toma y usarlo para arrancar el
   entrenamiento (*behavior cloning*), después afinarlo con PPO.
5. 📝 **PBDMM 2:** comando `evaluar <modelo>` (correr N episodios y medir, sin entrenar), depurador paso a paso
   para `cada_generacion`, guardar los programas también en el disco, compartir programas (un archivo `.pbd`),
   gráficas propias desde el programa (`graficar(e.calidad)`).
6. 📝 **La red en el dron real:** exportar el modelo para un ESP32-S3 / STM32 (TFLite Micro o C con los pesos)
   y mostrarlo corriendo en hardware. Para un ingeniero embebido, el cierre perfecto del juego.

## Fase 5 · Producto 📝

1. 📝 **Instalador de un clic** (Windows / macOS / Linux): empaquetar el juego y el entrenador (Tauri o Electron
   + Python embebido) para que nadie tenga que abrir una terminal.
2. 📝 **Inglés** además de español (los textos ya viven en JSON: `app/data/`).
3. 📝 **Guardado en archivos** (exportar e importar la partida y los modelos) y más ranuras de partida.
4. 📝 **Accesibilidad:** tamaño de letra, controles reasignables, modo daltónico para el cableado.
5. 📝 **Publicar:** itch.io primero (gratis o "paga lo que quieras"), un tráiler de 60 s, una página de presentación.
   Después decidir Steam.

---

## Deuda técnica y cosas conocidas

- El Avance del modelo empieza a guardarse en los entrenamientos que arrancan después de actualizar (el que ya
  corría sigue con el entrenador viejo hasta que lo detengas y lo vuelvas a empezar).
- Pedidos al azar: se mueven las tomas, no la casa (los modelos 3D de la casa, la finca y el restaurante son fijos).
- Los entrenamientos en segundo plano siguen corriendo si cierras `jugar.py`: hay que detenerlos desde el juego.
- Los programas `.pbd` viven en el navegador (localStorage): si borras los datos del sitio, se pierden.
  Descárgalos (botón *Descargar .pbd*) o espera la Fase 4 (guardar en disco).
- Chrome con la aceleración por hardware apagada no muestra el 3D (WebGL): ver la guía.
- Los textos y la UI están en español; los nombres de los premios del entrenador, en inglés (`crash`, `film`…)
  y con alias en español en PBDMM.

## Cómo proponer cambios

Abre un *issue* con la plantilla de idea o de error. Para trabajar el código, [`CLAUDE.md`](../CLAUDE.md) resume
las reglas (Python = JavaScript, las 38 entradas fijas, un modelo por dron, datos en JSON) y
[`ARQUITECTURA.md`](ARQUITECTURA.md) explica cómo se conecta todo.
