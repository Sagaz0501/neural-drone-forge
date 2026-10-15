// =====================================================================
// El ESTUDIO PBDMM (modo desarrollador): un "IDE" para crear y entrenar modelos con el lenguaje PBDMM.
//   izquierda: tus programas (.pbd, en este navegador) y los ejemplos · centro: el editor y la TERMINAL
//   derecha: la ayuda (funciones, e, comandos), las lecciones (cómo aprende una IA) y la gráfica en vivo
// Correr un programa = el mismo pedido que el Laboratorio (POST /api/lab -> live_train.py, en el fondo o en Blender);
// mientras entrena, el estudio lee el progreso (GET /api/lab) y llama las funciones del programa (cada_generacion…).
// El lenguaje vive en pbdmm.js; la ayuda en data/pbdmm.json.
// =====================================================================
import { compilar, pedidoDe, estadoE, ErrorPB, repr, nivelDe, recomendados } from "./pbdmm.js";
import { contexto, opciones, delPrograma } from "./autocompletar.js";
import { dibujarRed as pintarRed } from "./redviz.js";
import { t, datos, idioma, num } from "./i18n.js";
const numero = (x) => (Number.isInteger(x) ? String(x) : num(x, 1));       // 4,5 / 4.5 según el idioma

const ARCH = "dronmaker.pbdmm.archivos", ABIERTO = "dronmaker.pbdmm.abierto";
const leerLS = (k, d) => { try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : d; } catch { return d; } };
const ponerLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } };
const pct = (x) => (typeof x === "number" ? Math.round(x * 100) + " %" : "—");
const chispa = (xs) => xs.map((x) => (typeof x === "number" ? "▁▂▃▄▅▆▇█"[Math.max(0, Math.min(7, Math.floor(x * 8)))] : " ")).join("");

