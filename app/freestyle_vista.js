// =====================================================================
// CÓMO SE VEN LOS MAPAS DEL FREESTYLE (los datos están en freestyle_mapas.js): texturas dibujadas en un canvas
// (ladrillo, concreto, roca en capas, contenedores…), las piezas unidas por material (pocas llamadas de dibujo),
// el piso, el cielo, la luz (de día o de noche con neón) y los portales de la pista.
// Ejes: la simulación es Z arriba; Three.js es Y arriba (V de game/scene.js hace el cambio).
// =====================================================================
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { V, makeSky } from "../game/scene.js";
import { makeRng } from "../game/sim.js";

// ---------------- texturas ----------------
function lienzo(w, h, pintar) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  pintar(c.getContext("2d"), w, h);
  const tx = new THREE.CanvasTexture(c);
  tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
  tx.colorSpace = THREE.SRGBColorSpace;
  tx.anisotropy = 4;
  return tx;
}
function ruido(g, w, h, cols, n, rmin, rmax, seed) {
  const r = makeRng(seed);
  for (let i = 0; i < n; i++) {
    g.fillStyle = cols[Math.floor(r() * cols.length)];
    g.globalAlpha = 0.15 + r() * 0.35;
    const s = rmin + r() * (rmax - rmin);
    g.fillRect(r() * w, r() * h, s, s);
  }
  g.globalAlpha = 1;
}
const TEX = {
  ladrillo: () => lienzo(256, 256, (g, w, h) => {
    g.fillStyle = "#5a3a30"; g.fillRect(0, 0, w, h);
    const r = makeRng(5);
    for (let y = 0; y < h; y += 16) for (let x = -32; x < w; x += 32) {
      const o = (y / 16) % 2 ? 16 : 0, k = r();
      g.fillStyle = `rgb(${130 + k * 50 | 0},${62 + k * 25 | 0},${46 + k * 18 | 0})`;
      g.fillRect(x + o + 1, y + 1, 30, 14);
    }
    ruido(g, w, h, ["#222", "#000", "#7a6a5a"], 900, 1, 5, 6);
  }),
  concreto: () => lienzo(256, 256, (g, w, h) => {
    g.fillStyle = "#8c8a84"; g.fillRect(0, 0, w, h);
    ruido(g, w, h, ["#6e6c66", "#a3a19a", "#56544f"], 2600, 1, 6, 7);
    g.strokeStyle = "rgba(40,40,40,.35)"; g.lineWidth = 2; g.strokeRect(0, 0, w, h);
  }),
  techo: () => lienzo(128, 128, (g, w, h) => {
    for (let x = 0; x < w; x += 8) { g.fillStyle = (x / 8) % 2 ? "#6d7276" : "#82878b"; g.fillRect(x, 0, 8, h); }
    ruido(g, w, h, ["#6b3b1e", "#3a2a20"], 500, 2, 9, 8);
  }),
  metal: () => lienzo(128, 128, (g, w, h) => { g.fillStyle = "#4a4f55"; g.fillRect(0, 0, w, h); ruido(g, w, h, ["#33373b", "#62686e"], 600, 1, 4, 9); }),
  oxido: () => lienzo(128, 128, (g, w, h) => { g.fillStyle = "#7a4426"; g.fillRect(0, 0, w, h); ruido(g, w, h, ["#a35a2a", "#4a2a1a", "#c27a3a"], 1400, 1, 7, 10); }),
  estante: () => lienzo(128, 128, (g, w, h) => {
    g.fillStyle = "#2b3a8c"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#e07a1a"; for (let y = 0; y < h; y += 32) g.fillRect(0, y, w, 6);
    g.fillStyle = "#8a6a44"; for (let y = 8; y < h; y += 32) for (let x = 6; x < w; x += 30) g.fillRect(x, y, 24, 20);
  }),
  cont: (col) => () => lienzo(128, 128, (g, w, h) => {
    g.fillStyle = col; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 8) { g.fillStyle = "rgba(0,0,0,.18)"; g.fillRect(x, 0, 3, h); }
    ruido(g, w, h, ["#5a3a20", "#222"], 300, 2, 8, 11);
  }),
  silo: () => lienzo(128, 128, (g, w, h) => {
    g.fillStyle = "#b9b9b2"; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) { g.fillStyle = "rgba(0,0,0,.12)"; g.fillRect(0, y, w, 2); }
    ruido(g, w, h, ["#7a4a2a", "#999"], 500, 1, 6, 12);
  }),
  escombro: () => lienzo(64, 64, (g, w, h) => { g.fillStyle = "#6b655c"; g.fillRect(0, 0, w, h); ruido(g, w, h, ["#4a453e", "#8a8378"], 400, 1, 6, 13); }),
  roca: (a, b) => () => lienzo(128, 256, (g, w, h) => {
    const r = makeRng(14);
    for (let y = 0; y < h;) { const s = 4 + r() * 18; g.fillStyle = r() < 0.5 ? a : b; g.fillRect(0, y, w, s); y += s; }
    ruido(g, w, h, ["#5a2a14", "#e8b07a", "#7a3a1e"], 1400, 1, 5, 15);
  }),
  tribuna: () => lienzo(128, 128, (g, w, h) => {
    g.fillStyle = "#1c2230"; g.fillRect(0, 0, w, h);
    const cols = ["#c0263a", "#2a5ac0", "#e0e0e0"]; const r = makeRng(16);
    for (let y = 4; y < h; y += 12) for (let x = 2; x < w; x += 8) { g.fillStyle = cols[Math.floor(r() * 3)]; g.globalAlpha = 0.55; g.fillRect(x, y, 6, 6); }
  }),
  pantalla: () => lienzo(512, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, "#ff2fa0"); gr.addColorStop(1, "#2fd0ff");
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = "#08101a"; g.font = "700 64px Chakra Petch, system-ui"; g.textAlign = "center";
    g.fillText("NEURAL DRONE", w / 2, 110); g.fillText("LEAGUE", w / 2, 185);
  }),
  asfalto: () => lienzo(256, 256, (g, w, h) => {
    g.fillStyle = "#3d3f40"; g.fillRect(0, 0, w, h);
    ruido(g, w, h, ["#2a2c2d", "#555758", "#4a5a3a"], 4000, 1, 4, 17);
    g.strokeStyle = "rgba(15,15,15,.6)"; g.lineWidth = 1.5;
    const r = makeRng(18);
    for (let i = 0; i < 7; i++) { g.beginPath(); let x = r() * w, y = r() * h; g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 50; y += (r() - 0.5) * 50; g.lineTo(x, y); } g.stroke(); }
  }),
  arena: () => lienzo(256, 256, (g, w, h) => { g.fillStyle = "#c98f5a"; g.fillRect(0, 0, w, h); ruido(g, w, h, ["#b07a48", "#dfa772", "#9a6a3e"], 5000, 1, 4, 19); }),
  pasto: () => lienzo(256, 256, (g, w, h) => {
    for (let y = 0; y < h; y += 32) { g.fillStyle = (y / 32) % 2 ? "#1f4a26" : "#245530"; g.fillRect(0, y, w, 32); }
    ruido(g, w, h, ["#163a1c", "#2e6a38"], 3000, 1, 3, 20);
  }),
};

