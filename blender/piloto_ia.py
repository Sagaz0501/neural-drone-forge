"""
PILOTO IA: la red neuronal entrenada vuela el dron dentro de esta escena, EN VIVO.

Cada vez que le das "Volar con la IA":
  1. se lee la escena: colección "Colisiones" (cajas), "Ruta" (Ruta_01, Ruta_02...), "Salida" y "Estacion"
  2. cada 1/50 s: sensores -> red neuronal (models/policy_bodega.npz) -> física del proyecto -> mover el dron
  3. al pasar el último punto, el piloto PD aterriza en la estación de carga
Puedes mover una caja, el montacargas o un punto de la ruta y volver a volar: la IA reacciona a la escena nueva.

"Grabar vuelo" hace lo mismo pero de una vez y lo guarda como keyframes (para renderizar un video).

Usa drone_rl/runtime.py del proyecto (solo numpy, que Blender ya trae). Vista: N > pestaña "Piloto IA".
"""
import math
import os
import sys
import time

import blf
import bpy
import gpu
import numpy as np
from gpu_extras.batch import batch_for_shader
from mathutils import Euler, Vector

FPS = 50


# =====================================================================
# Proyecto y escena
# =====================================================================
def project_dir():
    p = bpy.context.scene.get("drone_rl_project") or bpy.path.abspath("//..")
    return os.path.normpath(os.path.expanduser(p))


def lib():
    """Importa la física/sensores/runtime del proyecto (solo numpy)."""
    p = project_dir()
    if p not in sys.path:
        sys.path.insert(0, p)
    from drone_rl.level import Level
    from drone_rl.runtime import Flight, NumpyPolicy
    from drone_rl.sensing import RAY_LEN, ray_dirs_world
    return Level, Flight, NumpyPolicy, ray_dirs_world, RAY_LEN


def S():
    ns = bpy.app.driver_namespace
    if "piloto_ia" not in ns:
        ns["piloto_ia"] = {}
    return ns["piloto_ia"]


def level_from_scene():
    """Arma el nivel con lo que HAY en la escena ahora (por si moviste algo)."""
    Level = lib()[0]
    boxes = []
    col = bpy.data.collections.get("Colisiones")
    for o in (col.all_objects if col else []):
        if o.type != 'MESH':
            continue
        cs = [o.matrix_world @ Vector(c) for c in o.bound_box]
        boxes.append({"min": [min(c[i] for c in cs) for i in range(3)],
                      "max": [max(c[i] for c in cs) for i in range(3)]})
    ruta = sorted((o for o in bpy.data.collections["Ruta"].objects if o.name.startswith("Ruta_")),
                  key=lambda o: o.name)
    salida = bpy.data.objects["Salida"].matrix_world.translation
    est = bpy.data.objects.get("Estacion")
    lv = Level.from_dict({"name": "escena", "spawn": list(salida),
                          "goals": [list(o.matrix_world.translation) for o in ruta],
                          "boxes": boxes, "bounds": {"xy": 30, "z": 15}})
    return lv, (np.array(est.matrix_world.translation) if est else None)


def load_policy(props):
    NumpyPolicy = lib()[2]
    path = os.path.expanduser(bpy.path.abspath(props.modelo))
    if not os.path.isabs(path):
        path = os.path.join(project_dir(), path)
    st = S()
    mt = os.path.getmtime(path)
    if st.get("policy_key") != (path, mt):
        st["policy"] = NumpyPolicy(path)
        st["policy_key"] = (path, mt)
    return st["policy"]


def new_flight(props):
    _, Flight, _, _, _ = lib()
    level, pad = level_from_scene()
    fl = Flight(level, load_policy(props), land_on=pad)
    # cada vuelo arranca un poco distinto: la IA tiene que reaccionar, no repetir una grabación
    rng = np.random.default_rng()
    j = props.variacion
    start = level.spawn + np.array([rng.uniform(-j, j), rng.uniform(-j, j), 0.0])
    g = level.goals[0] - start
    yaw = math.atan2(g[1], g[0]) + math.radians(rng.uniform(-props.variacion_yaw, props.variacion_yaw))
    fl.reset(pos=start, yaw=yaw)
    return fl


