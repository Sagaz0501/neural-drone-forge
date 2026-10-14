// =====================================================================
// DRONE RL — el juego. Menú -> escoger mundo -> poner aros -> la IA (tu modelo) vuela.
// También puedes pilotear tú (flechas = gas y giro, WASD = avance y lado; o un control).
// =====================================================================
import * as THREE from "three";
import { OrbitControls } from "three/addons/OrbitControls.js";
import { Level, Policy, Flight, rayDirsWorld, RAY_LEN, CONTROL_HZ } from "./sim.js";
import { WORLDS, forestWorld, columnsWorld, fieldWorld, warehouseWorld, levelDict, treeBlocks } from "./worlds.js";
import { V, makeMaterials, makeSky, makeLights, WorldView, RouteView, makeDrone, poseDrone, Rays, Trail } from "./scene.js";

const $ = (id) => document.getElementById(id);
const fmt = (x, d = 1) => x.toFixed(d).replace(".", ",");
const store = {
  get(k, d) { try { const v = localStorage.getItem("dronerl." + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("dronerl." + k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } },
};

const S = {
  mode: "menu", worldKey: store.get("world", "bosque"), seed: Math.floor(Math.random() * 1e6),
  density: store.get("density", 1), wind: store.get("wind", 0), quality: store.get("quality", "media"),
  world: null, goals: [], tool: "aro", height: 1.6, history: [],
  policy: null, meta: null, modelSource: null,
  flight: null, pilot: "ia", speed: 1, paused: false, cam: "persecucion", ended: false, acc: 0, limit: 60,
  tally: { ok: 0, n: 0 }, showBrain: false, bodega: null,
};

// ---------------- Three.js ----------------
const canvas = $("c");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const HORIZON = new THREE.Color(0xcdd9d4);
scene.fog = new THREE.FogExp2(HORIZON, 0.02);
const camera = new THREE.PerspectiveCamera(62, 1, 0.03, 900);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.47;
controls.minDistance = 2;
controls.maxDistance = 90;
controls.enabled = false;

makeSky(scene);
const mats = makeMaterials();
let lights = makeLights(scene, S.quality);
let worldView = new WorldView(scene, mats, S.quality);
const route = new RouteView(scene);
const drone = makeDrone();
scene.add(drone);
const rays = new Rays(scene);
const trail = new Trail(scene);

function applyQuality() {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, { alta: 2, media: 1.5, baja: 1 }[S.quality]));
  const sz = S.quality === "alta" ? 2048 : 1024;
  lights.sun.shadow.mapSize.set(sz, sz);
  lights.sun.shadow.map?.dispose();
  lights.sun.shadow.map = null;
  resize();
}
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);

// ---------------- avisos ----------------
let toastT = 0;
function toast(msg, ms = 2600) {
  const t = $("toast");
  t.textContent = msg;
  t.style.opacity = 1;
  clearTimeout(toastT);
  toastT = setTimeout(() => (t.style.opacity = 0), ms);
}

// ---------------- el modelo (models/modelo_web.json) ----------------
const NIVELES = { hover: "Hover", goal_fixed: "Meta fija", goal_random: "Metas", obstacles: "Columnas", multi_goal: "Varias metas",
  circuit: "Circuito", forest: "Bosque", forest_multi: "Bosque 3 aros" };

