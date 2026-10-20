// =====================================================================
// LOS MAPAS DEL FREESTYLE (app/freestyle.js): la fábrica abandonada, el cañón y el estadio de noche.
// Solo datos (sin Three.js): las piezas que chocan (cajas, cilindros y esferas, las mismas formas que el entrenamiento:
// game/sim.js Level) con su material, lo que solo se dibuja (deco) y la pista de portales.
// Ejes como la simulación: X y Y en el piso, Z arriba (metros). La línea recta entre dos portales seguidos queda libre
// (app/test_freestyle.mjs lo revisa): así la IA rival (entrenada en el nivel 16 · Carrera) puede seguir la pista.
// Cada pista tiene sus TRAMOS (M.tramos[i] = [tipo, nombre] del portal i): recta (para ir rápido), picada (bajar de golpe),
// splits (un split-S: medio tonel y bajar dando la vuelta), hueco (por dentro de algo) y cerrada (una curva de 90° o más).
// El test revisa que cada tramo sea lo que dice (la recta es larga, el split-S da la vuelta…).
// M.dirs[i] = hacia dónde mira el portal i (si no, el promedio de llegar y salir: orientaciones()).
// Las cajas con `forma: "tubo"` se dibujan como un tubo acostado (chocan como su caja).
// =====================================================================
import { makeRng } from "../game/sim.js";

function nuevo(id, extra) {
  const M = { id, boxes: [], cyls: [], sphs: [], deco: [], gates: [], tramos: {}, dirs: {}, spawn: [0, 0, 0], yaw: 0, ...extra };
  M.caja = (x0, y0, z0, x1, y1, z1, m, forma) => M.boxes.push({ min: [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)], max: [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)], m, ...(forma ? { forma } : {}) });
  M.cil = (x, y, r, z0, z1, m) => M.cyls.push({ c: [x, y], r, z: [z0, z1], m });
  M.esf = (x, y, z, r, m) => M.sphs.push({ c: [x, y, z], r, m });
  /** La pista: [x, y, z, tipo?, nombre?, dir?] -> M.gates, M.tramos, M.dirs. */
  M.pista = (lista) => lista.forEach(([x, y, z, tipo, nombre, dir], i) => {
    M.gates.push([x, y, z]);
    if (tipo) M.tramos[i] = [tipo, nombre];
    if (dir) M.dirs[i] = dir;
  });
  return M;
}
const limpiar = (M) => { delete M.caja; delete M.cil; delete M.esf; delete M.pista; return M; };

