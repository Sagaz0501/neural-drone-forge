// Pruebas del lenguaje PBDMM (app/pbdmm.js): node app/test_pbdmm.mjs
import { readFileSync } from "fs";
import { parsear, Interprete, compilar, pedidoDe, estadoE, ErrorPB, repr } from "./pbdmm.js";

const data = JSON.parse(readFileSync(new URL("./data/pbdmm.json", import.meta.url)));
const ent = JSON.parse(readFileSync(new URL("./data/entrenamiento.json", import.meta.url)));
const D = { ...data, misiones: ent.misiones, premiosValidos: ent.premios.map((p) => p.k).concat(["near"]), drones: ["Sagaz_Dron_V3"],
  tiposPremio: { ...Object.fromEntries(ent.premios.map((p) => [p.k, p.tipo])), near: "premio" }, escala: ent.escala_premios };
let fallas = 0;
const ok = (c, msg) => { console.log(`${c ? "ok  " : "MAL "}  ${msg}`); if (!c) fallas++; };
const salida = [];
const corre = (src) => { salida.length = 0; const I = new Interprete({ print: (a) => salida.push(a.map((x) => repr(x)).join(" ")) }); I.correr(parsear(src)); return I; };
const falla = (fn) => { try { fn(); return null; } catch (e) { return e instanceof ErrorPB ? e : (console.log(e), { message: "NO ES ErrorPB: " + e.message }); } };

// 1) Python básico
let I = corre("x = 2 + 3 * 4\ny = (2 + 3) * 4 ** 2 // 3\nz = -7 % 3\nprint(x, y, z)");
ok(salida[0] === "14 26 2", "aritmética como Python: " + salida[0]);
corre("t = 0\nfor i in range(5):\n    if i == 3:\n        continue\n    t += i\nprint(t)");
ok(salida[0] === "7", "for / range / continue / +=");
corre('def f(a, b=None):\n    if b is None:\n        return a * 2\n    return a + b\nprint(f(3), f(3, 4), f(a=1, b=1))');
ok(salida[0] === "6 7 2", "def / return / is None / argumentos con nombre: " + salida[0]);
corre('xs = [1, 2]\nxs.append(3)\nd = {"a": 1}\nd["b"] = 2\nprint(len(xs), xs[-1], d.get("b"), "a" in d, 5 not in xs, max(xs))');
ok(salida[0] === "3 3 2 True True 3", "listas, diccionarios, in: " + salida[0]);
corre('e = 0.8571\nprint(f"éxito {e:.0%} · {e:.2f} · {{llaves}}")');
ok(salida[0] === "éxito 86% · 0.86 · {llaves}", "f-strings con formato: " + salida[0]);
corre("n = 0\ndef sube():\n    global n\n    n += 1\nsube()\nsube()\nprint(n)");
ok(salida[0] === "2", "global");
corre("print(1 < 2 < 3 and not False or 0)");
ok(salida[0] === "True", "comparación encadenada and/or/not");

// 2) errores claros, con línea
let e = falla(() => corre("x = 1\nif x > 0\n    print(x)"));
ok(e?.linea === 2 && /":"/.test(e.message), "falta los dos puntos: " + e?.message);
e = falla(() => corre("x = 1\nprint(y)"));
ok(e?.linea === 2 && /no conozco "y"/.test(e.message), "variable que no existe: " + e?.message);
e = falla(() => corre("velocidad = 1\nprnt(velocidad)"));
ok(/quisiste decir "print"/.test(e?.message || ""), "sugiere el nombre parecido: " + e?.message);
e = falla(() => corre("while True:\n    pass"));
ok(/no tiene while/.test(e?.message || ""), "sin while: " + e?.message);
e = falla(() => corre("for i in range(10**6):\n    pass"));
ok(/demasiad/.test(e?.message || ""), "un for gigante no cuelga: " + e?.message);
e = falla(() => corre('print("a" + 1)'));
ok(/str\(x\)/.test(e?.message || ""), "texto + número explica qué hacer: " + e?.message);
e = falla(() => corre("if True:\n    x = 1\n  y = 2"));
ok(/sangría/.test(e?.message || ""), "sangría que no cuadra: " + e?.message);
e = falla(() => corre("import os"));
ok(/no importa/.test(e?.message || ""), "sin import");

