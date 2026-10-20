// =====================================================================
// EL ESCRITORIO DEL GARAJE (lo pone garaje.js): tres monitores en un brazo con pantallas que se actualizan solas
// (el dron en alambre girando, los planos con sus medidas y las estadísticas + la curva de la IA si está entrenando),
// teclado, ratón, lámpara de brazo, regleta con sus cables a cada aparato, tapete de soldar con cables sueltos,
// organizador de piezas, repisa con carretes de cable y cajas, más herramientas en el tablero y el multímetro (si lo
// compraste). Todo lo quieto se junta en una malla por material (pocas llamadas de dibujo); las pantallas se dibujan
// a 2 cuadros por segundo y la curva de la IA se pide cada 3 s, solo mientras el garaje está en pantalla.
// =====================================================================
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { buildDrone, disposeDrone } from "./dron3d.js";
import { calcular, pieza, POR_DEFECTO } from "./parts.js";
import { multimetro3d } from "./multimetro.js";
import { t, num } from "./i18n.js";

const Y0 = 0.96;                                  // la cubierta de la mesa
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

/** Junta mallas quietas por material: una sola malla (y una llamada de dibujo) por material. */
export class Lote {
  constructor() { this.por = new Map(); }
  hornear(obj) {
    obj.updateMatrixWorld(true);
    obj.traverse((o) => {
      if (!o.isMesh) return;
      let g = o.geometry.clone().applyMatrix4(o.matrixWorld);
      if (g.index) g = g.toNonIndexed();
      for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal" && k !== "uv") g.deleteAttribute(k);
      if (!g.attributes.uv) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (!this.por.has(o.material)) this.por.set(o.material, []);
      this.por.get(o.material).push(g);
    });
  }
  armar(parent) {
    for (const [mat, geos] of this.por) {
      const m = new THREE.Mesh(mergeGeometries(geos), mat);
      m.castShadow = m.receiveShadow = true;
      m.userData.escritorio = true;
      parent.add(m);
      geos.forEach((g) => g.dispose());
    }
    this.por.clear();
  }
}

function lienzo(w, h) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4;
  return { c, g: c.getContext("2d"), tx };
}
const FUENTE = "'Chakra Petch', 'Segoe UI', sans-serif";

