"""
El puesto de soldar, a escala real (mm -> mm()): el cautín apoyado en su soporte de resorte, el limpiador de
lana de bronce, la jeringa de flux y el carrete de estaño. Cada cosa es un grupo con nombre en el GLB:

  soldador_set
    soporte (base, postes, resorte)      cautin (mango, collar, cañón, punta)  <- 'punta' se pone roja caliente
    cable_cautin   limpiador (vaso, lana)   jeringa_flux   carrete_estano

Z arriba, la mesa en z = 0.
"""
import math
import random

from mathutils import Vector

import lib_piezas as L
from lib_piezas import mm

TH = math.radians(25)                              # inclinación del resorte (y del cautín)
U = Vector((math.cos(TH), 0, -math.sin(TH)))       # eje: del mango hacia la punta
C0 = Vector((-20, 0, 62))                          # boca del resorte (mm)
LARGO_RES = 70


def V(v):
    return Vector(mm(*v))


# ---------------------------------------------------------------- materiales
def m_mango():     return L.mat("mango_plastico", (0.015, 0.09, 0.38), rough=0.4)
def m_goma():      return L.mat("goma_negra", (0.02, 0.02, 0.022), rough=0.85)
def m_pintura():   return L.mat("pintura_base", (0.05, 0.05, 0.055), rough=0.55, metal=0.3)
def m_cromo():     return L.mat("cromo", (0.85, 0.86, 0.88), rough=0.22, metal=1.0)
def m_punta():     return L.mat("punta_metal", (0.72, 0.72, 0.74), rough=0.22, metal=1.0)
def m_canon():     return L.mat("acero_quemado", (0.45, 0.40, 0.36), rough=0.35, metal=1.0)
def m_bronce():    return L.mat("lana_bronce", (0.85, 0.62, 0.28), rough=0.3, metal=1.0)


# ---------------------------------------------------------------- el cautín (eje local +X, la punta termina en x=0)
def cautin():
    # mango: carcasa azul atrás, goma negra con anillos adelante
    carcasa = L.torno("cautin_mango", [(r / 1000, x / 1000) for r, x in [
        (0, -192), (2.6, -192), (3.2, -184), (4.6, -176), (8.5, -172), (9.8, -168), (10.2, -150), (10.2, -142),
        (9.6, -140), (0, -140)]], m_mango(), seg=28, eje="X")
    perfil = [(0, -141), (9.4, -141)]
    x = -140
    while x < -96:                                  # anillos de agarre
        perfil += [(9.6, x), (10.4, x + 1.2), (10.4, x + 3.2), (9.6, x + 4.4)]
        x += 4.4
    perfil += [(9.4, x + 0.5), (8.6, x + 8), (7.4, x + 14), (7.0, -76), (0, -76)]
    goma = L.torno("cautin_goma", [(r / 1000, x / 1000) for r, x in perfil], m_goma(), seg=28, eje="X")
    collar = L.torno("cautin_collar", [(r / 1000, x / 1000) for r, x in [
        (0, -77), (6.4, -77), (6.8, -76.4), (6.8, -66), (6.2, -64), (4.2, -63), (3.6, -62.5), (0, -62.5)]],
        m_cromo(), seg=24, eje="X")
    canon = L.torno("cautin_canon", [(r / 1000, x / 1000) for r, x in [
        (0, -63), (3.5, -63), (3.5, -20), (3.2, -19), (0, -19)]], m_canon(), seg=20, eje="X")
    punta = L.torno("punta", [(r / 1000, x / 1000) for r, x in [
        (0, -21), (2.9, -21), (2.9, -18), (2.4, -14), (1.4, -6), (0.75, -1.4), (0.35, -0.2), (0, 0)]],
        m_punta(), seg=20, eje="X")
    punta["calentable"] = True
    g = L.grupo("cautin", [carcasa, goma, collar, canon, punta])
    tip = C0 + U * (LARGO_RES + 9)                    # la punta asoma por el final del resorte
    abajo = Vector((-math.sin(TH), 0, -math.cos(TH)))       # el -Z del eje: apoyado en el resorte
    g.location = V(tip + abajo * 4)
    g.rotation_euler.y = TH
    return g


def cable():
    """el cable sale de atrás del mango, baja a la mesa y se va"""
    atras = C0 + U * (LARGO_RES + 9 - 192)
    atras.z -= 4 * math.cos(TH)
    pts = [atras, atras - U * 10, atras - U * 24 + Vector((0, 4, -10)), Vector((atras.x - 38, 12, atras.z * 0.45)),
           Vector((atras.x - 50, 22, 2.6)), Vector((atras.x - 58, 45, 2.6)), Vector((atras.x - 62, 78, 2.6))]
    return L.tubo("cable_cautin", [tuple(mm(*p)) for p in pts], mm(2.4), m_goma(), lados=8, suave=6)


