// =====================================================================
// FREESTYLE: volar por gusto. 3 mapas (freestyle_mapas.js), con el control (PS5/Xbox) o el teclado, en FPV.
//   Libre · Carrera contra la IA (rivales con un modelo entrenado: el nivel 16 · Carrera) · Contrarreloj ·
//   Persecución (drones con IA te persiguen: el nivel 18 · Persecución; la "liebre" eres tú).
// Dos formas de volar:
//   Estable = la misma física que la IA (game/sim.js step: las palancas piden un ángulo; centro = flotar).
//   Acro    = solo del freestyle (la IA nunca la ve): las palancas piden una VELOCIDAD de giro, el dron gira en 3D
//             (flips y rolls) y el empuje sale hacia donde apunta la panza. Es como vuelan los drones de carreras.
// Los rivales vuelan con game/sim.js (step, buildObs, sensorRays) y su red (Policy): exactamente lo que aprendieron.
// =====================================================================
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { Level, Policy, step as fisica, newState, buildObs, sensorRays, actionToThrottle, CONTROL_HZ, SUBSTEPS } from "../game/sim.js";
import { V, makeDrone } from "../game/scene.js";
import { readGamepad, rawSticks } from "../game/pilot.js";
import { t, cargarIdioma, num, datos } from "./i18n.js";
import * as PT from "./partida.js";
import { paramsFisica } from "./parts.js";
import { MAPAS, ORDEN, nivelDe, orientaciones, cruza } from "./freestyle_mapas.js";
import { construirMapa, Portales, fondoMinimapa } from "./freestyle_vista.js";

await cargarIdioma();
const $ = (id) => document.getElementById(id);
const clip = (x, a = -1, b = 1) => Math.min(Math.max(x, a), b);
const DT = 1 / CONTROL_HZ;

// ---------------- lo que se recuerda ----------------
const CLAVE = "dronmaker.freestyle";
const cfg = { dron: "racer", mapa: "fabrica", modo: "libre", acro: false, rival: "corredor", cazador: "cazador", nRivales: 1, vueltas: 2, cam: "fpv",
  mando: 2, gasLineal: false, tasa: 600, tilt: 25, records: {} };
try { Object.assign(cfg, JSON.parse(localStorage.getItem(CLAVE) || "{}")); } catch { /* sin almacenamiento */ }
const guardar = () => { try { localStorage.setItem(CLAVE, JSON.stringify(cfg)); } catch { /* sin almacenamiento */ } };
let calidad = "media";
try { calidad = JSON.parse(localStorage.getItem("dronmaker.quality") || '"media"'); } catch { /* por defecto */ }

// ---------------- la física de los drones ----------------
const aP = (f) => { const p = { mass: f.mass, g: 9.81, twr: f.twr, drag: f.drag, maxAngle: (f.max_angle_deg * Math.PI) / 180,
  yawRate: (f.yaw_rate_deg * Math.PI) / 180, attResp: f.att_resp, crashSpeed: f.crash_speed, radius: f.radius }; p.hover = 1 / p.twr; return p; };
let RACER = aP({ mass: 0.48, twr: 4.0, drag: 0.035, max_angle_deg: 50, yaw_rate_deg: 270, att_resp: 11, crash_speed: 4, radius: 0.15 });
try { RACER = aP((await (await fetch("../drones/fs_racer.json")).json()).fisica); } catch { /* el de arriba (es el mismo) */ }
const ACRO = aP({ mass: 0.5, twr: 6.0, drag: 0.02, max_angle_deg: 90, yaw_rate_deg: 400, att_resp: 22, crash_speed: 5.5, radius: 0.15 });
/** Tus drones del hangar (la partida del juego): su física sale de sus piezas, como en el resto del juego. */
async function dronesHangar() {
  try {
    const p = PT.cargar();
    if (!p?.drones?.length) return [];
    const cat = await datos("piezas", await (await fetch("./data/piezas.json")).json());
    return p.drones.map((d) => {
      const a = PT.dronArmado(p, cat, d);
      return a && !a.stats.errores?.length ? { id: "h:" + d.id, nombre: d.nombre, p: paramsFisica(a.stats) } : null;
    }).filter(Boolean);
  } catch { return []; }
}
const fisicaDe = (id) => (S.hangar.find((h) => h.id === id)?.p) || RACER;
/** Vibrar el control (si se puede: el DualSense y el de Xbox sí, en Chrome). */
function vibrar(fuerte, ms = 160) {
  try { readGamepad()?.vibrationActuator?.playEffect("dual-rumble", { duration: ms, strongMagnitude: fuerte, weakMagnitude: Math.min(1, fuerte + 0.2) }); } catch { /* no vibra */ }
}

// cuaterniones en ejes de la simulación (w, x, y, z): X adelante, Y izquierda, Z arriba
const qMul = (a, b) => [a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3], a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
  a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1], a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0]];
const qNorm = (q) => { const n = Math.hypot(...q) || 1; return q.map((x) => x / n); };
const qRot = (q, v) => { const r = qMul(qMul(q, [0, ...v]), [q[0], -q[1], -q[2], -q[3]]); return [r[1], r[2], r[3]]; };
const qEuler = (roll, pitch, yaw) => {                     // R = Rz(yaw) Ry(pitch) Rx(roll), como sim.js
  const cr = Math.cos(roll / 2), sr = Math.sin(roll / 2), cp = Math.cos(pitch / 2), sp = Math.sin(pitch / 2), cy = Math.cos(yaw / 2), sy = Math.sin(yaw / 2);
  return [cy * cp * cr + sy * sp * sr, cy * cp * sr - sy * sp * cr, cy * sp * cr + sy * cp * sr, sy * cp * cr - cy * sp * sr];
};
const aEuler = (q) => {
  const [w, x, y, z] = q;
  return { roll: Math.atan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y)), pitch: Math.asin(clip(2 * (w * y - z * x))), yaw: Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z)) };
};
const aThree = (q, out) => out.set(q[1], q[3], -q[2], q[0]);     // los mismos ejes que V(): (x, z, -y)

