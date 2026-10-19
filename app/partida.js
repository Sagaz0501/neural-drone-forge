// =====================================================================
// LA PARTIDA: plata, reputación, el INVENTARIO (cada pieza comprada es una unidad con su vida: si compras
// 3 juegos de motores tienes 3 unidades), el HANGAR (varios drones, cada uno con nombre, propósito, sus
// piezas, su estado en el banco de armado y SU modelo de IA) y los pedidos hechos.
// Se guarda en un ARCHIVO por partida (scripts/jugar.py: partidas/<id>.json; varias partidas, se cargan y se borran
// en el inicio) y la que juegas, también en localStorage (para arrancar al tiro). Toda la economía está aquí (números en app/data/).
//
// Versión 3. Las partidas v1/v2 (un solo dron) se migran: cada pieza que tenías es una unidad y tu dron
// pasa a ser el primero del hangar, ya armado, cableado y programado, con la IA base (models/modelo.zip).
// =====================================================================
import { calcular, pieza, POR_DEFECTO } from "./parts.js";
import { t } from "./i18n.js";
import { diasEnvio, hoy } from "./taller.js";

const CLAVE = "dronmaker.partida";
export const PLATA_INICIAL = 150;
export const RANURAS = [
  ["chasis", "chasis", "Chasis"], ["motores", "motores", "Motores"], ["helices", "helices", "Hélices"],
  ["esc", "escs", "ESC (variadores)"], ["bateria", "baterias", "Batería"], ["controladora", "controladoras", "Controladora"],
  ["radio", "radios", "Radio"], ["camara", "camaras", "Cámara"], ["montaje", "montajes", "Montaje de la cámara"],
];
export const RANURA = Object.fromEntries(RANURAS.map(([slot, ranura]) => [slot, ranura]));
export const ESTILO = { color: "#b07a45", acento: "#ff7a1a", forma: "x" };
/** Reputación que abre cada etapa de la tienda (etapa 1 desde el inicio). */
export const REP_ETAPA = [0, 0, 5, 12, 20, 30];
/** Cuánto te dan por una pieza usada (× precio × vida). */
export const VENTA = 0.4;
/** Reimprimir un chasis con otra forma: lo que cuesta el filamento (× precio con impresora). */
export const REIMPRIMIR = 0.3;

// ---------------- crear y migrar ----------------
/** Un id para el archivo de la partida: p_<tiempo><azar> (= jugar.py PARTIDA_RE). */
export const nuevoId = () => "p_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export function nuevaPartida() {
  const p = { v: 3, id: nuevoId(), nombre: "", plata: PLATA_INICIAL, rep: 0, inventario: [], sig: 1, drones: [], activo: null, hechos: {}, vuelos: 0,
    creada: Date.now(), herramientas: [], empresa: "Garaje Films", insumos: {}, escenarios: ["despegar", "punto"], software: ["apps", "dronmarket"],   // software.js: lo demás se compra en 🛍️ Apps
    modelos: [] };                                     // LOS MODELOS DE ESTA PARTIDA: empieza en cero (ver modelosVisibles)
  // lo que venía con el garaje: un ESC viejo y tornillos (la radio ESP-NOW viene en el ESP32: es gratis)
  for (const id of ["esc20", "mt_tornillos"]) agregarUnidad(p, id);
  return p;
}

/**
 * Modo desarrollador: la misma partida que el modo normal (el regalo de mamá, $150, todo se desbloquea jugando y
 * comprando simuladores), pero con las herramientas de programar (IDE, documentación, simuladores en el computador).
 */
export function nuevaPartidaDesarrollador() {
  return Object.assign(nuevaPartida(), { modo: "dev", empresa: t("Estudio de IA") });
}

/**
 * PARA LAS PRUEBAS (test_banco, test_flota): una partida de desarrollador con todo abierto, plata de sobra, todas las
 * herramientas y drones ya armados y probados en el banco. drones = {nombre: {slot: id}}. El juego ya no la usa.
 */
