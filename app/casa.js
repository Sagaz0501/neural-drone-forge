// =====================================================================
// LA CASA del primer pedido ("Fotos de una casa en venta"): sus cajas de colisión (las mismas que
// drone_rl/level.py house_boxes, con las que entrena la IA) y cómo se ve (paredes, techo de dos
// aguas, puerta, ventanas, chimenea, cerca y el letrero de SE VENDE).
// =====================================================================
import * as THREE from "three";
import { V } from "../game/scene.js";
import { Toma } from "../game/sim.js";

/** Igual que drone_rl/level.py house_boxes: paredes + techo en dos escalones. w = largo en x, d = ancho en y. */
export function houseBoxes(cx, cy, w, d, wallH) {
  const rh = 0.35 * d, eave = 0.3;
  return [
    { min: [cx - w / 2, cy - d / 2, 0], max: [cx + w / 2, cy + d / 2, wallH] },
    { min: [cx - w / 2 - eave, cy - d / 2 - eave, wallH], max: [cx + w / 2 + eave, cy + d / 2 + eave, wallH + rh / 2] },
    { min: [cx - w / 2 - eave, cy - d / 4, wallH + rh / 2], max: [cx + w / 2 + eave, cy + d / 4, wallH + rh] },
  ];
}

export const CASA = { cx: 14, cy: 3, w: 6.5, d: 5.0, wallH: 3.0 };

/** Hacia dónde mira el frente de la casa (hacia la base, en el origen). */
export const frente = () => Math.atan2(0 - CASA.cy, 0 - CASA.cx);

/**
 * Las tomas de un pedido como rutas de cámara (Toma de game/sim.js, la misma de drone_rl/tomas.py).
 * Los ángulos del pedido son en grados y relativos al frente del sujeto (fr = hacia dónde mira, rad).
 */
export function tomasPedido(pedido, subject, fr = frente()) {
  const f = fr, rad = (g) => (g * Math.PI) / 180, [sx, sy] = subject;
  return (pedido?.tomas || []).map((t) => {
    let toma;
    if (t.tipo === "fija") {
      const a = f + rad(t.az);
      toma = new Toma("fija", subject, t.dur, { x: sx + t.d * Math.cos(a), y: sy + t.d * Math.sin(a), z: t.z });
    } else if (t.tipo === "orbita") {
      const sweep = rad(t.sweep);
      toma = new Toma("orbita", subject, Math.max(6, (t.r * Math.abs(sweep)) / t.vel), { r: t.r, z: t.z, a0: f + rad(t.a0), sweep });
    } else {
      toma = new Toma("revelar", subject, t.dur, { az: f + rad(t.az), d0: t.d0, d1: t.d1, z0: t.z0, z1: t.z1 });
    }
    toma.nombre = t.nombre;
    toma.desc = t.desc;
    return toma;
  });
}