# ---------------------------------------------------------------- el soporte
def soporte():
    base = L.caja("soporte_base", mm(120, 80, 14), mm(8, 0, 0), m_pintura(), bisel=mm(3), seg=2)
    patas = [L.cilindro("p", mm(5), mm(1.2), mm(8 + sx * 52, sy * 32, -1.2), m_goma(), seg=12)
             for sx in (1, -1) for sy in (1, -1)]
    base = L.unir([base] + patas, "soporte_base")
    fin = C0 + U * LARGO_RES
    poste1 = L.cilindro("soporte_poste", mm(3.2), mm(C0.z - 15 - 14), mm(C0.x, 0, 13), m_cromo(), seg=14)
    poste2 = L.cilindro("soporte_poste2", mm(3.2), mm(fin.z - 9 - 14), mm(fin.x, 0, 13), m_cromo(), seg=14)
    postes = L.unir([poste1, poste2], "soporte_postes")

    # el resorte y la boca (en el marco del eje: +X hacia la punta)
    pts = []
    vueltas, n = 9, 9 * 18
    for k in range(n + 1):
        s = k / n
        a = 2 * math.pi * vueltas * s
        r = 11.5 - 2.5 * s
        pts.append(mm(s * LARGO_RES, r * math.cos(a), r * math.sin(a)))
    resorte = L.tubo("soporte_resorte", pts, mm(1.1), m_cromo(), lados=6, suave=1)
    boca = L.torno("soporte_boca", [(r / 1000, x / 1000) for r, x in [
        (12.6, 2), (13.4, -1), (18.5, -9), (19.2, -9), (14.2, 1.5), (13.2, 3)]], m_cromo(), seg=28, eje="X")
    tapa = L.torno("soporte_tapa", [(r / 1000, x / 1000) for r, x in [   # aro del final (abierto: la punta asoma)
        (6.5, LARGO_RES - 1), (10.2, LARGO_RES - 1), (10.2, LARGO_RES + 1.5), (6.5, LARGO_RES + 1.5), (6.5, LARGO_RES - 1)]],
        m_cromo(), seg=20, eje="X")
    res = L.grupo("soporte_resorte_eje", [resorte, boca, tapa])
    res.location = V(C0)
    res.rotation_euler.y = TH
    return L.grupo("soporte", [base, postes, res])


# ---------------------------------------------------------------- el limpiador de lana de bronce
def limpiador(pos):
    vaso = L.torno("limpiador_vaso", [(r / 1000, z / 1000) for r, z in [
        (0, 0), (30, 0), (31, 1.5), (31, 26), (32.5, 28), (32.5, 30), (29, 30), (28, 27), (28, 4), (0, 4)]],
        m_pintura(), seg=32)
    rnd = random.Random(11)
    # relleno: un bulto grumoso más oscuro para que no se vea el fondo del vaso
    import bmesh
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=3, radius=1.0)
    for v in bm.verts:
        n = v.co.normalized()
        k = 1 + 0.18 * math.sin(7 * n.x + 2) * math.sin(6 * n.y) + 0.1 * math.sin(11 * n.z + 1)
        v.co = Vector((n.x * 25 * k, n.y * 25 * k, 14 + n.z * 10 * k)) / 1000
    relleno = L._a_objeto(bm, "lana_relleno", L.mat("lana_bronce_osc", (0.45, 0.30, 0.12), rough=0.55, metal=1.0), 90)
    hebras = [relleno]
    for h in range(7):
        pts = []
        f = [rnd.uniform(0.03, 0.08) for _ in range(6)]
        ph = [rnd.uniform(0, 6.3) for _ in range(6)]
        for t in range(240):
            # recorrido lento por el volumen + rulos chicos (como la lana de verdad)
            x = 23 * math.sin(f[0] * t + ph[0]) * math.cos(f[3] * t + ph[3])
            y = 23 * math.sin(f[1] * t + ph[1]) * math.cos(f[4] * t + ph[4])
            z = 19 + 6 * math.sin(f[2] * t + ph[2])
            a = 1.3 * t + h
            x += 2.4 * math.cos(a)
            y += 2.4 * math.sin(a)
            z += 1.8 * math.sin(a * 0.7)
            pts.append(mm(x, y, z))
        hebras.append(L.tubo(f"lana{h}", pts, mm(0.3), m_bronce(), lados=4, suave=1))
    lana = L.unir(hebras, "limpiador_lana")
    return L.grupo("limpiador", [vaso, lana], pos=mm(*pos))


