"""
Ayudas para modelar piezas de electrónica por script (Blender 5.2, sin modelar a mano).
Todo en METROS a escala real: usa mm() para escribir medidas de datasheet.

  materiales: pcb (FR4 + máscara verde/negra), oro ENIG, estaño, plástico negro, blindaje, cobre…
  mallas:     caja (con bisel), cilindro, torno (perfil girado), tira (polilínea plana), tubo (curva con grosor)
  texto:      texto() = letras como malla plana (serigrafía, marcas de chips)
  imagen:     imagen_numpy() = textura dibujada con numpy (pistas, vías) y empacada en el GLB
  salida:     exportar_glb() (sin Draco, Y arriba) y render_preview() (PNG con luz de 3 puntos)
"""
import math
import os
import tempfile

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector


def mm(*v):
    """mm(3) -> 0.003 · mm(1, 2, 3) -> (0.001, 0.002, 0.003)"""
    return v[0] / 1000 if len(v) == 1 else tuple(x / 1000 for x in v)


def limpiar():
    """escena vacía (cada pieza arranca de cero)"""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _MATS.clear()


# ---------------------------------------------------------------- materiales
_MATS = {}


def mat(nombre, color, rough=0.5, metal=0.0, emit=0.0, emit_color=None, alpha=1.0, transmision=0.0, ior=1.45):
    """un Principled BSDF (glTF lo pasa a MeshStandardMaterial). Se reusa por nombre."""
    if nombre in _MATS:
        return _MATS[nombre]
    m = bpy.data.materials.new(nombre)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    b.inputs["IOR"].default_value = ior
    if emit:
        b.inputs["Emission Color"].default_value = (*(emit_color or color), 1)
        b.inputs["Emission Strength"].default_value = emit
    if transmision:
        b.inputs["Transmission Weight"].default_value = transmision
    if alpha < 1:
        b.inputs["Alpha"].default_value = alpha
        m.surface_render_method = "BLENDED"
    m.diffuse_color = (*color, alpha)
    _MATS[nombre] = m
    return m


# colores medidos "a ojo" de fotos (lineales, no sRGB)
def m_mascara(color="negro"):
    c = {"negro": (0.012, 0.013, 0.014), "verde": (0.02, 0.16, 0.05), "azul": (0.01, 0.04, 0.16)}[color]
    return mat(f"mascara_{color}", c, rough=0.35)


def m_oro():         return mat("oro_enig", (0.95, 0.70, 0.33), rough=0.25, metal=1.0)
def m_estano():      return mat("estano", (0.80, 0.80, 0.82), rough=0.22, metal=1.0)
def m_cobre():       return mat("cobre", (0.93, 0.50, 0.33), rough=0.3, metal=1.0)
def m_blindaje():    return mat("blindaje", (0.78, 0.79, 0.80), rough=0.32, metal=1.0)
def m_acero():       return mat("acero", (0.62, 0.63, 0.65), rough=0.28, metal=1.0)
def m_plastico_n():  return mat("plastico_negro", (0.018, 0.018, 0.02), rough=0.55)
def m_epoxi():       return mat("epoxi_chip", (0.025, 0.025, 0.027), rough=0.6)
def m_serigrafia():  return mat("serigrafia", (0.85, 0.85, 0.83), rough=0.7)
def m_grabado():     return mat("grabado_laser", (0.06, 0.06, 0.065), rough=0.85)
def m_ceramica():    return mat("ceramica_cap", (0.42, 0.28, 0.14), rough=0.6)


def m_textura(nombre, imagen, rough=0.35, metal=0.0):
    """material con una imagen como color base (usa las UV de la malla)"""
    m = mat(nombre, (1, 1, 1), rough=rough, metal=metal)
    nt = m.node_tree
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = imagen
    tex.interpolation = "Linear"
    nt.links.new(tex.outputs["Color"], nt.nodes["Principled BSDF"].inputs["Base Color"])
    return m


# ---------------------------------------------------------------- mallas
def _a_objeto(bm, nombre, material, angulo_suave=35, coleccion=None):
    """bmesh -> objeto; caras suaves con aristas filosas por ángulo (los biseles se ven redondos)"""
    lim = math.radians(angulo_suave)
    for f in bm.faces:
        f.smooth = True
    for e in bm.edges:
        if len(e.link_faces) == 2:
            e.smooth = e.calc_face_angle(0) < lim
        else:
            e.smooth = False
    me = bpy.data.meshes.new(nombre)
    bm.to_mesh(me)
    bm.free()
    mats = material if isinstance(material, (list, tuple)) else [material]
    for m in mats:
        if m:
            me.materials.append(m)
    ob = bpy.data.objects.new(nombre, me)
    (coleccion or bpy.context.scene.collection).objects.link(ob)
    return ob


