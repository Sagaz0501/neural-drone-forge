// =====================================================================
// SIMULADOR del dron en JavaScript: la MISMA física, sensores y red que en Python.
//
//   drone_rl/physics.py  -> step(), Wind
//   drone_rl/level.py    -> Level (cajas, esferas, cilindros): collides(), raycast()
//   drone_rl/sensing.py  -> sensorRays(), buildObs()   (sensores en cono de 3 rayos)
//   drone_rl/controller  -> pdAct()                    (aterrizaje automático)
//   drone_rl/runtime.py  -> Policy, Flight
//   drone_rl/birds.py    -> Flock                      (caza: pájaros que vuelan solos y huyen)
//
// No usa nada del navegador: también corre en node (game/test_sim.mjs lo compara con Python).
// Unidades SI. Eje X = frente del dron, Y = izquierda, Z = arriba (igual que en Python).
// La física del dron va en `P` (el dron de siempre); para otro dron (armado en el juego) se pasa
// `p` con la misma forma (app/parts.js -> paramsFisica) a step/buildObs/pdAct/Flight.
// =====================================================================

export const P = {
  mass: 0.6, g: 9.81, twr: 2.5, drag: 0.03, maxAngle: 35 * Math.PI / 180, yawRate: Math.PI,
  attResp: 8.0, crashSpeed: 4.0, radius: 0.15,
};
P.hover = 1 / P.twr;

export const RAY_LEN = 5.0;
export const OBS_SCALE = 10.0;
export const SPREAD_DEG = 15.0;
export const CONTROL_HZ = 50;
export const SUBSTEPS = 2;
export const GOAL_RADIUS = 0.5;
export const GOAL_VEL_SCALE = 5.0;

const clip = (x, a, b) => Math.min(Math.max(x, a), b);
const norm3 = (v) => Math.hypot(v[0], v[1], v[2]);

