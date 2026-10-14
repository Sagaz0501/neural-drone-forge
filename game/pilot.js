// =====================================================================
// PILOTEAR YO: teclado o control de videojuego -> las 4 palancas del dron.
//
// Las mismas 4 palancas que usa la IA: [gas, roll, pitch, yaw] en [-1, 1] (0 de gas = flotar).
// Teclado + ratón: el ratón gira (izquierda/derecha, 360°), Espacio sube, Shift baja, WASD mueve.
// Ayudas opcionales (como en un dron real con GPS/barómetro):
//   - Mantener altura: Espacio / Shift suben y bajan una ALTURA objetivo; al soltar se queda ahí.
//   - Frenar solo:     al soltar avance/lado, el dron se inclina en contra de su velocidad hasta parar.
// =====================================================================
import { P, throttleToAction, yawFrame } from "./sim.js";

export const DEFAULT_CTL = {
  sens: 0.7,          // sensibilidad: qué tanto se inclina / gira con la palanca a fondo
  smooth: 0.45,       // suavizado del teclado (0 = brusco, 1 = muy suave)
  altHold: true,      // mantener altura: Espacio sube, Shift baja, al soltar se queda a esa altura
  mouseYaw: true,     // girar con el ratón
  mouseSens: 0.5,     // sensibilidad del ratón
  brake: true,        // frenar solo al soltar
  mode: 2,            // control de videojuego: modo 2 (gas a la izquierda) o modo 1
  fpvTilt: 25,        // inclinación de la cámara FPV hacia arriba (°), como en los drones de carreras
  fpvFov: 110,        // campo de visión FPV (°)
};

const clip = (x, a = -1, b = 1) => Math.min(Math.max(x, a), b);
const dz = (v) => (Math.abs(v) < 0.08 ? 0 : (v - Math.sign(v) * 0.08) / 0.92);

export function readGamepad() {
  const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
  return pads.find((p) => p.axes && p.axes.length >= 4) || null;
}

/** Palancas crudas [gas, roll, pitch, yaw] del teclado + el control. */
export function rawSticks(keys, ctl) {
  const up = keys.has("Space") || keys.has("ArrowUp"), down = keys.has("ShiftLeft") || keys.has("ShiftRight") || keys.has("ArrowDown");
  let gas = (up ? 1 : 0) - (down ? 1 : 0);
  let yaw = (keys.has("ArrowLeft") ? 1 : 0) - (keys.has("ArrowRight") ? 1 : 0);
  let pitch = (keys.has("KeyW") ? 1 : 0) - (keys.has("KeyS") ? 1 : 0);
  let roll = (keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0);
  const gp = readGamepad();
  if (gp) {
    const [lx, ly, rx, ry] = gp.axes.map(dz);
    if (ctl.mode === 1) { pitch += -ly; yaw += -lx; gas += -ry; roll += rx; }
    else { gas += -ly; yaw += -lx; pitch += -ry; roll += rx; }
  }
  return [clip(gas), clip(roll), clip(pitch), clip(yaw)];
}

export class ManualPilot {
  constructor(ctl, keys) {
    this.ctl = ctl;
    this.keys = keys;
    this.reset();
  }
  reset() {
    this.cmd = [0, 0, 0, 0];
    this.alt = 0;                   // con "mantener altura": empieza en el suelo, Espacio lo sube
    this.sticks = [0, 0, 0, 0];
    this.pendingYaw = 0;            // giro pedido con el ratón que falta hacer (rad)
  }

  /** El ratón se movió dx píxeles: girar ese ángulo (hacia la izquierda = girar a la izquierda). */
  addMouse(dx) {
    const degPerPx = 0.04 + 0.32 * this.ctl.mouseSens;
    this.pendingYaw = clip(this.pendingYaw - (dx * degPerPx * Math.PI) / 180, -2 * Math.PI, 2 * Math.PI);
  }

  /** Lo llama la simulación 50 veces por segundo. */
  act(s, dt = 1 / 50) {
    const c = this.ctl;
    const raw = rawSticks(this.keys, c);
    this.sticks = raw;
    const tau = 0.02 + 0.3 * c.smooth;
    const k = 1 - Math.exp(-dt / tau);
    for (let i = 0; i < 4; i++) this.cmd[i] += (raw[i] - this.cmd[i]) * k;
    const sens = 0.25 + 0.75 * c.sens;
    let roll = this.cmd[1] * sens, pitch = this.cmd[2] * sens;
    // giro: teclas/control + el ángulo que pidió el ratón (sin pasar de 180°/s, lo que falta queda para después)
    const maxStep = P.yawRate * dt;
    const mouseStep = clip(this.pendingYaw, -maxStep, maxStep);
    this.pendingYaw -= mouseStep;
    const yaw = clip(this.cmd[3] * Math.min(1, sens + 0.15) + mouseStep / maxStep);

    // ---- gas ----
    let gas;
    if (c.altHold) {
      const rate = raw[0] > 0 ? 2.0 : 1.6;                       // m/s mientras mantienes Espacio / Shift
      this.alt = clip(this.alt + raw[0] * rate * dt, 0, 12);      // al soltar, la altura objetivo para EN SECO
      const vzDes = clip(raw[0] * rate * (this.alt > 0 && this.alt < 12) + 1.8 * (this.alt - s.pos[2]), -2.6, 2.6);   // + "hacia dónde va"
      const az = 3.2 * (vzDes - s.vel[2]);
      const thr = (P.hover * (1 + az / P.g)) / Math.max(Math.cos(s.roll) * Math.cos(s.pitch), 0.5);
      gas = throttleToAction(clip(thr, 0, 1));
      if (this.alt < 0.05 && s.pos[2] < 0.05) gas = -1;           // aterrizado: motores en mínimo
    } else {
      gas = this.cmd[0] * (0.25 + 0.5 * c.sens);
    }

    // ---- frenar solo: al soltar avance/lado, inclinarse en contra de la velocidad ----
    if (c.brake && Math.abs(raw[1]) < 0.05 && Math.abs(raw[2]) < 0.05 && s.pos[2] > 0.15) {
      const ah = yawFrame([-1.7 * s.vel[0], -1.7 * s.vel[1], 0], s.yaw);
      pitch = clip(Math.atan2(ah[0], P.g) / P.maxAngle, -0.6, 0.6);
      roll = clip(-Math.atan2(ah[1], P.g) / P.maxAngle, -0.6, 0.6);
    }
    return [clip(gas), clip(roll), clip(pitch), clip(yaw)];
  }
}
