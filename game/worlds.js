// =====================================================================
// MUNDOS del juego. Cada mundo devuelve las piezas de colisión (las mismas formas que el
// entrenamiento: cajas, esferas, cilindros) y lo que hay que dibujar.
//
// El bosque usa las mismas especies y reglas que drone_rl/level.py (random_forest/_make_tree):
// copas altas que dejan ~2.6 m libres abajo, árboles jóvenes y arbustos a la altura de vuelo.
// =====================================================================
import { makeRng } from "./sim.js";

export const WORLDS = {
  bosque: { name: "Bosque", desc: "Troncos, árboles jóvenes y arbustos. Lo que entrena el nivel Bosque.", tint: "#3f7a3a" },
  columnas: { name: "Columnas", desc: "Un campo con columnas de concreto. Como el nivel Columnas.", tint: "#a7a39a" },
  bodega: { name: "Bodega", desc: "Estanterías, montacargas, un letrero colgante y una ruta de 15 puntos.", tint: "#d47a2a" },
  campo: { name: "Campo libre", desc: "Nada en el camino: para ver cómo vuela y probar circuitos.", tint: "#7fb3c9" },
};

const SPECIES = [["arbol", 0.38], ["pino", 0.27], ["joven", 0.20], ["arbusto", 0.10], ["roca", 0.05]];

function pickSpecies(rng) {
  let u = rng() * SPECIES.reduce((a, s) => a + s[1], 0);
  for (const [k, p] of SPECIES) { if ((u -= p) <= 0) return k; }
  return "arbol";
}

/** Un árbol = tronco (cilindro) + copas (esferas). Igual que _make_tree en Python. */
export function makeTree(rng, kind, x, y) {
  const t = { tipo: kind, x, y, tronco: null, copas: [], color: rng() };
  if (kind === "arbol") {
    const r0 = rng.uniform(1.3, 2.0);
    const cz = Math.max(rng.uniform(4.0, 6.0), 2.6 + r0);
    t.copas.push([x, y, cz, r0]);
    const extra = rng.int(0, 2);
    for (let i = 0; i < extra; i++) {
      const r = r0 * rng.uniform(0.55, 0.8);
      const ox = rng.uniform(-0.75, 0.75) * r0, oy = rng.uniform(-0.75, 0.75) * r0;
      const z = Math.max(cz + rng.uniform(-0.3, 0.5) * r0, 2.6 + r);
      t.copas.push([x + ox, y + oy, z, r]);
    }
    t.tronco = [rng.uniform(0.18, 0.32), cz];
  } else if (kind === "pino") {
    let r = rng.uniform(1.15, 1.55);
    let cz = 2.6 + r + rng.uniform(0, 0.6);
    const h = rng.uniform(6.5, 9.5);
    while (r > 0.3 && cz < h) {
      t.copas.push([x, y, cz, r]);
      cz += r * 0.95;
      r *= 0.75;
    }
    t.tronco = [rng.uniform(0.14, 0.24), cz];
  } else if (kind === "joven") {
    const h = rng.uniform(1.4, 2.4);
    t.copas.push([x, y, h, rng.uniform(0.5, 0.85)]);
    t.tronco = [rng.uniform(0.07, 0.12), h];
  } else if (kind === "arbusto") {
    const r = rng.uniform(0.35, 0.75);
    t.copas.push([x, y, r * 0.55, r]);
  } else {
    const r = rng.uniform(0.3, 0.9);
    t.copas.push([x, y, -r * 0.2, r]);
  }
  return t;
}

/** ¿Este árbol tapa el despegue o un aro? (mismas reglas que el entrenamiento) */
export function treeBlocks(t, spawn, goals) {
  if (Math.hypot(t.x - spawn[0], t.y - spawn[1]) < 1.8) return true;
  for (const g of goals) if (Math.hypot(t.x - g[0], t.y - g[1]) < 1.6) return true;
  for (const [cx, cy, cz, r] of t.copas) {
    if (Math.hypot(cx - spawn[0], cy - spawn[1]) < r + 0.7) return true;
    for (const g of goals) if (Math.hypot(cx - g[0], cy - g[1], cz - g[2]) < r + 0.9) return true;
  }
  return false;
}

function poisson(rng, lo, hi, spacing, target, accept) {
  const pts = [];
  for (let i = 0; i < target * 8 && pts.length < target; i++) {
    const p = [rng.uniform(lo[0], hi[0]), rng.uniform(lo[1], hi[1])];
    if (pts.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < spacing * 0.85)) continue;
    if (accept && !accept(p)) continue;
    pts.push(p);
  }
  return pts;
}

