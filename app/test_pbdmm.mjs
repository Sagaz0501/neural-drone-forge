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

// 1b) variables y Python "de verdad": tuplas, comprensiones, ternario, *lista, **dicc
corre('model_test = "colibri"\nprint(model_test)');
ok(salida[0] === "colibri", "una variable con un texto");
corre("a, b = 1, 2\na, b = b, a\nprint(a, b)");
ok(salida[0] === "2 1", "a, b = b, a");
corre('d = {"x": 1, "y": 2}\nfor k, v in d.items():\n    print(k, v)');
ok(salida.join("|") === "x 1|y 2", "for k, v in d.items()");
corre("print([i * i for i in range(5) if i % 2 == 0])");
ok(salida[0] === "[0, 4, 16]", "comprensión con if: " + salida[0]);
corre('x = 3\nprint("grande" if x > 2 else "chico", [1, 2][0] if x else 9)');
ok(salida[0] === "grande 1", "ternario");
corre("def f(a, b=10, c=100):\n    return a + b + c\nxs = [1, 2]\nkw = {\"c\": 0}\nprint(f(*xs, **kw))");
ok(salida[0] === "3", "f(*lista, **dicc): " + salida[0]);
corre("def par():\n    return 1, 2\nu, v = par()\nprint(u + v, (7, 8)[1], ())");
ok(salida[0] === "3 8 []", "return a, b y tuplas con paréntesis: " + salida[0]);
corre("i = 5\nys = [i for i in range(3)]\nprint(i)");
ok(salida[0] === "5", "la variable de la comprensión no se escapa");
{ const e = falla(() => corre("a, b = 1, 2, 3"));
ok(/2 nombres y a la derecha 3/.test(e?.message || ""), "a, b = 3 valores: " + e?.message); }

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
e = falla(() => corre("x = 1\nif x > 0 && x < 3:\n    pass"));
ok(/se escribe and, no &&/.test(e?.message || "") && e.linea === 2, "&& -> usa and: " + e?.message);
e = falla(() => corre("x = 1\nif x || 2:\n    pass"));
ok(/se escribe or/.test(e?.message || ""), "|| -> usa or");
e = falla(() => corre('x = 1\nprint("hola"\ny = 2\nz = 3'));
ok(/falta cerrar el paréntesis/.test(e?.message || "") && e.linea === 2, "paréntesis sin cerrar: la línea donde se abrió: " + e?.message);
e = falla(() => corre('print(f"gen {e.generacion}")'));
ok(/solo existe dentro de las funciones/.test(e?.message || "") && e.linea === 1, "e arriba del archivo: " + e?.message);
e = falla(() => corre('x = 1\ny = 2\nprint(f"{x.foo}")'));
ok(e?.linea === 3, "un error dentro de un f-texto dice SU línea: " + e?.message);
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
{
  const Pv = compilar('NOMBRE = "halcon"\nV = 2\nN = 32\nmodelo(f"{NOMBRE}_v{V}", desde="cero")\nred(capas=[N * 2, N])\nMI_DRON = "Sagaz_Dron_V3"\ndron(MI_DRON)\nP = {"grabar": 6, "mirar": 4}\nmision("grabar")\npremios(**P)\ncastigos(**{"chocar": 3})', D, host);
  const Pf = compilar(data.ejemplos.variables, D, host);
  ok(Pf.cfg.modelo === "halcon_v2" && Pf.cfg.premiosFinal.film === 2 && Pf.cfg.premiosFinal.crash === 40, "el ejemplo variables: fase 1");
  let af = Pf.reaccionar("cada_generacion", estadoE({ succ: 0.4, gen: 9 }, {}));
  ok(af.some((x) => x.premios?.film === 6) && af.some((x) => x.castigos?.crash === 15), "pasa a la fase 2 con sus premios y castigos");
  af = Pf.reaccionar("cada_generacion", estadoE({ succ: 0.9, gen: 10 }, {}));
  ok(af.some((x) => x.detener), "llega a la META y se detiene");
  ok(Pv.cfg.modelo === "halcon_v2" && Pv.cfg.capas.join() === "64,32" && Pv.cfg.dron.hangar === "Sagaz_Dron_V3" && Pv.cfg.premiosFinal.film === 6 && Pv.cfg.premiosFinal.crash === 15, "un programa con variables: " + JSON.stringify({ m: Pv.cfg.modelo, c: Pv.cfg.capas }));
}

