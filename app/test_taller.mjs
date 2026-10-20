// El oficio del taller (taller.js): envíos, tornillos, soldar y cómo cuenta cada junta en el cableado (banco.js).
//   node app/test_taller.mjs
import { readFileSync } from "fs";
import * as TA from "./taller.js";
import * as PT from "./partida.js";
import * as BA from "./banco.js";
import * as IM from "./impresion.js";
import { calcular } from "./parts.js";

let fallas = 0;
const ok = (c, msg) => { console.log(`${c ? "ok  " : "MAL "}  ${msg}`); if (!c) fallas++; };
const cat = JSON.parse(readFileSync(new URL("data/piezas.json", import.meta.url), "utf8"));
const pz = (r, id) => cat[r].find((x) => x.id === id);

// 1) envíos: lo del barrio hoy, lo bueno mañana, lo de lujo en 2 días
ok(TA.diasEnvio(pz("chasis", "madera")) === 0 && TA.diasEnvio(pz("chasis", "aluminio")) === 1 && TA.diasEnvio(pz("chasis", "carbono5")) === 1 && TA.diasEnvio({ etapa: 5 }) === 2, "días de envío por etapa (madera hoy, aluminio mañana)");
{
  const p = PT.nuevaPartida(); p.plata = 1000; p.rep = 30; p.negocio = { dia: 3 };
  PT.comprar(p, cat, "chasis", "aluminio", 1, { envio: true });
  PT.comprar(p, cat, "motores", "m1806", 1, { envio: true });
  PT.comprar(p, cat, "escs", "esc20", 1);
  const [al, mo, es] = p.inventario.slice(-3);
  ok(al.llega === 4 && al.caja && TA.enCamino(p, al) && !TA.enCaja(p, al), "el aluminio llega mañana (día 4), en caja");
  ok(!mo.llega && mo.caja && TA.enCaja(p, mo) && !TA.enCamino(p, mo), "los motores reciclados llegan hoy, en caja");
  ok(!es.caja && !es.llega, "sin envío (pruebas, regalos): sin caja");
  p.negocio.dia = 4;
  ok(!TA.enCamino(p, al) && TA.enCaja(p, al), "al día siguiente llegó: ahora hay que abrir la caja");
  ok(p.movimientos.length === 3 && p.movimientos.at(-3).monto === -pz("chasis", "aluminio").precio, "cada compra queda anotada en Finanzas");
}

// 2) tornillos: hasta el clic; si sigues apretando, la rosca se barre
{
  const T = TA.tornillo0();
  let ev = null;
  for (let i = 0; i < 100 && ev !== "clic"; i++) ev = TA.tickTornillo(T, 0.05, true);
  ok(ev === "clic" && T.estado === "apretado", "mantener apretado ~0,85 s: clic");
  ok(TA.tickTornillo(T, 0.1, false) === null && T.estado === "apretado", "soltar después del clic: queda apretado");
  const T2 = TA.tornillo0();
  let ev2 = null;
  for (let i = 0; i < 60 && ev2 !== "barrido"; i++) ev2 = TA.tickTornillo(T2, 0.05, true);
  ok(ev2 === "barrido" && T2.p < 1, "seguir apretando después del clic: rosca barrida");
  TA.tickTornillo(T2, 0.05, false);
  ok(T2.estado === "suelto", "soltar y volver a empezar");
  const T3 = TA.tornillo0();
  for (let i = 0; i < 8; i++) TA.tickTornillo(T3, 0.05, true);
  TA.tickTornillo(T3, 0.05, false);
  ok(T3.estado === "girando" && T3.p > 0 && T3.p < 1, "soltar antes del clic: el tornillo queda a medias");
}

