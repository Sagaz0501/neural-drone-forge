"""
Entrenamiento EN VIVO: N drones aprenden mientras Blender los muestra.

Normalmente lo lanza el panel "Drone Lab" de Blender (blender/drone_lab.py), pero también
se puede correr a mano y mirar desde Blender:

    python scripts/live_train.py --drones 50 --stage 0

Protocolo (UDP en localhost, mensajes JSON, como telemetría de un dron real):
    trainer -> Blender  :9001   "h" hola · "f" posiciones · "l" nivel de un dron · "s" estadísticas · "m" mensaje
    Blender -> trainer  :9002   {"lr":…, "ent":…, "reward":{…}, "speed":"real|rapido", "pause":bool, "save":true, "stop":true}

Cada GENERACIÓN = un ciclo de PPO:
    1. VOLAR:     los N drones vuelan n_steps pasos con la red actual (juntan experiencia)
    2. APRENDER:  PPO actualiza la red con esa experiencia (los drones se quedan quietos)
"""
import argparse
import json
import math
import socket
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import numpy as np
from stable_baselines3 import PPO
from stable_baselines3.common.callbacks import BaseCallback
from stable_baselines3.common.env_util import make_vec_env
try:
    from stable_baselines3.common.utils import ConstantSchedule as _Const      # SB3 >= 2.6
except ImportError:
    from stable_baselines3.common.utils import constant_fn as _Const

from drone_rl import DEFAULT_REWARD, STAGES, DroneEnv


def r3(v):
    return [round(float(x), 3) for x in v]


