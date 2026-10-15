// =====================================================================
// LA TIENDA (pides piezas por categoría, las cantidades que quieras: llegan a tu estante), el INVENTARIO
// (cada unidad: su vida, si está libre o en qué dron) y TUS DISEÑOS STL (importar / borrar).
// =====================================================================
import { leerSTL, analizar, cargarSTL, STL_CACHE } from "./stl.js";

const CATS = [
  ["chasis", "Chasis"], ["motores", "Motores"], ["helices", "Hélices"], ["escs", "ESC"], ["baterias", "Baterías"],
  ["controladoras", "Controladoras"], ["radios", "Radios"], ["camaras", "Cámaras"], ["montajes", "Montajes"], ["extras", "Extras"],
  ["herramientas", "Herramientas"],
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
    for (const [k, n] of CATS) {
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
      c.innerHTML = `<div class="fila"><b>${pz.nombre}</b><span class="money">${precio ? "$" + precio : "gratis"}</span></div>` +
        `<small>${ctx.descr(T.cat, pz)}</small>` +
        `<div class="tengo">${herr ? (tengo ? "Ya la tienes" : "") : tengo ? `Tienes ${tengo} (${libres} libre${libres === 1 ? "" : "s"})` : ""}${bloq ? `<span class="muted">Se abre con reputación ${PT.REP_ETAPA[pz.etapa]}</span>` : ""}</div>` +
        `<div class="fila"><span class="qty"><button aria-label="Menos">−</button><span>${enCarro}</span><button aria-label="Más">+</button></span><button class="btn ghost small">${enCarro ? "En el pedido" : "Agregar"}</button></div>`;
      const [menos, mas] = c.querySelectorAll(".qty button"), add = c.querySelector(".fila:last-child > .btn");
      const set = (n) => {
        if (bloq) { toast(`Se desbloquea con ${PT.REP_ETAPA[pz.etapa]} de reputación.`); return; }
        if (herr && tengo) { toast("Ya la tienes."); return; }
        if (pz.impresora && !PT.tieneHerramienta(p, "impresora")) { toast("Eso se imprime: necesitas la impresora 3D."); return; }
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
    if (!T.carro.size) cb.innerHTML = "<span class='muted'>Vacío. Agrega piezas (con + pides varias: una por dron).</span>";
    $("t-total").textContent = `$${total}`;
    $("t-total").className = total > p.plata ? "bad" : "money";
    $("b-t-comprar").disabled = !T.carro.size || total > p.plata;
  }

  $("b-t-comprar").onclick = () => {
    const items = [...T.carro].map(([key, n]) => { const [ranura, id] = key.split("|"); return { ranura, id, n }; });
    const err = PT.comprarCarrito(P(), cat, items);
    if (err) { toast(err, 3500); return; }
    const n = items.reduce((s, x) => s + x.n, 0);
    T.carro.clear();
    guardar();
    render();
    ctx.garaje.paquete();
    toast(`¡Llegó tu pedido! ${n} ${n === 1 ? "pieza" : "piezas"} al estante. Ponlas en un dron desde el hangar.`, 4000);
    ctx.renderTaller();
  };
  $("b-t-cerrar").onclick = () => { modal("tienda", false); ctx.renderTaller(); };

  // ---------------- inventario ----------------
  function abrirInventario() { renderInv(); modal("inventario"); }

  function renderInv() {
    const p = P(), body = $("inv-body");
    let html = `<table class="inv-t"><tr><th>Pieza</th><th>Cant.</th><th>Unidades</th></tr>`;
    for (const [ranura, nombre] of CATS) {
      if (ranura === "herramientas") continue;
      const ids = [...new Set(p.inventario.map((u) => u.id))].filter((id) => cat[ranura].some((x) => x.id === id));
      if (!ids.length) continue;
      html += `<tr class="grp"><td colspan="3">${nombre}</td></tr>`;
      for (const id of ids) {
        const pz = cat[ranura].find((x) => x.id === id), us = PT.unidades(p, id);
        html += `<tr><td>${pz.nombre}</td><td>${us.length}</td><td>${us.map((u) => {
          const d = PT.dronDe(p, u.uid), plata = Math.round(pz.precio * PT.VENTA * (u.vida / 100));
          const dis = u.diseno ? ` · ${u.diseno.tipo === "stl" ? "tu STL" : (cat.estilo.formas[u.diseno.forma] || u.diseno.forma).split(" ")[0]}` : pz.imprimible && PT.tieneHerramienta(p, "impresora") ? " · sin imprimir" : "";
          const fw = u.fw ? ` · ${u.fw.ok ? "con firmware" : "firmware malo"}` : "";
          return `<span class="u"><span class="${u.vida <= 0 ? "bad" : u.vida < 100 ? "warn" : ""}">${u.vida} %</span>${dis}${fw} · ${d ? `en <b>${esc(d.nombre)}</b>` : `libre <button data-v="${u.uid}" title="Vender usada">vender $${plata}</button>`}</span>`;
        }).join("")}</td></tr>`;
      }
    }
    const herr = (p.herramientas || []).map((id) => cat.herramientas.find((x) => x.id === id)?.nombre).filter(Boolean);
    html += `<tr class="grp"><td colspan="3">Herramientas</td></tr><tr><td colspan="3">${herr.length ? herr.join(" · ") : "<span class='muted'>Ninguna todavía (la tienda tiene impresora 3D, probador de humo y multímetro).</span>"}</td></tr></table>`;
    body.innerHTML = html;
    body.querySelectorAll("[data-v]").forEach((b) => (b.onclick = () => {
      const r = PT.vender(P(), cat, b.dataset.v);
      if (typeof r === "string") { toast(r); return; }
      guardar(); toast(`Vendida por $${r}.`); renderInv(); ctx.renderTaller();
    }));
    renderSTL();
  }

  function renderSTL() {
    const box = $("stl-lista"), d = ctx.D();
    box.innerHTML = G.stl.length ? "" : "<p class='muted' style='font-size:13.5px'>Todavía no importas ninguno.</p>";
    const TIPO = { chasis: "Chasis", canopy: "Carcasa", controladora: "Controladora (cómo se ve)", camara: "Cámara (cómo se ve)", bateria: "Batería", otro: "Otro" };
    for (const s of G.stl) {
      const m = STL_CACHE.get(s.id)?.meta;
      const row = document.createElement("div");
      row.className = "card";
      row.style.cursor = "default";
      row.innerHTML = `<b>${esc(s.nombre)}</b> <span class="muted" style="font-size:12.5px">· ${TIPO[s.tipo] || s.tipo} · ${(s.bytes / 1024).toFixed(0)} KB</span>` +
        `<small>${m ? `${m.tam_mm.join(" × ")} mm · ${m.volumen_cm3} cm³ · ~${m.masa_g} g impreso en PLA${s.tipo === "chasis" ? ` · motores a ${Math.round(m.radio_m * 1000)} mm del centro · hélices hasta ${m.helice_max}"` : ""}` : ""}</small>` +
        `<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap"></div>`;
      const acts = row.lastElementChild;
      const btn = (t, fn) => { const b = document.createElement("button"); b.className = "btn ghost small"; b.textContent = t; b.onclick = fn; acts.appendChild(b); };
      if ((s.tipo === "controladora" || s.tipo === "camara") && d) {
        const puesto = d.visuales?.[s.tipo] === s.id;
        btn(puesto ? `Quitar de "${d.nombre}"` : `Ponerlo en "${d.nombre}"`, () => { d.visuales = { ...(d.visuales || {}) }; d.visuales[s.tipo] = puesto ? null : s.id; guardar(); ctx.verDron(); renderSTL(); });
      }
      if (s.tipo === "chasis" || s.tipo === "canopy") acts.insertAdjacentHTML("beforeend", "<span class='muted' style='font-size:12.5px;align-self:center'>Se imprime en el banco (paso Imprimir).</span>");
      btn("Borrar", async () => {
        if (!confirm(`¿Borrar "${s.nombre}"? (va a la papelera: stl/_papelera/)`)) return;
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
    if (f.size > 25 * 1024 * 1024) { toast("Ese STL pesa más de 25 MB: simplifícalo (menos triángulos) en tu programa 3D."); return; }
    const buf = await f.arrayBuffer();
    let meta;
    try { meta = analizar(leerSTL(buf)); } catch (err) { toast(String(err.message || err)); return; }
    const tipo = $("stl-tipo").value, nombre = f.name.replace(/\.stl$/i, "");
    if (tipo === "chasis" && Math.max(...meta.tam_mm) < 60) { if (!confirm(`Mide ${meta.tam_mm.join(" × ")} mm: muy chico para un chasis. ¿Está en centímetros? Se importa igual.`)) return; }
    const r = await fetch(`/api/stl?nombre=${encodeURIComponent(nombre)}&tipo=${tipo}`, { method: "POST", body: buf }).then((x) => x.json()).catch(() => ({ ok: false, msg: "No hay servidor." }));
    if (!r.ok) { toast(r.msg || "No pude guardar el STL."); return; }
    const item = { id: r.id, nombre, tipo, bytes: buf.byteLength, url: r.url };
    G.stl.push(item);
    await cargarSTL(item);
    const d = ctx.D();
    if ((tipo === "controladora" || tipo === "camara") && d) { d.visuales = { ...(d.visuales || {}), [tipo]: r.id }; guardar(); ctx.verDron(); }
    toast(`Importado "${esc(nombre)}": ${meta.tam_mm.join(" × ")} mm, ~${meta.masa_g} g impreso.${tipo === "chasis" || tipo === "canopy" ? " Imprímelo en el banco." : ""}`, 5000);
    renderSTL();
  };
  $("b-inv-cerrar").onclick = () => { modal("inventario", false); ctx.renderTaller(); };

  return { abrirTienda, abrirInventario };
}
