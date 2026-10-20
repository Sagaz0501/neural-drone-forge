// =====================================================================
// STL: importar tus diseños (chasis, carcasas, la placa que quieras ver) y exportar las piezas del juego
// para imprimirlas de verdad. Sin dependencias: lee STL binario y ASCII, calcula el volumen (para el
// peso impreso), el tamaño y dónde quedan las puntas de los brazos (para poner los motores).
// Unidades: los STL vienen en milímetros con Z hacia arriba; el juego usa metros con Y hacia arriba.
// =====================================================================
import * as THREE from "three";
import { t, num } from "./i18n.js";

/** ArrayBuffer -> Float32Array de triángulos (x,y,z × 3 por triángulo), en mm, Z arriba. */
export function leerSTL(buf) {
  const dv = new DataView(buf);
  if (buf.byteLength >= 84) {
    const n = dv.getUint32(80, true);
    if (84 + n * 50 === buf.byteLength) {                  // binario
      const out = new Float32Array(n * 9);
      for (let i = 0; i < n; i++) {
        const o = 84 + i * 50 + 12;
        for (let k = 0; k < 9; k++) out[i * 9 + k] = dv.getFloat32(o + k * 4, true);
      }
      return out;
    }
  }
  const txt = new TextDecoder().decode(buf);                 // ASCII: "vertex x y z"
  const nums = [];
  const re = /vertex\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)/g;
  let m;
  while ((m = re.exec(txt))) nums.push(+m[1], +m[2], +m[3]);
  if (!nums.length || nums.length % 9) throw new Error(t("No parece un STL (ni binario ni ASCII)."));
  return new Float32Array(nums);
}

/**
 * Lo que sale de un STL: tamaño (mm), volumen (cm³), peso impreso, y para un chasis las 4 puntas de los
 * brazos (donde van los motores), el radio y las hélices que caben.
 * densidad g/cm³ (PLA 1,24 · PETG 1,27 · TPU 1,21); relleno = qué fracción del volumen queda sólida (paredes + relleno).
 */
export function analizar(tri, { escala = 1, densidad = 1.24, relleno = 0.45 } = {}) {
  let vol = 0;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < tri.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = tri.subarray(i, i + 9);
    vol += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
    for (let k = 0; k < 9; k++) { const a = k % 3, v = tri[i + k]; if (v < min[a]) min[a] = v; if (v > max[a]) max[a] = v; }
  }
  const cm3 = (Math.abs(vol) * escala ** 3) / 1000;
  const tam = max.map((v, i) => (v - min[i]) * escala);
  const centro = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, min[2]];
  // las puntas: en cada cuadrante (45°, 135°…) el punto más lejos del centro (en el plano XY del STL)
  const esquinas = [45, 135, 225, 315].map((deg) => {
    const a = (deg * Math.PI) / 180, ux = Math.cos(a), uy = Math.sin(a);
    let best = null, bd = -1;
    for (let i = 0; i < tri.length; i += 3) {
      const x = tri[i] - centro[0], y = tri[i + 1] - centro[1], r = Math.hypot(x, y);
      if (r < 1e-6 || (x * ux + y * uy) / r < Math.cos((30 * Math.PI) / 180)) continue;
      if (r > bd) { bd = r; best = [x, y]; }
    }
    return best ? [best[0] * escala * 0.9, best[1] * escala * 0.9] : [ux * 50 * escala, uy * 50 * escala];   // 90 %: el motor va antes de la punta
  });
  const radio_mm = esquinas.reduce((s, [x, y]) => s + Math.hypot(x, y), 0) / 4;
  let gap = Infinity;                                          // distancia entre motores vecinos
  for (let i = 0; i < 4; i++) { const [x1, y1] = esquinas[i], [x2, y2] = esquinas[(i + 1) % 4]; gap = Math.min(gap, Math.hypot(x2 - x1, y2 - y1)); }
  return {
    tam_mm: tam.map((v) => Math.round(v)), volumen_cm3: Math.round(cm3 * 10) / 10, masa_g: Math.round(cm3 * densidad * relleno),
    esquinas_m: esquinas.map(([x, y]) => [x / 1000, y / 1000]), radio_m: Math.round(radio_mm) / 1000,
    helice_max: Math.max(2, Math.floor((gap - 6) / 25.4)), centro, triangulos: tri.length / 9,
  };
}

