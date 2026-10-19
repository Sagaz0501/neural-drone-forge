// =====================================================================
// EL NEGOCIO (docs/NEGOCIO.md): los clientes te escriben al celular, cada día llegan pedidos (fotos, videos,
// inspecciones) armados desde plantillas con una dificultad de 1 a 4, los aceptas o no, los vuelas (tú o la IA) y
// los entregas por el chat. La relación con cada cliente sube o baja y los buenos clientes te recomiendan a otros.
// Los pedidos de la campaña (misiones.json) llegan como "pedidos especiales" ⭐ del cliente que corresponde.
//
// La FLOTA: un pedido aceptado se le asigna a un dron del hangar (pe.flota = id del dron, uno por dron) y su IA lo vuela
// sola al terminar el día (flota.js, con la misma simulación de un vuelo). Si entrega, se cobra como siempre; si no,
// el pedido sigue abierto.
//
// Solo lógica (sin pantalla): la pantalla es celular.js. Todo vive en partida.negocio. Pruebas: node app/test_negocio.mjs
//   D = { clientes (data/clientes.json), trabajos (data/trabajos.json), misiones (data/misiones.json) }
// =====================================================================
import { t } from "./i18n.js";
import { twrParaViento } from "./requisitos.js";
import { anotar } from "./partida.js";

// ---------------- azar con semilla (cada día, lo mismo si recargas) ----------------
function rngDe(seed) {
  let a = seed >>> 0;
  const r = () => { a = (a + 0x6d2b79f5) >>> 0; let x = a; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  r.entre = (a0, b0) => a0 + (b0 - a0) * r();
  r.int = (a0, b0) => Math.floor(r.entre(a0, b0 + 1));
  r.uno = (xs) => xs[Math.floor(r() * xs.length)];
  return r;
}
const rellenar = (s, v) => String(s).replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m));
const tabla = (pares, x) => pares.reduce((acc, [desde, v]) => (x >= desde ? v : acc), pares[0][1]);
const redondo5 = (x) => Math.max(5, Math.round(x / 5) * 5);

// ---------------- el estado ----------------
export function nuevoNegocio(semilla = Math.floor(Math.random() * 1e9)) {
  return { v: 1, dia: 1, semilla, sig: 1, chats: {}, pedidos: [], relacion: {}, leido: {}, contactos: [], ofrecidos: [], hechos: 0, tutorial: 0, hoy: 0 };
}

export const cliente = (D, id) => D.clientes.clientes.find((c) => c.id === id) || null;
export const trabajo = (D, id) => D.trabajos.trabajos.find((x) => x.id === id) || null;
export const dificultad = (D, n) => D.trabajos.dificultades[Math.max(1, Math.min(4, n)) - 1];
export const pedido = (p, id) => p.negocio?.pedidos.find((x) => x.id === id) || null;
const nombreTipo = (tipo, n) => ({ foto: n === 1 ? t("1 foto") : t("{n} fotos", { n }), inspeccion: n === 1 ? t("1 foto") : t("{n} fotos", { n }), video: t("un video") })[tipo];

/**
 * Pone el negocio en la partida si no lo tiene. Partida nueva (los dos modos): el tutorial (Doña Marta escribe
 * pidiendo una foto). Partida vieja: el primer día con pedidos normales.
 */
export function asegurar(p, D) {
  if (p.negocio) return p.negocio;
  const N = (p.negocio = nuevoNegocio());
  const nueva = !Object.keys(p.hechos || {}).length && !p.vuelos;
  if (nueva && p.tuto?.etapa && p.tuto.etapa !== "cliente") N.espera = true;      // el tutorial: el cliente escribe cuando tu IA sepa tomar la foto
  else if (nueva) primerCliente(p, D);
  else {
    N.tutorial = 99;
    nuevoDia(p, D, { primero: true });
  }
  return N;
}

