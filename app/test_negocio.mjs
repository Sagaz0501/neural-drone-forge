// Pruebas del negocio (app/negocio.js) y de los requisitos (app/requisitos.js): node app/test_negocio.mjs
import { readFileSync } from "fs";
import * as NG from "./negocio.js";
import * as REQ from "./requisitos.js";

const leer = (f) => JSON.parse(readFileSync(new URL(`./data/${f}.json`, import.meta.url)));
const D = { clientes: leer("clientes"), trabajos: leer("trabajos"), misiones: leer("misiones") };
let fallas = 0;
const ok = (c, msg) => { console.log(`${c ? "ok  " : "MAL "}  ${msg}`); if (!c) fallas++; };
const partida = (extra = {}) => ({ plata: 150, rep: 0, hechos: {}, vuelos: 0, drones: [], ...extra });

// 1) los datos se entienden entre sí
for (const C of D.clientes.clientes) {
  ok(C.trabajos.every((id) => NG.trabajo(D, id)), `${C.id}: sus trabajos existen`);
  ok(C.msgs.gracias.length === 4 && C.msgs.hola.length && C.msgs.vencido.length, `${C.id}: mensajes de 0 a 3 estrellas, hola y vencido`);
  for (const id of C.trabajos) ok(!!C.msgs.pedido[NG.trabajo(D, id).tipo], `${C.id}: sabe pedir "${NG.trabajo(D, id).tipo}"`);
  if (C.recomendado_por) ok(!!NG.cliente(D, C.recomendado_por), `${C.id}: lo recomienda un cliente que existe`);
}
for (const T of D.trabajos.trabajos) {
  if (T.tomas_de) ok(!!D.misiones.pedidos.find((x) => x.id === T.tomas_de)?.tomas, `${T.id}: las tomas de "${T.tomas_de}" existen`);
  ok(["casa", "finca", "restaurante"].includes(T.lugar), `${T.id}: el lugar existe`);
}
for (const [id, cid] of Object.entries(D.clientes.especiales)) ok(D.misiones.pedidos.some((x) => x.id === id) && NG.cliente(D, cid), `pedido especial ${id} -> ${cid}`);

// 2) partida nueva: el tutorial
const p = partida();
NG.asegurar(p, D);
const N = p.negocio;
ok(N.contactos.length === 1 && N.contactos[0] === "marta", "partida nueva: solo escribe Doña Marta");
const tut = N.pedidos[0];
ok(tut && tut.tutorial && tut.tipo === "foto" && tut.n === 1 && tut.pago === 20 && tut.tomas[0].az === 0, "el primer pedido: 1 foto de frente, $20");
ok(NG.noLeidos(p) === 1, "1 mensaje sin leer");
ok(NG.pasoTutorial(p, { hayDron: false, dronListo: false }).paso === 1, "tutorial paso 1: abrir el celular");
NG.leer(p, "marta");
ok(NG.noLeidos(p) === 0, "leído");
NG.aceptar(p, D, tut.id);
ok(tut.estado === "aceptado" && N.tutorial === 1, "aceptar el pedido");
ok(NG.pasoTutorial(p, { hayDron: false }).paso === 2 && NG.pasoTutorial(p, { hayDron: true, dronListo: false }).paso === 3 && NG.pasoTutorial(p, { hayDron: true, dronListo: true }).paso === 4, "tutorial: kit -> banco -> volar");
const vol = NG.paraVolar(p, D, tut);
ok(vol.negocio && vol.lugar === "casa" && vol.tomas.length === 1 && vol.tomas[0].tipo === "fija" && vol.estrellas.length === 3, "paraVolar: el formato de misiones.json");
// entregar con 0 estrellas: no paga, sigue abierto
let r = NG.entregar(p, D, tut.id, { estrellas: 0 });
ok(r.pago === 0 && tut.estado === "aceptado", "0 estrellas: no paga y se puede repetir");
r = NG.entregar(p, D, tut.id, { estrellas: 3, fotos: 1 });
ok(r.pago === 26 && tut.estado === "hecho" && p.plata === 176, `3 estrellas: paga ×1,3 (${r.pago})`);
ok(p.movimientos?.length === 1 && p.movimientos[0].monto === 26 && p.movimientos[0].saldo === 176, "Finanzas: el pago queda anotado (0 estrellas no anota nada)");
ok(NG.pasoTutorial(p, {}) === null, "el tutorial terminó");
ok(N.ofrecidos.includes("casa_venta") && N.chats.marta.some((m) => m.especial === "casa_venta"), "después de la foto llega el video de la casa (pedido especial ⭐)");

