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
    for stage in range(5):
        check_env(DroneEnv(stage=stage), skip_render_check=True)


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
