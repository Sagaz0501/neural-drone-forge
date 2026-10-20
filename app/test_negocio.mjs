// Pruebas del negocio (app/negocio.js) y de los requisitos (app/requisitos.js): node app/test_negocio.mjs
import { readFileSync } from "fs";
import * as NG from "./negocio.js";
import * as TU from "./tutorial.js";
import * as SW from "./software.js";
import * as PT from "./partida.js";
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
ok(!N.ofrecidos.includes("casa_venta"), "después de la foto el video de la casa todavía no llega (sin el simulador E5 no lo puedes hacer con la IA)");
p.escenarios = [...(p.escenarios || ["despegar", "punto"]), "set_fotos"];
NG.especiales(p, D);
ok(N.ofrecidos.includes("casa_venta") && N.chats.marta.some((m) => m.especial === "casa_venta"), "con E5 (Set de fotos) llega el video de la casa (pedido especial ⭐)");

// 3) los días
const antes = N.pedidos.length;
const dia2 = NG.nuevoDia(p, D);
ok(N.dia === 2 && dia2.nuevos.length === 3, "día 2: 3 pedidos nuevos con poca reputación (fotos ★ para juntar plata)");
ok(N.pedidos.length === antes + 3, "los pedidos quedan guardados");
// vencer
const pe = dia2.nuevos[0];
for (let k = 0; k < 6; k++) NG.nuevoDia(p, D);
ok(pe.estado === "vencido", "un pedido sin hacer vence");
// lo que te piden depende de lo que tienes: con E1-E2 solo fotos de 1 (nada de video ni techo); con E5, sets y videos
{
  const f = partida({ rep: 3, escenarios: ["despegar", "punto"] });
  NG.asegurar(f, D);
  for (let k = 0; k < 12; k++) NG.nuevoDia(f, D);
  const pes = f.negocio.pedidos.filter((x) => !x.tutorial);
  ok(pes.length >= 20 && pes.every((x) => x.tipo === "foto" && x.n === 1), `con E1-E2: ${pes.length} pedidos, todos de 1 foto`);
  ok(new Set(pes.map((x) => x.plantilla)).size >= 3, "fotos variadas (fachada, jardín, la casa)");
  const mentiras = pes.filter((x) => x.mentira);
  ok(mentiras.length >= 1 && mentiras.every((x) => x.viento_real > x.viento && x.dia >= 3), `${mentiras.length} clientes dicen menos viento del que hay (desde el día 3)`);
  const m0 = mentiras.filter((x) => x.estado === "nuevo").at(-1) || mentiras[0], v0 = NG.paraVolar(f, D, m0);
  ok(v0.viento_ms === m0.viento_real && v0.viento_dicho === m0.viento, "el vuelo usa el viento real; el pedido muestra lo que dijo el cliente");
  if (m0.estado !== "nuevo") Object.assign(m0, { estado: "nuevo", limite: f.negocio.dia + 2 });   // (con otra semilla pudo vencer)
  NG.aceptar(f, D, m0.id); NG.entregar(f, D, m0.id, { estrellas: 2 });
  ok(D.trabajos.mentiras.despues.some((tx) => f.negocio.chats[m0.cliente].some((x) => x.txt === tx)), "al entregar, el cliente reconoce lo del viento");
  const g = partida({ rep: 3, escenarios: ["despegar", "punto", "linea", "foto_fija", "set_fotos"] });
  NG.asegurar(g, D);
  for (let k = 0; k < 15; k++) NG.nuevoDia(g, D);
  const tipos = new Set(g.negocio.pedidos.map((x) => x.tipo));
  ok(!f.negocio.ofrecidos.length, "con E1-E2 no llega ningún video especial de la campaña (ni la casa ni la finca)");
  ok(tipos.has("video") && tipos.has("inspeccion") && g.negocio.pedidos.some((x) => x.tipo === "foto" && x.n > 1), "con E5: también videos, techos y sets de fotos");
}
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
// modo desarrollador: empieza igual que el normal (el regalo de mamá y el tutorial)
const dv = partida({ modo: "dev", rep: 0 });
NG.asegurar(dv, D);
ok(NG.pasoTutorial(dv, {})?.paso === 1 && dv.negocio.pedidos.length === 1, "modo desarrollador: con tutorial, como el normal");

