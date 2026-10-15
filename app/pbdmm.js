// =====================================================================
// PBDMM · Python Base Dron Model Maker
// Un lenguaje con cara de Python para describir CÓMO se entrena la IA de un dron. No corre Python de verdad:
// este intérprete (en el navegador, sin acceso a tu compu) lee el programa y lo traduce a lo mismo que hace el
// Laboratorio: un pedido a scripts/jugar.py -> live_train.py (PPO), en segundo plano o en Blender.
//
//   arriba del archivo (una vez):   modelo("halcon", desde="cero") · red(capas=[64, 64]) · mision("grabar")
//                                   dron("azar") · drones(50) · entrenar_en("fondo") · premios(grabar=4) · castigos(chocar=15) …
//   funciones que llama el juego:   def al_empezar(e) · def cada_generacion(e) · def al_terminar(e)
//                                   e = cómo va (e.generacion, e.exito, e.choque, e.premio, e.calidad …)
//
// El subconjunto de Python: números, textos (y f"..{x}.."), True/False/None, listas, diccionarios, variables,
// + - * / // % **, == != < <= > >= in, and/or/not, if/elif/else, for x in …, def/return, global, pass,
// break/continue, comentarios #. Sin while ni import (un programa no puede colgar ni tocar tu compu).
// Docs para el jugador: app/data/pbdmm.json. Pruebas: node app/test_pbdmm.mjs
// =====================================================================

export class ErrorPB extends Error {
  constructor(msg, linea) { super(linea ? `línea ${linea}: ${msg}` : msg); this.linea = linea || null; this.msgCorto = msg; }
}

// ---------------- léxico ----------------
const KW = new Set(["def", "return", "if", "elif", "else", "for", "in", "and", "or", "not", "True", "False", "None", "global", "pass", "break", "continue", "is", "while", "import", "from", "class", "lambda"]);
const OPS = ["**=", "//=", "==", "!=", "<=", ">=", "+=", "-=", "*=", "/=", "**", "//", "(", ")", "[", "]", "{", "}", ",", ":", ".", "=", "<", ">", "+", "-", "*", "/", "%"];

export function lexer(src) {
  const toks = [], indents = [0];
  const lineas = src.replace(/\r\n?/g, "\n").replace(/\t/g, "    ").split("\n");
  let prof = 0;                                   // dentro de ( [ { las líneas siguen
  for (let ln = 0; ln < lineas.length; ln++) {
    const L = lineas[ln], n = ln + 1;
    let i = 0;
    if (prof === 0) {
      while (L[i] === " ") i++;
      if (i >= L.length || L[i] === "#") continue;  // línea vacía o comentario
      if (i > indents.at(-1)) { indents.push(i); toks.push({ t: "INDENT", n }); }
      while (i < indents.at(-1)) {
        indents.pop(); toks.push({ t: "DEDENT", n });
        if (i > indents.at(-1)) throw new ErrorPB("la sangría (los espacios al inicio) no cuadra con las líneas de arriba", n);
      }
    }
    while (i < L.length) {
      const c = L[i];
      if (c === " ") { i++; continue; }
      if (c === "#") break;
      if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(L[i + 1] || ""))) {
        const m = /^(\d[\d_]*\.?\d*|\.\d+)([eE][-+]?\d+)?/.exec(L.slice(i));
        toks.push({ t: "NUM", v: parseFloat(m[0].replace(/_/g, "")), n }); i += m[0].length; continue;
      }
      if (/[A-Za-z_áéíóúñÁÉÍÓÚÑ]/.test(c)) {
        const m = /^[A-Za-z_áéíóúñÁÉÍÓÚÑ][\wáéíóúñÁÉÍÓÚÑ]*/.exec(L.slice(i));
        const w = m[0];
        if ((w === "f" || w === "F") && (L[i + 1] === '"' || L[i + 1] === "'")) {
          const [s, fin] = leerTexto(L, i + 1, n); toks.push({ t: "FSTR", v: s, n }); i = fin; continue;
        }
        toks.push({ t: KW.has(w) ? "KW" : "NAME", v: w, n }); i += w.length; continue;
      }
      if (c === '"' || c === "'") { const [s, fin] = leerTexto(L, i, n); toks.push({ t: "STR", v: s, n }); i = fin; continue; }
      const op = OPS.find((o) => L.startsWith(o, i));
      if (!op) throw new ErrorPB(`no entiendo el símbolo "${c}"`, n);
      if ("([{".includes(op)) prof++;
      if (")]}".includes(op)) prof = Math.max(0, prof - 1);
      toks.push({ t: "OP", v: op, n }); i += op.length;
    }
    if (prof === 0) toks.push({ t: "NL", n });
  }
  if (prof > 0) throw new ErrorPB("falta cerrar un paréntesis, corchete o llave", lineas.length);
  while (indents.length > 1) { indents.pop(); toks.push({ t: "DEDENT", n: lineas.length }); }
  toks.push({ t: "EOF", n: lineas.length });
  return toks;
}

function leerTexto(L, i, n) {
  const q = L[i];
  let s = "", j = i + 1;
  while (j < L.length && L[j] !== q) {
    if (L[j] === "\\" && j + 1 < L.length) { const e = L[j + 1]; s += e === "n" ? "\n" : e === "t" ? "\t" : e; j += 2; continue; }
    s += L[j++];
  }
  if (j >= L.length) throw new ErrorPB("un texto sin cerrar: falta la comilla del final", n);
  return [s, j + 1];
}

