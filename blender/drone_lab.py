"""
DRONE LAB: entrena N drones y míralos aprender en vivo dentro de Blender.

Instalar: abrir este archivo en el Text Editor y Alt+P (o Edit > Preferences > Add-ons > Install).
Usar:     viewport 3D > barra lateral (tecla N) > pestaña "Drone Lab" > Iniciar.

Blender es solo el visor. El entrenamiento corre en otro proceso (scripts/live_train.py)
con el Python del proyecto (.venv), y se hablan por UDP en localhost:
    trainer -> Blender :9001  (posiciones, niveles, estadísticas)
    Blender -> trainer :9002  (parámetros nuevos, pausa, guardar, detener)
"""
bl_info = {
    "name": "Drone Lab (drone-rl)",
    "author": "Santiago Bernal",
    "version": (0, 1, 0),
    "blender": (4, 2, 0),
    "location": "View3D > Sidebar > Drone Lab",
    "description": "Entrena drones con PPO y míralos aprender en vivo",
    "category": "3D View",
}

import json
import math
import os
import socket
import subprocess
import sys
import time

import blf
import bpy
import gpu
from gpu_extras.batch import batch_for_shader
from mathutils import Euler, Vector

TELE_PORT, CTRL_PORT = 9001, 9002
STAGE_ITEMS = [
    ("0", "Hover", "Despegar y quedarse quieto a 1.5 m"),
    ("1", "Meta fija", "Ir a (5, 0, 2)"),
    ("2", "Metas aleatorias", "Meta aleatoria a 3-8 m"),
    ("3", "Columnas", "Meta aleatoria con columnas en el camino"),
    ("4", "Varias metas", "3 metas seguidas con columnas"),
    ("5", "Circuito (2 vueltas)", "4 aros en orden, dos vueltas: cada aro se pasa 2 veces"),
    ("LEVEL", "Nivel JSON", "Un nivel exportado desde Blender (todos los drones en el mismo nivel)"),
]
COLORS = {"fly": (0.9, 0.9, 0.95, 1), 1: (1.0, 0.12, 0.08, 1), 2: (0.1, 1.0, 0.35, 1), 3: (1.0, 0.75, 0.1, 1)}
REWARD_KEYS = ["progress", "goal", "crash", "time", "smooth", "tilt", "near", "clearance"]


def S():
    """Estado de ejecución (sobrevive a recargar el script)."""
    ns = bpy.app.driver_namespace
    if "drone_lab" not in ns:
        ns["drone_lab"] = {"running": False}
    return ns["drone_lab"]


def lab_scene():
    """La escena del laboratorio: nunca la escena de prueba (esa se regenera y borra lo suyo)."""
    sc = bpy.data.scenes.get(S().get("scene_name") or "")
    if sc is None or sc.get("es_prueba"):
        sc = next((s for s in bpy.data.scenes if not s.get("es_prueba")), None)
    if sc is None:
        sc = bpy.data.scenes.new("Laboratorio")
    return sc


def to_bu():
    return 1.0 / (lab_scene().unit_settings.scale_length or 1.0)


# =====================================================================
# Comunicación
# =====================================================================
def send_ctrl(msg):
    st = S()
    sock = st.get("ctrl_sock")
    if sock and st.get("running"):
        try:
            sock.sendto(json.dumps(msg).encode(), ("127.0.0.1", CTRL_PORT))
        except OSError:
            pass


def live_params(props):
    return {"lr": 10 ** props.lr_log, "ent": props.ent, "speed": props.speed,
            "reward": {k: getattr(props, "rw_" + k) for k in REWARD_KEYS}}


def _on_live_change(self, context):
    send_ctrl(live_params(self))


def _on_sigma(self, context):
    send_ctrl({"log_std": math.log(self.sigma)})


# =====================================================================
# Probar el modelo en un escenario aleatorio 3D (escena "Prueba IA")
# =====================================================================
def _paths(props):
    project = os.path.expanduser(bpy.path.abspath(props.project)).rstrip("/")
    python = os.path.expanduser(bpy.path.abspath(props.python))
    return project, python


def _load_test_modules(project):
    import importlib
    bdir = os.path.join(project, "blender")
    for p in (bdir, project):
        if p not in sys.path:
            sys.path.insert(0, p)
    path = os.path.join(bdir, "piloto_ia.py")
    src = open(path, encoding="utf-8").read()
    t = bpy.data.texts.get("piloto_ia.py") or bpy.data.texts.new("piloto_ia.py")
    t.clear()
    t.write(src)
    exec(compile(src, path, "exec"), {"__name__": "piloto_ia"})          # registra el Piloto IA
    import escena_lib
    import prueba_aleatoria
    importlib.reload(escena_lib)
    importlib.reload(prueba_aleatoria)
    prueba_aleatoria.register()
    return prueba_aleatoria


def start_test(npz, stage):
    """Arma un escenario aleatorio nuevo y pone a volar el modelo."""
    win = bpy.context.window_manager.windows[0]
    lab = win.scene
    project, _ = _paths(lab.drone_lab)
    with bpy.context.temp_override(window=win, screen=win.screen):
        pa = _load_test_modules(project)
        info = pa.build(stage=stage, model_npz=npz, return_scene=lab.name)
        pa.fly(bpy.context)
    S()["test_msg"] = f"Escenario #{info['seed']}: {info['metas']} meta(s), {len(info['obstaculos'])} obstáculos"
    return None


def training_stage(props):
    params = (S().get("stats") or {}).get("params") or {}
    if "stage" in params:
        return int(params["stage"])
    return 3 if props.stage == "LEVEL" else int(props.stage)


def test_stage(props):
    return training_stage(props) if props.prueba_tipo == "IGUAL" else int(props.prueba_tipo)


def export_zip(props, zp):
    project, python = _paths(props)
    npz = os.path.join(project, "models", "prueba_" + os.path.splitext(os.path.basename(zp))[0] + ".npz")
    r = subprocess.run([python, os.path.join(project, "scripts", "export_policy.py"), zp, "--out", npz],
                       cwd=project, capture_output=True, text=True, timeout=180)
    if r.returncode != 0:
        raise RuntimeError((r.stderr or r.stdout).strip().splitlines()[-1])
    return npz


def latest_model(project):
    import glob
    zs = glob.glob(os.path.join(project, "models", "live_*.zip"))
    return max(zs, key=os.path.getmtime) if zs else None


def _on_watch_change(self, context):
    st = S()
    n = len(st.get("drones", [])) or 1
    i = min(self.watch, n - 1)
    send_ctrl({"watch": i})
    set_watch(i)


def load_missions(project):
    """Lee drone_rl/missions.json del proyecto (el mismo texto que usa el entrenamiento)."""
    path = os.path.join(os.path.expanduser(bpy.path.abspath(project)), "drone_rl", "missions.json")
    st = S()
    try:
        mt = os.path.getmtime(path)
        if st.get("missions_mtime") != mt:
            st["missions"] = json.load(open(path, encoding="utf-8"))
            st["missions_mtime"] = mt
    except (OSError, ValueError):
        st.setdefault("missions", {})
    return st.get("missions", {})