// ---------------- números al azar con semilla (mundos y viento repetibles) ----------------
export function makeRng(seed) {
  let a = seed >>> 0;
  const rnd = () => {                                     // mulberry32
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rnd.uniform = (lo, hi) => lo + (hi - lo) * rnd();
  rnd.normal = () => {                                    // Box-Muller
    const u = Math.max(rnd(), 1e-12), v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  rnd.int = (lo, hiIncl) => lo + Math.floor(rnd() * (hiIncl - lo + 1));
  return rnd;
}

// ---------------- física (physics.py) ----------------
export function actionToThrottle(a0, p = P) {
  const h = p.hover;
  return a0 >= 0 ? h + a0 * (1 - h) : h * (1 + a0);
}
export function throttleToAction(thr, p = P) {
  const h = p.hover;
  return thr >= h ? (thr - h) / (1 - h) : thr / h - 1;
}
export function yawFrame(v, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return [c * v[0] + s * v[1], -s * v[0] + c * v[1], v[2]];
}

export function newState(pos = [0, 0, 0], yaw = 0) {
  return { pos: pos.slice(), vel: [0, 0, 0], roll: 0, pitch: 0, yaw, throttle: 0 };
}

/** Avanza dt segundos. Devuelve {groundCrash, grounded}. Modifica s. p = la física del dron. */
export function step(s, action, dt, wind = null, p = P) {
  const a = action.map((x) => clip(x, -1, 1));
  s.throttle = actionToThrottle(a[0], p);
  let tr = a[1] * p.maxAngle, tp = a[2] * p.maxAngle;
  const grounded = s.pos[2] <= 1e-4;
  if (grounded && s.throttle < p.hover * 0.9) { tr = 0; tp = 0; }
  const k = Math.min(1, p.attResp * dt);                // el ángulo real persigue al pedido
  s.roll += (tr - s.roll) * k;
  s.pitch += (tp - s.pitch) * k;
  if (!(grounded && s.throttle < 0.05)) s.yaw += a[3] * p.yawRate * dt;
  const m = 2 * Math.PI;
  s.yaw = ((((s.yaw + Math.PI) % m) + m) % m) - Math.PI;

  const thrust = s.throttle * p.twr * p.mass * p.g;
  const cr = Math.cos(s.roll), sr = Math.sin(s.roll), cp = Math.cos(s.pitch), sp = Math.sin(s.pitch);
  const cy = Math.cos(s.yaw), sy = Math.sin(s.yaw);
  const bz = [cy * sp * cr + sy * sr, sy * sp * cr - cy * sr, cp * cr];   // eje Z del dron (R = Rz Ry Rx)
  const f = [bz[0] * thrust, bz[1] * thrust, bz[2] * thrust - p.mass * p.g];
  const va = (wind === null || grounded) ? s.vel : [s.vel[0] - wind[0], s.vel[1] - wind[1], s.vel[2] - wind[2]];
  const sp_ = norm3(va);
  for (let i = 0; i < 3; i++) f[i] -= p.drag * sp_ * va[i];
  for (let i = 0; i < 3; i++) {
    s.vel[i] += f[i] / p.mass * dt;
    s.pos[i] += s.vel[i] * dt;
  }
  const info = { groundCrash: false, grounded: false };
  if (s.pos[2] < 0) {
    const impact = -s.vel[2];
    s.pos[2] = 0;
    if (impact > p.crashSpeed) {
      info.groundCrash = true;
      s.vel = [0, 0, 0];
    } else {
      s.vel[2] = 0;
      s.vel[0] *= 0.85;
      s.vel[1] *= 0.85;
    }
    info.grounded = true;
  }
  return info;
}

/** Viento: dirección y fuerza base por vuelo + ráfagas (proceso de Ornstein-Uhlenbeck). */
export class Wind {
  constructor(maxSpeed = 0, tau = 1.5) {
    this.maxSpeed = maxSpeed; this.tau = tau;
    this.base = [0, 0, 0]; this.gust = [0, 0, 0];
  }
  reset(rng) {
    this.gust = [0, 0, 0];
    if (this.maxSpeed <= 0) { this.base = [0, 0, 0]; return this.base; }
    const a = rng.uniform(-Math.PI, Math.PI), v = rng.uniform(0, this.maxSpeed);
    this.base = [Math.cos(a) * v, Math.sin(a) * v, 0];
    return this.base;
  }
  step(dt, rng) {
    if (this.maxSpeed > 0) {
      const k = dt / this.tau;
      const sigma = 0.35 * norm3(this.base) + 0.15 * this.maxSpeed;
      const sc = [1, 1, 0.3];
      for (let i = 0; i < 3; i++) this.gust[i] += -this.gust[i] * k + sigma * Math.sqrt(2 * k) * rng.normal() * sc[i];
    }
    return [this.base[0] + this.gust[0], this.base[1] + this.gust[1], this.base[2] + this.gust[2]];
  }
}

// ---------------- nivel: obstáculos, colisiones y "sensores" (level.py) ----------------
export class Level {
  /** d = {spawn, goals, boxes:[{min,max}], spheres:[{center,radius}], cylinders:[{center:[x,y],radius,z:[z0,z1]}], bounds} */
  constructor(d = {}) {
    this.spawn = (d.spawn || [0, 0, 0]).slice();
    this.goals = (d.goals || []).map((g) => g.slice());
    this.boxes = (d.boxes || []).map((b) => ({ min: b.min.slice(), max: b.max.slice() }));
    this.spheres = (d.spheres || []).map((s) => ({ c: s.center.slice(), r: s.radius }));
    this.cyls = (d.cylinders || []).map((c) => ({ x: c.center[0], y: c.center[1], r: c.radius, z0: c.z[0], z1: c.z[1] }));
    const b = d.bounds || {};
    this.boundsXY = b.xy ?? 30;
    this.boundsZ = b.z ?? 15;
  }

  collides(p, radius) {
    for (const b of this.boxes) {
      let d2 = 0;
      for (let i = 0; i < 3; i++) {
        const q = clip(p[i], b.min[i], b.max[i]) - p[i];
        d2 += q * q;
      }
      if (Math.sqrt(d2) < radius) return true;
    }
    for (const s of this.spheres) {
      if (Math.hypot(s.c[0] - p[0], s.c[1] - p[1], s.c[2] - p[2]) < s.r + radius) return true;
    }
    for (const c of this.cyls) {
      const h = Math.max(Math.hypot(c.x - p[0], c.y - p[1]) - c.r, 0);
      const v = Math.max(c.z0 - p[2], p[2] - c.z1, 0);
      if (h * h + v * v < radius * radius) return true;
    }
    return false;
  }

  outOfBounds(p) {
    return Math.abs(p[0]) > this.boundsXY || Math.abs(p[1]) > this.boundsXY || p[2] > this.boundsZ;
  }

  /** Distancia al primer obstáculo (o al piso) en cada dirección, hasta maxDist. */
  raycast(o, dirs, maxDist) {
    const n = dirs.length;
    const out = new Array(n).fill(maxDist);
    // solo los obstáculos a menos de maxDist (un bosque tiene cientos)
    const boxes = this.boxes.filter((b) => {
      let d2 = 0;
      for (let i = 0; i < 3; i++) { const q = clip(o[i], b.min[i], b.max[i]) - o[i]; d2 += q * q; }
      return Math.sqrt(d2) <= maxDist;
    });
    const sph = this.spheres.filter((s) => Math.hypot(s.c[0] - o[0], s.c[1] - o[1], s.c[2] - o[2]) - s.r <= maxDist);
    const cyl = this.cyls.filter((c) => {
      const hz = Math.max(c.z0 - o[2], o[2] - c.z1, 0);
      const hxy = Math.max(Math.hypot(c.x - o[0], c.y - o[1]) - c.r, 0);
      return hxy * hxy + hz * hz <= maxDist * maxDist;
    });
    for (let k = 0; k < n; k++) {
      const dir = dirs[k];
      const d = dir.map((x) => (Math.abs(x) < 1e-9 ? 1e-9 : x));
      let best = maxDist;
      if (dir[2] < -1e-6) {                                       // piso z = 0
        const t = -o[2] / d[2];
        if (t >= 0) best = Math.min(best, t);
      }
      for (const b of boxes) {                                    // cajas: método de "slabs"
        let tn = -Infinity, tf = Infinity;
        for (let i = 0; i < 3; i++) {
          const t1 = (b.min[i] - o[i]) / d[i], t2 = (b.max[i] - o[i]) / d[i];
          tn = Math.max(tn, Math.min(t1, t2));
          tf = Math.min(tf, Math.max(t1, t2));
        }
        if (tf >= Math.max(tn, 0)) best = Math.min(best, tn >= 0 ? tn : 0);
      }
      for (const s of sph) {                                      // esferas
        const oc = [o[0] - s.c[0], o[1] - s.c[1], o[2] - s.c[2]];
        const b = dir[0] * oc[0] + dir[1] * oc[1] + dir[2] * oc[2];
        const cc = oc[0] * oc[0] + oc[1] * oc[1] + oc[2] * oc[2] - s.r * s.r;
        const disc = b * b - cc;
        if (disc < 0) continue;
        const sq = Math.sqrt(disc);
        let t = -b - sq;
        if (t < 0) t = -b + sq;
        if (t >= 0) best = Math.min(best, t);
      }
      for (const c of cyl) {                                      // cilindros verticales (troncos)
        const ocx = o[0] - c.x, ocy = o[1] - c.y;
        const dx = dir[0], dy = dir[1];
        const a = dx * dx + dy * dy;
        const b = dx * ocx + dy * ocy;
        const cc = ocx * ocx + ocy * ocy - c.r * c.r;
        const flat = a < 1e-12;
        const as = flat ? 1 : a;
        const disc = b * b - as * cc;
        const sq = Math.sqrt(Math.max(disc, 0));
        const inside = cc <= 0;
        const tIn = flat ? (inside ? -Infinity : Infinity) : (-b - sq) / as;
        const tOut = flat ? (inside ? Infinity : -Infinity) : (-b + sq) / as;
        if (!flat && disc < 0) continue;
        const tz1 = (c.z0 - o[2]) / d[2], tz2 = (c.z1 - o[2]) / d[2];
        const tn = Math.max(tIn, Math.min(tz1, tz2));
        const tf = Math.min(tOut, Math.max(tz1, tz2));
        if (tf >= Math.max(tn, 0)) best = Math.min(best, Math.max(tn, 0));
      }
      out[k] = clip(best, 0, maxDist);
    }
    return out;
  }
}

// ---------------- sensores y observación (sensing.py) ----------------
export const RAY_DIRS_LOCAL = [];
for (let i = 0; i < 8; i++) {
  const a = (i * 45 * Math.PI) / 180;
  RAY_DIRS_LOCAL.push([Math.cos(a), Math.sin(a), 0]);
}
RAY_DIRS_LOCAL.push([0, 0, 1], [0, 0, -1]);
const SUB = SPREAD_DEG <= 0 ? [0] : [-SPREAD_DEG, 0, SPREAD_DEG];
const SUB_DIRS = [];
for (let i = 0; i < 8; i++) {
  for (const s of SUB) {
    const a = ((i * 45 + s) * Math.PI) / 180;
    SUB_DIRS.push([Math.cos(a), Math.sin(a), 0]);
  }
}
SUB_DIRS.push([0, 0, 1], [0, 0, -1]);

const rotZ = (v, yaw) => {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return [c * v[0] - s * v[1], s * v[0] + c * v[1], v[2]];
};
export const rayDirsWorld = (yaw) => RAY_DIRS_LOCAL.map((v) => rotZ(v, yaw));

/** Lo que ve cada uno de los 10 sensores (m). Los 8 horizontales son conos de 3 rayos. */
export function sensorRays(s, level) {
  const d = level.raycast(s.pos, SUB_DIRS.map((v) => rotZ(v, s.yaw)), RAY_LEN);
  const ns = SUB.length;
  const out = [];
  for (let i = 0; i < 8; i++) {
    let m = Infinity;
    for (let j = 0; j < ns; j++) m = Math.min(m, d[i * ns + j]);
    out.push(m);
  }
  out.push(d[8 * ns], d[8 * ns + 1]);
  return out;
}

// Grabar: los tipos de toma (entradas 30-33) y la cámara del dron (sensing.py)
export const TOMAS = ["fija", "revelar", "seguir", "orbita"];
export const CAM = { hfov: (80 * Math.PI) / 180, vfov: (50 * Math.PI) / 180, tilt: (15 * Math.PI) / 180 };
export const N_OBS = 38;

/** Entradas 34-37: qué dron maneja. */
export const physFeatures = (p) => [p.twr / 5, p.mass, p.drag * 20, p.attResp / 10];

/** Las 38 entradas de la red (mismo orden y escala que el entrenamiento, sensing.build_obs).
 *  24-26 cómo se mueve la meta · 27-29 el sujeto a grabar (sin sujeto: la meta) · 30-33 la toma · 34-37 el dron. */
export function buildObs(s, goal, rays, prevAction, goalVel = null, p = P, subject = null, toma = null) {
  const rel = yawFrame([goal[0] - s.pos[0], goal[1] - s.pos[1], goal[2] - s.pos[2]], s.yaw);
  const dist = norm3(rel);
  const vh = yawFrame(s.vel, s.yaw);
  const subj = subject ? yawFrame([subject[0] - s.pos[0], subject[1] - s.pos[1], subject[2] - s.pos[2]], s.yaw) : rel;
  const obs = [
    ...rel.map((x) => clip(x / OBS_SCALE, -2, 2)),
    Math.min(dist / OBS_SCALE, 2),
    ...vh.map((x) => clip(x / OBS_SCALE, -2, 2)),
    s.roll / p.maxAngle, s.pitch / p.maxAngle,
    s.pos[2] / OBS_SCALE,
    ...prevAction,
    ...rays.map((r) => r / RAY_LEN),
    ...(goalVel ? yawFrame(goalVel, s.yaw).map((x) => clip(x / GOAL_VEL_SCALE, -2, 2)) : [0, 0, 0]),
    ...subj.map((x) => clip(x / OBS_SCALE, -2, 2)),
    ...TOMAS.map((t) => (t === toma ? 1 : 0)),
    ...physFeatures(p),
  ];
  return obs.map(Math.fround);                            // float32, como en Python
}

// Qué es una toma BUENA (sensing.py: FRAME_H, FRAME_V, TRACK_R, FLOW_V, SHAKE_REF, PAN_REF)
export const FILM = { frameH: (20 * Math.PI) / 180, frameV: (15 * Math.PI) / 180, trackR: 1.2, flowV: 1.0, shakeRef: 0.8, panRef: 6.0 };

/**
 * Qué tan buena es la imagen ahora (0-1) = encuadre x seguimiento x ritmo x estable (sensing.film_quality).
 * camPos/camVel = el punto de cámara de la toma y su velocidad · angRate = giro de roll/pitch (rad/s)
 * yawAcc = cambio del giro (rad/s²) · gimbal: la cámara apunta sola al sujeto y quita sacudidas.
 */
export function filmQuality(s, subject, camPos, camVel, angRate, yawAcc = 0, gimbal = false) {
  const d = [subject[0] - s.pos[0], subject[1] - s.pos[1], subject[2] - s.pos[2]];
  const dh = Math.hypot(d[0], d[1]);
  const b = Math.atan2(d[1], d[0]);
  const eH = Math.atan2(Math.sin(b - s.yaw), Math.cos(b - s.yaw));
  const elev = Math.atan2(d[2], dh);
  const cam = gimbal ? elev : -CAM.tilt - s.pitch;
  const eV = elev - cam;
  const framing = Math.max(0, 1 - (eH / FILM.frameH) ** 2) * Math.max(0, 1 - (eV / FILM.frameV) ** 2);
  const track = Math.exp(-((norm3([camPos[0] - s.pos[0], camPos[1] - s.pos[1], camPos[2] - s.pos[2]]) / FILM.trackR) ** 2));
  const flow = Math.exp(-((norm3([s.vel[0] - camVel[0], s.vel[1] - camVel[1], s.vel[2] - camVel[2]]) / FILM.flowV) ** 2));
  const shake = angRate * (gimbal ? 0.3 : 1.0), pan = Math.abs(yawAcc) * (gimbal ? 0.5 : 1.0);
  const steady = Math.exp(-((shake / FILM.shakeRef) ** 2)) * Math.exp(-((pan / FILM.panRef) ** 2));
  return { framing, track, flow, steady, q: framing * track * flow * steady, dh, eH, eV };
}

// ---------------- tomas de video (tomas.py): la ruta que sigue la cámara ----------------
export const TOMA = { startR: 1.5, startV: 2.0 };
const ease = (u) => u * u * (3 - 2 * u), dease = (u) => 6 * u * (1 - u);

/** Una toma: tipo ("fija", "orbita", "revelar"), sujeto [x,y,z], duración y los números de su ruta. */
export class Toma {
  constructor(tipo, subject, dur, p) { this.tipo = tipo; this.subject = subject.slice(); this.dur = dur; this.p = { ...p }; this.reset(); }
  static fromDict(d) { const { tipo, subject, dur, ...p } = d; return new Toma(tipo, subject, dur, p); }
  toDict() { return { tipo: this.tipo, subject: this.subject.slice(), dur: this.dur, ...this.p }; }
  reset() { this.t = 0; this.phase = "ir"; return this; }
  /** [punto, velocidad] en la fracción u (0-1) de la ruta. */
  at(u) {
    u = clip(u, 0, 1);
    const s = ease(u), ds = dease(u) / this.dur, p = this.p, sx = this.subject[0], sy = this.subject[1];
    if (this.tipo === "fija") return [[p.x, p.y, p.z], [0, 0, 0]];
    if (this.tipo === "orbita") {
      const a = p.a0 + p.sweep * s, w = p.sweep * ds;
      return [[sx + p.r * Math.cos(a), sy + p.r * Math.sin(a), p.z], [-p.r * Math.sin(a) * w, p.r * Math.cos(a) * w, 0]];
    }
    if (this.tipo === "revelar") {
      const d = p.d0 + (p.d1 - p.d0) * s, z = p.z0 + (p.z1 - p.z0) * s, c = Math.cos(p.az), si = Math.sin(p.az);
      const vd = (p.d1 - p.d0) * ds, vz = (p.z1 - p.z0) * ds;
      return [[sx + d * c, sy + d * si, z], [vd * c, vd * si, vz]];
    }
    throw new Error("toma desconocida: " + this.tipo);
  }
  start() { return this.at(0)[0]; }
  get progress() { return Math.min(this.t / this.dur, 1); }
  point() { return this.at(this.progress)[0]; }
  vel() { return this.phase === "grabando" ? this.at(this.progress)[1] : [0, 0, 0]; }
  step(dt, pos, vel) {
    if (this.phase === "ir") {
      const st = this.start();
      if (norm3([pos[0] - st[0], pos[1] - st[1], pos[2] - st[2]]) < TOMA.startR && norm3(vel) < TOMA.startV) this.phase = "grabando";
    } else if (this.phase === "grabando") {
      this.t += dt;
      if (this.t >= this.dur - 1e-9) { this.t = this.dur; this.phase = "lista"; }
    }
  }
  path(n = 32) { return Array.from({ length: n }, (_, i) => this.at(i / (n - 1))[0]); }
}

// ---------------- la red neuronal (runtime.NumpyPolicy) ----------------
export class Policy {
  /** json = {meta, layers: [{in, out, W: [out*in], b: [out]}]} (scripts/export_policy.py --web) */
  constructor(json) {
    this.meta = json.meta || {};
    this.layers = json.layers.map((L) => ({ nin: L.in, nout: L.out, W: Float32Array.from(L.W), b: Float32Array.from(L.b) }));
    this.hidden = [];                                     // activaciones (para dibujar el cerebro)
  }
  act(obs) {
    let h = obs.length > this.layers[0].nin ? obs.slice(0, this.layers[0].nin) : obs;   // modelo viejo: 24 o 27 entradas
    this.hidden = [];
    this.layers.forEach((L, li) => {
      const out = new Float32Array(L.nout);
      for (let j = 0; j < L.nout; j++) {
        let acc = L.b[j];
        const row = j * L.nin;
        for (let i = 0; i < L.nin; i++) acc += L.W[row + i] * h[i];
        out[j] = li < this.layers.length - 1 ? Math.tanh(acc) : clip(acc, -1, 1);
      }
      if (li < this.layers.length - 1) this.hidden.push(out);
      h = out;
    });
    return Array.from(h);                                 // gas, roll, pitch, yaw
  }
}

// ---------------- piloto PD (controller.py): solo para el aterrizaje ----------------
export function pdAct(s, goal, vMax = 1.5, kp = 1.2, kv = 2.0, p = P) {
  let vd = [kp * (goal[0] - s.pos[0]), kp * (goal[1] - s.pos[1]), kp * (goal[2] - s.pos[2])];
  const n = norm3(vd);
  if (n > vMax) vd = vd.map((x) => (x * vMax) / n);
  const acc = [kv * (vd[0] - s.vel[0]), kv * (vd[1] - s.vel[1]), kv * (vd[2] - s.vel[2])];
  const ah = yawFrame(acc, s.yaw);
  const pitch = Math.atan2(ah[0], p.g);
  const roll = -Math.atan2(ah[1], p.g);
  const thr = (p.hover * (1 + acc[2] / p.g)) / Math.max(Math.cos(roll) * Math.cos(pitch), 0.5);
  return [throttleToAction(clip(thr, 0, 1), p), roll / p.maxAngle, pitch / p.maxAngle, 0].map((x) => clip(x, -1, 1));
}

// ---------------- un vuelo (runtime.Flight) ----------------
/**
 * phase: "ruta" (la red vuela) -> "aterrizaje" (PD baja a la plataforma) -> "aterrizado"   o   "choque".
 * pilot: "ia" (la red) o una función () => [gas, roll, pitch, yaw] (teclado).
 * params: la física del dron (P por defecto). Grabar: subject, toma y film = true (la meta es el punto de
 * cámara y no se "pasa": el dron se queda grabando hasta que el juego cambie la fase).
 */
export class Flight {
  /** flock: caza (Flock ya con start()). noise: (n) => n x 3 normales (las pruebas lo fijan; si no, al azar). */
  constructor(level, policy, { landOn = null, wind = 0, seed = 1, pilot = "ia", flock = null, noise = null,
    params = P, subject = null, toma = null, film = false, shot = null } = {}) {
    this.level = level; this.policy = policy; this.landOn = landOn; this.pilot = pilot;
    this.p = params; this.subject = subject; this.shot = shot;
    this.toma = shot ? shot.tipo : toma; this.film = film || !!shot;
    this.dt = 1 / CONTROL_HZ;
    this.wind = new Wind(wind);
    this.rng = makeRng(seed);
    this.flock = flock;
    const brng = makeRng(seed + 1);
    this.noise = noise || ((n) => Array.from({ length: n }, () => [brng.normal(), brng.normal(), brng.normal()]));
    this.target = null;
  }
  reset(pos = null, yaw = null) {
    const start = pos || this.level.spawn;
    this.goalIdx = 0;
    if (this.shot) this.shot.reset();
    if (this.flock) this.target = this.flock.pick(start, null);
    const g = this.flock ? this.goal() : this.level.goals[0] || [start[0] + 1, start[1], 1];
    this.state = newState(start, yaw ?? Math.atan2(g[1] - start[1], g[0] - start[0]));
    this.goalIdx = 0; this.prevAction = [0, 0, 0, 0]; this.action = [0, 0, 0, 0];
    this.t = 0; this.phase = "ruta"; this.reason = null; this.landLow = false;
    this.caught = null;
    this.rays = sensorRays(this.state, this.level);
    this.windNow = this.wind.reset(this.rng);
    this.obs = null;
    return this;
  }
  goal() {
    if (this.shot) return this.shot.point();
    if (this.flock) return this.flock.pos[this.target];
    return this.level.goals[Math.min(this.goalIdx, this.level.goals.length - 1)];
  }
  goalVel() { return this.shot ? this.shot.vel() : this.flock ? this.flock.estVel(this.target) : null; }
  nGoals() { return this.flock ? this.flock.n : this.level.goals.length; }
  step() {
    if (this.phase !== "ruta" && this.phase !== "aterrizaje") return;
    const s = this.state;
    let a;
    if (this.phase === "ruta") {
      if (this.pilot === "ia") {
        this.obs = buildObs(s, this.goal(), this.rays, this.prevAction, this.goalVel(), this.p, this.subject, this.toma);
        a = this.policy.act(this.obs);                  // <- la red neuronal decide
      } else {
        a = this.pilot(s);
      }
    } else {
      const pad = this.landOn;
      const above = [pad[0], pad[1], pad[2] + 0.6];
      if (!this.landLow && norm3([s.pos[0] - above[0], s.pos[1] - above[1], s.pos[2] - above[2]]) < 0.25 && norm3(s.vel) < 0.4) this.landLow = true;
      a = pdAct(s, this.landLow ? [pad[0], pad[1], pad[2] - 0.4] : above, 1.5, 1.2, 2.0, this.p);
    }
    let groundCrash = false, grounded = false;
    this.windNow = this.wind.step(this.dt, this.rng);
    for (let i = 0; i < SUBSTEPS; i++) {
      const inf = step(s, a, this.dt / SUBSTEPS, this.windNow, this.p);
      groundCrash ||= inf.groundCrash;
      grounded ||= inf.grounded;
    }
    this.prevAction = a; this.action = a;
    this.t += this.dt;
    this.rays = sensorRays(s, this.level);
    const L = this.level, fl = this.flock;
    if (this.shot && this.phase === "ruta") this.shot.step(this.dt, s.pos, s.vel);   // la toma avanza
    if (fl && this.phase === "ruta") {                    // los pájaros vuelan; la presa puede cambiar
      fl.step(this.dt, this.noise(fl.n), s.pos);
      this.target = fl.pick(s.pos, this.target);
    }
    const nG = L.goals.length;
    const dGoal = () => { const g = this.goal(); return norm3([g[0] - s.pos[0], g[1] - s.pos[1], g[2] - s.pos[2]]); };
    if (groundCrash) { this.phase = "choque"; this.reason = "suelo"; }
    else if (L.collides(s.pos, this.p.radius)) { this.phase = "choque"; this.reason = "obstaculo"; }
    else if (L.outOfBounds(s.pos)) { this.phase = "choque"; this.reason = "limites"; }
    else if (fl && this.phase === "ruta" && dGoal() < BIRDS.CATCH_R) {      // ¡cazado!
      fl.alive[this.target] = false;
      this.goalIdx += 1;
      this.caught = { i: this.target, pos: fl.pos[this.target].slice(), t: this.t };
      if (this.goalIdx >= fl.n) this.phase = "cazado";
      else this.target = fl.pick(s.pos, null);
    } else if (!fl && !this.film && this.phase === "ruta" && nG && dGoal() < GOAL_RADIUS) {
      this.goalIdx += 1;
      if (this.goalIdx >= nG) this.phase = this.landOn ? "aterrizaje" : "aterrizado";
    } else if (this.phase === "aterrizaje" && grounded && this.landLow) {
      this.phase = "aterrizado";
      s.throttle = 0;
    }
  }
}

// ---------------- caza: los pájaros (birds.py) ----------------
export const BIRDS = { AREA_R: 12.0, Z_MIN: 1.5, Z_MAX: 6.0, FLEE_R: 4.0, CATCH_R: 0.7, EST_STEPS: 5, SWITCH: 0.6,
  LOOK: 1.2, LOOK_R: 0.45, BODY_R: 0.25, Z_FOREST: [0.9, 2.4] };
const wrapAng = (a) => a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI));

