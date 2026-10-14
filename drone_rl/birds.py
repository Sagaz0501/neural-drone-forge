"""
Pájaros: presas que vuelan solas por el área (niveles 8-10, "Caza").

Cada pájaro:
  - PASEA: su rumbo, su subir/bajar y su rapidez cambian al azar, suave (ruido con memoria),
    así que nadie (ni el dron) sabe para dónde va a ir;
  - se queda DENTRO del área: cerca del borde, del piso o del techo gira hacia adentro;
  - HUYE: si el dron está a menos de FLEE_R metros, gira para alejarse y acelera;
  - ESQUIVA (si hay columnas o árboles): mira 1.2 m adelante; si ahí hay algo, gira hacia el lado
    libre. Y nunca entra a un obstáculo: si el paso siguiente lo metería, rebota.

El dron NO ve el futuro. De su presa solo sabe dónde está y cómo se movió en la última décima de
segundo (est_vel: posición de ahora menos la de hace 5 pasos), igual que una cámara con un tracker.
Para cazar tiene que aprender a ADELANTARSE: ir a donde el pájaro va a estar, no a donde está.

Todo el azar entra como `noise` (n x 3 números normales). Así el juego del navegador (game/sim.js,
class Flock) hace exactamente las mismas cuentas, y game/test_sim.mjs lo comprueba.
"""
from __future__ import annotations

import numpy as np

AREA_R = 12.0          # radio del área (m), centrada en el spawn
Z_MIN, Z_MAX = 1.5, 6.0
FLEE_R = 4.0           # a esta distancia del dron empieza a huir
CATCH_R = 0.7          # cazado = el dron pasa a menos de esto (m)
EST_STEPS = 5          # velocidad estimada con la posición de hace 5 pasos (0.1 s a 50 Hz)
SWITCH = 0.6           # cambia de presa solo si otra está a menos del 60 % de la distancia
LOOK = 1.2             # esquivar: qué tan adelante mira (m)
LOOK_R = 0.45          # ... y con qué radio
BODY_R = 0.25          # el pájaro nunca entra a menos de esto de un obstáculo
Z_FOREST = (0.9, 2.4)  # en el bosque vuelan DEBAJO de las copas altas (que dejan ~2.6 m libres)


def wrap(a):
    """Ángulo a [-pi, pi)."""
    return a - 2 * np.pi * np.floor((a + np.pi) / (2 * np.pi))


