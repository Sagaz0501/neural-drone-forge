"""
Las impresoras 3D del taller (marca inventada: Forja3D), a escala real, en metros. Z arriba (Blender), -Y = el frente.
El exportador glTF las pasa a three.js con Y arriba y el frente hacia +Z.

  imp_mini  "Forja Mini"   cama que se mueve (bed-slinger) de 180 mm, una columna a la izquierda, brazo en voladizo,
                           carrete naranja arriba de la columna
  imp_pro   "Forja Pro"    lo mismo en grande (cama de 256 mm) + el "Carrusel 4" a la derecha (4 carretes, 4 tubos)
  imp_x     "Forja X"      CoreXY cerrada: puerta de vidrio, tapa de vidrio, cama de 256 mm que baja en Z, la unidad de
                           4 carretes arriba

EL CONTRATO CON EL JUEGO (nombres exactos de los nodos; el juego los busca con getObjectByName):

  impresora            la raíz: origen en el centro de abajo de la impresora (z = 0). En imp_pro el Carrusel queda a la
                       derecha, fuera de ese centro. extras: modelo, nombre, cama_alto (altura de la superficie de la cama
                       en reposo, m)
  cama                 la cama (se mueve entera: placa + lámina PEI). imp_mini/pro: extras rango_y = medio recorrido en Y
                       (Blender; en three es Z); imp_x: rango_z = cuánto BAJA desde el reposo (la cama arranca arriba,
                       pegada a la boquilla, y baja al imprimir)
  cama_superficie      empty hijo de "cama", en el centro de la cara de arriba de la lámina: ahí se pega la pieza impresa
  brazo                lo que sube (bed-slinger: el brazo en X con el cabezal). extras z0 = 0 (en reposo la punta de la
                       boquilla queda 1 mm sobre cama_superficie, con cama y cabezal centrados) y rango_z = cuánto puede
                       subir. imp_x: el puente en X, que se mueve en Y (rango_y = medio recorrido) y no sube (rango_z = 0)
  cabezal              hijo de "brazo": origen en la punta de la boquilla. extras rango_x = medio recorrido en X
  boquilla             malla hija de "cabezal", material "boquilla" (latón: el juego la hace brillar)
  pantalla             malla de la pantalla, material "pantalla" (emisivo, con la interfaz dibujada)
  carrete              imp_mini: el carrete (origen en su eje, que va a lo largo de Y: gira con rotation.y de Blender =
                       rotation.z en three). imp_pro / imp_x: carrete_1 .. carrete_4, lado a lado, con el eje en X
                       (giran con rotation.x, igual en Blender y en three)
  puerta               imp_x: la puerta de vidrio, origen en la bisagra (lado izquierdo, eje vertical)

Así, para imprimir una capa a la altura h: brazo sube h (bed-slinger) o la cama baja h (imp_x), el cabezal va en X y la
cama (o el brazo en imp_x) va en Y.
"""
import math
import random

import bpy
import numpy as np
from mathutils import Matrix

import lib_piezas as L

PI = math.pi


# ---------------------------------------------------------------- materiales
def _temas(id):
    if id == "imp_mini":
        return dict(cuerpo=(0.78, 0.79, 0.80), oscuro=(0.045, 0.047, 0.052), acento=(0.95, 0.32, 0.03))
    if id == "imp_pro":
        return dict(cuerpo=(0.11, 0.115, 0.125), oscuro=(0.03, 0.031, 0.035), acento=(0.95, 0.32, 0.03))
    return dict(cuerpo=(0.06, 0.062, 0.068), oscuro=(0.02, 0.021, 0.024), acento=(0.95, 0.32, 0.03))


def m_cuerpo(t):  return L.mat("plastico_cuerpo", t["cuerpo"], rough=0.42)
def m_oscuro(t):  return L.mat("plastico_oscuro", t["oscuro"], rough=0.5)
def m_acento(t):  return L.mat("acento_naranja", t["acento"], rough=0.4)
def m_alu():      return L.mat("aluminio", (0.70, 0.71, 0.73), rough=0.32, metal=1.0)
def m_alu_osc():  return L.mat("aluminio_anodizado", (0.10, 0.10, 0.11), rough=0.35, metal=0.9)
def m_acero():    return L.m_acero()
def m_goma():     return L.mat("goma", (0.015, 0.015, 0.017), rough=0.85)
def m_tubo():     return L.mat("tubo_ptfe", (0.85, 0.87, 0.88), rough=0.25, alpha=0.75)
def m_vidrio():   return L.mat("vidrio", (0.55, 0.65, 0.70), rough=0.04, alpha=0.16)
def m_humo():     return L.mat("vidrio_ahumado", (0.08, 0.08, 0.09), rough=0.06, alpha=0.38)
def m_blanco():   return L.mat("letras_blancas", (0.9, 0.9, 0.9), rough=0.5)
def m_boquilla(): return L.mat("boquilla", (0.80, 0.55, 0.18), rough=0.28, metal=1.0)
def m_led():      return L.mat("led", (0.9, 0.95, 1.0), emit=4.0)