// 3) los días
const antes = N.pedidos.length;
const dia2 = NG.nuevoDia(p, D);
ok(N.dia === 2 && dia2.nuevos.length === 1, "día 2: 1 pedido nuevo con poca reputación");
ok(N.pedidos.length === antes + 1, "el pedido queda guardado");
// vencer
const pe = dia2.nuevos[0];
for (let k = 0; k < 6; k++) NG.nuevoDia(p, D);
ok(pe.estado === "vencido", "un pedido sin hacer vence");
// más reputación: más pedidos, más difíciles, otros clientes
const q = partida({ rep: 15 });
NG.asegurar(q, D);
for (let k = 0; k < 10; k++) NG.nuevoDia(q, D);
const difs = q.negocio.pedidos.map((x) => x.dif);
ok(Math.max(...difs) >= 3 && q.negocio.contactos.length >= 3, `con reputación 15: dificultades hasta ${Math.max(...difs)}, ${q.negocio.contactos.length} clientes`);
ok(q.negocio.pedidos.filter((x) => x.dia === 5).length === 3, "3 pedidos por día con reputación 15");
const dificil = q.negocio.pedidos.find((x) => x.dif >= 3);
ok(dificil.requisitos.twr_min >= 2.2 && dificil.requisitos.barometro, `dificultad ${dificil.dif}: viento ${dificil.viento} m/s pide empuje/peso ${dificil.requisitos.twr_min} y barómetro`);
const p4 = q.negocio.pedidos.find((x) => x.dif === 4);
if (p4) ok(p4.requisitos.calidad_min === 50 && p4.pago >= 4 * NG.trabajo(D, p4.plantilla).pago, "dificultad 4: cámara 50 y paga ×4");
// mismo día, misma semilla: lo mismo
const a = partida({ rep: 8 }), b = partida({ rep: 8 });
NG.asegurar(a, D); NG.asegurar(b, D);
b.negocio.semilla = a.negocio.semilla;
b.negocio.pedidos = []; b.negocio.chats = {}; b.negocio.contactos = []; b.negocio.sig = 1;
a.negocio.pedidos = []; a.negocio.chats = {}; a.negocio.contactos = []; a.negocio.sig = 1;
NG.nuevoDia(a, D); NG.nuevoDia(b, D);
ok(JSON.stringify(a.negocio.pedidos) === JSON.stringify(b.negocio.pedidos), "con la misma semilla, el mismo día trae los mismos pedidos");
// recomendación
const c = partida({ rep: 0 });
NG.asegurar(c, D);
c.negocio.relacion.marta = 1;
const t2 = NG.crearPedido(c, D, "marta", "foto_casa", 1, Object.assign(() => 0.5, { entre: (x, y) => (x + y) / 2, int: (x) => x, uno: (xs) => xs[0] }));
const rr = NG.entregar(c, D, t2.id, { estrellas: 3 });
ok(rr.recomienda?.id === "ernesto", "relación 2 con Doña Marta: recomienda a Don Ernesto");
// arriendo
const ar = partida({ rep: 7 });
NG.asegurar(ar, D);
const plata0 = ar.plata;
for (let k = 0; k < 7; k++) NG.nuevoDia(ar, D);
ok(ar.plata === plata0 - D.trabajos.arriendo.monto, "cada 7 días se cobra el arriendo (con reputación ≥ 6)");
// modo desarrollador: sin tutorial
const dv = partida({ modo: "dev", rep: 30 });
NG.asegurar(dv, D);
ok(NG.pasoTutorial(dv, {}) === null && dv.negocio.pedidos.length >= 1, "modo desarrollador: sin tutorial, con pedidos");

