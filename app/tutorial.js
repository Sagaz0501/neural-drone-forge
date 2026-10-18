// =====================================================================
// EL TUTORIAL DEL PRIMER DRON (el regalo de mamá): las etapas (obligatorias) y qué notas salen arriba a la derecha
// según dónde estás. Sin pantalla (la pantalla es notas.js; main.js arma el contexto cada medio segundo).
// test: node app/test_negocio.mjs
//
// Las etapas (p.tuto.etapa), en orden; vale en los dos modos:
//   regalo  -> aceptar el regalo de mamá
//   nombre  -> ponerle nombre al dron
//   armar   -> armarlo en el banco (el computador está CERRADO y nadie te escribe: negocio.espera)
//   pc      -> ya vuela: prender el computador y comprar en 🛍️ Apps los 2 programas que sí o sí se usan
//              (💬 Mensajes y el 🧠 Simulador o, en el modo desarrollador, el 💻 IDE); main.js pasa a "modelo" solo
//   modelo  -> la primera IA, en 2 pasos (PASOS_IA, cada uno se aprueba con 80 % SIN ruido): 🛫 E1 despegar y quedarse
//              (nivel 19, desde cero) y 📍 E2 ir a un punto (nivel 20, partiendo del modelo de E1: p.tuto.e1). Con E2 ya
//              hace la foto del NIVEL 0 (Doña Marta). En el modo desarrollador, paso a paso en el IDE: abrir el ejemplo,
//              cambiar la línea dron(…) por TU dron (👉 en el margen) y ▶ Correr
//   cliente -> llega el primer mensaje (Doña Marta) y sigue el tutorial del negocio (negocio.tutorial 0 -> 2)
// Las partidas de antes no tienen p.tuto.etapa (= "cliente").
//
// notas(p, s) -> [{ id, titulo, html, fija, resaltar? }]   (POCO texto: una línea que dice qué tocar)
//   fija = el paso de ahora ("Saltar el tutorial" lo apaga); resaltar = selector que brilla (lo que hay que tocar);
//   las demás son consejos cortos que se cierran (×) y no vuelven
// s = { pantalla, izq, hayDron, dronListo, dron, banco: {falta, cablearOk}, mesa (mesa.js estadoTuto), estante, modelo,
//       apps: { abierta, mensajes, entrenar } (la tienda de apps abierta y si ya compraste cada programa),
//       drones: los nombres del hangar, ide: estudio.estadoTuto() (el IDE abierto, el menú, la línea dron(…), corriendo) }
// =====================================================================
import { t } from "./i18n.js";

export const ETAPAS = ["regalo", "nombre", "armar", "pc", "modelo", "cliente"];
export const META_EXITO = 0.8;
/** Los 2 entrenamientos del tutorial: el escenario (escenarios.json), su nivel y el ejemplo de PBDMM que lo entrena. */
export const PASOS_IA = [{ id: "despegar", nivel: 19, ej: "despegar", icono: "🛫" }, { id: "punto", nivel: 20, ej: "ir_a_punto", icono: "📍" }];
/** El paso de la IA en el que va el tutorial (E1 hasta que un modelo lo aprueba: p.tuto.e1). */
export const pasoIA = (p) => PASOS_IA[p?.tuto?.e1 ? 1 : 0];
export const etapa = (p) => p?.tuto?.etapa || "cliente";
const antesDe = (p, e) => ETAPAS.indexOf(etapa(p)) < ETAPAS.indexOf(e);

/** ¿Sigue el tutorial? */
export function activo(p) {
  if (!p || p.tuto?.off) return false;
  return antesDe(p, "cliente") || (!!p.negocio && p.negocio.tutorial < 2);
}
/** Mientras armas el regalo, el computador no se abre (y nadie te escribe). */
export const pcCerrado = (p) => !p?.tuto?.off && antesDe(p, "pc");
export function pasarA(p, e) { p.tuto = { ...(p.tuto || {}), etapa: e }; }
export const saltar = (p) => { p.tuto = { ...(p.tuto || {}), off: true, etapa: "cliente" }; };

/**
 * El éxito del mejor modelo en un nivel (13 = la foto; el tutorial usa 19 y 20): el mejor modelo (sin contar el base)
 * con al menos 3 generaciones de ese nivel entrenadas DESPUÉS de empezar esta etapa (antes = {slug: gen} al empezar;
 * una copia parte de su gen). modelos = /api/modelos. Devuelve { slug, exito, filas } o null.
 */
