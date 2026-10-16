# Plan maestro · Neural Drone Forge

> **16-10-2026.** El plan completo en un solo lugar: dónde está el juego hoy, a dónde va y por qué fases pasa.
> Lo que dice este documento ya está decidido salvo lo que está en la última sección (preguntas abiertas).
> El detalle de cada parte sigue en su documento: [ROADMAP](ROADMAP.md) · [HISTORIA](HISTORIA.md) ·
> [PLAN_CARRERA](PLAN_CARRERA.md) · [NEGOCIO](NEGOCIO.md) · [ARMADO_PLAN](ARMADO_PLAN.md) · [PBDMM](pbdmm/README.md).
> Si algo de aquí choca con otro documento, **manda este** (ver la sección 11).

---

## 1. Qué se quiere lograr

**"Arma el dron. Entrena su cerebro. Míralo aprender a volar."**

- **La IA es la protagonista.** Los trabajos los cumple el modelo que tú entrenaste. Si no aprendió, el cliente no
  recibe su foto. Tú pones la física (las piezas), el cerebro (la red) y la forma de enseñarle (premios y castigos).
- **Todo lo real es una herramienta para aprender.** Piezas con nombres de verdad, soldar, el multímetro, la física
  igual en Python y en JS: no son decoración, son lo que hace que la IA tenga algo que aprender.
- **Es un proyecto de portafolio.** Tiene que verse bien en 10 segundos (GIF del README), funcionar sin pelear con
  la instalación y mostrar ingeniería de verdad (RL, embebido, QA).
- **Meta final:** una app de escritorio en Steam con una campaña completa de 5 actos, un modo freestyle con mando, y
  la opción de llevar tu red a un ESP32 de verdad.

---

## 2. Las fases de un vistazo

✅ hecho · 🔨 en curso · 📋 planeado

| Versión | Nombre | Estado | Qué entrega |
|---|---|---|---|
| v0.1 | La demo | ✅ | Simulador Python = JS, IA con PPO, garaje, tienda, banco, 3 pedidos, PBDMM 1 |
| v1.0 | El negocio | ✅ | Celular con clientes, trabajos repetibles ★–★★★★, relación, arriendo, inglés, PBDMM 2 |
| v2.0 | El taller de verdad | ✅ 16-10-2026 | Regalo de mamá + tutorial obligatorio, la mesa (montar, atornillar, soldar), el computador como centro, simuladores, la flota, niveles 13/14, PBDMM 3 |
| **v2.1** | **Freestyle** | 🔨 **← estamos aquí** | 3 mapas, mando PS5/Xbox, FPV, acro, carrera y persecución contra la IA; niveles 16 Carrera, 17 Entrega, 18 Persecución |
| v2.2 | Acto 2 · El pequeño negocio | 📋 | Acto 2 completo, nivel 15 Seguir, la batería y el multímetro en la mesa, concesionario |
| v2.3 | Acto 3 · El taller crece | 📋 | Entregas en el negocio, QA de drones ajenos, armado por encargo, la empresa rival |
| v2.4 | Acto 4 · La liga | 📋 | Liga de carreras (mapas del freestyle + niveles 16/18), IA contra IA, retos |
| v2.5 | Acto 5 · La tormenta | 📋 | El clímax: búsqueda y rescate con la flota; nivel 19 Búsqueda; epílogo |
| v3.0 | App + gráficos | 📋 | App de escritorio (Electron) con instaladores y el salto de gráficos |
| v3.x | Steam | 📋 | Página en Steam, logros, nube, auto-update; contenido post-juego (niveles 20/21) |

Por qué este orden: primero el juego (las versiones 2.x), después el empaque (3.0). Una app bonita con medio juego
no se vende; un juego completo en el navegador sí se puede mostrar en el portafolio desde ya.

---

## 3. Dónde estamos hoy (v2.0.0, 16-10-2026)

Lo que ya existe y se puede jugar (detalle en [CLAUDE.md](../CLAUDE.md), sección *Estado*):

