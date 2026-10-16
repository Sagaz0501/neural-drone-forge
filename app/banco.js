// =====================================================================
// EL BANCO DE ARMADO (la lógica, sin pantalla: corre en node, app/test_banco.mjs).
//
// Un dron pasa por estos pasos antes de volar:
//   imprimir (si el chasis es tuyo) -> armar (piezas al chasis) -> cablear (soldar) -> prueba de humo
//   (conectar la batería) -> firmware (flashear) -> configurar (acelerómetro, puertos, radio) -> motores
//   (orden y sentido, SIN hélices) -> hélices -> prueba atada -> ¡a volar!  (+ cargar su IA)
//
// Cableado: cada pieza electrónica es un COMPONENTE con PINES. Un cable une dos pines. revisar() dice qué
// se quema (un corto, 12 V donde van 5 V…), qué no funciona (TX con TX…) y qué falta. Los números de
// voltaje y los pines son de verdad (una ESP32, una STM32 de Betaflight, un receptor ExpressLRS…).
//
// Lo que vive en la UNIDAD (la pieza física, aunque la cambies de dron): el firmware, la calibración y
// los puertos de la controladora, el emparejado de la radio, el sentido de los motores en el ESC.
// Lo que vive en el DRON: qué está instalado, los cables, la prueba de humo, las hélices, la IA cargada.
// =====================================================================
import { pieza } from "./parts.js";
import { t } from "./i18n.js";
import { efectivos, claveCable } from "./taller.js";

// ---------------- pines ----------------
// tipos: fuentes "vbat+" (batería, 7-17 V) "5v+" "3v3+"; entradas "vbat_in" "5v_in" "3v3_in"; "gnd";
// "tx" "rx" (con bus: UART1…); "sda" "scl"; "led_out" "led_in"; "m_out" (ESC) "m_in" (motor);
// "esc_conn" "fc_conn" (el arnés de 8 pines entre ESC y controladora); "ufl" (conector de antena) "ant".
const NIVEL_OUT = { "vbat+": 3, "5v+": 2, "3v3+": 1 };
const NIVEL_IN = { vbat_in: 3, "5v_in": 2, "3v3_in": 1 };
/** El voltaje en palabras (una función: t() corre después de cargar el idioma). */
const volt = (n) => (n === 3 ? t("la batería (12 V)") : n === 2 ? "5 V" : t("3,3 V"));
const SEÑAL = new Set(["tx", "rx", "sda", "scl", "led_out", "led_in", "m_out", "m_in", "esc_conn", "fc_conn", "ufl", "ant"]);

/** Dónde va cada motor (vista de arriba) y lo que espera Betaflight: M1 atrás der., M2 adelante der.… */
export const POS = { RR: "atrás derecha", FR: "adelante derecha", RL: "atrás izquierda", FL: "adelante izquierda" };
export const ESPERA = ["RR", "FR", "RL", "FL"];                      // M1..M4 (Betaflight, quad X)
export const SENTIDO = { RR: "cw", FR: "ccw", RL: "ccw", FL: "cw" };   // "props in" (hélices hacia adentro)

/** La familia del chip de cada controladora (para el firmware y los pines). */
export const CHIP = { fc_basica: "esp32", fc_baro: "esp32", fc_f405: "f405", fc_gps: "f722", fc_ia: "h743" };

/** Firmwares que se pueden flashear (los de otro chip "flashean" pero la placa no arranca). */
export const FIRMWARES = [
  { id: "espfc", nombre: "ESP-FC 0.2 · ESP32", chip: "esp32", kb: 1210 },
  { id: "bf_f411", nombre: "Betaflight 4.5 · STM32F411", chip: "f411", kb: 480 },
  { id: "bf_f405", nombre: "Betaflight 4.5 · STM32F405", chip: "f405", kb: 612 },
  { id: "bf_f7x2", nombre: "Betaflight 4.5 · STM32F7X2", chip: "f722", kb: 640 },
  { id: "inav_f7x2", nombre: "INAV 7.1 · STM32F7X2 (navegación GPS)", chip: "f722", kb: 905 },
  { id: "bf_h743", nombre: "Betaflight 4.5 · STM32H743", chip: "h743", kb: 702 },
  { id: "dmai_h743", nombre: "Dron Maker AI · STM32H743 + K210", chip: "h743", kb: 1540, ia: true },
];

const P = (id, nombre, tipo, lado, bus) => ({ id, nombre, tipo, lado, bus });
/** Lo mismo pero con el nombre traducido (los que tienen palabras). */
const PT = (id, nombre, tipo, lado, bus) => P(id, t(nombre), tipo, lado, bus);