// ---------------- materiales ----------------
function materiales(noche) {
  const std = (map, o = {}) => new THREE.MeshStandardMaterial({ map, roughness: 0.85, ...o });
  const neon = (c) => new THREE.MeshStandardMaterial({ color: 0x0a0f18, emissive: c, emissiveIntensity: noche ? 2.2 : 1.2, roughness: 0.4 });
  return {
    ladrillo: std(TEX.ladrillo()), concreto: std(TEX.concreto()), techo: std(TEX.techo(), { metalness: 0.5, roughness: 0.6, side: THREE.DoubleSide }),
    metal: std(TEX.metal(), { metalness: 0.7, roughness: 0.45 }), oxido: std(TEX.oxido(), { metalness: 0.4 }), estante: std(TEX.estante()),
    cont_r: std(TEX.cont("#9a2f22")()), cont_a: std(TEX.cont("#1f5a8a")()), cont_v: std(TEX.cont("#2f6a3a")()),
    silo: std(TEX.silo(), { metalness: 0.35, roughness: 0.6 }), escombro: std(TEX.escombro()),
    roca: std(TEX.roca("#b5623a", "#c9784a")(), { roughness: 0.95 }), roca2: std(TEX.roca("#a0502e", "#d38a58")(), { roughness: 0.95 }),
    mesa: std(TEX.roca("#8e4528", "#b4643c")(), { roughness: 0.95 }),
    tribuna: std(TEX.tribuna()), andamio: std(null, { color: 0x9aa3ad, metalness: 0.8, roughness: 0.35 }),
    neon_azul: neon(0x2fd0ff), tunel: neon(0xff2fa0), valla: neon(0xffe14a),
    pantalla: new THREE.MeshStandardMaterial({ map: TEX.pantalla(), emissive: 0xffffff, emissiveMap: TEX.pantalla(), emissiveIntensity: noche ? 1.4 : 0.6 }),
  };
}

