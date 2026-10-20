// =====================================================================
// CÓMO SE VEN LOS MAPAS DEL FREESTYLE (los datos están en freestyle_mapas.js): texturas dibujadas en un canvas
// (ladrillo, concreto, roca en capas, contenedores, público…) con relieve (bumpMap), las piezas unidas por material
// (pocas llamadas de dibujo) con "oclusión" pintada en los vértices (más oscuro abajo), el cielo (degradé, sol, nubes,
// estrellas y luna), un mapa de entorno sacado del cielo (los metales y el agua lo reflejan), la niebla, la luz y todo
// lo que solo se dibuja (deco): rayos de sol por el techo roto, humo, agua del río, globos, águilas, público, pantallas…
// Lo que se repite va en InstancedMesh (matas, barriles de la línea de carrera). Lo que se mueve: actualizar(dt).
// Ejes: la simulación es Z arriba; Three.js es Y arriba (V de game/scene.js hace el cambio).
// =====================================================================
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { V } from "../game/scene.js";
import { makeRng } from "../game/sim.js";

// ---------------- ruido (para el relieve de las rocas y el color del piso) ----------------
const hash3 = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };
function ruido3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const L = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash3(xi + dx, yi + dy, zi + dz);
  return L(L(L(c(0, 0, 0), c(1, 0, 0), u), L(c(0, 1, 0), c(1, 1, 0), u), v), L(L(c(0, 0, 1), c(1, 0, 1), u), L(c(0, 1, 1), c(1, 1, 1), u), v), w);
}
const fbm = (x, y, z, o = 4) => { let s = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { s += a * ruido3(x * f, y * f, z * f); a *= 0.5; f *= 2.03; } return s; };

// ---------------- texturas ----------------
function lienzo(w, h, pintar, color = true) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  pintar(c.getContext("2d"), w, h);
  const tx = new THREE.CanvasTexture(c);
  tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
  if (color) tx.colorSpace = THREE.SRGBColorSpace;
  tx.anisotropy = 8;
  return tx;
}
function ruido(g, w, h, cols, n, rmin, rmax, seed, amin = 0.15, amax = 0.5) {
  const r = makeRng(seed);
  for (let i = 0; i < n; i++) {
    g.fillStyle = cols[Math.floor(r() * cols.length)];
    g.globalAlpha = amin + r() * (amax - amin);
    const s = rmin + r() * (rmax - rmin);
    g.fillRect(r() * w, r() * h, s, s);
  }
  g.globalAlpha = 1;
}
/** Manchas suaves (mugre, óxido, humedad). */
function manchas(g, w, h, col, n, rmin, rmax, seed, alfa = 0.25) {
  const r = makeRng(seed);
  for (let i = 0; i < n; i++) {
    const x = r() * w, y = r() * h, rad = rmin + r() * (rmax - rmin);
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, col.replace("A", String(alfa * (0.5 + r() * 0.5)))); gr.addColorStop(1, col.replace("A", "0"));
    g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
}
/** Chorreado vertical (lluvia, óxido que cae). */
function chorreado(g, w, h, col, n, seed) {
  const r = makeRng(seed);
  for (let i = 0; i < n; i++) {
    const x = r() * w, y0 = r() * h * 0.6, L = h * (0.15 + r() * 0.5), a = 0.05 + r() * 0.12;
    const gr = g.createLinearGradient(0, y0, 0, y0 + L); gr.addColorStop(0, col.replace("A", String(a))); gr.addColorStop(1, col.replace("A", "0"));
    g.fillStyle = gr; g.fillRect(x, y0, 1 + r() * 4, L);
  }
}
const TEX = {
  ladrillo: () => lienzo(512, 512, (g, w, h) => {
    g.fillStyle = "#6b5a4e"; g.fillRect(0, 0, w, h);
    const r = makeRng(5);
    for (let y = 0; y < h; y += 32) for (let x = -64; x < w; x += 64) {
      const o = (y / 32) % 2 ? 32 : 0, k = r(), q = r() < 0.08 ? 0.6 : 1;
      g.fillStyle = `rgb(${(128 + k * 52) * q | 0},${(58 + k * 26) * q | 0},${(42 + k * 18) * q | 0})`;
      g.fillRect(x + o + 2, y + 2, 60, 28);
      g.fillStyle = "rgba(255,220,190,.07)"; g.fillRect(x + o + 2, y + 2, 60, 4);
    }
    ruido(g, w, h, ["#2a1d17", "#000", "#8a7a6a"], 900, 1, 4, 6, 0.08, 0.3);
    manchas(g, w, h, "rgba(20,14,10,A)", 14, 30, 110, 7, 0.2);
    chorreado(g, w, h, "rgba(15,10,8,A)", 40, 8);
  }),
  concreto: () => lienzo(512, 512, (g, w, h) => {
    g.fillStyle = "#93918a"; g.fillRect(0, 0, w, h);
    ruido(g, w, h, ["#77756e", "#a8a69e", "#5d5b56"], 6000, 1, 7, 7);
    manchas(g, w, h, "rgba(40,45,35,A)", 18, 30, 120, 8, 0.3);
    chorreado(g, w, h, "rgba(30,30,28,A)", 50, 9);
    g.strokeStyle = "rgba(40,40,40,.35)"; g.lineWidth = 3; g.strokeRect(0, 0, w, h); g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
    g.fillStyle = "rgba(30,30,30,.4)"; for (const [x, y] of [[64, 64], [448, 64], [64, 320], [448, 320]]) { g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); }
  }),
  techo: () => lienzo(256, 256, (g, w, h) => {
    for (let x = 0; x < w; x += 4) { const s = Math.sin((x / 16) * Math.PI); g.fillStyle = `rgb(${110 + s * 25 | 0},${116 + s * 25 | 0},${120 + s * 25 | 0})`; g.fillRect(x, 0, 4, h); }
    manchas(g, w, h, "rgba(120,60,25,A)", 22, 10, 50, 8, 0.55);
    chorreado(g, w, h, "rgba(90,45,20,A)", 30, 9);
  }),
  metal: () => lienzo(256, 256, (g, w, h) => { g.fillStyle = "#4a4f55"; g.fillRect(0, 0, w, h); ruido(g, w, h, ["#33373b", "#62686e"], 900, 1, 4, 9); for (let y = 0; y < h; y += 2) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.03})`; g.fillRect(0, y, w, 1); } }),
  oxido: () => lienzo(256, 256, (g, w, h) => { g.fillStyle = "#7a4426"; g.fillRect(0, 0, w, h); ruido(g, w, h, ["#a35a2a", "#4a2a1a", "#c27a3a"], 2600, 1, 7, 10); manchas(g, w, h, "rgba(40,20,10,A)", 14, 10, 50, 11, 0.5); }),
  maquina: () => lienzo(256, 256, (g, w, h) => {
    g.fillStyle = "#d9a520"; g.fillRect(0, 0, w, h);
    g.save(); g.beginPath(); g.rect(0, 0, w, 40); g.clip();
    for (let x = -60; x < w + 60; x += 40) { g.fillStyle = "#151515"; g.beginPath(); g.moveTo(x, 40); g.lineTo(x + 20, 40); g.lineTo(x + 60, 0); g.lineTo(x + 40, 0); g.fill(); }
    g.restore();
    manchas(g, w, h, "rgba(40,30,15,A)", 16, 10, 60, 12, 0.5);
    ruido(g, w, h, ["#6b4a1a", "#2a2a2a"], 500, 1, 6, 13);
  }),
  reja: () => lienzo(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.fillStyle = "#3d4247";
    for (let x = 0; x < w; x += 16) g.fillRect(x, 0, 4, h);
    for (let y = 0; y < h; y += 16) g.fillRect(0, y, w, 3);
  }),
  tubo: () => lienzo(256, 128, (g, w, h) => {
    g.fillStyle = "#5c7262"; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 64) { g.fillStyle = "#2d3a31"; g.fillRect(x, 0, 6, h); }
    manchas(g, w, h, "rgba(120,60,20,A)", 12, 8, 30, 14, 0.5);
  }),
  barril: () => lienzo(128, 128, (g, w, h) => {
    g.fillStyle = "#1f4f8a"; g.fillRect(0, 0, w, h);
    for (const y of [20, 64, 108]) { g.fillStyle = "#163a66"; g.fillRect(0, y - 4, w, 8); }
    manchas(g, w, h, "rgba(130,70,30,A)", 10, 6, 24, 15, 0.6);
  }),
  camion: () => lienzo(128, 128, (g, w, h) => {
    g.fillStyle = "#b8452e"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#1d2a33"; g.fillRect(10, 12, 108, 44);
    manchas(g, w, h, "rgba(60,30,15,A)", 10, 8, 30, 16, 0.5);
  }),
  estante: () => lienzo(256, 256, (g, w, h) => {
    g.fillStyle = "#2b3a8c"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#e07a1a"; for (let y = 0; y < h; y += 64) g.fillRect(0, y, w, 10);
    const r = makeRng(17);
    for (let y = 14; y < h; y += 64) for (let x = 8; x < w; x += 58) { g.fillStyle = r() < 0.5 ? "#8a6a44" : "#a07a50"; g.fillRect(x, y + r() * 6, 50, 40); g.fillStyle = "rgba(0,0,0,.2)"; g.fillRect(x, y + 20, 50, 2); }
  }),
  cont: (col, seed) => () => lienzo(256, 256, (g, w, h) => {
    g.fillStyle = col; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 16) { g.fillStyle = "rgba(0,0,0,.2)"; g.fillRect(x, 0, 5, h); g.fillStyle = "rgba(255,255,255,.06)"; g.fillRect(x + 7, 0, 3, h); }
    manchas(g, w, h, "rgba(110,55,20,A)", 18, 6, 40, seed, 0.6);
    chorreado(g, w, h, "rgba(90,45,20,A)", 25, seed + 1);
  }),
  silo: () => lienzo(256, 256, (g, w, h) => {
    g.fillStyle = "#c2c1ba"; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 32) { g.fillStyle = "rgba(0,0,0,.12)"; g.fillRect(0, y, w, 3); }
    for (let x = 0; x < w; x += 64) { g.fillStyle = "rgba(0,0,0,.08)"; g.fillRect(x, 0, 2, h); }
    chorreado(g, w, h, "rgba(110,60,25,A)", 60, 18);
  }),
  escombro: () => lienzo(128, 128, (g, w, h) => { g.fillStyle = "#6b655c"; g.fillRect(0, 0, w, h); ruido(g, w, h, ["#4a453e", "#8a8378"], 800, 1, 6, 13); }),
  roca: (a, b, seed) => () => lienzo(512, 1024, (g, w, h) => {      // arenisca: capas anchas y suaves, grietas y chorreado
    const r = makeRng(seed), ca = new THREE.Color(a), cb = new THREE.Color(b), c = new THREE.Color();
    for (let y = 0; y < h;) {
      const s = 14 + r() * 70; c.copy(ca).lerp(cb, r()).multiplyScalar(0.9 + r() * 0.2);
      const gr = g.createLinearGradient(0, y, 0, y + s);
      gr.addColorStop(0, `#${c.getHexString()}`); gr.addColorStop(1, `#${c.clone().multiplyScalar(0.88).getHexString()}`);
      g.fillStyle = gr; g.fillRect(0, y, w, s + 1); y += s;
      if (r() < 0.3) { g.fillStyle = "rgba(70,30,14,.22)"; g.fillRect(0, y - 2, w, 2 + r() * 3); }
    }
    ruido(g, w, h, ["#5a2a14", "#f0c08a", "#7a3a1e"], 9000, 1, 6, seed + 1, 0.1, 0.35);
    manchas(g, w, h, "rgba(60,25,10,A)", 30, 30, 120, seed + 3, 0.3);
    chorreado(g, w, h, "rgba(40,18,10,A)", 140, seed + 2);
    g.strokeStyle = "rgba(50,20,10,.45)"; g.lineWidth = 2;
    for (let i = 0; i < 18; i++) { let x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 18; y += 10 + r() * 30; g.lineTo(x, y); } g.stroke(); }
  }),
  madera: () => lienzo(256, 256, (g, w, h) => {
    const r = makeRng(19);
    for (let y = 0; y < h; y += 32) { const k = r(); g.fillStyle = `rgb(${92 + k * 30 | 0},${64 + k * 20 | 0},${40 + k * 12 | 0})`; g.fillRect(0, y, w, 30); g.fillStyle = "rgba(0,0,0,.4)"; g.fillRect(0, y + 30, w, 2); }
    for (let i = 0; i < 160; i++) { g.strokeStyle = "rgba(40,25,15,.25)"; g.beginPath(); const y = r() * h; g.moveTo(0, y); g.bezierCurveTo(w / 3, y + r() * 6 - 3, (2 * w) / 3, y + r() * 6 - 3, w, y); g.stroke(); }
  }),
  tribuna: () => lienzo(512, 256, (g, w, h) => {
    g.fillStyle = "#121722"; g.fillRect(0, 0, w, h);
    const r = makeRng(16), ropa = ["#d23a4a", "#2a62d0", "#e8e8e8", "#f2c230", "#1fb07a", "#ff7a1a", "#7a4ad0", "#222"];
    for (let y = 0; y < h; y += 32) {
      g.fillStyle = "#1b2233"; g.fillRect(0, y + 22, w, 10);                                  // el escalón
      for (let x = 2; x < w; x += 12) {
        if (r() < 0.12) continue;                                                             // asiento vacío
        const dx = x + r() * 3, c = ropa[Math.floor(r() * ropa.length)];
        g.fillStyle = c; g.fillRect(dx, y + 12, 9, 12);                                     // el cuerpo
        g.fillStyle = ["#e0b08a", "#a0704a", "#6a4a32", "#f0c8a0"][Math.floor(r() * 4)];
        g.beginPath(); g.arc(dx + 4.5, y + 8, 3.6, 0, 7); g.fill();                          // la cabeza
        if (r() < 0.12) { g.fillStyle = c; g.fillRect(dx + 7, y - 2, 2.5, 10); }             // un brazo arriba
      }
    }
  }),
  panel: () => lienzo(256, 256, (g, w, h) => {
    g.fillStyle = "#0e121a"; g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(255,255,255,.06)"; g.lineWidth = 2; for (let x = 0; x < w; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    ruido(g, w, h, ["#1a2030", "#060810"], 600, 1, 4, 20);
  }),
  panelLuz: () => lienzo(256, 256, (g, w, h) => {
    g.fillStyle = "#000"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#2fd0ff"; g.fillRect(0, 8, w, 3); g.fillStyle = "#ff2fa0"; g.fillRect(0, h - 11, w, 3);
  }),
  valla: () => lienzo(256, 64, (g, w, h) => {
    g.fillStyle = "#111"; g.fillRect(0, 0, w, h);
    for (let x = -32; x < w + 32; x += 32) { g.fillStyle = "#ffe14a"; g.beginPath(); g.moveTo(x, h); g.lineTo(x + 14, h); g.lineTo(x + 30, 0); g.lineTo(x + 16, 0); g.fill(); }
  }),
  techo_est: () => lienzo(256, 256, (g, w, h) => {
    g.fillStyle = "#2a2f38"; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 32) { g.fillStyle = "#1c2028"; g.fillRect(x, 0, 6, h); }
  }),
  asfalto: () => lienzo(512, 512, (g, w, h) => {
    g.fillStyle = "#575a5d"; g.fillRect(0, 0, w, h);
    ruido(g, w, h, ["#2e3133", "#5a5d60", "#4e5a3e", "#6a6a66"], 12000, 1, 4, 17);
    manchas(g, w, h, "rgba(15,15,18,A)", 10, 20, 70, 21, 0.4);
    g.strokeStyle = "rgba(15,15,15,.7)"; g.lineWidth = 1.6;
    const r = makeRng(18);
    for (let i = 0; i < 12; i++) { g.beginPath(); let x = r() * w, y = r() * h; g.moveTo(x, y); for (let k = 0; k < 8; k++) { x += (r() - 0.5) * 70; y += (r() - 0.5) * 70; g.lineTo(x, y); } g.stroke(); }
  }),
  arena: () => lienzo(512, 512, (g, w, h) => {
    g.fillStyle = "#c98f5a"; g.fillRect(0, 0, w, h);
    ruido(g, w, h, ["#b07a48", "#dfa772", "#9a6a3e", "#e8b98a"], 14000, 1, 3, 19);
    g.strokeStyle = "rgba(120,72,40,.18)"; g.lineWidth = 3;
    for (let y = 0; y < h; y += 18) { g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= w; x += 16) g.lineTo(x, y + Math.sin((x / w) * Math.PI * 4 + y * 0.3) * 6); g.stroke(); }
  }),
  pasto: () => lienzo(512, 512, (g, w, h) => {
    for (let y = 0; y < h; y += 128) { g.fillStyle = (y / 128) % 2 ? "#1f4d27" : "#276031"; g.fillRect(0, y, w, 128); }
    ruido(g, w, h, ["#163a1c", "#2e6a38", "#3a7a42"], 14000, 1, 3, 20);
  }),
  agua: () => lienzo(256, 256, (g, w, h) => {                        // un mapa de normales hecho de ondas
    const im = g.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const f = (u, v) => Math.sin(u * 0.098 + Math.sin(v * 0.05) * 2) + Math.sin(v * 0.123 + u * 0.03) * 0.7 + Math.sin((u + v) * 0.21) * 0.3;
      const dx = f(x + 1, y) - f(x - 1, y), dy = f(x, y + 1) - f(x, y - 1), i = (y * w + x) * 4;
      im.data[i] = 128 + dx * 60; im.data[i + 1] = 128 + dy * 60; im.data[i + 2] = 255; im.data[i + 3] = 255;
    }
    g.putImageData(im, 0, 0);
  }, false),
};

