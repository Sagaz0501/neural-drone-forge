// =====================================================================
// LA TIENDA (pides piezas por categoría, las cantidades que quieras: llegan a tu estante), el INVENTARIO
// (cada unidad: su vida, si está libre o en qué dron) y TUS DISEÑOS STL (importar / borrar).
// =====================================================================
import { leerSTL, analizar, cargarSTL, STL_CACHE } from "./stl.js";
import { t } from "./i18n.js";
import * as TA from "./taller.js";
const { diasEnvio } = TA;
/** Cuándo llega (lo del barrio hoy; lo bueno mañana o en 2 días). */
export const llegaTxt = (pz) => ["🚚 " + t("llega hoy"), "🚚 " + t("llega mañana"), "🚚 " + t("llega en 2 días")][Math.min(2, diasEnvio(pz))];

// una función (no una constante): t() tiene que correr después de cargar el idioma
const CATS = () => [
  ["chasis", t("Chasis")], ["motores", t("Motores")], ["helices", t("Hélices")], ["escs", "ESC"], ["baterias", t("Baterías")],
  ["controladoras", t("Controladoras")], ["radios", t("Radios")], ["camaras", t("Cámaras")], ["montajes", t("Montajes")], ["extras", t("Extras")],
  ["herramientas", t("Herramientas")],
];