// ---------------- sintaxis -> árbol ----------------
export function parsear(src) {
  const T = lexer(src);
  let p = 0;
  const ver = () => T[p], sig = () => T[p++];
  const es = (t, v) => T[p].t === t && (v === undefined || T[p].v === v);
  const op = (v) => es("OP", v), kw = (v) => es("KW", v);
  const pedir = (t, v, msg) => {
    if (!es(t, v)) throw new ErrorPB(msg || `esperaba "${v ?? t}" y encontré ${desc(ver())}`, ver().n);
    return sig();
  };
  const desc = (k) => (k.t === "NL" ? "el fin de la línea" : k.t === "EOF" ? "el fin del archivo" : k.t === "INDENT" ? "más sangría" : k.t === "DEDENT" ? "menos sangría" : `"${k.v}"`);

  function programa() {
    const body = [];
    while (!es("EOF")) { if (es("NL")) { sig(); continue; } body.push(sentencia()); }
    return body;
  }
  function bloque() {
    pedir("OP", ":", `falta ":" al final de la línea (antes de ${desc(ver())})`);
    if (!es("NL")) { const s = simple(); finLinea(); return [s]; }
    sig();
    pedir("INDENT", undefined, "después de \":\" las líneas de adentro van con sangría (4 espacios)");
    const body = [];
    while (!es("DEDENT") && !es("EOF")) { if (es("NL")) { sig(); continue; } body.push(sentencia()); }
    if (es("DEDENT")) sig();
    return body;
  }
  function finLinea() { if (es("NL")) sig(); else if (!es("EOF") && !es("DEDENT")) throw new ErrorPB(`sobra algo al final de la línea: ${desc(ver())}`, ver().n); }

  function sentencia() {
    const n = ver().n;
    if (kw("def")) {
      sig();
      const nombre = pedir("NAME", undefined, "después de def va el nombre de la función").v;
      pedir("OP", "(");
      const params = [];
      while (!op(")")) {
        const pn = pedir("NAME", undefined, "los parámetros son nombres").v;
        let def = null;
        if (op("=")) { sig(); def = expr(); }
        else if (params.some((x) => x.def)) throw new ErrorPB("los parámetros con valor por defecto van al final", ver().n);
        params.push({ nombre: pn, def });
        if (!op(")")) pedir("OP", ",");
      }
      sig();
      return { k: "def", nombre, params, body: bloque(), n };
    }
    if (kw("if")) {
      sig();
      const ramas = [[expr(), bloque()]];
      let otro = null;
      while (kw("elif")) { sig(); ramas.push([expr(), bloque()]); }
      if (kw("else")) { sig(); otro = bloque(); }
      return { k: "if", ramas, otro, n };
    }
    if (kw("for")) {
      sig();
      const v = pedir("NAME", undefined, "después de for va el nombre de la variable").v;
      pedir("KW", "in", 'falta "in" (for x in lista:)');
      return { k: "for", v, it: expr(), body: bloque(), n };
    }
    if (kw("while")) throw new ErrorPB("PBDMM no tiene while (un ciclo sin fin colgaría el entrenamiento): usa for x in range(n)", n);
    if (kw("import") || kw("from")) throw new ErrorPB("PBDMM no importa módulos: todo lo que necesitas ya está (mira la ayuda)", n);
    if (kw("class") || kw("lambda")) throw new ErrorPB(`PBDMM no tiene ${ver().v}`, n);
    const s = simple();
    finLinea();
    return s;
  }
  function simple() {
    const n = ver().n;
    if (kw("pass")) { sig(); return { k: "pass", n }; }
    if (kw("break")) { sig(); return { k: "break", n }; }
    if (kw("continue")) { sig(); return { k: "continue", n }; }
    if (kw("return")) { sig(); return { k: "return", e: es("NL") || es("EOF") ? null : expr(), n }; }
    if (kw("global")) {
      sig(); const nombres = [pedir("NAME").v];
      while (op(",")) { sig(); nombres.push(pedir("NAME").v); }
      return { k: "global", nombres, n };
    }
    const e = expr();
    if (op("=") || op("+=") || op("-=") || op("*=") || op("/=") || op("//=") || op("**=")) {
      const o = sig().v;
      if (!["name", "attr", "idx"].includes(e.k)) throw new ErrorPB("a la izquierda del = va un nombre de variable", n);
      return { k: "asig", obj: e, op: o === "=" ? null : o.slice(0, -1), e: expr(), n };
    }
    return { k: "expr", e, n };
  }

  // expresiones (de menor a mayor precedencia)
  function expr() { return o_(); }
  function o_() { let a = y_(); while (kw("or")) { const n = sig().n; a = { k: "or", a, b: y_(), n }; } return a; }
  function y_() { let a = no_(); while (kw("and")) { const n = sig().n; a = { k: "and", a, b: no_(), n }; } return a; }
  function no_() { if (kw("not")) { const n = sig().n; return { k: "not", a: no_(), n }; } return comp(); }
  function comp() {
    const a = suma(), ops = [], xs = [a];
    for (;;) {
      if (["==", "!=", "<", "<=", ">", ">="].some((o) => op(o))) ops.push(sig().v);
      else if (kw("in")) { sig(); ops.push("in"); }
      else if (kw("is")) { sig(); if (kw("not")) { sig(); ops.push("is not"); } else ops.push("is"); }
      else if (kw("not") && T[p + 1]?.t === "KW" && T[p + 1].v === "in") { sig(); sig(); ops.push("not in"); }
      else break;
      xs.push(suma());
    }
    return ops.length ? { k: "cmp", ops, xs, n: a.n } : a;
  }
  function suma() { let a = mult(); while (op("+") || op("-")) { const t = sig(); a = { k: "bin", o: t.v, a, b: mult(), n: t.n }; } return a; }
  function mult() { let a = unario(); while (op("*") || op("/") || op("//") || op("%")) { const t = sig(); a = { k: "bin", o: t.v, a, b: unario(), n: t.n }; } return a; }
  function unario() { if (op("-") || op("+")) { const t = sig(); return { k: "neg", o: t.v, a: unario(), n: t.n }; } return pot(); }
  function pot() { const a = postfijo(); if (op("**")) { const t = sig(); return { k: "bin", o: "**", a, b: unario(), n: t.n }; } return a; }
  function postfijo() {
    let a = atomo();
    for (;;) {
      if (op("(")) {
        const n = sig().n, args = [], kws = [];
        while (!op(")")) {
          if (es("NAME") && T[p + 1]?.t === "OP" && T[p + 1].v === "=") { const k = sig().v; sig(); kws.push([k, expr()]); }
          else { if (kws.length) throw new ErrorPB("los argumentos con nombre (x=1) van después de los demás", ver().n); args.push(expr()); }
          if (!op(")")) pedir("OP", ",", `en la llamada falta "," o ")" (encontré ${desc(ver())})`);
        }
        sig();
        a = { k: "call", f: a, args, kws, n };
      } else if (op(".")) { const n = sig().n; a = { k: "attr", a, nombre: pedir("NAME", undefined, "después del punto va un nombre").v, n }; }
      else if (op("[")) { const n = sig().n; const i = expr(); pedir("OP", "]"); a = { k: "idx", a, i, n }; }
      else return a;
    }
  }
  function atomo() {
    const t = ver();
    if (t.t === "NUM") { sig(); return { k: "num", v: t.v, n: t.n }; }
    if (t.t === "STR") { sig(); let v = t.v; while (es("STR")) v += sig().v; return { k: "str", v, n: t.n }; }
    if (t.t === "FSTR") { sig(); return { k: "fstr", partes: fstring(t.v, t.n), n: t.n }; }
    if (t.t === "NAME") { sig(); return { k: "name", v: t.v, n: t.n }; }
    if (t.t === "KW" && (t.v === "True" || t.v === "False" || t.v === "None")) { sig(); return { k: "const", v: t.v === "True" ? true : t.v === "False" ? false : null, n: t.n }; }
    if (op("(")) { sig(); const e = expr(); pedir("OP", ")"); return e; }
    if (op("[")) {
      sig(); const xs = [];
      while (!op("]")) { xs.push(expr()); if (!op("]")) pedir("OP", ","); }
      sig(); return { k: "list", xs, n: t.n };
    }
    if (op("{")) {
      sig(); const pares = [];
      while (!op("}")) { const k = expr(); pedir("OP", ":"); pares.push([k, expr()]); if (!op("}")) pedir("OP", ","); }
      sig(); return { k: "dict", pares, n: t.n };
    }
    throw new ErrorPB(`no esperaba ${desc(t)} aquí`, t.n);
  }
  function fstring(s, n) {
    const partes = [];
    let i = 0, txt = "";
    while (i < s.length) {
      if (s[i] === "{" && s[i + 1] === "{") { txt += "{"; i += 2; continue; }
      if (s[i] === "}" && s[i + 1] === "}") { txt += "}"; i += 2; continue; }
      if (s[i] === "{") {
        const j = s.indexOf("}", i);
        if (j < 0) throw new ErrorPB("en el f-texto falta cerrar una }", n);
        let dentro = s.slice(i + 1, j), fmt = null;
        const dos = dentro.lastIndexOf(":");
        if (dos > 0 && /^\.?\d*[f%]?$/.test(dentro.slice(dos + 1))) { fmt = dentro.slice(dos + 1); dentro = dentro.slice(0, dos); }
        if (txt) partes.push(txt); txt = "";
        const sub = parsear(dentro);
        if (sub.length !== 1 || sub[0].k !== "expr") throw new ErrorPB("dentro de { } va una expresión", n);
        partes.push({ e: sub[0].e, fmt });
        i = j + 1; continue;
      }
      txt += s[i++];
    }
    if (txt) partes.push(txt);
    return partes;
  }
  return programa();
}

