// =====================================================================
// DRON MAKER — el juego. Inicio -> el HANGAR (tus drones: cada uno con sus piezas, su propósito y su
// propia IA) -> la TIENDA (pides piezas, las que quieras) -> el BANCO DE ARMADO (imprimir, armar, cablear,
// flashear, probar) -> pedidos -> volar y grabar -> cobrar -> mejores piezas.
// La IA de cada dron vive en models/drones/<nombre>/ (la "base" es models/modelo.zip). Datos en app/data/.
// Módulos: tienda.js (tienda + inventario + STL), ui_banco.js (el banco), banco.js (lógica del banco).
// =====================================================================
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { Policy } from "../game/sim.js";
import { DEFAULT_CTL, readGamepad } from "../game/pilot.js";
import { calcular, pieza, rangoModelo, paramsFisica, DRONES_EJEMPLO } from "./parts.js";
import * as PT from "./partida.js";
import * as ESC from "./escenarios.js";
import * as SW from "./software.js";
import * as BA from "./banco.js";
import { Garaje, sfx } from "./garaje.js";
import { Vuelo, TOMA_OK } from "./vuelo.js";
import { mundoLugar, alcanceNecesario } from "./lugares.js";
import { cargarSTL } from "./stl.js";
import { initTienda } from "./tienda.js";
import { initBanco } from "./ui_banco.js";
import { initMesa } from "./mesa.js";
import { initEstudio } from "./estudio.js";
import { initSim } from "./ui_sim.js";
import { realDe, nivelDe } from "./pbdmm.js";
import * as REQ from "./requisitos.js";
import * as NG from "./negocio.js";
import { initCelular } from "./celular.js";
import * as RUTA from "./ruta.js";
import * as TU from "./tutorial.js";
import * as DM from "./demo.js";
import { initNotas } from "./notas.js";
import { precargar } from "./modelos3d.js";
import { confirmar, pedirTexto } from "./dialogo.js";
import { abrirFreestyle } from "./volar.js";
import { t, idioma, hayIdioma, setIdioma, cargarIdioma, traducirHTML, datos, num, IDIOMAS } from "./i18n.js";

await cargarIdioma();                                  // el diccionario del idioma elegido (español: nada)

const $ = (id) => document.getElementById(id);
const fmt = (x, d = 1) => num(x, d);                   // coma en español, punto en inglés
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const store = {
  get(k, d) { try { const v = localStorage.getItem("dronmaker." + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("dronmaker." + k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } },
};

const [cat, mis, ent, clientes, trabajos, escen, softw] = await Promise.all(["piezas", "misiones", "entrenamiento", "clientes", "trabajos", "escenarios", "software"]
  .map((f) => fetch(`./data/${f}.json`).then((r) => r.json()).then((j) => datos(f, j))));   // + la capa del idioma (data/en/)
const G = {
  screen: "inicio", partida: PT.cargar(), quality: store.get("quality", "media"),
  ctl: { ...DEFAULT_CTL, ...store.get("ctl", {}) }, vuelo: null, hover: null, izq: "hangar",
  videos: [], last: null, keys: new Set(), todos: [], ias: {}, stl: [], fotos: {},
};
/** Los datos del negocio (negocio.js): clientes, plantillas de trabajos y la campaña. */
const ND = { clientes, trabajos, misiones: mis };

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
garaje.ambiente(renderer);
// el garaje con post-proceso (calidad media/alta): bloom suave (la lámpara, el aro del plato, la ventana, los LED) y
// una viñeta cálida que lleva la vista al centro. En "baja" se dibuja directo.
const composer = new EffectComposer(renderer);
const pasoEscena = new RenderPass(garaje.scene, garaje.camera);
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.28, 0.5, 0.96);
const vineta = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, fuerza: { value: 0.42 } },
  vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
  fragmentShader: `uniform sampler2D tDiffuse; uniform float fuerza; varying vec2 vUv;
    void main() { vec4 c = texture2D(tDiffuse, vUv); vec2 d = vUv - 0.5; float v = smoothstep(0.85, 0.2, length(d * vec2(1.0, 0.8)));
      c.rgb *= mix(1.0 - fuerza, 1.0, v); c.rgb *= vec3(1.03, 1.0, 0.96); gl_FragColor = c; }`,
});
composer.addPass(pasoEscena); composer.addPass(bloom); composer.addPass(vineta); composer.addPass(new OutputPass());
function dibujarGaraje() {
  if (G.quality === "baja") return renderer.render(garaje.scene, garaje.camera);
  pasoEscena.scene = garaje.scene; pasoEscena.camera = garaje.camera;
  composer.render();
}

function applyQuality() {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, { alta: 2, media: 1.5, baja: 1 }[G.quality]));
  resize();
}
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(innerWidth, innerHeight);
  garaje.resize(innerWidth, innerHeight);
}
addEventListener("resize", resize);

let toastT = 0;
function toast(msg, ms = 2600) {
  const el = $("toast");
  el.innerHTML = msg;
  el.style.opacity = 1;
  clearTimeout(toastT);
  toastT = setTimeout(() => (el.style.opacity = 0), ms);
}

