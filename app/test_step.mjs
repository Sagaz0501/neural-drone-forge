// Importar STEP: node --import ./app/three_node.mjs app/test_step.mjs
// Lee app/test_data/chasis_5in.step (un 5" hecho con CadQuery: app/test_data/chasis_5in.py) con el OpenCascade en
// WebAssembly de game/vendor/occt y revisa lo que muestra «Analizar»: cuerpos, unidades, caja, volumen (contra el
// volumen EXACTO de la B-rep que dio CadQuery), los motores por los agujeros, la distancia entre ejes, camas, el STL.
import { readFileSync } from "fs";
import { leerSTEP, orientar, basesMotor, juntar, cabeceraSTEP, esSTEP } from "./step.js";
import { informe, stlBinario, leerSTL, analizar, conStep, revisarMalla, cabe, pesoImpreso } from "./stl.js";

let fallas = 0;
const ok = (c, msg) => { console.log(`${c ? "ok  " : "MAL "}  ${msg}`); if (!c) fallas++; };
const cerca = (a, b, tol) => Math.abs(a - b) <= tol;

// lo que dijo CadQuery (OpenCascade, B-rep exacta) al generar el archivo
const EXACTO = { placa_abajo: 19.011, brazo: 6.317, placa_arriba: 9.757, separador: 0.53, total: 56.156, bbox: [181.56, 181.56, 32] };

const buf = readFileSync(new URL("test_data/chasis_5in.step", import.meta.url));
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
ok(esSTEP(ab), "reconoce un STEP por su cabecera");
const t0 = Date.now();
const st = await leerSTEP(ab);
ok(true, `OpenCascade (wasm) lo lee en ${Date.now() - t0} ms: ${st.cuerpos.length} cuerpos, ${st.triangulos} triángulos`);
ok(st.unidad === "mm" && st.esquema === "AP214", `unidades ${st.unidad}, esquema ${st.esquema}`);
ok(st.ensamble && st.cuerpos.length === 10, "es un ensamble de 10 cuerpos (2 placas, 4 brazos, 4 separadores)");
ok(st.cuerpos.map((c) => c.nombre).join(",") === "placa_abajo,brazo_1,brazo_2,brazo_3,brazo_4,placa_arriba,separador_1,separador_2,separador_3,separador_4", "trae los nombres de las piezas");
const v = Object.fromEntries(st.cuerpos.map((c) => [c.nombre, c.volumen_cm3]));
ok(cerca(v.placa_abajo, EXACTO.placa_abajo, 0.05) && cerca(v.brazo_1, EXACTO.brazo, 0.05) && cerca(v.placa_arriba, EXACTO.placa_arriba, 0.05) && cerca(v.separador_1, EXACTO.separador, 0.01),
  `volumen por cuerpo ≈ el exacto (placa ${v.placa_abajo.toFixed(3)} vs ${EXACTO.placa_abajo}, brazo ${v.brazo_1.toFixed(3)} vs ${EXACTO.brazo})`);

// unidades en pulgadas: la cabecera se lee aparte
ok(cabeceraSTEP("FILE_SCHEMA(('CONFIG_CONTROL_DESIGN'));\n#9=(CONVERSION_BASED_UNIT('INCH',#8) LENGTH_UNIT() NAMED_UNIT(#7));").unidad === "in", "detecta pulgadas (CONVERSION_BASED_UNIT 'INCH')");
ok(cabeceraSTEP("#9=( LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT($,.METRE.) );").unidad === "m", "detecta metros");

// orientar: ya viene con Z arriba (lo más fino es Z)
const o = orientar(st.cuerpos);
ok(o.eje === "z", "el chasis ya viene plano (Z arriba)");
// uno girado (Y arriba, como exporta Fusion) vuelve a quedar plano
const girado = st.cuerpos.map((c) => { const tri = new Float32Array(c.tri); for (let i = 0; i < tri.length; i += 3) { const y = tri[i + 1]; tri[i + 1] = tri[i + 2]; tri[i + 2] = -y; } return { ...c, tri, bbox: { min: [0, 0, 0], max: [0, 0, 0] } }; });
for (const c of girado) { const mm = [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]]; for (let i = 0; i < c.tri.length; i++) { const a = i % 3; mm[0][a] = Math.min(mm[0][a], c.tri[i]); mm[1][a] = Math.max(mm[1][a], c.tri[i]); } c.bbox = { min: mm[0], max: mm[1] }; }
const og = orientar(girado);
const alto = (cs) => { let z0 = Infinity, z1 = -Infinity; for (const c of cs) { z0 = Math.min(z0, c.bbox.min[2]); z1 = Math.max(z1, c.bbox.max[2]); } return z1 - z0; };
ok(og.eje === "y" && cerca(alto(og.cuerpos), 32, 0.1), `con Y arriba lo gira (eje ${og.eje}, alto ${alto(og.cuerpos).toFixed(1)} mm)`);
ok(cerca(og.cuerpos[1].volumen_cm3, v.brazo_1, 1e-3), "girar no cambia el volumen (sin espejo)");

