// =====================================================================
// LAS CÁMARAS DEL FREESTYLE (app/freestyle.js):
//   Intro       = antes de la cuenta, la cámara presenta la pista: baja desde lo alto y vuela por la línea de carrera
//                 (freestyle_mapas.js lineaCarrera) nombrando cada tramo, y termina detrás de tu dron. Se salta con
//                 cualquier tecla o botón.
//   persecucion = la cámara "Detrás": sigue hacia donde VAS (no solo hacia donde mira el dron), se abre con la
//                 velocidad (FOV) y no se mete en las paredes.
//   Repeticion  = tu mejor vuelta (el fantasma guardado) vista como en la tele: cámaras al lado de los portales que
//                 la siguen, alternando con la de atrás.
// Ejes: la simulación es Z arriba; Three.js es Y arriba (V de game/scene.js hace el cambio).
// =====================================================================
import * as THREE from "three";
import { V } from "../game/scene.js";

const ease = (u) => u * u * (3 - 2 * u);

/** La línea de carrera levantada (para la cámara) y su largo acumulado. */
function caminoCamara(linea, nivel, alto = 1.4) {
  const pts = [];
  for (const p of linea) {
    let q = [p[0], p[1], p[2] + alto];
    if (nivel.collides(q, 0.6)) q = [p[0], p[1], p[2]];
    pts.push(V(...q));
  }
  return pts;
}

export class Intro {
  /**
   * M = el mapa, linea = lineaCarrera(M), nivel = Level, inicio = {pos, yaw} de tu dron, nombres = el nombre de cada
   * tramo por portal (ya traducido) y titulo = el nombre del mapa.
   */
  constructor(M, linea, nivel, inicio, nombres = [], titulo = "") {
    this.M = M; this.nombres = nombres; this.titulo = titulo;
    this.t = 0; this.fin = false; this.texto = titulo;
    const camino = caminoCamara(linea, nivel);
    // la pista entera en ~7 s (rápido: es un vuelo de presentación), con los puntos cada ~4 m
    const pasos = [];
    for (let i = 0; i < camino.length; i += 3) pasos.push(camino[i]);
    const largo = pasos.reduce((s, p, i) => s + (i ? p.distanceTo(pasos[i - 1]) : 0), 0);
    this.curva = new THREE.CatmullRomCurve3(pasos, true, "centripetal");
    this.tPista = Math.min(9, Math.max(6, largo / 55));
    this.tAlto = 2.4; this.tFinal = 1.4;
    this.dur = this.tAlto + this.tPista + this.tFinal;
    // dónde empieza: alto, mirando la pista entera
    const c = M.gates.reduce((s, g) => [s[0] + g[0] / M.gates.length, s[1] + g[1] / M.gates.length, s[2] + g[2] / M.gates.length], [0, 0, 0]);
    this.centro = V(c[0], c[1], c[2]);
    const r = Math.min(M.bounds.xy * 0.8, 80);
    this.alto = V(M.spawn[0] - Math.cos(M.yaw) * r * 0.6, M.spawn[1] - Math.sin(M.yaw) * r * 0.6, Math.min(M.bounds.z - 2, r * 0.55));
    // dónde termina: detrás de tu dron, como la cámara de atrás
    const p = inicio.pos, y = inicio.yaw;
    this.finPos = V(p[0] - Math.cos(y) * 3.2, p[1] - Math.sin(y) * 3.2, p[2] + 1.3);
    this.finMira = V(p[0] + Math.cos(y) * 4, p[1] + Math.sin(y) * 4, p[2] + 0.6);
    this.portalT = M.gates.map((g) => {                         // en qué parte de la curva está cada portal (para nombrarlo)
      const v = V(...g); let best = 0, bd = Infinity;
      for (let k = 0; k <= 200; k++) { const d = this.curva.getPointAt(k / 200).distanceTo(v); if (d < bd) { bd = d; best = k / 200; } }
      return best;
    });
    this.pos = new THREE.Vector3(); this.mira = new THREE.Vector3();
  }
  saltar() { this.fin = true; }
  /** Mueve la cámara; devuelve false cuando terminó. */
  camara(camera, dt) {
    if (this.fin) return false;
    this.t += dt;
    const t = this.t;
    let fov = 62;
    if (t < this.tAlto) {                                        // 1) desde lo alto, bajando hacia la salida de la pista
      const u = ease(t / this.tAlto), a = this.curva.getPointAt(0), b = this.curva.getPointAt(0.012);
      this.pos.lerpVectors(this.alto, a, u);
      this.mira.lerpVectors(this.centro, b, u);
      this.texto = this.titulo;
      fov = 58 + 10 * u;
    } else if (t < this.tAlto + this.tPista) {                   // 2) por la línea de carrera
      const u = (t - this.tAlto) / this.tPista;
      this.pos.copy(this.curva.getPointAt(u));
      this.mira.copy(this.curva.getPointAt((u + 0.018) % 1));
      fov = 78;
      // el tramo que viene: el portal más cercano adelante
      let txt = "";
      this.portalT.forEach((pt, i) => { const d = pt - u; if (this.nombres[i] && d > -0.01 && d < 0.05) txt = this.nombres[i]; });
      this.texto = txt;
    } else if (t < this.dur) {                                   // 3) se acomoda detrás de tu dron
      const u = ease((t - this.tAlto - this.tPista) / this.tFinal), a = this.curva.getPointAt(0.999), b = this.curva.getPointAt(0.01);
      this.pos.lerpVectors(a, this.finPos, u);
      this.mira.lerpVectors(b, this.finMira, u);
      this.texto = "";
      fov = 78 - 6 * u;
    } else { this.fin = true; return false; }
    camera.position.copy(this.pos);
    camera.lookAt(this.mira);
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
    return true;
  }
}

