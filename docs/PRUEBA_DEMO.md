# Prueba de la demo completa (19-10-2026)

Claude jugó la demo de punta a punta como un jugador nuevo, en español y en modo normal: tutorial, armar y soldar el
primer dron, entrenar la IA, los pedidos, un segundo dron para la finca y el final. Pidió esta prueba Santiago: «juega el
tutorial completo y el dron…».

**Cómo se jugó:** un servidor aparte (`jugar.py --port 8821`, `DRONMAKER_DATOS` en una carpeta de prueba: no tocó las
partidas ni las IA de nadie) y Chrome sin pantalla con GPU (1600×1000), manejado por CDP con **ratón y teclado de verdad**
(`Input.dispatchMouseEvent/KeyEvent`). La página solo decía *dónde* está cada cosa en pantalla. Arrastrar las piezas,
atornillar hasta el clic, poner el cable en el pad, flux, cautín y Espacio para el estaño: todo con clics y teclas.
Los entrenamientos corrieron en segundo plano en esa carpeta.

**Atajos (los únicos):**
- La hora del reloj se adelantó por JS hasta el próximo pedido, para no esperar 30 minutos reales por día.
- El segundo dron se renombró por JS, porque el bug del nombre repetido ya había pasado (está arreglado).
- El selector de firmware y el control de viento se movieron con `value` + `change`, que es lo mismo que elegir en la lista.
- Los exámenes se tomaron con el botón 🎓; para saber *cuándo* tomarlos se preguntó a `/api/evaluar` cada pocos minutos
  (lo mismo que hace el botón).

Capturas: `scratchpad/pd/out/` de la sesión (p4_armado, p5_soldado, finca_resultado_*, fin_demo).

## Tiempos y plata

| Paso | Plata | Día | Tiempo real |
|---|---|---|---|
| Regalo → armar 8 piezas en la mesa (cajas, fantasma, R, voltear, tornillos) | $150 | 1 | ~3-4 min |
| Soldar 8 juntas + el arnés (8/8 buenas) | $150 | 1 | ~3,5 min |
| Banco: humo, firmware, calibrar, radio, motores, hélices, prueba atada | $150 | 1 | ~2 min |
| 💬 Mensajes ($10) + 🧠 Simulador ($30) | $110 | 1 | |
| **E1** despegar: examen 100 % | $110 | 1 | **1,5 min** (gen 49) |
| **E2** ir a un punto: examen 100 % | $110 | 1 | **4,5 min** (gen 252) |
| La foto de Doña Marta con la IA: 44/100, 1 ★ | $124 | 1 | 12 s de vuelo |
| Día 2: 1 foto ★★ · E3 ($30) + E4 ($45) | $74 | 2 | |
| Día 3: 1 foto ★★ | $104 | 3 | |
| Día 4: la IA falla la misma foto (el E2 se dañó de tanto entrenar: ver bugs) | $104 | 4 | |
| **E4** foto: el examen pasa a los **4 min** (90 %; la curva con ruido decía 0 %) | $104 | 5 | 4 min |
| Día 5: 7 entregas (fotos 43-59/100 ★★, techo de 1 foto ★★) | $396 | 5 | 10-15 s por vuelo |
| E5 ($60) + E6 ($90) | $246 | 6 | |
| Kit del garaje ($119) + motores 2204 ($35) → **Halcón** (empuje/peso 2,98 + barómetro); Madera sigue en el hangar | $92 | 6 | |
| Halcón: mesa + soldar (8/8) + banco | $92 | 6 | ~8 min |
| Día 6: 4 entregas con Madera · llegan los especiales: video de la casa y **video de la finca** ($80) | $270 | 6 | |
| **E5** de Halcón (parte de «madera»): examen 100 % | $270 | 6 | **2 min** |
| **E6** de Halcón con viento 2,5 m/s: examen 90 % (gen 2239) | $270 | 6 | **~30 min** (igual a `ENTRENAMIENTO_PROBADO.md`) |
| Video de la finca con Halcón, radio del kit (20 m): «Se perdió la señal» 2 veces (−2 rep c/u) | $270 | 6 | 40 s por vuelo |
| ESP-NOW + antena ($12, 35 m) → otra vez a la mesa (abrir la caja, montarla), soldar y banco | $258 | 6 | ~3 min |
| Video de la finca: 1.º intento 40/100 (una toma < 50 %: no lo entrega), 2.º **41/100 → ★ +$56** | $314 | 7 | 56 s por vuelo |
| «🔓 ¡Don Ernesto tiene su video! Se abrió un simulador nuevo» → 🎮 Simuladores → «Comprar» E7 → **FIN DE LA DEMO** (2 drones, 7 días, $314, 2.248 generaciones, 16 pedidos + lo del juego completo). No cobra. | $314 | 7 | |

**Total:** 7 días de juego (la meta de `docs/ECONOMIA.md` es 3-5). Lo que más alargó: el bug 8 (un día perdido con la IA
dañada) y el bug 13 (la radio). Tiempo real ~3,5 h, casi todo esperando: entrenar (E1 1,5 + E2 4,5 + E4 4 + E5 2 + E6 30
min ≈ 42 min) y los vuelos de la IA en este Chrome sin pantalla (~3 min cada uno los primeros días; 10-60 s después).

## Bugs encontrados y arreglados

