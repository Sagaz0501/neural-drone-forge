// =====================================================================
// EL DRON EN 3D, armado con sus piezas: chasis (madera, PLA, aluminio, carbono), motores, hélices,
// batería, controladora y cámara. Lo usan el taller (girando en la mesa) y el vuelo.
// Ejes como game/scene.js makeDrone: X adelante, Y arriba, -Z izquierda (poseDrone lo orienta).
// =====================================================================
import * as THREE from "three";
import { STL_CACHE } from "./stl.js";

const MAT = {};
function m(key, opts) {
  if (!MAT[key]) MAT[key] = new THREE.MeshStandardMaterial({ roughness: 0.6, ...opts });
  return MAT[key];
}

/** Madera con vetas (textura dibujada una vez). */
function woodTexture() {
  if (MAT._wood) return MAT._wood;
  const c = document.createElement("canvas");
  c.width = 64; c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = "#b07a45";
  g.fillRect(0, 0, 64, 256);
  for (let i = 0; i < 40; i++) {
    g.strokeStyle = i % 3 ? "rgba(120,72,32,0.45)" : "rgba(214,160,100,0.5)";
    g.lineWidth = 1 + (i % 4);
    g.beginPath();
    const x = (i * 37) % 64;
    g.moveTo(x, 0);
    for (let y = 0; y <= 256; y += 16) g.lineTo(x + Math.sin(y * 0.05 + i) * 3, y);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  MAT._wood = t;
  return t;
}

/** Material del chasis: el de fábrica, o pintado con el color que elegiste (la madera conserva sus vetas). */
function frameMat(id, color) {
  const def = { madera: null, pla: "#ff7a1a", petg: "#2b62d8", aluminio: "#b8bec6", cinewhoop3: "#2a2c30", carbono5: "#16171a", carbono7: "#16171a" }[id];
  const metal = id === "aluminio", wood = id === "madera";
  const col = color || def || "#ffffff";
  const key = `frame_${id}_${col}`;
  if (wood && (!color || color === "#b07a45")) return m("wood", { map: woodTexture(), roughness: 0.85 });
  return m(key, { color: col, map: wood ? woodTexture() : null, metalness: metal ? 0.85 : 0, roughness: metal ? 0.3 : id.startsWith("carbono") ? 0.35 : 0.55 });
}
const FRAME_DIM = { madera: [0.03, 0.014], pla: [0.022, 0.01], petg: [0.022, 0.01], aluminio: [0.018, 0.008], cinewhoop3: [0.02, 0.008],
  carbono5: [0.016, 0.005], carbono7: [0.018, 0.006] };
/** Ángulo de cada brazo (grados, desde adelante) según la forma: X, H o deadcat (brazos de adelante abiertos). */
const FORMAS = { x: [45, 135, 225, 315], h: [40, 140, 220, 320], deadcat: [62, 135, 225, 298], stretch: [35, 145, 215, 325], marco: [45, 135, 225, 315] };
/** Material "fantasma": la pieza elegida que todavía no instalas en el banco. */
const FANTASMA = new THREE.MeshBasicMaterial({ color: 0x3ccbff, transparent: true, opacity: 0.2, depthWrite: false });
const MOTOR_R = { m1806: 0.012, m2204: 0.014, m2306: 0.016, m2207: 0.016, m2806: 0.019 };
const MOTOR_BELL = { m1806: 0x8a8f96, m2204: 0x2a62d8, m2306: 0xd8262a, m2207: 0xe0c020, m2806: 0x7a3fd0 };

/**
 * build = ids de las piezas (cualquiera puede faltar: el taller muestra lo que hay). Además (opcionales):
 *   diseno {tipo: "forma", forma} | {tipo: "stl", id}   la forma del chasis impreso o tu STL
 *   canopy {tipo: "domo"|"caja"|"aleta"|"stl", id}     la carcasa impresa
 *   visuales {controladora: stlId, camara: stlId}      cómo se ve una pieza (tu STL; no cambia nada más)
 *   fantasma [slots]  piezas elegidas pero sin instalar (se ven transparentes)
 *   cables bool       los cables soldados (después de cablear en el banco)
 *   sinHelices bool   el banco: los motores se prueban sin hélices
 * Devuelve un Group con userData = { body, props, slots: {chasis: Group, …}, camPos, corners }.
 */
export function buildDrone(build, cat) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const slots = {};
  const slot = (k) => { const g = new THREE.Group(); g.name = k; body.add(g); slots[k] = g; return g; };
  const find = (ranura, id) => (cat[ranura] || []).find((p) => p.id === id);
  const ch = find("chasis", build.chasis), mo = find("motores", build.motores), he = find("helices", build.helices);
  const est = build.estilo || {};
  const extras = new Set(build.extras || []);
  const ba = find("baterias", build.bateria), fc = find("controladoras", build.controladora), ca = find("camaras", build.camara);
  const R = ch ? ch.radio_m * 0.78 : 0.15;          // centro -> motor (m)
  const box = (g, sx, sy, sz, mat, x, y, z, ry = 0) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    b.position.set(x, y, z); b.rotation.y = ry; b.castShadow = true; b.receiveShadow = true; g.add(b); return b;
  };
  const cyl = (g, r, h, mat, x, y, z, seg = 18) => {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat);
    c.position.set(x, y, z); c.castShadow = true; g.add(c); return c;
  };
  const dis = build.diseno || (ch?.imprimible ? { tipo: "forma", forma: est.forma || "x" } : null);
  const stlCh = dis?.tipo === "stl" ? STL_CACHE.get(dis.id) : null;
  const forma = dis?.tipo === "forma" && FORMAS[dis.forma] ? dis.forma : "x";
  let corners = FORMAS[forma].map((deg) => { const a = (deg * Math.PI) / 180; const k = forma === "stretch" ? 1.12 : 1; return { a, x: Math.cos(a) * R * k, z: -Math.sin(a) * R * k }; });
  if (stlCh) corners = stlCh.meta.esquinas_m.map(([x, y]) => ({ a: Math.atan2(y, x), x, z: -y }));

  // ---- chasis ----
  if (ch) {
    const g = slot("chasis"), [fw, fh] = FRAME_DIM[ch.id] || [0.02, 0.008];
    const f = { arm: frameMat(ch.id, est.color), w: fw, h: fh };
    f.plate = f.arm;
    if (stlCh) {                                       // tu diseño (STL), impreso en el material del chasis
      const mesh = new THREE.Mesh(stlCh.geo, f.arm);
      mesh.castShadow = mesh.receiveShadow = true;
      g.add(mesh);
    } else if (forma === "h") {                        // H: dos largueros a los lados y un travesaño
      for (const sz of [-1, 1]) box(g, 2 * Math.abs(corners[0].x) + 0.03, f.h, f.w, f.arm, 0, f.h / 2, sz * Math.abs(corners[0].z));
      box(g, f.w * 1.4, f.h, 2 * Math.abs(corners[0].z), f.arm, 0, f.h / 2, 0);
    } else {
      for (const c of corners) box(g, Math.hypot(c.x, c.z) + 0.02, f.h, f.w, f.arm, c.x / 2, f.h / 2, c.z / 2, c.a);
      if (forma === "marco") {                         // un aro que une las puntas (aguanta golpes)
        for (let i = 0; i < 4; i++) {
          const c1 = corners[i], c2 = corners[(i + 1) % 4], L = Math.hypot(c2.x - c1.x, c2.z - c1.z);
          box(g, L, f.h * 0.8, f.w * 0.6, f.arm, (c1.x + c2.x) / 2 * 1.12, f.h / 2, (c1.z + c2.z) / 2 * 1.12, -Math.atan2(c2.z - c1.z, c2.x - c1.x));
        }
      }
    }
    if (!stlCh) {
      box(g, 0.11, f.h, 0.075, f.plate, 0, f.h / 2, 0);
      box(g, 0.1, f.h * 0.6, 0.07, f.plate, 0, 0.042, 0);
    }
    if (ch.id === "cinewhoop3") {                      // los ductos alrededor de cada hélice
      const L = 0.0254 * 3;
      for (const c of corners) {
        const duct = new THREE.Mesh(new THREE.CylinderGeometry(L / 2 + 0.008, L / 2 + 0.008, 0.03, 28, 1, true), m("duct_" + (est.color || "def"), { color: est.color || "#2a2c30", side: THREE.DoubleSide, roughness: 0.6 }));
        duct.position.set(c.x, 0.045, c.z);
        duct.castShadow = true;
        g.add(duct);
      }
    }
    for (const sx of [-0.04, 0.04]) for (const sz of [-0.028, 0.028]) cyl(g, 0.003, 0.034, m("std", { color: 0x9a9a9a, metalness: 0.8, roughness: 0.3 }), sx, 0.025, sz, 6);
    if (ch.id === "madera") {                           // tornillos y cinta: hecho en casa
      for (const c of corners) cyl(g, 0.004, f.h + 0.004, m("screw", { color: 0x6b6b6b, metalness: 0.8 }), c.x * 0.55, f.h / 2, c.z * 0.55, 6);
      box(g, 0.02, f.h + 0.002, f.w + 0.004, m("tape", { color: 0x2b2b2b, roughness: 0.9 }), corners[0].x * 0.3, f.h / 2, corners[0].z * 0.3, corners[0].a);
    }
  }
  // ---- motores ----
  const props = [];
  if (mo) {
    const g = slot("motores"), r = MOTOR_R[mo.id] || 0.014;
    for (const c of corners) {
      cyl(g, r * 1.1, 0.006, m("mount", { color: 0x222428 }), c.x, 0.017, c.z);
      cyl(g, r, 0.016, m("stator", { color: 0x2a2c30, metalness: 0.9, roughness: 0.3 }), c.x, 0.028, c.z);
      cyl(g, r * 1.02, 0.007, m("bell" + mo.id, { color: MOTOR_BELL[mo.id] || 0x888888, metalness: 0.8, roughness: 0.3 }), c.x, 0.039, c.z);
    }
  }
  // ---- hélices ----
  if (he && !build.sinHelices) {
    const g = slot("helices"), L = (he.pulgadas * 0.0254);
    corners.forEach((c, i) => {
      const p = new THREE.Group();
      const front = Math.cos(c.a) > 0;
      const acc = est.acento || "#ff7a1a";
      const blade = new THREE.Mesh(new THREE.BoxGeometry(L, 0.002, 0.011 + he.pulgadas * 0.001),
        m(front ? "propF_" + acc : "propB", { color: front ? acc : 0x3c4046, roughness: 0.45 }));
      blade.castShadow = true;
      p.add(blade);
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(L / 2, L / 2, 0.001, 32),
        new THREE.MeshBasicMaterial(front ? { color: est.acento || 0xff7a1a, transparent: true, opacity: 0.25, depthWrite: false }
          : { color: 0x8a9096, transparent: true, opacity: 0.14, depthWrite: false }));
      p.add(disc);
      p.position.set(c.x, 0.046, c.z);
      p.userData = { dir: i % 2 ? -1 : 1, disc, blade };
      g.add(p);
      props.push(p);
    });
  }
  // ---- batería (encima, con correa) ----
  if (ba) {
    const g = slot("bateria"), k = Math.cbrt(ba.masa_g / 120);
    const lx = 0.075 * k, ly = 0.026 * k, lz = 0.036 * k;
    box(g, lx, ly, lz, m("batt" + ba.celdas, { color: ba.id === "b4s3000" ? 0x2f6b3a : 0x15161a, roughness: 0.5 }), -0.005, 0.05 + ly / 2, 0);
    box(g, lx * 0.7, 0.001, lz + 0.002, m("label" + ba.celdas, { color: [0, 0, 0xf2c00c, 0x3ccbff, 0xff5a3a][ba.celdas] || 0xf2c00c }), -0.005, 0.05 + ly + 0.0005, 0);
    box(g, 0.012, ly + 0.004, lz + 0.006, m("strap", { color: 0xd93a2a, roughness: 0.8 }), -0.005, 0.05 + ly / 2, 0);
  }
  // ---- controladora (adentro; GPS en un mástil; chip de IA con luz) ----
  if (fc) {
    const g = slot("controladora"), vis = STL_CACHE.get(build.visuales?.controladora);
    if (vis) { const mm = new THREE.Mesh(vis.geo, m("pcbStl", { color: 0x1d6b3a, roughness: 0.5 })); mm.position.y = 0.028; g.add(mm); }
    else box(g, 0.036, 0.004, 0.036, m(fc.id.startsWith("fc_b") ? "pcbEsp" : "pcb", { color: fc.id.startsWith("fc_b") ? 0x14143a : 0x1d6b3a, roughness: 0.5 }), 0, 0.03, 0);
    if (fc.id.startsWith("fc_b")) box(g, 0.018, 0.003, 0.025, m("espCan", { color: 0xb8bec6, metalness: 0.8, roughness: 0.3 }), 0.004, 0.0335, 0);   // el módulo ESP32 (lata metálica)
    else box(g, 0.01, 0.0025, 0.01, m("mcu", { color: 0x111111, roughness: 0.4 }), 0, 0.0333, 0);                                               // el chip STM32
    if (fc.id === "fc_gps" || fc.id === "fc_ia") {
      cyl(g, 0.002, 0.05, m("mast", { color: 0x333333 }), -0.045, 0.075, 0, 6);
      cyl(g, 0.014, 0.006, m("gps", { color: 0xeaeaea, roughness: 0.4 }), -0.045, 0.102, 0);
    }
    if (fc.id === "fc_ia") box(g, 0.016, 0.004, 0.016, m("chip", { color: 0x0b1a2a, emissive: 0x3ccbff, emissiveIntensity: 1.6 }), 0.012, 0.0335, 0);
    if (fc.id === "fc_baro") box(g, 0.008, 0.004, 0.008, m("baro", { color: 0xe0e0e0 }), 0.01, 0.0335, 0.01);
  }
  // ---- cámara (adelante; con gimbal cuelga abajo) ----
  let camPos = new THREE.Vector3(0.07, 0.03, 0);
  const visCam = STL_CACHE.get(build.visuales?.camara);
  if (ca && visCam) {
    const g = slot("camara"), mm = new THREE.Mesh(visCam.geo, m("cam", { color: 0x1b1c20, roughness: 0.4 }));
    mm.position.set(0.065, 0.02, 0); g.add(mm);
  } else if (ca) {
    const g = slot("camara");
    if (ca.id === "cam_juguete") {
      box(g, 0.02, 0.016, 0.024, m("toy", { color: 0xf2f2f2, roughness: 0.5 }), 0.06, 0.03, 0);
      const l = cyl(g, 0.005, 0.006, m("lens", { color: 0x111118, roughness: 0.05 }), 0.072, 0.03, 0);
      l.rotation.z = Math.PI / 2;
      camPos = new THREE.Vector3(0.076, 0.03, 0);
    } else if (ca.id === "cam_gimbal" || ca.id === "cam_gimbal2") {
      cyl(g, 0.003, 0.03, m("gimbalArm", { color: 0x222222 }), 0.05, 0.0, 0, 6);
      box(g, 0.004, 0.03, 0.04, m("gimbalArm", {}), 0.05, -0.02, 0);
      box(g, 0.036, 0.03, 0.032, m("cam", { color: 0x1b1c20, roughness: 0.4 }), 0.055, -0.03, 0);
      const l = cyl(g, 0.009, 0.01, m("lens", { color: 0x111118, roughness: 0.05 }), 0.077, -0.03, 0);
      l.rotation.z = Math.PI / 2;
      camPos = new THREE.Vector3(0.085, -0.03, 0);
    } else {
      const s = ca.id === "cam_4k" ? 1.25 : 1;
      box(g, 0.032 * s, 0.024 * s, 0.04 * s, m("cam", { color: 0x1b1c20, roughness: 0.4 }), 0.065, 0.03, 0);
      const l = cyl(g, 0.007 * s, 0.008, m("lens", { color: 0x111118, roughness: 0.05 }), 0.065 + 0.018 * s, 0.03, 0);
      l.rotation.z = Math.PI / 2;
      camPos = new THREE.Vector3(0.09 * s, 0.03, 0);
    }
  }
  // ---- extras: protectores, sensores ToF, luces LED; antena de la radio ----
  if (extras.size || build.radio) {
    const g = slot("extras");
    if (extras.has("protectores") && he && ch?.id !== "cinewhoop3") {
      const L = he.pulgadas * 0.0254;
      for (const c of corners) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(L / 2 + 0.01, 0.003, 6, 36), m("guard", { color: 0xf2f2f2, roughness: 0.5 }));
        ring.rotation.x = Math.PI / 2;
        ring.position.set(c.x, 0.046, c.z);
        g.add(ring);
      }
    }
    if (extras.has("tof")) {
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4;
        box(g, 0.008, 0.006, 0.008, m("tof", { color: 0x111111, emissive: 0x220000, emissiveIntensity: 1 }), Math.cos(a) * 0.05, 0.022, -Math.sin(a) * 0.04);
      }
    }
    if (extras.has("luces")) {
      for (const c of corners) box(g, 0.05, 0.003, 0.006, m("led_" + (est.acento || "a"), { color: est.acento || "#3ccbff", emissive: est.acento || "#3ccbff", emissiveIntensity: 2 }), c.x * 0.55, -0.002, c.z * 0.55, c.a);
    }
  }
  // ---- radio: receptor ExpressLRS (placa chiquita) o antena del ESP32 ----
  const ant = { rx_espnow_ant: 0.06, rx_elrs24: 0.035, rx_elrs900: 0.08 }[build.radio];
  if (ant) {
    const g = slot("radio");
    if (build.radio !== "rx_espnow_ant") box(g, 0.012, 0.003, 0.018, m("rxpcb", { color: 0x222266, roughness: 0.5 }), -0.045, 0.036, 0.012);
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.0025, ant, 6), m("antena", { color: 0x111111 }));
    st.position.set(-0.05, 0.05 + ant / 2, 0.015);
    st.rotation.z = 0.35;
    st.castShadow = true;
    g.add(st);
  }
  // ---- ESC 4 en 1 (abajo de la controladora, con el cable XT60 saliendo para atrás) ----
  if (build.esc) {
    const g = slot("esc");
    box(g, 0.038, 0.004, 0.038, m("escpcb", { color: 0x15161a, roughness: 0.5 }), 0, 0.019, 0);
    for (const [x, z] of [[0.012, 0.012], [-0.012, 0.012], [0.012, -0.012], [-0.012, -0.012]]) box(g, 0.006, 0.002, 0.006, m("mosfet", { color: 0x333333 }), x, 0.0215, z);
    cyl(g, 0.004, 0.012, m("capa", { color: 0x2a3a6a, roughness: 0.4 }), -0.022, 0.024, 0, 10);
    box(g, 0.012, 0.007, 0.016, m("xt60", { color: 0xe8c020, roughness: 0.5 }), -0.075, 0.03, 0);
  }
  // ---- carcasa impresa (canopy) ----
  if (build.canopy && build.canopy.tipo && build.canopy.tipo !== "ninguna") {
    const g = slot("canopy"), cm = m("canopy_" + (est.acento || "a"), { color: est.acento || "#ff7a1a", roughness: 0.55 });
    const t = build.canopy.tipo, stlC = t === "stl" ? STL_CACHE.get(build.canopy.id) : null;
    if (stlC) { const mm = new THREE.Mesh(stlC.geo, cm); mm.position.y = 0.035; mm.castShadow = true; g.add(mm); }
    else if (t === "domo") { const d = new THREE.Mesh(new THREE.SphereGeometry(0.03, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), cm); d.scale.set(1.3, 0.8, 1); d.position.y = 0.036; d.castShadow = true; g.add(d); }
    else if (t === "caja") { box(g, 0.05, 0.018, 0.042, cm, 0, 0.045, 0); for (let i = -1; i <= 1; i++) box(g, 0.03, 0.001, 0.004, m("vent", { color: 0x111111 }), 0, 0.0545, i * 0.01); }
    else if (t === "aleta") { box(g, 0.05, 0.012, 0.036, cm, 0, 0.042, 0); box(g, 0.035, 0.022, 0.004, cm, -0.012, 0.058, 0); }
  }
  // ---- cables soldados (después de cablear en el banco) ----
  if (build.cables) {
    const g = slot("cables");
    const tubo = (pts, color, r = 0.0012) => {
      const t = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((q) => new THREE.Vector3(...q))), 12, r, 5), m("w" + color, { color, roughness: 0.6 }));
      g.add(t);
    };
    tubo([[-0.075, 0.03, 0.004], [-0.06, 0.04, 0.006], [-0.03, 0.05, 0.005], [-0.005, 0.052, 0.004]], 0xd02020, 0.0018);
    tubo([[-0.075, 0.03, -0.004], [-0.06, 0.04, -0.006], [-0.03, 0.05, -0.005], [-0.005, 0.052, -0.004]], 0x151515, 0.0018);
    for (const c of corners) for (const [k, col] of [[-1, 0x111111], [0, 0x2050d0], [1, 0xd03030]]) {
      const off = 0.0025 * k, nx = -Math.sin(c.a) * off, nz = -Math.cos(c.a) * off;
      tubo([[c.x * 0.2 + nx, 0.021, c.z * 0.2 + nz], [c.x * 0.6 + nx, 0.012, c.z * 0.6 + nz], [c.x * 0.92 + nx, 0.018, c.z * 0.92 + nz]], col, 0.0008);
    }
  }
  // ---- luces de navegación: verde adelante, roja atrás (para ver hacia dónde mira) ----
  for (const c of corners) {
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.004, 0.01),
      new THREE.MeshBasicMaterial({ color: Math.cos(c.a) > 0 ? 0x2bff5a : 0xff2a1a }));
    led.position.set(c.x * 0.6, 0.002, c.z * 0.6);
    body.add(led);
  }
  // piezas elegidas pero sin instalar: se ven como fantasma
  for (const k of build.fantasma || []) slots[k]?.traverse((o) => { if (o.isMesh) { o.material = FANTASMA; o.castShadow = false; } });
  root.userData = { body, props, slots, camPos, corners, radius: R + (he ? he.pulgadas * 0.0127 : 0.06) };
  return root;
}

/** Animación de "pieza nueva": la ranura crece desde 0 (el taller la llama al poner una pieza). */
export function popIn(drone, slotName) {
  const g = drone.userData.slots[slotName];
  if (g) { g.scale.setScalar(0.01); g.userData.pop = 0; }
}

export function tickPop(drone, dt) {
  for (const g of Object.values(drone.userData.slots)) {
    if (g.userData.pop === undefined) continue;
    g.userData.pop = Math.min(1, g.userData.pop + dt * 3.2);
    const t = g.userData.pop, k = 1 + 0.25 * Math.sin(t * Math.PI) * (1 - t);    // rebote suave
    g.scale.setScalar(Math.max(0.01, t * k));
    if (t >= 1) { g.scale.setScalar(1); delete g.userData.pop; }
  }
}

export function disposeDrone(drone) {
  drone.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
}
