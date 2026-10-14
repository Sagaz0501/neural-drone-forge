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
    for stage in range(6):
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


def test_circuit_two_laps():
    from drone_rl import MISSIONS, OBS_LABELS
    env = DroneEnv(stage=5)
    env.reset(seed=0)
    assert len(env.level.goals) == 8                       # 4 aros x 2 vueltas
    assert len(OBS_LABELS) == env.observation_space.shape[0]
    assert set(MISSIONS) == set(range(6))
    assert run_pilot(5, episodes=5) == 1.0                 # el piloto PD completa las 2 vueltas


def _fail_episode(env):
    """Gas al mínimo: se queda en el suelo hasta que se acaba el tiempo (= falla)."""
    done = False
    while not done:
        _, _, term, trunc, info = env.step(np.array([-1.0, 0, 0, 0]))
        done = term or trunc
    return info


def test_retry_same_level_until_success():
    cfg = {"retry": True, "max_retries": 0, "checkpoint": True}
    env = DroneEnv(stage=3, max_seconds=0.2, curriculum=cfg)
    env.reset(seed=1)
    boxes, goal, yaw = env.level.box_min.copy(), env._goal().copy(), env.state.yaw
    for n in range(2, 5):
        assert not _fail_episode(env)["success"]
        env.reset()
        assert env.attempt == n                                   # intento 2, 3, 4...
        assert np.allclose(env.level.box_min, boxes) and np.allclose(env._goal(), goal)
        assert env.state.yaw == yaw                               # misma orientación inicial
    cfg["retry"] = False                                          # cambio en vivo: apagar
    _fail_episode(env)
    env.reset()
    assert env.attempt == 1 and not np.allclose(env._goal(), goal)


def test_retry_gives_up_after_max():
    env = DroneEnv(stage=3, max_seconds=0.2, curriculum={"retry": True, "max_retries": 2, "checkpoint": True})
    env.reset(seed=3)
    goal = env._goal().copy()
    _fail_episode(env); env.reset()
    assert env.attempt == 2 and np.allclose(env._goal(), goal)
    _fail_episode(env); env.reset()
    assert env.attempt == 1 and not np.allclose(env._goal(), goal)  # se rindió: nivel nuevo


def test_checkpoint_continues_from_last_ring():
    env = DroneEnv(stage=5, max_seconds=0.2, curriculum={"retry": True, "max_retries": 0, "checkpoint": True})
    env.reset(seed=0)
    env.goal_idx = 3                                              # ya había pasado 3 aros
    _fail_episode(env)
    env.reset()
    assert env.goal_idx == 3
    assert np.allclose(env.state.pos, env.level.goals[2])        # aparece en el último aro pasado
