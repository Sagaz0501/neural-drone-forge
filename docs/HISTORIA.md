# Dron Maker — la historia (campaña)

> Plan de la campaña completa: de un garaje con un dron de madera a un estudio de cine aéreo con una flota
> de drones con IA. Cada misión pide **piezas distintas** (algo que el dron de antes no puede hacer) y un
> **entrenamiento distinto** de la IA. Los números son una primera versión: se balancean editando
> `app/data/piezas.json` y `app/data/misiones.json`.

## La historia en una frase

Arrancas con **$150**, un ESP32 y unos motores reciclados de un dron de juguete. Tu primera clienta es Doña
Marta, que necesita fotos de una casa para venderla. Cada video bien hecho trae clientes más exigentes
(viento, gente, obstáculos, cosas que se mueven, de noche), y para cumplirles tienes que **mejorar el dron** y
**enseñarle a tu IA** a volar como tú. El final: **"La película"**, una persecución filmada por cuatro drones
autónomos que dirige tu propio estudio.

## La empresa crece (5 capítulos)

| Capítulo | Tu empresa | Etapa de la tienda | Se abre con |
|---|---|---|---|
| 1 · El garaje | "Garaje Films": tú, un dron de madera | 1 | el inicio |
| 2 · Pequeño negocio | primer local, piezas serias (STM32, ELRS) | 2 | reputación 4 |
| 3 · Estudio de video | cámaras con gimbal, carbono, GPS | 3 | reputación 12 |
| 4 · Flota con IA | 2-3 drones autónomos por trabajo | 4 | reputación 20 |
| 5 · El gran final | "Estudio Aéreo": el largometraje | 5 | reputación 30 |

## Las misiones

Cada misión: **dónde**, **qué tomas** (rutas de cámara), **qué lo hace difícil**, **qué piezas pide** (✱ = el
cliente no acepta sin eso) y **cómo entrenar a la IA** para que la haga sola.

### Capítulo 1 · El garaje

**1. Casa en venta** — Doña Marta (inmobiliaria) · $45 · *hecha*
- Lugar: una casa con jardín, cerca y letrero de SE VENDE. Sin viento.
- Tomas: *El frente* (fija), *Media vuelta* (órbita 130°), *Revelar desde el jardín*.
- Piezas: el **Kit del garaje** alcanza (madera, motores reciclados 1806, ESP32 + barómetro, ESP32-CAM).
  La radio ESP-NOW del ESP32 llega a 20 m: justo (la ruta más lejana queda a 18,5 m).
- Mejora que se nota: **gomas antivibración** ($8) → la imagen sale más nítida.
- IA: nivel **11 · Grabar** con **Tu dron**, sin viento.

**2. La finca El Roble** — Don Ernesto · $80 · *hecha*
- Lugar: un granero rojo, un silo de 9 m, cercas, pacas de heno. **Viento de 2,5 m/s con ráfagas.**
- Tomas: *Revelar el granero* (de 2 a 7 m), *Vuelta amplia* (órbita de 10 m de radio), *El silo* (fija alta).
- Lo difícil: el viento empuja al dron (necesita empuje/peso ≥ 2 y barómetro), las rutas son más largas
  (✱ batería ≥ 5 min: 3S 2200) y más lejos (✱ radio ≥ 22 m: **antena externa** para el ESP-NOW) y ✱ empuje/peso ≥ 2,2 para el viento.
- IA: nivel **11 · Grabar con viento** (viento 2,5 m/s) con tu dron nuevo. Sin viento en el entrenamiento, la
  IA no sabe compensar las ráfagas y la toma se le sale de la ruta.

### Capítulo 2 · Pequeño negocio

**3. Restaurante La Brasa** — Doña Lucía · $140 · *hecha*
- Lugar: un local de dos pisos con toldo, terraza con mesas y sombrillas, postes de luz en el andén.
- Tomas: *La fachada* (fija baja), *Entre los postes* (órbita a 3 m de los postes), *Revelar la terraza*.
- Lo difícil: obstáculos a 1-2 m de la ruta y gente en la terraza → ✱ **protectores de hélice**, ✱ cámara de
  acción 1080p (calidad 50). Para que lo haga la IA: **sensores ToF VL53L1X** (los 10 sensores de distancia).
