// =====================================================================
// SIMULADOR del dron en JavaScript: la MISMA física, sensores y red que en Python.
//
//   drone_rl/physics.py  -> step(), Wind
//   drone_rl/level.py    -> Level (cajas, esferas, cilindros): collides(), raycast()
//   drone_rl/sensing.py  -> sensorRays(), buildObs()   (sensores en cono de 3 rayos)
//   drone_rl/controller  -> pdAct()                    (aterrizaje automático)
//   drone_rl/runtime.py  -> Policy, Flight
//
// No usa nada del navegador: también corre en node (game/test_sim.mjs lo compara con Python).
// Unidades SI. Eje X = frente del dron, Y = izquierda, Z = arriba (igual que en Python).
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
export function actionToThrottle(a0) {
  const h = P.hover;
  return a0 >= 0 ? h + a0 * (1 - h) : h * (1 + a0);
}
export function throttleToAction(thr) {
  const h = P.hover;
  return thr >= h ? (thr - h) / (1 - h) : thr / h - 1;
}
export function yawFrame(v, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return [c * v[0] + s * v[1], -s * v[0] + c * v[1], v[2]];
}

export function newState(pos = [0, 0, 0], yaw = 0) {
  return { pos: pos.slice(), vel: [0, 0, 0], roll: 0, pitch: 0, yaw, throttle: 0 };
}

