// =====================================================================
// UN VUELO SIN PANTALLA: la física del dron armado, la batería, la radio, las tomas del pedido y su calificación.
// Es lo mismo que pasa en vuelo.js (que hereda de esta clase y le agrega lo 3D, el video y las fotos), así que la
// flota (flota.js) vuela los trabajos con las mismas cuentas que un vuelo que miras: nada de dados.
//
//   opts: { stats, pedido, piloto: "yo" | "ia", policy, seed, onToast(msg, ms) }
//   paso() = un paso de 1/50 s · correr() = hasta que termine (sin pantalla) · resultado = lo que da finish()
// =====================================================================
import { Level, Flight, CONTROL_HZ, filmQuality } from "../game/sim.js";
import { levelDict } from "../game/worlds.js";
import { paramsFisica, potencia, BATERIA_USABLE } from "./parts.js";
import { mundoLugar } from "./lugares.js";
import { estrellasDe } from "./partida.js";
import { t } from "./i18n.js";

export const FOTO_CLIC = 0.5;     // s: la foto se califica con el último medio segundo quieto (env.py FOTO_CLIC)
export const TOMA_OK = 0.5;       // calidad media para que una toma cuente (drone_rl/env.py FILM_OK)
export const NOMBRE_TOMA = { fija: () => t("fija"), orbita: () => t("órbita"), revelar: () => t("revelar"), seguir: () => t("seguir") };
export const IA_MAX_S = 150;      // la IA se rinde y vuelve a la base después de esto (o con poca batería)

export class MisionSim {
  constructor(opts) {
    this.o = opts;
    const pedido = opts.pedido;
    const casa = mundoLugar(pedido?.lugar || "casa", pedido);
    this.lugar = casa;
    this.subject = casa.subject;
    // el guion del pedido: una lista de tomas (rutas de cámara) que se graban en orden
    this.shots = casa.shots;
    this.k = 0;                                          // toma de ahora
    this.res = this.shots.map((s) => ({ nombre: s.nombre, tipo: s.tipo, n: 0, q: 0, framing: 0, track: 0, flow: 0, steady: 0, lista: false }));
    // fotos (docs/NEGOCIO.md): cada toma es fija y corta; al terminarla se guarda el cuadro de la cámara como foto
    this.foto = ["foto", "inspeccion"].includes(pedido?.tipo);
    this.fotos = [];

    // ---- la física de TU dron ----
    this.st = opts.stats;
    this.p = paramsFisica(opts.stats);
    const ld = levelDict(casa.world, this.shots.length ? [this.shots[0].start()] : []);
    ld.boxes = casa.boxes;
    ld.cylinders = [...ld.cylinders, ...casa.cylinders];
    ld.spheres = [...ld.spheres, ...casa.spheres];
    this.level = new Level(ld);
    this.ia = opts.piloto === "ia";
    this.dead = false;                                   // batería agotada: motores apagados
    const cut = [-1, 0, 0, 0];
    const policy = this.ia ? { act: (obs) => (this.dead ? cut : opts.policy.act(obs)) } : null;
    this.fl = new Flight(this.level, policy, {
      params: this.p, subject: casa.subject, film: true, shot: this.shots[0] || null, seed: opts.seed ?? 1 + Math.floor(Math.random() * 1e6),
      wind: casa.wind || 0,
      pilot: this.ia ? "ia" : (s) => (this.dead ? cut : this.actManual(s, 1 / CONTROL_HZ)),
    }).reset([0, 0, 0], Math.atan2(casa.subject[1], casa.subject[0]));
    this.gimbal = !!opts.stats.gimbal;

    // ---- las soldaduras frías (taller.js): con la vibración del vuelo se pueden soltar. Motor o batería = motores apagados ----
    this.frias = (opts.frias || []).map((f) => ({ ...f, p: f.tipo === "motor" ? 0.006 : f.tipo === "bateria" ? 0.004 : 0 })).filter((f) => f.p);
    this.soltada = null;

    // ---- la radio: más lejos que su alcance, failsafe (aterriza solo donde esté) ----
    this.alcance = opts.stats.alcance_m || 20;
    this.lejosT = 0; this.failsafe = false; this.avisoSenal = false;

    // ---- estado del vuelo ----
    this.prev = this.snap();
    this.prevAtt = [0, 0];
    this.wh = this.st.wh * BATERIA_USABLE;                  // energía que se puede usar (Wh)
    this.used = 0;
    this.rec = false;
    this.recT = 0;
    this.q = { framing: 0, track: 0, flow: 0, steady: 0, q: 0 };
    this.prevYaw = this.fl.state.yaw; this.yawRate = 0;
    this.tookOff = false;
    this.groundT = 0;
    this.toldLow = false;
    this.ended = false;
    this.t = 0;
    this.maxH = 0;
    this.lastVel = [0, 0, 0];
    this.resultado = null;
  }

