// =====================================================================
// LOS REQUISITOS: qué pide un pedido (o una misión) y si un dron lo cumple. Lo usan el briefing de un pedido
// (main.js), el celular (¿qué me falta? / qué dron mando: celular.js) y PBDMM 2 (revisar(d, m): pbdmm.js).
// Sin pantalla ni Three.js: se prueba en node (app/test_negocio.mjs).
//
//   r = { calidad_min, protectores, twr_min, barometro, alcance_m }   (app/data/misiones.json "requisitos",
//        o los que arma negocio.js según la dificultad)
//   st = stats del dron armado (parts.js calcular): twr, calidad, alcance_m, minutos, ayudas, nitidez…
//   ctx = { segundos: tiempo grabando, viento (m/s), alcance: metros hasta el punto más lejano de las rutas }
// Cada línea: [clase, texto, duro]  clase "" = cumple · "meh" = justo · "no" = no cumple; duro = el cliente no acepta.
// =====================================================================
import { t, num } from "./i18n.js";

const fmt = (x, d = 1) => num(x, d);
const metros = (m) => (m >= 1000 ? fmt(m / 1000) + " km" : Math.round(m) + " m");

/** Empuje/peso que hace falta con un viento (m/s): la finca (2,5 m/s) pide 2,2. */
export const twrParaViento = (v) => (v > 0 ? Math.round((1.6 + 0.24 * v) * 10) / 10 : 0);

/** Minutos de batería que pide un pedido: lo que se graba + ir y volver (~80 s), más con viento. */
export const minutosNecesarios = (segundos, viento = 0) => ((segundos + 80) / 60) * (1 + 0.15 * viento);

export function requisitos(r = {}, st, ctx = {}) {
  const req = [];
  if (!st) return [["no", t("Ese dron no está armado (le faltan piezas)"), true]];
  const ay = st.ayudas || [];
  if (r.calidad_min) req.push([st.calidad >= r.calidad_min ? "" : "no", t("Cámara: calidad {c} (el cliente pide {min} o más)", { c: st.calidad, min: r.calidad_min }), st.calidad < r.calidad_min]);
  if (r.protectores) req.push([ay.includes("protectores") ? "" : "no", ay.includes("protectores") ? t("Protectores de hélice: hay gente cerca ✓") : t("Protectores de hélice: hay gente cerca, el cliente no acepta sin ellos"), !ay.includes("protectores")]);
  if (ctx.alcance !== undefined) {
    const alc = ctx.alcance, d = metros(st.alcance_m), m = fmt(alc, 0);
    req.push([st.alcance_m >= alc ? "" : "no", st.alcance_m >= alc ? t("Radio: llega a {d} (las tomas llegan a {m} m de la base)", { d, m }) : t("Radio: llega a {d} (las tomas llegan a {m} m de la base: failsafe asegurado)", { d, m }), false]);
  }
  if (r.twr_min) req.push([st.twr >= r.twr_min ? "" : "no", t("Empuje/peso {twr} (con este viento hace falta {min} o más)", { twr: fmt(st.twr, 2), min: fmt(r.twr_min, 1) }), false]);
  if (ctx.segundos !== undefined) {
    const need = minutosNecesarios(ctx.segundos, ctx.viento ?? 0);
    req.push([st.minutos >= need ? "" : st.minutos >= need * 0.75 ? "meh" : "no", t("Batería: {m} min flotando (tomas, ir entre ellas y volver: ~{need} min)", { m: fmt(st.minutos), need: fmt(need) }), false]);
  }
  const baro = ay.includes("altura");
  req.push([baro ? "" : r.barometro ? "no" : "meh", baro ? t("Mantiene la altura solo (barómetro)") : t("Sin barómetro: el gas es tuyo todo el tiempo (difícil)"), false]);
  if (st.nitidez !== undefined) req.push([st.nitidez > 0.85 ? "" : "meh", t("Nitidez {n} %", { n: Math.round(st.nitidez * 100) }) + (st.nitidez > 0.85 ? "" : " " + t("(gomas antivibración, ESC con filtro RPM o un gimbal la suben)")), false]);
  return req;
}

/**
 * Qué tan bien cumple un dron: { ok (nada duro ni "no"), duros, faltan (los "no"), justos (los "meh"), puntos (para
 * ordenar drones: más = mejor) }. Para el celular ("¿qué me falta?") y PBDMM (revisar).
 */
export function cumple(r, st, ctx) {
  const L = requisitos(r, st, ctx);
  const faltan = L.filter((x) => x[0] === "no"), justos = L.filter((x) => x[0] === "meh"), duros = L.filter((x) => x[2]);
  return { lineas: L, ok: !faltan.length, duros, faltan, justos, puntos: (st ? 10 : 0) - 3 * faltan.length - justos.length - 5 * duros.length };
}

/** El mejor dron del hangar para unos requisitos: [{d, c}] ordenados (el primero = el que conviene mandar). */
export function mejoresDrones(drones, statsDe, r, ctx) {
  return drones.map((d) => ({ d, c: cumple(r, statsDe(d), ctx) })).sort((a, b) => b.c.puntos - a.c.puntos);
}
