// =====================================================================
// EL OFICIO DEL TALLER (la lógica, sin pantalla: corre en node, app/test_taller.mjs). La pantalla es mesa.js.
//
//   Envíos: lo que compras llega en caja; lo barato del barrio llega el mismo día, lo bueno al otro día o en dos.
//   Tornillos: mantener apretado hasta el "clic"; si sigues apretando, la rosca se barre.
//   Soldar: la estación se prende y tarda en calentar; la punta se ensucia y se limpia; el flux ayuda a que el
//   estaño moje; el cautín calienta el pad y el estaño se derrite SOLO si el pad está caliente. Cada junta sale
//   buena, fría (funciona y falla después), con un puente de estaño (corto con el pad de al lado) o con el pad
//   levantado (mucho calor). Las cuentas son las mismas siempre (sin azar): lo que haces es lo que sale.
//
// En el dron: d.banco.juntas = { "a|b": { q: "sin"|"buena"|"fria"|"puente"|"levantado"|"enchufado", n, qs: [...] } }
// (n = cuántas juntas lleva ese cable: los motores 3). Un cable sin entrada en juntas (partidas viejas) = soldado bien.
// =====================================================================

// ---------------- envíos ----------------
/** Cuántos días tarda en llegar una pieza: la del barrio (etapa 1) hoy, la buena (2-3) mañana, la de lujo en 2. */
export const diasEnvio = (pz) => pz?.envio_dias ?? ((pz?.etapa ?? 1) <= 1 ? 0 : (pz?.etapa ?? 1) <= 3 ? 1 : 2);
export const hoy = (p) => p?.negocio?.dia ?? 1;
/** La unidad todavía no llega (viene en camino). */
export const enCamino = (p, u) => u?.llega != null && u.llega > hoy(p);
/** La unidad llegó pero sigue en su caja (hay que abrirla en la mesa). */
export const enCaja = (p, u) => !!u?.caja && !enCamino(p, u);

// ---------------- tornillos ----------------
export const TORNILLO = { dur: 0.85, gracia: 0.45 };
export const tornillo0 = () => ({ p: 0, sobre: 0, estado: "suelto" });
/**
 * Un paso de atornillar. apretando = el botón está abajo. Devuelve el evento que pasó ("clic" cuando entra del todo,
 * "barrido" si seguiste apretando después del clic) o null.
 */
export function tickTornillo(T, dt, apretando, dur = TORNILLO.dur) {
  if (T.estado === "apretado" && !apretando) return null;
  if (!apretando) { if (T.estado === "barrido") T.estado = "suelto"; T.sobre = 0; return null; }
  if (T.estado === "barrido") return null;
  if (T.estado !== "apretado") {
    T.estado = "girando";
    T.p = Math.min(1, T.p + dt / dur);
    if (T.p >= 1) { T.estado = "apretado"; return "clic"; }
    return null;
  }
  T.sobre += dt;
  if (T.sobre > TORNILLO.gracia) { T.estado = "barrido"; T.p = 0.35; T.sobre = 0; return "barrido"; }
  return null;
}

// ---------------- soldar ----------------
export const AMB = 25;
export const FUSION = 183;               // el estaño 63/37 se derrite a 183 °C
export const MOJA = 215;                 // el pad tiene que pasar de aquí para que el estaño "moje"
/** Los pads: chico (2,54 mm de la controladora), medio (salidas de motor del ESC), grande (la batería en el ESC). */
export const PADS = {
  chico: { masa: 1, ideal: [0.7, 1.4], puente: 1.75, maxCalor: 5, nombre: "chico" },
  medio: { masa: 1.7, ideal: [0.9, 1.9], puente: 2.4, maxCalor: 7, nombre: "medio" },
  grande: { masa: 3.6, ideal: [1.4, 3.2], puente: 4.2, maxCalor: 11, nombre: "grande" },
};
/**
 * La estación (o el cautín): cautin = piezas.json soldadura[].cautin: potencia (cuánto calor recupera: el de lápiz
 * 0,55, la estación 1, la T12 1,7), tau (qué tan rápido calienta) y si tiene perilla (ajustable) o un set fijo.
 */