// ---------------- 1 · LA FÁBRICA ABANDONADA (bando FPV: entrar por puertas, salir por el techo roto) ----------------
function fabrica() {
  const M = nuevo("fabrica", {
    nombre: "La fábrica abandonada", icono: "🏭",
    desc: "Una nave industrial con el techo roto, silos, una chimenea y contenedores. Para FPV: puertas, ventanas y huecos.",
    bounds: { xy: 80, z: 45 }, spawn: [0, -36, 0], yaw: Math.PI / 2,
    ambiente: { cielo: [0x5d7fa6, 0xf0c99a], cenit: 0x2d4f7c, sol: [-0.5, 0.55, 0.66], solColor: 0xffc48a, luz: 1.0, niebla: 0.0033, bruma: 0xbcb6a8,
      nubes: 0.55, suelo: "asfalto", noche: false, exposicion: 1.0 },
  });
  const T = 0.5, H = 12;                                        // la nave: x -20..20, y -10..14, 12 m de alto
  // pared sur (y -10): portón x -4..4 (7 m) y una ventana rota x -15..-9 (z 4..7)
  M.caja(-20, -10, 0, -15, -10 + T, H, "ladrillo");
  M.caja(-15, -10, 0, -9, -10 + T, 4, "ladrillo"); M.caja(-15, -10, 7, -9, -10 + T, H, "ladrillo");
  M.caja(-9, -10, 0, -4, -10 + T, H, "ladrillo");
  M.caja(-4, -10, 7, 4, -10 + T, H, "ladrillo");
  M.caja(4, -10, 0, 20, -10 + T, H, "ladrillo");
  // pared norte (y 14): ventanal x -7..1 (z 4..8,5) y portón de carga x 8..16 (8 m)
  M.caja(-20, 14 - T, 0, -7, 14, H, "ladrillo");
  M.caja(-7, 14 - T, 0, 1, 14, 4, "ladrillo"); M.caja(-7, 14 - T, 8.5, 1, 14, H, "ladrillo");
  M.caja(1, 14 - T, 0, 8, 14, H, "ladrillo");
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
  // adentro: columnas, la viga de la grúa con su carro, la pasarela del sur, estanterías, máquinas y el entrepiso
  for (const x of [-12, -4, 4, 12]) for (const y of [-4, 4]) M.cil(x, y, 0.35, 0, H, "metal");
  M.caja(-19.5, 7.6, 8, 19.5, 8.4, 8.8, "maquina");
  M.caja(-9, 7.1, 7.3, -6.6, 8.9, 8, "oxido");
  M.deco.push({ t: "cadena", p: [-7.8, 8, 7.3], largo: 2.6 });
  M.caja(-19.5, -9.5, 7.5, -5, -8, 7.7, "reja"); M.caja(5, -9.5, 7.5, 19.5, -8, 7.7, "reja");
  M.deco.push({ t: "baranda", a: [-19.5, -8, 7.7], b: [-5, -8, 7.7] }, { t: "baranda", a: [5, -8, 7.7], b: [19.5, -8, 7.7] });
  M.caja(-18, -7, 0, -16.5, -1, 5, "estante"); M.caja(-18, 7, 0, -16.5, 11, 5, "estante");
  M.caja(15, -8, 0, 16.5, -3, 5, "estante");
  M.caja(-19.5, 10.5, 6, -10, 13.5, 6.3, "reja");
  M.deco.push({ t: "baranda", a: [-19.5, 10.5, 6.3], b: [-10, 10.5, 6.3] });
  M.caja(8, 6.5, 0, 13, 9.5, 3.2, "maquina"); M.caja(9.5, 7.2, 3.2, 11.5, 8.8, 5.4, "metal");          // la prensa
  M.caja(-15, -9, 0, -11, -7, 1.6, "maquina");                                                        // un torno
  // la oficina sin techo (x 30..46, y -5..8, 9 m): la pared oeste caída, un entrepiso y una ventana al este
  M.caja(30, -5, 0, 46, -4.5, 9, "concreto"); M.caja(30, 7.5, 0, 46, 8, 9, "concreto");
  M.caja(45.5, -4.5, 0, 46, -1.5, 9, "concreto"); M.caja(45.5, 3.5, 0, 46, 7.5, 9, "concreto");
  M.caja(45.5, -1.5, 0, 46, 3.5, 0.8, "concreto"); M.caja(45.5, -1.5, 4.6, 46, 3.5, 9, "concreto");
  M.caja(30, 5, 0, 30.5, 7.5, 9, "concreto");
  M.caja(39, -4.5, 4.5, 45.5, 7.5, 4.8, "concreto");
  // el puente cubierto entre la nave y la oficina (pasar por debajo: z < 7)
  M.caja(20, 2, 7, 30, 4.5, 9, "oxido");
  // la chimenea, los silos con su cañería y el tanque de agua
  M.cil(30, 24, 2.2, 0, 34, "ladrillo");
  M.deco.push({ t: "humo", p: [30, 24, 34] }, { t: "baliza", p: [30, 24, 34.4] });
  M.cil(-34, 18, 3.5, 0, 16, "silo"); M.cil(-34, 28, 3.5, 0, 16, "silo"); M.cil(-25, 33, 3, 0, 13, "silo");
  M.deco.push({ t: "escalera", p: [-34, 18], r: 3.5, h: 16, ang: 0 }, { t: "escalera", p: [-34, 28], r: 3.5, h: 16, ang: 0 });
  M.caja(-16.5, 14, 8, -15.5, 38, 9, "tubo", "tubo"); M.cil(-16, 30, 0.3, 0, 8, "metal"); M.cil(-16, 38, 0.3, 0, 8, "metal");
  M.caja(-31, 9.6, 9.6, -20, 10.4, 10.4, "tubo", "tubo");
  for (const [dx, dy] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) M.cil(53 + dx, 30 + dy, 0.25, 0, 14, "oxido");
  M.cil(53, 30, 3.2, 14, 19, "oxido");
  M.deco.push({ t: "baliza", p: [53, 30, 19.3] });
  // contenedores (6,1 x 2,4 x 2,6) a los dos lados de la salida
  const cont = (x, y, z, m, girado = false) => girado ? M.caja(x, y, z, x + 2.44, y + 6.1, z + 2.6, m) : M.caja(x, y, z, x + 6.1, y + 2.44, z + 2.6, m);
  cont(8, -28, 0, "cont_r"); cont(8, -28, 2.6, "cont_a"); cont(8, -22.6, 0, "cont_v");
  cont(-17, -30, 0, "cont_a"); cont(-17, -30, 2.6, "cont_r"); cont(-17, -24.6, 0, "cont_r"); cont(-17, -24.6, 2.6, "cont_v"); cont(-17, -24.6, 5.2, "cont_a");
  cont(-30, -8, 0, "cont_v", true); cont(-30, -8, 2.6, "cont_r", true);
  cont(24, -30, 0, "cont_a", true); cont(27, -30, 0, "cont_v", true); cont(25.5, -30, 2.6, "cont_r", true);
  // un camión viejo y barriles
  M.caja(-40, -22, 0, -32, -19.5, 3.4, "cont_a"); M.caja(-31.8, -22, 0, -29.4, -19.5, 2.6, "camion");
  for (const [x, y] of [[-14, 16], [-13, 17.2], [-12, 16.2], [17, -14], [18.1, -14.4], [35, 10.5], [36, 11.3], [-22, -12]]) M.cil(x, y, 0.42, 0, 1.2, "barril");
  // escombros (lejos de la pista)
  const r = makeRng(41);
  for (let i = 0; i < 16; i++) {
    const a = r.uniform(-Math.PI, Math.PI), d = r.uniform(24, 60), x = Math.cos(a) * d, y = Math.sin(a) * d;
    if (Math.hypot(x, y + 36) < 8 || Math.hypot(x - 58, y - 10) < 10 || Math.hypot(x + 38, y - 23) < 8) continue;
    M.esf(x, y, -0.4, r.uniform(0.8, 1.6), "escombro");
  }
  // deco: postes de luz, letreros, la reja del borde, charcos, rayos de sol por el techo roto y pasto que sale del asfalto
  for (const [x, y] of [[-8, -20], [6, -16], [24, -14], [-26, 4], [24, 14], [-10, 24], [60, -10], [60, 20]]) M.deco.push({ t: "poste", p: [x, y], h: 7 });
  M.deco.push({ t: "letrero", p: [0, -10.05, 9.6], w: 14, h: 2.2, cara: "s", txt: "METALÚRGICA ANDES", sub: "desde 1962", estilo: "pintado" });
  M.deco.push({ t: "letrero", p: [38, -5.05, 7.2], w: 7, h: 1.4, cara: "s", txt: "OFICINAS", estilo: "pintado" });
  M.deco.push({ t: "letrero", p: [12, 14.05, 9.8], w: 6, h: 1.2, cara: "n", txt: "CARGA · DESCARGA", estilo: "amarillo" });
  M.deco.push({ t: "letrero", p: [-34, 14.45, 11], w: 4.2, h: 2.4, cara: "s", txt: "SILO 1", estilo: "silo" });
  M.deco.push({ t: "rayos", huecos: [[-6, -3, 6, 3], [0, 9, 20, 14]], z: 12 });
  M.deco.push({ t: "reja", r: 74 });
  M.deco.push({ t: "losa", r: [-26, -16, 50, 20] }, { t: "camino", r: [-4, -120, 4, -16] }, { t: "camino", r: [4, -46, 120, -38] });
  M.deco.push({ t: "arboles", n: 160, r0: 78, r1: 140, seed: 5 });
  M.deco.push({ t: "horizonte", r0: 230, r1: 340, seed: 6, estilo: "cerros" });
  M.deco.push({ t: "charcos", n: 18, area: 60, seed: 4 });
  M.deco.push({ t: "pasto", n: 420, area: 72, seed: 3 });
  // la pista (2 vueltas): la recta entre contenedores, subir y TIRARSE por el hueco del techo, salir por la pared caída,
  // bajo el puente, la oficina por debajo del entrepiso y por la ventana, las patas del tanque, la chimenea, la cañería,
  // un SPLIT-S sobre los silos, entre los silos, bajo la cañería y la nave en diagonal de ventana a ventana
  M.pista([
    [0, -24, 3, "cerrada", "La horquilla"],
    [0, -15.5, 14],
    [0, -1, 14.5, "picada", "Picada por el techo", [0, 0, -1]],
    [6, 1, 3.5],
    [19.75, 3, 5.5, "hueco", "La pared caída"],
    [25, 3.25, 4.2, "hueco", "Bajo el puente"],
    [33, 1.5, 2.6],
    [42, 1, 2.5, "hueco", "Bajo el entrepiso"],
    [45.75, 1, 2.5, "hueco", "La ventana"],
    [56, 6, 5],
    [53, 30, 7, "hueco", "Entre las patas"],
    [30, 31, 6.5],
    [-6, 40, 10, "recta", "La recta norte"],
    [-44, 23, 23, "splits", "Split-S", [-1, 0, 0]],
    [-39, 23, 6, null, null, [1, 0, 0]],
    [-34, 23, 5.5, "hueco", "Entre los silos"],
    [-16, 22, 4.5, "hueco", "Bajo la cañería"],
    [-3, 13.75, 6.2, "hueco", "El ventanal"],
    [-12, -9.75, 5.5, "hueco", "La ventana rota"],
  ]);
  return limpiar(M);
}

