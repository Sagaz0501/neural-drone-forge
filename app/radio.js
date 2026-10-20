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

// ---------------- cuaterniones (ejes de la simulación: X adelante, Y izquierda, Z arriba; w, x, y, z) ----------------
export const qMul = (a, b) => [a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3], a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
  a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1], a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0]];
export const qNorm = (q) => { const n = Math.hypot(...q) || 1; return q.map((x) => x / n); };
export const qRot = (q, v) => { const r = qMul(qMul(q, [0, ...v]), [q[0], -q[1], -q[2], -q[3]]); return [r[1], r[2], r[3]]; };
export const qEuler = (roll, pitch, yaw) => {                     // R = Rz(yaw) Ry(pitch) Rx(roll), como sim.js
  const cr = Math.cos(roll / 2), sr = Math.sin(roll / 2), cp = Math.cos(pitch / 2), sp = Math.sin(pitch / 2), cy = Math.cos(yaw / 2), sy = Math.sin(yaw / 2);
  return [cy * cp * cr + sy * sp * sr, cy * cp * sr - sy * sp * cr, cy * sp * cr + sy * cp * sr, sy * cp * cr - cy * sp * sr];
};
export const aEuler = (q) => {
  const [w, x, y, z] = q;
  return { roll: Math.atan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y)), pitch: Math.asin(clip(2 * (w * y - z * x))), yaw: Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z)) };
};

// ---------------- la SENSACIÓN: Juego (mando y teclado) o Real (radio) ----------------
/**
 * Real = como una radio de verdad: gas ABSOLUTO (centro de la palanca = 50 % = el triple del hover en un dron de
 * empuje/peso 6), armar con el gas abajo, los rates de radio. Es lo de fábrica en una radio USB.
 * Juego = lo de fábrica en un mando (PS5/Xbox) y el teclado: la palanca del gas vuelve al centro, así que el centro
 * FLOTA (Angle/Horizon: la palanca pide subir o bajar, en m/s; Acro: el centro da el empuje de flotar, corregido por
 * la inclinación, y abajo del todo corta el gas para los flips), se arma solo, rates más vivos y lineales para una
 * palanca corta (el yaw casi lineal, como Fácil), Angle inclina más y endereza más rápido, y Acro se nivela despacio
 * si sueltas la palanca derecha (acro suave). Cada modo sigue siendo el suyo: Angle se nivela, Acro gira.
 */
export const SENSACIONES = ["juego", "real"];
export function sensacionDe(perfil, cfg = {}) {
  if (perfil?.sensacion) return perfil.sensacion;
  if (perfil) return perfil.tipo === "radio" ? "real" : "juego";
  return cfg.sensacionTeclado || "juego";
}
/** Rates para un mando (palanca corta, vuelve al centro): más RC rate y menos super rate = más lineales. */
export const PRESETS_JUEGO = {
  principiante: { rp: { rc: 1.3, sup: 0.3, expo: 0.1 }, yaw: { rc: 1.2, sup: 0.15, expo: 0 } },
  freestyle: { rp: { rc: 1.6, sup: 0.4, expo: 0.1 }, yaw: { rc: 1.5, sup: 0.2, expo: 0 } },
  carreras: { rp: { rc: 1.6, sup: 0.45, expo: 0.1 }, yaw: { rc: 1.4, sup: 0.25, expo: 0 } },
  cinematico: { rp: { rc: 1.0, sup: 0.2, expo: 0.15 }, yaw: { rc: 0.9, sup: 0.1, expo: 0 } },
};
/** Los números de la sensación Juego. */
export const JUEGO = {
  masAngulo: 10,     // Angle/Horizon: inclina 10° más que el ángulo del menú (55 -> 65°)
  kAng: 10,          // qué tan rápido endereza / inclina (Real: 7)
  vzSube: 10, vzBaja: 7,   // Angle/Horizon: m/s a fondo hacia arriba / abajo (el centro se queda a la misma altura)
  kv: 0.09,          // gas por cada m/s de error de subida
  nivelar: 1.6,      // Acro: se endereza solo (rad/s por rad) si sueltas la palanca derecha
  propwash: 0.5,     // el sacudón al bajar en tu aire, la mitad
  teclado: { sube: 4, baja: 9, max: 0.8 },  // teclado: la tecla llega a fondo en 0,25 s, suelta en 0,1 s; Acro hasta el 80 %
};
/** Los rates de un preset según la sensación (los tuyos, si los cambiaste, mandan en las dos). */
export function ratesDe(cfg, sens) {
  if (cfg.ratesPropias) return cfg.ratesPropias;
  const T = sens === "juego" ? PRESETS_JUEGO : PRESETS;
  return T[cfg.rates] || T.freestyle;
}
/** Teclado: la tecla (−1, 0, 1) sube de a poco hacia la palanca (rampa), y suelta rápido. */
export function rampa(actual, objetivo, dt, { sube = JUEGO.teclado.sube, baja = JUEGO.teclado.baja } = {}) {
  const d = objetivo - actual;
  const v = Math.abs(objetivo) < Math.abs(actual) || objetivo * actual < 0 ? baja : sube;
  return Math.abs(d) <= v * dt ? objetivo : actual + Math.sign(d) * v * dt;
}

