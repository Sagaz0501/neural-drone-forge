"""
Lo que "siente" el dron: sensores de distancia y las 38 entradas de la red.

Está separado del entorno para que el entrenamiento (env.py) y Blender (runtime.py)
usen EXACTAMENTE el mismo cálculo. Si cambiara algo aquí, la red vería el mundo distinto.
Solo usa numpy (Blender ya lo trae).
"""
import os

import numpy as np

from .physics import QuadParams, QuadState, yaw_frame

# 8 sensores horizontales (cada 45°) + 1 arriba + 1 abajo, en el marco 'heading' del dron
_H = [np.array([np.cos(a), np.sin(a), 0.0]) for a in np.radians(np.arange(0, 360, 45))]
RAY_DIRS_LOCAL = np.array(_H + [np.array([0, 0, 1.0]), np.array([0, 0, -1.0])])
RAY_LEN = 5.0          # alcance del sensor (m)
OBS_SCALE = 10.0       # metros/velocidades se dividen por esto para quedar ~[-1, 1]

# Cada sensor horizontal es un CONO (como un ToF real, que ve ~27°), no una línea:
# se miden 3 rayos (-15°, 0°, +15°) y se reporta el más corto. Con una sola línea, un
# tronco delgado podía quedar escondido ENTRE dos sensores hasta chocarlo.
RAY_SPREAD_DEG = float(os.environ.get("DRONE_RL_RAY_SPREAD", 15.0))     # 0 = rayos finos (versión vieja)
_SUB = [0.0] if RAY_SPREAD_DEG <= 0 else [-RAY_SPREAD_DEG, 0.0, RAY_SPREAD_DEG]
_SUB_DIRS = np.array([[np.cos(a + np.radians(s)), np.sin(a + np.radians(s)), 0.0]
                      for a in np.radians(np.arange(0, 360, 45)) for s in _SUB]
                     + [[0, 0, 1.0], [0, 0, -1.0]])
_NS = len(_SUB)


def _rz(yaw: float) -> np.ndarray:
    c, s = np.cos(yaw), np.sin(yaw)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])


def ray_dirs_world(yaw: float) -> np.ndarray:
    """Dirección CENTRAL de los 10 sensores en el mundo (giran con el yaw del dron)."""
    return RAY_DIRS_LOCAL @ _rz(yaw).T


def sensor_rays(state: QuadState, level) -> np.ndarray:
    """Distancia (m) a lo más cercano que ve cada uno de los 10 sensores, hasta RAY_LEN."""
    d = level.raycast(state.pos, _SUB_DIRS @ _rz(state.yaw).T, RAY_LEN)
    return np.concatenate([d[:8 * _NS].reshape(8, _NS).min(axis=1), d[8 * _NS:]])


GOAL_VEL_SCALE = 5.0   # m/s de la meta (pájaros: ~1-4 m/s) -> ~[-1, 1]

# Grabar: los tipos de toma (entradas 30-33, una sola en 1) y la cámara del dron
TOMAS = ("fija", "revelar", "seguir", "orbita")
CAM_HFOV = np.radians(80.0)     # campo de visión horizontal de la cámara
CAM_VFOV = np.radians(50.0)     # vertical
CAM_TILT = np.radians(15.0)     # sin gimbal, la cámara va fija mirando 15° hacia abajo
N_OBS = 38


def phys_features(p: QuadParams) -> np.ndarray:
    """Entradas 34-37: qué dron maneja (para que la misma red vuele drones distintos)."""
    return np.array([p.twr / 5.0, p.mass, p.drag * 20.0, p.att_resp / 10.0])


def build_obs(state: QuadState, goal: np.ndarray, rays: np.ndarray, prev_action: np.ndarray,
              p: QuadParams, goal_vel: np.ndarray | None = None, subject: np.ndarray | None = None,
              toma: str | None = None) -> np.ndarray:
    """Las 38 entradas de la red. Las nuevas van AL FINAL a propósito: un modelo viejo de 24 o 27
    entradas usa solo las primeras y vuela igual que antes.
      24-26 cómo se mueve la meta (0 con aros quietos)
      27-29 dónde está el SUJETO que hay que grabar (sin sujeto: la meta)
      30-33 qué toma se pide (fija, revelar, seguir, órbita; todo 0 si no está grabando)
      34-37 la física de su dron (empuje/peso, masa, arrastre, respuesta)"""
    rel = yaw_frame(goal - state.pos, state.yaw)
    dist = np.linalg.norm(rel)
    vel_h = yaw_frame(state.vel, state.yaw)
    subj = rel if subject is None else yaw_frame(np.asarray(subject, dtype=float) - state.pos, state.yaw)
    obs = np.concatenate([
        np.clip(rel / OBS_SCALE, -2, 2),                     # 3: dónde está la meta (relativa)
        [min(dist / OBS_SCALE, 2.0)],                        # 1: distancia a la meta
        np.clip(vel_h / OBS_SCALE, -2, 2),                   # 3: velocidad
        [state.roll / p.max_angle, state.pitch / p.max_angle],   # 2: inclinación
        [state.pos[2] / OBS_SCALE],                          # 1: altura
        prev_action,                                         # 4: acción anterior
        rays / RAY_LEN,                                      # 10: sensores (1 = libre)
        np.zeros(3) if goal_vel is None                      # 3: cómo se mueve la meta (en el marco del dron)
        else np.clip(yaw_frame(np.asarray(goal_vel, dtype=float), state.yaw) / GOAL_VEL_SCALE, -2, 2),
        np.clip(subj / OBS_SCALE, -2, 2),                    # 3: dónde está el sujeto
        [1.0 if toma == t else 0.0 for t in TOMAS],          # 4: qué toma
        phys_features(p),                                    # 4: qué dron
    ])
    return obs.astype(np.float32)


