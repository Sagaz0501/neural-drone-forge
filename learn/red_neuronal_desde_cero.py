"""
Red neuronal DESDE CERO, solo con numpy (sin PyTorch). Léelo junto con docs/redes-neuronales.md

    python learn/red_neuronal_desde_cero.py            # todo
    python learn/red_neuronal_desde_cero.py --parte 3  # solo una parte

Parte 1: una sola neurona, a mano
Parte 2: una red aprende XOR (lo que una neurona sola NO puede)
Parte 3: una red aprende una forma 2D y la "vemos" aprender en la terminal
Parte 4: la misma red aprende a volar el dron imitando al piloto PD
"""
import argparse
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


# =====================================================================
# La red: capas densas + activaciones + backpropagation + Adam
# =====================================================================
class Dense:
    """y = x @ W + b      (cada columna de W = los pesos de UNA neurona)"""

    def __init__(self, n_in, n_out, rng):
        # inicialización "Xavier": pesos pequeños y aleatorios, escalados al tamaño de la capa
        self.W = rng.normal(0, np.sqrt(1.0 / n_in), (n_in, n_out))
        self.b = np.zeros(n_out)

    def forward(self, x):
        self.x = x                       # se guarda para el backward
        return x @ self.W + self.b

    def backward(self, grad_out):
        # regla de la cadena: cuánto cambia la pérdida si muevo cada peso
        self.dW = self.x.T @ grad_out
        self.db = grad_out.sum(axis=0)
        return grad_out @ self.W.T       # gradiente hacia la capa anterior

    def params(self):
        return [(self.W, "dW"), (self.b, "db")]


class Tanh:
    def forward(self, x):
        self.y = np.tanh(x)
        return self.y

    def backward(self, g):
        return g * (1 - self.y ** 2)     # derivada de tanh

    def params(self):
        return []


class Sigmoid:
    def forward(self, x):
        self.y = 1 / (1 + np.exp(-x))
        return self.y

    def backward(self, g):
        return g * self.y * (1 - self.y)

    def params(self):
        return []


class MLP:
    """Perceptrón multicapa: [Dense, Tanh, Dense, Tanh, ..., Dense, (salida)]"""

    def __init__(self, sizes, out_act=None, seed=0):
        rng = np.random.default_rng(seed)
        self.layers = []
        for i in range(len(sizes) - 1):
            self.layers.append(Dense(sizes[i], sizes[i + 1], rng))
            if i < len(sizes) - 2:
                self.layers.append(Tanh())
        if out_act:
            self.layers.append(out_act)
        # estado del optimizador Adam
        self.t = 0
        self.m = [np.zeros_like(p) for L in self.layers for p, _ in L.params()]
        self.v = [np.zeros_like(p) for L in self.layers for p, _ in L.params()]

    def forward(self, x):
        for L in self.layers:
            x = L.forward(x)
        return x

    def backward(self, grad):
        for L in reversed(self.layers):
            grad = L.backward(grad)

    def adam_step(self, lr=1e-2, b1=0.9, b2=0.999, eps=1e-8):
        """Adam = descenso de gradiente con 'inercia' y paso adaptativo por peso."""
        self.t += 1
        i = 0
        for L in self.layers:
            for p, gname in L.params():
                g = getattr(L, gname)
                self.m[i] = b1 * self.m[i] + (1 - b1) * g
                self.v[i] = b2 * self.v[i] + (1 - b2) * g * g
                mh = self.m[i] / (1 - b1 ** self.t)
                vh = self.v[i] / (1 - b2 ** self.t)
                p -= lr * mh / (np.sqrt(vh) + eps)       # <- aquí la red APRENDE
                i += 1

    def n_params(self):
        return sum(p.size for L in self.layers for p, _ in L.params())


def mse(pred, y):
    """Pérdida = error cuadrático medio, y su gradiente."""
    diff = pred - y
    return float(np.mean(diff ** 2)), 2 * diff / diff.size


# =====================================================================
def parte1():
    print("\n=== PARTE 1: una neurona ===")
    x = np.array([0.5, -1.0, 2.0])          # 3 entradas
    w = np.array([0.8, 0.2, -0.5])          # 3 pesos
    b = 0.1                                 # sesgo
    z = x @ w + b
    y = np.tanh(z)
    print(f"entradas x = {x}")
    print(f"pesos    w = {w},  sesgo b = {b}")
    print(f"z = x·w + b = 0.5*0.8 + (-1)*0.2 + 2*(-0.5) + 0.1 = {z:.2f}")
    print(f"salida = tanh(z) = {y:.3f}")
    print("Eso es todo lo que hace una neurona: suma ponderada + una curva (activación).")


