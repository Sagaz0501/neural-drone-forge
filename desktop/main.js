// =====================================================================
// NEURAL DRONE FORGE COMO APP DE ESCRITORIO (prototipo E1 del plan maestro, docs/PLAN_MAESTRO.md §8).
// Electron trae su Chromium (el mismo WebGL, la Gamepad API y el video .webm en Mac y Windows). Al abrir:
//   1. busca un puerto libre y arranca el servidor de siempre (scripts/jugar.py --no-browser) con el .venv del proyecto
//   2. espera a que responda y abre el juego en una ventana propia (sin barra del navegador)
//   3. al cerrar la ventana cierra el servidor (los entrenamientos del fondo y Blender siguen: van en su propia sesión)
// INSTALADA (el .dmg / .exe: npm run dist = empaquetar.sh): el servidor es el Python congelado de los recursos
// (servidor/servidor, PyInstaller) y el código del juego va en recursos/juego (DRONMAKER_CODIGO, solo lectura); las
// partidas, los modelos de IA y los STL van en la carpeta de datos del usuario (DRONMAKER_DATOS = app.getPath("userData")).
// ACTUALIZACIONES (actualizar.js): al abrir mira el último release de GitHub; si trae código nuevo para este motor
// (package.json "motor"), lo ofrece, lo baja a <datos>/actualizaciones/<versión> y el servidor corre desde ahí.
//   cd desktop && npm install && npm start            (npm start -- --freestyle: directo al freestyle;
//                                                     npm run prueba = abre, guarda una captura y se cierra)
// =====================================================================
const { app, BrowserWindow, Menu, shell, powerSaveBlocker, dialog } = require("electron");
const { spawn } = require("child_process");
const net = require("net");
const http = require("http");
const path = require("path");
const fs = require("fs");
const ACT = require("./actualizar");
const MOTOR = require("./package.json").motor;

const RAIZ = path.resolve(__dirname, "..");
const PY = [path.join(RAIZ, ".venv", "bin", "python"), path.join(RAIZ, ".venv", "Scripts", "python.exe")].find(fs.existsSync) || "python3";
const captura = (process.argv.find((a) => a.startsWith("--captura=")) || "").split("=")[1];
let servidor = null;
if (process.env.DRONMAKER_PERFIL) app.setPath("userData", path.resolve(process.env.DRONMAKER_PERFIL));   // probar con otra carpeta de datos

function puertoLibre(desde = 8770) {
  return new Promise((ok) => {
    const s = net.createServer();
    s.once("error", () => ok(puertoLibre(desde + 1)));
    s.listen(desde, "127.0.0.1", () => s.close(() => ok(desde)));
  });
}
/** ¿El servidor ya responde? Con http.get leyendo toda la respuesta: fetch() dejaba el cuerpo sin leer y, cuando el
 *  servidor cerraba la conexión, undici se caía en el proceso principal (AssertionError: assert(!this.paused)). */
const responde = (url) => new Promise((ok) => {
  const req = http.get(url, (res) => { res.resume(); res.on("end", () => ok(res.statusCode === 200)); res.on("error", () => ok(false)); });
  req.on("error", () => ok(false));
  req.setTimeout(2000, () => { req.destroy(); ok(false); });
});
async function esperar(url, ms = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await responde(url)) return true;
    if (!servidor) return false;                      // el servidor se cerró (no va a responder)
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

/** Una página simple mientras arranca o se actualiza (el juego todavía no está). */
const pagina = (html) => `data:text/html;charset=utf-8,${encodeURIComponent(`<body style="background:#0f1714;color:#eaf2ef;font-family:system-ui;padding:40px">${html}</body>`)}`;

/** Arrancar el servidor del juego con el código de `codigo` (la app instalada) o el del proyecto. */
function arrancar(puerto, codigo) {
  if (app.isPackaged) {                               // el Python congelado + el código (recursos o actualización); los datos en la carpeta del usuario
    const exe = path.join(process.resourcesPath, "servidor", process.platform === "win32" ? "servidor.exe" : "servidor");
    servidor = spawn(exe, ["--no-browser", "--port", String(puerto)], { cwd: codigo, stdio: "ignore", windowsHide: true,   // sin ventana de consola en Windows
      env: { ...process.env, DRONMAKER_CODIGO: codigo, DRONMAKER_DATOS: app.getPath("userData"), PYTHONIOENCODING: "utf-8" } });
  } else {                                            // desde el proyecto: el .venv y sus carpetas (como el navegador)
    servidor = spawn(PY, [path.join(RAIZ, "scripts", "jugar.py"), "--no-browser", "--port", String(puerto)], { cwd: RAIZ, stdio: "inherit", env: process.env });
  }
  servidor.on("exit", (c) => { servidor = null; if (c && !app.isQuitting) console.log("El servidor se cerró:", c); });
}

