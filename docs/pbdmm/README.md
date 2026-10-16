# PBDMM · el lenguaje de Neural Drone Forge

**PBDMM** (*Python Base Dron Model Maker*) es un lenguaje de programación pequeño, con la sintaxis de Python, para
**describir cómo se entrena la inteligencia artificial de un dron**. Es el corazón del **modo desarrollador** de
[Neural Drone Forge](../../README.md).

```python
# hola.pbd: mi primer programa
modelo("hola_dron", desde="base")   # la IA que voy a entrenar (parte de la que ya sabe volar)
m = mision("grabar_viento")         # qué tiene que aprender (la finca, con viento)
d = dron("Madera (dev)")            # con la física de este dron de mi hangar (y se revisa solo contra la misión)
narrar(cada=5)                      # la terminal cuenta cómo va

print("empuje/peso:", d.empuje_peso, "· la misión pide:", m.pide)

def cada_generacion(e):
    print(f"generación {e.generacion}: éxito {e.exito:.0%}")
    if e.exito >= 0.8:
        detener()
```

Ese programa crea el modelo `hola_dron` y lo pone a entrenar en segundo plano (PPO, con 50 drones a la vez). Antes de
entrenar revisa si el dron de madera aguanta el viento de la finca (✅ / ⚠️ / ❌). Cada vez que termina una generación
imprime cómo va, y se detiene solo cuando 8 de cada 10 intentos logran la misión.

**Versión 2.0** ([cambios](CHANGELOG.md)). Para aprender, en el juego está la **ruta del programador**: cada dron que
creas abre un capítulo con un programa guiado y un reto (Estudio → pestaña **Ruta**).

## La documentación

| Documento | Para qué |
|---|---|
| [Tutorial](tutorial.md) | Aprender desde cero, paso a paso, con un dron de verdad |
| [Referencia del lenguaje](referencia.md) | Cómo funciona todo: léxico, tipos, expresiones, sentencias, funciones, alcance, cómo se ejecuta |
| [Gramática](gramatica.md) | La sintaxis completa en EBNF |
| [Biblioteca básica](biblioteca.md) | Las funciones de siempre (`print`, `len`, `range`…) y los métodos de listas, textos y diccionarios |
| [API de entrenamiento](../PBDMM.md) | Las funciones del dron (`modelo`, `mision`, `premios`…), el objeto `e`, las funciones especiales y los comandos de la terminal. Se genera desde `app/data/pbdmm.json` |
| [Errores](errores.md) | Los mensajes de error más comunes y cómo arreglarlos |
| [Cambios](CHANGELOG.md) | Las versiones del lenguaje |
| [PBDMM 2](../PBDMM2_PLAN.md) | El plan y las decisiones de la versión 2.0: leer el juego, revisar el dron contra la misión, el narrador y la ruta del programador |

## Cómo se usa

1. En el juego: **Nueva partida → Modo desarrollador**.
2. Abre el **Estudio PBDMM**. A la izquierda está el editor y abajo la terminal. A la derecha están la ayuda, las
   lecciones y la gráfica en vivo.
3. Escribe el programa (o `ejemplo hover` en la terminal) y córrelo con **`correr`**. Con **`revisar`** se
   comprueba sin entrenar.

Los programas se guardan en el navegador como archivos `.pbd` y se pueden descargar.

## Qué es y qué no es

- **Se parece a Python, pero no es Python.** Es un subconjunto de Python que interpreta el navegador
  ([`app/pbdmm.js`](../../app/pbdmm.js)). Lo que aprendes aquí (variables, `if`, `for`, funciones, listas,
  diccionarios, f-strings) **es Python de verdad** y sirve fuera del juego.
- **Es seguro:** no tiene `import`, `while`, archivos ni red. Un programa solo puede **pedir un entrenamiento** y
  reaccionar mientras corre. Además tiene un límite de operaciones, para que nunca se cuelgue.
- **Es declarativo arriba y reactivo abajo:** las líneas de arriba del archivo describen el entrenamiento (se leen una
  vez), y las funciones especiales (`al_empezar`, `cada_generacion`, `al_terminar`) reaccionan mientras entrena.
- **Es bilingüe:** cada nombre del lenguaje existe en español y en inglés (`modelo` / `model`, `cada_generacion` /
  `every_generation`, `e.exito` / `e.success`), y se pueden mezclar. El comando `traducir` pasa un programa de un
  idioma al otro.

## Cómo está hecho

```
programa .pbd ──► lexer ──► parser (árbol) ──► intérprete
                                                   │ arriba del archivo: arma la configuración (cfg)
                                                   ▼
                     compilar() ──► pedido POST /api/lab ──► scripts/jugar.py ──► scripts/live_train.py (PPO)
                                                                                       │ (fondo o Blender)
          el Estudio lee GET /api/lab cada 1,5 s ──► e ──► cada_generacion(e) ──► acciones (premios, detener…)
```

| Archivo | Qué tiene |
|---|---|
| `app/pbdmm.js` | El lexer, el parser, el intérprete, `compilar()`, la traducción y `estadoE()` (el objeto `e`) |
| `app/estudio.js` | El Estudio: editor, terminal, comandos, la gráfica, y llamar las funciones especiales |
| `app/autocompletar.js` | El autocompletado |
| `app/data/pbdmm.json` | Las funciones, las lecciones, los ejemplos, los comandos y los nombres en inglés |
| `app/test_pbdmm.mjs` | Las pruebas (`node app/test_pbdmm.mjs`) |
| `app/doc_pbdmm.mjs` | Genera [`docs/PBDMM.md`](../PBDMM.md) |
