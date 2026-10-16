# Tutorial de PBDMM · la ruta del programador

> Versión 3.0. Se genera desde `app/data/pbdmm.json` ("ruta") con `node app/doc_pbdmm.mjs`: no lo edites a mano.

Son los mismos 8 capítulos que trae el juego. En el **modo desarrollador**, el capítulo 1 está abierto desde el inicio y
**cada dron que creas en el garaje abre el siguiente**: el programa del capítulo usa ese dron. En el Estudio, 📖 Documentación →
**Ruta** → *Abrir el programa del capítulo*. Cada capítulo agrega **una idea** y trae un **reto** que el juego mide solo
(al revisar o correr el programa, o mientras entrena). Nada se bloquea: todo el lenguaje funciona desde el principio.

Aquí `{dron}` es el dron de tu capítulo y `{modelo}` el nombre del modelo (el juego los pone solos).

---

## 1 · Hola, dron

Un programa mínimo dice tres cosas: QUÉ modelo entrenas (modelo), QUÉ tiene que aprender (mision) y CON QUÉ dron (dron). Escribirlo así se llama llamar funciones: un nombre, paréntesis y lo que necesita. Córrelo y mira la gráfica.

**Aprendes:** `modelo` · `mision` · `dron`

**Reto:** Entrena 20 generaciones con un programa (comando correr; mira estado).

```python
# Capítulo 1 · Hola, dron
# Tres líneas: qué modelo, qué aprende, con qué dron.

modelo("{modelo}", desde="base")   # "base" = parte de la IA que ya sabe volar
mision("grabar")                   # grabar una casa (nivel 11)
dron("{dron}")                     # aprende con la física de este dron

# Reto: córrelo (Ctrl/⌘+Enter) y deja que entrene 20 generaciones.
# En la terminal: estado (cómo va) · detener {modelo} (pararlo)
```

---

## 2 · Conoce tu dron

dron("…") además de elegir el dron, te lo DEVUELVE: guárdalo en una variable (d = dron(…)) y lee sus datos con un punto: d.empuje_peso, d.bateria.minutos, d.radio.alcance_m. ficha(d) imprime todo. Es como un monitor serial: el programa te muestra lo que tiene adentro. Si tu dron todavía no tiene piezas, sus datos salen None (y armado ✗): ponle piezas en el garaje.

**Aprendes:** `dron_info` · `ficha` · `variables` · `print`

**Reto:** Imprime el empuje/peso y los minutos de batería de tu dron.

```python
# Capítulo 2 · Conoce tu dron

d = dron("{dron}")        # elige el dron Y lo guarda en la variable d
modelo("{modelo}", desde="base")
mision("grabar")

ficha(d)                   # todo lo que sabe el juego de tu dron

# Reto: imprime solo lo importante. Completa la línea:
print("empuje/peso:", d.empuje_peso, "· batería:", d.bateria.minutos, "min")
# Usa revisar (no hace falta entrenar) para ver lo que imprime.
```

---

## 3 · Lo que pagas es lo que aprende

La IA no sabe qué está bien: hace lo que más le PAGAS. premios() paga por lo bueno y castigos() cobra por lo malo, de 0 a 10 (4 = lo normal). Si castigas demasiado, aprende que lo más seguro es no moverse. explicar("premios") te lo recuerda.

**Aprendes:** `premios` · `castigos` · `explicar`

**Reto:** Baja el choque por debajo del 20 % (después de 5 generaciones).

```python
# Capítulo 3 · Lo que pagas es lo que aprende

modelo("{modelo}", desde="base")
mision("grabar_postes")
dron("{dron}")

explicar("castigos")
premios(grabar=4, mirar=4)
castigos(chocar=8, pegado=6)   # chocar y pasar pegado a un poste: caro

# Reto: que choque menos del 20 %. Mira la línea roja de la gráfica.
```

---

## 4 · ¿Sirve para la misión?

Antes de entrenar, revisa si el dron puede hacer la misión en el juego: m = mision("…") trae lo que pide (m.pide) y revisar(d, m) lo compara con tu dron: ✅ cumple, ⚠️ justo, ❌ le falta. Si eliges un dron con dron(…), el programa lo revisa solo al correr.

**Aprendes:** `mision_info` · `revisar` · `if`

**Reto:** Un programa que pase la revisión sin ❌ (cambia de dron o de misión, o mejora el dron en la Tienda).

