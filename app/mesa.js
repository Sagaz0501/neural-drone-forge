// =====================================================================
// LA MESA DE TRABAJO (la pantalla en 3D del banco de armado). La lógica del oficio está en taller.js y la del
// cableado en banco.js; aquí se hace con las manos:
//
//   🔧 Armar:  las piezas llegan en CAJA: mantén apretado sobre la cinta para cortarla y la caja se abre. Toca una
//              pieza suelta y vuela a su lugar en el chasis; después cada tornillo: tócalo y MANTÉN apretado hasta el
//              "clic" (si sigues, la rosca se barre). La batería lleva correa; la radio, cinta doble faz.
//   🔥 Soldar: la placa grande. Prende la estación y espera que caliente; toma un cable de la izquierda y ponlo en su
//              pad (la 📄 guía de conexión va aparte); flux (F); el CAUTÍN es el ratón (mantén apretado sobre el pad
//              para calentarlo) y el ESTAÑO es la barra espaciadora: las dos herramientas a la vez. Limpia la punta (C).
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
import { CHIP } from "./banco.js";
import { t, num } from "./i18n.js";

const COLOR_PIN = { "vbat+": "#e02020", "5v+": "#ff8a1a", "3v3+": "#ffd23f", vbat_in: "#e02020", "5v_in": "#ff8a1a", "3v3_in": "#ffd23f", gnd: "#1d1f22",
  tx: "#3ccbff", rx: "#3c8bff", sda: "#c07bff", scl: "#9a5bff", led_out: "#47f08a", led_in: "#47f08a", m_out: "#2ad8b0", m_in: "#2ad8b0",
  esc_conn: "#eaf2ef", fc_conn: "#eaf2ef", ufl: "#d4af37", ant: "#d4af37" };
/** Las piezas del armado, en orden: [ranura del dron, ranura 3D de dron3d.js, cómo se fija]. */
const ORDEN = [["chasis", "chasis", "colocar"], ["motores", "motores", "tornillos"], ["esc", "esc", "tornillos"], ["controladora", "controladora", "tornillos"],
  ["radio", "radio", "cinta"], ["montaje", "camara", "tornillos"], ["camara", "camara", "tornillos"], ["bateria", "bateria", "correa"], ["extras", "extras", "colocar"]];
const NOMBRE = () => ({ chasis: t("Chasis"), motores: t("Motores"), esc: t("ESC 4 en 1"), controladora: t("Controladora"), radio: t("Radio"),
  montaje: t("Montaje de la cámara"), camara: t("Cámara"), bateria: t("Batería"), extras: t("Extras") });
/** Dónde van los pads de la ESP32 DevKitC (el GLB de blender/piezas) para cada pin de banco.js. */
const PAD_ESP32 = { "5v": "pad_5V", "3v3": "pad_3V3", gnd1: "pad_GND_1", gnd2: "pad_GND_2", tx2: "pad_GPIO17", rx2: "pad_GPIO16", sda: "pad_GPIO21", scl: "pad_GPIO22", led: "pad_GPIO4" };
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
  humo: new THREE.SpriteMaterial({ color: 0xdedede, transparent: true, opacity: 0.35, depthWrite: false }),
};
const lerp = (a, b, k) => a + (b - a) * k;
const suave = (k) => k * k * (3 - 2 * k);

