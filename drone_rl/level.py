"""
Niveles: obstáculos, metas y "sensores" (raycasts).

Un nivel es un JSON (lo genera blender/export_level.py o se crea al azar):

{
  "name": "mi_nivel",
  "spawn": [0, 0, 0],
  "goals": [[5, 0, 2], [8, 4, 3]],             # se visitan en orden
  "boxes":   [{"min": [x,y,z], "max": [x,y,z]}],  # cajas alineadas a los ejes (AABB)
  "spheres": [{"center": [x,y,z], "radius": r}],
  "bounds":  {"xy": 30, "z": 15}                  # salir de aquí = crash
}
Todo en metros.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np


@dataclass
class Level:
    name: str = "vacio"
    spawn: np.ndarray = field(default_factory=lambda: np.zeros(3))
    goals: list = field(default_factory=list)            # lista de np.ndarray(3)
    box_min: np.ndarray = field(default_factory=lambda: np.zeros((0, 3)))
    box_max: np.ndarray = field(default_factory=lambda: np.zeros((0, 3)))
    sph_c: np.ndarray = field(default_factory=lambda: np.zeros((0, 3)))
    sph_r: np.ndarray = field(default_factory=lambda: np.zeros(0))
    bounds_xy: float = 30.0
    bounds_z: float = 15.0

    # ---------------- carga / guardado ----------------
    @staticmethod
    def from_dict(d: dict) -> "Level":
        boxes = d.get("boxes", [])
        sph = d.get("spheres", [])
        b = d.get("bounds", {})
        return Level(
            name=d.get("name", "nivel"),
            spawn=np.array(d.get("spawn", [0, 0, 0]), dtype=float),
            goals=[np.array(g, dtype=float) for g in d.get("goals", [])],
            box_min=np.array([bx["min"] for bx in boxes], dtype=float).reshape(-1, 3),
            box_max=np.array([bx["max"] for bx in boxes], dtype=float).reshape(-1, 3),
            sph_c=np.array([s["center"] for s in sph], dtype=float).reshape(-1, 3),
            sph_r=np.array([s["radius"] for s in sph], dtype=float).reshape(-1),
            bounds_xy=float(b.get("xy", 30.0)),
            bounds_z=float(b.get("z", 15.0)),
        )

    @staticmethod
    def load(path: str | Path) -> "Level":
        return Level.from_dict(json.loads(Path(path).read_text()))

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "spawn": self.spawn.tolist(),
            "goals": [g.tolist() for g in self.goals],
            "boxes": [{"min": a.tolist(), "max": b.tolist()} for a, b in zip(self.box_min, self.box_max)],
            "spheres": [{"center": c.tolist(), "radius": float(r)} for c, r in zip(self.sph_c, self.sph_r)],
            "bounds": {"xy": self.bounds_xy, "z": self.bounds_z},
        }

    # ---------------- colisiones ----------------
    def collides(self, p: np.ndarray, radius: float) -> bool:
        """¿Una esfera de radio `radius` en `p` toca algún obstáculo?"""
        if len(self.box_min):
            closest = np.clip(p, self.box_min, self.box_max)      # punto más cercano de cada caja
            if np.any(np.linalg.norm(closest - p, axis=1) < radius):
                return True
        if len(self.sph_r):
            if np.any(np.linalg.norm(self.sph_c - p, axis=1) < self.sph_r + radius):
                return True
        return False

    def out_of_bounds(self, p: np.ndarray) -> bool:
        return abs(p[0]) > self.bounds_xy or abs(p[1]) > self.bounds_xy or p[2] > self.bounds_z

    # ---------------- sensores ----------------
    def raycast(self, origin: np.ndarray, dirs: np.ndarray, max_dist: float) -> np.ndarray:
        """Distancia al primer obstáculo (o al piso) para cada dirección. Shape (N,).

        Es como un sensor de distancia láser (ToF / LiDAR de 1 punto) en cada dirección.
        """
        n = len(dirs)
        dist = np.full(n, max_dist)
        d = np.where(np.abs(dirs) < 1e-9, 1e-9, dirs)        # evita división por 0

        # piso (z = 0)
        hit_floor = dirs[:, 2] < -1e-6
        t_floor = -origin[2] / d[:, 2]
        dist = np.where(hit_floor & (t_floor >= 0), np.minimum(dist, t_floor), dist)

        # cajas: método de "slabs"
        for bmin, bmax in zip(self.box_min, self.box_max):
            t1 = (bmin - origin) / d
            t2 = (bmax - origin) / d
            t_near = np.max(np.minimum(t1, t2), axis=1)
            t_far = np.min(np.maximum(t1, t2), axis=1)
            hit = (t_far >= np.maximum(t_near, 0.0))
            t_hit = np.where(t_near >= 0, t_near, 0.0)       # si está adentro, distancia 0
            dist = np.where(hit, np.minimum(dist, t_hit), dist)

        # esferas
        for c, r in zip(self.sph_c, self.sph_r):
            oc = origin - c
            b = dirs @ oc
            cc = oc @ oc - r * r
            disc = b * b - cc
            ok = disc >= 0
            sq = np.sqrt(np.where(ok, disc, 0.0))
            t = -b - sq
            t = np.where(t < 0, -b + sq, t)
            hit = ok & (t >= 0)
            dist = np.where(hit, np.minimum(dist, t), dist)

        return np.clip(dist, 0.0, max_dist)


# ---------------- generador de niveles aleatorios (currículum) ----------------
def random_goal(rng: np.random.Generator, spawn: np.ndarray, r_min=3.0, r_max=8.0, z=(1.0, 4.0)) -> np.ndarray:
    ang = rng.uniform(-np.pi, np.pi)
    r = rng.uniform(r_min, r_max)
    return spawn + np.array([r * np.cos(ang), r * np.sin(ang), 0.0]) + np.array([0, 0, rng.uniform(*z)])


def random_pillars(rng, spawn, goals, n=(2, 5), keep_out=1.5) -> tuple[np.ndarray, np.ndarray]:
    """Pone columnas (cajas altas) cerca del camino spawn -> metas, sin tapar spawn ni metas."""
    pts = [spawn] + list(goals)
    mins, maxs = [], []
    target = rng.integers(n[0], n[1] + 1)
    tries = 0
    while len(mins) < target and tries < 200:
        tries += 1
        i = rng.integers(0, len(pts) - 1)
        a, b = pts[i], pts[i + 1]
        u = rng.uniform(0.25, 0.75)
        c = a + (b - a) * u + np.append(rng.normal(0, 1.0, 2), 0.0)
        half = np.array([rng.uniform(0.2, 0.6), rng.uniform(0.2, 0.6), 0.0])
        h = rng.uniform(3.0, 6.0)
        bmin = np.array([c[0] - half[0], c[1] - half[1], 0.0])
        bmax = np.array([c[0] + half[0], c[1] + half[1], h])
        clear = all(np.linalg.norm(np.clip(q, bmin, bmax) - q) > keep_out for q in pts)
        if clear:
            mins.append(bmin)
            maxs.append(bmax)
    return np.array(mins).reshape(-1, 3), np.array(maxs).reshape(-1, 3)