/** Triángulos (mm, Z arriba) -> BufferGeometry del juego (metros, Y arriba, centrada, apoyada en y=0). */
export function geometria(tri, { escala = 1, centro = null } = {}) {
  const c = centro || analizar(tri).centro, n = tri.length / 3, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const x = (tri[i * 3] - c[0]) * escala, y = (tri[i * 3 + 1] - c[1]) * escala, z = (tri[i * 3 + 2] - c[2]) * escala;
    pos[i * 3] = x / 1000; pos[i * 3 + 1] = z / 1000; pos[i * 3 + 2] = -y / 1000;     // STL (x adelante, y izq., z arriba) -> juego
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** Cualquier objeto 3D del juego -> STL binario (mm, Z arriba), listo para el slicer. */
export function exportarSTL(obj, nombre = "dron_maker") {
  obj.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(obj.matrixWorld).invert();
  const tris = [];
  const v = new THREE.Vector3(), m = new THREE.Matrix4();
  obj.traverse((o) => {
    if (!o.isMesh || !o.geometry || o.material?.transparent || o.visible === false) return;
    m.multiplyMatrices(inv, o.matrixWorld);
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry, p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(m); tris.push(v.x * 1000, -v.z * 1000, v.y * 1000); }
  });
  return new Blob([stlBinario(tris, nombre)], { type: "model/stl" });
}

/** Triángulos (mm, Z arriba: un array o Float32Array, 9 números por triángulo) -> ArrayBuffer de un STL binario. */
export function stlBinario(tris, nombre = "dron_maker") {
  const n = tris.length / 9, buf = new ArrayBuffer(84 + n * 50), dv = new DataView(buf);
  const head = `Dron Maker: ${nombre}`.slice(0, 79);
  for (let i = 0; i < head.length; i++) dv.setUint8(i, head.charCodeAt(i) & 127);
  dv.setUint32(80, n, true);
  for (let i = 0; i < n; i++) {
    const o = 84 + i * 50, j = i * 9;
    const ux = tris[j + 3] - tris[j], uy = tris[j + 4] - tris[j + 1], uz = tris[j + 5] - tris[j + 2], wx = tris[j + 6] - tris[j], wy = tris[j + 7] - tris[j + 1], wz = tris[j + 8] - tris[j + 2];
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const l = Math.hypot(nx, ny, nz) || 1;
    dv.setFloat32(o, nx / l, true); dv.setFloat32(o + 4, ny / l, true); dv.setFloat32(o + 8, nz / l, true);
    for (let k = 0; k < 9; k++) dv.setFloat32(o + 12 + k * 4, tris[j + k], true);
  }
  return buf;
}

/** Las geometrías de los STL importados (las usa dron3d.js). id -> { geo, meta }. */
export const STL_CACHE = new Map();

/** Carga un STL del servidor (stl/<id>.stl) a la caché. */
export async function cargarSTL(item) {
  if (STL_CACHE.has(item.id)) return STL_CACHE.get(item.id);
  const r = await fetch(item.url || `/stl/${item.id}.stl`);
  if (!r.ok) throw new Error(t("No pude bajar {id}", { id: item.id }));
  const tri = leerSTL(await r.arrayBuffer());
  const meta = conStep(analizar(tri, { escala: item.escala || 1 }), item.step);
  const out = { geo: geometria(tri, { escala: item.escala || 1, centro: meta.centro }), meta, tri };
  STL_CACHE.set(item.id, out);
  return out;
}

/**
 * Lo que trae un STEP importado (index.json "step") pisa lo que se adivina del STL: el volumen de los sólidos
 * y los motores encontrados por los agujeros de las bases (en vez de las puntas de los brazos).
 */
export function conStep(meta, step) {
  if (!step) return meta;
  const m = { ...meta };
  if (step.volumen_cm3 > 0) { m.volumen_cm3 = Math.round(step.volumen_cm3 * 10) / 10; m.masa_g = Math.round(step.volumen_cm3 * 1.24 * 0.45); }
  const mo = step.motores_mm;
  if (Array.isArray(mo) && mo.length === 4 && mo.every((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite))) {
    m.esquinas_m = mo.map(([x, y]) => [x / 1000, y / 1000]);
    m.radio_m = Math.round(mo.reduce((s, [x, y]) => s + Math.hypot(x, y), 0) / 4) / 1000;
    let gap = Infinity;
    for (let i = 0; i < 4; i++) { const [x1, y1] = mo[i], [x2, y2] = mo[(i + 1) % 4]; gap = Math.min(gap, Math.hypot(x2 - x1, y2 - y1)); }
    m.helice_max = Math.max(2, Math.floor((gap - 6) / 25.4));
  }
  return m;
}