export class Escritorio {
  constructor(scene, quality = "media") {
    this.scene = scene;
    this.g = new THREE.Group(); this.g.name = "escritorio";
    scene.add(this.g);
    this.reloj = 1; this.tPoll = 99; this.giro = 0.6;
    this.ia = null; this.iaClave = "";
    this.nombre = "";
    this.sucio = { plano: true, stats: true, fondo: true };
    const L = new Lote();
    const mat = (c, r = 0.5, m = 0, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m, ...extra });
    const MT = {
      negro: mat(0x15171a, 0.5, 0.1), metal: mat(0x2a2f34, 0.38, 0.7), alu: mat(0xb9bec4, 0.3, 1),
      gabinete: mat(0x34434e, 0.5, 0.45), cable: mat(0x0f1011, 0.55), rojo: mat(0xb3261e, 0.45), amarillo: mat(0xe0a400, 0.45),
      azul: mat(0x2457c8, 0.45), verde: mat(0x2a8a4a, 0.45), blanco: mat(0xe8e6df, 0.55), naranjo: mat(0xff7a1a, 0.45),
      carton: mat(0xa98455, 0.9), gris: mat(0x6c7178, 0.6, 0.2), cobre: mat(0xc8743a, 0.35, 0.85),
      madera: mat(0x5e4a36, 0.9), goma: mat(0x1b1c1f, 0.85),
      brillo: new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.25, 0.15).multiplyScalar(3) }),
      led: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 1, 0.5).multiplyScalar(2.5) }),
    };
    this.MT = MT;
    const caja = (w, h, d, m, x, y, z, ry = 0, rx = 0, rz = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); return o; };
    const cil = (r1, r2, h, m, x, y, z, seg = 16, rx = 0, rz = 0) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), m); o.position.set(x, y, z); o.rotation.set(rx, 0, rz); return o; };
    /** Un cilindro entre dos puntos (brazos, varillas). */
    const barra = (a, b, r, m, seg = 12) => {
      const d = new THREE.Vector3().subVectors(b, a), o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), seg), m);
      o.position.copy(a).addScaledVector(d, 0.5); o.quaternion.setFromUnitVectors(V3(0, 1, 0), d.normalize()); return o;
    };
    const tubo = (pts, r, m, n = 40) => new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => V3(...p))), n, r, 6), m);
    const H = (o) => L.hornear(o);

    // ---------------- la mesa más sólida: faldón, cajonera, bandeja de cables ----------------
    H(caja(3.2, 0.1, 0.03, MT.metal, 0, 0.87, -1.27));                         // faldón de adelante
    H(caja(3.2, 0.1, 0.03, MT.metal, 0, 0.87, -2.53));
    for (const x of [-1.2, 1.2]) {                                              // dos cajoneras de metal (izq. y der.)
      H(caja(0.5, 0.6, 1.05, MT.gabinete, x, 0.57, -1.9));
      for (let i = 0; i < 3; i++) {
        const y = 0.75 - i * 0.19;
        H(caja(0.46, 0.17, 0.012, MT.gabinete, x, y, -1.37));
        H(caja(0.16, 0.014, 0.02, MT.alu, x, y + 0.04, -1.355));
        H(caja(0.09, 0.03, 0.004, MT.blanco, x, y - 0.03, -1.363));              // la etiqueta del cajón
      }
    }
    // la bandeja de cables bajo el borde de atrás (canal en U)
    H(caja(1.7, 0.012, 0.12, MT.metal, -0.15, 0.8, -2.45)); H(caja(1.7, 0.06, 0.01, MT.metal, -0.15, 0.83, -2.39)); H(caja(1.7, 0.06, 0.01, MT.metal, -0.15, 0.83, -2.51));
    for (const [z, c] of [[-2.43, MT.cable], [-2.47, MT.cable], [-2.45, MT.rojo]]) H(barra(V3(-0.95, 0.815, z), V3(0.65, 0.815, z + 0.01), 0.006, c, 6));

    // ---------------- los tres monitores en su brazo ----------------
    const PX = -0.12, PZ = -2.52;
    H(caja(0.1, 0.03, 0.12, MT.metal, PX, Y0 + 0.015, PZ + 0.02));                 // la prensa del brazo
    H(caja(0.06, 0.09, 0.02, MT.metal, PX, Y0 - 0.03, PZ - 0.05));
    H(cil(0.016, 0.016, 0.62, MT.alu, PX, Y0 + 0.31, PZ));
    H(caja(0.86, 0.03, 0.03, MT.metal, PX, 1.47, PZ + 0.03));                     // el travesaño
    for (const y of [1.1, 1.3]) H(cil(0.02, 0.02, 0.012, MT.negro, PX, y, PZ));   // las bridas de los cables en el poste
    this.pantallas = [];
    const MON = [[PX - 0.52, -2.35, 0.38], [PX, -2.42, 0], [PX + 0.52, -2.35, -0.38]];
    for (const [i, [x, z, ry]] of MON.entries()) {
      const mon = new THREE.Group(); mon.position.set(x, 1.47, z); mon.rotation.y = ry;
      mon.add(caja(0.49, 0.295, 0.02, MT.negro, 0, 0, 0));
      mon.add(caja(0.2, 0.15, 0.03, MT.negro, 0, 0, -0.022));
      mon.add(caja(0.1, 0.1, 0.012, MT.metal, 0, 0, -0.042));                     // la placa VESA
      mon.add(caja(0.012, 0.004, 0.003, MT.led, 0.21, -0.142, 0.0105));           // el led de encendido
      H(mon);
      // el brazo: del travesaño a la placa VESA
      const atras = mon.localToWorld(V3(0, 0, -0.05));
      if (ry) H(barra(V3(PX + Math.sign(x - PX) * 0.42, 1.47, PZ + 0.03), atras, 0.012, MT.alu));
      // el cable de video: de la pantalla al poste y abajo, por la bandeja
      const c0 = mon.localToWorld(V3(0.05, -0.08, -0.04));
      H(tubo([[c0.x, c0.y, c0.z], [c0.x * 0.6 + PX * 0.4, 1.38, PZ + 0.0], [PX + 0.02 * (i - 1), 1.3, PZ - 0.02], [PX + 0.02 * (i - 1), 1.0, PZ - 0.025], [PX + 0.03 * (i - 1), 0.93, -2.56], [PX + 0.05 * (i - 1), 0.82, -2.47]], 0.0035, MT.cable, 30));
      // la pantalla (un canvas o el render del dron)
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.462, 0.27), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 1.2, 1.2), toneMapped: false }));
      scr.position.set(0, 0.006, 0.0105); mon.add(scr);
      mon.remove(...mon.children.filter((o) => o !== scr));
      this.g.add(mon);
      this.pantallas.push(scr);
    }
    // a la izquierda: el dron en alambre (render a textura); al medio los planos; a la derecha las estadísticas
    this.rt = new THREE.WebGLRenderTarget(512, 300, { samples: 4 });
    this.pantallas[0].material.map = this.rt.texture;
    this.lzFondo = lienzo(512, 300);
    this.lzPlano = lienzo(1024, 600); this.pantallas[1].material.map = this.lzPlano.tx;
    this.lzStats = lienzo(1024, 600); this.pantallas[2].material.map = this.lzStats.tx;
    for (const s of this.pantallas) s.material.needsUpdate = true;
    this.mini = new THREE.Scene();
    this.mini.background = this.lzFondo.tx;
    this.camMini = new THREE.PerspectiveCamera(32, 512 / 300, 0.01, 20);
    this.alambre = new THREE.Group(); this.mini.add(this.alambre);
    this.matAlambre = new THREE.LineBasicMaterial({ color: 0x86e6ff, transparent: true, opacity: 0.9 });
    this.matAlambre2 = new THREE.LineBasicMaterial({ color: 0xffb35c });
    this.bordes = new Map();                      // geometría -> sus aristas (las piezas de Blender se comparten)

    // ---------------- teclado, ratón, alfombrilla ----------------
    const kb = lienzo(512, 160);
    { const g = kb.g; g.fillStyle = "#1c1e22"; g.fillRect(0, 0, 512, 160);
      const filas = [15, 15, 14, 13, 12];
      filas.forEach((n, f) => { const w = 470 / n; for (let i = 0; i < n; i++) { const esq = (i === 0 || i === n - 1) && f > 0; g.fillStyle = esq ? "#3a3d44" : (f === 0 && i === 0) ? "#ff7a1a" : "#2a2c31"; g.fillRect(20 + i * w + 2, 10 + f * 28 + 2, w - 4, 24); g.fillStyle = "rgba(255,255,255,0.06)"; g.fillRect(20 + i * w + 3, 10 + f * 28 + 3, w - 6, 4); } });
      g.fillStyle = "#2a2c31"; g.fillRect(150, 150 - 4, 210, 0); kb.tx.needsUpdate = true; }
    const teclado = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.016, 0.115), [MT.negro, MT.negro, new THREE.MeshStandardMaterial({ map: kb.tx, roughness: 0.6 }), MT.negro, MT.negro, MT.negro]);
    teclado.position.set(-0.6, Y0 + 0.009, -1.47); teclado.rotation.set(0.04, 0.1, 0); teclado.castShadow = teclado.receiveShadow = true;
    this.g.add(teclado);
    H(caja(0.24, 0.003, 0.2, MT.goma, -0.26, Y0 + 0.0015, -1.45, -0.05));            // la alfombrilla
    const raton = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 10), MT.negro);
    raton.scale.set(0.65, 0.4, 1); raton.position.set(-0.25, Y0 + 0.012, -1.44); raton.rotation.y = -0.15; H(raton);
    H(caja(0.003, 0.002, 0.012, MT.naranjo, -0.25, Y0 + 0.024, -1.465, -0.15));
    H(tubo([[-0.25, Y0 + 0.008, -1.47], [-0.24, Y0 + 0.004, -1.6], [-0.3, Y0 + 0.004, -1.9], [-0.42, Y0 + 0.004, -2.3], [-0.3, Y0 + 0.004, -2.47]], 0.0022, MT.cable));
    H(tubo([[-0.6, Y0 + 0.008, -1.53], [-0.62, Y0 + 0.004, -1.75], [-0.48, Y0 + 0.004, -2.0], [-0.45, Y0 + 0.004, -2.3], [-0.32, Y0 + 0.004, -2.48]], 0.0022, MT.cable));

    // ---------------- la regleta y los cables a cada aparato ----------------
    const RG = V3(0.2, Y0, -2.46);
    H(caja(0.36, 0.035, 0.06, MT.blanco, RG.x, Y0 + 0.0175, RG.z));
    for (let i = 0; i < 5; i++) H(caja(0.035, 0.002, 0.03, MT.negro, RG.x - 0.12 + i * 0.055, Y0 + 0.036, RG.z));
    H(caja(0.02, 0.008, 0.026, MT.brillo, RG.x + 0.155, Y0 + 0.038, RG.z));           // el interruptor (prendido)
    const desde = (i) => [RG.x - 0.12 + i * 0.055, Y0 + 0.04, RG.z];
    H(tubo([desde(0), [RG.x - 0.12, Y0 + 0.06, RG.z + 0.05], [0.05, Y0 + 0.005, -2.4], [-0.35, Y0 + 0.005, -2.36], [-0.6, Y0 + 0.005, -2.28], [-0.64, Y0 + 0.01, -2.21]], 0.004, MT.cable));     // al portátil
    H(tubo([desde(1), [RG.x - 0.06, Y0 + 0.06, RG.z - 0.02], [PX + 0.06, Y0 + 0.01, PZ + 0.01], [PX + 0.02, Y0 + 0.02, PZ - 0.02]], 0.004, MT.cable));                                    // a los monitores
    H(tubo([desde(2), [RG.x, Y0 + 0.06, RG.z + 0.05], [0.5, Y0 + 0.005, -2.2], [0.68, Y0 + 0.005, -1.95], [0.78, Y0 + 0.008, -1.82]], 0.004, MT.cable));                                   // a la estación de soldar
    H(tubo([desde(3), [RG.x + 0.05, Y0 + 0.06, RG.z - 0.01], [0.6, Y0 + 0.005, -2.45], [0.86, Y0 + 0.01, -2.33]], 0.004, MT.cable));                                                        // a la impresora
    H(tubo([desde(4), [RG.x + 0.1, Y0 + 0.06, RG.z - 0.03], [0.1, Y0 + 0.005, -2.53], [-0.6, Y0 + 0.005, -2.52], [-1.2, Y0 + 0.005, -2.5], [-1.44, Y0 + 0.01, -2.44]], 0.004, MT.cable));    // a la lámpara
    H(tubo([[RG.x + 0.18, Y0 + 0.015, RG.z], [RG.x + 0.24, Y0 + 0.01, -2.53], [RG.x + 0.28, 0.92, -2.6], [RG.x + 0.3, 0.6, -2.66], [RG.x + 0.34, 0.4, -3.05], [0.6, 0.33, -3.17]], 0.005, MT.cable));   // al enchufe de la pared
    H(caja(0.09, 0.12, 0.03, MT.blanco, 0.6, 0.33, -3.185));
    for (const dx of [-0.018, 0.018]) H(caja(0.01, 0.018, 0.004, MT.negro, 0.6 + dx, 0.33, -3.168));

    // ---------------- la lámpara de brazo (con su luz) ----------------
    const LB = V3(-1.45, Y0, -2.42), codo = V3(-1.4, 1.43, -2.3), cabeza = V3(-1.12, 1.4, -1.98);
    H(cil(0.06, 0.07, 0.025, MT.negro, LB.x, Y0 + 0.0125, LB.z, 20));
    H(barra(V3(LB.x, Y0 + 0.02, LB.z), codo, 0.008, MT.alu)); H(barra(V3(LB.x + 0.02, Y0 + 0.02, LB.z), codo.clone().add(V3(0.02, 0, 0)), 0.003, MT.alu));
    H(barra(codo, cabeza, 0.008, MT.alu));
    for (const p of [codo, V3(LB.x, Y0 + 0.03, LB.z)]) H(cil(0.016, 0.016, 0.03, MT.negro, p.x, p.y, p.z, 12, 0, Math.PI / 2));
    const pantallaLamp = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.12, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0x2f5d50, roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide }));
    pantallaLamp.position.copy(cabeza); pantallaLamp.rotation.set(0.35, 0, -0.25); H(pantallaLamp);
    const ampolleta = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.88, 0.7).multiplyScalar(3.5) }));
    ampolleta.position.copy(cabeza).add(V3(0.012, -0.04, 0.012)); this.g.add(ampolleta);
    const luzLamp = new THREE.SpotLight(0xffd9a8, quality === "baja" ? 0 : 2.5, 1.8, 0.75, 0.6, 1.5);
    luzLamp.position.copy(ampolleta.position); luzLamp.target.position.set(-1.0, Y0, -1.75);
    this.g.add(luzLamp, luzLamp.target);

    // ---------------- el organizador de piezas (cajoncitos) ----------------
    const org = lienzo(256, 160);
    { const g = org.g; g.fillStyle = "#30353b"; g.fillRect(0, 0, 256, 160);
      const etq = ["M2", "M3", "M4", "XT60", "JST", "LED", "ESC", "RX", "5V", "GPS", "ToF", "?"];
      for (let f = 0; f < 3; f++) for (let c = 0; c < 4; c++) {
        const x = 8 + c * 62, y = 8 + f * 50;
        g.fillStyle = "rgba(190,220,240,0.35)"; g.fillRect(x, y, 56, 44);
        g.fillStyle = ["#d23a2a", "#2a6fd2", "#e0a400", "#3aa860"][(f + c) % 4]; g.fillRect(x + 6, y + 18, 44, 18);   // lo que hay adentro
        g.fillStyle = "#f2f2ee"; g.fillRect(x + 14, y + 4, 28, 10); g.fillStyle = "#222"; g.font = "bold 9px sans-serif"; g.textAlign = "center"; g.fillText(etq[f * 4 + c], x + 28, y + 12);
        g.fillStyle = "#15171a"; g.fillRect(x + 22, y + 38, 12, 4);
      } org.tx.needsUpdate = true; }
    const organizador = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.19, 0.14), [MT.gris, MT.gris, MT.gris, MT.gris, new THREE.MeshStandardMaterial({ map: org.tx, roughness: 0.35 }), MT.gris]);
    organizador.position.set(-1.21, Y0 + 0.095, -2.4); organizador.rotation.y = 0.12; organizador.castShadow = organizador.receiveShadow = true;
    this.g.add(organizador);

    // ---------------- el tapete de soldar (silicona) con cables sueltos, termorretráctil y bridas ----------------
    const tap = lienzo(512, 360);
    { const g = tap.g; g.fillStyle = "#3d6b8f"; g.fillRect(0, 0, 512, 360);
      g.strokeStyle = "rgba(255,255,255,0.18)"; g.lineWidth = 1;
      for (let x = 0; x < 512; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 360); g.stroke(); }
      for (let y = 0; y < 360; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke(); }
      g.fillStyle = "#2f5675"; for (let i = 0; i < 6; i++) { g.fillRect(360 + (i % 2) * 70, 20 + Math.floor(i / 2) * 56, 60, 46); }    // los compartimientos para tornillos
      g.fillStyle = "#2f5675"; g.beginPath(); g.arc(90, 290, 50, 0, 7); g.fill();
      g.fillStyle = "rgba(255,255,255,0.75)"; g.font = "bold 16px sans-serif"; g.fillText("DRON MAKER · 400 °C", 18, 26);
      tap.tx.needsUpdate = true; }
    const tapete = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.003, 0.34), new THREE.MeshStandardMaterial({ map: tap.tx, roughness: 0.75 }));
    tapete.position.set(0.93, Y0 + 0.0015, -1.66); tapete.rotation.y = -0.12; tapete.receiveShadow = true;
    this.g.add(tapete);
    const YT = Y0 + 0.003;
    for (const [pts, m] of [
      [[[0.55, YT + 0.002, -1.42], [0.62, YT + 0.002, -1.47], [0.7, YT + 0.002, -1.43], [0.78, YT + 0.002, -1.49]], MT.rojo],
      [[[0.56, YT + 0.002, -1.45], [0.64, YT + 0.002, -1.5], [0.72, YT + 0.002, -1.46], [0.8, YT + 0.002, -1.52]], MT.cable],
      [[[0.7, YT + 0.002, -1.55], [0.74, YT + 0.006, -1.6], [0.8, YT + 0.002, -1.56], [0.86, YT + 0.002, -1.6]], MT.amarillo],
      [[[1.02, YT + 0.002, -1.52], [1.06, YT + 0.002, -1.46], [1.12, YT + 0.002, -1.5]], MT.azul],
    ]) H(tubo(pts, 0.0018, m, 20));
    for (let i = 0; i < 5; i++) H(cil(0.0032, 0.0032, 0.022, [MT.rojo, MT.negro, MT.negro, MT.azul, MT.rojo][i], 0.84 + i * 0.012, YT + 0.0032, -1.47 - (i % 2) * 0.01, 10, 0, Math.PI / 2));   // termorretráctil
    for (let i = 0; i < 4; i++) H(caja(0.14, 0.0015, 0.0045, MT.negro, 1.0 + i * 0.006, YT + 0.001 + i * 0.0015, -1.58 + i * 0.008, 0.15 * i));   // bridas
    // el pelacables (rojo) y una tercera mano con lupa
    const pel = new THREE.Group(); pel.position.set(0.66, YT + 0.006, -1.58); pel.rotation.y = 0.5;
    pel.add(caja(0.09, 0.008, 0.012, MT.rojo, 0, 0, 0.012, 0.08), caja(0.09, 0.008, 0.012, MT.rojo, 0, 0, -0.012, -0.08), caja(0.05, 0.01, 0.022, MT.alu, -0.065, 0, 0));
    H(pel);
    const tm = new THREE.Group(); tm.position.set(1.12, YT, -1.82);
    tm.add(cil(0.05, 0.055, 0.02, MT.metal, 0, 0.01, 0, 20), cil(0.005, 0.005, 0.16, MT.alu, 0, 0.09, 0, 10));
    tm.add(barra(V3(0, 0.16, 0), V3(-0.08, 0.2, 0.04), 0.004, MT.alu), barra(V3(0, 0.16, 0), V3(0.07, 0.12, 0.05), 0.003, MT.alu), barra(V3(0, 0.15, 0), V3(-0.06, 0.1, 0.07), 0.003, MT.alu));
    tm.add(caja(0.012, 0.008, 0.02, MT.rojo, 0.07, 0.12, 0.06), caja(0.012, 0.008, 0.02, MT.negro, -0.06, 0.1, 0.08));
    const aro = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.005, 8, 28), MT.negro); aro.position.set(-0.08, 0.2, 0.04); aro.rotation.set(0.9, 0.4, 0); tm.add(aro);
    H(tm);
    const lupa = new THREE.Mesh(new THREE.CircleGeometry(0.043, 28), new THREE.MeshPhysicalMaterial({ color: 0xdfefff, roughness: 0.05, transmission: 0, transparent: true, opacity: 0.25, metalness: 0 }));
    lupa.position.set(1.04, YT + 0.2, -1.78); lupa.rotation.set(0.9 - Math.PI / 2, 0.4, 0); this.g.add(lupa);
    // el carrete de estaño en su soporte
    const sp = new THREE.Group(); sp.position.set(0.6, YT, -1.82);
    sp.add(caja(0.08, 0.008, 0.05, MT.metal, 0, 0.004, 0), caja(0.006, 0.05, 0.006, MT.alu, -0.03, 0.03, 0), caja(0.006, 0.05, 0.006, MT.alu, 0.03, 0.03, 0));
    sp.add(cil(0.004, 0.004, 0.07, MT.alu, 0, 0.05, 0, 8, 0, Math.PI / 2));
    sp.add(cil(0.024, 0.024, 0.034, MT.rojo, 0, 0.05, 0, 20, 0, Math.PI / 2), cil(0.019, 0.019, 0.036, MT.alu, 0, 0.05, 0, 20, 0, Math.PI / 2));
    sp.add(tubo([[0, 0.031, 0.02], [0.01, 0.02, 0.05], [0.04, 0.003, 0.08], [0.09, 0.002, 0.1]], 0.0009, MT.alu, 12));
    H(sp);

    // ---------------- más herramientas en el tablero (abajo de las que ya cuelgan) ----------------
    const TZ = -3.11;
    const pinza = new THREE.Group(); pinza.position.set(-1.05, 1.92, TZ); pinza.rotation.z = 0.05;          // pinzas
    pinza.add(caja(0.006, 0.13, 0.003, MT.alu, -0.004, 0, 0, 0, 0, 0.04), caja(0.006, 0.13, 0.003, MT.alu, 0.004, 0, 0, 0, 0, -0.04)); H(pinza);
    const alicate = new THREE.Group(); alicate.position.set(-0.75, 1.9, TZ);                                // alicate de corte al ras
    alicate.add(cil(0.009, 0.007, 0.1, MT.verde, -0.014, -0.02, 0, 10, 0, 0.18), cil(0.009, 0.007, 0.1, MT.verde, 0.014, -0.02, 0, 10, 0, -0.18), caja(0.024, 0.03, 0.01, MT.alu, 0, 0.045, 0)); H(alicate);
    const tijera = new THREE.Group(); tijera.position.set(-0.45, 1.88, TZ);
    for (const s of [-1, 1]) { const a = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.005, 6, 16), MT.naranjo); a.position.set(s * 0.016, -0.04, 0); tijera.add(a); tijera.add(caja(0.006, 0.09, 0.003, MT.alu, s * 0.004, 0.03, 0, 0, 0, s * 0.12)); }
    H(tijera);
    const llaves = new THREE.Group(); llaves.position.set(0.55, 1.9, TZ);                                   // juego de llaves allen
    llaves.add(caja(0.12, 0.03, 0.02, MT.negro, 0, 0.03, 0));
    for (let i = 0; i < 7; i++) llaves.add(caja(0.004, 0.05 + i * 0.01, 0.004, MT.metal, -0.05 + i * 0.016, 0.005 - i * 0.005, 0.012));
    H(llaves);
    for (const [x, m] of [[0.88, MT.rojo], [0.98, MT.cable], [1.08, MT.amarillo]]) {                   // rollos de cinta aislante en un gancho
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.012, 8, 20), m); r.position.set(x, 1.86, TZ + 0.012); H(r);
    }
    const rollo = new THREE.Group(); rollo.position.set(0.25, 1.86, TZ + 0.01);                             // un rollo de cable colgado
    for (let i = 0; i < 6; i++) { const a = new THREE.Mesh(new THREE.TorusGeometry(0.06 + i * 0.002, 0.0028, 6, 30), i % 2 ? MT.rojo : MT.cable); a.rotation.y = 0.1 * i; rollo.add(a); }
    H(rollo);
    // la repisita del tablero con espráis (alcohol isopropílico, limpia contactos)
    H(caja(0.42, 0.02, 0.12, MT.madera, -0.05, 1.79, -3.06));
    for (const [x, m, h] of [[-0.2, MT.azul, 0.16], [-0.12, MT.blanco, 0.13], [-0.05, MT.amarillo, 0.15], [0.06, MT.verde, 0.11]]) H(cil(0.026, 0.026, h, m, x, 1.8 + h / 2, -3.06, 14));

    // ---------------- la repisa de la derecha: carretes de cable, cajones de piezas y cajas con nombre ----------------
    for (const [y, w] of [[1.5, 1.5], [2.05, 1.5]]) {
      H(caja(w, 0.03, 0.32, MT.madera, 2.4, y, -3.03));
      for (const x of [1.75, 3.05]) H(caja(0.03, 0.14, 0.2, MT.metal, x, y - 0.08, -3.1));
    }
    H(cil(0.006, 0.006, 0.66, MT.alu, 1.98, 1.62, -3.0, 8, 0, Math.PI / 2));
    for (const [i, m] of [MT.rojo, MT.cable, MT.amarillo, MT.azul, MT.verde, MT.blanco].entries()) {
      const x = 1.72 + i * 0.105;
      H(cil(0.05, 0.05, 0.012, MT.negro, x - 0.035, 1.62, -3.0, 24, 0, Math.PI / 2));
      H(cil(0.05, 0.05, 0.012, MT.negro, x + 0.035, 1.62, -3.0, 24, 0, Math.PI / 2));
      H(cil(0.042, 0.042, 0.06, m, x, 1.62, -3.0, 24, 0, Math.PI / 2));
    }
    // cajoneras de plástico (azules) con su etiqueta
    for (let i = 0; i < 4; i++) {
      const x = 2.45 + i * 0.16;
      H(caja(0.14, 0.1, 0.24, MT.azul, x, 1.565, -3.03));
      H(caja(0.06, 0.02, 0.004, MT.blanco, x, 1.585, -2.909));
    }
    // cajas de cartón con nombre (una textura con todas las etiquetas)
    const nombres = [t("Motores"), t("Hélices"), t("Baterías"), t("Cables"), t("Tornillos")].map((s) => s.toUpperCase());
    const et = lienzo(512, 64);
    { const g = et.g; g.fillStyle = "#f1ece0"; g.fillRect(0, 0, 512, 64); g.fillStyle = "#1d1d1d"; g.font = `bold 15px ${FUENTE}`; g.textAlign = "center";
      nombres.forEach((s, i) => { g.fillText(s, 51.2 + i * 102.4, 38); g.strokeStyle = "#999"; g.strokeRect(i * 102.4 + 2, 2, 98, 60); }); et.tx.needsUpdate = true; }
    const matEt = new THREE.MeshStandardMaterial({ map: et.tx, roughness: 0.8 });
    nombres.forEach((_, i) => {
      const x = 1.85 + i * 0.25, h = 0.17 + (i % 2) * 0.05;
      H(caja(0.22, h, 0.26, MT.carton, x, 2.065 + h / 2, -3.03, (i - 2) * 0.03));
      const geo = new THREE.PlaneGeometry(0.14, 0.05), uv = geo.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setX(k, (i + uv.getX(k)) / 5);
      const lab = new THREE.Mesh(geo, matEt); lab.position.set(x, 2.065 + h * 0.55, -3.03 + 0.131); lab.rotation.y = (i - 2) * 0.03; H(lab);
    });

    L.armar(this.g);
  }

  /** Lo que viene de Blender (cuando cargó): el multímetro de verdad. */
  usarModelos() {
    if (this.multi?.glb) return;
    if (this.multi) this.g.remove(this.multi.g);
    this.multi = multimetro3d();
    const m = this.multi.g;
    m.position.set(0.6, Y0, -2.18); m.rotation.y = -0.4;
    m.visible = !!this.tieneMulti;
    this.multi.modo("ohm");
    this.multi.pantalla({ txt: "OL", modo: "ohm" });
    this.g.add(m);
  }

  /** Lo que tienes (las herramientas que se ven) y el nombre del dron (para las pantallas). */
  equipo({ multimetro = false, nombre = "" } = {}) {
    this.tieneMulti = multimetro;
    if (this.multi) this.multi.g.visible = multimetro;
    if (nombre !== this.nombre) { this.nombre = nombre; this.sucio.plano = this.sucio.stats = this.sucio.fondo = true; }
  }

  /** El dron cambió: rehace el alambre, los planos y las estadísticas. dron = el Group del plato (dron3d.js). */
  setBuild(build, cat, dron) {
    this.build = build; this.cat = cat;
    this.esquinas = dron?.userData.corners || [];
    this.radio = dron?.userData.radius || 0.2;
    try { this.st = calcular(build, cat); } catch { this.st = null; }
    this.alambrar(build, cat);
    this.sucio.plano = this.sucio.stats = this.sucio.fondo = true;
    this.reloj = 1;
  }

  /** El dron en alambre: las aristas de cada pieza (EdgesGeometry, una vez por geometría). */
  alambrar(build, cat) {
    for (const o of [...this.alambre.children]) { this.alambre.remove(o); if (!o.userData.compartida) o.geometry.dispose(); }
    if (!build?.chasis) return;
    const d = buildDrone({ ...build, fantasma: [] }, cat);
    d.updateMatrixWorld(true);
    d.traverse((o) => {
      if (!o.isMesh || o.material?.transparent) return;
      let vis = o.visible; o.traverseAncestors((a) => { if (!a.visible) vis = false; });
      if (!vis) return;
      const comp = !!o.userData.compartida;
      let geo = comp ? this.bordes.get(o.geometry) : null;
      if (!geo) { geo = new THREE.EdgesGeometry(o.geometry, 30); if (comp) this.bordes.set(o.geometry, geo); }
      let motor = false; o.traverseAncestors((a) => { if (a.name === "motores") motor = true; });
      const ls = new THREE.LineSegments(geo, motor ? this.matAlambre2 : this.matAlambre);
      ls.matrixAutoUpdate = false; ls.matrix.copy(o.matrixWorld); ls.userData.compartida = comp;
      this.alambre.add(ls);
    });
    disposeDrone(d);
    const r = Math.max(0.12, this.radio);
    this.camMini.position.set(0, r * 1.2, r * 2.75); this.camMini.lookAt(0, -r * 0.1, 0);
  }

  /** Cada cuadro (solo mientras el garaje está en pantalla): las pantallas a 2 por segundo, la IA cada 3 s. */
  update(dt, renderer) {
    this.reloj += dt; this.tPoll += dt;
    if (this.tPoll > 3 && !(typeof document !== "undefined" && document.hidden)) { this.tPoll = 0; this.sondear(); }
    if (this.reloj < 0.5) return;
    this.reloj = 0;
    this.giro += 0.22;
    if (this.sucio.fondo) { this.dibujarFondo(); this.sucio.fondo = false; }
    if (this.sucio.plano) { this.dibujarPlano(); this.sucio.plano = false; }
    if (this.sucio.stats) { this.dibujarStats(); this.sucio.stats = false; }
    if (renderer) {
      this.alambre.rotation.y = this.giro;
      const antes = renderer.getRenderTarget(), sombras = renderer.shadowMap.autoUpdate;
      renderer.shadowMap.autoUpdate = false;
      renderer.setRenderTarget(this.rt); renderer.render(this.mini, this.camMini); renderer.setRenderTarget(antes);
      renderer.shadowMap.autoUpdate = sombras;
    }
  }

  /** GET /api/lab: si alguna IA está entrenando (en el fondo o en Blender), su curva va a la pantalla de la derecha. */
  async sondear() {
    if (this.pidiendo || typeof fetch === "undefined") return;
    this.pidiendo = true;
    try {
      const s = await (await fetch("/api/lab", { cache: "no-store" })).json();
      const f = (s.fondo || []).find((x) => x.activo) || (s.entrenador?.activo ? s.entrenador : null);
      this.ia = f ? { modelo: f.modelo || "", gen: f.gen ?? 0, succ: f.succ || 0, crash: f.crash || 0, hist: (f.hist || []).slice(-90), pausa: !!(f.pausado || f.params?.paused) } : null;
    } catch { this.ia = null; }
    this.pidiendo = false;
    const k = this.ia ? `${this.ia.modelo}|${this.ia.gen}|${this.ia.hist.length}|${this.ia.pausa}` : "";
    if (k !== this.iaClave) { this.iaClave = k; this.sucio.stats = true; }
  }

  // ---------------- lo que se dibuja en las pantallas ----------------
  dibujarFondo() {
    const { g, tx } = this.lzFondo, W = 512, H = 300;
    g.fillStyle = "#08182a"; g.fillRect(0, 0, W, H);
    rejilla(g, W, H, 16, "rgba(110,190,255,0.08)", 64, "rgba(110,190,255,0.16)");
    barraTitulo(g, W, 26, `${t("MODELO 3D")} · ${this.nombre || "—"}`, "#3ccbff", 15);
    g.fillStyle = "rgba(160,220,255,0.7)"; g.font = `12px ${FUENTE}`;
    g.fillText(t("alambre · gira solo"), 10, H - 10);
    // el eje de coordenadas
    const o = [W - 40, H - 22];
    for (const [dx, dy, c, s] of [[22, 0, "#ff5a4a", "X"], [0, -22, "#47f08a", "Y"], [-12, 10, "#3c8bff", "Z"]]) {
      g.strokeStyle = c; g.lineWidth = 2; g.beginPath(); g.moveTo(...o); g.lineTo(o[0] + dx, o[1] + dy); g.stroke();
      g.fillStyle = c; g.font = `bold 10px ${FUENTE}`; g.fillText(s, o[0] + dx * 1.25 - 3, o[1] + dy * 1.25 + 4);
    }
    tx.needsUpdate = true;
  }

  dibujarPlano() {
    const { g, tx } = this.lzPlano, W = 1024, H = 600;
    g.fillStyle = "#123a66"; g.fillRect(0, 0, W, H);
    rejilla(g, W, H, 20, "rgba(255,255,255,0.06)", 100, "rgba(255,255,255,0.13)");
    barraTitulo(g, W, 46, `${t("PLANOS")} · ${this.nombre || "—"}`, "#e8f1ff", 26, "#0b2a4d");
    const cs = this.esquinas || [], st = this.st, B = this.build || {}, cat = this.cat;
    if (!cs.length) { g.fillStyle = "#cfe0ff"; g.font = `24px ${FUENTE}`; g.fillText(t("Elige un chasis para ver sus planos"), 40, H / 2); tx.needsUpdate = true; return; }
    const he = cat && pieza(cat, "helices", B.helices), rProp = he ? he.pulgadas * 0.0127 : 0;
    const reach = Math.max(...cs.map((c) => Math.hypot(c.x, c.z))) + rProp;
    const cx = 330, cy = 330, s = 225 / reach;
    const P = (c) => [cx + c.z * s, cy - c.x * s];     // adelante (x) hacia arriba
    g.lineCap = "round";
    // brazos y placa central
    g.strokeStyle = "rgba(235,244,255,0.9)"; g.lineWidth = 9;
    for (const c of cs) { g.beginPath(); g.moveTo(cx, cy); g.lineTo(...P(c)); g.stroke(); }
    g.fillStyle = "#123a66"; g.lineWidth = 2.5; g.strokeStyle = "#eaf3ff";
    const pl = 0.032 * s; g.fillRect(cx - pl, cy - pl * 1.3, pl * 2, pl * 2.6); g.strokeRect(cx - pl, cy - pl * 1.3, pl * 2, pl * 2.6);
    // motores y hélices (punteadas)
    for (const c of cs) {
      const [x, y] = P(c);
      g.setLineDash([]); g.lineWidth = 2.5; g.strokeStyle = "#eaf3ff"; g.fillStyle = "#1b4d82";
      g.beginPath(); g.arc(x, y, 0.014 * s, 0, 7); g.fill(); g.stroke();
      g.beginPath(); g.arc(x, y, 3, 0, 7); g.fillStyle = "#eaf3ff"; g.fill();
      if (rProp) { g.setLineDash([8, 7]); g.lineWidth = 1.5; g.strokeStyle = "rgba(255,210,120,0.75)"; g.beginPath(); g.arc(x, y, rProp * s, 0, 7); g.stroke(); }
    }
    g.setLineDash([]);
    // la flecha de adelante
    g.fillStyle = "#ffb35c"; g.beginPath(); g.moveTo(cx, cy - pl * 1.3 - 26); g.lineTo(cx - 10, cy - pl * 1.3 - 8); g.lineTo(cx + 10, cy - pl * 1.3 - 8); g.fill();
    // cotas: entre ejes (la diagonal más larga) y entre los motores de adelante
    let a = cs[0], b = cs[1], dmax = 0;
    for (const p of cs) for (const q of cs) { const d = Math.hypot(p.x - q.x, p.z - q.z); if (d > dmax) { dmax = d; a = p; b = q; } }
    cota(g, P(a), P(b), `${Math.round(dmax * 1000)} mm`, 0.28);
    const fr = cs.filter((c) => c.x > 0.001).sort((p, q) => p.z - q.z);
    if (fr.length >= 2) { const [p, q] = [fr[0], fr[fr.length - 1]]; const top = Math.min(P(p)[1], P(q)[1]) - rProp * s - 28; cota(g, [P(p)[0], top], [P(q)[0], top], `${Math.round(Math.hypot(p.x - q.x, p.z - q.z) * 1000)} mm`, 0.5, [P(p), P(q)]); }
    const brazo = Math.hypot(cs[0].x, cs[0].z);
    // la tabla de la derecha
    const filas = [[t("Entre ejes"), `${Math.round(dmax * 1000)} mm`], [t("Brazo"), `${Math.round(brazo * 1000)} mm`], [t("Hélices"), he ? `${he.pulgadas}"` : "—"],
      [t("Masa"), st?.masa_g ? `${Math.round(st.masa_g)} g` : "—"], [t("Motores"), cat && pieza(cat, "motores", B.motores)?.nombre || "—"], [t("Batería"), cat && pieza(cat, "baterias", B.bateria)?.nombre || "—"]];
    const X = 660; g.textAlign = "left";
    filas.forEach(([k, v], i) => {
      const y = 110 + i * 62;
      g.fillStyle = "rgba(200,222,255,0.75)"; g.font = `18px ${FUENTE}`; g.fillText(k.toUpperCase(), X, y);
      g.fillStyle = "#ffffff"; g.font = `bold 28px ${FUENTE}`; g.fillText(String(v).slice(0, 18), X, y + 32);
      g.strokeStyle = "rgba(255,255,255,0.15)"; g.lineWidth = 1; g.beginPath(); g.moveTo(X, y + 44); g.lineTo(W - 30, y + 44); g.stroke();
    });
    // el cajetín
    g.strokeStyle = "#eaf3ff"; g.lineWidth = 2; g.strokeRect(W - 330, H - 70, 310, 54);
    g.beginPath(); g.moveTo(W - 120, H - 70); g.lineTo(W - 120, H - 16); g.stroke();
    g.fillStyle = "#eaf3ff"; g.font = `bold 18px ${FUENTE}`; g.fillText("DRON MAKER", W - 318, H - 46); g.font = `14px ${FUENTE}`; g.fillText((this.nombre || "").slice(0, 22), W - 318, H - 26);
    g.fillText("REV A", W - 108, H - 46); g.fillText("1:2", W - 108, H - 26);
    tx.needsUpdate = true;
  }

  dibujarStats() {
    const { g, tx } = this.lzStats, W = 1024, H = 600, st = this.st, ia = this.ia;
    g.fillStyle = "#0c1416"; g.fillRect(0, 0, W, H);
    barraTitulo(g, W, 46, `${t("ESTADÍSTICAS")} · ${this.nombre || "—"}`, "#47f08a", 26, "#0f2a20");
    g.textAlign = "left";
    if (!st || !st.masa_g) {
      g.fillStyle = "#9db3a9"; g.font = `26px ${FUENTE}`; g.fillText(st?.errores?.[0] || t("Faltan piezas"), 40, 120);
    } else {
      // tres números grandes
      const big = [[t("Empuje/peso"), num(st.twr, 2), st.twr >= 2 ? "#47f08a" : st.twr >= 1.4 ? "#ffd23f" : "#ff5040", Math.min(1, st.twr / 4)],
        [t("Vuelo"), `${num(st.minutos, 1)} min`, "#3ccbff", Math.min(1, st.minutos / 15)], [t("Vel. máx."), `${Math.round(st.velMax)} m/s`, "#ff9a3c", Math.min(1, st.velMax / 30)]];
      big.forEach(([k, v, c, f], i) => {
        const x = 30 + i * 330;
        g.fillStyle = "rgba(157,179,169,0.85)"; g.font = `20px ${FUENTE}`; g.fillText(k.toUpperCase(), x, 92);
        g.fillStyle = c; g.font = `bold 54px ${FUENTE}`; g.fillText(v, x, 148);
        g.fillStyle = "rgba(255,255,255,0.08)"; g.fillRect(x, 162, 290, 10); g.fillStyle = c; g.fillRect(x, 162, 290 * f, 10);
      });
      // la masa por partes
      const cat = this.cat, B = this.build || {}, pz = (r, id) => (cat && pieza(cat, r, id)) || null, mg = (p, n = 1) => (p?.masa_g || 0) * n;
      const elec = mg(pz("controladoras", B.controladora)) + mg(pz("escs", B.esc || POR_DEFECTO.esc)) + mg(pz("radios", B.radio || POR_DEFECTO.radio)) + mg(pz("camaras", B.camara)) + mg(pz("montajes", B.montaje || POR_DEFECTO.montaje));
      const partes = [[t("Chasis"), mg(pz("chasis", B.chasis)), "#c08a52"], [t("Motores"), mg(pz("motores", B.motores), 4), "#ff9a3c"], [t("Batería"), mg(pz("baterias", B.bateria)), "#3ccbff"],
        [t("Electrónica"), elec, "#47f08a"], [t("Hélices"), mg(pz("helices", B.helices)), "#ffd23f"]];
      const otros = Math.max(0, st.masa_g - partes.reduce((s, p) => s + p[1], 0)); partes.push([t("Otros"), otros, "#8a8f98"]);
      g.fillStyle = "rgba(157,179,169,0.85)"; g.font = `20px ${FUENTE}`; g.fillText(t("Masa {n} g", { n: Math.round(st.masa_g) }), 30, 222);
      let x = 30; const BW = W - 60;
      for (const [, m, c] of partes) { const w = (m / st.masa_g) * BW; g.fillStyle = c; g.fillRect(x, 234, Math.max(0, w - 2), 26); x += w; }
      let lx = 30;
      g.font = `16px ${FUENTE}`;
      for (const [k, m, c] of partes) { if (m <= 0) continue; const s = `${k} ${Math.round(m)} g`; g.fillStyle = c; g.fillRect(lx, 274, 12, 12); g.fillStyle = "#cfdcd6"; g.fillText(s, lx + 18, 286); lx += g.measureText(s).width + 40; if (lx > W - 120) break; }
    }
    // abajo: la IA (si alguna está entrenando, su curva en vivo)
    const y0 = 316, hh = H - y0 - 24;
    g.strokeStyle = "rgba(255,255,255,0.12)"; g.lineWidth = 1; g.strokeRect(30, y0, W - 60, hh);
    for (const f of [0.25, 0.5, 0.75]) { g.beginPath(); g.moveTo(30, y0 + hh * f); g.lineTo(W - 30, y0 + hh * f); g.stroke(); }
    if (ia && ia.hist.length > 1) {
      const h = ia.hist, X = (i) => 34 + (i / (h.length - 1)) * (W - 68), Y = (v) => y0 + hh - 6 - v * (hh - 12);
      for (const [idx, c] of [[3, "#ff5040"], [2, "#47f08a"]]) { g.strokeStyle = c; g.lineWidth = 4; g.beginPath(); h.forEach((r, i) => (i ? g.lineTo(X(i), Y(r[idx] || 0)) : g.moveTo(X(i), Y(r[idx] || 0)))); g.stroke(); }
      g.fillStyle = "#eaf2ef"; g.font = `bold 22px ${FUENTE}`;
      g.fillText(t("IA entrenando · {modelo} · gen {gen} · {pct} % logradas", { modelo: ia.modelo, gen: ia.gen, pct: Math.round(ia.succ * 100) }) + (ia.pausa ? " ⏸" : ""), 44, y0 + 30);
    } else if (ia) {
      g.fillStyle = "#eaf2ef"; g.font = `bold 22px ${FUENTE}`; g.fillText(t("IA entrenando · {modelo} · gen {gen} · {pct} % logradas", { modelo: ia.modelo, gen: ia.gen, pct: Math.round(ia.succ * 100) }), 44, y0 + 30);
    } else {
      g.fillStyle = "rgba(157,179,169,0.7)"; g.font = `22px ${FUENTE}`; g.fillText(t("La IA no está entrenando"), 44, y0 + hh / 2 + 8);
    }
    tx.needsUpdate = true;
  }
}

