// =====================================================================
// LOS DIÁLOGOS DEL JUEGO: en vez de confirm() / prompt() del navegador (que en Chrome salen como una ventana del
// sistema), una ventanita con el estilo del juego. Devuelven promesas:
//   if (!(await confirmar("¿Borrar…?", { si: "Borrar", peligro: true }))) return;
//   const n = await pedirTexto("Nombre:", "mi_modelo");     // null = canceló
// Enter acepta, Esc cancela, tocar afuera cancela.
// =====================================================================
import { t } from "./i18n.js";

let abierto = null;

function abrir({ texto, titulo = "", si, no, peligro = false, entrada = null }) {
  abierto?.cerrar(null);
  return new Promise((resolver) => {
    const fondo = document.createElement("div");
    fondo.id = "dialogo";
    fondo.innerHTML = `<section class="modal panel" role="alertdialog" aria-modal="true">
      ${titulo ? `<h2 style="font-size:22px">${titulo}</h2>` : ""}<p style="margin:6px 0 0;line-height:1.5;font-size:16px"></p>
      ${entrada !== null ? `<input type="text" spellcheck="false">` : ""}
      <div class="go" style="justify-content:flex-end"><button class="btn ghost" data-r="no"></button><button class="btn ${peligro ? "danger" : "main"}" data-r="si"></button></div></section>`;
    fondo.querySelector("p").innerHTML = texto;
    fondo.querySelector('[data-r="no"]').textContent = no || t("Cancelar");
    fondo.querySelector('[data-r="si"]').textContent = si || t("Aceptar");
    const inp = fondo.querySelector("input");
    if (inp) inp.value = entrada;
    const cerrar = (r) => {
      if (abierto?.fondo !== fondo) return;
      abierto = null;
      fondo.remove();
      document.removeEventListener("keydown", tecla, true);
      resolver(r);
    };
    const aceptar = () => cerrar(inp ? inp.value : true);
    const cancelar = () => cerrar(inp ? null : false);
    const tecla = (e) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancelar(); }
      else if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); aceptar(); }
    };
    fondo.querySelector('[data-r="si"]').onclick = aceptar;
    fondo.querySelector('[data-r="no"]').onclick = cancelar;
    fondo.onpointerdown = (e) => { if (e.target === fondo) cancelar(); };
    document.addEventListener("keydown", tecla, true);
    document.body.appendChild(fondo);
    abierto = { fondo, cerrar: () => cancelar() };
    (inp || fondo.querySelector('[data-r="si"]')).focus();
    inp?.select();
  });
}

/** ¿Sí o no? -> Promise<boolean>. opts: { si, no, titulo, peligro } */
export const confirmar = (texto, opts = {}) => abrir({ texto, ...opts });
/** Pedir un texto -> Promise<string|null> (null = canceló). */
export const pedirTexto = (texto, valor = "", opts = {}) => abrir({ texto, entrada: valor, ...opts });