  // lo que cambia con pantalla (vuelo.js): el piloto a mano, los avisos, grabar el video, la foto
  actManual() { return [-1, 0, 0, 0]; }
  toast(msg, ms) { this.o.onToast?.(msg, ms); }
  toggleRec(on = !this.rec) { if (!this.ended) this.rec = on; }
  capturarFoto() { return null; }

  snap() { const s = this.fl.state; return { pos: s.pos.slice(), roll: s.roll, pitch: s.pitch, yaw: s.yaw }; }
  get battery() { return Math.max(0, 1 - this.used / this.wh); }
  /** La toma de ahora (o null si ya se grabaron todas / vuelo de prueba). */
  get shot() { return this.shots[this.k] || null; }
  get done() { return this.shots.length > 0 && this.k >= this.shots.length; }

  /** Un paso de la simulación (1/50 s). */
  paso() {
    this.prev = this.snap();
    this.lastVel = this.fl.state.vel.slice();
    this.fl.step();
    this.afterStep(1 / CONTROL_HZ);
  }

  /**
   * Vuela hasta que termine, sin pantalla, en tandas para no congelar la página. aviso(fraccion) cuenta cómo va.
   * Devuelve el resultado (el mismo objeto que recibe onEnd en un vuelo con pantalla, sin video).
   */
  async correr(aviso = null, tanda = 1500) {
    const maxPasos = (IA_MAX_S + 60) * CONTROL_HZ;
    for (let n = 0; !this.ended && n < maxPasos; n++) {
      this.paso();
      if (n % tanda === tanda - 1) { aviso?.(Math.min(1, this.t / IA_MAX_S)); await new Promise((r) => setTimeout(r, 0)); }
    }
    if (!this.ended) this.finish({ crash: false, dead: true });
    aviso?.(1);
    return this.resultado;
  }

