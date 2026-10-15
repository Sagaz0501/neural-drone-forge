// =====================================================================
// LOS LUGARES de los pedidos (docs/HISTORIA.md): la casa, la finca El Roble, el restaurante La Brasa…
// Cada lugar da: el sujeto (lo que se graba), hacia dónde mira su frente, sus formas de colisión
// (cajas, cilindros, esferas: las mismas que ve la IA con sus sensores), el viento y cómo se ve.
// Las tomas de cada pedido (app/data/misiones.json) se diseñaron para pasar entre sus obstáculos.
// =====================================================================
import * as THREE from "three";
import { V } from "../game/scene.js";
import { makeRng } from "../game/sim.js";
import { makeTree } from "../game/worlds.js";
import { CASA, houseBoxes, casaView, tomasPedido } from "./casa.js";

const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, ...o });
function put(g, mesh, x, y, z) {
  mesh.position.copy(V(x, y, z));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}
function textTex(lines, w = 512, h = 128, bg = "#f4f1ea", fg = "#222") {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d");
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = fg; g.textAlign = "center"; g.textBaseline = "middle";
  lines.forEach(([t, size, y, col]) => { g.fillStyle = col || fg; g.font = `700 ${size}px 'Chakra Petch', sans-serif`; g.fillText(t, w / 2, y); });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
/** Techo de dos aguas sobre una caja (cumbrera a lo largo de x), con hastiales. */
function gableRoof(g, cx, cy, w, d, wallH, roofCol, wallCol) {
  const rh = 0.35 * d, eave = 0.3;
  const tri = new THREE.Shape();
  tri.moveTo(-(d / 2 + eave), 0); tri.lineTo(d / 2 + eave, 0); tri.lineTo(0, rh); tri.lineTo(-(d / 2 + eave), 0);
  const geo = new THREE.ExtrudeGeometry(tri, { depth: w + 2 * eave, bevelEnabled: false });
  geo.translate(0, 0, -(w + 2 * eave) / 2);
  geo.rotateY(Math.PI / 2);
  const roof = new THREE.Mesh(geo, mat(roofCol, { roughness: 0.7 }));
  roof.position.copy(V(cx, cy, wallH));
  roof.castShadow = roof.receiveShadow = true;
  g.add(roof);
  const gab = new THREE.Shape();
  gab.moveTo(-d / 2, 0); gab.lineTo(d / 2, 0); gab.lineTo(0, rh * 0.92); gab.lineTo(-d / 2, 0);
  for (const sx of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.ShapeGeometry(gab), mat(wallCol, { side: THREE.DoubleSide }));
    m.rotation.y = Math.PI / 2;
    m.position.copy(V(cx + sx * (w / 2 + 0.001), cy, wallH));
    g.add(m);
  }
}
const frenteDe = (cx, cy) => Math.atan2(-cy, -cx);

/** Árboles de adorno (con colisión) lejos del sujeto y del camino desde la base. */
function treesAround(seed, subject, keep) {
  const rng = makeRng(seed), trees = [], [hx, hy] = subject;
  const segDist = (p, a, b) => {
    const ab = [b[0] - a[0], b[1] - a[1]], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / (ab[0] ** 2 + ab[1] ** 2 || 1)));
    return Math.hypot(p[0] - a[0] - ab[0] * t, p[1] - a[1] - ab[1] * t);
  };
  for (let k = 0; k < 600 && trees.length < 16; k++) {
    const x = rng.uniform(-26, 28), y = rng.uniform(-26, 26);
    if (Math.hypot(x - hx, y - hy) < keep || Math.hypot(x, y) < 7 || segDist([x, y], [0, 0], [hx, hy]) < 7) continue;
    if (trees.some((t) => Math.hypot(t.x - x, t.y - y) < 4.5)) continue;
    trees.push(makeTree(rng, rng() < 0.55 ? "arbol" : "pino", x, y));
  }
  return trees;
}

