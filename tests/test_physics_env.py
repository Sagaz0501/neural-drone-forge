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
    assert set(MISSIONS) == set(range(13))
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
    from drone_rl.upgrade import load_ppo
    model, npol = load_ppo(root / "models" / "anteriores" / "stage2.zip")[0], NumpyPolicy(npz)   # 24 -> 27
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
    out = {}
    for name, yaw0, yaw1 in (("mirando", 0.0, 0.0), ("espaldas", np.pi, np.pi), ("girando_hacia", np.pi, np.pi / 2),
                             ("girando_lejos", 0.0, np.pi / 2)):
        env.reset(seed=0)
        env.level.goals[0] = env.state.pos + np.array([5.0, 0, 0])
        env.state.yaw = yaw0
        env.prev_phi = env._heading_phi()
        env.state.yaw = yaw1                       # como si hubiera girado en este paso
        env.state.vel = np.zeros(3)
        _, r, *_ = env.step(np.zeros(4))
        out[name] = r
    assert out["mirando"] == pytest.approx(0.0, abs=1e-3)
    assert out["espaldas"] < 0                                  # cuesta cada segundo
    assert out["girando_hacia"] > 0.4 > -0.4 > out["girando_lejos"]   # girar hacia el aro paga en el acto


def test_old_24_input_obs_unchanged():
    """Las entradas nuevas van al final: con aros quietos 24-26 valen 0, sin sujeto 27-29 = la meta,
    sin toma 30-33 valen 0 y 34-37 son la física del dron."""
    env = DroneEnv(stage=2)
    o, _ = env.reset(seed=3)
    assert o.shape == (38,)
    assert np.all(o[24:27] == 0)
    assert np.allclose(o[27:30], o[0:3])
    assert np.all(o[30:34] == 0)
    assert np.allclose(o[34:38], [2.5 / 5, 0.6, 0.6, 0.8])


def test_hunt_birds_move_flee_and_get_caught():
    from drone_rl.birds import CATCH_R, FLEE_R, Flock
    env = DroneEnv(stage=8)
    env.reset(seed=4)
    fl = env.flock
    assert fl.n == 5 and fl.alive.all()
    p0 = fl.pos.copy()
    for _ in range(50):
        env.step(np.zeros(4))
    assert np.linalg.norm(fl.pos - p0, axis=1).min() > 0.5                        # vuelan solos
    assert np.allclose(fl.est_vel, fl.vel, atol=0.3)                             # el estimado se parece al real
    assert np.all(np.hypot(fl.pos[:, 0], fl.pos[:, 1]) < 13.5)                    # se quedan en el área
    # huyen: un dron justo al lado los hace alejarse
    f = Flock(1, 2.0).reset(np.random.default_rng(0), np.array([20.0, 0, 0]))
    drone = f.pos[0] - np.array([1.0, 0, 0])
    f.head[:] = np.pi                                   # peor caso: venía volando HACIA el dron
    f.vel[:] = [-2.0, 0, 0]
    for _ in range(50):
        f.step(0.02, np.zeros((1, 3)), drone)
    assert np.linalg.norm(f.pos[0] - drone) > 1.5 and np.cos(f.head[0]) > 0.5     # dio la vuelta y se aleja
    assert np.linalg.norm(f.pos[0] - drone) < FLEE_R + 2
    # cazar: poner el dron encima de su presa
    env.state.pos = fl.pos[env.target].copy() + np.array([0.0, 0, 0.1])
    t0 = env.target
    _, r, te, *_ = env.step(np.zeros(4))
    assert not fl.alive[t0] and env.goal_idx == 1 and r > 5 and not te and env.target != t0
    assert CATCH_R > 0.5


def test_widened_model_flies_exactly_like_before():
    """Ampliar 24 -> 27 entradas no cambia nada: mismas acciones y mismo valor con las entradas nuevas en 0."""
    import torch
    from pathlib import Path
    from stable_baselines3 import PPO
    from drone_rl.upgrade import load_ppo
    zp = Path(__file__).resolve().parents[1] / "models" / "anteriores" / "stage2.zip"
    old = PPO.load(zp, device="cpu")
    new, widened = load_ppo(zp)
    assert widened and new.observation_space.shape == (38,)
    assert new.num_timesteps == old.num_timesteps
    env = DroneEnv(stage=2)
    obs, _ = env.reset(seed=5)
    for _ in range(100):
        a_old = old.predict(obs[:24], deterministic=True)[0]
        a_new = new.predict(obs, deterministic=True)[0]
        assert np.allclose(a_old, a_new, atol=1e-6)
        with torch.no_grad():
            v_old = old.policy.predict_values(torch.as_tensor(obs[None, :24]))
            v_new = new.policy.predict_values(torch.as_tensor(obs[None]))
        assert torch.allclose(v_old, v_new, atol=1e-5)
        obs, _, te, tr, _ = env.step(a_new)
        if te or tr:
            break