| Parte | Qué hay |
|---|---|
| **El inicio** | Le pediste a tu mamá un dron profesional y te regaló uno de madera para armar: llega en cajas con cautín, estaño y flux; $150. Los dos modos (normal y desarrollador) empiezan igual |
| **Tutorial obligatorio** | regalo → nombre → armar (computador apagado) → tour del computador → entrenar el nivel 13 hasta 80 % → llega Doña Marta |
| **La mesa** | Abrir cajas, montar cada pieza con su procedimiento, atornillar hasta el clic, soldar con estación + cautín + estaño + flux. Juntas buenas, frías, con puente o con el pad levantado; la mesa no avisa |
| **El banco** | Imprimir (forma o tu STL), cableado real, prueba de humo, firmware, motores, hélices, prueba atada |
| **El computador** | Centro del juego: Mensajes, Calendario, Campaña, Laboratorio, Tienda, Inventario, Finanzas, Videos, Ajustes (+ IDE, Documentación, Simuladores en modo dev) |
| **Negocio** | 4 clientes (Doña Marta, Don Ernesto, Agencia Horizonte, Doña Lucía), foto / inspección / video en 4 dificultades, relación ♥, recomendaciones, arriendo |
| **Simuladores** | 7 escenarios que se compran en orden (Foto fija gratis → Entre postes $420) y abren misiones de la IA y funciones de PBDMM |
| **La IA** | Un modelo por dron; niveles 1-14 (11 grabar, 12 entre postes, 13 foto, 14 set de fotos); la flota vuela sola al terminar el día |
| **PBDMM 3** | El lenguaje del modo dev: modelos, premios, hooks y el plan de vuelo (despegar, ir_a, mantener, foto…) |
| **Campaña** | 3 pedidos especiales jugables (casa, finca, restaurante); 7 más en plan |

---

## 4. En curso: v2.1 · Freestyle 🔨

Para qué: el entrenamiento toma minutos u horas. Ese tiempo también tiene que ser juego. Y es lo más vistoso para
un GIF.

| Qué | Decisión |
|---|---|
| **Mapas** | 🏭 **El bando**: una fábrica abandonada para FPV (vigas, ventanas rotas, galpones) · 🏜️ **El cañón**: un cañón del desierto para velocidad · 🌃 **El estadio neón**: una pista de carreras de noche |
| **Control** | Mando PS5/Xbox (Gamepad API, ya hay base en `game/pilot.js`), teclado y ratón; cámara FPV |
| **Modos de vuelo** | Angle (como hoy) en todo el juego. **Acro** (rate, con flips) **solo en freestyle**: la IA no lo ve, así que no rompe la regla Python = JS |
| **Modos de juego** | Vuelo libre · Carrera contra una IA rival entrenada · Persecución: una IA entrenada te caza (tú eres la liebre) |
| **Niveles nuevos de la IA** | **16 Carrera** (portales lejos, rápido) · **17 Entrega** (llegar a una plataforma lejos entre edificios y quedarse 1 s quieto) · **18 Persecución** (alcanzar una liebre rápida; en el juego la liebre eres tú). El **15 queda reservado** para la toma *seguir* |
| **Modelos** | Los entrena Claude mientras tanto (en el fondo, desligados del servidor): **"corredor"** (16, con el dron `drones/fs_racer.json`) y **"cazador"** (18, la liebre hasta 10 m/s); después **"repartidor"** (17) |

Hecho (16-10-2026): `app/freestyle.html` + `freestyle.js` (modos, física estable y acro, rivales, HUD, minimapa,
sonido), `freestyle_mapas.js` (los 3 mapas; la línea entre portales queda libre: `test_freestyle.mjs`),
`freestyle_vista.js` (texturas, bloom de noche, portales) y los niveles 16-18 en `drone_rl/` (`liebre.py`,
`level.py race_track/delivery_level`). Los niveles nuevos **no** van en `game/sim.js`: solo existen para entrenar;
en el juego la IA vuela con `sim.js step/buildObs` como siempre (la pista y la liebre las pone el freestyle).
Falta: vibración del DualSense, fantasma de tu mejor vuelta, tus drones del hangar en el freestyle, logros.

---

## 5. La historia completa

### 5.1 El arco en una frase

Le pediste un dron profesional a tu mamá y te regaló uno de madera para armar. Con él haces fotos para el barrio,
el taller crece hasta tener flota, entregas y un puesto en la liga de carreras, y cuando una tormenta deja al pueblo
incomunicado, **tus IA son las que encuentran a quien se perdió**. Al final, el garaje es una empresa.