// 3) soldar
const estacion = (temp, limpia = 1) => { const E = TA.estacion0(); E.on = true; E.set = temp; for (let i = 0; i < 300; i++) TA.tickEstacion(E, 0.05); E.limpia = limpia; return E; };
/** Una junta: calentar `antes` segundos, después calentar + estaño `con` segundos. */
function soldar({ temp = 330, pad = "chico", flux = true, antes = 1.2, con = 1.1, limpia = 1 }) {
  const E = estacion(temp, limpia), J = TA.junta0(pad);
  if (flux) { J.flux = true; J.fluxQueda = 1; }
  const evs = new Set();
  for (let x = 0; x < antes; x += 0.05) { TA.tickEstacion(E, 0.05, TA.PADS[pad].masa); evs.add(TA.tickJunta(J, E, 0.05, true, false)); }
  for (let x = 0; x < con; x += 0.05) { TA.tickEstacion(E, 0.05, TA.PADS[pad].masa); evs.add(TA.tickJunta(J, E, 0.05, true, true)); }
  return { J, r: TA.resultadoJunta(J), evs };
}
{
  const E = TA.estacion0(); E.on = true;
  let s = 0; while (E.temp < 300 && s < 30) { TA.tickEstacion(E, 0.1); s += 0.1; }
  ok(s > 3 && s < 12, `la estación tarda en calentar (${s.toFixed(1)} s hasta 300 °C)`);
  const fria = TA.estacion0(), J = TA.junta0();
  ok(TA.tickJunta(J, fria, 0.1, true, true) === "no_derrite" && J.estano === 0, "con el cautín frío el estaño no se derrite");
}
const buena = soldar({});
ok(buena.r.q === "buena" && buena.evs.has("derrite") && buena.evs.has("humo"), `calentar, flux y estaño: buena (${buena.J.estano.toFixed(2)} de estaño, ${Math.round(buena.J.tMax)} °C, el flux echa humo)`);
const sinCalentar = soldar({ antes: 0, con: 0.6 });
ok(sinCalentar.r.q !== "buena", `meter estaño sin calentar antes: no sale buena (${sinCalentar.r.q})`);
const sinFlux = soldar({ flux: false, temp: 270 });
ok(sinFlux.r.q === "fria", `sin flux y con poca temperatura: fría (${sinFlux.r.por})`);
const mucho = soldar({ con: 3 });
ok(mucho.r.q === "puente", `mucho estaño en un pad chico: puente (${mucho.J.estano.toFixed(2)})`);
ok(TA.resultadoJunta(mucho.J, false).q === "buena", "el mismo estaño sin pad al lado: no hace puente");
const quemado = soldar({ temp: 430, antes: 6, con: 0.8 });
ok(quemado.r.q === "levantado", `mucho calor mucho tiempo: pad levantado (${Math.round(quemado.J.tMax)} °C, ${quemado.J.tCalor.toFixed(1)} s)`);
const grandeFrio = soldar({ pad: "grande", temp: 300, antes: 0.6, con: 1.5 });
const grandeBien = soldar({ pad: "grande", temp: 380, antes: 3.5, con: 2.6 });
ok(grandeFrio.r.q !== "buena" && grandeBien.r.q === "buena", `el pad de la batería es grande: necesita más calor y tiempo (${grandeFrio.r.q} → ${grandeBien.r.q})`);
const sucia = soldar({ limpia: 0.15, antes: 0.5, con: 0 }), limpia = soldar({ limpia: 1, antes: 0.5, con: 0 });
ok(sucia.J.tMax < limpia.J.tMax - 40, `la punta sucia calienta menos (${Math.round(sucia.J.tMax)} vs ${Math.round(limpia.J.tMax)} °C)`);
ok(TA.peor(["buena", "fria", "buena"]) === "fria" && TA.peor(["buena", "buena", "buena"]) === "buena", "de las 3 juntas de un motor manda la peor");

