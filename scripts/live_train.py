"""
Entrenamiento EN VIVO: N drones aprenden mientras Blender los muestra.

Normalmente lo lanza el panel "Drone Lab" de Blender (blender/drone_lab.py), pero también
se puede correr a mano y mirar desde Blender:

    python scripts/live_train.py --drones 50 --stage 0

Protocolo (UDP en localhost, mensajes JSON, como telemetría de un dron real):
    trainer -> Blender  :9001   "h" hola + misión · "f" posiciones · "l" nivel de un dron · "s" estadísticas
                                "a" activaciones de la red del dron observado · "w" conexiones más fuertes
    Blender -> trainer  :9002   {"lr":…, "ent":…, "log_std":…, "reward":{…}, "speed":"real|rapido", "pause":bool,
                                 "env": {"density":…, "wind":…}, "watch": i, "save":true, "export":true, "stop":true}
    "export": guarda el modelo actual y lo pasa a numpy (.npz) para probarlo en un escenario de Blender;
              responde con {"t": "x", "npz": ruta}.

UN SOLO MODELO: todo el entrenamiento (cualquier nivel, cualquier número de drones) vive en
models/modelo.zip. Si existe, se continúa; si no, se crea una red nueva al azar. Se guarda solo
cada 10 generaciones y al detener. Su historia (pasos, generaciones, curva de éxito y en qué nivel
se entrenó) va en models/modelo.json, así la curva del laboratorio muestra el desarrollo completo.
Los N drones del laboratorio son N copias del MISMO cerebro: todo lo que viven entrena esa única red.

Cada GENERACIÓN = un ciclo de PPO:
    1. VOLAR:     los N drones vuelan n_steps pasos con la red actual (juntan experiencia)
    2. APRENDER:  PPO actualiza la red con esa experiencia (los drones se quedan quietos)
"""
import argparse
import json
import math
import os
import socket
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))

import numpy as np
import torch
from stable_baselines3 import PPO
from stable_baselines3.common.callbacks import BaseCallback
from stable_baselines3.common.env_util import make_vec_env
try:
    from stable_baselines3.common.utils import ConstantSchedule as _Const      # SB3 >= 2.6
except ImportError:
    from stable_baselines3.common.utils import constant_fn as _Const

from drone_rl import ACT_LABELS, DEFAULT_REWARD, MISSIONS, OBS_LABELS, STAGES, DroneEnv
from drone_rl.env import LEVEL_MISSION

TOP_K = (300, 500, 512)        # conexiones a mandar por capa (las de mayor |peso|)
CHUNK = 6000                   # bytes por datagrama (macOS: máximo ~9216)


def r3(v):
    return [round(float(x), 3) for x in v]


