// EL RADAR DE LA PERSECUCIÓN (freestyle.js, modo persecución): dónde están los cazadores mirando desde tu dron.
// - el radar redondo abajo a la derecha: tú al centro mirando hacia arriba, cada cazador un punto (▲ si va más arriba
//   que tú, ▼ si más abajo), anillos cada 10 m y un barrido; el borde se pone rojo cuando uno está cerca;
// - en la pantalla: una marca roja sobre el cazador si lo ves, o una flecha en el borde hacia donde está;
// - el sensor de proximidad: el borde de la pantalla se enrojece hacia su lado, "¡DETRÁS DE TI!" y un pitido que se
//   acelera como el sensor de un auto al estacionar (cadencia()).
// Lo de las cuentas (relativo, cadencia, acercandose) es puro: test_freestyle.mjs lo prueba.

export const RADAR_M = 40;             // el radar ve hasta 40 m
export const CERCA_M = 12;             // más cerca que esto: el borde rojo y "¡cerca!"

/** Otro dron visto desde el tuyo (ejes de la simulación: X adelante, Y izquierda, Z arriba; yaw desde X).
 *  -> {adelante, izq, arriba, dist, ang}: ang = 0 adelante, + hacia la izquierda (radianes). */
export function relativo(yo, yaw, otro) {
  const dx = otro[0] - yo[0], dy = otro[1] - yo[1], dz = otro[2] - yo[2];
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const adelante = dx * c + dy * s, izq = -dx * s + dy * c;
  return { adelante, izq, arriba: dz, dist: Math.hypot(dx, dy, dz), ang: Math.atan2(izq, adelante) };
}

/** Segundos entre pitidos según la distancia al más cercano: null = callado (> 25 m); 0,08 s pegado. */
export function cadencia(d) {
  if (!(d < 25)) return null;
  return Math.max(0.08, 0.08 + ((d - 1.3) / (25 - 1.3)) * 0.9);
}

const hex = (c) => "#" + c.toString(16).padStart(6, "0");

/** El radar redondo. cazadores = [{pos, vel, color, muerto}]; t = segundos (para el barrido y el parpadeo). */
export function dibujarRadar(g, cx, cy, R, yo, yaw, cazadores, t, txt) {
  const vivos = cazadores.filter((r) => !(r.muerto > 0));
  const dmin = Math.min(Infinity, ...vivos.map((r) => relativo(yo, yaw, r.pos).dist));
  const cerca = dmin < CERCA_M, k = R / RADAR_M;
  g.save();
  g.fillStyle = "rgba(6,12,10,.62)"; g.beginPath(); g.arc(cx, cy, R + 6, 0, 7); g.fill();
  g.strokeStyle = cerca && Math.floor(t * 6) % 2 ? "rgba(255,80,64,.95)" : "rgba(71,240,138,.45)";
  g.lineWidth = cerca ? 3 : 1.5; g.beginPath(); g.arc(cx, cy, R + 6, 0, 7); g.stroke();
  g.strokeStyle = "rgba(71,240,138,.16)"; g.lineWidth = 1;
  for (let m = 10; m < RADAR_M; m += 10) { g.beginPath(); g.arc(cx, cy, m * k, 0, 7); g.stroke(); }
  g.beginPath(); g.moveTo(cx - R, cy); g.lineTo(cx + R, cy); g.moveTo(cx, cy - R); g.lineTo(cx, cy + R); g.stroke();
  // el barrido (una vuelta cada 2 s)
  const a = (t * Math.PI) % (2 * Math.PI), gr = g.createConicGradient ? g.createConicGradient(a - 0.6, cx, cy) : null;
  if (gr) {
    gr.addColorStop(0, "rgba(71,240,138,0)"); gr.addColorStop(0.095, "rgba(71,240,138,.22)"); gr.addColorStop(0.1, "rgba(71,240,138,0)");
    g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.fill();
  }
  // los cazadores
  g.font = '700 11px "Chakra Petch", system-ui'; g.textAlign = "center";
  for (const r of vivos) {
    const q = relativo(yo, yaw, r.pos);
    let px = -q.izq * k, py = -q.adelante * k;
    const fuera = Math.hypot(px, py) > R;
    if (fuera) { const f = R / Math.hypot(px, py); px *= f; py *= f; }
    const x = cx + px, y = cy + py, col = hex(r.color);
    g.fillStyle = col; g.strokeStyle = "rgba(0,0,0,.7)"; g.lineWidth = 2;
    if (fuera) { g.globalAlpha = 0.6; g.beginPath(); g.arc(x, y, 3.5, 0, 7); g.fill(); g.globalAlpha = 1; continue; }
    const pulso = q.dist < CERCA_M ? 1 + 0.35 * Math.sin(t * 18) : 1;
    g.beginPath(); g.arc(x, y, 5.5 * pulso, 0, 7); g.stroke(); g.fill();
    if (Math.abs(q.arriba) > 1.5) { g.fillStyle = "#fff"; g.fillText(q.arriba > 0 ? "▲" : "▼", x, y - 8); }
  }
  // tú: un triángulo blanco que mira arriba
  g.fillStyle = "#fff"; g.beginPath(); g.moveTo(cx, cy - 8); g.lineTo(cx + 5.5, cy + 6); g.lineTo(cx - 5.5, cy + 6); g.closePath(); g.fill();
  // la distancia al más cerca
  g.font = '700 13px "Chakra Petch", system-ui'; g.fillStyle = cerca ? "#ff5040" : "#cfe9dc";
  g.fillText(Number.isFinite(dmin) ? `${Math.round(dmin)} m` : "—", cx, cy + R + 22);
  g.font = '600 10px "Chakra Petch", system-ui'; g.fillStyle = "rgba(207,233,220,.6)";
  g.fillText(txt.radar, cx, cy - R - 12);
  g.restore();
  return dmin;
}