# ---------------------------------------------------------------- la jeringa de flux (acostada, eje Y)
def jeringa(pos):
    r_ext = 7.6
    cuerpo = L.torno("jeringa_cuerpo", [(r / 1000, y / 1000) for r, y in [
        (2.2, -46), (2.6, -50), (6.4, -50.5), (r_ext, -48), (r_ext, 38), (6.9, 38), (6.9, -47.4), (2.0, -47.6)]],
        L.mat("plastico_claro", (0.95, 0.95, 0.95), rough=0.08, transmision=0.9, ior=1.49, alpha=0.35), seg=24, eje="Y")
    flux = L.torno("jeringa_flux_gel", [(r / 1000, y / 1000) for r, y in [
        (0, -47.2), (6.7, -47.2), (6.7, 18), (0, 18)]], L.mat("flux_ambar", (0.75, 0.38, 0.05), rough=0.15), seg=20, eje="Y")
    embolo = L.torno("jeringa_embolo", [(r / 1000, y / 1000) for r, y in [
        (0, 18), (6.8, 18), (6.8, 23), (3, 23.5), (3, 70), (9.5, 70), (9.5, 72), (0, 72)]],
        L.mat("plastico_blanco", (0.9, 0.9, 0.88), rough=0.5), seg=20, eje="Y")
    goma = L.torno("jeringa_goma", [(r / 1000, y / 1000) for r, y in [
        (0, 17), (6.85, 17), (6.85, 21), (0, 21)]], m_goma(), seg=20, eje="Y")
    aleta = L.caja("jeringa_aleta", mm(30, 2.5, 4), mm(0, 37.5, -2), L.mat("plastico_claro", (1, 1, 1)), bisel=mm(1))
    aguja = L.torno("jeringa_aguja", [(r / 1000, y / 1000) for r, y in [
        (0, -51), (3.4, -51), (3.4, -58), (0.65, -59), (0.65, -78), (0, -78)]], m_cromo(), seg=14, eje="Y")
    tapa = L.torno("jeringa_tapa", [(r / 1000, y / 1000) for r, y in [
        (0, -52), (4.2, -52), (4.2, -60), (2, -82), (0, -82)]], L.mat("plastico_naranja", (0.9, 0.25, 0.02), rough=0.5),
        seg=16, eje="Y")
    tapa.location.z = mm(16)          # la tapa quitada, al lado
    tapa.location.x = mm(14)
    g = L.grupo("jeringa_flux", [cuerpo, flux, embolo, goma, aleta, aguja, tapa], pos=mm(*pos))
    g.rotation_euler.z = math.radians(80)
    return g


# ---------------------------------------------------------------- el carrete de estaño (parado)
def carrete(pos):
    rojo = L.mat("carrete_rojo", (0.55, 0.02, 0.02), rough=0.4)
    cuerpo = L.torno("carrete_cuerpo", [(r / 1000, z / 1000) for r, z in [
        (8, 0), (25, 0), (25.5, 1), (25, 2.2), (10, 2.2), (10, 31.8), (25, 31.8), (25.5, 33), (25, 34), (8, 34), (8, 0)]],
        rojo, seg=40, angulo_suave=30)
    perfil = [(0.0, 2.2)]
    z = 2.4
    while z < 31.6:                                  # las vueltas del alambre
        perfil += [(20.2, z), (20.6, z + 0.4)]
        z += 0.8
    perfil += [(20.2, 31.6), (0.0, 31.6)]
    alambre = L.torno("carrete_estano_alambre", [(r / 1000, z / 1000) for r, z in perfil], L.m_estano(), seg=40)
    # la punta del alambre que cuelga
    a0 = math.radians(-60)
    cola = [(20.4 * math.cos(a0), 20.4 * math.sin(a0), 16), (24 * math.cos(a0 - 0.3), 24 * math.sin(a0 - 0.3), 15),
            (34, -30, 9), (46, -32, 1.0), (62, -24, 0.9)]
    cola = L.tubo("carrete_cola", [mm(*p) for p in cola], mm(0.45), L.m_estano(), lados=6, suave=6)
    blanco = L.m_serigrafia()
    zt = 34.05
    letras = [L.texto("t", "Sn63/Pb37", mm(3.2), mm(0, 4, zt), blanco, negrita=True),
              L.texto("t", "0.8 mm  FLUX 2.2%", mm(2.0), mm(0, -4.5, zt), blanco)]
    letras = L.unir(letras, "carrete_etiqueta")
    return L.grupo("carrete_estano", [cuerpo, alambre, cola, letras], pos=mm(*pos))


def construir():
    partes = [soporte(), cautin(), cable(), limpiador((112, 34, 0)), jeringa((30, -82, 9.5)), carrete((-108, 58, 0))]
    raiz = L.grupo("soldador_set", partes)
    raiz["pieza"] = "soldador"
    return raiz


if __name__ == "__main__":
    L.limpiar()
    construir()
