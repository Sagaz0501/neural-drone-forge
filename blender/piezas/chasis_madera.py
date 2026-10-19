"""
El chasis de madera del kit (app/data/piezas.json "madera"), hecho en casa a escala real: dos tiras de contrachapado
cruzadas, una placa de triplex de 4 mm en el centro (los 4 agujeros del stack de 30,5 mm y dos para alivianar), un
disco de triplex en cada punta para el motor, tornillos de madera, cinta roja en los brazos de adelante y negra en los
de atrás, una brida por brazo y la placa de arriba (la "tapa": la mesa la muestra solo con la controladora; tapa=1).
Las vetas y las capas del triplex son texturas dibujadas con numpy (van dentro del GLB).
X = adelante, Y = izquierda, Z = arriba; abajo de los listones en z = 0. Los motores van a R = 156 mm del centro, a 45°
(dron3d.js: radio_m 0.2 x 0.78), arriba del disco en z = 14 mm (donde dron3d pone los motores).
"""
import math
import os
import tempfile

import bpy
import numpy as np

import lib_piezas as L
from lib_piezas import mm

R = 156.0                    # centro -> eje del motor
ANCHO, ALTO = 22.0, 10.0     # la tira de contrachapado de cada brazo
CAPA = 4.0 / 3               # el triplex de 4 mm: 3 capas
ANGULOS = (45, 135, 225, 315)


def veta(nombre, claro, oscuro, semilla, w=768, h=192, nudos=2, fino=28.0):
    """madera: anillos torcidos por un ruido suave, fibras finas y algún nudo. u = a lo largo de la veta."""
    rng = np.random.default_rng(semilla)
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    u, v = xs / w, ys / h
    d = v.copy()
    for _ in range(7):
        f, a, ph = rng.uniform(0.6, 4), rng.uniform(0.004, 0.018), rng.uniform(0, 6.3)
        d += a * np.sin(2 * np.pi * f * u + ph + 2.2 * v)
    nucleo = np.zeros_like(u)
    for _ in range(nudos):
        cx, cy, r = rng.uniform(0.15, 0.85), rng.uniform(0.25, 0.75), rng.uniform(0.025, 0.05)
        q = ((u - cx) * w / h / 3.2) ** 2 + ((v - cy) / r) ** 2
        d += r * 1.4 * np.exp(-q) * np.sign(v - cy)            # las vetas rodean el nudo
        nucleo = np.maximum(nucleo, np.exp(-q * 9))
    anillo = (0.5 + 0.5 * np.sin(2 * np.pi * d * fino)) ** 2.5
    fibra = rng.normal(0, 1, h).astype(np.float32)
    fibra = np.convolve(fibra, np.ones(3) / 3, "same")[:, None] * 0.05 + rng.normal(0, 0.025, (h, w)).astype(np.float32)
    t = np.clip(anillo * 0.6 + fibra + nucleo * 0.9, 0, 1)[..., None]
    px = np.array(claro, np.float32) * (1 - t) + np.array(oscuro, np.float32) * t
    img = bpy.data.images.new(nombre, w, h, alpha=False)
    rgba = np.ones((h, w, 4), np.float32)
    rgba[..., :3] = np.clip(px, 0, 1)
    img.pixels.foreach_set(rgba.ravel())
    img.filepath_raw = os.path.join(tempfile.gettempdir(), f"{nombre}.png")
    img.file_format = "PNG"
    img.save()
    img.pack()
    img.colorspace_settings.name = "sRGB"
    return img


def uv_caja(ob, su, sv):
    """UV según hacia dónde mira cada cara (arriba/abajo: x,y; lados: x,z o y,z), su x sv metros = la textura.
    En coordenadas del objeto: el largo del listón es su x, así la veta corre a lo largo."""
    me = ob.data
    uv = me.uv_layers.new(name="UVMap")
    for p in me.polygons:
        n = p.normal
        for li in p.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            if abs(n.z) >= max(abs(n.x), abs(n.y)):
                a, b = co.x, co.y
            elif abs(n.y) >= abs(n.x):
                a, b = co.x, co.z
            else:
                a, b = co.y, co.z
            uv.data[li].uv = (a / su + 0.5, b / sv + 0.5)


