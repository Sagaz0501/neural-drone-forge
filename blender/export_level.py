"""
Blender -> nivel JSON para entrenar.   (Abrir en el Text Editor de Blender y Alt+P)

Cómo armar un nivel:
  - Colección "Obstacles": cualquier malla. Se exporta como caja alineada a los ejes (AABB).
    Si el nombre empieza con "Sphere" (o tiene la propiedad custom shape="sphere") se exporta como esfera.
  - Colección "Goals": empties (o cualquier objeto). Se visitan en orden alfabético: Goal_01, Goal_02...
  - Objeto "Spawn" (opcional): dónde arranca el dron. Si no existe, el origen.

La primera vez que lo corres, si no existen esas colecciones, crea un nivel de ejemplo para editar.
Todo se convierte a metros usando la escala de unidades de la escena (tu escena está en mm).
"""
import json
from pathlib import Path

import bpy
from mathutils import Vector

LEVEL_NAME = "mi_nivel"
OUT_DIR = ""          # carpeta "levels" del repo. Vacío = carpeta "levels" junto al .blend
BOUNDS = {"xy": 30.0, "z": 15.0}

sc = bpy.context.scene
S = sc.unit_settings.scale_length or 1.0          # 1 unidad de Blender = S metros
TO_BU = 1.0 / S


def ensure_col(name):
    c = bpy.data.collections.get(name)
    if c is None:
        c = bpy.data.collections.new(name)
        sc.collection.children.link(c)
    return c


def make_example():
    obs, goals = ensure_col("Obstacles"), ensure_col("Goals")
    mat = bpy.data.materials.get("Obstacle_Mat") or bpy.data.materials.new("Obstacle_Mat")
    mat.diffuse_color = (0.85, 0.45, 0.1, 1.0)
    pillars = [((3.0, 0.4, 2.5), (0.6, 0.6, 5.0)), ((6.0, -1.2, 2.0), (0.8, 0.8, 4.0)),
               ((8.5, 2.5, 1.5), (3.0, 0.4, 3.0))]
    for i, (c, size) in enumerate(pillars):
        bpy.ops.mesh.primitive_cube_add(size=1, location=Vector(c) * TO_BU)
        o = bpy.context.active_object
        o.name = f"Pillar_{i:02d}"
        o.scale = Vector(size) * TO_BU
        o.data.materials.append(mat)
        for col in o.users_collection:
            col.objects.unlink(o)
        obs.objects.link(o)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.7 * TO_BU, location=Vector((5.0, 3.0, 2.5)) * TO_BU)
    o = bpy.context.active_object
    o.name = "Sphere_00"
    o.data.materials.append(mat)
    for col in o.users_collection:
        col.objects.unlink(o)
    obs.objects.link(o)
    for i, g in enumerate([(5.0, 0.0, 2.0), (10.0, 0.0, 3.0), (10.0, 5.0, 2.0)]):
        e = bpy.data.objects.new(f"Goal_{i+1:02d}", None)
        e.empty_display_type = 'SPHERE'
        e.empty_display_size = 0.5 * TO_BU            # = radio de meta (0.5 m)
        e.location = Vector(g) * TO_BU
        goals.objects.link(e)
    print("Nivel de ejemplo creado: edita Obstacles / Goals y vuelve a correr este script.")


def to_m(v):
    return [round(x * S, 4) for x in v]


def export():
    obs = bpy.data.collections["Obstacles"]
    goals = bpy.data.collections["Goals"]
    boxes, spheres = [], []
    for o in obs.all_objects:
        if o.type != 'MESH':
            continue
        corners = [o.matrix_world @ Vector(c) for c in o.bound_box]
        if o.name.lower().startswith("sphere") or o.get("shape") == "sphere":
            center = sum(corners, Vector()) / 8
            radius = max(o.dimensions) / 2
            spheres.append({"center": to_m(center), "radius": round(radius * S, 4)})
        else:
            mn = Vector((min(c.x for c in corners), min(c.y for c in corners), min(c.z for c in corners)))
            mx = Vector((max(c.x for c in corners), max(c.y for c in corners), max(c.z for c in corners)))
            boxes.append({"min": to_m(mn), "max": to_m(mx)})
    goal_list = [to_m(o.matrix_world.translation) for o in sorted(goals.all_objects, key=lambda o: o.name)]
    spawn = bpy.data.objects.get("Spawn")
    data = {
        "name": LEVEL_NAME,
        "spawn": to_m(spawn.matrix_world.translation) if spawn else [0.0, 0.0, 0.0],
        "goals": goal_list, "boxes": boxes, "spheres": spheres, "bounds": BOUNDS,
    }
    if not OUT_DIR and not bpy.data.filepath:
        raise RuntimeError("Guarda el .blend primero o pon OUT_DIR con la carpeta levels del repo")
    out_dir = Path(OUT_DIR) if OUT_DIR else Path(bpy.path.abspath("//levels"))
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"{LEVEL_NAME}.json"
    path.write_text(json.dumps(data, indent=2))
    print(f"Exportado {path}: {len(boxes)} cajas, {len(spheres)} esferas, {len(goal_list)} metas")


if "Obstacles" not in bpy.data.collections or "Goals" not in bpy.data.collections:
    make_example()
else:
    export()