// ---------------- ejecutar ----------------
class Retorno { constructor(v) { this.v = v; } }
const CORTE = { break: Symbol("break"), continue: Symbol("continue") };

/** Lo que el programa ve como objeto con atributos (e.exito): un objeto JS "congelado". */
export function objeto(campos) { return Object.freeze({ __pb_obj: true, ...campos }); }

export function tipoDe(v) {
  if (v === null || v === undefined) return "None";
  if (typeof v === "boolean") return "bool";
  if (typeof v === "number") return Number.isInteger(v) ? "int" : "float";
  if (typeof v === "string") return "str";
  if (Array.isArray(v)) return "list";
  if (typeof v === "function" || v?.__pb_fn) return "función";
  if (v?.__pb_obj) return "objeto";
  return "dict";
}
const verdad = (v) => !(v === null || v === undefined || v === false || v === 0 || v === "" || (Array.isArray(v) && !v.length) || (tipoDe(v) === "dict" && !Object.keys(v).length));

export function repr(v, dentro = false) {
  if (v === null || v === undefined) return "None";
  if (v === true) return "True";
  if (v === false) return "False";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(Math.round(v * 1e6) / 1e6);
  if (typeof v === "string") return dentro ? JSON.stringify(v) : v;
  if (Array.isArray(v)) return "[" + v.map((x) => repr(x, true)).join(", ") + "]";
  if (typeof v === "function" || v?.__pb_fn) return `<función ${v.nombre || v.name || ""}>`;
  return "{" + Object.entries(v).filter(([k]) => k !== "__pb_obj").map(([k, x]) => `${JSON.stringify(k)}: ${repr(x, true)}`).join(", ") + "}";
}

/**
 * Un intérprete. builtins = { nombre: (args, kws, linea) => valor }. pasosMax: cuántas operaciones puede hacer
 * cada llamada (para que un programa no se coma el navegador).
 */
export class Interprete {
  constructor(builtins = {}, { pasosMax = 200000 } = {}) {
    this.globales = new Map();
    this.builtins = { ...BASICOS, ...builtins };
    this.pasosMax = pasosMax;
    this.pasos = 0;
  }
  correr(arbol) { this.pasos = 0; this.bloque(arbol, null); }
  /** Llama una función del programa (def) si existe. Devuelve lo que devuelve, o undefined si no existe. */
  llamar(nombre, args = []) {
    const f = this.globales.get(nombre);
    if (!f?.__pb_fn) return undefined;
    this.pasos = 0;
    return this.invocar(f, args, [], f.n);
  }
  tiene(nombre) { return !!this.globales.get(nombre)?.__pb_fn; }

  tick(n) { if (++this.pasos > this.pasosMax) throw new ErrorPB(`el programa hizo demasiadas operaciones (más de ${this.pasosMax}): ¿un for muy largo?`, n); }

