// =====================================================================
// STEP (.step / .stp): lo que publican los que diseñan chasis de verdad (Fusion, Onshape, SolidWorks, FreeCAD).
// Lo lee OpenCascade compilado a WebAssembly (occt-import-js, game/vendor/occt/, LGPL-2.1: va SIN modificar y
// aparte, se baja solo al importar un STEP: 7,6 MB). Sin pantalla (la pantalla es ui_importar.js).
//
//   leerSTEP(buf)  -> { cuerpos: [{nombre, tri (mm, Z arriba), caras, volumen_cm3, area_cm2, bbox}], unidad, esquema, ensamble }
//   orientar(cuerpos, eje) -> el eje más fino del chasis queda como Z (los STEP de Fusion vienen con Y arriba)
//   basesMotor(cuerpos)    -> dónde van los 4 motores, buscando los AGUJEROS de las bases (círculos de las caras)
//
// A diferencia del STL, el STEP trae unidades reales (mm, pulgadas…): OpenCascade las convierte a mm.
// =====================================================================
import { t } from "./i18n.js";

const VENDOR = new URL("../game/vendor/occt/", import.meta.url);
let _occt = null;

/** Carga OpenCascade (una vez). En el navegador agrega el <script>; en Node (las pruebas) lo pide con require. */
export function cargarOCCT() {
  if (_occt) return _occt;
  _occt = (async () => {
    let fabrica;
    if (typeof document === "undefined") {
      const { createRequire } = await import("node:module");
      fabrica = createRequire(import.meta.url)(new URL("occt-import-js.js", VENDOR).pathname);
    } else {
      if (!globalThis.occtimportjs) {
        await new Promise((ok, mal) => {
          const s = document.createElement("script");
          s.src = new URL("occt-import-js.js", VENDOR).href;
          s.onload = ok;
          s.onerror = () => mal(new Error(t("No pude cargar el lector de STEP (game/vendor/occt).")));
          document.head.appendChild(s);
        });
      }
      fabrica = globalThis.occtimportjs;
    }
    return fabrica({ locateFile: (f) => new URL(f, VENDOR).href });
  })();
  _occt.catch(() => { _occt = null; });
  return _occt;
}

/** ¿Es un STEP? (empieza con ISO-10303-21) */
export const esSTEP = (buf) => new TextDecoder().decode(new Uint8Array(buf, 0, Math.min(200, buf.byteLength))).trimStart().startsWith("ISO-10303-21");

/** Las unidades y el esquema del archivo (del texto del STEP: OpenCascade ya convierte, esto es para mostrarlo). */
export function cabeceraSTEP(texto) {
  const esq = /FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/i.exec(texto)?.[1] || "";
  const esquema = /AP242|MANAGED_MODEL_BASED_3D/i.test(esq) ? "AP242" : /AUTOMOTIVE_DESIGN/i.test(esq) ? "AP214" : /CONFIG_CONTROL_DESIGN/i.test(esq) ? "AP203" : esq.split(/\s/)[0] || "?";
  const ent = /[^;]*LENGTH_UNIT\s*\(\s*\)[^;]*;/i.exec(texto)?.[0] || "";
  let unidad = "mm";
  if (/CONVERSION_BASED_UNIT\s*\(\s*'(INCH|IN)'/i.test(ent)) unidad = "in";
  else if (/CONVERSION_BASED_UNIT\s*\(\s*'(FOOT|FT)'/i.test(ent)) unidad = "ft";
  else if (/SI_UNIT\s*\(\s*\.CENTI\.\s*,\s*\.METRE\.\s*\)/i.test(ent)) unidad = "cm";
  else if (/SI_UNIT\s*\(\s*\$\s*,\s*\.METRE\.\s*\)/i.test(ent)) unidad = "m";
  else if (/SI_UNIT\s*\(\s*\.MILLI\.\s*,\s*\.METRE\.\s*\)/i.test(ent)) unidad = "mm";
  else if (!ent) unidad = "?";
  const sistema = /FILE_NAME\s*\(([\s\S]*?)\)\s*;/i.exec(texto)?.[1].match(/'([^']*)'/g)?.map((s) => s.slice(1, -1)).filter(Boolean).slice(-2, -1)[0] || "";
  return { esquema, unidad, sistema };
}

/** Volumen (mm³, con signo), área (mm²) y caja de un Float32Array de triángulos. */
export function medir(tri) {
  let vol = 0, area = 0;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < tri.length; i += 9) {
    const ax = tri[i], ay = tri[i + 1], az = tri[i + 2], bx = tri[i + 3], by = tri[i + 4], bz = tri[i + 5], cx = tri[i + 6], cy = tri[i + 7], cz = tri[i + 8];
    vol += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
    const ux = bx - ax, uy = by - ay, uz = bz - az, wx = cx - ax, wy = cy - ay, wz = cz - az;
    area += Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx) / 2;
    for (let k = 0; k < 9; k++) { const a = k % 3, v = tri[i + k]; if (v < min[a]) min[a] = v; if (v > max[a]) max[a] = v; }
  }
  return { vol, area, min, max };
}