export function exitoFoto(modelos, antes = {}, nivel = 13) {
  let mejor = null;
  for (const m of modelos || []) {
    if (m.slug === "base") continue;
    const desde = antes[m.slug] ?? antes[m.base_de || ""] ?? 0;
    const filas = (m.recientes?.[String(nivel)] || []).filter(([g]) => g > desde).slice(-5);
    if (!filas.length) continue;
    const exito = filas.reduce((a, [, e]) => a + (e || 0), 0) / filas.length;
    const r = { slug: m.slug, exito: filas.length >= 3 ? exito : Math.min(exito, META_EXITO - 0.01), filas: filas.length };
    if (!mejor || r.exito > mejor.exito) mejor = r;
  }
  return mejor;
}
/** Los modelos que cuentan para el tutorial: entrenaron ese nivel DESPUÉS del tour (3 filas o más). El juego les
 *  pide la nota sin ruido al servidor (/api/evaluar): el éxito del entrenamiento lleva el ruido de exploración y sale
 *  mucho más bajo (un modelo que acierta 80 % sin ruido marca ~30 % entrenando). */
export function candidatosFoto(modelos, antes = {}, nivel = 13) {
  return (modelos || []).filter((m) => m.slug !== "base").map((m) => {
    const desde = antes[m.slug] ?? antes[m.base_de || ""] ?? 0;
    return { slug: m.slug, filas: (m.recientes?.[String(nivel)] || []).filter(([g]) => g > desde).length };
  }).filter((c) => c.filas >= 3);
}
export const visto = (p, id) => { p.tuto = { ...(p.tuto || {}), vistas: [...new Set([...(p.tuto?.vistas || []), id])] }; };

/** ¿La línea dron(…) del programa ya dice uno de tus drones? */
const dronTuyo = (s) => (s.drones || []).some((n) => n.trim().toLowerCase() === String(s.ide?.dron?.valor ?? "").trim().toLowerCase());
/** La línea del editor que el tutorial señala (👉): la de dron(…) mientras no diga tu dron. */
export function lineaTuto(p, s) {
  return activo(p) && p.modo === "dev" && etapa(p) === "modelo" && !s.modelo && s.pantalla === "estudio" && s.ide?.mision === pasoIA(p).id && s.ide.dron && !dronTuyo(s) ? s.ide.dron.linea : null;
}

const PASO_BANCO = () => ({
  imprimir: t("🖨️ Elige la forma → «Imprimir»."),
  armar: t("🔧 «Ir a la mesa de trabajo»."),
  cablear: t("🔥 «Ir a soldar»."),
  humo: t("🔋 «Conectar la batería»."),
  firmware: t("💾 Elige el firmware → «Flashear»."),
  config: t("⚙️ «Calibrar» → Radio → «Emparejar»."),
  motores: t("🌀 ▶ Probar motores: si alguno sale ✗, toca el botón que aparece."),
  helices: t("🪁 «Poner las hélices»."),
  prueba: t("🪢 «Encender (amarrado)»."),
});
const PASO_PIEZA = () => ({
  colocar: t("Arrástrala al fantasma verde. <kbd>R</kbd> gira."),
  colocar_cada: t("Cada motor a su brazo."),
  voltear: t("Toca el dron para voltearlo."),
  tornillos: t("Mantén el clic en cada anillo hasta el clic."),
  clics: t("Toca cada anillo."),
  mantener: t("Mantén apretado."),
});

