// =====================================================================
// LA DEMO (pedido de Santiago, 19-10-2026). Termina con el SEGUNDO dron: el de madera se queda en el hangar y armas otro
// para el video de la finca de Don Ernesto (viento 2,5 m/s: empuje/peso ≥ 2,2 y barómetro). Al entregarlo se abren los
// simuladores siguientes (E7, E8), pero al tocar «Comprar» sale el final de la demo: lo que lograste + el juego completo.
// Para el juego completo: ACTIVA = false (y listo: todo lo de abajo deja de bloquear).
// =====================================================================
import * as ESC from "./escenarios.js";

export const ACTIVA = true;
/** El último simulador que se compra en la demo (E6 · Video con ruta = «el nivel 6»). */
export const HASTA = "video_ruta";
/** Los pedidos especiales de la campaña que trae la demo: la casa (Doña Marta) y la finca (Don Ernesto, el final). */
export const PEDIDOS = ["casa_venta", "finca"];
export const FINAL = "finca";
/** Los enlaces del final (cámbialos cuando exista la página de Steam). */
export const STEAM_URL = "https://store.steampowered.com/";
export const WEB_URL = "https://sagaz0501.github.io/neural-drone-forge/";

/** ¿Ya entregó el último pedido de la demo (la finca)? */
export const terminada = (p) => ACTIVA && p?.hechos?.[FINAL] !== undefined && p.hechos[FINAL] >= 1;

/** ¿Este simulador va después del límite de la demo? (E7 en adelante: los que piden E6 o algo que lo pide) */
export function fuera(E, id) {
  if (!ACTIVA) return false;
  for (let e = ESC.escenario(E, id), n = 0; e && n < 30; e = e.requiere && ESC.escenario(E, e.requiere), n++)
    if (e.requiere === HASTA) return true;
  return false;
}

/**
 * Qué pasa con un simulador en la demo: null (normal), "finca" (cerrado: primero el video de la finca) o "fin" (está
 * abierto, pero comprarlo = el final de la demo). Solo los que ya serían comprables (los demás siguen 🔒 normal).
 */
export function escenario(p, E, id) {
  if (!fuera(E, id) || ESC.estado(p, E, id) !== "comprable") return null;
  return terminada(p) ? "fin" : "finca";
}

/** ¿Este pedido especial de la campaña queda para el juego completo? */
export const pedidoFuera = (id) => ACTIVA && !PEDIDOS.includes(id);

/**
 * La línea del 🎯 «¿Qué sigo?» después del tutorial: guía al segundo dron y a la finca. s = { finca: el pedido especial
 * llegó, sirven: nombres de los drones que cumplen lo que pide la finca, e6: tiene Video con ruta }. Devuelve html o null.
 */
export function pista(p, s, t) {
  if (!ACTIVA || !p?.negocio) return null;
  if (terminada(p)) return p.demoFin ? null : t("🔓 Se abrió un simulador nuevo: 💻 → 🎮 Simuladores.");
  if (!s.finca) return null;
  if (!s.sirven.length) return t("🌾 La finca pide otro dron (empuje/peso ≥ 2,2 + barómetro): «+ Nuevo dron». El de madera se queda.");
  if (!s.e6) return t("🎮 Compra <b>E6 · Video con ruta</b> en Simuladores (o vuélalo tú).");
  return t("🌾 Vuela el video de la finca con «{d}»: 💻 → Mensajes → Don Ernesto.", { d: s.sirven[0] });
}