# =====================================================================
# Poner el dron (y la cámara) donde dice la simulación
# =====================================================================
def apply_pose(info, dt, spin_state):
    dron = bpy.data.objects["Dron"]
    dron.location = Vector(info["pos"])
    dron.rotation_mode = 'XYZ'
    dron.rotation_euler = info["rot"]
    # hélices: giran según el gas (alternando sentido, como un quad real)
    rate = 6.0 + 30.0 * info["throttle"]
    spin_state["a"] = (spin_state.get("a", 0.0) + rate * dt * 2 * math.pi) % (2 * math.pi)
    for i in range(1, 5):
        h = bpy.data.objects.get(f"Helice_{i}")
        if h:
            h.rotation_euler.z = spin_state["a"] * (1 if i % 2 else -1)
        disc = bpy.data.objects.get(f"Disco_{i}")
        if disc:
            disc.hide_viewport = disc.hide_render = info["throttle"] < 0.05
    # cámara de persecución: detrás y arriba del dron, con suavizado
    cam, tgt = bpy.data.objects.get("Cam_Persecucion"), bpy.data.objects.get("Cam_Objetivo")
    if cam and tgt:
        yaw = info["rot"][2]
        p = Vector(info["pos"])
        want = p + Vector((-math.cos(yaw) * 2.2, -math.sin(yaw) * 2.2, 0.9))
        cam.location = cam.location.lerp(want, min(1.0, 4.0 * dt))
        tgt.location = tgt.location.lerp(p, min(1.0, 10.0 * dt))


# =====================================================================
# Dibujo: sensores (3D) y HUD
# =====================================================================
def _shader():
    for n in ("UNIFORM_COLOR", "3D_UNIFORM_COLOR"):
        try:
            return gpu.shader.from_builtin(n)
        except (ValueError, TypeError):
            pass
    return None


def draw_rays():
    st = S()
    info = st.get("info")
    props = bpy.context.scene.piloto_ia
    if not info or not props.mostrar_sensores:
        return
    _, _, _, ray_dirs_world, RAY_LEN = lib()
    sh = _shader()
    if not sh:
        return
    p = np.array(info["pos"])
    dirs = ray_dirs_world(info["rot"][2])
    gpu.state.blend_set('ALPHA')
    gpu.state.depth_test_set('LESS_EQUAL')
    groups = {}
    for d, dist in zip(dirs, info["rays"]):
        free = dist >= RAY_LEN - 1e-3
        k = 1.0 - min(dist / RAY_LEN, 1.0)
        col = (0.3, 1.0, 0.5, 0.35) if free else (1.0, 0.85 - 0.7 * k, 0.1, 0.9)
        groups.setdefault(col, []).extend([tuple(p), tuple(p + d * dist)])
    for col, pts in groups.items():
        b = batch_for_shader(sh, 'LINES', {"pos": pts})
        sh.bind()
        sh.uniform_float("color", col)
        b.draw(sh)
    gpu.state.depth_test_set('NONE')
    gpu.state.blend_set('NONE')


def draw_hud():
    st = S()
    info = st.get("info")
    if not info:
        return
    f = bpy.context.preferences.system.ui_scale
    n = st.get("n_goals", 0)
    sp = float(np.linalg.norm(info["vel"]))
    fase = {"ruta": "VOLANDO · la red neuronal decide", "aterrizaje": "ATERRIZANDO · piloto PD",
            "aterrizado": "LLEGÓ A LA ESTACIÓN", "choque": f"CHOQUE ({info['reason']})"}[info["phase"]]
    color = {"ruta": (0.6, 1, 0.65, 1), "aterrizaje": (0.6, 0.85, 1, 1), "aterrizado": (0.4, 1, 0.5, 1),
             "choque": (1, 0.35, 0.3, 1)}[info["phase"]]
    lines = [(f"PILOTO IA  ·  {fase}", 15, color),
             (f"punto {min(info['goal_idx'] + 1, n)}/{n}   t {info['t']:5.1f} s   "
              f"{sp:4.1f} m/s ({sp * 3.6:3.0f} km/h)   altura {info['pos'][2]:4.1f} m", 13, (0.95, 0.95, 0.95, 1))]
    a = info["action"]
    lines.append((f"palancas  gas {a[0]:+.2f}  roll {a[1]:+.2f}  pitch {a[2]:+.2f}  yaw {a[3]:+.2f}", 12,
                  (0.8, 0.85, 0.9, 1)))
    if st.get("result"):
        lines.append((st["result"], 13, color))
    if bpy.context.scene.get("es_prueba") and st.get("tally"):
        t = st["tally"]
        lines.append((f"pruebas en escenarios aleatorios:  llegó {t['llegó']}  ·  chocó {t['chocó']}  ·  "
                      f"sin tiempo {t['tiempo']}", 12, (0.75, 0.85, 1, 1)))
    x, y = 24 * f, 30 * f + 22 * f * len(lines)
    for s, size, c in lines:
        blf.size(0, int(size * f))
        blf.color(0, *c)
        blf.position(0, x, y, 0)
        blf.draw(0, s)
        y -= 22 * f