export function nuevaPartidaDev(cat, drones, extras = {}) {
  const p = nuevaPartida();
  Object.assign(p, { modo: "dev", plata: 99999, rep: REP_ETAPA.at(-1), empresa: t("Estudio de IA"),
    herramientas: [...(cat.herramientas || []).map((h) => h.id), "estacion", "extractor"],
    insumos: { estano: 200, flux: 50, cable: 40, malla: 10 } });
  delete p.software;                                  // todos los programas
  delete p.modelos;                                   // todos los modelos (la IA base vuela)
  for (const [nombre, piezas] of Object.entries(drones)) {
    const d = nuevoDron(p, nombre, t("Pruebas de IA"));
    d.estilo = { ...ESTILO };
    for (const [slot, id] of Object.entries(piezas)) d.slots[slot] = agregarUnidad(p, id).uid;
    d.extras = (extras[nombre] || []).map((id) => agregarUnidad(p, id).uid);
    const ch = unidad(p, d.slots.chasis);
    if (ch) ch.diseno = { tipo: "forma", forma: "x" };
    d.banco = bancoListo(d);                   // armado, cableado y programado (el banco lo completa al abrirlo)
  }
  p.activo = p.drones[0]?.id ?? null;
  return p;
}

// ---------------- los modelos de IA de la partida ----------------
// Una partida nueva no trae NINGÚN modelo: ni la IA base ni los del juego (los rivales del freestyle). Solo ve y usa
// los que entrena ella (p.modelos = sus slugs; desde="cero"). Las partidas de antes (sin p.modelos) ven todos y vuelan
// con la IA base si el dron no tiene la suya. Los reservados (jugar.py RESERVADOS) no se ven nunca.
export const enCero = (p) => Array.isArray(p?.modelos);
/** De la lista de /api/modelos, los que esta partida puede ver y usar. */
export function modelosVisibles(p, lista) {
  const ms = (lista || []).filter((m) => !m.reservado);
  return enCero(p) ? ms.filter((m) => p.modelos.includes(m.slug)) : ms;
}
/** Este modelo ahora es de la partida (empezó a entrenar, se copió o se renombró). */
export function anotarModelo(p, slug, antes = null) {
  if (!enCero(p) || !slug) return;
  p.modelos = [...new Set([...p.modelos.filter((x) => x !== antes), slug])];
}

/** v1/v2 -> v3: cada pieza que tenías = 1 unidad; tu dron = el primero del hangar, listo para volar. */
function migrar(p) {
  if (p.v === 3) return p;
  const old = { ...(p.dron || {}) }, inv = p.inventario || {}, est = p.estilo || { ...ESTILO };
  const q = { v: 3, plata: p.plata, rep: p.rep, inventario: [], sig: 1, drones: [], activo: null, hechos: p.hechos || {},
    vuelos: p.vuelos || 0, creada: p.creada || Date.now(), herramientas: p.herramientas || [], empresa: p.empresa || "Garaje Films" };
  const uidDe = {};
  for (const [id, u] of Object.entries(inv)) uidDe[id] = agregarUnidad(q, id, u.vida ?? 100).uid;
  if (["chasis", "motores", "bateria", "controladora", "camara"].some((s) => old[s])) {
    const d = nuevoDron(q, t("Dron {n}", { n: 1 }), t("Videos"));
    d.estilo = { ...ESTILO, ...est };
    d.modelo = "base";
    for (const [slot] of RANURAS) {
      const id = old[slot] || POR_DEFECTO[slot];
      if (!id) continue;
      if (!uidDe[id]) uidDe[id] = agregarUnidad(q, id).uid;
      d.slots[slot] = uidDe[id];
    }
    d.extras = (old.extras || []).filter((id) => uidDe[id]).map((id) => uidDe[id]);
    const ch = unidad(q, d.slots.chasis);
    if (ch) ch.diseno = { tipo: "forma", forma: est.forma || "x" };
    d.banco = bancoListo(d);                   // ya lo tenías volando: armado, cableado y programado
  }
  return q;
}