### 5.2 Personajes

| Personaje | Quién es | Dónde aparece |
|---|---|---|
| **Tu mamá** | Te regaló el dron de madera. Aparece en el chat en los momentos grandes ("¿ya comiste?") | Todo el juego |
| **Vale** *(nueva)* | Tu hermana menor, 15 años. Edita los videos, después pilota FPV mejor que tú. Es la voz de las pistas en el Acto 1 | Actos 1-5 |
| Doña Marta 👵 | Inmobiliaria del barrio, la primera clienta. Escribe con cariño y emojis | Acto 1 → siempre |
| Don Ernesto 🤠 | Finca El Roble. Escribe corto y sin tildes. Viento | Acto 2 |
| Agencia Horizonte 🏢 | Bienes raíces grande, formal, poco plazo | Acto 2 |
| Doña Lucía 👩‍🍳 | Restaurante La Brasa: videos para redes | Acto 2 |
| Autos del Valle | Concesionario: tomas bajas y rápidas | Acto 2 |
| Paquetería El Rayo 📦 · Farmacia San José 💊 · Taller El Tornillo 🔩 | Entregas, urgentes y recoger-y-volver ([PLAN_CARRERA](PLAN_CARRERA.md)) | Acto 3 |
| Profe Ramírez 👨‍🏫 | Colegio: encarga drones educativos | Acto 3 |
| **DronYa** *(nueva)* | La empresa rival: drones importados baratos y una app. Su dueño, **Mauricio Peña**, te quita clientes bajando precios | Actos 3-4 |
| Kevin FPV 😎 | El rival del barrio: te reta a carreras | Actos 3-4 |
| **Andrea Ríos** *(nueva)* | Organiza la **Liga Andina de Drones**. Exigente y justa: te invita cuando le ganas a Kevin | Acto 4 |
| Club Los Halcones 🏁 | El club de carreras de la liga | Acto 4 |
| Don Aurelio 🧓 | Coleccionista: compra drones armados | Actos 3-4 |
| **Capitán Herrera** *(nuevo)* | Bomberos voluntarios del pueblo | Acto 5 |
| Productora Cóndor 🎥 | La película | Epílogo |

### 5.3 Los actos

Reputación (rep) como hoy: 1★ = 0, 2★ = +1, 3★ = +2; fallar = −1. Los umbrales de cada acto son los de los capítulos
de `misiones.json` (4, 12, 20, 30). ⭐ = pedido especial de la campaña (no vence, hace avanzar el acto).

#### Acto 1 · El garaje (rep 0 → 4) · v2.0 ✅ (falta pulir)

*Tienes un dron de madera, $150 y una mamá que pregunta si eso es seguro.*

| Misión | Quién | Qué pide | Piezas | IA | Pago |
|---|---|---|---|---|---|
| El regalo (tutorial) | Mamá, Vale | Armar y soldar el dron de madera, que vuele | el kit | — | — |
| La primera foto | Doña Marta | 1 foto de la fachada | el kit | 13 | $20 |
| Fotos de la casa | Doña Marta | 2-3 fotos | gomas ($8) | 14 | $20-35 |
| El techo de la vecina | Doña Marta | inspección del techo | el kit | 13 | $35 |
| ⭐ Casa en venta | Doña Marta | video: fija, órbita, revelar | el kit + gomas | 11 | $45 |

Abre: el Acto 2, la Agencia Horizonte, Don Ernesto (lo recomienda Marta). Ganas en total ~$150-250.

#### Acto 2 · El pequeño negocio (rep 4 → 12) · v2.2

*La gente ya te conoce. Primer arriendo, primeras piezas serias y el primer dron que trabaja solo.*

| Misión | Quién | Qué pide | Piezas | IA | Pago |
|---|---|---|---|---|---|
| ⭐ La finca El Roble | Don Ernesto | video con viento 2,5 m/s | 3S 2200, antena externa, empuje/peso ≥ 2,2 | 11 + viento | $80 |
| El granero | Don Ernesto | inspección alta con viento | barómetro | 13 + viento | $55 |
| Sets para la agencia | Agencia Horizonte | 3-4 fotos, ★★-★★★ | radio ≥ 30 m | 14 | $40-120 |
| ⭐ Restaurante La Brasa | Doña Lucía | video entre postes, gente cerca | protectores, cámara 1080p, ToF | 12 | $140 |
| ⭐ Un auto nuevo | Autos del Valle | tomas bajas (1,5 m) y rápidas | cámara 4K, soft-mount TPU, ESC 45 A filtro RPM | 11 bajas | $180 |
| La primera flota | (el juego) | darle 2 trabajos a 2 IA el mismo día | un 2º dron | 13/14 | — |
| ⭐ Seguir al ciclista | Club de ciclismo | seguir a 6 m/s | 2306 + 4S, GPS M10, ELRS | **15** | $260 |

