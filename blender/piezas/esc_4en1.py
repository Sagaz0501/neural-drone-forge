"""
ESC 4 en 1 (BLHeli_S, 2-4S) de 42 x 42 mm con montaje de 30,5 mm, a escala real. X = derecha, Y = ADELANTE (el
frente del dron), Z = arriba. Medidas en mm -> mm().

Los pads que se sueldan son objetos aparte, con nombre (la mesa de soldar de app/mesa.js los busca así):
  pad_BATP, pad_BATN                    la batería (pads grandes, a la izquierda)
  pad_M1_1 … pad_M4_3                   3 pads por motor; cada motor en su esquina, como en Betaflight:
                                        M1 atrás der. · M2 adelante der. · M3 atrás izq. · M4 adelante izq.
  conector_FC                           el JST-SH de 8 pines del arnés a la controladora (a la derecha)
Cada pad lleva propiedades (pin, sub, etiqueta) que llegan a three.js como userData.
"""
import math
import random

import lib_piezas as L
from lib_piezas import mm

LADO, GROSOR = 42.0, 1.6
TOP = GROSOR
HUECO = 30.5 / 2                       # los agujeros de montaje (M3) en las esquinas
BAT = {"BATP": (-16.5, 4.6), "BATN": (-16.5, -4.6)}
BAT_TAM = (6.0, 5.2)
MOTOR = {1: (9.0, -18.3), 2: (9.0, 18.3), 3: (-9.0, -18.3), 4: (-9.0, 18.3)}
PASO_M, M_TAM = 3.4, (2.6, 3.4)
CONECTOR = (17.6, 0.0)

COL = {"mascara": (0.045, 0.047, 0.052), "cobre": (0.085, 0.09, 0.098), "seri": (0.9, 0.9, 0.88)}


def P(x, y, z=TOP):
    return mm(x, y, z)


def cuadrantes():
    """(sx, sy, n.º de motor) de cada esquina"""
    return [(1 if x > 0 else -1, 1 if y > 0 else -1, n) for n, (x, y) in MOTOR.items()]


def mosfets(sx, sy):
    return [(sx * x, sy * y) for x in (3.0, 6.5, 10.0) for y in (9.0, 12.6)]


