# La carrera del taller · plan (16-10-2026)

> Santiago: *"que el juego sea un poco más simulador… todo se maneja desde el computador… vamos a crear varias personas
> con varias propuestas: misiones grandes y pedidos pequeños… fotos, videos, recoger paquetes y volver, entregar,
> atrapar… alguien nos retó a competir en velocidad, en construcción de drones, alguien nos quiere comprar un dron que le
> armemos… que tenga fecha límite… que cuando complete una misión se desbloquee… un calendario… y misiones manuales muy
> de vez en cuando, para ganar bastante dinero, pero más difíciles."*

Este documento es la estructura completa. La primera parte ya está hecha (el computador como centro del juego); el resto
va por fases (sección 9).

## 1. La idea en una frase

Eres un taller de drones que crece: **los encargos te llegan al computador**, tú decides cuáles aceptas, armas y entrenas
los drones que hacen falta, y el calendario se llena. Los trabajos chicos pagan las cuentas; las **misiones grandes**
cambian el taller (clientes nuevos, lugares, piezas); los **retos** te dan fama; y vender lo que armas es otra forma de
ganar.

## 2. Dónde se juega cada cosa

| Lugar | Qué haces |
|---|---|
| **El garaje (afuera)** | Solo el hangar: elegir el dron, crear uno nuevo, entrar al banco de armado. Y el botón **💻 Computador** (también se abre tocando el portátil de la mesa). |
| **💻 El computador** | Todo lo demás, como apps: 💬 Mensajes, 📅 Calendario, ⭐ Campaña, 🧠 Laboratorio, 🛒 Tienda, 📦 Inventario, 🏦 Finanzas, 🎬 Videos, ⚙️ Ajustes (+ IDE, Documentación y Simuladores en el modo desarrollador). **Hecho.** |
| **La mesa de trabajo** | Armar y soldar (ya existe). |
| **El vuelo** | Volar tú o mirar a tu IA. |

Apps nuevas que vienen: **🧾 Trabajos** (la bolsa de pedidos disponibles, con filtros), **🏁 Retos** y **🛍️ Mercado**
(vender drones y encargos de armado).

## 3. Las personas

Cada persona tiene: **quién es** (avatar, cómo escribe), **qué pide** (sus tipos de trabajo), **cuánto paga y qué tan
exigente es**, una **relación** (♥: sube si cumples, baja si fallas o llegas tarde), **cuándo aparece** (reputación o
misión que la desbloquea) y a veces **a quién te recomienda**.

| Persona | Quién es | Qué pide | Se abre con |
|---|---|---|---|
| Doña Marta 👵 | inmobiliaria del barrio | fotos y videos de casas | el inicio (ya existe) |
| Don Ernesto 🤠 | finca | inspecciones, fotos de cultivos, viento | rep. 5 (ya existe) |
| Doña Lucía 👩‍🍳 | restaurante | videos para redes, entre postes | rep. 12 (ya existe) |
| Agencia Horizonte 🏢 | inmobiliaria grande | sets de fotos, videos premium | recomendación (ya existe) |
| **Paquetería El Rayo** 📦 | mensajería del pueblo | **entregas** A→B, con hora límite | misión "El primer envío" |
| **Farmacia San José** 💊 | farmacia | entregas chicas y **urgentes** (pagan doble, plazo de horas) | relación con El Rayo |
| **Taller El Tornillo** 🔩 | mecánico | **recoger y volver**: traer un repuesto de otro taller | rep. 12 |
| **Kevin FPV** 😎 | el rival del barrio | **retos**: carrera, armado, IA contra IA | misión "Un rival aparece" |
| **Club Los Halcones** 🏁 | club de carreras | torneos de velocidad (varios días) | ganarle a Kevin |
| **Profe Ramírez** 👨‍🏫 | colegio | **encargos de armado**: un dron educativo con presupuesto | rep. 20 |
| **Don Aurelio** 🧓 | coleccionista | **compra drones** armados (paga por calidad y estética) | tener 3 drones |
| **Bomberos voluntarios** 🚒 | emergencias | **atrapar/buscar**: seguir algo que se mueve, buscar en una zona (misiones **manuales**, raras) | capítulo 3 |
| **Cine Andino** 🎥 | productora | **misiones grandes**: rodajes de varios días con varios drones | capítulo 4 |

Los mensajes se escriben con la voz de cada uno (como hoy `clientes.json`), con variantes para que no se repitan.

## 4. Los tipos de trabajo

### Pedidos chicos (se repiten, salen de plantillas con dificultad ★ a ★★★★)

