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
// El subconjunto de Python: números, textos (y f"..{x}.."), True/False/None, listas, tuplas, diccionarios, variables,
// + - * / // % **, == != < <= > >= in is, and/or/not, x if c else y, if/elif/else, for x in … (y for k, v in …),
// [x for x in … if …], def/return (valores por defecto), f(*lista, **dicc), a, b = 1, 2, global, pass,
// break/continue, comentarios #. Sin while ni import (un programa no puede colgar ni tocar tu compu).
// Docs para el jugador: app/data/pbdmm.json. Pruebas: node app/test_pbdmm.mjs
// =====================================================================
import { t, idioma } from "./i18n.js";
import { cumple, minutosNecesarios } from "./requisitos.js";

export class ErrorPB extends Error {
  constructor(msg, linea) { super(linea ? t("línea {n}: {msg}", { n: linea, msg }) : msg); this.linea = linea || null; this.msgCorto = msg; }
}

// ---------------- léxico ----------------
const KW = new Set(["def", "return", "if", "elif", "else", "for", "in", "and", "or", "not", "True", "False", "None", "global", "pass", "break", "continue", "is", "while", "import", "from", "class", "lambda"]);
const OPS = ["**=", "//=", "==", "!=", "<=", ">=", "+=", "-=", "*=", "/=", "**", "//", "(", ")", "[", "]", "{", "}", ",", ":", ".", "=", "<", ">", "+", "-", "*", "/", "%"];