| # | Qué pasaba | Arreglo |
|---|---|---|
| 1 | Si cerrabas el juego antes de aceptar el regalo, al volver no salía y la nota decía «🎁 Abre el regalo» sin regalo: el tutorial quedaba trabado | `main.js` `irTaller()` vuelve a mostrar el regalo (`regalo()`), y con la etapa «nombre» sigue a «armar» |
| 2 | El log de flashear decía «Escribiendo en 0x65536025d00» (sumaba un número con un texto) | `ui_banco.js`: la dirección se suma y después se pasa a hex |
| 3 | **Sin Blender, «Empezar a entrenar» dejaba el pedido esperando a Blender**, y el selector «Dónde entrena» quedaba fuera de la vista (abajo del panel) | `main.js` `labIniciar()`: si Blender no está abierto, pregunta «¿Entreno en segundo plano?» |
| 4 | «Hay otro entrenamiento corriendo en Forge/actualizaciones/3.1.3»: la ruta se cortaba en el primer espacio | `jugar.py` `other_trainers()`: la carpeta completa (con espacios) |
| 5 | **Simuladores, al reabrir el computador, no mostraba el 🎓 Examen** (se dibujaba antes de tener la lista de modelos) | `estudio.js` `cargarModelos()`: si cambia la lista y Simuladores está abierto, se vuelve a dibujar |
| 6 | Con 1 ★ el cliente decía «le pago la mitad», y ahora paga el 70 % | `clientes.json` (es y en): «un poquito menos» |
| 7 | **Después del tutorial (día 1, 10:30) no llegaba ningún pedido hasta mañana**: unos 15 minutos sin nada que hacer | `negocio.js`: cuando arranca el reloj y hoy no llegó nada, los pedidos de hoy llegan en lo que queda del día (`agendar`) + prueba en `test_negocio` |
| 8 | **El entrenamiento seguía solo después de aprobar y la IA se dañaba**: E2 al 100 % en la gen 250, entre 45 y 77 % en la 1.630. Como la flota y «Que grabe la IA» usan la última generación, la IA falló la misma foto 10 veces (−2 de reputación cada vez) | `estudio.js` `examen()`: al aprobar, si esa IA sigue entrenando ese escenario en segundo plano, se detiene y guarda (modo normal). Coincide con `docs/ENTRENAMIENTO_PROBADO.md`: «E5… cayó a 0 % dos veces» |
| 9 | **Las inspecciones del techo pedían 2 fotos (un set = E5) cuando solo tienes el E4**: la IA no sabía hacerlas | `negocio.js` `llega()`: sin E5, las inspecciones llegan con 1 foto (como las fotos). `docs/ECONOMIA.md` ya las contaba así |
| 10 | El aviso «¿La IA está lista?» decía «si la IA no entrega **el video**» también en fotos | `main.js`: «el trabajo» |
| 11 | Al comprar E5/E6, los pedidos especiales (videos) llegaban recién con la próxima entrega o al otro día | `estudio.js`: al comprar un simulador se revisan los especiales y avisa «⭐ Te escribieron…» |
| 12 | El Kit del garaje creaba otro dron llamado «Madera» (dos iguales en el hangar) | `main.js` `armarKit()`: «Madera 2», «Madera 3»… |
| 13 | **La radio del kit (ESP-NOW, 20 m) no alcanza la finca**: sus tomas llegan a ~24-28 m de la base, el dron pierde la señal y aterriza (−2 de reputación). La pista 🎯 y `test_economia` daban por bueno el dron con empuje/peso ≥ 2,2 + barómetro, y el briefing lo mostraba como aviso suave («failsafe asegurado») | `demo.js` `ALCANCE_FINCA = 30` y la pista pide «+ radio de 30 m: ESP-NOW + antena» ($12, 35 m); `main.js pistaDemo` lo revisa; `test_economia` arma la finca con `rx_espnow_ant` (el dron sale $131 y el camino sigue en día 4 con 1 y 2 ★); `docs/ECONOMIA.md` |

Para la prueba también se agregaron a `mesa._prueba` (el gancho de pruebas de la mesa) `objetivo`, `fuentes`, `conFlux`
y `placas`: no cambian el juego.

## Pendientes (anotados, no arreglados)

- **Con pocos fps, «mantén apretado» y los tornillos tardan más de lo que dice el juego**: `mesa.js` limita el paso a
  0,05 s por cuadro (`dt = Math.min(0.05, …)`). A 5 fps, apretar la correa (1,2 s) toma ~5 s reales. En un PC normal
  (60 fps) no se nota. Se podría subir el tope a 0,1 s.
- La IA con el E4 aprobado (85 %) igual saca fotos de 39-59/100 con la cámara de juguete (20/100): ★ o ★★. El examen mide
  «llegó y se quedó quieta», no el puntaje del cliente. Puede confundir: «aprobó pero el cliente paga menos».
- Si la IA falla un pedido, el pedido sigue abierto y se puede reintentar sin límite (−2 de reputación cada vez). Un
  jugador apurado puede quedar en reputación 0 en un rato.
- El hangar dice «Compra el Kit del garaje…» mientras sale el regalo de mamá (que trae el kit gratis).
- La pantalla de motores del banco dice «gris = lo que espera Betaflight» aunque el firmware sea ESP-FC.
- El Kit del garaje trae los motores 1806: para la finca hay que comprar además los 2204 ($35) y elegirlos en el dron
  (Kit + 2204 = $154; comprando pieza por pieza son $134, como dice `docs/ECONOMIA.md`). Nada te lo sugiere.
- Las **fotos** de la finca (pedido normal de Don Ernesto) con el dron de madera también pierden la señal a veces; se
  recupera al reintentar. El briefing lo avisa en amarillo con el texto «failsafe asegurado», que suena a «todo bien».
- El video de la finca con la cámara de juguete (20/100) sale 40/100: con mala suerte una toma queda < 50 % y el cliente
  no lo acepta (−2 rep). Al segundo intento pasó.
- Comprar E7 en la demo no cobra y el simulador no queda comprado (correcto para la demo, pero el botón dice «Comprar $…»).
- En inglés, los nombres de los sensores de la red salen en español (visto en las capturas de Steam).
