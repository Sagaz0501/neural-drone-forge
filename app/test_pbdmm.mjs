// Pruebas del lenguaje PBDMM (app/pbdmm.js): node app/test_pbdmm.mjs
import { readFileSync } from "fs";
import { parsear, Interprete, compilar, pedidoDe, estadoE, ErrorPB, repr } from "./pbdmm.js";

const data = JSON.parse(readFileSync(new URL("./data/pbdmm.json", import.meta.url)));
const ent = JSON.parse(readFileSync(new URL("./data/entrenamiento.json", import.meta.url)));
const D = { ...data, misiones: ent.misiones, premiosValidos: ent.premios.map((p) => p.k).concat(["near"]), drones: ["Sagaz_Dron_V3"],
  tiposPremio: { ...Object.fromEntries(ent.premios.map((p) => [p.k, p.tipo])), near: "premio" }, escala: ent.escala_premios,
  premiosInfo: Object.fromEntries(ent.premios.map((p) => [p.k, p])) };
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
a = a.filter((x) => x.avisar === undefined);           // avisar(…) dentro de una función también queda en las acciones
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
// Fase 1b: las misiones de fotos y el catálogo nuevo (escala: real = nivel / 10 × escala_premios)
const b3 = pedidoDe(compilar('modelo("fotos1")\nmision("set_fotos")\npremios(encuadre=8, quieto=4)\ncastigos(gas=10, paneo=2, altura=4, exceso_velocidad=4)', D, host).cfg, () => null);
ok(b3.nivel === 14 && b3.premios.framing === 4 && b3.premios.settle === 4 && b3.premios.energy === 0.5 && b3.premios.pan === 0.25 && b3.premios.altitude === 1 && b3.premios.overspeed === 0.5,
  "mision(\"set_fotos\") -> nivel 14 con encuadre, quieto, gas, paneo, altura y exceso_velocidad: " + JSON.stringify(b3.premios));
const b4 = pedidoDe(compilar('model("photo1")\nmission("photo")\nrewards(framing=6)\npenalties(energy=2)', D, host).cfg, () => null);
ok(b4.nivel === 13 && b4.premios.framing === 3 && b4.premios.energy === 0.1, "en inglés: mission(\"photo\"), rewards(framing=…), penalties(energy=…)");
ok(/es un castigo/.test(falla(() => compilar('modelo("x")\nmision("foto")\npremios(gas=3)', D, host))?.message || ""), "gas es un castigo (no va en premios)");
{
  const sal = [];
  compilar('modelo("x")\nmision("foto")\nexplicar("encuadre")\nexplicar("energy")', D, { ...host, print: (x) => sal.push(x) });
  ok(/Encuadre/.test(sal[0]) && /centro/i.test(sal[0]) && /castigo/.test(sal[1]), "explicar(\"encuadre\") y explicar(\"energy\"): los premios y castigos también se explican: " + sal.join(" / ").slice(0, 400));
}
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
  ok(o.map((x) => x.txt).sort().join() === "acercarse=,cerca=,encuadre=,grabar=,meta=,mirar=,quieto=,rapidez=", "premios( -> solo premios: " + o.map((x) => x.txt));
  o = op("castigos(");
  ok(o.map((x) => x.txt).sort().join() === "altura=,brusco=,chocar=,exceso_velocidad=,gas=,inclinar=,paneo=,pegado=,peligro=,sacudidas=,tiempo=", "castigos( -> solo castigos: " + o.map((x) => x.txt));
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


// 6) más Python de verdad (PBDMM 2): rebanadas, closures, valores por defecto, bool, sorted/enumerate/zip…
corre('a = [1, 2, 3, 4]\nprint(a[1:3], a[:2], a[-2:], "hola"[1:])');
ok(salida[0] === '[2, 3] [1, 2] [3, 4] ola', "rebanadas [a:b]: " + salida[0]);
corre("def f():\n    x = 5\n    def g():\n        return x\n    return g()\nprint(f())");
ok(salida[0] === "5", "una función adentro de otra ve sus variables (closure)");
corre("y = 1\ndef f(a, b=y + 1):\n    return a + b\ny = 10\nprint(f(1))");
ok(salida[0] === "3", "el valor por defecto se calcula al definir (como Python)");
corre("print(True + 1, sum([True, True]), round(2.5), round(3.5), round(3.14159, 2))");
ok(salida[0] === "2 2 2 4 3.14", "bool como número y round como Python: " + salida[0]);
ok(/lista vacía/.test(falla(() => corre("print(max([]))"))?.message || ""), "max([]) da error (como Python)");
corre('def seg(p):\n    return p[1]\nprint(sorted([3, 1, 2]), sorted(["b", "a"], reverse=True), sorted([[1, "z"], [0, "y"]], key=seg), max([[1, 5], [2, 3]], key=seg))');
ok(salida[0] === '[1, 2, 3] ["b", "a"] [[0, "y"], [1, "z"]] [1, 5]', "sorted(key=, reverse=) y max(key=): " + salida[0]);
corre('for i, x in enumerate(["a", "b"]):\n    print(i, x)\nprint(list(zip([1, 2], [3, 4, 5])), any([0, 1]), all([1, 0]), reversed([1, 2]))');
ok(salida.join("|") === "0 a|1 b|[[1, 3], [2, 4]] True False [2, 1]", "enumerate, zip, any, all, reversed: " + salida.join("|"));

