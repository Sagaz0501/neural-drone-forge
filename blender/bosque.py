"""
BOSQUE 3D para probar la IA (lo usa prueba_aleatoria.py con el nivel 6 "Bosque").

La física solo conoce troncos (cilindros) y copas, arbustos y rocas (esferas): las MISMAS
piezas que en el entrenamiento (drone_rl/level.py -> forest_level). Aquí se "visten":
  - troncos con corteza y ramas, copas con bultos y colores (verdes y algunos otoñales),
    pinos en capas, árboles jóvenes, arbustos con flores y rocas con musgo
  - suelo de pasto y tierra, con pasto y flores repartidos por Geometry Nodes (no chocan:
    miden menos de 40 cm y el dron vuela a 1-2 m)
  - cielo, sol de tarde y neblina: la luz se ve entre los árboles
Para que parezca un bosque y no un claro, además del "núcleo" (lo que vio el entrenamiento)
hay un cinturón de árboles alrededor (también chocables) y árboles de fondo más allá del
límite de 30 m (solo decorado: ahí el vuelo ya terminó por salir del área).
"""
import math

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector, noise

from escena_lib import node

PAL_HOJAS = [(0.10, 0.30, 0.05), (0.15, 0.38, 0.07), (0.21, 0.42, 0.08), (0.08, 0.25, 0.06),
             (0.27, 0.45, 0.10), (0.12, 0.33, 0.10)]
PAL_OTONO = [(0.72, 0.30, 0.04), (0.82, 0.50, 0.06), (0.55, 0.12, 0.04), (0.78, 0.62, 0.12)]
PAL_JOVEN = [(0.25, 0.50, 0.10), (0.32, 0.55, 0.12), (0.20, 0.46, 0.09)]
PAL_PINO = [(0.035, 0.15, 0.07), (0.045, 0.19, 0.09), (0.03, 0.13, 0.08), (0.06, 0.21, 0.10)]
PAL_FLORES = [(0.95, 0.18, 0.32), (0.95, 0.82, 0.15), (0.55, 0.28, 0.9), (0.95, 0.95, 0.95), (0.95, 0.42, 0.08)]

PLANTAS = "Bosque_Plantas"          # plantillas de pasto y flores (fuera de la escena)


# =====================================================================
# Materiales
# =====================================================================
def _new_mat(name):
    m = bpy.data.materials.get(name)
    if m:
        return m, False
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    return m, True


def _attr(nt, name="Col"):
    a = nt.nodes.new("ShaderNodeAttribute")
    a.attribute_name = name
    return a


def _mix(nt, blend='MIX'):
    """Nodo Mix en modo color. Ojo: tiene varias entradas llamadas "A"/"B" (una por tipo):
    hay que tomar las de tipo color, no por nombre."""
    m = nt.nodes.new("ShaderNodeMix")
    m.data_type = 'RGBA'
    m.blend_type = blend
    a, b = [s for s in m.inputs if s.type == 'RGBA'][:2]
    out = [s for s in m.outputs if s.type == 'RGBA'][0]
    return m.inputs[0], a, b, out


def mat_corteza():
    m, new = _new_mat("Bosque_Corteza")
    if not new:
        return m
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    b.inputs["Roughness"].default_value = 0.92
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (9.0, 9.0, 0.9)              # vetas verticales
    n1 = node(nt, "ShaderNodeTexNoise", Scale=4.0, Detail=8.0, Roughness=0.65)
    cr = nt.nodes.new("ShaderNodeValToRGB")
    cr.color_ramp.elements[0].color = (0.035, 0.022, 0.014, 1)
    cr.color_ramp.elements[1].color = (0.20, 0.14, 0.09, 1)
    bump = node(nt, "ShaderNodeBump", Strength=0.6)
    L = nt.links.new
    L(tc.outputs["Object"], mp.inputs["Vector"])
    L(mp.outputs["Vector"], n1.inputs["Vector"])
    L(n1.outputs["Fac"], cr.inputs["Fac"])
    L(cr.outputs["Color"], b.inputs["Base Color"])
    L(n1.outputs["Fac"], bump.inputs["Height"])
    L(bump.outputs["Normal"], b.inputs["Normal"])
    m.diffuse_color = (0.12, 0.08, 0.05, 1)
    return m


