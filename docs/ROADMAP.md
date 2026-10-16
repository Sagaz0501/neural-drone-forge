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

## ✅ PBDMM 2 *(hecho 15-10-2026)*

> Plan y decisiones: [`PBDMM2_PLAN.md`](PBDMM2_PLAN.md) · documentación del lenguaje: [`pbdmm/`](pbdmm/README.md).

Leer el juego desde el programa (`d = dron(…)`, `mision_info`, `hangar()`, `inventario()`, `ficha`, `tabla`, `barra`,
`color`), la **revisión automática** del dron contra la misión (solo si hay `dron(…)`), `explicar()`, el **narrador**
(`narrar(cada=5)`, `e.cambio`, `e.diagnosticos`), más Python (rebanadas, closures, `sorted`…) y la **ruta del
programador**: 8 capítulos, uno por cada dron que creas, con programa guiado y reto medido solo.
Falta: lo que agregue la Fase 1b (premios y castigos nuevos) también en PBDMM.

## ✅ El negocio: los clientes te escriben *(Santiago, hecho 15-10-2026 · v1.0)*

> Diseño completo en [`NEGOCIO.md`](NEGOCIO.md).

El juego pasa de "lista de misiones" a **un negocio**: los clientes escriben al celular (una app de chat del juego), con
trabajos **repetibles** de 4 dificultades (★–★★★★) que piden más piezas cuanto más difíciles. Tipos: 📷 foto (el
tutorial, el más fácil), 🎬 video, 🔎 inspección, 🛠️ encargos de armado, 🧪 pruebas de drones (QA), 🎮 a mano y
📦 entregas. Reutilizas y gastas drones, la relación con cada cliente crece y **lo repetitivo se lo das a la IA**
(flota). La campaña sigue: sus pedidos pasan a ser los **pedidos especiales ⭐**.

- ✅ Hecho: el celular (chats, tarjetas, ¿qué me falta?, terminar el día), el tutorial del día 1 (la foto de Doña
  Marta), 📷 fotos y 🔎 inspecciones, 🎬 videos repetibles, 4 dificultades desde plantillas, 4 clientes con relación y
  recomendaciones, arriendo, pedidos especiales por el chat, `requisitos.js` compartido.

## ⏭️ Lo siguiente · El negocio, parte 2

- ✅ **Flota** *(16-10-2026)*: 🤖 en la tarjeta del pedido, un trabajo por dron; al terminar el día cada IA vuela su
  trabajo de verdad sin pantalla (`mision_sim.js`) y sale el reporte en el celular. Lo que no entrega sigue abierto.
- 🔜 Lo que sigue para la flota: la **Fase 1b** (premios para fotos, altura, velocidad, encuadre) para que las IA
  cumplan; ver la repetición de un vuelo de la flota; que la flota cueste algo (baterías, mantenimiento).
- 📝 🛠️ Encargos de armado y 🧪 pruebas de drones (con la Fase 2), 🎮 a mano (Fase 3), 📦 entregas.
- 📝 Más clientes y lugares.
- 📝 **Perder plata, no solo ganar** *(Santiago, 16-10-2026)*. Hoy casi todo suma; el único gasto fijo es el arriendo.
  La idea es que el negocio tenga presión y decisiones. Ya hay un registro de cada movimiento (`p.movimientos`,
  `partida.js anotar`) que muestra la app **🏦 Finanzas** del Estudio: cada gasto nuevo se anota ahí.
  - **Gastos fijos:** arriendo (ya existe), **servicios** (luz: sube con lo que entrenas y cargas baterías; internet),
    seguro del taller (opcional: cubre un choque al mes). Se cobran al terminar el día, con aviso en el celular.
  - **Quejas de clientes:** un video flojo o tarde → el cliente reclama; eliges devolver parte del pago, repetir el
    trabajo gratis o ignorarlo (pierdes relación ♥ y te deja una mala reseña que baja los pedidos de otros).
  - **Multas:** volar donde no se puede (zonas con gente, de noche, sin permiso en el restaurante del centro), daños
    a terceros si chocas contra algo ajeno (una ventana, un auto).
  - **Desgaste:** las baterías pierden capacidad con los ciclos y hay que reemplazarlas; los motores también; la
    flota gasta más (cada vuelo de la flota cuesta su carga y su desgaste).
  - **Imprevistos:** una pieza que llega mala (con la Fase 2), un robo o una lluvia que daña lo que dejaste afuera,
    un mes flojo con menos pedidos.
  - **Deuda:** si la plata baja de 0, un préstamo con interés o vender piezas; nunca "perder la partida" de golpe.
  - Balance: que un taller que trabaja bien siempre gane más de lo que gasta; los gastos castigan el descuido, no el
    jugar. Todos los montos en `data/trabajos.json` (balancear = editar números).