// el tutorial obligatorio: regalo -> nombre -> armar -> computador -> modelo (80 %) -> el primer cliente
{
  const q = partida({ rep: 0 });
  TU.pasarA(q, "armar");
  NG.asegurar(q, D);
  ok(q.negocio.espera && !q.negocio.pedidos.length && !q.negocio.contactos.length, "tutorial: mientras armas, nadie te escribe");
  NG.nuevoDia(q, D);
  ok(!q.negocio.pedidos.length, "tutorial: terminar el día no trae pedidos mientras esperas");
  ok(TU.pcCerrado(q) && TU.activo(q), "tutorial: el computador está cerrado mientras armas");
  ok(/hangar/.test(TU.notas(q, { pantalla: "taller", izq: "hangar", dron: "Chispa" })[0].html) && !TU.notas(q, { pantalla: "taller" })[0].saltable, "tutorial: armar primero, y no se puede saltar");
  TU.pasarA(q, "pc");
  ok(!TU.pcCerrado(q) && TU.notas(q, { pantalla: "taller" })[0].resaltar === "#b-computador", "tutorial: ya vuela -> el botón del computador brilla");
  const enPc = (apps) => TU.notas(q, { pantalla: "estudio", apps })[0].resaltar;
  ok(/data-w="apps"/.test(enPc({ abierta: false })), "tutorial: en el computador, primero abrir 🛍️ Apps");
  ok(/data-sw="mensajes"/.test(enPc({ abierta: true })) && /data-sw="simulador"/.test(enPc({ abierta: true, mensajes: true })), "tutorial: comprar Mensajes y después el Simulador (brilla el botón de comprar)");
  q.modo = "dev"; ok(/data-sw="ide"/.test(enPc({ abierta: true, mensajes: true })), "tutorial: en el modo desarrollador, el IDE"); delete q.modo;
  TU.pasarA(q, "modelo");
  const mods = [{ slug: "base", gen: 900, recientes: { 13: [[899, 0.95], [900, 0.95], [898, 0.9]] } },
    { slug: "chispa", base_de: "base", gen: 905, recientes: { 13: [[899, 0.95], [900, 0.95], [903, 0.7], [904, 0.9], [905, 0.9]] } }];
  const ex = TU.exitoFoto(mods, { base: 900 });
  ok(ex.slug === "chispa" && ex.filas === 3 && Math.abs(ex.exito - 0.8333) < 0.01, "tutorial: el 80 % cuenta solo lo entrenado después (no lo copiado del base)");
  ok(TU.exitoFoto([{ slug: "x", recientes: { 13: [[1, 1], [2, 1]] } }]).exito < TU.META_EXITO, "tutorial: con menos de 3 generaciones todavía no cuenta");
  ok(JSON.stringify(TU.candidatosFoto(mods, { base: 900 })) === '[{"slug":"chispa","filas":3}]', "tutorial: se evalúa sin ruido solo el modelo entrenado después del tour");
  ok(/Simuladores/.test(TU.notas(q, { pantalla: "estudio" })[0].html), "tutorial: en el computador, a entrenar en Simuladores");
  TU.pasarA(q, "cliente");
  NG.primerCliente(q, D);
  ok(!q.negocio.espera && q.negocio.pedidos.length === 1 && q.negocio.pedidos[0].tutorial, "tutorial: al 80 % llega el primer mensaje (Doña Marta)");
  ok(TU.notas(q, { pantalla: "taller" })[0].saltable, "tutorial: con el cliente ya se puede saltar");
}