function showModel() {
  const el = $("model");
  if (!S.policy) {
    el.className = "model none";
    el.innerHTML = location.protocol === "file:"
      ? "<b>Abre el juego con jugar.py</b><span>El navegador no deja leer el modelo desde un archivo suelto. Usa el botón Jugar de Drone Lab o <i>python scripts/jugar.py</i>. Mientras, puedes pilotear tú.</span>"
      : "<b>Todavía no hay modelo</b><span>Entrena en Drone Lab (Blender): el modelo se guarda solo cada 10 generaciones. Mientras, puedes pilotear tú, o soltar aquí un modelo_web.json.</span>";
    return;
  }
  const m = S.meta || {};
  const niv = m.niveles || {};
  const tot = Object.values(niv).reduce((a, b) => a + b, 0) || 1;
  const trained = Object.entries(niv).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${NIVELES[k] || k} ${Math.round((v / tot) * 100)} %`).join(", ");
  el.className = "model";
  el.innerHTML = `<b>Tu modelo, generación ${m.generaciones ?? "?"}</b><span>${(m.pasos || 0).toLocaleString("es")} pasos de experiencia${trained ? `<br>Entrenado en ${trained}` : ""}${S.modelSource === "archivo" ? "<br>Cargado desde un archivo" : ""}</span>`;
}

async function loadModel(quiet = false) {
  if (S.modelSource === "archivo") return;
  try {
    const r = await fetch("../models/modelo_web.json", { cache: "no-store" });
    if (!r.ok) throw new Error(r.status);
    const json = await r.json();
    const before = S.meta?.generaciones;
    S.policy = new Policy(json);
    S.meta = json.meta || {};
    S.modelSource = "servidor";
    if (quiet && before !== undefined && before !== S.meta.generaciones) toast(`Modelo actualizado: generación ${S.meta.generaciones}`);
  } catch {
    if (!quiet) { S.policy = null; S.meta = null; }
  }
  showModel();
}

// soltar un modelo_web.json en la página
window.addEventListener("dragover", (e) => { e.preventDefault(); $("drop").classList.remove("hidden"); });
window.addEventListener("dragleave", (e) => { if (e.target === $("drop")) $("drop").classList.add("hidden"); });
window.addEventListener("drop", async (e) => {
  e.preventDefault();
  $("drop").classList.add("hidden");
  const f = e.dataTransfer.files[0];
  if (!f) return;
  try {
    const json = JSON.parse(await f.text());
    S.policy = new Policy(json);
    S.meta = json.meta || {};
    S.modelSource = "archivo";
    showModel();
    toast("Modelo cargado");
  } catch {
    toast("Ese archivo no es un modelo_web.json");
  }
});

// ---------------- mundos ----------------
async function buildWorld(newSeed = false) {
  if (newSeed) S.seed = Math.floor(Math.random() * 1e6);
  const k = S.worldKey;
  let w;
  if (k === "bosque") w = forestWorld(S.seed, S.density);
  else if (k === "columnas") w = columnsWorld(S.seed);
  else if (k === "bodega") {
    if (!S.bodega) {
      try { S.bodega = await (await fetch("../levels/bodega.json")).json(); }
      catch { toast("No pude leer levels/bodega.json"); S.worldKey = "bosque"; return buildWorld(); }
    }
    w = warehouseWorld(S.bodega);
  } else w = fieldWorld();
  S.world = w;
  scene.fog.density = w.fog;
  worldView.build(w);
  S.goals = (w.defaultRoute || w.randomRoute(S.seed + 1)).map((g) => g.slice());
  S.history = [];
  clearForGoals(false);
  route.set(w.spawn, S.goals);
  poseDrone(drone, w.spawn, 0, 0, firstYaw());
  rays.lines.visible = false;
  trail.reset();
  renderRouteList();
}

const firstYaw = () => {
  const s = S.world.spawn, g = S.goals[0];
  return g ? Math.atan2(g[1] - s[1], g[0] - s[0]) : 0;
};

/** En el bosque: quitar los árboles que tapan la salida o un aro (como hace el entrenamiento). */
function clearForGoals(announce = true) {
  const w = S.world;
  if (w.kind !== "bosque") return;
  const before = w.trees.length;
  w.trees = w.trees.filter((t) => !treeBlocks(t, w.spawn, S.goals));
  const n = before - w.trees.length;
  if (n) {
    worldView.buildTrees(w.trees, w.backdrop);
    if (announce) toast(n === 1 ? "Quité un árbol para que el aro quede libre" : `Quité ${n} árboles para que el aro quede libre`);
  }
}

function insideObstacle(p, r = 0.6) {
  const L = new Level(levelDict(S.world, []));
  return L.collides(p, r);
}

// ---------------- menú ----------------
function buildMenu() {
  const list = $("world-list");
  list.innerHTML = "";
  for (const [k, w] of Object.entries(WORLDS)) {
    const b = document.createElement("button");
    b.className = "world";
    b.setAttribute("aria-pressed", String(k === S.worldKey));
    b.innerHTML = `<i style="background:${w.tint}"></i><div><b>${w.name}</b><span>${w.desc}</span></div>`;
    b.onclick = async () => {
      S.worldKey = k;
      store.set("world", k);
      [...list.children].forEach((c) => c.setAttribute("aria-pressed", String(c === b)));
      $("row-dens").style.display = k === "bosque" ? "" : "none";
      await buildWorld(true);
    };
    list.appendChild(b);
  }
  $("row-dens").style.display = S.worldKey === "bosque" ? "" : "none";
  const dens = $("dens"), wind = $("wind");
  dens.value = S.density;
  wind.value = S.wind;
  const showOpts = () => {
    $("o-dens").textContent = fmt(+dens.value);
    $("o-wind").textContent = +wind.value ? `hasta ${fmt(+wind.value)} m/s` : "sin viento";
  };
  showOpts();
  dens.oninput = showOpts;
  dens.onchange = () => { S.density = +dens.value; store.set("density", S.density); buildWorld(); };
  wind.oninput = () => { showOpts(); S.wind = +wind.value; store.set("wind", S.wind); };
  for (const b of $("quality").children) {
    b.setAttribute("aria-pressed", String(b.dataset.q === S.quality));
    b.onclick = () => {
      S.quality = b.dataset.q;
      store.set("quality", S.quality);
      for (const c of $("quality").children) c.setAttribute("aria-pressed", String(c === b));
      worldView.clear();
      worldView = new WorldView(scene, mats, S.quality);
      worldView.build(S.world);
      applyQuality();
    };
  }
  $("to-editor").onclick = () => setMode("editor");
  $("new-world").onclick = () => buildWorld(true);
}

// ---------------- editor de ruta ----------------
function renderRouteList() {
  const ol = $("route-list");
  ol.innerHTML = "";
  S.goals.forEach((g, i) => {
    const li = document.createElement("li");
    li.innerHTML = `<b>${i + 1}</b><span>a ${fmt(g[2])} m de altura</span>`;
    const del = document.createElement("button");
    del.textContent = "✕";
    del.title = `Quitar el aro ${i + 1}`;
    del.onclick = () => { pushHistory(); S.goals.splice(i, 1); updateRoute(); };
    li.appendChild(del);
    ol.appendChild(li);
  });
  $("route-help").textContent = S.goals.length
    ? "La IA pasa los aros en orden y aterriza bajo el último."
    : "No hay aros. Haz clic en el suelo para poner el primero.";
  $("fly-ai").disabled = !S.goals.length || !S.policy;
  $("fly-ai").title = !S.policy ? "Todavía no hay modelo" : "";
  $("fly-me").disabled = !S.goals.length;
}
function updateRoute() {
  clearForGoals();
  route.set(S.world.spawn, S.goals);
  poseDrone(drone, S.world.spawn, 0, 0, firstYaw());
  renderRouteList();
}
function pushHistory() {
  S.history.push({ goals: S.goals.map((g) => g.slice()), spawn: S.world.spawn.slice() });
  if (S.history.length > 50) S.history.shift();
}

const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
let down = null;
canvas.addEventListener("pointerdown", (e) => { down = [e.clientX, e.clientY]; });
canvas.addEventListener("pointerup", (e) => {
  if (S.mode !== "editor" || !down || e.button !== 0) return;
  if (Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;     // fue arrastrar la vista
  const ndc = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(groundPlane, hit)) return;
  const x = hit.x, y = -hit.z;
  if (Math.abs(x) > 28 || Math.abs(y) > 28) { toast("Fuera del área de vuelo (30 m desde el centro)"); return; }
  if (S.tool === "salida") {
    if (insideObstacle([x, y, 0.3], 0.5)) { toast("Ahí hay algo: la salida tiene que quedar libre"); return; }
    pushHistory();
    S.world.spawn = [x, y, 0];
    updateRoute();
    return;
  }
  const g = [x, y, S.height];
  if (S.world.kind !== "bosque" && insideObstacle(g)) { toast("Ese punto está dentro de un obstáculo"); return; }
  pushHistory();
  S.goals.push(g);
  updateRoute();
});

function editorSetup() {
  for (const b of $("tool").children) {
    b.onclick = () => {
      S.tool = b.dataset.t;
      for (const c of $("tool").children) c.setAttribute("aria-pressed", String(c === b));
      $("editor-hint").textContent = S.tool === "salida" ? "Clic en el suelo para mover la salida." :
        "Clic en el suelo para poner un aro. Arrastra para girar la vista y usa la rueda para acercar.";
    };
  }
  const h = $("height");
  h.oninput = () => { S.height = +h.value; $("o-height").textContent = `${fmt(S.height)} m`; };
  $("rand-route").onclick = () => { pushHistory(); S.goals = S.world.randomRoute(Math.floor(Math.random() * 1e6)).map((g) => g.slice()); updateRoute(); };
  $("undo").onclick = () => {
    const h0 = S.history.pop();
    if (!h0) return;
    S.goals = h0.goals; S.world.spawn = h0.spawn;
    updateRoute();
  };
  $("clear").onclick = () => { pushHistory(); S.goals = []; updateRoute(); };
  $("fly-ai").onclick = () => startFlight("ia");
  $("fly-me").onclick = () => startFlight("yo");
  $("to-menu").onclick = () => setMode("menu");
  $("again").onclick = () => startFlight(S.pilot);
  $("swap").onclick = () => startFlight(S.pilot === "ia" ? "yo" : "ia");
  $("edit").onclick = () => setMode("editor");
}

// ---------------- modos ----------------
function setMode(m) {
  S.mode = m;
  $("menu").classList.toggle("hidden", m !== "menu");
  for (const id of ["editor-top", "route", "editor-hint", "editor-bottom"]) $(id).classList.toggle("hidden", m !== "editor");
  $("hud").classList.toggle("hidden", m !== "vuelo");
  $("result").classList.add("hidden");
  controls.enabled = m === "editor" || (m === "vuelo" && S.cam === "libre");
  route.path && (route.path.visible = m !== "vuelo");
  if (m === "editor") {
    rays.lines.visible = false;
    route.color(0);
    poseDrone(drone, S.world.spawn, 0, 0, firstYaw());
    const pts = [S.world.spawn, ...S.goals];
    const c = pts.reduce((a, p) => [a[0] + p[0] / pts.length, a[1] + p[1] / pts.length], [0, 0]);
    controls.target.copy(V(c[0], c[1], 0.5));
    camera.position.copy(V(c[0] - 12, c[1] - 14, 16));
    renderRouteList();
  }
  if (m === "menu") showModel();
}

// ---------------- volar ----------------
const keys = new Set();
window.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT") return;
  keys.add(e.code);
  if (S.mode === "vuelo") {
    if (e.code === "KeyC") cycleCam();
    if (e.code === "Digit1") setCam("persecucion");
    if (e.code === "Digit2") setCam("fpv");
    if (e.code === "Digit3") setCam("libre");
    if (e.code === "Digit4") setCam("arriba");
    if (e.code === "KeyR") startFlight(S.pilot);
    if (e.code === "KeyE") setMode("editor");
    if (e.code === "KeyN") { S.showBrain = !S.showBrain; $("brain").classList.toggle("hidden", !S.showBrain || S.pilot !== "ia"); }
    if (e.code === "KeyP") S.paused = !S.paused;
    if (e.key === "+" || e.code === "Equal" || e.code === "NumpadAdd") changeSpeed(1);
    if (e.key === "-" || e.code === "Minus" || e.code === "NumpadSubtract") changeSpeed(-1);
    if (e.code === "Escape") setMode("menu");
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
  } else if (S.mode === "editor") {
    if ((e.metaKey || e.ctrlKey) && e.code === "KeyZ") $("undo").click();
    if (e.code === "Escape") setMode("menu");
    if (e.code === "Enter" && !$("fly-ai").disabled) startFlight("ia");
  }
  if (e.code === "KeyF") $("fps").classList.toggle("hidden");
});
window.addEventListener("keyup", (e) => keys.delete(e.code));
window.addEventListener("blur", () => keys.clear());

const SPEEDS = [0.25, 0.5, 1, 2];
function changeSpeed(d) {
  const i = Math.max(0, Math.min(SPEEDS.length - 1, SPEEDS.indexOf(S.speed) + d));
  S.speed = SPEEDS[i];
  toast(`Velocidad x${fmt(S.speed, S.speed < 1 ? 2 : 0)}`, 1200);
}
const CAMS = ["persecucion", "fpv", "libre", "arriba"];
const CAM_NAMES = { persecucion: "persecución", fpv: "FPV (la cámara del dron)", libre: "libre (arrastra para girar)", arriba: "desde arriba" };
function setCam(c) {
  S.cam = c;
  controls.enabled = c === "libre";
  camera.fov = c === "fpv" ? 100 : 62;
  camera.updateProjectionMatrix();
  if (c === "libre") controls.target.copy(drone.position);
  toast(`Cámara ${CAM_NAMES[c]}`, 1200);
}
const cycleCam = () => setCam(CAMS[(CAMS.indexOf(S.cam) + 1) % CAMS.length]);

/** Tus manos: flechas = gas y giro (palanca izquierda), WASD = avance y lado (palanca derecha). */
function manualAction() {
  let gas = (keys.has("ArrowUp") ? 0.45 : 0) - (keys.has("ArrowDown") ? 0.45 : 0);
  let yaw = (keys.has("ArrowLeft") ? 0.85 : 0) - (keys.has("ArrowRight") ? 0.85 : 0);
  let pitch = (keys.has("KeyW") ? 0.55 : 0) - (keys.has("KeyS") ? 0.55 : 0);
  let roll = (keys.has("KeyD") ? 0.55 : 0) - (keys.has("KeyA") ? 0.55 : 0);
  const gp = navigator.getGamepads?.()[0];
  if (gp && gp.axes.length >= 4) {                                  // control en modo 2
    const dz = (v) => (Math.abs(v) < 0.08 ? 0 : v);
    gas += -dz(gp.axes[1]); yaw += -dz(gp.axes[0]); roll += dz(gp.axes[2]); pitch += -dz(gp.axes[3]);
  }
  return [gas, roll, pitch, yaw].map((v) => Math.max(-1, Math.min(1, v)));
}

async function startFlight(pilot) {
  if (!S.goals.length) { toast("Pon al menos un aro"); return; }
  if (pilot === "ia") {
    await loadModel(true);                    // siempre la última generación guardada
    if (!S.policy) { toast("Todavía no hay modelo: entrena en Drone Lab"); return; }
  }
  S.pilot = pilot;
  const L = new Level(levelDict(S.world, S.goals));
  const last = S.goals[S.goals.length - 1];
  S.flight = new Flight(L, S.policy, {
    landOn: pilot === "ia" ? [last[0], last[1], 0] : null, wind: S.wind, seed: Math.floor(Math.random() * 1e9),
    pilot: pilot === "ia" ? "ia" : manualAction,
  }).reset();
  S.limit = Math.min(15 + 8 * S.goals.length, 150);
  S.ended = false; S.paused = false; S.acc = 0;
  S.prev = snap(S.flight.state);
  S.radioHist = [];
  trail.reset();
  rays.lines.visible = true;
  route.set(S.world.spawn, S.goals, pilot === "ia");
  route.color(0);
  setMode("vuelo");
  $("who").textContent = pilot === "ia" ? `La IA vuela (generación ${S.meta?.generaciones ?? "?"})` : "Pilotas tú";
  $("radio-t").textContent = pilot === "ia" ? "Las manos de la IA" : "Tus manos";
  $("brain").classList.toggle("hidden", !S.showBrain || pilot !== "ia");
  $("swap").textContent = pilot === "ia" ? "Pilotear yo" : "Que vuele la IA";
  $("swap").disabled = pilot !== "ia" && !S.policy;
  $("keys").textContent = pilot === "ia"
    ? "C cámara, R otra vez, E editar la ruta, N cerebro, + y − velocidad, P pausa, Esc menú"
    : "Flechas: gas y giro. WASD: avance y lado. C cámara, R otra vez, E editar, Esc menú";
  const fl = S.flight;
  const g = S.goals[0];
  camera.position.copy(V(fl.state.pos[0] - Math.cos(fl.state.yaw) * 3, fl.state.pos[1] - Math.sin(fl.state.yaw) * 3, 1.4));
  if (S.cam === "libre") controls.target.copy(V(...fl.state.pos));
  void g;
}

const snap = (s) => ({ pos: s.pos.slice(), roll: s.roll, pitch: s.pitch, yaw: s.yaw });

const WHAT = { bosque: "un árbol", columnas: "una columna", bodega: "algo de la bodega", campo: "un obstáculo" };
function endFlight() {
  S.ended = true;
  const fl = S.flight, n = S.goals.length, done = fl.goalIdx >= n;
  const h = $("res-h"), p = $("res-p");
  const vmed = fl.t > 0 ? (S.pathLen || 0) / fl.t : 0;
  if (done) {
    h.textContent = fl.phase === "aterrizado" ? "¡Llegó!" : `¡Pasó los ${n} aros!`;
    h.className = "ok";
    p.textContent = fl.phase === "aterrizado"
      ? `${n === 1 ? "Pasó el aro" : `Pasó los ${n} aros`} y aterrizó en ${fmt(fl.t)} s, a ${fmt(vmed * 3.6, 0)} km/h de media.`
      : `En ${fmt(fl.t)} s. Después chocó al aterrizar, pero eso lo hace el piloto automático, no la IA.`;
  } else if (fl.phase === "choque") {
    h.textContent = fl.reason === "limites" ? "Se salió del área" : "Chocó";
    h.className = "bad";
    const contra = fl.reason === "suelo" ? "el suelo" : fl.reason === "limites" ? "el límite de 30 m" : WHAT[S.world.kind];
    p.textContent = `Contra ${contra} yendo al aro ${fl.goalIdx + 1}, a los ${fmt(fl.t)} s.`;
  } else {
    h.textContent = "Se acabó el tiempo";
    h.className = "bad";
    p.textContent = `Pasó ${fl.goalIdx} de ${n} aros en ${fmt(S.limit, 0)} s. A veces la red se queda dudando frente a un obstáculo.`;
  }
  if (S.pilot === "ia") {
    S.tally.n++;
    if (done) S.tally.ok++;
    p.textContent += ` En esta sesión la IA llegó en ${S.tally.ok} de ${S.tally.n} vuelos.`;
  }
  $("result").classList.remove("hidden");
}

// ---------------- HUD ----------------
function drawRadio(a) {
  const c = $("radio-c"), g = c.getContext("2d");
  const W = c.width, H = c.height;
  g.clearRect(0, 0, W, H);
  S.radioHist.push(a.slice());
  if (S.radioHist.length > 18) S.radioHist.shift();
  const pads = [{ cx: 72, label: "gas y giro", x: (v) => -v[3], y: (v) => v[0] }, { cx: W - 72, label: "avance y lado", x: (v) => v[1], y: (v) => v[2] }];
  for (const p of pads) {
    const s = 52, cy = 64;
    g.strokeStyle = "rgba(234,242,239,0.22)";
    g.lineWidth = 1;
    g.beginPath(); g.roundRect(p.cx - s, cy - s, 2 * s, 2 * s, 14); g.stroke();
    g.beginPath(); g.moveTo(p.cx - s, cy); g.lineTo(p.cx + s, cy); g.moveTo(p.cx, cy - s); g.lineTo(p.cx, cy + s); g.stroke();
    S.radioHist.forEach((v, i) => {
      g.fillStyle = `rgba(255,122,26,${(i / S.radioHist.length) * 0.35})`;
      g.beginPath(); g.arc(p.cx + p.x(v) * (s - 8), cy - p.y(v) * (s - 8), 4, 0, 7); g.fill();
    });
    const x = p.cx + p.x(a) * (s - 8), y = cy - p.y(a) * (s - 8);
    g.strokeStyle = "rgba(255,122,26,0.6)";
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(p.cx, cy); g.lineTo(x, y); g.stroke();
    g.fillStyle = "#ff7a1a";
    g.beginPath(); g.arc(x, y, 8, 0, 7); g.fill();
    g.fillStyle = "#9db3a9";
    g.font = '500 13px "Chakra Petch", system-ui';
    g.textAlign = "center";
    g.fillText(p.label, p.cx, cy + s + 18);
  }
}

function drawRadar(d) {
  const c = $("radar-c"), g = c.getContext("2d");
  const W = c.width, cx = 78, cy = 86, R = 66;
  g.clearRect(0, 0, W, c.height);
  g.strokeStyle = "rgba(234,242,239,0.12)";
  for (const r of [R / 2, R]) { g.beginPath(); g.arc(cx, cy, r, 0, 7); g.stroke(); }
  for (let i = 0; i < 8; i++) {
    const ang = -Math.PI / 2 - (i * Math.PI) / 4;           // 0 = adelante (arriba), 90° = izquierda
    const dist = d[i], free = dist >= RAY_LEN - 1e-3, k = 1 - Math.min(dist / RAY_LEN, 1);
    g.fillStyle = free ? "rgba(71,240,138,0.08)" : `rgba(255,${Math.round(210 - 160 * k)},40,${0.25 + 0.5 * k})`;
    g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, R, ang - 0.36, ang + 0.36); g.closePath(); g.fill();
    if (!free) {
      const r = (dist / RAY_LEN) * R;
      g.strokeStyle = `rgb(255,${Math.round(210 - 160 * k)},40)`;
      g.lineWidth = 3;
      g.beginPath(); g.arc(cx, cy, Math.max(r, 3), ang - 0.36, ang + 0.36); g.stroke();
      g.lineWidth = 1;
    }
  }
  g.fillStyle = "#ff7a1a";
  g.beginPath(); g.moveTo(cx, cy - 8); g.lineTo(cx + 6, cy + 6); g.lineTo(cx - 6, cy + 6); g.fill();
  // arriba / abajo
  const bars = [["arriba", d[8]], ["abajo", d[9]]];
  bars.forEach(([lab, v], i) => {
    const x = 158, y = 22 + i * 74, hgt = 52;
    g.fillStyle = "rgba(234,242,239,0.1)";
    g.fillRect(x - 5, y, 10, hgt);
    const k = 1 - Math.min(v / RAY_LEN, 1);
    g.fillStyle = v >= RAY_LEN - 1e-3 ? "rgba(71,240,138,0.4)" : `rgb(255,${Math.round(210 - 160 * k)},40)`;
    g.fillRect(x - 5, y + hgt * (1 - k), 10, hgt * k);
    g.fillStyle = "#9db3a9";
    g.font = '500 11px "Chakra Petch", system-ui';
    g.textAlign = "right";
    g.fillText(lab, x + 6, y + hgt + 12);
  });
}

function drawBrain(fl) {
  const c = $("brain-c"), g = c.getContext("2d");
  g.clearRect(0, 0, c.width, c.height);
  const col = (v) => {
    v = Math.max(-1, Math.min(1, v));
    return v >= 0 ? `rgb(${Math.round(40 + 215 * v)},${Math.round(50 + 72 * v)},${Math.round(45 - 20 * v)})`
      : `rgb(${Math.round(40 - 20 * v)},${Math.round(50 - 153 * v)},${Math.round(45 - 210 * v)})`;
  };
  const rows = [fl.obs || [], ...(S.policy?.hidden || []), fl.action || []];
  rows.forEach((row, r) => {
    const n = row.length || 1, w = Math.min(c.width / n, r === 3 ? 60 : 22);
    const x0 = (c.width - w * n) / 2;
    for (let i = 0; i < row.length; i++) {
      g.fillStyle = col(row[i]);
      g.fillRect(x0 + i * w, 4 + r * 23, Math.max(w - 1, 1), 18);
    }
  });
}

let pathPrev = null;
function hud(fl, now) {
  const s = fl.state, n = S.goals.length;
  const spd = Math.hypot(...s.vel);
  $("spd").textContent = Math.round(spd * 3.6);
  const w = fl.windNow ? Math.hypot(fl.windNow[0], fl.windNow[1]) : 0;
  $("sub").innerHTML = `${fmt(spd)} m/s<br>altura ${fmt(s.pos[2])} m${w > 0.05 ? `<br>viento ${fmt(w)} m/s` : ""}` +
    `${S.speed !== 1 ? `<br>x${fmt(S.speed, S.speed < 1 ? 2 : 0)}` : ""}${S.paused ? "<br>pausa" : ""}`;
  $("ring-txt").textContent = fl.phase === "aterrizaje" ? "Aterrizando" : `Aro ${Math.min(fl.goalIdx + 1, n)} de ${n}`;
  $("time-txt").textContent = `${fmt(fl.t)} s`;
  drawRadio(fl.action);
  drawRadar(fl.rays);
  if (S.showBrain && S.pilot === "ia") drawBrain(fl);
}

// ---------------- cámaras ----------------
const tmpQ = new THREE.Quaternion(), FPV_Q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.35, -Math.PI / 2, 0, "YXZ"));
function updateCamera(dt, pos, yaw) {
  const p = V(...pos);
  const k = 1 - Math.exp(-4 * dt);
  if (S.mode === "menu") {
    const t = performance.now() / 1000 * 0.05;
    const c = S.world ? S.world.spawn : [0, 0, 0];
    camera.position.copy(V(c[0] + Math.cos(t) * 24, c[1] + Math.sin(t) * 24, 9.5));
    camera.lookAt(V(c[0], c[1], 1.5));
    return;
  }
  if (S.mode === "editor") { controls.update(); return; }
  if (S.cam === "persecucion") {
    const forest = S.world.kind === "bosque";
    let back = forest ? 2.6 : 3.2, up = forest ? 0.55 : 1.2;
    // si un tronco o una pared queda entre el dron y la cámara, la cámara se acerca
    const L = Math.hypot(back, up), dir = [-Math.cos(yaw) * back / L, -Math.sin(yaw) * back / L, up / L];
    const free = S.flight.level.raycast(pos, [dir], L)[0];
    if (free < L) { const f = Math.max((free - 0.35) / L, 0.15); back *= f; up *= f; }
    const want = V(pos[0] - Math.cos(yaw) * back, pos[1] - Math.sin(yaw) * back, pos[2] + up);
    camera.position.lerp(want, free < L ? Math.max(k, 0.5) : k);
    camera.lookAt(V(pos[0] + Math.cos(yaw) * 1.5, pos[1] + Math.sin(yaw) * 1.5, pos[2] + 0.2));
  } else if (S.cam === "fpv") {
    camera.position.copy(p).add(new THREE.Vector3(0, 0.03, 0));
    drone.updateMatrixWorld();
    drone.getWorldQuaternion(tmpQ);
    camera.quaternion.copy(tmpQ).multiply(FPV_Q);
  } else if (S.cam === "libre") {
    const off = camera.position.clone().sub(controls.target);
    controls.target.lerp(p, 0.3);
    camera.position.copy(controls.target).add(off);
    controls.update();
  } else {
    camera.position.lerp(V(pos[0], pos[1] - 0.01, pos[2] + 16), k);
    camera.lookAt(p);
  }
}

// ---------------- bucle principal ----------------
let last = performance.now(), fpsN = 0, fpsT = 0;
const lerpAng = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 0.25);
  last = now;
  if (worldView.time) worldView.time.value += dt;
  let pos = S.world ? S.world.spawn.slice() : [0, 0, 0], yaw = drone.rotation.y;
  if (S.mode === "vuelo" && S.flight) {
    const fl = S.flight;
    const step = 1 / CONTROL_HZ;
    if (!S.paused && !S.ended) {
      S.acc += dt * S.speed;
      let n = 0;
      while (S.acc >= step && n < 20) {
        S.prev = snap(fl.state);
        const p0 = fl.state.pos.slice();
        fl.step();
        S.pathLen = (fl.t <= step + 1e-9 ? 0 : S.pathLen || 0) + Math.hypot(fl.state.pos[0] - p0[0], fl.state.pos[1] - p0[1], fl.state.pos[2] - p0[2]);
        S.acc -= step;
        n++;
        if (n % 2 === 0) trail.push(fl.state.pos);
        route.color(fl.goalIdx);
        const over = fl.phase !== "ruta" && fl.phase !== "aterrizaje";
        if (over || fl.t >= S.limit) { endFlight(); break; }
      }
    }
    const a = S.ended || S.paused ? 1 : Math.min(S.acc / step, 1);
    const s = fl.state, p = S.prev;
    pos = [0, 1, 2].map((i) => p.pos[i] + (s.pos[i] - p.pos[i]) * a);
    yaw = lerpAng(p.yaw, s.yaw, a);
    poseDrone(drone, pos, p.roll + (s.roll - p.roll) * a, p.pitch + (s.pitch - p.pitch) * a, yaw);
    // hélices
    const spin = (6 + 30 * s.throttle) * 2 * Math.PI * dt * (S.paused || S.ended ? 0 : S.speed);
    for (const pr of drone.userData.props) {
      pr.rotation.y += spin * pr.userData.dir;
      pr.userData.disc.visible = s.throttle > 0.05;
      pr.userData.blade.visible = s.throttle < 0.3 || S.paused;
    }
    rays.update(pos, rayDirsWorld(yaw), fl.rays, RAY_LEN);
    hud(fl, now);
  } else {
    yaw = S.world ? firstYaw() : 0;
  }
  updateCamera(dt, pos, yaw);
  // el sol (y sus sombras) siguen a donde está la acción
  const focus = S.mode === "editor" ? controls.target : V(...pos);
  lights.sun.position.copy(focus).add(lights.offset);
  lights.sun.target.position.copy(focus);
  renderer.render(scene, camera);
  fpsN++;
  if (now - fpsT > 500) { $("fps").textContent = `${Math.round((fpsN * 1000) / (now - fpsT))} fps`; fpsN = 0; fpsT = now; }
}

// ---------------- arranque ----------------
applyQuality();
buildMenu();
editorSetup();
await buildWorld();
await loadModel();
setMode("menu");
window.__gameReady = true;
requestAnimationFrame(frame);