/**
 * ArrayBuffer de un STEP -> los cuerpos (uno por sólido / pieza del ensamble), en mm.
 * calidad: deflexión lineal en mm (0,1 mm = más fino que lo que imprime una boquilla de 0,4) y angular en rad.
 */
export async function leerSTEP(buf, { deflexion = 0.1, angular = 0.35 } = {}) {
  const occt = await cargarOCCT();
  const bytes = new Uint8Array(buf);
  const cab = cabeceraSTEP(new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 4 << 20))));
  let r, tris = 0;
  for (const k of [1, 4]) {                     // si sale enorme, una vez más grueso
    r = occt.ReadStepFile(bytes, { linearUnit: "millimeter", linearDeflectionType: "absolute_value", linearDeflection: deflexion * k, angularDeflection: angular * Math.sqrt(k) });
    if (!r?.success) throw new Error(t("OpenCascade no pudo leer ese STEP (¿está completo?)."));
    tris = r.meshes.reduce((s, m) => s + m.index.array.length / 3, 0);
    if (tris < 600000) break;
  }
  if (!r.meshes.length) throw new Error(t("Ese STEP no trae sólidos (solo curvas o superficies sueltas)."));
  const rutas = new Map();                      // mesh -> nombres del árbol (para mostrar dónde está)
  const andar = (n, ruta) => { const nr = n.name ? [...ruta, n.name] : ruta; for (const i of n.meshes || []) rutas.set(i, nr); for (const c of n.children || []) andar(c, nr); };
  andar(r.root, []);
  const vistos = new Map();
  const cuerpos = r.meshes.map((m, i) => {
    const p = m.attributes.position.array, ix = m.index.array, tri = new Float32Array(ix.length * 3);
    for (let j = 0; j < ix.length; j++) { const o = ix[j] * 3; tri[j * 3] = p[o]; tri[j * 3 + 1] = p[o + 1]; tri[j * 3 + 2] = p[o + 2]; }
    const ruta = rutas.get(i) || [];
    let nombre = m.name || ruta[ruta.length - 1] || t("cuerpo {n}", { n: i + 1 });
    const n = (vistos.get(nombre) || 0) + 1; vistos.set(nombre, n);
    if (n > 1) nombre += ` (${n})`;
    const caras = (m.brep_faces || []).map((f) => [f.first, f.last]);
    const s = medir(tri);
    return { nombre, ruta, color: m.color || null, tri, caras, ...resumen(s) };
  });
  return { cuerpos, ...cab, ensamble: cuerpos.length > 1, triangulos: tris };
}

const resumen = (s) => ({
  volumen_cm3: Math.abs(s.vol) / 1000, area_cm2: s.area / 100,
  bbox: { min: s.min, max: s.max, tam: s.max.map((v, k) => v - s.min[k]) },
});

