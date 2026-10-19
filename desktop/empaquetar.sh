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
sh codigo.sh                                          # el código del juego -> build/juego/
npx electron-builder --publish never