| Tipo | Qué hay que hacer | Qué lo hace difícil | Qué pide del dron / la IA |
|---|---|---|---|
| 📷 Foto · 🔎 Inspección · 🎬 Video | *ya existen* | viento, distancia, obstáculos | cámara, radio, IA de grabar (niveles 11-14) |
| 📦 **Entregar** | llevar un paquete de A a B y soltarlo en una zona | peso, distancia, hora límite, viento | **gancho** (extra), empuje/peso con carga, batería |
| 🔁 **Recoger y volver** | ir a B, recoger, volver a A | lo mismo, y aterrizar en B | gancho + aterrizaje preciso |
| 🎯 **Atrapar / seguir** | seguir algo que se mueve (un perro perdido, un dron intruso) y no perderlo | velocidad del objetivo, obstáculos | IA de **seguir** (nivel 15, ya planeado) |
| 🗺️ **Mapeo** | barrer una zona tomando fotos en cuadrícula | tamaño de la zona, batería | IA de fotos + ruta |

### Misiones grandes (la campaña: pocas, largas, cambian el juego)
Varias etapas y varios días ("rodaje de 3 días: tomas de día, de atardecer y una persecución"), a veces con
**varios drones a la vez**. Pagan mucho y **desbloquean** cosas (sección 6). Tienen fecha, pero generosa.

### Retos (fama y premios, no siempre plata)
- ⏱️ **Carrera de velocidad**: un circuito de puertas contra el tiempo de Kevin (su fantasma) o en un torneo.
- 🔧 **Reto de armado**: armar un dron que cumpla algo (*"menos de 250 g y que aguante 4 m/s de viento"*) con un
  presupuesto y en tiempo; el jurado mide peso, soldaduras, vuelo de prueba.
- 🤖 **IA contra IA**: tu modelo contra el del rival en la misma prueba.

### Ventas
- 🛍️ **Encargos de armado**: alguien pide un dron con requisitos y presupuesto; lo armas en la mesa, lo pruebas y lo
  entregas. Paga por **calidad** (juntas bien soldadas, peso, que vuele) y te lo pueden **devolver** si falla.
- **Vender drones del hangar** (Mercado): el precio sale de las piezas, su vida, la IA entrenada que lleva y tu
  reputación.

### Misiones manuales (muy de vez en cuando)
Una cada 7-10 días, como mucho: **tienes que pilotar tú** (la IA no sabe hacerlo todavía o el cliente no quiere), son
**difíciles** (viento fuerte, entre árboles, de noche) y pagan **×3 a ×5**. Avisan con tiempo y aparecen marcadas ✋.

## 5. El ritmo: días, plazos y el calendario

- Cada día llegan mensajes según tu reputación y tu relación con cada persona (como hoy en `negocio.js`), con un
  **tope de trabajo** para que no se acumule de más.
- Cada pedido tiene **fecha límite** (días; las entregas urgentes, horas del mismo día). Vencer baja la relación y la
  reputación; llegar temprano a veces da propina.
- El **📅 Calendario** (hecho) muestra los vencimientos con la cara de cada cliente, lo que llega de la tienda y el
  arriendo; viene: las misiones grandes en franjas de varios días, los retos con su fecha y **eventos** (la feria del
  pueblo: muchos pedidos de video; temporada de lluvias: más viento).
- **Notificaciones** en el escritorio cuando llega algo (un aviso abajo a la derecha, como un computador de verdad).

## 6. La progresión: qué se desbloquea con qué

```
Inicio ─ la foto de Doña Marta ─► Video de la casa (⭐) ─► Don Ernesto (finca, viento)
   │                                                     └─► "El primer envío" ─► Paquetería El Rayo (entregas) ─► Farmacia (urgentes)
   ├─ rep. 12 ─► Doña Lucía (restaurante) ─► Taller El Tornillo (recoger y volver)
   ├─ "Un rival aparece" ─► Kevin FPV (retos) ─► ganarle ─► Club Los Halcones (torneos) ─► piezas de carreras en la tienda
   ├─ rep. 20 ─► Profe Ramírez (encargos de armado) ─► Mercado (vender drones) ─► Don Aurelio (coleccionista)
   └─ capítulo 3 ─► Bomberos (misiones manuales) · capítulo 4 ─► Cine Andino (rodajes con varios drones)
```

Cada misión grande al completarse: abre **personas**, **tipos de trabajo**, **lugares** (mapas nuevos), **piezas** en la
tienda y a veces **herramientas** (la estación T12, el multímetro de verdad…).

## 7. La plata