// ---------------- la casa (capítulo 1) ----------------
const casa = {
  nombre: "La casa de Doña Marta",
  build() {
    const h = CASA, subject = [h.cx, h.cy, h.wallH * 0.6];
    return { subject, frente: frenteDe(h.cx, h.cy), boxes: houseBoxes(h.cx, h.cy, h.w, h.d, h.wallH), cylinders: [], spheres: [],
      trees: treesAround(7, subject, 16), wind: 0, view: casaView };
  },
};

// ---------------- la finca El Roble (capítulo 1): granero, silo, viento ----------------
const FINCA = { cx: 17, cy: -7, w: 9, d: 7, wallH: 4.2, silo: [13.5, -12, 1.6, 9] };
const finca = {
  nombre: "Finca El Roble",
  build() {
    const f = FINCA, subject = [f.cx, f.cy, f.wallH * 0.6];
    const [sx, sy, sr, sh] = f.silo;
    const bales = [[7.5, -21], [9, -22], [26, 3]];
    return {
      subject, frente: frenteDe(f.cx, f.cy), wind: 2.5,
      boxes: [...houseBoxes(f.cx, f.cy, f.w, f.d, f.wallH), ...bales.map(([x, y]) => ({ min: [x - 0.6, y - 0.6, 0], max: [x + 0.6, y + 0.6, 1.1] }))],
      cylinders: [{ center: [sx, sy], radius: sr, z: [0, sh] }], spheres: [{ center: [sx, sy, sh], radius: sr }],
      trees: treesAround(11, subject, 20),
      view() {
        const g = new THREE.Group();
        const red = mat(0x9e2b20), white = mat(0xf2efe6);
        put(g, new THREE.Mesh(new THREE.BoxGeometry(f.w, f.wallH, f.d), red), f.cx, f.cy, f.wallH / 2);
        gableRoof(g, f.cx, f.cy, f.w, f.d, f.wallH, 0x3a3f45, 0x9e2b20);
        const fx = f.cx - f.w / 2 - 0.03;                                 // el portón (mira hacia la base)
        put(g, new THREE.Mesh(new THREE.BoxGeometry(0.06, 3.0, 3.2), mat(0x7a2018)), fx, f.cy, 1.5);
        for (const [a, b] of [[-1, 1], [1, 1]]) {                          // la X blanca del portón
          const bar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 4.3), white);
          bar.rotation.x = a * Math.atan2(3.0, 3.2);
          put(g, bar, fx - 0.03, f.cy, 1.5);
          void b;
        }
        put(g, new THREE.Mesh(new THREE.BoxGeometry(0.07, 3.1, 0.14), white), fx - 0.02, f.cy - 1.6, 1.5);
        put(g, new THREE.Mesh(new THREE.BoxGeometry(0.07, 3.1, 0.14), white), fx - 0.02, f.cy + 1.6, 1.5);
        put(g, new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.0, 1.2), mat(0x5a1810)), fx, f.cy, f.wallH + 0.8);   // el pajar
        // el silo: cilindro de lámina + domo
        const silo = put(g, new THREE.Mesh(new THREE.CylinderGeometry(sr, sr, sh, 28), mat(0xb9bec4, { metalness: 0.6, roughness: 0.4 })), sx, sy, sh / 2);
        void silo;
        for (let k = 1; k < 6; k++) put(g, new THREE.Mesh(new THREE.TorusGeometry(sr + 0.01, 0.03, 4, 32), mat(0x8d9399, { metalness: 0.7 })), sx, sy, (k * sh) / 6).rotation.x = Math.PI / 2;
        put(g, new THREE.Mesh(new THREE.SphereGeometry(sr, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xc9ced3, { metalness: 0.6, roughness: 0.35 })), sx, sy, sh);
        // pacas de heno
        const hay = mat(0xd9b45a, { roughness: 1 });
        for (const [x, y] of bales) {
          const b = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1.2, 20), hay);
          b.rotation.z = Math.PI / 2;
          put(g, b, x, y, 0.6);
        }
        // un tractor junto al granero (adentro de la órbita, lejos de las rutas)
        const green = mat(0x2e7d32), black = mat(0x1a1a1a);
        put(g, new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.9, 1.1), green), f.cx + 3, f.cy + 4.6, 0.95);
        put(g, new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.0, 1.0), green), f.cx + 3.4, f.cy + 4.6, 1.85);
        for (const [dx, dy, r] of [[-0.7, -0.62, 0.62], [-0.7, 0.62, 0.62], [0.75, -0.62, 0.35], [0.75, 0.62, 0.35]]) {
          const w = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.3, 18), black);
          w.rotation.x = Math.PI / 2;
          put(g, w, f.cx + 3 + dx, f.cy + 4.6 + dy, r);
        }
        // cerca de madera alrededor del corral
        const post = new THREE.BoxGeometry(0.1, 1.1, 0.1), wood = mat(0x8a6a44);
        for (let k = 0; k < 14; k++) put(g, new THREE.Mesh(post, wood), f.cx - 7 + k * 1.1, f.cy + 7.5, 0.55);
        const rail = new THREE.Mesh(new THREE.BoxGeometry(14.3, 0.08, 0.06), wood);
        put(g, rail, f.cx - 7 + 7.15 - 0.55, f.cy + 7.5, 0.8);
        // letrero de la finca
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.8), new THREE.MeshStandardMaterial({ map: textTex([["FINCA EL ROBLE", 54, 64, "#f4f1ea"]], 512, 128, "#5a3a1e") }));
        sign.rotation.y = -Math.PI / 2;
        put(g, sign, 4.2, -4.0, 1.6);
        put(g, new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.0, 0.1), wood), 4.25, -5.0, 1.0);
        put(g, new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.0, 0.1), wood), 4.25, -3.0, 1.0);
        return g;
      },
    };
  },
};

