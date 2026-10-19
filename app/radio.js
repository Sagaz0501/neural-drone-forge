// =====================================================================
// LA RADIO DEL FREESTYLE (lógica pura, sin pantalla: test_radio.mjs). Solo el jugador: la IA nunca ve esto.
//   · rates como Betaflight ("Betaflight" clásico: RC rate, super rate, expo) y la curva del gas (thr_mid, thr_expo)
//   · los modos de vuelo de una radio: Fácil (el de siempre, gas al centro = flotar), Angle, Horizon y Acro
//   · radios por USB (RadioMaster, TBS, Jumper… en modo joystick = un Gamepad con 4-8 ejes): calibrar mín/centro/máx
//     por eje, asignar cada canal (gas, yaw, pitch, roll, armar, modo), invertir, zona muerta, Modo 2 / Modo 1
// Las palancas salen en la convención del juego: gas 0..1 (absoluto), roll + = derecha, pitch + = adelante, yaw + = izquierda.
// =====================================================================

export const MODOS = ["facil", "angle", "horizon", "acro"];

/** Rates por eje: rc (RC rate), sup (super rate), expo. Máximo = 200·rc/(1 − sup) °/s. */
export const PRESETS = {
  principiante: { rp: { rc: 0.8, sup: 0.45, expo: 0.25 }, yaw: { rc: 0.8, sup: 0.35, expo: 0.2 } },
  freestyle: { rp: { rc: 1.0, sup: 0.7, expo: 0.0 }, yaw: { rc: 1.0, sup: 0.65, expo: 0.0 } },
  carreras: { rp: { rc: 1.0, sup: 0.65, expo: 0.15 }, yaw: { rc: 1.0, sup: 0.55, expo: 0.1 } },
  cinematico: { rp: { rc: 0.6, sup: 0.35, expo: 0.35 }, yaw: { rc: 0.5, sup: 0.25, expo: 0.3 } },
};

const clip = (x, a = -1, b = 1) => Math.max(a, Math.min(b, x));

/** La curva de Betaflight ("Betaflight" rates): palanca −1..1 -> °/s. */
export function rateBF(x, { rc = 1, sup = 0.7, expo = 0 } = {}) {
  x = clip(x);
  const ax = Math.abs(x);
  if (expo) x = x * ax * ax * ax * expo + x * (1 - expo);
  let rcRate = rc;
  if (rcRate > 2) rcRate += 14.54 * (rcRate - 2);
  let r = 200 * rcRate * x;
  if (sup) r *= 1 / clip(1 - ax * sup, 0.01, 1);
  return Math.max(-1998, Math.min(1998, r));
}
/** La velocidad máxima de giro de una curva (palanca a fondo), en °/s. */
export const maxRate = (r) => Math.abs(rateBF(1, r));

/** La curva del gas (thr_mid / thr_expo de Betaflight): 0..1 -> 0..1. mid = el punto donde la curva se aplana (hover). */
export function gasCurva(t, { mid = 0.5, expo = 0 } = {}) {
  t = clip(t, 0, 1);
  const d = t - mid, y = d < 0 ? mid : 1 - mid;
  if (!y) return t;
  return clip(mid + d * (1 - expo + (expo * d * d) / (y * y)), 0, 1);
}

/** Un eje calibrado: crudo -> −1..1 (centrado) o 0..1 (gas). cal = { min, cen, max }. */
export function normEje(v, cal = { min: -1, cen: 0, max: 1 }, { inv = false, dz = 0, gas = false } = {}) {
  if (v == null || Number.isNaN(v)) return gas ? 0 : 0;
  const { min = -1, max = 1 } = cal;
  let out;
  if (gas) out = max === min ? 0 : (v - min) / (max - min);
  else {
    const cen = cal.cen ?? (min + max) / 2;
    out = v >= cen ? (max === cen ? 0 : (v - cen) / (max - cen)) : (cen === min ? 0 : (v - cen) / (cen - min));
  }
  if (inv) out = gas ? 1 - out : -out;
  if (gas) return clip(out, 0, 1);
  out = clip(out);
  if (dz) out = Math.abs(out) < dz ? 0 : Math.sign(out) * (Math.abs(out) - dz) / (1 - dz);
  return out;
}

