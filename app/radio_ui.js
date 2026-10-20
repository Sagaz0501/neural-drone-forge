// =====================================================================
// 🎮 RADIO Y CONTROLES (la pantalla del freestyle; la lógica está en radio.js): ver el control en vivo, el ASISTENTE
// de calibración (mover todo a los extremos -> centro -> subir el gas, roll, pitch, yaw, armar, modo: cada canal se
// detecta solo), asignar e invertir a mano, zona muerta, Modo 2 / Modo 1, rates (presets + los tuyos, con la curva),
// la curva del gas, el ángulo máximo de Angle y el timer de la batería. Todo se guarda en cfg (localStorage).
// dibujarPalancas(): las dos palancas en el HUD, como el OSD de un simulador.
// =====================================================================
import * as RA from "./radio.js";
import { t, num } from "./i18n.js";

const CANALES = () => [["gas", t("Gas")], ["yaw", t("Yaw (giro)")], ["pitch", t("Pitch (adelante)")], ["roll", t("Roll (lados)")]];
const clon = (x) => JSON.parse(JSON.stringify(x));

/** Las dos palancas (Modo 2: izq. gas/yaw, der. pitch/roll; Modo 1: izq. pitch/yaw, der. gas/roll). md = S.mando. */
export function dibujarPalancas(c, md, mando = 2) {
  if (!c) return;
  const g = c.getContext("2d"), W = c.width, H = c.height, L = 92, pad = (H - L) / 2;
  g.clearRect(0, 0, W, H);
  if (!md) return;
  const gasY = md.gas * 2 - 1;                                  // 0..1 -> −1..1 (arriba = gas a fondo)
  const izq = mando === 1 ? [-md.yaw, md.pitch] : [-md.yaw, gasY], der = mando === 1 ? [md.roll, gasY] : [md.roll, md.pitch];
  [[pad, izq], [W - L - pad, der]].forEach(([x0, [sx, sy]]) => {
    g.fillStyle = "rgba(10,16,14,.62)"; g.strokeStyle = "rgba(234,242,239,.22)"; g.lineWidth = 1;
    g.beginPath(); g.roundRect(x0, pad, L, L, 12); g.fill(); g.stroke();
    g.strokeStyle = "rgba(234,242,239,.12)";
    g.beginPath(); g.moveTo(x0 + L / 2, pad + 8); g.lineTo(x0 + L / 2, pad + L - 8); g.moveTo(x0 + 8, pad + L / 2); g.lineTo(x0 + L - 8, pad + L / 2); g.stroke();
    const px = x0 + L / 2 + (sx || 0) * (L / 2 - 10), py = pad + L / 2 - (sy || 0) * (L / 2 - 10);
    g.strokeStyle = "rgba(255,122,26,.5)"; g.lineWidth = 2;
    g.beginPath(); g.moveTo(x0 + L / 2, pad + L / 2); g.lineTo(px, py); g.stroke();
    g.fillStyle = md.armado ? "#ff7a1a" : "#9db3a9";
    g.beginPath(); g.arc(px, py, 7, 0, 7); g.fill();
  });
  g.fillStyle = "rgba(234,242,239,.75)"; g.font = '600 11px "Chakra Petch", system-ui'; g.textAlign = "center";
  g.fillText(`${Math.round(md.gas * 100)} %`, W / 2, H / 2 + 4);
}

/** La curva de los rates (°/s según la palanca) o la del gas, en un canvas. */
function curva(c, f, maxY, color, txt) {
  const g = c.getContext("2d"), W = c.width, H = c.height;
  g.strokeStyle = color; g.lineWidth = 2; g.beginPath();
  for (let i = 0; i <= 60; i++) { const x = i / 60, y = f(x) / maxY; const X = 8 + x * (W - 16), Y = H - 8 - y * (H - 16); if (i) g.lineTo(X, Y); else g.moveTo(X, Y); }
  g.stroke();
  if (txt) { g.fillStyle = color; g.font = '600 11.5px "Chakra Petch", system-ui'; g.textAlign = "left"; g.fillText(txt.t, 10, txt.y); }
}
function fondo(c) {
  const g = c.getContext("2d"), W = c.width, H = c.height;
  g.clearRect(0, 0, W, H);
  g.strokeStyle = "rgba(234,242,239,.1)"; g.lineWidth = 1;
  for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(8, (H * i) / 4); g.lineTo(W - 8, (H * i) / 4); g.stroke(); }
}