  afterStep(dt) {
    const fl = this.fl, s = fl.state, sh = this.shot;
    this.t += dt;
    const ang = Math.hypot(s.roll - this.prevAtt[0], s.pitch - this.prevAtt[1]) / dt;
    this.prevAtt = [s.roll, s.pitch];
    const yr = Math.atan2(Math.sin(s.yaw - this.prevYaw), Math.cos(s.yaw - this.prevYaw)) / dt;
    const yawAcc = (yr - this.yawRate) / dt;
    this.prevYaw = s.yaw; this.yawRate = yr;
    // calidad de imagen contra el punto de cámara de la toma (sin toma: contra donde está el dron, solo encuadre)
    const cp = sh ? sh.point() : s.pos, cv = sh && sh.phase === "grabando" ? sh.at(sh.progress)[1] : sh ? [0, 0, 0] : s.vel;
    this.q = filmQuality(s, this.subject, cp, cv, ang, yawAcc, this.gimbal);
    // batería: la potencia crece con el gas
    if (!this.dead) {
      this.used += (potencia(this.st, s.throttle) * dt) / 3600;
      if (this.battery <= 0) {
        this.dead = true;
        if (fl.phase === "aterrizaje") fl.phase = "ruta";
        this.toast(t("¡Batería agotada! Los motores se apagaron."), 3000);
      } else if (this.battery < 0.2 && !this.toldLow) {
        this.toldLow = true;
        this.toast(t("Batería baja (20 %): vuelve a la base"), 3000);
      }
    }
    if (s.pos[2] > 0.3) this.tookOff = true;
    if (!this.dead && this.tookOff && this.frias.length) {
      const f = this.frias.find((x) => Math.random() < x.p * dt);
      if (f) {
        this.dead = true; this.soltada = f;
        if (fl.phase === "aterrizaje") fl.phase = "ruta";
        this.toast(f.tipo === "motor" ? t("¡Se soltó la soldadura fría del motor de {pos}! El dron se cae.", { pos: f.txt }) : t("¡Se soltó la soldadura fría de la batería! Se apagó todo."), 4500);
      }
    }
    this.maxH = Math.max(this.maxH, s.pos[2]);
    // radio: señal según la distancia a la base (donde estás parado con el control)
    const dist = Math.hypot(s.pos[0], s.pos[1], s.pos[2]);
    this.senal = Math.max(0, 1 - dist / this.alcance);
    if (!this.failsafe) {
      if (dist > 0.85 * this.alcance && !this.avisoSenal) { this.avisoSenal = true; this.toast(t("Señal débil: estás llegando al límite de tu radio"), 2500); }
      if (dist < 0.75 * this.alcance) this.avisoSenal = false;
      this.lejosT = dist > this.alcance ? this.lejosT + dt : 0;
      if (this.lejosT > 0.3) {
        this.failsafe = true;
        this.toggleRec(false);
        fl.landOn = [s.pos[0], s.pos[1], 0];
        fl.phase = "aterrizaje";
        this.toast(t("¡Failsafe! Se perdió la señal a {d} m (tu radio llega a {alcance} m): el dron aterriza solo", { d: Math.round(dist), alcance: this.alcance }), 5000);
      }
    }
    // ---- las tomas: graba sola mientras el punto de cámara recorre la ruta ----
    if (sh) {
      const r = this.res[this.k];
      if (sh.phase === "grabando" || (sh.phase === "lista" && !r.lista)) {
        if (!this.rec) { this.toggleRec(true); this.toast(this.foto ? t("📷 {nombre}: ¡quieto!…", { nombre: sh.nombre }) : t("¡Grabando {nombre}! Sigue el punto sin perder el encuadre", { nombre: sh.nombre }), 2200); }
        // una foto vale lo que sale en el clic: el último medio segundo (drone_rl/env.py FOTO_CLIC), no mientras frena
        if (!this.foto || sh.t >= sh.dur - FOTO_CLIC) { r.n++; r.q += this.q.q; r.framing += this.q.framing; r.track += this.q.track; r.flow += this.q.flow; r.steady += this.q.steady; }
      }
      if (sh.phase === "lista" && !r.lista) {
        r.lista = true;
        this.toggleRec(false);
        const qm = r.q / Math.max(r.n, 1);
        if (this.foto) this.fotos.push({ nombre: r.nombre, q: qm, url: this.capturarFoto() });
        this.k++;
        const next = this.shot;
        fl.shot = next; if (next) { fl.toma = next.tipo; next.reset(); }
        this.toast(`${this.foto ? "📷 " : ""}${r.nombre}: ${Math.round(qm * 100)} % ${qm >= TOMA_OK ? "✓" : t("(floja)")} · ` +
          (next ? t("siguiente: {nombre}", { nombre: next.nombre }) : this.foto ? t("¡todas las fotos! Vuelve a la base y aterriza") : t("¡todas las tomas! Vuelve a la base y aterriza")), 3500);
      }
    }
    // la IA: hace las tomas en orden y al terminar (o si no puede: 150 s o poca batería) vuelve a la base
    if (this.ia && !this.dead && fl.phase === "ruta") {
      const giveUp = this.t > IA_MAX_S || this.battery < 0.25;
      if (this.done || giveUp || !this.shots.length) {
        this.toggleRec(false);
        fl.landOn = [0, 0, 0];
        fl.phase = "aterrizaje";
        this.toast(this.done ? t("La IA terminó las tomas: vuelve a la base") : t("La IA no alcanzó: vuelve a la base"), 3000);
      }
    }
    if (this.rec) this.recT += dt;
    // ¿terminó?
    if (fl.phase === "choque") {
      const imp = Math.hypot(...this.lastVel);
      return this.finish({ crash: true, reason: fl.reason, impact: imp });
    }
    if (fl.phase === "aterrizado") return this.finish({ crash: false, failsafe: this.failsafe });
    if (!this.ia && this.tookOff) {
      const grounded = s.pos[2] < 0.02 && Math.hypot(...s.vel) < 0.4 && (s.throttle < 0.2 || this.dead);
      this.groundT = grounded ? this.groundT + dt : 0;
      if (this.groundT > 0.8) {
        const home = Math.hypot(s.pos[0], s.pos[1]) < 2.5;
        if (this.done || !this.o.pedido) return this.finish({ crash: false, home });
        if (this.groundT < 0.8 + dt * 1.5) this.toast(t("Aterrizaste, pero faltan {n} tomas. Despega otra vez (Espacio).", { n: this.shots.length - this.k }), 3500);
        this.tookOff = false;
      }
    }
    if (this.dead && s.pos[2] < 0.02 && Math.hypot(...s.vel) < 0.1 && this.t > 1) return this.finish({ crash: false, dead: true, soldadura: this.soltada?.txt || null });
  }

  /** La calificación: cada toma su calidad media (las que no se grabaron cuentan 0); 75 % tomas + 25 % la cámara. */
  calificar(extra) {
    const tomas = this.res.map((r) => {
      const n = Math.max(r.n, 1);
      return { nombre: r.nombre, tipo: NOMBRE_TOMA[r.tipo]?.() || r.tipo, lista: r.lista, q: r.q / n,
        framing: r.framing / n, track: r.track / n, flow: r.flow / n, steady: r.steady / n };
    });
    const cal = this.st.calidad / 100, nitidez = this.st.nitidez ?? 1;
    const qMedia = tomas.length ? tomas.reduce((a, r) => a + (r.lista ? r.q : 0), 0) / tomas.length : 0;
    const completa = this.done && tomas.every((r) => r.q >= TOMA_OK) && !extra.failsafe;
    const puntaje = tomas.length ? Math.round(100 * (0.75 * qMedia * nitidez + 0.25 * cal)) : 0;
    const estrellas = completa ? estrellasDe(puntaje, this.o.pedido?.estrellas) : 0;
    return {
      soldadura: this.soltada ? this.soltada.txt : null, ...extra, piloto: this.ia ? "ia" : "yo", pedido: this.o.pedido, recT: this.recT, tomas, qMedia, cal, nitidez, puntaje, completa,
      estrellas, fotos: this.fotos, foto: this.foto, t: this.t, bateria: this.battery, maxH: this.maxH,
    };
  }

  finish(extra) {
    if (this.ended) return;
    this.ended = true;
    this.rec = false;
    this.resultado = this.calificar(extra);
  }
}
