# ================== DRONE SIM para Blender (vuelo manual) ==================
# Corre: Alt+P en el Text Editor, luego menu View > Drone Fly en el viewport 3D.
# Usa los mismos parámetros que drone_rl/physics.py, así lo que vuelas a mano
# es lo mismo que "vive" la IA al entrenar.
import bpy, blf, math, time
from mathutils import Euler, Vector

# ---------- PARAMETROS FISICOS (SI) ----------
MASS      = 0.6                 # kg
G         = 9.81                # m/s^2
TWR       = 2.5                 # relacion empuje/peso a 100% gas
DRAG      = 0.03                # coef. arrastre cuadratico
MAX_ANGLE = math.radians(35)    # inclinacion max (modo angle / auto-nivelado)
YAW_RATE  = math.radians(180)   # rad/s de yaw
ATT_RESP  = 8.0                 # que tan rapido sigue el angulo objetivo (1/s)
THR_RATE  = 0.6                 # cambio de gas por segundo al mantener tecla
CRASH_V   = 4.0                 # m/s de impacto vertical = crash
HOVER     = 1.0 / TWR           # gas para hover


def clamp(x, a, b):
    return max(a, min(b, x))


def ensure_scene():
    """Crea Drone_Root (padre del frame) y un piso de referencia si no existen."""
    sc = bpy.context.scene
    root = bpy.data.objects.get("Drone_Root")
    if root is None:
        root = bpy.data.objects.new("Drone_Root", None)
        root.empty_display_type = 'ARROWS'
        root.empty_display_size = 30
        sc.collection.objects.link(root)
    for cname in ("Drone_Frame", "Drone_Preview"):
        c = bpy.data.collections.get(cname)
        if c:
            for o in c.objects:
                if o.parent is None:
                    o.parent = root
                    o.matrix_parent_inverse = root.matrix_world.inverted()
    lc = bpy.context.view_layer.layer_collection.children.get("Drone_Preview")
    if lc:
        lc.hide_viewport = False
    if bpy.data.objects.get("Sim_Floor") is None:
        S = 100000  # 100 m (escena en mm)
        me = bpy.data.meshes.new("Sim_Floor")
        me.from_pydata([(-S, -S, -0.5), (S, -S, -0.5), (S, S, -0.5), (-S, S, -0.5)], [], [(0, 1, 2, 3)])
        fl = bpy.data.objects.new("Sim_Floor", me)
        sc.collection.objects.link(fl)
        m = bpy.data.materials.new("Sim_Floor_Mat")
        m.use_nodes = True
        nt = m.node_tree
        b = nt.nodes["Principled BSDF"]
        ck = nt.nodes.new("ShaderNodeTexChecker")
        ck.inputs["Scale"].default_value = 200
        ck.inputs["Color1"].default_value = (0.30, 0.31, 0.34, 1)
        ck.inputs["Color2"].default_value = (0.20, 0.21, 0.23, 1)
        tc = nt.nodes.new("ShaderNodeTexCoord")
        nt.links.new(tc.outputs["Generated"], ck.inputs["Vector"])
        nt.links.new(ck.outputs["Color"], b.inputs["Base Color"])
        b.inputs["Roughness"].default_value = 0.9
        m.diffuse_color = (0.25, 0.26, 0.28, 1)
        me.materials.append(m)
    return root