/** Tu dron: Estable (sim.js) o Acro (rate mode, solo aquí). */
class Piloto {
  constructor(acro, p = RACER) {
    this.acro = acro;
    // acro: tu dron con la respuesta de uno de carreras (el racer de la liga usa el de acro, más liviano)
    this.p = !acro ? p : p === RACER ? ACRO : { ...p, attResp: 22, crashSpeed: Math.max(p.crashSpeed, 4.5) };
    this.cmd = [0, 0, 0, 0];
  }
  reset(pos, yaw) {
    this.s = newState(pos, yaw);
    this.q = qEuler(0, 0, yaw); this.w = [0, 0, 0];
    this.prev = { pos: pos.slice(), q: this.q.slice() };
    this.cmd = [0, 0, 0, 0]; this.thr = 0;
  }
  get pos() { return this.s.pos; } get vel() { return this.s.vel; }
  paso(raw) {
    const s = this.s, p = this.p;
    this.prev = { pos: s.pos.slice(), q: this.q.slice() };
    const k = 1 - Math.exp(-DT / 0.06);                       // teclado: suaviza; el control ya es analógico
    for (let i = 0; i < 4; i++) this.cmd[i] += (raw[i] - this.cmd[i]) * k;
    const [gas, roll, pitch, yaw] = this.cmd;
    let suelo = false, golpe = 0;
    if (!this.acro) {
      const a = [gas, roll, pitch, yaw];
      for (let i = 0; i < SUBSTEPS; i++) { const inf = fisica(s, a, DT / SUBSTEPS, null, p); if (inf.grounded) { suelo = true; golpe = Math.max(golpe, inf.groundCrash ? 99 : 0); } }
      this.q = qEuler(s.roll, s.pitch, s.yaw);
      this.thr = s.throttle;
    } else {
      const R = (cfg.tasa * Math.PI) / 180, e = 0.45, curva = (x) => e * x * x * x + (1 - e) * x;
      const wc = [curva(roll) * R, curva(pitch) * R, curva(yaw) * R];
      const thr = cfg.gasLineal ? (gas + 1) / 2 : actionToThrottle(gas, p);
      this.thr = clip(thr, 0, 1);
      const h = DT / SUBSTEPS;
      for (let n = 0; n < SUBSTEPS; n++) {
        const enPiso = s.pos[2] <= 0.01 && this.thr < p.hover * 0.6;      // en el piso sin gas: no se revuelca
        for (let i = 0; i < 3; i++) this.w[i] = enPiso ? 0 : this.w[i] + (wc[i] - this.w[i]) * Math.min(1, p.attResp * h);
        if (enPiso) { const eu = aEuler(this.q); this.q = qEuler(eu.roll * 0.9, eu.pitch * 0.9, eu.yaw); }
        this.q = qNorm(this.q.map((x, i) => x + 0.5 * qMul(this.q, [0, ...this.w])[i] * h));
        const bz = qRot(this.q, [0, 0, 1]), T = this.thr * p.twr * p.mass * p.g, sp = Math.hypot(...s.vel);
        for (let i = 0; i < 3; i++) s.vel[i] += ((bz[i] * T - p.drag * sp * s.vel[i] - (i === 2 ? p.mass * p.g : 0)) / p.mass) * h;
        for (let i = 0; i < 3; i++) s.pos[i] += s.vel[i] * h;
        if (s.pos[2] < 0) {
          const imp = -s.vel[2];
          s.pos[2] = 0; suelo = true;
          if (imp > p.crashSpeed || bz[2] < 0.2 && Math.hypot(...s.vel) > 2) golpe = 99;
          s.vel[2] = 0; s.vel[0] *= 0.8; s.vel[1] *= 0.8;
          if (bz[2] < 0.5) this.w = [0, 0, 0];
        }
      }
      const eu = aEuler(this.q);
      s.roll = eu.roll; s.pitch = eu.pitch; s.yaw = eu.yaw; s.throttle = this.thr;
    }
    return { suelo, golpe };
  }
}

/** Un dron con IA (el rival o el que te persigue): la red decide con lo mismo que vio al entrenar. */
class ConIA {
  constructor(policy, nivel, color) {
    this.policy = policy; this.nivel = nivel; this.p = RACER;
    this.mesh = makeDrone();
    this.mesh.userData.beacon.material = new THREE.MeshBasicMaterial({ color });
    this.color = color;
  }
  reset(pos, yaw) {
    this.s = newState(pos, yaw); this.prevA = [0, 0, 0, 0]; this.prev = pos.slice(); this.rays = sensorRays(this.s, this.nivel);
    this.muerto = 0;
  }
  get pos() { return this.s.pos; } get vel() { return this.s.vel; }
  paso(meta, metaVel = null) {
    const s = this.s;
    this.prev = s.pos.slice();
    const obs = buildObs(s, meta, this.rays, this.prevA, metaVel, this.p);
    const a = this.policy.act(obs);
    let choque = false;
    for (let i = 0; i < SUBSTEPS; i++) choque ||= fisica(s, a, DT / SUBSTEPS, null, this.p).groundCrash;
    this.prevA = a;
    this.rays = sensorRays(s, this.nivel);
    return choque || this.nivel.collides(s.pos, this.p.radius) || this.nivel.outOfBounds(s.pos);
  }
}

// ---------------- Three.js ----------------
const canvas = $("c");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = calidad !== "baja";
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, { alta: 2, media: 1.5, baja: 1 }[calidad] || 1.5));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, 1, 0.03, 1200);
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.45, 0.82);
composer.addPass(bloom);
composer.addPass(new OutputPass());
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false); composer.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

const dron = makeDrone();
scene.add(dron);
const chispas = (() => {                                     // el choque: chispas que vuelan
  const n = 60, g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffb347, size: 0.12, transparent: true }));
  pts.visible = false; pts.frustumCulled = false; scene.add(pts);
  const v = new Float32Array(n * 3); let vida = 0;
  return {
    en(p) { const a = g.attributes.position; for (let i = 0; i < n; i++) { const q = V(...p); a.setXYZ(i, q.x, q.y, q.z); v[i * 3] = (Math.random() - 0.5) * 8; v[i * 3 + 1] = Math.random() * 6; v[i * 3 + 2] = (Math.random() - 0.5) * 8; } vida = 1; pts.visible = true; },
    tick(dt) { if (vida <= 0) return; vida -= dt; const a = g.attributes.position; for (let i = 0; i < n; i++) { v[i * 3 + 1] -= 9.8 * dt; a.setXYZ(i, a.getX(i) + v[i * 3] * dt, a.getY(i) + v[i * 3 + 1] * dt, a.getZ(i) + v[i * 3 + 2] * dt); } a.needsUpdate = true; pts.material.opacity = Math.max(0, vida); pts.visible = vida > 0; },
  };
})();