// 7) PBDMM 2: leer el juego, revisar, la terminal, el narrador
{
  const { estadoE: eE, narracion, diagnosticar } = await import("./pbdmm.js");
  const st = (twr, extra = {}) => ({ mass: 0.52, masa_g: 520, twr, velMax: 9.1, minutos: 4.4, alcance_m: 20, calidad: 20, gimbal: false, ayudas: ["altura"], vibracion: 0.6, nitidez: 0.79, precio: 104, ...extra });
  const D2 = { ...D, drones: ["Madera", "Cine"],
    hangar: [{ nombre: "Madera", listo: true, st: st(1.9), piezas: { motores: "Motores 1806", bateria: "LiPo 3S", radio: "ESP-NOW" }, extras: [] },
             { nombre: "Cine", listo: true, st: st(2.6, { ayudas: ["altura", "sensores", "protectores"], alcance_m: 500, calidad: 62 }), piezas: {}, extras: [] }],
    misionInfo: { grabar_viento: { para: "Finca", requisitos: { twr_min: 2.2, barometro: true }, ctx: { segundos: 34, viento: 2.5, alcance: 22 } },
                  grabar_postes: { para: "Restaurante", requisitos: { protectores: true, calidad_min: 50, sensores: true }, ctx: { segundos: 30, viento: 0.8, alcance: 15 } } },
    modelos: [{ slug: "colibri", gen: 120, red: [64, 64], ultimo: [120, 0, 0.8, 0.05], mejor_exito: 0.82, tiene_modelo: true }],
    inventario: [{ nombre: "Motores 1806", ranura: "motores", vida: 80, precio: 30, en: "Madera" }, { nombre: "LiPo 3S", ranura: "baterias", vida: 100, precio: 20, en: null }] };
  const out = [], h2 = { print: (x) => out.push(x) };
  const P2 = compilar('d = dron("Madera")\nm = mision("grabar_viento")\nmodelo("x2")\nprint(d.empuje_peso, d.bateria.minutos, d.radio.alcance_m, m.viento, m.pide.get("empuje_peso_min"))', D2, h2);
  ok(out[0] === "1.9 4.4 20 2.5 2.2", "d = dron(…) y m = mision(…) devuelven objetos: " + out[0]);
  ok(P2.revision && !P2.revision.ok && P2.revision.lineas.some(([ic, tx]) => ic === "❌" && /Empuje\/peso 1,90/.test(tx)) && P2.revision.lineas.some(([ic, tx]) => ic === "❌" && /Radio/.test(tx)),
    "con dron(…) el programa se revisa solo contra la misión (empuje/peso con viento, radio)");
  ok(compilar('modelo("x3")\nmision("grabar_viento")\ndron("azar")', D2, h2).revision === null, "sin un dron del hangar no se revisa nada");
  out.length = 0;
  compilar('modelo("x4")\nmision("grabar")\nr = revisar("Cine", "grabar_postes")\nprint(r.ok, len(r.errores))\nr2 = revisar(dron_info("Madera"), mision_info("grabar_postes"))\nprint(r2.ok, r2.errores[0])', D2, h2);
  ok(out.includes("True 0") && out.some((l) => /^False .*(Cámara|Protectores)/.test(l)), "revisar(d, m) con nombres u objetos: " + out.filter((l) => /^(True|False)/.test(l)).join(" | "));
  out.length = 0;
  compilar('modelo("x5")\nmision("grabar")\ntabla(hangar(), "nombre", "empuje_peso", "bateria.minutos", "tof")\nprint(barra(0.6), barra(None, 4))\nprint(len(inventario()), len(inventario("motores")), inventario("baterias")[0].en)\nprint(modelo_info("colibri").mejor_exito)\nexplicar("lr")', D2, h2);
  ok(out[0].startsWith("nombre") && out[2].startsWith("Madera") && out[3].includes("2.6") && out[3].trim().endsWith("✓"), "tabla(hangar(), …) en columnas");
  ok(out[4] === "████████████░░░░░░░░ 60 % ░░░░ —", "barra(): " + out[4]);
  ok(out[5] === "2 1 None" && out[6] === "0.82", "inventario() y modelo_info(): " + out[5] + " · " + out[6]);
  ok(/^📘 lr: Learning rate/.test(out[7]), "explicar(\"lr\")");
  out.length = 0;
  compilar('modelo("x6")\nmision("grabar")\nficha("Cine")\nprint(color("verde", "ok"))', D2, h2);
  ok(out[0] === "── Cine ──" && out.some((l) => /empuje_peso\s+2\.6/.test(l)) && out.at(-1) === "\u0001verde\u0002ok\u0003", "ficha() y color()");
  ok(/no hay un dron, una misión/.test(falla(() => compilar('modelo("x7")\nmision("grabar")\nficha("nada")', D2, h2))?.message || ""), "ficha() de algo que no existe: error claro");
  // los campos en inglés
  ok(compilar('d = drone("Cine")\nmodel("x8")\nmission("film")\nprint(d.thrust_weight, d.radio.range_m, d.guards)', D2, { print: (x) => out.push(x) }) && out.at(-1) === "2.6 500 True", "los campos de los objetos en inglés: " + out.at(-1));
  // e.cambio, diagnósticos y el narrador
  const ses = { gen0: 0 };
  let e;
  for (let g = 1; g <= 22; g++) e = eE({ gen: g, succ: 0.3, crash: 0.2, rew: 1 + g * 0.3, hist: [] }, ses, ent.escala_premios);
  ok(e.cambio.exito === 0 && e.cambio.premio === 0.3, "e.cambio: contra la generación anterior");
  ok(e.diagnosticos.some((x) => /pagando por algo/.test(x)) && e.diagnosticos.some((x) => /se estancó/.test(x)), "e.diagnosticos: paga por lo que no es y se estancó");
  ok(diagnosticar([{ gen: 1, exito: 0.8 }, ...Array.from({ length: 10 }, (_, i) => ({ gen: i + 2, exito: 0.4, choque: 0.1, premio: 1 }))]).some((x) => x.k === "olvida"), "diagnóstico: el éxito cayó (lr alto)");
  const Pn = compilar('modelo("x9")\nmision("grabar")\nnarrar(cada=5)', D2, h2);
  const sesN = { gen0: 0 }, lineasN = [];
  for (let g = 1; g <= 10; g++) lineasN.push(...Pn.narrar(eE({ gen: g, succ: 0.1 * g, crash: 0.5 - 0.04 * g, rew: g, hist: [] }, sesN, ent.escala_premios), sesN));
  ok(lineasN.some((l) => /^Gen 5: éxito 50 %/.test(l)) && lineasN.some((l) => /Aprende: en 5 generaciones el éxito subió/.test(l)), "narrar(cada=5): cada 5 generaciones cuenta cómo va: " + lineasN.slice(0, 2).join(" // "));
  ok(compilar('modelo("x10")\nmision("grabar")', D2, h2).narrar(e, ses).length === 0, "sin narrar() no narra");
  // la ruta del programador
  const RUTA = await import("./ruta.js");
  RUTA.usarCapitulos(data.ruta);
  const p = { modo: "dev", drones: [{ nombre: "Madera" }, { nombre: "Cine" }] };
  ok(RUTA.abiertos(p) === 1 && RUTA.actual(p) === 1 && RUTA.nuevos(p).has("modelo"), "la ruta empieza en el capítulo 1 (abierto con el primer dron)");
  ok(RUTA.alCrearDron(p, { nombre: "Halcón" }) === 2 && p.ruta.drones[2] === "Halcón" && RUTA.abiertos(p) === 2, "crear un dron abre el capítulo 2");
  ok(RUTA.alCrearDron({ modo: "normal", drones: [] }, { nombre: "x" }) === null, "en el modo normal no hay ruta");
  const logrados = [];
  const aviso = (n) => logrados.push(n);
  RUTA.alGenerar(p, {}, { generaciones_sesion: 20 }, aviso);
  ok(logrados.join() === "1" && RUTA.actual(p) === 2, "reto 1: 20 generaciones");
  const src2 = RUTA.programa(p, 2);
  ok(src2.includes('dron("Halcón")') && src2.includes("cap2_halcon"), "el programa del capítulo trae su dron y su modelo");
  RUTA.alCompilar(p, "capitulo_2", src2, { revision: null }, aviso);
  ok(logrados.join() === "1,2", "reto 2: imprimir empuje/peso y minutos (se ve en el código)");
  for (let k = 0; k < 6; k++) RUTA.alCrearDron(p, { nombre: "D" + k });
  RUTA.alCompilar(p, "x", "", { revision: { ok: true } }, aviso);
  RUTA.alGenerar(p, { desde: "cero" }, { generaciones_sesion: 6, choque: 0.1, exito: 0.6 }, aviso, [{ avisar: "ya" }, { premios: {} }]);
  RUTA.alCompilar(p, "x", "def f():\n    pass\ntabla(hangar(), \"nombre\")", { revision: null }, aviso);
  ok(logrados.sort((a, b) => a - b).join() === "1,2,3,4,5,6,7,8" && RUTA.actual(p) === null, "los 8 retos se pueden lograr: " + logrados.join());
  for (const c of data.ruta) {
    const pp = { modo: "dev", drones: [{ nombre: "Madera" }], ruta: { creados: 9, hechos: {}, drones: {} } };
    const srcC = RUTA.programa(pp, data.ruta.indexOf(c) + 1);
    ok(!falla(() => compilar(srcC, { ...D2, drones: ["Madera", "Cine"], hangar: D2.hangar.map((h, i) => (i ? h : { ...h, nombre: "Madera" })) }, h2)), `el programa del capítulo "${c.titulo}" compila`);
  }
}

