// La radio del freestyle (app/radio.js): rates, gas, calibración, perfiles, armar y modos. node app/test_radio.mjs
import * as RA from "./radio.js";
let fallas = 0;
const ok = (c, msg) => { console.log(`${c ? "ok  " : "MAL "}  ${msg}`); if (!c) fallas++; };
const cerca = (a, b, e = 1e-6) => Math.abs(a - b) < e;

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
// asistente
ok(RA.detectarEje([0, 0, -1, 0], [0.02, -0.05, 0.98, 0.1])?.i === 2 && RA.detectarEje([0, 0], [0.1, 0.1]) === null, "asistente: detecta el eje que más se movió");
ok(RA.detectarEje([0, 0, -1], [0.9, 0, -1], [0])?.i == null, "asistente: no repite un eje ya asignado");
ok(RA.detectarBoton([false, false, false], [false, true, false]) === 1, "asistente: detecta el botón");

console.log(fallas ? `\n${fallas} pruebas fallaron.` : "\nTodas las pruebas pasan.");
process.exit(fallas ? 1 : 0);
