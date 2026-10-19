// Las actualizaciones del juego (actualizar.js) sin Electron ni internet:  node desktop/test_actualizar.js
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path");
const ACT = require("./actualizar");

assert.equal(ACT.comparar("3.1.10", "3.1.9"), 1);
assert.equal(ACT.comparar("3.1", "3.1.0"), 0);
assert.equal(ACT.comparar("3.0.9", "3.1.0"), -1);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ndf-act-"));
function juego(dir, version, motor = 1, completo = true) {
  for (const f of ["scripts/jugar.py", "app/index.html", ...(completo ? ["app/main.js"] : [])]) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), "");
  }
  fs.writeFileSync(path.join(dir, "version.json"), JSON.stringify({ version, motor }));
}
const incluido = path.join(tmp, "app", "juego"), datos = path.join(tmp, "datos"), act = path.join(datos, "actualizaciones");
juego(incluido, "3.1.1");

// sin actualizaciones: el código de la app
let c = ACT.codigoActual(incluido, datos, 1);
assert.deepEqual(c, { dir: incluido, version: "3.1.1", actualizado: false });

// la más nueva del mismo motor gana; las viejas, las a medias y las de otro motor se borran; la marca .mala se queda
juego(path.join(act, "3.1.2"), "3.1.2");
juego(path.join(act, "3.1.3"), "3.1.3");
juego(path.join(act, "3.2.0"), "3.2.0", 2);            // otro motor: hay que reinstalar
juego(path.join(act, "3.1.4"), "3.1.4", 1, false);     // incompleta
fs.mkdirSync(path.join(act, "3.1.5.nueva"));            // una descarga a medias
fs.writeFileSync(path.join(act, "3.1.6.mala"), "x");
c = ACT.codigoActual(incluido, datos, 1);
assert.equal(c.version, "3.1.3");
assert.equal(c.actualizado, true);
assert.deepEqual(fs.readdirSync(act).sort(), ["3.1.3", "3.1.6.mala"]);

// reinstaló una app más nueva que la actualización: se usa la de la app y la actualización se borra
juego(incluido, "3.1.5");
c = ACT.codigoActual(incluido, datos, 1);
assert.equal(c.dir, incluido);
assert.deepEqual(fs.readdirSync(act), ["3.1.6.mala"]);

// descartar: borra la carpeta y deja la marca
juego(path.join(act, "3.1.7"), "3.1.7");
ACT.descartar(path.join(act, "3.1.7"));
assert.deepEqual(fs.readdirSync(act).sort(), ["3.1.6.mala", "3.1.7.mala"]);

fs.rmSync(tmp, { recursive: true, force: true });
console.log("Actualizaciones: todo bien.");