def mat_follaje(name, bump_scale=9.0, translucent=0.3):
    """Hojas: color por árbol (atributo "Col") + manchas + bultos + algo de luz que atraviesa."""
    m, new = _new_mat(name)
    if not new:
        return m
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    b.inputs["Roughness"].default_value = 0.7
    out = nt.nodes["Material Output"]
    col = _attr(nt)
    tc = nt.nodes.new("ShaderNodeTexCoord")
    n1 = node(nt, "ShaderNodeTexNoise", Scale=1.6, Detail=4.0)
    cr = nt.nodes.new("ShaderNodeValToRGB")                          # manchas más claras/oscuras
    cr.color_ramp.elements[0].color = (0.55, 0.55, 0.55, 1)
    cr.color_ramp.elements[1].color = (1.35, 1.35, 1.35, 1)
    fac, ma, mbb, mout = _mix(nt, 'MULTIPLY')
    fac.default_value = 1.0
    vor = node(nt, "ShaderNodeTexVoronoi", Scale=bump_scale)        # racimos de hojas
    bump = node(nt, "ShaderNodeBump", Strength=0.75)
    tr = nt.nodes.new("ShaderNodeBsdfTranslucent")
    mix = nt.nodes.new("ShaderNodeMixShader")
    mix.inputs["Fac"].default_value = translucent
    L = nt.links.new
    L(tc.outputs["Object"], n1.inputs["Vector"])
    L(tc.outputs["Object"], vor.inputs["Vector"])
    L(n1.outputs["Fac"], cr.inputs["Fac"])
    L(col.outputs["Color"], ma)
    L(cr.outputs["Color"], mbb)
    L(mout, b.inputs["Base Color"])
    L(mout, tr.inputs["Color"])
    L(vor.outputs["Distance"], bump.inputs["Height"])
    L(bump.outputs["Normal"], b.inputs["Normal"])
    L(bump.outputs["Normal"], tr.inputs["Normal"])
    L(b.outputs[0], mix.inputs[1])
    L(tr.outputs[0], mix.inputs[2])
    L(mix.outputs[0], out.inputs["Surface"])
    m.diffuse_color = (0.12, 0.32, 0.08, 1)
    return m


def mat_roca():
    m, new = _new_mat("Bosque_Roca")
    if not new:
        return m
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    b.inputs["Roughness"].default_value = 0.85
    tc = nt.nodes.new("ShaderNodeTexCoord")
    n1 = node(nt, "ShaderNodeTexNoise", Scale=3.0, Detail=10.0)
    cr = nt.nodes.new("ShaderNodeValToRGB")
    cr.color_ramp.elements[0].color = (0.12, 0.12, 0.11, 1)
    cr.color_ramp.elements[1].color = (0.42, 0.41, 0.38, 1)
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    musgo = nt.nodes.new("ShaderNodeValToRGB")                      # musgo arriba (normal hacia el cielo)
    musgo.color_ramp.elements[0].position = 0.45
    musgo.color_ramp.elements[0].color = (0, 0, 0, 1)
    musgo.color_ramp.elements[1].position = 0.8
    musgo.color_ramp.elements[1].color = (1, 1, 1, 1)
    fac, ma, mbb, mout = _mix(nt)
    mbb.default_value = (0.09, 0.2, 0.04, 1)
    bump = node(nt, "ShaderNodeBump", Strength=0.5)
    L = nt.links.new
    L(tc.outputs["Object"], n1.inputs["Vector"])
    L(n1.outputs["Fac"], cr.inputs["Fac"])
    L(geo.outputs["Normal"], sep.inputs["Vector"])
    L(sep.outputs["Z"], musgo.inputs["Fac"])
    L(musgo.outputs["Color"], fac)
    L(cr.outputs["Color"], ma)
    L(mout, b.inputs["Base Color"])
    L(n1.outputs["Fac"], bump.inputs["Height"])
    L(bump.outputs["Normal"], b.inputs["Normal"])
    m.diffuse_color = (0.3, 0.3, 0.28, 1)
    return m