// ---------------- geometrías (con UV a escala del mundo: la textura no se estira) ----------------
const TILE = 4;
function cajaGeo(b, uvMundo = true) {
  const sx = b.max[0] - b.min[0], sy = b.max[2] - b.min[2], sz = b.max[1] - b.min[1];      // three: x, y=arriba, z
  const g = new THREE.BoxGeometry(sx, sy, sz);
  const uv = g.attributes.uv, esc = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]];
  if (uvMundo) for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * esc[f][0] / TILE, uv.getY(i) * esc[f][1] / TILE); }
  g.translate((b.min[0] + b.max[0]) / 2, (b.min[2] + b.max[2]) / 2, -(b.min[1] + b.max[1]) / 2);
  return g;
}
function cilGeo(c, rugoso, seed) {
  const h = c.z[1] - c.z[0], seg = rugoso ? 14 : Math.max(16, Math.round(c.r * 6));
  const g = new THREE.CylinderGeometry(c.r, c.r, h, seg, rugoso ? Math.max(2, Math.round(h / 3)) : 1);
  if (rugoso) {                                                  // roca: el borde irregular (siempre entre 0,9 y 1 del radio)
    const p = g.attributes.position, r = makeRng(seed);
    const k = Array.from({ length: seg + 1 }, () => 0.9 + r() * 0.1);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x), j = Math.round(((a + Math.PI) / (2 * Math.PI)) * seg) % (seg + 1);
      const f = Math.hypot(x, z) > 1e-6 ? k[j] * (1 - 0.04 * Math.sin(p.getY(i) * 1.7 + j)) : 1;
      p.setXYZ(i, x * f, p.getY(i), z * f);
    }
    g.computeVertexNormals();
  }
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (2 * Math.PI * c.r) / TILE, uv.getY(i) * h / TILE);
  g.translate(c.c[0], (c.z[0] + c.z[1]) / 2, -c.c[1]);
  return g;
}
function esfGeo(s, seed) {
  const g = new THREE.SphereGeometry(s.r, 14, 10);
  const p = g.attributes.position, r = makeRng(seed);
  for (let i = 0; i < p.count; i++) { const f = 0.88 + 0.12 * r(); p.setXYZ(i, p.getX(i) * f, p.getY(i) * f * 0.8, p.getZ(i) * f); }
  g.computeVertexNormals();
  g.translate(s.c[0], s.c[2], -s.c[1]);
  return g;
}
const ROCOSO = new Set(["roca", "roca2", "mesa", "escombro"]);