export function forestWorld(seed, density = 1.0) {
  const rng = makeRng(seed);
  const spawn = [0, 0, 0];
  const spacing = 2.8 / Math.sqrt(Math.max(density, 0.2));
  const area = 54 * 54;
  const pts = poisson(rng, [-27, -27], [27, 27], spacing, Math.floor((area / spacing ** 2) * 0.7));
  const trees = [];
  for (const [x, y] of pts) {
    const t = makeTree(rng, pickSpecies(rng), x, y);
    if (!treeBlocks(t, spawn, [])) trees.push(t);
  }
  // fondo: más allá del límite de 30 m (solo decorado: ahí el vuelo ya terminó)
  const back = [];
  const n = 420;
  for (let i = 0; i < n * 6 && back.length < n; i++) {
    const a = rng.uniform(-Math.PI, Math.PI), r = Math.sqrt(rng.uniform(31 ** 2, 62 ** 2));
    const p = [r * Math.cos(a), r * Math.sin(a)];
    if (back.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 4.2)) continue;
    back.push(makeTree(rng, rng() < 0.45 ? "pino" : "arbol", p[0], p[1]));
  }
  return { kind: "bosque", spawn, trees, backdrop: back, boxes: [], columns: [], fog: 0.022, randomRoute: (s) => forestRoute(s) };
}

export function columnsWorld(seed) {
  const rng = makeRng(seed);
  const spawn = [0, 0, 0];
  const cols = [];
  const pts = poisson(rng, [-25, -25], [25, 25], 4.2, 70, (p) => Math.hypot(p[0], p[1]) > 3.0);
  for (const [x, y] of pts) {
    const hx = rng.uniform(0.2, 0.6), hy = rng.uniform(0.2, 0.6), h = rng.uniform(3.0, 6.0);
    cols.push({ min: [x - hx, y - hy, 0], max: [x + hx, y + hy, h], kind: "columna" });
  }
  return { kind: "columnas", spawn, trees: [], backdrop: [], boxes: cols, columns: cols, fog: 0.012, randomRoute: (s) => openRoute(s, 3) };
}

export function fieldWorld() {
  return { kind: "campo", spawn: [0, 0, 0], trees: [], backdrop: [], boxes: [], columns: [], fog: 0.008,
    randomRoute: () => [[6, 0, 2], [6, 6, 3], [0, 6, 2], [0, 0, 1.5]] };
}

export function warehouseWorld(json) {
  const boxes = json.boxes.map((b) => ({ min: b.min, max: b.max, kind: b.kind, name: b.name }));
  return { kind: "bodega", spawn: json.spawn, trees: [], backdrop: [], boxes, columns: [], fog: 0.004, visual: json.visual,
    defaultRoute: json.goals, randomRoute: () => json.goals.map((g) => g.slice()) };
}

/** Slalom de 3 aros (como el nivel "Bosque: 3 aros"). */
function forestRoute(seed) {
  const rng = makeRng(seed);
  let ang = rng.uniform(-Math.PI, Math.PI);
  let p = [0, 0];
  const g = [];
  for (let k = 0; k < 3; k++) {
    if (k) ang += rng.uniform(-1.2, 1.2);
    const d = k ? rng.uniform(6, 9) : rng.uniform(5, 8);
    p = [Math.max(-20, Math.min(20, p[0] + d * Math.cos(ang))), Math.max(-20, Math.min(20, p[1] + d * Math.sin(ang)))];
    g.push([p[0], p[1], rng.uniform(1.2, 2.2)]);
  }
  return g;
}

function openRoute(seed, n) {
  const rng = makeRng(seed);
  let p = [0, 0];
  const g = [];
  for (let k = 0; k < n; k++) {
    const a = rng.uniform(-Math.PI, Math.PI), d = rng.uniform(4, 7);
    p = [Math.max(-20, Math.min(20, p[0] + d * Math.cos(a))), Math.max(-20, Math.min(20, p[1] + d * Math.sin(a)))];
    g.push([p[0], p[1], rng.uniform(1.0, 4.0)]);
  }
  return g;
}

/** Las piezas de colisión del mundo + la ruta -> el formato de Level (sim.js). */
export function levelDict(world, goals) {
  const spheres = [], cylinders = [];
  for (const t of world.trees) {
    if (t.tronco) cylinders.push({ center: [t.x, t.y], radius: t.tronco[0], z: [0, t.tronco[1]] });
    for (const [x, y, z, r] of t.copas) spheres.push({ center: [x, y, z], radius: r });
  }
  return { spawn: world.spawn, goals, boxes: world.boxes.map((b) => ({ min: b.min, max: b.max })), spheres, cylinders,
    bounds: { xy: 30, z: 15 } };
}
