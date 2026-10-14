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
ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
LEVEL = json.load(open(os.path.join(PROJECT, "levels", "bodega.json"), encoding="utf-8"))
VIS = LEVEL["visual"]
RNG = random.Random(7)


# =====================================================================
# Materiales
# =====================================================================
def mat(name, color, rough=0.5, metal=0.0, emit=0.0, alpha=1.0, emit_color=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit:
        b.inputs["Emission Color"].default_value = (*(emit_color or color), 1)
        b.inputs["Emission Strength"].default_value = emit
    if alpha < 1:
        b.inputs["Alpha"].default_value = alpha
        try:
            m.surface_render_method = 'BLENDED'
        except AttributeError:
            m.blend_method = 'BLEND'
    m.diffuse_color = (*color, alpha)
    return m


def node(nt, kind, **inputs):
    n = nt.nodes.new(kind)
    for k, v in inputs.items():
        n.inputs[k].default_value = v
    return n


def mat_concrete():
    m = mat("Concreto", (0.4, 0.4, 0.4), rough=0.82)
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    tc = nt.nodes.new("ShaderNodeTexCoord")
    n1 = node(nt, "ShaderNodeTexNoise", Scale=0.6, Detail=8.0)
    cr = nt.nodes.new("ShaderNodeValToRGB")
    cr.color_ramp.elements[0].color = (0.25, 0.25, 0.26, 1)
    cr.color_ramp.elements[1].color = (0.47, 0.46, 0.44, 1)
    n2 = node(nt, "ShaderNodeTexNoise", Scale=45.0, Detail=4.0)
    bump = node(nt, "ShaderNodeBump", Strength=0.12)
    L = nt.links.new
    L(tc.outputs["Object"], n1.inputs["Vector"])
    L(tc.outputs["Object"], n2.inputs["Vector"])
    L(n1.outputs["Fac"], cr.inputs["Fac"])
    L(cr.outputs["Color"], b.inputs["Base Color"])
    L(n2.outputs["Fac"], bump.inputs["Height"])
    L(bump.outputs["Normal"], b.inputs["Normal"])
    return m


def mat_corrugated(name, color):
    m = mat(name, color, rough=0.45, metal=0.35)
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    tc = nt.nodes.new("ShaderNodeTexCoord")
    w = node(nt, "ShaderNodeTexWave", Scale=3.0)
    w.wave_type = 'BANDS'
    w.bands_direction = 'Z'
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Rotation"].default_value = (0, math.radians(90), 0)
    bump = node(nt, "ShaderNodeBump", Strength=0.35)
    L = nt.links.new
    L(tc.outputs["Object"], mp.inputs["Vector"])
    L(mp.outputs["Vector"], w.inputs["Vector"])
    L(w.outputs["Fac"], bump.inputs["Height"])
    L(bump.outputs["Normal"], b.inputs["Normal"])
    return m


def mat_hazard():
    m = mat("Franjas_peligro", (0.9, 0.7, 0.05), rough=0.5)
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Rotation"].default_value = (0, math.radians(45), 0)
    w = node(nt, "ShaderNodeTexWave", Scale=6.0)
    w.wave_type = 'BANDS'
    cr = nt.nodes.new("ShaderNodeValToRGB")
    cr.color_ramp.interpolation = 'CONSTANT'
    cr.color_ramp.elements[0].color = (0.02, 0.02, 0.02, 1)
    cr.color_ramp.elements[1].position = 0.5
    cr.color_ramp.elements[1].color = (0.95, 0.72, 0.03, 1)
    L = nt.links.new
    L(tc.outputs["Object"], mp.inputs["Vector"])
    L(mp.outputs["Vector"], w.inputs["Vector"])
    L(w.outputs["Fac"], cr.inputs["Fac"])
    L(cr.outputs["Color"], b.inputs["Base Color"])
    return m


# =====================================================================
# Constructor de mallas (muchas cajas/cilindros en un solo objeto)
# =====================================================================
class MB:
    def __init__(self, origin=(0, 0, 0)):
        self.bm = bmesh.new()
        self.mats = []
        self.o = Vector(origin)

    def _assign(self, verts, m):
        if m is None:
            return
        if m not in self.mats:
            self.mats.append(m)
        idx = self.mats.index(m)
        for f in {f for v in verts for f in v.link_faces}:
            f.material_index = idx

    def cube(self, c, size, m, rx=0.0, ry=0.0, rz=0.0):
        M = (Matrix.Translation(Vector(c) - self.o) @ Euler((rx, ry, rz)).to_matrix().to_4x4()
             @ Matrix.Diagonal((max(size[0], 1e-4), max(size[1], 1e-4), max(size[2], 1e-4), 1.0)))
        self._assign(bmesh.ops.create_cube(self.bm, size=1.0, matrix=M)["verts"], m)

    def box(self, mn, mx, m):
        self.cube([(a + b) / 2 for a, b in zip(mn, mx)], [b - a for a, b in zip(mn, mx)], m)

    def cyl(self, c, r, h, m, segs=16, r2=None, rx=0.0, ry=0.0, rz=0.0):
        M = Matrix.Translation(Vector(c) - self.o) @ Euler((rx, ry, rz)).to_matrix().to_4x4()
        res = bmesh.ops.create_cone(self.bm, cap_ends=True, cap_tris=False, segments=segs, radius1=r,
                                    radius2=r if r2 is None else r2, depth=h, matrix=M)
        self._assign(res["verts"], m)

    def torus(self, c, R, r, m, nu=40, nv=10, rot=(0, 0, 0)):
        M = Matrix.Translation(Vector(c) - self.o) @ Euler(rot).to_matrix().to_4x4()
        vs = []
        for i in range(nu):
            a = 2 * math.pi * i / nu
            for j in range(nv):
                b = 2 * math.pi * j / nv
                p = Vector(((R + r * math.cos(b)) * math.cos(a), (R + r * math.cos(b)) * math.sin(a), r * math.sin(b)))
                vs.append(self.bm.verts.new(M @ p))
        for i in range(nu):
            for j in range(nv):
                f = self.bm.faces.new((vs[i * nv + j], vs[((i + 1) % nu) * nv + j],
                                       vs[((i + 1) % nu) * nv + (j + 1) % nv], vs[i * nv + (j + 1) % nv]))
        self._assign(vs, m)

    def obj(self, name, col, parent=None, keep_world=True):
        """keep_world=True: la geometría ya está en coordenadas del mundo y se queda donde está.
        keep_world=False: coordenadas locales del padre (piezas del dron)."""
        me = bpy.data.meshes.new(name)
        self.bm.to_mesh(me)
        self.bm.free()
        for m in self.mats:
            me.materials.append(m)
        o = bpy.data.objects.new(name, me)
        o.location = self.o
        col.objects.link(o)
        if parent:
            parent_to(o, parent, keep_world)
        return o


def parent_to(child, parent, keep_world=True):
    if keep_world:
        bpy.context.view_layer.update()       # matrix_world de objetos recién creados
        child.parent = parent
        child.matrix_parent_inverse = parent.matrix_world.inverted()
    else:
        child.parent = parent


def text(body, col, loc, size, m, rot=(0, 0, 0), extrude=0.0, align='CENTER'):
    cu = bpy.data.curves.new("txt", 'FONT')
    cu.body = body
    cu.size = size
    cu.extrude = extrude
    cu.align_x = align
    cu.align_y = 'CENTER'
    o = bpy.data.objects.new(f"Texto_{body[:12]}", cu)
    o.location = loc
    o.rotation_euler = rot
    o.data.materials.append(m)
    col.objects.link(o)
    return o


def collision_proxy(name, mn, mx, colc, parent=None):
    mb = MB(origin=[(a + b) / 2 for a, b in zip(mn, mx)])
    mb.box(mn, mx, None)
    o = mb.obj(f"COL_{name}", colc, parent=parent)
    o.display_type = 'WIRE'
    o.hide_render = True
    return o


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
    for eng in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
        try:
            sc.render.engine = eng
            break
        except TypeError:
            continue
    sc.render.resolution_x, sc.render.resolution_y = 1920, 1080
    sc.render.fps = 50
    try:
        sc.eevee.use_raytracing = True
    except AttributeError:
        pass
    for size in ('2048', '1024', '512'):              # 20 lámparas con sombra: más memoria de sombras
        try:
            sc.eevee.shadow_pool_size = size
            break
        except (AttributeError, TypeError):
            continue
    world = bpy.data.worlds.new("Interior")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.03, 0.035, 0.045, 1)
    sc.world = world
    try:
        sc.view_settings.look = 'AgX - Medium High Contrast'
    except TypeError:
        pass
    sc["drone_rl_project"] = PROJECT
    return sc


