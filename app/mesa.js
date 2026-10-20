// =====================================================================
// LA MESA DE TRABAJO (la pantalla en 3D del banco de armado). La lógica del oficio está en taller.js y la del
// cableado en banco.js; aquí se hace con las manos:
//
//   🔧 Armar:  las piezas llegan en CAJA: mantén apretado sobre la cinta para cortarla y la caja se abre. Toca una
//              pieza suelta y vuela a su lugar en el chasis; después cada tornillo: tócalo y MANTÉN apretado hasta el
//              "clic" (si sigues, la rosca se barre). La batería lleva correa; la radio, cinta doble faz.
//   🔥 Soldar: la placa grande. Prende la estación y espera que caliente; toma un cable de la izquierda y ponlo en su
//              pad (la 📄 guía de conexión va aparte). El CAUTÍN es el ratón (mantén apretado sobre el pad para
//              calentarlo). La OTRA MANO se toma de la bandeja (a la derecha de la placa, objetos 3D): la jeringa de
//              💧 flux (tocas el pad y queda el flux), el 🧵 estaño (Espacio lo mete), la 🥤 bomba (Espacio chupa) y la
//              🟫 malla (el cautín encima la calienta). La 🧽 esponja limpia la punta. Atajos: F, E, X, M, C.
//              Cada junta sale buena, fría, con puente o con el pad levantado (taller.js resultadoJunta).
//
// Tiene su propio canvas y su propio renderer (main.js no dibuja el garaje mientras la mesa está abierta).
// =====================================================================
import * as THREE from "three";
import { OrbitControls } from "three/addons/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { buildDrone } from "./dron3d.js";
import { sfx } from "./garaje.js";
import * as TA from "./taller.js";
import { CHIP, manual } from "./banco.js";
import { t, num } from "./i18n.js";
import { multimetro3d, pitido } from "./multimetro.js";
import { cargado } from "./modelos3d.js";
import { Lote } from "./escritorio.js";

const COLOR_PIN = { "vbat+": "#e02020", "5v+": "#ff8a1a", "3v3+": "#ffd23f", vbat_in: "#e02020", "5v_in": "#ff8a1a", "3v3_in": "#ffd23f", gnd: "#1d1f22",
  tx: "#3ccbff", rx: "#3c8bff", sda: "#c07bff", scl: "#9a5bff", led_out: "#47f08a", led_in: "#47f08a", m_out: "#2ad8b0", m_in: "#2ad8b0",
  esc_conn: "#eaf2ef", fc_conn: "#eaf2ef", ufl: "#d4af37", ant: "#d4af37" };
/** Las piezas del armado, en orden: [ranura del dron, ranura 3D de dron3d.js]. Cómo se monta cada una: taller.js PROCEDIMIENTO. */
const ORDEN = [["chasis", "chasis"], ["motores", "motores"], ["esc", "esc"], ["controladora", "controladora"],
  ["radio", "radio", "cinta"], ["montaje", "camara", "tornillos"], ["camara", "camara", "tornillos"], ["bateria", "bateria", "correa"], ["extras", "extras", "colocar"]];
const NOMBRE = () => ({ chasis: t("Chasis"), motores: t("Motores"), esc: t("ESC 4 en 1"), controladora: t("Controladora"), radio: t("Radio"),
  montaje: t("Montaje de la cámara"), camara: t("Cámara"), bateria: t("Batería"), extras: t("Extras") });
/** Dónde van los pads de la ESP32 DevKitC (el GLB de blender/piezas) para cada pin de banco.js. */
const PAD_ESP32 = { "5v": "pad_5V", "3v3": "pad_3V3", gnd1: "pad_GND_1", gnd2: "pad_GND_2", tx2: "pad_GPIO17", rx2: "pad_GPIO16", tx1: "pad_GPIO27", rx1: "pad_GPIO26", sda: "pad_GPIO21", scl: "pad_GPIO22", led: "pad_GPIO4" };
/** Una nubecita redonda y difusa para el humo (sin textura el sprite se veía como un cuadrado gris). */
function texNube() {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d"), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.45, "rgba(255,255,255,0.45)"); r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace;
  return tx;
}
const MAT = {
  carton: new THREE.MeshStandardMaterial({ color: 0xb08a5a, roughness: 0.95 }),
  cinta: new THREE.MeshStandardMaterial({ color: 0xc9a36a, roughness: 0.4, transparent: true, opacity: 0.92 }),
  anillo: new THREE.MeshBasicMaterial({ color: 0x3ccbff, transparent: true, opacity: 0.85 }),
  anilloOk: new THREE.MeshBasicMaterial({ color: 0x47f08a }),
  tornillo: new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 0.9, roughness: 0.3 }),
  acero: new THREE.MeshStandardMaterial({ color: 0xc8ccd2, metalness: 0.95, roughness: 0.2 }),
  mangoAzul: new THREE.MeshStandardMaterial({ color: 0x2457c8, roughness: 0.45 }),
  goma: new THREE.MeshStandardMaterial({ color: 0x1b1c1f, roughness: 0.85 }),
  amarillo: new THREE.MeshStandardMaterial({ color: 0xf2b705, roughness: 0.5 }),
  pcbNegro: new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.55 }),
  pcbVerde: new THREE.MeshStandardMaterial({ color: 0x1d5b34, roughness: 0.55 }),
  oro: new THREE.MeshStandardMaterial({ color: 0xd8b25a, metalness: 0.9, roughness: 0.25 }),
  estanoLiq: new THREE.MeshStandardMaterial({ color: 0xf2f5f7, metalness: 1, roughness: 0.05, emissive: 0x2a2a2a }),
  estanoOk: new THREE.MeshStandardMaterial({ color: 0xdfe3e8, metalness: 1, roughness: 0.16 }),
  estanoFrio: new THREE.MeshStandardMaterial({ color: 0x8e9196, metalness: 0.5, roughness: 0.85 }),
  flux: new THREE.MeshStandardMaterial({ color: 0xd99a2b, roughness: 0.05, transparent: true, opacity: 0.55 }),
  chip: new THREE.MeshStandardMaterial({ color: 0x18191c, roughness: 0.4 }),
  jst: new THREE.MeshStandardMaterial({ color: 0xf1ede2, roughness: 0.6 }),
  humo: new THREE.SpriteMaterial({ color: 0xdedede, map: texNube(), transparent: true, opacity: 0.35, depthWrite: false }),
};
const VISTA_SOLDAR = { x: 0.012, y: 0.112 };            // la cámara de soldar, desde arriba (corrida a la derecha: la bandeja)
const lerp = (a, b, k) => a + (b - a) * k;
const suave = (k) => k * k * (3 - 2 * k);

