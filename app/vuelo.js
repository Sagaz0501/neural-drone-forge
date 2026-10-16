// =====================================================================
// UN VUELO: el pedido de la casa (o un vuelo de prueba). Física del dron armado (sus piezas), batería,
// la cámara del dron (lo que se graba), la calificación del video y la IA si la pones a grabar.
//
// Cada paso de la simulación (50 por segundo):
//   palancas (tú o la red) -> física (game/sim.js, la misma de Python) -> batería -> calidad de imagen
// Cada cuadro de pantalla: dibuja la vista principal y, en una esquina, la cámara del dron. Mientras
// graba, esa esquina se copia (30 veces por segundo) a un lienzo que MediaRecorder guarda como .webm.
// =====================================================================
import * as THREE from "three";
import { CONTROL_HZ, CAM } from "../game/sim.js";
import { V, makeMaterials, makeSky, makeLights, WorldView, poseDrone, Trail } from "../game/scene.js";
import { ManualPilot } from "../game/pilot.js";
import { potencia } from "./parts.js";
import { buildDrone, disposeDrone } from "./dron3d.js";
import { RutasView } from "./casa.js";
import { mundoLugar } from "./lugares.js";
import { MisionSim, TOMA_OK } from "./mision_sim.js";

export { TOMA_OK };
const VIDEO_RES = { cam_juguete: [426, 240], cam_accion: [640, 360], cam_4k: [960, 540], cam_gimbal2: [960, 540], cam_gimbal: [1280, 720] };
const MIMES = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"];

/** El mundo de cada lugar se arma una vez (pasto, árboles, edificios) y se reusa en cada vuelo. */
const MUNDOS = {};
function mundo(quality, lugar = "casa") {
  const key = `${lugar}|${quality}`;
  if (MUNDOS[key]) return MUNDOS[key];
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xcdd9d4, 0.008);
  makeSky(scene);
  const mats = makeMaterials();
  const lights = makeLights(scene, quality);
  const wv = new WorldView(scene, mats, quality);
  const m = mundoLugar(lugar, null);
  wv.build(m.world);
  scene.add(m.view());
  // la base: plataforma de despegue
  const pad = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.03, 40), new THREE.MeshStandardMaterial({ color: 0x1d2326, roughness: 0.6 }));
  disc.position.y = 0.015;
  disc.receiveShadow = true;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.025, 8, 48), new THREE.MeshStandardMaterial({ color: 0x3ccbff, emissive: 0x3ccbff, emissiveIntensity: 1.2 }));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.035;
  const h = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshBasicMaterial({ map: padTexture(), transparent: true }));
  h.rotation.x = -Math.PI / 2;
  h.position.y = 0.032;
  pad.add(disc, rim, h);
  scene.add(pad);
  // una mesita con la maleta del piloto junto a la base
  const tbl = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.05, 0.5), new THREE.MeshStandardMaterial({ color: 0x55606a, roughness: 0.6 }));
  tbl.position.copy(V(0.8, 2.6, 0.72));
  tbl.castShadow = true;
  scene.add(tbl);
  for (const [x, y] of [[0.5, 2.8], [1.1, 2.8], [0.5, 2.4], [1.1, 2.4]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.72, 6), tbl.material);
    leg.position.copy(V(x, y, 0.36));
    scene.add(leg);
  }
  const case_ = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.12, 0.32), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5 }));
  case_.position.copy(V(0.8, 2.6, 0.81));
  case_.castShadow = true;
  scene.add(case_);
  MUNDOS[key] = { scene, mats, lights, wv, quality, base: m, zona: null, trail: new Trail(scene, 900) };
  return MUNDOS[key];
}

function padTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  g.strokeStyle = "#eaf2ef"; g.lineWidth = 9;
  g.beginPath(); g.arc(64, 64, 52, 0, 7); g.stroke();
  g.fillStyle = "#eaf2ef"; g.font = "700 72px 'Chakra Petch', sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText("H", 64, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Vuelo extends MisionSim {
  /**
   * opts: { quality, cat, build, stats, pedido (o null = vuelo de prueba), piloto: "yo" | "ia", policy, ctl, keys,
   *         onEnd(result), onToast(msg), videoCanvas (canvas 2D donde se dibuja lo que graba la cámara) }
   * La física, la batería, la radio y las tomas son de MisionSim (mision_sim.js, la misma que usa la flota).
   */
  constructor(renderer, opts) {
    super(opts);
    this.r = renderer;
    const M = (this.M = mundo(opts.quality, opts.pedido?.lugar || "casa"));
    this.scene = M.scene;
    if (M.zona) this.scene.remove(M.zona);
    this.rutasView = this.shots.length ? new RutasView(this.shots) : null;   // las rutas (solo las ve el piloto)
    M.zona = this.rutasView ? this.rutasView.group : new THREE.Group();
    this.scene.add(M.zona);
    const ay = new Set(opts.stats.ayudas);
    this.ctl = { ...opts.ctl, altHold: ay.has("altura"), brake: ay.has("frenar") };
    this.manual = new ManualPilot(this.ctl, opts.keys, this.p);

    // ---- el dron en 3D (con sus piezas) ----
    this.drone = buildDrone(opts.build, opts.cat);
    this.drone.scale.setScalar(1.25);
    this.scene.add(this.drone);
    M.trail.reset();

    // ---- cámaras ----
    this.cam = new THREE.PerspectiveCamera(62, 1, 0.03, 900);
    this.dcam = new THREE.PerspectiveCamera((CAM.vfov * 180) / Math.PI, 16 / 9, 0.03, 500);
    this.camMode = "persecucion";
    this.gimbalPitch = -CAM.tilt;
    const [vw, vh] = VIDEO_RES[opts.build.camara] || [640, 360];
    this.vres = [vw, vh];
    this.vc = opts.videoCanvas;
    this.vc.width = vw; this.vc.height = vh;
    this.vctx = this.vc.getContext("2d");

    this.acc = 0;
    this.toldDone = false;
    this.paused = false;
    this.chunks = [];
    this.recorder = null;
  }

  actManual(s, dt) { return this.manual.act(s, dt); }
  capturarFoto() { try { return this.vc.toDataURL("image/jpeg", 0.88); } catch { return null; } }

  // ---------------- grabar ----------------
  toggleRec(on = !this.rec) {
    if (this.ended || on === this.rec) return;
    this.rec = on;
    if (on) this.startRecorder();
    else if (this.recorder?.state === "recording") this.recorder.pause();
  }

  startRecorder() {
    if (this.recorder) { if (this.recorder.state === "paused") this.recorder.resume(); return; }
    if (!window.MediaRecorder || !this.vc.captureStream) return;
    const mime = MIMES.find((m) => MediaRecorder.isTypeSupported?.(m));
    try {
      this.recorder = new MediaRecorder(this.vc.captureStream(30), mime ? { mimeType: mime, videoBitsPerSecond: 3_000_000 } : undefined);
      this.recorder.ondataavailable = (e) => { if (e.data.size) this.chunks.push(e.data); };
      this.recorder.start(500);
    } catch { this.recorder = null; }
  }

  stopRecorder() {
    return new Promise((res) => {
      const r = this.recorder;
      if (!r || r.state === "inactive") { res(this.chunks.length ? new Blob(this.chunks, { type: this.chunks[0].type }) : null); return; }
      r.onstop = () => res(this.chunks.length ? new Blob(this.chunks, { type: r.mimeType || "video/webm" }) : null);
      try { if (r.state === "paused") r.resume(); r.stop(); } catch { res(null); }
    });
  }

  // ---------------- simulación ----------------
  update(dt) {
    if (this.paused || this.ended) return;
    const step = 1 / CONTROL_HZ;
    this.acc += dt;
    let n = 0;
    while (this.acc >= step && n < 12 && !this.ended) {
      this.paso();
      this.acc -= step;
      n++;
      if (n % 2 === 0) this.M.trail.push(this.fl.state.pos);
    }
    if (n >= 12) this.acc = 0;
  }

  async finish(extra) {
    if (this.ended) return;
    super.finish(extra);
    const video = await this.stopRecorder();
    this.o.onEnd({ ...this.resultado, fotos: this.fotos.filter((f) => f.url), video });
  }

  // ---------------- dibujar ----------------
  /** Dónde va la cámara del dron en pantalla (px CSS, igual que #pip en index.html). */
  pipRect() {
    const w = Math.min(400, innerWidth * 0.42), h = (w * 9) / 16;
    return { x: innerWidth - 18 - w, y: 18, w, h };            // y desde abajo (como WebGL)
  }

  render(dt, now) {
    const M = this.M, fl = this.fl, s = fl.state;
    if (M.wv.time) M.wv.time.value += dt;
    const a = this.paused || this.ended ? 1 : Math.min(this.acc * CONTROL_HZ, 1);
    const p = this.prev;
    const lerpA = (x, y) => x + Math.atan2(Math.sin(y - x), Math.cos(y - x)) * a;
    const pos = [0, 1, 2].map((i) => p.pos[i] + (s.pos[i] - p.pos[i]) * a);
    const yaw = lerpA(p.yaw, s.yaw), roll = p.roll + (s.roll - p.roll) * a, pitch = p.pitch + (s.pitch - p.pitch) * a;
    poseDrone(this.drone, pos, roll, pitch, yaw);
    const spin = (6 + 30 * s.throttle) * 2 * Math.PI * dt * (this.paused || this.ended ? 0 : 1);
    for (const pr of this.drone.userData.props) {
      pr.rotation.y += spin * pr.userData.dir;
      pr.userData.disc.visible = s.throttle > 0.05;
      pr.userData.blade.visible = s.throttle < 0.3;
    }
    // el sol sigue al dron (sombras nítidas donde está la acción)
    const focus = V(...pos);
    M.lights.sun.position.copy(focus).add(M.lights.offset);
    M.lights.sun.target.position.copy(focus);
    this.poseDroneCam(pos, roll, pitch, yaw, dt);

    const R = this.r, dpr = R.getPixelRatio(), full = this.camMode === "dron";
    R.shadowMap.autoUpdate = false;
    R.shadowMap.needsUpdate = true;
    // 1) la vista principal
    this.drone.visible = !full;
    M.zona.visible = !!this.o.pedido && !full;
    this.rutasView?.update(this.k, this.q.q, now / 1000);
    M.trail.line.visible = !full;
    R.setViewport(0, 0, innerWidth, innerHeight);
    this.updateMainCam(dt, pos, yaw);
    R.render(this.scene, full ? this.dcam : this.cam);
    // 2) la cámara del dron en la esquina (sin el dron, la zona ni la estela: eso no sale en el video)
    const pr = this.pipRect();
    if (!full) {
      this.drone.visible = false;
      M.zona.visible = false;
      M.trail.line.visible = false;
      R.setScissorTest(true);
      R.setViewport(pr.x, pr.y, pr.w, pr.h);
      R.setScissor(pr.x, pr.y, pr.w, pr.h);
      R.render(this.scene, this.dcam);
      R.setScissorTest(false);
      R.setViewport(0, 0, innerWidth, innerHeight);
    }
    R.shadowMap.autoUpdate = true;
    // 3) grabando: copiar esa imagen al lienzo del video (30 por segundo; copiar cuesta)
    if (this.rec && now - (this.lastCopy || 0) > 32) {
      this.lastCopy = now;
      const H = R.domElement.height, [vw, vh] = this.vres;
      let sx, sy, sw, sh;
      if (full) {                                       // pantalla completa: recorte 16:9 del centro
        sw = R.domElement.width; sh = Math.min(H, (sw * 9) / 16);
        if (sh < (sw * 9) / 16) sw = (sh * 16) / 9;
        sx = (R.domElement.width - sw) / 2; sy = (H - sh) / 2;
      } else {
        sx = pr.x * dpr; sy = H - (pr.y + pr.h) * dpr; sw = pr.w * dpr; sh = pr.h * dpr;
      }
      this.vctx.drawImage(R.domElement, sx, sy, sw, sh, 0, 0, vw, vh);
      this.stampVideo();
    }
  }

  poseDroneCam(pos, roll, pitch, yaw, dt) {
    const off = this.drone.userData.camPos.clone().multiplyScalar(this.drone.scale.x);
    const q = new THREE.Quaternion();
    this.drone.updateMatrixWorld();
    this.drone.userData.body.getWorldQuaternion(q);
    this.dcam.position.copy(V(...pos)).add(off.applyQuaternion(q));
    if (this.gimbal) {
      // el gimbal deja la imagen derecha y apunta la cámara a la altura del sujeto
      const d = [this.subject[0] - pos[0], this.subject[1] - pos[1], this.subject[2] - pos[2]];
      const want = Math.atan2(d[2], Math.hypot(d[0], d[1]));
      this.gimbalPitch += (want - this.gimbalPitch) * Math.min(1, 3 * dt);
      this.dcam.quaternion.setFromEuler(new THREE.Euler(this.gimbalPitch, yaw - Math.PI / 2, 0, "YXZ"));
    } else {
      this.dcam.quaternion.copy(q).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-CAM.tilt, -Math.PI / 2, 0, "YXZ")));
    }
    void roll; void pitch;
  }

  /** Lo que se ve encima del video: la de juguete pone fecha y hora como las cámaras viejas. */
  stampVideo() {
    const g = this.vctx, [w, h] = this.vres, toy = this.o.build.camara === "cam_juguete";
    if (toy) {                                  // viñeta y un poco de ruido
      const grd = g.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, h * 0.85);
      grd.addColorStop(0, "rgba(0,0,0,0)"); grd.addColorStop(1, "rgba(0,0,0,0.45)");
      g.fillStyle = grd; g.fillRect(0, 0, w, h);
    }
    if (!this.rec) return;
    const f = Math.round(h / 16);
    g.font = `600 ${f}px "Chakra Petch", monospace`;
    g.textBaseline = "top";
    const sec = Math.floor(this.recT), tc = `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
    g.fillStyle = "rgba(0,0,0,0.35)";
    g.fillText(`● REC ${tc}`, f * 0.8 + 1, f * 0.6 + 1);
    g.fillStyle = Math.floor(this.recT * 2) % 2 ? "#ff3b30" : "#ffffff";
    g.fillText(`● REC ${tc}`, f * 0.8, f * 0.6);
    if (toy) {
      g.fillStyle = "#ffb23f";
      g.fillText("14 OCT 2026", w - f * 7.2, h - f * 1.6);
    }
  }

  updateMainCam(dt, pos, yaw) {
    const cam = this.cam, k = 1 - Math.exp(-4 * dt), p = V(...pos);
    if (cam.aspect !== innerWidth / innerHeight) { cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); }
    if (this.camMode === "piloto") {
      // parado junto a la base, a la altura de los ojos, siguiendo al dron (con zoom si se aleja)
      const eye = V(-1.2, -2.2, 1.7);
      cam.position.copy(eye);
      const dist = Math.max(eye.distanceTo(p), 0.5);
      const fov = THREE.MathUtils.clamp((2 * Math.atan(2.6 / dist) * 180) / Math.PI, 18, 62);
      cam.fov += (fov - cam.fov) * k;
      cam.updateProjectionMatrix();
      this.look = (this.look || p.clone()).lerp(p, Math.min(1, 8 * dt));
      cam.lookAt(this.look);
      return;
    }
    if (cam.fov !== 62) { cam.fov = 62; cam.updateProjectionMatrix(); }
    let back = 3.4, up = 1.3;
    const L = Math.hypot(back, up), dir = [-Math.cos(yaw) * back / L, -Math.sin(yaw) * back / L, up / L];
    const free = this.level.raycast(pos, [dir], L)[0];
    if (free < L) { const f = Math.max((free - 0.35) / L, 0.15); back *= f; up *= f; }
    const want = V(pos[0] - Math.cos(yaw) * back, pos[1] - Math.sin(yaw) * back, pos[2] + up);
    if (!this.camInit) { cam.position.copy(want); this.camInit = true; }
    cam.position.lerp(want, free < L ? Math.max(k, 0.5) : k);
    cam.lookAt(V(pos[0] + Math.cos(yaw) * 1.5, pos[1] + Math.sin(yaw) * 1.5, pos[2] + 0.2));
  }

  /** Datos para el HUD. */
  hud() {
    const s = this.fl.state, sh = this.shot;
    const watts = potencia(this.st, s.throttle);
    const minLeft = (this.battery * this.wh) / Math.max(watts, 1) * 60;
    const st = sh ? sh.start() : null;
    return {
      t: this.t, alt: s.pos[2], spd: Math.hypot(...s.vel), bat: this.battery, minLeft, dead: this.dead,
      q: this.q, rec: this.rec, recT: this.recT, action: this.fl.action, k: this.k, n: this.shots.length, shot: sh,
      res: this.res, done: this.done, toStart: st ? Math.hypot(st[0] - s.pos[0], st[1] - s.pos[1], st[2] - s.pos[2]) : 0,
      senal: this.senal ?? 1, alcance: this.alcance, failsafe: this.failsafe, viento: this.lugar.wind || 0,
      altTarget: this.ctl.altHold ? this.manual.alt : null, phase: this.fl.phase,
    };
  }

  cycleCam() {
    const order = ["persecucion", "piloto", "dron"];
    this.camMode = order[(order.indexOf(this.camMode) + 1) % order.length];
    return this.camMode;
  }

  dispose() {
    this.scene.remove(this.drone);
    disposeDrone(this.drone);
    this.recorder = null;
  }
}
