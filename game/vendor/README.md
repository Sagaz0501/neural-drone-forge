# game/vendor — librerías de terceros (copiadas tal cual, sin CDN: el juego funciona sin internet)

| Carpeta / archivo | Librería | Versión | Licencia | Para qué |
|---|---|---|---|---|
| `three.module.min.js`, `OrbitControls.js`, `loaders/`, `postprocessing/`, `shaders/`, `utils/` | [three.js](https://threejs.org) | r169 | MIT (`THREE_LICENSE`) | todo lo 3D |
| `occt/occt-import-js.js` + `occt/occt-import-js.wasm` | [occt-import-js](https://github.com/kovacsv/occt-import-js) (OpenCascade 7.x compilado a WebAssembly con Emscripten) | **0.0.23** (npm) | **LGPL-2.1** (`occt/license.occt-import-js.txt`; OpenCascade: LGPL-2.1 + excepción, `occt/license.occt.txt`) | leer STEP (.step/.stp) e importar chasis (`app/step.js`) |

## occt-import-js y la licencia del juego (MIT, se vende)

- Se copió **sin modificar** desde el paquete de npm (`npm pack occt-import-js@0.0.23`, carpeta `dist/`): solo los dos
  archivos que se usan y sus dos licencias. 7,6 MB el `.wasm` + 95 KB el `.js`.
- Es una **librería aparte que se carga en tiempo de ejecución** (`app/step.js` agrega el `<script>` y el `.wasm` se baja
  solo cuando importas un STEP). No se compila ni se mezcla con el código del juego: el juego solo la *usa*.
- La LGPL-2.1 permite eso en un programa propietario o MIT siempre que: (1) la librería vaya con su licencia (van
  `license.*.txt` aquí y en el instalador, porque `desktop/codigo.sh` copia `game/` entero); (2) el usuario pueda
  cambiarla por otra versión (basta con reemplazar estos dos archivos: no hay enlace estático); (3) se diga de dónde
  sale el código fuente (https://github.com/kovacsv/occt-import-js, tag v0.0.23, y https://dev.opencascade.org).
- Si algún día se modifica, esos cambios tienen que publicarse bajo LGPL. Mientras se use tal cual, el resto del juego
  sigue siendo MIT.

Actualizar: `npm pack occt-import-js@<versión>`, copiar `package/dist/{occt-import-js.js,occt-import-js.wasm,license.*}`
aquí, cambiar la versión de esta tabla y correr `node --import ./app/three_node.mjs app/test_step.mjs`.

Alternativa medida (no elegida): leer el STEP en Python en el servidor con CadQuery/OCP. `cadquery-ocp` 7.9 ocupa
**221 MB** instalado (contra 7,7 MB del wasm) y habría que meterlo en el PyInstaller de la app de escritorio.
