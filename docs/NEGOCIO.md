# El negocio · cómo se juega Neural Drone Forge

> **Estado (16-10-2026):** hecho el celular, el tutorial del día 1, fotos, inspecciones, videos repetibles, las 4
> dificultades, los 4 clientes con relación y recomendaciones, el arriendo, los pedidos especiales por el chat (v1.0) y
> la **flota** (pasos 1 a 5 del orden de trabajo). Falta: encargos de armado, pruebas de drones, a mano y entregas.
>
> Diseño del 15-10-2026 (idea de Santiago). Cambia la forma del juego: deja de ser una lista de misiones y pasa a ser
> **un negocio de drones al que le escriben los clientes**. La campaña de [`HISTORIA.md`](HISTORIA.md) no se pierde:
> sus pedidos pasan a ser los **pedidos especiales** que hacen crecer la empresa.

## La idea en una frase

Tienes un negocio de drones en tu garaje. **Los clientes te escriben al celular.** Unos trabajos son fáciles y se
repiten, y otros piden más de lo que tienes. Con lo que ganas mejoras tus drones o armas más, y **cuando un trabajo se
repite mucho, entrenas una IA para que lo haga por ti.**

Esto último es lo que hace que la IA sea la protagonista: hacer a mano la misma foto por décima vez es aburrido a
propósito. Así nace la pregunta *"¿y si lo hace mi dron solo?"*.

## El ciclo

```
 📱 te escribe un cliente ──► lees el pedido (qué quiere, cuánto paga, qué pide)
        │                         │
        │              ¿tienes con qué?  ── no ──► tienda / banco: compras, armas o mejoras un dron
        │                         │ sí
        ▼                         ▼
   aceptas o rechazas ──►  eliges QUÉ DRON del hangar va  ──►  vuelas tú … o lo vuela su IA
                                                                    │
   reputación y relación con ese cliente ◄── estrellas ◄── entregas por el chat (foto / video / dron / informe)
        │
        └──► más clientes, trabajos más difíciles y mejor pagados, clientes que vuelven
```

## El celular

- Una app de mensajes dentro del juego: **"Mensajes"**, con aspecto de chat. No usa la marca de WhatsApp.
  Cada cliente tiene su chat, su foto y su forma de escribir (Doña Marta escribe con mucho cariño y emojis, Don
  Ernesto corto y sin tildes, la agencia formal).
- Un pedido llega como mensaje y abajo trae una **tarjeta**: qué quiere, dónde, cuánto paga, para cuándo y qué
  pide (✱). La tarjeta trae tres botones: **Aceptar**, **¿Qué me falta?** y **No, gracias**.
- **¿Qué me falta?** compara los requisitos con cada dron de tu hangar (con la misma lógica de `requisitos.js` que
  usa PBDMM). Te dice qué dron está más cerca y qué piezas le faltan, con un enlace a la tienda.
- Entregas por el mismo chat: la foto o el video aparecen en la conversación y el cliente responde según las
  estrellas: *"¡Quedó divina! Ya se la mando a mi hija"* o *"Mmm, se ve movida… igual le pago, pero menos"*.
- Las respuestas tienen 2 o 3 opciones para elegir (no hay que escribir). Elegir bien da un poco más de relación: por
  ejemplo, avisar si no alcanzas para mañana.

## Los días

- El juego avanza por **días**. Cada día llegan de 1 a 3 mensajes nuevos, según tu reputación.
- Cada pedido tiene un plazo de 1 a 5 días. Si se vence, el cliente se va y pierdes un poco de relación con él, no de
  reputación.
- El día termina cuando lo decides (**Terminar el día**) o al hacer 3 trabajos. Los drones que entrenan en el fondo
  siguen entrenando entre días: el tiempo de juego no frena el entrenamiento real.
- **El reloj (19-10-2026, pedido de Santiago):** el día despierto va de 7:00 a 23:00 y dura **30 minutos jugando**
  (1 hora del juego ≈ 1 min 52 s; `trabajos.json` → `reloj`: `minutos`, `despierta`, `duerme`, `llegan`). Los pedidos
  del día quedan en una agenda (`negocio.agenda`) y **llegan a su hora**, entre las 8:00 y las 19:00 (mensaje con hora +
  aviso). Un pedido vence a las 23:00 de su último día: la tarjeta dice «Vence hoy a las 23:00 · quedan 3 h 20 min».
  A las 23:00 te vas a dormir solo (vuela la flota y empieza el día siguiente; si estás volando, espera a que aterrices);
  también puedes **😴 Dormir hasta mañana** antes (los pedidos que faltaban llegan al despertar). El reloj corre solo
  mientras juegas (no en el inicio, en pausa ni con la ventana minimizada) y arranca después del tutorial.
  `NG.tick(p, D, seg)` cada segundo (main.js), `NG.queda()`, `NG.fmtHora()`. Sin reloj (las pruebas) todo llega al tiro.