/**
 * La cámara de atrás: mira hacia donde vas (mezcla el rumbo del dron con su velocidad), sube un poco al bajar,
 * se abre con la velocidad y se acerca si hay una pared entre ella y el dron. st = su estado (se guarda entre cuadros).
 */
export function persecucion(camera, st, pos, vel, yaw, nivel, dt, lejos = false, nueva = false) {
  const sp = Math.hypot(vel[0], vel[1]), k = Math.min(1, sp / 7);
  let dx = Math.cos(yaw) * (1 - k) + (sp > 0.1 ? (vel[0] / sp) * k : 0), dy = Math.sin(yaw) * (1 - k) + (sp > 0.1 ? (vel[1] / sp) * k : 0);
  const n = Math.hypot(dx, dy) || 1; dx /= n; dy /= n;
  if (!st.d || nueva) st.d = [dx, dy];
  const a = 1 - Math.exp(-4 * dt);                               // el rumbo de la cámara se suaviza (no tiembla en las curvas)
  st.d[0] += (dx - st.d[0]) * a; st.d[1] += (dy - st.d[1]) * a;
  const m = Math.hypot(...st.d) || 1, ux = st.d[0] / m, uy = st.d[1] / m;
  let back = lejos ? 7 : 2.8, up = (lejos ? 3.2 : 1.0) + Math.max(-0.6, Math.min(1.2, -vel[2] * 0.12));
  const L = Math.hypot(back, up), libre = nivel.raycast(pos, [[-ux * back / L, -uy * back / L, up / L]], L)[0];
  if (libre < L) { const f = Math.max((libre - 0.3) / L, 0.12); back *= f; up *= f; }
  const want = V(pos[0] - ux * back, pos[1] - uy * back, Math.max(0.3, pos[2] + up));
  if (!st.pos || nueva || libre < L) st.pos = want.clone();
  st.pos.lerp(want, 1 - Math.exp(-7 * dt));
  camera.position.copy(st.pos);
  const ade = lejos ? 3 : 2.5 + Math.min(4, Math.hypot(...vel) * 0.15);
  camera.lookAt(V(pos[0] + ux * ade, pos[1] + uy * ade, pos[2] + 0.3 + vel[2] * 0.05));
  const fov = (lejos ? 66 : 72) + Math.min(20, Math.hypot(...vel) * 0.7);
  st.fov = (st.fov ?? fov) + (fov - (st.fov ?? fov)) * (1 - Math.exp(-3 * dt));
  if (Math.abs(camera.fov - st.fov) > 0.05) { camera.fov = st.fov; camera.updateProjectionMatrix(); }
}

