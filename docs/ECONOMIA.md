# La plata · la guía del dinero

De dónde sale la plata, a dónde va y el camino de la demo con números. Todo se balancea editando JSON
(`app/data/`). La prueba `node app/test_economia.mjs` juega la demo con la lógica real del juego en 40 partidas
distintas y falla si el camino se traba (`-v` imprime el libro de caja día a día).

## La meta de la demo

Del regalo de mamá a **E6 · Video con ruta + un segundo dron para la finca** (sin desarmar el primero) en **3 a 5 días**
de juego (un día = 30 min jugando), aunque tu IA saque fotos de 1 ★.

| Entregando con… | Termina la demo (la mitad de las partidas) | Rango (40 partidas) | Antes del rebalanceo (19-10-2026) |
|---|---|---|---|
| 1 ★ | día 4 | 4-5 | día 7 (5-8) |
| 2 ★ | día 4 | 3-4 | día 5 (4-7) |
| 3 ★ | día 3 | 2-4 | día 3 (3-4) |

## De dónde sale

- **Los pedidos del celular** (`trabajos.json`): pago = plantilla × dificultad (`dificultades[].pago`: 1 / 1,6 / 2,5 / 4)
  × relación con el cliente (+5 % por ♥), redondeado a 5. Llegan **3 por día**, a lo largo del día (el reloj).
- **Las estrellas** (`misiones.json` `pago_por_estrellas`): 0 ★ = $0 · **1 ★ = 70 %** · 2 ★ = 100 % · 3 ★ = 130 %.
  Reputación por estrellas: −1 / 0 / +1 / +2.
- **Vender piezas usadas**: 40 % del precio × la vida que le queda.

| Trabajo (dificultad 1) | Pago | Con 1 ★ | Con 2 ★ |
|---|---|---|---|
| La primera foto de Doña Marta (tutorial) | $20 | $14 | $20 |
| Fotos de una casa / la fachada | $25 | $18 | $25 |
| Foto de la casa con el jardín | $30 | $21 | $30 |
| Revisar el techo (inspección, con E4) | $35 | $25 | $35 |
| Video de una casa (con E6) | $45 | $32 | $45 |
| Don Ernesto: fotos de la finca (dificultad 2) | $50 | $35 | $50 |

## A dónde va

| Cosa | Precio | Notas |
|---|---|---|
| 💬 Mensajes | $10 | sin esto no te escriben (el tutorial lo pide) |
| 🧠 Simulador (normal) / 💻 IDE (desarrollador) | **$30** (antes $40) | el tutorial lo pide |
| E1 · E2 | gratis | |
| E3 · Seguir una línea | **$30** (antes $40) | |
| E4 · Foto fija | **$45** (antes $60) | abre las inspecciones |
| E5 · Set de fotos | **$60** (antes $80) | abre los videos y los pedidos especiales |
| E6 · Video con ruta | **$90** (antes $120) | lo último de la demo |
| El dron de la finca (madera + motores 2204 + ESP-NOW con antena) | **$131** (antes $144) | empuje/peso 2,96 ≥ 2,2 + barómetro + radio 35 m (las tomas llegan a ~24-28 m: el ESP-NOW del kit, 20 m, pierde la señal); motores 2204 **$35** (antes $45) |
| Insumos de soldar | $3-4 c/u | el regalo trae 10 g de estaño, 5 ml de flux y 2 m de cable: alcanzan para el segundo dron |
| Arriendo | $60 cada 7 días | recién desde reputación 6 |
| Reparar | precio × lo que perdió × 0,6 | sin plata: el arreglo casero es gratis (las piezas quedan al 40 %) |
| Impresora 3D (Forja Mini / Pro / X) | $90 / $230 / $480 | NO está en el camino de la demo (el dron de madera no se imprime). Sin impresora no se compra el chasis para imprimir |
| Filamento | $8-14 el kg | un chasis gasta ~170 g (≈ $1,4 de PLA); el chasis para imprimir es la tornillería: $6 |

## Siempre se puede seguir (desde $0)

- **El primer pedido de cada día es fácil**: dificultad 1, sin viento, de un cliente que los pide (Doña Marta). Tu dron
  de madera lo puede volar aunque no tengas un peso.
- Volar no cuesta plata y el arreglo casero es gratis: nunca quedas sin poder trabajar.
- Con 1 ★ la relación con el cliente sube igual: Doña Marta te recomienda a Don Ernesto y a la agencia (más pedidos y
  mejor pagados).

## El camino recomendado (el libro de caja con 1 ★, semilla 1)

```
día 1   −10   $140  💬 Mensajes
día 1   −30   $110  🧠 Simulador
día 1   −30   $ 80  E3
día 1   −45   $ 35  E4
día 1   +14   $ 49  Doña Marta: la primera foto
día 2   +60   $109  3 fotos de Doña Marta
día 2   −60   $ 49  E5
día 3   +84   $133  techo + fachada + Don Ernesto: la finca
día 3   −90   $ 43  E6
día 4   +77   $120  3 pedidos
día 5   +81   $201  3 pedidos
día 5  −131   $ 70  el segundo dron (finca)
```

Con 2 ★ el mismo camino termina el día 4 con $46 de sobra.

## Arreglado (19-10-2026)

- **El regalo de mamá pedía tener la plata** (`comprarCarrito` con `regalo`): con menos de $115 fallaba con
  «Te faltan $115». Ahora es gratis de verdad.
- **Una herramienta pedida 2 veces se cobraba 2 veces** y quedaba una (`PT.comprar` con n > 1). La tienda la limita a 1,
  pero la lógica ya no lo permite.
- **El precio del Kit del garaje en la tienda** no contaba el descuento de la impresora 3D (mostraba más de lo que cobraba).
- **Ningún pedido fácil algunos días**: con Don Ernesto y la agencia en la rotación, en 4 de 6 días no llegaba nada de
  dificultad 1 (con viento, el dron de madera no alcanza). Ahora el primero del día siempre es fácil.
- La partida de Santiago (día 4) se revisó entera en Finanzas: **ningún cobro doble**; lo que faltaba era balance.