def mat_suelo():
    """Pasto con manchas de tierra y hojas secas."""
    m, new = _new_mat("Bosque_Suelo")
    if not new:
        return m
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    b.inputs["Roughness"].default_value = 0.95
    tc = nt.nodes.new("ShaderNodeTexCoord")
    big = node(nt, "ShaderNodeTexNoise", Scale=0.07, Detail=3.0)    # manchas grandes: pasto / tierra
    small = node(nt, "ShaderNodeTexNoise", Scale=2.5, Detail=8.0)
    pasto = nt.nodes.new("ShaderNodeValToRGB")
    pasto.color_ramp.elements[0].color = (0.05, 0.12, 0.02, 1)
    pasto.color_ramp.elements[1].color = (0.16, 0.27, 0.05, 1)
    tierra = nt.nodes.new("ShaderNodeValToRGB")
    tierra.color_ramp.elements[0].color = (0.07, 0.045, 0.025, 1)
    tierra.color_ramp.elements[1].color = (0.22, 0.13, 0.05, 1)    # hojas secas
    sel = nt.nodes.new("ShaderNodeValToRGB")
    sel.color_ramp.elements[0].position = 0.47
    sel.color_ramp.elements[1].position = 0.62
    fac, ma, mbb, mout = _mix(nt)
    bump = node(nt, "ShaderNodeBump", Strength=0.35)
    L = nt.links.new
    L(tc.outputs["Object"], big.inputs["Vector"])
    L(tc.outputs["Object"], small.inputs["Vector"])
    L(small.outputs["Fac"], pasto.inputs["Fac"])
    L(small.outputs["Fac"], tierra.inputs["Fac"])
    L(big.outputs["Fac"], sel.inputs["Fac"])
    L(sel.outputs["Color"], fac)
    L(pasto.outputs["Color"], ma)
    L(tierra.outputs["Color"], mbb)
    L(mout, b.inputs["Base Color"])
    L(small.outputs["Fac"], bump.inputs["Height"])
    L(bump.outputs["Normal"], b.inputs["Normal"])
    m.diffuse_color = (0.1, 0.18, 0.04, 1)
    return m


def mat_planta():
    """Pasto y tallos: degradado del atributo "Col" (oscuro abajo, claro arriba) x variación por planta."""
    m, new = _new_mat("Bosque_Pasto")
    if not new:
        return m
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    b.inputs["Roughness"].default_value = 0.6
    col = _attr(nt)
    oi = nt.nodes.new("ShaderNodeObjectInfo")
    cr = nt.nodes.new("ShaderNodeValToRGB")
    cr.color_ramp.elements[0].color = (0.75, 0.8, 0.55, 1)
    cr.color_ramp.elements[1].color = (1.25, 1.15, 0.8, 1)
    fac, ma, mbb, mout = _mix(nt, 'MULTIPLY')
    fac.default_value = 1.0
    L = nt.links.new
    L(oi.outputs["Random"], cr.inputs["Fac"])
    L(col.outputs["Color"], ma)
    L(cr.outputs["Color"], mbb)
    L(mout, b.inputs["Base Color"])
    m.diffuse_color = (0.15, 0.3, 0.06, 1)
    return m


def mat_flor():
    m, new = _new_mat("Bosque_Flor")
    if not new:
        return m
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    b.inputs["Roughness"].default_value = 0.5
    oi = nt.nodes.new("ShaderNodeObjectInfo")
    cr = nt.nodes.new("ShaderNodeValToRGB")
    cr.color_ramp.interpolation = 'CONSTANT'
    cr.color_ramp.elements[0].color = (*PAL_FLORES[0], 1)
    cr.color_ramp.elements[1].position = 0.2
    cr.color_ramp.elements[1].color = (*PAL_FLORES[1], 1)
    for k, c in enumerate(PAL_FLORES[2:], 2):
        e = cr.color_ramp.elements.new(0.2 * k)
        e.color = (*c, 1)
    L = nt.links.new
    L(oi.outputs["Random"], cr.inputs["Fac"])
    L(cr.outputs["Color"], b.inputs["Base Color"])
    L(cr.outputs["Color"], b.inputs["Emission Color"])
    b.inputs["Emission Strength"].default_value = 0.15
    m.diffuse_color = (0.9, 0.4, 0.5, 1)
    return m


def mat_flor_arbusto():
    m, new = _new_mat("Bosque_Flor_Arbusto")
    if not new:
        return m
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    b.inputs["Roughness"].default_value = 0.45
    col = _attr(nt)
    nt.links.new(col.outputs["Color"], b.inputs["Base Color"])
    nt.links.new(col.outputs["Color"], b.inputs["Emission Color"])
    b.inputs["Emission Strength"].default_value = 0.2
    return m


def materials():
    return {"corteza": mat_corteza(), "hojas": mat_follaje("Bosque_Hojas"),
            "pino": mat_follaje("Bosque_Pino", bump_scale=16.0, translucent=0.15), "roca": mat_roca(),
            "suelo": mat_suelo(), "planta": mat_planta(), "flor": mat_flor(), "flor_arbusto": mat_flor_arbusto()}


