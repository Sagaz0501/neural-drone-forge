# Referencia del lenguaje PBDMM

> Versión 1.0 del lenguaje. Describe lo que hace el intérprete de verdad ([`app/pbdmm.js`](../../app/pbdmm.js)). Cuando
> PBDMM se porta distinto que Python, lo dice un recuadro **≠ Python**.

Contenido: [1. Léxico](#1-léxico) · [2. Tipos y valores](#2-tipos-y-valores) · [3. Expresiones](#3-expresiones) ·
[4. Sentencias](#4-sentencias) · [5. Funciones](#5-funciones) · [6. Alcance de las variables](#6-alcance-de-las-variables) ·
[7. Cómo se ejecuta un programa](#7-cómo-se-ejecuta-un-programa) · [8. Límites](#8-límites) ·
[9. Lo que no tiene](#9-lo-que-no-tiene) · [10. Idiomas](#10-idiomas)

---

## 1. Léxico

### 1.1 Líneas y sangría

- Un programa es texto en líneas. Cada sentencia simple ocupa una línea y no lleva `;`.
- **Los bloques se marcan con sangría**, como en Python: después de `:` las líneas de adentro van más a la derecha.
  La convención es de 4 espacios. Un **tab** cuenta como 4 espacios.
- Al volver a la izquierda, la sangría tiene que coincidir con alguna de las de arriba. Si no, da error *"la sangría no
  cuadra"*.
- Un bloque de una sola línea puede ir en la misma línea: `if e.exito > 0.9: detener()`.
- **Continuar una línea:** mientras haya un `(`, `[` o `{` abierto, la línea sigue en la de abajo (y ahí no cuenta la
  sangría). No existe `\` para continuar.
- Las líneas vacías y las que solo tienen un comentario se ignoran.

### 1.2 Comentarios

`#` hasta el fin de la línea. No hay comentarios de varias líneas (`"""…"""` no existe).

### 1.3 Nombres (identificadores)

- Empiezan con una letra o `_` y siguen con letras, números o `_`.
- **Se aceptan tildes y ñ:** `exito`, `éxito`, `año`, `cámara`. No se acepta la `ü`.
- Se distinguen mayúsculas y minúsculas (`Exito` ≠ `exito`).
- No se pueden usar como variable los nombres de las funciones de PBDMM: `print = 3` da error.

### 1.4 Palabras reservadas

```
def  return  if  elif  else  for  in  and  or  not  is  True  False  None  global  pass  break  continue
```

También están reservadas, para dar un buen mensaje de error, aunque el lenguaje no las tiene: `while`, `import`, `from`,
`class` y `lambda`.

### 1.5 Números

| Escritura | Valor |
|---|---|
| `42` · `1_000_000` | enteros (el `_` separa miles) |
| `3.14` · `.5` · `2.` | decimales |
| `1e-4` · `3E5` | notación científica |

No hay números negativos literales: `-3` es el operador `-` aplicado a `3`. No existen hexadecimales (`0x…`) ni
binarios (`0b…`).

### 1.6 Textos

- Entre comillas dobles `"…"` o simples `'…'`. Tienen que cerrarse en la misma línea.
- Escapes: `\n` (nueva línea), `\t` (tab), `\"`, `\'`, `\\`. Cualquier otro `\x` deja la `x`.
- **Textos pegados se unen:** `"neural " "drone"` es `"neural drone"`.
- **f-textos:** `f"…{expresión}…"` (o `F"…"`). Adentro de `{ }` va cualquier expresión, con un formato opcional:

| Formato | Ejemplo con `x = 0.4567` | Resultado |
|---|---|---|
| (ninguno) | `f"{x}"` | `0.4567` |
| `:.Nf` (N decimales) | `f"{x:.2f}"` | `0.46` |
| `:.N%` (porcentaje) | `f"{x:.1%}"` | `45.7%` |
| `:%` | `f"{x:%}"` | `45.670000%` |

  `{{` y `}}` escriben una llave. El formato solo se aplica a números. Un error dentro de `{ }` dice la línea del f-texto.

### 1.7 Operadores y signos

```
+  -  *  /  //  %  **        ==  !=  <  <=  >  >=        =  +=  -=  *=  /=  //=  **=
(  )  [  ]  {  }  ,  :  .
```

Los signos de otros lenguajes dan un error que explica qué usar: `&&` (se escribe `and`), `||` (`or`), `!`
(`not`; `!=` sí existe), `;` (no hace falta).

---

## 2. Tipos y valores

| Tipo (`type(x)`) | Ejemplos | Notas |
|---|---|---|
| `int` | `3`, `-1`, `2.0` | Un número es `int` si no tiene parte decimal |
| `float` | `0.5`, `1e-4` | |
| `str` | `"hola"`, `f"{x}"` | Los textos no se pueden cambiar: los métodos devuelven un texto nuevo |
| `bool` | `True`, `False` | |
| `None` | `None` | "Nada" o "todavía no hay dato" (por ejemplo `e.choque` antes de la primera generación) |
| `list` | `[1, 2, 3]`, `(1, 2)`, `()` | Las tuplas son listas |
| `dict` | `{"chocar": 8}` | Las claves se guardan como texto |
| `objeto` | `e` | Solo para leer: `e.exito`, `e.premios["crash"]` |
| `función` | `print`, tus `def` | Las funciones son valores: se pueden guardar en variables y pasar |

> **≠ Python:** no hay diferencia entre `2` y `2.0` (los dos son `int`), y un decimal se imprime redondeado a 6
> cifras (`0.1 + 0.2` imprime `0.3`).
>
> **≠ Python:** las **tuplas son listas**: `t = (1, 2)` y después `t[0] = 9` funciona.
>
> **≠ Python:** las **claves de un diccionario siempre son texto**: `{1: "a"}` guarda la clave `"1"`, y `d[1]` y `d["1"]`
> son lo mismo.

### 2.1 Verdadero y falso

En un `if`, un `and`/`or`/`not` o un `x if c else y`, se toman como **falsos**: `False`, `None`, `0`, `""`, `[]` y `{}`.
Todo lo demás es verdadero.

### 2.2 Igualdad

`==` compara por **contenido**: `[1, 2] == [1, 2]` y `{"a": 1} == {"a": 1}` dan `True`. `is` compara si es **el mismo**
valor y se usa sobre todo con `None`: `if e.choque is None:`.

---

## 3. Expresiones

### 3.1 Precedencia (de la que se aplica última a la primera)

| Nivel | Operadores | Notas |
|---|---|---|
| 1 | `a if c else b` | condicional |
| 2 | `or` | devuelve el primer valor verdadero (o el último) |
| 3 | `and` | devuelve el primer valor falso (o el último) |
| 4 | `not` | |
| 5 | `==` `!=` `<` `<=` `>` `>=` `in` `not in` `is` `is not` | **encadenables**: `0 < x < 1` |
| 6 | `+` `-` | |
| 7 | `*` `/` `//` `%` | |
| 8 | `-x` `+x` | unarios |
| 9 | `**` | potencia, de derecha a izquierda: `2**3**2 = 512`; `-2**2 = -4` |
| 10 | `f(…)` `x.nombre` `x[i]` | llamada, atributo, índice |
| 11 | literales, nombres, `( … )`, `[ … ]`, `{ … }` | |

### 3.2 Aritmética

| Operación | Números | Otros tipos |
|---|---|---|
| `a + b` | suma | `str + str` une textos · `list + list` une listas |
| `a - b` | resta | |
| `a * b` | multiplicación | `str * int` repite el texto · `list * int` repite la lista |
| `a / b` | división **siempre con decimales**: `7 / 2 = 3.5` | |
| `a // b` | división entera, hacia abajo: `-7 // 2 = -4` | |
| `a % b` | resto, con el signo de `b`: `-7 % 3 = 2` | |
| `a ** b` | potencia | |

- Dividir por cero (`/`, `//`, `%`) da el error *"división por cero"*.
- Sumar un texto con otra cosa da error: hay que usar `str(x)` o un f-texto.

> **≠ Python:** `True + 1` y `True * 3` dan error. Los `bool` no son números.

### 3.3 Comparaciones

- `<` `<=` `>` `>=` solo comparan **número con número** o **texto con texto**. Comparar con `None` da error y avisa
  *"¿todavía no hay datos?"*. Es el error típico de `e.choque < 0.1` en la primera generación. Se evita así:
  `if e.choque is not None and e.choque < 0.1:`.
- `x in t`: con un texto, si `x` es parte de él (`"sa" in "casa"`); con una lista, si algún elemento es igual a `x`;
  con un diccionario o un objeto, si `x` es una clave (`"crash" in e.premios`).

### 3.4 Lógica

`and` y `or` **cortan**: si con el primer valor ya se sabe el resultado, el segundo no se calcula. Además devuelven uno de
los dos valores, no siempre `True`/`False`: `0 or "x"` da `"x"`.

### 3.5 Condicional

`"alto" if e.exito > 0.8 else "bajo"`: solo se calcula la rama que toca.

### 3.6 Listas, diccionarios y comprensiones

```python
capas = [64, 64]
vacia = []
par = (1, 2)            # una lista
premios_fase2 = {"grabar": 6, "mirar": 4}
cuadrados = [x * x for x in range(10) if x % 2 == 0]       # [0, 4, 16, 36, 64]
pares = [k for k, v in premios_fase2.items() if v > 4]       # ["grabar"]
```

- La comprensión es `[expr for nombres in iterable if condición]`, con un solo `for` y un `if` opcional.
- Las variables de una comprensión **no se escapan** de ella.
- No hay comprensiones de diccionario ni de conjunto.

### 3.7 Índices y atributos

- `lista[i]` y `texto[i]` aceptan índices negativos (`[-1]` es el último). Un índice fuera de rango da error.
- `dic[k]` da error si la clave no existe. Usa `dic.get(k, por_defecto)` si puede faltar.
- `x.nombre` lee el atributo de un objeto (`e.exito`) o un **método** (`lista.append`, `texto.upper`, `dic.items`).
  Los métodos están en la [biblioteca](biblioteca.md#métodos).

> **≠ Python:** no hay rebanadas (`lista[1:3]` da error).

### 3.8 Llamadas

```python
premios(grabar=6, mirar=4)          # argumentos con nombre
f(1, 2, modo="x")                   # los con nombre van al final
f(*lista)                           # cada elemento de la lista como un argumento
premios(**{"grabar": 6})            # cada clave del diccionario como argumento con nombre
```

---

## 4. Sentencias

### 4.1 Expresión

Una expresión sola en una línea se calcula y su resultado se descarta. Sirve para llamar funciones: `print("hola")`.

### 4.2 Asignación

```python
fase = 1
a, b = 1, 2             # desempaquetar (la cantidad tiene que coincidir)
a, b = b, a             # intercambiar
x, y = mi_funcion()     # si la función devuelve una lista o una tupla
lista[0] = 5
dic["grabar"] = 6
n += 1                  # también -=, *=, /=, //=, **=
```

- A la izquierda del `=` va un nombre, un `x[i]`, un `x.nombre` (solo en objetos que lo permiten) o varios nombres
  separados por comas.
- Los atributos de `e` no se pueden cambiar: para cambiar el entrenamiento están las funciones (`premios(…)`,
  `aprendizaje(…)`).

### 4.3 `if` / `elif` / `else`

```python
if e.exito > 0.9:
    detener()
elif e.exito > 0.5:
    premios(grabar=6)
else:
    pass
```

### 4.4 `for`

```python
for i in range(3):            # 0, 1, 2
    print(i)
for letra in "dron":          # recorre un texto letra por letra
    ...
for k in premios_fase2:       # un diccionario se recorre por sus claves
    ...
for k, v in premios_fase2.items():   # desempaquetar en el for
    ...
```

`break` sale del `for` y `continue` salta a la siguiente vuelta. **No hay `while`** (ver [§9](#9-lo-que-no-tiene)).

### 4.5 `pass`

No hace nada. Sirve para un bloque que todavía está vacío.

### 4.6 `def` y `return`

Ver [§5](#5-funciones). `return` fuera de una función da error.

### 4.7 `global`

`global nombre[, nombre…]` dentro de una función hace que la asignación cambie la variable **de arriba del archivo** y no
cree una variable propia de la función. Es lo que usan los programas de currículum para recordar la fase:

```python
fase = 1
def cada_generacion(e):
    global fase
    if fase == 1 and e.exito > 0.6:
        fase = 2
```

---

## 5. Funciones

```python
def promedio(xs, vacio=0):
    if not xs:
        return vacio
    s = 0
    for x in xs:
        s += x
    return s / len(xs)
```

- `def nombre(param, param2=valor):` puede tener parámetros con **valor por defecto**, que van al final.
- Se llaman por posición o por nombre: `promedio([1, 2])`, `promedio([], vacio=None)`.
- Si falta un parámetro sin valor por defecto, o se pasa uno que no existe, da error.
- `return x` devuelve un valor, `return a, b` devuelve una lista, y sin `return` devuelve `None`.
- Las funciones son valores: `f = promedio` y después `f([1, 2])`.

> **≠ Python:** el valor por defecto **se calcula en cada llamada** (y con las variables globales de ese momento), no una
> sola vez al definir la función.
>
> **≠ Python:** no hay `*args` ni `**kwargs` en un `def` (sí al llamar: `f(*lista)`).

### 5.1 Las funciones especiales (hooks)

El juego llama estas tres funciones si el programa las define. Cada una recibe `e`, el objeto con cómo va el
entrenamiento (sus campos están en la [API](../PBDMM.md)):

| Español | English | Cuándo |
|---|---|---|
| `def al_empezar(e):` | `def on_start(e):` | una vez, cuando arranca el entrenamiento (o cuando el Estudio lo encuentra ya corriendo) |
| `def cada_generacion(e):` | `def every_generation(e):` | cada vez que termina una generación |
| `def al_terminar(e):` | `def on_end(e):` | cuando el entrenamiento se detiene |

Una función que empieza con `al_`, `cada_`, `on_` o `every_` y no es una de esas da error. Es casi siempre un error de
escritura (`def cada_generación` o `def al_terminar_`).

---

## 6. Alcance de las variables

- **Arriba del archivo** las variables son **globales**: se ven desde cualquier función y duran todo el entrenamiento.
  Por eso una variable como `fase` recuerda su valor de una generación a otra.
- **Dentro de una función**, asignar una variable crea una **local** que desaparece al terminar la llamada. Para cambiar
  una global hay que declararla con `global`.
- Para **leer** un nombre se busca primero en las locales, después en las globales y al final en las funciones de PBDMM.
- Una comprensión tiene su propio espacio: sus variables no se escapan.

> **≠ Python:** una función definida dentro de otra **no ve las variables locales de la de afuera** (no hay closures):
> solo ve sus propias variables y las globales.
>
> **≠ Python:** `n = n + 1` dentro de una función sin `global` **no da error**: lee la `n` global y crea una local
> nueva. La global no cambia.

---

## 7. Cómo se ejecuta un programa

### 7.1 Las dos fases

1. **Arriba del archivo** (una vez, al `correr` o al `revisar`): el intérprete ejecuta las líneas de arriba en orden.
   Las funciones de configuración (`modelo`, `red`, `mision`/`nivel`, `dron`, `drones`, `entrenar_en`) **solo valen
   aquí**, y cada una una sola vez. `premios`, `castigos`, `aprendizaje`, `viento` y `velocidad` ponen los valores
   iniciales.
2. **Validación:** debe haber `modelo(…)` y `mision(…)` (o `nivel(…)`). Se completan los valores por defecto (fondo, 50
   drones, dron estándar). Se revisa que `desde="otro"` exista y que `red(capas=…)` vaya con `desde="cero"`.
3. **Pedido:** la configuración se convierte en un `POST /api/lab` (`pedidoDe()`). Los premios y castigos de 0 a 10
   pasan a los valores reales del entrenador (`real = nivel / 10 × escala`, de `app/data/entrenamiento.json`).
4. **Reacción** (mientras entrena): el Estudio lee el progreso cada **1,5 s**. Cuando hay una generación nueva arma `e`
   y llama `cada_generacion(e)`. Lo que la función pide (`premios`, `castigos`, `aprendizaje`, `viento`, `velocidad`,
   `pausar`, `seguir`, `guardar`, `detener`) se manda al entrenador **en vivo**. Estas últimas cuatro solo valen dentro
   de una función.

### 7.2 Lo que ve el programa

- Las variables globales **viven mientras el Estudio escucha el programa**. `parar` deja de escucharlo (el
  entrenamiento sigue), y volver a `correr` empieza las variables de cero.
- `e` solo existe dentro de las funciones especiales. Arriba del archivo todavía no hay entrenamiento.
- `print` escribe en la terminal del Estudio y `avisar` además muestra un aviso en pantalla.

### 7.3 Errores

- Un error de **sintaxis** (lexer o parser) se ve antes de correr nada. Dice la **línea** y qué esperaba.
- Un error **al ejecutar** también dice la línea. Si pasa arriba del archivo, no se manda ningún pedido. Si pasa dentro
  de una función especial, se muestra en la terminal y el entrenamiento **sigue**.
- Cuando un nombre está mal escrito, el error sugiere el más parecido: *no conozco "exto" (¿quisiste decir "exito"?)*.
- No hay `try`/`except`: los errores no se atrapan. La [lista de errores comunes](errores.md) explica cada uno.

---

## 8. Límites

| Límite | Valor | Para qué |
|---|---|---|
| Operaciones por ejecución (arriba del archivo, o cada llamada a una función especial) | 200.000 | que un programa no congele el navegador |
| Largo de `range(…)` | 100.000 | ídem |
| Largo de una comprensión | 100.000 | ídem |
| Capas de `red(capas=…)` | de 1 a 4, de 8 a 512 neuronas | lo que puede entrenar `live_train.py` |
| Drones a la vez (`drones(n)`) | de 1 a 200 | |
| Premios y castigos | de 0 a 10 | la escala del juego |

---

## 9. Lo que no tiene

PBDMM deja afuera, **a propósito**, lo que podría colgar el juego o tocar tu computador. También deja afuera lo que no
hace falta para describir un entrenamiento:

| No tiene | Por qué / qué usar |
|---|---|
| `while` | un ciclo sin fin colgaría el entrenamiento → `for i in range(n)` |
| `import`, `from` | no hay módulos: lo necesario ya está |
| `class`, `lambda` | usa `def` |
| `try` / `except`, `with`, `del`, `assert`, `yield`, `nonlocal`, decoradores | |
| rebanadas `x[a:b]` | recorre con `for` |
| conjuntos `{1, 2}`, comprensiones de diccionario | listas y diccionarios |
| textos de varias líneas `"""…"""` | varios `print` |
| operadores de bits `& \| ^ ~ << >>` | |
| `sorted`, `enumerate`, `zip`, `any`, `all`, `reversed` | por ahora no; ver la [biblioteca](biblioteca.md) |
| leer o escribir archivos, red, la hora | un programa solo pide un entrenamiento |

---

## 10. Idiomas

Cada nombre del lenguaje (funciones, argumentos, valores, nombres de premios, funciones especiales, campos de `e`) tiene
su versión en inglés, y **las dos funcionan siempre**, en cualquier idioma del juego. Se pueden mezclar en el mismo
programa. Las palabras de Python (`def`, `if`, `for`, `True`…) son las mismas en los dos idiomas. Los mensajes de error
salen en el idioma del juego. La tabla completa está en la [API](../PBDMM.md#en-español-o-en-inglés).

```python
model("hawk", start_from="base")     # = modelo("hawk", desde="base")
mission("film_poles")                # = mision("grabar_postes")
penalties(crash=8)                   # = castigos(chocar=8)

def every_generation(e):             # = def cada_generacion(e):
    if e.success > 0.9: stop()       # = if e.exito > 0.9: detener()
```