// ---------------- materiales ----------------
function materiales(noche, env) {
  const std = (map, { bump = true, ...o } = {}) => new THREE.MeshStandardMaterial({ map, bumpMap: bump ? map : null, bumpScale: o.bumpScale ?? 1.2, roughness: 0.85, vertexColors: true, envMapIntensity: env, ...o });
  const neon = (c, i = 1) => new THREE.MeshStandardMaterial({ color: 0x0a0f18, emissive: c, emissiveIntensity: (noche ? 1.6 : 1.0) * i, roughness: 0.4, vertexColors: true });
  const M = {
    ladrillo: std(TEX.ladrillo(), { bumpScale: 2.5 }), concreto: std(TEX.concreto(), { bumpScale: 1.5 }),
    techo: std(TEX.techo(), { metalness: 0.55, roughness: 0.55, side: THREE.DoubleSide }),
    metal: std(TEX.metal(), { metalness: 0.75, roughness: 0.4 }), oxido: std(TEX.oxido(), { metalness: 0.35, bumpScale: 2 }),
    maquina: std(TEX.maquina(), { metalness: 0.3, roughness: 0.55 }), estante: std(TEX.estante()),
    reja: std(TEX.reja(), { alphaTest: 0.5, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.5, bump: false }),
    tubo: std(TEX.tubo(), { metalness: 0.4, roughness: 0.5 }), barril: std(TEX.barril(), { metalness: 0.4, roughness: 0.45 }),
    camion: std(TEX.camion(), { metalness: 0.4, roughness: 0.5 }),
    cont_r: std(TEX.cont("#a1352a", 31)(), { metalness: 0.3, roughness: 0.6 }), cont_a: std(TEX.cont("#235f92", 33)(), { metalness: 0.3, roughness: 0.6 }),
    cont_v: std(TEX.cont("#33703f", 35)(), { metalness: 0.3, roughness: 0.6 }),
    silo: std(TEX.silo(), { metalness: 0.45, roughness: 0.5 }), escombro: std(TEX.escombro(), { bumpScale: 3 }),
    roca: std(TEX.roca("#b5623a", "#c9784a", 14)(), { roughness: 0.95, bumpScale: 4 }), roca2: std(TEX.roca("#a0502e", "#d38a58", 24)(), { roughness: 0.95, bumpScale: 4 }),
    mesa: std(TEX.roca("#8e4528", "#b4643c", 34)(), { roughness: 0.95, bumpScale: 4 }),
    madera: std(TEX.madera(), { roughness: 0.8, bumpScale: 2 }),
    tribuna: std(TEX.tribuna(), { bump: false, roughness: 0.9 }), andamio: new THREE.MeshStandardMaterial({ color: 0x9aa3ad, metalness: 0.85, roughness: 0.3, vertexColors: true, envMapIntensity: env }),
    panel: std(TEX.panel(), { metalness: 0.6, roughness: 0.35, emissive: 0xffffff, emissiveMap: TEX.panelLuz(), emissiveIntensity: noche ? 0.9 : 0.4, bump: false }),
    techo_est: std(TEX.techo_est(), { metalness: 0.7, roughness: 0.4, bump: false, side: THREE.DoubleSide }),
    neon_azul: neon(0x2fd0ff), tunel: neon(0xff2fa0),
    valla: std(TEX.valla(), { emissive: 0xffffff, emissiveMap: TEX.valla(), emissiveIntensity: noche ? 0.7 : 0.2, bump: false }),
  };
  return M;
}

