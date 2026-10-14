"""
Construye blender/bodega.blend: la bodega 3D, el dron, cámaras, luces y el Piloto IA.

    /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \\
        --python blender/build_bodega.py -- --preview

Lee levels/bodega.json (el MISMO nivel con el que se entrenó la IA) y deja:
  - colección "Bodega"       : todo lo que se ve (piso, paredes, estanterías, montacargas...)
  - colección "Colisiones"   : cajas invisibles que usa la física (hijas de lo que se ve:
                               si mueves el montacargas, se mueve su colisión)
  - colección "Ruta"         : Ruta_01..Ruta_15 (empties) + Salida + Estacion
  - colección "Ruta_Visual"  : aros y línea guía (se pueden ocultar)
  - "Dron" con sus hélices, y 3 cámaras (persecución, FPV, general)
  - el texto "piloto_ia.py" registrado: panel N > Piloto IA
"""
import json
import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector


def _here():
    try:
        return os.path.dirname(os.path.abspath(__file__))
    except NameError:
        return os.path.dirname(bpy.path.abspath(bpy.context.space_data.text.filepath))


HERE = _here()
PROJECT = os.path.dirname(HERE)
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import importlib  # noqa: E402

import escena_lib  # noqa: E402

importlib.reload(escena_lib)
from escena_lib import (M, MB, build_chase_cameras, build_drone, build_forklift, collision_proxy,  # noqa: E402
                        general_camera, materials, pallet_with_boxes, parent_to, render, set_engine, text)
ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
LEVEL = json.load(open(os.path.join(PROJECT, "levels", "bodega.json"), encoding="utf-8"))
VIS = LEVEL["visual"]
RNG = random.Random(7)


# =====================================================================
# Materiales
# =====================================================================
# =====================================================================
# Escena
# =====================================================================
def new_scene():
    if bpy.app.background:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        sc = bpy.context.scene
        sc.name = "Bodega"
    else:                                     # desde la interfaz: escena NUEVA, no tocar la actual
        sc = bpy.data.scenes.new("Bodega")
        bpy.context.window.scene = sc
    sc.unit_settings.system = 'METRIC'
    sc.unit_settings.scale_length = 1.0
    set_engine(sc)
    world = bpy.data.worlds.new("Interior")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.03, 0.035, 0.045, 1)
    sc.world = world
    sc["drone_rl_project"] = PROJECT
    return sc


def coll(name, parent=None):
    c = bpy.data.collections.new(name)
    (parent or bpy.context.scene.collection).children.link(c)
    return c


# =====================================================================
# Edificio
# =====================================================================
def build_building(col, colc):
    x0, x1 = VIS["interior"]["x"]
    y0, y1 = VIS["interior"]["y"]
    h = VIS["interior"]["h"]
    mb = MB()
    mb.box((x0 - 0.3, y0 - 0.3, -0.05), (x1 + 0.3, y1 + 0.3, 0.0), M["concreto"])
    mb.obj("Piso", col)

    walls = MB()
    for b in LEVEL["boxes"]:
        if b["kind"] in ("pared", "techo"):
            walls.box(b["min"], b["max"], M["pared"] if b["kind"] == "pared" else M["techo"])
            collision_proxy(b["name"], b["min"], b["max"], colc)
    # zócalo oscuro en la parte baja de las paredes
    e = 0.02
    walls.box((x0, y0, 0), (x1, y0 + e, 1.2), M["pared_baja"])
    walls.box((x0, y1 - e, 0), (x1, y1, 1.2), M["pared_baja"])
    walls.box((x0, y0, 0), (x0 + e, y1, 1.2), M["pared_baja"])
    walls.box((x1 - e, y0, 0), (x1, y1, 1.2), M["pared_baja"])
    walls.obj("Paredes_techo", col)

    roof = MB()
    for y in (-5.5, 0.0, 5.5):                          # tragaluces sobre las estanterías
        roof.box((-15, y - 0.5, h - 0.03), (15, y + 0.5, h - 0.005), M["tragaluz"])
    for x in (-15, -9, -3, 3, 9, 15):                   # cerchas de acero
        roof.box((x - 0.08, y0, h - 0.18), (x + 0.08, y1, h - 0.08), M["viga"])
        roof.box((x - 0.08, y0, h - 0.65), (x + 0.08, y1, h - 0.55), M["viga"])
        for y in [y0 + 1 + 1.6 * k for k in range(13)]:
            roof.cube((x, y, h - 0.37), (0.06, 0.06, 0.5), M["viga"], rx=0.6)
    roof.obj("Cerchas_tragaluces", col)

    # puerta de carga (pared oeste)
    d = VIS["door"]
    door = MB()
    door.box((x0 + 0.005, d["y"][0] + 0.12, 0), (x0 + 0.05, d["y"][1] - 0.12, d["h"] - 0.1), M["pared_baja"])
    for y in d["y"]:
        door.box((x0, y - 0.12, 0), (x0 + 0.15, y + 0.12, d["h"]), M["amarillo"])
    door.box((x0, d["y"][0] - 0.12, d["h"]), (x0 + 0.15, d["y"][1] + 0.12, d["h"] + 0.2), M["amarillo"])
    door.box((x0 + 0.01, sum(d["y"]) / 2 - 0.5, d["h"] + 0.35), (x0 + 0.06, sum(d["y"]) / 2 + 0.5, d["h"] + 0.7), M["salida"])
    door.obj("Puerta_carga", col)
    text("SALIDA", col, (x0 + 0.08, sum(d["y"]) / 2, d["h"] + 0.52), 0.25, M["texto_blanco"],
         rot=(math.radians(90), 0, math.radians(-90)))