## Fase 1b · Premios, castigos y misiones que exigen al dron *(Santiago, 15-10-2026)*

> **Parte 1 hecha (16-10-2026):**
> - ✅ **Fotos para la IA:** nivel 13 **Foto** (una toma fija corta: llegar, frenar, quieto 2,5-3,5 s) y nivel 14
>   **Set de fotos** (2-4 seguidas, todas buenas = éxito). 30 % son inspecciones del techo. En el Laboratorio, PBDMM
>   (`mision("foto")`, `mision("set_fotos")`), Blender, el visor (dibuja todo el set) y el servidor.
> - ✅ **El catálogo nuevo** (apagado por defecto: los modelos de antes entrenan igual): `framing` **encuadre**,
>   `settle` **llegar quieto**, `altitude` **cambiar de altura**, `pan` **paneo brusco**, `overspeed` **exceso de
>   velocidad** (> 3 m/s), `energy` **gas de más**. Agrupados en el Laboratorio y en los datos (misión, vuelo, cámara,
>   seguridad, energía); `explicar("encuadre")` en PBDMM. Una prueba revisa que cada premio exista en el entrenador, el
>   servidor, Blender y el juego.
> - ✅ Cada trabajo del celular dice qué misión entrenar. Arreglo: las inspecciones encuadran el techo.
> - ⏭️ **Falta (parte 2):** que el entrenamiento sienta la física del dron (pérdida de señal por alcance de la radio,
>   ráfagas contra poco empuje), distancia segura a personas, aterrizar suave en la base, no salirse de la zona.

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

✅ **Hecho (16-10-2026):** las piezas llegan en caja (hoy, mañana o en 2 días), la mesa de trabajo en 3D (abrir cajas, montar,
atornillar hasta el clic) y soldar de verdad (estación, flux, limpiar, cautín + estaño a la vez; juntas buenas, frías,
con puente o con el pad levantado; las frías se pueden soltar en vuelo). Falta la batería y el multímetro en la mesa.

**El plan completo está en [`ARMADO_PLAN.md`](ARMADO_PLAN.md)** (16-10-2026, Santiago: piezas que se vean de verdad,
colocar, atornillar, soldar con la estación —prender, esperar, limpiar, flux, estaño—, la guía de conexión aparte y
conectar la batería con riesgo). Ya hay un prototipo de piezas hechas por script en Blender (ESP32 y soldador).

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
2. 📝 **Nuevas tomas y misiones:** *seguir* (un auto o una persona, nivel 15; el 13 y el 14 ya son las fotos), el concesionario (tomas bajas),
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

1. 📝 **Una app, no solo el navegador** *(Santiago, 16-10-2026: nota para el futuro; primero se termina aquí)*.
   Hoy el juego es web (`app/`) y el entrenamiento es Python (`jugar.py` + PyTorch, Blender opcional). Por pasos:
   - **Paso 0 · PWA** (lo más barato): un `manifest.json` y un service worker, y Chrome/Edge lo "instalan" con su
     ícono y en ventana propia. No cambia el código, pero el entrenador sigue necesitando `python scripts/jugar.py`.
   - **Paso 1 · Escritorio** (Windows / macOS / Linux, instalador de un clic): **Electron** (trae su Chromium: WebGL y
     el video `.webm` funcionan igual en todos lados; pesa ~150 MB) o **Tauri** (usa el navegador del sistema, pesa
     ~10 MB, pero Safari/WebKit en macOS graba video distinto). El servidor y el entrenador van adentro como un
     programa aparte ("sidecar": Python + PyTorch empaquetado con PyInstaller, ~300 MB por PyTorch). Recomendado:
     Electron primero, porque el juego ya está probado en Chromium. Con esto se puede publicar en itch.io y Steam.
   - **Paso 2 · Celular** (iOS / Android, con **Capacitor**: el mismo juego web adentro de una app). Jugar sí:
     garaje, celular, vuelos (falta controles táctiles y bajar la calidad 3D). Entrenar en el teléfono no (PyTorch no
     corre ahí): el teléfono se conecta al PC de la casa por la red local para entrenar, o se hace un entrenador más
     chico en JavaScript solo para afinar.
   - **Qué conviene ir dejando listo desde ya:** que la partida y los programas `.pbd` se guarden en archivos (no solo
     en el navegador), que el juego no dependa de rutas fijas del servidor y que todo se pueda jugar sin el ratón.
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