def coll(name, parent=None):
    c = bpy.data.collections.new(name)
    (parent or bpy.context.scene.collection).children.link(c)
    return c


M = {}


def materials():
    M.update(
        concreto=mat_concrete(), pared=mat_corrugated("Pared_metal", (0.55, 0.6, 0.64)),
        pared_baja=mat("Pared_baja", (0.12, 0.2, 0.3), rough=0.6), techo=mat("Techo", (0.06, 0.065, 0.07), rough=0.9),
        tragaluz=mat("Tragaluz", (0.85, 0.9, 1.0), emit=4.0), viga=mat("Viga", (0.25, 0.27, 0.3), rough=0.4, metal=0.8),
        azul=mat("Rack_azul", (0.04, 0.16, 0.55), rough=0.4, metal=0.5),
        naranja=mat("Rack_naranja", (0.95, 0.33, 0.04), rough=0.45, metal=0.3),
        rejilla=mat("Rejilla", (0.35, 0.37, 0.4), rough=0.5, metal=0.7),
        madera=mat("Madera_pallet", (0.55, 0.38, 0.2), rough=0.85),
        carton1=mat("Carton_1", (0.62, 0.45, 0.27), rough=0.9), carton2=mat("Carton_2", (0.53, 0.38, 0.21), rough=0.9),
        carton3=mat("Carton_3", (0.72, 0.57, 0.38), rough=0.9), blanco=mat("Caja_blanca", (0.82, 0.83, 0.8), rough=0.7),
        amarillo=mat("Amarillo", (0.95, 0.68, 0.03), rough=0.4), negro=mat("Goma", (0.025, 0.025, 0.025), rough=0.9),
        acero=mat("Acero", (0.55, 0.56, 0.58), rough=0.3, metal=0.95), peligro=mat_hazard(),
        columna=mat("Concreto_columna", (0.55, 0.55, 0.53), rough=0.8),
        rojo=mat("Letrero_rojo", (0.75, 0.04, 0.04), rough=0.5), texto_blanco=mat("Texto_blanco", (0.95, 0.95, 0.95), emit=0.6),
        lampara=mat("Lampara", (0.2, 0.21, 0.22), rough=0.4, metal=0.8),
        luz=mat("Luz_lampara", (1.0, 0.93, 0.82), emit=18.0),
        linea=mat("Linea_piso", (0.95, 0.75, 0.05), rough=0.6, emit=0.15),
        pad=mat("Plataforma", (0.05, 0.055, 0.06), rough=0.6),
        verde=mat("Neon_verde", (0.1, 1.0, 0.35), emit=6.0), cian=mat("Neon_cian", (0.1, 0.8, 1.0), emit=6.0),
        ruta=mat("Ruta_aro", (0.15, 0.85, 1.0), emit=5.0, alpha=0.55),
        guia=mat("Ruta_guia", (0.15, 0.85, 1.0), emit=2.0, alpha=0.35),
        salida=mat("Salida_verde", (0.05, 0.7, 0.2), emit=4.0),
        # dron
        carbono=mat("Carbono", (0.018, 0.018, 0.02), rough=0.3), alu=mat("Aluminio_rojo", (0.7, 0.04, 0.04), rough=0.3, metal=1.0),
        pcb=mat("PCB", (0.02, 0.25, 0.08), rough=0.5), oscuro=mat("Plastico_oscuro", (0.03, 0.03, 0.035), rough=0.5),
        vidrio=mat("Lente", (0.01, 0.01, 0.015), rough=0.05), bateria=mat("Bateria", (0.05, 0.05, 0.06), rough=0.4),
        etiqueta=mat("Etiqueta", (0.95, 0.75, 0.05), rough=0.5), correa=mat("Correa", (0.1, 0.1, 0.12), rough=0.9),
        motor=mat("Motor", (0.12, 0.12, 0.14), rough=0.25, metal=0.9),
        helice=mat("Helice", (0.95, 0.35, 0.05), rough=0.4),
        blur=mat("Helice_blur", (0.6, 0.6, 0.62), alpha=0.12, rough=0.5),
        led_r=mat("LED_rojo", (1, 0.05, 0.02), emit=12.0), led_v=mat("LED_verde", (0.1, 1, 0.2), emit=12.0),
    )


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


