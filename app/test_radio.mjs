// La radio del freestyle (app/radio.js): rates, gas, calibración, perfiles, armar y modos. node app/test_radio.mjs
import * as RA from "./radio.js";
let fallas = 0;
const ok = (c, msg) => { console.log(`${c ? "ok  " : "MAL "}  ${msg}`); if (!c) fallas++; };
const cerca = (a, b, e = 1e-6) => Math.abs(a - b) < e;
const num1 = (x, d = 1) => x.toFixed(d).replace(".", ",");

// rates (Betaflight): rc 1, super 0.7 -> 200 / 0.3 = 666,7 °/s a fondo; al centro 0; simétrica
ok(cerca(RA.maxRate({ rc: 1, sup: 0.7, expo: 0 }), 666.6667, 0.01), "rates: RC 1 + super 0,7 = 667 °/s a fondo (como Betaflight)");
ok(RA.rateBF(0, RA.PRESETS.freestyle.rp) === 0 && cerca(RA.rateBF(-0.5, { rc: 1, sup: 0.7 }), -RA.rateBF(0.5, { rc: 1, sup: 0.7 })), "rates: 0 al centro y simétrica");
ok(RA.rateBF(0.3, { rc: 1, sup: 0, expo: 0.5 }) < RA.rateBF(0.3, { rc: 1, sup: 0, expo: 0 }), "rates: el expo suaviza el centro");
ok(RA.maxRate({ rc: 1, sup: 0, expo: 0.5 }) === 200, "rates: el expo no cambia el máximo");
ok(RA.maxRate(RA.PRESETS.cinematico.rp) < RA.maxRate(RA.PRESETS.principiante.rp) && RA.maxRate(RA.PRESETS.principiante.rp) < RA.maxRate(RA.PRESETS.freestyle.rp), "presets: cinemático < principiante < freestyle");
// gas
ok(RA.gasCurva(0) === 0 && RA.gasCurva(1) === 1 && cerca(RA.gasCurva(0.5, { mid: 0.5, expo: 0.6 }), 0.5), "gas: 0 → 0, 1 → 1, el medio queda");
ok(cerca(RA.gasCurva(0.3), 0.3), "gas: sin expo es lineal");
const g1 = RA.gasCurva(0.45, { mid: 0.4, expo: 0.8 }), g2 = RA.gasCurva(0.45, { mid: 0.4, expo: 0 });
ok(Math.abs(g1 - 0.4) < Math.abs(g2 - 0.4), "gas: el expo aplana alrededor del hover");
// calibración
let cal = RA.nuevaCalibracion(3);
for (const a of [[-0.8, 0.1, -0.95], [0.9, -0.7, 0.92], [0.05, 0.6, -0.1]]) RA.calibrarMuestra(cal, a);
cal = RA.calibrarCentro(cal, [0.05, 0.0, 0.01]);
ok(cal[0].min === -0.8 && cal[0].max === 0.9 && cal[0].cen === 0.05, "calibrar: mín, máx y centro por eje");
ok(cerca(RA.normEje(0.9, cal[0]), 1) && cerca(RA.normEje(-0.8, cal[0]), -1) && cerca(RA.normEje(0.05, cal[0]), 0), "calibrar: los extremos dan ±1 y el centro 0 (aunque no sea simétrico)");
ok(cerca(RA.normEje(-0.95, cal[2], { gas: true }), 0) && cerca(RA.normEje(0.92, cal[2], { gas: true }), 1), "gas calibrado: abajo 0, arriba 1");
ok(RA.normEje(0.04, { min: -1, cen: 0, max: 1 }, { dz: 0.05 }) === 0 && RA.normEje(-1, { min: -1, cen: 0, max: 1 }, { inv: true }) === 1, "zona muerta e invertir");
ok(RA.calibrarCentro(RA.nuevaCalibracion(1), [0])[0].max === 1, "calibrar: un eje que no se movió queda −1..1");
// perfiles y lectura
const radio = { id: "RadioMaster TX16S Joystick (Vendor: 1209)", mapping: "", axes: [0.5, -0.2, -1, 0.3, 1, -1], buttons: [] };
const mando = { id: "DualSense Wireless Controller", mapping: "standard", axes: [0, 0, 0, 0], buttons: Array(16).fill({ pressed: false }) };
ok(RA.esRadio(radio) && !RA.esRadio(mando), "detecta la radio (EdgeTX) y el mando");
const pr = RA.perfilPorDefecto(radio), lr = RA.leer(radio, pr);
ok(pr.ejes.gas.i === 2 && pr.armar.tipo === "eje" && cerca(lr.gas, 0) && cerca(lr.roll, 0.5, 0.01) && lr.armar === true && lr.modo === "angle", "radio AETR: gas abajo = 0, roll 0,5, interruptor armado, modo angle");
const pm = RA.perfilPorDefecto(mando);
ok(cerca(RA.leer({ ...mando, axes: [0, -1, 0, 0] }, pm).gas, 1) && cerca(RA.leer(mando, pm).gas, 0.5), "mando Modo 2: palanca izq. arriba = gas a fondo, al centro = 50 %");
ok(cerca(RA.leer({ ...mando, axes: [-1, 0, 0, 0] }, pm).yaw, 1) && cerca(RA.leer({ ...mando, axes: [0, 0, 0, -1] }, pm).pitch, 1), "mando: izq. a la izquierda = yaw +, der. arriba = pitch + (adelante)");
ok(cerca(RA.leer({ ...mando, axes: [0, 0, 0, -1] }, pm, { mando: 1 }).gas, 1), "mando Modo 1: el gas en la palanca derecha");
// armar como Betaflight
const est = { armado: false, antes: true };
ok(!RA.armado(est, true, 0).armado, "armar: con el interruptor ya arriba al empezar, no arma (hay que bajarlo y subirlo)");
RA.armado(est, false, 0);
ok(RA.armado(est, true, 0.5).motivo === "gas", "armar: con el gas arriba no arma");
RA.armado(est, false, 0);
ok(RA.armado(est, true, 0.02).armado && RA.armado(est, true, 0.9).armado, "armar: gas abajo + interruptor = armado, y sigue armado al subir el gas");
ok(!RA.armado(est, false, 0.9).armado, "desarmar: el interruptor abajo apaga los motores");
// modos
const eu = { roll: 0, pitch: 0 }, R = RA.PRESETS.freestyle;
const ac = RA.pedirGiro("acro", { roll: 1, pitch: 0, yaw: 0 }, eu, R);
ok(cerca(ac[0], (666.6667 * Math.PI) / 180, 1e-3), "acro: palanca a fondo = 667 °/s de roll");
ok(RA.pedirGiro("acro", { roll: 0, pitch: 0, yaw: 0 }, { roll: 0.8, pitch: 0 }, R)[0] === 0, "acro: al soltar NO se nivela");
ok(RA.pedirGiro("angle", { roll: 0, pitch: 0, yaw: 0 }, { roll: 0.5, pitch: 0 }, R)[0] < 0, "angle: al soltar se nivela solo");
ok(cerca(RA.pedirGiro("angle", { roll: 1, pitch: 0, yaw: 0 }, { roll: (55 * Math.PI) / 180, pitch: 0 }, R, { angulo: 55 })[0], 0), "angle: a fondo se queda en el ángulo máximo");
const hz = RA.pedirGiro("horizon", { roll: 1, pitch: 0, yaw: 0 }, { roll: (55 * Math.PI) / 180, pitch: 0 }, R);
ok(hz[0] > 5, "horizon: a fondo gira como acro (flips)");