export function lexer(src) {
  const toks = [], indents = [0];
  const lineas = src.replace(/\r\n?/g, "\n").replace(/\t/g, "    ").split("\n");
  let prof = 0;                                   // dentro de ( [ { las líneas siguen
  const abiertos = [];                            // [símbolo, línea] de cada ( [ { sin cerrar
  for (let ln = 0; ln < lineas.length; ln++) {
    const L = lineas[ln], n = ln + 1;
    let i = 0;
    if (prof === 0) {
      while (L[i] === " ") i++;
      if (i >= L.length || L[i] === "#") continue;  // línea vacía o comentario
      if (i > indents.at(-1)) { indents.push(i); toks.push({ t: "INDENT", n }); }
      while (i < indents.at(-1)) {
        indents.pop(); toks.push({ t: "DEDENT", n });
        if (i > indents.at(-1)) throw new ErrorPB(t("la sangría (los espacios al inicio) no cuadra con las líneas de arriba"), n);
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
      if (!op) {                                  // lo que se escribe en otros lenguajes y en Python no
        if (L.startsWith("&&", i)) throw new ErrorPB(t('en PBDMM (como en Python) "y" se escribe and, no &&: if e.exito > 0.9 and e.calidad > 0.8:'), n);
        if (L.startsWith("||", i)) throw new ErrorPB(t('en PBDMM (como en Python) "o" se escribe or, no ||'), n);
        if (c === "!") throw new ErrorPB(t('en PBDMM (como en Python) "no" se escribe not, no ! (para "distinto de" sí es !=)'), n);
        if (c === "{" || c === "}") throw new ErrorPB(t("las llaves { } son para diccionarios; los bloques van con : y sangría"), n);
        if (c === ";") throw new ErrorPB(t("en PBDMM no hace falta ; al final de la línea"), n);
        throw new ErrorPB(t('no entiendo el símbolo "{c}"', { c }), n);
      }
      if ("([{".includes(op)) { prof++; abiertos.push([op, n]); }
      if (")]}".includes(op)) { prof = Math.max(0, prof - 1); abiertos.pop(); }
      toks.push({ t: "OP", v: op, n }); i += op.length;
    }
    if (prof === 0) toks.push({ t: "NL", n });
  }
  if (prof > 0) {
    const [sim, ln] = abiertos.at(-1) || ["(", lineas.length];
    throw new ErrorPB(t("falta cerrar el {sim} que abriste en esta línea", { sim: { "(": t("paréntesis ("), "[": t("corchete ["), "{": t("llave {") }[sim] }), ln);
  }
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
  if (j >= L.length) throw new ErrorPB(t("un texto sin cerrar: falta la comilla del final"), n);
  return [s, j + 1];
}

// ---------------- sintaxis -> árbol ----------------
export function parsear(src) {
  const T = lexer(src);
  let p = 0;
  const ver = () => T[p], sig = () => T[p++];
  const es = (tt, v) => T[p].t === tt && (v === undefined || T[p].v === v);
  const op = (v) => es("OP", v), kw = (v) => es("KW", v);
  const pedir = (tt, v, msg) => {
    if (!es(tt, v)) throw new ErrorPB(msg || t('esperaba "{v}" y encontré {d}', { v: v ?? tt, d: desc(ver()) }), ver().n);
    return sig();
  };
  const desc = (k) => (k.t === "NL" ? t("el fin de la línea") : k.t === "EOF" ? t("el fin del archivo") : k.t === "INDENT" ? t("más sangría") : k.t === "DEDENT" ? t("menos sangría") : `"${k.v}"`);

  function programa() {
    const body = [];
    while (!es("EOF")) { if (es("NL")) { sig(); continue; } body.push(sentencia()); }
    return body;
  }
  function bloque() {
    pedir("OP", ":", t('falta ":" al final de la línea (antes de {d})', { d: desc(ver()) }));
    if (!es("NL")) { const s = simple(); finLinea(); return [s]; }
    sig();
    pedir("INDENT", undefined, t('después de ":" las líneas de adentro van con sangría (4 espacios)'));
    const body = [];
    while (!es("DEDENT") && !es("EOF")) { if (es("NL")) { sig(); continue; } body.push(sentencia()); }
    if (es("DEDENT")) sig();
    return body;
  }
  function finLinea() { if (es("NL")) sig(); else if (!es("EOF") && !es("DEDENT")) throw new ErrorPB(t("sobra algo al final de la línea: {d}", { d: desc(ver()) }), ver().n); }

  function sentencia() {
    const n = ver().n;
    if (kw("def")) {
      sig();
      const nombre = pedir("NAME", undefined, t("después de def va el nombre de la función")).v;
      pedir("OP", "(");
      const params = [];
      while (!op(")")) {
        const pn = pedir("NAME", undefined, t("los parámetros son nombres")).v;
        let def = null;
        if (op("=")) { sig(); def = expr(); }
        else if (params.some((x) => x.def)) throw new ErrorPB(t("los parámetros con valor por defecto van al final"), ver().n);
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
      const v = nombresFor();
      pedir("KW", "in", t('falta "in" (for x in lista:)'));
      return { k: "for", v, it: expr(), body: bloque(), n };
    }
    if (kw("while")) throw new ErrorPB(t("PBDMM no tiene while (un ciclo sin fin colgaría el entrenamiento): usa for x in range(n)"), n);
    if (kw("import") || kw("from")) throw new ErrorPB(t("PBDMM no importa módulos: todo lo que necesitas ya está (mira la ayuda)"), n);
    if (kw("class") || kw("lambda")) throw new ErrorPB(t("PBDMM no tiene {x}", { x: ver().v }), n);
    const s = simple();
    finLinea();
    return s;
  }
  function simple() {
    const n = ver().n;
    if (kw("pass")) { sig(); return { k: "pass", n }; }
    if (kw("break")) { sig(); return { k: "break", n }; }
    if (kw("continue")) { sig(); return { k: "continue", n }; }
    if (kw("return")) { sig(); return { k: "return", e: es("NL") || es("EOF") ? null : tuplaO(expr), n }; }
    if (kw("global")) {
      sig(); const nombres = [pedir("NAME").v];
      while (op(",")) { sig(); nombres.push(pedir("NAME").v); }
      return { k: "global", nombres, n };
    }
    const e = tuplaO(expr);
    if (op("=") || op("+=") || op("-=") || op("*=") || op("/=") || op("//=") || op("**=")) {
      const o = sig().v;
      const ok = (x) => ["name", "attr", "idx"].includes(x.k);
      if (!(ok(e) || (o === "=" && e.k === "list" && e.tupla && e.xs.every(ok)))) throw new ErrorPB(t("a la izquierda del = va un nombre de variable (o varios: a, b = 1, 2)"), n);
      return { k: "asig", obj: e, op: o === "=" ? null : o.slice(0, -1), e: tuplaO(expr), n };
    }
    return { k: "expr", e, n };
  }
  /** a, b, c (sin paréntesis) -> una tupla (lista); si hay uno solo, ese. */
  function tuplaO(f) {
    const n = ver().n, a = f();
    if (!op(",")) return a;
    const xs = [a];
    while (op(",")) { sig(); if (es("NL") || es("EOF") || op("=") || op(")")) break; xs.push(f()); }
    return { k: "list", xs, tupla: true, n };
  }
  /** for x in … · for k, v in … */
  function nombresFor() {
    const xs = [pedir("NAME", undefined, t("después de for va el nombre de la variable")).v];
    while (op(",")) { sig(); xs.push(pedir("NAME", undefined, t("después de la coma va otro nombre")).v); }
    return xs.length === 1 ? xs[0] : xs;
  }

  // expresiones (de menor a mayor precedencia)
  function expr() {
    const a = o_();
    if (kw("if")) {                                  // a if cond else b
      const n = sig().n, c = o_();
      pedir("KW", "else", t('falta "else" (x if condición else y)'));
      return { k: "ternario", c, a, b: expr(), n };
    }
    return a;
  }
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
  function suma() { let a = mult(); while (op("+") || op("-")) { const tk = sig(); a = { k: "bin", o: tk.v, a, b: mult(), n: tk.n }; } return a; }
  function mult() { let a = unario(); while (op("*") || op("/") || op("//") || op("%")) { const tk = sig(); a = { k: "bin", o: tk.v, a, b: unario(), n: tk.n }; } return a; }
  function unario() { if (op("-") || op("+")) { const tk = sig(); return { k: "neg", o: tk.v, a: unario(), n: tk.n }; } return pot(); }
  function pot() { const a = postfijo(); if (op("**")) { const tk = sig(); return { k: "bin", o: "**", a, b: unario(), n: tk.n }; } return a; }
  function postfijo() {
    let a = atomo();
    for (;;) {
      if (op("(")) {
        const n = sig().n, args = [], kws = [];
        while (!op(")")) {
          if (op("**")) { sig(); kws.push([null, expr()]); }                     // **diccionario
          else if (op("*")) { sig(); args.push({ k: "spread", e: expr(), n: ver().n }); }   // *lista
          else if (es("NAME") && T[p + 1]?.t === "OP" && T[p + 1].v === "=") { const k = sig().v; sig(); kws.push([k, expr()]); }
          else { if (kws.length) throw new ErrorPB(t("los argumentos con nombre (x=1) van después de los demás"), ver().n); args.push(expr()); }
          if (!op(")")) pedir("OP", ",", t('en la llamada falta "," o ")" (encontré {d})', { d: desc(ver()) }));
        }
        sig();
        a = { k: "call", f: a, args, kws, n };
      } else if (op(".")) { const n = sig().n; a = { k: "attr", a, nombre: pedir("NAME", undefined, t("después del punto va un nombre")).v, n }; }
      else if (op("[")) {                                            // x[i] · x[a:b] (rebanada)
        const n = sig().n;
        const i = op(":") ? null : expr();
        if (op(":")) { sig(); const fin = op("]") ? null : expr(); pedir("OP", "]"); a = { k: "slice", a, ini: i, fin, n }; }
        else { pedir("OP", "]"); a = { k: "idx", a, i, n }; }
      }
      else return a;
    }
  }
  function atomo() {
    const tk = ver();
    if (tk.t === "NUM") { sig(); return { k: "num", v: tk.v, n: tk.n }; }
    if (tk.t === "STR") { sig(); let v = tk.v; while (es("STR")) v += sig().v; return { k: "str", v, n: tk.n }; }
    if (tk.t === "FSTR") { sig(); return { k: "fstr", partes: fstring(tk.v, tk.n), n: tk.n }; }
    if (tk.t === "NAME") { sig(); return { k: "name", v: tk.v, n: tk.n }; }
    if (tk.t === "KW" && (tk.v === "True" || tk.v === "False" || tk.v === "None")) { sig(); return { k: "const", v: tk.v === "True" ? true : tk.v === "False" ? false : null, n: tk.n }; }
    if (op("(")) {
      sig();
      if (op(")")) { sig(); return { k: "list", xs: [], tupla: true, n: tk.n }; }
      const e = tuplaO(expr); pedir("OP", ")"); return e;
    }
    if (op("[")) {
      sig(); const xs = [];
      if (!op("]")) {
        const a = expr();
        if (kw("for")) {                               // [x * 2 for x in lista if x > 0]
          sig();
          const v = nombresFor();
          pedir("KW", "in", t('falta "in" ([x for x in lista])'));
          const it = o_();
          let c = null;
          if (kw("if")) { sig(); c = o_(); }
          pedir("OP", "]");
          return { k: "comp", e: a, v, it, c, n: tk.n };
        }
        xs.push(a);
        if (!op("]")) pedir("OP", ",");
      }
      while (!op("]")) { xs.push(expr()); if (!op("]")) pedir("OP", ","); }
      sig(); return { k: "list", xs, n: tk.n };
    }
    if (op("{")) {
      sig(); const pares = [];
      while (!op("}")) { const k = expr(); pedir("OP", ":"); pares.push([k, expr()]); if (!op("}")) pedir("OP", ","); }
      sig(); return { k: "dict", pares, n: tk.n };
    }
    throw new ErrorPB(t("no esperaba {d} aquí", { d: desc(tk) }), tk.n);
  }
  function fstring(s, n) {
    const partes = [];
    let i = 0, txt = "";
    while (i < s.length) {
      if (s[i] === "{" && s[i + 1] === "{") { txt += "{"; i += 2; continue; }
      if (s[i] === "}" && s[i + 1] === "}") { txt += "}"; i += 2; continue; }
      if (s[i] === "{") {
        const j = s.indexOf("}", i);
        if (j < 0) throw new ErrorPB(t("en el f-texto falta cerrar una }"), n);
        let dentro = s.slice(i + 1, j), fmt = null;
        const dos = dentro.lastIndexOf(":");
        if (dos > 0 && /^\.?\d*[f%]?$/.test(dentro.slice(dos + 1))) { fmt = dentro.slice(dos + 1); dentro = dentro.slice(0, dos); }
        if (txt) partes.push(txt); txt = "";
        let sub;
        try { sub = parsear(dentro); }
        catch (err) { throw new ErrorPB(t("en el f-texto, dentro de { }: {err}", { err: err.msgCorto || err.message }), n); }
        if (sub.length !== 1 || sub[0].k !== "expr") throw new ErrorPB(t("dentro de { } va una expresión"), n);
        renumerar(sub[0].e, n);                     // los errores de adentro dicen la línea del f-texto
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

/** Pone la línea n a todo un árbol (lo de adentro de un f-texto se parsea aparte y diría "línea 1"). */
function renumerar(nodo, n) {
  if (!nodo || typeof nodo !== "object") return;
  if (Array.isArray(nodo)) { nodo.forEach((x) => renumerar(x, n)); return; }
  if ("n" in nodo) nodo.n = n;
  for (const v of Object.values(nodo)) if (v && typeof v === "object") renumerar(v, n);
}

// ---------------- ejecutar ----------------
class Retorno { constructor(v) { this.v = v; } }
const CORTE = { break: Symbol("break"), continue: Symbol("continue") };

/** Lo que el programa ve como objeto con atributos (e.exito): un objeto JS "congelado". */
export function objeto(campos) { return Object.freeze({ __pb_obj: true, ...campos }); }
/** e con sus diagnósticos con clave (para el narrador; el programa ve e.diagnosticos, solo los textos). */
function objetoConK(o, dg) { const c = { ...o }; Object.defineProperty(c, "diagnosticos_k", { value: dg, enumerable: false }); return Object.freeze(c); }

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

  tick(n) { if (++this.pasos > this.pasosMax) throw new ErrorPB(t("el programa hizo demasiadas operaciones (más de {n}): ¿un for muy largo?", { n: this.pasosMax }), n); }

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
        if (!loc) throw new ErrorPB(t("return solo va dentro de una función (def)"), s.n);
        return new Retorno(s.e ? this.ev(s.e, loc) : null);
      case "global":
        if (!loc) return;
        s.nombres.forEach((x) => loc.globals.add(x));
        return;
      case "def": {
        // como Python: los valores por defecto se calculan UNA vez, al definir; y la función recuerda dónde nació (closure)
        const params = s.params.map((p) => ({ ...p, valor: p.def ? this.ev(p.def, loc) : undefined }));
        const f = { __pb_fn: true, nombre: s.nombre, params, body: s.body, n: s.n, cierre: loc };
        this.poner(s.nombre, f, loc, s.n);
        return;
      }
      case "if": {
        for (const [c, b] of s.ramas) if (verdad(this.ev(c, loc))) return this.bloque(b, loc);
        return s.otro ? this.bloque(s.otro, loc) : undefined;
      }
      case "for": {
        const it = this.iterable(this.ev(s.it, loc), s.n);
        for (const x of it) {
          this.ponerVarios(s.v, x, loc, s.n);
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
        if (s.obj.k === "list") {                            // a, b = 1, 2
          if (!Array.isArray(v) || v.length !== s.obj.xs.length) throw new ErrorPB(t("a la izquierda hay {a} nombres y a la derecha {b}", { a: s.obj.xs.length, b: Array.isArray(v) ? v.length : t("un {tipo}", { tipo: tipoDe(v) }) }), s.n);
          s.obj.xs.forEach((x, i) => this.sent({ k: "asig", obj: x, op: null, e: { k: "const", v: v[i], n: s.n }, n: s.n }, loc));
          return;
        }
        if (s.obj.k === "name") this.poner(s.obj.v, v, loc, s.n);
        else if (s.obj.k === "idx") {
          const o = this.ev(s.obj.a, loc), i = this.ev(s.obj.i, loc);
          if (Array.isArray(o)) { const j = indice(o, i, s.n); o[j] = v; }
          else if (tipoDe(o) === "dict") o[String(i)] = v;
          else throw new ErrorPB(t("no se puede cambiar un elemento de un {tipo}", { tipo: tipoDe(o) }), s.n);
        } else {
          const o = this.ev(s.obj.a, loc);
          if (o?.__pb_set) o.__pb_set(s.obj.nombre, v, s.n);
          else throw new ErrorPB(t('no se puede cambiar "{nombre}" de un {tipo}', { nombre: s.obj.nombre, tipo: tipoDe(o) }), s.n);
        }
        return;
      }
    }
    throw new ErrorPB(t("sentencia desconocida"), s.n);
  }
  iterable(it, n) {
    if (typeof it === "string") return [...it];
    if (tipoDe(it) === "dict") return Object.keys(it);
    if (!Array.isArray(it)) throw new ErrorPB(t("no se puede recorrer con for un {tipo}", { tipo: tipoDe(it) }), n);
    return it;
  }
  /** for x in … / for k, v in …: pone una o varias variables. */
  ponerVarios(v, x, loc, n) {
    if (typeof v === "string") return this.poner(v, x, loc, n);
    if (!Array.isArray(x) || x.length !== v.length) throw new ErrorPB(t("for {v}: cada elemento tiene que traer {n} cosas", { v: v.join(", "), n: v.length }), n);
    v.forEach((nombre, i) => this.poner(nombre, x[i], loc, n));
  }
  poner(nombre, v, loc, n) {
    if (nombre in this.builtins && !(loc && loc.vars.has(nombre))) throw new ErrorPB(t('"{nombre}" es una función de PBDMM: usa otro nombre para tu variable', { nombre }), n);
    if (loc && !loc.globals.has(nombre)) loc.vars.set(nombre, v);
    else this.globales.set(nombre, v);
  }
  leer(nombre, loc, n) {
    if (loc && loc.vars.has(nombre) && !loc.globals.has(nombre)) return loc.vars.get(nombre);
    if (!loc?.globals.has(nombre)) for (let L = loc?.padre; L; L = L.padre) if (L.vars.has(nombre)) return L.vars.get(nombre);
    if (this.globales.has(nombre)) return this.globales.get(nombre);
    if (nombre in this.builtins) return Object.assign(this.builtins[nombre], { nombre });
    if (nombre === "e" && !loc) throw new ErrorPB(t('"e" (cómo va el entrenamiento) solo existe dentro de las funciones que llama el juego: def cada_generacion(e): …  Arriba del archivo todavía no está entrenando'), n);
    throw new ErrorPB(t('no conozco "{nombre}"{sug}', { nombre, sug: sugerir(nombre, [...this.globales.keys(), ...Object.keys(this.builtins)]) }), n);
  }
  ev(e, loc) {
    this.tick(e.n);
    switch (e.k) {
      case "num": case "str": case "const": return e.v;
      case "fstr": return e.partes.map((x) => (typeof x === "string" ? x : formato(this.ev(x.e, loc), x.fmt))).join("");
      case "name": return this.leer(e.v, loc, e.n);
      case "list": return e.xs.map((x) => this.ev(x, loc));
      case "ternario": return verdad(this.ev(e.c, loc)) ? this.ev(e.a, loc) : this.ev(e.b, loc);
      case "comp": {                                   // su propio espacio: sus variables no se escapan
        const sub = { vars: new Map(), globals: new Set(), padre: loc }, out = [];
        for (const x of this.iterable(this.ev(e.it, loc), e.n)) {
          this.ponerVarios(e.v, x, sub, e.n);
          if (!e.c || verdad(this.ev(e.c, sub))) out.push(this.ev(e.e, sub));
          if (out.length > 100000) throw new ErrorPB(t("la lista es demasiado larga"), e.n);
        }
        return out;
      }
      case "dict": { const o = {}; for (const [k, v] of e.pares) o[String(this.ev(k, loc))] = this.ev(v, loc); return o; }
      case "not": return !verdad(this.ev(e.a, loc));
      case "and": { const a = this.ev(e.a, loc); return verdad(a) ? this.ev(e.b, loc) : a; }
      case "or": { const a = this.ev(e.a, loc); return verdad(a) ? a : this.ev(e.b, loc); }
      case "neg": { const a = this.ev(e.a, loc); if (typeof a !== "number") throw new ErrorPB(t('"{o}" va antes de un número, no de un {tipo}', { o: e.o, tipo: tipoDe(a) }), e.n); return e.o === "-" ? -a : a; }
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
          throw new ErrorPB(t('no tiene "{nombre}"{sug}', { nombre: e.nombre, sug: sugerir(e.nombre, Object.keys(o).filter((k) => !k.startsWith("__"))) }), e.n);
        }
        throw new ErrorPB(t('un {tipo} no tiene "{nombre}"', { tipo: tipoDe(o), nombre: e.nombre }), e.n);
      }
      case "slice": {
        const o = this.ev(e.a, loc);
        if (!Array.isArray(o) && typeof o !== "string") throw new ErrorPB(t("no se puede rebanar un {tipo} ([a:b] va con listas y textos)", { tipo: tipoDe(o) }), e.n);
        const lim = (x, d) => { if (x === null) return d; const v = this.ev(x, loc); if (!Number.isInteger(v)) throw new ErrorPB(t("el índice va con un número entero"), e.n); return v < 0 ? Math.max(0, o.length + v) : Math.min(v, o.length); };
        return o.slice(lim(e.ini, 0), lim(e.fin, o.length));
      }
      case "idx": {
        const o = this.ev(e.a, loc), i = this.ev(e.i, loc);
        if (Array.isArray(o) || typeof o === "string") return o[indice(o, i, e.n)];
        if (tipoDe(o) === "dict" || o?.__pb_obj) { if (!(String(i) in o)) throw new ErrorPB(t("no hay la clave {k}", { k: repr(i, true) }), e.n); return o[String(i)]; }
        throw new ErrorPB(t("no se puede usar [ ] con un {tipo}", { tipo: tipoDe(o) }), e.n);
      }
      case "call": {
        const f = this.ev(e.f, loc);
        const args = e.args.flatMap((x) => {
          if (x.k !== "spread") return [this.ev(x, loc)];
          const v = this.ev(x.e, loc);
          if (!Array.isArray(v)) throw new ErrorPB(t("*{tipo}: el * va con una lista", { tipo: tipoDe(v) }), e.n);
          return v;
        });
        const kws = e.kws.flatMap(([k, x]) => {
          if (k !== null) return [[k, this.ev(x, loc)]];
          const v = this.ev(x, loc);
          if (tipoDe(v) !== "dict") throw new ErrorPB(t("**{tipo}: el ** va con un diccionario", { tipo: tipoDe(v) }), e.n);
          return Object.entries(v);
        });
        return this.invocar(f, args, kws, e.n);
      }
    }
    throw new ErrorPB(t("expresión desconocida"), e.n);
  }
  invocar(f, args, kws, n) {
    if (typeof f === "function") {
      try { const r = f(args, Object.fromEntries(kws), n, this); return r === undefined ? null : r; }
      catch (err) { if (err instanceof ErrorPB) { if (!err.linea) { const e2 = new ErrorPB(err.message, n); throw e2; } throw err; } throw new ErrorPB(err.message, n); }
    }
    if (!f?.__pb_fn) throw new ErrorPB(t("{f} no es una función", { f: repr(f, true) }), n);
    const loc = { vars: new Map(), globals: new Set(), padre: f.cierre || null };
    if (args.length > f.params.length) throw new ErrorPB(t("{f}() recibe {n} cosas y le diste {m}", { f: f.nombre, n: f.params.length, m: args.length }), n);
    f.params.forEach((p, i) => loc.vars.set(p.nombre, i < args.length ? args[i] : p.def ? p.valor : undefined));
    for (const [k, v] of kws) { if (!f.params.some((p) => p.nombre === k)) throw new ErrorPB(t('{f}() no tiene el parámetro "{k}"', { f: f.nombre, k }), n); loc.vars.set(k, v); }
    const falta = f.params.find((p) => loc.vars.get(p.nombre) === undefined);
    if (falta) throw new ErrorPB(t('a {f}() le falta "{p}"', { f: f.nombre, p: falta.nombre }), n);
    const r = this.bloque(f.body, loc);
    return r instanceof Retorno ? r.v : null;
  }
}

function indice(o, i, n) {
  if (!Number.isInteger(i)) throw new ErrorPB(t("el índice va con un número entero"), n);
  const j = i < 0 ? o.length + i : i;
  if (j < 0 || j >= o.length) throw new ErrorPB(t("el índice {i} se sale (hay {n})", { i, n: o.length }), n);
  return j;
}
function formato(v, fmt) {
  if (!fmt || typeof v !== "number") return repr(v);
  const m = /^\.?(\d*)([f%]?)$/.exec(fmt), d = m[1] === "" ? 6 : +m[1];
  return m[2] === "%" ? (v * 100).toFixed(d) + "%" : v.toFixed(d);
}
function binaria(o, a, b, n) {
  const esNum = (x) => typeof x === "number" || typeof x === "boolean";
  if (esNum(a) && esNum(b)) { a = +a; b = +b; }                    // como Python: True + 1 = 2
  const ta = tipoDe(a), tb = tipoDe(b), num = typeof a === "number" && typeof b === "number";
  const boolnum = (x) => (typeof x === "boolean" ? +x : x);
  if (o === "+") {
    if (num) return a + b;
    if (ta === "str" && tb === "str") return a + b;
    if (ta === "list" && tb === "list") return [...a, ...b];
    if (ta === "str" || tb === "str") throw new ErrorPB(t('no se puede sumar texto con {tipo}: usa str(x) o un f"…{x}…"', { tipo: ta === "str" ? tb : ta }), n);
  }
  if (o === "*") {
    if (num) return a * b;
    if (ta === "str" && Number.isInteger(b)) return a.repeat(Math.max(0, b));
    if (ta === "list" && Number.isInteger(b)) return Array.from({ length: Math.max(0, b) }, () => a).flat();
  }
  a = boolnum(a); b = boolnum(b);
  if (typeof a === "number" && typeof b === "number") {
    if ((o === "/" || o === "//" || o === "%") && b === 0) throw new ErrorPB(t("división por cero"), n);
    switch (o) {
      case "-": return a - b;
      case "/": return a / b;
      case "//": return Math.floor(a / b);
      case "%": return ((a % b) + b) % b;
      case "**": return a ** b;
    }
  }
  throw new ErrorPB(t("no se puede hacer {a} {o} {b} ({ta} {o} {tb})", { a: repr(a, true), o, b: repr(b, true), ta, tb }), n);
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
    else throw new ErrorPB(t('"in" va con un texto, una lista o un diccionario, no con un {tipo}', { tipo: tipoDe(b) }), n);
    return o === "in" ? r : !r;
  }
  const ok = (typeof a === "number" && typeof b === "number") || (typeof a === "string" && typeof b === "string");
  if (!ok) throw new ErrorPB(t("no se puede comparar {a} {o} {b}{extra}", { a: tipoDe(a), o, b: tipoDe(b), extra: a === null || b === null ? t(" (¿todavía no hay datos? revisa que no sea None)") : "" }), n);
  return o === "<" ? a < b : o === "<=" ? a <= b : o === ">" ? a > b : a >= b;
}
function metodo(o, nombre, n) {
  const f = (fn) => Object.assign((args) => fn(...args), { nombre });
  if (Array.isArray(o)) {
    const M = { append: (x) => { o.push(x); }, pop: (i = -1) => { if (!o.length) throw new ErrorPB(t("pop() de una lista vacía"), n); return o.splice(indice(o, i, n), 1)[0]; }, count: (x) => o.filter((y) => igual(x, y)).length, index: (x) => { const i = o.findIndex((y) => igual(x, y)); if (i < 0) throw new ErrorPB(t("{x} no está en la lista", { x: repr(x, true) }), n); return i; } };
    if (M[nombre]) return f(M[nombre]);
  } else if (typeof o === "string") {
    const M = { upper: () => o.toUpperCase(), lower: () => o.toLowerCase(), strip: () => o.trim(), startswith: (x) => o.startsWith(x), endswith: (x) => o.endsWith(x), replace: (a, b) => o.split(a).join(b), split: (s) => (s === undefined ? o.trim().split(/\s+/) : o.split(s)) };
    if (M[nombre]) return f(M[nombre]);
  } else {
    const M = { get: (k, d = null) => (String(k) in o ? o[String(k)] : d), keys: () => Object.keys(o), values: () => Object.values(o), items: () => Object.entries(o) };
    if (M[nombre]) return f(M[nombre]);
  }
  throw new ErrorPB(t('un {tipo} no tiene "{nombre}"', { tipo: tipoDe(o), nombre }), n);
}
function sugerir(x, opciones) {
  const d = (a, b) => { const m = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j++) m[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return m[a.length][b.length]; };
  const best = opciones.map((o) => [o, d(x, o)]).sort((a, b) => a[1] - b[1])[0];
  return best && best[1] <= Math.max(1, Math.floor(x.length / 3)) ? t(' (¿quisiste decir "{x}"?)', { x: best[0] }) : "";
}
/** min() y max(): de varios valores o de una lista (vacía = error, como Python); key= como sorted. */
function extremo(a, k, n, cual, I) {
  const xs = a.length === 1 && Array.isArray(a[0]) ? a[0] : a;
  if (!xs.length) throw new ErrorPB(t("{f}() de una lista vacía", { f: cual }), n);
  const clave = k?.key && I ? (x) => I.invocar(k.key, [x], [], n) : (x) => x;
  let mejor = xs[0], cm = clave(mejor);
  for (const x of xs.slice(1)) { const c = clave(x); if (comparar(cual === "min" ? "<" : ">", c, cm, n)) { mejor = x; cm = c; } }
  return mejor;
}
const num = (x, nombre, n) => { if (typeof x !== "number") throw new ErrorPB(t("{f}() necesita un número y le diste {tipo}", { f: nombre, tipo: tipoDe(x) }), n); return x; };

/** Lo básico de Python. La salida de print la decide quien corre el programa (builtins.print). */
const BASICOS = {
  print: (a, k) => { BASICOS._salida(a.map((x) => repr(x)).join(k.sep ?? " ")); },
  _salida: () => {},
  str: ([x]) => repr(x),
  int: ([x], _, n) => { const v = typeof x === "string" ? parseFloat(x) : x; if (typeof v !== "number" || Number.isNaN(v)) throw new ErrorPB(t("int() no entiende {x}", { x: repr(x, true) }), n); return Math.trunc(v); },
  float: ([x], _, n) => { const v = typeof x === "string" ? parseFloat(x) : x; if (typeof v !== "number" || Number.isNaN(v)) throw new ErrorPB(t("float() no entiende {x}", { x: repr(x, true) }), n); return v; },
  round: ([x, d = 0], _, n) => {                                  // como Python: los .5 van al par (round(2.5) = 2)
    num(x, "round", n);
    const k = 10 ** d, y = x * k, r = Math.round(y);
    return (Math.abs(y % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r) / k;
  },
  abs: ([x], _, n) => Math.abs(num(x, "abs", n)),
  min: (a, k, n, I) => extremo(a, k, n, "min", I),
  max: (a, k, n, I) => extremo(a, k, n, "max", I),
  sorted: ([xs], k, n, I) => {
    if (!Array.isArray(xs) && typeof xs !== "string") throw new ErrorPB(t("sorted() va con una lista"), n);
    const clave = k.key ? (x) => I.invocar(k.key, [x], [], n) : (x) => x;
    const out = [...xs].map((x) => [clave(x), x]).sort((p, q) => (comparar("<", p[0], q[0], n) ? -1 : comparar("<", q[0], p[0], n) ? 1 : 0)).map((p) => p[1]);
    return k.reverse ? out.reverse() : out;
  },
  reversed: ([xs], _, n) => { if (!Array.isArray(xs) && typeof xs !== "string") throw new ErrorPB(t("reversed() va con una lista"), n); return [...xs].reverse(); },
  enumerate: ([xs, ini = 0]) => [...(typeof xs === "string" ? [...xs] : xs)].map((x, i) => [i + ini, x]),
  zip: (a) => { const L = Math.min(...a.map((x) => x.length)); return Array.from({ length: a.length ? L : 0 }, (_, i) => a.map((x) => x[i])); },
  any: ([xs]) => xs.some((x) => verdad(x)),
  all: ([xs]) => xs.every((x) => verdad(x)),
  sum: ([xs]) => xs.reduce((s, x) => s + x, 0),
  len: ([x], _, n) => { if (typeof x === "string" || Array.isArray(x)) return x.length; if (tipoDe(x) === "dict") return Object.keys(x).length; throw new ErrorPB(t("len() de un {tipo}", { tipo: tipoDe(x) }), n); },
  range: (a, _, n) => {
    const [ini, fin, paso] = a.length === 1 ? [0, a[0], 1] : [a[0], a[1], a[2] ?? 1];
    if (![ini, fin, paso].every(Number.isInteger) || paso === 0) throw new ErrorPB(t("range() va con enteros"), n);
    const out = [];
    for (let i = ini; paso > 0 ? i < fin : i > fin; i += paso) { out.push(i); if (out.length > 100000) throw new ErrorPB(t("range() demasiado largo"), n); }
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
  const salida = (txt) => (host.print || (() => {}))(txt);
  const nomTipo = (x) => (x === "castigo" ? t("castigo") : t("premio"));
  const alias = data.alias_premios || {};
  const tipos = data.tiposPremio || {};
  const nombresDe = (tipo) => [...data.premiosValidos.filter((k) => (tipos[k] || "premio") === tipo), ...Object.keys(alias).filter((a) => (tipos[alias[a]] || "premio") === tipo)];
  /** El nombre del premio/castigo para el entrenador; premios() no acepta castigos ni al revés. */
  const misEsDe = Object.fromEntries(Object.entries(data.alias_en?.misiones || {}).map(([es, en]) => [en, es]));
  const RANURA_ES = { motors: "motores", props: "helices", batteries: "baterias", frames: "chasis", cameras: "camaras", radios: "radios", escs: "escs", flight_controllers: "controladoras", extras: "extras" };
  const premioKey = (k, n, tipo) => {
    const kk = alias[k] || k, fn = tipo === "castigo" ? "castigos" : "premios";
    if (!data.premiosValidos.includes(kk)) throw new ErrorPB(t('no hay un {tipo} "{k}"{sug}. Mira ayuda("{fn}")', { tipo: nomTipo(tipo), k, sug: sugerir(k, nombresDe(tipo)), fn }), n);
    const real = tipos[kk] || "premio";
    if (real !== tipo) throw new ErrorPB(t('"{k}" es un {real}: va en {fn2}({k}=…), no en {fn}()', { k, real: nomTipo(real), fn2: real === "castigo" ? "castigos" : "premios", fn }), n);
    return kk;
  };
  const soloArriba = (nombre, n) => { if (fase !== "arriba") throw new ErrorPB(t("{f}() va arriba del archivo, no dentro de una función (no se puede cambiar mientras entrena)", { f: nombre }), n); };
  const unaVez = (k, n) => { if (cfg.lineas[k]) throw new ErrorPB(t("{f}() ya lo pusiste en la línea {n}", { f: k, n: cfg.lineas[k] }), n); cfg.lineas[k] = n; };
  const texto = (x, nombre, n) => { if (typeof x !== "string") throw new ErrorPB(t("{f}() va con un texto entre comillas", { f: nombre }), n); return x; };
  const rango = (x, a, b, nombre, n) => { num(x, nombre, n); if (x < a || x > b) throw new ErrorPB(t("{f}: {x} está fuera de {a} a {b}", { f: nombre, x, a, b }), n); return x; };
  const acciones = [];
  const accion = (a) => { acciones.push(a); };
  /** premios(…) y castigos(…): lo mismo para el entrenador (un diccionario de valores), cada uno con sus nombres. */
  const valores = (tipo, a, k, n) => {
    const fn = tipo === "castigo" ? "castigos" : "premios", ej = tipo === "castigo" ? "castigos(chocar=15, sacudidas=1)" : "premios(grabar=4, mirar=2)";
    if (a.length === 1 && tipoDe(a[0]) === "dict") k = { ...a[0], ...k };
    else if (a.length) throw new ErrorPB(t("{ej}: cada {tipo} con su nombre", { ej, tipo: nomTipo(tipo) }), n);
    if (!Object.keys(k).length) throw new ErrorPB(t("{fn}() necesita al menos uno, por ejemplo {ej}", { fn, ej }), n);
    const c = {};
    for (const [kk, v] of Object.entries(k)) {
      const key = premioKey(kk, n, tipo);                    // primero: ¿existe y es de este tipo? (el error más útil)
      num(v, fn, n);
      if (v < 0 || v > 10) throw new ErrorPB(t("{k}={v}: los {fn} van de 0 a 10 (0 = apagado, 4 = lo normal, 10 = al máximo)", { k: kk, v: repr(v), fn }), n);
      c[key] = realDe(key, v, data.escala);                 // el entrenador recibe el valor real
    }
    if (fase === "arriba") Object.assign(cfg.premios, c);
    else { cfg.premiosVivos = { ...(cfg.premiosVivos || cfg.premiosFinal || {}), ...c }; accion({ [fn]: c }); host.ajustar?.({ premios: cfg.premiosVivos }); }
  };

  const B = {
    print: (a, k) => salida(a.map((x) => repr(x)).join(k.sep ?? " ")),
    avisar: ([x]) => { if (host.avisar) host.avisar(repr(x)); salida("📣 " + repr(x)); if (fase !== "arriba") accion({ avisar: repr(x) }); },
    modelo: ([nombre], k, n) => {
      soloArriba("modelo", n); unaVez("modelo", n);
      texto(nombre, "modelo", n);
      const slug = nombre.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
      if (!slug || slug === "base" || slug.startsWith("_")) throw new ErrorPB(t('"{nombre}" no sirve como nombre de modelo (usa letras y números; "base" es el de la campaña)', { nombre }), n);
      cfg.modelo = slug; cfg.nombre = nombre;
      const desde = k.desde ?? "base";
      texto(desde, "modelo(desde=…)", n);
      cfg.desde = desde === "base" || desde === "cero" ? desde : desde.toLowerCase();
    },
    red: (a, k, n) => {
      soloArriba("red", n); unaVez("red", n);
      const capas = k.capas ?? a[0];
      if (!Array.isArray(capas) || capas.length < 1 || capas.length > 4) throw new ErrorPB(t("red(capas=[64, 64]): de 1 a 4 capas"), n);
      capas.forEach((c) => { if (!Number.isInteger(c) || c < 8 || c > 512) throw new ErrorPB(t("cada capa tiene de 8 a 512 neuronas (pusiste {x})", { x: repr(c, true) }), n); });
      cfg.capas = capas;
    },
    mision: ([id], _, n) => {
      soloArriba("mision", n); unaVez("mision", n);
      texto(id, "mision", n);
      const m = data.misiones.find((x) => x.id === id);
      if (!m) throw new ErrorPB(t('no hay una misión "{id}". Hay: {lista}', { id, lista: data.misiones.map((x) => x.id).join(", ") }), n);
      cfg.mision = id; cfg.nivel = m.nivel;
      if (cfg.viento === undefined && m.viento) cfg.vientoMision = m.viento;
      return objMision(id);                            // PBDMM 2: m = mision("grabar") -> m.pide …
    },
    nivel: ([x], _, n) => {
      soloArriba("nivel", n); unaVez("mision", n);
      if (!Number.isInteger(x) || !data.niveles.includes(x)) throw new ErrorPB(t("nivel() va con un número de nivel del Drone Lab: {lista}", { lista: data.niveles.join(", ") }), n);
      cfg.nivel = x; cfg.mision = null;
    },
    dron: ([x], _, n) => {
      soloArriba("dron", n); unaVez("dron", n);
      texto(x, "dron", n);
      const low = x.toLowerCase();
      if (low === "estandar" || low === "estándar") { cfg.dron = "ESTANDAR"; return null; }
      if (low === "azar") { cfg.dron = "AZAR"; return null; }
      const d = (data.drones || []).find((y) => y.toLowerCase() === low);
      if (!d) throw new ErrorPB(t('no tienes un dron "{x}" en el hangar. Usa "estandar", "azar"{tuyos}', { x, tuyos: data.drones?.length ? t(" o uno tuyo: {lista}", { lista: data.drones.map((y) => `"${y}"`).join(", ") }) : "" }), n);
      cfg.dron = { hangar: d };
      return objDron(d);                               // PBDMM 2: d = dron("Cine (dev)") -> d.empuje_peso …
    },
    drones: ([x], _, n) => { soloArriba("drones", n); unaVez("drones", n); if (!Number.isInteger(x)) throw new ErrorPB(t("drones() va con un número entero"), n); cfg.drones = rango(x, 1, 200, "drones", n); },
    entrenar_en: ([x], _, n) => {
      soloArriba("entrenar_en", n); unaVez("entrenar_en", n);
      texto(x, "entrenar_en", n);
      const v = { fondo: "fondo", "segundo plano": "fondo", blender: "blender" }[x.toLowerCase()];
      if (!v) throw new ErrorPB(t('entrenar_en("fondo") o entrenar_en("blender")'), n);
      cfg.donde = v;
    },
    velocidad: ([x], _, n) => {
      texto(x, "velocidad", n);
      if (!["rapido", "real"].includes(x)) throw new ErrorPB(t('velocidad("rapido") o velocidad("real") (real = lo ves en Blender a velocidad normal)'), n);
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
      if (a.length) throw new ErrorPB(t("aprendizaje(lr=0.0003, exploracion=0.0): con nombre"), n);
      if (!Object.keys(c).length) throw new ErrorPB(t("aprendizaje() necesita lr=… o exploracion=…"), n);
      if (fase === "arriba") Object.assign(cfg, c); else { accion(c); host.ajustar?.(c); }
    },
    premios: (a, k, n) => valores("premio", a, k, n),
    castigos: (a, k, n) => valores("castigo", a, k, n),
    pausar: (_, __, n) => { if (fase === "arriba") throw new ErrorPB(t("pausar() va dentro de una función (por ejemplo cada_generacion)"), n); accion({ pausar: true }); host.pausar?.(); },
    seguir: (_, __, n) => { if (fase === "arriba") throw new ErrorPB(t("seguir() va dentro de una función"), n); accion({ seguir: true }); host.seguir?.(); },
    detener: (_, __, n) => { if (fase === "arriba") throw new ErrorPB(t("detener() va dentro de una función (por ejemplo: if e.exito > 0.9: detener())"), n); accion({ detener: true }); host.detener?.(); },
    guardar: (_, __, n) => { if (fase === "arriba") throw new ErrorPB(t("guardar() va dentro de una función"), n); accion({ guardar: true }); host.guardar?.(); },
  };
  // ---------------- PBDMM 2: leer el juego (docs/PBDMM2_PLAN.md) ----------------
  // data.hangar = [{nombre, proposito, listo, modelo, st (stats de parts.js) | null, piezas: {ranura: nombre}, extras: [nombres]}]
  // data.misionInfo = {id: {para, requisitos, ctx: {segundos, viento, alcance}}} · data.inventario = [{nombre, ranura, vida, precio, en}]
  const hangarDe = (x, n) => {
    const nom = typeof x === "string" ? x : x?.nombre;
    const h = (data.hangar || []).find((y) => y.nombre.toLowerCase() === String(nom).toLowerCase());
    if (!h) throw new ErrorPB(t('no tienes un dron "{x}" en el hangar{tuyos}', { x: nom, tuyos: data.hangar?.length ? t(" o uno tuyo: {lista}", { lista: data.hangar.map((y) => `"${y.nombre}"`).join(", ") }) : "" }), n);
    return h;
  };
  function objDron(nombre) {
    const h = (data.hangar || []).find((y) => y.nombre === nombre);
    if (!h) return bi({ nombre, armado: false });                 // el compilador sin datos del hangar (pruebas): solo el nombre
    const st = h.st, pz = h.piezas || {}, ay = st?.ayudas || [];
    if (!st) {                                         // sin piezas todavía: los mismos campos, en None (el programa no se rompe)
      const nada = { peso: null, peso_g: null, empuje_peso: null, vel_max: null, minutos: null, bateria: bi({ nombre: pz.bateria || null, minutos: null }),
        motores: pz.motores || null, helices: pz.helices || null, esc: pz.esc || null, controladora: pz.controladora || null, chasis: pz.chasis || null,
        radio: bi({ nombre: pz.radio || null, alcance_m: null }), camara: bi({ nombre: pz.camara || null, calidad: null, gimbal: false }),
        sensores: [], barometro: false, tof: false, protectores: false, extras: [...(h.extras || [])], vibracion: null, nitidez: null, precio: null };
      return bi({ nombre: h.nombre, proposito: h.proposito || "", armado: false, listo: false, ia: h.modelo || null, ...nada });
    }
    const r2 = (x, d = 2) => Math.round(x * 10 ** d) / 10 ** d;
    const sensores = [...(ay.includes("altura") ? ["barometro"] : []), ...(ay.includes("frenar") ? ["gps"] : []), ...(ay.includes("sensores") ? ["tof"] : []), ...(ay.includes("ia") ? ["chip_ia"] : [])];
    return bi({
      nombre: h.nombre, proposito: h.proposito || "", armado: true, listo: !!h.listo, ia: h.modelo || null,
      peso: r2(st.mass, 3), peso_g: Math.round(st.masa_g), empuje_peso: r2(st.twr), vel_max: r2(st.velMax, 1), minutos: r2(st.minutos, 1),
      bateria: bi({ nombre: pz.bateria || null, minutos: r2(st.minutos, 1) }), motores: pz.motores || null, helices: pz.helices || null,
      esc: pz.esc || null, controladora: pz.controladora || null, chasis: pz.chasis || null,
      radio: bi({ nombre: pz.radio || null, alcance_m: st.alcance_m }), camara: bi({ nombre: pz.camara || null, calidad: st.calidad, gimbal: !!st.gimbal }),
      sensores, barometro: ay.includes("altura"), tof: ay.includes("sensores"), protectores: ay.includes("protectores"),
      extras: [...(h.extras || [])], vibracion: r2(st.vibracion), nitidez: r2(st.nitidez), precio: st.precio,
    });
  }
  /** Lo que pide una misión, con nombres que se leen (requisitos.js usa los de misiones.json). Un diccionario (con .get). */
  function pideDe(id) {
    const I = data.misionInfo?.[id];
    if (!I) return {};
    const r = I.requisitos || {}, c = I.ctx || {}, out = {};
    if (r.twr_min) out.empuje_peso_min = r.twr_min;
    if (r.barometro) out.barometro = true;
    if (r.protectores) out.protectores = true;
    if (r.calidad_min) out.camara_min = r.calidad_min;
    if (r.sensores) out.tof = true;
    if (c.alcance !== undefined) out.alcance_m = Math.round(c.alcance);
    if (c.segundos !== undefined) out.minutos = Math.round(minutosNecesarios(c.segundos, c.viento ?? 0) * 10) / 10;
    return idioma() === "en" ? Object.fromEntries(Object.entries(out).map(([k, v]) => [BI_EN[k] || k, v])) : out;
  }
  function objMision(id) {
    const m = data.misiones.find((x) => x.id === id);
    const prem = Object.fromEntries(Object.entries(m.premios || {}).map(([k, v]) => [Object.entries(alias).find(([, kk]) => kk === k)?.[0] || k, nivelDe(k, v, data.escala)]));
    return bi({ id, nombre: m.nombre, nivel: m.nivel, viento: m.viento ?? 0, para: data.misionInfo?.[id]?.para || m.para || "", pide: pideDe(id), premios: Object.freeze(prem) });
  }
  function objModelo(x, n) {
    const slug = String(typeof x === "string" ? x : x?.nombre).toLowerCase();
    const m = (data.modelos || []).find((y) => y.slug === slug);
    if (!m) throw new ErrorPB(t('no hay un modelo "{m}"{sug}', { m: slug, sug: sugerir(slug, (data.modelos || []).map((y) => y.slug)) }), n);
    const pct = (v) => (typeof v === "number" ? Math.round(v * 1000) / 1000 : null);
    return bi({ nombre: m.slug, generacion: m.gen ?? 0, red: m.red || null, exito: pct(m.ultimo?.[2]), choque: pct(m.ultimo?.[3]), mejor_exito: pct(m.mejor_exito),
      entrenando: !!m.entrenando, donde: m.donde || null, desde: m.base_de || null, guardado: !!m.tiene_modelo });
  }
  /** revisar(d, m): el dron contra lo que pide la misión. Devuelve las líneas [icono, texto] y un objeto {ok, errores, avisos}. */
  function revision(dNombre, mId, n) {
    const h = hangarDe(dNombre, n), I = data.misionInfo?.[mId];
    if (!I) return { lineas: [["ℹ️", t("la misión \"{m}\" no pide nada especial al dron", { m: mId })]], ok: true, errores: [], avisos: [] };
    if (!h.st) return { lineas: [["❌", t('"{d}" no está armado: le faltan piezas', { d: h.nombre })]], ok: false, errores: [t("le faltan piezas")], avisos: [], armado: false };
    const c = cumple(I.requisitos || {}, h.st, I.ctx || {});
    const lineas = c.lineas.map(([cl, txt]) => [cl === "no" ? "❌" : cl === "meh" ? "⚠️" : "✅", txt]);
    if (I.requisitos?.sensores && !(h.st.ayudas || []).includes("sensores")) lineas.push(["❌", t("Falta: sensores ToF (la IA ve los postes con los 10 sensores de distancia)")]);
    else if (I.requisitos?.sensores) lineas.push(["✅", t("Sensores ToF: ve los postes")]);
    if (!h.listo) lineas.push(["⚠️", t("Todavía no está terminado en el banco (para entrenar basta su física; para volarlo, termínalo)")]);
    const errores = lineas.filter((x) => x[0] === "❌").map((x) => x[1]), avisos = lineas.filter((x) => x[0] === "⚠️").map((x) => x[1]);
    return { lineas, ok: !errores.length, errores, avisos };
  }
  /** Un objeto del juego -> unas líneas para la terminal (ficha). */
  function fichaDe(o) {
    const v = (x) => (x === true ? "✓" : x === false ? "✗" : x === null || x === undefined ? "—" : Array.isArray(x) ? (x.length ? x.join(", ") : "—") : x?.__pb_obj ? Object.entries(x).filter(([kk]) => kk !== "__pb_obj").map(([kk, y]) => `${kk} ${v(y)}`).join(" · ") : repr(x));
    const filas = Object.entries(o).filter(([kk]) => kk !== "__pb_obj");
    const w = Math.max(...filas.map(([kk]) => kk.length));
    return filas.map(([kk, x]) => `  ${kk.padEnd(w)}  ${v(x)}`);
  }
  const colorDe = { verde: "verde", green: "verde", rojo: "rojo", red: "rojo", amarillo: "amarillo", yellow: "amarillo", azul: "azul", blue: "azul", gris: "gris", gray: "gris", grey: "gris" };
  Object.assign(B, {
    dron_info: ([x], _, n) => objDron(hangarDe(x, n).nombre),
    mision_info: ([id], _, n) => {
      texto(id, "mision_info", n);
      const mm = data.misiones.find((y) => y.id === (misEsDe[id] || id));
      if (!mm) throw new ErrorPB(t('no hay una misión "{id}". Hay: {lista}', { id, lista: data.misiones.map((y) => y.id).join(", ") }), n);
      return objMision(mm.id);
    },
    modelo_info: ([x], _, n) => objModelo(x, n),
    hangar: () => (data.hangar || []).map((h) => objDron(h.nombre)),
    inventario: ([ranura]) => (data.inventario || []).filter((u) => !ranura || u.ranura === ranura || u.ranura === (RANURA_ES[ranura] || ranura))
      .map((u) => bi({ nombre: u.nombre, ranura: u.ranura, vida: u.vida, precio: u.precio, en: u.en || null })),
    revisar: ([d, m], _, n) => {
      const dn = d?.__pb_obj ? d.nombre : d, mid = m?.__pb_obj ? m.id : misEsDe[m] || m;
      if (typeof dn !== "string" || typeof mid !== "string") throw new ErrorPB(t("revisar(d, m): un dron (o su nombre) y una misión (o su id)"), n);
      const R = revision(dn, mid, n);
      salida(t("Revisión: {d} para {m}", { d: dn, m: mid }));
      R.lineas.forEach(([ic, txt]) => salida(`  ${ic} ${txt}`));
      return bi({ ok: R.ok, errores: R.errores, avisos: R.avisos });
    },
    ficha: ([x], _, n) => {
      let o = x;
      if (typeof x === "string") {
        if ((data.hangar || []).some((h) => h.nombre.toLowerCase() === x.toLowerCase())) o = objDron(hangarDe(x, n).nombre);
        else if (data.misiones.some((m) => m.id === (misEsDe[x] || x))) o = objMision(misEsDe[x] || x);
        else if ((data.modelos || []).some((m) => m.slug === x.toLowerCase())) o = objModelo(x, n);
        else throw new ErrorPB(t('ficha("…"): no hay un dron, una misión ni un modelo que se llame "{x}"', { x }), n);
      }
      if (!o?.__pb_obj && tipoDe(o) !== "dict") throw new ErrorPB(t("ficha() va con un dron, una misión, un modelo o su nombre"), n);
      salida(`── ${o.nombre ?? o.id ?? ""} ──`);
      fichaDe(o).forEach((l) => salida(l));
    },
    tabla: (a, _, n) => {
      const [filas, ...cols] = a;
      if (!Array.isArray(filas)) throw new ErrorPB(t("tabla(filas, \"col1\", \"col2\"…): filas es una lista (por ejemplo hangar())"), n);
      if (!filas.length) { salida(t("(tabla vacía)")); return; }
      const f0 = filas[0], cs = cols.length ? cols : Array.isArray(f0) ? f0.map((_, i) => String(i)) : Object.keys(f0).filter((k) => k !== "__pb_obj" && !(f0[k]?.__pb_obj));
      const leerCol = (o, c) => c.split(".").reduce((x, k) => (x == null ? null : Array.isArray(x) ? x[+k] : x[k]), o);
      const celda = (x) => (typeof x === "number" && !Number.isInteger(x) ? String(Math.round(x * 100) / 100) : x === null || x === undefined ? "—" : x === true ? "✓" : x === false ? "✗" : repr(x));
      const M = [cs, ...filas.map((o) => cs.map((c) => celda(leerCol(o, c))))];
      const w = cs.map((_, i) => Math.max(...M.map((r) => String(r[i]).length)));
      M.forEach((r, j) => { salida(r.map((x, i) => String(x).padEnd(w[i])).join("  ")); if (j === 0) salida(w.map((x) => "─".repeat(x)).join("  ")); });
    },
    barra: ([x, ancho = 20], _, n) => {
      if (x === null || x === undefined) return "░".repeat(ancho) + " —";
      num(x, "barra", n);
      const v = Math.max(0, Math.min(1, x)), ll = Math.round(v * ancho);
      return "█".repeat(ll) + "░".repeat(ancho - ll) + ` ${Math.round(v * 100)} %`;
    },
    color: ([c, x], _, n) => {
      const k = colorDe[String(c).toLowerCase()];
      if (!k) throw new ErrorPB(t('color("verde", texto): verde, rojo, amarillo, azul o gris'), n);
      return `\u0001${k}\u0002${typeof x === "string" ? x : repr(x)}\u0003`;
    },
    explicar: ([tema], _, n) => {
      const E = data.explicar || {};
      if (tema === undefined) { salida(t("Temas: {lista}", { lista: Object.keys(E).join(", ") })); return; }
      const k = Object.keys(E).find((x) => x === String(tema).toLowerCase() || E[x].en === String(tema).toLowerCase());
      const pk = alias[String(tema).toLowerCase()] || String(tema).toLowerCase(), pr = data.premiosInfo?.[pk];
      if (!k && pr) {                                   // un premio o castigo: su nombre, qué paga o cobra y su nombre en PBDMM
        const es = Object.keys(alias).find((a) => alias[a] === pk);
        salida(`📘 ${pr.nombre} (${es ? `${es} / ` : ""}${pk}) · ${nomTipo(pr.tipo)}: ${pr.desc}` + (cfg.premios[pk] !== undefined ? "  " + t("(ahora: {v})", { v: cfg.premios[pk] }) : ""));
        return;
      }
      if (!k) throw new ErrorPB(t('no tengo una explicación de "{x}". Temas: {lista}', { x: tema, lista: Object.keys(E).join(", ") }), n);
      const ahora = { lr: cfg.lr, exploracion: cfg.ent, drones: cfg.drones, capas: cfg.capas?.join("×"), red: cfg.capas?.join("×"), viento: cfg.viento ?? cfg.vientoMision, desde: cfg.desde, mision: cfg.mision, dron: typeof cfg.dron === "object" ? cfg.dron.hangar : cfg.dron }[k];
      salida(`📘 ${k}: ${E[k].txt}` + (ahora !== undefined && ahora !== null ? "  " + t("(ahora: {v})", { v: ahora }) : ""));
    },
    narrar: ([cada], k, n) => {
      soloArriba("narrar", n); unaVez("narrar", n);
      const c = cada ?? k.cada ?? 5;
      if (!Number.isInteger(c) || c < 1 || c > 100) throw new ErrorPB(t("narrar(cada=5): cada cuántas generaciones, de 1 a 100"), n);
      cfg.narrar = c;
    },
  });
  // PBDMM bilingüe: cada función también con su nombre en inglés (model, mission, rewards…), y los argumentos y valores
  // en inglés (start_from="zero", train_on("background"), mission("film")…) se pasan al español antes de usarse.
  const AL = data.alias_en || {};
  const kwEs = Object.fromEntries(Object.entries(AL.kwargs || {}).map(([es, en]) => [en, es]));
  const valEs = Object.fromEntries(Object.entries(AL.valores || {}).map(([es, en]) => [en, es]));
  const misEs = Object.fromEntries(Object.entries(AL.misiones || {}).map(([es, en]) => [en, es]));
  const VALOR_DE = { mision: misEs, dron: valEs, entrenar_en: valEs, velocidad: valEs };
  for (const [es, en] of Object.entries(AL.funciones || {})) {
    const f = B[es];
    if (!f) continue;
    const g = (a, k, n) => {
      if (es !== "premios" && es !== "castigos") {           // los premios ya aceptan sus nombres en inglés
        k = Object.fromEntries(Object.entries(k).map(([kk, v]) => {
          const ke = kwEs[kk] || kk;
          return [ke, ke === "desde" && typeof v === "string" && valEs[v] ? valEs[v] : v];
        }));
      }
      const m = VALOR_DE[es];
      if (m) a = a.map((v) => (typeof v === "string" && m[v.toLowerCase()] ? m[v.toLowerCase()] : v));
      return f(a, k, n);
    };
    B[es] = g;
    if (en !== es) B[en] = g;
  }
  const hookEn = AL.hooks || {};

  const interp = new Interprete(B);
  try { interp.correr(arbol); } catch (err) { throw enIdioma(err, AL); }
  fase = "corriendo";

  // valida y completa (los errores, con los nombres del idioma del juego)
  try { validar(); } catch (err) { throw enIdioma(err, AL); }
  function validar() {
  if (!cfg.modelo) throw new ErrorPB(t('falta modelo("nombre"): cada programa entrena UN modelo con nombre'));
  if (cfg.nivel === undefined) throw new ErrorPB(t('falta mision("…") (o nivel(n)): qué tiene que aprender. Mira ayuda("mision")'));
  cfg.donde = cfg.donde || "fondo";
  cfg.drones = cfg.drones || 50;
  cfg.dron = cfg.dron || "ESTANDAR";
  cfg.velocidad = cfg.velocidad || (cfg.donde === "blender" ? "real" : "rapido");
  if (cfg.viento === undefined && cfg.vientoMision !== undefined) cfg.viento = cfg.vientoMision;
  delete cfg.vientoMision;
  // desde="otro": tiene que existir (si no, el servidor arrancaría con una red al azar sin avisar)
  if (data.modelos && cfg.desde !== "base" && cfg.desde !== "cero") {
    const src = data.modelos.find((m) => m.slug === cfg.desde);
    if (!src || !src.tiene_modelo) {
      const tuyos = data.modelos.filter((m) => m.slug !== "base" && m.tiene_modelo).map((m) => `"${m.slug}"`);
      throw new ErrorPB(t('no tienes un modelo "{m}" guardado para empezar desde él{sug}. {tuyos} (o "base" / "cero")', { m: cfg.desde, sug: sugerir(cfg.desde, data.modelos.map((m) => m.slug)), tuyos: tuyos.length ? t("Tus modelos: {lista}", { lista: tuyos.join(", ") }) : t("Todavía no tienes modelos propios") }), cfg.lineas.modelo);
    }
    if (cfg.desde === cfg.modelo) throw new ErrorPB(t("un modelo no puede empezar desde sí mismo"), cfg.lineas.modelo);
  }
  const yaExiste = data.modelos?.find((m) => m.slug === cfg.modelo && m.tiene_modelo);
  cfg.yaExiste = yaExiste ? { gen: yaExiste.gen ?? 0 } : null;           // entonces desde= no cuenta: sigue el suyo
  if (cfg.capas && cfg.desde !== "cero") throw new ErrorPB(t('red(capas=…) solo sirve con modelo(…, desde="cero"): una red que ya existe no cambia de tamaño'), cfg.lineas.red);
  if (cfg.donde === "fondo" && cfg.modelo === "base") throw new ErrorPB(t("el modelo base solo se entrena en Blender"));
  }
  // PBDMM 2: si el programa eligió un dron del hangar, se revisa contra lo que pide la misión (solo si hay dron(…))
  let revisionAuto = null;
  if (typeof cfg.dron === "object" && cfg.mision && data.hangar && data.misionInfo) {
    try { revisionAuto = revision(cfg.dron.hangar, cfg.mision, cfg.lineas.dron); } catch { revisionAuto = null; }
  }
  const premiosMision = cfg.mision ? data.misiones.find((x) => x.id === cfg.mision)?.premios || {} : {};
  cfg.premiosFinal = { ...premiosMision, ...cfg.premios };
  const nombresHook = data.hooks || ["al_empezar", "cada_generacion", "al_terminar"];
  // cada hook se puede escribir en español o en inglés (cada_generacion / every_generation)
  const hooks = nombresHook.filter((h) => interp.tiene(h) || interp.tiene(hookEn[h]));
  const todosHooks = nombresHook.flatMap((h) => [h, hookEn[h]].filter(Boolean));
  const desconocidas = [...interp.globales.entries()].filter(([k, v]) => v?.__pb_fn && !todosHooks.includes(k) && /^(al_|cada_|on_|every_)/.test(k)).map(([k]) => k);
  if (desconocidas.length) throw enIdioma(new ErrorPB(t('el juego no llama "{f}": las funciones especiales son {lista}', { f: desconocidas[0], lista: (idioma() === "en" ? nombresHook.map((h) => hookEn[h] || h) : nombresHook).join(", ") }), interp.globales.get(desconocidas[0]).n), AL);

  return {
    cfg, interp, hooks, revision: revisionAuto,
    /** El narrador (narrar(cada=5)): las líneas que tocan en esta generación (vacío si no toca). */
    narrar(e, ses) { return cfg.narrar ? narracion(e, cfg.narrar, ses) : []; },
    /** Llama un hook con e (objeto). Devuelve las acciones que pidió. */
    reaccionar(nombre, e) {
      acciones.length = 0;
      try {
        if (interp.tiene(nombre)) interp.llamar(nombre, [e]);
        else if (hookEn[nombre] && interp.tiene(hookEn[nombre])) interp.llamar(hookEn[nombre], [e]);
      } catch (err) { throw enIdioma(err, AL); }
      return [...acciones];
    },
  };
}

/**
 * Con el juego en inglés, un error nombra las funciones como en inglés (modelo( -> model(, desde= -> start_from=…).
 * El programa se puede escribir en cualquiera de los dos idiomas: esto es solo para el mensaje.
 */
function enIdioma(err, AL) {
  if (!(err instanceof ErrorPB) || idioma() !== "en" || !AL) return err;
  let m = err.message;
  for (const [es, en] of Object.entries(AL.funciones || {})) if (es !== en) m = m.replace(new RegExp(`\\b${es}\\(`, "g"), `${en}(`);
  for (const [es, en] of Object.entries(AL.kwargs || {})) m = m.replace(new RegExp(`\\b${es}=`, "g"), `${en}=`);
  for (const [es, en] of Object.entries(AL.hooks || {})) m = m.replace(new RegExp(`\\b${es}\\b`, "g"), en);
  for (const [es, en] of Object.entries(AL.premios || {})) m = m.replace(new RegExp(`\\b${es}=`, "g"), `${en}=`);
  err.message = m;
  return err;
}

// ---------------- PBDMM 2: objetos bilingües, el narrador y los diagnósticos ----------------
/** Los nombres en inglés de los campos de los objetos del juego (dron, misión, modelo, pieza, revisión). */
export const BI_EN = { nombre: "name", proposito: "purpose", armado: "built", listo: "ready", ia: "ai", peso: "weight", peso_g: "weight_g",
  empuje_peso: "thrust_weight", vel_max: "max_speed", minutos: "minutes", bateria: "battery", motores: "motors", helices: "props", esc: "esc",
  controladora: "flight_controller", chasis: "frame", radio: "radio", alcance_m: "range_m", camara: "camera", calidad: "quality", gimbal: "gimbal",
  sensores: "sensors", barometro: "barometer", tof: "tof", protectores: "guards", extras: "extras", vibracion: "vibration", nitidez: "sharpness",
  precio: "price", id: "id", nivel: "level", viento: "wind", para: "for", pide: "needs", premios: "rewards", empuje_peso_min: "min_thrust_weight",
  camara_min: "min_camera", generacion: "generation", red: "network", exito: "success", choque: "crash", mejor_exito: "best_success",
  entrenando: "training", donde: "where", desde: "start_from", guardado: "saved", ranura: "slot", vida: "life", en: "on", ok: "ok",
  errores: "errors", avisos: "warnings", premio: "reward" };
/** Un objeto para leer, con sus campos en los dos idiomas (se ven los del idioma del juego; los otros también funcionan). */
export function bi(campos) {
  const en = idioma() === "en", o = { __pb_obj: true };
  for (const [es, v] of Object.entries(campos)) {
    const e2 = BI_EN[es] || es, [vis, oculto] = en ? [e2, es] : [es, e2];
    o[vis] = v;
    if (oculto !== vis) Object.defineProperty(o, oculto, { value: v, enumerable: false });
  }
  return Object.freeze(o);
}

const prom = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const pctTxt = (x) => (typeof x === "number" ? `${Math.round(x * 100)} %` : "—");
const deltaTxt = (x) => (typeof x === "number" && Math.abs(x) >= 0.005 ? ` (${x >= 0 ? "+" : "−"}${Math.abs(Math.round(x * 100))})` : "");
/**
 * Lo que se nota en las últimas generaciones (reglas simples, con números: medir, no adivinar). ses.hx = historia de la
 * sesión [{gen, exito, choque, premio}]. Devuelve [{k, txt}].
 */
export function diagnosticar(hx) {
  const out = [], H = hx.filter((h) => typeof h.exito === "number");
  if (H.length < 10) return out;
  const u10 = H.slice(-10), a5 = u10.slice(0, 5), b5 = u10.slice(5), ex = (xs) => prom(xs.map((h) => h.exito));
  const pr = (xs) => prom(xs.filter((h) => typeof h.premio === "number").map((h) => h.premio));
  const subePremio = pr(b5) - pr(a5) > 0.1 * Math.abs(pr(a5)) + 0.05, subeExito = ex(b5) - ex(a5) > 0.02;
  if (subePremio && !subeExito) out.push({ k: "paga_mal", txt: t("El premio sube y el éxito no: le estás pagando por algo que no es la misión. Revisa premios() y castigos().") });
  const u20 = H.slice(-20), ult = H.at(-1).exito;
  if (u20.length >= 20 && Math.max(...u20.map((h) => h.exito)) - Math.min(...u20.map((h) => h.exito)) < 0.03 && ult < 0.9)
    out.push({ k: "estancado", txt: t("El éxito no se mueve hace 20 generaciones ({e}): se estancó. Prueba aprendizaje(exploracion=0.005) o cambia los premios.", { e: pctTxt(ult) }) });
  const mejor = Math.max(...H.map((h) => h.exito));
  if (mejor > 0.4 && mejor - ult > 0.25) out.push({ k: "olvida", txt: t("El éxito cayó de {a} a {b}: puede que el lr esté alto y esté olvidando. Prueba aprendizaje(lr=0.0001).", { a: pctTxt(mejor), b: pctTxt(ult) }) });
  const ch = prom(b5.filter((h) => typeof h.choque === "number").map((h) => h.choque));
  if (ch > 0.5 && ex(b5) < 0.1) out.push({ k: "choca", txt: t("Choca mucho ({c}) y casi no logra nada: castiga más el choque (castigos(chocar=8)) o empieza por una misión más fácil.", { c: pctTxt(ch) }) });
  return out;
}

/** El narrador (narrar(cada=5)): cada `cada` generaciones, cómo va en palabras; los diagnósticos nuevos, siempre. */
export function narracion(e, cada, ses = {}) {
  const out = [], hx = ses.hx || [], g = e.generaciones_sesion ?? 0;
  if (g > 0 && g % cada === 0) {
    const ant = hx.length > cada ? hx[hx.length - 1 - cada] : hx[0];
    const d = (k) => (ant && typeof e[k] === "number" && typeof ant[k] === "number" ? e[k] - ant[k] : null);
    out.push(t("Gen {g}: éxito {e}{de} · choque {c}{dc} · premio {p}", { g: e.generacion, e: pctTxt(e.exito), de: deltaTxt(d("exito")), c: pctTxt(e.choque), dc: deltaTxt(d("choque")), p: typeof e.premio === "number" ? Math.round(e.premio * 100) / 100 : "—" }));
    const de = d("exito"), dc = d("choque");
    if (de !== null && de > 0.03) out.push("  ↗ " + t("Aprende: en {n} generaciones el éxito subió {x} puntos.", { n: cada, x: Math.round(de * 100) }));
    else if (de !== null && de < -0.03) out.push("  ↘ " + t("Bajó {x} puntos en {n} generaciones: puede ser ruido (mira la gráfica) o que algo no le conviene.", { n: cada, x: Math.round(-de * 100) }));
    else out.push("  → " + t("Parejo: el éxito casi no cambió."));
    if (dc !== null && dc < -0.03) out.push("  ↘ " + t("Choca menos que antes."));
  }
  ses.diagVisto = ses.diagVisto || {};
  for (const x of e.diagnosticos_k || []) {
    if (ses.diagVisto[x.k] !== undefined && (e.generacion ?? 0) - ses.diagVisto[x.k] < 15) continue;
    ses.diagVisto[x.k] = e.generacion ?? 0;
    out.push("  💡 " + x.txt);
  }
  return out;
}

/** Los campos de e también en inglés (como "e" en data/pbdmm.json alias_en: la prueba revisa que coincidan). */
export const E_EN = { generacion: "generation", generaciones_sesion: "session_generations", exito: "success", choque: "crash",
  premio: "reward", calidad: "quality", mejor_exito: "best_success", historia_exito: "success_history", pasos: "steps",
  minutos: "minutes", nivel: "level", pausado: "paused", exploracion: "exploration", ruido: "noise", viento: "wind", premios: "rewards",
  cambio: "change", diagnosticos: "diagnostics" };

/**
 * Pasa un programa de un idioma al otro ("en" o "es"): nombres de funciones, argumentos, hooks, campos de e., nombres de
 * premios y los valores conocidos entre comillas. No toca comentarios ni otros textos. (comando translate / traducir)
 */
export function traducirCodigo(src, hacia, AL) {
  const par = (m) => (hacia === "en" ? m : Object.fromEntries(Object.entries(m || {}).map(([a, b]) => [b, a])));
  const fn = par(AL.funciones), kw = { ...par(AL.premios), ...par(AL.kwargs) }, hk = par(AL.hooks), ef = par(AL.e);
  const val = { ...par(AL.valores), ...par(AL.misiones) };
  const bf = par(BI_EN);
  let out = "", i = 0;
  const re = /(#[^\n]*)|([fF]?"(?:[^"\\\n]|\\.)*"|[fF]?'(?:[^'\\\n]|\\.)*')|([A-Za-z_][\w]*)/g;
  let m;
  while ((m = re.exec(src))) {
    out += src.slice(i, m.index);
    i = re.lastIndex;
    let x = m[0];
    if (m[2]) {
      const q = x.match(/^([fF]?)(["'])([\s\S]*)\2$/);
      if (q && !q[1] && val[q[3]]) x = q[2] + val[q[3]] + q[2];
      else if (q && q[1]) x = q[1] + q[2] + q[3].replace(/\{([^}]*)\}/g, (all, ex) => "{" + traducirCodigo(ex, hacia, AL) + "}") + q[2];
    } else if (m[3]) {
      const antes = src.slice(0, m.index), despues = src.slice(re.lastIndex);
      if (/\be\.[ \t]*$/.test(antes)) x = ef[x] || x;                     // e.exito -> e.success
      else if (/\.[ \t]*$/.test(antes)) x = bf[x] || x;                     // d.empuje_peso -> d.thrust_weight (sin \n: "fin de frase.\nmodelo(" no es un atributo)
      else if (/^\s*=(?!=)/.test(despues) && kw[x] && /[(,]\s*$/.test(antes)) x = kw[x];   // argumento con nombre: f(desde=…)
      else if (/^\s*\(/.test(despues) && fn[x]) x = fn[x];                  // una llamada
      else if (/\bdef\s+$/.test(antes) && hk[x]) x = hk[x];                  // def cada_generacion(
    }
    out += x;
  }
  return out + src.slice(i);
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
  const campos = {
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
  };
  // PBDMM 2: e.cambio (contra la generación anterior) y e.diagnosticos (lo que se nota: diagnosticar)
  ses.hx = ses.hx || [];
  const ant = ses.hx.at(-1);
  if (tr.gen !== undefined && (!ant || ant.gen !== tr.gen)) { ses.hx.push({ gen: tr.gen, exito: campos.exito, choque: campos.choque, premio: campos.premio }); if (ses.hx.length > 200) ses.hx.shift(); }
  const prev = ses.hx.length > 1 ? ses.hx.at(-2) : null;
  const dif = (k) => (prev && typeof campos[k] === "number" && typeof prev[k] === "number" ? Math.round((campos[k] - prev[k]) * 10000) / 10000 : null);
  campos.cambio = bi({ exito: dif("exito"), choque: dif("choque"), premio: dif("premio") });
  const dg = diagnosticar(ses.hx);
  campos.diagnosticos = dg.map((x) => x.txt);
  for (const [es, en] of Object.entries(E_EN)) campos[en] = campos[es];     // e.success = e.exito …
  const o = objeto(campos);
  return objetoConK(o, dg);
}
