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
    ("LEVEL", "Nivel JSON", "Un nivel exportado desde Blender (todos los drones en el mismo nivel)"),
]
COLORS = {"fly": (0.9, 0.9, 0.95, 1), 1: (1.0, 0.12, 0.08, 1), 2: (0.1, 1.0, 0.35, 1), 3: (1.0, 0.75, 0.1, 1)}
REWARD_KEYS = ["progress", "goal", "crash", "time", "smooth", "tilt", "near"]


def S():
    """Estado de ejecución (sobrevive a recargar el script)."""
    ns = bpy.app.driver_namespace
    if "drone_lab" not in ns:
        ns["drone_lab"] = {"running": False}
    return ns["drone_lab"]


def to_bu():
    return 1.0 / (bpy.context.scene.unit_settings.scale_length or 1.0)


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
        (parent or bpy.context.scene.collection).children.link(c)
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
    bpy.context.scene.collection.children.link(proto)
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
    lc = bpy.context.view_layer.layer_collection.children.get("DL_DroneProto")
    if lc:
        lc.exclude = True                   # oculta la original, las instancias sí se ven
    return proto


def cell_size(stage, n_fixed):
    return {0: 3.0, 1: 9.0}.get(stage, 22.0) if not n_fixed else 22.0


def build_scene(props, n, stage):
    clear_col("DroneLab")
    col = ensure_col("DroneLab")
    proto = build_proto()
    k = to_bu()
    glow = glow_material("DL_Glow")
    ring_me = ring_mesh("DL_Ring", 0.5 * k, 0.03 * k)
    if not ring_me.materials:
        ring_me.materials.append(flat_material("DL_Goal", (0.1, 0.85, 0.35, 1)))
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
    st.update(drones=[], rings=[], beacons=[], flashes=[], obstacles=[[] for _ in range(n)], offsets=[],
              flash_until=[0.0] * n, beacon_until=[0.0] * n, cols=cols, rows=rows, cell=cell)
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
        b.color = COLORS["fly"]
        col.objects.link(b)
        ring = bpy.data.objects.new(f"DL_Goal_{i:03d}", ring_me)
        ring.location = (off + Vector((0, 0, 1.5))) * k
        col.objects.link(ring)
        fl = bpy.data.objects.new(f"DL_Flash_{i:03d}", flash_me)
        fl.hide_viewport = True
        col.objects.link(fl)
        st["drones"].append(e)
        st["beacons"].append(b)
        st["rings"].append(ring)
        st["flashes"].append(fl)


def apply_level(i, msg):
    st = S()
    if i >= len(st.get("drones", [])):
        return
    k = to_bu()
    off = st["offsets"][i]
    pool = st["obstacles"][i]
    shapes = [("box", b) for b in msg.get("boxes", [])] + [("sph", s) for s in msg.get("spheres", [])]
    col = bpy.data.collections["DroneLab"]
    while len(pool) < len(shapes):
        o = bpy.data.objects.new(f"DL_Obs_{i:03d}_{len(pool)}", cube_mesh())
        col.objects.link(o)
        pool.append(o)
    for j, o in enumerate(pool):
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
    st = S()
    if not st.get("running"):
        return None
    sock = st["tele_sock"]
    frame = None
    k = to_bu()
    for _ in range(2000):                    # vaciar todo lo que llegó
        try:
            data, _ = sock.recvfrom(1 << 16)
        except (BlockingIOError, OSError):
            break
        try:
            m = json.loads(data)
        except ValueError:
            continue
        t = m.get("t")
        if t == "f":
            frame = m
            for ev in m.get("ev", []):
                if ev[0] < len(st["drones"]):
                    flash(ev[0], ev[1], ev[2:5])
        elif t == "l":
            apply_level(m["i"], m)
        elif t == "s":
            st["stats"] = m
        elif t == "h":
            st["hello"] = m
        elif t == "bye":
            st["bye"] = m
    if frame:
        for i, d in enumerate(frame["d"][:len(st["drones"])]):
            off = st["offsets"][i]
            st["drones"][i].location = (off + Vector(d[0:3])) * k
            st["drones"][i].rotation_euler = d[3:6]
            st["rings"][i].location = (off + Vector(d[6:9])) * k
    now = time.time()
    for i, until in enumerate(st["flash_until"]):
        if until and now > until:
            st["flashes"][i].hide_viewport = True
            st["flash_until"][i] = 0.0
    for i, until in enumerate(st["beacon_until"]):
        if until and now > until:
            st["beacons"][i].color = COLORS["fly"]
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


