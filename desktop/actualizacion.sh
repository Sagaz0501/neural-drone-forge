#!/bin/sh
# LA ACTUALIZACIÓN DEL JUEGO (sin reinstalar, desktop/actualizar.js): el código (codigo.sh) en un .tar.gz + su manifiesto.
#   dist/juego-<version>.tar.gz   y   dist/actualizacion.json = {version, motor, archivo, sha256, bytes}
# Los dos van en el release de GitHub (instaladores.yml lo hace al subir un tag v*). Cambiaste Electron o el Python
# (servidor.spec, requirements)? Sube "motor" en package.json: la gente con el motor viejo tiene que reinstalar.
set -e
cd "$(dirname "$0")"
sh codigo.sh
V=$(node -p 'require("./package.json").version')
mkdir -p dist
A="juego-$V.tar.gz"
COPYFILE_DISABLE=1 tar -czf "dist/$A" -C build/juego .
node -e '
const fs=require("fs"),c=require("crypto"),p=require("./package.json"),f="dist/"+process.argv[1],b=fs.readFileSync(f);
fs.writeFileSync("dist/actualizacion.json",JSON.stringify({version:p.version,motor:p.motor,archivo:process.argv[1],sha256:c.createHash("sha256").update(b).digest("hex"),bytes:b.length},null,1)+"\n");' "$A"
cat dist/actualizacion.json
