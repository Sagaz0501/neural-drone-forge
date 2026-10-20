// Los mapas del freestyle: node app/test_freestyle.mjs
//  · la línea recta entre portales seguidos (y de la salida al primero, y del último al primero) queda libre a 1,2 m
//    o más: la IA rival (nivel 16 · Carrera) sigue la pista sin que nada se le cruce
//  · la salida y los portales están adentro del mapa y fuera de lo que choca
//  · cada pista tiene sus 5 tipos de tramo y cada tramo es lo que dice: la recta es larga (≥ 22 m), la picada baja de golpe,
//    el split-S baja ≥ 7 m y sale para el otro lado, el hueco pasa pegado a algo (por dentro de una estructura) y la curva
//    cerrada gira 90° o más
//  · la línea de carrera (la guía que se dibuja) no atraviesa nada y no toca el piso
//  · cruza() y orientaciones()
//  · el radar de la persecución (freestyle_radar.js): adelante/izquierda/arriba desde tu dron y el pitido
import { Level } from "../game/sim.js";
import { MAPAS, ORDEN, nivelDe, orientaciones, cruza, lineaCarrera } from "./freestyle_mapas.js";
import { relativo, cadencia } from "./freestyle_radar.js";

let fallas = 0;
const ok = (c, msg) => { console.log(`${c ? "ok  " : "MAL "}  ${msg}`); if (!c) fallas++; };
const HOLGURA = 1.2;
for (const id of ORDEN) {
  const M = MAPAS[id], L = new Level(nivelDe(M));
  ok(M.gates.length >= 8, `${id}: ${M.gates.length} portales`);
  ok(!L.collides([M.spawn[0], M.spawn[1], 0.3], 1.5), `${id}: la salida está libre`);
  ok(M.gates.every((g) => Math.abs(g[0]) < M.bounds.xy - 3 && Math.abs(g[1]) < M.bounds.xy - 3 && g[2] < M.bounds.z - 2 && g[2] > 1), `${id}: los portales están adentro del mapa`);
  const pts = [[M.spawn[0], M.spawn[1], 1.5], ...M.gates, M.gates[0]], malos = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    for (let u = 0; u <= 1; u += 0.01) {
      const p = a.map((x, k) => x + (b[k] - x) * u);
      if (L.collides(p, HOLGURA)) { malos.push(`${i}→${i + 1} en (${p.map((x) => x.toFixed(1))})`); break; }
    }
  }
  ok(!malos.length, `${id}: la pista queda libre a ${HOLGURA} m${malos.length ? ": " + malos.join(" · ") : ""}`);
  const dirs = orientaciones(M.gates, M.spawn, M.dirs);
  ok(dirs.every((d) => Math.abs(Math.hypot(...d) - 1) < 1e-9), `${id}: cada portal tiene una dirección`);
  // los portales seguidos no quedan pegados (se ve uno detrás del otro) ni a más de 110 m
  const n = M.gates.length, G = M.gates, dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const largos = G.map((g, i) => dist(g, G[(i + 1) % n]));
  ok(Math.min(...largos) >= 3.5 && Math.max(...largos) <= 110, `${id}: entre portales ${Math.min(...largos).toFixed(1)}-${Math.max(...largos).toFixed(1)} m`);
  // los tramos
  const tipos = new Set(Object.values(M.tramos).map((x) => x[0]));
  ok(["recta", "picada", "splits", "hueco", "cerrada"].every((x) => tipos.has(x)), `${id}: tiene recta, picada, split-S, hueco y curva cerrada (${[...tipos].join(", ")})`);
  const horiz = (a, b) => { const d = [b[0] - a[0], b[1] - a[1]], k = Math.hypot(...d) || 1; return d.map((x) => x / k); };
  const malTramo = [];
  for (const [i, [tipo, nombre]] of Object.entries(M.tramos)) {
    const k = +i, g = G[k], antes = k ? G[k - 1] : G[n - 1], sig = G[(k + 1) % n], sig2 = G[(k + 2) % n];
    let bien = true;
    if (tipo === "recta") bien = Math.max(dist(antes, g), dist(g, sig)) >= 22;
    else if (tipo === "picada") bien = g[2] - sig[2] >= 6 && (g[2] - sig[2]) / Math.hypot(sig[0] - g[0], sig[1] - g[1]) >= 0.5;
    else if (tipo === "splits") { const e = horiz(antes, g), s2 = horiz(sig, sig2), dd = M.dirs[k], ds = M.dirs[(k + 1) % n];
      bien = g[2] - sig[2] >= 7 && (dd && ds ? dd[0] * ds[0] + dd[1] * ds[1] < -0.5 : e[0] * s2[0] + e[1] * s2[1] < -0.3); }
    else if (tipo === "hueco") bien = L.collides(g, 3.6);
    else if (tipo === "cerrada") { const e = horiz(antes, g), s2 = horiz(g, sig); bien = e[0] * s2[0] + e[1] * s2[1] <= 0.05; }
    else bien = false;
    if (!bien) malTramo.push(`${k} ${tipo} (${nombre})`);
  }
  ok(!malTramo.length, `${id}: cada tramo es lo que dice${malTramo.length ? ": " + malTramo.join(" · ") : ""}`);
  const linea = lineaCarrera(M, L);
  ok(linea.length > n * 3 && linea.every((p) => p[2] > 0.5 && !L.collides(p, 0.8)), `${id}: la línea de carrera (${linea.length} puntos) queda libre`);
}
ok(cruza([0, -2, 2], [0, 2, 2], [0.5, 0, 2.3]) && !cruza([0, -2, 2], [0, 2, 2], [2, 0, 2]), "cruza(): pasar cerca del centro sí, lejos no");
ok(!cruza([0, -2, 2], [0, -1, 2], [0, 0, 2], 0.5), "cruza(): sin llegar al portal no cuenta");
{
  const cerca = (a, b) => Math.abs(a - b) < 1e-9;
  const r0 = relativo([0, 0, 2], 0, [10, 0, 2]), r1 = relativo([0, 0, 2], Math.PI / 2, [10, 0, 5]);
  ok(cerca(r0.adelante, 10) && cerca(r0.izq, 0) && cerca(r0.ang, 0), "radar: mirando a +X, un dron en +X está adelante");
  ok(cerca(r1.adelante, 0) && cerca(r1.izq, -10) && cerca(r1.arriba, 3) && r1.ang < 0, "radar: girado 90° a la izquierda, ese dron queda a la derecha y 3 m arriba");
  const r2 = relativo([0, 0, 2], 0, [-5, 0, 2]);
  ok(Math.abs(r2.ang) > 3, "radar: uno detrás tiene ángulo ±180°");
  ok(cadencia(30) === null && cadencia(20) > cadencia(5) && cadencia(1.3) <= 0.081, "radar: callado lejos, el pitido se acelera al acercarse");
}
console.log(fallas ? `\n${fallas} pruebas fallaron.` : "\nTodas las pruebas pasan.");
process.exit(fallas ? 1 : 0);
