"""
Entrenamiento EN VIVO: N drones aprenden mientras Blender los muestra.

Normalmente lo lanza el panel "Drone Lab" de Blender (blender/drone_lab.py), pero también
se puede correr a mano y mirar desde Blender:

    python scripts/live_train.py --drones 50 --stage 0

Protocolo (UDP en localhost, mensajes JSON, como telemetría de un dron real). Puertos: --port / --ctrl-port
(Dron Maker usa 9011/9012; drone-rl, el otro proyecto, 9001/9002):
    trainer -> Blender  "h" hola + misión · "f" posiciones · "l" nivel de un dron · "s" estadísticas
                        "a" activaciones de la red del dron observado · "w" conexiones más fuertes
                        (lo mismo, 4 veces por segundo, en <estado>_red.json: el estudio PBDMM del juego lo dibuja)
    Blender -> trainer  {"lr":…, "ent":…, "log_std":…, "reward":{…}, "speed":"real|rapido", "pause":bool,
                         "env": {"density":…, "wind":…}, "watch": i, "save":true, "export":true, "stop":true}
    Grabar (nivel 11):  "l" lleva "film": {"subject": [x,y,z], "band": [d_min, d_max, z_min, z_max],
                        "house": [cx, cy, largo_x, ancho_y, alto_paredes], "toma"}; "f" lleva "q" (calidad de imagen
                        de cada dron, 0-1) y "fg" (cuánto lleva de la toma, 0-1). La historia por generación es
                        [gen, pasos, éxito, choque, nivel, calidad media] (calidad = None fuera de grabar).
    "export": guarda el modelo actual y lo pasa a numpy (.npz) para probarlo en un escenario de Blender;
              responde con {"t": "x", "npz": ruta}.

QUÉ DRON: --dron drones/madera.json entrena con la física de un dron armado en el juego;
--dron azar sortea la física en cada intento dentro de drones/rango_juego.json (así la red aprende a
volar "cualquier" dron del juego). Lo que el modelo ya conoce queda en modelo.json y modelo_web.json
(meta.rango_fisica): el juego lo lee para saber si la IA sabe volar el dron del jugador.

UN MODELO POR DRON: --model dice cuál (por defecto models/modelo.zip, el modelo "base"; los drones del
hangar tienen el suyo en models/drones/<slug>/modelo.zip). Si existe, se continúa; si no, se crea una red
nueva al azar. Se guarda solo cada 10 generaciones y al detener. TODO lo que se escribe sale de la carpeta del
modelo: modelo.json (historia: pasos, generaciones, curva de éxito, niveles), modelo_web.json (pesos para el
navegador), modelo.npz ("export"), los *_guardando temporales y anteriores/ (copia antes de ampliar la red).
El progreso en vivo va a --estado (por defecto models/entrenando.json; trae "modelo": "base" o el slug).
Los N drones del laboratorio son N copias del MISMO cerebro: todo lo que viven entrena esa única red.

SIN BLENDER (entrenar "en el fondo", lo lanza scripts/jugar.py): mandar UDP a un puerto donde nadie escucha no
falla (send() ignora los errores). El control llega igual por --ctrl-port: cada datagrama es UN objeto JSON
(utf-8), el mismo que manda Blender (drone_lab.py send_ctrl), con las claves que hagan falta:
    {"stop": true}                 detener: termina la generación, guarda (zip + json + web) y sale
    {"pause": true|false}          pausar / seguir (en pausa se sigue escribiendo el progreso cada 1 s)
    {"save": true}                 guardar ya · {"export": true} guardar + npz
    {"reward": {"crash": 20, …}}   premios en vivo · {"env": {"wind": 2.5, "density": 1}} ambiente
    {"speed": "real"|"rapido"} · {"lr": 3e-4} · {"ent": 0.0} · {"log_std": -0.7} · {"watch": i}

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
from drone_rl.env import FILM_STAGES, HUNT_STAGES, LEVEL_MISSION, PHOTO_STAGES
from drone_rl.physics import QuadParams
import simulacion as SIM                       # noqa: E402  (scripts/simulacion.py: las grabaciones del Avance)

STANDARD_RANGE = {"twr": [2.3, 2.7], "masa_kg": [0.55, 0.65]}     # el dron de siempre (0.6 kg, 2.5)


def load_drone(arg):
    """--dron: None (el dron de siempre), 'azar' (física al azar del juego) o un drones/*.json.
    Devuelve (params, phys_range, nombre, rango que aprende {"twr": [..], "masa_kg": [..]})."""
    if not arg:
        return None, None, "estándar", STANDARD_RANGE
    if arg == "azar":
        r = json.loads((ROOT / "drones" / "rango_juego.json").read_text(encoding="utf-8"))
        rng = {k: v for k, v in r.items() if not k.startswith("_")}
        return None, rng, "al azar", {"twr": list(rng["twr"]), "masa_kg": list(rng["mass"])}
    path = Path(arg).expanduser()
    if not path.is_absolute():
        path = ROOT / path
    d = json.loads(path.read_text(encoding="utf-8"))
    p = QuadParams.from_dict(d)
    return p, None, d.get("nombre", path.stem), {"twr": [p.twr * 0.92, p.twr * 1.08], "masa_kg": [p.mass * 0.92, p.mass * 1.08]}


def model_slug(model_path):
    """'base' si es models/modelo.zip; si no, el nombre de su carpeta (models/drones/<slug>/modelo.zip)."""
    p = Path(model_path).resolve()
    datos = Path(os.environ.get("DRONMAKER_DATOS") or ROOT)       # la app instalada: los modelos en la carpeta del usuario
    if p.parent in ((ROOT / "models").resolve(), (datos / "models").resolve()):
        return "base"
    return p.parent.name


def merge_range(a, b):
    """Unión de dos rangos de física (lo que el modelo ya conocía + lo que aprende ahora)."""
    if not a:
        return {k: [round(v[0], 3), round(v[1], 3)] for k, v in b.items()}
    return {k: [round(min(a[k][0], b[k][0]), 3), round(max(a[k][1], b[k][1]), 3)] for k in b}

TOP_K = (300, 500, 512)        # conexiones a mandar por capa (las de mayor |peso|)
RED_K = 160                    # las que ve el juego por capa (archivo <estado>_red.json)
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
        self.bird_speed, self.n_birds = args.bird_speed, args.birds
        self.ep_goals = []                           # caza: cuántos pájaros caza por intento
        self.ep_film = []                            # grabar: calidad media de la imagen por intento
        self.history = list(meta.get("historia", []))     # [gen, pasos, éxito, crash, nivel, calidad (grabar)]
        self.session = {"inicio": time.strftime("%Y-%m-%d %H:%M:%S"), "nivel": args.stage, "drones": args.drones}
        self.events = []
        self.next_tick = time.perf_counter()
        self.last_send = 0.0
        self.last_act = 0.0
        self.last_red = 0.0
        self.red_w = []                                    # conexiones más fuertes de cada capa (para el juego)
        self.red_path = Path(args.estado).with_name(Path(args.estado).stem + "_red.json")
        self.grab = None                                   # una Grabacion por dron (scripts/simulacion.py)
        self.avance = SIM.Avance(Path(model_path).parent / "avance.json")
        self.avance_t = 0.0
        self.watch = args.watch % args.drones
        self.padre = os.getppid()                          # quién lo lanzó (Blender): si cambia, quedó huérfano
        self.revisa_padre = 0.0
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
        if env.flock is not None and len(spheres) + len(cyls) > cap:
            # caza en el bosque: sin las copas altas (tapan a los pájaros, que vuelan debajo) y lo más cercano
            # a la salida primero. Es solo lo que se DIBUJA: la física usa todo el bosque.
            sp = lv.spawn[:2]
            low = [s for s in spheres if s[2] - s[3] < 2.4]
            ranked = sorted([(float(np.hypot(s[0] - sp[0], s[1] - sp[1])), "s", s) for s in low]
                            + [(float(np.hypot(c[0] - sp[0], c[1] - sp[1])), "c", c) for c in cyls], key=lambda t: t[0])
            keep = ranked[:cap + 24]
            spheres = [t[2] for t in keep if t[1] == "s"]
            cyls = [t[2] for t in keep if t[1] == "c"]
        elif len(spheres) + len(cyls) > cap:
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
        fl = env.flock
        msg = {"t": "l", "i": i, "spawn": r3(lv.spawn),
               "goals": [r3(g) for g in (fl.pos if fl is not None else lv.goals)],
               "birds": fl is not None,
               "boxes": [r3(a) + r3(b) for a, b in zip(lv.box_min, lv.box_max)],
               "spheres": spheres, "cylinders": cyls}
        if getattr(env, "subject", None) is not None and len(lv.box_min):
            # grabar: la casa (sus paredes son la 1a caja de level.house_boxes), el sujeto y la zona del cliente
            mn, mx = lv.box_min[0], lv.box_max[0]
            msg["film"] = {"subject": r3(env.subject), "band": [round(float(x), 3) for x in env.band],
                           "house": [round(float((mn[0] + mx[0]) / 2), 3), round(float((mn[1] + mx[1]) / 2), 3),
                                     round(float(mx[0] - mn[0]), 3), round(float(mx[1] - mn[1]), 3),
                                     round(float(mx[2]), 3)],
                           "toma": env.toma, "path": [r3(q) for q in env.shot.path(24)] if env.shot is not None else []}
        self.send(msg)

    def params(self):
        sigma = float(torch.exp(self.model.policy.log_std.detach()).mean()) if getattr(self, "model", None) is not None else 0.0
        return {"lr": self.lr, "ent": self.ent, "sigma": round(sigma, 3), "reward": self.reward, "speed": self.speed,
                "drones": self.args.drones, "stage": self.args.stage, "paused": self.paused, "dron": self.args.dron_nombre,
                "density": self.density, "wind": self.wind, "bird_speed": self.bird_speed, "n_birds": self.n_birds}

    def send_stats(self, force=False):
        w = max(2 * self.args.drones, 100)
        mean = lambda xs: float(np.mean(xs[-w:])) if xs else 0.0
        msg = {"t": "s", "phase": self.phase, "gen": self.gen, "steps": int(self.num_timesteps),
               "eps": self.total_eps, "succ": mean(self.ep_succ), "crash": mean(self.ep_crash),
               "rew": mean(self.ep_rew), "hist": self.hist_to_send(), "params": self.params(),
               "spd": mean(self.ep_speed), "ang": mean(self.ep_ang), "front": mean(self.ep_front),
               "goals": mean(self.ep_goals), "film": mean(self.ep_film), "msg": self.msg}
        self.send(msg)
        self.write_status(msg, force)

    def write_status(self, msg, force=False):
        """--estado (models/entrenando.json): lo mismo que ve Blender, para que el juego (app/) muestre el progreso."""
        now = time.time()
        if not force and now - getattr(self, "last_status", 0.0) < 0.5:
            return
        self.last_status = now
        out = dict(msg, t=now, mision=STAGES[self.args.stage] if not self.args.level else Path(self.args.level).stem,
                   stage=self.args.stage, dron=self.args.dron_nombre, gen_guardada=self.gen_done,
                   modelo=self.args.modelo_slug, modelo_zip=str(self.model_path), pid=os.getpid())
        out["hist"] = msg["hist"][-120:]
        path = Path(self.args.estado)
        tmp = path.with_name(path.stem + "_guardando.json")
        try:
            tmp.write_text(json.dumps(out, separators=(",", ":")))
            os.replace(tmp, path)
        except OSError:
            pass

    def hist_to_send(self, n=300):
        h = self.history
        if len(h) <= n:
            return h
        step = len(h) / n                       # toda la vida del modelo, resumida en n puntos
        return [h[int(i * step)] for i in range(n - 1)] + [h[-1]]

    # ---------------- el modelo único ----------------
    def save_model(self):
        """Guarda el modelo (.zip + .json + _web.json, en su carpeta) sin dejar nunca un archivo a medias."""
        tmp = self.model_path.with_name(self.model_path.stem + "_guardando.zip")
        self.model.save(tmp)
        os.replace(tmp, self.model_path)
        self.meta.update(generaciones=self.gen_done, pasos=int(self.num_timesteps), historia=self.history,
                         actualizado=time.strftime("%Y-%m-%d %H:%M"))
        # qué sabe el modelo (lo lee el juego): qué drones vuela y qué tomas graba
        self.meta["rango_fisica"] = merge_range(self.meta.get("rango_fisica") or STANDARD_RANGE, self.args.rango)
        drones = self.meta.setdefault("drones", [])
        if self.args.dron_nombre not in drones:
            drones.append(self.args.dron_nombre)
        if self.args.stage in FILM_STAGES:
            tomas = self.meta.setdefault("tomas", [])
            # las fotos (niveles 13-14) son tomas fijas cortas: el juego lee "foto" para saber que las practicó
            for t in (("fija", "foto") if self.args.stage in PHOTO_STAGES else self.envs()[0].tomas):
                if t not in tomas:
                    tomas.append(t)
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
        tmpj = self.model_path.with_name(self.model_path.stem + "_guardando.json")
        tmpj.write_text(json.dumps(self.meta, ensure_ascii=False))
        os.replace(tmpj, self.model_path.with_suffix(".json"))
        self.save_web()

    def save_web(self):
        """modelo_web.json (junto al zip): los pesos del actor para el juego del navegador."""
        layers = []
        for L in self.layers():
            W = L.weight.detach().cpu().numpy().astype(np.float32)
            b = L.bias.detach().cpu().numpy().astype(np.float32)
            layers.append({"in": int(W.shape[1]), "out": int(W.shape[0]),
                           "W": [float(f"{x:.7g}") for x in W.ravel()], "b": [float(f"{x:.7g}") for x in b]})
        meta = {k: self.meta.get(k) for k in ("generaciones", "pasos", "niveles", "creado", "actualizado",
                                              "rango_fisica", "tomas", "drones")}
        meta["sizes"] = [layers[0]["in"]] + [L["out"] for L in layers]
        web = self.model_path.with_name(self.model_path.stem + "_web.json")
        tmp = self.model_path.with_name(self.model_path.stem + "_web_guardando.json")
        tmp.write_text(json.dumps({"meta": meta, "layers": layers}, separators=(",", ":")))
        os.replace(tmp, web)

    def send_frame(self):
        d = []
        for e in self.envs():
            s = e.state
            hold = e.hold / e.hold_steps if e.hold_steps else 0.0
            row = r3(s.pos) + [round(s.roll, 3), round(s.pitch, 3), round(s.yaw, 3), e.goal_idx, round(hold, 2)]
            if e.flock is not None:                  # caza: a quién persigue + dónde está cada pájaro (z=-1: cazado)
                row.append(int(e.target))
                for p, alive in zip(e.flock.pos, e.flock.alive):
                    row += [round(float(p[0]), 2), round(float(p[1]), 2), round(float(p[2]), 2) if alive else -1]
            d.append(row)
        msg = {"t": "f", "s": int(self.num_timesteps), "d": d, "ev": self.events, "w": self.watch}
        envs = self.envs()
        if envs and envs[0].stage in FILM_STAGES:   # grabar: calidad de imagen y avance de la toma de cada dron
            msg["q"] = [round(float(getattr(e, "film_q", 0.0)), 2) for e in envs]
            msg["fg"] = [round(e.shot.progress if e.shot is not None and e.shot.phase != "ir" else 0.0, 2) for e in envs]
            msg["cp"] = [r3(e.shot.point()) if e.shot is not None else None for e in envs]   # el punto de cámara se mueve
        self.send(msg)
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
        self.red_w = []                                    # para el juego: TODAS las capas (la red puede tener 1-4 ocultas)
        for layer in self.layers():
            w = layer.weight.detach().cpu().numpy()
            k = min(RED_K, w.size)
            idx = np.argpartition(-np.abs(w).ravel(), k - 1)[:k]
            j, i = np.unravel_index(idx, w.shape)
            self.red_w.append([[int(a), int(b), round(float(w[b, a]), 3)] for a, b in zip(i, j)])

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
        msg = {"t": "a", "i": self.watch, "in": r(x[0].cpu().numpy()), "h": [r(a) for a in hidden],
               "mu": r(np.clip(mu, -1, 1)), "act": r(np.clip(actions[self.watch], -1, 1))}
        self.send(msg)
        now = time.time()
        if now - self.last_red > 0.25:                     # el juego (estudio PBDMM) lo lee de un archivo junto al progreso
            self.last_red = now
            red = dict(msg, t=now, gen=self.gen, n=self.args.drones, modelo=self.model_path.parent.name,
                       capas=[int(x.shape[1])] + [len(a) for a in hidden] + [len(mu)], w=self.red_w,
                       in_lbl=OBS_LABELS[:int(x.shape[1])], act_lbl=ACT_LABELS)
            try:
                tmp = self.red_path.with_name(self.red_path.name + ".tmp")
                tmp.write_text(json.dumps(red, separators=(",", ":")))
                os.replace(tmp, self.red_path)
            except OSError:
                pass

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
                self.bird_speed = float(m["env"].get("bird_speed", self.bird_speed))
                self.n_birds = int(m["env"].get("n_birds", self.n_birds))
                for e in self.envs():
                    e.density = self.density
                    e.wind.max_speed = self.wind
                    e.bird_speed = self.bird_speed       # caza: la velocidad cambia ya; la cantidad, al próximo intento
                    e.n_birds = self.n_birds
            if "watch" in m:
                self.watch = int(m["watch"]) % self.args.drones
            if "pause" in m:
                self.paused = bool(m["pause"])
            if m.get("save"):
                self.save_model()
                self.msg = f"Modelo guardado (generación {self.gen}): {self.args.modelo_txt}"
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
    # ---------------- el avance: grabar cada intento y guardar el mejor y el peor ----------------
    def grabar(self, envs):
        """Graba el intento de cada dron (cuadros a 25 Hz, lo que ve cada 0,2 s). Al terminar, si es el mejor o el
        peor de ese nivel, lo guarda con su red en <carpeta del modelo>/avance.json (el juego lo muestra)."""
        if self.args.level:                          # un nivel fijo del editor: no es la prueba de una misión
            return
        try:
            if self.grab is None:
                self.grab = [SIM.Grabacion(SIM.inicio(e), e.dt) for e in envs]
            obs = self.locals["obs_tensor"].detach().cpu().numpy()
            acts = self.locals["clipped_actions"] if "clipped_actions" in self.locals else self.locals["actions"]
            rews, dones, infos = self.locals["rewards"], self.locals["dones"], self.locals["infos"]
            for i, e in enumerate(envs):
                g = self.grab[i]
                if not dones[i]:
                    g.paso(e, acts[i], rews[i], obs[i])
                    continue
                g.premio += float(rews[i])
                g.final(infos[i].get("pos", (0, 0, 0)), acts[i])
                ep = infos[i].get("episode")
                premio = float(ep["r"]) if ep else g.premio
                cuales = self.avance.candidatos(e.stage, premio) if g.n > 5 else []
                if cuales and time.time() - self.avance_t > 1.0:
                    self.avance_t = time.time()
                    rep = g.armar(cuales[0], self.args.modelo_slug, self.gen, e.stage, self.args.dron_nombre, infos[i],
                                  self.red_de, self.capas_red())
                    rep["resultado"]["premio"] = round(premio, 2)
                    for cual in cuales:            # el mismo intento puede ser el primero, el mejor y el último
                        self.avance.guardar(cual, dict(rep, tipo=cual))
                self.grab[i] = SIM.Grabacion(SIM.inicio(e), e.dt)     # el entorno ya empezó el intento siguiente
        except Exception as ex:                      # grabar nunca debe tumbar el entrenamiento
            if not getattr(self, "grab_error", None):
                self.grab_error = repr(ex)
                print("Avance: no pude grabar los intentos:", ex, flush=True)
            self.grabar = lambda envs: None

    def capas_red(self):
        return [int(self.layers()[0].weight.shape[1])] + [int(l.weight.shape[0]) for l in self.layers()]

    def red_de(self, X):
        """Las activaciones de la red para muchas observaciones: (ocultas [[n, k]...], mu [n, 4])."""
        hidden = []
        with torch.no_grad():
            h = torch.as_tensor(X, dtype=torch.float32)
            for m in self.model.policy.mlp_extractor.policy_net:
                h = m(h)
                if not isinstance(m, torch.nn.Linear):
                    hidden.append(h.cpu().numpy())
            mu = self.model.policy.action_net(h).cpu().numpy()
        return hidden, np.clip(mu, -1, 1)

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
            film = (round(float(np.mean(self.ep_film[-w:])), 3)
                    if self.args.stage in FILM_STAGES and self.ep_film else None)
            self.history.append([self.gen, int(self.num_timesteps),
                                 round(float(np.mean(self.ep_succ[-w:])), 3),
                                 round(float(np.mean(self.ep_crash[-w:])), 3), self.args.stage, film])
        self.phase = "learn"           # ahora PPO actualiza la red; los drones esperan
        self.send_frame()
        self.send_stats()

    def huerfano(self):
        """Con --salir-sin-padre: ¿se cerró Blender? (el sistema adopta al proceso: cambia el padre)"""
        if not getattr(self.args, "salir_sin_padre", False):
            return False
        now = time.time()
        if now - self.revisa_padre < 2.0:
            return False
        self.revisa_padre = now
        if os.getppid() != self.padre:
            print("Blender se cerró: guardo el modelo y termino.", flush=True)
            self.stop = True
            return True
        return False

    def _on_step(self) -> bool:
        self.poll_control()
        self.huerfano()
        while self.paused and not self.stop:
            self.send_frame()
            time.sleep(0.05)
            self.poll_control()
            self.huerfano()
            if time.perf_counter() - getattr(self, "last_stats", 0.0) > 1.0:
                self.send_stats()                    # en pausa: el progreso sigue "vivo" (t) para el juego
                self.last_stats = time.perf_counter()
        if self.stop:
            return False

        envs = self.envs()
        self.grabar(envs)                            # el "Avance del modelo": el mejor y el peor intento (simulacion.py)
        for i, (info, done) in enumerate(zip(self.locals["infos"], self.locals["dones"])):
            if done:
                st = 2 if info.get("success") else 1 if info.get("crashed") else 3
                self.events.append([i, st] + r3(info.get("pos", (0, 0, 0))))
                self.total_eps += 1
                if not self.args.level and (self.args.stage >= 2 or self.args.repaso):
                    self.send_level(i, envs[i])      # nivel aleatorio nuevo para ese dron
                if info.get("repaso"):               # un intento de repaso: no cuenta en el éxito del nivel que entrena
                    continue
                self.ep_succ.append(float(info.get("success", False)))
                if info.get("front") is not None:
                    self.ep_front.append(float(info["front"]))
                if info.get("success") and "avg_speed" in info:
                    self.ep_speed.append(float(info["avg_speed"]))
                    self.ep_ang.append(float(info["ang_rate"]))
                self.ep_crash.append(float(info.get("crashed", False)))
                if envs[i].stage in HUNT_STAGES:
                    self.ep_goals.append(float(info.get("goals_reached", 0)))
                if "film_q" in info:
                    self.ep_film.append(float(info["film_q"]))
                ep = info.get("episode")             # lo agrega el Monitor de SB3
                if ep:
                    self.ep_rew.append(float(ep["r"]))

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


def capas_red(args, model_path):
    """Las capas ocultas de una red nueva: --capas, o "capas" en info.json de la carpeta del modelo (el estudio PBDMM
    las escribe ahí, así sirve igual desde Blender), o [--net, --net]."""
    if args.capas:
        return [int(x) for x in args.capas.split(",") if x.strip()]
    try:
        capas = json.loads((Path(model_path).parent / "info.json").read_text()).get("capas")
        if isinstance(capas, list) and 1 <= len(capas) <= 4 and all(isinstance(c, int) and 8 <= c <= 512 for c in capas):
            return capas
    except (OSError, ValueError):
        pass
    return [args.net, args.net]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--drones", type=int, default=50)
    ap.add_argument("--stage", type=int, default=0, choices=list(STAGES))
    ap.add_argument("--level", type=str, default=None, help="nivel JSON (todos los drones en el mismo nivel)")
    datos = Path(os.environ.get("DRONMAKER_DATOS") or ROOT)       # la app instalada: los datos en la carpeta del usuario
    ap.add_argument("--model", type=str, default=str(datos / "models" / "modelo.zip"),
                    help="el modelo (models/modelo.zip = 'base', models/drones/<slug>/modelo.zip = el de un dron): "
                         "si existe se continúa, si no se crea uno nuevo. Todo lo demás se guarda en su carpeta")
    ap.add_argument("--estado", type=str, default=str(datos / "models" / "entrenando.json"),
                    help="dónde escribir el progreso en vivo (JSON) que lee el juego")
    ap.add_argument("--lr", type=float, default=3e-4)
    ap.add_argument("--ent", type=float, default=0.0)
    ap.add_argument("--net", type=int, default=128, help="neuronas por capa oculta (solo al crear el modelo)")
    ap.add_argument("--capas", type=str, default=None,
                    help='capas ocultas de una red NUEVA, ej. "64,64" (si no: "capas" de info.json junto al modelo, o --net x2)')
    ap.add_argument("--speed", choices=["real", "rapido"], default="real")
    ap.add_argument("--reward", type=str, default="{}", help='JSON, ej: {"crash": 20}')
    ap.add_argument("--steps", type=int, default=20_000_000)
    ap.add_argument("--port", type=int, default=9001)
    ap.add_argument("--ctrl-port", type=int, default=9002)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--watch", type=int, default=0, help="dron cuya red neuronal se manda a Blender")
    ap.add_argument("--salir-sin-padre", action="store_true",
                    help="si el proceso que lo lanzó (Blender) se cierra, guardar y terminar (no quedar huérfano)")
    ap.add_argument("--log-std", type=float, default=None, help="ruido de exploración inicial (log σ)")
    ap.add_argument("--density", type=float, default=1.0, help="bosque: 0.5 claro · 1 normal · 2 denso")
    ap.add_argument("--wind", type=float, default=0.0, help="viento máx. con ráfagas (m/s)")
    ap.add_argument("--tarea", type=str, default="{}", help='PBDMM 3: el plan de vuelo, ej. {"foto_seg": [2.5, 3.5], "foto_ok": 0.6, "fotos": 3}')
    ap.add_argument("--birds", type=int, default=5, help="caza: cuántos pájaros")
    ap.add_argument("--bird-speed", type=float, default=1.5, help="caza: velocidad de los pájaros (m/s)")
    ap.add_argument("--dron", type=str, default=None,
                    help="física: drones/madera.json (un dron del juego) o 'azar' (al azar en cada intento)")
    args = ap.parse_args()
    args.repaso = tuple(json.loads(args.tarea or "{}").get("repaso") or ())   # la tarea trae el repaso (env.py)
    params, phys_range, args.dron_nombre, args.rango = load_drone(args.dron)

    reward = dict(DEFAULT_REWARD)
    reward.update({k: float(v) for k, v in json.loads(args.reward).items() if k in reward})

    n = args.drones
    env = make_vec_env(DroneEnv, n_envs=n, seed=args.seed,
                       env_kwargs=dict(stage=args.stage, level_path=args.level, reward=reward, tarea=json.loads(args.tarea or "{}"),
                                       density=args.density, wind=args.wind,
                                       n_birds=args.birds, bird_speed=args.bird_speed,
                                       params=params, phys_range=phys_range))
    n_steps = max(32, round(12_800 / n))         # ~12 800 pasos de experiencia por generación
    batch = min(1024, n_steps * n)

    name = Path(args.level).stem if args.level else STAGES[args.stage]
    model_path = Path(args.model).expanduser().resolve()
    model_path.parent.mkdir(parents=True, exist_ok=True)
    args.modelo_slug = model_slug(model_path)
    try:
        args.modelo_txt = str(model_path.relative_to(ROOT))
    except ValueError:
        args.modelo_txt = str(model_path)
    meta_path = model_path.with_suffix(".json")
    existe = model_path.exists()
    meta = json.loads(meta_path.read_text()) if (existe and meta_path.exists()) else {}

    ampliado = False
    if existe:
        from drone_rl.upgrade import backup_before_widen, load_ppo
        co = {"n_steps": n_steps, "batch_size": batch, "learning_rate": args.lr, "ent_coef": args.ent}
        from drone_rl.upgrade import obs_size
        n_old = obs_size(model_path)
        model, ampliado = load_ppo(model_path, env=env, custom_objects=co)
        if ampliado:          # modelo con menos entradas (24 o 27): las nuevas entran en cero, vuela igual
            copia = backup_before_widen(model_path, n_old)
            meta["red"] = [int(env.observation_space.shape[0])] + list(meta.get("red", [n_old, 128, 128, 4]))[1:]
            meta.setdefault("ampliaciones", []).append({"fecha": time.strftime("%Y-%m-%d %H:%M"), "de": n_old,
                                                        "a": int(env.observation_space.shape[0]),
                                                        "copia": copia.name})
            print(f"Modelo ampliado a {env.observation_space.shape[0]} entradas (copia del original: "
                  f"{copia})", flush=True)
        meta.setdefault("pasos", int(model.num_timesteps))
    else:
        capas = capas_red(args, model_path)
        meta = {"creado": time.strftime("%Y-%m-%d %H:%M"), "red": [int(env.observation_space.shape[0]), *capas, 4],
                "generaciones": 0, "pasos": 0, "historia": [], "sesiones": [], "niveles": {}}
        model = PPO("MlpPolicy", env, device="cpu",
                    policy_kwargs=dict(net_arch=dict(pi=list(capas), vf=list(capas)),
                                       log_std_init=-0.7),
                    n_steps=n_steps, batch_size=batch, n_epochs=10, learning_rate=args.lr,
                    gamma=0.99, gae_lambda=0.95, clip_range=0.2, ent_coef=args.ent, seed=args.seed, verbose=0)

    if args.log_std is not None:
        with torch.no_grad():
            model.policy.log_std.fill_(args.log_std)
    link = LiveLink(args, reward, model_path, meta)
    estado = (f"continuando el modelo ({int(model.num_timesteps):,} pasos, generación {link.gen})" if existe
              else "modelo NUEVO (red al azar)")
    if ampliado:
        estado += f" · ampliado a {env.observation_space.shape[0]} entradas (vuela igual que antes)"
    print(f"Drone Lab: {n} drones · nivel {name} · dron {args.dron_nombre} · {n_steps} pasos por dron por generación · {estado}",
          flush=True)
    try:
        model.learn(total_timesteps=args.steps, callback=link, reset_num_timesteps=not existe)
    except KeyboardInterrupt:
        pass
    link.save_model()
    link.msg = f"Modelo guardado (generación {link.gen}): {args.modelo_txt}"
    link.phase = "stopped"
    link.send_stats(force=True)
    link.send({"t": "bye", "model": str(model_path)})
    print(link.msg, flush=True)


if __name__ == "__main__":
    main()