// 3b) la flota: un pedido por dron, el tutorial no, al fallar el pedido sigue abierto, al vencer suelta al dron
const fl = partida({ modo: "dev", rep: 30, drones: [{ id: "d1", nombre: "Uno" }, { id: "d2", nombre: "Dos" }] });
NG.asegurar(fl, D);
const rngFijo = Object.assign(() => 0.5, { entre: (x, y) => (x + y) / 2, int: (x) => x, uno: (xs) => xs[0] });
const f1 = NG.crearPedido(fl, D, "marta", "foto_casa", 1, rngFijo), f2 = NG.crearPedido(fl, D, "marta", "video_casa", 1, rngFijo);
ok(NG.asignar(fl, D, f1.id, "d1").ok && f1.estado === "aceptado" && f1.flota === "d1", "flota: asignar acepta el pedido y le pone el dron");
ok(!NG.asignar(fl, D, f1.id, "nadie").ok, "flota: un dron que no está en el hangar, no");
const r2 = NG.asignar(fl, D, f2.id, "d1");
ok(r2.ok && r2.quitado?.id === f1.id && !f1.flota && NG.ocupado(fl, "d1")?.id === f2.id, "flota: un trabajo por dron (el nuevo le quita el anterior)");
NG.asignar(fl, D, f1.id, "d2");
ok(NG.flota(fl).length === 2, "flota: dos drones, dos trabajos");
NG.falloFlota(fl, D, f1.id, "Dos", "se estrelló");
ok(f1.estado === "aceptado" && !f1.flota && fl.negocio.chats.marta.at(-1).de === "sistema", "flota: si no entrega, el pedido sigue abierto y queda una nota en el chat");
const plataF = fl.plata;
NG.entregar(fl, D, f2.id, { estrellas: 2, piloto: "ia" });
ok(f2.estado === "hecho" && !f2.flota && fl.plata > plataF && NG.flota(fl).length === 0, "flota: entregar cobra y suelta al dron");
NG.asignar(fl, D, f1.id, "d2");
for (let k = 0; k < 6; k++) NG.nuevoDia(fl, D);
ok(f1.estado === "vencido" && !f1.flota && !NG.ocupado(fl, "d2"), "flota: un pedido vencido suelta al dron");
const tu = partida({ drones: [{ id: "d1", nombre: "Kit" }] });
NG.asegurar(tu, D);
ok(!NG.asignar(tu, D, tu.negocio.pedidos[0].id, "d1").ok, "flota: el pedido del tutorial lo vuelas tú");

// 3c) Fase 1b: cada trabajo dice qué misión del Laboratorio le enseña a la IA
const e1 = NG.paraVolar(fl, D, NG.crearPedido(fl, D, "marta", "foto_casa", 1, rngFijo)).entrenar;
const e2 = NG.paraVolar(fl, D, NG.crearPedido(fl, D, "marta", "inspeccion_casa", 2, rngFijo)).entrenar;
const e3 = NG.paraVolar(fl, D, NG.crearPedido(fl, D, "marta", "video_casa", 1, rngFijo)).entrenar;
ok(e1.nivel === 13 && e1.mision === "foto" && e2.nivel === 14 && e2.mision === "set_fotos" && e3.nivel === 11, "entrenarPara: 1 foto -> Foto (13), varias -> Set de fotos (14), video -> Grabar (11)");

// 4) requisitos
const st = { twr: 1.9, calidad: 30, alcance_m: 20, minutos: 4, ayudas: [], nitidez: 0.7 };
const L = REQ.requisitos({ twr_min: 2.2, barometro: true, protectores: true, calidad_min: 50 }, st, { segundos: 20, viento: 2.5, alcance: 25 });
ok(L.find((x) => x[1].includes("Empuje"))[0] === "no" && L.find((x) => x[1].includes("Radio"))[0] === "no" && L.find((x) => x[1].includes("Protectores"))[2], "requisitos: empuje/peso, radio y protectores (duro)");
ok(REQ.twrParaViento(2.5) === 2.2 && REQ.twrParaViento(0) === 0, "viento 2,5 m/s pide empuje/peso 2,2 (como la finca)");
const bueno = { twr: 2.6, calidad: 62, alcance_m: 500, minutos: 8, ayudas: ["altura", "protectores"], nitidez: 0.95 };
ok(REQ.cumple({ twr_min: 2.2, barometro: true }, bueno, { segundos: 20, viento: 2.5, alcance: 25 }).ok, "un dron que cumple todo: ok");
const orden = REQ.mejoresDrones([{ n: "malo", st }, { n: "bueno", st: bueno }], (d) => d.st, { twr_min: 2.2 }, { segundos: 20, alcance: 25 });
ok(orden[0].d.n === "bueno", "mejoresDrones: primero el que cumple");

console.log(fallas ? `\n${fallas} pruebas fallaron.` : "\nTodas las pruebas pasan.");
process.exit(fallas ? 1 : 0);
