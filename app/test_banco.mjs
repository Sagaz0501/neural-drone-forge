// Pruebas del banco de armado y de la partida v3: node app/test_banco.mjs
import { readFileSync, existsSync } from "fs";
import * as PT from "./partida.js";
import * as BA from "./banco.js";

const cat = JSON.parse(readFileSync(new URL("./data/piezas.json", import.meta.url)));
let fallas = 0;
const ok = (c, msg) => { console.log(`${c ? "ok  " : "MAL "}  ${msg}`); if (!c) fallas++; };
const store = {};
globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => (store[k] = v), removeItem: (k) => delete store[k] };

// 1) una partida v2 (como la de Santiago) se migra con el dron listo para volar
const v2 = { v: 2, plata: 3, rep: 14, inventario: { m2204: { vida: 100 }, cinewhoop3: { vida: 100 }, h3: { vida: 100 }, cam_accion: { vida: 100 },
  fc_f405: { vida: 100 }, b3s2200: { vida: 100 }, esc45: { vida: 100 }, esc35: { vida: 59 }, rx_elrs24: { vida: 100 }, mt_gomas: { vida: 100 },
  protectores: { vida: 100 }, tof: { vida: 100 }, m1806: { vida: 100 } },
  dron: { extras: ["protectores", "tof"], motores: "m2204", chasis: "cinewhoop3", helices: "h3", camara: "cam_accion", controladora: "fc_f405",
    bateria: "b3s2200", esc: "esc45", radio: "rx_elrs24", montaje: "mt_gomas" }, hechos: { casa_venta: 2 }, vuelos: 32, herramientas: ["impresora"],
  estilo: { color: "#2a2c30", acento: "#e8e8e8", forma: "x" } };
store["dronmaker.partida"] = JSON.stringify(v2);
const p = PT.cargar();
ok(p.v === 3 && p.drones.length === 1 && p.inventario.length === 13, "v2 -> v3: 13 unidades y 1 dron");
const d = p.drones[0], U = (uid) => PT.unidad(p, uid);
const b = PT.build(p, d);
ok(b.esc === "esc45" && b.extras.join() === "protectores,tof", "el dron migrado tiene las mismas piezas");
let e = BA.estado(cat, d, b, U, { impresora: true });
ok(e.listo, "el dron migrado está listo para volar: " + e.pasos.filter((x) => !x.ok).map((x) => x.k + ": " + x.nota).join(" | "));
ok(e.iaOk, "y tiene la IA base cargada");
const physOld = PT.dronArmado(p, cat, d).stats;
ok(Math.abs(physOld.twr - 0) > 0 && physOld.ok, `física igual: twr ${physOld.twr.toFixed(3)}`);

// 2) cambiar el ESC: hay que reinstalar, recablear el ESC, repetir humo y motores
ok(!PT.instalar(p, d, "esc", "esc35"), "cambiar al ESC de 35 A (la unidad libre)");
e = BA.estado(cat, d, PT.build(p, d), U, { impresora: true });
ok(!e.listo && !e.pasos.find((x) => x.k === "armar").ok, "con ESC nuevo: falta armar");
ok(d.banco.cables.every(([a, c]) => !a.startsWith("esc.") && !c.startsWith("esc.")), "se quitaron los cables del ESC viejo");
ok(e.pasos.find((x) => x.k === "firmware").ok, "el firmware vive en la controladora: sigue flasheado");

