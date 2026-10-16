// =====================================================================
// LA FLOTA (docs/NEGOCIO.md): los trabajos que mandaste con un dron del hangar los vuela SU IA al terminar el día.
// Cada trabajo es un vuelo de verdad sin pantalla (mision_sim.js: la misma física, batería, radio y calificación que
// un vuelo que miras), con una ruta nueva cada vez. Si entrega, el cliente paga por el chat (negocio.js entregar);
// si no (le faltaron tomas, chocó, se quedó sin batería), el pedido sigue abierto y el dron vuelve con sus daños.
//
//   ctx: { P, cat, PT, ND, estadoDe(d), iaDe(d) -> Promise<{ slug, gen, policy } | null> }
// =====================================================================
import * as NG from "./negocio.js";
import * as REQ from "./requisitos.js";
import * as ESC from "./escenarios.js";
import { MisionSim, TOMA_OK } from "./mision_sim.js";
import { t } from "./i18n.js";

/** Por qué un dron no puede salir con la flota a hacer ese pedido (null = puede). vol = NG.paraVolar(...). */
export function porQueNo(ctx, d, vol) {
  const p = ctx.P(), a = d && ctx.PT.dronArmado(p, ctx.cat, d);
  if (!a || !a.stats.ok) return t("no está armado");
  if (ctx.PT.rotas(p, d).length) return t("tiene piezas rotas");
  if (!ctx.estadoDe(d).listo) return t("falta terminarlo en el banco");
  const mis = vol.entrenar?.mision;
  if (mis && ctx.escenarios && !ESC.iaPuede(ctx.P(), ctx.escenarios, mis)) return t("su IA no tiene el simulador «{e}»", { e: ESC.deMision(ctx.escenarios, mis)?.nombre || mis });
  const duros = REQ.cumple(vol.requisitos || {}, a.stats, {}).duros;
  if (duros.length) return t("el cliente no acepta sin: {lista}", { lista: duros.map((x) => x[1].split(":")[0].toLowerCase()).join(", ") });
  return null;
}

/** Por qué no se entregó (en palabras), a partir del resultado del vuelo. */
export function motivo(r, dmg = []) {
  if (r.soldadura) return t("se soltó una soldadura fría ({donde})", { donde: r.soldadura });
  if (r.crash) return dmg.length ? t("se estrelló y se dañaron {n} piezas", { n: dmg.length }) : t("se estrelló");
  if (r.dead) return t("se le acabó la batería");
  if (r.failsafe) return t("perdió la señal de la radio");
  const hechas = r.tomas.filter((x) => x.lista).length, flojas = r.tomas.filter((x) => x.lista && x.q < TOMA_OK).length;
  if (r.foto && r.tomas.length === 1) return hechas ? t("la foto quedó floja") : t("no llegó a tomar la foto");
  if (hechas < r.tomas.length) return r.foto ? t("tomó {n} de {m} fotos", { n: hechas, m: r.tomas.length }) : t("grabó {n} de {m} tomas", { n: hechas, m: r.tomas.length });
  if (flojas) return r.foto ? t("{n} de {m} fotos quedaron flojas", { n: flojas, m: r.tomas.length }) : t("{n} de {m} tomas quedaron flojas", { n: flojas, m: r.tomas.length });
  return t("no aterrizó en la base");
}

/**
 * Vuela todos los trabajos de la flota de hoy. aviso({ i, n, pe, dron, f }) cuenta cómo va (f de 0 a 1).
 * Devuelve una fila por trabajo: { pe, dron, ia, gen, r (resultado del vuelo o null), resp (entregar), dmg, motivo, pago }.
 */
export async function volarFlota(ctx, aviso = null, { semilla = null } = {}) {
  const p = ctx.P(), D = ctx.ND, trabajos = NG.flota(p), filas = [];
  for (const [i, pe] of trabajos.entries()) {
    const d = p.drones.find((x) => x.id === pe.flota);
    const vol = { ...NG.paraVolar(p, D, pe), variante: semilla != null ? semilla + i : 1 + Math.floor(Math.random() * 999999) };
    const fila = { pe, dron: d?.nombre || "?", ia: null, gen: null, r: null, resp: null, dmg: [], motivo: null, pago: 0 };
    filas.push(fila);
    aviso?.({ i, n: trabajos.length, pe, dron: fila.dron, f: 0 });
    const no = d ? porQueNo(ctx, d, vol) : t("ya no está en tu hangar");
    const ia = no ? null : await ctx.iaDe(d);
    if (no || !ia?.policy) {
      fila.motivo = no ? t("no salió: {por}", { por: no }) : t("no encontré su IA");
      NG.falloFlota(p, D, pe.id, fila.dron, fila.motivo);
      continue;
    }
    fila.ia = ia.slug; fila.gen = ia.gen;
    const a = ctx.PT.dronArmado(p, ctx.cat, d);
    const sim = new MisionSim({ stats: a.stats, pedido: vol, piloto: "ia", policy: ia.policy, seed: semilla != null ? semilla * 7 + i : undefined, frias: ctx.friasDe?.(d) });
    const r = (fila.r = await sim.correr((f) => aviso?.({ i, n: trabajos.length, pe, dron: fila.dron, f })));
    p.vuelos = (p.vuelos || 0) + 1;
    if (r.crash) fila.dmg = ctx.PT.chocar(p, ctx.cat, d, r.impact);
    if (r.completa && !r.crash && !r.dead) {
      fila.resp = NG.entregar(p, D, pe.id, { estrellas: r.estrellas, piloto: "ia", fotos: r.fotos.length });
      fila.pago = fila.resp?.pago || 0;
      if (!r.estrellas) fila.motivo = t("al cliente no le gustó (puntaje {n})", { n: r.puntaje });
    } else {
      fila.motivo = motivo(r, fila.dmg);
      NG.falloFlota(p, D, pe.id, fila.dron, fila.motivo);
    }
  }
  return filas;
}
