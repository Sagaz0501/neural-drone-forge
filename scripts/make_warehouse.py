"""
Diseña la BODEGA: un nivel fijo para entrenar y para la animación en Blender.

    python scripts/make_warehouse.py        -> levels/bodega.json

El JSON sirve para las dos cosas:
  - "boxes", "goals", "spawn"  -> lo que usa la física (colisiones, ruta, salida)
  - "visual"                   -> lo que usa blender/build_bodega.py para modelar la escena
Todo en metros. Interior: x -18..18, y -11..11, techo a 8 m.

Ruta (15 puntos): pasillo sur -> vuelta por el este -> pasillo A (oeste) -> vuelta por el oeste
-> pasillo B (este) -> vuelta por el este -> pasillo norte -> estación de carga.
Retos en el camino: montacargas (pasillo sur), columna (pasillo A), letrero colgante que obliga
a pasar POR DEBAJO (pasillo B) y torre de pallets (pasillo norte).
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

X0, X1, Y0, Y1, H = -18.0, 18.0, -11.0, 11.0, 8.0
RACK_X = (-12.0, 12.0)
RACK_H = 5.0
RACKS_Y = [(-6.1, -4.9), (-0.6, 0.6), (4.9, 6.1)]


def box(name, mn, mx, kind):
    return {"name": name, "min": [round(v, 3) for v in mn], "max": [round(v, 3) for v in mx], "kind": kind}


def build():
    boxes = []
    t = 0.3
    # ---- edificio ----
    boxes += [box("pared_sur", (X0 - t, Y0 - t, 0), (X1 + t, Y0, H), "pared"),
              box("pared_norte", (X0 - t, Y1, 0), (X1 + t, Y1 + t, H), "pared"),
              box("pared_oeste", (X0 - t, Y0, 0), (X0, Y1, H), "pared"),
              box("pared_este", (X1, Y0, 0), (X1 + t, Y1, H), "pared"),
              box("techo", (X0 - t, Y0 - t, H), (X1 + t, Y1 + t, H + t), "techo")]
    # ---- estanterías ----
    for i, (ya, yb) in enumerate(RACKS_Y):
        boxes.append(box(f"estanteria_{i + 1}", (RACK_X[0], ya, 0), (RACK_X[1], yb, RACK_H), "estanteria"))
    # ---- obstáculos en la ruta (los retos) ----
    boxes += [
        box("montacargas_1", (2.0, -9.1, 0), (4.6, -7.7, 3.0), "montacargas"),         # pasillo sur
        box("columna_1", (-8.25, -3.0, 0), (-7.75, -2.5, H), "columna"),              # pasillo A
        box("letrero_1", (1.6, 0.6, 3.3), (1.9, 4.9, H), "letrero"),                  # pasillo B: pasar abajo
        box("pallets_torre", (9.4, 7.8, 0), (10.6, 9.2, 3.2), "pallets"),             # pasillo norte
    ]
    # ---- cosas cerca de la ruta (no la bloquean, pero los sensores las ven) ----
    boxes += [
        box("pallets_sur", (-7.0, -11.0, 0), (-5.6, -9.6, 1.6), "pallets"),
        box("cajas_salientes", (1.0, -4.9, 0), (2.4, -3.6, 2.4), "pallets"),
        box("pallet_bajo", (5.5, 3.4, 0), (6.7, 4.9, 1.4), "pallets"),
        box("montacargas_2", (-6.0, 9.6, 0), (-3.4, 11.0, 3.0), "montacargas"),
        box("columna_2", (12.75, -0.25, 0), (13.25, 0.25, H), "columna"),
        box("columna_3", (-13.25, -0.25, 0), (-12.75, 0.25, H), "columna"),
    ]

    route = [(-11.0, -8.5, 2.0), (-2.0, -8.2, 2.5), (9.0, -8.4, 2.5), (14.8, -8.0, 2.8),
             (14.8, -2.8, 3.0), (6.0, -2.7, 3.0), (-4.5, -2.75, 2.4), (-14.8, -2.8, 2.5),
             (-14.8, 2.8, 3.0), (-4.0, 2.75, 3.5), (8.0, 2.8, 2.0), (14.8, 2.8, 2.5),
             (14.8, 8.5, 2.5), (5.0, 8.5, 2.0), (1.0, 8.5, 1.2)]
    spawn = (-15.5, -8.5, 0.0)
    pad_end = (1.0, 8.5, 0.0)

    lamps = [(x, y) for x in (-14, -7, 0, 7, 14) for y in (-8.5, -2.75, 2.75, 8.5)]
    return {
        "name": "bodega",
        "spawn": list(spawn),
        "goals": [list(g) for g in route],
        "boxes": [{"min": b["min"], "max": b["max"], "name": b["name"], "kind": b["kind"]} for b in boxes],
        "spheres": [],
        "bounds": {"xy": 30, "z": 15},
        "visual": {
            "interior": {"x": [X0, X1], "y": [Y0, Y1], "h": H},
            "racks": [{"x": list(RACK_X), "y": list(r), "h": RACK_H, "niveles": 4} for r in RACKS_Y],
            "objects": [b for b in boxes if b["kind"] not in ("pared", "techo", "estanteria")],
            "pad_start": list(spawn), "pad_end": list(pad_end),
            "lamps": [list(l) for l in lamps],
            "door": {"wall": "oeste", "y": [-9.5, -5.5], "h": 4.5},
        },
    }


if __name__ == "__main__":
    lvl = build()
    out = ROOT / "levels" / "bodega.json"
    out.write_text(json.dumps(lvl, indent=1, ensure_ascii=False))
    print(f"{out}: {len(lvl['boxes'])} colisiones, {len(lvl['goals'])} puntos de ruta")
