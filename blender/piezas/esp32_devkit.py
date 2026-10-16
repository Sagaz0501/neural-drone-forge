"""
ESP32 DevKitC V4 (38 pines) a escala real: placa 54,4 x 27,9 x 1,6 mm.
X = largo (la antena del módulo en +X, el USB en -X), Y = ancho, Z = arriba. Medidas en mm -> mm().

Cada pad del header es un objeto aparte: pad_<pin> (pad_GPIO23, pad_GND_1, pad_3V3, pad_5V…), con
propiedades propias (fila, n, etiqueta, pin) que llegan a three.js como userData.
"""
import math
import random

import bmesh
import bpy

import lib_piezas as L
from lib_piezas import mm

LARGO, ANCHO, GROSOR = 54.4, 27.9, 1.6
PASO = 2.54
FILA_Y = 12.7                       # las dos filas a 1" de distancia
X_PIN1 = 21.66                      # el pin 1 (3V3) del lado de la antena
MOD_X0, MOD_X1, MOD_Y = 1.7, 27.2, 9.0   # el módulo ESP-WROOM-32 (25,5 x 18 mm)

# pinout real del DevKitC V4 (de arriba = antena, hacia abajo = USB)
J2 = [("3V3", "3V3"), ("EN", "EN"), ("GPIO36", "SVP"), ("GPIO39", "SVN"), ("GPIO34", "34"), ("GPIO35", "35"),
      ("GPIO32", "32"), ("GPIO33", "33"), ("GPIO25", "25"), ("GPIO26", "26"), ("GPIO27", "27"), ("GPIO14", "14"),
      ("GPIO12", "12"), ("GND", "GND"), ("GPIO13", "13"), ("GPIO9", "D2"), ("GPIO10", "D3"), ("GPIO11", "CMD"),
      ("5V", "5V")]
J3 = [("GND", "GND"), ("GPIO23", "23"), ("GPIO22", "22"), ("GPIO1", "TX"), ("GPIO3", "RX"), ("GPIO21", "21"),
      ("GND", "GND"), ("GPIO19", "19"), ("GPIO18", "18"), ("GPIO5", "5"), ("GPIO17", "17"), ("GPIO16", "16"),
      ("GPIO4", "4"), ("GPIO0", "0"), ("GPIO2", "2"), ("GPIO15", "15"), ("GPIO8", "D1"), ("GPIO7", "D0"),
      ("GPIO6", "CLK")]

# colores de la textura de la placa (sRGB, como se ven)
COL = {
    "negro": {"mascara": (0.055, 0.058, 0.062), "pista": (0.105, 0.11, 0.115), "seri": (0.88, 0.88, 0.86)},
    "verde": {"mascara": (0.10, 0.33, 0.16), "pista": (0.16, 0.45, 0.20), "seri": (0.93, 0.93, 0.9)},
}
TOP = GROSOR                        # la cara de arriba de la placa


def pin_x(i):
    return X_PIN1 - i * PASO


def P(x, y, z=TOP):
    return mm(x, y, z)