/** El paso de ahora (la nota fija): { html, resaltar? } o un texto. */
function paso(p, s) {
  const N = p.negocio || { tutorial: 0 }, nom = s.dron || t("tu dron"), E = etapa(p), dev = p.modo === "dev";
  const pc = { html: t("💻 Prende el computador."), resaltar: "#b-computador" };
  const aHangar = () => (s.izq === "dron" ? t("🔧 «Banco de armado» (abajo).") : t("🔧 Toca «{d}» en el hangar → Banco de armado.", { d: nom }));
  if (s.pantalla === "vuelo") return t("📷 Vuela al aro y quédate quieto.");
  if (E === "regalo") return t("🎁 Abre el regalo.");
  if (E === "nombre") return t("✏️ Ponle nombre a tu dron.");
  if (E === "pc") {
    if (s.pantalla !== "estudio") return { ...pc, html: t("🎉 ¡Vuela! Prende el 💻 computador.") };
    const A = s.apps || {};
    if (!A.abierta) return { html: t("🛍️ Abre <b>Apps</b>."), resaltar: '.es-icono[data-w="apps"]' };
    if (!A.mensajes) return { html: t("💬 Compra <b>Mensajes</b>."), resaltar: '.sw-comprar[data-sw="mensajes"]' };
    return dev ? { html: t("💻 Compra el <b>IDE</b>."), resaltar: '.sw-comprar[data-sw="ide"]' }
      : { html: t("🧠 Compra el <b>Simulador de IA</b>."), resaltar: '.sw-comprar[data-sw="simulador"]' };
  }
  if (E === "modelo") {
    const m = s.modelo, pct = (x) => Math.round(x * 100), PI = pasoIA(p), k = PASOS_IA.indexOf(PI) + 1;
    const cual = `<b>${PI.icono} ${k}/${PASOS_IA.length}</b> · `;
    const progreso = m ? `<br>🧠 «${m.slug}» <b>${pct(m.exito)} %</b> / ${pct(META_EXITO)} %<span class="nota-barra"><i style="width:${Math.min(100, pct(m.exito / META_EXITO))}%"></i></span>` : "";
    const con = (x) => (typeof x === "string" ? cual + x : { ...x, html: cual + x.html });
    if (s.pantalla !== "estudio" && G_LAB(s)) return con(t("🎓 «Empezar a entrenar».") + progreso);
    if (s.pantalla !== "estudio") return con({ ...pc, html: pc.html + progreso });
    if (m) return con(t("⏳ Deja que entrene hasta {meta} %.", { meta: pct(META_EXITO) }) + progreso);
    if (dev) {                                     // el IDE, paso a paso: el ejemplo, tu dron, ▶ Correr
      const I = s.ide || {};
      if (!I.ide) return con({ html: t("💻 Abre el <b>IDE</b>."), resaltar: '.es-icono[data-w="ide"]' });
      if (I.mision !== PI.id || !I.dron) return con(I.menu ? { html: t("📄 Ejemplos → <b>{ej}</b>.", { ej: PI.ej }), resaltar: `#es-ejemplos [data-ej="${PI.ej}"]` }
        : { html: t("📄 Toca el nombre del programa (arriba) para ver los ejemplos."), resaltar: "#es-archivo-b" });
      if (!dronTuyo(s)) return con({ html: t("👉 Línea {n}: cambia «{x}» por «{d}». Así la IA aprende con TU dron.", { n: I.dron.linea, x: I.dron.valor ?? "…", d: nom }), resaltar: "#es-gut .tuto" });
      if (!I.corriendo) return con({ html: PI.id === "punto" ? t("▶ Dale <b>Correr</b>: parte de lo que ya sabe (desde=).") : t("▶ Dale <b>Correr</b>: empieza a entrenar."), resaltar: "#es-correr" });
      return con(t("⏳ Está aprendiendo. Mira la terminal (abajo)."));
    }
    return con({ html: PI.id === "punto" ? t("🎮 Simuladores → 📍 Ir a un punto → Entrenar.") : t("🎮 Simuladores → 🛫 Despegar y quedarse → Entrenar."), resaltar: '.es-icono[data-w="escenarios"]' });
  }
  if (s.pantalla === "estudio") {
    if (N.tutorial === 0) return { html: t("💬 Abre <b>Mensajes</b>."), resaltar: '.es-icono[data-w="mensajes"]' };
    if (s.dronListo) return t("🚁 Mensajes → Doña Marta → Aceptar.");
    return t("🔧 Arma «{d}»: 🛠️ Hangar (abajo).", { d: nom });
  }
  if (s.mesa?.modo === "armar") {
    const M = s.mesa, it = M.items || {};
    if (M.proc) return `🔧 <b>${M.proc.pieza}</b>: ` + (PASO_PIEZA()[M.proc.paso] || "");
    if (it.caja) return t("📦 Mantén el clic en una caja.");
    if (it.suelta) return t("🔩 Toca una pieza (izquierda). Lo de abajo primero.");
    if (it.camino) return t("🚚 Una pieza viene en camino.");
    return t("✓ Listo. Arriba: 🔥 Soldar.");
  }
  if (s.mesa?.modo === "soldar") {
    const M = s.mesa, placa = (k) => (k === "fc" ? t("Controladora") : "ESC");
    if (!M.cautin) return t("Compra un cautín: 🛒 Tienda → Soldadura.");
    if (M.mano) {
      if (!M.mano.a) return t("Ese cable no va aquí: <kbd>Esc</kbd>.");
      return `${M.mano.de} → <b>${M.mano.a}</b>. ` + (M.mano.otraPlaca ? t("Pestaña «{p}» (arriba).", { p: placa(M.mano.otraPlaca) }) : t("Toca el aro amarillo."));
    }
    if (M.soldar) {
      if (!M.on) return t("⏻ Prende la estación (abajo).");
      if (M.temp < 280) return t("🌡️ Calentando… {n} °C", { n: M.temp });
      if (!M.fluxOk) return M.mano2 === "flux" ? t("💧 Toca el pad del aro amarillo.") : t("💧 Toma el <b>flux</b> (la jeringa, a la derecha).");
      if (M.mano2 !== "estano") return t("🧵 Toma el <b>estaño</b> (a la derecha).");
      return t("🔥 Mantén el clic en el pad + <kbd>Espacio</kbd>.");
    }
    if (M.siguiente) return t("Toca el cable que brilla (izquierda).");
    if (s.banco?.cablearOk) return t("✓ Apaga ⏻ y dale <b>Listo</b>.");
    if (M.otras?.length) return t("Ahora la pestaña «{p}».", { p: placa(M.otras[0]) });
    return t("✓ Placa lista.");
  }
  if (s.pantalla === "banco") return s.banco?.falta ? PASO_BANCO()[s.banco.falta] || "" : t("✓ ¡Listo para volar! «← Volver al hangar».");
  if (E === "armar") return aHangar();
  if (N.tutorial === 0) return { ...pc, html: t("💬 💻 Computador → Mensajes.") };
  if (!s.hayDron) return t("🛒 Compra un kit: 💻 → Tienda.");
  if (!s.dronListo) return aHangar();
  return t("🚁 💻 → Mensajes → Doña Marta.");
}

