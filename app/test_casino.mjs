// Pruebas del casino (app/casino.js): node app/test_casino.mjs
import * as CA from "./casino.js";

let fallas = 0;
const ok = (c, msg) => { console.log(`${c ? "ok  " : "MAL "}  ${msg}`); if (!c) fallas++; };
const C = (txt) => { const s = { "♠": 0, "♥": 1, "♦": 2, "♣": 3 }[txt.at(-1)], r = { A: 1, J: 11, Q: 12, K: 13 }[txt.slice(0, -1)] ?? +txt.slice(0, -1); return { r, s }; };
const cs = (t) => t.split(" ").map(C);
/** Un rng que se puede repetir (mulberry32). */
const rngDe = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// la baraja
const m = CA.mazo(rngDe(1));
ok(m.length === 52 && new Set(m.map(CA.textoCarta)).size === 52, "la baraja: 52 cartas distintas");
ok(CA.mazo(rngDe(7)).map(CA.textoCarta).join() === CA.mazo(rngDe(7)).map(CA.textoCarta).join(), "la misma semilla, la misma baraja");

// la plata
const p = { plata: 100, movimientos: [] };
ok(CA.limites(100).max === 25 && CA.limites(1000).max === 50 && CA.limites(0).max === 0 && CA.limites(3).max === 1, "límites: hasta $50 o el 25 % de tu plata");
ok(CA.apostar(p, 26, "Blackjack") && p.plata === 100, "no deja apostar más del máximo");
ok(CA.apostar(p, 0, "Blackjack") && p.plata === 100, "ni $0");
ok(CA.apostar(p, 10, "Blackjack") === null && p.plata === 90 && p.movimientos.at(-1).monto === -10, "apostar $10: sale de la plata y queda en Finanzas");
CA.cobrar(p, 20, "Blackjack");
ok(p.plata === 110 && p.movimientos.at(-1).monto === 20, "cobrar: entra y queda anotado");
const pobre = { plata: 0, movimientos: [] };
ok(CA.apostar(pobre, 1, "Blackjack") && pobre.plata === 0, "sin plata no se apuesta (nunca queda en negativo)");

// blackjack: valores
ok(CA.valor(cs("A♠ K♥")) === 21 && CA.esBlackjack(cs("A♠ K♥")), "As + K = blackjack");
ok(CA.valor(cs("A♠ A♥ 9♦")) === 21 && CA.valor(cs("A♠ 9♥ 5♦")) === 15 && CA.valor(cs("K♠ Q♥ 5♦")) === 25, "el As vale 11 o 1");
// manos armadas a mano (el mazo se saca con pop: lo último sale primero)
const mano = (yo, cr, resto = []) => ({ juego: "bj", m: cs(resto.join(" ") || "2♣").reverse(), yo: cs(yo), cr: cs(cr), apuesta: 10, fin: false, pago: 0 });
let s = mano("10♠ 9♥", "10♦ 7♣"); CA.bjPlantarse(s);
ok(s.resultado === "ganas" && s.pago === 20, "19 contra 17: ganas (paga 1 a 1)");
s = mano("10♠ 7♥", "10♦ 7♣"); CA.bjPlantarse(s);
ok(s.resultado === "empate" && s.pago === 10, "17 contra 17: empate (te devuelve la apuesta)");
s = mano("10♠ 6♥", "10♦ 6♣", ["8♠"]); CA.bjPlantarse(s);
ok(s.resultado === "crupier_pasa" && s.pago === 20 && CA.valor(s.cr) === 24, "el crupier pide con 16 y se pasa");
s = mano("10♠ 6♥", "9♦ 7♣", ["Q♠"]); CA.bjPedir(s);
ok(s.resultado === "pasaste" && s.pago === 0, "pides con 16 y te pasas: pierdes");
s = mano("6♠ 5♥", "10♦ 7♣", ["10♠"]); CA.bjDoblar(s);
ok(s.apuesta === 20 && s.yo.length === 3 && s.resultado === "ganas" && s.pago === 40, "doblar con 11: una carta, apuesta doble");
// blackjack natural paga 3 a 2
let bj = null;
for (let k = 1; k < 2000 && !bj; k++) { const x = CA.bjEmpezar(10, rngDe(k)); if (x.resultado === "blackjack") bj = x; }
ok(bj && bj.fin && bj.pago === 25, "blackjack natural: paga 3 a 2 ($10 -> $25)");