# ---------------------------------------------------------------- la placa
def textura():
    """cobre bajo la máscara (los planos de potencia se notan), pistas, vías y la serigrafía de contornos"""
    lz = L.Lienzo(1024, 1024, mm(-LADO / 2), mm(LADO / 2), mm(-LADO / 2), mm(LADO / 2), COL["mascara"])
    cu, seri, est = COL["cobre"], COL["seri"], (0.72, 0.72, 0.72)
    W = lambda pts, a=0.3: lz.linea([mm(*p) for p in pts], mm(a), cu)
    rnd = random.Random(4)
    # los planos de la batería: del pad grande hacia el centro y a cada canal (anchos: corriente alta)
    for (x, y) in BAT.values():
        W([(x + 2, y), (-6, y * 0.6), (0, y * 0.4)], 2.2)
    W([(-6, 2.8), (-6, 7.5), (1, 7.5), (11, 7.5)], 1.6)
    W([(-6, -2.8), (-6, -7.5), (1, -7.5), (11, -7.5)], 1.6)
    for sx, sy, n in cuadrantes():
        mx, my = MOTOR[n]
        # cada fase del motor a su par de MOSFET
        for k in range(3):
            px = mx - PASO_M + k * PASO_M
            fx, fy = sx * (3.0 + 3.5 * k), sy * 12.6
            W([(px, my - sy * 1.7), (px, sy * 15.2), (fx, sy * 14.4), (fx, fy)], 0.9)
        # el micro de ese canal a sus MOSFET (las compuertas: finitas)
        cx, cy = sx * 6.0, sy * 4.5
        for (fx, fy) in mosfets(sx, sy):
            W([(cx + 0.6 * sx, cy + 1.2 * sy), (cx + 0.6 * sx, fy - sy * 2.2), (fx - 1.2 * sx, fy - sy * 2.2), (fx - 1.2 * sx, fy - 1.0 * sy)], 0.22)
        # señal desde el conector
        W([(CONECTOR[0] - 2, sy * (1.0 + 0.8 * (n % 2))), (sx * 8.5, sy * (1.0 + 0.8 * (n % 2))), (cx, cy - sy * 1.5)], 0.22)
        # vías bajo los MOSFET (llevan calor al otro lado)
        for (fx, fy) in mosfets(sx, sy):
            for dx in (-0.9, 0, 0.9):
                lz.circulo(*mm(fx + dx, fy + sy * 2.0), mm(0.28), est, mm(0.13), (0.03, 0.03, 0.03))
    for _ in range(60):
        x, y = rnd.uniform(-14, 14), rnd.uniform(-14, 14)
        if abs(x) < 3.5 and abs(y) < 3.5:
            continue
        lz.circulo(*mm(x, y), mm(0.28), est, mm(0.13), (0.03, 0.03, 0.03))
    # serigrafía: el contorno de cada grupo de pads de motor, de la batería y del conector
    S = lambda x0, y0, x1, y1: lz.rect(*mm(x0, y0, x1, y1), seri, borde=mm(0.17))
    for n, (x, y) in MOTOR.items():
        S(x - PASO_M - 1.9, y - 2.3, x + PASO_M + 1.9, y + 2.3)
    for (x, y) in BAT.values():
        S(x - 3.6, y - 3.2, x + 3.6, y + 3.2)
    S(CONECTOR[0] - 2.3, -5.8, CONECTOR[0] + 2.3, 5.8)
    # la flecha del frente (rellena)
    for k in range(14):
        h = 0.11 * k
        lz.linea([mm(-h, 14.6 + 0.11 * (13 - k)), mm(h, 14.6 + 0.11 * (13 - k))], mm(0.14), seri)
    return lz.imagen("esc_placa")


def placa():
    m = L.m_textura("placa_esc", textura(), rough=0.36)
    ob = L.caja("pcb", mm(LADO, LADO, GROSOR), (0, 0, 0), m, bisel=mm(0.25))
    corte = [L.cilindro("corte", mm(1.6), mm(4), P(sx * HUECO, sy * HUECO, -1), None, seg=24)
             for sx in (1, -1) for sy in (1, -1)]
    cutter = L.unir(corte, "cortador")
    mod = ob.modifiers.new("agujeros", "BOOLEAN")
    mod.object, mod.operation, mod.solver = cutter, "DIFFERENCE", "EXACT"
    import bpy
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    ob.modifiers.clear()
    old = ob.data
    ob.data = me
    bpy.data.meshes.remove(old)
    me.name = "pcb"
    for f in me.polygons:
        f.use_smooth = False
    bpy.data.objects.remove(cutter)
    L.uv_planar(ob, mm(-LADO / 2), mm(LADO / 2), mm(-LADO / 2), mm(LADO / 2))
    # el anillo dorado de cada agujero (tierra)
    aros = [L.anillo("aro", mm(2.7), mm(1.6), mm(GROSOR + 0.07), P(sx * HUECO, sy * HUECO, GROSOR / 2), L.m_oro(), seg=28)
            for sx in (1, -1) for sy in (1, -1)]
    return [ob, L.unir(aros, "agujeros_montaje")]


# ---------------------------------------------------------------- lo que se suelda
def pad_smd(nombre, x, y, w, h, **props):
    """un pad de cobre con oro (ENIG): un poco sobre la máscara, con el canto redondeado"""
    ob = L.caja(nombre, mm(w, h, 0.08), P(x, y, TOP - 0.01), L.m_oro(), bisel=mm(0.25), seg=2)
    for k, v in props.items():
        ob[k] = v
    return ob