# =====================================================================
# Constructor de mallas grandes (cientos de árboles en pocos objetos = rápido en el viewport)
# =====================================================================
class Malla:
    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.col = self.bm.verts.layers.float_color.new("Col")

    def _paint(self, verts, rgb, var=0.0, seed=0.0):
        for v in verts:
            k = 1.0 + var * noise.noise(v.co * 0.9 + Vector((seed, seed * 0.7, 0)))
            v[self.col] = (rgb[0] * k, rgb[1] * k, rgb[2] * k, 1.0)

    def blob(self, c, r, rgb, detail=3, seed=0.0, amp=0.09, squash=1.0, var=0.12):
        """Copa / arbusto: esfera con bultos (ruido), del tamaño de la esfera de colisión."""
        c = Vector(c)
        vs = bmesh.ops.create_icosphere(self.bm, subdivisions=detail, radius=r,
                                        matrix=Matrix.Translation(c))["verts"]
        off = Vector((seed * 3.1, seed * 1.7, seed * 2.3))
        for v in vs:
            d = v.co - c
            n = d.normalized()
            q = n * 1.4 + off
            k = 1.0 + amp * noise.noise(q) + amp * 0.5 * noise.noise(q * 2.7)
            v.co = c + Vector((d.x * k, d.y * k, d.z * k * squash))
        self._paint(vs, rgb, var, seed)
        for f in {f for v in vs for f in v.link_faces}:
            f.smooth = True
        return vs

    def cone(self, base_c, r, h, rgb, segs=9, seed=0.0, jag=True):
        """Capa de pino: cono con la orilla dentada y caída (puntas de ramas)."""
        c = Vector(base_c) + Vector((0, 0, h / 2))
        res = bmesh.ops.create_cone(self.bm, cap_ends=True, cap_tris=True, segments=segs, radius1=r, radius2=0.0,
                                    depth=h, matrix=Matrix.Translation(c) @ Matrix.Rotation(seed, 4, 'Z'))
        vs = res["verts"]
        if jag:
            for i, v in enumerate(sorted((v for v in vs if v.co.z < c.z - h * 0.45), key=lambda v: math.atan2(
                    v.co.y - c.y, v.co.x - c.x))):
                d = Vector((v.co.x - base_c[0], v.co.y - base_c[1], 0))
                if d.length > r * 0.5:
                    k = 1.0 if i % 2 == 0 else 0.8
                    v.co = Vector((base_c[0], base_c[1], base_c[2])) + d * k - Vector((0, 0, r * 0.12 * k))
        self._paint(vs, rgb, 0.08, seed)
        return vs

    def trunk(self, x, y, r, h, rgb=(1, 1, 1), top=0.55, segs=10, roots=True):
        vs = bmesh.ops.create_cone(self.bm, cap_ends=True, cap_tris=False, segments=segs, radius1=r * 1.05,
                                   radius2=r * top, depth=h, matrix=Matrix.Translation((x, y, h / 2)))["verts"]
        if roots and r > 0.12:
            vs += bmesh.ops.create_cone(self.bm, cap_ends=False, cap_tris=False, segments=segs, radius1=r * 1.55,
                                        radius2=r * 1.02, depth=0.4, matrix=Matrix.Translation((x, y, 0.2)))["verts"]
        self._paint(vs, rgb)
        for f in {f for v in vs for f in v.link_faces}:
            f.smooth = True

    def branch(self, a, b, r):
        a, b = Vector(a), Vector(b)
        d = b - a
        rot = d.to_track_quat('Z', 'Y').to_matrix().to_4x4()
        vs = bmesh.ops.create_cone(self.bm, cap_ends=False, cap_tris=False, segments=6, radius1=r, radius2=r * 0.4,
                                   depth=d.length, matrix=Matrix.Translation((a + b) / 2) @ rot)["verts"]
        self._paint(vs, (1, 1, 1))

    def obj(self, col, material):
        me = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(me)
        self.bm.free()
        me.materials.append(material)
        o = bpy.data.objects.new(self.name, me)
        col.objects.link(o)
        return o


# =====================================================================
# Árboles
# =====================================================================
def _pick(pal, u):
    return pal[int(u * 997) % len(pal)]