export const estacion0 = (cautin = null) => ({ on: false, set: cautin?.set ?? 330, temp: AMB, limpia: 1, minutosOn: 0,
  potencia: cautin?.potencia ?? 1, tau: cautin?.tau ?? 2.6, ajustable: cautin?.ajustable ?? true });
/** La estación: sube hacia la temperatura elegida (o se enfría apagada); tocar un pad le roba calor a la punta. */
export function tickEstacion(E, dt, carga = 0) {
  const meta = E.on ? E.set : AMB, tau = E.on ? E.tau ?? 2.6 : 7;
  E.temp += (meta - E.temp) * (1 - Math.exp(-dt / tau));
  if (carga) E.temp = Math.max(AMB, E.temp - (carga * 6 * dt) / (E.potencia ?? 1));
  if (E.on && E.temp > 280) { E.limpia = Math.max(0.15, E.limpia - dt * (E.temp > 400 ? 0.02 : 0.008)); E.minutosOn += dt / 60; }
}
export const limpiarPunta = (E) => { E.limpia = 1; };
export const junta0 = (pad = "chico") => ({ pad, temp: AMB, tMax: AMB, tCalor: 0, estano: 0, flux: false, fluxQueda: 0, frio: 0 });
/**
 * Un paso de soldar una junta. tocando = el cautín está apoyado en el pad; estanando = estás metiendo estaño.
 * Devuelve qué pasa: "derrite" (el estaño entra), "no_derrite" (el pad está frío: el estaño no moja), "humo" (el flux
 * hierve), o null.
 */
export function tickJunta(J, E, dt, tocando, estanando, mecha = false) {
  const P = PADS[J.pad];
  let ev = null;
  if (tocando && E.temp > AMB + 5) {
    const k = (3.2 * (0.3 + 0.7 * E.limpia) * (J.flux ? 1.35 : 1) * (J.estano > 0.2 ? 1.25 : 1) * (mecha ? 0.7 : 1)) / P.masa;
    J.temp += (E.temp - J.temp) * (1 - Math.exp(-k * dt));
    J.tCalor += dt;
    if (J.flux && J.temp > 150 && J.fluxQueda > 0) { J.fluxQueda = Math.max(0, J.fluxQueda - dt * 0.35); ev = "humo"; }
  } else {
    J.temp += (AMB - J.temp) * (1 - Math.exp(-dt / (0.9 * P.masa)));
  }
  J.tMax = Math.max(J.tMax, J.temp);
  if (mecha && tocando) {                                   // la malla absorbe el estaño derretido
    if (J.temp > FUSION + 5 && J.estano > 0) { J.estano = Math.max(0, J.estano - dt * 1.2); return "absorbe"; }
    return "no_derrite";
  }
  if (estanando) {
    if (tocando && J.temp >= MOJA) { J.estano += dt * 0.85; ev = "derrite"; }
    else ev = "no_derrite";
  }
  if (!tocando && J.estano > 0 && J.temp < FUSION) J.frio = 1;
  return ev;
}
/** Gramos de estaño por cada unidad de J.estano (una junta chica ≈ 1 unidad). */
export const GRAMOS = 0.1;
/** Cuánto estaño saca la bomba de un golpe (en unidades). */
export const EXTRACTOR = 1.4;
/** El extractor (bomba): con el estaño derretido, chupa de un golpe. Devuelve cuánto sacó (0 si estaba frío). */
export function extraer(J) {
  if (J.temp < FUSION + 5 || J.estano <= 0) return 0;
  const q = Math.min(J.estano, EXTRACTOR);
  J.estano = +(J.estano - q).toFixed(3);
  return q;
}
/** Qué tal salió una junta cuando el estaño se enfría. */
export function resultadoJunta(J, conVecino = true) {
  const P = PADS[J.pad];
  if (J.estano < 0.25) return { q: "sin", por: "sin estaño" };
  if (J.tMax > 440 || (J.tCalor > P.maxCalor && J.tMax > 360)) return { q: "levantado", por: "mucho calor: el pad se despegó" };
  if (conVecino && J.estano > P.puente) return { q: "puente", por: "estaño de más: tocó el pad de al lado" };
  if (J.estano < P.ideal[0]) return { q: "fria", por: "poco estaño" };
  if (J.tMax < 240) return { q: "fria", por: "el pad no se calentó bien" };
  if (!J.flux && J.tMax < 290) return { q: "fria", por: "sin flux el estaño no mojó" };
  return { q: "buena", por: J.estano > P.ideal[1] ? "buena (con estaño de sobra)" : "buena" };
}
/** De varias juntas de un mismo cable (los 3 de un motor), la peor manda. */
const ORDEN_Q = ["levantado", "puente", "sin", "fria", "buena", "enchufado"];
export const peor = (qs) => qs.reduce((a, q) => (ORDEN_Q.indexOf(q) < ORDEN_Q.indexOf(a) ? q : a), "enchufado");

