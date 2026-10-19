// =====================================================================
// El ESTUDIO PBDMM (modo desarrollador): un "escritorio" para crear y entrenar modelos con el lenguaje PBDMM.
//   arriba: la barra (programas, correr, qué modelo mirar + Avance/Simular, las ventanas, el manual)
//   ventanas que se mueven y se agrandan: editor, terminal, gráfica, red neuronal en vivo, ruta (layout en localStorage)
//   la documentación va en ventanitas (📖 Manual, F1 sobre una palabra, 💡 lecciones, el detalle de cada capítulo)
// Correr un programa = el mismo pedido que el Laboratorio (POST /api/lab -> live_train.py, en el fondo o en Blender);
// mientras entrena, el estudio lee el progreso (GET /api/lab) y llama las funciones del programa (cada_generacion…).
// El lenguaje vive en pbdmm.js; la ayuda en data/pbdmm.json.
// =====================================================================
import { compilar, pedidoDe, estadoE, ErrorPB, repr, nivelDe, recomendados, traducirCodigo } from "./pbdmm.js";
import { contexto, opciones, delPrograma } from "./autocompletar.js";
import { dibujarRed as pintarRed } from "./redviz.js";
import { t, datos, idioma, num } from "./i18n.js";
import { confirmar, pedirTexto } from "./dialogo.js";
import { pieza } from "./parts.js";
import { mundoLugar, alcanceNecesario } from "./lugares.js";
import * as RUTA from "./ruta.js";
import * as NG from "./negocio.js";
import * as ESC from "./escenarios.js";
import * as SW from "./software.js";
import { sfx } from "./garaje.js";
const numero = (x) => (Number.isInteger(x) ? String(x) : num(x, 1));       // 4,5 / 4.5 según el idioma

const ARCH = "dronmaker.pbdmm.archivos", ABIERTO = "dronmaker.pbdmm.abierto";
const leerLS = (k, d) => { try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : d; } catch { return d; } };
const ponerLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } };
const pct = (x) => (typeof x === "number" ? Math.round(x * 100) + " %" : "—");
const chispa = (xs) => xs.map((x) => (typeof x === "number" ? "▁▂▃▄▅▆▇█"[Math.max(0, Math.min(7, Math.floor(x * 8)))] : " ")).join("");