def test_hunt_with_obstacles_birds_never_inside():
    """Caza entre columnas (9) y en el bosque (10): hay obstáculos y los pájaros nunca se meten en ellos."""
    for stage in (9, 10):
        env = DroneEnv(stage=stage, bird_speed=3.0)
        env.reset(seed=stage)
        lv = env.level
        assert len(lv.box_min) >= 5 if stage == 9 else len(lv.cyl_r) >= 20
        if stage == 10:
            assert env.flock.z_max < 2.6                          # debajo de las copas altas
        assert not lv.collides(env.state.pos + np.array([0, 0, 0.3]), 0.5)   # la salida queda libre
        for _ in range(1000):
            env.step(np.zeros(4))
            assert not lv.collides_many(env.flock.pos, 0.2).any()


def film_pilot(env):
    """Piloto clásico para grabar: sube por encima de la casa si estorba, va al inicio de la ruta y después sigue
    el punto de cámara (con su velocidad) mirando la casa. No usa red: prueba que el nivel se puede resolver."""
    from drone_rl.physics import throttle_to_action, yaw_frame
    s, p, sh = env.state, env.p, env.shot
    g, gv = sh.point(), sh.vel()
    tgt = g
    if sh.phase == "ir":
        blocked = any(env.level.collides(s.pos + (g - s.pos) * u, 1.0) for u in np.linspace(0, 1, 30))
        if blocked:
            tgt = np.array([s.pos[0], s.pos[1], 7.5]) if s.pos[2] < 7.0 else np.array([g[0], g[1], 7.5])
    vd = gv + 1.2 * (tgt - s.pos)
    n = np.linalg.norm(vd)
    if n > 3.0:
        vd *= 3.0 / n
    acc = 2.5 * (vd - s.vel)
    ah = yaw_frame(acc, s.yaw)
    pitch, roll = np.arctan2(ah[0], p.g), -np.arctan2(ah[1], p.g)
    thr = p.hover_throttle * (1 + acc[2] / p.g) / max(np.cos(roll) * np.cos(pitch), 0.5)
    d = env.subject - s.pos
    e = np.arctan2(np.sin(np.arctan2(d[1], d[0]) - s.yaw), np.cos(np.arctan2(d[1], d[0]) - s.yaw))
    return np.clip([throttle_to_action(float(np.clip(thr, 0, 1)), p), roll / p.max_angle, pitch / p.max_angle,
                    3.0 * e / p.yaw_rate], -1, 1)


def test_film_stage_solvable_and_rewards_framing():
    """Grabar (nivel 11): tomas con ruta (fija, órbita, revelar). Un piloto clásico que sigue el punto de cámara
    mirando la casa las logra; mirar para otro lado, quedarse atrás o ir a otro ritmo baja la calidad."""
    from drone_rl.sensing import film_quality
    from drone_rl.tomas import Toma
    env = DroneEnv(stage=11)
    seen, ok = set(), 0
    for ep in range(12):
        env.reset(seed=ep)
        seen.add(env.toma)
        done = False
        while not done:
            _, _, te, tr, info = env.step(film_pilot(env))
            done = te or tr
        assert not info["crashed"], (ep, info["crash_reason"])
        ok += info["success"]
    assert seen == {"fija", "orbita", "revelar"}
    assert ok >= 10
    # la calidad: en el punto de cámara, a su ritmo y mirando la casa vs. de espaldas, lejos o quieto
    t = Toma("orbita", [10.0, 0.0, 1.8], 10.0, r=8.0, z=3.5, a0=np.pi, sweep=np.pi / 2)
    t.t = 5.0
    cp, cv = t.at(0.5)
    s = QuadState(pos=cp.copy(), vel=cv.copy())
    s.yaw = float(np.arctan2(0.0 - cp[1], 10.0 - cp[0]))                     # la nariz hacia la casa
    good = film_quality(s, t.subject, cp, cv, 0.0)
    assert good["q"] > 0.7
    s.yaw += np.pi
    assert film_quality(s, t.subject, cp, cv, 0.0)["q"] == 0.0                 # de espaldas
    s.yaw -= np.pi
    s.pos = cp + np.array([0, 0, 2.5])
    assert film_quality(s, t.subject, cp, cv, 0.0)["track"] < 0.05            # lejos de la ruta
    s.pos, s.vel = cp.copy(), np.zeros(3)
    assert film_quality(s, t.subject, cp, cv, 0.0)["flow"] < film_quality(s, t.subject, cp, np.zeros(3), 0.0)["flow"]
    assert film_quality(s, t.subject, cp, np.zeros(3), 0.0, yaw_acc=12.0)["steady"] < 0.05   # paneo brusco