// los motores por los agujeros de las bases
const b = basesMotor(st.cuerpos);
ok(b && b.motores.length === 4 && b.agujeros.length === 20, `encuentra las 4 bases de motor (${b ? b.agujeros.length : 0} agujeros: eje + 4 tornillos cada una)`);
if (b) {
  const r = b.motores.map(([x, y]) => Math.hypot(x, y));
  ok(r.every((x) => cerca(x, 110, 0.5)), `cada motor a 110 mm del centro (${r.map((x) => x.toFixed(1)).join(", ")})`);
}
const inf = informe(st.cuerpos, { motores: b?.motores });
ok(cerca(inf.ejes_mm, 220, 1), `distancia entre motores en diagonal: ${inf.ejes_mm} mm (es un 5": 220)`);
ok(inf.helice === 5, `hélices de ${inf.helice}" (caben hasta ${inf.helice_cabe}")`);
ok(EXACTO.bbox.every((x, i) => cerca(inf.tam_mm[i], x, 0.3)), `tamaño ${inf.tam_mm.join(" × ")} mm ≈ ${EXACTO.bbox.join(" × ")}`);
ok(cerca(inf.volumen_cm3, EXACTO.total, 0.2), `volumen total ${inf.volumen_cm3} cm³ ≈ ${EXACTO.total} (exacto)`);
ok(inf.pesos.pla === pesoImpreso(inf.volumen_cm3, "pla") && inf.pesos.petg >= inf.pesos.pla && inf.pesos.tpu <= inf.pesos.pla && informe(st.cuerpos, { relleno: 1 }).pesos.pla === Math.round(inf.volumen_cm3 * 1.24), `peso por material: PLA ${inf.pesos.pla} g · PETG ${inf.pesos.petg} g · TPU ${inf.pesos.tpu} g`);
const c180 = inf.camas.find((c) => c.lado === 180), c256 = inf.camas.find((c) => c.lado === 256);
ok(!c180.entero && c180.por_piezas && c256.entero, "entero (181,6 mm) no cabe en la cama de 180 pero por piezas sí; en la de 256 cabe entero");
ok(inf.cuerpos.every((c) => c.cerrado), "todos los cuerpos son sólidos cerrados");
ok(!inf.avisos.some((a) => a.nivel === "mal"), `sin avisos graves (${inf.avisos.map((a) => a.texto).join(" | ") || "ninguno"})`);

// elegir cuerpos: solo los brazos
const brazos = st.cuerpos.filter((c) => c.nombre.startsWith("brazo"));
const ib = informe(brazos, { motores: basesMotor(brazos)?.motores });
ok(cerca(ib.volumen_cm3, 4 * EXACTO.brazo, 0.1) && cerca(ib.ejes_mm, 220, 1), `solo los brazos: ${ib.volumen_cm3} cm³, ${ib.ejes_mm} mm entre ejes`);

// guardar como STL: lo de siempre (leerSTL/analizar) da lo mismo, y con la metadata del STEP los motores van en las bases
const stl = stlBinario(juntar(st.cuerpos), "chasis_5in");
const tri = leerSTL(stl), base = analizar(tri);
ok(tri.length === inf.tri.length && cerca(base.volumen_cm3, EXACTO.total, 0.3), `el STL guardado: ${tri.length / 9} triángulos, ${base.volumen_cm3} cm³`);
const m = conStep(base, { volumen_cm3: inf.volumen_cm3, motores_mm: inf.motores_mm });
ok(cerca(m.radio_m, 0.11, 0.001) && m.helice_max === 5 && m.esquinas_m.length === 4, `con el STEP: motores a ${m.radio_m * 1000} mm, hélices hasta ${m.helice_max}", ~${m.masa_g} g en PLA`);
ok(revisarMalla(tri).abiertas === 0, "el STL guardado sigue cerrado");

// una malla abierta se avisa
const abierta = new Float32Array(st.cuerpos[0].tri.subarray(0, st.cuerpos[0].tri.length - 9 * 20));
ok(revisarMalla(abierta).abiertas > 0, "una malla con hueco: aristas abiertas");
ok(informe([{ nombre: "roto", tri: abierta }]).avisos.some((a) => /cerrado/.test(a.texto)), "…y el informe lo avisa");
// muy grande: un cubo de 300 mm
const cubo = []; const q = (a, b2, c, d) => cubo.push(...a, ...b2, ...c, ...a, ...c, ...d);
const P = (x, y, z) => [x * 300, y * 300, z * 300];
q(P(0, 0, 0), P(0, 1, 0), P(1, 1, 0), P(1, 0, 0)); q(P(0, 0, 1), P(1, 0, 1), P(1, 1, 1), P(0, 1, 1));
q(P(0, 0, 0), P(1, 0, 0), P(1, 0, 1), P(0, 0, 1)); q(P(0, 1, 0), P(0, 1, 1), P(1, 1, 1), P(1, 1, 0));
q(P(0, 0, 0), P(0, 0, 1), P(0, 1, 1), P(0, 1, 0)); q(P(1, 0, 0), P(1, 1, 0), P(1, 1, 1), P(1, 0, 1));
const ic = informe([{ nombre: "cubo", tri: new Float32Array(cubo) }]);
ok(!cabe(new Float32Array(cubo), 256, true) && ic.avisos.some((a) => a.nivel === "mal"), `un cubo de 300 mm: no cabe (${ic.volumen_cm3} cm³)`);

console.log(fallas ? `\n${fallas} pruebas fallaron.` : "\nTodas las pruebas pasan.");
process.exit(fallas ? 1 : 0);
