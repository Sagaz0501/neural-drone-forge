# Biblioteca básica

> Versión 2.0. Las funciones de Python que trae PBDMM y los métodos de las listas, los textos y los diccionarios. Las
> funciones **del dron** (`modelo`, `mision`, `premios`, `detener`…) están en la [API de entrenamiento](../PBDMM.md).

## Funciones

| Función | Qué hace | Ejemplo → resultado |
|---|---|---|
| `print(a, b, …, sep=" ")` | Escribe en la terminal, separando con `sep` | `print("éxito", 0.5)` → `éxito 0.5` |
| `str(x)` | El valor como texto | `str(3)` → `"3"` |
| `int(x)` | Entero, cortando los decimales; acepta textos | `int("3.9")` → `3` |
| `float(x)` | Número; acepta textos | `float("2.5")` → `2.5` |
| `round(x, d=0)` | Redondea a `d` decimales | `round(3.14159, 2)` → `3.14` |
| `abs(x)` | Valor absoluto | `abs(-2)` → `2` |
| `min(a, b, …)` · `min(lista)` | El menor | `min([3, 1, 2])` → `1` |
| `max(a, b, …)` · `max(lista)` | El mayor | `max(e.historia_exito)` |
| `sum(lista)` | La suma | `sum([1, 2, 3])` → `6` |
| `len(x)` | Largo de un texto, una lista o un diccionario | `len("dron")` → `4` |
| `range(fin)` · `range(ini, fin, paso=1)` | Lista de enteros (hasta 100.000) | `range(2, 10, 3)` → `[2, 5, 8]` |
| `list(x)` | Copia una lista; con un texto da sus letras; con un diccionario, sus claves | `list("ab")` → `["a", "b"]` |
| `type(x)` | El nombre del tipo | `type(0.5)` → `"float"` |
| `sorted(xs, key=None, reverse=False)` | Una lista nueva, ordenada (por `key(x)` si la das) | `sorted(hangar(), key=f, reverse=True)` |
| `reversed(xs)` | La lista al revés | `reversed([1, 2])` → `[2, 1]` |
| `enumerate(xs, ini=0)` | Pares `[posición, valor]` | `for i, d in enumerate(hangar()):` |
| `zip(a, b, …)` | Junta listas elemento por elemento (hasta la más corta) | `zip([1, 2], [3, 4])` → `[[1, 3], [2, 4]]` |
| `any(xs)` · `all(xs)` | ¿Alguno es verdadero? · ¿Todos? | `any([d.tof for d in hangar()])` |

Notas:
- `round(2.5)` da `2` y `round(3.5)` da `4`: como Python, los `.5` van al par.
- `min`, `max` y `sorted` aceptan `key=` (una función tuya) y dan error con una lista vacía.

## Métodos

### Listas

| Método | Qué hace |
|---|---|
| `xs.append(x)` | Agrega `x` al final |
| `xs.pop()` · `xs.pop(i)` | Saca y devuelve el último (o el de la posición `i`) |
| `xs.count(x)` | Cuántas veces está `x` |
| `xs.index(x)` | La posición de `x` (da error si no está) |

### Textos

| Método | Qué hace |
|---|---|
| `s.upper()` · `s.lower()` | En mayúsculas · en minúsculas |
| `s.strip()` | Sin espacios al principio ni al final |
| `s.startswith(x)` · `s.endswith(x)` | Si empieza o termina con `x` |
| `s.replace(a, b)` | Cambia cada `a` por `b` |
| `s.split()` · `s.split(sep)` | Parte el texto: por espacios, o por `sep` |

### Diccionarios

| Método | Qué hace |
|---|---|
| `d.get(k, defecto=None)` | `d[k]`, o `defecto` si no está |
| `d.keys()` · `d.values()` · `d.items()` | Listas con las claves, los valores o los pares `[clave, valor]` |

## Objetos del juego

| Objeto | Dónde existe | Qué es |
|---|---|---|
| `e` | En las funciones especiales (`cada_generacion(e)`…) | Cómo va el entrenamiento: `e.generacion`, `e.exito`, `e.choque`, `e.premio`, `e.calidad`, `e.historia_exito`, `e.premios`, `e.cambio` (contra la generación anterior), `e.diagnosticos` (lo que se nota)… Los campos están en la [API](../PBDMM.md) |
| dron, misión, modelo, pieza | Lo que devuelven `dron()`, `dron_info()`, `hangar()`, `mision()`, `mision_info()`, `modelo_info()`, `inventario()` | Ver la [referencia §7b](referencia.md#7b-objetos-del-juego-pbdmm-2) |

## Leer el juego y la terminal (PBDMM 2)

| Función | Qué hace |
|---|---|
| `dron_info(nombre)` · `mision_info(id)` · `modelo_info(nombre)` | Un dron, una misión o un modelo como objeto |
| `hangar()` · `inventario(ranura=None)` | Tus drones · tus piezas (listas de objetos) |
| `revisar(d, m)` | El dron contra lo que pide la misión: imprime ✅ / ⚠️ / ❌ y devuelve `r.ok`, `r.errores`, `r.avisos` |
| `ficha(x)` | Imprime todo de un dron, una misión o un modelo |
| `tabla(filas, "col", …)` | Imprime una lista en columnas (las columnas aceptan punto: `"bateria.minutos"`) |
| `barra(x, ancho=20)` | `████████░░░░ 60 %` (devuelve el texto) |
| `color(nombre, texto)` | Texto de color en la terminal: verde, rojo, amarillo, azul o gris |
| `explicar(tema)` | Explica un parámetro o idea (`lr`, `exploracion`, `ppo`, `premios`…), con su valor de ahora |
| `narrar(cada=5)` | Arriba del archivo: la terminal cuenta cómo va cada tantas generaciones y avisa lo que se nota |

Los detalles y ejemplos de cada una están en la [API de entrenamiento](../PBDMM.md).

Los objetos son **solo para leer**. Un campo que todavía no tiene dato vale `None` (por ejemplo `e.choque` en la primera
generación).
