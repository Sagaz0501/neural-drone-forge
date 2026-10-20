// =====================================================================
// LA TIENDA (pides piezas por categoría, las cantidades que quieras: llegan a tu estante), el INVENTARIO
// (cada unidad: su vida, si está libre o en qué dron) y TUS DISEÑOS STL (importar / borrar).
// =====================================================================
import { leerSTL, cargarSTL, STL_CACHE, stlBinario } from "./stl.js";
import { esSTEP, leerSTEP, juntar } from "./step.js";
import { abrirAnalisis } from "./ui_importar.js";
import { t, num } from "./i18n.js";
import { confirmar } from "./dialogo.js";
import { miniatura } from "./miniaturas.js";
import * as TA from "./taller.js";
const { diasEnvio } = TA;
/** Cuándo llega (lo del barrio hoy; lo bueno mañana o en 2 días). */
export const llegaTxt = (pz) => ["🚚 " + t("llega hoy"), "🚚 " + t("llega mañana"), "🚚 " + t("llega en 2 días")][Math.min(2, diasEnvio(pz))];

// una función (no una constante): t() tiene que correr después de cargar el idioma
const CATS = () => [
  ["kits", t("Kits"), "🎁"], ["chasis", t("Chasis"), "✖️"], ["motores", t("Motores"), "⚙️"], ["helices", t("Hélices"), "🌀"], ["escs", "ESC", "⚡"], ["baterias", t("Baterías"), "🔋"],
  ["controladoras", t("Controladoras"), "🧠"], ["radios", t("Radios"), "📡"], ["camaras", t("Cámaras"), "🎥"], ["montajes", t("Montajes"), "🔩"], ["extras", t("Extras"), "✨"],
  ["soldadura", t("Soldadura"), "🔥"], ["impresion", t("Impresión 3D"), "🖨️"], ["herramientas", t("Herramientas"), "🧰"],
];
/** Lo que se compara de cada sección: [campo o función, nombre, unidad, +1 más es mejor / −1 menos es mejor]. */
const wh = (pz) => +((pz.mah * pz.celdas * 3.7) / 1000).toFixed(1);
const STATS = () => ({
  chasis: [["masa_g", t("Peso"), "g", -1], ["aguante_ms", t("Aguanta"), "m/s", 1], ["helice_max", t("Hélices hasta"), "\"", 1]],
  motores: [[(pz) => pz.empuje_g * 4, t("Empuje"), "g", 1], ["eficiencia_gW", t("Eficiencia"), "g/W", 1], [(pz) => pz.masa_g * 4, t("Peso"), "g", -1]],
  helices: [["pulgadas", t("Tamaño"), "\"", 1], ["durabilidad", t("Aguante"), "", 1], ["masa_g", t("Peso"), "g", -1]],
  escs: [["corriente_a", t("Corriente"), "A", 1], ["masa_g", t("Peso"), "g", -1]],
  baterias: [[wh, t("Energía"), "Wh", 1], ["celdas", t("Celdas"), "S", 1], ["masa_g", t("Peso"), "g", -1]],
  controladoras: [["respuesta", t("Respuesta"), "", 1], ["angulo_max", t("Inclinación máx."), "°", 1], ["masa_g", t("Peso"), "g", -1]],
  radios: [["alcance_m", t("Alcance"), "m", 1], ["masa_g", t("Peso"), "g", -1]],
  camaras: [["calidad", t("Calidad"), "", 1], ["masa_g", t("Peso"), "g", -1]],
  montajes: [["vib", t("Vibración"), "", -1], ["masa_g", t("Peso"), "g", -1]],
  extras: [["masa_g", t("Peso"), "g", -1]],
  soldadura: [[(pz) => pz.cautin?.potencia, t("Potencia"), "", 1]],
  impresion: [[(pz) => pz.impresora3d?.cama_mm[0], t("Cama"), "mm", 1], [(pz) => pz.impresora3d?.g_h, t("Velocidad"), "g/h", 1], [(pz) => pz.impresora3d && Math.round((1 - pz.impresora3d.fallo) * 100), t("Sin fallas"), "%", 1]],
  herramientas: [],
});
/** La ranura del dron que ocupa cada sección (para comparar con lo que tienes puesto). */
const SLOT = { chasis: "chasis", motores: "motores", helices: "helices", escs: "esc", baterias: "bateria", controladoras: "controladora", radios: "radio", camaras: "camara", montajes: "montaje" };

