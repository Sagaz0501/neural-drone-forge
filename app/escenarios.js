// =====================================================================
// LOS ESCENARIOS de entrenamiento (la lógica, sin pantalla: test en app/test_taller.mjs). La pantalla es la app
// 🎮 Simuladores del computador (estudio.js). Datos: app/data/escenarios.json.
//
// Se compran en orden (cada uno pide el anterior); el primero es gratis. Tener un escenario deja:
//   · entrenar su misión (el Laboratorio y PBDMM solo muestran / aceptan las tuyas),
//   · usar la IA en esos trabajos ("Que lo haga la IA", la flota),
//   · usar las funciones de PBDMM 3 que abre ('abre'): el lenguaje crece con tus modelos.
// En la partida: p.escenarios = ["foto_fija", …].
// =====================================================================
import { anotar } from "./partida.js";
import { t } from "./i18n.js";

export const INICIALES = ["foto_fija"];
/** Las partidas de antes de los escenarios ya entrenaban fotos y videos: esos vienen de regalo. */
export const DE_ANTES = ["foto_fija", "set_fotos", "video_ruta"];
export const lista = (E) => E?.escenarios || [];
export const escenario = (E, id) => lista(E).find((x) => x.id === id) || null;
export const tiene = (p, id) => (p?.escenarios || INICIALES).includes(id);
/** El escenario que entrena una misión (entrenamiento.json id). */
export const deMision = (E, mision) => lista(E).find((x) => x.mision === mision) || null;

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
/** ¿La IA puede hacer este trabajo? (necesita el escenario de su misión). mision = negocio.js entrenarPara(…).mision */
export function iaPuede(p, E, mision) {
  const e = deMision(E, mision);
  return !e || tiene(p, e.id);
}
