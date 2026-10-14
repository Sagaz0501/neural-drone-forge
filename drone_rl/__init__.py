"""drone-rl: física, sensores y entorno de entrenamiento.

physics / sensing / level / runtime / controller solo necesitan numpy (sirven dentro de Blender).
El entorno de entrenamiento (env) además necesita gymnasium.
"""
from .level import Level
from .physics import QuadParams, QuadState

try:
    from .env import ACT_LABELS, DEFAULT_REWARD, MISSIONS, OBS_LABELS, STAGES, DroneEnv
except ImportError:          # sin gymnasium (ej. Python de Blender): solo lo de numpy
    pass

__all__ = ["DroneEnv", "DEFAULT_REWARD", "MISSIONS", "OBS_LABELS", "ACT_LABELS", "STAGES", "Level",
           "QuadParams", "QuadState"]