// 4) el cableado que cuenta (banco.cableado): sin soldar no conduce, puente = corto, fría = aviso
{
  const b = { chasis: "madera", motores: "m1806", esc: "esc20", controladora: "fc_basica", bateria: "b2s1000", radio: "rx_espnow" };
  const d = { slots: {}, extras: [], banco: { cables: [], instalado: {} } };
  const comps = BA.componentes(cat, b, d);
  const B = { cables: BA.manual(comps) };
  ok(BA.cableado(comps, B).rev.ok, "partida vieja (cables sin juntas): cuenta como soldado bien");
  const k = (c) => TA.claveCable(c), bat = B.cables.find((c) => c.includes("esc.bat+"));
  B.juntas = { [k(bat)]: { q: "sin", n: 1, s: [] } };
  let r = BA.cableado(comps, B).rev;
  ok(!r.ok && r.faltan.some((x) => x.msg.includes("BAT+")), "un cable puesto pero sin soldar: falta");
  B.juntas[k(bat)] = { q: "fria", n: 1, s: [{ q: "fria" }] };
  r = BA.cableado(comps, B).rev;
  ok(r.ok && r.frias.length === 1, "soldadura fría: funciona en la mesa, pero queda el aviso");
  B.juntas[k(bat)] = { q: "puente", n: 1, s: [{ q: "puente" }] };
  r = BA.cableado(comps, B).rev;
  ok(r.cortos && r.danos.some((x) => x.k === "xt60"), "puente en los pads de la batería: corto (chispazo)");
  const rx = B.cables.find((c) => c.includes("fc.5v"));
  B.juntas = rx ? { [k(rx)]: { q: "puente", n: 1, s: [] } } : {};
  ok(TA.vecino(comps, "fc.5v") === "fc.3v3", "el pad vecino del 5V es el 3V3");
  B.juntas = { [k(bat)]: { q: "levantado", n: 1, s: [] } };
  r = BA.cableado(comps, B).rev;
  ok(r.faltan.some((x) => x.msg.includes("levantado")), "pad levantado: hay que volver a soldarlo");
  const motor = B.cables.find((c) => c.some((x) => x.endsWith(".fases")));
  ok(TA.juntasDe({ tipo: "m_out" }, { tipo: "m_in" }) === 3 && TA.placaDe(motor, comps).startsWith("esc."), "un motor son 3 juntas, en el ESC");
  ok(TA.esEnchufe({ tipo: "fc_conn" }) && TA.esEnchufe({ tipo: "ufl" }) && !TA.esEnchufe({ tipo: "tx" }), "el arnés y la antena se enchufan; lo demás se suelda");
}