def pallet_with_boxes(mb, x, y, z, w, dpt, max_h):
    """Un pallet de madera con cajas encima. Devuelve la altura usada."""
    mb.box((x - w / 2, y - dpt / 2, z), (x + w / 2, y + dpt / 2, z + 0.14), M["madera"])
    top = z + 0.14
    hmax = max_h - 0.14
    if hmax < 0.25:
        return 0.14
    style = RNG.random()
    if style < 0.35:                                    # una caja grande
        hh = RNG.uniform(0.5, hmax)
        mb.box((x - w / 2 + 0.03, y - dpt / 2 + 0.03, top), (x + w / 2 - 0.03, y + dpt / 2 - 0.03, top + hh),
               RNG.choice([M["carton1"], M["carton2"], M["blanco"]]))
        return 0.14 + hh
    n = 2 if style < 0.75 else 3                        # grilla de cajas
    used = 0
    for i in range(n):
        for j in range(2):
            hh = RNG.uniform(0.25, min(hmax, 0.9))
            cx = x - w / 2 + (i + 0.5) * w / n
            cy = y - dpt / 2 + (j + 0.5) * dpt / 2
            mb.cube((cx, cy, top + hh / 2), (w / n - 0.04, dpt / 2 - 0.04, hh),
                    RNG.choice([M["carton1"], M["carton2"], M["carton3"]]))
            used = max(used, hh)
    return 0.14 + used


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


