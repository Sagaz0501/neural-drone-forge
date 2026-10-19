// =====================================================================
// EL GARAJE: la mesa de trabajo donde se arma el dron (gira sobre un plato), con herramientas,
// repisas y una lámpara. Es el fondo del menú de entrada y la pantalla del taller.
// =====================================================================
import * as THREE from "three";
import { buildDrone, popIn, tickPop, disposeDrone } from "./dron3d.js";
import { modelo } from "./modelos3d.js";
import { t } from "./i18n.js";

function canvasTex(w, h, paint, repeat = [1, 1]) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  paint(c.getContext("2d"), w, h);
  const tt = new THREE.CanvasTexture(c);
  tt.colorSpace = THREE.SRGBColorSpace;
  tt.wrapS = tt.wrapT = THREE.RepeatWrapping;
  tt.repeat.set(...repeat);
  tt.anisotropy = 4;
  return tt;
}

function rnd(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let tt = Math.imul(a ^ (a >>> 15), a | 1); tt ^= tt + Math.imul(tt ^ (tt >>> 7), tt | 61); return ((tt ^ (tt >>> 14)) >>> 0) / 4294967296; };
}

export class Garaje {
  constructor(quality = "media") {
    const S = (this.scene = new THREE.Scene());
    S.background = new THREE.Color(0x1a1c1b);
    S.fog = new THREE.Fog(0x1a1c1b, 9, 18);
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.02, 60);
    this.t = 0;
    this.orbit = 0;
    this.view = "menu";                    // "menu" (lejos, gira) o "taller" (cerca de la mesa)
    const r = rnd(4);

