"""
Vuelo SIN gymnasium ni PyTorch: solo numpy. Lo usa Blender (bodega.blend) para que la IA
entrenada vuele en vivo dentro de una escena.

    policy = NumpyPolicy("models/policy_bodega.npz")     # exportada con scripts/export_policy.py
    vuelo = Flight(level, policy, land_on=(1, 8.5, 0))
    vuelo.reset()
    while vuelo.phase in ("ruta", "aterrizaje"):
        info = vuelo.step()                               # 1/50 s: sensores -> red -> física

Es la misma física (physics.py) y los mismos sensores (sensing.py) que en el entrenamiento.
"""
import json

import numpy as np

from .birds import CATCH_R
from .controller import PDPilot
from .physics import QuadParams, QuadState, Wind, step
from .sensing import build_obs, sensor_rays


class NumpyPolicy:
    """El actor de PPO (27 -> 128 -> 128 -> 4) como multiplicaciones de matrices con numpy.
    Un modelo viejo de 24 entradas también sirve: usa solo las primeras 24."""

    def __init__(self, path):
        d = np.load(path, allow_pickle=False)
        n = int(d["n_layers"])
        self.layers = [(d[f"W{i}"].astype(np.float32), d[f"b{i}"].astype(np.float32)) for i in range(n)]
        self.meta = json.loads(str(d["meta"])) if "meta" in d else {}
        self.last_hidden = []

    def __call__(self, obs: np.ndarray) -> np.ndarray:
        h = np.asarray(obs, dtype=np.float32)[: self.layers[0][0].shape[1]]
        self.last_hidden = []
        for W, b in self.layers[:-1]:
            h = np.tanh(h @ W.T + b)          # capa oculta: suma ponderada + tanh
            self.last_hidden.append(h)
        W, b = self.layers[-1]
        return np.clip(h @ W.T + b, -1.0, 1.0)   # 4 palancas: gas, roll, pitch, yaw


class Flight:
    """Un vuelo: la red sigue la ruta y, si hay plataforma, el piloto PD aterriza al final."""

    def __init__(self, level, policy, p: QuadParams | None = None, control_hz: int = 50, substeps: int = 2,
                 goal_radius: float = 0.5, land_on=None, wind: float = 0.0, seed=None, flock=None, noise_fn=None):
        self.level, self.policy = level, policy
        self.wind = Wind(wind)                     # mismo viento con ráfagas que en el entrenamiento
        self.rng = np.random.default_rng(seed)
        self.p = p or QuadParams()
        self.dt = 1.0 / control_hz
        self.substeps = substeps
        self.goal_radius = goal_radius
        self.land_on = None if land_on is None else np.asarray(land_on, dtype=float)
        self.pd = PDPilot(self.p, v_max=1.5)
        # caza: los pájaros (birds.Flock, ya con start()); su azar va aparte del viento
        self.flock = flock
        self.bird_rng = np.random.default_rng(None if seed is None else seed + 1)
        self.noise_fn = noise_fn or (lambda n: self.bird_rng.normal(size=(n, 3)))
        self.target = None

    def reset(self, pos=None, yaw: float | None = None):
        start = self.level.spawn if pos is None else np.asarray(pos, dtype=float)
        self.goal_idx = 0
        if self.flock is not None:
            self.target = self.flock.pick(start, None)
        g = self.goal() - start
        self.state = QuadState(pos=start.copy(), yaw=float(np.arctan2(g[1], g[0]) if yaw is None else yaw))
        self.goal_idx = 0
        self.prev_action = np.zeros(4)
        self.t = 0.0
        self.phase = "ruta"            # ruta -> aterrizaje -> aterrizado   (o: choque)
        self.reason = None
        self.rays = sensor_rays(self.state, self.level)
        self.action = np.zeros(4)
        self._land_low = False
        self.wind_now = self.wind.reset(self.rng)
        return self.info()

    def goal(self):
        if self.flock is not None:
            return self.flock.pos[self.target]
        return self.level.goals[min(self.goal_idx, len(self.level.goals) - 1)]

    def goal_vel(self):
        return self.flock.est_vel[self.target] if self.flock is not None else None

    def step(self):
        if self.phase not in ("ruta", "aterrizaje"):
            return self.info()
        s = self.state
        if self.phase == "ruta":
            obs = build_obs(s, self.goal(), self.rays, self.prev_action, self.p, self.goal_vel())
            a = self.policy(obs)                                  # <- la red neuronal decide
        else:
            # aterrizaje: el piloto PD baja despacio sobre la plataforma
            pad = self.land_on
            above = pad + np.array([0, 0, 0.6])
            if not self._land_low and np.linalg.norm(s.pos - above) < 0.25 and np.linalg.norm(s.vel) < 0.4:
                self._land_low = True
            target = pad + np.array([0, 0, -0.4]) if self._land_low else above
            a = self.pd.act(s, target)
        ground_crash = grounded = False
        self.wind_now = self.wind.step(self.dt, self.rng)
        for _ in range(self.substeps):
            self.state, inf = step(self.state, a, self.dt / self.substeps, self.p, self.wind_now)
            ground_crash |= inf["ground_crash"]
            grounded |= inf["grounded"]
        self.prev_action, self.action = a, a
        self.t += self.dt
        s = self.state
        self.rays = sensor_rays(s, self.level)
        fl = self.flock
        if fl is not None and self.phase == "ruta":     # los pájaros vuelan y la presa puede cambiar
            fl.step(self.dt, self.noise_fn(fl.n), s.pos)
            self.target = fl.pick(s.pos, self.target)

        if ground_crash:
            self.phase, self.reason = "choque", "suelo"
        elif self.level.collides(s.pos, self.p.radius):
            self.phase, self.reason = "choque", "obstáculo"
        elif self.level.out_of_bounds(s.pos):
            self.phase, self.reason = "choque", "límites"
        elif fl is not None and self.phase == "ruta" and np.linalg.norm(self.goal() - s.pos) < CATCH_R:
            fl.alive[self.target] = False                  # ¡cazado!
            self.goal_idx += 1
            if self.goal_idx >= fl.n:
                self.phase = "cazado"
            else:
                self.target = fl.pick(s.pos, None)
        elif self.phase == "ruta" and np.linalg.norm(self.goal() - s.pos) < self.goal_radius:
            self.goal_idx += 1
            if self.goal_idx >= len(self.level.goals):
                self.phase = "aterrizaje" if self.land_on is not None else "aterrizado"
        elif self.phase == "aterrizaje" and grounded and self._land_low:
            self.phase = "aterrizado"
            self.state.throttle = 0.0
        return self.info()

    def info(self):
        s = self.state
        return {"t": self.t, "pos": s.pos.copy(), "rot": (s.roll, s.pitch, s.yaw), "vel": s.vel.copy(),
                "throttle": s.throttle, "goal_idx": self.goal_idx, "phase": self.phase, "reason": self.reason,
                "rays": self.rays.copy(), "action": np.array(self.action), "wind": self.wind_now.copy()}
