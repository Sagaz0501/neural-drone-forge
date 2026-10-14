// Comprueba que game/sim.js hace EXACTAMENTE lo mismo que el Python del proyecto.
//   python game/make_fixture.py && node game/test_sim.mjs
import { readFileSync } from "node:fs";
import { Level, Policy, Flight, Flock, step, newState, sensorRays, buildObs } from "./sim.js";

const dir = new URL("./_fixture/", import.meta.url);
const F = JSON.parse(readFileSync(new URL("fixture.json", dir)));
const pol = new Policy(JSON.parse(readFileSync(new URL("policy.json", dir))));
const lv = new Level(F.level);
let fails = 0;
const check = (name, err, tol) => {
  const ok = err <= tol;
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FALLA"} ${name}: error máx ${err.toExponential(2)} (tolerancia ${tol})`);
};

// 1) sensores y colisiones
let eR = 0, eC = 0;
for (const c of F.rays) {
  const d = lv.raycast(c.o, c.dirs, 5.0);
  d.forEach((x, i) => (eR = Math.max(eR, Math.abs(x - c.d[i]))));
  if (lv.collides(c.o, 0.15) !== c.col) eC++;
}
check("raycast (cajas, esferas, cilindros, piso)", eR, 1e-9);
check("colisiones distintas", eC, 0);

// 2) sensores en cono + observación + red
let eRay = 0, eObs = 0, eAct = 0;
for (const c of F.obs) {
  const s = { pos: c.pos, vel: c.vel, roll: c.roll, pitch: c.pitch, yaw: c.yaw, throttle: 0 };
  const rays = sensorRays(s, lv);
  rays.forEach((x, i) => (eRay = Math.max(eRay, Math.abs(x - c.rays[i]))));
  const obs = buildObs(s, c.goal, c.rays, c.prev);
  obs.forEach((x, i) => (eObs = Math.max(eObs, Math.abs(x - c.obs[i]))));
  const a = pol.act(c.obs);
  a.forEach((x, i) => (eAct = Math.max(eAct, Math.abs(x - c.act[i]))));
}
check("10 sensores en cono", eRay, 1e-9);
check("27 entradas de la red", eObs, 1e-6);
check("4 salidas de la red", eAct, 1e-5);

// 3) física (con viento)
const s = newState([0, 0, 0]);
let eP = 0;
F.acts.forEach((a, k) => {
  step(s, a, 0.01, [1.0, -0.5, 0.0]);
  const ref = F.phys[k];
  const mine = [...s.pos, ...s.vel, s.roll, s.pitch, s.yaw];
  mine.forEach((x, i) => (eP = Math.max(eP, Math.abs(x - ref[i]))));
});
check("física (400 pasos con viento)", eP, 1e-9);

// 4) vuelos completos de la red
for (const [name, lvd, fr] of [["bosque + columnas", F.level, F.flight], ["circuito abierto + aterrizaje", F.open_level, F.flight2]]) {
  const L = new Level(lvd);
  const g = L.goals[L.goals.length - 1];
  const fl = new Flight(L, pol, { landOn: [name.startsWith("circ") ? 0 : g[0], name.startsWith("circ") ? 0 : g[1], 0] }).reset();
  let e = 0, n = 0;
  for (const ref of fr.traj) {
    fl.step();
    e = Math.max(e, Math.hypot(fl.state.pos[0] - ref[0], fl.state.pos[1] - ref[1], fl.state.pos[2] - ref[2]));
    n++;
    if (fl.phase !== "ruta" && fl.phase !== "aterrizaje") break;
  }
  check(`vuelo ${name} (${n} pasos, ${fl.phase}/${fr.phase})`, e, 1e-3);
  if (fl.phase !== fr.phase) { fails++; console.log("FALLA  final distinto:", fl.phase, "vs", fr.phase); }
}
// 5) caza: pájaros solos con el mismo ruido
{
  const C = F.flock;
  const fk = new Flock(2.0).start(C.pos, C.head, 0.02);
  let eB = 0, eE = 0, ePk = 0, cur = null;
  C.out.forEach((ref, t) => {
    fk.step(0.02, C.noise[t], C.drone[t]);
    if (t === 300) fk.alive[2] = false;
    cur = fk.pick(C.drone[t], cur);
    ref.pos.forEach((p, i) => p.forEach((x, c) => (eB = Math.max(eB, Math.abs(x - fk.pos[i][c])))));
    ref.est.forEach((v, i) => fk.estVel(i).forEach((x, c) => (eE = Math.max(eE, Math.abs(x - v[c])))));
    if (cur !== ref.pick) ePk++;
  });
  check("pájaros (600 pasos, pasear + huir + borde)", eB, 1e-9);
  check("velocidad estimada de los pájaros", eE, 1e-7);
  check("presa elegida distinta", ePk, 0);
}
// 5b) caza en el bosque: esquivar troncos y copas
{
  const C = F.forest_flock;
  const fk = new Flock(2.5, [0, 0, 0], lv, [0.9, 2.4]).start(C.pos, C.head, 0.02);
  let eB = 0, inside = 0;
  C.out.forEach((ref, t) => {
    fk.step(0.02, C.noise[t], C.drone[t]);
    ref.forEach((p, i) => p.forEach((x, c) => (eB = Math.max(eB, Math.abs(x - fk.pos[i][c])))));
    fk.pos.forEach((p) => (inside += lv.collides(p, 0.2) ? 1 : 0));
  });
  check("pájaros en el bosque (800 pasos, esquivando)", eB, 1e-9);
  check("pasos con un pájaro dentro de un árbol", inside, 0);
}
// 6) caza completa con red de 27 entradas
{
  const H = F.hunt;
  const pol27 = new Policy(JSON.parse(readFileSync(new URL("policy27.json", dir))));
  let k = 0;
  const fk = new Flock(1.5).start(H.pos, H.head);
  const fl = new Flight(new Level({ goals: [] }), pol27, { flock: fk, noise: () => H.noise[k++] }).reset();
  let e = 0, n = 0, eT = 0;
  for (const ref of H.traj) {
    fl.step();
    e = Math.max(e, Math.hypot(fl.state.pos[0] - ref[0], fl.state.pos[1] - ref[1], fl.state.pos[2] - ref[2]));
    if (fl.goalIdx !== ref[3] || fl.target !== ref[4]) eT++;
    n++;
    if (fl.phase !== "ruta") break;
  }
  check(`caza con la red (${n} pasos, ${fl.goalIdx} cazados, ${fl.phase}/${H.phase})`, e, 1e-3);
  check("presa/cazados distintos en la caza", eT, 0);
  if (fl.phase !== H.phase) { fails++; console.log("FALLA  final distinto:", fl.phase, "vs", H.phase); }
}
console.log(fails ? `\n${fails} FALLAS` : "\nTodo igual que Python.");
process.exit(fails ? 1 : 0);
