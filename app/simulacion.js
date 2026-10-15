// =====================================================================
// SIMULACIONES en el navegador: ver una prueba de la IA, la misma que hacen los 50 drones al entrenar.
//   · Avance del modelo  -> el MEJOR y el PEOR intento que ha tenido (los guarda live_train en avance.json)
//   · Simular prueba     -> una prueba nueva al azar, volada con la última generación guardada (POST /api/simular)
// No es un pedido: no da plata, no gasta batería ni daña el dron. Las grabaciones las hace scripts/simulacion.py
// (Python, el mismo código del entrenamiento); aquí solo se dibujan: la escena, el recorrido, el dron, tres
// cámaras, la red neuronal en cada instante, gráficas y una línea de tiempo.
// =====================================================================
import * as THREE from "three";
import { V, makeSky, makeLights, makeDrone, poseDrone, RING_COL } from "../game/scene.js";
import { Toma, CAM } from "../game/sim.js";
import { dibujarRed, conexionesFuertes } from "./redviz.js";

const RAZON = { suelo: "golpe contra el piso", obstaculo: "chocó con algo", limites: "se salió del área" };

/** Un visor 3D de una grabación (rep: formato de scripts/simulacion.py). */
export class Visor {
  constructor(renderer, rep, { quality = "media" } = {}) {
    this.r = renderer;
    this.rep = rep;
    const C = rep.cuadros;
    this.n = C.pos.length;
    this.dur = Math.max(rep.dt * (this.n - 1), 0.01);
    this.t = 0; this.vel = 1; this.play = true; this.camMode = "persecucion";
    const S = (this.scene = new THREE.Scene());
    S.fog = new THREE.FogExp2(0xcdd9d4, 0.006);
    makeSky(S);
    this.lights = makeLights(S, quality);
    // el piso
    const piso = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.MeshStandardMaterial({ color: 0x6f8a52, roughness: 0.95 }));
    piso.rotation.x = -Math.PI / 2; piso.receiveShadow = true;
    S.add(piso);
    const grid = new THREE.GridHelper(60, 30, 0x50663c, 0x5d7646);
    grid.position.y = 0.01; grid.material.transparent = true; grid.material.opacity = 0.35;
    S.add(grid);
    this.nivel(rep.nivel || {}, !!rep.toma);
    // la base (de donde sale)
    const sp = rep.nivel?.spawn || [0, 0, 0];
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.03, 36), new THREE.MeshStandardMaterial({ color: 0x1d2326 }));
    base.position.copy(V(sp[0], sp[1], 0.015));
    S.add(base);
    // la ruta de la cámara (grabar) y el punto que avanza
    if (rep.toma) {
      this.toma = Toma.fromDict(rep.toma);
      const pts = this.toma.path(64).map((q) => V(...q));
      const tubo = pts.length > 1 ? new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 96, 0.05, 6, false) : new THREE.SphereGeometry(0.2);
      S.add(new THREE.Mesh(tubo, new THREE.MeshBasicMaterial({ color: 0x3ccbff, transparent: true, opacity: 0.55, depthWrite: false })));
      this.fantasma = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      S.add(this.fantasma);
      if (rep.sujeto) {
        const suj = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), new THREE.MeshBasicMaterial({ color: 0xff7a1a }));
        suj.position.copy(V(...rep.sujeto));
        S.add(suj);
      }
    }
    // el recorrido completo (gris) y lo ya recorrido (naranja)
    const ptsR = C.pos.map((p) => V(...p));
    const gTodo = new THREE.BufferGeometry().setFromPoints(ptsR);
    S.add(new THREE.Line(gTodo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22 })));
    this.lineaHecha = new THREE.Line(new THREE.BufferGeometry().setFromPoints(ptsR), new THREE.LineBasicMaterial({ color: 0xff7a1a }));
    this.lineaHecha.frustumCulled = false;
    S.add(this.lineaHecha);
    // dónde terminó: verde éxito, rojo choque, amarillo tiempo
    const res = rep.resultado || {};
    const fin = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10), new THREE.MeshBasicMaterial({ color: res.exito ? 0x47f08a : res.choque ? 0xff5040 : 0xffd23f, transparent: true, opacity: 0.85 }));
    fin.position.copy(ptsR.at(-1) || V(0, 0, 0));
    S.add(fin);
    // el dron
    this.dron = makeDrone();
    this.dron.scale.setScalar(1.6);                 // un poco más grande que el real: que se vea desde la persecución
    S.add(this.dron);
    // cámaras
    this.cam = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.05, 400);
    this.dcam = new THREE.PerspectiveCamera((CAM.vfov * 180) / Math.PI, 16 / 9, 0.03, 300);   // CAM en radianes
    this.camPos = null;
    // para la cámara de arriba: el centro y el tamaño de todo lo que pasa
    const xs = C.pos.map((p) => p[0]).concat(rep.sujeto ? [rep.sujeto[0]] : []), ys = C.pos.map((p) => p[1]).concat(rep.sujeto ? [rep.sujeto[1]] : []);
    this.centro = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
    this.radio = Math.max(6, Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  }

  /** Las cajas (paredes y techo de la casa, columnas), los postes/troncos y las copas de los árboles, y las metas. */
  nivel(L, grabar) {
    const S = this.scene;
    const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, ...o });
    const pared = mat(0xe8dcc6), techo = mat(0xb5523b), columna = mat(0x8a8f94), poste = mat(0x4a4f55), tronco = mat(0x6b4a2f), copa = mat(0x4f7d3a);
    const arboles = (L.spheres || []).length > 0;
    for (const b of L.boxes || []) {
      const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max;
      const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, z1 - z0, y1 - y0), grabar ? (z0 > 0.3 ? techo : pared) : columna);
      m.position.copy(V((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2));
      m.castShadow = m.receiveShadow = true;
      S.add(m);
    }
    for (const c of L.cylinders || []) {
      const [z0, z1] = c.z, h = z1 - z0;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(c.radius, c.radius, h, 12), arboles ? tronco : poste);
      m.position.copy(V(c.center[0], c.center[1], z0 + h / 2));
      m.castShadow = true;
      S.add(m);
    }
    for (const s of L.spheres || []) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(s.radius, 1), copa);
      m.position.copy(V(...s.center));
      m.castShadow = true;
      S.add(m);
    }
    if (!grabar) (L.goals || []).forEach((g, i) => {
      const m = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 10, 40), new THREE.MeshBasicMaterial({ color: i === 0 ? RING_COL.cur : RING_COL.next }));
      m.position.copy(V(...g));
      S.add(m);
    });
  }

  /** El estado en el tiempo t (interpolado entre cuadros). */
  estado(t = this.t) {
    const C = this.rep.cuadros, f = Math.min(this.n - 1, Math.max(0, t / this.rep.dt)), i = Math.floor(f), j = Math.min(this.n - 1, i + 1), a = f - i;
    const L = (x, y) => x + (y - x) * a, Lang = (x, y) => x + Math.atan2(Math.sin(y - x), Math.cos(y - x)) * a;
    return {
      i, pos: [0, 1, 2].map((k) => L(C.pos[i][k], C.pos[j][k])),
      rot: [L(C.rot[i][0], C.rot[j][0]), L(C.rot[i][1], C.rot[j][1]), Lang(C.rot[i][2], C.rot[j][2])],
      act: C.act[i], q: C.q[i], prog: C.prog[i], premio: C.premio[i], meta: C.meta[i],
      vel: i > 0 ? Math.hypot(...[0, 1, 2].map((k) => C.pos[i][k] - C.pos[i - 1][k])) / this.rep.dt : 0,
    };
  }

  update(dt) {
    if (!this.play) return;
    this.t += dt * this.vel;
    if (this.t >= this.dur) { this.t = this.dur; this.play = false; }
  }

  render(dt) {
    const e = this.estado(), [roll, pitch, yaw] = e.rot;
    poseDrone(this.dron, e.pos, roll, pitch, yaw);
    const gas = (e.act?.[0] ?? 0) * 0.5 + 0.5;
    for (const pr of this.dron.userData.props) {
      pr.rotation.y += (6 + 30 * gas) * 2 * Math.PI * dt * pr.userData.dir * (this.play ? this.vel : 0);
      pr.userData.disc.visible = this.play; pr.userData.blade.visible = !this.play;
    }
    this.lineaHecha.geometry.setDrawRange(0, e.i + 1);
    if (this.fantasma) this.fantasma.position.copy(V(...this.toma.at(e.prog)[0]));
    const foco = V(...e.pos);
    this.lights.sun.position.copy(foco).add(this.lights.offset);
    this.lights.sun.target.position.copy(foco);
    const R = this.r;
    R.setViewport(0, 0, innerWidth, innerHeight);
    if (this.camMode === "dron") {
      this.dron.visible = false;
      const q = new THREE.Quaternion();
      this.dron.updateMatrixWorld();
      this.dron.userData.body.getWorldQuaternion(q);
      this.dcam.position.copy(foco).add(new THREE.Vector3(0, 0.03, 0));
      this.dcam.quaternion.copy(q).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-CAM.tilt, -Math.PI / 2, 0, "YXZ")));
      this.dcam.aspect = innerWidth / innerHeight; this.dcam.updateProjectionMatrix();
      R.render(this.scene, this.dcam);
      this.dron.visible = true;
      return;
    }
    let quiero, mira;
    if (this.camMode === "arriba") {
      quiero = V(this.centro[0] - this.radio * 0.35, this.centro[1] - this.radio * 0.35, this.radio * 1.15 + 6);
      mira = V(this.centro[0], this.centro[1], 1);
    } else {                                                  // persecución: detrás y arriba del dron
      quiero = V(e.pos[0] - Math.cos(yaw) * 2.8, e.pos[1] - Math.sin(yaw) * 2.8, e.pos[2] + 1.2);
      mira = foco;
    }
    this.camPos = this.camPos ? this.camPos.lerp(quiero, Math.min(1, dt * 4)) : quiero.clone();
    this.cam.position.copy(this.camPos);
    this.cam.lookAt(mira);
    this.cam.aspect = innerWidth / innerHeight; this.cam.updateProjectionMatrix();
    R.render(this.scene, this.cam);
  }

  /** La red en el tiempo t (la muestra más cercana). */
  red(t = this.t) {
    const R = this.rep.red;
    if (!R || !R.in.length) return null;
    const k = Math.min(R.in.length - 1, Math.max(0, Math.round(t / R.dt)));
    return { capas: R.capas, in: R.in[k], h: R.h[k], mu: R.mu[k], in_lbl: R.in_lbl, act_lbl: R.act_lbl };
  }

  dispose() {
    this.scene.traverse((o) => {
      o.geometry?.dispose?.();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.map?.dispose?.(); m.dispose?.(); });
    });
  }
}