// ---------------- sonido (sintetizado: el motor sube con el gas) ----------------
const audio = { ctx: null };
function prenderAudio() {
  if (audio.ctx) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const g = ctx.createGain(); g.gain.value = 0; g.connect(ctx.destination);
    const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 900; f.connect(g);
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
    o1.type = "sawtooth"; o2.type = "square"; o1.connect(f); o2.connect(f); o1.start(); o2.start();
    Object.assign(audio, { ctx, g, f, o1, o2 });
  } catch { /* sin audio */ }
}
function motor(thr, vel, activo) {
  if (!audio.ctx) return;
  const t0 = audio.ctx.currentTime, hz = 70 + 230 * thr + 4 * vel;
  audio.o1.frequency.setTargetAtTime(hz, t0, 0.05); audio.o2.frequency.setTargetAtTime(hz * 1.51, t0, 0.05);
  audio.f.frequency.setTargetAtTime(500 + 1600 * thr, t0, 0.08);
  audio.g.gain.setTargetAtTime(activo ? 0.025 + 0.05 * thr : 0, t0, 0.1);
}
function bip(hz = 880, dur = 0.12, vol = 0.12) {
  if (!audio.ctx) return;
  const o = audio.ctx.createOscillator(), g = audio.ctx.createGain(), t0 = audio.ctx.currentTime;
  o.frequency.value = hz; o.connect(g); g.connect(audio.ctx.destination);
  g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.start(t0); o.stop(t0 + dur);
}
function golpeSonido() {
  if (!audio.ctx) return;
  const ctx = audio.ctx, n = ctx.sampleRate * 0.4, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 2;
  const s = ctx.createBufferSource(), g = ctx.createGain(); g.gain.value = 0.3;
  s.buffer = b; s.connect(g); g.connect(ctx.destination); s.start();
}
window.addEventListener("pointerdown", prenderAudio);
window.addEventListener("keydown", prenderAudio);

// ---------------- el estado del juego ----------------
const S = { hangar: [], pantalla: "menu", mapa: null, vista: null, portales: null, nivel: null, dirs: null, piloto: null, ias: [], modelos: [],
  t: 0, acc: 0, cuenta: 0, pausa: false, fin: false, k: 0, vueltaT0: 0, vueltas: [], vmax: 0, muerto: 0, vidas: 3, atrapado: 0, avisoT: 0 };
const keys = new Set();

async function cargarModelo(slug) {
  const url = slug === "base" ? "../models/modelo_web.json" : `../models/drones/${slug}/modelo_web.json`;
  return new Policy(await (await fetch(url, { cache: "no-store" })).json());
}
async function listaModelos() {
  try { return (await (await fetch("/api/modelos", { cache: "no-store" })).json()).modelos.filter((m) => m.tiene_modelo).map((m) => m.slug); }
  catch { return ["base"]; }
}

function ponerMapa(id) {
  if (S.mapa?.id === id && S.vista) return;
  S.vista?.dispose(); S.portales?.dispose(scene);
  const M = MAPAS[id];
  S.mapa = M;
  S.vista = construirMapa(scene, M, calidad);
  S.dirs = orientaciones(M.gates, M.spawn);
  S.portales = new Portales(scene, M.gates, S.dirs, M.ambiente.noche);
  S.portales.pintar(-1);
  S.nivel = new Level(nivelDe(M));
  S.mini = fondoMinimapa(M, 190);
  bloom.strength = M.ambiente.noche ? 0.9 : 0.22;
  bloom.threshold = M.ambiente.noche ? 0.6 : 0.88;
}

// ---------------- el menú ----------------
const MODOS = {
  libre: [t("Libre"), t("Vuela por donde quieras, sin reloj. Los portales son solo para jugar.")],
  carrera: [t("Carrera contra la IA"), t("Vueltas a la pista contra drones que vuelan con un modelo entrenado.")],
  reloj: [t("Contrarreloj"), t("Tú solo contra el reloj: tu mejor vuelta queda guardada.")],
  persecucion: [t("Persecución"), t("Drones con IA te persiguen: aguanta 60 s sin que te alcancen (3 vidas).")],
};
const NOMBRES = { fabrica: [t("La fábrica abandonada"), t("Una nave industrial con el techo roto, silos, una chimenea y contenedores. Para FPV: puertas, ventanas y huecos.")],
  canon: [t("El cañón"), t("Un cañón del desierto al atardecer: paredes de roca, arcos naturales, mesas y agujas. Para ir RÁPIDO.")],
  estadio: [t("El estadio de noche"), t("Una pista de carreras de drones con luces de neón: torre para tirarse en picada, túnel, escalera de portales y tribunas.")] };
const seg = (id, opciones, valor, alCambiar) => {
  const el = document.createElement("div"); el.className = "seg"; el.id = id;
  for (const [v, txt] of opciones) {
    const b = document.createElement("button"); b.textContent = txt; b.setAttribute("aria-pressed", String(v === valor));
    b.onclick = () => { [...el.children].forEach((c) => c.setAttribute("aria-pressed", String(c === b))); alCambiar(v); };
    el.appendChild(b);
  }
  return el;
};
const fmtT = (s) => (s == null ? "—" : `${Math.floor(s / 60)}:${num(s % 60, 2).padStart(5, "0")}`);

