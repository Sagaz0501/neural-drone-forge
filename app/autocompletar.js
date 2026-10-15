// =====================================================================
// Autocompletado del editor PBDMM (sin pantalla: lo usa estudio.js; pruebas en test_pbdmm.mjs).
//   contexto(antes)  -> qué se está escribiendo justo antes del cursor:
//                       { tipo: "arg", fn, idx, kw, parcial, desde }   dentro de dron( … , desde=… )
//                       { tipo: "nombre" | "attr" | "def", parcial, desde }
//   opciones(cx, F)  -> [{ txt (lo que se inserta), label, det, cerrar? }]   F = lo que hay en el juego
// Las opciones fijas de cada función están en data/pbdmm.json ("opciones"); las de tu juego ($drones,
// $misiones, $niveles, $modelos, $premios) salen de F.
// =====================================================================

const UN_ARG = new Set(["dron", "mision", "nivel", "drones", "entrenar_en", "velocidad", "viento"]);
const PY = [["print(", "escribe en la terminal"], ["range(", "números del 0 a n-1"], ["len(", "cuántos hay"], ["round(", "redondear"],
  ["str(", "a texto"], ["min(", "el menor"], ["max(", "el mayor"], ["abs(", "valor absoluto"], ["sum(", "suma una lista"]];
const KWS = [["def ", "una función"], ["if ", "si…"], ["elif ", "si no, si…"], ["else:", "si no"], ["for ", "repetir"], ["return ", "devolver"],
  ["global ", "usar una variable de afuera"], ["True", ""], ["False", ""], ["None", ""], ["and ", ""], ["or ", ""], ["not ", ""], ["pass", ""]];