def agujerear(ob, cortes):
    """resta los cilindros (booleano aplicado ahí mismo, como el ESC)"""
    cutter = L.unir(cortes, "cortador")
    mod = ob.modifiers.new("agujeros", "BOOLEAN")
    mod.object, mod.operation, mod.solver = cutter, "DIFFERENCE", "EXACT"
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    ob.modifiers.clear()
    old, ob.data = ob.data, me
    bpy.data.meshes.remove(old)
    bpy.data.objects.remove(cutter)
    return ob


def triplex(nombre, hacer, z0, huecos, mats, su=0.12, sv=0.12):
    """una placa de 3 capas (la del medio, más oscura y con la veta cruzada). hacer(z, alto) arma la forma de una capa;
    huecos = [(x, y, r)] en mm."""
    capas = []
    for k in range(3):
        ob = hacer(z0 + k * CAPA, CAPA)
        if huecos:
            agujerear(ob, [L.cilindro("c", mm(r), mm(10), mm(x, y, z0 - 3), None, seg=28) for x, y, r in huecos])
        for f in ob.data.polygons:
            f.use_smooth = False
        uv_caja(ob, su if k != 1 else sv * 0.5, sv if k != 1 else su * 0.5)
        ob.data.materials.clear()
        ob.data.materials.append(mats[k == 1])
        capas.append(ob)
    return L.unir(capas, nombre)


def en_brazo(a, s, t=0.0):
    """(x, y) en mm de un punto del brazo a (grados): s = a lo largo desde el centro, t = de lado"""
    c, si = math.cos(math.radians(a)), math.sin(math.radians(a))
    return s * c - t * si, s * si + t * c