def caja(nombre, tam, pos=(0, 0, 0), material=None, bisel=0.0, seg=1, base=True, rot_z=0.0):
    """caja de tam=(x,y,z) en metros. pos = centro de la BASE si base=True (para cosas apoyadas)"""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(tam), verts=bm.verts)
    if bisel > 0:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=min(bisel, min(tam) * 0.49), segments=seg,
                        profile=0.5, affect="EDGES", clamp_overlap=True)
    ob = _a_objeto(bm, nombre, material)
    ob.location = (pos[0], pos[1], pos[2] + (tam[2] / 2 if base else 0))
    ob.rotation_euler.z = rot_z
    return ob


def cilindro(nombre, r, h, pos=(0, 0, 0), material=None, seg=16, base=True, bisel=0.0, r2=None):
    """cilindro (o cono si r2) vertical; pos = centro de la base si base=True"""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=h)
    if bisel > 0:
        tapas = [e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) < 1e-9]
        bmesh.ops.bevel(bm, geom=tapas, offset=bisel, segments=1, profile=0.5, affect="EDGES", clamp_overlap=True)
    ob = _a_objeto(bm, nombre, material)
    ob.location = (pos[0], pos[1], pos[2] + (h / 2 if base else 0))
    return ob


def torno(nombre, perfil, material=None, seg=24, eje="Z", angulo_suave=40):
    """gira un perfil [(r, z), …] alrededor del eje (r=0 cierra la punta). Mangos, carretes, puntas."""
    bm = bmesh.new()
    anillos = []
    for r, z in perfil:
        if r < 1e-7:
            anillos.append([bm.verts.new((0, 0, z))])
        else:
            anillos.append([bm.verts.new((r * math.cos(2 * math.pi * i / seg), r * math.sin(2 * math.pi * i / seg), z))
                            for i in range(seg)])
    for a, b in zip(anillos, anillos[1:]):
        if len(a) == 1 and len(b) == 1:
            continue
        if len(a) == 1:
            for i in range(seg):
                bm.faces.new((a[0], b[(i + 1) % seg], b[i]))
        elif len(b) == 1:
            for i in range(seg):
                bm.faces.new((a[i], a[(i + 1) % seg], b[0]))
        else:
            for i in range(seg):
                bm.faces.new((a[i], a[(i + 1) % seg], b[(i + 1) % seg], b[i]))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-7)   # perfiles cerrados (último punto = primero)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if eje == "X":
        bmesh.ops.rotate(bm, verts=bm.verts, matrix=Matrix.Rotation(math.pi / 2, 4, "Y"))
    elif eje == "Y":
        bmesh.ops.rotate(bm, verts=bm.verts, matrix=Matrix.Rotation(-math.pi / 2, 4, "X"))
    return _a_objeto(bm, nombre, material, angulo_suave)


def anillo(nombre, r_ext, r_int, alto, pos, material, seg=16, cuadrado=False):
    """pad de agujero pasante: anillo arriba y abajo + el tubo del agujero (metalizado). cuadrado = pin 1"""
    bm = bmesh.new()
    z0, z1 = -alto / 2, alto / 2

    def borde(rr, z, cuad):
        vs = []
        for i in range(seg):
            a = 2 * math.pi * (i + 0.5) / seg
            if cuad:
                k = rr / max(abs(math.cos(a)), abs(math.sin(a)))
                vs.append(bm.verts.new((k * math.cos(a), k * math.sin(a), z)))
            else:
                vs.append(bm.verts.new((rr * math.cos(a), rr * math.sin(a), z)))
        return vs

    ext1, int1 = borde(r_ext, z1, cuadrado), borde(r_int, z1, False)
    ext0, int0 = borde(r_ext, z0, cuadrado), borde(r_int, z0, False)
    for i in range(seg):
        j = (i + 1) % seg
        bm.faces.new((ext1[i], ext1[j], int1[j], int1[i]))       # cara de arriba
        bm.faces.new((ext0[j], ext0[i], int0[i], int0[j]))       # cara de abajo
        bm.faces.new((int1[i], int1[j], int0[j], int0[i]))       # el tubo
        bm.faces.new((ext0[i], ext0[j], ext1[j], ext1[i]))       # canto
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = _a_objeto(bm, nombre, material, 50)
    ob.location = pos
    return ob