// ---------------- el análisis (la pantalla «Analizar»: ui_importar.js) ----------------
/** Los filamentos: densidad en g/cm³. */
export const MATERIALES = { pla: { nombre: "PLA", densidad: 1.24 }, petg: { nombre: "PETG", densidad: 1.27 }, tpu: { nombre: "TPU", densidad: 1.21 } };
/** Las camas de impresora del juego (lado en mm: 180³ la chica, 256³ la grande). */
export const CAMAS = [180, 256];
/** Qué fracción queda sólida con un relleno (paredes + techo/piso ≈ 20 % + el relleno en el resto). 30 % -> 0,44 (≈ el 0,45 de analizar). */
export const solido = (relleno) => 0.2 + 0.8 * relleno;
/** Gramos impresos: volumen (cm³) × densidad × lo sólido. */
export const pesoImpreso = (cm3, material = "pla", relleno = 0.3) => Math.round(cm3 * (MATERIALES[material]?.densidad || 1.24) * solido(relleno));

/** ¿Es cerrada (cada arista la comparten exactamente 2 triángulos)? -> {abiertas, raras} (null si es enorme). */
export function revisarMalla(tri, max = 400000) {
  const n = tri.length / 9;
  if (n > max) return null;
  const ids = new Map(), aristas = new Map();
  const id = (i) => {
    const k = `${Math.round(tri[i] * 1e3)},${Math.round(tri[i + 1] * 1e3)},${Math.round(tri[i + 2] * 1e3)}`;
    let v = ids.get(k);
    if (v === undefined) { v = ids.size; ids.set(k, v); }
    return v;
  };
  for (let k = 0; k < n; k++) {
    const a = id(k * 9), b = id(k * 9 + 3), c = id(k * 9 + 6);
    for (const [p, q] of [[a, b], [b, c], [c, a]]) {
      if (p === q) continue;
      const e = p < q ? p * 4194304 + q : q * 4194304 + p;
      aristas.set(e, (aristas.get(e) || 0) + 1);
    }
  }
  let abiertas = 0, raras = 0;
  for (const v of aristas.values()) { if (v === 1) abiertas++; else if (v > 2) raras++; }
  return { abiertas, raras };
}

/** La huella más chica en XY girando la pieza (0°-90°) -> [largo, ancho] en mm. */
function huella(pts) {
  let mejor = null;
  for (let g = 0; g < 90; g += 3) {
    const a = (g * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < pts.length; i += 3) {
      const x = pts[i] * c - pts[i + 1] * s, y = pts[i] * s + pts[i + 1] * c;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    const h = [x1 - x0, y1 - y0].sort((p, q) => q - p);
    if (!mejor || h[0] < mejor[0]) mejor = h;
  }
  return mejor;
}
/** Hasta n puntos de los triángulos (para las cuentas de la huella). */
function muestra(tri, n = 4000) {
  const paso = Math.max(1, Math.floor(tri.length / 3 / n)), out = [];
  for (let i = 0; i < tri.length; i += 3 * paso) out.push(tri[i], tri[i + 1], tri[i + 2]);
  return out;
}
/** ¿Cabe en una cama de lado L? Como viene (Z arriba) girándola en el plano; o, una pieza suelta, acostada de cualquier lado. */
export function cabe(tri, L, deCualquierLado = false) {
  const p = muestra(tri);
  for (const [a, b, c] of deCualquierLado ? [[0, 1, 2], [0, 2, 1], [1, 2, 0]] : [[0, 1, 2]]) {
    const q = [];
    let z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < p.length; i += 3) { q.push(p[i + a], p[i + b], 0); z0 = Math.min(z0, p[i + c]); z1 = Math.max(z1, p[i + c]); }
    const [w, d] = huella(q);
    if (w <= L && d <= L && z1 - z0 <= L) return true;
  }
  return false;
}

function areaDe(tri) {
  let a = 0;
  for (let i = 0; i < tri.length; i += 9) {
    const ux = tri[i + 3] - tri[i], uy = tri[i + 4] - tri[i + 1], uz = tri[i + 5] - tri[i + 2], wx = tri[i + 6] - tri[i], wy = tri[i + 7] - tri[i + 1], wz = tri[i + 8] - tri[i + 2];
    a += Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx) / 2;
  }
  return a / 100;                                              // cm²
}
function medidas(tri) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < tri.length; i++) { const a = i % 3; if (tri[i] < min[a]) min[a] = tri[i]; if (tri[i] > max[a]) max[a] = tri[i]; }
  return max.map((v, k) => Math.round((v - min[k]) * 10) / 10);
}

/**
 * El informe de un diseño (la pantalla «Analizar»). cuerpos = [{nombre, tri, volumen_cm3?, area_cm2?}] (un STL = uno).
 * motores = [[x, y] ×4] en mm desde el centro (step.js basesMotor) o null (= las puntas de los brazos, como analizar).
 * -> tamaño, distancia entre motores en diagonal, hélice, peso por material, camas donde cabe, avisos.
 */