/** Mira el texto antes del cursor (con un mini-léxico: textos, comentarios, paréntesis). */
export function contexto(antes) {
  const pila = [];
  let str = null, com = false, inicio = 0;
  for (let i = 0; i < antes.length; i++) {
    const c = antes[i];
    if (com) { if (c === "\n") com = false; continue; }
    if (str) { if (c === "\\") { i++; continue; } if (c === str) str = null; continue; }
    if (c === "#") { com = true; continue; }
    if (c === '"' || c === "'") { str = c; continue; }
    if (c === "(" || c === "[" || c === "{") {
      const m = c === "(" ? /([A-Za-z_][\w]*)\s*$/.exec(antes.slice(0, i)) : null;
      pila.push({ fn: m ? m[1] : null, br: c, idx: 0, kw: null, ini: i + 1 });
      continue;
    }
    if (c === ")" || c === "]" || c === "}") { pila.pop(); continue; }
    const top = pila.at(-1);
    if (!top) continue;
    if (c === "," && top.br !== "{") { top.idx++; top.kw = null; top.ini = i + 1; continue; }
    if (c === "=" && top.br === "(" && antes[i + 1] !== "=" && !"=!<>".includes(antes[i - 1])) {
      const m = /([A-Za-z_]\w*)\s*$/.exec(antes.slice(top.ini, i));
      if (m) { top.kw = m[1]; top.ini = i + 1; }
    }
  }
  if (com) return null;
  const top = pila.at(-1);
  // dentro de los argumentos de una llamada
  if (top && top.br === "(" && top.fn) {
    const crudo = antes.slice(top.ini);
    const parcial = crudo.replace(/^\s+/, "");
    const desde = antes.length - parcial.length;
    if (/^e\.\w*$/.test(parcial)) return { tipo: "attr", parcial: parcial.slice(2), desde: desde + 2 };
    if (str || /^["']?[\w.\-\s\[\],]*$/.test(parcial)) return { tipo: "arg", fn: top.fn, idx: top.idx, kw: top.kw, parcial, desde, enTexto: !!str };
    return null;
  }
  if (str || (top && top.br !== "(")) return null;
  // fuera de una llamada: nombres, e.algo, def …
  const linea = antes.slice(antes.lastIndexOf("\n") + 1);
  let m = /^\s*def\s+(\w*)$/.exec(linea);
  if (m) return { tipo: "def", parcial: m[1], desde: antes.length - m[1].length };
  m = /\be\.(\w*)$/.exec(linea);
  if (m) return { tipo: "attr", parcial: m[1], desde: antes.length - m[1].length };
  m = /(^|[^\w.])([A-Za-z_]\w*)$/.exec(linea);
  if (m) return { tipo: "nombre", parcial: m[2], desde: antes.length - m[2].length };
  return null;
}

/** Las opciones para ese contexto. F = { data, misiones, nombresNiveles, drones, modelos, premios: [{k, alias, desc}] } */
export function opciones(cx, F) {
  if (!cx) return [];
  const D = F.data, fns = D.funciones.filter((f) => f.nombre !== "python");
  let out = [];
  if (cx.tipo === "nombre") {
    out = [...fns.map((f) => ({ txt: f.nombre + "(", label: f.firma, det: corto(f.desc), fn: true })),
      ...PY.map(([t, d]) => ({ txt: t, label: t + ")", det: d, fn: true })),
      ...KWS.map(([t, d]) => ({ txt: t, label: t.trim(), det: d }))];
  } else if (cx.tipo === "def") {
    out = D.hooks_doc.map(([k, d]) => ({ txt: k + ":", label: "def " + k, det: corto(d) }));
  } else if (cx.tipo === "attr") {
    out = D.e_doc.flatMap(([k, d]) => k.split(",").map((x) => x.trim().replace(/^e\./, "")).map((x) => ({ txt: x, label: "e." + x, det: corto(d) })));
  } else if (cx.tipo === "arg") {
    const f = D.funciones.find((x) => x.nombre === cx.fn);
    const O = f?.opciones;
    if (!O) return /^[A-Za-z_]\w*$/.test(cx.parcial) ? opciones({ ...cx, tipo: "nombre" }, F) : [];
    const lista = cx.kw ? O[cx.kw] || [] : cx.idx === 0 ? O["0"] || [] : [];
    out = lista.flatMap(([v, d]) => expandir(v, d, F));
    if (!cx.kw && O._kw && (cx.idx > 0 || cx.fn === "premios")) {
      const kws = O._kw.flatMap((k) => (k === "$premios" ? expandir("$premios", "", F) : [{ txt: k + "=", label: k + "=", det: "" }]));
      out = [...out, ...kws.filter((k) => !out.some((o) => o.txt === k.txt))];
    }
    if (UN_ARG.has(cx.fn) && !cx.kw) out = out.map((o) => ({ ...o, cerrar: true }));
  }
  // filtrar con lo que ya escribiste (sin comillas, sin mayúsculas, sin tildes)
  const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ"']/g, "");
  const p = norm(cx.parcial || "");
  if (p) {
    const empieza = out.filter((o) => norm(o.txt).startsWith(p) || norm(o.label).startsWith(p));
    const contiene = out.filter((o) => !empieza.includes(o) && (norm(o.label).includes(p) || norm(o.det || "").includes(p)));
    out = [...empieza, ...contiene];
  }
  return out.slice(0, 40);
}

const corto = (s) => { const t = String(s || ""); const i = t.search(/[.:](\s|$)/); return (i > 0 ? t.slice(0, i) : t).slice(0, 90); };
const q = (s) => JSON.stringify(s);

function expandir(v, d, F) {
  switch (v) {
    case "$drones": return (F.drones || []).map((n) => ({ txt: q(n), label: q(n), det: "tu dron del hangar" }));
    case "$misiones": return (F.misiones || []).map((m) => ({ txt: q(m.id), label: q(m.id), det: `nivel ${m.nivel} · ${m.nombre}` }));
    case "$niveles": return Object.entries(F.nombresNiveles || {}).map(([k, n]) => ({ txt: k, label: k, det: n }));
    case "$modelos": return (F.modelos || []).filter((m) => m.slug !== "base").map((m) => ({ txt: q(m.slug), label: q(m.slug), det: `ya existe: sigue entrenándolo (gen ${m.gen ?? 0})` }));
    case "$modelos_texto": return (F.modelos || []).filter((m) => m.slug !== "base" && m.tiene_modelo).map((m) => ({ txt: q(m.slug), label: q(m.slug), det: `parte de tu modelo (gen ${m.gen ?? 0})` }));
    case "$premios": return (F.premios || []).map((p) => ({ txt: (p.alias || p.k) + "=", label: (p.alias || p.k) + "=", det: `${p.alias ? p.k + " · " : ""}${p.tipo || ""}: ${corto(p.desc)}` }));
    default: return [{ txt: v, label: v, det: d }];
  }
}