class LiveLink(BaseCallback):
    def __init__(self, args, reward, model_path, meta):
        super().__init__()
        self.args, self.reward, self.model_path, self.meta = args, reward, model_path, meta
        self.speed = args.speed
        self.lr, self.ent = args.lr, args.ent
        self.out = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.dst = ("127.0.0.1", args.port)
        self.ctrl = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.ctrl.bind(("127.0.0.1", args.ctrl_port))
        self.ctrl.setblocking(False)
        self.paused = self.stop = False
        self.phase = "fly"
        self.gen = int(meta.get("generaciones", 0))       # el modelo sigue contando donde se quedó
        self.gen_done = self.gen                          # última generación que ya aprendió
        self.total_eps = 0
        self.ep_succ, self.ep_crash, self.ep_rew = [], [], []
        self.ep_speed, self.ep_ang = [], []          # cómo vuelan los que llegan: rapidez y estabilidad
        self.ep_front = []                           # qué tanto vuelan de frente (todos los intentos)
        self.density, self.wind = args.density, args.wind
        self.history = list(meta.get("historia", []))     # [gen, pasos, éxito, crash, nivel]
        self.session = {"inicio": time.strftime("%Y-%m-%d %H:%M:%S"), "nivel": args.stage, "drones": args.drones}
        self.events = []
        self.next_tick = time.perf_counter()
        self.last_send = 0.0
        self.last_act = 0.0
        self.watch = args.watch % args.drones
        self.msg = ""

    # ---------------- envío ----------------
    def send(self, obj):
        """Manda un mensaje JSON. macOS limita cada datagrama UDP a ~9 KB, así que los
        mensajes grandes (pesos de la red, curva de progreso) se parten en pedazos ("c")."""
        data = json.dumps(obj, separators=(",", ":"))
        try:
            if len(data) <= CHUNK:
                self.out.sendto(data.encode(), self.dst)
                return
            self.msg_id = getattr(self, "msg_id", 0) + 1
            parts = [data[i:i + CHUNK] for i in range(0, len(data), CHUNK)]
            for k, part in enumerate(parts):
                self.out.sendto(json.dumps({"t": "c", "id": self.msg_id, "k": k, "n": len(parts), "p": part},
                                           separators=(",", ":")).encode(), self.dst)
        except OSError:
            pass                      # Blender cerrado o lleno: seguimos entrenando igual

    def envs(self):
        return [e.unwrapped for e in self.training_env.envs]

    def send_level(self, i, env, cap=36):
        lv = env.level
        spheres = [r3(c) + [round(float(r), 3)] for c, r in zip(lv.sph_c, lv.sph_r)]
        cyls = [r3(c) + [round(float(r), 3)] + r3(z) for c, r, z in zip(lv.cyl_xy, lv.cyl_r, lv.cyl_z)]
        if len(spheres) + len(cyls) > cap:
            # un bosque tiene ~100 piezas: a Blender solo le mandamos las más cercanas al camino
            path = np.array([lv.spawn] + list(lv.goals))[:, :2]
            a, ab = path[:-1], path[1:] - path[:-1]

            def gap(xy, r):
                u = np.clip(np.sum((xy - a) * ab, axis=1) / np.maximum(np.sum(ab * ab, axis=1), 1e-9), 0, 1)
                return float(np.min(np.linalg.norm(a + ab * u[:, None] - xy, axis=1))) - r

            ranked = sorted([(gap(np.array(s[:2]), s[3]), "s", s) for s in spheres]
                            + [(gap(np.array(c[:2]), c[2]), "c", c) for c in cyls], key=lambda t: t[0])
            keep = [t for t in ranked if t[0] < 3.0][:cap]
            spheres = [t[2] for t in keep if t[1] == "s"]
            cyls = [t[2] for t in keep if t[1] == "c"]
        self.send({"t": "l", "i": i, "spawn": r3(lv.spawn),
                   "goals": [r3(g) for g in lv.goals],
                   "boxes": [r3(a) + r3(b) for a, b in zip(lv.box_min, lv.box_max)],
                   "spheres": spheres, "cylinders": cyls})

    def params(self):
        sigma = float(torch.exp(self.model.policy.log_std.detach()).mean()) if getattr(self, "model", None) is not None else 0.0
        return {"lr": self.lr, "ent": self.ent, "sigma": round(sigma, 3), "reward": self.reward, "speed": self.speed,
                "drones": self.args.drones, "stage": self.args.stage, "paused": self.paused,
                "density": self.density, "wind": self.wind}

    def send_stats(self):
        w = max(2 * self.args.drones, 100)
        mean = lambda xs: float(np.mean(xs[-w:])) if xs else 0.0
        self.send({"t": "s", "phase": self.phase, "gen": self.gen, "steps": int(self.num_timesteps),
                   "eps": self.total_eps, "succ": mean(self.ep_succ), "crash": mean(self.ep_crash),
                   "rew": mean(self.ep_rew), "hist": self.hist_to_send(), "params": self.params(),
                   "spd": mean(self.ep_speed), "ang": mean(self.ep_ang), "front": mean(self.ep_front), "msg": self.msg})

    def hist_to_send(self, n=300):
        h = self.history
        if len(h) <= n:
            return h
        step = len(h) / n                       # toda la vida del modelo, resumida en n puntos
        return [h[int(i * step)] for i in range(n - 1)] + [h[-1]]

    # ---------------- el modelo único ----------------
    def save_model(self):
        """Guarda models/modelo.zip (+ modelo.json) sin dejar nunca un archivo a medias."""
        tmp = self.model_path.with_name("modelo_guardando.zip")
        self.model.save(tmp)
        os.replace(tmp, self.model_path)
        self.meta.update(generaciones=self.gen_done, pasos=int(self.num_timesteps), historia=self.history,
                         actualizado=time.strftime("%Y-%m-%d %H:%M"))
        ses = dict(self.session, fin=time.strftime("%Y-%m-%d %H:%M"), pasos_fin=int(self.num_timesteps))
        sesiones = self.meta.setdefault("sesiones", [])
        if sesiones and sesiones[-1].get("inicio") == ses["inicio"]:
            sesiones[-1] = ses
        else:
            sesiones.append(ses)
        niveles = self.meta.setdefault("niveles", {})
        k = STAGES[self.args.stage] if not self.args.level else Path(self.args.level).stem
        niveles[k] = niveles.get(k, 0) + int(self.num_timesteps) - self.meta.get("_pasos_contados", self.steps0)
        self.meta["_pasos_contados"] = int(self.num_timesteps)
        tmpj = self.model_path.with_name("modelo_guardando.json")
        tmpj.write_text(json.dumps(self.meta, ensure_ascii=False))
        os.replace(tmpj, self.model_path.with_suffix(".json"))
        self.save_web()

    def save_web(self):
        """models/modelo_web.json: los pesos del actor para el juego del navegador (game/)."""
        layers = []
        for L in self.layers():
            W = L.weight.detach().cpu().numpy().astype(np.float32)
            b = L.bias.detach().cpu().numpy().astype(np.float32)
            layers.append({"in": int(W.shape[1]), "out": int(W.shape[0]),
                           "W": [float(f"{x:.7g}") for x in W.ravel()], "b": [float(f"{x:.7g}") for x in b]})
        meta = {k: self.meta.get(k) for k in ("generaciones", "pasos", "niveles", "creado", "actualizado")}
        meta["sizes"] = [layers[0]["in"]] + [L["out"] for L in layers]
        web = self.model_path.with_name(self.model_path.stem + "_web.json")
        tmp = self.model_path.with_name("modelo_web_guardando.json")
        tmp.write_text(json.dumps({"meta": meta, "layers": layers}, separators=(",", ":")))
        os.replace(tmp, web)

    def send_frame(self):
        d = []
        for e in self.envs():
            s = e.state
            hold = e.hold / e.hold_steps if e.hold_steps else 0.0
            d.append(r3(s.pos) + [round(s.roll, 3), round(s.pitch, 3), round(s.yaw, 3), e.goal_idx, round(hold, 2)])
        self.send({"t": "f", "s": int(self.num_timesteps), "d": d, "ev": self.events, "w": self.watch})
        self.events = []

    # ---------------- la red neuronal, para verla en Blender ----------------
    def layers(self):
        """Capas lineales del ACTOR: 24 -> 128 -> 128 -> 4."""
        pol = self.model.policy
        lin = [m for m in pol.mlp_extractor.policy_net if isinstance(m, torch.nn.Linear)]
        return lin + [pol.action_net]

    def send_weights(self):
        out = []
        for layer, k in zip(self.layers(), TOP_K):
            w = layer.weight.detach().cpu().numpy()          # (salidas, entradas)
            flat = np.abs(w).ravel()
            k = min(k, flat.size)
            idx = np.argpartition(-flat, k - 1)[:k]
            j, i = np.unravel_index(idx, w.shape)            # i = neurona origen, j = destino
            out.append([[int(a), int(b), round(float(w[b, a]), 4)] for a, b in zip(i, j)])
        self.send({"t": "w", "gen": self.gen, "l": out})

    def send_activations(self, obs_tensor, actions):
        x = obs_tensor[self.watch:self.watch + 1].float()
        hidden = []
        with torch.no_grad():
            h = x
            for m in self.model.policy.mlp_extractor.policy_net:
                h = m(h)
                if not isinstance(m, torch.nn.Linear):       # salida de la activación (tanh)
                    hidden.append(h[0].cpu().numpy())
            mu = self.model.policy.action_net(h)[0].cpu().numpy()
        r = lambda v: [round(float(a), 3) for a in v]
        self.send({"t": "a", "i": self.watch, "in": r(x[0].cpu().numpy()), "h": [r(a) for a in hidden],
                   "mu": r(np.clip(mu, -1, 1)), "act": r(np.clip(actions[self.watch], -1, 1))})

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
            if "log_std" in m:
                with torch.no_grad():
                    self.model.policy.log_std.fill_(float(m["log_std"]))   # ruido de exploración
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
            if "env" in m:                          # ambiente: aplica desde el próximo intento de cada dron
                self.density = float(m["env"].get("density", self.density))
                self.wind = float(m["env"].get("wind", self.wind))
                for e in self.envs():
                    e.density = self.density
                    e.wind.max_speed = self.wind
            if "watch" in m:
                self.watch = int(m["watch"]) % self.args.drones
            if "pause" in m:
                self.paused = bool(m["pause"])
            if m.get("save"):
                self.save_model()
                self.msg = f"Modelo guardado (generación {self.gen}): models/modelo.zip"
            if m.get("resend"):                     # Blender reconstruyó su vista
                self._on_training_start()
            if m.get("export"):
                from export_policy import export
                self.save_model()
                npz = self.model_path.with_suffix(".npz")
                export(self.model_path, npz)
                self.msg = f"Generación {self.gen} lista para probar"
                self.send({"t": "x", "npz": str(npz), "zip": str(self.model_path), "gen": self.gen})
            if m.get("stop"):
                self.stop = True
        if changed:
            self.send_stats()

    # ---------------- ciclo de PPO ----------------
    def _on_training_start(self):
        mission = LEVEL_MISSION if self.args.level else MISSIONS[self.args.stage]
        self.steps0 = getattr(self, "steps0", int(self.num_timesteps))
        self.send({"t": "h", "n": self.args.drones, "stage": self.args.stage,
                   "modelo": {"nuevo": not self.meta.get("generaciones"), "pasos": int(self.num_timesteps),
                              "generaciones": self.gen},
                   "fixed_level": bool(self.args.level), "params": self.params(), "mission": mission,
                   "obs_labels": OBS_LABELS, "act_labels": ACT_LABELS})
        for i, e in enumerate(self.envs()):
            self.send_level(i, e)
        self.send_weights()

    def _on_rollout_start(self):
        if getattr(self, "flown", False):            # PPO acaba de aprender de la generación self.gen
            self.gen_done = self.gen
            self.send_weights()                      # la red acaba de cambiar
            if self.gen % 10 == 0:
                self.save_model()                    # autoguardado
        self.gen += 1                                # generación nueva
        self.flown = True
        self.phase = "fly"
        self.send_stats()
        self.next_tick = time.perf_counter()

    def _on_rollout_end(self):
        w = max(2 * self.args.drones, 100)
        if self.ep_succ:
            self.history.append([self.gen, int(self.num_timesteps),
                                 round(float(np.mean(self.ep_succ[-w:])), 3),
                                 round(float(np.mean(self.ep_crash[-w:])), 3), self.args.stage])
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
                if info.get("front") is not None:
                    self.ep_front.append(float(info["front"]))
                if info.get("success") and "avg_speed" in info:
                    self.ep_speed.append(float(info["avg_speed"]))
                    self.ep_ang.append(float(info["ang_rate"]))
                self.ep_crash.append(float(info.get("crashed", False)))
                ep = info.get("episode")             # lo agrega el Monitor de SB3
                if ep:
                    self.ep_rew.append(float(ep["r"]))
                self.total_eps += 1
                if not self.args.level and self.args.stage >= 2:
                    self.send_level(i, envs[i])      # nivel aleatorio nuevo para ese dron

        now = time.perf_counter()
        if now - getattr(self, "last_stats", 0.0) > 1.0:
            self.send_stats()                        # HUD al día aunque la generación sea larga
            self.last_stats = now
        if now - self.last_act > 1 / 15:
            self.send_activations(self.locals["obs_tensor"], self.locals["clipped_actions"]
                                  if "clipped_actions" in self.locals else self.locals["actions"])
            self.last_act = now
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
    ap.add_argument("--model", type=str, default=str(ROOT / "models" / "modelo.zip"),
                    help="EL modelo: si existe se continúa, si no se crea uno nuevo")
    ap.add_argument("--lr", type=float, default=3e-4)
    ap.add_argument("--ent", type=float, default=0.0)
    ap.add_argument("--net", type=int, default=128, help="neuronas por capa oculta (solo al crear el modelo)")
    ap.add_argument("--speed", choices=["real", "rapido"], default="real")
    ap.add_argument("--reward", type=str, default="{}", help='JSON, ej: {"crash": 20}')
    ap.add_argument("--steps", type=int, default=20_000_000)
    ap.add_argument("--port", type=int, default=9001)
    ap.add_argument("--ctrl-port", type=int, default=9002)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--watch", type=int, default=0, help="dron cuya red neuronal se manda a Blender")
    ap.add_argument("--log-std", type=float, default=None, help="ruido de exploración inicial (log σ)")
    ap.add_argument("--density", type=float, default=1.0, help="bosque: 0.5 claro · 1 normal · 2 denso")
    ap.add_argument("--wind", type=float, default=0.0, help="viento máx. con ráfagas (m/s)")
    args = ap.parse_args()

    reward = dict(DEFAULT_REWARD)
    reward.update({k: float(v) for k, v in json.loads(args.reward).items() if k in reward})

    n = args.drones
    env = make_vec_env(DroneEnv, n_envs=n, seed=args.seed,
                       env_kwargs=dict(stage=args.stage, level_path=args.level, reward=reward,
                                       density=args.density, wind=args.wind))
    n_steps = max(32, round(12_800 / n))         # ~12 800 pasos de experiencia por generación
    batch = min(1024, n_steps * n)

    name = Path(args.level).stem if args.level else STAGES[args.stage]
    model_path = Path(args.model).expanduser().resolve()
    model_path.parent.mkdir(exist_ok=True)
    meta_path = model_path.with_suffix(".json")
    existe = model_path.exists()
    meta = json.loads(meta_path.read_text()) if (existe and meta_path.exists()) else {}

    if existe:
        model = PPO.load(model_path, env=env, device="cpu",
                         custom_objects={"n_steps": n_steps, "batch_size": batch,
                                         "learning_rate": args.lr, "ent_coef": args.ent})
        meta.setdefault("pasos", int(model.num_timesteps))
    else:
        meta = {"creado": time.strftime("%Y-%m-%d %H:%M"), "red": [24, args.net, args.net, 4],
                "generaciones": 0, "pasos": 0, "historia": [], "sesiones": [], "niveles": {}}
        model = PPO("MlpPolicy", env, device="cpu",
                    policy_kwargs=dict(net_arch=dict(pi=[args.net, args.net], vf=[args.net, args.net]),
                                       log_std_init=-0.7),
                    n_steps=n_steps, batch_size=batch, n_epochs=10, learning_rate=args.lr,
                    gamma=0.99, gae_lambda=0.95, clip_range=0.2, ent_coef=args.ent, seed=args.seed, verbose=0)

    if args.log_std is not None:
        with torch.no_grad():
            model.policy.log_std.fill_(args.log_std)
    link = LiveLink(args, reward, model_path, meta)
    estado = (f"continuando el modelo ({int(model.num_timesteps):,} pasos, generación {link.gen})" if existe
              else "modelo NUEVO (red al azar)")
    print(f"Drone Lab: {n} drones · nivel {name} · {n_steps} pasos por dron por generación · {estado}", flush=True)
    try:
        model.learn(total_timesteps=args.steps, callback=link, reset_num_timesteps=not existe)
    except KeyboardInterrupt:
        pass
    link.save_model()
    link.msg = f"Modelo guardado (generación {link.gen}): models/{model_path.name}"
    link.phase = "stopped"
    link.send_stats()
    link.send({"t": "bye", "model": str(model_path)})
    print(link.msg, flush=True)


if __name__ == "__main__":
    main()
