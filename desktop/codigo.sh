#!/bin/sh
# EL CÓDIGO DEL JUEGO -> build/juego/ (lo usan empaquetar.sh, para meterlo en la app, y actualizacion.sh, para el release):
# app/, game/, drone_rl/, scripts/, drones/, el laboratorio de Blender, la IA publicada y los rivales del freestyle,
# + version.json = {version, motor} de package.json (actualizar.js solo instala código del mismo "motor").
set -e
cd "$(dirname "$0")"
RAIZ=..
rm -rf build/juego && mkdir -p build/juego/scripts build/juego/drones build/juego/models
cp -R "$RAIZ/app" "$RAIZ/game" "$RAIZ/drone_rl" build/juego/
cp -R "$RAIZ/models/publico" build/juego/models/
mkdir -p build/juego/blender                          # el laboratorio 3D (se abre con el Blender del jugador, si lo tiene)
for f in laboratorio.blend drone_lab.py drone_sim.py escena_lib.py piloto_ia.py prueba_aleatoria.py bosque.py; do cp "$RAIZ/blender/$f" build/juego/blender/; done
for f in jugar live_train simulacion export_policy lanzador; do cp "$RAIZ/scripts/$f.py" build/juego/scripts/; done
for f in madera fs_racer rango_juego; do cp "$RAIZ/drones/$f.json" build/juego/drones/; done
find build/juego \( -name "__pycache__" -o -name "test_*" -o -name "*.log" -o -name ".DS_Store" \) -prune -exec rm -rf {} +
node -e 'const p=require("./package.json");require("fs").writeFileSync("build/juego/version.json",JSON.stringify({version:p.version,motor:p.motor})+"\n")'
echo "código del juego $(cat build/juego/version.json)"