    // ---- piso y paredes ----
    const concrete = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = "#6d6a64"; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(${r() < 0.5 ? "40,38,34" : "150,146,138"},${0.08 + r() * 0.12})`; g.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 3); }
      g.strokeStyle = "rgba(30,28,25,0.35)"; g.lineWidth = 2; g.strokeRect(0, 0, w, h);
    }, [6, 6]);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ map: concrete, roughness: 0.78 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    S.add(floor);
    const brick = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = "#6b625a"; g.fillRect(0, 0, w, h);
      const bh = 32, bw = 64;
      for (let y = 0; y < h; y += bh) for (let x = -bw; x < w; x += bw) {
        const off = (y / bh) % 2 ? bw / 2 : 0, v = 0.7 + r() * 0.35;
        g.fillStyle = `rgb(${Math.round(118 * v)},${Math.round(66 * v)},${Math.round(50 * v)})`;
        g.fillRect(x + off + 2, y + 2, bw - 4, bh - 4);
        for (let i = 0; i < 18; i++) { g.fillStyle = `rgba(${r() < 0.5 ? "30,20,16" : "190,150,120"},${0.08 + r() * 0.1})`; g.fillRect(x + off + 3 + r() * (bw - 8), y + 3 + r() * (bh - 8), 1 + r() * 3, 1 + r() * 2); }
      }
      const sucio = g.createLinearGradient(0, 0, 0, h); sucio.addColorStop(0, "rgba(0,0,0,0)"); sucio.addColorStop(1, "rgba(20,14,10,0.25)");
      g.fillStyle = sucio; g.fillRect(0, 0, w, h);
    }, [5, 2]);
    const wallMat = new THREE.MeshStandardMaterial({ map: brick, roughness: 0.95 });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(20, 6), wallMat);
    back.position.set(0, 3, -3.2);
    back.receiveShadow = true;
    S.add(back);
    const side = new THREE.Mesh(new THREE.PlaneGeometry(10, 6), wallMat);
    side.position.set(-5, 3, 1.8);
    side.rotation.y = Math.PI / 2;
    side.receiveShadow = true;
    S.add(side);

    // ---- mesa de trabajo ----
    const woodTop = canvasTex(1024, 256, (g, w, h) => {
      g.fillStyle = "#6e4526"; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 120; i++) { g.strokeStyle = `rgba(${r() < 0.5 ? "52,28,12" : "150,98,56"},${0.18 + r() * 0.3})`; g.lineWidth = 0.6 + r() * 2.4; g.beginPath(); const y = r() * h; g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + 10 * (r() - 0.5), w * 0.6, y - 10 * (r() - 0.5), w, y + 4 * (r() - 0.5)); g.stroke(); }
      for (let x = 0; x < w; x += 256) { g.fillStyle = "rgba(30,16,6,0.55)"; g.fillRect(x, 0, 2, h); }                         // las tablas
      for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(20,12,6,${0.1 + r() * 0.2})`; g.beginPath(); g.arc(r() * w, r() * h, 1 + r() * 4, 0, 7); g.fill(); }   // manchas y quemones de cautín
    });
    const top = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.08, 1.3), new THREE.MeshPhysicalMaterial({ map: woodTop, roughness: 0.62, clearcoat: 0.35, clearcoatRoughness: 0.35 }));
    top.position.set(0, 0.92, -1.9);
    top.castShadow = top.receiveShadow = true;
    S.add(top);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x2c3a44, roughness: 0.6, metalness: 0.5 });
    for (const x of [-1.5, 1.5]) for (const z of [-2.45, -1.35]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.88, 0.07), legMat);
      leg.position.set(x, 0.44, z); leg.castShadow = true; S.add(leg);
    }
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.04, 1.1), new THREE.MeshStandardMaterial({ color: 0x5e4a36, roughness: 0.9 }));
    shelf.position.set(0, 0.25, -1.9); shelf.receiveShadow = true; S.add(shelf);

    // ---- plato giratorio (ahí va el dron) ----
    this.turn = new THREE.Group();
    this.turn.position.set(0, 0.96, -1.85);
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.44, 0.03, 48), new THREE.MeshStandardMaterial({ color: 0x1d2326, roughness: 0.5 }));
    plate.receiveShadow = true;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.008, 8, 64), new THREE.MeshStandardMaterial({ color: 0xff7a1a, emissive: 0xff7a1a, emissiveIntensity: 2.2 }));
    rim.rotation.x = Math.PI / 2; rim.position.y = 0.016;
    S.add(this.turn);
    const base = new THREE.Group();
    base.position.copy(this.turn.position);
    base.add(plate, rim);
    S.add(base);

    // ---- herramientas y cosas sobre la mesa ----
    const toolMat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, metalness: 0.3 });
    const add = (geo, mat, x, y, z, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.rotation.set(0, ry, rz); o.castShadow = true; S.add(o); return o; };
    this.cautinSimple = [add(new THREE.CylinderGeometry(0.035, 0.04, 0.12, 16), toolMat(0xc7302a), 1.05, 1.02, -1.75),            // cautín (soldador)
      add(new THREE.CylinderGeometry(0.004, 0.004, 0.18, 8), toolMat(0x999999), 1.05, 1.1, -1.75, 0, 0.5)];
    add(new THREE.BoxGeometry(0.26, 0.05, 0.18), toolMat(0x2b5fa8), -1.0, 0.985, -1.6, 0.3);                  // caja de tornillos
    // el multímetro: acostado, con la pantalla y la perilla dibujadas arriba
    const caraMulti = canvasTex(128, 192, (g, w, h) => {
      g.fillStyle = "#f2b705"; g.fillRect(0, 0, w, h);
      g.fillStyle = "#1b1d20"; g.fillRect(10, 10, w - 20, h - 20);
      g.fillStyle = "#9fb59a"; g.fillRect(20, 20, w - 40, 46); g.fillStyle = "#1d2a1c"; g.font = "bold 30px monospace"; g.fillText("0.00", 26, 56);
      g.fillStyle = "#3a3d42"; g.beginPath(); g.arc(w / 2, 118, 30, 0, 7); g.fill(); g.fillStyle = "#e8e8e8"; g.fillRect(w / 2 - 3, 90, 6, 26);
      ["#c7302a", "#111", "#111"].forEach((col, i) => { g.fillStyle = col; g.beginPath(); g.arc(30 + i * 34, 168, 7, 0, 7); g.fill(); });
    });
    const multi = add(new THREE.BoxGeometry(0.1, 0.035, 0.16), [toolMat(0xf2b705), toolMat(0xf2b705), new THREE.MeshStandardMaterial({ map: caraMulti, roughness: 0.5 }), toolMat(0xf2b705), toolMat(0xf2b705), toolMat(0xf2b705)], 0.72, 0.9775, -2.2, -0.35);
    multi.receiveShadow = true;
    for (let i = 0; i < 3; i++) add(new THREE.BoxGeometry(0.12, 0.03, 0.04), toolMat(0x15161a), -1.25 + i * 0.16, 0.975, -2.3, 0.1 * i);   // baterías
    add(new THREE.TorusGeometry(0.05, 0.015, 8, 20), toolMat(0xe04020), -0.62, 0.975, -2.25, 0, Math.PI / 2);    // rollo de cinta
    // hélices sueltas
    for (let i = 0; i < 4; i++) { const h = heliceSuelta(i % 2 ? 0xff7a1a : 0x3c4046); h.position.set(-0.55 + i * 0.06, 0.961 + i * 0.0035, -1.45 + (i % 2) * 0.03); h.rotation.y = 0.4 + i * 0.9; S.add(h); }

    // ---- tablero de herramientas en la pared ----
    const peg = canvasTex(256, 128, (g, w, h) => {
      g.fillStyle = "#a8936c"; g.fillRect(0, 0, w, h);
      g.fillStyle = "rgba(60,45,25,0.6)";
      for (let y = 6; y < h; y += 12) for (let x = 6; x < w; x += 12) { g.beginPath(); g.arc(x, y, 1.6, 0, 7); g.fill(); }
    });
    const board = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.1, 0.03), new THREE.MeshStandardMaterial({ map: peg, roughness: 0.9 }));
    board.position.set(0, 1.85, -3.15);
    board.receiveShadow = true;
    S.add(board);
    const hang = [[-1.0, 0x3a3a3a, 0.36, 0.05], [-0.7, 0xc7302a, 0.3, 0.04], [-0.42, 0x2b5fa8, 0.4, 0.03], [-0.1, 0x777777, 0.5, 0.06], [0.3, 0xf2b705, 0.28, 0.05], [0.65, 0x3a3a3a, 0.42, 0.035], [1.0, 0x2a8a4a, 0.34, 0.05]];
    // destornilladores y alicates colgados: mango de color con su vástago de acero
    const acero = new THREE.MeshStandardMaterial({ color: 0xc8ccd2, metalness: 1, roughness: 0.25 });
    for (const [i, [x, c, l, w]] of hang.entries()) {
      const h = new THREE.Group(); h.position.set(x, 2.08, -3.1); h.rotation.z = ((x * 7) % 0.3) * 0.5;
      const gancho = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.003, 6, 12, Math.PI), acero); gancho.position.y = 0.02; h.add(gancho);
      if (i % 3 === 2) {                               // alicate: dos mangos abiertos y la punta
        for (const sgn of [-1, 1]) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.009, l * 0.6, 10), toolMat(c)); m.position.set(sgn * 0.02, -l * 0.55, 0); m.rotation.z = sgn * 0.12; m.castShadow = true; h.add(m); }
        const punta = new THREE.Mesh(new THREE.BoxGeometry(0.03, l * 0.3, 0.014), acero); punta.position.y = -0.04; h.add(punta);
      } else {                                         // destornillador
        const mango = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.45, w * 0.38, l * 0.42, 14), toolMat(c)); mango.position.y = -l * 0.21; mango.castShadow = true;
        const vastago = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, l * 0.55, 8), acero); vastago.position.y = -l * 0.42 - l * 0.275;
        h.add(mango, vastago);
      }
      S.add(h);
    }
    // repisa con cajas de piezas
    const sh = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.04, 0.35), new THREE.MeshStandardMaterial({ color: 0x5e4a36, roughness: 0.9 }));
    sh.position.set(-3.4, 1.6, -2.95); S.add(sh);
    for (let i = 0; i < 5; i++) {
      const bx = add(new THREE.BoxGeometry(0.3, 0.2 + r() * 0.15, 0.28), new THREE.MeshStandardMaterial({ color: [0xa57a45, 0x8a6338, 0xb48a5a, 0xc9c2b2][i % 4], roughness: 0.9 }), -4.15 + i * 0.38, 1.72, -2.95);
      bx.position.y = 1.62 + bx.geometry.parameters.height / 2;
    }
    // un dron viejo roto en el piso (el que te dio los motores reciclados)
    const old = add(new THREE.BoxGeometry(0.22, 0.04, 0.22), toolMat(0xdddddd), -2.2, 0.02, -1.0, 0.6);
    old.material = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.6 });

    // ---- luz: lámpara colgante cálida + ventana fría ----
    S.add(new THREE.HemisphereLight(0xbfd2e6, 0x3a2e24, 0.28));
    const lamp = new THREE.SpotLight(0xffc98a, 24, 9, 0.8, 0.65, 1.6);
    lamp.position.set(0.2, 3.1, -1.4);
    lamp.target.position.set(0, 0.9, -1.9);
    lamp.castShadow = true;
    const sz = quality === "alta" ? 2048 : 1024;
    lamp.shadow.mapSize.set(sz, sz);
    lamp.shadow.bias = -0.0003;
    lamp.shadow.normalBias = 0.01;
    S.add(lamp, lamp.target);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.22, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0x2f5d50, side: THREE.DoubleSide, roughness: 0.6 }));
    shade.position.set(0.2, 3.15, -1.4);
    S.add(shade);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff1d6).multiplyScalar(4) }));   // brilla (bloom)
    bulb.position.set(0.2, 3.05, -1.4);
    S.add(bulb);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 2, 6), new THREE.MeshBasicMaterial({ color: 0x111111 }));
    cord.position.set(0.2, 4.25, -1.4);
    S.add(cord);
    const win = new THREE.DirectionalLight(0x9fc4ff, 0.7);
    win.position.set(-4, 4, 3);
    S.add(win);
    const fill = new THREE.PointLight(0xff9a5a, 2.2, 6, 2);
    fill.position.set(2.2, 1.6, -0.6);
    S.add(fill);
    // el foco del plato: luz blanca de estudio sobre el dron (es el protagonista) y un contraluz frío que le marca el borde
    const foco = new THREE.SpotLight(0xfff4e6, 5, 4, 0.34, 0.6, 1.4);
    foco.position.set(0.9, 2.5, -0.5);
    foco.target.position.set(0, 0.98, -1.85);
    foco.castShadow = quality !== "baja";
    foco.shadow.mapSize.set(sz, sz);
    foco.shadow.bias = -0.0002; foco.shadow.normalBias = 0.004;
    foco.shadow.camera.near = 0.5; foco.shadow.camera.far = 4;
    S.add(foco, foco.target);
    const contra = new THREE.SpotLight(0x8fb8ff, 10, 5, 0.4, 0.6, 1.2);
    contra.position.set(-0.6, 1.9, -3.0);
    contra.target.position.set(0, 0.98, -1.85);
    S.add(contra, contra.target);
    // la ventana de atrás a la izquierda: vidrio que brilla (azul de noche) con su marco
    const vidrio = canvasTex(128, 96, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#5d86c4"); gr.addColorStop(1, "#1b2c4a");
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = "rgba(10,14,22,0.9)"; for (let x = 0; x < w; x += 9) { const hh = 14 + r() * 30; g.fillRect(x, h - hh, 8, hh); }   // techos de las casas
    });
    const ventana = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.9), new THREE.MeshBasicMaterial({ map: vidrio, color: new THREE.Color(1.6, 1.6, 1.6) }));
    ventana.position.set(-3.1, 2.25, -3.18);
    S.add(ventana);
    const marco = new THREE.MeshStandardMaterial({ color: 0x2a2724, roughness: 0.7 });
    for (const [w, h, x, y] of [[1.42, 0.06, 0, 0.48], [1.42, 0.08, 0, -0.48], [0.06, 1.0, -0.68, 0], [0.06, 1.0, 0.68, 0], [0.04, 0.9, 0, 0], [1.3, 0.04, 0, 0]]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.05), marco); b.position.set(-3.1 + x, 2.25 + y, -3.15); S.add(b);
    }
    // polvo flotando en la luz de la lámpara (solo con calidad media/alta)
    if (quality !== "baja") {
      const n = 260, P = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { const a = r() * 6.28, rr = Math.sqrt(r()) * 0.9, y = 1.05 + r() * 1.9; P.set([Math.cos(a) * rr * (y / 3), y, Math.sin(a) * rr * (y / 3)], i * 3); }
      const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(P, 3));
      const punto = canvasTex(32, 32, (g) => { const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, "rgba(255,230,190,1)"); gr.addColorStop(1, "rgba(255,230,190,0)"); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); });
      this.motas = new THREE.Points(geo, new THREE.PointsMaterial({ map: punto, size: 0.012, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
      this.motas.position.set(0.2, 0, -1.4);
      S.add(this.motas);
    }

    // ---- impresora 3D (atrás a la derecha) y portátil con el configurador (a la izquierda) ----
    this.impresora = makeImpresora();
    this.impresora.position.set(1.12, 0.96, -2.12);
    this.impresora.rotation.y = -0.35;
    S.add(this.impresora);
    this.portatil = makePortatil();
    this.portatil.position.set(-0.78, 0.96, -2.1);
    this.portatil.rotation.y = 0.45;
    S.add(this.portatil);
    this.usb = null;

    this.drone = null;
    this.build = {};
    this.anims = [];                       // animaciones en curso: { t, dur, step(k), done }
    this.fx = [];                          // partículas (chispas, humo, polvo)
    this.yaw = 0;                          // el jugador gira el dron arrastrando (en el banco)
    this.zoom = 1;
    this.flechas = new THREE.Group();      // flechas de sentido de los motores
    this.turn.add(this.flechas);
    // "FRENTE": una flecha en el plato que gira con el dron (la nariz del dron = +x)
    const fm = new THREE.MeshBasicMaterial({ color: 0xff7a1a });
    const punta = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.08, 3), fm);
    punta.rotation.z = -Math.PI / 2; punta.position.set(0.52, 0.03, 0);
    const cola = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.012, 0.025), fm);
    cola.position.set(0.455, 0.03, 0);
    this.turn.add(punta, cola);
  }

  /** Lo que viene de Blender (cuando ya cargó): la estación de soldar del kit (soldador.py) en vez del cilindro rojo. */
  usarModelos() {
    const sol = !this.soldador && modelo("soldador");
    if (!sol) return;
    sol.scale.setScalar(1.7); sol.position.set(0.98, 0.96, -1.62); sol.rotation.y = -0.5;
    this.scene.add(sol); this.soldador = sol;
    for (const o of this.cautinSimple) o.visible = false;
  }

  /** Los reflejos (scene.environment): los metales del dron (motores, tornillos, el ESC) reflejan el garaje.
   *  Se hace una vez con el renderer (PMREM de un cuarto de paneles, como en la mesa). */
  ambiente(renderer) {
    const env = new THREE.Scene(); env.background = new THREE.Color(0x2a221d);
    const panel = (c, k, pos, w, h) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), side: THREE.DoubleSide })); m.position.set(...pos); m.lookAt(0, 0, 0); env.add(m); };
    panel(0xffd2a0, 7, [0.4, 5, 0.6], 2.2, 2.2);        // la lámpara
    panel(0x8fb4ff, 2.2, [-6, 2.5, -4], 3, 2);          // la ventana
    panel(0xfff2e0, 3, [3, 4, 4], 2.5, 2.5);            // el foco del plato
    panel(0x7a4632, 0.6, [0, 1, -6], 12, 6);            // ladrillo
    panel(0x4a4440, 0.5, [0, -4, 0], 12, 12);           // el piso
    const pm = new THREE.PMREMGenerator(renderer);
    this.scene.environment = pm.fromScene(env, 0.04).texture;
    this.scene.environmentIntensity = 0.6;
    pm.dispose();
  }

  /** Pone el dron como lo ve el piloto: la nariz hacia adentro de la pantalla, su derecha a tu derecha. */
  vistaPiloto() {
    const quiero = Math.PI / 2, ahora = this.turn.rotation.y;
    this.yaw = quiero + Math.round((ahora - quiero) / (2 * Math.PI)) * 2 * Math.PI;
  }

  /** Corre una animación: step(k) con k de 0 a 1 en `dur` segundos. Devuelve una promesa. */
  animar(dur, step) {
    return new Promise((done) => this.anims.push({ t: 0, dur, step, done }));
  }

  /** La pieza vuela desde la mesa a su lugar en el dron (el banco: "instalar"). */
  async instalar(slot) {
    const g = this.drone?.userData.slots[slot];
    if (!g) return;
    const from = new THREE.Vector3(0.09, 0.05, 0.09).applyAxisAngle(new THREE.Vector3(0, 1, 0), -this.turn.rotation.y);
    g.visible = true;
    await this.animar(slot === "helices" ? 1.1 : 0.85, (k) => {
      const e = 1 - (1 - k) ** 3, arc = Math.sin(k * Math.PI) * 0.035;
      g.position.set(from.x * (1 - e), from.y * (1 - e) + arc, from.z * (1 - e));
      g.rotation.y = (1 - e) * (slot === "helices" ? 6 : 1.2);
      g.scale.setScalar(0.85 + 0.15 * e);
    });
    g.position.set(0, 0, 0); g.rotation.set(0, 0, 0); g.scale.setScalar(1);
    this.polvo(g, 0x9db3a9, 10);
    sfx("click");
  }

  /** Esconde una ranura (antes de animar su instalación). */
  ocultar(slot) { const g = this.drone?.userData.slots[slot]; if (g) g.visible = false; }

  /** Posición en el mundo de una ranura del dron (para poner chispas, el USB…). */
  dondeEsta(slot) {
    const g = this.drone?.userData.slots[slot] || this.drone;
    const box = new THREE.Box3().setFromObject(g);
    return box.isEmpty() ? this.turn.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.1, 0)) : box.getCenter(new THREE.Vector3());
  }

  /** Partículas: chispas (naranja, rápidas, caen) o humo (gris, sube despacio). */
  particulas(pos, { n = 40, color = 0xffb040, vel = 0.8, sube = -2.5, vida = 0.7, size = 0.012, opacity = 1 } = {}) {
    const g = new THREE.BufferGeometry(), P = new Float32Array(n * 3), V = [];
    for (let i = 0; i < n; i++) {
      P.set([pos.x, pos.y, pos.z], i * 3);
      const d = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.5).normalize().multiplyScalar(vel * (0.4 + Math.random()));
      V.push(d);
    }
    g.setAttribute("position", new THREE.BufferAttribute(P, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ color, size, transparent: true, opacity, depthWrite: false }));
    this.scene.add(pts);
    this.fx.push({ pts, V, t: 0, vida, sube, opacity });
  }
  polvo(obj, color = 0x9db3a9, n = 12) { this.particulas(this.dondeEsta(obj.name || "chasis"), { n, color, vel: 0.15, sube: 0.05, vida: 0.5, size: 0.006, opacity: 0.6 }); }

  /** Se quemó algo: chispas, humo que sube un rato y un "pop". */
  async quemar(slot) {
    const pos = this.dondeEsta(slot);
    sfx("pop");
    this.particulas(pos, { n: 70, color: 0xffc040, vel: 1.1, sube: -3, vida: 0.6 });
    for (let i = 0; i < 6; i++) {
      setTimeout(() => this.particulas(pos.clone().add(new THREE.Vector3(0, 0.02, 0)), { n: 18, color: 0x55575a, vel: 0.08, sube: 0.35, vida: 2.2, size: 0.03, opacity: 0.55 }), i * 260);
    }
    const g = this.drone?.userData.slots[slot];
    g?.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color?.multiplyScalar(0.25); } });
    await this.animar(1.6, () => {});
  }

  /** Enciende: la controladora parpadea y el ESC hace los 3 pitidos de arranque. */
  async encender(ok) {
    const fc = this.dondeEsta("controladora");
    const led = new THREE.PointLight(ok ? 0x47f08a : 0xff5040, 0, 0.6);
    led.position.copy(fc).add(new THREE.Vector3(0, 0.05, 0));
    this.scene.add(led);
    if (ok) sfx("arranque");
    await this.animar(1.4, (k) => { led.intensity = (Math.sin(k * 30) > 0 ? 2.5 : 0.3); });
    this.scene.remove(led);
  }

  /** El cable USB del portátil a la controladora (para flashear). */
  conectarUSB(on = true) {
    if (this.usb) { this.scene.remove(this.usb); this.usb.geometry.dispose(); this.usb = null; }
    if (!on || !this.drone) return;
    const a = this.portatil.localToWorld(new THREE.Vector3(0.17, 0.012, 0.05)), b = this.dondeEsta("controladora");
    const mid = a.clone().lerp(b, 0.5); mid.y -= 0.04;
    const curve = new THREE.CatmullRomCurve3([a, a.clone().lerp(mid, 0.5).add(new THREE.Vector3(0, -0.02, 0)), mid, b.clone().add(new THREE.Vector3(-0.05, 0.02, 0)), b]);
    this.usb = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.004, 6), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 }));
    this.scene.add(this.usb);
    sfx("usb");
  }

  /** Pantalla del portátil: un texto (lo que hace el configurador). */
  pantalla(txt, pct = null) {
    const s = this.portatil.userData.screen, g = s.ctx;
    g.fillStyle = "#0e1a16"; g.fillRect(0, 0, 256, 160);
    g.fillStyle = "#ffbb00"; g.fillRect(0, 0, 256, 18);
    g.fillStyle = "#111"; g.font = "bold 12px monospace"; g.fillText(t("CONFIGURADOR"), 6, 13);
    g.fillStyle = "#cfe"; g.font = "11px monospace";
    String(txt).split("\n").slice(-8).forEach((l, i) => g.fillText(l.slice(0, 40), 6, 34 + i * 14));
    if (pct !== null) { g.strokeStyle = "#47f08a"; g.strokeRect(6, 140, 244, 12); g.fillStyle = "#47f08a"; g.fillRect(8, 142, 240 * pct, 8); }
    s.tex.needsUpdate = true;
  }

  /** Un motor gira (prueba de motores): su campana gira y una flecha muestra el sentido. pos = "FL" | "FR" | "RL" | "RR". */
  async girarMotor(pos, sentido, dur = 1.6) {
    const c = this.esquina(pos);
    if (!c) return;
    const k = this.drone.scale.x;
    const flecha = makeFlecha(sentido === "cw" ? -1 : 1);
    flecha.position.set(c.x * k, 0.05 * k, c.z * k);
    flecha.scale.setScalar(k * 1.4);
    this.flechas.add(flecha);
    sfx("motor", dur);
    await this.animar(dur, (tt) => { flecha.rotation.y += (sentido === "cw" ? -1 : 1) * 0.35; flecha.material.opacity = Math.min(1, tt * 6, (1 - tt) * 6); });
    this.flechas.remove(flecha);
  }
  esquina(pos) {
    const cs = this.drone?.userData.corners;
    if (!cs) return null;
    return cs.find((c) => (c.x > 0) === (pos[0] === "F") && (c.z > 0) === (pos[1] === "R"));
  }

  /** La prueba atada: si todo está bien sube un poco y se queda; si no, se voltea. */
  async pruebaAtada(ok) {
    const d = this.drone;
    if (!d) return;
    sfx("motor", 2.4);
    if (ok) {
      await this.animar(2.4, (k) => { d.position.y = 0.02 + Math.sin(Math.min(1, k * 2) * Math.PI / 2) * 0.12 * (k < 0.85 ? 1 : (1 - k) / 0.15); d.rotation.z = Math.sin(k * 40) * 0.01; for (const p of d.userData.props) p.rotation.y += p.userData.dir * 0.9; });
    } else {
      await this.animar(1.2, (k) => { d.position.y = 0.02 + Math.sin(k * Math.PI) * 0.06; d.rotation.z = k * Math.PI * 0.95; for (const p of d.userData.props) p.rotation.y += p.userData.dir * 0.9; });
      this.particulas(this.dondeEsta("helices"), { n: 30, color: 0xff7a1a, vel: 0.9, sube: -3, vida: 0.6, size: 0.01 });
      sfx("pop");
      await this.animar(0.8, () => {});
      d.rotation.z = 0;
    }
    d.position.y = 0.02;
  }

  /** Imprime una pieza en la impresora 3D: aparece capa por capa. obj = Group con la pieza. */
  async imprimir(obj, dur = 5) {
    const bed = this.impresora.userData.bed, head = this.impresora.userData.head;
    const box = new THREE.Box3().setFromObject(obj), size = box.getSize(new THREE.Vector3());
    const k = 0.26 / Math.max(size.x, size.z, 0.01);
    obj.scale.multiplyScalar(k);
    obj.position.set(0, 0.012, 0);
    const plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
    obj.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.clippingPlanes = [plane]; o.material.clipShadows = true; } });
    bed.add(obj);
    this.imprimiendo = obj;
    const h = size.y * k + 0.012, base = bed.getWorldPosition(new THREE.Vector3()).y;
    sfx("impresora", dur);
    await this.animar(dur, (tt) => {
      const y = 0.012 + h * tt;
      plane.constant = base + y;
      head.position.set(Math.sin(tt * 90) * 0.12, y + 0.03, Math.cos(tt * 67) * 0.1);
    });
    obj.traverse((o) => { if (o.isMesh) o.material.clippingPlanes = []; });
    head.position.set(0, 0.32, 0);
    sfx("listo");
    await this.animar(0.8, () => {});
    bed.remove(obj);
    this.imprimiendo = null;
  }

  /** Llega un pedido de la tienda: una caja cae en la mesa y se abre. */
  async paquete() {
    const caja = new THREE.Group();
    const carton = new THREE.MeshStandardMaterial({ color: 0xb48a5a, roughness: 0.9 });
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.22), carton); b.castShadow = true; caja.add(b);
    const tape = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.005, 0.04), new THREE.MeshStandardMaterial({ color: 0xd8c08a })); tape.position.y = 0.081; caja.add(tape);
    caja.position.set(0.55, 2.2, -1.6);
    this.scene.add(caja);
    sfx("caja");
    await this.animar(0.7, (k) => { caja.position.y = 2.2 - (2.2 - 1.04) * k * k; caja.rotation.y = k * 0.6; });
    await this.animar(1.6, (k) => { caja.scale.setScalar(1 - Math.max(0, k - 0.6) / 0.4 * 0.99); });
    this.scene.remove(caja);
  }

  /** Pone el dron armado con estas piezas en el plato. changed = ranura que acaba de cambiar (anima). */
  setBuild(build, cat, changed = null) {
    if (this.drone) { this.turn.remove(this.drone); disposeDrone(this.drone); }
    this.drone = buildDrone(build, cat);
    this.drone.scale.setScalar(2.2);                   // en la mesa se ve más grande (es chico de verdad)
    this.drone.position.y = 0.02 + (build.camara === "cam_gimbal" || build.camara === "cam_gimbal2" ? 0.1 : 0);
    this.turn.add(this.drone);
    if (changed) popIn(this.drone, changed);
    this.build = { ...build };
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.wide = w / h > 1.1;
  }

  update(dt) {
    this.t += dt;
    if (this.motas) { this.motas.rotation.y += dt * 0.02; this.motas.position.y = Math.sin(this.t * 0.15) * 0.03; }
    if (this.view === "banco") this.turn.rotation.y += (this.yaw - this.turn.rotation.y) * Math.min(1, dt * 8);
    else { this.turn.rotation.y += dt * 0.45; this.yaw = this.turn.rotation.y; }
    for (const a of [...this.anims]) {
      a.t += dt;
      const k = Math.min(1, a.t / a.dur);
      a.step(k);
      if (k >= 1) { this.anims.splice(this.anims.indexOf(a), 1); a.done(); }
    }
    for (const f of [...this.fx]) {
      f.t += dt;
      const P = f.pts.geometry.attributes.position;
      f.V.forEach((v, i) => { v.y += f.sube * dt; P.array[i * 3] += v.x * dt; P.array[i * 3 + 1] += v.y * dt; P.array[i * 3 + 2] += v.z * dt; });
      P.needsUpdate = true;
      f.pts.material.opacity = f.opacity * Math.max(0, 1 - f.t / f.vida);
      if (f.t >= f.vida) { this.scene.remove(f.pts); f.pts.geometry.dispose(); this.fx.splice(this.fx.indexOf(f), 1); }
    }
    if (this.drone) {
      tickPop(this.drone, dt);
      for (const p of this.drone.userData.props) p.userData.disc.visible = false;
    }
    const target = new THREE.Vector3(0, 1.0, -1.85);
    let pos;
    if (this.view === "menu") {
      this.orbit += dt * 0.06;
      pos = new THREE.Vector3(Math.sin(this.orbit) * 2.6 + 0.4, 2.0 + Math.sin(this.t * 0.2) * 0.1, 1.6 + Math.cos(this.orbit) * 0.6);
    } else if (this.view === "banco" || this.view === "imprimir") {
      // el banco: el dron de cerca, a la izquierda (el panel de trabajo a la derecha)
      const z = this.zoom;
      if (this.view === "imprimir") { target.set(1.0, 1.15, -2.1); pos = new THREE.Vector3(0.55, 1.55, -1.2); }
      else {
        target.set(this.wide ? 0.12 : 0, 1.0, -1.85);
        pos = new THREE.Vector3(this.wide ? 0.12 : 0, 1.0 + 1.0 * z, -1.85 + 1.25 * z);
      }
    } else {
      // el taller: la mesa a la derecha de la pantalla (el panel de piezas a la izquierda)
      pos = this.wide ? new THREE.Vector3(-0.55, 1.55, -0.15) : new THREE.Vector3(0, 1.75, -0.2);
      target.set(this.wide ? -0.5 : 0, this.wide ? 1.02 : 0.98, -1.85);
    }
    const k = 1 - Math.exp(-3 * dt);
    this._pos = this._pos ? this._pos.lerp(pos, k) : pos.clone();
    this._tgt = this._tgt ? this._tgt.lerp(target, k) : target.clone();
    this.camera.position.copy(this._pos);
    this.camera.lookAt(this._tgt);
  }
}

