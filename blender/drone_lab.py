"""
DRONE LAB: entrena N drones y míralos aprender en vivo dentro de Blender.

Instalar: abrir este archivo en el Text Editor y Alt+P (o Edit > Preferences > Add-ons > Install).
Usar:     viewport 3D > barra lateral (tecla N) > pestaña "Drone Lab" > Iniciar.

UN SOLO MODELO: todo se entrena en models/modelo.zip (se continúa siempre; "Empezar de cero" lo
archiva y crea uno nuevo) y todas las pruebas 3D vuelan con ese mismo modelo.

Blender es solo el visor. El entrenamiento corre en otro proceso (scripts/live_train.py)
con el Python del proyecto (.venv), y se hablan por UDP en localhost:
    trainer -> Blender :9011  (posiciones, niveles, estadísticas)
    Blender -> trainer :9012  (parámetros nuevos, pausa, guardar, detener)
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

# Dron Maker (drone-rl usa 9001/9002: pueden correr los dos). DRONMAKER_LAB_PORTS="9021,9022" los cambia (pruebas).
TELE_PORT, CTRL_PORT = (int(x) for x in os.environ.get("DRONMAKER_LAB_PORTS", "9011,9012").split(","))
STAGE_ITEMS = [
    ("0", "Hover", "Despegar y quedarse quieto a 1.5 m"),
    ("1", "Meta fija", "Ir a (5, 0, 2)"),
    ("2", "Metas aleatorias", "Meta aleatoria a 3-8 m"),
    ("3", "Columnas", "Meta aleatoria con columnas en el camino"),
    ("4", "Varias metas", "3 metas seguidas con columnas"),
    ("5", "Circuito (2 vueltas)", "4 aros en orden, dos vueltas: cada aro se pasa 2 veces"),
    ("6", "Bosque", "Cruzar un bosque (troncos, árboles jóvenes, arbustos) hasta un aro a 9-14 m"),
    ("7", "Bosque: 3 aros", "Slalom de 3 aros en orden dentro del bosque"),
    ("8", "Caza: pájaros", "Pájaros que vuelan solos y huyen: cazarlos a todos (tocarlos)"),
    ("9", "Caza entre columnas", "Cazar los pájaros en un área llena de columnas (ellos las esquivan)"),
    ("10", "Caza en el bosque", "Cazar los pájaros debajo de las copas, entre troncos y arbustos"),
    ("11", "Grabar: tomas con ruta", "Fija, órbita o revelar: llegar al inicio de la ruta y seguir el punto de cámara sin perder el encuadre de la casa"),
    ("12", "Grabar entre postes", "Lo mismo que Grabar, con postes / sombrillas a 1,5 m de la ruta: usar los sensores"),
    ("LEVEL", "Nivel JSON", "Un nivel exportado desde Blender (todos los drones en el mismo nivel)"),
]
STAGE_NAMES = {"hover": "Hover", "goal_fixed": "Meta fija", "goal_random": "Metas", "obstacles": "Columnas",
               "multi_goal": "Varias metas", "circuit": "Circuito", "forest": "Bosque", "forest_multi": "Bosque 3 aros", "hunt": "Caza",
               "hunt_columns": "Caza columnas", "hunt_forest": "Caza bosque", "film_fixed": "Grabar", "film_posts": "Grabar entre postes"}
COLORS = {"fly": (0.9, 0.9, 0.95, 1), 1: (1.0, 0.12, 0.08, 1), 2: (0.1, 1.0, 0.35, 1), 3: (1.0, 0.75, 0.1, 1)}
REWARD_KEYS = ["progress", "goal", "crash", "time", "smooth", "tilt", "near", "clearance", "danger", "speed",
               "stability", "heading", "film"]


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


_DRON_ITEMS = []        # Blender necesita que la lista siga viva mientras el menú existe


def dron_items(self, context):
    """Menú Dron: el de siempre, física al azar, o un dron armado en el juego (drones/*.json)."""
    global _DRON_ITEMS
    items = [("ESTANDAR", "Estándar (0,6 kg, empuje/peso 2,5)", "El dron con el que se entrenó todo hasta ahora"),
             ("AZAR", "Al azar (los del juego)", "Un dron distinto en cada intento (drones/rango_juego.json): "
              "la red aprende a volar cualquier dron que el jugador pueda armar")]
    try:
        project = os.path.expanduser(bpy.path.abspath(self.project)).rstrip("/")
        folder = os.path.join(project, "drones")
        for f in sorted(os.listdir(folder)):
            if not f.endswith(".json") or f == "rango_juego.json":
                continue
            name = f[:-5]
            try:
                with open(os.path.join(folder, f), encoding="utf-8") as fh:
                    d = json.load(fh)
                fis = d["fisica"]
                label = f"{d.get('nombre', name).capitalize()} ({fis['mass'] * 1000:.0f} g, empuje/peso {fis['twr']:.2f})"
            except (OSError, ValueError, KeyError):
                label = name
            items.append((name, label, f"drones/{f}: un dron armado en el juego (node app/exportar_dron.mjs)"))
    except OSError:
        pass
    _DRON_ITEMS = items
    return items


def live_params(props):
    return {"lr": 10 ** props.lr_log, "ent": props.ent, "speed": props.speed,
            "reward": {k: getattr(props, "rw_" + k) for k in REWARD_KEYS}}


def _on_live_change(self, context):
    send_ctrl(live_params(self))


def _on_sigma(self, context):
    send_ctrl({"log_std": math.log(self.sigma)})


def _on_env_change(self, context):
    send_ctrl({"env": {"density": self.densidad, "wind": self.viento,
                       "bird_speed": self.pajaros_vel, "n_birds": self.pajaros}})


# =====================================================================
# Probar el modelo en un escenario aleatorio 3D (escena "Prueba IA")
# =====================================================================
def _paths(props):
    project = os.path.expanduser(bpy.path.abspath(props.project)).rstrip("/")
    python = os.path.expanduser(bpy.path.abspath(props.python))
    return project, python


def model_files(project):
    """El modelo único: (zip de PyTorch, npz para Blender, json con su historia)."""
    m = os.path.join(project, "models")
    return os.path.join(m, "modelo.zip"), os.path.join(m, "modelo.npz"), os.path.join(m, "modelo.json")


def model_info(project):
    """Resumen de models/modelo.json (pasos, generaciones, niveles), con caché."""
    _, _, js = model_files(project)
    st = S()
    try:
        mt = os.path.getmtime(js)
    except OSError:
        return None
    if st.get("model_info_mtime") != mt:
        try:
            st["model_info"] = json.load(open(js, encoding="utf-8"))
            st["model_info_mtime"] = mt
        except (OSError, ValueError):
            return st.get("model_info")
    return st.get("model_info")


def fresh_npz(props):
    """models/modelo.npz al día con models/modelo.zip (lo re-exporta si el zip es más nuevo)."""
    project, _ = _paths(props)
    zp, npz, _ = model_files(project)
    if not os.path.isfile(zp):
        raise RuntimeError("Todavía no hay modelo: dale Iniciar entrenamiento primero")
    if not os.path.isfile(npz) or os.path.getmtime(npz) < os.path.getmtime(zp):
        export_zip(props, zp, npz)
    return npz


def _reload_project_modules():
    """Blender guarda los módulos importados: si el código cambió, hay que recargarlos (en orden),
    si no, la prueba usa la versión VIEJA (ej. sin el bosque) y falla sin decir nada."""
    import importlib
    for name in ("drone_rl.physics", "drone_rl.sensing", "drone_rl.controller", "drone_rl.level",
                 "drone_rl.birds", "drone_rl.runtime", "escena_lib", "bosque"):
        if name in sys.modules:
            importlib.reload(sys.modules[name])


def _load_test_modules(project):
    import importlib
    bdir = os.path.join(project, "blender")
    for p in (bdir, project):
        if p not in sys.path:
            sys.path.insert(0, p)
    _reload_project_modules()
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
    """Arma un escenario aleatorio nuevo y pone a volar el modelo. Si algo falla, lo DICE
    (en el panel y en el HUD) en vez de no hacer nada."""
    st = S()
    st.pop("pending_test", None)
    try:
        win = bpy.context.window_manager.windows[0]
        lab = lab_scene()                       # nunca la escena de prueba (tiene sus propios ajustes)
        p = lab.drone_lab
        project, _ = _paths(p)
        with bpy.context.temp_override(window=win, screen=win.screen):
            pa = _load_test_modules(project)
            info = pa.build(stage=stage, model_npz=npz, return_scene=lab.name, density=p.densidad, wind=p.viento)
            pa.fly(bpy.context)
        gen = (model_info(project) or {}).get("generaciones", "?")
        pi = bpy.app.driver_namespace.get("piloto_ia")
        if pi is not None and pi.get("tally_gen") != gen:      # marcador nuevo para cada generación probada
            pi["tally"] = {"llegó": 0, "chocó": 0, "tiempo": 0}
            pi["tally_gen"] = gen
        st["test_msg"] = (f"{TEST_NAMES.get(stage, stage)} #{info['seed']} · modelo gen {gen} · "
                          f"{len(info['obstaculos'])} obstáculos")
    except Exception as e:
        import traceback
        traceback.print_exc()
        st["test_msg"] = f"ERROR al armar la prueba: {e!r}"[:160]
    return None


TEST_NAMES = {0: "Hover", 1: "Meta fija", 2: "Una meta", 3: "Columnas", 4: "Varias metas",
              5: "Circuito", 6: "Bosque", 7: "Bosque 3 aros", 8: "Caza", 9: "Caza col.", 10: "Caza bosque",
              11: "Grabar"}


def training_stage(props):
    params = (S().get("stats") or {}).get("params") or {}
    if "stage" in params:
        return int(params["stage"])
    return 3 if props.stage == "LEVEL" else int(props.stage)


def test_stage(props):
    return training_stage(props) if props.prueba_tipo == "IGUAL" else int(props.prueba_tipo)


def export_zip(props, zp, npz):
    project, python = _paths(props)
    r = subprocess.run([python, os.path.join(project, "scripts", "export_policy.py"), zp, "--out", npz],
                       cwd=project, capture_output=True, text=True, timeout=180)
    if r.returncode != 0:
        raise RuntimeError((r.stderr or r.stdout).strip().splitlines()[-1])
    return npz


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


def alpha_material(name, emission=1.5):
    """Como glow_material, pero transparente: color Y transparencia salen del objeto (o.color = (r, g, b, a))."""
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
    if "Alpha" in oi.outputs:
        nt.links.new(oi.outputs["Alpha"], bsdf.inputs["Alpha"])
    else:
        bsdf.inputs["Alpha"].default_value = 0.3
    bsdf.inputs["Emission Strength"].default_value = emission
    if hasattr(m, "surface_render_method"):          # EEVEE de Blender 4.2+
        m.surface_render_method = 'BLENDED'
    elif hasattr(m, "blend_method"):
        m.blend_method = 'BLEND'
    m.use_backface_culling = False
    m.diffuse_color = (1, 1, 1, 0.3)
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


def bird_mesh(name, k):
    """Pájaro simple (cuerpo + 2 alas), ~0.6 m de ala a ala, mirando a +X."""
    me = bpy.data.meshes.get(name)
    if me:
        return me
    s = k
    v = [(0.16 * s, 0, 0), (-0.14 * s, 0, 0), (0, 0.035 * s, 0.03 * s), (0, -0.035 * s, 0.03 * s), (0, 0, -0.04 * s),
         (0.05 * s, 0.02 * s, 0.02 * s), (-0.03 * s, 0.30 * s, 0.07 * s), (-0.08 * s, 0.02 * s, 0.02 * s),
         (0.05 * s, -0.02 * s, 0.02 * s), (-0.03 * s, -0.30 * s, 0.07 * s), (-0.08 * s, -0.02 * s, 0.02 * s),
         (-0.14 * s, 0, 0.01 * s), (-0.22 * s, 0.06 * s, 0.02 * s), (-0.22 * s, -0.06 * s, 0.02 * s)]
    f = [(0, 2, 4), (0, 4, 3), (0, 3, 2), (1, 4, 2), (1, 3, 4), (1, 2, 3),       # cuerpo
         (5, 6, 7), (8, 10, 9), (11, 12, 13)]                                      # alas y cola
    me = bpy.data.meshes.new(name)
    me.from_pydata(v, [], f)
    me.materials.append(glow_material("DL_Glow"))
    return me


# ---------------- grabar (nivel 11): casa, zona del cliente y cono de la cámara ----------------
CAM_H, CAM_V, CAM_TILT = 80.0, 50.0, 15.0     # la cámara del dron (igual que sensing.py): 80° x 50°, 15° abajo
ZONE_COL, ZONE_EDGE = (0.2, 0.7, 1.0, 0.16), (0.35, 0.85, 1.0, 0.9)
ZONE_OK = (0.15, 1.0, 0.4, 0.45)              # la zona se pone verde un momento al lograr la toma


def q_color(q, alpha):
    """Calidad de imagen 0-1 -> rojo (mala) · amarillo (0.5) · verde (buena)."""
    q = max(0.0, min(1.0, q))
    if q < 0.5:
        return (1.0, 0.15 + 1.5 * q, 0.1, alpha)
    return (1.0 - 1.8 * (q - 0.5), 0.9 + 0.2 * (q - 0.5), 0.15, alpha)


def _mesh(name, verts, faces, mats=None, me=None):
    """Crea (o rehace en el lugar) una malla con caras y material por cara."""
    me = me or bpy.data.meshes.new(name)
    me.clear_geometry()
    me.from_pydata(verts, [], faces)
    if mats is not None:
        me.polygons.foreach_set("material_index", mats)
    me.update()
    return me


def house_geometry(cx, cy, w, d, wall_h, k):
    """La casa del nivel 11 como CASA: paredes, techo de dos aguas (cumbrera a lo largo de x, con alero),
    hastiales, puerta y ventanas. Mismas medidas que level.house_boxes (la física usa esas 3 cajas).
    Materiales: 0 pared, 1 techo, 2 puerta, 3 ventana."""
    eave, rh = 0.3, 0.35 * d
    V, F, M = [], [], []

    def poly(pts, mat):
        i = len(V)
        V.extend(pts)
        F.append(tuple(range(i, i + len(pts))))
        M.append(mat)

    x0, x1, y0, y1, z1 = cx - w / 2, cx + w / 2, cy - d / 2, cy + d / 2, wall_h
    zr = z1 + rh                                       # cumbrera
    poly([(x0, y0, 0), (x1, y0, 0), (x1, y0, z1), (x0, y0, z1)], 0)          # paredes
    poly([(x1, y1, 0), (x0, y1, 0), (x0, y1, z1), (x1, y1, z1)], 0)
    poly([(x0, y1, 0), (x0, y0, 0), (x0, y0, z1), (x0, y1, z1)], 0)
    poly([(x1, y0, 0), (x1, y1, 0), (x1, y1, z1), (x1, y0, z1)], 0)
    poly([(x0, y0, z1), (x0, y1, z1), (x0, cy, zr)], 0)                       # hastiales
    poly([(x1, y1, z1), (x1, y0, z1), (x1, cy, zr)], 0)
    ze = z1 - rh * eave / (d / 2)                      # el alero sigue la pendiente del techo
    ex0, ex1 = x0 - eave, x1 + eave
    poly([(ex0, y0 - eave, ze), (ex1, y0 - eave, ze), (ex1, cy, zr), (ex0, cy, zr)], 1)   # faldones
    poly([(ex1, y1 + eave, ze), (ex0, y1 + eave, ze), (ex0, cy, zr), (ex1, cy, zr)], 1)
    hd = min(2.0, z1 - 0.35)                           # puerta al frente (lado y0)
    poly([(cx - 0.45, y0 - 0.02, 0), (cx + 0.45, y0 - 0.02, 0), (cx + 0.45, y0 - 0.02, hd), (cx - 0.45, y0 - 0.02, hd)], 2)
    zw0, zw1 = 1.0, min(2.0, z1 - 0.3)                 # ventanas: dos al frente, dos atrás
    for xw in (cx - w / 4 - 0.2, cx + w / 4 + 0.2):
        for y, s in ((y0 - 0.02, 1), (y1 + 0.02, -1)):
            a, b = xw - 0.5 * s, xw + 0.5 * s
            poly([(a, y, zw0), (b, y, zw0), (b, y, zw1), (a, y, zw1)], 3)
    return [(x * k, y * k, z * k) for x, y, z in V], F, M


def _ring(r0, r1, z, seg, V, F):
    """Anillo plano horizontal (de radio r0 a r1) a la altura z, centrado en el origen."""
    i = len(V)
    for j in range(seg):
        a = 2 * math.pi * j / seg
        V.append((r0 * math.cos(a), r0 * math.sin(a), z))
        V.append((r1 * math.cos(a), r1 * math.sin(a), z))
    for j in range(seg):
        a, b = i + 2 * j, i + 2 * ((j + 1) % seg)
        F.append((a, b, b + 1, a + 1))


def zone_geometry(band, k, seg=72):
    """Zona del cliente alrededor del sujeto (origen): (relleno del piso, bordes).
    Relleno = anillo en el piso entre d_min y d_max. Bordes = esos dos círculos + la ventana de altura
    (dos aros a z_min y z_max, al medio de la zona)."""
    d0, d1, z0, z1 = band
    Vf, Ff = [], []
    _ring(d0, d1, 0.03, seg, Vf, Ff)
    Ve, Fe = [], []
    _ring(d0 - 0.06, d0 + 0.06, 0.05, seg, Ve, Fe)
    _ring(d1 - 0.06, d1 + 0.06, 0.05, seg, Ve, Fe)
    dm = (d0 + d1) / 2
    _ring(dm - 0.05, dm + 0.05, z0, seg, Ve, Fe)
    _ring(dm - 0.05, dm + 0.05, z1, seg, Ve, Fe)
    sc = lambda V: [(x * k, y * k, z * k) for x, y, z in V]
    return (sc(Vf), Ff), (sc(Ve), Fe)


def path_geometry(pts, k, w=0.06):
    """La ruta de la toma: una cinta delgada por los puntos (más un palito al piso en el inicio)."""
    V, F = [], []
    for j in range(len(pts) - 1):
        (x0, y0, z0), (x1, y1, z1) = pts[j], pts[j + 1]
        dx, dy = x1 - x0, y1 - y0
        L = math.hypot(dx, dy) or 1.0
        nx, ny = -dy / L * w, dx / L * w
        i = len(V)
        V += [(x0 - nx, y0 - ny, z0), (x0 + nx, y0 + ny, z0), (x1 + nx, y1 + ny, z1), (x1 - nx, y1 - ny, z1),
              (x0, y0, z0 - w), (x0, y0, z0 + w), (x1, y1, z1 + w), (x1, y1, z1 - w)]
        F += [(i, i + 1, i + 2, i + 3), (i + 4, i + 5, i + 6, i + 7)]
    if pts:
        Vs, Fs = stem_geometry(tuple(pts[0]), 1.0, w * 0.7)
        i = len(V)
        V += Vs
        F += [tuple(i + a for a in f) for f in Fs]
    return [(a * k, b * k, c * k) for a, b, c in V], F


def stem_geometry(p, k, w=0.05):
    """Palito del punto de cámara al piso (para ver a qué altura está)."""
    x, y, z = p
    V = [(x + sx * w, y + sy * w, zz) for zz in (0.0, z) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    F = [(0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    return [(a * k, b * k, c * k) for a, b, c in V], F


def cone_meshes(k):
    """El cono de la cámara (1 m de largo; se escala hasta la casa): caras transparentes + marco del cuadro."""
    me = bpy.data.meshes.get("DL_Cono")
    fr = bpy.data.meshes.get("DL_ConoMarco")
    if me and fr:
        return me, fr
    hy, hz = math.tan(math.radians(CAM_H / 2)), math.tan(math.radians(CAM_V / 2))
    c = [(1.0, -hy, -hz), (1.0, hy, -hz), (1.0, hy, hz), (1.0, -hy, hz)]
    V = [(0.0, 0.0, 0.0)] + c
    F = [(0, 1, 2), (0, 2, 3), (0, 3, 4), (0, 4, 1)]
    me = _mesh("DL_Cono", [(x * k, y * k, z * k) for x, y, z in V], F)
    me.materials.append(alpha_material("DL_Alpha"))
    t = 0.012                                          # marco: 4 tiras finas en el plano del fondo
    Vr, Fr = [], []
    for j in range(4):
        a, b = c[j], c[(j + 1) % 4]
        ia, ib = (a[0], a[1] * (1 - t * 2), a[2] * (1 - t * 3)), (b[0], b[1] * (1 - t * 2), b[2] * (1 - t * 3))
        i = len(Vr)
        Vr += [a, b, ib, ia]
        Fr.append((i, i + 1, i + 2, i + 3))
    fr = _mesh("DL_ConoMarco", [(x * k, y * k, z * k) for x, y, z in Vr], Fr)
    fr.materials.append(alpha_material("DL_Alpha"))
    return me, fr


def film_objects(i):
    """Los objetos de grabar del dron i (se crean la primera vez): casa, zona, bordes, palito y cono."""
    st = S()
    fo = st.setdefault("film", {})
    if i in fo:
        return fo[i]
    k = to_bu()
    col = bpy.data.collections["DroneLab"]
    house_mats = [flat_material("DL_Casa_Pared", (0.93, 0.86, 0.72, 1)), flat_material("DL_Casa_Techo", (0.62, 0.2, 0.12, 1)),
                  flat_material("DL_Casa_Puerta", (0.32, 0.19, 0.1, 1)), flat_material("DL_Casa_Ventana", (0.5, 0.75, 0.98, 1))]

    def obj(name, me, color=None):
        o = bpy.data.objects.new(name, me)
        col.objects.link(o)
        if color:
            o.color = color
        return o

    def mesh(name, mats):
        me = bpy.data.meshes.get(name) or bpy.data.meshes.new(name)
        if len(me.materials) != len(mats):
            me.materials.clear()
            for m in mats:
                me.materials.append(m)
        return me

    h_me = mesh(f"DL_Casa_{i:03d}", house_mats)
    z_me = mesh(f"DL_Zona_{i:03d}", [alpha_material("DL_Alpha")])
    e_me = mesh(f"DL_ZonaBorde_{i:03d}", [alpha_material("DL_Alpha")])
    s_me = mesh(f"DL_Palito_{i:03d}", [alpha_material("DL_Alpha")])
    cone_me, frame_me = cone_meshes(k)
    drone = st["drones"][i]
    cone, frame = obj(f"DL_Cono_{i:03d}", cone_me, q_color(0, 0.18)), obj(f"DL_ConoMarco_{i:03d}", frame_me, q_color(0, 0.95))
    for c in (cone, frame):                            # la cámara va en la nariz, 15° hacia abajo
        c.parent = drone
        c.rotation_mode = 'XYZ'
        c.rotation_euler = (0.0, math.radians(CAM_TILT), 0.0)
        c.hide_viewport = True                         # aparecen con la primera calidad que llegue
    fo[i] = {"house": obj(f"DL_Casa_{i:03d}", h_me), "zone": obj(f"DL_Zona_{i:03d}", z_me, ZONE_COL),
             "edge": obj(f"DL_ZonaBorde_{i:03d}", e_me, ZONE_EDGE), "stem": obj(f"DL_Palito_{i:03d}", s_me, ZONE_EDGE),
             "cone": cone, "frame": frame, "subject": None, "q": -1.0, "fg": -1.0, "scale": -1.0, "until": 0.0}
    return fo[i]


def apply_film(i, msg, goals):
    """Grabar: rehace la casa, la zona y el palito del dron i para su nivel nuevo."""
    f = msg["film"]
    st = S()
    k = to_bu()
    off = st["offsets"][i]
    o = film_objects(i)
    cx, cy, w, d, wall_h = f["house"]
    V, F, M = house_geometry(cx, cy, w, d, wall_h, k)
    _mesh("", V, F, M, me=o["house"].data)
    o["house"].location = off * k
    subj = Vector(f["subject"])
    (Vf, Ff), (Ve, Fe) = zone_geometry(f["band"], k)
    _mesh("", Vf, Ff, me=o["zone"].data)
    _mesh("", Ve, Fe, me=o["edge"].data)
    for key in ("zone", "edge"):
        o[key].location = (off + Vector((subj.x, subj.y, 0.0))) * k
    o["zone"].color = ZONE_COL
    o["until"] = 0.0
    if f.get("path"):                                  # la ruta de la toma (fija: un punto; órbita: un arco…)
        Vs, Fs = path_geometry([tuple(q) for q in f["path"]], k)
        _mesh("", Vs, Fs, me=o["stem"].data)
        o["stem"].location = off * k
    elif goals:
        Vs, Fs = stem_geometry(tuple(goals[0]), k)
        _mesh("", Vs, Fs, me=o["stem"].data)
        o["stem"].location = off * k
    o["subject"] = subj
    o["q"] = o["fg"] = -1.0


def update_film(i, q, fg, cp=None):
    """Cada frame: el cono se pinta según la calidad de imagen (rojo -> amarillo -> verde) y llega hasta
    la casa; el aro del punto de cámara se va llenando de verde mientras junta los 6 s de la toma."""
    st = S()
    o = (st.get("film") or {}).get(i)
    if not o or o["subject"] is None:
        return
    drone = st["drones"][i]
    if abs(q - o["q"]) > 0.03:
        o["q"] = q
        o["cone"].color = q_color(q, 0.12 + 0.18 * q)
        o["frame"].color = q_color(q, 0.95)
        if o["cone"].hide_viewport:
            o["cone"].hide_viewport = o["frame"].hide_viewport = False
    k = to_bu()
    off = st["offsets"][i]
    dist = ((drone.location / k) - off - o["subject"]).length
    s = max(1.5, min(dist, 25.0)) / max(drone.scale[0], 1e-6)
    if abs(s - o["scale"]) > 0.03 * s:
        o["scale"] = s
        o["cone"].scale = o["frame"].scale = (s, s, s)
    if cp is not None:                                 # el punto de cámara avanza por la ruta: el aro va con él
        for ring in st["rings"][i][:1]:
            ring.location = (off + Vector(cp)) * k
    if abs(fg - o["fg"]) > 0.02:
        o["fg"] = fg
        for ring in st["rings"][i][:1]:
            ring.color = tuple(a + (b - a) * fg for a, b in zip(RING_NEXT, RING_CUR))


def unit_cyl_mesh():
    """Tronco: cilindro de radio 1 y alto 1 con la base en el origen (se escala por objeto)."""
    me = bpy.data.meshes.get("DL_Cyl")
    if me:
        return me
    n = 12
    v = [(math.cos(2 * math.pi * i / n), math.sin(2 * math.pi * i / n), z) for z in (0, 1) for i in range(n)]
    f = [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)] + [tuple(range(n))[::-1], tuple(range(n, 2 * n))]
    me = bpy.data.meshes.new("DL_Cyl")
    me.from_pydata(v, [], f)
    me.materials.append(flat_material("DL_Tronco", (0.32, 0.2, 0.1, 1)))
    return me


def unit_sphere_mesh():
    """Copa, arbusto o roca: esfera de radio 1."""
    me = bpy.data.meshes.get("DL_Esfera")
    if me:
        return me
    import bmesh
    me = bpy.data.meshes.new("DL_Esfera")
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1.0)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(flat_material("DL_Copa", (0.12, 0.42, 0.12, 1)))
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
    return {0: 3.0, 1: 9.0, 5: 12.0, 6: 32.0, 7: 46.0, 8: 30.0, 9: 30.0, 10: 30.0, 11: 50.0, 12: 50.0}.get(stage, 22.0)


RING_CUR = (0.1, 1.0, 0.35, 1)      # el aro que toca ahora
RING_NEXT = (0.2, 0.75, 1.0, 1)     # el siguiente
RING_LATER = (0.3, 0.32, 0.38, 1)   # los que faltan
RING_HOLD = (1.0, 0.9, 0.15, 1)     # hover: se llena hacia amarillo mientras aguanta 1 s
WATCH = (0.2, 0.9, 1.0, 1)          # el dron cuya red estás viendo
BIRD_PREY = (1.0, 0.22, 0.12, 1)    # caza: el pájaro que persigue ahora
BIRD_OTHER = (1.0, 0.8, 0.2, 1)     # los demás pájaros


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
              n_goals=[0] * n, film={},
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
    birds = bool(msg.get("birds"))                 # caza: las metas son pájaros que se mueven
    ring_me = bird_mesh("DL_Bird", k) if birds else bpy.data.meshes["DL_Ring"]
    while len(pool) < len(goals):
        o = bpy.data.objects.new(f"DL_Goal_{i:03d}_{len(pool)}", ring_me)
        col.objects.link(o)
        pool.append(o)
    prev = Vector(msg.get("spawn", (0, 0, 0)))
    seen = {}
    st.setdefault("bird_prev", {})[i] = {}
    for j, o in enumerate(pool):
        if o.data != ring_me:
            o.data = ring_me
        if birds and j < len(goals):
            o.rotation_euler = (0, 0, 0)
            o.scale = (1.0, 1.0, 1.0)
            o.location = (off + goals[j]) * k
            o.color = BIRD_OTHER
        elif j < len(goals):
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
    film = msg.get("film")
    if film:                                       # grabar: casa de verdad, zona del cliente, aro mirando a la casa
        apply_film(i, msg, goals)
        if pool and goals:
            d = Vector(film["subject"]) - goals[0]
            pool[0].rotation_euler = (0.0, -math.atan2(d.z, math.hypot(d.x, d.y)), math.atan2(d.y, d.x))
            pool[0].scale = (1.6, 1.6, 1.6)
            pool[0].color = RING_NEXT

    # ---- obstáculos: cajas, esferas (copas, arbustos, rocas) y cilindros (troncos) ----
    obs = st["obstacles"][i]
    shapes = ([("box", b) for b in ([] if film else msg.get("boxes", []))] + [("sph", s) for s in msg.get("spheres", [])]
              + [("cyl", c) for c in msg.get("cylinders", [])])
    meshes = {"box": cube_mesh(), "sph": unit_sphere_mesh(), "cyl": unit_cyl_mesh()}
    while len(obs) < len(shapes):
        o = bpy.data.objects.new(f"DL_Obs_{i:03d}_{len(obs)}", cube_mesh())
        col.objects.link(o)
        obs.append(o)
    for j, o in enumerate(obs):
        if j < len(shapes):
            kind, d = shapes[j]
            if o.data != meshes[kind]:
                o.data = meshes[kind]
            if kind == "box":
                mn, mx = Vector(d[:3]), Vector(d[3:6])
                o.location = (off + Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))) * k
                o.scale = (mx - mn) * k
            elif kind == "sph":
                c, r = Vector(d[:3]), d[3]
                o.location = (off + c) * k
                o.scale = (r * k,) * 3
            else:                            # [x, y, radio, z0, z1]
                o.location = (off + Vector((d[0], d[1], d[3]))) * k
                o.scale = (d[2] * k, d[2] * k, (d[4] - d[3]) * k)
            o.hide_viewport = False
        elif not o.hide_viewport:
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


def update_birds(i, d):
    """Caza: mueve los pájaros de la celda i. d = [... 8 del dron, presa, x,y,z por pájaro (z=-1: cazado)]."""
    st = S()
    k = to_bu()
    off = st["offsets"][i]
    pool = st["rings"][i]
    prey = int(d[8])
    prev = st.setdefault("bird_prev", {}).setdefault(i, {})
    for j in range(min(len(pool), (len(d) - 9) // 3)):
        x, y, z = d[9 + 3 * j: 12 + 3 * j]
        o = pool[j]
        if z < -0.5:                                  # cazado
            if not o.hide_viewport:
                o.hide_viewport = True
            continue
        if o.hide_viewport:
            o.hide_viewport = False
        p = Vector((x, y, z))
        q = prev.get(j)
        if q is not None and (p - q).length > 1e-3:   # que mire hacia donde vuela
            o.rotation_euler = (0.0, 0.0, math.atan2(p.y - q.y, p.x - q.x))
        prev[j] = p
        o.location = (off + p) * k
        c = BIRD_PREY if j == prey else BIRD_OTHER
        if tuple(o.color) != c:
            o.color = c


def flash(i, status, pos):
    """Destello donde terminó el intento: rojo = chocó (justo donde chocó), verde = lo logró,
    amarillo = se acabó el tiempo. En grabar, además la zona del cliente se pone verde al lograr la toma."""
    st = S()
    k = to_bu()
    now = time.time()
    fl = st["flashes"][i]
    fl.location = (st["offsets"][i] + Vector(pos)) * k
    fl.color = COLORS[status]
    fl.scale = (max(1.0, (st.get("cell") or 10.0) / 14.0) * (1.4 if status == 1 else 1.0),) * 3
    fl.hide_viewport = False
    st["flash_until"][i] = now + (1.2 if status == 1 else 0.9)
    st["beacons"][i].color = COLORS[status]
    st["beacon_until"][i] = now + 0.8
    o = (st.get("film") or {}).get(i)
    if o and status == 2:
        o["zone"].color = ZONE_OK
        o["until"] = now + 1.2


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
            LAB().pop("error_txt", None)             # el entrenador arrancó bien: se olvida el error anterior
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
            if len(d) > 8:
                update_birds(i, d)
            elif len(d) >= 8:
                color_rings(i, int(d[6]), float(d[7]))
        qs, fgs, cps = frame.get("q"), frame.get("fg"), frame.get("cp")
        if qs is not None:                       # grabar: cono por calidad, aro por avance de la toma (y se mueve)
            for i in range(min(n, len(qs))):
                update_film(i, float(qs[i]), float(fgs[i]) if fgs and i < len(fgs) else 0.0,
                            cps[i] if cps and i < len(cps) else None)
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
    for o in (st.get("film") or {}).values():
        if o["until"] and now > o["until"]:
            o["zone"].color = ZONE_COL
            o["until"] = 0.0

    proc = st.get("proc")
    if proc and proc.poll() is not None:
        st["running"] = False
        st["exit_code"] = proc.returncode
        if proc.returncode not in (0, None):
            try:
                st["error"] = open(st["log"]).read().strip().splitlines()[-6:]
            except OSError:
                st["error"] = ["El trainer se cerró con error (ver live_train.log)"]
            lab_error("El entrenador se cerró con error: " + (st["error"][-1] if st["error"] else "ver live_train.log"))
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
# las entradas nuevas de Dron Maker (sensing.build_obs): [desde, hasta, nombre, color]
INPUT_GROUPS = [(27, 29, "sujeto", (1.0, 0.45, 0.85)), (30, 33, "toma", (1.0, 0.8, 0.2)),
                (34, 37, "su dron", (0.45, 1.0, 0.75))]


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
    text(tx, y_top - 51 * f, "naranja = empuja hacia +   azul = empuja hacia −   más brillante = influye más ahora"
         + ("   ·   franjas: entradas nuevas (27-37)" if len(act["in"]) > 27 else ""),
         int(10 * f), (0.75, 0.78, 0.85, 1))

    lab_in, lab_out = 150 * f, 190 * f
    xs = [x0 + lab_in + (width - lab_in - lab_out) * c / (len(sizes) - 1) for c in range(len(sizes))]
    top, bot = y_top - 84 * f, y_bot + 14 * f

    def ny(k, n):
        return top - (k + 0.5) * (top - bot) / n

    titles = [f"{sizes[0]} entradas: lo que siente"] + [f"capa {c}: {n} neuronas" for c, n in enumerate(sizes[1:-1], 1)] \
        + [f"{sizes[-1]} salidas: palancas"]
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

    # ---- entradas nuevas (27-37): franja de color + nombre del grupo, para ubicarlas rápido ----
    n_in = sizes[0]
    for a, b, name, col in INPUT_GROUPS:
        if n_in <= b:
            continue
        sp = (top - bot) / n_in
        y_hi, y_lo = ny(a, n_in) + sp / 2, ny(b, n_in) - sp / 2
        draw_rect(sh, x0 + 4 * f, y_lo, xs[0] + 9 * f - (x0 + 4 * f), y_hi - y_lo, (col[0], col[1], col[2], 0.16))
        draw_rect(sh, x0 + 4 * f, y_lo, 4 * f, y_hi - y_lo, (col[0], col[1], col[2], 0.95))
        fs_g = int(9 * f)
        blf.size(0, fs_g)
        try:                                         # el nombre del grupo, vertical junto a la franja
            blf.enable(0, blf.ROTATION)
            blf.rotation(0, math.pi / 2)
            text(x0 + 17 * f, (y_hi + y_lo) / 2 - blf.dimensions(0, name)[0] / 2, name, fs_g, (col[0], col[1], col[2], 1))
        finally:
            blf.rotation(0, 0)
            blf.disable(0, blf.ROTATION)

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
    if p.get("stage") in (8, 9, 10):
        lines.append(f"caza: {s.get('goals', 0):.1f} de {p.get('n_birds', 5)} pájaros por intento · "
                     f"pájaros a {p.get('bird_speed', 2):g} m/s")
    if p.get("stage") in (11, 12):
        lines.append(f"GRABAR: tomas logradas {s.get('succ', 0) * 100:.0f} % · choques {s.get('crash', 0) * 100:.0f} % · "
                     f"calidad media {s.get('film', 0) * 100:.0f} % · dron {p.get('dron', '-')}")
        lines.append("cono de la cámara: rojo = mala imagen · amarillo · verde = buena · aro = punto de cámara")
    elif p.get("dron") and p.get("dron") != "estándar":
        lines.append(f"dron: {p['dron']}")
    if s.get("front") is not None and s.get("front", 0) > 0:
        lines.append(f"vuela de frente el {s['front'] * 100:.0f} % del tiempo (nariz hacia donde va, ±45°)")
    if s.get("spd"):
        lines.append(f"los que llegan: vel. media {s['spd']:.1f} m/s · giro medio {s.get('ang', 0):.0f}°/s"
                     + (f" · viento {p['wind']:g} m/s" if p.get("wind") else "")
                     + (f" · densidad {p.get('density', 1):g}" if p.get("stage") in (6, 7, 10) else ""))
    rw = p.get("reward", {})
    if rw:
        items = [f"{k} {v:g}" for k, v in rw.items()]
        half = (len(items) + 1) // 2
        lines.append("recompensa: " + "  ".join(items[:half]))
        lines.append("      " + "  ".join(items[half:]))
    if s.get("msg"):
        lines.append(s["msg"])
    mis = st.get("hello", {}).get("mission")
    if mis:
        lines.insert(0, f"MISIÓN {mis['nombre']}: {mis['exito']}"[:110])
    mod = st.get("hello", {}).get("modelo")
    if mod:
        lines.insert(1, "MODELO NUEVO (red al azar)" if mod.get("nuevo") else
                     f"modelo.zip: continuando desde la generación {mod.get('generaciones')}")
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
    film_hist = any(len(h) > 5 and h[5] is not None for h in hist)
    cw, ch = (380 * f, 150 * f) if film_hist else (330 * f, 130 * f)
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
            if film_hist:                            # calidad media de imagen (solo donde entrenó grabar)
                seg = []
                for h in hist:
                    if len(h) > 5 and h[5] is not None:
                        seg.append((px(h[0]), cy + h[5] * ch))
                    elif seg:
                        draw_line(sh, seg, (1.0, 0.82, 0.2, 1))
                        seg = []
                draw_line(sh, seg, (1.0, 0.82, 0.2, 1))
    # cambios de nivel en la vida del modelo: línea vertical + nombre corto
    if sh and len(hist) >= 2:
        prev = None
        for h in hist:
            stg = h[4] if len(h) > 4 else None
            if stg != prev and stg is not None:
                x = px(h[0])
                draw_line(sh, [(x, cy), (x, cy + ch)], (0.6, 0.75, 1.0, 0.35))
                text(x + 3 * f, cy + ch - 28 * f, TEST_NAMES.get(stg, str(stg))[:9], int(9 * f), (0.6, 0.75, 1.0, 0.9))
            prev = stg
    if film_hist:
        text(cx, cy + ch + 14 * f, "por generación:", int(12 * f), (0.85, 0.85, 0.9, 1))
        text(cx + 100 * f, cy + ch + 14 * f, "tomas logradas", int(12 * f), (0.3, 1.0, 0.45, 1))
        text(cx + 205 * f, cy + ch + 14 * f, "choques", int(12 * f), (1.0, 0.3, 0.25, 1))
        text(cx + 265 * f, cy + ch + 14 * f, "calidad imagen", int(12 * f), (1.0, 0.82, 0.2, 1))
    else:
        text(cx, cy + ch + 14 * f, "progreso del modelo (toda su vida)", int(12 * f), (0.85, 0.85, 0.9, 1))
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
    dron: bpy.props.EnumProperty(name="Dron", items=dron_items,
                                 description="Con qué física vuela: el dron de siempre, uno armado en el juego "
                                             "(drones/*.json) o uno al azar en cada intento")
    level_path: bpy.props.StringProperty(name="JSON", subtype='FILE_PATH', default="")
    net: bpy.props.IntProperty(name="Neuronas por capa", default=128, min=8, max=512,
                               description="Solo cuenta al crear el modelo (o al Empezar de cero)")
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
    rw_danger: bpy.props.FloatProperty(name="Castigo por peligro", default=0.0, min=0, max=2, precision=2,
                                       update=_on_live_change,
                                       description="Castiga ir RÁPIDO hacia algo que ve (menos de 1 s para chocar): "
                                                   "aprende a frenar o desviarse a tiempo")
    rw_heading: bpy.props.FloatProperty(name="Ir de frente", default=2.0, min=0, max=5, update=_on_live_change,
                                        description="Nariz hacia el aro: cuesta esto por segundo de espaldas (la mitad "
                                                    "de lado) y paga en el acto cada grado que gira hacia el aro. Evita "
                                                    "que vuele hacia atrás o dando vueltas")
    rw_speed: bpy.props.FloatProperty(name="Premio por rapidez", default=0.3, min=0, max=10, update=_on_live_change,
                                      description="Al pasar cada aro: + esto × velocidad media del tramo (m/s). "
                                                  "Más alto = vuela más rápido (y arriesga más)")
    rw_film: bpy.props.FloatProperty(name="Premio por grabar bien", default=3.0, min=0, max=20, update=_on_live_change,
                                     description="Grabar: + esto por segundo de buena imagen (casa en el cuadro, en la "
                                                 "zona del cliente y sin sacudidas)")
    rw_stability: bpy.props.FloatProperty(name="Castigo por inestabilidad", default=0.5, min=0, max=10,
                                          update=_on_live_change,
                                          description="Castiga (por segundo) los giros bruscos de roll/pitch (sacudidas). "
                                                      "Más alto = vuelo más suave. Girar sobre sí mismo lo maneja 'Ir de frente'")
    # ---- ambiente (cambia en vivo, desde el próximo intento de cada dron) ----
    densidad: bpy.props.FloatProperty(name="Densidad del bosque", default=1.0, min=0.3, max=2.5, update=_on_env_change,
                                      description="Bosque y Caza en el bosque: 0.5 = claro · 1 = normal · 2 = denso")
    pajaros: bpy.props.IntProperty(name="Pájaros", default=5, min=1, max=10, update=_on_env_change,
                                   description="Caza: cuántos pájaros hay que cazar (desde el próximo intento)")
    pajaros_vel: bpy.props.FloatProperty(name="Velocidad pájaros (m/s)", default=1.5, min=0.3, max=5.0,
                                         update=_on_env_change,
                                         description="Caza: qué tan rápido vuelan los pájaros (huyendo, hasta "
                                                     "~2x esto). Empieza lento y súbelo cuando ya los caza")
    viento: bpy.props.FloatProperty(name="Viento máx. (m/s)", default=0.0, min=0.0, max=8.0, update=_on_env_change,
                                    description="Cada intento sopla un viento al azar hasta este valor, con ráfagas. "
                                                "Sirve en cualquier nivel: entrena la estabilidad")
    sigma: bpy.props.FloatProperty(name="Exploración σ (ruido)", default=0.4, min=0.02, max=1.0, update=_on_sigma,
                                   description="Cuánto ruido agrega PPO a las palancas para probar cosas nuevas. "
                                               "Muy bajo = repite siempre lo mismo (no aprende a esquivar)")
    # ---- probar el modelo ----
    prueba_tipo: bpy.props.EnumProperty(name="Escenario", items=[
        ("IGUAL", "Igual que el entrenamiento", "El mismo tipo de nivel que estás entrenando"),
        ("0", "Hover", ""), ("1", "Meta fija", ""), ("2", "Una meta sin obstáculos", ""),
        ("3", "Una meta con columnas", ""), ("4", "Tres metas con columnas", ""),
        ("5", "Circuito (2 vueltas)", ""), ("6", "Bosque", ""), ("7", "Bosque: 3 aros", "")], default="IGUAL")


class DRONELAB_OT_start(bpy.types.Operator):
    bl_idname = "dronelab.start"
    bl_label = "Iniciar entrenamiento"
    bl_description = "Crea los drones y lanza el entrenamiento en otro proceso"

    def fail(self, msg):
        """No pudo iniciar: lo dice en Blender y en models/lab_estado.json (el juego lo muestra)."""
        self.report({'ERROR'}, msg)
        lab_error(msg)
        return {'CANCELLED'}

    def execute(self, context):
        p = lab_scene().drone_lab
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
            return self.fail(f"No encuentro Python en {python}")
        if not os.path.isfile(script):
            return self.fail(f"No encuentro {script}")
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
            tele.close()
            return self.fail(f"Puerto {TELE_PORT} ocupado ({e}): ¿otro Drone Lab de Dron Maker abierto en otra ventana de Blender?")
        tele.setblocking(False)

        lp = live_params(p)
        cmd = [python, "-u", script, "--drones", str(p.drones), "--stage", str(stage),
               "--lr", repr(lp["lr"]), "--ent", repr(lp["ent"]), "--speed", lp["speed"],
               "--net", str(p.net), "--reward", json.dumps(lp["reward"]),
               "--port", str(TELE_PORT), "--ctrl-port", str(CTRL_PORT),
               "--watch", str(min(p.watch, p.drones - 1)), "--log-std", repr(math.log(p.sigma)),
               "--density", repr(p.densidad), "--wind", repr(p.viento),
               "--birds", str(p.pajaros), "--bird-speed", repr(p.pajaros_vel)]
        if p.stage == "LEVEL" and p.level_path:
            cmd += ["--level", os.path.expanduser(bpy.path.abspath(p.level_path))]
        if p.dron == "AZAR":
            cmd += ["--dron", "azar"]
        elif p.dron and p.dron != "ESTANDAR":
            cmd += ["--dron", os.path.join(project, "drones", p.dron + ".json")]
        cmd += ["--model", LAB().get("modelo") or model_files(project)[0]]   # el modelo del pedido (o el base): se continúa si existe
        log = os.path.join(project, "live_train.log")
        proc = subprocess.Popen(cmd, cwd=project, stdout=open(log, "w"), stderr=subprocess.STDOUT,
                                start_new_session=True)
        lab = lab_scene()
        st.clear()
        if context.scene.get("es_prueba"):               # estabas en la prueba: volver al laboratorio
            context.window.scene = lab
        st.update(running=True, proc=proc, log=log, tele_sock=tele, scene_name=lab.name,
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
        p = lab_scene().drone_lab
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
    bl_description = ("Abre una simulación 3D con obstáculos y metas al azar, y EL modelo vuela en vivo "
                      "(si estás entrenando, con la generación de este momento). El entrenamiento sigue de fondo")

    stage: bpy.props.IntProperty(default=-1, options={'HIDDEN', 'SKIP_SAVE'})

    def execute(self, context):
        p = lab_scene().drone_lab
        st = S()
        stage = self.stage if self.stage >= 0 else test_stage(p)
        if stage in (11, 12):               # grabar se prueba en el juego nuevo: misión de la casa, "Que grabe la IA"
            st["test_msg"] = ("Grabar se prueba en Dron Maker: Tablero → Fotos de una casa → Que grabe la IA. "
                              "Usa la última generación guardada (cada 10)")
            return bpy.ops.dronelab.jugar(pagina="app")
        if stage >= 8:                      # la caza se ve en el juego del navegador (pájaros, cámaras, etc.)
            st["test_msg"] = ("La caza se prueba en el juego: Jugar en el navegador → Juego: Caza "
                              "(mundo Campo, Columnas o Bosque)")
            return bpy.ops.dronelab.jugar()
        proc = st.get("proc")
        if proc and proc.poll() is None:
            # entrenando: el trainer guarda la generación actual en models/modelo.zip/.npz y avisa ("x")
            st["pending_test"] = {"stage": stage, "since": time.time()}
            st["test_msg"] = "Guardando la generación actual del modelo…"
            send_ctrl({"export": True})
            self.report({'INFO'}, "Guardando la generación actual del modelo…")
            return {'FINISHED'}
        try:
            npz = fresh_npz(p)
        except Exception as e:
            st["test_msg"] = f"ERROR: {e}"[:160]
            self.report({'ERROR'}, str(e))
            return {'CANCELLED'}
        start_test(npz, stage)
        return {'FINISHED'}


class DRONELAB_OT_jugar(bpy.types.Operator):
    bl_idname = "dronelab.jugar"
    bl_label = "Jugar en el navegador"
    bl_description = ("Abre el juego (game/) en tu navegador: escoges el mundo, pones los aros y EL modelo vuela. "
                      "Mucho más fluido que la prueba en Blender")

    pagina: bpy.props.StringProperty(default="arena", options={'HIDDEN', 'SKIP_SAVE'})

    def execute(self, context):
        p = lab_scene().drone_lab
        project, python = _paths(p)
        st = S()
        if st.get("running"):
            send_ctrl({"save": True})            # que el juego tenga la generación de ahora
        srv = st.get("game_server")
        alive = srv is not None and srv.poll() is None
        log = open(os.path.join(project, "jugar.log"), "w")
        args = [python, "-u", os.path.join(project, "scripts", "jugar.py")]
        if self.pagina == "arena":
            args.append("--arena")
        proc = subprocess.Popen(args, cwd=project, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        if not alive:
            st["game_server"] = proc
        self.report({'INFO'}, f"Abriendo http://localhost:8765/{'game' if self.pagina == 'arena' else 'app'}/")
        return {'FINISHED'}


class DRONELAB_OT_reset_model(bpy.types.Operator):
    bl_idname = "dronelab.reset_model"
    bl_label = "Empezar de cero"
    bl_description = ("Guarda el modelo actual en models/anteriores/ y la próxima vez que inicies se crea "
                      "una red nueva al azar")

    def invoke(self, context, event):
        return context.window_manager.invoke_confirm(self, event)

    def execute(self, context):
        if S().get("running"):
            self.report({'WARNING'}, "Detén el entrenamiento primero")
            return {'CANCELLED'}
        import shutil
        project, _ = _paths(lab_scene().drone_lab)
        dest = os.path.join(project, "models", "anteriores")
        os.makedirs(dest, exist_ok=True)
        tag = time.strftime("%Y%m%d_%H%M%S")
        moved = 0
        for f in model_files(project):
            if os.path.isfile(f):
                base, ext = os.path.splitext(os.path.basename(f))
                shutil.move(f, os.path.join(dest, f"{base}_{tag}{ext}"))
                moved += 1
        S().pop("stats", None)
        S().pop("model_info", None)
        S().pop("model_info_mtime", None)
        self.report({'INFO'}, f"Modelo archivado en models/anteriores/ ({moved} archivos). El próximo será nuevo.")
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
        p = lab_scene().drone_lab               # los ajustes del laboratorio, aunque estés viendo la prueba
        st = S()
        running = st.get("running", False)
        L = self.layout
        if context.scene.get("es_prueba"):
            L.label(text="Estás viendo la prueba. Ajustes = los del laboratorio.", icon='INFO')
        width = max(24, int(context.region.width / (7.2 * context.preferences.system.ui_scale)))

        # ---- lo que pidió el juego (app/, Laboratorio de IA) y en qué va ----
        lb = LAB()
        if lb.get("pedido_txt") or lb.get("error_txt"):
            box = L.box()
            est = lab_status(lb, st)
            icon = {"entrenando": 'PLAY', "iniciando": 'TIME', "deteniendo": 'TIME', "error": 'ERROR'}.get(est, 'CHECKMARK')
            box.label(text=f"Juego ↔ Blender: {ESTADO_TXT.get(est, est)}", icon=icon)
            c = box.column(align=True)
            c.scale_y = 0.85
            if lb.get("pedido_txt"):
                hace = int(time.time() - lb.get("pedido_t", time.time()))
                wrapped(c, f"Pedido del juego (hace {hace // 60} min {hace % 60} s): {lb['pedido_txt']}", width)
            if lb.get("msg"):
                wrapped(c, lb["msg"], width)
            if lb.get("error_txt"):
                r = c.column(align=True)
                r.alert = True
                wrapped(r, "Error: " + lb["error_txt"], width)

        # ---- misión: qué cuenta como éxito ----
        missions = load_missions(p.project)
        key = "level" if p.stage == "LEVEL" else p.stage
        mis = (st.get("hello", {}).get("mission") if running else None) or missions.get(key)
        box = L.box()
        if mis:
            box.label(text=f"Misión: {mis['nombre']}  ({mis['tiempo']} s máx.)", icon='TRACKER')
            c = box.column(align=True)
            c.scale_y = 0.8
            for title, field in (("Objetivo", "objetivo"), ("Éxito", "exito"), ("Falla", "falla"), ("Premio", "premio")):
                wrapped(c, f"{title}: {mis[field]}", width)
            c.separator()
            if p.stage in ("11", "12"):
                wrapped(c, "Casa = el sujeto · anillo celeste en el piso = zona del cliente (distancia) y aros "
                           "arriba = alturas · aro = punto de cámara (se llena de verde mientras graba) · cono = lo "
                           "que ve la cámara: rojo mala imagen → amarillo → verde buena. Destellos: verde toma "
                           "lograda · rojo choque (donde chocó) · amarillo se acabó el tiempo.", width)
            else:
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

        # ---- el modelo (uno solo) ----
        project, _ = _paths(p)
        zp, _, _ = model_files(project)
        info = model_info(project) if os.path.isfile(zp) else None
        box = L.box()
        box.label(text="Modelo: models/modelo.zip (el único)", icon='OUTLINER_OB_ARMATURE')
        c = box.column(align=True)
        c.scale_y = 0.85
        if info:
            c.label(text=f"{info.get('pasos', 0):,} pasos · generación {info.get('generaciones', 0)} · "
                         f"red {'-'.join(str(x) for x in info.get('red', []))}")
            niv = info.get("niveles", {})
            if niv:
                tot = max(sum(niv.values()), 1)
                wrapped(c, "Entrenado en: " + ", ".join(f"{STAGE_NAMES.get(k, k)} {v / tot * 100:.0f}%"
                                                        for k, v in niv.items()), width)
            c.label(text=f"Creado {info.get('creado', '?')} · último {info.get('actualizado', '?')}")
        elif os.path.isfile(zp):
            c.label(text="Existe (sin historia todavía)")
        else:
            c.label(text="Todavía no existe: al Iniciar se crea una red NUEVA al azar")
        c.label(text=f"Los {p.drones} drones son copias de ESTE mismo cerebro.")
        row = box.row()
        row.enabled = not running and os.path.isfile(zp)
        row.operator("dronelab.reset_model", icon='TRASH')

        box = L.box()
        box.label(text="Entrenamiento", icon='EXPERIMENTAL')
        col = box.column()
        col.enabled = not running
        col.prop(p, "drones")
        col.prop(p, "stage")
        col.prop(p, "dron")
        if p.stage == "LEVEL":
            col.prop(p, "level_path")
        rn = col.row()
        rn.enabled = not os.path.isfile(zp)
        rn.prop(p, "net")
        if p.drones < 10:
            col.label(text="Con pocos drones cada generación tarda mucho", icon='INFO')
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
        box.label(text="Jugar: el modelo vuela en el navegador", icon='WORLD_DATA')
        row = box.row()
        row.scale_y = 1.6
        row.operator("dronelab.jugar", icon='PLAY')
        c = box.column(align=True)
        c.scale_y = 0.8
        c.label(text="Escoges el mundo y pones los aros con el mouse.")
        c.label(text="Usa la última generación guardada (cada 10).")

        box = L.box()
        box.label(text="Probar EL modelo en 3D (Blender)", icon='PLAY')
        box.prop(p, "prueba_tipo")
        if p.prueba_tipo != "IGUAL" and int(p.prueba_tipo) != training_stage(p):
            box.label(text="Ojo: es distinto a lo que entrenas", icon='ERROR')
        row = box.row()
        row.scale_y = 1.5
        row.operator("dronelab.probar", icon='WORLD')
        pt = st.get("pending_test")
        if pt and time.time() - pt.get("since", time.time()) > 4:
            box.label(text="Esperando al entrenador (termina de aprender)…", icon='TIME')
        if st.get("test_msg"):
            wrapped(box.column(), st["test_msg"], width)

        box = L.box()
        box.label(text="Ambiente (cambia en vivo)", icon='OUTLINER_OB_FORCE_FIELD')
        row = box.row()
        row.active = p.stage in ("6", "7", "10")
        row.prop(p, "densidad", slider=True)
        box.prop(p, "viento", slider=True)
        col = box.column()
        col.active = p.stage in ("8", "9", "10")
        col.prop(p, "pajaros", slider=True)
        col.prop(p, "pajaros_vel", slider=True)

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
           DRONELAB_OT_reset_model, DRONELAB_OT_jugar,
           DRONELAB_OT_rebuild_view,
           DRONELAB_OT_clear,
           VIEW3D_PT_drone_lab]


def _shutdown_trainer():
    """Al cerrar Blender: pedir al trainer que guarde y termine (si no, seguiría en segundo plano)."""
    st = S()
    srv = st.get("game_server")
    if srv and srv.poll() is None:
        srv.terminate()
    proc = st.get("proc")
    if proc and proc.poll() is None:
        send_ctrl({"stop": True})
        try:
            proc.wait(timeout=8)
        except Exception:
            proc.terminate()


# =====================================================================
# El juego (app/, pantalla "Laboratorio de IA") manda pedidos de entrenamiento:
#   juego -> scripts/jugar.py -> models/lab_pedido.json -> (este vigilante, cada 1 s) -> Drone Lab
# y Blender avisa que está vivo en models/lab_estado.json. El progreso lo escribe el entrenador
# (models/entrenando.json). Pedido: {"id", "accion": "iniciar"|"ajustar"|"pausar"|"detener", "nivel",
# "dron": "ESTANDAR"|"AZAR"|<drones/*.json>, "drones", "velocidad", "viento", "premios": {...}, "python",
# "modelo": ruta del zip (models/drones/<slug>/modelo.zip; sin él, models/modelo.zip) -- cambiarlo reinicia}
# =====================================================================
def LAB():
    """Estado del vigilante (aparte de S(): Iniciar borra S())."""
    return bpy.app.driver_namespace.setdefault("dronmaker_lab", {})


ESTADO_TXT = {"esperando": "esperando pedidos", "iniciando": "iniciando…", "entrenando": "entrenando",
              "deteniendo": "deteniendo y guardando…", "error": "error"}


def lab_error(msg):
    """Guarda el último error del Drone Lab: lo muestran el panel y el juego (lab_estado.json)."""
    L = LAB()
    L["error_txt"] = str(msg)[:220]
    L["error_t"] = time.time()


def lab_status(L, st):
    """Qué está haciendo el Drone Lab: esperando · iniciando · entrenando · deteniendo · error."""
    proc = st.get("proc")
    if st.get("running") and proc and proc.poll() is None:
        if st.get("stop_requested"):
            return "deteniendo"
        return "entrenando" if st.get("hello") else "iniciando"
    if L.get("pending_start"):
        return "iniciando"
    if L.get("error_txt"):
        return "error"
    return "esperando"


def describe_request(req):
    """El pedido del juego en una línea, para el panel."""
    acc = req.get("accion", "iniciar")
    if acc in ("pausar", "detener"):
        return {"pausar": "pausar / seguir", "detener": "detener y guardar"}[acc]
    niv = str(req.get("nivel", "?"))
    name = next((it[1] for it in STAGE_ITEMS if it[0] == niv), niv)
    parts = [("entrenar" if acc == "iniciar" else "ajustar") + f" «{name}»"]
    if req.get("dron"):
        parts.append(f"dron {req['dron']}")
    if req.get("drones"):
        parts.append(f"{req['drones']} drones")
    if req.get("velocidad"):
        parts.append("tiempo real" if req["velocidad"] == "real" else "rápido")
    if req.get("premios"):
        parts.append(f"{len(req['premios'])} premios")
    return " · ".join(parts)


def lab_projects(p):
    """Dónde buscar los pedidos: la carpeta de este script, DRONMAKER_ROOT y la del panel (con Dron Maker primero)."""
    cands = []
    if os.environ.get("DRONMAKER_ROOT"):
        cands.append(os.environ["DRONMAKER_ROOT"])
    try:
        cands.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    except NameError:
        pass
    for t in bpy.data.texts:
        if t.filepath and t.filepath.endswith("drone_lab.py"):
            cands.append(os.path.dirname(os.path.dirname(os.path.abspath(bpy.path.abspath(t.filepath)))))
    cands.append(os.path.expanduser(bpy.path.abspath(p.project)).rstrip("/"))
    out = []
    for c in cands:
        if c and c not in out and os.path.isfile(os.path.join(c, "scripts", "live_train.py")):
            out.append(c)
    return sorted(out, key=lambda c: not os.path.isdir(os.path.join(c, "app")))


def trainer_running():
    st = S()
    proc = st.get("proc")
    return bool(st.get("running") and proc and proc.poll() is None)


def _call(op):
    """Correr un operador del Drone Lab desde el vigilante (los timers no tienen ventana)."""
    wm = bpy.context.window_manager
    lab = lab_scene()
    for win in wm.windows:
        if win.scene != lab and not win.scene.get("es_prueba"):
            continue
        win.scene = lab
        area = next((a for a in win.screen.areas if a.type == 'VIEW_3D'), None)
        with bpy.context.temp_override(window=win, screen=win.screen, area=area, scene=lab):
            return op()
    win = wm.windows[0]
    win.scene = lab
    area = next((a for a in win.screen.areas if a.type == 'VIEW_3D'), None)
    with bpy.context.temp_override(window=win, screen=win.screen, area=area, scene=lab):
        return op()


def apply_lab_request(req, root):
    L = LAB()
    p = lab_scene().drone_lab
    act = req.get("accion", "iniciar")
    if os.path.expanduser(bpy.path.abspath(p.project)).rstrip("/") != root:
        p.project = root
    if req.get("python") and os.path.isfile(req["python"]):
        p.python = req["python"]
    running = trainer_running()
    if act == "detener":
        L["pending_start"] = False
        if running:
            _call(bpy.ops.dronelab.stop)
            L["msg"] = "Deteniendo y guardando el modelo…"
        return
    if act == "pausar":
        if running:
            _call(bpy.ops.dronelab.pause)
        return
    # iniciar / ajustar
    restart = False
    nivel = str(req.get("nivel", p.stage))
    if nivel != p.stage:
        restart = True
        p.stage = nivel
    dron = req.get("dron")
    if dron and dron != p.dron:
        try:
            p.dron = dron
            restart = True
        except TypeError:
            L["msg"] = f"No encuentro el dron {dron} en drones/"
    if req.get("drones") and int(req["drones"]) != p.drones:
        p.drones = max(1, min(200, int(req["drones"])))
        restart = True
    if req.get("velocidad") in ("real", "rapido") and req["velocidad"] != p.speed:
        p.speed = req["velocidad"]                     # en vivo
    if "viento" in req and abs(float(req["viento"]) - p.viento) > 1e-6:
        p.viento = float(req["viento"])                 # en vivo (desde el próximo intento)
    for k, v in (req.get("premios") or {}).items():
        if k in REWARD_KEYS and abs(float(v) - getattr(p, "rw_" + k)) > 1e-9:
            setattr(p, "rw_" + k, float(v))             # en vivo
    if act != "iniciar":
        L["msg"] = "Premios y castigos actualizados"
        return
    modelo = req.get("modelo") or model_files(root)[0]       # un modelo por dron (models/drones/<slug>/modelo.zip)
    if os.path.abspath(modelo) != os.path.abspath(L.get("modelo") or model_files(root)[0]):
        restart = True
    L["modelo"] = modelo
    if running and restart:
        _call(bpy.ops.dronelab.stop)
        L["pending_start"] = True
        L["msg"] = "Cambio de misión o de dron: guardando y reiniciando…"
    elif not running:
        L["pending_start"] = True
        L["msg"] = "Iniciando el entrenamiento…"
    else:
        L["msg"] = "Ya estaba entrenando: premios actualizados"


def _lab_watch():
    L = LAB()
    p = lab_scene().drone_lab
    roots = lab_projects(p)
    if not roots:
        return
    root = roots[0]
    mdir = os.path.join(root, "models")
    req_path = os.path.join(mdir, "lab_pedido.json")
    if os.path.isfile(req_path):
        try:
            with open(req_path, encoding="utf-8") as fh:
                req = json.load(fh)
        except (OSError, ValueError):
            req = None
        if req and req.get("id") != L.get("req_id"):
            first = "req_id" not in L
            L["req_id"] = req.get("id")
            # un pedido viejo (de antes de abrir Blender) no se ejecuta solo
            if not (first and time.time() - float(req.get("t", 0)) > 30):
                L["pedido_txt"] = describe_request(req)
                L["pedido_t"] = time.time()
                L.pop("error_txt", None)             # pedido nuevo: se olvida el error anterior
                try:
                    apply_lab_request(req, root)
                except Exception as e:
                    L["msg"] = f"Error con el pedido: {e!r}"[:160]
                    lab_error(L["msg"])
    if L.get("pending_start") and not trainer_running():
        st = S()
        if not st.get("stop_requested") or time.time() - st["stop_requested"] > 1.0:
            L["pending_start"] = False
            probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            try:
                probe.bind(("127.0.0.1", TELE_PORT))
            except OSError:
                L["msg"] = (f"El puerto {TELE_PORT} está ocupado: hay otro Drone Lab de Dron Maker entrenando (¿otra "
                            "ventana de Blender?). Detenlo (Detener y guardar) y vuelve a pedirlo.")
                lab_error(L["msg"])
                return
            finally:
                probe.close()
            try:
                r = _call(bpy.ops.dronelab.start)
                L["msg"] = "Iniciando el entrenamiento…" if r == {'FINISHED'} else "No pude iniciar (mira el error)"
            except Exception as e:
                L["msg"] = f"No pude iniciar: {e!r}"[:160]
                lab_error(L["msg"])
    st = S()
    est = lab_status(L, st)
    if est == "entrenando" and L.get("msg", "").startswith("Iniciando"):
        L["msg"] = "Entrenando"
    elif est in ("esperando", "error") and L.get("msg") in ("Entrenando", "Iniciando el entrenamiento…"):
        L["msg"] = "Entrenamiento detenido (el modelo quedó guardado)" if st.get("bye") else ""
    view_err = st.get("error")
    view_err = view_err[-1] if isinstance(view_err, list) and view_err else (view_err or None)
    estado = {"vivo": time.time(), "estado": est, "estado_txt": ESTADO_TXT.get(est, est),
              "corriendo": trainer_running(), "pedido": L.get("req_id"), "pedido_txt": L.get("pedido_txt"),
              "pedido_t": L.get("pedido_t"), "msg": L.get("msg", ""), "proyecto": root, "nivel": p.stage,
              "dron": p.dron, "drones": p.drones, "puerto": TELE_PORT,
              "modelo": ("base" if os.path.dirname(os.path.abspath(L.get("modelo") or model_files(root)[0]))
                         == os.path.abspath(mdir) else os.path.basename(os.path.dirname(L["modelo"]))),
              "gen": (st.get("stats") or {}).get("gen"),
              "error": L.get("error_txt") or view_err, "error_t": L.get("error_t")}
    try:
        tmp = os.path.join(mdir, "lab_estado_guardando.json")
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(estado, fh)
        os.replace(tmp, os.path.join(mdir, "lab_estado.json"))
    except OSError:
        pass


def lab_watch():
    try:
        _lab_watch()
    except Exception as e:                  # el vigilante nunca se muere
        LAB()["msg"] = f"Vigilante: {e!r}"[:160]
    return 1.0


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
    old = ns.get("dronmaker_watch")              # el juego (app/) manda pedidos de entrenamiento
    if old and bpy.app.timers.is_registered(old):
        bpy.app.timers.unregister(old)
    ns["dronmaker_watch"] = lab_watch
    bpy.app.timers.register(lab_watch, first_interval=1.0, persistent=True)


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
