# PBDMM · Python Base Dron Model Maker

> Versión 1.0. Este archivo se genera desde `app/data/pbdmm.json` con `node app/doc_pbdmm.mjs`: no lo edites a mano.

PBDMM es el lenguaje del **modo desarrollador** de Neural Drone Forge. Un programa describe **cómo se entrena** la IA de un dron:
qué modelo, qué misión, con qué dron, cuánto cerebro, qué premios, y qué hacer mientras aprende. Por detrás hace lo mismo
que el Laboratorio del juego: un pedido a `scripts/jugar.py`, que lanza `scripts/live_train.py` (PPO, stable-baselines3)
en segundo plano o en el Drone Lab de Blender.

Tiene cara de Python pero **no es Python**: lo interpreta el navegador (`app/pbdmm.js`), sin `import` ni `while` y con un
límite de operaciones. Un programa no puede tocar tu compu: solo puede pedir un entrenamiento.

## Un programa

```python
# Currículum: primero que no choque, después que grabe bien.

modelo("aprendiz", desde="base")
mision("grabar_postes")
dron("azar")
entrenar_en("fondo")

castigos(chocar=8)     # fase 1: no chocar es lo que más importa
premios(grabar=1)
fase = 1

def cada_generacion(e):
    global fase
    if fase == 1 and e.choque is not None and e.choque < 0.1:
        fase = 2
        castigos(chocar=3)    # fase 2: ahora, grabar bien
        premios(grabar=6)
        avisar("Fase 2: ya no choca, ahora a grabar")
    if fase == 2 and e.exito >= 0.85:
        detener()

def al_terminar(e):
    print("terminó en la fase", fase, "con éxito", e.exito)
```

En el estudio, al escribir te salen las opciones de cada función (por ejemplo `dron(` muestra "estandar", "azar" y los drones de tu hangar). ↑↓ para elegir, Enter o Tab para ponerla, Esc para cerrar y Ctrl+Espacio para abrirlas.

- **Arriba del archivo** (se lee una vez): `modelo`, `red`, `mision`/`nivel`, `dron`, `drones`, `entrenar_en` y los valores iniciales de `premios`, `aprendizaje`, `viento` y `velocidad`.
- **Funciones especiales** (las llama el juego mientras entrena):
  - `def al_empezar(e):` una vez, cuando el entrenamiento arranca (o cuando lo encuentras ya corriendo)
  - `def cada_generacion(e):` cada vez que termina una generación (todos los drones practicaron y el cerebro se ajustó)
  - `def al_terminar(e):` cuando el entrenamiento se detiene (detener(), desde la terminal o se cerró)
- Dentro de esas funciones puedes cambiar `premios`, `aprendizaje`, `viento` y `velocidad` en vivo, y llamar `pausar`, `seguir`, `guardar`, `detener`, `avisar` y `print`.

## Funciones

### El modelo

#### `modelo(nombre, desde="base")`

*Arriba del archivo.* El modelo que entrena este programa. Se guarda con ese nombre en models/drones/<nombre>/ (modelo.zip, modelo.json con su historia, modelo_web.json para volar en el juego). Si ya existe, sigue entrenando desde donde quedó.

- `nombre`: texto: letras, números, _ y -. "Halcón 1" queda como halcon_1
- `desde`: "base" (copia la IA de la campaña: ya sabe volar), "cero" (red nueva al azar: aprende todo desde cero) o el nombre de otro modelo TUYO ya entrenado, por ejemplo desde="colibri" (parte de lo que ese ya aprendió; el original no se toca). Solo cuenta al crearlo: si el modelo ya existe, sigue entrenando el suyo.

```python
modelo("camarografo", desde="colibri")   # parte del colibrí, que ya sabe volar
```

#### `red(capas=[128, 128])`

*Arriba del archivo.* El tamaño del cerebro: cuántas capas ocultas y cuántas neuronas en cada una. Entran siempre 38 números (sensores) y salen 4 (las palancas). Más neuronas = puede aprender cosas más difíciles, pero tarda más. Solo con desde="cero".