def dress_tree(t, mallas, detail=3):
    """Dibuja un árbol del generador (drone_rl/level.py) con sus piezas EXACTAS de colisión."""
    x, y, u = t["x"], t["y"], t["color"]
    seed = (x * 0.37 + y * 0.61) % 10
    tipo = t["tipo"]
    if tipo in ("arbol", "joven"):
        if tipo == "joven":
            rgb = _pick(PAL_JOVEN, u)
        else:
            rgb = _pick(PAL_OTONO, u * 5) if u < 0.17 else _pick(PAL_HOJAS, u)
        if t["tronco"]:
            r, h = t["tronco"]
            mallas["troncos"].trunk(x, y, r, h, top=0.5 if tipo == "arbol" else 0.6, roots=tipo == "arbol")
            if tipo == "arbol":                                      # 2-3 ramas hacia la copa
                cx, cy, cz, cr = t["copas"][0]
                z0 = cz - cr * 0.55
                for k in range(3):
                    a = seed * 2 + k * 2.1
                    mallas["troncos"].branch((x, y, z0), (x + math.cos(a) * cr * 0.7, y + math.sin(a) * cr * 0.7,
                                                          z0 + cr * 0.6), r * 0.45)
        for k, (cx, cy, cz, cr) in enumerate(t["copas"]):
            mallas["hojas"].blob((cx, cy, cz), cr, rgb, detail=detail if tipo == "arbol" else max(detail - 1, 1),
                                 seed=seed + k * 1.3)
    elif tipo == "pino":
        r, h = t["tronco"]
        mallas["troncos"].trunk(x, y, r, h + 0.6, top=0.25)
        rgb = _pick(PAL_PINO, u)
        for k, (cx, cy, cz, cr) in enumerate(t["copas"]):
            mallas["pinos"].cone((cx, cy, cz - cr * 0.5), cr, cr * 1.55, rgb, segs=9 if detail >= 2 else 7,
                                 seed=seed + k)
        cx, cy, cz, cr = t["copas"][-1]
        mallas["pinos"].cone((cx, cy, cz + cr * 0.6), cr * 0.45, cr * 1.4, rgb, segs=7, seed=seed, jag=False)
    elif tipo == "arbusto":
        cx, cy, cz, cr = t["copas"][0]
        rgb = _pick(PAL_HOJAS, u * 3)
        mallas["hojas"].blob((cx, cy, cz), cr, (rgb[0] * 0.8, rgb[1] * 0.85, rgb[2] * 0.8), detail=max(detail - 1, 1),
                             seed=seed, amp=0.14)
        if u < 0.45 and detail >= 2:                                  # arbustos con flores
            fc = _pick(PAL_FLORES, u * 7)
            for k in range(14):
                th = (seed + k * 2.39) % (2 * math.pi)
                ph = 0.25 + (k * 0.37 % 1.0) * 0.9
                p = Vector((cx + cr * math.sin(ph) * math.cos(th), cy + cr * math.sin(ph) * math.sin(th),
                            cz + cr * math.cos(ph)))
                vs = bmesh.ops.create_icosphere(mallas["flores"].bm, subdivisions=1, radius=0.045,
                                                matrix=Matrix.Translation(p))["verts"]
                mallas["flores"]._paint(vs, fc)
    else:                                                             # roca
        cx, cy, cz, cr = t["copas"][0]
        g = 0.85 + 0.3 * u
        mallas["rocas"].blob((cx, cy, cz), cr, (g, g, g), detail=2, seed=seed, amp=0.22, squash=0.8, var=0.0)


def collision_proxies(trees, col):
    """Piezas de colisión (ocultas): las lee el Piloto IA para armar el nivel que vuela."""
    sph = bpy.data.meshes.get("Bosque_COL_Esfera")
    if sph is None:
        sph = bpy.data.meshes.new("Bosque_COL_Esfera")
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=1, radius=1.0)
        bm.to_mesh(sph)
        bm.free()
    cyl = bpy.data.meshes.get("Bosque_COL_Cil")
    if cyl is None:
        cyl = bpy.data.meshes.new("Bosque_COL_Cil")
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=8, radius1=1.0, radius2=1.0, depth=1.0,
                              matrix=Matrix.Translation((0, 0, 0.5)))
        bm.to_mesh(cyl)
        bm.free()
    n = 0
    for i, t in enumerate(trees):
        if t["tronco"]:
            r, h = t["tronco"]
            o = bpy.data.objects.new(f"COL_tronco_{i:03d}", cyl)
            o.location = (t["x"], t["y"], 0.0)
            o.scale = (r, r, h)
            o["forma"] = "cilindro"
            col.objects.link(o)
            n += 1
        for k, (cx, cy, cz, cr) in enumerate(t["copas"]):
            o = bpy.data.objects.new(f"COL_copa_{i:03d}_{k}", sph)
            o.location = (cx, cy, cz)
            o.scale = (cr, cr, cr)
            o["forma"] = "esfera"
            col.objects.link(o)
            n += 1
    for o in col.objects:
        o.display_type = 'WIRE'
        o.hide_render = True
    return n


def belt_trees(rng, lv, core, density, reach=26.0):
    """Árboles alrededor del núcleo (chocables también), para que se sienta un bosque."""
    from drone_rl.level import random_forest
    pts = np.array([lv.spawn] + list(lv.goals))
    lo, hi = pts[:, :2].min(axis=0) - 6.0, pts[:, :2].max(axis=0) + 6.0      # el núcleo del entrenamiento
    extra = random_forest(rng, lv.spawn, lv.goals, density, margin=reach)
    cxy = np.array([[t["x"], t["y"]] for t in core]).reshape(-1, 2)
    spacing = 2.8 / math.sqrt(max(density, 0.2))
    out = []
    for t in extra:
        p = np.array([t["x"], t["y"]])
        if np.all((p > lo) & (p < hi)):
            continue
        if abs(p[0]) > 28.5 or abs(p[1]) > 28.5:
            continue
        if len(cxy) and np.min(np.linalg.norm(cxy - p, axis=1)) < spacing * 0.85:
            continue
        out.append(t)
    return out