// ---------------- geometrías (con UV a escala del mundo y color por vértice = la sombra de abajo) ----------------
const TILE = 4;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** El color de cada vértice: más oscuro cerca del piso (oclusión) y, en la roca, más claro arriba (quemada por el sol). */
function colorear(g, m) {
  const p = g.attributes.position, n = p.count, c = new Float32Array(n * 3), roca = ROCOSO.has(m);
  for (let i = 0; i < n; i++) {
    const y = p.getY(i), x = p.getX(i), z = p.getZ(i);
    let k = 0.5 + 0.5 * smooth(0, roca ? 6 : 2.4, y);
    let r = k, gg = k, b = k;
    if (roca) {
      const v = 0.85 + 0.3 * fbm(x * 0.08, y * 0.05, z * 0.08, 3);
      const sol = smooth(8, 30, y) * 0.18;
      r = k * v + sol; gg = k * v * 0.97 + sol * 0.8; b = k * v * 0.92 + sol * 0.6;
    }
    c[i * 3] = r; c[i * 3 + 1] = gg; c[i * 3 + 2] = b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(c, 3));
  return g;
}
function cajaGeo(b, uvMundo = true) {
  const sx = b.max[0] - b.min[0], sy = b.max[2] - b.min[2], sz = b.max[1] - b.min[1];      // three: x, y=arriba, z
  let g;
  if (b.forma === "tubo") {                                     // un tubo acostado a lo largo del lado más largo
    const largo = Math.max(sx, sz), r = Math.min(sy, sx < sz ? sx : sz) / 2;
    g = new THREE.CylinderGeometry(r, r, largo, 14, 1, false);
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (2 * Math.PI * r) / TILE, uv.getY(i) * largo / TILE);
    if (sx >= sz) g.rotateZ(Math.PI / 2); else g.rotateX(Math.PI / 2);
  } else {
    g = new THREE.BoxGeometry(sx, sy, sz);
    const uv = g.attributes.uv, esc = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]];
    if (uvMundo) for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * esc[f][0] / TILE, uv.getY(i) * esc[f][1] / TILE); }
  }
  g.translate((b.min[0] + b.max[0]) / 2, (b.min[2] + b.max[2]) / 2, -(b.min[1] + b.max[1]) / 2);
  return g;
}
function cilGeo(c, rugoso, seed) {
  const h = c.z[1] - c.z[0], seg = rugoso ? 20 : Math.max(16, Math.round(c.r * 6));
  const g = new THREE.CylinderGeometry(c.r, c.r, h, seg, rugoso ? Math.max(3, Math.round(h / 2.2)) : 1);
  if (rugoso) {                                                  // roca: relieve con ruido (entre 0,9 y 1,04 del radio)
    const p = g.attributes.position, o = seed * 13.7;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), d = Math.hypot(x, z);
      if (d < 1e-6) { if (y > 0) p.setY(i, y + (fbm(o, 1, o, 2) - 0.5) * 1.2); continue; }
      const a = Math.atan2(z, x), nx = Math.cos(a) * 2.2, nz = Math.sin(a) * 2.2;
      const f = 0.9 + 0.14 * fbm(nx + o, (y + h / 2) * 0.22, nz + o, 4);
      const tope = y > h / 2 - 0.01 ? (fbm(nx * 2 + o, 3, nz * 2) - 0.5) * 1.4 : 0;   // el borde de arriba, irregular
      p.setXYZ(i, x * f, y + tope, z * f);
    }
    g.computeVertexNormals();
  }
  const uv = g.attributes.uv, tile = rugoso ? 14 : TILE;          // la roca: una textura cada 14 m (las capas no se ven repetidas)
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (2 * Math.PI * c.r) / tile, uv.getY(i) * h / tile);
  g.translate(c.c[0], (c.z[0] + c.z[1]) / 2, -c.c[1]);
  return g;
}
function esfGeo(s, seed) {
  const g = new THREE.SphereGeometry(s.r, 16, 12);
  const p = g.attributes.position, o = seed * 7.1;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const f = 0.86 + 0.16 * fbm(x * 0.7 + o, y * 0.7, z * 0.7 + o, 3); p.setXYZ(i, x * f, y * f * 0.8, z * f); }
  g.computeVertexNormals();
  g.translate(s.c[0], s.c[2], -s.c[1]);
  return g;
}
const ROCOSO = new Set(["roca", "roca2", "mesa", "escombro"]);

// ---------------- el cielo: degradé, sol, nubes, estrellas y luna (un shader) ----------------
function hacerCielo(A) {
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { cenit: { value: new THREE.Color(A.cenit ?? A.cielo[0]) }, top: { value: new THREE.Color(A.cielo[0]) }, horizon: { value: new THREE.Color(A.cielo[1]) },
      sunDir: { value: new THREE.Vector3(...A.sol).normalize() }, sunCol: { value: new THREE.Color(A.solColor) }, nubes: { value: A.nubes ?? 0.4 },
      noche: { value: A.noche ? 1 : 0 }, tiempo: { value: 0 } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 cenit; uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunCol; uniform float nubes; uniform float noche; uniform float tiempo;
      varying vec3 vDir;
      float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<5;i++){ s+=a*n2(p); p*=2.03; a*=0.5; } return s; }
      void main(){
        vec3 d = normalize(vDir); float h = clamp(d.y, 0.0, 1.0);
        vec3 c = mix(horizon, top, pow(h, 0.45)); c = mix(c, cenit, smoothstep(0.35, 1.0, h));
        float s = max(dot(d, sunDir), 0.0);
        if (noche < 0.5) {
          c += sunCol * (pow(s, 900.0) * 6.0 + pow(s, 60.0) * 0.45 + pow(s, 6.0) * 0.18 * (1.0 - h));
        } else {                                                   // la luna y las estrellas
          c += vec3(0.9,0.95,1.0) * smoothstep(0.9993, 0.9996, s) * 1.6 + vec3(0.4,0.5,0.8) * pow(s, 40.0) * 0.25;
          vec2 q = d.xz / (d.y + 0.25) * 90.0; vec2 ci = floor(q); float st = h21(ci);
          float tw = 0.6 + 0.4 * sin(tiempo * (1.0 + st * 3.0) + st * 40.0);
          c += vec3(1.0) * step(0.985, st) * smoothstep(0.35, 0.0, length(fract(q) - 0.5)) * tw * smoothstep(0.02, 0.25, h) * 1.4;
        }
        if (nubes > 0.0 && d.y > 0.0) {                            // nubes: un plano lejano con ruido
          vec2 uv = d.xz / (d.y + 0.12) * 1.6 + vec2(tiempo * 0.004, tiempo * 0.002);
          float n = fbm(uv); float k = smoothstep(0.62 - nubes * 0.25, 0.95, n) * smoothstep(0.0, 0.18, d.y);
          vec3 nc = noche > 0.5 ? vec3(0.10,0.13,0.22) : mix(vec3(1.0), sunCol, 0.35 + 0.4 * (1.0 - h)) * (0.75 + 0.5 * pow(s, 4.0));
          float sombra = noche > 0.5 ? 1.0 : 0.75 + 0.25 * smoothstep(0.4, 0.9, fbm(uv + 0.15));
          c = mix(c, nc * sombra, k * 0.85);
        }
        if (d.y < 0.0) c = horizon * (0.85 + 0.15 * smoothstep(-0.2, 0.0, d.y));
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 48, 24), m);
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  return sky;
}

// ---------------- el mapa entero ----------------
/**
 * Arma el mapa en la escena. renderer (opcional) = para sacar el mapa de entorno del cielo (reflejos).
 * Devuelve { grupo, sol, solOff, actualizar(dt, t, info), pantalla(lineas), largada(estado), dispose }.
 */