def parte2():
    print("\n=== PARTE 2: XOR ===")
    X = np.array([[0, 0], [0, 1], [1, 0], [1, 1]], dtype=float)
    Y = np.array([[0], [1], [1], [0]], dtype=float)
    net = MLP([2, 4, 1], out_act=Sigmoid(), seed=1)
    print(f"Red 2 -> 4 -> 1  ({net.n_params()} parámetros)")

    # --- verificación numérica del gradiente (prueba que el backprop está bien) ---
    pred = net.forward(X)
    _, g = mse(pred, Y)
    net.backward(g)
    W = net.layers[0].W
    analytic = net.layers[0].dW[0, 0]
    eps = 1e-5
    W[0, 0] += eps; lp, _ = mse(net.forward(X), Y)
    W[0, 0] -= 2 * eps; lm, _ = mse(net.forward(X), Y)
    W[0, 0] += eps
    print(f"chequeo de gradiente: backprop {analytic:.6f}  vs  numérico {(lp - lm) / (2 * eps):.6f}")

    for epoch in range(2001):
        pred = net.forward(X)
        loss, g = mse(pred, Y)
        net.backward(g)
        net.adam_step(lr=0.05)
        if epoch in (0, 100, 500, 2000):
            print(f"  época {epoch:4d}  pérdida {loss:.4f}   predicciones {pred.ravel().round(2)}")
    print("Objetivo: [0, 1, 1, 0].  Una sola neurona nunca lo logra (no es separable con una línea).")


def ascii_map(f, n=24):
    xs = np.linspace(-1.5, 1.5, n * 2)
    ys = np.linspace(1.5, -1.5, n)
    gx, gy = np.meshgrid(xs, ys)
    pts = np.stack([gx.ravel(), gy.ravel()], 1)
    v = f(pts).reshape(gy.shape)
    chars = " .:-=+*#%@"
    return "\n".join("".join(chars[int(np.clip(c, 0, 0.999) * len(chars))] for c in row) for row in v)


def parte3():
    print("\n=== PARTE 3: aprender una forma (anillo) ===")
    rng = np.random.default_rng(0)
    X = rng.uniform(-1.5, 1.5, (2000, 2))
    r = np.linalg.norm(X, axis=1)
    Y = ((r > 0.5) & (r < 1.0)).astype(float)[:, None]          # 1 = dentro del anillo
    net = MLP([2, 16, 16, 1], out_act=Sigmoid(), seed=0)
    print(f"Red 2 -> 16 -> 16 -> 1  ({net.n_params()} parámetros). La verdad que debe aprender:")
    print(ascii_map(lambda p: ((np.linalg.norm(p, axis=1) > 0.5) & (np.linalg.norm(p, axis=1) < 1.0)).astype(float)))
    for epoch in range(3001):
        idx = rng.integers(0, len(X), 128)                         # mini-lote
        pred = net.forward(X[idx])
        loss, g = mse(pred, Y[idx])
        net.backward(g)
        net.adam_step(lr=0.01)
        if epoch in (0, 300, 3000):
            acc = np.mean((net.forward(X) > 0.5) == (Y > 0.5))
            print(f"\n--- época {epoch}: precisión {acc*100:.1f} % ---")
            print(ascii_map(lambda p: net.forward(p).ravel()))


def parte4():
    print("\n=== PARTE 4: la red aprende a volar el dron (imitando al piloto PD) ===")
    from drone_rl import DroneEnv
    from drone_rl.controller import PDPilot

    env = DroneEnv(stage=2)
    pilot = PDPilot(env.p)

    def collect(episodes, policy=None, seed0=0):
        """Vuela episodios y guarda (observación, acción del experto)."""
        Xs, Ys, wins = [], [], 0
        for ep in range(episodes):
            obs, _ = env.reset(seed=seed0 + ep)
            done = False
            while not done:
                expert = pilot.act(env.state, env._goal())
                Xs.append(obs); Ys.append(expert)
                a = expert if policy is None else policy(obs)
                obs, _, te, tr, info = env.step(a)
                done = te or tr
            wins += info["success"]
        return np.array(Xs), np.array(Ys), wins / episodes

    X, Y, _ = collect(60)
    print(f"Datos del experto: {len(X)} ejemplos (observación de 24 números -> acción de 4)")
    net = MLP([24, 64, 64, 4], seed=0)
    print(f"Red 24 -> 64 -> 64 -> 4  ({net.n_params()} parámetros)")
    rng = np.random.default_rng(0)

    def train(X, Y, epochs):
        for e in range(epochs):
            idx = rng.integers(0, len(X), 256)
            loss, g = mse(net.forward(X[idx]), Y[idx])
            net.backward(g)
            net.adam_step(lr=3e-3)
        return loss

    policy = lambda o: np.clip(net.forward(o[None])[0], -1, 1)
    loss = train(X, Y, 4000)
    _, _, ok = collect(30, policy, seed0=5000)
    print(f"Ronda 1 (solo imitar):   pérdida {loss:.4f}   éxito volando sola: {ok*100:.0f} %")
    # DAgger: la red vuela, el experto dice qué habría hecho, y se reentrena con eso
    for r in range(2, 4):
        Xn, Yn, _ = collect(30, policy, seed0=1000 * r)
        X, Y = np.concatenate([X, Xn]), np.concatenate([Y, Yn])
        loss = train(X, Y, 3000)
        _, _, ok = collect(30, policy, seed0=5000)
        print(f"Ronda {r} (DAgger):       pérdida {loss:.4f}   éxito volando sola: {ok*100:.0f} %")
    print("Esto es aprendizaje SUPERVISADO (copiar a un experto). PPO, en cambio, aprende sin experto:")
    print("solo con la recompensa. Por eso puede llegar a superar al piloto PD (ej. esquivar columnas).")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--parte", type=int, default=0)
    a = ap.parse_args()
    partes = [parte1, parte2, parte3, parte4]
    for i, f in enumerate(partes, 1):
        if a.parte in (0, i):
            f()