// 5) desoldar: la bomba chupa de un golpe (solo con el estaño derretido) y la malla lo absorbe de a poco
{
  const E = estacion(340), J = TA.junta0("chico");
  J.estano = 2.6; J.flux = true;
  ok(TA.extraer(J) === 0 && J.estano === 2.6, "la bomba con el estaño frío no saca nada");
  for (let i = 0; i < 30; i++) TA.tickJunta(J, E, 0.05, true, false);
  const sacado = TA.extraer(J);
  ok(sacado > 1 && J.estano < 1.3, `con el estaño derretido, la bomba chupa ${sacado.toFixed(1)} de un golpe`);
  ok(TA.resultadoJunta(J).q !== "puente", "después de la bomba ya no hay puente");
  const J2 = TA.junta0("chico"); J2.estano = 2.5;
  for (let i = 0; i < 40; i++) TA.tickJunta(J2, E, 0.05, true, false, true);
  ok(J2.estano < 0.5, `la malla absorbe el estaño (${J2.estano.toFixed(2)} queda)`);
}
// 6) el cautín de lápiz (sin perilla, poca potencia) sufre con los pads grandes; la estación no
{
  const cat2 = JSON.parse(readFileSync(new URL("data/piezas.json", import.meta.url), "utf8"));
  const spec = (id) => cat2.soldadura.find((x) => x.id === id).cautin;
  const pad = (c) => { const E = TA.estacion0(spec(c)); E.on = true; if (!E.ajustable) E.set = spec(c).set; else E.set = 340; for (let i = 0; i < 300; i++) TA.tickEstacion(E, 0.05); const J = TA.junta0("grande"); for (let i = 0; i < 60; i++) { TA.tickEstacion(E, 0.05, TA.PADS.grande.masa); TA.tickJunta(J, E, 0.05, true, false); } return J.temp; };
  const lapiz = pad("cautin_lapiz"), est = pad("estacion");
  ok(lapiz < est - 25, `el pad de la batería en 3 s: lápiz ${Math.round(lapiz)} °C vs estación ${Math.round(est)} °C`);
}
// 7) insumos y herramientas de soldar
{
  const p = PT.nuevaPartida(); p.plata = 200;
  ok(!PT.cautinDe(p, cat) && PT.insumo(p, "estano") === 0, "una partida nueva no trae cautín ni estaño");
  PT.comprarCarrito(p, cat, [{ ranura: "soldadura", id: "cautin_lapiz", n: 1 }, { ranura: "soldadura", id: "estano", n: 2 }, { ranura: "soldadura", id: "flux", n: 1 }]);
  ok(PT.cautinDe(p, cat)?.id === "cautin_lapiz" && PT.insumo(p, "estano") === 20 && PT.insumo(p, "flux") === 5, "comprar el cautín (herramienta) y estaño ×2 + flux (insumos)");
  ok(PT.puedeComprar(p, cat, "soldadura", "cautin_lapiz") !== null, "el cautín no se compra dos veces");
  ok(PT.gastar(p, "flux", 0.25) && PT.insumo(p, "flux") === 4.75 && !PT.gastar(p, "flux", 10) && PT.insumo(p, "flux") === 4.75, "gastar flux; si no alcanza, no gasta");
  PT.comprar(p, cat, "soldadura", "estacion", 1);
  ok(PT.cautinDe(p, cat)?.id === "estacion", "con la estación, se usa la estación");
  const vieja = { v: 3, herramientas: [] };
  PT.asegurarTaller(vieja);
  ok(vieja.herramientas.includes("cautin_lapiz") && vieja.insumos.estano > 0, "una partida de antes: el garaje ya tenía un cautín viejo y algo de estaño");
}
// 8) un puente NO avisa en el paso de cablear: se descubre con el multímetro o al conectar la batería
{
  const b = { chasis: "madera", motores: "m1806", esc: "esc20", controladora: "fc_basica", bateria: "b2s1000", radio: "rx_espnow" };
  const d = { slots: {}, extras: [], banco: { cables: [], instalado: {} } };
  const comps = BA.componentes(cat, b, d), B = { cables: BA.manual(comps) };
  const bat = B.cables.find((c) => c.includes("esc.bat+"));
  B.juntas = { [TA.claveCable(bat)]: { q: "puente", n: 1, s: [{ q: "puente" }] } };
  const r = BA.cableado(comps, B).rev;
  ok(!r.faltan.length && r.danos.length, "con un puente: no falta nada (cablear ✓) pero algo se va a quemar");
}

// 9) el orden de montar: lo de abajo primero; lo de arriba tapa
{
  const hay = new Set(["chasis", "motores", "esc", "controladora", "bateria", "montaje", "camara"]);
  ok(TA.puedeMontar("esc", new Set(), hay)?.falta === "chasis", "sin chasis no se monta el ESC");
  ok(TA.puedeMontar("controladora", new Set(["chasis"]), hay)?.falta === "esc", "la controladora va encima del ESC");
  ok(TA.puedeMontar("esc", new Set(["chasis", "bateria"]), hay)?.tapa === "bateria", "con la batería puesta no se llega al ESC");
  ok(TA.puedeMontar("bateria", new Set(["chasis", "esc"]), hay)?.falta === "controladora", "la batería va al final del stack");
  ok(TA.puedeMontar("camara", new Set(["chasis"]), hay)?.falta === "montaje", "la cámara va en su soporte");
  ok(TA.puedeMontar("controladora", new Set(["chasis", "esc"]), hay) === null, "con el ESC puesto, la controladora sí");
  ok(TA.puedeDesmontar("esc", new Set(["chasis", "esc", "controladora"]))?.tapa === "controladora" && TA.puedeDesmontar("bateria", new Set(["bateria"])) === null, "para quitar el ESC hay que quitar la controladora");
  ok(TA.PROCEDIMIENTO.motores.some(([k, v]) => k === "voltear" && v) && TA.PROCEDIMIENTO.motores.some(([k, v]) => k === "tornillos" && v === "motores_abajo"), "los motores se atornillan por abajo (volteando el dron)");
}

