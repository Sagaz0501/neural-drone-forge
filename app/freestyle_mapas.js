// =====================================================================
// LOS MAPAS DEL FREESTYLE (app/freestyle.js): la fábrica abandonada, el cañón y el estadio de noche.
// Solo datos (sin Three.js): las piezas que chocan (cajas, cilindros y esferas, las mismas formas que el entrenamiento:
// game/sim.js Level) con su material, lo que solo se dibuja (deco) y la pista de portales.
// Ejes como la simulación: X y Y en el piso, Z arriba (metros). La línea recta entre dos portales seguidos queda libre
// (app/test_freestyle.mjs lo revisa): así la IA rival (entrenada en el nivel 16 · Carrera) puede seguir la pista.
// =====================================================================
import { makeRng } from "../game/sim.js";

function nuevo(id, extra) {
  const M = { id, boxes: [], cyls: [], sphs: [], deco: [], gates: [], spawn: [0, 0, 0], yaw: 0, ...extra };
  M.caja = (x0, y0, z0, x1, y1, z1, m) => M.boxes.push({ min: [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)], max: [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)], m });
  M.cil = (x, y, r, z0, z1, m) => M.cyls.push({ c: [x, y], r, z: [z0, z1], m });
  M.esf = (x, y, z, r, m) => M.sphs.push({ c: [x, y, z], r, m });
  return M;
}
const limpiar = (M) => { delete M.caja; delete M.cil; delete M.esf; return M; };

