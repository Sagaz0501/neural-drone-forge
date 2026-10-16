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

    def collides_many(self, P: np.ndarray, radius: float) -> np.ndarray:
        """collides() para varios puntos a la vez (los pájaros). Devuelve un bool por punto."""
        P = np.asarray(P, dtype=float).reshape(-1, 3)
        hit = np.zeros(len(P), dtype=bool)
        if len(self.box_min):
            closest = np.clip(P[:, None, :], self.box_min[None], self.box_max[None])
            hit |= np.any(np.linalg.norm(closest - P[:, None, :], axis=2) < radius, axis=1)
        if len(self.sph_r):
            hit |= np.any(np.linalg.norm(self.sph_c[None] - P[:, None, :], axis=2) < self.sph_r[None] + radius, axis=1)
        if len(self.cyl_r):
            h = np.maximum(np.linalg.norm(self.cyl_xy[None] - P[:, None, :2], axis=2) - self.cyl_r[None], 0.0)
            v = np.maximum(np.maximum(self.cyl_z[None, :, 0] - P[:, None, 2], P[:, None, 2] - self.cyl_z[None, :, 1]), 0.0)
            hit |= np.any(h * h + v * v < radius * radius, axis=1)
        return hit

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


def hunt_pillars(rng, spawn, n=(9, 14), area=12.5, gap=1.6) -> tuple[np.ndarray, np.ndarray]:
    """Caza con columnas: columnas altas repartidas por toda el área (no solo en un camino),
    separadas entre sí al menos `gap` m para que siempre se pueda pasar entre ellas."""
    mins, maxs = [], []
    target = int(rng.integers(n[0], n[1] + 1))
    for _ in range(400):
        if len(mins) >= target:
            break
        r = area * np.sqrt(rng.uniform())
        a = rng.uniform(-np.pi, np.pi)
        c = spawn[:2] + np.array([r * np.cos(a), r * np.sin(a)])
        half = np.array([rng.uniform(0.25, 0.6), rng.uniform(0.25, 0.6)])
        bmin = np.array([c[0] - half[0], c[1] - half[1], 0.0])
        bmax = np.array([c[0] + half[0], c[1] + half[1], rng.uniform(4.0, 7.0)])
        if np.linalg.norm(np.clip(spawn[:2], bmin[:2], bmax[:2]) - spawn[:2]) < 2.5:
            continue
        if any(np.linalg.norm(np.maximum(0, np.maximum(m[:2] - bmax[:2], bmin[:2] - M[:2]))) < gap
               for m, M in zip(mins, maxs)):
            continue
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


def forest_level(rng, density=1.0, n_goals=1):
    """Nivel 'bosque': cruzar el bosque hasta un aro a 9-14 m, a 1.2-2.2 m de altura
    (debajo de las copas altas). Con n_goals=3: slalom de 3 aros (6-9 m entre aros, giros de
    hasta 70°). Lo usan el entrenamiento y el escenario 3D de Blender."""
    lv = Level(name="bosque" if n_goals == 1 else "bosque_aros")
    ang = rng.uniform(-np.pi, np.pi)
    if n_goals == 1:
        dist = rng.uniform(9.0, 14.0)
        lv.goals = [lv.spawn + np.array([dist * np.cos(ang), dist * np.sin(ang), rng.uniform(1.2, 2.2)])]
    else:
        p = lv.spawn.copy()
        for k in range(n_goals):
            if k:
                ang += rng.uniform(-1.2, 1.2)
            dist = rng.uniform(6.0, 9.0) if k else rng.uniform(5.0, 8.0)
            p = np.array([p[0] + dist * np.cos(ang), p[1] + dist * np.sin(ang), rng.uniform(1.2, 2.2)])
            p[:2] = np.clip(p[:2], -20, 20)
            lv.goals.append(p.copy())
    trees = random_forest(rng, lv.spawn, lv.goals, density)
    lv.cyl_xy, lv.cyl_r, lv.cyl_z, lv.sph_c, lv.sph_r = forest_shapes(trees)
    return lv, trees