function contacto(p, cid) {
  const N = p.negocio;
  if (!N.contactos.includes(cid)) N.contactos.push(cid);
  N.chats[cid] = N.chats[cid] || [];
  N.relacion[cid] = N.relacion[cid] ?? 0;
}

/** Un mensaje en el chat de un cliente. de = "ella" (el cliente) · "yo" · "sistema". */
export function escribir(p, cid, de, txt, extra = {}) {
  contacto(p, cid);
  const m = { de, txt, dia: p.negocio.dia, ...(p.negocio.reloj ? { hora: Math.round(p.negocio.hora * 60) / 60 } : {}), ...extra };
  p.negocio.chats[cid].push(m);
  if (p.negocio.chats[cid].length > 80) p.negocio.chats[cid].splice(0, p.negocio.chats[cid].length - 80);
  return m;
}

/** Cuántos mensajes sin leer (de un cliente, o de todos). */
export function noLeidos(p, cid = null) {
  const N = p.negocio;
  if (!N) return 0;
  const ids = cid ? [cid] : N.contactos;
  return ids.reduce((a, id) => a + (N.chats[id] || []).slice(N.leido[id] || 0).filter((m) => m.de !== "yo").length, 0);
}
export function leer(p, cid) { p.negocio.leido[cid] = (p.negocio.chats[cid] || []).length; }

const vars = (D, pe) => ({ pago: pe.pago, dias: pe.plazo, n: nombreTipo(pe.tipo, pe.n), titulo: pe.titulo.toLowerCase(), lugar: pe.lugar });

// ---------------- armar un pedido ----------------
/**
 * Un pedido nuevo desde una plantilla y una dificultad. Las tomas van en grados relativos al frente del sujeto
 * (como misiones.json): lugares.js las convierte en rutas. o = { az, n, pago, plazo, tutorial } para forzar valores.
 */
export function crearPedido(p, D, cid, tid, dif, rng, o = {}) {
  const N = p.negocio, T = trabajo(D, tid), F = dificultad(D, dif), C = cliente(D, cid);
  let tomas, n = o.n ?? (T.n ? T.n[dif - 1] : 3);
  if (T.tipo === "video") {
    const base = D.misiones.pedidos.find((x) => x.id === T.tomas_de);
    tomas = base.tomas.map((tm) => ({ ...tm }));
    n = tomas.length;
  } else {
    tomas = [];
    const nombres = T.tipo === "foto" ? [t("Foto {k}", { k: 1 }), t("Foto {k}", { k: 2 }), t("Foto {k}", { k: 3 })] : [t("Punto {k}", { k: 1 }), t("Punto {k}", { k: 2 }), t("Punto {k}", { k: 3 }), t("Punto {k}", { k: 4 })];
    for (let k = 0; k < n; k++) {
      // los puntos se reparten en el abanico de la dificultad (más dificultad = más atrás del sujeto = más lejos de la base)
      const az = o.az !== undefined ? o.az : n === 1 ? rng.entre(-F.az, F.az) : -F.az + (2 * F.az * (k + rng.entre(0.15, 0.85))) / n;
      tomas.push({ tipo: "fija", nombre: nombres[k], desc: T.tipo === "foto" ? t("Llega al aro y quédate quieto: clic.") : t("Quieto encima del techo, mirándolo de cerca."),
        az: Math.round(az), d: Math.round(rng.entre(...T.d) * 10) / 10, z: Math.round(rng.entre(...T.z) * 10) / 10, dur: T.dur });
    }
  }
  const viento = Math.max(F.viento, 0);
  const req = { alcance_m: true };
  if (viento >= 2) { req.twr_min = twrParaViento(viento); req.barometro = true; }
  if (T.protectores) req.protectores = true;
  if (F.calidad_min) req.calidad_min = F.calidad_min;
  const bono = 1 + (D.trabajos.relacion.bono || 0) * (N.relacion[cid] || 0);
  const pe = {
    id: "n" + N.sig++, plantilla: tid, cliente: cid, tipo: T.tipo, dif, lugar: T.lugar, titulo: T.titulo, n,
    tomas, viento, requisitos: req, estrellas: F.estrellas.slice(),
    pago: o.pago ?? redondo5(T.pago * F.pago * bono), dia: N.dia, plazo: o.plazo ?? F.plazo, limite: N.dia + (o.plazo ?? F.plazo) - 1,
    estado: "nuevo", tutorial: !!o.tutorial,
  };
  void C;
  N.pedidos.push(pe);
  if (N.pedidos.length > 60) N.pedidos = N.pedidos.filter((x, i) => x.estado === "nuevo" || x.estado === "aceptado" || i >= N.pedidos.length - 40);
  return pe;
}