/** Todo lo que se ve de la casa (sin colisiones: esas son las cajas). */
export function casaView() {
  const h = CASA, g = new THREE.Group();
  const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, ...o });
  const put = (mesh, x, y, z) => { mesh.position.copy(V(x, y, z)); mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh); return mesh; };
  // paredes (en Three: x = x, y = arriba, z = -y)
  put(new THREE.Mesh(new THREE.BoxGeometry(h.w, h.wallH, h.d), mat(0xeadfc4)), h.cx, h.cy, h.wallH / 2);
  put(new THREE.Mesh(new THREE.BoxGeometry(h.w + 0.06, 0.25, h.d + 0.06), mat(0x9b8b74)), h.cx, h.cy, 0.12);    // zócalo
  // techo de dos aguas (cumbrera a lo largo de x)
  const rh = 0.35 * h.d, eave = 0.3;
  const tri = new THREE.Shape();
  tri.moveTo(-(h.d / 2 + eave), 0); tri.lineTo(h.d / 2 + eave, 0); tri.lineTo(0, rh); tri.lineTo(-(h.d / 2 + eave), 0);
  const roofGeo = new THREE.ExtrudeGeometry(tri, { depth: h.w + 2 * eave, bevelEnabled: false });
  roofGeo.translate(0, 0, -(h.w + 2 * eave) / 2);
  roofGeo.rotateY(Math.PI / 2);                         // el largo del techo -> eje x
  const roof = new THREE.Mesh(roofGeo, mat(0xa94a33, { roughness: 0.7 }));
  roof.position.copy(V(h.cx, h.cy, h.wallH));
  roof.castShadow = roof.receiveShadow = true;
  g.add(roof);
  // hastial (el triángulo de la pared bajo el techo, en las dos puntas)
  const gab = new THREE.Shape();
  gab.moveTo(-h.d / 2, 0); gab.lineTo(h.d / 2, 0); gab.lineTo(0, rh * 0.92); gab.lineTo(-h.d / 2, 0);
  for (const sx of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.ShapeGeometry(gab), mat(0xeadfc4, { side: THREE.DoubleSide }));
    m.rotation.y = Math.PI / 2;
    m.position.copy(V(h.cx + sx * (h.w / 2 + 0.001), h.cy, h.wallH));
    g.add(m);
  }
  // chimenea
  put(new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.3, 0.5), mat(0x8a5040)), h.cx + 1.6, h.cy - 0.9, h.wallH + rh * 0.55);
  // frente (mira hacia la salida: el lado -x): puerta, ventanas, escalón
  const fx = h.cx - h.w / 2 - 0.02;
  const door = put(new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.0, 1.0), mat(0x6b3f22, { roughness: 0.6 })), fx, h.cy, 1.0);
  void door;
  put(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), mat(0xd9b34a, { metalness: 0.8, roughness: 0.3 })), fx - 0.04, h.cy - 0.35, 1.0);
  put(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.15, 1.6), mat(0x9b9590)), fx - 0.45, h.cy, 0.07);
  const glass = mat(0x9cc8e6, { roughness: 0.15, metalness: 0.2, emissive: 0x24394a, emissiveIntensity: 0.4 });
  const frame = mat(0xffffff, { roughness: 0.5 });
  const win = (x, y, z, rotY) => {
    const w = new THREE.Group();
    const gl = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.9, 1.0), glass);
    const fr = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.04, 1.14), frame);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 1.0), frame);
    fr.position.x = -0.01;
    w.add(fr, gl, bar);
    w.rotation.y = rotY;
    w.position.copy(V(x, y, z));
    g.add(w);
  };
  win(fx, h.cy - 1.6, 1.6, 0); win(fx, h.cy + 1.6, 1.6, 0);
  for (const x of [h.cx - 1.6, h.cx + 1.6]) { win(x, h.cy - h.d / 2 - 0.02, 1.6, Math.PI / 2); win(x, h.cy + h.d / 2 + 0.02, 1.6, -Math.PI / 2); }
  win(h.cx + h.w / 2 + 0.02, h.cy, 1.6, Math.PI);
  // cerca blanca bajita alrededor del jardín (decorado: no estorba el vuelo)
  const post = new THREE.BoxGeometry(0.08, 0.7, 0.08), rail = mat(0xf4f1ea);
  const fence = [];
  const R = { x0: h.cx - h.w / 2 - 3.2, x1: h.cx + h.w / 2 + 1.5, y0: h.cy - h.d / 2 - 2, y1: h.cy + h.d / 2 + 2 };
  for (let x = R.x0; x <= R.x1 + 1e-6; x += 1.2) fence.push([x, R.y0], [x, R.y1]);
  for (let y = R.y0 + 1.2; y < R.y1 - 0.1; y += 1.2) { fence.push([R.x1, y]); if (Math.abs(y - h.cy) > 1.2) fence.push([R.x0, y]); }
  const im = new THREE.InstancedMesh(post, rail, fence.length);
  const m4 = new THREE.Matrix4();
  fence.forEach(([x, y], i) => im.setMatrixAt(i, m4.makeTranslation(...V(x, y, 0.35).toArray())));
  im.castShadow = true;
  g.add(im);
  for (const [a, b] of [[[R.x0, R.y0], [R.x1, R.y0]], [[R.x0, R.y1], [R.x1, R.y1]], [[R.x1, R.y0], [R.x1, R.y1]],
    [[R.x0, R.y0], [R.x0, h.cy - 1.2]], [[R.x0, h.cy + 1.2], [R.x0, R.y1]]]) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const r = new THREE.Mesh(new THREE.BoxGeometry(L, 0.07, 0.04), rail);
    r.position.copy(V((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0.55));
    r.rotation.y = Math.atan2(b[1] - a[1], b[0] - a[0]);
    g.add(r);
  }
  // camino de piedra a la puerta
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.34, 0.04, 10), mat(0xa8a196));
    s.position.copy(V(fx - 1.1 - i * 0.75, h.cy + Math.sin(i) * 0.15, 0.02));
    s.receiveShadow = true;
    g.add(s);
  }
  // letrero SE VENDE
  const c = document.createElement("canvas");
  c.width = 256; c.height = 160;
  const x2 = c.getContext("2d");
  x2.fillStyle = "#f4f1ea"; x2.fillRect(0, 0, 256, 160);
  x2.fillStyle = "#c62828"; x2.fillRect(0, 0, 256, 54);
  x2.fillStyle = "#fff"; x2.font = "700 40px 'Chakra Petch', sans-serif"; x2.textAlign = "center"; x2.fillText("SE VENDE", 128, 42);
  x2.fillStyle = "#222"; x2.font = "600 26px 'Chakra Petch', sans-serif"; x2.fillText("Inmobiliaria", 128, 98); x2.fillText("Doña Marta", 128, 134);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.62, 1.0), mat(0xf4f1ea));
  sign.position.copy(V(R.x0 - 0.6, h.cy - 2.6, 1.3));
  sign.castShadow = true;
  g.add(sign);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.98, 0.6), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
  face.rotation.y = -Math.PI / 2;                         // mira hacia la salida (-x)
  face.position.copy(V(R.x0 - 0.63, h.cy - 2.6, 1.3));
  g.add(face);
  put(new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.1, 0.07), mat(0x6b4a2a)), R.x0 - 0.6, h.cy - 2.6, 0.55);
  // un arbusto o dos junto a la casa
  const bush = mat(0x3f7a2a, { roughness: 0.9 });
  for (const [x, y, r] of [[fx - 0.5, h.cy - 1.9, 0.45], [fx - 0.5, h.cy + 1.9, 0.5], [h.cx + 2.5, h.cy - h.d / 2 - 0.6, 0.4]]) {
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), bush);
    b.position.copy(V(x, y, r * 0.7));
    b.castShadow = true;
    g.add(b);
  }
  return g;
}

