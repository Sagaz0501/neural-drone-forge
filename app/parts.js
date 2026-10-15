// =====================================================================
// PIEZAS -> FÍSICA. El taller arma un dron con piezas (app/data/piezas.json) y aquí se calculan
// los números que usa la física de game/sim.js (mass, twr, drag, maxAngle, attResp, yawRate,
// crashSpeed, radius) + lo que es solo del juego (batería, velocidad máx., calidad de video).
//
// No usa nada del navegador: corre en node (app/test_parts.mjs).
// Las fórmulas están explicadas en docs/PLAN_JUEGO.md, sección 8.
// =====================================================================

export const G = 9.81;
export const BATERIA_USABLE = 0.8;       // no se descarga una LiPo por debajo del ~20 %
export const V_CELDA = 3.7;              // voltaje nominal por celda
export const TWR_REF = 2.5;              // el dron con el que se entrenó la IA

const clip = (x, a, b) => Math.min(Math.max(x, a), b);
const ROT = 180 / Math.PI;

/** Drones armados de ejemplo (el taller los ofrece como "kits"; app/exportar_dron.mjs los exporta). */
export const DRONES_EJEMPLO = {
  madera: { chasis: "madera", motores: "m1806", helices: "h5", bateria: "b3s1300", controladora: "fc_baro", camara: "cam_juguete",
    esc: "esc20", radio: "rx_espnow", montaje: "mt_tornillos" },
  // modo desarrollador: un dron de cine para el restaurante (protectores + ToF para ver los postes)
  cine: { chasis: "aluminio", motores: "m2306", helices: "h7", bateria: "b4s2200", controladora: "fc_gps", camara: "cam_4k",
    esc: "esc45", radio: "rx_elrs24", montaje: "mt_gomas" },
};
export const EXTRAS_EJEMPLO = { madera: [], cine: ["protectores", "tof", "luces"] };

/** Busca una pieza por id en una ranura del catálogo. */
export function pieza(cat, ranura, id) {
  return (cat[ranura] || []).find((p) => p.id === id) || null;
}

/**
 * Empuje de la hélice comparada con la de referencia del motor:
 *  más chica -> mucho menos empuje (área de disco); más grande -> el motor no la gira a full.
 *  más grande -> más eficiente (gramos por watt) pero más lenta de reacción.
 */
export function factorHelice(pulgadas, ref) {
  const r = pulgadas / ref;
  return {
    empuje: r < 1 ? r ** 2 : r ** 0.5,
    eficiencia: r ** 0.6,
    respuesta: (5 / pulgadas) ** 0.7,
  };
}

/**
 * Qué drones sabe volar el modelo: lo escribe el entrenador en modelo_web.json (meta.rango_fisica)
 * cuando entrena con física al azar. Un modelo sin ese dato se entrenó con un solo dron (0.6 kg,
 * empuje/peso 2.5): solo vuela bien drones muy parecidos.
 */
export function rangoModelo(meta) {
  return meta?.rango_fisica ?? { twr: [2.2, 2.8], masa_kg: [0.5, 0.75] };
}

/** Lo que trae todo dron si no se elige otra cosa (el ESC del kit, la radio del ESP32, cámara atornillada). */
export const POR_DEFECTO = { esc: "esc20", radio: "rx_espnow", montaje: "mt_tornillos" };

/**
 * build = { chasis, motores, helices, bateria, controladora, camara, esc, radio, montaje, extras: [], software }
 * (ids del catálogo; esc/radio/montaje tienen valor por defecto). modeloMeta = el `meta` de
 * models/modelo_web.json (opcional). Devuelve las estadísticas del dron y, si no se puede armar, `errores`.
 */