// ---------------- cosas del banco ----------------
function makeImpresora() {
  const g = new THREE.Group(), metal = new THREE.MeshStandardMaterial({ color: 0x2b2f33, metalness: 0.6, roughness: 0.4 });
  const add = (geo, mat, x, y, z) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
  add(new THREE.BoxGeometry(0.46, 0.06, 0.42), metal, 0, 0.03, 0);
  for (const x of [-0.21, 0.21]) add(new THREE.BoxGeometry(0.03, 0.46, 0.03), metal, x, 0.29, -0.17);
  add(new THREE.BoxGeometry(0.45, 0.03, 0.03), metal, 0, 0.5, -0.17);
  const bed = add(new THREE.BoxGeometry(0.34, 0.012, 0.32), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.3, metalness: 0.4 }), 0, 0.07, 0.02);
  const head = new THREE.Group();
  const h1 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.05), new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.5 }));
  const noz = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.02, 8), new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.8 }));
  noz.rotation.x = Math.PI; noz.position.y = -0.04;
  head.add(h1, noz);
  head.position.set(0, 0.32, 0);
  bed.add(head);
  const spool = add(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 20), new THREE.MeshStandardMaterial({ color: 0x3ccbff, roughness: 0.6 }), 0.2, 0.56, -0.17);
  spool.rotation.x = Math.PI / 2;
  g.userData = { bed, head };
  return g;
}

