# Errores comunes

> Todos los errores dicen la **línea**. Esta es una lista de los que más salen, de qué significan y de cómo arreglarlos.

## Al escribir (sintaxis)

| Mensaje | Qué pasó | Arreglo |
|---|---|---|
| `falta ":" al final de la línea` | Un `if`, `for` o `def` sin `:` | `if e.exito > 0.9:` |
| `después de ":" las líneas de adentro van con sangría` | El bloque no está más a la derecha | 4 espacios adelante |
| `la sangría no cuadra con las líneas de arriba` | Volviste a una sangría que no existía arriba | Alinea con el `if`/`def` de arriba |
| `falta cerrar el paréntesis ( que abriste en esta línea` | Un `(`, `[` o `{` sin cerrar | Revisa la línea que dice |
| `un texto sin cerrar` | Falta la comilla del final | `"hola"` |
| `en PBDMM "y" se escribe and, no &&` | Sintaxis de C o JavaScript | `and`, `or`, `not` |
| `PBDMM no tiene while` | No hay `while` (podría colgar el juego) | `for i in range(n):` |
| `PBDMM no importa módulos` | `import` / `from` | Todo lo necesario ya está |
| `esperaba "]" y encontré ":"` | Una rebanada con paso `x[1:5:2]` | Sin paso: `x[1:5]` |
| `los argumentos con nombre (x=1) van después de los demás` | `f(a=1, 2)` | `f(2, a=1)` |

## Al correr

| Mensaje | Qué pasó | Arreglo |
|---|---|---|
| `no conozco "exto" (¿quisiste decir "exito"?)` | Un nombre mal escrito o una variable que no existe todavía | Usa la sugerencia |
| `"e" solo existe dentro de las funciones que llama el juego` | Usaste `e.exito` arriba del archivo | Muévelo dentro de `def cada_generacion(e):` |
| `no se puede comparar None < float (¿todavía no hay datos?)` | En la primera generación `e.choque` o `e.calidad` pueden ser `None` | `if e.choque is not None and e.choque < 0.1:` |
| `no se puede sumar texto con float: usa str(x) o un f"…{x}…"` | `"éxito " + e.exito` | `f"éxito {e.exito}"` |
| `"print" es una función de PBDMM: usa otro nombre` | Una variable con el nombre de una función | `mi_modelo = …` en vez de `modelo = …` |
| `modelo() va arriba del archivo, no dentro de una función` | Configuración dentro de un `def` | Dentro solo se cambian `premios`, `castigos`, `aprendizaje`, `viento` y `velocidad` |
| `modelo() ya lo pusiste en la línea N` | La configuración va una sola vez | Borra la repetida |
| `detener() va dentro de una función` | `pausar`, `seguir`, `guardar` o `detener` arriba del archivo | `if e.exito > 0.9: detener()` dentro de `cada_generacion` |
| `"chocar" es un castigo: va en castigos(chocar=…), no en premios()` | Premios y castigos van separados | `castigos(chocar=8)` |
| `grabar=12: los premios van de 0 a 10` | Fuera de la escala | 0 = apagado, 4 = lo normal, 10 = al máximo |
| `falta modelo("nombre")` · `falta mision("…")` | Todo programa entrena un modelo en una misión | Agrega las dos líneas |
| `no tienes un modelo "x" guardado para empezar desde él` | `desde="x"` con un modelo que no existe | Revisa `modelos` en la terminal, o usa `"base"`/`"cero"` |
| `red(capas=…) solo sirve con modelo(…, desde="cero")` | Una red que ya existe no cambia de tamaño | `desde="cero"` |
| `no tienes un dron "x" en el hangar` | `dron("x")` con un nombre que no está | El autocompletado de `dron(` muestra los tuyos |
| `el juego no llama "cada_generación"` | Una función especial mal escrita (aquí, con tilde) | `al_empezar`, `cada_generacion`, `al_terminar` |
| `el programa hizo demasiadas operaciones (más de 200000)` | Un `for` muy largo | Menos vueltas; las cuentas pesadas van fuera de `cada_generacion` |
| `el índice 5 se sale (hay 3)` | `lista[5]` con 3 elementos | `len(lista)`, o índices negativos `[-1]` |
| `no hay la clave "x"` | `d["x"]` con una clave que no está | `d.get("x", 0)` |
| `a f() le falta "x"` · `f() no tiene el parámetro "y"` | Una llamada con los argumentos mal | Revisa el `def` |
| `división por cero` | `/`, `//` o `%` por 0 | Revisa antes: `x / n if n else 0` |
| `max() de una lista vacía` | `min`/`max` de `[]` | Revisa antes: `max(xs) if xs else 0` |
| `no tienes un dron "x" en el hangar` (en `dron_info`, `revisar`, `ficha`) | El nombre no está | `tabla(hangar(), "nombre")` muestra los tuyos |
| `ficha("…"): no hay un dron, una misión ni un modelo que se llame "x"` | El nombre no existe | Revisa cómo se escribe (`modelos` en la terminal) |
| `un objeto no tiene "empuje_peso"` · `None no tiene…` | `dron("azar")` devuelve `None` | Usa un dron de tu hangar: `dron("Cine (dev)")` |
| `no se puede comparar None < float` con `d.empuje_peso` | El dron no tiene piezas (`d.armado` es `False`) | `if d.armado and d.empuje_peso < 2:` |
| `narrar() va arriba del archivo` | `narrar` dentro de un `def` | Ponlo arriba, una vez |