export function initTienda(ctx) {
  const { cat, PT, $, esc, toast, guardar, modal, G } = ctx;
  const T = { cat: "chasis", carro: new Map(), sel: null, lado: "detalle", q: "" };
  const P = () => G.partida;
  const valor = (f, pz) => (typeof f === "function" ? f(pz) : pz[f]);
  const fmtN = (v) => (typeof v === "number" ? (Number.isInteger(v) ? String(v) : num(v, 1)) : "—");
  const ICONO = Object.fromEntries(CATS().map(([k, , i]) => [k, i]));
  const esHerr = (r, pz) => PT.esHerramienta(r, pz);

  // ---------------- tienda ----------------
  function abrirTienda(categoria) {
    if (categoria) T.cat = categoria;
    else if (!P().drones.length) T.cat = "kits";          // sin drones: lo primero es el kit
    T.sel = null; T.lado = "detalle";
    render();
    modal("tienda");
  }
  /** La foto de la pieza (o su ícono mientras se dibuja). */
  function imagen(r, pz, el) {
    const url = miniatura(cat, r, pz, (u) => { if (u && el.isConnected) el.innerHTML = `<img src="${u}" alt="">`; });
    el.innerHTML = url ? `<img src="${url}" alt="">` : `<span class="tv-ico">${ICONO[r] || "📦"}</span>`;
  }
  /** Las barras: cuánto tiene comparado con lo mejor de la sección. */
  function barras(r, pz, todas = false) {
    const st = STATS()[r] || [], lista = cat[r] || [];
    return st.slice(0, todas ? 9 : 3).map(([f, nombre, u, dir]) => {
      const v = valor(f, pz);
      if (typeof v !== "number") return "";
      const vs = lista.map((x) => valor(f, x)).filter((x) => typeof x === "number" && x > 0);
      const k = dir > 0 ? v / Math.max(...vs) : Math.min(...vs) / Math.max(v, 1e-6);
      return `<div class="tv-st"><span>${esc(nombre)}</span><i><b style="width:${Math.round(Math.max(0.06, Math.min(1, k)) * 100)}%"></b></i><em>${fmtN(v)} ${u}</em></div>`;
    }).join("");
  }
  function render() {
    const p = P(), et = PT.etapa(p);
    $("t-plata").textContent = `$${p.plata}`;
    // las secciones
    const cats = $("t-cats");
    cats.innerHTML = "";
    for (const [k, n, ic] of CATS()) {
      const b = document.createElement("button");
      b.innerHTML = `<span>${ic}</span>${esc(n)}`;
      b.setAttribute("aria-pressed", String(k === T.cat && !T.q));
      b.onclick = () => { T.cat = k; T.q = ""; $("t-buscar").value = ""; T.sel = null; if (T.lado === "detalle") T.lado = "detalle"; render(); };
      cats.appendChild(b);
    }
    // la cabecera de la sección
    const q = T.q.trim().toLowerCase();
    const lista = q ? CATS().flatMap(([r]) => (cat[r] || []).map((pz) => [r, pz])).filter(([, pz]) => (pz.nombre + " " + (pz.desc || "")).toLowerCase().includes(q))
      : (cat[T.cat] || []).map((pz) => [T.cat, pz]);
    const filas = lista.filter(([, pz]) => !pz.oculto);              // "oculto": de antes, ya no se vende (el chasis de PETG)
    const ins = p.insumos || {};
    $("t-head").innerHTML = q ? `<h3>🔎 “${esc(T.q)}”</h3><span class="muted">${t("{n} resultados", { n: lista.length })}</span>`
      : `<h3>${ICONO[T.cat]} ${esc(CATS().find(([k]) => k === T.cat)[1])}</h3>` +
        (T.cat === "soldadura" ? `<span class="tv-chips"><span>🧵 ${num(ins.estano || 0, 1)} g</span><span>💧 ${num(ins.flux || 0, 1)} ml</span><span>🧷 ${num(ins.cable || 0, 1)} m</span><span>🟫 ${num(ins.malla || 0, 2)} m</span></span>` : "") +
        (T.cat === "impresion" ? `<span class="tv-chips">${filamentos(ins)}</span>` : "");
    // las tarjetas
    const box = $("t-prods");
    box.innerHTML = "";
    if (T.cat === "kits" && !q) { kits(box); lado(); return; }
    for (const [r, pz] of filas) {
      if (pz.etapa > et + 1) continue;
      const bloq = pz.etapa > et, herr = esHerr(r, pz), precio = PT.precioDe(p, pz);
      const tengo = herr ? (PT.tieneHerramienta(p, pz.id) ? 1 : 0) : pz.insumo ? 0 : PT.unidades(p, pz.id).length;
      const enCarro = T.carro.get(`${r}|${pz.id}`) || 0;
      const c = document.createElement("div");
      c.className = "tv-card" + (bloq ? " bloq" : "") + (T.sel?.id === pz.id ? " sel" : "");
      c.innerHTML = `<div class="tv-img"></div><div class="tv-info"><b>${esc(pz.nombre)}</b><span class="tv-precio">${precio ? "$" + precio : t("gratis")}</span></div>` +
        `<div class="tv-stats">${barras(r, pz)}</div>` +
        `<div class="tv-pie">${herr || pz.insumo ? `<span class="tv-envio">🏪 ${t("hoy")}</span>` : `<span class="tv-envio">${llegaTxt(pz)}</span>`}` +
        `<span class="tv-tengo">${herr ? (tengo ? "✓ " + t("la tienes") : "") : pz.insumo ? `${t("tienes")} ${num(ins[pz.insumo.k] || 0, pz.insumo.n >= 100 ? 0 : 1)} ${pz.insumo.unidad}` : tengo ? t("tienes {n}", { n: tengo }) : ""}</span>` +
        `<button class="tv-add" aria-label="${t("Agregar a la canasta")}">${enCarro ? enCarro : "+"}</button></div>` +
        (bloq ? `<div class="tv-candado">🔒 ${t("Reputación {rep}", { rep: PT.REP_ETAPA[pz.etapa] })}</div>` : "");
      imagen(r, pz, c.querySelector(".tv-img"));
      c.onclick = (ev) => { if (ev.target.closest(".tv-add")) return; T.sel = { r, id: pz.id }; T.lado = "detalle"; render(); };
      c.querySelector(".tv-add").onclick = () => agregar(r, pz, 1);
      box.appendChild(c);
    }
    if (!box.childElementCount) box.innerHTML = `<p class="muted">${t("Nada por aquí.")}</p>`;
    lado();
  }
  /** Lo que te queda de cada filamento (chips). */
  function filamentos(ins) {
    return (cat.impresion || []).filter((x) => x.insumo).map((x) => `<span><i style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${x.color};margin-right:4px"></i>${x.insumo.k.toUpperCase()} ${num(ins[x.insumo.k] || 0, 0)} g</span>`).join("");
  }
  /** Los kits: el Kit del garaje (lo que falte del dron de madera + lo básico para soldar) en un dron nuevo. */
  function kits(box) {
    const K = ctx.kit, faltan = K?.faltan() || [], costo = K?.costo() || 0, p = P();
    const nom = (x) => cat[x.ranura]?.find((z) => z.id === x.id)?.nombre || x.id;
    const c = document.createElement("div");
    c.className = "tv-card";
    c.innerHTML = `<div class="tv-img"></div><div class="tv-info"><b>${t("Kit del garaje")}</b><span class="tv-precio">${costo ? "$" + costo : t("gratis")}</span></div>` +
      `<div class="tv-stats"><small class="muted">${t("El dron de madera de siempre, en un dron nuevo de tu hangar. Trae lo que te falte:")}</small><small>${faltan.map(nom).join(" · ") || t("ya tienes todo")}</small></div>` +
      `<div class="tv-pie"><span class="tv-envio">🚚 ${t("llega hoy")}</span><span class="tv-tengo"></span><button class="btn main small">${t("Comprar el kit")}</button></div>`;
    imagen("chasis", cat.chasis.find((x) => x.id === "madera"), c.querySelector(".tv-img"));
    c.querySelector(".tv-pie button").disabled = costo > p.plata;
    c.querySelector(".tv-pie button").onclick = () => { K.comprar(); render(); };
    box.appendChild(c);
  }
  function agregar(r, pz, d) {
    const p = P(), key = `${r}|${pz.id}`, herr = esHerr(r, pz), en = T.carro.get(key) || 0;
    if (pz.etapa > PT.etapa(p)) { toast(t("Se desbloquea con {rep} de reputación.", { rep: PT.REP_ETAPA[pz.etapa] })); return; }
    if (herr && PT.tieneHerramienta(p, pz.id)) { toast(t("Ya la tienes.")); return; }
    { const err = !herr && PT.puedeComprar(p, cat, r, pz.id); if (err && (pz.impresora || pz.imprime)) { toast(err); return; } }
    const n = Math.max(0, Math.min(herr ? 1 : 8, en + d));
    n ? T.carro.set(key, n) : T.carro.delete(key);
    render();
  }
  /** El panel de la derecha: el detalle de la pieza elegida o la canasta. */
  function lado() {
    const p = P(), box = $("t-lado");
    let total = 0, n = 0, hoyN = 0, luegoN = 0;
    for (const [key, k] of T.carro) {
      const [r, id] = key.split("|"), pz = cat[r].find((x) => x.id === id);
      total += PT.precioDe(p, pz) * k; n += k;
      if (!esHerr(r, pz) && !pz.insumo && diasEnvio(pz)) luegoN += k; else hoyN += k;
    }
    $("t-total").textContent = `$${total}`; $("t-n").textContent = n;
    $("b-t-canasta").setAttribute("aria-pressed", String(T.lado === "canasta"));
    if (T.lado === "canasta") {
      box.innerHTML = `<h3>🧺 ${t("Tu canasta")}</h3><div id="t-carrito"></div>`;
      const cb = box.querySelector("#t-carrito");
      for (const [key, k] of T.carro) {
        const [r, id] = key.split("|"), pz = cat[r].find((x) => x.id === id);
        const it = document.createElement("div");
        it.className = "tv-linea";
        it.innerHTML = `<div class="tv-mini"></div><span><b>${esc(pz.nombre)}</b><small>$${PT.precioDe(p, pz)} · ${esHerr(r, pz) || pz.insumo ? "🏪 " + t("hoy") : llegaTxt(pz)}</small></span>` +
          `<span class="qty"><button aria-label="${t("Menos")}">−</button><span>${k}</span><button aria-label="${t("Más")}">+</button></span>`;
        imagen(r, pz, it.querySelector(".tv-mini"));
        const [menos, mas] = it.querySelectorAll(".qty button");
        menos.onclick = () => agregar(r, pz, -1); mas.onclick = () => agregar(r, pz, 1);
        cb.appendChild(it);
      }
      if (!T.carro.size) cb.innerHTML = `<p class="muted">${t("Vacía. Toca + en una pieza para agregarla.")}</p>`;
      const queda = p.plata - total;
      box.insertAdjacentHTML("beforeend", `<div class="tv-resumen"><div><span>${t("Subtotal")}</span><b>$${total}</b></div><div><span>${t("Envío")}</span><b class="ok">${t("gratis")}</b></div>` +
        (n ? `<div><span>${t("Llega")}</span><small>${hoyN ? `📦 ${t("hoy")}: ${hoyN}` : ""}${hoyN && luegoN ? " · " : ""}${luegoN ? `🚚 ${t("después")}: ${luegoN}` : ""}</small></div>` : "") +
        `<div><span>${t("Te queda")}</span><b class="${queda < 0 ? "bad" : ""}">$${queda}</b></div></div>`);
      const pagar = document.createElement("button");
      pagar.className = "btn main"; pagar.id = "b-t-comprar";
      pagar.textContent = queda < 0 ? t("Te faltan ${n}", { n: -queda }) : t("Pagar ${n}", { n: total });
      pagar.disabled = !n || queda < 0;
      pagar.onclick = comprar;
      box.appendChild(pagar);
      return;
    }
    // el detalle
    const s = T.sel && cat[T.sel.r]?.find((x) => x.id === T.sel.id);
    if (!s) { box.innerHTML = `<div class="tv-vacio"><span>${ICONO[T.cat]}</span><p class="muted">${t("Toca una pieza para ver sus detalles y compararla con la que tienes puesta.")}</p></div>`; return; }
    const r = T.sel.r, d = ctx.D?.(), puestaU = d && SLOT[r] && PT.unidad(p, d.slots[SLOT[r]]), puesta = puestaU && cat[r].find((x) => x.id === puestaU.id);
    box.innerHTML = `<div class="tv-img grande"></div><h3>${esc(s.nombre)}</h3><p class="tv-precio">${PT.precioDe(p, s) ? "$" + PT.precioDe(p, s) : t("gratis")} <small>${esHerr(r, s) || s.insumo ? "🏪 " + t("hoy") : llegaTxt(s)}</small></p>` +
      `<p class="tv-desc">${esc(ctx.descr(r, s))}</p><div class="tv-stats">${barras(r, s, true)}</div>`;
    imagen(r, s, box.querySelector(".tv-img"));
    if (puesta && puesta.id !== s.id) {
      const cmp = (STATS()[r] || []).map(([f, nombre, u, dir]) => {
        const a = valor(f, puesta), b = valor(f, s);
        if (typeof a !== "number" || typeof b !== "number" || a === b) return "";
        const mejor = (b - a) * dir > 0;
        return `<li class="${mejor ? "ok" : "bad"}">${mejor ? "▲" : "▼"} ${esc(nombre)}: ${fmtN(a)} → ${fmtN(b)} ${u}</li>`;
      }).join("");
      if (cmp) box.insertAdjacentHTML("beforeend", `<h4>${t("Contra la de {d}", { d: esc(d.nombre) })}<small> · ${esc(puesta.nombre)}</small></h4><ul class="tv-cmp">${cmp}</ul>`);
    } else if (puesta) box.insertAdjacentHTML("beforeend", `<p class="ok">✓ ${t("Es la que tiene {d}.", { d: esc(d.nombre) })}</p>`);
    const b = document.createElement("button");
    b.className = "btn main"; b.textContent = "+ " + t("Agregar a la canasta");
    b.onclick = () => agregar(r, s, 1);
    box.appendChild(b);
  }
  function comprar() {
    const items = [...T.carro].map(([key, n]) => { const [ranura, id] = key.split("|"); return { ranura, id, n }; });
    const err = PT.comprarCarrito(P(), cat, items, { envio: true });
    if (err) { toast(err, 3500); return; }
    const piezas = items.filter((x) => { const pz = cat[x.ranura].find((z) => z.id === x.id); return !esHerr(x.ranura, pz) && !pz.insumo; }), n = piezas.reduce((s, x) => s + x.n, 0);
    const luego = piezas.filter((x) => diasEnvio(cat[x.ranura].find((z) => z.id === x.id))).reduce((s, x) => s + x.n, 0);
    T.carro.clear(); T.lado = "detalle";
    guardar();
    render();
    if (n) ctx.garaje.paquete();
    toast(!n ? t("¡Listo! Ya está en tu taller.") : !luego ? t("📦 Llegó tu pedido: {n} en caja. Ábrelas en el banco de armado.", { n }) : luego === n ? t("🚚 Pedido hecho: {n} piezas vienen en camino (míralas en el inventario).", { n }) : t("📦 {h} llegaron hoy (en caja) y 🚚 {m} vienen en camino.", { h: n - luego, m: luego }), 4500);
    ctx.renderTaller();
  }
  $("b-t-canasta").onclick = () => { T.lado = T.lado === "canasta" ? "detalle" : "canasta"; lado(); };
  $("t-buscar").oninput = (ev) => { T.q = ev.target.value; render(); };
  $("b-t-cerrar").onclick = () => { modal("tienda", false); ctx.renderTaller(); };

  // ---------------- el estante: lo que tienes, en repisas por tipo ----------------
  const E_ = { sel: null };
  function abrirEstante() { E_.sel = null; renderEstante(); modal("estante"); }
  function renderEstante() {
    const p = P(), box = $("estante-c");
    box.innerHTML = "";
    const fila = (titulo, items, vacio) => {
      const f = document.createElement("div");
      f.className = "est-fila";
      f.innerHTML = `<h4>${titulo}</h4><div class="est-tabla"></div><div class="est-madera"></div>`;
      const tabla = f.querySelector(".est-tabla");
      if (!items.length) tabla.innerHTML = `<span class="est-vacio">${vacio}</span>`;
      for (const it of items) tabla.appendChild(it);
      box.appendChild(f);
    };
    const caja = (r, pz, n, vida, extra, onclick) => {
      const b = document.createElement("button");
      b.className = "est-caja";
      b.setAttribute("aria-pressed", String(E_.sel?.id === pz.id));
      b.innerHTML = `<div class="tv-img"></div><b>${esc(pz.nombre)}</b>${n > 1 ? `<span class="est-n">×${n}</span>` : ""}` + (vida != null ? `<span class="est-vida"><i style="width:${vida}%;background:${vida < 40 ? "var(--crash)" : vida < 100 ? "var(--gold)" : "var(--gate)"}"></i></span>` : "") + (extra ? `<small class="muted">${extra}</small>` : "");
      imagen(r, pz, b.querySelector(".tv-img"));
      b.onclick = onclick;
      return b;
    };
    for (const [r, nombre, ic] of CATS()) {
      if (r === "kits" || r === "herramientas" || r === "soldadura" || r === "impresion") continue;
      const ids = [...new Set(p.inventario.map((u) => u.id))].filter((id) => cat[r]?.some((x) => x.id === id));
      fila(`${ic} ${nombre}`, ids.map((id) => {
        const pz = cat[r].find((x) => x.id === id), us = PT.unidades(p, id), libres = us.filter((u) => !PT.dronDe(p, u.uid)).length;
        const vida = Math.round(us.reduce((a, u) => a + u.vida, 0) / us.length);
        return caja(r, pz, us.length, vida, libres ? t("{n} libres", { n: libres }) : t("en uso"), () => { E_.sel = { r, id }; renderEstante(); });
      }), t("vacío"));
    }
    const herr = [...cat.herramientas.map((x) => ["herramientas", x]), ...(cat.soldadura || []).filter((x) => x.herramienta).map((x) => ["soldadura", x]), ...(cat.impresion || []).filter((x) => x.herramienta).map((x) => ["impresion", x])].filter(([, x]) => PT.tieneHerramienta(p, x.id));
    fila(`🧰 ${t("Herramientas")}`, herr.map(([r, pz]) => caja(r, pz, 1, null, "", () => { E_.sel = { r, id: pz.id }; renderEstante(); })), t("vacío"));
    const ins = (cat.soldadura || []).filter((x) => x.insumo);
    fila(`🔥 ${t("Soldadura")}`, ins.map((pz) => caja("soldadura", pz, 1, null, `${num(PT.insumo(p, pz.insumo.k), pz.insumo.k === "malla" ? 2 : 1)} ${pz.insumo.unidad}`, () => { E_.sel = { r: "soldadura", id: pz.id }; renderEstante(); })), t("vacío"));
    const fil = (cat.impresion || []).filter((x) => x.insumo && PT.insumo(p, x.insumo.k) > 0);
    fila(`🖨️ ${t("Filamento")}`, fil.map((pz) => caja("impresion", pz, 1, null, `${num(PT.insumo(p, pz.insumo.k), 0)} g`, () => { E_.sel = { r: "impresion", id: pz.id }; renderEstante(); })), t("vacío"));
    detalleEstante();
  }
  function detalleEstante() {
    const p = P(), det = $("estante-det"), s = E_.sel, pz = s && cat[s.r]?.find((x) => x.id === s.id);
    if (!pz) { det.innerHTML = `<p class="muted">${t("Toca una pieza para ver sus unidades, su vida y en qué dron está. Comprar es en 💻 Computador → Tienda.")}</p>`; return; }
    det.innerHTML = `<div class="tv-img grande"></div><h3>${esc(pz.nombre)}</h3><p class="muted" style="margin:0">${esc(ctx.descr(s.r, pz))}</p>`;
    imagen(s.r, pz, det.querySelector(".tv-img"));
    if (pz.insumo) { det.insertAdjacentHTML("beforeend", `<p>${t("Te quedan {n} {u}.", { n: num(PT.insumo(p, pz.insumo.k), 2), u: pz.insumo.unidad })}</p>`); return; }
    if (PT.esHerramienta(s.r, pz)) { det.insertAdjacentHTML("beforeend", `<p class="ok">✓ ${t("La tienes en el taller.")}</p>`); return; }
    for (const u of PT.unidades(p, pz.id)) {
      const d = PT.dronDe(p, u.uid), plata = Math.round(pz.precio * PT.VENTA * (u.vida / 100));
      const env = TA.enCamino(p, u) ? ` · 🚚 ${t("llega el día {n}", { n: u.llega })}` : TA.enCaja(p, u) ? ` · 📦 ${t("en su caja")}` : "";
      const row = document.createElement("div");
      row.className = "est-u";
      row.innerHTML = `<span><b class="${u.vida <= 0 ? "bad" : u.vida < 100 ? "warn" : "ok"}">${u.vida} %</b>${env}<br><small class="muted">${d ? t("en {dron}", { dron: esc(d.nombre) }) : t("libre")}</small></span>`;
      if (!d) { const b = document.createElement("button"); b.className = "btn ghost small"; b.textContent = t("vender ${n}", { n: plata }); b.onclick = () => { const r = PT.vender(p, cat, u.uid); if (typeof r === "string") return toast(r); guardar(); toast(t("Vendida por ${n}.", { n: r })); renderEstante(); ctx.renderTaller(); }; row.appendChild(b); }
      det.appendChild(row);
    }
  }
  $("b-est-cerrar").onclick = () => { modal("estante", false); ctx.renderTaller(); };
  $("b-est-lista").onclick = () => { modal("estante", false); abrirInventario(); };

  // ---------------- inventario ----------------
  function abrirInventario() { renderInv(); modal("inventario"); }

  function renderInv() {
    const p = P(), body = $("inv-body");
    let html = `<table class="inv-t"><tr><th>${t("Pieza")}</th><th>${t("Cant.")}</th><th>${t("Unidades")}</th></tr>`;
    for (const [ranura, nombre] of CATS()) {
      if (ranura === "herramientas" || ranura === "soldadura" || ranura === "impresion") continue;
      const ids = [...new Set(p.inventario.map((u) => u.id))].filter((id) => (cat[ranura] || []).some((x) => x.id === id));
      if (!ids.length) continue;
      html += `<tr class="grp"><td colspan="3">${nombre}</td></tr>`;
      for (const id of ids) {
        const pz = cat[ranura].find((x) => x.id === id), us = PT.unidades(p, id);
        html += `<tr><td>${pz.nombre}</td><td>${us.length}</td><td>${us.map((u) => {
          const d = PT.dronDe(p, u.uid), plata = Math.round(pz.precio * PT.VENTA * (u.vida / 100));
          const dis = u.diseno ? ` · ${u.diseno.tipo === "stl" ? t("tu STL") : (cat.estilo.formas[u.diseno.forma] || u.diseno.forma).split(" ")[0]}` : pz.imprimible && PT.tieneImpresora(p) ? ` · ${t("sin imprimir")}` : "";
          const fw = u.fw ? ` · ${u.fw.ok ? t("con firmware") : t("firmware malo")}` : "";
          const env = TA.enCamino(p, u) ? ` · 🚚 ${t("llega el día {n}", { n: u.llega })}` : TA.enCaja(p, u) ? ` · 📦 ${t("en su caja")}` : "";
          return `<span class="u"><span class="${u.vida <= 0 ? "bad" : u.vida < 100 ? "warn" : ""}">${u.vida} %</span>${dis}${fw}${env} · ${d ? t("en <b>{dron}</b>", { dron: esc(d.nombre) }) : `${t("libre")} <button data-v="${u.uid}" title="${t("Vender usada")}">${t("vender ${n}", { n: plata })}</button>`}</span>`;
        }).join("")}</td></tr>`;
      }
    }
    const herr = (p.herramientas || []).map((id) => [...cat.herramientas, ...(cat.soldadura || []), ...(cat.impresion || [])].find((x) => x.id === id)?.nombre).filter(Boolean);
    const ins = p.insumos || {};
    html += `<tr class="grp"><td colspan="3">${t("Herramientas")}</td></tr><tr><td colspan="3">${herr.length ? herr.join(" · ") : `<span class='muted'>${t("Ninguna todavía (la tienda tiene impresora 3D, probador de humo y multímetro).")}</span>`}</td></tr><tr class="grp"><td colspan="3">${t("Soldadura")}</td></tr><tr><td colspan="3">🧵 ${num(ins.estano || 0, 1)} g · 💧 ${num(ins.flux || 0, 1)} ml · 🧷 ${num(ins.cable || 0, 1)} m · 🟫 ${num(ins.malla || 0, 2)} m</td></tr><tr class="grp"><td colspan="3">${t("Filamento")}</td></tr><tr><td colspan="3">${(cat.impresion || []).filter((x) => x.insumo).map((x) => `${x.insumo.k.toUpperCase()} ${num(ins[x.insumo.k] || 0, 0)} g`).join(" · ")}</td></tr></table>`;
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
      row.innerHTML = `<b>${esc(s.nombre)}</b> <span class="muted" style="font-size:12.5px">· ${TIPO[s.tipo] || s.tipo} · ${s.step ? `STEP (${s.step.elegidos?.length || 1} ${t("pieza(s)")}) → ` : ""}${(s.bytes / 1024).toFixed(0)} KB</span>` +
        `<small>${m ? `${m.tam_mm.join(" × ")} mm · ${m.volumen_cm3} cm³ · ${t("~{g} g impreso en PLA", { g: m.masa_g })}${s.tipo === "chasis" ? ` · ${t("motores a {mm} mm del centro · hélices hasta {pul}\"", { mm: Math.round(m.radio_m * 1000), pul: m.helice_max })}` : ""}` : ""}</small>` +
        `<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap"></div>`;
      const acts = row.lastElementChild;
      const btn = (txt, fn) => { const b = document.createElement("button"); b.className = "btn ghost small"; b.textContent = txt; b.onclick = fn; acts.appendChild(b); };
      if ((s.tipo === "controladora" || s.tipo === "camara") && d) {
        const puesto = d.visuales?.[s.tipo] === s.id;
        btn(puesto ? t("Quitar de \"{dron}\"", { dron: d.nombre }) : t("Ponerlo en \"{dron}\"", { dron: d.nombre }), () => { d.visuales = { ...(d.visuales || {}) }; d.visuales[s.tipo] = puesto ? null : s.id; guardar(); ctx.verDron(); renderSTL(); });
      }
      btn("🔍 " + t("Analizar"), async () => {
        const c = STL_CACHE.get(s.id) || (await cargarSTL(s).catch(() => null));
        if (!c) { toast(t("No pude bajar {id}", { id: s.id })); return; }
        abrirAnalisis({ nombre: s.nombre, tipo: s.tipo, soloVer: true, step: s.step || null, motores: s.step?.motores_mm || null,
          cuerpos: [{ nombre: s.step?.elegidos?.length ? s.step.elegidos.join(", ").slice(0, 80) : s.nombre, tri: c.tri, ...(s.step?.volumen_cm3 ? { volumen_cm3: s.step.volumen_cm3 } : {}) }] });
      });
      if (s.tipo === "chasis" || s.tipo === "canopy") acts.insertAdjacentHTML("beforeend", `<span class='muted' style='font-size:12.5px;align-self:center'>${t("Se imprime en el banco (paso Imprimir).")}</span>`);
      btn(t("Borrar"), async () => {
        if (!(await confirmar(t("¿Borrar \"{nombre}\"? (va a la papelera: stl/_papelera/)", { nombre: s.nombre }), { si: t("Borrar"), peligro: true }))) return;
        const r = await ctx.api("/api/stl_borrar", { id: s.id });
        if (!r.ok) { toast(r.msg); return; }
        G.stl = G.stl.filter((x) => x.id !== s.id);
        renderSTL();
      });
      box.appendChild(row);
    }
  }

  $("b-stl").onclick = () => $("stl-file").click();
  /** Un STL o un STEP -> «Analizar» (elegir piezas, ver medidas, peso, impresora) -> se guarda como STL (+ lo del STEP). */
  $("stl-file").onchange = async (e) => {
    const f = e.target.files[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > 25 * 1024 * 1024) { toast(t("Ese archivo pesa más de 25 MB: simplifícalo (menos triángulos) en tu programa 3D.")); return; }
    const buf = await f.arrayBuffer(), nombre = f.name.replace(/\.(stl|step|stp)$/i, "");
    let cuerpos, step = null;
    try {
      if (esSTEP(buf)) {
        toast(t("Leyendo el STEP con OpenCascade…"), 8000);
        const r = await leerSTEP(buf);
        cuerpos = r.cuerpos;
        step = { unidad: r.unidad, esquema: r.esquema, sistema: r.sistema };
        toast(t("STEP leído: {n} pieza(s).", { n: cuerpos.length }), 2000);
      } else cuerpos = [{ nombre, tri: leerSTL(buf) }];
    } catch (err) { toast(String(err.message || err), 6000); return; }
    const res = await abrirAnalisis({ nombre, tipo: $("stl-tipo").value, cuerpos, step });
    if (!res) return;
    const { tipo, inf } = res;
    const stl = step ? stlBinario(juntar(res.cuerpos), nombre) : buf;
    if (stl.byteLength > 25 * 1024 * 1024) { toast(t("Como STL pesa más de 25 MB: elige menos piezas.")); return; }
    const meta = step ? {
      archivo: f.name, unidad: step.unidad, esquema: step.esquema, sistema: step.sistema || undefined, eje: res.eje,
      cuerpos: cuerpos.slice(0, 60).map((c) => ({ nombre: c.nombre.slice(0, 60), volumen_cm3: Math.round(c.volumen_cm3 * 100) / 100 })),
      elegidos: res.cuerpos.slice(0, 60).map((c) => c.nombre.slice(0, 60)), volumen_cm3: inf.volumen_cm3, tam_mm: inf.tam_mm, camas: inf.camas,
      ...(tipo === "chasis" && inf.motores_de === "agujeros" ? { motores_mm: inf.motores_mm, ejes_mm: inf.ejes_mm } : {}),
    } : null;
    const q = `nombre=${encodeURIComponent(nombre)}&tipo=${tipo}` + (meta ? `&step=${encodeURIComponent(JSON.stringify(meta))}` : "");
    const r = await fetch(`/api/stl?${q}`, { method: "POST", body: stl }).then((x) => x.json()).catch(() => ({ ok: false, msg: t("No hay servidor.") }));
    if (!r.ok) { toast(r.msg || t("No pude guardar el STL.")); return; }
    const item = { id: r.id, nombre, tipo, bytes: stl.byteLength, url: r.url, ...(meta ? { step: meta } : {}) };
    G.stl.push(item);
    const { meta: m } = await cargarSTL(item);
    const d = ctx.D();
    if ((tipo === "controladora" || tipo === "camara") && d) { d.visuales = { ...(d.visuales || {}), [tipo]: r.id }; guardar(); ctx.verDron(); }
    toast(t("Importado \"{nombre}\": {tam} mm, ~{g} g impreso.", { nombre: esc(nombre), tam: m.tam_mm.join(" × "), g: m.masa_g }) + (tipo === "chasis" || tipo === "canopy" ? " " + t("Imprímelo en el banco.") : ""), 5000);
    renderSTL();
  };
  $("b-inv-cerrar").onclick = () => { modal("inventario", false); ctx.renderTaller(); };

  return { abrirTienda, abrirInventario, abrirEstante };
}