# ---------------------------------------------------------------- la placa
def textura_placa(color):
    """pistas, vías, pads SMD y contornos de serigrafía dibujados con numpy"""
    c = COL[color]
    lz = L.Lienzo(1088, 558, mm(-LARGO / 2), mm(LARGO / 2), mm(-ANCHO / 2), mm(ANCHO / 2), c["mascara"])
    pista, seri, oro, est = c["pista"], c["seri"], (0.85, 0.66, 0.36), (0.72, 0.72, 0.72)
    rnd = random.Random(32)
    W = lambda pts, a=0.28, col=pista: lz.linea([mm(*p) for p in pts], mm(a), col)

    # pistas de los pines que quedan fuera del módulo: L anidadas hacia el módulo
    for s, fila in ((1, J2), (-1, J3)):
        k = 0
        for i in range(19):
            x = pin_x(i)
            if x > MOD_X0:
                W([(x, s * FILA_Y), (x, s * 9.6)])          # entra directo bajo el módulo
                continue
            if k < 8:
                y = s * (9.7 - 0.55 * k)
                W([(x, s * FILA_Y), (x, s * (FILA_Y - 1.4)), (x + 1.0, y), (MOD_X0 + 0.5, y)])
            else:   # los de abajo bajan a una vía
                vx, vy = x + 1.6, s * (FILA_Y - 2.6)
                W([(x, s * FILA_Y), (x, s * (FILA_Y - 1.2)), (vx, vy)])
                lz.circulo(*mm(vx, vy), mm(0.38), est, mm(0.17), (0.03, 0.03, 0.03))
            k += 1
    # alimentación ancha: 5V -> regulador -> 3V3
    W([(pin_x(18), FILA_Y), (pin_x(18) + 2, 9.6), (-15.5, 9.6), (-15.5, 6.5)], 0.7)
    W([(-10.5, 5.5), (-7, 5.5), (-7, 1.5), (MOD_X0 + 0.5, 1.5)], 0.6)
    # USB -> CP2102 (par diferencial) y CP2102 -> módulo (TX/RX)
    W([(-23, 0.4), (-17, 0.4), (-15.5, -1.1), (-15.5, -3)], 0.22)
    W([(-23, -0.2), (-17.3, -0.2), (-16.1, -1.4), (-16.1, -3)], 0.22)
    W([(-10, -3.6), (-6, -3.6), (-4, -1.6), (MOD_X0 + 0.5, -1.6)], 0.22)
    W([(-10, -4.6), (-5.6, -4.6), (-3.6, -2.6), (MOD_X0 + 0.5, -2.6)], 0.22)
    # vías de tierra sueltas
    for _ in range(46):
        x, y = rnd.uniform(-20, 0.5), rnd.uniform(-8.5, 8.5)
        lz.circulo(*mm(x, y), mm(0.3), est, mm(0.14), (0.03, 0.03, 0.03))
    for _ in range(10):
        x, y = rnd.uniform(-26, -22), rnd.uniform(-9, 9)
        lz.circulo(*mm(x, y), mm(0.3), est, mm(0.14), (0.03, 0.03, 0.03))

    # pads SMD (estaño) donde van las piezas
    for x0, y0, x1, y1 in ((-14.9, 2.0, -11.1, 9.0), (-15.0, -7.5, -9.6, -1.6), (-28, -4.3, -22, 4.3)):
        lz.rect(*mm(x0, y0, x1, y1), est)
    # serigrafía: contornos de las piezas, del módulo y la marca del pin 1
    S = lambda x0, y0, x1, y1: lz.rect(*mm(x0, y0, x1, y1), seri, borde=mm(0.16))
    S(MOD_X0 - 0.5, -MOD_Y - 0.5, MOD_X1 - 0.2, MOD_Y + 0.5)
    S(-15.4, 1.7, -10.6, 9.3)            # AMS1117
    S(-15.2, -7.7, -9.4, -1.4)           # CP2102
    for y in (7.9, -7.9):
        S(-26.6, y - 1.9, -22.0, y + 1.9)  # botones
    lz.circulo(*mm(pin_x(0) + 1.4, FILA_Y), mm(0.3), seri)     # punto del pin 1
    # tierra rayada bajo la antena NO: ahí la placa va sin cobre (zona de exclusión), solo un contorno
    S(MOD_X0 + 19.3, -MOD_Y + 0.2, MOD_X1 - 0.4, MOD_Y - 0.2)
    return lz.imagen("esp32_placa")


