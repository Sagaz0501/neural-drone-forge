// =====================================================================
// EL DRON 3D DEL INICIO: el dron de madera del kit, armado con las MISMAS piezas del juego (blender/piezas/*.py ->
// app/modelos/*.glb, copiadas en media/modelos/; las texturas del chasis y del ESC van en JPEG para pesar menos) y en
// las mismas posiciones que app/dron3d.js buildDrone (DRONES_EJEMPLO.madera). Lo que no es GLB (hélices 5" de 3 palas
// con torsión, separadores, XT60, correa, antena, cables) se hace aquí.
// index.html lo importa cuando el hero se ve; si WebGL o un GLB fallan, queda la foto media/dron_hero.webp.
// Unidades: metros (X adelante, Y arriba, como el juego); el grupo se escala ×7 para la cámara.
// =====================================================================
import * as THREE from "three";
import { GLTFLoader } from "./vendor/loaders/GLTFLoader.js";

export async function iniciar(cv) {
  const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, powerPreference: "high-performance",
    preserveDrawingBuffer: location.search.includes("poster") });
  r.setPixelRatio(Math.min(devicePixelRatio, 2));
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.05;
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
  cam.position.set(0, 2.0, 5.3);
  cam.lookAt(0, -0.42, 0);

  // ---- luz: un "estudio" para los reflejos (PMREM) + llave cálida + bordes naranja y cian ----
  const pmrem = new THREE.PMREMGenerator(r);
  scene.environment = pmrem.fromScene(estudio(), 0.03).texture;
  scene.environmentIntensity = 0.75;
  pmrem.dispose();
  const llave = new THREE.DirectionalLight(0xfff0dc, 2.4);
  llave.position.set(2.5, 6, 3);
  llave.castShadow = true;
  llave.shadow.mapSize.set(1024, 1024);
  llave.shadow.camera.left = llave.shadow.camera.bottom = -2.4;
  llave.shadow.camera.right = llave.shadow.camera.top = 2.4;
  llave.shadow.camera.near = 2; llave.shadow.camera.far = 12;
  llave.shadow.radius = 6; llave.shadow.bias = -0.0005;
  scene.add(llave);
  const bordeN = new THREE.DirectionalLight(0xff8a1f, 3.2); bordeN.position.set(4, 1.2, -4); scene.add(bordeN);
  const bordeC = new THREE.DirectionalLight(0x35c6f4, 3.0); bordeC.position.set(-4.5, 0.8, -3); scene.add(bordeC);
  const bajoC = new THREE.PointLight(0x35c6f4, 6, 5, 2); bajoC.position.set(-1.6, -0.6, 1.4); scene.add(bajoC);
  scene.add(new THREE.HemisphereLight(0x9fd8ff, 0x1a0e04, 0.35));

  // ---- las piezas de Blender ----
  const L = new GLTFLoader();
  const [chasis, motor, esc, camara, bateria] = (await Promise.all(
    ["chasis_madera", "motor_m1806", "esc_4en1", "esp32_cam", "bateria_b3s1300"].map((n) => L.loadAsync(`media/modelos/${n}.glb`))))
    .map((g) => g.scene);

  const dron = new THREE.Group();
  const S = 6.3;
  dron.scale.setScalar(S);
  const flota = new THREE.Group();          // el bob y la inclinación
  flota.add(dron);
  scene.add(flota);

  const R = 0.156;                           // centro -> motor (chasis_madera.py)
  const esquinas = [45, 135, 225, 315].map((g) => { const a = g * Math.PI / 180; return { a, x: Math.cos(a) * R, z: -Math.sin(a) * R }; });
  dron.add(chasis);
  const escG = esc; escG.scale.setScalar(1.05); escG.position.y = 0.017; dron.add(escG);
  const cam3 = camara; cam3.scale.setScalar(0.75); cam3.position.set(0.068, 0.005, 0); dron.add(cam3);
  bateria.position.set(-0.005, 0.05, 0); dron.add(bateria);
  const kMotor = (0.012 * 1.02) / 0.0116;
  for (const c of esquinas) {
    const m = motor.clone(true);
    m.scale.setScalar(kMotor); m.position.set(c.x, 0.014, c.z); m.rotation.y = Math.atan2(c.z, -c.x);
    dron.add(m);
  }
  // los materiales de Blender, afinados para la luz del estudio
  dron.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    const m = o.material, n = m.name || "";
    if (n.startsWith("anodizado") || n === "aluminio_cnc") { m.metalness = 1; m.roughness = 0.28; }
    if (n === "aluminio_negro") { m.metalness = 0.9; m.roughness = 0.35; }
    if (n === "bobinado") { m.metalness = 1; m.roughness = 0.35; }
    if (n === "vidrio_lente") { m.metalness = 0.2; m.roughness = 0.02; m.envMapIntensity = 2.5; }
    if (n === "laton" || n === "oro_enig") { m.metalness = 1; m.roughness = 0.3; }
    if (n === "led_azul") { m.emissive = new THREE.Color(0x2a6bff); m.emissiveIntensity = 3; }
  });

  // ---- lo hecho aquí ----
  const mat = (o) => new THREE.MeshStandardMaterial({ roughness: 0.5, ...o });
  const extra = new THREE.Group(); dron.add(extra);
  const malla = (geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; extra.add(o); return o; };
  // la controladora (fc_baro): placa verde con el STM32 y el barómetro, entre el ESC y la tapa
  const mPcb = mat({ color: 0x1d6b3a, roughness: 0.45 });
  malla(new THREE.BoxGeometry(0.036, 0.0016, 0.036), mPcb, 0, 0.03, 0);
  malla(new THREE.BoxGeometry(0.01, 0.0014, 0.01), mat({ color: 0x111111, roughness: 0.35 }), 0.002, 0.0315, 0);
  malla(new THREE.BoxGeometry(0.004, 0.0015, 0.004), mat({ color: 0xd8d8d8, metalness: 0.8, roughness: 0.3 }), 0.011, 0.0315, 0.01);
  // separadores de latón (M3) y sus tornillos
  const mLaton = mat({ color: 0xc9a14a, metalness: 1, roughness: 0.28 });
  const mTorn = mat({ color: 0x8a8f96, metalness: 1, roughness: 0.3 });
  const geoSep = new THREE.CylinderGeometry(0.0024, 0.0024, 0.028, 6), geoCab = new THREE.CylinderGeometry(0.0028, 0.0028, 0.0018, 16);
  for (const sx of [-0.0153, 0.0153]) for (const sz of [-0.0153, 0.0153]) {
    malla(geoSep, mLaton, sx, 0.0255, sz);
    malla(geoCab, mTorn, sx, 0.0425, sz);
  }
  // el XT60 hembra del ESC enchufado al de la batería, y sus cables (rojo / negro) hasta los pads
  const xt = xt60(); xt.position.set(-0.088, 0.0605, 0); xt.rotation.y = Math.PI; dron.add(xt);
  const mRojo = mat({ color: 0xc81e14, roughness: 0.55 }), mNegro = mat({ color: 0x141414, roughness: 0.55 });
  const tubo = (pts, m, rad) => malla(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), 24, rad, 8), m);
  tubo([[-0.096, 0.0605, 0.0035], [-0.106, 0.056, 0.006], [-0.1, 0.03, 0.008], [-0.06, 0.02, 0.006], [-0.0185, 0.0195, 0.0048]], mNegro, 0.0016);
  tubo([[-0.096, 0.0605, -0.0035], [-0.108, 0.054, -0.006], [-0.102, 0.028, -0.008], [-0.06, 0.021, -0.006], [-0.0185, 0.0195, -0.0048]], mRojo, 0.0016);
  // correa de velcro roja con la hebilla
  dron.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(bateria.getObjectByName("bateria_cuerpo")).applyMatrix4(dron.matrixWorld.clone().invert());
  const bt = bb.getSize(new THREE.Vector3()), bc = bb.getCenter(new THREE.Vector3());
  const correa = new THREE.Mesh(aro(bt.z + 0.003, bt.y + 0.012, 0.0014, 0.004, 0.012), mat({ color: 0xd2321e, roughness: 0.85, map: tejido() }));
  correa.rotation.y = Math.PI / 2; correa.position.set(bc.x - 0.012, bc.y - 0.004, 0); correa.castShadow = true; extra.add(correa);
  malla(new THREE.BoxGeometry(0.014, 0.002, 0.012), mat({ color: 0x1b1b1d, roughness: 0.4 }), bc.x - 0.012, bb.max.y + 0.0018, 0.004);
  // la antena del receptor (ESP-NOW): coaxial negro, punta con termo, inclinada hacia atrás
  const ant = new THREE.Group(); ant.position.set(-0.05, 0.046, -0.024); ant.rotation.set(-0.3, 0, 0.6); dron.add(ant);
  const a1 = new THREE.Mesh(new THREE.CylinderGeometry(0.0011, 0.0011, 0.045, 8), mat({ color: 0x101010, roughness: 0.6 })); a1.position.y = 0.0225; ant.add(a1);
  const a2 = new THREE.Mesh(new THREE.CylinderGeometry(0.0019, 0.0016, 0.018, 10), mat({ color: 0x35c6f4, roughness: 0.4, emissive: 0x0a3040 })); a2.position.y = 0.05; ant.add(a2);
  a1.castShadow = a2.castShadow = true;
  // los cables de los motores: 3 por brazo, pegados al listón hasta el ESC
  const cMot = [0x111111, 0x2050d0, 0xd03030].map((c) => mat({ color: c, roughness: 0.55 }));
  for (const c of esquinas) for (let k = -1; k <= 1; k++) {
    const nx = -Math.sin(c.a) * 0.0024 * k, nz = -Math.cos(c.a) * 0.0024 * k;
    tubo([[c.x * 0.14 + nx, 0.019, c.z * 0.14 + nz], [c.x * 0.35 + nx, 0.0125, c.z * 0.35 + nz], [c.x * 0.7 + nx, 0.0122, c.z * 0.7 + nz], [c.x * 0.86 + nx, 0.016, c.z * 0.86 + nz]], cMot[k + 1], 0.0007);
  }
  // luces: verde adelante, roja atrás (con un halo), y el LED de la controladora
  const halos = [];
  for (const c of esquinas) {
    const col = Math.cos(c.a) > 0 ? 0x2bff6a : 0xff3322;
    malla(new THREE.BoxGeometry(0.008, 0.003, 0.008), new THREE.MeshBasicMaterial({ color: col }), c.x * 0.62, 0.0, c.z * 0.62);
    const h = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo(), color: col, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.8 }));
    h.scale.setScalar(0.028); h.position.set(c.x * 0.62, -0.002, c.z * 0.62); extra.add(h); halos.push(h);
  }

  // ---- hélices 5" de 3 palas (Gemfan 51433 de ojo): adelante naranja, atrás humo cian ----
  const geoPala = pala(0.0635);
  const hub = new THREE.CylinderGeometry(0.0062, 0.0068, 0.0065, 24);
  const disco = discoBorroso();
  const helices = [];
  esquinas.forEach((c, i) => {
    const adelante = Math.cos(c.a) > 0, dir = i % 2 ? -1 : 1;     // 45° y 225° giran igual (props out)
    const color = adelante ? 0xff7a14 : 0x2ab6e8;
    const mP = new THREE.MeshPhysicalMaterial({ color, roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.25, transparent: true, opacity: 0.92,
      side: THREE.DoubleSide, sheen: 0.2, sheenColor: new THREE.Color(color) });
    const p = new THREE.Group();
    p.position.set(c.x, 0.0405, c.z);
    for (let b = 0; b < 3; b++) {
      const pl = new THREE.Mesh(geoPala, mP);
      pl.rotation.y = b * 2 * Math.PI / 3;
      if (dir < 0) pl.scale.z = -1;                                  // la de giro contrario: espejada
      p.add(pl);
    }
    const hb = new THREE.Mesh(hub, mP); p.add(hb);
    const d = new THREE.Mesh(new THREE.CircleGeometry(0.0645, 48), new THREE.MeshBasicMaterial({ map: disco, color, transparent: true, opacity: 0,
      depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    d.rotation.x = -Math.PI / 2; d.position.y = 0.0012;
    dron.add(p); dron.add(d); d.position.add(p.position);
    helices.push({ p, d, dir, mP });
  });

  // centrar: el dron armado, con el centro de masa más o menos en el origen
  const caja = new THREE.Box3().setFromObject(dron);
  dron.position.y = -caja.getCenter(new THREE.Vector3()).y;

  // ---- el piso: la sombra y los aros de la toma (como antes) ----
  const PISO = -1.0;
  const sombra = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), new THREE.ShadowMaterial({ opacity: 0.22 }));
  sombra.rotation.x = -Math.PI / 2; sombra.position.y = PISO; sombra.receiveShadow = true; scene.add(sombra);
  const contacto = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshBasicMaterial({ map: halo(true), color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false }));
  contacto.rotation.x = -Math.PI / 2; contacto.position.y = PISO + 0.002; scene.add(contacto);
  const aro1 = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.008, 8, 160), new THREE.MeshBasicMaterial({ color: 0x35c6f4, transparent: true, opacity: 0.45 }));
  aro1.rotation.x = Math.PI / 2; aro1.position.y = PISO; scene.add(aro1);
  const aro2 = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.006, 8, 120, Math.PI * 1.6), new THREE.MeshBasicMaterial({ color: 0xff8a1f, transparent: true, opacity: 0.55 }));
  aro2.rotation.x = Math.PI / 2; aro2.position.y = PISO; scene.add(aro2);
  const pulso = new THREE.Mesh(new THREE.RingGeometry(0.98, 1, 96), new THREE.MeshBasicMaterial({ color: 0x35c6f4, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
  pulso.rotation.x = -Math.PI / 2; pulso.position.y = PISO + 0.003; scene.add(pulso);
  // polvo que levanta el aire de las hélices
  const NP = 70, pPos = new Float32Array(NP * 3), pVel = [];
  for (let i = 0; i < NP; i++) { pVel.push(Math.random()); }
  const polvoG = new THREE.BufferGeometry(); polvoG.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
  const polvo = new THREE.Points(polvoG, new THREE.PointsMaterial({ size: 0.035, map: halo(), color: 0xffb066, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(polvo);

  // ---- animación ----
  let mx = 0, my = 0;
  addEventListener("pointermove", (e) => { mx = e.clientX / innerWidth - 0.5; my = e.clientY / innerHeight - 0.5; }, { passive: true });
  function tam() {
    const w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return;
    r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix();
  }
  tam(); addEventListener("resize", tam);
  const quieto = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const reloj = new THREE.Clock();
  let t = 0, vel = 0, frames = 0, t0 = performance.now();
  function cuadro() {
    const dt = Math.min(reloj.getDelta(), 0.05);
    t += dt;
    // las hélices arrancan quietas (se ven las palas) y suben de vueltas en ~2 s
    const meta = quieto ? 0.15 : 1;
    vel += (meta - vel) * Math.min(1, dt * 1.1);
    const borr = THREE.MathUtils.smoothstep(vel, 0.25, 0.85);
    for (const h of helices) {
      h.p.rotation.y += h.dir * (vel * 55 + 0.4) * dt;
      h.d.rotation.z -= h.dir * (vel * 9) * dt;
      h.mP.opacity = 0.92 - borr * 0.72;
      h.d.material.opacity = borr * 0.85;
    }
    const sube = vel;                                          // el dron "despega" con las hélices
    flota.position.y = -0.55 * (1 - sube) + Math.sin(t * 1.25) * 0.09 * sube;
    const yaw = quieto ? 0.55 : -0.5 + Math.sin(t * 0.22) * 0.75 + t * 0.06;
    dron.rotation.y += (yaw + mx * 0.9 - dron.rotation.y) * 0.04;
    flota.rotation.x += (my * 0.3 + Math.sin(t * 0.9) * 0.035 * sube - flota.rotation.x) * 0.05;
    flota.rotation.z += (-mx * 0.28 + Math.cos(t * 1.1) * 0.03 * sube - flota.rotation.z) * 0.05;
    // la sombra se achica y aclara cuando sube
    const alto = flota.position.y - PISO;
    contacto.scale.setScalar(0.6 + alto * 0.35); contacto.material.opacity = 0.5 / (0.6 + alto);
    aro1.scale.setScalar(1 + Math.sin(t * 1.25) * 0.02); aro2.rotation.z = t * 0.35;
    const ph = (t * 0.45) % 1; pulso.scale.setScalar(0.3 + ph * 1.25); pulso.material.opacity = (1 - ph) * 0.35 * sube;
    for (let i = 0; i < NP; i++) {
      const v = pVel[i], k = (t * (0.15 + v * 0.2) + v * 7) % 1, a = v * 97 + t * 0.2 * (v - 0.5);
      const rr = 0.3 + k * 1.8;
      pPos[i * 3] = Math.cos(a) * rr; pPos[i * 3 + 1] = PISO + 0.02 + Math.sin(k * Math.PI) * 0.25 * v; pPos[i * 3 + 2] = Math.sin(a) * rr;
    }
    polvoG.attributes.position.needsUpdate = true; polvo.material.opacity = 0.6 * sube;
    for (const h of halos) h.material.opacity = 0.4 + Math.sin(t * 5) * 0.2;
    r.render(scene, cam);
    frames++;
    if (performance.now() - t0 > 1000) { window.__dronFps = frames; frames = 0; t0 = performance.now(); }
  }
  // solo anima cuando se ve y la pestaña está adelante
  let visible = true;
  const correr = () => r.setAnimationLoop(visible && !document.hidden ? cuadro : null);
  new IntersectionObserver((e) => { visible = e[0].isIntersecting; reloj.getDelta(); correr(); }).observe(cv);
  document.addEventListener("visibilitychange", () => { reloj.getDelta(); correr(); });
  correr();
  if (location.search.includes("poster")) window.__dronPNG = () => r.domElement.toDataURL("image/png");
  return r;
}

// ---------------------------------------------------------------------
/** Una pala de hélice 5": perfil de ala (curvo, más grueso adelante), cuerda que crece y se afina hacia la punta,
 *  torsión (paso 4,3": más ángulo cerca del cubo), barrida hacia atrás, punta redondeada. Del eje hacia +X. */
function pala(Rp) {
  const NR = 22, NA = 14, r0 = 0.0058;
  const pos = [], idx = [];
  const paso = 4.3 * 0.0254;
  for (let i = 0; i <= NR; i++) {
    const s = i / NR, rr = r0 + (Rp - r0) * s;
    let cuerda = 0.0075 + 0.012 * Math.sin(Math.min(1, s * 1.6) * Math.PI / 2) - 0.004 * s * s;
    if (s > 0.86) cuerda *= Math.sqrt(Math.max(0.02, 1 - ((s - 0.86) / 0.14) ** 2));   // punta redonda
    const ang = Math.atan(paso / (2 * Math.PI * Math.max(rr, 0.012)));               // torsión
    const esp = 0.0016 * (1 - s * 0.6), barr = 0.006 * s * s;                        // grosor y barrido
    for (let j = 0; j < NA; j++) {
      const u = j / NA * 2 * Math.PI;                                                // contorno del perfil
      const xc = (Math.cos(u) * 0.5) * cuerda;                                       // a lo largo de la cuerda
      const k = 0.5 - Math.cos(u) * 0.5;                                             // 0 adelante .. 1 atrás
      const comba = 0.06 * cuerda * Math.sin(Math.PI * k);
      const yc = comba + Math.sin(u) * esp * (1 - k * 0.7) * 0.5;
      const cz = xc * Math.cos(ang) - yc * Math.sin(ang), cy = xc * Math.sin(ang) + yc * Math.cos(ang);
      pos.push(rr, cy, cz + barr);
    }
  }
  for (let i = 0; i < NR; i++) for (let j = 0; j < NA; j++) {
    const a = i * NA + j, b = i * NA + (j + 1) % NA, c = a + NA, d = b + NA;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

/** El XT60 (hembra): cuerpo amarillo con las esquinas cortadas de un lado, dos bocas doradas. Mira a +X. */
function xt60() {
  const g = new THREE.Group();
  const sh = new THREE.Shape(), w = 0.0158 / 2, h = 0.008 / 2, ch = 0.0025;
  sh.moveTo(-w, -h); sh.lineTo(w, -h); sh.lineTo(w, h - ch); sh.lineTo(w - ch, h); sh.lineTo(-w + ch, h); sh.lineTo(-w, h - ch); sh.closePath();
  const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.016, bevelEnabled: true, bevelSize: 0.0004, bevelThickness: 0.0004, bevelSegments: 2 });
  geo.translate(0, 0, -0.008);
  const cuerpo = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xf2b705, roughness: 0.42 }));
  cuerpo.rotation.y = Math.PI / 2; cuerpo.rotation.z = Math.PI / 2; cuerpo.castShadow = true; g.add(cuerpo);
  const oro = new THREE.MeshStandardMaterial({ color: 0xe0b050, metalness: 1, roughness: 0.25 });
  for (const z of [-0.0036, 0.0036]) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.0021, 0.0021, 0.0012, 16), oro);
    b.rotation.z = Math.PI / 2; b.position.set(0.0085, 0, z); g.add(b);
  }
  return g;
}