// 3) compilar un programa de dron
const acciones = [];
const host = { print: (t) => acciones.push(["print", t]), ajustar: (c) => acciones.push(["ajustar", c]), detener: () => acciones.push(["detener"]), avisar: () => {} };
const P = compilar(data.ejemplos.curriculum, D, host);
ok(P.cfg.modelo === "aprendiz" && P.cfg.nivel === 12 && P.cfg.desde === "base" && P.cfg.donde === "fondo", "el ejemplo curriculum compila: " + JSON.stringify({ m: P.cfg.modelo, n: P.cfg.nivel }));
ok(P.cfg.premiosFinal.crash === 40 && P.cfg.premiosFinal.film === 1 && P.cfg.premiosFinal.heading === 2, "castigos(chocar=8) -> 40 real, premios(grabar=1) -> 1 real; el resto, los de la misión: " + JSON.stringify(P.cfg.premiosFinal));
ok(P.cfg.viento === 0.8, "trae el viento de la misión");
ok(P.hooks.join() === "cada_generacion,al_terminar", "encuentra las funciones especiales");
const tr = (succ, crash, gen) => ({ gen, steps: gen * 1000, succ, crash, rew: 10, hist: [[gen, 0, succ, crash, 12, 0.5]], params: { lr: 3e-4, ent: 0, reward: {} } });
let a = P.reaccionar("cada_generacion", estadoE(tr(0.2, 0.3, 10), { gen0: 0 }));
ok(a.length === 0, "fase 1 con choque alto: no cambia nada");
a = P.reaccionar("cada_generacion", estadoE(tr(0.3, 0.05, 11), { gen0: 0 }));
ok(a.length === 2 && a[0].castigos?.crash === 15 && a[1].premios?.film === 6, "choque < 10 %: fase 2, castigos(chocar=3) -> 15 y premios(grabar=6) -> 6");
ok(acciones.some(([k, c]) => k === "ajustar" && c.premios?.crash === 15 && c.premios?.film === 6 && c.premios?.heading === 2), "al servidor le manda TODOS los valores reales (premios y castigos juntos)");
a = P.reaccionar("cada_generacion", estadoE(tr(0.9, 0.02, 12), { gen0: 0 }));
ok(a.some((x) => x.detener), "éxito 90 %: se detiene");
P.reaccionar("al_terminar", estadoE(tr(0.9, 0.02, 12)));
ok(acciones.some(([k, t]) => k === "print" && /fase 2/.test(t)), "al_terminar ve la variable global");

const body = pedidoDe(compilar(data.ejemplos.hover, D, host).cfg, () => null);
ok(body.base_de === "cero" && body.capas.join() === "64,64" && body.nivel === 0 && body.premios.near === 0.6 && body.premios.crash === 20 && body.premios.tilt === 0.02 && body.donde === "fondo", "el pedido al servidor: " + JSON.stringify(body).slice(0, 140));
const b2 = pedidoDe(compilar('modelo("v3x")\nmision("grabar")\ndron("sagaz_dron_v3")', D, host).cfg, (n) => ({ nombre: n, fisica: {} }));
ok(b2.dron?.nombre === "Sagaz_Dron_V3", "dron del hangar (sin importar mayúsculas)");
for (const [k, src] of Object.entries(data.ejemplos)) ok(!falla(() => compilar(src, D, host)), `el ejemplo "${k}" compila`);

e = falla(() => compilar('mision("grabar")', D, host));
ok(/falta modelo/.test(e?.message || ""), "sin modelo(): " + e?.message);
e = falla(() => compilar('modelo("x")\nmision("volar_rapido")', D, host));
ok(/no hay una misión/.test(e?.message || "") && e.linea === 2, "misión que no existe: " + e?.message);
e = falla(() => compilar('modelo("x")\nmision("grabar")\ncastigos(chocr=3)', D, host));
ok(/quisiste decir "chocar"/.test(e?.message || ""), "castigo mal escrito: " + e?.message);
e = falla(() => compilar('modelo("x")\nmision("grabar")\npremios(grabar=4, chocar=3)', D, host));
ok(/"chocar" es un castigo: va en castigos\(chocar=…\)/.test(e?.message || "") && e.linea === 3, "un castigo en premios(): " + e?.message);
e = falla(() => compilar('modelo("x")\nmision("grabar")\ncastigos(film=4)', D, host));
ok(/"film" es un premio: va en premios/.test(e?.message || ""), "un premio en castigos(): " + e?.message);
e = falla(() => compilar('modelo("x")\nmision("grabar")\ncastigos(chocar=15)', D, host));
ok(/van de 0 a 10/.test(e?.message || "") && e.linea === 3, "fuera de 0-10: " + e?.message);
{
  const { realDe, nivelDe, recomendados } = await import("./pbdmm.js");
  const ESC = ent.escala_premios;
  ok(realDe("crash", 3, ESC) === 15 && realDe("tilt", 4, ESC) === 0.01 && nivelDe("stability", 1.2, ESC) === 5, "la escala 0-10 <-> real (y de vuelta, de a medio punto)");
  const R = recomendados(ent.misiones, ESC);
  ok(R.film === "3-4" && R.crash === "2-3" && R.heading === "4", "recomendados por misión: " + JSON.stringify(R));
  const pe = estadoE({ params: { reward: { crash: 15, film: 4 } } }, {}, ESC);
  ok(pe.premios.crash === 3 && pe.premios.film === 4, "e.premios llega de 0 a 10");
}
e = falla(() => compilar('modelo("x")\nmision("grabar")\npremios()', D, host));
ok(/al menos uno/.test(e?.message || ""), "premios() vacío: " + e?.message);
e = falla(() => compilar('modelo("x")\nmision("grabar")\nred(capas=[64])', D, host));
ok(/desde="cero"/.test(e?.message || ""), "red() sin desde cero: " + e?.message);
e = falla(() => compilar('modelo("x")\nmision("grabar")\ndef cada_generacion(e):\n    mision("grabar")', D, host).reaccionar("cada_generacion", estadoE(tr(0, 0, 1))));
ok(/va arriba/.test(e?.message || "") && e.linea === 4, "mision() dentro de una función: " + e?.message);
e = falla(() => compilar('modelo("x")\nmision("grabar")\ndef cada_generaccion(e):\n    pass', D, host));
ok(/no llama/.test(e?.message || ""), "función especial mal escrita: " + e?.message);
e = falla(() => compilar('modelo("x")\nmision("grabar")\ndron("Halcon")', D, host));
ok(/no tienes un dron/.test(e?.message || ""), "dron que no está en el hangar");