// ---------------- 2 · EL CAÑÓN (velocidad: rectas largas, arcos de roca y agujas) ----------------
function canon() {
  const M = nuevo("canon", {
    nombre: "El cañón", icono: "🏜️",
    desc: "Un cañón del desierto al atardecer: paredes de roca, arcos naturales, mesas y agujas. Para ir RÁPIDO.",
    bounds: { xy: 130, z: 70 }, spawn: [0, -100, 0], yaw: Math.PI / 2,
    ambiente: { cielo: [0x3f6aa8, 0xffb070], cenit: 0x1d3a72, sol: [-0.62, 0.16, -0.42], solColor: 0xffa860, luz: 0.95, niebla: 0.0024, bruma: 0xe2a77a,
      nubes: 0.35, suelo: "arena", noche: false, exposicion: 1.05 },
  });
  const r = makeRng(7);
  // el cauce: una línea que serpentea; las paredes son columnas de roca a ±13 m (cilindros gruesos, como el bosque)
  const eje = [[0, -118], [0, -60], [26, -26], [26, 18], [-14, 52], [-14, 118]];
  const lado = (s) => {
    for (let k = 0; k < eje.length - 1; k++) {
      const [x0, y0] = eje[k], [x1, y1] = eje[k + 1], L = Math.hypot(x1 - x0, y1 - y0), ux = (x1 - x0) / L, uy = (y1 - y0) / L;
      for (let d = 0; d < L; d += 6.5) {
        const ancho = 13 + r.uniform(0, 3), rad = r.uniform(4.5, 6.5);
        const x = x0 + ux * d - uy * s * (ancho + rad), y = y0 + uy * d + ux * s * (ancho + rad);
        M.cil(x, y, rad, 0, r.uniform(16, 30), r() < 0.5 ? "roca" : "roca2");
        if (r() < 0.6) {                                          // detrás, más roca (la pared se ve llena, no de columnas)
          const atras = ancho + rad + r.uniform(7, 10), rb = r.uniform(6, 9);
          M.cil(x0 + ux * d - uy * s * atras, y0 + uy * d + ux * s * atras, rb, 0, r.uniform(12, 22), "roca2");
        }
      }
    }
  };
  lado(1); lado(-1);
  // arcos de roca sobre el cauce (dos patas + el techo)
  const arco = (x, y, horiz, alto) => {
    if (horiz) { M.cil(x - 7, y, 2.2, 0, alto + 3, "roca"); M.cil(x + 7, y, 2.2, 0, alto + 3, "roca"); M.caja(x - 9, y - 2, alto, x + 9, y + 2, alto + 3.5, "roca2"); }
    else { M.cil(x, y - 7, 2.2, 0, alto + 3, "roca"); M.cil(x, y + 7, 2.2, 0, alto + 3, "roca"); M.caja(x - 2, y - 9, alto, x + 2, y + 9, alto + 3.5, "roca2"); }
  };
  arco(0, -80, true, 8);
  arco(26, -5, true, 7);
  // el puente del tren minero (de madera) cruza el cauce en y 78: pasar por el vano del medio, bajo la vía
  M.caja(-34, 77, 11, 6, 79, 12, "madera");
  for (const x of [-30, -24, -17, -11, -4, 2]) { M.cil(x, 77.3, 0.35, 0, 11, "madera"); M.cil(x, 78.7, 0.35, 0, 11, "madera"); }
  for (const [x0, x1] of [[-30, -24], [-24, -17], [-11, -4], [-4, 2]]) M.caja(x0, 77.8, 5.5, x1, 78.2, 5.9, "madera");
  M.deco.push({ t: "riel", a: [-34, 78, 12], b: [6, 78, 12] });
  M.caja(-27, 77.4, 12, -25, 78.6, 13.4, "oxido");                                          // un carro minero abandonado
  // agujas y rocas sueltas en el cauce (fuera de la línea de la pista)
  for (const [x, y, rad, h] of [[-5, -45, 1.6, 14], [34, 0, 1.4, 11], [20, 33, 1.5, 16], [-21, 66, 1.8, 13], [-14, 100, 1.8, 20]]) M.cil(x, y, rad, 0, h, "roca");
  for (const [x, y, rad] of [[7, -96, 2.2], [-7, -64, 1.8], [18, -30, 2.4], [20, 8, 1.6], [-4, 46, 2.2], [-20, 92, 2]]) M.esf(x, y, -0.6, rad, "roca2");
  // la mesa del mirador (junto al cauce: se pasa rasante por encima) y las mesas del fondo (afuera)
  M.cil(52, -24, 11, 0, 26, "mesa");
  for (const [x, y, rad, h] of [[-60, -40, 16, 34], [76, -96, 13, 28], [70, 40, 18, 38], [-62, 60, 15, 30], [40, 98, 12, 26], [-52, -100, 13, 24]]) M.cil(x, y, rad, 0, h, "mesa");
  // deco: el río (agua de verdad), cactus, matas, globos, águilas y los acantilados del horizonte
  M.deco.push({ t: "agua", eje });
  M.deco.push({ t: "cactus", n: 90, area: 125, seed: 9 });
  M.deco.push({ t: "matas", n: 260, area: 125, seed: 10 });
  M.deco.push({ t: "globos", lista: [[-90, 40, 90, 0xd8402a], [110, -60, 105, 0x2a7ad8], [40, 160, 80, 0xf0b400]] });
  M.deco.push({ t: "aguilas", c: [10, 0, 55], n: 3 });
  M.deco.push({ t: "horizonte", r0: 190, r1: 330, seed: 12 });
  M.deco.push({ t: "letrero", p: [-14, 76.9, 9.6], w: 5, h: 0.9, cara: "s", txt: "MINA SAN JOSÉ · 1898", estilo: "madera" });
  // la pista: el cauce hacia el norte (bajo los dos arcos y el puente del tren), una VUELTA arriba de la aguja, la recta
  // alta por encima de las paredes, rasante sobre la mesa y un SPLIT-S para volver a entrar al cañón
  M.pista([
    [0, -88, 4],
    [0, -80, 5, "hueco", "El arco"],
    [0, -62, 5],
    [14, -44, 6],
    [26, -24, 4],
    [26, -5, 4, "hueco", "El arco bajo"],
    [26, 12, 6],
    [8, 34, 6, "recta", "El cauce"],
    [-6, 44, 6],
    [-14, 64, 4],
    [-14, 78, 5.5, "hueco", "Bajo el puente del tren"],
    [-8, 94, 6],
    [-11, 108, 13, "cerrada", "La aguja"],
    [-14, 98, 30],
    [12, 30, 36, "recta", "La recta alta"],
    [60, -32, 30, "picada", "Picada desde la mesa"],
    [80, -56, 7],
    [40, -70, 30],
    [2, -112, 36, "splits", "Split-S", [0, -1, 0]],
    [0, -97, 6, null, null, [0, 1, 0]],
  ]);
  return limpiar(M);
}

