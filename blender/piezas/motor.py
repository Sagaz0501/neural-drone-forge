"""
Motor brushless de dron (outrunner) a escala real, uno por modelo del catálogo (app/data/piezas.json "motores").
El nombre dice el estator: 2204 = 22 mm de diámetro x 4 mm de alto. La campana gira por fuera (los imanes van
adentro); abajo se ven el bobinado de cobre y la base con los 4 agujeros; arriba, el eje de 5 mm con la tuerca de la
hélice. Z = arriba, la base en z = 0.
"""
import math

import lib_piezas as L
from lib_piezas import mm

# id -> (estator Ø, estator alto, color de la campana (lineal), marca en la campana)
MOTORES = {
    "m1806": (18, 6, (0.30, 0.31, 0.33), "1806"),
    "m2204": (22, 4, (0.02, 0.09, 0.55), "2204"),
    "m1404": (14, 4, (0.55, 0.40, 0.02), "1404"),
    "m2306": (23, 6, (0.55, 0.012, 0.015), "2306"),
    "m2207": (22, 7, (0.62, 0.48, 0.01), "2207"),
    "m2806": (28, 6.5, (0.18, 0.04, 0.50), "2806"),
}


def construir(id="m2204"):
    est_d, est_h, color, marca = MOTORES[id]
    r_campana = est_d / 2 + 2.6                      # imanes + pared de la campana
    alto_campana = est_h + 6.5
    z_base, alto_base = 0.0, 2.2
    anod = L.mat(f"anodizado_{id}", color, rough=0.28, metal=0.9)
    alu = L.mat("aluminio_cnc", (0.62, 0.63, 0.66), rough=0.3, metal=1.0)
    negro = L.mat("aluminio_negro", (0.025, 0.026, 0.03), rough=0.35, metal=0.8)
    cobre = L.mat("bobinado", (0.72, 0.33, 0.12), rough=0.35, metal=0.9)
    objs = []

    # la base (fija): un disco con 4 brazos y los agujeros de montaje en cruz
    r_base = est_d / 2 + 1.0
    base = [L.cilindro("base", mm(r_base), mm(alto_base), mm(0, 0, z_base), negro, seg=48, bisel=mm(0.4))]
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        base.append(L.caja("brazo", mm(r_base * 0.9, 3.4, alto_base * 0.8), mm(math.cos(a) * r_base * 0.55, math.sin(a) * r_base * 0.55, z_base),
                           negro, bisel=mm(0.5), rot_z=a))
    objs.append(L.unir(base, "motor_base"))
    # el bobinado que asoma entre la base y la campana
    z_cu = z_base + alto_base
    objs.append(L.cilindro("motor_bobinado", mm(est_d / 2 + 0.4), mm(1.2), mm(0, 0, z_cu), cobre, seg=36))
    # la campana: el perfil girado (borde de abajo con chaflán, techo con un escalón)
    z0 = z_cu + 1.0
    R = r_campana
    top = z0 + alto_campana                           # la campana es un tubo: el techo son los rayos (abajo se ve el cobre)
    perfil = [(R - 2.4, top), (R - 1.8, top), (R - 0.6, top - 0.6), (R, top - 1.6), (R, z0 + 0.7), (R - 0.5, z0),
              (R - 1.4, z0), (R - 1.4, top - 0.4), (R - 2.4, top - 0.4), (R - 2.4, top)]
    campana = L.torno("motor_campana", [mm(r, z) for r, z in perfil], anod, seg=56)
    objs.append(campana)
    # las ventanas del techo (se ve el cobre por dentro): 5 rayos de aluminio sobre un fondo de cobre
    zt = z0 + alto_campana
    objs.append(L.cilindro("techo_cobre", mm(R - 1.6), mm(0.4), mm(0, 0, zt - 2.4), cobre, seg=40))
    rayos = [L.caja("rayo", mm(R - 3.0, 3.0, 0.5), mm(math.cos(k * 2 * math.pi / 5) * (R - 1.5) / 2, math.sin(k * 2 * math.pi / 5) * (R - 1.5) / 2, zt - 0.5),
                    anod, bisel=mm(0.3), rot_z=k * 2 * math.pi / 5) for k in range(5)]
    rayos.append(L.anillo("borde", mm(R - 0.6), mm(R - 2.4), mm(0.5), mm(0, 0, zt - 0.25), anod, seg=56))
    rayos.append(L.cilindro("cubo", mm(4.2), mm(0.9), mm(0, 0, zt - 0.5), anod, seg=32, bisel=mm(0.3)))
    objs.append(L.unir(rayos, "motor_techo"))
    # el eje de 5 mm y la tuerca de la hélice (M5, con nylon)
    objs.append(L.cilindro("motor_eje", mm(2.5), mm(9), mm(0, 0, zt), alu, seg=24))
    objs.append(L.cilindro("motor_tuerca", mm(4.2), mm(4), mm(0, 0, zt + 7), alu, seg=6, bisel=mm(0.4)))
    objs.append(L.cilindro("tuerca_nylon", mm(3.2), mm(1.3), mm(0, 0, zt + 11), L.mat("nylon_azul", (0.03, 0.12, 0.6), rough=0.5), seg=24))
    # la marca grabada en la campana (en el techo)
    objs.append(L.texto("motor_marca", marca, mm(1.4), mm(0, -(R - 1.3) / 2 - 1.4, zt + 0.02), L.m_serigrafia(), negrita=True))
    # los 3 cables (silicona) que salen por un lado de la base
    cables = []
    for k, c in enumerate(((0.02, 0.02, 0.02), (0.02, 0.02, 0.02), (0.02, 0.02, 0.02))):
        y = (k - 1) * 1.6
        cables.append(L.tubo("cable", [mm(r_base - 2, y, z_base + 1.0), mm(r_base + 4, y, z_base + 1.0), mm(r_base + 14, y * 1.3, z_base + 0.3)],
                             mm(0.65), L.mat("silicona_negra", c, rough=0.7), lados=8))
    objs.append(L.unir(cables, "motor_cables"))
    raiz = L.grupo(f"motor_{id}", objs)
    raiz["pieza"], raiz["alto_mm"], raiz["radio_campana_mm"] = f"motor_{id}", zt + 12.3, R
    return raiz
