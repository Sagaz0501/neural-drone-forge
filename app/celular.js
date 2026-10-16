// =====================================================================
// EL CELULAR (docs/NEGOCIO.md): la app "Mensajes" del juego. A la izquierda tus chats (un cliente cada uno, con los
// no leídos); a la derecha la conversación, con las TARJETAS de los pedidos: aceptar, "¿qué me falta?" (qué dron
// del hangar cumple y qué le falta: requisitos.js), volar (abre el briefing de main.js) y 🤖 mandarlo a la FLOTA (un dron
// del hangar lo vuela con su IA al terminar el día: flota.js). Abajo, terminar el día (y el reporte de la flota).
// La lógica (días, pedidos, pagos, relación) está en negocio.js; esto es solo la pantalla.
// =====================================================================
import * as NG from "./negocio.js";
import * as REQ from "./requisitos.js";
import { mundoLugar, alcanceNecesario } from "./lugares.js";
import { volarFlota, porQueNo } from "./flota.js";
import { t } from "./i18n.js";

const ICONO = { foto: "📷", inspeccion: "🔎", video: "🎬" };
const TIPO = { foto: () => t("Foto"), inspeccion: () => t("Inspección"), video: () => t("Video") };
const LUGAR = { casa: () => t("una casa"), finca: () => t("la finca El Roble"), restaurante: () => t("el restaurante La Brasa") };
const estrellas = (n, de = 4) => "★".repeat(n) + `<span class="off">${"★".repeat(Math.max(0, de - n))}</span>`;
const corazones = (n, max = 5) => "♥".repeat(n) + `<span class="off">${"♥".repeat(Math.max(0, max - n))}</span>`;

/**
 * ctx (de main.js): { $, esc, fmt, P, cat, PT, ND (datos del negocio), guardar, toast, modal, openBrief(pedido),
 *   misPedido(id), estadoDe(d), renderTaller(), fotos (id -> [{url, nombre, q}]), iaDe(d), infoModelo(slug) }
 */
