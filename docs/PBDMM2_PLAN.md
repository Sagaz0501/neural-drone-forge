# PBDMM 2 · Plan

> Plan del 15-10-2026. Sale de "⏭️ Lo siguiente" en [`ROADMAP.md`](ROADMAP.md). Lo que ya existe del lenguaje está en
> [`PBDMM.md`](PBDMM.md). **Decidido:** la alternativa 2 (objetos) con los atajos `ficha()`, `hangar()` e `inventario()`.

## 1. Qué cambia

PBDMM 1 sirve para **pedir** un entrenamiento. PBDMM 2 también sirve para **leer el juego**, **revisar antes de
entrenar** y **entender lo que pasa**. Además se enseña paso a paso: cada dron nuevo trae un capítulo.

| # | Parte | Qué hace |
|---|---|---|
| A | **Leer el juego** | Ver un dron, una misión, un modelo y las piezas desde el programa, con `print` como en un monitor serial |
| B | **Revisar dron contra misión** | Si el programa usa `dron(…)`, compararlo con lo que pide la misión **antes** de entrenar |
| C | **Claridad al entrenar** | La terminal explica en palabras qué cambió en cada generación y por qué |
| D | **Consola vistosa** | Tablas, barras y colores en la terminal |
| E | **Ruta del programador** | Aprender en orden: cada dron nuevo trae un capítulo con su programa guiado y un reto |

## 2. Cómo se llaman las funciones: 4 alternativas

Las cuatro hacen lo mismo. Cambia la forma de escribir los programas. Los ejemplos usan el mismo caso:
*ver el dron Cine y revisar si sirve para grabar entre postes.*

### Alternativa 1 · Funciones con nombre largo (lo que dice hoy el roadmap)

```python
dron_especificaciones("Cine (dev)")      # imprime la ficha
mision_info("grabar_postes")
modelo_info("colibri")
mis_drones()
mis_modelos()
piezas("motores")
revisar_dron("Cine (dev)", "grabar_postes")
```
- ✅ Se entiende sin saber programar. Se parece a PBDMM 1.
- ❌ Solo imprimen: no se puede usar un dato (`if peso > 0.5`). Los nombres son largos. Habría que agregar una función por cada dato.

### Alternativa 2 · Objetos con puntos, como Python *(recomendada)*

```python
d = dron("Cine (dev)")          # lo mismo de siempre: elige el dron… y además lo devuelve
m = mision("grabar_postes")

print(d)                        # la ficha completa
print(d.peso, d.empuje_peso, d.bateria.minutos)
print(m.viento, m.pide)         # lo que exige la misión

if d.empuje_peso < m.empuje_peso_min:
    avisar("este dron no aguanta el viento")

revisar(d, m)                   # la lista de problemas (también corre sola al correr)
```
- ✅ Es Python de verdad: lo que aprendes sirve afuera del juego. `e.exito` ya funciona así, así que no hay nada nuevo que aprender.
  Los datos se pueden usar en `if`, en cuentas y en funciones propias. El mensaje de error queda así: `d.motores: empuje/peso 1,9 < 2,2`.
- ❌ El primer contacto pide entender `d.algo`. Lo tapamos con el capítulo 2 de la ruta.

### Alternativa 3 · Un solo verbo, `ver(…)`, estilo monitor serial

```python
ver("dron", "Cine (dev)")
ver("mision", "grabar_postes")
ver("modelos")
ver("piezas", "motores")
```
- ✅ Hay una sola cosa que recordar. Se siente como un `Serial.print` o un shell.
- ❌ Igual que la 1, solo imprime. Los textos entre comillas no se autocompletan tan bien y son fáciles de escribir mal.

### Alternativa 4 · Palabras cortas de taller

```python
ficha("Cine (dev)")             # la ficha del dron
requisitos("grabar_postes")     # lo que pide la misión
hangar()                        # tus drones
inventario("motores")           # tus piezas
cerebros()                      # tus modelos
```
- ✅ Son cortas y tienen el sabor del juego (garaje, hangar, taller).
- ❌ También solo imprimen. "ficha" o "cerebros" no te enseñan nada que sirva fuera del juego.

