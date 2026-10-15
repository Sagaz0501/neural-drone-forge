// =====================================================================
// Dibujar una red neuronal en un <canvas>: los sensores a la izquierda, las capas ocultas, las palancas a la
// derecha; cada neurona encendida según su activación (naranja +, azul −) y las conexiones más fuertes por donde
// pasa más señal. Lo usan el Estudio PBDMM (la red en vivo) y el visor de simulaciones (app/simulacion.js).
//   R = { capas: [38, 128, 128, 4], in: [38], h: [[..], [..]], mu: [4], in_lbl?, act_lbl?, w?: [[[origen, destino, peso]]] }
// =====================================================================
import { t } from "./i18n.js";

const clip = (v) => Math.max(-1, Math.min(1, v || 0));
const col = (v, a) => (v >= 0 ? `rgba(255,158,94,${a})` : `rgba(60,203,255,${a})`);

/** Dibuja R en el canvas (ajusta su tamaño al ancho que tiene en pantalla). Devuelve las 4 entradas más activas. */
export function dibujarRed(cv, R, { altoMin = 360, altoMax = 520 } = {}) {
  const dpr = window.devicePixelRatio || 1, W = cv.clientWidth || 340, H = Math.max(altoMin, Math.min(altoMax, R.capas[0] * 12 + 20));
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.height = H + "px"; }
  const g = cv.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  const capas = R.capas, act = [R.in, ...R.h, R.mu], L = capas.length;
  const izq = 92, der = 74, xs = capas.map((_, i) => izq + (i * (W - izq - der)) / (L - 1));
  const ys = capas.map((n) => Array.from({ length: n }, (_, j) => 12 + ((j + 0.5) * (H - 24)) / n));
  // conexiones: más fuertes donde pasa más señal (|peso × activación de origen|)
  (R.w || []).forEach((conns, l) => {
    if (l >= L - 1 || !act[l]) return;
    const flujo = conns.map(([a, , w]) => Math.abs(w * clip(act[l][a])));
    const max = Math.max(1e-6, ...flujo);
    conns.forEach(([a, b, w], k) => {
      const f = flujo[k] / max;
      if (f < 0.05 || ys[l][a] === undefined || ys[l + 1][b] === undefined) return;
      g.strokeStyle = col(w, 0.06 + 0.5 * f); g.lineWidth = 0.5 + 1.5 * f;
      g.beginPath(); g.moveTo(xs[l], ys[l][a]); g.lineTo(xs[l + 1], ys[l + 1][b]); g.stroke();
    });
  });
  // neuronas
  capas.forEach((n, l) => {
    const r = Math.max(1.2, Math.min(5, (H - 24) / n / 2 - 0.4));
    ys[l].forEach((y, j) => {
      const v = clip(act[l]?.[j]);
      g.fillStyle = col(v, 0.15 + 0.85 * Math.abs(v));
      g.beginPath(); g.arc(xs[l], y, r, 0, Math.PI * 2); g.fill();
    });
  });
  // nombres: sensores a la izquierda, palancas a la derecha (con su valor)
  g.font = "10px ui-monospace, Menlo, monospace"; g.textBaseline = "middle";
  const lbl = R.in_lbl || [];
  if (capas[0] <= 48) ys[0].forEach((y, j) => { g.fillStyle = Math.abs(clip(R.in[j])) > 0.5 ? "#eaf2ef" : "#7d938a"; g.textAlign = "right"; g.fillText(String(lbl[j] || j).slice(0, 14), izq - 8, y); });
  (R.act_lbl || ["gas", "roll", "pitch", "yaw"]).forEach((nombre, j) => {
    const y = ys[L - 1][j], v = clip(R.mu[j]);
    g.textAlign = "left"; g.fillStyle = "#eaf2ef"; g.fillText(`${nombre} ${v >= 0 ? "+" : ""}${v.toFixed(2)}`, xs[L - 1] + 9, y);
  });
  g.textAlign = "center"; g.fillStyle = "#7d938a";
  capas.forEach((n, l) => g.fillText(l === 0 ? t("{n} sensores", { n }) : l === L - 1 ? t("palancas") : String(n), xs[l], H - 4));
  // lo que más está sintiendo (un sensor de distancia en 1 = no ve nada cerca: no cuenta)
  return R.in.map((v, j) => [Math.abs(v), j, v]).filter(([, j, v]) => !(/^sensor/.test(lbl[j] || "") && v >= 0.98))
    .sort((a, b) => b[0] - a[0]).slice(0, 4).map(([, j, v]) => `${lbl[j] || j} ${v >= 0 ? "+" : ""}${v.toFixed(2)}`);
}

/** Las conexiones más fuertes de cada capa de un modelo_web.json (para dibujarlas sobre las activaciones). */
export function conexionesFuertes(web, k = 160) {
  return web.layers.map((L) => {
    const idx = Array.from(L.W.keys()).sort((a, b) => Math.abs(L.W[b]) - Math.abs(L.W[a])).slice(0, k);
    return idx.map((i) => [i % L.in, Math.floor(i / L.in), L.W[i]]);
  });
}