class DRONE_OT_fly(bpy.types.Operator):
    bl_idname = "wm.drone_fly"
    bl_label = "Drone Fly (simulador)"
    KEYS = {'W', 'S', 'A', 'D', 'Q', 'E', 'UP_ARROW', 'DOWN_ARROW', 'SPACE', 'LEFT_SHIFT'}

    def invoke(self, context, event):
        if context.area is None or context.area.type != 'VIEW_3D':
            self.report({'ERROR'}, "Ejecutalo desde un viewport 3D")
            return {'CANCELLED'}
        self.root = ensure_scene()
        self.root.animation_data_clear()          # quita una repeticion importada, si habia
        self.keys = set()
        self.follow = True
        self.area = context.area
        sp = context.area.spaces.active
        sp.clip_end = 1e6
        sp.clip_start = 1
        self.r3d = sp.region_3d
        self.reset()
        self.last = time.perf_counter()
        wm = context.window_manager
        self._timer = wm.event_timer_add(1 / 60, window=context.window)
        self._handle = bpy.types.SpaceView3D.draw_handler_add(self.draw_hud, (), 'WINDOW', 'POST_PIXEL')
        wm.modal_handler_add(self)
        return {'RUNNING_MODAL'}

    def reset(self):
        self.pos = Vector((0, 0, 0))
        self.vel = Vector((0, 0, 0))
        self.roll = self.pitch = self.yaw = 0.0
        self.thr = 0.0
        self.crash = 0.0
        self.apply()

    def apply(self):
        r = self.root
        r.location = self.pos * 1000.0           # escena en mm
        r.rotation_mode = 'XYZ'
        r.rotation_euler = (self.roll, self.pitch, self.yaw)

    def modal(self, context, event):
        t, v = event.type, event.value
        if t == 'ESC' and v == 'PRESS':
            self.finish(context)
            return {'FINISHED'}
        if t in self.KEYS:
            if v == 'PRESS':
                self.keys.add(t)
            elif v == 'RELEASE':
                self.keys.discard(t)
            return {'RUNNING_MODAL'}
        if v == 'PRESS':
            if t == 'R':
                self.reset()
                return {'RUNNING_MODAL'}
            if t == 'F':
                self.follow = not self.follow
                return {'RUNNING_MODAL'}
            if t == 'H':
                self.thr = HOVER
                return {'RUNNING_MODAL'}
        if t == 'TIMER':
            self.step()
        return {'PASS_THROUGH'}   # mouse libre para orbitar/zoom

    def step(self):
        now = time.perf_counter()
        dt = min(now - self.last, 0.05)
        self.last = now
        k = self.keys
        up = ('UP_ARROW' in k) or ('SPACE' in k)
        dn = ('DOWN_ARROW' in k) or ('LEFT_SHIFT' in k)
        self.thr = clamp(self.thr + (up - dn) * THR_RATE * dt, 0.0, 1.0)

        tp = (('W' in k) - ('S' in k)) * MAX_ANGLE   # pitch: + = nariz abajo (avanza)
        tr = (('D' in k) - ('A' in k)) * MAX_ANGLE   # roll:  + = derecha abajo
        yi = (('Q' in k) - ('E' in k))               # yaw:   Q izquierda, E derecha
        grounded = self.pos.z <= 1e-4
        if grounded and self.thr < HOVER * 0.9:
            tp = tr = 0.0
        a = min(1.0, ATT_RESP * dt)
        self.pitch += (tp - self.pitch) * a
        self.roll += (tr - self.roll) * a
        if not (grounded and self.thr < 0.05):
            self.yaw += yi * YAW_RATE * dt

        # Fuerzas: empuje en eje Z del cuerpo + gravedad + arrastre
        R = Euler((self.roll, self.pitch, self.yaw), 'XYZ').to_matrix()
        thrust = self.thr * TWR * MASS * G
        F = R @ Vector((0, 0, thrust)) + Vector((0, 0, -MASS * G))
        F += -DRAG * self.vel.length * self.vel
        self.vel += (F / MASS) * dt
        self.pos += self.vel * dt

        # Suelo
        if self.pos.z < 0:
            impact = -self.vel.z
            self.pos.z = 0.0
            if impact > CRASH_V:
                self.crash = 2.0
                self.thr = 0.0
                self.vel = Vector((0, 0, 0))
                self.roll = self.pitch = 0.0
            else:
                self.vel.z = 0.0
                self.vel.x *= 0.85
                self.vel.y *= 0.85
        if self.crash > 0:
            self.crash -= dt

        self.apply()
        if self.follow:
            self.r3d.view_location = self.pos * 1000.0
        self.area.tag_redraw()

    def draw_hud(self):
        fid = 0
        blf.size(fid, 16)
        lines = [
            f"GAS  {self.thr*100:5.1f} %   (hover ~{HOVER*100:.0f} %)",
            f"ALT  {self.pos.z:6.2f} m",
            f"VEL  {self.vel.length:5.1f} m/s   ({self.vel.length*3.6:4.0f} km/h)",
            "",
            "W/S pitch   A/D roll   Q/E yaw",
            "Espacio o Arriba: +gas   Shift o Abajo: -gas   H: gas de hover",
            "R reset   F seguir camara on/off   ESC salir",
        ]
        y = 30 + 24 * len(lines)
        for ln in lines:
            blf.color(fid, 0.95, 0.95, 0.95, 1.0)
            blf.position(fid, 24, y, 0)
            blf.draw(fid, ln)
            y -= 24
        if self.crash > 0:
            blf.size(fid, 48)
            blf.color(fid, 1.0, 0.25, 0.2, 1.0)
            blf.position(fid, 40, 240, 0)
            blf.draw(fid, "CRASH! (R para reset)")

    def finish(self, context):
        context.window_manager.event_timer_remove(self._timer)
        bpy.types.SpaceView3D.draw_handler_remove(self._handle, 'WINDOW')
        self.area.tag_redraw()


def menu_func(self, context):
    self.layout.separator()
    self.layout.operator(DRONE_OT_fly.bl_idname, icon='PLAY')


def register():
    old = getattr(bpy.types, "WM_OT_drone_fly", None)
    if old:
        bpy.utils.unregister_class(old)
    ns = bpy.app.driver_namespace
    if ns.get("drone_menu"):
        try:
            bpy.types.VIEW3D_MT_view.remove(ns["drone_menu"])
        except Exception:
            pass
    bpy.utils.register_class(DRONE_OT_fly)
    bpy.types.VIEW3D_MT_view.append(menu_func)
    ns["drone_menu"] = menu_func


if __name__ == "__main__":
    register()