Abre: el Acto 3, la batería y el multímetro en la mesa, el simulador *Seguir*. Arriendo $60/semana.

#### Acto 3 · El taller crece (rep 12 → 20) · v2.3

*Ya no es solo grabar. Llevas cosas, arreglas drones ajenos y armas para otros. Y llega DronYa.*

| Misión | Quién | Qué pide | Piezas | IA | Pago |
|---|---|---|---|---|---|
| ⭐ El primer envío | Paquetería El Rayo | paquete de 300 g a 25 m | gancho, empuje/peso con carga | **17** | $90 |
| Urgente: insulina | Farmacia San José | entrega en horas (paga ×2) | batería grande | 17 | $60-150 |
| El repuesto | Taller El Tornillo | ir, recoger, volver | gancho + aterrizar preciso | 17 ×2 | $70-120 |
| Un dron para el colegio | Profe Ramírez | armar con presupuesto: < 250 g, 5 min | mesa + banco | — (armado) | piezas + 30-80 % |
| **El dron barato que se cayó** | un cliente de DronYa | QA: encontrar la falla (ESC quemado, junta fría) | multímetro | — (QA) | $80 + el cliente vuelve |
| ⭐ El partido | Liga del barrio | seguir el balón, alto, con viento | gimbal 2 ejes, 4S 2200 | 15 + viento | $320 |
| ⭐ La boda | Laura y Andrés | multi-cámara: tú + 2 IA | 3 drones, cine 4K gimbal | 15 + flota | $500 |
| Kevin te reta | Kevin FPV | ganarle una carrera en el bando | piezas de carrera | 16 o a mano | $50 + fama |

DronYa baja los precios de las fotos ★ (pagan 20 % menos mientras dure el acto). La respuesta es la calidad: los ★★★
y las entregas siguen pagando bien. Abre: el Acto 4, el Mercado (vender drones), Don Aurelio. Arriendo $120/semana +
luz.

#### Acto 4 · La liga (rep 20 → 30) · v2.4

*Andrea Ríos te invita a la Liga Andina. Tu IA corre contra la de DronYa. El que gana se queda con los contratos grandes.*

| Misión | Quién | Qué pide | Piezas | IA | Pago |
|---|---|---|---|---|---|
| Clasificatoria: el cañón | Andrea Ríos | tiempo mínimo en el cañón | 2207 + carbono 5" + ESC 55 A | **16** | $200 |
| Fecha 2: el bando | Club Los Halcones | carrera FPV entre vigas | ToF | 16 + esquivar | $300 |
| La caza | Kevin FPV | su "cazador" te persigue: aguanta 60 s | — | **18** (la del rival) | $150 |
| ⭐ La marca en el bosque | Marca outdoor | seguir a una modelo entre árboles | cinewhoop 3", ToF | 15 en bosque | $650 |
| IA contra IA | Liga | tu modelo vs. el de DronYa, misma semilla | — | 16 | $400 |
| ⭐ La final: estadio neón | Andrea Ríos | carrera de noche, tu IA corre | luces LED | 16 | $800 + copa |

Abre: el Acto 5, las piezas pro de carreras, el título de la liga (los clientes pagan +10 %).

#### Acto 5 · La tormenta (rep 30+) · v2.5

*Tres días de lluvia. Se cae la carretera de la vereda y el nieto de Don Ernesto, Tomás, no volvió del monte.
El Capitán Herrera no tiene helicóptero. Tiene tu taller.*