def wrapped(layout, txt, width):
    import textwrap
    for line in textwrap.wrap(txt, width) or [""]:
        layout.label(text=line)


# =====================================================================
# Escena: drones, metas, obstáculos
# =====================================================================
def glow_material(name):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    oi = nt.nodes.new("ShaderNodeObjectInfo")
    nt.links.new(oi.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(oi.outputs["Color"], bsdf.inputs["Emission Color"])
    bsdf.inputs["Emission Strength"].default_value = 2.0
    return m


def flat_material(name, rgba):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = rgba
    m.diffuse_color = rgba
    return m


def ensure_col(name, parent=None):
    c = bpy.data.collections.get(name)
    if c is None:
        c = bpy.data.collections.new(name)
        (parent or lab_scene().collection).children.link(c)
    return c


def clear_col(name):
    c = bpy.data.collections.get(name)
    if not c:
        return
    for o in list(c.all_objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for ch in list(c.children):
        bpy.data.collections.remove(ch)
    bpy.data.collections.remove(c)


def sphere_mesh(name, r):
    me = bpy.data.meshes.get(name)
    if me:
        return me
    import bmesh
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=8, radius=r)
    bm.to_mesh(me)
    bm.free()
    return me


def ring_mesh(name, R, r):
    me = bpy.data.meshes.get(name)
    if me:
        return me
    verts, faces = [], []
    nu, nv = 32, 8
    for i in range(nu):
        a = 2 * math.pi * i / nu
        for j in range(nv):
            b = 2 * math.pi * j / nv
            # anillo vertical (en el plano YZ), como un aro de carreras
            verts.append((r * math.sin(b), (R + r * math.cos(b)) * math.cos(a), (R + r * math.cos(b)) * math.sin(a)))
    for i in range(nu):
        for j in range(nv):
            a, b = i * nv + j, ((i + 1) % nu) * nv + j
            faces.append((a, b, ((i + 1) % nu) * nv + (j + 1) % nv, i * nv + (j + 1) % nv))
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    return me


def cube_mesh():
    me = bpy.data.meshes.get("DL_Cube")
    if me:
        return me
    me = bpy.data.meshes.new("DL_Cube")
    v = [(x, y, z) for x in (-0.5, 0.5) for y in (-0.5, 0.5) for z in (0, 1)]
    f = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    me.from_pydata(v, [], f)
    me.materials.append(flat_material("DL_Obstacle", (0.85, 0.42, 0.1, 1)))
    return me


def build_proto():
    """Copia tu frame (hijos de Drone_Root) a una colección oculta que se instancia N veces."""
    src_root = bpy.data.objects.get("Drone_Root")
    proto = bpy.data.collections.get("DL_DroneProto")
    if proto:
        return proto
    proto = bpy.data.collections.new("DL_DroneProto")
    lab_scene().collection.children.link(proto)
    if src_root and src_root.children:
        inv = src_root.matrix_world.inverted()
        for o in src_root.children:
            c = o.copy()
            c.animation_data_clear()
            c.parent = None
            c.matrix_world = inv @ o.matrix_world
            proto.objects.link(c)
    else:                                   # sin frame: una cruz simple
        me = bpy.data.meshes.new("DL_SimpleQuad")
        k = 110
        me.from_pydata([(-k, -k, 0), (k, k, 0), (-k, k, 0), (k, -k, 0)], [(0, 1), (2, 3)], [])
        proto.objects.link(bpy.data.objects.new("DL_SimpleQuad", me))
    lc = lab_scene().view_layers[0].layer_collection.children.get("DL_DroneProto")
    if lc:
        lc.exclude = True                   # oculta la original, las instancias sí se ven
    return proto


def cell_size(stage, fixed_level):
    if fixed_level:
        return 24.0
    return {0: 3.0, 1: 9.0, 5: 12.0}.get(stage, 22.0)


RING_CUR = (0.1, 1.0, 0.35, 1)      # el aro que toca ahora
RING_NEXT = (0.2, 0.75, 1.0, 1)     # el siguiente
RING_LATER = (0.3, 0.32, 0.38, 1)   # los que faltan
RING_HOLD = (1.0, 0.9, 0.15, 1)     # hover: se llena hacia amarillo mientras aguanta 1 s
WATCH = (0.2, 0.9, 1.0, 1)          # el dron cuya red estás viendo


def build_scene(props, n, stage):
    clear_col("DroneLab")
    col = ensure_col("DroneLab")
    proto = build_proto()
    k = to_bu()
    glow = glow_material("DL_Glow")
    ring_me = ring_mesh("DL_Ring", 0.5 * k, 0.035 * k)
    ring_me.materials.clear()
    ring_me.materials.append(glow)
    beacon_me = sphere_mesh("DL_Beacon", 0.05 * k)
    if not beacon_me.materials:
        beacon_me.materials.append(glow)
    flash_me = sphere_mesh("DL_Flash", 0.35 * k)
    if not flash_me.materials:
        flash_me.materials.append(glow)

    swarm = props.layout == "SWARM"
    cell = 0.0 if swarm else cell_size(stage, props.stage == "LEVEL")
    cols = max(1, math.ceil(math.sqrt(n)))
    rows = math.ceil(n / cols)
    st = S()
    st.update(drones=[], beacons=[], flashes=[], rings=[[] for _ in range(n)], ring_state=[None] * n,
              n_goals=[0] * n,
              obstacles=[[] for _ in range(n)], offsets=[], flash_until=[0.0] * n, beacon_until=[0.0] * n,
              cols=cols, rows=rows, cell=cell, watch=min(props.watch, n - 1))
    for i in range(n):
        r, c = divmod(i, cols)
        off = Vector(((c - (cols - 1) / 2) * cell, ((rows - 1) / 2 - r) * cell, 0.0))
        st["offsets"].append(off)
        e = bpy.data.objects.new(f"DL_Drone_{i:03d}", None)
        e.instance_type = 'COLLECTION'
        e.instance_collection = proto
        e.empty_display_size = 1
        e.scale = (props.drone_scale,) * 3
        e.rotation_mode = 'XYZ'
        e.location = off * k
        col.objects.link(e)
        b = bpy.data.objects.new(f"DL_Beacon_{i:03d}", beacon_me)
        b.parent = e
        b.location = (0, 0, 0.09 * k)
        col.objects.link(b)
        fl = bpy.data.objects.new(f"DL_Flash_{i:03d}", flash_me)
        fl.hide_viewport = True
        col.objects.link(fl)
        st["drones"].append(e)
        st["beacons"].append(b)
        st["flashes"].append(fl)
    set_watch(st["watch"])


def set_watch(i):
    """Resalta el dron cuya red neuronal se está mostrando."""
    st = S()
    if not st.get("beacons"):
        return
    st["watch"] = i
    for j, b in enumerate(st["beacons"]):
        b.color = WATCH if j == i else COLORS["fly"]
        b.scale = (3.0,) * 3 if j == i else (1.0,) * 3


def apply_level(i, msg):
    st = S()
    if i >= len(st.get("drones", [])):
        return
    k = to_bu()
    off = st["offsets"][i]
    col = bpy.data.collections["DroneLab"]

    # ---- aros (metas), orientados en la dirección en que se llega a ellos ----
    goals = [Vector(g) for g in msg.get("goals", [])]
    pool = st["rings"][i]
    ring_me = bpy.data.meshes["DL_Ring"]
    while len(pool) < len(goals):
        o = bpy.data.objects.new(f"DL_Goal_{i:03d}_{len(pool)}", ring_me)
        col.objects.link(o)
        pool.append(o)
    prev = Vector(msg.get("spawn", (0, 0, 0)))
    seen = {}
    for j, o in enumerate(pool):
        if j < len(goals):
            g = goals[j]
            d = g - prev
            hz = math.hypot(d.x, d.y)
            o.rotation_euler = (0.0, -math.atan2(d.z, hz), math.atan2(d.y, d.x)) if d.length > 1e-6 else (0, 0, 0)
            key = tuple(round(v, 2) for v in g)
            lap = seen.get(key, 0)                 # mismo aro, otra vuelta: un poco más grande
            seen[key] = lap + 1
            o.scale = (1.0 + 0.18 * lap,) * 3
            o.location = (off + g) * k
            prev = g
        o.hide_viewport = j >= len(goals)
    st["n_goals"][i] = len(goals)
    st["ring_state"][i] = None
    color_rings(i, 0, 0.0)

    # ---- obstáculos ----
    obs = st["obstacles"][i]
    shapes = [("box", b) for b in msg.get("boxes", [])] + [("sph", s) for s in msg.get("spheres", [])]
    while len(obs) < len(shapes):
        o = bpy.data.objects.new(f"DL_Obs_{i:03d}_{len(obs)}", cube_mesh())
        col.objects.link(o)
        obs.append(o)
    for j, o in enumerate(obs):
        if j < len(shapes):
            kind, d = shapes[j]
            if kind == "box":
                mn, mx = Vector(d[:3]), Vector(d[3:6])
                o.location = (off + Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))) * k
                o.scale = (mx - mn) * k
            else:                            # esfera aproximada como cubo del mismo tamaño
                c, r = Vector(d[:3]), d[3]
                o.location = (off + c - Vector((0, 0, r))) * k
                o.scale = (2 * r * k,) * 3
            o.hide_viewport = False
        else:
            o.hide_viewport = True