// la sensación: Juego (mando, teclado) o Real (radio). Un cuerpo de prueba = el dron de los modos de radio (empuje/peso 6).
const FIS = { mass: 0.5, g: 9.81, twr: 6.0, drag: 0.02, attResp: 22, crashSpeed: 5.5, hover: 1 / 6 };
const cuerpo = (z = 3) => ({ s: { pos: [0, 0, z], vel: [0, 0, 0], roll: 0, pitch: 0, yaw: 0, throttle: 0 }, q: RA.qEuler(0, 0, 0), w: [0, 0, 0], thr: FIS.hover, tw: 0, p: FIS });
function volar(modo, juego, st, T, z = 3, alto = null) {
  const c = cuerpo(z), rates = RA.ratesDe({ rates: "freestyle" }, juego ? "juego" : "real");
  let t = 0;
  for (; t < T; t += 0.02) { RA.pasoRadio(c, { gas: 0.5, roll: 0, pitch: 0, yaw: 0, armado: true, modo, ...st }, { rates, juego }); if (alto && alto(c)) break; }
  return { c, t };
}
const deg = (r) => (r * 180) / Math.PI;
ok(RA.sensacionDe(pm) === "juego" && RA.sensacionDe(pr) === "real" && RA.sensacionDe(null) === "juego" && RA.sensacionDe({ ...pm, sensacion: "real" }) === "real",
  "sensación: mando y teclado = Juego, radio = Real, y se puede cambiar por control");