// 10) ESP32: la cámara con gimbal (VIN de batería) va a los pads de batería del ESC; tiene dos UART (GPIO17/16 y 27/26)
{
  const b = { chasis: "carbono5", motores: "m2207", esc: "esc45", controladora: "fc_baro", bateria: "b4s2200", radio: "rx_elrs24", camara: "cam_gimbal2" };
  const d = { slots: {}, extras: [], banco: { cables: [], instalado: {} } };
  const comps = BA.componentes(cat, b, d), cab = BA.manual(comps);
  ok(cab.some(([a, c]) => a === "cam.vin" && c === "esc.bat+"), "ESP32 + gimbal: el VIN de la cámara al BAT+ del ESC");
  const r = BA.cableado(comps, { cables: cab }).rev;
  ok(r.ok, `y el banco lo acepta (la cámara recibe batería)${r.ok ? "" : ": " + [...r.faltan, ...r.fallas, ...r.danos].map((x) => x.msg).join(" · ")}`);
  const fc = comps.find((c) => c.k === "fc");
  ok(fc.pines.some((p) => p.id === "tx1" && p.bus === "UART1") && fc.pines.some((p) => p.id === "rx2" && p.bus === "UART2"), "el ESP32 tiene UART1 (GPIO27/26) y UART2 (GPIO17/16)");
}