def draw_hud():
    st = S()
    if "stats" not in st and not st.get("running") and not st.get("error"):
        return
    region = bpy.context.region
    W, H = region.width, region.height
    sh = _shader()
    gpu.state.blend_set('ALPHA')
    x0, y = 20, H - 40
    s = st.get("stats", {})
    phase = s.get("phase", "fly" if st.get("running") else "stopped")
    if sh:
        draw_rect(sh, 10, H - 238, 430, 228, (0.05, 0.06, 0.08, 0.72))
    text(x0, y, "DRONE LAB", 18, (0.55, 0.85, 1.0, 1))
    y -= 26
    if phase == "fly":
        text(x0, y, f"VOLANDO · generación {s.get('gen', 0)} · juntando experiencia", 14, (0.6, 1.0, 0.6, 1))
    elif phase == "learn":
        text(x0, y, f"APRENDIENDO · PPO actualiza la red (gen {s.get('gen', 0)})", 14, (1.0, 0.85, 0.3, 1))
    else:
        text(x0, y, "DETENIDO", 14, (0.8, 0.8, 0.8, 1))
    p = s.get("params", {})
    lines = [
        f"pasos {s.get('steps', 0):,}   episodios {s.get('eps', 0):,}   drones {p.get('drones', '-')}",
        f"éxito {s.get('succ', 0) * 100:5.1f} %    crash {s.get('crash', 0) * 100:5.1f} %    recompensa {s.get('rew', 0):6.1f}",
        f"lr {p.get('lr', 0):.1e}   exploración {p.get('ent', 0):.3f}   velocidad {p.get('speed', '-')}"
        + ("   [PAUSA]" if p.get("paused") else ""),
    ]
    rw = p.get("reward", {})
    if rw:
        lines.append("recompensa: " + "  ".join(f"{k} {v:g}" for k, v in rw.items()))
    for ln in lines:
        y -= 21
        text(x0, y, ln, 13)
    if s.get("msg"):
        y -= 21
        text(x0, y, s["msg"], 12, (0.7, 0.85, 1, 1))
    for ln in st.get("error", []):
        y -= 18
        text(x0, y, ln[:90], 12, (1, 0.4, 0.35, 1))

    # curva de progreso: éxito (verde) y crash (rojo) por generación
    hist = s.get("hist", [])
    cw, ch = 360, 150
    cx, cy = W - cw - 30, 30
    if sh:
        draw_rect(sh, cx - 10, cy - 10, cw + 20, ch + 44, (0.05, 0.06, 0.08, 0.72))
        for q in (0.25, 0.5, 0.75, 1.0):
            draw_line(sh, [(cx, cy + ch * q), (cx + cw, cy + ch * q)], (1, 1, 1, 0.08))
        if len(hist) >= 2:
            g0, g1 = hist[0][0], hist[-1][0]
            span = max(g1 - g0, 1)
            px = lambda g: cx + (g - g0) / span * cw
            draw_line(sh, [(px(h[0]), cy + h[3] * ch) for h in hist], (1.0, 0.3, 0.25, 1))
            draw_line(sh, [(px(h[0]), cy + h[2] * ch) for h in hist], (0.3, 1.0, 0.45, 1))
    text(cx, cy + ch + 14, "progreso por generación", 12, (0.85, 0.85, 0.9, 1))
    text(cx + cw - 110, cy + ch + 14, "éxito", 12, (0.3, 1.0, 0.45, 1))
    text(cx + cw - 55, cy + ch + 14, "crash", 12, (1.0, 0.3, 0.25, 1))
    text(cx - 4, cy + ch - 6, "100%", 10, (0.7, 0.7, 0.75, 1))
    text(cx - 4, cy + 2, "0%", 10, (0.7, 0.7, 0.75, 1))
    if hist:
        text(cx + cw - 50, cy + 2, f"gen {hist[-1][0]}", 10, (0.7, 0.7, 0.75, 1))
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


class DRONELAB_OT_start(bpy.types.Operator):
    bl_idname = "dronelab.start"
    bl_label = "Iniciar entrenamiento"
    bl_description = "Crea los drones y lanza el entrenamiento en otro proceso"

    def execute(self, context):
        p = context.scene.drone_lab
        st = S()
        if st.get("running"):
            self.report({'WARNING'}, "Ya está corriendo")
            return {'CANCELLED'}
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
               "--port", str(TELE_PORT), "--ctrl-port", str(CTRL_PORT)]
        if p.stage == "LEVEL" and p.level_path:
            cmd += ["--level", os.path.expanduser(bpy.path.abspath(p.level_path))]
        if p.init_model:
            cmd += ["--init", os.path.expanduser(bpy.path.abspath(p.init_model))]
        log = os.path.join(project, "live_train.log")
        proc = subprocess.Popen(cmd, cwd=project, stdout=open(log, "w"), stderr=subprocess.STDOUT,
                                start_new_session=True)
        st.clear()
        st.update(running=True, proc=proc, log=log, tele_sock=tele,
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

        box = L.box()
        box.label(text="Aprendizaje (cambia en vivo)", icon='DRIVER')
        box.prop(p, "lr_log", slider=True)
        box.label(text=f"learning rate = {10 ** p.lr_log:.1e}")
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
           DRONELAB_OT_reset_rewards, DRONELAB_OT_frame_view, DRONELAB_OT_clear, VIEW3D_PT_drone_lab]


def register():
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