def ensure_handlers():
    ns = bpy.app.driver_namespace
    for key, fn, kind in (("pia_rays", draw_rays, 'POST_VIEW'), ("pia_hud", draw_hud, 'POST_PIXEL')):
        old = ns.pop(key, None)
        if old:
            try:
                bpy.types.SpaceView3D.draw_handler_remove(old, 'WINDOW')
            except (ValueError, RuntimeError):
                pass
        ns[key] = bpy.types.SpaceView3D.draw_handler_add(fn, (), 'WINDOW', kind)


def redraw():
    for w in bpy.context.window_manager.windows:
        for a in w.screen.areas:
            if a.type == 'VIEW_3D':
                a.tag_redraw()


def result_text(fl):
    if fl.phase == "aterrizado":
        return f"Recorrido completo en {fl.t:.1f} s: {len(fl.level.goals)} puntos y aterrizaje."
    if fl.phase == "choque":
        return f"Chocó contra {fl.reason} en el punto {fl.goal_idx + 1} a los {fl.t:.1f} s."
    return f"Se acabó el tiempo en el punto {fl.goal_idx + 1}."


# =====================================================================
# Operadores
# =====================================================================
class PILOTO_OT_volar(bpy.types.Operator):
    bl_idname = "piloto.volar"
    bl_label = "Volar con la IA"
    bl_description = "La red neuronal vuela el dron en vivo por la ruta de esta escena"

    def invoke(self, context, event):
        props = context.scene.piloto_ia
        try:
            self.fl = new_flight(props)
        except Exception as e:
            self.report({'ERROR'}, f"No pude preparar el vuelo: {e}")
            return {'CANCELLED'}
        dron = bpy.data.objects["Dron"]
        dron.animation_data_clear()                  # quitar una grabación anterior
        st = S()
        st.update(running=True, result="", n_goals=len(self.fl.level.goals), info=self.fl.info(), stop=False)
        self.spin = {}
        self.acc = 0.0
        self.last = time.perf_counter()
        cam = bpy.data.objects.get("Cam_Persecucion")
        if cam:
            p = Vector(self.fl.state.pos)
            y = self.fl.state.yaw
            cam.location = p + Vector((-math.cos(y) * 2.2, -math.sin(y) * 2.2, 0.9))
        apply_pose(st["info"], 0.0, self.spin)
        set_camera(context, props.camara)
        ensure_handlers()
        self._timer = context.window_manager.event_timer_add(1 / 60, window=context.window)
        context.window_manager.modal_handler_add(self)
        return {'RUNNING_MODAL'}

    def modal(self, context, event):
        st = S()
        if (event.type == 'ESC' and event.value == 'PRESS') or st.get("stop"):
            return self.finish(context, "Vuelo detenido.")
        if event.type != 'TIMER':
            return {'PASS_THROUGH'}
        now = time.perf_counter()
        dt = min(now - self.last, 0.1)
        self.last = now
        self.acc += dt * float(context.scene.piloto_ia.velocidad)
        info = st["info"]
        tmax = float(context.scene.get("tiempo_max", 120.0))
        while self.acc >= self.fl.dt and self.fl.phase in ("ruta", "aterrizaje"):
            info = self.fl.step()                  # sensores -> red -> física (1/50 s)
            self.acc -= self.fl.dt
            if self.fl.t > tmax:
                break
        st["info"] = info
        apply_pose(info, dt, self.spin)
        redraw()
        if self.fl.phase not in ("ruta", "aterrizaje") or self.fl.t > tmax:
            return self.finish(context, result_text(self.fl), self.fl.phase)
        return {'PASS_THROUGH'}

    def finish(self, context, msg, phase=None):
        context.window_manager.event_timer_remove(self._timer)
        st = S()
        st.update(running=False, result=msg, stop=False)
        if phase and context.scene.get("es_prueba"):          # marcador de la sesión de pruebas
            t = st.setdefault("tally", {"llegó": 0, "chocó": 0, "tiempo": 0})
            t["llegó" if phase == "aterrizado" else "chocó" if phase == "choque" else "tiempo"] += 1
        self.report({'INFO'}, msg)
        redraw()
        return {'FINISHED'}