export function calcular(build, cat, modeloMeta = null) {
  const errores = [];
  let ch = pieza(cat, "chasis", build.chasis);
  // un chasis impreso con tu propio diseño (STL): su peso, su tamaño y las hélices que caben salen del archivo
  if (ch && build.chasisStl) ch = { ...ch, ...build.chasisStl };
  const mo = pieza(cat, "motores", build.motores);
  const he = pieza(cat, "helices", build.helices);
  const ba = pieza(cat, "baterias", build.bateria);
  const fc = pieza(cat, "controladoras", build.controladora);
  const ca = pieza(cat, "camaras", build.camara);
  const es = pieza(cat, "escs", build.esc || POR_DEFECTO.esc);
  const rx = pieza(cat, "radios", build.radio || POR_DEFECTO.radio);
  const mt = pieza(cat, "montajes", build.montaje || POR_DEFECTO.montaje);
  const ex = (build.extras || []).map((id) => pieza(cat, "extras", id)).filter(Boolean);
  for (const [nombre, p] of [["chasis", ch], ["motores", mo], ["hélices", he], ["batería", ba], ["controladora", fc], ["cámara", ca],
    ["ESC", es], ["radio", rx], ["montaje", mt]]) {
    if (!p) errores.push(`Falta ${nombre}.`);
  }
  if (errores.length) return { ok: false, errores };

  if (he.pulgadas > ch.helice_max) errores.push(`Las hélices de ${he.pulgadas}" no caben en el ${ch.nombre} (máx. ${ch.helice_max}").`);
  if (ba.celdas > mo.celdas[1]) errores.push(`${ba.celdas}S quema los ${mo.nombre} (máx. ${mo.celdas[1]}S).`);
  if (ba.celdas < mo.celdas[0]) errores.push(`Con ${ba.celdas}S los ${mo.nombre} no arrancan (mín. ${mo.celdas[0]}S).`);

  // masa
  const masa_g = cat.base.masa_g + (build.extraMasa_g || 0) + ch.masa_g + 4 * mo.masa_g + he.masa_g + ba.masa_g + fc.masa_g + ca.masa_g
    + es.masa_g + rx.masa_g + mt.masa_g + ex.reduce((s, e) => s + e.masa_g, 0);
  const mass = masa_g / 1000;

  // empuje: 4 motores x hélice x voltaje (con KV fijo, rpm ~ V y empuje ~ rpm^2)
  const fh = factorHelice(he.pulgadas, mo.helice_ref);
  const fv = Math.min(1, ba.celdas / mo.celdas[1]) ** 2;
  // el ESC: si da menos corriente que la que piden los motores a fondo, el empuje se queda corto (~ corriente^0.75)
  const fEsc = Math.min(1, es.corriente_a / (mo.corriente_a ?? es.corriente_a)) ** 0.75;
  const empuje_g = 4 * mo.empuje_g * fh.empuje * fv * (ba.empuje_factor ?? 1) * fEsc;
  const twr = empuje_g / masa_g;
  if (twr <= 1.05) errores.push(`No despega: empuje/peso ${twr.toFixed(2)} (necesita > 1.05).`);

  // arrastre (F = -c |v| v)
  const drag = ch.arrastre + ca.arrastre + ex.reduce((s, e) => s + (e.arrastre || 0), 0);

  // control: la controladora pone el ángulo y la respuesta; hélices grandes y poco empuje la frenan
  const fAgil = clip(Math.sqrt(twr / TWR_REF), 0.6, 1.2);
  const maxAngle = fc.angulo_max / ROT;
  const attResp = fc.respuesta * fh.respuesta * fAgil;
  const yawRate = Math.PI * mo.giro * fAgil;

  // batería: potencia para flotar = peso / eficiencia (g/W); la potencia crece con el empuje^1.5
  const wh = ba.celdas * V_CELDA * ba.mah / 1000;
  const potenciaHover_W = masa_g / (mo.eficiencia_gW * fh.eficiencia);
  const minutos = (wh * BATERIA_USABLE / potenciaHover_W) * 60;

  // velocidad máxima manteniendo la altura: T cos(a) = m g -> c v^2 = m g tan(a)
  const aMax = Math.min(maxAngle, Math.acos(Math.min(1, 1 / twr)));
  const velMax = Math.sqrt(mass * G * Math.tan(aMax) / drag);

  const da = new Set([...fc.ayudas, ...ex.flatMap((e) => e.da || []), ...(ch.protectores ? ["protectores"] : [])]);
  const precio = ch.precio + mo.precio + he.precio + ba.precio + fc.precio + ca.precio + es.precio + rx.precio + mt.precio
    + ex.reduce((s, e) => s + e.precio, 0);

  // vibración y nitidez (solo del juego: no cambia la física que ve la IA). Ver docs/HISTORIA.md.
  const gimbalVib = ca.gimbal ? (ca.gimbal_ejes === 2 ? 0.6 : 0.35) : 1;
  const vibracion = clip((mo.vib ?? 0.4) * (ch.rigidez ?? 1) * (es.filtro_rpm ? 0.75 : 1) * mt.vib * gimbalVib, 0, 1);
  const nitidez = 1 - 0.35 * vibracion;

  // software de IA: requisitos y si el dron está dentro de lo que el modelo sabe volar
  let ia = null;
  if (build.software) {
    const sw = pieza(cat, "software_ia", build.software);
    if (!sw) errores.push(`No existe el software ${build.software}.`);
    else {
      const falta = sw.requiere.filter((r) => !da.has(r));
      if (falta.length) errores.push(`${sw.nombre} necesita: ${falta.join(", ")}.`);
      const rango = rangoModelo(modeloMeta);
      const enRango = twr >= rango.twr[0] && twr <= rango.twr[1] && mass >= rango.masa_kg[0] && mass <= rango.masa_kg[1];
      ia = { id: sw.id, nombre: sw.nombre, tomas: sw.tomas, rango, enRango };
    }
  }

  return {
    ok: errores.length === 0, errores,
    masa_g, mass, empuje_g, twr, drag, maxAngle, attResp, yawRate,
    crashSpeed: ch.aguante_ms, radius: ch.radio_m,
    wh, potenciaHover_W, minutos, velMax,
    calidad: ca.calidad, gimbal: ca.gimbal, durabilidad: ch.durabilidad,
    ayudas: [...da], precio, ia, alcance_m: rx.alcance_m, vibracion, nitidez, escCorto: fEsc < 0.999,
  };
}

/** Los parámetros con la misma forma que `P` de game/sim.js. */
export function paramsFisica(st) {
  return {
    mass: st.mass, g: G, twr: st.twr, drag: st.drag, maxAngle: st.maxAngle, yawRate: st.yawRate,
    attResp: st.attResp, crashSpeed: st.crashSpeed, radius: st.radius, hover: 1 / st.twr,
  };
}

/** Potencia (W) con un gas dado en [0, 1]. Para descontar batería cada paso: wh -= W * dt / 3600. */
export function potencia(st, throttle) {
  const hover = 1 / st.twr;
  return st.potenciaHover_W * Math.max(0, throttle / hover) ** 1.5;
}