def build_forklift(mb, mn, mx):
    x0, y0, _ = mn
    x1, y1, H = mx
    yc = (y0 + y1) / 2
    W = y1 - y0
    L = x1 - x0
    body_x1 = x0 + L * 0.7
    mb.box((x0, y0 + 0.1, 0.25), (body_x1, y1 - 0.1, 1.15), M["amarillo"])                  # chasis
    mb.box((x0, y0 + 0.12, 0.3), (x0 + 0.45, y1 - 0.12, 1.5), M["oscuro"])                  # contrapeso
    for wx in (x0 + 0.45, body_x1 - 0.3):                                                    # ruedas
        for wy in (y0 + 0.14, y1 - 0.14):
            mb.cyl((wx, wy, 0.27), 0.27, 0.22, M["negro"], segs=20, rx=math.pi / 2)
    cab0, cab1 = x0 + 0.55, body_x1 - 0.1
    for px in (cab0, cab1):                                                                  # techo protector
        for py in (y0 + 0.15, y1 - 0.15):
            mb.box((px - 0.04, py - 0.04, 1.15), (px + 0.04, py + 0.04, 2.2), M["negro"])
    mb.box((cab0 - 0.05, y0 + 0.1, 2.15), (cab1 + 0.05, y1 - 0.1, 2.22), M["negro"])
    mb.box((cab0 + 0.2, yc - 0.25, 1.15), (cab0 + 0.65, yc + 0.25, 1.6), M["oscuro"])        # asiento
    mb.cyl((cab1 - 0.15, yc, 1.4), 0.03, 0.5, M["negro"], ry=-0.4)                           # volante
    mb.cyl((cab1 - 0.3, yc, 1.62), 0.17, 0.03, M["negro"], ry=-0.4 + math.pi / 2)
    mx0 = body_x1 + 0.02                                                                     # mástil
    for dy in (-0.3, 0.3):
        mb.box((mx0, yc + dy - 0.05, 0.1), (mx0 + 0.12, yc + dy + 0.05, H), M["acero"])
    mb.box((mx0, yc - 0.35, H - 0.1), (mx0 + 0.12, yc + 0.35, H), M["acero"])
    mb.box((mx0 + 0.12, yc - 0.4, 0.15), (mx0 + 0.2, yc + 0.4, 0.75), M["acero"])            # carro
    for dy in (-0.25, 0.25):                                                                 # uñas
        mb.box((mx0 + 0.2, yc + dy - 0.05, 0.15), (x1, yc + dy + 0.05, 0.2), M["acero"])
    pallet_with_boxes(mb, (mx0 + 0.2 + x1) / 2, yc, 0.2, x1 - mx0 - 0.25, min(1.0, W - 0.2), 1.0)


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
def build_drone(col):
    sp = Vector(LEVEL["spawn"])
    g = Vector(LEVEL["goals"][0]) - sp
    root = bpy.data.objects.new("Dron", None)
    root.empty_display_type = 'ARROWS'
    root.empty_display_size = 0.15
    root.location = sp
    root.rotation_mode = 'XYZ'
    root.rotation_euler = (0, 0, math.atan2(g.y, g.x))
    col.objects.link(root)
    mb = MB()
    t, R, H = 0.004, 0.11, 0.025
    angs = [math.radians(a) for a in (45, 135, 225, 315)]
    mb.cube((0, 0, t / 2), (0.10, 0.04, t), M["carbono"])
    for a in angs:
        mb.cube((math.cos(a) * R / 2, math.sin(a) * R / 2, t / 2), (R, 0.014, t), M["carbono"], rz=a)
        mb.cyl((math.cos(a) * R, math.sin(a) * R, t / 2), 0.014, t, M["carbono"], segs=24)
        mb.cyl((math.cos(a) * R, math.sin(a) * R, t + 0.004), 0.013, 0.008, M["motor"], segs=20)
        mb.cyl((math.cos(a) * R, math.sin(a) * R, t + 0.012), 0.014, 0.008, M["alu"], segs=20)
        mb.cyl((math.cos(a) * R, math.sin(a) * R, t + 0.018), 0.0025, 0.006, M["acero"], segs=8)
        led = M["led_v"] if math.cos(a) > 0 else M["led_r"]
        mb.cube((math.cos(a) * R * 0.6, math.sin(a) * R * 0.6, -0.001), (0.012, 0.006, 0.002), led, rz=a)
    for x, y in ((0.022, 0.015), (0.022, -0.015), (-0.04, 0.015), (-0.04, -0.015)):
        mb.cyl((x, y, t + H / 2), 0.0025, H, M["alu"], segs=6)
    mb.cube((0, 0, t + 0.008), (0.036, 0.036, 0.0016), M["pcb"])
    mb.cube((0, 0, t + 0.016), (0.03, 0.03, 0.0016), M["pcb"])
    mb.cube((0, 0, t + H + 0.001), (0.10, 0.04, 0.002), M["carbono"])
    for s in (1, -1):
        mb.cube((0.04, s * 0.0105, t + H / 2), (0.018, 0.002, H), M["carbono"])
    mb.cube((0.04, 0, t + H / 2), (0.016, 0.019, 0.019), M["oscuro"])
    mb.cyl((0.051, 0, t + H / 2), 0.006, 0.008, M["vidrio"], ry=math.pi / 2)
    zb = t + H + 0.002
    mb.cube((-0.005, 0, zb + 0.015), (0.075, 0.035, 0.03), M["bateria"])
    mb.cube((-0.005, 0, zb + 0.0302), (0.05, 0.03, 0.001), M["etiqueta"])
    mb.cube((-0.005, 0, zb + 0.015), (0.012, 0.037, 0.032), M["correa"])
    mb.cyl((-0.06, 0, zb + 0.02), 0.0015, 0.05, M["negro"], ry=-0.5)
    mb.obj("Dron_Cuerpo", col, parent=root, keep_world=False)
    for i, a in enumerate(angs, 1):
        pos = (math.cos(a) * R, math.sin(a) * R, t + 0.022)
        hp = MB()
        hp.cyl((0, 0, 0), 0.005, 0.006, M["oscuro"], segs=12)
        hp.cube((0.032, 0, 0), (0.058, 0.011, 0.0018), M["helice"], rx=0.25)
        hp.cube((-0.032, 0, 0), (0.058, 0.011, 0.0018), M["helice"], rx=-0.25)
        h = hp.obj(f"Helice_{i}", col, parent=root, keep_world=False)
        h.location = pos
        h.rotation_mode = 'XYZ'
        h.rotation_euler = (0, 0, a)
        dp = MB()
        dp.cyl((0, 0, 0), 0.0635, 0.0006, M["blur"], segs=40)
        d = dp.obj(f"Disco_{i}", col, parent=root, keep_world=False)
        d.location = pos
        d.hide_viewport = d.hide_render = True
    return root