/** Gráficas de la grabación: altura, velocidad, calidad de imagen (grabar) y premio acumulado, con la línea del tiempo. */
export function dibujarGraficas(cv, visor) {
  const rep = visor.rep, C = rep.cuadros, n = visor.n;
  const dpr = window.devicePixelRatio || 1, W = cv.clientWidth || 340, H = 170;
  if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.height = H + "px"; }
  const g = cv.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  const P = 6, x = (i) => P + (i * (W - 2 * P)) / Math.max(1, n - 1), yN = (v) => H - 16 - v * (H - 26);
  const vels = C.pos.map((p, i) => (i ? Math.hypot(...[0, 1, 2].map((k) => p[k] - C.pos[i - 1][k])) / rep.dt : 0));
  const maxZ = Math.max(1, ...C.pos.map((p) => p[2])), maxV = Math.max(1, ...vels);
  const pmin = Math.min(0, ...C.premio), pmax = Math.max(1e-6, ...C.premio);
  const series = [
    ["altura", "#eaf2ef", C.pos.map((p) => p[2] / maxZ), `${maxZ.toFixed(1)} m`],
    ["vel.", "#ffd23f", vels.map((v) => v / maxV), `${maxV.toFixed(1)} m/s`],
    ["premio", "#ff7a1a", C.premio.map((v) => (v - pmin) / (pmax - pmin || 1)), `${C.premio.at(-1)?.toFixed(1)}`],
  ];
  if (rep.toma) series.push(["calidad", "#47f08a", C.q, "0-1"]);
  for (const [, color, ys] of series) {
    g.strokeStyle = color; g.lineWidth = 1.6; g.beginPath();
    ys.forEach((v, i) => (i ? g.lineTo(x(i), yN(v)) : g.moveTo(x(i), yN(v))));
    g.stroke();
  }
  // la línea del tiempo
  const e = visor.estado();
  g.strokeStyle = "rgba(255,255,255,.7)"; g.lineWidth = 1;
  g.beginPath(); g.moveTo(x(e.i), 4); g.lineTo(x(e.i), H - 14); g.stroke();
  g.font = "10px ui-monospace, Menlo, monospace"; g.textBaseline = "alphabetic";
  let lx = P;
  for (const [nombre, color, , maxTxt] of series) {
    g.fillStyle = color; const t = `${nombre} (${maxTxt})`; g.fillText(t, lx, H - 2); lx += g.measureText(t).width + 12;
  }
}

/** El texto del resultado de una grabación. */
export function resultadoTxt(rep) {
  const r = rep.resultado || {};
  const que = r.exito ? `<b class="ok">✓ Lo logró</b>` : r.choque ? `<b class="bad">✗ ${RAZON[r.razon] || "chocó"}</b>` : `<b class="warn">Se acabó el tiempo</b>`;
  const partes = [que, `${r.t?.toFixed(1)} s`, `premio ${r.premio}`];
  if (rep.toma) partes.push(`calidad media ${Math.round((r.calidad || 0) * 100)} %`, `${r.segundos_buenos} s grabados bien`);
  else if (r.metas) partes.push(`${r.metas} metas`);
  return partes.join(" · ");
}

export { dibujarRed, conexionesFuertes };