// ---------------- 3 · EL ESTADIO (de noche, con neón: la pista de carreras de la liga) ----------------
function estadio() {
  const M = nuevo("estadio", {
    nombre: "El estadio de noche", icono: "🏟️",
    desc: "Una pista de carreras de drones con luces de neón: torre para tirarse en picada, túnel, escalera de portales y tribunas.",
    bounds: { xy: 75, z: 40 }, spawn: [-30, -20, 0], yaw: 0,
    ambiente: { cielo: [0x0b1430, 0x24345e], cenit: 0x03060f, sol: [0.3, 0.7, 0.2], solColor: 0x9fb4ff, luz: 0.32, niebla: 0.0055, bruma: 0x0c1428,
      nubes: 0.25, suelo: "pasto", noche: true, exposicion: 1.0 },
  });
  // las tribunas: 3 escalones por lado alrededor de la cancha (x -50..50, y -32..32)
  const esc = (i) => 3 + i * 3;
  for (let i = 0; i < 3; i++) {
    const a = 50 + i * 4, b = 32 + i * 4;
    M.caja(-a - 4, -b - 4, 0, a + 4, -b, esc(i), "tribuna"); M.caja(-a - 4, b, 0, a + 4, b + 4, esc(i), "tribuna");
    M.caja(-a - 4, -b, 0, -a, b, esc(i), "tribuna"); M.caja(a, -b, 0, a + 4, b, esc(i), "tribuna");
  }
  // el techo de las tribunas (a 20 m: se puede pasar por debajo, por el lado de la cancha)
  for (const s of [-1, 1]) M.caja(-66, s * 40, 20, 66, s * 50, 20.6, "techo_est");
  for (const s of [-1, 1]) M.caja(s * 58, -40, 20, s * 68, 40, 20.6, "techo_est");
  for (const x of [-48, -24, 0, 24, 48]) for (const s of [-1, 1]) M.cil(x, s * 49, 0.5, 0, 20, "andamio");
  // la torre de la picada: 4 patas y una plataforma arriba (el portal está ENCIMA)
  for (const [dx, dy] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) M.cil(18 + dx, 14 + dy, 0.18, 0, 10, "andamio");
  M.caja(16.2, 12.2, 10, 19.8, 15.8, 10.4, "andamio");
  // el túnel (x 10..26, y -2.5..2.5, 3.6 m de alto): paneles oscuros con aros de neón
  M.caja(10, -2.7, 0, 26, -2.5, 3.6, "panel"); M.caja(10, 2.5, 0, 26, 2.7, 3.6, "panel");
  M.caja(10, -2.7, 3.6, 26, 2.7, 3.9, "panel");
  M.deco.push({ t: "aros_tunel", x0: 10, x1: 26, y: 2.6, h: 3.75, n: 9 });
  // la escalera: un marco con 3 pisos de portales (se pasa por el de arriba)
  M.caja(-14.6, 15.8, 0, -14.2, 16.2, 9.6, "andamio"); M.caja(-9.8, 15.8, 0, -9.4, 16.2, 9.6, "andamio");
  for (const z of [3.1, 6.3]) M.caja(-14.6, 15.8, z, -9.4, 16.2, z + 0.2, "andamio");
  M.caja(-14.6, 15.8, 9.6, -9.4, 16.2, 9.9, "neon_azul");
  // el arco de largada (x -24) y las vallas bajas
  M.cil(-24, -26, 0.35, 0, 7, "andamio"); M.cil(-24, -14, 0.35, 0, 7, "andamio");
  M.caja(-24.5, -26.4, 6, -23.5, -13.6, 7.2, "panel");
  M.deco.push({ t: "largada", p: [-24, -20, 6.6], ancho: 12 });
  for (const [x0, x1, y] of [[-46, -38, -8], [-6, 4, -27], [30, 40, 8], [-36, -28, 10]]) M.caja(x0, y - 0.15, 0, x1, y + 0.15, 1.1, "valla");
  // la pantalla gigante (norte) y las torres de luz en las esquinas
  M.caja(-8, 33, 9, 8, 34, 17, "pantalla"); M.cil(-4, 33.5, 0.35, 0, 9, "andamio"); M.cil(4, 33.5, 0.35, 0, 9, "andamio");
  for (const [x, y] of [[-58, -40], [58, -40], [-58, 40], [58, 40]]) { M.cil(x, y, 0.6, 0, 26, "andamio"); M.deco.push({ t: "reflector", p: [x, y, 27] }); }
  for (const [x, y] of [[-36, 20], [-20, 27], [20, 27], [36, 20], [40, -20], [0, -27.5], [-44, 2]]) M.deco.push({ t: "bandera", p: [x, y] });
  M.deco.push({ t: "lineas" }, { t: "publico" }, { t: "led" }, { t: "flashes", n: 260 }, { t: "ciudad", n: 90, r0: 120, r1: 260, seed: 8 });
  // la pista: la recta de largada, el túnel, subir a la torre y TIRARSE en picada, la escalera por arriba y un SPLIT-S
  // para volver a la recta
  M.pista([
    [-20, -20, 2, "recta", "Recta principal", [1, 0, 0]],
    [4, -20, 2.5, "recta", "La recta de largada"],
    [9, 0, 1.8, "hueco", "El túnel"],
    [27, 0, 1.8],
    [42, 6, 5, "cerrada", "Curva de la torre"],
    [36, 22, 12],
    [18, 14, 13.5, "picada", "La torre", [-0.3, -0.5, -0.8]],
    [12, 28, 3],
    [-11.9, 28, 7],
    [-11.9, 16, 8, "hueco", "La escalera"],
    [-39, -12, 17, "splits", "Split-S", [-1, 0, 0]],
    [-34, -12, 4, null, null, [1, 0, 0]],
  ]);
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

/** Hacia dónde mira cada portal: la dirección promedio de llegar y de salir (la pista es una vuelta), o la que fija M.dirs. */
export function orientaciones(gates, spawn, fijas = {}) {
  return gates.map((g, i) => {
    if (fijas[i]) { const n = Math.hypot(...fijas[i]) || 1; return fijas[i].map((x) => x / n); }
    const a = i ? gates[i - 1] : spawn, b = gates[(i + 1) % gates.length];
    const d1 = [g[0] - a[0], g[1] - a[1], g[2] - a[2]], d2 = [b[0] - g[0], b[1] - g[1], b[2] - g[2]];
    const n1 = Math.hypot(...d1) || 1, n2 = Math.hypot(...d2) || 1;
    const d = [d1[0] / n1 + d2[0] / n2, d1[1] / n1 + d2[1] / n2, d1[2] / n1 + d2[2] / n2];
    const n = Math.hypot(...d) || 1;
    return d.map((x) => x / n);
  });
}

/**
 * La línea de carrera: una curva suave por los portales (Catmull-Rom centrípeta, cerrada) que se dibuja como una guía.
 * Donde la curva se acerca a algo (menos de `holgura` m) ese tramo vuelve a la recta (que el test revisa que queda libre).
 * nivel = un Level (game/sim.js). Devuelve [[x, y, z, i]…] (i = el portal al que va ese punto).
 */
export function lineaCarrera(M, nivel, paso = 1.2, holgura = 0.9) {
  const G = M.gates, n = G.length, out = [];
  const cr = (p0, p1, p2, p3, u) => {                   // Catmull-Rom centrípeta (sin lazos en los giros cerrados)
    const tj = (a, b) => Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), 0.5) || 1e-3;
    const t1 = tj(p0, p1), t2 = t1 + tj(p1, p2), t3 = t2 + tj(p2, p3), t = t1 + (t2 - t1) * u;
    const L = (a, b, ta, tb) => a.map((x, k) => ((tb - t) * x + (t - ta) * b[k]) / (tb - ta));
    const A1 = L(p0, p1, 0, t1), A2 = L(p1, p2, t1, t2), A3 = L(p2, p3, t2, t3);
    const B1 = L(A1, A2, 0, t2), B2 = L(A2, A3, t1, t3);
    return L(B1, B2, t1, t2);
  };
  for (let i = 0; i < n; i++) {
    const p0 = G[(i - 1 + n) % n], p1 = G[i], p2 = G[(i + 1) % n], p3 = G[(i + 2) % n];
    const largo = Math.hypot(p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]), k = Math.max(2, Math.ceil(largo / paso));
    let tramo = [];
    for (let j = 0; j < k; j++) tramo.push(cr(p0, p1, p2, p3, j / k));
    if (tramo.some((p) => p[2] < 0.6 || nivel.collides(p, holgura))) tramo = tramo.map((_, j) => p1.map((x, q) => x + (p2[q] - x) * (j / k)));
    for (const p of tramo) out.push([...p, (i + 1) % n]);
  }
  return out;
}

/** ¿Pasó por el portal? El tramo de a a b pasa a menos de `r` m del centro. */
export function cruza(a, b, g, r = 1.25) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ag = [g[0] - a[0], g[1] - a[1], g[2] - a[2]];
  const L2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
  const u = L2 > 1e-9 ? Math.min(1, Math.max(0, (ab[0] * ag[0] + ab[1] * ag[1] + ab[2] * ag[2]) / L2)) : 0;
  return Math.hypot(a[0] + ab[0] * u - g[0], a[1] + ab[1] * u - g[1], a[2] + ab[2] * u - g[2]) < r;
}
