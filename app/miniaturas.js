// =====================================================================
// LAS FOTOS DE LA TIENDA: cada pieza se dibuja una vez en 3D (las mismas formas de dron3d.js, la ESP32 y el soldador
// de Blender) en un renderer chiquito aparte y queda guardada como imagen. Una por cuadro, para no trabar el juego.
// =====================================================================
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { buildDrone } from "./dron3d.js";
import { modelo } from "./modelos3d.js";

const CACHE = new Map(), COLA = [];
let R = null, escena = null, camara = null, ocupado = false;
const glb = {};
const W = 360, H = 260;

function iniciar() {
  if (R) return;
  R = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  R.setSize(W, H, false);
  R.outputColorSpace = THREE.SRGBColorSpace;
  R.toneMapping = THREE.ACESFilmicToneMapping;
  escena = new THREE.Scene();
  const envS = new THREE.Scene(); envS.background = new THREE.Color(0x40464c);
  const panel = (c, k, pos, w, h) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), side: THREE.DoubleSide })); m.position.set(...pos); m.lookAt(0, 0, 0); envS.add(m); };
  panel(0xffffff, 5, [0, 6, 0], 7, 7); panel(0xffe2c0, 3, [6, 2, 4], 4, 3); panel(0xc8dcff, 2.2, [-6, 3, -3], 4, 3);
  escena.environment = new THREE.PMREMGenerator(R).fromScene(envS, 0.04).texture;
  escena.environmentIntensity = 0.7;
  escena.add(new THREE.HemisphereLight(0xffffff, 0x404040, 1.1));
  const l = new THREE.DirectionalLight(0xffffff, 2.2); l.position.set(2, 4, 3); escena.add(l);
  camara = new THREE.PerspectiveCamera(30, W / H, 0.001, 50);
}
async function cargarGLB(nombre) {
  if (!(nombre in glb)) glb[nombre] = new GLTFLoader().loadAsync(`modelos/${nombre}.glb`).then((g) => g.scene).catch(() => null);
  return glb[nombre];
}
/** Una copia de un pedazo del dron (una ranura de dron3d.js), lista para fotografiar. */
function ranura(build, cat, k, uno = false) {
  const g = buildDrone(build, cat).userData.slots[k];
  if (!g) return null;
  if (uno && g.children.length > 3) {                  // de los 4 motores o las 4 hélices, uno solo
    const solo = new THREE.Group(), n = k === "motores" ? 3 : 1;
    g.children.slice(0, n).forEach((c) => solo.add(c.clone()));
    solo.traverse((o) => { if (o.isMesh && o.material?.transparent) o.visible = false; });
    return solo;
  }
  return g;
}
/** Lo que sale en la foto de cada pieza (o null: la tarjeta pone un ícono). */
async function objeto(cat, r, pz) {
  const id = pz.id;
  switch (r) {
    case "chasis": return ranura({ chasis: id }, cat, "chasis");
    case "motores": return modelo("motor_" + id) || ranura({ chasis: "madera", motores: id }, cat, "motores", true);
    case "helices": return ranura({ chasis: "madera", helices: id }, cat, "helices", true);
    case "baterias": return modelo("bateria_" + id) || ranura({ bateria: id }, cat, "bateria");
    case "camaras": return (id === "cam_juguete" && modelo("esp32_cam")) || ranura({ camara: id }, cat, "camara");
    case "escs": return modelo("esc_4en1") || ranura({ esc: id }, cat, "esc");
    case "radios": return ranura({ radio: id }, cat, "radio");
    case "extras": return ranura({ chasis: "madera", helices: "h5", extras: [id] }, cat, "extras");
    case "controladoras": {
      if (id === "fc_basica" || id === "fc_baro") { const e = await cargarGLB("esp32_devkitc"); return e ? e.clone(true) : null; }
      return ranura({ controladora: id }, cat, "controladora");
    }
    case "soldadura": {
      const s = await cargarGLB("soldador");
      const parte = (n) => s?.getObjectByName(n)?.clone(true) || null;
      if (id === "cautin_lapiz") return parte("cautin");
      if (id === "estacion" || id === "estacion_t12") { const g = new THREE.Group(); for (const n of ["soporte", "cautin", "limpiador"]) { const o = parte(n); if (o) g.add(o); } if (id === "estacion_t12") g.traverse((o) => { if (o.isMesh && o.name.includes("mango")) { o.material = o.material.clone(); o.material.color.set(0xd03030); } }); return g; }
      if (id === "estano") return parte("carrete_estano");
      if (id === "flux") return parte("jeringa_flux");
      if (id === "extractor") return extractor();
      if (id === "malla") return malla();
      if (id === "cables") return cables();
      return null;
    }
    default: return null;
  }
}
const mat = (c, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, ...extra });
function extractor() {
  const g = new THREE.Group();
  const cuerpo = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.11, 24), mat(0xb8bec6, { metalness: 0.9, roughness: 0.25 }));
  const punta = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.0045, 0.025, 16), mat(0xf2f2f2)); punta.position.y = -0.067;
  const vastago = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.03, 10), mat(0x888888, { metalness: 0.8 })); vastago.position.y = 0.07;
  const boton = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.006, 20), mat(0x2457c8)); boton.position.y = 0.087;
  const gatillo = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.012, 0.008), mat(0x2457c8)); gatillo.position.set(0.011, 0.03, 0);
  g.add(cuerpo, punta, vastago, boton, gatillo);
  g.rotation.z = 0.9;
  return g;
}
function malla() {
  const g = new THREE.Group();
  const carrete = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.008, 32), mat(0x2b62d8));
  const cobre = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.004, 10, 40), mat(0xc97a3a, { metalness: 0.9, roughness: 0.4 })); cobre.rotation.x = Math.PI / 2; cobre.position.y = 0.005;
  const cola = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.001, 0.0035), mat(0xc97a3a, { metalness: 0.9, roughness: 0.4 })); cola.position.set(0.03, 0.002, 0.01); cola.rotation.y = 0.4;
  g.add(carrete, cobre, cola);
  return g;
}
function cables() {
  const g = new THREE.Group();
  [0xd02020, 0x151515, 0x2050d0, 0xffd23f, 0x47c05a].forEach((c, i) => {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.02 - i * 0.0012, 0.0011, 8, 48), mat(c));
    r.rotation.x = Math.PI / 2 + (i - 2) * 0.08; r.position.y = i * 0.0024; g.add(r);
  });
  return g;
}
/** Encuadra el objeto y saca la foto. */
function foto(obj) {
  while (escena.children.length > 2) escena.remove(escena.children[2]);
  const piv = new THREE.Group(); piv.add(obj); escena.add(piv);
  const bb = new THREE.Box3().setFromObject(piv), c = bb.getCenter(new THREE.Vector3()), s = bb.getSize(new THREE.Vector3());
  obj.position.sub(c);
  const r = Math.max(s.x, s.y, s.z) * 0.62 || 0.05, d = r / Math.sin((camara.fov * Math.PI) / 360) * 0.95;
  camara.position.set(d * 0.62, d * 0.55, d * 0.72); camara.lookAt(0, 0, 0);
  camara.near = d / 50; camara.far = d * 10; camara.updateProjectionMatrix();
  R.render(escena, camara);
  return R.domElement.toDataURL("image/png");
}
async function siguiente() {
  if (ocupado || !COLA.length) return;
  ocupado = true;
  const { key, cat, r, pz, listo } = COLA.shift();
  try {
    iniciar();
    const o = await objeto(cat, r, pz);
    const url = o ? foto(o) : null;
    CACHE.set(key, url);
    listo(url);
  } catch { CACHE.set(key, null); listo(null); }
  ocupado = false;
  requestAnimationFrame(siguiente);
}
/** La foto de una pieza: devuelve la imagen si ya está, o null y la pide (avisa con alListo cuando esté). */
export function miniatura(cat, r, pz, alListo) {
  const key = `${r}|${pz.id}`;
  if (CACHE.has(key)) return CACHE.get(key);
  if (!COLA.some((x) => x.key === key)) COLA.push({ key, cat, r, pz, listo: (u) => alListo?.(u) });
  else { const q = COLA.find((x) => x.key === key), prev = q.listo; q.listo = (u) => { prev(u); alListo?.(u); }; }
  requestAnimationFrame(siguiente);
  return undefined;
}
