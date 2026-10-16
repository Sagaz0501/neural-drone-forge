// =====================================================================
// IDIOMAS (español / English). El juego se escribe en español; el inglés es una traducción encima:
//   t("Volver al garaje")                      -> "Back to the garage"
//   t("Grabaste {n} de {m} tomas.", { n, m })  -> "You recorded 2 of 3 shots."
// La CLAVE es el texto en español (como gettext): el código se sigue leyendo igual y lo que no tenga traducción
// sale en español (y queda en window.__faltan para encontrarlo). Diccionarios: app/i18n/en/*.json (uno por parte
// del juego). El HTML fijo se traduce solo (traducirHTML) y los datos (piezas, misiones…) con una capa en inglés
// por id: app/data/en/<nombre>.json (datos()). Prueba: node app/test_i18n.mjs
// =====================================================================

const CLAVE = "dronmaker.idioma";
export const IDIOMAS = { es: "Español", en: "English" };
/** Las partes del diccionario (app/i18n/<idioma>/<parte>.json): cada una la mantiene quien traduce esa parte. */
export const PARTES = ["html", "main", "banco", "tienda", "estudio", "pbdmm", "sim", "vuelo", "comun", "negocio", "freestyle"];

const leer = () => { try { return localStorage.getItem(CLAVE); } catch { return null; } };
let LANG = IDIOMAS[leer()] ? leer() : "es";
let DIC = {};
const faltan = new Set();
if (typeof window !== "undefined") window.__faltan = faltan;

export const idioma = () => LANG;
/** ¿El jugador ya eligió idioma? (la primera vez se pregunta) */
export const hayIdioma = () => !!IDIOMAS[leer()];
export function setIdioma(l, recargar = true) {
  try { localStorage.setItem(CLAVE, l); } catch { /* sin almacenamiento */ }
  LANG = l;
  if (recargar && typeof location !== "undefined") location.reload();
}

/** Carga los diccionarios del idioma elegido (en español no hace falta nada). */
export async function cargarIdioma(base = "./i18n") {
  if (LANG === "es") return;
  const partes = await Promise.all(PARTES.map((p) => fetch(`${base}/${LANG}/${p}.json`).then((r) => (r.ok ? r.json() : {})).catch(() => ({}))));
  DIC = Object.assign({}, ...partes);
}
/** Para las pruebas (node): poner el diccionario a mano. */
export function usarDiccionario(lang, dic) { LANG = lang; DIC = dic || {}; }

/** Traduce un texto (la clave es el español) y rellena {variables}. */
export function t(es, vars) {
  let s = es;
  if (LANG !== "es") {
    const tr = DIC[es];
    if (tr) s = tr; else faltan.add(es);
  }
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
}

/** Números con la coma o el punto del idioma: fmt(3.25, 1) -> "3,3" / "3.3". */
export const num = (x, d = 1) => (LANG === "es" ? x.toFixed(d).replace(".", ",") : x.toFixed(d));

/** Traduce el HTML fijo: los textos de los elementos y los atributos aria-label, placeholder, title y alt. */
export function traducirHTML(root = document.body) {
  if (LANG === "es") return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const s = n.nodeValue, k = s.trim();
    if (!k || n.parentElement?.closest("script,style,textarea,pre,code")) continue;
    if (DIC[k]) n.nodeValue = s.replace(k, DIC[k]);
  }
  for (const el of root.querySelectorAll("[aria-label],[placeholder],[title],[alt]")) {
    for (const a of ["aria-label", "placeholder", "title", "alt"]) {
      const v = el.getAttribute(a);
      if (v && DIC[v.trim()]) el.setAttribute(a, DIC[v.trim()]);
    }
  }
  document.documentElement.lang = LANG;
}

/**
 * Los datos del juego en el idioma elegido: base = el JSON en español, la capa (app/data/<idioma>/<nombre>.json)
 * trae solo los textos, y se mezcla por "id" (o "k") en las listas. Lo que la capa no tenga queda en español.
 */
export async function datos(nombre, base, dir = "./data") {
  if (LANG === "es") return base;
  try {
    const r = await fetch(`${dir}/${LANG}/${nombre}.json`);
    return r.ok ? mezclar(base, await r.json()) : base;
  } catch { return base; }
}
export function mezclar(base, capa) {
  if (capa === undefined || capa === null) return base;
  if (Array.isArray(base) && Array.isArray(capa)) {
    const clave = (x) => (x && typeof x === "object" ? x.id ?? x.k ?? null : null);
    if (base.length && clave(base[0]) !== null) {
      const porId = new Map(capa.filter((x) => clave(x) !== null).map((x) => [clave(x), x]));
      return base.map((x) => (porId.has(clave(x)) ? mezclar(x, porId.get(clave(x))) : x));
    }
    return base.map((x, i) => (i < capa.length ? mezclar(x, capa[i]) : x));
  }
  if (base && typeof base === "object" && capa && typeof capa === "object" && !Array.isArray(base)) {
    const out = { ...base };
    for (const [k, v] of Object.entries(capa)) out[k] = k in base ? mezclar(base[k], v) : v;
    return out;
  }
  return typeof capa === typeof base || base === null ? capa : base;
}