/** Los pines de cada controladora. */
function pinesFC(id) {
  if (CHIP[id] === "esp32") {
    return [PT("conn", "ESC (8 pines)", "fc_conn", "l"), P("5v", "5V", "5v+", "r"), P("3v3", "3V3", "3v3+", "r"), P("gnd1", "GND", "gnd", "r"),
      P("gnd2", "GND", "gnd", "r"), P("tx2", "GPIO17 · TX2", "tx", "r", "UART2"), P("rx2", "GPIO16 · RX2", "rx", "r", "UART2"),
      P("tx1", "GPIO27 · TX1", "tx", "r", "UART1"), P("rx1", "GPIO26 · RX1", "rx", "r", "UART1"),     // el UART1 del ESP32 se puede mover a cualquier GPIO
      P("sda", "GPIO21 · SDA", "sda", "r"), P("scl", "GPIO22 · SCL", "scl", "r"), P("led", "GPIO4 · LED", "led_out", "r"),
      PT("ant", "Antena u.FL", "ufl", "r")];
  }
  return [PT("conn", "ESC (8 pines)", "fc_conn", "l"), P("vbat", "VBAT", "vbat+", "r"), P("5v", "5V", "5v+", "r"), P("3v3", "3V3", "3v3+", "r"),
    P("gnd1", "GND", "gnd", "r"), P("gnd2", "GND", "gnd", "r"), P("gnd3", "GND", "gnd", "r"),
    P("tx1", "TX1", "tx", "r", "UART1"), P("rx1", "RX1", "rx", "r", "UART1"), P("tx2", "TX2", "tx", "r", "UART2"), P("rx2", "RX2", "rx", "r", "UART2"),
    P("sda", "SDA", "sda", "r"), P("scl", "SCL", "scl", "r"), P("led", "LED", "led_out", "r")];
}

/**
 * Los componentes del dron (b = build con ids; slots/extras = uids de las unidades).
 * Cada uno: { k, nombre, slot (para quemar la unidad), uid, x, y, w, pines }. x/y/w: dónde se dibuja (0-1000 × 0-640).
 */
export function componentes(cat, b, d) {
  const out = [], uid = (slot) => d?.slots?.[slot] ?? null;
  const exUid = (id) => (d?.extras || []).find((u, i) => (b.extras || [])[i] === id) ?? null;
  const fc = b.controladora, chip = CHIP[fc];
  out.push({ k: "xt60", nombre: t("Cable de batería XT60"), slot: "bateria", uid: "xt60", x: 30, y: 300, w: 120,
    pines: [PT("pos", "+ (rojo)", "vbat+", "r"), PT("neg", "− (negro)", "gnd", "r")] });
  if (b.esc) out.push({ k: "esc", nombre: pieza(cat, "escs", b.esc)?.nombre || "ESC", slot: "esc", uid: uid("esc"), x: 200, y: 230, w: 220,
    pines: [P("bat+", "BAT+", "vbat_in", "l"), P("bat-", "BAT−", "gnd", "l"), P("m1", "M1", "m_out", "t"), P("m2", "M2", "m_out", "t"),
      P("m3", "M3", "m_out", "t"), P("m4", "M4", "m_out", "t"), PT("conn", "FC (8 pines)", "esc_conn", "r")] });
  if (b.motores) {
    const mo = pieza(cat, "motores", b.motores)?.nombre || t("Motor");
    [["FL", 30], ["FR", 180], ["RL", 330], ["RR", 480]].forEach(([pos, x]) => out.push({ k: "m" + pos, nombre: t("Motor {pos}", { pos: t(POS[pos]) }), sub: mo, slot: "motores",
      uid: uid("motores"), x, y: 30, w: 135, pines: [PT("fases", "3 fases", "m_in", "b")] }));
  }
  if (fc) out.push({ k: "fc", nombre: pieza(cat, "controladoras", fc)?.nombre || t("Controladora"), slot: "controladora", uid: uid("controladora"),
    x: 500, y: 170, w: 220, pines: pinesFC(fc) });
  let y = 30;
  const lado = (c) => { c.x = 790; c.y = y; c.w = 190; y += 26 + c.pines.length * 24 + 22; out.push(c); };
  if (b.radio === "rx_elrs24" || b.radio === "rx_elrs900") lado({ k: "rx", nombre: pieza(cat, "radios", b.radio).nombre, slot: "radio", uid: uid("radio"),
    pines: [P("5v", "5V", "5v_in", "l"), P("gnd", "GND", "gnd", "l"), P("tx", "TX", "tx", "l"), P("rx", "RX", "rx", "l")] });
  if (b.radio === "rx_espnow_ant") lado({ k: "ant", nombre: t("Antena dipolo 2.4 GHz"), slot: "radio", uid: uid("radio"), pines: [P("ufl", "u.FL", "ant", "l")] });
  if (fc === "fc_gps" || fc === "fc_ia") lado({ k: "gps", nombre: "GPS M10", slot: "controladora", uid: uid("controladora"),
    pines: [P("5v", "5V", "5v_in", "l"), P("gnd", "GND", "gnd", "l"), P("tx", "TX", "tx", "l"), P("rx", "RX", "rx", "l")] });
  if (b.camara) {
    const ca = pieza(cat, "camaras", b.camara);
    lado({ k: "cam", nombre: ca?.nombre || t("Cámara"), slot: "camara", uid: uid("camara"),
      pines: ca?.gimbal ? [P("vin", "VIN 9-26 V", "vbat_in", "l"), P("gnd", "GND", "gnd", "l")] : [P("5v", "5V", "5v_in", "l"), P("gnd", "GND", "gnd", "l")] });
  }
  if ((b.extras || []).includes("tof")) lado({ k: "tof", nombre: t("Hub de sensores ToF (x10)"), slot: "extra:tof", uid: exUid("tof"),
    pines: [P("3v3", "3V3", "3v3_in", "l"), P("gnd", "GND", "gnd", "l"), P("sda", "SDA", "sda", "l"), P("scl", "SCL", "scl", "l")] });
  if ((b.extras || []).includes("luces")) lado({ k: "led", nombre: t("Tira LED WS2812"), slot: "extra:luces", uid: exUid("luces"),
    pines: [P("5v", "5V", "5v_in", "l"), P("gnd", "GND", "gnd", "l"), P("din", "DIN", "led_in", "l")] });
  if (chip) out.find((c) => c.k === "fc").chip = chip;
  return out;
}

