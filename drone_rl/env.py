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
    6 forest       : cruzar un bosque (troncos, copas, arbustos) hasta un aro a 9-14 m
    7 forest_multi : slalom de 3 aros dentro del bosque
Opciones para cualquier nivel: density (bosque más claro/denso) y wind (viento con ráfagas, m/s).
O un nivel fijo hecho en Blender: DroneEnv(level_path="levels/mi_nivel.json")
"""
from __future__ import annotations

import json
from pathlib import Path

import gymnasium as gym
import numpy as np
from gymnasium import spaces

from .level import Level, forest_level, random_goal, random_pillars
from .physics import QuadParams, QuadState, Wind, step
from .physics import yaw_frame
from .sensing import (OBS_SCALE, RAY_DIRS_LOCAL, RAY_LEN, build_obs, clearance_penalty, danger_penalty,  # noqa: F401
                      sensor_rays)

STAGES = {0: "hover", 1: "goal_fixed", 2: "goal_random", 3: "obstacles", 4: "multi_goal", 5: "circuit",
          6: "forest", 7: "forest_multi"}

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
    "clearance": 0.0,    # castigo por pasar a menos de 1.2 m de un obstáculo (0 = apagado)
    "speed": 0.3,        # al pasar cada aro: + esto x velocidad media del tramo (m/s). Premia llegar RÁPIDO
                         # (ojo: con 1.0 en el bosque aprende a ir a ~7 m/s y choca más; subirlo cuando ya esquive)
    "stability": 0.5,    # castigo por segundo de giros bruscos (roll/pitch) y por girar sobre sí mismo (yaw)
    "danger": 0.0,       # castigo por ir rápido hacia algo que ve (menos de 1 s para chocar)
}
ANG_RATE_REF = 4.0       # rad/s: un giro de roll/pitch así de rápido cuenta como "1" en el castigo de estabilidad


class DroneEnv(gym.Env):
    metadata = {"render_modes": []}

    def __init__(self, stage: int = 0, level_path: str | None = None, params: QuadParams | None = None,
                 control_hz: int = 50, physics_substeps: int = 2, max_seconds: float | None = None,
                 goal_radius: float = 0.5, reward: dict | None = None,
                 start_anywhere: float = 0.0, spawn_jitter: float = 0.0, yaw_jitter: float = 0.0,
                 focus_blocked: float = 1.0, start_speed: float = 0.0, density: float = 1.0, wind: float = 0.0):
        super().__init__()
        self.stage = stage
        self.density = density                 # bosque: 0.5 claro · 1 normal · 2 denso (se puede cambiar en vivo)
        self.wind = Wind(wind)                 # viento máx. en m/s (0 = sin viento; se puede cambiar en vivo)
        self.trees = []
        self.fixed_level = Level.load(level_path) if level_path else None
        self.p = params or QuadParams()
        self.dt = 1.0 / control_hz
        self.substeps = physics_substeps
        self.goal_radius = goal_radius
        self.rw = reward if reward is not None else dict(DEFAULT_REWARD)
        # Solo para entrenar en un nivel fijo con varios aros (ej. la bodega):
        self.start_anywhere = start_anywhere   # prob. de aparecer en cualquier tramo de la ruta
        self.spawn_jitter = spawn_jitter       # +- metros de variación en la posición inicial
        self.yaw_jitter = yaw_jitter           # +- radianes de variación en la orientación inicial
        self.start_speed = start_speed         # al aparecer a mitad de ruta: ya viene volando (m/s máx.)
        # tramos con algo en la línea recta (hay que esquivar) salen `focus_blocked` veces más seguido
        self.start_weights = None
        if self.fixed_level is not None and len(self.fixed_level.goals) > 1:
            pts = [self.fixed_level.spawn] + list(self.fixed_level.goals)
            w = []
            for a, b in zip(pts[:-1], pts[1:]):
                blocked = any(self.fixed_level.collides(a + (b - a) * u, self.p.radius) for u in np.linspace(0, 1, 120))
                w.append(focus_blocked if blocked else 1.0)
            self.start_weights = np.array(w) / np.sum(w)
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
        if self.stage in (6, 7):
            lv, self.trees = forest_level(rng, self.density, n_goals=1 if self.stage == 6 else 3)
        return lv

    def reset(self, *, seed=None, options=None):
        super().reset(seed=seed)
        self.level = self._make_level()
        self.state = QuadState(pos=self.level.spawn.copy())
        self.goal_idx = 0
        rng = self.np_random
        # pequeño yaw aleatorio para que no memorice una sola orientación
        if self.fixed_level is None:
            self.state.yaw = float(rng.uniform(-np.pi, np.pi)) if self.stage >= 2 else 0.0
        else:
            goals = self.level.goals
            if len(goals) > 1 and rng.random() < self.start_anywhere:
                k = int(rng.choice(len(goals), p=self.start_weights))   # aparecer en el tramo k de la ruta
                if k > 0:
                    self.state.pos = goals[k - 1].copy()
                    if self.start_speed and rng.random() < 0.75:
                        # llega con la inercia del tramo anterior, como en la ruta real
                        prev = goals[k - 2] if k >= 2 else self.level.spawn
                        d = goals[k - 1] - prev
                        d = d / (np.linalg.norm(d) + 1e-9)
                        self.state.vel = d * rng.uniform(1.0, self.start_speed)
                self.goal_idx = k
            g = goals[self.goal_idx] - self.state.pos
            self.state.yaw = float(np.arctan2(g[1], g[0])) if self.start_anywhere else 0.0
            self.state.yaw += float(rng.uniform(-1, 1)) * self.yaw_jitter
            if self.spawn_jitter:
                base = self.state.pos.copy()
                for _ in range(10):                            # variación sin caer dentro de algo
                    off = rng.uniform(-1, 1, 3) * self.spawn_jitter * np.array([1, 1, 0.5])
                    cand = base + off
                    cand[2] = max(cand[2], 0.0)
                    if not self.level.collides(cand, self.p.radius * 2):
                        self.state.pos = cand
                        break
        self.hold = 0
        self.steps = 0
        self.prev_action = np.zeros(4)
        self.prev_dist = self._goal_dist()
        self.wind_now = self.wind.reset(rng)
        # para el premio de rapidez y las estadísticas del vuelo
        self.seg_start, self.seg_len = 0, self.prev_dist
        self.path_len, self.ang_sum = 0.0, 0.0
        return self._obs(), {}

    # ------------------------------------------------------------------
    def _goal(self) -> np.ndarray:
        return self.level.goals[min(self.goal_idx, len(self.level.goals) - 1)]

    def _goal_dist(self) -> float:
        return float(np.linalg.norm(self._goal() - self.state.pos))

    def _rays(self) -> np.ndarray:
        return sensor_rays(self.state, self.level)

    def _obs(self, rays: np.ndarray | None = None) -> np.ndarray:
        """Las 24 entradas (el cálculo vive en sensing.py, compartido con Blender)."""
        if rays is None:
            rays = self._rays()
        return build_obs(self.state, self._goal(), rays, self.prev_action, self.p)

    # ------------------------------------------------------------------
    def step(self, action):
        action = np.clip(np.asarray(action, dtype=float), -1, 1)
        ground_crash = False
        prev_pos, prev_att = self.state.pos.copy(), (self.state.roll, self.state.pitch)
        self.wind_now = self.wind.step(self.dt, self.np_random)
        for _ in range(self.substeps):
            self.state, info = step(self.state, action, self.dt / self.substeps, self.p, self.wind_now)
            ground_crash |= info["ground_crash"]
        self.steps += 1
        ang_rate = np.hypot(self.state.roll - prev_att[0], self.state.pitch - prev_att[1]) / self.dt   # rad/s
        self.ang_sum += ang_rate
        self.path_len += float(np.linalg.norm(self.state.pos - prev_pos))

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
        rays = self._rays()
        if rw.get("clearance", 0.0):
            reward -= rw["clearance"] * clearance_penalty(rays)          # no pasar pegado a las cosas
        if rw.get("danger", 0.0):                                        # frenar/desviarse a tiempo
            reward -= rw["danger"] * danger_penalty(rays, yaw_frame(self.state.vel, self.state.yaw))
        if rw.get("stability", 0.0):                                     # vuelo estable: sin sacudidas ni trompos
            reward -= rw["stability"] * self.dt * ((ang_rate / ANG_RATE_REF) ** 2 + float(action[3]) ** 2)
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
                seg_time = (self.steps - self.seg_start) * self.dt
                reward += rw.get("speed", 0.0) * min(self.seg_len / max(seg_time, 1e-3), 8.0)   # más rápido = más premio
                self.goal_idx += 1
                if self.goal_idx >= len(self.level.goals):
                    terminated = success = True
                else:
                    self.prev_dist = self._goal_dist()
                    self.seg_start, self.seg_len = self.steps, self.prev_dist
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
        if terminated or truncated:     # cómo voló: para el HUD del laboratorio
            t = self.steps * self.dt
            info["avg_speed"] = self.path_len / t
            info["ang_rate"] = float(np.degrees(self.ang_sum / self.steps))
        return self._obs(rays), float(reward), terminated, truncated, info
