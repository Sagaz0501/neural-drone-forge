// =====================================================================
// EL BANCO DE ARMADO (la pantalla). Pasos a la izquierda, el dron en 3D al centro (se gira arrastrando),
// el trabajo de cada paso a la derecha:
//   Imprimir (forma, tu STL, carcasa; descargar el STL) · Armar (cada pieza vuela a su lugar) ·
//   Cablear (la mesa de soldar: un pin y otro pin = un cable) · Prueba de humo (conectar la batería:
//   si hay un corto, se quema algo) · Programar (flashear, calibrar, puertos, radio, motores, cargar la IA) ·
//   Hélices · Prueba atada (si los motores están mal, se voltea).
// La lógica (pines, qué se quema, el orden de los motores) está en banco.js.
// =====================================================================
import { buildDrone } from "./dron3d.js";
import { exportarSTL, STL_CACHE } from "./stl.js";
import { sfx } from "./garaje.js";
import { t, idioma } from "./i18n.js";

const COLOR_PIN = { "vbat+": "#ff3b30", "5v+": "#ff8a1a", "3v3+": "#ffd23f", vbat_in: "#ff3b30", "5v_in": "#ff8a1a", "3v3_in": "#ffd23f", gnd: "#9aa0a6",
  tx: "#3ccbff", rx: "#3c8bff", sda: "#c07bff", scl: "#9a5bff", led_out: "#47f08a", led_in: "#47f08a", m_out: "#2ad8b0", m_in: "#2ad8b0",
  esc_conn: "#eaf2ef", fc_conn: "#eaf2ef", ufl: "#d4af37", ant: "#d4af37" };
const SLOT3D = { xt60: "bateria", esc: "esc", fc: "controladora", gps: "controladora", rx: "radio", ant: "radio", cam: "camara", tof: "extras", led: "extras",
  mFL: "motores", mFR: "motores", mRL: "motores", mRR: "motores" };
// funciones (no constantes): t() tiene que correr después de cargar el idioma
const ORDEN = () => [["chasis", t("Chasis"), "chasis"], ["motores", t("Motores"), "motores"], ["esc", t("ESC 4 en 1"), "esc"], ["controladora", t("Controladora"), "controladora"],
  ["radio", t("Radio"), "radio"], ["camara", t("Cámara"), "camara"], ["montaje", t("Montaje de la cámara"), "camara"], ["bateria", t("Batería"), "bateria"]];
const posn = (k) => ({ FL: t("adelante izq."), FR: t("adelante der."), RL: t("atrás izq."), RR: t("atrás der.") })[k];
const giro = (k) => ({ cw: t("↻ horario"), ccw: t("↺ antihorario") })[k];
/** El mensaje de un daño en futuro ("se va a quemar"): con el multímetro, antes de conectar la batería. */
const vaAQuemar = (msg) => msg.replace(t("se quemó"), t("se va a quemar")).replace(t("Se quemó"), t("Se va a quemar"));
const ibaAQuemar = (msg) => msg.replace(t("se quemó"), t("se iba a quemar")).replace(t("Se quemó"), t("Se iba a quemar"));