```python
# Capítulo 4 · ¿Sirve para la misión?

d = dron("{dron}")
m = mision("grabar_viento")      # la finca: viento de 2,5 m/s
modelo("{modelo}", desde="base")

print("la misión pide:", m.pide)
if d.empuje_peso < m.pide.get("empuje_peso_min", 0):
    print("no aguanta el viento: necesita más empuje")

r = revisar(d, m)
print("¿sirve?", r.ok)
# Reto: que no salga ningún ❌ (prueba otro dron de tu hangar, u otra misión).
```

---

## 5 · Mirar mientras aprende

Lo de arriba se lee una vez. Para REACCIONAR mientras entrena, define def cada_generacion(e): el juego la llama al terminar cada generación, y e trae cómo va (e.exito, e.choque, e.cambio…). narrar(cada=5) hace que la terminal cuente cómo va en palabras.

**Aprendes:** `cada_generacion` · `e` · `avisar` · `narrar`

**Reto:** Que tu programa avise (avisar) cuando el éxito pase el 50 %.

```python
# Capítulo 5 · Mirar mientras aprende

modelo("{modelo}", desde="base")
mision("grabar")
dron("{dron}")
narrar(cada=5)            # la terminal cuenta cómo va cada 5 generaciones

def cada_generacion(e):
    print(f"gen {e.generacion}: éxito {e.exito:.0%} · cambio {e.cambio.exito}")
    # Reto: avisa cuando pase el 50 %
    if e.exito >= 0.5:
        avisar("¡Ya graba bien la mitad de las veces!")
```

---

## 6 · Currículum

Nadie aprende lo difícil de una: primero que no choque, después que grabe bien. Una variable global recuerda la fase, y dentro de cada_generacion cambias los premios EN VIVO cuando ya domina lo básico.

**Aprendes:** `global` · `premios` · `castigos` · `desde`

**Reto:** Que el programa cambie los premios o castigos solo, mientras entrena.

```python
# Capítulo 6 · Currículum

modelo("{modelo}", desde="base")
mision("grabar_postes")
dron("{dron}")
narrar(cada=5)

castigos(chocar=8)    # fase 1: no chocar
premios(grabar=1)
fase = 1

def cada_generacion(e):
    global fase
    if fase == 1 and e.choque is not None and e.choque < 0.15:
        fase = 2
        castigos(chocar=3)    # fase 2: ahora, grabar bien
        premios(grabar=6)
        avisar("Fase 2: a grabar")
```

---

## 7 · Un cerebro a medida

Con desde="cero" el modelo nace con un cerebro al azar, del tamaño que digas con red(capas=[…]). El lr es qué tan grande es cada ajuste y la exploración cuánto prueba cosas nuevas: explicar("lr"). Mira la red en vivo: la app 📈 Simuladores.

**Aprendes:** `red` · `aprendizaje` · `explicar`

**Reto:** Un modelo desde cero que llegue a 30 % de éxito.

```python
# Capítulo 7 · Un cerebro a medida

modelo("{modelo}", desde="cero")
red(capas=[64, 64])         # 38 sensores → 64 → 64 → 4 palancas
nivel(0)                    # quedarse quieto en el aire (hover)
dron("{dron}")
aprendizaje(lr=0.0003)
narrar(cada=10)

explicar("lr")
premios(cerca=8)
castigos(chocar=4, inclinar=8)
```

---

## 8 · Tu propio monitor

Tus propias funciones (def), listas y for, como un programa de verdad. hangar() trae tus drones como una lista; tabla() la muestra en columnas, barra() dibuja un número de 0 a 1 y sorted() ordena.

**Aprendes:** `def` · `for` · `hangar` · `tabla` · `barra` · `sorted`

**Reto:** Una tabla de tu hangar (tabla(hangar(), …)) en un programa con una función tuya (def).

```python
# Capítulo 8 · Tu propio monitor

modelo("{modelo}", desde="base")
mision("grabar")

def empuje(d):
    return d.empuje_peso if d.armado else 0

drones_ordenados = sorted(hangar(), key=empuje, reverse=True)
tabla(drones_ordenados, "nombre", "empuje_peso", "minutos", "radio.alcance_m")

def cada_generacion(e):
    print(f"gen {e.generacion}  {barra(e.exito)}")
```

---

## Para seguir

- [Referencia del lenguaje](referencia.md): todo lo que se puede escribir.
- [API de entrenamiento](../PBDMM.md): todas las funciones, el objeto `e` y los comandos.
- En la terminal del Estudio: `ejemplo curriculum`, `ejemplo postes`, `ejemplo monitor`, `explicar("lr")`.