class Flock:
    def __init__(self, n: int = 5, speed: float = 2.0, center=(0.0, 0.0, 0.0), level=None, z=(Z_MIN, Z_MAX)):
        self.n, self.speed = int(n), float(speed)
        self.center = np.asarray(center, dtype=float)
        self.level = level                     # obstáculos a esquivar (None = campo abierto)
        self.z_min, self.z_max = float(z[0]), float(z[1])

    def _hits(self, pts: np.ndarray, r: float) -> np.ndarray:
        if self.level is None:
            return np.zeros(len(pts), dtype=bool)
        return self.level.collides_many(pts, r)

    def reset(self, rng, drone_pos, dt: float = 0.02) -> "Flock":
        """Pájaros repartidos por el área, a 4 m o más del dron, cada uno con un rumbo al azar."""
        n, c = self.n, self.center
        pos = []
        while len(pos) < n:
            r = AREA_R * 0.85 * np.sqrt(rng.uniform())
            a = rng.uniform(-np.pi, np.pi)
            p = c + np.array([r * np.cos(a), r * np.sin(a), 0.0])
            p[2] = rng.uniform(self.z_min + 0.5, self.z_max - 0.5)
            if np.hypot(*(p[:2] - np.asarray(drone_pos)[:2])) >= 4.0 and not self._hits(p[None], 0.8)[0]:
                pos.append(p)
        return self.start(np.array(pos), rng.uniform(-np.pi, np.pi, n), dt)

    def start(self, pos, head, dt: float = 0.02) -> "Flock":
        """Pájaros en posiciones dadas (el juego deja ponerlos con el ratón), volando hacia `head`."""
        self.pos = np.array(pos, dtype=float).reshape(-1, 3)
        self.n = len(self.pos)
        n = self.n
        self.head = np.array(head, dtype=float).reshape(n)
        self.climb = np.zeros(n)                         # m/s hacia arriba
        self.pace = np.ones(n)                           # x velocidad base
        self.vel = np.stack([self.speed * np.cos(self.head), self.speed * np.sin(self.head), np.zeros(n)], axis=1)
        self.alive = np.ones(n, dtype=bool)
        self.dt = dt
        self.hist = [self.pos - self.vel * dt * k for k in range(EST_STEPS, -1, -1)]   # para estimar la velocidad
        return self

    def step(self, dt: float, noise: np.ndarray, drone_pos) -> None:
        live = self.alive
        sq = np.sqrt(dt)
        head = self.head + 1.0 * sq * noise[:, 0]                                   # pasear: rumbo al azar
        climb = np.clip(self.climb - self.climb * dt / 1.0 + 0.7 * sq * noise[:, 1], -1.2, 1.2)
        pace = np.clip(self.pace - (self.pace - 1.0) * dt / 2.0 + 0.35 * sq * noise[:, 2], 0.6, 1.4)

        d_xy = self.pos[:, :2] - self.center[:2]                                     # borde: girar hacia adentro
        out = np.clip((np.hypot(d_xy[:, 0], d_xy[:, 1]) - 0.7 * AREA_R) / (0.3 * AREA_R), 0.0, 1.0)
        head = head + wrap(np.arctan2(-d_xy[:, 1], -d_xy[:, 0]) - head) * np.clip(out * 3.0 * dt, 0.0, 1.0)
        z = self.pos[:, 2]                                                           # piso / techo
        climb = (climb + np.clip((self.z_min + 0.6 - z) / 0.6, 0.0, 1.0) * 4.0 * dt
                 - np.clip((z - (self.z_max - 0.6)) / 0.6, 0.0, 1.0) * 4.0 * dt)

        away = self.pos - np.asarray(drone_pos, dtype=float)                        # huir del dron
        dd = np.maximum(np.linalg.norm(away, axis=1), 1e-6)
        k = np.clip(1.0 - dd / FLEE_R, 0.0, 1.0)
        head = head + wrap(np.arctan2(away[:, 1], away[:, 0]) - head) * np.clip(k * 6.0 * dt, 0.0, 1.0)
        if self.level is not None:                                                  # esquivar: mirar adelante
            ahead = lambda h: self.pos + np.stack([np.cos(h), np.sin(h), np.zeros(self.n)], axis=1) * LOOK
            blocked = self._hits(ahead(head), LOOK_R)
            if blocked.any():
                free_l = ~self._hits(ahead(head + 0.9), LOOK_R)
                free_r = ~self._hits(ahead(head - 0.9), LOOK_R)
                turn = np.where(free_l, 1.0, np.where(free_r, -1.0, 1.0))           # al lado libre (izq. si da igual)
                head = head + np.where(blocked, turn * 5.0 * dt, 0.0)
        spd = self.speed * pace * (1.0 + 0.5 * k)
        v_des = np.stack([spd * np.cos(head), spd * np.sin(head),
                          climb + k * self.speed * 0.8 * away[:, 2] / dd], axis=1)
        vel = self.vel + (v_des - self.vel) * (1.0 - np.exp(-dt / 0.35))           # inercia: cambia suave
        pos = self.pos + vel * dt
        pos[:, 2] = np.clip(pos[:, 2], 0.4, self.z_max + 1.0)
        bump = self._hits(pos, BODY_R)                                               # nunca adentro de algo: rebota
        if bump.any():
            pos = np.where(bump[:, None], self.pos, pos)
            vel = np.where(bump[:, None], -0.5 * vel, vel)
            head = np.where(bump, head + np.pi, head)

        m = live[:, None]                                                            # los cazados se quedan quietos
        self.head = np.where(live, wrap(head), self.head)
        self.climb = np.where(live, climb, self.climb)
        self.pace = np.where(live, pace, self.pace)
        self.vel = np.where(m, vel, 0.0)
        self.pos = np.where(m, pos, self.pos)
        self.hist = self.hist[1:] + [self.pos.copy()]

    @property
    def est_vel(self) -> np.ndarray:
        """Lo que el dron puede saber del movimiento: cuánto se movió en la última décima de segundo."""
        return (self.hist[-1] - self.hist[0]) / (EST_STEPS * self.dt)

    def pick(self, drone_pos, current: int | None) -> int | None:
        """La presa: el pájaro vivo más cercano. Solo cambia si otro está MUCHO más cerca (no duda)."""
        idx = np.flatnonzero(self.alive)
        if len(idx) == 0:
            return current
        d = np.linalg.norm(self.pos[idx] - np.asarray(drone_pos, dtype=float), axis=1)
        j = int(idx[int(np.argmin(d))])
        if current is None or current < 0 or not self.alive[current]:
            return j
        dc = float(np.linalg.norm(self.pos[current] - np.asarray(drone_pos, dtype=float)))
        return j if float(d.min()) < SWITCH * dc else current
