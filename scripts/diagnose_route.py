"""
Diagnóstico por tramo de una ruta: ¿en qué tramo exacto falla la IA?

    python scripts/diagnose_route.py --model models/bodega.zip --level levels/bodega.json

Para cada tramo k, pone al dron en el punto k-1 mirando al punto k y mira si llega
(6 intentos: 1 determinista + 5 con el ruido de exploración). Los tramos con algo en la
línea recta se marcan con [bloqueado]: ahí la IA tiene que esquivar.
"""
import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import numpy as np
from stable_baselines3 import PPO

from drone_rl import DroneEnv


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    ap.add_argument("--level", required=True)
    ap.add_argument("--tries", type=int, default=6)
    a = ap.parse_args()
    model = PPO.load(a.model, device="cpu")
    env = DroneEnv(level_path=a.level, max_seconds=70, focus_blocked=2.0)
    blocked = env.start_weights > env.start_weights.min() + 1e-9
    total = 0
    for k in range(len(env.level.goals)):
        ok, why = 0, {}
        for t in range(a.tries):
            env.reset(seed=t)
            env.goal_idx = k
            env.state.pos = (env.level.goals[k - 1] if k else env.level.spawn).copy()
            g = env.level.goals[k] - env.state.pos
            env.state.yaw = float(np.arctan2(g[1], g[0]))
            env.prev_dist = env._goal_dist()
            obs = env._obs()
            info = {}
            for _ in range(1500):
                obs, _, te, tr, info = env.step(model.predict(obs, deterministic=(t == 0))[0])
                if env.goal_idx > k or te or tr:
                    break
            if env.goal_idx > k:
                ok += 1
            else:
                r = info.get("crash_reason") or "tiempo"
                why[r] = why.get(r, 0) + 1
        total += ok
        tag = " [bloqueado]" if blocked[k] else ""
        print(f"tramo {k:2d} -> punto {k + 1:2d}: {ok}/{a.tries} {why if why else ''}{tag}")
    print(f"total: {total}/{a.tries * len(env.level.goals)}")


if __name__ == "__main__":
    main()
