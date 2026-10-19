// =====================================================================
// LAS ACTUALIZACIONES DEL JUEGO (sin reinstalar). La app tiene dos partes:
//   - el MOTOR: Electron + el Python congelado (servidor/, PyTorch…): ~290 MB, cambia poco -> eso sí se reinstala
//   - el CÓDIGO del juego (recursos/juego: app/, game/, drone_rl/, scripts/, blender/): ~10 MB -> esto se actualiza solo
// Cada release de GitHub trae actualizacion.json ({version, motor, archivo, sha256, bytes}) + juego-<version>.tar.gz
// (desktop/actualizacion.sh). Al abrir, la app mira el último release; si hay un código más nuevo para SU motor
// (package.json "motor"), pregunta, lo baja, revisa el sha256 y lo descomprime en <datos>/actualizaciones/<version>/.
// Desde ahí corre el servidor (DRONMAKER_CODIGO). La app instalada nunca se toca (ni su firma) y, si algo falla, vuelve
// al código que trae adentro.
// =====================================================================
const net = () => require("electron").net;          // (perezoso: test_actualizar.js corre en Node sin Electron)
const { spawn } = require("child_process");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");

const REPO = "Sagaz0501/neural-drone-forge";
// DRONMAKER_ACTUALIZACIONES=http://127.0.0.1:8000 = buscar ahí (actualizacion.json + el .tar.gz): para probar sin GitHub
const PRUEBA = process.env.DRONMAKER_ACTUALIZACIONES;
const MANIFIESTO = PRUEBA ? `${PRUEBA}/actualizacion.json` : `https://github.com/${REPO}/releases/latest/download/actualizacion.json`;

/** "3.1.10" > "3.1.9": -1, 0 o 1. */
function comparar(a, b) {
  const pa = String(a).split(".").map(Number), pb = String(b).split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return Math.sign(d);
  }
  return 0;
}
const leerJSON = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
/** El código de una carpeta: su version.json, si está completo (si no, null). */
function versionDe(dir) {
  const v = leerJSON(path.join(dir, "version.json"));
  const completo = ["scripts/jugar.py", "app/index.html", "app/main.js"].every((f) => fs.existsSync(path.join(dir, f)));
  return v && v.version && completo ? v : null;
}

/** Qué código usar: la actualización más nueva para este motor, o el que trae la app. Borra las que ya no sirven. */
function codigoActual(incluido, datos, motor) {
  const base = versionDe(incluido) || { version: "0", motor };
  const carpeta = path.join(datos, "actualizaciones");
  let mejor = { dir: incluido, version: base.version, actualizado: false };
  let nombres = [];
  try { nombres = fs.readdirSync(carpeta); } catch { /* sin actualizaciones */ }
  for (const n of nombres) {
    const dir = path.join(carpeta, n), v = /^\d+(\.\d+)*$/.test(n) ? versionDe(dir) : null;
    if (v && v.motor === motor && comparar(v.version, mejor.version) > 0) mejor = { dir, version: v.version, actualizado: true };
  }
  for (const n of nombres) {                       // las viejas, las a medias y las de otro motor: fuera
    const dir = path.join(carpeta, n);
    if (dir !== mejor.dir && !n.endsWith(".mala")) fs.rmSync(dir, { recursive: true, force: true });
  }
  return mejor;
}

/** El último release: {version, motor, archivo, sha256, bytes, url} si es más nuevo que `version` y es de este motor. */
async function buscar(version, motor, datos) {
  try {
    const r = await net().fetch(MANIFIESTO, { signal: AbortSignal.timeout(6000), cache: "no-store" });
    if (!r.ok) return null;
    const m = await r.json();
    if (!m || m.motor !== motor || !/^[\w.-]+\.tar\.gz$/.test(m.archivo || "") || !/^[0-9a-f]{64}$/.test(m.sha256 || "")) return null;
    if (comparar(m.version, version) <= 0 || fs.existsSync(path.join(datos, "actualizaciones", `${m.version}.mala`))) return null;
    return { ...m, url: PRUEBA ? `${PRUEBA}/${m.archivo}` : `https://github.com/${REPO}/releases/download/v${m.version}/${m.archivo}` };
  } catch {
    return null;                                   // sin internet o GitHub no responde: se juega con lo que hay
  }
}

/** Bajar, revisar el sha256 y descomprimir en <datos>/actualizaciones/<version>. progreso(0..1). Devuelve la carpeta. */
async function instalar(m, datos, progreso = () => {}) {
  const carpeta = path.join(datos, "actualizaciones");
  fs.mkdirSync(carpeta, { recursive: true });
  const tgz = path.join(carpeta, `${m.version}.tar.gz`), tmp = path.join(carpeta, `${m.version}.nueva`), fin = path.join(carpeta, m.version);
  const r = await net().fetch(m.url, { signal: AbortSignal.timeout(10 * 60000) });
  if (!r.ok) throw new Error(`GitHub respondió ${r.status}`);
  const total = Number(r.headers.get("content-length")) || m.bytes || 0, hash = crypto.createHash("sha256");
  const out = fs.createWriteStream(tgz);
  let n = 0;
  for await (const trozo of r.body) {
    hash.update(trozo); n += trozo.length;
    if (!out.write(trozo)) await new Promise((ok) => out.once("drain", ok));
    if (total) progreso(Math.min(1, n / total));
  }
  await new Promise((ok, mal) => out.end((e) => (e ? mal(e) : ok())));
  try {
    if (hash.digest("hex") !== m.sha256) throw new Error("el archivo llegó dañado (sha256 distinto)");
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.mkdirSync(tmp);
    await new Promise((ok, mal) => {               // tar: viene en macOS y en Windows 10/11 (System32\tar.exe)
      const p = spawn("tar", ["-xzf", tgz, "-C", tmp], { windowsHide: true, stdio: "ignore" });
      p.on("error", mal);
      p.on("exit", (c) => (c === 0 ? ok() : mal(new Error(`tar salió con ${c}`))));
    });
    const v = versionDe(tmp);
    if (!v || v.version !== m.version) throw new Error("el paquete no trae el juego completo");
    fs.rmSync(fin, { recursive: true, force: true });
    fs.renameSync(tmp, fin);
    return fin;
  } finally {
    fs.rmSync(tgz, { force: true });
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/** Una actualización que no arrancó: se borra y queda la marca <version>.mala para no volver a bajarla. */
function descartar(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  try { fs.writeFileSync(dir + ".mala", new Date().toISOString()); } catch { /* igual se borró */ }
}

module.exports = { comparar, codigoActual, buscar, instalar, descartar, versionDe };