/** El pedido como lo usan el briefing y el vuelo (main.js openBrief / vuelo.js): mismo formato que misiones.json. */
export function paraVolar(p, D, pe) {
  const C = cliente(D, pe.cliente);
  return {
    entrenar: entrenarPara(D, pe),
    id: pe.id, negocio: true, tipo: pe.tipo, dif: pe.dif, cliente: `${C.avatar} ${C.nombre} (${C.quien})`, clienteId: pe.cliente,
    titulo: pe.titulo, lugar: pe.lugar, tomas: pe.tomas, pago: pe.pago, estrellas: pe.estrellas, requisitos: pe.requisitos,
    viento_ms: pe.viento_real ?? pe.viento, viento_dicho: pe.viento, fijo: pe.tutorial, historia: "",
  };
}

/**
 * Qué misión del Laboratorio le enseña a la IA este trabajo (Fase 1b): fotos e inspecciones -> E2/E4 (niveles 20/13 de
 * Python) o E5 Set de fotos (14); un video -> lo que diga su pedido de la campaña (misiones.json "entrenar").
 */
export function entrenarPara(D, pe) {
  if (pe.tipo === "foto" || pe.tipo === "inspeccion") {
    const set = pe.n > 1;
    return { nivel: set ? 14 : 13, mision: set ? "set_fotos" : "foto", viento: pe.viento || 0,
      nota: set ? t("E5 · Set de fotos con tu dron: llegar a cada punto, frenar y quedarse quieto, y pasar al siguiente. Apruébalo con el 🎓 examen en Simuladores.")
        : t("E2 · Ir a un punto (o E4 · Foto) con tu dron: llegar, frenar y quedarse quieto mirando al sujeto. Apruébalo con el 🎓 examen en Simuladores.") };
  }
  const T = trabajo(D, pe.plantilla), base = T && D.misiones.pedidos.find((x) => x.id === T.tomas_de);
  return base?.entrenar ? { ...base.entrenar, viento: pe.viento || 0 } : null;
}

// ---------------- qué te pueden pedir ----------------
/** ¿La partida tiene ese simulador? (como escenarios.js tiene(): sin p.escenarios = los dos gratis) */
const sabe = (p, id) => (p.escenarios || ["despegar", "punto"]).includes(id);
/**
 * Los clientes piden lo que tu taller ya puede hacer (pedido de Santiago, 19-10-2026): mientras solo tienes fotos, llegan
 * fotos; el video llega cuando ya puedes comprar E6 (tienes E5), la inspección del techo con E4 y los sets de fotos con E5.
 */
export function posible(p, T) {
  if (T.tipo === "video") return sabe(p, "set_fotos") || sabe(p, "video_ruta");
  if (T.tipo === "inspeccion") return sabe(p, "foto_fija");
  return true;
}

// ---------------- el día ----------------
/** Qué clientes te escriben con tu reputación (y los recomendados). */
function clientesActivos(p, D) {
  const N = p.negocio, R = D.trabajos.relacion;
  return D.clientes.clientes.filter((c) => N.contactos.includes(c.id) || p.rep >= c.rep_min || (c.recomendado_por && (N.relacion[c.recomendado_por] || 0) >= R.recomienda));
}

