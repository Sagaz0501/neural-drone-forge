// =====================================================================
// STL: importar tus diseños (chasis, carcasas, la placa que quieras ver) y exportar las piezas del juego
// para imprimirlas de verdad. Sin dependencias: lee STL binario y ASCII, calcula el volumen (para el
// peso impreso), el tamaño y dónde quedan las puntas de los brazos (para poner los motores).
// Unidades: los STL vienen en milímetros con Z hacia arriba; el juego usa metros con Y hacia arriba.
// =====================================================================
import * as THREE from "three";

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
  if (!nums.length || nums.length % 9) throw new Error("No parece un STL (ni binario ni ASCII).");
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
  const n = tris.length / 9, buf = new ArrayBuffer(84 + n * 50), dv = new DataView(buf);
  const head = `Dron Maker: ${nombre}`.slice(0, 79);
  for (let i = 0; i < head.length; i++) dv.setUint8(i, head.charCodeAt(i) & 127);
  dv.setUint32(80, n, true);
  for (let i = 0; i < n; i++) {
    const o = 84 + i * 50, t = tris.slice(i * 9, i * 9 + 9);
    const ux = t[3] - t[0], uy = t[4] - t[1], uz = t[5] - t[2], wx = t[6] - t[0], wy = t[7] - t[1], wz = t[8] - t[2];
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const l = Math.hypot(nx, ny, nz) || 1;
    dv.setFloat32(o, nx / l, true); dv.setFloat32(o + 4, ny / l, true); dv.setFloat32(o + 8, nz / l, true);
    for (let k = 0; k < 9; k++) dv.setFloat32(o + 12 + k * 4, t[k], true);
  }
  return new Blob([buf], { type: "model/stl" });
}

/** Las geometrías de los STL importados (las usa dron3d.js). id -> { geo, meta }. */
export const STL_CACHE = new Map();

/** Carga un STL del servidor (stl/<id>.stl) a la caché. */
export async function cargarSTL(item) {
  if (STL_CACHE.has(item.id)) return STL_CACHE.get(item.id);
  const r = await fetch(item.url || `/stl/${item.id}.stl`);
  if (!r.ok) throw new Error(`No pude bajar ${item.id}`);
  const tri = leerSTL(await r.arrayBuffer());
  const meta = analizar(tri, { escala: item.escala || 1 });
  const out = { geo: geometria(tri, { escala: item.escala || 1, centro: meta.centro }), meta, tri };
  STL_CACHE.set(item.id, out);
  return out;
}