export function informe(cuerpos, { motores = null, tipo = "chasis", relleno = 0.3 } = {}) {
  let tri = cuerpos[0].tri;
  if (cuerpos.length > 1) {
    tri = new Float32Array(cuerpos.reduce((s, c) => s + c.tri.length, 0));
    let k = 0;
    for (const c of cuerpos) { tri.set(c.tri, k); k += c.tri.length; }
  }
  const vols = cuerpos.map((c) => c.volumen_cm3 ?? analizar(c.tri).volumen_cm3);
  const volumen = vols.reduce((s, v) => s + v, 0);
  const meta = conStep(analizar(tri), { volumen_cm3: volumen, motores_mm: motores });
  const mo = motores || meta.esquinas_m.map(([x, y]) => [x * 1000, y * 1000]);
  const ejes_mm = (Math.hypot(mo[0][0] - mo[2][0], mo[0][1] - mo[2][1]) + Math.hypot(mo[1][0] - mo[3][0], mo[1][1] - mo[3][1])) / 2;
  let vecinos = Infinity;
  for (let i = 0; i < 4; i++) vecinos = Math.min(vecinos, Math.hypot(mo[i][0] - mo[(i + 1) % 4][0], mo[i][1] - mo[(i + 1) % 4][1]));
  const helice_cabe = Math.max(0, (vecinos - 6) / 25.4);      // 6 mm de aire entre las puntas de las hélices
  const pesos = Object.fromEntries(Object.keys(MATERIALES).map((k) => [k, pesoImpreso(volumen, k, relleno)]));
  const camas = CAMAS.map((L) => ({ lado: L, entero: cabe(tri, L), por_piezas: cuerpos.every((c) => cabe(c.tri, L, true)) }));
  const malla = cuerpos.map((c) => revisarMalla(c.tri));
  const avisos = [];
  const abiertos = cuerpos.filter((c, i) => malla[i] && (malla[i].abiertas || malla[i].raras));
  if (abiertos.length) avisos.push({ nivel: "ojo", texto: t("No es un sólido cerrado ({cuales}): el slicer puede fallar o rellenar mal.", { cuales: abiertos.slice(0, 3).map((c) => c.nombre).join(", ") + (abiertos.length > 3 ? "…" : "") }) });
  cuerpos.forEach((c, i) => {
    const a = c.area_cm2 ?? areaDe(c.tri), espesor = a > 0 ? (20 * vols[i]) / a : Infinity;   // 2V/A = el grosor de una placa (mm)
    if (espesor < 1.2) avisos.push({ nivel: "ojo", texto: t("«{nombre}» tiene paredes muy finas (~{mm} mm): con boquilla de 0,4 mm sale frágil.", { nombre: c.nombre, mm: num(espesor, 1) }) });
  });
  if (!camas.some((c) => c.por_piezas)) avisos.push({ nivel: "mal", k: "camas", texto: t("Muy grande: no cabe ni en la cama de {L} mm (ni por piezas).", { L: CAMAS[CAMAS.length - 1] }) });
  else if (!camas.some((c) => c.entero)) avisos.push({ nivel: "info", k: "camas", texto: t("Entero no cabe en ninguna cama: se imprime por piezas.") });
  if (tipo === "chasis" && Math.max(...meta.tam_mm) < 60) avisos.push({ nivel: "ojo", texto: t("Mide {tam} mm: muy chico para un chasis. ¿Está en centímetros?", { tam: meta.tam_mm.join(" × ") }) });
  if (tipo === "chasis" && !motores) avisos.push({ nivel: "info", texto: t("No encontré las bases de los motores (sus agujeros): los motores van en las puntas de los brazos.") });
  if (tri.length / 9 > 300000) avisos.push({ nivel: "info", texto: t("Tiene {n} triángulos: pesado para el juego (se ve igual con menos).", { n: Math.round(tri.length / 9) }) });
  return {
    tri, meta, tam_mm: medidas(tri), volumen_cm3: Math.round(volumen * 10) / 10,
    motores_mm: mo.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]), motores_de: motores ? "agujeros" : "puntas",
    ejes_mm: Math.round(ejes_mm), helice_cabe: Math.round(helice_cabe * 10) / 10, helice: Math.max(2, Math.floor(helice_cabe)),
    pesos, relleno, camas, avisos,
    cuerpos: cuerpos.map((c, i) => ({ nombre: c.nombre, volumen_cm3: Math.round(vols[i] * 10) / 10, cerrado: malla[i] ? !(malla[i].abiertas || malla[i].raras) : null })),
  };
}