function rejilla(g, W, H, paso, c1, grande, c2) {
  g.lineWidth = 1;
  for (const [p, c] of [[paso, c1], [grande, c2]]) {
    g.strokeStyle = c; g.beginPath();
    for (let x = 0; x <= W; x += p) { g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, H); }
    for (let y = 0; y <= H; y += p) { g.moveTo(0, y + 0.5); g.lineTo(W, y + 0.5); }
    g.stroke();
  }
}
function barraTitulo(g, W, h, txt, color, tam, fondo = "rgba(0,0,0,0.35)") {
  g.fillStyle = fondo; g.fillRect(0, 0, W, h);
  g.fillStyle = color; g.fillRect(0, h - 2, W, 2);
  g.font = `bold ${tam}px ${FUENTE}`; g.textAlign = "left"; g.fillText(txt, 12, h * 0.68);
  g.fillStyle = "#ff5040"; g.beginPath(); g.arc(W - 18, h / 2, h * 0.14, 0, 7); g.fill();
}
/** Una cota de plano: línea con flechas entre a y b, el texto al medio; guias = líneas de referencia desde los puntos. */
function cota(g, a, b, txt, k = 0.5, guias = null) {
  g.strokeStyle = "#ffd28a"; g.fillStyle = "#ffd28a"; g.lineWidth = 1.6;
  if (guias) { g.setLineDash([4, 4]); for (const [i, p] of guias.entries()) { g.beginPath(); g.moveTo(...p); g.lineTo(...(i ? b : a)); g.stroke(); } g.setLineDash([]); }
  g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke();
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  for (const [p, s] of [[a, 1], [b, -1]]) {
    g.beginPath(); g.moveTo(...p);
    g.lineTo(p[0] + s * 14 * Math.cos(ang - 0.35), p[1] + s * 14 * Math.sin(ang - 0.35));
    g.lineTo(p[0] + s * 14 * Math.cos(ang + 0.35), p[1] + s * 14 * Math.sin(ang + 0.35)); g.fill();
  }
  const m = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  g.font = `bold 22px ${FUENTE}`; const w = g.measureText(txt).width;
  g.fillStyle = "#123a66"; g.fillRect(m[0] - w / 2 - 6, m[1] - 15, w + 12, 26);
  g.fillStyle = "#ffd28a"; g.textAlign = "center"; g.fillText(txt, m[0], m[1] + 6); g.textAlign = "left";
}