export function initTienda(ctx) {
  const { cat, PT, $, esc, toast, guardar, modal, G } = ctx;
  const T = { cat: "chasis", carro: new Map() };
  const P = () => G.partida;

  // ---------------- tienda ----------------
  function abrirTienda(categoria) {
    if (categoria) T.cat = categoria;
    render();
    modal("tienda");
  }

  function render() {
    const p = P(), et = PT.etapa(p);
    $("t-plata").textContent = `$${p.plata}`;
    const cats = $("t-cats");
    cats.innerHTML = "";
    for (const [k, n] of CATS()) {
      const b = document.createElement("button");
      b.textContent = n;
      b.setAttribute("aria-pressed", String(k === T.cat));
      b.onclick = () => { T.cat = k; render(); };
      cats.appendChild(b);
    }
    const box = $("t-prods");
    box.innerHTML = "";
    for (const pz of cat[T.cat]) {
      if (pz.etapa > et + 1) continue;
      const bloq = pz.etapa > et, herr = T.cat === "herramientas";
      const tengo = herr ? (PT.tieneHerramienta(p, pz.id) ? 1 : 0) : PT.unidades(p, pz.id).length, libres = herr ? 0 : PT.libres(p, pz.id).length;
      const key = `${T.cat}|${pz.id}`, enCarro = T.carro.get(key) || 0, precio = PT.precioDe(p, pz);
      const c = document.createElement("div");
      c.className = "prod" + (bloq ? " bloq" : "");
      c.innerHTML = `<div class="fila"><b>${pz.nombre}</b><span class="money">${precio ? "$" + precio : t("gratis")}</span></div>` +
        `<small>${ctx.descr(T.cat, pz)}</small>` + (herr ? "" : `<small class="envio">${llegaTxt(pz)}</small>`) +
        `<div class="tengo">${herr ? (tengo ? t("Ya la tienes") : "") : tengo ? (libres === 1 ? t("Tienes {n} ({l} libre)", { n: tengo, l: libres }) : t("Tienes {n} ({l} libres)", { n: tengo, l: libres })) : ""}${bloq ? `<span class="muted">${t("Se abre con reputación {rep}", { rep: PT.REP_ETAPA[pz.etapa] })}</span>` : ""}</div>` +
        `<div class="fila"><span class="qty"><button aria-label="${t("Menos")}">−</button><span>${enCarro}</span><button aria-label="${t("Más")}">+</button></span><button class="btn ghost small">${enCarro ? t("En el pedido") : t("Agregar")}</button></div>`;
      const [menos, mas] = c.querySelectorAll(".qty button"), add = c.querySelector(".fila:last-child > .btn");
      const set = (n) => {
        if (bloq) { toast(t("Se desbloquea con {rep} de reputación.", { rep: PT.REP_ETAPA[pz.etapa] })); return; }
        if (herr && tengo) { toast(t("Ya la tienes.")); return; }
        if (pz.impresora && !PT.tieneHerramienta(p, "impresora")) { toast(t("Eso se imprime: necesitas la impresora 3D.")); return; }
        n = Math.max(0, Math.min(herr ? 1 : 8, n));
        n ? T.carro.set(key, n) : T.carro.delete(key);
        render();
      };
      menos.onclick = () => set(enCarro - 1);
      mas.onclick = () => set(enCarro + 1);
      add.onclick = () => set(enCarro || 1);
      box.appendChild(c);
    }
    // el pedido
    const cb = $("t-carrito");
    let total = 0;
    cb.innerHTML = "";
    for (const [key, n] of T.carro) {
      const [ranura, id] = key.split("|"), pz = cat[ranura].find((x) => x.id === id), sub = PT.precioDe(p, pz) * n;
      total += sub;
      const it = document.createElement("div");
      it.className = "it";
      it.innerHTML = `<span>${n} × ${pz.nombre}</span><span class="money">$${sub}</span>`;
      cb.appendChild(it);
    }
    if (!T.carro.size) cb.innerHTML = `<span class='muted'>${t("Vacío. Agrega piezas (con + pides varias: una por dron).")}</span>`;
    $("t-total").textContent = `$${total}`;
    $("t-total").className = total > p.plata ? "bad" : "money";
    $("b-t-comprar").disabled = !T.carro.size || total > p.plata;
  }

  $("b-t-comprar").onclick = () => {
    const items = [...T.carro].map(([key, n]) => { const [ranura, id] = key.split("|"); return { ranura, id, n }; });
    const err = PT.comprarCarrito(P(), cat, items, { envio: true });
    if (err) { toast(err, 3500); return; }
    const piezas = items.filter((x) => x.ranura !== "herramientas"), n = piezas.reduce((s, x) => s + x.n, 0);
    const luego = piezas.filter((x) => diasEnvio(cat[x.ranura].find((z) => z.id === x.id))).reduce((s, x) => s + x.n, 0);
    T.carro.clear();
    guardar();
    render();
    ctx.garaje.paquete();
    toast(!n ? t("¡Listo! Ya tienes la herramienta.") : !luego ? t("📦 Llegó tu pedido: {n} en caja. Ábrelas en el banco de armado.", { n }) : luego === n ? t("🚚 Pedido hecho: {n} piezas vienen en camino (míralas en el inventario).", { n }) : t("📦 {h} llegaron hoy (en caja) y 🚚 {m} vienen en camino.", { h: n - luego, m: luego }), 4500);
    ctx.renderTaller();
  };
  $("b-t-cerrar").onclick = () => { modal("tienda", false); ctx.renderTaller(); };

  // ---------------- inventario ----------------
  function abrirInventario() { renderInv(); modal("inventario"); }

  function renderInv() {
    const p = P(), body = $("inv-body");
    let html = `<table class="inv-t"><tr><th>${t("Pieza")}</th><th>${t("Cant.")}</th><th>${t("Unidades")}</th></tr>`;
    for (const [ranura, nombre] of CATS()) {
      if (ranura === "herramientas") continue;
      const ids = [...new Set(p.inventario.map((u) => u.id))].filter((id) => cat[ranura].some((x) => x.id === id));
      if (!ids.length) continue;
      html += `<tr class="grp"><td colspan="3">${nombre}</td></tr>`;
      for (const id of ids) {
        const pz = cat[ranura].find((x) => x.id === id), us = PT.unidades(p, id);
        html += `<tr><td>${pz.nombre}</td><td>${us.length}</td><td>${us.map((u) => {
          const d = PT.dronDe(p, u.uid), plata = Math.round(pz.precio * PT.VENTA * (u.vida / 100));
          const dis = u.diseno ? ` · ${u.diseno.tipo === "stl" ? t("tu STL") : (cat.estilo.formas[u.diseno.forma] || u.diseno.forma).split(" ")[0]}` : pz.imprimible && PT.tieneHerramienta(p, "impresora") ? ` · ${t("sin imprimir")}` : "";
          const fw = u.fw ? ` · ${u.fw.ok ? t("con firmware") : t("firmware malo")}` : "";
          const env = TA.enCamino(p, u) ? ` · 🚚 ${t("llega el día {n}", { n: u.llega })}` : TA.enCaja(p, u) ? ` · 📦 ${t("en su caja")}` : "";
          return `<span class="u"><span class="${u.vida <= 0 ? "bad" : u.vida < 100 ? "warn" : ""}">${u.vida} %</span>${dis}${fw}${env} · ${d ? t("en <b>{dron}</b>", { dron: esc(d.nombre) }) : `${t("libre")} <button data-v="${u.uid}" title="${t("Vender usada")}">${t("vender ${n}", { n: plata })}</button>`}</span>`;
        }).join("")}</td></tr>`;
      }
    }
    const herr = (p.herramientas || []).map((id) => cat.herramientas.find((x) => x.id === id)?.nombre).filter(Boolean);
    html += `<tr class="grp"><td colspan="3">${t("Herramientas")}</td></tr><tr><td colspan="3">${herr.length ? herr.join(" · ") : `<span class='muted'>${t("Ninguna todavía (la tienda tiene impresora 3D, probador de humo y multímetro).")}</span>`}</td></tr></table>`;
    body.innerHTML = html;
    body.querySelectorAll("[data-v]").forEach((b) => (b.onclick = () => {
      const r = PT.vender(P(), cat, b.dataset.v);
      if (typeof r === "string") { toast(r); return; }
      guardar(); toast(t("Vendida por ${n}.", { n: r })); renderInv(); ctx.renderTaller();
    }));
    renderSTL();
  }

  function renderSTL() {
    const box = $("stl-lista"), d = ctx.D();
    box.innerHTML = G.stl.length ? "" : `<p class='muted' style='font-size:13.5px'>${t("Todavía no importas ninguno.")}</p>`;
    const TIPO = { chasis: t("Chasis"), canopy: t("Carcasa"), controladora: t("Controladora (cómo se ve)"), camara: t("Cámara (cómo se ve)"), bateria: t("Batería"), otro: t("Otro") };
    for (const s of G.stl) {
      const m = STL_CACHE.get(s.id)?.meta;
      const row = document.createElement("div");
      row.className = "card";
      row.style.cursor = "default";
      row.innerHTML = `<b>${esc(s.nombre)}</b> <span class="muted" style="font-size:12.5px">· ${TIPO[s.tipo] || s.tipo} · ${(s.bytes / 1024).toFixed(0)} KB</span>` +
        `<small>${m ? `${m.tam_mm.join(" × ")} mm · ${m.volumen_cm3} cm³ · ${t("~{g} g impreso en PLA", { g: m.masa_g })}${s.tipo === "chasis" ? ` · ${t("motores a {mm} mm del centro · hélices hasta {pul}\"", { mm: Math.round(m.radio_m * 1000), pul: m.helice_max })}` : ""}` : ""}</small>` +
        `<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap"></div>`;
      const acts = row.lastElementChild;
      const btn = (txt, fn) => { const b = document.createElement("button"); b.className = "btn ghost small"; b.textContent = txt; b.onclick = fn; acts.appendChild(b); };
      if ((s.tipo === "controladora" || s.tipo === "camara") && d) {
        const puesto = d.visuales?.[s.tipo] === s.id;
        btn(puesto ? t("Quitar de \"{dron}\"", { dron: d.nombre }) : t("Ponerlo en \"{dron}\"", { dron: d.nombre }), () => { d.visuales = { ...(d.visuales || {}) }; d.visuales[s.tipo] = puesto ? null : s.id; guardar(); ctx.verDron(); renderSTL(); });
      }
      if (s.tipo === "chasis" || s.tipo === "canopy") acts.insertAdjacentHTML("beforeend", `<span class='muted' style='font-size:12.5px;align-self:center'>${t("Se imprime en el banco (paso Imprimir).")}</span>`);
      btn(t("Borrar"), async () => {
        if (!confirm(t("¿Borrar \"{nombre}\"? (va a la papelera: stl/_papelera/)", { nombre: s.nombre }))) return;
        const r = await ctx.api("/api/stl_borrar", { id: s.id });
        if (!r.ok) { toast(r.msg); return; }
        G.stl = G.stl.filter((x) => x.id !== s.id);
        renderSTL();
      });
      box.appendChild(row);
    }
  }

  $("b-stl").onclick = () => $("stl-file").click();
  $("stl-file").onchange = async (e) => {
    const f = e.target.files[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > 25 * 1024 * 1024) { toast(t("Ese STL pesa más de 25 MB: simplifícalo (menos triángulos) en tu programa 3D.")); return; }
    const buf = await f.arrayBuffer();
    let meta;
    try { meta = analizar(leerSTL(buf)); } catch (err) { toast(String(err.message || err)); return; }
    const tipo = $("stl-tipo").value, nombre = f.name.replace(/\.stl$/i, "");
    if (tipo === "chasis" && Math.max(...meta.tam_mm) < 60) { if (!confirm(t("Mide {tam} mm: muy chico para un chasis. ¿Está en centímetros? Se importa igual.", { tam: meta.tam_mm.join(" × ") }))) return; }
    const r = await fetch(`/api/stl?nombre=${encodeURIComponent(nombre)}&tipo=${tipo}`, { method: "POST", body: buf }).then((x) => x.json()).catch(() => ({ ok: false, msg: t("No hay servidor.") }));
    if (!r.ok) { toast(r.msg || t("No pude guardar el STL.")); return; }
    const item = { id: r.id, nombre, tipo, bytes: buf.byteLength, url: r.url };
    G.stl.push(item);
    await cargarSTL(item);
    const d = ctx.D();
    if ((tipo === "controladora" || tipo === "camara") && d) { d.visuales = { ...(d.visuales || {}), [tipo]: r.id }; guardar(); ctx.verDron(); }
    toast(t("Importado \"{nombre}\": {tam} mm, ~{g} g impreso.", { nombre: esc(nombre), tam: meta.tam_mm.join(" × "), g: meta.masa_g }) + (tipo === "chasis" || tipo === "canopy" ? " " + t("Imprímelo en el banco.") : ""), 5000);
    renderSTL();
  };
  $("b-inv-cerrar").onclick = () => { modal("inventario", false); ctx.renderTaller(); };

  return { abrirTienda, abrirInventario };
}
