// =====================================================================
// DRON MAKER — el juego. Inicio -> el HANGAR (tus drones: cada uno con sus piezas, su propósito y su
// propia IA) -> la TIENDA (pides piezas, las que quieras) -> el BANCO DE ARMADO (imprimir, armar, cablear,
// flashear, probar) -> pedidos -> volar y grabar -> cobrar -> mejores piezas.
// La IA de cada dron vive en models/drones/<nombre>/ (la "base" es models/modelo.zip). Datos en app/data/.
// Módulos: tienda.js (tienda + inventario + STL), ui_banco.js (el banco), banco.js (lógica del banco).
// =====================================================================
import * as THREE from "three";
import { Policy } from "../game/sim.js";
import { DEFAULT_CTL, readGamepad } from "../game/pilot.js";
import { calcular, pieza, rangoModelo, paramsFisica, DRONES_EJEMPLO, EXTRAS_EJEMPLO } from "./parts.js";
import * as PT from "./partida.js";
import * as BA from "./banco.js";
import { Garaje } from "./garaje.js";
import { Vuelo, TOMA_OK } from "./vuelo.js";
import { mundoLugar, alcanceNecesario } from "./lugares.js";
import { cargarSTL } from "./stl.js";
import { initTienda } from "./tienda.js";
import { initBanco } from "./ui_banco.js";
import { initEstudio } from "./estudio.js";

const $ = (id) => document.getElementById(id);
const fmt = (x, d = 1) => x.toFixed(d).replace(".", ",");
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const store = {
  get(k, d) { try { const v = localStorage.getItem("dronmaker." + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("dronmaker." + k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } },
};

const [cat, mis, ent] = await Promise.all(["piezas", "misiones", "entrenamiento"].map((f) => fetch(`./data/${f}.json`).then((r) => r.json())));
const G = {
  screen: "inicio", partida: PT.cargar(), quality: store.get("quality", "media"),
  ctl: { ...DEFAULT_CTL, ...store.get("ctl", {}) }, vuelo: null, hover: null, izq: "hangar",
  videos: [], last: null, keys: new Set(), modelos: [], ias: {}, stl: [],
};

// ---------------- Three.js ----------------
const canvas = $("c");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.localClippingEnabled = true;                 // la impresora 3D imprime capa por capa
let garaje = new Garaje(G.quality);

function applyQuality() {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, { alta: 2, media: 1.5, baja: 1 }[G.quality]));
  resize();
}
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  garaje.resize(innerWidth, innerHeight);
}
addEventListener("resize", resize);

let toastT = 0;
function toast(msg, ms = 2600) {
  const t = $("toast");
  t.innerHTML = msg;
  t.style.opacity = 1;
  clearTimeout(toastT);
  toastT = setTimeout(() => (t.style.opacity = 0), ms);
}

async function api(path, body) {
  try {
    const r = await fetch(path, body ? { method: "POST", body: typeof body === "string" || body instanceof ArrayBuffer ? body : JSON.stringify(body) } : { cache: "no-store" });
    return await r.json();
  } catch { return { ok: false, msg: "No hay servidor: abre el juego con python scripts/jugar.py" }; }
}

// ---------------- la partida y el dron elegido ----------------
const P = () => G.partida;
const D = () => (G.partida ? PT.dronActivo(G.partida) : null);
const U = (uid) => PT.unidad(G.partida, uid);
function guardar() { PT.guardar(G.partida); }
/** El estado del banco del dron (pasos, listo para volar…). */
const estadoDe = (d) => BA.estado(cat, d, PT.build(G.partida, d), U, { impresora: PT.tieneHerramienta(G.partida, "impresora") });

/** Lo que se ve del dron en 3D: sus piezas, lo no instalado como fantasma, los cables si ya pasó la prueba de humo. */
function dronVista(d = D()) {
  if (!d) return {};
  const b = PT.build(G.partida, d), B = d.banco || {}, inst = B.instalado || {};
  const fantasma = [];
  for (const s of ["chasis", "motores", "esc", "controladora", "radio", "camara", "bateria"]) if (d.slots[s] && inst[s] !== d.slots[s]) fantasma.push(s);
  if (d.extras.some((u) => !(inst.extras || []).includes(u))) fantasma.push("extras");
  const e = estadoDe(d);
  return { ...b, fantasma, cables: e.pasos.find((x) => x.k === "humo")?.ok, sinHelices: !(B.helices && inst.helices === d.slots.helices) };
}
function verDron(changed = null) { garaje.setBuild(dronVista(), cat, changed); }

// ---------------- las IA (una por dron) ----------------
const urlModelo = (slug) => (slug === "base" ? "../models/modelo_web.json" : `../models/drones/${slug}/modelo_web.json`);
async function loadModel(slug) {
  if (!slug) return null;
  try {
    const r = await fetch(urlModelo(slug), { cache: "no-store" });
    if (!r.ok) throw new Error(r.status);
    const json = await r.json();
    G.ias[slug] = { policy: new Policy(json), meta: json.meta || {} };
  } catch { G.ias[slug] = null; }
  return G.ias[slug];
}
async function loadModelos() {
  const r = await api("/api/modelos");
  G.modelos = r.modelos || [];
  const base = G.modelos.find((m) => m.slug === "base");
  $("modelo-ini").innerHTML = base?.tiene_modelo !== false && base
    ? `IA base: generación ${base.gen ?? "?"}${G.modelos.length > 1 ? ` · ${G.modelos.length - 1} IA de drones` : ""}` : "IA: no encontré el modelo (abre el juego con python scripts/jugar.py).";
}
const infoModelo = (slug) => G.modelos.find((m) => m.slug === slug) || null;
const sabeGrabar = (ia, tipos = ["fija", "orbita", "revelar"]) => !!(ia?.policy && ia.policy.layers[0].nin >= 38 && tipos.every((t) => (ia.meta?.tomas || []).includes(t)));

// ---------------- pantallas ----------------
const PANELS = { inicio: ["inicio"], taller: ["taller-izq", "taller-der", "taller-top"], banco: ["banco-izq", "banco-der"], vuelo: ["hud"], estudio: ["estudio"] };
const MODALES = ["tablero", "brief", "videos", "controles", "pausa", "resultado", "lab", "historia", "tienda", "inventario", "nuevo-dron", "cableado"];
function show(screen) {
  G.screen = screen;
  for (const ids of Object.values(PANELS)) ids.forEach((id) => $(id).classList.add("hidden"));
  (PANELS[screen] || []).forEach((id) => $(id).classList.remove("hidden"));
  for (const id of MODALES) $(id).classList.add("hidden");
  if (screen !== "taller") labPoll(false);
  garaje.view = screen === "inicio" ? "menu" : screen === "banco" ? "banco" : "taller";
  if (screen !== "banco") garaje.conectarUSB(false);
  if (screen !== "vuelo") document.exitPointerLock?.();
}
const modal = (id, on = true) => $(id).classList.toggle("hidden", !on);