function menu() {
  S.pantalla = "menu";
  $("menu").classList.remove("hidden");
  $("hud").classList.add("hidden");
  $("pausa").classList.add("hidden"); $("fin").classList.add("hidden");
  S.ias.forEach((r) => scene.remove(r.mesh)); S.ias = [];
  ponerMapa(cfg.mapa);
  dron.visible = false;
  fantasma.visible = false;
  const m = $("menu");
  m.innerHTML = `<h1>Freestyle<small>${t("Conecta tu control y vuela por gusto: rápido, en FPV, contra la IA o con la IA detrás de ti.")}</small></h1>`;
  const mapas = document.createElement("div"); mapas.className = "mapas";
  for (const id of ORDEN) {
    const b = document.createElement("button"); b.className = "mapa"; b.setAttribute("aria-pressed", String(id === cfg.mapa));
    b.innerHTML = `<i>${MAPAS[id].icono}</i><b></b><span></span>`;
    b.querySelector("b").textContent = NOMBRES[id][0]; b.querySelector("span").textContent = NOMBRES[id][1];
    b.onclick = () => { cfg.mapa = id; guardar(); menu(); };
    mapas.appendChild(b);
  }
  m.appendChild(mapas);
  const modos = document.createElement("div"); modos.className = "modos";
  for (const [id, [nom, desc]] of Object.entries(MODOS)) {
    const b = document.createElement("button"); b.className = "modo"; b.setAttribute("aria-pressed", String(id === cfg.modo));
    b.innerHTML = "<b></b><span></span>"; b.querySelector("b").textContent = nom; b.querySelector("span").textContent = desc;
    b.onclick = () => { cfg.modo = id; guardar(); menu(); };
    modos.appendChild(b);
  }
  m.appendChild(modos);
  const fila = (txt, el) => { const f = document.createElement("div"); f.className = "fila"; const s = document.createElement("span"); s.className = "muted"; s.textContent = txt; f.append(s, el); m.appendChild(f); return f; };
  if (S.hangar.length) {
    const sel = document.createElement("select");
    for (const [id, nom] of [["racer", t("Racer de la liga (el de los rivales)")], ...S.hangar.map((h) => [h.id, t("Tu dron: {n}", { n: h.nombre })])]) {
      const o = document.createElement("option"); o.value = id; o.textContent = nom; o.selected = id === cfg.dron; sel.appendChild(o);
    }
    sel.onchange = () => { cfg.dron = sel.value; guardar(); };
    fila(t("Dron"), sel);
  }
  fila(t("Cómo vuela tu dron"), seg("s-acro", [[false, t("Estable (como la IA)")], [true, t("Acro (flips)")]], cfg.acro, (v) => { cfg.acro = v; guardar(); menu(); }));
  if (cfg.modo === "carrera" || cfg.modo === "persecucion") {
    const sel = document.createElement("select"), clave = cfg.modo === "carrera" ? "rival" : "cazador";
    const lista = S.modelos.length ? S.modelos : [cfg[clave]];
    for (const slug of lista) { const o = document.createElement("option"); o.value = slug; o.textContent = slug === "base" ? t("base (la IA de siempre)") : slug; o.selected = slug === cfg[clave]; sel.appendChild(o); }
    sel.onchange = () => { cfg[clave] = sel.value; guardar(); };
    fila(cfg.modo === "carrera" ? t("El modelo del rival") : t("El modelo que te persigue"), sel);
    fila(cfg.modo === "carrera" ? t("Rivales") : t("Perseguidores"), seg("s-n", [[1, "1"], [2, "2"], [3, "3"]], cfg.nRivales, (v) => { cfg.nRivales = v; guardar(); }));
  }
  if (cfg.modo === "carrera" || cfg.modo === "reloj") fila(t("Vueltas"), seg("s-v", [[1, "1"], [2, "2"], [3, "3"]], cfg.vueltas, (v) => { cfg.vueltas = v; guardar(); }));
  fila(t("Cámara"), seg("s-cam", [["fpv", "FPV"], ["detras", t("Detrás")], ["lejos", t("Lejos")]], cfg.cam, (v) => { cfg.cam = v; guardar(); }));
  fila(t("Control"), seg("s-mando", [[2, t("Modo 2")], [1, t("Modo 1")]], cfg.mando, (v) => { cfg.mando = v; guardar(); }));
  if (cfg.acro) fila(t("Gas en acro"), seg("s-gas", [[false, t("Centro = flotar")], [true, t("Lineal (como un radio)")]], cfg.gasLineal, (v) => { cfg.gasLineal = v; guardar(); }));
  const pad = document.createElement("div"); pad.id = "pad"; m.appendChild(pad);
  const rec = cfg.records[cfg.mapa] || {}, r = document.createElement("div"); r.id = "record";
  r.innerHTML = [`<b>${t("Tus récords aquí")}</b>`,
    t("Mejor vuelta: {t}", { t: fmtT(rec.vuelta) }),
    rec.vsIA ? t("Contra la IA: {g} ganadas, {p} perdidas", { g: rec.vsIA[0], p: rec.vsIA[1] }) : null,
    rec.persecucion != null ? t("Persecución: aguantaste {t}", { t: fmtT(rec.persecucion) }) : null,
    rec.vmax ? t("Velocidad máxima: {v} km/h", { v: Math.round(rec.vmax) }) : null].filter(Boolean).join("<br>");
  m.appendChild(r);
  const acc = document.createElement("div"); acc.className = "acciones";
  const ir = document.createElement("button"); ir.className = "btn main"; ir.textContent = t("¡A volar!"); ir.onclick = () => empezar();
  const volver = document.createElement("a"); volver.className = "btn ghost"; volver.href = "./index.html"; volver.textContent = t("Volver al juego");
  acc.append(ir, volver); m.appendChild(acc);
  const ayuda = document.createElement("p"); ayuda.className = "muted"; ayuda.style.cssText = "margin:0;font-size:12.5px;line-height:1.45";
  ayuda.textContent = cfg.acro
    ? t("Acro: la palanca derecha GIRA el dron (suelta y se queda inclinado), la izquierda es gas y giro. Teclado: WASD gira, Espacio/Shift gas, flechas giro.")
    : t("Estable: la palanca derecha inclina (suelta y se nivela), la izquierda es gas (centro = flotar) y giro. Teclado: WASD moverse, Espacio subir, Shift bajar, flechas girar.");
  m.appendChild(ayuda);
  ir.focus();
  estadoPad();
}
function estadoPad() {
  const el = $("pad"); if (!el) return;
  const gp = readGamepad();
  el.textContent = gp ? t("🎮 Control conectado: {n}", { n: gp.id.split("(")[0].trim().slice(0, 40) }) : t("🎮 Conecta un control (PS5, Xbox…) y mueve una palanca. También sirve el teclado.");
}
window.addEventListener("gamepadconnected", () => { estadoPad(); toast(t("Control conectado")); });
window.addEventListener("gamepaddisconnected", () => { estadoPad(); toast(t("Se desconectó el control")); });

let toastT = 0;
function toast(msg, ms = 2400) { const el = $("toast"); el.textContent = msg; el.style.opacity = 1; clearTimeout(toastT); toastT = setTimeout(() => (el.style.opacity = 0), ms); }
function aviso(txt, color = "#fff", ms = 1200) { const el = $("aviso"); el.textContent = txt; el.style.color = color; S.avisoT = performance.now() + ms; }

