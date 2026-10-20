"""
El multímetro digital de bolsillo (tipo DT-830 con funda de goma amarilla), a escala real (mm -> mm()). Acostado en
la mesa, la pantalla hacia +Y. Cada cosa que el juego mueve es un nodo con nombre en el GLB:

  multimetro
    cuerpo (funda, frente, serigrafía, botones, bornes)
    pantalla            <- plano con UV 0..1: el juego le pone un canvas con la lectura (mesa.js, garaje)
    perilla             <- el selector giratorio (gira en su eje: el juego lo pone en Ω / continuidad / V)
    punta_roja / punta_negra   <- el origen es la PUNTA de metal; el mango sale por +Z (en three: +Y)
    cable_rojo / cable_negro   <- los cables en reposo (la mesa los esconde y dibuja los suyos, que siguen a las puntas)
    enchufes            <- las bananas metidas en los bornes (COM negro, VΩ rojo)

Z arriba, la mesa en z = 0.
"""
import math

from mathutils import Vector

import lib_piezas as L
from lib_piezas import mm

ANCHO, LARGO, ALTO = 80, 158, 30          # la funda
DIAL = (0, -18)                           # centro de la perilla
BORNES = {"10A": (-22, -58), "COM": (0, -58), "VΩ": (22, -58)}
LCD = (0, 44, 54, 24)                     # centro x, y, ancho, alto del vidrio


def m_funda():     return L.mat("funda_amarilla", (0.80, 0.50, 0.01), rough=0.62)
def m_frente():    return L.mat("frente_gris", (0.035, 0.037, 0.04), rough=0.45)
def m_lcd():       return L.mat("pantalla_lcd", (0.36, 0.42, 0.33), rough=0.2)
def m_bisel():     return L.mat("bisel_negro", (0.01, 0.01, 0.012), rough=0.15)
def m_perilla():   return L.mat("perilla_gris", (0.10, 0.10, 0.11), rough=0.5)
def m_rojo():      return L.mat("goma_roja", (0.55, 0.02, 0.015), rough=0.45)
def m_negro():     return L.mat("goma_negra_mm", (0.015, 0.015, 0.017), rough=0.55)
def m_cromo():     return L.mat("cromo_mm", (0.85, 0.86, 0.88), rough=0.2, metal=1.0)
def m_boton(c):    return L.mat(f"boton_{c[0]:.2f}", c, rough=0.4)


def cuerpo():
    funda = L.caja("funda", mm(ANCHO, LARGO, ALTO), mm(0, 0, 0), m_funda(), bisel=mm(7), seg=3)
    frente = L.caja("frente", mm(ANCHO - 12, LARGO - 14, 2), mm(0, 0, ALTO - 1.2), m_frente(), bisel=mm(2), seg=2)
    cx, cy, w, h = LCD
    bisel = L.caja("lcd_bisel", mm(w + 8, h + 10, 0.8), mm(cx, cy, ALTO + 0.7), m_bisel(), bisel=mm(1.2), seg=1)
    blanco = L.m_serigrafia()
    letras = [L.texto("t", "DRON MAKER", mm(4.2), mm(0, 66, ALTO + 0.85), blanco, negrita=True),
              ]
    # las posiciones de la perilla escritas alrededor (OFF arriba; horario: V⎓, V~, Ω, continuidad, A)
    for ang, s in [(90, "OFF"), (45, "V="), (10, "V~"), (-30, "Ω"), (-70, ")))"), (135, "A"), (170, "hFE")]:
        a = math.radians(ang)
        letras.append(L.texto("t", s, mm(3.0), mm(DIAL[0] + 30 * math.cos(a), DIAL[1] + 30 * math.sin(a), ALTO + 0.85), blanco,
                              negrita=True))
    for nombre, (x, y) in BORNES.items():
        letras.append(L.texto("t", nombre, mm(2.8), mm(x, y - 10, ALTO + 0.85), blanco, negrita=True))
    letras = L.unir(letras, "serigrafia")
    botones = [L.caja("b", mm(12, 6, 2), mm(x, 19, ALTO), m_boton(c), bisel=mm(1), seg=1)
               for x, c in [(-20, (0.7, 0.55, 0.05)), (0, (0.05, 0.2, 0.6)), (20, (0.3, 0.3, 0.32))]]
    botones = L.unir(botones, "botones")
    bornes = []
    for nombre, (x, y) in BORNES.items():
        mat = m_rojo() if nombre == "VΩ" else m_negro()
        bornes.append(L.anillo("borne", mm(6.2), mm(2.2), mm(3), mm(x, y, ALTO), mat, seg=24))
        bornes.append(L.cilindro("borne_metal", mm(2.2), mm(1.2), mm(x, y, ALTO - 0.6), m_cromo(), seg=16))
    bornes = L.unir(bornes, "bornes")
    # la pata de atrás (abajo) y los costados de goma más gruesos
    return L.grupo("cuerpo", [funda, frente, bisel, letras, botones, bornes])


