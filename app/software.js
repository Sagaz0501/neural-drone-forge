// =====================================================================
// EL SOFTWARE del computador (la lógica, sin pantalla: test en app/test_negocio.mjs). La pantalla es la app
// 🛍️ Apps del computador (estudio.js). Datos: app/data/software.json.
//
// El computador trae dos programas (🛍️ Apps y 🛒 DronMarket); lo demás se compra una vez: 💬 Mensajes, el
// 🧠 Simulador de IA (modo normal) o el 💻 IDE PBDMM (modo desarrollador), Calendario, Finanzas, Fondos…
// Cada programa abre una o más apps del escritorio. En la partida: p.software = ["apps", "dronmarket", …];
// las partidas de antes de la tienda de apps no lo tienen (= todo instalado).
// =====================================================================
import { anotar } from "./partida.js";
import { t } from "./i18n.js";

export const INICIALES = ["apps", "dronmarket"];
export const lista = (S, p) => (S?.software || []).filter((x) => !x.modo || x.modo === modoDe(p));
const modoDe = (p) => (p?.modo === "dev" ? "dev" : "normal");
export const programa = (S, id) => (S?.software || []).find((x) => x.id === id) || null;
export const instalado = (p, id) => !p?.software || p.software.includes(id);
/** El programa (de este modo) que abre una app del escritorio. */
export const deApp = (S, p, app) => lista(S, p).find((x) => x.apps.includes(app)) || null;
/** ¿Esta app del escritorio se puede abrir? (una app que ningún programa abre está siempre: Ajustes). */
export function tieneApp(p, S, app) {
  const x = deApp(S, p, app);
  return !x || instalado(p, x.id);
}
/** El programa con el que se entrena en este modo (el Simulador o el IDE). */
export const entrenar = (p) => (modoDe(p) === "dev" ? "ide" : "simulador");
/** Comprar un programa. Devuelve un texto de error o null. */
export function comprar(p, S, id) {
  const x = programa(S, id);
  if (!x || (x.modo && x.modo !== modoDe(p))) return t("Ese programa no existe.");
  if (instalado(p, id)) return t("Ya lo tienes.");
  if (p.plata < x.precio) return t("Te faltan ${n}.", { n: x.precio - p.plata });
  p.plata -= x.precio;
  if (x.precio) anotar(p, -x.precio, t("Programa: {x}", { x: x.nombre }));
  p.software = [...(p.software || INICIALES), id];
  return null;
}