def color_rings(i, gi, hold):
    """Aros: ya pasados = ocultos · el que toca = verde · el siguiente = celeste · los demás = gris."""
    st = S()
    state = (gi, round(hold, 1))
    if st["ring_state"][i] == state:
        return
    st["ring_state"][i] = state
    ng = st["n_goals"][i]
    for j, o in enumerate(st["rings"][i]):
        visible = gi <= j < ng
        if o.hide_viewport == visible:
            o.hide_viewport = not visible
        if not visible:
            continue
        if j == gi:
            o.color = tuple(a + (b - a) * hold for a, b in zip(RING_CUR, RING_HOLD))
        elif j == gi + 1:
            o.color = RING_NEXT
        else:
            o.color = RING_LATER


def flash(i, status, pos):
    st = S()
    k = to_bu()
    now = time.time()
    fl = st["flashes"][i]
    fl.location = (st["offsets"][i] + Vector(pos)) * k
    fl.color = COLORS[status]
    fl.hide_viewport = status == 3
    st["flash_until"][i] = now + (0.8 if status == 1 else 0.6)
    st["beacons"][i].color = COLORS[status]
    st["beacon_until"][i] = now + 0.6


# =====================================================================
# Bucle del visor (timer de Blender, ~30 Hz)
# =====================================================================
def tick():
    """Envoltorio: si algo falla (ej. borraron los drones), lo dice y reconstruye en vez de morir."""
    st = S()
    try:
        return _tick()
    except ReferenceError:
        st["error"] = ["Los drones de la vista se borraron: reconstruyendo…"]
        try:
            rebuild_view()
            st["error"] = []
        except Exception as e:
            st["error"] = [f"No pude reconstruir la vista: {e}"]
        return 1 / 30 if st.get("running") else None
    except Exception as e:
        st["error"] = [f"Error en la vista: {e!r}"[:120]]
        return 1 / 30 if st.get("running") else None


def rebuild_view():
    """Vuelve a crear los drones en la escena del laboratorio sin reiniciar el entrenamiento."""
    st = S()
    sc = lab_scene()
    p = sc.drone_lab
    params = (st.get("stats") or {}).get("params") or (st.get("hello") or {}).get("params") or {}
    n = int(params.get("drones", p.drones))
    stage = int(params.get("stage", 0 if p.stage == "LEVEL" else int(p.stage)))
    st["scene_name"] = sc.name
    build_scene(p, n, stage)
    # niveles fijos: dibujar los aros ya (por si el trainer es viejo y no reenvía nada)
    fixed = {0: [(0, 0, 1.5)], 1: [(5, 0, 2)], 5: [(6, 0, 2), (6, 6, 3), (0, 6, 2), (0, 0, 1.5)] * 2}.get(stage)
    if fixed and p.stage != "LEVEL":
        for i in range(n):
            apply_level(i, {"goals": fixed, "spawn": (0, 0, 0)})
    send_ctrl({"resend": True})              # el trainer vuelve a mandar niveles y pesos


def _tick():
    st = S()
    if not st.get("running"):
        return None
    sock = st["tele_sock"]
    frame = None
    k = to_bu()
    for _ in range(3000):                    # vaciar todo lo que llegó
        try:
            data, _ = sock.recvfrom(1 << 16)
        except (BlockingIOError, OSError):
            break
        try:
            m = json.loads(data)
        except ValueError:
            continue
        if m.get("t") == "c":                # pedazo de un mensaje grande: juntar
            parts = st.setdefault("chunks", {}).setdefault(m["id"], {})
            parts[m["k"]] = m["p"]
            if len(parts) < m["n"]:
                continue
            del st["chunks"][m["id"]]
            for old_id in [i for i in st["chunks"] if i < m["id"] - 20]:
                del st["chunks"][old_id]     # pedazos perdidos de mensajes viejos
            try:
                m = json.loads("".join(parts[j] for j in range(m["n"])))
            except (ValueError, KeyError):
                continue
        t = m.get("t")
        if t == "f":
            frame = m
            for ev in m.get("ev", []):
                if ev[0] < len(st["drones"]):
                    flash(ev[0], ev[1], ev[2:5])
        elif t == "a":
            st["act"] = m
        elif t == "w":
            st["net_w"] = m
        elif t == "l":
            apply_level(m["i"], m)
        elif t == "s":
            st["stats"] = m
        elif t == "h":
            st["hello"] = m
        elif t == "bye":
            st["bye"] = m
        elif t == "x" and st.get("pending_test"):           # el trainer exportó la generación actual
            pt = st.pop("pending_test")
            npz, stage = m["npz"], pt["stage"]
            bpy.app.timers.register(lambda: start_test(npz, stage), first_interval=0.05)
    if frame:
        n = len(st["drones"])
        for i, d in enumerate(frame["d"][:n]):
            off = st["offsets"][i]
            st["drones"][i].location = (off + Vector(d[0:3])) * k
            st["drones"][i].rotation_euler = d[3:6]
            if len(d) >= 8:
                color_rings(i, int(d[6]), float(d[7]))
        if frame.get("w", st.get("watch")) != st.get("watch") and frame.get("w", 0) < n:
            set_watch(frame["w"])
    now = time.time()
    for i, until in enumerate(st["flash_until"]):
        if until and now > until:
            st["flashes"][i].hide_viewport = True
            st["flash_until"][i] = 0.0
    for i, until in enumerate(st["beacon_until"]):
        if until and now > until:
            st["beacons"][i].color = WATCH if i == st.get("watch") else COLORS["fly"]
            st["beacon_until"][i] = 0.0

    proc = st.get("proc")
    if proc and proc.poll() is not None:
        st["running"] = False
        st["exit_code"] = proc.returncode
        if proc.returncode not in (0, None):
            try:
                st["error"] = open(st["log"]).read().strip().splitlines()[-6:]
            except OSError:
                st["error"] = ["El trainer se cerró con error (ver live_train.log)"]
        close_sockets()
    elif st.get("stop_requested") and now - st["stop_requested"] > 20 and proc:
        proc.terminate()
    for w in bpy.context.window_manager.windows:
        for a in w.screen.areas:
            if a.type == 'VIEW_3D':
                a.tag_redraw()
    return 1 / 30