export function construirMapa(scene, M, calidad = "media", renderer = null) {
  const A = M.ambiente, grupo = new THREE.Group();
  const ENV = A.noche ? 0.35 : 0.8;
  const mats = materiales(A.noche, ENV);
  const anim = [];                                             // lo que se mueve: f(dt, t, info)
  // piezas unidas por material
  const porMat = {};
  const add = (m, g) => (porMat[m] ||= []).push(colorear(g.index ? g.toNonIndexed() : g, m));
  M.boxes.forEach((b) => { if (b.m !== "pantalla") add(b.m, cajaGeo(b)); });
  M.cyls.forEach((c, i) => add(c.m, cilGeo(c, ROCOSO.has(c.m), 100 + i)));
  M.sphs.forEach((s, i) => add(s.m, esfGeo(s, 300 + i)));
  for (const [m, geos] of Object.entries(porMat)) {
    const mesh = new THREE.Mesh(mergeGeometries(geos), mats[m] || mats.concreto);
    mesh.castShadow = m !== "reja" && m !== "techo_est"; mesh.receiveShadow = true;
    grupo.add(mesh);
  }
  // el piso: la textura de cerca + un color que cambia de a poco (para que no se note que se repite)
  const tx = TEX[A.suelo]();
  tx.repeat.set(160, 160);
  const pg = new THREE.PlaneGeometry(720, 720, 96, 96);
  {
    const p = pg.attributes.position, c = new Float32Array(p.count * 3), base = { asfalto: [1, 1, 1], arena: [1, 0.97, 0.93], pasto: [1, 1, 1] }[A.suelo];
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), v = 0.78 + 0.4 * fbm(x * 0.018, y * 0.018, 3.3, 4);
      c[i * 3] = v * base[0]; c[i * 3 + 1] = v * base[1]; c[i * 3 + 2] = v * base[2];
    }
    pg.setAttribute("color", new THREE.BufferAttribute(c, 3));
  }
  const piso = new THREE.Mesh(pg, new THREE.MeshStandardMaterial({ map: tx, roughness: A.suelo === "asfalto" ? 0.82 : 0.95, vertexColors: true, bumpMap: tx, bumpScale: 1, envMapIntensity: ENV * 0.6 }));
  piso.rotation.x = -Math.PI / 2;
  piso.receiveShadow = true;
  grupo.add(piso);
  // el cielo, la niebla y la luz
  const sky = hacerCielo(A);
  grupo.add(sky);
  anim.push((dt, t) => { sky.material.uniforms.tiempo.value = t; });
  scene.fog = new THREE.FogExp2(A.bruma ?? A.cielo[1], A.niebla);
  scene.background = new THREE.Color(A.cielo[1]);
  if (renderer) {                                               // el mapa de entorno: el mismo cielo, borroso
    try {
      const pm = new THREE.PMREMGenerator(renderer), es = new THREE.Scene(), cs = hacerCielo(A);
      cs.material.uniforms.nubes.value = 0; cs.scale.setScalar(0.1); es.add(cs);
      if (!A.noche) { const suelo = new THREE.Mesh(new THREE.CircleGeometry(400, 24).rotateX(-Math.PI / 2).translate(0, -2, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(A.cielo[1]).multiplyScalar(0.45) })); es.add(suelo); }
      const rt = pm.fromScene(es, 0.04, 0.1, 1000);
      scene.environment = rt.texture;
      pm.dispose();
      grupo.userData.env = rt;
    } catch { /* sin reflejos */ }
  }
  const hemi = new THREE.HemisphereLight(A.noche ? 0x5a6a9a : 0xd6e2ef, A.noche ? 0x101820 : 0x6a5a48, A.noche ? 0.45 : 0.75 * A.luz);
  const sol = new THREE.DirectionalLight(A.solColor, A.noche ? 0.7 : 2.9 * A.luz);
  sol.castShadow = calidad !== "baja";
  const sz = calidad === "alta" ? 4096 : calidad === "baja" ? 1024 : 2048;
  sol.shadow.mapSize.set(sz, sz);
  Object.assign(sol.shadow.camera, { left: -48, right: 48, top: 48, bottom: -48, near: 1, far: 300 });
  sol.shadow.bias = -0.0004; sol.shadow.normalBias = 0.05;
  grupo.add(hemi, sol, sol.target);
  const solOff = new THREE.Vector3(...A.sol).normalize().multiplyScalar(140);
  if (solOff.y < 30) solOff.y = 30;                              // con el sol muy bajo, las sombras no se estiran al infinito
  const extra = deco(grupo, M, mats, anim, calidad);
  scene.add(grupo);
  const reloj = { t: 0 };
  return {
    grupo, sol, solOff, ...extra,
    actualizar(dt, info = {}) { reloj.t += dt; for (const f of anim) f(dt, reloj.t, info); },
    dispose: () => {
      scene.remove(grupo); scene.environment = null;
      grupo.traverse((o) => { o.geometry?.dispose(); });
      grupo.userData.env?.dispose();
    },
  };
}

// ---------------- lo que solo se dibuja ----------------
const SUAVE = (() => {                                          // un círculo suave (humo, destellos, polvo)
  let tx = null;
  return () => tx || (tx = lienzo(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.4, "rgba(255,255,255,.5)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }));
})();
function texto(txt, sub, estilo, w = 1024, h = 160) {
  return lienzo(w, h, (g) => {
    const E = {
      pintado: { bg: null, fg: "rgba(236,230,214,.82)", font: "800 104px Chakra Petch, system-ui" },
      amarillo: { bg: "#f2c230", fg: "#111", font: "800 92px Chakra Petch, system-ui", borde: "#111" },
      silo: { bg: null, fg: "rgba(30,40,60,.85)", font: "800 120px Chakra Petch, system-ui" },
      madera: { bg: "#6a4a2c", fg: "#f0e2c0", font: "700 84px Georgia, serif", borde: "#3a2614" },
      neon: { bg: "#05070d", fg: "#2fd0ff", font: "800 96px Chakra Petch, system-ui" },
    }[estilo] || {};
    if (E.bg) { g.fillStyle = E.bg; g.fillRect(0, 0, w, h); }
    if (E.borde) { g.strokeStyle = E.borde; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10); }
    g.fillStyle = E.fg; g.font = E.font; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(txt, w / 2, sub ? h * 0.42 : h / 2, w - 30);
    if (sub) { g.font = "600 44px Chakra Petch, system-ui"; g.fillText(sub, w / 2, h * 0.82); }
    if (estilo === "pintado") { g.globalCompositeOperation = "destination-out"; ruido(g, w, h, ["#000"], 2600, 2, 9, 77, 0.2, 0.7); g.globalCompositeOperation = "source-over"; }
  });
}
const CARA = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 };