async function api(path, body) {
  try {
    const r = await fetch(path, body ? { method: "POST", body: typeof body === "string" || body instanceof ArrayBuffer ? body : JSON.stringify(body) } : { cache: "no-store" });
    return await r.json();
  } catch { return { ok: false, msg: t("No hay servidor: abre el juego con python scripts/jugar.py") }; }
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
// G.todos = todo lo que hay en disco (para no repetir nombres); G.modelos = lo que ESTA partida ve (PT.modelosVisibles:
// una partida nueva solo los suyos, sin la IA base ni los del juego)
Object.defineProperty(G, "modelos", { get: () => PT.modelosVisibles(P(), G.todos) });
async function loadModelos() {
  const r = await api("/api/modelos");
  G.todos = r.modelos || [];
  // las IA de ESTA partida (una nueva: ninguna). Antes decía "IA base: generación 3560" y parecía que tu IA ya venía entrenada
  const base = G.todos.find((m) => m.slug === "base"), n = G.modelos.filter((m) => m.slug !== "base").length;
  $("modelo-ini").innerHTML = base?.tiene_modelo !== false && base
    ? (n ? t("{n} IA entrenadas en tu partida", { n }) : "") : t("IA: no encontré el modelo (abre el juego con python scripts/jugar.py).");
}
const infoModelo = (slug) => G.modelos.find((m) => m.slug === slug) || null;
/** Las tomas que pide un pedido, como las anota el entrenador en meta.tomas (las fotos: "foto", niveles 13-14). */
const tiposDe = (pe, shots) => (pe?.tipo === "foto" || pe?.tipo === "inspeccion" ? ["foto"] : [...new Set(shots.map((tm) => tm.tipo))]);
const sabeGrabar = (ia, tipos = ["fija", "orbita", "revelar"]) => !!(ia?.policy && ia.policy.layers[0].nin >= 38 && tipos.every((tp) => (ia.meta?.tomas || []).includes(tp)));
/** ¿La IA `slug` sabe hacer este pedido? Lo que entrenó (meta.tomas) o un examen aprobado que lo cubre (E2 = las fotos fáciles). */
const sabePedido = (ia, slug, pe, tipos) => sabeGrabar(ia, tipos) || !!(ia?.policy && pe?.entrenar && ESC.aprobo(P(), escen, slug, pe.entrenar.mision));

// ---------------- pantallas ----------------
const PANELS = { inicio: ["inicio"], taller: ["taller-izq", "taller-der"], banco: ["banco-izq", "banco-der"], vuelo: ["hud"], estudio: ["estudio"], sim: ["sim"], mesa: ["mesa"] };
const MODALES = ["demo-fin", "estante", "celular", "idioma", "sim-elegir", "aviso-ia", "tablero", "brief", "videos", "controles", "pausa", "resultado", "lab", "historia", "tienda", "inventario", "nuevo-dron", "cableado"];
function show(screen) {
  G.screen = screen;
  for (const ids of Object.values(PANELS)) ids.forEach((id) => $(id).classList.add("hidden"));
  (PANELS[screen] || []).forEach((id) => $(id).classList.remove("hidden"));
  for (const id of MODALES) $(id).classList.add("hidden");
  if (screen !== "taller") labPoll(false);
  garaje.view = screen === "inicio" ? "menu" : screen === "banco" ? "banco" : "taller";
  if (screen !== "banco") garaje.conectarUSB(false);
  if (screen !== "vuelo") document.exitPointerLock?.();
  renderGuia();
}
const modal = (id, on = true) => $(id).classList.toggle("hidden", !on);

// ---------------- inicio ----------------
function renderInicio() {
  const p = P();
  $("b-continuar").classList.toggle("hidden", !p);
  $("b-nueva").className = p ? "btn ghost" : "btn main";
  const si = $("save-info");
  si.classList.toggle("hidden", !p || !$("partidas").classList.contains("hidden"));
  if (p) {
    si.innerHTML = (p.modo === "dev" ? `<b style="color:var(--next)">${t("Modo desarrollador")}</b> · ` : "") + t("Tu partida: <span class=\"money\">${plata}</span> · reputación {rep} · {n} pedidos hechos", { plata: p.plata, rep: p.rep, n: Object.keys(p.hechos).length }) + "<br>" +
      `<span class="muted">${p.drones.length ? (p.drones.length === 1 ? t("{n} dron en el hangar: {lista}", { n: 1, lista: esc(p.drones[0].nombre) }) : t("{n} drones en el hangar: {lista}", { n: p.drones.length, lista: p.drones.map((d) => esc(d.nombre)).join(", ") })) : t("Todavía sin drones")}</span>`;
  }
  document.querySelectorAll("#quality button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.q === G.quality)));
  PT.listar().then((l) => { G.partidas = l; $("b-partidas").classList.toggle("hidden", !l?.length); });
}
/** La versión del juego en el inicio: la del código que corre (la app instalada o su actualización: version.json);
 *  desde el proyecto, la de desktop/package.json. */
(async () => {
  const leer = (u) => fetch(u, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const v = await leer("/version.json"), dev = !v && (await leer("/desktop/package.json"));
  if (v?.version || dev?.version) $("version").textContent = `Neural Drone Forge v${v?.version || dev.version}${dev ? " · " + t("desde el código") : ""}`;
})();
$("b-continuar").onclick = () => irTaller();
const modoNuevo = (on) => { $("modo-nuevo").classList.toggle("hidden", !on); document.querySelector("#inicio .col").classList.toggle("hidden", on); };
$("b-nueva").onclick = () => modoNuevo(true);
$("b-modo-volver").onclick = () => modoNuevo(false);

// ---------------- las partidas (un archivo cada una: scripts/jugar.py partidas/) ----------------
const verPartidas = (on) => { $("partidas").classList.toggle("hidden", !on); document.querySelector("#inicio .col").classList.toggle("hidden", on); $("save-info").classList.toggle("hidden", on || !P()); if (on) renderPartidas(); };
const nombrePartida = (r) => r.nombre || (r.drones?.[0] ? t("El garaje de {d}", { d: r.drones[0] }) : t("Partida sin nombre"));
const fechaPartida = (ms) => ms ? new Date(ms).toLocaleString(idioma() === "en" ? "en-US" : "es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
async function renderPartidas() {
  const ul = $("partidas-lista");
  const l = G.partidas = await PT.listar();
  if (!l) { ul.innerHTML = `<p class="muted">${t("No encuentro el servidor del juego: las partidas viven en tu computador y él las guarda.")}</p>`; return; }
  if (!l.length) { ul.innerHTML = `<p class="muted">${t("Todavía no hay partidas guardadas.")}</p>`; return; }
  const yo = P()?.id;
  ul.innerHTML = l.map((r) => `<div class="partida${r.id === yo ? " actual" : ""}">
    <b>${esc(nombrePartida(r))}${r.id === yo ? ` <span class="muted" style="font-size:12px;font-weight:500">· ${t("la que juegas")}</span>` : ""}</b>
    <div class="det">${r.modo === "dev" ? `<b style="color:var(--next);font-size:12.5px">${t("Desarrollador")}</b>` : t("Normal")} · <span class="money">$${r.plata}</span> · ${t("rep. {n}", { n: r.rep })} · ${t("{n} pedidos", { n: r.pedidos })} · ${t("{n} IA", { n: r.modelos.length })}<br>${t("Guardada: {f}", { f: fechaPartida(r.guardada) })}</div>
    <div class="acc"><button class="btn main small" data-jugar="${r.id}" title="${t("Jugar")}">▶ ${r.id === yo ? t("Seguir") : t("Jugar")}</button><button class="btn ghost small" data-ren="${r.id}" title="${t("Cambiar el nombre")}">✏️</button><button class="btn ghost small" data-exp="${r.id}" title="${t("Exportar (archivo .json)")}">📤</button><button class="btn ghost small" data-bor="${r.id}" title="${t("Borrar")}">🗑️</button></div>
  </div>`).join("");
  ul.querySelectorAll("[data-jugar]").forEach((b) => (b.onclick = () => jugarPartida(b.dataset.jugar)));
  ul.querySelectorAll("[data-ren]").forEach((b) => (b.onclick = () => renombrarPartida(b.dataset.ren)));
  ul.querySelectorAll("[data-exp]").forEach((b) => (b.onclick = () => exportarPartida(b.dataset.exp)));
  ul.querySelectorAll("[data-bor]").forEach((b) => (b.onclick = () => borrarPartida(b.dataset.bor)));
}
/** Cambiar de partida: se guarda la de ahora y se recarga el juego con la otra (así nada queda de la anterior). */
async function jugarPartida(id) {
  if (P()?.id === id) { verPartidas(false); return irTaller(); }
  const q = await PT.leer(id);
  if (!q) return toast(t("No pude abrir esa partida."));
  if (P()) await PT.guardarYa(P());
  PT.activar(q);
  sessionStorage.setItem("dronmaker.alTaller", "1");
  location.reload();
}
async function renombrarPartida(id) {
  const r = G.partidas?.find((x) => x.id === id);
  const n = ((await pedirTexto(t("¿Cómo se llama esta partida?"), r?.nombre || "", { titulo: t("Nombre de la partida"), si: t("Guardar") })) ?? "").trim().slice(0, 40);
  if (!n) return;
  const q = P()?.id === id ? P() : await PT.leer(id);
  if (!q) return;
  q.nombre = n;
  await PT.guardarYa(q, P()?.id === id);
  renderPartidas(); renderInicio();
}
async function exportarPartida(id) {
  const q = P()?.id === id ? P() : await PT.leer(id);
  if (!q) return;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(q, null, 1)], { type: "application/json" }));
  a.download = `neural-drone-forge_${(q.nombre || q.drones?.[0]?.nombre || "partida").replace(/[^\p{L}\p{N}_-]+/gu, "_")}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
async function borrarPartida(id) {
  const r = G.partidas?.find((x) => x.id === id);
  if (!r) return;
  const ia = r.modelos.length ? " " + t("También sus {n} IA entrenadas ({l}), si ninguna otra partida las usa.", { n: r.modelos.length, l: r.modelos.map(esc).join(", ") }) : "";
  if (!(await confirmar(t("¿Borrar «{n}»?", { n: esc(nombrePartida(r)) }) + ia + "<br><span class=\"muted\">" + t("Queda en la papelera de la carpeta del juego, por si acaso.") + "</span>", { si: t("Borrar"), peligro: true }))) return;
  const res = await PT.borrarArchivo(id);
  if (!res.ok) return toast(t("No se pudo borrar: {msg}", { msg: res.msg || "?" }));
  if (P()?.id === id) { G.partida = null; verDron(); }
  toast(res.modelos_quedan?.length ? t("Borrada. Estas IA están entrenando y no se borraron: {l}", { l: res.modelos_quedan.join(", ") }) : t("Partida borrada."));
  await renderPartidas();
  if (!G.partidas?.length) verPartidas(false);
  renderInicio();
}
/** Salir al escritorio: guarda y cierra. En la app (Electron) se cierra la ventana y con ella el servidor; en el
 *  navegador una pestaña que no abrió un script no se puede cerrar sola: queda la pantalla de "ya puedes cerrarla". */
async function salirDelJuego() {
  if (!(await confirmar(t("¿Salir del juego? Tu partida queda guardada."), { si: t("Salir") }))) return;
  if (P()) { guardar(); await PT.guardarYa(P()).catch(() => null); }
  window.close();
  setTimeout(() => $("salida").classList.remove("hidden"), 300);
}
$("b-salir").onclick = $("b-salir2").onclick = salirDelJuego;
$("b-salida-volver").onclick = () => $("salida").classList.add("hidden");
// la partida que juegas está en la papelera (la borraste en otra ventana): avisar una vez, no se está guardando
addEventListener("partida-papelera", () => { if (G.avisoPapelera) return; G.avisoPapelera = true; toast(t("Esta partida la borraste (está en la papelera): lo que hagas aquí ya no se guarda. Ve a 📂 Partidas y juega otra."), 9000); });
$("b-partidas").onclick = () => verPartidas(true);
$("b-partidas-volver").onclick = () => { verPartidas(false); renderInicio(); };
$("b-importar").onclick = () => $("f-importar").click();
$("f-importar").onchange = async (ev) => {
  const f = ev.target.files?.[0];
  ev.target.value = "";
  if (!f) return;
  try {
    const q = PT.importar(await f.text());
    await PT.guardarYa(q, false);
    toast(t("Partida importada: «{n}»", { n: esc(nombrePartida(q)) }));
    renderPartidas();
  } catch (e) { toast(e.message || t("Ese archivo no es una partida de Neural Drone Forge.")); }
};
/**
 * Empezar una partida (los dos modos empiezan igual: el regalo de mamá, $150 y todo por desbloquear; el modo
 * desarrollador suma las herramientas de programar en el computador).
 */
async function empezar(dev) {
  if (G.partida) await PT.guardarYa(G.partida);    // la de antes queda en 📂 Partidas
  modoNuevo(false);
  G.partida = dev ? PT.nuevaPartidaDesarrollador() : PT.nuevaPartida();
  estudio.vaciar();                                // sin programas ni modelos: la partida empieza en cero
  TU.pasarA(G.partida, "regalo");                  // el tutorial obligatorio: regalo -> nombre -> armar -> computador -> modelo
  guardar();
  G.regaloVisto = true;
  irTaller();
  regalo(dev);
}
/** El regalo de mamá (el primer paso del tutorial). También si cerraste el juego antes de aceptarlo (irTaller). */
function regalo(dev) {
  historia(t("El regalo"), t("Llevabas meses pidiéndole a tu mamá un <b>dron profesional</b>, de esos con cámara 4K y GPS.<br><br>Hoy llega con una caja de cartón y una sonrisa: «Mijo, no me alcanzó para el que querías… pero este se arma. Dicen que el que lo arma aprende más».<br><br>Adentro: un <b>dron de madera</b> en piezas, unos motores sencillos, una placa ESP32, una cámara de juguete… y un cautín."),
    { boton: t("Aceptar el regalo ❤️"), alCerrar: async () => {
      const d = regaloMama(), p = P();
      TU.pasarA(p, "nombre"); guardar();
      const n = ((await pedirTexto(t("Es tuyo. ¿Cómo se va a llamar tu dron?"), d?.nombre || t("Madera"), { titulo: t("Tu primer dron"), si: t("Ponerle ese nombre"), no: t("Dejarle «{n}»", { n: d?.nombre || t("Madera") }) })) || "").trim().slice(0, 30);
      if (d && n) d.nombre = n;
      TU.pasarA(p, "armar"); guardar(); renderTaller();
      const c1 = mis.capitulos[0];
      historia(dev ? t("Modo desarrollador") : t("Capítulo {n} · {titulo}", { n: 1, titulo: c1.titulo }),
        (dev ? t("Aquí <b>programas la IA</b> con PBDMM, pero se juega igual que el modo normal: empiezas con el dron de mamá y cada simulador (💻 → 🎮 Simuladores) se compra y abre misiones y funciones nuevas del lenguaje. El primero, <b>Foto fija</b>, es gratis.") : `${c1.historia}`) +
        "<br><br>" + t("Primero, a armar «{d}»: las notas de <b>arriba a la derecha</b> te van diciendo qué hacer. Cuando vuele, prendemos el computador.", { d: esc(d?.nombre || "") }));
    } });
}
$("b-modo-dev").onclick = () => empezar(true);
$("b-modo-normal").onclick = () => empezar(false);
function irTaller() {
  show("taller"); G.izq = "hangar"; verDron(); renderTaller(); loadModelos().then(() => G.screen === "taller" && renderTaller());   // las generaciones de hoy
  // cerraste el juego en medio del regalo: vuelve a salir (sin él no hay dron y la nota pedía «Abre el regalo» sin regalo)
  const e = P()?.tuto?.etapa;
  if (e === "regalo" && !G.regaloVisto) { G.regaloVisto = true; regalo(P().modo === "dev"); }
  else if (e === "nombre") { TU.pasarA(P(), "armar"); guardar(); renderTaller(); }
}

/** Una pantalla de historia (inicio de capítulo). opts: { boton, alCerrar } */
function historia(titulo, html, opts = {}) {
  $("hist-h").textContent = titulo;
  $("hist-p").innerHTML = html;
  $("b-hist").textContent = opts.boton || t("¡Vamos!");
  historia.alCerrar = opts.alCerrar || null;
  modal("historia");
}
$("b-hist").onclick = () => { modal("historia", false); const f = historia.alCerrar; historia.alCerrar = null; f?.(); };
document.querySelectorAll("#quality button").forEach((b) => (b.onclick = () => {
  G.quality = b.dataset.q;
  store.set("quality", G.quality);
  garaje = new Garaje(G.quality);
  garaje.ambiente(renderer);
  garaje.usarModelos();
  verDron();
  applyQuality();
  renderInicio();
}));

// ---------------- el hangar y el editor de cada dron ----------------
function descr(ranura, pz) {
  switch (ranura) {
    case "chasis": return t("{g} g · hélices hasta {h}\" · aguanta {v} m/s", { g: pz.masa_g, h: pz.helice_max, v: fmt(pz.aguante_ms) }) + ` · ${pz.desc || ""}`;
    case "motores": return t("{e} g de empuje (4 motores, {s}S, {h}\")", { e: pz.empuje_g * 4, s: pz.celdas[1], h: pz.helice_ref }) + ` · ${pz.celdas[0]}-${pz.celdas[1]}S · ${pz.masa_g * 4} g`;
    case "helices": return t("{g} g el juego", { g: pz.masa_g }) + ` · ${pz.desc || ""}`;
    case "baterias": return `${pz.celdas}S ${pz.mah} mAh · ${pz.masa_g} g${pz.desc ? " · " + pz.desc : ""}`;
    case "controladoras": return pz.desc || "";
    case "camaras": return t("calidad {c}", { c: pz.calidad }) + `${pz.gimbal ? " · " + t("gimbal {n} ejes", { n: pz.gimbal_ejes || 3 }) : ""} · ${pz.masa_g} g${pz.desc ? " · " + pz.desc : ""}`;
    case "escs": return t("{a} A por motor", { a: pz.corriente_a }) + `${pz.filtro_rpm ? " · " + t("filtro RPM") : ""} · ${pz.desc || ""}`;
    case "radios": return t("alcance {d}", { d: pz.alcance_m >= 1000 ? fmt(pz.alcance_m / 1000) + " km" : pz.alcance_m + " m" }) + ` · ${pz.desc || ""}`;
    case "montajes": return pz.desc || "";
    case "extras": return `${pz.masa_g} g · ${pz.desc || ""}`;
    case "herramientas": return pz.desc || "";
    case "soldadura": return pz.desc || "";
    default: return "";
  }
}

function renderTaller() {
  const p = P();
  NG.asegurar(p, ND);
  const nl = NG.noLeidos(p);
  $("cel-badge").textContent = nl;
  $("cel-badge").classList.toggle("hidden", !nl);
  $("pc-badge").textContent = nl;
  $("pc-badge").classList.toggle("hidden", !nl);
  $("empresa").textContent = p.empresa || t("El garaje");
  $("plata").textContent = `$${p.plata}`;
  $("rep").textContent = p.rep;
  $("etapa").textContent = p.modo === "dev" ? t("Desarrollador") : t("Etapa {n}", { n: PT.etapa(p) });
  $("b-estudio").classList.toggle("hidden", p.modo !== "dev");
  $("b-lab").classList.toggle("hidden", p.modo === "dev");          // modo desarrollador: solo el Estudio (IDE + consola)
  if (G.izq === "dron" && D()) renderEditor(); else renderHangar();
  renderStats();
  renderGuia();
}

/** El tutorial ahora son las notas de arriba a la derecha (tutorial.js + notas.js); la línea de abajo ya no sale. */
function renderGuia() { $("guia").classList.add("hidden"); notasTutorial(); }

/** Chips de estado de un dron: listo / qué le falta en el banco / su IA. */
function chipsDron(d) {
  const e = estadoDe(d), arm = PT.dronArmado(P(), cat, d);
  const out = [];
  if (!arm) out.push(`<span class="chip bad">${t("Le faltan piezas")}</span>`);
  else if (!arm.stats.ok) out.push(`<span class="chip bad">${esc(arm.stats.errores[0])}</span>`);
  else if (PT.rotas(P(), d).length) out.push(`<span class="chip bad">${t("Piezas rotas")}</span>`);
  else if (e.listo) out.push(`<span class="chip on">${t("Listo para volar")}</span>`);
  else out.push(`<span class="chip warn">${t("Banco: {paso}", { paso: e.pasos.find((x) => !x.ok)?.nombre.toLowerCase() })}</span>`);
  const m = d.modelo && infoModelo(d.modelo);
  out.push(d.modelo ? `<span class="chip ai">${t("IA \"{m}\"", { m: esc(d.modelo) })}${m?.gen ? " · " + t("gen {n}", { n: m.gen }) : " · " + t("sin entrenar")}${m?.entrenando ? " · " + t("entrenando") : ""}</span>` : `<span class="chip">${t("Sin IA")}</span>`);
  return out.join("");
}

function renderHangar() {
  const p = P(), box = $("ranuras");
  box.innerHTML = `<div class="ranura"><h3>${p.drones.length === 1 ? t("Tu hangar · {n} dron", { n: 1 }) : t("Tu hangar · {n} drones", { n: p.drones.length })}</h3></div>`;
  for (const d of p.drones) {
    const arm = PT.dronArmado(p, cat, d), b = PT.build(p, d);
    const b_ = document.createElement("button");
    b_.className = "dcard" + (d.id === p.activo ? " on" : "");
    b_.innerHTML = `<b>${esc(d.nombre)}</b><span class="muted" style="font-size:13px">${arm?.stats.ok ? `${arm.stats.masa_g} g · ${fmt(arm.stats.twr, 2)}` : ""}</span>` +
      `<small>${esc(d.proposito || "")}${d.proposito ? " · " : ""}${b.chasis ? pieza(cat, "chasis", b.chasis).nombre : t("sin chasis")}${b.controladora ? " · " + pieza(cat, "controladoras", b.controladora).nombre : ""}</small><div class="chips">${chipsDron(d)}</div>`;
    b_.onclick = () => { if (p.activo === d.id) { G.izq = "dron"; } p.activo = d.id; guardar(); verDron(); renderTaller(); };
    b_.ondblclick = () => { p.activo = d.id; G.izq = "dron"; renderTaller(); };
    box.appendChild(b_);
  }
  if (!p.drones.length) box.insertAdjacentHTML("beforeend", `<p class="muted" style="margin:8px 6px;font-size:14px;line-height:1.5">${t("Todavía no tienes drones. Compra el <b>Kit del garaje</b> en 💻 Computador → Tienda → 🎁 Kits (el dron de madera de siempre), o crea uno con lo que tengas en el estante.")}</p>`);
  const pie = $("taller-pie");
  pie.innerHTML = "";
  const btn = (txt, cls, fn) => { const b = document.createElement("button"); b.className = "btn " + cls; b.textContent = txt; b.onclick = fn; pie.appendChild(b); return b; };
  if (D()) btn(t("Abrir \"{nombre}\"", { nombre: D().nombre }), "main", () => { G.izq = "dron"; renderTaller(); });
  btn(t("+ Nuevo dron"), "ghost small", () => { $("nd-nombre").value = t("Dron {n}", { n: p.drones.length + 1 }); $("nd-prop").value = ""; modal("nuevo-dron"); $("nd-nombre").focus(); });
}
$("b-nd-cerrar").onclick = () => modal("nuevo-dron", false);
$("b-nd-crear").onclick = () => {
  const d = PT.nuevoDron(P(), $("nd-nombre").value.trim() || undefined, $("nd-prop").value.trim());
  avisoRutaDron(d);
  for (const [slot, id] of [["montaje", "mt_tornillos"], ["radio", "rx_espnow"]]) {      // lo gratis ya viene puesto
    if (!PT.libres(P(), id).length) PT.comprar(P(), cat, PT.RANURA[slot], id, 1);
    PT.instalar(P(), d, slot, id);
  }
  guardar();
  modal("nuevo-dron", false);
  G.izq = "dron";
  verDron();
  renderTaller();
  toast(t("\"{nombre}\" está en el hangar: elige sus piezas (si no las tienes, cómpralas en la Tienda).", { nombre: esc(d.nombre) }), 4000);
};

/** Modo desarrollador: cada dron que creas abre un capítulo de la ruta del programador (ruta.js). */
function avisoRutaDron(d) {
  const n = RUTA.alCrearDron(P(), d);
  if (n) setTimeout(() => toast(t("📘 Ruta del programador: se abrió el capítulo {n} con \"{d}\" (Estudio PBDMM → Ruta).", { n, d: esc(d.nombre) }), 4500), 900);
}
/** Lo del kit que te falta: las piezas del dron de madera y, si no tienes, lo básico para soldar (cautín, estaño, flux, cable). */
function kitFaltan(p = P()) {
  const out = Object.entries(DRONES_EJEMPLO.madera).filter(([, id]) => !PT.libres(p, id).length).map(([slot, id]) => ({ ranura: PT.RANURA[slot], id, n: 1 }));
  if (!PT.cautinDe(p, cat)) out.push({ ranura: "soldadura", id: "cautin_lapiz", n: 1 });
  for (const [k, id, min] of [["estano", "estano", 3], ["flux", "flux", 1.5], ["cable", "cables", 2]]) if (PT.insumo(p, k) < min) out.push({ ranura: "soldadura", id, n: 1 });
  return out;
}
const kitCosto = () => kitFaltan().reduce((s, x) => s + PT.precioDe(P(), pieza(cat, x.ranura, x.id)) * x.n, 0);   // lo mismo que cobra comprarCarrito (con impresora, el chasis sale más barato)
/** El regalo de mamá: el kit del garaje gratis (llega en cajas a la mesa) en un dron nuevo. */
const regaloMama = () => armarKit({ regalo: true });
function armarKit({ regalo = false } = {}) {
  const p = P(), faltan = kitFaltan(p);
  const err = PT.comprarCarrito(p, cat, faltan, { envio: true, regalo });
  if (err) { toast(err); return; }
  // un nombre que no esté en el hangar (el segundo kit era otro «Madera» y no se distinguían)
  let nombre = t("Madera");
  for (let k = 2; p.drones.some((x) => x.nombre === nombre); k++) nombre = `${t("Madera")} ${k}`;
  const d = PT.nuevoDron(p, nombre, regalo ? t("El regalo de mamá") : t("El primer dron: videos de casas"));
  avisoRutaDron(d);
  d.estilo = { ...PT.ESTILO };
  for (const [slot, id] of Object.entries(DRONES_EJEMPLO.madera)) PT.instalar(p, d, slot, id);
  guardar();
  G.izq = "dron";
  verDron("chasis");
  renderTaller();
  if (faltan.length) garaje.paquete();
  return d;
}

function renderEditor() {
  const p = P(), d = D(), et = PT.etapa(p), box = $("ranuras");
  box.innerHTML = "";
  const head = document.createElement("div");
  head.innerHTML = `<button class="back">${t("← Hangar")}</button><input class="nombre-in" maxlength="30" aria-label="${t("Nombre del dron")}" value="${esc(d.nombre)}"><input class="prop-in" maxlength="60" aria-label="${t("Para qué es")}" placeholder="${t("¿Para qué es este dron?")}" value="${esc(d.proposito || "")}"><div class="chips" style="margin:6px 0 2px">${chipsDron(d)}</div>`;
  head.querySelector(".back").onclick = () => { G.izq = "hangar"; renderTaller(); };
  head.querySelector(".nombre-in").onchange = (e) => { d.nombre = e.target.value.trim() || d.nombre; guardar(); };
  head.querySelector(".prop-in").onchange = (e) => { d.proposito = e.target.value.trim(); guardar(); };
  box.appendChild(head);
  for (const [slot, ranura, nombre] of PT.RANURAS) {
    const sec = document.createElement("div");
    sec.className = "ranura";
    sec.innerHTML = `<h3>${t(nombre)}</h3>`;
    const puesta = U(d.slots[slot]);
    // solo lo que tienes en el estante (o la que ya está puesta): comprar es en 💻 Computador → Tienda
    let hay = 0;
    for (const pz of cat[ranura]) {
      const libres = PT.libres(p, pz.id).length, es = puesta?.id === pz.id, bloq = false;
      if (!es && !libres) continue;
      hay++;
      const b = document.createElement("button");
      b.className = "op" + (es ? " puesta" : "") + (bloq ? " bloq" : "");
      const precio = PT.precioDe(p, pz);
      const tag = es ? `<span class='tag ok'>${t("Puesta")}</span>` : `<span class='tag'>${t("Usar")} <span class="muted">(${libres > 1 ? t("{n} libres", { n: libres }) : t("{n} libre", { n: libres })})</span></span>`;
      b.innerHTML = `<b>${pz.nombre}</b>${tag}<small>${descr(ranura, pz)}${es && puesta.vida < 100 ? ` · <span class="vida">${t("{n} % de vida", { n: puesta.vida })}</span>` : ""}</small>`;
      b.onmouseenter = () => { G.hover = { slot, id: pz.id }; renderStats(); };
      b.onmouseleave = () => { G.hover = null; renderStats(); };
      b.onclick = () => {
        if (bloq) { toast(t("Se desbloquea con {n} de reputación.", { n: PT.REP_ETAPA[pz.etapa] })); return; }
        if (es) return;
        const err = PT.instalar(p, d, slot, pz.id);
        if (err) { toast(err); return; }
        guardar();
        verDron(slot);
        renderTaller();
      };
      sec.appendChild(b);
    }
    if (!hay) sec.insertAdjacentHTML("beforeend", `<p class="muted vacio">${t("No tienes ninguna en el estante: cómprala en 💻 Computador → Tienda.")}</p>`);
    box.appendChild(sec);
  }
  const sec = document.createElement("div");
  sec.className = "ranura";
  sec.innerHTML = `<h3>${t("Extras (se pueden poner varios)")}</h3>`;
  for (const pz of cat.extras) {
    const puesto = d.extras.some((u) => U(u)?.id === pz.id), libres = PT.libres(p, pz.id).length, bloq = false;
    if (!puesto && !libres) continue;
    const b = document.createElement("button");
    b.className = "op" + (puesto ? " puesta" : "") + (bloq ? " bloq" : "");
    b.innerHTML = `<b>${pz.nombre}</b>${puesto ? `<span class='tag ok'>${t("Puesto")}</span>` : libres ? `<span class='tag'>${t("Poner ({n})", { n: libres })}</span>` : bloq ? `<span class='tag muted'>${t("rep. {n}", { n: PT.REP_ETAPA[pz.etapa] })}</span>` : `<span class='tag money'>${t("comprar ${n}", { n: pz.precio })}</span>`}<small>${descr("extras", pz)}</small>`;
    b.onclick = () => {
      if (bloq) { toast(t("Se desbloquea con {n} de reputación.", { n: PT.REP_ETAPA[pz.etapa] })); return; }
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
  ps.innerHTML = `<h3>${t("Pintura")}</h3>`;
  const est = d.estilo || (d.estilo = { ...PT.ESTILO });
  for (const [titulo, key] of [[t("Chasis"), "color"], [t("Detalles"), "acento"]]) {
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
  ps.insertAdjacentHTML("beforeend", `<small class='muted' style='display:block;margin:4px 6px;line-height:1.4'>${t("La forma del chasis (o tu propio STL) y la carcasa se eligen en el <b>banco</b>, al imprimir.")}</small>`);
  box.appendChild(ps);
  // pie del editor
  const pie = $("taller-pie");
  pie.innerHTML = "";
  const btn = (txt, cls, fn) => { const b = document.createElement("button"); b.className = "btn " + cls; b.innerHTML = txt; b.onclick = fn; pie.appendChild(b); return b; };
  const e = estadoDe(d);
  btn(e.listo ? t("Banco de armado ✓") : t("Banco de armado"), "main", () => abrirBanco());
  btn(t("Vuelo de prueba"), "ghost small", () => startVuelo(null, "yo"));
  const armando = TU.pcCerrado(p);                 // el tutorial: mientras armas el regalo, solo el banco y el vuelo de prueba
  if (!armando) btn(p.modo === "dev" ? t("Entrenar en el Estudio") : t("Entrenar su IA"), "ai small", () => { LAB.drone = d.id; abrirLab(); });
  // los tres botones de la IA: cómo va (mejor y peor intento), una prueba ahora (sin pedido), y los pedidos
  const alDron = () => { show("taller"); G.izq = "dron"; verDron(); renderTaller(); };   // al cerrar, de vuelta a este dron
  if (!armando) btn(t("Avance del modelo"), "ghost small", () => sim.abrirAvance(d.modelo || null, alDron, { preguntar: true })).title = t("El mejor y el peor intento que ha tenido entrenando");
  if (!armando) btn(t("Simular prueba"), "ghost small", () => sim.abrirSimular(d.modelo || null, alDron, { preguntar: true })).title = t("Una prueba al azar como las del entrenamiento, con la última generación (no da plata ni daña el dron)");
  if (!armando) btn(t("Pedidos"), "main small", () => { P().activo = d.id; guardar(); abrirPC("campana"); });
  const rep = PT.costoReparar(p, cat, d);
  if (rep > 0) btn(rep > p.plata && PT.rotas(p, d).length ? t("Arreglo casero (gratis)") : t("Reparar (${n})", { n: rep }), "ghost small", () => repararDron(d));
  btn(t("Desarmar"), "ghost small", async () => {
    if (!(await confirmar(t("¿Desarmar \"{nombre}\"? Sus piezas vuelven al estante (su IA no se borra).", { nombre: d.nombre }), { si: t("Desarmar"), peligro: true }))) return;
    PT.borrarDron(p, d.id); guardar(); G.izq = "hangar"; verDron(); renderTaller();
  });
}

function repararDron(d) {
  const p = P();
  if (PT.costoReparar(p, cat, d) > p.plata && PT.rotas(p, d).length) {
    PT.arregloCasero(p, d); guardar();
    toast(t("No te alcanza para repuestos: lo arreglaste con cinta y pegamento (las piezas rotas quedan al 40 %)."), 5000);
  } else {
    const err = PT.reparar(p, cat, d);
    if (err) { toast(err); return; }
    guardar(); toast(t("Dron reparado: como nuevo."));
  }
  renderTaller();
}

const STATS = [
  [t("Peso"), (s) => s.masa_g, (v) => `${v} g`, 1200, true],
  [t("Empuje/peso"), (s) => s.twr, (v) => fmt(v, 2), 8, false],
  [t("Vuelo"), (s) => s.minutos, (v) => `${fmt(v)} min`, 12, false],
  [t("Vel. máxima"), (s) => s.velMax * 3.6, (v) => `${Math.round(v)} km/h`, 60, false],
  [t("Agilidad"), (s) => s.attResp, (v) => fmt(v), 12, false],
  [t("Cámara"), (s) => s.calidad, (v) => `${v} / 100`, 100, false],
  [t("Nitidez"), (s) => s.nitidez * 100, (v) => `${Math.round(v)} %`, 100, false],
  [t("Alcance radio"), (s) => Math.min(s.alcance_m, 2000), (v) => (v >= 1000 ? `${fmt(v / 1000)} km` : `${Math.round(v)} m`), 100, false],
];

function renderStats() {
  const p = P(), d = D(), el = $("stats");
  if (!d) { $("dron-nombre").textContent = t("Sin drones"); el.innerHTML = `<p class='muted' style='margin:0'>${t("Crea un dron en el hangar.")}</p>`; $("errores").textContent = ""; return; }
  const b = PT.build(p, d);
  const prev = G.hover ? { ...b, [G.hover.slot]: G.hover.id } : null;
  const full = (x) => PT.RANURAS.every(([slot]) => x[slot]);
  const st = full(b) ? calcular(b, cat) : null;
  const sp = prev && full(prev) ? calcular(prev, cat) : null;
  if (!st && !sp) {
    const falta = PT.RANURAS.filter(([slot]) => !b[slot]).map((r) => t(r[2]).toLowerCase());
    el.innerHTML = `<p class="muted" style="margin:0;font-size:14.5px;line-height:1.45">${t("Le falta: {lista}.", { lista: falta.join(", ") })}<br>${t("Pasa el ratón por una pieza para ver cómo quedaría.")}</p>`;
    $("errores").textContent = "";
    $("dron-nombre").textContent = t("{nombre} (sin armar)", { nombre: d.nombre });
    return;
  }
  const show_ = sp || st;
  $("dron-nombre").textContent = sp ? t("Así quedaría") : d.nombre;
  el.innerHTML = STATS.map(([name, get, f, max, lowerBetter]) => {
    const v = show_.masa_g ? get(show_) : 0, v0 = st?.masa_g ? get(st) : null;
    const dd_ = sp && v0 !== null ? v - v0 : 0;
    const better = lowerBetter ? dd_ < 0 : dd_ > 0;
    const dd = sp && v0 !== null && Math.abs(dd_) > 1e-6 ? `<span class="d ${better ? "ok" : "bad"}">${dd_ > 0 ? "▲" : "▼"}</span>` : "";
    return `<div class="stat"><span>${name}</span><span class="bar"><i ${sp ? "class='prev'" : ""} style="width:${Math.min(100, (v / max) * 100)}%"></i></span><output>${dd} ${f(v)}</output></div>`;
  }).join("") + `<div class="stat"><span>${t("Costo")}</span><span></span><output class="money">$${show_.precio ?? 0}</output></div>`;
  const ay = new Set(show_.ayudas || []);
  el.innerHTML += `<div class="ayudas"><span class="chip ${ay.has("altura") ? "on" : ""}">${t("Mantener altura")}</span><span class="chip ${ay.has("frenar") ? "on" : ""}">${t("Frenar solo")}</span><span class="chip ${ay.has("ia") ? "on" : ""}">${t("Chip de IA")}</span>${show_.gimbal ? `<span class='chip on'>${t("Gimbal")}</span>` : ""}</div>`;
  const errs = [...(show_.errores || [])];
  if (show_.escCorto) errs.push(t("El ESC da menos corriente que la que piden los motores: el empuje se queda corto."));
  if (!sp && st && PT.rotas(p, d).length) errs.push(t("Tiene piezas rotas: repáralo antes de volar."));
  if (!sp && st?.ok && st.twr < 1.6) errs.push(t("Empuje/peso {twr}: vuela, pero muy justo (lento para subir y frenar). Más empuje: otros motores, hélices más grandes o menos peso.", { twr: fmt(st.twr, 2) }));
  $("errores").textContent = errs.join(" ");
}

const REP_FALLA_IA = 2;     // la IA no entregó el video (faltaron tomas, se estrelló, batería): el cliente se queja

function puedeVolar(d = D(), ia = false) {
  const p = P(), a = PT.dronArmado(p, cat, d);
  if (!a) return t("Primero arma el dron: una pieza de cada ranura.");
  if (!a.stats.ok) return a.stats.errores.join(" ");
  if (PT.rotas(p, d).length) return t("Tiene piezas rotas: repáralo antes de volar.");
  const e = estadoDe(d);
  if (!e.listo) return t("Termínalo en el banco de armado: falta \"{paso}\".", { paso: e.pasos.find((x) => !x.ok).nombre }) + ` ${e.pasos.find((x) => !x.ok).nota}`;
  return null;            // la IA vuela siempre (la que tenga, o la base): si lo hace mal, el cliente se queja
}
/** Con qué IA vuela el dron: la suya si tiene un modelo guardado, si no la base (una partida nueva no la tiene: null). */
function slugIA(d) { return d?.modelo && G.ias[d.modelo] ? d.modelo : PT.enCero(P()) ? null : "base"; }
/** Antes de que vuele la IA: se carga sola en el dron (la última versión), como si la bajaras del portátil. */
function cargarIAenDron(d) {
  const slug = slugIA(d), I = G.ias[slug], gen = I?.meta?.generaciones;
  if (!I) return;
  const B = d.banco || (d.banco = {});
  if (B.ia?.modelo !== slug || (gen !== undefined && B.ia.gen !== gen)) { B.ia = { modelo: slug, gen }; guardar(); toast(t("Cargué la IA \"{slug}\" (generación {gen}) en {nombre}.", { slug, gen: gen ?? "?", nombre: d.nombre }), 3000); }
}

/** La IA con la que sale un dron de la flota (flota.js): la suya o la base, cargada en el dron sin avisar. */
async function iaDe(d) {
  if (d.modelo) await loadModel(d.modelo);          // siempre la última: la de memoria puede ser de hace 60 generaciones
  if (G.ias.base === undefined && !PT.enCero(P())) await loadModel("base");
  const slug = slugIA(d), I = G.ias[slug];
  if (!I) return null;
  const gen = I.meta?.generaciones;
  (d.banco || (d.banco = {})).ia = { modelo: slug, gen };
  return { slug, gen, policy: I.policy };
}

// ---------------- el banco ----------------
const ctx = { escenarios: escen, software: softw, G, cat, PT, BA, $, fmt, esc, toast, descr, api, guardar, modal, show, D, U, estadoDe, dronVista, verDron, get garaje() { return garaje; },
  renderTaller, irTaller, infoModelo, loadModelos, abrirLab: () => abrirLab(), canvas };
const banco = initBanco(ctx);
ctx.tutorial = () => TU.activo(P());        // la mesa señala dónde va cada cable mientras dura el tutorial
const notas = initNotas({ P: () => P(), guardar: () => guardar(), alSaltar: () => { const N = P()?.negocio; if (N?.espera) { NG.primerCliente(P(), ND); guardar(); } } });
/** Mientras armas el regalo, el computador (y todo lo que se abre desde él) está cerrado. */
function pcCerrado() {
  if (!TU.pcCerrado(P())) return false;
  toast(t("🔧 Primero arma tu dron: el computador se prende cuando vuele."), 3500);
  return true;
}
function abrirPC(app) { if (!pcCerrado()) estudio.abrir(app); }
ctx.abrirPC = abrirPC;
ctx.historia = historia;                     // los diálogos de la historia (el ⭐ modelo base, en Simuladores)
/** El tutorial avanza solo: el dron ya vuela -> el computador; compraste los 2 programas -> el modelo; el modelo llega
 *  a 80 % -> el primer cliente. */
let tutoModelosT = 0, tutoModelo = null, tutoPc = false;
function avanzarTutorial(p) {
  const E = TU.etapa(p);
  if (E === "armar" && p.drones.some((x) => !puedeVolar(x))) {
    TU.pasarA(p, "pc"); guardar(); sfx("listo");
    toast(t("🎉 ¡Tu dron vuela! Prende el 💻 computador."), 4500);
  }
  if (E === "pc" && SW.instalado(p, "mensajes") && SW.instalado(p, SW.entrenar(p)) && !tutoPc) {
    tutoPc = true;
    loadModelos().then(() => {
      p.tuto.antes = Object.fromEntries(G.modelos.map((m) => [m.slug, m.gen || 0]));   // lo entrenado antes no cuenta
      TU.pasarA(p, "modelo"); tutoPc = false; guardar(); sfx("listo");
    });
  }
  if (E !== "modelo") { tutoModelo = null; return; }
  const PI = TU.pasoIA(p);                           // 🛫 E1 despegar (nivel 19) y después 📍 E2 ir a un punto (nivel 20)
  if (Date.now() - tutoModelosT > 8000) {
    tutoModelosT = Date.now();
    loadModelos().then(async () => {
      if (TU.pasoIA(p) !== PI) return;               // ya cambió de paso mientras cargaba
      let mejor = TU.exitoFoto(G.modelos, p.tuto.antes, PI.nivel);        // lo del entrenamiento (si el servidor no evalúa)
      for (const c of TU.candidatosFoto(G.modelos, p.tuto.antes, PI.nivel)) {   // la nota de verdad: sin ruido, 20 intentos fijos
        try {
          const r = await (await fetch(`/api/evaluar?modelo=${c.slug}&nivel=${PI.nivel}&n=20`)).json();
          if (r.ok && (!mejor || mejor.slug === c.slug || r.exito > mejor.exito)) mejor = { slug: c.slug, exito: r.exito, filas: c.filas };
        } catch { /* sin servidor: queda lo del entrenamiento */ }
      }
      tutoModelo = mejor;
    });
  }
  if (tutoModelo && tutoModelo.exito >= TU.META_EXITO) {
    const m = tutoModelo, x = Math.round(m.exito * 100);   // renderTaller vuelve a pasar por aquí y lo limpia
    tutoModelo = null;
    ESC.aprobar(p, m.slug, PI.id);                   // aprobó el examen de ese escenario (🎓 en Simuladores)
    if (PI.id === "despegar") {
      p.tuto.e1 = m.slug;
      p.tuto.antes = Object.fromEntries(G.modelos.map((y) => [y.slug, y.gen || 0]));   // lo de antes no cuenta para E2
      guardar(); sfx("listo");
      historia(t("🎓 ¡Tu IA ya vuela!"), t("«{m}» aprobó <b>Despegar y quedarse</b> con {x} %. Ahora enséñale a <b>ir a un punto</b> y mirar hacia donde le pidas. No empieces de cero: parte de «{m}» (desde=), que ya sabe volar, y va a aprender mucho más rápido.", { m: esc(m.slug), x }));
      return;
    }
    TU.pasarA(p, "cliente");
    if (p.negocio?.espera) NG.primerCliente(p, ND);
    guardar(); sfx("listo"); renderTaller();
    historia(t("¡Tu IA ya sabe llegar y mirar!"), t("«{m}» aprobó <b>Ir a un punto</b> con {x} %: ya puede hacer una foto fácil. Justo en ese momento vibra el teléfono… <b>te escribió tu primer cliente</b> (nivel 0). Míralo en 💻 Computador → Mensajes.", { m: esc(m.slug), x }));
  }
}
/** Las notas del tutorial según dónde estás (cada medio segundo; notas.js solo redibuja si cambian). */
/** La demo, después del tutorial: la nota 🎯 que lleva al segundo dron y a la finca (demo.js pista). */
function pistaDemo(p) {
  const fin = mis.pedidos.find((x) => x.id === DM.FINAL);
  const sirven = fin ? p.drones.filter((d) => { const st = PT.dronArmado(p, cat, d)?.stats; return st?.ok && !puedeVolar(d) && REQ.cumple(fin.requisitos || {}, st, {}).ok && st.alcance_m >= DM.ALCANCE_FINCA; }).map((d) => d.nombre) : [];
  const html = DM.pista(p, { finca: !!p.negocio?.ofrecidos?.includes(DM.FINAL), sirven, e6: ESC.tiene(p, DM.HASTA) }, t);
  return html ? [{ id: "demo", fija: true, saltable: false, html }] : [];
}

/** El final de la demo: lo que lograste + el juego completo (al comprar un simulador de después de E6). */
function finDemo() {
  const p = P();
  if (!p.demoFin) { p.demoFin = { dia: p.negocio?.dia ?? 0, t: Date.now() }; guardar(); }
  const gen = Math.max(0, ...G.modelos.filter((m) => m.slug !== "base").map((m) => m.gen || 0));
  const dato = (ic, v, l) => `<div><span>${ic}</span><b>${v}</b><small>${l}</small></div>`;
  $("demo-fin-c").innerHTML = `<div class="df-eyebrow">${t("Fin de la demo")}</div><h2>${t("¡Lo lograste! 🎉")}</h2>` +
    `<p>${t("Empezaste con un dron de madera en cajas y terminaste con {n} drones y una IA que vuela sola.", { n: p.drones.length })}</p>` +
    `<div class="df-datos">${dato("🚁", p.drones.length, p.drones.map((d) => esc(d.nombre)).join(" · "))}${dato("📅", p.negocio?.dia ?? 1, t("días de negocio"))}` +
    `${dato("💰", "$" + p.plata, t("en la cuenta"))}${gen ? dato("🧠", gen, t("generaciones de tu IA")) : ""}${dato("📦", p.negocio?.hechos ?? 0, t("pedidos entregados"))}</div>` +
    `<h3>${t("En el juego completo")}</h3><ul class="df-lista">` +
    [t("🎮 Los simuladores E7 a E12: bosque de columnas, viento, postes, entregas, carreras y persecución"),
      t("🍽️ El restaurante, el concesionario y los capítulos 2 a 5 de la historia"),
      t("📦 Entregas de paquetes entre edificios"),
      t("🏁 Carreras contra la IA que tú entrenaste"),
      t("🤖 Una flota grande que trabaja sola mientras duermes")].map((x) => `<li>${x}</li>`).join("") + "</ul>" +
    `<div class="df-b"><a class="btn main" href="${DM.STEAM_URL}" target="_blank" rel="noopener">⭐ ${t("Agregar a mi lista de deseos en Steam")}</a>` +
    `<a class="btn ghost" href="${DM.WEB_URL}" target="_blank" rel="noopener">🌐 ${t("La web del juego")}</a>` +
    `<button class="btn ghost" id="b-demo-seguir">${t("Seguir jugando")}</button></div>` +
    `<p class="muted df-pie">${t("Tu partida queda guardada: puedes seguir haciendo pedidos con lo que tienes.")}</p>`;
  $("b-demo-seguir").onclick = () => modal("demo-fin", false);
  sfx("listo");
  modal("demo-fin");
}
ctx.finDemo = finDemo;

function notasTutorial() {
  const p = P();
  if (p) $("b-computador").classList.toggle("bloq", TU.pcCerrado(p));
  if (p && G.screen !== "inicio" && !TU.activo(p) && $("historia").classList.contains("hidden") && !$("dialogo")) { notas.poner(pistaDemo(p)); return; }
  if (!p || G.screen === "inicio" || !TU.activo(p) || !$("historia").classList.contains("hidden") || $("dialogo")) { notas.poner([]); return; }
  avanzarTutorial(p);
  const d = D(), e = d && estadoDe(d), m = ctx.mesa?.abierta ? ctx.mesa.estadoTuto() : null;
  const s = {
    drones: p.drones.map((x) => x.nombre), ide: G.screen === "estudio" ? estudio.estadoTuto() : null,
    pantalla: m ? "mesa" : !$("lab").classList.contains("hidden") ? "lab" : G.screen, izq: G.izq, modelo: tutoModelo, hayDron: p.drones.length > 0, dronListo: p.drones.some((x) => !puedeVolar(x)), dron: d?.nombre,
    banco: e && { falta: e.pasos.find((x) => !x.ok)?.k || null, cablearOk: !!e.pasos.find((x) => x.k === "cablear")?.ok },
    mesa: m, estante: !$("estante").classList.contains("hidden"),
    apps: { abierta: !document.querySelector('.es-win[data-w="apps"]')?.hidden, mensajes: SW.instalado(p, "mensajes"), entrenar: SW.instalado(p, SW.entrenar(p)) },
  };
  notas.poner(TU.notas(p, s));
  estudio.marcar(TU.lineaTuto(p, s));               // 👉 en el margen del editor: la línea que hay que cambiar
}
setInterval(notasTutorial, 500);

// ---------------- el reloj del negocio (NG.tick): un día despierto = 30 min jugando ----------------
// Corre mientras juegas (no en el inicio, ni en pausa, ni con la ventana minimizada). Los pedidos llegan a su hora y a
// las 23:00 el día se termina solo (vuela la flota, empieza el siguiente); si estás volando, espera a que aterrices.
let relojN = 0;
{ const g = document.querySelector("#reloj-mini .rm-marcas");          // las 12 marcas de la carátula
  for (let i = 0; i < 12; i++) { const a = (i / 12) * 2 * Math.PI, r0 = i % 3 ? 15 : 13.5; g.insertAdjacentHTML("beforeend", `<line x1="${20 + Math.sin(a) * r0}" y1="${20 - Math.cos(a) * r0}" x2="${20 + Math.sin(a) * 16.5}" y2="${20 - Math.cos(a) * 16.5}"/>`); } }
/** El relojito: arriba de la ficha del dron en el garaje y arriba al centro volando. */
function pintarReloj() {
  const p = P(), el = $("reloj-mini"), ver = NG.relojCorre(p) && (G.screen === "taller" || G.screen === "vuelo");
  el.classList.toggle("hidden", !ver);
  celular.pintarHora();
  if (!ver) return;
  const h = NG.hora(p, ND), R = NG.reloj(ND);
  $("rm-hora").textContent = NG.fmtHora(h);
  $("rm-dia").textContent = t("Día {n}", { n: p.negocio.dia }) + (h >= R.duerme - 1 ? " · " + t("a dormir pronto") : "");
  $("rm-sol").textContent = h < 18 ? "☀️" : h < 20 ? "🌇" : "🌙";
  el.classList.toggle("tarde", h >= R.duerme - 1);
  $("rm-h").setAttribute("transform", `rotate(${((h % 12) / 12) * 360} 20 20)`);
  $("rm-m").setAttribute("transform", `rotate(${(h % 1) * 360} 20 20)`);
  if (G.screen === "vuelo") Object.assign(el.style, { left: "50%", transform: "translateX(-50%)", top: "14px", right: "auto", bottom: "auto" });
  else { const r = $("taller-der").getBoundingClientRect(); Object.assign(el.style, { left: "auto", transform: "none", top: "auto", right: `${innerWidth - r.right}px`, bottom: `${innerHeight - r.top + 10}px` }); }
}
setInterval(() => {
  const p = P();
  if (!p?.negocio || document.hidden || G.screen === "inicio" || !$("pausa").classList.contains("hidden") || G.durmiendo || window.__fsAbierto) { $("reloj-mini").classList.add("hidden"); return; }
  const r = NG.tick(p, ND, 1);
  if (!r) return;
  pintarReloj();
  for (const pe of r.nuevos) toast(t("💬 {cliente}: {titulo}", { cliente: NG.cliente(ND, pe.cliente).nombre, titulo: pe.titulo }), 4000);
  if (r.nuevos.length) { if (celular.abierto()) celular.render(); guardar(); }
  if (r.dormir && G.screen !== "vuelo") { G.durmiendo = true; celular.terminarDia(true).finally(() => { G.durmiendo = false; pintarReloj(); }); return; }
  if (++relojN % 15 === 0) guardar();
}, 1000);
$("b-lab-volar").onclick = () => abrirFreestyle();     // 🎮 Volar mientras entrena: el entrenamiento sigue en el servidor
ctx.ent = ent; ctx.mis = mis; ctx.P = () => P(); ctx.dronParaEntrenar = (d) => dronParaEntrenar(d);
ctx.mesa = initMesa(ctx);                   // la mesa de trabajo: abrir cajas, montar, atornillar, soldar
ctx.abrirGuia = () => banco.abrirGuia();
ctx.alCerrarMesa = () => abrirBanco();
const estudio = initEstudio(ctx);
ctx.renderer = renderer; ctx.urlModelo = urlModelo;
const sim = initSim(ctx);
ctx.abrirAvance = (slug, volver) => sim.abrirAvance(slug, volver);
ctx.abrirSimular = (slug, volver) => sim.abrirSimular(slug, volver);
$("b-estudio").onclick = () => abrirPC();
$("b-computador").onclick = () => abrirPC();
$("b-estante").onclick = () => tienda.abrirEstante();
// tocar el portátil de la mesa del garaje también abre el computador
canvas.addEventListener("click", (ev) => {
  if (G.screen !== "taller" || !garaje.portatil) return;
  const r = canvas.getBoundingClientRect(), rc = new THREE.Raycaster();
  rc.setFromCamera(new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1), garaje.camera);
  if (rc.intersectObject(garaje.portatil, true).length) abrirPC();
});
ctx.ND = ND;
ctx.abrirTablero = () => { renderTablero(); modal("tablero"); };
ctx.abrirVideos = () => { renderVideos(); modal("videos"); };
ctx.abrirControles = () => { syncControls(); modal("controles"); };
ctx.irMenu = () => { show("inicio"); renderInicio(); };
ctx.salir = salirDelJuego;
ctx.kit = { faltan: () => kitFaltan(), costo: () => kitCosto(), comprar: () => armarKit() };     // la tienda vende el Kit del garaje
/** El Laboratorio con una misión elegida (desde 🎮 Simuladores). */
ctx.labMision = (id) => {
  const m = ent.misiones.find((x) => x.id === id);
  if (!m) return;
  LAB.mision = m.id; LAB.premios = { ...m.premios }; LAB.viento = m.viento;
  const e = ESC.deMision(escen, id), desde = e && ESC.desdePara(P(), escen, e.id, (s) => G.todos.some((x) => x.slug === s));
  if (desde) LAB.baseDe = desde;                     // parte del modelo que aprobó el escenario anterior (o del ⭐ base)
  saveLab();
};
const celular = initCelular({ ...ctx, ND, P: () => P(), openBrief: (pe) => openBrief(pe), misPedido: (id) => mis.pedidos.find((x) => x.id === id), fotos: G.fotos, iaDe, friasDe: (d) => friasDe(d) });
$("b-celular").onclick = () => { if (pcCerrado()) return; celular.abrir(); };
ctx.celular = celular;                     // el Estudio lo abre como la app Mensajes
ctx.esDev = () => P()?.modo === "dev";
const tienda = initTienda(ctx);
ctx.tienda = tienda;                       // y la tienda y el inventario como apps
/** Las soldaduras frías del dron que se pueden soltar en vuelo (motores y batería; taller.js / banco.cableado). */
function friasDe(d) {
  const pos = { FL: t("adelante izquierda"), FR: t("adelante derecha"), RL: t("atrás izquierda"), RR: t("atrás derecha") };
  return (estadoDe(d).rev.frias || []).map(({ cable }) => {
    const m = cable.map((x) => /^m(FL|FR|RL|RR)\./.exec(x)?.[1]).find(Boolean);
    return m ? { tipo: "motor", txt: pos[m] } : cable.some((x) => x.startsWith("esc.bat")) ? { tipo: "bateria", txt: t("la batería") } : { tipo: "otro", txt: cable[1] };
  });
}
ctx.friasDe = friasDe;
function abrirBanco() { if (!D()) return; show("banco"); verDron(); banco.abrir(); }
ctx.abrirBanco = abrirBanco;
$("b-tienda").onclick = () => tienda.abrirTienda();
$("b-inventario").onclick = () => tienda.abrirInventario();

$("b-menu").onclick = $("b-menu2").onclick = () => { show("inicio"); renderInicio(); };
$("b-pedidos").onclick = () => { renderTablero(); modal("tablero"); };
$("b-cerrar-tablero").onclick = () => modal("tablero", false);
$("b-videos").onclick = () => { renderVideos(); modal("videos"); };
$("b-cerrar-videos").onclick = () => modal("videos", false);

// ---------------- pedidos ----------------
/** Un pedido se puede jugar si tiene lugar y tomas (los demás son el plan: docs/HISTORIA.md). */
const jugable = (pe) => !!(pe.lugar && pe.tomas);
const ESTRELLITAS = (n) => `${"★".repeat(n)}${"☆".repeat(3 - n)}`;

/** El nivel de un pedido: 0 = el del tutorial (Doña Marta); la campaña va 1, 2, 3… en orden (misiones.json). */
function nivelPedido(pe) {
  if (pe?.tutorial) return 0;
  const i = mis.pedidos.findIndex((x) => x.id === pe?.id);
  return i >= 0 ? i + 1 : null;
}
function renderTablero() {
  const p = P(), et = PT.etapa(p), list = $("lista-pedidos");
  list.innerHTML = "";
  for (const cap of mis.capitulos) {
    const abierto = p.rep >= (cap.rep || 0);
    const peds = mis.pedidos.filter((pe) => pe.capitulo === cap.n);
    const h = document.createElement("div");
    h.className = "capitulo" + (abierto ? "" : " cerrado");
    h.innerHTML = `<div class="cap-h"><b>${t("Capítulo {n} · {titulo}", { n: cap.n, titulo: cap.titulo })}</b><span class="muted">${abierto ? cap.empresa : t("se abre con reputación {n}", { n: cap.rep })}</span></div>` +
      (abierto ? `<p class="muted cap-p">${cap.historia}</p>` : "");
    list.appendChild(h);
    if (!abierto && cap.n > PT.etapa(p) + 1) continue;
    for (const pe of peds) {
      const demo = DM.pedidoFuera(pe.id), ok = !demo && pe.etapa <= et && p.rep >= pe.rep_min, play = jugable(pe);
      const b = document.createElement("button");
      b.className = "pedido" + (ok && play ? "" : " bloq");
      const hecho = p.hechos[pe.id] !== undefined ? " · " + t("hecho {estrellas}", { estrellas: ESTRELLITAS(p.hechos[pe.id]) }) : "";
      const why = demo ? "🔒 " + t("En el juego completo") : !play ? t("Próximamente · pide: {lista}", { lista: pe.plan.piezas.join(", ") }) : !ok ? t("Necesita {n} de reputación", { n: pe.rep_min })
        : t("{n} tomas: {lista}", { n: pe.tomas.length, lista: pe.tomas.map((tm) => tm.nombre.toLowerCase()).join(", ") }) + hecho;
      b.innerHTML = `<b><span class="muted">${t("Nivel {n}", { n: nivelPedido(pe) })}</span> · ${pe.titulo}</b><span class="pago money">$${pe.pago}</span><small>${pe.cliente} · ${why}</small>`;
      if (ok && play) b.onclick = () => { modal("tablero", false); openBrief(pe); };
      list.appendChild(b);
    }
  }
}

/** Lo que pide el pedido, con ✓ / ! / ✗ contra el dron (requisitos.js) + lo del taller (piezas rotas, banco). duro = el cliente no acepta sin eso. */
function requisitos(pe, st, shots, d) {
  if (!st) return REQ.requisitos(pe.requisitos, st);
  const req = REQ.requisitos(pe.requisitos || {}, st, { segundos: shots.reduce((a, tm) => a + tm.dur, 0), viento: pe.viento ?? 0, alcance: alcanceNecesario(shots) });
  if (PT.rotas(P(), d).length) req.push(["no", t("Tiene piezas rotas"), true]);
  const e = estadoDe(d);
  if (!e.listo) req.push(["no", t("Sin terminar en el banco: {paso}", { paso: e.pasos.find((x) => !x.ok).nombre.toLowerCase() }), true]);
  const est = pe.estrellas || PT.ESTRELLAS;
  req.push(["", t("Puntaje máximo con este dron: {max} · este cliente da ★ {e1}, ★★ {e2}, ★★★ {e3}", { max: Math.round(75 * st.nitidez + 0.25 * st.calidad), e1: est[0], e2: est[1], e3: est[2] }), false]);
  return req;
}

const nuevaVariante = () => 1 + Math.floor(Math.random() * 999999);   // cada intento, otra ruta (lugares.js tomasVariante)
async function openBrief(pe, mismaRuta = false) {
  if (!mismaRuta || pe.variante == null) pe.variante = nuevaVariante();
  G.pedido = pe;
  const p = P(), d = D();
  $("br-cliente").textContent = pe.cliente;
  const nv = nivelPedido(pe);
  $("br-titulo").textContent = (nv != null ? t("Nivel {n}", { n: nv }) + " · " : "") + pe.titulo;
  const M = mundoLugar(pe.lugar, pe), shots = M.shots;
  pe.viento = M.wind;
  const foto = pe.tipo === "foto" || pe.tipo === "inspeccion";
  // la cabecera: etiquetas en vez de un párrafo (qué, dónde, viento, dificultad, pago)
  const LUG = { casa: t("una casa"), finca: t("la finca El Roble"), restaurante: t("el restaurante La Brasa") };
  $("br-pago").innerHTML = `<b class="money">$${pe.pago}</b><small>${t("con ★★, más con ★★★")}</small>`;
  $("br-chips").innerHTML = [
    foto ? `${pe.tipo === "inspeccion" ? "🔎" : "📷"} ${shots.length === 1 ? t("1 foto") : t("{n} fotos", { n: shots.length })}` : `🎬 ${t("video · {n} tomas", { n: shots.length })}`,
    `📍 ${LUG[pe.lugar] || esc(pe.lugar)}`,
    (pe.viento_dicho ?? M.wind) ? `💨 ${t("viento {v} m/s", { v: fmt(pe.viento_dicho ?? M.wind) })}` : `🍃 ${t("sin viento")}`,   // lo que DIJO el cliente (negocio.js mentir)
    pe.dif ? `<span class="dif" title="${t("Dificultad")}">${"★".repeat(pe.dif)}</span>` : "",
    foto || pe.fijo ? "" : `<span title="${t("Ruta n.º {n}: cada intento las tomas cambian (otro ángulo, otra distancia, otra altura).", { n: pe.variante })}">🔀 ${t("ruta n.º {n}", { n: pe.variante })}</span>`,
  ].filter(Boolean).map((x) => `<span class="chip">${x}</span>`).join("");
  $("br-historia").innerHTML = pe.historia ? `<i>${pe.historia}</i>` : "";
  // con qué dron: los del hangar (un selector, no un párrafo)
  $("br-drones").innerHTML = p.drones.length > 1 ? `<div class="seg br-seg">${p.drones.map((x) => `<button data-d="${x.id}" aria-pressed="${x.id === p.activo}">${esc(x.nombre)}${estadoDe(x).listo ? "" : ` <small class="warn">${t("sin terminar")}</small>`}</button>`).join("")}</div>` : "";
  $("br-drones").querySelectorAll("[data-d]").forEach((b) => (b.onclick = () => { p.activo = b.dataset.d; guardar(); verDron(); openBrief(pe, true); }));
  // las tomas, como fichas en orden
  const ICONO = { fija: "📍", orbita: "🔄", revelar: "↗️" }, NOMBRE = { fija: t("fija"), orbita: t("órbita"), revelar: t("revelar") };
  $("br-tomas").innerHTML = shots.map((tm, i) => `<div class="toma"><span class="n">${i + 1}</span><div><b>${foto ? "📷" : ICONO[tm.tipo] || "🎬"} ${esc(tm.nombre)}</b>` +
    `<small>${foto ? t("quieto {s} s", { s: fmt(tm.dur, 1) }) : `${NOMBRE[tm.tipo] || tm.tipo} · ${fmt(tm.dur, 0)} s`}</small>${tm.desc ? `<p>${tm.desc}</p>` : ""}</div></div>`).join("");
  // cómo se hace: plegado (el que ya sabe no lo vuelve a leer)
  $("br-desc").innerHTML = foto
    ? t("Vuela hasta el aro, entra y <b>quédate quieto</b> con el sujeto <b>al centro</b> del cuadro: a los pocos segundos, clic. ") + t("Una foto con menos de {n} % no sirve.", { n: Math.round(TOMA_OK * 100) })
    : t("Quiere un video en <b>{n} tomas</b>, en orden. Cada toma es una ruta (la línea celeste): ve al aro del inicio, ", { n: shots.length }) +
      t("ahí arranca a grabar sola y el punto blanco avanza; síguelo <b>pegado</b>, con el sujeto <b>al centro</b> del cuadro, a su ritmo y sin sacudidas. ") +
      t("Una toma con menos de {n} % no sirve.", { n: Math.round(TOMA_OK * 100) });
  const a = d && PT.dronArmado(p, cat, d), st = a?.stats;
  const req = requisitos(pe, st, shots, d);
  // cada requisito: lo importante arriba y el porqué (lo que va entre paréntesis) abajo, chiquito
  const partir = (txt) => { const m = /^(.*?)\s*\(([^()]*)\)\s*([.:]?)$/.exec(txt); return m ? `${m[1]}${m[3]}<small>${m[2]}</small>` : txt; };
  $("br-req").innerHTML = req.map(([c, txt]) => `<li class="${c}">${partir(txt)}</li>`).join("");
  const duro = req.filter((r) => r[2]);
  $("b-volar").disabled = $("b-volar-ia").disabled = duro.length > 0 || !st?.ok;
  // la IA: una tarjeta con su estado (✓ / ! / ✗) y qué entrenar
  const ia = $("br-ia"), tipos = tiposDe(pe, shots);
  const mod = d?.modelo, I = mod ? await loadModel(mod) : null;     // la última generación (sigue entrenando mientras juegas)
  const IB = !I && !PT.enCero(P()) ? (G.ias.base === undefined ? await loadModel("base") : G.ias.base) : null;
  const lineas = [];
  let titulo;
  if (!I) {
    titulo = IB ? `${t("IA base")} · ${t("gen {n}", { n: IB.meta.generaciones ?? "?" })}` : t("Sin IA");
    lineas.push(["meh", mod ? t("la IA \"{m}\" todavía no tiene un modelo guardado", { m: esc(mod) }) : t("\"{nombre}\" todavía no tiene IA propia", { nombre: esc(d?.nombre) })]);
    if (PT.enCero(P())) lineas.push(["no", t("Entrénale una IA en el 💻 computador.")]);
    else lineas.push([IB ? "meh" : "no", IB ? t("vuela con la <b>IA base</b> (generación {gen}), que no está entrenada para este dron.", { gen: IB.meta.generaciones ?? "?" }) : t("no encontré ni la IA base.")]);
    if (IB) lineas.push([sabeGrabar(IB, tipos) ? "" : "no", sabeGrabar(IB, tipos) ? t("Ya entrenó estas tomas.") : t("Todavía no entrenó estas tomas: entrénala en el Laboratorio.")]);
    if (!IB) $("b-volar-ia").disabled = true;
  } else {
    const rango = rangoModelo(I.meta), enR = st && st.twr >= rango.twr[0] && st.twr <= rango.twr[1] && st.mass >= rango.masa_kg[0] && st.mass <= rango.masa_kg[1];
    titulo = `${t("IA \"{m}\"", { m: esc(mod) })} · ${t("gen {n}", { n: I.meta.generaciones ?? "?" })}`;
    const sabe = sabePedido(I, mod, pe, tipos);
    lineas.push([sabe ? "" : "no", sabe ? t("Ya entrenó estas tomas.") : t("Todavía no entrenó estas tomas: entrénala en el Laboratorio.")]);
    if (st) lineas.push(enR ? ["", t("Conoce un dron como este.")] : ["meh", t("No conoce un dron así (aprendió con empuje/peso {t0}-{t1} y {m0}-{m1} kg; este: {twr}, {masa} kg).", { t0: fmt(rango.twr[0], 2), t1: fmt(rango.twr[1], 2), m0: fmt(rango.masa_kg[0], 2), m1: fmt(rango.masa_kg[1], 2), twr: fmt(st.twr, 2), masa: fmt(st.mass, 2) })]);
    if (!estadoDe(d).iaOk) lineas.push(["", t("Se carga sola en el dron al despegar.")]);
  }
  ia.innerHTML = `<div class="ia-h">🤖 <b>${titulo}</b></div><ul class="req">${lineas.map(([c, x]) => `<li class="${c}">${partir(x)}</li>`).join("")}</ul>` +
    (pe.entrenar ? `<div class="ia-tip">🎓 <b>${t("Para que lo haga la IA:")}</b> ${pe.entrenar.nota}</div>` : "") +
    `<small class="muted">${foto ? t("Si la IA no entrega las fotos (le faltan o se estrella), pierdes {n} de reputación.", { n: REP_FALLA_IA }) : t("Si la IA no entrega el video (le faltan tomas o se estrella), pierdes {n} de reputación.", { n: REP_FALLA_IA })}</small>`;
  if (duro.length) toast(t("El cliente no acepta: {lista}.", { lista: duro.map((r) => r[1].split(":")[0].toLowerCase()).join(", ") }), 4000);
  modal("brief");
}
$("b-cerrar-brief").onclick = () => modal("brief", false);
$("b-brief-lab").onclick = () => {
  const en = G.pedido?.entrenar, m = en && (ent.misiones.find((x) => x.id === en.mision) ||
    ent.misiones.find((x) => x.nivel === en.nivel && Math.abs((x.viento || 0) - (en.viento || 0)) < 1));
  const falta = simuladorQueFalta(G.pedido);
  if (falta) { modal("brief", false); estudio.abrir("escenarios"); toast(t("Para entrenar esto necesitas el simulador «{e}».", { e: falta.nombre }), 4500); return; }
  if (m && LAB.mision !== m.id) { LAB.mision = m.id; LAB.premios = { ...m.premios }; LAB.viento = m.viento; saveLab(); }
  modal("brief", false); abrirLab();
};
$("b-volar").onclick = () => startVuelo(G.pedido, "yo");
/** ¿La IA puede hacer (paraVolar) o entrenar este pedido? Necesita el simulador de su misión (🎮 Simuladores; para volar
 *  también vale uno que la cubra: "Ir a un punto" hace las fotos fáciles). Devuelve el que falta o null. */
function simuladorQueFalta(pe, paraVolar = false) {
  const m = pe?.entrenar?.mision || (pe?.entrenar?.nivel != null && ent.misiones.find((x) => x.nivel === pe.entrenar.nivel)?.id);
  const puede = paraVolar ? ESC.iaPuede : ESC.puedeEntrenar;
  return m && !puede(P(), escen, m) ? ESC.deMision(escen, m) : null;
}
$("b-volar-ia").onclick = async () => {
  const d = D();
  if (d?.modelo) await loadModel(d.modelo);
  if (!PT.enCero(P()) && !G.ias[slugIA(d)]) await loadModel("base");
  if (!G.ias[slugIA(d)]) { toast(t("«{d}» no tiene IA todavía: entrénala en el 💻 computador.", { d: esc(d?.nombre || "") }), 4500); return; }
  const riesgos = riesgosIA(d, G.pedido);
  if (!riesgos.length) return startVuelo(G.pedido, "ia");
  // nunca se bloquea: se avisa y el jugador decide
  $("aviso-ia-p").innerHTML = `<ul>${riesgos.map((r) => `<li>${r}</li>`).join("")}</ul>` +
    `<p>${t("Si la IA no entrega el trabajo, <b>pierdes {n} de reputación</b>; si choca, <b>el dron se daña</b> y hay que repararlo en el taller.", { n: REP_FALLA_IA })}</p>`;
  modal("aviso-ia");
};
$("b-aviso-ia-si").onclick = () => { modal("aviso-ia", false); startVuelo(G.pedido, "ia"); };
$("b-aviso-ia-no").onclick = () => modal("aviso-ia", false);
/** Por qué la IA de este dron podría fallar este pedido (vacío = está lista). */
function riesgosIA(d, pe) {
  const out = [], slug = slugIA(d), I = G.ias[slug];
  if (!I) return [t("No encontré ninguna IA para este dron.")];
  if (slug === "base" && d?.modelo) out.push(t("La IA \"{m}\" todavía no tiene un modelo guardado: vuela la IA base, que no conoce este dron.", { m: esc(d.modelo) }));
  else if (slug === "base") out.push(t("Este dron no tiene IA propia: vuela la IA base, que no conoce este dron."));
  else if (!(I.meta.generaciones > 0)) out.push(t("La IA \"{m}\" es completamente nueva (sin entrenar).", { m: esc(slug) }));
  // sin el simulador de este trabajo la IA igual puede intentarlo (pedido de Santiago: nunca se bloquea)
  const falta = pe && simuladorQueFalta(pe, true);
  if (falta) out.push(t("No entrenó en el simulador «{e}»: puede que no sepa hacer este trabajo.", { e: falta.nombre }));
  const tipos = pe ? tiposDe(pe, mundoLugar(pe.lugar, pe).shots) : [];
  if (tipos.length && !sabePedido(I, slug, pe, tipos)) out.push(t("Todavía no entrenó estas tomas ({lista}).", { lista: tipos.map((x) => ({ fija: t("fija"), orbita: t("órbita"), revelar: t("revelar"), foto: t("fotos") })[x] || x).join(", ") }));
  const st = PT.dronArmado(P(), cat, d)?.stats, rango = rangoModelo(I.meta);
  if (st && !(st.twr >= rango.twr[0] && st.twr <= rango.twr[1] && st.mass >= rango.masa_kg[0] && st.mass <= rango.masa_kg[1]))
    out.push(t("No conoce un dron como este (empuje/peso {twr}, {masa} kg).", { twr: fmt(st.twr, 2), masa: fmt(st.mass, 2) }));
  return out;
}

// ---------------- laboratorio de IA (cada dron con su modelo; en Blender o en segundo plano) ----------------
const LAB = {
  mision: store.get("lab.mision", "grabar"), azar: store.get("lab.azar", false), n: store.get("lab.n", 50), donde: store.get("lab.donde", "blender"),
  vel: store.get("lab.vel", "rapido"), viento: store.get("lab.viento", 0), premios: store.get("lab.premios", null), baseDe: "cero",
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

async function abrirLab() {
  if (pcCerrado()) return;
  // cada modo con su herramienta: el desarrollador entrena con código (Estudio PBDMM), el normal con el Laboratorio
  if (P()?.modo === "dev") { estudio.abrir(); return; }
  if (!SW.tieneApp(P(), softw, "lab")) { estudio.abrir("lab"); return; }      // sin el 🧠 Simulador de IA: a 🛍️ Apps
  LAB.drone = LAB.drone || P().activo; await loadModelos(); renderLab(); modal("lab"); labPoll(true);
}

function renderLab() {
  const box = $("lab-misiones");
  box.innerHTML = "";
  // las misiones como mosaico (ícono + nombre); la elegida se explica abajo
  const grid = document.createElement("div");
  grid.className = "mosaico";
  // solo se entrenan las misiones de los simuladores que compraste (🎮 Simuladores)
  if (!ESC.puedeEntrenar(P(), escen, LAB.mision)) { const m0 = ent.misiones.find((m) => ESC.puedeEntrenar(P(), escen, m.id)); if (m0) { LAB.mision = m0.id; LAB.premios = { ...m0.premios }; LAB.viento = m0.viento; } }
  for (const m of ent.misiones) {
    const b = document.createElement("button"), e = ESC.deMision(escen, m.id), mia = ESC.puedeEntrenar(P(), escen, m.id);
    b.className = "tile" + (mia ? "" : " bloq");
    b.setAttribute("aria-pressed", String(m.id === LAB.mision));
    b.innerHTML = `<span class="ic">${mia ? m.icono || "🧪" : "🔒"}</span><b>${m.nombre}</b><small>${mia ? `${t("nivel {n}", { n: m.nivel })} · ${m.para}` : t("simulador ${n}", { n: e?.precio ?? "?" })}</small>`;
    b.onclick = () => {
      if (!mia) { toast(t("Esa misión se abre comprando el simulador «{e}» (💻 → 🎮 Simuladores).", { e: e?.nombre || m.nombre }), 4000); return; }
      LAB.mision = m.id; LAB.premios = { ...m.premios }; LAB.viento = m.viento; saveLab(); renderLab();
    };
    grid.appendChild(b);
  }
  box.appendChild(grid);
  const ms = misionLab();
  box.insertAdjacentHTML("beforeend", `<div class="det"><p>${ms.desc}</p><p class="ok">🏁 ${ms.exito}</p></div>`);
  const dbox = $("lab-drones");
  dbox.innerHTML = "";
  for (const d of P().drones) {
    const a = PT.dronArmado(P(), cat, d), st = a?.stats, sel = d.id === labDron()?.id;
    const b = document.createElement("button");
    b.className = "card";
    b.setAttribute("aria-pressed", String(sel));
    b.innerHTML = `<b>${esc(d.nombre)}</b> <span class="muted" style="font-size:12.5px">${d.modelo ? "· " + t("IA \"{m}\"", { m: esc(d.modelo) }) : "· " + t("sin IA")}</span>` +
      (sel ? `<small>${st?.ok ? `${pieza(cat, "chasis", a.build.chasis).nombre} · ${st.masa_g} g · ` + t("empuje/peso {twr}. Su IA aprende a volar exactamente este dron.", { twr: fmt(st.twr, 2) }) : t("Le faltan piezas: ármalo primero.")}</small>` : "");
    b.onclick = () => { LAB.drone = d.id; renderLab(); };
    dbox.appendChild(b);
  }
  if (!P().drones.length) dbox.innerHTML = `<p class='muted' style='font-size:14px'>${t("Crea un dron en el hangar primero.")}</p>`;
  const az = document.createElement("label");
  az.className = "row"; az.style.justifyContent = "flex-start"; az.style.marginTop = "6px";
  az.innerHTML = `<input type="checkbox" ${LAB.azar ? "checked" : ""}> <span style="font-size:13.5px">${t("Física al azar (aprende a volar cualquier dron: sirve si le cambias piezas)")}</span>`;
  az.querySelector("input").onchange = (e) => { LAB.azar = e.target.checked; saveLab(); };
  dbox.appendChild(az);
  // el modelo del dron elegido
  const d = labDron(), mb = $("lab-modelo");
  if (!d) mb.innerHTML = "";
  else if (d.modelo) {
    const m = infoModelo(d.modelo);
    mb.innerHTML = `<div class="card" style="cursor:default"><b>"${esc(d.modelo)}"</b> <span class="muted" style="font-size:12.5px">${m?.tiene_modelo ? t("generación {gen} · {pasos} pasos · tomas: {tomas}", { gen: m.gen ?? 0, pasos: (m.pasos || 0).toLocaleString(idioma()), tomas: (m.tomas || []).join(", ") || t("ninguna") }) : t("todavía sin entrenar")}</span>` +
      `<small>${d.modelo === "base" ? t("Es la IA base (models/modelo.zip): la que venías entrenando. Solo entrena en Blender.") : t("Vive en models/drones/{m}/. Cada vez que entrenes \"{nombre}\" sigue desde aquí.", { m: esc(d.modelo), nombre: esc(d.nombre) })}</small>` +
      `<div class="row" style="justify-content:flex-start;gap:6px;margin-top:6px"><button class="btn ghost small" id="lab-avance">${t("Avance del modelo")}</button><button class="btn ai small" id="lab-simular">${t("Simular prueba")}</button></div></div>`;
    $("lab-avance").onclick = () => { modal("lab", false); labPoll(false); sim.abrirAvance(d.modelo, () => { irTaller(); abrirLab(); }, { preguntar: true }); };
    $("lab-simular").onclick = () => { modal("lab", false); labPoll(false); sim.abrirSimular(d.modelo, () => { irTaller(); abrirLab(); }, { preguntar: true }); };
  } else {
    const otros = G.modelos.filter((m) => m.tiene_modelo !== false);
    if (LAB.baseDe !== "cero" && !otros.some((m) => m.slug === LAB.baseDe)) LAB.baseDe = PT.enCero(P()) ? "cero" : "base";
    mb.innerHTML = `<div class="card" style="cursor:default"><small style="margin:0">${t("\"{nombre}\" todavía no tiene IA. Al empezar a entrenar se crea la suya: <b>\"{slug}\"</b>.", { nombre: esc(d.nombre), slug: slugDe(d.nombre) })}</small>` +
      `<div class="row" style="margin-top:6px"><span style="font-size:13.5px">${t("Empieza desde")}</span><select id="lab-basede" style="background:var(--moss-solid);color:var(--text);border:1px solid var(--line);border-radius:8px;padding:4px 6px;font:inherit;font-size:13.5px">` +
      otros.map((m) => `<option value="${esc(m.slug)}" ${m.slug === LAB.baseDe ? "selected" : ""}>${m.slug === "base" ? t("la IA base") : t("la IA \"{m}\"", { m: esc(m.slug) })} (${t("gen {n}", { n: m.gen ?? 0 })})</option>`).join("") +
      `<option value="cero" ${LAB.baseDe === "cero" ? "selected" : ""}>${t("desde cero (red nueva)")}</option></select></div></div>`;
    $("lab-basede").onchange = (e) => { LAB.baseDe = e.target.value; };
  }
  document.querySelectorAll("#lab-donde button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === LAB.donde)));
  $("lab-n").value = LAB.n; $("lab-n-o").textContent = LAB.n;
  $("lab-viento").value = LAB.viento; $("lab-viento-o").textContent = fmt(LAB.viento);
  document.querySelectorAll("#lab-vel button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === LAB.vel)));
  // premios y castigos, agrupados (la misión, vuelo, cámara, seguridad, energía); la explicación de cada uno se abre con ⓘ
  const pbox = $("premios");
  pbox.innerHTML = "";
  const GRUPOS = [["mision", "🎯 " + t("La misión")], ["vuelo", "🛩️ " + t("Vuelo")], ["camara", "🎥 " + t("Cámara")], ["seguridad", "🛡️ " + t("Seguridad")], ["energia", "🔋 " + t("Energía")]];
  const nv = misionLab().nivel, fila = (pr) => {
    const v = LAB.premios[pr.k] ?? 0;
    const row = document.createElement("div");
    row.className = "pr";
    // de 0 a 10 (4 = lo normal); el entrenador recibe el valor real (escala_premios de entrenamiento.json)
    const nv10 = Math.min(10, nivelDe(pr.k, v, ent.escala_premios)), rec = nivelDe(pr.k, misionLab().premios[pr.k] ?? 0, ent.escala_premios);
    row.innerHTML = `<button class="pr-n ${pr.tipo}" aria-expanded="false" title="${t("¿Qué es?")}">${pr.tipo === "premio" ? "+" : "−"} ${pr.nombre} <span class="i">ⓘ</span></button><input type="range" min="0" max="10" step="0.5" value="${nv10}" aria-label="${t("{nombre} (0 a 10)", { nombre: pr.nombre })}"><output>${fmt(nv10, nv10 % 1 ? 1 : 0)}</output><small>${pr.desc} <span class="muted">${t("Recomendado: {n}.", { n: fmt(rec, rec % 1 ? 1 : 0) })}</span></small>`;
    const inp = row.querySelector("input"), out = row.querySelector("output"), nb = row.querySelector(".pr-n");
    nb.onclick = () => { const ab = row.classList.toggle("abierto"); nb.setAttribute("aria-expanded", String(ab)); };
    inp.oninput = () => {
      const n10 = Number(inp.value);
      LAB.premios[pr.k] = realDe(pr.k, n10, ent.escala_premios);
      out.textContent = fmt(n10, n10 % 1 ? 1 : 0);
      saveLab();
      clearTimeout(LAB.debounce);                       // entrenando: los cambios llegan en vivo
      LAB.debounce = setTimeout(() => { const tr = trainerDe(labDron()?.modelo); if (tr?.activo) api("/api/lab", { accion: "ajustar", premios: LAB.premios, donde: tr.donde, modelo: labDron().modelo }); }, 400);
    };
    return row;
  };
  const usa = (pr) => !((pr.solo && !pr.solo.includes(nv)) || (pr.no && pr.no.includes(nv)));
  for (const [g, nombre] of GRUPOS) {
    const prs = ent.premios.filter((pr) => (pr.grupo || "mision") === g && usa(pr));
    if (!prs.length) continue;
    pbox.insertAdjacentHTML("beforeend", `<div class="pr-g">${nombre}</div>`);
    for (const pr of prs) pbox.appendChild(fila(pr));
  }
  const off = ent.premios.filter((pr) => !usa(pr));
  if (off.length) {
    const det = document.createElement("details");
    det.className = "mas pr-off";
    det.innerHTML = `<summary>${t("No se usan en esta misión ({n})", { n: off.length })}</summary>`;
    for (const pr of off) { const r = fila(pr); r.classList.add("off"); det.appendChild(r); }
    pbox.appendChild(det);
  }
  renderLabEstado();
}

function renderLabEstado() {
  const e = LAB.estado, bl = e?.blender || {}, d = labDron(), slug = d?.modelo, tr = trainerDe(slug) || {};
  const db = $("lab-blender"), dt = $("lab-trainer");
  const est = bl.estado || (bl.corriendo ? "entrenando" : "esperando");
  db.className = "dot" + (!bl.abierto || est === "error" ? "" : est === "iniciando" || est === "deteniendo" ? " wait" : " on");
  db.textContent = !bl.abierto ? t("Blender cerrado") : `Blender: ${bl.estado_txt || ({ esperando: t("esperando"), iniciando: t("iniciando"), entrenando: t("entrenando"), deteniendo: t("deteniendo"), error: t("error") })[est] || est}${e?.blender_modelo ? ` · "${e.blender_modelo}"` : ""}`;
  dt.className = "dot" + (tr.activo ? (tr.phase === "learn" ? " wait" : " on") : "");
  dt.textContent = tr.activo ? `${tr.donde === "fondo" ? t("Segundo plano") : "Blender"}: ${tr.params?.paused || tr.pausado ? t("en pausa") : tr.phase === "learn" ? t("aprendiendo…") : t("entrenando")}` : t("Sin entrenar");
  $("b-abrir-blender").classList.toggle("hidden", !!bl.abierto);
  $("b-lab-volar").classList.toggle("hidden", !(tr.activo || (e?.fondo || []).some((f) => f.activo)));
  const film = misionLab().nivel >= 11;
  $("lab-gen").textContent = tr.gen ?? "–";
  $("lab-succ").textContent = tr.gen !== undefined ? `${Math.round((tr.succ || 0) * 100)} %` : "–";
  $("lab-crash").textContent = tr.gen !== undefined ? `${Math.round((tr.crash || 0) * 100)} %` : "–";
  $("lab-film").textContent = tr.gen !== undefined && (tr.stage >= 11 || film) ? `${Math.round((tr.film || 0) * 100)} %` : "–";
  $("b-lab-pausa").textContent = tr.params?.paused || tr.pausado ? t("Seguir") : t("Pausar");
  $("b-lab-pausa").disabled = $("b-lab-detener").disabled = !tr.activo;
  $("b-lab-iniciar").textContent = tr.activo ? t("Aplicar y reiniciar") : t("Empezar a entrenar");
  const msgs = [];
  if (!e) msgs.push(t("Conectando con el servidor…"));
  else if (!bl.abierto && LAB.donde === "blender") msgs.push(t("Abre Blender (botón de arriba): el juego le manda el entrenamiento y Blender muestra a los drones aprendiendo. O elige <b>En segundo plano</b>: entrena sin ventana (uno a la vez: si empiezas otro, el anterior guarda y se detiene)."));
  for (const o of e?.otros || []) msgs.push(`<span class="warn">${t("Hay otro entrenamiento corriendo en <b>{carpeta}</b> (nivel {n}). Se reparten el computador (cada uno va más lento).", { carpeta: o.carpeta, n: o.nivel })}</span>`);
  if (bl.abierto && LAB.ultimoPedido && bl.pedido === LAB.ultimoPedido) msgs.push("✓ " + t("Blender recibió tu pedido") + (bl.pedido_txt ? `: ${bl.pedido_txt}` : ""));
  else if (bl.abierto && LAB.ultimoPedido && LAB.ultimoDonde === "blender" && Date.now() - (LAB.pedidoT || 0) > 4000) msgs.push(`<span class="warn">${t("Blender todavía no lee tu pedido (¿el Drone Lab está cargado en esa ventana de Blender?)")}</span>`);
  if (bl.msg) msgs.push(`Blender: ${bl.msg}`);
  if (bl.error) msgs.push(`<span class="bad">${t("Error en Blender: {error}", { error: bl.error })}</span>`);
  if (tr.activo) msgs.push(t("Entrenando la IA <b>\"{m}\"</b> ({donde}) · {mision} · {pasos} pasos · guardada la generación {gen}.", { m: esc(tr.modelo || slug), donde: tr.donde === "fondo" ? t("segundo plano") : "Blender",
    mision: ({ film_fixed: t("Grabar: tomas con ruta"), film_posts: t("Grabar entre postes"), photo: t("Foto"), photo_set: t("Set de fotos"), goal_random: t("metas"), obstacles: t("columnas") })[tr.mision] || tr.mision, pasos: (tr.steps || 0).toLocaleString(idioma()), gen: tr.gen_guardada ?? "–" }));
  if (tr.msg) msgs.push(tr.msg);
  $("lab-msg").innerHTML = msgs.join("<br>");
  // los entrenamientos en segundo plano (cualquier dron)
  const fb = $("lab-fondo");
  const fondo = (e?.fondo || []).filter((f) => f.activo);
  fb.innerHTML = fondo.length ? `<h3>${t("En segundo plano")}</h3>` + fondo.map((f) => `<div class="card" style="cursor:default"><b>"${esc(f.modelo)}"</b> <span class="muted" style="font-size:12.5px">${t("gen {gen} · logradas {s} % · calidad {q} %", { gen: f.gen ?? "–", s: Math.round((f.succ || 0) * 100), q: Math.round((f.film || 0) * 100) })}${f.pausado ? " · " + t("en pausa") : ""}</span>` +
    `<div style="display:flex;gap:6px;margin-top:6px"><button class="btn ghost small" data-p="${esc(f.modelo)}">${f.pausado ? t("Seguir") : t("Pausar")}</button><button class="btn ghost small" data-s="${esc(f.modelo)}">${t("Detener y guardar")}</button></div></div>`).join("") : "";
  fb.querySelectorAll("[data-p]").forEach((b) => (b.onclick = () => api("/api/lab", { accion: "pausar", donde: "fondo", modelo: b.dataset.p })));
  fb.querySelectorAll("[data-s]").forEach((b) => (b.onclick = async () => { const r = await api("/api/lab", { accion: "detener", donde: "fondo", modelo: b.dataset.s }); toast(r.msg || t("Deteniendo…")); }));
  drawLabChart(tr.hist || []);
}

function drawLabChart(h) {
  const c = $("lab-chart"), g = c.getContext("2d"), W = c.width, H = c.height;
  g.clearRect(0, 0, W, H);
  g.strokeStyle = "rgba(234,242,239,0.12)";
  g.lineWidth = 1;
  for (const y of [0.25, 0.5, 0.75]) { g.beginPath(); g.moveTo(0, H * y); g.lineTo(W, H * y); g.stroke(); }
  if (h.length < 2) {
    g.fillStyle = "rgba(157,179,169,0.8)"; g.font = "22px 'Chakra Petch'"; g.fillText(t("La curva de aprendizaje aparece al entrenar"), 20, H / 2 + 8);
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
  g.font = "20px 'Chakra Petch'"; g.fillStyle = "#47f08a"; g.fillText(t("logradas"), 10, 24); g.fillStyle = "#ff5040"; g.fillText(t("choques"), 110, 24);
  if (h.some((r) => r[5] !== null && r[5] !== undefined)) { g.fillStyle = "#ffd23f"; g.fillText(t("calidad"), 205, 24); }
  g.fillStyle = "rgba(157,179,169,0.9)"; g.fillText(t("gen {a} → {b}", { a: h[0][0], b: h[h.length - 1][0] }), W - 190, 24);
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
  if (!d) { toast(t("Crea un dron en el hangar primero.")); return; }
  const fis = dronParaEntrenar(d);
  if (!fis && !LAB.azar) { toast(t("Primero arma un dron que pueda volar."), 3500); return; }
  const nuevo = !d.modelo;
  const slug = d.modelo || (() => { let s = slugDe(d.nombre), k = 2; while (G.todos.some((m) => m.slug === s) && !P().drones.some((x) => x.modelo === s && x.id === d.id)) s = `${slugDe(d.nombre)}_${k++}`; return s; })();
  const bl = LAB.estado?.blender;
  if (LAB.donde === "blender" && slug !== "base" && bl?.abierto && !("modelo" in bl)) {     // Blender con el drone_lab.py de antes: entrenaría la IA base
    toast(t("El Blender abierto tiene el Drone Lab de antes y entrenaría la IA base. Ciérralo (Detener y guardar) y ábrelo otra vez, o elige <b>En segundo plano</b>."), 7000);
    return;
  }
  // Blender cerrado: el pedido se quedaba esperando a Blender (y el selector «Dónde entrena» queda abajo, fuera de la vista)
  if (LAB.donde === "blender" && slug !== "base" && !bl?.abierto) {
    const fondo = await confirmar(t("Blender no está abierto. ¿Entreno <b>en segundo plano</b> (sin ventana, igual de rápido)? Con Blender ves a los drones aprender en 3D."), { si: t("En segundo plano"), no: t("Esperar a Blender") });
    if (fondo) { LAB.donde = "fondo"; saveLab(); renderLab(); }
  }
  if (LAB.donde === "fondo" && slug === "base") { toast(t("La IA base solo entrena en Blender. Para entrenar en segundo plano, dale a este dron su propia IA (copia de la base)."), 5000); return; }
  // de dónde parte un modelo NUEVO (o uno cuya carpeta aún no existe): solo de un modelo que esta partida ve; una partida
  // nueva no ve la IA base, así que su primer modelo parte de CERO (antes podía quedar "base" y nacía con 3.500 generaciones)
  const sinCarpeta = nuevo || !G.todos.some((m) => m.slug === slug && m.tiene_modelo !== false);
  let baseDe = LAB.baseDe || "cero";
  if (baseDe !== "cero" && !G.modelos.some((m) => m.slug === baseDe && m.tiene_modelo !== false)) baseDe = PT.enCero(P()) ? "cero" : "base";
  const body = { accion: "iniciar", nivel: misionLab().nivel, dron: LAB.azar ? "AZAR" : fis, drones: LAB.n, velocidad: LAB.vel, viento: LAB.viento, premios: LAB.premios,
    modelo: slug, donde: LAB.donde, ...(sinCarpeta ? { base_de: baseDe } : {}) };
  const repaso = ESC.repasoDe(P(), escen, sinCarpeta ? baseDe : slug, body.nivel);   // lo que ya aprobó: lo repasa (20 %)
  if (repaso.length) body.tarea = { repaso };
  const r = await api("/api/lab", body);
  if (r.ok) {
    if (nuevo) d.modelo = slug;
    PT.anotarModelo(P(), slug); guardar();
    LAB.ultimoPedido = r.id; LAB.ultimoDonde = LAB.donde; LAB.pedidoT = Date.now();
    loadModelos().then(renderLab);
    if (r.detenidos?.length) setTimeout(() => toast(t("Un entrenamiento a la vez: {m} guardó y se detuvo.", { m: esc(r.detenidos.join(", ")) }), 4500), 4600);
  }
  toast(r.ok ? (LAB.donde === "fondo" ? t("La IA \"{m}\" empezó a entrenar en segundo plano.", { m: esc(slug) }) : LAB.estado?.blender?.abierto ? t("Pedido enviado: Blender empieza a entrenar") : t("Pedido listo: abre Blender para que empiece")) : r.msg, 4500);
}

$("b-lab").onclick = () => abrirLab();
$("b-lab-cerrar").onclick = () => { modal("lab", false); labPoll(false); if (G.screen === "taller") renderTaller(); };
$("b-lab-iniciar").onclick = labIniciar;
$("b-lab-pausa").onclick = () => { const tr = trainerDe(labDron()?.modelo); if (tr) api("/api/lab", { accion: "pausar", donde: tr.donde, modelo: labDron().modelo }); };
$("b-lab-detener").onclick = async () => { const tr = trainerDe(labDron()?.modelo); if (!tr) return; const r = await api("/api/lab", { accion: "detener", donde: tr.donde, modelo: labDron().modelo }); toast(r.ok ? t("Deteniendo y guardando el modelo…") : r.msg); };
$("b-lab-probar").onclick = () => {
  const pe = mis.pedidos.find((x) => x.entrenar && (x.entrenar.nivel === misionLab().nivel) && Math.abs((x.entrenar.viento || 0) - (misionLab().viento || 0)) < 1) || mis.pedidos[0];
  modal("lab", false); labPoll(false);
  if (labDron()) P().activo = labDron().id;
  openBrief(pe);
};
$("b-lab-rec").onclick = () => { LAB.premios = { ...misionLab().premios }; LAB.viento = misionLab().viento; saveLab(); renderLab(); const tr = trainerDe(labDron()?.modelo); if (tr?.activo) api("/api/lab", { accion: "ajustar", premios: LAB.premios, viento: LAB.viento, donde: tr.donde, modelo: labDron().modelo }); };
$("b-abrir-blender").onclick = async () => { const r = await api("/api/abrir_blender", {}); toast(r.msg, 5000); };
$("lab-n").oninput = (e) => { LAB.n = Number(e.target.value); $("lab-n-o").textContent = LAB.n; saveLab(); };
$("lab-viento").oninput = (e) => {
  LAB.viento = Number(e.target.value); $("lab-viento-o").textContent = fmt(LAB.viento); saveLab();
  const tr = trainerDe(labDron()?.modelo);
  if (tr?.activo) api("/api/lab", { accion: "ajustar", viento: LAB.viento, donde: tr.donde, modelo: labDron().modelo });
};
document.querySelectorAll("#lab-vel button").forEach((b) => (b.onclick = () => {
  LAB.vel = b.dataset.v; saveLab(); renderLab();
  const tr = trainerDe(labDron()?.modelo);
  if (tr?.activo) api("/api/lab", { accion: "ajustar", velocidad: LAB.vel, donde: tr.donde, modelo: labDron().modelo });
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
    quality: G.quality, cat, build: { ...a.build }, stats: a.stats, pedido, piloto, policy: I?.policy || null, ctl: G.ctl, keys: G.keys, frias: friasDe(d),
    videoCanvas: $("vcam"), onToast: toast, onEnd: (r) => onEnd(r),
  });
  G.last = { pedido, piloto, dron: d.id };
  show("vuelo");
  const ay = a.stats.ayudas;
  $("h-who").textContent = piloto === "ia" ? `${d.nombre} · ` + t("la IA \"{m}\" (gen {gen})", { m: slugIA(d), gen: I?.meta?.generaciones ?? "?" }) : `${d.nombre} · ` + t("pilotas tú");
  $("h-tt").textContent = pedido ? pedido.titulo : t("Vuelo de prueba");
  $("h-obj").innerHTML = pedido ? "" : t("Practica: despega, prueba la cámara (R graba) y aterriza en la base para volver.");
  $("keys").innerHTML = (piloto === "ia" ? t("La IA graba sola · ") : `${G.ctl.mouseYaw ? t("Ratón: girar · ") : t("← →: girar · ")}${ay.includes("altura") ? t("Espacio/Shift: subir/bajar") : t("Espacio/Shift: gas")} · ${t("WASD: moverte · ")}`) +
    (pedido ? "" : t("R grabar · ")) + t("C cámara · P pausa · Esc menú") + (piloto === "ia" ? "" : `<br>${ay.includes("altura") ? t("✓ mantiene la altura") : t("✗ sin barómetro: el gas es tuyo")} · ${ay.includes("frenar") ? t("✓ frena solo") : t("✗ no frena solo: contra-inclina con WASD")}`);
  if (piloto !== "ia") toast(ay.includes("altura") ? t("Mantén Espacio para despegar; al soltar se queda a esa altura.") : t("Sin barómetro: Espacio da gas, Shift lo quita. ¡Cuidado!"), 4000);
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
    h.textContent = r.soldadura ? t("Se soltó una soldadura") : r.reason === "limites" ? t("Se salió del área") : r.reason === "suelo" ? t("Se estrelló contra el suelo") : t("Chocó");
    h.className = "bad";
    msg.push(t("Golpe a {v} m/s.", { v: fmt(r.impact) }));
    if (r.soldadura) msg.push(t("Era una soldadura fría ({donde}): repásala en la mesa con flux y calor.", { donde: r.soldadura }));
  } else if (r.dead) {
    h.textContent = r.soldadura ? t("Se soltó una soldadura") : t("Se acabó la batería");
    h.className = "bad";
  } else if (r.failsafe) {
    h.textContent = t("Se perdió la señal");
    h.className = "bad";
    msg.push(t("Tu radio llega a {m} m y el dron se alejó más: aterrizó solo donde estaba. Una antena mejor (o ExpressLRS) lo arregla.", { m: G.vuelo.alcance }));
  } else if (pe && r.completa) {
    h.textContent = r.estrellas >= 2 ? t("¡Al cliente le encantó!") : r.estrellas === 1 ? t("El cliente lo acepta… a medias") : t("Al cliente no le gustó");
    h.className = r.estrellas >= 1 ? "ok" : "bad";
  } else if (pe) {
    const hechas = r.tomas.filter((tm) => tm.lista).length, flojas = r.tomas.filter((tm) => tm.lista && tm.q < TOMA_OK).length;
    h.textContent = hechas < r.tomas.length ? (r.foto ? t("Faltaron fotos") : t("Faltaron tomas")) : r.foto ? t("El cliente no acepta las fotos") : t("El cliente no acepta el video");
    h.className = "bad";
    msg.push(r.foto ? (hechas < r.tomas.length ? t("Tomaste {n} de {m} fotos.", { n: hechas, m: r.tomas.length })
      : flojas === 1 ? t("1 foto quedó floja (menos de {p} %).", { p: Math.round(TOMA_OK * 100) }) : t("{n} fotos quedaron flojas (menos de {p} %).", { n: flojas, p: Math.round(TOMA_OK * 100) }))
      : hechas < r.tomas.length ? t("Grabaste {n} de {m} tomas.", { n: hechas, m: r.tomas.length })
      : flojas === 1 ? t("1 toma quedó floja (menos de {p} %).", { p: Math.round(TOMA_OK * 100) }) : t("{n} tomas quedaron flojas (menos de {p} %).", { n: flojas, p: Math.round(TOMA_OK * 100) }));
  } else {
    h.textContent = t("Vuelo de prueba");
    h.className = "";
  }
  const repAntes = p.rep;
  let resp = null;
  if (pe && r.foto && r.fotos?.length) G.fotos[pe.id] = r.fotos;
  if (pe?.negocio && r.completa && !r.crash && !r.dead) {           // un trabajo del negocio: se entrega por el chat
    resp = NG.entregar(p, ND, pe.id, { estrellas: r.estrellas, piloto: r.piloto, fotos: r.fotos?.length || 0 });
    if (resp) pay = { pago: resp.pago, rep: resp.rep };
    if (resp?.recomienda) setTimeout(() => toast(t("{a} le pasó tu número a {b}: 📱", { a: NG.cliente(ND, pe.clienteId).nombre, b: resp.recomienda.nombre }), 4500), 600);
    else if (resp?.especiales?.length) setTimeout(() => toast(t("⭐ Llegó un pedido especial al celular"), 4000), 600);
  } else if (pe && r.completa && !r.crash && !r.dead) {
    pay = PT.cobrar(p, mis, pe, r.estrellas);
    NG.entregarEspecial(p, ND, pe.id, r.estrellas);
    if (pe.id === DM.FINAL && DM.terminada(p)) setTimeout(() => toast(t("🔓 ¡Don Ernesto tiene su video! Se abrió un simulador nuevo: 💻 → 🎮 Simuladores."), 6000), 900);
  }
  else if (pe && r.piloto === "ia") {           // la IA no entregó el video: el cliente se queja
    p.rep = Math.max(0, p.rep - REP_FALLA_IA);
    pay = { pago: 0, rep: -(repAntes - p.rep) };
    msg.push(r.foto ? t("La IA no entregó las fotos: el cliente se queja (−{n} de reputación).", { n: REP_FALLA_IA }) : t("La IA no entregó el video: el cliente se queja (−{n} de reputación).", { n: REP_FALLA_IA }));
  }
  const capNuevo = mis.capitulos.find((c) => c.rep && repAntes < c.rep && p.rep >= c.rep);
  if (capNuevo) setTimeout(() => historia(t("Capítulo {n} · {titulo}", { n: capNuevo.n, titulo: capNuevo.titulo }), capNuevo.historia), 400);
  p.vuelos++;
  guardar();
  $("r-stars").innerHTML = pe ? [0, 1, 2].map((i) => (i < r.estrellas ? "★" : "<span class='off'>★</span>")).join("") : "";
  if (r.piloto === "ia") msg.push(t("Voló la IA \"{m}\".", { m: esc(d.banco?.ia?.modelo || d.modelo || "base") }));
  $("r-p").innerHTML = `<b>${esc(d.nombre)}</b> · ` + msg.join(" ");
  const rows = [], tiles = [];
  const pc = (x) => `${Math.round(x * 100)} %`;
  // arriba, en grande: lo que importa (plata, reputación, puntaje, el vuelo); abajo, el detalle
  if (pay) tiles.push([pay.pago ? `<span class="money">+$${pay.pago}</span>` : "$0", t("Pago")], [`${pay.rep >= 0 ? "+" : ""}${pay.rep}`, t("Reputación") + ` · ${t("(total {n})", { n: p.rep })}`]);
  if (pe) {
    const est = pe.estrellas || PT.ESTRELLAS;
    tiles.push([`${r.puntaje}<small>/100</small>`, `${t("Puntaje")} · ★ ${est[0]} · ★★ ${est[1]} · ★★★ ${est[2]}`]);
  }
  tiles.push([`${fmt(r.t, 0)} s`, t("de vuelo · batería {b} %", { b: Math.round(r.bateria * 100) })]);
  $("r-big").innerHTML = tiles.map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join("");
  const TIPO = { fija: t("fija"), orbita: t("órbita"), revelar: t("revelar") };
  const barra = (x, ok) => `<span class="rbar"><span class="${ok ? "ok" : "bad"}" style="width:${Math.round(Math.min(1, x) * 100)}%"></span><i style="left:${Math.round(TOMA_OK * 100)}%"></i></span>`;
  $("r-tomas").innerHTML = pe ? r.tomas.map((tm) => `<div class="rtoma"><span class="rt-n">${esc(tm.nombre)} <small class="muted">${TIPO[tm.tipo] || tm.tipo}</small></span>` +
    (tm.lista ? `${barra(tm.q, tm.q >= TOMA_OK)}<b class="${tm.q >= TOMA_OK ? "ok" : "bad"}">${pc(tm.q)}</b>` +
      `<small class="rt-d">${t("encuadre")} ${pc(tm.framing)} · ${t("en la ruta")} ${pc(tm.track)} · ${t("ritmo")} ${pc(tm.flow)} · ${t("estable")} ${pc(tm.steady)}</small>`
      : `<span class="rbar"></span><b class="bad">${t("no se grabó")}</b>`) + "</div>").join("") : "";
  if (pe) rows.push([t("Nitidez"), `${Math.round((r.nitidez ?? 1) * 100)} %`], [t("Cámara"), `${Math.round(r.cal * 100)} / 100`]);
  else rows.push([t("Grabado"), r.recT > 0 ? `${fmt(r.recT)} s` : t("nada (R para grabar)")]);
  for (const x of dmg) rows.push([x.nombre, `<span class="bad">${t("−{n} % (queda {v} %)", { n: x.perdio, v: x.vida })}</span>`]);
  if (dmg.length) rows.push([t("Reparar"), `<span class="money">$${PT.costoReparar(p, cat, d)}</span>`]);
  $("r-grid").innerHTML = rows.map(([a, b]) => `<span>${a}</span><span>${b}</span>`).join("");
  // lo que responde el cliente (negocio) y las fotos
  const rc = $("r-cliente");
  rc.classList.toggle("hidden", !resp);
  if (resp) { const Cl = NG.cliente(ND, pe.clienteId); rc.innerHTML = `<span class="av" style="background:${Cl.color};display:inline-grid;width:28px;height:28px;font-size:16px;vertical-align:middle">${Cl.avatar}</span> <b>${esc(Cl.nombre)}:</b> ${esc(resp.texto)}`; }
  const rf = $("r-fotos");
  rf.classList.toggle("hidden", !(r.foto && r.fotos?.length));
  rf.innerHTML = r.foto && r.fotos?.length ? r.fotos.map((f, i) => `<a href="${f.url}" download="${pe ? pe.id : "foto"}_${i + 1}.jpg" title="${t("Descargar")}"><img src="${f.url}" alt="${esc(f.nombre)}"></a>`).join("") : "";
  const v = $("r-video"), dl = $("b-res-bajar");
  if (r.video && !r.foto) {
    const url = URL.createObjectURL(r.video);
    v.src = url;
    v.classList.remove("hidden");
    dl.href = url;
    dl.download = `${pe ? pe.id : "prueba"}_${slugDe(d.nombre)}_${r.estrellas}estrellas.${r.video.type.includes("mp4") ? "mp4" : "webm"}`;
    dl.classList.remove("hidden");
    G.videos.unshift({ url, titulo: pe ? pe.titulo : t("Vuelo de prueba"), estrellas: r.estrellas, piloto: r.piloto, nombre: dl.download, pedido: !!pe, dron: d.nombre });
  } else { v.classList.add("hidden"); dl.classList.add("hidden"); v.removeAttribute("src"); }
  modal("resultado");
}

function renderVideos() {
  const l = $("lista-videos");
  l.innerHTML = G.videos.length ? "" : `<p class='muted'>${t("Todavía no grabas nada. En un vuelo, R empieza a grabar.")}</p>`;
  for (const v of G.videos) {
    const d = document.createElement("div");
    d.style.marginTop = "14px";
    d.innerHTML = `<b>${v.titulo}</b> <span class="muted">· ${esc(v.dron || "")}${v.piloto === "ia" ? " " + t("(la IA)") : ""} ${v.pedido ? "★".repeat(v.estrellas) : ""}</span><video controls playsinline src="${v.url}"></video><a class="btn ghost small" href="${v.url}" download="${v.nombre}">${t("Descargar")}</a>`;
    l.appendChild(d);
  }
}

$("b-res-taller").onclick = () => endVuelo();
$("b-res-otra").onclick = () => {
  const l = G.last; endVuelo(); P().activo = l.dron;
  if (l.pedido) l.pedido.variante = nuevaVariante();                 // otra vez = otra ruta
  const why = puedeVolar(D(), l.piloto === "ia"); if (!why) startVuelo(l.pedido, l.piloto); else toast(why, 4000);
};
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
  if (G.screen === "sim" && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || "")) { sim.tecla(e); return; }
  if (G.screen !== "vuelo") {
    if (e.code === "Escape") { for (const id of ["tablero", "brief", "videos", "controles", "lab", "historia", "tienda", "inventario", "nuevo-dron"]) modal(id, false); labPoll(false); }
    return;
  }
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
  G.keys.add(e.code);
  const v = G.vuelo;
  if (!v || e.repeat) return;
  if (e.code === "KeyR" && !v.ended && v.o.piloto !== "ia" && !v.o.pedido) { v.toggleRec(); }   // en los pedidos graba sola
  if (e.code === "KeyC") toast(t("Cámara: {c}", { c: { persecucion: t("persecución"), piloto: t("piloto (parado en la base)"), dron: t("la del dron") }[v.cycleCam()] }), 1400);
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
  $("h-sub").innerHTML = t("altura {m} m", { m: fmt(h.alt) }) + `${h.altTarget !== null ? ` <span style="color:var(--next)">→ ${fmt(h.altTarget)}</span>` : ""}<br>` +
    `<span style="color:${senCol}">${h.failsafe ? "FAILSAFE" : t("señal {n} %", { n: sen })}</span>${h.viento ? " · " + t("viento {v} m/s", { v: fmt(h.viento) }) : ""}<br>${fmt(h.t)} s`;
  const pct = Math.round(h.bat * 100);
  $("h-bat").textContent = h.dead ? t("SIN BATERÍA") : `${pct} % · ${fmt(Math.min(h.minLeft, 99))} min`;
  const bb = $("h-batbar");
  bb.style.width = `${pct}%`;
  bb.style.background = pct > 40 ? "var(--gate)" : pct > 20 ? "var(--gold)" : "var(--crash)";
  if (v.o.pedido) {
    const sh = h.shot, ok = (x) => (x > 0.6 ? "ok" : x > 0.3 ? "warn" : "bad"), mk = (x) => (x > 0.6 ? "✓" : "·");
    const foto = v.foto;
    $("h-tt").textContent = sh ? (foto ? t("Foto {k} de {n}: {nombre}", { k: h.k + 1, n: h.n, nombre: sh.nombre }) : t("Toma {k} de {n}: {nombre}", { k: h.k + 1, n: h.n, nombre: sh.nombre }))
      : foto ? t("{titulo}: ¡fotos listas!", { titulo: v.o.pedido.titulo }) : t("{titulo}: ¡tomas listas!", { titulo: v.o.pedido.titulo });
    $("h-prog").style.width = sh ? `${Math.round(sh.progress * 100)}%` : "100%";
    $("h-obj").innerHTML = (sh ? (sh.phase === "ir"
      ? (foto ? t("Ve al <b style=\"color:var(--next)\">aro celeste</b> (a {m} m) y llega despacio: ahí se toma la foto.", { m: fmt(h.toStart) }) : t("Ve al <b style=\"color:var(--next)\">aro celeste</b> (a {m} m) y llega despacio: ahí empieza a grabar.", { m: fmt(h.toStart) }))
      : foto ? t("<b style=\"color:#ff3b30\">📷 ¡Quieto!</b> El sujeto al centro del cuadro… {s} s", { s: fmt(Math.max(0, sh.dur - sh.t)) }) : t("<b style=\"color:#ff3b30\">● Grabando</b>: sigue el punto blanco pegado, con el sujeto al centro del cuadro."))
      : foto ? t("Vuelve a la base y aterriza para entregar las fotos.") : t("Vuelve a la base y aterriza para entregar el video.")) +
      `<br>${h.res.map((r, i) => `${r.lista ? (r.q / Math.max(r.n, 1) >= TOMA_OK ? "✓" : "✗") : i === h.k ? "▸" : "·"} ${r.nombre}${r.lista ? ` ${Math.round((r.q / Math.max(r.n, 1)) * 100)} %` : ""}`).join("<br>")}`;
    $("checks").innerHTML = `<span class="${ok(h.q.framing)}">${mk(h.q.framing)} ${t("el sujeto al centro")}</span> · ` +
      `<span class="${ok(h.q.track)}">${mk(h.q.track)} ${t("en la ruta")}</span><br>` +
      `<span class="${ok(h.q.flow)}">${mk(h.q.flow)} ${t("a su ritmo")}</span> · <span class="${ok(h.q.steady)}">${mk(h.q.steady)} ${t("estable")}</span><br>` +
      `${t("calidad ahora")} <b class="${ok(h.q.q)}">${Math.round(h.q.q * 100)} %</b>`;
  } else {
    $("h-prog").style.width = "0%";
    $("checks").innerHTML = h.rec ? `<b style="color:#ff3b30">● REC</b> ${fmt(h.recT)} s` : `<span class='muted'>${t("R para grabar")}</span>`;
  }
  $("pip-t").textContent = t("Cámara del dron · {nombre}", { nombre: pieza(cat, "camaras", v.o.build.camara).nombre });
}

// ---------------- bucle ----------------
let last = performance.now(), fpsN = 0, fpsT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (window.__fsAbierto) { last = now; return; }     // 🎮 volando en el freestyle (volar.js): el garaje no se dibuja
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (G.screen === "sim" && G.sim) {
    G.sim.update(dt);
    G.sim.render(dt);
    sim.tick(dt);
  } else if (G.screen === "mesa") {
    // la mesa de trabajo dibuja en su propio canvas (mesa.js)
  } else if (G.screen === "vuelo" && G.vuelo) {
    pollPad();
    G.vuelo.update(dt);
    G.vuelo.render(dt, now);
    hud(dt);
  } else {
    garaje.update(dt);
    renderer.setViewport(0, 0, innerWidth, innerHeight);
    dibujarGaraje();
  }
  fpsN++;
  if (now - fpsT > 500) { $("fps").textContent = `${Math.round((fpsN * 1000) / (now - fpsT))} fps`; fpsN = 0; fpsT = now; }
}

// ---------------- arranque ----------------
applyQuality();
precargar().then(() => garaje.usarModelos());
await Promise.race([precargar(), new Promise((r) => setTimeout(r, 6000))]);   // las piezas de Blender (si tardan, se dibujan simples)
try {                                                  // tus STL (chasis, carcasas…) antes de dibujar los drones
  G.stl = (await api("/api/stl")).stl || [];
  await Promise.all(G.stl.map((s) => cargarSTL(s).catch(() => null)));
} catch { G.stl = []; }
G.partida = await PT.sincronizar(G.partida);          // la de este navegador o la última del disco (la más nueva gana)
if (G.partida) { PT.activar(G.partida); estudio.deLaPartida(G.partida); guardar(); }   // guarda la partida migrada (v3)
verDron();
traducirHTML();                                        // el HTML fijo, en el idioma elegido
show("inicio");
renderInicio();
if (!hayIdioma()) modal("idioma");                     // la primera vez: ¿español o English?
document.querySelectorAll("#idioma [data-l], #idioma-sel [data-l]").forEach((b) => {
  b.setAttribute("aria-pressed", String(b.dataset.l === idioma()));
  b.onclick = () => { if (b.dataset.l === idioma() && hayIdioma()) { modal("idioma", false); return; } setIdioma(b.dataset.l, b.dataset.l !== idioma()); modal("idioma", false); };
});
loadModelos();
window.__gameReady = true;
window.__dm = { G, PT, BA, cat, mis, mundoLugar, t, garaje: () => garaje, abrirBanco, abrirPC, irTaller, mesa: ctx.mesa, estudio, sim };   // para probar desde la consola del navegador
requestAnimationFrame(frame);
if (sessionStorage.getItem("dronmaker.alTaller") && G.partida) { sessionStorage.removeItem("dronmaker.alTaller"); irTaller(); }   // venías de 📂 Partidas
