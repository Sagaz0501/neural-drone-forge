// =====================================================================
// «ANALIZAR» un diseño antes de importarlo (STEP o STL) o después (los que ya tienes): la vista 3D con las bases de
// los motores marcadas, las piezas del ensamble para elegir, tamaño, distancia entre motores, hélice, peso por
// material, en qué impresora cabe y los avisos. La cuenta la hace stl.js informe(); el STEP lo lee step.js.
// =====================================================================
import * as THREE from "three";
import { OrbitControls } from "three/addons/OrbitControls.js";
import { t, num } from "./i18n.js";
import { informe, geometria, analizar, MATERIALES } from "./stl.js";
import { orientar, basesMotor } from "./step.js";

const CSS = `
#analisis { position: fixed; inset: 0; z-index: 80; background: rgba(0,0,0,.55); display: grid; place-items: center; padding: 12px; }
#analisis .an-caja { width: min(1080px, 100%); max-height: calc(100vh - 24px); display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(300px, 1fr); grid-template-rows: auto minmax(0, 1fr) auto; gap: 10px 16px; border-radius: 18px; padding: 16px 18px; background: var(--moss-solid); border: 1px solid var(--line); }
#analisis header { grid-column: 1 / -1; display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
#analisis header h2 { margin: 0; font-size: 24px; }
#analisis .an-vista { position: relative; min-height: 340px; border-radius: 12px; overflow: hidden; background: #0c1210; border: 1px solid var(--line); }
#analisis .an-vista canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
#analisis .an-ley { position: absolute; left: 10px; bottom: 8px; font-size: 12.5px; color: var(--muted); pointer-events: none; }
#analisis .an-ley i { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin: 0 4px 0 10px; vertical-align: -1px; }
#analisis .an-lado { overflow-y: auto; min-height: 0; padding-right: 4px; }
#analisis h3 { font-size: 12.5px; text-transform: uppercase; letter-spacing: 1.2px; color: var(--muted); margin: 12px 0 5px; font-weight: 500; }
#analisis h3:first-child { margin-top: 0; }
#analisis .an-datos { display: grid; grid-template-columns: auto 1fr; gap: 3px 12px; font-size: 14.5px; }
#analisis .an-datos b { font-weight: 600; }
#analisis .an-datos span { color: var(--muted); }
#analisis .an-cuerpos { max-height: 170px; overflow-y: auto; border: 1px solid var(--line); border-radius: 9px; padding: 4px 8px; font-size: 13.5px; }
#analisis .an-cuerpos label { display: flex; gap: 8px; align-items: center; padding: 2px 0; cursor: pointer; }
#analisis .an-cuerpos label small { margin-left: auto; color: var(--muted); }
#analisis table { width: 100%; border-collapse: collapse; font-size: 14px; }
#analisis td, #analisis th { padding: 3px 6px; text-align: left; border-top: 1px solid rgba(234,242,239,.07); }
#analisis th { color: var(--muted); font-weight: 500; font-size: 12.5px; }
#analisis .si { color: var(--gate); } #analisis .no { color: var(--crash); } #analisis .medio { color: var(--gold); }
#analisis .an-avisos { margin: 0; padding-left: 18px; font-size: 13.5px; line-height: 1.4; }
#analisis .an-avisos .mal { color: var(--crash); } #analisis .an-avisos .ojo { color: var(--gold); } #analisis .an-avisos .info { color: var(--muted); }
#analisis select { background: #101a16; color: var(--text); border: 1px solid var(--line); border-radius: 8px; padding: 4px 6px; font: inherit; font-size: 13.5px; }
#analisis footer { grid-column: 1 / -1; display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
@media (max-width: 760px) { #analisis .an-caja { grid-template-columns: 1fr; overflow-y: auto; } #analisis .an-vista { min-height: 260px; } #analisis .an-lado { overflow: visible; } }
`;

const escH = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const mm = (v) => (Math.abs(v) >= 100 ? String(Math.round(v)) : num(v, 1));

/**
 * Abre el análisis. op = {
 *   nombre, tipo ("chasis"|"canopy"|"controladora"|"camara"), cuerpos ([{nombre, tri, volumen_cm3?, area_cm2?, caras?, color?, bbox?}]),
 *   step: {unidad, esquema, sistema} si vino de un STEP, soloVer: true = ya importado (sin «Importar»),
 *   motores: [[x, y] ×4] (ya importado: los guardados) }
 * Devuelve una promesa: null si cancela; si importa, {tipo, cuerpos (los elegidos, orientados), inf (el informe), eje}.
 */
