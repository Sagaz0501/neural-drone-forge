// =====================================================================
// NEURAL DRONE FORGE COMO APP DE ESCRITORIO (prototipo E1 del plan maestro, docs/PLAN_MAESTRO.md §8).
// Electron trae su Chromium (el mismo WebGL, la Gamepad API y el video .webm en Mac y Windows). Al abrir:
//   1. busca un puerto libre y arranca el servidor de siempre (scripts/jugar.py --no-browser) con el .venv del proyecto
//   2. espera a que responda y abre el juego en una ventana propia (sin barra del navegador)
//   3. al cerrar la ventana cierra el servidor (los entrenamientos del fondo y Blender siguen: van en su propia sesión)
// Las partidas del navegador NO pasan solas: Electron guarda su localStorage aparte (falta E3: partidas en archivos).
//   cd desktop && npm install && npm start            (npm start -- --freestyle: directo al freestyle;
//                                                     npm run prueba = abre, guarda una captura y se cierra)
// =====================================================================
const { app, BrowserWindow, Menu, shell } = require("electron");
const { spawn } = require("child_process");
const net = require("net");
const http = require("http");
const path = require("path");
const fs = require("fs");

const RAIZ = path.resolve(__dirname, "..");
const PY = [path.join(RAIZ, ".venv", "bin", "python"), path.join(RAIZ, ".venv", "Scripts", "python.exe")].find(fs.existsSync) || "python3";
const captura = (process.argv.find((a) => a.startsWith("--captura=")) || "").split("=")[1];
let servidor = null;

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
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

async function abrir() {
  const puerto = await puertoLibre();
  servidor = spawn(PY, [path.join(RAIZ, "scripts", "jugar.py"), "--no-browser", "--port", String(puerto)], { cwd: RAIZ, stdio: "inherit" });
  servidor.on("exit", (c) => { servidor = null; if (c && !app.isQuitting) console.log("El servidor se cerró:", c); });
  const url = `http://127.0.0.1:${puerto}/app/${process.argv.includes("--freestyle") ? "freestyle.html" : ""}`;   // --freestyle: directo al freestyle
  const win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 960, minHeight: 600, backgroundColor: "#0f1714", title: "Neural Drone Forge",
    show: !captura, paintWhenInitiallyHidden: true, webPreferences: { contextIsolation: true, sandbox: true },
  });
  win.webContents.setWindowOpenHandler(({ url: u }) => { shell.openExternal(u); return { action: "deny" }; });   // enlaces de afuera: el navegador
  if (!(await esperar(url))) { win.loadURL(`data:text/html,<body style="background:#0f1714;color:#eaf2ef;font-family:system-ui;padding:40px"><h2>No arrancó el servidor</h2><p>Revisa que exista ${RAIZ}/.venv (python3 -m venv .venv && pip install -r requirements.txt).</p></body>`); return; }
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
app.whenReady().then(abrir);
app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => { app.isQuitting = true; if (servidor) servidor.kill("SIGTERM"); });