| Misión | Quién | Qué pide | Piezas | IA | Pago |
|---|---|---|---|---|---|
| ⭐ Ver el derrumbe | Cap. Herrera | fotos en cuadrícula de la vía | Li-ion 4S, ELRS 900 | 14 (barrido) | $300 |
| ⭐ Medicinas a la vereda | Farmacia San José | 3 entregas con viento 4 m/s | gancho, carbono 7" | 17 + viento | $400 |
| ⭐ Buscar a Tomás | Cap. Herrera | 4 IA barren el monte; encontrar la señal | térmica (nueva), luces | **19 Búsqueda** | $900 |
| ⭐ Guiar a los rescatistas | Cap. Herrera | seguir al equipo de noche hasta Tomás | luces LED | 15 de noche | $600 |

Todo lo aprendido junto: entregar, barrer, seguir, viento, noche, flota. No hay misión manual: si la IA no aprendió,
no hay rescate (se puede reintentar, pero cuesta días).

#### Epílogo · Estudio Aéreo

- El garaje pasa a llamarse **Estudio Aéreo**. Mamá lo celebra en el chat; Vale queda como piloto.
- **La película** (Productora Cóndor, $2.000, 4 drones con IA): el primer contrato de la empresa.
- **Enseñar:** el Profe Ramírez te pide un curso; desbloquea compartir programas `.pbd`.
- **Liberar tu IA:** exportar el modelo (y, para el portafolio, correrlo en un ESP32-S3 de verdad).
- Se abre el **modo libre**: todos los lugares, cualquier dron, retos diarios.

---

## 6. Misiones y recompensas

### 6.1 Tipos de misión y qué IA necesitan

| Tipo | Qué haces | Nivel de IA | Desde |
|---|---|---|---|
| 📷 Foto | llegar, quieto, disparar | 13 | Acto 1 ✅ |
| 🖼️ Set de fotos | varias fotos seguidas | 14 | Acto 1 ✅ |
| 🔎 Inspección | fotos de puntos altos (techo) | 13/14 | Acto 1 ✅ |
| 🎬 Video | tomas con ruta (fija, órbita, revelar) | 11 (12 entre postes) | Acto 1 ✅ |
| 🎯 Seguir | el sujeto se mueve | 15 | Acto 2 |
| 📦 Entrega / recoger | A → B (→ A), quieto 1 s encima | 17 | Acto 3 |
| 🧪 QA de drones ajenos | diagnosticar en el banco, informe | — (banco + multímetro) | Acto 3 |
| 🛠️ Armado por encargo | armar con requisitos y presupuesto | — (mesa) | Acto 3 |
| 🏁 Carrera | portales rápido | 16 | Acto 3-4 |
| 🐇 Persecución | alcanzar o escapar | 18 | Acto 4 |
| 🔦 Búsqueda | barrer una zona y encontrar | 19 *(nuevo)* | Acto 5 |
| 🗺️ Mapeo | cuadrícula de fotos de una zona grande | 20 *(futuro)* | post-juego |
| 🎆 Show de luces / formación | varios drones sin chocarse, figuras | 21 *(futuro)* | post-juego |
| ✋ Manual | lo vuelas tú, ×3-5 de pago | — | Acto 2+ (raras) |

### 6.2 La plata por acto

| Acto | Pago típico | Gastos fijos | Te alcanza para |
|---|---|---|---|
| 1 | $20-45 por trabajo (~$40-80/día) | ninguno | gomas, LiPo 3S, antena externa, protectores, impresora 3D ($60), simulador Set de fotos ($80) |
| 2 | $40-260 | arriendo $60/sem | ESC 35 A, LiPo 4S, 2306, ELRS 2.4, ToF, un 2º dron, simuladores hasta Entre postes ($420) |
| 3 | $60-500 | arriendo $120/sem + luz (~$5/día entrenando) | gancho, gimbal, GPS, carbono, 3er dron, chip "Piloto IA" ($300) |
| 4 | premios $150-800 | $200/sem + luz + inscripciones ($30-80) | motores pro 2207, carbono 5", ESC 55 A, Piloto IA · Seguir ($1.000) |
| 5 | $300-900 | $250/sem | flota de 4, Li-ion 4S, ELRS 900, cámara térmica |

Regla (de [PLAN_CARRERA](PLAN_CARRERA.md)): un taller que trabaja bien siempre gana más de lo que gasta. Todo en
`app/data/trabajos.json`: balancear = editar números.

### 6.3 Rangos de reputación