def placa(color):
    img = textura_placa(color)
    m = L.m_textura("placa_" + color, img, rough=0.38)
    ob = L.caja("pcb", mm(LARGO, ANCHO, GROSOR), (0, 0, 0), m, bisel=mm(0.2))
    # agujeros de los headers: un booleano con todos los cilindros juntos
    corte = []
    for s in (1, -1):
        for i in range(19):
            corte.append(L.cilindro("corte", mm(0.52), mm(4), P(pin_x(i), s * FILA_Y, -1), None, seg=12))
    cutter = L.unir(corte, "cortador")
    mod = ob.modifiers.new("agujeros", "BOOLEAN")
    mod.object = cutter
    mod.operation = "DIFFERENCE"
    mod.solver = "EXACT"
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    ob.modifiers.clear()
    old = ob.data
    ob.data = me
    bpy.data.meshes.remove(old)
    me.name = "pcb"
    for f in me.polygons:                  # el booleano deja triángulos largos: plano se ve limpio
        f.use_smooth = False
    bpy.data.objects.remove(cutter)
    L.uv_planar(ob, mm(-LARGO / 2), mm(LARGO / 2), mm(-ANCHO / 2), mm(ANCHO / 2))
    return ob


def pads():
    """los 38 pads con nombre (pad_GPIO23…) y la serigrafía de cada pin"""
    oro = L.m_oro()
    objs, letras, cuenta = [], [], {}
    for fila, lista, s in (("J2", J2, 1), ("J3", J3, -1)):
        for i, (pin, etq) in enumerate(lista):
            if pin == "GND":
                cuenta[pin] = cuenta.get(pin, 0) + 1
                nombre = f"pad_GND_{cuenta[pin]}"
            else:
                nombre = f"pad_{pin}"
            ob = L.anillo(nombre, mm(0.85), mm(0.5), mm(GROSOR + 0.07), P(pin_x(i), s * FILA_Y, GROSOR / 2), oro,
                          seg=14, cuadrado=(i == 0))
            ob["fila"], ob["n"], ob["pin"], ob["etiqueta"] = fila, i + 1, pin, etq
            if pin == "5V":
                ob["alias"] = "VIN"
            objs.append(ob)
            letras.append(L.texto("t", etq, mm(0.78), P(pin_x(i), s * 10.55, TOP + 0.02), L.m_serigrafia(),
                                  rot_z=-math.pi / 2))
    return objs, letras


