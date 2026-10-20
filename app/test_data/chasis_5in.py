# Genera app/test_data/chasis_5in.step: un chasis 5" de prueba hecho por script (CadQuery, en un venv aparte:
#   python3 -m venv /tmp/cq && /tmp/cq/bin/pip install cadquery && /tmp/cq/bin/python app/test_data/chasis_5in.py)
# Es un ENSAMBLE: placa de abajo, 4 brazos (cuerpos aparte, con la base del motor), placa de arriba y 4 separadores.
# STEP AP214 en milímetros. Imprime los volúmenes EXACTOS (de la B-rep, OpenCascade) que usa app/test_step.mjs.
import json
import math
import sys
from pathlib import Path

import cadquery as cq

WB = 220.0          # distancia diagonal motor-motor (mm): un 5"
R = WB / 2
parts = {}
parts["placa_abajo"] = (cq.Workplane("XY").rect(80, 80).extrude(3).edges("|Z").fillet(6)
                        .faces(">Z").workplane().rect(30.5, 30.5, forConstruction=True).vertices().hole(3.2))
for i, deg in enumerate([45, 135, 225, 315]):
    arm = cq.Workplane("XY").workplane(offset=3).center(20, 0).rect(R - 20, 14, centered=(False, True)).extrude(4)
    mount = cq.Workplane("XY").workplane(offset=3).center(R, 0).circle(13).extrude(4)
    # la base del motor: el eje (5,5 mm) + 4 tornillos M2 en cuadrado de 12 × 12 mm (como un 1806)
    agujeros = (cq.Workplane("XY").workplane(offset=2).pushPoints([(R, 0)]).circle(2.75).extrude(6)
                .union(cq.Workplane("XY").workplane(offset=2).pushPoints([(R + 6, 6), (R - 6, 6), (R - 6, -6), (R + 6, -6)]).circle(1.1).extrude(6)))
    parts[f"brazo_{i + 1}"] = arm.union(mount).cut(agujeros).rotate((0, 0, 0), (0, 0, 1), deg)
parts["placa_arriba"] = cq.Workplane("XY").workplane(offset=30).rect(70, 70).extrude(2).edges("|Z").fillet(5)
for i, (x, y) in enumerate([(15.25, 15.25), (-15.25, 15.25), (-15.25, -15.25), (15.25, -15.25)]):
    parts[f"separador_{i + 1}"] = cq.Workplane("XY").workplane(offset=3).center(x, y).circle(2.5).extrude(27)

asm = cq.Assembly(name="chasis_5in_prueba")
for k, w in parts.items():
    asm.add(w, name=k, color=cq.Color(0.9, 0.45, 0.1) if k.startswith("brazo") else cq.Color(0.2, 0.2, 0.22))
out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).with_suffix(".step")
asm.export(str(out))
ref = {k: round(w.val().Volume() / 1000, 3) for k, w in parts.items()}
bb = cq.Compound.makeCompound([w.val() for w in parts.values()]).BoundingBox()
print(json.dumps({"vol_cm3": ref, "total_cm3": round(sum(ref.values()), 3),
                  "bbox_mm": [round(bb.xlen, 2), round(bb.ylen, 2), round(bb.zlen, 2)]}, indent=1))