| Rep | Rango | Abre |
|---|---|---|
| 0 | Vecino curioso | Doña Marta, simulador Foto fija |
| 4 | Garaje conocido | Acto 2, Agencia Horizonte, ★★★ |
| 12 | Taller serio | Acto 3, entregas, encargos, misiones manuales |
| 20 | Estudio | Acto 4, la liga, piezas pro, ★★★★ siempre disponibles |
| 30 | Referente | Acto 5, el título "Estudio Aéreo" a la vista |
| 45 | Leyenda *(post-juego)* | retos semanales difíciles, piezas de colección |

### 6.4 Volar con tu propia IA da más

- **+15 %** del pago si el trabajo lo hizo una IA que tú entrenaste (no la base copiada).
- **+10 %** más si esa IA tiene ≥ 50 generaciones tuyas en ese nivel.
- **Primera vez** que tu IA cumple un tipo de trabajo: bono único de $50-200 y un logro.
- La flota cobra igual, pero cada vuelo gasta batería y desgaste (ver 6.7).

### 6.5 Logros (los mismos que irán a Steam)

| Logro | Cómo |
|---|---|
| Hecho a mano | Armar el dron de madera sin ninguna junta fría |
| Primer vuelo | Que despegue el primer dron |
| ¡Quedó divina! | 3★ en un trabajo de Doña Marta |
| Aprendió sola | Tu primer modelo llega a 80 % en un nivel |
| Que lo haga ella | Primer trabajo entregado por tu IA |
| Flota | 3 IA trabajando el mismo día |
| Contra el viento | 3★ con viento ≥ 3 m/s |
| Entre postes | Restaurante sin rozar nada |
| Multímetro en mano | Encontrar una falla antes de conectar la batería |
| Humo mágico | Quemar una pieza en la prueba de humo (sí, es logro) |
| Repartidor | 10 entregas a tiempo |
| Doctor de drones | 5 QA bien diagnosticados |
| Le ganaste a Kevin | Primera carrera ganada |
| Acro | Un flip en freestyle |
| Te cacé | Escapar 60 s del cazador |
| Campeón | Ganar la Liga Andina |
| IA vs. IA | Tu modelo le gana al de DronYa |
| Lo encontramos | Terminar la búsqueda de Tomás |
| Estudio Aéreo | Terminar la campaña |
| Programador | Terminar la ruta del programador (modo dev) |
| Sin deudas | Terminar un acto sin bajar de $0 |

### 6.6 Retos diarios y semanales (desde v2.4)

- **Diario** (en el Calendario): uno chico y fijo para todos ese día (misma semilla): "3 fotos ★★ con IA",
  "una carrera en el cañón bajo 40 s". Premio $20-60.
- **Semanal**: uno grande: "entrena un modelo nuevo y que llegue a 70 % en el 17", "gana 2 carreras". Premio
  $150-300 + una pieza rara.
- Sin internet no hay tabla mundial; con Steam (v3.x), tabla de tiempos del reto diario.

### 6.7 Perder plata (los riesgos)

Detalle en [ROADMAP](ROADMAP.md) (*Perder plata, no solo ganar*). Números de partida:

| Riesgo | Cuánto | Cuándo |
|---|---|---|
| Choque | piezas dañadas según la velocidad (hélices $4-8, motor $15-150) | siempre |
| Junta fría que se suelta | el dron cae: se pierde el trabajo y lo que se rompa | si soldaste mal |
| Entrega tarde | −50 % del pago, −1 ♥ | Acto 3+ |
| Vencer un pedido | −1 ♥ con ese cliente | siempre |
| Queja | devolver 30 %, repetir gratis o perder ♥ y una reseña | Acto 2+ |
| Multa | $40-200 (zona con gente, de noche, daño a terceros) | Acto 2+ |
| Desgaste | baterías −5 % de capacidad cada 20 ciclos; motores con vida | siempre |
| Flota | ~$2-5 por vuelo (carga + desgaste) | Acto 2+ |
| Deuda | préstamo con 10 %/semana; nunca se pierde la partida de golpe | si bajas de $0 |

---

## 7. Gráficos

Ordenado por prioridad. Tamaño: **S** = días, **M** = 1-2 semanas, **L** = un mes o más.