  bloque(body, loc) {
    for (const s of body) {
      const r = this.sent(s, loc);
      if (r !== undefined) return r;
    }
    return undefined;
  }
  sent(s, loc) {
    this.tick(s.n);
    switch (s.k) {
      case "expr": this.ev(s.e, loc); return;
      case "pass": return;
      case "break": return CORTE.break;
      case "continue": return CORTE.continue;
      case "return":
        if (!loc) throw new ErrorPB("return solo va dentro de una función (def)", s.n);
        return new Retorno(s.e ? this.ev(s.e, loc) : null);
      case "global":
        if (!loc) return;
        s.nombres.forEach((x) => loc.globals.add(x));
        return;
      case "def": {
        const f = { __pb_fn: true, nombre: s.nombre, params: s.params, body: s.body, n: s.n };
        this.poner(s.nombre, f, loc, s.n);
        return;
      }
      case "if": {
        for (const [c, b] of s.ramas) if (verdad(this.ev(c, loc))) return this.bloque(b, loc);
        return s.otro ? this.bloque(s.otro, loc) : undefined;
      }
      case "for": {
        let it = this.ev(s.it, loc);
        if (typeof it === "string") it = [...it];
        else if (tipoDe(it) === "dict") it = Object.keys(it);
        if (!Array.isArray(it)) throw new ErrorPB(`no se puede recorrer con for un ${tipoDe(it)}`, s.n);
        for (const x of it) {
          this.poner(s.v, x, loc, s.n);
          const r = this.bloque(s.body, loc);
          if (r === CORTE.break) break;
          if (r === CORTE.continue) continue;
          if (r !== undefined) return r;
        }
        return;
      }
      case "asig": {
        let v = this.ev(s.e, loc);
        if (s.op) v = binaria(s.op, this.ev(s.obj, loc), v, s.n);
        if (s.obj.k === "name") this.poner(s.obj.v, v, loc, s.n);
        else if (s.obj.k === "idx") {
          const o = this.ev(s.obj.a, loc), i = this.ev(s.obj.i, loc);
          if (Array.isArray(o)) { const j = indice(o, i, s.n); o[j] = v; }
          else if (tipoDe(o) === "dict") o[String(i)] = v;
          else throw new ErrorPB(`no se puede cambiar un elemento de un ${tipoDe(o)}`, s.n);
        } else {
          const o = this.ev(s.obj.a, loc);
          if (o?.__pb_set) o.__pb_set(s.obj.nombre, v, s.n);
          else throw new ErrorPB(`no se puede cambiar "${s.obj.nombre}" de un ${tipoDe(o)}`, s.n);
        }
        return;
      }
    }
    throw new ErrorPB("sentencia desconocida", s.n);
  }
  poner(nombre, v, loc, n) {
    if (nombre in this.builtins && !(loc && loc.vars.has(nombre))) throw new ErrorPB(`"${nombre}" es una función de PBDMM: usa otro nombre para tu variable`, n);
    if (loc && !loc.globals.has(nombre)) loc.vars.set(nombre, v);
    else this.globales.set(nombre, v);
  }
  leer(nombre, loc, n) {
    if (loc && loc.vars.has(nombre) && !loc.globals.has(nombre)) return loc.vars.get(nombre);
    if (this.globales.has(nombre)) return this.globales.get(nombre);
    if (nombre in this.builtins) return Object.assign(this.builtins[nombre], { nombre });
    throw new ErrorPB(`no conozco "${nombre}"${sugerir(nombre, [...this.globales.keys(), ...Object.keys(this.builtins)])}`, n);
  }
  ev(e, loc) {
    this.tick(e.n);
    switch (e.k) {
      case "num": case "str": case "const": return e.v;
      case "fstr": return e.partes.map((x) => (typeof x === "string" ? x : formato(this.ev(x.e, loc), x.fmt))).join("");
      case "name": return this.leer(e.v, loc, e.n);
      case "list": return e.xs.map((x) => this.ev(x, loc));
      case "dict": { const o = {}; for (const [k, v] of e.pares) o[String(this.ev(k, loc))] = this.ev(v, loc); return o; }
      case "not": return !verdad(this.ev(e.a, loc));
      case "and": { const a = this.ev(e.a, loc); return verdad(a) ? this.ev(e.b, loc) : a; }
      case "or": { const a = this.ev(e.a, loc); return verdad(a) ? a : this.ev(e.b, loc); }
      case "neg": { const a = this.ev(e.a, loc); if (typeof a !== "number") throw new ErrorPB(`"${e.o}" va antes de un número, no de un ${tipoDe(a)}`, e.n); return e.o === "-" ? -a : a; }
      case "bin": return binaria(e.o, this.ev(e.a, loc), this.ev(e.b, loc), e.n);
      case "cmp": {
        let a = this.ev(e.xs[0], loc);
        for (let i = 0; i < e.ops.length; i++) {
          const b = this.ev(e.xs[i + 1], loc);
          if (!comparar(e.ops[i], a, b, e.n)) return false;
          a = b;
        }
        return true;
      }
      case "attr": {
        const o = this.ev(e.a, loc);
        if (Array.isArray(o) || typeof o === "string") return metodo(o, e.nombre, e.n);
        if (o?.__pb_obj || tipoDe(o) === "dict") {
          if (o?.__pb_obj && e.nombre in o) return o[e.nombre];
          if (tipoDe(o) === "dict" && ["get", "keys", "values", "items"].includes(e.nombre)) return metodo(o, e.nombre, e.n);
          throw new ErrorPB(`no tiene "${e.nombre}"${sugerir(e.nombre, Object.keys(o).filter((k) => !k.startsWith("__")))}`, e.n);
        }
        throw new ErrorPB(`un ${tipoDe(o)} no tiene "${e.nombre}"`, e.n);
      }
      case "idx": {
        const o = this.ev(e.a, loc), i = this.ev(e.i, loc);
        if (Array.isArray(o) || typeof o === "string") return o[indice(o, i, e.n)];
        if (tipoDe(o) === "dict" || o?.__pb_obj) { if (!(String(i) in o)) throw new ErrorPB(`no hay la clave ${repr(i, true)}`, e.n); return o[String(i)]; }
        throw new ErrorPB(`no se puede usar [ ] con un ${tipoDe(o)}`, e.n);
      }
      case "call": {
        const f = this.ev(e.f, loc);
        const args = e.args.map((x) => this.ev(x, loc));
        const kws = e.kws.map(([k, x]) => [k, this.ev(x, loc)]);
        return this.invocar(f, args, kws, e.n);
      }
    }
    throw new ErrorPB("expresión desconocida", e.n);
  }
  invocar(f, args, kws, n) {
    if (typeof f === "function") {
      try { const r = f(args, Object.fromEntries(kws), n, this); return r === undefined ? null : r; }
      catch (err) { if (err instanceof ErrorPB) { if (!err.linea) { const e2 = new ErrorPB(err.message, n); throw e2; } throw err; } throw new ErrorPB(err.message, n); }
    }
    if (!f?.__pb_fn) throw new ErrorPB(`${repr(f, true)} no es una función`, n);
    const loc = { vars: new Map(), globals: new Set() };
    if (args.length > f.params.length) throw new ErrorPB(`${f.nombre}() recibe ${f.params.length} cosas y le diste ${args.length}`, n);
    f.params.forEach((p, i) => loc.vars.set(p.nombre, i < args.length ? args[i] : p.def ? this.ev(p.def, null) : undefined));
    for (const [k, v] of kws) { if (!f.params.some((p) => p.nombre === k)) throw new ErrorPB(`${f.nombre}() no tiene el parámetro "${k}"`, n); loc.vars.set(k, v); }
    const falta = f.params.find((p) => loc.vars.get(p.nombre) === undefined);
    if (falta) throw new ErrorPB(`a ${f.nombre}() le falta "${falta.nombre}"`, n);
    const r = this.bloque(f.body, loc);
    return r instanceof Retorno ? r.v : null;
  }
}

