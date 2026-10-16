// Para las pruebas en Node: "three" (que en el navegador da el importmap de index.html) -> game/vendor/three.module.min.js.
// Uso: node --import ./app/three_node.mjs app/test_flota.mjs
import { register } from "node:module";
register("data:text/javascript," + encodeURIComponent(`
export async function resolve(spec, ctx, next) {
  if (spec === "three") return next(new URL("../game/vendor/three.module.min.js", ${JSON.stringify(import.meta.url)}).href, ctx);
  return next(spec, ctx);
}`));
