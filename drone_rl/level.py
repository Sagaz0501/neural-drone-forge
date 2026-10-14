"""
Niveles: obstáculos, metas y "sensores" (raycasts).

Un nivel es un JSON (lo genera blender/export_level.py o se crea al azar):

{
  "name": "mi_nivel",
  "spawn": [0, 0, 0],
  "goals": [[5, 0, 2], [8, 4, 3]],             # se visitan en orden
  "boxes":   [{"min": [x,y,z], "max": [x,y,z]}],  # cajas alineadas a los ejes (AABB)
  "spheres": [{"center": [x,y,z], "radius": r}],
  "cylinders": [{"center": [x,y], "radius": r, "z": [z0, z1]}],   # verticales (troncos)
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
    cyl_xy: np.ndarray = field(default_factory=lambda: np.zeros((0, 2)))   # centro (x, y)
    cyl_r: np.ndarray = field(default_factory=lambda: np.zeros(0))
    cyl_z: np.ndarray = field(default_factory=lambda: np.zeros((0, 2)))    # (z abajo, z arriba)
    bounds_xy: float = 30.0
    bounds_z: float = 15.0

    # ---------------- carga / guardado ----------------
    @staticmethod
    def from_dict(d: dict) -> "Level":
        boxes = d.get("boxes", [])
        sph = d.get("spheres", [])
        cyl = d.get("cylinders", [])
        b = d.get("bounds", {})
        return Level(
            name=d.get("name", "nivel"),
            spawn=np.array(d.get("spawn", [0, 0, 0]), dtype=float),
            goals=[np.array(g, dtype=float) for g in d.get("goals", [])],
            box_min=np.array([bx["min"] for bx in boxes], dtype=float).reshape(-1, 3),
            box_max=np.array([bx["max"] for bx in boxes], dtype=float).reshape(-1, 3),
            sph_c=np.array([s["center"] for s in sph], dtype=float).reshape(-1, 3),
            sph_r=np.array([s["radius"] for s in sph], dtype=float).reshape(-1),
            cyl_xy=np.array([c["center"][:2] for c in cyl], dtype=float).reshape(-1, 2),
            cyl_r=np.array([c["radius"] for c in cyl], dtype=float).reshape(-1),
            cyl_z=np.array([c["z"] for c in cyl], dtype=float).reshape(-1, 2),
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
            "cylinders": [{"center": c.tolist(), "radius": float(r), "z": z.tolist()}
                          for c, r, z in zip(self.cyl_xy, self.cyl_r, self.cyl_z)],
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
        if len(self.cyl_r):
            h = np.maximum(np.linalg.norm(self.cyl_xy - p[:2], axis=1) - self.cyl_r, 0.0)   # distancia al costado
            v = np.maximum(np.maximum(self.cyl_z[:, 0] - p[2], p[2] - self.cyl_z[:, 1]), 0.0)  # arriba/abajo
            if np.any(h * h + v * v < radius * radius):
                return True
        return False

    def out_of_bounds(self, p: np.ndarray) -> bool:
        return abs(p[0]) > self.bounds_xy or abs(p[1]) > self.bounds_xy or p[2] > self.bounds_z

    # ---------------- sensores ----------------
    def raycast(self, origin: np.ndarray, dirs: np.ndarray, max_dist: float) -> np.ndarray:
        """Distancia al primer obstáculo (o al piso) para cada dirección. Shape (N,).

        Es como un sensor de distancia láser (ToF / LiDAR de 1 punto) en cada dirección.
        Todo va "vectorizado" (todos los rayos contra todos los obstáculos a la vez) y solo
        se revisan los obstáculos a menos de `max_dist`: un bosque tiene cientos de piezas.
        """
        dist = np.full(len(dirs), float(max_dist))
        d = np.where(np.abs(dirs) < 1e-9, 1e-9, dirs)        # evita división por 0

        # piso (z = 0)
        hit_floor = dirs[:, 2] < -1e-6
        t_floor = -origin[2] / d[:, 2]
        dist = np.where(hit_floor & (t_floor >= 0), np.minimum(dist, t_floor), dist)

        # cajas: método de "slabs"
        if len(self.box_min):
            near = np.linalg.norm(np.clip(origin, self.box_min, self.box_max) - origin, axis=1) <= max_dist
            if near.any():
                t1 = (self.box_min[near][None] - origin) / d[:, None]          # (rayos, cajas, 3)
                t2 = (self.box_max[near][None] - origin) / d[:, None]
                t_near = np.max(np.minimum(t1, t2), axis=2)
                t_far = np.min(np.maximum(t1, t2), axis=2)
                hit = t_far >= np.maximum(t_near, 0.0)
                t_hit = np.where(t_near >= 0, t_near, 0.0)                     # si está adentro, distancia 0
                dist = np.minimum(dist, np.where(hit, t_hit, np.inf).min(axis=1))

        # esferas
        if len(self.sph_r):
            near = np.linalg.norm(self.sph_c - origin, axis=1) - self.sph_r <= max_dist
            if near.any():
                oc = origin - self.sph_c[near]                                 # (esferas, 3)
                r = self.sph_r[near]
                b = dirs @ oc.T                                                # (rayos, esferas)
                cc = np.sum(oc * oc, axis=1) - r * r
                disc = b * b - cc
                ok = disc >= 0
                sq = np.sqrt(np.where(ok, disc, 0.0))
                t = -b - sq
                t = np.where(t < 0, -b + sq, t)
                hit = ok & (t >= 0)
                dist = np.minimum(dist, np.where(hit, t, np.inf).min(axis=1))

        # cilindros verticales (troncos): costado + tapas, como un "slab" en z
        if len(self.cyl_r):
            hz = np.maximum(np.maximum(self.cyl_z[:, 0] - origin[2], origin[2] - self.cyl_z[:, 1]), 0.0)
            hxy = np.maximum(np.linalg.norm(self.cyl_xy - origin[:2], axis=1) - self.cyl_r, 0.0)
            near = hxy * hxy + hz * hz <= max_dist * max_dist
            if near.any():
                c, r, z = self.cyl_xy[near], self.cyl_r[near], self.cyl_z[near]
                ocx, ocy = origin[0] - c[:, 0], origin[1] - c[:, 1]               # (cil,)
                dx, dy = dirs[:, 0:1], dirs[:, 1:2]                               # (rayos, 1)
                a = dx * dx + dy * dy
                b = dx * ocx + dy * ocy                                           # (rayos, cil)
                cc = ocx * ocx + ocy * ocy - r * r
                flat = a < 1e-12                                                  # rayo vertical
                a_s = np.where(flat, 1.0, a)
                disc = b * b - a_s * cc
                sq = np.sqrt(np.maximum(disc, 0.0))
                inside_xy = cc <= 0
                t_in = np.where(flat, np.where(inside_xy, -np.inf, np.inf), (-b - sq) / a_s)
                t_out = np.where(flat, np.where(inside_xy, np.inf, -np.inf), (-b + sq) / a_s)
                miss_side = ~flat & (disc < 0)
                tz1 = (z[:, 0] - origin[2]) / d[:, 2:3]
                tz2 = (z[:, 1] - origin[2]) / d[:, 2:3]
                t_near = np.maximum(t_in, np.minimum(tz1, tz2))
                t_far = np.minimum(t_out, np.maximum(tz1, tz2))
                hit = ~miss_side & (t_far >= np.maximum(t_near, 0.0))
                t_hit = np.maximum(t_near, 0.0)
                dist = np.minimum(dist, np.where(hit, t_hit, np.inf).min(axis=1))

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


# ---------------- bosque ----------------
SPECIES_P = {"arbol": 0.38, "pino": 0.27, "joven": 0.20, "arbusto": 0.10, "roca": 0.05}


def _make_tree(rng, kind, x, y):
    """Un árbol = un tronco (cilindro vertical) + copas (esferas). Las copas altas dejan
    ~2.6 m libres abajo para volar entre troncos; los árboles jóvenes y arbustos quedan
    justo a la altura de vuelo (son los que hay que esquivar)."""
    t = {"tipo": kind, "x": float(x), "y": float(y), "tronco": None, "copas": [], "color": float(rng.random())}
    if kind == "arbol":
        r0 = rng.uniform(1.3, 2.0)
        cz = max(rng.uniform(4.0, 6.0), 2.6 + r0)
        t["copas"].append([x, y, cz, r0])
        for _ in range(int(rng.integers(0, 3))):              # 0-2 bultos extra
            r = r0 * rng.uniform(0.55, 0.8)
            ox, oy = rng.uniform(-0.75, 0.75, 2) * r0
            z = max(cz + rng.uniform(-0.3, 0.5) * r0, 2.6 + r)
            t["copas"].append([x + ox, y + oy, z, r])
        t["tronco"] = [rng.uniform(0.18, 0.32), cz]           # radio, altura
    elif kind == "pino":
        r = rng.uniform(1.15, 1.55)
        cz = 2.6 + r + rng.uniform(0.0, 0.6)
        h = rng.uniform(6.5, 9.5)
        while r > 0.3 and cz < h:
            t["copas"].append([x, y, cz, r])
            cz += r * 0.95
            r *= 0.75
        t["tronco"] = [rng.uniform(0.14, 0.24), cz]
    elif kind == "joven":
        h = rng.uniform(1.4, 2.4)
        t["copas"].append([x, y, h, rng.uniform(0.5, 0.85)])
        t["tronco"] = [rng.uniform(0.07, 0.12), h]
    elif kind == "arbusto":
        r = rng.uniform(0.35, 0.75)
        t["copas"].append([x, y, r * 0.55, r])
    else:                                                     # roca
        r = rng.uniform(0.3, 0.9)
        t["copas"].append([x, y, -r * 0.2, r])
    t["copas"] = [[float(v) for v in c] for c in t["copas"]]
    if t["tronco"]:
        t["tronco"] = [float(v) for v in t["tronco"]]
    return t


def random_forest(rng, spawn, goals, density=1.0, margin=6.0):
    """Árboles al azar (muestreo de Poisson: nunca demasiado pegados) alrededor del camino.
    density = 1 normal · 0.5 claro · 2 denso. Devuelve una lista de árboles (para dibujarlos);
    forest_shapes() los convierte en cilindros y esferas para la física."""
    pts = np.array([spawn] + list(goals), dtype=float)
    lo, hi = pts[:, :2].min(axis=0) - margin, pts[:, :2].max(axis=0) + margin
    spacing = 2.8 / np.sqrt(max(float(density), 0.2))
    target = int(np.prod(hi - lo) / spacing ** 2 * 0.7)
    kinds, probs = list(SPECIES_P), np.array(list(SPECIES_P.values()))
    trees, xy = [], np.zeros((0, 2))
    for _ in range(target * 8):
        if len(trees) >= target:
            break
        p = rng.uniform(lo, hi)
        if len(xy) and np.min(np.linalg.norm(xy - p, axis=1)) < spacing * 0.85:
            continue
        if np.linalg.norm(p - pts[0, :2]) < 1.8 or np.any(np.linalg.norm(pts[1:, :2] - p, axis=1) < 1.6):
            continue
        t = _make_tree(rng, kinds[rng.choice(len(kinds), p=probs / probs.sum())], *p)
        ok = True
        for cx, cy, cz, r in t["copas"]:
            c = np.array([cx, cy, cz])
            if np.hypot(cx - pts[0, 0], cy - pts[0, 1]) < r + 0.7:          # no tapar el despegue
                ok = False
            if np.any(np.linalg.norm(pts[1:] - c, axis=1) < r + 0.9):        # ni las metas
                ok = False
        if ok:
            trees.append(t)
            xy = np.vstack([xy, p])
    return trees


def forest_shapes(trees):
    """Árboles -> (cil_xy, cil_r, cil_z, esf_c, esf_r) para Level."""
    cxy, cr, cz, sc, sr = [], [], [], [], []
    for t in trees:
        if t["tronco"]:
            cxy.append([t["x"], t["y"]])
            cr.append(t["tronco"][0])
            cz.append([0.0, t["tronco"][1]])
        for x, y, z, r in t["copas"]:
            sc.append([x, y, z])
            sr.append(r)
    return (np.array(cxy).reshape(-1, 2), np.array(cr), np.array(cz).reshape(-1, 2),
            np.array(sc).reshape(-1, 3), np.array(sr))


def forest_level(rng, density=1.0):
    """Nivel 'bosque': cruzar el bosque hasta un aro a 9-14 m, a 1.2-2.2 m de altura
    (debajo de las copas altas). Lo usan el entrenamiento y el escenario 3D de Blender."""
    lv = Level(name="bosque")
    ang, dist = rng.uniform(-np.pi, np.pi), rng.uniform(9.0, 14.0)
    lv.goals = [lv.spawn + np.array([dist * np.cos(ang), dist * np.sin(ang), rng.uniform(1.2, 2.2)])]
    trees = random_forest(rng, lv.spawn, lv.goals, density)
    lv.cyl_xy, lv.cyl_r, lv.cyl_z, lv.sph_c, lv.sph_r = forest_shapes(trees)
    return lv, trees
