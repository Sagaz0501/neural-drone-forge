// Pruebas de piezas -> física.   node app/test_parts.mjs
import { readFileSync } from "fs";
import { calcular, paramsFisica, potencia, factorHelice, DRONES_EJEMPLO } from "./parts.js";
import { P } from "../game/sim.js";

const cat = JSON.parse(readFileSync(new URL("./data/piezas.json", import.meta.url)));
const RUSTICO = { chasis: "madera", motores: "m1806", helices: "h5", bateria: "b3s1300", controladora: "fc_basica", camara: "cam_juguete" };
let fallas = 0;
const prueba = (nombre, ok) => { console.log(`${ok ? "ok   " : "FALLA"} ${nombre}`); if (!ok) fallas++; };
const con = (cambios) => calcular({ ...RUSTICO, ...cambios }, cat);

const r = calcular(RUSTICO, cat);
prueba("el dron rústico se puede armar y despega", r.ok && r.twr > 1.5 && r.twr < 2.5);
prueba("el rústico vuela 3-6 min", r.minutos > 3 && r.minutos < 6);
prueba("más batería = más minutos pero más masa", (() => { const b = con({ bateria: "b3s2200" }); return b.minutos > r.minutos && b.masa_g > r.masa_g && b.twr < r.twr; })());
prueba("2S con motores de 3S: no despega", !con({ bateria: "b2s1000" }).ok);
prueba("4S quema los motores reciclados", con({ bateria: "b4s1500" }).errores.some((e) => e.includes("quema")));
prueba("hélices de 7\" no caben en el chasis de 5\"", !con({ chasis: "pla", helices: "h7" }).ok);
prueba("hélice de 3\" en motor de 5\": mucho menos empuje (y el rústico ni despega)", con({ helices: "h3" }).empuje_g < 0.5 * r.empuje_g && !con({ helices: "h3" }).ok);
prueba("hélice más chica reacciona más rápido, más grande es más eficiente", (() => { const a = factorHelice(3, 5), b = factorHelice(7, 5); return a.respuesta > 1 && b.respuesta < 1 && b.eficiencia > 1; })());
prueba("carbono es más rápido que madera", con({ chasis: "carbono5" }).velMax > r.velMax);
prueba("la cámara pesada baja el empuje/peso", con({ camara: "cam_4k" }).twr < r.twr);
prueba("potencia al gas de hover = potencia de hover", Math.abs(potencia(r, 1 / r.twr) - r.potenciaHover_W) < 1e-9);
prueba("paramsFisica tiene las mismas claves que P de sim.js", Object.keys(P).every((k) => k in paramsFisica(r)));
prueba("IA sin chip: error", !con({ software: "ia_fija" }).ok);
prueba("IA: modelo sin rango -> solo drones parecidos al de entrenamiento", (() => {
  const b = { ...RUSTICO, controladora: "fc_ia", software: "ia_fija" };
  const viejo = calcular(b, cat, null), nuevo = calcular(b, cat, { rango_fisica: { twr: [1.3, 9], masa_kg: [0.3, 1.2] } });
  return viejo.ia.enRango === false && nuevo.ia.enRango === true;
})());

prueba("ESC chico con motores grandes: menos empuje", con({ motores: "m2204", esc: "esc20" }).empuje_g === con({ motores: "m2204", esc: "esc35" }).empuje_g
  && (() => { const a = calcular({ ...RUSTICO, chasis: "aluminio", motores: "m2306", bateria: "b4s1500", esc: "esc20" }, cat), b = calcular({ ...RUSTICO, chasis: "aluminio", motores: "m2306", bateria: "b4s1500", esc: "esc35" }, cat); return a.empuje_g < b.empuje_g && a.escCorto && !b.escCorto; })());
prueba("gomas antivibración y filtro RPM: más nitidez", con({ montaje: "mt_gomas" }).nitidez > r.nitidez && r.nitidez > 0.7 && r.nitidez < 0.85);
prueba("el gimbal de 3 ejes casi borra la vibración", con({ camara: "cam_gimbal" }).vibracion < 0.35 * r.vibracion + 1e-9);
prueba("radio: alcance según el receptor", r.alcance_m === 20 && con({ radio: "rx_elrs24" }).alcance_m === 600);
prueba("cinewhoop trae protectores", calcular({ ...RUSTICO, chasis: "cinewhoop3", motores: "m1404", helices: "h3", bateria: "b4s1500" }, cat).ayudas.includes("protectores"));
prueba("el kit del garaje (con ESC, radio y montaje) vuela igual que antes", Math.abs(calcular(DRONES_EJEMPLO.madera, cat).twr - 1.9078) < 1e-3);

console.log(fallas ? `\n${fallas} pruebas fallaron.` : "\nTodas las pruebas pasan.");
process.exit(fallas ? 1 : 0);