/** El eje más fino de todo (o el que digas: "x" | "y" | "z") pasa a ser Z (girando, sin espejar). */
export function orientar(cuerpos, eje = "auto") {
  if (eje === "auto") {
    const s = unir(cuerpos.map((c) => c.bbox));
    const tam = s.max.map((v, k) => v - s.min[k]), orden = [0, 1, 2].sort((a, b) => tam[a] - tam[b]);
    eje = tam[orden[0]] < 0.6 * tam[orden[1]] ? "xyz"[orden[0]] : "z";
  }
  if (eje === "z") return { cuerpos, eje };
  // y -> z: (x, y, z) -> (x, -z, y) · x -> z: (x, y, z) -> (-z, y, x) (las dos con determinante +1)
  const girar = eje === "y" ? (a, i) => { const y = a[i + 1], z = a[i + 2]; a[i + 1] = -z; a[i + 2] = y; } : (a, i) => { const x = a[i], z = a[i + 2]; a[i] = -z; a[i + 2] = x; };
  return {
    eje,
    cuerpos: cuerpos.map((c) => {
      const tri = new Float32Array(c.tri);
      for (let i = 0; i < tri.length; i += 3) girar(tri, i);
      return { ...c, tri, ...resumen(medir(tri)) };
    }),
  };
}

function unir(cajas) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const b of cajas) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], b.min[k]); max[k] = Math.max(max[k], b.max[k]); }
  return { min, max };
}

/** Los triángulos de los cuerpos elegidos, juntos (para guardar como STL). */
export function juntar(cuerpos) {
  const out = new Float32Array(cuerpos.reduce((s, c) => s + c.tri.length, 0));
  let o = 0;
  for (const c of cuerpos) { out.set(c.tri, o); o += c.tri.length; }
  return out;
}

/** Un círculo por mínimos cuadrados (Kasa) en XY: {cx, cy, r, err (relativo)} o null. */
function circulo(xs, ys) {
  const n = xs.length;
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0, sz = 0;
  for (let i = 0; i < n; i++) {
    const x = xs[i], y = ys[i], z = x * x + y * y;
    sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; sxz += x * z; syz += y * z; sz += z;
  }
  // [sxx sxy sx; sxy syy sy; sx sy n] [D E F] = -[sxz syz sz]
  const A = [[sxx, sxy, sx, -sxz], [sxy, syy, sy, -syz], [sx, sy, n, -sz]];
  for (let c = 0; c < 3; c++) {
    let p = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    if (Math.abs(A[c][c]) < 1e-12) return null;
    for (let r = 0; r < 3; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k < 4; k++) A[r][k] -= f * A[c][k]; }
  }
  const D = A[0][3] / A[0][0], E = A[1][3] / A[1][1], F = A[2][3] / A[2][2];
  const cx = -D / 2, cy = -E / 2, r2 = cx * cx + cy * cy - F;
  if (!(r2 > 0)) return null;
  const r = Math.sqrt(r2);
  let err = 0;
  for (let i = 0; i < n; i++) err = Math.max(err, Math.abs(Math.hypot(xs[i] - cx, ys[i] - cy) - r));
  return { cx, cy, r, err: err / r };
}

