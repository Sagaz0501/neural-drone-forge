# Marketing · la página de Steam, los GIFs, X y cada release

Todo lo que hace falta para mostrar Neural Drone Forge sin gastar plata. Las imágenes salen del juego de verdad
(gráficos v3.1, capturadas con Chrome sin pantalla; ver «Cómo se hicieron» al final).

## 1. Lo que aprendimos del video (Marketing cero pesos, Black Jack GS)

- **Construir comunidad, no comprar audiencia.** La moneda es tiempo, transparencia (mostrar el proceso) y contenido.
- **X es la cancha principal y el rey es el GIF de 3-5 s** de algo satisfactorio. 3-4 posts por semana, mostrar la
  evolución (boceto → modelo → animación), hilos con lecciones, hashtags `#gamedev #indiegame #indiedev`.
- **Creadores chicos** (50-500 espectadores, de nuestro género): mensaje personal + una llave + una build estable.
- **La página de Steam vende sola:** tráiler que empieza con lo mejor (sin logos largos), capturas variadas, descripción
  con lista de features en negrita, tags específicos.
- **Eventos:** Steam Next Fest con la demo, game jams y showcases online. Cada evento = un mini lanzamiento.
- **Plan de 6 meses:** mes 1-3 X + GIFs · mes 4-5 página de Steam + wishlists + llaves a streamers chicos · mes 6 Next Fest.

Nosotros ya tenemos demo, web e Instagram, así que vamos adelantados: **la página de Steam ya se puede abrir.**

## 2. La página de Steam

### Lo que tiene que hacer Santiago (no lo puedo hacer yo)
1. Cuenta de Steamworks (partner.steamgames.com) con su cuenta de Steam: datos fiscales y bancarios.
2. Pagar el **Steam Direct: US$100** por el juego (se devuelve después de US$1.000 en ventas).
3. Crear la app, subir lo de esta carpeta y pedir la revisión de la página «Próximamente» (tarda unos días).
4. Decidir el **precio** (o gratis). Mi recomendación: la demo gratis siempre y el juego completo pagado
   (US$9,99-14,99) cuando tenga la campaña; mientras tanto, «Próximamente» + wishlists.

Steam también pide build para **Windows** (casi todo el público está ahí): el .exe ya se arma en GitHub Actions,
falta probarlo en un PC.

### Imágenes (`steam/capsulas/`, tamaños exactos de Steam)

| Archivo | Tamaño | Dónde sale |
|---|---|---|
| `header.png` | 920×430 | Arriba de la página, búsquedas, recomendados |
| `small.png` | 462×174 | Listas y búsquedas |
| `main.png` | 1232×706 | Portada de la tienda (carrusel grande) |
| `vertical.png` | 748×896 | Ofertas y eventos (vertical) |
| `library.png` | 600×900 | La biblioteca del jugador |
| `library_hero.jpg` | 3840×1240 | El fondo grande de la biblioteca (sin texto) |
| `library_logo.png` | 1280×720 | El logo transparente encima del hero |

Las cápsulas llevan solo el arte y el título (regla de Steam: nada de frases ni premios encima).

### Capturas (`steam/capturas/`, 1920×1080, Steam pide mínimo 5)

01 el garaje con el dron de madera · 02 soldando el ESC · 03 el computador: el código, la curva de aprendizaje real
y la red neuronal en vivo · 04 el avance del modelo (la red en el instante) · 05 la carrera de IA en el estadio ·
06 la tienda · 07 el inicio. **Orden recomendado en Steam: 03, 02, 05, 01, 04, 06, 07** (lo primero que se ve es la IA).

### GIFs (`steam/gifs/`, cada uno en `.gif` para Steam y `.mp4` para X/Instagram)

| GIF | Qué muestra | Dónde va |
|---|---|---|
| `soldar` | cable → flux → cautín → estaño → humo → junta brillante (5 s) | descripción: «Build it for real» |
| `ia_antes_despues` | generación 3 (se pierde) vs generación 766 (se queda en el aro) | descripción: «Train its brain» |
| `freestyle_ia` | la IA corriendo de noche en el estadio por los portales | descripción: «Race the AI» |
| `dron_garaje` | la cámara alrededor del dron de madera | arriba de todo de la descripción |

### Textos (inglés = idioma principal en Steam; abajo el español)

**Short description (≤ 300 caracteres):**

> Build a drone from a box of parts, solder it wire by wire, then train a real neural network to fly it. Watch 50
> drones learn at once, take photo jobs from lying clients, and race your AI at night. Every AI you train is yours.

**About this game:**