export function initCelular(ctx) {
  const { $, esc, fmt } = ctx;
  const C = { chat: null, falta: null, reporte: null };

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
    $("cel").classList.toggle("en-chat", !!C.chat || !!C.reporte);
    const fl = NG.flota(p).length;
    $("cel-dia-fin").innerHTML = fl ? t("Terminar el día 🌙 · la flota vuela {n}", { n: fl }) : t("Terminar el día 🌙");
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
    $("cel-pend").innerHTML = pend.length ? pend.map((x) => `<span class="chip ${x.estado === "aceptado" ? "warn" : ""}">${x.flota ? "🤖 " : ""}${ICONO[x.tipo]} ${esc(NG.cliente(ctx.ND, x.cliente).nombre)} · ${x.quedan <= 1 ? t("vence hoy") : t("{n} días", { n: x.quedan })}</span>`).join("") : `<span class="muted">${t("Nada pendiente.")}</span>`;
    // ---- la conversación ----
    const conv = $("cel-msgs");
    conv.innerHTML = "";
    if (C.reporte) return renderReporte(conv);
    if (!C.chat) { $("cel-quien").innerHTML = ""; conv.innerHTML = `<p class="muted" style="margin:auto">${t("Todavía nadie te escribe.")}</p>`; return; }
    const Cl = NG.cliente(ctx.ND, C.chat);
    $("cel-quien").innerHTML = `<button class="btn ghost small cel-atras" id="cel-atras" aria-label="${t("Volver a los chats")}">‹</button><span class="av" style="background:${Cl.color}">${Cl.avatar}</span><span><b>${esc(Cl.nombre)}</b><small class="muted">${esc(Cl.quien)} · <span class="hearts" title="${t("Relación")}">${corazones(N.relacion[C.chat] || 0, ctx.ND.trabajos.relacion.max)}</span></small></span>`;
    $("cel-atras").onclick = () => { C.chat = null; render(); };
    let dia = null;
    for (const m of N.chats[C.chat] || []) {
      if (m.dia !== dia) { dia = m.dia; conv.insertAdjacentHTML("beforeend", `<div class="cel-diah">${t("Día {n}", { n: dia })}</div>`); }
      const el = document.createElement("div");
      el.className = "burbuja " + (m.de === "yo" ? "yo" : m.de === "sistema" ? "sistema" : "ella");
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
      reqResumen(pe) + flotaLinea(pe) + `<div class="tj-falta"></div><div class="tj-b"></div>`;
    const bx = el.querySelector(".tj-b");
    const btn = (txt, cls, fn) => { const b = document.createElement("button"); b.className = "btn small " + cls; b.innerHTML = txt; b.onclick = fn; bx.appendChild(b); };
    if (pe.estado === "nuevo") {
      btn(t("Aceptar"), "main", () => { NG.aceptar(p, ctx.ND, pe.id); ctx.guardar(); render(); ctx.renderTaller(); });
      if (!pe.tutorial) btn(t("🤖 A la flota"), "ai", () => verFlota(el, pe));
      btn(t("¿Qué me falta?"), "ghost", () => verFalta(el, pe));
      btn(t("No, gracias"), "ghost", () => { NG.rechazar(p, ctx.ND, pe.id); ctx.guardar(); render(); });
    } else if (pe.estado === "aceptado") {
      btn(t("Volar ▶"), "main", () => { ctx.modal("celular", false); ctx.openBrief(NG.paraVolar(p, ctx.ND, pe)); });
      if (pe.flota) btn(t("Quitar de la flota"), "ghost", () => { NG.quitarFlota(p, pe.id); ctx.guardar(); render(); });
      else if (!pe.tutorial) btn(t("🤖 A la flota"), "ai", () => verFlota(el, pe));
      btn(t("¿Qué me falta?"), "ghost", () => verFalta(el, pe));
    }
    return el;
  }

  /** Si va con la flota: qué dron lo vuela. */
  function flotaLinea(pe) {
    if (!pe.flota || (pe.estado !== "nuevo" && pe.estado !== "aceptado")) return "";
    const d = ctx.P().drones.find((x) => x.id === pe.flota);
    return `<div class="tj-d tj-flota">${t("🤖 <b>{dron}</b> lo vuela con su IA al terminar el día.", { dron: esc(d?.nombre || "?") })}</div>`;
  }

  const nombreIA = (d) => {
    if (!d.modelo) return t("IA base");
    const gen = ctx.infoModelo(d.modelo)?.gen;
    return t("IA \"{m}\"", { m: esc(d.modelo) }) + (gen != null ? ` · ${t("gen {n}", { n: gen })}` : "");
  };

  /** 🤖 A la flota: elegir qué dron lo vuela (uno por dron). Los que no pueden dicen por qué. */
  function verFlota(el, pe) {
    const box = el.querySelector(".tj-falta"), p = ctx.P();
    if (box.dataset.v === "flota") { box.innerHTML = ""; box.dataset.v = ""; return; }
    box.dataset.v = "flota";
    if (!p.drones.length) { box.innerHTML = `<p class="bad">${t("No tienes drones todavía: arma el Kit del garaje en el hangar.")}</p>`; return; }
    const vol = NG.paraVolar(p, ctx.ND, pe), M = mundoLugar(vol.lugar, vol);
    const c = { segundos: M.shots.reduce((a, s) => a + s.dur, 0), viento: M.wind, alcance: alcanceNecesario(M.shots) };
    box.innerHTML = `<p class="muted" style="margin:0 0 6px">${t("¿Con qué dron? Su IA lo vuela sola al terminar el día, con una ruta nueva. Si no entrega, el pedido sigue abierto.")}</p>`;
    for (const d of p.drones) {
      const no = porQueNo(ctx, d, vol), otro = NG.ocupado(p, d.id);
      const st = ctx.PT.dronArmado(p, ctx.cat, d)?.stats, k = st ? REQ.cumple(pe.requisitos, st, c) : null;
      const b = document.createElement("button");
      b.className = "tj-dron flota-dron";
      b.disabled = !!no;
      b.innerHTML = `<b>${esc(d.nombre)}</b> <span class="muted">${nombreIA(d)}</span> ` +
        (no ? `<span class="chip bad">${esc(no)}</span>` : k?.ok ? `<span class="chip on">${t("Sirve")}</span>` : `<span class="chip warn">${t("Le falta: {lista}", { lista: k.faltan.map((x) => x[1].split(/[:(]/)[0].trim().toLowerCase()).join(", ") })}</span>`) +
        (otro && otro.id !== pe.id ? ` <span class="chip">${t("ya lleva «{titulo}»", { titulo: esc(otro.titulo) })}</span>` : "");
      b.onclick = () => {
        const r = NG.asignar(p, ctx.ND, pe.id, d.id);
        if (!r.ok) { ctx.toast(r.msg, 3500); return; }
        if (r.quitado) ctx.toast(t("{dron} deja «{titulo}» para hacer este.", { dron: d.nombre, titulo: r.quitado.titulo }), 3500);
        ctx.guardar(); render(); ctx.renderTaller();
      };
      box.appendChild(b);
    }
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
    if (box.dataset.v === "falta") { box.innerHTML = ""; box.dataset.v = ""; return; }
    box.dataset.v = "falta";
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

  async function terminarDia() {
    const p = ctx.P(), pend = NG.pendientes(p).filter((x) => x.limite <= p.negocio.dia && !x.flota);
    if (C.reporte?.volando) return;
    if (pend.length && !confirm(t("Hay {n} pedidos que vencen hoy. ¿Terminar el día igual?", { n: pend.length }))) return;
    // primero sale la flota (con los pedidos de hoy), después empieza el día siguiente
    let filas = [];
    const antes = { plata: p.plata, rep: p.rep };
    if (NG.flota(p).length) {
      C.reporte = { volando: true, filas: [], aviso: null };
      C.chat = null;
      render();
      filas = await volarFlota(ctx, (a) => { C.reporte.aviso = a; pintarAviso(); });
    }
    const r = NG.nuevoDia(p, ctx.ND);
    ctx.guardar();
    const partes = [t("☀️ Día {n}", { n: p.negocio.dia })];
    if (r.nuevos.length) partes.push(r.nuevos.length === 1 ? t("1 mensaje nuevo") : t("{n} mensajes nuevos", { n: r.nuevos.length }));
    if (r.especiales.length) partes.push(t("⭐ un pedido especial"));
    if (r.vencidos.length) partes.push(r.vencidos.length === 1 ? t("1 pedido venció") : t("{n} pedidos vencieron", { n: r.vencidos.length }));
    if (r.arriendo) partes.push(t("arriendo −${n}", { n: r.arriendo }));
    if (r.llegaron) { partes.push(r.llegaron === 1 ? t("📦 llegó 1 pieza") : t("📦 llegaron {n} piezas", { n: r.llegaron })); ctx.garaje?.paquete?.(); }
    if (filas.length) C.reporte = { filas, dia: partes.join(" · "), plata: p.plata - antes.plata + (r.arriendo || 0), rep: p.rep - antes.rep };
    else { ctx.toast(partes.join(" · "), 4000); C.chat = null; }
    render();
    ctx.renderTaller();
  }

  function pintarAviso() {
    const el = $("cel-msgs").querySelector(".flota-aviso"), a = C.reporte?.aviso;
    if (!el || !a) return;
    el.innerHTML = t("🤖 {dron} está volando «{titulo}» ({i} de {n})…", { dron: esc(a.dron), titulo: esc(a.pe.titulo), i: a.i + 1, n: a.n }) +
      `<div class="flota-barra"><span style="width:${Math.round(((a.i + a.f) / a.n) * 100)}%"></span></div>`;
  }

  /** El reporte de la flota: un renglón por trabajo (quién lo voló, cómo le fue, cuánto pagó o por qué no). */
  function renderReporte(conv) {
    const R = C.reporte, p = ctx.P();
    $("cel-quien").innerHTML = `<button class="btn ghost small cel-atras" id="cel-atras" aria-label="${t("Volver a los chats")}">‹</button><span class="av" style="background:#3a4a5a">🤖</span><span><b>${t("Reporte de la flota")}</b><small class="muted">${R.volando ? t("Volando…") : esc(R.dia || "")}</small></span>`;
    $("cel-atras").onclick = () => { if (!R.volando) { C.reporte = null; render(); } };
    if (R.volando) { conv.innerHTML = `<div class="flota-aviso burbuja sistema">${t("🤖 La flota está saliendo…")}</div>`; pintarAviso(); return; }
    for (const f of R.filas) {
      const Cl = NG.cliente(ctx.ND, f.pe.cliente), ok = f.resp && f.r?.estrellas >= 1;
      const el = document.createElement("div");
      el.className = "tarjeta flota-r " + (ok ? "hecho" : "vencido");
      el.innerHTML = `<div class="tj-h"><span>${ICONO[f.pe.tipo]} <b>${esc(f.pe.titulo)}</b> <span class="muted">· ${esc(Cl.nombre)}</span></span>${ok ? `<span class="money">+$${f.pago}</span>` : ""}</div>` +
        `<div class="tj-d">🤖 <b>${esc(f.dron)}</b>${f.ia ? ` <span class="muted">· ${f.ia === "base" ? t("IA base") : t("IA \"{m}\"", { m: esc(f.ia) })}${f.gen != null ? ` · ${t("gen {n}", { n: f.gen })}` : ""}</span>` : ""}</div>` +
        `<div class="tj-d">${ok ? `<span class="cel-est">${estrellas(f.r.estrellas, 3)}</span> ${t("Entregado · puntaje {n}", { n: f.r.puntaje })}` : `<b class="bad">${esc(f.motivo || "")}</b>${f.pe.estado === "vencido" ? ` <span class="chip bad">${t("Vencido")}</span>` : ""}`}</div>` +
        (f.r ? `<div class="tj-d muted">${(f.r.foto ? t("fotos") : t("tomas")) + ": " + f.r.tomas.map((x) => (x.lista ? `${Math.round(x.q * 100)} %` : "—")).join(" · ")} · ${t("{s} s de vuelo, batería al {b} %", { s: fmt(f.r.t, 0), b: Math.round(f.r.bateria * 100) })}</div>` : "") +
        f.dmg.map((x) => `<div class="tj-d bad">${esc(x.nombre)}: ${t("−{n} % (queda {v} %)", { n: x.perdio, v: x.vida })}</div>`).join("") +
        `<div class="tj-b"></div>`;
      const b = document.createElement("button");
      b.className = "btn small ghost";
      b.textContent = t("Ver el chat");
      b.onclick = () => { C.reporte = null; C.chat = f.pe.cliente; render(); };
      el.querySelector(".tj-b").appendChild(b);
      conv.appendChild(el);
    }
    const ent = R.filas.filter((f) => f.resp && f.r?.estrellas >= 1).length;
    conv.insertAdjacentHTML("beforeend", `<div class="burbuja sistema">${t("La flota entregó {n} de {m}.", { n: ent, m: R.filas.length })} ` +
      `${t("Plata")}: <span class="money">${R.plata >= 0 ? "+" : "−"}$${Math.abs(R.plata)}</span> · ${t("Reputación")}: ${R.rep >= 0 ? "+" : ""}${R.rep} ` + t("(total {n})", { n: p.rep }) +
      (R.filas.some((f) => f.pe.estado === "aceptado") ? `<br><span class="muted">${t("Lo que no entregó sigue abierto: vuélalo tú, mándalo otra vez o entrena mejor su IA.")}</span>` : "") + "</div>");
    conv.scrollTop = 0;
  }

  $("cel-dia-fin").onclick = terminarDia;
  $("cel-cerrar").onclick = () => { ctx.modal("celular", false); ctx.renderTaller(); };
  return { abrir, render };
}