def test_shot_waits_then_runs():
    """La toma espera al dron en el inicio; cuando llega despacio, el punto recorre la ruta y termina."""
    from drone_rl.tomas import Toma
    t = Toma("revelar", [0.0, 0.0, 1.5], 4.0, az=0.0, d0=6.0, d1=10.0, z0=2.0, z1=6.0)
    t.step(0.02, np.array([0.0, 5.0, 2.0]), np.zeros(3))
    assert t.phase == "ir" and np.allclose(t.point(), [6, 0, 2]) and np.allclose(t.vel(), 0)
    t.step(0.02, np.array([6.2, 0.0, 2.0]), np.array([3.0, 0, 0]))           # rápido: todavía no
    assert t.phase == "ir"
    t.step(0.02, np.array([6.2, 0.0, 2.0]), np.array([0.5, 0, 0]))
    assert t.phase == "grabando"
    for _ in range(100):
        t.step(0.02, np.zeros(3), np.zeros(3))
    assert np.isclose(t.t, 2.0) and 6 < t.point()[0] < 10 and t.vel()[0] > 0
    for _ in range(200):
        t.step(0.02, np.zeros(3), np.zeros(3))
    assert t.phase == "lista" and np.allclose(t.point(), [10, 0, 6])


def test_drone_file_and_random_physics():
    """La física de un dron del juego (drones/madera.json) y la física al azar en cada intento."""
    from pathlib import Path
    root = Path(__file__).resolve().parents[1]
    p = QuadParams.load(root / "drones" / "madera.json")
    assert 1.5 < p.twr < 2.3 and 0.5 < p.mass < 0.8
    env = DroneEnv(stage=2, params=p)
    o, _ = env.reset(seed=0)
    assert np.allclose(o[34:38], [p.twr / 5, p.mass, p.drag * 20, p.att_resp / 10], atol=1e-6)
    rng = {"twr": [1.5, 6.0], "mass": [0.45, 1.0]}
    env = DroneEnv(stage=2, phys_range=rng)
    seen = set()
    for ep in range(5):
        env.reset(seed=ep)
        assert 1.5 <= env.p.twr <= 6.0 and 0.45 <= env.p.mass <= 1.0
        seen.add(round(env.p.twr, 3))
    assert len(seen) == 5


def test_widen_27_to_38_flies_the_same(tmp_path):
    """El modelo de la caza (27 entradas) ampliado a 38 hace exactamente lo mismo."""
    import torch
    from pathlib import Path
    from stable_baselines3 import PPO
    from drone_rl.upgrade import load_ppo, widen_state_dict
    zp = Path(__file__).resolve().parents[1] / "models" / "anteriores" / "stage2.zip"
    m27, _ = load_ppo(zp)                                   # 24 -> 38
    # armar un modelo de 27 entradas de verdad (con pesos distintos de 0 en 24-26)
    old = PPO.load(zp, device="cpu")
    env27 = DroneEnv(stage=8)
    env27.observation_space = __import__("gymnasium").spaces.Box(-3.0, 3.0, shape=(27,), dtype=np.float32)
    p27 = PPO("MlpPolicy", env27, device="cpu", policy_kwargs=old.policy_kwargs, verbose=0)
    sd = widen_state_dict(old.policy.state_dict(), p27.policy.state_dict())
    sd["mlp_extractor.policy_net.0.weight"][:, 24:] = 0.3
    p27.policy.load_state_dict(sd)
    p27.save(tmp_path / "m27.zip")
    new, widened = load_ppo(tmp_path / "m27.zip")
    assert widened and new.observation_space.shape == (38,)
    env = DroneEnv(stage=8)
    obs, _ = env.reset(seed=2)
    for _ in range(60):
        a27 = p27.predict(obs[:27], deterministic=True)[0]
        a38 = new.predict(obs, deterministic=True)[0]
        assert np.allclose(a27, a38, atol=1e-6)
        obs, _, te, tr, _ = env.step(a38)
        if te or tr:
            break
