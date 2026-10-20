// =====================================================================
// LA IMPRESIÓN 3D (lógica, sin pantalla): las impresoras Forja3D (piezas.json "impresion", con su "impresora3d"), el
// filamento (p.insumos.pla / petg / tpu / asa, en gramos) y los trabajos de impresión (p.impresiones).
//   · cuánto gasta una pieza (gramos = el peso impreso: la forma del chasis o el volumen de tu STL × densidad × relleno),
//   · cuánto tarda (horas del juego = gramos / g_h de la impresora × material × calidad + calentar),
//   · si cabe en la cama (la huella de la pieza contra cama_mm) y si la impresora sabe ese material (ASA = cerrada),
//   · si falla (primera capa, warping o spaghetti: la impresora, el material, la calidad y lo justa que quede en la cama).
// Un trabajo empieza (empezar: gasta el filamento, el azar decide al tiro si falla y dónde), avanza con el reloj del
// negocio (avanzar(horas): main.js cada segundo y la noche entera al dormir: las impresoras no duermen) y termina
// "listo" (la pieza queda en el inventario: u.diseno con su material, peso y aguante) o "fallo" (la cama queda ocupada
// con el desastre hasta que lo tiras: tirar(); el filamento hasta donde llegó se pierde, el resto se devuelve).
// test: node app/test_taller.mjs (sección impresión 3D)
// =====================================================================
import { t } from "./i18n.js";

/** 1 hora del juego en segundos reales (el reloj del negocio: 16 h despierto = 30 min). */
export const SEG_POR_HORA = (30 * 60) / 16;
export const RELLENOS = ["15", "25", "40", "60"];
export const CALIDADES = ["rapida", "normal", "fina"];
const FALLOS = () => ({
  capa1: t("la primera capa no se pegó a la cama"),
  warping: t("las esquinas se levantaron (warping)"),
  spaghetti: t("se despegó a mitad y quedó un nido de filamento (spaghetti)"),
});
export const nombreFallo = (k) => FALLOS()[k] || k;

const cfgDe = (cat) => cat.impresion_cfg;
export const esImpresora = (pz) => !!pz?.impresora3d;
/** Las impresoras del catálogo. */
export const catalogo = (cat) => (cat.impresion || []).filter(esImpresora);
export const impresora = (cat, id) => catalogo(cat).find((x) => x.id === id) || null;
/** Las impresoras que tienes (la mejor al final). */
export const tuyas = (p, cat) => catalogo(cat).filter((x) => (p.herramientas || []).includes(x.id));
export const material = (cat, k) => cfgDe(cat).materiales[k] || null;
export const filamento = (p, k) => +(p.insumos?.[k] || 0);

/**
 * Lo que se imprime: { tipo: "chasis", forma } | { tipo: "chasis", stl: meta } | { tipo: "canopy", masa_g, stl? } |
 * { tipo: "montaje", g }. La huella [ancho, largo, alto] en mm.
 */
export function huella(cat, que) {
  const H = cfgDe(cat).huella_mm;
  if (que.stl?.tam_mm) return [...que.stl.tam_mm];
  if (que.tipo === "chasis") return [...(H[que.forma] || H.x)];
  return [...(H[que.tipo] || H.canopy)];
}
/** ¿Cabe en la cama? (de frente o girada 90°) -> { ok, msg }. */
export function cabe(imp, hu) {
  const [X, Y, Z] = imp.impresora3d.cama_mm, [a, b, c] = hu;
  const ok = c <= Z && ((a <= X && b <= Y) || (b <= X && a <= Y));
  return { ok, msg: ok ? "" : t("No cabe en la cama: la pieza mide {a} × {b} mm y la cama, {x} × {y} mm.", { a: Math.round(a), b: Math.round(b), x: X, y: Y }), justa: Math.max(a / X, b / Y, c / Z) };
}
/** ¿Esta impresora imprime este material (y esta pieza en él)? -> texto de error o null. */
export function puedeMaterial(cat, imp, k, que = null) {
  const m = material(cat, k);
  if (!m) return t("Ese material no existe.");
  if (!imp.impresora3d.materiales.includes(k)) return m.necesita_cerrada ? t("El {m} se deforma al aire: necesita una impresora cerrada.", { m: m.nombre }) : t("La {imp} no imprime {m}.", { imp: imp.nombre, m: m.nombre });
  if (que?.tipo === "chasis" && !m.chasis) return t("Un chasis de {m} se dobla: no sirve.", { m: m.nombre });
  return null;
}