- Con 1 ★ el cliente también te vuelve a escribir: la relación sube con cualquier entrega (antes solo con 2 ★ y una
  IA que sacaba 1 ★ te dejaba solo con Doña Marta, sin reputación ni plata).
- No hay gastos fijos en el capítulo 1. Desde el capítulo 2 pagas el **arriendo del local** (semanal, bajo), para
  que los trabajos repetidos tengan sentido.

## Los tipos de trabajo

| Tipo | Qué haces | Se entrega | Dificultad | Cuándo aparece |
|---|---|---|---|---|
| 📷 **Foto** | Llegas a un punto y disparas (1 a 3 fotos) | fotos `.png` | ★ el más fácil | Desde el tutorial |
| 🎬 **Video** | Sigues el guion de tomas (lo que ya existe: fija, órbita, revelar) | `.webm` | ★★–★★★★ | Capítulo 1 |
| 🔎 **Inspección** | Te acercas a varios puntos (techo, antena, paneles) y te quedas quieto | fotos de cada punto | ★★ | Capítulo 1 (después de la finca) |
| 🛠️ **Encargo de armado** | Un cliente quiere un dron con requisitos (peso, minutos, presupuesto) y se lo armas en el banco | el dron (sale de tu hangar) | ★★–★★★★ | Capítulo 2 |
| 🧪 **Prueba de dron** | Llega un dron ajeno que falla. Lo revisas en el banco (multímetro, cables, motor al revés, firmware) y entregas un informe | informe con el diagnóstico | ★★–★★★★ | Capítulo 2 (con la Fase 2: soldar y multímetro) |
| 🎮 **Pilotaje a mano** | Un show, una carrera o freestyle: lo vuelas tú, sin IA | video | ★★★ | Fase 3 (mando de PS5) |
| 📦 **Entrega** | Llevar un paquete de A a B | el paquete | ★★–★★★★ | Futuro |

- **Foto** es nueva y es la puerta de entrada: una sola toma fija y un disparo. Se califica el encuadre en ese
  instante con `film_quality` de una toma fija, así que la IA ya la sabe hacer (nivel 11 con toma fija).
- **Inspección** se entrena con el nivel 13 · Foto (el 30 % de los intentos encuadra el techo) y el 14 para varias
  fotos seguidas.
- **Encargo de armado** y **Prueba de dron** no se vuelan: son trabajos de banco. Le dan sentido al banco de armado y
  al multímetro, y tienen mucho del trabajo real de Santiago (QA y embedded).

## Trabajos repetibles, con dificultad

Cada trabajo sale de una **plantilla** (`app/data/trabajos.json`): un tipo, un lugar y lo que puede variar. El juego
arma cada pedido con una semilla (`pedido.variante`, que ya existe), así que la casa, las tomas y el viento cambian.
Cada plantilla tiene **4 niveles de dificultad**:

| | ★ | ★★ | ★★★ | ★★★★ |
|---|---|---|---|---|
| Viento | 0 | 0–1,5 m/s | 1,5–3 m/s | 3–4,5 m/s con ráfagas |
| Distancia | ≤ 15 m | ≤ 25 m | ≤ 40 m | ≤ 80 m |
| Obstáculos | nada | árboles lejos | postes o gente cerca | todo junto |
| Estrellas pedidas | 1 | 2 | 2 | 3 |
| Pago | base | ×1,6 | ×2,5 | ×4 |
| Plazo | 5 días | 4 | 3 | 2 |

- Lo que aparece depende de tu reputación: con poca, casi todo es ★; con más, aparecen ★★★ y ★★★★, pero las ★ siguen
  llegando (son las que conviene darle a la IA).
- **Los requisitos salen de la dificultad**, no se escriben a mano. Por ejemplo: viento de 3 m/s → empuje/peso ≥ 2,4 y
  barómetro; distancia de 40 m → radio de 40 m o más; gente cerca → protectores. Así un mismo trabajo ★ lo hace
  tu dron de madera, y el ★★★★ te obliga a comprar o armar otro.

## Qué te piden según lo que tienes (19-10-2026, pedido de Santiago)

Los clientes solo piden lo que tu taller ya puede hacer (`negocio.js posible()`): con E1-E2 llegan **fotos de 1**
(la casa, la fachada de cerca, la casa con el jardín: `foto_casa`, `foto_fachada`, `foto_lejos`); la inspección del techo
llega con E4; los sets de fotos y los **videos** (y el video especial de la casa) cuando tienes E5 y ya puedes comprar E6.
Son 3 pedidos por día desde el principio, para juntar la plata de los simuladores.

