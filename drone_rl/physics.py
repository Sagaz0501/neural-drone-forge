"""
Física del quadcopter (modo "angle" / auto-nivelado).

Es el mismo modelo que corre en Blender (blender/drone_sim.py), pero en numpy
puro y sin gráficos, para poder simular miles de pasos por segundo al entrenar.

Convenciones (iguales a Blender):
    - Unidades SI: metros, segundos, kg, radianes.
    - Eje X = frente del dron, Y = izquierda, Z = arriba.
    - Rotación Euler 'XYZ'  ->  R = Rz(yaw) @ Ry(pitch) @ Rx(roll)
    - pitch > 0  = nariz abajo  -> el dron avanza (+X)
    - roll  > 0  = lado derecho abajo -> el dron va a la derecha (-Y)
    - yaw   > 0  = gira a la izquierda (antihorario visto desde arriba)

Acción normalizada (lo que controla el piloto o la IA), todo en [-1, 1]:
    a[0] gas    : -1 = 0 %   ,  0 = gas de hover   ,  +1 = 100 %
                  (centrado en hover: una red recién creada saca ~0, o sea "flotar",
                   en vez de salir disparada; acelera mucho el aprendizaje)
    a[1] roll   : fracción de MAX_ANGLE
    a[2] pitch  : fracción de MAX_ANGLE
    a[3] yaw    : fracción de YAW_RATE
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np


@dataclass
class QuadParams:
    mass: float = 0.6                    # kg
    g: float = 9.81                      # m/s^2
    twr: float = 2.5                     # relación empuje/peso a 100 % gas
    drag: float = 0.03                   # arrastre cuadrático  F = -c * |v| * v
    max_angle: float = np.radians(35)    # inclinación máxima
    yaw_rate: float = np.radians(180)    # rad/s
    att_resp: float = 8.0                # respuesta del control de ángulo (1/s)
    crash_speed: float = 4.0             # m/s de impacto vertical = crash
    radius: float = 0.15                 # radio de colisión del dron (m)

    @property
    def hover_throttle(self) -> float:
        return 1.0 / self.twr

    @staticmethod
    def from_dict(d: dict) -> "QuadParams":
        """La física de un dron armado en el juego (drones/*.json, sección "fisica"; ángulos en grados)."""
        f = d.get("fisica", d)
        return QuadParams(mass=float(f["mass"]), twr=float(f["twr"]), drag=float(f["drag"]),
                          max_angle=np.radians(float(f["max_angle_deg"])), yaw_rate=np.radians(float(f["yaw_rate_deg"])),
                          att_resp=float(f["att_resp"]), crash_speed=float(f["crash_speed"]), radius=float(f["radius"]))

    @staticmethod
    def load(path) -> "QuadParams":
        import json
        from pathlib import Path
        return QuadParams.from_dict(json.loads(Path(path).read_text(encoding="utf-8")))


@dataclass
class QuadState:
    pos: np.ndarray = field(default_factory=lambda: np.zeros(3))
    vel: np.ndarray = field(default_factory=lambda: np.zeros(3))
    roll: float = 0.0
    pitch: float = 0.0
    yaw: float = 0.0
    throttle: float = 0.0

    def copy(self) -> "QuadState":
        return QuadState(self.pos.copy(), self.vel.copy(), self.roll, self.pitch, self.yaw, self.throttle)


def rot_matrix(roll: float, pitch: float, yaw: float) -> np.ndarray:
    """R = Rz(yaw) @ Ry(pitch) @ Rx(roll)  (igual que Euler 'XYZ' de Blender)."""
    cr, sr = np.cos(roll), np.sin(roll)
    cp, sp = np.cos(pitch), np.sin(pitch)
    cy, sy = np.cos(yaw), np.sin(yaw)
    rx = np.array([[1, 0, 0], [0, cr, -sr], [0, sr, cr]])
    ry = np.array([[cp, 0, sp], [0, 1, 0], [-sp, 0, cp]])
    rz = np.array([[cy, -sy, 0], [sy, cy, 0], [0, 0, 1]])
    return rz @ ry @ rx


def yaw_frame(v: np.ndarray, yaw: float) -> np.ndarray:
    """Pasa un vector del mundo al marco 'heading' del dron (gira -yaw en Z)."""
    c, s = np.cos(yaw), np.sin(yaw)
    return np.array([c * v[0] + s * v[1], -s * v[0] + c * v[1], v[2]])


def action_to_throttle(a0: float, p: QuadParams) -> float:
    h = p.hover_throttle
    return h + a0 * (1.0 - h) if a0 >= 0 else h * (1.0 + a0)


def throttle_to_action(thr: float, p: QuadParams) -> float:
    h = p.hover_throttle
    return (thr - h) / (1.0 - h) if thr >= h else thr / h - 1.0


class Wind:
    """Viento: una dirección y fuerza base por intento + ráfagas que cambian solas.

    Las ráfagas son un proceso de Ornstein-Uhlenbeck: un ruido "con memoria" que sube y baja
    suave (como el viento real), con un tiempo típico de `tau` segundos.
    El dron NO siente el viento directamente: solo ve que su velocidad cambia y tiene que corregir.
    """

    def __init__(self, max_speed: float = 0.0, tau: float = 1.5):
        self.max_speed, self.tau = float(max_speed), tau
        self.base = np.zeros(3)
        self.gust = np.zeros(3)

    def reset(self, rng):
        self.gust = np.zeros(3)
        if self.max_speed <= 0:
            self.base = np.zeros(3)
            return self.base
        a = rng.uniform(-np.pi, np.pi)
        self.base = np.array([np.cos(a), np.sin(a), 0.0]) * rng.uniform(0.0, self.max_speed)
        return self.base

    def step(self, dt, rng) -> np.ndarray:
        if self.max_speed <= 0:          # (si lo apagan en vivo, el viento base sigue hasta el próximo intento)
            return self.base + self.gust
        k = dt / self.tau
        sigma = 0.35 * np.linalg.norm(self.base) + 0.15 * self.max_speed      # ráfagas: más fuertes con más viento
        self.gust += -self.gust * k + sigma * np.sqrt(2 * k) * rng.normal(size=3) * np.array([1, 1, 0.3])
        return self.base + self.gust


def step(state: QuadState, action: np.ndarray, dt: float, p: QuadParams,
         wind: np.ndarray | None = None) -> tuple[QuadState, dict]:
    """Avanza la simulación dt segundos. Devuelve (nuevo estado, info).

    wind = velocidad del aire (m/s, mundo). El arrastre depende de la velocidad RELATIVA al aire.
    info["ground_crash"] = True si tocó el suelo demasiado rápido.
    info["grounded"]     = True si está apoyado en el suelo.
    """
    a = np.clip(np.asarray(action, dtype=float), -1.0, 1.0)
    s = state.copy()

    s.throttle = action_to_throttle(a[0], p)
    target_roll = a[1] * p.max_angle
    target_pitch = a[2] * p.max_angle

    grounded = s.pos[2] <= 1e-4
    # en el suelo y sin gas suficiente para despegar: se queda plano
    if grounded and s.throttle < p.hover_throttle * 0.9:
        target_roll = target_pitch = 0.0

    # control de ángulo: el ángulo real persigue al objetivo (filtro de 1er orden)
    k = min(1.0, p.att_resp * dt)
    s.roll += (target_roll - s.roll) * k
    s.pitch += (target_pitch - s.pitch) * k
    if not (grounded and s.throttle < 0.05):
        s.yaw += a[3] * p.yaw_rate * dt
    s.yaw = (s.yaw + np.pi) % (2 * np.pi) - np.pi

    # fuerzas: empuje en el eje Z del cuerpo + gravedad + arrastre (contra el aire)
    thrust = s.throttle * p.twr * p.mass * p.g
    body_z = rot_matrix(s.roll, s.pitch, s.yaw)[:, 2]
    force = body_z * thrust + np.array([0.0, 0.0, -p.mass * p.g])
    v_air = s.vel if wind is None or grounded else s.vel - wind
    force -= p.drag * np.linalg.norm(v_air) * v_air

    # integración semi-implícita de Euler
    s.vel = s.vel + force / p.mass * dt
    s.pos = s.pos + s.vel * dt

    info = {"ground_crash": False, "grounded": False}
    if s.pos[2] < 0.0:
        impact = -s.vel[2]
        s.pos[2] = 0.0
        if impact > p.crash_speed:
            info["ground_crash"] = True
            s.vel[:] = 0.0
        else:
            s.vel[2] = 0.0
            s.vel[:2] *= 0.85        # fricción con el piso
        info["grounded"] = True
    return s, info