// PBDMM 3: el plan de vuelo y los simuladores (solo se puede usar lo que compraste)
{
  const ES3 = JSON.parse(readFileSync(new URL("./data/escenarios.json", import.meta.url)));
  const ESC = await import("./escenarios.js");
  const p = { escenarios: ["foto_fija"] }, dis = ESC.disponibles(p, ES3);
  const D3 = { ...D, misionesDisponibles: dis.misiones, nivelesDisponibles: dis.niveles, bloqueadas: dis.bloqueadas, planes: dis.planes };
  const P3 = compilar(data.ejemplos.foto_fija, D3, host);
  ok(P3.cfg.plan.map((x) => x.a).join(",") === "despegar,ir_a,mantener,foto,aterrizar", "el ejemplo foto_fija: despegar → ir_a → mantener → foto → aterrizar");
  const b = pedidoDe(P3.cfg, () => null);
  ok(b.tarea && b.tarea.foto_ok === 0.6 && b.tarea.foto_seg[0] === 2.6 && b.tarea.foto_seg[1] === 3.4 && b.premios.settle > 0 && b.premios.framing > 0, `el plan es la tarea del entrenamiento: ${JSON.stringify(b.tarea)} + premios de quieto y encuadre`);
  const err3 = (src) => falla(() => compilar(src, D3, host))?.message || "";
  ok(/le falta: mantener\(\)/.test(err3('modelo("x")\nmision("foto")\ndespegar()\nir_a()\nmantener()\nfoto()'.replace("mantener()\nfoto()", "foto()"))) || /quieto/.test(err3('modelo("x")\nmision("foto")\ndespegar()\nir_a()\nfoto()')), "foto() sin mantener() antes: error");
  ok(/le falta: foto\(\)/.test(err3('modelo("x")\nmision("foto")\ndespegar()\nir_a()\nmantener(2)')), "un plan sin foto(): le falta foto()");
  ok(/primero despegar/.test(err3('modelo("x")\nmision("foto")\nir_a()')), "ir_a() sin despegar: error");
  ok(/simulador «Set de fotos»/.test(err3('modelo("x")\nmision("foto")\ndrones(10)')), "drones() se abre con el simulador Set de fotos");
  ok(/todavía no la tienes/.test(err3('modelo("x")\nmision("grabar")')), "una misión que no compraste: error");
  const p2 = { escenarios: ["foto_fija", "set_fotos"] }, d2 = ESC.disponibles(p2, ES3);
  const P4 = compilar('modelo("x")\nmision("set_fotos")\ndespegar()\nfor i in range(3):\n    ir_a()\n    mantener(2)\n    foto()\ndrones(20)', { ...D, misionesDisponibles: d2.misiones, nivelesDisponibles: d2.niveles, bloqueadas: d2.bloqueadas, planes: d2.planes }, host);
  ok(P4.cfg.tarea.fotos === 3 && P4.cfg.drones === 20, "un for con 3 fotos = un set de 3 (y con el simulador, drones() ya se puede)");
  ok(pedidoDe(compilar(data.ejemplos.curriculum, D, host).cfg, () => null).tarea === undefined, "sin simuladores (programas de antes): nada cambia");
  const pp = { plata: 100, escenarios: ["foto_fija"] };
  ok(ESC.comprar(pp, ES3, "video_ruta") && ESC.comprar(pp, ES3, "set_fotos") === null && pp.plata === 20 && ESC.estado(pp, ES3, "video_ruta") === "comprable", "comprar en orden: Set de fotos ($80) abre Video con ruta");
}

console.log(fallas ? `\n${fallas} pruebas fallaron.` : "\nTodas las pruebas pasan.");
process.exit(fallas ? 1 : 0);
