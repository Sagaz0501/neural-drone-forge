"""
Entorno Gymnasium: el "videojuego" donde la IA aprende a volar.

Cada paso (50 por segundo) la IA:
    1. recibe una OBSERVACIÓN (38 números: lo que "siente" el dron),
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
    8 hunt         : CAZA: 5 pájaros vuelan solos (y huyen); hay que tocarlos a todos (birds.py)
    9 hunt_columns : caza entre columnas altas (los pájaros las esquivan; el dron también tiene que)
   10 hunt_forest  : caza en el bosque, debajo de las copas, entre troncos y arbustos
   11 film_fixed   : GRABAR: una casa y una toma con ruta (fija, órbita o revelar, tomas.py): llegar al inicio,
                    y seguir el punto de cámara por la ruta SIN perder el encuadre de la casa
   12 film_posts   : GRABAR ENTRE POSTES: lo mismo, con postes / sombrillas a 1,5 m de la ruta (usar los sensores)
   13 photo        : FOTO: una toma fija corta (2,5-3,5 s): llegar, frenar y quedarse quieto con la casa al centro
   14 photo_set    : SET DE FOTOS: 2-4 fotos seguidas alrededor de la casa, en orden (todas buenas = éxito)
Opciones para cualquier nivel: density (bosque más claro/denso) y wind (viento con ráfagas, m/s).
Física: params (un dron fijo, ej. QuadParams.load("drones/madera.json")) o phys_range (física al azar
en cada intento, dentro de esos rangos: así la red aprende a volar drones distintos).
O un nivel fijo hecho en Blender: DroneEnv(level_path="levels/mi_nivel.json")
"""
from __future__ import annotations

import json
from pathlib import Path

import gymnasium as gym
import numpy as np
from gymnasium import spaces

from .birds import CATCH_R, Z_FOREST, Z_MAX, Z_MIN, Flock
from .level import (Level, film_house_level, film_posts, forest_level, forest_shapes, hunt_pillars, random_forest, random_goal,
                    random_pillars)
from .physics import QuadParams, QuadState, Wind, step
from .physics import yaw_frame
from .tomas import START_V, Toma, random_foto, random_fotos, random_toma  # noqa: F401
from .sensing import (N_OBS, OBS_SCALE, RAY_DIRS_LOCAL, RAY_LEN, build_obs, clearance_penalty, danger_penalty,  # noqa: F401
                      film_quality, sensor_rays)

STAGES = {0: "hover", 1: "goal_fixed", 2: "goal_random", 3: "obstacles", 4: "multi_goal", 5: "circuit",
          6: "forest", 7: "forest_multi", 8: "hunt", 9: "hunt_columns", 10: "hunt_forest", 11: "film_fixed", 12: "film_posts",
          13: "photo", 14: "photo_set"}
HUNT_STAGES = (8, 9, 10)
FILM_STAGES = (11, 12, 13, 14)
PHOTO_STAGES = (13, 14)       # fotos: tomas fijas cortas (una, o un set de 2-4 seguidas)
FILM_OK = 0.5            # grabar: calidad media de la toma para que cuente como lograda (sensing.film_quality)
FILM_TOMAS = ("fija", "orbita", "revelar")

# Qué cuenta como éxito en cada misión (texto en drone_rl/missions.json, que también lee Blender).
# OJO: la IA no lee esto; solo "siente" la recompensa. Esto es para nosotros.
_M = json.loads((Path(__file__).with_name("missions.json")).read_text(encoding="utf-8"))
MISSIONS = {int(k): v for k, v in _M.items() if k.isdigit()}
LEVEL_MISSION = _M["level"]

CIRCUIT = [np.array(g, dtype=float) for g in ((6, 0, 2), (6, 6, 3), (0, 6, 2), (0, 0, 1.5))]
CIRCUIT_LAPS = 2