/** Los consejos: cortos, salen una vez en su lugar (× los cierra). */
function consejos(s) {
  const out = [];
  const c = (id, html) => out.push({ id, html });
  if (s.pantalla === "taller" && !s.estante) c("moverse", t("🛠️ Hangar = tus drones · 🗄️ Estante = tus cosas · 💻 = el computador."));
  if (s.estante) c("estante", t("🗄️ Tus piezas y herramientas, por repisa."));
  if (s.pantalla === "banco") c("banco", t("📋 Los pasos van en orden (izquierda)."));
  if (s.mesa) c("mesa_cam", t("🖱️ Clic derecho: girar · rueda: acercar."));
  if (s.mesa?.modo === "armar") c("mesa_orden", t("🔩 Lo de abajo primero. Mantén sobre una pieza para desmontarla."));
  if (s.mesa?.modo === "soldar") {
    c("soldar_mapa", t("🗺️ Batería y motores → ESC. Radio y cámara → controladora."));
    c("soldar_como", t("💧 Flux → 🔥 cautín en el pad → 🧵 poquito estaño. Mucho estaño = puente."));
    c("soldar_punta", t("🧽 Toca la esponja para limpiar la punta. Apaga ⏻ al terminar."));
    c("desoldar", t("🥤 Bomba (<kbd>Espacio</kbd>) o 🟫 malla + el cautín en la junta = desoldar."));
  }
  if (s.pantalla === "estudio") c("estudio", t("💻 Cada ícono es una app. 🛠️ Hangar (abajo) para volver."));
  if (s.ide?.ide && s.ide.mision) c("ide_notas", t("💡 Lo que va después de <b>#</b> son notas para ti: el programa no las lee."));
  if (s.pantalla === "vuelo") c("vuelo_ctrl", t("🎮 <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> · <kbd>Espacio</kbd> sube · <kbd>Shift</kbd> baja · ratón gira."));
  return out;
}

const G_LAB = (s) => s.pantalla === "lab";

export function notas(p, s) {
  if (!activo(p)) return [];
  const vistas = new Set(p.tuto?.vistas || []), ps = paso(p, s), fija = typeof ps === "string" ? { html: ps } : ps;
  return [{ id: "paso", fija: true, saltable: !antesDe(p, "cliente"), ...fija }, ...consejos(s).filter((x) => !vistas.has(x.id))];
}