// ---------------- empezar un vuelo ----------------
const ALCANCE = 1.3;                                         // persecución: te alcanzó (entrenó con 0,8 m; aquí el blanco puede estar en el piso)
const SALIDA_DX = 2.2;                                         // los drones salen en fila, 2,2 m uno del otro
function salida(i) {
  const M = S.mapa, c = Math.cos(M.yaw), s = Math.sin(M.yaw), off = (i - (S.ias.length) / 2) * SALIDA_DX;
  return [M.spawn[0] - s * off, M.spawn[1] + c * off, 0];
}
async function empezar() {
  prenderAudio();
  const M = S.mapa, modo = cfg.modo;
  S.piloto = new Piloto(cfg.acro, fisicaDe(cfg.dron));
  S.ias.forEach((r) => scene.remove(r.mesh)); S.ias = [];
  if (modo === "carrera" || modo === "persecucion") {
    const slug = modo === "carrera" ? cfg.rival : cfg.cazador;
    let pol;
    try { pol = await cargarModelo(slug); } catch { toast(t("No pude cargar el modelo {m}: abre el juego con jugar.py", { m: slug })); return; }
    const cols = [0x3ccbff, 0xff2fa0, 0xffd23f];
    for (let i = 0; i < cfg.nRivales; i++) { const r = new ConIA(pol, S.nivel, cols[i]); r.slug = slug; scene.add(r.mesh); S.ias.push(r); }
  }
  $("menu").classList.add("hidden"); $("fin").classList.add("hidden"); $("pausa").classList.add("hidden");
  $("hud").classList.remove("hidden");
  S.pantalla = "vuelo";
  reiniciar();
}
// ---------------- el fantasma: tu mejor vuelta en este mapa (contrarreloj y carrera) ----------------
const claveF = () => `dronmaker.freestyle.fantasma.${S.mapa.id}`;
const fantasma = makeDrone();
fantasma.traverse((o) => { if (o.material) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.35; o.material.depthWrite = false; } });
fantasma.visible = false;
scene.add(fantasma);
function cargarFantasma() {
  try { S.fantasma = JSON.parse(localStorage.getItem(claveF()) || "null"); } catch { S.fantasma = null; }
}
/** Terminó una vuelta: si es la mejor, queda como fantasma (una muestra cada 2 pasos: x, y, z, w, qx, qy, qz). */
function fantasmaVuelta(tv) {
  const lista = S.grabando || [];
  S.grabando = [];
  if (S.vueltasSucias) { S.vueltasSucias = false; return; }                 // volviste al portal con T: no cuenta
  if (!S.fantasma || tv < S.fantasma.t) {
    S.fantasma = { t: tv, p: lista };
    try { localStorage.setItem(claveF(), JSON.stringify(S.fantasma)); } catch { /* sin espacio */ }
  }
}
function reiniciar() {
  const M = S.mapa, modo = cfg.modo;
  const p0 = modo === "persecucion" ? [M.spawn[0], M.spawn[1], 0] : salida(S.ias.length);
  S.piloto.reset(p0, M.yaw);
  S.ias.forEach((r, i) => {
    if (modo === "carrera") r.reset(salida(i), M.yaw);
    else r.reset(lejosDe(M.spawn, 22 + 6 * i, i), M.yaw);
    r.k = 0; r.tFin = null; r.mesh.visible = true;
  });
  Object.assign(S, { t: 0, acc: 0, cuenta: modo === "libre" ? 0 : 3.0, pausa: false, fin: false, k: 0, vueltaT0: 0, vueltas: [], vmax: 0, muerto: 0,
    vidas: 3, atrapado: 0, tFin: null, camNueva: true });
  S.portales.pintar(modo === "libre" ? -1 : 0);
  S.grabando = []; S.vueltasSucias = false;
  cargarFantasma();
  dron.visible = cfg.cam !== "fpv";
  $("fin").classList.add("hidden"); $("pausa").classList.add("hidden");
  teclasHUD();
}
/** Un punto libre a `d` m de p (para que el perseguidor aparezca lejos). */
function lejosDe(p, d, semilla = 0) {
  for (let k = 0; k < 40; k++) {
    const a = (semilla * 2.4 + k * 0.7) % (2 * Math.PI), q = [p[0] + Math.cos(a) * d, p[1] + Math.sin(a) * d, 2.5];
    if (Math.abs(q[0]) < S.mapa.bounds.xy - 5 && Math.abs(q[1]) < S.mapa.bounds.xy - 5 && !S.nivel.collides(q, 1.5)) return q;
  }
  return [p[0], p[1] - d, 3];
}
function teclasHUD() {
  $("h-teclas").textContent = t("R reiniciar · T volver al último portal · C cámara · Esc pausa. Control: ○/B cámara, △/Y volver, Options pausa.");
}

// ---------------- el vuelo, paso a paso (50 por segundo) ----------------
function palancas() {
  const raw = rawSticks(keys, { mode: cfg.mando });
  return raw;
}
function chocar(quien, pos) {
  chispas.en(pos);
  golpeSonido();
  if (quien === S.piloto) vibrar(1, 350);
  if (quien === S.piloto) { S.muerto = 1.1; aviso(t("¡Choque!"), "#ff5040"); }
}
/** Volver al último portal pasado (o a la salida), mirando al siguiente. */
function reaparecer(quien) {
  const M = S.mapa, n = M.gates.length, k = quien.k || 0;
  const g = k > 0 ? M.gates[(k - 1) % n] : null, sig = M.gates[k % n];
  const pos = g ? g.slice() : quien === S.piloto ? salida(S.ias.length) : [M.spawn[0], M.spawn[1], 0];
  const yaw = Math.atan2(sig[1] - pos[1], sig[0] - pos[0]);
  if (quien === S.piloto) S.piloto.reset(pos, yaw); else quien.reset(pos, yaw);
}
function paso() {
  const M = S.mapa, n = M.gates.length, modo = cfg.modo, P = S.piloto;
  if (S.cuenta > 0) {                                          // 3, 2, 1… (nadie se mueve)
    const antes = Math.ceil(S.cuenta);
    S.cuenta -= DT;
    if (Math.ceil(S.cuenta) !== antes) bip(S.cuenta <= 0 ? 1320 : 660, S.cuenta <= 0 ? 0.35 : 0.15);
    return;
  }
  S.t += DT;
  // tú
  if (S.muerto > 0) { S.muerto -= DT; if (S.muerto <= 0) reaparecer(P); }
  else {
    const a = P.pos.slice();
    const { golpe } = P.paso(palancas());
    let choque = golpe > 0;
    if (S.nivel.collides(P.pos, P.p.radius)) {
      if (Math.hypot(...P.vel) > P.p.crashSpeed * 0.7) choque = true;
      else { P.s.pos = a; P.s.vel = P.vel.map((v) => -0.3 * v); }       // un toque suave: rebota
    }
    const B = M.bounds.xy;                                    // el borde del mapa: una pared invisible
    for (let i = 0; i < 2; i++) if (Math.abs(P.pos[i]) > B) { P.pos[i] = Math.sign(P.pos[i]) * B; P.vel[i] *= -0.4; }
    if (P.pos[2] > M.bounds.z) { P.pos[2] = M.bounds.z; P.vel[2] = Math.min(0, P.vel[2]); }
    if (choque) chocar(P, P.pos);
    else if (modo !== "libre" && S.fin === false && cruza(a, P.pos, M.gates[S.k % n])) {
      S.portales.destello(S.k % n);
      S.k++;
      bip(988, 0.09, 0.1);
      vibrar(0.25, 80);
      if (S.k % n === 0) {                                    // terminó una vuelta
        S.vueltas.push(S.t - S.vueltaT0);
        fantasmaVuelta(S.t - S.vueltaT0);
        S.vueltaT0 = S.t;
        const tot = modo === "persecucion" ? Infinity : cfg.vueltas;
        if (S.vueltas.length >= tot) { S.tFin = S.t; terminar(); }
        else aviso(t("Vuelta {n}", { n: S.vueltas.length + 1 }), "#47f08a");
      }
      if (!S.fin) S.portales.pintar(S.k % n);
    }
    S.vmax = Math.max(S.vmax, Math.hypot(...P.vel) * 3.6);
    if ((modo === "reloj" || modo === "carrera") && (S.n = (S.n || 0) + 1) % 2 === 0)
      S.grabando.push([...P.pos.map((x) => +x.toFixed(2)), ...P.q.map((x) => +x.toFixed(3))]);
  }
  // los drones con IA
  for (const r of S.ias) {
    if (r.muerto > 0) { r.muerto -= DT; if (r.muerto <= 0) { if (modo === "carrera") reaparecer(r); else r.reset(lejosDe(P.pos, 25), 0); } continue; }
    if (modo === "carrera") {
      if (r.tFin != null) { r.s.vel = r.s.vel.map((v) => v * 0.96); continue; }   // ya llegó: se queda flotando
      const g = M.gates[r.k % n];
      if (r.paso(g)) { chocar(r, r.pos); r.muerto = 1.5; r.choques = (r.choques || 0) + 1; continue; }
      if (cruza(r.prev, r.pos, g)) { r.k++; if (r.k >= n * cfg.vueltas) r.tFin = S.t; }
    } else {
      if (S.t < 2) continue;                                   // te dan 2 s de ventaja
      if (r.paso(P.pos, P.vel)) { chocar(r, r.pos); r.muerto = 1.5; continue; }
      if (S.muerto <= 0 && Math.hypot(r.pos[0] - P.pos[0], r.pos[1] - P.pos[1], r.pos[2] - P.pos[2]) < ALCANCE) {
        S.vidas--; S.atrapado++;
        aviso(S.vidas > 0 ? t("¡Te alcanzó! Quedan {n}", { n: S.vidas }) : t("¡Te atrapó!"), "#ff5040");
        golpeSonido();
        r.reset(lejosDe(P.pos, 30, S.atrapado), 0);
        if (S.vidas <= 0) { S.tFin = S.t; terminar(); }
      }
    }
  }
  if (modo === "persecucion" && S.t >= 60 && !S.fin) { S.tFin = 60; terminar(); }
}

