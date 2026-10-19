"""
EL EJECUTABLE DE LA APP INSTALADA (PyInstaller, desktop/servidor.spec): un Python con las dependencias del juego
(numpy, PyTorch CPU, stable-baselines3, gymnasium) que corre los scripts del juego desde su carpeta de código.

  servidor [--port N --no-browser]           -> scripts/jugar.py (el servidor del juego)
  servidor [-u] <ruta>/scripts/live_train.py …  -> ese script (así jugar.py lanza el entrenador: como a `python -u`)

La carpeta del código (app/, game/, drone_rl/, scripts/…) viene en DRONMAKER_CODIGO (desktop/main.js la pone: va en
los recursos de la app) o, si no, es la de arriba de este archivo (el proyecto). Los datos van en DRONMAKER_DATOS.
"""
import importlib.machinery
import os
import runpy
import sys
from pathlib import Path

# los módulos del juego se importan SIEMPRE desde la carpeta del código (no la copia congelada dentro del ejecutable):
# así drone_rl/env.py encuentra su missions.json y un cambio en el código no obliga a recompilar el ejecutable
PROPIOS = {"drone_rl", "jugar", "live_train", "simulacion", "export_policy", "evaluate", "train"}


class _DelCodigo:
    @staticmethod
    def find_spec(name, path=None, target=None):
        if name.split(".")[0] in PROPIOS:
            return importlib.machinery.PathFinder.find_spec(name, path, target)
        return None


def _dependencias():
    """No se llama: le dice a PyInstaller qué meter (los scripts se corren desde su carpeta, no desde el ejecutable)."""
    import jugar, live_train, simulacion, export_policy  # noqa: F401, E401
    import drone_rl, drone_rl.env, drone_rl.runtime, drone_rl.upgrade  # noqa: F401, E401


def main():
    args = sys.argv[1:]
    while args and args[0] == "-u":                   # jugar.py lo llama como a python -u
        args.pop(0)
    os.environ["PYTHONUNBUFFERED"] = "1"
    for f in (sys.stdout, sys.stderr):
        if f is None:                                  # sin consola (la app de Windows)
            continue
        try:
            f.reconfigure(line_buffering=True, encoding="utf-8", errors="replace")   # (la consola de Windows: los acentos)
        except (AttributeError, ValueError):
            pass
    codigo = Path(os.environ.get("DRONMAKER_CODIGO") or Path(__file__).resolve().parents[1])
    if args and args[0].endswith(".py"):
        script, resto = Path(args[0]), args[1:]
    else:
        script, resto = codigo / "scripts" / "jugar.py", args
    raiz = script.resolve().parents[1]
    sys.path[:0] = [str(script.parent), str(raiz)]    # como al correr `python scripts/x.py` en el proyecto
    sys.argv = [str(script), *resto]
    sys.meta_path.insert(0, _DelCodigo)
    runpy.run_path(str(script), run_name="__main__")


if __name__ == "__main__":
    main()