/**
 * Un paso del dron de Angle / Horizon / Acro (cuerpo rígido; solo del freestyle, la IA nunca lo ve). Modifica c:
 * c = { s: { pos, vel, roll, pitch, yaw, throttle }, q, w, thr, tw, p (física: mass, g, twr, drag, hover, attResp, crashSpeed) }.
 * e = { gas 0..1, roll, pitch, yaw −1..1, armado, modo, fuerza }. o = { dt, sub, rates, gasCurva, angulo, juego }.
 * Real: el gas es ABSOLUTO (la curva de la radio). Juego: e.gas 0,5 = flotar (ver SENSACIONES). Devuelve { suelo, golpe }.
 */
export function pasoRadio(c, e, { dt = 0.02, sub = 4, rates = PRESETS.freestyle, gasCurva: gc = { mid: 0.5, expo: 0 }, angulo = 55, juego = false } = {}) {
  const s = c.s, p = c.p, h = dt / sub;
  let suelo = false, golpe = 0;
  const g = clip(e.gas * 2 - 1);                                   // Juego: la palanca −1..1 (centro = flotar)
  const quieta = Math.abs(e.roll) < 0.05 && Math.abs(e.pitch) < 0.05;
  for (let n = 0; n < sub; n++) {
    const bz0 = qRot(c.q, [0, 0, 1]);
    let pedido;
    if (!e.armado) pedido = 0;
    else if (!juego) pedido = gasCurva(e.gas, gc);
    else if (e.modo === "acro" || bz0[2] < 0.3) {                   // acro suave (o de cabeza en Horizon): el centro = flotar
      const hov = bz0[2] > 0.3 ? Math.min(0.9, p.hover / Math.max(0.6, bz0[2])) : p.hover;
      pedido = g >= 0 ? hov + g * (1 - hov) : hov * (1 + g);
    } else {                                                        // Angle / Horizon: la palanca pide subir o bajar
      const vz = g >= 0 ? g * JUEGO.vzSube : g * JUEGO.vzBaja;
      pedido = clip(p.hover / Math.max(0.35, bz0[2]) + JUEGO.kv * (vz - s.vel[2]), 0, 1);
      if (s.pos[2] <= 0.01 && g <= 0.05) pedido = Math.min(pedido, p.hover * 0.5);   // en el piso sin subir: se queda
    }
    pedido *= e.fuerza ?? 1;
    // los motores tardan ~35 ms en llegar; desarmado = motores apagados
    c.thr += (pedido - c.thr) * Math.min(1, h / 0.035);
    c.tw += h;
    const enPiso = s.pos[2] <= 0.01 && c.thr < p.hover * 0.6;      // en el piso sin gas: no se revuelca
    const eu = aEuler(c.q);
    const wc = e.armado ? pedirGiro(e.modo, e, eu, rates, juego ? { angulo: Math.min(85, angulo + JUEGO.masAngulo), kAng: JUEGO.kAng } : { angulo }) : [0, 0, 0];
    if (juego && e.armado && e.modo === "acro" && quieta && Math.abs(eu.roll) < 1.4 && Math.abs(eu.pitch) < 1.4) {
      wc[0] -= JUEGO.nivelar * eu.roll; wc[1] -= JUEGO.nivelar * eu.pitch;   // acro suave: se endereza despacio
    }
    if (e.armado && s.vel[2] < -2 && c.thr > 0.12) {                // propwash: bajar en tu propio aire te sacude
      const a = Math.min(1, (-s.vel[2] - 2) / 6) * 1.4 * (juego ? JUEGO.propwash : 1);
      wc[0] += a * Math.sin(c.tw * 37); wc[1] += a * Math.sin(c.tw * 29 + 1.3);
    }
    for (let i = 0; i < 3; i++) c.w[i] = enPiso ? 0 : e.armado ? c.w[i] + (wc[i] - c.w[i]) * Math.min(1, p.attResp * h) : c.w[i] * (1 - Math.min(1, 0.4 * h));
    if (enPiso) { const u = aEuler(c.q); c.q = qEuler(u.roll * 0.9, u.pitch * 0.9, u.yaw); }
    c.q = qNorm(c.q.map((x, i) => x + 0.5 * qMul(c.q, [0, ...c.w])[i] * h));
    const bz = qRot(c.q, [0, 0, 1]), T = c.thr * p.twr * p.mass * p.g, sp = Math.hypot(...s.vel);
    for (let i = 0; i < 3; i++) s.vel[i] += ((bz[i] * T - p.drag * sp * s.vel[i] - (i === 2 ? p.mass * p.g : 0)) / p.mass) * h;
    for (let i = 0; i < 3; i++) s.pos[i] += s.vel[i] * h;
    if (s.pos[2] < 0) {
      const imp = -s.vel[2];
      s.pos[2] = 0; suelo = true;
      if (imp > p.crashSpeed || bz[2] < 0.2 && Math.hypot(...s.vel) > 2) golpe = 99;
      s.vel[2] = 0; s.vel[0] *= 0.8; s.vel[1] *= 0.8;
      if (bz[2] < 0.5) c.w = [0, 0, 0];
    }
  }
  const eu = aEuler(c.q);
  s.roll = eu.roll; s.pitch = eu.pitch; s.yaw = eu.yaw; s.throttle = c.thr;
  return { suelo, golpe };
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