/** Un aro rectangular con esquinas redondas (la correa), en el plano XY, de ancho `ancho` en Z. */
function aro(w, h, t, rad, ancho) {
  const rr = (p, W, H, R0) => {
    const x = -W / 2, y = -H / 2;
    p.moveTo(x + R0, y); p.lineTo(x + W - R0, y); p.quadraticCurveTo(x + W, y, x + W, y + R0); p.lineTo(x + W, y + H - R0);
    p.quadraticCurveTo(x + W, y + H, x + W - R0, y + H); p.lineTo(x + R0, y + H); p.quadraticCurveTo(x, y + H, x, y + H - R0);
    p.lineTo(x, y + R0); p.quadraticCurveTo(x, y, x + R0, y);
  };
  const s = new THREE.Shape(); rr(s, w + 2 * t, h + 2 * t, rad + t);
  const hueco = new THREE.Path(); rr(hueco, w, h, rad); s.holes.push(hueco);
  const g = new THREE.ExtrudeGeometry(s, { depth: ancho, bevelEnabled: false, curveSegments: 6 });
  g.translate(0, 0, -ancho / 2);
  return g;
}

/** Tejido del velcro (textura chica). */
function tejido() {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 64; i += 4) { g.fillStyle = "rgba(0,0,0,.18)"; g.fillRect(i, 0, 2, 64); g.fillStyle = "rgba(0,0,0,.08)"; g.fillRect(0, i, 64, 1); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(8, 2); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Un halo redondo (luces, polvo) o, con `sombra`, la sombra de contacto (negro en el centro, se desvanece). */
const HALOS = {};
function halo(sombra = false) {
  const k = sombra ? "s" : "h";
  if (HALOS[k]) return HALOS[k];
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const g = c.getContext("2d"), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  if (sombra) { gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.35, "rgba(255,255,255,.55)"); gr.addColorStop(1, "rgba(255,255,255,0)"); }
  else { gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.25, "rgba(255,255,255,.45)"); gr.addColorStop(1, "rgba(255,255,255,0)"); }
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  return (HALOS[k] = t);
}