export function initEstudio(ctx) {
  const { $, esc, api, toast } = ctx;
  const ES = { data: null, archivos: leerLS(ARCH, null), abierto: leerLS(ABIERTO, null), tab: "ayuda", hist: [], hi: -1,
    run: null, poll: 0, graf: null, grafSlug: null, modelos: [], errLinea: null, tema: null,
    ac: { items: [], sel: 0, cx: null, abierto: false }, vista: "curvas", red: null, redPoll: 0 };

  async function cargarData() {
    if (ES.data) return ES.data;
    const r = await fetch("data/pbdmm.json");
    ES.data = await datos("pbdmm", await r.json());            // + la capa del idioma (data/en/pbdmm.json)
    if (!ES.archivos) {
      ES.archivos = { mi_primer_modelo: ES.data.ejemplos.hover };
      ES.abierto = "mi_primer_modelo";
      guardarArchivos();
    }
    if (!ES.archivos[ES.abierto]) ES.abierto = Object.keys(ES.archivos)[0] || null;
    return ES.data;
  }
  const guardarArchivos = () => { ponerLS(ARCH, ES.archivos); ponerLS(ABIERTO, ES.abierto); };
  /** Lo que el compilador necesita saber del juego. */
  const dataCompilar = () => ({
    ...ES.data, misiones: ctx.ent.misiones, drones: ctx.P().drones.map((d) => d.nombre),
    premiosValidos: [...new Set([...ctx.ent.premios.map((p) => p.k), "near"])],
    tiposPremio: { ...Object.fromEntries(ctx.ent.premios.map((p) => [p.k, p.tipo])), near: "premio" },
    escala: ctx.ent.escala_premios,
    modelos: ES.modelos.length ? ES.modelos : null,     // para revisar desde="otro" (si no hay lista, no se revisa)
  });

  // ---------------- abrir / cerrar ----------------
  async function abrir() {
    if (ctx.P()?.modo !== "dev") { toast(t("El Estudio PBDMM es del modo desarrollador. En el modo normal la IA se entrena en el Laboratorio.")); return; }
    await cargarData();
    ctx.show("estudio");
    renderArchivos();
    cargarEditor();
    renderDer();
    cargarModelos();                     // para autocompletar modelo(…) y desde=
    if (!$("es-out").childElementCount) {
      linea(`PBDMM ${ES.data.version} · Python Base Dron Model Maker`, "ok");
      linea(t('Escribe "ayuda" para ver los comandos. Ctrl/⌘+Enter corre el programa. Empieza por la pestaña "Aprende".'), "muted");
    }
    sondear(true);
    $("es-src").focus();
  }
  function cerrar() { sondear(!!ES.run); redSondear(false); ctx.irTaller(); }

  // ---------------- editor ----------------
  const KWS = /\b(def|return|if|elif|else|for|in|and|or|not|is|global|pass|break|continue)\b/;
  function resaltar(src) {
    const fns = new Set((ES.data?.funciones || []).map((f) => f.nombre).concat(["print", "str", "int", "float", "round", "abs", "min", "max", "sum", "len", "range", "list", "type"]));
    const hooks = new Set(ES.data?.hooks || []);
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
    $("es-gut").innerHTML = Array.from({ length: n }, (_, i) => `<div class="${ES.errLinea === i + 1 ? "err" : ""}">${i + 1}</div>`).join("");
    sincScroll();
  }
  function sincScroll() { const ta = $("es-src"); $("es-hl").scrollTop = ta.scrollTop; $("es-hl").scrollLeft = ta.scrollLeft; $("es-gut").scrollTop = ta.scrollTop; }
  function cargarEditor() {
    $("es-src").value = ES.archivos[ES.abierto] ?? "";
    $("es-src").readOnly = !ES.abierto;
    $("es-src").placeholder = ES.abierto ? "" : t("Sin programa abierto: crea uno (+ Nuevo) o abre un ejemplo.");
    $("es-nombre").textContent = ES.abierto ? ES.abierto + ".pbd" : t("(sin archivo)");
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
    data: ES.data, misiones: ctx.ent.misiones, nombresNiveles: ES.data.nombres_niveles,
    drones: ctx.P().drones.map((d) => d.nombre), modelos: ES.modelos, programa: delPrograma($("es-src").value),
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
      b.onclick = () => { ES.abierto = n; guardarArchivos(); renderArchivos(); cargarEditor(); };
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
    for (const n of Object.keys(ES.data.ejemplos)) {
      const b = document.createElement("button");
      b.className = "es-item muted";
      b.textContent = n;
      b.onclick = () => comando("ejemplo " + n);
      ej.appendChild(b);
    }
  }
  const nombreArchivo = (s) => String(s || "").toLowerCase().replace(/\.pbd$/, "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
  function nuevoArchivo(nombre, src) {
    let n = nombreArchivo(nombre) || "programa", k = 2;
    const base = n;
    while (ES.archivos[n] !== undefined) n = `${base}_${k++}`;
    ES.archivos[n] = src ?? `# ${n}.pbd\n\nmodelo("${n}", desde="base")\nmision("grabar")\nentrenar_en("fondo")\n\ndef cada_generacion(e):\n    print(f"gen {e.generacion}: ${t("éxito")} {e.exito:.0%}")\n`;
    ES.abierto = n;
    guardarArchivos(); renderArchivos(); cargarEditor();
    return n;
  }
  /** Elimina un programa de este navegador (pregunta antes; el modelo que haya entrenado no se toca). */
  function borrarArchivo(n) {
    if (!n || ES.archivos[n] === undefined) return linea(n ? t("No hay {n}.pbd (archivos para verlos)", { n }) : t("No hay ese archivo (archivos para verlos)"), "bad");
    if (!confirm(t("¿Eliminar {n}.pbd? Se borra de este navegador (los modelos que entrenó no se tocan). Si lo quieres guardar, primero dale Descargar.", { n }))) return linea(t("No se eliminó."), "muted");
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
    d.textContent = txt;
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

  async function comando(c) {
    linea("› " + c, "cmd");
    const [cmd, ...args] = c.split(/\s+/);
    const a0 = args[0], a1 = args[1];
    try {
      switch (cmd.toLowerCase()) {
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
        case "modelos": case "ls": return modelos(a0);
        case "info": return info(a0);
        case "pausar": return control(a0, "pausar", { pausa: true });
        case "seguir": return control(a0, "pausar", { pausa: false });
        case "detener": return control(a0, "detener");
        case "guardar": return control(a0, "guardar");
        case "copiar": case "renombrar": {
          if (!a0 || !a1) return linea(t("{cmd} <modelo> <nuevo>", { cmd }), "bad");
          const r = await api("/api/modelo", { accion: cmd === "copiar" ? "copiar" : "renombrar", slug: a0, nuevo: nombreArchivo(a1) });
          return linea(r.msg || (r.ok ? t("listo") : t("no se pudo")), r.ok ? "ok" : "bad");
        }
        case "borrar": {
          if (!a0) return linea(t("borrar <modelo>"), "bad");
          if (!confirm(t('¿Mandar el modelo "{m}" a la papelera (models/drones/_papelera)?', { m: a0 }))) return linea(t("No se borró."), "muted");
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
          const src = ES.data.ejemplos[a0];
          if (!src) return linea(t("Ejemplos: {lista}", { lista: Object.keys(ES.data.ejemplos).join(", ") }), "muted");
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
      linea(t("Funciones del lenguaje: ayuda <función> (o la pestaña Ayuda). Lo que trae e: ayuda e."), "muted");
      return;
    }
    if (tema === "e") { D.e_doc.forEach(([k, d]) => linea(`  ${k.padEnd(34)} ${d}`)); return; }
    if (tema === "funciones") { D.funciones.forEach((f) => linea(`  ${f.firma}`)); return; }
    if (tema === "hooks") { D.hooks_doc.forEach(([k, d]) => linea(`  def ${k}: ${d}`)); return; }
    const f = D.funciones.find((x) => x.nombre === tema);
    if (!f) return linea(t('No hay ayuda de "{tema}". Prueba: ayuda funciones · ayuda e · ayuda hooks', { tema }), "bad");
    linea(f.firma, "ok");
    linea(f.desc);
    f.params.forEach(([k, d]) => linea(`  ${k}: ${d}`, "muted"));
    linea(t("ejemplo:") + " " + f.ejemplo, "muted");
  }

  async function cargarModelos() {
    const r = await api("/api/modelos");
    if (r.modelos) { ES.modelos = r.modelos; ES.modelosT = Date.now(); }
    return ES.modelos;
  }
  async function modelos(orden = "exito") {
    const ms = await cargarModelos();
    if (!ms.length) return linea(t("No encontré modelos (¿está corriendo python scripts/jugar.py?)"), "bad");
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
    linea(`  ${m.entrenando ? t("entrenando en {donde}", { donde: m.donde }) : t("quieto")} · ${t("para graficarlo: pestaña Gráfica")}`, "muted");
    ES.grafSlug = slug; ES.grafFijo = true; ES.graf = hs; if (ES.tab === "grafica") renderDer();
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
      n: c.drones, donde: c.donde === "blender" ? "Blender" : t("el fondo"), vel: c.velocidad }));
    linea(`  ${valoresTxt(c.premiosFinal)}${c.viento ? " · " + t("viento {v} m/s", { v: c.viento }) : ""}${c.lr !== undefined ? ` · lr ${c.lr}` : ""}${c.ent !== undefined ? " · " + t("exploración {v}", { v: c.ent }) : ""}`, "muted");
    linea("  " + t("funciones: {lista}", { lista: prog.hooks.length ? prog.hooks.join(", ") : t("ninguna (solo entrena; párala con detener {m})", { m: c.modelo }) }), "muted");
    if (soloRevisar) return;
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
    linea(`✓ ${r.msg}${r.modelo_txt ? " · " + r.modelo_txt : ""}`, "ok");
    if (c.donde === "blender") {
      const s = await api("/api/lab");
      if (!s.blender?.abierto) linea("  " + t("Blender no está abierto: escribe blender (cuando abra, toma el pedido)."), "warn");
      if (c.lr !== undefined || c.ent !== undefined) linea("  " + t("lr/exploración se mandan cuando Blender empiece a entrenar."), "muted");
    }
    R = { prog, cfg: c, ses: { t0: Date.now(), gen0: null, mejor: null }, ultGen: null, empezo: false, t0: Date.now(), lrPend: c.donde === "blender" && (c.lr !== undefined || c.ent !== undefined) };
    ES.run = R;
    ES.grafSlug = c.modelo; ES.graf = [];
    renderRun();
    sondear(true);
  }

  /** Los valores reales del entrenador -> "premios: grabar=4 … · castigos: chocar=3 …" (escala 0-10, en español). */
  function valoresTxt(reales) {
    const esc_ = ctx.ent.escala_premios, al = Object.fromEntries(Object.entries(ES.data.alias_premios).map(([a, k]) => [k, a]));
    const tipo = (k) => ctx.ent.premios.find((p) => p.k === k)?.tipo || "premio";
    const parte = (tp) => Object.entries(reales).filter(([k]) => tipo(k) === tp).map(([k, v]) => `${al[k] || k}=${numero(nivelDe(k, v, esc_))}`).join(" ");
    if (!Object.keys(reales).length) return t("premios y castigos: los de siempre del entrenador (ponlos con premios() y castigos())");
    return t("premios: {p} · castigos: {c} (de 0 a 10)", { p: parte("premio") || "—", c: parte("castigo") || "—" });
  }
  /** Lo que dice el servidor de un modelo: {tr, activo}. */
  function trDe(s, slug) {
    const f = (s.fondo || []).find((x) => x.modelo === slug);
    if (f && f.activo) return { tr: f, activo: true };
    const b = s.blender || {}, tr = s.entrenador || {};
    if (s.blender_modelo === slug && b.abierto && (b.corriendo || tr.activo)) return { tr, activo: true };
    if (f) return { tr: f, activo: false };
    if (tr.modelo === slug) return { tr, activo: false };
    return { tr: null, activo: false };
  }
  function llamarHook(R, nombre, e) {
    try { R.prog.reaccionar(nombre, e); }
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
    if (s.blender_modelo && b.abierto && (b.corriendo || s.entrenador?.activo)) out.push({ slug: s.blender_modelo, donde: "Blender" });
    for (const f of s.fondo || []) if (f.activo && !out.some((x) => x.slug === f.modelo)) out.push({ slug: f.modelo, donde: "fondo" });
    return out;
  }
  async function tick() {
    const s = await api("/api/lab");
    if (s.ok === false) return;
    ES.entrenando = entrenandoAhora(s);
    // sin un modelo elegido (o el elegido ya no entrena y hay otro que sí): mirar el que está entrenando
    if (ES.entrenando.length && (!ES.grafSlug || (!ES.grafFijo && !ES.entrenando.some((x) => x.slug === ES.grafSlug)))) {
      ES.grafSlug = ES.entrenando[0].slug;
      if (ES.tab === "grafica") renderDer();
    }
    const R = ES.run;
    if (R) {
      const { tr, activo } = trDe(s, R.cfg.modelo);
      if (activo && tr) {
        if (!R.empezo) {
          R.empezo = true; R.ses.gen0 = tr.gen ?? 0; R.ultGen = tr.gen ?? 0;
          linea("▶ " + t('"{m}" está entrenando (generación {gen}).', { m: R.cfg.modelo, gen: tr.gen ?? 0 }), "ok");
          if (R.lrPend) { R.lrPend = false; hostDe(() => R).ajustar({ lr: R.cfg.lr, ent: R.cfg.ent }); }
          llamarHook(R, "al_empezar", estadoE(tr, R.ses, ctx.ent.escala_premios));
        } else if ((tr.gen ?? 0) > R.ultGen) {
          R.ultGen = tr.gen;
          if (typeof tr.succ === "number") R.ses.mejor = Math.max(R.ses.mejor ?? 0, tr.succ);
          if (ES.run === R) llamarHook(R, "cada_generacion", estadoE(tr, R.ses, ctx.ent.escala_premios));
        }
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
    if (ES.tab === "grafica" && ES.vista !== "red") dibujarGrafica();
    renderRun();
  }
  function sondear(on) {
    clearInterval(ES.poll);
    if (on) { ES.poll = setInterval(tick, 1500); tick(); }
  }
  function renderRun() {
    const R = ES.run, el = $("es-run");
    el.innerHTML = R ? `<span class="ok">●</span> ${esc(R.cfg.modelo)} · ${R.empezo ? `gen ${R.ultGen}` : t("esperando…")}` : `<span class="muted">○ ${t("nada corriendo")}</span>`;
    $("es-parar").disabled = !R;
  }

  // ---------------- panel derecho: ayuda · aprende · gráfica ----------------
  function renderDer() {
    document.querySelectorAll("#es-tabs button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.t === ES.tab)));
    const box = $("es-der"), D = ES.data;
    box.innerHTML = "";
    if (ES.tab === "ayuda") {
      box.insertAdjacentHTML("beforeend", `<p class="muted">${t("Un programa PBDMM describe <b>cómo</b> se entrena un modelo. Arriba: qué modelo, qué misión, con qué dron, sus premios y sus castigos. Abajo: funciones que el juego llama mientras entrena. Toca <b>insertar</b> para poner el ejemplo en tu programa. Al escribir <code>dron(</code>, <code>mision(</code>, <code>premios(</code>, <code>castigos(</code>, <code>e.</code>… te salen las opciones (<b>Ctrl+Espacio</b> las abre cuando quieras).")}</p>`);
      const grupos = [...new Set(D.funciones.map((f) => f.grupo))];
      for (const f of grupos.flatMap((g) => D.funciones.filter((x) => x.grupo === g))) {
        if (f === D.funciones.find((x) => x.grupo === f.grupo)) box.insertAdjacentHTML("beforeend", `<h4>${esc(f.grupo)}</h4>`);
        const d = document.createElement("details");
        d.className = "es-fn";
        d.innerHTML = `<summary><code>${esc(f.firma)}</code><span class="muted"> · ${{ arriba: t("arriba"), "función": t("en una función"), "las dos": t("arriba o en una función") }[f.donde] || ""}</span></summary>` +
          `<p>${esc(f.desc)}</p>${f.params.length ? `<ul>${f.params.map(([k, tx]) => `<li><code>${esc(k)}</code> ${esc(tx)}${rec(f, k)}</li>`).join("")}</ul>` : ""}` +
          `<pre>${esc(f.ejemplo)}</pre>`;
        const b = document.createElement("button");
        b.className = "btn ghost small"; b.textContent = t("insertar");
        b.onclick = () => insertar(f.ejemplo + "\n");
        d.appendChild(b);
        box.appendChild(d);
      }
      box.insertAdjacentHTML("beforeend", `<h4>${t("Funciones que llama el juego")}</h4><ul>${D.hooks_doc.map(([k, tx]) => `<li><code>def ${esc(k)}:</code> ${esc(tx)}</li>`).join("")}</ul>` +
        `<h4>${t("Lo que trae e")}</h4><ul>${D.e_doc.map(([k, tx]) => `<li><code>${esc(k)}</code> ${esc(tx)}</li>`).join("")}</ul>` +
        `<h4>${t("Comandos de la terminal")}</h4><ul>${D.comandos.map(([k, tx]) => `<li><code>${esc(k)}</code> ${esc(tx)}</li>`).join("")}</ul>`);
    } else if (ES.tab === "aprende") {
      for (const l of D.lecciones) {
        const d = document.createElement("details");
        d.className = "es-lec";
        d.open = l === D.lecciones[0];
        d.innerHTML = `<summary>${esc(l.titulo)}</summary><p>${esc(l.texto)}</p>`;
        box.appendChild(d);
      }
      box.insertAdjacentHTML("beforeend", `<div class="es-red" aria-label="${t("La red: 38 entradas, capas ocultas, 4 palancas")}">${redSVG()}</div>`);
    } else {
      box.innerHTML = `<div class="seg" id="es-vista"><button data-v="curvas">${t("Curvas")}</button><button data-v="red">${t("Red neuronal")}</button></div>` +
        `<div class="es-red-ctl"><label>${t("Modelo")} <select id="es-graf-m" class="sim-sel" aria-label="${t("Qué modelo mirar")}"></select></label>` +
        `<button class="btn ghost small" id="es-avance">${t("Avance del modelo")}</button><button class="btn ai small" id="es-simular">${t("Simular prueba")}</button></div>`;
      const sel = box.querySelector("#es-graf-m");
      const modelosVer = [...(ES.entrenando || []).map((x) => [x.slug, `${x.slug} · ${t("entrenando ({donde})", { donde: x.donde })}`]),
        ...ES.modelos.filter((m) => m.tiene_modelo && !(ES.entrenando || []).some((x) => x.slug === m.slug)).map((m) => [m.slug, m.slug])];
      if (ES.grafSlug && !modelosVer.some(([v]) => v === ES.grafSlug)) modelosVer.unshift([ES.grafSlug, ES.grafSlug]);
      if (!modelosVer.length) modelosVer.push(["", t("(ningún modelo)")]);
      for (const [v, tx] of modelosVer) sel.add(new Option(tx, v, false, v === ES.grafSlug));
      sel.onchange = () => { ES.grafSlug = sel.value; ES.grafFijo = true; ES.graf = []; ES.red = null; renderDer(); };
      const m = () => ES.grafSlug || ES.run?.cfg.modelo;
      box.querySelector("#es-avance").onclick = () => (m() ? comando("avance " + m()) : linea(t("Corre un programa o escribe info <modelo> primero."), "bad"));
      box.querySelector("#es-simular").onclick = () => (m() ? comando("simular " + m()) : linea(t("Corre un programa o escribe info <modelo> primero."), "bad"));
      box.querySelectorAll("#es-vista button").forEach((b) => {
        b.setAttribute("aria-pressed", String(b.dataset.v === ES.vista));
        b.onclick = () => { ES.vista = b.dataset.v; renderDer(); };
      });
      if (ES.vista === "red") {
        box.insertAdjacentHTML("beforeend", `<p class="muted" id="es-red-t">${t("Buscando la red…")}</p>` +
          `<div class="es-red-ctl"><button class="btn ghost small" id="es-red-ant" aria-label="${t("Dron anterior")}">◀</button><label>${t("Dron")} <input type="number" id="es-red-i" min="1" value="1"></label><span id="es-red-n" class="muted"></span>` +
          `<button class="btn ghost small" id="es-red-sig" aria-label="${t("Dron siguiente")}">▶</button><button class="btn ghost small" id="es-red-azar">${t("Al azar")}</button></div>` +
          `<canvas id="es-redc" aria-label="${t("La red neuronal del dron, en vivo")}"></canvas>` +
          `<p class="es-ley"><span style="color:#ff9e5e">■ ${t("positivo")}</span> <span style="color:#3ccbff">■ ${t("negativo")}</span> <span class="muted">· ${t("más brillante = más activo · las líneas son las conexiones más fuertes")}</span></p>` +
          `<p id="es-red-top" class="muted"></p>`);
        const ir = (i) => mirarDron(i);
        $("es-red-ant").onclick = () => ir((ES.red?.i ?? 0) - 1);
        $("es-red-sig").onclick = () => ir((ES.red?.i ?? 0) + 1);
        $("es-red-azar").onclick = () => ir(Math.floor(Math.random() * (ES.red?.n || 50)));
        $("es-red-i").onchange = (ev) => ir(Number(ev.target.value) - 1);
        redSondear(true);
        dibujarRed();
      } else {
        redSondear(false);
        box.insertAdjacentHTML("beforeend", `<p class="muted" id="es-graf-t"></p><canvas id="es-graf" width="560" height="300" aria-label="${t("Gráfica del entrenamiento")}"></canvas>` +
          `<p class="es-ley"><span style="color:var(--gate)">■ ${t("éxito")}</span> <span style="color:var(--crash)">■ ${t("choque")}</span> <span style="color:var(--next)">■ ${t("calidad (grabar)")}</span></p>` +
          `<p class="muted">${t("Muestra el modelo que está corriendo, o el último que miraste con <code>info &lt;modelo&gt;</code>. Cada punto es una generación.")}</p>`);
        dibujarGrafica();
      }
    }
    if (ES.tab !== "grafica" || ES.vista !== "red") redSondear(false);
  }

  // ---------------- la red neuronal en vivo (de un dron de los que entrenan) ----------------
  function redSondear(on) {
    clearInterval(ES.redPoll);
    ES.redPoll = 0;
    if (on) { ES.redPoll = setInterval(leerRed, 400); leerRed(); }
  }
  async function leerRed() {
    if (G_screen() !== "estudio" || ES.tab !== "grafica" || ES.vista !== "red") return redSondear(false);
    if (!ES.grafSlug) await tick();                 // recién abierto: buscar qué está entrenando
    const slug = ES.grafSlug;
    if (!slug) { ES.red = null; return dibujarRed(); }
    const r = await api(`/api/red?modelo=${encodeURIComponent(slug)}`);
    ES.red = r.ok ? r : null;
    dibujarRed();
  }
  const G_screen = () => ctx.G.screen;
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
    if (!cv) return;
    const el = $("es-red-t");
    if (!R) {
      el.textContent = ES.grafSlug ? t('"{m}" no está entrenando: la red se ve en vivo mientras entrena (en el fondo o en Blender).', { m: ES.grafSlug }) : t("Corre un programa (o escribe info <modelo> de uno que esté entrenando) para ver su red.");
      cv.getContext("2d").clearRect(0, 0, cv.width, cv.height);
      $("es-red-n").textContent = ""; $("es-red-top").textContent = "";
      return;
    }
    el.innerHTML = t('"{m}" · mirando el dron <b>{i}</b> de {n} · generación {gen} · red {red}', { m: esc(R.modelo || ES.grafSlug), i: R.i + 1, n: R.n, gen: R.gen ?? "?", red: R.capas.join(" → ") });
    const inp = $("es-red-i");
    if (document.activeElement !== inp) { inp.value = R.i + 1; inp.max = R.n; }
    $("es-red-n").textContent = t("de {n}", { n: R.n });
    const top = pintarRed(cv, R);
    $("es-red-top").textContent = t("Lo que más siente ahora: {lista}. Cada capa oculta tiene sus neuronas (los números de abajo); las palancas son lo que decide.", { lista: top.join(" · ") });
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
    const el = $("es-graf-t"), hs = ES.graf || [];
    el.textContent = ES.grafSlug ? `"${ES.grafSlug}" · ${ES.grafActivo ? t("entrenando") : t("quieto")} · ${hs.length ? t("generaciones {a}-{b}", { a: hs[0][0], b: hs.at(-1)[0] }) : t("sin datos todavía")}` : t("Nada que graficar: corre un programa o escribe info <modelo>.");
    const g = cv.getContext("2d"), W = cv.width, H = cv.height, P = 28;
    g.clearRect(0, 0, W, H);
    g.strokeStyle = "rgba(234,242,239,.12)"; g.fillStyle = "#9db3a9"; g.font = "11px sans-serif";
    for (const v of [0, 0.25, 0.5, 0.75, 1]) { const y = H - P - v * (H - 2 * P); g.beginPath(); g.moveTo(P, y); g.lineTo(W - 8, y); g.stroke(); g.fillText(Math.round(v * 100) + "%", 0, y + 4); }
    if (hs.length < 2) return;
    const serie = (idx, color) => {
      g.strokeStyle = color; g.lineWidth = 2; g.beginPath();
      let primero = true;
      hs.forEach((h, i) => {
        const v = h[idx];
        if (typeof v !== "number") return;
        const x = P + (i * (W - P - 8)) / (hs.length - 1), y = H - P - Math.max(0, Math.min(1, v)) * (H - 2 * P);
        primero ? g.moveTo(x, y) : g.lineTo(x, y); primero = false;
      });
      g.stroke();
    };
    serie(3, "#ff5040"); serie(5, "#3ccbff"); serie(2, "#47f08a");
  }
  document.querySelectorAll("#es-tabs button").forEach((b) => (b.onclick = () => { ES.tab = b.dataset.t; renderDer(); }));

  // ---------------- botones ----------------
  $("es-correr").onclick = () => comando("correr");
  $("es-revisar").onclick = () => comando("revisar");
  $("es-parar").onclick = () => comando("parar");
  $("es-bajar").onclick = descargar;
  $("es-nuevo").onclick = () => { const n = prompt(t("Nombre del programa:"), "mi_modelo"); if (n) comando("nuevo " + n); };
  $("es-blender").onclick = () => comando("blender");
  $("es-volver").onclick = cerrar;

  return { abrir, comando, get estado() { return ES; } };
}

export { repr };