/** El primer mensaje: Doña Marta pide la foto de su casa (el tutorial del negocio). */
export function primerCliente(p, D) {
  const N = p.negocio;
  delete N.espera;
  const T = D.trabajos.tutorial;
  contacto(p, T.cliente);
  const pe = crearPedido(p, D, T.cliente, T.trabajo, 1, rngDe(N.semilla), { az: T.az, n: 1, pago: T.pago, plazo: T.plazo, tutorial: true });
  escribir(p, T.cliente, "ella", rellenar(cliente(D, T.cliente).msgs.hola[0], vars(D, pe)), { pedido: pe.id });
  return pe;
}

/**
 * Termina el día y empieza el siguiente: vencen los pedidos sin hacer, se cobra el arriendo si toca, llegan los
 * pedidos especiales de la campaña que ya se abrieron y los pedidos nuevos. Devuelve lo que pasó (para mostrarlo).
 */
export function nuevoDia(p, D, { primero = false } = {}) {
  const N = p.negocio, out = { vencidos: [], nuevos: [], arriendo: 0, especiales: [], llegaron: 0 };
  if (N.agenda?.length) out.nuevos.push(...llegan(p, D, Infinity));   // los de ayer que no alcanzaron a llegar: llegan ya
  if (!primero) {
    N.dia++;
    N.hoy = 0;
    if (N.reloj) N.hora = reloj(D).despierta;
    for (const pe of N.pedidos) {
      if ((pe.estado === "nuevo" || pe.estado === "aceptado") && N.dia > pe.limite) {
        pe.estado = "vencido";
        delete pe.flota;
        out.vencidos.push(pe);
        if (pe.cliente) {
          N.relacion[pe.cliente] = Math.max(0, (N.relacion[pe.cliente] || 0) - 1);
          const C = cliente(D, pe.cliente);
          escribir(p, pe.cliente, "ella", rngDe(N.semilla + N.dia).uno(C.msgs.vencido));
        }
      }
    }
    out.llegaron = (p.inventario || []).filter((u) => u.llega === N.dia).length;       // los pedidos de la tienda (taller.js)
    const A = D.trabajos.arriendo;
    if (p.modo !== "dev" && p.rep >= A.desde_rep && N.dia % A.cada === 0) {
      p.plata -= A.monto;
      anotar(p, -A.monto, t("Arriendo del garaje"));
      out.arriendo = A.monto;
      N.sistema = [...(N.sistema || []), { dia: N.dia, txt: rellenar(D.clientes.sistema.arriendo, { monto: A.monto }) }].slice(-20);
    }
  }
  if (N.espera) return out;                                   // el tutorial: todavía no te conoce nadie
  out.especiales = especiales(p, D);
  const rng = rngDe(N.semilla * 31 + N.dia * 7919);
  const cuantos = tabla(D.trabajos.pedidos_por_dia, p.rep), difMax = tabla(D.trabajos.dificultad_por_rep, p.rep);
  const activos = clientesActivos(p, D), R = reloj(D);
  // el primero del día es fácil (dificultad 1, sin viento) si algún cliente los pide: desde $0, con el dron de madera,
  // siempre hay algo que hacer (docs/ECONOMIA.md)
  const faciles = activos.filter((c) => c.dif[0] === 1);
  for (let k = 0; k < cuantos && activos.length; k++) {
    const facil = k === 0 && faciles.length > 0;
    const C = rng.uno(facil ? faciles : activos);
    const dmin = C.dif[0], dmax = Math.max(dmin, Math.min(C.dif[1], difMax));
    const dif = facil ? 1 : rng() < 0.55 ? dmin + Math.floor(rng() * 0.6 * (dmax - dmin + 1)) : rng.int(dmin, dmax);   // más fáciles que difíciles
    const posibles = C.trabajos.filter((id) => { const T = trabajo(D, id); return T && dif >= T.dif[0] && dif <= T.dif[1] && posible(p, T); });
    if (!posibles.length) continue;
    const tid = rng.uno(posibles);
    // con el reloj: cada pedido llega a su hora (la agenda del día); sin él (las pruebas, el día del tutorial), ya
    if (N.reloj) N.agenda = [...(N.agenda || []), { h: R.llegan[0] + rng() * (R.llegan[1] - R.llegan[0]), cid: C.id, tid, dif, k }];
    else out.nuevos.push(llega(p, D, { cid: C.id, tid, dif }, rng));
  }
  if (N.agenda) N.agenda.sort((x, y) => x.h - y.h);
  return out;
}

