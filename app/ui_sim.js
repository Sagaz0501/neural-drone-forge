// =====================================================================
// La pantalla de SIMULACIONES (los botones "Avance del modelo" y "Simular prueba" de cada dron / modelo).
// El 3D y las gráficas están en simulacion.js; aquí los botones, las pestañas (mejor / peor), la línea de tiempo,
// las cámaras y la red neuronal del instante. Nada de esto toca la partida: no da plata ni daña el dron.
// =====================================================================
import { Visor, dibujarGraficas, resultadoTxt, dibujarRed, conexionesFuertes } from "./simulacion.js";
import { t } from "./i18n.js";

export function initSim(ctx) {
  const { $, esc, api, toast } = ctx;
  const visibles = async () => ctx.PT.modelosVisibles(ctx.P?.(), (await api("/api/modelos")).modelos);   // los de esta partida
  const SM = { lista: [], k: 0, slug: null, modo: null, volver: null, conex: {}, tRed: 0, arrastrando: false, niveles: null, stage: null };

  /**
   * Preguntar con qué IA: todos los modelos guardados con su generación (los que entrenan y los que tienen avance,
   * marcados). sugerido = el que sale primero (la IA del dron o la que entrena). Devuelve el slug o null (cancelar).
   */
  async function preguntarModelo(titulo, sugerido, paraAvance) {
    const ms = (await visibles()).filter((m) => m.tiene_modelo);
    if (!ms.length) { toast(t("No hay modelos guardados todavía."), 4000); return null; }
    // sugerido: la IA del dron; si no, la que entrena; si no, la que entrenaste por última vez
    const reciente = [...ms].sort((a, b) => String(b.actualizado || "").localeCompare(String(a.actualizado || "")))[0];
    const pref = sugerido || ms.find((m) => m.entrenando)?.slug || reciente?.slug;
    ms.sort((a, b) => (b.slug === pref) - (a.slug === pref) || b.entrenando - a.entrenando || String(b.actualizado || "").localeCompare(String(a.actualizado || "")));
    $("sim-elegir-h").textContent = titulo;
    const box = $("sim-elegir-l");
    box.innerHTML = "";
    return new Promise((listo) => {
      for (const m of ms) {
        const b = document.createElement("button");
        b.className = "card";
        const tags = [m.entrenando ? `<span class="tag ok">${t("entrenando ({donde})", { donde: m.donde })}</span>` : "", m.slug === pref ? `<span class="tag">${t("sugerido")}</span>` : "",
          paraAvance ? (m.avance ? `<span class="tag">${t("con avance")}</span>` : `<span class="tag muted">${t("sin avance")}</span>`) : ""].join(" ");
        const ult = m.ultimo ? " · " + t("éxito {p} % en el nivel {n}", { p: Math.round((m.ultimo[2] || 0) * 100), n: m.ultimo[4] }) : "";
        b.innerHTML = `<b>${esc(m.slug)}</b> ${tags}<small>${t("generación guardada <b>{gen}</b>", { gen: m.gen ?? 0 })}${ult}${m.red ? " · " + t("red {red}", { red: m.red.join("→") }) : ""}${m.actualizado ? " · " + t("guardado {fecha}", { fecha: esc(m.actualizado) }) : ""}</small>`;
        b.onclick = () => { ctx.modal("sim-elegir", false); listo(m.slug); };
        box.appendChild(b);
      }
      $("sim-elegir-no").onclick = () => { ctx.modal("sim-elegir", false); listo(null); };
      ctx.modal("sim-elegir");
    });
  }

  /** Si no se sabe qué IA mirar (un dron sin IA propia): la que está entrenando ahora, o la base. */
  async function resolver(slug) {
    if (slug) return slug;
    const s = await api("/api/lab");
    const b = s.blender || {};
    if (s.blender_modelo && ((b.abierto && b.corriendo) || s.entrenador?.activo)) return s.blender_modelo;
    const f = (s.fondo || []).find((x) => x.activo);
    return f ? f.modelo : "base";
  }

  /** Avance del modelo: de dónde salió y a dónde llegó (primer intento, peor, mejor, último) + "Ahora" (una prueba nueva). */
  async function abrirAvance(slug, volver, { preguntar = false } = {}) {
    if (preguntar) { slug = await preguntarModelo(t("¿El avance de qué IA?"), slug, true); if (!slug) return; }
    slug = await resolver(slug);
    const r = await api(`/api/avance?modelo=${encodeURIComponent(slug)}`);
    if (!r.ok) {
      const ms = await visibles();
      const con = ms.filter((m) => m.avance).map((m) => `"${m.slug}"`);
      toast(`"${esc(slug)}": ${r.msg || t("no hay intentos guardados todavía.")}${con.length ? " " + t("Tienen avance: {lista}.", { lista: con.join(", ") }) : ""}`, 6000);
      return;
    }
    SM.niveles = r.niveles;
    const stages = Object.keys(r.niveles).filter((s) => r.niveles[s].mejor || r.niveles[s].peor);
    if (!stages.length) { toast(t("Todavía no hay intentos guardados: entrénalo un rato."), 4000); return; }
    // el nivel que se grabó más recientemente
    SM.stage = stages.sort((a, b) => ultimo(r.niveles[b]) - ultimo(r.niveles[a]))[0];
    abrir(slug, "avance", volver);
    elegirNivel(SM.stage);
  }
  const ultimo = (nv) => Math.max(nv.mejor?.t || 0, nv.peor?.t || 0);
  const TITULO_ = () => ({ primero: t("Primer intento"), peor: t("El peor"), mejor: t("El mejor"), ultimo: t("El último") });
  function elegirNivel(st) {
    SM.stage = st;
    const nv = SM.niveles[st], TITULO = TITULO_();
    // en orden de generación (el mismo intento puede ser el primero y el peor: una sola pestaña)
    const items = [];
    for (const k of ["primero", "peor", "mejor", "ultimo"]) {
      const rep = nv[k];
      if (!rep) continue;
      const igual = items.find((x) => x.rep.t === rep.t);
      if (igual) igual.titulo += ` = ${TITULO[k].toLowerCase()}`;
      else items.push({ titulo: TITULO[k], rep });
    }
    SM.lista = items.sort((a, b) => (a.rep.gen ?? 0) - (b.rep.gen ?? 0) || a.rep.t - b.rep.t);
    mostrar(SM.lista.length - 1);
  }
  /** "Ahora": una prueba nueva con la generación de este momento, como última pestaña del avance. */
  async function ahora() {
    toast(t("Simulando una prueba con la generación de ahora…"), 1500);
    const r = await api("/api/simular", { modelo: SM.slug });
    if (!r.ok) { toast(r.msg || t("No pude simular."), 5000); return; }
    SM.lista = SM.lista.filter((x) => !x.ahora);
    SM.lista.push({ titulo: t("Ahora"), rep: r, ahora: true });
    mostrar(SM.lista.length - 1);
  }

  /** Simular prueba: una prueba nueva al azar con la última generación guardada (no detiene el entrenamiento). */
  async function abrirSimular(slug, volver, { preguntar = false } = {}) {
    if (preguntar) { slug = await preguntarModelo(t("¿Con qué IA simulo la prueba?"), slug, false); if (!slug) return; }
    slug = await resolver(slug);
    toast(t("Simulando una prueba…"), 1500);
    const r = await api("/api/simular", { modelo: slug });
    if (!r.ok) { toast(r.msg || t("No pude simular."), 5000); return; }
    SM.niveles = null;
    abrir(slug, "prueba", volver);
    SM.lista = [{ titulo: t("Prueba"), rep: r }];
    mostrar(0);
  }

  function abrir(slug, modo, volver) {
    SM.slug = slug; SM.modo = modo; SM.volver = volver || null;
    ctx.show("sim");
    $("sim-otra").classList.toggle("hidden", modo !== "prueba");
    $("sim-ahora-b").classList.toggle("hidden", modo !== "avance");
    cargarConexiones(slug);
    selectorModelos();
  }
  /** Qué modelo mirar: todos los guardados (los que tienen avance, marcados). */
  async function selectorModelos() {
    const sel = $("sim-modelo"), ms = (await visibles()).filter((m) => m.tiene_modelo);
    sel.innerHTML = "";
    for (const m of ms) sel.add(new Option(`${m.slug}${m.entrenando ? " · " + t("entrenando") : ""}${SM.modo === "avance" && !m.avance ? ` (${t("sin avance")})` : ""}`, m.slug, false, m.slug === SM.slug));
    sel.onchange = () => (SM.modo === "avance" ? abrirAvance(sel.value, SM.volver) : abrirSimular(sel.value, SM.volver));
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
    $("sim-h").textContent = SM.modo === "avance" ? t("Avance del modelo") : t("Simular prueba");
    $("sim-sub").innerHTML = t('IA <b>"{m}"</b> · {mision} · generación {gen} · dron {dron}', { m: esc(SM.slug), mision: esc(rep.mision || t("nivel {n}", { n: rep.stage })), gen: rep.gen ?? "?", dron: esc(rep.dron || t("estándar")) }) +
      (SM.modo === "avance" && !it.ahora ? ` · ${hace(rep.t)}` : " · " + t("la última generación guardada · no es un pedido: no da plata ni daña nada"));
    // pestañas (mejor / peor) y, si entrenó en varios niveles, cuál
    const tabs = $("sim-tabs");
    tabs.innerHTML = "";
    if (SM.lista.length > 1 || SM.modo === "avance") SM.lista.forEach((x, i) => {
      const b = document.createElement("button");
      b.textContent = `${x.titulo} · gen ${x.rep.gen ?? "?"}`;
      b.setAttribute("aria-pressed", String(i === k));
      b.onclick = () => mostrar(i);
      tabs.appendChild(b);
    });
    if (SM.niveles && Object.keys(SM.niveles).length > 1) {
      const sel = document.createElement("select");
      sel.className = "sim-sel";
      sel.setAttribute("aria-label", t("Nivel"));
      for (const st of Object.keys(SM.niveles)) sel.add(new Option(SM.niveles[st].mejor?.mision || t("nivel {n}", { n: st }), st, false, st === SM.stage));
      sel.onchange = () => elegirNivel(sel.value);
      tabs.appendChild(sel);
    }
    $("sim-res").innerHTML = resultadoTxt(rep);
    $("sim-t").max = String(ctx.G.sim.dur);
    pintarControles();
  }
  const hace = (ts) => { const m = Math.round((Date.now() / 1000 - ts) / 60); return m < 1 ? t("hace un momento") : m < 60 ? t("hace {n} min", { n: m }) : m < 1440 ? t("hace {n} h", { n: Math.round(m / 60) }) : t("hace {n} días", { n: Math.round(m / 1440) }); };

  function pintarControles() {
    const V = ctx.G.sim;
    if (!V) return;
    $("sim-play").textContent = V.play ? "⏸" : "▶";
    $("sim-play").setAttribute("aria-label", V.play ? t("Pausa") : t("Reproducir"));
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
      $("sim-red-top").textContent = t("Lo que más siente: {lista}", { lista: top.join(" · ") });
    }
    dibujarGraficas($("sim-graf"), V);
    const e = V.estado();
    $("sim-ahora").innerHTML = t("altura <b>{z} m</b> · velocidad <b>{v} m/s</b>", { z: e.pos[2].toFixed(1), v: e.vel.toFixed(1) }) +
      (V.rep.toma ? " · " + t("calidad <b>{q} %</b> · toma {p} %", { q: Math.round((e.q || 0) * 100), p: Math.round((e.prog || 0) * 100) }) : "") + " · " + t("premio <b>{v}</b>", { v: (e.premio ?? 0).toFixed(1) });
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
  $("sim-ahora-b").onclick = () => ahora();
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