def close_sockets():
    st = S()
    for key in ("tele_sock", "ctrl_sock"):
        s = st.pop(key, None)
        if s:
            try:
                s.close()
            except OSError:
                pass


# =====================================================================
# HUD
# =====================================================================
def _shader():
    for name in ("UNIFORM_COLOR", "2D_UNIFORM_COLOR"):
        try:
            return gpu.shader.from_builtin(name)
        except (ValueError, TypeError):
            continue
    return None


def draw_rect(sh, x, y, w, h, color):
    b = batch_for_shader(sh, 'TRIS', {"pos": [(x, y), (x + w, y), (x + w, y + h), (x, y), (x + w, y + h), (x, y + h)]})
    sh.bind()
    sh.uniform_float("color", color)
    b.draw(sh)


def draw_line(sh, pts, color):
    if len(pts) < 2:
        return
    b = batch_for_shader(sh, 'LINE_STRIP', {"pos": pts})
    sh.bind()
    sh.uniform_float("color", color)
    b.draw(sh)


def text(x, y, s, size=14, color=(0.95, 0.95, 0.95, 1)):
    blf.size(0, size)
    blf.color(0, *color)
    blf.position(0, x, y, 0)
    blf.draw(0, s)


# =====================================================================
# Red neuronal (vista en vivo del dron observado)
# =====================================================================
NEG, ZERO, POS = (0.25, 0.6, 1.0), (0.32, 0.34, 0.4), (1.0, 0.58, 0.15)


def act_color(v, alpha=1.0):
    v = max(-1.0, min(1.0, v))
    a, b = (ZERO, POS) if v >= 0 else (ZERO, NEG)
    t = abs(v)
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, alpha)


def draw_quads(sh, quads_by_color):
    for color, quads in quads_by_color.items():
        tris = []
        for x, y, r in quads:
            tris += [(x - r, y - r), (x + r, y - r), (x + r, y + r), (x - r, y - r), (x + r, y + r), (x - r, y + r)]
        if tris:
            b = batch_for_shader(sh, 'TRIS', {"pos": tris})
            sh.bind()
            sh.uniform_float("color", color)
            b.draw(sh)


def draw_segments(sh, segs_by_color):
    for color, segs in segs_by_color.items():
        if segs:
            b = batch_for_shader(sh, 'LINES', {"pos": segs})
            sh.bind()
            sh.uniform_float("color", color)
            b.draw(sh)


def draw_network(sh, f, x0, y_bot, width, y_top):
    st = S()
    act, net = st.get("act"), st.get("net_w")
    height = y_top - y_bot
    if not sh or height < 160 * f or width < 420 * f:
        return
    draw_rect(sh, x0, y_bot, width, height, (0.04, 0.05, 0.07, 0.86))
    tx = x0 + 12 * f
    if not act or not net:
        text(tx, y_top - 24 * f, "RED NEURONAL · esperando datos del trainer…", int(13 * f), (0.6, 0.85, 1, 1))
        return
    hello = st.get("hello", {})
    in_labels = hello.get("obs_labels") or [f"in {i}" for i in range(len(act["in"]))]
    out_labels = hello.get("act_labels") or [f"out {i}" for i in range(len(act["mu"]))]
    layers = [act["in"]] + act["h"] + [act["mu"]]
    sizes = [len(v) for v in layers]
    total = sum(sizes[i] * sizes[i + 1] for i in range(len(sizes) - 1))
    shown = sum(len(l) for l in net["l"])

    text(tx, y_top - 22 * f, f"RED NEURONAL del dron #{act['i']} (el de luz celeste)", int(14 * f), (0.6, 0.85, 1, 1))
    text(tx, y_top - 38 * f, f"{shown:,} de {total:,} conexiones (las de más peso) · pesos de la generación "
         f"{net.get('gen', 0)}", int(10 * f), (0.75, 0.78, 0.85, 1))
    text(tx, y_top - 51 * f, "naranja = empuja hacia +   azul = empuja hacia −   más brillante = influye más ahora",
         int(10 * f), (0.75, 0.78, 0.85, 1))

    lab_in, lab_out = 150 * f, 190 * f
    xs = [x0 + lab_in + (width - lab_in - lab_out) * c / (len(sizes) - 1) for c in range(len(sizes))]
    top, bot = y_top - 84 * f, y_bot + 14 * f

    def ny(k, n):
        return top - (k + 0.5) * (top - bot) / n

    titles = ["24 entradas: lo que siente", "capa 1: 128 neuronas", "capa 2: 128 neuronas", "4 salidas: palancas"]
    for c, x in enumerate(xs):
        t = titles[c] if c < len(titles) else f"capa {c}"
        blf.size(0, int(11 * f))
        w = blf.dimensions(0, t)[0]
        text(x - w / 2, y_top - 72 * f, t, int(11 * f), (0.85, 0.87, 0.92, 1))

    # ---- conexiones: brillo = |activación de origen × peso| ----
    buckets = 6
    segs = {}
    for L, edges in enumerate(net["l"][:len(sizes) - 1]):
        src, n_src, n_dst = layers[L], sizes[L], sizes[L + 1]
        contrib = [(i, j, src[i] * w) for i, j, w in edges if i < n_src and j < n_dst]
        if not contrib:
            continue
        norm = max(abs(c) for _, _, c in contrib) or 1e-6
        for i, j, c in contrib:
            m = abs(c) / norm
            if m < 0.15:                     # solo lo que de verdad influye ahora
                continue
            bk = min(buckets, int(m * buckets) + 1)
            base = POS if c > 0 else NEG
            key = (base[0], base[1], base[2], 0.04 + 0.8 * (bk / buckets) ** 2)
            segs.setdefault(key, []).extend([(xs[L], ny(i, n_src)), (xs[L + 1], ny(j, n_dst))])
    draw_segments(sh, segs)

    # ---- neuronas: color = activación ----
    quads = {}
    for c, vals in enumerate(layers):
        n = len(vals)
        spacing = (top - bot) / n
        r = max(1.2 * f, min(7 * f, spacing * 0.36)) if 0 < c < len(layers) - 1 else min(7 * f, spacing * 0.3)
        for k_, v in enumerate(vals):
            col = act_color(v)
            key = tuple(round(x, 1) for x in col)
            quads.setdefault(key, []).append((xs[c], ny(k_, n), r))
    draw_quads(sh, quads)

    # ---- etiquetas de entradas (izquierda) ----
    fs = int(max(8, min(11, (top - bot) / max(sizes[0], 1) / f * 0.75)) * f)
    for k_, v in enumerate(layers[0]):
        s = f"{in_labels[k_] if k_ < len(in_labels) else k_}  {v:+.2f}"
        blf.size(0, fs)
        w = blf.dimensions(0, s)[0]
        text(xs[0] - 10 * f - w, ny(k_, sizes[0]) - fs * 0.35, s, fs, act_color(v * 0.8 + (0.2 if v >= 0 else -0.2)))

    # ---- salidas (derecha): decisión de la red vs lo que hizo (con ruido de exploración) ----
    n_out = sizes[-1]
    for k_, v in enumerate(layers[-1]):
        y = ny(k_, n_out)
        did = act["act"][k_] if k_ < len(act.get("act", [])) else v
        text(xs[-1] + 14 * f, y + 4 * f, f"{out_labels[k_] if k_ < len(out_labels) else k_}  {v:+.2f}",
             int(13 * f), act_color(v * 0.7 + (0.3 if v >= 0 else -0.3)))
        bx, bw = xs[-1] + 14 * f, 120 * f
        draw_rect(sh, bx, y - 10 * f, bw, 5 * f, (1, 1, 1, 0.08))
        draw_rect(sh, bx + bw / 2, y - 10 * f, bw / 2 * max(-1, min(1, did)), 5 * f, (0.85, 0.85, 0.9, 0.7))
    text(xs[-1] + 14 * f, bot - 2 * f, "barra = lo que hizo (con ruido de exploración)", int(9 * f), (0.6, 0.62, 0.7, 1))