def pads():
    objs = []
    for k, (x, y) in BAT.items():
        objs.append(pad_smd(f"pad_{k}", x, y, *BAT_TAM, pin="bat+" if k == "BATP" else "bat-",
                            etiqueta="BAT+" if k == "BATP" else "BAT-"))
    for n, (x, y) in MOTOR.items():
        for s in range(3):
            objs.append(pad_smd(f"pad_M{n}_{s + 1}", x - PASO_M + s * PASO_M, y, *M_TAM, pin=f"m{n}", sub=s,
                                etiqueta=f"M{n}"))
    return objs


def conector():
    """JST-SH de 8 pines (paso 1 mm), la boca hacia +X (el borde de la placa)"""
    x, y = CONECTOR
    beige = L.mat("plastico_jst", (0.80, 0.74, 0.60), rough=0.5)
    partes = [L.caja("conector_FC", mm(4.2, 10.0, 2.9), P(x, y), beige, bisel=mm(0.2)),
              L.caja("boca", mm(0.4, 8.6, 1.9), P(x + 2.0, y, TOP + 0.5), L.m_plastico_n())]
    for k in range(8):
        partes.append(L.caja("pata", mm(1.0, 0.32, 0.2), P(x - 2.6, y - 3.5 + k, TOP), L.m_estano()))
    for s in (1, -1):
        partes.append(L.caja("ancla", mm(1.6, 1.2, 0.25), P(x + 0.4, y + s * 5.6, TOP), L.m_estano(), bisel=mm(0.1)))
    ob = L.unir(partes, "conector_FC")
    ob["pin"], ob["etiqueta"] = "conn", "FC"
    return ob


# ---------------------------------------------------------------- los componentes
def mosfet(x, y):
    """PDFN 3,3 x 3,3: cuerpo de epoxi, 4 patas de un lado y la lengüeta de drenaje del otro"""
    partes = [L.caja("m", mm(3.1, 3.1, 0.85), P(x, y, TOP + 0.05), L.m_epoxi(), bisel=mm(0.08))]
    for k in range(4):
        partes.append(L.caja("p", mm(0.42, 0.7, 0.2), P(x - 1.0 + k * 0.65, y - 1.75, TOP), L.m_estano()))
    partes.append(L.caja("d", mm(2.8, 0.6, 0.2), P(x, y + 1.7, TOP), L.m_estano()))
    partes.append(L.cilindro("pt", mm(0.22), mm(0.02), P(x - 1.05, y - 1.0, TOP + 0.9),
                             L.mat("tinta_chip", (0.35, 0.35, 0.36), rough=0.6), seg=10))
    return partes


def qfn(nombre, x, y, lado, rot=0.0):
    partes = [L.caja(nombre, mm(lado, lado, 0.75), P(x, y), L.m_epoxi(), bisel=mm(0.06), rot_z=rot)]
    c, s = math.cos(rot), math.sin(rot)
    for k in range(4):
        o = (k - 1.5) * 0.5
        for dx, dy in ((lado / 2, o), (-lado / 2, o), (o, lado / 2), (o, -lado / 2)):
            partes.append(L.caja("p", mm(0.3, 0.3, 0.18), P(x + c * dx - s * dy, y + s * dx + c * dy), L.m_estano(), rot_z=rot))
    return partes


def pasivo(x, y, rot, tipo, l=1.6, w=0.8):
    cuerpo = L.m_ceramica() if tipo == "c" else L.m_epoxi()
    h = 0.8 if tipo == "c" else 0.45
    c, s = math.cos(rot), math.sin(rot)
    partes = [L.caja("c", mm(l - 0.6, w, h), P(x, y), cuerpo, rot_z=rot)]
    for e in (1, -1):
        d = (l - 0.3) / 2 * e
        partes.append(L.caja("e", mm(0.3, w, h + 0.02), P(x + c * d, y + s * d), L.m_estano(), rot_z=rot, bisel=mm(0.05)))
    return partes


