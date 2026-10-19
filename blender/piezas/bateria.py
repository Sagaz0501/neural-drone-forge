"""
Batería LiPo (o Li-ion) del catálogo (app/data/piezas.json "baterias"), a escala real: las celdas en serie dentro del
termoencogible, la etiqueta con su capacidad, el cable de potencia con el XT60 amarillo y el cable de balanceo blanco.
X = largo (los cables salen por -X), Z = arriba, apoyada en z = 0.
"""
import lib_piezas as L
from lib_piezas import mm

# id -> (largo, ancho, alto mm, celdas, mAh, color del envoltorio (lineal), color de la etiqueta, química)
BATERIAS = {
    "b2s1000": (72, 34, 14, 2, 1000, (0.015, 0.015, 0.017), (0.85, 0.55, 0.01), "LiPo"),
    "b3s1300": (74, 35, 24, 3, 1300, (0.015, 0.015, 0.017), (0.02, 0.45, 0.85), "LiPo"),
    "b3s2200": (105, 34, 26, 3, 2200, (0.015, 0.015, 0.017), (0.02, 0.45, 0.85), "LiPo"),
    "b4s1500": (76, 36, 32, 4, 1500, (0.015, 0.015, 0.017), (0.85, 0.12, 0.05), "LiPo"),
    "b4s2200": (106, 34, 36, 4, 2200, (0.015, 0.015, 0.017), (0.85, 0.12, 0.05), "LiPo"),
    "b4s3000": (75, 40, 40, 4, 3000, (0.03, 0.17, 0.06), (0.9, 0.9, 0.88), "Li-ion"),
}


def construir(id="b3s1300"):
    l, w, h, s, mah, col, etiq, quim = BATERIAS[id]
    envol = L.mat(f"termo_{id}", col, rough=0.32)
    objs = [L.caja("bateria_cuerpo", mm(l, w, h), mm(0, 0, 0), envol, bisel=mm(3.2), seg=4)]
    # la etiqueta (una banda de color en la cara de arriba) con el texto
    et = L.mat(f"etiqueta_{id}", etiq, rough=0.45)
    objs.append(L.caja("bateria_etiqueta", mm(l * 0.62, w + 0.3, 0.25), mm(l * 0.08, 0, h - 0.12), et, bisel=mm(0.1)))
    tinta = L.mat("tinta_blanca" if sum(etiq) < 2 else "tinta_negra", (0.95, 0.95, 0.95) if sum(etiq) < 2 else (0.02, 0.02, 0.02), rough=0.6)
    objs.append(L.unir([
        L.texto("t", f"{s}S {mah} mAh", mm(min(5.0, w * 0.15)), mm(l * 0.08, 2.0, h + 0.15), tinta, negrita=True),
        L.texto("t", f"{s * 3.7:.1f} V  {quim}", mm(min(3.2, w * 0.1)), mm(l * 0.08, -4.5, h + 0.15), tinta),
    ], "bateria_texto"))
    # la correa no va aquí (es del dron). Los cables: potencia (rojo y negro, 12 AWG) al XT60, y el balanceo
    rojo, negro = L.mat("silicona_roja", (0.6, 0.02, 0.01), rough=0.6), L.mat("silicona_negra", (0.02, 0.02, 0.02), rough=0.7)
    x0, zc = -l / 2 + 1, h * 0.55
    cables = [L.tubo("p", [mm(x0, 3, zc), mm(x0 - 12, 3.5, zc), mm(x0 - 26, 2.2, zc - 3)], mm(1.5), rojo, lados=10),
              L.tubo("p", [mm(x0, -3, zc), mm(x0 - 12, -3.5, zc), mm(x0 - 26, -2.2, zc - 3)], mm(1.5), negro, lados=10)]
    objs.append(L.unir(cables, "bateria_cables"))
    # el XT60 macho (amarillo): cuerpo con la cara biselada y dos pines
    amar = L.mat("xt60", (0.85, 0.62, 0.01), rough=0.45)
    xt = [L.caja("xt60", mm(16, 8.2, 15.6), mm(x0 - 34, 0, zc - 3 - 7.8), amar, bisel=mm(1.0), seg=2)]
    xt.append(L.caja("xt60_marca", mm(0.3, 6, 3), mm(x0 - 26.1, 0, zc - 3 - 1.5), L.mat("xt60_oscuro", (0.4, 0.28, 0.01), rough=0.5)))
    objs.append(L.unir(xt, "bateria_xt60"))
    # el cable de balanceo (s+1 hilos finos) con su conector JST-XH blanco, doblado sobre la batería
    hilos = []
    for k in range(s + 1):
        y = w / 2 - 3 - k * 1.2
        hilos.append(L.tubo("b", [mm(x0, y, h * 0.85), mm(x0 - 6, y, h + 2), mm(x0 + 6, y, h + 3.5)], mm(0.45),
                            rojo if k == s else negro, lados=6))
    hilos.append(L.caja("jst_xh", mm(5.8, 2.5 * (s + 1), 4.6), mm(x0 + 9, w / 2 - 3 - s * 0.6, h + 1.4),
                        L.mat("jst_blanco", (0.85, 0.85, 0.82), rough=0.5), bisel=mm(0.3)))
    objs.append(L.unir(hilos, "bateria_balanceo"))
    raiz = L.grupo(f"bateria_{id}", objs)
    raiz["pieza"], raiz["medidas_mm"] = f"bateria_{id}", f"{l} x {w} x {h}"
    return raiz
