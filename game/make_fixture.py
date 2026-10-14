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
flight2 = {"traj": traj2, "phase": fl.phase, "reason": fl.reason, "t": fl.t}

# 6) caza: pájaros solos (mismo ruido) con un dron que se mueve
from drone_rl.birds import Flock
brng = np.random.default_rng(11)
start_pos = [[3, 4, 2.5], [-6, 2, 4.0], [5, -7, 3.0], [-2, -9, 5.0], [9, 9, 2.0]]
start_head = brng.uniform(-np.pi, np.pi, 5).tolist()
fk = Flock(5, 2.0).start(np.array(start_pos), np.array(start_head))
noise = brng.normal(size=(600, 5, 3))
drone_path, birds_out, cur = [], [], None
for t in range(600):
    d = np.array([6 * np.cos(t * 0.01), 6 * np.sin(t * 0.013), 2.5 + np.sin(t * 0.02)])
    fk.step(0.02, noise[t], d)
    if t == 300:
        fk.alive[2] = False
    cur = fk.pick(d, cur)
    drone_path.append(d.tolist())
    birds_out.append({"pos": fk.pos.tolist(), "est": fk.est_vel.tolist(), "pick": cur})
flock_case = {"pos": start_pos, "head": start_head, "noise": noise.tolist(), "drone": drone_path, "out": birds_out}

# 7) caza completa con una red de 27 entradas (las 3 nuevas con pesos de verdad)
import torch
from drone_rl.upgrade import load_ppo
m27, _ = load_ppo(ROOT / "models" / "anteriores" / "stage3.zip")
with torch.no_grad():
    w = m27.policy.mlp_extractor.policy_net[0].weight
    w[:, 24:] = torch.from_numpy(np.random.default_rng(3).normal(0, 0.3, (w.shape[0], 3)).astype(np.float32))
m27.save(out / "p27.zip")
npz27 = export(out / "p27.zip", out / "p27.npz")
npz_to_web(npz27, out / "policy27.json")
pol27 = NumpyPolicy(npz27)
hunt_lv = Level.from_dict({"goals": []})
hrng = np.random.default_rng(21)
hunt_noise = []
def rec_noise(n):
    z = hrng.normal(size=(n, 3))
    hunt_noise.append(z.tolist())
    return z
hk = Flock(5, 1.5).start(np.array(start_pos), np.array(start_head))
fl = Flight(hunt_lv, pol27, flock=hk, noise_fn=rec_noise)
fl.reset()
traj3 = []
for _ in range(1500):
    fl.step()
    traj3.append(fl.state.pos.tolist() + [fl.goal_idx, fl.target])
    if fl.phase != "ruta":
        break
hunt = {"pos": start_pos, "head": start_head, "noise": hunt_noise, "traj": traj3, "phase": fl.phase,
        "reason": fl.reason, "caught": fl.goal_idx}

(ROOT / "game" / "_fixture" / "fixture.json").write_text(json.dumps(
    {"level": level, "rays": ray_cases, "obs": obs_cases, "acts": acts.tolist(), "phys": phys,
     "flight": flight1, "open_level": open_lv.to_dict(),
     "flight2": flight2, "flock": flock_case, "hunt": hunt}))
print("fixture ok:", flight1["phase"], flight1["reason"], len(traj), "| abierto:", flight2["phase"], round(flight2["t"], 2),
      len(traj2), "| caza:", hunt["phase"], hunt["reason"], hunt["caught"], "pájaros en", len(traj3), "pasos")