def draw_hud():
    st = S()
    if "stats" not in st and not st.get("running") and not st.get("error"):
        return
    if bpy.context.scene.get("es_prueba") or (st.get("scene_name") and bpy.context.scene.name != st["scene_name"]):
        return                                   # en la escena de prueba no se dibuja el HUD del laboratorio
    ctx = bpy.context
    region, area = ctx.region, ctx.area
    f = ctx.preferences.system.ui_scale              # escala de la pantalla (Retina = ~2)
    W, H = region.width, region.height
    left, right = 0, 0
    for r in area.regions:                           # no tapar barra de herramientas ni lateral
        if r.type == 'TOOLS' and r.width > 1:
            left = r.width
        if r.type == 'UI' and r.width > 1:
            right = r.width
    sh = _shader()
    gpu.state.blend_set('ALPHA')
    s = st.get("stats", {})
    p = s.get("params", {})
    phase = s.get("phase", "fly" if st.get("running") else "stopped")
    lines = [
        f"pasos {s.get('steps', 0):,}   episodios {s.get('eps', 0):,}   drones {p.get('drones', '-')}",
        f"éxito {s.get('succ', 0) * 100:5.1f} %    crash {s.get('crash', 0) * 100:5.1f} %    recompensa {s.get('rew', 0):6.1f}",
        f"lr {p.get('lr', 0):.1e}   σ {p.get('sigma', 0):.2f}   entropía {p.get('ent', 0):.3f}   velocidad {p.get('speed', '-')}"
        + ("   [PAUSA]" if p.get("paused") else ""),
    ]
    rw = p.get("reward", {})
    if rw:
        lines.append("recompensa: " + "  ".join(f"{k} {v:g}" for k, v in rw.items()))
    if s.get("msg"):
        lines.append(s["msg"])
    mis = st.get("hello", {}).get("mission")
    if mis:
        lines.insert(0, f"MISIÓN {mis['nombre']}: {mis['exito']}"[:110])
    err = st.get("error", [])

    # ---- panel de texto, abajo a la izquierda ----
    lh = 19 * f
    box_h = (52 + len(lines) * 19 + len(err) * 17) * f
    box_w = 470 * f
    x0, y0 = left + 14 * f, 14 * f
    if sh:
        draw_rect(sh, x0, y0, box_w, box_h, (0.05, 0.06, 0.08, 0.75))
    y = y0 + box_h - 24 * f
    tx = x0 + 12 * f
    text(tx, y, "DRONE LAB", int(17 * f), (0.55, 0.85, 1.0, 1))
    y -= 22 * f
    if phase == "fly":
        text(tx, y, f"VOLANDO · generación {s.get('gen', 0)} · juntando experiencia", int(14 * f), (0.6, 1.0, 0.6, 1))
    elif phase == "learn":
        text(tx, y, f"APRENDIENDO · PPO actualiza la red (generación {s.get('gen', 0)})", int(14 * f), (1.0, 0.85, 0.3, 1))
    else:
        text(tx, y, "DETENIDO", int(14 * f), (0.8, 0.8, 0.8, 1))
    for ln in lines:
        y -= lh
        text(tx, y, ln, int(12 * f), (0.7, 0.85, 1, 1) if ln.startswith("Modelo") else (0.95, 0.95, 0.95, 1))
    for ln in err:
        y -= 17 * f
        text(tx, y, ln[:90], int(11 * f), (1, 0.4, 0.35, 1))

    # ---- curva de progreso, abajo a la derecha ----
    hist = s.get("hist", [])
    cw, ch = 330 * f, 130 * f
    cx, cy = W - right - cw - 26 * f, 26 * f
    if sh:
        draw_rect(sh, cx - 12 * f, cy - 12 * f, cw + 24 * f, ch + 46 * f, (0.05, 0.06, 0.08, 0.75))
        for q in (0.25, 0.5, 0.75, 1.0):
            draw_line(sh, [(cx, cy + ch * q), (cx + cw, cy + ch * q)], (1, 1, 1, 0.1))
        if len(hist) >= 2:
            g0, g1 = hist[0][0], hist[-1][0]
            span = max(g1 - g0, 1)
            px = lambda g: cx + (g - g0) / span * cw
            draw_line(sh, [(px(h[0]), cy + h[3] * ch) for h in hist], (1.0, 0.3, 0.25, 1))
            draw_line(sh, [(px(h[0]), cy + h[2] * ch) for h in hist], (0.3, 1.0, 0.45, 1))
    text(cx, cy + ch + 14 * f, "progreso por generación", int(12 * f), (0.85, 0.85, 0.9, 1))
    text(cx + cw - 105 * f, cy + ch + 14 * f, "éxito", int(12 * f), (0.3, 1.0, 0.45, 1))
    text(cx + cw - 50 * f, cy + ch + 14 * f, "crash", int(12 * f), (1.0, 0.3, 0.25, 1))
    text(cx + 4 * f, cy + ch - 14 * f, "100%", int(10 * f), (0.7, 0.7, 0.75, 1))
    text(cx + 4 * f, cy + 4 * f, "0%", int(10 * f), (0.7, 0.7, 0.75, 1))
    if hist:
        text(cx + cw - 60 * f, cy + 4 * f, f"gen {hist[-1][0]}", int(10 * f), (0.7, 0.7, 0.75, 1))

    # ---- red neuronal, arriba (entre el texto de Blender y los paneles de abajo) ----
    props = getattr(ctx.scene, "drone_lab", None)
    if props and props.show_net and (st.get("act") or st.get("running")):
        net_bot = max(y0 + box_h, cy + ch + 34 * f) + 12 * f
        net_top = H - 105 * f
        avail = W - left - right - 28 * f
        draw_network(sh, f, left + 14 * f, net_bot, max(min(avail, avail * 0.62), min(avail, 640 * f)), net_top)
    gpu.state.blend_set('NONE')


