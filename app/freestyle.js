// =====================================================================
// FREESTYLE: volar por gusto. 3 mapas (freestyle_mapas.js), con el control (PS5/Xbox) o el teclado, en FPV.
//   Libre · Carrera contra la IA (rivales con un modelo entrenado: el nivel 16 · Carrera) · Contrarreloj ·
//   Persecución (drones con IA te persiguen: el nivel 18 · Persecución; la "liebre" eres tú).
// Cuatro modos, como en una radio (radio.js; los controles y la calibración: radio_ui.js):
//   Fácil   = la misma física que la IA (game/sim.js step: las palancas piden un ángulo; gas al centro = flotar).
//   Angle · Horizon · Acro = solo del freestyle (la IA nunca los ve): un cuerpo rígido (radio.js pasoRadio), motores que
//             tardan en responder y propwash. Sensación Real (radio): gas ABSOLUTO y armar con interruptor; sensación Juego
//             (mando y teclado, lo de fábrica): gas al centro = flotar, armado solo, rates de mando, Acro suave.
//             Angle pide un ángulo y se nivela; Acro pide una VELOCIDAD de giro (rates de Betaflight: flips y rolls);
//             Horizon es Angle al centro y Acro a fondo.
// Los rivales vuelan con game/sim.js (step, buildObs, sensorRays) y su red (Policy): exactamente lo que aprendieron.
// =====================================================================
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { Level, Policy, step as fisica, newState, buildObs, sensorRays, actionToThrottle, CONTROL_HZ, SUBSTEPS } from "../game/sim.js";
import { V, makeDrone } from "../game/scene.js";
import * as RA from "./radio.js";
import { abrirRadio, dibujarPalancas } from "./radio_ui.js";
import { t, cargarIdioma, num, datos } from "./i18n.js";
import * as PT from "./partida.js";
import { paramsFisica } from "./parts.js";
import { MAPAS, ORDEN, nivelDe, orientaciones, cruza, lineaCarrera } from "./freestyle_mapas.js";
import { construirMapa, Portales, fondoMinimapa } from "./freestyle_vista.js";
import { Intro, Repeticion, persecucion } from "./freestyle_camaras.js";

await cargarIdioma();
const $ = (id) => document.getElementById(id);
const clip = (x, a = -1, b = 1) => Math.min(Math.max(x, a), b);
const DT = 1 / CONTROL_HZ;

// ---------------- lo que se recuerda ----------------
const CLAVE = "dronmaker.freestyle";
const cfg = { dron: "racer", mapa: "fabrica", modo: "libre", acro: false, rival: "corredor", cazador: "cazador", nRivales: 1, vueltas: 2, cam: "fpv",
  mando: 2, tilt: 25, records: {},
  vuelo: null, rates: "freestyle", ratesPropias: null, gasCurva: { mid: 0.5, expo: 0 }, angulo: 55, bateria: 0, radios: {}, padId: null };
try { Object.assign(cfg, JSON.parse(localStorage.getItem(CLAVE) || "{}")); } catch { /* sin almacenamiento */ }
if (!RA.MODOS.includes(cfg.vuelo)) cfg.vuelo = cfg.acro ? "acro" : "facil";      // antes: Estable / Acro
const guardar = () => { try { localStorage.setItem(CLAVE, JSON.stringify(cfg)); } catch { /* sin almacenamiento */ } };
/** El control que usas: el elegido en 🎮 Radio, o el primero con palancas. */
function padElegido() {
  const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
  return pads.find((p) => p.id === cfg.padId && p.axes?.length >= 4) || pads.find((p) => p.axes?.length >= 4) || null;
}
const perfilDe = (gp) => (gp ? cfg.radios[gp.id] || RA.perfilPorDefecto(gp) : null);
/** La sensación del control que usas: Juego (mando, teclado) o Real (radio USB). Se guarda por control (radio.js). */
const sensacion = () => RA.sensacionDe(perfilDe(padElegido()), cfg);
function ponerSensacion(v) {
  const gp = padElegido();
  if (gp) cfg.radios[gp.id] = { ...perfilDe(gp), sensacion: v }; else cfg.sensacionTeclado = v;
  guardar();
}
/** Los rates que usas: un preset (el de mando en Juego, el de radio en Real) o los tuyos. */
const ratesActivos = () => RA.ratesDe(cfg, sensacion());
const readGamepad = padElegido;
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

