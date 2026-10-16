# Tutorial de PBDMM

> Para aprender desde cero. Cada parte usa **un dron de tu hangar** y agrega **una sola idea**. Todo lo que se escribe
> aquí funciona en la versión 1.0. Con PBDMM 2, estas partes se vuelven la *ruta del programador*: cada dron nuevo que
> armes abrirá la siguiente ([plan](../PBDMM2_PLAN.md#7-la-ruta-del-programador-parte-e-aprender-con-cada-dron)).

Antes de empezar: **Nueva partida → Modo desarrollador → Estudio PBDMM**. Escribe en el editor y usa la terminal de
abajo (`correr`, `estado`, `parar`).

---

## 1 · Hola, dron

Un programa mínimo tiene tres cosas: **qué modelo** entrenas, **qué tiene que aprender** y **con qué dron**.

```python
modelo("hola_dron", desde="base")   # "base" = parte de la IA que ya sabe volar
mision("grabar")                    # grabar la casa (nivel 11 del Drone Lab)
dron("Madera (dev)")                # la física de tu dron de madera
```

En la terminal escribe `correr`. El modelo `hola_dron` se crea en `models/drones/hola_dron/` y empieza a entrenar en
segundo plano. Escribe `estado` para ver cómo va.

**Qué aprendiste:** una **llamada a una función** es un nombre más paréntesis con lo que necesita, y los textos van
entre comillas. `desde=` es un **argumento con nombre**.

**Prueba:** cambia `desde="base"` por `desde="cero"` en un modelo nuevo y compara cuánto tarda en aprender.

---

## 2 · Variables y print

```python
nombre = "camarografo"
mi_dron = "Cine (dev)"

modelo(nombre, desde="base")
mision("grabar")
dron(mi_dron)

print("Entreno", nombre, "con", mi_dron)
print(f"El modelo se guarda en models/drones/{nombre}/")
```

**Qué aprendiste:** una **variable** guarda un valor con un nombre (`nombre = …`). `print` escribe en la terminal, y
un **f-texto** (`f"…{x}…"`) mete valores dentro de un texto.

---

## 3 · Lo que pagas es lo que aprende

La IA no sabe qué es "bien": hace lo que más **le pagas**. Los premios y los castigos van de 0 a 10 (4 = lo normal).

```python
modelo("cuidadoso", desde="base")
mision("grabar_postes")
dron("Madera (dev)")

premios(grabar=4, mirar=4)
castigos(chocar=9, pegado=6)    # muy caro chocar o pasar pegado a un poste
```

Córrelo y mira la gráfica: el **choque** debería bajar. Ahora prueba `castigos(chocar=10, pegado=10)` en otro modelo:
si castigas demasiado, el dron aprende que lo más seguro es… no moverse. El éxito se queda en cero.

**Qué aprendiste:** los premios **son** el programa. `ayuda premios` en la terminal muestra todos.

---

## 4 · Mirar mientras aprende

Las líneas de arriba se leen una vez. Para **reaccionar mientras entrena**, define una función especial:

```python
modelo("observador", desde="base")
mision("grabar")
dron("Madera (dev)")

def cada_generacion(e):
    print(f"gen {e.generacion}: éxito {e.exito:.0%}")
    if e.exito >= 0.5:
        avisar("¡Ya graba bien la mitad de las veces!")
        detener()
```

El juego llama `cada_generacion(e)` cada vez que los 50 drones terminan de practicar. `e` trae cómo va
(`e.exito`, `e.choque`, `e.premio`, `e.calidad`…).

**Qué aprendiste:** `def` define una función, el `if` decide y la **sangría** (4 espacios) marca qué va adentro.

**Cuidado:** en la primera generación `e.choque` puede ser `None`. Antes de comparar, revisa:
`if e.choque is not None and e.choque < 0.1:`.

---

## 5 · Currículum: de fácil a difícil

Primero que no choque, después que grabe bien. Una variable **global** recuerda en qué fase va:

```python
modelo("aprendiz", desde="base")
mision("grabar_postes")
dron("Madera (dev)")

castigos(chocar=8)
premios(grabar=1)
fase = 1

def cada_generacion(e):
    global fase
    if fase == 1 and e.choque is not None and e.choque < 0.1:
        fase = 2
        castigos(chocar=3)
        premios(grabar=6)
        avisar("Fase 2: ya no choca, ahora a grabar")
    if fase == 2 and e.exito >= 0.85:
        detener()
```

**Qué aprendiste:** `global` deja que la función **cambie** una variable de arriba. Dentro de una función, `premios()` y
`castigos()` cambian el entrenamiento **en vivo**.

---

## 6 · Un cerebro a medida

```python
modelo("cerebrito", desde="cero")   # red nueva, al azar
red(capas=[32, 32])                 # 38 entradas → 32 → 32 → 4 palancas
nivel(0)                            # quedarse quieto (hover)
dron("estandar")
aprendizaje(lr=0.0003)

premios(cerca=8)
castigos(chocar=4, inclinar=8)
```

Abre **Gráfica → Red neuronal** en el Estudio y mira cómo se encienden las neuronas. Prueba `[16]` y `[128, 128]`:
¿cuál aprende antes? ¿Cuál llega más alto?

**Qué aprendiste:** una **lista** (`[32, 32]`). El tamaño de la red y el `lr` (cuánto se ajusta en cada generación)
cambian cómo aprende. Las lecciones 3 y 4 del Estudio lo explican.

---

## 7 · Tu propio monitor

Tus propias funciones, listas y `for` para leer la historia como en un monitor serial:

```python
modelo("monitor", desde="base")
mision("grabar")
dron("Madera (dev)")

def barra(x, ancho=20):
    llenos = round(x * ancho)
    return "█" * llenos + "░" * (ancho - llenos)

def promedio(xs):
    xs = [x for x in xs if x is not None]
    return sum(xs) / len(xs) if xs else 0

def cada_generacion(e):
    ultimos = e.historia_exito
    print(f"gen {e.generacion}  {barra(e.exito or 0)}  {e.exito or 0:.0%}  (promedio {promedio(ultimos):.0%})")
    if len(ultimos) >= 10 and max(ultimos) - min(ultimos) < 0.02:
        print("Se estancó: subo un poco la exploración")
        aprendizaje(exploracion=0.005)
```

**Qué aprendiste:** `def` con `return` y con un valor por defecto, comprensiones de lista (`[x for x in xs if …]`),
`sum`, `len`, `max` y `min`, y `x or 0` para cuando todavía no hay dato.

---

## 8 · Verlo en Blender

Cambia una línea:

```python
entrenar_en("blender")
```

y abre Blender desde la terminal con `blender`. Es el mismo entrenamiento, pero ves los 50 drones volando y el cerebro
encendiéndose. Cuando termine, en la terminal: `cargar monitor "Madera (dev)"` sube la IA a tu dron, y con
**Que grabe la IA** la pruebas en un pedido de verdad.

---

## Para seguir

- [Referencia del lenguaje](referencia.md): todo lo que se puede escribir.
- [API de entrenamiento](../PBDMM.md): todas las funciones, el objeto `e` y los comandos.
- En la terminal: `ejemplo curriculum`, `ejemplo postes`, `ejemplo cerebro_chico`.
