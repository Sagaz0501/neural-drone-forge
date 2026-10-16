// =====================================================================
// EL TUTORIAL DEL PRIMER DRON (el regalo de mamá): qué notas salen arriba a la derecha según dónde estás y en qué vas.
// Sin pantalla (la pantalla es notas.js; main.js arma el contexto cada medio segundo). test: node app/test_negocio.mjs
//
// notas(p, s) -> [{ id, titulo, html, fija }]
//   fija = el paso de ahora (no se cierra: cambia sola cuando avanzas; "Saltar el tutorial" la apaga)
//   las demás son consejos que salen UNA vez en su lugar ("Entendido" -> p.tuto.vistas)
// s = { pantalla, izq, hayDron, dronListo, dron, banco: {falta, cablearOk}, mesa (mesa.js estadoTuto), estante }
// Dura hasta la primera foto de Doña Marta (negocio.tutorial = 2) y vale en los dos modos.
// =====================================================================
import { t } from "./i18n.js";

/** ¿Sigue el tutorial? */
export function activo(p) {
  const N = p?.negocio;
  return !!N && N.tutorial < 2 && !p.tuto?.off;
}
export const saltar = (p) => { p.tuto = { ...(p.tuto || {}), off: true }; };
export const visto = (p, id) => { p.tuto = { ...(p.tuto || {}), vistas: [...new Set([...(p.tuto?.vistas || []), id])] }; };

const PASO_BANCO = () => ({
  imprimir: t("<b>Imprimir el chasis</b>: elige la forma y dale «Imprimir»."),
  armar: t("<b>Paso 1 · Armar.</b> Dale «🔧 Ir a la mesa de trabajo»: allá abres las cajas de mamá y montas cada pieza."),
  cablear: t("<b>Paso 2 · Cablear.</b> Dale «🔥 Ir a soldar». Si te pierdes, la «📄 Guía de conexión» tiene el diagrama completo."),
  humo: t("<b>Paso 3 · Prueba de humo.</b> «Conectar la batería»: si algo quedó mal soldado, aquí se quema. Si no sale humo, sigues."),
  firmware: t("<b>Paso 4 · Firmware.</b> El USB ya va al portátil: elige el firmware del ESP32 y dale «Flashear»."),
  config: t("<b>Paso 5 · Configurar.</b> «Calibrar (con el dron nivelado)», después la pestaña Radio → «Emparejar»."),
  motores: t("<b>Paso 6 · Motores</b> (sin hélices). Prueba cada uno: que gire el que es y hacia donde dice la flecha. Si todo bien: «Quedaron bien»."),
  helices: t("<b>Paso 7 · Hélices.</b> «Poner las hélices» (siempre de último)."),
  prueba: t("<b>Paso 8 · Prueba atada.</b> «Encender (amarrado)»: si no se voltea, ¡está listo para volar!"),
});
const PASO_PIEZA = () => ({
  colocar: t("Arrastra la pieza hasta su <b>fantasma verde</b>. <kbd>R</kbd> la gira (la flecha va hacia adelante)."),
  colocar_cada: t("Arrastra cada motor hasta la punta de su brazo."),
  voltear: t("Toca el dron para darle la vuelta: estos tornillos van <b>por abajo</b>."),
  tornillos: t("Mantén el clic en cada anillo hasta oír el <b>clic</b>. Si sigues apretando, se barre la rosca."),
  clics: t("Toca cada anillo."),
  mantener: t("Mantén apretado sobre la pieza."),
});

