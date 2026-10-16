# Guía del jugador

Todo lo que necesitas para jugar **Neural Drone Forge**, de la instalación al primer modelo entrenado.

- [Instalar y abrir](#instalar-y-abrir)
- [Elegir el modo](#elegir-el-modo)
- [Modo normal: la campaña](#modo-normal-la-campaña)
- [El banco de armado, paso a paso](#el-banco-de-armado-paso-a-paso)
- [Los pedidos](#los-pedidos)
- [Entrenar la IA (Laboratorio)](#entrenar-la-ia-laboratorio)
- [Modo desarrollador: el Estudio PBDMM](#modo-desarrollador-el-estudio-pbdmm)
- [Ver el entrenamiento en Blender](#ver-el-entrenamiento-en-blender)
- [Controles](#controles)
- [Problemas comunes](#problemas-comunes)

---

## Instalar y abrir

```bash
git clone https://github.com/Sagaz0501/neural-drone-forge.git
cd neural-drone-forge
python3 -m venv .venv && source .venv/bin/activate      # en Windows: .venv\Scripts\activate
pip install -r requirements.txt
python scripts/jugar.py
```

Se abre `http://localhost:8765/app/`. El servidor corre **solo en tu compu**: el juego, el entrenamiento y tus
partidas no salen a internet. Para cerrarlo: `Ctrl+C` en la terminal.

La partida se guarda sola en el navegador. Las IA entrenadas se guardan en `models/` (no se borran al empezar
una partida nueva).

## Elegir el modo

**Nueva partida** te pregunta cómo quieres jugar:

| | Modo normal | Modo desarrollador |
|---|---|---|
| Para | jugar la campaña | crear y experimentar con IAs |
| Plata | $150 al empezar | todo desbloqueado |
| Drones | los armas tú | dos listos ("Madera" y "Cine") |
| Cómo se entrena | **Laboratorio** (controles y deslizadores) | **Estudio PBDMM** (código, terminal, gráficas) |

Cada modo tiene solo su herramienta: en el normal no aparece el Estudio y en el desarrollador no aparece el
Laboratorio.

> **Tip:** si ya tienes una campaña y quieres probar el modo desarrollador sin tocarla, ábrelo en una ventana de
> incógnito o en otro navegador: cada uno guarda su propia partida.

## Modo normal: la campaña

1. **El garaje.** A la izquierda, tu **hangar** (tus drones). Arriba: Pedidos, Tienda, Inventario, Laboratorio
   de IA, Videos, Controles.
2. **Tu primer dron.** El camino más corto es **Kit del garaje**: compra lo que falte del dron de madera y lo
   deja en un dron nuevo del hangar. También puedes comprar pieza por pieza en la **Tienda** (por categorías,
   con carrito y cantidades).
3. **Ármalo en el banco** (ver abajo). Un dron no vuela hasta pasar todos los pasos.
4. **Pedidos.** Cada cliente quiere un video con varias tomas. Ganas plata y reputación según las estrellas.
5. **Mejora.** Con más reputación se abren piezas mejores: brushless, STM32, ExpressLRS, cámaras con gimbal,
   sensores de distancia (ToF), GPS.
6. **Entrena su IA** en el Laboratorio, para que la IA grabe los pedidos.

Cada dron tiene **nombre, propósito, piezas e IA propia**. Puedes tener uno con ESP32 para casas y otro con
STM32 para el restaurante, cada uno entrenado a su manera.

## El banco de armado, paso a paso

Abre un dron del hangar → **Banco de armado**. A la izquierda los pasos (✓ o ○); a la derecha lo que toca.

| Paso | Qué haces | Qué puede salir mal |
|---|---|---|
| **Imprimir** | Eliges la forma del chasis (X, H, deadcat, stretch, con marco) o **tu propio STL**, y una carcasa. Puedes descargar el STL de las piezas para imprimirlas de verdad. | Un STL muy pesado baja el empuje/peso. |
| **Armar** | Cada pieza a su lugar (o "Instalar todo"). | — |
| **Cablear** | En la mesa de cableado tocas un pin y otro para soldar un cable: batería al ESC, motores a M1-M4, ESC a la controladora, receptor, cámara, sensores. "Ver el diagrama" muestra el manual. | Batería al revés → **se quema el ESC**. Receptor a VBAT → se quema. ToF a 5 V → se queman. TX con TX → no se quema, pero no funciona. |
| **Prueba de humo** | Conectas la batería. Con el **probador de humo** ($10) se corta la corriente antes de quemar algo. | Chispas y humo si hay un corto. |
| **Firmware** | Flasheas desde el portátil (USB). | El firmware de otro chip "flashea" pero la placa no arranca. |
| **Configurar** | Calibrar el acelerómetro, activar el UART del receptor y del GPS, emparejar la radio. | Puerto equivocado = sin control. |
| **Motores** | Sin hélices: le das **Girar** a cada M y miras cuál gira y para dónde (flecha verde ↻ horario, amarilla ↺ antihorario). El dron está como lo ve el piloto (la flecha naranja del plato es el frente). **Reordenar** si giró otro, **Invertir** si gira al revés. | Si quedan mal, en la prueba atada se voltea. |
| **Hélices** | Siempre de último. | — |
| **Prueba atada** | Lo enciendes amarrado a la mesa. | Motores mal → se voltea y las hélices pierden 50 %. |
| **Cargar su IA** | Descarga la IA del dron (también se carga sola al despegar con la IA). | — |

El **multímetro** ($8) avisa antes de conectar la batería si algo va a quemarse.

## El celular: tu negocio

Los clientes te escriben al **📱 Celular** (arriba; el número verde son los mensajes sin leer). Cada pedido llega con una
**tarjeta**: qué quiere (📷 fotos, 🔎 inspección del techo o 🎬 video), dónde, la dificultad (★ a ★★★★: viento,
distancia, obstáculos), cuánto paga y para cuándo.

- **Aceptar** · **¿Qué me falta?** (qué dron de tu hangar sirve y qué le falta, con lo que pide el cliente) · **No, gracias**.
- Un pedido aceptado tiene **Volar ▶**: abre el briefing y vuelas tú o la IA. Al terminar, se entrega por el chat y el
  cliente responde según las estrellas. Con 0 estrellas no paga, pero puedes intentarlo otra vez antes de que venza.
- **Fotos:** llega al aro y **quédate quieto** unos segundos con el sujeto al centro: clic.
- **🤖 A la flota:** en vez de volarlo tú, le das el pedido a un dron de tu hangar y **su IA lo vuela sola al terminar
  el día** (un trabajo por dron). Después sale el **reporte de la flota**: qué entregó, con cuántas estrellas, cuánto
  pagaron y qué se dañó. Lo que no entregó sigue abierto (el cliente no se entera). Cuanto mejor entrenes la IA de
  cada dron, más plata trae la flota.
- **Terminar el día 🌙:** llegan pedidos nuevos (más y más difíciles con más reputación) y vencen los que no hiciste.
- Cada cliente tiene su **relación** (♥): sube con buenas entregas, baja si fallas o dejas vencer, y los contentos te
  **recomiendan** a otros. Desde la reputación 6 se paga arriendo cada 7 días.
- Los pedidos de la **Campaña** ⭐ también llegan por el chat: no vencen y hacen crecer tu negocio.

La primera vez, una guía abajo te lleva paso a paso: leer el mensaje de Doña Marta, armar el Kit del garaje, terminarlo
en el banco y tomar la foto.

## Los pedidos

**Campaña** (o el celular) → eliges un cliente → el *briefing*: las tomas que quiere, lo que exige (cámara mínima, protectores
de hélice, radio que llegue, empuje con viento) y con qué dron vas.

- **Volar yo:** pilotas tú. Cada toma es una **ruta** (la línea celeste): ve al aro del inicio, ahí empieza a
  grabar sola, y sigue el punto blanco pegado, con el sujeto al centro, a su ritmo y sin sacudidas.
- **Que grabe la IA:** vuela la IA de ese dron (o la base si todavía no tiene). Si no está lista (es nueva, no
  entrenó esas tomas o no conoce un dron así) te avisa y decides si intentarlo igual. Si no entrega el video (le
  faltan tomas, se estrella o se queda sin batería) el cliente se queja: **−2 de reputación**, y si choca hay que
  reparar el dron.
- **Cada intento es distinto:** las tomas cambian de ángulo, distancia y altura (el número de ruta sale en el pedido).

Cada toma se califica: **encuadre × en la ruta × ritmo × estable**. Al final: estrellas, plata, reputación, daños
(se reparan en el taller) y el video `.webm` para descargar.

## Ver cómo va tu IA: Avance y Simular prueba

Cada dron (en el hangar → abrirlo), el Laboratorio y el Estudio tienen tres botones:

| Botón | Qué muestra |
|---|---|
| **Avance del modelo** | La historia del entrenamiento en pestañas ordenadas por generación: el **primer intento** guardado, el **peor**, el **mejor**, el **último** (se renueva cada minuto) y **Ahora** (una prueba nueva con la generación de este momento). El entrenador los guarda solos, por nivel. |
| **Simular prueba** | Una prueba **nueva al azar**, igual a las que hacen los 50 drones, volada con la **última generación guardada**. No detiene el entrenamiento, no da plata, no gasta batería ni daña el dron. *Otra prueba* para otra. |
| **Pedidos** | Los clientes de verdad (cada intento, una ruta distinta). |

Al tocar cualquiera de los dos te pregunta **con qué IA**: cada modelo guardado con su generación, su éxito y cuándo se
guardó (sugiere la del dron, la que está entrenando o la última que entrenaste).

En las simulaciones: el recorrido (naranja), la ruta de la cámara (celeste), tres cámaras (*persecución*, *la del
dron*, *desde arriba*), la red neuronal en cada instante, gráficas (altura, velocidad, premio, calidad) y una línea de
tiempo. Teclas: **Espacio** pausa, **← →** 2 segundos, **C** cambia la cámara, **Esc** cierra.

## Entrenar la IA (Laboratorio)

**Laboratorio de IA** (modo normal):

1. **El dron** que vas a entrenar. Si todavía no tiene IA, eliges desde dónde empieza: la IA base (ya sabe
   volar), la de otro dron o desde cero.
2. **La misión:** grabar, grabar con viento, grabar entre postes, repasos (ir a metas, esquivar columnas).
   Cada pedido dice qué misión le sirve.
3. **Dónde entrena:** en Blender (lo ves) o en segundo plano (sin ventana, hasta 2 a la vez).
4. **Premios y castigos, de 0 a 10** (4 = lo normal). *Valores recomendados* los pone como la misión los sugiere.
   Se pueden cambiar en vivo mientras entrena.
5. **Empezar a entrenar.** El progreso (generación, éxito, choques) aparece ahí mismo. Se guarda solo cada 10
   generaciones.

**Consejos:**
- Que aprenda con **"Física al azar"** si le vas a cambiar piezas: así sabe volar cualquier dron, no solo uno.
- Si sube el *premio* pero no el *éxito*, estás pagando por lo que no es: revisa los premios.
- Si choca mucho, sube el castigo de chocar o de pasar pegado. Si no se atreve a nada, bájalos.
- De vez en cuando, un repaso de un nivel viejo para que no olvide.

## Modo desarrollador: el Estudio PBDMM

Botón **Estudio PBDMM** (arriba). Tres zonas:

- **Izquierda:** tus programas `.pbd` (la × los elimina; *Descargar .pbd* para guardarlos en un archivo) y los
  ejemplos: `hover`, `grabar`, `curriculum`, `postes`, `cerebro_chico`, `variables`.
- **Centro:** el editor (con colores y **autocompletado**: ↑↓, Enter/Tab, Esc, Ctrl+Espacio) y la **terminal**.
- **Derecha:** **Ayuda** (cada función con su ejemplo e *insertar*; lo nuevo del capítulo sale marcado), **Ruta** (la
  ruta del programador: 8 capítulos, **uno por cada dron que creas**, cada uno con su programa guiado y un reto que el
  juego mide solo), **Aprende** (7 lecciones de cómo aprende una IA) y **Gráfica** (curvas de éxito/choque/calidad, y **Red neuronal**: la red en vivo de cualquiera de los drones
  que entrenan; ◀ ▶, el número o *Al azar*).

Tu primer modelo en 1 minuto:

1. Ejemplo **hover** → **▶ Correr** (o Ctrl/⌘+Enter).
2. Mira la terminal (`gen 12: éxito 40 %`…) y la pestaña **Gráfica**.
3. `estado` para ver qué entrena; `detener colibri` para pararlo.
4. `volar colibri` lo pone en tu dron activo: ve a Pedidos → *Que grabe la IA*.

Comandos útiles: `ayuda`, `ayuda premios`, `modelos éxito`, `info <modelo>`, `pausar/seguir/detener <modelo>`,
`copiar/renombrar/borrar <modelo>` (borrar = a la papelera), `blender`, `limpiar`.
Al correr un programa con un dron del hangar (`dron("…")`), la terminal lo revisa contra lo que pide la misión
(✅ / ⚠️ / ❌). Con `narrar(cada=5)` cuenta cómo va el entrenamiento y avisa si se estancó, si olvida o si choca mucho.
La documentación del lenguaje está en [pbdmm/](pbdmm/README.md) (tutorial, referencia, gramática, biblioteca, errores)
y la API en [PBDMM.md](PBDMM.md).

## Ver el entrenamiento en Blender

Con Blender instalado: Laboratorio → **Abrir Blender** (o en el Estudio: `blender`). Se abre
`blender/laboratorio.blend` con el **Drone Lab**: los drones volando, el cono de la cámara (rojo → verde según la
calidad de la toma), la red neuronal del dron que miras y las curvas. Blender **solo muestra**: el entrenamiento se
maneja desde el juego. En su panel (tecla N, pestaña *Drone Lab*): **Modo video** esconde los menús y la grilla y deja
la vista a pantalla completa para grabar; *Encuadrar drones* y *Dron observado* mueven la vista.

- La primera vez, en el panel **Drone Lab**, revisa que *Proyecto* y *Python* apunten a esta carpeta y a su `.venv`.
- Si actualizas el juego con Blender abierto, ciérralo (*Detener y guardar*) y ábrelo otra vez.

## Controles

| | Teclado y ratón | Control de videojuego (modo 2) |
|---|---|---|
| Subir / bajar | Espacio / Shift | stick izquierdo ↑↓ |
| Moverse | W A S D | stick derecho |
| Girar | ratón (clic en el juego para atraparlo) o ← → | stick izquierdo ←→ |
| Grabar (vuelo libre) | R | X |
| Cámara (persecución, piloto, la del dron) | C | B |
| Pausa | P o Esc | — |

Las ayudas dependen de la controladora del dron: con **barómetro**, al soltar Espacio se queda a esa altura; con
**GPS**, al soltar WASD frena solo. Sin ellas, el gas y el freno son tuyos. Sensibilidad y suavizado en
**Controles**.

## Problemas comunes

| Problema | Solución |
|---|---|
| El juego se ve vacío o los botones no hacen nada | Chrome con la aceleración por hardware apagada (WebGL no funciona): `chrome://settings/system` → activarla → reiniciar Chrome. Safari y Firefox funcionan. |
| "No hay servidor" | Abre el juego con `python scripts/jugar.py` (no abriendo el archivo HTML directo). |
| El puerto 8765 está ocupado | `python scripts/jugar.py --port 8766` |
| La IA no aparece / "no encontré el modelo" | Corre `jugar.py` con el `.venv` activado (necesita PyTorch para exportar los pesos al navegador). |
| Blender no toma el pedido | ¿Está abierto con `laboratorio.blend`? ¿*Proyecto* apunta a esta carpeta? Si lo abriste antes de actualizar, ciérralo y ábrelo otra vez. |
| El dron se va hacia un lado en la prueba atada | Banco → Motores: gira los 4 y revisa que cada M gire en su lugar y para su lado (ver la tabla del banco). |
| Un programa `.pbd` marca error | El mensaje dice la línea y casi siempre qué escribir. `ayuda <función>` en la terminal. |