- `capas`: lista de 1 a 4 números entre 8 y 512. La IA de la campaña usa [128, 128]

```python
red(capas=[64, 64])
```

### Qué aprende

#### `mision(id)`

*Arriba del archivo.* Qué practica: el mundo, la tarea y cuándo cuenta como éxito. Trae sus premios recomendados (los cambias con premios() y castigos()).

- `id`: "grabar", "grabar_viento", "grabar_postes", "repaso_metas" o "repaso_columnas"

```python
mision("grabar_postes")
```

#### `nivel(n)`

*Arriba del archivo.* En vez de mision(): cualquier nivel del Drone Lab, del 0 (quedarse quieto) al 12 (grabar entre postes). Sin premios recomendados: pon los tuyos.

- `n`: 0 hover · 1 meta fija · 2 metas al azar · 3 columnas · 4 varias metas · 5 circuito · 6 bosque · 7 bosque con aros · 8-10 caza · 11 grabar · 12 grabar entre postes

```python
nivel(0)
```

#### `dron(cual)`

*Arriba del archivo.* Con qué física vuela mientras aprende. Un modelo aprende a volar EL dron con el que entrenó: si después lo pones en un dron muy distinto (más pesado, más lento) vuela peor.

- `cual`: "estandar", "azar" (cada dron con una física distinta: aprende a volar de todo) o el nombre de un dron de tu hangar

```python
dron("azar")
```

#### `viento(m_s)`

*Arriba o dentro de una función.* Viento máximo con ráfagas, en metros por segundo. Aprender con viento lo hace más firme.

- `m_s`: de 0 a 8

```python
viento(2.5)
```

### Cómo entrena

#### `drones(n)`

*Arriba del archivo.* Cuántos drones practican a la vez. Todos comparten el mismo cerebro: más drones = más experiencia por generación.

- `n`: de 1 a 200 (normal: 50)

```python
drones(50)
```

#### `entrenar_en(donde)`

*Arriba del archivo.* "fondo": entrena en tu compu sin ventana (hasta 2 a la vez). "blender": lo ves en el Drone Lab de Blender (los drones volando, el cerebro, las curvas). Blender tiene que estar abierto con blender/laboratorio.blend (en la terminal: blender).

- `donde`: "fondo" o "blender"

```python
entrenar_en("blender")
```

#### `velocidad(v)`

*Arriba o dentro de una función.* "rapido": entrena lo más rápido que puede tu compu. "real": a velocidad normal, para mirarlo en Blender.

- `v`: "rapido" o "real"

```python
velocidad("rapido")
```

#### `aprendizaje(lr=0.0003, exploracion=0.0)`

*Arriba o dentro de una función.* lr (learning rate) = qué tan grande es cada ajuste del cerebro. Muy alto: aprende rápido pero se olvida y se vuelve loco; muy bajo: casi no cambia. exploracion = cuánto lo empujas a probar cosas nuevas (el premio por tener dudas).

- `lr`: de 0.000001 a 0.01 (normal 0.0003; para afinar al final 0.0001)
- `exploracion`: de 0 a 0.1 (normal 0; súbelo un poco si se estanca)

```python
aprendizaje(lr=0.0003, exploracion=0.005)
```

### Premios y castigos

#### `premios(grabar=4, mirar=4, …)`

*Arriba o dentro de una función.* Lo que le PAGAS a cada dron por hacer algo bien, de 0 a 10 (0 = apagado, 4 = lo normal, 10 = al máximo). ES lo que aprende: hará lo que más pague. Solo acepta premios (los castigos van en castigos()). Los que no pongas quedan como los recomienda la misión. El juego los traduce a los valores que usa el entrenador. Dentro de una función los cambia mientras entrena.