def m_pantalla():
    """la interfaz dibujada con numpy: fondo azul oscuro, barra arriba, anillo de progreso, botones"""
    lz = L.Lienzo(256, 160, 0, 1, 0, 0.625, (0.02, 0.04, 0.09))
    lz.rect(0, 0.56, 1, 0.625, (0.05, 0.12, 0.25))
    lz.rect(0.03, 0.575, 0.25, 0.61, (0.95, 0.45, 0.10))
    lz.rect(0.82, 0.578, 0.97, 0.607, (0.25, 0.85, 0.45))
    lz.circulo(0.24, 0.30, 0.17, (0.10, 0.65, 1.0), 0.135, (0.02, 0.04, 0.09))
    lz.circulo(0.24, 0.30, 0.06, (0.95, 0.45, 0.10))
    for k, ancho in enumerate((0.42, 0.30, 0.36)):
        y = 0.44 - k * 0.11
        lz.rect(0.48, y, 0.48 + ancho, y + 0.045, (0.30, 0.55, 0.85))
    lz.rect(0.48, 0.06, 0.70, 0.14, (0.10, 0.35, 0.65))
    lz.rect(0.74, 0.06, 0.96, 0.14, (0.75, 0.25, 0.08))
    img = lz.imagen("pantalla_ui")
    m = bpy.data.materials.new("pantalla")
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    nt.links.new(tex.outputs["Color"], b.inputs["Base Color"])
    nt.links.new(tex.outputs["Color"], b.inputs["Emission Color"])
    b.inputs["Emission Strength"].default_value = 1.6
    b.inputs["Roughness"].default_value = 0.08
    L._MATS["pantalla"] = m
    return m


def m_pei(B):
    """la lámina PEI texturizada: dorado con puntitos"""
    if "lamina_pei" in L._MATS:
        return L._MATS["lamina_pei"]
    n = 256
    rng = np.random.default_rng(7)
    base = np.array((0.80, 0.62, 0.30), np.float32)
    ruido = rng.normal(0, 1, (n, n)).astype(np.float32)
    # puntos claros y oscuros + un grano suave
    px = base * (1 + 0.10 * ruido[..., None])
    claros = rng.random((n, n)) < 0.04
    px[claros] = (0.98, 0.86, 0.55)
    oscuros = rng.random((n, n)) < 0.03
    px[oscuros] = (0.45, 0.32, 0.12)
    # borde negro de 3 mm y la marca en una esquina
    lz = L.Lienzo(n, n, -B / 2, B / 2, -B / 2, B / 2, (0, 0, 0))
    lz.px[:] = np.clip(px, 0, 1)
    lz.rect(-B / 2, -B / 2, B / 2, B / 2, (0.05, 0.04, 0.03), borde=0.006)
    lz.rect(-B / 2 + 0.012, -B / 2 + 0.008, -B / 2 + 0.05, -B / 2 + 0.014, (0.35, 0.25, 0.10))
    m = L.m_textura("lamina_pei", lz.imagen("lamina_pei"), rough=0.6, metal=0.35)
    return m


# ---------------------------------------------------------------- piezas sueltas
def vacio(nombre, pos=(0, 0, 0)):
    e = bpy.data.objects.new(nombre, None)
    e.empty_display_size = 0.01
    bpy.context.scene.collection.objects.link(e)
    e.location = pos
    return e


def cil_y(nombre, r, h, pos, material, seg=24):
    """cilindro acostado con el eje en Y (centrado en pos)"""
    c = L.cilindro(nombre, r, h, (0, 0, 0), material, seg=seg, base=False)
    c.rotation_euler.x = PI / 2
    c.location = pos
    return c


def cil_x(nombre, r, h, pos, material, seg=16):
    c = L.cilindro(nombre, r, h, (0, 0, 0), material, seg=seg, base=False)
    c.rotation_euler.y = PI / 2
    c.location = pos
    return c


def logo(nombre, s, alto, pos, material, vertical=False, cara="frente"):
    """texto pegado a una cara vertical. cara: frente (-Y) / derecha (+X)"""
    t = L.texto(nombre, s, alto, pos, material, negrita=True, espacio=1.1)
    if cara == "frente":
        t.rotation_euler = (PI / 2, -PI / 2 if vertical else 0, 0)
    else:
        t.rotation_euler = (PI / 2, 0, PI / 2)
    return t


def carrete(nombre, R, W, color, pos, flanco, seg=40, eje="Y"):
    """un carrete de filamento con el eje en Y (o X); el grupo tiene el origen en el eje (para girarlo)"""
    rh_in, rh = 0.027, max(0.040, R * 0.5)
    e = W / 2
    cuerpo = L.torno(nombre + "_cuerpo", [
        (rh_in, -e), (R - 0.002, -e), (R, -e + 0.001), (R, -e + 0.003), (rh, -e + 0.003), (rh, e - 0.003),
        (R, e - 0.003), (R, e - 0.001), (R - 0.002, e), (rh_in, e), (rh_in, -e)], flanco, seg=seg, eje="Y",
        angulo_suave=30)
    rf = R * 0.88
    perfil = [(rh, -e + 0.0032)]
    z = -e + 0.0035
    while z < e - 0.006:
        perfil += [(rf, z), (rf + 0.0012, z + 0.0018)]
        z += 0.0036
    perfil += [(rf, e - 0.0035), (rh, e - 0.0032)]
    fil = L.torno(nombre + "_filamento", perfil, L.mat(f"filamento_{nombre}", color, rough=0.3), seg=seg, eje="Y",
                  angulo_suave=60)
    # las ventanas del flanco (se ve girar) y la etiqueta del centro
    marcas = []
    for lado in (-1, 1):
        for k in range(3):
            a = 2 * PI * k / 3 + 0.3
            r = (rh + R) / 2 + 0.004
            marcas.append(cil_y("v", (R - rh) * 0.28, 0.0006, (r * math.cos(a), lado * (e + 0.0003), r * math.sin(a)),
                                L.mat(f"filamento_{nombre}", color), seg=14))
        marcas.append(L.torno("etq", [(rh_in + 0.002, 0), (rh - 0.003, 0), (rh - 0.003, 0.0005),
                                      (rh_in + 0.002, 0.0005), (rh_in + 0.002, 0)], m_blanco(), seg=seg, eje="Y"))
        marcas[-1].location.y = lado * (e + 0.0002) - (0.0005 if lado > 0 else 0)
    marcas = L.unir(marcas, nombre + "_marcas")
    if eje == "X":                    # girar las mallas (no el grupo): el eje queda en X local del grupo
        rot = Matrix.Rotation(-PI / 2, 4, "Z")
        for ob in (cuerpo, fil, marcas):
            ob.data.transform(rot @ ob.matrix_basis)
            ob.matrix_basis = Matrix.Identity(4)
    return L.grupo(nombre, [cuerpo, fil, marcas], pos=pos)


