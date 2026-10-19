#!/bin/sh
# EL INSTALADOR (.dmg en Mac, .exe en Windows: el mismo script; en GitHub Actions, .github/workflows/instaladores.yml):
#   1. el Python del juego congelado (PyInstaller, servidor.spec)      -> build/py/servidor/
#   2. el código del juego (app/, game/, drone_rl/, scripts/, drones/, la IA publicada y los rivales del freestyle)
#                                                                     -> build/juego/
#   3. electron-builder junta la app + esas dos carpetas (package.json "build")  -> dist/
#   cd desktop && sh empaquetar.sh            (--sin-py: no recompila el Python si no cambiaron las dependencias)
#   PY=<python> sh empaquetar.sh              (otro Python con las dependencias; por defecto el .venv del proyecto)
set -e
cd "$(dirname "$0")"
RAIZ=..
if [ -z "$PY" ]; then PY="$RAIZ/.venv/bin/python"; [ -x "$PY" ] || PY="$RAIZ/.venv/Scripts/python.exe"; fi
if [ "$1" != "--sin-py" ] || [ ! -d build/py/servidor ]; then
  "$PY" -m PyInstaller --noconfirm --distpath build/py --workpath build/pywork servidor.spec
fi
rm -rf build/juego && mkdir -p build/juego/scripts build/juego/drones build/juego/models
cp -R "$RAIZ/app" "$RAIZ/game" "$RAIZ/drone_rl" build/juego/
cp -R "$RAIZ/models/publico" build/juego/models/
mkdir -p build/juego/blender                          # el laboratorio 3D (se abre con el Blender del jugador, si lo tiene)
for f in laboratorio.blend drone_lab.py drone_sim.py escena_lib.py piloto_ia.py prueba_aleatoria.py bosque.py; do cp "$RAIZ/blender/$f" build/juego/blender/; done
for f in jugar live_train simulacion export_policy lanzador; do cp "$RAIZ/scripts/$f.py" build/juego/scripts/; done
for f in madera fs_racer rango_juego; do cp "$RAIZ/drones/$f.json" build/juego/drones/; done
find build/juego \( -name "__pycache__" -o -name "test_*" -o -name "*.log" -o -name ".DS_Store" \) -prune -exec rm -rf {} +
npx electron-builder --publish never