# ---------------- grabar: una casa ----------------
def house_boxes(cx, cy, w, d, wall_h):
    """Una casa como 3 cajas (la misma cuenta en el juego: app/casa.js): paredes + techo de dos aguas
    aproximado con dos escalones. w = largo en x, d = ancho en y. Devuelve (mins, maxs)."""
    rh = 0.35 * d                                    # alto del techo (la cumbrera va a lo largo de x)
    eave = 0.3                                       # el alero sobresale
    mins = [[cx - w / 2, cy - d / 2, 0.0],
            [cx - w / 2 - eave, cy - d / 2 - eave, wall_h],
            [cx - w / 2 - eave, cy - d / 4, wall_h + rh / 2]]
    maxs = [[cx + w / 2, cy + d / 2, wall_h],
            [cx + w / 2 + eave, cy + d / 2 + eave, wall_h + rh / 2],
            [cx + w / 2 + eave, cy + d / 4, wall_h + rh]]
    return np.array(mins, dtype=float), np.array(maxs, dtype=float)


def film_house_level(rng):
    """Nivel 'Grabar: toma fija': una casa a 10-16 m de la salida. El cliente quiere tomas desde cierta
    distancia y altura (band = d_min, d_max, z_min, z_max); la meta es un punto de cámara en esa zona,
    en un lado al azar de la casa. Devuelve (nivel, sujeto, band)."""
    lv = Level(name="grabar_casa")
    for _ in range(100):
        a = rng.uniform(-np.pi, np.pi)
        r = rng.uniform(10.0, 16.0)
        cx, cy = r * np.cos(a), r * np.sin(a)
        w, d, wall_h = rng.uniform(5.0, 7.5), rng.uniform(4.0, 6.0), rng.uniform(2.6, 3.2)
        lv.box_min, lv.box_max = house_boxes(cx, cy, w, d, wall_h)
        subject = np.array([cx, cy, wall_h * 0.6])
        d_min = rng.uniform(5.5, 8.0)
        band = (d_min, d_min + rng.uniform(4.0, 6.0), rng.uniform(2.5, 4.0), 0.0)
        band = (band[0], band[1], band[2], band[2] + rng.uniform(3.0, 5.0))
        for _ in range(30):
            b = rng.uniform(-np.pi, np.pi)
            dc, zc = (band[0] + band[1]) / 2, (band[2] + band[3]) / 2
            cam = np.array([cx + dc * np.cos(b), cy + dc * np.sin(b), zc])
            if np.all(np.abs(cam[:2]) < 26) and not lv.collides(cam, 1.0):
                lv.goals = [cam]
                return lv, subject, band
    raise RuntimeError("No pude armar el nivel de grabar")


def film_posts(rng, lv, shot, n=(5, 9), keep=1.5):
    """Grabar entre postes (nivel 12): postes de luz / sombrillas (cilindros) alrededor del sujeto, cerca de la
    ruta de la toma pero sin taparla (a más de `keep` m), ni la salida ni el inicio. Se agregan a lv."""
    path = np.array(shot.path(48))
    sx, sy = shot.subject[0], shot.subject[1]
    xy, rr, zz = list(lv.cyl_xy), list(lv.cyl_r), list(lv.cyl_z)
    target = int(rng.integers(n[0], n[1] + 1))
    for _ in range(400):
        if len(rr) >= target + len(lv.cyl_r):
            break
        a, d = rng.uniform(-np.pi, np.pi), rng.uniform(4.0, 14.0)
        c = np.array([sx + d * np.cos(a), sy + d * np.sin(a)])
        r = rng.uniform(0.12, 0.3)
        if np.min(np.hypot(path[:, 0] - c[0], path[:, 1] - c[1])) < keep + r:
            continue
        if np.hypot(*(c - lv.spawn[:2])) < 2.5 or lv.collides(np.array([c[0], c[1], 1.0]), r + 0.8):
            continue
        if any(np.hypot(*(c - q)) < 2.0 for q in xy):
            continue
        xy.append(c)
        rr.append(r)
        zz.append([0.0, rng.uniform(4.0, 6.0)])
    lv.cyl_xy, lv.cyl_r, lv.cyl_z = np.array(xy).reshape(-1, 2), np.array(rr), np.array(zz).reshape(-1, 2)
    return lv