def backdrop_trees(rng, center, r0=31.0, r1=58.0, spacing=5.0):
    """Árboles de fondo (más allá del límite de 30 m: solo decorado)."""
    from drone_rl.level import _make_tree
    trees, xy = [], []
    n_target = int(math.pi * (r1 ** 2 - r0 ** 2) / spacing ** 2 * 0.7)
    for _ in range(n_target * 6):
        if len(trees) >= n_target:
            break
        a, r = rng.uniform(-math.pi, math.pi), math.sqrt(rng.uniform(r0 ** 2, r1 ** 2))
        p = np.array([center[0] + r * math.cos(a), center[1] + r * math.sin(a)])
        if xy and np.min(np.linalg.norm(np.array(xy) - p, axis=1)) < spacing * 0.85:
            continue
        kind = "pino" if rng.random() < 0.45 else "arbol"
        t = _make_tree(rng, kind, *p)
        trees.append(t)
        xy.append(p)
    return trees


# =====================================================================
# Pasto y flores (Geometry Nodes)
# =====================================================================
def _tuft(name, rng, blades=7, h=(0.16, 0.36)):
    bm = bmesh.new()
    col = bm.verts.layers.float_color.new("Col")
    dark, light = (0.04, 0.10, 0.02, 1), (0.22, 0.42, 0.07, 1)
    for _ in range(blades):
        a = rng.uniform(0, 2 * math.pi)
        lean = rng.uniform(0.15, 0.6)
        hh = rng.uniform(*h)
        bx, by = rng.uniform(-0.04, 0.04, 2)
        w = rng.uniform(0.012, 0.022)
        px, py = -math.sin(a) * w, math.cos(a) * w
        tip = (bx + math.cos(a) * hh * lean, by + math.sin(a) * hh * lean, hh)
        v1 = bm.verts.new((bx - px, by - py, 0))
        v2 = bm.verts.new((bx + px, by + py, 0))
        v3 = bm.verts.new(tip)
        v1[col] = v2[col] = dark
        v3[col] = light
        bm.faces.new((v1, v2, v3))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return me


def _flower(name):
    bm = bmesh.new()
    col = bm.verts.layers.float_color.new("Col")
    vs = [bm.verts.new(p) for p in ((-0.006, 0, 0), (0.006, 0, 0), (0.004, 0, 0.26), (-0.004, 0, 0.26))]
    for v in vs:
        v[col] = (0.08, 0.2, 0.04, 1)
    bm.faces.new(vs)
    head = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=0.032, matrix=Matrix.Translation((0, 0, 0.27)))["verts"]
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return me, len(head)


def plant_templates(mats):
    """Plantillas (fuera de la escena): 3 matas de pasto + 1 flor. Geometry Nodes las copia miles de veces."""
    col = bpy.data.collections.get(PLANTAS)
    if col and len(col.objects) >= 4:
        return col
    if col is None:
        col = bpy.data.collections.new(PLANTAS)
        col.use_fake_user = True                     # no está en la escena: que no se borre al guardar
    rng = np.random.default_rng(3)
    for k in range(3):
        me = _tuft(f"Plantilla_pasto_{k}", rng)
        me.materials.append(mats["planta"])
        col.objects.link(bpy.data.objects.new(f"Plantilla_pasto_{k}", me))
    me, _ = _flower("Plantilla_flor")
    me.materials.append(mats["planta"])
    me.materials.append(mats["flor"])
    for p in me.polygons:
        p.material_index = 0 if p.index == 0 else 1
    fo = bpy.data.objects.new("Plantilla_flor", me)
    col.objects.link(fo)
    return col


def _out(n, kind):
    """La salida 'Value' del tipo de dato activo (RandomValue tiene una por tipo)."""
    want = {"FLOAT": "VALUE", "INT": "INT", "FLOAT_VECTOR": "VECTOR"}[kind]
    for s in n.outputs:
        if s.type == want and s.enabled:
            return s
    return n.outputs[0]


def _ins(n, kind):
    want = {"FLOAT": "VALUE", "INT": "INT", "FLOAT_VECTOR": "VECTOR"}[kind]
    return [s for s in n.inputs if s.type == want and s.enabled]


