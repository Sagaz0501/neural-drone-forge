"""
Grabaciones de pruebas ("replays") para el juego: la MISMA prueba que hacen los 50 drones al entrenar.

Las usan dos lados y producen el mismo formato (lo dibuja app/simulacion.js):
  - jugar.py  POST /api/simular  -> simular(): una prueba al azar del nivel que entrena ese modelo, volada con la
               última generación guardada (modelo_web.json, la misma red que vuela el juego), sin tocar el entrenamiento.
  - live_train.py  -> Grabadora: graba cada intento de cada dron y guarda el MEJOR y el PEOR por nivel en
               <carpeta del modelo>/avance.json (el "Avance del modelo").

Formato de una grabación (todo en metros, z arriba, como drone_rl):
  {"v": 1, "tipo": "prueba"|"mejor"|"peor", "modelo", "gen", "stage", "mision", "dron", "t" (epoch),
   "dt": segundos entre cuadros, "nivel": Level.to_dict(), "sujeto": [x,y,z]|None, "toma": Toma.to_dict()|None,
   "tomas": [Toma.to_dict()]|None (set de fotos: todas; "meta" de cada cuadro = cuál va),
   "fisica": {"mass", "twr", "radius"},
   "cuadros": {"pos": [[x,y,z]], "rot": [[roll,pitch,yaw]], "act": [[gas,roll,pitch,yaw]], "q": [calidad 0-1],
               "prog": [avance de la toma 0-1], "premio": [premio acumulado], "meta": [índice de la meta]},
   "red": {"capas": [38, 128, 128, 4], "in_lbl", "act_lbl", "dt": s entre muestras,
           "in": [[38]], "h": [[[capa1], [capa2]]], "mu": [[4]]},
   "resultado": {"exito": bool, "choque": bool, "razon", "premio", "calidad", "segundos_buenos", "t", "metas",
                 "tiempo": bool (se acabó el tiempo; sin éxito, sin choque y sin tiempo = terminó las tomas, pero flojas)}}
"""
from __future__ import annotations

import json
import math
import sys
import time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from drone_rl import ACT_LABELS, MISSIONS, OBS_LABELS, DroneEnv  # noqa: E402
from drone_rl.physics import QuadParams  # noqa: E402

CADA_CUADRO = 2          # 50 Hz de control -> 25 cuadros por segundo en la grabación
CADA_RED = 10            # la red: 5 muestras por segundo
r3 = lambda v: [round(float(x), 3) for x in v]          # noqa: E731


# ---------------------------------------------------------------- la red (numpy, como game/sim.js Policy)
class RedWeb:
    """La red de modelo_web.json: MLP con tanh en las ocultas y la salida recortada a [-1, 1] (= el juego)."""

    def __init__(self, web: dict):
        self.meta = web.get("meta", {})
        self.W = [np.array(L["W"], dtype=np.float32).reshape(L["out"], L["in"]) for L in web["layers"]]
        self.b = [np.array(L["b"], dtype=np.float32) for L in web["layers"]]
        self.nin = self.W[0].shape[1]

    @staticmethod
    def cargar(path: Path) -> "RedWeb":
        return RedWeb(json.loads(Path(path).read_text()))

    def capas(self):
        return [self.nin] + [w.shape[0] for w in self.W]

    def act(self, obs):
        """-> (acción [4], activaciones ocultas [[..], ..])."""
        h = np.asarray(obs, dtype=np.float32)[: self.nin]
        ocultas = []
        for k, (W, b) in enumerate(zip(self.W, self.b)):
            z = W @ h + b
            if k < len(self.W) - 1:
                h = np.tanh(z)
                ocultas.append(h)
            else:
                h = np.clip(z, -1.0, 1.0)
        return h, ocultas


# ---------------------------------------------------------------- qué prueba hace ese modelo
def cargar_dron(nombre):
    """Como live_train load_drone: 'al azar' -> rango de drones/rango_juego.json; 'estándar' -> None; otro -> drones/<x>.json."""
    if not nombre or nombre in ("estándar", "estandar", "ESTANDAR"):
        return None, None
    if nombre in ("al azar", "azar", "AZAR"):
        r = json.loads((ROOT / "drones" / "rango_juego.json").read_text(encoding="utf-8"))
        return None, {k: v for k, v in r.items() if not k.startswith("_")}
    for p in (ROOT / "drones" / f"{nombre}.json", Path(nombre)):
        if p.is_file():
            return QuadParams.from_dict(json.loads(p.read_text(encoding="utf-8"))), None
    return None, None


