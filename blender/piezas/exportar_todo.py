"""
Construye cada pieza en una escena nueva, la exporta a app/modelos/<nombre>.glb y saca su foto a
docs/img/piezas/<nombre>.png.

  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python blender/piezas/exportar_todo.py
  … -- esp32_devkitc            (solo esa)
  … -- --sin-render             (solo los GLB, más rápido)
"""
import importlib
import os
import sys
import time

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(os.path.dirname(AQUI))
sys.path.insert(0, AQUI)

import lib_piezas as L  # noqa: E402

# nombre del GLB -> (módulo, ángulo de la foto: azimut, elevación, zoom[, argumentos de construir()])
PIEZAS = {
    "esp32_devkitc": ("esp32_devkit", (-30, 42, 1.05)),
    "soldador": ("soldador", (-24, 32, 1.5)),
    "esc_4en1": ("esc_4en1", (-30, 48, 1.1)),
    "esp32_cam": ("esp32_cam", (125, 20, 0.85)),
    "chasis_madera": ("chasis_madera", (-30, 38, 1.05)),
    **{f"motor_{m}": ("motor", (-30, 28, 1.2), {"id": m}) for m in ("m1806", "m2204", "m1404", "m2306", "m2207", "m2806")},
    **{f"bateria_{b}": ("bateria", (-35, 32, 1.05), {"id": b})
       for b in ("b2s1000", "b3s1300", "b3s2200", "b4s1500", "b4s2200", "b4s3000")},
}


def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    sin_render = "--sin-render" in args
    pedidas = [a for a in args if not a.startswith("--")] or list(PIEZAS)
    for nombre in pedidas:
        modulo, (az, el, zoom), *extra = PIEZAS[nombre]
        t0 = time.time()
        L.limpiar()
        mod = importlib.import_module(modulo)
        mod.construir(**(extra[0] if extra else {}))
        n, tris = L.stats()
        glb = os.path.join(RAIZ, "app", "modelos", f"{nombre}.glb")
        peso = L.exportar_glb(glb)
        t1 = time.time()
        msg = f"[piezas] {nombre}: {n} mallas, {tris} triángulos, {peso / 1024:.0f} KB, armar+exportar {t1 - t0:.1f} s"
        if not sin_render:
            png = os.path.join(RAIZ, "docs", "img", "piezas", f"{nombre}.png")
            L.render_preview(png, azimut=az, elevacion=el, zoom=zoom)
            msg += f", render {time.time() - t1:.1f} s"
        print(msg, flush=True)


main()