function indice(o, i, n) {
  if (!Number.isInteger(i)) throw new ErrorPB("el índice va con un número entero", n);
  const j = i < 0 ? o.length + i : i;
  if (j < 0 || j >= o.length) throw new ErrorPB(`el índice ${i} se sale (hay ${o.length})`, n);
  return j;
}
function formato(v, fmt) {
  if (!fmt || typeof v !== "number") return repr(v);
  const m = /^\.?(\d*)([f%]?)$/.exec(fmt), d = m[1] === "" ? 6 : +m[1];
  return m[2] === "%" ? (v * 100).toFixed(d) + "%" : v.toFixed(d);
}
function binaria(o, a, b, n) {
  const ta = tipoDe(a), tb = tipoDe(b), num = typeof a === "number" && typeof b === "number";
  const boolnum = (x) => (typeof x === "boolean" ? +x : x);
  if (o === "+") {
    if (num) return a + b;
    if (ta === "str" && tb === "str") return a + b;
    if (ta === "list" && tb === "list") return [...a, ...b];
    if (ta === "str" || tb === "str") throw new ErrorPB(`no se puede sumar texto con ${ta === "str" ? tb : ta}: usa str(x) o un f"…{x}…"`, n);
  }
  if (o === "*") {
    if (num) return a * b;
    if (ta === "str" && Number.isInteger(b)) return a.repeat(Math.max(0, b));
    if (ta === "list" && Number.isInteger(b)) return Array.from({ length: Math.max(0, b) }, () => a).flat();
  }
  a = boolnum(a); b = boolnum(b);
  if (typeof a === "number" && typeof b === "number") {
    if ((o === "/" || o === "//" || o === "%") && b === 0) throw new ErrorPB("división por cero", n);
    switch (o) {
      case "-": return a - b;
      case "/": return a / b;
      case "//": return Math.floor(a / b);
      case "%": return ((a % b) + b) % b;
      case "**": return a ** b;
    }
  }
  throw new ErrorPB(`no se puede hacer ${repr(a, true)} ${o} ${repr(b, true)} (${ta} ${o} ${tb})`, n);
}
function igual(a, b) { return a === b || (typeof a === "object" && typeof b === "object" && a && b && JSON.stringify(a) === JSON.stringify(b)); }
function comparar(o, a, b, n) {
  if (o === "is") return a === b || (a == null && b == null);
  if (o === "is not") return !(a === b || (a == null && b == null));
  if (o === "==") return igual(a, b);
  if (o === "!=") return !igual(a, b);
  if (o === "in" || o === "not in") {
    let r;
    if (typeof b === "string") r = typeof a === "string" && b.includes(a);
    else if (Array.isArray(b)) r = b.some((x) => igual(x, a));
    else if (tipoDe(b) === "dict" || b?.__pb_obj) r = String(a) in b;
    else throw new ErrorPB(`"in" va con un texto, una lista o un diccionario, no con un ${tipoDe(b)}`, n);
    return o === "in" ? r : !r;
  }
  const ok = (typeof a === "number" && typeof b === "number") || (typeof a === "string" && typeof b === "string");
  if (!ok) throw new ErrorPB(`no se puede comparar ${tipoDe(a)} ${o} ${tipoDe(b)}${a === null || b === null ? " (¿todavía no hay datos? revisa que no sea None)" : ""}`, n);
  return o === "<" ? a < b : o === "<=" ? a <= b : o === ">" ? a > b : a >= b;
}
function metodo(o, nombre, n) {
  const f = (fn) => Object.assign((args) => fn(...args), { nombre });
  if (Array.isArray(o)) {
    const M = { append: (x) => { o.push(x); }, pop: (i = -1) => { if (!o.length) throw new ErrorPB("pop() de una lista vacía", n); return o.splice(indice(o, i, n), 1)[0]; }, count: (x) => o.filter((y) => igual(x, y)).length, index: (x) => { const i = o.findIndex((y) => igual(x, y)); if (i < 0) throw new ErrorPB(`${repr(x, true)} no está en la lista`, n); return i; } };
    if (M[nombre]) return f(M[nombre]);
  } else if (typeof o === "string") {
    const M = { upper: () => o.toUpperCase(), lower: () => o.toLowerCase(), strip: () => o.trim(), startswith: (x) => o.startsWith(x), endswith: (x) => o.endsWith(x), replace: (a, b) => o.split(a).join(b), split: (s) => (s === undefined ? o.trim().split(/\s+/) : o.split(s)) };
    if (M[nombre]) return f(M[nombre]);
  } else {
    const M = { get: (k, d = null) => (String(k) in o ? o[String(k)] : d), keys: () => Object.keys(o), values: () => Object.values(o), items: () => Object.entries(o) };
    if (M[nombre]) return f(M[nombre]);
  }
  throw new ErrorPB(`un ${tipoDe(o)} no tiene "${nombre}"`, n);
}
function sugerir(x, opciones) {
  const d = (a, b) => { const m = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j++) m[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return m[a.length][b.length]; };
  const best = opciones.map((o) => [o, d(x, o)]).sort((a, b) => a[1] - b[1])[0];
  return best && best[1] <= Math.max(1, Math.floor(x.length / 3)) ? ` (¿quisiste decir "${best[0]}"?)` : "";
}
const num = (x, nombre, n) => { if (typeof x !== "number") throw new ErrorPB(`${nombre}() necesita un número y le diste ${tipoDe(x)}`, n); return x; };