class LiveLink(BaseCallback):
    def __init__(self, args, reward, save_path):
        super().__init__()
        self.args, self.reward, self.save_path = args, reward, save_path
        self.speed = args.speed
        self.lr, self.ent = args.lr, args.ent
        self.out = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.dst = ("127.0.0.1", args.port)
        self.ctrl = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.ctrl.bind(("127.0.0.1", args.ctrl_port))
        self.ctrl.setblocking(False)
        self.paused = self.stop = False
        self.phase = "fly"
        self.gen = 0
        self.total_eps = 0
        self.ep_succ, self.ep_crash, self.ep_rew = [], [], []
        self.history = []
        self.events = []
        self.next_tick = time.perf_counter()
        self.last_send = 0.0
        self.msg = ""

    # ---------------- envío ----------------
    def send(self, obj):
        try:
            self.out.sendto(json.dumps(obj, separators=(",", ":")).encode(), self.dst)
        except OSError:
            pass                      # Blender cerrado o lleno: seguimos entrenando igual

    def envs(self):
        return [e.unwrapped for e in self.training_env.envs]

    def send_level(self, i, env):
        lv = env.level
        self.send({"t": "l", "i": i,
                   "goals": [r3(g) for g in lv.goals],
                   "boxes": [r3(a) + r3(b) for a, b in zip(lv.box_min, lv.box_max)],
                   "spheres": [r3(c) + [round(float(r), 3)] for c, r in zip(lv.sph_c, lv.sph_r)]})

    def params(self):
        return {"lr": self.lr, "ent": self.ent, "reward": self.reward, "speed": self.speed,
                "drones": self.args.drones, "stage": self.args.stage, "paused": self.paused}

    def send_stats(self):
        w = max(2 * self.args.drones, 100)
        mean = lambda xs: float(np.mean(xs[-w:])) if xs else 0.0
        self.send({"t": "s", "phase": self.phase, "gen": self.gen, "steps": int(self.num_timesteps),
                   "eps": self.total_eps, "succ": mean(self.ep_succ), "crash": mean(self.ep_crash),
                   "rew": mean(self.ep_rew), "hist": self.history[-300:], "params": self.params(),
                   "msg": self.msg})

    def send_frame(self):
        d = []
        for e in self.envs():
            s = e.state
            d.append(r3(s.pos) + [round(s.roll, 3), round(s.pitch, 3), round(s.yaw, 3)] + r3(e._goal()))
        self.send({"t": "f", "s": int(self.num_timesteps), "d": d, "ev": self.events})
        self.events = []

    # ---------------- control desde Blender ----------------
    def poll_control(self):
        changed = False
        while True:
            try:
                data, _ = self.ctrl.recvfrom(65536)
            except (BlockingIOError, OSError):
                break
            try:
                m = json.loads(data)
            except ValueError:
                continue
            changed = True
            if "lr" in m:
                self.lr = float(m["lr"])
                self.model.lr_schedule = _Const(self.lr)
                for g in self.model.policy.optimizer.param_groups:
                    g["lr"] = self.lr
            if "ent" in m:
                self.ent = float(m["ent"])
                self.model.ent_coef = self.ent
            if "reward" in m:
                for k, v in m["reward"].items():
                    if k in self.reward:
                        self.reward[k] = float(v)       # el dict es compartido por todos los drones
            if "speed" in m:
                self.speed = m["speed"]
                self.next_tick = time.perf_counter()
            if "pause" in m:
                self.paused = bool(m["pause"])
            if m.get("save"):
                p = self.save_path.with_name(self.save_path.stem + f"_gen{self.gen}.zip")
                self.model.save(p)
                self.msg = f"Modelo guardado: models/{p.name}"
            if m.get("stop"):
                self.stop = True
        if changed:
            self.send_stats()

    # ---------------- ciclo de PPO ----------------
    def _on_training_start(self):
        self.send({"t": "h", "n": self.args.drones, "stage": self.args.stage,
                   "fixed_level": bool(self.args.level), "params": self.params()})
        for i, e in enumerate(self.envs()):
            self.send_level(i, e)

    def _on_rollout_start(self):
        self.gen += 1
        self.phase = "fly"
        self.send_stats()
        self.next_tick = time.perf_counter()

    def _on_rollout_end(self):
        w = max(2 * self.args.drones, 100)
        if self.ep_succ:
            self.history.append([self.gen, int(self.num_timesteps),
                                 round(float(np.mean(self.ep_succ[-w:])), 3),
                                 round(float(np.mean(self.ep_crash[-w:])), 3)])
        self.phase = "learn"           # ahora PPO actualiza la red; los drones esperan
        self.send_frame()
        self.send_stats()

    def _on_step(self) -> bool:
        self.poll_control()
        while self.paused and not self.stop:
            self.send_frame()
            time.sleep(0.05)
            self.poll_control()
        if self.stop:
            return False

        envs = self.envs()
        for i, (info, done) in enumerate(zip(self.locals["infos"], self.locals["dones"])):
            if done:
                st = 2 if info.get("success") else 1 if info.get("crashed") else 3
                self.events.append([i, st] + r3(info.get("pos", (0, 0, 0))))
                self.ep_succ.append(float(info.get("success", False)))
                self.ep_crash.append(float(info.get("crashed", False)))
                ep = info.get("episode")             # lo agrega el Monitor de SB3
                if ep:
                    self.ep_rew.append(float(ep["r"]))
                self.total_eps += 1
                if not self.args.level and self.args.stage >= 2:
                    self.send_level(i, envs[i])      # nivel aleatorio nuevo para ese dron

        now = time.perf_counter()
        if self.speed == "real":
            self.next_tick += envs[0].dt
            delay = self.next_tick - now
            if delay > 0:
                time.sleep(delay)
            elif delay < -0.25:
                self.next_tick = now                 # nos atrasamos: no intentar recuperar
            self.send_frame()
        elif now - self.last_send > 1 / 30 or self.events:
            self.send_frame()
            self.last_send = now
        return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--drones", type=int, default=50)
    ap.add_argument("--stage", type=int, default=0, choices=list(STAGES))
    ap.add_argument("--level", type=str, default=None, help="nivel JSON (todos los drones en el mismo nivel)")
    ap.add_argument("--init", type=str, default=None, help="continuar desde un modelo .zip")
    ap.add_argument("--lr", type=float, default=3e-4)
    ap.add_argument("--ent", type=float, default=0.0)
    ap.add_argument("--net", type=int, default=128, help="neuronas por capa oculta")
    ap.add_argument("--speed", choices=["real", "rapido"], default="real")
    ap.add_argument("--reward", type=str, default="{}", help='JSON, ej: {"crash": 20}')
    ap.add_argument("--steps", type=int, default=20_000_000)
    ap.add_argument("--port", type=int, default=9001)
    ap.add_argument("--ctrl-port", type=int, default=9002)
    ap.add_argument("--seed", type=int, default=0)
    args = ap.parse_args()

    reward = dict(DEFAULT_REWARD)
    reward.update({k: float(v) for k, v in json.loads(args.reward).items() if k in reward})

    n = args.drones
    env = make_vec_env(DroneEnv, n_envs=n, seed=args.seed,
                       env_kwargs=dict(stage=args.stage, level_path=args.level, reward=reward))
    n_steps = max(32, round(12_800 / n))         # ~12 800 pasos de experiencia por generación
    batch = min(1024, n_steps * n)

    name = Path(args.level).stem if args.level else STAGES[args.stage]
    save_path = ROOT / "models" / f"live_{name}_{time.strftime('%Y%m%d_%H%M%S')}.zip"
    save_path.parent.mkdir(exist_ok=True)

    if args.init:
        model = PPO.load(args.init, env=env, device="cpu",
                         custom_objects={"n_steps": n_steps, "batch_size": batch,
                                         "learning_rate": args.lr, "ent_coef": args.ent})
    else:
        model = PPO("MlpPolicy", env, device="cpu",
                    policy_kwargs=dict(net_arch=dict(pi=[args.net, args.net], vf=[args.net, args.net]),
                                       log_std_init=-0.7),
                    n_steps=n_steps, batch_size=batch, n_epochs=10, learning_rate=args.lr,
                    gamma=0.99, gae_lambda=0.95, clip_range=0.2, ent_coef=args.ent, seed=args.seed, verbose=0)

    link = LiveLink(args, reward, save_path)
    print(f"Drone Lab: {n} drones · nivel {name} · {n_steps} pasos por dron por generación", flush=True)
    try:
        model.learn(total_timesteps=args.steps, callback=link, reset_num_timesteps=not args.init)
    except KeyboardInterrupt:
        pass
    model.save(save_path)
    link.msg = f"Modelo guardado: models/{save_path.name}"
    link.phase = "stopped"
    link.send_stats()
    link.send({"t": "bye", "model": str(save_path)})
    print(link.msg, flush=True)


if __name__ == "__main__":
    main()