def construir():
    pino = L.m_textura("pino", veta("veta_pino", (0.74, 0.47, 0.24), (0.45, 0.24, 0.09), 3, nudos=3), rough=0.5)        # barnizado
    abedul = L.m_textura("triplex", veta("veta_triplex", (0.80, 0.62, 0.40), (0.62, 0.42, 0.22), 7, nudos=0, fino=16), rough=0.55)
    alma = L.mat("triplex_alma", (0.36, 0.22, 0.10), rough=0.85)
    laton = L.mat("laton", (0.55, 0.38, 0.14), rough=0.35, metal=1.0)
    ranura = L.mat("ranura", (0.05, 0.04, 0.03), rough=0.6)
    objs = []

    # los dos brazos: tiras de contrachapado de 10 mm (5 capas; en los cantos se ven las vetas cruzadas), lijadas
    largo = 2 * R + 30
    for k, a in enumerate((45, 135)):
        capas = []
        for j in range(5):
            ob = L.caja("c", mm(largo, ANCHO, ALTO / 5), mm(0, 0, j * ALTO / 5), pino if j % 2 == 0 else alma,
                        bisel=mm(0.5 if j in (0, 4) else 0.15), seg=2 if j in (0, 4) else 1, rot_z=math.radians(a))
            uv_caja(ob, 0.36, 0.09)
            capas.append(ob)
        objs.append(L.unir(capas, f"brazo_{k}"))

    # la placa del centro (triplex 110 x 75): los agujeros del stack (30,5) y dos para alivianar
    stack = [(sx * 15.25, sy * 15.25, 1.7) for sx in (1, -1) for sy in (1, -1)]
    alivio = [(44, 0, 7.5), (-44, 0, 7.5)]
    objs.append(triplex("placa_centro", lambda z, h: L.caja("p", mm(110, 75, h), mm(0, 0, z), None, bisel=mm(0.6)),
                        ALTO, stack + alivio, (abedul, alma)))

    # el disco de cada motor (triplex Ø 36) con el agujero del eje
    for a in ANGULOS:
        x, y = en_brazo(a, R)
        objs.append(triplex(f"disco_{a}", lambda z, h, x=x, y=y: L.cilindro("d", mm(18), mm(h), mm(x, y, z), None, seg=48, bisel=mm(0.4)),
                            ALTO, [(x, y, 4.0)], (abedul, alma)))

    # los tornillos de madera (latón, cabeza con la cruz): 2 por disco y 4 en la placa del centro
    def tornillo(x, y, z, giro):
        c = [L.cilindro("t", mm(2.6), mm(0.9), mm(x, y, z), laton, seg=16, bisel=mm(0.35))]
        for g in (giro, giro + math.pi / 2):
            c.append(L.caja("r", mm(3.6, 0.55, 0.4), mm(x, y, z + 0.6), ranura, rot_z=g))
        return c
    tornillos = []
    for a in ANGULOS:
        for s in (R - 14, R + 14):
            tornillos += tornillo(*en_brazo(a, s), ALTO + 4, math.radians(a + 20))
        tornillos += tornillo(*en_brazo(a, 44), ALTO + 4, math.radians(a - 10))
    objs.append(L.unir(tornillos, "tornillos"))

    # cinta: roja en los brazos de adelante (así se sabe dónde es el frente), negra en los de atrás
    rojo = L.mat("cinta_roja", (0.55, 0.02, 0.015), rough=0.45)
    negro = L.mat("cinta_negra", (0.015, 0.015, 0.016), rough=0.5)
    cintas = []
    for a in ANGULOS:
        x, y = en_brazo(a, 112)
        cintas.append(L.caja("cinta", mm(16, ANCHO + 0.7, ALTO + 0.7), mm(x, y, -0.35), rojo if math.cos(math.radians(a)) > 0 else negro,
                             bisel=mm(0.5), seg=2, rot_z=math.radians(a)))
    objs.append(L.unir(cintas, "cintas"))

    # una brida (plástico negro) por brazo: el aro alrededor del listón y la cabeza arriba
    brida = L.mat("brida", (0.03, 0.03, 0.032), rough=0.55)
    bridas = []
    for a in ANGULOS:
        x, y = en_brazo(a, 72)
        g = math.radians(a)
        for t, z, ay, az in ((-(ANCHO / 2 + 0.4), -0.4, 0.8, ALTO + 1.6), (ANCHO / 2 + 0.4, -0.4, 0.8, ALTO + 1.6)):
            px, py = en_brazo(a, 72, t)
            bridas.append(L.caja("b", mm(2.6, ay, az), mm(px, py, z), brida, rot_z=g))
        for z in (-0.8, ALTO):
            bridas.append(L.caja("b", mm(2.6, ANCHO + 1.6, 0.8), mm(x, y, z), brida, rot_z=g))
        px, py = en_brazo(a, 72, ANCHO / 2 - 3)
        bridas.append(L.caja("cabeza", mm(4.2, 4.2, 2.6), mm(px, py, ALTO + 0.8), brida, bisel=mm(0.4), rot_z=g))
    objs.append(L.unir(bridas, "bridas"))

    # la tapa (triplex 100 x 70, sobre los separadores; la batería va encima) con la flecha de plumón hacia adelante
    tapa = triplex("tapa", lambda z, h: L.caja("p", mm(100, 70, h), mm(0, 0, z), None, bisel=mm(0.6)),
                   40.0, stack, (abedul, alma))
    plumon = L.mat("plumon", (0.02, 0.03, 0.09), rough=0.8)
    flecha = [L.caja("f", mm(13, 1.4, 0.15), mm(41, 0, 44.02), plumon)]
    for s in (1, -1):
        flecha.append(L.caja("f", mm(6.5, 1.4, 0.15), mm(45.3, s * 2.2, 44.02), plumon, rot_z=-s * math.radians(40)))
    tapa = L.unir([tapa] + flecha, "tapa")
    tapa["tapa"] = 1
    objs.append(tapa)

    raiz = L.grupo("chasis_madera", objs)
    raiz["pieza"], raiz["radio_motor_mm"], raiz["alto_mm"] = "chasis_madera", R, ALTO + 4
    return raiz