// el software del computador (software.js): dos programas de fábrica, lo demás se compra en 🛍️ Apps
{
  const S = JSON.parse(readFileSync(new URL("./data/software.json", import.meta.url), "utf8"));
  const q = PT.nuevaPartida(), viejo = PT.nuevaPartida(); delete viejo.software;
  ok(SW.tieneApp(q, S, "apps") && SW.tieneApp(q, S, "tienda") && !SW.tieneApp(q, S, "mensajes") && !SW.tieneApp(q, S, "lab"), "software: de fábrica solo Apps y la Tienda");
  ok(SW.tieneApp(q, S, "ajustes"), "software: Ajustes es del sistema (no se compra)");
  ok(SW.tieneApp(viejo, S, "mensajes") && SW.tieneApp(viejo, S, "lab"), "software: una partida de antes tiene todo");
  const p0 = q.plata;
  ok(!SW.comprar(q, S, "mensajes") && SW.tieneApp(q, S, "mensajes") && q.plata === p0 - SW.programa(S, "mensajes").precio, "software: comprar Mensajes cobra y lo instala");
  ok(!!SW.comprar(q, S, "mensajes") && !!SW.comprar(q, S, "ide"), "software: no se compra dos veces, ni el IDE en el modo normal");
  ok(!SW.comprar(q, S, "simulador") && SW.tieneApp(q, S, "lab") && SW.tieneApp(q, S, "escenarios"), "software: el Simulador de IA abre el Laboratorio y los simuladores");
  const d = PT.nuevaPartidaDesarrollador();
  ok(SW.entrenar(d) === "ide" && !SW.comprar(d, S, "ide") && SW.tieneApp(d, S, "ide") && SW.tieneApp(d, S, "docs"), "software: en el modo desarrollador se compra el IDE (con la documentación)");
  const pobre = PT.nuevaPartida(); pobre.plata = 5;
  ok(!!SW.comprar(pobre, S, "simulador") && !SW.tieneApp(pobre, S, "lab"), "software: sin plata no se compra");
}

// una partida nueva empieza SIN modelos: ni la IA base ni los del juego; solo los que entrena ella
{
  const lista = [{ slug: "base" }, { slug: "corredor", reservado: true }, { slug: "sagaz" }, { slug: "mio" }];
  const n = PT.nuevaPartidaDesarrollador(), vieja = { ...PT.nuevaPartida() };
  delete vieja.modelos;
  ok(PT.enCero(n) && !PT.modelosVisibles(n, lista).length, "modelos: una partida nueva no ve ninguno (ni la base ni los del juego)");
  PT.anotarModelo(n, "mio");
  ok(PT.modelosVisibles(n, lista).map((m) => m.slug).join() === "mio", "modelos: solo ve los que entrenó ella");
  PT.anotarModelo(n, "mio2", "mio");
  ok(n.modelos.join() === "mio2", "modelos: renombrar cambia el de la lista");
  ok(PT.modelosVisibles(vieja, lista).map((m) => m.slug).join() === "base,sagaz,mio", "modelos: una partida de antes ve todos menos los del juego");
  // el tutorial del modo desarrollador en el IDE: abrir el ejemplo, cambiar la línea dron(…), ▶ Correr
  TU.pasarA(n, "modelo");
  const s = (ide) => ({ pantalla: "estudio", dron: "Chispa", drones: ["Chispa"], ide });
  const paso = (ide) => TU.notas(n, s(ide))[0].resaltar;
  ok(paso({ ide: false }) === '.es-icono[data-w="ide"]', "tutorial dev: primero abrir el IDE");
  ok(paso({ ide: true, menu: false }) === "#es-archivo-b" && paso({ ide: true, menu: true }) === '#es-ejemplos [data-ej="despegar"]', "tutorial dev (1/2): el menú de programas -> el ejemplo despegar");
  const ej = { ide: true, mision: "despegar", dron: { linea: 6, valor: "estandar" } };
  ok(/Línea 6/.test(TU.notas(n, s(ej))[0].html) && /1\/2/.test(TU.notas(n, s(ej))[0].html) && TU.lineaTuto(n, s(ej)) === 6, "tutorial dev: señala la línea dron(…) (👉 en el margen)");
  ok(TU.lineaTuto(n, s({ ...ej, mision: "foto" })) === null, "tutorial dev: otro programa abierto: no señala nada");
  const listo = { ...ej, dron: { linea: 6, valor: "chispa" } };
  ok(paso(listo) === "#es-correr" && TU.lineaTuto(n, s(listo)) === null, "tutorial dev: con tu dron, ▶ Correr");
  // aprobó Despegar (p.tuto.e1): el paso 2 es ir a un punto, partiendo de ese modelo
  n.tuto.e1 = "mi_piloto";
  ok(TU.pasoIA(n).nivel === 20 && paso({ ide: true, menu: true }) === '#es-ejemplos [data-ej="ir_a_punto"]', "tutorial dev (2/2): después, el ejemplo ir_a_punto (nivel 20)");
  ok(/desde=/.test(TU.notas(n, s({ ide: true, mision: "punto", dron: { linea: 6, valor: "chispa" } }))[0].html), "tutorial dev (2/2): ▶ Correr parte de lo que ya sabe");
  ok(TU.exitoFoto([{ slug: "a", recientes: { "20": [[5, 0.9], [6, 0.9], [7, 0.9]] } }], {}, 20)?.exito === 0.9 && !TU.exitoFoto([{ slug: "a", recientes: { "20": [[5, 0.9]] } }], {}, 19), "el éxito del tutorial se mide en el nivel del paso");
}