// 4) autocompletado del editor
{
  const { contexto, opciones } = await import("./autocompletar.js");
  const F = { data, misiones: ent.misiones, nombresNiveles: data.nombres_niveles, drones: ["Sagaz_Dron_V3", "Cine (dev)"],
    modelos: [{ slug: "base", gen: 1 }, { slug: "colibri", gen: 40, tiene_modelo: true }],
    premios: [...ent.premios, { k: "near", tipo: "premio", desc: "cerca de la meta" }].map((p) => ({ k: p.k, alias: Object.entries(data.alias_premios).find(([, k]) => k === p.k)?.[0], tipo: p.tipo, desc: p.desc })) };
  const op = (antes) => opciones(contexto(antes), F);
  let o = op('modelo("x")\ndron(');
  ok(o.map((x) => x.txt).join() === '"estandar","azar","Sagaz_Dron_V3","Cine (dev)"' && o.every((x) => x.cerrar), "dron( -> estandar, azar y tus drones (y cierra el paréntesis)");
  o = op('dron("sa');
  ok(o.length === 1 && o[0].txt === '"Sagaz_Dron_V3"', "dron(\"sa -> filtra: " + o.map((x) => x.txt));
  let cx = contexto('dron("sa');
  ok(cx.desde === 5 && cx.enTexto, "reemplaza desde la comilla");
  o = op("mision(");
  ok(o.length === ent.misiones.length && o[0].det.includes("nivel"), "mision( -> las misiones con su nivel");
  o = op("nivel(1");
  ok(o[0].txt === "1" && o.some((x) => x.txt === "12"), "nivel(1 -> 1, 10, 11, 12");
  o = op('modelo("halcon", ');
  ok(o.some((x) => x.txt === "desde="), "modelo(…, -> desde=");
  o = op('modelo("halcon", desde=');
  ok(o.map((x) => x.txt).join() === '"base","cero","colibri"', "desde= -> base, cero y tus modelos: " + o.map((x) => x.txt));
  o = op("premios(mirar=2, gra");
  ok(o[0].txt === "grabar=" && o[0].det.includes("film"), "premios(…, gra -> grabar= (film)");
  o = op("premios(");
  ok(o.map((x) => x.txt).sort().join() === "acercarse=,cerca=,grabar=,meta=,mirar=,rapidez=", "premios( -> solo premios: " + o.map((x) => x.txt));
  o = op("castigos(");
  ok(o.map((x) => x.txt).sort().join() === "brusco=,chocar=,inclinar=,pegado=,peligro=,sacudidas=,tiempo=", "castigos( -> solo castigos: " + o.map((x) => x.txt));
  o = op("    print(f\"{e.ex");
  ok(o.length === 0, "dentro de un texto f\"…\" no molesta");
  o = op("def cada_generacion(e):\n    if e.ex");
  ok(o[0]?.txt === "exito", "e.ex -> exito");
  o = op("    print(e.ch");
  ok(o[0]?.txt === "choque", "print(e.ch -> choque");
  o = op("de");
  ok(o.some((x) => x.txt === "detener(") && o.some((x) => x.txt === "def "), "de -> detener(, def…");
  o = op("def ca");
  ok(o[0]?.txt === "cada_generacion(e):", "def ca -> cada_generacion(e):");
  o = op("# dron(");
  ok(o.length === 0, "en un comentario no sale nada");
  o = op("    print(dro");
  ok(o[0]?.txt === "dron(" || o.some((x) => x.txt === "drones("), "dentro de print( completa nombres");
  o = op("red(");
  ok(o[0]?.txt.startsWith("capas="), "red( -> capas=[…]");
  o = op("x = [1, 2");
  ok(o.length === 0, "dentro de una lista no molesta");
}

console.log(fallas ? `\n${fallas} pruebas fallaron.` : "\nTodas las pruebas pasan.");
process.exit(fallas ? 1 : 0);
