# Dron Maker

Un juego 3D en el navegador: arma tu propio dron desde piezas rústicas, gana plata vendiendo drones
y grabando videos, compra mejor equipo y, más adelante, entrena una IA para tener una flota de drones
autónomos grabando desde varios ángulos (y, a futuro, entregando paquetes).

> Proyecto de **Santiago Bernal**. Nace de [`drone-rl`](docs/README_drone-rl.md): un simulador de dron
> con una IA que aprendió a volar sola (aprendizaje por refuerzo), un laboratorio en Blender y un
> juego web con Three.js. Esa es la base.

- **El plan del juego:** [`docs/PLAN_JUEGO.md`](docs/PLAN_JUEGO.md)
- **Cómo funciona la base:** [`docs/PROYECTO.md`](docs/PROYECTO.md)
- **Para trabajar con Claude Code:** [`CLAUDE.md`](CLAUDE.md)

## Jugar (lo que ya existe)

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python scripts/jugar.py          # abre http://localhost:8765/game/
```

## Estado

| Hito | Estado |
|---|---|
| M0 · Base: simulador, IA, juego web, pilotear a mano, caza | ✅ |
| M1 · Taller: armar el dron con piezas y volarlo | siguiente |
| M2 · Plata: misiones, tienda, daños | — |
| M3 · Videos: cámara calificada, galería | — |
| M4 · IA: chip de IA, tomas multi-cámara | — |
| M5 · Entregas | — |
