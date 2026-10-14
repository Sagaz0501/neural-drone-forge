// =====================================================================
// PILOTEAR YO: teclado o control de videojuego -> las 4 palancas del dron.
//
// Las mismas 4 palancas que usa la IA: [gas, roll, pitch, yaw] en [-1, 1] (0 de gas = flotar).
// Ayudas opcionales (como en un dron real con GPS/barómetro):
//   - Mantener altura: las flechas ↑ ↓ suben y bajan una ALTURA objetivo; un control PD pone el gas.
//   - Frenar solo:     al soltar avance/lado, el dron se inclina en contra de su velocidad hasta parar.
// =====================================================================
import { P, throttleToAction, yawFrame } from "./sim.js";

export const DEFAULT_CTL = {
  sens: 0.7,          // sensibilidad: qué tanto se inclina / gira con la palanca a fondo
  smooth: 0.45,       // suavizado del teclado (0 = brusco, 1 = muy suave)
  altHold: true,      // mantener altura (despega solo a 1,2 m)
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
  let gas = (keys.has("ArrowUp") ? 1 : 0) - (keys.has("ArrowDown") ? 1 : 0);
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
    this.alt = 1.2;                 // con "mantener altura" despega solo a 1,2 m
    this.sticks = [0, 0, 0, 0];
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
    const yaw = this.cmd[3] * Math.min(1, sens + 0.15);

    // ---- gas ----
    let gas;
    if (c.altHold) {
      this.alt = clip(this.alt + this.cmd[0] * 1.8 * dt, 0, 12);
      const vzDes = clip(1.8 * (this.alt - s.pos[2]), -2.2, 2.2);
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