/** El disco borroso de una hélice girando: 3 estelas (degradé cónico) que se aclaran hacia el cubo, más el borde de las puntas. */
function discoBorroso() {
  const N = 256, c = document.createElement("canvas"); c.width = c.height = N;
  const g = c.getContext("2d"), m = N / 2;
  if (g.createConicGradient) {
    const cg = g.createConicGradient(0, m, m);
    for (let b = 0; b < 3; b++) {
      const o = b / 3;
      cg.addColorStop(o, "rgba(255,255,255,.55)");
      cg.addColorStop(o + 0.05, "rgba(255,255,255,.22)");
      cg.addColorStop(o + 0.2, "rgba(255,255,255,.06)");
      cg.addColorStop(o + 0.333 - 0.001, "rgba(255,255,255,.03)");
    }
    g.fillStyle = cg;
  } else g.fillStyle = "rgba(255,255,255,.15)";
  g.beginPath(); g.arc(m, m, m - 1, 0, Math.PI * 2); g.fill();
  // más fuerte afuera (las puntas van más rápido y se ven más), hueco en el cubo
  g.globalCompositeOperation = "destination-in";
  const rg = g.createRadialGradient(m, m, 0, m, m, m);
  rg.addColorStop(0, "rgba(0,0,0,0)"); rg.addColorStop(0.12, "rgba(0,0,0,0)"); rg.addColorStop(0.3, "rgba(0,0,0,.6)");
  rg.addColorStop(0.92, "rgba(0,0,0,1)"); rg.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = rg; g.fillRect(0, 0, N, N);
  g.globalCompositeOperation = "source-over";
  g.strokeStyle = "rgba(255,255,255,.35)"; g.lineWidth = 2; g.beginPath(); g.arc(m, m, m * 0.955, 0, Math.PI * 2); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** El "estudio" de los reflejos (como RoomEnvironment): una sala oscura con paneles de luz, uno naranja y uno cian. */
function estudio() {
  const s = new THREE.Scene();
  const sala = new THREE.Mesh(new THREE.BoxGeometry(12, 8, 12), new THREE.MeshBasicMaterial({ color: 0x15181d, side: THREE.BackSide }));
  sala.position.y = 2; s.add(sala);
  const panel = (w, h, col, k, x, y, z, ry = 0, rx = 0) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(k), side: THREE.DoubleSide }));
    p.position.set(x, y, z); p.rotation.set(rx, ry, 0); s.add(p);
  };
  panel(6, 3, 0xffffff, 6, 0, 5.9, 0, 0, Math.PI / 2);         // la caja de luz de arriba
  panel(3, 2.5, 0xfff2e0, 4, 5.9, 2.5, 1.5, -Math.PI / 2);     // la ventana de la derecha
  panel(4, 1.2, 0xff8a1f, 5, -2, 1.2, -5.9);                    // naranja atrás
  panel(1.4, 4, 0x35c6f4, 5, -5.9, 2, -1, Math.PI / 2);         // cian a la izquierda
  panel(5, 0.5, 0xffffff, 2.5, 0, 0.6, 5.9, Math.PI);           // una tira adelante (el brillo del borde)
  return s;
}