for (const modo of ["angle", "horizon", "acro"]) {
  const j = volar(modo, true, {}, 2).c, r = volar(modo, false, {}, 2).c;
  ok(Math.abs(j.s.pos[2] - 3) < 0.3 && r.s.pos[2] > 20, `${modo}: con el mando suelto, Juego flota (${num1(j.s.pos[2] - 3)} m en 2 s) y Real (gas absoluto al 50 %) se va para arriba (+${num1(r.s.pos[2] - 3)} m)`);
}
const vSube = volar("angle", true, { gas: 1 }, 1, 20).c.s.vel[2], vBaja = volar("angle", true, { gas: 0 }, 1, 20).c.s.vel[2];
ok(vSube > 6 && vBaja < -4, `Juego/Angle: el gas arriba sube (${num1(vSube)} m/s) y abajo baja (${num1(vBaja)} m/s)`);
ok(volar("angle", true, { gas: 0.5 }, 1, 0).c.s.pos[2] === 0, "Juego/Angle: en el piso con el gas al centro no despega solo");
const yaw90 = (juego, x) => volar("angle", juego, { yaw: x }, 3, 3, (c) => (c.s.yaw < 0 ? c.s.yaw + 2 * Math.PI : c.s.yaw) >= Math.PI / 2).t;
ok(yaw90(true, 1) < 0.33 && yaw90(true, 0.5) < 0.67, `Juego: girar 90° tarda ${num1(yaw90(true, 1), 2)} s a fondo y ${num1(yaw90(true, 0.5), 2)} s a media palanca (Fácil: 0,33 y 0,67)`);
const RJ = RA.ratesDe({ rates: "freestyle" }, "juego"), RR = RA.ratesDe({ rates: "freestyle" }, "real");
ok(RA.rateBF(0.3, RJ.rp) > RA.rateBF(0.3, RR.rp) * 1.2 && RA.rateBF(0.3, RJ.yaw) > 81, `Juego: con poca palanca (30 %) gira más: roll ${Math.round(RA.rateBF(0.3, RJ.rp))} °/s (Real ${Math.round(RA.rateBF(0.3, RR.rp))}), yaw ${Math.round(RA.rateBF(0.3, RJ.yaw))} °/s (Fácil 81)`);
ok(RA.maxRate(RJ.rp) >= 500 && RA.maxRate(RJ.yaw) >= 350, `Juego: a fondo ${Math.round(RA.maxRate(RJ.rp))} °/s de roll y ${Math.round(RA.maxRate(RJ.yaw))} °/s de yaw`);
const inc = volar("angle", true, { pitch: 1 }, 1.5).c, incR = volar("angle", false, { pitch: 1, gas: FIS.hover }, 1.5).c;
ok(deg(inc.s.pitch) > deg(incR.s.pitch) + 5 && Math.abs(inc.s.pos[2] - 3) < 1, `Juego/Angle: a fondo inclina ${Math.round(deg(inc.s.pitch))}° (Real ${Math.round(deg(incR.s.pitch))}°) sin perder altura`);
const t45 = (juego) => volar("angle", juego, { pitch: 1, gas: juego ? 0.5 : FIS.hover }, 1, 3, (c) => deg(c.s.pitch) > 45).t;
ok(t45(true) < t45(false), `Juego/Angle: llega a 45° en ${num1(t45(true), 2)} s (Real ${num1(t45(false), 2)} s)`);
let giro = 0, prev = 0;
const flip = volar("acro", true, { roll: 1, gas: 0.5 }, 2, 60, (c) => { let d = c.s.roll - prev; if (d < -Math.PI) d += 2 * Math.PI; if (d > Math.PI) d -= 2 * Math.PI; giro += d; prev = c.s.roll; return giro >= 2 * Math.PI; }).t;
ok(flip < 0.8, `Juego/Acro: un flip entero con la palanca a fondo en ${num1(flip, 2)} s`);
const suelto = (juego) => { const c = cuerpo(); c.q = RA.qEuler(0.52, 0, 0); for (let t = 0; t < 1.5; t += 0.02) RA.pasoRadio(c, { gas: 0.5, roll: 0, pitch: 0, yaw: 0, armado: true, modo: "acro" }, { rates: RJ, juego }); return deg(c.s.roll); };
ok(Math.abs(suelto(true)) < 8 && Math.abs(suelto(false) - 30) < 1, `Acro suave (Juego): suelto a 30° se endereza a ${Math.round(suelto(true))}° en 1,5 s; Real se queda en ${Math.round(suelto(false))}°`);
const rr = volar("angle", false, { gas: 0.5 }, 1).c;
ok(rr.thr > 0.45, "Real (radio): el gas sigue siendo absoluto (palanca al 50 % = 50 % de gas)");
// teclado: rampa
let kv = 0; for (let i = 0; i < 5; i++) kv = RA.rampa(kv, 1, 0.02);
let kv2 = kv; for (let i = 0; i < 20; i++) kv2 = RA.rampa(kv2, 1, 0.02);
let kv3 = 1; for (let i = 0; i < 5; i++) kv3 = RA.rampa(kv3, 0, 0.02);
ok(kv > 0.3 && kv < 0.5 && kv2 === 1 && kv3 < 0.15, `teclado: la tecla llega a ${num1(kv, 2)} en 0,1 s, a fondo en 0,25 s, y al soltar baja rápido`);
// asistente
ok(RA.detectarEje([0, 0, -1, 0], [0.02, -0.05, 0.98, 0.1])?.i === 2 && RA.detectarEje([0, 0], [0.1, 0.1]) === null, "asistente: detecta el eje que más se movió");
ok(RA.detectarEje([0, 0, -1], [0.9, 0, -1], [0])?.i == null, "asistente: no repite un eje ya asignado");
ok(RA.detectarBoton([false, false, false], [false, true, false]) === 1, "asistente: detecta el botón");

console.log(fallas ? `\n${fallas} pruebas fallaron.` : "\nTodas las pruebas pasan.");
process.exit(fallas ? 1 : 0);
