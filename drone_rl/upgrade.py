"""
Cargar EL modelo aunque sea de antes de que la red tuviera todas sus entradas (hoy 38).

Cada vez que se agregan entradas van al final: la caza agregó 3 (24 -> 27, "cómo se mueve la meta") y
grabar agregó 11 (27 -> 38: dónde está el sujeto, qué toma, qué dron). Un modelo viejo se amplía así:
la primera capa recibe columnas nuevas de pesos EN CERO. Con eso la red hace exactamente lo mismo
que antes (las entradas nuevas no cambian nada) y, al seguir entrenando, aprende a usarlas.
Todo lo demás (las otras capas, el ruido de exploración, los pasos) se copia tal cual.
"""
from __future__ import annotations

from pathlib import Path

from .sensing import N_OBS


def widen_state_dict(old_sd: dict, new_sd: dict) -> dict:
    """Copia los pesos viejos en la red nueva; las columnas que sobran en la primera capa quedan en 0."""
    import torch
    out = {}
    for k, v in new_sd.items():
        o = old_sd[k]
        if o.shape == v.shape:
            out[k] = o.clone()
        elif o.dim() == 2 and o.shape[0] == v.shape[0] and o.shape[1] < v.shape[1]:
            w = torch.zeros_like(v)
            w[:, : o.shape[1]] = o
            out[k] = w
        else:
            raise ValueError(f"No sé ampliar {k}: {tuple(o.shape)} -> {tuple(v.shape)}")
    return out


def load_ppo(path, env=None, device: str = "cpu", custom_objects: dict | None = None):
    """Como PPO.load, pero si el modelo tiene menos entradas que la red actual (24/27 -> 38), lo amplía.
    Devuelve (modelo, ampliado: bool)."""
    from stable_baselines3 import PPO
    old = PPO.load(path, device=device, custom_objects=custom_objects)
    n_old = old.observation_space.shape[0]
    if n_old == N_OBS:
        if env is None:
            return old, False
        return PPO.load(path, env=env, device=device, custom_objects=custom_objects), False
    if env is None:
        from .env import DroneEnv
        env = DroneEnv(stage=2)
    co = custom_objects or {}
    new = PPO("MlpPolicy", env, device=device, policy_kwargs=old.policy_kwargs,
              n_steps=co.get("n_steps", old.n_steps), batch_size=co.get("batch_size", old.batch_size),
              n_epochs=old.n_epochs, learning_rate=co.get("learning_rate", old.learning_rate),
              gamma=old.gamma, gae_lambda=old.gae_lambda, clip_range=old.clip_range,
              ent_coef=co.get("ent_coef", old.ent_coef), vf_coef=old.vf_coef, max_grad_norm=old.max_grad_norm,
              verbose=0)
    new.policy.load_state_dict(widen_state_dict(old.policy.state_dict(), new.policy.state_dict()))
    new.num_timesteps = old.num_timesteps
    new._n_updates = getattr(old, "_n_updates", 0)
    return new, True


def obs_size(path) -> int:
    """Cuántas entradas tiene un modelo guardado (sin cargar el entorno)."""
    from stable_baselines3 import PPO
    return int(PPO.load(path, device="cpu").observation_space.shape[0])


def backup_before_widen(path, n_old: int = 24) -> Path:
    """Copia el modelo viejo a models/anteriores/ antes de ampliarlo (por si acaso)."""
    import shutil
    import time
    path = Path(path)
    dst = path.parent / "anteriores" / f"{path.stem}_{n_old}entradas_{time.strftime('%Y%m%d_%H%M')}.zip"
    dst.parent.mkdir(exist_ok=True)
    shutil.copy2(path, dst)
    return dst