# ---------------------------------------------------------------- el módulo ESP-WROOM-32
def modulo():
    z0 = TOP + 0.08                                      # sobre la soldadura
    mod_pcb = L.caja("modulo_pcb", mm(MOD_X1 - MOD_X0, 2 * MOD_Y, 0.8),
                     P((MOD_X0 + MOD_X1) / 2, 0, z0), L.mat("mascara_modulo", (0.010, 0.011, 0.013), rough=0.3),
                     bisel=mm(0.1))
    zt = z0 + 0.8
    # blindaje metálico (17,6 x 16,8 x 2,3)
    sx0, sx1 = MOD_X0 + 0.55, MOD_X0 + 18.2
    escudo = L.caja("modulo_blindaje", mm(sx1 - sx0, 16.8, 2.3), P((sx0 + sx1) / 2, 0, zt), L.m_blindaje(),
                    bisel=mm(0.35), seg=2)
    ze = zt + 2.3 + 0.01
    g = L.m_grabado()
    cx = (sx0 + sx1) / 2
    marcas = [
        L.texto("m1", "ESP-WROOM-32", mm(1.15), P(cx + 3.0, 0, ze), g, rot_z=-math.pi / 2, negrita=True),
        L.texto("m2", "Wi-Fi  BT  BLE", mm(0.85), P(cx + 0.9, 0, ze), g, rot_z=-math.pi / 2),
        L.texto("m3", "FCC ID: 2AC7Z-ESPWROOM32", mm(0.7), P(cx - 1.6, 0, ze), g, rot_z=-math.pi / 2),
        L.texto("m4", "211-161007", mm(0.7), P(cx - 3.2, 0, ze), g, rot_z=-math.pi / 2),
        L.texto("m5", "CE", mm(1.2), P(cx - 5.6, -3.0, ze), g, rot_z=-math.pi / 2, negrita=True),
        L.texto("m6", "espressif", mm(0.95), P(cx + 6.4, 1.4, ze), g, rot_z=-math.pi / 2),
    ]
    # el logo de Espressif (aprox.): un círculo con dos arcos adentro
    lx, ly = cx + 6.4, -3.6
    circ = [(lx + 1.05 * math.cos(a), ly + 1.05 * math.sin(a)) for a in [k * math.pi / 10 for k in range(21)]]
    marcas.append(L.tira("logo0", [mm(*p) for p in circ], mm(0.18), mm(ze), g))
    for k, r in enumerate((0.45, 0.8)):
        arco = [(lx - 0.6 + r * math.cos(a), ly - 0.6 + r * math.sin(a)) for a in [j * math.pi / 16 for j in range(9)]]
        marcas.append(L.tira(f"logo{k + 1}", [mm(*p) for p in arco], mm(0.16), mm(ze), g))
    marcas_ob = L.unir(marcas, "modulo_marcas")

    # la antena de PCB: el meandro de cobre (bajo la máscara)
    ant = L.mat("antena_cobre", (0.42, 0.27, 0.14), rough=0.28, metal=0.85)
    ax0, ax1 = sx1 + 1.6, MOD_X1 - 0.7
    pts = [(sx1 + 0.6, -7.6), (ax0, -7.6), (ax0, -6.4)]
    y, lado = -6.4, 0
    while y < 7.2:
        xa = ax1 if lado == 0 else ax0 + 0.9
        pts += [(xa, y), (xa, y + 1.05)]
        y += 1.05
        lado ^= 1
    pts.append((ax0 + 0.9 if lado == 0 else ax1, y))
    antena = L.tira("antena_meandro", [mm(*p) for p in pts], mm(0.42), mm(zt + 0.012), ant)
    alim = L.tira("antena_alim", [mm(*p) for p in [(sx1 + 0.6, -5.4), (ax0 - 0.4, -5.4), (ax0 - 0.4, -6.0)]],
                  mm(0.3), mm(zt + 0.012), ant)
    antena = L.unir([antena, alim], "antena_meandro")

    # los pines almenados (medio agujero dorado) + el filete de estaño a la placa
    almenas = []
    oro, est = L.m_oro(), L.m_estano()
    for k in range(14):
        x = MOD_X0 + 1.4 + k * 1.27
        for s in (1, -1):
            almenas.append(L.caja("a", mm(0.85, 0.5, 0.82), P(x, s * (MOD_Y - 0.2), z0 - 0.01), oro))
            almenas.append(L.caja("f", mm(0.95, 0.75, 0.25), P(x, s * (MOD_Y + 0.2), TOP), est, bisel=mm(0.1)))
    for k in range(10):
        y = -5.7 + k * 1.27
        almenas.append(L.caja("a", mm(0.5, 0.85, 0.82), P(MOD_X0 + 0.2, y, z0 - 0.01), oro))
        almenas.append(L.caja("f", mm(0.75, 0.95, 0.25), P(MOD_X0 - 0.2, y, TOP), est, bisel=mm(0.1)))
    pines = L.unir(almenas, "modulo_pines")
    return [mod_pcb, escudo, marcas_ob, antena, pines]


# ---------------------------------------------------------------- el resto de las piezas
def usb():
    """micro-USB B: carcasa de lata con la boca hacia -X, asoma 0,6 mm del borde"""
    x0 = -LARGO / 2 - 0.6
    largo, ancho, alto = 5.2, 7.5, 2.6
    lata = L.caja("usb_carcasa", mm(largo, ancho, alto), P(x0 + largo / 2, 0, TOP), L.m_acero(), bisel=mm(0.25), seg=2)
    boca = L.caja("usb_boca", mm(0.5, 6.9, 1.85), P(x0 - 0.02, 0, TOP + 0.4), L.m_plastico_n())
    lengua = L.caja("usb_lengua", mm(0.55, 4.6, 0.6), P(x0 - 0.05, 0, TOP + 1.0),
                    L.mat("plastico_lengua", (0.05, 0.05, 0.055), rough=0.5))
    patas = [L.caja("p", mm(1.6, 1.0, 0.5), P(x0 + 3.0, s * 4.3, TOP), L.m_estano(), bisel=mm(0.15)) for s in (1, -1)]
    return L.unir([lata, boca, lengua] + patas, "usb_micro")