/** En la pantalla: la marca sobre cada cazador que ves, la flecha en el borde si no lo ves y el borde rojo del lado
 *  del más cercano. proyectar(pos) -> {x, y, detras} en píxeles. */
export function dibujarAmenazas(g, W, H, yo, yaw, cazadores, proyectar, t, txt) {
  const cx = W / 2, cy = H / 2;
  let cer = null;
  g.save();
  g.font = '700 13px "Chakra Petch", system-ui'; g.textAlign = "center";
  for (const r of cazadores) {
    if (r.muerto > 0) continue;
    const q = relativo(yo, yaw, r.pos), p = proyectar(r.pos), col = hex(r.color);
    if (!cer || q.dist < cer.q.dist) cer = { q, r };
    if (q.dist > 60) continue;
    const dentro = !p.detras && p.x > 40 && p.x < W - 40 && p.y > 40 && p.y < H - 40;
    const s = Math.max(10, Math.min(34, 260 / Math.max(1, q.dist)));
    g.strokeStyle = col; g.lineWidth = 2.5;
    if (dentro) {                                       // corchetes alrededor del cazador
      g.beginPath();
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        g.moveTo(p.x + sx * s, p.y + sy * s * 0.6); g.lineTo(p.x + sx * s, p.y + sy * s); g.lineTo(p.x + sx * s * 0.6, p.y + sy * s);
      }
      g.stroke();
      g.fillStyle = col; g.fillText(`${Math.round(q.dist)} m`, p.x, p.y + s + 16);
    } else {                                            // una flecha en el borde, hacia donde está
      let ax = p.x - cx, ay = p.y - cy;
      if (p.detras) { ax = -q.izq; ay = Math.abs(q.adelante); }   // detrás: abajo, del lado en que está (como en el radar)
      const a = Math.atan2(ay, ax), rr = Math.min(W, H) * 0.36, px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr;
      const tam = q.dist < CERCA_M ? 1.5 : 1;
      g.save(); g.translate(px, py); g.rotate(a); g.scale(tam, tam);
      g.fillStyle = col; g.strokeStyle = "rgba(0,0,0,.65)"; g.lineWidth = 2;
      g.beginPath(); g.moveTo(14, 0); g.lineTo(-6, -11); g.lineTo(-1, 0); g.lineTo(-6, 11); g.closePath(); g.stroke(); g.fill();
      g.restore();
      g.fillStyle = col; g.fillText(`${Math.round(q.dist)} m`, px - Math.cos(a) * 26, py - Math.sin(a) * 26 + 4);
    }
  }
  // el sensor de proximidad: el borde rojo del lado del más cercano
  if (cer && cer.q.dist < CERCA_M) {
    const f = 1 - cer.q.dist / CERCA_M, lat = Math.sin(cer.q.ang), fr = Math.cos(cer.q.ang);   // + izquierda, + adelante
    const alfa = (0.25 + 0.5 * f) * (0.75 + 0.25 * Math.sin(t * 14));
    const borde = (x0, y0, x1, y1, w) => {
      const gr = g.createLinearGradient(x0, y0, x1, y1);
      gr.addColorStop(0, `rgba(255,40,30,${alfa * w})`); gr.addColorStop(1, "rgba(255,40,30,0)"); g.fillStyle = gr;
    };
    const L = Math.min(W, H) * 0.22;
    if (lat > 0.2) { borde(0, 0, L, 0, lat); g.fillRect(0, 0, L, H); }
    if (lat < -0.2) { borde(W, 0, W - L, 0, -lat); g.fillRect(W - L, 0, L, H); }
    if (fr < -0.2) { borde(0, H, 0, H - L, -fr); g.fillRect(0, H - L, W, L); }
    if (fr > 0.2) { borde(0, 0, 0, L, fr); g.fillRect(0, 0, W, L); }
    if (fr < -0.3 && cer.q.dist < 8) {
      g.font = '800 26px "Chakra Petch", system-ui'; g.lineWidth = 5; g.strokeStyle = "rgba(0,0,0,.7)"; g.fillStyle = "#ff5040";
      g.strokeText(txt.detras, cx, H * 0.7); g.fillText(txt.detras, cx, H * 0.7);
    }
  }
  g.restore();
  return cer;
}