def config_prueba(carpeta: Path, entrenando: dict | None = None) -> dict:
    """La prueba que entrena (o entrenó por última vez) ese modelo: nivel, dron, viento, densidad, premios."""
    tr = entrenando or {}
    params = tr.get("params") or {}
    if tr.get("stage") is not None:
        return {"stage": int(tr["stage"]), "dron": tr.get("dron") or params.get("dron"), "wind": float(params.get("wind", 0.0)),
                "density": float(params.get("density", 1.0)), "reward": params.get("reward")}
    meta = {}
    try:
        meta = json.loads((carpeta / "modelo.json").read_text())
    except (OSError, ValueError):
        pass
    hist = meta.get("historia") or []
    stage = int(hist[-1][4]) if hist and len(hist[-1]) > 4 and hist[-1][4] is not None else 11
    drones = meta.get("drones") or []
    return {"stage": stage, "dron": drones[-1] if drones else None, "wind": 0.0, "density": 1.0, "reward": None}


def env_prueba(cfg: dict) -> DroneEnv:
    params, phys_range = cargar_dron(cfg.get("dron"))
    kw = dict(stage=int(cfg["stage"]), params=params, phys_range=phys_range, wind=float(cfg.get("wind") or 0.0),
              density=float(cfg.get("density") or 1.0))
    if cfg.get("reward"):
        kw["reward"] = {k: float(v) for k, v in cfg["reward"].items()}
    return DroneEnv(**kw)


# ---------------------------------------------------------------- grabar
def inicio(env: DroneEnv) -> dict:
    """Lo que hay que guardar al EMPEZAR un intento (después el entorno se reinicia y se pierde)."""
    sh = getattr(env, "shot", None)
    p = env.p
    return {"nivel": env.level.to_dict(), "sujeto": r3(env.subject) if env.subject is not None else None,
            "toma": sh.to_dict() if sh is not None else None,
            "tomas": [x.to_dict() for x in env.shots] if len(getattr(env, "shots", [])) > 1 else None,   # set de fotos
            "fisica": {"mass": round(float(p.mass), 3), "twr": round(float(p.twr), 3), "radius": round(float(p.radius), 3)}}


def cuadro(env: DroneEnv) -> tuple:
    """Un cuadro del estado del dron: (pos, rot, q, prog, meta)."""
    s, sh = env.state, getattr(env, "shot", None)
    prog = float(sh.progress) if sh is not None and sh.phase != "ir" else 0.0
    return (r3(s.pos), [round(float(s.roll), 3), round(float(s.pitch), 3), round(float(s.yaw), 3)],
            round(float(getattr(env, "film_q", 0.0)), 3), round(prog, 3), int(env.goal_idx))


class Grabacion:
    """Un intento que se está grabando."""

    def __init__(self, ini: dict, dt: float):
        self.ini, self.dt, self.n = ini, dt, 0
        self.c = {"pos": [], "rot": [], "act": [], "q": [], "prog": [], "premio": [], "meta": []}
        self.red_in, self.premio = [], 0.0

    def paso(self, env, accion, premio, obs=None):
        """Después de cada paso de control (accion = la que se usó; obs = la que vio ANTES, para la red)."""
        self.premio += float(premio)
        if obs is not None and self.n % CADA_RED == 0:
            self.red_in.append(np.asarray(obs, dtype=np.float32).copy())
        if self.n % CADA_CUADRO == 0:
            pos, rot, q, prog, meta = cuadro(env)
            self._poner(pos, rot, accion, q, prog, meta)
        self.n += 1

    def final(self, pos, accion):
        """El último cuadro cuando el entorno ya se reinició (live_train): solo la posición final."""
        c = self.c
        rot = c["rot"][-1] if c["rot"] else [0, 0, 0]
        self._poner(r3(pos), rot, accion, c["q"][-1] if c["q"] else 0.0, c["prog"][-1] if c["prog"] else 0.0,
                    c["meta"][-1] if c["meta"] else 0)

    def _poner(self, pos, rot, accion, q, prog, meta):
        c = self.c
        c["pos"].append(pos); c["rot"].append(rot); c["act"].append(r3(np.clip(accion, -1, 1)))
        c["q"].append(q); c["prog"].append(prog); c["premio"].append(round(self.premio, 2)); c["meta"].append(meta)

    def armar(self, tipo, modelo, gen, stage, dron, info, red_fn, capas) -> dict:
        """La grabación completa. red_fn(obs[n, 38]) -> (ocultas [[n, k]...], mu [n, 4]) calcula la red de lo que vio."""
        red = None
        if self.red_in:
            X = np.stack(self.red_in)
            hid, mu = red_fn(X)
            red = {"capas": capas, "in_lbl": OBS_LABELS[: X.shape[1]], "act_lbl": ACT_LABELS, "dt": self.dt * CADA_RED,
                   "in": [r3(x) for x in X], "h": [[r3(h[i]) for h in hid] for i in range(len(X))],
                   "mu": [r3(m) for m in mu]}
        mis = MISSIONS.get(int(stage)) or MISSIONS.get(str(stage)) or {}
        return {"v": 1, "tipo": tipo, "modelo": modelo, "gen": gen, "stage": int(stage), "mision": mis.get("nombre"),
                "dron": dron, "t": time.time(), "dt": self.dt * CADA_CUADRO, **self.ini, "cuadros": self.c, "red": red,
                "resultado": resultado(info, self.premio, self.n * self.dt)}