// ---------------- 1 · LA FÁBRICA ABANDONADA (bando FPV: entrar por puertas, salir por el techo roto) ----------------
function fabrica() {
  const M = nuevo("fabrica", {
    nombre: "La fábrica abandonada", icono: "🏭",
    desc: "Una nave industrial con el techo roto, silos, una chimenea y contenedores. Para FPV: puertas, ventanas y huecos.",
    bounds: { xy: 80, z: 45 }, spawn: [0, -36, 0], yaw: Math.PI / 2,
    ambiente: { cielo: [0x6f8fae, 0xc9c4b8], sol: [0.45, 0.5, -0.35], solColor: 0xffe1b8, luz: 1.0, niebla: 0.006, suelo: "asfalto", noche: false },
  });
  const T = 0.5, H = 12;                                        // la nave: x -20..20, y -10..14, 12 m de alto
  // pared sur (y -10): portón x -4..4 (7 m) y una ventana rota x -15..-9 (z 4..7)
  M.caja(-20, -10, 0, -15, -10 + T, H, "ladrillo");
  M.caja(-15, -10, 0, -9, -10 + T, 4, "ladrillo"); M.caja(-15, -10, 7, -9, -10 + T, H, "ladrillo");
  M.caja(-9, -10, 0, -4, -10 + T, H, "ladrillo");
  M.caja(-4, -10, 7, 4, -10 + T, H, "ladrillo");
  M.caja(4, -10, 0, 20, -10 + T, H, "ladrillo");
  // pared norte (y 14): ventana x -12..-4 (z 4..8) y portón de carga x 8..16 (8 m)
  M.caja(-20, 14 - T, 0, -12, 14, H, "ladrillo");
  M.caja(-12, 14 - T, 0, -4, 14, 4, "ladrillo"); M.caja(-12, 14 - T, 8, -4, 14, H, "ladrillo");
  M.caja(-4, 14 - T, 0, 8, 14, H, "ladrillo");
  M.caja(8, 14 - T, 8, 16, 14, H, "ladrillo");
  M.caja(16, 14 - T, 0, 20, 14, H, "ladrillo");
  // pared oeste (x -20): puerta y 0..6 (6 m de alto)
  M.caja(-20, -10, 0, -20 + T, 0, H, "ladrillo"); M.caja(-20, 0, 6, -20 + T, 6, H, "ladrillo"); M.caja(-20, 6, 0, -20 + T, 14, H, "ladrillo");
  // pared este (x 20): derrumbada entre y -2 y 8 (queda 3 m)
  M.caja(20 - T, -10, 0, 20, -2, H, "ladrillo"); M.caja(20 - T, -2, 0, 20, 8, 3, "ladrillo"); M.caja(20 - T, 8, 0, 20, 14, H, "ladrillo");
  // techo (z 12..12.5) con huecos: x -6..6 en y -3..3 y la esquina x 0..20, y 9..14
  M.caja(-20, -10, H, 20, -3, H + T, "techo");
  M.caja(-20, -3, H, -6, 3, H + T, "techo"); M.caja(6, -3, H, 20, 3, H + T, "techo");
  M.caja(-20, 3, H, 20, 9, H + T, "techo");
  M.caja(-20, 9, H, 0, 14, H + T, "techo");
  // adentro: columnas, la viga de la grúa, estanterías y un entrepiso
  for (const x of [-12, -4, 4, 12]) for (const y of [-4, 4]) M.cil(x, y, 0.35, 0, H, "metal");
  M.caja(-19.5, 7.6, 8, 19.5, 8.4, 8.8, "oxido");
  M.caja(-18, -7, 0, -16.5, -1, 5, "estante"); M.caja(-18, 7, 0, -16.5, 11, 5, "estante");
  M.caja(15, -8, 0, 16.5, -3, 5, "estante");
  M.caja(-19.5, 10.5, 6, -8, 13.5, 6.3, "metal");
  // la oficina sin techo (x 30..46, y -5..8, 9 m) con la pared oeste caída (y -4.5..3) y un segundo piso
  M.caja(30, -5, 0, 46, -4.5, 9, "concreto"); M.caja(30, 7.5, 0, 46, 8, 9, "concreto");
  M.caja(45.5, -4.5, 0, 46, 7.5, 9, "concreto"); M.caja(30, 3, 0, 30.5, 7.5, 9, "concreto");
  M.caja(39, -4.5, 4.5, 45.5, 7.5, 4.8, "concreto");
  // el puente cubierto entre la nave y la oficina (pasar por debajo: z < 7)
  M.caja(20, 2, 7, 30, 4.5, 9, "oxido");
  // la chimenea, los silos y el tanque de agua
  M.cil(30, 24, 2.2, 0, 34, "ladrillo");
  M.cil(-34, 18, 3.5, 0, 16, "silo"); M.cil(-34, 28, 3.5, 0, 16, "silo"); M.cil(-25, 32, 3, 0, 13, "silo");
  for (const [dx, dy] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) M.cil(40 + dx, -24 + dy, 0.25, 0, 14, "oxido");
  M.cil(40, -24, 3.2, 14, 19, "oxido");
  // contenedores (6,1 x 2,4 x 2,6), unos encima de otros, con un pasillo de 3 m
  const cont = (x, y, z, m, girado = false) => girado ? M.caja(x, y, z, x + 2.44, y + 6.1, z + 2.6, m) : M.caja(x, y, z, x + 6.1, y + 2.44, z + 2.6, m);
  cont(8, -28, 0, "cont_r"); cont(8, -28, 2.6, "cont_a"); cont(8, -22.6, 0, "cont_v");
  cont(-17, -30, 0, "cont_a"); cont(-17, -30, 2.6, "cont_r"); cont(-17, -24.6, 0, "cont_r"); cont(-17, -24.6, 2.6, "cont_v"); cont(-17, -24.6, 5.2, "cont_a");
  cont(-30, -8, 0, "cont_v", true); cont(-30, -8, 2.6, "cont_r", true);
  // escombros
  const r = makeRng(41);
  for (let i = 0; i < 16; i++) {
    const a = r.uniform(-Math.PI, Math.PI), d = r.uniform(24, 60), x = Math.cos(a) * d, y = Math.sin(a) * d;
    if (Math.hypot(x, y + 36) < 8) continue;
    M.esf(x, y, -0.4, r.uniform(0.8, 1.6), "escombro");
  }
  // deco: postes de luz, la reja del borde, pasto que sale del asfalto
  for (const [x, y] of [[-8, -20], [8, -14], [24, -14], [-26, 4], [24, 14], [-12, 24]]) M.deco.push({ t: "poste", p: [x, y], h: 7 });
  M.deco.push({ t: "reja", r: 74 });
  M.deco.push({ t: "pasto", n: 260, area: 70, seed: 3 });
  // la pista (2 vueltas): de la entrada al portón, arriba por el hueco del techo, a la oficina, por debajo del puente,
  // la nave de punta a punta, los silos y de vuelta entre los contenedores
  M.gates = [
    [0, -24, 3], [0, -9.75, 3.2], [0, 4, 4], [0, 0, 15], [36, 17, 21], [37, 3, 11], [34, 0, 4.5], [24, -1, 5], [12, 0, 5],
    [-12, 0, 3.5], [-19.75, 3, 3], [-28, 9, 6], [-28.5, 23, 8], [-24, 6, 4], [-24, -16, 3],
  ];
  return limpiar(M);
}