### Elegida: la 2 con atajos de la 4

- **Objetos** (`d = dron(…)`, `m = mision(…)`, `mo = modelo_de(…)`) para programar.
- **`ficha(x)`** imprime bonito cualquier cosa (dron, misión, modelo). `print(d)` hace lo mismo en corto.
- **`hangar()`** y **`inventario("motores")`** devuelven listas que se pueden recorrer: `for d in hangar(): print(d.nombre, d.empuje_peso)`.

Así el capítulo 1 se escribe solo con llamadas (`ficha("Cine (dev)")`) y del capítulo 2 en adelante aparecen los puntos.
Cada nombre lleva su versión en inglés, como hoy: `drone()`, `mission()`, `sheet()`, `hangar()`, `inventory()`, `check()`.

## 3. Qué trae cada objeto (borrador)

| Objeto | Atributos |
|---|---|
| `d = dron("…")` | `nombre`, `peso` (kg), `empuje_peso`, `vel_max`, `bateria.minutos`, `motores` (modelo, kv, empuje), `helices`, `controladora`, `radio` (tipo, `alcance_m`, failsafe), `camara` (calidad), `sensores` (lista: `"tof"`, `"barometro"`…), `protectores`, `vibracion`, `ia` (su modelo y generación) |
| `m = mision("…")` | `id`, `nombre`, `nivel`, `viento`, `tomas`, `pide` (diccionario con los requisitos de misiones.json: `empuje_peso_min`, `barometro`, `alcance_m`, `calidad_min`, `protectores`), `premios_recomendados` |
| `mo = modelo_de("…")` | `nombre`, `generacion`, `red` (capas), `exito`, `mejor_exito`, `desde`, `niveles`, `rango_fisica`, `historia` |
| `pz = inventario("motores")` | una lista de piezas con `nombre`, `precio`, `vida` y lo que la pieza cambia |

Los objetos **solo se pueden leer**. Escribir `d.peso = 0.1` da error: el dron se cambia en el banco, no en el código.

## 4. La revisión del dron contra la misión (parte B)

- Corre **solo si hay `dron(…)`** con un dron del hangar. Si el programa no dice qué dron usa, o usa `"azar"` o `"estandar"`, no se revisa nada.
- Usa los mismos requisitos que el briefing del juego (`main.js requisitos()` y `riesgosIA()`). La idea es mover esa lógica
  a un módulo común (`app/requisitos.js`) para que el juego y PBDMM den siempre el mismo veredicto.
- Sale al `revisar` y al `correr`. Los avisos ⚠️ no bloquean. Los errores ❌ tampoco bloquean, pero piden confirmar (`correr!` entrena igual):

```
❌ d.motores: empuje/peso 1,9 < 2,2 que pide el viento de la finca
❌ falta: barómetro (la finca lo pide para mantener la altura)
⚠️ d.radio: ESP-NOW alcanza 80 m; la toma más lejana está a 120 m
✅ cámara 62 ≥ 50 · protectores ✓
```

## 5. Claridad al entrenar (parte C)

- **Un narrador en la terminal**, cada N generaciones (`narrar(cada=5)`, por defecto apagado en programas viejos):
  *"Gen 340: éxito 42 % (+8). Choca menos (18 % → 11 %). El premio sube junto con el éxito: va bien."*
- **Diagnósticos automáticos** con reglas simples y medibles (no adivinar):
  - El premio sube pero el éxito no → *"estás pagando por algo que no es la misión"*.
  - El éxito no se mueve en 30 generaciones → *"se estancó: prueba aprendizaje(exploracion=0.005)"*.
  - El éxito cae de golpe después de subir → *"puede ser el lr alto: está olvidando"*.
  - El choque está alto y el éxito en 0 → *"castiga más el choque o empieza con una misión más fácil"*.
- **`explicar("lr")`** (y el comando `explicar`) da la explicación corta de cualquier parámetro, con su valor de ahora.
- `e.cambio`: lo que cambió desde la generación anterior (`e.cambio.exito`, `e.cambio.choque`…).

