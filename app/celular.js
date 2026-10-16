// =====================================================================
// EL CELULAR (docs/NEGOCIO.md): la app "Mensajes" del juego. A la izquierda tus chats (un cliente cada uno, con los
// no leídos); a la derecha la conversación, con las TARJETAS de los pedidos: aceptar, "¿qué me falta?" (qué dron
// del hangar cumple y qué le falta: requisitos.js) y volar (abre el briefing de main.js). Abajo, terminar el día.
// La lógica (días, pedidos, pagos, relación) está en negocio.js; esto es solo la pantalla.
// =====================================================================
import * as NG from "./negocio.js";
import * as REQ from "./requisitos.js";
import { mundoLugar, alcanceNecesario } from "./lugares.js";
import { t } from "./i18n.js";

const ICONO = { foto: "📷", inspeccion: "🔎", video: "🎬" };
const TIPO = { foto: () => t("Foto"), inspeccion: () => t("Inspección"), video: () => t("Video") };
const LUGAR = { casa: () => t("una casa"), finca: () => t("la finca El Roble"), restaurante: () => t("el restaurante La Brasa") };
const estrellas = (n, de = 4) => "★".repeat(n) + `<span class="off">${"★".repeat(Math.max(0, de - n))}</span>`;
const corazones = (n, max = 5) => "♥".repeat(n) + `<span class="off">${"♥".repeat(Math.max(0, max - n))}</span>`;

/**
 * ctx (de main.js): { $, esc, fmt, P, cat, PT, ND (datos del negocio), guardar, toast, modal, openBrief(pedido),
 *   misPedido(id), estadoDe(d), renderTaller(), fotos (id -> [{url, nombre, q}]) }
 */