def build_racks(col, colc):
    boxes = [b for b in LEVEL["boxes"] if b["kind"] == "estanteria"]
    for k, (r, b) in enumerate(zip(VIS["racks"], boxes), 1):
        xa, xb = r["x"]
        ya, yb = r["y"]
        h = r["h"]
        mb = MB(origin=((xa + xb) / 2, (ya + yb) / 2, 0))
        bays = int(round((xb - xa) / 2.4))
        levels = [0.1 + i * (h - 0.1) / r["niveles"] for i in range(r["niveles"] + 1)]
        for i in range(bays + 1):                     # parales
            x = xa + i * (xb - xa) / bays
            for y in (ya + 0.05, yb - 0.05):
                mb.box((x - 0.045, y - 0.045, 0), (x + 0.045, y + 0.045, h), M["azul"])
        for z in levels:                              # vigas y rejillas
            for y in (ya + 0.05, yb - 0.05):
                mb.box((xa, y - 0.03, z - 0.06), (xb, y + 0.03, z + 0.06), M["naranja"])
            if z > 0.2:
                mb.box((xa, ya + 0.08, z + 0.05), (xb, yb - 0.08, z + 0.065), M["rejilla"])
        for i in range(bays):                         # carga: pallets con cajas
            bx = xa + i * (xb - xa) / bays
            for z, z_next in zip(levels[:-1], levels[1:]):
                for slot in (0.62, 1.78):
                    if RNG.random() < 0.72:
                        pallet_with_boxes(mb, bx + slot, (ya + yb) / 2, z + 0.07, 1.0, (yb - ya) - 0.2,
                                          (z_next - z) - 0.2)
        o = mb.obj(f"Estanteria_{k}", col)
        collision_proxy(b["name"], b["min"], b["max"], colc, parent=o)
        # cartel del pasillo en la cabecera este
        text(f"R{k}", col, (xb + 0.06, (ya + yb) / 2, h - 0.5), 0.45, M["texto_blanco"],
             rot=(math.radians(90), 0, math.radians(90)))
    # líneas amarillas en el piso a los lados de cada estantería
    ln = MB()
    for r in VIS["racks"]:
        xa, xb = r["x"]
        for y in (r["y"][0] - 0.35, r["y"][1] + 0.35):
            ln.box((xa - 0.3, y - 0.05, 0.001), (xb + 0.3, y + 0.05, 0.004), M["linea"])
    ln.obj("Lineas_piso", col)
    for label, y in (("PASILLO A", -2.75), ("PASILLO B", 2.75)):
        text(label, col, (13.2, y, 0.006), 0.55, M["linea"], rot=(0, 0, math.radians(90)))


