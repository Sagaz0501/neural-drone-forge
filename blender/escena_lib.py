"""
Piezas de escena compartidas por blender/build_bodega.py y blender/prueba_aleatoria.py:
materiales, constructor de mallas (MB), el dron del proyecto, pallets, montacargas y cámaras.
Todo en metros.
"""
import math
import random

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

RNG = random.Random(7)


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
        # el padre es un objeto de nivel superior recién creado: su matrix_world aún no está
        # calculada, así que usamos su transformación directa
        child.parent = parent
        child.matrix_parent_inverse = parent.matrix_basis.inverted()
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


M = {}


def _materials_alive():
    try:
        return bool(M) and all(m.name in bpy.data.materials for m in M.values())
    except ReferenceError:                     # el archivo se recargó: referencias viejas
        return False


def materials():
    """Crea los materiales una sola vez (llamarla de nuevo no los duplica)."""
    if _materials_alive():
        return
    M.clear()
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


def pallet_with_boxes(mb, x, y, z, w, dpt, max_h, rng=None):
    """Un pallet de madera con cajas encima. Devuelve la altura usada."""
    rng = rng or RNG
    mb.box((x - w / 2, y - dpt / 2, z), (x + w / 2, y + dpt / 2, z + 0.14), M["madera"])
    top = z + 0.14
    hmax = max_h - 0.14
    if hmax < 0.25:
        return 0.14
    style = rng.random()
    if style < 0.35:                                    # una caja grande
        hh = rng.uniform(0.5, hmax)
        mb.box((x - w / 2 + 0.03, y - dpt / 2 + 0.03, top), (x + w / 2 - 0.03, y + dpt / 2 - 0.03, top + hh),
               rng.choice([M["carton1"], M["carton2"], M["blanco"]]))
        return 0.14 + hh
    n = 2 if style < 0.75 else 3                        # grilla de cajas
    used = 0
    for i in range(n):
        for j in range(2):
            hh = rng.uniform(0.25, min(hmax, 0.9))
            cx = x - w / 2 + (i + 0.5) * w / n
            cy = y - dpt / 2 + (j + 0.5) * dpt / 2
            mb.cube((cx, cy, top + hh / 2), (w / n - 0.04, dpt / 2 - 0.04, hh),
                    rng.choice([M["carton1"], M["carton2"], M["carton3"]]))
            used = max(used, hh)
    return 0.14 + used



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



def build_drone(col, loc, yaw):
    """El frame de 5" del proyecto, en metros, con hélices que giran (Helice_1..4) y discos de blur."""
    root = bpy.data.objects.new("Dron", None)
    root.empty_display_type = 'ARROWS'
    root.empty_display_size = 0.15
    root.location = loc
    root.rotation_mode = 'XYZ'
    root.rotation_euler = (0, 0, yaw)
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




def build_chase_cameras(col, drone, loc, yaw):
    """Cámara de persecución (sigue al dron, la mueve el piloto) + cámara FPV montada en el dron."""
    tgt = bpy.data.objects.new("Cam_Objetivo", None)
    tgt.location = loc
    tgt.empty_display_size = 0.1
    col.objects.link(tgt)
    cd = bpy.data.cameras.new("Cam_Persecucion")
    cd.lens = 24
    cd.clip_start = 0.02
    cam = bpy.data.objects.new("Cam_Persecucion", cd)
    cam.location = Vector(loc) + Vector((-math.cos(yaw) * 2.2, -math.sin(yaw) * 2.2, 0.9))
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
    return cam, tgt


def general_camera(col, loc, look_at, lens=18):
    gt = bpy.data.objects.new("Cam_General_Objetivo", None)
    gt.location = look_at
    col.objects.link(gt)
    gd = bpy.data.cameras.new("Cam_General")
    gd.lens = lens
    gen = bpy.data.objects.new("Cam_General", gd)
    gen.location = loc
    c = gen.constraints.new('TRACK_TO')
    c.target = gt
    c.track_axis = 'TRACK_NEGATIVE_Z'
    c.up_axis = 'UP_Y'
    col.objects.link(gen)
    return gen


def set_engine(sc):
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
    for size in ('2048', '1024', '512'):
        try:
            sc.eevee.shadow_pool_size = size
            break
        except (AttributeError, TypeError):
            continue
    try:
        sc.view_settings.look = 'AgX - Medium High Contrast'
    except TypeError:
        pass


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