| # | Qué | Tamaño | Por qué |
|---|---|---|---|
| 1 | **Postproceso**: bloom, SSAO, color grading; motion blur **solo en FPV** | S | El salto más grande por menos trabajo (`EffectComposer` de three.js) |
| 2 | **Presets de calidad** (bajo / medio / alto / ultra) en Ajustes | S | Sin esto, el postproceso mata los portátiles |
| 3 | **Cielo HDRI** (Poly Haven, CC0) + ciclo de día y noche | M | Luz creíble y misiones de noche (estadio, Acto 5) |
| 4 | **Partículas**: polvo al despegar, el pasto que se mueve bajo las hélices, chispas al soldar, humo al quemar | M | Hace sentir la física; la prueba de humo pide humo |
| 5 | **Clima**: lluvia, niebla, viento visible (árboles, polvo) | M | El viento ya existe en la física: hay que verlo. La tormenta del Acto 5 |
| 6 | **Texturas PBR** (madera, carbono, metal, PCB) | M | Las piezas se ven de juguete sin esto |
| 7 | **GLB hechos en Blender para cada pieza y el garaje** (por script, como la ESP32: `blender/piezas/`) | L | Ya probado con la ESP32; lista en [ARMADO_PLAN](ARMADO_PLAN.md) |
| 8 | **Instancing + LOD** para bosques y el público del estadio | M | Rendimiento con miles de árboles |
| 9 | **Modo foto** (pausar, mover la cámara, filtros) y **repeticiones** (guardar un vuelo y verlo con otras cámaras) | M | Contenido para compartir; el visor de simulaciones ya hace la mitad |
| 10 | **WebGPU** (three.js `WebGPURenderer`) | L | Después de v3.0: más luces y sombras; WebGL2 queda de respaldo |

---

## 8. La app de escritorio (v3.0 → v3.x)

### Decisiones

| Decisión | Por qué |
|---|---|
| **Electron**, no Tauri | Trae su Chromium: el mismo WebGL2/WebGPU, la Gamepad API y la grabación `.webm` en Mac y Windows, y el camino a Steam (electron-builder, steamworks.js) |
| El servidor Python (`scripts/jugar.py`) va como **sidecar** empaquetado con **PyInstaller** | No hay que reescribirlo; Electron lo arranca y lo cierra |
| Las partidas pasan de localStorage a **archivos** en la carpeta de datos del usuario, con **importación** de la partida vieja | localStorage se borra con los datos del sitio; los archivos se respaldan y van a la nube de Steam |
| La instalación base va **sin PyTorch** | El juego ya hace la inferencia en JS (`modelo_web.json`); PyTorch pesa cientos de MB |
| El entrenamiento es un componente opcional, **"Laboratorio de IA"**, que se baja la primera vez que lo usas | Quien solo quiere jugar no carga con eso |
| **Blender sigue opcional** | Solo sirve para mirar el entrenamiento |

### Fases

| Fase | Qué | Versión |
|---|---|---|
| **E1** | Envoltorio: Electron arranca el servidor y abre la ventana | v3.0 |
| **E2** | Instaladores: `.dmg` firmado y notarizado (Mac), `.exe` (Windows) | v3.0 |
| **E3** | Auto-update, partidas en archivos (+ importar), reportes de fallos | v3.0 / v3.1 |
| **E4** | Steam: página, logros (6.5), guardado en la nube, soporte de mando | v3.x |

Desde ya conviene: que nada dependa de rutas fijas del servidor, que todo se juegue sin ratón y guardar los `.pbd` en
disco (ya anotado en el ROADMAP, Fase 5).

---

## 9. Qué falta, versión por versión

**v2.1 Freestyle** 🔨 — ✅ los 3 mapas, acro, cronómetro y portales, rival y cazador con IA, niveles 16-18 ·
falta: vibración y calibración del DualSense · fantasma de tu mejor vuelta · tus drones del hangar · simuladores
nuevos para 16-18 en la campaña · logros de freestyle.

**v2.2 Acto 2** — nivel 15 Seguir (Python = JS) · concesionario (tomas bajas) · ciclista jugable · la batería y el
multímetro en la mesa ([ARMADO_PLAN](ARMADO_PLAN.md) 2.6) · Fase 1b parte 2 (física en el entrenamiento: radio,
ráfagas) · misiones con texto de historia y cinemáticas cortas en el chat · Vale en el tutorial.