// 9) la impresión 3D (impresion.js): la impresora es necesaria, el filamento se gasta, tarda horas, cabe o no, falla
{
  const p = PT.nuevaPartida(); p.plata = 1000; p.rep = 30; p.negocio = { dia: 1 };
  ok(!!PT.puedeComprar(p, cat, "chasis", "pla") && !!PT.puedeComprar(p, cat, "montajes", "mt_tpu"), "sin impresora no se compra el chasis para imprimir ni el soporte de TPU");
  ok(!PT.puedeComprar(p, cat, "chasis", "madera"), "el de madera (el camino de la demo) no necesita impresora");
  ok(!PT.comprar(p, cat, "impresion", "imp_mini") && PT.tieneImpresora(p) && IM.filamento(p, "pla") === 250, "la Forja Mini se compra y trae 250 g de PLA de muestra");
  ok(!PT.comprar(p, cat, "chasis", "pla"), "con impresora: el chasis para imprimir (la tornillería)");
  const u = p.inventario.at(-1);
  ok(!u.diseno, "llega sin imprimir");
  const imp = IM.impresora(cat, "imp_mini"), xo = { tipo: "chasis", uid: u.uid, forma: "x", diseno: { tipo: "forma", forma: "x" } };
  const g = IM.gramos(cat, xo, "pla", "25"), hh = IM.horas(cat, imp, g, "pla", "normal");
  ok(g === 170 && hh > 1.5 && hh < 3.2, `un chasis en X: ${g} g de PLA, ${hh.toFixed(2)} h en la Mini (1,5-3 h)`);
  ok(IM.horas(cat, IM.impresora(cat, "imp_x"), g, "pla") < hh * 0.5 && IM.horas(cat, imp, g, "pla", "fina") > hh * 1.4 && IM.horas(cat, imp, g, "petg") > hh, "la X es el doble de rápida; fina y PETG tardan más");
  ok(IM.gramos(cat, xo, "pla", "60") > g && IM.gramos(cat, xo, "pla", "15") < g, "más relleno = más gramos");
  ok(IM.cabe(imp, IM.huella(cat, xo)).ok && !IM.cabe(imp, IM.huella(cat, { tipo: "chasis", forma: "marco" })).ok && IM.cabe(IM.impresora(cat, "imp_pro"), IM.huella(cat, { tipo: "chasis", forma: "marco" })).ok, "el de marco (232 mm) no cabe en la cama de 180: en la Pro sí");
  ok(!IM.cabe(imp, IM.huella(cat, { tipo: "chasis", stl: { tam_mm: [150, 200, 12] } })).ok && IM.cabe(imp, IM.huella(cat, { tipo: "chasis", stl: { tam_mm: [175, 120, 12] } })).ok, "tu STL: cabe según su tamaño");
  ok(!!IM.puedeMaterial(cat, imp, "asa") && !IM.puedeMaterial(cat, IM.impresora(cat, "imp_x"), "asa") && !!IM.puedeMaterial(cat, imp, "tpu", xo) && !IM.puedeMaterial(cat, imp, "tpu", { tipo: "canopy" }), "ASA solo en la cerrada; un chasis de TPU no sirve (una carcasa sí)");
  ok(IM.probFallo(cat, imp, "petg") > IM.probFallo(cat, imp, "pla") && IM.probFallo(cat, IM.impresora(cat, "imp_x"), "pla") < IM.probFallo(cat, imp, "pla") && IM.probFallo(cat, imp, "pla", "rapida") > IM.probFallo(cat, imp, "pla"), "falla más el PETG, la calidad rápida y la impresora barata");
  ok(IM.probFallo(cat, imp, "pla", "normal", 0.99) > IM.probFallo(cat, imp, "pla", "normal", 0.5) * 1.8, "una pieza justa en la cama falla más (se levantan las puntas)");
  // imprimir: sin falla (rng que nunca falla)
  const op = { impresora: "imp_mini", material: "pla", relleno: "25", calidad: "normal" };
  const p2 = PT.nuevaPartida(); p2.plata = 1000; PT.comprar(p2, cat, "impresion", "imp_mini"); PT.comprar(p2, cat, "chasis", "pla");
  const u2 = p2.inventario.at(-1), q2 = { ...xo, uid: u2.uid };
  p2.insumos.pla = 100;
  ok(/filamento/i.test(IM.plan(p2, cat, q2, op).error || ""), "con 100 g de PLA no alcanza: falta filamento");
  PT.comprar(p2, cat, "impresion", "fil_pla");
  ok(IM.filamento(p2, "pla") === 1100, "un carrete de PLA = 1000 g más");
  const j = IM.empezar(p2, cat, q2, op, () => 0.99);
  ok(typeof j === "object" && IM.filamento(p2, "pla") === 1100 - 170 && !j.fallo, "empezar gasta los 170 g y no falla (rng alto)");
  ok(typeof IM.empezar(p2, cat, q2, op, () => 0.99) === "string", "la impresora ocupada no toma otro trabajo");
  IM.avanzar(p2, cat, j.h / 2);
  ok(j.estado === "imprimiendo" && Math.abs(IM.progreso(j) - 0.5) < 1e-6 && !u2.diseno, "a la mitad: sigue imprimiendo, el chasis todavía no está");
  const ev = IM.avanzar(p2, cat, j.h);
  ok(ev.length === 1 && ev[0].ev === "listo" && u2.diseno?.material === "pla" && u2.diseno.forma === "x" && u2.diseno.masa_g === 170, "terminó: el chasis queda en el inventario, impreso en PLA");
  ok(!IM.ocupada(p2, "imp_mini"), "la impresora queda libre");
  // un chasis de PETG con 60 % aguanta más que el de PLA (parts.js por PT.build)
  const d = PT.nuevoDron(p2, "Impreso");
  const b = { chasis: "pla", motores: "m2204", helices: "h5", bateria: "b3s1300", controladora: "fc_baro", camara: "cam_juguete" };
  for (const [slot, id] of Object.entries(b)) d.slots[slot] = slot === "chasis" ? u2.uid : PT.agregarUnidad(p2, id).uid;
  const stPla = calcular(PT.build(p2, d), cat);
  u2.diseno = { ...u2.diseno, ...IM.chasisImpreso(cat, q2, "petg", "60", "normal"), material: "petg" };
  const stPetg = calcular(PT.build(p2, d), cat);
  ok(stPetg.durabilidad > stPla.durabilidad && stPetg.crashSpeed > stPla.crashSpeed && stPetg.masa_g > stPla.masa_g, `PETG al 60 %: más aguante (${stPla.durabilidad} -> ${stPetg.durabilidad}, ${stPla.crashSpeed} -> ${stPetg.crashSpeed} m/s) y más peso`);
  // una falla: rng que falla (spaghetti al 50 %)
  const seq = [0, 0.99, 0.5]; let i = 0;
  const j2 = IM.empezar(p2, cat, q2, op, () => seq[i++ % seq.length]);
  ok(j2.fallo?.tipo === "spaghetti" && j2.fallo.en > 0.3 && j2.fallo.en < 0.9, `el azar decide: falla por ${j2.fallo?.tipo} al ${Math.round(j2.fallo?.en * 100)} %`);
  const antes = IM.filamento(p2, "pla");
  const ev2 = IM.avanzar(p2, cat, j2.h);
  ok(ev2[0]?.ev === "fallo" && j2.estado === "fallo" && IM.filamento(p2, "pla") === antes + (170 - j2.perdido) && j2.perdido === Math.round(170 * j2.fallo.en), `falló: se perdieron ${j2.perdido} g y vuelve el resto`);
  ok(!!IM.ocupada(p2, "imp_mini") && /tírala/.test(IM.plan(p2, cat, q2, op).error), "la cama queda ocupada con el desastre");
  ok(!IM.tirar(p2, j2.id) && !IM.ocupada(p2, "imp_mini"), "tirarla libera la cama");
  // cancelar
  const j3 = IM.empezar(p2, cat, q2, op, () => 0.99); const f3 = IM.filamento(p2, "pla");
  IM.avanzar(p2, cat, j3.h * 0.25); IM.cancelar(p2, j3.id);
  ok(j3.estado === "tirado" && Math.abs(IM.filamento(p2, "pla") - (f3 + 170 - Math.round(170 * 0.25))) < 1, "cancelar: se pierde lo impreso");
  // la carcasa de TPU y el soporte de TPU
  PT.comprar(p2, cat, "impresion", "fil_tpu");
  const jc = IM.empezar(p2, cat, { tipo: "canopy", dron: d.id, canopy: { tipo: "domo", masa_g: 12 }, masa_g: 12 }, { ...op, material: "tpu" }, () => 0.99);
  IM.avanzar(p2, cat, 99);
  ok(jc.estado === "listo" && d.canopy?.tipo === "domo" && d.canopy.material === "tpu", "la carcasa de TPU queda puesta en su dron");
  p2.rep = 30;
  const errTpu = PT.comprar(p2, cat, "montajes", "mt_tpu");
  ok(!errTpu && IM.filamento(p2, "tpu") === 500 - jc.g - 6, "el soporte de TPU gasta 6 g de TPU");
  // las partidas de antes: la impresora genérica es la Forja Mini
  const vieja = PT.asegurarTaller({ herramientas: ["impresora", "humo"], insumos: { estano: 1 } });
  ok(vieja.herramientas.includes("imp_mini") && !vieja.herramientas.includes("impresora") && vieja.insumos.pla === 500, "partida vieja: la impresora 3D pasa a ser la Forja Mini con 500 g de PLA");
}

console.log(fallas ? `\n${fallas} pruebas fallaron.` : "\nTodas las pruebas pasan.");
process.exit(fallas ? 1 : 0);