def cabezal_mallas(t, ancho=0.046, alto=0.085, prof=0.048, cuadrado=False):
    """el cabezal con la punta de la boquilla en el origen. Atrás (y > 0) va pegado al brazo"""
    y_fr = -prof * 0.6                     # frente del cuerpo
    y_at = prof * 0.4
    cuerpo = L.caja("cabezal_cuerpo", (ancho, prof, alto - 0.016), (0, (y_fr + y_at) / 2, 0.016),
                    L.mat("cabezal_claro", (0.72, 0.73, 0.75), rough=0.4) if cuadrado else m_cuerpo(t),
                    bisel=0.008 if not cuadrado else 0.004, seg=3)
    tapa = L.caja("cabezal_tapa", (ancho * 0.86, 0.004, alto * 0.62), (0, y_fr - 0.0015, 0.03),
                  m_cuerpo(t) if cuadrado else m_oscuro(t), bisel=0.0018, seg=2)
    # el ventilador del hotend al frente: aro, rejilla, rotor
    zf = 0.016 + (alto - 0.016) * 0.52
    aro = cil_y("aro", ancho * 0.36, 0.003, (0, y_fr - 0.004, zf), m_oscuro(t), seg=28)
    rejilla = [cil_y("r", ancho * (0.33 - 0.07 * k), 0.0035, (0, y_fr - 0.0046 - 0.0002 * k, zf),
                     m_alu_osc() if k % 2 else m_oscuro(t), seg=24) for k in range(4)]
    franja = L.caja("franja", (ancho * 0.86, 0.0045, 0.006), (0, y_fr - 0.0018, alto - 0.014), m_acento(t))
    letra = logo("cab_logo", "F", 0.007, (0, y_fr - 0.0045, 0.022), m_acento(t))
    # el ducto de enfriamiento de la pieza (abajo, adelante) y el disipador a los lados
    ducto = L.caja("ducto", (ancho * 0.95, 0.018, 0.010), (0, y_fr + 0.004, 0.009), m_oscuro(t), bisel=0.003, seg=2)
    boca = L.caja("ducto_boca", (ancho * 0.5, 0.008, 0.004), (0, y_fr + 0.018, 0.006), m_goma())
    aletas = [L.caja("aleta", (0.001, prof * 0.55, alto * 0.42), (sx * (ancho / 2 + 0.0006), y_at - prof * 0.45, 0.03),
                     m_alu_osc()) for sx in (-1, 1)]
    bloque = L.caja("bloque_calentador", (0.016, 0.014, 0.008), (0, 0, 0.0055), m_alu(), bisel=0.0008)
    cable = L.tubo("cable_cabezal", [(ancho * 0.25, y_at, alto - 0.01), (ancho * 0.25, y_at + 0.01, alto + 0.008),
                                     (ancho * 0.2, y_at + 0.03, alto + 0.02)], 0.0025, m_goma(), lados=8, suave=4)
    mallas = L.unir([cuerpo, tapa, aro, *rejilla, franja, letra, ducto, boca, *aletas, bloque, cable], "cabezal_carcasa")
    boquilla = L.torno("boquilla", [(0, 0), (0.0004, 0), (0.0012, 0.0012), (0.0028, 0.0028), (0.0034, 0.0028),
                                    (0.0034, 0.0058), (0, 0.0058)], m_boquilla(), seg=6, angulo_suave=20)
    return mallas, boquilla, alto