/** ¿Hay código nuevo en GitHub? Pregunta y, si dice que sí, lo instala. Devuelve el código a usar. */
async function actualizar(win, cod) {
  const m = await ACT.buscar(cod.version, MOTOR, app.getPath("userData"));
  if (!m) return cod;
  const mb = m.bytes ? ` (${Math.max(1, Math.round(m.bytes / 1048576))} MB)` : "";
  const { response } = process.env.DRONMAKER_ACTUALIZAR === "si" ? { response: 0 } : await dialog.showMessageBox(win, {   // "si": sin preguntar (pruebas) type: "info", buttons: ["Actualizar ahora", "Ahora no"], defaultId: 0, cancelId: 1,
    message: `Hay una versión nueva del juego: ${m.version}`, detail: `Tienes la ${cod.version}. La actualización${mb} tarda unos segundos; tus partidas y tus IA no se tocan.` });
  if (response !== 0) return cod;
  win.loadURL(pagina(`<h2>Actualizando a la ${m.version}…</h2><p id="p">0 %</p>`));
  try {
    let pct = -1;
    const dir = await ACT.instalar(m, app.getPath("userData"), (f) => {
      if (Math.round(f * 100) === pct) return;
      pct = Math.round(f * 100);
      win.setProgressBar(f);
      win.webContents.executeJavaScript(`document.getElementById("p")&&(document.getElementById("p").textContent="${pct} %")`).catch(() => {});
    });
    win.setProgressBar(-1);
    return { dir, version: m.version, actualizado: true };
  } catch (e) {
    win.setProgressBar(-1);
    await dialog.showMessageBox(win, { type: "warning", message: "No se pudo actualizar", detail: `${e.message}\nSigues jugando con la ${cod.version}; la app lo intenta otra vez la próxima vez que abras.` });
    return cod;
  }
}

async function abrir() {
  const puerto = await puertoLibre();
  const win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 960, minHeight: 600, backgroundColor: "#0f1714", title: "Neural Drone Forge", icon: path.join(__dirname, "icon.png"),
    show: !captura, paintWhenInitiallyHidden: true, webPreferences: { contextIsolation: true, sandbox: true },
  });
  win.webContents.setWindowOpenHandler(({ url: u }) => { shell.openExternal(u); return { action: "deny" }; });   // enlaces de afuera: el navegador
  let cod = null;
  if (app.isPackaged) {
    cod = ACT.codigoActual(path.join(process.resourcesPath, "juego"), app.getPath("userData"), MOTOR);
    if (!captura || process.env.DRONMAKER_ACTUALIZAR === "si") cod = await actualizar(win, cod);
    win.setTitle(`Neural Drone Forge ${cod.version}`);
    win.on("page-title-updated", (e) => e.preventDefault());   // el título lleva la versión del código
  }
  arrancar(puerto, cod?.dir);
  const url = `http://127.0.0.1:${puerto}/app/${process.argv.includes("--freestyle") ? "freestyle.html" : ""}`;   // --freestyle: directo al freestyle
  // la primera vez la app instalada tarda más (el sistema revisa el ejecutable y carga PyTorch): hasta 90 s
  let listo = await esperar(url, app.isPackaged ? 90000 : 30000);
  if (!listo && cod?.actualizado) {                   // la actualización no arrancó: se descarta y vuelve el código de la app
    if (servidor) { const s = servidor; s.kill("SIGTERM"); await new Promise((ok) => { s.once("exit", ok); setTimeout(ok, 5000); }); }
    ACT.descartar(cod.dir);
    cod = ACT.codigoActual(path.join(process.resourcesPath, "juego"), app.getPath("userData"), MOTOR);
    win.setTitle(`Neural Drone Forge ${cod.version}`);
    arrancar(puerto, cod.dir);
    listo = await esperar(url, 90000);
  }
  if (!listo) {
    const ayuda = app.isPackaged ? "Cierra la app y ábrela otra vez. Si sigue igual, reinicia el computador y vuelve a intentarlo." : `Revisa que exista ${RAIZ}/.venv (python3 -m venv .venv && pip install -r requirements.txt).`;
    win.loadURL(pagina(`<h2>No arrancó el servidor</h2><p>${ayuda}</p>`)); return;
  }
  // sin await: la primera vez el juego pregunta el idioma y el "load" de la página espera esa respuesta
  win.loadURL(url);
  if (captura) {
    await new Promise((r) => win.webContents.once("dom-ready", r));
    await new Promise((r) => setTimeout(r, 6000));
    fs.writeFileSync(path.resolve(captura), (await win.webContents.capturePage()).toPNG());
    console.log("captura:", path.resolve(captura));
    app.quit();
  }
}

Menu.setApplicationMenu(Menu.buildFromTemplate([
  ...(process.platform === "darwin" ? [{ role: "appMenu" }] : []),
  { label: "Ver", submenu: [{ role: "reload", label: "Recargar" }, { role: "togglefullscreen", label: "Pantalla completa" }, { role: "toggleDevTools", label: "Herramientas" }] },
]));
app.whenReady().then(() => {
  if (app.dock) app.dock.setIcon(path.join(__dirname, "icon.png"));   // el logo en el dock de macOS
  // que macOS no "duerma" la app (App Nap) cuando su ventana no está al frente: frenaba los entrenamientos que lanza el
  // servidor ~4,6 veces (1.300 pasos/s en vez de 6.080). La pantalla sí se puede apagar.
  powerSaveBlocker.start("prevent-app-suspension");
  abrir();
});
app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => { app.isQuitting = true; if (servidor) servidor.kill("SIGTERM"); });