export function initMesa(ctx) {
  const { cat, PT, $, esc, toast, guardar } = ctx;
  const M = { abierta: false, modo: "armar", placa: null, t: 0, hold: null, tweens: [], pick: [], humo: [], espacio: false, flux: false,
    E: TA.estacion0(), juntas: new Map(), enMano: null, avisoT: 0, hover: null, mouse: new THREE.Vector2(), tPunta: new THREE.Vector3(), tocando: false };
  const P = () => ctx.P(), D = () => ctx.D(), U = (uid) => PT.unidad(P(), uid);
  const ray = new THREE.Raycaster();
  let renderer, scene, cam, controls, mundo, raf = 0, last = 0;
  const glb = { esp32: null, cargando: null };

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
      g.fillStyle = "#1f5a3c"; g.fillRect(0, 0, w, h);
      g.strokeStyle = "rgba(220,240,225,.18)"; g.lineWidth = 1;
      for (let x = 0; x < w; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
      for (let y = 0; y < h; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      g.strokeStyle = "rgba(240,250,245,.35)"; g.lineWidth = 2;
      for (let x = 0; x < w; x += 160) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
      g.fillStyle = "rgba(240,250,245,.4)"; g.font = "bold 22px sans-serif"; g.fillText("DRON MAKER · 1 cm", 24, h - 22);
    });
    const mat = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.003, 0.6), new THREE.MeshStandardMaterial({ map: plancha, roughness: 0.9 }));
    mat.position.y = -0.0015; mat.receiveShadow = true;
    scene.add(mesa, mat);
    scene.add(new THREE.HemisphereLight(0xdfe8f0, 0x3a2e24, 0.9));
    const sol = new THREE.DirectionalLight(0xfff1dc, 2.2);
    sol.position.set(0.3, 0.9, 0.45); sol.castShadow = true;
    sol.shadow.mapSize.set(2048, 2048);
    Object.assign(sol.shadow.camera, { left: -0.5, right: 0.5, top: 0.5, bottom: -0.5, near: 0.1, far: 3 });
    sol.shadow.bias = -0.0004;
    scene.add(sol);
    const relleno = new THREE.DirectionalLight(0x9fc3ff, 0.6); relleno.position.set(-0.6, 0.5, -0.3); scene.add(relleno);
    // reflejos para los metales (estaño, tornillos, el oro de los pads): un cuarto de luz hecho aquí
    const envS = new THREE.Scene(); envS.background = new THREE.Color(0x3a3e42);
    const panel = (c, k, pos, w, h) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), side: THREE.DoubleSide })); m.position.set(...pos); m.lookAt(0, 0, 0); envS.add(m); };
    panel(0xffffff, 5, [0, 6, 0], 7, 7); panel(0xffe2c0, 3, [6, 2, 4], 4, 3); panel(0xc8dcff, 2.2, [-6, 3, -3], 4, 3); panel(0x6a5a48, 1, [0, -5, 0], 9, 9);
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(envS, 0.04).texture;
    scene.environmentIntensity = 0.55;
    mundo = new THREE.Group(); scene.add(mundo);
    herramientas();
    new ResizeObserver(tam).observe(cv);
    tam();
    cv.addEventListener("pointerdown", abajo);
    cv.addEventListener("pointermove", mover);
    addEventListener("pointerup", arriba);
    cv.addEventListener("contextmenu", (e) => e.preventDefault());
    addEventListener("keydown", tecla);
    addEventListener("keyup", (e) => { if (e.code === "Space") M.espacio = false; if (e.key === "m" || e.key === "M") M.malla = false; });
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
    M.abierta = true; M.modo = modo; M.enMano = null; M.hold = null; M.flux = false; M.vista = null;
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
    M.abierta = false;
    cancelAnimationFrame(raf);
    guardar();
    ctx.alCerrarMesa?.();
  }
  $("mesa-salir").onclick = cerrar;
  $("mesa-guia").onclick = () => ctx.abrirGuia?.();
  document.querySelectorAll("#mesa-modos button").forEach((b) => (b.onclick = async () => { if (M.hold) return; M.modo = b.dataset.m; M.enMano = null; if (M.modo === "soldar") await cargarESP32(); construir(); }));

  async function cargarESP32() {
    if (glb.esp32 || glb.cargando === false) return;
    try { glb.cargando = new GLTFLoader().loadAsync("modelos/esp32_devkitc.glb"); glb.esp32 = (await glb.cargando).scene; }
    catch { glb.cargando = false; }
  }

  // ---------------- construir lo que se ve ----------------
  function limpiar() {
    while (mundo.children.length) mundo.remove(mundo.children[0]);
    M.pick = []; M.tornillos = null; M.tweens = []; M.humo.forEach((s) => scene.remove(s)); M.humo = [];
    if (M.cableMano) { scene.remove(M.cableMano); M.cableMano = null; }
    M.comps = null;
    for (const k of ["destornillador", "cuter", "cautin", "estano", "halo"]) H[k].visible = false;
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
  /** Las piezas del dron y en qué va cada una: montada, suelta, en su caja o en camino. */
  function items() {
    const d = D(), B = d.banco, p = P(), out = [];
    for (const [slot, s3, como] of ORDEN) {
      if (slot === "extras") {
        if (!d.extras.length) continue;
        const ok = d.extras.length === (B.instalado.extras || []).length && d.extras.every((x) => B.instalado.extras.includes(x));
        const us = d.extras.map(U);
        out.push({ slot, s3, como, uid: null, us, estado: ok ? "montada" : us.some((u) => TA.enCamino(p, u)) ? "camino" : us.some((u) => TA.enCaja(p, u)) ? "caja" : "suelta" });
        continue;
      }
      const uid = d.slots[slot];
      if (!uid) continue;
      const u = U(uid);
      out.push({ slot, s3, como, uid, us: [u], estado: B.instalado[slot] === uid ? "montada" : TA.enCamino(p, u) ? "camino" : TA.enCaja(p, u) ? "caja" : "suelta" });
    }
    return out;
  }
  const PUESTOS = [[-0.3, -0.16], [-0.3, -0.04], [-0.3, 0.08], [-0.3, 0.2], [0.3, -0.16], [0.3, -0.04], [0.3, 0.08], [0.3, 0.2], [-0.15, 0.24], [0.15, 0.24]];
  function armar() {
    const d = D(), its = items();
    const build = { ...ctx.dronVista(d), sinHelices: true, cables: false, fantasma: [] };
    const dron = buildDrone(build, cat);
    dron.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    mundo.add(dron);
    M.dron = dron;
    const S = dron.userData.slots;
    if (CHIP[build.controladora] === "esp32" && glb.esp32 && S.controladora) {        // la ESP32 de verdad (Blender)
      const e = glb.esp32.clone(true); e.scale.setScalar(0.7); e.position.y = 0.029;
      S.controladora.clear(); S.controladora.add(e);
    }
    let k = 0;
    const chasisPuesto = its.find((x) => x.slot === "chasis")?.estado === "montada";
    for (const it of its) {
      const g = S[it.s3];
      if (!g && it.slot !== "montaje" && it.estado !== "camino" && it.estado !== "montada") {   // sin pieza que ver (la radio del ESP32 va en la placa)
        for (const u of it.us) if (u) delete u.caja;
        if (it.slot === "extras") d.banco.instalado.extras = [...d.extras]; else d.banco.instalado[it.slot] = it.uid;
        it.estado = "montada"; guardar();
      }
      if (it.estado === "montada") {
        if (it.como === "tornillos" && g) for (const v of puntosDe(it)) { const tm = tornilloMesh(); tm.position.copy(v).add(new THREE.Vector3(0, 0.0007, 0)); tm.rotation.y = v.x * 300; mundo.add(tm); }
        continue;
      }
      if (it.slot === "montaje") {                     // el soporte de la cámara: una piecita negra
        const sop = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.004, 0.026), MAT.goma); sop.castShadow = true;
        it.obj = sop;
      }
      if (g && it.slot !== "montaje") {
        // la pieza se saca del dron y se pone en su puesto (más chica, centrada)
        const piv = new THREE.Group(), bb = new THREE.Box3().setFromObject(g), c = bb.getCenter(new THREE.Vector3());
        g.parent.remove(g); piv.add(g); g.position.sub(c.clone().setY(bb.min.y));
        it.obj = piv; it.centro = c.clone().setY(bb.min.y);
      }
      if (!it.obj) continue;
      const [x, z] = it.slot === "chasis" ? [0, 0] : PUESTOS[k++ % PUESTOS.length];
      const esc_ = it.slot === "chasis" ? 0.9 : it.slot === "motores" ? 0.55 : 1;
      it.obj.position.set(x, 0, z); it.obj.scale.setScalar(esc_); it.puesto = [x, z, esc_];
      if (it.slot === "chasis" && !chasisPuesto) it.obj.position.set(0, 0, 0.27), it.puesto = [0, 0.27, 0.5], it.obj.scale.setScalar(0.5);
      mundo.add(it.obj);
      if (it.estado === "camino") { it.obj.visible = false; continue; }
      if (it.estado === "caja") { it.obj.visible = false; caja(it); continue; }
      pickable(it.obj, { tipo: "montar", it });
    }
    M.items = its;
    for (const o of dron.userData.body.children) if (o.isMesh) o.visible = chasisPuesto;     // las luces de los brazos van con el chasis
    controls.minDistance = 0.08; controls.maxDistance = 1.4;
    if (M.vista !== "armar") { M.vista = "armar"; cam.position.set(0, 0.6, 0.56); controls.target.set(0, 0, 0.05); controls.update(); }
  }
  /** Mover la cámara suave hacia un punto (para ver de cerca los tornillos). */
  function enfocar(target, pos) {
    const t0 = controls.target.clone(), p0 = cam.position.clone();
    tween(0.6, (k) => { const e = suave(k); controls.target.lerpVectors(t0, target, e); cam.position.lerpVectors(p0, pos, e); }, null, false);
  }
  const VISTA_ARMAR = () => [new THREE.Vector3(0, 0, 0.05), new THREE.Vector3(0, 0.6, 0.56)];

  /** Una caja de cartón con su cinta y una etiqueta con el nombre. */
  function caja(it) {
    const [x, z] = it.puesto, grande = it.slot === "chasis", w = grande ? 0.2 : 0.11, h = grande ? 0.045 : 0.065, dd = grande ? 0.16 : 0.09;
    const g = new THREE.Group(); g.position.set(x, 0, z);
    const base = new THREE.Mesh(new THREE.BoxGeometry(w, h, dd), MAT.carton); base.position.y = h / 2; base.castShadow = base.receiveShadow = true; g.add(base);
    const solapa = (lado) => {
      const piv = new THREE.Group(); piv.position.set(0, h, (lado * dd) / 2);
      const s = new THREE.Mesh(new THREE.BoxGeometry(w, 0.002, dd / 2), MAT.carton); s.position.z = (-lado * dd) / 4; s.castShadow = true; piv.add(s);
      g.add(piv); return piv;
    };
    const s1 = solapa(1), s2 = solapa(-1);
    const cinta = new THREE.Mesh(new THREE.BoxGeometry(w + 0.004, 0.0025, 0.018), MAT.cinta); cinta.position.y = h + 0.0015; g.add(cinta);
    // la etiqueta (el nombre de la pieza)
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
    pickable(g, { tipo: "caja", it });
  }

  /** Los puntos donde van los tornillos (en coordenadas del dron) y cuánto hay que mantener apretado. */
  function puntosDe(it) {
    const S = M.dron.userData.slots, co = M.dron.userData.corners;
    const bb = (k) => new THREE.Box3().setFromObject(S[k]);
    if (it.como === "colocar") return [];
    if (it.slot === "motores") return co.flatMap((c) => {
      const L = Math.hypot(c.x, c.z), ux = c.x / L, uz = c.z / L, px = -uz, pz = ux;
      return [-1, 1].map((s) => new THREE.Vector3(c.x - ux * 0.03 + px * 0.005 * s, 0.016, c.z - uz * 0.03 + pz * 0.005 * s));
    });
    if (it.slot === "esc") return [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([a, b]) => new THREE.Vector3(a * 0.016, 0.0225, b * 0.016));
    if (it.slot === "controladora") return [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([a, b]) => new THREE.Vector3(a * 0.016, 0.034, b * 0.016));
    const b = bb(it.s3), c = b.getCenter(new THREE.Vector3());
    if (it.slot === "montaje") { const cp = M.dron.userData.camPos; return [-1, 1].map((s) => new THREE.Vector3(cp.x - 0.022, Math.max(0.012, cp.y - 0.012), s * 0.011)); }
    if (it.slot === "camara") return [new THREE.Vector3(c.x, c.y, b.min.z - 0.002), new THREE.Vector3(c.x, c.y, b.max.z + 0.002)];
    return [new THREE.Vector3(c.x, b.max.y + 0.002, c.z)];
  }
  const DUR = { tornillos: 0.85, correa: 1.3, cinta: 0.6 };

  /** Montar: la pieza vuela a su lugar y después aparecen sus tornillos. */
  function montar(it) {
    const its = M.items, est = (s) => its.find((x) => x.slot === s)?.estado;
    if (it.slot !== "chasis" && est("chasis") && est("chasis") !== "montada") return aviso(t("Primero el chasis: es la base de todo."));
    if (it.slot === "controladora" && est("esc") && est("esc") !== "montada") return aviso(t("Primero el ESC: la controladora va encima (el \"stack\")."));
    if (it.slot === "camara" && est("montaje") && est("montaje") !== "montada") return aviso(t("Primero el montaje de la cámara."));
    if (M.tornillos) return aviso(t("Termina los tornillos de la pieza que estás montando."));
    const o = it.obj, [x0, z0, s0] = [o.position.x, o.position.z, o.scale.x];
    const cp = M.dron.userData.camPos, destino = it.slot === "montaje" ? new THREE.Vector3(cp.x - 0.022, Math.max(0.01, cp.y - 0.014), 0) : it.centro || new THREE.Vector3();
    M.pick = M.pick.filter((m) => m.userData.accion?.it !== it);
    sfx("click");
    tween(0.8, (k) => {
      const e = suave(k);
      o.position.set(lerp(x0, destino.x, e), Math.sin(k * Math.PI) * 0.08 + lerp(0, destino.y, e), lerp(z0, destino.z, e));
      o.scale.setScalar(lerp(s0, 1, e));
    }, () => {
      const pts = puntosDe(it);
      if (!pts.length) return terminarMontaje(it);
      M.tornillos = { it, pts: pts.map((v) => ({ v, T: TA.tornillo0(), anillo: null, tornillo: null })), dur: DUR[it.como] };
      const cen = pts.reduce((a, v) => a.add(v), new THREE.Vector3()).multiplyScalar(1 / pts.length), lejos = it.slot === "motores" ? 0.34 : 0.16;
      enfocar(cen, cen.clone().add(new THREE.Vector3(0, lejos * 0.8, lejos * 0.75)));
      for (const [i, q] of M.tornillos.pts.entries()) {
        const a = new THREE.Mesh(new THREE.TorusGeometry(0.0034, 0.0007, 8, 24), MAT.anillo.clone());
        a.rotation.x = Math.PI / 2; a.position.copy(q.v).add(new THREE.Vector3(0, 0.0012, 0));
        if (it.como !== "tornillos") { a.geometry = new THREE.TorusGeometry(0.008, 0.0012, 8, 30); }
        mundo.add(a); q.anillo = a;
        a.userData.accion = { tipo: "tornillo", i }; M.pick.push(a);
        const hit = new THREE.Mesh(new THREE.SphereGeometry(it.como === "tornillos" ? 0.006 : 0.012, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
        hit.position.copy(a.position); hit.userData.accion = { tipo: "tornillo", i }; mundo.add(hit); M.pick.push(hit);
      }
      hud();
    });
  }
  function tornilloMesh() {
    const g = new THREE.Group();
    const cab = new THREE.Mesh(new THREE.CylinderGeometry(0.0026, 0.0026, 0.0014, 16), MAT.tornillo); cab.castShadow = true; g.add(cab);
    for (const r of [0, Math.PI / 2]) { const ra = new THREE.Mesh(new THREE.BoxGeometry(0.0034, 0.0006, 0.0006), MAT.goma); ra.position.y = 0.0006; ra.rotation.y = r; g.add(ra); }
    const cu = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.006, 10), MAT.tornillo); cu.position.y = -0.0035; g.add(cu);
    return g;
  }
  function terminarMontaje(it) {
    const d = D(), B = d.banco;
    if (it.slot === "extras") B.instalado.extras = [...d.extras];
    else B.instalado[it.slot] = it.uid;
    if (it.slot === "esc" || it.slot === "motores") { B.helices = false; B.instalado.helices = null; }
    guardar(); ctx.verDron?.();
    sfx("listo");
    aviso("✓ " + t("{pieza} montada.", { pieza: NOMBRE()[it.slot] }), true);
    M.tornillos = null;
    setTimeout(() => { if (M.abierta && M.modo === "armar") { construir(); enfocar(...VISTA_ARMAR()); } }, 450);
  }
  /** Abrir una caja: la cinta ya está cortada; las solapas se abren y la pieza sube. */
  function abrirCaja(it) {
    const C = it.caja, p = P();
    sfx("caja");
    for (const u of it.us) if (u) delete u.caja;
    guardar();
    M.pick = M.pick.filter((m) => m.userData.accion?.it !== it);
    C.cinta.visible = false;
    tween(0.5, (k) => { C.s1.rotation.x = -2.2 * suave(k); C.s2.rotation.x = 2.2 * suave(k); });
    it.obj.visible = true;
    const y0 = 0.0, [x, z, s] = it.puesto;
    it.obj.position.set(x, 0.02, z); it.obj.scale.setScalar(s * 0.9);
    tween(0.9, (k) => { it.obj.position.y = 0.02 + Math.sin(k * Math.PI) * 0.09 + y0; }, () => {
      tween(0.35, (k) => { C.g.scale.setScalar(1 - k); }, () => { mundo.remove(C.g); it.estado = "suelta"; pickable(it.obj, { tipo: "montar", it }); hud(); });
    });
    p && aviso(t("📦 Abriste: {pieza}. Tócala para montarla.", { pieza: NOMBRE()[it.slot] }), true);
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
    else placaGenerica(g, comp);
    M.placaG = g;
    const bb = new THREE.Box3().setFromObject(g);
    M.borde = { x: Math.max(Math.abs(bb.min.x), Math.abs(bb.max.x)), z: Math.max(Math.abs(bb.min.z), Math.abs(bb.max.z)) };
    dibujarCables();
    H.cautin.visible = true; H.estano.visible = true;
    if (M.vista !== "soldar" + M.placa) { M.vista = "soldar" + M.placa; cam.position.set(0, 0.085, 0.07); controls.target.set(0, 0, 0.004); controls.update(); }
    controls.minDistance = 0.04; controls.maxDistance = 0.3;
    pestanasPlaca(ps);
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
      if (nombre) { const m = e.getObjectByName(nombre); if (m) { const mm = m.isMesh ? m : m.getObjectByProperty("isMesh", true); pad(mm, comp, pin); } }
    }
    // los enchufes: el arnés del ESC (JST de 8) en una punta y el u.FL de la antena junto al módulo
    const jst = enchufe(g, new THREE.Vector3(-0.0335, 0.0014, 0.0085), 0.0035, 0.0085);     // la punta del arnés, junto a la placa
    pad(jst, comp, comp.pines.find((p) => p.id === "conn"));
    const ufl = enchufe(g, new THREE.Vector3(0.026, 0.0035, -0.008), 0.003, 0.003, MAT.oro);
    const pa = comp.pines.find((p) => p.id === "ant"); if (pa) pad(ufl, comp, pa);
  }
  function enchufe(g, pos, w, d, mat = MAT.jst) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.0028, d), mat);
    m.position.copy(pos); m.castShadow = true; g.add(m);
    return m;
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
    if (M.multi) {                                        // el multímetro: verde bien, amarillo la lectura salta, rojo pita (corto)
      for (const x of M.pads.values()) {
        if (!x.medida) continue;
        const r = new THREE.Mesh(new THREE.RingGeometry(0.0021, 0.0027, 28), new THREE.MeshBasicMaterial({ color: { ok: 0x47f08a, fria: 0xffd23f, corto: 0xff4030 }[x.medida], side: THREE.DoubleSide, depthTest: false, transparent: true, opacity: 0.9 }));
        r.rotation.x = -Math.PI / 2; r.position.copy(x.pos).add(new THREE.Vector3(0, 0.0016, 0)); r.renderOrder = 6;
        r.scale.setScalar(x.pad === "grande" ? 2.2 : x.pad === "medio" ? 1.1 : 0.9);
        M.placaG.add(r); CABLES.push(r);
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
  function puenteMesh(P_) {
    const v = P_.pad === "medio" ? M.pads.get(`${P_.ref}#${P_.sub < 2 ? P_.sub + 1 : P_.sub - 1}`)
      : P_.pad === "grande" ? M.pads.get(P_.ref === "esc.bat+" ? "esc.bat-#0" : "esc.bat+#0") : M.pads.get(`${TA.vecino(M.comps, P_.ref)}#0`);
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
    const alEsc = (k) => k === "xt60" || /^m(FL|FR|RL|RR)$/.test(k);         // al ESC van la batería y los motores; lo demás a la controladora
    for (const c of M.comps) {
      if (c.k === M.placa || c.k === "fc" || (c.k === "esc" && M.placa !== "fc")) continue;
      if (c.k !== "esc" && alEsc(c.k) !== (M.placa === "esc")) continue;
      for (const pin of c.pines) {
        if (c.k === "esc" && pin.id !== "conn") continue;
        const ref = `${c.k}.${pin.id}`;
        const puestos = B.cables.filter((x) => x.includes(ref));
        const aqui = puestos.find((x) => TA.placaDe(x, M.comps).split(".")[0] === M.placa);
        if (puestos.length && !aqui && c.k !== "xt60") continue;          // ya está en la otra placa
        out.push({ ref, comp: c, pin, cable: aqui || null });
      }
    }
    return out;
  }
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
    if (M.flux) {
      if (PT.gastar(P(), "flux", 0.25)) { J.flux = true; J.fluxQueda = 1; } else aviso(t("Se te acabó el flux: compra más en la tienda (Soldadura)."));
      M.flux = false; hud();
    }
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
    if (h?.tipo !== "soldar") return aviso(t("Pon el cautín sobre la junta (mantén el clic) y aprieta X para chupar el estaño."));
    if (M.t - (M.bombaT || -9) < 0.8) return;                     // hay que volver a cargar la bomba
    M.bombaT = M.t;
    const q = TA.extraer(h.J);
    if (!q) return aviso(t("El estaño todavía no está derretido: caliéntalo un poco más."));
    sfx("pop");
    if (h.gota) { M.placaG.remove(h.gota); h.gota = null; }
    aviso(t("🥤 ¡Chupaste el estaño!"), true);
  }

  // ---------------- el ratón y el teclado ----------------
  function apuntar(ev) {
    const r = $("mesa-c").getBoundingClientRect();
    M.mouse.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    M.cx = ev.clientX; M.cy = ev.clientY;
    ray.setFromCamera(M.mouse, cam);
    return ray.intersectObjects(M.pick, false).find((h) => h.object.userData.accion) || null;
  }
  function abajo(ev) {
    if (ev.button !== 0 || M.tweens.some((x) => x.bloquea)) return;
    const hit = apuntar(ev), a = hit?.object.userData.accion;
    if (M.modo === "armar") {
      if (!a) return;
      if (a.tipo === "caja") { M.hold = { tipo: "cortar", it: a.it, p: 0, ruido: 0 }; H.cuter.visible = true; }
      else if (a.tipo === "montar") montar(a.it);
      else if (a.tipo === "tornillo" && M.tornillos) {
        const q = M.tornillos.pts[a.i];
        if (q.T.estado === "apretado") return;
        if (!q.tornillo && M.tornillos.it.como === "tornillos") { q.tornillo = tornilloMesh(); q.tornillo.position.copy(q.v).add(new THREE.Vector3(0, 0.0048, 0)); mundo.add(q.tornillo); sfx("click"); }
        M.hold = { tipo: "tornillo", i: a.i, ruido: 0 };
      }
      return;
    }
    // soldar
    if (a?.tipo === "pad") {
      if (M.enMano) return ponerCable(a.info);
      if (a.info.enchufe) { const c = cableEn(a.info); if (c) aviso(t("Ya está enchufado.")); else aviso(t("Toma el conector de la izquierda y ponlo aquí.")); return; }
      if (!M.E.on) aviso(t("La estación está apagada: préndela (⏻)."));
      empezarJunta(a.info);
      M.tocando = true;
    }
  }
  function mover(ev) {
    const hit = apuntar(ev);
    M.hover = hit?.object.userData.accion || null;
    if (M.modo === "soldar") {
      // la punta del cautín sigue al ratón sobre la placa (apoyada si estás soldando)
      const pl = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.002), v = new THREE.Vector3();
      if (hit) v.copy(hit.point); else ray.ray.intersectPlane(pl, v);
      if (v) M.tPunta.copy(v);
    }
    $("mesa-c").style.cursor = M.hover ? "pointer" : M.modo === "soldar" ? "none" : "default";
  }
  function arriba() {
    if (!M.hold) return;
    if (M.hold.tipo === "soldar") { M.tocando = false; terminarJunta(); return; }
    if (M.hold.tipo === "cortar") H.cuter.visible = false;
    if (M.hold.tipo === "tornillo") {
      H.destornillador.visible = false;
      if (M.tornillos?.pts.every((x) => x.T.estado === "apretado")) { const it = M.tornillos.it; M.hold = null; anillo(null); terminarMontaje(it); return; }
    }
    if (M.hold.tipo === "enchufar" && M.hold.p < 1) { const B = D().banco; B.cables = B.cables.filter((x) => x !== M.hold.c); delete B.juntas[TA.claveCable(M.hold.c)]; aviso(t("Se salió: mantén apretado hasta el clic.")); dibujarCables(); }
    M.hold = null;
    hud();
  }
  function tecla(e) {
    if (!M.abierta || e.target.closest?.("input,textarea")) return;
    if (e.code === "Space") { M.espacio = true; e.preventDefault(); }
    else if (e.key === "f" || e.key === "F") toggleFlux();
    else if (e.key === "c" || e.key === "C") limpiarPunta();
    else if (e.key === "x" || e.key === "X") bomba();
    else if (e.key === "m" || e.key === "M") M.malla = true;
    else if (e.key === "t" || e.key === "T") multimetro();
    else if (e.key === "Escape") { if (M.enMano) { M.enMano = null; hud(); } else cerrar(); }
  }
  function toggleFlux() {
    if (M.modo !== "soldar") return;
    if (!M.flux && PT.insumo(P(), "flux") < 0.25) return aviso(t("Se te acabó el flux: compra más en la tienda (Soldadura)."));
    M.flux = !M.flux; hud();
  }
  /** El multímetro en continuidad: pita entre dos pads unidos por estaño (corto) y la lectura salta en una junta fría. */
  function multimetro() {
    if (M.modo !== "soldar") return;
    if (!PT.tieneHerramienta(P(), "multimetro")) return aviso(t("No tienes multímetro: está en la tienda (Herramientas)."));
    M.multi = !M.multi; sfx("click");
    dibujarCables();
    if (!M.multi) return;
    const malas = [...M.pads.values()].filter((x) => x.medida && x.medida !== "ok");
    const cortos = malas.filter((x) => x.medida === "corto"), frias = malas.filter((x) => x.medida === "fria");
    aviso(cortos.length ? "📟 " + t("¡Pita! Hay continuidad entre {a} y el pad de al lado: un corto.", { a: nombrePad(cortos[0]) })
      : frias.length ? "📟 " + t("La lectura salta en {a}: soldadura fría.", { a: nombrePad(frias[0]) }) : "📟 " + t("Nada raro: sin cortos ni juntas frías en esta placa."), !malas.length);
  }
  const nombrePad = (x) => `${x.pin.nombre}${x.pad === "medio" ? ` (${x.sub + 1})` : ""}`;
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
  $("ms-bomba").onclick = bomba;
  $("ms-multi").onclick = multimetro;
  $("ms-malla").onpointerdown = () => { M.malla = true; };
  $("ms-malla").onpointerup = $("ms-malla").onpointerleave = () => { M.malla = false; };
  $("ms-limpiar").onclick = limpiarPunta;
  $("ms-flux").onclick = toggleFlux;
  $("ms-estano").onpointerdown = () => { M.espacio = true; };
  $("ms-estano").onpointerup = $("ms-estano").onpointerleave = () => { M.espacio = false; };

  // ---------------- el bucle ----------------
  function tween(dur, fn, fin, bloquea = true) { M.tweens.push({ t: 0, dur, fn, fin, bloquea }); }
  function bucle(now) {
    if (!M.abierta) return;
    raf = requestAnimationFrame(bucle);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now; M.t += dt;
    for (const tw of [...M.tweens]) { tw.t += dt; const k = Math.min(1, tw.t / tw.dur); tw.fn(k); if (k >= 1) { M.tweens.splice(M.tweens.indexOf(tw), 1); tw.fin?.(); } }
    if (M.modo === "armar") pasoArmar(dt); else pasoSoldar(dt);
    for (const s of [...M.humo]) { s.userData.v += dt; s.position.y += dt * 0.012; s.scale.multiplyScalar(1 + dt * 1.2); s.material.opacity = 0.35 * (1 - s.userData.v / 1.6); if (s.userData.v > 1.6) { scene.remove(s); M.humo.splice(M.humo.indexOf(s), 1); } }
    controls.update();
    renderer.render(scene, cam);
  }
  function pasoArmar(dt) {
    const h = M.hold;
    // los anillos de los tornillos laten
    if (M.tornillos) for (const q of M.tornillos.pts) if (q.T.estado !== "apretado") q.anillo.material.opacity = 0.45 + 0.4 * Math.sin(M.t * 6);
    if (!h) { anillo(null); return; }
    if (h.tipo === "cortar") {
      const C = h.it.caja;
      h.p = Math.min(1, h.p + dt / 1.3);
      H.cuter.position.copy(C.g.position).add(new THREE.Vector3(-C.w / 2 + C.w * h.p, C.h + 0.003, 0));
      C.cinta.scale.x = 1 - h.p * 0.98; C.cinta.position.x = (C.w * h.p) / 2;
      h.ruido += dt; if (h.ruido > 0.22) { h.ruido = 0; sfx("rasgar"); }
      anillo(h.p, t("Cortando la cinta…"));
      if (h.p >= 1) { M.hold = null; H.cuter.visible = false; anillo(null); abrirCaja(h.it); }
    } else if (h.tipo === "tornillo" && M.tornillos) {
      const q = M.tornillos.pts[h.i], esTor = M.tornillos.it.como === "tornillos";
      const ev = TA.tickTornillo(q.T, dt, true, M.tornillos.dur);
      if (esTor) {
        q.tornillo.position.y = q.v.y + 0.0048 * (1 - q.T.p) + 0.0007;
        q.tornillo.rotation.y += dt * (q.T.estado === "apretado" ? 4 : 22);
        H.destornillador.visible = true;
        H.destornillador.position.copy(q.tornillo.position).add(new THREE.Vector3(0, 0.0007, 0));
        H.destornillador.rotation.y = q.tornillo.rotation.y;
        h.ruido += dt; if (h.ruido > 0.16 && q.T.estado === "girando") { h.ruido = 0; sfx("trinquete"); }
      }
      anillo(q.T.estado === "apretado" ? 1 : q.T.p, q.T.estado === "apretado" ? (esTor ? t("¡Clic! Suelta ya") : t("Listo")) : { tornillos: t("Atornillando…"), correa: t("Apretando la correa…"), cinta: t("Pegando con cinta doble faz…") }[M.tornillos.it.como], q.T.estado === "apretado");
      if (ev === "clic") { sfx("click"); q.anillo.material = MAT.anilloOk; if (!esTor) { M.hold = null; anillo(null); } }
      if (ev === "barrido") { sfx("error"); aviso(t("¡Te pasaste! La rosca se barrió. Suelta apenas suene el clic.")); q.anillo.material = MAT.anillo.clone(); }
      if (!esTor && q.T.estado === "apretado" && M.tornillos.pts.every((x) => x.T.estado === "apretado")) terminarMontaje(M.tornillos.it);
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
    const objetivo = tocando ? h.info.pos.clone().add(new THREE.Vector3(0.0006, 0.0006, 0.0006)) : M.tPunta.clone().add(new THREE.Vector3(0, 0.004, 0));
    H.cautin.position.lerp(objetivo, Math.min(1, dt * 18));
    const calor = Math.max(0, Math.min(1, (M.E.temp - 150) / 300));
    H.punta.material.emissive.setRGB(calor * 0.9, calor * 0.25, 0);
    // el alambre de estaño: desde la mano izquierda (abajo a la derecha) hasta casi la punta; con Espacio, toca la junta
    const fin = H.cautin.position.clone().add(new THREE.Vector3(M.espacio ? -0.0011 : -0.005, M.espacio ? 0.0005 : 0.003, M.espacio ? -0.0006 : -0.004));
    entre(H.estano, fin.clone().add(new THREE.Vector3(-0.05, 0.035, -0.04)), fin);           // el estaño entra por la izquierda
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
      const e0 = h.J.estano, conMalla = M.malla && PT.insumo(P(), "malla") > 0;
      if (M.malla && !conMalla && M.t - M.avisoT > 2.5) { M.avisoT = M.t; aviso(t("Se te acabó la malla desoldante: compra más en la tienda (Soldadura).")); }
      const ev = TA.tickJunta(h.J, M.E, dt, true, M.espacio && !!h.c && !conMalla, conMalla);
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
    s.scale.setScalar(0.003); s.userData.v = 0;
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
    const lista = $("mesa-lista"), pista = $("mesa-pista");
    if (M.modo === "soldar" && !M.comps) { lista.innerHTML = ""; return; }
    lista.innerHTML = "";
    if (M.modo === "armar") {
      const ic = { montada: "✅", suelta: "🔩", caja: "📦", camino: "🚚" };
      for (const it of M.items || []) {
        const li = document.createElement("li");
        li.className = it.estado;
        const u = it.us[0];
        li.innerHTML = `<span>${ic[it.estado]}</span><b>${esc(NOMBRE()[it.slot])}</b>${it.estado === "camino" ? `<small>${t("día {n}", { n: u?.llega ?? "?" })}</small>` : ""}`;
        lista.appendChild(li);
      }
      const falta = (M.items || []).filter((x) => x.estado !== "montada");
      pista.textContent = M.tornillos ? ({ tornillos: t("Toca cada tornillo y mantén apretado hasta el clic"), correa: t("Mantén apretado para ajustar la correa"), cinta: t("Mantén apretado para pegar la radio") }[M.tornillos.it.como])
        : !falta.length ? t("✓ Todo montado. Sigue con 🔥 Soldar.") : falta.some((x) => x.estado === "caja") ? t("Mantén apretado sobre una caja para cortar la cinta") : falta.some((x) => x.estado === "suelta") ? t("Toca una pieza para llevarla a su lugar") : t("Lo que falta viene en camino 🚚");
    } else {
      const B = D().banco, J = B.juntas || {};
      for (const f of fuentes()) {
        const li = document.createElement("li"), j = f.cable ? J[TA.claveCable(f.cable)] : null;
        const q = !f.cable ? "" : j ? j.q : "buena", icq = { "": "", sin: "○", buena: "🔘", enchufado: "🔌", fria: "🔘", puente: "🔘", levantado: "🔘" }[q];   // la lista no dice si salió bien
        li.className = "cab" + (M.enMano === f.ref ? " mano" : "") + (f.cable ? " puesto" : "");
        li.innerHTML = `<i style="background:${COLOR_PIN[f.pin.tipo] || "#ccc"}"></i><b>${esc(f.comp.k === "xt60" ? "XT60" : f.comp.k === "esc" ? "ESC" : f.comp.k.startsWith("m") ? f.comp.nombre : f.comp.nombre.split(" ").slice(0, 2).join(" "))} · ${esc(f.pin.nombre)}</b><small>${icq}</small>`;
        li.title = f.cable ? t("Toca para quitarlo") : t("Toca para tomarlo");
        li.onclick = () => tomarCable(f);
        lista.appendChild(li);
      }
      const E = M.E;
      pista.textContent = M.enMano ? t("Pon el cable en su pad (mira la 📄 Guía) · Esc para soltarlo") : !M.cautin ? t("Necesitas un cautín: tienda → Soldadura") : !E.on ? t("Prende la estación ⏻ y espera que caliente") : E.temp < 280 ? t("Calentando la punta…") : M.flux ? t("Flux listo: toca el pad donde lo quieres") : t("Mantén el clic en el pad (cautín) y aprieta Espacio (estaño)");
      $("ms-on").setAttribute("aria-pressed", String(E.on));
      $("ms-on").classList.toggle("vacio", !M.cautin);
      $("ms-on").title = M.cautin ? M.cautin.nombre : t("No tienes con qué soldar: compra un cautín en la tienda (Soldadura).");
      const p = P(), q = (k, u, d = 1) => `${num(PT.insumo(p, k), d)} ${u}`;
      $("ms-q-estano").textContent = q("estano", "g"); $("ms-q-flux").textContent = q("flux", "ml"); $("ms-q-malla").textContent = q("malla", "m", 2);
      $("ms-estano").classList.toggle("vacio", PT.insumo(p, "estano") < 0.1); $("ms-flux").classList.toggle("vacio", PT.insumo(p, "flux") < 0.25); $("ms-malla").classList.toggle("vacio", PT.insumo(p, "malla") <= 0);
      $("ms-bomba").disabled = !PT.tieneHerramienta(p, "extractor"); $("ms-multi").disabled = !PT.tieneHerramienta(p, "multimetro");
      $("ms-multi").setAttribute("aria-pressed", String(!!M.multi));
      $("ms-menos").disabled = $("ms-mas").disabled = !E.ajustable;
      lista.insertAdjacentHTML("afterbegin", `<li class="stock"><small>🧷 ${t("cable")}: ${q("cable", "m")}</small></li>`);
      $("ms-set").textContent = `${E.set} °C`;
      $("ms-flux").setAttribute("aria-pressed", String(M.flux));
      hudTemp();
    }
  }

  return { abrir, cerrar, get abierta() { return M.abierta; }, _prueba: { M, cam: () => cam, mundo: () => mundo } };   // _prueba: para las pruebas en el navegador
}