def build_cameras(col, drone):
    sp = Vector(LEVEL["spawn"])
    yaw = drone.rotation_euler.z
    tgt = bpy.data.objects.new("Cam_Objetivo", None)
    tgt.location = sp
    tgt.empty_display_size = 0.1
    col.objects.link(tgt)
    cd = bpy.data.cameras.new("Cam_Persecucion")
    cd.lens = 24
    cd.clip_start = 0.02
    cam = bpy.data.objects.new("Cam_Persecucion", cd)
    cam.location = sp + Vector((-math.cos(yaw) * 2.2, -math.sin(yaw) * 2.2, 0.9))
    c = cam.constraints.new('TRACK_TO')
    c.target = tgt
    c.track_axis = 'TRACK_NEGATIVE_Z'
    c.up_axis = 'UP_Y'
    col.objects.link(cam)
    fd = bpy.data.cameras.new("Cam_FPV")
    fd.lens = 14
    fd.clip_start = 0.01
    fpv = bpy.data.objects.new("Cam_FPV", fd)
    fpv.parent = drone
    fpv.location = (0.06, 0, 0.018)
    fpv.rotation_euler = (math.radians(100), 0, math.radians(-90))     # mira adelante, 10° hacia arriba
    col.objects.link(fpv)
    gt = bpy.data.objects.new("Cam_General_Objetivo", None)
    gt.location = (3, 1, 0.5)
    col.objects.link(gt)
    gd = bpy.data.cameras.new("Cam_General")
    gd.lens = 16
    gen = bpy.data.objects.new("Cam_General", gd)
    gen.location = (-17.3, -10.3, 7.4)
    c = gen.constraints.new('TRACK_TO')
    c.target = gt
    c.track_axis = 'TRACK_NEGATIVE_Z'
    c.up_axis = 'UP_Y'
    col.objects.link(gen)
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


def render(path, cam, samples=48):
    sc = bpy.context.scene
    sc.camera = cam
    sc.render.resolution_x, sc.render.resolution_y = 1280, 720
    try:
        sc.eevee.taa_render_samples = samples
    except AttributeError:
        pass
    sc.render.filepath = path
    try:
        bpy.ops.render.render(write_still=True)
        print("RENDER", path)
    except RuntimeError as e:
        print("RENDER_ERROR", e)
    sc.render.resolution_x, sc.render.resolution_y = 1920, 1080


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
    drone = build_drone(c_dron)
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