/** Un pedido que llega: se arma y el cliente escribe. */
function llega(p, D, a, rng) {
  const N = p.negocio, C = cliente(D, a.cid), T = trabajo(D, a.tid);
  const primeraVez = !N.contactos.includes(C.id);
  const pe = crearPedido(p, D, C.id, T.id, a.dif, rng, T.tipo === "foto" && !sabe(p, "set_fotos") ? { n: 1 } : {});   // sin E5: una foto
  mentir(p, D, pe, rng);
  const plant = primeraVez ? C.msgs.hola[0] : rng.uno(C.msgs.pedido[pe.tipo] || C.msgs.pedido.foto);
  escribir(p, C.id, "ella", rellenar(plant, vars(D, pe)) + (pe.mentira ? " " + rng.uno(D.trabajos.mentiras.dice) : ""), { pedido: pe.id });
  return pe;
}

// ---------------- el reloj (pedido de Santiago, 19-10-2026) ----------------
// El día despierto (despierta → duerme, 7:00 a 23:00) dura `minutos` reales (30): 1 hora del juego ≈ 1 min 52 s. Los
// pedidos llegan a lo largo del día (llegan: 8:00 a 19:00) y vencen a las 23:00 de su último día. A las 23:00 te vas a
// dormir: vuela la flota y empieza el día siguiente. El reloj corre solo mientras juegas y arranca después del tutorial.
const RELOJ = { minutos: 30, despierta: 7, duerme: 23, llegan: [8, 19] };
export const reloj = (D) => ({ ...RELOJ, ...(D.trabajos.reloj || {}) });
/** ¿Corre el reloj? (no durante el tutorial: el primer pedido de Doña Marta sin apuro) */
export const relojCorre = (p) => !!p?.negocio && !p.negocio.espera && p.negocio.tutorial >= 2;
/** 14.42 -> "14:25". */
export function fmtHora(h) { const m = Math.floor(h * 60 + 1e-6); return `${Math.floor(m / 60) % 24}:${String(m % 60).padStart(2, "0")}`; }
/** La hora de ahora (sin reloj todavía: la hora en que despiertas). */
export const hora = (p, D) => p.negocio.hora ?? reloj(D).despierta;

/**
 * Pasaron `seg` segundos reales jugando: avanza la hora y llegan los pedidos de la agenda. Devuelve
 * { nuevos: [pedidos que llegaron], dormir: true si ya son las 23:00 } o null si el reloj no corre.
 */
export function tick(p, D, seg) {
  if (!relojCorre(p)) return null;
  const N = p.negocio, R = reloj(D);
  if (!N.reloj) { N.reloj = true; N.hora = N.hora ?? R.despierta + 2; N.agenda = N.agenda || []; }   // una partida de antes: empieza a las 9:00
  N.hora = Math.min(R.duerme, N.hora + (seg * (R.duerme - R.despierta)) / (R.minutos * 60));
  return { nuevos: llegan(p, D), dormir: N.hora >= R.duerme };
}