# ---------------------------------------------------------------- bed-slinger (mini y pro)
def bedslinger(id, t):
    pro = id == "imp_pro"
    B = 0.256 if pro else 0.18
    W, D = B + 0.15, B + 0.12
    Hb = 0.066 if pro else 0.056
    cw, cd = (0.06, 0.07) if pro else (0.05, 0.06)
    x_col = -W / 2 + 0.035
    y_col = 0.042 if not pro else 0.05
    bx = x_col + 0.065 + B / 2
    col_h = 0.45 if pro else 0.335
    rango_z = 0.25 if pro else 0.17
    partes = []

    # --- la base: cuerpo redondeado claro sobre una banda oscura, patas, ranuras, botón
    pie = 0.006
    banda = L.caja("base_banda", (W - 0.006, D - 0.006, 0.016), (0, 0, pie), m_oscuro(t), bisel=0.012, seg=3)
    cuerpo = L.caja("base_cuerpo", (W, D, Hb - pie - 0.012), (0, 0, pie + 0.012), m_cuerpo(t), bisel=0.01, seg=4)
    patas = [L.cilindro("pata", 0.012, pie + 0.004, (sx * (W / 2 - 0.03), sy * (D / 2 - 0.03), 0), m_goma(), seg=16)
             for sx in (-1, 1) for sy in (-1, 1)]
    ranuras = [L.caja("ranura", (0.002, 0.06, 0.0035), (W / 2 - 0.0006, 0.02, pie + 0.02 + 0.0075 * k), m_oscuro(t))
               for k in range(4)]
    boton = L.cilindro("boton", 0.006, 0.003, (W / 2 - 0.04, -D / 2 + 0.003, pie + 0.026), m_acento(t), seg=16)
    boton.rotation_euler.x = PI / 2
    boton.location.z = Hb - 0.02
    sd = L.caja("ranura_sd", (0.026, 0.002, 0.003), (W / 2 - 0.08, -D / 2 + 0.0004, Hb - 0.024), m_goma())
    # el riel de la cama (Y): canal oscuro en el medio + 2 varillas de acero + motor atrás
    z_top = Hb
    riel = L.caja("riel_y", (0.07, D - 0.03, 0.006), (bx, 0, z_top - 0.001), m_oscuro(t), bisel=0.002)
    varillas = [cil_y("varilla_y", 0.004, D - 0.02, (bx + sx * 0.055, 0, z_top + 0.008), m_acero(), seg=12)
                for sx in (-1, 1)]
    soportes = [L.caja("sop_varilla", (0.016, 0.01, 0.012), (bx + sx * 0.055, sy * (D / 2 - 0.012), z_top - 0.001),
                       m_oscuro(t), bisel=0.002) for sx in (-1, 1) for sy in (-1, 1)]
    motor_y = L.caja("motor_y", (0.042, 0.036, 0.03), (bx, D / 2 - 0.005, z_top - 0.004), m_oscuro(t), bisel=0.004)
    partes.append(L.unir([cuerpo, banda, *patas, *ranuras, boton, sd, riel, *varillas, *soportes, motor_y], "base"))

    # --- la pantalla: un atril oscuro adelante a la izquierda y la pantalla inclinada
    ang = math.radians(50)
    sw, sh = (0.09, 0.056) if pro else (0.072, 0.045)
    sx_, sy_, sz_ = x_col + 0.022, -D / 2 + 0.042, Hb + 0.016
    atril = L.caja("atril", (sw + 0.014, sh + 0.014, 0.012), (0, 0, -0.006), m_oscuro(t), bisel=0.004, seg=2, base=False)
    atril.rotation_euler.x = ang
    atril.location = (sx_, sy_ + 0.006 * math.sin(ang), sz_ - 0.006 * math.cos(ang))   # su cara de arriba en sz_
    cuna = L.caja("atril_cuna", (sw + 0.008, 0.04, sz_ - Hb), (sx_, sy_ + 0.016, Hb - 0.004), m_oscuro(t),
                  bisel=0.004)
    partes.append(L.unir([atril, cuna], "atril"))
    pant = L.caja("pantalla", (sw, sh, 0.0012), (0, 0, 0), m_pantalla(), base=False)
    L.uv_planar(pant, -sw / 2, sw / 2, -sh / 2, sh / 2)
    pant.rotation_euler.x = ang
    pant.location = (sx_, sy_ - 0.0015 * math.sin(ang), sz_ + 0.0015 * math.cos(ang))
    partes.append(pant)

    # --- la columna (Z) con su ranura, tapa arriba y el logo
    col = L.caja("columna", (cw, cd, col_h - Hb + 0.004), (x_col, y_col, Hb - 0.004), m_cuerpo(t) if not pro else m_oscuro(t),
                 bisel=0.008, seg=3)
    ranura = L.caja("columna_ranura", (cw * 0.5, 0.002, col_h - Hb - 0.03), (x_col, y_col - cd / 2 - 0.0004, Hb + 0.012),
                    m_goma())
    tapa = L.caja("columna_tapa", (cw + 0.004, cd + 0.004, 0.014), (x_col, y_col, col_h - 0.004),
                  m_oscuro(t) if not pro else m_acento(t), bisel=0.005, seg=2)
    zpie = L.caja("columna_pie", (cw + 0.02, cd + 0.02, 0.012), (x_col, y_col, Hb - 0.004), m_oscuro(t), bisel=0.005, seg=2)
    marca = logo("columna_logo", "FORJA", 0.011 if not pro else 0.014,
                 (x_col - cw / 2 - 0.0008, y_col, col_h - 0.075), m_acento(t) if not pro else m_blanco())
    marca.rotation_euler = (PI / 2, 0, -PI / 2)
    marca.rotation_euler = (PI / 2, -PI / 2, -PI / 2)
    partes.append(L.unir([col, ranura, tapa, zpie, marca], "columna"))
    nombre_txt = logo("modelo_txt", "Forja Pro" if pro else "Forja Mini", 0.008,
                      (W / 2 - 0.07, -D / 2 - 0.0008, (pie + 0.012 + Hb) / 2), m_oscuro(t) if not pro else m_blanco())
    partes.append(nombre_txt)

    # --- la cama (se mueve en Y): carro + placa calefactora + lámina PEI
    z_carro = z_top + 0.013
    carro = L.caja("cama_carro", (B * 0.62, B * 0.5, 0.01), (0, 0, 0), m_alu_osc(), bisel=0.002)
    bujes = [L.caja("buje", (0.018, 0.03, 0.012), (sx * 0.055, sy * B * 0.18, -0.008), m_oscuro(t), bisel=0.002)
             for sx in (-1, 1) for sy in (-1, 1)]
    placa = L.caja("cama_placa", (B + 0.012, B + 0.012, 0.006), (0, 0, 0.012), m_alu_osc(), bisel=0.0025, seg=2)
    tornillos = [L.cilindro("t", 0.0035, 0.0012, (sx * (B / 2 + 0.002), sy * (B / 2 + 0.002), 0.018), m_acero(), seg=10)
                 for sx in (-1, 1) for sy in (-1, 1)]
    mesh_cama = L.unir([carro, *bujes, placa, *tornillos], "cama_base")
    lam = L.caja("cama_lamina", (B, B, 0.0009), (0, 0, 0.018), m_pei(B))
    L.uv_planar(lam, -B / 2, B / 2, -B / 2, B / 2)
    pestana = L.caja("cama_pestana", (0.03, 0.012, 0.0009), (0, -B / 2 - 0.005, 0.018), m_pei(B), bisel=0.002)
    cadena = L.tubo("cama_cable", [(B * 0.2, B * 0.25, -0.002), (B * 0.2, B * 0.42, -0.003), (B * 0.2, B * 0.55, -0.01)],
                    0.003, m_goma(), lados=8, suave=4)
    z_sup = z_carro + 0.0189
    sup = vacio("cama_superficie", (0, 0, 0.0189))
    cama = L.grupo("cama", [mesh_cama, lam, pestana, cadena, sup], pos=(bx, 0, z_carro))
    cama["rango_y"] = round(B / 2, 4)
    partes.append(cama)

    # --- el brazo (sube en Z): carro de la columna + perfil de aluminio + tapa final; el cabezal corre en X
    y_brazo = y_col - 0.008
    zb = 0.058                                         # centro del perfil sobre la punta
    x0 = x_col - bx                                    # la columna, en coordenadas del brazo
    largo = (B / 2 + 0.045) - x0
    perfil = L.caja("brazo_perfil", (largo, 0.026, 0.034), (x0 + largo / 2, y_brazo, zb), m_alu(), bisel=0.0015,
                    base=False)
    surcos = [L.caja("surco", (largo - 0.02, 0.0008, 0.004), (x0 + largo / 2 + 0.01, y_brazo - 0.0131, zb + dz),
                     m_alu_osc(), base=False) for dz in (-0.009, 0.009)]
    surcos += [L.caja("surco", (largo - 0.02, 0.004, 0.0008), (x0 + largo / 2 + 0.01, y_brazo, zb + 0.0171), m_alu_osc(),
                      base=False)]
    carro_z = L.caja("brazo_carro", (cw + 0.022, cd + 0.016, 0.072), (x0, y_col, zb), m_oscuro(t), bisel=0.006, seg=3,
                     base=False)
    franja = L.caja("brazo_franja", (cw + 0.023, 0.006, 0.006), (x0, y_col - (cd + 0.016) / 2 + 0.002, zb + 0.026),
                    m_acento(t), base=False)
    motor_x = L.caja("motor_x", (0.04, 0.038, 0.04), (x0 + cw / 2 + 0.03, y_brazo + 0.03, zb), m_oscuro(t), bisel=0.004,
                     base=False)
    fin = L.caja("brazo_fin", (0.018, 0.034, 0.042), (B / 2 + 0.045, y_brazo, zb), m_oscuro(t), bisel=0.005, seg=2,
                 base=False)
    correa = L.caja("correa", (largo - 0.03, 0.002, 0.006), (x0 + largo / 2, y_brazo + 0.0135, zb), m_goma(), base=False)
    brazo_m = L.unir([perfil, *surcos, carro_z, franja, motor_x, fin, correa], "brazo_estructura")
    cab_m, boq, alto_cab = cabezal_mallas(t, ancho=0.05 if pro else 0.046, alto=0.088 if pro else 0.082)
    cabezal = L.grupo("cabezal", [cab_m, boq], pos=(0, 0, 0))
    cabezal["rango_x"] = round(B / 2, 4)
    brazo = L.grupo("brazo", [brazo_m, cabezal], pos=(bx, 0, z_sup + 0.001))
    brazo["z0"] = 0.0
    brazo["rango_z"] = rango_z
    partes.append(brazo)

    # --- arriba de la columna: el portacarrete con el carrete naranja (solo la mini) y el tubo al cabezal
    top = col_h + 0.01
    if not pro:
        R, Wc = 0.075, 0.052
        poste = L.caja("porta_poste", (0.016, 0.02, 0.03), (x_col, y_col, top - 0.004), m_oscuro(t), bisel=0.003)
        eje = cil_y("porta_eje", 0.022, Wc + 0.02, (x_col, y_col, top + R + 0.004), m_oscuro(t), seg=20)
        brazo_eje = L.caja("porta_brazo", (0.016, 0.012, R + 0.01), (x_col, y_col + Wc / 2 + 0.012, top), m_oscuro(t),
                           bisel=0.003)
        partes.append(L.unir([poste, eje, brazo_eje], "portacarrete"))
        partes.append(carrete("carrete", R, Wc, (0.95, 0.30, 0.02), (x_col, y_col, top + R + 0.004),
                              L.mat("carton", (0.42, 0.28, 0.14), rough=0.8)))
        sale = (x_col + 0.012, y_col - 0.01, top + 0.03)
        pts = [sale, (x_col + 0.06, y_col - 0.03, top + 0.05), (bx - 0.02, -0.01, z_sup + 0.22),
               (bx, 0.004, z_sup + alto_cab + 0.05), (0 + bx, 0.004, z_sup + alto_cab - 0.002)]
        partes.append(L.tubo("tubo_bowden", pts, 0.0022, m_tubo(), lados=8, suave=8))
    else:
        partes += carrusel(t, (W / 2 + 0.2, 0.06), (bx, 0.004, z_sup + alto_cab))
    raiz = L.grupo("impresora", partes)
    raiz["cama_alto"] = round(z_sup, 4)
    return raiz


