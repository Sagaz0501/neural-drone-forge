"""
Trayectoria JSON (scripts/evaluate.py) -> animación en Blender.   (Text Editor, Alt+P)

- Anima "Drone_Root" (el padre de tu frame; lo crea drone_sim.py) con keyframes.
- Reconstruye los obstáculos y metas del episodio en la colección "Replay_Level".
- Dale Play (Espacio) en el timeline. Sal del simulador manual (ESC) antes, si estaba abierto.
"""
import json
import math
from pathlib import Path

import bpy
from mathutils import Vector

# Puede ser: el nombre de un archivo en trajectories/ del repo, una ruta absoluta,
# o el nombre de un bloque de texto de Blender que contenga el JSON.
TRAJ_PATH = r"demo_circuito_nivel2.json"

sc = bpy.context.scene
S = sc.unit_settings.scale_length or 1.0
TO_BU = 1.0 / S


def rebuild_level(level):
    col = bpy.data.collections.get("Replay_Level")
    if col:
        for o in list(col.objects):
            bpy.data.objects.remove(o, do_unlink=True)
    else:
        col = bpy.data.collections.new("Replay_Level")
        sc.collection.children.link(col)
    mat = bpy.data.materials.get("Obstacle_Mat") or bpy.data.materials.new("Obstacle_Mat")
    mat.diffuse_color = (0.85, 0.45, 0.1, 1.0)
    gmat = bpy.data.materials.get("Goal_Mat") or bpy.data.materials.new("Goal_Mat")
    gmat.diffuse_color = (0.1, 0.9, 0.4, 1.0)

    def link(o):
        for c in o.users_collection:
            c.objects.unlink(o)
        col.objects.link(o)
        return o

    for i, b in enumerate(level.get("boxes", [])):
        mn, mx = Vector(b["min"]), Vector(b["max"])
        bpy.ops.mesh.primitive_cube_add(size=1, location=(mn + mx) / 2 * TO_BU)
        o = link(bpy.context.active_object)
        o.name = f"R_Box_{i:02d}"
        o.scale = (mx - mn) * TO_BU
        o.data.materials.append(mat)
    for i, s in enumerate(level.get("spheres", [])):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=s["radius"] * TO_BU, location=Vector(s["center"]) * TO_BU)
        o = link(bpy.context.active_object)
        o.name = f"R_Sphere_{i:02d}"
        o.data.materials.append(mat)
    for i, g in enumerate(level.get("goals", [])):
        bpy.ops.mesh.primitive_torus_add(major_radius=0.5 * TO_BU, minor_radius=0.04 * TO_BU,
                                         location=Vector(g) * TO_BU, rotation=(0, math.radians(90), 0))
        o = link(bpy.context.active_object)
        o.name = f"R_Goal_{i+1:02d}"
        o.data.materials.append(gmat)


def read_traj(name):
    """Busca la trayectoria: bloque de texto, ruta absoluta, o trajectories/ del repo."""
    if name in bpy.data.texts:
        return bpy.data.texts[name].as_string()
    cands = [Path(bpy.path.abspath(name))]
    me = next((t for t in bpy.data.texts if t.name.startswith("import_trajectory") and t.filepath), None)
    if me:                                           # el script se abrió desde el repo
        repo = Path(bpy.path.abspath(me.filepath)).resolve().parents[1]
        cands += [repo / "trajectories" / name, repo / name]
    for c in cands:
        if c.is_file():
            return c.read_text()
    raise FileNotFoundError(f"No encontré {name}. Usa una ruta absoluta en TRAJ_PATH.")


def main():
    if not TRAJ_PATH:
        raise RuntimeError("Pon la ruta del JSON en TRAJ_PATH (arriba del script)")
    data = json.loads(read_traj(TRAJ_PATH))
    root = bpy.data.objects.get("Drone_Root")
    if root is None:
        raise RuntimeError("No existe Drone_Root: corre primero blender/drone_sim.py una vez (crea el padre del frame)")
    rebuild_level(data["level"])

    fps = round(1.0 / data["dt"])
    sc.render.fps = fps
    root.animation_data_clear()
    root.rotation_mode = 'XYZ'
    for i, f in enumerate(data["frames"]):
        root.location = Vector(f["pos"]) * TO_BU
        root.rotation_euler = f["rot"]
        root.keyframe_insert("location", frame=i + 1)
        root.keyframe_insert("rotation_euler", frame=i + 1)
    # sin "suavizado" entre keyframes: la simulación ya es suave
    if root.animation_data and root.animation_data.action:
        try:
            for fc in root.animation_data.action.fcurves:
                for kp in fc.keyframe_points:
                    kp.interpolation = 'LINEAR'
        except AttributeError:
            pass   # Blender 5 usa "slotted actions"; el resultado se ve igual
    sc.frame_start, sc.frame_end = 1, len(data["frames"])
    sc.frame_set(1)
    print(f"Importados {len(data['frames'])} frames a {fps} fps. Resultado: {data['result']}")


main()
