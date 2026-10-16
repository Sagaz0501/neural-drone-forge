// =====================================================================
// LA RUTA DEL PROGRAMADOR (docs/PBDMM2_PLAN.md §7): aprender PBDMM de a poco. En el modo desarrollador, cada dron
// que creas abre un capítulo nuevo (el 1 está abierto desde el inicio, con el primer dron del hangar). Cada capítulo
// trae un programa guiado y un RETO que el juego mide solo (al revisar/correr el programa o mientras entrena).
// Nada se bloquea: todo el lenguaje funciona siempre; la ruta solo ordena qué aprender y lo celebra.
//
// Los capítulos están en data/pbdmm.json "ruta" (el estudio los pasa con usarCapitulos). El progreso vive en
// partida.ruta = { creados, hechos: {n: true}, drones: {n: nombre del dron} }. Pruebas: node app/test_pbdmm.mjs
// =====================================================================

let CAPS = [];
export function usarCapitulos(caps) { CAPS = caps || []; }
export const capitulos = () => CAPS;

export function asegurar(p) {
  if (!p.ruta) p.ruta = { creados: 0, hechos: {}, drones: {} };
  if (!p.ruta.drones[1] && p.drones[0]) p.ruta.drones[1] = p.drones[0].nombre;
  return p.ruta;
}
/** Cuántos capítulos están abiertos: el primero + uno por cada dron que creaste. */
export const abiertos = (p) => Math.min(CAPS.length || 8, 1 + (asegurar(p).creados || 0));
export const hecho = (p, n) => !!asegurar(p).hechos[n];
/** El capítulo de ahora: el primero abierto sin terminar (null = todos hechos). */
export function actual(p) {
  for (let n = 1; n <= abiertos(p); n++) if (!hecho(p, n)) return n;
  return null;
}
/** Las funciones nuevas del capítulo de ahora (la ayuda y el autocompletado las marcan "nuevo"). */
export function nuevos(p) {
  const n = actual(p), c = n && CAPS[n - 1];
  return new Set(c ? c.aprende : []);
}

/** El jugador creó un dron (modo desarrollador): se abre el siguiente capítulo. Devuelve su número (o null). */
export function alCrearDron(p, d) {
  if (p.modo !== "dev") return null;
  const R = asegurar(p), antes = abiertos(p);
  R.creados = (R.creados || 0) + 1;
  const n = abiertos(p);
  if (n === antes) return null;
  R.drones[n] = d.nombre;
  return n;
}

/** El programa guiado de un capítulo, con el dron y el modelo de ese capítulo. */
export function programa(p, n) {
  const c = CAPS[n - 1], R = asegurar(p);
  const dron = R.drones[n] || p.drones[0]?.nombre || "estandar";
  const slug = dron.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 20) || "dron";
  return c.programa.replaceAll("{dron}", dron).replaceAll("{modelo}", `cap${n}_${slug}`);
}

function lograr(p, n, aviso) {
  const R = asegurar(p);
  if (R.hechos[n]) return;
  R.hechos[n] = true;
  aviso?.(n, CAPS[n - 1]);
}
const pendientes = (p) => Array.from({ length: abiertos(p) }, (_, i) => i + 1).filter((n) => !hecho(p, n));

/** Al revisar o correr un programa sin errores: los retos que se ven en el código. */
export function alCompilar(p, archivo, src, prog, aviso) {
  for (const n of pendientes(p)) {
    const r = CAPS[n - 1]?.reto;
    if (!r) continue;
    if (r.tipo === "codigo" && r.todos.every((alts) => alts.some((x) => src.includes(x)))) lograr(p, n, aviso);
    if (r.tipo === "revision_ok" && prog.revision?.ok) lograr(p, n, aviso);
  }
}

/** En cada generación de un programa que corre: los retos que se miden entrenando. acciones = lo que pidió el hook. */
export function alGenerar(p, cfg, e, aviso, acciones = []) {
  for (const n of pendientes(p)) {
    const r = CAPS[n - 1]?.reto;
    if (!r) continue;
    const g = e.generaciones_sesion ?? 0;
    if (r.tipo === "generaciones" && g >= r.n) lograr(p, n, aviso);
    if (r.tipo === "choque_bajo" && g >= (r.min_gen || 5) && typeof e.choque === "number" && e.choque < r.max) lograr(p, n, aviso);
    if (r.tipo === "avisar_exito" && typeof e.exito === "number" && e.exito >= r.min && acciones.some((a) => a.avisar !== undefined)) lograr(p, n, aviso);
    if (r.tipo === "cambia_premios" && acciones.some((a) => a.premios || a.castigos)) lograr(p, n, aviso);
    if (r.tipo === "cero_exito" && cfg.desde === "cero" && typeof e.exito === "number" && e.exito >= r.min) lograr(p, n, aviso);
  }
}