/** Calibrar: se van juntando mín y máx mientras mueves las palancas; al final, el centro. */
export function nuevaCalibracion(n) { return Array.from({ length: n }, () => ({ min: Infinity, max: -Infinity, cen: 0 })); }
export function calibrarMuestra(cal, axes) {
  axes.forEach((v, i) => { if (!cal[i]) cal[i] = { min: Infinity, max: -Infinity, cen: 0 }; cal[i].min = Math.min(cal[i].min, v); cal[i].max = Math.max(cal[i].max, v); });
  return cal;
}
/** Cerrar la calibración: el centro = donde están ahora; un eje que casi no se movió queda como −1..1. */
export function calibrarCentro(cal, axes) {
  return cal.map((c, i) => {
    const ok = Number.isFinite(c.min) && Number.isFinite(c.max) && c.max - c.min > 0.3;
    return ok ? { min: c.min, max: c.max, cen: clip(axes[i] ?? 0, c.min, c.max) } : { min: -1, max: 1, cen: 0 };
  });
}

/** ¿Es una radio (EdgeTX/OpenTX/TBS en modo joystick) o un mando de consola? */
export const esRadio = (gp) => !!gp && (gp.mapping !== "standard" || /radiomaster|tbs|tango|jumper|edgetx|opentx|frsky|taranis|boxer|zorro|pocket|tx16|tx12|flysky|betafpv|lite radio/i.test(gp.id || ""));

/**
 * El perfil de un control: qué eje es cada canal. Radio (AETR, lo de fábrica en EdgeTX): 0 roll, 1 pitch, 2 gas, 3 yaw,
 * 4 armar (interruptor SA/SF), 5 modo. Mando (PS5/Xbox, Modo 2): izq. gas/yaw, der. pitch/roll; armar = L1/LB (alterna).
 */
export function perfilPorDefecto(gp) {
  const n = gp?.axes?.length || 4;
  if (esRadio(gp)) return {
    tipo: "radio", ejes: { roll: { i: 0 }, pitch: { i: 1, inv: false }, gas: { i: Math.min(2, n - 1) }, yaw: { i: Math.min(3, n - 1), inv: true } },
    armar: n > 4 ? { tipo: "eje", i: 4, umbral: 0.5 } : { tipo: "boton", i: 0, alterna: true },
    modo: n > 5 ? { tipo: "eje", i: 5 } : null, dz: 0.01, cal: null,
  };
  return {
    tipo: "mando", ejes: { yaw: { i: 0, inv: true }, gas: { i: 1, inv: true }, roll: { i: 2 }, pitch: { i: 3, inv: true } },
    armar: { tipo: "boton", i: 4, alterna: true }, modo: null, dz: 0.06, cal: null,
  };
}

/** Modo 1: el gas y el pitch se cambian de palanca (en un mando de consola). */
function modo1(perfil) {
  if (perfil.tipo !== "mando") return perfil.ejes;
  const e = perfil.ejes;
  return { ...e, gas: e.pitch && { ...e.gas, i: e.pitch.i }, pitch: e.gas && { ...e.pitch, i: e.gas.i } };
}

/**
 * Leer un control con su perfil: { gas 0..1, roll, pitch, yaw −1..1, armar (true/false/null si es botón que alterna),
 * modo (null o "angle"/"horizon"/"acro" por un interruptor de 3 posiciones), botones }.
 * Un mando de consola: el gas de la palanca izquierda que vuelve al centro = 50 % (como en los simuladores).
 */
