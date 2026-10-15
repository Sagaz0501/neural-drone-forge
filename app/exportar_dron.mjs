// Exporta la física de un dron armado con piezas del juego a drones/<nombre>.json, para entrenar la IA
// con ESE dron en el Drone Lab (o con: python scripts/live_train.py --dron drones/<nombre>.json).
//   node app/exportar_dron.mjs                      -> los drones de ejemplo (DRONES_EJEMPLO)
//   node app/exportar_dron.mjs mi_dron '{"chasis":"pla",...}'
import { readFileSync, writeFileSync } from "node:fs";
import { calcular, paramsFisica, DRONES_EJEMPLO } from "./parts.js";

const cat = JSON.parse(readFileSync(new URL("./data/piezas.json", import.meta.url)));
const dir = new URL("../drones/", import.meta.url);
const pedidos = process.argv[2] ? { [process.argv[2]]: JSON.parse(process.argv[3]) } : DRONES_EJEMPLO;

for (const [nombre, build] of Object.entries(pedidos)) {
  const st = calcular(build, cat);
  if (!st.ok) { console.log(`${nombre}: no se puede armar: ${st.errores.join(" ")}`); continue; }
  const p = paramsFisica(st);
  const r = (x, n = 4) => Number(x.toFixed(n));
  const out = {
    nombre, piezas: build,
    fisica: { mass: r(p.mass), twr: r(p.twr), drag: r(p.drag), max_angle_deg: r(p.maxAngle * 180 / Math.PI, 2),
      yaw_rate_deg: r(p.yawRate * 180 / Math.PI, 2), att_resp: r(p.attResp), crash_speed: p.crashSpeed, radius: p.radius },
    juego: { masa_g: st.masa_g, minutos: r(st.minutos, 2), vel_max: r(st.velMax, 2), calidad: st.calidad, precio: st.precio },
  };
  writeFileSync(new URL(`${nombre}.json`, dir), JSON.stringify(out, null, 2) + "\n");
  console.log(`drones/${nombre}.json: ${st.masa_g} g, empuje/peso ${st.twr.toFixed(2)}, ${st.minutos.toFixed(1)} min`);
}