**v2.3 Acto 3** — entregas en el negocio (carga en `mision_sim.js`, gancho) · El Rayo, Farmacia, El Tornillo · QA de
drones ajenos (componentes dañados, síntomas) · armado por encargo · DronYa y su efecto en precios · el partido y la
boda (multi-cámara) · "perder plata" completo · apps Trabajos y Mercado.

**v2.4 Acto 4** — la liga (fechas en el Calendario, inscripciones) · IA contra IA con la misma semilla · bosque ·
retos diarios y semanales · app Retos.

**v2.5 Acto 5** — nivel 19 Búsqueda · clima (lluvia) y noche en las misiones · cámara térmica · los 4 ⭐ de la
tormenta · epílogo, créditos y modo libre · La película.

**v3.0** — Electron E1-E3 · gráficos 1-6 · pulido de sonido.
**v3.x** — Steam E4 · gráficos 7-10 · niveles 20 Mapeo y 21 Formación · exportar la red a un ESP32.

---

## 10. Riesgos y preguntas abiertas

| Tema | Pregunta / riesgo | Para decidir |
|---|---|---|
| **Precio** | ¿Gratis en itch.io, "paga lo que quieras" o $10-15 en Steam? | antes de v3.x |
| **Comisión de Steam** | 30 % + $100 por la página; ¿vale la pena frente a itch.io (comisión libre)? | antes de v3.x |
| **El entrenamiento en el juego base** | Si el Laboratorio es opcional y la IA es la protagonista, ¿un jugador sin GPU ni ganas de bajar PyTorch puede terminar la campaña? Opción: modelos ya entrenados que se "compran" con plata del juego | v3.0 |
| **Tiempo de entrenamiento** | Si un nivel tarda horas, el jugador se aburre. ¿Metas de 80 % alcanzables en ~15-30 min en un portátil? Medir con corredor/cazador | v2.1 |
| **Volar tú da plata** | ¿Los primeros pedidos se pueden entregar a mano o solo con la IA? (ROADMAP Fase 1, punto 2) | v2.2 |
| **Acto 5 sin manual** | Si la búsqueda solo la hace la IA, puede frustrar. ¿Reintentos ilimitados? ¿pista de Vale? | v2.5 |
| **Firma en Mac** | Notarizar pide cuenta de Apple Developer ($99/año) | v3.0 |
| **Licencias de modelos 3D** | Todo lo que no sea por script va con su licencia en `app/modelos/LICENCIAS.md` | siempre |
| **Rendimiento** | Postproceso + bosque + 4 drones en un portátil | v3.0 |
| **Rival "DronYa"** | Que no se parezca a una marca real | v2.3 |
| **Tamaño del instalador** | Electron (~150 MB) + Python sin torch (~80 MB); con torch, ~500 MB+ | v3.0 |

---

## 11. Cosas que hay que alinear en los otros documentos

Este plan cambia o aclara algunas cosas. Cuando se toque cada documento:

- **HISTORIA.md**: arranca con "$150, un ESP32 y motores reciclados" (antes del regalo de mamá); su tabla de
  entrenamiento todavía dice *13 · Seguir* y *14 · Seguir en el bosque* (13 y 14 ya son las fotos; seguir = 15); la
  boda y la película pasan a otros actos (aquí: Acto 3 y el epílogo); el final ya no es la película sino la tormenta.
- **PLAN_CARRERA.md** y **NEGOCIO.md**: dicen que entregar es el **nivel 16**; ahora es el **17** (16 = Carrera).
  PLAN_CARRERA pone a Don Ernesto con rep 5 y a Doña Lucía con rep 12; en `clientes.json` son 2 y 6.
  La productora es *Cine Andino* en PLAN_CARRERA y *Productora Cóndor* en `misiones.json`: queda **Productora Cóndor**.
- **NEGOCIO.md**: la inspección "usa el nivel 4"; hoy se entrena con el 13 (30 % mira el techo).
- **ROADMAP.md**: "el tutorial es el modo desarrollador" ya no aplica (el tutorial es obligatorio en los dos modos);
  la Fase 5 suponía PyTorch dentro del sidecar (~300 MB): ahora va sin torch y el Laboratorio se baja aparte.
- **misiones.json**: la finca está en el capítulo 1; en este plan abre el Acto 2.