export function leer(gp, perfil, { mando = 2 } = {}) {
  if (!gp || !perfil) return null;
  const ax = gp.axes || [], cal = perfil.cal || [];
  const ejes = mando === 1 ? modo1(perfil) : perfil.ejes;
  const eje = (nom, gas = false) => {
    const e = ejes[nom];
    if (!e || ax[e.i] == null) return gas ? 0 : 0;
    const c = cal[e.i] || { min: -1, cen: 0, max: 1 };
    return normEje(ax[e.i], c, { inv: !!e.inv, dz: gas ? 0 : perfil.dz || 0, gas });
  };
  const out = { gas: eje("gas", true), roll: eje("roll"), pitch: eje("pitch"), yaw: eje("yaw"), armar: null, modo: null,
    botones: (gp.buttons || []).map((b) => !!(b && (b.pressed || b.value > 0.5))) };
  const A = perfil.armar;
  if (A?.tipo === "eje" && ax[A.i] != null) out.armar = normEje(ax[A.i], cal[A.i], { gas: true, inv: !!A.inv }) > (A.umbral ?? 0.5);
  else if (A?.tipo === "boton" && !A.alterna) out.armar = !!out.botones[A.i];
  const Mo = perfil.modo;
  if (Mo?.tipo === "eje" && ax[Mo.i] != null) {
    const v = normEje(ax[Mo.i], cal[Mo.i], { gas: true, inv: !!Mo.inv });
    out.modo = v < 0.33 ? "angle" : v < 0.67 ? "horizon" : "acro";
  }
  return out;
}

/**
 * Armar como Betaflight: no arma con el gas arriba (> 5 %), ni si el interruptor ya estaba en "armado" al conectar.
 * est = { armado, antes } (antes = cómo estaba el interruptor). Devuelve { armado, motivo } (motivo = por qué no armó).
 */
export function armado(est, pedido, gas) {
  const subio = pedido && !est.antes;                    // el interruptor recién pasó a "armar"
  est.antes = pedido;
  if (!pedido) { est.armado = false; return { armado: false, motivo: null }; }
  if (est.armado) return { armado: true, motivo: null };
  if (subio && gas <= 0.05) { est.armado = true; return { armado: true, motivo: null }; }
  return { armado: false, motivo: gas > 0.05 ? "gas" : "switch" };
}

/**
 * Lo que pide el piloto en Angle/Horizon/Acro: velocidades de giro (rad/s, ejes del dron: roll, pitch, yaw).
 * Angle: la palanca pide un ÁNGULO (máx `angulo` grados) y el dron se nivela solo; Acro: la palanca pide GIRAR (rates);
 * Horizon: Angle cerca del centro y Acro hacia los extremos (flips a fondo). eu = { roll, pitch } actuales (rad).
 */
export function pedirGiro(modo, st, eu, rates, { angulo = 55, kAng = 7 } = {}) {
  const R = (x, r) => (rateBF(x, r) * Math.PI) / 180;
  const acro = [R(st.roll, rates.rp), R(st.pitch, rates.rp), R(st.yaw, rates.yaw)];
  if (modo === "acro") return acro;
  const amax = (angulo * Math.PI) / 180;
  // en el dron: roll + = derecha (el lado izquierdo sube), pitch + = nariz abajo (adelante)
  const ang = [kAng * (st.roll * amax - eu.roll), kAng * (st.pitch * amax - eu.pitch), acro[2]];
  if (modo === "angle") return ang;
  const f = Math.min(1, Math.max(Math.abs(st.roll), Math.abs(st.pitch)));   // horizon: cuánto manda el acro
  const k = f * f;
  return [ang[0] * (1 - k) + acro[0] * k, ang[1] * (1 - k) + acro[1] * k, acro[2]];
}

/** El asistente: ¿qué eje se movió más desde `base`? (sin los ya usados) -> { i, d } (d = cuánto y hacia dónde) o null. */
export function detectarEje(base, ahora, usados = [], minimo = 0.35) {
  let mejor = null;
  ahora.forEach((v, i) => {
    if (usados.includes(i) || base[i] == null) return;
    const d = v - base[i];
    if (Math.abs(d) >= minimo && (!mejor || Math.abs(d) > Math.abs(mejor.d))) mejor = { i, d };
  });
  return mejor;
}
/** ¿Qué botón se apretó desde `antes`? -> índice o −1. */
export const detectarBoton = (antes, ahora) => ahora.findIndex((b, i) => b && !antes[i]);