def resultado(info: dict, premio: float, t: float) -> dict:
    return {"exito": bool(info.get("success")), "choque": bool(info.get("crashed")), "razon": info.get("crash_reason"),
            "premio": round(float(premio), 2), "calidad": round(float(info["film_q"]), 3) if info.get("film_q") is not None else None,
            "segundos_buenos": round(float(info.get("film_good") or 0.0), 2), "t": round(t, 2),
            "metas": int(info.get("goals_reached") or 0), "tiempo": bool(info.get("timeout"))}


# ---------------------------------------------------------------- Simular prueba (jugar.py)
def simular(carpeta: Path, web_path: Path, modelo: str, entrenando: dict | None = None, seed: int | None = None) -> dict:
    """Una prueba al azar del nivel que entrena el modelo, volada con su última generación guardada (sin ruido)."""
    red = RedWeb.cargar(web_path)
    cfg = config_prueba(carpeta, entrenando)
    env = env_prueba(cfg)
    obs, _ = env.reset(seed=seed if seed is not None else int(time.time() * 1000) % 2**31)
    g = Grabacion(inicio(env), env.dt)
    info = {}
    for _ in range(env.max_steps + 5):
        a, _h = red.act(obs)
        prev = obs
        obs, rew, term, trunc, info = env.step(a)
        g.paso(env, a, rew, prev)
        if term or trunc:
            break

    def red_fn(X):
        hs, mus = [], []
        for x in X:
            mu, h = red.act(x)
            hs.append(h); mus.append(mu)
        return [np.stack([h[k] for h in hs]) for k in range(len(hs[0]))], np.stack(mus)

    nombre_dron = cfg.get("dron") or "estándar"
    return g.armar("prueba", modelo, int(red.meta.get("generaciones") or 0), cfg["stage"], nombre_dron, info, red_fn,
                   red.capas())


# ---------------------------------------------------------------- el mejor y el peor (live_train.py)
CADA_ULTIMO = 60.0       # el "último intento" se renueva como mucho una vez por minuto


class Avance:
    """La historia de un modelo en <carpeta>/avance.json, por nivel: el PRIMER intento que se guardó, el PEOR y el
    MEJOR (por premio total) y el ÚLTIMO (se renueva cada minuto): así se ve de dónde salió y a dónde llegó."""

    def __init__(self, path: Path):
        self.path = Path(path)
        try:
            self.datos = json.loads(self.path.read_text())
        except (OSError, ValueError):
            self.datos = {}
        # para comparar sin releer: {stage: (premio mejor, premio peor)}
        self.marcas = {k: (v.get("mejor", {}).get("resultado", {}).get("premio"), v.get("peor", {}).get("resultado", {}).get("premio"))
                       for k, v in self.datos.items() if isinstance(v, dict)}

    def candidato(self, stage, premio) -> str | None:
        """'mejor', 'peor' o None: si este intento entra al avance (por premio)."""
        mejor, peor = self.marcas.get(str(stage), (None, None))
        if mejor is None or premio > mejor:
            return "mejor"
        if peor is None or premio < peor:
            return "peor"
        return None

    def candidatos(self, stage, premio, ahora=None) -> list:
        """Todo lo que este intento debería ser: 'primero' (si el nivel no tiene), 'mejor'/'peor', 'ultimo' (cada minuto)."""
        ahora = time.time() if ahora is None else ahora
        nv = self.datos.get(str(stage)) or {}
        out = []
        if "primero" not in nv:
            out.append("primero")
        c = self.candidato(stage, premio)
        if c:
            out.append(c)
        if ahora - (nv.get("ultimo") or {}).get("t", 0) > CADA_ULTIMO:
            out.append("ultimo")
        return out

    def guardar(self, cual: str, rep: dict):
        st = str(rep["stage"])
        self.datos.setdefault(st, {})[cual] = rep
        if cual in ("mejor", "peor"):
            m = list(self.marcas.get(st, (None, None)))
            m[0 if cual == "mejor" else 1] = rep["resultado"]["premio"]
            self.marcas[st] = tuple(m)
        tmp = self.path.with_name(self.path.name + ".tmp")
        tmp.write_text(json.dumps(self.datos, separators=(",", ":")))
        tmp.replace(self.path)


if __name__ == "__main__":       # prueba rápida: python scripts/simulacion.py [carpeta del modelo]
    c = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "models"
    rep = simular(c, c / "modelo_web.json", c.name)
    print(json.dumps(rep["resultado"]), rep["stage"], len(rep["cuadros"]["pos"]), "cuadros",
          len(rep["red"]["in"]) if rep["red"] else 0, "muestras de la red", f"{len(json.dumps(rep)) / 1e3:.0f} kB")