/** Un banco "como si ya lo hubieras armado todo" (para la migración y las pruebas). */
export function bancoListo(d) {
  return { instalado: { ...d.slots, extras: [...d.extras] }, helices: true, ia: d.modelo ? { modelo: d.modelo } : null, migrado: true };
}

export function cargar() {
  try {
    const s = localStorage.getItem(CLAVE);
    if (!s) return null;
    const p = JSON.parse(s);
    if (p && p.v < 3) localStorage.setItem(`${CLAVE}_v${p.v}`, s);     // respaldo de la partida de antes de migrar
    return p && [1, 2, 3].includes(p.v) ? preparar(p) : null;
  } catch { return null; }
}

/** Migrar + el taller + un id (las partidas de antes de los archivos no tenían). */
function preparar(p) {
  p = asegurarTaller(migrar(p));
  if (!p.id) p.id = nuevoId();
  if (p.nombre === undefined) p.nombre = "";
  return p;
}

export function guardar(p) {
  p.guardada = Date.now();
  try { localStorage.setItem(CLAVE, JSON.stringify(p)); } catch { /* sin almacenamiento: se juega igual */ }
  // su archivo (scripts/jugar.py partidas/<id>.json) + la copia en partida.json
  if (typeof fetch !== "function") return;
  clearTimeout(guardar.t);                     // varios guardados seguidos: se manda solo el último
  guardar.t = setTimeout(() => fetch("/api/partida", { method: "POST", body: JSON.stringify(p) }).then((r) => r.json())
    .then((r) => { if (/papelera/.test(r?.msg || "")) dispatchEvent(new CustomEvent("partida-papelera")); })   // la borraste en otra ventana
    .catch(() => {}), 400);
}

/** La que se juega en este navegador (localStorage), sin mandarla al servidor. */
export function activar(p) {
  try { localStorage.setItem(CLAVE, JSON.stringify(p)); } catch { /* nada */ }
}

/** Ya, sin esperar (antes de cambiar de partida). local = false: una partida que no es la que juegas (renombrar, importar). */
export async function guardarYa(p, local = true) {
  if (local) clearTimeout(guardar.t);
  p.guardada = Date.now();
  if (local) activar(p);
  try { await fetch("/api/partida", { method: "POST", body: JSON.stringify(p) }); } catch { /* sin servidor */ }
}

export function borrar() {
  try { localStorage.removeItem(CLAVE); } catch { /* nada */ }
}

// ---------------- las partidas en archivos (scripts/jugar.py) ----------------
async function pedir(url, body) {
  const r = await fetch(url, body ? { method: "POST", body: JSON.stringify(body) } : undefined);
  return r.json();
}
/** [{id, nombre, modo, plata, rep, dia, pedidos, drones, modelos, creada, guardada}], la más reciente primero; null sin servidor. */
export async function listar() {
  try { return (await pedir("/api/partidas")).partidas || []; } catch { return null; }
}
/** La partida de ese archivo, lista para jugar (migrada), o null. */
export async function leer(id) {
  try { const r = await pedir("/api/partida?id=" + encodeURIComponent(id)); return r.ok && r.partida ? preparar(r.partida) : null; } catch { return null; }
}
/** A la papelera (con las IA que solo usaba ella). Si es la que estás jugando, también sale de localStorage. */
export async function borrarArchivo(id, modelos = true) {
  try {
    const r = await pedir("/api/partida_borrar", { id, modelos });
    if (r.ok && cargar()?.id === id) borrar();
    return r;
  } catch { return { ok: false, msg: "sin servidor" }; }
}
/** Al abrir el juego: la partida de localStorage o, si no hay (otro navegador, la app con otro puerto), la última
 * del disco. Si el archivo es más nuevo que la copia local (la jugaste en otro lado), gana el archivo. */