export function initMesa(ctx) {
  const { cat, PT, $, esc, toast, guardar } = ctx;
  const M = { abierta: false, modo: "armar", placa: null, t: 0, hold: null, tweens: [], pick: [], humo: [], espacio: false, flux: false,
    E: TA.estacion0(), juntas: new Map(), enMano: null, avisoT: 0, hover: null, mouse: new THREE.Vector2(), tPunta: new THREE.Vector3(), tocando: false };
  const P = () => ctx.P(), D = () => ctx.D(), U = (uid) => PT.unidad(P(), uid);
  const ray = new THREE.Raycaster();
  let renderer, scene, cam, controls, mundo, raf = 0, last = 0;
  const glb = { esp32: null, esc: null, cargando: null };

  // ---------------- arrancar la escena (una vez) ----------------
  function iniciar() {
    if (renderer) return;
    const cv = $("mesa-c");
    renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
    renderer.setPixelRatio(Math.min(2, devicePixelRatio));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1b1d1c);
    cam = new THREE.PerspectiveCamera(36, 1, 0.005, 20);
    controls = new OrbitControls(cam, cv);
    controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.maxPolarAngle = 1.35;
    // la mesa: madera, una plancha de corte verde con cuadrícula
    const tex = (w, h, fn) => { const c = document.createElement("canvas"); c.width = w; c.height = h; fn(c.getContext("2d"), w, h); const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 8; return tx; };
    const madera = tex(512, 512, (g, w, h) => {
      g.fillStyle = "#7a4e2a"; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 90; i++) { g.strokeStyle = `rgba(${i % 3 ? "60,34,14" : "160,110,62"},${0.25 + (i % 5) * 0.06})`; g.lineWidth = 1 + (i % 4); g.beginPath(); const y = (i * 53) % h; g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + 8, w * 0.7, y - 8, w, y + 3); g.stroke(); }
    });
    madera.wrapS = madera.wrapT = THREE.RepeatWrapping; madera.repeat.set(3, 3);
    const mesa = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), new THREE.MeshStandardMaterial({ map: madera, roughness: 0.8 }));
    mesa.rotation.x = -Math.PI / 2; mesa.position.y = -0.002; mesa.receiveShadow = true;
    const plancha = tex(1024, 768, (g, w, h) => {
      g.fillStyle = "#17402d"; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(${i % 2 ? "0,0,0" : "255,255,255"},${0.02 + (i % 7) * 0.006})`; g.fillRect((i * 7919) % w, (i * 104729) % h, 2, 2); }   // el grano de la goma
      g.strokeStyle = "rgba(220,240,225,.12)"; g.lineWidth = 1;
      for (let x = 0; x < w; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
      for (let y = 0; y < h; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      g.strokeStyle = "rgba(240,250,245,.24)"; g.lineWidth = 2;
      for (let x = 0; x < w; x += 160) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
      g.fillStyle = "rgba(240,250,245,.28)"; g.font = "bold 22px sans-serif"; g.fillText("DRON MAKER · 1 cm", 24, h - 22);
    });
    const mat = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.003, 0.6), new THREE.MeshStandardMaterial({ map: plancha, roughness: 0.75 }));
    mat.position.y = -0.0015; mat.receiveShadow = true;
    scene.add(mesa, mat);
    scene.add(new THREE.HemisphereLight(0xdfe8f0, 0x3a2e24, 0.38));
    const sol = new THREE.DirectionalLight(0xffe6c4, 2.3);          // la lámpara de la mesa: cálida, desde adelante a la derecha
    sol.position.set(0.3, 0.9, 0.45); sol.castShadow = true;
    sol.shadow.mapSize.set(2048, 2048);
    Object.assign(sol.shadow.camera, { left: -0.5, right: 0.5, top: 0.5, bottom: -0.5, near: 0.1, far: 3 });
    sol.shadow.bias = -0.0004;
    scene.add(sol);
    const relleno = new THREE.DirectionalLight(0x9fc3ff, 0.45); relleno.position.set(-0.6, 0.5, -0.3); scene.add(relleno);
    const borde = new THREE.DirectionalLight(0xbcd6ff, 0.9); borde.position.set(-0.2, 0.35, -0.9); scene.add(borde);   // contraluz: marca el borde de las piezas
    // reflejos para los metales (estaño, tornillos, el oro de los pads): un cuarto de luz hecho aquí
    const envS = new THREE.Scene(); envS.background = new THREE.Color(0x3a3e42);
    const panel = (c, k, pos, w, h) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), side: THREE.DoubleSide })); m.position.set(...pos); m.lookAt(0, 0, 0); envS.add(m); };
    panel(0xffffff, 5, [0, 6, 0], 7, 7); panel(0xffe2c0, 3, [6, 2, 4], 4, 3); panel(0xc8dcff, 2.2, [-6, 3, -3], 4, 3); panel(0x6a5a48, 1, [0, -5, 0], 9, 9);
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(envS, 0.04).texture;
    scene.environmentIntensity = 0.7;
    mundo = new THREE.Group(); scene.add(mundo);
    desorden();
    herramientas();
    new ResizeObserver(tam).observe(cv);
    tam();
    cv.addEventListener("pointerdown", abajo);
    cv.addEventListener("pointermove", mover);
    addEventListener("pointerup", arriba);
    cv.addEventListener("contextmenu", (e) => e.preventDefault());
    cv.addEventListener("wheel", (e) => { if (M.arrastre) { e.preventDefault(); girarPieza(e.deltaY > 0 ? 1 : -1); } }, { passive: false });
    addEventListener("keydown", tecla);
    addEventListener("keyup", (e) => { if (e.code === "Space") M.espacio = false; });
  }
  function tam() {
    const cv = $("mesa-c"), w = cv.clientWidth || innerWidth, h = cv.clientHeight || innerHeight;
    renderer.setSize(w, h, false);
    cam.aspect = w / h; cam.updateProjectionMatrix();
  }

  // ---------------- las herramientas (los modelos 3D de la mano) ----------------
  const H = {};
  function herramientas() {
    // destornillador: mango amarillo con negro, vástago de acero, punta en cruz (la punta está en el origen, apunta -y)
    const ds = new THREE.Group();
    const cyl = (r1, r2, h, mat, y, seg = 20) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), mat); m.position.y = y; m.castShadow = true; ds.add(m); return m; };
    cyl(0.0012, 0.0016, 0.05, MAT.acero, 0.025, 10);
    cyl(0.0065, 0.0058, 0.03, MAT.goma, 0.065, 24);
    cyl(0.0068, 0.0068, 0.04, MAT.amarillo, 0.1, 24);
    for (let i = 0; i < 6; i++) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.0015, 0.028, 0.0015), MAT.goma); const a = (i / 6) * Math.PI * 2; r.position.set(Math.cos(a) * 0.0067, 0.1, Math.sin(a) * 0.0067); ds.add(r); }
    ds.visible = false; scene.add(ds); H.destornillador = ds;
    // cúter (para la cinta de las cajas)
    const cu = new THREE.Group();
    const cuerpo = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.009, 0.014), MAT.amarillo); cuerpo.position.set(0.03, 0.012, 0); cuerpo.rotation.z = 0.35; cu.add(cuerpo);
    const hoja = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.0015, 0.008), MAT.acero); hoja.position.set(-0.003, 0.002, 0); hoja.rotation.z = 0.35; cu.add(hoja);
    cu.visible = false; scene.add(cu); H.cuter = cu;
    // el cautín: la punta en el origen; el mango sube en diagonal (como lo agarra la mano)
    const ca = new THREE.Group(), eje = new THREE.Group();
    const c2 = (r1, r2, h, mat, y, seg = 20) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), mat); m.position.y = y; m.castShadow = true; eje.add(m); return m; };
    H.punta = c2(0.0009, 0.0002, 0.007, new THREE.MeshStandardMaterial({ color: 0x8c8f94, metalness: 0.9, roughness: 0.35, emissive: 0x000000 }), 0.0035, 12);
    c2(0.0018, 0.0012, 0.03, new THREE.MeshStandardMaterial({ color: 0x9a7a5a, metalness: 0.9, roughness: 0.3 }), 0.022, 14);
    c2(0.004, 0.0035, 0.006, MAT.acero, 0.04, 20);
    const grip = c2(0.0062, 0.0055, 0.04, MAT.goma, 0.063, 24);
    for (let i = 0; i < 8; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.0062, 0.0007, 6, 24), MAT.goma); r.rotation.x = Math.PI / 2; r.position.y = 0.047 + i * 0.0045; eje.add(r); }
    c2(0.0068, 0.0064, 0.05, MAT.mangoAzul, 0.108, 24);
    grip.castShadow = true;
    eje.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0.7, 0.62, -0.36).normalize());   // el mango sale a la derecha y hacia atrás (no tapa la placa)
    ca.add(eje); ca.visible = false; scene.add(ca); H.cautin = ca;
    // el alambre de estaño (un cilindro entre dos puntos) y el cable que llevas en la mano
    H.estano = new THREE.Mesh(new THREE.CylinderGeometry(0.00045, 0.00045, 1, 8), MAT.estanoOk);
    H.estano.visible = false; scene.add(H.estano);
    H.halo = new THREE.Mesh(new THREE.RingGeometry(0.0024, 0.0029, 32), new THREE.MeshBasicMaterial({ color: 0x3ccbff, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthTest: false }));
    H.halo.rotation.x = -Math.PI / 2; H.halo.renderOrder = 5; H.halo.visible = false; scene.add(H.halo);
  }
  /** Lo que hay tirado en el tapete (solo se ve, no hace nada): cables de silicona sueltos, termorretráctil, bridas, el
   *  pelacables, la tercera mano con lupa y el carrete de estaño en su soporte. Lejos de la placa y de donde caen las
   *  piezas (PUESTOS). Todo junto en una malla por material. */
  function desorden() {
    const L = new Lote(), m = (c, r = 0.5, me = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: me });
    const C = { rojo: m(0xc0261c, 0.45), negro: m(0x141516, 0.5), amarillo: m(0xe0a400, 0.45), azul: m(0x2457c8, 0.45), verde: m(0x2a8a4a, 0.45),
      blanco: m(0xe8e6df, 0.6), acero: MAT.acero, cobre: m(0xc8743a, 0.3, 0.9), metal: m(0x2a2f34, 0.4, 0.6), estano: MAT.estanoOk };
    const mesh = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); L.hornear(o); return o; };
    const tubo = (pts, r, mat) => mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), 40, r, 6), mat, 0, 0, 0);
    // cables de silicona sueltos (con la punta pelada) y un trozo enrollado
    const cab = [[C.rojo, [[-0.06, 0.2], [-0.02, 0.17], [0.03, 0.19], [0.08, 0.165]]], [C.negro, [[-0.06, 0.207], [-0.015, 0.18], [0.035, 0.2], [0.085, 0.175]]],
      [C.amarillo, [[0.04, 0.215], [0.07, 0.205], [0.1, 0.22]]], [C.azul, [[-0.36, -0.06], [-0.33, -0.1], [-0.3, -0.08], [-0.27, -0.12]]]];
    for (const [mat, ps] of cab) {
      tubo(ps.map(([x, z]) => [x, 0.0011, z]), 0.0011, mat);
      const [x, z] = ps[ps.length - 1], [x0, z0] = ps[ps.length - 2], d = Math.hypot(x - x0, z - z0);
      tubo([[x, 0.0011, z], [x + (x - x0) / d * 0.006, 0.0008, z + (z - z0) / d * 0.006]], 0.0006, C.cobre);
    }
    for (let i = 0; i < 5; i++) mesh(new THREE.TorusGeometry(0.018 + i * 0.0012, 0.0009, 6, 28), i % 2 ? C.negro : C.rojo, -0.3, 0.001 + i * 0.0003, 0.22, Math.PI / 2);
    // termorretráctil (trocitos de colores) y bridas
    [C.rojo, C.negro, C.negro, C.azul, C.rojo, C.amarillo].forEach((mat, i) => mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.016 + (i % 3) * 0.005, 12, 1, true), mat, 0.355 + (i % 3) * 0.008, 0.0023, 0.125 + Math.floor(i / 3) * 0.012, 0, 0.3 * i, Math.PI / 2));
    for (let i = 0; i < 4; i++) mesh(new THREE.BoxGeometry(0.1, 0.0009, 0.0036), i === 2 ? C.blanco : C.negro, -0.33 + i * 0.004, 0.0005 + i * 0.0009, 0.135 + i * 0.006, 0, 0.5 + i * 0.12);
    // el pelacables
    const pel = new THREE.Group(); pel.position.set(-0.33, 0.006, 0.03); pel.rotation.y = 0.9;
    for (const s of [-1, 1]) { const h = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.009, 0.014), C.rojo); h.position.set(0.02, 0, s * 0.012); h.rotation.y = s * 0.09; pel.add(h); }
    const cab2 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.011, 0.024), C.metal); cab2.position.x = -0.05; pel.add(cab2);
    L.hornear(pel);
    // la tercera mano con lupa (atrás a la izquierda)
    const tm = new THREE.Group(); tm.position.set(-0.32, 0, -0.2);
    const pz = (geo, mat, x, y, z) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); tm.add(o); return o; };
    pz(new THREE.CylinderGeometry(0.045, 0.05, 0.016, 28), C.metal, 0, 0.008, 0);
    pz(new THREE.CylinderGeometry(0.004, 0.004, 0.17, 12), C.acero, 0, 0.1, 0);
    const brazo = (a, b, r = 0.0028) => { const d = new THREE.Vector3().subVectors(b, a), o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 8), C.acero); o.position.copy(a).addScaledVector(d, 0.5); o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); tm.add(o); };
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    brazo(V(0, 0.18, 0), V(0.07, 0.2, 0.06), 0.004); brazo(V(0, 0.15, 0), V(0.09, 0.09, 0.05)); brazo(V(0, 0.15, 0), V(-0.02, 0.09, 0.1));
    pz(new THREE.BoxGeometry(0.014, 0.008, 0.024), C.rojo, 0.09, 0.087, 0.06); pz(new THREE.BoxGeometry(0.014, 0.008, 0.024), C.negro, -0.02, 0.087, 0.11);
    const aro = pz(new THREE.TorusGeometry(0.045, 0.005, 10, 36), C.negro, 0.07, 0.2, 0.06); aro.rotation.set(1.0, 0.5, 0);
    L.hornear(tm);
    const lupa = new THREE.Mesh(new THREE.CircleGeometry(0.044, 32), new THREE.MeshPhysicalMaterial({ color: 0xe6f2ff, roughness: 0.03, transparent: true, opacity: 0.22, depthWrite: false }));
    lupa.position.set(-0.32 + 0.07, 0.2, -0.2 + 0.06); lupa.rotation.set(1.0 - Math.PI / 2, 0.5, 0); scene.add(lupa);
    // el carrete de estaño en su soporte (atrás a la derecha) con el alambre que cuelga
    const sp = new THREE.Group(); sp.position.set(0.37, 0, -0.27);
    const en = (o, p) => { o.position.copy(p); sp.add(o); return o; };
    en(new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.008, 0.06), C.metal), V(0, 0.004, 0));
    for (const x of [-0.035, 0.035]) en(new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.06, 0.012), C.acero), V(x, 0.035, 0));
    const eje = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.08, 10), C.acero); eje.position.y = 0.055; eje.rotation.z = Math.PI / 2; sp.add(eje);
    const car = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.036, 28), C.rojo); car.position.y = 0.055; car.rotation.z = Math.PI / 2; sp.add(car);
    const al = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.038, 28), C.estano); al.position.y = 0.055; al.rotation.z = Math.PI / 2; sp.add(al);
    L.hornear(sp);
    tubo([[0.37, 0.034, -0.25], [0.365, 0.015, -0.225], [0.35, 0.0006, -0.2], [0.32, 0.0006, -0.19]], 0.0005, C.estano);
    L.armar(scene);
  }
  /** Un cilindro (cable, alambre) entre dos puntos. */
  function entre(mesh, a, b) {
    const d = new THREE.Vector3().subVectors(b, a), L = d.length();
    mesh.position.copy(a).addScaledVector(d, 0.5);
    mesh.scale.set(1, Math.max(1e-4, L), 1);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  }

  // ---------------- abrir / cerrar ----------------
  async function abrir(modo = "armar") {
    iniciar();
    const p = P();
    p.taller = p.taller || { punta: 1 };
    M.E.limpia = p.taller.punta ?? 1;
    M.cautin = PT.cautinDe(p, cat);                      // con qué sueldas (el de lápiz no tiene perilla y le cuestan los pads grandes)
    if (M.cautin) Object.assign(M.E, { potencia: M.cautin.potencia, tau: M.cautin.tau, ajustable: M.cautin.ajustable }, M.cautin.ajustable ? {} : { set: M.cautin.set });
    M.abierta = true; M.modo = modo; M.enMano = null; M.hold = null; M.mano2 = null; M.vista = null;
    ctx.show("mesa");
    $("mesa-dron").textContent = D().nombre;
    await cargarESP32();
    construir();
    cancelAnimationFrame(raf);
    last = performance.now();
    raf = requestAnimationFrame(bucle);
  }
  function cerrar() {
    const p = P();
    if (M.E.on) { p.taller.punta = Math.max(0.2, M.E.limpia - 0.25); toast(t("Dejaste el cautín prendido: la punta se oxidó un poco. Apágalo (⏻) al terminar."), 4500); M.E.on = false; }
    else p.taller.punta = M.E.limpia;
    M.abierta = false; M.multi = false; pitido(false);
    cancelAnimationFrame(raf);
    guardar();
    ctx.alCerrarMesa?.();
  }
  $("mesa-salir").onclick = cerrar;
  $("mesa-guia").onclick = () => ctx.abrirGuia?.();
  document.querySelectorAll("#mesa-modos button").forEach((b) => (b.onclick = async () => { if (M.hold || M.arrastre) return; M.proc = null; M.modo = b.dataset.m; M.enMano = null; if (M.modo === "soldar") await cargarESP32(); construir(); }));

  /** Las placas hechas en Blender (blender/piezas/): la ESP32 y el ESC 4 en 1. Si no cargan, se dibujan aquí. */
  async function cargarESP32() {
    if (glb.esp32 || glb.cargando === false) return;
    const cargar = (f) => new GLTFLoader().loadAsync(`modelos/${f}.glb`).then((x) => x.scene).catch(() => null);
    glb.cargando = Promise.all([cargar("esp32_devkitc"), cargar("esc_4en1")]);
    [glb.esp32, glb.esc] = await glb.cargando;
    if (!glb.esp32 && !glb.esc) glb.cargando = false;
  }

  // ---------------- construir lo que se ve ----------------
  function limpiar() {
    while (mundo.children.length) mundo.remove(mundo.children[0]);
    M.pick = []; M.tornillos = null; M.tweens = []; M.humo.forEach((s) => scene.remove(s)); M.humo = [];
    if (M.cableMano) { scene.remove(M.cableMano); M.cableMano = null; }
    M.comps = null;
    for (const k of ["destornillador", "cuter", "cautin", "estano", "halo"]) H[k].visible = false;
    M.tools = null; if (M.senalT) M.senalT.visible = false; $("mesa-etq").hidden = true;
    if (M.mm) M.mm.g.visible = M.mm.puntas.roja.visible = M.mm.puntas.negra.visible = false;
    pitido(false);
    if (M.modo !== "soldar") M.multi = false;
    for (const c of M.cablesMM || []) c.visible = false;
  }
  function construir() {
    limpiar();
    document.querySelectorAll("#mesa-modos button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.m === M.modo)));
    $("mesa-sold").hidden = M.modo !== "soldar";
    if (M.modo !== "soldar") $("mesa-placas").innerHTML = "";
    if (M.modo === "armar") armar(); else soldar();
    hud();
  }
  const pickable = (obj, accion) => { obj.traverse((o) => { if (o.isMesh) { o.userData.accion = accion; M.pick.push(o); } }); };

  // ============================== ARMAR ==============================
  // Cada pieza se monta con su PROCEDIMIENTO (taller.js): siempre los mismos pasos, cada uno con su vista. El orden
  // importa (taller.js MONTAJE): lo de abajo primero, y lo que ya está encima tapa (hay que desmontarlo).
  /** Las piezas del dron y en qué va cada una: montada, suelta, en su caja o en camino. */
  function items() {
    const d = D(), B = d.banco, p = P(), out = [];
    for (const [slot, s3] of ORDEN) {
      if (slot === "extras") {
        if (!d.extras.length) continue;
        const ok = d.extras.length === (B.instalado.extras || []).length && d.extras.every((x) => B.instalado.extras.includes(x));
        const us = d.extras.map(U);
        out.push({ slot, s3, uid: null, us, estado: ok ? "montada" : us.some((u) => TA.enCamino(p, u)) ? "camino" : us.some((u) => TA.enCaja(p, u)) ? "caja" : "suelta" });
        continue;
      }
      const uid = d.slots[slot];
      if (!uid) continue;
      const u = U(uid);
      out.push({ slot, s3, uid, us: [u], estado: B.instalado[slot] === uid ? "montada" : TA.enCamino(p, u) ? "camino" : TA.enCaja(p, u) ? "caja" : "suelta" });
    }
    return out;
  }
  // dónde quedan las piezas sueltas: primero a la derecha, después adelante y atrás (la izquierda la tapa la lista)
  const PUESTOS = [[0.29, -0.16], [0.29, -0.04], [0.29, 0.08], [0.29, 0.2], [-0.17, 0.25], [0.15, 0.25], [-0.15, -0.24], [0.15, -0.24], [0, -0.26], [-0.24, 0.12]];
  const FANT = new THREE.MeshBasicMaterial({ color: 0x47f08a, transparent: true, opacity: 0.22, depthWrite: false });
  /** Lo montado que cuenta para el orden (lo que no tiene pieza, como la radio ESP-NOW del ESP32, no tapa nada). */
  const montadas = () => new Set((M.items || []).filter((x) => x.estado === "montada" && !x.virtual).map((x) => x.slot));
  /** La flecha que dice dónde es adelante (en las piezas que hay que girar). */
  function flecha(color, y) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.0045, 0.012, 3), new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true }));
    f.rotation.z = -Math.PI / 2; f.position.y = y; f.renderOrder = 7;
    return f;
  }
  /** El borde de abajo-centro de un grupo (en coordenadas del dron, que está en el origen). */
  const base = (o) => { const bb = new THREE.Box3().setFromObject(o); return bb.getCenter(new THREE.Vector3()).setY(bb.min.y); };
  /** La caja de un objeto en coordenadas del dron (con el dron derecho; el dron puede estar levantado M.base). */
  const cajaLocal = (o) => { const b = new THREE.Box3().setFromObject(o), g = M.giro?.position || new THREE.Vector3(); b.min.sub(g); b.max.sub(g); return b; };
  /** Un punto del dron en el mundo (con el dron derecho). */
  const aMundo = (v) => v.clone().add(M.giro?.position || new THREE.Vector3());

  function armar() {
    const d = D(), its = items();
    const build = { ...ctx.dronVista(d), sinHelices: true, cables: false, fantasma: [] };
    const dron = buildDrone(build, cat);
    dron.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    M.giro = new THREE.Group(); M.giro.add(dron); mundo.add(M.giro);
    M.dron = dron; M.proc = null; M.arrastre = null;
    const S = dron.userData.slots, body = dron.userData.body;
    M.items = its;
    // lo que es de la radio ESP-NOW (va en la placa) no tiene nada que montar
    for (const it of its) if (!S[it.s3] && it.slot !== "montaje" && it.estado !== "camino") {
      it.virtual = true;                               // no tapa nada: no hay nada encima del chasis (antes bloqueaba el chasis)
      if (it.estado === "montada") continue;
      for (const u of it.us) if (u) delete u.caja;
      if (it.slot === "extras") d.banco.instalado.extras = [...d.extras]; else d.banco.instalado[it.slot] = it.uid;
      it.estado = "montada"; guardar();
    }
    const mo = montadas();
    // los separadores aparecen cuando se enroscan (con el ESC) y la placa de arriba con la controladora
    S.chasis?.traverse((o) => { if (o.userData.separador) o.visible = mo.has("esc"); if (o.userData.tapa) o.visible = mo.has("controladora"); });
    for (const o of body.children) if (o.isMesh) o.visible = mo.has("chasis");      // las luces de los brazos van con el chasis
    let k = 0;
    for (const it of its) {
      const g = S[it.s3];
      if (it.estado === "montada") { herrajes(it); continue; }
      if (it.slot === "camara" && its.find((x) => x.slot === "montaje" && x.estado !== "montada") && g) { /* la cámara espera su soporte */ }
      // la pieza (o las piezas: los 4 motores) salen del dron y van a su puesto en la mesa
      it.piezas = [];
      if (it.slot === "motores" && g) {
        // cada pieza al brazo más cercano (el motor de Blender es 1 objeto; el dibujado, 3 cilindros)
        const co = dron.userData.corners, kids = [...g.children];
        const deEsquina = kids.map((m) => co.reduce((b, c, j) => Math.hypot(m.position.x - c.x, m.position.z - c.z) < Math.hypot(m.position.x - co[b].x, m.position.z - co[b].z) ? j : b, 0));
        co.forEach((c, i) => {
          const mg = new THREE.Group(); kids.filter((_, j) => deEsquina[j] === i).forEach((m) => mg.add(m));
          const centro = base(mg); it.piezas.push({ g: mg, centro, destino: null });
        });
      } else if (it.slot === "montaje") {
        it.piezas.push({ g: soporteMesh(), centro: soporteEn(), ext: true });
      } else if (g) {
        const centro = base(g); g.parent.remove(g);
        it.piezas.push({ g, centro });
      }
      if (!it.piezas.length) continue;
      const [x, z] = it.slot === "chasis" ? [0, 0.27] : PUESTOS[k++ % PUESTOS.length];
      const esc_ = it.slot === "chasis" ? 0.5 : 1;
      const girar = TA.PROCEDIMIENTO[it.slot]?.some(([tp, o]) => tp === "colocar" && o?.girar);
      it.piezas.forEach((pz, i) => {
        const piv = new THREE.Group();
        if (pz.g.parent) pz.g.parent.remove(pz.g);
        piv.add(pz.g); if (!pz.ext) pz.g.position.sub(pz.centro);      // (el soporte se arma en su propio origen)
        const off = it.piezas.length > 1 ? [(i % 2 ? 1 : -1) * 0.028, (i < 2 ? -1 : 1) * 0.028] : [0, 0];
        piv.position.set(x + off[0], 0, z + off[1]); piv.scale.setScalar(esc_);
        if (girar) { piv.add(flecha(0xffd23f, new THREE.Box3().setFromObject(pz.g).max.y + 0.003)); piv.rotation.y = [Math.PI / 2, Math.PI, -Math.PI / 2][(i + it.slot.length) % 3]; }
        pz.piv = piv; pz.puesto = piv.position.clone(); pz.girar = girar;
        mundo.add(piv);
        if (it.estado !== "suelta") piv.visible = false;
      });
      if (it.estado === "caja") caja(it);
    }
    // si algo cuelga (la cámara con gimbal), el dron se apoya más alto (como sobre patas): nada atraviesa la mesa
    M.base = Math.max(0, -new THREE.Box3().setFromObject(dron).min.y + 0.0008);
    M.giro.position.y = M.base;
    recogibles();
    controls.minDistance = 0.06; controls.maxDistance = 1.4;
    if (M.vista !== "armar") { M.vista = "armar"; cam.position.set(0, 0.52, 0.62); controls.target.set(0, 0, 0.06); controls.update(); }
  }
  /**
   * El soporte de la cámara: una U (base + dos paredes, la cámara va entre ellas y se atornilla por los lados).
   * Atornillado = aluminio; con gomas = negro con 4 gomitas; impreso en TPU = del color de los detalles.
   */
  function soporteMesh() {
    const d = D(), id = U(d.slots.montaje)?.id || "mt_tornillos", g = new THREE.Group();
    const mat = id === "mt_tpu" ? new THREE.MeshStandardMaterial({ color: d.estilo?.acento || "#ff7a1a", roughness: 0.6 })
      : id === "mt_gomas" ? new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.6 }) : new THREE.MeshStandardMaterial({ color: 0xb8bec6, metalness: 0.85, roughness: 0.3 });
    const caja_ = (w, h, dd, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, dd), mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); };
    caja_(0.03, 0.003, 0.05, 0, 0.0015, 0);
    for (const z of [-0.0235, 0.0235]) caja_(0.026, 0.022, 0.003, 0, 0.011, z);
    if (id === "mt_gomas") for (const [x, z] of [[-0.01, -0.012], [0.01, -0.012], [-0.01, 0.012], [0.01, 0.012]]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.0022, 0.001, 8, 16), MAT.goma); r.rotation.x = Math.PI / 2; r.position.set(x, 0.0035, z); g.add(r); }
    return g;
  }
  /** Dónde va el soporte de la cámara (adelante, debajo de la cámara). */
  function soporteEn() { const cp = M.dron.userData.camPos; return new THREE.Vector3(cp.x - 0.012, Math.max(0.008, cp.y - 0.016), 0); }

  /** Lo que se puede tocar ahora: sin procedimiento, las cajas, las piezas sueltas y las montadas (para desmontar). */
  function recogibles() {
    M.pick = [];
    const P_ = M.proc, paso = P_?.pasos[P_.i];
    if (!P_) {
      for (const it of M.items) {
        if (it.estado === "caja" && it.caja) pickable(it.caja.g, { tipo: "caja", it });
        if (it.estado === "suelta") it.piezas?.forEach((pz, i) => pickable(pz.piv, { tipo: "pieza", it, i }));
        if (it.estado === "montada") { const g = it.slot === "montaje" ? M.soporteMontado : M.dron.userData.slots[it.s3]; if (g) pickable(g, { tipo: "desmontar", it }); }
      }
      return;
    }
    const [tipo] = paso;
    if (tipo === "colocar" || tipo === "colocar_cada") P_.it.piezas.forEach((pz, i) => { if (!pz.lista) pickable(pz.piv, { tipo: "pieza", it: P_.it, i }); });
    else if (tipo === "voltear") pickable(M.dron, { tipo: "voltear" });
    else if (tipo === "mantener") { const o = P_.it.piezas.find((x) => !x.lista)?.piv || (P_.it.slot === "montaje" ? M.soporteMontado : M.dron.userData.slots[P_.it.s3]); if (o) pickable(o, { tipo: "mantener" }); }
    else for (const [i, q] of (P_.pts || []).entries()) if (!q.listo) { M.pick.push(q.hit); q.hit.userData.accion = { tipo: "punto", i }; }
  }

  // ---------------- los tornillos, separadores, tuercas y gomas: dónde van y cómo se ven ----------------
  /** La altura de arriba del chasis (sin los separadores ni la placa de arriba). */
  function techoChasis() {
    let y = 0.008;
    M.dron.userData.slots.chasis?.traverse((o) => { if (o.isMesh && !o.userData.separador && !o.userData.tapa) { const b = cajaLocal(o); if (b.max.y < 0.03) y = Math.max(y, b.max.y); } });
    return y;
  }
  /** Los puntos de un paso (en coordenadas del dron): v = dónde, n = hacia dónde mira la cabeza, pieza, cuánto apretar. */
  function puntos(detalle) {
    const S = M.dron.userData.slots, co = M.dron.userData.corners, esq = [[1, 1], [1, -1], [-1, 1], [-1, -1]], Y = new THREE.Vector3(0, 1, 0);
    const P_ = (v, n, pieza, dur = 0.85) => ({ v, n, pieza, dur });
    switch (detalle) {
      case "motores_abajo": return co.flatMap((c) => {
        const L = Math.hypot(c.x, c.z), px = -c.z / L, pz = c.x / L;
        return [-1, 1].map((s) => P_(new THREE.Vector3(c.x + px * 0.0065 * s, 0, c.z + pz * 0.0065 * s), new THREE.Vector3(0, -1, 0), "tornillo"));
      });
      case "separadores": { const y = techoChasis(); return esq.map(([a, b]) => P_(new THREE.Vector3(a * 0.016, y, b * 0.016), Y.clone(), "separador", 1)); }
      case "tuercas": return esq.map(([a, b]) => P_(new THREE.Vector3(a * 0.016, 0.0335, b * 0.016), Y.clone(), "tuerca", 0.75));
      case "gomas": return esq.map(([a, b]) => P_(new THREE.Vector3(a * 0.016, 0.0225, b * 0.016), Y.clone(), "goma"));
      case "montaje": { const s = soporteEn(); return [-1, 1].map((k) => P_(new THREE.Vector3(s.x - 0.008, s.y + 0.003, k * 0.012), Y.clone(), "tornillo")); }
      case "camara_lados": {                              // por fuera de las paredes del soporte
        // el cuerpo de la cámara = la pieza más grande del grupo (no los brazos del gimbal ni el lente)
        let cuerpo = S.camara, vol = 0;
        S.camara.traverse((o) => { if (o.isMesh) { const sz = cajaLocal(o).getSize(new THREE.Vector3()), v = sz.x * sz.y * sz.z; if (v > vol) { vol = v; cuerpo = o; } } });
        const b = cajaLocal(cuerpo), c = b.getCenter(new THREE.Vector3()), z = Math.max(-b.min.z, b.max.z, 0.025) + 0.0008;
        const y = M.soporteMontado && c.y > 0.01 ? Math.min(c.y, soporteEn().y + 0.016) : c.y;
        return [P_(new THREE.Vector3(c.x, y, -z), new THREE.Vector3(0, 0, -1), "tornillo"), P_(new THREE.Vector3(c.x, y, z), new THREE.Vector3(0, 0, 1), "tornillo")];
      }
      case "correa_pasar": { const b = cajaLocal(S.bateria || S.chasis), c = b.getCenter(new THREE.Vector3()); return [P_(new THREE.Vector3(c.x, 0.004, 0), Y.clone(), "correa")]; }
      default: return [];
    }
  }
  /** La pieza chiquita de cada punto (el eje +y es hacia donde mira la cabeza). */
  function herraje(pieza) {
    if (pieza === "tornillo") return tornilloMesh();
    const g = new THREE.Group();
    if (pieza === "separador") { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.0021, 0.0021, 0.028, 6), new THREE.MeshStandardMaterial({ color: 0xc9a14a, metalness: 0.85, roughness: 0.3 })); m.position.y = 0.014; m.castShadow = true; g.add(m); }
    else if (pieza === "tuerca") { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.0026, 0.0026, 0.0022, 6), new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.5 })); m.position.y = 0.0011; g.add(m); }
    else if (pieza === "goma") { const m = new THREE.Mesh(new THREE.TorusGeometry(0.0024, 0.0011, 8, 18), MAT.goma); m.rotation.x = Math.PI / 2; m.position.y = 0.001; g.add(m); }
    else if (pieza === "correa") { const m = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.0016, 0.07), new THREE.MeshStandardMaterial({ color: 0xd93a2a, roughness: 0.8 })); m.position.y = 0.001; g.add(m); }
    return g;
  }
  /** Pone un herraje en su punto (dentro del dron: si el dron se voltea, se voltea con él). */
  function ponerHerraje(q, sube = 0) {
    const h = herraje(q.pieza);
    h.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), q.n);
    h.position.copy(q.v).addScaledVector(q.n, sube);
    M.dron.userData.body.add(h);
    return h;
  }
  /** Los herrajes de una pieza ya montada (los tornillos de abajo de los motores, los separadores, las tuercas…). */
  function herrajes(it) {
    if (it.slot === "montaje") { const sop = soporteMesh(); sop.position.copy(soporteEn()); M.dron.userData.body.add(sop); M.soporteMontado = sop; }
    for (const [tipo, det] of TA.PROCEDIMIENTO[it.slot] || []) {
      if (tipo !== "tornillos" && tipo !== "clics") continue;
      if (det === "separadores") continue;                    // ya son parte del chasis (se ven con el ESC)
      if (det === "correa_pasar") continue;                   // la correa ya viene en la batería
      for (const q of puntos(det)) { const h = ponerHerraje(q); h.rotateY(q.v.x * 300); }
    }
  }
  function tornilloMesh() {
    const g = new THREE.Group();
    const cab = new THREE.Mesh(new THREE.CylinderGeometry(0.0026, 0.0026, 0.0014, 16), MAT.tornillo); cab.castShadow = true; g.add(cab);
    for (const r of [0, Math.PI / 2]) { const ra = new THREE.Mesh(new THREE.BoxGeometry(0.0034, 0.0006, 0.0006), MAT.goma); ra.position.y = 0.0006; ra.rotation.y = r; g.add(ra); }
    const cu = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.006, 10), MAT.tornillo); cu.position.y = -0.0035; g.add(cu);
    return g;
  }

  // ---------------- el procedimiento ----------------
  /** Empezar a montar una pieza: revisa el orden y arranca su primer paso. */
  function empezar(it) {
    const hay = new Set(M.items.map((x) => x.slot)), no = TA.puedeMontar(it.slot, montadas(), hay);
    if (no?.falta) return aviso(t("Primero {pieza}: va debajo.", { pieza: NOMBRE()[no.falta] })), false;
    if (no?.tapa) return aviso(t("{pieza} está encima y no deja: desmóntala primero (mantén apretado sobre ella).", { pieza: NOMBRE()[no.tapa] })), false;
    M.proc = { it, pasos: TA.PROCEDIMIENTO[it.slot] || [["colocar"]], i: -1 };
    siguientePaso();
    return true;
  }
  function siguientePaso() {
    const P_ = M.proc, body = M.dron.userData.body;
    for (const f of P_.fantasmas || []) f.parent?.remove(f);
    P_.fantasmas = []; P_.pts = null;
    P_.i++;
    if (P_.i >= P_.pasos.length) return terminarMontaje(P_.it);
    const [tipo, det] = P_.pasos[P_.i];
    if (tipo === "colocar" || tipo === "colocar_cada") {
      // dónde va: la pieza en fantasma verde (y la flecha verde si hay que girarla)
      for (const pz of P_.it.piezas) {
        pz.g.traverse((o) => { delete o.userData.accion; });          // (clone copia userData; recogibles() lo vuelve a poner)
        const f = pz.g.clone(true);
        f.traverse((o) => { if (o.isMesh) { o.material = FANT; o.castShadow = false; } });
        if (pz.ext) f.position.copy(pz.centro); else f.position.set(0, 0, 0);
        body.add(f); P_.fantasmas.push(f); pz.fantasma = f;
        if (pz.girar) {
          const alto = new THREE.Box3().setFromObject(pz.g).getSize(new THREE.Vector3()).y / pz.piv.scale.x;
          const fl = flecha(0x47f08a, 0); fl.position.set(pz.centro.x, pz.centro.y + alto + 0.004, pz.centro.z);
          body.add(fl); P_.fantasmas.push(fl);
        }
      }
      enfocar(...VISTA_ARMAR());
    } else if (tipo === "voltear") {
      enfocar(new THREE.Vector3(0, 0.02, 0), new THREE.Vector3(0, 0.36, 0.34));
    } else if (tipo === "tornillos" || tipo === "clics") {
      P_.pts = puntos(det).map((q) => ({ ...q, T: TA.tornillo0(), listo: false }));
      for (const q of P_.pts) {
        const a = new THREE.Mesh(new THREE.TorusGeometry(q.pieza === "correa" ? 0.009 : 0.0034, 0.0007, 8, 24), MAT.anillo.clone());
        a.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), q.n); a.position.copy(q.v).addScaledVector(q.n, 0.0012);
        const hit = new THREE.Mesh(new THREE.SphereGeometry(q.pieza === "correa" ? 0.014 : 0.0055, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
        hit.position.copy(a.position);
        M.dron.userData.body.add(a, hit); q.anillo = a; q.hit = hit;
        P_.fantasmas.push(a, hit);
      }
      mirarPunto();
    } else if (tipo === "mantener") {
      const o = P_.it.piezas.find((x) => !x.lista)?.piv || M.dron.userData.slots[P_.it.s3];
      if (o) { const c = new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3()); enfocar(c, c.clone().add(new THREE.Vector3(0, 0.12, 0.11))); }
    }
    recogibles(); hud();
  }
  /** La cámara mira el próximo punto (de frente a hacia donde mira su cabeza: desde abajo, de lado o desde arriba). */
  function mirarPunto() {
    const q = M.proc?.pts?.find((x) => !x.listo);
    if (!q) return;
    M.dron.updateMatrixWorld(true);
    const w = M.dron.userData.body.localToWorld(q.v.clone()), nw = q.n.clone().transformDirection(M.dron.userData.body.matrixWorld);
    const L = q.pieza === "correa" ? 0.2 : 0.085;
    // de frente a la cabeza: desde arriba (o desde abajo con el dron volteado), o de lado casi a la altura del tornillo
    const desde = nw.y > 0.5 ? new THREE.Vector3(0, L * 0.85, L * 0.55) : nw.clone().multiplyScalar(L * 1.1).add(new THREE.Vector3(0.012, L * 0.12, 0));
    enfocar(w, w.clone().add(desde));
  }
  /** Un punto listo: el siguiente; si eran todos, el paso siguiente. */
  function puntoListo(q) {
    q.listo = true; q.anillo.material = MAT.anilloOk;
    sfx("click");
    if (M.proc.pts.every((x) => x.listo)) { M.hold = null; setTimeout(() => { if (M.proc) siguientePaso(); }, 350); }
    else { mirarPunto(); recogibles(); }
    hud();
  }
  /** Soltar una pieza que arrastrabas: si está cerca de su lugar (y bien girada), encaja. */
  function soltarPieza() {
    const A = M.arrastre; M.arrastre = null; controls.enableZoom = true;
    const it = A.it, pz = it.piezas[A.i], piv = pz.piv;
    const libres = it.piezas.filter((x) => x.lista === undefined || !x.lista).map((x) => x);
    // a qué lugar: el suyo (o, con los motores, el lugar libre más cercano)
    const lugares = it.slot === "motores" ? it.piezas.filter((x) => !x.ocupado).map((x) => x.centro) : [pz.centro];
    const cerca = lugares.map((c) => [c, Math.hypot(piv.position.x - c.x, piv.position.z - c.z)]).sort((a, b) => a[1] - b[1])[0];
    const rot = pz.meta ?? piv.rotation.y, ang = ((rot % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI), derecho = !pz.girar || ang < 0.1 || ang > 2 * Math.PI - 0.1;
    if (!cerca || cerca[1] > 0.03) { piv.position.y = 0; return aviso(t("Así no encaja: llévala hasta su lugar (el fantasma verde).")); }
    if (!derecho) { piv.position.y = 0.01; return aviso(t("Gírala con R hasta que la flecha amarilla mire hacia adelante, como la verde.")); }
    const destino = cerca[0], dueno = it.piezas.find((x) => x.centro === destino);
    dueno.ocupado = true; pz.lista = true;
    const p0 = piv.position.clone(), r0 = piv.rotation.y, r1 = Math.round(rot / (2 * Math.PI)) * 2 * Math.PI, destinoW = aMundo(destino);
    sfx("click");
    tween(0.3, (k) => { piv.position.lerpVectors(p0, destinoW, suave(k)); piv.rotation.y = lerp(r0, r1, suave(k)); }, () => {
      // la pieza vuelve al dron (así se voltea con él)
      const S = M.dron.userData.slots, body = M.dron.userData.body;
      for (const f of piv.children.filter((c) => c.geometry?.type === "ConeGeometry")) piv.remove(f);
      piv.remove(pz.g); mundo.remove(piv);
      if (it.slot === "motores") { S.motores.add(pz.g); pz.g.position.set(destino.x - pz.centro.x, 0, destino.z - pz.centro.z); }
      else if (it.slot === "montaje") { body.add(pz.g); pz.g.position.copy(destino); M.soporteMontado = pz.g; }
      else { body.add(pz.g); pz.g.position.set(0, 0, 0); S[it.s3] = pz.g; }
      if (dueno.fantasma) dueno.fantasma.visible = false;
      if (it.piezas.every((x) => x.lista)) siguientePaso(); else { recogibles(); hud(); }
    });
  }
  /** Voltear el dron (para los tornillos de abajo) o enderezarlo. */
  function voltear(abajo) {
    const G2 = M.giro, bb = new THREE.Box3().setFromObject(M.dron), alto = bb.max.y - G2.position.y + 0.001, r0 = G2.rotation.x, r1 = abajo ? Math.PI : 0, y0 = G2.position.y, y1 = abajo ? alto : M.base || 0;
    sfx("caja");
    tween(0.9, (k) => { const e = suave(k); G2.rotation.x = lerp(r0, r1, e); G2.position.y = lerp(y0, y1, e) + Math.sin(k * Math.PI) * 0.07; }, () => siguientePaso());
  }
  function terminarMontaje(it) {
    const d = D(), B = d.banco;
    if (it.slot === "extras") B.instalado.extras = [...d.extras];
    else B.instalado[it.slot] = it.uid;
    if (it.slot === "esc" || it.slot === "motores") { B.helices = false; B.instalado.helices = null; }
    guardar(); ctx.verDron?.();
    sfx("listo");
    aviso("✓ " + t("{pieza} montada.", { pieza: NOMBRE()[it.slot] }), true);
    M.proc = null;
    setTimeout(() => { if (M.abierta && M.modo === "armar") { construir(); enfocar(...VISTA_ARMAR()); } }, 450);
  }
  /** Desmontar una pieza (si no tiene nada encima): vuelve a la mesa. */
  function desmontar(it) {
    const no = TA.puedeDesmontar(it.slot, montadas());
    if (no) return aviso(t("{pieza} está encima: desmóntala primero.", { pieza: NOMBRE()[no.tapa] }));
    const B = D().banco;
    if (it.slot === "extras") B.instalado.extras = []; else B.instalado[it.slot] = null;
    guardar(); ctx.verDron?.(); sfx("trinquete");
    aviso(t("Desmontaste: {pieza}.", { pieza: NOMBRE()[it.slot] }));
    construir();
  }
  function cancelarProc() {
    if (!M.proc) return;
    M.proc = null; M.arrastre = null;
    aviso(t("Lo dejaste a medias: la pieza vuelve a la mesa."));
    construir(); enfocar(...VISTA_ARMAR());
  }
  /** Mover la cámara suave hacia un punto. */
  function enfocar(target, pos) {
    const t0 = controls.target.clone(), p0 = cam.position.clone();
    tween(0.6, (k) => { const e = suave(k); controls.target.lerpVectors(t0, target, e); cam.position.lerpVectors(p0, pos, e); }, null, false);
  }
  const VISTA_ARMAR = () => [new THREE.Vector3(0, 0, 0.05), new THREE.Vector3(0, 0.6, 0.56)];
  /** El texto de cada paso (para la lista del procedimiento). */
  function textoPaso([tipo, det], it) {
    const nom = NOMBRE()[it.slot];
    if (tipo === "colocar") return det?.girar ? t("Coloca {pieza} (gírala con R: la flecha hacia adelante)", { pieza: nom }) : t("Coloca {pieza} en su lugar", { pieza: nom });
    if (tipo === "colocar_cada") return t("Pon cada motor en la punta de su brazo");
    if (tipo === "voltear") return det ? t("Voltea el dron (los tornillos van por abajo)") : t("Endereza el dron");
    return { motores_abajo: t("Atornilla cada motor por abajo (2 por motor)"), separadores: t("Enrosca los 4 separadores al chasis"), tuercas: t("Aprieta las 4 tuercas de nylon"),
      montaje: t("Atornilla el soporte (2)"), camara_lados: t("Atornilla la cámara por los lados (2)"), gomas: t("Pon las 4 gomas antivibración"), correa_pasar: t("Pasa la correa por debajo"),
      cinta_pelar: t("Pela la cinta doble faz"), cinta_presionar: t("Presiona la radio para que pegue"), correa_apretar: t("Aprieta la correa") }[det] || det;
  }

  /** Una caja de cartón con su cinta y una etiqueta con el nombre. */
  function caja(it) {
    const [x, , z] = it.piezas[0].puesto.toArray(), grande = it.slot === "chasis", w = grande ? 0.2 : 0.11, h = grande ? 0.045 : 0.065, dd = grande ? 0.16 : 0.09;
    const g = new THREE.Group(); g.position.set(x, 0, z);
    const base_ = new THREE.Mesh(new THREE.BoxGeometry(w, h, dd), MAT.carton); base_.position.y = h / 2; base_.castShadow = base_.receiveShadow = true; g.add(base_);
    const solapa = (lado) => {
      const piv = new THREE.Group(); piv.position.set(0, h, (lado * dd) / 2);
      const s = new THREE.Mesh(new THREE.BoxGeometry(w, 0.002, dd / 2), MAT.carton); s.position.z = (-lado * dd) / 4; s.castShadow = true; piv.add(s);
      g.add(piv); return piv;
    };
    const s1 = solapa(1), s2 = solapa(-1);
    const cinta = new THREE.Mesh(new THREE.BoxGeometry(w + 0.004, 0.0025, 0.018), MAT.cinta); cinta.position.y = h + 0.0015; g.add(cinta);
    const c = document.createElement("canvas"); c.width = 256; c.height = 128;
    const gx = c.getContext("2d"); gx.fillStyle = "#f4efe4"; gx.fillRect(0, 0, 256, 128); gx.fillStyle = "#222"; gx.font = "bold 26px sans-serif";
    const nom = it.slot === "extras" ? t("Extras") : PT.buscarPieza(cat, it.us[0]?.id)?.nombre || NOMBRE()[it.slot];
    const pal = String(nom).split(" "); let lin = "", y = 40;
    for (const w2 of pal) { if ((lin + " " + w2).length > 16) { gx.fillText(lin, 12, y); y += 32; lin = w2; } else lin = (lin + " " + w2).trim(); }
    gx.fillText(lin, 12, y); gx.font = "18px sans-serif"; gx.fillStyle = "#777"; gx.fillText("DRON MAKER · " + t("frágil"), 12, 118);
    const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace;
    const et = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.6, w * 0.3), new THREE.MeshStandardMaterial({ map: tx, roughness: 0.9 }));
    et.position.set(0, h / 2, dd / 2 + 0.0008); g.add(et);
    mundo.add(g);
    it.caja = { g, s1, s2, cinta, w, h };
  }
  /** Abrir una caja: la cinta ya está cortada; las solapas se abren y la pieza sube. */
  function abrirCaja(it) {
    const C = it.caja;
    sfx("caja");
    for (const u of it.us) if (u) delete u.caja;
    guardar();
    C.cinta.visible = false;
    tween(0.5, (k) => { C.s1.rotation.x = -2.2 * suave(k); C.s2.rotation.x = 2.2 * suave(k); });
    for (const pz of it.piezas) { pz.piv.visible = true; pz.piv.position.y = 0.02; }
    tween(0.9, (k) => { for (const pz of it.piezas) pz.piv.position.y = 0.02 + Math.sin(k * Math.PI) * 0.09; }, () => {
      tween(0.35, (k) => { C.g.scale.setScalar(1 - k); }, () => { mundo.remove(C.g); it.caja = null; it.estado = "suelta"; for (const pz of it.piezas) pz.piv.position.y = 0; recogibles(); hud(); });
    });
    aviso(t("📦 Abriste: {pieza}. Tócala para montarla.", { pieza: NOMBRE()[it.slot] }), true);
  }

  // ============================== SOLDAR ==============================
  /** Las placas donde se suelda: el ESC y la controladora (las que haya). */
  const placas = () => ctx.estadoDe(D()).comps.filter((c) => c.k === "esc" || c.k === "fc");
  function soldar() {
    const comps = ctx.estadoDe(D()).comps, ps = placas();
    if (!ps.length) { aviso(t("Este dron no tiene ESC ni controladora para soldar.")); return; }
    if (!M.placa || !ps.some((c) => c.k === M.placa)) M.placa = ps[0].k;
    const comp = comps.find((c) => c.k === M.placa);
    M.comps = comps; M.comp = comp;
    const g = new THREE.Group(); mundo.add(g);
    M.pads = new Map();                                // "k.pin#sub" -> {mesh, pos, ref, sub, pad}
    if (comp.k === "fc" && comp.chip === "esp32" && glb.esp32) placaESP32(g, comp);
    else if (comp.k === "esc" && glb.esc) placaESC(g, comp);
    else placaGenerica(g, comp);
    M.placaG = g;
    const bb = new THREE.Box3().setFromObject(g);
    M.borde = { x: Math.max(Math.abs(bb.min.x), Math.abs(bb.max.x)), z: Math.max(Math.abs(bb.min.z), Math.abs(bb.max.z)) };
    dibujarCables();
    H.cautin.visible = true;
    M.fluxPads = new Map();                            // "ref#sub" -> la gota de flux que pusiste con la jeringa
    bandeja();
    // desde arriba (casi derecho), para ver todos los pines y sus nombres
    if (M.vista !== "soldar" + M.placa) { M.vista = "soldar" + M.placa; cam.position.set(VISTA_SOLDAR.x, VISTA_SOLDAR.y, 0.022); controls.target.set(VISTA_SOLDAR.x, 0, 0.001); cam.fov = 36; cam.updateProjectionMatrix(); controls.update(); }
    controls.minDistance = 0.04; controls.maxDistance = 0.3;
    pestanasPlaca(ps);
    colocarMulti();
  }
  function pestanasPlaca(ps) {
    const box = $("mesa-placas");
    box.innerHTML = "";
    for (const c of ps) {
      const b = document.createElement("button");
      b.textContent = c.k === "esc" ? "ESC" : t("Controladora");
      b.setAttribute("aria-pressed", String(c.k === M.placa));
      b.onclick = () => { if (M.hold) return; M.placa = c.k; M.enMano = null; construir(); };
      box.appendChild(b);
    }
  }
  // ---------------- la bandeja: lo que toma la otra mano (objetos 3D a la derecha de la placa) ----------------
  const TOOLS = () => ({ estano: ["🧵", t("Estaño")], flux: ["💧", t("Flux")], bomba: ["🥤", t("Bomba desoldadora")], malla: ["🟫", t("Malla desoldante")], esponja: ["🧽", t("Esponja (limpia la punta)")] });
  /** Cada herramienta con la punta en el origen y el cuerpo hacia +x, acostada en la mesa. */
  function toolMesh(k) {
    const g = new THREE.Group(), add = (geo, mat, x, y, z = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.z = rz; m.castShadow = true; g.add(m); return m; };
    const acost = Math.PI / 2;
    if (k === "flux") {
      add(new THREE.CylinderGeometry(0.0003, 0.0003, 0.004, 8), MAT.acero, 0.002, 0.0024, 0, acost);
      add(new THREE.CylinderGeometry(0.0022, 0.0022, 0.013, 18), new THREE.MeshStandardMaterial({ color: 0xe8b24a, roughness: 0.15, transparent: true, opacity: 0.8 }), 0.0105, 0.0024, 0, acost);
      add(new THREE.CylinderGeometry(0.0009, 0.0009, 0.006, 10), MAT.jst, 0.019, 0.0024, 0, acost);
      add(new THREE.CylinderGeometry(0.0026, 0.0026, 0.0008, 18), MAT.jst, 0.022, 0.0024, 0, acost);
    } else if (k === "estano") {
      add(new THREE.CylinderGeometry(0.0048, 0.0048, 0.004, 24), new THREE.MeshStandardMaterial({ color: 0x2b2d31, roughness: 0.6 }), 0.009, 0.002);
      add(new THREE.CylinderGeometry(0.0042, 0.0042, 0.0042, 24), MAT.estanoOk, 0.009, 0.002);
      add(new THREE.CylinderGeometry(0.0011, 0.0011, 0.0046, 12), MAT.goma, 0.009, 0.002);
      add(new THREE.CylinderGeometry(0.00045, 0.00045, 0.005, 8), MAT.estanoOk, 0.0025, 0.0006, 0, acost);
    } else if (k === "bomba") {
      add(new THREE.ConeGeometry(0.0013, 0.004, 14), MAT.jst, 0.002, 0.0025, 0, acost);
      add(new THREE.CylinderGeometry(0.0026, 0.0026, 0.016, 18), new THREE.MeshStandardMaterial({ color: 0x3a7bd5, metalness: 0.6, roughness: 0.3 }), 0.012, 0.0026, 0, acost);
      add(new THREE.CylinderGeometry(0.0009, 0.0009, 0.005, 10), MAT.acero, 0.0225, 0.0026, 0, acost);
      add(new THREE.SphereGeometry(0.0017, 14, 10), MAT.goma, 0.0255, 0.0026);
    } else if (k === "malla") {
      add(new THREE.BoxGeometry(0.008, 0.0004, 0.0024), new THREE.MeshStandardMaterial({ color: 0xc8743a, metalness: 0.85, roughness: 0.35 }), 0.004, 0.0004);
      add(new THREE.CylinderGeometry(0.0045, 0.0045, 0.0022, 22), new THREE.MeshStandardMaterial({ color: 0x2f7d4a, roughness: 0.5 }), 0.012, 0.0011);
      add(new THREE.CylinderGeometry(0.0038, 0.0038, 0.0024, 22), new THREE.MeshStandardMaterial({ color: 0xc8743a, metalness: 0.85, roughness: 0.35 }), 0.012, 0.0011);
    } else if (k === "esponja") {
      add(new THREE.CylinderGeometry(0.0052, 0.0046, 0.0034, 22), new THREE.MeshStandardMaterial({ color: 0x2b2d31, roughness: 0.5 }), 0.009, 0.0017);
      const lana = add(new THREE.IcosahedronGeometry(0.004, 1), new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.9, roughness: 0.55, flatShading: true }), 0.009, 0.0042);
      lana.scale.y = 0.6;
    }
    return g;
  }
  function bandeja() {
    // con la cámara de soldar (a 0,112 m, corrida 0,012 a la derecha): la bandeja cabe al lado de la placa
    const halfW = VISTA_SOLDAR.y * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * cam.aspect;
    const x0 = Math.max(M.borde.x + 0.006, Math.min(M.borde.x + 0.014, VISTA_SOLDAR.x + halfW - 0.028)), ks = ["estano", "flux", "bomba", "malla", "esponja"], paso = 0.0095, zc = 0.01;   // más abajo: arriba a la derecha van las notas
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.0008, paso * ks.length + 0.004), new THREE.MeshStandardMaterial({ color: 0x24272b, roughness: 0.7 }));
    base.position.set(x0 + 0.0125, 0.0004, zc); base.receiveShadow = true; mundo.add(base);
    M.tools = {};
    ks.forEach((k, i) => {
      const g = toolMesh(k); g.scale.setScalar(0.8);
      const home = new THREE.Vector3(x0, 0.0008, zc + (i - (ks.length - 1) / 2) * paso);
      g.position.copy(home); mundo.add(g);
      const zona = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.008, paso * 0.92), new THREE.MeshBasicMaterial({ visible: false }));
      zona.position.set(x0 + 0.0125, 0.004, home.z); mundo.add(zona);          // el clic agarra toda la casilla
      zona.userData.accion = { tipo: "tool", k }; M.pick.push(zona);
      M.tools[k] = { g, home };
    });
    M.descanso = new THREE.Vector3(x0 + 0.01, 0.012, zc - paso * 3.2);              // donde se apoya el cautín si la mano lleva la jeringa
  }
  /** La herramienta de la otra mano sigue al cautín (la jeringa ES el cursor); las demás vuelven a su lugar. */
  function moverTools(dt, tocando, h) {
    if (!M.tools) return;
    const k = Math.min(1, dt * 16);
    for (const [id, T] of Object.entries(M.tools)) {
      const enMano = M.mano2 === id && id !== "estano";
      let meta = T.home, alto = 0;
      if (enMano) {
        const ancla = tocando ? h.info.pos : M.tPunta;
        meta = id === "flux" ? ancla.clone().add(new THREE.Vector3(0, 0.0008, 0))
          : id === "bomba" ? ancla.clone().add(new THREE.Vector3(-0.0012, 0.0016, 0.0012))
          : ancla.clone().add(new THREE.Vector3(-0.0035, -0.0002, 0.0008));
        alto = id === "flux" ? 0.004 : 0;
      }
      T.g.position.lerp(meta.clone().setY(meta.y + alto), k);
      T.g.rotation.y = enMano ? (id === "flux" ? -0.7 : 0.5) : 0;
      T.g.rotation.z = enMano && id === "flux" ? 0.9 : 0;                     // la jeringa apunta hacia abajo
      T.g.visible = !(M.mano2 === "estano" && id === "estano");               // el carrete en la mano: se ve el alambre
    }
  }
  /** Un pad: guarda dónde está y qué pin es. */
  function pad(mesh, comp, pin, sub = 0) {
    const ref = `${comp.k}.${pin.id}`, enchufe = TA.esEnchufe(pin);
    if (mesh.material && !mesh.userData.propio) { mesh.material = mesh.material.clone(); mesh.userData.propio = true; }   // cada pad se calienta solo
    mesh.updateMatrixWorld(true);
    const pos = new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3());
    const info = { mesh, pos, ref, sub, pad: TA.padDe(comp, pin), pin, enchufe };
    M.pads.set(`${ref}#${sub}`, info);
    mesh.userData.accion = { tipo: "pad", info };
    M.pick.push(mesh);
    return info;
  }
  function placaESP32(g, comp) {
    const e = glb.esp32.clone(true);
    g.add(e);
    e.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
    e.updateMatrixWorld(true);
    for (const pin of comp.pines) {
      const nombre = PAD_ESP32[pin.id];
      if (!nombre) continue;
      const m = e.getObjectByName(nombre);
      if (!m) continue;
      const info = pad(m.isMesh ? m : m.getObjectByProperty("isMesh", true), comp, pin);
      etiquetaPin(g, info);
    }
    // los enchufes: el arnés del ESC (JST de 8) en una punta y el u.FL de la antena junto al módulo
    const jst = enchufe(g, new THREE.Vector3(-0.0335, 0.0014, 0.0085), 0.0035, 0.0085);     // la punta del arnés, junto a la placa
    pad(jst, comp, comp.pines.find((p) => p.id === "conn"));
    const ufl = enchufe(g, new THREE.Vector3(0.026, 0.0035, -0.008), 0.003, 0.003, MAT.oro);
    const pa = comp.pines.find((p) => p.id === "ant"); if (pa) pad(ufl, comp, pa);
  }
  /**
   * El nombre de un pin del dron, plano sobre la mesa junto a su pad (afuera de la placa), del color de su tipo,
   * y un aro del mismo color en el pad: así se ve qué pines usa el dron (los demás GPIO no se tocan). Solo en el tutorial:
   * después la etiqueta va en gris y sin aro (dónde va cada cable lo dice la 📄 Guía).
   */
  function etiquetaPin(g, info) {
    const pin = info.pin, m = /GPIO(\d+)\s*·\s*(\S+)/.exec(pin.nombre), txt = m ? `${m[2]} · ${m[1]}` : pin.nombre;
    const tuto = !!ctx.tutorial?.();                    // fuera del tutorial la placa no dice qué cable va en cada pin
    const color = !tuto || COLOR_PIN[pin.tipo] === "#1d1f22" ? "#9aa0a6" : COLOR_PIN[pin.tipo] || "#ccc";
    const c = document.createElement("canvas"); c.width = 256; c.height = 56;
    const gx = c.getContext("2d");
    gx.fillStyle = "rgba(10,16,14,.85)"; gx.beginPath(); gx.roundRect(2, 2, 252, 52, 14); gx.fill();
    gx.fillStyle = color; gx.beginPath(); gx.arc(28, 28, 11, 0, 7); gx.fill();
    gx.fillStyle = "#fff"; gx.font = "bold 32px sans-serif"; gx.textBaseline = "middle"; gx.fillText(txt, 50, 30);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const W = 0.0108, H = 0.0024, lado = Math.sign(info.pos.z) || 1;
    const et = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    et.rotation.x = -Math.PI / 2; et.rotation.z = lado > 0 ? -Math.PI / 2 : Math.PI / 2;     // el texto corre hacia afuera de la placa
    et.position.set(info.pos.x, 0.0006, info.pos.z + lado * (0.0032 + W / 2) + lado * (Math.abs(info.pos.z) < 0.014 ? 0.014 - Math.abs(info.pos.z) : 0));
    et.renderOrder = 4; g.add(et);
    const aro = new THREE.Mesh(new THREE.RingGeometry(0.0011, 0.0015, 24), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthWrite: false }));
    aro.rotation.x = -Math.PI / 2; aro.position.copy(info.pos).add(new THREE.Vector3(0, 0.0008, 0)); aro.renderOrder = 4;
    if (tuto) g.add(aro);
  }
  function enchufe(g, pos, w, d, mat = MAT.jst) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.0028, d), mat);
    m.position.copy(pos); m.castShadow = true; g.add(m);
    return m;
  }
  /** El ESC 4 en 1 de Blender (esc_4en1.py): pad_BATP/N, pad_M<n>_<1-3>, conector_FC. Mismo lugar de cada motor que
   * la placa genérica (M1 atrás der., M2 adelante der., M3 atrás izq., M4 adelante izq.). */
  function placaESC(g, comp) {
    const e = glb.esc.clone(true);
    g.add(e);
    e.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
    e.updateMatrixWorld(true);
    const malla = (n) => { const m = e.getObjectByName(n); return m && (m.isMesh ? m : m.getObjectByProperty("isMesh", true)); };
    for (const pin of comp.pines) {
      if (pin.id === "bat+" || pin.id === "bat-") { const m = malla(pin.id === "bat+" ? "pad_BATP" : "pad_BATN"); if (m) pad(m, comp, pin); }
      else if (/^m\d$/.test(pin.id)) for (let s2 = 0; s2 < 3; s2++) { const m = malla(`pad_M${pin.id[1]}_${s2 + 1}`); if (m) pad(m, comp, pin, s2); }
      else if (pin.id === "conn") { const m = malla("conector_FC"); if (m) pad(m, comp, pin); }
    }
  }
  /** Una placa hecha aquí: el ESC (pads grandes de batería, 3 pads por motor) o una controladora STM32. */
  function placaGenerica(g, comp) {
    const esEsc = comp.k === "esc", W = esEsc ? 0.05 : 0.046;
    const pcb = new THREE.Mesh(new THREE.BoxGeometry(W, 0.0016, W), esEsc ? MAT.pcbNegro : MAT.pcbVerde);
    pcb.position.y = 0.0008; pcb.castShadow = pcb.receiveShadow = true; g.add(pcb);
    const labels = [];
    const padMesh = (x, z, w, d, pin, sub = 0, txt = null) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.0006, d), MAT.oro.clone());
      m.position.set(x, 0.0019, z); m.castShadow = true; g.add(m);
      pad(m, comp, pin, sub);
      if (txt) labels.push([x, z + (z > 0 ? -d / 2 - 0.0024 : d / 2 + 0.0024), txt]);
    };
    if (esEsc) {
      // como un ESC 4 en 1 de verdad (vista de arriba, adelante = arriba en la pantalla): cada motor en su esquina
      // (M1 atrás der., M2 adelante der., M3 atrás izq., M4 adelante izq. — el orden de Betaflight), la batería a la
      // izquierda y el enchufe de la controladora a la derecha
      const pp = (id) => comp.pines.find((p) => p.id === id);
      padMesh(-0.0195, -0.0052, 0.008, 0.0062, pp("bat+"));
      padMesh(-0.0195, 0.0052, 0.008, 0.0062, pp("bat-"));
      labels.push([-0.0118, -0.0052, "BAT+"], [-0.0118, 0.0052, "BAT−"]);
      const esquinas = { m1: [0.016, 0.0205], m2: [0.016, -0.0205], m3: [-0.016, 0.0205], m4: [-0.016, -0.0205] };
      for (const [id, [x, z]] of Object.entries(esquinas)) {
        for (let s2 = 0; s2 < 3; s2++) padMesh(x - 0.0042 + s2 * 0.0042, z, 0.0028, 0.0032, pp(id), s2);
        labels.push([x, z - Math.sign(z) * 0.0046, id.toUpperCase()]);
      }
      for (const [x, z] of [[0.005, 0.006], [0.005, -0.006], [-0.005, 0.006], [-0.005, -0.006]]) { const mo = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.0011, 0.0045), MAT.chip); mo.position.set(x, 0.0021, z); mo.castShadow = true; g.add(mo); }
      const mcu = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.0009, 0.004), MAT.chip); mcu.position.set(0.0125, 0.002, 0); mcu.rotation.y = Math.PI / 4; g.add(mcu);
      pad(enchufe(g, new THREE.Vector3(0.0215, 0.0025, 0), 0.0035, 0.0105), comp, pp("conn"));
      labels.push([0.0165, 0.0082, "FC"]);
    } else {
      const sol = comp.pines.filter((p) => !TA.esEnchufe(p)), mitad = Math.ceil(sol.length / 2);
      sol.forEach((pin, i) => {
        const fila = i < mitad ? 1 : -1, j = i < mitad ? i : i - mitad, n = fila > 0 ? mitad : sol.length - mitad;
        padMesh(-((n - 1) * 0.0042) / 2 + j * 0.0042, fila * 0.0185, 0.0024, 0.0032, pin, 0, pin.nombre.split(" ")[0]);
      });
      const mcu = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.0014, 0.01), MAT.chip); mcu.position.y = 0.0023; mcu.rotation.y = Math.PI / 4; g.add(mcu);
      const pc = comp.pines.find((p) => p.id === "conn"); if (pc) pad(enchufe(g, new THREE.Vector3(-0.02, 0.0025, 0), 0.0035, 0.0105), comp, pc);
    }
    // la serigrafía (los nombres de los pads)
    const c = document.createElement("canvas"); c.width = c.height = 1024;
    const gx = c.getContext("2d"); gx.fillStyle = "#fff"; gx.font = "bold 34px sans-serif"; gx.textAlign = "center"; gx.textBaseline = "middle";
    for (const [x, z, tx] of labels) gx.fillText(tx, (x / W + 0.5) * 1024, (z / W + 0.5) * 1024);
    gx.font = "bold 30px sans-serif"; gx.fillStyle = "rgba(255,255,255,.55)"; gx.fillText(esEsc ? "ESC 4in1 · BLHeli" : "STM32 FC", 512, esEsc ? 512 + 245 : 512 + 60);
    if (esEsc) { gx.font = "26px sans-serif"; gx.fillText("▲ FRONT", 512, 140); }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const ser = new THREE.Mesh(new THREE.PlaneGeometry(W, W), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    ser.rotation.x = -Math.PI / 2; ser.position.y = 0.00165; g.add(ser);
  }

  /**
   * Por dónde llega el cable de cada pieza (en el plano de la mesa): cada motor desde su esquina (adelante = arriba en
   * la pantalla), la batería y el ESC desde la izquierda, lo demás desde el borde de la placa más cercano a su pad.
   * Así los cables quedan ordenados; si pones un motor en la salida equivocada, su cable cruza la placa (y se nota).
   */
  function direccion(fuenteRef, pos) {
    const k = fuenteRef.split(".")[0], m = /^m(F|R)(L|R)$/.exec(k);
    if (m) return new THREE.Vector3(m[2] === "R" ? 1 : -1, 0, m[1] === "F" ? -1 : 1).normalize();
    if (k === "xt60" || k === "esc") return new THREE.Vector3(-1, 0, 0);
    const H = M.borde, dx = H.x - Math.abs(pos.x), dz = H.z - Math.abs(pos.z);
    return dx < dz ? new THREE.Vector3(Math.sign(pos.x) || 1, 0, 0) : new THREE.Vector3(0, 0, Math.sign(pos.z) || 1);
  }
  /** El grosor de cada cable (el de la batería es grueso; los de señal, finos). */
  const grosor = (fuenteRef) => { const k = fuenteRef.split(".")[0]; return k === "xt60" ? 0.0009 : /^m/.test(k) ? 0.00052 : k === "esc" ? 0.0006 : 0.00042; };
  const COLOR_FASE = [0x111111, 0x2050d0, 0xd03030];
  const CABLES = [];
  /** Los cables puestos en esta placa: tubo desde el borde hasta el pad, con su gota de estaño. */
  function dibujarCables() {
    for (const o of CABLES) M.placaG.remove(o);
    CABLES.length = 0;
    const B = D().banco, J = B.juntas || {};
    M.gotas = {};
    for (const x of M.pads.values()) x.medida = null;
    for (const c of B.cables) {
      // el lado del cable que está en esta placa (los enchufes, como el arnés ESC-controladora, se ven en las dos)
      const aqui = c.find((r) => r.split(".")[0] === M.placa), placa = TA.placaDe(c, M.comps);
      if (!aqui || (aqui !== placa && !TA.esEnchufe(pinDe(aqui)))) continue;
      const placaAqui = aqui;
      const fuente = c[0] === placaAqui ? c[1] : c[0], j = J[TA.claveCable(c)], n = TA.juntasDe(...c.map((r) => pinDe(r)));
      for (let s = 0; s < n; s++) {
        const P_ = M.pads.get(`${placaAqui}#${s}`) || M.pads.get(`${placaAqui}#0`);
        if (!P_) continue;
        const col = n === 3 ? COLOR_FASE[s] : new THREE.Color(COLOR_PIN[pinDe(fuente)?.tipo] || "#ccc");
        const tubo = cable(P_, direccion(fuente, P_.pos), col, grosor(fuente), P_.enchufe);
        M.placaG.add(tubo); CABLES.push(tubo);
        const sj = j ? j.s?.[s] : { q: "buena", estano: TA.PADS[P_.pad].ideal[1] * 0.8 };      // partida vieja: soldado bien
        if (!P_.enchufe && sj && sj.q !== "sin") {
          const gota = gotaMesh(sj.estano, sj.q, P_);
          M.placaG.add(gota); CABLES.push(gota); M.gotas[`${P_.ref}#${P_.sub}`] = gota;
          P_.medida = sj.q === "puente" ? "corto" : sj.q === "fria" || sj.q === "levantado" ? "fria" : "ok";
          if (sj.q === "puente") { const pu = puenteMesh(P_); if (pu) { M.placaG.add(pu); CABLES.push(pu); } }
        }
      }
    }
    hud();
  }
  const pinDe = (ref) => { const [k, id] = ref.split("."); return M.comps.find((c) => c.k === k)?.pines.find((p) => p.id === id); };
  /**
   * Un cable: llega por la mesa desde su dirección, sube al borde de la placa, corre pegado a ella y termina pelado y
   * estañado sobre el pad (o en el conector).
   */
  function cable(P_, dir, color, r, enchufe) {
    const p = P_.pos, H = M.borde;
    const tx = dir.x ? (Math.sign(dir.x) * H.x - p.x) / dir.x : Infinity, tz = dir.z ? (Math.sign(dir.z) * H.z - p.z) / dir.z : Infinity;
    const kB = Math.max(0.003, Math.min(tx, tz)), piso = r + 0.0003, sobre = 0.0017 + r + 0.0004, fin = enchufe ? p.y + 0.0014 : sobre;
    const en = (k, y) => new THREE.Vector3(p.x + dir.x * k, y, p.z + dir.z * k);
    const g = new THREE.Group();
    const curva = new THREE.CatmullRomCurve3([en(kB + 0.09, piso), en(kB + 0.03, piso), en(kB + 0.005, piso + 0.0004), en(kB - 0.0015, sobre + 0.0006), en(Math.max(0.0042, kB * 0.4), sobre), en(0.0024, fin)]);
    const t1 = new THREE.Mesh(new THREE.TubeGeometry(curva, 48, r, 10), new THREE.MeshStandardMaterial({ color, roughness: 0.5 }));
    t1.castShadow = true; g.add(t1);
    // la punta pelada y estañada
    const punta = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.75, r * 0.75, 1, 10), enchufe ? MAT.jst : MAT.estanoOk);
    entre(punta, en(0.0026, fin), en(enchufe ? 0.0005 : 0.0002, fin - (enchufe ? 0 : 0.0003)));
    g.add(punta);
    return g;
  }
  /** La gota de estaño de una junta (brilla si salió buena; opaca y granulosa si salió fría). */
  function gotaMesh(estano, q, P_) {
    const pd = TA.PADS[P_.pad], k = Math.min(1.6, estano / pd.ideal[1]);
    const r = (P_.pad === "grande" ? 0.0026 : P_.pad === "medio" ? 0.0013 : 0.001) * (0.6 + 0.5 * k);
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), q === "fria" ? MAT.estanoFrio : q === "liquido" ? MAT.estanoLiq : MAT.estanoOk);
    m.scale.y = 0.7; m.position.copy(P_.pos); m.position.y += 0.0003; m.castShadow = true;
    if (q === "levantado") { m.rotation.z = 0.5; m.position.y += 0.0012; }
    return m;
  }

  /** El puente de estaño: una lengüeta que une el pad con el de al lado. */
  /** El pad de al lado (con el que hace puente el estaño de más). */
  const vecinoPad = (P_) => P_.pad === "medio" ? M.pads.get(`${P_.ref}#${P_.sub < 2 ? P_.sub + 1 : P_.sub - 1}`)
    : P_.pad === "grande" ? M.pads.get(P_.ref === "esc.bat+" ? "esc.bat-#0" : "esc.bat+#0") : M.pads.get(`${TA.vecino(M.comps, P_.ref)}#0`);
  function puenteMesh(P_) {
    const v = vecinoPad(P_);
    if (!v) return null;
    const a = P_.pos.clone(), b = v.pos.clone(); a.y = b.y = Math.max(a.y, b.y) + 0.0004;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.0006, 0.0006, 1, 10), MAT.estanoOk);
    entre(m, a, b); m.scale.x = m.scale.z = 1.3; m.castShadow = true;
    return m;
  }

  // ---------------- poner y quitar cables ----------------
  /** Lo que se puede conectar a esta placa (los cables de las otras piezas) y lo que ya está puesto. */
  function fuentes() {
    const B = D().banco, out = [];
    // al ESC van la batería, los motores y lo que va directo a la batería si la controladora no tiene VBAT (la cámara
    // con gimbal en un ESP32); lo demás a la controladora
    const fcVbat = M.comps.find((c) => c.k === "fc")?.pines.some((p) => p.id === "vbat");
    const alEsc = (c, pin) => c.k === "xt60" || /^m(FL|FR|RL|RR)$/.test(c.k) || (pin.tipo === "vbat_in" && !fcVbat);
    for (const c of M.comps) {
      if (c.k === M.placa || c.k === "fc" || (c.k === "esc" && M.placa !== "fc")) continue;
      for (const pin of c.pines) {
        if (c.k === "esc" && pin.id !== "conn") continue;
        if (c.k !== "esc" && alEsc(c, pin) !== (M.placa === "esc")) continue;
        const ref = `${c.k}.${pin.id}`;
        const puestos = B.cables.filter((x) => x.includes(ref));
        const aqui = puestos.find((x) => TA.placaDe(x, M.comps).split(".")[0] === M.placa);
        if (puestos.length && !aqui && c.k !== "xt60") continue;          // ya está en la otra placa
        out.push({ ref, comp: c, pin, cable: aqui || null });
      }
    }
    return out;
  }
  /** El nombre corto de cada pieza en la lista de cables. */
  const nombreCorto = (c) => ({ xt60: "XT60", esc: "ESC", fc: t("Controladora"), rx: t("Receptor"), gps: "GPS", cam: t("Cámara"), tof: "ToF", led: "LED", ant: t("Antena") })[c.k] || c.nombre;
  function tomarCable(f) {
    if (f.cable) return quitarCable(f.cable);
    M.enMano = f.ref;
    sfx("click");
    hud();
  }
  function ponerCable(info) {
    const fuente = M.enMano, B = D().banco, pf = pinDe(fuente);
    if (TA.esEnchufe(pf) !== info.enchufe) return aviso(info.enchufe ? t("Eso es un enchufe: ahí va un conector, no un cable para soldar.") : t("Ese cable termina en un conector: búscale su enchufe."));
    const c = [fuente, info.ref];
    if (B.cables.some((x) => TA.claveCable(x) === TA.claveCable(c))) return aviso(t("Ese cable ya está ahí."));
    const metros = info.enchufe || pf?.tipo === "vbat+" || fuente.startsWith("xt60") ? 0 : 0.1 * TA.juntasDe(pf, info.pin);   // el arnés y el cable de la batería vienen con su pieza
    if (metros && !PT.gastar(P(), "cable", metros)) return aviso(t("Se te acabó el cable: compra más en la tienda (Soldadura)."));
    B.cables.push(c);
    B.juntas = B.juntas || {};
    B.juntas[TA.claveCable(c)] = { q: "sin", n: TA.juntasDe(pf, info.pin), s: [] };
    M.enMano = null;
    guardar();
    if (info.enchufe) { M.hold = { tipo: "enchufar", c, p: 0, info }; aviso(t("Mantén apretado para que entre el conector…")); }
    else { sfx("click"); aviso(t("Cable en su pad. Ahora caliéntalo con el cautín y mete estaño (Espacio).")); }
    dibujarCables();
  }
  function quitarCable(c) {
    const B = D().banco, j = B.juntas?.[TA.claveCable(c)];
    const soldado = j ? j.q !== "sin" && j.q !== "enchufado" : true;
    if (soldado && M.E.temp < 250) return aviso(t("Para soltar un cable soldado, el cautín tiene que estar caliente (más de 250 °C)."));
    B.cables = B.cables.filter((x) => TA.claveCable(x) !== TA.claveCable(c));
    if (B.juntas) delete B.juntas[TA.claveCable(c)];
    sfx(soldado ? "chispa" : "click");
    guardar();
    aviso(t("Quitaste el cable."));
    dibujarCables();
  }

  // ---------------- soldar una junta ----------------
  /** El cable que está en ese pad (el primero que falte por soldar). */
  function cableEn(info) {
    const B = D().banco, J = B.juntas || {};
    const cs = B.cables.filter((c) => c.includes(info.ref) && (TA.placaDe(c, M.comps) === info.ref || info.enchufe));
    return cs.find((c) => (J[TA.claveCable(c)]?.s?.[info.sub]?.q || "sin") !== "buena") || cs[0] || null;
  }
  function empezarJunta(info) {
    const c = cableEn(info), key = `${info.ref}#${info.sub}`;
    let J = M.juntas.get(key);
    if (!J) {
      J = TA.junta0(info.pad);
      const prev = c && D().banco.juntas?.[TA.claveCable(c)]?.s?.[info.sub];
      if (prev) { J.estano = prev.estano; J.flux = !!prev.fluxNuevo; }
      M.juntas.set(key, J);
    }
    if (M.fluxPads.has(key)) { J.flux = true; J.fluxQueda = 1; }      // el flux que pusiste con la jeringa
    M.hold = { tipo: "soldar", info, c, J, key };
    if (M.gotas?.[key]) M.gotas[key].visible = false;            // la gota que había se derrite (se dibuja la de ahora)
    if (!c) aviso(t("Ese pad no tiene cable: pon uno primero (izquierda)."));
  }
  function terminarJunta() {
    const { info, c, J, key } = M.hold;
    M.hold = null;
    if (!c) return;
    const B = D().banco, j = B.juntas[TA.claveCable(c)] || (B.juntas[TA.claveCable(c)] = { q: "sin", n: TA.juntasDe(pinDe(c[0]), pinDe(c[1])), s: [] });
    const antes = j.s[info.sub];
    if (J.estano < 0.25 && !antes) { hud(); return; }               // todavía no hay junta: queda para seguir
    const r = TA.resultadoJunta(J, P_vecino(info));
    if (M.fluxPads.has(key)) { M.placaG.remove(M.fluxPads.get(key)); M.fluxPads.delete(key); }   // el flux se quema al soldar
    j.s[info.sub] = { q: r.q, estano: +J.estano.toFixed(2) };
    const hechas = Array.from({ length: j.n }, (_, i) => j.s[i]?.q || "sin");
    j.q = TA.peor(hechas);
    M.juntas.delete(key);
    info.mesh.material.emissive?.setRGB(0, 0, 0);
    guardar();
    // la mesa no dice si salió bien: eso se ve (la gota, un puente) o se mide con el multímetro… o se descubre con la batería
    if (r.q === "sin") { if (antes && antes.q !== "sin") aviso(t("Desoldado: el cable quedó suelto en el pad.")); }
    else aviso(t("Soldado."));
    sfx(r.q === "sin" ? "click" : "chispa");
    dibujarCables();
  }

  /** ¿El pad tiene uno al lado con el que pueda hacer puente? */
  const P_vecino = (info) => info.pad === "medio" || info.pad === "grande" || !!TA.vecino(M.comps, info.ref);
  /** El extractor (bomba): con el cautín sobre el estaño derretido, chupa de un golpe. */
  function bomba() {
    if (M.modo !== "soldar") return;
    if (!PT.tieneHerramienta(P(), "extractor")) return aviso(t("No tienes extractor de estaño: está en la tienda (Soldadura)."));
    const h = M.hold;
    if (h?.tipo !== "soldar") return aviso(t("Cautín en la junta (mantén el clic) + Espacio."));
    if (M.t - (M.bombaT || -9) < 0.8) return;                     // hay que volver a cargar la bomba
    M.bombaT = M.t;
    const q = TA.extraer(h.J);
    if (!q) return aviso(t("El estaño todavía no está derretido: caliéntalo un poco más."));
    sfx("pop");
    if (h.gota) { M.placaG.remove(h.gota); h.gota = null; }
    aviso(t("🥤 ¡Chupaste el estaño!"), true);
  }

  // ---------------- las máquinas (herramientas caras de nivel avanzado: piezas.json herramientas) ----------------
  // 🤖 auto-atornillador: los tornillos del paso de una vez · auto-conectores: cada cable a su pad (o su enchufe) ·
  // auto-soldador: las juntas que faltan, todas buenas. Cada una gasta lo mismo que a mano (cable, estaño).
  const tiene = (id) => PT.tieneHerramienta(P(), id);
  /** Qué hace el botón 🤖 ahora (o null si no hay máquina para esto). */
  function autoAhora() {
    if (M.modo === "armar") return tiene("auto_atornillador") && M.proc?.pts?.some((q) => !q.listo) ? "atornillar" : null;
    if (!M.comps) return null;
    if (tiene("auto_conectores") && fuentes().some((f) => !f.cable && destinoAqui(f.ref))) return "conectar";
    if (tiene("auto_soldador") && sinSoldarAqui().length) return "soldar";
    return null;
  }
  const destinoAqui = (ref) => {
    const a = destinoDe(ref);                         // el arnés (un enchufe) se ve en las dos placas: va igual
    return a && a.split(".")[0] === M.placa && M.pads.has(`${a}#0`) && (TA.esEnchufe(pinDe(a)) || TA.placaDe([ref, a], M.comps) === a) ? a : null;
  };
  const sinSoldarAqui = () => { const B = D().banco; return B.cables.filter((c) => { const r = TA.placaDe(c, M.comps); return r.split(".")[0] === M.placa && !TA.esEnchufe(pinDe(r)) && (B.juntas?.[TA.claveCable(c)]?.q || "sin") !== "buena"; }); };
  function auto() {
    const que = autoAhora(), B = D().banco;
    if (que === "atornillar") {
      for (const q of M.proc.pts.filter((x) => !x.listo)) { q.tornillo = q.tornillo || ponerHerraje(q); puntoListo(q); }
      return;
    }
    if (que === "conectar") {
      for (const f of fuentes()) {
        const a = !f.cable && destinoAqui(f.ref);
        if (!a) continue;
        const info = M.pads.get(`${a}#0`), pf = pinDe(f.ref), c = [f.ref, a];
        const metros = info.enchufe || pf?.tipo === "vbat+" || f.ref.startsWith("xt60") ? 0 : 0.1 * TA.juntasDe(pf, info.pin);
        if (metros && !PT.gastar(P(), "cable", metros)) { aviso(t("Se te acabó el cable: compra más en la tienda (Soldadura).")); break; }
        B.cables.push(c);
        B.juntas = B.juntas || {};
        B.juntas[TA.claveCable(c)] = info.enchufe ? { q: "enchufado", n: 1, s: [{ q: "enchufado" }] } : { q: "sin", n: TA.juntasDe(pf, info.pin), s: [] };
      }
      M.enMano = null;
    }
    if (que === "soldar") {
      for (const c of sinSoldarAqui()) {
        const r = TA.placaDe(c, M.comps), j = B.juntas[TA.claveCable(c)] || (B.juntas[TA.claveCable(c)] = { q: "sin", n: TA.juntasDe(pinDe(c[0]), pinDe(c[1])), s: [] });
        const pad = M.pads.get(`${r}#0`)?.pad || "chico", ideal = TA.PADS[pad].ideal, e = (ideal[0] + ideal[1]) / 2;
        if (!PT.gastar(P(), "estano", e * j.n * TA.GRAMOS)) { aviso(t("Se acabó: 🛒 Tienda → Soldadura.")); break; }
        j.s = Array.from({ length: j.n }, () => ({ q: "buena", estano: e }));
        j.q = "buena";
      }
    }
    if (!que) return;
    guardar(); sfx(que === "soldar" ? "chispa" : "click");
    aviso("🤖 " + { conectar: t("Cables conectados."), soldar: t("Todo soldado.") }[que], true);
    dibujarCables(); hud();
  }
  $("mesa-auto").onclick = auto;

  // ---------------- el ratón y el teclado ----------------
  function apuntar(ev) {
    const r = $("mesa-c").getBoundingClientRect();
    M.mouse.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    M.cx = ev.clientX; M.cy = ev.clientY;
    ray.setFromCamera(M.mouse, cam);
    const hit = ray.intersectObjects(M.pick, false).find((h) => h.object.userData.accion) || null;
    const tipo = hit?.object.userData.accion?.tipo;
    if (M.modo !== "soldar" || tipo === "pad" || tipo === "tool") return hit;
    return padCerca(ev, r) || hit;
  }
  /** Los pads chicos (la ESP32) son de 1-2 px: el pad más cercano al ratón a menos de 22 px cuenta como tocado. */
  function padCerca(ev, r) {
    let mejor = null, dmin = 22 * 22;
    const v = new THREE.Vector3();
    for (const info of M.pads?.values() || []) {
      v.copy(info.pos).project(cam);
      const dx = (v.x + 1) / 2 * r.width + r.left - ev.clientX, dy = (1 - v.y) / 2 * r.height + r.top - ev.clientY, d = dx * dx + dy * dy;
      if (d < dmin) { dmin = d; mejor = info; }
    }
    return mejor && { object: mejor.mesh, point: mejor.pos.clone() };
  }
  function abajo(ev) {
    if (ev.button !== 0 || M.tweens.some((x) => x.bloquea)) return;
    const hit = apuntar(ev), a = hit?.object.userData.accion;
    if (M.modo === "armar") {
      if (!a) return;
      const P_ = M.proc, paso = P_?.pasos[P_.i];
      if (a.tipo === "caja") { M.hold = { tipo: "cortar", it: a.it, p: 0, ruido: 0 }; H.cuter.visible = true; }
      else if (a.tipo === "pieza") {
        if (!P_) { if (!empezar(a.it)) return; }
        else if (P_.it !== a.it) return aviso(t("Termina primero de montar {pieza} (Esc para dejarla).", { pieza: NOMBRE()[P_.it.slot] }));
        const [tp] = M.proc.pasos[M.proc.i], pz = a.it.piezas[a.i];
        if (tp === "colocar" || tp === "colocar_cada") {
          M.arrastre = { it: a.it, i: a.i }; M.ultima = pz; controls.enableZoom = false;
          const s0 = pz.piv.scale.x; tween(0.15, (k) => pz.piv.scale.setScalar(lerp(s0, 1, k)), null, false);
          sfx("click");
        } else if (tp === "mantener") M.hold = { tipo: "mantener", p: 0 };
      }
      else if (a.tipo === "voltear" && paso?.[0] === "voltear") { M.pick = []; voltear(paso[1]); }
      else if (a.tipo === "punto" && P_?.pts) {
        const q = P_.pts[a.i];
        if (q.listo) return;
        if (paso[0] === "clics") { q.tornillo = ponerHerraje(q); puntoListo(q); return; }
        if (!q.tornillo) { q.tornillo = ponerHerraje(q, 0.005); sfx("click"); }
        M.hold = { tipo: "tornillo", i: a.i, ruido: 0, giro: 0 };
      }
      else if (a.tipo === "mantener") M.hold = { tipo: "mantener", p: 0 };
      else if (a.tipo === "desmontar") M.hold = { tipo: "desmontar", it: a.it, p: 0 };
      return;
    }
    // soldar
    if (M.multi) {                                     // midiendo: el clic pone la punta negra (o cambia el modo del multímetro)
      if (a?.tipo === "pad") ponerNegra(a.info);
      else if (a?.tipo === "multi") cambiarModo();
      return;
    }
    if (a?.tipo === "pad") {
      if (M.enMano) return ponerCable(a.info);
      if (a.info.enchufe) { const c = cableEn(a.info); if (c) aviso(t("Ya está enchufado.")); else aviso(t("Toma el conector de la izquierda y ponlo aquí.")); return; }
      if (M.mano2 === "flux") return ponerFlux(a.info);
      if (!M.E.on) aviso(t("La estación está apagada: préndela (⏻)."));
      empezarJunta(a.info);
      M.tocando = true;
    } else if (a?.tipo === "tool") tomar(a.k);
    else if (a?.tipo === "multi") multimetro();          // tocar el multímetro = tomarlo
  }
  function mover(ev) {
    const hit = apuntar(ev);
    M.hover = hit?.object.userData.accion || null;
    if (M.modo === "armar" && M.arrastre) {           // la pieza sigue al ratón, un poco en el aire
      const pz = M.arrastre.it.piezas[M.arrastre.i], v = new THREE.Vector3();
      const yy = pz.centro.y + (M.base || 0) + 0.02;
      if (ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -yy), v)) pz.piv.position.set(v.x, yy, v.z);
      $("mesa-c").style.cursor = "grabbing";
      return;
    }
    if (M.modo === "soldar") {
      // la punta del cautín sigue al ratón sobre la placa (apoyada si estás soldando)
      const pl = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.002), v = new THREE.Vector3();
      if (hit && hit.object.userData.accion?.tipo !== "multi") v.copy(hit.point); else ray.ray.intersectPlane(pl, v);
      if (v) M.tPunta.copy(v);
    }
    etiqueta(M.hover?.tipo === "tool" ? M.hover.k : null);
    $("mesa-c").style.cursor = M.hover ? "pointer" : M.modo === "soldar" ? "none" : "default";
  }
  function arriba() {
    if (M.arrastre) { soltarPieza(); hud(); return; }
    if (!M.hold) return;
    if (M.hold.tipo === "soldar") { M.tocando = false; terminarJunta(); return; }
    if (M.hold.tipo === "cortar") H.cuter.visible = false;
    if (M.hold.tipo === "tornillo") {
      H.destornillador.visible = false;
      const q = M.proc?.pts?.[M.hold.i];
      if (q && q.T.estado === "apretado" && !q.listo) { M.hold = null; anillo(null); puntoListo(q); return; }
    }
    if ((M.hold.tipo === "mantener" || M.hold.tipo === "desmontar") && M.hold.p < 1) anillo(null);
    if (M.hold.tipo === "enchufar" && M.hold.p < 1) { const B = D().banco; B.cables = B.cables.filter((x) => x !== M.hold.c); delete B.juntas[TA.claveCable(M.hold.c)]; aviso(t("Se salió: mantén apretado hasta el clic.")); dibujarCables(); }
    M.hold = null;
    hud();
  }
  function tecla(e) {
    if (!M.abierta || e.target.closest?.("input,textarea")) return;
    if (e.code === "Space") { e.preventDefault(); if (!e.repeat) espacio(); }
    else if (e.key === "f" || e.key === "F") tomar("flux");
    else if (e.key === "e" || e.key === "E") tomar("estano");
    else if (e.key === "c" || e.key === "C") tomar("esponja");
    else if (e.key === "x" || e.key === "X") tomar("bomba");
    else if (e.key === "m" || e.key === "M") tomar("malla");
    else if (e.key === "t" || e.key === "T") multimetro();
    else if ((e.key === "r" || e.key === "R") && M.modo === "armar") girarPieza(1);
    else if (e.key === "Escape") { if (M.multi) multimetro(); else if (M.enMano) { M.enMano = null; hud(); } else if (M.mano2) { M.mano2 = null; M.espacio = false; hud(); } else if (M.proc) cancelarProc(); else cerrar(); }
  }
  /** Girar la pieza que llevas (o la última que tocaste) un cuarto de vuelta. */
  function girarPieza(dir) {
    const pz = M.arrastre ? M.arrastre.it.piezas[M.arrastre.i] : M.ultima;
    if (!pz || !pz.girar || pz.lista) return;
    const r0 = pz.piv.rotation.y;
    pz.meta = (pz.meta ?? Math.round(r0 / (Math.PI / 2)) * (Math.PI / 2)) + (dir * Math.PI) / 2;     // a dónde va (aunque aprietes R rápido)
    const r1 = pz.meta;
    tween(0.15, (k) => { pz.piv.rotation.y = lerp(r0, r1, k); }, null, false);
    sfx("click");
  }
  /** Espacio = lo que hace la otra mano: el estaño entra (mientras lo aprietas) o la bomba chupa. */
  function espacio() {
    if (M.modo !== "soldar" || M.multi) return;
    if (M.mano2 === "estano") M.espacio = true;
    else if (M.mano2 === "bomba") bomba();
    else if (!M.mano2 && M.t - M.avisoT > 1.5) { M.avisoT = M.t; aviso(t("🧵 Toma el estaño de la bandeja (derecha).")); }
  }
  /** Tomar (o devolver) una herramienta de la bandeja con la otra mano. La esponja no se toma: limpia la punta. */
  function tomar(k) {
    if (M.modo !== "soldar" || M.hold || M.multi) return;
    if (k === "esponja") return limpiarPunta();
    if (M.mano2 === k) { M.mano2 = null; M.espacio = false; sfx("click"); hud(); return; }
    const p = P();
    if (k === "bomba" && !PT.tieneHerramienta(p, "extractor")) return aviso(t("No tienes bomba: 🛒 Tienda → Soldadura."));
    const falta = { flux: PT.insumo(p, "flux") < 0.25, estano: PT.insumo(p, "estano") < 0.1, malla: PT.insumo(p, "malla") <= 0 }[k];
    if (falta) return aviso(t("Se acabó: 🛒 Tienda → Soldadura."));
    M.mano2 = k; M.espacio = false; sfx("click"); hud();
  }
  /** La jeringa en el pad: queda una gota de flux (se gasta al ponerla). */
  function ponerFlux(info) {
    const key = `${info.ref}#${info.sub}`;
    if (info.enchufe || M.fluxPads.has(key)) return;
    if (!PT.gastar(P(), "flux", 0.25)) { M.mano2 = null; hud(); return aviso(t("Se acabó: 🛒 Tienda → Soldadura.")); }
    const r = info.pad === "grande" ? 0.0034 : info.pad === "medio" ? 0.002 : 0.0015;
    const gota = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.1, 0.0005, 20), MAT.flux);
    gota.position.copy(M.placaG.worldToLocal(info.pos.clone())).add(new THREE.Vector3(0, 0.0004, 0));
    M.placaG.add(gota); M.fluxPads.set(key, gota);
    sfx("pop"); hud();
  }
  // ---------------- el multímetro (multimetro.js: el GLB de Blender) ----------------
  // Está en el tapete, parado en su pata detrás de la placa. Con T lo tomas: la punta ROJA sigue al ratón, un clic en un
  // pad deja ahí la NEGRA, y la pantalla dice lo que hay entre las dos: continuidad (pita si están unidas: un puente de
  // estaño o dos GND), ohmios, o voltios si la batería ya está conectada (pasó la prueba de humo). En una junta fría la
  // lectura salta. Un clic en el multímetro cambia el modo (la perilla gira). No dice nada más: hay que saber medir.
  const MM_TILT = 0.7;                                  // la pata: 40° (la pantalla mira a la cámara)
  const MM_K = 0.6;                                     // uno de bolsillo (95 x 48 mm): el de 158 mm tapaba la placa
  function colocarMulti() {
    if (!PT.tieneHerramienta(P(), "multimetro")) { if (M.mm) M.mm.g.visible = false; M.multi = false; return; }
    if (!M.mm || (!M.mm.glb && modeloListo())) {
      if (M.mm) { scene.remove(M.mm.g, M.mm.puntas.roja, M.mm.puntas.negra); }
      M.mm = multimetro3d();
      for (const c of M.mm.cables) c.visible = false;  // los de reposo: aquí van los que siguen a las puntas
      for (const k of ["roja", "negra"]) { const pz = M.mm.puntas[k]; pz.removeFromParent(); pz.rotation.set(0, 0, 0); pz.scale.setScalar(MM_K); scene.add(pz); }
      M.mm.g.traverse((o) => { if (o.isMesh) o.userData.accion = { tipo: "multi" }; });
      scene.add(M.mm.g);
      M.cablesMM = [0, 1].map((i) => { const m = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ color: i ? 0x141414 : 0xa81c14, roughness: 0.5 })); m.castShadow = true; scene.add(m); return m; });
      M.medir = { negra: null, modo: "cont", salto: 0, txt: "OL", pita: false, tubo: 0 };
    }
    const g = M.mm.g, c = Math.cos(MM_TILT), s = Math.sin(MM_TILT);
    g.rotation.set(MM_TILT, 0, 0); g.scale.setScalar(MM_K);
    g.position.set(-0.004, s * 0.079 * MM_K, -(M.borde.z + 0.012) - c * 0.079 * MM_K);
    g.visible = M.mm.puntas.roja.visible = M.mm.puntas.negra.visible = true;
    g.updateMatrixWorld(true);
    for (const o of M.cablesMM) o.visible = true;
    g.traverse((o) => { if (o.isMesh) M.pick.push(o); });
    if (M.multi) { M.medir.negra = null; vistaMedir(true); }
    else descansarPuntas();
    M.medir.tubo = 0;
  }
  const modeloListo = () => cargado("multimetro");
  /** Una punta acostada en el tapete, a la izquierda del multímetro (lejos de la placa): la aguja hacia atrás. */
  function reposo(k) {
    const g = M.mm.g.position, pz = M.mm.puntas[k];
    pz.position.set(g.x - (k === "roja" ? 0.036 : 0.047), 0.0045, g.z - 0.045);
    pz.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(k === "roja" ? 0.04 : -0.02, 0.06, 1).normalize());
  }
  function descansarPuntas() { reposo("roja"); reposo("negra"); M.medir.tubo = 0; }
  /** La cámara de medir: más atrás y más baja, para ver la placa y la pantalla del multímetro a la vez. */
  function vistaMedir(ya = false) {
    // que quepan la pantalla del multímetro y la placa: el punto medio, desde arriba y adelante
    const D = M.mm.g.localToWorld(new THREE.Vector3(0, 0.031, -0.044)), B = new THREE.Vector3(0.006, 0, M.borde.z * 0.4), fov = 40;
    const tg = D.clone().lerp(B, 0.5), d = (D.distanceTo(B) / 2) / Math.tan(THREE.MathUtils.degToRad(fov / 2)) * 1.65 + 0.01;
    irCamara(tg.clone().add(new THREE.Vector3(0, 0.8, 0.6).multiplyScalar(d)), tg, fov, ya);
  }
  function irCamara(ps, tg, fov, ya) {
    const p0 = cam.position.clone(), t0 = controls.target.clone(), f0 = cam.fov;
    const paso = (k) => { const e = suave(k); cam.position.lerpVectors(p0, ps, e); controls.target.lerpVectors(t0, tg, e); cam.fov = lerp(f0, fov, e); cam.updateProjectionMatrix(); };
    if (ya) paso(1); else tween(0.45, paso, null, false);
  }
  /** T: tomar o dejar el multímetro. */
  function multimetro() {
    if (M.modo !== "soldar") return;
    if (!PT.tieneHerramienta(P(), "multimetro")) return aviso(t("No tienes multímetro: está en la tienda (Herramientas)."));
    if (!M.mm) colocarMulti();
    M.multi = !M.multi; sfx("click");
    M.enMano = null; M.mano2 = null; M.espacio = false; M.tocando = false;
    if (M.hold?.tipo === "soldar") { M.hold = null; }
    if (M.multi) {
      M.medir.negra = null;
      M.medir.modo = bateriaPuesta() ? "v" : "cont";
      M.mm.modo(M.medir.modo);
      vistaMedir();
      aviso("📟 " + t("Clic en un pad: ahí va la punta negra. La roja mide donde apuntes."), true);
    } else {
      pitido(false);
      M.mm.modo("off"); M.mm.pantalla({ modo: "off" });
      descansarPuntas();
      irCamara(new THREE.Vector3(VISTA_SOLDAR.x, VISTA_SOLDAR.y, 0.022), new THREE.Vector3(VISTA_SOLDAR.x, 0, 0.001), 36);
    }
    hud();
  }
  function cambiarModo() {
    const orden = ["cont", "ohm", "v"], m = orden[(orden.indexOf(M.medir.modo) + 1) % orden.length];
    M.medir.modo = m; M.mm.modo(m); sfx("trinquete");
    aviso("📟 " + { cont: t("Continuidad: pita si hay contacto"), ohm: t("Ohmios"), v: t("Voltios (con la batería puesta)") }[m], true);
  }
  function ponerNegra(info) {
    M.medir.negra = M.medir.negra === info ? null : info;
    M.medir.tubo = 0; sfx("click");
  }
  /** ¿La batería está puesta? = pasó la prueba de humo con este cableado (banco.js). */
  const bateriaPuesta = () => !!ctx.estadoDe(D()).pasos.find((x) => x.k === "humo")?.ok;
  function voltaje(info) {
    const tp = info.pin?.tipo || "";
    if (tp === "vbat_in" || tp === "vbat+") {
      const u = U(D().slots.bateria), ba = u && (cat.baterias || []).find((b) => b.id === u.id);
      return (ba?.celdas || 3) * 3.95;
    }
    return { "5v+": 5.02, "5v_in": 5.01, "3v3+": 3.31, "3v3_in": 3.3, tx: 3.29, rx: 3.28 }[tp] || 0;
  }
  /** Lo que marca la pantalla con la negra en `a` y la roja en `b`. */
  function lectura(a, b, dt) {
    const m = M.medir.modo, fria = [a, b].some((x) => x?.medida === "fria");
    M.medir.salto -= dt;
    const salta = fria && a && b;
    if (salta && M.medir.salto > 0) return { txt: M.medir.txt, pita: M.medir.pita };    // la lectura salta a saltos
    if (salta) M.medir.salto = 0.08 + Math.random() * 0.14;
    let txt = m === "v" ? "0.00" : "OL", pita = false;
    if (a && b) {
      if (m === "v") {
        const v = bateriaPuesta() ? voltaje(b) - voltaje(a) : 0;
        txt = (salta ? v * Math.random() : v).toFixed(2);
      } else {
        const unidos = a === b || (a.medida === "corto" && vecinoPad(a) === b) || (b.medida === "corto" && vecinoPad(b) === a)
          || (a.pin?.tipo === "gnd" && b.pin?.tipo === "gnd");
        if (salta) { const r = Math.random(); txt = r < 0.45 ? "OL" : (r * 400).toFixed(1); pita = m === "cont" && r > 0.7; }
        else if (unidos) { txt = a === b ? "0.0" : "0.2"; pita = m === "cont"; }
      }
    }
    return { txt, pita };
  }
  /** Cada cuadro, midiendo: las puntas, sus cables, la pantalla y el pitido. */
  function pasoMedir(dt) {
    const roja = M.mm.puntas.roja, negra = M.mm.puntas.negra;
    const hv = M.hover?.tipo === "pad" ? M.hover.info : null;
    const tip = hv ? hv.pos.clone().add(new THREE.Vector3(0, 0.0004, 0)) : M.tPunta.clone().setY(Math.max(0.003, M.tPunta.y + 0.002));
    const dirR = new THREE.Vector3(0.8, 0.5, 0.35).normalize(), dirN = new THREE.Vector3(-0.8, 0.5, 0.35).normalize();
    if (!roja.position.equals(tip)) M.medir.tubo = 0;
    roja.position.lerp(tip, Math.min(1, dt * 30)); roja.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirR);
    const n = M.medir.negra;
    if (n) { negra.position.copy(n.pos).add(new THREE.Vector3(0, 0.0004, 0)); negra.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirN); }
    else reposo("negra");
    const l = lectura(n, hv, dt);
    M.medir.txt = l.txt; M.medir.pita = l.pita;
    M.mm.pantalla({ txt: l.txt, modo: M.medir.modo, pita: l.pita });
    pitido(l.pita);
    H.halo.material.color.set(0xff5040);
  }
  /** Los cables de las puntas: del borne del multímetro, caen al tapete y llegan al final del mango. */
  function cablesPuntas(dt) {
    if (!M.mm || !M.cablesMM) return;
    M.medir.tubo -= dt;
    if (M.medir.tubo > 0) return;
    M.medir.tubo = 1 / 20;                              // como mucho 20 veces por segundo (cuando algo se movió: siempre que no esté quieto)
    const g = M.mm.g, nrm = new THREE.Vector3(0, Math.cos(MM_TILT), Math.sin(MM_TILT));
    [[M.mm.bornes.v, M.mm.puntas.roja], [M.mm.bornes.com, M.mm.puntas.negra]].forEach(([b, pz], i) => {
      const J = g.localToWorld(b.clone()), dir = new THREE.Vector3(0, 1, 0).applyQuaternion(pz.quaternion), E = pz.position.clone().addScaledVector(dir, 0.124 * MM_K);
      const piso = new THREE.Vector3((J.x + E.x) / 2 + (i ? -0.006 : 0.006), 0.0012, Math.max(J.z, E.z) + (M.multi ? 0.012 : 0.004));
      const suelta = pz === M.mm.puntas.roja ? !M.multi : !(M.multi && M.medir.negra);
      const pts = suelta   // en reposo: el cable baja del borne y se va a la izquierda, sin pasar por la placa
        ? [J, J.clone().addScaledVector(nrm, 0.005), new THREE.Vector3(J.x - 0.012, 0.0015, J.z - 0.002), new THREE.Vector3(E.x + 0.006, 0.0015, E.z + 0.004), E.clone().addScaledVector(dir, 0.004), E]
        : [J, J.clone().addScaledVector(nrm, 0.008), J.clone().addScaledVector(nrm, 0.006).setY(Math.max(0.003, J.y * 0.3)).add(new THREE.Vector3(0, 0, 0.008)), piso,
          E.clone().addScaledVector(dir, 0.02).setY(Math.max(0.0015, E.y + 0.006)), E.clone().addScaledVector(dir, 0.005), E];
      const m = M.cablesMM[i];
      m.geometry.dispose();
      m.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.001, 6);
    });
  }
  function limpiarPunta() {
    if (M.modo !== "soldar") return;
    TA.limpiarPunta(M.E); sfx("rasgar");
    aviso(M.E.on ? t("🧽 Punta limpia: transmite mejor el calor.") : t("🧽 Punta limpia (se limpia mejor caliente)."), true);
    hud();
  }
  $("ms-on").onclick = () => {
    if (!M.cautin) return aviso(t("No tienes con qué soldar: compra un cautín en la tienda (Soldadura)."));
    M.E.on = !M.E.on; sfx("click"); hud();
  };
  $("ms-menos").onclick = () => { if (!M.E.ajustable) return aviso(t("Tu cautín de lápiz no tiene perilla: siempre a {n} °C.", { n: M.E.set })); M.E.set = Math.max(250, M.E.set - 10); hud(); };
  $("ms-mas").onclick = () => { if (!M.E.ajustable) return aviso(t("Tu cautín de lápiz no tiene perilla: siempre a {n} °C.", { n: M.E.set })); M.E.set = Math.min(450, M.E.set + 10); hud(); };
  $("ms-multi").onclick = multimetro;

  // ---------------- el bucle ----------------
  function tween(dur, fn, fin, bloquea = true) { M.tweens.push({ t: 0, dur, fn, fin, bloquea }); }
  function bucle(now) {
    if (!M.abierta) return;
    raf = requestAnimationFrame(bucle);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now; M.t += dt;
    for (const tw of [...M.tweens]) { tw.t += dt; const k = Math.min(1, tw.t / tw.dur); tw.fn(k); if (k >= 1) { M.tweens.splice(M.tweens.indexOf(tw), 1); tw.fin?.(); } }
    if (M.modo === "armar") pasoArmar(dt); else pasoSoldar(dt);
    senalar();
    for (const s of [...M.humo]) { s.userData.v += dt; s.position.y += dt * 0.012; s.scale.multiplyScalar(1 + dt * 1.2); s.material.opacity = 0.35 * (1 - s.userData.v / 1.6); if (s.userData.v > 1.6) { scene.remove(s); M.humo.splice(M.humo.indexOf(s), 1); } }
    controls.update();
    renderer.render(scene, cam);
  }
  // ---------------- el tutorial: señalar dónde va cada cable ----------------
  /** El otro extremo del cable que sale de ref, según el manual (la guía de conexión). */
  const destinoDe = (ref) => { const par = M.comps && manual(M.comps).find((c) => c.includes(ref)); return par ? (par[0] === ref ? par[1] : par[0]) : null; };
  const pinDeRef = (ref) => { const [k, id] = ref.split("."), c = M.comps?.find((x) => x.k === k); return c && { c, pin: c.pines.find((p) => p.id === id) }; };
  const nomRef = (ref) => { const x = pinDeRef(ref); return x?.pin ? `${nombreCorto(x.c)} · ${x.pin.nombre}` : ref; };
  /** Lo que el tutorial señala ahora: el pad donde va el cable en la mano, o una junta que falta soldar. */
  function objetivo() {
    if (M.modo !== "soldar" || !M.comps || !M.pads) return null;
    if (M.enMano) { const a = destinoDe(M.enMano); return a && { ref: a, tipo: "poner" }; }
    const J = D().banco.juntas || {};
    for (const f of fuentes()) if (f.cable && !TA.esEnchufe(f.pin) && (J[TA.claveCable(f.cable)]?.q || "sin") === "sin") return { ref: TA.placaDe(f.cable, M.comps), tipo: "soldar" };
    return null;
  }
  function senalar() {
    if (!M.senal) {
      M.senal = new THREE.Mesh(new THREE.TorusGeometry(0.0042, 0.00055, 8, 40), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, depthTest: false }));
      M.senal.rotation.x = Math.PI / 2; M.senal.renderOrder = 10; scene.add(M.senal);
    }
    if (!M.senalT) {
      M.senalT = new THREE.Mesh(new THREE.RingGeometry(0.0062, 0.0072, 40), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, depthTest: false, side: THREE.DoubleSide }));
      M.senalT.rotation.x = -Math.PI / 2; M.senalT.renderOrder = 10; scene.add(M.senalT);
    }
    const tk = ctx.tutorial?.() && M.modo === "soldar" ? toolPedida() : null, T = tk && M.tools?.[tk];
    M.senalT.visible = !!T;
    if (T) { M.senalT.position.copy(T.home).add(new THREE.Vector3(0.0125, 0.001, 0)); M.senalT.scale.setScalar(1.6 + 0.2 * Math.sin(M.t * 6)); M.senalT.material.opacity = 0.6 + 0.35 * Math.sin(M.t * 6); }
    const o = ctx.tutorial?.() ? objetivo() : null, pd = o && (M.pads.get(`${o.ref}#1`) || M.pads.get(`${o.ref}#0`));
    M.senal.visible = !!pd;
    if (!pd) return;
    M.senal.position.copy(pd.pos).add(new THREE.Vector3(0, 0.0012, 0));
    const k = 1 + 0.25 * Math.sin(M.t * 6);
    M.senal.scale.set(k, k, k);
    M.senal.material.opacity = 0.6 + 0.35 * Math.sin(M.t * 6);
  }
  /** ¿Ese pad ya tiene flux (la gota de la jeringa o una junta empezada con flux)? */
  const conFlux = (ref) => [...(M.fluxPads?.keys() || [])].some((k) => k.startsWith(ref + "#")) || [...M.juntas].some(([k, J]) => k.startsWith(ref + "#") && J.flux);
  /** Lo que el tutorial pide tomar de la bandeja ahora (para que brille). */
  function toolPedida() {
    const o = objetivo();
    if (o?.tipo !== "soldar" || !M.E.on || M.E.temp < 280) return null;
    if (!conFlux(o.ref)) return M.mano2 === "flux" ? null : "flux";
    return M.mano2 === "estano" ? null : "estano";
  }
  /** Para las notas del tutorial (main.js): en qué va la mesa. */
  function estadoTuto() {
    if (!M.abierta) return null;
    const o = { modo: M.modo, placa: M.placa, cautin: !!M.cautin, on: M.E.on, temp: Math.round(M.E.temp), mano2: M.mano2 || null };
    if (M.modo === "armar") {
      o.proc = M.proc ? { pieza: NOMBRE()[M.proc.it.slot], paso: M.proc.pasos[M.proc.i]?.[0] || null } : null;
      o.items = {};
      for (const it of M.items || []) o.items[it.estado] = (o.items[it.estado] || 0) + 1;
      return o;
    }
    if (!M.comps) return o;
    const fs = fuentes(), J = D().banco.juntas || {};
    if (M.enMano) {
      const a = destinoDe(M.enMano), placaA = a && ["esc", "fc"].includes(a.split(".")[0]) ? a.split(".")[0] : null;
      o.mano = { de: nomRef(M.enMano), a: a ? nomRef(a) : null, otraPlaca: placaA && placaA !== M.placa ? placaA : null };
    }
    const sinSoldar = fs.find((f) => f.cable && !TA.esEnchufe(f.pin) && (J[TA.claveCable(f.cable)]?.q || "sin") === "sin");
    if (sinSoldar) { const r = TA.placaDe(sinSoldar.cable, M.comps); o.soldar = nomRef(r); o.fluxOk = conFlux(r); }
    const sig = fs.find((f) => !f.cable);
    if (sig) o.siguiente = nomRef(sig.ref);
    o.faltan = fs.filter((f) => !f.cable).length;
    o.otras = placas().filter((c) => c.k !== M.placa).map((c) => c.k);
    return o;
  }

  function pasoArmar(dt) {
    const h = M.hold, P_ = M.proc;
    if (P_?.pts) for (const q of P_.pts) if (!q.listo && q.T.estado !== "apretado") q.anillo.material.opacity = 0.45 + 0.4 * Math.sin(M.t * 6);
    if (!h) { if (!M.arrastre) anillo(null); return; }
    if (h.tipo === "cortar") {
      const C = h.it.caja;
      h.p = Math.min(1, h.p + dt / 1.3);
      H.cuter.position.copy(C.g.position).add(new THREE.Vector3(-C.w / 2 + C.w * h.p, C.h + 0.003, 0));
      C.cinta.scale.x = 1 - h.p * 0.98; C.cinta.position.x = (C.w * h.p) / 2;
      h.ruido += dt; if (h.ruido > 0.22) { h.ruido = 0; sfx("rasgar"); }
      anillo(h.p, t("Cortando la cinta…"));
      if (h.p >= 1) { M.hold = null; H.cuter.visible = false; anillo(null); abrirCaja(h.it); }
    } else if (h.tipo === "tornillo" && P_?.pts) {
      const q = P_.pts[h.i], ev = TA.tickTornillo(q.T, dt, true, q.dur);
      // el herraje baja girando sobre su eje (la cabeza mira hacia q.n: arriba, abajo o de lado)
      q.tornillo.position.copy(q.v).addScaledVector(q.n, 0.005 * (1 - q.T.p));
      h.giro += dt * (q.T.estado === "apretado" ? 4 : 22);
      q.tornillo.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), q.n); q.tornillo.rotateY(h.giro);
      // el destornillador, apoyado en la cabeza y alineado con ella
      const body = M.dron.userData.body; M.dron.updateMatrixWorld(true);
      const alto = q.pieza === "separador" ? 0.028 : q.pieza === "tuerca" ? 0.0022 : 0.0007;
      const cabeza = body.localToWorld(q.tornillo.position.clone().addScaledVector(q.n, alto)), nw = q.n.clone().transformDirection(body.matrixWorld);
      H.destornillador.visible = true; H.destornillador.position.copy(cabeza);
      H.destornillador.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), nw); H.destornillador.rotateY(h.giro);
      h.ruido += dt; if (h.ruido > 0.16 && q.T.estado === "girando") { h.ruido = 0; sfx("trinquete"); }
      const txt = { separador: t("Enroscando el separador…"), tuerca: t("Apretando la tuerca…") }[q.pieza] || t("Atornillando…");
      anillo(q.T.estado === "apretado" ? 1 : q.T.p, q.T.estado === "apretado" ? t("¡Clic! Suelta ya") : txt, q.T.estado === "apretado");
      if (ev === "clic") { sfx("click"); q.anillo.material = MAT.anilloOk; }
      if (ev === "barrido") { sfx("error"); aviso(t("¡Te pasaste! La rosca se barrió. Suelta apenas suene el clic.")); q.anillo.material = MAT.anillo.clone(); }
    } else if (h.tipo === "mantener" && P_) {
      const det = P_.pasos[P_.i][1];
      h.p = Math.min(1, h.p + dt / (det === "correa_apretar" ? 1.2 : 0.8));
      anillo(h.p, { cinta_pelar: t("Pelando la cinta…"), cinta_presionar: t("Presionando…"), correa_apretar: t("Apretando la correa…") }[det] || "…");
      if (h.p >= 1) { M.hold = null; anillo(null); sfx("click"); siguientePaso(); }
    } else if (h.tipo === "desmontar") {
      h.p = Math.min(1, h.p + dt / 0.9);
      anillo(h.p, t("Desmontando…"));
      if (h.p >= 1) { M.hold = null; anillo(null); desmontar(h.it); }
    }
  }
  function pasoSoldar(dt) {
    const h = M.hold;
    // la estación: calienta, se enfría, le roba calor el pad que tocas
    TA.tickEstacion(M.E, dt, h?.tipo === "soldar" ? TA.PADS[h.info.pad].masa : 0);
    // las juntas que dejaste se enfrían solas
    for (const [k, J] of M.juntas) if (h?.key !== k) { TA.tickJunta(J, M.E, dt, false, false); }
    // el cautín: sigue al ratón; apoyado si estás soldando
    const tocando = h?.tipo === "soldar";
    const objetivo = M.mano2 === "flux" && !tocando ? M.descanso.clone()
      : tocando ? h.info.pos.clone().add(new THREE.Vector3(0.0006, 0.0006, 0.0006)) : M.tPunta.clone().add(new THREE.Vector3(0, 0.004, 0));
    H.cautin.position.lerp(objetivo, Math.min(1, dt * 18));
    const calor = Math.max(0, Math.min(1, (M.E.temp - 150) / 300));
    H.punta.material.emissive.setRGB(calor * 0.9, calor * 0.25, 0);
    // el alambre de estaño: desde la mano izquierda (abajo a la derecha) hasta casi la punta; con Espacio, toca la junta
    const fin = H.cautin.position.clone().add(new THREE.Vector3(M.espacio ? -0.0011 : -0.005, M.espacio ? 0.0005 : 0.003, M.espacio ? -0.0006 : -0.004));
    entre(H.estano, fin.clone().add(new THREE.Vector3(-0.05, 0.035, -0.04)), fin);           // el estaño entra por la izquierda
    H.estano.visible = M.mano2 === "estano";
    moverTools(dt, tocando, h);
    H.cautin.visible = !M.multi;
    if (M.multi && M.mm) pasoMedir(dt);
    if (M.mm?.g.visible) cablesPuntas(dt);
    // el halo del pad que apuntas
    const hv = M.hover?.tipo === "pad" ? M.hover.info : null;
    H.halo.visible = !!hv && !tocando;
    if (hv) { H.halo.position.copy(hv.pos).add(new THREE.Vector3(0, 0.0012, 0)); H.halo.material.color.set(M.enMano ? 0x47f08a : hv.enchufe ? 0xd4af37 : 0x3ccbff); const s = hv.pad === "grande" ? 2.6 : hv.pad === "medio" ? 1.2 : 1; H.halo.scale.setScalar(s); }
    // el cable en la mano
    if (M.enMano) {
      if (!M.cableMano) { M.cableMano = new THREE.Mesh(new THREE.CylinderGeometry(grosor(M.enMano), grosor(M.enMano), 1, 8), new THREE.MeshStandardMaterial({ color: COLOR_PIN[pinDe(M.enMano)?.tipo] || "#ccc" })); scene.add(M.cableMano); }
      const dm = direccion(M.enMano, M.tPunta);
      entre(M.cableMano, M.tPunta.clone().addScaledVector(dm, 0.07).setY(0.001), M.tPunta.clone().add(new THREE.Vector3(0, 0.003, 0)));
      M.cableMano.visible = true;
    } else if (M.cableMano) { scene.remove(M.cableMano); M.cableMano = null; }
    if (!h) { anillo(null); hudTemp(); return; }
    if (h.tipo === "enchufar") {
      h.p = Math.min(1, h.p + dt / 0.45);
      anillo(h.p, t("Empujando el conector…"));
      if (h.p >= 1) { const B = D().banco; B.juntas[TA.claveCable(h.c)] = { q: "enchufado", n: 1, s: [{ q: "enchufado" }] }; guardar(); sfx("click"); aviso("✓ " + t("¡Clic! Conector enchufado."), true); M.hold = null; anillo(null); dibujarCables(); }
      return;
    }
    if (h.tipo === "soldar") {
      const malla = M.mano2 === "malla", conMalla = malla && PT.insumo(P(), "malla") > 0;
      const e0 = h.J.estano;
      if (malla && !conMalla && M.t - M.avisoT > 2.5) { M.avisoT = M.t; aviso(t("Se acabó: 🛒 Tienda → Soldadura.")); }
      const ev = TA.tickJunta(h.J, M.E, dt, true, M.espacio && M.mano2 === "estano" && !!h.c, conMalla);
      const mas = h.J.estano - e0;
      if (mas > 0 && !PT.gastar(P(), "estano", mas * TA.GRAMOS)) {
        h.J.estano = e0;
        if (M.t - M.avisoT > 2.5) { M.avisoT = M.t; aviso(t("Se te acabó el estaño: compra más en la tienda (Soldadura).")); }
      }
      if (ev === "absorbe") { PT.gastar(P(), "malla", dt * 0.03); h.ruido = (h.ruido || 0) + dt; if (h.ruido > 0.25) { h.ruido = 0; sfx("chispa"); } }
      if (ev === "derrite") { h.ruido = (h.ruido || 0) + dt; if (h.ruido > 0.2) { h.ruido = 0; sfx("chispa"); } }
      if (ev === "no_derrite" && M.t - M.avisoT > 2.5) { M.avisoT = M.t; aviso(M.E.temp < 200 ? t("El estaño no se derrite: el cautín está frío.") : t("Todavía no: calienta el pad un poco más antes de meter estaño.")); }
      if (ev === "humo" && Math.random() < dt * 10) humo(h.info.pos);
      // la gota mientras está líquida
      if (h.gota) { M.placaG.remove(h.gota); h.gota = null; }
      if (h.J.estano > 0.05) { h.gota = gotaMesh(h.J.estano, h.J.temp > TA.FUSION ? "liquido" : "ok", h.info); M.placaG.add(h.gota); }
      // el pad se pone naranja con el calor
      const ph = Math.max(0, Math.min(1, (h.J.temp - 120) / 250));
      if (h.info.mesh.material.emissive) h.info.mesh.material.emissive.setRGB(ph * 0.5, ph * 0.18, 0);
      medidor(h.J, h.info);
    }
    hudTemp();
  }
  function humo(pos) {
    const s = new THREE.Sprite(MAT.humo.clone());
    s.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.002, 0.002, (Math.random() - 0.5) * 0.002));
    s.scale.setScalar(0.003); s.userData.v = 0; s.material.rotation = Math.random() * Math.PI * 2;
    scene.add(s); M.humo.push(s);
  }

  // ---------------- el HUD (poquito texto) ----------------
  /** El anillo de progreso junto al ratón. */
  function anillo(p, txt = "", ok = false) {
    const el = $("mesa-anillo");
    if (p == null) { el.hidden = true; return; }
    el.hidden = false;
    el.style.left = (M.cx || 0) + "px"; el.style.top = (M.cy || 0) + "px";
    el.style.setProperty("--p", Math.round(p * 100));
    el.classList.toggle("ok", ok);
    el.querySelector("span").textContent = txt;
  }
  /** Mientras sueldas: la temperatura del pad y cuánto estaño lleva (con la zona buena marcada). */
  function medidor(J, info) {
    const el = $("mesa-anillo"), pd = TA.PADS[info.pad];
    el.hidden = false; el.style.left = (M.cx || 0) + "px"; el.style.top = (M.cy || 0) + "px";
    el.style.setProperty("--p", Math.round(Math.min(1, J.estano / pd.puente) * 100));
    el.classList.toggle("ok", J.estano >= pd.ideal[0] && J.estano <= pd.ideal[1]);
    el.querySelector("span").textContent = `${Math.round(J.temp)} °C · ${t("estaño")} ${Math.round((J.estano / pd.ideal[1]) * 100)} %`;
  }
  /** El nombre de la herramienta de la bandeja que apuntas (y cuánto te queda). */
  function etiqueta(k) {
    const el = $("mesa-etq");
    if (!k) { el.hidden = true; return; }
    const p = P(), q = { estano: `${num(PT.insumo(p, "estano"), 1)} g`, flux: `${num(PT.insumo(p, "flux"), 1)} ml`, malla: `${num(PT.insumo(p, "malla"), 2)} m` }[k];
    const [ic, nom] = TOOLS()[k];
    el.textContent = `${ic} ${nom}${q ? " · " + q : ""}${M.mano2 === k ? " · " + t("(en la mano)") : ""}`;
    el.style.left = (M.cx || 0) + 14 + "px"; el.style.top = (M.cy || 0) - 10 + "px";
    el.hidden = false;
  }
  function aviso(txt, ok = false) {
    const el = $("mesa-aviso");
    el.textContent = txt; el.className = ok ? "ok" : "";
    el.hidden = false;
    clearTimeout(aviso.t); aviso.t = setTimeout(() => { el.hidden = true; }, 3800);
  }
  function hudTemp() {
    const E = M.E, el = $("ms-temp");
    el.textContent = `${Math.round(E.temp)} °C`;
    el.className = E.temp < 200 ? "frio" : E.temp > 410 ? "caliente" : E.temp >= E.set - 15 ? "listo" : "";
    $("ms-punta").style.width = Math.round(E.limpia * 100) + "%";
  }
  function hud() {
    const lista = $("mesa-lista"), pista = $("mesa-pista"), que = M.abierta ? autoAhora() : null;
    $("mesa-auto").hidden = !que;
    if (que) $("mesa-auto").textContent = { atornillar: t("🤖 Atornillar"), conectar: t("🤖 Conectar cables"), soldar: t("🤖 Soldar todo") }[que];
    if (M.modo === "soldar" && !M.comps) { lista.innerHTML = ""; return; }
    lista.innerHTML = "";
    if (M.modo === "armar" && M.proc) {                 // el procedimiento de la pieza que estás montando
      const P_ = M.proc;
      lista.insertAdjacentHTML("beforeend", `<li class="proc"><b>🔧 ${esc(NOMBRE()[P_.it.slot])}</b><small>Esc ✕</small></li>`);
      P_.pasos.forEach((ps, i) => {
        const li = document.createElement("li");
        li.className = i < P_.i ? "montada" : i === P_.i ? "ahora" : "";
        li.innerHTML = `<span>${i < P_.i ? "✅" : i === P_.i ? "▶" : "○"}</span><b>${esc(textoPaso(ps, P_.it))}</b>`;
        lista.appendChild(li);
      });
      const [tp] = P_.pasos[P_.i] || [];
      pista.textContent = { colocar: t("Arrastra la pieza hasta el fantasma verde · R gira"), colocar_cada: t("Arrastra cada motor hasta su brazo"), voltear: t("Toca el dron para darle la vuelta"),
        tornillos: t("Toca el anillo y mantén apretado hasta el clic"), clics: t("Toca cada anillo"), mantener: t("Mantén apretado sobre la pieza") }[tp] || "";
    } else if (M.modo === "armar") {
      const ic = { montada: "✅", suelta: "🔩", caja: "📦", camino: "🚚" };
      for (const it of M.items || []) {
        const li = document.createElement("li");
        li.className = it.estado;
        const u = it.us[0];
        li.innerHTML = `<span>${ic[it.estado]}</span><b>${esc(NOMBRE()[it.slot])}</b>${it.estado === "camino" ? `<small>${t("día {n}", { n: u?.llega ?? "?" })}</small>` : ""}`;
        lista.appendChild(li);
      }
      const falta = (M.items || []).filter((x) => x.estado !== "montada");
      pista.textContent = !falta.length ? t("✓ Todo montado. Sigue con 🔥 Soldar.") : falta.some((x) => x.estado === "caja") ? t("Mantén apretado sobre una caja para cortar la cinta")
        : falta.some((x) => x.estado === "suelta") ? t("Toca una pieza para montarla · mantén sobre una montada para desmontarla") : t("Lo que falta viene en camino 🚚");
    } else {
      const B = D().banco, J = B.juntas || {};
      for (const f of fuentes()) {
        const li = document.createElement("li"), j = f.cable ? J[TA.claveCable(f.cable)] : null;
        const q = !f.cable ? "" : j ? j.q : "buena", icq = { "": "", sin: "○", buena: "🔘", enchufado: "🔌", fria: "🔘", puente: "🔘", levantado: "🔘" }[q];   // la lista no dice si salió bien
        li.className = "cab" + (M.enMano === f.ref ? " mano" : "") + (f.cable ? " puesto" : "") + (ctx.tutorial?.() && !M.enMano && !f.cable && !lista.querySelector(".sig") ? " sig" : "");
        li.innerHTML = `<i style="background:${COLOR_PIN[f.pin.tipo] || "#ccc"}"></i><b>${esc(nombreCorto(f.comp))} · ${esc(f.pin.nombre)}</b><small>${icq}</small>`;
        li.title = f.cable ? t("Toca para quitarlo") : t("Toca para tomarlo");
        li.onclick = () => tomarCable(f);
        lista.appendChild(li);
      }
      const E = M.E;
      pista.textContent = M.multi ? t("📟 Clic en un pad = punta negra · clic en el multímetro = modo · T lo deja") : M.enMano ? t("Llévalo a su pad · Esc lo suelta") : !M.cautin ? t("Necesitas un cautín") : !E.on ? t("⏻ Prende la estación") : E.temp < 280 ? t("Calentando…")
        : ({ flux: t("💧 Toca un pad"), estano: t("🔥 Clic en el pad + Espacio"), bomba: t("🔥 Clic en la junta + Espacio = chupa"), malla: t("🔥 Clic en la junta: la malla chupa") }[M.mano2] || t("Toma algo de la bandeja →"));
      $("ms-on").setAttribute("aria-pressed", String(E.on));
      $("ms-on").classList.toggle("vacio", !M.cautin);
      $("ms-on").title = M.cautin ? M.cautin.nombre : t("No tienes con qué soldar: compra un cautín en la tienda (Soldadura).");
      const p = P(), q = (k, u, d = 1) => `${num(PT.insumo(p, k), d)} ${u}`;
      $("ms-multi").disabled = !PT.tieneHerramienta(p, "multimetro");
      $("ms-multi").setAttribute("aria-pressed", String(!!M.multi));
      $("ms-menos").disabled = $("ms-mas").disabled = !E.ajustable;
      lista.insertAdjacentHTML("afterbegin", `<li class="stock"><small>🧷 ${t("cable")}: ${q("cable", "m")}</small></li>`);
      $("ms-set").textContent = `${E.set} °C`;
      hudTemp();
    }
  }

  return { abrir, cerrar, estadoTuto, get abierta() { return M.abierta; }, _prueba: { M, cam: () => cam, mundo: () => mundo, empezar: (it) => empezar(it), objetivo: () => objetivo(), fuentes: () => fuentes(), conFlux: (r) => conFlux(r), placas: () => placas() } };   // _prueba: para las pruebas en el navegador
}
