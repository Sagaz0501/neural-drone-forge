# Entrenamiento probado: E1-E12 (18/19-10-2026)

Claude entrenó la cadena completa de escenarios, cada uno partiendo del modelo del anterior y con repaso de lo aprobado
(20 %), para medir tiempos y comparar premios. Las pistas "⏱️ Probado" de los programas de cada simulador
(`app/data/pbdmm.json` `escenarios_codigo`) salen de aquí.

- Máquina: el Mac de Santiago, 3 entrenamientos a la vez en el fondo (~4.300 pasos/s cada uno) + Blender entrenando.
- **examen** = 40 intentos fijos sin ruido (`simulacion.evaluar`, como el 🎓 examen). Es la nota que cuenta.
- Variantes: **misión** = sin escribir premios (los de `entrenamiento.json`); **sensato** = un set escrito a mano y lo que
  falta en 0; **mínimo** = solo meta (o grabar) + chocar, lo demás en 0.
- Desde E5 (corrida `e5_x`) cada corrida usa la regla del examen: al 80 % baja el lr a 0.0001 y al 90 % se detiene.

| Escenario | Variante | Aprueba (80 % examen) | Examen final | Choque |
|---|---|---|---|---|
| E1 despegar (desde cero) | misión | 1,6 min · 0,5 M pasos | 100 % | 0 % |
| E2 punto | misión / mirar=8 | 4,8 / 3,5 min | 100 % / 100 % | 0 % |
| E3 línea | misión | inmediato (lo trae de E2) | 100 % | 0 % |
| E4 foto | misión | ~44 min · 11 M pasos (la curva con ruido en ~0 %) | 97,5 % (calidad 0,76) | 2,5 % |
| E4 foto | igual, otra corrida | ~44 min | 77,5 % | 2,5 % |
| E4 foto | encuadre=7, quieto=7 | ~44 min | 92,5 % | 5 % |
| E5 set de fotos | misión, lr fijo, 1,5 h | 20 min (90 %) y después **cayó a 0 % dos veces** | 0 % | 0 % |
| E5 set de fotos | misión + regla del examen | **5 min · 1,4 M pasos** | 92,5 % (calidad 0,83) | 2,5 % |
| E5 | sensato sin `grabar` | nunca (olvida lo de E4) | 0 % | 2,5 % |
| E5 | mínimo | nunca | 0 % | 2,5 % |
| E6 video | misión | 30 min · 8,3 M pasos | 80 % | 7,5 % |
| E6 | sensato sin pegado/peligro | no (35 min) | 50 % | 15 % |
| E6 | mínimo (grabar+chocar) | no (21 min) | 0 % | 12,5 % |
| E7 columnas | las 3 | no en 20 min (6 M pasos) | 35-37,5 % | 62-65 % |
| E7 columnas | misión / sensato, 20 M pasos (69 min) | no | 45 % / 50 % | 55 % / 50 % |
| E8 viento | misión / sacudidas=6 / mínimo | 5 min | 92,5 % / 92,5 % / 70 % | 7,5 % / **2,5 %** / 5 % |
| E9 postes | misión / sensato | 5 min | 87,5 % / 87,5 % | 7,5 % / 2,5 % |
| E9 | mínimo | 5 min… y se degradó sin detenerse | 52,5 % | 10 % |
| E10 entregas | misión | no (42 min, 12 M) | 10 % | 45 % |
| E10 | sensato (meta=6, pegado, peligro) | no (41 min) | **42,5 %** | 52,5 % |
| E10 | mínimo | no | 32,5 % | 60 % |
| E10 | sensato + 20 M pasos más (~110 min en total) | no | 47,5 % | 52,5 % |
| E11 carrera | misión / rapidez=6 / mínimo | ~1-2 min | 87,5 % / **100 %** / 92,5 % | 12,5 % / 0 % / 7,5 % |
| E12 persecución | misión | no (46 min) | 2,5 % | 35 % |
| E12 | sensato (meta=6, acercarse, mirar, chocar) | 35 min · 9,4 M pasos | **90 %** | 10 % |
| E12 | mínimo | no (26 min) | 5 % | 57,5 % |

## Lo que se aprendió

1. **El éxito del entrenamiento no es la nota.** Lleva el ruido con el que explora: en la foto marca ~0 % cuando el
   examen ya da 97 %. Por eso existe `e.examen` en PBDMM (el estudio pide `/api/evaluar` cada 3 min).
2. **Con el lr fijo, un modelo bueno se cae.** E5: 75 → 90 → 80 → 0 → 0 → 100 → 85 → 0 → 0 % (examen cada 10 min).
   Bajar el lr con el examen y detener a tiempo lo resuelve (E5 en 5 min, 92,5 %). Es el `if` de los programas desde E4.
3. **Lo que no escribes queda en 0 y el modelo lo olvida.** Sin `grabar`, un modelo de 97 % en fotos bajó a 0 %.
4. **Más castigos no siempre es mejor.** En la persecución, los de la misión lo vuelven miedoso (2 %); pocos y claros, 90 %.
5. **Lo difícil es esquivar:** E7 y E10 no aprueban ni con 70-110 min y ningún premio (45-50 %, la mitad choca). Antes de
   pedírselo al jugador hay que revisar esos niveles (densidad de obstáculos, red más grande, o E7 antes de E10).

Los modelos de prueba quedaron fuera del proyecto (scratchpad de la sesión), no en `models/`.