// ---------------- el final ----------------
function terminar() {
  S.fin = true;
  const M = S.mapa, modo = cfg.modo, rec = (cfg.records[M.id] ||= {});
  rec.vmax = Math.max(rec.vmax || 0, S.vmax);
  const mejorVuelta = S.vueltas.length ? Math.min(...S.vueltas) : null;
  if (mejorVuelta != null && (rec.vuelta == null || mejorVuelta < rec.vuelta)) { rec.vuelta = mejorVuelta; S.nuevoRecord = true; } else S.nuevoRecord = false;
  const el = $("fin"); let h = "", filas = [];
  if (modo === "carrera") {
    // los rivales que no llegaron: se estima con lo que les faltaba
    const todos = [{ nom: t("Tú"), tt: S.tFin }, ...S.ias.map((r, i) => ({ nom: t("IA {n} ({m})", { n: i + 1, m: r.slug }), tt: r.tFin }))];
    todos.sort((a, b) => (a.tt ?? Infinity) - (b.tt ?? Infinity));
    const pos = todos.findIndex((x) => x.nom === t("Tú")) + 1, gano = pos === 1;
    rec.vsIA = rec.vsIA || [0, 0]; rec.vsIA[gano ? 0 : 1]++;
    h = gano ? t("¡Ganaste la carrera!") : t("Llegaste de {p}°", { p: pos });
    filas = todos.map((x, i) => [`${i + 1}. ${x.nom}`, x.tt != null ? fmtT(x.tt) : t("no llegó")]);
  } else if (modo === "reloj") {
    h = t("¡Terminaste!");
    filas = S.vueltas.map((v, i) => [t("Vuelta {n}", { n: i + 1 }), fmtT(v)]);
    filas.push([t("Total"), fmtT(S.tFin)]);
  } else if (modo === "persecucion") {
    const aguanto = S.vidas > 0;
    h = aguanto ? t("¡Aguantaste los 60 s!") : t("Te atraparon");
    if (rec.persecucion == null || S.tFin > rec.persecucion) rec.persecucion = S.tFin;
    filas = [[t("Tiempo"), fmtT(S.tFin)], [t("Veces que te alcanzaron"), String(S.atrapado)], [t("Portales que pasaste"), String(S.k)]];
  }
  filas.push([t("Velocidad máxima"), `${Math.round(S.vmax)} km/h`]);
  guardar();
  el.innerHTML = `<h2></h2><table id="fin-tabla"></table>${S.nuevoRecord ? `<p class="muted" style="margin:0">⭐ ${t("¡Nuevo récord de vuelta en este mapa!")}</p>` : ""}<div class="acciones"><button class="btn main" id="f-otra"></button><button class="btn ghost" id="f-menu"></button></div>`;
  el.querySelector("h2").textContent = h;
  const tb = el.querySelector("table");
  for (const [a, b] of filas) { const tr = tb.insertRow(); tr.insertCell().textContent = a; tr.insertCell().textContent = b; }
  el.querySelector("#f-otra").textContent = t("Otra vez"); el.querySelector("#f-otra").onclick = () => reiniciar();
  el.querySelector("#f-menu").textContent = t("Menú"); el.querySelector("#f-menu").onclick = () => menu();
  el.classList.remove("hidden");
  el.querySelector("#f-otra").focus();
}
function pausar(si) {
  if (S.pantalla !== "vuelo" || S.fin) return;
  S.pausa = si;
  const el = $("pausa");
  el.classList.toggle("hidden", !si);
  if (!si) return;
  el.innerHTML = `<h2>${t("Pausa")}</h2><div class="acciones"><button class="btn main" id="p-seguir"></button><button class="btn ghost" id="p-otra"></button><button class="btn ghost" id="p-menu"></button></div>`;
  el.querySelector("#p-seguir").textContent = t("Seguir"); el.querySelector("#p-seguir").onclick = () => pausar(false);
  el.querySelector("#p-otra").textContent = t("Reiniciar"); el.querySelector("#p-otra").onclick = () => reiniciar();
  el.querySelector("#p-menu").textContent = t("Menú"); el.querySelector("#p-menu").onclick = () => menu();
  el.querySelector("#p-seguir").focus();
}