// ---------------- 2 · EL CAÑÓN (velocidad: rectas largas, arcos de roca y agujas) ----------------
function canon() {
  const M = nuevo("canon", {
    nombre: "El cañón", icono: "🏜️",
    desc: "Un cañón del desierto al atardecer: paredes de roca, arcos naturales, mesas y agujas. Para ir RÁPIDO.",
    bounds: { xy: 130, z: 70 }, spawn: [0, -100, 0], yaw: Math.PI / 2,
    ambiente: { cielo: [0x4a6fa8, 0xf2b27a], sol: [-0.6, 0.18, -0.4], solColor: 0xffb070, luz: 0.85, niebla: 0.0045, suelo: "arena", noche: false },
  });
  const r = makeRng(7);
  // el cauce: una línea que serpentea; las paredes son columnas de roca a ±13 m (cilindros gruesos, como el bosque)
  const eje = [[0, -110], [0, -60], [26, -26], [26, 18], [-14, 52], [-14, 110]];
  const lado = (s) => {
    for (let k = 0; k < eje.length - 1; k++) {
      const [x0, y0] = eje[k], [x1, y1] = eje[k + 1], L = Math.hypot(x1 - x0, y1 - y0), ux = (x1 - x0) / L, uy = (y1 - y0) / L;
      for (let d = 0; d < L; d += 6.5) {
        const ancho = 13 + r.uniform(0, 3), rad = r.uniform(4.5, 6.5);
        const x = x0 + ux * d - uy * s * (ancho + rad), y = y0 + uy * d + ux * s * (ancho + rad);
        M.cil(x, y, rad, 0, r.uniform(16, 30), r() < 0.5 ? "roca" : "roca2");
      }
    }
  };
  lado(1); lado(-1);
  // arcos de roca sobre el cauce (dos patas + el techo)
  const arco = (x, y, horiz, alto) => {
    if (horiz) { M.cil(x - 7, y, 2.2, 0, alto + 3, "roca"); M.cil(x + 7, y, 2.2, 0, alto + 3, "roca"); M.caja(x - 9, y - 2, alto, x + 9, y + 2, alto + 3.5, "roca2"); }
    else { M.cil(x, y - 7, 2.2, 0, alto + 3, "roca"); M.cil(x, y + 7, 2.2, 0, alto + 3, "roca"); M.caja(x - 2, y - 9, alto, x + 2, y + 9, alto + 3.5, "roca2"); }
  };
  arco(0, -80, true, 9);
  arco(26, -5, true, 7);
  // agujas y rocas sueltas en el cauce (fuera de la línea de la pista)
  for (const [x, y, rad, h] of [[-5, -45, 1.6, 14], [32, 0, 1.4, 11], [18, 32, 1.5, 16], [-20, 70, 1.8, 13], [-6, 88, 1.3, 9]]) M.cil(x, y, rad, 0, h, "roca");
  for (const [x, y, rad] of [[7, -96, 2.2], [-6, -64, 1.8], [18, -30, 2.4], [20, 8, 1.6], [-4, 45, 2.2], [-19, 95, 2]]) M.esf(x, y, -0.6, rad, "roca2");
  // las mesas del fondo (afuera del cauce; solo para ver y para volar alto)
  for (const [x, y, rad, h] of [[-60, -40, 16, 34], [62, -70, 14, 28], [70, 40, 18, 38], [-62, 60, 15, 30], [40, 95, 12, 26], [-50, -100, 13, 24]]) M.cil(x, y, rad, 0, h, "mesa");
  // deco: cactus, matas secas y el río seco
  M.deco.push({ t: "cactus", n: 70, area: 120, seed: 9 });
  M.deco.push({ t: "rio", eje });
  M.gates = [
    [0, -88, 4], [0, -80, 5.5], [0, -62, 5], [14, -44, 7], [26, -24, 4], [26, -5, 4], [26, 12, 6], [14, 26, 9],
    [-6, 44, 6], [-14, 64, 4], [-14, 96, 7], [-14, 104, 14], [-14, 70, 34], [20, 10, 34], [10, -50, 34], [-1, -66, 6], [3, -100, 5],
  ];
  return limpiar(M);
}