// ---------------- el mapa entero ----------------
export function construirMapa(scene, M, calidad = "media") {
  const A = M.ambiente, grupo = new THREE.Group();
  const mats = materiales(A.noche);
  // piezas unidas por material
  const porMat = {};
  const add = (m, g) => (porMat[m] ||= []).push(g.index ? g.toNonIndexed() : g);
  M.boxes.forEach((b) => add(b.m, cajaGeo(b, b.m !== "pantalla")));
  M.cyls.forEach((c, i) => add(c.m, cilGeo(c, ROCOSO.has(c.m), 100 + i)));
  M.sphs.forEach((s, i) => add(s.m, esfGeo(s, 300 + i)));
  for (const [m, geos] of Object.entries(porMat)) {
    const mesh = new THREE.Mesh(mergeGeometries(geos), mats[m] || mats.concreto);
    mesh.castShadow = mesh.receiveShadow = true;
    grupo.add(mesh);
  }
  // el piso
  const tx = TEX[A.suelo]();
  tx.repeat.set(180, 180);
  const piso = new THREE.Mesh(new THREE.PlaneGeometry(720, 720), new THREE.MeshStandardMaterial({ map: tx, roughness: 0.95 }));
  piso.rotation.x = -Math.PI / 2;
  piso.receiveShadow = true;
  grupo.add(piso);
  // el cielo, la niebla y la luz
  const sky = makeSky(grupo);
  sky.material.uniforms.top.value.set(A.cielo[0]);
  sky.material.uniforms.horizon.value.set(A.cielo[1]);
  sky.material.uniforms.sunDir.value.set(...A.sol).normalize();
  scene.fog = new THREE.FogExp2(A.cielo[1], A.niebla);
  scene.background = new THREE.Color(A.cielo[1]);
  const hemi = new THREE.HemisphereLight(A.noche ? 0x5a6a9a : 0xd6e2ef, A.noche ? 0x101820 : 0x5a5040, A.noche ? 0.55 : 1.0 * A.luz);
  const sol = new THREE.DirectionalLight(A.solColor, A.noche ? 0.9 : 2.6 * A.luz);
  sol.castShadow = true;
  const sz = calidad === "alta" ? 4096 : calidad === "baja" ? 1024 : 2048;
  sol.shadow.mapSize.set(sz, sz);
  Object.assign(sol.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 260 });
  sol.shadow.bias = -0.0004; sol.shadow.normalBias = 0.04;
  grupo.add(hemi, sol, sol.target);
  const solOff = new THREE.Vector3(...A.sol).normalize().multiplyScalar(120);
  if (A.noche) {                                                  // estrellas
    const r = makeRng(31), pts = [];
    for (let i = 0; i < 1500; i++) { const a = r() * Math.PI * 2, e = Math.asin(0.15 + r() * 0.85); pts.push(Math.cos(a) * Math.cos(e) * 380, Math.sin(e) * 380, Math.sin(a) * Math.cos(e) * 380); }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    const st = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 1.3, sizeAttenuation: false, fog: false }));
    grupo.add(st);
  }
  deco(grupo, M, mats);
  scene.add(grupo);
  return { grupo, sol, solOff, dispose: () => { scene.remove(grupo); grupo.traverse((o) => { o.geometry?.dispose(); }); } };
}