## 6. Consola vistosa (parte D)

```python
tabla(hangar(), "nombre", "empuje_peso", "bateria.minutos")
print(barra(e.exito), "éxito")         # ██████░░░░ 60 %
print(color("verde", "listo"))
```

## 7. La ruta del programador (parte E): aprender con cada dron

**La idea:** en el modo desarrollador, **cada dron que creas en el hangar abre el siguiente capítulo**. El dron nuevo trae
un **programa guiado** (un `.pbd` con comentarios que explican cada línea y un hueco para completar) y un **reto** que el
juego mide solo. Al cumplirlo ganas una insignia y el capítulo queda marcado. Nada se bloquea: todo el lenguaje funciona
desde el primer día. En la ayuda y en el autocompletado, lo del capítulo actual sale marcado como **nuevo**.

| Dron | Capítulo | Aprendes | Reto (lo mide el juego) |
|---|---|---|---|
| 1 | **Hola, dron** | `modelo`, `mision`, `dron`, `correr`, `estado` | Entrenar 20 generaciones |
| 2 | **Conoce tu dron** | `ficha`, `print`, variables, `d.algo` | Imprimir el empuje/peso y los minutos de batería |
| 3 | **Lo que pagas es lo que aprende** | `premios`, `castigos`, 0-10 | Bajar el choque por debajo del 20 % |
| 4 | **¿Sirve para la misión?** | `mision(…)` como objeto, `revisar(d, m)`, `if` | Un programa sin ❌ en la revisión |
| 5 | **Mirar mientras aprende** | `def cada_generacion(e)`, `e.exito`, `avisar` | Avisar cuando el éxito pase el 50 % |
| 6 | **Currículum** | `global`, fases, cambiar premios en vivo, `desde=` | Pasar de la fase 1 a la 2 por sí solo |
| 7 | **Un cerebro a medida** | `red(capas=)`, `desde="cero"`, `aprendizaje(lr, exploracion)` | Un modelo desde cero con éxito ≥ 30 % |
| 8 | **Tu propio monitor** | `def` propias, `for`, `tabla`, `barra`, listas | Una tabla de tu hangar ordenada por empuje/peso |

- Las 7 lecciones de hoy no se pierden: se reparten entre los capítulos (la 1 y la 2 van en el 1 y el 3, PPO y lr en el 7…).
- El progreso queda en la partida (`partida.ruta = { capitulo, retos: {...} }`). Así se guarda con el resto de la partida y viaja a `partida.json`.
- La partida dev de hoy trae 2 drones armados. Esos cuentan como **capítulo 0** (de demo) y la ruta arranca con el primer dron que **tú** creas.
- En inglés: *Programmer's path*, con el mismo contenido en la capa `data/en/pbdmm.json`.
- Más adelante, el modo normal también puede tener la ruta (cuando el jugador desbloquea la IA en la campaña).

## 8. Orden de trabajo

1. **Objetos de lectura** (A): `dron()`/`mision()`/`modelo_de()`/`hangar()`/`inventario()` devuelven objetos, más `ficha()` y `print` bonito.
   Pruebas en `test_pbdmm.mjs`. *Es la base de todo lo demás.*
2. **`app/requisitos.js`** (B): saco la lógica del briefing a un módulo común; `revisar(d, m)` y la revisión al correr.
3. **Consola vistosa** (D): `tabla`, `barra`, `color`.
4. **Ruta del programador** (E): `data/pbdmm.json "ruta"` (capítulos, programas guiados, retos), los retos medidos,
   las marcas de "nuevo" y las insignias.
5. **Narrador y diagnósticos** (C): `narrar()`, `e.cambio`, `explicar()`.
6. Cerrar: traducciones (`test_i18n`), regenerar `docs/PBDMM.md`, actualizar el roadmap y la versión del lenguaje (`"version": "2.0"`).

Los programas de PBDMM 1 siguen funcionando igual: `dron("azar")` sigue siendo válido, y que ahora devuelva algo no cambia nada si nadie lo usa.