// 3) cableados malos
const comps = BA.componentes(cat, PT.build(p, d), d);
const man = BA.manual(comps);
ok(BA.revisar(comps, man).ok, "el cableado del manual pasa la revisión");
const swap = man.map(([a, c]) => [a === "xt60.pos" ? "xt60.neg" : a === "xt60.neg" ? "xt60.pos" : a, c]);
let r = BA.revisar(comps, swap);
ok(r.danos.some((x) => x.k === "esc" && /olaridad/.test(x.msg)), "batería al revés: se quema el ESC");
r = BA.revisar(comps, [...man, ["xt60.pos", "xt60.neg"]]);
ok(r.cortos && r.danos.some((x) => x.k === "xt60"), "+ con − de la batería: corto");
r = BA.revisar(comps, man.map(([a, c]) => (a === "rx.5v" ? ["rx.5v", "fc.vbat"] : [a, c])));
ok(r.danos.some((x) => x.k === "rx"), "receptor en VBAT: se quema el receptor");
r = BA.revisar(comps, man.map(([a, c]) => (a === "rx.tx" ? ["rx.tx", "fc.tx1"] : a === "rx.rx" ? ["rx.rx", "fc.rx1"] : [a, c])));
ok(!r.danos.length && r.fallas.some((x) => /TX va con RX/.test(x.msg)), "TX con TX: no quema, no funciona");
r = BA.revisar(comps, man.map(([a, c]) => (a === "tof.3v3" ? ["tof.3v3", "fc.5v"] : [a, c])));
ok(r.danos.some((x) => x.k === "tof"), "ToF a 5 V: se queman");
r = BA.revisar(comps, man.filter(([a]) => a !== "esc.m2"));
ok(r.faltan.some((x) => x.k === "mFR"), "falta un motor: lo dice");
r = BA.revisar(comps, man.map(([a, c]) => (a === "esc.m1" ? ["esc.m1", "mFL.fases"] : a === "esc.m4" ? ["esc.m4", "mRR.fases"] : [a, c])));
const pm = BA.pruebaMotores(r, { remap: ["m1", "m2", "m3", "m4"] }, { uid: "x", inv: {} }, "y");
ok(r.ok && pm[0].pos === "FL" && !pm[0].ok, "motores cruzados: M1 gira adelante izquierda (se arregla con el remap)");
const pm2 = BA.pruebaMotores(r, { remap: ["m4", "m2", "m3", "m1"] }, { uid: "x", inv: {} }, "y");
ok(pm2.every((x) => x.pos === x.espera), "con el remap quedan en su lugar");
// el caso de Santiago (V3): bien soldado pero reordenado en espejo (izq. <-> der.); "Reordenar" con lo que se ve lo arregla
{
  const rb = BA.revisar(comps, man), fc = { remap: ["m3", "m4", "m1", "m2"] };
  const vistos = BA.pruebaMotores(rb, fc, { uid: "x", inv: {} }, "y").map((x) => x.pos);
  ok(vistos.join() === "RL,FL,RR,FR", "remap en espejo: M1 gira atrás izquierda");
  const padDe = {}; vistos.forEach((pos, i) => (padDe[pos] = fc.remap[i]));
  fc.remap = BA.ESPERA.map((pos) => padDe[pos]);
  ok(fc.remap.join() === "m1,m2,m3,m4" && BA.pruebaMotores(rb, fc, { uid: "x", inv: {} }, "y").every((x) => x.pos === x.espera), "Reordenar con lo que se vio lo deja en su lugar");
}

// 4) partida nueva: comprar 2 juegos de motores, armar dos drones
const q = PT.nuevaPartida();
q.plata = 1000;
ok(!PT.comprarCarrito(q, cat, [{ ranura: "motores", id: "m2204", n: 2 }, { ranura: "chasis", id: "madera", n: 2 }]), "carrito: 2 motores + 2 chasis");
ok(PT.unidades(q, "m2204").length === 2 && q.plata === 1000 - 90 - 30, "plata y unidades bien");
const d1 = PT.nuevoDron(q, "Casero"), d2 = PT.nuevoDron(q, "Otro");
ok(!PT.instalar(q, d1, "motores", "m2204") && !PT.instalar(q, d2, "motores", "m2204"), "cada dron toma su juego de motores");
ok(PT.instalar(q, PT.nuevoDron(q, "Tercero"), "motores", "m2204"), "no hay un tercero libre");
ok(typeof PT.vender(q, cat, d1.slots.motores) === "string", "no se vende lo que está puesto");
PT.quitar(q, d1, "motores");
ok(PT.vender(q, cat, PT.unidades(q, "m2204").find((u) => !PT.dronDe(q, u.uid)).uid) === 18, "vender usado: 40 %");

// 5) modo desarrollador: dos drones armados y listos para volar, todo abierto
{
  const { DRONES_EJEMPLO, EXTRAS_EJEMPLO } = await import("./parts.js");
  const pd = PT.nuevaPartidaDev(cat, { "Madera (dev)": DRONES_EJEMPLO.madera, "Cine (dev)": DRONES_EJEMPLO.cine }, { "Cine (dev)": EXTRAS_EJEMPLO.cine });
  ok(pd.modo === "dev" && pd.drones.length === 2 && pd.herramientas.includes("impresora"), "partida dev: 2 drones y todas las herramientas");
  for (const dd of pd.drones) {
    const ee = BA.estado(cat, dd, PT.build(pd, dd), (u) => PT.unidad(pd, u), { impresora: true });
    ok(ee.listo && PT.dronArmado(pd, cat, dd).stats.ok, `"${dd.nombre}" listo para volar: ${ee.pasos.filter((x) => !x.ok).map((x) => x.k + ": " + x.nota).join(" | ")}`);
  }
}

if (existsSync(new URL("../partida.json", import.meta.url))) {
  store["dronmaker.partida"] = readFileSync(new URL("../partida.json", import.meta.url), "utf8");
  const pr = PT.cargar();
  ok(pr.v === 3 && pr.drones.length > 0, `tu partida.json carga: ${pr.drones.length} drones, ${pr.inventario.length} unidades`);
  for (const dr of pr.drones) {        // solo informa: un dron a medio armar no es una falla
    const er = BA.estado(cat, dr, PT.build(pr, dr), (u) => PT.unidad(pr, u), { impresora: PT.tieneHerramienta(pr, "impresora") });
    console.log(`      "${dr.nombre}": ${er.listo ? "listo" : "falta " + er.pasos.filter((x) => !x.ok).map((x) => x.k).join(", ")}`);
  }
}
console.log(fallas ? `\n${fallas} pruebas fallaron.` : "\nTodas las pruebas pasan.");
process.exit(fallas ? 1 : 0);