- IA: nivel **12 · Grabar entre postes** (postes al azar cerca de las rutas) con tu dron y los ToF.

**4. Concesionario Autos del Valle** — $180 · *plan*
- Lugar: un auto en exhibición, banderines, carpa. Tomas bajas (1,5 m) y rápidas alrededor del auto.
- Lo difícil: a 1,5 m del piso el dron se sacude más (✱ cámara 4K, ✱ **soft-mount de TPU** o gimbal 2 ejes),
  y la órbita rápida pide **ESC 45 A con filtro RPM** (BLHeli_32) para que no vibre.
- IA: nivel 11 con **tomas bajas** (nuevo rango de alturas).

### Capítulo 3 · Estudio de video

**5. Club de ciclismo** — seguir a un ciclista a 6 m/s · $260 · *plan*
- Toma nueva: **seguir** (el sujeto se mueve: la ruta de cámara va con él).
- ✱ velocidad máx. ≥ 8 m/s (motores 2306 + 4S), ✱ **STM32F722 + GPS M10** (frena solo), radio **ELRS 2.4 GHz**.
- IA: nivel **13 · Seguir** (sujeto en movimiento; es lo que aprendió en la caza, ahora con encuadre).

**6. Liga del barrio** — partido de fútbol · $320 · *plan*
- El balón cambia de rumbo, tomas altas (8-15 m) con viento. ✱ gimbal 2 ejes, ✱ batería 4S 2200.
- IA: nivel 13 con viento y sujeto que cambia de rumbo.

### Capítulo 4 · Flota con IA

**7. Matrimonio de Laura y Andrés** — salida de la iglesia · $500 · *plan*
- **Multi-cámara**: tú vuelas un dron y 2 drones con IA graban desde otros ángulos (órbita + revelar).
- ✱ **STM32H743 + coprocesador IA K210** (el chip que corre tu modelo), ✱ **cine 4K con gimbal 3 ejes**, luces LED.
- IA: nivel 13 + **formación** (varios drones, no chocarse entre ellos).

**8. Marca outdoor en el bosque** — una modelo caminando entre árboles · $650 · *plan*
- ✱ **cinewhoop de 3" con ductos** (protección), ✱ ToF. Tomas bajas entre troncos.
- IA: nivel **14 · Seguir en el bosque** (la caza en el bosque, con encuadre).

### Capítulo 5 · El gran final

**9. Festival de noche** — $900 · *plan*
- De noche, viento de 4 m/s, 3 drones con IA. ✱ luces LED WS2812, ✱ carbono 7", ✱ ELRS 900 MHz.

**10. La película** — el final · $2.000 · *plan*
- Una persecución (un auto por la carretera y el bosque) filmada por **4 drones con IA** a la vez.
- Todo lo aprendido: seguir rápido, esquivar, viento, formación. Al terminar: créditos, tu estudio pasa a
  llamarse **"Estudio Aéreo"**, y se abre el modo libre (todos los lugares, cualquier dron).

## Las piezas (catálogo)

Nombres reales para que suene a taller de verdad; lo que hace cada pieza está simplificado.