// ---------------- el restaurante La Brasa (capítulo 2): postes, terraza, gente ----------------
const RESTO = { cx: 13, cy: 2, w: 7, d: 11, wallH: 6.5 };
const LAMPS = [[5.5, -4], [5.5, 0.5], [10, -7.5], [16.5, -7.5]];
const UMBRELLAS = [[6.6, 5.4], [6.6, 8.2], [9.0, 9.4]];
const restaurante = {
  nombre: "Restaurante La Brasa",
  build() {
    const r = RESTO, subject = [r.cx, r.cy, 1.6];                // la puerta y la terraza
    return {
      subject, frente: frenteDe(r.cx, r.cy), wind: 0.8,
      boxes: houseBoxes(r.cx, r.cy, r.w, r.d, r.wallH),
      cylinders: [...LAMPS.map(([x, y]) => ({ center: [x, y], radius: 0.14, z: [0, 5.0] })),
        ...UMBRELLAS.map(([x, y]) => ({ center: [x, y], radius: 0.06, z: [0, 2.2] }))],
      spheres: UMBRELLAS.map(([x, y]) => ({ center: [x, y, 2.05], radius: 0.95 })),
      trees: treesAround(23, subject, 18),
      view() {
        const g = new THREE.Group();
        const wall = mat(0xe9d3b0), terra = mat(0xb5523b, { roughness: 0.7 });
        put(g, new THREE.Mesh(new THREE.BoxGeometry(r.w, r.wallH, r.d), wall), r.cx, r.cy, r.wallH / 2);
        put(g, new THREE.Mesh(new THREE.BoxGeometry(r.w + 0.06, 0.25, r.d + 0.06), terra), r.cx, r.cy, 3.1);   // entre pisos
        gableRoof(g, r.cx, r.cy, r.w, r.d, r.wallH, 0x8f3b28, 0xe9d3b0);
        const fx = r.cx - r.w / 2 - 0.03;
        const glass = mat(0x9cc8e6, { roughness: 0.15, metalness: 0.2, emissive: 0x3a2a10, emissiveIntensity: 0.5 });
        for (const y of [-3, 0, 3]) put(g, new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.0, 2.0), glass), fx, r.cy + y, 1.3);   // vitrinas
        for (const y of [-3.2, -1, 1.2, 3.4]) put(g, new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.3, 1.1), glass), fx, r.cy + y, 4.6);
        // toldo a rayas
        const c = document.createElement("canvas");
        c.width = 256; c.height = 16;
        const x2 = c.getContext("2d");
        for (let i = 0; i < 16; i++) { x2.fillStyle = i % 2 ? "#f4f1ea" : "#c62828"; x2.fillRect(i * 16, 0, 16, 16); }
        const st = new THREE.CanvasTexture(c);
        st.colorSpace = THREE.SRGBColorSpace;
        const awning = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, r.d - 1), new THREE.MeshStandardMaterial({ map: st, roughness: 0.8 }));
        awning.rotation.z = -0.35;
        put(g, awning, fx - 0.65, r.cy, 2.75);
        // letrero LA BRASA
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 0.9), new THREE.MeshStandardMaterial({ map: textTex([["LA BRASA", 84, 64, "#ffd23f"]], 512, 128, "#2a1a12"), emissive: 0x332200, emissiveIntensity: 0.5 }));
        sign.rotation.y = -Math.PI / 2;
        put(g, sign, fx - 0.04, r.cy, 3.6);
        // andén y calle
        const walk = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 26), mat(0xa8a196));
        walk.rotation.x = -Math.PI / 2;
        put(g, walk, fx - 2.25, r.cy - 2, 0.015);
        const street = new THREE.Mesh(new THREE.PlaneGeometry(6, 34), mat(0x3a3d40));
        street.rotation.x = -Math.PI / 2;
        put(g, street, fx - 7.5, r.cy - 2, 0.01);
        for (let k = -14; k < 16; k += 3) {
          const line = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 1.4), mat(0xf2efe6));
          line.rotation.x = -Math.PI / 2;
          put(g, line, fx - 7.5, r.cy + k, 0.02);
        }
        // postes de luz (con colisión)
        const pole = mat(0x2a2d31, { metalness: 0.6, roughness: 0.4 });
        for (const [x, y] of LAMPS) {
          put(g, new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, 5.0, 10), pole), x, y, 2.5);
          put(g, new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.08), pole), x + 0.4, y, 4.9);
          put(g, new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.15, 0.3), mat(0xfff3c4, { emissive: 0xffe9a0, emissiveIntensity: 1.2 })), x + 0.8, y, 4.8);
        }
        // terraza: mesas y sombrillas (con colisión) y gente
        const umbr = [mat(0x2e7d32), mat(0xc62828), mat(0xf2b705)];
        UMBRELLAS.forEach(([x, y], i) => {
          put(g, new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.2, 8), mat(0xdddddd)), x, y, 1.1);
          put(g, new THREE.Mesh(new THREE.ConeGeometry(1.15, 0.5, 12, 1, true), umbr[i % 3]), x, y, 2.2).material.side = THREE.DoubleSide;
          put(g, new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.05, 18), mat(0xf4f1ea)), x, y, 0.75);
          put(g, new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.75, 8), mat(0x777777)), x, y, 0.37);
          for (const [dx, dy, col] of [[0.8, 0, 0x2b62d8], [-0.8, 0.1, 0x8c47e6]]) {          // gente sentada
            put(g, new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.5, 4, 8), mat(col)), x + dx, y + dy, 0.75);
            put(g, new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), mat(0xd9a77a)), x + dx, y + dy, 1.35);
          }
        });
        return g;
      },
    };
  },
};

export const LUGARES = { casa, finca, restaurante };

/** El mundo de un pedido: el lugar armado + las tomas del pedido + todo lo de colisión para el vuelo. */
export function mundoLugar(id, pedido) {
  const L = (LUGARES[id] || casa).build();
  const shots = tomasPedido(pedido, L.subject, L.frente);
  const world = { kind: "campo", spawn: [0, 0, 0], trees: L.trees, backdrop: [], boxes: [], columns: [], fog: 0.008 };
  return { ...L, world, shots };
}

/** Distancia máxima a la base que piden las rutas de un pedido (para el alcance de la radio). */
export function alcanceNecesario(shots) {
  let m = 0;
  for (const t of shots) for (const p of t.path(48)) m = Math.max(m, Math.hypot(p[0], p[1], p[2]));
  return m + 1.5;
}
