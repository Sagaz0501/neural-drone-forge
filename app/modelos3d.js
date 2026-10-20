// =====================================================================
// LOS MODELOS 3D HECHOS EN BLENDER (blender/piezas/*.py -> app/modelos/<nombre>.glb): se cargan una vez al abrir el
// juego (precargar) y dron3d.js, la mesa y la tienda piden copias con modelo(nombre). Si un modelo no cargó (o en Node,
// en las pruebas), modelo() da null y quien lo pidió dibuja su versión simple de siempre.
// =====================================================================
const CACHE = new Map();
const MOTORES = ["m1806", "m2204", "m1404", "m2306", "m2207", "m2806"];
const BATERIAS = ["b2s1000", "b3s1300", "b3s2200", "b4s1500", "b4s2200", "b4s3000"];
const IMPRESORAS = ["impresora_mini", "impresora_pro", "impresora_x"];        // las Forja3D (blender/piezas/impresora.py)
export const LISTA = ["esp32_devkitc", "esc_4en1", "esp32_cam", "chasis_madera", "soldador", ...MOTORES.map((m) => "motor_" + m), ...BATERIAS.map((b) => "bateria_" + b), ...IMPRESORAS];

let cargando = null;
/** Carga todos (una vez). Devuelve cuántos cargaron. */
export function precargar(nombres = LISTA) {
  if (cargando) return cargando;
  cargando = (async () => {
    const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
    const L = new GLTFLoader();
    await Promise.all(nombres.map((n) => L.loadAsync(`modelos/${n}.glb`).then((g) => CACHE.set(n, g.scene)).catch(() => null)));
    return CACHE.size;
  })();
  return cargando;
}

/** ¿Ya cargó ese modelo? */
export const hay = (nombre) => CACHE.has(nombre);

/** Una copia lista para poner en la escena (sombras puestas), o null si no está. La geometría es compartida:
 * disposeDrone no la libera (userData.compartida). */
export function modelo(nombre) {
  const s = CACHE.get(nombre);
  if (!s) return null;
  const c = s.clone(true);
  c.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; o.userData.compartida = true; } });
  return c;
}
