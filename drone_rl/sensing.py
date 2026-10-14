"""
Lo que "siente" el dron: sensores de distancia y las 24 entradas de la red.

Está separado del entorno para que el entrenamiento (env.py) y Blender (runtime.py)
usen EXACTAMENTE el mismo cálculo. Si cambiara algo aquí, la red vería el mundo distinto.
Solo usa numpy (Blender ya lo trae).
"""
import numpy as np

from .physics import QuadParams, QuadState, yaw_frame

# 8 rayos horizontales (cada 45°) + 1 arriba + 1 abajo, en el marco 'heading' del dron
_H = [np.array([np.cos(a), np.sin(a), 0.0]) for a in np.radians(np.arange(0, 360, 45))]
RAY_DIRS_LOCAL = np.array(_H + [np.array([0, 0, 1.0]), np.array([0, 0, -1.0])])
RAY_LEN = 5.0          # alcance del sensor (m)
OBS_SCALE = 10.0       # metros/velocidades se dividen por esto para quedar ~[-1, 1]


def ray_dirs_world(yaw: float) -> np.ndarray:
    """Direcciones de los 10 rayos en el mundo (giran con el yaw del dron)."""
    c, s = np.cos(yaw), np.sin(yaw)
    rz = np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])
    return RAY_DIRS_LOCAL @ rz.T


def sensor_rays(state: QuadState, level) -> np.ndarray:
    """Distancia (m) al obstáculo más cercano en cada uno de los 10 rayos, hasta RAY_LEN."""
    return level.raycast(state.pos, ray_dirs_world(state.yaw), RAY_LEN)


def build_obs(state: QuadState, goal: np.ndarray, rays: np.ndarray, prev_action: np.ndarray,
              p: QuadParams) -> np.ndarray:
    """Las 24 entradas de la red neuronal."""
    rel = yaw_frame(goal - state.pos, state.yaw)
    dist = np.linalg.norm(rel)
    vel_h = yaw_frame(state.vel, state.yaw)
    obs = np.concatenate([
        np.clip(rel / OBS_SCALE, -2, 2),                     # 3: dónde está la meta (relativa)
        [min(dist / OBS_SCALE, 2.0)],                        # 1: distancia a la meta
        np.clip(vel_h / OBS_SCALE, -2, 2),                   # 3: velocidad
        [state.roll / p.max_angle, state.pitch / p.max_angle],   # 2: inclinación
        [state.pos[2] / OBS_SCALE],                          # 1: altura
        prev_action,                                         # 4: acción anterior
        rays / RAY_LEN,                                      # 10: sensores (1 = libre)
    ])
    return obs.astype(np.float32)


def clearance_penalty(rays: np.ndarray, safe: float = 1.2) -> float:
    """0 si todo está a más de `safe` metros; crece al acercarse a algo (sin contar el piso)."""
    m = float(np.min(rays[:9]))            # 8 horizontales + arriba
    return max(0.0, 1.0 - m / safe) ** 2
