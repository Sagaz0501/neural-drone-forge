import pytest
import numpy as np
from gymnasium.utils.env_checker import check_env

from drone_rl import DroneEnv, Level, QuadParams, QuadState
from drone_rl.controller import PDPilot
from drone_rl.physics import step

P = QuadParams()


def hover_action():
    return np.array([0.0, 0, 0, 0])   # 0 = gas de hover


def test_hover_equilibrium():
    s = QuadState(pos=np.array([0, 0, 2.0]))
    for _ in range(500):
        s, _ = step(s, hover_action(), 0.01, P)
    assert abs(s.pos[2] - 2.0) < 1e-6
    assert np.linalg.norm(s.vel) < 1e-6


def test_free_fall_crashes():
    s = QuadState(pos=np.array([0, 0, 5.0]))
    crashed = False
    for _ in range(300):
        s, info = step(s, np.array([-1, 0, 0, 0]), 0.01, P)
        crashed |= info["ground_crash"]
    assert crashed


def test_pitch_forward_moves_plus_x():
    s = QuadState(pos=np.array([0, 0, 3.0]))
    for _ in range(100):
        s, _ = step(s, np.array([0.1, 0, 1, 0]), 0.01, P)
    assert s.vel[0] > 1.0


def test_roll_right_moves_minus_y():
    s = QuadState(pos=np.array([0, 0, 3.0]))
    for _ in range(100):
        s, _ = step(s, np.array([0.1, 1, 0, 0]), 0.01, P)
    assert s.vel[1] < -1.0


def test_raycast_box_and_floor():
    lv = Level.from_dict({"boxes": [{"min": [2, -1, 0], "max": [3, 1, 4]}]})
    dirs = np.array([[1, 0, 0], [-1, 0, 0], [0, 0, -1.0]])
    d = lv.raycast(np.array([0, 0, 1.0]), dirs, 5.0)
    assert np.allclose(d, [2.0, 5.0, 1.0])


def test_collision():
    lv = Level.from_dict({"spheres": [{"center": [0, 0, 2], "radius": 0.5}]})
    assert lv.collides(np.array([0, 0.6, 2]), 0.15)
    assert not lv.collides(np.array([0, 1.0, 2]), 0.15)


def test_gym_api():
    from drone_rl import STAGES
    for stage in STAGES:
        check_env(DroneEnv(stage=stage), skip_render_check=True)
    check_env(DroneEnv(stage=6, wind=5.0, density=2.0), skip_render_check=True)


def run_pilot(stage, episodes=20):
    env = DroneEnv(stage=stage)
    pilot = PDPilot(env.p)
    ok = 0
    for ep in range(episodes):
        env.reset(seed=ep)
        done = False
        while not done:
            a = pilot.act(env.state, env._goal())
            _, _, term, trunc, info = env.step(a)
            done = term or trunc
        ok += info["success"]
    return ok / episodes


def test_pd_pilot_solves_easy_stages():
    # si un controlador clásico lo resuelve, el entorno es resoluble
    assert run_pilot(0) == 1.0
    assert run_pilot(1) == 1.0
    assert run_pilot(2) >= 0.9


def test_reward_dict_shared_across_envs():
    from stable_baselines3.common.env_util import make_vec_env
    from drone_rl import DEFAULT_REWARD
    rw = dict(DEFAULT_REWARD)
    venv = make_vec_env(DroneEnv, n_envs=3, env_kwargs=dict(stage=0, reward=rw))
    rw["crash"] = 99.0                       # cambio "en vivo"
    assert all(e.unwrapped.rw["crash"] == 99.0 for e in venv.envs)


def test_circuit_two_laps():
    from drone_rl import MISSIONS, OBS_LABELS
    env = DroneEnv(stage=5)
    env.reset(seed=0)
    assert len(env.level.goals) == 8                       # 4 aros x 2 vueltas
    assert len(OBS_LABELS) == env.observation_space.shape[0]
    assert set(MISSIONS) == set(range(8))
    assert run_pilot(5, episodes=5) == 1.0                 # el piloto PD completa las 2 vueltas


def test_runtime_matches_env(tmp_path):
    """Blender usa runtime.py (solo numpy): debe volar EXACTAMENTE igual que el entorno de entrenamiento."""
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
    from export_policy import export
    from stable_baselines3 import PPO
    from drone_rl.runtime import Flight, NumpyPolicy
    root = Path(__file__).resolve().parents[1]
    npz = export(root / "models" / "anteriores" / "stage2.zip", tmp_path / "p.npz")
    model, npol = PPO.load(root / "models" / "anteriores" / "stage2.zip", device="cpu"), NumpyPolicy(npz)
    env = DroneEnv(stage=2)
    obs, _ = env.reset(seed=3)
    fl = Flight(env.level, npol)
    fl.reset(pos=env.level.spawn, yaw=env.state.yaw)
    for _ in range(200):
        obs, _, te, tr, _ = env.step(model.predict(obs, deterministic=True)[0])
        fl.step()
        assert np.linalg.norm(env.state.pos - fl.state.pos) < 1e-4
        if te or tr:
            break