| Tipo | Pago base | Varía con |
|---|---|---|
| Foto / inspección | $20-60 | dificultad, estrellas, relación |
| Video | $40-150 | tomas, viento, estrellas |
| Entrega / recoger | $25-120 | distancia, peso, urgencia (×2) |
| Misión grande | $300-1500 | etapas, drones |
| Reto | premio $50-500 + fama | rival, torneo |
| Encargo de armado | costo de piezas + mano de obra (30-80 %) | calidad, plazo |
| Misión manual ✋ | ×3-5 de lo normal | dificultad |

Los gastos van con el plan de "perder plata" del roadmap (arriendo, servicios, insumos, desgaste, multas, quejas).
Regla: un taller que trabaja bien siempre gana más de lo que gasta.

## 8. Cómo encaja en el código (para quien programa)

- **Personas y plantillas**: `app/data/clientes.json` y `trabajos.json` crecen (cada plantilla con su `tipo`). El motor
  de días de `negocio.js` sirve igual: solo aprende tipos nuevos, el **tope de trabajo** y las **misiones manuales**
  (probabilidad baja y bandera `manual: true`, que en la tarjeta deja solo "Volar yo").
- **Entregar / recoger**: el vuelo (`mision_sim.js` + `vuelo.js`) necesita **carga** (más masa mientras lleva el
  paquete; soltarlo en la zona). La IA necesita aprenderlo: un nivel nuevo en `drone_rl/env.py` (**16 · Entregar**,
  con la masa que cambia) y su copia en `game/sim.js` (regla: Python y JS iguales; `make_fixture.py` + `test_sim.mjs`).
  La masa del paquete ya es física del dron: va como entrada nueva al final si hace falta.
- **Atrapar / seguir**: el nivel **15 · Seguir** (ya planeado) con un objetivo que se mueve.
- **Carrera**: los aros ya existen (`game/worlds.js`, mundos de metas); falta el cronómetro, el fantasma del rival y el
  modo torneo.
- **Retos de armado y encargos**: usan el banco y la mesa como están (`taller.js`, `banco.js`): la nota sale de
  `cableado()` (juntas frías, puentes), del peso (`parts.js`) y de un vuelo de prueba (`mision_sim.js`).
- **Vender drones**: pasar un dron del hangar a un comprador (sale de `partida.js` con sus unidades) y cobrar.
- **Apps nuevas del computador** (`estudio.js`): Trabajos, Retos y Mercado, como ventanas igual que las de hoy.

## 9. Por fases

| Fase | Qué | Estado |
|---|---|---|
| **A** | El computador como centro (los dos modos); afuera solo el hangar; el Calendario | ✅ 16-10-2026 |
| **B** | Más personas y la **bolsa de trabajos**: tope de trabajo, notificaciones, misiones manuales raras ✋ | 🔜 |
| **C** | **Entregar y recoger** (carga en la física, gancho, nivel 16 de la IA) | |
| **D** | **Retos**: carrera contra Kevin, reto de armado, IA contra IA | |
| **E** | **Ventas**: encargos de armado, mercado, coleccionista | |
| **F** | **Atrapar/seguir** (nivel 15) y los bomberos; misiones grandes con varios drones (Cine Andino) | |
| **G** | Piezas reales en 3D (sección 10), de a poco y en paralelo | |

## 10. Piezas más reales (Blender e internet)

La ESP32 salió muy bien porque es **un script de Blender con medidas reales** (`blender/piezas/`). Para el resto hay dos
caminos, y conviene usar los dos:

1. **Seguir haciéndolas por script** (motores, ESC, batería, receptor, cámara, hélices): medidas de las hojas de datos,
   rápido y sin problemas de licencia.
2. **Traer modelos de verdad**, siempre revisando la licencia (y anotándola en `app/modelos/LICENCIAS.md`):
   - **Librería 3D de KiCad** (`kicad-packages3D`, CC-BY-SA con excepción para usos como este): módulos ESP32, USB,
     condensadores, conectores JST/XT60… en STEP/WRL, exactos.
   - **Fabricantes** que publican STEP de sus placas y motores (Holybro, SpeedyBee, Matek, T-Motor): mirar sus términos.
   - **GrabCAD** y **Sketchfab** (filtrar "descargable" y CC0/CC-BY): frames, cámaras, baterías.
   - **Printables/Thingiverse**: frames y soportes en STL (ya se pueden importar como diseño propio).
   - **Poly Haven** (CC0): texturas y luces (HDRI) para que todo se vea mejor.
   Camino técnico: STEP → Blender (con un importador STEP) → simplificar → nombrar las partes que importan (pads,
   agujeros) → GLB, igual que la ESP32. Ojo con el tamaño: menos de 1,5 MB por pieza.