/** Busca un pin por "k.id". */
function pinMap(comps) {
  const m = new Map();
  for (const c of comps) for (const p of c.pines) m.set(`${c.k}.${p.id}`, { ...p, c });
  return m;
}

/** El cableado del manual (el que hace el diagrama). Pares ["k.pin", "k.pin"]. */
export function manual(comps) {
  const has = (k) => comps.some((c) => c.k === k), fc = comps.find((c) => c.k === "fc");
  const esp = fc?.chip === "esp32", out = [];
  let g = 1;
  const gnd = () => `fc.gnd${esp ? Math.min(2, g++) : Math.min(3, g++)}`;
  if (has("esc")) out.push(["xt60.pos", "esc.bat+"], ["xt60.neg", "esc.bat-"]);
  if (has("esc") && fc) out.push(["esc.conn", "fc.conn"]);
  if (has("esc")) ["RR", "FR", "RL", "FL"].forEach((pos, i) => has("m" + pos) && out.push([`esc.m${i + 1}`, `m${pos}.fases`]));
  if (!fc) return out;
  if (has("rx")) out.push(["rx.5v", "fc.5v"], ["rx.gnd", gnd()], ["rx.tx", esp ? "fc.rx2" : "fc.rx1"], ["rx.rx", esp ? "fc.tx2" : "fc.tx1"]);
  if (has("ant") && esp) out.push(["ant.ufl", "fc.ant"]);
  if (has("gps")) { const u = esp && has("rx") ? "1" : "2"; out.push(["gps.5v", "fc.5v"], ["gps.gnd", gnd()], ["gps.tx", `fc.rx${u}`], ["gps.rx", `fc.tx${u}`]); }   // con radio y GPS, el ESP32 usa sus dos UART
  const cam = comps.find((c) => c.k === "cam");
  if (cam) out.push(cam.pines[0].tipo === "vbat_in" ? ["cam.vin", esp ? (has("esc") ? "esc.bat+" : "xt60.pos") : "fc.vbat"] : ["cam.5v", "fc.5v"], ["cam.gnd", gnd()]);   // el ESP32 no tiene VBAT: a los pads de batería del ESC
  if (has("tof")) out.push(["tof.3v3", "fc.3v3"], ["tof.gnd", gnd()], ["tof.sda", "fc.sda"], ["tof.scl", "fc.scl"]);
  if (has("led")) out.push(["led.5v", "fc.5v"], ["led.gnd", gnd()], ["led.din", "fc.led"]);
  return out;
}

/**
 * Revisa el cableado. Devuelve:
 *   danos  [{k, msg, slot, queda}]  lo que se QUEMA al conectar la batería (queda = vida que le queda)
 *   cortos bool                     hay un corto en la batería (chispazo)
 *   fallas [{k, msg}]               cables que no funcionan (no rompen nada)
 *   faltan [{k, msg}]               conexiones que faltan
 *   uarts  {rx: "UART1", gps: "UART2"}   en qué puerto quedó cada cosa (para configurar los puertos)
 *   motores {m1: "RR", …}           qué motor quedó en cada salida del ESC
 *   malos  Set de índices de cables con problema (para pintarlos de rojo con el multímetro)
 *   ok     bool                     nada se quema, nada falla, nada falta
 */