def carrusel(t, xy, destino):
    """el Carrusel 4: caja baja con 4 carretes bajo una tapa transparente y 4 tubos hasta el cabezal"""
    cx, cy = xy
    w, d, h = 0.30, 0.20, 0.07
    caja = L.caja("carrusel_caja", (w, d, h), (cx, cy, 0.004), m_oscuro(t), bisel=0.012, seg=3)
    patas = [L.cilindro("pata", 0.01, 0.005, (cx + sx * (w / 2 - 0.025), cy + sy * (d / 2 - 0.025), 0), m_goma(), seg=12)
             for sx in (-1, 1) for sy in (-1, 1)]
    franja = L.caja("carrusel_franja", (w - 0.02, 0.003, 0.006), (cx, cy - d / 2 - 0.0005, h - 0.016), m_acento(t))
    leds = [L.caja("led", (0.012, 0.002, 0.003), (cx + (k - 1.5) * 0.068, cy - d / 2 - 0.0008, 0.03), m_led())
            for k in range(4)]
    txt = logo("carrusel_txt", "CARRUSEL 4", 0.008, (cx - w / 2 + 0.05, cy - d / 2 - 0.0009, 0.045), m_blanco())
    tapa = L.caja("carrusel_tapa", (w - 0.006, d - 0.006, 0.135), (cx, cy, h + 0.004), m_humo(), bisel=0.03, seg=4)
    bisagra = L.caja("carrusel_bisagra", (w - 0.04, 0.012, 0.01), (cx, cy + d / 2 - 0.006, h + 0.002), m_oscuro(t))
    partes = [L.unir([caja, *patas, franja, txt, bisagra], "carrusel"), L.unir(leds, "carrusel_leds"), tapa]
    colores = [(0.95, 0.30, 0.02), (0.02, 0.25, 0.85), (0.85, 0.85, 0.82), (0.03, 0.03, 0.035)]
    R, Wc = 0.075, 0.055
    for k in range(4):
        x = cx + (k - 1.5) * 0.068
        partes.append(carrete(f"carrete_{k + 1}", R, Wc, colores[k], (x, cy, h + 0.004 + R - 0.03),
                              L.mat("flanco_negro", (0.03, 0.03, 0.035), rough=0.35), seg=36, eje="X"))
        partes += [cil_x("rodillo", 0.006, 0.05, (x, cy + sy * 0.045, h + 0.004), m_alu(), seg=10) for sy in (-1, 1)]
    # los 4 tubos: salen de atrás de la tapa, suben y bajan al cabezal
    tx, ty, tz = destino
    tubos = []
    for k in range(4):
        x = cx + (k - 1.5) * 0.068
        s = (k - 1.5) * 0.004
        pts = [(x, cy + d / 2 + 0.002, h - 0.02), (x - 0.01, cy + d / 2 + 0.03, h + 0.02),
               ((x + tx) / 2 + 0.05, 0.14 + s, tz + 0.12), (tx + 0.03 + s, 0.03, tz + 0.08), (tx + s, 0.004, tz + 0.015)]
        tubos.append(L.tubo("t", pts, 0.0022, m_tubo(), lados=8, suave=8))
    partes.append(L.unir(tubos, "tubos_carrusel"))
    return partes