// ---------------- lo que solo se dibuja ----------------
function deco(grupo, M, mats) {
  const add = (g, m, sombra = true) => { const x = new THREE.Mesh(g, m); x.castShadow = sombra; grupo.add(x); return x; };
  const luz = (c, i) => new THREE.MeshStandardMaterial({ color: 0x111111, emissive: c, emissiveIntensity: i });
  for (const d of M.deco) {
    if (d.t === "poste") {
      add(new THREE.CylinderGeometry(0.09, 0.12, d.h, 8).translate(d.p[0], d.h / 2, -d.p[1]), mats.metal);
      add(new THREE.BoxGeometry(1.0, 0.18, 0.35).translate(d.p[0] + 0.4, d.h, -d.p[1]), luz(0xfff0c8, 1.2));
    } else if (d.t === "reja") {
      const geos = [];
      for (let k = -d.r; k <= d.r; k += 4) for (const [x, y] of [[k, -d.r], [k, d.r], [-d.r, k], [d.r, k]]) geos.push(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 5).translate(x, 1.1, -y).toNonIndexed());
      for (const z of [0.4, 1.2, 2.0]) for (const s of [-1, 1]) {
        geos.push(new THREE.BoxGeometry(2 * d.r, 0.03, 0.03).translate(0, z, -s * d.r).toNonIndexed());
        geos.push(new THREE.BoxGeometry(0.03, 0.03, 2 * d.r).translate(s * d.r, z, 0).toNonIndexed());
      }
      add(mergeGeometries(geos), mats.metal, false);
    } else if (d.t === "pasto" || d.t === "cactus") {
      const r = makeRng(d.seed), geos = [], cactus = d.t === "cactus";
      for (let i = 0; i < d.n; i++) {
        const x = r.uniform(-d.area, d.area), y = r.uniform(-d.area, d.area);
        if (cactus && Math.min(...M.gates.map((g) => Math.hypot(g[0] - x, g[1] - y))) < 14) continue;
        const h = cactus ? r.uniform(1.2, 2.6) : r.uniform(0.25, 0.6);
        if (cactus) {
          geos.push(new THREE.CylinderGeometry(0.16, 0.2, h, 7).translate(x, h / 2, -y).toNonIndexed());
          if (r() < 0.7) geos.push(new THREE.CylinderGeometry(0.1, 0.1, h * 0.4, 6).translate(x + 0.3, h * 0.6, -y).toNonIndexed());
        } else geos.push(new THREE.ConeGeometry(0.18, h, 5).translate(x, h / 2, -y).toNonIndexed());
      }
      add(mergeGeometries(geos), new THREE.MeshStandardMaterial({ color: cactus ? 0x3f6a34 : 0x58733a, roughness: 0.9 }), cactus);
    } else if (d.t === "rio") {
      const geos = [];
      for (let k = 0; k < d.eje.length - 1; k++) {
        const [x0, y0] = d.eje[k], [x1, y1] = d.eje[k + 1], L = Math.hypot(x1 - x0, y1 - y0);
        const g = new THREE.PlaneGeometry(L + 8, 9).rotateX(-Math.PI / 2).rotateY(Math.atan2(y1 - y0, x1 - x0)).translate((x0 + x1) / 2, 0.02, -(y0 + y1) / 2);
        geos.push(g.toNonIndexed());
      }
      const m = add(mergeGeometries(geos), new THREE.MeshStandardMaterial({ color: 0xb07c4c, roughness: 1 }), false);
      m.receiveShadow = true;
    } else if (d.t === "bandera") {
      add(new THREE.CylinderGeometry(0.04, 0.04, 4.5, 6).translate(d.p[0], 2.25, -d.p[1]), mats.andamio);
      add(new THREE.PlaneGeometry(0.7, 2.6).translate(d.p[0] + 0.35, 3.0, -d.p[1]), new THREE.MeshStandardMaterial({ color: 0xff2fa0, emissive: 0xff2fa0, emissiveIntensity: 0.7, side: THREE.DoubleSide }), false);
    } else if (d.t === "reflector") {
      add(new THREE.BoxGeometry(2.6, 1.4, 0.6).translate(d.p[0], d.p[2], -d.p[1]), luz(0xeaf2ff, 3.0), false);
      const L = new THREE.PointLight(0xc8d8ff, 900, 140, 1.6);
      L.position.copy(V(d.p[0] * 0.9, d.p[1] * 0.9, d.p[2] - 2));
      grupo.add(L);
    } else if (d.t === "lineas") {
      const m = luz(0xffffff, 0.5), geos = [];
      geos.push(new THREE.PlaneGeometry(0.3, 64).rotateX(-Math.PI / 2).translate(0, 0.03, 0).toNonIndexed());
      geos.push(new THREE.RingGeometry(8.6, 8.9, 48).rotateX(-Math.PI / 2).translate(0, 0.03, 0).toNonIndexed());
      for (const s of [-1, 1]) geos.push(new THREE.PlaneGeometry(0.3, 64).rotateX(-Math.PI / 2).translate(s * 49.5, 0.03, 0).toNonIndexed());
      add(mergeGeometries(geos), m, false);
    }
  }
}