def chip_qfn(nombre, cx, cy, lado, alto, marcas):
    cuerpo = L.caja(nombre, mm(lado, lado, alto), P(cx, cy), L.m_epoxi(), bisel=mm(0.08))
    pat = []
    n = 7
    for k in range(n):
        o = (k - (n - 1) / 2) * 0.65
        for dx, dy, w, h in ((lado / 2, o, 0.35, 0.3), (-lado / 2, o, 0.35, 0.3), (o, lado / 2, 0.3, 0.35), (o, -lado / 2, 0.3, 0.35)):
            pat.append(L.caja("p", mm(w, h, 0.2), P(cx + dx, cy + dy), L.m_estano()))
    zt = TOP + alto + 0.01
    txt = [L.texto("t", s, mm(h), P(cx + dx, cy, zt), L.mat("tinta_chip", (0.35, 0.35, 0.36), rough=0.6),
                   rot_z=-math.pi / 2) for s, h, dx in marcas]
    punto = L.cilindro("pt", mm(0.25), mm(0.02), P(cx + lado / 2 - 0.6, cy + lado / 2 - 0.6, TOP + alto),
                       L.mat("tinta_chip", (0.35, 0.35, 0.36)), seg=10)
    return L.unir([cuerpo] + pat + txt + [punto], nombre)


def ams1117():
    cx, cy = -13.0, 5.5
    cuerpo = L.caja("ams1117", mm(3.5, 6.5, 1.6), P(cx, cy, TOP + 0.1), L.m_epoxi(), bisel=mm(0.12))
    est = L.m_estano()
    partes = [cuerpo, L.caja("tab", mm(1.6, 3.0, 0.25), P(cx + 2.3, cy, TOP), est),
              L.caja("tab2", mm(0.6, 3.0, 0.25), P(cx + 1.6, cy, TOP + 0.6), est)]
    for k in (-1, 0, 1):
        partes.append(L.caja("p", mm(1.4, 0.7, 0.25), P(cx - 2.2, cy + k * 2.3, TOP), est))
        partes.append(L.caja("p", mm(0.6, 0.7, 0.25), P(cx - 1.6, cy + k * 2.3, TOP + 0.6), est))
    tinta = L.mat("tinta_chip", (0.35, 0.35, 0.36), rough=0.6)
    zt = TOP + 1.71
    partes += [L.texto("t", "AMS1117", mm(0.75), P(cx + 0.55, cy, zt), tinta, rot_z=-math.pi / 2),
               L.texto("t", "3.3", mm(0.75), P(cx - 0.65, cy, zt), tinta, rot_z=-math.pi / 2)]
    return L.unir(partes, "ams1117")


def boton(nombre, cx, cy):
    """pulsador SMD: base negra, marco de lata y el botón"""
    partes = [L.caja(nombre, mm(4.2, 3.2, 1.0), P(cx, cy), L.m_plastico_n(), bisel=mm(0.1)),
              L.caja("marco", mm(4.2, 3.2, 0.15), P(cx, cy, TOP + 1.0), L.m_acero(), bisel=mm(0.05)),
              L.cilindro("boton", mm(0.85), mm(0.55), P(cx, cy, TOP + 1.15),
                         L.mat("plastico_boton", (0.72, 0.70, 0.66), rough=0.45), seg=16, bisel=mm(0.12))]
    for sx in (1, -1):
        for sy in (1, -1):
            partes.append(L.caja("p", mm(0.8, 0.6, 0.3), P(cx + sx * 2.3, cy + sy * 1.0), L.m_estano()))
    return L.unir(partes, nombre)


