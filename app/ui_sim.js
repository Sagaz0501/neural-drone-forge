// =====================================================================
// La pantalla de SIMULACIONES (los botones "Avance del modelo" y "Simular prueba" de cada dron / modelo).
// El 3D y las gráficas están en simulacion.js; aquí los botones, las pestañas (mejor / peor), la línea de tiempo,
// las cámaras y la red neuronal del instante. Nada de esto toca la partida: no da plata ni daña el dron.
// =====================================================================
import { Visor, dibujarGraficas, resultadoTxt, dibujarRed, conexionesFuertes } from "./simulacion.js";

export function initSim(ctx) {
  const { $, esc, api, toast } = ctx;
  const SM = { lista: [], k: 0, slug: null, modo: null, volver: null, conex: {}, tRed: 0, arrastrando: false, niveles: null, stage: null };

  /** Avance del modelo: el mejor y el peor intento que ha tenido (en el nivel que entrena o entrenó por último). */
  async function abrirAvance(slug, volver) {
    const r = await api(`/api/avance?modelo=${encodeURIComponent(slug)}`);
    if (!r.ok) { toast(r.msg || "No hay intentos guardados todavía.", 5000); return; }
    SM.niveles = r.niveles;
    const stages = Object.keys(r.niveles).filter((s) => r.niveles[s].mejor || r.niveles[s].peor);
    if (!stages.length) { toast("Todavía no hay intentos guardados: entrénalo un rato.", 4000); return; }
    // el nivel que se grabó más recientemente
    SM.stage = stages.sort((a, b) => ultimo(r.niveles[b]) - ultimo(r.niveles[a]))[0];
    abrir(slug, "avance", volver);
    elegirNivel(SM.stage);
  }
  const ultimo = (nv) => Math.max(nv.mejor?.t || 0, nv.peor?.t || 0);
  function elegirNivel(st) {
    SM.stage = st;
    const nv = SM.niveles[st];
    SM.lista = [["Mejor intento", nv.mejor], ["Peor intento", nv.peor]].filter(([, rep]) => rep).map(([titulo, rep]) => ({ titulo, rep }));
    mostrar(0);
  }

  /** Simular prueba: una prueba nueva al azar con la última generación guardada (no detiene el entrenamiento). */
  async function abrirSimular(slug, volver) {
    toast("Simulando una prueba…", 1500);
    const r = await api("/api/simular", { modelo: slug });
    if (!r.ok) { toast(r.msg || "No pude simular.", 5000); return; }
    SM.niveles = null;
    abrir(slug, "prueba", volver);
    SM.lista = [{ titulo: "Prueba", rep: r }];
    mostrar(0);
  }

  function abrir(slug, modo, volver) {
    SM.slug = slug; SM.modo = modo; SM.volver = volver || null;
    ctx.show("sim");
    $("sim-otra").classList.toggle("hidden", modo !== "prueba");
    cargarConexiones(slug);
  }
  async function cargarConexiones(slug) {
    if (SM.conex[slug]) return;
    try {
      const r = await fetch(ctx.urlModelo(slug), { cache: "no-store" });
      if (r.ok) SM.conex[slug] = conexionesFuertes(await r.json());
    } catch { /* sin conexiones: se dibujan solo las neuronas */ }
  }

  function mostrar(k) {
    SM.k = k;
    const it = SM.lista[k];
    if (!it) return;
    ctx.G.sim?.dispose();
    ctx.G.sim = new Visor(ctx.renderer, it.rep, { quality: ctx.G.quality });
    const rep = it.rep;
    $("sim-h").textContent = SM.modo === "avance" ? "Avance del modelo" : "Simular prueba";
    $("sim-sub").innerHTML = `IA <b>"${esc(SM.slug)}"</b> · ${esc(rep.mision || `nivel ${rep.stage}`)} · generación ${rep.gen ?? "?"} · dron ${esc(rep.dron || "estándar")}` +
      (SM.modo === "avance" ? ` · ${hace(rep.t)}` : " · la última generación guardada · no es un pedido: no da plata ni daña nada");
    // pestañas (mejor / peor) y, si entrenó en varios niveles, cuál
    const tabs = $("sim-tabs");
    tabs.innerHTML = "";
    if (SM.lista.length > 1) SM.lista.forEach((x, i) => {
      const b = document.createElement("button");
      b.textContent = `${x.titulo} · gen ${x.rep.gen ?? "?"}`;
      b.setAttribute("aria-pressed", String(i === k));
      b.onclick = () => mostrar(i);
      tabs.appendChild(b);
    });
    if (SM.niveles && Object.keys(SM.niveles).length > 1) {
      const sel = document.createElement("select");
      sel.className = "sim-sel";
      sel.setAttribute("aria-label", "Nivel");
      for (const st of Object.keys(SM.niveles)) sel.add(new Option(SM.niveles[st].mejor?.mision || `nivel ${st}`, st, false, st === SM.stage));
      sel.onchange = () => elegirNivel(sel.value);
      tabs.appendChild(sel);
    }
    $("sim-res").innerHTML = resultadoTxt(rep);
    $("sim-t").max = String(ctx.G.sim.dur);
    pintarControles();
  }
  const hace = (t) => { const m = Math.round((Date.now() / 1000 - t) / 60); return m < 1 ? "hace un momento" : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} días`; };

  function pintarControles() {
    const V = ctx.G.sim;
    if (!V) return;
    $("sim-play").textContent = V.play ? "⏸" : "▶";
    $("sim-play").setAttribute("aria-label", V.play ? "Pausa" : "Reproducir");
    document.querySelectorAll("#sim-vel button").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.v) === V.vel)));
    document.querySelectorAll("#sim-cam button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === V.camMode)));
  }

  /** Cada cuadro (main.js): la línea de tiempo, y unas 10 veces por segundo la red y las gráficas. */
  function tick() {
    const V = ctx.G.sim;
    if (!V) return;
    if (!SM.arrastrando) $("sim-t").value = String(V.t);
    $("sim-tt").textContent = `${V.t.toFixed(1)} / ${V.dur.toFixed(1)} s`;
    if ($("sim-play").textContent !== (V.play ? "⏸" : "▶")) pintarControles();
    const now = performance.now();
    if (now - SM.tRed < 100) return;
    SM.tRed = now;
    const R = V.red();
    if (R) {
      const top = dibujarRed($("sim-red"), { ...R, w: SM.conex[SM.slug] }, { altoMin: 300, altoMax: 420 });
      $("sim-red-top").textContent = "Lo que más siente: " + top.join(" · ");
    }
    dibujarGraficas($("sim-graf"), V);
    const e = V.estado();
    $("sim-ahora").innerHTML = `altura <b>${e.pos[2].toFixed(1)} m</b> · velocidad <b>${e.vel.toFixed(1)} m/s</b>` +
      (V.rep.toma ? ` · calidad <b>${Math.round((e.q || 0) * 100)} %</b> · toma ${Math.round((e.prog || 0) * 100)} %` : "") + ` · premio <b>${(e.premio ?? 0).toFixed(1)}</b>`;
  }

  function cerrar() {
    ctx.G.sim?.dispose();
    ctx.G.sim = null;
    if (SM.volver) SM.volver(); else ctx.irTaller();
  }

  // ---------------- botones ----------------
  $("sim-play").onclick = () => { const V = ctx.G.sim; if (!V) return; if (!V.play && V.t >= V.dur) V.t = 0; V.play = !V.play; pintarControles(); };
  document.querySelectorAll("#sim-vel button").forEach((b) => (b.onclick = () => { if (ctx.G.sim) ctx.G.sim.vel = Number(b.dataset.v); pintarControles(); }));
  document.querySelectorAll("#sim-cam button").forEach((b) => (b.onclick = () => { if (ctx.G.sim) { ctx.G.sim.camMode = b.dataset.v; ctx.G.sim.camPos = null; } pintarControles(); }));
  $("sim-t").addEventListener("input", (ev) => { SM.arrastrando = true; if (ctx.G.sim) { ctx.G.sim.t = Number(ev.target.value); } });
  $("sim-t").addEventListener("change", () => { SM.arrastrando = false; });
  $("sim-otra").onclick = () => abrirSimular(SM.slug, SM.volver);
  $("sim-cerrar").onclick = cerrar;

  /** Teclas en la pantalla de simulación: Espacio pausa, ← → 2 s, C cambia la cámara, Esc cierra. */
  function tecla(ev) {
    const V = ctx.G.sim;
    if (!V) return false;
    if (ev.code === "Space") { ev.preventDefault(); $("sim-play").click(); return true; }
    if (ev.code === "ArrowLeft" || ev.code === "ArrowRight") { V.t = Math.max(0, Math.min(V.dur, V.t + (ev.code === "ArrowLeft" ? -2 : 2))); return true; }
    if (ev.code === "KeyC") { const m = ["persecucion", "dron", "arriba"]; V.camMode = m[(m.indexOf(V.camMode) + 1) % m.length]; V.camPos = null; pintarControles(); return true; }
    if (ev.code === "Escape") { cerrar(); return true; }
    return false;
  }

  return { abrirAvance, abrirSimular, tick, tecla, cerrar };
}
