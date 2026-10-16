"""
Tomas de video: la RUTA que sigue la cámara mientras graba un sujeto (una casa, un auto…).

Una toma no es "llegar y quedarse": es un punto de cámara que se mueve por una ruta y el dron tiene
que ir con él SIN perder el encuadre. Así se graba de verdad:
    fija     quieto en un punto exacto (5-7 s)
    orbita   da la vuelta al sujeto por un arco (70-150°), a ritmo parejo
    revelar  arranca bajo y cerca, sube alejándose (el sujeto "aparece")
    seguir   (reservada: sujetos que se mueven)

Fases: "ir" (el punto espera en el inicio de la ruta) -> "grabando" (arranca cuando el dron llega a
menos de START_R y va despacio; el punto recorre la ruta en `dur` s) -> "lista".
Todas las rutas usan suavizado (smoothstep): arrancan y terminan con velocidad 0, como un buen camarógrafo.

Fotos (niveles 13 y 14): una foto es una toma FIJA corta (2,5-3,5 s), como las del juego (app/data/trabajos.json):
llegar al punto, frenar y quedarse quieto con el sujeto al centro. random_foto() y random_fotos() (un set de 2-4).

Lo usan el entrenamiento (env.py, niveles 11-14), Blender (runtime.Flight) y el juego (game/sim.js Toma:
MISMAS cuentas; test_sim.mjs lo comprueba). Solo numpy.
"""
from __future__ import annotations

import numpy as np

START_R = 1.5         # a menos de esto (m) del inicio de la ruta…
START_V = 2.0         # …y yendo a menos de esto (m/s), la toma arranca


def ease(u: float) -> float:
    return u * u * (3.0 - 2.0 * u)


def dease(u: float) -> float:
    return 6.0 * u * (1.0 - u)


class Toma:
    """Una toma: tipo, sujeto (x, y, z) y los números de su ruta (ver at())."""

    def __init__(self, tipo: str, subject, dur: float, **p):
        self.tipo, self.dur, self.p = tipo, float(dur), {k: float(v) for k, v in p.items()}
        self.subject = np.asarray(subject, dtype=float)
        self.reset()

    def reset(self):
        self.t, self.phase = 0.0, "ir"
        return self

    # ---- la ruta ----
    def at(self, u: float):
        """Punto de cámara y su velocidad (m/s) en la fracción u (0-1) de la ruta."""
        u = min(max(u, 0.0), 1.0)
        s, ds = ease(u), dease(u) / self.dur          # ds = d(ease)/dt
        p, (sx, sy) = self.p, self.subject[:2]
        if self.tipo == "fija":
            return np.array([p["x"], p["y"], p["z"]]), np.zeros(3)
        if self.tipo == "orbita":
            a = p["a0"] + p["sweep"] * s
            w = p["sweep"] * ds
            pos = np.array([sx + p["r"] * np.cos(a), sy + p["r"] * np.sin(a), p["z"]])
            return pos, np.array([-p["r"] * np.sin(a) * w, p["r"] * np.cos(a) * w, 0.0])
        if self.tipo == "revelar":
            d = p["d0"] + (p["d1"] - p["d0"]) * s
            z = p["z0"] + (p["z1"] - p["z0"]) * s
            c, si = np.cos(p["az"]), np.sin(p["az"])
            vd, vz = (p["d1"] - p["d0"]) * ds, (p["z1"] - p["z0"]) * ds
            return np.array([sx + d * c, sy + d * si, z]), np.array([vd * c, vd * si, vz])
        raise ValueError(f"toma desconocida: {self.tipo}")

    def start(self):
        return self.at(0.0)[0]

    @property
    def progress(self) -> float:
        return min(self.t / self.dur, 1.0)

    def point(self):
        return self.at(self.progress)[0]

    def vel(self):
        return self.at(self.progress)[1] if self.phase == "grabando" else np.zeros(3)

    def step(self, dt: float, drone_pos, drone_vel) -> None:
        """Avanza la toma: espera al dron en el inicio, después recorre la ruta."""
        if self.phase == "ir":
            if (np.linalg.norm(np.asarray(drone_pos) - self.start()) < START_R
                    and np.linalg.norm(drone_vel) < START_V):
                self.phase = "grabando"
        elif self.phase == "grabando":
            self.t += dt
            if self.t >= self.dur - 1e-9:
                self.t = self.dur
                self.phase = "lista"

    def path(self, n: int = 32):
        return [self.at(i / (n - 1))[0] for i in range(n)]

    def band(self, margin: float = 1.0):
        """Distancia horizontal y altura que recorre la ruta (para dibujar la zona): (d_min, d_max, z_min, z_max)."""
        pts = np.array(self.path(24))
        d = np.hypot(pts[:, 0] - self.subject[0], pts[:, 1] - self.subject[1])
        return (float(d.min() - margin), float(d.max() + margin), float(pts[:, 2].min() - margin), float(pts[:, 2].max() + margin))

    def to_dict(self) -> dict:
        return {"tipo": self.tipo, "subject": self.subject.tolist(), "dur": self.dur, **self.p}

    @staticmethod
    def from_dict(d: dict) -> "Toma":
        d = dict(d)
        return Toma(d.pop("tipo"), d.pop("subject"), d.pop("dur"), **d)