// póker
ok(CA.manoPoker(cs("10♥ J♥ Q♥ K♥ A♥")) === "escalera_real", "escalera real");
ok(CA.manoPoker(cs("5♣ 6♣ 7♣ 8♣ 9♣")) === "escalera_color", "escalera de color");
ok(CA.manoPoker(cs("A♠ 2♥ 3♦ 4♣ 5♠")) === "escalera", "A-2-3-4-5 es escalera");
ok(CA.manoPoker(cs("9♠ 9♥ 9♦ 4♣ 4♠")) === "full" && CA.manoPoker(cs("9♠ 9♥ 9♦ 9♣ 4♠")) === "poker", "full y póker");
ok(CA.manoPoker(cs("2♠ 7♠ 9♠ J♠ K♠")) === "color" && CA.manoPoker(cs("2♠ 2♥ 9♦ 9♣ K♠")) === "doble_par", "color y doble par");
ok(CA.manoPoker(cs("J♠ J♥ 3♦ 7♣ 9♠")) === "jotas" && CA.manoPoker(cs("10♠ 10♥ 3♦ 7♣ 9♠")) === null, "par de jotas paga, par de 10 no");
const v = CA.vpRepartir(5, rngDe(3)), guardo = v.mano.map((c) => c);
CA.vpCambiar(v, [true, true, false, false, false]);
ok(v.fin && v.mano[0] === guardo[0] && v.mano[1] === guardo[1] && v.mano.length === 5 && v.pago === 5 * CA.multPoker(v.resultado), "póker: guardas 2, cambias 3, paga según la tabla");

// mayor o menor
const h = { juego: "hl", m: cs("Q♣ 5♥ 3♦"), carta: C("7♠") };          // sale el 3♦ (pop)
const pg = CA.hlPagos(h);
ok(pg.mayor > 0 && pg.menor > 0, "mayor o menor: las dos opciones pagan algo con un 7");
ok(CA.hlPagos({ m: CA.mazo(rngDe(2)).filter((c) => c.r !== 1 || c.s !== 0), carta: C("A♠") }).mayor === 0, "mayor que un As no se puede");
CA.hlAdivinar(h, "mayor", 10);
ok(h.fin && h.siguiente.r === 3 && h.resultado === "pierdes" && h.pago === 0, "salió un 3 y dijiste mayor: pierdes");

// la casa gana a la larga (pero no por goleada)
function simula(n, jugar) { let neto = 0, apostado = 0; for (let k = 0; k < n; k++) { const [a, pago] = jugar(rngDe(1000 + k)); apostado += a; neto += pago - a; } return neto / apostado; }
const bjEV = simula(30000, (r) => { const s = CA.bjEmpezar(10, r); while (!s.fin && CA.valor(s.yo) < 17) CA.bjPedir(s); CA.bjPlantarse(s); return [s.apuesta, s.pago]; });
ok(bjEV < 0 && bjEV > -0.1, `blackjack (pedir hasta 17): la casa gana ${(-bjEV * 100).toFixed(1)} %`);
const hlEV = simula(30000, (r) => { const s = CA.hlEmpezar(r), pg = CA.hlPagos(s), e = pg.mayor && (pg.mayor <= pg.menor || !pg.menor) ? "mayor" : "menor"; CA.hlAdivinar(s, e, 10); return [10, s.pago]; });
ok(hlEV < 0 && hlEV > -0.1, `mayor o menor: la casa gana ${(-hlEV * 100).toFixed(1)} %`);
const vpEV = simula(30000, (r) => { const s = CA.vpRepartir(1, r), mm = CA.manoPoker(s.mano); CA.vpCambiar(s, mm ? s.mano.map(() => true) : s.mano.map((c) => c.r === 1 || c.r >= 11)); return [1, s.pago]; });
ok(vpEV < 0 && vpEV > -0.35, `video póker (jugando simple): la casa gana ${(-vpEV * 100).toFixed(1)} %`);

console.log(fallas ? `\n${fallas} pruebas fallaron.` : "\nTodas las pruebas pasan.");
process.exit(fallas ? 1 : 0);
