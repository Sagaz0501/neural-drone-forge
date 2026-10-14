"""
Exporta el ACTOR de un modelo PPO a un .npz con matrices numpy, para que la IA corra en
Blender sin PyTorch (ver drone_rl/runtime.py).

    python scripts/export_policy.py models/bodega.zip            -> models/policy_bodega.npz

También verifica que la versión numpy decide exactamente lo mismo que el modelo original.
"""
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import numpy as np
import torch
from stable_baselines3 import PPO

from drone_rl.runtime import NumpyPolicy


def export(model_path, out_path=None):
    model = PPO.load(model_path, device="cpu")
    pol = model.policy
    linear = [m for m in pol.mlp_extractor.policy_net if isinstance(m, torch.nn.Linear)] + [pol.action_net]
    arrays = {}
    for i, layer in enumerate(linear):
        arrays[f"W{i}"] = layer.weight.detach().numpy().astype(np.float32)
        arrays[f"b{i}"] = layer.bias.detach().numpy().astype(np.float32)
    meta = {"source": Path(model_path).name, "sizes": [linear[0].in_features] + [l.out_features for l in linear],
            "activation": "tanh", "timesteps": int(model.num_timesteps)}
    out = Path(out_path or Path(model_path).with_name("policy_" + Path(model_path).stem + ".npz"))
    np.savez(out, n_layers=len(linear), meta=json.dumps(meta), **arrays)

    # verificación: misma decisión que SB3 (modo determinista) en 1000 observaciones al azar
    npol = NumpyPolicy(out)
    obs = np.random.default_rng(0).uniform(-1, 1, (1000, meta["sizes"][0])).astype(np.float32)
    ref = np.clip(model.predict(obs, deterministic=True)[0], -1, 1)
    mine = np.stack([npol(o) for o in obs])
    err = float(np.max(np.abs(ref - mine)))
    print(f"{out}  capas {meta['sizes']}  error máx vs PyTorch: {err:.2e}")
    assert err < 1e-4, "la versión numpy no coincide con el modelo"
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("model")
    ap.add_argument("--out", default=None)
    a = ap.parse_args()
    export(a.model, a.out)
