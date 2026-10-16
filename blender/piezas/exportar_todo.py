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

# nombre del GLB -> (módulo, ángulo de la foto: azimut, elevación, zoom)
PIEZAS = {
    "esp32_devkitc": ("esp32_devkit", (-30, 42, 1.05)),
    "soldador": ("soldador", (-24, 32, 1.5)),
}


def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    sin_render = "--sin-render" in args
    pedidas = [a for a in args if not a.startswith("--")] or list(PIEZAS)
    for nombre in pedidas:
        modulo, (az, el, zoom) = PIEZAS[nombre]
        t0 = time.time()
        L.limpiar()
        mod = importlib.import_module(modulo)
        mod.construir()
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