/** Los pedidos de la agenda que ya tienen que llegar (hasta = Infinity: todos, p. ej. al dormir). */
export function llegan(p, D, hasta = p.negocio.hora) {
  const N = p.negocio, out = [];
  while (N.agenda?.length && N.agenda[0].h <= hasta) {
    const a = N.agenda.shift();
    out.push(llega(p, D, a, rngDe(N.semilla * 31 + N.dia * 7919 + a.k * 613 + 17)));
  }
  return out;
}

/** Cuánto le queda a un pedido: { dias, horas } (horas del día despierto hasta las 23:00 de su último día). */
export function queda(p, D, pe) {
  const N = p.negocio, R = reloj(D), dias = pe.limite - N.dia;
  return { dias, horas: dias * (R.duerme - R.despierta) + (R.duerme - hora(p, D)) };
}

/**
 * Clientes que mienten (o no saben): dicen "sin viento" y en el lugar sopla. El pedido muestra lo que dijo el cliente
 * (pe.viento, los requisitos salen de eso) y el vuelo usa pe.viento_real: lo descubres volando (el HUD marca el viento).
 */
function mentir(p, D, pe, rng) {
  const M = D.trabajos.mentiras;
  if (!M || pe.tipo === "video" || p.negocio.dia < M.desde_dia || rng() >= M.prob) return;
  pe.viento_real = Math.round((pe.viento + rng.entre(...M.viento)) * 10) / 10;
  pe.mentira = true;
}

/** Los pedidos de la campaña que ya se abrieron (reputación) y todavía no se ofrecieron: llegan por el chat. */
export function especiales(p, D) {
  const N = p.negocio, out = [];
  for (const pe of D.misiones.pedidos) {
    const cid = D.clientes.especiales[pe.id];
    if (!cid || N.ofrecidos.includes(pe.id) || !pe.lugar || !pe.tomas || p.rep < (pe.rep_min || 0) || p.hechos?.[pe.id] !== undefined) continue;
    // los especiales son videos de la campaña: llegan cuando ya puedes comprar E6 (tienes E5); antes, fotos para juntar la
    // plata de los simuladores. El de la casa, además, después de la primera foto (antes llegaba el de la finca sin esto)
    if (!posible(p, { tipo: "video" }) || (pe.id === "casa_venta" && N.tutorial < 2)) continue;
    N.ofrecidos.push(pe.id);
    const primero = N.tutorial >= 99 && D.clientes.especial_msg_primero?.[pe.id];        // sin tutorial: no hubo una foto antes
    escribir(p, cid, "ella", rellenar(primero || D.clientes.especial_msg[pe.id] || "⭐ {titulo}", { pago: pe.pago, titulo: pe.titulo }), { especial: pe.id });
    out.push(pe);
  }
  return out;
}

// ---------------- responder ----------------
export function aceptar(p, D, id) {
  const pe = pedido(p, id);
  if (!pe || pe.estado !== "nuevo") return null;
  pe.estado = "aceptado";
  escribir(p, pe.cliente, "yo", t("¡Claro que sí! Cuente conmigo."));
  escribir(p, pe.cliente, "ella", rngDe(N_(p) + pe.dia).uno(cliente(D, pe.cliente).msgs.aceptar));
  if (pe.tutorial && p.negocio.tutorial < 1) p.negocio.tutorial = 1;
  return pe;
}
export function rechazar(p, D, id) {
  const pe = pedido(p, id);
  if (!pe || pe.estado !== "nuevo") return null;
  pe.estado = "rechazado";
  escribir(p, pe.cliente, "yo", t("Esta vez no puedo, ¡gracias por escribirme!"));
  escribir(p, pe.cliente, "ella", rngDe(N_(p) + pe.dia).uno(cliente(D, pe.cliente).msgs.rechazar));
  return pe;
}
const N_ = (p) => p.negocio.semilla + p.negocio.sig * 13;

