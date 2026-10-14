"""
ESCENARIO DE PRUEBA ALEATORIO: el modelo entrenado vuela en un lugar que nunca vio.

Lo usa el botón "Probar en escenario aleatorio" de Drone Lab. Cada vez:
  1. genera un nivel al azar con el MISMO generador del entrenamiento (drone_rl/level.py):
     metas a 3-8 m y columnas en el camino (nivel 3), o 3 metas seguidas (nivel 4)
  2. lo modela en 3D en la escena "Prueba IA": cada obstáculo según su tamaño es una columna de
     concreto, una torre de cajas o un contenedor; los aros son las metas y abajo de la última
     hay una plataforma de aterrizaje ("META")
  3. el Piloto IA (blender/piloto_ia.py) vuela con la red: sensores -> red -> física, en vivo

Botones en N > Piloto IA: "Otro escenario aleatorio" y "Volver al laboratorio".
"""
import math
import os
import random
import sys

import bpy
import numpy as np
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(HERE)
for p in (HERE, PROJECT):
    if p not in sys.path:
        sys.path.insert(0, p)

import escena_lib  # noqa: E402
from escena_lib import (M, MB, build_chase_cameras, build_drone, collision_proxy, general_camera,  # noqa: E402
                        materials, pallet_with_boxes, parent_to, set_engine, text)

SCENE = "Prueba IA"
COLS = ("Prueba_Escenario", "Colisiones", "Ruta", "Ruta_Visual", "Dron", "Camaras_Luces")
TIPOS = {2: "Una meta, sin obstáculos", 3: "Una meta con columnas", 4: "Tres metas con columnas"}


# =====================================================================
# Nivel al azar (igual que en el entrenamiento)
# =====================================================================
def make_level(stage, rng):
    from drone_rl.level import Level, random_goal, random_pillars
    lv = Level(name=f"prueba_{stage}")
    sp = lv.spawn
    if stage in (2, 3):
        lv.goals = [random_goal(rng, sp)]
    else:
        g, pts = [], sp
        for _ in range(3):
            pts = random_goal(rng, pts, r_min=3, r_max=6)
            pts[2] = np.clip(pts[2], 1.0, 5.0)
            g.append(pts.copy())
        lv.goals = g
    if stage >= 3:
        lv.box_min, lv.box_max = random_pillars(rng, sp, lv.goals)
    return lv