/** Lo básico de Python. La salida de print la decide quien corre el programa (builtins.print). */
const BASICOS = {
  print: (a, k) => { BASICOS._salida(a.map((x) => repr(x)).join(k.sep ?? " ")); },
  _salida: () => {},
  str: ([x]) => repr(x),
  int: ([x], _, n) => { const v = typeof x === "string" ? parseFloat(x) : x; if (typeof v !== "number" || Number.isNaN(v)) throw new ErrorPB(`int() no entiende ${repr(x, true)}`, n); return Math.trunc(v); },
  float: ([x], _, n) => { const v = typeof x === "string" ? parseFloat(x) : x; if (typeof v !== "number" || Number.isNaN(v)) throw new ErrorPB(`float() no entiende ${repr(x, true)}`, n); return v; },
  round: ([x, d = 0], _, n) => { num(x, "round", n); const k = 10 ** d; return Math.round(x * k) / k; },
  abs: ([x], _, n) => Math.abs(num(x, "abs", n)),
  min: (a) => Math.min(...(a.length === 1 && Array.isArray(a[0]) ? a[0] : a)),
  max: (a) => Math.max(...(a.length === 1 && Array.isArray(a[0]) ? a[0] : a)),
  sum: ([xs]) => xs.reduce((s, x) => s + x, 0),
  len: ([x], _, n) => { if (typeof x === "string" || Array.isArray(x)) return x.length; if (tipoDe(x) === "dict") return Object.keys(x).length; throw new ErrorPB(`len() de un ${tipoDe(x)}`, n); },
  range: (a, _, n) => {
    const [ini, fin, paso] = a.length === 1 ? [0, a[0], 1] : [a[0], a[1], a[2] ?? 1];
    if (![ini, fin, paso].every(Number.isInteger) || paso === 0) throw new ErrorPB("range() va con enteros", n);
    const out = [];
    for (let i = ini; paso > 0 ? i < fin : i > fin; i += paso) { out.push(i); if (out.length > 100000) throw new ErrorPB("range() demasiado largo", n); }
    return out;
  },
  list: ([x]) => (x === undefined ? [] : Array.isArray(x) ? [...x] : typeof x === "string" ? [...x] : Object.keys(x)),
  type: ([x]) => tipoDe(x),
};

// =====================================================================
// La escala de premios y castigos: en el juego van de 0 a 10 (0 = apagado, ~4 = lo normal, 10 = al máximo);
// el entrenador recibe el valor real: real = nivel / 10 × escala[k] (escala = data/entrenamiento.json escala_premios).
// =====================================================================
export const realDe = (k, nivel, escala) => Math.round((nivel / 10) * (escala?.[k] ?? 10) * 1e6) / 1e6;
export const nivelDe = (k, real, escala) => Math.round(((real * 10) / (escala?.[k] ?? 10)) * 2) / 2;   // de a medio punto
/** Lo recomendado de cada premio/castigo (0-10) según las misiones: {k: "4"} o {k: "2-4"} si cambia de misión a misión. */
export function recomendados(misiones, escala) {
  const out = {};
  for (const m of misiones) for (const [k, v] of Object.entries(m.premios || {})) (out[k] = out[k] || new Set()).add(nivelDe(k, v, escala));
  const f = (x) => String(x).replace(".", ",");
  return Object.fromEntries(Object.entries(out).map(([k, set]) => { const xs = [...set].sort((a, b) => a - b); return [k, xs.length === 1 ? f(xs[0]) : `${f(xs[0])}-${f(xs.at(-1))}`]; }));
}

// =====================================================================
// El "compilador" de PBDMM: programa -> pedido de entrenamiento + las funciones que reaccionan
// =====================================================================

/**
 * Prepara un programa. data = app/data/pbdmm.json + {misiones (entrenamiento.json), premiosValidos, escala (0-10 -> real), tiposPremio
 * ({clave: "premio"|"castigo"}: premios() solo acepta premios y castigos() solo castigos), drones (los del
 * hangar: nombres)}. host = { print(txt), avisar(txt), ajustar(cambios), pausar(), seguir(), detener(), guardar() }
 * Devuelve { cfg, interp, hooks: [...nombres], reaccionar(nombre, e) -> lista de acciones hechas }.
 * Lanza ErrorPB con la línea si algo está mal.
 */