export function abrirAnalisis(op) {
  if (!document.getElementById("analisis-css")) {
    const s = document.createElement("style");
    s.id = "analisis-css"; s.textContent = CSS;
    document.head.appendChild(s);
  }
  return new Promise((listo) => {
    const raiz = document.createElement("div");
    raiz.id = "analisis";
    raiz.setAttribute("role", "dialog");
    raiz.setAttribute("aria-label", t("Analizar"));
    const fuente = op.step ? `STEP ${op.step.esquema || ""} · ${t("en {u}", { u: op.step.unidad })}${op.step.sistema ? " · " + escH(op.step.sistema) : ""}` : "STL";
    raiz.innerHTML = `<div class="an-caja">
      <header><h2>🔍 ${t("Analizar")}: ${escH(op.nombre)}</h2><span class="muted" style="font-size:13.5px">${fuente}</span></header>
      <div class="an-vista"><div class="an-ley"><i style="background:#ff7a1a"></i>${t("motores")}<i style="background:#3ccbff"></i>${t("agujeros de la base")}<i style="background:#444c49;border:1px solid #889"></i>${t("cama de {L} mm", { L: 256 })}</div></div>
      <div class="an-lado"></div>
      <footer></footer></div>`;
    document.body.appendChild(raiz);
    const vista = raiz.querySelector(".an-vista"), lado = raiz.querySelector(".an-lado"), pie = raiz.querySelector("footer");

    let tipo = op.tipo || "chasis", relleno = 0.3, material = "pla";
    // girar: un chasis o carcasa con lo más fino en Z (como se imprime); los "cómo se ve" quedan como vienen
    const prep = () => (op.soloVer || !(tipo === "chasis" || tipo === "canopy") ? { cuerpos: op.cuerpos, eje: "z" } : orientar(op.cuerpos, "auto"));
    let O = prep();
    const elegidos = new Set(O.cuerpos.map((_, i) => i));

    // ---------- la vista 3D ----------
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    vista.prepend(renderer.domElement);
    const escena = new THREE.Scene();
    escena.background = new THREE.Color(0x0c1210);
    const camara = new THREE.PerspectiveCamera(35, 1, 0.001, 20);
    const controles = new OrbitControls(camara, renderer.domElement);
    controles.enableDamping = true;
    escena.add(new THREE.HemisphereLight(0xffffff, 0x223, 1.1));
    const sol = new THREE.DirectionalLight(0xffffff, 1.6); sol.position.set(1, 2, 1.5); escena.add(sol);
    const cama = new THREE.GridHelper(0.256, 8, 0x55605b, 0x2c3431);
    escena.add(cama);
    const grupo = new THREE.Group(), marcas = new THREE.Group();
    escena.add(grupo, marcas);
    let centroTodo = null, encuadrado = false;

    function dibujar() {
      grupo.clear(); marcas.clear();
      const todo = analizar(juntarTri(O.cuerpos));
      centroTodo = todo.centro;
      O.cuerpos.forEach((c, i) => {
        const on = elegidos.has(i);
        const col = c.color ? new THREE.Color(...c.color) : new THREE.Color(0x9aa7a1);
        if (c.color && Math.max(...c.color) < 0.12) col.setRGB(0.32, 0.34, 0.36);   // el negro del carbono, que se vea
        const m = new THREE.Mesh(geometria(c.tri, { centro: centroTodo }), new THREE.MeshStandardMaterial({ color: col, roughness: 0.65, metalness: 0.1, transparent: !on, opacity: on ? 1 : 0.13, depthWrite: on }));
        grupo.add(m);
      });
      const sel = O.cuerpos.filter((_, i) => elegidos.has(i));
      if (sel.length) {
        const tsel = juntarTri(sel), cs = analizar(tsel).centro;
        const aJuego = ([x, y]) => [(x + cs[0] - centroTodo[0]) / 1000, -(y + cs[1] - centroTodo[1]) / 1000];
        // la altura de la pieza donde va el motor (lo más alto a menos de r mm), para poner la marca encima
        const techo = ([x, y], r) => {
          let z = -Infinity;
          for (let i = 0; i < tsel.length; i += 3) if (Math.hypot(tsel[i] - x - cs[0], tsel[i + 1] - y - cs[1]) < r && tsel[i + 2] > z) z = tsel[i + 2];
          return ((Number.isFinite(z) ? z : todo.tam_mm[2]) - centroTodo[2]) / 1000;
        };
        for (const p of inf.motores_mm) {
          const [x, z] = aJuego(p), y = techo(p, 14) + 0.0015;
          const aro = new THREE.Mesh(new THREE.TorusGeometry(0.0135, 0.0015, 8, 40), new THREE.MeshBasicMaterial({ color: 0xff7a1a }));
          aro.rotation.x = Math.PI / 2; aro.position.set(x, y, z);
          const eje = new THREE.Mesh(new THREE.CylinderGeometry(0.0011, 0.0011, 0.022, 8), new THREE.MeshBasicMaterial({ color: 0xff7a1a }));
          eje.position.set(x, y + 0.011, z);
          marcas.add(aro, eje);
        }
        for (const h of agujerosVistos) {
          const [x, z] = aJuego([h.x, h.y]);
          const a = new THREE.Mesh(new THREE.TorusGeometry(Math.max(h.r, 1) / 1000, 0.0006, 6, 24), new THREE.MeshBasicMaterial({ color: 0x3ccbff }));
          a.rotation.x = Math.PI / 2; a.position.set(x, techo([h.x, h.y], 2 + h.r) + 0.0008, z);
          marcas.add(a);
        }
      }
      if (!encuadrado) {
        encuadrado = true;
        const r = Math.max(0.05, Math.max(...todo.tam_mm) / 1000);
        camara.position.set(r * 1.25, r * 1.45, r * 1.85);
        controles.target.set(0, todo.tam_mm[2] / 2000, 0);
        cama.scale.setScalar(Math.max(1, (Math.max(...todo.tam_mm) / 256) * 1.05));
      }
    }
    let vivo = true;
    const tamaño = () => { const w = vista.clientWidth, h = vista.clientHeight; renderer.setSize(w, h, false); camara.aspect = w / Math.max(1, h); camara.updateProjectionMatrix(); };
    const ro = new ResizeObserver(tamaño); ro.observe(vista);
    (function anim() { if (!vivo) return; controles.update(); renderer.render(escena, camara); requestAnimationFrame(anim); })();

    // ---------- los números ----------
    let inf = null, agujerosVistos = [];
    function calcular() {
      const sel = O.cuerpos.filter((_, i) => elegidos.has(i));
      if (!sel.length) { inf = null; return; }
      let motores = op.motores || null;
      agujerosVistos = [];
      if (!op.soloVer && tipo === "chasis" && sel.some((c) => c.caras?.length)) {
        const b = basesMotor(sel);
        if (b) { motores = b.motores; agujerosVistos = b.agujeros; }
      }
      inf = informe(sel, { motores: tipo === "chasis" ? motores : null, tipo, relleno });
      if (op.motores && !agujerosVistos.length) inf.motores_de = "agujeros";
      if (Array.isArray(op.step?.camas) && op.step.camas.length) {   // ya importado: lo que se midió con las piezas separadas
        inf.camas = op.step.camas;
        inf.avisos = inf.avisos.filter((a) => a.k !== "camas");
      }
    }

    function render() {
      calcular();
      dibujar();
      const ensamble = O.cuerpos.length > 1;
      let h = "";
      if (O.eje !== "z") h += `<p class="muted" style="margin:0 0 6px;font-size:13px">↻ ${t("Lo giré: venía con {eje} hacia arriba (se imprime acostado).", { eje: O.eje.toUpperCase() })}</p>`;
      if (!op.soloVer) {
        h += `<h3>${t("Es un")}</h3><select data-k="tipo">${[["chasis", t("Chasis (se imprime, cambia el peso)")], ["canopy", t("Carcasa (canopy)")], ["controladora", t("Cómo se ve la controladora")], ["camara", t("Cómo se ve la cámara")]]
          .map(([k, n]) => `<option value="${k}"${k === tipo ? " selected" : ""}>${n}</option>`).join("")}</select>`;
      }
      if (ensamble) {
        h += `<h3>${t("Piezas del ensamble ({n} de {total})", { n: elegidos.size, total: O.cuerpos.length })}</h3><div class="an-cuerpos">${O.cuerpos.map((c, i) => {
          const ci = inf?.cuerpos.find((x) => x.nombre === c.nombre);
          return `<label><input type="checkbox" data-c="${i}"${elegidos.has(i) ? " checked" : ""}${op.soloVer ? " disabled" : ""}> ${escH(c.nombre)}<small>${num(c.volumen_cm3 ?? 0, 1)} cm³${ci?.cerrado === false ? " · ⚠️" : ""}</small></label>`;
        }).join("")}</div>`;
        if (!op.soloVer) h += `<div style="display:flex;gap:6px;margin-top:5px"><button class="btn ghost small" data-k="todas">${t("Todas")}</button><button class="btn ghost small" data-k="ninguna">${t("Ninguna")}</button></div>`;
      }
      if (!inf) h += `<p class="muted">${t("Elige al menos una pieza.")}</p>`;
      else {
        const i = inf;
        h += `<h3>${t("Medidas")}</h3><div class="an-datos">
          <span>${t("Tamaño")}</span><b>${i.tam_mm.map(mm).join(" × ")} mm</b>
          <span>${t("Volumen")}</span><b>${num(i.volumen_cm3, 1)} cm³${op.step ? ` <span style="font-weight:400;font-size:12.5px">${t("(de los sólidos del STEP)")}</span>` : ""}</b>`;
        if (tipo === "chasis") {
          h += `<span>${t("Entre motores (diagonal)")}</span><b>${i.ejes_mm} mm <span style="font-weight:400;font-size:12.5px">${i.motores_de === "agujeros" ? t("(por los agujeros de las bases)") : t("(por las puntas de los brazos)")}</span></b>
            <span>${t("Hélices")}</span><b>${t("de {p}\" (caben hasta {max}\")", { p: i.helice, max: num(i.helice_cabe, 1) })}</b>`;
        }
        h += `<span>${t("Triángulos")}</span><b>${Math.round(i.tri.length / 9)}</b></div>`;
        h += `<h3>${t("Peso impreso")}</h3><div style="display:flex;gap:8px;align-items:center;font-size:13.5px;margin-bottom:4px"><label class="muted" for="an-rell">${t("Relleno")}</label><select id="an-rell" data-k="relleno">${[0.15, 0.3, 0.5, 1].map((r) => `<option value="${r}"${r === relleno ? " selected" : ""}>${Math.round(r * 100)} %</option>`).join("")}</select></div>
          <table><tr>${Object.values(MATERIALES).map((m) => `<th>${m.nombre}</th>`).join("")}</tr><tr>${Object.keys(MATERIALES).map((k) => `<td><b>${i.pesos[k]} g</b></td>`).join("")}</tr></table>`;
        h += `<h3>${t("¿Cabe en la impresora?")}</h3><table>${i.camas.map((c) => `<tr><td>${c.lado}×${c.lado}×${c.lado} mm</td><td class="${c.entero ? "si" : c.por_piezas ? "medio" : "no"}">${c.entero ? "✓ " + t("entero") : c.por_piezas ? "◐ " + t("por piezas") : "✗ " + t("no cabe")}</td></tr>`).join("")}</table>`;
        h += `<h3>${t("Avisos")}</h3>` + (i.avisos.length ? `<ul class="an-avisos">${i.avisos.map((a) => `<li class="${a.nivel}">${escH(a.texto)}</li>`).join("")}</ul>` : `<p class="si" style="margin:0;font-size:13.5px">✓ ${t("Todo bien: sólido cerrado, cabe y las paredes aguantan.")}</p>`);
      }
      lado.innerHTML = h;
      lado.querySelectorAll("[data-c]").forEach((el) => (el.onchange = () => { const k = +el.dataset.c; el.checked ? elegidos.add(k) : elegidos.delete(k); render(); }));
      const k = (n) => lado.querySelector(`[data-k="${n}"]`);
      if (k("tipo")) k("tipo").onchange = (e) => { tipo = e.target.value; O = prep(); encuadrado = false; render(); };
      if (k("relleno")) k("relleno").onchange = (e) => { relleno = +e.target.value; render(); };
      if (k("todas")) k("todas").onclick = () => { O.cuerpos.forEach((_, j) => elegidos.add(j)); render(); };
      if (k("ninguna")) k("ninguna").onclick = () => { elegidos.clear(); render(); };
      const imp = pie.querySelector("[data-k=importar]");
      if (imp) imp.disabled = !inf;
    }

    function cerrar(v) {
      vivo = false; ro.disconnect(); controles.dispose();
      grupo.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
      renderer.dispose(); renderer.forceContextLoss?.();
      raiz.remove();
      document.removeEventListener("keydown", tecla);
      listo(v);
    }
    const tecla = (e) => { if (e.key === "Escape") cerrar(null); };
    document.addEventListener("keydown", tecla);
    if (op.soloVer) pie.innerHTML = `<button class="btn ghost" data-k="cerrar">${t("Cerrar")}</button>`;
    else pie.innerHTML = `<button class="btn main" data-k="importar">${t("Importar")}</button><button class="btn ghost" data-k="cerrar">${t("Cancelar")}</button><span class="muted" style="font-size:12.5px">${t("Se guarda como STL (en milímetros) con lo que se sabe del original.")}</span>`;
    pie.querySelector("[data-k=cerrar]").onclick = () => cerrar(null);
    const imp = pie.querySelector("[data-k=importar]");
    if (imp) imp.onclick = () => cerrar({ tipo, cuerpos: O.cuerpos.filter((_, i) => elegidos.has(i)), inf, eje: O.eje, agujeros: agujerosVistos.length });
    render();
    tamaño();
  });
}

function juntarTri(cs) {
  if (cs.length === 1) return cs[0].tri;
  const o = new Float32Array(cs.reduce((s, c) => s + c.tri.length, 0));
  let k = 0;
  for (const c of cs) { o.set(c.tri, k); k += c.tri.length; }
  return o;
}