def scatter_group(plants):
    """Nodo de Geometry Nodes: reparte pasto (y algunas flores) sobre el suelo."""
    ng = bpy.data.node_groups.get("Bosque_Pasto")
    if ng:
        return ng
    ng = bpy.data.node_groups.new("Bosque_Pasto", 'GeometryNodeTree')
    ng.interface.new_socket("Geometry", in_out='INPUT', socket_type='NodeSocketGeometry')
    ng.interface.new_socket("Geometry", in_out='OUTPUT', socket_type='NodeSocketGeometry')
    N, L = ng.nodes.new, ng.links.new
    gi, go = N("NodeGroupInput"), N("NodeGroupOutput")
    join = N("GeometryNodeJoinGeometry")
    L(gi.outputs[0], join.inputs[0])
    dens = N("GeometryNodeInputNamedAttribute")
    dens.data_type = 'FLOAT'
    dens.inputs["Name"].default_value = "densidad"
    pasto = [o for o in plants.objects if o.name.startswith("Plantilla_pasto")]
    flor = [o for o in plants.objects if o.name.startswith("Plantilla_flor")]
    for objs, density, smin, smax, seed in ((pasto, 4.0, 0.7, 1.5, 1), (flor, 0.25, 0.8, 1.3, 2)):
        dist = N("GeometryNodeDistributePointsOnFaces")
        dist.distribute_method = 'RANDOM'
        dist.inputs["Density"].default_value = density
        dist.inputs["Seed"].default_value = seed
        L(gi.outputs[0], dist.inputs["Mesh"])
        L(dens.outputs["Attribute"], dist.inputs["Density Factor"])
        iop = N("GeometryNodeInstanceOnPoints")
        L(dist.outputs["Points"], iop.inputs["Points"])
        if len(objs) == 1:
            oi = N("GeometryNodeObjectInfo")
            oi.inputs["Object"].default_value = objs[0]
            L(oi.outputs["Geometry"], iop.inputs["Instance"])
        else:
            sub = bpy.data.collections.get(PLANTAS + "_pasto") or bpy.data.collections.new(PLANTAS + "_pasto")
            for o in objs:
                if o.name not in sub.objects:
                    sub.objects.link(o)
            ci = N("GeometryNodeCollectionInfo")
            ci.inputs["Collection"].default_value = sub
            ci.inputs["Separate Children"].default_value = True
            ci.inputs["Reset Children"].default_value = True
            L(ci.outputs[0], iop.inputs["Instance"])
            iop.inputs["Pick Instance"].default_value = True
            ri = N("FunctionNodeRandomValue")
            ri.data_type = 'INT'
            mn, mx = _ins(ri, "INT")[:2]
            mn.default_value, mx.default_value = 0, len(objs) - 1
            ri.inputs["Seed"].default_value = seed + 10
            L(_out(ri, "INT"), iop.inputs["Instance Index"])
        rr = N("FunctionNodeRandomValue")
        rr.data_type = 'FLOAT_VECTOR'
        mn, mx = _ins(rr, "FLOAT_VECTOR")[:2]
        mn.default_value, mx.default_value = (-0.12, -0.12, 0.0), (0.12, 0.12, 6.283)
        rr.inputs["Seed"].default_value = seed + 20
        L(_out(rr, "FLOAT_VECTOR"), iop.inputs["Rotation"])
        rs = N("FunctionNodeRandomValue")
        rs.data_type = 'FLOAT'
        mn, mx = _ins(rs, "FLOAT")[:2]
        mn.default_value, mx.default_value = smin, smax
        rs.inputs["Seed"].default_value = seed + 30
        L(_out(rs, "FLOAT"), iop.inputs["Scale"])
        L(iop.outputs["Instances"], join.inputs[0])
    L(join.outputs[0], go.inputs[0])
    return ng


def ground(col, mats, center, clear_spots, size=150.0, res=75):
    """Suelo grande con el atributo 'densidad' (dónde crece pasto: no sobre las plataformas)."""
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=res, y_segments=res, size=size / 2,
                          matrix=Matrix.Translation((center[0], center[1], 0)))
    me = bpy.data.meshes.new("Bosque_Suelo")
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mats["suelo"])
    att = me.attributes.new("densidad", 'FLOAT', 'POINT')
    for v, a in zip(me.vertices, att.data):
        p = v.co
        dc = math.hypot(p.x - center[0], p.y - center[1])
        k = 1.0 if dc < 30 else max(0.0, 1.0 - (dc - 30) / 12)          # lejos: sin pasto (no se ve)
        for sx, sy, r in clear_spots:
            if math.hypot(p.x - sx, p.y - sy) < r:
                k = 0.0
        a.value = k
    o = bpy.data.objects.new("Bosque_Suelo", me)
    col.objects.link(o)
    return o