def build_objects(col, colc):
    for b in VIS["objects"]:
        mn, mx = b["min"], b["max"]
        origin = ((mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, mn[2])
        mb = MB(origin=origin)
        kind = b["kind"]
        if kind == "montacargas":
            build_forklift(mb, mn, mx)
        elif kind == "columna":
            mb.box(mn, mx, M["columna"])
            mb.box((mn[0] - 0.02, mn[1] - 0.02, 0), (mx[0] + 0.02, mx[1] + 0.02, 1.4), M["peligro"])
        elif kind == "letrero":
            y0, y1 = mn[1] + 0.15, mx[1] - 0.15
            mb.box((mn[0], y0, mn[2]), (mx[0], y1, mn[2] + 1.1), M["rojo"])
            mb.box((mn[0] - 0.01, y0, mn[2]), (mx[0] + 0.01, y1, mn[2] + 0.12), M["peligro"])
            for y in (y0 + 0.2, y1 - 0.2):
                mb.cyl(((mn[0] + mx[0]) / 2, y, (mn[2] + 1.1 + mx[2]) / 2), 0.012, mx[2] - mn[2] - 1.1, M["acero"])
        elif kind == "pallets":
            z = mn[2]
            while mx[2] - z > 0.5:
                used = 0
                nx = max(1, round((mx[0] - mn[0]) / 1.2))
                ny = max(1, round((mx[1] - mn[1]) / 1.0))
                w, d = (mx[0] - mn[0]) / nx, (mx[1] - mn[1]) / ny
                for i in range(nx):
                    for j in range(ny):
                        used = max(used, pallet_with_boxes(mb, mn[0] + (i + 0.5) * w, mn[1] + (j + 0.5) * d, z,
                                                           w - 0.05, d - 0.05, min(1.1, mx[2] - z)))
                z += used
        o = mb.obj(f"Obj_{b['name']}", col)
        collision_proxy(b["name"], mn, mx, colc, parent=o)
        if kind == "letrero":
            cx = (mn[0] + mx[0]) / 2
            for sgn, rz in ((-1, -90), (1, 90)):
                text("PRECAUCIÓN\nALTURA LIBRE 3.3 m", col, (cx + sgn * 0.17, (mn[1] + mx[1]) / 2, mn[2] + 0.62),
                     0.22, M["texto_blanco"], rot=(math.radians(90), 0, math.radians(rz)))


def build_lamps(col):
    mb = MB()
    h = VIS["interior"]["h"]
    for (x, y) in VIS["lamps"]:
        mb.cyl((x, y, 7.05), 0.45, 0.4, M["lampara"], segs=24, r2=0.12)
        mb.cyl((x, y, 6.84), 0.38, 0.02, M["luz"], segs=24)
        mb.cyl((x, y, (7.25 + h) / 2), 0.01, h - 7.25, M["acero"], segs=6)
        ld = bpy.data.lights.new(f"Lampara_{x}_{y}", 'SPOT')
        ld.energy = 1300
        ld.spot_size = math.radians(125)
        ld.spot_blend = 0.6
        ld.color = (1.0, 0.92, 0.8)
        lo = bpy.data.objects.new(ld.name, ld)
        lo.location = (x, y, 6.8)
        col.objects.link(lo)
    mb.obj("Lamparas", col)


def build_pads(col):
    sx, sy, _ = VIS["pad_start"]
    mb = MB()
    mb.box((sx - 0.7, sy - 0.7, 0), (sx + 0.7, sy + 0.7, 0.012), M["pad"])
    for a, b in (((-0.7, -0.7), (0.7, -0.62)), ((-0.7, 0.62), (0.7, 0.7)),
                 ((-0.7, -0.7), (-0.62, 0.7)), ((0.62, -0.7), (0.7, 0.7))):
        mb.box((sx + a[0], sy + a[1], 0.012), (sx + b[0], sy + b[1], 0.016), M["verde"])
    ex, ey, _ = VIS["pad_end"]
    mb.cyl((ex, ey, 0.006), 0.75, 0.012, M["pad"], segs=48)
    mb.torus((ex, ey, 0.014), 0.68, 0.025, M["cian"], nu=48, nv=8)
    mb.box((ex - 0.25, ey + 1.2, 0), (ex + 0.25, ey + 1.6, 1.5), M["lampara"])               # torre de carga
    mb.box((ex - 0.18, ey + 1.19, 0.8), (ex + 0.18, ey + 1.2, 1.3), M["cian"])
    mb.obj("Plataformas", col)
    text("H", col, (sx, sy, 0.017), 0.8, M["texto_blanco"])
    text("INICIO", col, (sx + 1.1, sy, 0.006), 0.35, M["salida"], rot=(0, 0, math.radians(90)))
    text("ESTACIÓN DE CARGA", col, (ex, VIS["interior"]["y"][1] - 0.03, 3.2), 0.45, M["cian"],
         rot=(math.radians(90), 0, math.radians(180)))


def build_route(col_ruta, col_vis):
    pts = [Vector(LEVEL["spawn"])] + [Vector(g) for g in LEVEL["goals"]]
    sal = bpy.data.objects.new("Salida", None)
    sal.location = LEVEL["spawn"]
    sal.empty_display_type = 'SINGLE_ARROW'
    col_ruta.objects.link(sal)
    est = bpy.data.objects.new("Estacion", None)
    est.location = VIS["pad_end"]
    est.empty_display_type = 'CIRCLE'
    est.empty_display_size = 0.7
    col_ruta.objects.link(est)
    for i, g in enumerate(LEVEL["goals"], 1):
        e = bpy.data.objects.new(f"Ruta_{i:02d}", None)
        e.empty_display_type = 'SPHERE'
        e.empty_display_size = 0.15
        e.location = g
        col_ruta.objects.link(e)
        d = pts[i] - pts[i - 1]
        rot = (0.0, math.pi / 2 - math.atan2(d.z, math.hypot(d.x, d.y)), math.atan2(d.y, d.x))
        mb = MB(origin=g)
        mb.torus(g, 0.5, 0.022, M["ruta"], rot=rot)
        ring = mb.obj(f"Aro_{i:02d}", col_vis, parent=e)
        ring.hide_render = False
        t = text(str(i), col_vis, (g[0], g[1], g[2] + 0.75), 0.3, M["ruta"],
                 rot=(math.radians(90), 0, math.atan2(d.y, d.x) - math.pi / 2))   # mira al dron que llega
        parent_to(t, e)
    # línea guía (recorrido ideal en línea recta; la IA decide cómo esquivar)
    cu = bpy.data.curves.new("Ruta_guia", 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = 0.012
    sp = cu.splines.new('POLY')
    sp.points.add(len(pts) - 1)
    for p, v in zip(sp.points, pts):
        p.co = (v.x, v.y, max(v.z, 0.05), 1)
    o = bpy.data.objects.new("Ruta_guia", cu)
    o.data.materials.append(M["guia"])
    col_vis.objects.link(o)


# =====================================================================
# Dron (frame de 5" del proyecto, en metros)
# =====================================================================
def build_cameras(col, drone):
    sp = Vector(LEVEL["spawn"])
    cam, _ = build_chase_cameras(col, drone, sp, drone.rotation_euler.z)
    gen = general_camera(col, (-17.3, -10.3, 7.4), (3, 1, 0.5), lens=16)
    bpy.context.scene.camera = cam
    return cam, gen


def install_pilot():
    path = os.path.join(HERE, "piloto_ia.py")
    t = bpy.data.texts.load(path)
    t.use_module = True                       # se registra solo al abrir el .blend
    exec(compile(t.as_string(), path, "exec"), {"__name__": "piloto_ia"})


def test_flight(policy_path):
    """Vuelo de prueba DENTRO de Blender (mismo código que el botón), para verificar."""
    sys.path.insert(0, PROJECT)
    import numpy as np
    from drone_rl.runtime import Flight, NumpyPolicy
    ns = {}
    exec(compile(bpy.data.texts["piloto_ia.py"].as_string(), "piloto_ia", "exec"), ns)
    lv, pad = ns["level_from_scene"]()
    fl = Flight(lv, NumpyPolicy(policy_path), land_on=pad)
    fl.reset()
    hist = [fl.info()]
    while fl.phase in ("ruta", "aterrizaje") and fl.t < 120:
        hist.append(fl.step())
    print(f"VUELO_PRUEBA fase={fl.phase} motivo={fl.reason} puntos={fl.goal_idx}/{len(lv.goals)} t={fl.t:.1f}s")
    return fl, hist


def flight_stills(hist, cam):
    """Fotos del vuelo REAL de la IA en cada reto (pose y cámara de persecución de ese instante)."""
    import numpy as np
    targets = [("montacargas", (3.3, -8.4)), ("columna", (-8.0, -2.75)), ("letrero", (1.75, 2.75)),
               ("pallets", (10.0, 8.5)), ("estacion", tuple(VIS["pad_end"][:2]))]
    xy = np.array([h["pos"][:2] for h in hist])
    drone, tgt = bpy.data.objects["Dron"], bpy.data.objects["Cam_Objetivo"]
    for name, (tx, ty) in targets:
        k = int(np.argmin(np.linalg.norm(xy - np.array([tx, ty]), axis=1)))
        if name != "estacion":
            k = max(0, k - 12)                       # un instante antes de pasar el reto
        h = hist[k]
        drone.location = Vector(h["pos"])
        drone.rotation_euler = h["rot"]
        vel = Vector(h["vel"])
        fwd = vel.normalized() if vel.length > 0.5 else Vector((math.cos(h["rot"][2]), math.sin(h["rot"][2]), 0))
        fwd.z = 0
        fwd.normalize()
        tgt.location = Vector(h["pos"]) + fwd * 1.5
        cam.location = Vector(h["pos"]) - fwd * 2.4 + Vector((0, 0, 0.9))
        for i in range(1, 5):
            d = bpy.data.objects.get(f"Disco_{i}")
            if d:
                d.hide_render = h["throttle"] < 0.05
        render(os.path.join(HERE, f"vuelo_{name}.png"), cam, samples=32)
        print(f"FOTO {name}: t={h['t']:.1f}s pos={[round(v, 2) for v in h['pos']]} fase={h['phase']}")


def main():
    sc = new_scene()
    materials()
    c_bod = coll("Bodega")
    c_col = coll("Colisiones")
    c_ruta = coll("Ruta")
    c_vis = coll("Ruta_Visual")
    c_dron = coll("Dron")
    c_cam = coll("Camaras_Luces")
    build_building(c_bod, c_col)
    build_racks(c_bod, c_col)
    build_objects(c_bod, c_col)
    build_lamps(c_cam)
    build_pads(c_bod)
    build_route(c_ruta, c_vis)
    g0 = Vector(LEVEL["goals"][0]) - Vector(LEVEL["spawn"])
    drone = build_drone(c_dron, LEVEL["spawn"], math.atan2(g0.y, g0.x))
    cam, gen = build_cameras(c_cam, drone)
    lc = bpy.context.view_layer.layer_collection.children.get("Colisiones")
    if lc:
        lc.hide_viewport = True
    install_pilot()

    hist = None
    if "--test-policy" in ARGS:
        _, hist = test_flight(ARGS[ARGS.index("--test-policy") + 1])
    if "--stills" in ARGS and hist:
        flight_stills(hist, cam)
    if "--preview" in ARGS:
        render(os.path.join(HERE, "preview_general.png"), gen)
        # dron a medio camino, frente al montacargas, para ver de cerca
        drone.location = (-1.2, -8.15, 2.5)
        drone.rotation_euler = (0.05, 0.25, 0.0)
        bpy.data.objects["Cam_Objetivo"].location = drone.location
        cam.location = Vector((-3.4, -8.6, 3.3))
        render(os.path.join(HERE, "preview_dron.png"), cam)
        drone.location = LEVEL["spawn"]
        drone.rotation_euler = (0, 0, math.atan2(LEVEL["goals"][0][1] - LEVEL["spawn"][1],
                                                 LEVEL["goals"][0][0] - LEVEL["spawn"][0]))
        bpy.data.objects["Cam_Objetivo"].location = LEVEL["spawn"]
        sc.camera = cam
    out = ARGS[ARGS.index("--out") + 1] if "--out" in ARGS else os.path.join(HERE, "bodega.blend")
    bpy.ops.wm.save_as_mainfile(filepath=out)
    print("GUARDADO", out)


main()
