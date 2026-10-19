// Pruebas de la demo (app/demo.js): hasta dónde llega y cuándo sale el final. node app/test_demo.mjs
import { readFileSync } from "fs";
import * as DM from "./demo.js";
import * as NG from "./negocio.js";
import * as ESC from "./escenarios.js";

const leer = (f) => JSON.parse(readFileSync(new URL(`./data/${f}.json`, import.meta.url)));
const E = leer("escenarios"), D = { clientes: leer("clientes"), trabajos: leer("trabajos"), misiones: leer("misiones") };
let fallas = 0;
const ok = (c, msg) => { console.log(`${c ? "ok  " : "MAL "}  ${msg}`); if (!c) fallas++; };
const tt = (s, v = {}) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? "");

ok(DM.ACTIVA, "la demo está activa (ACTIVA = false para el juego completo)");
ok(["despegar", "punto", "linea", "foto_fija", "set_fotos", "video_ruta", "repaso_metas"].every((id) => !DM.fuera(E, id)), "E1-E6 (y repasar metas) entran en la demo");
ok(["repaso_columnas", "video_viento", "video_postes", "entrega", "carrera", "persecucion"].every((id) => DM.fuera(E, id)), "E7-E12 quedan para el juego completo");

// la partida llega a E6: E7 y E8 se ven, pero cerrados hasta la finca
const p = { plata: 999, rep: 9, hechos: {}, vuelos: 0, drones: [], escenarios: ["despegar", "punto", "linea", "foto_fija", "set_fotos", "video_ruta"] };
ok(DM.escenario(p, E, "video_viento") === "finca" && DM.escenario(p, E, "repaso_columnas") === "finca", "antes de la finca: E7 y E8 dicen «entrega el video de la finca»");
ok(DM.escenario(p, E, "video_postes") === null && ESC.estado(p, E, "video_postes") === "bloqueado", "E9: bloqueado como siempre");
ok(DM.escenario(p, E, "video_ruta") === null, "E6 (ya tuyo): normal");
ok(!DM.terminada(p), "la demo no terminó");

// los pedidos especiales: la casa y la finca sí; el restaurante (y lo demás), para el juego completo
NG.asegurar(p, D); p.negocio.tutorial = 2;
const llegan = NG.especiales(p, D).map((x) => x.id);
ok(llegan.includes("finca") && llegan.includes("casa_venta") && !llegan.includes("restaurante"), `especiales con reputación 9: ${llegan.join(", ")} (sin el restaurante)`);
ok(DM.pedidoFuera("restaurante") && !DM.pedidoFuera("finca"), "el tablero de la campaña cierra lo de después de la finca");

// la pista 🎯: el segundo dron, E6, la finca
ok(DM.pista(p, { finca: true, sirven: [], e6: true }, tt).includes("+ Nuevo dron"), "pista: la finca pide otro dron (el de madera no alcanza)");
ok(DM.pista(p, { finca: true, sirven: ["Halcón"], e6: false }, tt).includes("E6"), "pista: comprar E6");
ok(DM.pista(p, { finca: true, sirven: ["Halcón"], e6: true }, tt).includes("Halcón"), "pista: volar la finca con el dron que sirve");
ok(DM.pista(p, { finca: false, sirven: [], e6: true }, tt) === null, "pista: nada si la finca todavía no llegó");

// entregaste la finca: E7 y E8 se abren, pero comprarlos = el final de la demo
p.hechos.finca = 2;
ok(DM.terminada(p), "la finca entregada: la demo terminó");
ok(DM.escenario(p, E, "video_viento") === "fin" && DM.escenario(p, E, "repaso_columnas") === "fin", "después de la finca: Comprar E7/E8 = el final de la demo");
ok(DM.pista(p, { finca: true, sirven: ["Halcón"], e6: true }, tt).includes("Simuladores"), "pista: se abrió un simulador nuevo");
p.demoFin = { dia: 9 };
ok(DM.pista(p, { finca: true, sirven: ["Halcón"], e6: true }, tt) === null, "pista: ya vio el final, no insiste");
ok(DM.STEAM_URL.startsWith("https://") && DM.WEB_URL.startsWith("https://"), "los enlaces del final");

console.log(fallas ? `\n${fallas} pruebas fallaron.` : "\nTodas las pruebas pasan.");
process.exit(fallas ? 1 : 0);