export function initEstudio(ctx) {
  const { $, esc, api, toast } = ctx;
  const ES = { data: null, archivos: leerLS(ARCH, null), abierto: leerLS(ABIERTO, null), hist: [], hi: -1,
    run: null, poll: 0, graf: null, grafSlug: null, modelos: [], todos: [], errLinea: null, marca: null, tema: null,
    ac: { items: [], sel: 0, cx: null, abierto: false }, red: null, redPoll: 0 };

  async function cargarData() {
    if (ES.data) return ES.data;
    const r = await fetch("data/pbdmm.json");
    ES.data = await datos("pbdmm", await r.json());            // + la capa del idioma (data/en/pbdmm.json)
    RUTA.usarCapitulos(ES.data.ruta);
    if (!ES.archivos) {                                       // una partida nueva empieza sin programas
      ES.archivos = enCero() ? {} : { mi_primer_modelo: ES.data.ejemplos.hover };
      ES.abierto = enCero() ? null : "mi_primer_modelo";
      guardarArchivos();
    }
    if (!ES.archivos[ES.abierto]) ES.abierto = Object.keys(ES.archivos)[0] || null;
    return ES.data;
  }
  /** Los programas son DE LA PARTIDA (p.pbdmm, van en su archivo); localStorage queda como copia de la que juegas. */
  const guardarArchivos = () => {
    ponerLS(ARCH, ES.archivos); ponerLS(ABIERTO, ES.abierto);
    const p = ctx.P();
    if (!p) return;
    p.pbdmm = { archivos: ES.archivos, abierto: ES.abierto };
    clearTimeout(guardarArchivos.t);
    guardarArchivos.t = setTimeout(() => ctx.guardar(), 300);       // al escribir: no en cada tecla
  };
  /** Cambiaste de partida: sus programas. Una partida de antes (sin p.pbdmm) se queda con los de localStorage. */
  function deLaPartida(p) {
    if (!p) return;
    if (p.pbdmm) { ES.archivos = { ...(p.pbdmm.archivos || {}) }; ES.abierto = p.pbdmm.abierto ?? null; }
    else if (ES.archivos) p.pbdmm = { archivos: ES.archivos, abierto: ES.abierto };
    if (ES.archivos) { ponerLS(ARCH, ES.archivos); ponerLS(ABIERTO, ES.abierto); }
    ES.modelos = [];
    if (ES.data) { if (!ES.archivos[ES.abierto]) ES.abierto = Object.keys(ES.archivos)[0] || null; renderArchivos(); cargarEditor(); }
  }
  const enCero = () => ctx.PT.enCero(ctx.P());
  /** Partida nueva: sin programas (los de antes quedan de respaldo en localStorage "dronmaker.pbdmm.archivos_respaldo"). */
  function vaciar() {
    if (ES.archivos && Object.keys(ES.archivos).length) ponerLS(ARCH + "_respaldo", ES.archivos);
    ES.archivos = {}; ES.abierto = null; ES.modelos = []; guardarArchivos();
    if (ES.data) { renderArchivos(); cargarEditor(); }
  }
  /** Un ejemplo para esta partida: sin la IA base (desde="cero") y con un nombre de modelo que no use nadie más. */
  function adaptarEjemplo(src) {
    // desde="mi_piloto" (el ejemplo ir_a_punto): si no tienes ese modelo, el que aprobó el escenario anterior (o cero)
    src = src.replace(/\b(desde|start_from)\s*=\s*"([^"]+)"/g, (x, k, m) => {
      if (["cero", "zero", "base"].includes(m) || ES.modelos.some((y) => y.slug === m)) return x;
      const mi = /^\s*(?:mision|mission)\s*\(\s*"([^"]*)"/m.exec(src), deEn = Object.fromEntries(Object.entries(ES.data?.alias_en?.misiones || {}).map(([es, en]) => [en, es]));
      const e = mi && ESC.deMision(ctx.escenarios, deEn[mi[1]] || mi[1]);
      const otro = (e && ESC.desdePara(ctx.P(), ctx.escenarios, e.id, (s) => ES.modelos.some((y) => y.slug === s))) || ctx.P()?.tuto?.e1;
      return `${k}="${otro || (k === "desde" ? "cero" : "zero")}"`;
    });
    if (!enCero()) return src;
    src = src.replace(/\b(desde|start_from)\s*=\s*"base"/g, (_, k) => `${k}="${k === "desde" ? "cero" : "zero"}"`);
    return src.replace(/\b(modelo|model)\(\s*"([^"]+)"/, (x, f, m) => {
      let n = m, k = 2;
      while (ES.todos.some((y) => y.slug === n) && !ES.modelos.some((y) => y.slug === n)) n = `${m}_${k++}`;
      return `${f}("${n}"`;
    });
  }
  /** Lo que el compilador necesita saber del juego. */
  const dataCompilar = () => ({
    ...ES.data, misiones: ctx.ent.misiones, drones: ctx.P().drones.map((d) => d.nombre),
    premiosValidos: [...new Set([...ctx.ent.premios.map((p) => p.k), "near"])],
    tiposPremio: { ...Object.fromEntries(ctx.ent.premios.map((p) => [p.k, p.tipo])), near: "premio" },
    premiosInfo: Object.fromEntries(ctx.ent.premios.map((p) => [p.k, p])),     // explicar("encuadre")
    escala: ctx.ent.escala_premios,
    modelos: ES.modelos.length || enCero() ? ES.modelos : null,     // para revisar desde="otro" (si no hay lista, no se revisa)
    sinBase: enCero(),                                  // partida nueva: sin la IA base (desde="cero" por defecto)
    ocupados: enCero() ? ES.todos.filter((m) => m.slug !== "base" && !ES.modelos.some((y) => y.slug === m.slug)).map((m) => m.slug) : [],
    ...leerJuego(),                                     // PBDMM 2: hangar, misionInfo, inventario (dron_info, revisar, tabla…)
    ...simuladores(),                                   // PBDMM 3: solo las misiones y funciones de los simuladores que tienes
  });
  /** PBDMM 3: lo que abren tus simuladores (escenarios.js): misiones, niveles, funciones y el plan de vuelo de cada misión. */
  function simuladores() {
    const d = ESC.disponibles(ctx.P(), ctx.escenarios);
    return { misionesDisponibles: d.misiones, nivelesDisponibles: d.niveles, bloqueadas: d.bloqueadas, planes: d.planes,
      repaso: (slug, nivel) => ESC.repasoDe(ctx.P(), ctx.escenarios, slug, nivel),
      modosPremios: Object.fromEntries(ESC.lista(ctx.escenarios).map((e) => [e.mision, e.premios_modo || "libre"])) };
  }
  /** Lo que PBDMM 2 puede leer del juego: los drones del hangar (con su física), lo que pide cada misión y las piezas. */
  function leerJuego() {
    const p = ctx.P(), cat = ctx.cat, PT = ctx.PT;
    const nombre = (ranura, id) => (id ? pieza(cat, ranura, id)?.nombre || id : null);
    const hangar = p.drones.map((d) => {
      const b = PT.build(p, d), arm = PT.dronArmado(p, cat, d);
      return { nombre: d.nombre, proposito: d.proposito || "", modelo: d.modelo || null, listo: !!(arm?.stats.ok && ctx.estadoDe(d).listo),
        st: arm?.stats.ok ? arm.stats : null,
        piezas: Object.fromEntries(PT.RANURAS.map(([slot, ranura]) => [slot, nombre(ranura, b[slot])])),
        extras: (b.extras || []).map((id) => nombre("extras", id)) };
    });
    if (!ES.misionInfo) {                               // lo que pide cada misión: los requisitos de su pedido de la campaña
      ES.misionInfo = {};
      for (const m of ctx.ent.misiones) {
        const pe = m.pedido && ctx.mis.pedidos.find((x) => x.id === m.pedido);
        if (!pe?.tomas) { if (m.requisitos_ia) ES.misionInfo[m.id] = { para: m.para, requisitos: { ...m.requisitos_ia }, ctx: {} }; continue; }
        const M = mundoLugar(pe.lugar, pe);
        ES.misionInfo[m.id] = { para: pe.titulo, requisitos: { ...(pe.requisitos || {}), ...(m.requisitos_ia || {}) },
          ctx: { segundos: M.shots.reduce((a, x) => a + x.dur, 0), viento: m.viento ?? M.wind, alcance: alcanceNecesario(M.shots) } };
      }
    }
    const ranuraDe = (id) => Object.keys(cat).find((k) => Array.isArray(cat[k]) && cat[k].some((x) => x.id === id)) || "?";
    const inventario = p.inventario.map((u) => { const r = ranuraDe(u.id), pz = pieza(cat, r, u.id); return { nombre: pz?.nombre || u.id, ranura: r, vida: u.vida, precio: pz?.precio ?? 0, en: PT.dronDe(p, u.uid)?.nombre || null }; });
    return { hangar, misionInfo: ES.misionInfo, inventario };
  }

  // ---------------- abrir / cerrar ----------------
  /** Abrir el computador (y, si dices cuál, una app: "mensajes", "campana", "tienda"…). */
  async function abrir(app = null) {
    await cargarData();
    cargarVentanas();
    ctx.show("estudio");
    const p = ctx.P();
    $("es-logo").textContent = esDev() ? "PBDMM" : p?.empresa || t("Mi taller");
    $("es-blender").style.display = esDev() ? "" : "none";          // (.btn ignora el atributo hidden)
    if (app && permitida(app)) setTimeout(() => ventana(app, true), 50);
    else if (app && delModo(app)) {                    // no la tienes: la tienda de apps, con ese programa a la vista
      const x = SW.deApp(ctx.software, p, app);
      ES.appsFoco = x?.id || null;
      if (x) toast(`${x.icono} ${t("Necesitas «{x}»: está en 🛍️ Apps.", { x: x.nombre })}`, 3500);
      setTimeout(() => ventana("apps", true), 50);
    }
    else if (!esDev() && p?.negocio && NG.noLeidos(p) && !Object.keys(ES.win).some((w) => ES.win[w].open)) setTimeout(() => ventana("mensajes", true), 50);
    renderArchivos();
    cargarEditor();
    colocar();
    cargarModelos().then(renderSel);     // para autocompletar modelo(…) y desde=, y el selector de arriba
    if (!$("es-out").childElementCount) {
      linea(`PBDMM ${ES.data.version} · Python Base Dron Model Maker`, "ok");
      linea(t("ayuda = comandos · 📖 Manual o F1 = el lenguaje · Ctrl/⌘+Enter = correr"), "muted");
    }
    sondear(true);
    redSondear(true);
    ponerFondo();
    if (abierta("ide")) $("es-src").focus();
  }
  function cerrar() { sondear(!!ES.run); redSondear(false); menuArchivos(false); for (const w of Object.keys(HOST)) ventana(w, false); ctx.irTaller(); }

  // ---------------- editor ----------------
  const KWS = /\b(def|return|if|elif|else|for|in|and|or|not|is|global|pass|break|continue)\b/;
  function resaltar(src) {
    const AL = ES.data?.alias_en || {};
    const fns = new Set((ES.data?.funciones || []).map((f) => f.nombre).concat(Object.values(AL.funciones || {}), ["print", "str", "int", "float", "round", "abs", "min", "max", "sum", "len", "range", "list", "type"]));
    const hooks = new Set([...(ES.data?.hooks || []), ...Object.values(AL.hooks || {})]);
    const re = /(#.*$)|([fF]?"(?:[^"\\]|\\.)*"?|[fF]?'(?:[^'\\]|\\.)*'?)|(\b\d[\d_]*\.?\d*(?:[eE][-+]?\d+)?\b)|([A-Za-z_áéíóúñÁÉÍÓÚÑ][\wáéíóúñÁÉÍÓÚÑ]*)/gm;
    let out = "", i = 0, m;
    while ((m = re.exec(src))) {
      out += esc(src.slice(i, m.index));
      const [tok] = m;
      let c = null;
      if (m[1]) c = "c"; else if (m[2]) c = "s"; else if (m[3]) c = "n";
      else if (m[4]) c = KWS.test(tok) && tok.length === tok.match(KWS)[0].length ? "k" : /^(True|False|None)$/.test(tok) ? "n" : hooks.has(tok) ? "h" : fns.has(tok) && /^\s*\(/.test(src.slice(re.lastIndex)) ? "f" : tok === "e" ? "e" : null;
      out += c ? `<span class="t${c}">${esc(tok)}</span>` : esc(tok);
      i = re.lastIndex;
    }
    return out + esc(src.slice(i)) + "\n";
  }
  function pintar() {
    const src = $("es-src").value;
    $("es-hl").innerHTML = resaltar(src);
    const n = src.split("\n").length;
    $("es-gut").innerHTML = Array.from({ length: n }, (_, i) => `<div class="${ES.errLinea === i + 1 ? "err" : ES.marca === i + 1 ? "tuto" : ""}">${ES.marca === i + 1 && ES.errLinea !== i + 1 ? "👉" : i + 1}</div>`).join("");
    sincScroll();
  }
  function sincScroll() { const ta = $("es-src"); $("es-hl").scrollTop = ta.scrollTop; $("es-hl").scrollLeft = ta.scrollLeft; $("es-gut").scrollTop = ta.scrollTop; }
  function cargarEditor() {
    $("es-src").value = ES.archivos[ES.abierto] ?? "";
    $("es-src").readOnly = !ES.abierto;
    $("es-src").placeholder = ES.abierto ? "" : t("Sin programa abierto: crea uno (+ Nuevo) o abre un ejemplo.");
    $("es-nombre").textContent = ES.abierto ? ES.abierto + ".pbd" : t("(sin archivo)");
    $("es-ed-sub").textContent = ES.abierto ? ES.abierto + ".pbd" : "";
    ES.errLinea = null;
    pintar();
  }
  $("es-src").addEventListener("input", () => {
    if (ES.abierto) { ES.archivos[ES.abierto] = $("es-src").value; guardarArchivos(); }
    if (ES.errLinea) ES.errLinea = null;
    pintar();
    autocompletar(false);
  });
  $("es-src").addEventListener("scroll", () => { sincScroll(); cerrarAC(); });
  $("es-src").addEventListener("click", () => autocompletar(false));
  $("es-src").addEventListener("blur", () => setTimeout(cerrarAC, 150));
  $("es-src").addEventListener("keydown", (ev) => {
    const ta = ev.target, s = ta.selectionStart, v = ta.value;
    const A = ES.ac;
    if (A.abierto && A.items.length) {
      if (ev.key === "ArrowDown" || ev.key === "ArrowUp") { ev.preventDefault(); A.sel = (A.sel + (ev.key === "ArrowDown" ? 1 : -1) + A.items.length) % A.items.length; pintarAC(); return; }
      if ((ev.key === "Enter" && !ev.metaKey && !ev.ctrlKey) || ev.key === "Tab") { ev.preventDefault(); aceptarAC(A.items[A.sel]); return; }
    }
    if (A.abierto && ev.key === "Escape") { ev.preventDefault(); cerrarAC(); return; }
    if (ev.ctrlKey && ev.code === "Space") { ev.preventDefault(); autocompletar(true); return; }
    if (ev.key === "F1") { ev.preventDefault(); cerrarAC(); ayudaAqui(); return; }
    if ((ev.metaKey || ev.ctrlKey) && ev.key === "Enter") { ev.preventDefault(); comando("correr"); return; }
    if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === "s") { ev.preventDefault(); toast(t("Guardado (se guarda solo en este navegador). Para tenerlo en un archivo: Descargar.")); return; }
    if (ev.key === "Tab") { ev.preventDefault(); ta.setRangeText("    ", s, ta.selectionEnd, "end"); ta.dispatchEvent(new Event("input")); return; }
    if (ev.key === "Enter") {
      const ini = v.lastIndexOf("\n", s - 1) + 1, lin = v.slice(ini, s);
      let ind = /^ */.exec(lin)[0];
      if (/:\s*(#.*)?$/.test(lin)) ind += "    ";
      ev.preventDefault();
      ta.setRangeText("\n" + ind, s, ta.selectionEnd, "end");
      ta.dispatchEvent(new Event("input"));
    }
  });
  // ---------------- autocompletado: dron( -> "estandar", "azar", tus drones… ----------------
  const fuentesAC = () => ({
    data: { ...ES.data, funciones: ES.data.funciones.filter((f) => !simuladores().bloqueadas[f.nombre]) },   // el autocompletado solo ofrece lo que tienes
    misiones: ctx.ent.misiones.filter((m) => simuladores().misionesDisponibles.has(m.id)), nombresNiveles: ES.data.nombres_niveles,
    drones: ctx.P().drones.map((d) => d.nombre), modelos: ES.modelos, programa: delPrograma($("es-src").value),
    lang: idioma(), alias: ES.data.alias_en,
    premios: [...ctx.ent.premios, { k: "near", tipo: "premio", desc: t("Por estar cerca de la meta (niveles de metas y hover).") }]
      .map((p) => ({ ...p, alias: Object.entries(ES.data.alias_premios).find(([, k]) => k === p.k)?.[0], rec: recomendados(ctx.ent.misiones, ctx.ent.escala_premios)[p.k] })),
  });
  let anchoLetra = 0;
  function autocompletar(forzar) {
    const ta = $("es-src"), A = ES.ac;
    if (!ES.data || ta.readOnly || ta.selectionStart !== ta.selectionEnd) return cerrarAC();
    const cx = contexto(ta.value.slice(0, ta.selectionStart));
    let items = cx ? opciones(cx, fuentesAC()) : [];
    if (!forzar && cx?.tipo === "nombre" && cx.parcial.length < 2) items = [];
    if (items.length === 1 && cx && items[0].txt.replace(/[(=:]$/, "") === ta.value.slice(cx.desde, ta.selectionStart)) items = [];   // ya está escrito
    const fn = cx?.tipo === "arg" ? ES.data.funciones.find((f) => f.nombre === cx.fn) : null;
    if (fn?.nombre === "modelo" && Date.now() - (ES.modelosT || 0) > 3000) {      // modelos nuevos (recién entrenados)
      ES.modelosT = Date.now();
      cargarModelos().then(() => { if (ES.ac.abierto && ES.ac.fn?.nombre === "modelo") autocompletar(forzar); });
    }
    if (!items.length && !fn) return cerrarAC();
    Object.assign(A, { items, cx, fn, sel: 0, abierto: true });
    pintarAC();
  }
  function pintarAC() {
    const A = ES.ac, box = $("es-ac"), ta = $("es-src");
    if (!A.abierto) { box.hidden = true; return; }
    if (!anchoLetra) { const g = document.createElement("canvas").getContext("2d"); g.font = getComputedStyle(ta).font; anchoLetra = g.measureText("MMMMMMMMMM").width / 10; }
    const antes = ta.value.slice(0, A.cx.desde), lin = antes.split("\n").length - 1, col = antes.length - antes.lastIndexOf("\n") - 1;
    const area = $("es-area").getBoundingClientRect();
    let x = 12 + col * anchoLetra - ta.scrollLeft, y = 10 + (lin + 1) * 20 - ta.scrollTop + 2;
    const fn = A.fn;
    box.innerHTML = (fn ? `<div class="ac-firma"><code>${esc(fn.firma)}</code>${A.cx.kw ? ` · <b>${esc(A.cx.kw)}</b>` : ""}<br><span>${esc((fn.params.find(([k]) => A.cx.kw && k.split(" ")[0] === A.cx.kw)?.[1]) || fn.desc.split(". ")[0] + ".")}</span></div>` : "") +
      A.items.map((it, i) => `<div class="ac-op" role="option" aria-selected="${i === A.sel}" data-i="${i}"><code>${esc(it.label)}</code><span>${esc(it.det || "")}</span></div>`).join("") +
      (A.items.length ? `<div class="ac-pie">${t("↑↓ elegir · Enter/Tab poner · Esc cerrar · Ctrl+Espacio abrir")}</div>` : "");
    box.hidden = false;
    const w = box.offsetWidth, h = box.offsetHeight;
    if (x + w > area.width - 8) x = Math.max(4, area.width - w - 8);
    if (y + h > area.height - 4) y = Math.max(4, y - h - 24);       // si no cabe abajo, arriba de la línea
    box.style.left = x + "px"; box.style.top = y + "px";
    box.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
    box.querySelectorAll(".ac-op").forEach((el) => {
      el.onmousedown = (ev) => { ev.preventDefault(); aceptarAC(A.items[+el.dataset.i]); };
    });
  }
  function aceptarAC(it) {
    const ta = $("es-src"), A = ES.ac, fin = ta.selectionStart;
    if (!it || !A.cx) return;
    // lo que ya escribiste de ese argumento (y una comilla de cierre que haya quedado)
    let hasta = fin;
    if (A.cx.enTexto && /["']/.test(ta.value[fin] || "")) hasta++;
    const cierra = it.cerrar && ta.value[hasta] !== ")";
    ta.setRangeText(it.txt + (cierra ? ")" : ""), A.cx.desde, hasta, "end");
    if (it.cerrar && !cierra) ta.setSelectionRange(ta.selectionStart + 1, ta.selectionStart + 1);   // ya había ")": quedar después
    cerrarAC();
    ta.dispatchEvent(new Event("input"));           // guarda, pinta y, si pusiste "dron(", abre sus opciones
    ta.focus();
  }
  function cerrarAC() { ES.ac.abierto = false; const b = $("es-ac"); if (b) b.hidden = true; }

  function insertar(txt) {
    const ta = $("es-src"), s = ta.selectionStart;
    const ini = ta.value.lastIndexOf("\n", s - 1) + 1, ind = /^ */.exec(ta.value.slice(ini, s))[0];
    ta.setRangeText(txt.split("\n").join("\n" + ind), s, ta.selectionEnd, "end");
    ta.dispatchEvent(new Event("input"));
    ta.focus();
  }
  function marcarError(err) {
    ES.errLinea = err.linea;
    pintar();
    if (err.linea) {
      const ta = $("es-src"), lines = ta.value.split("\n");
      const pos = lines.slice(0, err.linea - 1).reduce((a, l) => a + l.length + 1, 0);
      ta.focus(); ta.setSelectionRange(pos, pos + (lines[err.linea - 1] || "").length);
      ta.scrollTop = Math.max(0, (err.linea - 5) * 20);
    }
  }

  // ---------------- archivos ----------------
  function renderArchivos() {
    const ul = $("es-archivos");
    ul.innerHTML = "";
    for (const n of Object.keys(ES.archivos).sort()) {
      const fila = document.createElement("div"), b = document.createElement("button"), x = document.createElement("button");
      fila.className = "es-fila";
      b.className = "es-item";
      b.setAttribute("aria-pressed", String(n === ES.abierto));
      b.textContent = n + ".pbd";
      b.title = n + ".pbd";
      b.onclick = () => { ES.abierto = n; guardarArchivos(); renderArchivos(); cargarEditor(); menuArchivos(false); };
      x.className = "es-borrar";
      x.textContent = "×";
      x.title = t("Eliminar {n}.pbd", { n });
      x.setAttribute("aria-label", t("Eliminar {n}.pbd", { n }));
      x.onclick = () => borrarArchivo(n);
      fila.append(b, x);
      ul.appendChild(fila);
    }
    if (!Object.keys(ES.archivos).length) ul.innerHTML = `<p class="muted" style="font-size:13px;margin:4px 8px">${t("No tienes programas: + Nuevo o abre un ejemplo.")}</p>`;
    const ej = $("es-ejemplos");
    ej.innerHTML = "";
    for (const n of ejemplosTuyos()) {
      const b = document.createElement("button");
      b.className = "es-item muted";
      b.dataset.ej = n;
      b.textContent = n;
      b.onclick = () => { menuArchivos(false); comando("ejemplo " + n); };
      ej.appendChild(b);
    }
  }
  /** Los ejemplos que puedes correr: los de las misiones y niveles de tus simuladores (los demás no salen). */
  function ejemplosTuyos() {
    const S = simuladores(), en = Object.fromEntries(Object.entries(ES.data.alias_en?.misiones || {}).map(([es, x]) => [x, es]));
    return Object.keys(ES.data.ejemplos).filter((n) => {
      const src = ES.data.ejemplos[n], m = /\b(?:mision|mission)\(\s*"([^"]+)"/.exec(src), nv = /\b(?:nivel|level)\(\s*(\d+)/.exec(src);
      if (m) return S.misionesDisponibles.has(en[m[1]] || m[1]);
      return !nv || S.nivelesDisponibles.has(+nv[1]);
    });
  }
  const nombreArchivo = (s) => String(s || "").toLowerCase().replace(/\.pbd$/, "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
  function nuevoArchivo(nombre, src) {
    let n = nombreArchivo(nombre) || "programa", k = 2;
    const base = n;
    while (ES.archivos[n] !== undefined) n = `${base}_${k++}`;
    const plantilla = programaEscenario(ESC.lista(ctx.escenarios).filter((e) => ESC.tiene(ctx.P(), e.id)).at(-1) || ESC.lista(ctx.escenarios)[0], n);
    ES.archivos[n] = src ?? (idioma() === "en" ? traducirCodigo(plantilla, "en", ES.data.alias_en) : plantilla);
    ES.abierto = n;
    guardarArchivos(); renderArchivos(); cargarEditor();
    return n;
  }
  /** Elimina un programa de este navegador (pregunta antes; el modelo que haya entrenado no se toca). */
  async function borrarArchivo(n) {
    if (!n || ES.archivos[n] === undefined) return linea(n ? t("No hay {n}.pbd (archivos para verlos)", { n }) : t("No hay ese archivo (archivos para verlos)"), "bad");
    if (!(await confirmar(t("¿Eliminar {n}.pbd? Se borra de este navegador (los modelos que entrenó no se tocan). Si lo quieres guardar, primero dale Descargar.", { n }), { si: t("Eliminar"), peligro: true }))) return linea(t("No se eliminó."), "muted");
    delete ES.archivos[n];
    if (ES.abierto === n) ES.abierto = Object.keys(ES.archivos).sort()[0] || null;
    guardarArchivos(); renderArchivos(); cargarEditor();
    linea(t("Eliminé {n}.pbd", { n }), "ok");
  }
  function descargar() {
    if (!ES.abierto) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([ES.archivos[ES.abierto]], { type: "text/x-python" }));
    a.download = ES.abierto + ".pbd";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  $("es-subir").addEventListener("change", async (ev) => {
    const f = ev.target.files?.[0];
    if (!f) return;
    const n = nuevoArchivo(f.name, await f.text());
    linea(t("Abrí {f} como {n}.pbd", { f: f.name, n }), "ok");
    ev.target.value = "";
  });

  // ---------------- terminal ----------------
  function linea(txt, cls = "") {
    const out = $("es-out"), d = document.createElement("div");
    d.className = cls;
    if (String(txt).includes("\u0001")) {               // color("verde", "…") de PBDMM: \u0001verde\u0002texto\u0003
      for (const parte of String(txt).split(/(\u0001\w+\u0002[^\u0003]*\u0003)/)) {
        const m = /^\u0001(\w+)\u0002([^\u0003]*)\u0003$/.exec(parte);
        if (m) { const sp = document.createElement("span"); sp.className = "es-c-" + m[1]; sp.textContent = m[2]; d.appendChild(sp); }
        else if (parte) d.appendChild(document.createTextNode(parte));
      }
    } else d.textContent = txt;
    out.appendChild(d);
    while (out.childElementCount > 600) out.firstChild.remove();
    out.scrollTop = out.scrollHeight;
  }
  const tabla = (filas) => {
    const w = filas[0].map((_, i) => Math.max(...filas.map((f) => String(f[i]).length)));
    filas.forEach((f, j) => linea(f.map((x, i) => String(x).padEnd(w[i])).join("  "), j === 0 ? "muted" : ""));
  };
  $("es-in").addEventListener("keydown", (ev) => {
    const ta = ev.target;
    if (ev.key === "Enter") {
      const c = ta.value.trim();
      ta.value = "";
      if (!c) return;
      ES.hist.push(c); ES.hi = ES.hist.length;
      comando(c);
    } else if (ev.key === "ArrowUp" && ES.hist.length) { ES.hi = Math.max(0, ES.hi - 1); ta.value = ES.hist[ES.hi]; ev.preventDefault(); }
    else if (ev.key === "ArrowDown" && ES.hist.length) { ES.hi = Math.min(ES.hist.length, ES.hi + 1); ta.value = ES.hist[ES.hi] ?? ""; ev.preventDefault(); }
  });

  /** Los comandos en inglés -> su nombre en español (run -> correr…), de data/pbdmm.json alias_en.comandos. */
  const comandoEs = (c) => {
    const al = ES.data?.alias_en?.comandos || {};
    return Object.keys(al).find((es) => al[es] === c) || c;
  };
  async function comando(c) {
    if (!abierta("ide")) ventana("ide", true);      // que se vea la respuesta
    linea("› " + c, "cmd");
    const [cmd, ...args] = c.split(/\s+/);
    const a0 = args[0], a1 = args[1];
    try {
      switch (comandoEs(cmd.toLowerCase())) {
        case "traducir": {                               // translate: el programa abierto, al otro idioma (o al que digas)
          if (!ES.abierto) return linea(t("No hay un programa abierto."), "bad");
          const hacia = ["en", "es"].includes(a0) ? a0 : (/^\s*(model|mission|rewards|penalties|train_on)\s*\(/m.test(ES.archivos[ES.abierto]) ? "es" : "en");
          ES.archivos[ES.abierto] = traducirCodigo(ES.archivos[ES.abierto], hacia, ES.data.alias_en);
          guardarArchivos(); cargarEditor();
          return linea(hacia === "en" ? t("Listo: {f}.pbd quedó con los nombres en inglés (funciona igual).", { f: ES.abierto }) : t("Listo: {f}.pbd quedó con los nombres en español (funciona igual).", { f: ES.abierto }), "ok");
        }
        case "ayuda": case "help": return ayuda(a0);
        case "limpiar": case "clear": $("es-out").innerHTML = ""; return;
        case "correr": case "run": return correr(a0, false);
        case "revisar": case "check": return correr(a0, true);
        case "parar": if (!ES.run) return linea(t("No hay un programa escuchando."), "muted"); linea(t('Dejé de escuchar "{m}" (sigue entrenando: detener {m} para pararlo).', { m: ES.run.cfg.modelo }), "warn"); ES.run = null; renderRun(); return;
        case "estado": return estado();
        case "avance": case "simular": {
          const m = a0 || ES.run?.cfg.modelo || ES.grafSlug;
          if (!m) return linea(t("{cmd} <modelo>", { cmd }), "bad");
          linea(cmd === "avance" ? t('Abriendo el mejor y el peor intento de "{m}"…', { m }) : t('Simulando una prueba de "{m}" con su última generación…', { m }), "muted");
          return cmd === "avance" ? ctx.abrirAvance(m, () => abrir()) : ctx.abrirSimular(m, () => abrir());
        }
        case "modelos": case "ls": return modelos({ success: "exito", name: "nombre" }[a0] || a0);
        case "info": return info(a0);
        case "pausar": return control(a0, "pausar", { pausa: true });
        case "seguir": return control(a0, "pausar", { pausa: false });
        case "detener": return control(a0, "detener");
        case "guardar": return control(a0, "guardar");
        case "copiar": case "renombrar": {
          if (!a0 || !a1) return linea(t("{cmd} <modelo> <nuevo>", { cmd }), "bad");
          if (!(await cargarModelos()).some((m) => m.slug === a0)) return linea("✗ " + t('No hay un modelo "{m}" (modelos para verlos)', { m: a0 }), "bad");
          const r = await api("/api/modelo", { accion: cmd === "copiar" ? "copiar" : "renombrar", slug: a0, nuevo: nombreArchivo(a1) });
          if (r.ok) { ctx.PT.anotarModelo(ctx.P(), r.slug, cmd === "renombrar" ? a0 : null); ctx.guardar(); }
          return linea(r.msg || (r.ok ? t("listo") : t("no se pudo")), r.ok ? "ok" : "bad");
        }
        case "borrar": {
          if (!a0) return linea(t("borrar <modelo>"), "bad");
          if (!(await cargarModelos()).some((m) => m.slug === a0)) return linea("✗ " + t('No hay un modelo "{m}" (modelos para verlos)', { m: a0 }), "bad");
          if (!(await confirmar(t('¿Mandar el modelo "{m}" a la papelera (models/drones/_papelera)?', { m: a0 }), { si: t("A la papelera"), peligro: true }))) return linea(t("No se borró."), "muted");
          const r = await api("/api/modelo", { accion: "borrar", slug: a0 });
          return linea(r.msg || (r.ok ? t("a la papelera") : t("no se pudo")), r.ok ? "ok" : "bad");
        }
        case "archivos": return Object.keys(ES.archivos).sort().forEach((n) => linea(`${n === ES.abierto ? "▸" : " "} ${n}.pbd  (${t("{n} líneas", { n: ES.archivos[n].split("\n").length })})`));
        case "nuevo": { const n = nuevoArchivo(a0); return linea(t("Nuevo: {n}.pbd", { n }), "ok"); }
        case "abrir": {
          const n = nombreArchivo(a0);
          if (ES.archivos[n] === undefined) return linea(t("No hay {n}.pbd (archivos para verlos)", { n }), "bad");
          ES.abierto = n; guardarArchivos(); renderArchivos(); cargarEditor(); return linea(t("Abrí {n}.pbd", { n }), "ok");
        }
        case "borrar_archivo": case "eliminar": return borrarArchivo(nombreArchivo(a0 || ES.abierto));
        case "ejemplo": {
          const src = ejemplosTuyos().includes(a0) && adaptarEjemplo(ES.data.ejemplos[a0]);
          if (!src) return linea(t("Ejemplos: {lista}", { lista: ejemplosTuyos().join(", ") }), "muted");
          const n = nuevoArchivo("ejemplo_" + a0, src);
          return linea(t("Abrí el ejemplo como {n}.pbd: léelo, cámbialo y córrelo.", { n }), "ok");
        }
        case "blender": {
          const r = await api("/api/abrir_blender", {});
          return linea(r.msg || (r.ok ? t("Abriendo Blender…") : t("No pude abrir Blender")), r.ok ? "ok" : "bad");
        }
        case "cargar": case "volar": return cargar(c.trim().slice(cmd.length).trim());
        default: linea(t('No conozco "{cmd}". Escribe ayuda.', { cmd }), "bad");
      }
    } catch (err) { linea(t("Error: {msg}", { msg: err.message }), "bad"); }
  }

  // ---------------- cargar <modelo> <dron>: la última generación, al dron (con animación de "subida") ----------------
  const normal = (x) => String(x).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "");
  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
  /** Una línea de la terminal que se puede ir cambiando (barras de progreso). */
  function lineaViva(txt, cls = "") { linea(txt, cls); const el = $("es-out").lastElementChild; return (txt, c) => { el.textContent = txt; if (c !== undefined) el.className = c; }; }
  function buscarDron(txt) {
    const ds = ctx.P().drones;
    if (!txt) return { d: ctx.D() };
    const q = normal(txt);
    const exacto = ds.find((d) => normal(d.nombre) === q);
    if (exacto) return { d: exacto };
    const parecidos = ds.filter((d) => normal(d.nombre).startsWith(q) || normal(d.nombre).includes(q));
    if (parecidos.length === 1) return { d: parecidos[0] };
    return { error: parecidos.length ? t('"{txt}" puede ser {lista}: escribe más del nombre', { txt, lista: parecidos.map((d) => `"${d.nombre}"`).join(t(" o ")) }) : t('no tienes un dron "{txt}". Tus drones: {lista}', { txt, lista: ds.map((d) => `"${d.nombre}"`).join(", ") }) };
  }
  async function cargar(resto) {
    const args = [...resto.matchAll(/"([^"]+)"|'([^']+)'|(\S+)/g)].map((m) => m[1] || m[2] || m[3]);
    const slug = args[0] || ES.run?.cfg.modelo || ES.grafSlug;
    if (!slug) return linea(t("cargar <modelo> [dron]: escribe qué modelo (modelos para verlos)"), "bad");
    const { d, error } = buscarDron(args.slice(1).join(" "));
    if (error) return linea("✗ " + error, "bad");
    if (!d) return linea("✗ " + t("No tienes un dron activo: elige uno en el hangar o escribe cargar <modelo> <dron>"), "bad");
    let m = (await cargarModelos()).find((x) => x.slug === slug);
    if (!m) return linea("✗ " + t('No hay un modelo "{m}" (modelos para verlos)', { m: slug }), "bad");
    // 1) si está entrenando: que guarde la generación de AHORA y esperar a que quede en disco
    if (m.entrenando) {
      const gen0 = m.gen ?? 0, set = lineaViva("⟳ " + t('"{m}" está entrenando ({donde}): guardando la generación de ahora', { m: slug, donde: m.donde }) + "…", "muted");
      const r = await api("/api/lab", { accion: "guardar", modelo: slug, donde: m.donde });
      if (!r.ok) set("  " + t("(no pude pedir el guardado: {msg}; cargo la última guardada)", { msg: r.msg || "?" }), "warn");
      for (let i = 0; i < 24 && r.ok; i++) {
        await dormir(500);
        m = (await cargarModelos()).find((x) => x.slug === slug) || m;
        if ((m.gen ?? 0) > gen0 || i === 23) break;
        set("⟳ " + t('"{m}" está entrenando ({donde}): guardando la generación de ahora', { m: slug, donde: m.donde }) + ".".repeat((i % 3) + 1), "muted");
      }
      if (r.ok) set("✓ " + ((m.gen ?? 0) > gen0 ? t('guardada la generación {gen} de "{m}"', { gen: m.gen, m: slug }) : t('"{m}" ya tenía guardada la generación {gen}', { m: slug, gen: m.gen ?? 0 })), "ok");
      else set("  " + t("no pude pedir el guardado ({msg}): cargo la última guardada, la generación {gen}", { msg: r.msg || "?", gen: m.gen ?? 0 }), "warn");
    }
    if (!m.tiene_modelo) return linea("✗ " + t('"{m}" todavía no tiene un modelo guardado: entrénalo un rato', { m: slug }), "bad");
    // 2) los pesos (el servidor los exporta si el zip es más nuevo)
    let web, texto;
    try { const r = await fetch(ctx.urlModelo(slug), { cache: "no-store" }); texto = await r.text(); web = JSON.parse(texto); }
    catch { return linea("✗ " + t('No pude leer los pesos de "{m}" (modelo_web.json)', { m: slug }), "bad"); }
    const gen = web.meta?.generaciones ?? m.gen ?? 0, kb = Math.max(1, Math.round(texto.length / 1024));
    const capas = [web.layers[0].in, ...web.layers.map((L) => L.out)], params = web.layers.reduce((a, L) => a + L.in * L.out + L.out, 0);
    const fc = (ctx.cat.controladoras || []).find((x) => x.id === ctx.PT.build(ctx.P(), d).controladora);
    // 3) la "subida" al dron
    linea("› " + t('conectando con "{d}" por USB{fc}…', { d: d.nombre, fc: fc ? ` (${fc.nombre})` : "" }), "cmd");
    await dormir(350);
    linea("  " + t("red {red} · {p} pesos · {kb} KB · generación {gen}", { red: capas.join(" → "), p: params.toLocaleString(idioma()), kb, gen }), "muted");
    const bar = lineaViva("", "");
    const N = 28;
    for (let i = 0; i <= N; i++) {
      const k = Math.round((i / N) * 24), pct = Math.round((i / N) * 100);
      bar(`  ${t("subiendo")} [${"█".repeat(k)}${"░".repeat(24 - k)}] ${String(pct).padStart(3)} %  ${Math.round((kb * i) / N)}/${kb} KB`, i === N ? "ok" : "");
      await dormir(55 + (i % 7 === 3 ? 120 : 0));
    }
    let h = 2166136261;                                     // una "firma" de los pesos para verificar (FNV-1a)
    for (let i = 0; i < texto.length; i += 97) { h ^= texto.charCodeAt(i); h = Math.imul(h, 16777619); }
    const ver = lineaViva("  " + t("verificando los pesos…"), "muted");
    await dormir(450);
    ver("  " + t("verificando los pesos… ok (firma {f})", { f: (h >>> 0).toString(16).padStart(8, "0") }), "muted");
    d.modelo = slug;
    d.banco = d.banco || {};
    d.banco.ia = { modelo: slug, gen };
    ctx.guardar();
    ctx.verDron?.();
    linea("✓ " + t('"{d}" ahora vuela con la IA "{m}", generación {gen}. Pruébala: Pedidos → "Que grabe la IA", o simular {m}.', { d: d.nombre, m: slug, gen }), "ok");
  }

  function ayuda(tema) {
    const D = ES.data;
    if (!tema) {
      linea(t("Comandos:"), "ok");
      D.comandos.forEach(([c, d]) => linea(`  ${c.padEnd(40)} ${d}`));
      linea(t("Funciones del lenguaje: ayuda <función>, o 📖 Manual (F1 sobre una palabra del editor). Lo que trae e: ayuda e."), "muted");
      return;
    }
    if (tema === "e") { D.e_doc.forEach(([k, d]) => linea(`  ${k.padEnd(34)} ${d}`)); return; }
    if (tema === "funciones") { D.funciones.forEach((f) => linea(`  ${f.firma}`)); return; }
    if (tema === "hooks") { D.hooks_doc.forEach(([k, d]) => linea(`  def ${k}: ${d}`)); return; }
    const esDe = Object.fromEntries(Object.entries(D.alias_en?.funciones || {}).map(([es, en]) => [en, es]));
    const f = D.funciones.find((x) => x.nombre === (esDe[tema] || tema));
    if (!f) return linea(t('No hay ayuda de "{tema}". Prueba: ayuda funciones · ayuda e · ayuda hooks', { tema }), "bad");
    linea(f.firma, "ok");
    linea(f.desc);
    f.params.forEach(([k, d]) => linea(`  ${k}: ${d}`, "muted"));
    linea(t("ejemplo:") + " " + f.ejemplo, "muted");
  }

  async function cargarModelos() {
    const r = await api("/api/modelos");
    if (r.modelos) { ES.todos = r.modelos; ES.modelos = ctx.PT.modelosVisibles(ctx.P(), r.modelos); ES.modelosT = Date.now(); }   // los de esta partida
    return ES.modelos;
  }
  async function modelos(orden = "exito") {
    const ms = await cargarModelos();
    if (!ms.length) return ES.todos.length ? linea(t("Todavía no tienes modelos: corre un programa (▶) y se crea el primero."), "muted")
      : linea(t("No encontré modelos (¿está corriendo python scripts/jugar.py?)"), "bad");
    const k = { exito: (m) => -(m.ultimo?.[2] ?? -1), "éxito": (m) => -(m.ultimo?.[2] ?? -1), gen: (m) => -(m.gen || 0), nombre: (m) => m.slug }[orden] || ((m) => -(m.ultimo?.[2] ?? -1));
    const ord = [...ms].sort((a, b) => (k(a) < k(b) ? -1 : k(a) > k(b) ? 1 : 0));
    const niv = ES.data.nombres_niveles;
    tabla([[t("modelo"), t("gen"), t("red"), t("éxito"), t("mejor"), t("último nivel"), t("estado")],
      ...ord.map((m) => [m.slug, m.gen ?? 0, m.red ? m.red.slice(1, -1).join("×") : "—", pct(m.ultimo?.[2]), pct(m.mejor_exito),
        m.ultimo ? `${m.ultimo[4]} ${(niv[m.ultimo[4]] || "").split(/[:(]/)[0].trim()}` : "—",
        m.entrenando ? t("entrenando ({donde})", { donde: m.donde }) : m.tiene_modelo ? t("guardado") : t("vacío")])]);
    linea(t("{n} modelos · el éxito es en el último nivel que entrenó: compáralos en la misma misión.", { n: ms.length }), "muted");
  }
  async function historiaDe(slug) {
    const url = slug === "base" ? "/models/modelo.json" : `/models/drones/${slug}/modelo.json`;
    try { const r = await fetch(url, { cache: "no-store" }); return r.ok ? await r.json() : null; } catch { return null; }
  }
  async function info(slug) {
    if (!slug) return linea(t("info <modelo>"), "bad");
    const m = (await cargarModelos()).find((x) => x.slug === slug);
    if (!m) return linea(t('No hay un modelo "{m}" (modelos para verlos)', { m: slug }), "bad");
    const h = await historiaDe(slug);
    linea(`${m.nombre} (${m.slug})`, "ok");
    linea("  " + t("red: {red} · generación {gen} · {pasos} pasos", { red: m.red ? m.red.join(" → ") : "—", gen: m.gen, pasos: (m.pasos || 0).toLocaleString(idioma()) }));
    linea("  " + t("salió de: {de} · creado {c} · actualizado {a}", { de: m.base_de || (slug === "base" ? t("la campaña") : "—"), c: m.creado || "—", a: m.actualizado || "—" }));
    if (m.niveles && Object.keys(m.niveles).length) linea("  " + t("niveles: {lista}", { lista: Object.entries(m.niveles).map(([k, v]) => `${ES.data.nombres_niveles[k] ? `${k} ${ES.data.nombres_niveles[k]}` : k} (${typeof v === "object" ? v.generaciones ?? v.gen ?? JSON.stringify(v) : t("{n} pasos", { n: Number(v).toLocaleString(idioma()) })})`).join(" · ") }));
    if (m.tomas?.length) linea("  " + t("tomas que sabe: {lista}", { lista: m.tomas.join(", ") }));
    if (m.rango_fisica) linea("  " + t("drones que conoce: empuje/peso {twr} · masa {masa} kg", { twr: m.rango_fisica.twr?.join("-"), masa: m.rango_fisica.masa_kg?.join("-") }), "muted");
    const hs = (h?.historia || []).slice(-60);
    if (hs.length) linea("  " + t("éxito (últimas {n} gen.): {chispa}  {pct}", { n: hs.length, chispa: chispa(hs.map((x) => x[2])), pct: pct(hs.at(-1)[2]) }));
    linea(`  ${m.entrenando ? t("entrenando en {donde}", { donde: m.donde }) : t("quieto")} · ${t("su gráfica está en la ventana 📈")}`, "muted");
    ES.grafSlug = slug; ES.grafFijo = true; ES.graf = hs; ES.red = null; renderSel(); dibujarGrafica();
  }
  async function estado() {
    const s = await api("/api/lab");
    if (s.ok === false) return linea(s.msg, "bad");
    const b = s.blender || {}, tr = s.entrenador || {};
    linea(`Blender: ${b.abierto ? `${b.estado_txt || b.estado}${b.corriendo ? " · " + t("modelo {m} · gen {gen} · éxito {exito} · choque {choque}", { m: s.blender_modelo, gen: tr.gen ?? "?", exito: pct(tr.succ), choque: pct(tr.crash) }) : ""}` : t("cerrado (comando blender para abrirlo)")}`);
    const f = (s.fondo || []).filter((x) => x.activo);
    if (!f.length) linea(t("Fondo: nada entrenando"), "muted");
    f.forEach((x) => linea(t("Fondo: {m} · gen {gen} · éxito {exito} · choque {choque}", { m: x.modelo, gen: x.gen ?? "?", exito: pct(x.succ), choque: pct(x.crash) }) + (x.params?.paused ? " · " + t("EN PAUSA") : "")));
    if (ES.run) linea(t('Escuchando: "{m}" ({donde})', { m: ES.run.cfg.modelo, donde: ES.run.cfg.donde }), "ok");
  }
  async function control(slug, accion, extra = {}) {
    slug = slug || ES.run?.cfg.modelo;
    if (!slug) return linea(t("{cmd} <modelo>", { cmd: accion }), "bad");
    const m = (await cargarModelos()).find((x) => x.slug === slug);
    const donde = m?.donde || ES.run?.cfg.donde || "fondo";
    const r = await api("/api/lab", { accion, modelo: slug, donde, ...extra });
    linea(r.msg || (r.ok ? t("listo") : t("no se pudo")), r.ok ? "ok" : "bad");
  }

  // ---------------- correr un programa ----------------
  function compilarAbierto(nombre, host) {
    const n = nombre ? nombreArchivo(nombre) : ES.abierto;
    if (n !== ES.abierto && ES.archivos[n] !== undefined) { ES.abierto = n; guardarArchivos(); renderArchivos(); cargarEditor(); }
    const src = ES.archivos[n];
    if (src === undefined) throw new ErrorPB(t("no hay {n}.pbd", { n }));
    return compilar(src, dataCompilar(), host);
  }
  function hostDe(getRun) {
    const enviar = (accion, extra) => {
      const R = getRun();
      if (!R) return;
      api("/api/lab", { accion, modelo: R.cfg.modelo, donde: R.cfg.donde, ...extra }).then((r) => linea(`  ↳ ${accion}: ${r.msg || (r.ok ? "ok" : t("no se pudo"))}`, r.ok ? "muted" : "bad"));
    };
    return {
      print: (x) => linea(x),
      avisar: (x) => toast(esc(x), 4000),
      ajustar: (c) => {
        const body = {};
        if (c.premios) body.premios = c.premios;
        if (c.viento !== undefined) body.viento = c.viento;
        if (c.velocidad) body.velocidad = c.velocidad;
        if (c.lr !== undefined) body.lr = c.lr;
        if (c.ent !== undefined) body.ent = c.ent;
        enviar("ajustar", body);
      },
      pausar: () => enviar("pausar", { pausa: true }),
      seguir: () => enviar("pausar", { pausa: false }),
      detener: () => enviar("detener"),
      guardar: () => enviar("guardar"),
    };
  }
  /** El tutorial (modo dev) pregunta una vez si tiene Blender: es lo recomendado. Si dice que sí, el programa pasa a
   *  entrenar_en("blender") y hay que volver a correrlo (-> true). */
  async function preguntarBlender(nombre, c) {
    const p = ctx.P();
    if (c.donde === "blender" || !ctx.tutorial?.() || p.modo !== "dev" || !p.tuto || p.tuto.blender !== undefined) return false;
    const si = await confirmar(t("¿Tienes <b>Blender</b>? Con Blender ves a tus drones aprender en 3D: es la mejor experiencia (recomendado). Sin Blender entrena en el fondo y lo miras en el Monitor."),
      { titulo: t("¿Dónde entrenar?"), si: t("Sí, con Blender"), no: t("No, en el fondo") });
    p.tuto.blender = si; ctx.guardar();
    if (!si) return false;
    const n = nombre ? nombreArchivo(nombre) : ES.abierto;
    ES.archivos[n] = (ES.archivos[n] || "").replace(/(entrenar_en|train_on)\(\s*"(fondo|background)"\s*\)/, '$1("blender")');
    guardarArchivos(); if (n === ES.abierto) cargarEditor();
    linea("  " + t("Listo: entrena en Blender. Ábrelo (comando blender) y míralo aprender."), "ok");
    return true;
  }
  async function correr(nombre, soloRevisar) {
    await cargarModelos();                         // la lista de modelos al día (desde="colibri" recién entrenado)
    let R = null;
    const host = hostDe(() => R);
    let prog;
    try { prog = compilarAbierto(nombre, host); }
    catch (err) {
      if (!(err instanceof ErrorPB)) throw err;
      linea("✗ " + err.message, "bad"); marcarError(err); return;
    }
    ES.errLinea = null; pintar();
    const c = prog.cfg, niv = ES.data.nombres_niveles[c.nivel] || "";
    linea("✓ " + t("{n}.pbd está bien.", { n: ES.abierto }), "ok");
    if (c.yaExiste && c.desde !== "base") linea("  " + t('ojo: "{m}" ya existe (generación {gen}): sigue entrenando el suyo; desde="{desde}" solo cuenta al crearlo. Para partir de "{desde}", usa otro nombre en modelo(…).', { m: c.modelo, gen: c.yaExiste.gen, desde: c.desde }), "warn");
    else if (c.yaExiste) linea("  " + t('"{m}" ya existe (generación {gen}): sigue entrenando desde ahí.', { m: c.modelo, gen: c.yaExiste.gen }), "muted");
    linea("  " + t('modelo "{m}" ({desde}) · nivel {nivel} {niv} · {dron} · {n} drones · en {donde} ({vel})', {
      m: c.modelo, desde: c.desde === "cero" ? t("red nueva {capas}", { capas: c.capas ? c.capas.join("×") : "128×128" }) : c.desde === "base" ? t("desde la IA base") : t('desde "{m}"', { m: c.desde }),
      nivel: c.nivel, niv, dron: typeof c.dron === "object" ? t('tu dron "{d}"', { d: c.dron.hangar }) : c.dron === "AZAR" ? t("drones al azar") : t("dron estándar"),
      n: c.drones, donde: c.donde === "blender" ? "Blender" : t("el fondo"), vel: idioma() === "en" ? ES.data.alias_en?.valores?.[c.velocidad] || c.velocidad : c.velocidad }));
    if (c.tarea?.repaso) linea("  " + t("repasa lo que ya aprobó (20 % de los intentos): {lista}", { lista: c.tarea.repaso.map((n) => ES.data.nombres_niveles[n] || n).join(", ") }), "muted");
    if (c.modoPremios === "obligatorio") linea("  " + t("premios y castigos: los tuyos (lo que no escribiste queda en 0)"), "muted");
    else if (!c.escribio) linea("  " + t("premios y castigos: no escribiste ninguno, van los de la misión"), "muted");
    else linea("  " + t("premios y castigos: los tuyos + los de la misión en lo que no escribiste"), "muted");
    linea(`  ${valoresTxt(c.premiosFinal)}${c.viento ? " · " + t("viento {v} m/s", { v: c.viento }) : ""}${c.lr !== undefined ? ` · lr ${c.lr}` : ""}${c.ent !== undefined ? " · " + t("exploración {v}", { v: c.ent }) : ""}`, "muted");
    if (prog.revision) {                             // PBDMM 2: el dron de dron(…) contra lo que pide la misión
      linea("  " + t('revisión de "{d}" para {m}:', { d: c.dron.hangar, m: c.mision }), prog.revision.ok ? "ok" : "warn");
      prog.revision.lineas.forEach(([ic, tx]) => linea(`    ${ic} ${tx}`, ic === "❌" ? "bad" : ic === "⚠️" ? "warn" : "muted"));
      if (prog.revision.armado === false) linea("    " + t("Ponle piezas en el garaje: sin piezas no tiene física para entrenar."), "muted");
      else if (!prog.revision.ok) linea("    " + t("Puedes entrenar igual (aprende con la física de este dron), pero para hacer la misión en el juego le falta eso: consíguelo en la Tienda."), "muted");
    }
    RUTA.alCompilar(ctx.P(), ES.abierto, ES.archivos[ES.abierto] || "", prog, avisoRuta);
    linea("  " + t("funciones: {lista}", { lista: prog.hooks.length ? prog.hooks.map((h) => (idioma() === "en" ? ES.data.alias_en?.hooks?.[h] || h : h)).join(", ") : t("ninguna (solo entrena; párala con detener {m})", { m: c.modelo }) }), "muted");
    if (soloRevisar) return;
    if (await preguntarBlender(nombre, c)) return correr(nombre);
    let dron = null;
    if (typeof c.dron === "object") {
      const d = ctx.P().drones.find((x) => x.nombre === c.dron.hangar);
      dron = d && ctx.dronParaEntrenar(d);
      if (!dron) { linea("✗ " + t('"{d}" no está armado completo: no tengo su física.', { d: c.dron.hangar }), "bad"); return; }
    }
    if (typeof c.dron === "object") {                // ese dron del hangar queda con esta IA (si no tenía una)
      const d = ctx.P().drones.find((x) => x.nombre === c.dron.hangar);
      if (d && !d.modelo) { d.modelo = c.modelo; ctx.guardar(); linea("  " + t('"{d}" ahora tiene la IA "{m}" (sus botones Avance y Simular la usan).', { d: d.nombre, m: c.modelo }), "muted"); }
    }
    const body = pedidoDe(c, () => dron);
    linea(c.donde === "blender" ? t("Enviando el pedido (a Blender)…") : t("Enviando el pedido (al fondo)…"));
    const r = await api("/api/lab", body);
    if (!r.ok) { linea("✗ " + (r.msg || t("el servidor no lo aceptó")), "bad"); return; }
    ctx.PT.anotarModelo(ctx.P(), c.modelo); ctx.guardar();          // ahora es un modelo de esta partida
    linea(`✓ ${r.msg}${r.modelo_txt ? " · " + r.modelo_txt : ""}`, "ok");
    if (r.detenidos?.length) linea("  " + t("Un entrenamiento a la vez: {m} guardó y se detuvo.", { m: r.detenidos.join(", ") }), "warn");
    if (c.donde === "blender") {
      const s = await api("/api/lab");
      if (!s.blender?.abierto) linea("  " + t("Blender no está abierto: escribe blender (cuando abra, toma el pedido)."), "warn");
      if (c.lr !== undefined || c.ent !== undefined) linea("  " + t("lr/exploración se mandan cuando Blender empiece a entrenar."), "muted");
    }
    R = { prog, cfg: c, ses: { t0: Date.now(), gen0: null, mejor: null }, ultGen: null, empezo: false, t0: Date.now(), lrPend: c.donde === "blender" && (c.lr !== undefined || c.ent !== undefined) };
    ES.run = R;
    ES.grafSlug = c.modelo; ES.graf = []; ES.red = null; ES.grafFijo = false;
    renderSel();
    renderRun();
    sondear(true);
  }

  /** Los valores reales del entrenador -> "premios: grabar=4 … · castigos: chocar=3 …" (escala 0-10, en español). */
  function valoresTxt(reales) {
    const esc_ = ctx.ent.escala_premios, al = Object.fromEntries(Object.entries(ES.data.alias_premios).map(([a, k]) => [k, a]));
    const tipo = (k) => ctx.ent.premios.find((p) => p.k === k)?.tipo || "premio";
    const parte = (tp) => Object.entries(reales).filter(([k]) => tipo(k) === tp).map(([k, v]) => `${idioma() === "en" ? k : al[k] || k}=${numero(nivelDe(k, v, esc_))}`).join(" ");   // en inglés: film=, crash=
    if (!Object.keys(reales).length) return t("premios y castigos: los de siempre del entrenador (ponlos con premios() y castigos())");
    return t("premios: {p} · castigos: {c} (de 0 a 10)", { p: parte("premio") || "—", c: parte("castigo") || "—" });
  }
  /** Lo que dice el servidor de un modelo: {tr, activo}. */
  function trDe(s, slug) {
    const f = (s.fondo || []).find((x) => x.modelo === slug);
    if (f && f.activo) return { tr: f, activo: true };
    const b = s.blender || {}, tr = s.entrenador || {};
    // el entrenador de Blender escribe su progreso solo: si está al día, entrena aunque Blender tarde en escribir su estado
    // (macOS frena a Blender cuando queda detrás de la ventana del juego)
    if (s.blender_modelo === slug && ((b.abierto && b.corriendo) || tr.activo)) return { tr, activo: true };
    if (f) return { tr: f, activo: false };
    if (tr.modelo === slug) return { tr, activo: false };
    return { tr: null, activo: false };
  }
  function llamarHook(R, nombre, e) {
    try { return R.prog.reaccionar(nombre, e); }
    catch (err) {
      linea("✗ " + t("en {f}: {msg}", { f: nombre, msg: err.message }), "bad");
      if (err instanceof ErrorPB) marcarError(err);
      linea(t("El programa se detuvo por el error (el entrenamiento sigue: arréglalo y corre otra vez, o detener {m}).", { m: R.cfg.modelo }), "warn");
      ES.run = null; renderRun();
    }
  }
  /** Los modelos que están entrenando ahora (Blender y el fondo): para mirarlos aunque recargues la página. */
  function entrenandoAhora(s) {
    const out = [];
    const b = s.blender || {};
    if (s.blender_modelo && ((b.abierto && b.corriendo) || s.entrenador?.activo)) out.push({ slug: s.blender_modelo, donde: "Blender" });
    for (const f of s.fondo || []) if (f.activo && !out.some((x) => x.slug === f.modelo)) out.push({ slug: f.modelo, donde: "fondo" });
    return out;
  }
  /** e.examen: cada 3 min, la nota SIN ruido del último guardado (20 intentos fijos, como el 🎓 examen). El éxito del
   *  entrenamiento lleva el ruido con el que explora: en la foto marca ~0 % cuando el examen ya saca 90 %. */
  function examenVivo(R) {
    if (R.examPend || Date.now() - (R.ses.tExamen || R.t0) < 180000) return;
    R.examPend = true; R.ses.tExamen = Date.now();
    api(`/api/evaluar?modelo=${encodeURIComponent(R.cfg.modelo)}&nivel=${R.cfg.nivel}&n=20`).then((r) => {
      if (r && typeof r.exito === "number") {
        R.ses.examen = r.exito;
        if (ES.run === R) linea("  🎓 " + t("examen sin ruido (gen {g}): {p}", { g: r.gen, p: Math.round(r.exito * 100) + " %" }), "muted");
      }
    }).catch(() => {}).finally(() => { R.examPend = false; });
  }
  async function tick() {
    const s = await api("/api/lab");
    if (s.ok === false) return;
    ES.entrenando = entrenandoAhora(s);
    // sin un modelo elegido (o el elegido ya no entrena y hay otro que sí): mirar el que está entrenando
    if (ES.entrenando.length && (!ES.grafSlug || (!ES.grafFijo && !ES.entrenando.some((x) => x.slug === ES.grafSlug)))) {
      ES.grafSlug = ES.entrenando[0].slug;
    }
    renderSel();
    const R = ES.run;
    if (R) {
      const { tr, activo } = trDe(s, R.cfg.modelo);
      if (activo && tr) R.quieto = null;
      if (activo && tr) {
        if (!R.empezo) {
          R.empezo = true; R.ses.gen0 = tr.gen ?? 0; R.ultGen = tr.gen ?? 0;
          linea("▶ " + t('"{m}" está entrenando (generación {gen}).', { m: R.cfg.modelo, gen: tr.gen ?? 0 }), "ok");
          if (R.lrPend) { R.lrPend = false; hostDe(() => R).ajustar({ lr: R.cfg.lr, ent: R.cfg.ent }); }
          llamarHook(R, "al_empezar", estadoE(tr, R.ses, ctx.ent.escala_premios));
        } else if ((tr.gen ?? 0) > R.ultGen) {
          R.ultGen = tr.gen;
          if (typeof tr.succ === "number") R.ses.mejor = Math.max(R.ses.mejor ?? 0, tr.succ);
          examenVivo(R);
          const e = estadoE(tr, R.ses, ctx.ent.escala_premios);
          const acc = ES.run === R ? llamarHook(R, "cada_generacion", e) || [] : [];
          for (const l of R.prog.narrar(e, R.ses)) linea(l, l.includes("💡") ? "warn" : "muted");
          RUTA.alGenerar(ctx.P(), R.cfg, e, avisoRuta, acc);
        }
      } else if (R.empezo && Date.now() - (R.quieto ??= Date.now()) < 15000) {
        // un sondeo sin noticias no es que paró (el estado se está guardando, Blender frenado…): 15 s de gracia
      } else if (R.empezo) {
        linea("■ " + t('"{m}" dejó de entrenar (generación {gen}).', { m: R.cfg.modelo, gen: tr?.gen ?? R.ultGen }), "warn");
        llamarHook(R, "al_terminar", estadoE(tr || {}, R.ses, ctx.ent.escala_premios));
        setTimeout(cargarModelos, 3000);           // ya guardó: que aparezca en desde= y en modelos
        ES.run = null; renderRun();
      } else if (Date.now() - R.t0 > 120000 && !R.avisoLento) {
        R.avisoLento = true;
        linea(R.cfg.donde === "blender" ? t("Blender todavía no empieza: ¿está abierto? (comando blender) · estado para ver qué dice") : t("Todavía no arranca: estado para ver qué pasa"), "warn");
      }
    }
    // la gráfica: el modelo que corre o el que miraste con info
    const g = ES.grafSlug;
    if (g) {
      const { tr, activo } = trDe(s, g);
      if (tr?.hist?.length && (activo || !ES.graf?.length)) ES.graf = tr.hist.slice(-120);
      ES.grafActivo = activo;
      ES.grafTr = tr;
    }
    if (abierta("sim")) dibujarGrafica();
    reloj();
    if (abierta("banco")) renderBanco();
    renderRun();
  }
  function sondear(on) {
    clearInterval(ES.poll);
    if (on) { ES.poll = setInterval(tick, 1500); tick(); }
  }
  function renderRun() {
    const R = ES.run, el = $("es-run");
    el.innerHTML = R ? `<span class="ok">●</span> ${esc(R.cfg.modelo)} · ${R.empezo ? `gen ${R.ultGen}` : t("esperando…")}` : `<span class="muted" title="${t("nada corriendo")}">○</span>`;
    $("es-parar").disabled = !R;
  }

  /** Un reto de la ruta cumplido: la terminal lo celebra y el progreso se guarda en la partida. */
  function avisoRuta(n, cap) {
    ctx.guardar();
    linea("🏅 " + t("Ruta del programador: ¡capítulo {n} · {titulo} completo!", { n, titulo: cap.titulo }), "ok");
    const sig = RUTA.actual(ctx.P());
    if (sig) linea("   " + t("Sigue el capítulo {n} (Documentación → Ruta).", { n: sig }), "muted");
    else if (RUTA.abiertos(ctx.P()) < RUTA.capitulos().length) linea("   " + t("Crea otro dron en el garaje para abrir el capítulo {n}.", { n: RUTA.abiertos(ctx.P()) + 1 }), "muted");
    toast(t("🏅 Capítulo {n} completo: {titulo}", { n, titulo: esc(cap.titulo) }), 4000);
    if (ES.doc === "ruta" && abierta("docs")) ruta();
  }
  /** La Ruta (en Documentación): una lista corta de capítulos (uno por dron); tocar uno abre su detalle. */
  function ruta() {
    const p = ctx.P(), caps = RUTA.capitulos(), ab = RUTA.abiertos(p), act = RUTA.actual(p);
    const hechos = caps.filter((_, i) => RUTA.hecho(p, i + 1)).length;
    abrirDoc("ruta", t("{h} de {n} capítulos", { h: hechos, n: caps.length }), (box) => {
      box.innerHTML = `<div class="es-prog"><i style="width:${Math.round((hechos / Math.max(1, caps.length)) * 100)}%"></i></div>`;
      caps.forEach((c, i) => {
        const n = i + 1, abierto = n <= ab, ok = RUTA.hecho(p, n);
        const b = document.createElement("button");
        b.className = "es-cap" + (ok ? " hecho" : "") + (abierto ? "" : " cerrado") + (n === act ? " ahora" : "");
        b.innerHTML = `<span>${ok ? "✅" : abierto ? (n === act ? "▶" : "○") : "🔒"}</span><b>${n} · ${esc(c.titulo)}</b>`;
        b.onclick = () => verCapitulo(n);
        box.appendChild(b);
      });
      box.insertAdjacentHTML("beforeend", `<p class="muted" style="margin:8px 4px">${t("Cada dron que creas abre un capítulo.")}</p>`);
    });
  }
  function verCapitulo(n) {
    const p = ctx.P(), c = RUTA.capitulos()[n - 1], abierto = n <= RUTA.abiertos(p), ok = RUTA.hecho(p, n);
    abrirDoc("ruta", `${n} · ${c.titulo}`, (box) => {
      if (!abierto) { box.innerHTML = `<p>🔒 ${t("Crea tu dron n.º {k} en el garaje (+ Nuevo dron o Kit del garaje) para abrir este capítulo.", { k: n - 1 })}</p>`; return; }
      box.innerHTML = `<p>${esc(c.texto)}</p><p>${c.aprende.map((x) => `<code>${esc(x)}</code>`).join(" ")}</p>` +
        `<p><b>${t("Reto:")}</b> ${esc(c.reto_txt)} ${ok ? `<span class="chip on">${t("logrado")}</span>` : ""}</p>` +
        `<p class="muted">${t("Dron de este capítulo: {d}", { d: esc(RUTA.asegurar(p).drones[n] || p.drones[0]?.nombre || "—") })}</p>`;
      const b = document.createElement("button");
      b.className = "btn main small";
      b.textContent = t("Abrir el programa del capítulo");
      b.onclick = () => {
        const nom = `capitulo_${n}`;
        if (ES.archivos[nom] === undefined) ES.archivos[nom] = RUTA.programa(p, n);
        ES.abierto = nom; guardarArchivos(); renderArchivos(); cargarEditor();
        ventana("ide", true);
        linea(t("Abrí {n}.pbd: lee los comentarios y completa el reto.", { n: nom }), "ok");
      };
      box.appendChild(b);
    }, ruta);
  }

  // ---------------- el escritorio: íconos de apps, ventanas que se mueven y se agrandan, la barra de tareas ----------------
  // EL COMPUTADOR (los dos modos): todo el juego se maneja desde aquí; afuera solo queda el hangar con los drones.
  // El modo desarrollador tiene además el IDE, la documentación y los simuladores; el normal, el Laboratorio de IA.
  const VENT = "dronmaker.pbdmm.escritorio";
  const LAYOUT0 = { ide: { x: 0.075, y: 0, w: 0.555, h: 1, open: true }, sim: { x: 0.63, y: 0, w: 0.37, h: 1, open: true },
    docs: { x: 0.33, y: 0.04, w: 0.4, h: 0.86, open: false }, mensajes: { x: 0.18, y: 0.03, w: 0.6, h: 0.92, open: false },
    tienda: { x: 0.14, y: 0.02, w: 0.7, h: 0.94, open: false }, inventario: { x: 0.2, y: 0.05, w: 0.6, h: 0.86, open: false },
    banco: { x: 0.38, y: 0.06, w: 0.3, h: 0.8, open: false }, escenarios: { x: 0.2, y: 0.03, w: 0.58, h: 0.92, open: false }, calendario: { x: 0.36, y: 0.04, w: 0.42, h: 0.86, open: false },
    campana: { x: 0.16, y: 0.03, w: 0.66, h: 0.92, open: false }, lab: { x: 0.13, y: 0.02, w: 0.74, h: 0.95, open: false },
    videos: { x: 0.2, y: 0.05, w: 0.6, h: 0.86, open: false }, ajustes: { x: 0.3, y: 0.08, w: 0.42, h: 0.8, open: false },
    apps: { x: 0.22, y: 0.04, w: 0.56, h: 0.9, open: false }, fondos: { x: 0.3, y: 0.1, w: 0.4, h: 0.62, open: false } };
  /** Las apps: ícono y nombre (función: t() corre después de cargar el idioma). */
  const APPS = () => ({ ide: ["💻", "IDE"], docs: ["📖", t("Documentación")], mensajes: ["💬", t("Mensajes")], tienda: ["🛒", t("Tienda")],
    inventario: ["📦", t("Inventario")], sim: ["📈", t("Monitor")], banco: ["🏦", t("Finanzas")], calendario: ["📅", t("Calendario")], escenarios: ["🎮", t("Simuladores")],
    campana: ["⭐", t("Campaña")], lab: ["🧠", t("Laboratorio")], videos: ["🎬", t("Videos")], ajustes: ["⚙️", t("Ajustes")],
    apps: ["🛍️", t("Apps")], fondos: ["🖼️", t("Fondos")] });
  const SOLO_DEV = new Set(["ide", "docs", "sim"]), SOLO_NORMAL = new Set(["lab"]);
  const esDev = () => ctx.P()?.modo === "dev";
  const FUERA = new Set(["inventario"]);              // el inventario es el estante del garaje (main.js), no una app
  const delModo = (w) => !FUERA.has(w) && (esDev() ? !SOLO_NORMAL.has(w) : !SOLO_DEV.has(w));
  /** Se ve y se abre: es de este modo y tienes el programa (🛍️ Apps, software.js). */
  const permitida = (w) => delModo(w) && SW.tieneApp(ctx.P(), ctx.software, w);
  /** Las apps que son pantallas del juego (el celular, la tienda, el laboratorio…): se meten en una ventana. */
  const HOST = { mensajes: ["celular", () => ctx.celular?.abrir()], tienda: ["tienda", () => ctx.tienda?.abrirTienda()], inventario: ["inventario", () => ctx.tienda?.abrirInventario()],
    campana: ["tablero", () => ctx.abrirTablero?.()], lab: ["lab", () => ctx.abrirLab?.()], videos: ["videos", () => ctx.abrirVideos?.()], ajustes: ["controles", () => ctx.abrirControles?.()] };
  const copia0 = () => JSON.parse(JSON.stringify(LAYOUT0));
  /** Cada modo recuerda su propio escritorio. */
  const claveVent = () => VENT + (esDev() ? "" : ".normal");
  function cargarVentanas() {
    ES.win = { ...copia0(), ...leerLS(claveVent(), {}) };
    for (const w of Object.keys(ES.win)) if (HOST[w] || !permitida(w) || !LAYOUT0[w]) ES.win[w].open = false;    // las del juego se abren cuando las pides
  }
  ES.win = copia0();
  ES.orden = Object.keys(LAYOUT0);                    // de atrás hacia adelante
  ES.doc = "manual";
  const winEl = (w) => document.querySelector(`.es-win[data-w="${w}"]`);
  const abierta = (w) => !!ES.win[w]?.open;
  const angosto = () => matchMedia("(max-width: 980px)").matches;
  const guardarVent = () => ponerLS(claveVent(), ES.win);
  function colocar() {
    const box = $("es-escritorio"), W = box.clientWidth, H = box.clientHeight, g = 6;
    for (const [w, L] of Object.entries(ES.win)) {
      const el = winEl(w);
      if (!el) continue;
      el.hidden = !L.open || !permitida(w);
      el.style.left = Math.round(L.x * W + g) + "px"; el.style.top = Math.round(L.y * H + g) + "px";
      el.style.width = Math.round(L.w * W - 2 * g) + "px"; el.style.height = Math.round(L.h * H - 2 * g) + "px";
      el.style.zIndex = 1 + ES.orden.indexOf(w);
      el.classList.toggle("arriba", ES.orden.at(-1) === w);
    }
    document.querySelectorAll(".es-icono[data-w]").forEach((b) => { b.classList.toggle("abierta", abierta(b.dataset.w)); b.hidden = !permitida(b.dataset.w); });
    barra();
  }
  /** La barra de tareas: una pestaña por app abierta (tocarla la trae al frente) y abajo a la derecha la plata y el día. */
  function barra() {
    const A = APPS(), box = $("es-tareas"), arriba = ES.orden.filter(abierta).at(-1);
    box.innerHTML = "";
    for (const w of Object.keys(LAYOUT0).filter((x) => abierta(x) && permitida(x))) {
      const b = document.createElement("button");
      b.textContent = `${A[w][0]} ${A[w][1]}`;
      b.setAttribute("aria-pressed", String(w === arriba));
      b.onclick = () => alFrente(w);
      box.appendChild(b);
    }
    reloj();
  }
  function reloj() {
    const p = ctx.P();
    if (!p) return;
    $("es-reloj").innerHTML = `<b>$${p.plata.toLocaleString(idioma())}</b> · ⭐ ${p.rep}${p.negocio ? ` · ${t("Día {n}", { n: p.negocio.dia })}` : ""}`;
    if (p.negocio && ES.diaCal !== p.negocio.dia) { ES.diaCal = p.negocio.dia; if (abierta("calendario")) renderCalendario(); }
    const n = p.negocio ? NG.noLeidos(p) : 0, sinMsj = !SW.tieneApp(p, ctx.software, "mensajes");
    $("es-badge").hidden = !n; $("es-badge").textContent = n;
    $("es-apps-badge").hidden = !(n && sinMsj); $("es-apps-badge").textContent = n;     // te escribieron y no tienes Mensajes
  }
  function alFrente(w) { ES.orden = [...ES.orden.filter((x) => x !== w), w]; colocar(); }
  /** Abre o cierra una app (sin "on": la alterna). */
  function ventana(w, on) {
    const quiere = on ?? !ES.win[w].open;
    if (quiere === ES.win[w].open && !quiere) return;
    ES.win[w].open = quiere;
    guardarVent();
    if (HOST[w]) quiere ? alojar(w) : desalojar(w);
    if (quiere) alFrente(w); else colocar();
    if (w === "docs" && quiere && !$("es-pop-c").childElementCount) ({ manual, ruta, aprende: () => aprende(0) })[ES.doc]();
    if (w === "sim") { redSondear(quiere); if (quiere) dibujarGrafica(); }
    if (w === "banco" && quiere) renderBanco();
    if (w === "calendario" && quiere) renderCalendario();
    if (w === "escenarios" && quiere) { renderEscenarios(); cargarModelos().then(() => renderEscenarios()); }   // el examen elige entre tus modelos
    if (w === "apps" && quiere) renderApps();
    if (w === "fondos" && quiere) renderFondos();
    if (w === "ide" && quiere) $("es-src").focus();
  }
  /** Mete la pantalla del juego (el celular, la tienda…) en su ventana; si el juego la cierra, la ventana se cierra. */
  const HOGAR = {};
  function alojar(w) {
    const [id, abrirla] = HOST[w], el = $(id), body = winEl(w).querySelector(".es-wbody");
    if (el.parentElement !== body) { HOGAR[id] = { padre: el.parentElement, sig: el.nextSibling }; body.appendChild(el); }
    el.classList.add("alojado");
    abrirla();
    HOGAR[id].obs?.disconnect();
    HOGAR[id].obs = new MutationObserver(() => { if (el.classList.contains("hidden") && abierta(w)) ventana(w, false); });
    HOGAR[id].obs.observe(el, { attributes: true, attributeFilter: ["class"] });
  }
  function desalojar(w) {
    const [id] = HOST[w], el = $(id), H = HOGAR[id];
    if (!H) return;
    H.obs?.disconnect();
    el.classList.remove("alojado");
    if (!el.classList.contains("hidden")) ctx.modal(id, false);
    H.padre.insertBefore(el, H.sig);
    delete HOGAR[id];
    reloj();
  }
  /** Arrastrar una ventana por su barra, o agrandarla por la esquina. */
  function arrastre(el, w, modo) {
    return (ev) => {
      if (angosto() || ev.button !== 0 || (modo === "mover" && ev.target.closest("button"))) return;
      ev.preventDefault();
      alFrente(w);
      const box = $("es-escritorio").getBoundingClientRect(), L = ES.win[w], x0 = ev.clientX, y0 = ev.clientY, L0 = { ...L };
      const mover = (e) => {
        const dx = (e.clientX - x0) / box.width, dy = (e.clientY - y0) / box.height;
        if (modo === "mover") { L.x = Math.max(-L.w + 0.08, Math.min(0.92, L0.x + dx)); L.y = Math.max(0, Math.min(0.94, L0.y + dy)); }
        else { L.w = Math.max(260 / box.width, Math.min(1 - L.x, L0.w + dx)); L.h = Math.max(160 / box.height, Math.min(1 - L.y, L0.h + dy)); }
        colocar();
      };
      const soltar = () => { removeEventListener("pointermove", mover); removeEventListener("pointerup", soltar); guardarVent(); redibujar(); };
      addEventListener("pointermove", mover);
      addEventListener("pointerup", soltar);
    };
  }
  for (const w of Object.keys(LAYOUT0)) {
    const el = winEl(w);
    el.querySelector(".es-wbar").addEventListener("pointerdown", arrastre(el, w, "mover"));
    el.querySelector(".es-wtam").addEventListener("pointerdown", arrastre(el, w, "tam"));
    el.addEventListener("pointerdown", () => { if (ES.orden.at(-1) !== w) alFrente(w); }, true);
  }
  document.querySelectorAll(".es-wx[data-x]").forEach((b) => (b.onclick = () => ventana(b.dataset.x, false)));
  document.querySelectorAll(".es-icono[data-w]").forEach((b) => (b.onclick = () => (abierta(b.dataset.w) ? alFrente(b.dataset.w) : ventana(b.dataset.w, true))));
  $("es-ordenar").onclick = () => {
    for (const w of Object.keys(HOST)) if (abierta(w)) ventana(w, false);
    cargarVentanas(); ES.win = copia0(); for (const w of Object.keys(ES.win)) if (!permitida(w)) ES.win[w].open = false; ES.orden = Object.keys(LAYOUT0); guardarVent(); colocar(); redibujar(); redSondear(true);
  };
  function redibujar() { if (abierta("sim")) { dibujarGrafica(); dibujarRed(); } }
  new ResizeObserver(() => { if (ctx.G.screen === "estudio") { colocar(); redibujar(); } }).observe($("es-escritorio"));

  // ---------------- el menú de programas ----------------
  function menuArchivos(on) {
    const m = $("es-archivo-m"), b = $("es-archivo-b");
    m.hidden = !(on ?? m.hidden);
    if (!m.hidden) {
      const r = b.getBoundingClientRect(), c = $("es-escritorio").getBoundingClientRect();
      m.style.left = Math.max(4, r.left - c.left) + "px"; m.style.top = Math.max(4, r.bottom - c.top + 4) + "px";
      m.style.zIndex = 100;
    }
  }
  $("es-archivo-b").onclick = (ev) => { ev.stopPropagation(); menuArchivos(); };
  document.addEventListener("pointerdown", (ev) => { if (!$("es-archivo-m").hidden && !ev.target.closest("#es-archivo-m, #es-archivo-b")) menuArchivos(false); });

  // ---------------- la app Documentación: el manual, la ruta y las lecciones ----------------
  /** Pinta una página de Documentación (y abre la app). tab = manual|ruta|aprende; atras = una función para ←. */
  function abrirDoc(tab, titulo, llenar, atras = null) {
    ES.doc = tab;
    document.querySelectorAll("#es-doc-tabs button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.d === tab)));
    $("es-pop-h").textContent = titulo;
    const box = $("es-pop-c");
    box.innerHTML = "";
    box.scrollTop = 0;
    llenar(box);
    $("es-pop-atras").hidden = !atras;
    $("es-pop-atras").onclick = atras;
    if (!abierta("docs")) ventana("docs", true); else alFrente("docs");
    menuArchivos(false);
  }
  document.querySelectorAll("#es-doc-tabs button").forEach((b) => (b.onclick = () => ({ manual, ruta, aprende: () => aprende(0) })[b.dataset.d]()));

  /** El manual: buscar, filtrar por grupo y tocar una función para ver cómo se usa. */
  const MAN = { q: "", grupo: null };
  const primera = (s) => String(s).split(/(?<=\.)\s/)[0];
  function manual() {
    const D = ES.data, nuevos = RUTA.nuevos(ctx.P());
    const extras = [["e", t("Lo que trae e"), D.e_doc], ["hooks", t("Funciones que llama el juego"), D.hooks_doc.map(([k, x]) => [`def ${k}`, x])], ["comandos", t("Comandos de la terminal"), D.comandos]];
    abrirDoc("manual", "", (box) => {
      box.innerHTML = `<input class="es-buscar" type="search" placeholder="${t("Buscar: dron, premios, e.exito…")}" aria-label="${t("Buscar en el manual")}" value="${esc(MAN.q)}">` +
        `<div class="es-chips"></div><div class="es-fnl"></div>`;
      const chips = box.querySelector(".es-chips"), lista = box.querySelector(".es-fnl"), q = box.querySelector("input");
      const grupos = [[null, t("Todo")], ...[...new Set(D.funciones.map((f) => f.grupo))].map((g) => [g, g]), ...extras.map(([k, n]) => [k, n])];
      for (const [g, n] of grupos) {
        const b = document.createElement("button");
        b.className = "chip"; b.textContent = n; b.setAttribute("aria-pressed", String(MAN.grupo === g));
        b.onclick = () => { MAN.grupo = g; manual(); };
        chips.appendChild(b);
      }
      const pintar = () => {
        const s = normal(MAN.q), hay = (...xs) => !s || xs.some((x) => normal(x).includes(s));
        lista.innerHTML = "";
        const fila = (code, txt, onclick, chip = "") => {
          const b = document.createElement(onclick ? "button" : "div");
          b.className = "es-fnb";
          b.innerHTML = `<code>${esc(code)}</code>${chip}<span title="${esc(txt)}">${esc(primera(txt))}</span>`;
          if (onclick) b.onclick = onclick;
          lista.appendChild(b);
        };
        const bloq = simuladores().bloqueadas;
        for (const f of D.funciones) {
          const nom = nombreFn(f);
          if (bloq[f.nombre]) continue;                       // la documentación crece con tus simuladores
          if ((MAN.grupo && MAN.grupo !== f.grupo) || !hay(f.nombre, nom, f.firma, f.desc)) continue;
          fila(nom + "(…)", f.desc, () => verFuncion(f, manual), nuevos.has(f.nombre) ? ` <span class="chip warn">${t("nuevo")}</span>` : "");
        }
        for (const [k, , xs] of extras) {
          if (MAN.grupo && MAN.grupo !== k) continue;
          for (const [c, d] of xs) if (hay(c, d)) fila(c, d, () => abrirDoc("manual", c, (b2) => (b2.innerHTML = `<pre>${esc(c)}</pre><p>${esc(d)}</p>`), manual));
        }
        if (!lista.childElementCount) lista.innerHTML = `<p class="muted">${t("Nada con eso.")}</p>`;
        const nb = Object.keys(bloq).filter((f) => D.funciones.some((x) => x.nombre === f)).length;
        if (nb && !MAN.q) lista.insertAdjacentHTML("beforeend", `<p class="muted" style="margin-top:10px">🔒 ${t("{n} funciones más se abren con los simuladores que te faltan (🎮 Simuladores).", { n: nb })}</p>`);
      };
      q.oninput = () => { MAN.q = q.value; pintar(); };
      pintar();
    });
  }
  /** El nombre de una función en el idioma del juego (en inglés: mission, rewards…; los dos funcionan igual). */
  const nombreFn = (f) => (idioma() === "en" ? ES.data.alias_en?.funciones?.[f.nombre] || f.nombre : f.nombre);
  /** Una función del lenguaje: qué hace, sus parámetros, un ejemplo y "insertar". */
  function verFuncion(f, atras = null) {
    abrirDoc("manual", nombreFn(f), (box) => {
      const donde = { arriba: t("arriba"), "función": t("en una función"), "las dos": t("arriba o en una función") }[f.donde] || "";
      box.innerHTML = `<pre>${esc(f.firma)}</pre><p>${esc(f.desc)}</p>` +
        (f.params.length ? `<div class="es-param">${f.params.map(([k, tx]) => `<code>${esc(k)}</code><span>${esc(tx)}${rec(f, k)}</span>`).join("")}</div>` : "") +
        `<pre>${esc(f.ejemplo)}</pre>` + (donde ? `<p class="muted">${t("Dónde va:")} ${donde}</p>` : "");
      const b = document.createElement("button");
      b.className = "btn main small"; b.textContent = t("insertar");
      b.onclick = () => { ventana("ide", true); insertar(f.ejemplo + "\n"); };
      box.appendChild(b);
    }, atras);
  }
  /** F1 en el editor: la ayuda de la palabra donde está el cursor. */
  function ayudaAqui() {
    const ta = $("es-src"), v = ta.value, s = ta.selectionStart;
    const ini = s - (/[\wáéíóúñ]*$/i.exec(v.slice(0, s))[0].length), fin = s + /^[\wáéíóúñ]*/i.exec(v.slice(s))[0].length;
    const w = v.slice(ini, fin), D = ES.data;
    const esDe = Object.fromEntries(Object.entries(D.alias_en?.funciones || {}).map(([es, en]) => [en, es]));
    const f = D.funciones.find((x) => x.nombre === (esDe[w] || w));
    if (f) return verFuncion(f, manual);
    MAN.grupo = w === "e" ? "e" : null; MAN.q = w === "e" ? "" : w;
    manual();
  }
  /** Las lecciones (cómo aprende una IA), una por página. */
  function aprende(i = 0) {
    const L = ES.data.lecciones, n = L.length + 1;
    i = Math.max(0, Math.min(n - 1, i));
    const fin = i === L.length;
    abrirDoc("aprende", fin ? t("La red") : L[i].titulo, (box) => {
      box.innerHTML = fin ? `<div aria-label="${t("La red: 38 entradas, capas ocultas, 4 palancas")}">${redSVG()}</div><p class="muted">${t("38 sensores entran, pasan por las capas ocultas y salen 4 palancas. Simuladores la muestra en vivo.")}</p>`
        : `<p>${esc(L[i].texto)}</p>`;
      box.insertAdjacentHTML("beforeend", `<div class="es-pasos">${Array.from({ length: n }, (_, k) => `<i class="${k === i ? "on" : ""}"></i>`).join("")}</div>` +
        `<div class="go" style="display:flex;gap:8px;justify-content:space-between;margin-top:10px"><button class="btn ghost small" ${i ? "" : "disabled"}>◀ ${t("Antes")}</button><button class="btn main small" ${fin ? "disabled" : ""}>${t("Siguiente")} ▶</button></div>`);
      const [ant, sig] = box.querySelectorAll(".go button");
      ant.onclick = () => aprende(i - 1);
      sig.onclick = () => aprende(i + 1);
    });
  }

  // ---------------- la app 🎮 Simuladores: los escenarios de entrenamiento (se compran en orden) ----------------
  /** El programa PBDMM 3 de un simulador: la misión y su plan de vuelo, listo para correr. */
  function programaEscenario(e, nombre = null) {
    const d = ctx.D?.(), nom = nombre || nombreArchivo(`${d?.nombre || "dron"}_${e.id}`).replace(/_+/g, "_"), dron = d && ctx.dronParaEntrenar?.(d) ? d.nombre : "estandar";
    const plan = { despegar: "despegar(altura=2)", ir_a: 'ir_a("punto")', mantener: "mantener(segundos=3)", foto: "foto(calidad=0.6)", grabar: "grabar()", esquivar: "esquivar()" };
    let pasos = [];
    if (e.id === "set_fotos") pasos = ["despegar(altura=2)", "for i in range(3):", '    ir_a("punto")', "    mantener(segundos=2)", "    foto(calidad=0.55)"];
    else pasos = [...new Set(e.plan)].map((a) => plan[a]).concat(e.plan.includes("grabar") ? ["seguir_ruta()"] : []);
    const desde = ESC.desdePara(ctx.P(), ctx.escenarios, e.id, (s) => ES.modelos.some((m) => m.slug === s)) || (enCero() ? "cero" : "base");
    // el programa del simulador (pbdmm.json escenarios_codigo): progresivo, cada uno agrega pocas líneas al anterior
    const tpl = ES.data.escenarios_codigo?.[e.id];
    if (tpl) {
      const src = tpl.replaceAll("{nom}", nom).replaceAll("{desde}", desde).replaceAll("{dron}", dron);
      return idioma() === "en" && !/\bmodel\(/.test(src) ? traducirCodigo(src, "en", ES.data.alias_en) : src;   // la capa en inglés ya lo trae
    }
    const src = `# ${nom}.pbd · ${t("simulador")}: ${e.nombre}\n# ${e.desc}\n\nmodelo("${nom}", desde="${desde}")\nmision("${e.mision}")\ndron("${dron}")\nentrenar_en("fondo")\n\n# ${t("el plan de vuelo")}\n${pasos.join("\n")}\naterrizar()\n\ndef cada_generacion(e):\n    print(f"gen {e.generacion}: ${t("éxito")} {e.exito:.0%}")\n`;
    return idioma() === "en" ? traducirCodigo(src, "en", ES.data.alias_en) : src;
  }
  function renderEscenarios() {
    const p = ctx.P(), E = ctx.escenarios, box = $("es-esc");
    if (!p || !E) return;
    const lst = ESC.lista(E), tuyos = lst.filter((e) => ESC.tiene(p, e.id)).length;
    $("es-esc-sub").textContent = t("{n} de {m}", { n: tuyos, m: lst.length });
    box.innerHTML = `<p class="muted" style="margin:0">${t("Cada simulador le enseña una misión a tu IA.")}</p>`;
    for (const e of lst) {
      const est = ESC.estado(p, E, e.id), c = document.createElement("div");
      c.className = "esc-c " + est;
      const req = e.requiere ? ESC.escenario(E, e.requiere) : null;
      const pasaron = ESC.aprobaron(p, e.id).filter((s) => ES.modelos.some((m) => m.slug === s));
      c.innerHTML = `<span class="ic">${est === "bloqueado" ? "🔒" : e.icono}</span><div><h4>${e.num ? `<span class="muted">${e.num}</span> ` : ""}${esc(e.nombre)}</h4><p>${esc(e.desc)}</p>` +
        `<div class="esc-plan"><span class="muted">${t("plan")}:</span>${e.plan.map((a) => `<code>${esc(nombreFnDe(a))}()</code>`).join("→")}</div>` +
        (e.abre.length ? `<div class="esc-plan esc-fn"><span class="muted">${t("abre en PBDMM")}:</span>${e.abre.map((f) => `<code>${esc(nombreFnDe(f))}</code>`).join("")}</div>` : "") +
        `<p style="font-size:12.5px">🧰 ${esc(e.trabajos)}</p>` +
        (esDev() && e.premios_modo ? `<p style="font-size:12.5px">🎯 ${e.premios_modo === "obligatorio" ? t("Premios y castigos: los escribes tú (lo que falte queda en 0)") : t("Premios y castigos: el programa te los muestra (opcionales)")}</p>` : "") +
        (pasaron.length ? `<p style="font-size:12.5px">🎓 ${pasaron.map((s) => `<b>${esc(s)}</b>${ESC.esBase(p, s) ? " ⭐" : ""}`).join(", ")}</p>` : "") + `</div><div class="esc-acc"></div>`;
      const acc = c.querySelector(".esc-acc");
      const btn = (txt, cls, fn, dis = false) => { const b = document.createElement("button"); b.className = "btn small " + cls; b.innerHTML = txt; b.disabled = dis; b.onclick = fn; acc.appendChild(b); };
      if (est === "tuyo") {
        acc.insertAdjacentHTML("afterbegin", `<span class="chip on" style="text-align:center">✓ ${t("tuyo")}</span>`);
        btn("🧠 " + t("Entrenar"), "ai", () => entrenarEscenario(e));
        btn("▶ " + t("Probar"), "ghost", () => probarEscenario());
        const mios = ES.modelos.filter((m) => m.tiene_modelo && m.slug !== "base");
        if (mios.length) {                         // el examen: elige el modelo (el último que entrenaste, primero)
          const sel = document.createElement("select");
          sel.className = "esc-sel"; sel.setAttribute("aria-label", t("Modelo para el examen"));
          sel.innerHTML = mios.map((m) => `<option value="${esc(m.slug)}">${esc(m.slug)}${ESC.aprobados(p, m.slug).includes(e.id) ? " 🎓" : ""}</option>`).join("");
          const ult = ES.examenSel?.[e.id] || ctx.D?.()?.modelo;
          if (mios.some((m) => m.slug === ult)) sel.value = ult;
          sel.onchange = () => { ES.examenSel = { ...(ES.examenSel || {}), [e.id]: sel.value }; };
          acc.appendChild(sel);
          btn("🎓 " + t("Examen"), "ghost", (ev) => examen(e, sel.value, ev.currentTarget));
        }
      } else if (est === "comprable") {
        btn(e.precio ? t("Comprar ${n}", { n: e.precio }) : t("Gratis"), "main", () => {
          const err = ESC.comprar(p, E, e.id);
          if (err) return toast(err);
          ctx.guardar(); sfx("listo"); toast(t("🎮 Simulador «{e}» listo: ya puedes entrenarlo.", { e: e.nombre }), 4000);
          renderEscenarios(); reloj();
        }, p.plata < e.precio);
      } else acc.insertAdjacentHTML("beforeend", `<small class="muted">${t("Primero «{e}»", { e: req?.nombre || "?" })}</small>`);
      box.appendChild(c);
    }
  }
  /** El examen de un escenario: 20 intentos fijos sin ruido (GET /api/evaluar). ≥ 80 % = aprobado (p.examenes). */
  async function examen(e, slug, b) {
    if (b) { b.disabled = true; b.textContent = "⏳ " + t("Examen…"); }
    let r = null;
    try { r = await (await fetch(`/api/evaluar?modelo=${encodeURIComponent(slug)}&nivel=${e.nivel}&n=20`)).json(); }
    catch { r = { ok: false, msg: t("sin servidor") }; }
    renderEscenarios();
    if (!r.ok) { sfx("error"); return toast(t("No se pudo tomar el examen: {msg}", { msg: r.msg || "?" }), 5000); }
    const x = Math.round(r.exito * 100), meta = Math.round(ESC.APROBAR * 100);
    if (r.exito < ESC.APROBAR) { sfx("error"); return toast(t("«{m}» sacó {x} % en «{e}» (necesita {meta} %): sigue entrenando.", { m: slug, x, e: e.nombre, meta }), 5000); }
    const base = ESC.aprobar(ctx.P(), slug, e.id);
    ctx.guardar(); sfx("listo"); renderEscenarios();
    toast(t("🎓 ¡«{m}» aprobó «{e}» con {x} %!", { m: slug, e: e.nombre, x }), 5000);
    if (base) ctx.historia?.(t("⭐ ¡Tienes un modelo base!"), t("«{m}» ya despega, va a un punto, sigue una línea, toma fotos y graba. <b>Es tu modelo base</b>: úsalo como punto de partida (desde=\"{m}\") y tus próximos modelos van a aprender mucho más rápido que desde cero.", { m: esc(slug) }));
  }
  // ---------------- 🛍️ Apps: la tienda de programas (software.js) ----------------
  function renderApps() {
    const p = ctx.P(), S = ctx.software, box = $("es-apps");
    if (!p || !S) return;
    box.innerHTML = "";
    for (const x of SW.lista(S, p)) {
      const tuyo = SW.instalado(p, x.id), c = document.createElement("div");
      c.className = "sw-c" + (tuyo ? " tuyo" : "") + (ES.appsFoco === x.id ? " foco" : "");
      c.innerHTML = `<span class="ic">${x.icono}</span><div><h4>${esc(x.nombre)}</h4><p>${esc(x.desc)}</p></div><div class="esc-acc"></div>`;
      const acc = c.querySelector(".esc-acc"), b = document.createElement("button");
      if (tuyo) {
        b.className = "btn small ghost"; b.textContent = x.base ? "✓" : t("Abrir");
        b.disabled = !!x.base && x.id === "apps";
        b.onclick = () => { const w = x.apps.find(permitida); if (w) ventana(w, true); };
      } else {
        b.className = "btn small main sw-comprar"; b.dataset.sw = x.id;
        b.textContent = x.precio ? t("Comprar ${n}", { n: x.precio }) : t("Gratis");
        b.disabled = p.plata < x.precio;
        b.onclick = () => {
          const err = SW.comprar(p, S, x.id);
          if (err) return toast(err);
          ctx.guardar(); sfx("listo"); ES.appsFoco = null;
          toast(`${x.icono} ${t("«{x}» instalado.", { x: x.nombre })}`, 3000);
          renderApps(); colocar(); reloj();
        };
      }
      acc.appendChild(b);
      box.appendChild(c);
    }
    box.querySelector(".foco")?.scrollIntoView({ block: "nearest" });
  }
  // ---------------- 🖼️ Fondos de pantalla ----------------
  const fondoDe = (id) => (ctx.software?.fondos || []).find((f) => f.id === id) || null;
  function ponerFondo() { const f = fondoDe(ctx.P()?.fondo); $("estudio").style.background = f ? f.css : ""; }
  function renderFondos() {
    const p = ctx.P(), box = $("es-fondos");
    box.innerHTML = "";
    for (const f of ctx.software?.fondos || []) {
      const b = document.createElement("button");
      b.className = "fondo-b"; b.style.background = f.css;
      b.setAttribute("aria-pressed", String((p.fondo || "taller") === f.id));
      b.innerHTML = `<span>${esc(f.nombre)}</span>`;
      b.onclick = () => { p.fondo = f.id; ctx.guardar(); ponerFondo(); renderFondos(); sfx("click"); };
      box.appendChild(b);
    }
  }
  const nombreFnDe = (f) => (idioma() === "en" ? ES.data?.alias_en?.funciones?.[f] || f : f);
  /** Entrenar un simulador: en el modo normal, el Laboratorio con esa misión; en el desarrollador, su programa PBDMM 3. */
  function entrenarEscenario(e) {
    if (!esDev()) { ctx.labMision?.(e.mision); ventana("lab", true); return; }
    const n = nombreArchivo(`${ctx.D?.()?.nombre || "dron"}_${e.id}`).replace(/_+/g, "_");
    if (ES.archivos[n] === undefined) ES.archivos[n] = programaEscenario(e, n);
    ES.abierto = n; guardarArchivos(); renderArchivos(); cargarEditor();
    ventana("ide", true);
    linea(t("Abrí {n}.pbd: el plan de vuelo de «{e}». Córrelo con ▶ (o cámbialo primero).", { n, e: e.nombre }), "ok");
  }
  /** Probar: una simulación con la IA del dron activo (la misma prueba del entrenamiento). */
  function probarEscenario() {
    const d = ctx.D?.();
    if (!d?.modelo) return toast(t("Tu dron todavía no tiene IA propia: entrénala primero."));
    comando("simular " + d.modelo);
  }

  // ---------------- la app Calendario: los días del negocio, los vencimientos, lo que llega y el arriendo ----------------
  function renderCalendario() {
    const p = ctx.P(), N = p?.negocio, box = $("es-cal"), D = ctx.ND;
    if (!N || !D) { box.innerHTML = `<p class="muted">${t("Todavía no hay negocio: empieza la campaña.")}</p>`; return; }
    const hoy = N.dia, ini = hoy - ((hoy - 1) % 7), n = 28, ev = {};
    const add = (dia, e) => { if (dia >= ini && dia < ini + n) (ev[dia] = ev[dia] || []).push(e); };
    for (const pe of N.pedidos) if (pe.estado === "nuevo" || pe.estado === "aceptado") {
      const C = pe.cliente ? NG.cliente(D, pe.cliente) : null;
      add(pe.limite, { ic: C?.avatar || "⭐", txt: pe.titulo, cls: pe.limite <= hoy ? "urge" : pe.estado === "aceptado" ? "acept" : "", cid: pe.cliente });
    }
    for (const u of p.inventario) if (u.llega > hoy) add(u.llega, { ic: "🚚", txt: t("llega: {pieza}", { pieza: PT_nombre(u.id) }), cls: "envio" });
    const A = D.trabajos?.arriendo;
    if (A && p.modo !== "dev" && p.rep >= A.desde_rep) for (let d = ini; d < ini + n; d++) if (d > hoy && d % A.cada === 0) add(d, { ic: "💸", txt: t("arriendo −${n}", { n: A.monto }), cls: "gasto" });
    let html = `<div class="cal-top"><b>${t("Día {n}", { n: hoy })}</b><span class="muted">${t("{n} pedidos abiertos", { n: N.pedidos.filter((x) => x.estado === "nuevo" || x.estado === "aceptado").length })}</span></div><div class="cal">`;
    for (let d = ini; d < ini + n; d++) {
      const es = ev[d] || [];
      html += `<div class="cal-d${d === hoy ? " hoy" : ""}${d < hoy ? " pasado" : ""}"><span class="cal-n">${d}</span>` +
        es.slice(0, 3).map((e, i) => `<button class="cal-e ${e.cls}" data-d="${d}" data-i="${i}" title="${esc(e.txt)}">${e.ic}</button>`).join("") + (es.length > 3 ? `<small>+${es.length - 3}</small>` : "") + `</div>`;
    }
    html += `</div>`;
    const prox = Object.entries(ev).filter(([d]) => +d >= hoy).sort((a, b) => a[0] - b[0]).flatMap(([d, es]) => es.map((e) => [+d, e])).slice(0, 8);
    html += `<h4>${t("Lo que viene")}</h4>` + (prox.length ? `<ul class="cal-l">${prox.map(([d, e]) => `<li class="${e.cls}"><span>${e.ic}</span><b>${esc(e.txt)}</b><small>${d === hoy ? t("hoy") : t("en {n} días", { n: d - hoy })}</small></li>`).join("")}</ul>` : `<p class="muted">${t("Nada por ahora.")}</p>`);
    box.innerHTML = html;
    box.querySelectorAll(".cal-e").forEach((b) => (b.onclick = () => { const e = ev[b.dataset.d][b.dataset.i]; if (e.cid) { ventana("mensajes", true); setTimeout(() => ctx.celular?.abrir(e.cid), 80); } }));
  }
  const PT_nombre = (id) => { for (const k of Object.keys(ctx.cat)) { const x = Array.isArray(ctx.cat[k]) && ctx.cat[k].find((z) => z.id === id); if (x) return x.nombre; } return id; };

  // ---------------- la app Finanzas: la plata, lo que entra y lo que sale ----------------
  function renderBanco() {
    const p = ctx.P(), box = $("es-banco"), ms = p.movimientos || [];
    const ent = ms.filter((m) => m.monto > 0).reduce((a, m) => a + m.monto, 0), sal = ms.filter((m) => m.monto < 0).reduce((a, m) => a - m.monto, 0);
    const din = (x) => "$" + Math.abs(x).toLocaleString(idioma());
    box.innerHTML = `<div class="bk-saldo">${din(p.plata)}</div><div class="bk-sub"><span>⭐ ${t("reputación {n}", { n: p.rep })}</span>${p.negocio ? `<span>${t("Día {n}", { n: p.negocio.dia })}</span>` : ""}</div>` +
      `<div class="bk-cajas"><div><span class="muted">${t("Entró")}</span><b class="ok">+${din(ent)}</b></div><div><span class="muted">${t("Salió")}</span><b class="bad">−${din(sal)}</b></div></div>` +
      (ms.length ? `<div class="bk-mov">${ms.slice().reverse().slice(0, 60).map((m) => `<span class="d">${m.dia != null ? t("día {n}", { n: m.dia }) : ""}</span><span>${esc(m.txt)}</span><span class="m ${m.monto > 0 ? "mas" : "menos"}">${m.monto > 0 ? "+" : "−"}${din(m.monto)}</span>`).join("")}</div>`
        : `<p class="muted">${t("Todavía no hay movimientos: aquí sale lo que cobras y lo que gastas.")}</p>`);
  }

  // ---------------- qué modelo mirar (gráfica, red, Avance y Simular) ----------------
  function renderSel() {
    const sel = $("es-graf-m");
    if (document.activeElement === sel) return;
    const modelosVer = [...(ES.entrenando || []).map((x) => [x.slug, `● ${x.slug}`]),
      ...ES.modelos.filter((m) => m.tiene_modelo && !(ES.entrenando || []).some((x) => x.slug === m.slug)).map((m) => [m.slug, m.slug])];
    if (ES.grafSlug && !modelosVer.some(([v]) => v === ES.grafSlug)) modelosVer.unshift([ES.grafSlug, ES.grafSlug]);
    if (!modelosVer.length) modelosVer.push(["", t("(ningún modelo)")]);
    const firma = JSON.stringify([modelosVer, ES.grafSlug]);
    if (firma === ES.selFirma) return;
    ES.selFirma = firma;
    sel.innerHTML = "";
    for (const [v, tx] of modelosVer) sel.add(new Option(tx, v, false, v === ES.grafSlug));
    sel.title = ES.grafSlug ? t("Mirando: {m}", { m: ES.grafSlug }) : "";
  }
  $("es-graf-m").onchange = (ev) => { ES.grafSlug = ev.target.value; ES.grafFijo = true; ES.graf = []; ES.red = null; renderSel(); tick(); if (abierta("sim")) leerRed(); };
  const mirado = () => ES.grafSlug || ES.run?.cfg.modelo;
  $("es-avance").onclick = () => (mirado() ? comando("avance " + mirado()) : linea(t("Corre un programa o escribe info <modelo> primero."), "bad"));
  $("es-simular").onclick = () => (mirado() ? comando("simular " + mirado()) : linea(t("Corre un programa o escribe info <modelo> primero."), "bad"));
  $("es-red-ant").onclick = () => mirarDron((ES.red?.i ?? 0) - 1);
  $("es-red-sig").onclick = () => mirarDron((ES.red?.i ?? 0) + 1);
  $("es-red-azar").onclick = () => mirarDron(Math.floor(Math.random() * (ES.red?.n || 50)));
  $("es-red-i").onchange = (ev) => mirarDron(Number(ev.target.value) - 1);

  // ---------------- la red neuronal en vivo (de un dron de los que entrenan) ----------------
  function redSondear(on) {
    clearInterval(ES.redPoll);
    ES.redPoll = 0;
    if (on && ctx.G.screen === "estudio" && abierta("sim")) { ES.redPoll = setInterval(leerRed, 400); leerRed(); }
  }
  async function leerRed() {
    if (ctx.G.screen !== "estudio" || !abierta("sim")) return redSondear(false);
    if (!ES.grafSlug) await tick();                 // recién abierto: buscar qué está entrenando
    const slug = ES.grafSlug;
    if (!slug) { ES.red = null; return dibujarRed(); }
    const r = await api(`/api/red?modelo=${encodeURIComponent(slug)}`);
    ES.red = r.ok ? r : null;
    dibujarRed();
  }
  async function mirarDron(i) {
    const R = ES.red, slug = ES.grafSlug;
    if (!R || !slug) return;
    const n = R.n || 1, k = ((Math.round(i) % n) + n) % n;
    if (!ES.modelos.length) await cargarModelos();
    const donde = ES.run?.cfg.modelo === slug ? ES.run.cfg.donde : ES.modelos.find((m) => m.slug === slug)?.donde || "fondo";
    const r = await api("/api/lab", { accion: "ajustar", modelo: slug, donde, watch: k });
    if (!r.ok) linea(t("No pude cambiar de dron: {msg}", { msg: r.msg || "?" }), "bad");
    ES.red = { ...R, i: k, pidiendo: k };
    dibujarRed();
  }
  function dibujarRed() {
    const cv = $("es-redc"), R = ES.red;
    const vacio = $("es-red-v");
    vacio.hidden = !!R;
    if (!R) {
      vacio.textContent = ES.grafSlug ? t('"{m}" no está entrenando: la red se ve en vivo mientras entrena.', { m: ES.grafSlug }) : t("Corre un programa para ver su red en vivo.");
      $("es-red-t").textContent = "";
      cv.getContext("2d").clearRect(0, 0, cv.width, cv.height);
      $("es-red-n").textContent = ""; $("es-red-top").textContent = "";
      return;
    }
    $("es-red-t").textContent = t("{m} · gen {gen} · {red}", { m: R.modelo || ES.grafSlug, gen: R.gen ?? "?", red: R.capas.join("→") });
    const inp = $("es-red-i");
    if (document.activeElement !== inp) { inp.value = R.i + 1; inp.max = R.n; }
    $("es-red-n").textContent = t("de {n}", { n: R.n });
    const h = cv.parentElement.clientHeight;
    if (!h) return;
    const top = pintarRed(cv, R, { altoMin: h, altoMax: h });
    $("es-red-top").textContent = t("siente: {lista}", { lista: top.slice(0, 2).join(" · ") });
    $("es-red-top").title = t("Lo que más siente ahora: {lista}", { lista: top.join(" · ") });
  }
  /** " · normal 4" para los parámetros de premios() y castigos() (lo que recomiendan las misiones, de 0 a 10). */
  function rec(f, k) {
    if (f.nombre !== "premios" && f.nombre !== "castigos") return "";
    const r = recomendados(ctx.ent.misiones, ctx.ent.escala_premios)[k.split(" / ")[0]];
    return r ? ` <b class="warn">· ${t("normal {v}", { v: esc(r) })}</b>` : "";
  }
  /** Un dibujito de la red: 38 -> capas -> 4. */
  function redSVG() {
    const capas = [38, 128, 128, 4], W = 300, H = 150, xs = capas.map((_, i) => 20 + (i * (W - 40)) / (capas.length - 1));
    const ys = (n) => { const k = Math.min(n, 9); return Array.from({ length: k }, (_, j) => 18 + (j * (H - 36)) / Math.max(1, k - 1)); };
    let s = `<svg viewBox="0 0 ${W} ${H + 18}" width="100%">`;
    for (let i = 0; i < capas.length - 1; i++) for (const y1 of ys(capas[i])) for (const y2 of ys(capas[i + 1])) s += `<line x1="${xs[i]}" y1="${y1}" x2="${xs[i + 1]}" y2="${y2}" stroke="rgba(60,203,255,.13)"/>`;
    capas.forEach((n, i) => ys(n).forEach((y) => (s += `<circle cx="${xs[i]}" cy="${y}" r="4" fill="${i === 0 ? "#9db3a9" : i === capas.length - 1 ? "#ff7a1a" : "#3ccbff"}"/>`)));
    [t("38 sensores"), "128", "128", t("4 palancas")].forEach((tx, i) => (s += `<text x="${xs[i]}" y="${H + 14}" text-anchor="middle" font-size="10" fill="#9db3a9">${tx}</text>`));
    return s + "</svg>";
  }
  function dibujarGrafica() {
    const cv = $("es-graf");
    if (!cv) return;
    const hs = ES.graf || [];
    $("es-graf-t").textContent = ES.grafSlug ? `${ES.grafSlug} · ${ES.grafActivo ? t("entrenando") : t("quieto")}${hs.length ? " · " + t("gen {a}-{b}", { a: hs[0][0], b: hs.at(-1)[0] }) : ""}` : "";
    const vacio = $("es-graf-v");
    vacio.hidden = hs.length >= 2;
    vacio.textContent = ES.grafSlug ? t("Todavía no hay datos de {m}.", { m: ES.grafSlug }) : t("Corre un programa para ver cómo aprende.");
    const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight, P = 28;
    if (!W || !H) return;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const g = cv.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    g.strokeStyle = "rgba(234,242,239,.1)"; g.fillStyle = "#9db3a9"; g.font = "11px sans-serif";
    for (const v of [0, 0.25, 0.5, 0.75, 1]) { const y = H - P - v * (H - 2 * P); g.beginPath(); g.moveTo(P + 6, y); g.lineTo(W - 8, y); g.stroke(); g.fillText(Math.round(v * 100) + "%", 2, y + 4); }
    if (hs.length < 2) return;
    const serie = (idx, color) => {
      g.strokeStyle = color; g.lineWidth = 2; g.beginPath();
      let primero = true;
      hs.forEach((h, i) => {
        const v = h[idx];
        if (typeof v !== "number") return;
        const x = P + 6 + (i * (W - P - 14)) / (hs.length - 1), y = H - P - Math.max(0, Math.min(1, v)) * (H - 2 * P);
        primero ? g.moveTo(x, y) : g.lineTo(x, y); primero = false;
      });
      g.stroke();
    };
    serie(3, "#ff5040"); serie(5, "#3ccbff"); serie(2, "#47f08a");
  }

  // ---------------- botones ----------------
  $("es-correr").onclick = () => comando("correr");
  $("es-revisar").onclick = () => comando("revisar");
  $("es-parar").onclick = () => comando("parar");
  $("es-bajar").onclick = () => { menuArchivos(false); descargar(); };
  $("es-armar").onclick = () => { cerrar(); ctx.abrirBanco?.(); };     // el banco de armado es la mesa 3D del garaje
  $("es-ajustes").onclick = () => (abierta("ajustes") ? alFrente("ajustes") : ventana("ajustes", true));   // del sistema: no es un programa
  $("es-limpiar").onclick = () => { $("es-out").innerHTML = ""; };
  $("es-nuevo").onclick = async () => { menuArchivos(false); const n = await pedirTexto(t("Nombre del programa:"), "mi_modelo", { si: t("Crear") }); if (n) comando("nuevo " + n); };
  $("es-blender").onclick = () => comando("blender");
  $("es-volver").onclick = cerrar;

  $("es-menu").onclick = () => { cerrar(); ctx.irMenu?.(); };
  $("es-salir").onclick = () => ctx.salir?.();
  /** Para el tutorial del modo desarrollador: ¿el IDE abierto? ¿el menú de programas? la línea dron(…) del programa abierto. */
  function estadoTuto() {
    const src = ES.abierto ? ES.archivos[ES.abierto] || "" : "", lineas = src.split("\n");
    const i = lineas.findIndex((l) => /^\s*(dron|drone)\s*\(/.test(l));
    const m = i >= 0 && /^\s*(?:dron|drone)\s*\(\s*["']([^"']*)["']/.exec(lineas[i]);
    const mi = /^\s*(?:mision|mission)\s*\(\s*["']([^"']*)["']/m.exec(src), deEn = Object.fromEntries(Object.entries(ES.data?.alias_en?.misiones || {}).map(([es, en]) => [en, es]));
    return { ide: abierta("ide"), menu: !$("es-archivo-m").hidden, archivo: ES.abierto, mision: mi ? deEn[mi[1]] || mi[1] : null,
      dron: i >= 0 ? { linea: i + 1, valor: m ? m[1] : null } : null, corriendo: !!ES.run };
  }
  /** El tutorial marca una línea del editor (👉 en el margen); null = ninguna. */
  function marcar(n) { if (ES.marca !== n) { ES.marca = n; if (ES.data) pintar(); } }
  return { abrir, comando, vaciar, deLaPartida, estadoTuto, marcar, get estado() { return ES; } };
}

export { repr };
