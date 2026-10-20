// LA PLATA DE LA DEMO (docs/ECONOMIA.md): juega el camino de la demo con la lógica real del juego, sin pantalla, y
// falla si se traba. node app/test_economia.mjs [-v]   (-v = el libro de caja día a día)
//   partida nueva ($150) -> el regalo de mamá (el kit, gratis) -> 💬 Mensajes + 🧠 Simulador -> la foto de Doña Marta
//   -> cada día: entregar los pedidos con N estrellas y comprar lo siguiente del plan -> E3, E4, E5, E6 -> un SEGUNDO
//   dron para la finca (empuje/peso ≥ 2,2 + barómetro), sin desarmar el primero.
import { readFileSync } from "fs";
import * as PT from "./partida.js";
import * as NG from "./negocio.js";
import * as SW from "./software.js";
import * as ESC from "./escenarios.js";
import { DRONES_EJEMPLO } from "./parts.js";
import * as REQ from "./requisitos.js";

const leer = (f) => JSON.parse(readFileSync(new URL(`./data/${f}.json`, import.meta.url)));
const cat = leer("piezas"), S = leer("software"), E = leer("escenarios");
const D = { clientes: leer("clientes"), trabajos: leer("trabajos"), misiones: leer("misiones") };
const VER = process.argv.includes("-v");
let fallas = 0;
const ok = (c, msg) => { console.log(`${c ? "ok  " : "MAL "}  ${msg}`); if (!c) fallas++; };

/** El kit del garaje (main.js kitFaltan): las piezas del dron de madera que no tienes libres + lo básico para soldar. */
function kitFaltan(p, piezas = DRONES_EJEMPLO.madera) {
  const out = Object.entries(piezas).filter(([, id]) => !PT.libres(p, id).length).map(([slot, id]) => ({ ranura: PT.RANURA[slot], id, n: 1 }));
  if (!PT.cautinDe(p, cat)) out.push({ ranura: "soldadura", id: "cautin_lapiz", n: 1 });
  for (const [k, id, min] of [["estano", "estano", 3], ["flux", "flux", 1.5], ["cable", "cables", 2]]) if (PT.insumo(p, k) < min) out.push({ ranura: "soldadura", id, n: 1 });
  return out;
}
/** Un dron con estas piezas (compra lo que falte; el kit "regalo" no cobra). */
function armar(p, nombre, piezas, regalo = false) {
  const faltan = kitFaltan(p, piezas);
  const costo = regalo ? 0 : faltan.reduce((s, x) => s + PT.precioDe(p, cat[x.ranura].find((z) => z.id === x.id)) * x.n, 0);
  if (p.plata < costo) return null;
  const antes = p.plata, err = PT.comprarCarrito(p, cat, faltan, { regalo });
  if (err) throw new Error(err);
  if (antes - p.plata !== costo) throw new Error(`el kit cobró ${antes - p.plata} y decía ${costo}`);
  const d = PT.nuevoDron(p, nombre);
  for (const [slot, id] of Object.entries(piezas)) PT.instalar(p, d, slot, id);
  return d;
}

// el segundo dron: el de madera con motores 2204 (el más barato que vuela con viento: empuje/peso ~3)
const FINCA = { ...DRONES_EJEMPLO.madera, motores: "m2204", radio: "rx_espnow_ant" };   // + la antena: las tomas de la finca llegan a ~24-28 m

/**
 * Juega la demo entregando todo con `est` estrellas (0-3). plan = lo que compra, en orden. Devuelve
 * { dias (el día en que terminó el plan, o null), libro }.
 */
function jugar(est, semilla = 1, diasMax = 15) {
  const p = PT.nuevaPartida(), libro = [];
  armar(p, "Madera", DRONES_EJEMPLO.madera, true);                    // el regalo de mamá
  NG.asegurar(p, D);
  p.negocio.semilla = semilla;                                         // la misma partida cada vez (los pedidos salen de la semilla)
  const plan = [
    ["💬 Mensajes", () => SW.comprar(p, S, "mensajes")], ["🧠 Simulador", () => SW.comprar(p, S, SW.entrenar(p))],
    ["E3", () => ESC.comprar(p, E, "linea")], ["E4", () => ESC.comprar(p, E, "foto_fija")], ["E5", () => ESC.comprar(p, E, "set_fotos")],
    ["E6", () => ESC.comprar(p, E, "video_ruta")],
    ["2.º dron", () => (armar(p, "Finca", FINCA) ? null : "sin plata")],
  ];
  let i = 0, fin = null;
  const comprarLoQueSePueda = (dia) => {
    while (i < plan.length) {
      const antes = p.plata, err = plan[i][1]();
      if (err) break;
      libro.push({ dia, txt: plan[i][0], monto: p.plata - antes, saldo: p.plata });
      i++;
    }
    if (i === plan.length && fin === null) fin = dia;
  };
  // el día 1: el tutorial (los programas) y la foto de Doña Marta
  comprarLoQueSePueda(1);
  for (let dia = 1; dia <= diasMax && fin === null; dia++) {
    for (const pe of NG.pendientes(p)) {
      // solo lo que de verdad puedes hacer: un video con E6, y lo que el cliente no acepta sin (protectores, cámara) con
      // un dron que lo cumpla
      if (pe.tipo === "video" && !ESC.tiene(p, "video_ruta")) continue;
      if (!p.drones.some((d) => !REQ.cumple(pe.requisitos, PT.dronArmado(p, cat, d).stats, {}).duros.length)) continue;
      const antes = p.plata, r = NG.entregar(p, D, pe.id, { estrellas: est });
      if (r) libro.push({ dia, txt: `${NG.cliente(D, pe.cliente).nombre}: ${pe.titulo} (${"★".repeat(est) || "0 ★"})`, monto: p.plata - antes, saldo: p.plata });
    }
    comprarLoQueSePueda(dia);
    if (fin !== null) break;
    const r = NG.nuevoDia(p, D);
    if (r.arriendo) libro.push({ dia: dia + 1, txt: "Arriendo", monto: -r.arriendo, saldo: p.plata });
    if (!NG.pendientes(p).length) libro.push({ dia: dia + 1, txt: "⚠️ nadie escribió", monto: 0, saldo: p.plata });
  }
  return { p, dias: fin, libro };
}