- `film / grabar`: premio por cada segundo grabado, según la calidad de la imagen
- `heading / mirar`: premio por mirar al sujeto con la nariz (la cámara)
- `progress / acercarse`: premio por cada metro que se acerca al punto
- `goal / meta`: premio al llegar o al terminar la toma
- `near / cerca`: premio por estar cerca de la meta
- `speed / rapidez`: premio por llegar rápido a un aro

```python
premios(grabar=6, mirar=4)
```

#### `castigos(chocar=3, sacudidas=4, …)`

*Arriba o dentro de una función.* Lo que le COBRAS a cada dron por hacer algo mal, de 0 a 10 (0 = apagado, 4 = lo normal, 10 = al máximo). Aprende a evitarlo, pero ojo: si castigas demasiado, prefiere no hacer nada. Solo acepta castigos (los premios van en premios()). Los que no pongas quedan como los recomienda la misión. El juego los traduce a los valores que usa el entrenador. Dentro de una función los cambia mientras entrena.

- `crash / chocar`: castigo al chocar
- `stability / sacudidas`: castigo por giros bruscos (video que tiembla)
- `smooth / brusco`: castigo por mover las palancas de golpe
- `clearance / pegado`: castigo por pasar a menos de 1,2 m de algo
- `danger / peligro`: castigo por ir rápido hacia algo
- `tilt / inclinar`: castigo por andar inclinado
- `time / tiempo`: castigo pequeño cada paso (que no se demore)

```python
castigos(chocar=5, sacudidas=6)
```

### Mientras entrena

#### `pausar()`

*Dentro de una función.* Pone el entrenamiento en pausa (no se pierde nada).

```python
if e.minutos > 30: pausar()
```

#### `seguir()`

*Dentro de una función.* Sigue después de una pausa.

```python
seguir()
```

#### `guardar()`

*Dentro de una función.* Guarda el modelo ya (también se guarda solo cada 10 generaciones).

```python
if e.exito > e.mejor_exito: guardar()
```

#### `detener()`

*Dentro de una función.* Guarda y termina el entrenamiento. Úsalo para parar cuando ya aprendió.

```python
if e.exito >= 0.9: detener()
```

#### `avisar(texto)`

*Arriba o dentro de una función.* Muestra un aviso grande en el juego (y en la terminal).

- `texto`: lo que quieras decir

```python
avisar(f"¡Ya graba! éxito {e.exito:.0%}")
```

### Python

#### `print(a, b, …)`

*Arriba o dentro de una función.* Escribe en la terminal.

```python
print("generación", e.generacion, "éxito", e.exito)
```

#### `nombre = valor`