def componentes():
    rnd = random.Random(11)
    fets, micros, pas = [], [], []
    for sx, sy, n in cuadrantes():
        for (x, y) in mosfets(sx, sy):
            fets += mosfet(x, y)
        micros += qfn(f"mcu_{n}", sx * 6.0, sy * 4.5, 3.0, rot=math.pi / 4)
        for k in range(3):                                       # los condensadores de cada canal
            pas += pasivo(sx * (2.4 + 1.9 * k), sy * 6.6, 0, rnd.choice("ccr"))
        pas += pasivo(sx * 9.6, sy * 4.2, math.pi / 2, "r")
    tinta = L.mat("tinta_chip", (0.35, 0.35, 0.36), rough=0.6)
    # la resistencia shunt (sensor de corriente, 2512) y el regulador
    shunt = [L.caja("shunt", mm(3.2, 6.3, 0.6), P(-9.5, 0), L.mat("shunt_metal", (0.55, 0.56, 0.58), rough=0.35, metal=0.9), bisel=mm(0.1))]
    shunt.append(L.texto("t", "R0005", mm(0.7), P(-9.5, 0, TOP + 0.62), tinta, rot_z=math.pi / 2))
    ldo = [L.caja("ldo", mm(2.9, 1.6, 1.1), P(1.5, 2.6), L.m_epoxi(), bisel=mm(0.06))]
    for k in (-1, 0, 1):
        ldo.append(L.caja("p", mm(0.4, 0.6, 0.2), P(1.5 + k * 0.95, 1.6), L.m_estano()))
    ldo.append(L.caja("p", mm(1.2, 0.6, 0.2), P(1.5, 3.6), L.m_estano()))
    # condensadores grandes (1206) junto a la batería: filtran el ruido de los motores
    for y in (-1.6, 1.6):
        pas += pasivo(-13.0, y, math.pi / 2, "c", l=3.2, w=1.6)
    # el LED de estado
    led = L.caja("led_estado", mm(1.6, 0.8, 0.55), P(13.2, -7.2), L.mat("led_azul", (0.05, 0.2, 0.95), rough=0.15))
    return [L.unir(fets, "mosfets"), L.unir(micros, "micros"), L.unir(pas, "smd_pasivos"),
            L.unir(shunt, "shunt"), L.unir(ldo, "regulador"), led]


def serigrafia():
    seri = L.m_serigrafia()
    z = TOP + 0.02
    t = [L.texto("t", "4in1 ESC", mm(1.3), P(-0.6, 0.3, z), seri, negrita=True),
         L.texto("t", "BLHeli_S  2-4S", mm(0.8), P(-0.6, -1.5, z), seri),
         L.texto("t", "FRONT", mm(1.0), P(-16.3, 11.2, z), seri, negrita=True)]
    for n, (x, y) in MOTOR.items():
        t.append(L.texto("t", f"M{n}", mm(1.2), P(2.2 if x > 0 else -2.2, y, z), seri, negrita=True))
    for k, (x, y) in BAT.items():
        t.append(L.texto("t", "BAT+" if k == "BATP" else "BAT-", mm(1.2), P(x, y + (4.3 if y > 0 else -4.3), z), seri, negrita=True))
    t.append(L.texto("t", "FC", mm(1.0), P(CONECTOR[0], 7.0, z), seri, negrita=True))
    return L.unir(t, "serigrafia")


def construir():
    objs = placa() + pads() + [conector()] + componentes() + [serigrafia()]
    raiz = L.grupo("esc_4en1", objs)
    raiz["pieza"] = "esc_4en1"
    raiz["medidas_mm"] = f"{LADO} x {LADO} x {GROSOR}, montaje 30,5"
    return raiz


if __name__ == "__main__":
    L.limpiar()
    construir()
