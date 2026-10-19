// =====================================================================
// LA APP 🎰 CASINO del computador (la pantalla; la lógica en casino.js). Una ventana del escritorio (estudio.js:
// #es-casino) con tres mesas: Blackjack, Video póker y Mayor o menor. La apuesta sale de tu plata al repartir y lo que
// ganas entra al terminar la mano (las dos cosas quedan en 🏦 Finanzas). La mano en juego sigue aunque cierres la
// ventana (no si cierras el juego: esa apuesta se pierde).
// =====================================================================
import * as CA from "./casino.js";
import { t } from "./i18n.js";
import { sfx } from "./garaje.js";

const FICHAS = [1, 5, 10, 25, 50];

/** ctx: { P, guardar, toast, onPlata } */
export function initCasino(ctx) {
  const CS = { juego: "bj", apuesta: 5, s: { bj: null, vp: null, hl: null } };
  const $ = (id) => document.getElementById(id);
  const NOMBRE = () => ({ bj: "Blackjack", vp: t("Video póker"), hl: t("Mayor o menor") });
  const MANOS = () => ({ escalera_real: t("Escalera real"), escalera_color: t("Escalera de color"), poker: t("Póker"), full: "Full", color: t("Color"),
    escalera: t("Escalera"), trio: t("Trío"), doble_par: t("Doble par"), jotas: t("Par de jotas o más") });

  const carta = (c, { tapada = false, extra = "" } = {}) => tapada
    ? `<div class="carta tapada"></div>`
    : `<div class="carta${CA.roja(c) ? " roja" : ""}${extra}"><b>${CA.NOMBRE_R[c.r] || c.r}</b><i>${CA.PALOS[c.s]}</i><b class="ab">${CA.NOMBRE_R[c.r] || c.r}</b></div>`;
  const plataTxt = (n) => `$${n.toLocaleString()}`;

  /** Después de cada mano: guardar la partida, pintar la plata del computador y sonar. */
  function alTerminar(s) {
    if (s.pago > 0) CA.cobrar(ctx.P(), s.pago, NOMBRE()[s.juego]);
    sfx(s.pago > s.apuesta ? "listo" : s.pago === s.apuesta ? "click" : "error");
    ctx.guardar(); ctx.onPlata?.();
  }
  function apostar(monto, opts) {
    const err = CA.apostar(ctx.P(), monto, NOMBRE()[CS.juego], t, opts);
    if (err) { ctx.toast(err); sfx("error"); return false; }
    sfx("pop"); ctx.guardar(); ctx.onPlata?.();
    return true;
  }

  function render() {
    const box = $("es-casino"), p = ctx.P();
    if (!box || !p) return;
    const L = CA.limites(p.plata);
    CS.apuesta = Math.max(1, Math.min(CS.apuesta, L.max || 1));
    const s = CS.s[CS.juego], enJuego = s && !s.fin;
    box.innerHTML = `<div class="cas-top"><div class="cas-tabs" role="tablist">${Object.entries({ bj: "🃏", vp: "🎴", hl: "↕️" }).map(([k, ic]) =>
      `<button role="tab" data-j="${k}" aria-selected="${CS.juego === k}">${ic} ${NOMBRE()[k]}</button>`).join("")}</div>
      <span class="cas-plata">${t("Tu plata")}: <b class="money">${plataTxt(p.plata)}</b></span></div>
      <div class="cas-mesa" id="cas-mesa"></div>
      <div class="cas-apuesta"${enJuego ? " hidden" : ""}><span>${t("Apuesta")}</span>${FICHAS.map((f) => `<button class="ficha f${f}" data-f="${f}" ${f > L.max ? "disabled" : ""} aria-pressed="${CS.apuesta === f}">$${f}</button>`).join("")}
        <span class="muted">${L.max ? t("máx. ${n}", { n: L.max }) : t("No te alcanza para apostar.")}</span></div>
      <div class="cas-botones" id="cas-b"></div>
      <p class="cas-aviso">🎲 ${t("Es un juego: la casa siempre tiene un poquito de ventaja. Apuesta solo lo que te sobra; tus drones dan más plata.")}</p>`;
    box.querySelectorAll("[data-j]").forEach((b) => (b.onclick = () => { CS.juego = b.dataset.j; sfx("click"); render(); }));
    box.querySelectorAll("[data-f]").forEach((b) => (b.onclick = () => { CS.apuesta = +b.dataset.f; sfx("click"); render(); }));
    ({ bj: mesaBJ, vp: mesaVP, hl: mesaHL })[CS.juego](s, L);
  }
  const boton = (txt, cls, fn, dis = false) => { const b = document.createElement("button"); b.className = "btn small " + cls; b.innerHTML = txt; b.disabled = dis; b.onclick = fn; $("cas-b").appendChild(b); return b; };
  const resultado = (txt, bien) => `<p class="cas-res ${bien === true ? "ok" : bien === false ? "bad" : ""}">${txt}</p>`;

  // ---------------- Blackjack ----------------
  function mesaBJ(s, L) {
    const mesa = $("cas-mesa");
    if (!s) mesa.innerHTML = `<p class="cas-intro">${t("Llega a 21 sin pasarte. El crupier pide hasta 17. Blackjack paga 3 a 2.")}</p>`;
    else {
      const RES = { blackjack: [t("¡Blackjack! Ganas ${n}", { n: s.pago - s.apuesta }), true], ganas: [t("Ganas ${n}", { n: s.pago - s.apuesta }), true],
        crupier_pasa: [t("El crupier se pasó: ganas ${n}", { n: s.pago - s.apuesta }), true], empate: [t("Empate: recuperas tu apuesta"), null],
        pasaste: [t("Te pasaste de 21: pierdes ${n}", { n: s.apuesta }), false], pierdes: [t("Gana el crupier: pierdes ${n}", { n: s.apuesta }), false] };
      mesa.innerHTML = `<div class="cas-fila"><span class="cas-quien">${t("Crupier")} ${s.fin ? `· <b>${CA.valor(s.cr)}</b>` : ""}</span><div class="cartas">${s.cr.map((c, i) => carta(c, { tapada: !s.fin && i === 1 })).join("")}</div></div>
        <div class="cas-fila"><span class="cas-quien">${t("Tú")} · <b>${CA.valor(s.yo)}</b> · ${t("apuesta ${n}", { n: s.apuesta })}</span><div class="cartas">${s.yo.map((c) => carta(c)).join("")}</div></div>` +
        (s.fin ? resultado(...RES[s.resultado]) : "");
    }
    if (!s || s.fin) {
      boton(t("Repartir · ${n}", { n: CS.apuesta }), "main", () => {
        if (!apostar(CS.apuesta)) return;
        const n = CA.bjEmpezar(CS.apuesta);
        CS.s.bj = n;
        if (n.fin) alTerminar(n);
        render();
      }, !L.max);
      return;
    }
    const jugada = (fn) => () => { fn(s); if (s.fin) alTerminar(s); else sfx("pop"); render(); };
    boton(t("Pedir"), "main", jugada(CA.bjPedir));
    boton(t("Plantarse"), "ghost", jugada(CA.bjPlantarse));
    boton(t("Doblar · +${n}", { n: s.apuesta }), "ghost", () => { if (apostar(s.apuesta, { doblar: true })) jugada(CA.bjDoblar)(); }, !CA.bjPuedeDoblar(s) || ctx.P().plata < s.apuesta);
  }

  // ---------------- Video póker ----------------
  function mesaVP(s, L) {
    const mesa = $("cas-mesa"), ap = s && !s.fin ? s.apuesta : CS.apuesta;
    const tabla = `<table class="cas-tabla">${CA.TABLA_VP.map(([m, x]) => `<tr class="${s?.fin && s.resultado === m ? "gana" : ""}"><td>${MANOS()[m]}</td><td>$${x * ap}</td></tr>`).join("")}</table>`;
    if (!s) mesa.innerHTML = `<div class="cas-vp">${tabla}<p class="cas-intro">${t("Jacks or Better: 5 cartas, guardas las que quieras y cambias el resto una vez. Desde un par de jotas, ganas.")}</p></div>`;
    else {
      mesa.innerHTML = `<div class="cas-vp">${tabla}<div><div class="cartas vp">${s.mano.map((c, i) => `<button class="carta-b" data-i="${i}" ${s.fin ? "disabled" : ""}>${carta(c, { extra: s.guardar[i] && !s.fin ? " guardada" : "" })}<small>${s.guardar[i] && !s.fin ? t("GUARDADA") : "&nbsp;"}</small></button>`).join("")}</div>` +
        (s.fin ? (s.resultado ? resultado(t("{mano}: ganas ${n}", { mano: MANOS()[s.resultado], n: s.pago - s.apuesta }), s.pago > s.apuesta ? true : null) : resultado(t("Nada esta vez: pierdes ${n}", { n: s.apuesta }), false))
          : `<p class="muted cas-intro">${t("Toca las cartas que quieres guardar.")}</p>`) + `</div></div>`;
      mesa.querySelectorAll("[data-i]").forEach((b) => (b.onclick = () => { s.guardar[+b.dataset.i] = !s.guardar[+b.dataset.i]; sfx("click"); render(); }));
    }
    if (!s || s.fin) {
      boton(t("Repartir · ${n}", { n: CS.apuesta }), "main", () => { if (!apostar(CS.apuesta)) return; CS.s.vp = CA.vpRepartir(CS.apuesta); render(); }, !L.max);
      return;
    }
    boton(t("Cambiar las demás"), "main", () => { CA.vpCambiar(s); alTerminar(s); render(); });
  }

  // ---------------- Mayor o menor ----------------
  function mesaHL(s, L) {
    if (!s) s = CS.s.hl = CA.hlEmpezar();
    const mesa = $("cas-mesa");
    const pg = s.fin ? null : CA.hlPagos(s);
    mesa.innerHTML = `<p class="cas-intro">${t("¿La siguiente carta es mayor o menor? El As es la más alta; si sale igual, pierdes. Lo difícil paga más.")}</p>
      <div class="cartas hl">${carta(s.carta)}${s.fin ? carta(s.siguiente) : carta(null, { tapada: true })}</div>` +
      (s.fin ? (s.resultado === "ganas" ? resultado(t("¡Acertaste! Ganas ${n}", { n: s.pago - s.apuesta }), true)
        : resultado(s.resultado === "igual" ? t("Salió igual: pierdes ${n}", { n: s.apuesta }) : t("No era: pierdes ${n}", { n: s.apuesta }), false)) : "");
    if (s.fin) { boton(t("Otra carta"), "main", () => { CS.s.hl = CA.hlEmpezar(); sfx("click"); render(); }); return; }
    const jugar = (e) => () => { if (!apostar(CS.apuesta)) return; CA.hlAdivinar(s, e, CS.apuesta); alTerminar(s); render(); };
    boton(`⬆️ ${t("Mayor")} · ×${pg.mayor.toFixed(2)}`, "main", jugar("mayor"), !pg.mayor || !L.max);
    boton(`⬇️ ${t("Menor")} · ×${pg.menor.toFixed(2)}`, "main", jugar("menor"), !pg.menor || !L.max);
  }

  return { render };
}
