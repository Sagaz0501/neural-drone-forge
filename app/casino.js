// =====================================================================
// EL CASINO (la lógica, sin pantalla: test en app/test_casino.mjs). La pantalla es la app 🎰 Casino del computador
// (casino_ui.js, dentro de estudio.js). Una app gratis de 🛍️ Apps para apostar la plata de la partida (pedido de
// Santiago, 19-10-2026): Blackjack, Video póker (Jacks or Better) y Mayor o menor. La casa tiene la ventaja normal de
// cada juego: se puede ganar, pero a la larga no regala plata.
//
// Cartas: { r: 1..13 (1 = As, 11 J, 12 Q, 13 K), s: 0..3 (♠ ♥ ♦ ♣) }. Cada función que baraja recibe rng() en [0, 1).
// La plata: apostar() la quita al empezar la mano (y la anota en Finanzas); cobrar() paga lo que devuelve la mano.
// =====================================================================
import { anotar } from "./partida.js";

export const PALOS = ["♠", "♥", "♦", "♣"];
export const NOMBRE_R = { 1: "A", 11: "J", 12: "Q", 13: "K" };
export const textoCarta = (c) => `${NOMBRE_R[c.r] || c.r}${PALOS[c.s]}`;
export const roja = (c) => c.s === 1 || c.s === 2;

/** Una baraja de 52 barajada (Fisher-Yates). */
export function mazo(rng = Math.random) {
  const m = [];
  for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) m.push({ r, s });
  for (let i = m.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [m[i], m[j]] = [m[j], m[i]]; }
  return m;
}

// ---------------- la plata ----------------
export const APUESTA_MIN = 1, APUESTA_MAX = 50;
/** Cuánto puedes apostar: de $1 hasta $50 o la cuarta parte de tu plata (lo menor). max = 0: no te alcanza. */
export function limites(plata) {
  const max = Math.min(APUESTA_MAX, Math.floor(Math.max(0, plata) / 4));
  return { min: APUESTA_MIN, max: plata >= APUESTA_MIN ? Math.max(APUESTA_MIN, max) : 0 };
}
/** Poner la apuesta (sale de la plata al empezar). Devuelve un texto de error o null. */
export function apostar(p, monto, juego, t = (x) => x, { doblar = false } = {}) {
  const L = limites(p.plata);
  if (!Number.isInteger(monto) || monto < L.min) return t("La apuesta mínima es $1.");
  if (monto > p.plata) return t("No te alcanza.");
  if (monto > L.max && !doblar) return t("Máximo ${n} por mano.", { n: L.max });   // doblar en el blackjack: la misma apuesta otra vez
  p.plata -= monto;
  anotar(p, -monto, `🎰 ${juego}`);
  return null;
}
/** Pagar lo que devuelve la mano (la apuesta incluida: empate = la apuesta; perder = 0). */
export function cobrar(p, pago, juego) {
  if (!(pago > 0)) return;
  p.plata += pago;
  anotar(p, pago, `🎰 ${juego}`);
}

// ---------------- Blackjack ----------------
/** El valor de una mano: el As vale 11 si no te pasas (blanda) y 1 si no. */
export function valor(mano) {
  let v = 0, ases = 0;
  for (const c of mano) { v += c.r === 1 ? 11 : Math.min(10, c.r); if (c.r === 1) ases++; }
  while (v > 21 && ases) { v -= 10; ases--; }
  return v;
}
export const esBlackjack = (mano) => mano.length === 2 && valor(mano) === 21;

/** Repartir: 2 cartas a ti y 2 al crupier (una tapada). Si alguien tiene blackjack, la mano termina ya. */
export function bjEmpezar(apuesta, rng = Math.random) {
  const m = mazo(rng);
  const s = { juego: "bj", m, yo: [m.pop(), m.pop()], cr: [m.pop(), m.pop()], apuesta, fin: false, resultado: null, pago: 0 };
  if (esBlackjack(s.yo) || esBlackjack(s.cr)) cerrarBJ(s);
  return s;
}
/** Pedir carta: si te pasas de 21, pierdes. */
export function bjPedir(s) {
  if (s.fin) return s;
  s.yo.push(s.m.pop());
  if (valor(s.yo) > 21) cerrarBJ(s);
  else if (valor(s.yo) === 21) bjPlantarse(s);
  return s;
}
/** Plantarte: el crupier pide hasta tener 17 o más (se planta con 17 blando) y se compara. */
export function bjPlantarse(s) {
  if (s.fin) return s;
  while (valor(s.cr) < 17) s.cr.push(s.m.pop());
  cerrarBJ(s);
  return s;
}
/** ¿Se puede doblar? Solo con tus 2 primeras cartas. */
export const bjPuedeDoblar = (s) => !s.fin && s.yo.length === 2;
/** Doblar: la apuesta se duplica (la otra mitad la pone apostar() afuera), una sola carta más y te plantas. */
export function bjDoblar(s) {
  if (!bjPuedeDoblar(s)) return s;
  s.apuesta *= 2; s.doblado = true;
  s.yo.push(s.m.pop());
  if (valor(s.yo) > 21) cerrarBJ(s); else bjPlantarse(s);
  return s;
}
function cerrarBJ(s) {
  const y = valor(s.yo), c = valor(s.cr), bjY = esBlackjack(s.yo) && !s.doblado, bjC = esBlackjack(s.cr);
  let r;
  if (y > 21) r = "pasaste";
  else if (bjY && bjC) r = "empate";
  else if (bjY) r = "blackjack";
  else if (bjC) r = "pierdes";
  else if (c > 21) r = "crupier_pasa";
  else r = y > c ? "ganas" : y === c ? "empate" : "pierdes";
  s.fin = true; s.resultado = r;
  // lo que devuelve la mesa (con la apuesta): blackjack paga 3 a 2, ganar 1 a 1, empate devuelve la apuesta
  s.pago = r === "blackjack" ? Math.floor(s.apuesta * 2.5) : r === "ganas" || r === "crupier_pasa" ? s.apuesta * 2 : r === "empate" ? s.apuesta : 0;
  return s;
}

