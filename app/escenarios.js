// =====================================================================
// LOS ESCENARIOS de entrenamiento (la lógica, sin pantalla: test en app/test_taller.mjs). La pantalla es la app
// 🎮 Simuladores del computador (estudio.js). Datos: app/data/escenarios.json.
//
// Se compran en orden (cada uno pide el anterior); el primero es gratis. Tener un escenario deja:
//   · entrenar su misión (el Laboratorio y PBDMM solo muestran / aceptan las tuyas),
//   · usar la IA en esos trabajos ("Que lo haga la IA", la flota),
//   · usar las funciones de PBDMM 3 que abre ('abre'): el lenguaje crece con tus modelos.
// En la partida: p.escenarios = ["despegar", …].
//
// Van en orden de dificultad (E1-E12, "num"): despegar -> ir a un punto -> seguir una línea -> foto -> … Cada escenario
// tiene un EXAMEN (20 intentos sin ruido, GET /api/evaluar, ≥ 80 % = aprobado): p.examenes = { slug: ["despegar", …] }.
// Un escenario nuevo se entrena partiendo del modelo que aprobó el anterior (desdePara: así aprende mucho más rápido
// que desde cero) y repasa lo que ese modelo ya aprobó (repasoDe -> tarea.repaso: el 20 % de los intentos, para que no
// lo olvide). El modelo que aprueba los de BASE es un ⭐ MODELO BASE: el punto de partida de todo lo demás.
// =====================================================================
import { anotar } from "./partida.js";
import { t } from "./i18n.js";

export const INICIALES = ["despegar", "punto"];
/** La nota para aprobar un examen (sin ruido, 20 intentos fijos). */
export const APROBAR = 0.8;
/** El «éxito» que ve el jugador de un entrenamiento (entrenando.json / GET /api/lab): la nota del 🎓 examen sin ruido que
 *  jugar.py toma cada 90 s (tr.examen); antes del primero, el del entrenamiento (con ruido: sale más bajo). */
export const nota = (tr) => (typeof tr?.examen?.exito === "number" ? tr.examen.exito : tr?.succ);
/** Las filas de la historia (h = [[gen, pasos, éxito, choque, nivel, calidad], …]) con una columna más, la 6 = la nota
 *  del último 🎓 examen hasta esa generación (null antes del primero): las gráficas la dibujan como «éxito». */
export function conExamen(h, tr) {
  const ex = (tr?.examen?.hist || []).filter((x) => typeof x[1] === "number");
  if (!ex.length) return h;
  let j = -1;
  return h.map((r) => { while (j + 1 < ex.length && ex[j + 1][0] <= r[0]) j++; return [...r.slice(0, 6), ...Array(Math.max(0, 6 - r.length)).fill(null), j >= 0 ? ex[j][1] : null]; });
}
/** Lo que tiene que haber aprobado un modelo para ser ⭐ modelo base: vuela, se queda quieto, sigue, fotografía y graba. */
export const BASE = ["despegar", "punto", "linea", "foto_fija", "video_ruta"];
/** Las partidas de antes de los escenarios ya entrenaban fotos y videos: esos vienen de regalo. */
export const DE_ANTES = ["foto_fija", "set_fotos", "video_ruta"];
export const lista = (E) => E?.escenarios || [];
export const escenario = (E, id) => lista(E).find((x) => x.id === id) || null;
export const tiene = (p, id) => (p?.escenarios || INICIALES).includes(id);
/** El escenario que entrena una misión (entrenamiento.json id). */
export const deMision = (E, mision) => lista(E).find((x) => x.mision === mision) || null;
/** Los escenarios que dejan a la IA hacer trabajos de esa misión (el suyo y los que la cubren: "tambien"). */
const cubren = (E, mision) => lista(E).filter((x) => x.mision === mision || (x.tambien || []).includes(mision));