export function initCelular(ctx) {
  const { $, esc, fmt } = ctx;
  const C = { chat: null, falta: null };

  function abrir(cid = null) {
    const p = ctx.P();
    NG.asegurar(p, ctx.ND);
    C.chat = cid || C.chat || (p.negocio.contactos.find((id) => NG.noLeidos(p, id)) ?? p.negocio.contactos[0] ?? null);
    ctx.modal("celular");
    render();
  }

  function render() {
    const p = ctx.P(), N = p.negocio;
    if (C.chat) NG.leer(p, C.chat);
    ctx.guardar();
    $("cel").classList.toggle("en-chat", !!C.chat);
    // ---- la lista de chats ----
    const pend = NG.pendientes(p);
    $("cel-dia").innerHTML = t("Día {n}", { n: N.dia }) + (N.hoy ? ` · <span class="muted">${N.hoy === 1 ? t("1 trabajo hoy") : t("{n} trabajos hoy", { n: N.hoy })}</span>` : "");
    const lista = $("cel-lista");
    lista.innerHTML = "";
    for (const cid of [...N.contactos].sort((a, b) => ultimo(p, b) - ultimo(p, a))) {
      const Cl = NG.cliente(ctx.ND, cid), msgs = N.chats[cid] || [], u = msgs.at(-1), nl = NG.noLeidos(p, cid);
      const b = document.createElement("button");
      b.className = "cel-c" + (cid === C.chat ? " on" : "");
      b.innerHTML = `<span class="av" style="background:${Cl.color}">${Cl.avatar}</span><span class="cel-c-t"><b>${esc(Cl.nombre)}</b><small>${u ? (u.de === "yo" ? t("Tú: ") : "") + esc(recortar(u.txt)) : ""}</small></span>${nl ? `<span class="badge">${nl}</span>` : ""}`;
      b.onclick = () => { C.chat = cid; C.falta = null; render(); };
      lista.appendChild(b);
    }
    $("cel-pend").innerHTML = pend.length ? pend.map((x) => `<span class="chip ${x.estado === "aceptado" ? "warn" : ""}">${ICONO[x.tipo]} ${esc(NG.cliente(ctx.ND, x.cliente).nombre)} · ${x.quedan <= 1 ? t("vence hoy") : t("{n} días", { n: x.quedan })}</span>`).join("") : `<span class="muted">${t("Nada pendiente.")}</span>`;
    // ---- la conversación ----
    const conv = $("cel-msgs");
    conv.innerHTML = "";
    if (!C.chat) { $("cel-quien").innerHTML = ""; conv.innerHTML = `<p class="muted" style="margin:auto">${t("Todavía nadie te escribe.")}</p>`; return; }
    const Cl = NG.cliente(ctx.ND, C.chat);
    $("cel-quien").innerHTML = `<button class="btn ghost small cel-atras" id="cel-atras" aria-label="${t("Volver a los chats")}">‹</button><span class="av" style="background:${Cl.color}">${Cl.avatar}</span><span><b>${esc(Cl.nombre)}</b><small class="muted">${esc(Cl.quien)} · <span class="hearts" title="${t("Relación")}">${corazones(N.relacion[C.chat] || 0, ctx.ND.trabajos.relacion.max)}</span></small></span>`;
    $("cel-atras").onclick = () => { C.chat = null; render(); };
    let dia = null;
    for (const m of N.chats[C.chat] || []) {
      if (m.dia !== dia) { dia = m.dia; conv.insertAdjacentHTML("beforeend", `<div class="cel-diah">${t("Día {n}", { n: dia })}</div>`); }
      const el = document.createElement("div");
      el.className = "burbuja " + (m.de === "yo" ? "yo" : "ella");
      el.innerHTML = esc(m.txt).replace(/\n/g, "<br>");
      if (m.entrega && ctx.fotos[m.entrega]?.length) {
        el.insertAdjacentHTML("beforeend", `<div class="cel-fotos">${ctx.fotos[m.entrega].map((f) => `<img src="${f.url}" alt="${esc(f.nombre)}">`).join("")}</div>`);
      }
      if (m.entrega && m.estrellas !== undefined) el.insertAdjacentHTML("beforeend", `<div class="cel-est">${estrellas(m.estrellas, 3)}</div>`);
      conv.appendChild(el);
      if (m.pedido) conv.appendChild(tarjeta(NG.pedido(p, m.pedido)));
      if (m.especial) conv.appendChild(tarjetaEspecial(m.especial));
    }
    conv.scrollTop = conv.scrollHeight;
  }

  const ultimo = (p, cid) => { const m = (p.negocio.chats[cid] || []).at(-1); return m ? m.dia * 1000 + (p.negocio.chats[cid].length) : 0; };
  const recortar = (s) => (s.length > 46 ? s.slice(0, 44) + "…" : s);

  /** La tarjeta de un pedido del negocio. */
  function tarjeta(pe) {
    const el = document.createElement("div");
    if (!pe) return el;
    const p = ctx.P(), N = p.negocio, quedan = pe.limite - N.dia + 1;
    el.className = "tarjeta " + pe.estado;
    const titulo = `<span>${ICONO[pe.tipo]} <b>${esc(pe.titulo)}</b></span>`;
    const det = [TIPO[pe.tipo]() + (pe.tipo === "video" ? "" : ` · ${pe.n}`), LUGAR[pe.lugar]?.() || pe.lugar,
      pe.viento ? t("viento {v} m/s", { v: fmt(pe.viento) }) : t("sin viento")].join(" · ");
    const estado = { nuevo: "", aceptado: `<span class="chip warn">${t("Aceptado")}</span>`, hecho: `<span class="chip on">${t("Entregado")} ${"★".repeat(pe.estrellasHechas || 0)}</span>`,
      vencido: `<span class="chip bad">${t("Vencido")}</span>`, rechazado: `<span class="chip">${t("Rechazado")}</span>` }[pe.estado];
    el.innerHTML = `<div class="tj-h">${titulo}<span class="money">$${pe.pago}</span></div>` +
      `<div class="tj-d"><span class="dif" title="${t("Dificultad")}">${estrellas(pe.dif)}</span> ${det}</div>` +
      `<div class="tj-d">${(pe.estado === "nuevo" || pe.estado === "aceptado") ? (quedan <= 1 ? `<b class="bad">${t("Vence hoy")}</b>` : t("Quedan {n} días", { n: quedan })) : ""} ${estado}</div>` +
      reqResumen(pe) + `<div class="tj-falta"></div><div class="tj-b"></div>`;
    const bx = el.querySelector(".tj-b");
    const btn = (txt, cls, fn) => { const b = document.createElement("button"); b.className = "btn small " + cls; b.innerHTML = txt; b.onclick = fn; bx.appendChild(b); };
    if (pe.estado === "nuevo") {
      btn(t("Aceptar"), "main", () => { NG.aceptar(p, ctx.ND, pe.id); ctx.guardar(); render(); ctx.renderTaller(); });
      btn(t("¿Qué me falta?"), "ghost", () => verFalta(el, pe));
      btn(t("No, gracias"), "ghost", () => { NG.rechazar(p, ctx.ND, pe.id); ctx.guardar(); render(); });
    } else if (pe.estado === "aceptado") {
      btn(t("Volar ▶"), "main", () => { ctx.modal("celular", false); ctx.openBrief(NG.paraVolar(p, ctx.ND, pe)); });
      btn(t("¿Qué me falta?"), "ghost", () => verFalta(el, pe));
    }
    return el;
  }

  /** Lo que pide, en una línea (✱ = sin eso no acepta). */
  function reqResumen(pe) {
    const r = pe.requisitos || {}, xs = [];
    if (r.twr_min) xs.push(t("empuje/peso ≥ {v}", { v: fmt(r.twr_min) }));
    if (r.barometro) xs.push(t("barómetro"));
    if (r.protectores) xs.push("✱ " + t("protectores"));
    if (r.calidad_min) xs.push("✱ " + t("cámara ≥ {v}", { v: r.calidad_min }));
    return xs.length ? `<div class="tj-d muted">${t("Pide: {lista}", { lista: xs.join(" · ") })}</div>` : "";
  }

  /** ¿Qué me falta? El mejor dron del hangar para este pedido y lo que le falta. */
  function verFalta(el, pe) {
    const box = el.querySelector(".tj-falta"), p = ctx.P();
    if (box.innerHTML) { box.innerHTML = ""; return; }
    const vol = NG.paraVolar(p, ctx.ND, pe), M = mundoLugar(vol.lugar, vol);
    const c = { segundos: M.shots.reduce((a, s) => a + s.dur, 0), viento: M.wind, alcance: alcanceNecesario(M.shots) };
    const statsDe = (d) => ctx.PT.dronArmado(p, ctx.cat, d)?.stats || null;
    if (!p.drones.length) { box.innerHTML = `<p class="bad">${t("No tienes drones todavía: arma el Kit del garaje en el hangar.")}</p>`; return; }
    const orden = REQ.mejoresDrones(p.drones, statsDe, pe.requisitos, c);
    box.innerHTML = orden.slice(0, 3).map(({ d, c: k }) => {
      const listo = ctx.estadoDe(d).listo;
      const malas = k.lineas.filter((x) => x[0] === "no" || x[0] === "meh");
      return `<div class="tj-dron"><b>${esc(d.nombre)}</b> ${k.ok && listo ? `<span class="chip on">${t("Sirve")}</span>` : k.ok ? `<span class="chip warn">${t("Sirve, pero falta terminarlo en el banco")}</span>` : `<span class="chip bad">${t("No alcanza")}</span>`}` +
        (malas.length ? `<ul class="req">${malas.map(([cl, txt]) => `<li class="${cl}">${txt}</li>`).join("")}</ul>` : "") + "</div>";
    }).join("") + `<p class="muted" style="margin:4px 0 0">${t("Lo que falta se consigue en la Tienda (o armando otro dron).")}</p>`;
  }

  /** La tarjeta de un pedido especial de la campaña ⭐. */
  function tarjetaEspecial(id) {
    const pe = ctx.misPedido(id), el = document.createElement("div");
    if (!pe) return el;
    const p = ctx.P(), hecho = p.hechos[id] !== undefined;
    el.className = "tarjeta especial" + (hecho ? " hecho" : "");
    el.innerHTML = `<div class="tj-h"><span>⭐ <b>${esc(pe.titulo)}</b></span><span class="money">$${pe.pago}</span></div>` +
      `<div class="tj-d muted">${t("Pedido especial: hace crecer tu negocio. No vence.")}</div>` +
      (hecho ? `<div class="tj-d"><span class="chip on">${t("Entregado")} ${"★".repeat(p.hechos[id])}</span></div>` : "") + `<div class="tj-b"></div>`;
    const b = document.createElement("button");
    b.className = "btn small " + (hecho ? "ghost" : "main");
    b.textContent = hecho ? t("Repetir") : t("Ver el pedido ▶");
    b.onclick = () => { ctx.modal("celular", false); ctx.openBrief(pe); };
    el.querySelector(".tj-b").appendChild(b);
    return el;
  }

  function terminarDia() {
    const p = ctx.P(), pend = NG.pendientes(p).filter((x) => x.limite <= p.negocio.dia);
    if (pend.length && !confirm(t("Hay {n} pedidos que vencen hoy. ¿Terminar el día igual?", { n: pend.length }))) return;
    const r = NG.nuevoDia(p, ctx.ND);
    ctx.guardar();
    const partes = [t("☀️ Día {n}", { n: p.negocio.dia })];
    if (r.nuevos.length) partes.push(r.nuevos.length === 1 ? t("1 mensaje nuevo") : t("{n} mensajes nuevos", { n: r.nuevos.length }));
    if (r.especiales.length) partes.push(t("⭐ un pedido especial"));
    if (r.vencidos.length) partes.push(r.vencidos.length === 1 ? t("1 pedido venció") : t("{n} pedidos vencieron", { n: r.vencidos.length }));
    if (r.arriendo) partes.push(t("arriendo −${n}", { n: r.arriendo }));
    ctx.toast(partes.join(" · "), 4000);
    C.chat = null;
    render();
    ctx.renderTaller();
  }

  $("cel-dia-fin").onclick = terminarDia;
  $("cel-cerrar").onclick = () => { ctx.modal("celular", false); ctx.renderTaller(); };
  return { abrir, render };
}