/** Avanza dt segundos. Devuelve {groundCrash, grounded}. Modifica s. */
export function step(s, action, dt, wind = null) {
  const a = action.map((x) => clip(x, -1, 1));
  s.throttle = actionToThrottle(a[0]);
  let tr = a[1] * P.maxAngle, tp = a[2] * P.maxAngle;
  const grounded = s.pos[2] <= 1e-4;
  if (grounded && s.throttle < P.hover * 0.9) { tr = 0; tp = 0; }
  const k = Math.min(1, P.attResp * dt);                // el ángulo real persigue al pedido
  s.roll += (tr - s.roll) * k;
  s.pitch += (tp - s.pitch) * k;
  if (!(grounded && s.throttle < 0.05)) s.yaw += a[3] * P.yawRate * dt;
  const m = 2 * Math.PI;
  s.yaw = ((((s.yaw + Math.PI) % m) + m) % m) - Math.PI;

  const thrust = s.throttle * P.twr * P.mass * P.g;
  const cr = Math.cos(s.roll), sr = Math.sin(s.roll), cp = Math.cos(s.pitch), sp = Math.sin(s.pitch);
  const cy = Math.cos(s.yaw), sy = Math.sin(s.yaw);
  const bz = [cy * sp * cr + sy * sr, sy * sp * cr - cy * sr, cp * cr];   // eje Z del dron (R = Rz Ry Rx)
  const f = [bz[0] * thrust, bz[1] * thrust, bz[2] * thrust - P.mass * P.g];
  const va = (wind === null || grounded) ? s.vel : [s.vel[0] - wind[0], s.vel[1] - wind[1], s.vel[2] - wind[2]];
  const sp_ = norm3(va);
  for (let i = 0; i < 3; i++) f[i] -= P.drag * sp_ * va[i];
  for (let i = 0; i < 3; i++) {
    s.vel[i] += f[i] / P.mass * dt;
    s.pos[i] += s.vel[i] * dt;
  }
  const info = { groundCrash: false, grounded: false };
  if (s.pos[2] < 0) {
    const impact = -s.vel[2];
    s.pos[2] = 0;
    if (impact > P.crashSpeed) {
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

/** Las 24 entradas de la red (mismo orden y escala que el entrenamiento). */
export function buildObs(s, goal, rays, prevAction) {
  const rel = yawFrame([goal[0] - s.pos[0], goal[1] - s.pos[1], goal[2] - s.pos[2]], s.yaw);
  const dist = norm3(rel);
  const vh = yawFrame(s.vel, s.yaw);
  const obs = [
    ...rel.map((x) => clip(x / OBS_SCALE, -2, 2)),
    Math.min(dist / OBS_SCALE, 2),
    ...vh.map((x) => clip(x / OBS_SCALE, -2, 2)),
    s.roll / P.maxAngle, s.pitch / P.maxAngle,
    s.pos[2] / OBS_SCALE,
    ...prevAction,
    ...rays.map((r) => r / RAY_LEN),
  ];
  return obs.map(Math.fround);                            // float32, como en Python
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
    let h = obs;
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
export function pdAct(s, goal, vMax = 1.5, kp = 1.2, kv = 2.0) {
  let vd = [kp * (goal[0] - s.pos[0]), kp * (goal[1] - s.pos[1]), kp * (goal[2] - s.pos[2])];
  const n = norm3(vd);
  if (n > vMax) vd = vd.map((x) => (x * vMax) / n);
  const acc = [kv * (vd[0] - s.vel[0]), kv * (vd[1] - s.vel[1]), kv * (vd[2] - s.vel[2])];
  const ah = yawFrame(acc, s.yaw);
  const pitch = Math.atan2(ah[0], P.g);
  const roll = -Math.atan2(ah[1], P.g);
  const thr = (P.hover * (1 + acc[2] / P.g)) / Math.max(Math.cos(roll) * Math.cos(pitch), 0.5);
  return [throttleToAction(clip(thr, 0, 1)), roll / P.maxAngle, pitch / P.maxAngle, 0].map((x) => clip(x, -1, 1));
}

// ---------------- un vuelo (runtime.Flight) ----------------
/**
 * phase: "ruta" (la red vuela) -> "aterrizaje" (PD baja a la plataforma) -> "aterrizado"   o   "choque".
 * pilot: "ia" (la red) o una función () => [gas, roll, pitch, yaw] (teclado).
 */
export class Flight {
  constructor(level, policy, { landOn = null, wind = 0, seed = 1, pilot = "ia" } = {}) {
    this.level = level; this.policy = policy; this.landOn = landOn; this.pilot = pilot;
    this.dt = 1 / CONTROL_HZ;
    this.wind = new Wind(wind);
    this.rng = makeRng(seed);
  }
  reset(pos = null, yaw = null) {
    const start = pos || this.level.spawn;
    const g = this.level.goals[0] || [start[0] + 1, start[1], 1];
    this.state = newState(start, yaw ?? Math.atan2(g[1] - start[1], g[0] - start[0]));
    this.goalIdx = 0; this.prevAction = [0, 0, 0, 0]; this.action = [0, 0, 0, 0];
    this.t = 0; this.phase = "ruta"; this.reason = null; this.landLow = false;
    this.rays = sensorRays(this.state, this.level);
    this.windNow = this.wind.reset(this.rng);
    this.obs = null;
    return this;
  }
  goal() { return this.level.goals[Math.min(this.goalIdx, this.level.goals.length - 1)]; }
  step() {
    if (this.phase !== "ruta" && this.phase !== "aterrizaje") return;
    const s = this.state;
    let a;
    if (this.phase === "ruta") {
      if (this.pilot === "ia") {
        this.obs = buildObs(s, this.goal(), this.rays, this.prevAction);
        a = this.policy.act(this.obs);                  // <- la red neuronal decide
      } else {
        a = this.pilot(s);
      }
    } else {
      const pad = this.landOn;
      const above = [pad[0], pad[1], pad[2] + 0.6];
      if (!this.landLow && norm3([s.pos[0] - above[0], s.pos[1] - above[1], s.pos[2] - above[2]]) < 0.25 && norm3(s.vel) < 0.4) this.landLow = true;
      a = pdAct(s, this.landLow ? [pad[0], pad[1], pad[2] - 0.4] : above);
    }
    let groundCrash = false, grounded = false;
    this.windNow = this.wind.step(this.dt, this.rng);
    for (let i = 0; i < SUBSTEPS; i++) {
      const inf = step(s, a, this.dt / SUBSTEPS, this.windNow);
      groundCrash ||= inf.groundCrash;
      grounded ||= inf.grounded;
    }
    this.prevAction = a; this.action = a;
    this.t += this.dt;
    this.rays = sensorRays(s, this.level);
    const L = this.level;
    const nG = L.goals.length;
    if (groundCrash) { this.phase = "choque"; this.reason = "suelo"; }
    else if (L.collides(s.pos, P.radius)) { this.phase = "choque"; this.reason = "obstaculo"; }
    else if (L.outOfBounds(s.pos)) { this.phase = "choque"; this.reason = "limites"; }
    else if (this.phase === "ruta" && nG && norm3([this.goal()[0] - s.pos[0], this.goal()[1] - s.pos[1], this.goal()[2] - s.pos[2]]) < GOAL_RADIUS) {
      this.goalIdx += 1;
      if (this.goalIdx >= nG) this.phase = this.landOn ? "aterrizaje" : "aterrizado";
    } else if (this.phase === "aterrizaje" && grounded && this.landLow) {
      this.phase = "aterrizado";
      s.throttle = 0;
    }
  }
}