def tira(nombre, puntos, ancho, z, material, alto=0.0):
    """una pista plana (polilínea 2D) de cierto ancho: antenas, pistas de cobre"""
    bm = bmesh.new()
    izq, der = [], []
    n = len(puntos)
    for i, p in enumerate(puntos):
        p = Vector((p[0], p[1]))
        a = Vector(puntos[max(i - 1, 0)][:2])
        b = Vector(puntos[min(i + 1, n - 1)][:2])
        d = (b - a).normalized()
        nrm = Vector((-d.y, d.x)) * (ancho / 2)
        izq.append(bm.verts.new((*(p + nrm), z + alto)))
        der.append(bm.verts.new((*(p - nrm), z + alto)))
    for i in range(n - 1):
        bm.faces.new((izq[i], der[i], der[i + 1], izq[i + 1]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:
        if f.normal.z < 0:
            f.normal_flip()
    return _a_objeto(bm, nombre, material, 80)


def tubo(nombre, puntos, radio, material, lados=6, suave=1, cerrado=False):
    """una curva con grosor (cables, resortes, lana de bronce) convertida a malla"""
    cu = bpy.data.curves.new(nombre, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = radio
    cu.bevel_resolution = max(0, (lados - 4) // 2)
    cu.use_fill_caps = True
    sp = cu.splines.new("POLY" if suave == 0 else "NURBS")
    sp.points.add(len(puntos) - 1)
    for p, q in zip(sp.points, puntos):
        p.co = (*q, 1)
    if suave:
        sp.order_u = 3
        sp.use_endpoint_u = True
        sp.resolution_u = suave
    sp.use_cyclic_u = cerrado
    ob = bpy.data.objects.new(nombre + "_curva", cu)
    bpy.context.scene.collection.objects.link(ob)
    return _curva_a_malla(ob, nombre, material)


def _curva_a_malla(ob, nombre, material):
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    me.name = nombre
    data = ob.data
    bpy.data.objects.remove(ob)
    bpy.data.curves.remove(data)
    me.materials.clear()
    if material:
        me.materials.append(material)
    for p in me.polygons:
        p.use_smooth = True
    nuevo = bpy.data.objects.new(nombre, me)
    bpy.context.scene.collection.objects.link(nuevo)
    return nuevo


def texto(nombre, s, alto, pos, material, rot_z=0.0, alinear="CENTER", negrita=False, espacio=1.0):
    """letras como malla plana (alto = altura de la mayúscula en m). Queda acostada sobre XY, mirando +Z"""
    cu = bpy.data.curves.new(nombre, "FONT")
    cu.body = s
    cu.size = alto * 1.4                 # size es la caja del tipo; la mayúscula es ~0,7 de eso
    cu.align_x = alinear
    cu.align_y = "CENTER"
    cu.resolution_u = 2                  # pocas curvas: letras de 1 mm no necesitan más
    cu.space_character = espacio
    cu.fill_mode = "FRONT"
    if negrita:
        cu.offset = alto * 0.04
    ob = bpy.data.objects.new(nombre + "_txt", cu)
    bpy.context.scene.collection.objects.link(ob)
    m = _curva_a_malla(ob, nombre, material)
    m.location = pos
    m.rotation_euler.z = rot_z
    return m


def unir(objs, nombre):
    """junta varios objetos en uno (multi-material): menos nodos en el GLB"""
    objs = [o for o in objs if o]
    if len(objs) == 1:
        objs[0].name = nombre
        return objs[0]
    with bpy.context.temp_override(active_object=objs[0], selected_editable_objects=objs, selected_objects=objs):
        bpy.ops.object.join()
    objs[0].name = nombre
    objs[0].data.name = nombre
    return objs[0]


def grupo(nombre, hijos, pos=(0, 0, 0)):
    """un empty como padre (en el GLB queda un nodo con nombre y sus hijos)"""
    e = bpy.data.objects.new(nombre, None)
    e.empty_display_size = 0.01
    bpy.context.scene.collection.objects.link(e)
    e.location = pos
    for h in hijos:
        h.parent = e
    return e


def uv_planar(ob, x0, x1, y0, y1):
    """UV = proyección desde arriba (x, y del objeto) a [0,1]: la textura de la placa cae donde va"""
    me = ob.data
    uv = me.uv_layers.new(name="UVMap")
    for loop in me.loops:
        co = me.vertices[loop.vertex_index].co
        uv.data[loop.index].uv = ((co.x - x0) / (x1 - x0), (co.y - y0) / (y1 - y0))


# ---------------------------------------------------------------- imágenes con numpy
class Lienzo:
    """una imagen RGB en numpy con coordenadas en metros (la placa), para dibujar pistas y vías.
    Los colores van en sRGB (como se ven), la imagen se guarda como PNG sRGB."""

    def __init__(self, w, h, x0, x1, y0, y1, fondo):
        self.w, self.h = w, h
        self.x0, self.x1, self.y0, self.y1 = x0, x1, y0, y1
        self.px = np.zeros((h, w, 3), np.float32)
        self.px[:] = fondo
        ys, xs = np.mgrid[0:h, 0:w]
        self.X = x0 + (xs + 0.5) / w * (x1 - x0)
        self.Y = y0 + (ys + 0.5) / h * (y1 - y0)

    def _ventana(self, x0, y0, x1, y1):
        """índices de píxeles que tocan la caja (para no recorrer toda la imagen en cada trazo)"""
        sx = self.w / (self.x1 - self.x0)
        sy = self.h / (self.y1 - self.y0)
        i0 = max(int((x0 - self.x0) * sx) - 2, 0)
        i1 = min(int((x1 - self.x0) * sx) + 3, self.w)
        j0 = max(int((y0 - self.y0) * sy) - 2, 0)
        j1 = min(int((y1 - self.y0) * sy) + 3, self.h)
        return (slice(j0, j1), slice(i0, i1))

    def _mezclar(self, v, dist_px, color):
        """borde suavizado: dist_px = distancia firmada en píxeles (negativo = adentro)"""
        if self.px[v].size == 0:
            return
        a = np.clip(0.5 - dist_px, 0, 1)[..., None]
        self.px[v] = self.px[v] * (1 - a) + np.array(color, np.float32) * a

    def linea(self, puntos, ancho, color):
        px_m = (self.x1 - self.x0) / self.w
        for (ax, ay), (bx, by) in zip(puntos, puntos[1:]):
            v = self._ventana(min(ax, bx) - ancho, min(ay, by) - ancho, max(ax, bx) + ancho, max(ay, by) + ancho)
            X, Y = self.X[v], self.Y[v]
            dx, dy = bx - ax, by - ay
            l2 = dx * dx + dy * dy or 1e-12
            t = np.clip(((X - ax) * dx + (Y - ay) * dy) / l2, 0, 1)
            d = np.hypot(X - (ax + t * dx), Y - (ay + t * dy))
            self._mezclar(v, (d - ancho / 2) / px_m, color)

    def circulo(self, cx, cy, r, color, r_int=0.0, color_int=None):
        px_m = (self.x1 - self.x0) / self.w
        v = self._ventana(cx - r, cy - r, cx + r, cy + r)
        d = np.hypot(self.X[v] - cx, self.Y[v] - cy)
        self._mezclar(v, (d - r) / px_m, color)
        if r_int:
            self._mezclar(v, (d - r_int) / px_m, color_int)

    def rect(self, x0, y0, x1, y1, color, borde=0.0):
        """rectángulo lleno; borde>0 = solo el contorno de ese grosor (serigrafía)"""
        if borde:
            self.linea([(x0, y0), (x1, y0), (x1, y1), (x0, y1), (x0, y0)], borde, color)
            return
        v = self._ventana(x0, y0, x1, y1)
        m = (self.X[v] >= x0) & (self.X[v] <= x1) & (self.Y[v] >= y0) & (self.Y[v] <= y1)
        sub = self.px[v]
        sub[m] = color
        self.px[v] = sub

    def imagen(self, nombre):
        """-> bpy Image empacada (el GLB la lleva adentro)"""
        img = bpy.data.images.new(nombre, self.w, self.h, alpha=False)
        rgba = np.ones((self.h, self.w, 4), np.float32)
        rgba[..., :3] = self.px
        img.pixels.foreach_set(rgba.ravel())
        ruta = os.path.join(tempfile.gettempdir(), f"{nombre}.png")
        img.filepath_raw = ruta
        img.file_format = "PNG"
        img.save()
        img.pack()
        img.colorspace_settings.name = "sRGB"
        return img


# ---------------------------------------------------------------- salida
def stats():
    """(objetos con malla, triángulos)"""
    tris = 0
    n = 0
    dg = bpy.context.evaluated_depsgraph_get()
    for ob in bpy.context.scene.objects:
        if ob.type == "MESH":
            n += 1
            me = ob.evaluated_get(dg).data
            me.calc_loop_triangles()
            tris += len(me.loop_triangles)
    return n, tris


def exportar_glb(ruta):
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=ruta,
        export_format="GLB",
        export_apply=True,                       # modificadores aplicados
        export_yup=True,                         # Y arriba, como pide glTF (y three.js)
        export_draco_mesh_compression_enable=False,
        export_image_format="AUTO",
        export_materials="EXPORT",
        export_extras=True,                      # propiedades propias (ej. el pin) -> userData en three
        export_cameras=False,
        export_lights=False,
    )
    return os.path.getsize(ruta)


def _caja_escena():
    lo = Vector((1e9,) * 3)
    hi = Vector((-1e9,) * 3)
    for ob in bpy.context.scene.objects:
        if ob.type != "MESH":
            continue
        for c in ob.bound_box:
            w = ob.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
    return lo, hi


def render_preview(ruta, ancho=800, alto=500, azimut=-35, elevacion=38, zoom=1.0, muestras=48):
    """PNG con luz de 3 puntos sobre fondo oscuro neutro. La cámara encuadra todo lo que hay"""
    sc = bpy.context.scene
    lo, hi = _caja_escena()
    centro = (lo + hi) / 2
    radio = (hi - lo).length / 2

    cam = bpy.data.objects.new("cam_preview", bpy.data.cameras.new("cam_preview"))
    sc.collection.objects.link(cam)
    cam.data.lens = 60
    cam.data.clip_start = radio * 0.01
    cam.data.clip_end = radio * 100
    fov = 2 * math.atan(cam.data.sensor_width / 2 / cam.data.lens) * (alto / ancho)
    dist = radio / math.sin(fov / 2) * 0.82 / zoom
    az, el = math.radians(azimut), math.radians(elevacion)
    dirv = Vector((math.cos(el) * math.sin(az), -math.cos(el) * math.cos(az), math.sin(el)))
    cam.location = centro + dirv * dist
    cam.rotation_euler = (-dirv).to_track_quat("-Z", "Y").to_euler()
    sc.camera = cam

    def luz(nombre, energia, tam, az_l, el_l, color=(1, 1, 1)):
        L = bpy.data.lights.new(nombre, "AREA")
        L.energy = energia * dist * dist        # misma luz llegue a cualquier escala
        L.size = tam * dist
        L.color = color
        o = bpy.data.objects.new(nombre, L)
        sc.collection.objects.link(o)
        a, e = math.radians(az_l), math.radians(el_l)
        d = Vector((math.cos(e) * math.sin(a), -math.cos(e) * math.cos(a), math.sin(e)))
        o.location = centro + d * dist
        o.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()

    luz("luz_clave", 28, 0.6, azimut - 45, 55, (1.0, 0.96, 0.9))
    luz("luz_relleno", 8, 1.0, azimut + 70, 25, (0.85, 0.9, 1.0))
    luz("luz_contra", 22, 0.4, azimut + 170, 40, (0.9, 0.95, 1.0))

    w = bpy.data.worlds.new("fondo")
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs["Color"].default_value = (0.022, 0.024, 0.028, 1)
    w.node_tree.nodes["Background"].inputs["Strength"].default_value = 1.0
    sc.world = w

    sc.render.engine = "BLENDER_EEVEE"
    sc.eevee.taa_render_samples = muestras
    sc.render.resolution_x, sc.render.resolution_y = ancho, alto
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = False
    sc.view_settings.view_transform = "AgX"
    sc.view_settings.look = "AgX - Medium High Contrast"
    sc.render.image_settings.file_format = "PNG"
    sc.render.filepath = ruta
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    bpy.ops.render.render(write_still=True)
    # la cámara y las luces no van al GLB (se exporta antes) pero las borramos igual
    for o in [cam] + [o for o in sc.objects if o.name.startswith("luz_")]:
        bpy.data.objects.remove(o)