/**
 * Entregar un pedido del negocio después de volarlo. r = { estrellas, piloto, fotos }. Paga según las estrellas
 * (misiones.json pago_por_estrellas), sube o baja la relación y el cliente responde. 0 estrellas: no paga y el pedido
 * sigue abierto (se puede intentar otra vez hasta que venza). Devuelve { pago, rep, relacion, texto, recomienda }.
 */
export function entregar(p, D, id, r) {
  const N = p.negocio, pe = pedido(p, id);
  if (!pe || (pe.estado !== "aceptado" && pe.estado !== "nuevo")) return null;
  const C = cliente(D, pe.cliente), M = D.misiones, R = D.trabajos.relacion;
  const e = Math.max(0, Math.min(3, r.estrellas | 0));
  const pago = Math.round(pe.pago * M.pago_por_estrellas[e]);
  const rep = M.reputacion_por_estrellas[e];
  const antes = N.relacion[pe.cliente] || 0;
  const rel = Math.max(0, Math.min(R.max, antes + (e >= 1 ? 1 : -1)));   // entregaste: el cliente vuelve (con 1 ★ también; antes no subía y quedabas solo con Doña Marta)
  delete pe.flota;
  escribir(p, pe.cliente, "yo", pe.tipo === "video" ? t("¡Listo! Aquí está el video 🎬") : nombreTipo(pe.tipo, pe.n) === t("1 foto") ? t("¡Listo! Aquí está la foto 📷") : t("¡Listo! Aquí están las fotos 📷"), { entrega: id, fotos: r.fotos || 0, estrellas: e });
  if (pe.mentira) escribir(p, pe.cliente, "ella", rngDe(N_(p) + 3).uno(D.trabajos.mentiras.despues));   // ¿viento? 😅
  const texto = rngDe(N_(p) + e).uno(C.msgs.gracias[e]);
  escribir(p, pe.cliente, "ella", texto);
  if (r.piloto === "ia" && e >= 1 && C.msgs.ia) escribir(p, pe.cliente, "ella", C.msgs.ia);
  p.plata += pago;
  anotar(p, pago, t("{cliente}: {trabajo}", { cliente: C.nombre, trabajo: nombreTipo(pe.tipo, pe.n) }));
  p.rep = Math.max(0, p.rep + rep);
  N.relacion[pe.cliente] = rel;
  let recomienda = null;
  if (e >= 1) {
    pe.estado = "hecho";
    pe.estrellasHechas = e;
    N.hechos++;
    N.hoy++;
    if (pe.tutorial) N.tutorial = Math.max(N.tutorial, 2);
    if (antes < R.recomienda && rel >= R.recomienda) recomienda = D.clientes.clientes.find((c) => c.recomendado_por === pe.cliente && !N.contactos.includes(c.id)) || null;
  }
  // después de la primera foto: el video de la casa (el primer pedido especial) llega enseguida
  const esp = e >= 1 ? especiales(p, D) : [];
  return { pago, rep, relacion: rel - antes, texto, recomienda, especiales: esp };
}

/** Un pedido especial (campaña) entregado: el cliente agradece por el chat. */
export function entregarEspecial(p, D, idCampana, estrellas) {
  const cid = D.clientes.especiales[idCampana];
  if (!cid || !p.negocio) return;
  const C = cliente(D, cid), e = Math.max(0, Math.min(3, estrellas | 0));
  escribir(p, cid, "yo", t("¡Listo! Aquí está el video 🎬"), { entrega: idCampana, estrellas: e });
  escribir(p, cid, "ella", rngDe(N_(p) + 7 * e).uno(C.msgs.gracias[e]));
  if (e >= 2) p.negocio.relacion[cid] = Math.min(D.trabajos.relacion.max, (p.negocio.relacion[cid] || 0) + 1);
  if (e >= 1) p.negocio.hoy++;
}