def random_toma(rng, subject, level=None, tipos=("fija", "orbita", "revelar"), clear: float = 1.2) -> Toma:
    """Una toma al azar alrededor del sujeto que no atraviese nada del nivel ni se salga del área."""
    subject = np.asarray(subject, dtype=float)
    # la cámara va fija 15° hacia abajo (sin gimbal): para que el sujeto quede al centro, el punto de cámara va
    # ARRIBA del sujeto, a ~8-22° de elevación según la distancia (como lo pondría un camarógrafo)
    sz = float(subject[2])
    alt = lambda d, lo=8.0, hi=22.0: sz + d * np.tan(np.radians(rng.uniform(lo, hi)))
    for _ in range(200):
        tipo = str(rng.choice(list(tipos)))
        if tipo == "fija":
            a, d = rng.uniform(-np.pi, np.pi), rng.uniform(7.0, 11.0)
            t = Toma("fija", subject, rng.uniform(5.0, 7.0), x=subject[0] + d * np.cos(a), y=subject[1] + d * np.sin(a),
                     z=alt(d))
        elif tipo == "orbita":
            r = rng.uniform(7.5, 12.5)
            sweep = np.radians(rng.uniform(70, 150)) * (1 if rng.random() < 0.5 else -1)
            speed = rng.uniform(1.0, 2.0)                         # m/s promedio por el arco
            t = Toma("orbita", subject, float(np.clip(r * abs(sweep) / speed, 8.0, 22.0)), r=r, z=alt(r),
                     a0=rng.uniform(-np.pi, np.pi), sweep=sweep)
        else:
            d0 = rng.uniform(6.0, 7.5)
            d1 = d0 + rng.uniform(4.0, 7.0)
            t = Toma("revelar", subject, rng.uniform(8.0, 12.0), az=rng.uniform(-np.pi, np.pi), d0=d0,
                     d1=d1, z0=alt(d0, 5.0, 14.0), z1=alt(d1, 15.0, 28.0))
        pts = t.path(40)
        if all(abs(q[0]) < 26 and abs(q[1]) < 26 for q in pts) and (level is None or not any(level.collides(q, clear) for q in pts)):
            return t
    raise RuntimeError("No pude armar una toma sin chocar")


FOTO_DUR = (2.5, 3.5)     # s quieto para la foto (el juego: trabajos.json "dur" 2,5-3)


def random_foto(rng, subject, level=None, a: float | None = None, clear: float = 1.2, techo=None) -> Toma:
    """Una FOTO: toma fija corta. 70 % de la fachada a 7-10,5 m; 30 % (si hay `techo`) una inspección: cerca y alta,
    mirando el TECHO (como los trabajos 🔎 del juego: el sujeto de la foto es el techo, no la pared).
    a = ángulo alrededor del sujeto (None = al azar)."""
    for k in range(200):
        aa = rng.uniform(-np.pi, np.pi) if a is None or k >= 40 else a + rng.uniform(-0.25, 0.25)
        if techo is not None and rng.random() < 0.3:
            suj, d, el = np.asarray(techo, dtype=float), rng.uniform(6.3, 7.5), rng.uniform(12.0, 22.0)
        else:
            suj, d, el = np.asarray(subject, dtype=float), rng.uniform(7.0, 10.5), rng.uniform(8.0, 22.0)
        t = Toma("fija", suj, rng.uniform(*FOTO_DUR), x=suj[0] + d * np.cos(aa), y=suj[1] + d * np.sin(aa),
                 z=float(suj[2]) + d * np.tan(np.radians(el)))
        q = t.start()
        if abs(q[0]) < 26 and abs(q[1]) < 26 and (level is None or not level.collides(q, clear)):
            return t
    raise RuntimeError("No pude armar una foto sin chocar")


def random_fotos(rng, subject, level=None, n: int = 3, techo=None) -> list:
    """Un SET de n fotos alrededor del sujeto, en orden (cada una 40-90° más allá de la anterior, como las pide un
    cliente: frente, costado, atrás…). El dron tiene que ir de una a otra sin chocar con la casa."""
    a = rng.uniform(-np.pi, np.pi)
    sentido = 1 if rng.random() < 0.5 else -1
    out = []
    for _ in range(n):
        out.append(random_foto(rng, subject, level, a, techo=techo))
        a += sentido * np.radians(rng.uniform(40.0, 90.0))
    return out