// ---------------- inicio ----------------
function renderInicio() {
  const p = P();
  $("b-continuar").classList.toggle("hidden", !p);
  $("b-nueva").className = p ? "btn ghost" : "btn main";
  const si = $("save-info");
  si.classList.toggle("hidden", !p);
  if (p) {
    si.innerHTML = (p.modo === "dev" ? `<b style="color:var(--next)">Modo desarrollador</b> · ` : "") + `Tu partida: <span class="money">$${p.plata}</span> · reputación ${p.rep} · ${Object.keys(p.hechos).length} pedidos hechos<br>` +
      `<span class="muted">${p.drones.length ? `${p.drones.length} ${p.drones.length === 1 ? "dron" : "drones"} en el hangar: ${p.drones.map((d) => esc(d.nombre)).join(", ")}` : "Todavía sin drones"}</span>`;
  }
  document.querySelectorAll("#quality button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.q === G.quality)));
}
$("b-continuar").onclick = () => irTaller();
const modoNuevo = (on) => { $("modo-nuevo").classList.toggle("hidden", !on); document.querySelector("#inicio .col").classList.toggle("hidden", on); };
$("b-nueva").onclick = () => modoNuevo(true);
$("b-modo-volver").onclick = () => modoNuevo(false);
$("b-modo-dev").onclick = () => {
  if (G.partida && !confirm("¿Empezar de cero en modo desarrollador? Se borra la partida guardada (tus IA entrenadas no se borran).")) return;
  modoNuevo(false);
  G.partida = PT.nuevaPartidaDev(cat, { "Madera (dev)": DRONES_EJEMPLO.madera, "Cine (dev)": DRONES_EJEMPLO.cine }, { "Cine (dev)": EXTRAS_EJEMPLO.cine });
  guardar();
  irTaller();
  historia("Modo desarrollador", `Aquí no se trata de juntar plata: <b>creas la IA</b>. Tienes todo desbloqueado y dos drones listos en el hangar.<br><br>` +
    `Abre el <b>Estudio PBDMM</b> (arriba): escribes con un lenguaje con cara de Python <i>cómo</i> se entrena un modelo —qué misión, qué premios, qué tan grande es su cerebro y qué hacer mientras aprende— y lo corres. ` +
    `Entrena en segundo plano o en <b>Blender</b>, y después lo pruebas en un pedido con <code>volar &lt;modelo&gt;</code>.<br><br>Empieza por la pestaña <b>Aprende</b> y el ejemplo <b>hover</b>.`);
};
$("b-modo-normal").onclick = () => {
  if (G.partida && !confirm("¿Empezar de cero? Se borra la partida guardada (tus IA entrenadas no se borran).")) return;
  modoNuevo(false);
  G.partida = PT.nuevaPartida();
  guardar();
  irTaller();
  const c1 = mis.capitulos[0];
  historia(`Capítulo 1 · ${c1.titulo}`, `${c1.historia}<br><br>Tienes <b class="money">$${PT.PLATA_INICIAL}</b>. Compra las piezas en la <b>Tienda</b> (o el <b>Kit del garaje</b>), arma tu primer dron en el <b>banco</b> y mira los <b>pedidos</b>: Doña Marta necesita un video de su casa.`);
};
function irTaller() { show("taller"); G.izq = "hangar"; verDron(); renderTaller(); }

/** Una pantalla de historia (inicio de capítulo). */
function historia(titulo, html) {
  $("hist-h").textContent = titulo;
  $("hist-p").innerHTML = html;
  modal("historia");
}
$("b-hist").onclick = () => modal("historia", false);
document.querySelectorAll("#quality button").forEach((b) => (b.onclick = () => {
  G.quality = b.dataset.q;
  store.set("quality", G.quality);
  garaje = new Garaje(G.quality);
  verDron();
  applyQuality();
  renderInicio();
}));

// ---------------- el hangar y el editor de cada dron ----------------
function descr(ranura, pz) {
  switch (ranura) {
    case "chasis": return `${pz.masa_g} g · hélices hasta ${pz.helice_max}" · aguanta ${fmt(pz.aguante_ms)} m/s · ${pz.desc || ""}`;
    case "motores": return `${pz.empuje_g * 4} g de empuje (4 motores, ${pz.celdas[1]}S, ${pz.helice_ref}") · ${pz.celdas[0]}-${pz.celdas[1]}S · ${pz.masa_g * 4} g`;
    case "helices": return `${pz.masa_g} g el juego · ${pz.desc || ""}`;
    case "baterias": return `${pz.celdas}S ${pz.mah} mAh · ${pz.masa_g} g${pz.desc ? " · " + pz.desc : ""}`;
    case "controladoras": return pz.desc || "";
    case "camaras": return `calidad ${pz.calidad}${pz.gimbal ? ` · gimbal ${pz.gimbal_ejes || 3} ejes` : ""} · ${pz.masa_g} g${pz.desc ? " · " + pz.desc : ""}`;
    case "escs": return `${pz.corriente_a} A por motor${pz.filtro_rpm ? " · filtro RPM" : ""} · ${pz.desc || ""}`;
    case "radios": return `alcance ${pz.alcance_m >= 1000 ? fmt(pz.alcance_m / 1000) + " km" : pz.alcance_m + " m"} · ${pz.desc || ""}`;
    case "montajes": return pz.desc || "";
    case "extras": return `${pz.masa_g} g · ${pz.desc || ""}`;
    case "herramientas": return pz.desc || "";
    default: return "";
  }
}

function renderTaller() {
  const p = P();
  $("empresa").textContent = p.empresa || "El garaje";
  $("plata").textContent = `$${p.plata}`;
  $("rep").textContent = p.rep;
  $("etapa").textContent = p.modo === "dev" ? "Desarrollador" : `Etapa ${PT.etapa(p)}`;
  $("b-estudio").classList.toggle("hidden", p.modo !== "dev");
  if (G.izq === "dron" && D()) renderEditor(); else renderHangar();
  renderStats();
}

/** Chips de estado de un dron: listo / qué le falta en el banco / su IA. */
function chipsDron(d) {
  const e = estadoDe(d), arm = PT.dronArmado(P(), cat, d);
  const out = [];
  if (!arm) out.push(`<span class="chip bad">Le faltan piezas</span>`);
  else if (!arm.stats.ok) out.push(`<span class="chip bad">${esc(arm.stats.errores[0])}</span>`);
  else if (PT.rotas(P(), d).length) out.push(`<span class="chip bad">Piezas rotas</span>`);
  else if (e.listo) out.push(`<span class="chip on">Listo para volar</span>`);
  else out.push(`<span class="chip warn">Banco: ${e.pasos.find((x) => !x.ok)?.nombre.toLowerCase()}</span>`);
  const m = d.modelo && infoModelo(d.modelo);
  out.push(d.modelo ? `<span class="chip ai">IA "${esc(d.modelo)}"${m?.gen ? ` · gen ${m.gen}` : " · sin entrenar"}${m?.entrenando ? " · entrenando" : ""}</span>` : `<span class="chip">Sin IA</span>`);
  return out.join("");
}

function renderHangar() {
  const p = P(), box = $("ranuras");
  box.innerHTML = `<div class="ranura"><h3>Tu hangar · ${p.drones.length} ${p.drones.length === 1 ? "dron" : "drones"}</h3></div>`;
  for (const d of p.drones) {
    const arm = PT.dronArmado(p, cat, d), b = PT.build(p, d);
    const b_ = document.createElement("button");
    b_.className = "dcard" + (d.id === p.activo ? " on" : "");
    b_.innerHTML = `<b>${esc(d.nombre)}</b><span class="muted" style="font-size:13px">${arm?.stats.ok ? `${arm.stats.masa_g} g · ${fmt(arm.stats.twr, 2)}` : ""}</span>` +
      `<small>${esc(d.proposito || "")}${d.proposito ? " · " : ""}${b.chasis ? pieza(cat, "chasis", b.chasis).nombre : "sin chasis"}${b.controladora ? " · " + pieza(cat, "controladoras", b.controladora).nombre : ""}</small><div class="chips">${chipsDron(d)}</div>`;
    b_.onclick = () => { if (p.activo === d.id) { G.izq = "dron"; } p.activo = d.id; guardar(); verDron(); renderTaller(); };
    b_.ondblclick = () => { p.activo = d.id; G.izq = "dron"; renderTaller(); };
    box.appendChild(b_);
  }
  if (!p.drones.length) box.insertAdjacentHTML("beforeend", `<p class="muted" style="margin:8px 6px;font-size:14px;line-height:1.5">Todavía no tienes drones. Crea uno y elige sus piezas, o arma el <b>Kit del garaje</b> (el dron de madera de siempre).</p>`);
  const pie = $("taller-pie");
  pie.innerHTML = "";
  const btn = (txt, cls, fn) => { const b = document.createElement("button"); b.className = "btn " + cls; b.textContent = txt; b.onclick = fn; pie.appendChild(b); return b; };
  if (D()) btn(`Abrir "${D().nombre}"`, "main", () => { G.izq = "dron"; renderTaller(); });
  btn("+ Nuevo dron", "ghost small", () => { $("nd-nombre").value = `Dron ${p.drones.length + 1}`; $("nd-prop").value = ""; modal("nuevo-dron"); $("nd-nombre").focus(); });
  const kitCost = kitCosto();
  btn(`Kit del garaje ($${kitCost})`, "ghost small", armarKit).title = "Compra lo que falte del dron de madera y lo pone en un dron nuevo";
}
$("b-nd-cerrar").onclick = () => modal("nuevo-dron", false);
$("b-nd-crear").onclick = () => {
  const d = PT.nuevoDron(P(), $("nd-nombre").value.trim() || undefined, $("nd-prop").value.trim());
  for (const [slot, id] of [["montaje", "mt_tornillos"], ["radio", "rx_espnow"]]) {      // lo gratis ya viene puesto
    if (!PT.libres(P(), id).length) PT.comprar(P(), cat, PT.RANURA[slot], id, 1);
    PT.instalar(P(), d, slot, id);
  }
  guardar();
  modal("nuevo-dron", false);
  G.izq = "dron";
  verDron();
  renderTaller();
  toast(`"${esc(d.nombre)}" está en el hangar: elige sus piezas (si no las tienes, cómpralas en la Tienda).`, 4000);
};

const kitCosto = () => Object.entries(DRONES_EJEMPLO.madera).reduce((s, [slot, id]) => s + (PT.libres(P(), id).length ? 0 : pieza(cat, PT.RANURA[slot], id)?.precio || 0), 0);
function armarKit() {
  const p = P(), faltan = Object.entries(DRONES_EJEMPLO.madera).filter(([, id]) => !PT.libres(p, id).length).map(([slot, id]) => ({ ranura: PT.RANURA[slot], id, n: 1 }));
  const err = PT.comprarCarrito(p, cat, faltan);
  if (err) { toast(err); return; }
  const d = PT.nuevoDron(p, "Madera", "El primer dron: videos de casas");
  d.estilo = { ...PT.ESTILO };
  for (const [slot, id] of Object.entries(DRONES_EJEMPLO.madera)) PT.instalar(p, d, slot, id);
  guardar();
  G.izq = "dron";
  verDron("chasis");
  renderTaller();
  if (faltan.length) garaje.paquete();
  toast("Llegó el kit: un dron de madera con motores reciclados. Ahora ármalo en el <b>banco</b>.", 4500);
}

function renderEditor() {
  const p = P(), d = D(), et = PT.etapa(p), box = $("ranuras");
  box.innerHTML = "";
  const head = document.createElement("div");
  head.innerHTML = `<button class="back">← Hangar</button><input class="nombre-in" maxlength="30" aria-label="Nombre del dron" value="${esc(d.nombre)}"><input class="prop-in" maxlength="60" aria-label="Para qué es" placeholder="¿Para qué es este dron?" value="${esc(d.proposito || "")}"><div class="chips" style="margin:6px 0 2px">${chipsDron(d)}</div>`;
  head.querySelector(".back").onclick = () => { G.izq = "hangar"; renderTaller(); };
  head.querySelector(".nombre-in").onchange = (e) => { d.nombre = e.target.value.trim() || d.nombre; guardar(); };
  head.querySelector(".prop-in").onchange = (e) => { d.proposito = e.target.value.trim(); guardar(); };
  box.appendChild(head);
  for (const [slot, ranura, nombre] of PT.RANURAS) {
    const sec = document.createElement("div");
    sec.className = "ranura";
    sec.innerHTML = `<h3>${nombre}</h3>`;
    const puesta = U(d.slots[slot]);
    for (const pz of cat[ranura]) {
      if (pz.etapa > et + 1) continue;
      const libres = PT.libres(p, pz.id).length, es = puesta?.id === pz.id, bloq = pz.etapa > et;
      if (!es && !libres && !PT.tiene(p, pz.id) && pz.precio > 0 && bloq) continue;
      const b = document.createElement("button");
      b.className = "op" + (es ? " puesta" : "") + (bloq ? " bloq" : "");
      const precio = PT.precioDe(p, pz);
      const tag = es ? "<span class='tag ok'>Puesta</span>" : libres ? `<span class='tag'>Usar <span class="muted">(${libres} libre${libres > 1 ? "s" : ""})</span></span>`
        : bloq ? `<span class='tag muted'>rep. ${PT.REP_ETAPA[pz.etapa]}</span>` : `<span class='tag money'>${precio ? "comprar $" + precio : "gratis"}</span>`;
      b.innerHTML = `<b>${pz.nombre}</b>${tag}<small>${descr(ranura, pz)}${es && puesta.vida < 100 ? ` · <span class="vida">${puesta.vida} % de vida</span>` : ""}</small>`;
      b.onmouseenter = () => { G.hover = { slot, id: pz.id }; renderStats(); };
      b.onmouseleave = () => { G.hover = null; renderStats(); };
      b.onclick = () => {
        if (bloq) { toast(`Se desbloquea con ${PT.REP_ETAPA[pz.etapa]} de reputación.`); return; }
        if (es) return;
        if (!libres) {                                        // atajo: comprar una y ponerla
          const err = PT.comprar(p, cat, ranura, pz.id, 1);
          if (err) { toast(err); return; }
          toast(`Compraste: ${pz.nombre} (−$${precio})`);
          garaje.paquete();
        }
        const err = PT.instalar(p, d, slot, pz.id);
        if (err) { toast(err); return; }
        guardar();
        verDron(slot);
        renderTaller();
      };
      sec.appendChild(b);
    }
    box.appendChild(sec);
  }
  const sec = document.createElement("div");
  sec.className = "ranura";
  sec.innerHTML = "<h3>Extras (se pueden poner varios)</h3>";
  for (const pz of cat.extras) {
    if (pz.etapa > et + 1) continue;
    const puesto = d.extras.some((u) => U(u)?.id === pz.id), libres = PT.libres(p, pz.id).length, bloq = pz.etapa > et;
    const b = document.createElement("button");
    b.className = "op" + (puesto ? " puesta" : "") + (bloq ? " bloq" : "");
    b.innerHTML = `<b>${pz.nombre}</b>${puesto ? "<span class='tag ok'>Puesto</span>" : libres ? `<span class='tag'>Poner (${libres})</span>` : bloq ? `<span class='tag muted'>rep. ${PT.REP_ETAPA[pz.etapa]}</span>` : `<span class='tag money'>comprar $${pz.precio}</span>`}<small>${descr("extras", pz)}</small>`;
    b.onclick = () => {
      if (bloq) { toast(`Se desbloquea con ${PT.REP_ETAPA[pz.etapa]} de reputación.`); return; }
      if (!puesto && !libres) { const err = PT.comprar(p, cat, "extras", pz.id, 1); if (err) { toast(err); return; } toast(`Compraste: ${pz.nombre} (−$${pz.precio})`); }
      const err = PT.alternarExtra(p, d, pz.id);
      if (err) { toast(err); return; }
      guardar(); verDron("extras"); renderTaller();
    };
    sec.appendChild(b);
  }
  box.appendChild(sec);
  // pintura (la forma y tu STL se eligen al imprimir, en el banco)
  const ps = document.createElement("div");
  ps.className = "ranura";
  ps.innerHTML = "<h3>Pintura</h3>";
  const est = d.estilo || (d.estilo = { ...PT.ESTILO });
  for (const [titulo, key] of [["Chasis", "color"], ["Detalles", "acento"]]) {
    const r = document.createElement("div");
    r.className = "colores";
    r.innerHTML = `<span>${titulo}</span>`;
    for (const c of cat.estilo.colores) {
      const b = document.createElement("button");
      b.className = "color" + (est[key] === c ? " on" : "");
      b.style.background = c; b.title = c; b.setAttribute("aria-label", `${titulo}: ${c}`);
      b.onclick = () => { est[key] = c; guardar(); verDron(); renderTaller(); };
      r.appendChild(b);
    }
    ps.appendChild(r);
  }
  ps.insertAdjacentHTML("beforeend", "<small class='muted' style='display:block;margin:4px 6px;line-height:1.4'>La forma del chasis (o tu propio STL) y la carcasa se eligen en el <b>banco</b>, al imprimir.</small>");
  box.appendChild(ps);
  // pie del editor
  const pie = $("taller-pie");
  pie.innerHTML = "";
  const btn = (txt, cls, fn) => { const b = document.createElement("button"); b.className = "btn " + cls; b.innerHTML = txt; b.onclick = fn; pie.appendChild(b); return b; };
  const e = estadoDe(d);
  btn(e.listo ? "Banco de armado ✓" : "Banco de armado", "main", () => abrirBanco());
  btn("Vuelo de prueba", "ghost small", () => startVuelo(null, "yo"));
  btn("Entrenar su IA", "ai small", () => { LAB.drone = d.id; abrirLab(); });
  const rep = PT.costoReparar(p, cat, d);
  if (rep > 0) btn(rep > p.plata && PT.rotas(p, d).length ? "Arreglo casero (gratis)" : `Reparar ($${rep})`, "ghost small", () => repararDron(d));
  btn("Desarmar", "ghost small", () => {
    if (!confirm(`¿Desarmar "${d.nombre}"? Sus piezas vuelven al estante (su IA no se borra).`)) return;
    PT.borrarDron(p, d.id); guardar(); G.izq = "hangar"; verDron(); renderTaller();
  });
}

function repararDron(d) {
  const p = P();
  if (PT.costoReparar(p, cat, d) > p.plata && PT.rotas(p, d).length) {
    PT.arregloCasero(p, d); guardar();
    toast("No te alcanza para repuestos: lo arreglaste con cinta y pegamento (las piezas rotas quedan al 40 %).", 5000);
  } else {
    const err = PT.reparar(p, cat, d);
    if (err) { toast(err); return; }
    guardar(); toast("Dron reparado: como nuevo.");
  }
  renderTaller();
}

const STATS = [
  ["Peso", (s) => s.masa_g, (v) => `${v} g`, 1200, true],
  ["Empuje/peso", (s) => s.twr, (v) => fmt(v, 2), 8, false],
  ["Vuelo", (s) => s.minutos, (v) => `${fmt(v)} min`, 12, false],
  ["Vel. máxima", (s) => s.velMax * 3.6, (v) => `${Math.round(v)} km/h`, 60, false],
  ["Agilidad", (s) => s.attResp, (v) => fmt(v), 12, false],
  ["Cámara", (s) => s.calidad, (v) => `${v} / 100`, 100, false],
  ["Nitidez", (s) => s.nitidez * 100, (v) => `${Math.round(v)} %`, 100, false],
  ["Alcance radio", (s) => Math.min(s.alcance_m, 2000), (v) => (v >= 1000 ? `${fmt(v / 1000)} km` : `${Math.round(v)} m`), 100, false],
];

function renderStats() {
  const p = P(), d = D(), el = $("stats");
  if (!d) { $("dron-nombre").textContent = "Sin drones"; el.innerHTML = "<p class='muted' style='margin:0'>Crea un dron en el hangar.</p>"; $("errores").textContent = ""; return; }
  const b = PT.build(p, d);
  const prev = G.hover ? { ...b, [G.hover.slot]: G.hover.id } : null;
  const full = (x) => PT.RANURAS.every(([slot]) => x[slot]);
  const st = full(b) ? calcular(b, cat) : null;
  const sp = prev && full(prev) ? calcular(prev, cat) : null;
  if (!st && !sp) {
    const falta = PT.RANURAS.filter(([slot]) => !b[slot]).map((r) => r[2].toLowerCase());
    el.innerHTML = `<p class="muted" style="margin:0;font-size:14.5px;line-height:1.45">Le falta: ${falta.join(", ")}.<br>Pasa el ratón por una pieza para ver cómo quedaría.</p>`;
    $("errores").textContent = "";
    $("dron-nombre").textContent = `${d.nombre} (sin armar)`;
    return;
  }
  const show_ = sp || st;
  $("dron-nombre").textContent = sp ? "Así quedaría" : d.nombre;
  el.innerHTML = STATS.map(([name, get, f, max, lowerBetter]) => {
    const v = show_.masa_g ? get(show_) : 0, v0 = st?.masa_g ? get(st) : null;
    const dd_ = sp && v0 !== null ? v - v0 : 0;
    const better = lowerBetter ? dd_ < 0 : dd_ > 0;
    const dd = sp && v0 !== null && Math.abs(dd_) > 1e-6 ? `<span class="d ${better ? "ok" : "bad"}">${dd_ > 0 ? "▲" : "▼"}</span>` : "";
    return `<div class="stat"><span>${name}</span><span class="bar"><i ${sp ? "class='prev'" : ""} style="width:${Math.min(100, (v / max) * 100)}%"></i></span><output>${dd} ${f(v)}</output></div>`;
  }).join("") + `<div class="stat"><span>Costo</span><span></span><output class="money">$${show_.precio ?? 0}</output></div>`;
  const ay = new Set(show_.ayudas || []);
  el.innerHTML += `<div class="ayudas"><span class="chip ${ay.has("altura") ? "on" : ""}">Mantener altura</span><span class="chip ${ay.has("frenar") ? "on" : ""}">Frenar solo</span><span class="chip ${ay.has("ia") ? "on" : ""}">Chip de IA</span>${show_.gimbal ? "<span class='chip on'>Gimbal</span>" : ""}</div>`;
  const errs = [...(show_.errores || [])];
  if (show_.escCorto) errs.push("El ESC da menos corriente que la que piden los motores: el empuje se queda corto.");
  if (!sp && st && PT.rotas(p, d).length) errs.push("Tiene piezas rotas: repáralo antes de volar.");
  if (!sp && st?.ok && st.twr < 1.6) errs.push(`Empuje/peso ${fmt(st.twr, 2)}: vuela, pero muy justo (lento para subir y frenar). Más empuje: otros motores, hélices más grandes o menos peso.`);
  $("errores").textContent = errs.join(" ");
}

const REP_FALLA_IA = 2;     // la IA no entregó el video (faltaron tomas, se estrelló, batería): el cliente se queja

function puedeVolar(d = D(), ia = false) {
  const p = P(), a = PT.dronArmado(p, cat, d);
  if (!a) return "Primero arma el dron: una pieza de cada ranura.";
  if (!a.stats.ok) return a.stats.errores.join(" ");
  if (PT.rotas(p, d).length) return "Tiene piezas rotas: repáralo antes de volar.";
  const e = estadoDe(d);
  if (!e.listo) return `Termínalo en el banco de armado: falta "${e.pasos.find((x) => !x.ok).nombre}". ${e.pasos.find((x) => !x.ok).nota}`;
  return null;            // la IA vuela siempre (la que tenga, o la base): si lo hace mal, el cliente se queja
}
/** Con qué IA vuela el dron: la suya si tiene un modelo guardado, si no la base. */
function slugIA(d) { return d?.modelo && G.ias[d.modelo] ? d.modelo : "base"; }
/** Antes de que vuele la IA: se carga sola en el dron (la última versión), como si la bajaras del portátil. */
function cargarIAenDron(d) {
  const slug = slugIA(d), I = G.ias[slug], gen = I?.meta?.generaciones;
  if (!I) return;
  const B = d.banco || (d.banco = {});
  if (B.ia?.modelo !== slug || (gen !== undefined && B.ia.gen !== gen)) { B.ia = { modelo: slug, gen }; guardar(); toast(`Cargué la IA "${slug}" (generación ${gen ?? "?"}) en ${d.nombre}.`, 3000); }
}

// ---------------- el banco ----------------
const ctx = { G, cat, PT, BA, $, fmt, esc, toast, descr, api, guardar, modal, show, D, U, estadoDe, dronVista, verDron, get garaje() { return garaje; },
  renderTaller, irTaller, infoModelo, loadModelos, abrirLab: () => abrirLab(), canvas };
const banco = initBanco(ctx);
ctx.ent = ent; ctx.P = () => P(); ctx.dronParaEntrenar = (d) => dronParaEntrenar(d);
const estudio = initEstudio(ctx);
$("b-estudio").onclick = () => estudio.abrir();
const tienda = initTienda(ctx);
function abrirBanco() { if (!D()) return; show("banco"); verDron(); banco.abrir(); }
ctx.abrirBanco = abrirBanco;
$("b-tienda").onclick = () => tienda.abrirTienda();
$("b-inventario").onclick = () => tienda.abrirInventario();

$("b-menu").onclick = () => { show("inicio"); renderInicio(); };
$("b-pedidos").onclick = () => { renderTablero(); modal("tablero"); };
$("b-cerrar-tablero").onclick = () => modal("tablero", false);
$("b-videos").onclick = () => { renderVideos(); modal("videos"); };
$("b-cerrar-videos").onclick = () => modal("videos", false);

// ---------------- pedidos ----------------
/** Un pedido se puede jugar si tiene lugar y tomas (los demás son el plan: docs/HISTORIA.md). */
const jugable = (pe) => !!(pe.lugar && pe.tomas);
const ESTRELLITAS = (n) => `${"★".repeat(n)}${"☆".repeat(3 - n)}`;

function renderTablero() {
  const p = P(), et = PT.etapa(p), list = $("lista-pedidos");
  list.innerHTML = "";
  for (const cap of mis.capitulos) {
    const abierto = p.rep >= (cap.rep || 0);
    const peds = mis.pedidos.filter((pe) => pe.capitulo === cap.n);
    const h = document.createElement("div");
    h.className = "capitulo" + (abierto ? "" : " cerrado");
    h.innerHTML = `<div class="cap-h"><b>Capítulo ${cap.n} · ${cap.titulo}</b><span class="muted">${abierto ? cap.empresa : `se abre con reputación ${cap.rep}`}</span></div>` +
      (abierto ? `<p class="muted cap-p">${cap.historia}</p>` : "");
    list.appendChild(h);
    if (!abierto && cap.n > PT.etapa(p) + 1) continue;
    for (const pe of peds) {
      const ok = pe.etapa <= et && p.rep >= pe.rep_min, play = jugable(pe);
      const b = document.createElement("button");
      b.className = "pedido" + (ok && play ? "" : " bloq");
      const hecho = p.hechos[pe.id] !== undefined ? ` · hecho ${ESTRELLITAS(p.hechos[pe.id])}` : "";
      const why = !play ? `Próximamente · pide: ${pe.plan.piezas.join(", ")}` : !ok ? `Necesita ${pe.rep_min} de reputación`
        : `${pe.tomas.length} tomas: ${pe.tomas.map((t) => t.nombre.toLowerCase()).join(", ")}${hecho}`;
      b.innerHTML = `<b>${pe.titulo}</b><span class="pago money">$${pe.pago}</span><small>${pe.cliente} · ${why}</small>`;
      if (ok && play) b.onclick = () => { modal("tablero", false); openBrief(pe); };
      list.appendChild(b);
    }
  }
}

/** Lo que pide el pedido, con ✓ / ! / ✗ contra el dron. duro = el cliente no acepta sin eso. */
function requisitos(pe, st, shots, d) {
  const req = [], r = pe.requisitos || {};
  if (!st) return [["no", "Ese dron no está armado (le faltan piezas)", true]];
  const grabar = shots.reduce((a, t) => a + t.dur, 0);
  const need = ((grabar + 80) / 60) * (1 + 0.15 * (pe.viento ?? 0));
  if (r.calidad_min) req.push([st.calidad >= r.calidad_min ? "" : "no", `Cámara: calidad ${st.calidad} (el cliente pide ${r.calidad_min} o más)`, st.calidad < r.calidad_min]);
  if (r.protectores) req.push([st.ayudas.includes("protectores") ? "" : "no", st.ayudas.includes("protectores") ? "Protectores de hélice: hay gente cerca ✓" : "Protectores de hélice: hay gente cerca, el cliente no acepta sin ellos", !st.ayudas.includes("protectores")]);
  const alc = alcanceNecesario(shots);
  req.push([st.alcance_m >= alc ? "" : "no", `Radio: llega a ${st.alcance_m >= 1000 ? fmt(st.alcance_m / 1000) + " km" : st.alcance_m + " m"} (las tomas llegan a ${fmt(alc, 0)} m de la base${st.alcance_m >= alc ? "" : ": failsafe asegurado"})`, false]);
  if (r.twr_min) req.push([st.twr >= r.twr_min ? "" : "no", `Empuje/peso ${fmt(st.twr, 2)} (con este viento hace falta ${fmt(r.twr_min, 1)} o más)`, false]);
  req.push([st.minutos >= need ? "" : st.minutos >= need * 0.75 ? "meh" : "no", `Batería: ${fmt(st.minutos)} min flotando (tomas, ir entre ellas y volver: ~${fmt(need)} min)`, false]);
  const baro = st.ayudas.includes("altura");
  req.push([baro ? "" : r.barometro ? "no" : "meh", baro ? "Mantiene la altura solo (barómetro)" : "Sin barómetro: el gas es tuyo todo el tiempo (difícil)", false]);
  req.push([st.nitidez > 0.85 ? "" : "meh", `Nitidez ${Math.round(st.nitidez * 100)} %${st.nitidez > 0.85 ? "" : " (gomas antivibración, ESC con filtro RPM o un gimbal la suben)"}`, false]);
  if (PT.rotas(P(), d).length) req.push(["no", "Tiene piezas rotas", true]);
  const e = estadoDe(d);
  if (!e.listo) req.push(["no", `Sin terminar en el banco: ${e.pasos.find((x) => !x.ok).nombre.toLowerCase()}`, true]);
  const est = pe.estrellas || PT.ESTRELLAS;
  req.push(["", `Puntaje máximo con este dron: ${Math.round(75 * st.nitidez + 0.25 * st.calidad)} · este cliente da ★ ${est[0]}, ★★ ${est[1]}, ★★★ ${est[2]}`, false]);
  return req;
}

async function openBrief(pe) {
  G.pedido = pe;
  const p = P(), d = D();
  $("br-cliente").textContent = pe.cliente;
  $("br-titulo").textContent = pe.titulo;
  const M = mundoLugar(pe.lugar, pe), shots = M.shots;
  pe.viento = M.wind;
  // con qué dron: los del hangar
  const sel = p.drones.length > 1 ? `<div class="chips" style="margin:2px 0 10px">${p.drones.map((x) => `<button class="btn ${x.id === p.activo ? "main" : "ghost"} small" data-d="${x.id}">${esc(x.nombre)}${estadoDe(x).listo ? "" : " ·  sin terminar"}</button>`).join("")}</div>` : "";
  $("br-desc").innerHTML = sel + (pe.historia ? `<i class="muted">${pe.historia}</i><br>` : "") +
    `Quiere un video en <b>${shots.length} tomas</b>, en orden. Cada toma es una ruta (la línea celeste): ve al aro del inicio, ` +
    `ahí arranca a grabar sola y el punto blanco avanza; síguelo <b>pegado</b>, con el sujeto <b>al centro</b> del cuadro, a su ritmo y sin sacudidas. ` +
    `Una toma con menos de ${Math.round(TOMA_OK * 100)} % no sirve.${M.wind ? ` <b>Viento: ${fmt(M.wind)} m/s con ráfagas.</b>` : ""} Paga <span class="money">$${pe.pago}</span> con ★★, más con ★★★.` +
    `<ol style="margin:8px 0 0;padding-left:20px;line-height:1.5">${shots.map((t) => `<li><b>${t.nombre}</b> <span class="muted">(${({ fija: "fija", orbita: "órbita", revelar: "revelar" })[t.tipo]}, ${fmt(t.dur, 0)} s) · ${t.desc}</span></li>`).join("")}</ol>`;
  $("br-desc").querySelectorAll("[data-d]").forEach((b) => (b.onclick = () => { p.activo = b.dataset.d; guardar(); verDron(); openBrief(pe); }));
  const a = d && PT.dronArmado(p, cat, d), st = a?.stats;
  const req = requisitos(pe, st, shots, d);
  $("br-req").innerHTML = req.map(([c, t]) => `<li class="${c}">${t}</li>`).join("");
  const duro = req.filter((r) => r[2]);
  $("b-volar").disabled = $("b-volar-ia").disabled = duro.length > 0 || !st?.ok;
  const ia = $("br-ia"), tipos = [...new Set(shots.map((t) => t.tipo))];
  const entrenar = pe.entrenar ? `<br><b>Para que lo haga la IA:</b> ${pe.entrenar.nota}` : "";
  const mod = d?.modelo, I = mod ? (G.ias[mod] === undefined ? await loadModel(mod) : G.ias[mod]) : null;
  const castigo = ` <span class="muted">Si la IA no entrega el video (le faltan tomas o se estrella), pierdes ${REP_FALLA_IA} de reputación.</span>`;
  const IB = !I ? (G.ias.base === undefined ? await loadModel("base") : G.ias.base) : null;
  if (!I) ia.innerHTML = `<b>Que grabe la IA:</b> ${mod ? `la IA "${esc(mod)}" todavía no tiene un modelo guardado` : `"${esc(d?.nombre)}" todavía no tiene IA propia`}: ${IB ? `vuela con la <b>IA base</b> (generación ${IB.meta.generaciones ?? "?"}), que no está entrenada para este dron.` : "no encontré ni la IA base."}` + castigo + entrenar;
  if (!I && !IB) $("b-volar-ia").disabled = true;
  if (I) {
    const rango = rangoModelo(I.meta), enR = st && st.twr >= rango.twr[0] && st.twr <= rango.twr[1] && st.mass >= rango.masa_kg[0] && st.mass <= rango.masa_kg[1];
    const cargada = estadoDe(d).iaOk;
    ia.innerHTML = `<b>Que grabe la IA</b> "${esc(mod)}", generación ${I.meta.generaciones ?? "?"}. ` +
      (sabeGrabar(I, tipos) ? "Ya entrenó estas tomas. " : "<span class='warn'>Todavía no entrenó estas tomas: entrénala en el Laboratorio.</span> ") +
      (st ? (enR ? "<span class='ok'>Conoce un dron como este.</span> " : `<span class='warn'>No conoce un dron así (aprendió con empuje/peso ${fmt(rango.twr[0], 2)}-${fmt(rango.twr[1], 2)} y ${fmt(rango.masa_kg[0], 2)}-${fmt(rango.masa_kg[1], 2)} kg; este: ${fmt(st.twr, 2)}, ${fmt(st.mass, 2)} kg).</span> `) : "") +
      (cargada ? "" : "Se carga sola en el dron al despegar. ") + castigo + entrenar;
  }
  if (duro.length) toast(`El cliente no acepta: ${duro.map((r) => r[1].split(":")[0].toLowerCase()).join(", ")}.`, 4000);
  modal("brief");
}
$("b-cerrar-brief").onclick = () => modal("brief", false);
$("b-brief-lab").onclick = () => { modal("brief", false); abrirLab(); };
$("b-volar").onclick = () => startVuelo(G.pedido, "yo");
$("b-volar-ia").onclick = async () => { const d = D(); if (d?.modelo) await loadModel(d.modelo); if (!G.ias[slugIA(d)]) await loadModel("base"); startVuelo(G.pedido, "ia"); };

// ---------------- laboratorio de IA (cada dron con su modelo; en Blender o en segundo plano) ----------------
const LAB = {
  mision: store.get("lab.mision", "grabar"), azar: store.get("lab.azar", false), n: store.get("lab.n", 50), donde: store.get("lab.donde", "blender"),
  vel: store.get("lab.vel", "rapido"), viento: store.get("lab.viento", 0), premios: store.get("lab.premios", null), baseDe: "base",
  drone: null, estado: null, timer: 0, debounce: 0,
};
if (typeof LAB.mision === "number") LAB.mision = (ent.misiones.find((m) => m.nivel === LAB.mision) || ent.misiones[0]).id;   // guardado viejo
const misionLab = () => ent.misiones.find((m) => m.id === LAB.mision) || ent.misiones[0];
if (!LAB.premios) LAB.premios = { ...misionLab().premios };
const labDron = () => PT.dron(P(), LAB.drone) || D();
const slugDe = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 36) || "dron";