# Qué es una toma BUENA (estricto, como un camarógrafo de verdad)
FRAME_H = np.radians(20.0)   # el sujeto a ±20° del centro (horizontal); a 10° ya baja a 0,75
FRAME_V = np.radians(15.0)   # y a ±15° en vertical
TRACK_R = 1.2                # m: qué tan pegado al punto de cámara de la ruta
FLOW_V = 1.0                 # m/s: diferencia con la velocidad de la ruta (ritmo parejo, sin frenazos)
SHAKE_REF = 0.8              # rad/s de giro de roll/pitch (sacudidas)
PAN_REF = 6.0                # rad/s² de cambio del giro (yaw): paneo brusco


def film_quality(state: QuadState, subject, cam_pos, cam_vel, ang_rate: float, yaw_acc: float = 0.0,
                 gimbal: bool = False) -> dict:
    """Qué tan buena es la imagen en este instante (0-1). La usan el entrenamiento (premio) y el juego
    (calificación del video), con la MISMA cuenta (game/sim.js filmQuality). Es el producto de:
      encuadre:     el sujeto cerca del centro del cuadro de la cámara (va en la nariz, 15° abajo sin gimbal)
      seguimiento:  el dron pegado al punto de cámara de la toma (cam_pos)
      ritmo:        a la velocidad de la ruta (cam_vel): ni se queda atrás ni frena de golpe
      estable:      sin sacudidas de roll/pitch ni paneos bruscos (el gimbal quita casi todo)
    """
    d = np.asarray(subject, dtype=float) - state.pos
    dh = float(np.hypot(d[0], d[1]))
    b = float(np.arctan2(d[1], d[0]))
    e_h = float(np.arctan2(np.sin(b - state.yaw), np.cos(b - state.yaw)))
    elev = float(np.arctan2(d[2], dh))
    cam = elev if gimbal else -CAM_TILT - state.pitch       # pitch > 0 = nariz abajo: la cámara mira más abajo
    e_v = elev - cam
    framing = max(0.0, 1.0 - (e_h / FRAME_H) ** 2) * max(0.0, 1.0 - (e_v / FRAME_V) ** 2)
    track = float(np.exp(-(np.linalg.norm(np.asarray(cam_pos, dtype=float) - state.pos) / TRACK_R) ** 2))
    flow = float(np.exp(-(np.linalg.norm(state.vel - np.asarray(cam_vel, dtype=float)) / FLOW_V) ** 2))
    shake = ang_rate * (0.3 if gimbal else 1.0)
    pan = abs(yaw_acc) * (0.5 if gimbal else 1.0)
    steady = float(np.exp(-(shake / SHAKE_REF) ** 2) * np.exp(-(pan / PAN_REF) ** 2))
    return {"framing": framing, "track": track, "flow": flow, "steady": steady, "q": framing * track * flow * steady}


def clearance_penalty(rays: np.ndarray, safe: float = 1.2) -> float:
    """0 si todo está a más de `safe` metros; crece al acercarse a algo (sin contar el piso)."""
    m = float(np.min(rays[:9]))            # 8 horizontales + arriba
    return max(0.0, 1.0 - m / safe) ** 2


def danger_penalty(rays: np.ndarray, vel_heading: np.ndarray, horizon: float = 1.0) -> float:
    """Peligro = ir RÁPIDO hacia algo que se ve. Para cada sensor horizontal:
    tiempo para chocar = distancia / velocidad hacia ese lado. Si es menos de `horizon` segundos,
    castiga (más cerca del choque = más castigo). Sin obstáculo a la vista (sensor al máximo) no cuenta.
    Así aprende a frenar o desviarse ANTES, no solo a no pasar pegado."""
    closing = RAY_DIRS_LOCAL[:8] @ vel_heading                 # m/s hacia cada sensor
    seen = (rays[:8] < RAY_LEN - 1e-3) & (closing > 0.3)
    if not seen.any():
        return 0.0
    ttc = float(np.min(rays[:8][seen] / closing[seen]))
    return max(0.0, 1.0 - ttc / horizon) ** 2