function makePortatil() {
  // un portátil gris espacial: teclado dibujado, trackpad, bisel negro y la pantalla que brilla un poco (bloom)
  const g = new THREE.Group(), body = new THREE.MeshStandardMaterial({ color: 0x4a4e55, metalness: 0.75, roughness: 0.32 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.012, 0.235), body); base.position.y = 0.006; base.castShadow = base.receiveShadow = true; g.add(base);
  const kc = document.createElement("canvas"); kc.width = 512; kc.height = 200;
  const k = kc.getContext("2d"); k.fillStyle = "#2b2e33"; k.fillRect(0, 0, 512, 200);
  const filas = [14, 14, 13, 12, 11];
  filas.forEach((n, f) => { const w = 480 / n; for (let i = 0; i < n; i++) { k.fillStyle = "#16181b"; k.fillRect(16 + i * w + 2, 10 + f * 30 + 2, w - 4, 26); } });
  k.fillStyle = "#16181b"; k.fillRect(150, 160, 212, 26);                        // la barra espaciadora
  const kt = new THREE.CanvasTexture(kc); kt.colorSpace = THREE.SRGBColorSpace; kt.anisotropy = 4;
  const teclado = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.117), new THREE.MeshStandardMaterial({ map: kt, roughness: 0.7 }));
  teclado.rotation.x = -Math.PI / 2; teclado.position.set(0, 0.0121, -0.04); g.add(teclado);
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.065), new THREE.MeshStandardMaterial({ color: 0x3f4349, metalness: 0.5, roughness: 0.25 }));
  pad.rotation.x = -Math.PI / 2; pad.position.set(0, 0.0121, 0.07); g.add(pad);
  // la pantalla: canvas de 512 x 320 dibujado en coordenadas de 256 x 160 (pantalla() de siempre)
  const c = document.createElement("canvas"); c.width = 512; c.height = 320;
  const ctx = c.getContext("2d"); ctx.scale(2, 2);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const lid = new THREE.Group(); lid.position.set(0, 0.012, -0.115); lid.rotation.x = -0.28; g.add(lid);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.225, 0.007), body); back.position.set(0, 0.1125, -0.0035); back.castShadow = true; lid.add(back);
  const bisel = new THREE.Mesh(new THREE.PlaneGeometry(0.334, 0.219), new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: 0.25, metalness: 0.2 }));
  bisel.position.set(0, 0.1125, 0.0002); lid.add(bisel);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.316, 0.1975), new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.25, 1.25, 1.25), toneMapped: false }));
  scr.position.set(0, 0.115, 0.0006); lid.add(scr);
  const brillo = new THREE.PointLight(0x7fd0ff, 0.06, 0.35, 2); brillo.position.set(0, 0.12, 0.1); lid.add(brillo);   // la luz de la pantalla en el teclado
  g.userData.screen = { ctx, tex };
  // el escritorio: fondo con degradé, el logo y la barra de tareas
  const gr = ctx.createLinearGradient(0, 0, 256, 160); gr.addColorStop(0, "#0f2a3a"); gr.addColorStop(1, "#1a1030");
  ctx.fillStyle = gr; ctx.fillRect(0, 0, 256, 160);
  ctx.strokeStyle = "rgba(60,203,255,0.18)"; ctx.lineWidth = 0.6;
  for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.arc(128, 70, 14 + i * 9, 0, Math.PI * 2); ctx.stroke(); }
  ctx.fillStyle = "#ff7a1a"; ctx.font = "bold 15px sans-serif"; ctx.textAlign = "center"; ctx.fillText("Neural Drone Forge", 128, 74);
  ctx.fillStyle = "#9fd8ee"; ctx.font = "8px sans-serif"; ctx.fillText(t("Dron Maker · configurador"), 128, 88); ctx.textAlign = "left";
  ctx.fillStyle = "rgba(10,14,20,0.85)"; ctx.fillRect(0, 148, 256, 12);
  ["#ff7a1a", "#3ccbff", "#47f08a", "#ffd23f"].forEach((col, i) => { ctx.fillStyle = col; ctx.fillRect(8 + i * 14, 151, 9, 6); });
  tex.needsUpdate = true;
  return g;
}