{
  const DM = { ...D, modelos: [{ slug: "base", tiene_modelo: true, gen: 1 }, { slug: "colibri", tiene_modelo: true, gen: 30 }, { slug: "camarografo", tiene_modelo: true, gen: 5 }] };
  ok(compilar('modelo("cam2", desde="colibri")\nmision("grabar")', DM, host).cfg.desde === "colibri", "desde=\"colibri\" (tu modelo entrenado)");
  const ee = falla(() => compilar('modelo("cam2", desde="colibr")\nmision("grabar")', DM, host));
  ok(/no tienes un modelo "colibr".*quisiste decir "colibri"/.test(ee?.message || "") && ee.linea === 1, "desde= con un modelo que no existe: " + ee?.message);
  ok(compilar('modelo("camarografo", desde="colibri")\nmision("grabar")', DM, host).cfg.yaExiste?.gen === 5, "avisa si el modelo ya existe (desde= no cuenta)");
  ok(!falla(() => compilar('modelo("x", desde="colibr")\nmision("grabar")', D, host)), "sin la lista de modelos no revisa (no bloquea)");
}
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
  {
    const { delPrograma } = await import("./autocompletar.js");
    const src = 'model_test = "colibri"\nN = 32\nCAPAS = [N, N]\nP = {"grabar": 6}\na, b = 1, 2\ndef ayudante(e):\n    x = 3\n';
    const F2 = { ...F, programa: delPrograma(src) };
    const op2 = (antes) => opciones(contexto(antes), F2);
    ok(F2.programa.vars.map((v) => v.nombre).join() === "model_test,N,CAPAS,P,a,b" && F2.programa.fns.join() === "ayudante", "lee tus variables (solo las de arriba) y tus funciones");
    o = op2("modelo(");
    ok(o.some((x) => x.txt === "model_test" && x.det.includes('"colibri"')) && !o.some((x) => x.txt === "N"), "modelo( -> tus variables con texto (no los números)");
    o = op2("drones(");
    ok(o.some((x) => x.txt === "N") && !o.some((x) => x.txt === "model_test"), "drones( -> tus variables con números");
    o = op2("red(capas=");
    ok(o.some((x) => x.txt === "CAPAS"), "capas= -> tus listas");
    o = op2("premios(");
    ok(o.some((x) => x.txt === "P") && o.some((x) => x.txt === "grabar="), "premios( -> tus diccionarios y los premios");
    o = op2("mod");
    ok(o[0].txt === "model_test" && o.some((x) => x.txt === "modelo("), "mod -> tu variable primero, después modelo(");
    o = op2("ayu");
    ok(o[0]?.txt === "ayudante(", "tus funciones");
    o = op2('dron("');
    ok(!o.some((x) => x.det?.startsWith("tu variable")), "dentro de comillas no ofrece variables");
  }
  o = op("x = [1, 2");
  ok(o.length === 0, "dentro de una lista no molesta");
}

// 5) PBDMM bilingüe: los nombres en inglés funcionan igual (en cualquier idioma del juego)
{
  const { traducirCodigo, E_EN } = await import("./pbdmm.js");
  const AL = data.alias_en;
  const es = 'modelo("halcon", desde="cero")\nred(capas=[32, 32])\nmision("grabar_postes")\ndron("azar")\ndrones(20)\nentrenar_en("fondo")\nvelocidad("rapido")\nviento(0.5)\naprendizaje(lr=0.0002, exploracion=0.003)\npremios(grabar=6, mirar=4)\ncastigos(chocar=3, sacudidas=5)\n';
  const en = 'model("halcon", start_from="zero")\nnetwork(layers=[32, 32])\nmission("film_poles")\ndrone("random")\ndrones(20)\ntrain_on("background")\nspeed("fast")\nwind(0.5)\nlearning(lr=0.0002, exploration=0.003)\nrewards(film=6, heading=4)\npenalties(crash=3, stability=5)\n';
  const cE = compilar(es, D, host).cfg, cI = compilar(en, D, host).cfg;
  const limpio = (c) => JSON.stringify({ ...c, lineas: undefined });
  ok(limpio(cE) === limpio(cI), "un programa en inglés = el mismo en español: " + (limpio(cE) === limpio(cI) ? "" : limpio(cI).slice(0, 200)));
  ok(traducirCodigo(es, "en", AL) === en, "traducir español -> inglés: " + traducirCodigo(es, "en", AL).split("\n").slice(0, 3).join(" | "));
  ok(traducirCodigo(en, "es", AL) === es, "traducir inglés -> español");
  for (const [k, src] of Object.entries(data.ejemplos)) {
    const ida = traducirCodigo(src, "en", AL), vuelta = traducirCodigo(ida, "es", AL);
    const quedan = Object.keys(AL.funciones).filter((es) => es !== AL.funciones[es] && new RegExp(`^[^#\\n]*\\b${es}\\(`, "m").test(ida));
    ok(vuelta === src && !falla(() => compilar(ida, D, host)) && !quedan.length, `el ejemplo "${k}" en inglés compila, vuelve igual y no le quedan funciones en español${quedan.length ? ": " + quedan : ""}`);
  }
  const mezcla = compilar('model("x")\nmision("grabar")\nrewards(grabar=5)\ndef every_generation(e):\n    if e.success > 0.9 and e.exito > 0.9:\n        stop()', D, host);
  ok(mezcla.hooks.join() === "cada_generacion", "se pueden mezclar los dos idiomas (y every_generation es cada_generacion)");
  const ac = mezcla.reaccionar("cada_generacion", estadoE({ succ: 0.95, gen: 3 }, {}));
  ok(ac.some((x) => x.detener), "e.success y stop() en inglés funcionan");
  ok(JSON.stringify(E_EN) === JSON.stringify(AL.e), "los campos de e en inglés (pbdmm.js E_EN) = data/pbdmm.json alias_en.e");
  const e1 = falla(() => compilar('model("x")\nmission("volar_rapido")', D, host));
  ok(/no hay una misión/.test(e1?.message || ""), "los errores siguen funcionando con nombres en inglés: " + e1?.message);
  ok(compilar('model("x")\nmission("film")\ndrone("Sagaz_Dron_V3")', D, host).cfg.dron.hangar === "Sagaz_Dron_V3", "drone() con un dron del hangar");
}

console.log(fallas ? `\n${fallas} pruebas fallaron.` : "\nTodas las pruebas pasan.");
process.exit(fallas ? 1 : 0);
