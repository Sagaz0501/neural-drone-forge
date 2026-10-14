"""
Entorno Gymnasium: el "videojuego" donde la IA aprende a volar.

Cada paso (50 por segundo) la IA:
    1. recibe una OBSERVACIÓN (24 números: lo que "siente" el dron),
    2. elige una ACCIÓN (4 números: gas, roll, pitch, yaw),
    3. recibe una RECOMPENSA (un número: qué tan bien lo hizo).
El entrenamiento (PPO) ajusta la red neuronal para maximizar la recompensa total.

Currículum (de fácil a difícil), parámetro `stage`:
    0 hover        : despegar y quedarse quieto 1 s a 1.5 m sobre el spawn
    1 goal_fixed   : ir a una meta fija (5, 0, 2)
    2 goal_random  : meta aleatoria a 3-8 m
    3 obstacles    : meta aleatoria con columnas en el camino
    4 multi_goal   : 3 metas seguidas con columnas
    5 circuit      : circuito de 4 aros, 2 vueltas (8 pasadas en orden)
O un nivel fijo hecho en Blender: DroneEnv(level_path="levels/mi_nivel.json")
"""
from __future__ import annotations

import json
from pathlib import Path

import gymnasium as gym
import numpy as np
from gymnasium import spaces

from .level import Level, random_goal, random_pillars
from .physics import QuadParams, QuadState, step, yaw_frame

STAGES = {0: "hover", 1: "goal_fixed", 2: "goal_random", 3: "obstacles", 4: "multi_goal", 5: "circuit"}

# Qué cuenta como éxito en cada misión (texto en drone_rl/missions.json, que también lee Blender).
# OJO: la IA no lee esto; solo "siente" la recompensa. Esto es para nosotros.
_M = json.loads((Path(__file__).with_name("missions.json")).read_text(encoding="utf-8"))
MISSIONS = {int(k): v for k, v in _M.items() if k.isdigit()}
LEVEL_MISSION = _M["level"]

CIRCUIT = [np.array(g, dtype=float) for g in ((6, 0, 2), (6, 6, 3), (0, 6, 2), (0, 0, 1.5))]
CIRCUIT_LAPS = 2

# Nombre de cada una de las 24 entradas de la red (para verlas en Blender)
OBS_LABELS = ["meta adelante", "meta izquierda", "meta arriba", "distancia",
              "vel adelante", "vel izquierda", "vel arriba", "roll", "pitch", "altura",
              "gas anterior", "roll anterior", "pitch anterior", "yaw anterior",
              "sensor 0°", "sensor 45°", "sensor 90°", "sensor 135°", "sensor 180°",
              "sensor 225°", "sensor 270°", "sensor 315°", "sensor arriba", "sensor abajo"]
ACT_LABELS = ["gas", "roll", "pitch", "yaw"]

# 8 rayos horizontales (cada 45°) + 1 arriba + 1 abajo, en el marco 'heading' del dron
_H = [np.array([np.cos(a), np.sin(a), 0.0]) for a in np.radians(np.arange(0, 360, 45))]
RAY_DIRS_LOCAL = np.array(_H + [np.array([0, 0, 1.0]), np.array([0, 0, -1.0])])
RAY_LEN = 5.0          # alcance del sensor (m)
OBS_SCALE = 10.0       # metros/velocidades se dividen por esto para quedar ~[-1, 1]

# Pesos de la recompensa. Se pueden cambiar en vivo desde Blender (Drone Lab):
# todos los entornos comparten el mismo dict, así que un cambio aplica a todos los drones.
DEFAULT_REWARD = {
    "progress": 2.0,     # por metro que se acerca a la meta
    "goal": 10.0,        # al llegar a una meta
    "crash": 10.0,       # castigo al chocar (se resta)
    "time": 0.01,        # costo por paso (apura a la IA)
    "smooth": 0.05,      # castigo por cambios bruscos de palancas
    "tilt": 0.01,        # castigo por inclinarse
    "near": 0.3,         # solo hover: premio continuo por estar cerca de la meta
}


