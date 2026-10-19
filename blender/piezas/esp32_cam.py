"""
ESP32-CAM (AI-Thinker) con la cámara OV2640, a escala real: la placa de 27 x 40,5 mm, el módulo ESP32-S con su lata,
el conector de la cámara con la cinta flexible doblada y la cámara con su lente. Es la "cámara de juguete" del kit.
La placa va PARADA mirando hacia +X (adelante del dron): X = adelante, Y = izquierda, Z = arriba; la base en z = 0.
"""
import math

import bpy

import lib_piezas as L
from lib_piezas import mm

ANCHO, ALTO, GROSOR = 27.0, 40.5, 1.0


def construir():
    pcb = L.mat("mascara_cam", (0.012, 0.013, 0.015), rough=0.35)
    objs = []
    # la placa (parada): su cara de adelante mira a +X
    placa = L.caja("cam_pcb", mm(GROSOR, ANCHO, ALTO), mm(0, 0, 0), pcb, bisel=mm(0.3))
    objs.append(placa)
    xf = GROSOR / 2                                          # la cara de adelante
    # el módulo ESP32-S (lata) abajo y la antena de PCB en la punta de abajo
    objs.append(L.caja("cam_lata", mm(2.4, 16.2, 17.6), mm(xf + 0.9, 0, 3.0), L.m_blindaje(), bisel=mm(0.3), seg=2))
    g = L.m_grabado()
    objs.append(L.unir([
        L.texto("t", "ESP32-S", mm(1.6), (0, 0, 0), g, negrita=True),
        L.texto("t", "AI-Thinker", mm(1.1), (0, mm(-2.4), 0), g),
    ], "cam_marca"))
    marca = bpy.data.objects["cam_marca"]
    marca.rotation_euler = (math.pi / 2, 0, math.pi / 2)
    marca.location = mm(xf + 2.12, 0, 12.5)
    # el conector FPC de la cámara (negro con la traba café) y la cinta naranja que sube
    objs.append(L.caja("cam_fpc", mm(2.2, 11, 2.2), mm(xf + 1.1, 0, 23.5), L.m_plastico_n(), bisel=mm(0.2)))
    objs.append(L.caja("cam_traba", mm(1.0, 11.4, 0.8), mm(xf + 2.4, 0, 25.0), L.mat("traba_cafe", (0.25, 0.12, 0.04), rough=0.5)))
    cinta = L.mat("cinta_kapton", (0.75, 0.33, 0.03), rough=0.3)
    objs.append(L.caja("cam_cinta", mm(0.25, 8.5, 9.0), mm(xf + 2.0, 0, 26.0), cinta))
    # la cámara OV2640: cuerpo cuadrado y el lente roscado con el vidrio
    zc = 33.0
    cuerpo = L.caja("cam_ov2640", mm(4.2, 8.5, 8.5), mm(xf + 4.2, 0, zc - 4.25), L.m_plastico_n(), bisel=mm(0.4))
    objs.append(cuerpo)
    lente = L.torno("cam_lente", [mm(0, 0), mm(3.6, 0), mm(3.6, 3.2), mm(3.0, 3.6), mm(2.4, 4.6), mm(0, 4.6)],
                    L.mat("lente_negro", (0.02, 0.02, 0.022), rough=0.4), seg=28, eje="X")
    lente.location = mm(xf + 6.3, 0, zc)
    objs.append(lente)
    vidrio = L.cilindro("cam_vidrio", mm(1.9), mm(0.2), (0, 0, 0), L.mat("vidrio_lente", (0.02, 0.03, 0.06), rough=0.03, metal=0.5), seg=24, base=False)
    vidrio.rotation_euler = (0, math.pi / 2, 0)
    vidrio.location = mm(xf + 10.95, 0, zc)
    objs.append(vidrio)
    # el LED flash y el lector de microSD (en la cara de atrás se ve la ranura)
    objs.append(L.caja("cam_flash", mm(1.2, 3, 3), mm(xf + 0.6, -9.5, 34.5), L.mat("led_flash", (0.95, 0.92, 0.75), rough=0.2)))
    objs.append(L.caja("cam_sd", mm(1.8, 14, 15), mm(-GROSOR / 2 - 0.9, 0, 22), L.m_acero(), bisel=mm(0.2)))
    # los 16 pines (2 filas de 8) que salen por atrás
    pines = [L.caja("p", mm(6.0, 0.64, 0.64), mm(-GROSOR / 2 - 3.0, s * 11.4, 2.5 + k * 2.54), L.m_oro()) for s in (1, -1) for k in range(8)]
    objs.append(L.unir(pines, "cam_pines"))
    raiz = L.grupo("esp32_cam", objs)
    raiz["pieza"], raiz["medidas_mm"] = "esp32_cam", f"{ANCHO} x {ALTO}"
    return raiz