/** La repetición de tu mejor vuelta: F = { t, p: [[x, y, z, qw, qx, qy, qz]…] } (una muestra cada 2 pasos de 50/s). */
export class Repeticion {
  constructor(M, F, nivel, dirs, paso = 0.04) {
    this.M = M; this.F = F; this.nivel = nivel; this.paso = paso;
    this.t = 0; this.fin = false; this.cam = 0; this.cambioT = 0;
    // una cámara de tele al costado de cada portal (afuera de las paredes, a la altura del portal o un poco más arriba)
    this.puntos = M.gates.map((g, i) => {
      const d = dirs[i], h = Math.hypot(d[0], d[1]) > 0.2 ? [d[0], d[1]] : [1, 0], n = Math.hypot(...h);
      const ux = h[0] / n, uy = h[1] / n;
      for (const [lado, atras, alto] of [[5, 6, 2.2], [-5, 6, 2.2], [4, 2, 3.5], [-4, 2, 3.5], [0, 8, 4], [0, 4, 6]]) {
        const q = [g[0] - ux * atras - uy * lado, g[1] - uy * atras + ux * lado, g[2] + alto];
        if (q[2] > 0.5 && !nivel.collides(q, 0.8) && nivel.raycast(q, [norm([g[0] - q[0], g[1] - q[1], g[2] - q[2]])], dist(q, g))[0] >= dist(q, g) - 0.5) return q;
      }
      return [g[0], g[1], g[2] + 6];
    });
    this.st = {};
    this.pos = [0, 0, 0]; this.q = [1, 0, 0, 0]; this.vel = [0, 0, 0]; this.k = 0;
  }
  get dur() { return this.F.p.length * this.paso; }
  /** La muestra en el tiempo t (interpola posición y rota con la muestra más cercana). */
  muestra(t) {
    const P = this.F.p, f = t / this.paso, i = Math.min(P.length - 2, Math.floor(f)), u = Math.min(1, f - i);
    const a = P[Math.max(0, i)], b = P[i + 1] || a;
    const pos = [0, 1, 2].map((k) => a[k] + (b[k] - a[k]) * u);
    return { pos, q: (u < 0.5 ? a : b).slice(3), vel: [0, 1, 2].map((k) => (b[k] - a[k]) / this.paso) };
  }
  avanzar(dt) {
    this.t += dt;
    if (this.t >= this.dur) { this.fin = true; this.t = this.dur; }
    const m = this.muestra(this.t);
    this.pos = m.pos; this.q = m.q; this.vel = m.vel;
    // el portal que viene (para elegir la cámara)
    const G = this.M.gates;
    const g = G[this.k % G.length];
    if (dist(this.pos, g) < 2.2) { this.k++; this.cambioT = this.t; }
  }
  camara(camera, dt) {
    const G = this.M.gates, n = G.length, cerca = this.k % n;
    // cada portal alterna: la cámara de tele del portal que viene o la de atrás
    const tele = (this.k % 3) !== 2;
    if (tele) {
      const q = this.puntos[cerca], d = dist(q, this.pos);
      if (d > 28) return persecucion(camera, this.st, this.pos, this.vel, Math.atan2(this.vel[1], this.vel[0]), this.nivel, dt, false);
      camera.position.copy(V(...q));
      camera.lookAt(V(...this.pos));
      const fov = Math.max(24, Math.min(70, (2 * Math.atan(3.5 / Math.max(1, d)) * 180) / Math.PI));
      camera.fov += (fov - camera.fov) * (1 - Math.exp(-5 * dt)); camera.updateProjectionMatrix();
      this.st.pos = null;
    } else persecucion(camera, this.st, this.pos, this.vel, Math.atan2(this.vel[1], this.vel[0]), this.nivel, dt, false);
  }
}
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const norm = (v) => { const n = Math.hypot(...v) || 1; return v.map((x) => x / n); };