class DroneEnv(gym.Env):
    metadata = {"render_modes": []}

    def __init__(self, stage: int = 0, level_path: str | None = None, params: QuadParams | None = None,
                 control_hz: int = 50, physics_substeps: int = 2, max_seconds: float | None = None,
                 goal_radius: float = 0.5, reward: dict | None = None):
        super().__init__()
        self.stage = stage
        self.fixed_level = Level.load(level_path) if level_path else None
        self.p = params or QuadParams()
        self.dt = 1.0 / control_hz
        self.substeps = physics_substeps
        self.goal_radius = goal_radius
        self.rw = reward if reward is not None else dict(DEFAULT_REWARD)
        mission = LEVEL_MISSION if level_path else MISSIONS[stage]
        self.max_seconds = max_seconds or float(mission["tiempo"])
        self.max_steps = int(self.max_seconds * control_hz)
        self.hold_steps = int(1.0 * control_hz) if (stage == 0 and not level_path) else 0

        self.action_space = spaces.Box(-1.0, 1.0, shape=(4,), dtype=np.float32)
        n_obs = 3 + 1 + 3 + 2 + 1 + 4 + len(RAY_DIRS_LOCAL)        # = 24
        self.observation_space = spaces.Box(-3.0, 3.0, shape=(n_obs,), dtype=np.float32)

    # ------------------------------------------------------------------
    def _make_level(self) -> Level:
        if self.fixed_level is not None:
            return self.fixed_level
        rng = self.np_random
        lv = Level(name=STAGES[self.stage])
        sp = lv.spawn
        if self.stage == 0:
            lv.goals = [sp + np.array([0, 0, 1.5])]
        elif self.stage == 1:
            lv.goals = [sp + np.array([5.0, 0.0, 2.0])]
        elif self.stage in (2, 3):
            lv.goals = [random_goal(rng, sp)]
        elif self.stage == 5:
            lv.goals = [sp + g for g in CIRCUIT] * CIRCUIT_LAPS
        else:
            g, pts = [], sp
            for _ in range(3):
                pts = random_goal(rng, pts, r_min=3, r_max=6)
                pts[2] = np.clip(pts[2], 1.0, 5.0)
                g.append(pts.copy())
            lv.goals = g
        if self.stage in (3, 4):
            lv.box_min, lv.box_max = random_pillars(rng, sp, lv.goals)
        return lv

    def reset(self, *, seed=None, options=None):
        super().reset(seed=seed)
        self.level = self._make_level()
        self.state = QuadState(pos=self.level.spawn.copy())
        # pequeño yaw aleatorio para que no memorice una sola orientación
        if self.fixed_level is None:
            self.state.yaw = float(self.np_random.uniform(-np.pi, np.pi)) if self.stage >= 2 else 0.0
        self.goal_idx = 0
        self.hold = 0
        self.steps = 0
        self.prev_action = np.zeros(4)
        self.prev_dist = self._goal_dist()
        return self._obs(), {}

    # ------------------------------------------------------------------
    def _goal(self) -> np.ndarray:
        return self.level.goals[min(self.goal_idx, len(self.level.goals) - 1)]

    def _goal_dist(self) -> float:
        return float(np.linalg.norm(self._goal() - self.state.pos))

    def _rays(self) -> np.ndarray:
        s = self.state
        c, sn = np.cos(s.yaw), np.sin(s.yaw)
        rz = np.array([[c, -sn, 0], [sn, c, 0], [0, 0, 1]])
        dirs = RAY_DIRS_LOCAL @ rz.T              # rayos girados con el dron (solo yaw)
        return self.level.raycast(s.pos, dirs, RAY_LEN)

    def _obs(self) -> np.ndarray:
        s = self.state
        rel = yaw_frame(self._goal() - s.pos, s.yaw)
        dist = np.linalg.norm(rel)
        vel_h = yaw_frame(s.vel, s.yaw)
        obs = np.concatenate([
            np.clip(rel / OBS_SCALE, -2, 2),                 # 3: dónde está la meta (relativa)
            [min(dist / OBS_SCALE, 2.0)],                    # 1: distancia a la meta
            np.clip(vel_h / OBS_SCALE, -2, 2),               # 3: velocidad
            [s.roll / self.p.max_angle, s.pitch / self.p.max_angle],   # 2: inclinación
            [s.pos[2] / OBS_SCALE],                          # 1: altura
            self.prev_action,                                # 4: acción anterior
            self._rays() / RAY_LEN,                          # 10: sensores (1 = libre)
        ])
        return obs.astype(np.float32)

    # ------------------------------------------------------------------
    def step(self, action):
        action = np.clip(np.asarray(action, dtype=float), -1, 1)
        ground_crash = False
        for _ in range(self.substeps):
            self.state, info = step(self.state, action, self.dt / self.substeps, self.p)
            ground_crash |= info["ground_crash"]
        self.steps += 1

        pos = self.state.pos
        hit_obstacle = self.level.collides(pos, self.p.radius)
        oob = self.level.out_of_bounds(pos)
        crashed = ground_crash or hit_obstacle or oob

        dist = self._goal_dist()
        # ---------- recompensa ----------
        rw = self.rw
        reward = rw["progress"] * (self.prev_dist - dist)                  # avanzar hacia la meta
        reward -= rw["smooth"] * float(np.sum((action - self.prev_action) ** 2))   # movimientos suaves
        reward -= rw["time"]                                               # el tiempo cuesta
        tilt = abs(self.state.roll) + abs(self.state.pitch)
        reward -= rw["tilt"] * tilt
        self.prev_dist = dist
        self.prev_action = action

        terminated, success = False, False
        if self.hold_steps:
            # tarea de "quedarse": premio continuo por estar cerca (más cerca = más premio)
            reward += rw["near"] * np.exp(-dist)
        if dist < self.goal_radius:
            if self.hold_steps:
                self.hold += 1
                reward += 0.2 - 0.1 * float(np.linalg.norm(self.state.vel))   # quieto = mejor
                if self.hold >= self.hold_steps:
                    reward += rw["goal"]
                    terminated = success = True
            else:
                reward += rw["goal"]
                self.goal_idx += 1
                if self.goal_idx >= len(self.level.goals):
                    terminated = success = True
                else:
                    self.prev_dist = self._goal_dist()
        else:
            self.hold = 0

        if crashed:
            reward -= rw["crash"]
            terminated = True

        truncated = (not terminated) and self.steps >= self.max_steps
        info = {
            "success": success,
            "crashed": crashed,
            "crash_reason": "suelo" if ground_crash else "obstaculo" if hit_obstacle else "limites" if oob else None,
            "goals_reached": self.goal_idx if not self.hold_steps else int(success),
            "dist": dist,
            "pos": pos.copy(),          # para ver dónde chocó (el entorno se reinicia solo)
        }
        return self._obs(), float(reward), terminated, truncated, info