// cuaterniones en ejes de la simulación (w, x, y, z): X adelante, Y izquierda, Z arriba (radio.js)
const { qEuler } = RA;
const aThree = (q, out) => out.set(q[1], q[3], -q[2], q[0]);     // los mismos ejes que V(): (x, z, -y)

/** Tu dron: Fácil (sim.js, como la IA) o Angle / Horizon / Acro (un cuerpo rígido con gas absoluto, solo aquí). */
class Piloto {
  constructor(modo, p = RACER) {
    this.modo = modo;
    this.facil = modo === "facil";
    // los modos de radio: tu dron con la respuesta de uno de carreras (el racer de la liga usa el de acro, más liviano)
    this.p = this.facil ? p : p === RACER ? ACRO : { ...p, attResp: 22, crashSpeed: Math.max(p.crashSpeed, 4.5) };
    this.cmd = [0, 0, 0, 0];
  }
  reset(pos, yaw) {
    this.s = newState(pos, yaw);
    this.q = qEuler(0, 0, yaw); this.w = [0, 0, 0];
    this.prev = { pos: pos.slice(), q: this.q.slice() };
    this.cmd = [0, 0, 0, 0]; this.thr = 0; this.tw = 0;
  }
  get pos() { return this.s.pos; } get vel() { return this.s.vel; }
  /** e: en Fácil [gas −1..1, roll, pitch, yaw]; en los de radio { gas 0..1, roll, pitch, yaw, armado, modo, fuerza }. */
  paso(e) {
    const s = this.s, p = this.p;
    this.prev = { pos: s.pos.slice(), q: this.q.slice() };
    let suelo = false, golpe = 0;
    if (this.facil) {
      const k = 1 - Math.exp(-DT / 0.06);                     // teclado: suaviza; el control ya es analógico
      for (let i = 0; i < 4; i++) this.cmd[i] += (e[i] - this.cmd[i]) * k;
      const a = this.cmd.slice();
      for (let i = 0; i < SUBSTEPS; i++) { const inf = fisica(s, a, DT / SUBSTEPS, null, p); if (inf.grounded) { suelo = true; golpe = Math.max(golpe, inf.groundCrash ? 99 : 0); } }
      this.q = qEuler(s.roll, s.pitch, s.yaw);
      this.thr = s.throttle;
    } else {
      // radio.js pasoRadio: Real = gas ABSOLUTO (la curva de la radio); Juego = el centro flota (mando y teclado)
      ({ suelo, golpe } = RA.pasoRadio(this, e, { dt: DT, sub: SUBSTEPS, rates: e.rates || ratesActivos(), gasCurva: cfg.gasCurva, angulo: cfg.angulo, juego: e.sens === "juego" }));
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
  S.vista = construirMapa(scene, M, calidad, renderer);
  S.dirs = orientaciones(M.gates, M.spawn, M.dirs);
  S.nivel = new Level(nivelDe(M));
  S.linea = lineaCarrera(M, S.nivel);
  S.portales = new Portales(scene, M.gates, S.dirs, M.ambiente.noche, S.linea, M.gates.map((_, i) => (M.tramos[i] ? t(M.tramos[i][1]) : null)));
  S.portales.verLinea = cfg.linea !== false;
  S.portales.pintar(-1);
  S.mini = fondoMinimapa(M, 190);
  bloom.strength = M.ambiente.noche ? 0.7 : 0.18;
  bloom.radius = M.ambiente.noche ? 0.55 : 0.4;
  bloom.threshold = M.ambiente.noche ? 0.72 : 0.9;
  renderer.toneMappingExposure = M.ambiente.exposicion ?? 1.05;
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
  fila(t("Modo de vuelo"), seg("s-vuelo", [["facil", t("Fácil")], ["angle", "Angle"], ["horizon", "Horizon"], ["acro", "Acro"]], cfg.vuelo, (v) => { cfg.vuelo = v; guardar(); menu(); }));
  if (cfg.vuelo !== "facil") fila(t("Sensación"), seg("s-sens", [["juego", t("🎮 Juego")], ["real", t("📻 Real (gas absoluto)")]], sensacion(), (v) => { ponerSensacion(v); menu(); }));
  if (cfg.vuelo !== "facil") fila(t("Rates"), seg("s-rates", [["principiante", t("Principiante")], ["freestyle", "Freestyle"], ["carreras", t("Carreras")], ["cinematico", t("Cinemático")]],
    cfg.ratesPropias ? null : cfg.rates, (v) => { cfg.rates = v; cfg.ratesPropias = null; guardar(); menu(); }));
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
  const rb = document.createElement("button"); rb.className = "btn ghost"; rb.textContent = t("🎮 Radio y controles: calibrar, rates, gas…");
  rb.onclick = () => abrirRadio({ $, cfg, guardar, padElegido, perfilDe, volver: menu, toast });
  m.appendChild(rb);
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
  if (EMBEBIDO) volver.onclick = (e) => { e.preventDefault(); parent.postMessage({ tipo: "freestyle-cerrar" }, location.origin); };
  const ayuda = document.createElement("p"); ayuda.className = "muted"; ayuda.style.cssText = "margin:0;font-size:12.5px;line-height:1.45";
  ayuda.textContent = {
    facil: t("Fácil: la palanca derecha inclina (suelta y se nivela), la izquierda es gas (centro = flotar) y giro. Teclado: WASD moverse, Espacio subir, Shift bajar, flechas girar."),
    ...(sensacion() === "juego" ? {
      angle: t("Angle: la palanca derecha inclina (suelta y se nivela) y la izquierda gira y sube o baja (centro = flotar). Ya va armado (L1/LB o E desarma). Teclado: WASD inclinar, flechas girar, Espacio/Shift subir y bajar."),
      horizon: t("Horizon: como Angle, pero con la palanca derecha a fondo da la vuelta entera (flips). Centro del gas = flotar. Ya va armado."),
      acro: t("Acro suave: la palanca derecha GIRA el dron y al soltarla se endereza despacio. Gas al centro = flotar; abajo del todo corta el gas para los flips. Ya va armado. Teclado: WASD gira, Espacio/Shift gas, flechas giro."),
    } : {
      angle: t("Angle: como una radio. Primero ARMA (interruptor, L1/LB o la tecla E, con el gas abajo). El gas no se queda flotando: tú lo sostienes. La palanca derecha inclina y al soltarla se nivela."),
      horizon: t("Horizon: se nivela solo cerca del centro y hace flips con la palanca a fondo. Arma con el gas abajo (interruptor, L1/LB o E)."),
      acro: t("Acro: como los pilotos de FPV. La palanca derecha GIRA el dron (suelta y se queda inclinado) y el gas es tuyo. Arma con el gas abajo (interruptor, L1/LB o E). Teclado: WASD gira, Espacio/Shift gas, flechas giro."),
    }),
  }[cfg.vuelo];
  m.appendChild(ayuda);
  ir.focus();
  estadoPad();
}
function estadoPad() {
  const el = $("pad"); if (!el) return;
  const gp = readGamepad();
  const nom = gp && gp.id.split("(")[0].trim().slice(0, 40);
  el.textContent = !gp ? t("🎮 Conecta un control (PS5, Xbox…) o tu radio por USB y mueve una palanca. También sirve el teclado.")
    : RA.esRadio(gp) ? (cfg.radios[gp.id]?.cal ? t("📻 Radio conectada: {n} (calibrada)", { n: nom }) : t("📻 Radio conectada: {n} · calíbrala en 🎮 Radio", { n: nom }))
    : t("🎮 Control conectado: {n}", { n: nom });
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
  S.piloto = new Piloto(cfg.vuelo, fisicaDe(cfg.dron));
  S.armEst = { armado: false, antes: true };                 // como Betaflight: si el interruptor ya estaba arriba, hay que bajarlo y subirlo
  S.armSw = sensacion() === "juego"; S.mando = null; S.gasTeclado = 0; S.kb = null;   // Juego: ya armado
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
  if (cfg.intro !== false) {                                  // la presentación de la pista (se salta con cualquier tecla)
    const p = S.piloto.pos;
    S.intro = new Intro(M, S.linea, S.nivel, { pos: [p[0], p[1], 0.3], yaw: M.yaw }, M.gates.map((_, i) => (M.tramos[i] ? t(M.tramos[i][1]) : null)), NOMBRES[M.id][0]);
  }
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
  if (cfg.vuelo !== "facil" && sensacion() === "juego") { S.armSw = true; S.kb = null; }   // Juego: reinicias ya armado
  S.ias.forEach((r, i) => {
    if (modo === "carrera") r.reset(salida(i), M.yaw);
    else r.reset(lejosDe(M.spawn, 22 + 6 * i, i), M.yaw);
    r.k = 0; r.tFin = null; r.mesh.visible = true;
  });
  S.intro = null; S.repe = null;
  Object.assign(S, { t: 0, acc: 0, cuenta: modo === "libre" ? 0 : 3.0, pausa: false, fin: false, k: 0, vueltaT0: 0, vueltas: [], vmax: 0, muerto: 0,
    vidas: 3, atrapado: 0, tFin: null, camNueva: true, bat: (cfg.bateria || 0) * 60 });
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
  $("h-teclas").textContent = cfg.vuelo === "facil"
    ? t("R reiniciar · T volver al último portal · C cámara · Esc pausa. Control: ○/B cámara, △/Y volver, Options pausa.")
    : t("E armar · R reiniciar · T volver al último portal · C cámara · Esc pausa. Control: L1/LB armar, ○/B cámara, △/Y volver, Options pausa.");
}

// ---------------- el vuelo, paso a paso (50 por segundo) ----------------
/**
 * Lo que mandan tus manos este paso (control/radio + teclado). Arma y desarma como Betaflight (radio.js armado).
 * Deja S.mando = { gas 0..1, roll, pitch, yaw, armado, modo, motivo } para el HUD (las palancas) y el OSD.
 */
const BAT_BAJA = 0.75;                                        // con la batería vacía el empuje cae (si pusiste el timer)
let botonArmarAntes = false;
function palancas() {
  const gp = padElegido(), perfil = perfilDe(gp), r = RA.leer(gp, perfil, { mando: cfg.mando });
  const k = (a, b) => (keys.has(a) ? 1 : 0) - (keys.has(b) ? 1 : 0);
  const kg = (keys.has("Space") || keys.has("ArrowUp") ? 1 : 0) - (keys.has("ShiftLeft") || keys.has("ShiftRight") || keys.has("ArrowDown") ? 1 : 0);
  const roll = clip((r?.roll || 0) + k("KeyD", "KeyA")), pitch = clip((r?.pitch || 0) + k("KeyW", "KeyS")), yaw = clip((r?.yaw || 0) + k("ArrowLeft", "ArrowRight"));
  if (cfg.vuelo === "facil") {                                // el de siempre: gas al centro = flotar
    const gas = clip((r ? r.gas * 2 - 1 : 0) + kg);
    S.mando = { gas: (gas + 1) / 2, roll, pitch, yaw, armado: true, modo: "facil", motivo: null };
    return [gas, roll, pitch, yaw];
  }
  const sens = sensacion(), rt = ratesActivos();
  if (sens === "juego") {
    // JUEGO (mando y teclado): el centro del gas flota, se arma solo (L1/LB o E desarma), el teclado sube en rampa
    const kb = (S.kb ||= { roll: 0, pitch: 0, yaw: 0, gas: 0 }), cap = cfg.vuelo === "acro" ? RA.JUEGO.teclado.max : 1;
    kb.roll = RA.rampa(kb.roll, k("KeyD", "KeyA") * cap, DT); kb.pitch = RA.rampa(kb.pitch, k("KeyW", "KeyS") * cap, DT);
    kb.yaw = RA.rampa(kb.yaw, k("ArrowLeft", "ArrowRight"), DT); kb.gas = RA.rampa(kb.gas, kg, DT);
    const gas = (clip((r ? r.gas * 2 - 1 : 0) + kb.gas) + 1) / 2;
    const btn = perfil?.armar?.tipo === "boton" && perfil.armar.alterna ? !!r?.botones?.[perfil.armar.i] : false;
    if (btn && !botonArmarAntes) S.armSw = !S.armSw;
    botonArmarAntes = btn;
    const armado = !!(r?.armar ?? S.armSw);
    if (armado && !S.mando?.armado) { aviso(t("ARMADO"), "#47f08a", 900); bip(1175, 0.08, 0.1); }
    const modo = r?.modo || cfg.vuelo;
    S.mando = { gas, roll: clip((r?.roll || 0) + kb.roll), pitch: clip((r?.pitch || 0) + kb.pitch), yaw: clip((r?.yaw || 0) + kb.yaw),
      armado, modo, motivo: armado ? null : "juego", sens, rates: rt, fuerza: cfg.bateria && S.bat <= 0 ? BAT_BAJA : 1 };
    return S.mando;
  }
  // REAL (radio): el gas del teclado se queda donde lo dejas (Espacio sube, Shift baja); el de la radio es el que marca
  S.gasTeclado = clip((S.gasTeclado || 0) + kg * DT * 0.9, 0, 1);
  if (!S.gasDe && perfil?.tipo === "radio") S.gasDe = "pad";   // una radio: su gas manda desde el principio
  if (kg) S.gasDe = "teclado";                               // manda el último que se movió
  else if (r && Math.abs(r.gas - (S.gasPadAntes ?? r.gas)) > 0.02) S.gasDe = "pad";
  if (r) S.gasPadAntes = r.gas;
  const gas = S.gasDe === "pad" && r ? r.gas : S.gasTeclado;
  // armar: el interruptor de la radio, o un botón que alterna (L1/LB en un mando) o la tecla E
  const btn = perfil?.armar?.tipo === "boton" && perfil.armar.alterna ? !!r?.botones?.[perfil.armar.i] : false;
  if (btn && !botonArmarAntes) S.armSw = !S.armSw;
  botonArmarAntes = btn;
  const pedido = r?.armar ?? S.armSw;
  const a = RA.armado(S.armEst, !!pedido, gas);
  if (a.armado && !S.mando?.armado) { aviso(t("ARMADO"), "#47f08a", 900); bip(1175, 0.08, 0.1); }
  const modo = (r?.modo && cfg.vuelo !== "facil") ? r.modo : cfg.vuelo;
  S.mando = { gas, roll, pitch, yaw, armado: a.armado, modo, motivo: a.motivo, sens, rates: rt, fuerza: cfg.bateria && S.bat <= 0 ? BAT_BAJA : 1 };
  return S.mando;
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
  const manos = palancas();                                   // también en la cuenta: ahí se arma
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
    const { golpe } = P.paso(manos);
    if (cfg.bateria && S.mando?.armado) {                    // el timer de la batería (como el de la radio)
      const antes = S.bat;
      S.bat -= DT * (0.6 + 0.8 * P.thr);
      if (antes > 30 && S.bat <= 30) { aviso(t("Batería: 30 s"), "#ffd23f", 1500); bip(660, 0.2, 0.12); }
      if (antes > 0 && S.bat <= 0) { aviso(t("¡BATERÍA BAJA!"), "#ff5040", 2000); vibrar(0.6, 400); }
    }
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
  el.innerHTML = `<h2></h2><table id="fin-tabla"></table>${S.nuevoRecord ? `<p class="muted" style="margin:0">⭐ ${t("¡Nuevo récord de vuelta en este mapa!")}</p>` : ""}<div class="acciones"><button class="btn main" id="f-otra"></button>${S.fantasma?.p?.length > 20 ? '<button class="btn ghost" id="f-repe"></button>' : ""}<button class="btn ghost" id="f-menu"></button></div>`;
  el.querySelector("h2").textContent = h;
  const tb = el.querySelector("table");
  for (const [a, b] of filas) { const tr = tb.insertRow(); tr.insertCell().textContent = a; tr.insertCell().textContent = b; }
  el.querySelector("#f-otra").textContent = t("Otra vez"); el.querySelector("#f-otra").onclick = () => reiniciar();
  el.querySelector("#f-menu").textContent = t("Menú"); el.querySelector("#f-menu").onclick = () => menu();
  const fr = el.querySelector("#f-repe");
  if (fr) { fr.textContent = t("▶ Repetición de tu mejor vuelta"); fr.onclick = () => repeticion(); }
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
  if (e.code === "KeyE" && !e.repeat) S.armSw = !S.armSw;     // armar / desarmar con el teclado
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
const camPos = { nueva: true }, camSt = {};
function camara(dt, pos, q, yaw) {
  if (S.pantalla === "menu") {
    const M = S.mapa, a = performance.now() / 1000 * 0.05 + 0.6, R = Math.min(M.bounds.xy * 0.62, 75);
    const c = M.gates.reduce((s, g) => [s[0] + g[0] / M.gates.length, s[1] + g[1] / M.gates.length], [0, 0]);
    if (camera.fov !== 55) { camera.fov = 55; camera.updateProjectionMatrix(); }
    camera.position.copy(V(c[0] + Math.cos(a) * R, c[1] + Math.sin(a) * R, R * 0.36 + Math.sin(a * 2.3) * 4));
    camera.lookAt(V(c[0], c[1], 6));
    return;
  }
  if (S.camaraTV) { S.camaraTV(camera, V(...pos), dt); return; }   // para videos: una cámara propia (S.camaraTV(camera, pos, dt))
  if (S.intro) { if (S.intro.camara(camera, dt)) return; S.intro = null; S.camNueva = true; }
  if (S.repe) { S.repe.camara(camera, dt); return; }
  const p = V(...pos);
  if (S.camNueva) { S.camNueva = false; camPos.nueva = true; }
  if (cfg.cam === "fpv") {
    if (camera.fov !== 110) { camera.fov = 110; camera.updateProjectionMatrix(); }
    FPV_Q.setFromEuler(new THREE.Euler((cfg.tilt * Math.PI) / 180, -Math.PI / 2, 0, "YXZ"));
    camera.position.copy(p).add(new THREE.Vector3(0.09, 0.04, 0).applyQuaternion(q));
    camera.quaternion.copy(q).multiply(FPV_Q);
  } else {
    // sigue hacia donde vas, se abre con la velocidad y no se mete en las paredes (freestyle_camaras.js)
    const quien = (S.espectar && S.ias.find((r) => r.muerto <= 0)) || S.piloto;
    persecucion(camera, camSt, pos, quien.vel, yaw, S.nivel, dt, cfg.cam === "lejos", camPos.nueva);
    camPos.nueva = false;
  }
}

// ---------------- HUD ----------------
function hud(pos, q3) {
  const P = S.piloto, M = S.mapa, n = M.gates.length, modo = cfg.modo;
  const v = Math.hypot(...P.vel);
  $("h-kmh").textContent = Math.round(v * 3.6);
  const md = S.mando || {}, bat = cfg.bateria ? ` · 🔋 ${fmtT(Math.max(0, S.bat))}` : "";
  const modoTxt = { facil: t("FÁCIL"), angle: "ANGLE", horizon: "HORIZON", acro: "ACRO" }[md.modo || cfg.vuelo];
  $("h-sub").innerHTML = `km/h · ${t("altura {h} m", { h: num(P.pos[2], 1) })}<br>${modoTxt}${cfg.vuelo !== "facil" ? ` · ${md.armado ? `<b style="color:#47f08a">${t("ARMADO")}</b>` : `<b style="color:#ff5040">${t("DESARMADO")}</b>`}` : ""}${bat} · ${t("máx. {v} km/h", { v: Math.round(S.vmax) })}`;
  $("h-gas").firstElementChild.style.width = `${Math.round(P.thr * 100)}%`;
  dibujarPalancas($("h-palancas"), md, cfg.mando);
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
  $("cuenta").classList.toggle("hidden", !(S.cuenta > 0) || !!S.intro);
  $("hud").classList.toggle("en-intro", !!S.intro);
  $("intro").classList.toggle("hidden", !S.intro);
  if (S.intro) { $("intro-t").textContent = S.intro.texto || ""; $("intro-sub").textContent = S.intro.t < S.intro.tAlto ? t("{n} portales · {m}", { n: M.gates.length, m: MODOS[modo][0] }) : ""; }
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
  const md = S.mando;
  if (cfg.vuelo !== "facil" && md && !md.armado && !S.fin) {     // el aviso de Betaflight: grande, al centro abajo
    g.textAlign = "center"; g.font = '700 30px "Chakra Petch", system-ui';
    g.lineWidth = 4; g.strokeStyle = "rgba(0,0,0,.7)"; g.fillStyle = "#ff5040";
    g.strokeText(t("DESARMADO"), cx, cy + H * 0.2); g.fillText(t("DESARMADO"), cx, cy + H * 0.2);
    g.font = '600 15px "Chakra Petch", system-ui'; g.fillStyle = "#fff";
    const ayuda = md.motivo === "gas" ? t("Baja el gas del todo para armar") : md.motivo === "juego" ? t("Pulsa L1/LB o la tecla E para armar") : t("Arma: interruptor, L1/LB o la tecla E");
    g.strokeText(ayuda, cx, cy + H * 0.2 + 26); g.fillText(ayuda, cx, cy + H * 0.2 + 26);
  }
  if (cfg.bateria && S.bat <= 0 && Math.floor(performance.now() / 400) % 2) {
    g.textAlign = "center"; g.font = '700 20px "Chakra Petch", system-ui'; g.fillStyle = "#ff5040";
    g.fillText(t("BATERÍA BAJA"), cx, cy - H * 0.22);
  }
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
  if (S.pantalla === "replay" && S.repe) {                      // la repetición de tu mejor vuelta
    S.repe.avanzar(dt);
    pos = S.repe.pos; yaw = Math.atan2(S.repe.vel[1], S.repe.vel[0]);
    dron.visible = true; dron.position.copy(V(...pos)); aThree(S.repe.q, dron.quaternion);
    for (const pr of dron.userData.props) { pr.rotation.y += 60 * dt * pr.userData.dir; pr.userData.disc.visible = true; pr.userData.blade.visible = false; }
    fantasma.visible = false; S.ias.forEach((r) => (r.mesh.visible = false));
    camara(dt, pos, null, yaw);
    $("repe-t").textContent = `${t("REPETICIÓN")} · ${fmtT(S.repe.t)} / ${fmtT(S.repe.dur)}`;
    if (S.repe.fin) salirRepeticion();
  } else if (S.pantalla === "vuelo" && S.piloto) {
    if (!S.pausa && !S.fin && !S.intro) {
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
  if (S.vista) vistaViva(dt, now);
  if (S.vista) {                                                // el sol sigue a la acción (las sombras se ven cerca)
    const f = V(...pos);
    S.vista.sol.position.copy(f).add(S.vista.solOff);
    S.vista.sol.target.position.copy(f);
  }
  if (calidad === "baja") renderer.render(scene, camera); else composer.render();
}

// ---------------- lo que se mueve en el mapa, la presentación, la repetición y la IA que entrena ----------------
const EMBEBIDO = window.parent !== window;                   // abierto adentro del juego (🎮 Volar mientras entrena)
let pantallaT = 0, padIntro = null;
/** Cada cuadro: el mapa se anima (humo, agua, público…), las luces de largada, la pantalla gigante y saltar la intro. */
function vistaViva(dt, now) {
  const V_ = S.vista;
  V_.actualizar(dt);
  S.portales?.latir(now / 1000);
  $("osd").style.visibility = S.intro || S.repe ? "hidden" : "";
  if (V_.largada) V_.largada(S.pantalla !== "vuelo" || S.intro ? null : S.cuenta > 0 ? Math.min(5, Math.max(0, Math.ceil((3 - S.cuenta) / 0.6))) : S.t < 1.5 && !S.fin ? "verde" : null);
  if (V_.pantalla && now - pantallaT > 500) {
    pantallaT = now;
    if (S.pantalla === "vuelo" && !S.intro && S.cuenta <= 0) {
      const n = S.mapa.gates.length, modo = cfg.modo;
      V_.pantalla(MODOS[modo][0].toUpperCase(), fmtT(modo === "persecucion" ? Math.max(0, 60 - S.t) : S.t),
        modo === "carrera" || modo === "reloj" ? t("Vuelta {v} de {n} · portal {k} de {m}", { v: Math.min(S.vueltas.length + 1, cfg.vueltas), n: cfg.vueltas, k: (S.k % n) + 1, m: n }) : `${Math.round(Math.hypot(...S.piloto.vel) * 3.6)} km/h`);
    } else V_.pantalla("NEURAL DRONE", "LEAGUE", S.intro ? NOMBRES[S.mapa.id][0] : "");
  }
  if (S.intro) {                                               // un botón del control salta la presentación
    const gp = padElegido(), b = gp ? gp.buttons.map((x) => x.pressed) : [];
    if (padIntro && b.some((x, i) => x && !padIntro[i])) S.intro.saltar();
    padIntro = b;
  } else padIntro = null;
}
window.addEventListener("keydown", (e) => {                    // antes que las demás teclas: saltar la intro / salir de la repetición
  if (S.pantalla === "vuelo" && S.intro && !e.repeat && !["ShiftLeft", "ShiftRight"].includes(e.code)) { S.intro.saltar(); e.stopPropagation(); e.preventDefault(); return; }
  if (S.pantalla === "replay" && !e.repeat) { salirRepeticion(); e.stopPropagation(); e.preventDefault(); return; }
  if (S.pantalla === "vuelo" && e.code === "KeyL" && !e.repeat) {
    cfg.linea = cfg.linea === false; guardar();
    S.portales.verLinea = cfg.linea; S.portales.pintarLinea();
    toast(cfg.linea ? t("Línea de carrera: sí") : t("Línea de carrera: no"), 1100);
  }
}, true);
function repeticion() {
  if (!S.fantasma?.p?.length) return;
  S.repe = new Repeticion(S.mapa, S.fantasma, S.nivel, S.dirs);
  S.pantalla = "replay";
  $("fin").classList.add("hidden"); $("hud").classList.add("hidden"); $("repe").classList.remove("hidden");
  S.portales.pintar(-1);
}
function salirRepeticion() {
  if (!S.repe) return;
  S.repe = null; S.pantalla = "vuelo"; S.camNueva = true;
  $("repe").classList.add("hidden"); $("hud").classList.remove("hidden"); $("fin").classList.remove("hidden");
  dron.visible = cfg.cam !== "fpv";
}
/** La IA que entrena (en Blender o en segundo plano) mientras vuelas: el mismo estado que lee el juego (GET /api/lab). */
async function verIA() {
  const el = $("ia-badge");
  try {
    const s = await (await fetch("/api/lab", { cache: "no-store" })).json();
    const tr = s.entrenador?.activo ? s.entrenador : (s.fondo || []).find((f) => f.activo);
    if (!tr) { el.classList.add("hidden"); return; }
    el.classList.remove("hidden");
    const exito = typeof tr.succ === "number" ? Math.round(tr.succ * 100) : null;
    el.innerHTML = `<b></b><span></span><i><u style="width:${exito ?? 0}%"></u></i>`;
    el.querySelector("b").textContent = t("🧠 Tu IA «{m}» sigue entrenando", { m: tr.modelo || "base" });
    el.querySelector("span").textContent = (tr.pausado || tr.params?.paused) ? t("en pausa") : exito != null ? t("generación {g} · logra {p} %", { g: tr.gen ?? "–", p: exito }) : t("generación {g}", { g: tr.gen ?? "–" });
  } catch { el.classList.add("hidden"); }
}
verIA(); setInterval(verIA, 3000);
document.body.classList.toggle("embebido", EMBEBIDO);
$("intro-saltar").textContent = t("Cualquier tecla o botón para saltar");
$("repe-salir").textContent = t("Cualquier tecla para salir");

// ---------------- arranque ----------------
S.modelos = await listaModelos();
S.hangar = await dronesHangar();
if (cfg.dron !== "racer" && !S.hangar.some((h) => h.id === cfg.dron)) cfg.dron = "racer";
if (!S.modelos.includes(cfg.rival)) cfg.rival = S.modelos.includes("corredor") ? "corredor" : "base";
if (!S.modelos.includes(cfg.cazador)) cfg.cazador = S.modelos.includes("cazador") ? "cazador" : "base";
menu();
window.__fs = { S, cfg, MAPAS, empezar, menu, reiniciar, paso, keys, renderer, composer, scene, camera, repeticion };      // para las pruebas
requestAnimationFrame(cuadro);