// ---------------- los exámenes y el modelo base ----------------
/** Los escenarios que aprobó un modelo. */
export const aprobados = (p, slug) => p?.examenes?.[slug] || [];
/** Anota un examen aprobado. Devuelve true si con este el modelo pasó a ser ⭐ modelo base (antes no lo era). */
export function aprobar(p, slug, id) {
  const antes = esBase(p, slug);
  p.examenes = { ...(p.examenes || {}), [slug]: [...new Set([...aprobados(p, slug), id])] };
  return !antes && esBase(p, slug);
}
export const esBase = (p, slug) => BASE.every((id) => aprobados(p, slug).includes(id));
/** El ⭐ modelo base de la partida (el que más aprobó, si hay varios). */
export function modeloBase(p) {
  const bs = Object.keys(p?.examenes || {}).filter((s) => esBase(p, s));
  return bs.sort((a, b) => aprobados(p, b).length - aprobados(p, a).length)[0] || null;
}
/** ¿Ese modelo aprobó el examen de un escenario que le enseña esa misión (el suyo o uno que la cubre: "tambien")? */
export const aprobo = (p, E, slug, mision) => cubren(E, mision).some((e) => aprobados(p, slug).includes(e.id));
/** Los modelos que aprobaron este escenario. */
export const aprobaron = (p, id) => Object.keys(p?.examenes || {}).filter((s) => aprobados(p, s).includes(id));
/**
 * De qué modelo partir para entrenar un escenario: el ⭐ modelo base; si no, uno que aprobó el escenario anterior (o
 * el de antes, hacia atrás). null = no hay ninguno (desde cero). existe(slug) = ¿ese modelo sigue en el computador?
 */
export function desdePara(p, E, id, existe = () => true) {
  const b = modeloBase(p);
  if (b && existe(b)) return b;
  for (let e = escenario(E, escenario(E, id)?.requiere); e; e = escenario(E, e.requiere)) {
    const m = aprobaron(p, e.id).filter(existe);
    if (m.length) return m.sort((a, z) => aprobados(p, z).length - aprobados(p, a).length)[0];
  }
  return null;
}
/** Los niveles que repasa un modelo que parte de `slug` (lo que aprobó), sin el que entrena ahora. */
export function repasoDe(p, E, slug, nivel) {
  const nv = aprobados(p, slug).map((id) => escenario(E, id)?.nivel).filter((n) => n != null && n !== nivel);
  return [...new Set(nv)];
}

/** "tuyo" (comprado), "comprable" (ya tienes el anterior) o "bloqueado". */
export function estado(p, E, id) {
  const e = escenario(E, id);
  if (!e) return "bloqueado";
  if (tiene(p, id)) return "tuyo";
  return !e.requiere || tiene(p, e.requiere) ? "comprable" : "bloqueado";
}
/** Comprar un escenario. Devuelve un texto de error o null. */
export function comprar(p, E, id) {
  const e = escenario(E, id);
  if (!e) return t("Ese escenario no existe.");
  if (tiene(p, id)) return t("Ya lo tienes.");
  if (e.requiere && !tiene(p, e.requiere)) return t("Primero el escenario «{e}».", { e: escenario(E, e.requiere)?.nombre || e.requiere });
  if (p.plata < e.precio) return t("Te faltan ${n}.", { n: e.precio - p.plata });
  p.plata -= e.precio;
  if (e.precio) anotar(p, -e.precio, t("Simulador: {e}", { e: e.nombre }));
  p.escenarios = [...(p.escenarios || INICIALES), id];
  return null;
}
/**
 * Lo que la partida tiene abierto: las misiones y niveles que puede entrenar, las funciones de PBDMM que puede usar y,
 * de las que no, qué escenario las abre. Una función que no abre ningún escenario está siempre (modelo, premios…).
 */
export function disponibles(p, E) {
  const misiones = new Set(), niveles = new Set(), funciones = new Set(), bloqueadas = {}, planes = {};
  for (const e of lista(E)) {
    if (tiene(p, e.id)) { misiones.add(e.mision); niveles.add(e.nivel); e.abre.forEach((f) => funciones.add(f)); planes[e.mision] = e.plan; }
    else e.abre.forEach((f) => { if (!bloqueadas[f]) bloqueadas[f] = e.nombre; });
  }
  for (const f of funciones) delete bloqueadas[f];
  return { misiones, niveles, funciones, bloqueadas, planes };
}
/** ¿Puede ENTRENAR esa misión? (necesita el escenario que la entrena: el Laboratorio solo muestra esas) */
export function puedeEntrenar(p, E, mision) {
  const e = deMision(E, mision);
  return !e || tiene(p, e.id);
}
/** ¿La IA puede hacer este trabajo? (necesita el escenario de su misión). mision = negocio.js entrenarPara(…).mision */
export function iaPuede(p, E, mision) {
  const es = cubren(E, mision);
  return !es.length || es.some((e) => tiene(p, e.id));
}