// ---------------- 3 · EL ESTADIO (de noche, con neón: la pista de carreras de la liga) ----------------
function estadio() {
  const M = nuevo("estadio", {
    nombre: "El estadio de noche", icono: "🏟️",
    desc: "Una pista de carreras de drones con luces de neón: torre para tirarse en picada, túnel, escalera de portales y tribunas.",
    bounds: { xy: 75, z: 40 }, spawn: [-30, -20, 0], yaw: 0,
    ambiente: { cielo: [0x050814, 0x14203a], sol: [0.3, 0.7, 0.2], solColor: 0x9fb4ff, luz: 0.32, niebla: 0.008, suelo: "pasto", noche: true },
  });
  // las tribunas: 3 escalones por lado alrededor de la cancha (x -50..50, y -32..32)
  const esc = (i) => 3 + i * 3;
  for (let i = 0; i < 3; i++) {
    const a = 50 + i * 4, b = 32 + i * 4;
    M.caja(-a - 4, -b - 4, 0, a + 4, -b, esc(i), "tribuna"); M.caja(-a - 4, b, 0, a + 4, b + 4, esc(i), "tribuna");
    M.caja(-a - 4, -b, 0, -a, b, esc(i), "tribuna"); M.caja(a, -b, 0, a + 4, b, esc(i), "tribuna");
  }
  // la torre de la picada: 4 patas y una plataforma arriba (el portal está ENCIMA)
  for (const [dx, dy] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) M.cil(18 + dx, 14 + dy, 0.18, 0, 10, "andamio");
  M.caja(16.2, 12.2, 10, 19.8, 15.8, 10.4, "andamio");
  // el túnel (x 10..26, y -2.5..2.5, 3.6 m de alto)
  M.caja(10, -2.7, 0, 26, -2.5, 3.6, "neon_azul"); M.caja(10, 2.5, 0, 26, 2.7, 3.6, "neon_azul");
  M.caja(10, -2.7, 3.6, 26, 2.7, 3.9, "tunel");
  // la escalera: un marco con 3 pisos de portales (se pasa por el de arriba)
  M.caja(-14.6, 15.8, 0, -14.2, 16.2, 9.6, "andamio"); M.caja(-9.8, 15.8, 0, -9.4, 16.2, 9.6, "andamio");
  for (const z of [3.1, 6.3]) M.caja(-14.6, 15.8, z, -9.4, 16.2, z + 0.2, "andamio");
  // vallas bajas, banderas y la pantalla gigante
  for (const [x0, x1, y] of [[-40, -30, -8], [-26, -16, -6], [30, 40, 8], [-8, 2, -22]]) M.caja(x0, y - 0.15, 0, x1, y + 0.15, 1.1, "valla");
  for (const [x, y] of [[-36, 20], [-20, 26], [0, 27], [20, 26], [36, 20], [40, -20], [0, -27], [-40, 0]]) M.deco.push({ t: "bandera", p: [x, y] });
  M.caja(-6, 33, 9, 6, 34, 16, "pantalla"); M.cil(-3, 33.5, 0.3, 0, 9, "andamio"); M.cil(3, 33.5, 0.3, 0, 9, "andamio");
  // las torres de luz en las esquinas
  for (const [x, y] of [[-58, -40], [58, -40], [-58, 40], [58, 40]]) { M.cil(x, y, 0.6, 0, 26, "andamio"); M.deco.push({ t: "reflector", p: [x, y, 27] }); }
  M.deco.push({ t: "lineas" });
  M.gates = [
    [-20, -20, 2], [0, -16, 2.5], [8, 0, 1.8], [28, 0, 1.8], [36, 10, 9], [18, 14, 13.5], [18, 28, 3], [-11.9, 28, 7],
    [-11.9, 16, 8], [-11.9, 2, 3], [-38, -4, 2.5], [-32, -16, 2],
  ];
  return limpiar(M);
}

export const MAPAS = { fabrica: fabrica(), canon: canon(), estadio: estadio() };
export const ORDEN = ["fabrica", "canon", "estadio"];

/** El mapa -> el formato de Level (game/sim.js): lo que choca. */
export function nivelDe(M, goals = M.gates) {
  return {
    spawn: M.spawn, goals,
    boxes: M.boxes.map((b) => ({ min: b.min, max: b.max })),
    spheres: M.sphs.map((s) => ({ center: s.c, radius: s.r })),
    cylinders: M.cyls.map((c) => ({ center: c.c, radius: c.r, z: c.z })),
    bounds: M.bounds,
  };
}

/** Hacia dónde mira cada portal: la dirección promedio de llegar y de salir (la pista es una vuelta). */
export function orientaciones(gates, spawn) {
  return gates.map((g, i) => {
    const a = i ? gates[i - 1] : spawn, b = gates[(i + 1) % gates.length];
    const d1 = [g[0] - a[0], g[1] - a[1], g[2] - a[2]], d2 = [b[0] - g[0], b[1] - g[1], b[2] - g[2]];
    const n1 = Math.hypot(...d1) || 1, n2 = Math.hypot(...d2) || 1;
    const d = [d1[0] / n1 + d2[0] / n2, d1[1] / n1 + d2[1] / n2, d1[2] / n1 + d2[2] / n2];
    const n = Math.hypot(...d) || 1;
    return d.map((x) => x / n);
  });
}

/** ¿Pasó por el portal? El tramo de a a b pasa a menos de `r` m del centro. */
export function cruza(a, b, g, r = 1.25) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ag = [g[0] - a[0], g[1] - a[1], g[2] - a[2]];
  const L2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
  const u = L2 > 1e-9 ? Math.min(1, Math.max(0, (ab[0] * ag[0] + ab[1] * ag[1] + ab[2] * ag[2]) / L2)) : 0;
  return Math.hypot(a[0] + ab[0] * u - g[0], a[1] + ab[1] * u - g[1], a[2] + ab[2] * u - g[2]) < r;
}