// ---------------- los portales ----------------
const COL = { sig: 0xff7a1a, luego: 0x3ccbff, otro: 0x8fa39a, hecho: 0x47f08a };
export class Portales {
  constructor(scene, gates, dirs, noche) {
    this.grupo = new THREE.Group();
    this.items = gates.map((g, i) => {
      const mat = new THREE.MeshStandardMaterial({ color: 0x15181c, emissive: COL.otro, emissiveIntensity: noche ? 1.6 : 0.9, roughness: 0.4 });
      const marco = new THREE.Group(), L = 2.6, T = 0.13;
      for (const [x, y, w, h] of [[0, L / 2, L + T, T], [0, -L / 2, L + T, T], [L / 2, 0, T, L], [-L / 2, 0, T, L]]) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, T), mat);
        b.position.set(x, y, 0);
        b.castShadow = true;
        marco.add(b);
      }
      marco.position.copy(V(...g));
      const d = V(...dirs[i]).normalize();                        // el marco mira hacia donde se pasa
      marco.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d);
      const num = numero(i + 1);
      num.position.set(0, L / 2 + 0.75, 0);
      marco.add(num);
      this.grupo.add(marco);
      return { marco, mat, num };
    });
    scene.add(this.grupo);
  }
  /** sig = el índice del portal que toca (-1 = ninguno: vuelo libre). */
  pintar(sig, n = this.items.length) {
    this.items.forEach((it, i) => {
      const c = sig < 0 ? COL.otro : i === sig ? COL.sig : i === (sig + 1) % n ? COL.luego : COL.otro;
      it.mat.emissive.setHex(c);
      it.marco.scale.setScalar(i === sig ? 1.0 : 0.96);
      it.num.visible = sig >= 0;
    });
  }
  destello(i) { const it = this.items[i]; if (it) { it.mat.emissive.setHex(COL.hecho); } }
  dispose(scene) { scene.remove(this.grupo); }
}
function numero(n) {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d");
  g.fillStyle = "rgba(10,16,14,.75)"; g.beginPath(); g.arc(32, 32, 28, 0, 7); g.fill();
  g.fillStyle = "#fff"; g.font = "700 34px Chakra Petch, system-ui"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(String(n), 32, 34);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthWrite: false }));
  s.scale.set(0.9, 0.9, 1);
  return s;
}

/** El minimapa: el fondo (lo que choca, visto desde arriba) se dibuja una vez. */
export function fondoMinimapa(M, W) {
  const c = document.createElement("canvas"); c.width = c.height = W;
  const g = c.getContext("2d"), B = M.bounds.xy, k = W / (2 * B), X = (x) => W / 2 + x * k, Y = (y) => W / 2 - y * k;
  g.fillStyle = "rgba(10,16,14,.8)"; g.fillRect(0, 0, W, W);
  g.fillStyle = "rgba(234,242,239,.32)";
  for (const b of M.boxes) g.fillRect(X(b.min[0]), Y(b.max[1]), Math.max(1, (b.max[0] - b.min[0]) * k), Math.max(1, (b.max[1] - b.min[1]) * k));
  for (const s of [...M.cyls, ...M.sphs]) { g.beginPath(); g.arc(X(s.c[0]), Y(s.c[1]), Math.max(1, s.r * k), 0, 7); g.fill(); }
  g.strokeStyle = "rgba(255,122,26,.45)"; g.lineWidth = 1.5; g.beginPath();
  M.gates.forEach((p, i) => (i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1]))));
  g.closePath(); g.stroke();
  return { c, X, Y };
}