/**
 * Pájaros que pasean al azar (suave), se quedan en el área y HUYEN del dron cuando se acerca.
 * El dron solo sabe dónde está su presa y cómo se movió en la última décima de segundo (estVel).
 */
export class Flock {
  /** level: obstáculos a esquivar (null = campo abierto) · z: [mín, máx] de altura (bosque: debajo de las copas). */
  constructor(speed = 1.5, center = [0, 0, 0], level = null, z = [BIRDS.Z_MIN, BIRDS.Z_MAX]) {
    this.speed = speed; this.center = center; this.level = level;
    this.zMin = z[0]; this.zMax = z[1];
  }
  hits(p, r) { return this.level ? this.level.collides(p, r) : false; }
  /** pos: [[x,y,z], …] donde empiezan · head: rumbo inicial de cada uno (rad). */
  start(pos, head, dt = 1 / CONTROL_HZ) {
    const n = (this.n = pos.length);
    this.pos = pos.map((p) => p.slice());
    this.head = head.slice();
    this.climb = new Array(n).fill(0);
    this.pace = new Array(n).fill(1);
    this.vel = this.head.map((h) => [this.speed * Math.cos(h), this.speed * Math.sin(h), 0]);
    this.alive = new Array(n).fill(true);
    this.dt = dt;
    this.hist = [];
    for (let k = BIRDS.EST_STEPS; k >= 0; k--) this.hist.push(this.pos.map((p, i) => [0, 1, 2].map((c) => p[c] - this.vel[i][c] * dt * k)));
    return this;
  }
  /** noise: n x 3 números normales (el azar entra de afuera, igual que en Python). */
  step(dt, noise, drone) {
    const B = BIRDS, sq = Math.sqrt(dt), R = B.AREA_R, c = this.center, f = 1 - Math.exp(-dt / 0.35);
    for (let i = 0; i < this.n; i++) {
      if (!this.alive[i]) { this.vel[i] = [0, 0, 0]; continue; }
      const p = this.pos[i], v = this.vel[i], [n0, n1, n2] = noise[i];
      let head = this.head[i] + 1.0 * sq * n0;                                          // pasear
      let climb = clip(this.climb[i] - this.climb[i] * dt / 1.0 + 0.7 * sq * n1, -1.2, 1.2);
      const pace = clip(this.pace[i] - (this.pace[i] - 1.0) * dt / 2.0 + 0.35 * sq * n2, 0.6, 1.4);
      const dx = p[0] - c[0], dy = p[1] - c[1];                                          // borde
      const out = clip((Math.hypot(dx, dy) - 0.7 * R) / (0.3 * R), 0, 1);
      head = head + wrapAng(Math.atan2(-dy, -dx) - head) * clip(out * 3.0 * dt, 0, 1);
      const z = p[2];                                                                    // piso / techo
      climb = climb + clip((this.zMin + 0.6 - z) / 0.6, 0, 1) * 4.0 * dt - clip((z - (this.zMax - 0.6)) / 0.6, 0, 1) * 4.0 * dt;
      const ax = p[0] - drone[0], ay = p[1] - drone[1], az = p[2] - drone[2];           // huir
      const dd = Math.max(Math.sqrt(ax * ax + ay * ay + az * az), 1e-6);
      const k = clip(1 - dd / B.FLEE_R, 0, 1);
      head = head + wrapAng(Math.atan2(ay, ax) - head) * clip(k * 6.0 * dt, 0, 1);
      if (this.level) {                                                                // esquivar: mirar adelante
        const ahead = (h) => [p[0] + Math.cos(h) * B.LOOK, p[1] + Math.sin(h) * B.LOOK, p[2]];
        if (this.hits(ahead(head), B.LOOK_R)) {
          const freeL = !this.hits(ahead(head + 0.9), B.LOOK_R), freeR = !this.hits(ahead(head - 0.9), B.LOOK_R);
          head = head + (freeL ? 1.0 : freeR ? -1.0 : 1.0) * 5.0 * dt;
        }
      }
      const spd = this.speed * pace * (1 + 0.5 * k);
      const vd = [spd * Math.cos(head), spd * Math.sin(head), climb + k * this.speed * 0.8 * az / dd];
      let nv = [v[0] + (vd[0] - v[0]) * f, v[1] + (vd[1] - v[1]) * f, v[2] + (vd[2] - v[2]) * f];
      let np = [p[0] + nv[0] * dt, p[1] + nv[1] * dt, clip(p[2] + nv[2] * dt, 0.4, this.zMax + 1.0)];
      if (this.hits(np, B.BODY_R)) {                                                   // nunca adentro de algo: rebota
        np = p.slice();
        nv = nv.map((x) => -0.5 * x);
        head = head + Math.PI;
      }
      this.pos[i] = np;
      this.vel[i] = nv;
      this.head[i] = wrapAng(head); this.climb[i] = climb; this.pace[i] = pace;
    }
    this.hist.shift();
    this.hist.push(this.pos.map((q) => q.slice()));
  }
  estVel(i) {
    const a = this.hist[0][i], b = this.hist[this.hist.length - 1][i], T = BIRDS.EST_STEPS * this.dt;
    return [(b[0] - a[0]) / T, (b[1] - a[1]) / T, (b[2] - a[2]) / T];
  }
  /** La presa: el pájaro vivo más cercano; solo cambia si otro está MUCHO más cerca. */
  pick(drone, current) {
    let j = -1, dj = Infinity;
    const dist = (i) => { const p = this.pos[i]; return Math.sqrt((p[0] - drone[0]) ** 2 + (p[1] - drone[1]) ** 2 + (p[2] - drone[2]) ** 2); };
    for (let i = 0; i < this.n; i++) if (this.alive[i]) { const d = dist(i); if (d < dj) { dj = d; j = i; } }
    if (j < 0) return current;
    if (current === null || current < 0 || !this.alive[current]) return j;
    return dj < BIRDS.SWITCH * dist(current) ? j : current;
  }
}