export function revisar(comps, cables) {
  const pm = pinMap(comps), danos = [], fallas = [], faltan = [], malos = new Set();
  const dano = (c, msg, queda = 0) => { if (!danos.some((x) => x.k === c.k)) danos.push({ k: c.k, msg, slot: c.slot, uid: c.uid, queda, nombre: c.nombre }); };
  const falla = (k, msg, i) => { fallas.push({ k, msg }); if (i !== undefined) malos.add(i); };
  const okW = [];                                  // cables buenos: [pinA, pinB]
  let cortoBat = false, pos2bat = -1, neg2bat = -1;
  cables.forEach(([a, b], i) => {
    let A = pm.get(a), B = pm.get(b);
    if (!A || !B) return;
    if (A.c.k === B.c.k && A.id === B.id) return;
    // ordenar para que las reglas sean de un solo lado
    const ta = A.tipo, tb = B.tipo;
    const out = NIVEL_OUT[ta] ? A : NIVEL_OUT[tb] ? B : null, other = out === A ? B : A;
    if (out) {
      const lo = NIVEL_OUT[out.tipo];
      if (other.tipo === "gnd") {
        malos.add(i);
        if (out.c.k === "xt60") { cortoBat = true; if (other.c.k === "esc" && other.id === "bat-") pos2bat = i; }
        else dano(out.c, t("Corto entre {pin} y GND: se quemó el regulador de la {pieza}.", { pin: out.nombre, pieza: out.c.nombre }));
        return;
      }
      if (NIVEL_OUT[other.tipo]) {
        if (NIVEL_OUT[other.tipo] !== lo) { malos.add(i); dano(other.c.k === "xt60" ? out.c : other.c, t("Uniste {a} con {b}: dos voltajes distintos peleando. Se quemó la {pieza}.", { a: out.nombre, b: other.nombre, pieza: (other.c.k === "xt60" ? out.c : other.c).nombre })); }
        return;
      }
      if (NIVEL_IN[other.tipo]) {
        const li = NIVEL_IN[other.tipo];
        if (lo > li) { malos.add(i); dano(other.c, t("Le diste {v} a {pieza}, que va con {vok}: se quemó.", { v: volt(lo), pieza: other.c.nombre, vok: volt(li) })); }
        else if (lo < li) falla(other.c.k, t("{pieza} no enciende: necesita {vok} y le diste {v}.", { pieza: other.c.nombre, vok: volt(li), v: volt(lo) }), i);
        else okW.push([out, other]);
        return;
      }
      if (SEÑAL.has(other.tipo)) { malos.add(i); dano(other.c, t("Le metiste {v} al pin de señal {pin} de {pieza}: se quemó.", { v: volt(lo), pin: other.nombre, pieza: other.c.nombre })); return; }
    }
    // sin fuentes de voltaje
    const set = new Set([ta, tb]);
    if (ta === "gnd" && tb === "gnd") { okW.push([A, B]); return; }
    if (set.has("gnd") && (NIVEL_IN[ta] || NIVEL_IN[tb])) {
      const inp = NIVEL_IN[ta] ? A : B, g = inp === A ? B : A;
      if (g.c.k === "xt60" && inp.c.k === "esc") { neg2bat = i; return; }
      falla(inp.c.k, t("{pin} de {pieza} está conectado a GND: así no le llega voltaje.", { pin: inp.nombre, pieza: inp.c.nombre }), i);
      return;
    }
    if (set.has("gnd")) { const sg = ta === "gnd" ? B : A; falla(sg.c.k, t("{pin} de {pieza} va a GND: esa señal no sirve así.", { pin: sg.nombre, pieza: sg.c.nombre }), i); return; }
    if (ta === "m_out" && tb === "m_out") { malos.add(i); dano(A.c, t("Uniste dos salidas de motor del ESC: corto entre fases, el ESC se quemó.")); return; }
    if (set.has("m_out") && set.has("m_in")) { okW.push([A, B]); return; }
    if (set.has("esc_conn") && set.has("fc_conn")) { okW.push([A, B]); return; }
    if (set.has("ufl") && set.has("ant")) { okW.push([A, B]); return; }
    if (set.has("led_out") && set.has("led_in")) { okW.push([A, B]); return; }
    if (set.has("tx") && set.has("rx")) { okW.push([A, B]); return; }
    if (ta === tb && (ta === "tx" || ta === "rx")) { falla(A.c.k === "fc" ? B.c.k : A.c.k, t("{a} con {b}: TX va con RX (se cruzan). Así no se hablan.", { a: A.nombre, b: B.nombre }), i); return; }
    if ((ta === "sda" && tb === "sda") || (ta === "scl" && tb === "scl")) { okW.push([A, B]); return; }
    falla(A.c.k, t("El cable de {a} ({pa}) a {b} ({pb}) no tiene sentido: no hace nada.", { a: A.nombre, pa: A.c.nombre, b: B.nombre, pb: B.c.nombre }), i);
  });
  const esc = comps.find((c) => c.k === "esc");
  if (cortoBat) {
    if (pos2bat >= 0 && neg2bat >= 0 && esc) dano(esc, t("¡Polaridad invertida! El + de la batería al BAT− del ESC: el ESC se quemó."));
    else danos.push({ k: "xt60", msg: t("¡Corto en la batería! El + y el − se tocan: chispazo y la batería se infló."), slot: "bateria", uid: "bateria", queda: 50, nombre: t("Batería") });
  } else if (neg2bat >= 0) falla("esc", t("El − de la batería está en BAT+ del ESC: así no enciende."), neg2bat);

  // ---- quién quedó conectado con quién ----
  const con = (k1, p1, k2, p2) => okW.some(([A, B]) => (A.c.k === k1 && A.id === p1 && B.c.k === k2 && (!p2 || B.id === p2)) || (B.c.k === k1 && B.id === p1 && A.c.k === k2 && (!p2 || A.id === p2)));
  const pinCon = (k, p) => okW.filter(([A, B]) => (A.c.k === k && A.id === p) || (B.c.k === k && B.id === p)).map(([A, B]) => (A.c.k === k && A.id === p ? B : A));
  const tieneGnd = (k) => okW.some(([A, B]) => (A.c.k === k && A.tipo === "gnd" && B.c.k !== k) || (B.c.k === k && B.tipo === "gnd" && A.c.k !== k));
  const has = (k) => comps.some((c) => c.k === k);
  const fc = comps.find((c) => c.k === "fc");
  if (esc) {
    if (!con("xt60", "pos", "esc", "bat+")) faltan.push({ k: "esc", msg: t("Suelda el + (rojo) del cable XT60 al BAT+ del ESC.") });
    if (!con("xt60", "neg", "esc", "bat-")) faltan.push({ k: "esc", msg: t("Suelda el − (negro) del cable XT60 al BAT− del ESC.") });
    if (fc && !con("esc", "conn", "fc", "conn")) faltan.push({ k: "fc", msg: t("Conecta el arnés de 8 pines entre el ESC y la controladora.") });
  }
  const motores = {};
  for (const pos of ["FL", "FR", "RL", "RR"]) {
    if (!has("m" + pos)) continue;
    const pads = pinCon("m" + pos, "fases").filter((q) => q.c.k === "esc");
    if (!pads.length) faltan.push({ k: "m" + pos, msg: t("Suelda el motor de {pos} a una salida del ESC (M1-M4).", { pos: t(POS[pos]) }) });
    if (pads.length > 1 && esc) dano(esc, t("El motor de {pos} está en dos salidas del ESC a la vez: corto entre fases, el ESC se quemó.", { pos: t(POS[pos]) }));
    for (const q of pads) {
      if (motores[q.id]) falla("esc", t("Dos motores en {pad}: se reparten una salida y ninguno gira bien.", { pad: q.nombre }));
      motores[q.id] = pos;
    }
  }
  // dispositivos: alimentación + señal
  const alimentado = (k, pin) => pinCon(k, pin).some((q) => NIVEL_OUT[q.tipo]);
  const uarts = {};
  for (const k of ["rx", "gps"]) {
    if (!has(k) || !fc) continue;
    const nom = k === "rx" ? t("el receptor") : t("el GPS"), Nom = nom[0].toUpperCase() + nom.slice(1);
    if (!alimentado(k, "5v")) faltan.push({ k, msg: t("Dale 5V a {nom}.", { nom }) });
    if (!tieneGnd(k)) faltan.push({ k, msg: t("Conecta el GND de {nom}.", { nom }) });
    const tx = pinCon(k, "tx").find((q) => q.c.k === "fc" && q.tipo === "rx"), r = pinCon(k, "rx").find((q) => q.c.k === "fc" && q.tipo === "tx");
    if (!tx || !r) faltan.push({ k, msg: t("Cruza los datos de {nom}: su TX al RX de un UART y su RX al TX del MISMO UART.", { nom }) });
    else if (tx.bus !== r.bus) falla(k, t("{Nom} tiene el TX en {a} y el RX en {b}: tienen que ir al mismo UART.", { Nom, a: tx.bus, b: r.bus }));
    else uarts[k] = tx.bus;
  }
  if (uarts.rx && uarts.gps && uarts.rx === uarts.gps) falla("gps", t("El receptor y el GPS están en el mismo {uart}: cada uno necesita su UART.", { uart: uarts.rx }));
  if (has("ant") && fc && !con("ant", "ufl", "fc", "ant")) faltan.push({ k: "ant", msg: fc.chip === "esp32" ? t("Conecta la antena al conector u.FL del ESP32.") : t("Esa antena es para el ESP32: tu controladora no tiene u.FL (necesitas un receptor ExpressLRS).") });
  const cam = comps.find((c) => c.k === "cam");
  if (cam) {
    if (!alimentado("cam", cam.pines[0].id)) faltan.push({ k: "cam", msg: cam.pines[0].tipo === "vbat_in" ? t("La cámara con gimbal va directo a la batería (VBAT, 9-26 V).") : t("Dale 5V a la cámara.") });
    if (!tieneGnd("cam")) faltan.push({ k: "cam", msg: t("Conecta el GND de la cámara.") });
  }
  if (has("tof")) {
    if (!alimentado("tof", "3v3")) faltan.push({ k: "tof", msg: t("Los ToF van con 3V3.") });
    if (!tieneGnd("tof")) faltan.push({ k: "tof", msg: t("Conecta el GND de los ToF.") });
    if (!pinCon("tof", "sda").some((q) => q.c.k === "fc") || !pinCon("tof", "scl").some((q) => q.c.k === "fc")) faltan.push({ k: "tof", msg: t("Los ToF hablan por I2C: SDA con SDA y SCL con SCL.") });
  }
  if (has("led")) {
    if (!alimentado("led", "5v")) faltan.push({ k: "led", msg: t("Los LED van con 5V.") });
    if (!tieneGnd("led")) faltan.push({ k: "led", msg: t("Conecta el GND de los LED.") });
    if (!con("led", "din", "fc", "led")) faltan.push({ k: "led", msg: t("El DIN de los LED va al pin LED de la controladora.") });
  }
  return { danos, cortos: cortoBat, fallas, faltan, uarts, motores, malos, ok: !danos.length && !fallas.length && !faltan.length };
}

