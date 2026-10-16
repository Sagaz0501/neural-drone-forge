"""
La liebre (nivel 18, Persecución): un blanco que vuela solo, RÁPIDO y cambiando de rumbo, y que el dron tiene que alcanzar.

Es como perseguir a otro dron (en el juego, en el modo freestyle, la liebre eres TÚ). A diferencia de los pájaros de la
caza, la liebre no se queda en un área chica: corre por todo el campo (radio 40 m), sube y baja, esquiva columnas y,
cuando el dron está a menos de FLEE_R, HUYE (gira para alejarse y acelera), como haría un piloto perseguido.
El dron sabe dónde está y cómo se mueve (su velocidad), como un piloto que ve al otro dron.
Para alcanzarla tiene que ADELANTARSE: cortar camino en las curvas.

Solo vive en Python (el entrenamiento): en el juego el blanco es el jugador.
"""
from __future__ import annotations

import numpy as np

AREA_R = 40.0
Z_MIN, Z_MAX = 1.2, 8.0
CATCH_R = 0.8           # alcanzada = a menos de esto (m)
FLEE_R = 8.0            # a esta distancia del dron empieza a huir
SPAWN_R = (8.0, 20.0)   # arranca a esta distancia del dron


class Liebre:
    def __init__(self, level=None, speed=(2.0, 8.0)):
        self.level, self.v_rng = level, speed

    def reset(self, rng, drone_pos) -> "Liebre":
        for _ in range(50):                                # un lugar libre (no adentro de una columna)
            a, r = rng.uniform(-np.pi, np.pi), rng.uniform(*SPAWN_R)
            p = np.asarray(drone_pos, dtype=float) + np.array([r * np.cos(a), r * np.sin(a), 0.0])
            p[2] = rng.uniform(Z_MIN + 0.5, 4.0)
            if self.level is None or not self.level.collides(p, 1.0):
                break
        self.pos = p
        self.head = rng.uniform(-np.pi, np.pi)
        self.turn = 0.0                                   # rad/s, con memoria (curvas suaves)
        self.speed = rng.uniform(*self.v_rng)
        self.v_target = self.speed
        self.vz = 0.0
        self.vel = np.zeros(3)
        return self

    def step(self, dt, rng, drone_pos=None):
        self.turn += (-0.8 * self.turn + rng.normal(0, 1.6)) * dt * 3       # Ornstein-Uhlenbeck en el giro
        self.turn = float(np.clip(self.turn, -2.0, 2.0))
        if rng.random() < dt * 0.4:                                        # cada ~2,5 s cambia de ritmo
            self.v_target = rng.uniform(*self.v_rng)
        self.speed += (self.v_target - self.speed) * min(1.0, dt * 1.5)
        self.vz += (-1.5 * self.vz + rng.normal(0, 2.0)) * dt
        p = self.pos
        r = float(np.hypot(p[0], p[1]))
        if r > AREA_R * 0.8:                                               # el borde: volver hacia el centro
            want = np.arctan2(-p[1], -p[0])
            self.turn += np.arctan2(np.sin(want - self.head), np.cos(want - self.head)) * dt * 4
        if drone_pos is not None:                                          # el dron cerca: huir (y acelerar)
            d = p[:2] - np.asarray(drone_pos, dtype=float)[:2]
            if float(np.hypot(d[0], d[1])) < FLEE_R:
                want = np.arctan2(d[1], d[0]) + rng.normal(0, 0.5)
                self.turn += np.arctan2(np.sin(want - self.head), np.cos(want - self.head)) * dt * 6
                self.v_target = self.v_rng[1]
        if self.level is not None:                                         # columnas: mirar 2 m adelante y esquivar
            ahead = p + 2.0 * np.array([np.cos(self.head), np.sin(self.head), 0.0])
            if self.level.collides(ahead, 0.6):
                self.turn = 2.0 if self.turn >= 0 else -2.0
        self.head += self.turn * dt
        if p[2] < Z_MIN + 0.3:
            self.vz = abs(self.vz) + 0.5
        elif p[2] > Z_MAX - 0.3:
            self.vz = -abs(self.vz) - 0.5
        self.vz = float(np.clip(self.vz, -2.0, 2.0))
        self.vel = np.array([self.speed * np.cos(self.head), self.speed * np.sin(self.head), self.vz])
        nxt = p + self.vel * dt
        if self.level is not None and self.level.collides(nxt, 0.3):     # nunca entra a una columna
            self.head += np.pi / 2
            self.vel = np.zeros(3)
            nxt = p
        self.pos = nxt