# Nombre de cada una de las 38 entradas de la red (para verlas en Blender)
OBS_LABELS = ["meta adelante", "meta izquierda", "meta arriba", "distancia",
              "vel adelante", "vel izquierda", "vel arriba", "roll", "pitch", "altura",
              "gas anterior", "roll anterior", "pitch anterior", "yaw anterior",
              "sensor 0°", "sensor 45°", "sensor 90°", "sensor 135°", "sensor 180°",
              "sensor 225°", "sensor 270°", "sensor 315°", "sensor arriba", "sensor abajo",
              "meta se mueve adelante", "meta se mueve izquierda", "meta se mueve arriba",
              "sujeto adelante", "sujeto izquierda", "sujeto arriba",
              "toma fija", "toma revelar", "toma seguir", "toma órbita",
              "empuje/peso", "masa", "arrastre", "respuesta"]
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
    "stability": 0.5,    # castigo por segundo de giros bruscos de roll/pitch (sacudidas). El yaw lo maneja "heading"
    "danger": 0.0,       # castigo por ir rápido hacia algo que ve (menos de 1 s para chocar)
    "heading": 2.0,      # nariz hacia el aro: castigo por segundo (0 mirándolo, la mitad de lado, todo de
                         # espaldas) + premio/castigo inmediato por cada grado que gira hacia/lejos del aro
                         # (grabar: la nariz -la cámara- hacia el SUJETO)
    "film": 3.0,         # grabar: premio por segundo de buena imagen (encuadre x zona x estable, de 0 a 1)
    # ---- Fase 1b (docs/ROADMAP.md): el catálogo nuevo. Todos en 0 = apagados (los modelos de antes no cambian) ----
    "framing": 0.0,      # cámara: premio por segundo con el sujeto AL CENTRO del cuadro (solo el encuadre), grabando
                         # y en los últimos 3 m antes de la toma (para llegar ya encuadrado)
    "settle": 0.0,       # cámara: al arrancar la toma, premio x qué tan QUIETO llegó (1 = parado, 0 = a 2 m/s)
    "altitude": 0.0,     # vuelo: castigo por segundo por subir/bajar (m/s) cuando la toma pide otra cosa
                         # (grabando o llegando a la toma)
    "pan": 0.0,          # cámara: castigo por segundo por paneos bruscos (aceleración del giro de la nariz)
    "overspeed": 0.0,    # seguridad: castigo por segundo por cada m/s por encima de SPEED_LIMIT
    "energy": 0.0,       # energía: castigo por segundo por el gas por encima del necesario para flotar
}
ANG_RATE_REF = 4.0       # rad/s: un giro de roll/pitch así de rápido cuenta como "1" en el castigo de estabilidad
SPEED_LIMIT = 3.0        # m/s: el límite de velocidad del castigo "overspeed" (las rutas de cámara van a 0-2 m/s)
YAW_ACC_REF = 8.0        # rad/s²: un paneo así de brusco cuenta como "1" en el castigo "pan"
APPROACH_R = 3.0         # m: "llegando a la toma" (framing y altitude ya cuentan)