/** Una "firma" del cableado: si cambia algo, hay que repetir la prueba de humo. */
export function firma(comps, cables) {
  const c = comps.map((x) => `${x.k}:${x.uid}`).sort().join(",");
  const w = cables.map(([a, b]) => [a, b].sort().join("~")).sort().join(",");
  return `${c}|${w}`;
}

// ---------------- motores ----------------
function hash(s) { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
/** Cómo gira de fábrica el motor en cada salida (según cómo quedaron soldadas las 3 fases): ~1 de cada 3 al revés. */
export function giraDeFabrica(escUid, motoresUid, pad, pos) {
  const al = hash(`${escUid}|${motoresUid}|${pad}|${pos}`) % 3 === 0;
  return al ? (SENTIDO[pos] === "cw" ? "ccw" : "cw") : SENTIDO[pos];
}
const opuesto = (s) => (s === "cw" ? "ccw" : "cw");

/**
 * Lo que pasa al probar cada salida Mi en el configurador: qué motor gira (posición) y para qué lado.
 * fcU.remap[i] = qué salida del ESC maneja Mi (por defecto la misma); escU.inv[pad] = invertido en el ESC.
 */
export function pruebaMotores(rev, fcU, escU, motoresUid) {
  const remap = fcU?.remap || ["m1", "m2", "m3", "m4"];
  return ESPERA.map((espera, i) => {
    const pad = remap[i], pos = rev.motores[pad] || null;
    let gira = pos ? giraDeFabrica(escU?.uid, motoresUid, pad, pos) : null;
    if (gira && escU?.inv?.[pad]) gira = opuesto(gira);
    return { m: `M${i + 1}`, pad, espera, pos, gira, sentido: SENTIDO[espera], ok: pos === espera && gira === SENTIDO[espera] };
  });
}

// ---------------- el estado del banco ----------------
/** Deja el banco del dron al día con sus piezas: borra los cables de las piezas que cambiaste. */
export function sincronizar(cat, d, b, unidadDe) {
  const comps = componentes(cat, b, d);
  const B = d.banco || (d.banco = {});
  B.instalado = B.instalado || {};
  if (B.migrado) {                               // partidas de antes: ya estaba cableado como el manual
    B.cables = manual(comps);
    B.compUids = Object.fromEntries(comps.map((c) => [c.k, c.uid]));
    B.humo = firma(comps, B.cables);
    const rev = revisar(comps, B.cables), fcU = unidadDe(d.slots.controladora), escU = unidadDe(d.slots.esc), rxU = unidadDe(d.slots.radio);
    if (fcU) { fcU.fw = fcU.fw || autoFirmware(fcU.id); fcU.cal = true; fcU.puertos = { ...rev.uarts }; fcU.remap = ["m1", "m2", "m3", "m4"]; }
    if (escU) { escU.inv = {}; for (const r of pruebaMotores(rev, fcU, { ...escU, inv: {} }, d.slots.motores)) if (r.gira && r.gira !== r.sentido) escU.inv[r.pad] = true; }
    if (rxU) rxU.bind = true;
    if (fcU) { fcU.bind = true; fcU.motoresProbados = `${d.slots.esc}|${d.slots.motores}|${B.humo}`; }
    B.prueba = estadoFirma(d, comps, B.cables);
    delete B.migrado;
  }
  B.cables = B.cables || [];
  const prev = B.compUids || {};
  const now = Object.fromEntries(comps.map((c) => [c.k, c.uid]));
  const cambiaron = new Set(Object.keys({ ...prev, ...now }).filter((k) => prev[k] !== now[k]));
  if (cambiaron.size) B.cables = B.cables.filter(([a, b2]) => !cambiaron.has(a.split(".")[0]) && !cambiaron.has(b2.split(".")[0]));
  B.compUids = now;
  return comps;
}

/** El firmware correcto para una controladora (el que pondría alguien que sabe). */
export function autoFirmware(fcId) {
  const f = FIRMWARES.find((x) => x.chip === CHIP[fcId] && (fcId !== "fc_ia" || x.ia));
  return f ? { id: f.id, ok: true } : null;
}

const estadoFirma = (d, comps, cables) => `${firma(comps, cables)}|${d.slots.helices}`;

/**
 * El cableado que cuenta (taller.js efectivos: lo soldado o enchufado, y los puentes de estaño como cortos) revisado.
 * rev trae además: frias (cables con soldadura fría: funcionan… hasta que vibran), y malos con los índices de B.cables.
 */
export function cableado(comps, B) {
  const ef = efectivos(B, comps), idx = new Map((B.cables || []).map((c, i) => [claveCable(c), i]));
  // los pads de batería del ESC son la batería (si el XT60 está soldado ahí): lo que se suelda en ellos va a la batería
  const pega = (a, b) => ef.cables.some((c) => c.includes(a) && c.includes(b));
  const red = { "esc.bat+": pega("xt60.pos", "esc.bat+") ? "xt60.pos" : null, "esc.bat-": pega("xt60.neg", "esc.bat-") ? "xt60.neg" : null };
  const comoBateria = (c) => (c.some((r) => r.startsWith("xt60.")) ? c : c.map((r) => red[r] || r));
  const rev = revisar(comps, [...ef.cables.map(comoBateria), ...ef.puentes]);
  const pm = pinMap(comps), nom = (ref) => { const q = pm.get(ref); return q ? `${q.c.nombre} · ${q.nombre}` : ref; };
  const malos = new Set();
  [...ef.cables, ...ef.puentes].forEach((c, i) => { if (rev.malos.has(i)) malos.add(i < ef.cables.length ? idx.get(claveCable(c)) : -1); });
  rev.malos = malos;
  for (const c of ef.sinSoldar) rev.faltan.unshift({ k: c[0].split(".")[0], msg: t("Falta soldar: {a} → {b}.", { a: nom(c[0]), b: nom(c[1]) }) });
  for (const c of ef.levantados) rev.faltan.unshift({ k: c[0].split(".")[0], msg: t("Pad levantado en {b}: suéldalo otra vez con un puente de cable.", { b: nom(c[1]) }) });
  rev.frias = ef.frias.map((c) => ({ cable: c, msg: t("Soldadura fría en {b}: funciona en la mesa, pero con la vibración se puede soltar.", { b: nom(c[1]) }) }));
  rev.puentes = ef.puentes;
  rev.ok = !rev.danos.length && !rev.fallas.length && !rev.faltan.length;
  return { rev, cables: ef.cables, ef };
}

/**
 * Los pasos del banco con ✓ o lo que falta. unidadDe(uid) -> unidad. Devuelve { pasos, listo, listoIA, rev, comps }.
 * listo = puede volar a mano; listoIA = además tiene su IA cargada.
 */
export function estado(cat, d, b, unidadDe, opts = {}) {
  const comps = sincronizar(cat, d, b, unidadDe);
  const B = d.banco, cab = cableado(comps, B), rev = cab.rev;
  const fcU = unidadDe(d.slots.controladora), escU = unidadDe(d.slots.esc), rxU = unidadDe(d.slots.radio), chU = unidadDe(d.slots.chasis);
  const pasos = [];
  const add = (k, nombre, ok, nota = "") => pasos.push({ k, nombre, ok: !!ok, nota });
  const chP = pieza(cat, "chasis", b.chasis);
  if (chP?.imprimible && opts.impresora) add("imprimir", t("Imprimir el chasis"), chU?.diseno, chU?.diseno ? "" : t("Elige la forma (o tu STL) y dale imprimir."));
  const faltaInst = ["chasis", "motores", "esc", "controladora", "radio", "camara", "montaje", "bateria"].filter((s) => d.slots[s] && B.instalado[s] !== d.slots[s]);
  const exFalta = d.extras.filter((u) => !(B.instalado.extras || []).includes(u)).length + (B.instalado.extras || []).filter((u) => !d.extras.includes(u)).length;
  const NOMBRE_SLOT = { chasis: t("chasis"), motores: t("motores"), esc: "ESC", controladora: t("controladora"), radio: t("radio"), camara: t("cámara"), montaje: t("montaje"), bateria: t("batería") };
  add("armar", t("Armar"), !faltaInst.length && !exFalta && !(chP?.imprimible && opts.impresora && !chU?.diseno),
    faltaInst.length || exFalta ? t("Falta instalar: {lista}.", { lista: [...faltaInst.map((s) => NOMBRE_SLOT[s] || s), ...(exFalta ? [t("extras")] : [])].join(", ") }) : "");
  const armado = pasos.at(-1).ok;
  // cablear queda ✓ cuando todo está conectado: un corto, un puente de estaño o un cable mal puesto NO avisan aquí;
  // se descubren con el multímetro… o al conectar la batería (prueba de humo)
  add("cablear", t("Cablear"), armado && !rev.faltan.length, !armado ? t("Primero arma.") : rev.faltan.length ? t("{n} conexiones por hacer.", { n: rev.faltan.length }) : "");
  const sig = firma(comps, cab.cables);
  add("humo", t("Prueba de humo"), armado && rev.ok && B.humo === sig, B.humo === sig ? "" : t("Conecta la batería (con el probador de humo si lo tienes)."));
  const fwOk = fcU?.fw?.ok && FIRMWARES.find((f) => f.id === fcU.fw.id)?.chip === CHIP[fcU.id];
  add("firmware", t("Firmware"), fwOk, fcU?.fw ? (fwOk ? t(FIRMWARES.find((f) => f.id === fcU.fw.id).nombre) : t("Firmware equivocado: la placa no arranca.")) : t("Conecta el USB y flashea."));
  const necesitaRx = b.radio === "rx_elrs24" || b.radio === "rx_elrs900";
  const puertosOk = !fcU ? false : ["rx", "gps"].every((k) => !rev.uarts[k] || fcU.puertos?.[k] === rev.uarts[k]);
  const espnowMal = (b.radio === "rx_espnow" || b.radio === "rx_espnow_ant") && CHIP[b.controladora] !== "esp32";
  const bindOk = !espnowMal && (necesitaRx ? rxU?.bind : fcU?.bind || rxU?.bind);
  add("config", t("Configurar"), fwOk && fcU?.cal && puertosOk && bindOk,
    espnowMal ? t("La radio ESP-NOW es del ESP32: con una STM32 necesitas un receptor ExpressLRS.") : !fcU?.cal ? t("Calibra el acelerómetro.") : !puertosOk ? t("Activa el puerto del receptor/GPS en el UART donde lo soldaste.") : !bindOk ? t("Empareja la radio.") : "");
  const pm = pruebaMotores(rev, fcU, escU, d.slots.motores);
  const motProbados = fwOk && B.humo === sig && fcU?.motoresProbados === `${d.slots.esc}|${d.slots.motores}|${sig}`;
  add("motores", t("Motores"), motProbados && pm.every((r) => r.ok),
    motProbados ? t("El orden o el sentido cambió: vuelve a probarlos.") : t("Prueba el orden y el sentido de los 4 motores (sin hélices)."));
  add("helices", t("Hélices"), B.instalado.helices === d.slots.helices && B.helices, t("Pon las hélices (siempre de último)."));
  add("prueba", t("Prueba atada"), B.prueba === estadoFirma(d, comps, cab.cables), t("Enciéndelo amarrado a la mesa: si algo está mal, se voltea."));
  const listo = pasos.every((p) => p.ok);
  const iaOk = !!(d.modelo && B.ia?.modelo === d.modelo);
  return { pasos, listo, listoIA: listo && iaOk, iaOk, rev, comps, motores: pm, sig, prueba: estadoFirma(d, comps, cab.cables) };
}
