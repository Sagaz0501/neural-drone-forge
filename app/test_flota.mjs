// Pruebas de la flota (app/flota.js) y del vuelo sin pantalla (app/mision_sim.js), con vuelos de verdad y la IA base.
// node --import ./app/three_node.mjs app/test_flota.mjs     ("three" lo pide lugares.js: three_node.mjs lo resuelve)
import { readFileSync } from "fs";
import * as PT from "./partida.js";
import * as NG from "./negocio.js";
import { DRONES_EJEMPLO, EXTRAS_EJEMPLO } from "./parts.js";
import { MisionSim } from "./mision_sim.js";
import { volarFlota, porQueNo, motivo } from "./flota.js";
import { Policy } from "../game/sim.js";

const leer = (f) => JSON.parse(readFileSync(new URL(f, import.meta.url)));
const cat = leer("./data/piezas.json");
const D = { clientes: leer("./data/clientes.json"), trabajos: leer("./data/trabajos.json"), misiones: leer("./data/misiones.json") };
const base = new Policy(leer("../models/publico/modelo_web.json"));   // la IA base fija del repo (la misma en GitHub)
let fallas = 0;
const ok = (c, msg) => { console.log(`${c ? "ok  " : "MAL "}  ${msg}`); if (!c) fallas++; };
const rngFijo = Object.assign(() => 0.5, { entre: (x, y) => (x + y) / 2, int: (x) => x, uno: (xs) => xs[0] });

function partidaDev() {
  const p = PT.nuevaPartidaDev(cat, { "Madera (dev)": DRONES_EJEMPLO.madera, "Cine (dev)": DRONES_EJEMPLO.cine }, { "Cine (dev)": EXTRAS_EJEMPLO.cine });
  NG.asegurar(p, D);
  return p;
}
const ctxDe = (p, o = {}) => ({ P: () => p, cat, PT, ND: D, estadoDe: () => ({ listo: true }), iaDe: async () => ({ slug: "base", gen: 0, policy: base }), ...o });

// 1) el vuelo sin pantalla: con la misma semilla, el mismo vuelo
{
  const p = partidaDev(), d = p.drones[1], st = PT.dronArmado(p, cat, d).stats;
  const pe = NG.paraVolar(p, D, NG.crearPedido(p, D, "marta", "video_casa", 1, rngFijo));
  const a = await new MisionSim({ stats: st, pedido: pe, piloto: "ia", policy: base, seed: 11 }).correr();
  const b = await new MisionSim({ stats: st, pedido: pe, piloto: "ia", policy: base, seed: 11 }).correr();
  ok(a.puntaje === b.puntaje && a.t === b.t && a.tomas.length === 3, `mision_sim: misma semilla, mismo vuelo (puntaje ${a.puntaje}, ${a.t.toFixed(1)} s)`);
  ok(a.piloto === "ia" && a.tomas.every((x) => x.lista) && a.t < 150 + 60, "mision_sim: la IA base hace las 3 tomas del video y vuelve");
  const sinIA = await new MisionSim({ stats: st, pedido: pe, piloto: "yo", seed: 11 }).correr();
  ok(!sinIA.completa && sinIA.estrellas === 0, "mision_sim: sin piloto (nadie toca las palancas) no hay video");
}

// 2) la flota: dos drones, dos trabajos, de verdad
{
  const p = partidaDev(), [madera, cine] = p.drones;
  const f1 = NG.crearPedido(p, D, "marta", "foto_casa", 1, rngFijo), f2 = NG.crearPedido(p, D, "marta", "video_casa", 1, rngFijo);
  NG.asignar(p, D, f1.id, madera.id);
  NG.asignar(p, D, f2.id, cine.id);
  const avisos = [];
  const plata0 = p.plata, vuelos0 = p.vuelos || 0;
  const filas = await volarFlota(ctxDe(p), (a) => avisos.push(a), { semilla: 5 });
  ok(filas.length === 2 && filas.every((f) => f.r && f.ia === "base"), "volarFlota: vuela los 2 trabajos con la IA");
  ok(avisos.some((a) => a.i === 1 && a.f === 1), "volarFlota: avisa cómo va");
  ok(NG.flota(p).length === 0 && p.vuelos === vuelos0 + 2, "volarFlota: los drones vuelven (sin trabajos asignados) y cuenta los vuelos");
  for (const f of filas) {
    const entregado = f.pe.estado === "hecho";
    ok(entregado ? f.pago > 0 && f.r.estrellas >= 1 : f.pe.estado === "aceptado" && !!f.motivo,
      `${f.dron} · ${f.pe.titulo}: ${entregado ? `entregado ★${f.r.estrellas} +$${f.pago}` : `no entregó (${f.motivo}), sigue abierto`}`);
  }
  ok(p.plata - plata0 === filas.reduce((a, f) => a + f.pago, 0), "volarFlota: la plata sube lo que pagaron");
  const again = await volarFlota(ctxDe(p), null, { semilla: 5 });
  ok(again.length === 0, "volarFlota: sin trabajos asignados no vuela nada");
}

// 3) lo que no deja salir a un dron
{
  const p = partidaDev(), d = p.drones[0];
  const pe = NG.crearPedido(p, D, "lucia", "foto_restaurante", 2, rngFijo), vol = NG.paraVolar(p, D, pe);
  ok(/protectores/.test(porQueNo(ctxDe(p), d, vol) || ""), `porQueNo: el restaurante sin protectores ("${porQueNo(ctxDe(p), d, vol)}")`);
  const pe2 = NG.crearPedido(p, D, "marta", "foto_casa", 1, rngFijo), vol2 = NG.paraVolar(p, D, pe2);
  ok(porQueNo(ctxDe(p), d, vol2) === null, "porQueNo: la foto de la casa, sí");
  ok(!!porQueNo(ctxDe(p, { estadoDe: () => ({ listo: false }) }), d, vol2), "porQueNo: sin terminar en el banco, no");
  const u = p.inventario.find((x) => x.uid === d.slots.helices);
  if (u) { u.vida = 0; ok(!!porQueNo(ctxDe(p), d, vol2), "porQueNo: con piezas rotas, no"); u.vida = 100; }
  NG.asignar(p, D, pe2.id, d.id);
  const filas = await volarFlota(ctxDe(p, { iaDe: async () => null }), null, { semilla: 1 });
  ok(filas[0].motivo && !filas[0].r && pe2.estado === "aceptado", `volarFlota: sin IA no sale ("${filas[0].motivo}")`);
  ok(motivo({ crash: true }, [{}, {}]).includes("2") && motivo({ dead: true }).length > 0, "motivo: choque con daños, batería");
}

console.log(fallas ? `\n${fallas} pruebas fallaron.` : "\nTodas las pruebas pasan.");
process.exit(fallas ? 1 : 0);