// ---------------- Video póker: Jacks or Better (tabla 9/6) ----------------
// Lo que paga cada mano por cada $1 apostado (incluye la apuesta: "Jotas o más" = te devuelve lo apostado).
export const TABLA_VP = [
  ["escalera_real", 250], ["escalera_color", 50], ["poker", 25], ["full", 9], ["color", 6],
  ["escalera", 4], ["trio", 3], ["doble_par", 2], ["jotas", 1],
];
/** Qué mano es (la mejor de la tabla, o null). */
export function manoPoker(cartas) {
  const rs = cartas.map((c) => c.r).sort((a, b) => a - b), cuenta = {};
  for (const r of rs) cuenta[r] = (cuenta[r] || 0) + 1;
  const veces = Object.values(cuenta).sort((a, b) => b - a);
  const color = cartas.every((c) => c.s === cartas[0].s);
  const distintas = veces.length === 5;
  const real = distintas && rs.join() === "1,10,11,12,13";                  // 10 J Q K A (el As arriba)
  const escalera = distintas && (rs[4] - rs[0] === 4 || real);
  if (escalera && color) return real ? "escalera_real" : "escalera_color";
  if (veces[0] === 4) return "poker";
  if (veces[0] === 3 && veces[1] === 2) return "full";
  if (color) return "color";
  if (escalera) return "escalera";
  if (veces[0] === 3) return "trio";
  if (veces[0] === 2 && veces[1] === 2) return "doble_par";
  if (veces[0] === 2) { const par = +Object.keys(cuenta).find((r) => cuenta[r] === 2); if (par === 1 || par >= 11) return "jotas"; }
  return null;
}
export const multPoker = (mano) => TABLA_VP.find(([m]) => m === mano)?.[1] || 0;

/** Repartir 5 cartas; eliges cuáles guardar y cambias el resto una vez. */
export function vpRepartir(apuesta, rng = Math.random) {
  const m = mazo(rng);
  return { juego: "vp", m, mano: [m.pop(), m.pop(), m.pop(), m.pop(), m.pop()], guardar: [false, false, false, false, false], apuesta, fin: false, resultado: null, pago: 0 };
}
/** Cambiar las que no guardaste y ver qué mano quedó. */
export function vpCambiar(s, guardar = s.guardar) {
  if (s.fin) return s;
  s.guardar = guardar.slice(0, 5);
  s.mano = s.mano.map((c, i) => (s.guardar[i] ? c : s.m.pop()));
  s.resultado = manoPoker(s.mano);
  s.pago = s.apuesta * multPoker(s.resultado);
  s.fin = true;
  return s;
}

// ---------------- Mayor o menor ----------------
// El As es la más alta (14). Sale una carta y adivinas si la siguiente es mayor o menor. Igual = pierdes. Paga según la
// probabilidad, con 5 % para la casa: mayor que un 3 casi siempre gana y paga poco; mayor que una Q paga mucho.
const rangoHL = (c) => (c.r === 1 ? 14 : c.r);
export function hlEmpezar(rng = Math.random) {
  const m = mazo(rng);
  return { juego: "hl", m, carta: m.pop(), siguiente: null, fin: false, resultado: null, pago: 0, apuesta: 0 };
}
/** Lo que paga cada opción (multiplicador con la apuesta incluida; 0 = no se puede). */
export function hlPagos(s) {
  const v = rangoHL(s.carta), quedan = s.m.length;
  const mayores = s.m.filter((c) => rangoHL(c) > v).length, menores = s.m.filter((c) => rangoHL(c) < v).length;
  const mult = (n) => (n ? Math.floor((0.95 * quedan * 100) / n) / 100 : 0);
  return { mayor: mult(mayores), menor: mult(menores) };
}
/** Adivinar: "mayor" o "menor". */
export function hlAdivinar(s, eleccion, apuesta) {
  if (s.fin) return s;
  const m = hlPagos(s)[eleccion];
  if (!m) return s;
  s.apuesta = apuesta; s.eleccion = eleccion;
  s.siguiente = s.m.pop();
  const a = rangoHL(s.carta), b = rangoHL(s.siguiente);
  const gana = eleccion === "mayor" ? b > a : b < a;
  s.resultado = gana ? "ganas" : b === a ? "igual" : "pierdes";
  s.pago = gana ? Math.round(apuesta * m) : 0;      // la plata del juego va en pesos enteros
  s.fin = true;
  return s;
}