class PILOTO_OT_detener(bpy.types.Operator):
    bl_idname = "piloto.detener"
    bl_label = "Detener"

    def execute(self, context):
        S()["stop"] = True
        return {'FINISHED'}


class PILOTO_OT_grabar(bpy.types.Operator):
    bl_idname = "piloto.grabar"
    bl_label = "Grabar vuelo (para render)"
    bl_description = "La IA vuela todo el recorrido de una vez y se guarda como animación (keyframes)"

    def execute(self, context):
        props = context.scene.piloto_ia
        sc = context.scene
        fl = new_flight(props)
        dron = bpy.data.objects["Dron"]
        movers = [dron] + [bpy.data.objects.get(n) for n in ("Cam_Persecucion", "Cam_Objetivo")]
        helices = [bpy.data.objects.get(f"Helice_{i}") for i in range(1, 5)]
        for o in movers + helices:
            if o:
                o.animation_data_clear()
        spin = {}
        cam = bpy.data.objects.get("Cam_Persecucion")
        if cam:
            cam.location = Vector(fl.state.pos) + Vector((-math.cos(fl.state.yaw) * 2.2,
                                                           -math.sin(fl.state.yaw) * 2.2, 0.9))
        info = fl.info()
        frame = 1
        hold = 0
        while True:
            apply_pose(info, fl.dt, spin)
            for o in movers:
                if o:
                    o.keyframe_insert("location", frame=frame)
            dron.keyframe_insert("rotation_euler", frame=frame)
            for h in helices:
                if h:
                    h.keyframe_insert("rotation_euler", index=2, frame=frame)
            frame += 1
            if fl.phase in ("ruta", "aterrizaje") and fl.t < 120:
                info = fl.step()
            else:
                hold += 1                          # 2 s quieto al final
                if hold > 2 * FPS:
                    break
        sc.render.fps = FPS
        sc.frame_start, sc.frame_end = 1, frame - 1
        sc.frame_set(1)
        msg = result_text(fl) + f"  Grabado: {frame - 1} cuadros ({(frame - 1) / FPS:.1f} s). Dale Play o renderiza."
        S().update(result=msg, info=info, n_goals=len(fl.level.goals))
        ensure_handlers()
        self.report({'INFO'}, msg)
        return {'FINISHED'}


class PILOTO_OT_reiniciar(bpy.types.Operator):
    bl_idname = "piloto.reiniciar"
    bl_label = "Volver a la salida"

    def execute(self, context):
        dron = bpy.data.objects["Dron"]
        dron.animation_data_clear()
        sal = bpy.data.objects["Salida"].matrix_world.translation
        dron.location = sal
        dron.rotation_euler = (0, 0, 0)
        S().update(info=None, result="")
        redraw()
        return {'FINISHED'}


def set_camera(context, which):
    sc = context.scene
    cams = {"PERSECUCION": "Cam_Persecucion", "FPV": "Cam_FPV", "GENERAL": "Cam_General"}
    if which in cams and bpy.data.objects.get(cams[which]):
        sc.camera = bpy.data.objects[cams[which]]
        for a in context.screen.areas:
            if a.type == 'VIEW_3D':
                a.spaces.active.region_3d.view_perspective = 'CAMERA'
                break


def _upd_camera(self, context):
    set_camera(context, self.camara)


def _upd_ruta(self, context):
    lc = context.view_layer.layer_collection.children.get("Ruta_Visual")
    if lc:
        lc.hide_viewport = not self.mostrar_ruta
    c = bpy.data.collections.get("Ruta_Visual")
    if c:
        c.hide_render = not self.mostrar_ruta


def _upd_col(self, context):
    lc = context.view_layer.layer_collection.children.get("Colisiones")
    if lc:
        lc.hide_viewport = not self.mostrar_colisiones