function deco(grupo, M, mats, anim, calidad) {
  const A = M.ambiente;
  const add = (g, m, sombra = true) => {
    if (m.vertexColors && !g.attributes.color) colorear(g, "");     // los materiales del mapa usan el color de los vértices
    const x = new THREE.Mesh(g, m); x.castShadow = sombra; x.receiveShadow = true; grupo.add(x); return x;
  };
  const luz = (c, i) => new THREE.MeshStandardMaterial({ color: 0x111111, emissive: c, emissiveIntensity: i });
  const out = {};
  const solDir = new THREE.Vector3(...A.sol).normalize();
  for (const d of M.deco) {
    if (d.t === "poste") {
      add(new THREE.CylinderGeometry(0.09, 0.13, d.h, 8).translate(d.p[0], d.h / 2, -d.p[1]), mats.metal);
      add(new THREE.BoxGeometry(1.0, 0.18, 0.35).translate(d.p[0] + 0.4, d.h, -d.p[1]), luz(0xfff0c8, A.noche ? 3 : 0.6), false);
    } else if (d.t === "reja") {
      const geos = [];
      for (let k = -d.r; k <= d.r; k += 4) for (const [x, y] of [[k, -d.r], [k, d.r], [-d.r, k], [d.r, k]]) geos.push(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 5).translate(x, 1.1, -y).toNonIndexed());
      for (const z of [0.4, 1.2, 2.0]) for (const s of [-1, 1]) {
        geos.push(new THREE.BoxGeometry(2 * d.r, 0.03, 0.03).translate(0, z, -s * d.r).toNonIndexed());
        geos.push(new THREE.BoxGeometry(0.03, 0.03, 2 * d.r).translate(s * d.r, z, 0).toNonIndexed());
      }
      add(mergeGeometries(geos), new THREE.MeshStandardMaterial({ color: 0x6a6e72, metalness: 0.7, roughness: 0.5 }), false);
    } else if (d.t === "pasto" || d.t === "cactus") {
      const r = makeRng(d.seed), cactus = d.t === "cactus";
      const base = cactus ? mergeGeometries([new THREE.CylinderGeometry(0.16, 0.2, 1, 8).translate(0, 0.5, 0).toNonIndexed(),
        new THREE.CylinderGeometry(0.09, 0.09, 0.35, 6).translate(0.28, 0.55, 0).toNonIndexed(), new THREE.CylinderGeometry(0.09, 0.09, 0.3, 6).translate(0.36, 0.72, 0).toNonIndexed(),
        new THREE.CylinderGeometry(0.08, 0.08, 0.28, 6).translate(-0.24, 0.45, 0).toNonIndexed()])
        : new THREE.ConeGeometry(0.16, 1, 4).translate(0, 0.5, 0);
      const mat = new THREE.MeshStandardMaterial({ color: cactus ? 0x4f7a3c : 0x6a7f3a, roughness: 0.9 });
      const im = new THREE.InstancedMesh(base, mat, d.n), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
      let k = 0;
      for (let i = 0; i < d.n; i++) {
        const x = r.uniform(-d.area, d.area), y = r.uniform(-d.area, d.area);
        if (cactus && Math.min(...M.gates.map((g) => Math.hypot(g[0] - x, g[1] - y))) < 14) continue;
        const h = cactus ? r.uniform(1.4, 3.2) : r.uniform(0.25, 0.7);
        e.set(0, r() * 6.3, 0); q.setFromEuler(e);
        m4.compose(new THREE.Vector3(x, 0, -y), q, new THREE.Vector3(h * (cactus ? 0.9 : 1), h, h * (cactus ? 0.9 : 1)));
        im.setMatrixAt(k++, m4);
      }
      im.count = k; im.castShadow = cactus; im.receiveShadow = true;
      grupo.add(im);
    } else if (d.t === "matas") {                                // matas secas: icosaedros aplastados, de a cientos
      const r = makeRng(d.seed), im = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.5, 0), new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), d.n);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
      for (let i = 0; i < d.n; i++) {
        const x = r.uniform(-d.area, d.area), y = r.uniform(-d.area, d.area), s = r.uniform(0.4, 1.3);
        q.setFromEuler(new THREE.Euler(0, r() * 6.3, 0));
        m4.compose(new THREE.Vector3(x, s * 0.2, -y), q, new THREE.Vector3(s, s * 0.6, s));
        im.setMatrixAt(i, m4);
        im.setColorAt(i, c.setHSL(0.1 + r() * 0.08, 0.35 + r() * 0.2, 0.22 + r() * 0.12));
      }
      im.castShadow = true; im.receiveShadow = true;
      grupo.add(im);
    } else if (d.t === "agua") {                                 // el río: arena mojada + agua que refleja el cielo
      const ag = [], borde = [];
      for (let k = 0; k < d.eje.length - 1; k++) {
        const [x0, y0] = d.eje[k], [x1, y1] = d.eje[k + 1], L = Math.hypot(x1 - x0, y1 - y0), ang = Math.atan2(y1 - y0, x1 - x0);
        ag.push(new THREE.PlaneGeometry(L + 6, 6.5).rotateX(-Math.PI / 2).rotateY(ang).translate((x0 + x1) / 2, 0.05, -(y0 + y1) / 2).toNonIndexed());
        borde.push(new THREE.PlaneGeometry(L + 10, 11).rotateX(-Math.PI / 2).rotateY(ang).translate((x0 + x1) / 2, 0.03, -(y0 + y1) / 2).toNonIndexed());
        ag.push(new THREE.CircleGeometry(3.25, 20).rotateX(-Math.PI / 2).translate(x1, 0.05, -y1).toNonIndexed());
      }
      const mb = add(mergeGeometries(borde), new THREE.MeshStandardMaterial({ color: 0x9a6a44, roughness: 0.6, metalness: 0 }), false);
      mb.material.polygonOffset = true; mb.material.polygonOffsetFactor = -1;
      const nm = TEX.agua();
      const ma = new THREE.MeshStandardMaterial({ color: 0x2c6a72, roughness: 0.06, metalness: 0.1, transparent: true, opacity: 0.88, normalMap: nm, normalScale: new THREE.Vector2(0.35, 0.35), envMapIntensity: 1.3 });
      ma.polygonOffset = true; ma.polygonOffsetFactor = -2;
      const mw = add(mergeGeometries(ag.map((g) => { g.deleteAttribute("uv"); return g; })), ma, false);
      // UV del agua en metros (el mapa de normales se repite cada 4 m)
      const p = mw.geometry.attributes.position, uv = new Float32Array(p.count * 2);
      for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) / 4; uv[i * 2 + 1] = p.getZ(i) / 4; }
      mw.geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
      anim.push((dt) => { nm.offset.x += dt * 0.05; nm.offset.y += dt * 0.11; });
    } else if (d.t === "bandera") {
      add(new THREE.CylinderGeometry(0.04, 0.04, 4.5, 6).translate(d.p[0], 2.25, -d.p[1]), mats.andamio);
      const f = add(new THREE.PlaneGeometry(0.7, 2.6, 1, 6).translate(0.35, 0, 0), new THREE.MeshStandardMaterial({ color: 0xff2fa0, emissive: 0xff2fa0, emissiveIntensity: 0.7, side: THREE.DoubleSide }), false);
      f.position.set(d.p[0], 3.0, -d.p[1]);
      const ph = d.p[0] * 0.3;
      anim.push((dt, t) => { f.rotation.y = Math.sin(t * 2.2 + ph) * 0.35; });
    } else if (d.t === "reflector") {
      const caja = add(new THREE.BoxGeometry(3.2, 1.8, 0.6), luz(0xeaf2ff, 2.2), false);
      caja.position.copy(V(...d.p)); caja.lookAt(0, d.p[2] - 8, 0);
      const L = new THREE.PointLight(0xc8d8ff, 1100, 150, 1.6);
      L.position.copy(V(d.p[0] * 0.92, d.p[1] * 0.92, d.p[2] - 2));
      grupo.add(L);
      // el haz de luz (un cono aditivo que va hacia el centro de la cancha)
      const largo = Math.hypot(d.p[0], d.p[1], d.p[2]) * 0.9;
      const cono = new THREE.Mesh(new THREE.ConeGeometry(6, largo, 24, 1, true).translate(0, -largo / 2, 0),
        new THREE.MeshBasicMaterial({ color: 0x8fb0ff, transparent: true, opacity: 0.022, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      cono.position.copy(V(d.p[0], d.p[1], d.p[2]));
      cono.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), V(-d.p[0], -d.p[1], -d.p[2] + 2).normalize());
      grupo.add(cono);
    } else if (d.t === "lineas") {
      const m = luz(0xffffff, 0.45), geos = [];
      geos.push(new THREE.PlaneGeometry(0.3, 64).rotateX(-Math.PI / 2).translate(0, 0.03, 0).toNonIndexed());
      geos.push(new THREE.RingGeometry(8.6, 8.9, 48).rotateX(-Math.PI / 2).translate(0, 0.03, 0).toNonIndexed());
      for (const s of [-1, 1]) geos.push(new THREE.PlaneGeometry(0.3, 64).rotateX(-Math.PI / 2).translate(s * 49.5, 0.03, 0).toNonIndexed());
      for (const s of [-1, 1]) geos.push(new THREE.PlaneGeometry(99, 0.3).rotateX(-Math.PI / 2).translate(0, 0.03, s * 31.8).toNonIndexed());
      // la grilla de largada (cuadros blancos y negros)
      for (let i = 0; i < 12; i++) for (let j = 0; j < 2; j++) if ((i + j) % 2) geos.push(new THREE.PlaneGeometry(0.5, 0.5).rotateX(-Math.PI / 2).translate(-24 + j * 0.5 - 0.25, 0.035, 20 - 3 + i * 0.5).toNonIndexed());
      add(mergeGeometries(geos), m, false);
    } else if (d.t === "cadena") {
      add(new THREE.CylinderGeometry(0.04, 0.04, d.largo, 6).translate(d.p[0], d.p[2] - d.largo / 2, -d.p[1]), mats.metal, true);
      add(new THREE.TorusGeometry(0.25, 0.06, 6, 12, Math.PI * 1.4).rotateZ(Math.PI).translate(d.p[0], d.p[2] - d.largo - 0.2, -d.p[1]), mats.maquina, true);
    } else if (d.t === "baranda") {
      const a = d.a, b = d.b, L = Math.hypot(b[0] - a[0], b[1] - a[1]), geos = [], n = Math.ceil(L / 1.5);
      for (let i = 0; i <= n; i++) { const u = i / n; geos.push(new THREE.BoxGeometry(0.05, 1, 0.05).translate(a[0] + (b[0] - a[0]) * u, a[2] + 0.5, -(a[1] + (b[1] - a[1]) * u)).toNonIndexed()); }
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      for (const h of [0.5, 1]) geos.push(new THREE.BoxGeometry(L, 0.05, 0.05).rotateY(ang).translate((a[0] + b[0]) / 2, a[2] + h, -(a[1] + b[1]) / 2).toNonIndexed());
      add(mergeGeometries(geos), new THREE.MeshStandardMaterial({ color: 0xe2b21c, roughness: 0.5, metalness: 0.3 }), false);
    } else if (d.t === "escalera") {
      const geos = [], ang = d.ang, x = d.p[0] + Math.cos(ang) * (d.r + 0.25), y = d.p[1] + Math.sin(ang) * (d.r + 0.25);
      for (const s of [-0.25, 0.25]) geos.push(new THREE.BoxGeometry(0.05, d.h, 0.05).translate(0, d.h / 2, s).toNonIndexed());
      for (let z = 0.3; z < d.h; z += 0.35) geos.push(new THREE.BoxGeometry(0.03, 0.03, 0.5).translate(0, z, 0).toNonIndexed());
      const g = mergeGeometries(geos).rotateY(-ang).translate(x, 0, -y);
      add(g, mats.metal, false);
    } else if (d.t === "humo") {                                 // humo de la chimenea: manchas que suben y se abren
      const n = 26, sp = [], mat = new THREE.SpriteMaterial({ map: SUAVE(), color: 0x8a8580, transparent: true, opacity: 0.3, depthWrite: false });
      for (let i = 0; i < n; i++) { const s = new THREE.Sprite(mat.clone()); s.userData.f = i / n; grupo.add(s); sp.push(s); }
      anim.push((dt, t) => {
        for (const s of sp) {
          const f = (s.userData.f + t * 0.045) % 1, k = f * 18;
          s.position.copy(V(d.p[0] + k * 0.9 + Math.sin(f * 9 + s.userData.f * 30) * 0.6, d.p[1] - k * 0.2, d.p[2] + k));
          const sc = 2 + f * 9; s.scale.set(sc, sc, 1);
          s.material.opacity = 0.32 * Math.sin(Math.PI * Math.min(1, f * 1.15));
        }
      });
    } else if (d.t === "baliza") {                               // la luz roja de los aviones
      const m = luz(0xff2a1a, 0), b = add(new THREE.SphereGeometry(0.22, 10, 8).translate(d.p[0], d.p[2], -d.p[1]), m, false);
      void b;
      anim.push((dt, t) => { m.emissiveIntensity = (t % 1.6) < 0.35 ? 8 : 0.2; });
    } else if (d.t === "letrero") {
      const tx = texto(d.txt, d.sub, d.estilo);
      const transp = d.estilo === "pintado" || d.estilo === "silo";
      const m = new THREE.MeshStandardMaterial({ map: tx, transparent: transp, roughness: 0.8, alphaTest: transp ? 0.05 : 0, polygonOffset: true, polygonOffsetFactor: -2 });
      const pl = add(new THREE.PlaneGeometry(d.w, d.h), m, false);
      pl.rotation.y = CARA[d.cara] ?? 0;
      const n = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), pl.rotation.y);
      pl.position.copy(V(...d.p)).addScaledVector(n, transp ? 0.03 : 0.08);
      if (!transp) add(new THREE.BoxGeometry(d.w + 0.1, d.h + 0.1, 0.08).rotateY(pl.rotation.y).translate(pl.position.x - n.x * 0.05, pl.position.y, pl.position.z - n.z * 0.05), mats.metal, false);
    } else if (d.t === "charcos") {
      const r = makeRng(d.seed), geos = [];
      for (let i = 0; i < d.n; i++) {
        const x = r.uniform(-d.area, d.area), y = r.uniform(-d.area, d.area), s = r.uniform(0.8, 2.6);
        geos.push(new THREE.CircleGeometry(1, 18).scale(s, s * r.uniform(0.4, 0.9), 1).rotateZ(r() * 3).rotateX(-Math.PI / 2).translate(x, 0.02, -y).toNonIndexed());
      }
      const m = new THREE.MeshStandardMaterial({ color: 0x1c2024, roughness: 0.04, metalness: 0.3, envMapIntensity: 1.4, polygonOffset: true, polygonOffsetFactor: -1 });
      add(mergeGeometries(geos), m, false);
    } else if (d.t === "rayos") {                                // rayos de sol que entran por el techo roto (+ el polvo)
      if (solDir.y < 0.05) continue;
      const geos = [], k = Math.min(d.z / solDir.y, d.largo ?? 9);      // el rayo se apaga antes de salir por las paredes
      for (const [x0, y0, x1, y1] of d.huecos) {
        const arriba = [V(x0, y0, d.z), V(x1, y0, d.z), V(x1, y1, d.z), V(x0, y1, d.z)];
        const abajo = arriba.map((p) => p.clone().addScaledVector(solDir, -k));
        for (let i = 0; i < 4; i++) {
          const a = arriba[i], b = arriba[(i + 1) % 4], c = abajo[(i + 1) % 4], e = abajo[i];
          const g = new THREE.BufferGeometry();
          g.setAttribute("position", new THREE.Float32BufferAttribute([...a.toArray(), ...b.toArray(), ...c.toArray(), ...a.toArray(), ...c.toArray(), ...e.toArray()], 3));
          g.setAttribute("uv", new THREE.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 0], 2));
          geos.push(g);
        }
      }
      const grad = lienzo(4, 128, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "rgba(255,255,255,.9)"); gr.addColorStop(0.45, "rgba(255,255,255,.5)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
      const m = new THREE.MeshBasicMaterial({ color: A.solColor, map: grad, transparent: true, opacity: 0.11, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const rayo = new THREE.Mesh(mergeGeometries(geos), m); grupo.add(rayo);
      // el polvo que flota en los rayos
      const np = calidad === "baja" ? 80 : 260, pos = new Float32Array(np * 3), r = makeRng(55), hu = d.huecos;
      for (let i = 0; i < np; i++) { const [x0, y0, x1, y1] = hu[i % hu.length], h = d.z - r() * Math.min(d.z, k * solDir.y); const p = V(r.uniform(x0, x1), r.uniform(y0, y1), d.z).addScaledVector(solDir, -(d.z - h) / solDir.y); pos.set([p.x, p.y, p.z], i * 3); }
      const pg = new THREE.BufferGeometry(); pg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      const pts = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xfff0d0, size: 0.05, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }));
      grupo.add(pts);
      anim.push((dt, t) => { pts.position.y = Math.sin(t * 0.3) * 0.3; pts.position.x = Math.sin(t * 0.2) * 0.2; });
    } else if (d.t === "riel") {
      const L = Math.hypot(d.b[0] - d.a[0], d.b[1] - d.a[1]), geos = [];
      for (const s of [-0.55, 0.55]) geos.push(new THREE.BoxGeometry(L, 0.12, 0.08).translate((d.a[0] + d.b[0]) / 2, d.a[2] + 0.06 + 0.12, -(d.a[1] + s)).toNonIndexed());
      for (let x = Math.min(d.a[0], d.b[0]); x < Math.max(d.a[0], d.b[0]); x += 0.8) geos.push(new THREE.BoxGeometry(0.22, 0.1, 1.7).translate(x, d.a[2] + 0.05, -d.a[1]).toNonIndexed());
      add(mergeGeometries(geos), mats.oxido, true);
    } else if (d.t === "globos") {                               // globos aerostáticos (lejos y alto: no se alcanzan)
      for (const [x, y, z, col] of d.lista) {
        const g = new THREE.Group();
        const tela = lienzo(256, 128, (c, w, h) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? `#${col.toString(16).padStart(6, "0")}` : "#f2efe6"; c.fillRect((i * w) / 8, 0, w / 8, h); } });
        const gl = new THREE.Mesh(new THREE.SphereGeometry(6, 24, 16).scale(1, 1.2, 1), new THREE.MeshStandardMaterial({ map: tela, roughness: 0.8 }));
        const canasta = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.1, 1.4).translate(0, -9.5, 0), mats.madera);
        g.add(gl, canasta); g.position.copy(V(x, y, z)); grupo.add(g);
        const ph = x * 0.01;
        anim.push((dt, t) => { g.position.y = z + Math.sin(t * 0.25 + ph) * 1.5; g.position.x = x + Math.sin(t * 0.02 + ph) * 12; });
      }
    } else if (d.t === "aguilas") {
      const forma = new THREE.BufferGeometry();
      forma.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0.3, -1.1, 0.15, -0.1, 0, 0, -0.2, 0, 0, 0.3, 0, 0, -0.2, 1.1, 0.15, -0.1], 3));
      forma.computeVertexNormals();
      const m = new THREE.MeshStandardMaterial({ color: 0x2a1c14, side: THREE.DoubleSide, roughness: 1 });
      for (let i = 0; i < d.n; i++) {
        const a = new THREE.Mesh(forma, m); grupo.add(a);
        const R = 26 + i * 9, w = 0.12 + i * 0.03, ph = i * 2.1;
        anim.push((dt, t) => {
          const ang = t * w + ph, p = V(d.c[0] + Math.cos(ang) * R, d.c[1] + Math.sin(ang) * R, d.c[2] + i * 4 + Math.sin(t * 0.4 + i) * 2);
          a.position.copy(p); a.rotation.set(0, -ang, 0.35); a.scale.set(1, 1 + Math.sin(t * 3 + i) * 0.4, 1);
        });
      }
    } else if (d.t === "horizonte") {                            // acantilados (o cerros) lejos, afuera del mapa: la silueta del horizonte
      const r = makeRng(d.seed), geos = [], cerros = d.estilo === "cerros";
      for (let i = 0; i < 46; i++) {
        const ang = (i / 46) * Math.PI * 2 + r() * 0.1, R = r.uniform(d.r0, d.r1);
        if (cerros) {
          const rad = r.uniform(40, 80), h = r.uniform(18, 55);
          let g = new THREE.SphereGeometry(1, 40, 14, 0, Math.PI * 2, 0, Math.PI / 2);   // media esfera aplastada = un cerro
          const p = g.attributes.position;
          for (let k = 0; k < p.count; k++) {
            const x = p.getX(k), y = p.getY(k), z = p.getZ(k), f = 0.75 + 0.5 * fbm(x * 2.2 + i * 3.1, y * 2.2, z * 2.2, 4);
            p.setXYZ(k, x * rad * f, y * h * (0.7 + 0.6 * f) * 0.75, z * rad * f);
          }
          g.computeVertexNormals(); g = g.toNonIndexed(); g.translate(Math.cos(ang) * R, 0, -Math.sin(ang) * R);
          geos.push(colorear(g, ""));
        } else {
          const rad = r.uniform(18, 42), h = r.uniform(25, 70);
          const g = cilGeo({ c: [Math.cos(ang) * R, Math.sin(ang) * R], r: rad, z: [0, h] }, true, 900 + i);
          geos.push(colorear(g.toNonIndexed(), "mesa"));
        }
      }
      const mat = cerros ? new THREE.MeshStandardMaterial({ color: 0x4c5a52, roughness: 1, vertexColors: true }) : mats.mesa;
      if (cerros) geos.forEach((g) => g.deleteAttribute("uv"));
      const m = add(mergeGeometries(geos), mat, false); m.receiveShadow = false;
    } else if (d.t === "arboles") {                              // árboles (afuera de la reja): tronco + copa, de a cientos
      const r = makeRng(d.seed), n = d.n, tronco = new THREE.CylinderGeometry(0.12, 0.18, 1, 6).translate(0, 0.5, 0);
      const copa = mergeGeometries([new THREE.IcosahedronGeometry(1, 0).scale(1, 1.25, 1).translate(0, 1.6, 0), new THREE.IcosahedronGeometry(0.75, 0).translate(0.4, 2.3, 0.2)]);
      const it = new THREE.InstancedMesh(tronco, new THREE.MeshStandardMaterial({ color: 0x4a3626, roughness: 1 }), n);
      const ic = new THREE.InstancedMesh(copa, new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true }), n);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
      for (let i = 0; i < n; i++) {
        const ang = r() * Math.PI * 2, R = r.uniform(d.r0, d.r1), s = r.uniform(2.2, 4.2);
        q.setFromEuler(new THREE.Euler(0, r() * 6.3, 0));
        m4.compose(new THREE.Vector3(Math.cos(ang) * R, 0, -Math.sin(ang) * R), q, new THREE.Vector3(s, s * 1.6, s));
        it.setMatrixAt(i, m4);
        m4.compose(new THREE.Vector3(Math.cos(ang) * R, s * 0.6, -Math.sin(ang) * R), q, new THREE.Vector3(s, s, s));
        ic.setMatrixAt(i, m4); ic.setColorAt(i, c.setHSL(0.24 + r() * 0.1, 0.3 + r() * 0.2, 0.13 + r() * 0.08));
      }
      it.castShadow = ic.castShadow = calidad === "alta"; it.receiveShadow = ic.receiveShadow = true;
      grupo.add(it, ic);
    } else if (d.t === "losa" || d.t === "camino") {            // el patio de concreto y el camino con su línea amarilla
      const camino = d.t === "camino", tx = camino ? TEX.asfalto() : TEX.concreto();
      const [x0, y0, x1, y1] = d.r, w = x1 - x0, h = y1 - y0;
      tx.repeat.set(w / (camino ? 6 : 8), h / (camino ? 6 : 8));
      const m = new THREE.MeshStandardMaterial({ map: tx, roughness: camino ? 0.75 : 0.9, color: camino ? 0x8a8a8a : 0xd8d4cc, polygonOffset: true, polygonOffsetFactor: -1, envMapIntensity: 0.5 });
      add(new THREE.PlaneGeometry(w, h).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, 0.01, -(y0 + y1) / 2), m, false);
      if (camino) {
        const geos = [], vertical = h > w;
        for (let k = 0; k < (vertical ? h : w); k += 5) geos.push((vertical ? new THREE.PlaneGeometry(0.18, 2.4) : new THREE.PlaneGeometry(2.4, 0.18)).rotateX(-Math.PI / 2).translate(vertical ? (x0 + x1) / 2 : x0 + k + 1.2, 0.02, vertical ? -(y0 + k + 1.2) : -(y0 + y1) / 2).toNonIndexed());
        const ml = new THREE.MeshStandardMaterial({ color: 0xe8c23a, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 });
        add(mergeGeometries(geos), ml, false);
      }
    } else if (d.t === "ciudad") {                               // la ciudad de noche detrás del estadio: edificios con ventanas
      const r = makeRng(d.seed), n = d.n;
      const vent = lienzo(64, 128, (g, w, h) => { g.fillStyle = "#05070c"; g.fillRect(0, 0, w, h); for (let y = 4; y < h; y += 8) for (let x = 3; x < w; x += 8) if (Math.random() < 0.35) { g.fillStyle = Math.random() < 0.7 ? "#ffd9a0" : "#9fd0ff"; g.fillRect(x, y, 4, 4); } });
      const caja = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
      const im = new THREE.InstancedMesh(caja, new THREE.MeshStandardMaterial({ color: 0x0b0e16, emissive: 0xffffff, emissiveMap: vent, emissiveIntensity: 0.9, roughness: 0.8 }), n);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
      for (let i = 0; i < n; i++) {
        const ang = r() * Math.PI * 2, R = r.uniform(d.r0, d.r1), w = r.uniform(10, 26), h = r.uniform(18, 80);
        q.setFromEuler(new THREE.Euler(0, -ang, 0));
        m4.compose(new THREE.Vector3(Math.cos(ang) * R, 0, -Math.sin(ang) * R), q, new THREE.Vector3(w, h, r.uniform(10, 24)));
        im.setMatrixAt(i, m4);
      }
      grupo.add(im);
    } else if (d.t === "aros_tunel") {                           // los aros de neón del túnel (alternan cian y fucsia)
      const geos = [[], []], T = 0.14;
      for (let i = 0; i < d.n; i++) {
        const x = d.x0 + 0.4 + ((d.x1 - d.x0 - 0.8) * i) / (d.n - 1), k = i % 2;
        geos[k].push(new THREE.BoxGeometry(T, T, 2 * d.y + 0.5).translate(x, d.h + 0.2, 0).toNonIndexed());
        for (const s of [-1, 1]) geos[k].push(new THREE.BoxGeometry(T, d.h + 0.2, T).translate(x, (d.h + 0.2) / 2, s * (d.y + 0.25)).toNonIndexed());
      }
      add(mergeGeometries(geos[0]), luz(0x2fd0ff, 2.4), false); add(mergeGeometries(geos[1]), luz(0xff2fa0, 2.4), false);
    } else if (d.t === "largada") {                              // el arco de largada: bandera a cuadros y las 5 luces
      const cuadros = lienzo(512, 64, (g, w, h) => { for (let x = 0; x < w; x += 16) for (let y = 0; y < h; y += 16) { g.fillStyle = ((x + y) / 16) % 2 ? "#111" : "#eee"; g.fillRect(x, y, 16, 16); } g.fillStyle = "#111"; g.fillRect(w / 2 - 110, 8, 220, 48); g.fillStyle = "#ff7a1a"; g.font = "800 40px Chakra Petch, system-ui"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("START", w / 2, 33); });
      for (const s of [1, -1]) { const pl = add(new THREE.PlaneGeometry(d.ancho, 1.15), new THREE.MeshStandardMaterial({ map: cuadros, roughness: 0.6, emissive: 0xffffff, emissiveMap: cuadros, emissiveIntensity: 0.25 }), false); pl.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2; pl.position.copy(V(d.p[0] - s * 0.52, d.p[1], d.p[2])); }
      const luces = [];
      for (let i = 0; i < 5; i++) { const m = luz(0x220000, 1); const b = add(new THREE.SphereGeometry(0.28, 12, 10).translate(d.p[0] - 0.6, d.p[2] - 1.0, -(d.p[1] + (i - 2) * 0.8)), m, false); void b; luces.push(m); }
      out.largada = (estado) => {                                 // estado: número de luces rojas (1..5), "verde" o null
        luces.forEach((m, i) => { if (estado === "verde") { m.emissive.setHex(0x22ff66); m.emissiveIntensity = 4; } else if (typeof estado === "number" && i < estado) { m.emissive.setHex(0xff2010); m.emissiveIntensity = 5; } else { m.emissive.setHex(0x220000); m.emissiveIntensity = 1; } });
      };
    } else if (d.t === "publico") {
      // ya está en la textura de las tribunas: aquí, la pantalla gigante (se actualiza con pantalla(lineas))
    } else if (d.t === "led") {                                  // los carteles LED alrededor de la cancha (corren)
      const tx = lienzo(2048, 64, (g, w, h) => {
        const msgs = [["NEURAL DRONE FORGE", "#2fd0ff"], ["ARMA · ENTRENA · VUELA", "#ff7a1a"], ["DRONE LEAGUE", "#ff2fa0"], ["FPV · ACRO · RACE", "#47f08a"]];
        g.fillStyle = "#03050a"; g.fillRect(0, 0, w, h);
        msgs.forEach(([m, c], i) => { g.fillStyle = c; g.font = "800 34px Chakra Petch, system-ui"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(m, (i + 0.5) * (w / 4), h / 2 + 2); });
      });
      tx.repeat.set(3, 1);
      const m = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: tx, emissiveIntensity: A.noche ? 1.3 : 0.8, map: tx });
      const geos = [];
      for (const s of [-1, 1]) {
        geos.push(new THREE.PlaneGeometry(96, 0.9).rotateY(s > 0 ? 0 : Math.PI).translate(0, 0.65, -s * 31.7).toNonIndexed());
        geos.push(new THREE.PlaneGeometry(60, 0.9).rotateY(s > 0 ? -Math.PI / 2 : Math.PI / 2).translate(s * 49.7, 0.65, 0).toNonIndexed());
      }
      add(mergeGeometries(geos), m, false);
      anim.push((dt) => { tx.offset.x -= dt * 0.05; });
    } else if (d.t === "flashes") {                              // flashes y celulares en las tribunas (titilan)
      const r = makeRng(61), pos = new Float32Array(d.n * 3), fase = new Float32Array(d.n);
      for (let i = 0; i < d.n; i++) {
        const lado = Math.floor(r() * 4), k = r(), esc = Math.floor(r() * 3), a = 50 + esc * 4 + 2, b = 32 + esc * 4 + 2, z = 3 + esc * 3 + 0.8;
        const p = lado === 0 ? [-a + 2 * a * k, -b, z] : lado === 1 ? [-a + 2 * a * k, b, z] : lado === 2 ? [-a, -b + 2 * b * k, z] : [a, -b + 2 * b * k, z];
        const v = V(...p); pos.set([v.x, v.y, v.z], i * 3); fase[i] = r() * 100;
      }
      const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("fase", new THREE.BufferAttribute(fase, 1));
      const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { t: { value: 0 } },
        vertexShader: `attribute float fase; uniform float t; varying float vA; void main(){ float c = fract(t * 0.35 + fase); vA = c < 0.04 ? 1.0 - c / 0.04 : 0.15 * (0.5 + 0.5 * sin(t * 2.0 + fase * 7.0)); vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = (c < 0.04 ? 7.0 : 2.5) * (60.0 / -mv.z); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(vec3(1.0, 0.97, 0.9), vA * (1.0 - d * 2.0)); }` });
      const pts = new THREE.Points(g, m); pts.frustumCulled = false; grupo.add(pts);
      anim.push((dt, t) => { m.uniforms.t.value = t; });
    }
  }
  // la pantalla gigante: un canvas que se puede reescribir (la vuelta, el tiempo…)
  const pant = M.boxes.find((b) => b.m === "pantalla");
  if (pant) {
    const c = document.createElement("canvas"); c.width = 1024; c.height = 512;
    const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace;
    const dibujar = (l1 = "NEURAL DRONE", l2 = "LEAGUE", l3 = "") => {
      const g = c.getContext("2d"), w = c.width, h = c.height;
      const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, "#3a0a32"); gr.addColorStop(1, "#06243a");
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.strokeStyle = "#ff2fa0"; g.lineWidth = 10; g.strokeRect(14, 14, w - 28, h - 28);
      g.fillStyle = "#fff"; g.textAlign = "center"; g.textBaseline = "middle";
      g.font = "800 120px Chakra Petch, system-ui"; g.fillText(l1, w / 2, 170, w - 60);
      g.fillStyle = "#2fd0ff"; g.font = "800 96px Chakra Petch, system-ui"; g.fillText(l2, w / 2, 300, w - 60);
      if (l3) { g.fillStyle = "#ffd23f"; g.font = "700 56px Chakra Petch, system-ui"; g.fillText(l3, w / 2, 410, w - 60); }
      for (let y = 0; y < h; y += 4) { g.fillStyle = "rgba(0,0,0,.18)"; g.fillRect(0, y, w, 1); }
      tx.needsUpdate = true;
    };
    dibujar();
    const sx = pant.max[0] - pant.min[0], sz = pant.max[2] - pant.min[2];
    const caja = add(cajaGeo({ ...pant }).toNonIndexed(), mats.metal, true); void caja;
    const m = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: tx, emissiveIntensity: A.noche ? 1.1 : 0.7 });
    for (const s of [-1, 1]) {
      const pl = add(new THREE.PlaneGeometry(sx * 0.96, sz * 0.92), m, false);
      pl.rotation.y = s > 0 ? 0 : Math.PI;
      const yc = s > 0 ? pant.min[1] : pant.max[1];
      pl.position.copy(V((pant.min[0] + pant.max[0]) / 2, yc - s * 0.02, (pant.min[2] + pant.max[2]) / 2));
    }
    let ult = "";
    out.pantalla = (l1, l2, l3) => { const k = `${l1}|${l2}|${l3}`; if (k !== ult) { ult = k; dibujar(l1, l2, l3); } };
  }
  return out;
}