# =====================================================================
# Cielo, sol y neblina
# =====================================================================
def world_and_light(sc, col, sun_az):
    w = bpy.data.worlds.get("Bosque_Cielo") or bpy.data.worlds.new("Bosque_Cielo")
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    cr = nt.nodes.new("ShaderNodeValToRGB")                           # horizon -> cenit
    cr.color_ramp.elements[0].position = 0.46
    cr.color_ramp.elements[0].color = (0.62, 0.68, 0.70, 1)
    cr.color_ramp.elements[1].position = 0.85
    cr.color_ramp.elements[1].color = (0.16, 0.32, 0.70, 1)
    e = cr.color_ramp.elements.new(0.40)
    e.color = (0.12, 0.14, 0.10, 1)                                   # bajo el horizonte
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.inputs["From Min"].default_value = -1.0
    mr.inputs["From Max"].default_value = 1.0
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs["Strength"].default_value = 1.1
    vol = nt.nodes.new("ShaderNodeVolumePrincipled")                  # neblina del bosque
    vol.inputs["Density"].default_value = 0.012
    vol.inputs["Anisotropy"].default_value = 0.55
    vol.inputs["Color"].default_value = (0.85, 0.9, 0.95, 1)
    out = nt.nodes.new("ShaderNodeOutputWorld")
    L = nt.links.new
    L(tc.outputs["Generated"], sep.inputs["Vector"])
    L(sep.outputs["Z"], mr.inputs["Value"])
    L(mr.outputs["Result"], cr.inputs["Fac"])
    L(cr.outputs["Color"], bg.inputs["Color"])
    L(bg.outputs[0], out.inputs["Surface"])
    L(vol.outputs[0], out.inputs["Volume"])
    sc.world = w

    sd = bpy.data.lights.new("Sol", 'SUN')
    sd.energy = 4.5
    sd.angle = math.radians(1.2)
    sd.color = (1.0, 0.88, 0.70)
    sun = bpy.data.objects.new("Sol", sd)
    sun.rotation_euler = (math.radians(58), 0, sun_az)                 # sol de tarde (32° sobre el horizonte)
    col.objects.link(sun)
    ee = sc.eevee
    for attr, val in (("use_volumetric_shadows", True), ("volumetric_end", 70.0), ("volumetric_tile_size", '8'),
                      ("volumetric_samples", 48), ("use_raytracing", True), ("taa_samples", 12),
                      ("volumetric_shadow_samples", 16)):
        try:
            setattr(ee, attr, val)
        except (AttributeError, TypeError):
            pass
    return sun


# =====================================================================
# Todo junto
# =====================================================================
def build(sc, lv, core, cols, seed, density):
    """Viste el nivel: núcleo (el del entrenamiento) + cinturón + fondo. Devuelve los árboles chocables."""
    rng = np.random.default_rng(seed + 101)
    mats = materials()
    pts = np.array([lv.spawn] + list(lv.goals))
    center = pts.mean(axis=0)
    belt = belt_trees(rng, lv, core, density)
    fondo = backdrop_trees(rng, center)
    mallas = {k: Malla(f"Bosque_{k.capitalize()}") for k in ("troncos", "hojas", "pinos", "rocas", "flores")}
    for t in core:
        dress_tree(t, mallas, detail=3)
    for t in belt:
        d = math.hypot(t["x"] - center[0], t["y"] - center[1])
        dress_tree(t, mallas, detail=3 if d < 16 else 2)
    for t in fondo:
        dress_tree(t, mallas, detail=1)
    col = cols["Prueba_Escenario"]
    for k, m in (("troncos", "corteza"), ("hojas", "hojas"), ("pinos", "pino"), ("rocas", "roca"),
                 ("flores", "flor_arbusto")):
        mallas[k].obj(col, mats[m])
    chocables = core + belt
    n_col = collision_proxies(chocables, cols["Colisiones"])
    spots = [(lv.spawn[0], lv.spawn[1], 1.0), (lv.goals[-1][0], lv.goals[-1][1], 1.1)]
    g = ground(col, mats, center, spots)
    plants = plant_templates(mats)
    mod = g.modifiers.new("Pasto", 'NODES')
    mod.node_group = scatter_group(plants)
    sun_az = math.atan2(*(pts[-1][:2] - pts[0][:2])[::-1]) + math.radians(120)
    world_and_light(sc, cols["Camaras_Luces"], sun_az)
    return {"chocables": chocables, "fondo": len(fondo), "piezas": n_col}