// ---------------- qué tipo de unión lleva cada pin ----------------
const ENCHUFE = new Set(["fc_conn", "esc_conn", "ufl", "ant"]);
/** El pin se enchufa (arnés, antena) en vez de soldarse. */
export const esEnchufe = (pin) => ENCHUFE.has(pin?.tipo);
/** El tamaño del pad de un pin: los de la batería en el ESC son grandes; las salidas de motor, medianas. */
export function padDe(comp, pin) {
  if (comp.k === "esc" && (pin.id === "bat+" || pin.id === "bat-")) return "grande";
  if (comp.k === "esc" && /^m\d$/.test(pin.id)) return "medio";
  return "chico";
}
/** Cuántas juntas lleva un cable: el de un motor son 3 cables (3 fases). */
export const juntasDe = (pinA, pinB) => (pinA?.tipo === "m_in" || pinB?.tipo === "m_in" ? 3 : 1);
/** Qué lado del cable es "la placa" (donde se suelda): el ESC o la controladora; si no, el segundo. */
export function placaDe(cable, comps) {
  const ks = cable.map((x) => x.split(".")[0]);
  const i = ks.findIndex((k) => k === "esc" || k === "fc");
  return cable[i >= 0 ? i : 1];
}
/** El pin vecino en la misma placa (con el que hace puente el estaño de más). */
export function vecino(comps, ref) {
  const [k, id] = ref.split("."), c = comps.find((x) => x.k === k);
  if (!c) return null;
  const ps = c.pines.filter((p) => !esEnchufe(p)), i = ps.findIndex((p) => p.id === id);
  if (i < 0) return null;
  const v = ps[i + 1] || ps[i - 1];
  return v ? `${k}.${v.id}` : null;
}

// ---------------- el cableado que cuenta ----------------
export const claveCable = ([a, b]) => `${a}|${b}`;
/**
 * Los cables que de verdad conducen (los soldados o enchufados) y los puentes de estaño como cables de más.
 * Devuelve { cables, frias: [cable], sinSoldar: [cable], levantados: [cable], puentes: [[pin, vecino]] }.
 */
export function efectivos(B, comps) {
  const J = B.juntas || {}, out = { cables: [], frias: [], sinSoldar: [], levantados: [], puentes: [] };
  for (const c of B.cables || []) {
    const j = J[claveCable(c)];
    if (!j) { out.cables.push(c); continue; }                       // partida vieja: soldado bien
    if (j.q === "buena" || j.q === "enchufado") out.cables.push(c);
    else if (j.q === "fria") { out.cables.push(c); out.frias.push(c); }
    else if (j.q === "puente") {
      out.cables.push(c);
      const placa = placaDe(c, comps), v = vecino(comps, placa);
      if (v) out.puentes.push(placa === "esc.bat+" || placa === "esc.bat-" ? ["xt60.pos", "xt60.neg"] : [placa, v]);
    } else if (j.q === "levantado") out.levantados.push(c);
    else out.sinSoldar.push(c);
  }
  return out;
}