// ---------------- teclas y botones del control ----------------
window.addEventListener("keydown", (e) => {
  keys.add(e.code);
  if (S.pantalla !== "vuelo") return;
  if (["Space", "ShiftLeft", "ShiftRight", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
  if (e.code === "Escape") pausar(!S.pausa);
  if (e.code === "KeyR") reiniciar();
  if (e.code === "KeyC") cambiarCam();
  if (e.code === "KeyT" && !S.fin) reaparecer(S.piloto);
});
window.addEventListener("keyup", (e) => keys.delete(e.code));
window.addEventListener("blur", () => keys.clear());
const CAMS = ["fpv", "detras", "lejos"];
function cambiarCam() { cfg.cam = CAMS[(CAMS.indexOf(cfg.cam) + 1) % CAMS.length]; guardar(); dron.visible = cfg.cam !== "fpv"; toast({ fpv: "FPV", detras: t("Detrás"), lejos: t("Lejos") }[cfg.cam], 900); }
let padAntes = [];
function botonesPad() {
  const gp = readGamepad();
  if (!gp) { padAntes = []; return; }
  const ya = gp.buttons.map((b) => b.pressed), toco = (i) => ya[i] && !padAntes[i];
  padAntes = ya;
  if (S.pantalla === "menu") { if (toco(0) || toco(9)) empezar(); return; }
  if (toco(9)) { if (S.fin) menu(); else pausar(!S.pausa); }
  if (toco(1)) cambiarCam();
  if (toco(3) && !S.fin && !S.pausa) reaparecer(S.piloto);
  if (toco(0) && (S.fin || S.pausa)) reiniciar();
}

// ---------------- la cámara ----------------
const qThree = new THREE.Quaternion(), qPrev = new THREE.Quaternion(), FPV_Q = new THREE.Quaternion();
const camPos = new THREE.Vector3();
function camara(dt, pos, q, yaw) {
  if (S.pantalla === "menu") {
    const M = S.mapa, a = performance.now() / 1000 * 0.06, R = M.id === "canon" ? 70 : 48;
    camera.fov = 60; camera.updateProjectionMatrix();
    camera.position.copy(V(M.spawn[0] * 0.3 + Math.cos(a) * R, M.spawn[1] * 0.3 + Math.sin(a) * R, M.id === "canon" ? 34 : 20));
    camera.lookAt(V(M.spawn[0] * 0.3, M.spawn[1] * 0.3, 4));
    return;
  }
  if (S.camaraTV) { S.camaraTV(camera, V(...pos), dt); return; }   // para videos: una cámara propia (S.camaraTV(camera, pos, dt))
  const p = V(...pos);
  if (S.camNueva) { S.camNueva = false; camPos.copy(V(pos[0] - Math.cos(yaw) * 3, pos[1] - Math.sin(yaw) * 3, pos[2] + 1.5)); }
  if (cfg.cam === "fpv") {
    if (camera.fov !== 110) { camera.fov = 110; camera.updateProjectionMatrix(); }
    FPV_Q.setFromEuler(new THREE.Euler((cfg.tilt * Math.PI) / 180, -Math.PI / 2, 0, "YXZ"));
    camera.position.copy(p).add(new THREE.Vector3(0.09, 0.04, 0).applyQuaternion(q));
    camera.quaternion.copy(q).multiply(FPV_Q);
  } else {
    if (camera.fov !== 72) { camera.fov = 72; camera.updateProjectionMatrix(); }
    const lejos = cfg.cam === "lejos";
    let back = lejos ? 7 : 2.6, up = lejos ? 3.2 : 0.9;
    // si una pared o una roca queda entre el dron y la cámara, la cámara se acerca (no se mete adentro)
    const L = Math.hypot(back, up), libre = S.nivel.raycast(pos, [[-Math.cos(yaw) * back / L, -Math.sin(yaw) * back / L, up / L]], L)[0];
    if (libre < L) { const f = Math.max((libre - 0.3) / L, 0.12); back *= f; up *= f; }
    const want = V(pos[0] - Math.cos(yaw) * back, pos[1] - Math.sin(yaw) * back, pos[2] + up);
    if (libre < L) camPos.copy(want);
    camPos.lerp(want, 1 - Math.exp(-6 * dt));
    camera.position.copy(camPos);
    camera.lookAt(V(pos[0] + Math.cos(yaw) * 2, pos[1] + Math.sin(yaw) * 2, pos[2] + 0.3));
  }
}

// ---------------- HUD ----------------
function hud(pos, q3) {
  const P = S.piloto, M = S.mapa, n = M.gates.length, modo = cfg.modo;
  const v = Math.hypot(...P.vel);
  $("h-kmh").textContent = Math.round(v * 3.6);
  $("h-sub").innerHTML = `km/h · ${t("altura {h} m", { h: num(P.pos[2], 1) })}<br>${cfg.acro ? "ACRO" : t("ESTABLE")} · ${t("máx. {v} km/h", { v: Math.round(S.vmax) })}`;
  $("h-gas").firstElementChild.style.width = `${Math.round(P.thr * 100)}%`;
  let arriba = fmtT(S.t), info = "";
  if (modo === "carrera" || modo === "reloj") {
    const vuelta = Math.min(S.vueltas.length + 1, cfg.vueltas);
    info = t("Vuelta {v} de {n} · portal {k} de {m}", { v: vuelta, n: cfg.vueltas, k: (S.k % n) + 1, m: n });
    if (modo === "carrera") {
      const nota = (k, p, tFin) => (tFin != null ? 1e9 - tFin : k * 1e4 - dist(p, M.gates[k % n]));
      const yo = nota(S.k, P.pos, S.tFin);
      const pos = 1 + S.ias.filter((r) => nota(r.k, r.pos, r.tFin) > yo).length;
      info = `${t("Puesto {p} de {n}", { p: pos, n: S.ias.length + 1 })} · ${info}`;
    }
  } else if (modo === "persecucion") {
    arriba = fmtT(Math.max(0, 60 - S.t));
    const d = Math.min(...S.ias.map((r) => dist(r.pos, P.pos)));
    info = `${"❤️".repeat(Math.max(0, S.vidas))} · ${t("el más cerca a {d} m", { d: num(d, 0) })}`;
  } else info = t("Vuelo libre · {m}", { m: NOMBRES[M.id][0] });
  $("h-tiempo").textContent = S.cuenta > 0 ? "" : arriba;
  $("h-info").textContent = info;
  // el minimapa
  const c = $("h-mini"), g = c.getContext("2d"), mm = S.mini;
  g.clearRect(0, 0, c.width, c.height);
  g.drawImage(mm.c, 0, 0);
  if (modo !== "libre") { const gg = M.gates[S.k % n]; g.fillStyle = "#ff7a1a"; g.beginPath(); g.arc(mm.X(gg[0]), mm.Y(gg[1]), 4, 0, 7); g.fill(); }
  for (const r of S.ias) { g.fillStyle = "#" + r.color.toString(16).padStart(6, "0"); g.beginPath(); g.arc(mm.X(r.pos[0]), mm.Y(r.pos[1]), 3.5, 0, 7); g.fill(); }
  const yaw = P.s.yaw, x = mm.X(P.pos[0]), y = mm.Y(P.pos[1]);
  g.fillStyle = "#fff"; g.beginPath(); g.moveTo(x + Math.cos(yaw) * 7, y - Math.sin(yaw) * 7);
  g.lineTo(x + Math.cos(yaw + 2.5) * 5, y - Math.sin(yaw + 2.5) * 5); g.lineTo(x + Math.cos(yaw - 2.5) * 5, y - Math.sin(yaw - 2.5) * 5); g.fill();
  // la cuenta y los avisos
  $("cuenta").classList.toggle("hidden", !(S.cuenta > 0));
  if (S.cuenta > 0) $("cuenta").textContent = Math.ceil(S.cuenta);
  if (performance.now() > S.avisoT) $("aviso").textContent = "";
  osd(q3);
}
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Encima del video: el horizonte (FPV) y la flecha al portal que toca. */
function osd() {
  const c = $("osd"), W = window.innerWidth, H = window.innerHeight, dpr = Math.min(window.devicePixelRatio, 2);
  if (c.width !== W * dpr) { c.width = W * dpr; c.height = H * dpr; }
  const g = c.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  if (S.pantalla !== "vuelo") return;
  const s = S.piloto.s, cx = W / 2, cy = H / 2;
  if (cfg.cam === "fpv") {
    g.strokeStyle = "rgba(255,122,26,0.95)"; g.lineWidth = 2;
    g.beginPath(); g.moveTo(cx - 14, cy); g.lineTo(cx - 5, cy); g.moveTo(cx + 5, cy); g.lineTo(cx + 14, cy); g.moveTo(cx, cy - 4); g.lineTo(cx, cy + 4); g.stroke();
  }
  if (cfg.modo === "libre" || S.fin) return;
  const gg = S.mapa.gates[S.k % S.mapa.gates.length], v = V(...gg).project(camera);
  const detras = v.z > 1, x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * H;
  const dentro = !detras && x > 30 && x < W - 30 && y > 30 && y < H - 30;
  g.fillStyle = "#ff7a1a"; g.strokeStyle = "rgba(0,0,0,.6)"; g.lineWidth = 2;
  g.font = '600 14px "Chakra Petch", system-ui'; g.textAlign = "center";
  const d = dist(s.pos, gg);
  if (dentro) {
    g.beginPath(); g.moveTo(x, y - 10); g.lineTo(x + 8, y); g.lineTo(x, y + 10); g.lineTo(x - 8, y); g.closePath(); g.stroke(); g.fill();
    g.fillText(`${Math.round(d)} m`, x, y + 26);
  } else {                                                     // afuera de la vista: una flecha en el borde
    let ax = x - cx, ay = y - cy;
    if (detras) { ax = -ax; ay = -ay; }
    const a = Math.atan2(ay, ax), r = Math.min(W, H) * 0.42, px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
    g.save(); g.translate(px, py); g.rotate(a);
    g.beginPath(); g.moveTo(16, 0); g.lineTo(-8, -10); g.lineTo(-3, 0); g.lineTo(-8, 10); g.closePath(); g.stroke(); g.fill();
    g.restore();
  }
}

// ---------------- el bucle ----------------
let ultimo = performance.now();
function cuadro(now) {
  requestAnimationFrame(cuadro);
  const dt = Math.min((now - ultimo) / 1000, 0.1);
  ultimo = now;
  botonesPad();
  if (S.pantalla === "menu" && Math.random() < 0.02) estadoPad();
  let pos = S.mapa?.spawn || [0, 0, 0], yaw = 0;
  if (S.pantalla === "vuelo" && S.piloto) {
    if (!S.pausa && !S.fin) {
      S.acc += dt;
      let k = 0;
      while (S.acc >= DT && k < 8) { paso(); S.acc -= DT; k++; if (S.fin) break; }
    }
    const P = S.piloto, a = S.pausa || S.fin ? 1 : Math.min(S.acc / DT, 1);
    pos = P.prev.pos.map((x, i) => x + (P.pos[i] - x) * a);
    aThree(P.prev.q, qPrev); aThree(P.q, qThree);
    qPrev.slerp(qThree, a);
    dron.position.copy(V(...pos));
    dron.quaternion.copy(qPrev);
    dron.visible = cfg.cam !== "fpv" && S.muerto <= 0;
    const F = S.fantasma, conF = F && (cfg.modo === "reloj" || cfg.modo === "carrera") && S.cuenta <= 0 && !S.fin;
    const iF = conF ? Math.floor((S.t - S.vueltaT0) / (2 * DT)) : -1;
    fantasma.visible = conF && iF < F.p.length;
    if (fantasma.visible) { const m = F.p[iF]; fantasma.position.copy(V(m[0], m[1], m[2])); aThree(m.slice(3), fantasma.quaternion); }
    yaw = P.s.yaw;
    const ia = S.espectar && S.ias.find((r) => r.muerto <= 0);
    if (ia) { pos = ia.pos.slice(); yaw = ia.s.yaw; dron.visible = false; }   // espectador: la cámara sigue a la IA (videos y tráiler)
    const spin = (8 + 40 * P.thr) * 2 * Math.PI * dt;
    for (const pr of dron.userData.props) { pr.rotation.y += spin * pr.userData.dir; pr.userData.disc.visible = P.thr > 0.05; pr.userData.blade.visible = P.thr < 0.3; }
    for (const r of S.ias) {
      r.mesh.visible = r.muerto <= 0;
      r.mesh.position.copy(V(...r.pos));
      r.mesh.rotation.set(r.s.roll, r.s.yaw, -r.s.pitch, "YZX");
      for (const pr of r.mesh.userData.props) { pr.rotation.y += (8 + 40 * r.s.throttle) * 2 * Math.PI * dt * pr.userData.dir; pr.userData.disc.visible = true; pr.userData.blade.visible = false; }
    }
    motor(P.thr, Math.hypot(...P.vel), !S.pausa && !S.fin && S.muerto <= 0);
    camara(dt, pos, qPrev, yaw);
    hud(pos, qPrev);
  } else {
    motor(0, 0, false);
    camara(dt, pos, null, 0);
    osd();
  }
  chispas.tick(dt);
  if (S.vista) {                                                // el sol sigue a la acción (las sombras se ven cerca)
    const f = V(...pos);
    S.vista.sol.position.copy(f).add(S.vista.solOff);
    S.vista.sol.target.position.copy(f);
  }
  if (calidad === "baja") renderer.render(scene, camera); else composer.render();
}

// ---------------- arranque ----------------
S.modelos = await listaModelos();
S.hangar = await dronesHangar();
if (cfg.dron !== "racer" && !S.hangar.some((h) => h.id === cfg.dron)) cfg.dron = "racer";
if (!S.modelos.includes(cfg.rival)) cfg.rival = S.modelos.includes("corredor") ? "corredor" : "base";
if (!S.modelos.includes(cfg.cazador)) cfg.cazador = S.modelos.includes("cazador") ? "cazador" : "base";
menu();
window.__fs = { S, cfg, MAPAS, empezar, menu, reiniciar, paso, keys };      // para las pruebas
requestAnimationFrame(cuadro);