# =====================================================================
# Propiedades y operadores
# =====================================================================
class DroneLabProps(bpy.types.PropertyGroup):
    project: bpy.props.StringProperty(name="Proyecto", subtype='DIR_PATH', default="~/Documents/drone-rl")
    python: bpy.props.StringProperty(name="Python", subtype='FILE_PATH', default="~/Documents/drone-rl/.venv/bin/python")
    drones: bpy.props.IntProperty(name="Drones", default=50, min=1, max=200)
    stage: bpy.props.EnumProperty(name="Nivel", items=STAGE_ITEMS, default="0")
    level_path: bpy.props.StringProperty(name="JSON", subtype='FILE_PATH', default="")
    init_model: bpy.props.StringProperty(name="Continuar desde", subtype='FILE_PATH', default="",
                                         description="Modelo .zip para no empezar de cero (vacío = red nueva al azar)")
    net: bpy.props.IntProperty(name="Neuronas por capa", default=128, min=8, max=512)
    layout: bpy.props.EnumProperty(name="Vista", items=[("GRID", "Cuadrícula", "Cada dron en su carril"),
                                                        ("SWARM", "Enjambre", "Todos en el mismo lugar")], default="GRID")
    drone_scale: bpy.props.FloatProperty(name="Tamaño visual", default=2.0, min=0.5, max=10.0,
                                         description="Solo visual: agranda los drones para verlos de lejos")
    watch: bpy.props.IntProperty(name="Dron observado", default=0, min=0, max=199, update=_on_watch_change,
                                 description="De qué dron se muestra la red neuronal (luz celeste)")
    show_net: bpy.props.BoolProperty(name="Mostrar red neuronal", default=True)
    # ---- en vivo ----
    lr_log: bpy.props.FloatProperty(name="log10(learning rate)", default=math.log10(3e-4), min=-6.0, max=-2.0,
                                    update=_on_live_change, description="-3.5 ≈ 3e-4. Más alto = aprende más rápido pero inestable")
    ent: bpy.props.FloatProperty(name="Exploración (entropía)", default=0.0, min=0.0, max=0.1, precision=3,
                                 update=_on_live_change, description="Premia probar acciones distintas")
    speed: bpy.props.EnumProperty(name="Velocidad", items=[("real", "Tiempo real", ""), ("rapido", "Máxima", "")],
                                  default="real", update=_on_live_change)
    rw_progress: bpy.props.FloatProperty(name="Acercarse (por m)", default=2.0, min=0, max=20, update=_on_live_change)
    rw_goal: bpy.props.FloatProperty(name="Llegar a meta", default=10.0, min=0, max=100, update=_on_live_change)
    rw_crash: bpy.props.FloatProperty(name="Castigo por chocar", default=10.0, min=0, max=100, update=_on_live_change)
    rw_time: bpy.props.FloatProperty(name="Costo por paso", default=0.01, min=0, max=0.5, precision=3, update=_on_live_change)
    rw_smooth: bpy.props.FloatProperty(name="Castigo brusquedad", default=0.05, min=0, max=1, precision=3, update=_on_live_change)
    rw_tilt: bpy.props.FloatProperty(name="Castigo inclinación", default=0.01, min=0, max=1, precision=3, update=_on_live_change)
    rw_near: bpy.props.FloatProperty(name="Premio cerca (hover)", default=0.3, min=0, max=5, update=_on_live_change)
    rw_clearance: bpy.props.FloatProperty(name="Castigo por cercanía", default=0.0, min=0, max=5, update=_on_live_change,
                                          description="Castiga pasar a menos de 1.2 m de un obstáculo: lo siente ANTES de chocar")
    sigma: bpy.props.FloatProperty(name="Exploración σ (ruido)", default=0.4, min=0.02, max=1.0, update=_on_sigma,
                                   description="Cuánto ruido agrega PPO a las palancas para probar cosas nuevas. "
                                               "Muy bajo = repite siempre lo mismo (no aprende a esquivar)")
    # ---- probar el modelo ----
    prueba_fuente: bpy.props.EnumProperty(name="Modelo", items=[
        ("ACTUAL", "El del entrenamiento", "La generación actual (o el último modelo guardado)"),
        ("ARCHIVO", "Un archivo .zip", "Un modelo guardado en models/")], default="ACTUAL")
    prueba_zip: bpy.props.StringProperty(name="Archivo", subtype='FILE_PATH', default="")
    prueba_tipo: bpy.props.EnumProperty(name="Escenario", items=[
        ("IGUAL", "Igual que el entrenamiento", "El mismo tipo de nivel que estás entrenando"),
        ("0", "Hover", ""), ("1", "Meta fija", ""), ("2", "Una meta sin obstáculos", ""),
        ("3", "Una meta con columnas", ""), ("4", "Tres metas con columnas", ""),
        ("5", "Circuito (2 vueltas)", "")], default="IGUAL")


