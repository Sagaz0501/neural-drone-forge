<div align="center">

# Neural Drone Forge

**Arma el dron. Entrena su cerebro. Míralo aprender a volar.**

Un juego de escritorio donde **la protagonista es la IA**: armas un dron pieza por pieza (atornillas, sueldas,
flasheas el firmware) y después le enseñas a volar con aprendizaje por refuerzo *en tu propia computadora*, paso a
paso: primero a despegar, después a llegar a un punto, a seguir una línea, a tomar fotos y a grabar. Y puedes
**ver el entrenamiento en Blender**: 50 drones probando a la vez y la red neuronal encendiéndose mientras aprende.

[English](README.en.md) · [Descargar y jugar](#descargar-y-jugar) · [Cómo se juega](#cómo-se-juega) · [Entrenar paso a paso](#entrenar-paso-a-paso-e1e12) · [PBDMM](#pbdmm-el-lenguaje-para-crear-ias) · [Roadmap](docs/ROADMAP.md) · [Documentación](#documentación)

![25 drones aprendiendo a grabar casas en el Drone Lab de Blender](docs/media/blender_entrenamiento.gif)

*25 drones aprendiendo a la vez en el Drone Lab de Blender: el cono de cada cámara pasa de rojo a verde cuando la
toma es buena. [Ver el minuto completo (MP4)](docs/media/blender_entrenamiento.mp4).*

*v3.0 · app de escritorio (Mac, Windows, Linux) · en español e inglés · 100 % local: tu compu entrena, nada sale a internet · MIT*

</div>

---

## Ahora es una app

Desde la **v3.0**, Neural Drone Forge se juega en **su propia ventana**, como cualquier juego: sin navegador, sin
barra de direcciones, a 60 fps con la GPU. La app arranca sola el servidor del juego (el que entrena la IA) y lo
cierra al salir. Los mismos gráficos de siempre, ahora como una app de verdad.

> **Por ahora** se descarga el código y se abre con un comando (abajo, 5 minutos).
> **Lo que viene:** un instalador `.dmg` para Mac y un `.exe` para Windows: lo bajas, le das doble clic y juegas.

## Qué es

Tu mamá te regala un dron de madera para armar: un ESP32, motores reciclados, una cámara de juguete y un cautín.
Lo armas en una **mesa de trabajo 3D** (cortas la cinta de las cajas, montas cada pieza, atornillas hasta el clic,
**sueldas** cada cable con flux y estaño), lo flasheas, pruebas los motores y lo amarras a la mesa para el primer
vuelo. Después prendes el computador, compras los programas y **entrenas su primera IA**. Cuando aprende a llegar
a un punto y mirar, te escribe tu primera clienta: Doña Marta quiere una foto de su casa.

Y el dron no la toma solo porque sí: **tienes que entrenarlo**. Cada dron tiene su propia red neuronal que aprende
con PPO (aprendizaje por refuerzo) según los premios y castigos que tú decides. Lo que aprende depende de su física
(peso, motores, hélices), del escenario y de cómo lo entrenas.

| | |
|---|---|
| ![El regalo](docs/img/v3/regalo.jpg) | ![Montar las piezas](docs/img/v3/montar.jpg) |
| **El regalo de mamá.** Así empieza todo: $150 y un dron de madera en cajas. | **La mesa de trabajo.** Cada pieza con su procedimiento: voltear el dron, tornillos por abajo, separadores… |
| ![Atornillar la controladora](docs/img/v3/atornillar.jpg) | ![Soldar la ESP32](docs/img/v3/soldar_esp32.jpg) |
| **Atornillar.** Mantienes el clic hasta que hace clic; si sigues, se barre la rosca. | **Soldar de verdad.** Estación, cautín, flux y estaño. Juntas frías y puentes que la mesa no te avisa. |
| ![Prueba de motores](docs/img/v3/prueba_motores.jpg) | ![El IDE en el tutorial](docs/img/v3/ide_tutorial.jpg) |
| **Prueba de motores.** Un botón, cada motor ✓ o ✗, y el arreglo que toca: el orden, el sentido o volver a soldar. | **Tu primera IA.** El tutorial te muestra qué línea cambiar (👉) y la entrenas con ▶ Correr. |
| ![El monitor y la red neuronal](docs/img/v3/monitor_red.jpg) | ![El avance del modelo](docs/img/v3/avance_modelo.jpg) |
| **Mírala aprender.** La curva de éxito y la red neuronal del dron que miras, en vivo. | **Avance del modelo.** Su mejor y su peor intento, con las gráficas y la red en cada instante. |

![Soldando el cable de la batería en el ESC](docs/media/soldar.gif)

## Descargar y jugar

Necesitas **Python 3.11+** (probado con 3.13) y **Node.js 18+** (para la app). **Blender** es opcional (probado
con 5.2): sirve para *ver* el entrenamiento en 3D, y el juego te lo recomienda.

```bash
# 1. Bajar el juego
git clone https://github.com/Sagaz0501/neural-drone-forge.git
cd neural-drone-forge

# 2. El motor de la IA (Python: el simulador, PPO, el servidor)
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# 3. La app
cd desktop
npm install
npm start                          # abre Neural Drone Forge en su ventana
```

Las veces siguientes solo es `cd desktop && npm start`. `npm start -- --freestyle` abre directo el freestyle.

<details>
<summary>¿Prefieres el navegador?</summary>

```bash
python scripts/jugar.py            # abre http://localhost:8765/app/ (Chrome, Safari o Firefox con WebGL)
```

Las partidas de la app y las del navegador se guardan por separado.
</details>

La [guía del jugador](docs/GUIA.md) explica todo paso a paso.

## Cómo se juega

1. **El regalo.** Le pones nombre a tu dron y lo armas en la mesa: montar, atornillar, soldar. El computador está
   apagado hasta que el dron vuele.
2. **El banco.** Prueba de humo (si algo quedó mal, se quema), firmware, configurar, motores, hélices y la prueba
   amarrado a la mesa.
3. **El computador.** Es el centro del juego: compras los programas que necesitas (Mensajes, el Simulador de IA o el
   IDE), la tienda de piezas, tus finanzas, los videos.
4. **Tu primera IA.** La entrenas en dos pasos: 🛫 **despegar y quedarse quieto** y 📍 **ir a un punto mirando hacia
   donde le pides**. Cada paso se aprueba con un examen (80 % sin ruido).
5. **Nivel 0.** Doña Marta te escribe: la foto de su casa. De ahí en adelante, los clientes te escriben al celular
   (fotos, inspecciones y videos de ★ a ★★★★), ganas plata y reputación, compras mejores piezas y nuevos escenarios,
   y tus drones con IA hacen los trabajos solos al terminar el día.

### Dos formas de jugar

| **Modo normal: la campaña** | **Modo desarrollador: crea la IA con código** |
|---|---|
| Entrenas la IA de cada dron en el **Laboratorio**: eliges el escenario y los premios y castigos de 0 a 10, en segundo plano o en Blender. | Escribes **cómo** se entrena cada modelo en **PBDMM**, un lenguaje con cara de Python, en un IDE con terminal, autocompletado, ayuda y la **red neuronal en vivo**. El tutorial te lleva de la mano por tu primer programa. |

## Entrenar paso a paso (E1–E12)

Enseñarle todo de una a una IA que no sabe nada es lento. Como a una persona, conviene enseñarle **de a poco**: primero
a volar, después a llegar, después a fotografiar. Cada **escenario** es un lugar de entrenamiento con su examen:

| | Escenario | Qué aprende |
|---|---|---|
| E1 | 🛫 Despegar y quedarse | Subir a una altura al azar y quedarse quieto 3 s (gratis) |
| E2 | 📍 Ir a un punto | Llegar a un punto al azar y quedarse mirando hacia donde se pide (gratis) |
| E3 | 〰️ Seguir una línea | Recorrer una línea curva sin salirse |
| E4 | 📷 Foto | El momento justo y el encuadre: la casa al centro |
| E5 | 🖼️ Set de fotos | Varias fotos seguidas alrededor del sujeto |
| E6 | 🎬 Video con ruta | Seguir la toma (fija, órbita, revelar) sin perder la casa |
| E7 – E9 | 🏛️ 💨 🏮 | Esquivar columnas, grabar con viento, grabar entre postes |
| E10 – E12 | 📦 🏁 🐇 | Entregas, carreras y persecución |

- **Examen 🎓:** 20 intentos fijos con la red tal cual (sin el ruido de exploración). Con 80 % o más, aprobado.
- **Cada escenario parte de lo que ya sabe:** el juego propone empezar desde el modelo que aprobó el anterior, y un
  20 % de los intentos **repasan** lo ya aprendido para que no lo olvide.
- **⭐ Modelo base:** el modelo que aprueba despegar, ir a un punto, seguir una línea, foto y video es tu modelo base:
  el punto de partida de todos los demás.

## Cómo aprende la IA

```
   38 sensores                    tu red neuronal                 4 palancas
 ┌──────────────┐        ┌─────────────────────────────┐       ┌───────────┐
 │ inclinación  │        │  38 → 128 → 128 → 4         │       │ gas       │
 │ velocidad    │ ─────▶ │  (o el tamaño que le des)   │ ────▶ │ roll      │
 │ dónde está   │        │                             │       │ pitch     │
 │ la meta      │        └──────────────▲──────────────┘       │ yaw       │
 │ 10 distancias│                       │ PPO ajusta los pesos  └─────┬─────┘
 │ el sujeto    │                       │ hacia lo que más pagó       │
 │ su física    │               ┌───────┴────────┐                    ▼
 └──────────────┘               │ premios (+)    │◀──── el simulador: física del
                                │ castigos (−)   │      quad, viento, obstáculos
                                └────────────────┘      (Python = JavaScript)
```

1. **50 drones practican a la vez** con el mismo cerebro (una *generación*).
2. Cada uno cobra **premios** (llegar, quedarse quieto, encuadrar) y paga **castigos** (chocar, temblar).
3. **PPO** mueve los pesos de la red un poquito hacia lo que dio más premio del esperado.
4. Se repite miles de veces. La curva de éxito sube, y en Blender lo ves pasar de caerse a volar.

El simulador existe **dos veces y hace exactamente las mismas cuentas**: en Python (donde entrena) y en JavaScript
(donde juegas). Una prueba lo verifica número por número. Por eso el modelo que entrenaste vuela igual en el juego.
Más en [cómo funciona por dentro](docs/ARQUITECTURA.md) y en [redes neuronales desde cero](docs/redes-neuronales.md).

## PBDMM: el lenguaje para crear IAs

*Python Base Dron Model Maker.* Un programa describe **cómo se entrena** un modelo. El primero del tutorial:

```python
modelo("mi_piloto", desde="cero")   # el nombre de tu IA · "cero" = empieza sin saber nada
mision("despegar")
dron("Chispa")                      # ← el nombre de TU dron
entrenar_en("blender")              # o "fondo": sin ventana

# el plan de vuelo
despegar(altura=2)
mantener(segundos=3)                # quieto 3 s
aterrizar()

def cada_generacion(e):             # el juego la llama mientras entrena
    print(f"gen {e.generacion}: éxito {e.exito:.0%}")
```

- Variables, listas, diccionarios, `if/for/def`, comprensiones, f-strings… **sin `import` ni `while`**: lo interpreta
  el juego, así que un programa que te pasen no puede tocar tu compu.
- **Autocompletado** que conoce el juego: `dron(` te ofrece tus drones; `desde=` tus modelos entrenados.
- Errores en español con la línea y sugerencias (*¿quisiste decir "chocar"?*).
- **Documentación del lenguaje: [docs/pbdmm/](docs/pbdmm/README.md)**: [tutorial](docs/pbdmm/tutorial.md),
  [referencia](docs/pbdmm/referencia.md), [gramática](docs/pbdmm/gramatica.md), [biblioteca](docs/pbdmm/biblioteca.md),
  [API de entrenamiento](docs/PBDMM.md) y [errores](docs/pbdmm/errores.md).

## Ver el entrenamiento en Blender

La primera vez que entrenas, el juego te pregunta si tienes Blender. Con Blender, el **Drone Lab**
(`blender/drone_lab.py`) muestra los drones volando en el escenario, la red neuronal del dron que miras y las curvas
de éxito; el juego le manda los pedidos y Blender los toma solo. Sin Blender se entrena en **segundo plano** (hasta 2
modelos a la vez) y lo miras en el Monitor.

## Estado

**Versión 3.0** ([releases](https://github.com/Sagaz0501/neural-drone-forge/releases)). Lo que hay hoy:

- ✅ **La app de escritorio** (Electron): su propia ventana, arranca y cierra el servidor sola.
- ✅ **El tutorial completo:** el regalo, el armado en la mesa 3D (montar, atornillar, soldar), el banco, el computador
  y la primera IA en dos pasos con examen. Todo con poco texto: un botón 🎯 «¿Qué sigo?» y lo que hay que tocar brilla.
- ✅ **La partida empieza en cero:** sin modelos ni programas; todo lo entrenas tú.
- ✅ **12 escenarios** de entrenamiento (E1-E12) con examen, repaso y ⭐ modelo base.
- ✅ Garaje 3D, tienda con piezas reales (ESP32, STM32, ExpressLRS, BLHeli…), inventario y hangar con varios drones.
- ✅ El negocio: clientes que escriben al celular, trabajos repetibles de ★ a ★★★★, la flota que trabaja sola.
- ✅ 3 pedidos de la campaña (casa, finca con viento, restaurante entre postes) con tomas calificadas y video.
- ✅ **Freestyle:** 3 mapas con tu control (PS5/Xbox), FPV y acro; carrera y persecución contra una IA entrenada.
- ✅ Modo desarrollador con PBDMM 3, Avance del modelo y Simular prueba, Blender como pantalla del entrenamiento.
- ✅ Español e inglés.

**Lo que viene:** los instaladores (`.dmg` y `.exe`), las partidas guardadas en archivos, pulir lo que hay y después
el Acto 2 de la historia. La historia completa y las fases, en el **[Plan maestro](docs/PLAN_MAESTRO.md)**; el paso a
paso, en el **[Roadmap](docs/ROADMAP.md)**.

## Documentación

| | |
|---|---|
| [Guía del jugador](docs/GUIA.md) | Los dos modos, el banco paso a paso, los pedidos, entrenar, controles, problemas comunes |
| [El lenguaje PBDMM](docs/pbdmm/README.md) | Tutorial, referencia, gramática, biblioteca, errores · [API de entrenamiento](docs/PBDMM.md) |
| [El negocio](docs/NEGOCIO.md) | Los clientes te escriben, trabajos repetibles con dificultad, la IA trabaja por ti |
| [Plan maestro](docs/PLAN_MAESTRO.md) | En qué fase vamos, la historia completa, misiones y recompensas, gráficos, la app |
| [Roadmap](docs/ROADMAP.md) | Qué mejorar, paso a paso |
| [Arquitectura](docs/ARQUITECTURA.md) | Cómo se conectan la app, el servidor, el entrenador y Blender |
| [Plan del juego](docs/PLAN_JUEGO.md) · [Campaña](docs/HISTORIA.md) | La idea original y los capítulos |
| [La base: drone-rl](docs/PROYECTO.md) · [Bitácora](docs/README_drone-rl.md) | El simulador y la IA de donde nace todo |
| [Redes neuronales desde cero](docs/redes-neuronales.md) | La teoría, explicada sin humo |
| [CHANGELOG](CHANGELOG.md) · [CLAUDE.md](CLAUDE.md) | Qué cambió · la guía para trabajar el proyecto con Claude Code |

## Pruebas

```bash
python -m pytest -q                                     # simulador + servidor (incluye: un piloto automático pasa E1-E3)
python game/make_fixture.py && node game/test_sim.mjs   # el simulador de JS == el de Python
node app/test_parts.mjs && node app/test_banco.mjs && node app/test_pbdmm.mjs && node app/test_negocio.mjs && node app/test_modulos.mjs && node app/test_i18n.mjs && node app/test_freestyle.mjs
```

Corren solas en cada push ([GitHub Actions](.github/workflows/pruebas.yml)).

## Créditos

Hecho por **Santiago Bernal** ([@Sagaz0501](https://github.com/Sagaz0501)), ingeniero de sistemas embebidos,
con [Claude Code](https://claude.com/claude-code). Three.js para el 3D, Electron para la app, stable-baselines3 +
PyTorch para el aprendizaje, Gymnasium para el entorno, Blender para el laboratorio.

Licencia [MIT](LICENSE).