export async function sincronizar(local) {
  const lista = await listar();
  if (!lista) return local;
  if (!local) return lista[0] ? leer(lista[0].id) : null;
  const f = lista.find((r) => r.id === local.id);
  if (f && (f.guardada || 0) > (local.guardada || 0)) return (await leer(local.id)) || local;
  if (!f) guardar(local);                      // una partida de antes de los archivos: se escribe su archivo
  return local;
}
/** Una partida exportada (archivo .json) -> una partida nueva (id nuevo: no pisa ninguna). */
export function importar(texto) {
  const p = JSON.parse(texto);
  if (!p || ![1, 2, 3].includes(p.v)) throw new Error(t("Ese archivo no es una partida de Neural Drone Forge."));
  const q = preparar(p);
  q.id = nuevoId();
  return q;
}

/** Hasta qué etapa de la tienda llegas con tu reputación. */
export function etapa(p) {
  let e = 1;
  for (let k = 1; k < REP_ETAPA.length; k++) if (p.rep >= REP_ETAPA[k]) e = k;
  return e;
}

// ---------------- inventario (unidades) ----------------
export function agregarUnidad(p, id, vida = 100) {
  const u = { uid: "u" + p.sig++, id, vida };
  p.inventario.push(u);
  return u;
}
export const unidad = (p, uid) => p.inventario.find((u) => u.uid === uid) || null;
export const unidades = (p, id) => p.inventario.filter((u) => u.id === id);
export const tiene = (p, id) => p.inventario.some((u) => u.id === id);
export const tieneHerramienta = (p, id) => (p.herramientas || []).includes(id);

/** El dron donde está puesta una unidad (o null si está libre en el estante). */
export function dronDe(p, uid) {
  return p.drones.find((d) => Object.values(d.slots).includes(uid) || d.extras.includes(uid)) || null;
}
/** Unidades libres de una pieza (las mejores primero). */
export const libres = (p, id) => unidades(p, id).filter((u) => !dronDe(p, u.uid)).sort((a, b) => b.vida - a.vida);

/** Lo que cuesta una pieza: con la impresora 3D, los chasis imprimibles salen 40 % más baratos. */
export function precioDe(p, pz) {
  return pz.imprimible && tieneHerramienta(p, "impresora") ? Math.round(pz.precio * 0.6) : pz.precio;
}

// ---------------- el taller: herramientas de soldar e insumos que se gastan (estaño, flux, cable, malla) ----------------
/** Una herramienta (se compra una vez) o una pieza. */
export const esHerramienta = (ranura, pz) => ranura === "herramientas" || !!pz?.herramienta;
/** Partidas de antes de los insumos: el garaje ya tenía un cautín viejo y un poco de todo. */
export function asegurarTaller(p) {
  if (!p.escenarios) p.escenarios = ["foto_fija", "set_fotos", "video_ruta"];     // de antes de los simuladores: ya entrenabas fotos y videos
  if (p.insumos) return p;
  p.insumos = { estano: 10, flux: 5, cable: 2, malla: 0 };
  p.herramientas = p.herramientas || [];
  if (!["cautin_lapiz", "estacion", "estacion_t12"].some((h) => p.herramientas.includes(h))) p.herramientas.push("cautin_lapiz");
  return p;
}
export const insumo = (p, k) => +(p.insumos?.[k] || 0);
/** Gastar un insumo: si no alcanza, no gasta nada y devuelve false. Armando el primer dron (tutorial) no se gasta nada. */
export function gastar(p, k, n) {
  if (["regalo", "nombre", "armar"].includes(p.tuto?.etapa)) return true;
  if (insumo(p, k) + 1e-9 < n) return false;
  p.insumos[k] = Math.max(0, +(insumo(p, k) - n).toFixed(3));
  return true;
}
/** El mejor cautín que tienes (o null): sus datos de piezas.json soldadura[].cautin. */
export function cautinDe(p, cat) {
  for (const id of ["estacion_t12", "estacion", "cautin_lapiz"]) if (tieneHerramienta(p, id)) { const pz = (cat.soldadura || []).find((x) => x.id === id); if (pz) return { id, nombre: pz.nombre, ...pz.cautin }; }
  return null;
}

