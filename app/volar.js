// =====================================================================
// 🎮 VOLAR MIENTRAS ENTRENA: el freestyle (freestyle.html) adentro del juego, en una capa encima de todo (un iframe).
// El entrenamiento corre en el servidor (jugar.py: en Blender o en segundo plano), así que sigue igual mientras vuelas:
// abrir el freestyle no lo pausa ni lo detiene. Esta página tampoco se va: el Estudio sigue leyendo /api/lab y llamando
// los hooks de tu programa PBDMM (cada_generacion…). Lo que sí se queda quieto mientras vuelas: el garaje no se dibuja
// (main.js frame) y el reloj del negocio no avanza (los pedidos no se te vencen jugando).
// Adentro, el freestyle muestra cómo va tu IA (generación y éxito) y su "Volver al juego" cierra la capa.
// =====================================================================
import { t } from "./i18n.js";

export const abierto = () => !!document.getElementById("fs-capa");

export function abrirFreestyle() {
  if (abierto()) return;
  const capa = document.createElement("div");
  capa.id = "fs-capa";
  capa.style.cssText = "position:fixed;inset:0;z-index:10000;background:#0b1110";
  const f = document.createElement("iframe");
  f.src = "./freestyle.html?embebido=1";
  f.title = t("Freestyle");
  f.allow = "gamepad; autoplay; fullscreen";
  f.style.cssText = "border:0;width:100%;height:100%;display:block";
  capa.appendChild(f);
  document.body.appendChild(capa);
  window.__fsAbierto = true;
  f.addEventListener("load", () => f.contentWindow?.focus());
}

export function cerrarFreestyle() {
  document.getElementById("fs-capa")?.remove();
  window.__fsAbierto = false;
}

window.addEventListener("message", (e) => {
  if (e.origin === location.origin && e.data?.tipo === "freestyle-cerrar") cerrarFreestyle();
});