# ---------------------------------------------------------------- CoreXY cerrada (imp_x)
def corexy(t):
    W, D, H = 0.39, 0.40, 0.46
    B = 0.256
    hp = 0.06                                          # el zócalo
    pc = 0.024                                         # postes
    partes = []
    zocalo = L.caja("zocalo", (W, D, hp), (0, 0, 0.006), m_cuerpo(t), bisel=0.01, seg=3)
    patas = [L.cilindro("pata", 0.014, 0.008, (sx * (W / 2 - 0.035), sy * (D / 2 - 0.035), 0), m_goma(), seg=16)
             for sx in (-1, 1) for sy in (-1, 1)]
    postes = [L.caja("poste", (pc, pc, H - hp - 0.004), (sx * (W / 2 - pc / 2), sy * (D / 2 - pc / 2), hp + 0.004),
                     m_cuerpo(t), bisel=0.004, seg=2) for sx in (-1, 1) for sy in (-1, 1)]
    marco = []
    for sy in (-1, 1):
        marco.append(L.caja("marco_x", (W, pc, 0.03), (0, sy * (D / 2 - pc / 2), H - 0.03), m_cuerpo(t), bisel=0.004, seg=2))
    for sx in (-1, 1):
        marco.append(L.caja("marco_y", (pc, D, 0.03), (sx * (W / 2 - pc / 2), 0, H - 0.03), m_cuerpo(t), bisel=0.004, seg=2))
    # la banda de arriba adelante (con la pantalla) y los paneles laterales/atrás (opacos)
    banda = L.caja("banda_frente", (W - 0.004, 0.03, 0.06), (0, -D / 2 + 0.015, H - 0.06), m_cuerpo(t), bisel=0.006, seg=2)
    interior = L.mat("panel_interior", (0.16, 0.165, 0.175), rough=0.6)
    paneles = [L.caja("panel_lado", (0.004, D - 2 * pc + 0.004, H - hp - 0.03), (sx * (W / 2 - 0.004), 0, hp), interior)
               for sx in (-1, 1)]
    paneles.append(L.caja("panel_atras", (W - 2 * pc + 0.004, 0.004, H - hp - 0.03), (0, D / 2 - 0.004, hp), interior))
    piso = L.caja("piso", (W - 0.03, D - 0.03, 0.002), (0, 0, hp), m_alu_osc())
    franja = L.caja("franja_zocalo", (W - 0.04, 0.003, 0.006), (0, -D / 2 - 0.0006, hp - 0.02), m_acento(t))
    marca = logo("logo_x", "FORJA X", 0.013, (-W / 2 + 0.075, -D / 2 - 0.001, hp - 0.03), m_blanco())
    led = L.caja("led_interior", (W - 0.07, 0.006, 0.004), (0, -D / 2 + 0.035, H - 0.068), m_led())
    rejilla = [L.caja("rejilla", (0.05, 0.002, 0.003), (sx * 0.12, D / 2 - 0.0005, 0.03 + 0.006 * k), m_goma())
               for sx in (-1, 1) for k in range(4)]
    partes.append(L.unir([zocalo, *patas, *postes, *marco, banda, *paneles, piso, franja, marca, *rejilla], "gabinete"))
    partes.append(led)
    # pantalla en la banda de arriba, a la derecha
    sw, sh = 0.09, 0.046
    pant = L.caja("pantalla", (sw, sh, 0.0012), (0, 0, 0), m_pantalla(), base=False)
    L.uv_planar(pant, -sw / 2, sw / 2, -sh / 2, sh / 2)
    pant.rotation_euler.x = PI / 2
    pant.location = (W / 2 - 0.08, -D / 2 - 0.0007, H - 0.03)
    marcop = L.caja("pantalla_marco", (sw + 0.008, 0.002, sh + 0.008), (W / 2 - 0.08, -D / 2 + 0.0005, H - 0.03 - sh / 2 - 0.004),
                    m_goma())
    partes += [pant, marcop]
    # tapa de vidrio
    partes.append(L.caja("tapa_vidrio", (W - 2 * pc + 0.006, D - 2 * pc + 0.006, 0.004), (0, 0, H - 0.008), m_vidrio()))

    # husillos de Z (fijos) atrás y adelante a la izquierda
    zt = H - 0.03
    husillos = []
    for (x, y) in ((-0.15, 0.15), (0.15, 0.15), (-0.15, -0.15)):
        husillos.append(L.cilindro("husillo", 0.004, zt - hp, (x, y, hp), m_acero(), seg=12))
        husillos.append(L.caja("motor_z", (0.03, 0.03, 0.02), (x, y, hp), m_oscuro(t)))
    partes.append(L.unir(husillos, "husillos_z"))

    # el puente (brazo): varillas en X entre dos carros que corren por las varillas Y de los lados
    z_varillas = 0.35
    z_boq = z_varillas - 0.06
    yv = [L.cilindro("varilla_y", 0.004, D - 2 * pc, (0, 0, 0), m_acero(), seg=12, base=False) for _ in (0, 1)]
    for k, sx in enumerate((-1, 1)):
        yv[k].rotation_euler.x = PI / 2
        yv[k].location = (sx * (W / 2 - 0.035), 0, z_varillas)
    partes.append(L.unir(yv, "varillas_y"))
    xs = []
    for dz in (-0.01, 0.012):
        xs.append(cil_x("varilla_x", 0.0035, W - 0.08, (0, 0.012, 0.06 + dz), m_acero(), seg=12))
    carros = [L.caja("carro_y", (0.03, 0.05, 0.036), (sx * (W / 2 - 0.035), 0.012, 0.06), m_oscuro(t), bisel=0.004,
                     base=False) for sx in (-1, 1)]
    correas = [L.caja("correa", (W - 0.08, 0.002, 0.006), (0, 0.034 + 0.004 * k, 0.06), m_goma(), base=False) for k in (0, 1)]
    brazo_m = L.unir([*xs, *carros, *correas], "puente_x")
    cab_m, boq, alto_cab = cabezal_mallas(t, ancho=0.05, alto=0.08, prof=0.05, cuadrado=True)
    cabezal = L.grupo("cabezal", [cab_m, boq])
    cabezal["rango_x"] = round(B / 2, 4)
    brazo = L.grupo("brazo", [brazo_m, cabezal], pos=(0, -0.012, z_boq))
    brazo["z0"] = 0.0
    brazo["rango_z"] = 0.0
    brazo["rango_y"] = round(B / 2, 4)
    partes.append(brazo)

    # la cama (baja en Z): marco con brazos hacia los husillos + placa + lámina
    z_sup = z_boq - 0.001
    marco_c = L.caja("cama_marco", (B * 0.8, B * 0.8, 0.008), (0, 0, -0.018), m_alu_osc(), bisel=0.002)
    brazos_c = [L.tubo("b", [(0, 0, -0.014), (x * 0.6, y * 0.6, -0.014), (x, y, -0.014)], 0.006, m_alu_osc(), lados=6,
                       suave=0) for x, y in ((-0.15, 0.15), (0.15, 0.15), (-0.15, -0.15))]
    tuercas = [L.cilindro("tuerca", 0.009, 0.012, (x, y, -0.02), m_boquilla() if False else m_alu(), seg=12)
               for x, y in ((-0.15, 0.15), (0.15, 0.15), (-0.15, -0.15))]
    placa = L.caja("cama_placa", (B + 0.01, B + 0.01, 0.006), (0, 0, -0.0069), m_alu_osc(), bisel=0.002)
    base_c = L.unir([marco_c, *brazos_c, *tuercas, placa], "cama_base")
    lam = L.caja("cama_lamina", (B, B, 0.0009), (0, 0, -0.0009), m_pei(B))
    L.uv_planar(lam, -B / 2, B / 2, -B / 2, B / 2)
    sup = vacio("cama_superficie", (0, 0, 0))
    cama = L.grupo("cama", [base_c, lam, sup], pos=(0, -0.012, z_sup))
    cama["rango_z"] = 0.2
    partes.append(cama)

    # la puerta de vidrio (bisagra a la izquierda)
    pw, ph = W - 0.01, H - hp - 0.066
    vidrio = L.caja("puerta_vidrio", (pw, 0.004, ph), (pw / 2, 0, 0), m_vidrio())
    borde = [L.caja("puerta_borde", (pw, 0.005, 0.008), (pw / 2, 0, z), m_goma()) for z in (0, ph - 0.008)]
    borde += [L.caja("puerta_borde", (0.008, 0.005, ph), (x, 0, 0), m_goma()) for x in (0.004, pw - 0.004)]
    manija = L.caja("puerta_manija", (0.01, 0.012, 0.12), (pw - 0.02, -0.007, ph / 2 - 0.06), m_alu(), bisel=0.003)
    puerta = L.grupo("puerta", [L.unir([vidrio], "puerta_vidrio"), L.unir([*borde, manija], "puerta_marco")],
                     pos=(-W / 2 + 0.005, -D / 2 - 0.004, hp + 0.004))
    partes.append(puerta)

    # arriba: la unidad de 4 carretes con tapa ahumada, y los 4 tubos que bajan por atrás
    uw, ud, uh = 0.36, 0.27, 0.065
    ub = H + 0.004
    unidad = L.caja("unidad_caja", (uw, ud, uh), (0, 0.01, ub), m_cuerpo(t), bisel=0.01, seg=3)
    gomas = [L.cilindro("goma", 0.01, 0.004, (sx * 0.15, 0.01 + sy * 0.1, H), m_goma(), seg=12) for sx in (-1, 1) for sy in (-1, 1)]
    ufranja = L.caja("unidad_franja", (uw - 0.03, 0.003, 0.006), (0, 0.01 - ud / 2 - 0.0005, ub + uh - 0.018), m_acento(t))
    leds = [L.caja("led", (0.014, 0.002, 0.003), ((k - 1.5) * 0.075, 0.01 - ud / 2 - 0.0008, ub + 0.022), m_led())
            for k in range(4)]
    utapa = L.caja("unidad_tapa", (uw - 0.006, ud - 0.006, 0.145), (0, 0.01, ub + uh), m_humo(), bisel=0.035, seg=4)
    partes += [L.unir([unidad, *gomas, ufranja], "unidad_carretes"), L.unir(leds, "unidad_leds"), utapa]
    colores = [(0.95, 0.30, 0.02), (0.02, 0.25, 0.85), (0.85, 0.85, 0.82), (0.75, 0.05, 0.08)]
    R, Wc = 0.08, 0.058
    tubos = []
    for k in range(4):
        x = (k - 1.5) * 0.075
        partes.append(carrete(f"carrete_{k + 1}", R, Wc, colores[k], (x, 0.01, ub + uh + R - 0.035),
                              L.mat("flanco_negro", (0.03, 0.03, 0.035), rough=0.35), seg=36, eje="X"))
        tubos.append(L.tubo("t", [(x, ud / 2 - 0.01, ub + 0.03), (x * 0.8, D / 2 + 0.03, ub + 0.0),
                                  (x * 0.5, D / 2 + 0.03, H - 0.08), (x * 0.3, D / 2 - 0.005, H - 0.12)],
                            0.0022, m_tubo(), lados=8, suave=6))
    # adentro: un tubo del pasamuros atrás al cabezal
    tubos.append(L.tubo("t", [(0, D / 2 - 0.01, H - 0.12), (0, D / 2 - 0.06, H - 0.09), (0.01, 0.05, z_boq + 0.12),
                              (0, -0.006, z_boq + alto_cab + 0.01)], 0.0025, m_tubo(), lados=8, suave=6))
    partes.append(L.unir(tubos, "tubos"))
    raiz = L.grupo("impresora", partes)
    raiz["cama_alto"] = round(z_sup, 4)
    return raiz


NOMBRES = {"imp_mini": "Forja Mini", "imp_pro": "Forja Pro", "imp_x": "Forja X"}


def construir(id="imp_mini"):
    random.seed(3)
    t = _temas(id)
    raiz = corexy(t) if id == "imp_x" else bedslinger(id, t)
    raiz["pieza"] = f"impresora_{id}"
    raiz["modelo"] = id
    raiz["nombre"] = NOMBRES[id]
    return raiz


if __name__ == "__main__":
    L.limpiar()
    construir()