/** El paso de ahora (la nota fija). */
function paso(p, s) {
  const N = p.negocio, nom = s.dron || t("tu dron");
  if (s.pantalla === "vuelo") return t("📷 Vuela hasta el <b>aro</b> y quédate quieto adentro: la foto se toma sola cuando el cuadro está bien.");
  if (s.pantalla === "estudio") {
    if (N.tutorial === 0) return t("💬 Abre <b>Mensajes</b> y lee lo que te escribió Doña Marta.");
    if (s.dronListo) return t("🚁 En <b>Mensajes</b>, abre el pedido de Doña Marta: acéptalo y dale volar.");
    return t("🔧 Primero arma «{d}»: cierra el computador con <b>🛠️ Hangar</b> (abajo).", { d: nom });
  }
  if (s.mesa?.modo === "armar") {
    const M = s.mesa, it = M.items || {};
    if (M.proc) return t("🔧 Montando <b>{pieza}</b>: sigue los pasos de la lista (izquierda).", { pieza: M.proc.pieza }) + " " + (PASO_PIEZA()[M.proc.paso] || "");
    if (it.caja) return t("📦 Mantén el clic sobre una <b>caja</b> para cortar la cinta y abrirla.");
    if (it.suelta) return t("🔩 Toca una pieza de la lista (izquierda) para montarla. <b>El orden importa</b>: lo de abajo primero.");
    if (it.camino) return t("🚚 Falta una pieza que viene en camino: llega cuando termines el día.");
    return t("✓ Todo montado. Arriba: <b>🔥 Soldar</b>.");
  }
  if (s.mesa?.modo === "soldar") {
    const M = s.mesa, placa = (k) => (k === "fc" ? t("Controladora") : "ESC");
    if (!M.cautin) return t("No tienes cautín: cómpralo en 💻 Computador → Tienda → Soldadura.");
    if (M.mano) {
      if (!M.mano.a) return t("Ese cable no va en esta placa: suéltalo con <kbd>Esc</kbd>.");
      return t("Llevas <b>{de}</b>. Va a <b>{a}</b>.", { de: M.mano.de, a: M.mano.a }) + " " +
        (M.mano.otraPlaca ? t("Ese pad está en la pestaña «{p}» de arriba.", { p: placa(M.mano.otraPlaca) }) : t("El <b>aro amarillo</b> te señala el pad: tócalo."));
    }
    if (M.soldar) {
      if (!M.on) return t("🔥 Prende la estación <b>⏻</b> (abajo) y espera que caliente.");
      if (M.temp < 280) return t("Calentando la punta… ({n} °C)", { n: M.temp });
      return t("Suelda <b>{pad}</b> (el aro amarillo): <kbd>F</kbd> flux, mantén el clic en el pad con el cautín y aprieta <kbd>Espacio</kbd> para el estaño, un segundo. Suelta.", { pad: M.soldar });
    }
    if (M.siguiente) return t("Toca en la lista (izquierda) el cable que brilla: <b>{c}</b>.", { c: M.siguiente });
    if (s.banco?.cablearOk) return t("✓ Todo soldado. Apaga la estación <b>⏻</b> y dale <b>Listo</b> (arriba).");
    if (M.otras?.length) return t("Esta placa está lista. Ahora la pestaña «{p}» de arriba.", { p: placa(M.otras[0]) });
    return t("Esta placa está lista.");
  }
  if (s.pantalla === "banco") return s.banco?.falta ? PASO_BANCO()[s.banco.falta] || "" : t("✓ ¡Listo para volar! «← Volver al hangar».");
  if (N.tutorial === 0) return t("💬 Te escribieron: abre el <b>💻 Computador</b> → <b>Mensajes</b>.");
  if (!s.hayDron) return t("🛒 Necesitas un dron: 💻 Computador → Tienda → 🎁 Kits.");
  if (!s.dronListo) return s.izq === "dron" ? t("🔧 Dale <b>Banco de armado</b> (abajo): ahí se arma, se suelda y se programa.")
    : t("🔧 Toca «{d}» en el hangar (izquierda) y luego <b>Banco de armado</b>.", { d: nom });
  return t("🚁 ¡Tu dron vuela! 💻 Computador → <b>Mensajes</b> → el pedido de Doña Marta.");
}

/** Los consejos: salen una vez en su lugar. */
function consejos(s) {
  const out = [];
  const c = (id, titulo, html) => out.push({ id, titulo, html });
  if (s.pantalla === "taller" && !s.estante) c("moverse", t("🧭 Cómo moverte"), t("<b>💻 Computador</b> (o toca el portátil de la mesa): mensajes, tienda, calendario, plata.<br><b>🗄️ Estante</b>: tus piezas y herramientas.<br><b>Hangar</b> (izquierda): tus drones; toca uno para abrirlo.<br>Arrastra la vista 3D para mirar el garaje."));
  if (s.estante) c("estante", t("🗄️ El estante"), t("Todo lo que tienes, por repisa. Al elegir piezas para un dron solo salen las de aquí; para comprar: 💻 Computador → Tienda."));
  if (s.pantalla === "banco") c("banco", t("🧭 El banco de armado"), t("Los pasos van en orden en la lista de la izquierda (✓ = hecho). «← Volver al hangar» arriba para salir: nada se pierde."));
  if (s.mesa) c("mesa_cam", t("🖱️ La cámara de la mesa"), t("Clic derecho y arrastrar: girar. Rueda: acercar. <b>Listo</b> (arriba) te devuelve al banco."));
  if (s.mesa?.modo === "armar") c("mesa_orden", t("🔩 El orden importa"), t("Lo de abajo primero: motores y el stack (ESC y controladora) antes que la batería; lo de arriba tapa lo de abajo. Para desmontar, mantén apretado sobre una pieza montada."));
  if (s.mesa?.modo === "soldar") {
    c("soldar_mapa", t("🗺️ Qué va dónde"), t("Al <b>ESC</b>: la batería (XT60) y los 4 motores. A la <b>controladora</b> (el ESP32): la radio, la cámara y el enchufe del ESC. Cada pad tiene su nombre impreso; las pestañas de arriba cambian de placa."));
    c("soldar_como", t("🔥 Cómo soldar bien"), t("1. Flux en el pad (<kbd>F</kbd>). 2. Cautín en el pad (mantén el clic) para calentarlo. 3. Estaño (<kbd>Espacio</kbd>): poquito. 4. Suelta.<br>Mucho estaño = <b>puente</b> (corto); pad frío = <b>junta fría</b>. La mesa no avisa: se descubre en la prueba de humo o con el multímetro."));
    c("soldar_punta", t("🧽 La punta del cautín"), t("Se ensucia con cada junta (la barrita de abajo): límpiala con <kbd>C</kbd>. Apaga la estación ⏻ al terminar o se oxida."));
  }
  if (s.pantalla === "estudio") c("estudio", t("💻 Tu computador"), t("Cada ícono es una app y se abre como ventana. Para volver al garaje: <b>🛠️ Hangar</b> (abajo)."));
  if (s.pantalla === "vuelo") c("vuelo_ctrl", t("🎮 Controles"), t("<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> mueven · <kbd>Espacio</kbd> sube · <kbd>Shift</kbd> baja · el ratón gira. También sirve un control de videojuego."));
  return out;
}

export function notas(p, s) {
  if (!activo(p)) return [];
  const vistas = new Set(p.tuto?.vistas || []);
  return [{ id: "paso", titulo: t("Tutorial · lo que sigue"), html: paso(p, s), fija: true }, ...consejos(s).filter((x) => !vistas.has(x.id))];
}
