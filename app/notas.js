// =====================================================================
// LAS NOTAS del tutorial (tutorial.js dice cuáles): un BOTÓN arriba a la derecha (🎯) que se abre y se cierra.
// Cuando cambia el paso, la nota se asoma sola unos segundos y se vuelve a guardar en el botón (si la abriste tú,
// queda abierta hasta que la cierres). Lo que hay que tocar brilla siempre (resaltar = selector), abierta o no.
// Los consejos van debajo del paso, cortos, y se cierran con × (no vuelven).
// =====================================================================
import { t } from "./i18n.js";
import * as TU from "./tutorial.js";

const ASOMA_MS = 6000;

export function initNotas({ P, guardar, alSaltar }) {
  const box = document.createElement("div");
  box.id = "notas";
  box.setAttribute("aria-live", "polite");
  box.innerHTML = `<button class="notas-b" aria-expanded="false"><span>🎯</span><b>${t("¿Qué sigo?")}</b><i class="notas-punto" hidden></i></button><div class="notas-panel" hidden></div>`;
  document.body.appendChild(box);
  const btn = box.querySelector(".notas-b"), panel = box.querySelector(".notas-panel"), punto = box.querySelector(".notas-punto");
  let lista = [], ultimo = "", pasoAntes = "", fijo = false, asoma = 0;

  function resaltar(sel) {
    document.querySelectorAll(".tuto-resalta").forEach((el) => { if (!sel || !el.matches(sel)) el.classList.remove("tuto-resalta"); });
    if (sel) document.querySelectorAll(sel).forEach((el) => el.classList.add("tuto-resalta"));
  }
  function abrir(on) {
    panel.hidden = !on;
    btn.setAttribute("aria-expanded", String(on));
    if (on) punto.hidden = true;
  }
  btn.onclick = () => { clearTimeout(asoma); fijo = panel.hidden; abrir(fijo); };

  function dibujar() {
    panel.innerHTML = "";
    for (const n of lista.slice(0, 3)) {                 // el paso + 2 consejos como mucho: no tapar el juego
      const el = document.createElement("section");
      el.className = "nota" + (n.fija ? " fija" : "");
      el.innerHTML = `<div class="nota-txt"></div>`;
      el.querySelector(".nota-txt").innerHTML = n.html;
      if (n.fija && n.saltable) {
        const b = document.createElement("button"); b.className = "nota-saltar"; b.textContent = t("Saltar el tutorial");
        b.onclick = () => { TU.saltar(P()); guardar(); poner([]); alSaltar?.(); };
        el.appendChild(b);
      }
      if (!n.fija) {
        const x = document.createElement("button"); x.className = "nota-x"; x.textContent = "×"; x.setAttribute("aria-label", t("Cerrar"));
        x.onclick = () => { TU.visto(P(), n.id); guardar(); poner(lista.filter((y) => y.id !== n.id)); };
        el.prepend(x);
      }
      panel.appendChild(el);
    }
  }
  function poner(nueva) {
    lista = nueva;
    box.hidden = !lista.length;
    const fija = lista.find((n) => n.fija);
    resaltar(fija?.resaltar || null);                    // cada vez: lo resaltado puede haberse redibujado
    const firma = JSON.stringify(lista);
    if (firma === ultimo) return;
    ultimo = firma;
    dibujar();
    const paso = (fija?.html || "").replace(/\d+/g, "#");          // los números (°C, %) cambian solos: no es otro paso
    if (paso && paso !== pasoAntes) {                    // paso nuevo: se asoma y se guarda solo
      pasoAntes = paso;
      if (!fijo) { abrir(true); clearTimeout(asoma); asoma = setTimeout(() => { if (!fijo) { abrir(false); punto.hidden = false; } }, ASOMA_MS); }
    }
  }
  return { poner };
}