const imprimir = (titulo, r) => {
  console.log(`\n--- ${titulo}: ${r.dias ? `listo el día ${r.dias}` : "NO LLEGÓ"} ---`);
  for (const x of r.libro) console.log(`  día ${String(x.dia).padStart(2)}  ${(x.monto >= 0 ? "+" : "") + x.monto}`.padEnd(20) + `$${String(x.saldo).padStart(4)}  ${x.txt}`);
};

// 1) el segundo dron sirve para la finca
{
  const p = PT.nuevaPartida(); p.plata = 999;
  const d = armar(p, "Finca", FINCA), st = PT.dronArmado(p, cat, d).stats;
  ok(st.ok && st.twr >= 2.2 && st.ayudas.includes("altura") && st.alcance_m >= 30, `el dron de la finca vuela con viento: empuje/peso ${st.twr.toFixed(2)} ≥ 2,2 + barómetro + radio ${st.alcance_m} m`);
  const costo = kitFaltan(PT.nuevaPartida(), FINCA).filter((x) => x.ranura !== "soldadura").reduce((s, x) => s + cat[x.ranura].find((z) => z.id === x.id).precio, 0);
  console.log(`      (cuesta $${costo} en piezas)`);
}

// 2) el camino de la demo con 1, 2 y 3 estrellas, en 40 partidas distintas (semillas): la mediana y la peor
const SEMILLAS = Array.from({ length: 40 }, (_, i) => 1 + i * 7919);
const resumen = (est) => {
  const ds = SEMILLAS.map((s) => jugar(est, s).dias ?? 99).sort((a, b) => a - b);
  return { mediana: ds[ds.length >> 1], peor: ds.at(-1), mejor: ds[0] };
};
const s1 = resumen(1), s2 = resumen(2), s3 = resumen(3);
const r1 = jugar(1), r2 = jugar(2), r3 = jugar(3);
if (VER) { imprimir("con 1 ★ (semilla 1)", r1); imprimir("con 2 ★ (semilla 1)", r2); imprimir("con 3 ★ (semilla 1)", r3); }
const txt = (s) => `día ${s.mediana} la mitad de las partidas, ${s.mejor}-${s.peor} todas`;
ok(s2.mediana <= 4 && s2.peor <= 5, `con 2 ★: E3-E6 + el segundo dron: ${txt(s2)} (meta: 4, máx. 5)`);
ok(s1.mediana <= 5 && s1.peor <= 6, `con 1 ★: ${txt(s1)} (meta: 5, máx. 6: más lento, pero llega)`);
ok(s3.mediana <= s2.mediana, `con 3 ★: ${txt(s3)}`);
ok(r1.p.drones.length === 2 && r1.p.drones.every((d) => PT.dronArmado(r1.p, cat, d)?.stats.ok), "terminas con los dos drones armados (el primero no se desarma)");

// 3) desde $0 siempre se puede seguir: sin plata, mañana igual llegan pedidos que tu dron de madera puede volar
{
  const { p } = jugar(1, 1, 2);
  p.plata = 0;
  let pedidos = 0;
  for (let k = 0; k < 6; k++) { NG.nuevoDia(p, D); const hoy = NG.pendientes(p).filter((x) => x.dia === p.negocio.dia); pedidos += hoy.length; ok(hoy.some((x) => x.dif === 1 && !x.requisitos.twr_min), `día ${p.negocio.dia} con $0: llega al menos un pedido fácil (dificultad 1, sin viento)`); for (const pe of NG.pendientes(p)) NG.entregar(p, D, pe.id, { estrellas: 1 }); }
  ok(p.plata > 0, `desde $0, entregando con 1 ★: $${p.plata} en 6 días`);
}

// 4) la plata no se pierde por el camino
{
  const p = PT.nuevaPartida(), antes = p.plata;
  armar(p, "Madera", DRONES_EJEMPLO.madera, true);
  ok(p.plata === antes, "el regalo de mamá no cobra nada");
  const q = PT.nuevaPartida(); q.plata = 10;
  ok(armar(q, "Madera", DRONES_EJEMPLO.madera, true) && q.plata === 10, "el regalo funciona aunque tengas menos plata que lo que vale");
  const c = PT.nuevaPartida(); c.plata = 100;
  ok(PT.comprar(c, cat, "soldadura", "estacion", 2) === null && c.plata === 55 && c.herramientas.filter((h) => h === "estacion").length === 1, "una herramienta se cobra una vez aunque pidas 2");
  const m = (r) => r.p.movimientos.reduce((s, x) => s + x.monto, 0);
  ok(m(r2) === r2.p.plata - PT.PLATA_INICIAL, `Finanzas cuadra: lo anotado (${m(r2)}) = lo que cambió la plata (${r2.p.plata - PT.PLATA_INICIAL})`);
}

console.log(fallas ? `\n${fallas} pruebas fallaron.` : "\nTodas las pruebas pasan.");
process.exit(fallas ? 1 : 0);