class DRONELAB_OT_start(bpy.types.Operator):
    bl_idname = "dronelab.start"
    bl_label = "Iniciar entrenamiento"
    bl_description = "Crea los drones y lanza el entrenamiento en otro proceso"

    def execute(self, context):
        p = context.scene.drone_lab
        st = S()
        proc = st.get("proc")
        if st.get("running") and proc and proc.poll() is None:
            self.report({'WARNING'}, "Ya está corriendo")
            return {'CANCELLED'}
        close_sockets()                          # por si el anterior terminó y el timer no alcanzó a cerrar
        project = os.path.expanduser(bpy.path.abspath(p.project)).rstrip("/")
        python = os.path.expanduser(bpy.path.abspath(p.python))
        script = os.path.join(project, "scripts", "live_train.py")
        if not os.path.isfile(python):
            self.report({'ERROR'}, f"No encuentro Python en {python}")
            return {'CANCELLED'}
        if not os.path.isfile(script):
            self.report({'ERROR'}, f"No encuentro {script}")
            return {'CANCELLED'}
        stage = 0 if p.stage == "LEVEL" else int(p.stage)

        tele = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        tele.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            tele.setsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF, 4 << 20)
        except OSError:
            pass
        try:
            tele.bind(("127.0.0.1", TELE_PORT))
        except OSError as e:
            self.report({'ERROR'}, f"Puerto {TELE_PORT} ocupado: {e}")
            return {'CANCELLED'}
        tele.setblocking(False)

        lp = live_params(p)
        cmd = [python, "-u", script, "--drones", str(p.drones), "--stage", str(stage),
               "--lr", repr(lp["lr"]), "--ent", repr(lp["ent"]), "--speed", lp["speed"],
               "--net", str(p.net), "--reward", json.dumps(lp["reward"]),
               "--port", str(TELE_PORT), "--ctrl-port", str(CTRL_PORT),
               "--watch", str(min(p.watch, p.drones - 1)), "--log-std", repr(math.log(p.sigma))]
        if p.stage == "LEVEL" and p.level_path:
            cmd += ["--level", os.path.expanduser(bpy.path.abspath(p.level_path))]
        if p.init_model:
            cmd += ["--init", os.path.expanduser(bpy.path.abspath(p.init_model))]
        log = os.path.join(project, "live_train.log")
        proc = subprocess.Popen(cmd, cwd=project, stdout=open(log, "w"), stderr=subprocess.STDOUT,
                                start_new_session=True)
        st.clear()
        if context.scene.get("es_prueba"):               # estabas en la prueba: volver al laboratorio
            context.window.scene = lab_scene()
        st.update(running=True, proc=proc, log=log, tele_sock=tele, scene_name=lab_scene().name,
                  ctrl_sock=socket.socket(socket.AF_INET, socket.SOCK_DGRAM), started=time.time())
        build_scene(p, p.drones, stage)
        # ocultar el dron y la repetición anteriores para que no estorben
        for name in ("Drone_Frame", "Drone_Preview", "Replay_Level"):
            lc = context.view_layer.layer_collection.children.get(name)
            if lc:
                lc.hide_viewport = True
        root = bpy.data.objects.get("Drone_Root")
        if root:
            root.hide_viewport = True
        ns = bpy.app.driver_namespace
        if "hud" not in ns:
            ns["hud"] = bpy.types.SpaceView3D.draw_handler_add(draw_hud, (), 'WINDOW', 'POST_PIXEL')
        old_tick = ns.get("dl_tick")
        if old_tick and bpy.app.timers.is_registered(old_tick):
            bpy.app.timers.unregister(old_tick)
        ns["dl_tick"] = tick
        bpy.app.timers.register(tick, first_interval=0.1)
        bpy.ops.dronelab.frame_view()
        self.report({'INFO'}, f"Entrenando {p.drones} drones (log: live_train.log)")
        return {'FINISHED'}


class DRONELAB_OT_stop(bpy.types.Operator):
    bl_idname = "dronelab.stop"
    bl_label = "Detener y guardar"

    def execute(self, context):
        st = S()
        send_ctrl({"stop": True})
        st["stop_requested"] = time.time()
        return {'FINISHED'}


class DRONELAB_OT_pause(bpy.types.Operator):
    bl_idname = "dronelab.pause"
    bl_label = "Pausa / Seguir"

    def execute(self, context):
        st = S()
        paused = not st.get("stats", {}).get("params", {}).get("paused", False)
        send_ctrl({"pause": paused})
        return {'FINISHED'}


class DRONELAB_OT_save(bpy.types.Operator):
    bl_idname = "dronelab.save"
    bl_label = "Guardar modelo ahora"

    def execute(self, context):
        send_ctrl({"save": True})
        return {'FINISHED'}


class DRONELAB_OT_reset_rewards(bpy.types.Operator):
    bl_idname = "dronelab.reset_rewards"
    bl_label = "Valores por defecto"

    def execute(self, context):
        p = context.scene.drone_lab
        for k in REWARD_KEYS:
            p.property_unset("rw_" + k)
        p.property_unset("lr_log")
        p.property_unset("ent")
        send_ctrl(live_params(p))
        return {'FINISHED'}


class DRONELAB_OT_frame_view(bpy.types.Operator):
    bl_idname = "dronelab.frame_view"
    bl_label = "Encuadrar drones"

    def execute(self, context):
        st = S()
        k = to_bu()
        cell = st.get("cell", 3.0) or 4.0
        size = max(st.get("cols", 1), st.get("rows", 1)) * cell
        for w in context.window_manager.windows:
            for a in w.screen.areas:
                if a.type == 'VIEW_3D':
                    sp = a.spaces.active
                    sp.clip_end = 1e7
                    sp.clip_start = 1
                    sp.shading.type = 'MATERIAL'
                    r3 = sp.region_3d
                    r3.view_location = Vector((0, -size * 0.1, 1.0)) * k
                    r3.view_distance = max(size * 1.15, 8.0) * k
                    r3.view_rotation = Euler((math.radians(55), 0, math.radians(-20))).to_quaternion()
                    r3.view_perspective = 'PERSP'
        return {'FINISHED'}


class DRONELAB_OT_goto_watched(bpy.types.Operator):
    bl_idname = "dronelab.goto_watched"
    bl_label = "Ir al dron observado"

    def execute(self, context):
        st = S()
        drones = st.get("drones", [])
        i = st.get("watch", 0)
        if not drones or i >= len(drones):
            return {'CANCELLED'}
        k = to_bu()
        for a in context.screen.areas:
            if a.type == 'VIEW_3D':
                r3 = a.spaces.active.region_3d
                r3.view_location = drones[i].location.copy()
                r3.view_distance = 7.0 * k
        return {'FINISHED'}


class DRONELAB_OT_probar(bpy.types.Operator):
    bl_idname = "dronelab.probar"
    bl_label = "Probar en escenario aleatorio"
    bl_description = ("Abre una simulación 3D con obstáculos y metas al azar, y el modelo vuela en vivo. "
                      "El entrenamiento sigue corriendo de fondo")

    def execute(self, context):
        p = context.scene.drone_lab
        st = S()
        stage = test_stage(p)
        project, _ = _paths(p)
        proc = st.get("proc")
        try:
            if p.prueba_fuente == "ACTUAL":
                if proc and proc.poll() is None:
                    st["pending_test"] = {"stage": stage}
                    send_ctrl({"export": True})
                    self.report({'INFO'}, "Exportando la generación actual…")
                    return {'FINISHED'}
                zp = (st.get("bye") or {}).get("model") or latest_model(project)
                if not zp:
                    self.report({'ERROR'}, "Todavía no hay modelo: inicia un entrenamiento o elige un archivo .zip")
                    return {'CANCELLED'}
            else:
                zp = os.path.expanduser(bpy.path.abspath(p.prueba_zip))
                if not os.path.isfile(zp):
                    self.report({'ERROR'}, "Elige un archivo .zip de models/")
                    return {'CANCELLED'}
            npz = export_zip(p, zp)
        except Exception as e:
            self.report({'ERROR'}, f"No pude preparar el modelo: {e}")
            return {'CANCELLED'}
        start_test(npz, stage)
        return {'FINISHED'}