| Ranura | Opciones (de etapa 1 a 3) | Qué cambia |
|---|---|---|
| Chasis | contrachapado casero, PLA impreso, PETG impreso, aluminio, cinewhoop 3" con ductos, carbono 5", carbono 7" | peso, arrastre, aguante a choques, **rigidez (vibración)**, hélices que caben |
| Motores | 1806 2300KV reciclados, 2204 2300KV, 1404 4600KV (cinewhoop), 2306 2450KV, 2207 1950KV, 2806.5 1300KV | empuje, eficiencia, **corriente**, **vibración** |
| Hélices | 3", 5", 7" | empuje, eficiencia, respuesta |
| ESC (4 en 1) | 20 A BLHeli_S, 35 A BLHeli_S, 45 A BLHeli_32 con filtro RPM, 55 A AM32 con filtro RPM | si da menos corriente que la que piden los motores, **limita el empuje**; el filtro RPM quita vibración |
| Batería | LiPo 2S 1000, 3S 1300, 3S 2200, 4S 1500, 4S 2200, Li-ion 4S 3000 | minutos de vuelo, peso, voltaje |
| Controladora | ESP32 casero (ESP-FC), ESP32 + barómetro BMP280, STM32F405 + DPS310, STM32F722 + GPS M10, STM32H743 + coprocesador IA K210 | inclinación, respuesta, ayudas (altura, frenar), IA |
| Radio | ESP-NOW integrado (20 m), ESP-NOW + antena externa (35 m), ExpressLRS 2.4 GHz (600 m), ExpressLRS 900 MHz (2 km) | **alcance**: si te alejas más, *failsafe* y el dron aterriza solo |
| Cámara | ESP32-CAM OV2640 720p, acción 1080p, acción 4K, 4K con gimbal 2 ejes, cine 4K con gimbal 3 ejes | calidad, gimbal |
| Montaje de la cámara | tornillos directos, gomas antivibración, soft-mount de TPU | vibración |
| Extras | sensores ToF VL53L1X (x10), protectores de hélice, luces LED WS2812, gancho de carga | requisitos de clientes, la IA esquiva con los ToF |
| Herramientas (taller) | impresora 3D | chasis PLA/PETG más baratos, con forma y color a tu gusto |

**Vibración y nitidez** (solo del juego, no cambia la física que ve la IA): cada motor vibra algo, el chasis la
amplifica o la absorbe (madera 1,25 … carbono 0,85), el ESC con filtro RPM la baja (×0,75), el montaje
también (gomas ×0,6, TPU ×0,45) y el gimbal casi la borra (2 ejes ×0,6, 3 ejes ×0,35).
**Nitidez = 1 − 0,35 × vibración**, y multiplica la calidad de las tomas en el puntaje del video.

**Personalización**: color del chasis y de los detalles (cualquier chasis se puede pintar); los chasis impresos
(PLA/PETG, con la impresora 3D) además eligen **forma**: X, H o *deadcat* (brazos de adelante abiertos para que
no salgan en la cámara). La forma es estética: no cambia la física.

## Cómo se califica

- Cada toma: calidad media (encuadre × en la ruta × ritmo × estable), estricta. Una toma < 50 % no sirve.
- Video = 100 × (0,75 × calidad media de las tomas × nitidez + 0,25 × calidad de la cámara).
- Cada cliente tiene su exigencia (las estrellas): Doña Marta se conforma con 30/50/70; la película pide 70/82/92.
- Pago = pago × [0, 0,5, 1, 1,3] según estrellas; reputación −1/0/+1/+2.

## Cómo se entrena la IA en cada capítulo

| Nivel (Drone Lab) | Para | Qué aprende |
|---|---|---|
| 11 · Grabar (tomas con ruta) | casa, concesionario | fija, órbita, revelar; llegar al inicio esquivando la casa |
| 11 + viento 2,5 m/s | finca | compensar ráfagas sin salirse de la ruta |
| 12 · Grabar entre postes | restaurante | lo mismo con postes cerca de la ruta: usar los ToF |
| 13 · Seguir *(falta)* | ciclista, fútbol, matrimonio | el sujeto se mueve: ir con él adelantándose (como la caza) |
| 14 · Seguir en el bosque *(falta)* | marca outdoor, película | seguir + esquivar troncos |
| formación *(falta)* | matrimonio, festival, película | varios drones sin chocarse |

Siempre con **Tu dron** (o "al azar" si cambias mucho de piezas), y repasando de vez en cuando los niveles
viejos para que no olvide.

## Estado (14-10-2026)

- Hecho: capítulos 1-2 (misiones 1-3) jugables con sus lugares, el catálogo nuevo con nombres reales, ESC,
  radio con alcance y *failsafe*, montaje y vibración, personalización (color y forma), nivel 12 para entrenar.
- Siguiente: concesionario (tomas bajas), y la toma **seguir** (nivel 13) para el capítulo 3.