def pasivo(cx, cy, rot, tipo):
    """0603: condensador (cerámica café) o resistencia (negra), extremos de estaño"""
    l, w, h = 1.6, 0.8, (0.8 if tipo == "c" else 0.45)
    cuerpo_m = L.m_ceramica() if tipo == "c" else L.m_epoxi()
    c, s = math.cos(rot), math.sin(rot)
    partes = [L.caja("c", mm(l - 0.6, w, h), P(cx, cy), cuerpo_m, rot_z=rot)]
    for e in (1, -1):
        d = (l - 0.3) / 2 * e
        partes.append(L.caja("e", mm(0.3, w, h + 0.02), P(cx + c * d, cy + s * d), L.m_estano(), rot_z=rot,
                             bisel=mm(0.05)))
    return partes


def led(cx, cy):
    cuerpo = L.caja("led_power", mm(1.2, 1.25, 0.55), P(cx, cy), L.mat("led_rojo", (0.9, 0.02, 0.01), rough=0.15,
                                                                         emit=0.0, emit_color=(1.0, 0.05, 0.02)))
    ext = [L.caja("e", mm(0.4, 1.25, 0.5), P(cx + e * 0.8, cy), L.m_estano(), bisel=mm(0.05)) for e in (1, -1)]
    return L.unir([cuerpo] + ext, "led_power")


def construir(color="negro"):
    objs = [placa(color)]
    p, letras = pads()
    objs += p
    objs += modulo()
    objs.append(usb())
    objs.append(chip_qfn("cp2102", -12.3, -4.6, 5.0, 0.9, [("SiLabs", 0.6, 0.9), ("CP2102", 0.75, -0.4), ("DCL00X", 0.5, -1.5)]))
    objs.append(ams1117())
    objs.append(boton("boton_EN", -24.3, 7.9))
    objs.append(boton("boton_BOOT", -24.3, -7.9))
    objs.append(led(-19.6, 7.6))
    # pasivos (deterministas): cerca del regulador, del CP2102 y del módulo
    rnd = random.Random(7)
    sitios = [(-17.5, 3.2, 0), (-17.5, 5.0, 0), (-9.0, 3.6, math.pi / 2), (-8.0, 7.6, 0), (-17.6, -2.6, 0),
              (-17.6, -5.0, 0), (-17.6, -6.8, 0), (-8.2, -6.6, math.pi / 2), (-6.8, -6.0, 0), (-1.2, 6.5, math.pi / 2),
              (-1.2, -6.5, math.pi / 2), (-2.6, 3.9, 0), (-2.6, -4.2, 0), (-9.2, 0.0, math.pi / 2), (-20.8, 4.2, math.pi / 2),
              (-20.8, -4.2, math.pi / 2), (-0.8, 0.8, math.pi / 2)]
    pas = []
    for x, y, r in sitios:
        pas += pasivo(x, y, r, rnd.choice("ccr"))
    objs.append(L.unir(pas, "smd_pasivos"))
    seri = L.m_serigrafia()
    letras += [
        L.texto("t", "EN", mm(0.8), P(-21.3, 7.9, TOP + 0.02), seri, rot_z=-math.pi / 2),
        L.texto("t", "BOOT", mm(0.8), P(-21.3, -7.9, TOP + 0.02), seri, rot_z=-math.pi / 2),
        L.texto("t", "ESP32-DevKitC V4", mm(1.05), P(-4.6, 0, TOP + 0.02), seri, rot_z=-math.pi / 2, negrita=True),
        L.texto("t", "ESPRESSIF", mm(0.85), P(-6.6, 0, TOP + 0.02), seri, rot_z=-math.pi / 2, espacio=1.3),
        L.texto("t", "J2", mm(0.7), P(pin_x(0) + 2.6, 12.7, TOP + 0.02), seri, rot_z=-math.pi / 2),
        L.texto("t", "J3", mm(0.7), P(pin_x(0) + 2.6, -12.7, TOP + 0.02), seri, rot_z=-math.pi / 2),
    ]
    objs.append(L.unir(letras, "serigrafia"))
    raiz = L.grupo("esp32_devkitc", objs)
    raiz["pieza"] = "esp32_devkitc"
    raiz["medidas_mm"] = f"{LARGO} x {ANCHO} x {GROSOR}"
    return raiz


if __name__ == "__main__":
    L.limpiar()
    construir()