*Arriba o dentro de una función.* Guarda un valor con un nombre para usarlo después: un texto, un número, una lista o un diccionario. Ponlas arriba del archivo (la configuración en un solo lugar) y pásalas a las funciones: modelo(model_test). Dentro de def, para CAMBIAR una variable de arriba escribe global nombre. El autocompletado te ofrece tus variables donde sirven (las de texto en modelo(, las listas en capas=, los diccionarios en premios(…).

- `texto`: model_test = "colibri"   ·   nombre = f"{BASE}_v{VERSION}"
- `número`: N = 32   ·   META = 0.85
- `lista`: CAPAS = [64, 64]   ·   [16 * i for i in range(1, 4)]
- `diccionario`: P = {"grabar": 6, "mirar": 4}   ->   premios(**P)
- `varias`: a, b = 1, 2   ·   for k, v in P.items():

```python
model_test = "colibri"
CAPAS = [64, 64]
modelo(model_test, desde="cero")
red(capas=CAPAS)
```

#### `if / for / def / listas / f"…" / [x for x in …]`

*Arriba o dentro de una función.* Lo que sí hay de Python: números, textos y f"{x:.2f}", True/False/None, listas [ ], tuplas ( ), diccionarios { }, variables, + - * / // % **, comparaciones, and/or/not, in, is, x if condición else y, if/elif/else, for x in … (y for k, v in d.items()), listas por comprensión [x * 2 for x in xs if x > 0], def/return (con valores por defecto y varios valores: return a, b), f(*lista, **diccionario), a, b = 1, 2, global, pass, break/continue. Funciones: print, str, int, float, round, abs, min, max, sum, len, range, list, type; listas .append() .pop(); diccionarios .get() .keys() .values() .items(); textos .upper() .lower() .split(). No hay while ni import: un programa no puede colgar el juego ni tocar tu compu.

```python
CAPAS = [16 * i for i in range(1, 4)]   # [16, 32, 48]
for k, v in {"grabar": 6, "mirar": 4}.items():
    print(k, v)
```

## Premios y castigos: de 0 a 10

Todos van de **0 a 10**: 0 = apagado, **4 = lo normal**, 10 = al máximo. Lo que importa es cuánto pesa uno contra otro.
El juego los traduce al valor que usa el entrenador (`real = nivel / 10 × escala`, con `escala_premios` de `app/data/entrenamiento.json`).
Lo que no pongas queda como lo recomienda la misión.

| en PBDMM | tipo | qué hace | grabar | grabar_viento | grabar_postes | repaso_metas | repaso_columnas | 10 = (real) |
|---|---|---|---|---|---|---|---|---|
| `grabar` (film) | premio | Por cada segundo grabado, según la calidad de imagen (0 a 1): la casa al centro del cuadro × pegado al punto de cámara × a su ritmo × sin sacudidas. Es EL premio de grabar. | 4 | 4 | 4 | 3 | 3 | 10 |
| `mirar` (heading) | premio | La nariz (la cámara) hacia la casa: paga en el acto cada grado que gira hacia ella y cobra por segundo si mira para otro lado. Sin esto llega a la zona mirando a cualquier lado. | 4 | 4 | 4 | 4 | 4 | 5 |
| `acercarse` (progress) | premio | Por cada metro que se acerca al punto de cámara (primero el inicio de la ruta, después el punto que avanza). | 4 | 4 | 4 | 4 | 4 | 5 |
| `meta` (goal) | premio | Al terminar la ruta: este premio × la calidad media de la toma. Una toma mala casi no paga. | 4 | 4 | 4 | 4 | 4 | 25 |
| `rapidez` (speed) | premio | Al pasar un aro, más premio si llegó rápido. Para grabar no sirve (va en 0). | 0 | 0 | 0 | 4 | 4 | 0.75 |
| `cerca` (near) | premio | Por estar cerca de la meta (niveles de metas y hover). | 4 | 4 | 4 | 4 | 4 | 0.75 |
| `sacudidas` (stability) | castigo | Por cada segundo de giros bruscos de roll/pitch. Un video que tiembla no sirve: súbelo si ves que la imagen se sacude. | 4 | 5 | 4 | 2 | 2 | 2.5 |
| `brusco` (smooth) | castigo | Por cambiar las palancas de golpe. Ojo: también cobra el ruido con el que explora; muy alto y deja de probar cosas. | 4 | 4 | 4 | 4 | 4 | 0.125 |
| `chocar` (crash) | castigo | Al chocar con la casa, el piso o salirse del área. En el juego un choque cuesta plata: que le duela. | 3 | 3 | 3 | 2 | 2 | 50 |
| `pegado` (clearance) | castigo | Por pasar a menos de 1,2 m de algo. Lo siente ANTES de chocar con el techo o las paredes. | 2 | 2 | 4 | 0 | 2 | 1.5 |
| `peligro` (danger) | castigo | Por ir hacia un obstáculo con menos de 1 s para chocar. Aprende a frenar a tiempo. | 4 | 4 | 6 | 0 | 4 | 0.5 |
| `inclinar` (tilt) | castigo | Por andar inclinado. Un poco ayuda a que no haga maniobras exageradas. | 4 | 4 | 4 | 4 | 4 | 0.025 |
| `tiempo` (time) | castigo | Un poquito cada paso: que no se demore en llegar. | 4 | 4 | 4 | 4 | 4 | 0.025 |

## Misiones

| `mision(...)` | nivel | para | qué aprende |
|---|---|---|---|
| `"grabar"` | 11 | Casa en venta | Una casa al azar y una toma al azar: FIJA (quieto en un punto exacto), ÓRBITA (dar la vuelta a la casa por un arco) o REVELAR (subir alejándose). Tiene que llegar al inicio de la ruta y seguir el punto de cámara pegado, con la nariz (la cámara) en la casa, a su ritmo y sin sacudidas. La casa es un obstáculo. |
| `"grabar_viento"` | 11 | Finca El Roble | Lo mismo que Grabar, pero con viento de 2,5 m/s y ráfagas: tiene que compensar el empuje del viento sin salirse de la ruta. Sin esto, en la finca la toma se le sale. |
| `"grabar_postes"` | 12 | Restaurante La Brasa | Lo mismo que Grabar, con 5-9 postes o sombrillas a 1,5 m de la ruta. Tiene que verlos con los 10 sensores de distancia (ponle los ToF a tu dron) y pasar entre ellos sin perder el encuadre. |
| `"repaso_metas"` | 2 | No olvidar volar | Un aro al azar a 3-8 m, arrancando mirando a cualquier lado. Sirve para que aprenda a volar TU dron (más pesado y lento que el de antes) sin olvidar lo básico. |
| `"repaso_columnas"` | 3 | No olvidar esquivar | Un aro al azar con columnas en el camino. Repasarlo de vez en cuando con tu dron evita que olvide esquivar mientras aprende a grabar. |

Con `nivel(n)`: 0 Hover (quedarse quieto) · 1 Meta fija · 2 Metas al azar · 3 Columnas · 4 Varias metas · 5 Circuito (2 vueltas) · 6 Bosque · 7 Bosque: 3 aros · 8 Caza: 5 pájaros · 9 Caza entre columnas · 10 Caza en el bosque · 11 Grabar: tomas con ruta · 12 Grabar entre postes.

## Lo que trae `e`

- `e.generacion`: cuántas generaciones lleva este modelo (en total)
- `e.generaciones_sesion`: cuántas lleva desde que corriste el programa
- `e.exito`: de 0 a 1: qué fracción de los intentos logró la misión en la última generación
- `e.choque`: de 0 a 1: qué fracción chocó
- `e.premio`: el premio promedio de un intento (sube si aprende lo que pagas)
- `e.calidad`: de 0 a 1: la calidad de imagen al grabar (misiones de grabar)
- `e.mejor_exito`: el mejor éxito desde que corriste el programa
- `e.historia_exito`: lista con el éxito de las últimas 20 generaciones
- `e.pasos`: cuántos pasos de simulación lleva en total
- `e.minutos`: minutos desde que corriste el programa
- `e.nivel`: el nivel del Drone Lab
- `e.pausado`: True si está en pausa
- `e.lr, e.exploracion, e.ruido, e.viento`: cómo está entrenando ahora (ruido = cuánto tiembla al explorar, baja solo con el tiempo)
- `e.premios`: los valores de ahora, premios y castigos juntos, de 0 a 10 (diccionario: e.premios["crash"])

## La terminal del estudio

- `ayuda [tema]`: esta ayuda; ayuda premios, ayuda e, ayuda mision… o el nombre de una función
- `correr [archivo]`: corre el programa abierto (o ese archivo): crea o sigue el modelo y empieza a entrenar
- `revisar [archivo]`: solo lo revisa (errores y qué pediría) sin entrenar
- `parar`: deja de escuchar el programa (el entrenamiento sigue; las funciones ya no se llaman)
- `estado`: qué está entrenando (Blender y el fondo): generación, éxito, choque
- `modelos [éxito|gen|nombre]`: tus modelos con su generación, red y éxito (ordenados por lo que digas)
- `info <modelo>`: todo de un modelo: red, de dónde salió, niveles, curva de éxito
- `pausar <modelo> · seguir <modelo> · detener <modelo>`: controla un entrenamiento en el fondo (o el de Blender)
- `copiar <modelo> <nuevo> · renombrar <modelo> <nuevo> · borrar <modelo>`: borrar lo manda a la papelera (models/drones/_papelera)
- `archivos · nuevo <nombre> · abrir <nombre> · eliminar [nombre]`: tus programas .pbd (se guardan en este navegador; descarga con el botón). eliminar sin nombre = el abierto; también con la × de la lista
- `ejemplo <nombre>`: abre un ejemplo: hover, grabar, curriculum, postes, cerebro_chico
- `blender`: abre Blender con el Drone Lab (si lo tienes instalado)
- `avance <modelo> · simular <modelo>`: el mejor y el peor intento que ha tenido entrenando · una prueba al azar ahora, con su última generación (sin detener el entrenamiento): con el recorrido, la red, gráficas y cámaras
- `cargar [modelo] [dron]`: sube la ÚLTIMA generación del modelo al dron (si está entrenando, primero la guarda). Sin dron: el activo; sin modelo: el que estás mirando. Ej: cargar sagaz_model cine · cargar sagaz_model "Cine (dev)" (volar = lo mismo)
- `limpiar`: borra la terminal

## Python que sí hay

Lo que sí hay de Python: números, textos y f"{x:.2f}", True/False/None, listas [ ], tuplas ( ), diccionarios { }, variables, + - * / // % **, comparaciones, and/or/not, in, is, x if condición else y, if/elif/else, for x in … (y for k, v in d.items()), listas por comprensión [x * 2 for x in xs if x > 0], def/return (con valores por defecto y varios valores: return a, b), f(*lista, **diccionario), a, b = 1, 2, global, pass, break/continue. Funciones: print, str, int, float, round, abs, min, max, sum, len, range, list, type; listas .append() .pop(); diccionarios .get() .keys() .values() .items(); textos .upper() .lower() .split(). No hay while ni import: un programa no puede colgar el juego ni tocar tu compu.

## Aprende: cómo se entrena una IA

### 1 · Qué es la IA del dron

La IA es una red neuronal: una función con miles de números adentro (los pesos). Cada instante recibe 38 números —lo que siente el dron: su inclinación, su velocidad, hacia dónde está la meta, 10 sensores de distancia, dónde está la casa que graba, cómo es su física— y devuelve 4: las palancas (gas, roll, pitch, yaw). Al principio los pesos son al azar: el dron se cae. Entrenar es cambiar esos números poco a poco hasta que las palancas que salen lo hagan volar bien. Míralo en vivo: pestaña Gráfica → Red neuronal, y elige cuál de los drones que entrenan quieres ver.

### 2 · Cómo aprende: premios

Nadie le dice qué palanca mover. Se llama aprendizaje por refuerzo: el dron prueba, y tú le pagas puntos por lo bueno (acercarse, grabar bien) y se los cobras por lo malo (chocar, temblar). La red se ajusta para hacer más de lo que pagó. Por eso los premios SON el programa: si pagas mucho por acercarse y poco por no chocar, aprenderá a acercarse chocando. Pensar los premios es el trabajo del desarrollador. En PBDMM: premios(grabar=6) paga, castigos(chocar=3) cobra. Todo va de 0 a 10: 4 es lo normal; súbelo si quieres que le importe más, bájalo si le importa demasiado. Lo que importa es cuánto pesa uno contra otro.

### 3 · Generaciones, PPO y lr

Todos los drones (drones(50)) vuelan un rato con el mismo cerebro: eso es una generación. Al final, PPO (el algoritmo) mira qué acciones dieron más premio del esperado y empuja los pesos un poquito hacia ellas. Qué tan grande es ese empujón es el lr (learning rate). Grande: aprende rápido pero puede olvidar lo que ya sabía. Chico: lento pero estable. Por eso es común empezar con 0.0003 y bajarlo cuando ya casi lo logra.

### 4 · Explorar o aprovechar

Para descubrir algo nuevo el dron tiene que probar palancas que no conoce: le sumamos ruido a lo que decide (e.ruido). Con el tiempo el ruido baja solo y aprovecha lo que ya sabe. Si se estanca (el éxito no sube en muchas generaciones), sube un poco la exploración: aprendizaje(exploracion=0.005).

### 5 · Currículum: de fácil a difícil

Nadie aprende a grabar entre postes sin saber volar. Primero quedarse quieto (nivel 0), después ir a metas (2), después esquivar (3), después grabar (11) y al final con postes (12). Cada modelo puede partir de otro (modelo("nuevo", desde="otro")) y con cada_generacion puedes cambiar los premios y castigos cuando ya domina lo básico. Mira el ejemplo curriculum.

### 6 · Medir: éxito, choque, premio

e.exito es lo que importa (cuántos intentos lograron la misión). e.premio sube si aprende lo que pagas —si sube el premio y no el éxito, estás pagando por lo que no es—. e.choque debería bajar. La gráfica del estudio muestra las tres. Un modelo se compara con otro por su éxito en la MISMA misión (comando: modelos éxito).

### 7 · Verlo en Blender

Con entrenar_en("blender") el mismo entrenamiento se ve en el Drone Lab de Blender: los 50 drones volando, el cerebro encendiéndose, las curvas. Abre Blender desde la terminal (comando blender) o con blender/laboratorio.blend. Si Blender ya estaba abierto desde antes de actualizar el juego, ciérralo (Detener y guardar) y ábrelo otra vez.

## Ejemplos

### hover

```python
# Mi primer modelo: quedarse quieto en el aire.
# Una red chica, desde cero. Mira cómo pasa de caerse a flotar.

modelo("colibri", desde="cero")
red(capas=[64, 64])
nivel(0)                 # hover: quedarse en un punto
dron("estandar")
drones(50)
entrenar_en("fondo")

# todo va de 0 a 10: 0 = apagado, 4 = lo normal, 10 = al máximo
premios(cerca=8)
castigos(chocar=4, inclinar=8, brusco=4)

def cada_generacion(e):
    print(f"gen {e.generacion}: éxito {e.exito:.0%}, choque {e.choque:.0%}")
    if e.exito >= 0.95:
        avisar("¡Colibrí ya flota!")
        detener()
```

### grabar

```python
# Grabar casas: parte de la IA de la campaña (ya sabe volar)
# y la especializa en grabar con tu dron.

modelo("camarografo", desde="base")
mision("grabar")
dron("azar")             # cambia por el nombre de un dron de tu hangar
entrenar_en("fondo")
aprendizaje(lr=0.0003)

# los premios y castigos de la misión, con más castigo a las sacudidas
castigos(sacudidas=6)     # lo normal es 4

def cada_generacion(e):
    if e.generacion % 10 == 0:
        print(f"gen {e.generacion}: éxito {e.exito:.0%} · calidad {e.calidad}")
    if e.exito >= 0.8:
        aprendizaje(lr=0.0001)   # ya casi: ajustes finos
    if e.exito >= 0.9:
        detener()
```

### curriculum

```python
# Currículum: primero que no choque, después que grabe bien.

modelo("aprendiz", desde="base")
mision("grabar_postes")
dron("azar")
entrenar_en("fondo")

castigos(chocar=8)     # fase 1: no chocar es lo que más importa
premios(grabar=1)
fase = 1

def cada_generacion(e):
    global fase
    if fase == 1 and e.choque is not None and e.choque < 0.1:
        fase = 2
        castigos(chocar=3)    # fase 2: ahora, grabar bien
        premios(grabar=6)
        avisar("Fase 2: ya no choca, ahora a grabar")
    if fase == 2 and e.exito >= 0.85:
        detener()

def al_terminar(e):
    print("terminó en la fase", fase, "con éxito", e.exito)
```

### postes

```python
# El restaurante: grabar entre postes, mirándolo en Blender.

modelo("entre_postes", desde="base")
mision("grabar_postes")
dron("azar")
drones(50)
entrenar_en("blender")      # ábrelo con el comando: blender
velocidad("real")

def al_empezar(e):
    print("arranca en la generación", e.generacion)

def cada_generacion(e):
    # si se estanca 20 generaciones, que explore un poco más
    h = e.historia_exito
    if len(h) == 20 and max(h) - min(h) < 0.02:
        aprendizaje(exploracion=0.005)
        print("estancado: más exploración")
```

### cerebro_chico

```python
# ¿Cuánto cerebro hace falta? El mismo hover con 2 tamaños.
# Corre este, después cambia el nombre y las capas, y compáralos con: modelos éxito

modelo("mini_16", desde="cero")
red(capas=[16])
nivel(0)
entrenar_en("fondo")
premios(cerca=8)
castigos(chocar=4, inclinar=8)

def cada_generacion(e):
    if e.generaciones_sesion >= 300:
        print(f"300 generaciones: éxito {e.exito:.0%}")
        detener()
```

### variables

```python
# Variables: la configuración arriba, en un solo lugar, y el resto la usa.
NOMBRE = "halcon"
VERSION = 2
model_test = f"{NOMBRE}_v{VERSION}"      # "halcon_v2"
CAPAS = [64, 64]
MI_DRON = "azar"                         # o el nombre de un dron de tu hangar
META = 0.85

modelo(model_test, desde="cero")
red(capas=CAPAS)
mision("grabar")
dron(MI_DRON)
entrenar_en("fondo")

# las fases del entrenamiento en una lista: para agregar una, agrega un diccionario
FASES = [
    {"nombre": "no chocar", "premios": {"grabar": 2}, "castigos": {"chocar": 8}, "hasta": 0.3},
    {"nombre": "grabar bien", "premios": {"grabar": 6, "mirar": 5}, "castigos": {"chocar": 3}, "hasta": META},
]
fase = 0
premios(**FASES[0]["premios"])
castigos(**FASES[0]["castigos"])

def cambiar_fase():
    global fase
    fase += 1
    f = FASES[fase]
    premios(**f["premios"])
    castigos(**f["castigos"])
    avisar(f"Fase {fase + 1}: {f['nombre']}")

def cada_generacion(e):
    if e.exito is None:
        return
    if e.exito >= FASES[fase]["hasta"]:
        if fase + 1 < len(FASES):
            cambiar_fase()
        else:
            print(f"{model_test} llegó a {e.exito:.0%}: listo")
            detener()
```

## Por dentro

- `app/pbdmm.js`: léxico → árbol → intérprete (un subconjunto de Python) y `compilar()`: el programa → la configuración del entrenamiento + las funciones especiales. `pedidoDe(cfg)` arma el `POST /api/lab`; `estadoE(tr)` arma `e` desde `entrenando.json`.
- `app/autocompletar.js`: el autocompletado del editor (`dron(` → "estandar", "azar" y tus drones; `mision(`, `nivel(`, `premios(`, `desde=`, `e.`, `def `). Las opciones fijas están en `opciones` de cada función en `app/data/pbdmm.json`; las de tu juego (`$drones`, `$misiones`, `$modelos`…) se llenan solas. Ctrl+Espacio las abre.
- La red en vivo (pestaña Gráfica → Red neuronal): `live_train.py` escribe 4 veces por segundo `<estado>_red.json` (activaciones del dron que mira + las conexiones más fuertes de cada capa); `GET /api/red?modelo=` lo entrega; `POST /api/lab` con `watch: i` cambia el dron que mira (también en Blender).
- `app/estudio.js`: la pantalla (editor, terminal, ayuda, gráfica). Cada 1,5 s lee `GET /api/lab`; si la generación subió, llama `cada_generacion(e)`, y lo que pida (premios, lr…) va como `ajustar`.
- `scripts/jugar.py`: `POST /api/lab` acepta `lr`, `ent`, `capas` (red nueva → `info.json`) y la acción `guardar`. `live_train.py --capas` (o `capas` en `info.json`) arma la red.
- Pruebas: `node app/test_pbdmm.mjs`.