/** Una hélice de 2 palas (forma con el borde de ataque redondeado), plana: para dejar sueltas en la mesa. */
function heliceSuelta(color, largo = 0.13) {
  const sh = new THREE.Shape(), L = largo / 2, a = largo * 0.07;
  sh.moveTo(0, -a * 0.45);
  sh.bezierCurveTo(L * 0.35, -a * 1.1, L * 0.85, -a * 0.9, L, -a * 0.15);
  sh.bezierCurveTo(L * 1.02, a * 0.4, L * 0.7, a * 0.55, 0, a * 0.45);
  sh.bezierCurveTo(-L * 0.7, -a * 0.55, -L * 1.02, -a * 0.4, -L, a * 0.15);
  sh.bezierCurveTo(-L * 0.85, a * 0.9, -L * 0.35, a * 1.1, 0, -a * 0.45);
  const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.0025, bevelEnabled: true, bevelThickness: 0.0006, bevelSize: 0.0006, bevelSegments: 1, curveSegments: 10 });
  geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ color, roughness: 0.35, clearcoat: 0.5 }));
  const cubo = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.007, 16), m.material); cubo.position.y = 0.002;
  const g = new THREE.Group(); g.add(m, cubo); m.castShadow = cubo.castShadow = true;
  return g;
}

