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
    ES.data = await r.json();
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
    await cargarData();
    ctx.show("estudio");
    renderArchivos();
    cargarEditor();
    renderDer();
    cargarModelos();                     // para autocompletar modelo(…) y desde=
    if (!$("es-out").childElementCount) {
      linea(`PBDMM ${ES.data.version} · Python Base Dron Model Maker`, "ok");
      linea('Escribe "ayuda" para ver los comandos. Ctrl/⌘+Enter corre el programa. Empieza por la pestaña "Aprende".', "muted");
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
      const [t] = m;
      let c = null;
      if (m[1]) c = "c"; else if (m[2]) c = "s"; else if (m[3]) c = "n";
      else if (m[4]) c = KWS.test(t) && t.length === t.match(KWS)[0].length ? "k" : /^(True|False|None)$/.test(t) ? "n" : hooks.has(t) ? "h" : fns.has(t) && /^\s*\(/.test(src.slice(re.lastIndex)) ? "f" : t === "e" ? "e" : null;
      out += c ? `<span class="t${c}">${esc(t)}</span>` : esc(t);
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
  function sincScroll() { const t = $("es-src"); $("es-hl").scrollTop = t.scrollTop; $("es-hl").scrollLeft = t.scrollLeft; $("es-gut").scrollTop = t.scrollTop; }
  function cargarEditor() {
    $("es-src").value = ES.archivos[ES.abierto] ?? "";
    $("es-src").readOnly = !ES.abierto;
    $("es-src").placeholder = ES.abierto ? "" : "Sin programa abierto: crea uno (+ Nuevo) o abre un ejemplo.";
    $("es-nombre").textContent = ES.abierto ? ES.abierto + ".pbd" : "(sin archivo)";
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
    const t = ev.target, s = t.selectionStart, v = t.value;
    const A = ES.ac;
    if (A.abierto && A.items.length) {
      if (ev.key === "ArrowDown" || ev.key === "ArrowUp") { ev.preventDefault(); A.sel = (A.sel + (ev.key === "ArrowDown" ? 1 : -1) + A.items.length) % A.items.length; pintarAC(); return; }
      if ((ev.key === "Enter" && !ev.metaKey && !ev.ctrlKey) || ev.key === "Tab") { ev.preventDefault(); aceptarAC(A.items[A.sel]); return; }
    }
    if (A.abierto && ev.key === "Escape") { ev.preventDefault(); cerrarAC(); return; }
    if (ev.ctrlKey && ev.code === "Space") { ev.preventDefault(); autocompletar(true); return; }
    if ((ev.metaKey || ev.ctrlKey) && ev.key === "Enter") { ev.preventDefault(); comando("correr"); return; }
    if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === "s") { ev.preventDefault(); toast("Guardado (se guarda solo en este navegador). Para tenerlo en un archivo: Descargar."); return; }
    if (ev.key === "Tab") { ev.preventDefault(); t.setRangeText("    ", s, t.selectionEnd, "end"); t.dispatchEvent(new Event("input")); return; }
    if (ev.key === "Enter") {
      const ini = v.lastIndexOf("\n", s - 1) + 1, lin = v.slice(ini, s);
      let ind = /^ */.exec(lin)[0];
      if (/:\s*(#.*)?$/.test(lin)) ind += "    ";
      ev.preventDefault();
      t.setRangeText("\n" + ind, s, t.selectionEnd, "end");
      t.dispatchEvent(new Event("input"));
    }
  });
  // ---------------- autocompletado: dron( -> "estandar", "azar", tus drones… ----------------
  const fuentesAC = () => ({
    data: ES.data, misiones: ctx.ent.misiones, nombresNiveles: ES.data.nombres_niveles,
    drones: ctx.P().drones.map((d) => d.nombre), modelos: ES.modelos, programa: delPrograma($("es-src").value),
    premios: [...ctx.ent.premios, { k: "near", tipo: "premio", desc: "Por estar cerca de la meta (niveles de metas y hover)." }]
      .map((p) => ({ ...p, alias: Object.entries(ES.data.alias_premios).find(([, k]) => k === p.k)?.[0], rec: recomendados(ctx.ent.misiones, ctx.ent.escala_premios)[p.k] })),
  });
  let anchoLetra = 0;
  function autocompletar(forzar) {
    const t = $("es-src"), A = ES.ac;
    if (!ES.data || t.readOnly || t.selectionStart !== t.selectionEnd) return cerrarAC();
    const cx = contexto(t.value.slice(0, t.selectionStart));
    let items = cx ? opciones(cx, fuentesAC()) : [];
    if (!forzar && cx?.tipo === "nombre" && cx.parcial.length < 2) items = [];
    if (items.length === 1 && cx && items[0].txt.replace(/[(=:]$/, "") === t.value.slice(cx.desde, t.selectionStart)) items = [];   // ya está escrito
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
    const A = ES.ac, box = $("es-ac"), t = $("es-src");
    if (!A.abierto) { box.hidden = true; return; }
    if (!anchoLetra) { const g = document.createElement("canvas").getContext("2d"); g.font = getComputedStyle(t).font; anchoLetra = g.measureText("MMMMMMMMMM").width / 10; }
    const antes = t.value.slice(0, A.cx.desde), lin = antes.split("\n").length - 1, col = antes.length - antes.lastIndexOf("\n") - 1;
    const area = $("es-area").getBoundingClientRect();
    let x = 12 + col * anchoLetra - t.scrollLeft, y = 10 + (lin + 1) * 20 - t.scrollTop + 2;
    const fn = A.fn;
    box.innerHTML = (fn ? `<div class="ac-firma"><code>${esc(fn.firma)}</code>${A.cx.kw ? ` · <b>${esc(A.cx.kw)}</b>` : ""}<br><span>${esc((fn.params.find(([k]) => A.cx.kw && k.split(" ")[0] === A.cx.kw)?.[1]) || fn.desc.split(". ")[0] + ".")}</span></div>` : "") +
      A.items.map((it, i) => `<div class="ac-op" role="option" aria-selected="${i === A.sel}" data-i="${i}"><code>${esc(it.label)}</code><span>${esc(it.det || "")}</span></div>`).join("") +
      (A.items.length ? `<div class="ac-pie">↑↓ elegir · Enter/Tab poner · Esc cerrar · Ctrl+Espacio abrir</div>` : "");
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
    const t = $("es-src"), A = ES.ac, fin = t.selectionStart;
    if (!it || !A.cx) return;
    // lo que ya escribiste de ese argumento (y una comilla de cierre que haya quedado)
    let hasta = fin;
    if (A.cx.enTexto && /["']/.test(t.value[fin] || "")) hasta++;
    const cierra = it.cerrar && t.value[hasta] !== ")";
    t.setRangeText(it.txt + (cierra ? ")" : ""), A.cx.desde, hasta, "end");
    if (it.cerrar && !cierra) t.setSelectionRange(t.selectionStart + 1, t.selectionStart + 1);   // ya había ")": quedar después
    cerrarAC();
    t.dispatchEvent(new Event("input"));           // guarda, pinta y, si pusiste "dron(", abre sus opciones
    t.focus();
  }
  function cerrarAC() { ES.ac.abierto = false; const b = $("es-ac"); if (b) b.hidden = true; }

  function insertar(txt) {
    const t = $("es-src"), s = t.selectionStart;
    const ini = t.value.lastIndexOf("\n", s - 1) + 1, ind = /^ */.exec(t.value.slice(ini, s))[0];
    t.setRangeText(txt.split("\n").join("\n" + ind), s, t.selectionEnd, "end");
    t.dispatchEvent(new Event("input"));
    t.focus();
  }
  function marcarError(err) {
    ES.errLinea = err.linea;
    pintar();
    if (err.linea) {
      const t = $("es-src"), lines = t.value.split("\n");
      const pos = lines.slice(0, err.linea - 1).reduce((a, l) => a + l.length + 1, 0);
      t.focus(); t.setSelectionRange(pos, pos + (lines[err.linea - 1] || "").length);
      t.scrollTop = Math.max(0, (err.linea - 5) * 20);
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
      x.title = `Eliminar ${n}.pbd`;
      x.setAttribute("aria-label", `Eliminar ${n}.pbd`);
      x.onclick = () => borrarArchivo(n);
      fila.append(b, x);
      ul.appendChild(fila);
    }
    if (!Object.keys(ES.archivos).length) ul.innerHTML = `<p class="muted" style="font-size:13px;margin:4px 8px">No tienes programas: + Nuevo o abre un ejemplo.</p>`;
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
    ES.archivos[n] = src ?? `# ${n}.pbd\n\nmodelo("${n}", desde="base")\nmision("grabar")\nentrenar_en("fondo")\n\ndef cada_generacion(e):\n    print(f"gen {e.generacion}: éxito {e.exito:.0%}")\n`;
    ES.abierto = n;
    guardarArchivos(); renderArchivos(); cargarEditor();
    return n;
  }
  /** Elimina un programa de este navegador (pregunta antes; el modelo que haya entrenado no se toca). */
  function borrarArchivo(n) {
    if (!n || ES.archivos[n] === undefined) return linea(`No hay ${n || "ese"}.pbd (archivos para verlos)`, "bad");
    if (!confirm(`¿Eliminar ${n}.pbd? Se borra de este navegador (los modelos que entrenó no se tocan). Si lo quieres guardar, primero dale Descargar.`)) return linea("No se eliminó.", "muted");
    delete ES.archivos[n];
    if (ES.abierto === n) ES.abierto = Object.keys(ES.archivos).sort()[0] || null;
    guardarArchivos(); renderArchivos(); cargarEditor();
    linea(`Eliminé ${n}.pbd`, "ok");
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
    linea(`Abrí ${f.name} como ${n}.pbd`, "ok");
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
    const t = ev.target;
    if (ev.key === "Enter") {
      const c = t.value.trim();
      t.value = "";
      if (!c) return;
      ES.hist.push(c); ES.hi = ES.hist.length;
      comando(c);
    } else if (ev.key === "ArrowUp" && ES.hist.length) { ES.hi = Math.max(0, ES.hi - 1); t.value = ES.hist[ES.hi]; ev.preventDefault(); }
    else if (ev.key === "ArrowDown" && ES.hist.length) { ES.hi = Math.min(ES.hist.length, ES.hi + 1); t.value = ES.hist[ES.hi] ?? ""; ev.preventDefault(); }
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
        case "parar": if (!ES.run) return linea("No hay un programa escuchando.", "muted"); linea(`Dejé de escuchar "${ES.run.cfg.modelo}" (sigue entrenando: detener ${ES.run.cfg.modelo} para pararlo).`, "warn"); ES.run = null; renderRun(); return;
        case "estado": return estado();
        case "modelos": case "ls": return modelos(a0);
        case "info": return info(a0);
        case "pausar": return control(a0, "pausar", { pausa: true });
        case "seguir": return control(a0, "pausar", { pausa: false });
        case "detener": return control(a0, "detener");
        case "guardar": return control(a0, "guardar");
        case "copiar": case "renombrar": {
          if (!a0 || !a1) return linea(`${cmd} <modelo> <nuevo>`, "bad");
          const r = await api("/api/modelo", { accion: cmd === "copiar" ? "copiar" : "renombrar", slug: a0, nuevo: nombreArchivo(a1) });
          return linea(r.msg || (r.ok ? "listo" : "no se pudo"), r.ok ? "ok" : "bad");
        }
        case "borrar": {
          if (!a0) return linea("borrar <modelo>", "bad");
          if (!confirm(`¿Mandar el modelo "${a0}" a la papelera (models/drones/_papelera)?`)) return linea("No se borró.", "muted");
          const r = await api("/api/modelo", { accion: "borrar", slug: a0 });
          return linea(r.msg || (r.ok ? "a la papelera" : "no se pudo"), r.ok ? "ok" : "bad");
        }
        case "archivos": return Object.keys(ES.archivos).sort().forEach((n) => linea(`${n === ES.abierto ? "▸" : " "} ${n}.pbd  (${ES.archivos[n].split("\n").length} líneas)`));
        case "nuevo": { const n = nuevoArchivo(a0); return linea(`Nuevo: ${n}.pbd`, "ok"); }
        case "abrir": {
          const n = nombreArchivo(a0);
          if (ES.archivos[n] === undefined) return linea(`No hay ${n}.pbd (archivos para verlos)`, "bad");
          ES.abierto = n; guardarArchivos(); renderArchivos(); cargarEditor(); return linea(`Abrí ${n}.pbd`, "ok");
        }
        case "borrar_archivo": case "eliminar": return borrarArchivo(nombreArchivo(a0 || ES.abierto));
        case "ejemplo": {
          const src = ES.data.ejemplos[a0];
          if (!src) return linea(`Ejemplos: ${Object.keys(ES.data.ejemplos).join(", ")}`, "muted");
          const n = nuevoArchivo("ejemplo_" + a0, src);
          return linea(`Abrí el ejemplo como ${n}.pbd: léelo, cámbialo y córrelo.`, "ok");
        }
        case "blender": {
          const r = await api("/api/abrir_blender", {});
          return linea(r.msg || (r.ok ? "Abriendo Blender…" : "No pude abrir Blender"), r.ok ? "ok" : "bad");
        }
        case "volar": {
          if (!a0) return linea("volar <modelo>", "bad");
          await cargarModelos();
          const m = ES.modelos.find((x) => x.slug === a0);
          if (!m?.tiene_modelo) return linea(`"${a0}" no tiene un modelo guardado todavía`, "bad");
          const d = ctx.D();
          if (!d) return linea("No tienes un dron activo en el hangar", "bad");
          d.modelo = a0; ctx.guardar();
          return linea(`"${d.nombre}" ahora vuela con "${a0}". Ve a Pedidos y dale "Que grabe la IA".`, "ok");
        }
        default: linea(`No conozco "${cmd}". Escribe ayuda.`, "bad");
      }
    } catch (err) { linea("Error: " + err.message, "bad"); }
  }

  function ayuda(tema) {
    const D = ES.data;
    if (!tema) {
      linea("Comandos:", "ok");
      D.comandos.forEach(([c, d]) => linea(`  ${c.padEnd(40)} ${d}`));
      linea("Funciones del lenguaje: ayuda <función> (o la pestaña Ayuda). Lo que trae e: ayuda e.", "muted");
      return;
    }
    if (tema === "e") { D.e_doc.forEach(([k, d]) => linea(`  ${k.padEnd(34)} ${d}`)); return; }
    if (tema === "funciones") { D.funciones.forEach((f) => linea(`  ${f.firma}`)); return; }
    if (tema === "hooks") { D.hooks_doc.forEach(([k, d]) => linea(`  def ${k}: ${d}`)); return; }
    const f = D.funciones.find((x) => x.nombre === tema);
    if (!f) return linea(`No hay ayuda de "${tema}". Prueba: ayuda funciones · ayuda e · ayuda hooks`, "bad");
    linea(f.firma, "ok");
    linea(f.desc);
    f.params.forEach(([k, d]) => linea(`  ${k}: ${d}`, "muted"));
    linea("ejemplo: " + f.ejemplo, "muted");
  }

  async function cargarModelos() {
    const r = await api("/api/modelos");
    if (r.modelos) { ES.modelos = r.modelos; ES.modelosT = Date.now(); }
    return ES.modelos;
  }
  async function modelos(orden = "exito") {
    const ms = await cargarModelos();
    if (!ms.length) return linea("No encontré modelos (¿está corriendo python scripts/jugar.py?)", "bad");
    const k = { exito: (m) => -(m.ultimo?.[2] ?? -1), "éxito": (m) => -(m.ultimo?.[2] ?? -1), gen: (m) => -(m.gen || 0), nombre: (m) => m.slug }[orden] || ((m) => -(m.ultimo?.[2] ?? -1));
    const ord = [...ms].sort((a, b) => (k(a) < k(b) ? -1 : k(a) > k(b) ? 1 : 0));
    const niv = ES.data.nombres_niveles;
    tabla([["modelo", "gen", "red", "éxito", "mejor", "último nivel", "estado"],
      ...ord.map((m) => [m.slug, m.gen ?? 0, m.red ? m.red.slice(1, -1).join("×") : "—", pct(m.ultimo?.[2]), pct(m.mejor_exito),
        m.ultimo ? `${m.ultimo[4]} ${(niv[m.ultimo[4]] || "").split(/[:(]/)[0].trim()}` : "—",
        m.entrenando ? `entrenando (${m.donde})` : m.tiene_modelo ? "guardado" : "vacío"])]);
    linea(`${ms.length} modelos · el éxito es en el último nivel que entrenó: compáralos en la misma misión.`, "muted");
  }
  async function historiaDe(slug) {
    const url = slug === "base" ? "/models/modelo.json" : `/models/drones/${slug}/modelo.json`;
    try { const r = await fetch(url, { cache: "no-store" }); return r.ok ? await r.json() : null; } catch { return null; }
  }
  async function info(slug) {
    if (!slug) return linea("info <modelo>", "bad");
    const m = (await cargarModelos()).find((x) => x.slug === slug);
    if (!m) return linea(`No hay un modelo "${slug}" (modelos para verlos)`, "bad");
    const h = await historiaDe(slug);
    linea(`${m.nombre} (${m.slug})`, "ok");
    linea(`  red: ${m.red ? m.red.join(" → ") : "—"} · generación ${m.gen} · ${(m.pasos || 0).toLocaleString("es")} pasos`);
    linea(`  salió de: ${m.base_de || (slug === "base" ? "la campaña" : "—")} · creado ${m.creado || "—"} · actualizado ${m.actualizado || "—"}`);
    if (m.niveles && Object.keys(m.niveles).length) linea(`  niveles: ${Object.entries(m.niveles).map(([k, v]) => `${ES.data.nombres_niveles[k] ? `${k} ${ES.data.nombres_niveles[k]}` : k} (${typeof v === "object" ? v.generaciones ?? v.gen ?? JSON.stringify(v) : `${Number(v).toLocaleString("es")} pasos`})`).join(" · ")}`);
    if (m.tomas?.length) linea(`  tomas que sabe: ${m.tomas.join(", ")}`);
    if (m.rango_fisica) linea(`  drones que conoce: empuje/peso ${m.rango_fisica.twr?.join("-")} · masa ${m.rango_fisica.masa_kg?.join("-")} kg`, "muted");
    const hs = (h?.historia || []).slice(-60);
    if (hs.length) linea(`  éxito (últimas ${hs.length} gen.): ${chispa(hs.map((x) => x[2]))}  ${pct(hs.at(-1)[2])}`);
    linea(`  ${m.entrenando ? `entrenando en ${m.donde}` : "quieto"} · para graficarlo: pestaña Gráfica`, "muted");
    ES.grafSlug = slug; ES.graf = hs; if (ES.tab === "grafica") renderDer();
  }
  async function estado() {
    const s = await api("/api/lab");
    if (s.ok === false) return linea(s.msg, "bad");
    const b = s.blender || {}, tr = s.entrenador || {};
    linea(`Blender: ${b.abierto ? `${b.estado_txt || b.estado}${b.corriendo ? ` · modelo ${s.blender_modelo} · gen ${tr.gen ?? "?"} · éxito ${pct(tr.succ)} · choque ${pct(tr.crash)}` : ""}` : "cerrado (comando blender para abrirlo)"}`);
    const f = (s.fondo || []).filter((x) => x.activo);
    if (!f.length) linea("Fondo: nada entrenando", "muted");
    f.forEach((x) => linea(`Fondo: ${x.modelo} · gen ${x.gen ?? "?"} · éxito ${pct(x.succ)} · choque ${pct(x.crash)}${x.params?.paused ? " · EN PAUSA" : ""}`));
    if (ES.run) linea(`Escuchando: "${ES.run.cfg.modelo}" (${ES.run.cfg.donde})`, "ok");
  }
  async function control(slug, accion, extra = {}) {
    slug = slug || ES.run?.cfg.modelo;
    if (!slug) return linea(`${accion} <modelo>`, "bad");
    const m = (await cargarModelos()).find((x) => x.slug === slug);
    const donde = m?.donde || ES.run?.cfg.donde || "fondo";
    const r = await api("/api/lab", { accion, modelo: slug, donde, ...extra });
    linea(r.msg || (r.ok ? "listo" : "no se pudo"), r.ok ? "ok" : "bad");
  }

  // ---------------- correr un programa ----------------
  function compilarAbierto(nombre, host) {
    const n = nombre ? nombreArchivo(nombre) : ES.abierto;
    if (n !== ES.abierto && ES.archivos[n] !== undefined) { ES.abierto = n; guardarArchivos(); renderArchivos(); cargarEditor(); }
    const src = ES.archivos[n];
    if (src === undefined) throw new ErrorPB(`no hay ${n}.pbd`);
    return compilar(src, dataCompilar(), host);
  }
  function hostDe(getRun) {
    const enviar = (accion, extra) => {
      const R = getRun();
      if (!R) return;
      api("/api/lab", { accion, modelo: R.cfg.modelo, donde: R.cfg.donde, ...extra }).then((r) => linea(`  ↳ ${accion}: ${r.msg || (r.ok ? "ok" : "no se pudo")}`, r.ok ? "muted" : "bad"));
    };
    return {
      print: (t) => linea(t),
      avisar: (t) => toast(esc(t), 4000),
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
    linea(`✓ ${ES.abierto}.pbd está bien.`, "ok");
    if (c.yaExiste && c.desde !== "base") linea(`  ojo: "${c.modelo}" ya existe (generación ${c.yaExiste.gen}): sigue entrenando el suyo; desde="${c.desde}" solo cuenta al crearlo. Para partir de "${c.desde}", usa otro nombre en modelo(…).`, "warn");
    else if (c.yaExiste) linea(`  "${c.modelo}" ya existe (generación ${c.yaExiste.gen}): sigue entrenando desde ahí.`, "muted");
    linea(`  modelo "${c.modelo}" (${c.desde === "cero" ? `red nueva${c.capas ? " " + c.capas.join("×") : " 128×128"}` : c.desde === "base" ? "desde la IA base" : `desde "${c.desde}"`}) · nivel ${c.nivel} ${niv} · ` +
      `${typeof c.dron === "object" ? `tu dron "${c.dron.hangar}"` : c.dron === "AZAR" ? "drones al azar" : "dron estándar"} · ${c.drones} drones · en ${c.donde === "blender" ? "Blender" : "el fondo"} (${c.velocidad})`);
    linea(`  ${valoresTxt(c.premiosFinal)}${c.viento ? ` · viento ${c.viento} m/s` : ""}${c.lr !== undefined ? ` · lr ${c.lr}` : ""}${c.ent !== undefined ? ` · exploración ${c.ent}` : ""}`, "muted");
    linea(`  funciones: ${prog.hooks.length ? prog.hooks.join(", ") : "ninguna (solo entrena; párala con detener " + c.modelo + ")"}`, "muted");
    if (soloRevisar) return;
    let dron = null;
    if (typeof c.dron === "object") {
      const d = ctx.P().drones.find((x) => x.nombre === c.dron.hangar);
      dron = d && ctx.dronParaEntrenar(d);
      if (!dron) { linea(`✗ "${c.dron.hangar}" no está armado completo: no tengo su física.`, "bad"); return; }
    }
    const body = pedidoDe(c, () => dron);
    linea(`Enviando el pedido (${c.donde === "blender" ? "a Blender" : "al fondo"})…`);
    const r = await api("/api/lab", body);
    if (!r.ok) { linea("✗ " + (r.msg || "el servidor no lo aceptó"), "bad"); return; }
    linea(`✓ ${r.msg}${r.modelo_txt ? " · " + r.modelo_txt : ""}`, "ok");
    if (c.donde === "blender") {
      const s = await api("/api/lab");
      if (!s.blender?.abierto) linea("  Blender no está abierto: escribe blender (cuando abra, toma el pedido).", "warn");
      if (c.lr !== undefined || c.ent !== undefined) linea("  lr/exploración se mandan cuando Blender empiece a entrenar.", "muted");
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
    const parte = (t) => Object.entries(reales).filter(([k]) => tipo(k) === t).map(([k, v]) => `${al[k] || k}=${String(nivelDe(k, v, esc_)).replace(".", ",")}`).join(" ");
    if (!Object.keys(reales).length) return "premios y castigos: los de siempre del entrenador (ponlos con premios() y castigos())";
    return `premios: ${parte("premio") || "—"} · castigos: ${parte("castigo") || "—"} (de 0 a 10)`;
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
      linea(`✗ en ${nombre}: ${err.message}`, "bad");
      if (err instanceof ErrorPB) marcarError(err);
      linea(`El programa se detuvo por el error (el entrenamiento sigue: arréglalo y corre otra vez, o detener ${R.cfg.modelo}).`, "warn");
      ES.run = null; renderRun();
    }
  }
  async function tick() {
    const s = await api("/api/lab");
    if (s.ok === false) return;
    const R = ES.run;
    if (R) {
      const { tr, activo } = trDe(s, R.cfg.modelo);
      if (activo && tr) {
        if (!R.empezo) {
          R.empezo = true; R.ses.gen0 = tr.gen ?? 0; R.ultGen = tr.gen ?? 0;
          linea(`▶ "${R.cfg.modelo}" está entrenando (generación ${tr.gen ?? 0}).`, "ok");
          if (R.lrPend) { R.lrPend = false; hostDe(() => R).ajustar({ lr: R.cfg.lr, ent: R.cfg.ent }); }
          llamarHook(R, "al_empezar", estadoE(tr, R.ses, ctx.ent.escala_premios));
        } else if ((tr.gen ?? 0) > R.ultGen) {
          R.ultGen = tr.gen;
          if (typeof tr.succ === "number") R.ses.mejor = Math.max(R.ses.mejor ?? 0, tr.succ);
          if (ES.run === R) llamarHook(R, "cada_generacion", estadoE(tr, R.ses, ctx.ent.escala_premios));
        }
      } else if (R.empezo) {
        linea(`■ "${R.cfg.modelo}" dejó de entrenar (generación ${tr?.gen ?? R.ultGen}).`, "warn");
        llamarHook(R, "al_terminar", estadoE(tr || {}, R.ses, ctx.ent.escala_premios));
        setTimeout(cargarModelos, 3000);           // ya guardó: que aparezca en desde= y en modelos
        ES.run = null; renderRun();
      } else if (Date.now() - R.t0 > 120000 && !R.avisoLento) {
        R.avisoLento = true;
        linea(R.cfg.donde === "blender" ? "Blender todavía no empieza: ¿está abierto? (comando blender) · estado para ver qué dice" : "Todavía no arranca: estado para ver qué pasa", "warn");
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
    el.innerHTML = R ? `<span class="ok">●</span> ${esc(R.cfg.modelo)} · ${R.empezo ? `gen ${R.ultGen}` : "esperando…"}` : `<span class="muted">○ nada corriendo</span>`;
    $("es-parar").disabled = !R;
  }

  // ---------------- panel derecho: ayuda · aprende · gráfica ----------------
  function renderDer() {
    document.querySelectorAll("#es-tabs button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.t === ES.tab)));
    const box = $("es-der"), D = ES.data;
    box.innerHTML = "";
    if (ES.tab === "ayuda") {
      box.insertAdjacentHTML("beforeend", `<p class="muted">Un programa PBDMM describe <b>cómo</b> se entrena un modelo. Arriba: qué modelo, qué misión, con qué dron, sus premios y sus castigos. Abajo: funciones que el juego llama mientras entrena. Toca <b>insertar</b> para poner el ejemplo en tu programa. Al escribir <code>dron(</code>, <code>mision(</code>, <code>premios(</code>, <code>castigos(</code>, <code>e.</code>… te salen las opciones (<b>Ctrl+Espacio</b> las abre cuando quieras).</p>`);
      const grupos = [...new Set(D.funciones.map((f) => f.grupo))];
      for (const f of grupos.flatMap((g) => D.funciones.filter((x) => x.grupo === g))) {
        if (f === D.funciones.find((x) => x.grupo === f.grupo)) box.insertAdjacentHTML("beforeend", `<h4>${esc(f.grupo)}</h4>`);
        const d = document.createElement("details");
        d.className = "es-fn";
        d.innerHTML = `<summary><code>${esc(f.firma)}</code><span class="muted"> · ${{ arriba: "arriba", "función": "en una función", "las dos": "arriba o en una función" }[f.donde] || ""}</span></summary>` +
          `<p>${esc(f.desc)}</p>${f.params.length ? `<ul>${f.params.map(([k, t]) => `<li><code>${esc(k)}</code> ${esc(t)}${rec(f, k)}</li>`).join("")}</ul>` : ""}` +
          `<pre>${esc(f.ejemplo)}</pre>`;
        const b = document.createElement("button");
        b.className = "btn ghost small"; b.textContent = "insertar";
        b.onclick = () => insertar(f.ejemplo + "\n");
        d.appendChild(b);
        box.appendChild(d);
      }
      box.insertAdjacentHTML("beforeend", `<h4>Funciones que llama el juego</h4><ul>${D.hooks_doc.map(([k, t]) => `<li><code>def ${esc(k)}:</code> ${esc(t)}</li>`).join("")}</ul>` +
        `<h4>Lo que trae e</h4><ul>${D.e_doc.map(([k, t]) => `<li><code>${esc(k)}</code> ${esc(t)}</li>`).join("")}</ul>` +
        `<h4>Comandos de la terminal</h4><ul>${D.comandos.map(([k, t]) => `<li><code>${esc(k)}</code> ${esc(t)}</li>`).join("")}</ul>`);
    } else if (ES.tab === "aprende") {
      for (const l of D.lecciones) {
        const d = document.createElement("details");
        d.className = "es-lec";
        d.open = l === D.lecciones[0];
        d.innerHTML = `<summary>${esc(l.titulo)}</summary><p>${esc(l.texto)}</p>`;
        box.appendChild(d);
      }
      box.insertAdjacentHTML("beforeend", `<div class="es-red" aria-label="La red: 38 entradas, capas ocultas, 4 palancas">${redSVG()}</div>`);
    } else {
      box.innerHTML = `<div class="seg" id="es-vista"><button data-v="curvas">Curvas</button><button data-v="red">Red neuronal</button></div>`;
      box.querySelectorAll("#es-vista button").forEach((b) => {
        b.setAttribute("aria-pressed", String(b.dataset.v === ES.vista));
        b.onclick = () => { ES.vista = b.dataset.v; renderDer(); };
      });
      if (ES.vista === "red") {
        box.insertAdjacentHTML("beforeend", `<p class="muted" id="es-red-t">Buscando la red…</p>` +
          `<div class="es-red-ctl"><button class="btn ghost small" id="es-red-ant" aria-label="Dron anterior">◀</button><label>Dron <input type="number" id="es-red-i" min="1" value="1"></label><span id="es-red-n" class="muted"></span>` +
          `<button class="btn ghost small" id="es-red-sig" aria-label="Dron siguiente">▶</button><button class="btn ghost small" id="es-red-azar">Al azar</button></div>` +
          `<canvas id="es-redc" aria-label="La red neuronal del dron, en vivo"></canvas>` +
          `<p class="es-ley"><span style="color:#ff9e5e">■ positivo</span> <span style="color:#3ccbff">■ negativo</span> <span class="muted">· más brillante = más activo · las líneas son las conexiones más fuertes</span></p>` +
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
        box.insertAdjacentHTML("beforeend", `<p class="muted" id="es-graf-t"></p><canvas id="es-graf" width="560" height="300" aria-label="Gráfica del entrenamiento"></canvas>` +
          `<p class="es-ley"><span style="color:var(--gate)">■ éxito</span> <span style="color:var(--crash)">■ choque</span> <span style="color:var(--next)">■ calidad (grabar)</span></p>` +
          `<p class="muted">Muestra el modelo que está corriendo, o el último que miraste con <code>info &lt;modelo&gt;</code>. Cada punto es una generación.</p>`);
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
    if (!r.ok) linea("No pude cambiar de dron: " + (r.msg || "?"), "bad");
    ES.red = { ...R, i: k, pidiendo: k };
    dibujarRed();
  }
  function dibujarRed() {
    const cv = $("es-redc"), R = ES.red;
    if (!cv) return;
    const t = $("es-red-t");
    if (!R) {
      t.textContent = ES.grafSlug ? `"${ES.grafSlug}" no está entrenando: la red se ve en vivo mientras entrena (en el fondo o en Blender).` : "Corre un programa (o escribe info <modelo> de uno que esté entrenando) para ver su red.";
      cv.getContext("2d").clearRect(0, 0, cv.width, cv.height);
      $("es-red-n").textContent = ""; $("es-red-top").textContent = "";
      return;
    }
    t.innerHTML = `"${esc(R.modelo || ES.grafSlug)}" · mirando el dron <b>${R.i + 1}</b> de ${R.n} · generación ${R.gen ?? "?"} · red ${R.capas.join(" → ")}`;
    const inp = $("es-red-i");
    if (document.activeElement !== inp) { inp.value = R.i + 1; inp.max = R.n; }
    $("es-red-n").textContent = `de ${R.n}`;
    // tamaño real del canvas (nítido en pantallas retina)
    const dpr = window.devicePixelRatio || 1, W = cv.clientWidth || 340, H = Math.max(360, Math.min(520, R.capas[0] * 12 + 20));
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.height = H + "px"; }
    const g = cv.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const capas = R.capas, act = [R.in, ...R.h, R.mu], L = capas.length;
    const izq = 92, der = 74, xs = capas.map((_, i) => izq + (i * (W - izq - der)) / (L - 1));
    const ys = capas.map((n) => Array.from({ length: n }, (_, j) => 12 + ((j + 0.5) * (H - 24)) / n));
    const col = (v, a) => (v >= 0 ? `rgba(255,158,94,${a})` : `rgba(60,203,255,${a})`);
    const clip = (v) => Math.max(-1, Math.min(1, v || 0));
    // conexiones: más fuertes donde pasa más señal (|peso × activación de origen|)
    (R.w || []).forEach((conns, l) => {
      if (l >= L - 1) return;
      const flujo = conns.map(([a, , w]) => Math.abs(w * clip(act[l][a])));
      const max = Math.max(1e-6, ...flujo);
      conns.forEach(([a, b, w], k) => {
        const f = flujo[k] / max;
        if (f < 0.05) return;
        g.strokeStyle = col(w, 0.06 + 0.5 * f); g.lineWidth = 0.5 + 1.5 * f;
        g.beginPath(); g.moveTo(xs[l], ys[l][a]); g.lineTo(xs[l + 1], ys[l + 1][b]); g.stroke();
      });
    });
    // neuronas
    capas.forEach((n, l) => {
      const r = Math.max(1.2, Math.min(5, (H - 24) / n / 2 - 0.4));
      ys[l].forEach((y, j) => {
        const v = clip(act[l][j]);
        g.fillStyle = col(v, 0.15 + 0.85 * Math.abs(v));
        g.beginPath(); g.arc(xs[l], y, r, 0, Math.PI * 2); g.fill();
      });
    });
    // nombres: sensores a la izquierda, palancas a la derecha (con su valor)
    g.font = "10px ui-monospace, Menlo, monospace"; g.textBaseline = "middle";
    const lbl = R.in_lbl || [];
    if (capas[0] <= 48) ys[0].forEach((y, j) => { g.fillStyle = Math.abs(clip(R.in[j])) > 0.5 ? "#eaf2ef" : "#7d938a"; g.textAlign = "right"; g.fillText(String(lbl[j] || j).slice(0, 14), izq - 8, y); });
    (R.act_lbl || ["gas", "roll", "pitch", "yaw"]).forEach((nombre, j) => {
      const y = ys[L - 1][j], v = clip(R.mu[j]);
      g.textAlign = "left"; g.fillStyle = "#eaf2ef"; g.fillText(`${nombre} ${v >= 0 ? "+" : ""}${v.toFixed(2)}`, xs[L - 1] + 9, y);
    });
    g.textAlign = "center"; g.fillStyle = "#7d938a";
    capas.forEach((n, l) => g.fillText(l === 0 ? "38 sensores" : l === L - 1 ? "palancas" : String(n), xs[l], H - 4));
    // lo que más está mirando ahora
    // (un sensor de distancia en 1 = no ve nada cerca: no cuenta)
    const top = R.in.map((v, j) => [Math.abs(v), j, v]).filter(([, j, v]) => !(/^sensor/.test(lbl[j] || "") && v >= 0.98)).sort((a, b) => b[0] - a[0]).slice(0, 4);
    $("es-red-top").textContent = "Lo que más siente ahora: " + top.map(([, j, v]) => `${lbl[j] || j} ${v >= 0 ? "+" : ""}${v.toFixed(2)}`).join(" · ") +
      `. Cada capa oculta tiene sus neuronas (los números de abajo); las palancas son lo que decide.`;
  }
  /** " · normal 4" para los parámetros de premios() y castigos() (lo que recomiendan las misiones, de 0 a 10). */
  function rec(f, k) {
    if (f.nombre !== "premios" && f.nombre !== "castigos") return "";
    const r = recomendados(ctx.ent.misiones, ctx.ent.escala_premios)[k.split(" / ")[0]];
    return r ? ` <b class="warn">· normal ${esc(r)}</b>` : "";
  }
  /** Un dibujito de la red: 38 -> capas -> 4. */
  function redSVG() {
    const capas = [38, 128, 128, 4], W = 300, H = 150, xs = capas.map((_, i) => 20 + (i * (W - 40)) / (capas.length - 1));
    const ys = (n) => { const k = Math.min(n, 9); return Array.from({ length: k }, (_, j) => 18 + (j * (H - 36)) / Math.max(1, k - 1)); };
    let s = `<svg viewBox="0 0 ${W} ${H + 18}" width="100%">`;
    for (let i = 0; i < capas.length - 1; i++) for (const y1 of ys(capas[i])) for (const y2 of ys(capas[i + 1])) s += `<line x1="${xs[i]}" y1="${y1}" x2="${xs[i + 1]}" y2="${y2}" stroke="rgba(60,203,255,.13)"/>`;
    capas.forEach((n, i) => ys(n).forEach((y) => (s += `<circle cx="${xs[i]}" cy="${y}" r="4" fill="${i === 0 ? "#9db3a9" : i === capas.length - 1 ? "#ff7a1a" : "#3ccbff"}"/>`)));
    ["38 sensores", "128", "128", "4 palancas"].forEach((t, i) => (s += `<text x="${xs[i]}" y="${H + 14}" text-anchor="middle" font-size="10" fill="#9db3a9">${t}</text>`));
    return s + "</svg>";
  }
  function dibujarGrafica() {
    const cv = $("es-graf");
    if (!cv) return;
    const t = $("es-graf-t"), hs = ES.graf || [];
    t.textContent = ES.grafSlug ? `"${ES.grafSlug}" · ${ES.grafActivo ? "entrenando" : "quieto"} · ${hs.length ? `generaciones ${hs[0][0]}-${hs.at(-1)[0]}` : "sin datos todavía"}` : "Nada que graficar: corre un programa o escribe info <modelo>.";
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
  $("es-nuevo").onclick = () => { const n = prompt("Nombre del programa:", "mi_modelo"); if (n) comando("nuevo " + n); };
  $("es-blender").onclick = () => comando("blender");
  $("es-volver").onclick = cerrar;

  return { abrir, comando, get estado() { return ES; } };
}

export { repr };