class PilotoProps(bpy.types.PropertyGroup):
    modelo: bpy.props.StringProperty(name="Modelo", subtype='FILE_PATH', default="models/policy_bodega.npz",
                                     description="Red exportada con scripts/export_policy.py (relativo al proyecto)")
    velocidad: bpy.props.EnumProperty(name="Velocidad", items=[("0.25", "x0.25", ""), ("0.5", "x0.5", ""),
                                                               ("1.0", "x1", ""), ("2.0", "x2", "")], default="1.0")
    variacion: bpy.props.FloatProperty(name="Variación de salida (m)", default=0.3, min=0.0, max=1.0,
                                       description="Cada vuelo arranca en un punto un poco distinto")
    variacion_yaw: bpy.props.FloatProperty(name="Variación de giro (°)", default=15.0, min=0.0, max=45.0)
    mostrar_sensores: bpy.props.BoolProperty(name="Mostrar sensores", default=True)
    mostrar_ruta: bpy.props.BoolProperty(name="Mostrar ruta", default=True, update=_upd_ruta)
    mostrar_colisiones: bpy.props.BoolProperty(name="Mostrar colisiones", default=False, update=_upd_col)
    camara: bpy.props.EnumProperty(name="Cámara", items=[("PERSECUCION", "Persecución", ""), ("FPV", "FPV", ""),
                                                        ("GENERAL", "General", ""), ("LIBRE", "Libre", "")],
                                   default="PERSECUCION", update=_upd_camera)


class VIEW3D_PT_piloto_ia(bpy.types.Panel):
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = "Piloto IA"
    bl_label = "Piloto IA"

    def draw(self, context):
        p = context.scene.piloto_ia
        st = S()
        L = self.layout
        col = L.column(align=True)
        col.scale_y = 1.5
        if st.get("running"):
            col.operator("piloto.detener", icon='PAUSE')
        else:
            col.operator("piloto.volar", icon='PLAY')
        if context.scene.get("es_prueba") and hasattr(bpy.types, "PRUEBA_OT_otro"):
            box = L.box()
            tipo = {2: "una meta, sin obstáculos", 3: "una meta con columnas", 4: "tres metas con columnas"}
            box.label(text=f"Escenario aleatorio #{context.scene.get('prueba_seed', 0)}", icon='WORLD')
            box.label(text=f"Tipo: {tipo.get(int(context.scene.get('prueba_stage', 3)), '')}")
            col = box.column(align=True)
            col.scale_y = 1.3
            col.operator("prueba.otro", icon='FILE_REFRESH')
            col.operator("prueba.volver", icon='BACK')
            t = st.get("tally")
            if t:
                box.label(text=f"Llegó {t['llegó']} · chocó {t['chocó']} · sin tiempo {t['tiempo']}")
        L.operator("piloto.grabar", icon='REC')
        L.operator("piloto.reiniciar", icon='LOOP_BACK')
        if st.get("result"):
            box = L.box()
            import textwrap
            for ln in textwrap.wrap(st["result"], 38):
                box.label(text=ln)
        box = L.box()
        box.prop(p, "camara")
        box.prop(p, "velocidad", expand=True)
        box.prop(p, "variacion")
        box.prop(p, "variacion_yaw")
        box.prop(p, "mostrar_sensores")
        box.prop(p, "mostrar_ruta")
        box.prop(p, "mostrar_colisiones")
        box = L.box()
        box.prop(p, "modelo")
        box.label(text="Mueve cajas o puntos de la ruta y vuelve a volar.", icon='INFO')


CLASSES = [PilotoProps, PILOTO_OT_volar, PILOTO_OT_detener, PILOTO_OT_grabar, PILOTO_OT_reiniciar,
           VIEW3D_PT_piloto_ia]


def register():
    for c in CLASSES:
        old = getattr(bpy.types, c.__name__, None)
        if old is not None:
            try:
                bpy.utils.unregister_class(old)
            except RuntimeError:
                pass
        bpy.utils.register_class(c)
    bpy.types.Scene.piloto_ia = bpy.props.PointerProperty(type=PilotoProps)


# Se registra al ejecutarlo (Alt+P) y también al abrir el .blend (el texto está marcado como "Register")
register()