/** Una flecha circular (sentido de giro de un motor). dir 1 = antihorario visto desde arriba. */
function makeFlecha(dir) {
  // un arco de 270° antihorario (visto de arriba) con la punta al final; para horario, el espejo
  const g = new THREE.TorusGeometry(0.035, 0.003, 6, 24, Math.PI * 1.5);
  const mat = new THREE.MeshBasicMaterial({ color: dir < 0 ? 0x47f08a : 0xffd23f, transparent: true, opacity: 0, depthTest: false });
  const ring = new THREE.Mesh(g, mat);
  ring.rotation.x = -Math.PI / 2;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.009, 0.018, 8), mat);
  tip.position.set(0, -0.035, 0); tip.rotation.z = -Math.PI / 2;
  ring.add(tip);
  const espejo = new THREE.Group(); espejo.add(ring);
  if (dir < 0) espejo.scale.z = -1;
  const o = new THREE.Group(); o.add(espejo); o.material = mat;
  o.renderOrder = 10;
  return o;
}

// ---------------- sonidos (sintetizados: no hay archivos de audio) ----------------
let AC = null;
export function sfx(kind, dur = 1) {
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    const t0 = AC.currentTime, out = AC.createGain();
    out.gain.value = 0.12; out.connect(AC.destination);
    const tono = (f, tt, d, type = "square", v = 1) => { const o = AC.createOscillator(), g = AC.createGain(); o.type = type; o.frequency.value = f; g.gain.setValueAtTime(v, t0 + tt); g.gain.exponentialRampToValueAtTime(0.001, t0 + tt + d); o.connect(g).connect(out); o.start(t0 + tt); o.stop(t0 + tt + d + 0.02); return o; };
    const ruido = (tt, d, v = 1, f = 1200) => { const n = AC.createBufferSource(), b = AC.createBuffer(1, AC.sampleRate * d, AC.sampleRate), a = b.getChannelData(0); for (let i = 0; i < a.length; i++) a[i] = (Math.random() * 2 - 1) * (1 - i / a.length); n.buffer = b; const fl = AC.createBiquadFilter(); fl.frequency.value = f; const g = AC.createGain(); g.gain.value = v; n.connect(fl).connect(g).connect(out); n.start(t0 + tt); };
    if (kind === "click") { tono(1800, 0, 0.04, "square", 0.6); ruido(0, 0.05, 0.5, 3000); }
    else if (kind === "pop") { ruido(0, 0.35, 2.5, 2500); tono(90, 0, 0.3, "sawtooth", 0.8); }
    else if (kind === "arranque") { [523, 659, 784].forEach((f, i) => tono(f, i * 0.16, 0.14, "square", 0.5)); tono(1047, 0.7, 0.25, "square", 0.4); }   // los pitidos del ESC
    else if (kind === "usb") { tono(660, 0, 0.08, "sine"); tono(990, 0.09, 0.12, "sine"); }
    else if (kind === "listo") { tono(784, 0, 0.12, "sine"); tono(1175, 0.12, 0.25, "sine"); }
    else if (kind === "error") { tono(220, 0, 0.18, "sawtooth", 0.6); tono(180, 0.2, 0.3, "sawtooth", 0.6); }
    else if (kind === "caja") { ruido(0.62, 0.15, 1.5, 600); }
    else if (kind === "rasgar") { ruido(0, 0.22, 1.1, 4200); }                     // la cinta de una caja, la viruta
    else if (kind === "trinquete") { for (let i = 0; i < 3; i++) tono(2400 + i * 200, i * 0.045, 0.012, "square", 0.35); }   // el destornillador
    else if (kind === "chispa") { ruido(0, 0.2, 0.6, 7500); }                       // el estaño y el flux chisporroteando
    else if (kind === "motor" || kind === "impresora") {
      const o = AC.createOscillator(), g = AC.createGain();
      o.type = kind === "motor" ? "sawtooth" : "square";
      o.frequency.setValueAtTime(kind === "motor" ? 80 : 300, t0);
      if (kind === "motor") o.frequency.linearRampToValueAtTime(420, t0 + dur * 0.4);
      else for (let i = 0; i < dur * 6; i++) o.frequency.setValueAtTime(260 + ((i * 97) % 160), t0 + i / 6);
      g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(kind === "motor" ? 0.5 : 0.12, t0 + 0.15); g.gain.setValueAtTime(kind === "motor" ? 0.5 : 0.12, t0 + dur - 0.2); g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g).connect(out); o.start(t0); o.stop(t0 + dur + 0.05);
    }
  } catch { /* sin audio */ }
}