/** ¿Se puede comprar? Devuelve un texto de error o null. */
export function puedeComprar(p, cat, ranura, id) {
  const pz = pieza(cat, ranura, id);
  if (!pz) return t("Esa pieza no existe.");
  if (esHerramienta(ranura, pz) && tieneHerramienta(p, id)) return t("Ya la tienes.");
  if (pz.etapa > etapa(p)) return t("Se desbloquea con {rep} de reputación.", { rep: REP_ETAPA[pz.etapa] });
  if (pz.impresora && !tieneHerramienta(p, "impresora")) return t("Necesitas la impresora 3D para imprimirlo.");
  return null;
}

/** Anota un movimiento de plata (la app Finanzas del Estudio): + entra, − sale. Guarda los últimos 200. */
export function anotar(p, monto, txt) {
  if (!monto) return;
  p.movimientos = [...(p.movimientos || []), { dia: p.negocio?.dia ?? null, monto, txt, saldo: p.plata }].slice(-200);
}

/**
 * Comprar n unidades (o una herramienta). Devuelve un texto de error o null.
 * envio: llega en caja (u.caja) y, si no es del barrio, otro día (u.llega = el día que llega; taller.js diasEnvio).
 */
export function comprar(p, cat, ranura, id, n = 1, { envio = false, regalo = false } = {}) {
  const err = puedeComprar(p, cat, ranura, id);
  if (err) return err;
  const pz = pieza(cat, ranura, id);
  if (esHerramienta(ranura, pz)) n = 1;                // una herramienta se tiene o no: se cobra una vez
  const total = regalo ? 0 : precioDe(p, pz) * n;
  if (p.plata < total) return t("Te faltan ${n}.", { n: total - p.plata });
  p.plata -= total;
  if (total) anotar(p, -total, n > 1 ? `${pz.nombre} × ${n}` : pz.nombre);
  if (esHerramienta(ranura, pz)) p.herramientas = [...(p.herramientas || []), id];
  else if (pz.insumo) { p.insumos = p.insumos || {}; p.insumos[pz.insumo.k] = +(insumo(p, pz.insumo.k) + pz.insumo.n * n).toFixed(3); }
  else for (let i = 0; i < n; i++) {
    const u = agregarUnidad(p, id);
    if (envio) { u.caja = true; const dd = diasEnvio(pz); if (dd) u.llega = hoy(p) + dd; }
    // sin impresora, los chasis "impresos" llegan impresos de la tienda (en X); con impresora, los imprimes tú
    if (pz.imprimible && !tieneHerramienta(p, "impresora")) u.diseno = { tipo: "forma", forma: "x" };
  }
  return null;
}

/** Comprar un carrito [{ranura, id, n}]: todo o nada. */
export function comprarCarrito(p, cat, items, opts = {}) {
  let total = 0;
  for (const it of items) {
    const err = puedeComprar(p, cat, it.ranura, it.id);
    if (err) return `${pieza(cat, it.ranura, it.id)?.nombre}: ${err}`;
    const pz = pieza(cat, it.ranura, it.id);
    total += opts.regalo ? 0 : precioDe(p, pz) * (esHerramienta(it.ranura, pz) ? 1 : it.n);   // el regalo no se cobra (antes pedía tener la plata)
  }
  if (p.plata < total) return t("Te faltan ${n}.", { n: total - p.plata });
  for (const it of items) comprar(p, cat, it.ranura, it.id, it.n, opts);
  return null;
}