def pantalla():
    cx, cy, w, h = LCD
    ob = L.caja("pantalla", mm(w, h, 0.2), mm(0, 0, 0), m_lcd(), base=False)
    L.uv_planar(ob, mm(-w / 2), mm(w / 2), mm(-h / 2), mm(h / 2))
    ob.location = mm(cx, cy, ALTO + 1.65)          # encima del bisel (que llega a ALTO + 1.5)
    return ob


def perilla():
    base = L.cilindro("perilla_base", mm(24), mm(1.5), mm(0, 0, 0), m_bisel(), seg=40)
    pomo = L.torno("perilla_pomo", [(r / 1000, z / 1000) for r, z in [
        (0, 1.5), (20, 1.5), (20.5, 2.5), (20, 5), (19, 6), (0, 6)]], m_perilla(), seg=40)
    barra = L.caja("perilla_barra", mm(9, 38, 5), mm(0, 0, 5.5), m_perilla(), bisel=mm(2), seg=2)
    flecha = L.caja("perilla_flecha", mm(2, 13, 0.4), mm(0, 11, 10.5), L.m_serigrafia())
    g = L.unir([base, pomo, barra, flecha], "perilla_malla")
    return L.grupo("perilla", [g], pos=mm(DIAL[0], DIAL[1], ALTO))


def punta(nombre, mat):
    """la punta de prueba: la aguja en el origen, el mango hacia +Z"""
    aguja = L.torno(nombre + "_aguja", [(r / 1000, z / 1000) for r, z in [
        (0, 0), (0.35, 0.6), (0.75, 3), (0.75, 16), (1.6, 17), (0, 17)]], m_cromo(), seg=12)
    mango = L.torno(nombre + "_mango", [(r / 1000, z / 1000) for r, z in [
        (0, 15), (2.4, 15), (3.2, 19), (7.2, 21), (7.4, 23.5), (4.6, 25.5), (4.2, 32), (4.8, 40), (4.8, 96), (4.2, 100),
        (3.0, 112), (2.2, 124), (0, 124)]], mat, seg=20)
    anillos = [L.cilindro("a", mm(4.95), mm(1.2), mm(0, 0, z), m_negro() if mat is not m_negro() else m_rojo(), seg=20)
               for z in (44, 47)]
    g = L.unir([aguja, mango] + anillos, nombre + "_malla")
    return L.grupo(nombre, [g])


def reposo(p, x, y, giro=0.0):
    """acostada en la mesa al lado del multímetro: la punta hacia +Y, apoyada en el guardamano"""
    p.location = mm(x, y, 7.2)
    p.rotation_euler = (math.radians(90) - 0.06, 0, giro)


def cable(nombre, borne, fin, mat):
    """del borne (sube, sale al costado) hasta el final del mango de la punta"""
    bx, by = BORNES[borne]
    pts = [(bx, by, ALTO + 14), (bx, by, ALTO + 26), (bx + 6, by - 18, ALTO + 18), (bx + 30, by - 34, 6),
           (fin.x + 8, fin.y - 30, 2.4), (fin.x, fin.y - 6, 4.5), (fin.x, fin.y, fin.z)]
    return L.tubo(nombre, [mm(*p) for p in pts], mm(1.6), mat, lados=8, suave=6)


def enchufe(borne, mat):
    bx, by = BORNES[borne]
    cuerpo = L.torno("banana", [(r / 1000, z / 1000) for r, z in [
        (0, ALTO), (2, ALTO), (2, ALTO + 3), (4.5, ALTO + 3.5), (4.5, ALTO + 12), (2.2, ALTO + 15), (0, ALTO + 15)]],
        mat, seg=16)
    cuerpo.location = mm(bx, by, 0)
    return cuerpo


def construir():
    partes = [cuerpo(), pantalla(), perilla()]
    roja, negra = punta("punta_roja", m_rojo()), punta("punta_negra", m_negro())
    reposo(roja, 56, 30, 0.05)
    reposo(negra, 70, 22, -0.04)

    def fin(x, y, giro):
        """dónde termina el mango (la punta + 124 mm por su eje, ya acostada y girada)"""
        th = math.radians(90) - 0.06
        d = Vector((0, -math.sin(th), math.cos(th)))
        d = Vector((d.x * math.cos(giro) - d.y * math.sin(giro), d.x * math.sin(giro) + d.y * math.cos(giro), d.z))
        return Vector((x, y, 7.2)) + d * 122
    fin_r, fin_n = fin(56, 30, 0.05), fin(70, 22, -0.04)
    partes += [roja, negra,
               cable("cable_rojo", "VΩ", fin_r, m_rojo()),
               cable("cable_negro", "COM", fin_n, m_negro()),
               L.unir([enchufe("VΩ", m_rojo()), enchufe("COM", m_negro())], "enchufes")]
    raiz = L.grupo("multimetro", partes)
    raiz["pieza"] = "multimetro"
    raiz["pantalla_mm"] = [LCD[2], LCD[3]]
    return raiz