/**
 * Las rutas de las tomas (solo las ve el piloto, no salen en el video): la toma de ahora en celeste brillante,
 * las que faltan tenues, las hechas en verde; un aro en el inicio y un "fantasma" (el punto de cámara) que avanza.
 */
export class RutasView {
  constructor(shots) {
    this.group = new THREE.Group();
    this.shots = shots;
    this.lines = shots.map((t) => {
      const pts = t.path(64).map((q) => V(...q));
      const line = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 96, 0.05, 6, false),
        new THREE.MeshBasicMaterial({ color: 0x3ccbff, transparent: true, opacity: 0.25, depthWrite: false }));
      this.group.add(line);
      return line;
    });
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.05, 10, 48), new THREE.MeshBasicMaterial({ color: 0x3ccbff }));
    this.ghost = new THREE.Group();
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), new THREE.MeshBasicMaterial({ color: 0x47f08a, transparent: true, opacity: 0.25, depthWrite: false }));
    this.ghost.add(core, halo);
    this.halo = halo;
    this.stem = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 }));
    this.group.add(this.ring, this.ghost, this.stem);
  }
  /** k = toma de ahora (shots.length = todas hechas) · q = calidad de este instante (colorea el fantasma). */
  update(k, q, t) {
    this.lines.forEach((l, i) => {
      l.material.color.setHex(i < k ? 0x47f08a : 0x3ccbff);
      l.material.opacity = i === k ? 0.85 : i < k ? 0.3 : 0.18;
    });
    const sh = this.shots[k];
    this.ring.visible = this.ghost.visible = this.stem.visible = !!sh;
    if (!sh) return;
    const st = sh.start(), p = sh.point(), s = sh.subject;
    this.ring.visible = sh.phase === "ir";
    this.ring.position.copy(V(...st));
    this.ring.lookAt(V(s[0], s[1], st[2]));                        // el aro mira hacia la casa: entras de frente
    this.ring.scale.setScalar(1 + 0.08 * Math.sin(t * 5));
    this.ghost.position.copy(V(...p));
    this.halo.material.color.setRGB(q < 0.5 ? 1 : 1 - 1.6 * (q - 0.5), q < 0.5 ? 0.25 + 1.3 * q : 0.95, 0.25);
    this.stem.scale.y = Math.max(p[2], 0.01);
    this.stem.position.copy(V(p[0], p[1], p[2] / 2));
  }
}