class DroneEnv(gym.Env):
    metadata = {"render_modes": []}

    def __init__(self, stage: int = 0, level_path: str | None = None, params: QuadParams | None = None,
                 control_hz: int = 50, physics_substeps: int = 2, max_seconds: float | None = None,
                 goal_radius: float = 0.5, reward: dict | None = None,
                 start_anywhere: float = 0.0, spawn_jitter: float = 0.0, yaw_jitter: float = 0.0,
                 focus_blocked: float = 1.0, start_speed: float = 0.0, density: float = 1.0, wind: float = 0.0,
                 n_birds: int = 5, bird_speed: float = 1.5, phys_range: dict | None = None,
                 tomas: tuple | None = None):
        super().__init__()
        self.stage = stage
        self.n_birds, self.bird_speed = n_birds, bird_speed   # caza: cuántos pájaros y qué tan rápido (m/s, en vivo)
        self.flock, self.target = None, None
        self.density = density                 # bosque: 0.5 claro · 1 normal · 2 denso (se puede cambiar en vivo)
        self.wind = Wind(wind)                 # viento máx. en m/s (0 = sin viento; se puede cambiar en vivo)
        self.trees = []
        self.fixed_level = Level.load(level_path) if level_path else None
        self.p0 = params or QuadParams()       # el dron base (o el armado en el juego)
        self.p = self.p0
        # física al azar en cada intento: {"twr": [a, b], "mass": [a, b], "drag": …, "att_resp": …,
        # "max_angle_deg": …, "yaw_rate_deg": …}; lo que no está queda como en p0
        self.phys_range = phys_range
        self.subject, self.band, self.toma = None, None, None     # grabar
        self.shot = None                                          # grabar: la toma con su ruta (tomas.Toma)
        self.shots, self.shot_q = [], []                          # fotos: el set de tomas y la calidad de cada una
        self.tomas = tuple(tomas) if tomas else FILM_TOMAS        # qué tomas se sortean
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
        self.observation_space = spaces.Box(-3.0, 3.0, shape=(N_OBS,), dtype=np.float32)   # 38 (sensing.build_obs)

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
        if self.stage in HUNT_STAGES:
            lv.goals = []                      # las metas son los pájaros (se crean en reset)
        if self.stage == 9:
            lv.box_min, lv.box_max = hunt_pillars(rng, sp)
        if self.stage == 10:                   # bosque por toda el área de caza (radio ~13 m)
            self.trees = random_forest(rng, sp, [], self.density, margin=13.0)
            lv.cyl_xy, lv.cyl_r, lv.cyl_z, lv.sph_c, lv.sph_r = forest_shapes(self.trees)
        if self.stage in FILM_STAGES:          # grabar una casa: la meta es el punto de cámara
            lv, self.subject, _ = film_house_level(rng)
            wall_h, top = float(lv.box_min[1][2]), float(np.max(lv.box_max[:, 2]))
            techo = np.array([self.subject[0], self.subject[1], (wall_h + top) / 2])   # inspección: el techo
            if self.stage == 13:
                self.shots = [random_foto(rng, self.subject, lv, techo=techo)]
            elif self.stage == 14:
                self.shots = random_fotos(rng, self.subject, lv, int(rng.integers(2, 5)), techo=techo)
            else:
                self.shots = [random_toma(rng, self.subject, lv, self.tomas)]
            self.shot = self.shots[0]
            self.subject = self.shot.subject          # una foto de inspección mira el techo
            self.toma, self.band = self.shot.tipo, self.shot.band()
            lv.goals = [sh.start() for sh in self.shots]
            if self.stage == 12:                   # postes cerca de la ruta: hay que verlos con los sensores
                film_posts(rng, lv, self.shot)
        return lv

    def _random_params(self) -> QuadParams:
        """Física al azar dentro de phys_range (un dron distinto en cada intento)."""
        rng, r, p0 = self.np_random, self.phys_range, self.p0
        u = lambda k, base: float(rng.uniform(*r[k])) if k in r else base
        return QuadParams(mass=u("mass", p0.mass), twr=u("twr", p0.twr), drag=u("drag", p0.drag),
                          max_angle=np.radians(u("max_angle_deg", np.degrees(p0.max_angle))),
                          yaw_rate=np.radians(u("yaw_rate_deg", np.degrees(p0.yaw_rate))),
                          att_resp=u("att_resp", p0.att_resp), crash_speed=p0.crash_speed, radius=p0.radius)

    def reset(self, *, seed=None, options=None):
        super().reset(seed=seed)
        if self.phys_range:
            self.p = self._random_params()
        self.subject, self.band, self.toma, self.shot = None, None, None, None
        self.shots, self.shot_q = [], []
        self.level = self._make_level()
        self.state = QuadState(pos=self.level.spawn.copy())
        self.goal_idx = 0
        rng = self.np_random
        self.flock, self.target = None, None
        if self.stage in HUNT_STAGES and self.fixed_level is None:
            self.flock = Flock(self.n_birds, self.bird_speed, center=self.level.spawn,
                               level=self.level if self.stage > 8 else None,
                               z=Z_FOREST if self.stage == 10 else (Z_MIN, Z_MAX)).reset(rng, self.state.pos, self.dt)
            self.target = self.flock.pick(self.state.pos, None)
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
        self.prev_phi = self._heading_phi()
        self.path_len, self.ang_sum = 0.0, 0.0
        self.front_n, self.move_n = 0, 0          # cuánto vuela de frente (para el HUD)
        self.film_good, self.film_sum, self.film_n = 0.0, 0.0, 0   # grabar: segundos grabados, suma de calidad, pasos
        self.prev_yaw, self.yaw_rate = self.state.yaw, 0.0
        self.film_q = 0.0                         # grabar: calidad de imagen de ESTE paso (para pintar el cono en Blender)
        return self._obs(), {}

    # ------------------------------------------------------------------
    def _goal(self) -> np.ndarray:
        if self.shot is not None:
            return self.shot.point()
        if self.flock is not None:
            return self.flock.pos[self.target]
        return self.level.goals[min(self.goal_idx, len(self.level.goals) - 1)]

    def _goal_vel(self) -> np.ndarray:
        """Cómo se mueve la meta (estimado de la última décima de segundo). Aros: quietos = 0."""
        if self.shot is not None:
            return self.shot.vel()
        return self.flock.est_vel[self.target] if self.flock is not None else np.zeros(3)

    def _n_goals(self) -> int:
        return self.flock.n if self.flock is not None else len(self.level.goals)

    def _goal_dist(self) -> float:
        return float(np.linalg.norm(self._goal() - self.state.pos))

    def _heading_phi(self) -> float:
        """Qué tan mal mira al aro: 0 con la nariz hacia el aro, -1/2 de lado, -1 de espaldas.
        Se apaga a menos de 0.3 m en horizontal (justo encima del aro la dirección no está definida).
        Grabar: lo que hay que mirar es el SUJETO (la cámara va en la nariz)."""
        look = self.subject if self.subject is not None else self._goal()
        g = look[:2] - self.state.pos[:2]
        dh = float(np.hypot(g[0], g[1]))
        if dh < 1e-6:
            return 0.0
        cos_e = float(np.cos(np.arctan2(g[1], g[0]) - self.state.yaw))
        return 0.5 * (cos_e - 1.0) * min(dh / 0.3, 1.0)

    def _rays(self) -> np.ndarray:
        return sensor_rays(self.state, self.level)

    def _obs(self, rays: np.ndarray | None = None) -> np.ndarray:
        """Las 38 entradas (el cálculo vive en sensing.py, compartido con Blender y el juego)."""
        if rays is None:
            rays = self._rays()
        return build_obs(self.state, self._goal(), rays, self.prev_action, self.p, self._goal_vel(),
                         self.subject, self.toma)

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
        yaw_rate = float(np.arctan2(np.sin(self.state.yaw - self.prev_yaw), np.cos(self.state.yaw - self.prev_yaw))) / self.dt
        yaw_acc = (yaw_rate - self.yaw_rate) / self.dt                  # paneo brusco (grabar)
        self.prev_yaw, self.yaw_rate = self.state.yaw, yaw_rate
        recording, started = False, False
        if self.shot is not None:                      # grabar: la toma espera al dron en el inicio y después avanza
            recording = self.shot.phase == "grabando"
            before = self.shot.phase
            self.shot.step(self.dt, self.state.pos, self.state.vel)
            started = before == "ir" and self.shot.phase == "grabando"
        if self.flock is not None:                     # los pájaros se mueven (y eligen huir) a la vez que el dron
            self.flock.speed = self.bird_speed
            self.flock.step(self.dt, self.np_random.normal(size=(self.flock.n, 3)), self.state.pos)
            new = self.flock.pick(self.state.pos, self.target)
            if new != self.target:                     # otra presa quedó mucho más cerca: la persigue a ella
                self.target = new
                self.prev_dist = self._goal_dist()
                self.seg_start, self.seg_len = self.steps, self.prev_dist
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
        # ---- de frente: la nariz hacia el aro que toca ----
        # phi = 0 mirándolo, -1 de espaldas. Dos partes:
        #  1) castigo por segundo = heading x phi        -> volar de espaldas o dando vueltas cuesta siempre
        #  2) premio inmediato = heading x (phi - antes) -> cada grado que gira HACIA el aro paga YA (y alejarse
        #     cobra YA). Sin esto el premio llega tarde: con gamma 0.99 la red solo "ve" ~2 s hacia adelante.
        # La parte 2 suma en total (phi al final - phi al inicio): no depende de cómo vuele, solo adelanta el aviso,
        # así que dar vueltas no paga. Al pasar un aro, si el siguiente queda de lado, ese giro se cobra en el acto
        # y se devuelve al voltearse hacia él.
        phi = self._heading_phi()
        if rw.get("heading", 0.0):
            reward += rw["heading"] * ((phi - self.prev_phi) + self.dt * phi)
        self.prev_phi = phi
        vh = self.state.vel[:2]
        sp_h = float(np.hypot(vh[0], vh[1]))
        if sp_h > 1.0:                                                   # para el HUD: ¿vuela de frente?
            self.move_n += 1
            self.front_n += float(np.cos(np.arctan2(vh[1], vh[0]) - self.state.yaw)) > 0.707   # ±45°
        if rw.get("stability", 0.0):                                     # vuelo estable: sin sacudidas ni trompos
            # solo roll/pitch: castigar el yaw aquí le cobraba justo el giro para ponerse de frente
            reward -= rw["stability"] * self.dt * (ang_rate / ANG_RATE_REF) ** 2
        speed = float(np.linalg.norm(self.state.vel))
        if rw.get("overspeed", 0.0):                                     # límite de velocidad
            reward -= rw["overspeed"] * self.dt * max(0.0, speed - SPEED_LIMIT)
        if rw.get("energy", 0.0):                                        # gas de más (subir, acelerar de golpe)
            reward -= rw["energy"] * self.dt * max(0.0, self.state.throttle - self.p.hover_throttle)
        if rw.get("pan", 0.0):                                           # paneo brusco (se nota en el video)
            reward -= rw["pan"] * self.dt * min((yaw_acc / YAW_ACC_REF) ** 2, 4.0)
        self.prev_dist = dist
        self.prev_action = action

        terminated, success = False, False
        film = self.stage in FILM_STAGES and self.fixed_level is None
        if film:
            # grabar: qué tan buena es la imagen (encuadre x seguimiento x ritmo x estable) contra el punto de la ruta
            p, _ = self.shot.at(self.shot.progress)
            fq = film_quality(self.state, self.subject, p, self.shot.vel() if recording else np.zeros(3), ang_rate, yaw_acc)
            self.film_q = fq["q"]
            if recording:                                    # solo cuenta lo que se graba
                reward += rw.get("film", 0.0) * fq["q"] * self.dt
                self.film_sum += fq["q"]
                self.film_n += 1
                self.film_good += self.dt
            near = (self.shot.phase == "ir" or started) and float(np.linalg.norm(self.shot.start() - pos)) < APPROACH_R
            if recording or near:                            # Fase 1b: encuadre y altura, grabando o llegando
                reward += rw.get("framing", 0.0) * fq["framing"] * self.dt
                vz_ok = self.shot.vel()[2] if recording else 0.0
                reward -= rw.get("altitude", 0.0) * min(abs(self.state.vel[2] - vz_ok), 3.0) * self.dt
            if started:                                      # llegó: paga qué tan quieto (la foto sale movida si no)
                reward += rw.get("settle", 0.0) * max(0.0, 1.0 - speed / START_V)
            if self.shot.phase == "lista":                   # se acabó la ruta (o la foto): ¿quedó buena?
                q_mean = self.film_sum / max(self.film_n, 1)
                reward += rw["goal"] * q_mean
                self.shot_q.append(q_mean)
                if len(self.shot_q) < len(self.shots):       # set de fotos: la siguiente
                    self.shot = self.shots[len(self.shot_q)]
                    self.subject, self.band = self.shot.subject, self.shot.band()
                    self.goal_idx = len(self.shot_q)
                    self.film_sum, self.film_n = 0.0, 0
                    dist = self._goal_dist()
                    self.prev_dist, self.prev_phi = dist, self._heading_phi()
                else:
                    terminated = True
                    success = all(q >= FILM_OK for q in self.shot_q)
        elif self.hold_steps:
            # tarea de "quedarse": premio continuo por estar cerca (más cerca = más premio)
            reward += rw["near"] * np.exp(-dist)
        if film:
            pass
        elif dist < (CATCH_R if self.flock is not None else self.goal_radius):
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
                if self.flock is not None:             # cazado: desaparece y elige la presa más cercana
                    self.flock.alive[self.target] = False
                    nxt = self.flock.pick(self.state.pos, None)
                    self.target = self.target if nxt is None else nxt      # el último: se queda con ese
                if self.goal_idx >= self._n_goals():
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
            "goals_reached": (self.goal_idx if not self.hold_steps else int(success)) if not film
                             else sum(q >= FILM_OK for q in self.shot_q) if self.stage in PHOTO_STAGES else int(success),
            "dist": dist,
            "pos": pos.copy(),          # para ver dónde chocó (el entorno se reinicia solo)
        }
        if terminated or truncated:     # cómo voló: para el HUD del laboratorio
            t = self.steps * self.dt
            info["avg_speed"] = self.path_len / t
            info["ang_rate"] = float(np.degrees(self.ang_sum / self.steps))
            info["front"] = self.front_n / self.move_n if self.move_n else None
            if film:
                info["film_good"] = self.film_good
                qs = self.shot_q + ([self.film_sum / self.film_n] if self.film_n and len(self.shot_q) < len(self.shots) else [])
                info["film_q"] = float(np.mean(qs)) if self.stage in PHOTO_STAGES and qs else self.film_sum / max(self.film_n, 1)
                info["toma"] = self.toma
                if self.stage in PHOTO_STAGES:
                    info["fotos"] = [round(float(q), 3) for q in self.shot_q]
                    info["n_fotos"] = len(self.shots)
        return self._obs(rays), float(reward), terminated, truncated, info