export function initBanco(ctx) {
  const { cat, PT, BA, $, esc, toast, guardar, G } = ctx;
  const BK = { paso: null, tab: "flash", ocupado: false, sel: null, diag: false, multi: false, diseno: null, canopy: null, vistos: [], girados: [], girando: null, firmaMot: null, fw: null, pasoVisto: null };
  const P = () => G.partida;
  const D = () => ctx.D();
  const U = (uid) => PT.unidad(P(), uid);
  const ocupado = async (fn) => { if (BK.ocupado) return; BK.ocupado = true; try { await fn(); } finally { BK.ocupado = false; render(); ctx.verDron(); } };
  const refrescar = () => { guardar(); ctx.verDron(); render(); };

  function abrir() {
    const e = ctx.estadoDe(D());
    BK.paso = e.pasos.find((x) => !x.ok)?.k || "prueba";
    BK.vistos = []; BK.girados = []; BK.firmaMot = null;
    BK.diseno = null; BK.canopy = null;
    ctx.garaje.vistaPiloto();
    render();
  }

  // ---------------- los pasos (izquierda) ----------------
  function render() {
    const d = D();
    if (!d || G.screen !== "banco") return;
    const e = ctx.estadoDe(d);
    $("banco-dron").textContent = d.nombre;
    $("banco-sub").innerHTML = e.listo ? `<span class="ok">${t("✓ Listo para volar")}</span>${e.iaOk ? ` · ${t("IA cargada")}` : ""}` : t("Termínalo paso a paso");
    const ul = $("banco-pasos");
    ul.innerHTML = "";
    const pasos = e.pasos.some((x) => x.k === "imprimir") ? [...e.pasos] : [{ k: "imprimir", nombre: t("Diseño e impresión"), ok: true, nota: "" }, ...e.pasos];
    pasos.push({ k: "ia", nombre: t("Cargar su IA"), ok: e.iaOk, nota: d.modelo ? "" : t("Sin IA todavía (opcional para volar tú)") });
    for (const p of pasos) {
      const li = document.createElement("li"), b = document.createElement("button");
      b.setAttribute("aria-pressed", String(p.k === BK.paso));
      b.innerHTML = `<span class="ic ${p.ok ? "ok" : "no"}">${p.ok ? "✓" : "○"}</span><span>${p.nombre}</span>${!p.ok && p.nota && p.k === BK.paso ? `<small>${esc(p.nota)}</small>` : ""}`;
      b.onclick = () => { BK.paso = p.k; if (p.k === "ia") { BK.paso = "firmware"; BK.tab = "ia"; } render(); };
      li.appendChild(b);
      ul.appendChild(li);
    }
    const der = $("banco-der");
    der.innerHTML = "";
    ({ imprimir: pImprimir, armar: pArmar, cablear: pCablear, humo: pHumo, firmware: pProgramar, config: pProgramar, motores: pProgramar, helices: pHelices, prueba: pPrueba })[BK.paso]?.(der, d, e);
    ctx.garaje.conectarUSB(BK.paso === "firmware" || BK.paso === "config" || BK.paso === "motores");
    const pv = BK.paso === "motores" || BK.paso === "prueba" || BK.paso === "helices" ? BK.paso : null;
    if (pv && BK.pasoVisto !== pv) ctx.garaje.vistaPiloto();       // para ver los motores: como el piloto
    BK.pasoVisto = pv;
  }
  $("b-banco-volver").onclick = () => { ctx.irTaller(); };

  const h = (der, html) => der.insertAdjacentHTML("beforeend", html);
  const boton = (der, txt, cls, fn, dis = false) => {
    let go = der.querySelector(".go:last-child");
    if (!go) { go = document.createElement("div"); go.className = "go"; der.appendChild(go); }
    const b = document.createElement("button");
    b.className = "btn " + cls; b.innerHTML = txt; b.disabled = dis || BK.ocupado; b.onclick = fn;
    go.appendChild(b);
    return b;
  };
  const nuevaFila = (der) => { const go = document.createElement("div"); go.className = "go"; der.appendChild(go); };

  // ---------------- imprimir: forma, tu STL, carcasa; descargar STL ----------------
  function pImprimir(der, d) {
    const p = P(), chU = U(d.slots.chasis), chP = chU && cat.chasis.find((x) => x.id === chU.id), impresora = PT.tieneHerramienta(p, "impresora");
    h(der, `<h3>${t("Diseño e impresión")}</h3>`);
    if (!chU) { h(der, `<p>${t("Primero elige un chasis para este dron (en el hangar).")}</p>`); return; }
    if (!chP.imprimible) h(der, `<p>${t("El <b>{chasis}</b> no se imprime: viene hecho. Si quieres tu propia forma, usa un chasis de PLA o PETG con la impresora 3D.", { chasis: chP.nombre })}</p>`);
    else if (!impresora) h(der, `<p>${t("Sin impresora 3D, el <b>{chasis}</b> llega impreso de la tienda (en X). Con la impresora eliges la forma, imprimes tu STL y te sale 40 % más barato.", { chasis: chP.nombre })}</p>`);
    else {
      const actual = chU.diseno, dis = BK.diseno || actual || { tipo: "forma", forma: "x" };
      h(der, `<p>${actual ? t("Este chasis ya está impreso ({diseno}). Reimprimirlo cuesta <span class=\"money\">${n}</span> de filamento.", { diseno: actual.tipo === "stl" ? t("tu STL") : cat.estilo.formas[actual.forma], n: reimpresion(chP) }) : t("Elige la forma y dale imprimir: sale en {mat}, del color que pintaste el dron.", { mat: chP.id === "petg" ? "PETG" : "PLA" })}</p><div class="disenos" id="bk-dis"></div>`);
      const box = der.querySelector("#bk-dis");
      const opts = [...Object.entries(cat.estilo.formas).map(([k, n]) => ({ d: { tipo: "forma", forma: k }, n: n.split(" (")[0], s: (n.split("(")[1] || "").replace(")", "") })),
        ...G.stl.filter((s) => s.tipo === "chasis").map((s) => { const m = STL_CACHE.get(s.id)?.meta; return { d: { tipo: "stl", id: s.id }, n: s.nombre, s: m ? t("tu STL · ~{g} g · hélices {pul}\"", { g: m.masa_g, pul: m.helice_max }) : t("tu STL") }; })];
      for (const o of opts) {
        const b = document.createElement("button");
        const on = o.d.tipo === dis.tipo && (o.d.forma || o.d.id) === (dis.forma || dis.id);
        b.setAttribute("aria-pressed", String(on));
        b.innerHTML = `${esc(o.n)}<small>${esc(o.s)}</small>`;
        b.onclick = () => { BK.diseno = o.d; render(); verPrevia(o.d); };
        box.appendChild(b);
      }
      h(der, `<p style="font-size:13px">${t("¿Tu propio diseño? Importa un STL en <b>Inventario → Tus diseños 3D</b> (tipo Chasis). El peso sale del volumen impreso y los motores van en las puntas de los brazos.")}</p>`);
      const mismo = actual && actual.tipo === dis.tipo && (actual.forma || actual.id) === (dis.forma || dis.id);
      boton(der, actual ? (mismo ? t("Ya está impreso así") : t("Reimprimir (${n})", { n: reimpresion(chP) })) : t("Imprimir"), "main", () => imprimirChasis(d, chU, chP, dis, !!actual), mismo);
    }
    // carcasa
    h(der, `<h3 style="margin-top:18px">${t("Carcasa (canopy)")}</h3><p>${t("Tapa la electrónica. Se imprime en TPU/PLA: pesa poco y es del color de los detalles.")}</p><div class="disenos" id="bk-can"></div>`);
    const cb = der.querySelector("#bk-can"), act = d.canopy?.tipo || "ninguna";
    const copts = [...Object.entries(cat.estilo.canopies).filter(([k]) => !k.startsWith("_")).map(([k, v]) => ({ c: { tipo: k, masa_g: v.masa_g }, n: v.nombre, s: v.masa_g ? `${v.masa_g} g` : "" })),
      ...G.stl.filter((s) => s.tipo === "canopy").map((s) => { const m = STL_CACHE.get(s.id)?.meta; return { c: { tipo: "stl", id: s.id, masa_g: m?.masa_g || 10 }, n: s.nombre, s: t("tu STL · ~{g} g", { g: m?.masa_g ?? "?" }) }; })];
    for (const o of copts) {
      const b = document.createElement("button"), sel = BK.canopy || d.canopy || { tipo: "ninguna" };
      b.setAttribute("aria-pressed", String(o.c.tipo === sel.tipo && (o.c.id || "") === (sel.id || "")));
      b.innerHTML = `${esc(o.n)}<small>${esc(o.s)}${o.c.tipo === act && (o.c.id || "") === (d.canopy?.id || "") ? ` · ${t("puesta")}` : ""}</small>`;
      b.onclick = () => { BK.canopy = o.c; render(); };
      cb.appendChild(b);
    }
    nuevaFila(der);
    const sel = BK.canopy;
    if (sel && !(sel.tipo === act && (sel.id || "") === (d.canopy?.id || ""))) {
      if (sel.tipo === "ninguna") boton(der, t("Quitar la carcasa"), "ghost", () => { d.canopy = null; BK.canopy = null; refrescar(); });
      else boton(der, impresora ? t("Imprimir carcasa") : t("Necesitas la impresora 3D"), "main", () => imprimirCanopy(d, sel), !impresora);
    }
    // descargar
    h(der, `<h3 style="margin-top:18px">${t("Descargar STL")}</h3><p>${t("Para imprimirlo de verdad (en milímetros, Z arriba, listo para Cura/PrusaSlicer/Bambu Studio), o para diseñar tu carcasa encima de la placa.")}</p>`);
    nuevaFila(der);
    const b = ctx.dronVista(d);
    boton(der, t("Chasis"), "ghost small", () => bajar(buildDrone({ chasis: b.chasis, diseno: BK.diseno || b.diseno, estilo: b.estilo }, cat).userData.slots.chasis, `chasis_${d.nombre}`), !b.chasis);
    boton(der, t("Carcasa"), "ghost small", () => bajar(buildDrone({ canopy: d.canopy, estilo: b.estilo }, cat).userData.slots.canopy, `carcasa_${d.nombre}`), !d.canopy);
    boton(der, t("Controladora"), "ghost small", () => bajar(buildDrone({ controladora: b.controladora }, cat).userData.slots.controladora, b.controladora), !b.controladora);
    boton(der, t("Dron completo"), "ghost small", () => bajar(buildDrone({ ...b, fantasma: [], sinHelices: false, cables: false }, cat), `dron_${d.nombre}`));
  }
  const reimpresion = (chP) => Math.round(PT.precioDe(P(), chP) * PT.REIMPRIMIR);
  function verPrevia(dis) { const b = ctx.dronVista(); ctx.garaje.setBuild({ ...b, diseno: dis }, cat); }
  function bajar(obj, nombre) {
    if (!obj) return;
    const blob = exportarSTL(obj, nombre), a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `${nombre.replace(/[^\w.-]+/g, "_")}.stl`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast(t("Descargado {archivo} ({kb} KB).", { archivo: a.download, kb: (blob.size / 1024).toFixed(0) }));
  }

  function imprimirChasis(d, chU, chP, dis, reimprimir) {
    const p = P();
    if (reimprimir) { const c = reimpresion(chP); if (p.plata < c) { toast(t("Te faltan ${n} de filamento.", { n: c - p.plata })); return; } p.plata -= c; }
    ocupado(async () => {
      const g = buildDrone({ chasis: chP.id, diseno: dis, estilo: d.estilo }, cat).userData.slots.chasis;
      ctx.garaje.view = "imprimir";
      ctx.garaje.setBuild({}, cat);
      await ctx.garaje.imprimir(g, 5.5);
      ctx.garaje.view = "banco";
      if (dis.tipo === "stl") {
        const m = STL_CACHE.get(dis.id)?.meta, dens = chP.id === "petg" ? 1.27 : 1.24;
        chU.diseno = { tipo: "stl", id: dis.id, masa_g: Math.max(40, Math.round((m.volumen_cm3 * dens * 0.45))), radio_m: m.radio_m, helice_max: m.helice_max };
      } else chU.diseno = { tipo: "forma", forma: dis.forma };
      d.estilo.forma = dis.forma || d.estilo.forma;
      if (d.banco?.instalado) d.banco.instalado.chasis = null;       // la pieza nueva hay que montarla
      BK.diseno = null;
      guardar();
      toast(dis.tipo === "stl" ? t("¡Impreso! Tu chasis pesa {g} g. Ahora ármalo.", { g: chU.diseno.masa_g }) : t("¡Impreso! Ahora ármalo."), 3500);
      BK.paso = "armar";
    });
  }
  function imprimirCanopy(d, c) {
    ocupado(async () => {
      const g = buildDrone({ canopy: c, estilo: d.estilo }, cat).userData.slots.canopy;
      ctx.garaje.view = "imprimir";
      await ctx.garaje.imprimir(g, 3.5);
      ctx.garaje.view = "banco";
      d.canopy = c;
      BK.canopy = null;
      guardar();
      toast(t("Carcasa impresa y puesta."));
    });
  }

  // ---------------- armar ----------------
  function pArmar(der, d, e) {
    const p = P(), B = d.banco, chP = cat.chasis.find((x) => x.id === U(d.slots.chasis)?.id), impresora = PT.tieneHerramienta(p, "impresora");
    h(der, `<h3>${t("Armar")}</h3><p>${t("Cada pieza a su lugar, en orden: chasis, motores, el ESC abajo, la controladora encima (el \"stack\"), la radio, la cámara y la batería. Las hélices van de último, después de probar los motores.")}</p><ul class="lista" id="bk-arm"></ul>`);
    const ul = der.querySelector("#bk-arm");
    const sinImprimir = chP?.imprimible && impresora && !U(d.slots.chasis)?.diseno;
    const pend = [];
    for (const [slot, nombre, s3] of ORDEN()) {
      const uid = d.slots[slot];
      if (!uid) { ul.insertAdjacentHTML("beforeend", `<li><span>${nombre}</span><span class="muted">${t("no elegiste")}</span></li>`); continue; }
      const u = U(uid), pz = PT.buscarPieza(cat, u.id), ok = B.instalado[slot] === uid;
      const li = document.createElement("li");
      li.innerHTML = `<span>${nombre}<br><small class="muted">${pz.nombre}${u.vida <= 0 ? ` · <span class='bad'>${t("rota")}</span>` : ""}</small></span>`;
      if (ok) li.insertAdjacentHTML("beforeend", `<span class='ok'>${t("✓ instalado")}</span>`);
      else {
        const b = document.createElement("button");
        b.className = "btn ghost small";
        b.textContent = B.instalado[slot] ? t("Cambiar") : t("Instalar");
        const bloq = slot !== "chasis" && B.instalado.chasis !== d.slots.chasis ? t("Primero el chasis.") : slot === "chasis" && sinImprimir ? t("Primero imprímelo.") : null;
        b.disabled = BK.ocupado;
        b.onclick = () => (bloq ? toast(bloq) : instalar([[slot, s3]]));
        li.appendChild(b);
        if (!(slot === "chasis" && sinImprimir)) pend.push([slot, s3]);       // "instalar todo" empieza por el chasis
      }
      ul.appendChild(li);
    }
    const exOk = d.extras.length === (B.instalado.extras || []).length && d.extras.every((x) => B.instalado.extras.includes(x));
    if (d.extras.length || (B.instalado.extras || []).length) {
      const li = document.createElement("li");
      li.innerHTML = `<span>${t("Extras")}<br><small class="muted">${d.extras.map((u) => PT.buscarPieza(cat, U(u)?.id)?.nombre).join(", ") || t("ninguno")}</small></span>`;
      if (exOk) li.insertAdjacentHTML("beforeend", `<span class='ok'>${t("✓ instalados")}</span>`);
      else { const b = document.createElement("button"); b.className = "btn ghost small"; b.textContent = t("Instalar"); b.onclick = () => instalar([["extras", "extras"]]); li.appendChild(b); pend.push(["extras", "extras"]); }
      ul.appendChild(li);
    }
    if (sinImprimir) h(der, `<p class="warn">${t("El chasis es de {mat} y tienes la impresora: imprímelo primero (paso \"Imprimir\").", { mat: chP.id.toUpperCase() })}</p>`);
    boton(der, t("Instalar todo"), "main", () => instalar(pend), !pend.length || sinImprimir);
    if (e.pasos.find((x) => x.k === "armar").ok) boton(der, t("Siguiente: cablear →"), "ghost", () => { BK.paso = "cablear"; render(); });
  }

  function instalar(lista) {
    const d = D(), B = d.banco;
    ocupado(async () => {
      for (const [slot, s3] of lista) {
        if (slot === "extras") B.instalado.extras = [...d.extras];
        else B.instalado[slot] = d.slots[slot];
        if (slot === "esc" || slot === "motores") { B.helices = false; B.instalado.helices = null; }   // para soldar, sin hélices
        guardar();
        ctx.verDron();
        await ctx.garaje.instalar(s3);
      }
    });
  }

  // ---------------- cablear (la mesa de soldar) ----------------
  function pCablear(der, d, e) {
    const tieneMulti = PT.tieneHerramienta(P(), "multimetro"), rev = e.rev;
    h(der, `<h3>${t("Cablear")}</h3><p>${t("Suelda el cable de la batería (XT60) al ESC, los 4 motores a las salidas M1-M4, el arnés del ESC a la controladora y cada periférico (radio, GPS, cámara, sensores) a su voltaje, su GND y sus datos.")}</p>`);
    if (!e.pasos.find((x) => x.k === "armar").ok) h(der, `<p class="warn">${t("Primero arma el dron.")}</p>`);
    const lst = [...rev.faltan.map((x) => `○ ${x.msg}`)];
    if (tieneMulti) lst.push(...rev.danos.map((x) => `<span class="bad">⚡ ${vaAQuemar(x.msg)}</span>`), ...rev.fallas.map((x) => `<span class="warn">✗ ${x.msg}</span>`));
    h(der, lst.length ? `<ul class="lista" style="display:block">${lst.slice(0, 12).map((x) => `<li style="display:block">${x}</li>`).join("")}</ul>` :
      `<p class="${rev.ok ? "ok" : ""}">${rev.ok ? t("✓ Todo conectado.") : tieneMulti ? "" : t("Todo lo que hay que conectar está conectado. Sin multímetro no sabes si algo está mal… hasta que conectes la batería.")}</p>`);
    if (!tieneMulti) h(der, `<p style="font-size:13px">${t("Con un <b>multímetro</b> ($8 en la tienda, herramientas) el banco te marca los cables malos antes de conectar la batería.")}</p>`);
    boton(der, t("Abrir la mesa de cableado"), "main", () => abrirCableado(), !e.pasos.find((x) => x.k === "armar").ok);
    if (rev.ok || e.pasos.find((x) => x.k === "cablear").ok) boton(der, t("Siguiente: prueba de humo →"), "ghost", () => { BK.paso = "humo"; render(); });
  }

  function abrirCableado() {
    BK.sel = null;
    BK.multi = false;
    $("cab-dron").textContent = D().nombre;
    $("b-cab-multi").classList.toggle("hidden", !PT.tieneHerramienta(P(), "multimetro"));
    ctx.modal("cableado");
    dibujarCables();
  }
  $("b-cab-listo").onclick = () => { ctx.modal("cableado", false); refrescar(); };
  $("b-cab-diag").onclick = () => { BK.diag = !BK.diag; $("b-cab-diag").textContent = BK.diag ? t("Ocultar el diagrama") : t("Ver el diagrama"); dibujarCables(); };
  $("b-cab-multi").onclick = () => { BK.multi = !BK.multi; sfx("click"); dibujarCables(); };
  $("b-cab-borrar").onclick = () => { if (!confirm(t("¿Desoldar todos los cables?"))) return; D().banco.cables = []; guardar(); dibujarCables(); };

  /** Dónde queda cada pin en el dibujo. */
  function layout(comps) {
    const pos = new Map();
    for (const c of comps) {
      const by = { l: [], r: [], t: [], b: [] };
      c.pines.forEach((p) => by[p.lado].push(p));
      c.h = Math.max(by.t.length ? 96 : by.b.length ? 74 : 54, Math.max(by.l.length, by.r.length) * 24 + 34 + (by.t.length ? 36 : 0));
      c.y0 = by.t.length ? 36 : 0;                     // con pines arriba, el título y los pines laterales bajan
      by.l.forEach((p, i) => pos.set(`${c.k}.${p.id}`, { x: c.x, y: c.y + c.y0 + 34 + i * 24, lado: "l", p, c }));
      by.r.forEach((p, i) => pos.set(`${c.k}.${p.id}`, { x: c.x + c.w, y: c.y + c.y0 + 34 + i * 24, lado: "r", p, c }));
      by.t.forEach((p, i) => pos.set(`${c.k}.${p.id}`, { x: c.x + (c.w * (i + 1)) / (by.t.length + 1), y: c.y, lado: "t", p, c }));
      by.b.forEach((p, i) => pos.set(`${c.k}.${p.id}`, { x: c.x + (c.w * (i + 1)) / (by.b.length + 1), y: c.y + c.h, lado: "b", p, c }));
    }
    return pos;
  }
  const curva = (a, b) => {
    const k = 70, dir = { l: [-1, 0], r: [1, 0], t: [0, -1], b: [0, 1] };
    const [ax, ay] = dir[a.lado], [bx, by] = dir[b.lado];
    return `M${a.x},${a.y} C${a.x + ax * k},${a.y + ay * k} ${b.x + bx * k},${b.y + by * k} ${b.x},${b.y}`;
  };
  const colorCable = (a, b) => {
    const tipos = [a.p.tipo, b.p.tipo];
    if (tipos.includes("gnd")) return "#1d1f22";
    for (const k of ["vbat+", "5v+", "3v3+", "vbat_in", "5v_in", "3v3_in"]) if (tipos.includes(k)) return COLOR_PIN[k];
    return COLOR_PIN[a.p.tipo] || "#ccc";
  };

  function dibujarCables() {
    const d = D(), e = ctx.estadoDe(d), comps = e.comps, B = d.banco, pos = layout(comps), rev = e.rev;
    const svg = $("cab-svg"), NS = "http://www.w3.org/2000/svg";
    svg.innerHTML = "";
    const el = (tag, at, parent = svg) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(at)) n.setAttribute(k, v); parent.appendChild(n); return n; };
    // componentes
    for (const c of comps) {
      const u = c.uid === "xt60" ? null : U(c.uid), quemado = u && u.vida <= 0;
      el("rect", { x: c.x, y: c.y, width: c.w, height: c.h, rx: 10, fill: c.k === "fc" ? (c.chip === "esp32" ? "#14143a" : "#123a24") : c.k === "esc" ? "#17181c" : "#1d2a26", stroke: quemado ? "#ff5040" : "rgba(234,242,239,0.25)", "stroke-width": quemado ? 3 : 1.5 });
      const tit = el("text", { x: c.x + 10, y: c.y + (c.y0 || 0) + 18, fill: "#eaf2ef", "font-size": 13, "font-weight": 600, "font-family": "Chakra Petch, sans-serif" });
      const nom = c.k.startsWith("m") ? t("Motor {pos}", { pos: posn(c.k.slice(1)) }) : c.nombre, max = Math.floor(c.w / 7.6);
      tit.textContent = (quemado ? "🔥 " : "") + (nom.length > max ? nom.slice(0, max - 1) + "…" : nom);
      if (c.k.startsWith("m")) { const s = el("text", { x: c.x + 10, y: c.y + 34, fill: "#9db3a9", "font-size": 11, "font-family": "Chakra Petch, sans-serif" }); s.textContent = t("M{n} en Betaflight", { n: ({ RR: 1, FR: 2, RL: 3, FL: 4 })[c.k.slice(1)] }); }
    }
    // el diagrama del manual (punteado)
    if (BK.diag) for (const [a, b] of BA.manual(comps)) { const A = pos.get(a), Bp = pos.get(b); if (A && Bp) el("path", { d: curva(A, Bp), stroke: colorCable(A, Bp), "stroke-width": 2, "stroke-dasharray": "6 6", fill: "none", opacity: 0.55 }); }
    // cables soldados
    B.cables.forEach(([a, b], i) => {
      const A = pos.get(a), Bp = pos.get(b);
      if (!A || !Bp) return;
      const malo = BK.multi && rev.malos.has(i);
      if (malo) el("path", { d: curva(A, Bp), stroke: "#ff5040", "stroke-width": 11, fill: "none", opacity: 0.45 });
      const path = el("path", { d: curva(A, Bp), stroke: colorCable(A, Bp), class: "cable" });
      el("title", {}, path).textContent = t("Toca para desoldar");
      path.onclick = () => { B.cables.splice(i, 1); sfx("click"); guardar(); dibujarCables(); };
    });
    // pines
    for (const [id, q] of pos) {
      const g = el("g", { class: "pin" });
      el("circle", { cx: q.x, cy: q.y, r: 7.5, fill: COLOR_PIN[q.p.tipo] || "#ccc", stroke: BK.sel === id ? "#fff" : "#000", "stroke-width": BK.sel === id ? 3.5 : 1.5 }, g);
      const tx = q.lado === "l" ? q.x + 12 : q.lado === "r" ? q.x - 12 : q.x;
      const ty = q.lado === "t" ? q.y + 20 : q.lado === "b" ? q.y - 12 : q.y + 4;
      const lbl = el("text", { x: tx, y: ty, fill: "#cfe0d8", "font-size": 11.5, "text-anchor": q.lado === "l" ? "start" : q.lado === "r" ? "end" : "middle", "font-family": "Chakra Petch, sans-serif" }, g);
      lbl.textContent = q.p.nombre;
      el("title", {}, g).textContent = `${q.c.nombre}: ${q.p.nombre}`;
      g.onclick = () => tocarPin(id);
    }
    // mensajes
    const msg = [];
    if (BK.sel) msg.push(t("Elegiste <b>{pieza} · {pin}</b>: ahora toca el otro pin.", { pieza: esc(pos.get(BK.sel).c.nombre), pin: esc(pos.get(BK.sel).p.nombre) }));
    if (BK.multi) {
      msg.push(...rev.danos.map((x) => `<span class="bad">⚡ ${vaAQuemar(x.msg)}</span>`));
      msg.push(...rev.fallas.map((x) => `<span class="warn">✗ ${x.msg}</span>`));
      if (!rev.danos.length && !rev.fallas.length) msg.push(`<span class='ok'>${t("Multímetro: ningún corto ni cable malo.")}</span>`);
    }
    msg.push(rev.faltan.length ? t("Falta: {lista}", { lista: rev.faltan.slice(0, 3).map((x) => x.msg).join(" · ") }) + (rev.faltan.length > 3 ? " · " + t("y {n} más", { n: rev.faltan.length - 3 }) : "") : `<span class='ok'>${t("Todo lo necesario está conectado.")}</span>`);
    msg.push(`<span class="muted">${t("Colores: rojo batería · naranja 5V · amarillo 3V3 · gris GND · azul TX/RX · morado I2C · verde LED · turquesa motores.")}</span>`);
    $("cab-msg").innerHTML = msg.join("<br>");
  }

  function tocarPin(id) {
    const B = D().banco;
    if (!BK.sel) { BK.sel = id; sfx("click"); dibujarCables(); return; }
    if (BK.sel === id) { BK.sel = null; dibujarCables(); return; }
    const par = [BK.sel, id];
    BK.sel = null;
    if (par[0].split(".")[0] === par[1].split(".")[0] && !["xt60", "fc"].includes(par[0].split(".")[0])) { toast(t("Esos dos pines son de la misma pieza.")); dibujarCables(); return; }
    if (!B.cables.some(([a, b]) => (a === par[0] && b === par[1]) || (a === par[1] && b === par[0]))) B.cables.push(par);
    sfx("click");
    guardar();
    dibujarCables();
  }

  // ---------------- prueba de humo ----------------
  function pHumo(der, d, e) {
    const tiene = PT.tieneHerramienta(P(), "humo"), ok = e.pasos.find((x) => x.k === "humo").ok;
    h(der, `<h3>${t("Prueba de humo")}</h3><p>${t("El momento de la verdad: conectar la batería por primera vez. Si hay un corto o un voltaje equivocado, algo se quema (y hay que comprarlo otra vez).")}</p>` +
      (tiene ? `<p class="ok">${t("Tienes el probador de humo: si hay un corto, corta la corriente y no se quema nada.")}</p>` : `<p style="font-size:13px">${t("Un <b>probador de humo</b> ($10, herramientas) corta la corriente si hay un corto: nada se quema.")}</p>`) +
      (ok ? `<p class="ok">${t("✓ Pasó: la controladora prende y el ESC hizo sus 3 pitidos.")}</p>` : ""));
    boton(der, t("Conectar la batería"), "main", () => humo(), !e.pasos.find((x) => x.k === "armar").ok || ok);
    if (ok) boton(der, t("Siguiente: programar →"), "ghost", () => { BK.paso = "firmware"; BK.tab = "flash"; render(); });
  }

  function humo() {
    const d = D(), p = P();
    ocupado(async () => {
      const e = ctx.estadoDe(d), rev = e.rev;
      if (rev.danos.length) {
        if (PT.tieneHerramienta(p, "humo")) {
          sfx("error");
          ctx.garaje.particulas(ctx.garaje.dondeEsta("bateria"), { n: 14, color: 0xff5040, vel: 0.3, sube: -1, vida: 0.4 });
          toast(`<b>${t("El probador de humo se prendió en rojo y cortó.")}</b> ${esc(ibaAQuemar(rev.danos[0].msg))}`, 7000);
          return;
        }
        for (const x of rev.danos) {
          const uid = x.k === "xt60" ? d.slots.bateria : x.uid;
          PT.quemar(p, uid, x.queda);
          await ctx.garaje.quemar(SLOT3D[x.k] || "controladora");
        }
        guardar();
        toast(`<b>${t("¡Humo!")}</b> ${rev.danos.map((x) => esc(x.msg)).join(" ")} ${t("Repáralo en el hangar (o compra otra) y revisa los cables.")}`, 9000);
        return;
      }
      await ctx.garaje.encender(true);
      if (!rev.ok) { toast(t("Prendió sin humo, pero: {msg}", { msg: esc((rev.fallas[0] || rev.faltan[0]).msg) }), 6000); return; }
      d.banco.humo = e.sig;
      guardar();
      toast(t("¡Sin humo! La controladora prende y el ESC pita: ya puedes programarlo."), 4000);
    });
  }

  // ---------------- programar: flashear, configurar, radio, motores, IA ----------------
  function pProgramar(der, d, e) {
    if (BK.paso === "config" && !["config", "radio"].includes(BK.tab)) BK.tab = "config";
    if (BK.paso === "motores") BK.tab = "motores";
    const fcU = U(d.slots.controladora), fcP = fcU && PT.buscarPieza(cat, fcU.id);
    h(der, `<h3>${t("Programar")}</h3><p style="margin-top:0">${t("El portátil está conectado por USB a la <b>{fc}</b> (chip {chip}).", { fc: fcP ? fcP.nombre : t("controladora"), chip: (BA.CHIP[fcU?.id] || "?").toUpperCase() })}</p><div class="tabs" id="bk-tabs"></div>`);
    const tabs = der.querySelector("#bk-tabs");
    for (const [k, n] of [["flash", t("Firmware")], ["config", t("Configurar")], ["radio", t("Radio")], ["motores", t("Motores")], ["ia", t("IA")]]) {
      const b = document.createElement("button");
      b.textContent = n; b.setAttribute("aria-pressed", String(k === BK.tab));
      b.onclick = () => { BK.tab = k; BK.paso = k === "motores" ? "motores" : k === "config" || k === "radio" ? "config" : "firmware"; render(); };
      tabs.appendChild(b);
    }
    if (!fcU || d.banco.instalado.controladora !== d.slots.controladora) { h(der, `<p class="warn">${t("Primero instala la controladora (paso Armar).")}</p>`); return; }
    ({ flash: tFlash, config: tConfig, radio: tRadio, motores: tMotores, ia: tIA })[BK.tab](der, d, e, fcU, fcP);
  }

  function tFlash(der, d, e, fcU) {
    const sel = BK.fw || fcU.fw?.id || "";
    h(der, `<p>${t("Elige el firmware <b>del chip de tu placa</b> (si eliges el de otro chip, se flashea pero la placa no arranca).")}</p>` +
      `<select id="bk-fw" style="width:100%;background:var(--moss-solid);color:var(--text);border:1px solid var(--line);border-radius:8px;padding:7px;font:inherit">` +
      `<option value="">${t("— elige —")}</option>${BA.FIRMWARES.map((f) => `<option value="${f.id}" ${f.id === sel ? "selected" : ""}>${t(f.nombre)}</option>`).join("")}</select>` +
      `<div class="barra"><i id="bk-bar"></i></div><div class="log" id="bk-log">${fcU.fw ? t("Firmware actual: {fw}", { fw: t(BA.FIRMWARES.find((f) => f.id === fcU.fw.id)?.nombre || "?") }) + "\n" + (fcU.fw.ok ? t("La placa arranca bien.") : t("¡La placa no arranca! (no es de su chip)")) : t("La placa está vacía (sin firmware).")}</div>`);
    der.querySelector("#bk-fw").onchange = (ev) => { BK.fw = ev.target.value; };
    boton(der, t("Flashear"), "main", () => flashear(d, fcU));
    if (e.pasos.find((x) => x.k === "firmware").ok) boton(der, t("Siguiente: configurar →"), "ghost", () => { BK.tab = "config"; BK.paso = "config"; render(); });
  }

  async function correrLog(lineas, dur, onPct) {
    const log = $("bk-log"), bar = $("bk-bar");
    let txt = "";
    for (let i = 0; i < lineas.length; i++) {
      const pct = (i + 1) / lineas.length;
      txt += lineas[i] + "\n";
      if (log) { log.textContent = txt; log.scrollTop = 1e9; }
      if (bar) bar.style.width = `${pct * 100}%`;
      ctx.garaje.pantalla(txt, pct);
      onPct?.(pct);
      await new Promise((r) => setTimeout(r, (dur * 1000) / lineas.length));
    }
  }

  function flashear(d, fcU) {
    const f = BA.FIRMWARES.find((x) => x.id === (BK.fw || fcU.fw?.id));
    if (!f) { toast(t("Elige un firmware.")); return; }
    const chip = BA.CHIP[fcU.id], esp = chip === "esp32";
    ocupado(async () => {
      const fwNom = t(f.nombre);
      const L = [esp ? t("esptool.py v4.7 · Conectando a /dev/cu.usbserial…") : t("Reiniciando en modo DFU (botón BOOT)…"), esp ? t("Chip: ESP32-D0WD (revisión 3)") : t("Dispositivo DFU: STM32 {chip} encontrado", { chip: chip.toUpperCase() }),
        t("Descargando {fw} ({kb} KB)…", { fw: fwNom, kb: f.kb }), t("Borrando la memoria flash…")];
      for (let k = 1; k <= 8; k++) L.push(t("Escribiendo en 0x{dir}… ({pct} %)", { dir: (esp ? 0x10000 : 0x08000000) + Math.round((k / 8) * f.kb * 1024).toString(16).padStart(6, "0"), pct: Math.round((k / 8) * 100) }));
      L.push(t("Verificando…"));
      await correrLog(L, Math.min(9, 2 + f.kb / 220));
      const ok = f.chip === chip;
      fcU.fw = { id: f.id, ok };
      fcU.cal = false; fcU.puertos = {}; fcU.remap = null; fcU.motoresProbados = null; fcU.bind = false;     // firmware nuevo: configuración de fábrica
      guardar();
      if (ok) { await correrLog([...L, t("✓ Listo. {fw} arrancó.", { fw: fwNom }), t("Configuración de fábrica: hay que calibrar y configurar.")], 0.6); sfx("listo"); toast(t("Firmware flasheado. Ahora configúralo."), 3000); }
      else { await correrLog([...L, t("Reiniciando…"), t("… (no responde)"), t("✗ La placa no arranca: ese firmware es para {fwchip} y tu chip es {chip}.", { fwchip: f.chip.toUpperCase(), chip: chip.toUpperCase() })], 0.8); sfx("error"); toast(t("La placa no arranca: flashea el firmware de TU chip."), 4500); }
    });
  }

  function tConfig(der, d, e, fcU) {
    if (!e.pasos.find((x) => x.k === "firmware").ok) { h(der, `<p class="warn">${t("Primero flashea un firmware que arranque.")}</p>`); return; }
    const esp = BA.CHIP[fcU.id] === "esp32", uarts = esp ? ["UART2"] : ["UART1", "UART2"];
    h(der, `<p><b>${t("Acelerómetro:")}</b> ${fcU.cal ? `<span class='ok'>${t("calibrado ✓")}</span>` : t("sin calibrar (el dron cree que está inclinado y se iría de lado)")}.</p>`);
    boton(der, fcU.cal ? t("Calibrar otra vez") : t("Calibrar (con el dron nivelado)"), fcU.cal ? "ghost small" : "main", () => ocupado(async () => {
      await correrLog([t("Pon el dron sobre una superficie plana…"), t("Midiendo la gravedad (2 s)…"), t("Ángulos: roll 0.0° · pitch 0.0°"), t("✓ Acelerómetro calibrado")], 2.2);
      fcU.cal = true; guardar(); sfx("listo");
    }));
    h(der, `<p style="margin-top:14px">${t("<b>Puertos:</b> dile a la controladora qué soldaste en cada UART (TX/RX).")}</p>`);
    for (const u of uarts) {
      const actual = Object.entries(fcU.puertos || {}).find(([, v]) => v === u)?.[0] || "";
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML = `<span>${u} <span class="muted" style="font-size:12.5px">(${esp ? "GPIO17/16" : u === "UART1" ? "TX1/RX1" : "TX2/RX2"})</span></span><select style="background:var(--moss-solid);color:var(--text);border:1px solid var(--line);border-radius:8px;padding:4px 6px;font:inherit;font-size:13.5px">` +
        `<option value="">${t("nada")}</option><option value="rx" ${actual === "rx" ? "selected" : ""}>${t("Receptor (Serial RX)")}</option>${esp ? "" : `<option value="gps" ${actual === "gps" ? "selected" : ""}>GPS</option>`}</select>`;
      row.querySelector("select").onchange = (ev) => {
        const pu = { ...(fcU.puertos || {}) };
        for (const k of Object.keys(pu)) if (pu[k] === u) delete pu[k];
        if (ev.target.value) pu[ev.target.value] = u;
        fcU.puertos = pu; guardar(); render();
      };
      der.appendChild(row);
    }
    const cfg = e.pasos.find((x) => x.k === "config");
    h(der, `<p style="font-size:13px">${cfg.ok ? `<span class='ok'>${t("✓ Configurado.")}</span>` : esc(cfg.nota)}</p>`);
    nuevaFila(der);
    boton(der, t("Siguiente: radio →"), "ghost", () => { BK.tab = "radio"; render(); });
  }

  function tRadio(der, d, e, fcU) {
    const b = PT.build(P(), d), rxU = U(d.slots.radio), elrs = b.radio === "rx_elrs24" || b.radio === "rx_elrs900", esp = BA.CHIP[fcU.id] === "esp32";
    const humo = e.pasos.find((x) => x.k === "humo").ok, fw = e.pasos.find((x) => x.k === "firmware").ok;
    if (!fw) { h(der, `<p class="warn">${t("Primero flashea el firmware.")}</p>`); return; }
    if (!elrs && !esp) { h(der, `<p class="bad">${t("La radio ESP-NOW es del ESP32: tu controladora STM32 no la tiene. Ponle un receptor ExpressLRS (hangar → Radio).")}</p>`); return; }
    const linked = elrs ? rxU?.bind : fcU.bind;
    h(der, `<p>${elrs ? t("Receptor ExpressLRS: se empareja con tu control con la misma <b>frase de enlace</b> (bind phrase).") : t("ESP-NOW: el ESP32 se empareja directo con tu control por su dirección MAC.")} ${linked ? `<span class='ok'>${t("Emparejado ✓")}</span>` : ""}</p>` +
      (elrs ? `<div class="row"><label for="bk-bind">${t("Frase de enlace")}</label><input id="bk-bind" value="${esc(P().empresa || "garaje films").toLowerCase().replace(/\s+/g, "")}" class="prop-in" style="border-color:var(--line);width:auto;margin:0"></div>` : "") +
      `<div id="bk-canales"></div>`);
    boton(der, t("Emparejar"), "main", () => ocupado(async () => {
      if (!humo) { toast(t("Primero pasa la prueba de humo (la radio necesita corriente).")); return; }
      const rev = e.rev;
      if (elrs) {
        await correrLog([t("Encendiendo el receptor (3 veces = modo bind)…"), t("LED: parpadeo doble…"), t("Buscando el control…")], 1.8);
        if (!rev.uarts.rx) { await correrLog([t("✗ El receptor no le habla a la controladora: revisa que su TX vaya al RX de un UART y su RX al TX del mismo.")], 0.3); sfx("error"); return; }
        if (fcU.puertos?.rx !== rev.uarts.rx) { await correrLog([fcU.puertos?.rx ? t("✗ Emparejó con el control, pero la controladora no ve nada: el receptor está en {uart} y \"Serial RX\" está en {puerto} (pestaña Configurar).", { uart: rev.uarts.rx, puerto: fcU.puertos.rx }) : t("✗ Emparejó con el control, pero la controladora no ve nada: el receptor está en {uart} y \"Serial RX\" está apagado (pestaña Configurar).", { uart: rev.uarts.rx })], 0.3); sfx("error"); rxU.bind = true; guardar(); return; }
        rxU.bind = true;
      } else {
        await correrLog([t("ESP-NOW: buscando tu control…"), t("MAC del control: 24:6F:28:A1:3C:9E"), t("✓ Emparejado")], 1.5);
        fcU.bind = true;
      }
      guardar(); sfx("listo");
    }));
    if (linked && humo && (!elrs || fcU.puertos?.rx === e.rev.uarts.rx)) {
      const box = der.querySelector("#bk-canales");
      box.innerHTML = ["Roll", "Pitch", t("Gas"), "Yaw", idioma() === "es" ? "Armar" : "Arm"].map((n) => `<div class="canal"><span>${n}</span><span class="barra" style="margin:0"><i></i></span><output>1500</output></div>`).join("") + `<p style='font-size:13px'>${t("Mueve las palancas: las barras se mueven. ✓ La radio funciona.")}</p>`;
      let tt = 0;
      const anim = setInterval(() => {
        if (!box.isConnected) { clearInterval(anim); return; }
        tt += 0.1;
        box.querySelectorAll(".canal").forEach((c, i) => { const v = i === 4 ? 1000 : Math.round(1500 + Math.sin(tt * (1 + i * 0.4) + i) * (i === 2 ? 450 : 300)); c.querySelector("i").style.width = `${(v - 1000) / 10}%`; c.querySelector("output").textContent = v; });
      }, 100);
    }
    nuevaFila(der);
    boton(der, t("Siguiente: motores →"), "ghost", () => { BK.tab = "motores"; BK.paso = "motores"; render(); });
  }

  function tMotores(der, d, e, fcU) {
    const B = d.banco, escU = U(d.slots.esc), humo = e.pasos.find((x) => x.k === "humo").ok, fw = e.pasos.find((x) => x.k === "firmware").ok;
    if (!fw || !humo) { h(der, `<p class="warn">${t("Necesitas el firmware y haber pasado la prueba de humo (los motores necesitan la batería).")}</p>`); return; }
    const conHelices = B.helices && B.instalado.helices;
    if (conHelices) {
      h(der, `<p class="bad">${t("¡Tiene las hélices puestas! Nunca pruebes motores con hélices en la mesa.")}</p>`);
      boton(der, t("Quitar las hélices"), "main", () => { B.helices = false; B.instalado.helices = null; refrescar(); });
      return;
    }
    const pm = BA.pruebaMotores(e.rev, fcU, escU, d.slots.motores);
    const firmaMot = `${JSON.stringify(fcU.remap || null)}|${JSON.stringify(escU?.inv || {})}`;
    if (BK.firmaMot !== firmaMot) { BK.girados = []; BK.firmaMot = firmaMot; }      // cambió el orden o el sentido: hay que volver a mirar
    h(der, `<p>${t("Betaflight espera cada motor en su lugar y girando para su lado (hélices hacia adentro), como en el dibujo. El dron está <b>visto desde atrás, como lo ves al pilotear</b> (la flecha naranja del plato es el frente). Dale <b>Girar</b> a cada uno y mira cuál gira y para dónde: <span class=\"ok\">verde ↻ horario</span>, <span class=\"warn\">amarilla ↺ antihorario</span>.")}</p>`);
    der.insertAdjacentHTML("beforeend", diagramaMotores(pm));
    pm.forEach((r, i) => {
      const box = document.createElement("div");
      box.className = "mot";
      const visto = BK.vistos[i], g = BK.girados[i];
      const res = !g ? `<span class="muted">${t("sin probar")}</span>`
        : !g.pos ? `<span class="bad">${t("no giró nada")}</span>`
        : `${t("giró <b>{pos}</b> {giro}", { pos: posn(g.pos), giro: giro(g.gira) })} ${g.pos !== r.espera ? `<span class="bad">${t("✗ lugar equivocado")}</span>` : g.gira !== r.sentido ? `<span class="bad">${t("✗ al revés")}</span>` : `<span class="ok">✓</span>`}`;
      box.innerHTML = `<b>${r.m}</b><span>${t("debe ir <b>{pos}</b> y girar <b>{giro}</b>", { pos: posn(r.espera), giro: giro(r.sentido) })}<br>${res}</span><span style="display:flex;gap:4px"><button class="btn ghost small">${t("Girar")}</button><button class="btn ghost small">${t("Invertir")}</button></span><div class="pos"><span class="muted" style="font-size:12.5px;align-self:center">${t("¿Cuál giró?")}</span></div>`;
      const [girar, inv] = box.querySelectorAll("span > button");
      girar.disabled = inv.disabled = BK.ocupado;
      girar.onclick = () => ocupado(async () => {
        BK.girados[i] = { pos: r.pos, gira: r.gira };
        if (!r.pos) { sfx("error"); toast(t("{m}: no gira nada (no hay motor soldado en {pad}).", { m: r.m, pad: r.pad.toUpperCase() })); return; }
        BK.vistos[i] = r.pos;
        BK.girando = r.pos; render();
        await ctx.garaje.girarMotor(r.pos, r.gira, 1.6);
        BK.girando = null;
      });
      inv.onclick = () => {
        escU.inv = { ...(escU.inv || {}) }; escU.inv[r.pad] = !escU.inv[r.pad];
        BK.girados[i] = null; BK.firmaMot = `${JSON.stringify(fcU.remap || null)}|${JSON.stringify(escU.inv)}`;   // solo este hay que volver a mirarlo
        guardar(); sfx("click"); toast(t("{m}: sentido invertido en el ESC (BLHeli). Gíralo otra vez para ver.", { m: r.m })); render();
      };
      const posBox = box.querySelector(".pos");
      for (const k of ["FL", "FR", "RL", "RR"]) {
        const b = document.createElement("button");
        b.className = "btn small " + (visto === k ? "main" : "ghost"); b.textContent = posn(k);
        b.onclick = () => { BK.vistos[i] = k; render(); };
        posBox.appendChild(b);
      }
      der.appendChild(box);
    });
    const completos = BK.vistos.filter(Boolean).length === 4, distintos = new Set(BK.vistos.filter(Boolean)).size === 4;
    const ordenBien = BK.vistos.every((v, i) => !v || v === pm[i].espera);
    boton(der, t("Reordenar motores (con lo que viste)"), "ghost", () => {
      const remap = fcU.remap || ["m1", "m2", "m3", "m4"], padDe = {};
      BK.vistos.forEach((pos, i) => (padDe[pos] = remap[i]));
      fcU.remap = BA.ESPERA.map((pos) => padDe[pos]);
      BK.vistos = [];
      guardar(); sfx("listo");
      toast(t("Orden guardado: ahora cada M debería girar en su lugar. Pruébalos otra vez."), 4000);
      render();
    }, !(completos && distintos) || ordenBien || BK.ocupado);
    if (fcU.remap && fcU.remap.join() !== "m1,m2,m3,m4")
      boton(der, t("Volver al orden de fábrica"), "ghost", () => { fcU.remap = null; BK.vistos = []; guardar(); sfx("click"); toast(t("Orden de fábrica: M1-M4 = las salidas M1-M4 del ESC. Pruébalos otra vez.")); render(); }, BK.ocupado);
    boton(der, t("Quedaron bien"), "main", () => {
      const sinProbar = pm.filter((r, i) => !BK.girados[i]).map((r) => r.m);
      if (sinProbar.length) { sfx("error"); toast(t("Primero gira {lista} y mira que cada uno quede bien.", { lista: sinProbar.join(", ") }), 4000); return; }
      const malos = pm.filter((r) => !r.ok).map((r) => `${r.m} ${r.pos !== r.espera ? t("giró {pos} (debía {espera})", { pos: posn(r.pos) || t("nada"), espera: posn(r.espera) }) : t("gira al revés (Invertir)")}`);
      if (malos.length) { sfx("error"); toast(t("Todavía no: {lista}.", { lista: malos.join(" · ") }), 6000); return; }
      fcU.motoresProbados = `${d.slots.esc}|${d.slots.motores}|${e.sig}`;
      guardar(); sfx("listo");
      BK.paso = "helices"; render();
    }, BK.ocupado);
    if (!(completos && distintos)) h(der, `<p style="font-size:12.5px">${t("Si un M gira en otro lugar: gira los 4, marca cuál giró en cada uno (salen marcados solos) y dale <b>Reordenar</b>. Si gira en su lugar pero al revés: <b>Invertir</b>.")}</p>`);
  }

  /** El dibujo de Betaflight visto desde arriba (la nariz arriba): dónde va cada M y para dónde gira. */
  function diagramaMotores(pm) {
    const XY = { FL: [62, 52], FR: [178, 52], RL: [62, 148], RR: [178, 148] };
    const arco = (x, y, cw, color, clase = "") => {
      // arco de 270° con la punta al final; cw = horario en pantalla
      const r = 22, a0 = -Math.PI / 2, a1 = a0 + (cw ? 1 : -1) * Math.PI * 1.5;
      const p0 = [x + r * Math.cos(a0), y + r * Math.sin(a0)], p1 = [x + r * Math.cos(a1), y + r * Math.sin(a1)];
      const tg = [(cw ? -1 : 1) * Math.sin(a1), (cw ? 1 : -1) * Math.cos(a1)];      // la tangente al final
      const n = [-tg[1], tg[0]], q = [p1[0] + tg[0] * 8, p1[1] + tg[1] * 8];
      return `<g class="${clase}" style="transform-origin:${x}px ${y}px"><path d="M${p0[0].toFixed(1)} ${p0[1].toFixed(1)} A${r} ${r} 0 1 ${cw ? 1 : 0} ${p1[0].toFixed(1)} ${p1[1].toFixed(1)}" fill="none" stroke="${color}" stroke-width="3"/>` +
        `<path d="M${q[0].toFixed(1)} ${q[1].toFixed(1)} L${(p1[0] + n[0] * 5).toFixed(1)} ${(p1[1] + n[1] * 5).toFixed(1)} L${(p1[0] - n[0] * 5).toFixed(1)} ${(p1[1] - n[1] * 5).toFixed(1)}Z" fill="${color}"/></g>`;
    };
    let s = `<svg viewBox="0 0 240 200" class="diag-mot" role="img" aria-label="${t("Orden de los motores visto desde arriba")}">`;
    s += `<path d="M62 52 L178 148 M178 52 L62 148" stroke="#5a6470" stroke-width="7" stroke-linecap="round"/><rect x="100" y="80" width="40" height="40" rx="6" fill="#2a3036" stroke="#5a6470"/>`;
    s += `<path d="M120 6 L130 22 L110 22Z" fill="#ff7a1a"/><text x="120" y="34" text-anchor="middle" font-size="10" fill="#ff7a1a">${t("FRENTE")}</text>`;
    pm.forEach((r) => {
      const [x, y] = XY[r.espera];
      s += `<circle cx="${x}" cy="${y}" r="30" fill="${BK.girando === r.espera ? "rgba(71,240,138,.12)" : "none"}" stroke="#3a424a" stroke-dasharray="3 3"/>`;
      s += arco(x, y, r.sentido === "cw", "#8b96a3");
      s += `<text x="${x}" y="${y + 5}" text-anchor="middle" font-size="15" font-weight="700" fill="#e8e8e8">${r.m}</text>`;
    });
    if (BK.girando) {
      const r = pm.find((q) => q.pos === BK.girando), [x, y] = XY[BK.girando];
      if (r) s += arco(x, y, r.gira === "cw", r.gira === "cw" ? "#47f08a" : "#ffd23f", r.gira === "cw" ? "gira-cw" : "gira-ccw");
    }
    s += `<text x="120" y="194" text-anchor="middle" font-size="10" fill="#8b96a3">${t("visto desde arriba · gris = lo que espera Betaflight")}</text></svg>`;
    return s;
  }

  function tIA(der, d, e, fcU) {
    const m = d.modelo && ctx.infoModelo(d.modelo), B = d.banco, f = BA.FIRMWARES.find((x) => x.id === fcU.fw?.id);
    if (!d.modelo) {
      h(der, `<p>${t("\"{dron}\" todavía no tiene IA. En el Laboratorio le creas la suya (con su nombre): empieza desde la IA base, desde la de otro dron o desde cero, y la entrenas para lo que hace este dron.", { dron: esc(d.nombre) })}</p>`);
      boton(der, ctx.esDev?.() ? t("Ir al Estudio PBDMM") : t("Ir al laboratorio"), "ai", () => { ctx.irTaller(); ctx.abrirLab(); });
      return;
    }
    const kb = 180;
    h(der, `<p>${t("Su IA: <b>\"{modelo}\"</b>", { modelo: esc(d.modelo) })} · ${m?.tiene_modelo ? t("generación {gen} · tomas: {tomas}", { gen: m.gen ?? 0, tomas: (m.tomas || []).join(", ") || t("ninguna todavía") }) : t("todavía sin entrenar")}.</p>` +
      `<p>${f?.ia ? t("Con el firmware <b>Dron Maker AI</b>, la red corre a bordo en el coprocesador K210.") : t("Modo laboratorio: la red corre en tu computador y le manda las palancas al dron por la radio (con la STM32H743 + K210 corre a bordo).")}</p>` +
      `<p>${B.ia?.modelo === d.modelo ? `<span class="ok">${B.ia.gen !== undefined ? t("✓ Cargada (generación {gen}).", { gen: B.ia.gen }) : t("✓ Cargada.")}</span>${m?.gen && B.ia.gen !== undefined && m.gen > B.ia.gen ? ` <span class="warn">${t("Hay una más nueva: la {gen}.", { gen: m.gen })}</span>` : ""}` : t("No está cargada en el dron.")}</p>` +
      `<div class="barra"><i id="bk-bar"></i></div><div class="log" id="bk-log" style="height:90px"></div>`);
    boton(der, B.ia?.modelo === d.modelo ? t("Cargar la última versión") : t("Descargar la IA al dron"), "ai", () => ocupado(async () => {
      if (!e.pasos.find((x) => x.k === "firmware").ok) { toast(t("Primero flashea el firmware.")); return; }
      if (!m?.tiene_modelo) { toast(t("Esa IA todavía no tiene un modelo guardado: entrénala un rato.")); return; }
      await correrLog([t("Leyendo {ruta}…", { ruta: `models/${d.modelo === "base" ? "" : "drones/" + d.modelo + "/"}modelo_web.json` }), t("Red: 38 entradas → 128 → 128 → 4 · {kb} KB", { kb }), ...[1, 2, 3, 4, 5].map((k) => t("Enviando pesos… {pct} %", { pct: k * 20 })), t("Probando la red con el dron quieto: ok"), t("✓ IA \"{modelo}\" (generación {gen}) cargada.", { modelo: d.modelo, gen: m.gen })], 3);
      B.ia = { modelo: d.modelo, gen: m.gen };
      guardar(); sfx("listo");
    }));
    boton(der, ctx.esDev?.() ? t("Entrenarla en el Estudio") : t("Entrenarla en el laboratorio"), "ghost", () => { ctx.irTaller(); ctx.abrirLab(); });
  }

  // ---------------- hélices y prueba atada ----------------
  function pHelices(der, d, e) {
    const B = d.banco, ok = e.pasos.find((x) => x.k === "helices").ok, mot = e.pasos.find((x) => x.k === "motores").ok;
    h(der, `<h3>${t("Hélices")}</h3><p>${t("Siempre de último: con los motores ya probados. Las de adelante van del color de los detalles para saber hacia dónde mira el dron.")}</p>` +
      (ok ? `<p class="ok">${t("✓ Puestas.")}</p>` : mot ? "" : `<p class="warn">${t("Antes prueba los motores (Programar → Motores).")}</p>`));
    boton(der, t("Poner las hélices"), "main", () => ocupado(async () => {
      B.helices = true; B.instalado.helices = d.slots.helices; guardar(); ctx.verDron();
      await ctx.garaje.instalar("helices");
      BK.paso = "prueba";
    }), ok || !mot || !d.slots.helices);
    if (ok) boton(der, t("Quitarlas"), "ghost small", () => { B.helices = false; B.instalado.helices = null; refrescar(); });
  }

  function pPrueba(der, d, e) {
    const ok = e.pasos.find((x) => x.k === "prueba").ok, antes = e.pasos.filter((x) => x.k !== "prueba" && x.k !== "imprimir").every((x) => x.ok);
    h(der, `<h3>${t("Prueba atada")}</h3><p>${t("Lo enciendes amarrado a la mesa y le das un poco de gas: si los motores están en su lugar y giran bien, sube un poco y se queda. Si algo está mal, se voltea (y se rompen las hélices).")}</p>` +
      (ok ? `<p class="ok">${t("✓ ¡Pasó! \"{dron}\" está listo para volar.", { dron: esc(d.nombre) })}</p>` : antes ? "" : `<p class="warn">${t("Faltan pasos: {lista}.", { lista: e.pasos.filter((x) => !x.ok && x.k !== "prueba").map((x) => x.nombre.toLowerCase()).join(", ") })}</p>`));
    boton(der, t("Encender (amarrado)"), "main", () => ocupado(async () => {
      const pm = BA.pruebaMotores(e.rev, U(d.slots.controladora), U(d.slots.esc), d.slots.motores), bien = pm.every((r) => r.ok);
      await ctx.garaje.pruebaAtada(bien);
      if (bien) { d.banco.prueba = e.prueba; guardar(); sfx("listo"); toast(t("¡\"{dron}\" está listo para volar!", { dron: esc(d.nombre) }), 4000); }
      else {
        const mal = pm.find((r) => !r.ok), hel = U(d.slots.helices);
        if (hel) hel.vida = Math.max(0, hel.vida - 50);
        guardar();
        toast(t("Se volteó hacia {pos}: {causa}. Revisa Programar → Motores. Las hélices quedaron al {vida} %.", { pos: posn(mal.espera), causa: mal.pos !== mal.espera ? t("ahí no está el motor que la controladora cree ({m})", { m: mal.m }) : t("ese motor gira al revés"), vida: hel?.vida ?? 0 }), 7000);
      }
    }), !antes);
    if (ok) {
      nuevaFila(der);
      boton(der, t("Volver al hangar"), "ghost", () => ctx.irTaller());
      if (!e.iaOk && d.modelo) boton(der, t("Cargar su IA"), "ai", () => { BK.paso = "firmware"; BK.tab = "ia"; render(); });
    }
  }

  // ---------------- girar el dron arrastrando / acercar ----------------
  let drag = null;
  ctx.canvas.addEventListener("pointerdown", (ev) => { if (G.screen === "banco") drag = ev.clientX; });
  addEventListener("pointerup", () => (drag = null));
  addEventListener("pointermove", (ev) => { if (drag !== null && G.screen === "banco") { ctx.garaje.yaw += (ev.clientX - drag) * 0.012; drag = ev.clientX; } });
  ctx.canvas.addEventListener("wheel", (ev) => { if (G.screen === "banco") { ctx.garaje.zoom = Math.min(1.8, Math.max(0.45, ctx.garaje.zoom * (ev.deltaY > 0 ? 1.1 : 0.9))); ev.preventDefault(); } }, { passive: false });

  return { abrir, render };
}