export function compilar(src, data, host = {}) {
  const arbol = parsear(src);
  const cfg = { premios: {}, lineas: {} };
  let fase = "arriba";
  const salida = (t) => (host.print || (() => {}))(t);
  const alias = data.alias_premios || {};
  const tipos = data.tiposPremio || {};
  const nombresDe = (tipo) => [...data.premiosValidos.filter((k) => (tipos[k] || "premio") === tipo), ...Object.keys(alias).filter((a) => (tipos[alias[a]] || "premio") === tipo)];
  /** El nombre del premio/castigo para el entrenador; premios() no acepta castigos ni al revés. */
  const premioKey = (k, n, tipo) => {
    const kk = alias[k] || k, fn = tipo === "castigo" ? "castigos" : "premios";
    if (!data.premiosValidos.includes(kk)) throw new ErrorPB(`no hay un ${tipo} "${k}"${sugerir(k, nombresDe(tipo))}. Mira ayuda("${fn}")`, n);
    const real = tipos[kk] || "premio";
    if (real !== tipo) throw new ErrorPB(`"${k}" es un ${real}: va en ${real === "castigo" ? "castigos" : "premios"}(${k}=…), no en ${fn}()`, n);
    return kk;
  };
  const soloArriba = (nombre, n) => { if (fase !== "arriba") throw new ErrorPB(`${nombre}() va arriba del archivo, no dentro de una función (no se puede cambiar mientras entrena)`, n); };
  const unaVez = (k, n) => { if (cfg.lineas[k]) throw new ErrorPB(`${k}() ya lo pusiste en la línea ${cfg.lineas[k]}`, n); cfg.lineas[k] = n; };
  const texto = (x, nombre, n) => { if (typeof x !== "string") throw new ErrorPB(`${nombre}() va con un texto entre comillas`, n); return x; };
  const rango = (x, a, b, nombre, n) => { num(x, nombre, n); if (x < a || x > b) throw new ErrorPB(`${nombre}: ${x} está fuera de ${a} a ${b}`, n); return x; };
  const acciones = [];
  const accion = (a) => { acciones.push(a); };
  /** premios(…) y castigos(…): lo mismo para el entrenador (un diccionario de valores), cada uno con sus nombres. */
  const valores = (tipo, a, k, n) => {
    const fn = tipo === "castigo" ? "castigos" : "premios", ej = tipo === "castigo" ? "castigos(chocar=15, sacudidas=1)" : "premios(grabar=4, mirar=2)";
    if (a.length === 1 && tipoDe(a[0]) === "dict") k = { ...a[0], ...k };
    else if (a.length) throw new ErrorPB(`${ej}: cada ${tipo} con su nombre`, n);
    if (!Object.keys(k).length) throw new ErrorPB(`${fn}() necesita al menos uno, por ejemplo ${ej}`, n);
    const c = {};
    for (const [kk, v] of Object.entries(k)) {
      num(v, fn, n);
      if (v < 0 || v > 10) throw new ErrorPB(`${kk}=${repr(v)}: los ${fn} van de 0 a 10 (0 = apagado, 4 = lo normal, 10 = al máximo)`, n);
      const key = premioKey(kk, n, tipo);
      c[key] = realDe(key, v, data.escala);                 // el entrenador recibe el valor real
    }
    if (fase === "arriba") Object.assign(cfg.premios, c);
    else { cfg.premiosVivos = { ...(cfg.premiosVivos || cfg.premiosFinal || {}), ...c }; accion({ [fn]: c }); host.ajustar?.({ premios: cfg.premiosVivos }); }
  };

  const B = {
    print: (a, k) => salida(a.map((x) => repr(x)).join(k.sep ?? " ")),
    avisar: ([t]) => { if (host.avisar) host.avisar(repr(t)); salida("📣 " + repr(t)); },
    modelo: ([nombre], k, n) => {
      soloArriba("modelo", n); unaVez("modelo", n);
      texto(nombre, "modelo", n);
      const slug = nombre.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
      if (!slug || slug === "base" || slug.startsWith("_")) throw new ErrorPB(`"${nombre}" no sirve como nombre de modelo (usa letras y números; "base" es el de la campaña)`, n);
      cfg.modelo = slug; cfg.nombre = nombre;
      const desde = k.desde ?? "base";
      texto(desde, "modelo(desde=…)", n);
      cfg.desde = desde === "base" || desde === "cero" ? desde : desde.toLowerCase();
    },
    red: (a, k, n) => {
      soloArriba("red", n); unaVez("red", n);
      const capas = k.capas ?? a[0];
      if (!Array.isArray(capas) || capas.length < 1 || capas.length > 4) throw new ErrorPB("red(capas=[64, 64]): de 1 a 4 capas", n);
      capas.forEach((c) => { if (!Number.isInteger(c) || c < 8 || c > 512) throw new ErrorPB(`cada capa tiene de 8 a 512 neuronas (pusiste ${repr(c, true)})`, n); });
      cfg.capas = capas;
    },
    mision: ([id], _, n) => {
      soloArriba("mision", n); unaVez("mision", n);
      texto(id, "mision", n);
      const m = data.misiones.find((x) => x.id === id);
      if (!m) throw new ErrorPB(`no hay una misión "${id}". Hay: ${data.misiones.map((x) => x.id).join(", ")}`, n);
      cfg.mision = id; cfg.nivel = m.nivel;
      if (cfg.viento === undefined && m.viento) cfg.vientoMision = m.viento;
    },
    nivel: ([x], _, n) => {
      soloArriba("nivel", n); unaVez("mision", n);
      if (!Number.isInteger(x) || !data.niveles.includes(x)) throw new ErrorPB(`nivel() va con un número de nivel del Drone Lab: ${data.niveles.join(", ")}`, n);
      cfg.nivel = x; cfg.mision = null;
    },
    dron: ([x], _, n) => {
      soloArriba("dron", n); unaVez("dron", n);
      texto(x, "dron", n);
      const low = x.toLowerCase();
      if (low === "estandar" || low === "estándar") cfg.dron = "ESTANDAR";
      else if (low === "azar") cfg.dron = "AZAR";
      else {
        const d = (data.drones || []).find((y) => y.toLowerCase() === low);
        if (!d) throw new ErrorPB(`no tienes un dron "${x}" en el hangar. Usa "estandar", "azar"${data.drones?.length ? " o uno tuyo: " + data.drones.map((y) => `"${y}"`).join(", ") : ""}`, n);
        cfg.dron = { hangar: d };
      }
    },
    drones: ([x], _, n) => { soloArriba("drones", n); unaVez("drones", n); if (!Number.isInteger(x)) throw new ErrorPB("drones() va con un número entero", n); cfg.drones = rango(x, 1, 200, "drones", n); },
    entrenar_en: ([x], _, n) => {
      soloArriba("entrenar_en", n); unaVez("entrenar_en", n);
      texto(x, "entrenar_en", n);
      const v = { fondo: "fondo", "segundo plano": "fondo", blender: "blender" }[x.toLowerCase()];
      if (!v) throw new ErrorPB('entrenar_en("fondo") o entrenar_en("blender")', n);
      cfg.donde = v;
    },
    velocidad: ([x], _, n) => {
      texto(x, "velocidad", n);
      if (!["rapido", "real"].includes(x)) throw new ErrorPB('velocidad("rapido") o velocidad("real") (real = lo ves en Blender a velocidad normal)', n);
      if (fase === "arriba") cfg.velocidad = x; else { accion({ velocidad: x }); host.ajustar?.({ velocidad: x }); }
    },
    viento: ([x], _, n) => {
      rango(x, 0, 8, "viento", n);
      if (fase === "arriba") cfg.viento = x; else { accion({ viento: x }); host.ajustar?.({ viento: x }); }
    },
    aprendizaje: (a, k, n) => {
      const c = {};
      if (k.lr !== undefined) c.lr = rango(k.lr, 1e-6, 1e-2, "lr", n);
      if (k.exploracion !== undefined) c.ent = rango(k.exploracion, 0, 0.1, "exploracion", n);
      if (a.length) throw new ErrorPB("aprendizaje(lr=0.0003, exploracion=0.0): con nombre", n);
      if (!Object.keys(c).length) throw new ErrorPB("aprendizaje() necesita lr=… o exploracion=…", n);
      if (fase === "arriba") Object.assign(cfg, c); else { accion(c); host.ajustar?.(c); }
    },
    premios: (a, k, n) => valores("premio", a, k, n),
    castigos: (a, k, n) => valores("castigo", a, k, n),
    pausar: (_, __, n) => { if (fase === "arriba") throw new ErrorPB("pausar() va dentro de una función (por ejemplo cada_generacion)", n); accion({ pausar: true }); host.pausar?.(); },
    seguir: (_, __, n) => { if (fase === "arriba") throw new ErrorPB("seguir() va dentro de una función", n); accion({ seguir: true }); host.seguir?.(); },
    detener: (_, __, n) => { if (fase === "arriba") throw new ErrorPB("detener() va dentro de una función (por ejemplo: if e.exito > 0.9: detener())", n); accion({ detener: true }); host.detener?.(); },
    guardar: (_, __, n) => { if (fase === "arriba") throw new ErrorPB("guardar() va dentro de una función", n); accion({ guardar: true }); host.guardar?.(); },
  };
  const interp = new Interprete(B);
  interp.correr(arbol);
  fase = "corriendo";

  // valida y completa
  if (!cfg.modelo) throw new ErrorPB('falta modelo("nombre"): cada programa entrena UN modelo con nombre');
  if (cfg.nivel === undefined) throw new ErrorPB('falta mision("…") (o nivel(n)): qué tiene que aprender. Mira ayuda("mision")');
  cfg.donde = cfg.donde || "fondo";
  cfg.drones = cfg.drones || 50;
  cfg.dron = cfg.dron || "ESTANDAR";
  cfg.velocidad = cfg.velocidad || (cfg.donde === "blender" ? "real" : "rapido");
  if (cfg.viento === undefined && cfg.vientoMision !== undefined) cfg.viento = cfg.vientoMision;
  delete cfg.vientoMision;
  if (cfg.capas && cfg.desde !== "cero") throw new ErrorPB('red(capas=…) solo sirve con modelo(…, desde="cero"): una red que ya existe no cambia de tamaño', cfg.lineas.red);
  if (cfg.donde === "fondo" && cfg.modelo === "base") throw new ErrorPB("el modelo base solo se entrena en Blender");
  const premiosMision = cfg.mision ? data.misiones.find((x) => x.id === cfg.mision)?.premios || {} : {};
  cfg.premiosFinal = { ...premiosMision, ...cfg.premios };
  const hooks = (data.hooks || ["al_empezar", "cada_generacion", "al_terminar"]).filter((h) => interp.tiene(h));
  const desconocidas = [...interp.globales.entries()].filter(([k, v]) => v?.__pb_fn && !hooks.includes(k) && /^(al_|cada_)/.test(k)).map(([k]) => k);
  if (desconocidas.length) throw new ErrorPB(`el juego no llama "${desconocidas[0]}": las funciones especiales son ${(data.hooks || []).join(", ")}`, interp.globales.get(desconocidas[0]).n);

  return {
    cfg, interp, hooks,
    /** Llama un hook con e (objeto). Devuelve las acciones que pidió. */
    reaccionar(nombre, e) {
      acciones.length = 0;
      if (interp.tiene(nombre)) interp.llamar(nombre, [e]);
      return [...acciones];
    },
  };
}