/** Gramos de filamento de la pieza. */
export function gramos(cat, que, k, relleno = "25") {
  const C = cfgDe(cat), m = material(cat, k), R = C.relleno[relleno] || C.relleno["25"];
  if (que.tipo === "montaje") return que.g;
  if (que.stl?.volumen_cm3) return Math.max(que.tipo === "chasis" ? 40 : 4, Math.round(que.stl.volumen_cm3 * m.densidad * (0.3 + 0.6 * (+relleno / 100))));
  if (que.tipo === "chasis") return Math.round(C.masa_chasis_g * R.masa * (m.densidad / 1.24));
  return Math.max(3, Math.round((que.masa_g || 10) * R.masa * (m.densidad / 1.24)));
}
/** Horas del juego que tarda. */
export function horas(cat, imp, g, k, calidad = "normal") {
  const C = cfgDe(cat), m = material(cat, k), Q = C.calidad[calidad] || C.calidad.normal;
  return C.calentar_h + (g / imp.impresora3d.g_h) * Q.tiempo / m.vel;
}
/** La probabilidad de que falle (0-1). */
export function probFallo(cat, imp, k, calidad = "normal", justa = 0.5) {
  const C = cfgDe(cat), m = material(cat, k), Q = C.calidad[calidad] || C.calidad.normal, I = imp.impresora3d;
  const fm = I.cerrada ? (m.fallo_cerrada ?? Math.min(m.fallo, 1.4)) : m.fallo;
  const borde = 1 + Math.max(0, justa - 0.9) / 0.1;                       // casi del tamaño de la cama: se levantan las puntas
  return Math.min(0.6, I.fallo * fm * Q.fallo * borde);
}
/** Cómo queda un chasis impreso (pisa los números del catálogo en parts.js, por PT.build). */
export function chasisImpreso(cat, que, k, relleno = "25", calidad = "normal") {
  const C = cfgDe(cat), m = material(cat, k), R = C.relleno[relleno] || C.relleno["25"], Q = C.calidad[calidad] || C.calidad.normal;
  const dur = R.dur * Q.dur;
  return { masa_g: gramos(cat, que, k, relleno), durabilidad: Math.round(m.chasis.durabilidad * dur), aguante_ms: +(m.chasis.aguante_ms * (0.85 + 0.15 * dur)).toFixed(2), rigidez: m.chasis.rigidez };
}

/**
 * Todo lo que hay que saber antes de imprimir: { ok, error, g, h, prob, hu, cabe }. o = { impresora, material, relleno, calidad }.
 */
export function plan(p, cat, que, o) {
  const imp = impresora(cat, o.impresora);
  if (!imp || !(p.herramientas || []).includes(imp.id)) return { ok: false, error: t("Necesitas una impresora 3D (🛒 Tienda → Impresión 3D).") };
  const errM = puedeMaterial(cat, imp, o.material, que);
  if (errM) return { ok: false, error: errM };
  const hu = huella(cat, que), cb = cabe(imp, hu), g = gramos(cat, que, o.material, o.relleno);
  const out = { g, h: horas(cat, imp, g, o.material, o.calidad), prob: probFallo(cat, imp, o.material, o.calidad, cb.justa), hu, cabe: cb, imp };
  if (!cb.ok) return { ...out, ok: false, error: cb.msg };
  if (ocupada(p, imp.id)) return { ...out, ok: false, error: estaOcupada(p, imp) };
  if (filamento(p, o.material) + 1e-9 < g) return { ...out, ok: false, error: t("Te falta filamento: la pieza gasta {g} g de {m} y tienes {n} g.", { g, m: material(cat, o.material).nombre, n: Math.floor(filamento(p, o.material)) }) };
  return { ...out, ok: true, error: null };
}
const estaOcupada = (p, imp) => ocupada(p, imp.id).estado === "fallo" ? t("La cama de la {imp} tiene una impresión fallida: tírala primero.", { imp: imp.nombre }) : t("La {imp} está imprimiendo.", { imp: imp.nombre });

/** El trabajo que ocupa una impresora (imprimiendo o fallido sin tirar), o null. */
export const ocupada = (p, impId) => (p.impresiones || []).find((j) => j.impresora === impId && (j.estado === "imprimiendo" || j.estado === "fallo")) || null;
/** El trabajo de una unidad o de la carcasa de un dron. */
export const trabajoDe = (p, ref) => (p.impresiones || []).find((j) => (ref.uid ? j.que.uid === ref.uid : j.que.dron === ref.dron && j.que.tipo === ref.tipo) && j.estado !== "listo") || null;
export const progreso = (j) => Math.min(1, j.hecho_h / j.h);
/** Horas del juego que le faltan (hasta terminar, o hasta fallar: eso no se sabe). */
export const faltan = (j) => Math.max(0, j.h - j.hecho_h);

/**
 * Empezar a imprimir: gasta el filamento y crea el trabajo. rng = el azar (inyectable en las pruebas).
 * que.uid = la unidad del chasis; que.dron = el dron (carcasa). Devuelve el trabajo o un texto de error.
 */