**Clientes que mienten** (`trabajos.json "mentiras"`): desde el día 3, 1 de cada 5 pedidos de fotos dice "sin viento"
y en el lugar sopla 1-2,5 m/s más. La tarjeta y el briefing muestran lo que dijo el cliente (`pe.viento`, y de eso salen
los requisitos); el vuelo usa `pe.viento_real` (el HUD lo marca). Al entregar, el cliente lo reconoce. Enseña a entrenar
con algo de viento aunque el pedido diga que no.

## Los clientes

`app/data/clientes.json`: cada cliente tiene nombre, foto, forma de escribir, qué tipos de trabajo pide, de qué
dificultad y cuánto paga.

- **Relación** (0 a 5 ❤️) con cada uno: sube con buenas entregas y baja con entregas malas o pedidos que dejas
  vencer. Con ❤️❤️❤️ paga un 20 % más y **te recomienda** (aparece un cliente nuevo que dice *"me dio su número
  Doña Marta"*).
- **Clientes de siempre:** Doña Marta (inmobiliaria: fotos y videos de casas, siempre ★–★★), Don Ernesto (finca:
  viento, inspección del techo del granero) y la Agencia Horizonte (muchas casas, ★★–★★★, poco plazo).
- Los **pedidos especiales ⭐** son los de la campaña (casa, finca, restaurante, concesionario, ciclista…). Llegan
  cuando tienes la reputación, no vencen y hacen avanzar el capítulo.

## Reutilizar drones (el hangar)

- Para cada trabajo eliges **qué dron va**. El chat sugiere el que mejor cumple.
- Las piezas se gastan (`vida`, que ya existe). Volar seguido el mismo dron cuesta mantenimiento: hélices, gomas,
  batería que pierde minutos. Por eso conviene tener más de uno.
- Un dron puede tener un **propósito** (ya existe): "Fotos", "Viento", "Inspección". Su IA se entrena para eso.

## La IA entra al negocio

1. **Capítulo 1:** todo a mano. La repetición se siente.
2. Al terminar la finca se desbloquea el **Laboratorio**. El primer pedido especial pide justamente *"enséñale a tu dron
   a sacar la foto de la casa solo"*.
3. **"Que lo haga la IA"** en la tarjeta del pedido (ya existe para el pedido de la casa). El trabajo se vuela con la
   IA del dron y lo puedes mirar o saltar.
4. **Flota ✅:** con varios drones con IA, mandas varios trabajos a la vez mientras vuelas el ★★★★. Es ingreso pasivo
   y es la razón para entrenar bien. Cómo funciona (16-10-2026):
   - En la tarjeta del pedido, **🤖 A la flota** → eliges el dron. Cada dron lleva **un trabajo por día**; los que no
     pueden dicen por qué (sin armar, piezas rotas, sin terminar en el banco, le falta lo que el cliente exige sí o sí).
     El tutorial no: ese lo vuelas tú.
   - Al **terminar el día** sale la flota: cada trabajo es un **vuelo de verdad sin pantalla** (`mision_sim.js`, la
     misma física, batería, radio y calificación que un vuelo que miras; ruta nueva cada vez) con la IA del dron (la suya
     o la base). Tarda menos de 0,1 s por trabajo.
   - Si entrega, el cliente paga por el chat como siempre. Si no (le faltaron tomas, chocó, batería, failsafe), **el
     cliente no se entera**: el pedido sigue abierto hasta que venza, y en su chat queda una nota 🤖 con el motivo. Los
     choques sí dañan el dron.
   - Sale un **reporte de la flota** en el celular: quién voló qué, con qué IA, estrellas, calidad de cada toma, plata
     y daños.
5. Un trabajo mal hecho por la IA cuesta reputación (ya pasa: −2 con "Que grabe la IA"). Entrenar mal tiene precio. Con
   la flota: si entrega y no le gusta (0 ★), baja la relación; si no entrega, se pierde el día del dron y los daños.

En el **modo desarrollador** el negocio sigue igual, pero cada dron nuevo abre un capítulo de la ruta del
programador ([`PBDMM2_PLAN.md`](PBDMM2_PLAN.md) §7), y los trabajos que llegan al celular son los retos de entrenar.

## El tutorial (día 1, muy fácil)

1. El juego empieza en el garaje con $150 y el kit. **Vibra el celular.**
2. 📱 *Doña Marta:* "Hola mijo, buenas tardes 😊 Me dijo mi vecina que usted toma fotos con drones. Estoy vendiendo
   la casa de mi mamá y necesito una foto bonita desde arriba. ¿Me puede ayudar? Le pago $20."
   Respondes: **"¡Claro que sí, Doña Marta!"** / "¿Para cuándo la necesita?"
3. La tarjeta: 📷 Foto ★ · casa · $20 · 3 días · ✱ nada. Aceptas.
4. Armas el dron de madera en el banco, con los pasos guiados (lo que ya existe, con flechas).
5. Vuelas a la casa. Una flecha te lleva al punto y un recuadro te muestra el encuadre. **Espacio = foto.**
6. Envías la foto por el chat. Doña Marta: *"¡Ay, quedó divina! 😍 ¿Y un video para la inmobiliaria? Le pago $45"* →
   es el pedido de la casa que ya existe, ahora como segundo paso.
7. **Fin del día 1.** El día 2 llegan otro pedido de foto de Doña Marta (repetido, con otra casa) y el primer mensaje
   de Don Ernesto ("me paso su numero doña marta").

Cada paso enseña una sola cosa: el celular, aceptar, el banco, volar, disparar, entregar y el día. No hay texto largo.

## Números iniciales (para balancear editando el JSON)

| | |
|---|---|
| Foto ★ | $20 (+ $10 por estrella) |
| Video ★ | $45 |
| Inspección ★★ | $60 |
| Encargo de armado | costo de las piezas + 40 % |
| Prueba de dron | $50–$150 según la falla |
| Arriendo del local (desde el cap. 2) | $60 por semana |
| Pedidos por día | 1 (rep 0) · 2 (rep 5) · 3 (rep 12) |

## Que la IA aprenda los trabajos (Fase 1b, 16-10-2026)

- Cada trabajo dice qué misión del Laboratorio le enseña a la IA (`negocio.js entrenarPara`): 1 foto → **Foto**
  (nivel 13), 2 o más → **Set de fotos** (nivel 14), un video → la misión de su pedido de la campaña (nivel 11/12).
  *Entrenar la IA* en el briefing abre el Laboratorio con esa misión elegida.
- El modelo anota en `meta.tomas` lo que practicó (`"foto"` para los niveles 13-14); el briefing y el aviso de "Que
  grabe la IA" lo usan para decir si ya entrenó esas tomas.
- Las **inspecciones** 🔎 fotografían el **techo** (`lugares.js`: el sujeto pasa a ser la mitad del techo). Antes
  apuntaban a la pared desde 5,6-6,8 m de alto: con la cámara fija 15° abajo, ni un vuelo perfecto encuadraba (encuadre
  ideal 0-19 %); ahora 67-100 %. El entrenamiento hace lo mismo (30 % de las fotos de los niveles 13-14 son del techo).

## Datos

```
app/data/clientes.json   clientes: nombre, foto, estilo de escribir (plantillas de mensajes), tipos, dificultad, pago
app/data/trabajos.json   plantillas: tipo, lugar, tomas o puntos, cómo cambia con ★ (viento, distancia, obstáculos),
                         mensajes de entrega por estrellas
app/data/misiones.json   sigue siendo la campaña: sus pedidos = pedidos especiales ⭐
app/negocio.js           el día, generar pedidos (semilla + dificultad + reputación), relación, vencer
app/celular.js           la pantalla del chat (tarjetas, respuestas, entregas, 🤖 a la flota, el reporte)
app/flota.js             la flota: vuela los trabajos asignados al terminar el día y aplica lo que pasó
app/mision_sim.js        un vuelo sin pantalla (vuelo.js hereda de él): lo usa la flota
app/requisitos.js        qué pide un pedido y qué dron cumple (lo comparten el chat, el briefing y PBDMM)
partida.negocio          { dia, chats: {cliente: [...mensajes]}, pedidos: [...], relacion: {cliente: n} }
                         un pedido con flota lleva pe.flota = id del dron; las notas de la flota son mensajes "sistema"
```

## Orden de trabajo

1. **`requisitos.js`** (lo usan PBDMM 2 y el celular) y el trabajo **📷 Foto**: una toma fija y un disparo.
2. **El celular** con el tutorial del día 1 (Doña Marta), los días y los plazos.
3. **Plantillas y dificultad ★–★★★★** + generar pedidos repetibles + clientes con relación.
4. **🔎 Inspección.**
5. ✅ **Que lo haga la IA** para cualquier trabajo y **flota** (varios a la vez).
6. **🛠️ Encargos de armado** y **🧪 Pruebas de dron** (con la Fase 2 del roadmap).
7. 🎮 Pilotaje a mano (Fase 3) y 📦 entregas.