/** Los agujeros verticales (paredes cilíndricas de 0,7 a 4,5 mm de radio) de un cuerpo, desde sus caras de la B-rep. */
export function agujeros(c) {
  const out = [];
  for (const [a, b] of c.caras || []) {
    const xs = [], ys = [], vis = new Set();
    let zmin = Infinity, zmax = -Infinity;
    for (let i = a * 9; i < (b + 1) * 9 && i < c.tri.length; i += 3) {
      const k = `${Math.round(c.tri[i] * 1e3)},${Math.round(c.tri[i + 1] * 1e3)},${Math.round(c.tri[i + 2] * 1e3)}`;
      if (vis.has(k)) continue;
      vis.add(k); xs.push(c.tri[i]); ys.push(c.tri[i + 1]);
      zmin = Math.min(zmin, c.tri[i + 2]); zmax = Math.max(zmax, c.tri[i + 2]);
    }
    if (xs.length < 8 || zmax - zmin < 0.3) continue;
    const ci = circulo(xs, ys);
    if (!ci || ci.err > 0.03 || ci.r < 0.7 || ci.r > 4.5) continue;
    const ang = xs.map((x, i) => Math.atan2(ys[i] - ci.cy, x - ci.cx)).sort((p, q) => p - q);
    let hueco = 2 * Math.PI - (ang[ang.length - 1] - ang[0]);
    for (let i = 1; i < ang.length; i++) hueco = Math.max(hueco, ang[i] - ang[i - 1]);
    if (hueco > (210 * Math.PI) / 180) continue;              // menos de 150° de arco: un redondeo, no un agujero
    const dup = out.find((h) => Math.hypot(h.x - ci.cx, h.y - ci.cy) < 0.3 && Math.abs(h.r - ci.r) < 0.3);
    if (!dup) out.push({ x: ci.cx, y: ci.cy, r: ci.r });
  }
  return out;
}

/**
 * Dónde van los 4 motores: en cada cuadrante (45°, 135°, 225°, 315°; o 0°, 90°… si el chasis va en +), el grupo de agujeros más lejos del centro
 * (la base del motor: el eje + 4 tornillos M2/M3 en cuadrado de 9-19 mm). El motor = el agujero grande (eje) o el
 * centro del grupo. Coordenadas en mm relativas al centro de la caja de los cuerpos (como stl.js analizar).
 * Devuelve { motores: [[x, y] ×4], agujeros: [{x, y, r}] } o null si no los encuentra todos.
 */
export function basesMotor(cuerpos) {
  const caja = unir(cuerpos.map((c) => c.bbox));
  const c0 = [(caja.min[0] + caja.max[0]) / 2, (caja.min[1] + caja.max[1]) / 2];
  const rmax = Math.hypot(caja.max[0] - caja.min[0], caja.max[1] - caja.min[1]) / 2;
  const hs = cuerpos.flatMap(agujeros).map((h) => ({ ...h, x: h.x - c0[0], y: h.y - c0[1] }))
    .filter((h) => Math.hypot(h.x, h.y) > 0.4 * rmax);
  for (const giro of [45, 0]) {                               // en X (lo normal) o en + (motores adelante/atrás/lados)
    const r = cuadrantes(hs, giro);
    if (r) return { ...r, centro: c0 };
  }
  return null;
}
function cuadrantes(hs, giro) {
  const motores = [], usados = [];
  for (const deg of [0, 90, 180, 270].map((d) => d + giro)) {
    const a = (deg * Math.PI) / 180;
    const q = hs.filter((h) => Math.cos(Math.atan2(h.y, h.x) - a) > Math.cos(Math.PI / 4 + 0.05)).sort((p, s) => Math.hypot(s.x, s.y) - Math.hypot(p.x, p.y));
    if (!q.length) return null;
    let g = q.filter((h) => Math.hypot(h.x - q[0].x, h.y - q[0].y) < 20), m = media(g);
    for (let k = 0; k < 2; k++) { g = q.filter((h) => Math.hypot(h.x - m[0], h.y - m[1]) < 16); m = media(g); }
    const eje = g.filter((h) => h.r >= 2 && Math.hypot(h.x - m[0], h.y - m[1]) < 4).sort((p, s) => s.r - p.r)[0];
    if (g.length < 2 && !eje) return null;                     // un agujero suelto no es una base de motor
    motores.push(eje ? [eje.x, eje.y] : m);
    usados.push(...g);
  }
  return { motores, agujeros: usados };
}
const media = (g) => [g.reduce((s, h) => s + h.x, 0) / g.length, g.reduce((s, h) => s + h.y, 0) / g.length];