/** El dron como lo necesita el entrenador (drones/<nombre>.json). */
function dronParaEntrenar(d) {
  const a = PT.dronArmado(P(), cat, d);
  if (!a || !a.stats.ok) return null;
  const f = paramsFisica(a.stats), r = (x, n = 4) => Number(x.toFixed(n));
  return { nombre: "dron_" + (d.modelo || slugDe(d.nombre)), piezas: a.build,
    fisica: { mass: r(f.mass), twr: r(f.twr), drag: r(f.drag), max_angle_deg: r((f.maxAngle * 180) / Math.PI, 2),
      yaw_rate_deg: r((f.yawRate * 180) / Math.PI, 2), att_resp: r(f.attResp), crash_speed: f.crashSpeed, radius: f.radius },
    juego: { masa_g: a.stats.masa_g, minutos: r(a.stats.minutos, 2), precio: a.stats.precio, dron: d.nombre } };
}
function saveLab() { for (const k of ["mision", "azar", "n", "vel", "viento", "premios", "donde"]) store.set("lab." + k, LAB[k]); }

/** El entrenamiento de un modelo: el de Blender o uno en segundo plano. */
function trainerDe(slug) {
  const e = LAB.estado;
  if (!e || !slug) return null;
  if ((e.entrenador?.modelo || "base") === slug && e.entrenador?.activo) return { ...e.entrenador, donde: "blender" };
  const f = (e.fondo || []).find((x) => x.modelo === slug);
  return f ? { ...f, donde: "fondo" } : (e.entrenador?.modelo || "base") === slug ? { ...e.entrenador, donde: "blender" } : null;
}