export function empezar(p, cat, que, o, rng = Math.random) {
  const pl = plan(p, cat, que, o);
  if (!pl.ok) return pl.error;
  const m = material(cat, o.material);
  p.insumos[o.material] = +(filamento(p, o.material) - pl.g).toFixed(1);
  let fallo = null;
  if (rng() < pl.prob) {
    const ts = Object.entries(m.tipos), tot = ts.reduce((s, [, w]) => s + w, 0);
    let x = rng() * tot, tipo = ts[0][0];
    for (const [k, w] of ts) { if ((x -= w) <= 0) { tipo = k; break; } }
    const [a, b] = { capa1: [0.02, 0.08], warping: [0.2, 0.6], spaghetti: [0.3, 0.9] }[tipo];
    fallo = { tipo, en: +(a + rng() * (b - a)).toFixed(3) };
  }
  p.sigImp = (p.sigImp || 0) + 1;
  const j = { id: "i" + p.sigImp, impresora: pl.imp.id, que, material: o.material, relleno: o.relleno, calidad: o.calidad, g: pl.g, h: +pl.h.toFixed(3),
    hecho_h: 0, estado: "imprimiendo", fallo, multicolor: !!pl.imp.impresora3d.multicolor, dia: p.negocio?.dia ?? null };
  p.impresiones = [...(p.impresiones || []).filter((x) => x.estado !== "listo").slice(-20), j];
  return j;
}

/**
 * Pasaron `h` horas del juego: avanzan las impresoras. Devuelve [{ j, ev: "listo" | "fallo" }]. Al terminar bien, la
 * pieza queda puesta (acabar). Al fallar, se devuelve el filamento que no alcanzó a gastar.
 */
export function avanzar(p, cat, h) {
  const ev = [];
  for (const j of p.impresiones || []) {
    if (j.estado !== "imprimiendo") continue;
    j.hecho_h = Math.min(j.h, j.hecho_h + h);
    if (j.fallo && j.hecho_h >= j.h * j.fallo.en) {
      j.hecho_h = j.h * j.fallo.en; j.estado = "fallo";
      const perdido = Math.round(j.g * j.fallo.en);
      p.insumos[j.material] = +(filamento(p, j.material) + (j.g - perdido)).toFixed(1);
      j.perdido = perdido;
      ev.push({ j, ev: "fallo" });
    } else if (j.hecho_h >= j.h) { j.estado = "listo"; acabar(p, cat, j); ev.push({ j, ev: "listo" }); }
  }
  return ev;
}
/** Tirar la impresión fallida (la cama queda libre). */
export function tirar(p, id) {
  const j = (p.impresiones || []).find((x) => x.id === id);
  if (!j || j.estado !== "fallo") return t("No hay nada que tirar.");
  j.estado = "tirado";
  return null;
}
/** Cancelar una impresión en curso: lo impreso se pierde, el resto del filamento vuelve. */
export function cancelar(p, id) {
  const j = (p.impresiones || []).find((x) => x.id === id);
  if (!j || j.estado !== "imprimiendo") return t("No está imprimiendo.");
  const perdido = Math.round(j.g * progreso(j));
  p.insumos[j.material] = +(filamento(p, j.material) + (j.g - perdido)).toFixed(1);
  j.estado = "tirado"; j.perdido = perdido;
  return null;
}

/** La pieza terminada: el chasis con su diseño impreso, la carcasa puesta en su dron, el soporte de TPU al inventario. */
function acabar(p, cat, j) {
  const q = j.que, mat = material(cat, j.material);
  if (q.tipo === "chasis") {
    const u = p.inventario.find((x) => x.uid === q.uid);
    if (!u) return;
    const st = chasisImpreso(cat, q, j.material, j.relleno, j.calidad);
    u.diseno = { ...(q.diseno || { tipo: "forma", forma: q.forma || "x" }), material: j.material, relleno: j.relleno, calidad: j.calidad, ...st, multicolor: j.multicolor, impresora: j.impresora };
    if (q.stl) Object.assign(u.diseno, { masa_g: j.g, radio_m: q.stl.radio_m, helice_max: q.stl.helice_max });
    u.vida = 100;
    for (const d of p.drones || []) if (d.banco?.instalado?.chasis === u.uid) d.banco.instalado.chasis = null;   // la pieza nueva hay que montarla
  } else if (q.tipo === "canopy") {
    const d = (p.drones || []).find((x) => x.id === q.dron);
    if (d) d.canopy = { ...q.canopy, material: j.material, masa_g: Math.max(1, Math.round((q.canopy.masa_g || 10) * mat.densidad / 1.24)) };
  }
}