// ---------------- la flota ----------------
/** El pedido que tiene asignado un dron (o null): cada dron vuela un trabajo por día. */
export function ocupado(p, dronId) {
  return p.negocio?.pedidos.find((x) => x.flota === dronId && (x.estado === "nuevo" || x.estado === "aceptado")) || null;
}
/** Los pedidos que la flota vuela al terminar el día. */
export function flota(p) {
  return (p.negocio?.pedidos || []).filter((x) => x.flota && (x.estado === "nuevo" || x.estado === "aceptado"));
}
/**
 * Mandar un pedido a la flota con un dron (si era nuevo, se acepta). El tutorial no: ese lo vuelas tú.
 * Devuelve { ok, msg }. Si el dron tenía otro pedido, se le quita (un trabajo por dron).
 */
export function asignar(p, D, id, dronId) {
  const pe = pedido(p, id);
  if (!pe || (pe.estado !== "nuevo" && pe.estado !== "aceptado")) return { ok: false, msg: t("Ese pedido ya no está abierto.") };
  if (pe.tutorial) return { ok: false, msg: t("Este primero vuélalo tú: es tu primer trabajo.") };
  if (!p.drones.some((d) => d.id === dronId)) return { ok: false, msg: t("Ese dron no está en tu hangar.") };
  if (pe.estado === "nuevo") aceptar(p, D, id);
  const otro = ocupado(p, dronId);
  if (otro && otro.id !== id) delete otro.flota;
  pe.flota = dronId;
  return { ok: true, quitado: otro && otro.id !== id ? otro : null };
}
export function quitarFlota(p, id) {
  const pe = pedido(p, id);
  if (pe) delete pe.flota;
  return pe;
}
/**
 * Lo que pasó con un trabajo de la flota que no se entregó (le faltaron tomas, chocó, batería, failsafe): el cliente no
 * se entera, el pedido sigue abierto (hasta que venza: si vencía hoy, vence al terminar el día) y en su chat queda una nota.
 */
export function falloFlota(p, D, id, dron, motivo) {
  const pe = pedido(p, id);
  if (!pe) return null;
  delete pe.flota;
  const v = { dron, titulo: pe.titulo, motivo };
  escribir(p, pe.cliente, "sistema", pe.limite <= p.negocio.dia ? t("🤖 {dron} no pudo con «{titulo}»: {motivo}. Hoy vencía.", v) : t("🤖 {dron} no pudo con «{titulo}»: {motivo}. El pedido sigue abierto.", v));
  return pe;
}

/** Los pedidos que esperan algo de ti: nuevos (responder) y aceptados (volar), con los días que quedan. */
export function pendientes(p) {
  const N = p.negocio;
  if (!N) return [];
  return N.pedidos.filter((x) => x.estado === "nuevo" || x.estado === "aceptado").map((x) => ({ ...x, quedan: x.limite - N.dia + 1 }));
}

/**
 * El tutorial (día 1): qué tiene que hacer ahora el jugador, en una línea. null = ya terminó.
 * s = { hayDron, dronListo }
 */
export function pasoTutorial(p, s) {
  const N = p.negocio;
  if (!N || N.tutorial >= 2) return null;
  if (N.tutorial === 0) return { paso: 1, txt: t("💬 Te escribieron. Abre el <b>💻 Computador</b> (a la izquierda) → <b>Mensajes</b> y lee el mensaje de Doña Marta.") };
  if (!s.hayDron) return { paso: 2, txt: t("🛒 Necesitas un dron: en el <b>💻 Computador → Tienda → 🎁 Kits</b> compra el <b>Kit del garaje</b>: llegan las piezas de tu primer dron.") };
  if (!s.dronListo) return { paso: 3, txt: t("🔧 Ahora ármalo en el <b>banco de armado</b>: abre tu dron y sigue los pasos (imprimir, armar, cablear, programar, probar).") };
  return { paso: 4, txt: t("🚁 ¡Listo! En el <b>💻 Computador → Mensajes</b>, abre el pedido de Doña Marta y vuela: llega al aro y quédate quieto para la foto.") };
}