def test_runtime_lands_on_pad():
    """Después del último aro, el piloto PD aterriza suave sobre la plataforma."""
    from drone_rl.runtime import Flight
    lv = Level.from_dict({"spawn": [0, 0, 0], "goals": [[3, 0, 2]]})
    pd = PDPilot(QuadParams())
    fl = Flight(lv, lambda o: None, land_on=(5, 1, 0))
    fl.reset()
    fl.phase = "ruta"
    fl.policy = lambda o: pd.act(fl.state, fl.goal())          # para la prueba: el PD hace la ruta
    for _ in range(3000):
        fl.step()
        if fl.phase not in ("ruta", "aterrizaje"):
            break
    assert fl.phase == "aterrizado"
    assert np.linalg.norm(fl.state.pos[:2] - np.array([5, 1])) < 0.3


def test_cylinder_raycast_and_collision():
    lv = Level.from_dict({"cylinders": [{"center": [3, 0], "radius": 0.5, "z": [0, 4]}]})
    d = lv.raycast(np.array([0, 0, 1.0]), np.array([[1, 0, 0], [0, 1, 0.0]]), 5.0)
    assert np.allclose(d, [2.5, 5.0])
    assert np.isclose(lv.raycast(np.array([3, 0, 6.0]), np.array([[0, 0, -1.0]]), 5.0)[0], 2.0)  # tapa de arriba
    assert lv.collides(np.array([3.6, 0, 2]), 0.15) and not lv.collides(np.array([3.7, 0, 2]), 0.15)
    assert not lv.collides(np.array([3, 0, 4.2]), 0.15)


def test_cone_sensor_sees_thin_trunk_between_rays():
    from drone_rl.sensing import sensor_rays
    lv = Level.from_dict({"cylinders": [{"center": [3, 0.6], "radius": 0.2, "z": [0, 4]}]})
    rays = sensor_rays(QuadState(pos=np.array([0, 0, 1.0])), lv)
    assert rays[0] < 3.5                       # el sensor de adelante (cono) ve el tronco a 11°


def test_forest_keeps_spawn_and_goal_clear():
    from drone_rl.level import forest_level
    rng = np.random.default_rng(0)
    for _ in range(30):
        lv, trees = forest_level(rng, density=2.0)
        assert len(trees) > 20
        assert not lv.collides(np.array([0, 0, 1.0]), 0.5)          # se puede despegar
        assert not lv.collides(lv.goals[0], 0.8)                     # el aro está libre


def test_wind_pushes_hovering_drone():
    from drone_rl.physics import Wind
    w = Wind(5.0)
    rng = np.random.default_rng(1)
    base = w.reset(rng)
    s = QuadState(pos=np.array([0, 0, 3.0]))
    for _ in range(200):
        s, _ = step(s, hover_action(), 0.01, P, w.step(0.01, rng))
    assert np.dot(s.vel[:2], base[:2]) > 0                         # se lo lleva el viento


def test_speed_reward_prefers_fast_arrival():
    env = DroneEnv(stage=1, reward={**__import__("drone_rl").DEFAULT_REWARD, "speed": 1.0})
    env.reset(seed=0)
    env.state.pos = env.level.goals[0] - np.array([0.3, 0, 0])
    env.steps, env.seg_start, env.seg_len = 50, 0, 5.4             # 5.4 m en 1 s
    _, r_fast, *_ = env.step(np.zeros(4))
    env.reset(seed=0)
    env.state.pos = env.level.goals[0] - np.array([0.3, 0, 0])
    env.steps, env.seg_start, env.seg_len = 400, 0, 5.4            # 5.4 m en 8 s
    _, r_slow, *_ = env.step(np.zeros(4))
    assert r_fast > r_slow + 3


def test_forest_slalom_three_rings():
    from drone_rl.level import forest_level
    rng = np.random.default_rng(3)
    for _ in range(20):
        lv, trees = forest_level(rng, density=1.5, n_goals=3)
        assert len(lv.goals) == 3
        assert all(abs(g[0]) <= 20 and abs(g[1]) <= 20 for g in lv.goals)
        assert not any(lv.collides(g, 0.8) for g in lv.goals)


def test_heading_reward_prefers_nose_first():
    from drone_rl import DEFAULT_REWARD
    rw = {k: 0.0 for k in DEFAULT_REWARD}
    rw["heading"] = 1.0
    env = DroneEnv(stage=2, reward=rw)
    rewards = {}
    for name, yaw in (("frente", 0.0), ("espaldas", np.pi)):
        env.reset(seed=0)
        env.state.pos = np.array([0, 0, 2.0])
        env.state.vel = np.array([3.0, 0, 0])
        env.state.yaw = yaw
        _, r, *_ = env.step(np.zeros(4))
        rewards[name] = r
    assert rewards["frente"] == pytest.approx(0.0, abs=1e-9)
    assert rewards["espaldas"] < -0.015