// ---------------- los portales y la línea de carrera ----------------
const COL = { sig: 0xff7a1a, luego: 0x3ccbff, otro: 0xa9c2bb, hecho: 0x47f08a };
function aroTex() {
  return lienzo(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, "rgba(255,255,255,.9)"); gr.addColorStop(0.18, "rgba(255,255,255,0)"); gr.addColorStop(0.82, "rgba(255,255,255,0)"); gr.addColorStop(1, "rgba(255,255,255,.9)");
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const gv = g.createLinearGradient(0, 0, 0, h); gv.addColorStop(0, "rgba(255,255,255,.9)"); gv.addColorStop(0.18, "rgba(255,255,255,0)"); gv.addColorStop(0.82, "rgba(255,255,255,0)"); gv.addColorStop(1, "rgba(255,255,255,.9)");
    g.fillStyle = gv; g.fillRect(0, 0, w, h);
  }, false);
}
function cartel(txt, col = "#fff", w = 512) {
  const c = document.createElement("canvas"); c.width = w; c.height = 96;
  const g = c.getContext("2d");
  g.font = "700 50px Chakra Petch, system-ui";
  const tw = Math.min(w - 20, g.measureText(txt).width + 50);
  g.fillStyle = "rgba(8,12,12,.72)"; g.beginPath(); g.roundRect((w - tw) / 2, 8, tw, 80, 22); g.fill();
  g.fillStyle = col; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(txt, w / 2, 50, w - 40);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthWrite: false, transparent: true }));
  s.scale.set(4.2, 0.79, 1);
  return s;
}
export class Portales {
  /**
   * gates, dirs (orientaciones), noche, linea = lineaCarrera() (o null), etiquetas = el nombre del tramo de cada portal
   * (ya traducido, o null).
   */
  constructor(scene, gates, dirs, noche, linea = null, etiquetas = []) {
    this.grupo = new THREE.Group();
    this.n = gates.length;
    const film = aroTex();
    this.items = gates.map((g, i) => {
      const mat = new THREE.MeshStandardMaterial({ color: 0x15181c, emissive: COL.otro, emissiveIntensity: noche ? 1.5 : 1.6, roughness: 0.35, metalness: 0.3 });
      const marco = new THREE.Group(), L = 2.6, T = 0.2;
      const geos = [];
      for (const [x, y, w, h] of [[0, L / 2, L + T, T], [0, -L / 2, L + T, T], [L / 2, 0, T, L], [-L / 2, 0, T, L]]) geos.push(new THREE.BoxGeometry(w, h, T).translate(x, y, 0).toNonIndexed());
      const borde = new THREE.Mesh(mergeGeometries(geos), mat); borde.castShadow = true; marco.add(borde);
      const fm = new THREE.MeshBasicMaterial({ map: film, color: COL.otro, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      marco.add(new THREE.Mesh(new THREE.PlaneGeometry(L, L), fm));
      marco.position.copy(V(...g));
      const d = V(...dirs[i]).normalize();                        // el marco mira hacia donde se pasa
      marco.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d);
      // el número y el nombre del tramo: siempre derechos (sprites), arriba del portal
      const num = numero(i + 1);
      num.position.copy(V(...g)).add(new THREE.Vector3(0, L / 2 + 0.95, 0));
      this.grupo.add(num);
      let et = null;
      if (etiquetas[i]) { et = cartel(etiquetas[i], "#ffd23f"); et.position.copy(num.position).add(new THREE.Vector3(0, 0.95, 0)); et.visible = false; this.grupo.add(et); }
      this.grupo.add(marco);
      return { marco, mat, fm, num, et };
    });
    // la flecha al siguiente portal (una sola: se mueve al que toca)
    const fl = new THREE.Shape(); fl.moveTo(0, 0.55); fl.lineTo(0.5, 0); fl.lineTo(0.2, 0); fl.lineTo(0.2, -0.5); fl.lineTo(-0.2, -0.5); fl.lineTo(-0.2, 0); fl.lineTo(-0.5, 0); fl.closePath();
    this.flecha = new THREE.Mesh(new THREE.ShapeGeometry(fl).rotateX(-Math.PI / 2).rotateY(Math.PI), new THREE.MeshBasicMaterial({ color: 0xffb070, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
    this.flecha.visible = false;
    this.grupo.add(this.flecha);
    this.gates = gates;
    // la línea de carrera: puntitos (InstancedMesh) que se encienden en el tramo que toca
    this.linea = linea;
    if (linea?.length) {
      const im = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.06, 0), new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), linea.length);
      const m4 = new THREE.Matrix4();
      linea.forEach((p, i) => { m4.makeTranslation(p[0], p[2], -p[1]); im.setMatrixAt(i, m4); im.setColorAt(i, new THREE.Color(0x000000)); });
      im.frustumCulled = false;
      this.lineaMesh = im; this.grupo.add(im);
    }
    this.verLinea = true;
    this.sig = -1;
    scene.add(this.grupo);
  }
  /** sig = el índice del portal que toca (-1 = ninguno: vuelo libre). */
  pintar(sig, n = this.items.length) {
    this.sig = sig;
    this.items.forEach((it, i) => {
      const c = sig < 0 ? COL.otro : i === sig ? COL.sig : i === (sig + 1) % n ? COL.luego : COL.otro;
      it.mat.emissive.setHex(c); it.fm.color.setHex(c);
      it.fm.opacity = i === sig ? 0.55 : sig < 0 ? 0.25 : 0.18;
      it.marco.scale.setScalar(i === sig ? 1.0 : 0.96);
      it.num.visible = sig >= 0;
      if (it.et) it.et.visible = sig >= 0 && (i === sig || i === (sig + 1) % n);
    });
    // la flecha: un poco después del portal que toca, apuntando al siguiente
    if (sig >= 0) {
      const g = this.gates[sig], h = this.gates[(sig + 1) % n], a = V(...g), b = V(...h), d = b.clone().sub(a).normalize();
      this.flecha.position.copy(a).addScaledVector(d, 2.2).add(new THREE.Vector3(0, -1.7, 0));
      this.flecha.lookAt(this.flecha.position.clone().add(new THREE.Vector3(d.x, 0, d.z)));
      this.flecha.visible = Math.hypot(d.x, d.z) > 0.3;
    } else this.flecha.visible = false;
    this.pintarLinea();
  }
  pintarLinea() {
    const im = this.lineaMesh; if (!im) return;
    im.visible = this.verLinea && this.sig >= 0;
    if (!im.visible) return;
    const n = this.n, c = new THREE.Color();
    this.linea.forEach((p, i) => {
      const k = (p[3] - this.sig + n) % n;                     // 0 = el tramo hacia el portal que toca
      if (k === 0) c.setHex(0xff9a3a); else if (k === 1) c.setHex(0x3ccbff).multiplyScalar(0.6); else c.setRGB(0, 0, 0);
      im.setColorAt(i, c);
    });
    im.instanceColor.needsUpdate = true;
  }
  /** Para que pulse el que toca (t en segundos). */
  latir(t) {
    const it = this.items[this.sig]; if (!it) return;
    it.fm.opacity = 0.45 + 0.2 * Math.sin(t * 6);
    if (this.flecha.visible) this.flecha.material.opacity = 0.55 + 0.35 * Math.sin(t * 6);
  }
  destello(i) { const it = this.items[i]; if (it) { it.mat.emissive.setHex(COL.hecho); it.fm.color.setHex(COL.hecho); } }
  dispose(scene) { scene.remove(this.grupo); }
}
function numero(n) {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const g = c.getContext("2d");
  g.fillStyle = "rgba(10,16,14,.8)"; g.beginPath(); g.arc(64, 64, 56, 0, 7); g.fill();
  g.strokeStyle = "rgba(255,255,255,.85)"; g.lineWidth = 6; g.beginPath(); g.arc(64, 64, 54, 0, 7); g.stroke();
  g.fillStyle = "#fff"; g.font = "700 68px Chakra Petch, system-ui"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(String(n), 64, 68);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthWrite: false }));
  s.scale.set(1.1, 1.1, 1);
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