// el tutorial del primer dron (tutorial.js): las notas de arriba a la derecha
{
  const notas = (s) => TU.notas(dv, { hayDron: true, dron: "Madera", ...s });
  ok(TU.activo(dv) && notas({ pantalla: "taller" })[0].fija, "tutorial: la nota fija del paso va primero");
  ok(/Mensajes/.test(notas({ pantalla: "taller" })[0].html), "tutorial: sin leer el mensaje, la nota manda al computador");
  dv.negocio.tutorial = 1;
  ok(/hangar/.test(notas({ pantalla: "taller", izq: "hangar" })[0].html), "tutorial: después, tocar el dron en el hangar");
  ok(/mesa de trabajo/.test(notas({ pantalla: "banco", banco: { falta: "armar" } })[0].html), "tutorial: en el banco, el paso que falta");
  ok(/caja/.test(notas({ pantalla: "mesa", mesa: { modo: "armar", items: { caja: 3 } } })[0].html), "tutorial: en la mesa, abrir las cajas");
  const sol = notas({ pantalla: "mesa", mesa: { modo: "soldar", cautin: true, mano: { de: "XT60 · +", a: "ESC · BAT+", otraPlaca: null } } })[0].html;
  ok(/ESC · BAT\+/.test(sol) && /aro amarillo/.test(sol), "tutorial: con un cable en la mano, dice a qué pad va y lo señala");
  ok(/⏻/.test(notas({ pantalla: "mesa", mesa: { modo: "soldar", cautin: true, soldar: "ESC · BAT+", on: false } })[0].html), "tutorial: para soldar, primero prender la estación");
  const n1 = notas({ pantalla: "mesa", mesa: { modo: "soldar", cautin: true } }).length;
  TU.visto(dv, "soldar_como");
  ok(notas({ pantalla: "mesa", mesa: { modo: "soldar", cautin: true } }).length === n1 - 1, "tutorial: un consejo con Entendido no vuelve");
  TU.saltar(dv);
  ok(!TU.activo(dv) && !notas({ pantalla: "taller" }).length, "tutorial: Saltar el tutorial lo apaga");
  dv.tuto = null; dv.negocio.tutorial = 2;
  ok(!notas({ pantalla: "taller" }).length, "tutorial: termina con la primera foto");
}

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