class DRONELAB_OT_rebuild_view(bpy.types.Operator):
    bl_idname = "dronelab.rebuild_view"
    bl_label = "Reconstruir vista"
    bl_description = "Vuelve a crear los drones en la escena del laboratorio (el entrenamiento sigue)"

    def execute(self, context):
        context.window.scene = lab_scene()
        rebuild_view()
        ns = bpy.app.driver_namespace
        t = ns.get("dl_tick")
        if not (t and bpy.app.timers.is_registered(t)):
            ns["dl_tick"] = tick
            bpy.app.timers.register(tick, first_interval=0.1)
        bpy.ops.dronelab.frame_view()
        return {'FINISHED'}


class DRONELAB_OT_clear(bpy.types.Operator):
    bl_idname = "dronelab.clear"
    bl_label = "Borrar drones de la escena"

    def execute(self, context):
        if S().get("running"):
            self.report({'WARNING'}, "Detén el entrenamiento primero")
            return {'CANCELLED'}
        clear_col("DroneLab")
        S().pop("stats", None)
        S().pop("error", None)
        return {'FINISHED'}


class VIEW3D_PT_drone_lab(bpy.types.Panel):
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = "Drone Lab"
    bl_label = "Drone Lab"

    def draw(self, context):
        p = context.scene.drone_lab
        st = S()
        running = st.get("running", False)
        L = self.layout

        # ---- misión: qué cuenta como éxito ----
        missions = load_missions(p.project)
        key = "level" if p.stage == "LEVEL" else p.stage
        mis = (st.get("hello", {}).get("mission") if running else None) or missions.get(key)
        width = max(24, int(context.region.width / (7.2 * context.preferences.system.ui_scale)))
        box = L.box()
        if mis:
            box.label(text=f"Misión: {mis['nombre']}  ({mis['tiempo']} s máx.)", icon='TRACKER')
            c = box.column(align=True)
            c.scale_y = 0.8
            for title, field in (("Objetivo", "objetivo"), ("Éxito", "exito"), ("Falla", "falla"), ("Premio", "premio")):
                wrapped(c, f"{title}: {mis[field]}", width)
            c.separator()
            wrapped(c, "Aros: verde = el que toca · celeste = el siguiente · gris = después · "
                       "amarillo = aguantando (hover). Aro más grande = 2ª vuelta.", width)
        else:
            box.label(text="Misión: (no encuentro drone_rl/missions.json)", icon='ERROR')

        box = L.box()
        box.label(text="Red neuronal", icon='NETWORK_DRIVE')
        box.prop(p, "show_net")
        row = box.row(align=True)
        row.prop(p, "watch")
        row.operator("dronelab.goto_watched", text="", icon='VIEWZOOM')

        box = L.box()
        box.label(text="Entrenamiento", icon='EXPERIMENTAL')
        col = box.column()
        col.enabled = not running
        col.prop(p, "drones")
        col.prop(p, "stage")
        if p.stage == "LEVEL":
            col.prop(p, "level_path")
        col.prop(p, "net")
        col.prop(p, "init_model")
        col.prop(p, "layout")
        col.prop(p, "drone_scale")
        row = box.row(align=True)
        row.scale_y = 1.4
        if running:
            row.operator("dronelab.pause", icon='PAUSE')
            row.operator("dronelab.stop", icon='SNAP_FACE')
        else:
            row.operator("dronelab.start", icon='PLAY')
        row = box.row(align=True)
        row.operator("dronelab.save", icon='FILE_TICK')
        row.operator("dronelab.frame_view", icon='ZOOM_ALL')
        if running:
            box.operator("dronelab.rebuild_view", icon='FILE_REFRESH')

        box = L.box()
        box.label(text="Probar el modelo", icon='PLAY')
        box.prop(p, "prueba_fuente", text="")
        if p.prueba_fuente == "ARCHIVO":
            box.prop(p, "prueba_zip")
        box.prop(p, "prueba_tipo")
        if p.prueba_tipo != "IGUAL" and int(p.prueba_tipo) != training_stage(p) and p.prueba_fuente == "ACTUAL":
            box.label(text="Ojo: es distinto a lo que entrenas", icon='ERROR')
        row = box.row()
        row.scale_y = 1.5
        row.operator("dronelab.probar", icon='WORLD')
        if st.get("test_msg"):
            box.label(text=st["test_msg"])

        box = L.box()
        box.label(text="Aprendizaje (cambia en vivo)", icon='DRIVER')
        box.prop(p, "lr_log", slider=True)
        box.label(text=f"learning rate = {10 ** p.lr_log:.1e}")
        box.prop(p, "sigma", slider=True)
        box.prop(p, "ent", slider=True)
        box.prop(p, "speed", expand=True)

        box = L.box()
        box.label(text="Recompensa (cambia en vivo)", icon='SOLO_ON')
        for k in REWARD_KEYS:
            box.prop(p, "rw_" + k)
        box.operator("dronelab.reset_rewards", icon='LOOP_BACK')

        box = L.box()
        box.label(text="Rutas", icon='FILE_FOLDER')
        box.prop(p, "project")
        box.prop(p, "python")
        box.operator("dronelab.clear", icon='TRASH')


CLASSES = [DroneLabProps, DRONELAB_OT_start, DRONELAB_OT_stop, DRONELAB_OT_pause, DRONELAB_OT_save,
           DRONELAB_OT_reset_rewards, DRONELAB_OT_frame_view, DRONELAB_OT_goto_watched, DRONELAB_OT_probar,
           DRONELAB_OT_rebuild_view,
           DRONELAB_OT_clear,
           VIEW3D_PT_drone_lab]


def _shutdown_trainer():
    """Al cerrar Blender: pedir al trainer que guarde y termine (si no, seguiría en segundo plano)."""
    st = S()
    proc = st.get("proc")
    if proc and proc.poll() is None:
        send_ctrl({"stop": True})
        try:
            proc.wait(timeout=8)
        except Exception:
            proc.terminate()


def register():
    import atexit
    atexit.unregister(_shutdown_trainer)
    atexit.register(_shutdown_trainer)
    for c in CLASSES:
        old = getattr(bpy.types, c.__name__, None)
        if old is not None:
            try:
                bpy.utils.unregister_class(old)
            except RuntimeError:
                pass
        bpy.utils.register_class(c)
    bpy.types.Scene.drone_lab = bpy.props.PointerProperty(type=DroneLabProps)
    ns = bpy.app.driver_namespace
    h = ns.pop("hud", None)                  # si se recargó el script, usar el HUD nuevo
    if h:
        try:
            bpy.types.SpaceView3D.draw_handler_remove(h, 'WINDOW')
        except (ValueError, RuntimeError):
            pass
    ns["hud"] = bpy.types.SpaceView3D.draw_handler_add(draw_hud, (), 'WINDOW', 'POST_PIXEL')


def unregister():
    st = S()
    if st.get("running"):
        send_ctrl({"stop": True})
    h = bpy.app.driver_namespace.pop("hud", None)
    if h:
        bpy.types.SpaceView3D.draw_handler_remove(h, 'WINDOW')
    for c in reversed(CLASSES):
        try:
            bpy.utils.unregister_class(c)
        except RuntimeError:
            pass
    del bpy.types.Scene.drone_lab


if __name__ == "__main__":
    register()
