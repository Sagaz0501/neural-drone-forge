"""
Evalúa un modelo (o el piloto PD) y guarda la trayectoria para verla en Blender.

    python scripts/evaluate.py --model models/stage0.zip --stage 0 --episodes 50
    python scripts/evaluate.py --pd --stage 3                     # piloto clásico, para comparar
    python scripts/evaluate.py --model models/stage3.zip --level levels/mi_nivel.json

Genera trajectories/<nombre>.json  ->  en Blender: blender/import_trajectory.py
"""
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import numpy as np

from drone_rl import DroneEnv
from drone_rl.controller import PDPilot


def run_episode(env, policy, seed):
    obs, _ = env.reset(seed=seed)
    frames, done, total = [], False, 0.0
    t = 0.0

    def snap():
        s = env.state
        frames.append({"t": round(t, 4), "pos": s.pos.round(4).tolist(),
                       "rot": [round(s.roll, 4), round(s.pitch, 4), round(s.yaw, 4)],
                       "thr": round(s.throttle, 3), "goal": env.goal_idx})
    snap()
    while not done:
        a = policy(obs, env)
        obs, r, term, trunc, info = env.step(a)
        total += r
        t += env.dt
        snap()
        done = term or trunc
    return frames, total, info


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", type=str)
    ap.add_argument("--pd", action="store_true", help="usar el piloto PD en vez de la IA")
    ap.add_argument("--stage", type=int, default=0)
    ap.add_argument("--level", type=str, default=None)
    ap.add_argument("--episodes", type=int, default=20)
    ap.add_argument("--save", type=int, default=3, help="cuántas trayectorias guardar")
    ap.add_argument("--max-seconds", type=float, default=None, help="tiempo máximo por intento")
    ap.add_argument("--spawn-jitter", type=float, default=0.0, help="+- metros de variación en la salida")
    ap.add_argument("--yaw-jitter", type=float, default=0.0, help="+- radianes de variación en la salida")
    ap.add_argument("--density", type=float, default=1.0, help="bosque: 0.5 claro · 1 normal · 2 denso")
    ap.add_argument("--wind", type=float, default=0.0, help="viento máx. con ráfagas (m/s)")
    args = ap.parse_args()

    env = DroneEnv(stage=args.stage, level_path=args.level, max_seconds=args.max_seconds,
                   spawn_jitter=args.spawn_jitter, yaw_jitter=args.yaw_jitter, density=args.density, wind=args.wind)
    if args.pd:
        pilot = PDPilot(env.p)
        policy, tag = (lambda o, e: pilot.act(e.state, e._goal())), "pd"
    else:
        from stable_baselines3 import PPO
        model = PPO.load(args.model, device="cpu")
        policy, tag = (lambda o, e: model.predict(o, deterministic=True)[0]), Path(args.model).stem

    name = Path(args.level).stem if args.level else f"stage{args.stage}"
    outdir = ROOT / "trajectories"
    outdir.mkdir(exist_ok=True)
    succ, crash, rewards, reasons, reached, speeds, angs = 0, 0, [], {}, [], [], []
    for ep in range(args.episodes):
        frames, total, info = run_episode(env, policy, seed=10_000 + ep)
        succ += info["success"]
        crash += info["crashed"]
        rewards.append(total)
        reached.append(env.goal_idx)
        if info["success"]:
            speeds.append(info.get("avg_speed", 0.0))
            angs.append(info.get("ang_rate", 0.0))
        if info["crash_reason"]:
            reasons[info["crash_reason"]] = reasons.get(info["crash_reason"], 0) + 1
        if ep < args.save:
            path = outdir / f"{tag}_{name}_ep{ep}.json"
            path.write_text(json.dumps({
                "dt": env.dt, "result": "success" if info["success"] else "crash" if info["crashed"] else "timeout",
                "level": env.level.to_dict(), "frames": frames,
            }))
    n = args.episodes
    print(f"{tag} en {name}:  exito {succ/n*100:.0f} %   crash {crash/n*100:.0f} %   "
          f"recompensa media {np.mean(rewards):.1f}   crashes por: {reasons or '-'}")
    if speeds:
        print(f"en los vuelos exitosos: velocidad media {np.mean(speeds):.2f} m/s   giro medio {np.mean(angs):.0f} °/s")
    if env.level.goals and len(env.level.goals) > 1:
        print(f"puntos alcanzados por intento: {reached}  (de {len(env.level.goals)})")
    print(f"Trayectorias en {outdir}")


if __name__ == "__main__":
    main()
