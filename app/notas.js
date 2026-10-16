// =====================================================================
// LAS NOTAS de arriba a la derecha (el tutorial: tutorial.js dice cuáles). Encima de todo (garaje, banco, mesa,
// computador). La fija se puede achicar (−) y puede traer un botón (el tour: "Siguiente →") y hacer brillar lo que hay
// que tocar (resaltar = selector); las demás se cierran con "Entendido" y no vuelven.
// =====================================================================
import { t } from "./i18n.js";
import * as TU from "./tutorial.js";

export function initNotas({ P, guardar, alAccion, alSaltar }) {
  const box = document.createElement("div");
  box.id = "notas";
  box.setAttribute("aria-live", "polite");
  document.body.appendChild(box);
  let ultimo = "", min = false;

  function resaltar(sel) {
    document.querySelectorAll(".tuto-resalta").forEach((el) => { if (!sel || !el.matches(sel)) el.classList.remove("tuto-resalta"); });
    if (sel) document.querySelectorAll(sel).forEach((el) => el.classList.add("tuto-resalta"));
  }
  function poner(lista) {
    resaltar(lista.find((n) => n.fija)?.resaltar || null);         // cada vez: lo resaltado puede haberse redibujado
    const firma = JSON.stringify(lista) + min;
    if (firma === ultimo) return;
    ultimo = firma;
    box.innerHTML = "";
    for (const n of lista.slice(0, 3)) {                 // la fija + 2 consejos como mucho: no tapar el juego
      const el = document.createElement("section");
      el.className = "nota" + (n.fija ? " fija" : "") + (n.fija && min ? " min" : "");
      el.innerHTML = `<header><b></b>${n.fija ? `<button title="${t("Achicar")}">${min ? "▢" : "−"}</button>` : ""}</header><div class="nota-txt"></div><div class="nota-pie"></div>`;
      el.querySelector("b").textContent = n.titulo;
      el.querySelector(".nota-txt").innerHTML = n.html;
      const pie = el.querySelector(".nota-pie"), boton = (txt, cls, fn) => { const b = document.createElement("button"); b.className = "btn small " + cls; b.textContent = txt; b.onclick = fn; pie.appendChild(b); };
      if (n.fija) {
        el.querySelector("header button").onclick = () => { min = !min; ultimo = ""; poner(lista); };
        if (n.saltable) boton(t("Saltar el tutorial"), "ghost", () => { TU.saltar(P()); guardar(); poner([]); alSaltar?.(); });
        if (n.boton) boton(n.boton.txt, "main", () => alAccion?.(n.boton.accion));
      } else boton(t("Entendido"), "main", () => { TU.visto(P(), n.id); guardar(); poner(lista.filter((x) => x.id !== n.id)); });
      box.appendChild(el);
    }
  }
  return { poner };
}