// 3b) el reloj: un día despierto (7:00-23:00) = 30 min reales; los pedidos llegan a su hora y vencen a las 23:00
{
  const r = partida(); NG.asegurar(r, D);
  ok(NG.tick(r, D, 60) === null && r.negocio.hora === undefined, "reloj: no corre durante el tutorial");
  r.negocio.tutorial = 2;
  const t0 = NG.tick(r, D, 0);
  ok(r.negocio.reloj && Math.abs(r.negocio.hora - 9) < 1e-9 && t0.nuevos.length === 0 && !t0.dormir, "reloj: una partida de antes arranca a las 9:00");
  NG.nuevoDia(r, D);
  const ag = r.negocio.agenda.length, antes = r.negocio.pedidos.length;
  ok(r.negocio.hora === 7 && ag > 0 && r.negocio.agenda.every((x) => x.h >= 8 && x.h <= 19), `reloj: el día empieza a las 7:00 con ${ag} pedidos en la agenda (8:00-19:00)`);
  ok(r.negocio.pedidos.length === antes, "reloj: a las 7:00 todavía no llegó ninguno");
  const R = NG.reloj(D), segHora = (R.minutos * 60) / (R.duerme - R.despierta);
  let llegaron = 0, dormir = false, seg = 0;
  while (!dormir && seg < 4000) { const x = NG.tick(r, D, 5); llegaron += x.nuevos.length; dormir = x.dormir; seg += 5; }
  ok(llegaron === ag && r.negocio.agenda.length === 0, "reloj: llegan todos a lo largo del día");
  ok(Math.abs(seg - 16 * segHora) <= 5 && r.negocio.hora === 23, `reloj: de 7:00 a 23:00 en ${Math.round(seg / 60)} min reales`);
  const m = r.negocio.chats[r.negocio.pedidos.at(-1).cliente].at(-1);
  ok(typeof m.hora === "number" && m.hora >= 8, "reloj: el mensaje lleva su hora");
  ok(NG.fmtHora(14.42) === "14:25" && NG.fmtHora(7) === "7:00", "reloj: 14,42 -> 14:25");
  const pe = r.negocio.pedidos.at(-1), q = NG.queda(r, D, pe);
  ok(q.dias === pe.limite - r.negocio.dia && q.horas === q.dias * 16, "reloj: queda() en días y horas (a las 23:00 del último día)");
  // dormir con pedidos sin llegar: llegan al despertar
  NG.nuevoDia(r, D); NG.tick(r, D, 1);
  const pendientes = r.negocio.agenda.length, nPed = r.negocio.pedidos.length;
  const d3 = NG.nuevoDia(r, D);
  ok(r.negocio.pedidos.length >= nPed + pendientes && d3.nuevos.length >= pendientes, "reloj: si duermes temprano, los pedidos que faltaban llegan igual");
}
// al terminar el tutorial (día 1, 10:30) el reloj arranca y los pedidos de hoy llegan en lo que queda del día
{
  const r = partida(); NG.asegurar(r, D);
  const tut = r.negocio.pedidos[0];
  NG.aceptar(r, D, tut.id); NG.entregar(r, D, tut.id, { estrellas: 1 });
  r.negocio.hora = 10.5;
  NG.tick(r, D, 0);
  const ag = r.negocio.agenda;
  ok(ag.length > 0 && ag.every((x) => x.h >= 10.5 && x.h <= 19), `reloj: después del tutorial llegan ${ag.length} pedidos hoy (10:45-19:00), no hasta mañana`);
}
// con 1 estrella la relación también sube (si no, quedabas solo con Doña Marta)
{
  const r = partida(); NG.asegurar(r, D); r.negocio.tutorial = 2;
  const pe = NG.crearPedido(r, D, "marta", "foto_casa", 1, rngFijo);
  NG.entregar(r, D, pe.id, { estrellas: 1 });
  ok(r.negocio.relacion.marta === 1, "1 estrella: la relación con el cliente sube");
}

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