/** Vender una unidad libre: VENTA × precio × vida. Devuelve lo que te dieron o un texto de error. */
export function vender(p, cat, uid) {
  const u = unidad(p, uid);
  if (!u) return t("No existe.");
  if (dronDe(p, uid)) return t("Está puesta en un dron: quítala primero.");
  const pz = buscarPieza(cat, u.id);
  const plata = Math.round((pz?.precio || 0) * VENTA * (u.vida / 100));
  p.inventario = p.inventario.filter((x) => x.uid !== uid);
  p.plata += plata;
  anotar(p, plata, t("Venta: {pieza}", { pieza: pz?.nombre || u.id }));
  return plata;
}

/** Busca una pieza por id en cualquier ranura. */
export function buscarPieza(cat, id) {
  for (const [k, v] of Object.entries(cat)) if (Array.isArray(v)) { const pz = v.find((x) => x.id === id); if (pz) return { ...pz, ranura: k }; }
  return null;
}

// ---------------- el hangar ----------------
export function nuevoDron(p, nombre, proposito = "") {
  let n = 1;
  while (p.drones.some((d) => d.id === "d" + n)) n++;
  const d = { id: "d" + n, nombre: nombre || t("Dron {n}", { n }), proposito, slots: {}, extras: [], estilo: { ...ESTILO }, banco: {}, modelo: null,
    canopy: null, visuales: {}, creado: Date.now() };
  p.drones.push(d);
  p.activo = d.id;
  return d;
}
export const dron = (p, did) => p.drones.find((d) => d.id === did) || null;
export const dronActivo = (p) => dron(p, p.activo) || p.drones[0] || null;

/** Desarmar y borrar un dron: sus piezas vuelven al estante. */
export function borrarDron(p, did) {
  p.drones = p.drones.filter((d) => d.id !== did);
  if (p.activo === did) p.activo = p.drones[0]?.id || null;
}

/** Elegir la pieza `id` para una ranura del dron: toma la mejor unidad libre. Devuelve error o null. */
export function instalar(p, d, slot, id) {
  const actual = unidad(p, d.slots[slot]);
  if (actual?.id === id) return null;
  const u = libres(p, id)[0];
  if (!u) return t("No tienes una libre: cómprala en la tienda o quítasela a otro dron.");
  d.slots[slot] = u.uid;
  return null;
}
export function quitar(p, d, slot) { delete d.slots[slot]; }

/** Poner o quitar un extra (protectores, ToF, luces…) que tengas libre. */
export function alternarExtra(p, d, id) {
  const puesto = d.extras.find((uid) => unidad(p, uid)?.id === id);
  if (puesto) { d.extras = d.extras.filter((x) => x !== puesto); return null; }
  const u = libres(p, id)[0];
  if (!u) return t("No tienes uno libre: cómpralo en la tienda.");
  d.extras.push(u.uid);
  return null;
}

/** Los ids de las piezas del dron (el formato que usan parts.js, dron3d.js y el vuelo). */
export function build(p, d) {
  const b = { extras: [], estilo: d.estilo, canopy: d.canopy, visuales: d.visuales || {} };
  for (const [slot] of RANURAS) {
    const u = unidad(p, d.slots[slot]);
    if (u) b[slot] = u.id;
  }
  b.extras = d.extras.map((uid) => unidad(p, uid)?.id).filter(Boolean);
  const ch = unidad(p, d.slots.chasis);
  if (ch?.diseno) {
    b.diseno = ch.diseno;
    if (ch.diseno.tipo === "stl") b.chasisStl = { masa_g: ch.diseno.masa_g, radio_m: ch.diseno.radio_m, helice_max: ch.diseno.helice_max };
  }
  if (d.canopy?.masa_g) b.extraMasa_g = d.canopy.masa_g;
  return b;
}

/** El dron con sus números (o null si le faltan piezas). */
export function dronArmado(p, cat, d, meta = null) {
  if (!d) return null;
  const b = build(p, d);
  for (const [slot] of RANURAS) if (!b[slot]) return null;
  return { build: b, stats: calcular(b, cat, meta) };
}