# ---------------- pruebas nuevas: carrera, persecución, entrega (niveles 16-18) ----------------
def race_track(rng, spawn, n=(6, 9), step=(7.0, 15.0), turn=1.2, z=(1.5, 6.0), area=50.0) -> list:
    """Carrera (nivel 16): una pista de 6-9 portales en orden, lejos unos de otros (7-15 m) y con curvas de hasta
    ±70°: hay que ir RÁPIDO de uno al siguiente. La pista no se sale del área (rebota hacia el centro)."""
    goals, p = [], np.asarray(spawn, dtype=float)[:2].copy()
    ang = rng.uniform(-np.pi, np.pi)
    for _ in range(int(rng.integers(n[0], n[1] + 1))):
        ang += rng.uniform(-turn, turn)
        d = rng.uniform(*step)
        q = p + d * np.array([np.cos(ang), np.sin(ang)])
        if np.any(np.abs(q) > area):                       # cerca del borde: girar hacia el centro
            ang = np.arctan2(-p[1], -p[0]) + rng.uniform(-0.5, 0.5)
            q = p + d * np.array([np.cos(ang), np.sin(ang)])
        p = q
        goals.append(np.array([p[0], p[1], rng.uniform(*z)]))
    return goals


def off_line_pillars(rng, spawn, goals, n=(6, 12), keep_line=2.5, area=50.0) -> tuple[np.ndarray, np.ndarray]:
    """Columnas por el área pero FUERA de la línea recta entre portales (a más de `keep_line` m): se ven al pasar
    (los sensores tienen que aprender que no estorban) pero el camino recto queda libre."""
    pts = np.array([spawn] + list(goals))[:, :2]
    a, ab = pts[:-1], pts[1:] - pts[:-1]
    lo, hi = pts.min(axis=0) - 8, pts.max(axis=0) + 8
    mins, maxs = [], []
    target = int(rng.integers(n[0], n[1] + 1))
    for _ in range(400):
        if len(mins) >= target:
            break
        c = rng.uniform(np.maximum(lo, -area), np.minimum(hi, area))
        half = rng.uniform(0.3, 1.2, 2)
        u = np.clip(np.sum((c - a) * ab, axis=1) / np.maximum(np.sum(ab * ab, axis=1), 1e-9), 0, 1)
        if np.min(np.linalg.norm(a + ab * u[:, None] - c, axis=1)) - half.max() < keep_line:
            continue
        mins.append(np.array([c[0] - half[0], c[1] - half[1], 0.0]))
        maxs.append(np.array([c[0] + half[0], c[1] + half[1], rng.uniform(3.0, 12.0)]))
    return np.array(mins).reshape(-1, 3), np.array(maxs).reshape(-1, 3)


def delivery_level(rng, spawn, dist=(14.0, 32.0), n=(5, 11)):
    """Entrega (nivel 17): una plataforma lejos (14-32 m) y edificios (cajas anchas y altas) en el camino.
    La meta es quedarse 1 s a 0,6 m sobre la plataforma (después aterriza el piloto automático, como en el juego).
    Devuelve (meta, box_min, box_max)."""
    sp = np.asarray(spawn, dtype=float)
    ang = rng.uniform(-np.pi, np.pi)
    r = rng.uniform(*dist)
    pad = sp + np.array([r * np.cos(ang), r * np.sin(ang), 0.0])
    if rng.random() < 0.3:                                   # a veces en una azotea
        roof = rng.uniform(2.0, 5.0)
        h = np.array([rng.uniform(1.5, 2.5), rng.uniform(1.5, 2.5)])
        roof_box = (np.array([pad[0] - h[0], pad[1] - h[1], 0.0]), np.array([pad[0] + h[0], pad[1] + h[1], roof]))
        pad = pad + np.array([0.0, 0.0, roof])
    else:
        roof_box = None
    mins, maxs = ([roof_box[0]], [roof_box[1]]) if roof_box else ([], [])
    target = int(rng.integers(n[0], n[1] + 1))
    for _ in range(300):
        if len(mins) >= target:
            break
        u = rng.uniform(0.15, 0.85)
        c = sp[:2] + (pad[:2] - sp[:2]) * u + rng.normal(0, 3.0, 2)
        half = rng.uniform(0.6, 2.2, 2)
        bmin = np.array([c[0] - half[0], c[1] - half[1], 0.0])
        bmax = np.array([c[0] + half[0], c[1] + half[1], rng.uniform(3.0, 10.0)])
        if any(np.linalg.norm(np.clip(q[:2], bmin[:2], bmax[:2]) - q[:2]) < 2.5 for q in (sp, pad)):
            continue
        mins.append(bmin)
        maxs.append(bmax)
    return pad + np.array([0.0, 0.0, 0.6]), np.array(mins).reshape(-1, 3), np.array(maxs).reshape(-1, 3)
