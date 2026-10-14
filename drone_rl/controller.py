"""
Piloto "a mano" (controlador PD clásico), SIN red neuronal.

Sirve para dos cosas:
  1. Verificar que el entorno es resoluble (si este piloto llega a la meta, la IA también puede).
  2. Tener una referencia: la IA debería terminar igual o mejor que esto.
No esquiva obstáculos; solo va en línea recta a la meta.
"""
import numpy as np

from .physics import QuadParams, QuadState, throttle_to_action, yaw_frame


class PDPilot:
    def __init__(self, p: QuadParams, kp=1.2, kv=2.0, v_max=4.0):
        self.p, self.kp, self.kv, self.v_max = p, kp, kv, v_max

    def act(self, s: QuadState, goal: np.ndarray) -> np.ndarray:
        p = self.p
        # 1) velocidad deseada: proporcional a la distancia, con límite
        v_des = self.kp * (goal - s.pos)
        n = np.linalg.norm(v_des)
        if n > self.v_max:
            v_des *= self.v_max / n
        # 2) aceleración deseada: corregir la diferencia de velocidad
        acc = self.kv * (v_des - s.vel)
        acc_h = yaw_frame(acc, s.yaw)
        # 3) aceleración -> ángulos (inclinarse hacia donde quiero acelerar)
        pitch = np.arctan2(acc_h[0], p.g)
        roll = -np.arctan2(acc_h[1], p.g)
        # 4) gas: compensar gravedad + aceleración vertical, corregido por la inclinación
        thr = p.hover_throttle * (1 + acc[2] / p.g) / max(np.cos(roll) * np.cos(pitch), 0.5)
        return np.clip(np.array([throttle_to_action(float(np.clip(thr, 0, 1)), p), roll / p.max_angle, pitch / p.max_angle, 0.0]), -1, 1)