/** El pedido para POST /api/lab (accion "iniciar"). dronFisica(nombre) -> el dron del hangar como lo pide el servidor. */
export function pedidoDe(cfg, dronFisica) {
  const body = {
    accion: "iniciar", modelo: cfg.modelo, base_de: cfg.desde, donde: cfg.donde, nivel: cfg.nivel, drones: cfg.drones,
    velocidad: cfg.velocidad, premios: cfg.premiosFinal,
  };
  if (cfg.viento !== undefined) body.viento = cfg.viento;
  if (cfg.lr !== undefined) body.lr = cfg.lr;
  if (cfg.ent !== undefined) body.ent = cfg.ent;
  if (cfg.capas) body.capas = cfg.capas;
  body.dron = typeof cfg.dron === "object" ? dronFisica(cfg.dron.hangar) : cfg.dron;
  return body;
}

/** e: cómo va el entrenamiento, para los hooks. tr = entrenando.json; ses = {gen0, t0, mejor}; escala: e.premios de 0 a 10. */
export function estadoE(tr, ses = {}, escala = null) {
  const h = tr.hist || [], ult = h.at(-1) || [];
  const p = tr.params || {};
  const val = (x) => (typeof x === "number" && Number.isFinite(x) ? Math.round(x * 10000) / 10000 : null);
  return objeto({
    generacion: tr.gen ?? 0,
    generaciones_sesion: Math.max(0, (tr.gen ?? 0) - (ses.gen0 ?? tr.gen ?? 0)),
    pasos: tr.steps ?? 0,
    exito: val(tr.succ),
    choque: val(tr.crash),
    premio: val(tr.rew),
    calidad: val(ult[5] ?? tr.film),
    mejor_exito: val(ses.mejor ?? tr.succ),
    nivel: tr.stage ?? null,
    minutos: ses.t0 ? Math.round((Date.now() - ses.t0) / 600) / 100 : 0,
    pausado: !!p.paused,
    lr: val(p.lr), exploracion: val(p.ent), ruido: val(p.sigma), viento: val(p.wind),
    premios: Object.freeze(Object.fromEntries(Object.entries(p.reward || {}).map(([k, v]) => [k, escala ? nivelDe(k, v, escala) : v]))),
    historia_exito: h.slice(-20).map((x) => val(x[2])),
  });
}