# =====================================================================
# Escena
# =====================================================================
def clear_scene():
    sc = bpy.data.scenes.get(SCENE)
    if sc is None:
        sc = bpy.data.scenes.new(SCENE)
    for o in list(sc.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for name in COLS:
        c = bpy.data.collections.get(name)
        if c:
            bpy.data.collections.remove(c)
    mine = ("Piso_pruebas", "Obstaculo_", "COL_obst_", "Aro_", "Plataforma_", "Dron_Cuerpo", "Helice_", "Disco_",
            "txt", "Cam_", "Sol", "Reflector_")
    for block in (bpy.data.meshes, bpy.data.curves, bpy.data.cameras, bpy.data.lights):
        for d in list(block):
            if d.users == 0 and d.name.startswith(mine):      # solo lo que creó este script
                block.remove(d)
    return sc


def setup_scene(sc):
    sc.unit_settings.system = 'METRIC'
    sc.unit_settings.scale_length = 1.0
    set_engine(sc)
    w = bpy.data.worlds.get("Prueba_Cielo") or bpy.data.worlds.new("Prueba_Cielo")
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs["Color"].default_value = (0.05, 0.065, 0.09, 1)
    w.node_tree.nodes["Background"].inputs["Strength"].default_value = 1.0
    sc.world = w
    sc["drone_rl_project"] = PROJECT
    sc["es_prueba"] = True
    return {n: _coll(sc, n) for n in COLS}


def _coll(sc, name):
    c = bpy.data.collections.new(name)
    sc.collection.children.link(c)
    return c


def build_ground(col):
    mb = MB()
    mb.box((-20, -20, -0.05), (20, 20, 0.0), M["concreto"])
    for k in range(-14, 15, 2):                                    # cuadrícula pintada cada 2 m
        mb.box((k - 0.02, -14, 0.001), (k + 0.02, 14, 0.003), M["linea"])
        mb.box((-14, k - 0.02, 0.001), (14, k + 0.02, 0.003), M["linea"])
    for a in range(0, 360, 15):                                    # barreras bajas alrededor
        r = 17.0
        x, y = r * math.cos(math.radians(a)), r * math.sin(math.radians(a))
        mb.cube((x, y, 0.4), (0.5, 3.6, 0.8), M["peligro"], rz=math.radians(a))
    mb.obj("Piso_pruebas", col)


def build_obstacle(i, mn, mx, col, colc, rng):
    """Cada caja de colisión se dibuja como algo creíble de su tamaño."""
    w = min(mx[0] - mn[0], mx[1] - mn[1])
    origin = ((mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, mn[2])
    mb = MB(origin=origin)
    kind = "columna" if w < 0.75 else rng.choice(["cajas", "contenedor", "cajas"])
    if kind == "columna":
        mb.box(mn, mx, M["columna"])
        mb.box((mn[0] - 0.02, mn[1] - 0.02, 0), (mx[0] + 0.02, mx[1] + 0.02, 1.2), M["peligro"])
        mb.box((mn[0] - 0.05, mn[1] - 0.05, mx[2] - 0.15), (mx[0] + 0.05, mx[1] + 0.05, mx[2]), M["acero"])
    elif kind == "contenedor":
        mb.box(mn, mx, M["pared"])
        for z in (mn[2], mx[2] - 0.12):
            mb.box((mn[0] - 0.03, mn[1] - 0.03, z), (mx[0] + 0.03, mx[1] + 0.03, z + 0.12), M["naranja"])
        for x in (mn[0], mx[0]):
            for y in (mn[1], mx[1]):
                mb.box((x - 0.06, y - 0.06, mn[2]), (x + 0.06, y + 0.06, mx[2]), M["naranja"])
    else:
        z = mn[2]
        while mx[2] - z > 0.4:
            used = pallet_with_boxes(mb, origin[0], origin[1], z, mx[0] - mn[0] - 0.04, mx[1] - mn[1] - 0.04,
                                     min(1.2, mx[2] - z), rng=rng)
            z += used
    o = mb.obj(f"Obstaculo_{i:02d}_{kind}", col)
    collision_proxy(f"obst_{i:02d}", mn, mx, colc, parent=o)
    return kind


def build_goals(lv, cols):
    pts = [Vector(lv.spawn)] + [Vector(g) for g in lv.goals]
    n = len(lv.goals)
    for i, g in enumerate(lv.goals, 1):
        e = bpy.data.objects.new(f"Ruta_{i:02d}", None)
        e.empty_display_type = 'SPHERE'
        e.empty_display_size = 0.15
        e.location = g
        cols["Ruta"].objects.link(e)
        d = pts[i] - pts[i - 1]
        rot = (0.0, math.pi / 2 - math.atan2(d.z, math.hypot(d.x, d.y)), math.atan2(d.y, d.x))
        mb = MB(origin=tuple(g))
        mb.torus(tuple(g), 0.5, 0.03, M["verde"] if i == n else M["ruta"], rot=rot)
        ring = mb.obj(f"Aro_{i:02d}", cols["Ruta_Visual"], parent=e)
        if n > 1:
            t = text(str(i), cols["Ruta_Visual"], (g[0], g[1], g[2] + 0.75), 0.35, M["ruta"],
                     rot=(math.radians(90), 0, math.atan2(d.y, d.x) - math.pi / 2))
            parent_to(t, e)
    # plataforma de aterrizaje debajo de la última meta
    gx, gy = lv.goals[-1][0], lv.goals[-1][1]
    mb = MB()
    mb.cyl((gx, gy, 0.006), 0.8, 0.012, M["pad"], segs=48)
    mb.torus((gx, gy, 0.014), 0.72, 0.03, M["verde"], nu=48, nv=8)
    mb.cyl((gx, gy, lv.goals[-1][2] / 2), 0.015, lv.goals[-1][2] - 0.6, M["guia"], segs=8)   # haz de luz
    mb.obj("Plataforma_meta", cols["Prueba_Escenario"])
    text("META", cols["Prueba_Escenario"], (gx, gy - 1.2, 0.006), 0.45, M["verde"])
    est = bpy.data.objects.new("Estacion", None)
    est.location = (gx, gy, 0.0)
    est.empty_display_type = 'CIRCLE'
    cols["Ruta"].objects.link(est)
    # salida
    sx, sy = lv.spawn[0], lv.spawn[1]
    mb = MB()
    mb.box((sx - 0.6, sy - 0.6, 0), (sx + 0.6, sy + 0.6, 0.012), M["pad"])
    mb.torus((sx, sy, 0.014), 0.5, 0.02, M["cian"], nu=40, nv=6)
    mb.obj("Plataforma_salida", cols["Prueba_Escenario"])
    sal = bpy.data.objects.new("Salida", None)
    sal.location = tuple(lv.spawn)
    sal.empty_display_type = 'SINGLE_ARROW'
    cols["Ruta"].objects.link(sal)


def build_lights(col, center):
    sun_d = bpy.data.lights.new("Sol", 'SUN')
    sun_d.energy = 3.0
    sun_d.angle = math.radians(8)
    sun = bpy.data.objects.new("Sol", sun_d)
    sun.rotation_euler = (math.radians(50), 0, math.radians(35))
    col.objects.link(sun)
    for k, (dx, dy) in enumerate(((-9, -9), (9, -9), (-9, 9), (9, 9))):
        ld = bpy.data.lights.new(f"Reflector_{k}", 'SPOT')
        ld.energy = 3500
        ld.spot_size = math.radians(80)
        ld.spot_blend = 0.5
        ld.color = (1.0, 0.95, 0.88)
        lo = bpy.data.objects.new(ld.name, ld)
        lo.location = (center[0] + dx, center[1] + dy, 9)
        d = Vector(center) - lo.location
        lo.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        col.objects.link(lo)


def build(stage=3, seed=None, model_npz=None, return_scene=None):
    """Arma un escenario NUEVO al azar y lo deja listo para volar."""
    seed = random.randrange(1_000_000) if seed is None else seed
    rng = np.random.default_rng(seed)
    pyrng = random.Random(seed)
    lv = make_level(stage, rng)

    sc = clear_scene()
    bpy.context.window.scene = sc
    cols = setup_scene(sc)
    materials()
    build_ground(cols["Prueba_Escenario"])
    kinds = [build_obstacle(i, mn.tolist(), mx.tolist(), cols["Prueba_Escenario"], cols["Colisiones"], pyrng)
             for i, (mn, mx) in enumerate(zip(lv.box_min, lv.box_max), 1)]
    build_goals(lv, cols)
    g0 = lv.goals[0] - lv.spawn
    drone = build_drone(cols["Dron"], tuple(lv.spawn), math.atan2(g0[1], g0[0]))
    cam, _ = build_chase_cameras(cols["Camaras_Luces"], drone, tuple(lv.spawn), math.atan2(g0[1], g0[0]))
    center = (np.mean([lv.spawn] + lv.goals, axis=0)).tolist()
    general_camera(cols["Camaras_Luces"], (center[0] - 11, center[1] - 11, 9), (center[0], center[1], 1.0), lens=22)
    build_lights(cols["Camaras_Luces"], center)
    sc.camera = cam
    lc = sc.view_layers[0].layer_collection.children.get("Colisiones")
    if lc:
        lc.hide_viewport = True

    sc["prueba_stage"] = stage
    sc["tiempo_max"] = {2: 20.0, 3: 30.0, 4: 45.0}.get(stage, 45.0)
    sc["prueba_seed"] = seed
    if return_scene:
        sc["volver_a"] = return_scene
    if model_npz:
        sc["prueba_modelo"] = model_npz
    if hasattr(sc, "piloto_ia"):
        if model_npz:
            sc.piloto_ia.modelo = model_npz
        sc.piloto_ia.variacion = 0.0
        sc.piloto_ia.variacion_yaw = 180.0         # como en el entrenamiento: sale mirando a cualquier lado
        sc.piloto_ia.camara = 'PERSECUCION'
    return {"seed": seed, "stage": stage, "metas": len(lv.goals), "obstaculos": kinds}


# =====================================================================
# Botones (aparecen en N > Piloto IA cuando estás en la escena de prueba)
# =====================================================================
def fly(context):
    for a in context.screen.areas:
        if a.type == 'VIEW_3D':
            region = next(r for r in a.regions if r.type == 'WINDOW')
            a.spaces.active.region_3d.view_perspective = 'CAMERA'
            with context.temp_override(area=a, region=region):
                bpy.ops.piloto.volar('INVOKE_DEFAULT')
            return True
    return False


class PRUEBA_OT_otro(bpy.types.Operator):
    bl_idname = "prueba.otro"
    bl_label = "Otro escenario aleatorio"
    bl_description = "Genera obstáculos y metas nuevos al azar y vuelve a volar con el mismo modelo"

    def execute(self, context):
        sc = context.scene
        info = build(stage=int(sc.get("prueba_stage", 3)), model_npz=sc.get("prueba_modelo"),
                     return_scene=sc.get("volver_a"))
        self.report({'INFO'}, f"Escenario {info['seed']}: {info['metas']} meta(s), {len(info['obstaculos'])} obstáculos")
        fly(bpy.context)
        return {'FINISHED'}


class PRUEBA_OT_volver(bpy.types.Operator):
    bl_idname = "prueba.volver"
    bl_label = "Volver al laboratorio"

    def execute(self, context):
        dest = bpy.data.scenes.get(context.scene.get("volver_a", "")) or next(
            (s for s in bpy.data.scenes if s.name != SCENE), None)
        if dest:
            context.window.scene = dest
        return {'FINISHED'}


CLASSES = [PRUEBA_OT_otro, PRUEBA_OT_volver]


def register():
    for c in CLASSES:
        old = getattr(bpy.types, c.__name__, None)
        if old is not None:
            try:
                bpy.utils.unregister_class(old)
            except RuntimeError:
                pass
        bpy.utils.register_class(c)
