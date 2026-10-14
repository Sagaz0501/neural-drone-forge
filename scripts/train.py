"""
Entrena la IA con PPO (Stable-Baselines3).

Ejemplos:
    # nivel 0 (hover) desde cero
    python scripts/train.py --stage 0 --steps 300000

    # currículum: el nivel 1 arranca desde lo que aprendió en el 0
    python scripts/train.py --stage 1 --steps 500000 --init models/stage0.zip

    # entrenar en un nivel hecho en Blender
    python scripts/train.py --level levels/mi_nivel.json --init models/stage3.zip

Ver curvas en vivo:  tensorboard --logdir runs
"""
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import numpy as np
from stable_baselines3 import PPO
from stable_baselines3.common.callbacks import BaseCallback, CheckpointCallback
from stable_baselines3.common.env_util import make_vec_env
from stable_baselines3.common.vec_env import DummyVecEnv, SubprocVecEnv

from drone_rl import DEFAULT_REWARD, STAGES, DroneEnv


class SuccessLogger(BaseCallback):
    """Imprime y registra la tasa de éxito / crash de los últimos episodios."""

    def __init__(self, every=20_000):
        super().__init__()
        self.every, self.next = every, every
        self.succ, self.crash = [], []

    def _on_training_start(self) -> None:
        # si se continúa un modelo, el contador de pasos no arranca en 0
        self.next = self.num_timesteps + self.every

    def _on_step(self) -> bool:
        for info, done in zip(self.locals["infos"], self.locals["dones"]):
            if done:
                self.succ.append(info.get("success", False))
                self.crash.append(info.get("crashed", False))
        if self.num_timesteps >= self.next and self.succ:
            s, c = np.mean(self.succ[-200:]), np.mean(self.crash[-200:])
            self.logger.record("drone/success_rate", s)
            self.logger.record("drone/crash_rate", c)
            print(f"[{self.num_timesteps:>9,} pasos]  exito {s*100:5.1f} %   crash {c*100:5.1f} %", flush=True)
            self.next += self.every
        return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--stage", type=int, default=0, choices=list(STAGES))
    ap.add_argument("--level", type=str, default=None, help="JSON de nivel exportado desde Blender")
    ap.add_argument("--steps", type=int, default=300_000)
    ap.add_argument("--envs", type=int, default=8, help="drones simulando en paralelo")
    ap.add_argument("--init", type=str, default=None, help="modelo previo para seguir entrenando")
    ap.add_argument("--out", type=str, default=None)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--ckpt-every", type=int, default=100_000, help="guardar una copia cada N pasos")
    ap.add_argument("--reward", type=str, default="{}", help='cambiar pesos, ej: {"clearance": 0.5}')
    ap.add_argument("--max-seconds", type=float, default=None, help="duración máxima de un intento")
    ap.add_argument("--start-anywhere", type=float, default=0.0,
                    help="nivel fijo con varios aros: prob. de aparecer en cualquier tramo de la ruta")
    ap.add_argument("--focus-blocked", type=float, default=1.0,
                    help="con --start-anywhere: los tramos bloqueados salen N veces más seguido")
    ap.add_argument("--log-std", type=float, default=None,
                    help="al continuar un modelo: fijar el ruido de exploración (ej. -0.5 = más exploración)")
    ap.add_argument("--ent", type=float, default=None, help="coeficiente de entropía (premia explorar)")
    ap.add_argument("--start-speed", type=float, default=0.0,
                    help="con --start-anywhere: aparecer ya volando hasta N m/s (como al llegar en la ruta real)")
    ap.add_argument("--spawn-jitter", type=float, default=0.0, help="+- metros de variación al aparecer")
    ap.add_argument("--yaw-jitter", type=float, default=0.0, help="+- radianes de variación al aparecer")
    ap.add_argument("--subproc", action="store_true", help="un proceso por entorno (más rápido con muchos núcleos)")
    ap.add_argument("--density", type=float, default=1.0, help="bosque: 0.5 claro · 1 normal · 2 denso")
    ap.add_argument("--wind", type=float, default=0.0, help="viento máx. con ráfagas (m/s)")
    args = ap.parse_args()

    try:
        import tensorboard  # noqa: F401
        tb = str(ROOT / "runs")
    except ImportError:
        tb = None
        print("(tensorboard no instalado: sin curvas en vivo, solo consola)")

    name = Path(args.level).stem if args.level else f"stage{args.stage}"
    out = Path(args.out or ROOT / "models" / f"{name}.zip")
    out.parent.mkdir(parents=True, exist_ok=True)

    env = make_vec_env(DroneEnv, n_envs=args.envs, seed=args.seed,
                       env_kwargs=dict(stage=args.stage, level_path=args.level, max_seconds=args.max_seconds,
                                       reward={**DEFAULT_REWARD, **json.loads(args.reward)},
                                       start_anywhere=args.start_anywhere, spawn_jitter=args.spawn_jitter,
                                       yaw_jitter=args.yaw_jitter, focus_blocked=args.focus_blocked,
                                       start_speed=args.start_speed, density=args.density, wind=args.wind),
                       vec_env_cls=SubprocVecEnv if args.subproc else DummyVecEnv)

    if args.init:
        print(f"Cargando {args.init} y continuando el entrenamiento")
        from drone_rl.upgrade import load_ppo
        model, _ = load_ppo(args.init, env=env)
        model.tensorboard_log = tb
        if args.log_std is not None:
            import torch
            with torch.no_grad():
                model.policy.log_std.fill_(args.log_std)      # más ruido = prueba cosas nuevas
            print(f"ruido de exploración fijado: std = {np.exp(args.log_std):.2f}")
        if args.ent is not None:
            model.ent_coef = args.ent
    else:
        model = PPO(
            "MlpPolicy", env,
            # red: 24 entradas -> 128 -> 128 -> 4 salidas (actor) y -> 1 (crítico)
            policy_kwargs=dict(net_arch=dict(pi=[128, 128], vf=[128, 128]),
                               log_std_init=-0.7),   # exploración inicial más suave (std ~0.5)
            n_steps=1024, batch_size=256, n_epochs=10,
            learning_rate=3e-4, gamma=0.99, gae_lambda=0.95, clip_range=0.2,
            ent_coef=0.0, verbose=0, seed=args.seed,
            tensorboard_log=tb,
        )

    print(f"Entrenando '{name}' por {args.steps:,} pasos con {args.envs} drones en paralelo...")
    model.learn(
        total_timesteps=args.steps,
        callback=[SuccessLogger(), CheckpointCallback(max(args.ckpt_every // args.envs, 1),   # SB3 cuenta llamadas, no pasos totales
                                                  str(out.parent / "checkpoints"), name_prefix=name)],
        tb_log_name=name,
        reset_num_timesteps=not args.init,
        progress_bar=False,
    )
    model.save(out)
    print(f"Modelo guardado en {out}")


if __name__ == "__main__":
    main()