// ---------------- daños ----------------
/** Unidades del dron que están rotas (vida 0): no puede volar hasta repararlas. */
export function rotas(p, d) {
  return [...Object.values(d.slots), ...d.extras].map((uid) => unidad(p, uid)).filter((u) => u && u.vida <= 0);
}

/** Cuánto cuesta dejar el dron como nuevo: precio × lo que perdió × 0,6. */
export function costoReparar(p, cat, d) {
  let c = 0;
  for (const uid of Object.values(d.slots)) {
    const u = unidad(p, uid), pz = u && buscarPieza(cat, u.id);
    if (pz) c += pz.precio * (1 - u.vida / 100) * 0.6;
  }
  return Math.ceil(c);
}

export function reparar(p, cat, d) {
  const c = costoReparar(p, cat, d);
  if (c > p.plata) return t("Te faltan ${n}.", { n: c - p.plata });
  p.plata -= c;
  anotar(p, -c, t("Reparación: {dron}", { dron: d.nombre }));
  for (const uid of Object.values(d.slots)) { const u = unidad(p, uid); if (u) u.vida = 100; }
  return null;
}

/** Sin plata para reparar: lo arreglas tú con cinta y pegamento. Gratis, pero las piezas rotas quedan al 40 %. */
export function arregloCasero(p, d) {
  for (const u of rotas(p, d)) u.vida = 40;
}

/**
 * Un choque: cada pieza pierde vida según la velocidad del golpe, el aguante del chasis y su durabilidad.
 * Las hélices casi siempre se rompen. Devuelve [{nombre, perdio, vida}] para contarlo en pantalla.
 */
export function chocar(p, cat, d, velGolpe) {
  const b = build(p, d), ch = pieza(cat, "chasis", b.chasis);
  const exceso = Math.max(0, velGolpe - ch.aguante_ms * 0.5);
  const out = [];
  const golpeables = new Set(["chasis", "motores", "helices", "esc", "camara", "montaje"]);
  const conProt = b.extras.includes("protectores") || ch.protectores;
  for (const [slot, ranura] of RANURAS) {
    const u = unidad(p, d.slots[slot]), pz = u && pieza(cat, ranura, u.id);
    if (!pz || !golpeables.has(slot)) continue;
    if (slot === "helices" && conProt && exceso < 2) continue;     // los protectores salvan las hélices
    const dur = slot === "chasis" ? ch.durabilidad : pz.durabilidad ?? 70;
    let perdio = slot === "helices" ? 60 + exceso * 20 : (exceso * 15 * 100) / dur * (slot === "chasis" ? 1 : 0.35);
    perdio = Math.round(Math.min(100, perdio));
    if (perdio <= 0) continue;
    u.vida = Math.max(0, u.vida - perdio);
    out.push({ nombre: pz.nombre, perdio, vida: u.vida });
  }
  return out;
}

/** Quemar una unidad (un corto en el banco): vida a 0 (o lo que diga `queda`). */
export function quemar(p, uid, queda = 0) {
  const u = unidad(p, uid);
  if (u) u.vida = Math.min(u.vida, queda);
  return u;
}

// ---------------- pedidos ----------------
export const ESTRELLAS = [40, 65, 85];      // puntaje mínimo para 1, 2 y 3 estrellas (cada cliente puede pedir otras)
export const estrellasDe = (puntaje, umbrales = ESTRELLAS) => umbrales.filter((x) => puntaje >= x).length;

/** Cobrar un pedido según las estrellas. Devuelve {pago, rep}. */
export function cobrar(p, misiones, pedido, estrellas) {
  const pago = Math.round(pedido.pago * misiones.pago_por_estrellas[estrellas]);
  const rep = misiones.reputacion_por_estrellas[estrellas];
  p.plata += pago;
  anotar(p, pago, pedido.titulo || pedido.id);
  p.rep = Math.max(0, p.rep + rep);
  p.hechos[pedido.id] = Math.max(p.hechos[pedido.id] ?? 0, estrellas);
  return { pago, rep };
}