async function abrirLab() { LAB.drone = LAB.drone || P().activo; await loadModelos(); renderLab(); modal("lab"); labPoll(true); }

function renderLab() {
  const box = $("lab-misiones");
  box.innerHTML = "";
  for (const m of ent.misiones) {
    const b = document.createElement("button");
    b.className = "card";
    b.setAttribute("aria-pressed", String(m.id === LAB.mision));
    const sel = m.id === LAB.mision;
    b.innerHTML = `<b>${m.nombre}</b> <span class="muted" style="font-size:12.5px">· nivel ${m.nivel} · ${m.para}</span>${sel ? `<small>${m.desc}<br><i>${m.exito}</i></small>` : ""}`;
    b.onclick = () => { LAB.mision = m.id; LAB.premios = { ...m.premios }; LAB.viento = m.viento; saveLab(); renderLab(); };
    box.appendChild(b);
  }
  const dbox = $("lab-drones");
  dbox.innerHTML = "";
  for (const d of P().drones) {
    const a = PT.dronArmado(P(), cat, d), st = a?.stats, sel = d.id === labDron()?.id;
    const b = document.createElement("button");
    b.className = "card";
    b.setAttribute("aria-pressed", String(sel));
    b.innerHTML = `<b>${esc(d.nombre)}</b> <span class="muted" style="font-size:12.5px">${d.modelo ? `· IA "${esc(d.modelo)}"` : "· sin IA"}</span>` +
      (sel ? `<small>${st?.ok ? `${pieza(cat, "chasis", a.build.chasis).nombre} · ${st.masa_g} g · empuje/peso ${fmt(st.twr, 2)}. Su IA aprende a volar exactamente este dron.` : "Le faltan piezas: ármalo primero."}</small>` : "");
    b.onclick = () => { LAB.drone = d.id; renderLab(); };
    dbox.appendChild(b);
  }
  if (!P().drones.length) dbox.innerHTML = "<p class='muted' style='font-size:14px'>Crea un dron en el hangar primero.</p>";
  const az = document.createElement("label");
  az.className = "row"; az.style.justifyContent = "flex-start"; az.style.marginTop = "6px";
  az.innerHTML = `<input type="checkbox" ${LAB.azar ? "checked" : ""}> <span style="font-size:13.5px">Física al azar (aprende a volar cualquier dron: sirve si le cambias piezas)</span>`;
  az.querySelector("input").onchange = (e) => { LAB.azar = e.target.checked; saveLab(); };
  dbox.appendChild(az);
  // el modelo del dron elegido
  const d = labDron(), mb = $("lab-modelo");
  if (!d) mb.innerHTML = "";
  else if (d.modelo) {
    const m = infoModelo(d.modelo);
    mb.innerHTML = `<div class="card" style="cursor:default"><b>"${esc(d.modelo)}"</b> <span class="muted" style="font-size:12.5px">${m?.tiene_modelo ? `generación ${m.gen ?? 0} · ${(m.pasos || 0).toLocaleString("es")} pasos · tomas: ${(m.tomas || []).join(", ") || "ninguna"}` : "todavía sin entrenar"}</span>` +
      `<small>${d.modelo === "base" ? "Es la IA base (models/modelo.zip): la que venías entrenando. Solo entrena en Blender." : `Vive en models/drones/${esc(d.modelo)}/. Cada vez que entrenes "${esc(d.nombre)}" sigue desde aquí.`}</small></div>`;
  } else {
    const otros = G.modelos.filter((m) => m.tiene_modelo !== false);
    mb.innerHTML = `<div class="card" style="cursor:default"><small style="margin:0">"${esc(d.nombre)}" todavía no tiene IA. Al empezar a entrenar se crea la suya: <b>"${slugDe(d.nombre)}"</b>.</small>` +
      `<div class="row" style="margin-top:6px"><span style="font-size:13.5px">Empieza desde</span><select id="lab-basede" style="background:var(--moss-solid);color:var(--text);border:1px solid var(--line);border-radius:8px;padding:4px 6px;font:inherit;font-size:13.5px">` +
      otros.map((m) => `<option value="${esc(m.slug)}" ${m.slug === LAB.baseDe ? "selected" : ""}>${m.slug === "base" ? "la IA base" : `la IA "${esc(m.slug)}"`} (gen ${m.gen ?? 0})</option>`).join("") +
      `<option value="cero" ${LAB.baseDe === "cero" ? "selected" : ""}>desde cero (red nueva)</option></select></div></div>`;
    $("lab-basede").onchange = (e) => { LAB.baseDe = e.target.value; };
  }
  document.querySelectorAll("#lab-donde button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === LAB.donde)));
  $("lab-n").value = LAB.n; $("lab-n-o").textContent = LAB.n;
  $("lab-viento").value = LAB.viento; $("lab-viento-o").textContent = fmt(LAB.viento);
  document.querySelectorAll("#lab-vel button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === LAB.vel)));
  const pbox = $("premios");
  pbox.innerHTML = "";
  for (const pr of ent.premios) {
    const nv = misionLab().nivel, v = LAB.premios[pr.k] ?? 0, off = (pr.solo && !pr.solo.includes(nv)) || (pr.no && pr.no.includes(nv));
    const row = document.createElement("div");
    row.className = "pr" + (off ? " off" : "");
    const step = pr.paso ?? (pr.max > 10 ? 1 : 0.1);
    row.innerHTML = `<b class="${pr.tipo}">${pr.tipo === "premio" ? "+" : "−"} ${pr.nombre}</b><input type="range" min="0" max="${pr.max}" step="${step}" value="${v}" aria-label="${pr.nombre}"><output>${fmt(v, step < 0.1 ? 2 : 1)}</output><small>${pr.desc}${off ? " (no se usa en esta misión)" : ""}</small>`;
    const inp = row.querySelector("input"), out = row.querySelector("output");
    inp.oninput = () => {
      LAB.premios[pr.k] = Number(inp.value);
      out.textContent = fmt(Number(inp.value), step < 0.1 ? 2 : 1);
      saveLab();
      clearTimeout(LAB.debounce);                       // entrenando: los cambios llegan en vivo
      LAB.debounce = setTimeout(() => { const t = trainerDe(labDron()?.modelo); if (t?.activo) api("/api/lab", { accion: "ajustar", premios: LAB.premios, donde: t.donde, modelo: labDron().modelo }); }, 400);
    };
    pbox.appendChild(row);
  }
  renderLabEstado();
}

function renderLabEstado() {
  const e = LAB.estado, bl = e?.blender || {}, d = labDron(), slug = d?.modelo, tr = trainerDe(slug) || {};
  const db = $("lab-blender"), dt = $("lab-trainer");
  const est = bl.estado || (bl.corriendo ? "entrenando" : "esperando");
  db.className = "dot" + (!bl.abierto || est === "error" ? "" : est === "iniciando" || est === "deteniendo" ? " wait" : " on");
  db.textContent = !bl.abierto ? "Blender cerrado" : `Blender: ${bl.estado_txt || est}${e?.blender_modelo ? ` · "${e.blender_modelo}"` : ""}`;
  dt.className = "dot" + (tr.activo ? (tr.phase === "learn" ? " wait" : " on") : "");
  dt.textContent = tr.activo ? `${tr.donde === "fondo" ? "Segundo plano" : "Blender"}: ${tr.params?.paused || tr.pausado ? "en pausa" : tr.phase === "learn" ? "aprendiendo…" : "entrenando"}` : "Sin entrenar";
  $("b-abrir-blender").classList.toggle("hidden", !!bl.abierto);
  const film = misionLab().nivel >= 11;
  $("lab-gen").textContent = tr.gen ?? "–";
  $("lab-succ").textContent = tr.gen !== undefined ? `${Math.round((tr.succ || 0) * 100)} %` : "–";
  $("lab-crash").textContent = tr.gen !== undefined ? `${Math.round((tr.crash || 0) * 100)} %` : "–";
  $("lab-film").textContent = tr.gen !== undefined && (tr.stage >= 11 || film) ? `${Math.round((tr.film || 0) * 100)} %` : "–";
  $("b-lab-pausa").textContent = tr.params?.paused || tr.pausado ? "Seguir" : "Pausar";
  $("b-lab-pausa").disabled = $("b-lab-detener").disabled = !tr.activo;
  $("b-lab-iniciar").textContent = tr.activo ? "Aplicar y reiniciar" : "Empezar a entrenar";
  const msgs = [];
  if (!e) msgs.push("Conectando con el servidor…");
  else if (!bl.abierto && LAB.donde === "blender") msgs.push("Abre Blender (botón de arriba): el juego le manda el entrenamiento y Blender muestra a los drones aprendiendo. O elige <b>En segundo plano</b>: entrena sin ventana (puedes tener dos a la vez).");
  for (const o of e?.otros || []) msgs.push(`<span class="warn">Hay otro entrenamiento corriendo en <b>${o.carpeta}</b> (nivel ${o.nivel}). Se reparten el computador (cada uno va más lento).</span>`);
  if (bl.abierto && LAB.ultimoPedido && bl.pedido === LAB.ultimoPedido) msgs.push(`✓ Blender recibió tu pedido${bl.pedido_txt ? `: ${bl.pedido_txt}` : ""}`);
  else if (bl.abierto && LAB.ultimoPedido && LAB.ultimoDonde === "blender" && Date.now() - (LAB.pedidoT || 0) > 4000) msgs.push(`<span class="warn">Blender todavía no lee tu pedido (¿el Drone Lab está cargado en esa ventana de Blender?)</span>`);
  if (bl.msg) msgs.push(`Blender: ${bl.msg}`);
  if (bl.error) msgs.push(`<span class="bad">Error en Blender: ${bl.error}</span>`);
  if (tr.activo) msgs.push(`Entrenando la IA <b>"${esc(tr.modelo || slug)}"</b> (${tr.donde === "fondo" ? "segundo plano" : "Blender"}) · ${({ film_fixed: "Grabar: tomas con ruta", film_posts: "Grabar entre postes", goal_random: "metas", obstacles: "columnas" })[tr.mision] || tr.mision} · ${(tr.steps || 0).toLocaleString("es")} pasos · guardada la generación ${tr.gen_guardada ?? "–"}.`);
  if (tr.msg) msgs.push(tr.msg);
  $("lab-msg").innerHTML = msgs.join("<br>");
  // los entrenamientos en segundo plano (cualquier dron)
  const fb = $("lab-fondo");
  const fondo = (e?.fondo || []).filter((f) => f.activo);
  fb.innerHTML = fondo.length ? `<h3>En segundo plano</h3>` + fondo.map((f) => `<div class="card" style="cursor:default"><b>"${esc(f.modelo)}"</b> <span class="muted" style="font-size:12.5px">gen ${f.gen ?? "–"} · logradas ${Math.round((f.succ || 0) * 100)} % · calidad ${Math.round((f.film || 0) * 100)} %${f.pausado ? " · en pausa" : ""}</span>` +
    `<div style="display:flex;gap:6px;margin-top:6px"><button class="btn ghost small" data-p="${esc(f.modelo)}">${f.pausado ? "Seguir" : "Pausar"}</button><button class="btn ghost small" data-s="${esc(f.modelo)}">Detener y guardar</button></div></div>`).join("") : "";
  fb.querySelectorAll("[data-p]").forEach((b) => (b.onclick = () => api("/api/lab", { accion: "pausar", donde: "fondo", modelo: b.dataset.p })));
  fb.querySelectorAll("[data-s]").forEach((b) => (b.onclick = async () => { const r = await api("/api/lab", { accion: "detener", donde: "fondo", modelo: b.dataset.s }); toast(r.msg || "Deteniendo…"); }));
  drawLabChart(tr.hist || []);
}

function drawLabChart(h) {
  const c = $("lab-chart"), g = c.getContext("2d"), W = c.width, H = c.height;
  g.clearRect(0, 0, W, H);
  g.strokeStyle = "rgba(234,242,239,0.12)";
  g.lineWidth = 1;
  for (const y of [0.25, 0.5, 0.75]) { g.beginPath(); g.moveTo(0, H * y); g.lineTo(W, H * y); g.stroke(); }
  if (h.length < 2) {
    g.fillStyle = "rgba(157,179,169,0.8)"; g.font = "22px 'Chakra Petch'"; g.fillText("La curva de aprendizaje aparece al entrenar", 20, H / 2 + 8);
    return;
  }
  const x = (i) => (i / (h.length - 1)) * (W - 10) + 5;
  for (const [idx, col] of [[3, "#ff5040"], [2, "#47f08a"], [5, "#ffd23f"]]) {
    g.strokeStyle = col; g.lineWidth = 3; g.beginPath();
    let pen = false;                      // la calidad (5) solo existe donde entrenó grabar: con huecos
    h.forEach((r, i) => {
      const v = r[idx];
      if (v === null || v === undefined) { pen = false; return; }
      const y = H - 8 - v * (H - 16);
      pen ? g.lineTo(x(i), y) : g.moveTo(x(i), y);
      pen = true;
    });
    g.stroke();
  }
  g.font = "20px 'Chakra Petch'"; g.fillStyle = "#47f08a"; g.fillText("logradas", 10, 24); g.fillStyle = "#ff5040"; g.fillText("choques", 110, 24);
  if (h.some((r) => r[5] !== null && r[5] !== undefined)) { g.fillStyle = "#ffd23f"; g.fillText("calidad", 205, 24); }
  g.fillStyle = "rgba(157,179,169,0.9)"; g.fillText(`gen ${h[0][0]} → ${h[h.length - 1][0]}`, W - 190, 24);
}

async function labPoll(on = true) {
  clearInterval(LAB.timer);
  if (!on) return;
  const tick = async () => {
    LAB.estado = await api("/api/lab");
    if (LAB.estado?.ok === false) LAB.estado = null;
    if (!$("lab").classList.contains("hidden")) renderLabEstado();
  };
  await tick();
  LAB.timer = setInterval(tick, 1000);
}

async function labIniciar() {
  const d = labDron();
  if (!d) { toast("Crea un dron en el hangar primero."); return; }
  const fis = dronParaEntrenar(d);
  if (!fis && !LAB.azar) { toast("Primero arma un dron que pueda volar.", 3500); return; }
  const nuevo = !d.modelo;
  const slug = d.modelo || (() => { let s = slugDe(d.nombre), k = 2; while (G.modelos.some((m) => m.slug === s) && !P().drones.some((x) => x.modelo === s && x.id === d.id)) s = `${slugDe(d.nombre)}_${k++}`; return s; })();
  const bl = LAB.estado?.blender;
  if (LAB.donde === "blender" && slug !== "base" && bl?.abierto && !("modelo" in bl)) {     // Blender con el drone_lab.py de antes: entrenaría la IA base
    toast("El Blender abierto tiene el Drone Lab de antes y entrenaría la IA base. Ciérralo (Detener y guardar) y ábrelo otra vez, o elige <b>En segundo plano</b>.", 7000);
    return;
  }
  if (LAB.donde === "fondo" && slug === "base") { toast("La IA base solo entrena en Blender. Para entrenar en segundo plano, dale a este dron su propia IA (copia de la base).", 5000); return; }
  const body = { accion: "iniciar", nivel: misionLab().nivel, dron: LAB.azar ? "AZAR" : fis, drones: LAB.n, velocidad: LAB.vel, viento: LAB.viento, premios: LAB.premios,
    modelo: slug, donde: LAB.donde, ...(nuevo ? { base_de: LAB.baseDe } : {}) };
  const r = await api("/api/lab", body);
  if (r.ok) {
    if (nuevo) { d.modelo = slug; guardar(); }
    LAB.ultimoPedido = r.id; LAB.ultimoDonde = LAB.donde; LAB.pedidoT = Date.now();
    loadModelos().then(renderLab);
  }
  toast(r.ok ? (LAB.donde === "fondo" ? `La IA "${esc(slug)}" empezó a entrenar en segundo plano.` : LAB.estado?.blender?.abierto ? "Pedido enviado: Blender empieza a entrenar" : "Pedido listo: abre Blender para que empiece") : r.msg, 4500);
}

$("b-lab").onclick = () => abrirLab();
$("b-lab-cerrar").onclick = () => { modal("lab", false); labPoll(false); if (G.screen === "taller") renderTaller(); };
$("b-lab-iniciar").onclick = labIniciar;
$("b-lab-pausa").onclick = () => { const t = trainerDe(labDron()?.modelo); if (t) api("/api/lab", { accion: "pausar", donde: t.donde, modelo: labDron().modelo }); };
$("b-lab-detener").onclick = async () => { const t = trainerDe(labDron()?.modelo); if (!t) return; const r = await api("/api/lab", { accion: "detener", donde: t.donde, modelo: labDron().modelo }); toast(r.ok ? "Deteniendo y guardando el modelo…" : r.msg); };
$("b-lab-probar").onclick = () => {
  const pe = mis.pedidos.find((x) => x.entrenar && (x.entrenar.nivel === misionLab().nivel) && Math.abs((x.entrenar.viento || 0) - (misionLab().viento || 0)) < 1) || mis.pedidos[0];
  modal("lab", false); labPoll(false);
  if (labDron()) P().activo = labDron().id;
  openBrief(pe);
};
$("b-lab-rec").onclick = () => { LAB.premios = { ...misionLab().premios }; LAB.viento = misionLab().viento; saveLab(); renderLab(); const t = trainerDe(labDron()?.modelo); if (t?.activo) api("/api/lab", { accion: "ajustar", premios: LAB.premios, viento: LAB.viento, donde: t.donde, modelo: labDron().modelo }); };
$("b-abrir-blender").onclick = async () => { const r = await api("/api/abrir_blender", {}); toast(r.msg, 5000); };
$("lab-n").oninput = (e) => { LAB.n = Number(e.target.value); $("lab-n-o").textContent = LAB.n; saveLab(); };
$("lab-viento").oninput = (e) => {
  LAB.viento = Number(e.target.value); $("lab-viento-o").textContent = fmt(LAB.viento); saveLab();
  const t = trainerDe(labDron()?.modelo);
  if (t?.activo) api("/api/lab", { accion: "ajustar", viento: LAB.viento, donde: t.donde, modelo: labDron().modelo });
};
document.querySelectorAll("#lab-vel button").forEach((b) => (b.onclick = () => {
  LAB.vel = b.dataset.v; saveLab(); renderLab();
  const t = trainerDe(labDron()?.modelo);
  if (t?.activo) api("/api/lab", { accion: "ajustar", velocidad: LAB.vel, donde: t.donde, modelo: labDron().modelo });
}));
document.querySelectorAll("#lab-donde button").forEach((b) => (b.onclick = () => { LAB.donde = b.dataset.v; saveLab(); renderLab(); }));

// ---------------- volar ----------------
function startVuelo(pedido, piloto) {
  const d = D(), why = puedeVolar(d, piloto === "ia");
  if (why) { toast(why, 4500); return; }
  if (piloto === "ia") cargarIAenDron(d);
  const a = PT.dronArmado(P(), cat, d), I = piloto === "ia" ? G.ias[slugIA(d)] : null;
  if (G.vuelo) G.vuelo.dispose();
  G.vuelo = new Vuelo(renderer, {
    quality: G.quality, cat, build: { ...a.build }, stats: a.stats, pedido, piloto, policy: I?.policy || null, ctl: G.ctl, keys: G.keys,
    videoCanvas: $("vcam"), onToast: toast, onEnd: (r) => onEnd(r),
  });
  G.last = { pedido, piloto, dron: d.id };
  show("vuelo");
  const ay = a.stats.ayudas;
  $("h-who").textContent = piloto === "ia" ? `${d.nombre} · la IA "${slugIA(d)}" (gen ${I?.meta?.generaciones ?? "?"})` : `${d.nombre} · pilotas tú`;
  $("h-tt").textContent = pedido ? pedido.titulo : "Vuelo de prueba";
  $("h-obj").innerHTML = pedido ? "" : "Practica: despega, prueba la cámara (R graba) y aterriza en la base para volver.";
  $("keys").innerHTML = (piloto === "ia" ? "La IA graba sola · " : `${G.ctl.mouseYaw ? "Ratón: girar · " : "← →: girar · "}Espacio/Shift: ${ay.includes("altura") ? "subir/bajar" : "gas"} · WASD: moverte · `) +
    (pedido ? "" : "R grabar · ") + "C cámara · P pausa · Esc menú" + (piloto === "ia" ? "" : `<br>${ay.includes("altura") ? "✓ mantiene la altura" : "✗ sin barómetro: el gas es tuyo"} · ${ay.includes("frenar") ? "✓ frena solo" : "✗ no frena solo: contra-inclina con WASD"}`);
  if (piloto !== "ia") toast(ay.includes("altura") ? "Mantén Espacio para despegar; al soltar se queda a esa altura." : "Sin barómetro: Espacio da gas, Shift lo quita. ¡Cuidado!", 4000);
  updateMouseHint();
}

function onEnd(r) {
  G.vuelo.paused = true;
  document.exitPointerLock?.();
  const p = P(), d = PT.dron(p, G.last.dron) || D(), pe = r.pedido;
  const h = $("r-h"), msg = [];
  let dmg = [], pay = null;
  if (r.crash) {
    dmg = PT.chocar(p, cat, d, r.impact);
    h.textContent = r.reason === "limites" ? "Se salió del área" : r.reason === "suelo" ? "Se estrelló contra el suelo" : "Chocó";
    h.className = "bad";
    msg.push(`Golpe a ${fmt(r.impact)} m/s.`);
  } else if (r.dead) {
    h.textContent = "Se acabó la batería";
    h.className = "bad";
  } else if (r.failsafe) {
    h.textContent = "Se perdió la señal";
    h.className = "bad";
    msg.push(`Tu radio llega a ${G.vuelo.alcance} m y el dron se alejó más: aterrizó solo donde estaba. Una antena mejor (o ExpressLRS) lo arregla.`);
  } else if (pe && r.completa) {
    h.textContent = r.estrellas >= 2 ? "¡Al cliente le encantó!" : r.estrellas === 1 ? "El cliente lo acepta… a medias" : "Al cliente no le gustó";
    h.className = r.estrellas >= 1 ? "ok" : "bad";
  } else if (pe) {
    const hechas = r.tomas.filter((t) => t.lista).length, flojas = r.tomas.filter((t) => t.lista && t.q < TOMA_OK).length;
    h.textContent = hechas < r.tomas.length ? "Faltaron tomas" : "El cliente no acepta el video";
    h.className = "bad";
    msg.push(hechas < r.tomas.length ? `Grabaste ${hechas} de ${r.tomas.length} tomas.` : `${flojas} ${flojas === 1 ? "toma quedó floja" : "tomas quedaron flojas"} (menos de ${Math.round(TOMA_OK * 100)} %).`);
  } else {
    h.textContent = "Vuelo de prueba";
    h.className = "";
  }
  const repAntes = p.rep;
  if (pe && r.completa && !r.crash && !r.dead) pay = PT.cobrar(p, mis, pe, r.estrellas);
  else if (pe && r.piloto === "ia") {           // la IA no entregó el video: el cliente se queja
    p.rep = Math.max(0, p.rep - REP_FALLA_IA);
    pay = { pago: 0, rep: -(repAntes - p.rep) };
    msg.push(`La IA no entregó el video: el cliente se queja (−${REP_FALLA_IA} de reputación).`);
  }
  const capNuevo = mis.capitulos.find((c) => c.rep && repAntes < c.rep && p.rep >= c.rep);
  if (capNuevo) setTimeout(() => historia(`Capítulo ${capNuevo.n} · ${capNuevo.titulo}`, capNuevo.historia), 400);
  p.vuelos++;
  guardar();
  $("r-stars").innerHTML = pe ? [0, 1, 2].map((i) => (i < r.estrellas ? "★" : "<span class='off'>★</span>")).join("") : "";
  if (r.piloto === "ia") msg.push(`Voló la IA "${esc(d.banco?.ia?.modelo || d.modelo || "base")}".`);
  msg.push(`${fmt(r.t)} s de vuelo, batería al ${Math.round(r.bateria * 100)} %.`);
  $("r-p").innerHTML = `<b>${esc(d.nombre)}</b> · ` + msg.join(" ");
  const rows = [];
  const pc = (x) => `${Math.round(x * 100)} %`;
  if (pe) {
    for (const t of r.tomas) {
      rows.push([`${t.nombre} <span class="muted">(${t.tipo})</span>`, t.lista
        ? `<b class="${t.q >= TOMA_OK ? "ok" : "bad"}">${pc(t.q)}</b> <span class="muted" title="encuadre · en la ruta · ritmo · estable">${pc(t.framing)} · ${pc(t.track)} · ${pc(t.flow)} · ${pc(t.steady)}</span>`
        : "<span class='bad'>no se grabó</span>"]);
    }
    rows.push(["<span class='muted'>encuadre · en la ruta · ritmo · estable</span>", ""]);
    const est = pe.estrellas || PT.ESTRELLAS;
    rows.push(["Nitidez", `${Math.round((r.nitidez ?? 1) * 100)} %`], ["Cámara", `${Math.round(r.cal * 100)} / 100`],
      ["Puntaje", `${r.puntaje} / 100 <span class="muted">(★ ${est[0]} · ★★ ${est[1]} · ★★★ ${est[2]})</span>`]);
  } else rows.push(["Grabado", r.recT > 0 ? `${fmt(r.recT)} s` : "nada (R para grabar)"]);
  if (pay && pay.pago) rows.push(["Pago", `<span class="money">+$${pay.pago}</span>`]);
  if (pay) rows.push(["Reputación", `${pay.rep >= 0 ? "+" : ""}${pay.rep} (total ${p.rep})`]);
  for (const x of dmg) rows.push([x.nombre, `<span class="bad">−${x.perdio} % (queda ${x.vida} %)</span>`]);
  if (dmg.length) rows.push(["Reparar", `<span class="money">$${PT.costoReparar(p, cat, d)}</span>`]);
  $("r-grid").innerHTML = rows.map(([a, b]) => `<span>${a}</span><span>${b}</span>`).join("");
  const v = $("r-video"), dl = $("b-res-bajar");
  if (r.video) {
    const url = URL.createObjectURL(r.video);
    v.src = url;
    v.classList.remove("hidden");
    dl.href = url;
    dl.download = `${pe ? pe.id : "prueba"}_${slugDe(d.nombre)}_${r.estrellas}estrellas.${r.video.type.includes("mp4") ? "mp4" : "webm"}`;
    dl.classList.remove("hidden");
    G.videos.unshift({ url, titulo: pe ? pe.titulo : "Vuelo de prueba", estrellas: r.estrellas, piloto: r.piloto, nombre: dl.download, pedido: !!pe, dron: d.nombre });
  } else { v.classList.add("hidden"); dl.classList.add("hidden"); v.removeAttribute("src"); }
  modal("resultado");
}

function renderVideos() {
  const l = $("lista-videos");
  l.innerHTML = G.videos.length ? "" : "<p class='muted'>Todavía no grabas nada. En un vuelo, R empieza a grabar.</p>";
  for (const v of G.videos) {
    const d = document.createElement("div");
    d.style.marginTop = "14px";
    d.innerHTML = `<b>${v.titulo}</b> <span class="muted">· ${esc(v.dron || "")}${v.piloto === "ia" ? " (la IA)" : ""} ${v.pedido ? "★".repeat(v.estrellas) : ""}</span><video controls playsinline src="${v.url}"></video><a class="btn ghost small" href="${v.url}" download="${v.nombre}">Descargar</a>`;
    l.appendChild(d);
  }
}

$("b-res-taller").onclick = () => endVuelo();
$("b-res-otra").onclick = () => { const l = G.last; endVuelo(); P().activo = l.dron; const why = puedeVolar(D(), l.piloto === "ia"); if (!why) startVuelo(l.pedido, l.piloto); else toast(why, 4000); };
$("b-seguir").onclick = () => setPause(false);
$("b-reintentar").onclick = () => { const l = G.last; endVuelo(); startVuelo(l.pedido, l.piloto); };
$("b-abandonar").onclick = () => endVuelo();

function endVuelo() {
  if (G.vuelo) { G.vuelo.dispose(); G.vuelo = null; }
  show("taller");
  verDron();
  renderTaller();
}

function setPause(on) {
  if (!G.vuelo || G.vuelo.ended) return;
  G.vuelo.paused = on;
  modal("pausa", on);
  if (on) document.exitPointerLock?.();
  updateMouseHint();
}

// ---------------- teclado, ratón y control ----------------
addEventListener("keydown", (e) => {
  if (G.screen !== "vuelo") {
    if (e.code === "Escape") { for (const id of ["tablero", "brief", "videos", "controles", "lab", "historia", "tienda", "inventario", "nuevo-dron"]) modal(id, false); labPoll(false); }
    return;
  }
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
  G.keys.add(e.code);
  const v = G.vuelo;
  if (!v || e.repeat) return;
  if (e.code === "KeyR" && !v.ended && v.o.piloto !== "ia" && !v.o.pedido) { v.toggleRec(); }   // en los pedidos graba sola
  if (e.code === "KeyC") toast(`Cámara: ${{ persecucion: "persecución", piloto: "piloto (parado en la base)", dron: "la del dron" }[v.cycleCam()]}`, 1400);
  if (e.code === "KeyP" || e.code === "Escape") setPause(!v.paused);
});
addEventListener("keyup", (e) => G.keys.delete(e.code));
addEventListener("blur", () => G.keys.clear());

const wantsMouse = () => G.screen === "vuelo" && G.vuelo && !G.vuelo.ended && !G.vuelo.paused && G.vuelo.o.piloto !== "ia" && G.ctl.mouseYaw;
function updateMouseHint() { $("mouse-hint").classList.toggle("hidden", !(wantsMouse() && !document.pointerLockElement)); }
canvas.addEventListener("click", () => { if (wantsMouse()) canvas.requestPointerLock?.(); });
document.addEventListener("pointerlockchange", () => {
  updateMouseHint();
  if (!document.pointerLockElement && G.vuelo && !G.vuelo.ended && !G.vuelo.paused && G.screen === "vuelo") setPause(true);   // Esc suelta el ratón: pausa
});
addEventListener("mousemove", (e) => { if (document.pointerLockElement === canvas && G.vuelo) G.vuelo.manual.addMouse(e.movementX); });

let padPrev = [];
function pollPad() {
  const gp = readGamepad();
  if (!gp || G.screen !== "vuelo" || !G.vuelo) { padPrev = []; return; }
  const now = gp.buttons.map((b) => b.pressed), hit = (i) => now[i] && !padPrev[i];
  if (hit(2) && G.vuelo.o.piloto !== "ia" && !G.vuelo.o.pedido) G.vuelo.toggleRec();
  if (hit(1)) G.vuelo.cycleCam();
  if (hit(9)) setPause(!G.vuelo.paused);
  padPrev = now;
}

// ---------------- controles ----------------
function syncControls() {
  $("c-sens").value = G.ctl.sens; $("c-smooth").value = G.ctl.smooth; $("c-mouse").checked = G.ctl.mouseYaw; $("c-msens").value = G.ctl.mouseSens;
}
$("b-controles").onclick = () => { syncControls(); modal("controles"); };
$("b-cerrar-controles").onclick = () => modal("controles", false);
for (const [id, key, num] of [["c-sens", "sens", true], ["c-smooth", "smooth", true], ["c-msens", "mouseSens", true], ["c-mouse", "mouseYaw", false]]) {
  $(id).oninput = (e) => { G.ctl[key] = num ? Number(e.target.value) : e.target.checked; store.set("ctl", G.ctl); };
}

// ---------------- HUD ----------------
let hudT = 0;
function hud(dt) {
  const v = G.vuelo;
  if (!v) return;
  const h = v.hud();
  $("pip").classList.toggle("rec", h.rec);
  $("pip").classList.toggle("full", v.camMode === "dron");
  $("pip-rec").textContent = `● REC ${String(Math.floor(h.recT / 60)).padStart(2, "0")}:${String(Math.floor(h.recT) % 60).padStart(2, "0")}`;
  $("pip-vig").classList.toggle("hidden", v.o.build.camara !== "cam_juguete");
  $("qbar").firstElementChild.style.height = `${Math.round(h.q.q * 100)}%`;
  $("qbar").firstElementChild.style.background = h.q.q > 0.6 ? "var(--gate)" : h.q.q > 0.3 ? "var(--gold)" : "var(--crash)";
  hudT += dt;
  if (hudT < 0.08) return;
  hudT = 0;
  $("h-spd").textContent = Math.round(h.spd * 3.6);
  const sen = Math.round((h.senal ?? 1) * 100), senCol = h.failsafe ? "var(--crash)" : sen > 30 ? "var(--gate)" : sen > 12 ? "var(--gold)" : "var(--crash)";
  $("h-sub").innerHTML = `altura ${fmt(h.alt)} m${h.altTarget !== null ? ` <span style="color:var(--next)">→ ${fmt(h.altTarget)}</span>` : ""}<br>` +
    `<span style="color:${senCol}">${h.failsafe ? "FAILSAFE" : `señal ${sen} %`}</span>${h.viento ? ` · viento ${fmt(h.viento)} m/s` : ""}<br>${fmt(h.t)} s`;
  const pct = Math.round(h.bat * 100);
  $("h-bat").textContent = h.dead ? "SIN BATERÍA" : `${pct} % · ${fmt(Math.min(h.minLeft, 99))} min`;
  const bb = $("h-batbar");
  bb.style.width = `${pct}%`;
  bb.style.background = pct > 40 ? "var(--gate)" : pct > 20 ? "var(--gold)" : "var(--crash)";
  if (v.o.pedido) {
    const sh = h.shot, ok = (x) => (x > 0.6 ? "ok" : x > 0.3 ? "warn" : "bad"), mk = (x) => (x > 0.6 ? "✓" : "·");
    $("h-tt").textContent = sh ? `Toma ${h.k + 1} de ${h.n}: ${sh.nombre}` : `${v.o.pedido.titulo}: ¡tomas listas!`;
    $("h-prog").style.width = sh ? `${Math.round(sh.progress * 100)}%` : "100%";
    $("h-obj").innerHTML = (sh ? (sh.phase === "ir"
      ? `Ve al <b style="color:var(--next)">aro celeste</b> (a ${fmt(h.toStart)} m) y llega despacio: ahí empieza a grabar.`
      : `<b style="color:#ff3b30">● Grabando</b>: sigue el punto blanco pegado, con el sujeto al centro del cuadro.`)
      : "Vuelve a la base y aterriza para entregar el video.") +
      `<br>${h.res.map((r, i) => `${r.lista ? (r.q / Math.max(r.n, 1) >= TOMA_OK ? "✓" : "✗") : i === h.k ? "▸" : "·"} ${r.nombre}${r.lista ? ` ${Math.round((r.q / Math.max(r.n, 1)) * 100)} %` : ""}`).join("<br>")}`;
    $("checks").innerHTML = `<span class="${ok(h.q.framing)}">${mk(h.q.framing)} el sujeto al centro</span> · ` +
      `<span class="${ok(h.q.track)}">${mk(h.q.track)} en la ruta</span><br>` +
      `<span class="${ok(h.q.flow)}">${mk(h.q.flow)} a su ritmo</span> · <span class="${ok(h.q.steady)}">${mk(h.q.steady)} estable</span><br>` +
      `calidad ahora <b class="${ok(h.q.q)}">${Math.round(h.q.q * 100)} %</b>`;
  } else {
    $("h-prog").style.width = "0%";
    $("checks").innerHTML = h.rec ? `<b style="color:#ff3b30">● REC</b> ${fmt(h.recT)} s` : "<span class='muted'>R para grabar</span>";
  }
  $("pip-t").textContent = `Cámara del dron · ${pieza(cat, "camaras", v.o.build.camara).nombre}`;
}

// ---------------- bucle ----------------
let last = performance.now(), fpsN = 0, fpsT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (G.screen === "vuelo" && G.vuelo) {
    pollPad();
    G.vuelo.update(dt);
    G.vuelo.render(dt, now);
    hud(dt);
  } else {
    garaje.update(dt);
    renderer.setViewport(0, 0, innerWidth, innerHeight);
    renderer.render(garaje.scene, garaje.camera);
  }
  fpsN++;
  if (now - fpsT > 500) { $("fps").textContent = `${Math.round((fpsN * 1000) / (now - fpsT))} fps`; fpsN = 0; fpsT = now; }
}

// ---------------- arranque ----------------
applyQuality();
try {                                                  // tus STL (chasis, carcasas…) antes de dibujar los drones
  G.stl = (await api("/api/stl")).stl || [];
  await Promise.all(G.stl.map((s) => cargarSTL(s).catch(() => null)));
} catch { G.stl = []; }
if (G.partida) guardar();                             // guarda la partida migrada (v3)
verDron();
show("inicio");
renderInicio();
loadModelos();
window.__gameReady = true;
window.__dm = { G, PT, BA, cat, mis, garaje: () => garaje };   // para probar desde la consola del navegador
requestAnimationFrame(frame);
