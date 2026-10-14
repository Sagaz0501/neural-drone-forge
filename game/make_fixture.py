"""Genera game/test_fixture.json: casos de Python para comprobar que game/sim.js da lo mismo.
    python game/make_fixture.py && node game/test_sim.mjs
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))
import numpy as np

from drone_rl.level import Level, forest_level, random_pillars
from drone_rl.physics import QuadState, step
from drone_rl.runtime import Flight, NumpyPolicy
from drone_rl.sensing import build_obs, sensor_rays
from export_policy import export, npz_to_web

out = ROOT / "game" / "_fixture"
out.mkdir(exist_ok=True)
npz = export(ROOT / "models" / "anteriores" / "stage3.zip", out / "p.npz")
npz_to_web(npz, out / "policy.json")
pol = NumpyPolicy(npz)
rng = np.random.default_rng(5)

lv, trees = forest_level(rng, density=1.5, n_goals=3)
lv.box_min, lv.box_max = random_pillars(rng, lv.spawn, lv.goals, n=(4, 6))
level = lv.to_dict()

# 1) sensores y colisiones en puntos al azar
ray_cases = []
for _ in range(400):
    o = rng.uniform([-12, -12, 0.05], [12, 12, 6])
    dirs = rng.normal(size=(6, 3))
    dirs /= np.linalg.norm(dirs, axis=1, keepdims=True)
    dirs[0] = [1, 0, 0]
    dirs[1] = [0, 0, -1]
    ray_cases.append({"o": o.tolist(), "dirs": dirs.tolist(), "d": lv.raycast(o, dirs, 5.0).tolist(),
                      "col": bool(lv.collides(o, 0.15))})
# 2) observación + red en estados al azar
obs_cases = []
for _ in range(200):
    s = QuadState(pos=rng.uniform([-10, -10, 0.2], [10, 10, 5]), vel=rng.normal(0, 3, 3),
                  roll=float(rng.uniform(-0.5, 0.5)), pitch=float(rng.uniform(-0.5, 0.5)), yaw=float(rng.uniform(-3, 3)))
    rays = sensor_rays(s, lv)
    prev = rng.uniform(-1, 1, 4)
    goal = lv.goals[int(rng.integers(0, 3))]
    obs = build_obs(s, goal, rays, prev, None if False else __import__("drone_rl").physics.QuadParams())
    obs_cases.append({"pos": s.pos.tolist(), "vel": s.vel.tolist(), "roll": s.roll, "pitch": s.pitch, "yaw": s.yaw,
                      "prev": prev.tolist(), "goal": goal.tolist(), "rays": rays.tolist(), "obs": obs.tolist(),
                      "act": pol(obs).tolist()})
# 3) física pura: una secuencia de acciones
s = QuadState(pos=np.array([0, 0, 0.0]))
acts = rng.uniform(-1, 1, (400, 4)) * np.array([0.6, 0.5, 0.5, 0.5]) + np.array([0.25, 0, 0, 0])
phys = []
for a in acts:
    s, _ = step(s, a, 0.01, __import__("drone_rl").physics.QuadParams(), np.array([1.0, -0.5, 0.0]))
    phys.append(s.pos.tolist() + s.vel.tolist() + [s.roll, s.pitch, s.yaw])
# 4) un vuelo completo de la red, sin viento, con aterrizaje
fl = Flight(lv, pol, land_on=np.array([lv.goals[-1][0], lv.goals[-1][1], 0.0]))
fl.reset()
traj = []
for _ in range(1500):
    fl.step()
    traj.append(fl.state.pos.tolist() + [fl.goal_idx])
    if fl.phase not in ("ruta", "aterrizaje"):
        break
flight1 = {"traj": traj, "phase": fl.phase, "reason": fl.reason, "t": fl.t}
# 5) vuelo largo en campo abierto (circuito de 4 aros) con aterrizaje
open_lv = Level.from_dict({"goals": [[6, 0, 2], [6, 6, 3], [0, 6, 2], [0, 0, 1.5]]})
fl = Flight(open_lv, pol, land_on=np.array([0.0, 0.0, 0.0]))
fl.reset()
traj2 = []
for _ in range(2500):
    fl.step()
    traj2.append(fl.state.pos.tolist() + [fl.goal_idx])
    if fl.phase not in ("ruta", "aterrizaje"):
        break
(ROOT / "game" / "_fixture" / "fixture.json").write_text(json.dumps(
    {"level": level, "rays": ray_cases, "obs": obs_cases, "acts": acts.tolist(), "phys": phys,
     "flight": flight1, "open_level": open_lv.to_dict(),
     "flight2": {"traj": traj2, "phase": fl.phase, "reason": fl.reason, "t": fl.t}}))
print("fixture ok:", flight1["phase"], flight1["reason"], len(traj), "| abierto:", fl.phase, round(fl.t, 2), len(traj2))