/**
 * Abrir la pantalla. ctx = { $, cfg, guardar, padElegido, perfilDe, volver, toast }.
 */
export function abrirRadio(ctx) {
  const { $, cfg, guardar, toast } = ctx;
  const el = $("radio");
  $("menu").classList.add("hidden");
  el.classList.remove("hidden");
  let W = null, raf = 0, abierta = true;                     // W = el asistente en curso
  const pads = () => (navigator.getGamepads ? [...navigator.getGamepads()].filter((p) => p && p.axes?.length >= 4) : []);
  const gp = () => ctx.padElegido();
  const perfil = () => { const p = gp(); return p ? clon(ctx.perfilDe(p)) : null; };
  const guardarPerfil = (pf) => { const p = gp(); if (!p) return; cfg.radios[p.id] = pf; guardar(); };
  const cerrar = () => { abierta = false; cancelAnimationFrame(raf); if (W?.timer) clearInterval(W.timer); W = null; el.classList.add("hidden"); ctx.volver(); };

  function pintar() {
    const p = gp(), pf = perfil();
    el.innerHTML = `<h2>${t("🎮 Radio y controles")}</h2>`;
    // ---- el control ----
    const lista = pads();
    if (!p) {
      el.insertAdjacentHTML("beforeend", `<p class="r-paso">${t("Conecta tu radio por USB (en EdgeTX: <b>USB Joystick (HID)</b>) o un mando de PS5/Xbox, y mueve una palanca. Si no tienes, el teclado también sirve.")}</p>`);
    } else {
      const f = document.createElement("div"); f.className = "fila";
      const sel = document.createElement("select");
      for (const x of lista) { const o = document.createElement("option"); o.value = x.id; o.textContent = x.id.split("(")[0].trim().slice(0, 48); o.selected = x.id === p.id; sel.appendChild(o); }
      sel.onchange = () => { cfg.padId = sel.value; guardar(); pintar(); };
      const tipo = document.createElement("span"); tipo.className = "muted";
      tipo.textContent = (RA.esRadio(p) ? t("📻 Radio") : t("🎮 Mando")) + " · " + (cfg.radios[p.id]?.cal ? t("calibrada ✓") : t("sin calibrar"));
      f.append(sel, tipo); el.appendChild(f);
      el.insertAdjacentHTML("beforeend", `<div class="r-ejes" id="r-ejes"></div><div class="r-botones" id="r-botones"></div><div id="r-asist"></div>`);
      const acc = document.createElement("div"); acc.className = "acciones"; acc.style.cssText = "display:flex;gap:8px;flex-wrap:wrap";
      const b1 = document.createElement("button"); b1.className = "btn main"; b1.textContent = t("Calibrar y asignar (asistente)"); b1.onclick = () => empezarAsistente();
      const b2 = document.createElement("button"); b2.className = "btn ghost"; b2.textContent = t("Restablecer este control");
      b2.onclick = () => { delete cfg.radios[p.id]; guardar(); toast(t("Control restablecido")); pintar(); };
      acc.append(b1, b2); el.appendChild(acc);
      // ---- asignar a mano ----
      el.insertAdjacentHTML("beforeend", `<h3>${t("Canales")}</h3>`);
      const map = document.createElement("div"); map.className = "r-map";
      const opcEje = (v) => p.axes.map((_, i) => `<option value="${i}"${i === v ? " selected" : ""}>${t("Eje {n}", { n: i + 1 })}</option>`).join("");
      for (const [k, nom] of CANALES()) {
        const e = pf.ejes[k] || { i: 0 };
        const s = document.createElement("select"); s.innerHTML = opcEje(e.i);
        s.onchange = () => { pf.ejes[k] = { ...e, i: +s.value }; guardarPerfil(pf); };
        const inv = document.createElement("label"); inv.innerHTML = `<input type="checkbox"${e.inv ? " checked" : ""}> ${t("invertir")}`;
        inv.firstChild.onchange = (ev) => { pf.ejes[k] = { ...pf.ejes[k], inv: ev.target.checked }; guardarPerfil(pf); };
        const lb = document.createElement("span"); lb.textContent = nom;
        map.append(lb, s, inv);
      }
      const opcArm = [["", t("ninguno (tecla E)")], ...p.axes.map((_, i) => [`e${i}`, t("interruptor en eje {n}", { n: i + 1 })]), ...p.buttons.map((_, i) => [`b${i}`, t("botón {n}", { n: i + 1 })])];
      const selArm = document.createElement("select");
      const va = pf.armar ? (pf.armar.tipo === "eje" ? `e${pf.armar.i}` : `b${pf.armar.i}`) : "";
      selArm.innerHTML = opcArm.map(([v, x]) => `<option value="${v}"${v === va ? " selected" : ""}>${x}</option>`).join("");
      selArm.onchange = () => {
        const v = selArm.value;
        pf.armar = !v ? null : v[0] === "e" ? { tipo: "eje", i: +v.slice(1), umbral: 0.5, inv: !!pf.armar?.inv } : { tipo: "boton", i: +v.slice(1), alterna: !RA.esRadio(p) };
        guardarPerfil(pf);
      };
      const invA = document.createElement("label"); invA.innerHTML = `<input type="checkbox"${pf.armar?.inv ? " checked" : ""}> ${t("invertir")}`;
      invA.firstChild.onchange = (ev) => { if (pf.armar) { pf.armar.inv = ev.target.checked; guardarPerfil(pf); } };
      const lA = document.createElement("span"); lA.textContent = t("Armar");
      map.append(lA, selArm, invA);
      const selM = document.createElement("select");
      selM.innerHTML = `<option value="">${t("ninguno (el modo del menú)")}</option>` + p.axes.map((_, i) => `<option value="${i}"${pf.modo?.i === i ? " selected" : ""}>${t("interruptor de 3 posiciones en eje {n}", { n: i + 1 })}</option>`).join("");
      selM.onchange = () => { pf.modo = selM.value === "" ? null : { tipo: "eje", i: +selM.value }; guardarPerfil(pf); };
      const lM = document.createElement("span"); lM.textContent = t("Modo (Angle/Horizon/Acro)");
      map.append(lM, selM, document.createElement("span"));
      el.appendChild(map);
      slider(el, t("Zona muerta"), 0, 0.15, 0.01, pf.dz || 0, (v) => { pf.dz = v; guardarPerfil(pf); }, (v) => `${Math.round(v * 100)} %`);
    }
    // ---- la sensación (Angle/Horizon/Acro): Juego (centro = flotar, se arma solo) o Real (gas absoluto, como una radio) ----
    const sens = RA.sensacionDe(pf, cfg);
    const fs = document.createElement("div"); fs.className = "fila";
    const ls = document.createElement("span"); ls.className = "muted"; ls.textContent = p ? t("Sensación de este control") : t("Sensación del teclado");
    fs.append(ls, seg([["juego", t("🎮 Juego")], ["real", t("📻 Real (gas absoluto)")]], sens, (v) => {
      if (p) guardarPerfil({ ...pf, sensacion: v }); else { cfg.sensacionTeclado = v; guardar(); }
      pintar();
    }));
    el.appendChild(fs);
    el.insertAdjacentHTML("beforeend", `<p class="muted" style="margin:-4px 0 6px;font-size:12.5px">${sens === "juego"
      ? t("Juego: el gas al centro flota, ya va armado, rates para una palanca corta. Lo mejor para un mando o el teclado.")
      : t("Real: gas absoluto (tú sostienes el hover), armar con el gas abajo, rates de radio. Lo de una radio de verdad.")}</p>`);
    const fm = document.createElement("div"); fm.className = "fila";
    const lm = document.createElement("span"); lm.className = "muted"; lm.textContent = t("Palancas (mando de consola)");
    fm.append(lm, seg([[2, t("Modo 2 (gas a la izquierda)")], [1, t("Modo 1 (gas a la derecha)")]], cfg.mando, (v) => { cfg.mando = v; guardar(); }));
    el.appendChild(fm);
    // ---- rates ----
    el.insertAdjacentHTML("beforeend", `<h3>${t("Rates (qué tan rápido gira en Acro y Horizon)")}</h3>`);
    const R = clon(RA.ratesDe(cfg, sens));                      // Juego: los presets de mando; Real: los de radio
    const fr = document.createElement("div"); fr.className = "fila";
    fr.append(seg([["principiante", t("Principiante")], ["freestyle", "Freestyle"], ["carreras", t("Carreras")], ["cinematico", t("Cinemático")]],
      cfg.ratesPropias ? null : cfg.rates, (v) => { cfg.rates = v; cfg.ratesPropias = null; guardar(); pintar(); }));
    el.appendChild(fr);
    const curvas = document.createElement("div"); curvas.className = "r-curvas";
    const cr = document.createElement("canvas"); cr.width = 300; cr.height = 150;
    const cg = document.createElement("canvas"); cg.width = 150; cg.height = 150;
    curvas.append(cr, cg); el.appendChild(curvas);
    const pintarCurvas = () => {
      const mx = Math.max(1100, RA.maxRate(R.rp), RA.maxRate(R.yaw));
      fondo(cr);
      curva(cr, (x) => RA.rateBF(x, R.rp), mx, "#ff7a1a", { t: t("Roll/Pitch: {n}°/s a fondo", { n: Math.round(RA.maxRate(R.rp)) }), y: 18 });
      curva(cr, (x) => RA.rateBF(x, R.yaw), mx, "#3ccbff", { t: t("Yaw: {n}°/s", { n: Math.round(RA.maxRate(R.yaw)) }), y: 34 });
      fondo(cg);
      curva(cg, (x) => RA.gasCurva(x, cfg.gasCurva), 1, "#47f08a", { t: t("Gas"), y: 18 });
    };
    const propio = () => { cfg.ratesPropias = clon(R); guardar(); pintarCurvas(); fr.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", "false")); };   // ya no es un preset
    for (const [eje, nom] of [["rp", t("Roll/Pitch")], ["yaw", "Yaw"]]) {
      slider(el, `${nom} · RC rate`, 0.3, 2.5, 0.01, R[eje].rc, (v) => { R[eje].rc = v; propio(); }, (v) => num(v, 2));
      slider(el, `${nom} · Super rate`, 0, 0.95, 0.01, R[eje].sup, (v) => { R[eje].sup = v; propio(); }, (v) => num(v, 2));
      slider(el, `${nom} · Expo`, 0, 1, 0.01, R[eje].expo, (v) => { R[eje].expo = v; propio(); }, (v) => num(v, 2));
    }
    // ---- gas, Angle y batería ----
    el.insertAdjacentHTML("beforeend", `<h3>${t("Gas, Angle y batería")}</h3>`);
    slider(el, t("Gas · medio (hover)"), 0.1, 0.9, 0.01, cfg.gasCurva.mid, (v) => { cfg.gasCurva.mid = v; guardar(); pintarCurvas(); }, (v) => `${Math.round(v * 100)} %`);
    slider(el, t("Gas · expo"), 0, 1, 0.01, cfg.gasCurva.expo, (v) => { cfg.gasCurva.expo = v; guardar(); pintarCurvas(); }, (v) => num(v, 2));
    slider(el, t("Angle · ángulo máx."), 25, 80, 1, cfg.angulo, (v) => { cfg.angulo = v; guardar(); }, (v) => `${v}°`);
    const fb = document.createElement("div"); fb.className = "fila";
    const lb = document.createElement("span"); lb.className = "muted"; lb.textContent = t("Timer de la batería");
    fb.append(lb, seg([[0, t("No")], [3, "3 min"], [4, "4 min"], [5, "5 min"]], cfg.bateria, (v) => { cfg.bateria = v; guardar(); }));
    el.appendChild(fb);
    pintarCurvas();
    const listo = document.createElement("button"); listo.className = "btn main"; listo.textContent = t("Listo"); listo.onclick = cerrar;
    el.appendChild(listo);
    if (W) pintarAsistente();
  }

  function slider(padre, txt, min, max, paso, valor, alCambiar, fmt) {
    const f = document.createElement("div"); f.className = "r-sl";
    const l = document.createElement("span"); l.textContent = txt;
    const i = document.createElement("input"); i.type = "range"; i.min = min; i.max = max; i.step = paso; i.value = valor; i.setAttribute("aria-label", txt);
    const v = document.createElement("b"); v.textContent = fmt(valor);
    i.oninput = () => { v.textContent = fmt(+i.value); alCambiar(+i.value); };
    f.append(l, i, v); padre.appendChild(f);
  }
  function seg(opciones, valor, alCambiar) {
    const el2 = document.createElement("div"); el2.className = "seg";
    for (const [v, txt] of opciones) {
      const b = document.createElement("button"); b.textContent = txt; b.setAttribute("aria-pressed", String(v === valor));
      b.onclick = () => { [...el2.children].forEach((c) => c.setAttribute("aria-pressed", String(c === b))); alCambiar(v); };
      el2.appendChild(b);
    }
    return el2;
  }

  // ---------------- el asistente ----------------
  const PASOS = () => [
    { id: "mover", txt: t("Mueve <b>todas las palancas en círculos, a fondo</b>, y cada interruptor de un lado al otro. Después toca Siguiente.") },
    { id: "centro", txt: t("Suelta las palancas al <b>centro</b> y deja el <b>gas abajo del todo</b>. Siguiente.") },
    { id: "gas", txt: t("Sube el <b>gas a fondo</b>. Siguiente.") },
    { id: "roll", txt: t("Baja el gas. Lleva el <b>roll a la derecha</b> y déjalo ahí. Siguiente.") },
    { id: "pitch", txt: t("Suelta el roll. <b>Pitch hacia adelante</b> (arriba). Siguiente.") },
    { id: "yaw", txt: t("Suelta el pitch. <b>Yaw a la derecha</b>. Siguiente.") },
    { id: "armar", txt: t("Suelta el yaw. Pon el interruptor de <b>armar</b> en «armado» (o aprieta el botón que quieras para armar). Siguiente, o Saltar."), saltar: true },
    { id: "modo", txt: t("Opcional: mueve el interruptor de <b>modo</b> (3 posiciones) de un extremo al otro. Siguiente, o Saltar."), saltar: true },
  ];
  function empezarAsistente() {
    const p = gp(); if (!p) return;
    if (W?.timer) clearInterval(W.timer);
    W = { k: 0, cal: RA.nuevaCalibracion(p.axes.length), pf: clon(ctx.perfilDe(p)), usados: [], base: null, botones: null };
    W.pf.cal = null;
    // los extremos se juntan con un temporizador (no con cada cuadro: con la escena pesada los cuadros van lentos)
    W.timer = setInterval(() => { const q = gp(); if (q && W?.k === 0) RA.calibrarMuestra(W.cal, q.axes); }, 25);
    pintar();
  }
  function pintarAsistente() {
    const box = $("r-asist"); if (!box || !W) return;
    const P = PASOS()[W.k];
    box.innerHTML = `<div class="r-paso"><span class="muted">${t("Paso {n} de {m}", { n: W.k + 1, m: PASOS().length })}</span><br>${P.txt}<div id="r-det" class="muted" style="margin-top:6px;font-size:13px"></div>
      <div style="display:flex;gap:8px;margin-top:10px"><button class="btn main" id="r-sig"></button>${P.saltar ? `<button class="btn ghost" id="r-saltar"></button>` : ""}<button class="btn ghost" id="r-cancelar"></button></div></div>`;
    $("r-sig").textContent = t("Siguiente"); $("r-sig").onclick = siguiente;
    if (P.saltar) { $("r-saltar").textContent = t("Saltar"); $("r-saltar").onclick = () => avanzar(); }
    $("r-cancelar").textContent = t("Cancelar"); $("r-cancelar").onclick = () => { clearInterval(W.timer); W = null; pintar(); };
  }
  function siguiente() {
    const p = gp(); if (!p || !W) return;
    const ax = [...p.axes], P = PASOS()[W.k], bt = p.buttons.map((b) => !!(b.pressed || b.value > 0.5));
    if (P.id === "mover") RA.calibrarMuestra(W.cal, ax);
    if (P.id === "centro") {
      clearInterval(W.timer);
      W.pf.cal = RA.calibrarCentro(W.cal, ax);
      W.base = ax; W.botones = bt;
    } else if (["gas", "roll", "pitch", "yaw"].includes(P.id)) {
      const d = RA.detectarEje(W.base, ax, W.usados);
      if (!d) { $("r-det").textContent = t("No vi moverse ningún eje nuevo: muévelo bien a fondo y toca Siguiente otra vez."); return; }
      W.usados.push(d.i);
      // gas / roll / pitch: + = hacia donde pedimos; yaw: a la derecha es − en el juego (+ = izquierda)
      W.pf.ejes[P.id] = { i: d.i, inv: P.id === "yaw" ? d.d > 0 : d.d < 0 };
    } else if (P.id === "armar") {
      const d = RA.detectarEje(W.base, ax, W.usados, 0.5), b = RA.detectarBoton(W.botones, bt);
      if (d) { W.pf.armar = { tipo: "eje", i: d.i, umbral: 0.5, inv: d.d < 0 }; W.usados.push(d.i); }
      else if (b >= 0) W.pf.armar = { tipo: "boton", i: b, alterna: !RA.esRadio(p) };
      else { $("r-det").textContent = t("No vi el interruptor: muévelo y toca Siguiente, o Saltar (armas con la tecla E)."); return; }
    } else if (P.id === "modo") {
      const d = RA.detectarEje(W.base, ax, W.usados, 0.5);
      if (!d) { $("r-det").textContent = t("No vi el interruptor de modo: muévelo o toca Saltar."); return; }
      W.pf.modo = { tipo: "eje", i: d.i, inv: d.d < 0 };
    }
    avanzar();
  }
  function avanzar() {
    W.k++;
    if (W.k >= PASOS().length) {
      guardarPerfil(W.pf); W = null;
      toast(t("📻 Listo: tu control quedó calibrado."), 3000);
      pintar(); return;
    }
    pintarAsistente();
  }

  // ---------------- en vivo ----------------
  function vivo() {
    if (!abierta) return;
    raf = requestAnimationFrame(vivo);
    const p = gp(), ej = $("r-ejes");
    if (!p) { if (pads().length) pintar(); return; }
    if (!ej) { pintar(); return; }
    if (W && W.k === 0) RA.calibrarMuestra(W.cal, p.axes);
    const pf = W ? W.pf : ctx.perfilDe(p), nombres = {};
    for (const [k, nom] of CANALES()) if (pf.ejes[k]) nombres[pf.ejes[k].i] = nom;
    if (pf.armar?.tipo === "eje") nombres[pf.armar.i] = t("Armar");
    if (pf.modo?.tipo === "eje") nombres[pf.modo.i] = t("Modo");
    ej.innerHTML = p.axes.map((v, i) => `<div class="r-eje${nombres[i] ? " usado" : ""}">${t("Eje {n}", { n: i + 1 })}${nombres[i] ? " · " + nombres[i] : ""} <b style="float:right">${num(v, 2)}</b><i><b style="left:${((v + 1) / 2) * 100}%"></b></i></div>`).join("");
    $("r-botones").innerHTML = p.buttons.map((b, i) => `<span class="${b.pressed || b.value > 0.5 ? "on" : ""}">${i + 1}</span>`).join("");
    if (W && W.k === 0) {
      const movidos = W.cal.filter((c) => c.max - c.min > 0.3).length;
      const det = $("r-det"); if (det) det.textContent = t("Ejes que ya llegaron a sus extremos: {n} de {m}", { n: movidos, m: p.axes.length });
    }
  }
  pintar();
  vivo();
}