```
[img]dron_garaje.gif[/img]

Your mom gave you a drone… in boxes. Build it, solder it, and teach it to fly itself.

[h2]Build it for real[/h2]
[img]soldar.gif[/img]
[list]
[*][b]Open the boxes and mount every part[/b]: frame, motors, ESC, flight controller, camera, battery.
[*][b]Solder wire by wire[/b]: heat the pad, add flux, feed solder. Cold joints and bridges are real, and nobody tells you.
[*][b]Test it like an engineer[/b]: multimeter, smoke test, motor order and direction, tethered test.
[/list]

[h2]Train its brain[/h2]
[img]ia_antes_despues.gif[/img]
[list]
[*][b]A real neural network[/b] learns to fly with reinforcement learning, right on your PC.
[*][b]12 training scenarios[/b]: take off, reach a point, follow a line, photos, video, wind, forests, deliveries, racing.
[*][b]See it think[/b]: the learning curve and every neuron firing, live. Watch 50 drones learn at once in 3D (Blender).
[*][b]Developer mode[/b]: write your AI in PBDMM, a small Python-like language. Rewards, penalties, network size: your call.
[/list]

[h2]Run the business[/h2]
[list]
[*]Clients text you photo and video jobs. Some lie about the wind.
[*]Earn money, buy better parts, and send your AI fleet to work while you sleep.
[/list]

[h2]Race the AI[/h2]
[img]freestyle_ia.gif[/img]
[list]
[*][b]Freestyle[/b] with your PS5 or Xbox controller: FPV, acro mode, 3 maps.
[*]Race AI drones trained by the same system you use, or run from an AI hunter.
[/list]
```

**Tags (los 20 de Steam, de más a menos importante):** Simulation, Building, Programming, Education, Flight,
Sandbox, Indie, Singleplayer, Automation, Crafting, Management, Casual, Atmospheric, 3D, Realistic, Physics,
Colorful, Relaxing, Hacking, Science.
(«Programming» + «Automation» nos ponen junto a los juegos tipo Zachtronics; «Flight» + «Simulation» con los de drones.)

**Requisitos (lo medido):** macOS 12+ con chip Apple (Windows: cuando lo probemos en un PC) · 8 GB RAM · GPU con WebGL 2 ·
1 GB libre (la app ocupa 851 MB) · opcional: Blender 4.2+ (gratis) para ver entrenar a los drones en 3D.

**Español (corto):** Arma un dron desde una caja de piezas, suéldalo cable por cable y entrena una red neuronal de
verdad para que vuele sola. Mira aprender a 50 drones a la vez, haz pedidos de fotos para clientes que mienten y
corre contra tu IA de noche. Cada IA que entrenas es tuya.

## 3. X (Twitter)

**Sí, vale la pena:** según el video es *la* red de los indies y los GIFs cortos son lo que más se comparte. Lo
nuestro (soldar, la red neuronal, antes/después) es justo ese contenido.

- **Nombre:** `@neuraldroneforge` no cabe (X permite 15 letras). Opciones: **`@NeuralDroneGame`** (15),
  `@DroneForgeGame` (14), `@NeuralDroneDev` (14). Créala con el correo del juego (la creas tú: yo no creo cuentas).
- **Bio:** Build a drone. Train its brain. Watch it learn to fly. 🧠🛸 Indie sim, free demo on Mac → link
- **Ritmo:** 3-4 posts por semana. Lunes GIF · miércoles hilo o pregunta · viernes antes/después · cuando haya release,
  su post.
- **Los primeros 6 posts (ya están los GIFs):**
  1. `soldar.mp4` — «Solder it wire by wire. Too much tin = a bridge = smoke. #gamedev #indiegame #indiedev»
  2. `ia_antes_despues.mp4` — «Generation 3 vs generation 766. Same neural network, ~10 million practice steps later.»
  3. `freestyle_ia.mp4` — «I trained these racing drones with reinforcement learning. Now they race at night.»
  4. Hilo: «5 things I learned teaching a neural network to fly a drone» (con capturas de la curva real).
  5. `dron_garaje.mp4` — «My first drone in the game: plywood, cheap motors and a toy camera.»
  6. Pregunta: «What should the AI learn next: deliveries or chasing birds?»
- **Hashtags fijos:** `#gamedev #indiegame #indiedev` + uno del tema (`#fpv`, `#machinelearning`, `#drone`).

## 4. Cada release (el ritual)

1. Escribir la versión arriba en `CHANGELOG.md` (`## vX.Y.Z · Título (dd-mm-aaaa)`) y subirla en `desktop/package.json`.
2. Commit + tag `vX.Y.Z` + push → GitHub arma el .dmg y la actualización, y los sube al release (instaladores.yml).
3. La web se actualiza sola: **Novedades** (`site/novedades.html`, sale de `CHANGELOG.md`).
4. Las apps instaladas ofrecen «Actualizar ahora».
5. Un GIF nuevo de lo que cambió → X + Instagram, con el enlace a Novedades.

## Cómo se hicieron (para repetirlas con gráficos nuevos)

Chrome sin pantalla (`--headless=new` con la GPU: 60 fps) maneja el juego por CDP con un servidor aparte
(`DRONMAKER_DATOS` en otra carpeta: no toca las partidas de nadie). Ganchos para videos en el juego: `window.__dm`
(partida, garaje, mesa, simulador), en el freestyle `__fs.S.espectar = true` (la cámara sigue a la IA) y
`__fs.S.camaraTV(camera, pos, dt)` (una cámara propia). Ratón y teclado de verdad (CDP Input) para soldar como un
jugador. Las cápsulas: una página HTML con el render 4K de fondo y el logo con su fuente (el SVG del logo usa texto
en Bricolage Grotesque: en un `<img>` no carga la fuente). GIFs con ffmpeg (paleta propia, 15-24 fps).
