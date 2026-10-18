// Las traducciones: node app/test_i18n.mjs
//  · cada t("…") del código tiene su traducción en app/i18n/en/*.json, con las mismas {variables}
//  · los textos fijos de index.html están traducidos (html.json)
//  · las capas de datos (app/data/en/*.json) solo traen ids que existen
import { readFileSync, readdirSync, existsSync } from "fs";
import { PARTES, mezclar } from "./i18n.js";

let fallas = 0;
const ok = (c, msg) => { console.log(`${c ? "ok  " : "MAL "}  ${msg}`); if (!c) fallas++; };
const dir = new URL(".", import.meta.url), en = {};
for (const p of PARTES) {
  const f = new URL(`i18n/en/${p}.json`, dir);
  if (existsSync(f)) Object.assign(en, JSON.parse(readFileSync(f, "utf8")));
}
// la misma clave no puede traducirse distinto en dos partes (gana la última y queda raro)
{
  const vistos = {}, choques = [];
  for (const p of PARTES) {
    const f = new URL(`i18n/en/${p}.json`, dir);
    if (!existsSync(f)) continue;
    for (const [k, v] of Object.entries(JSON.parse(readFileSync(f, "utf8")))) {
      if (k in vistos && vistos[k][1] !== v) choques.push(`"${k}": ${vistos[k][0]} "${vistos[k][1]}" vs ${p} "${v}"`);
      vistos[k] = [p, v];
    }
  }
  ok(!choques.length, `ninguna clave con dos traducciones distintas${choques.length ? ": " + choques.join(" · ") : ""}`);
}
const vars = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

// 1) t("…") en el código
const claves = new Map();                                   // clave -> archivo
for (const f of readdirSync(dir).filter((x) => x.endsWith(".js") && !x.startsWith("test_") && x !== "i18n.js")) {
  const src = readFileSync(new URL(f, dir), "utf8");
  for (const m of src.matchAll(/\bt\(\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g)) {
    let k;
    try { k = JSON.parse(m[1][0] === "'" ? `"${m[1].slice(1, -1).replace(/"/g, '\\"')}"` : m[1]); } catch { continue; }
    if (!claves.has(k)) claves.set(k, f);
  }
  const conDolar = [...src.matchAll(/\bt\(\s*`[^`]*\$\{/g)].length;
  ok(!conDolar, `${f}: t() sin \`\${…}\` adentro (las variables van como t("… {x} …", { x }))`);
}
const sinTraducir = [...claves].filter(([k]) => !(k in en));
ok(!sinTraducir.length, `${claves.size} textos con t(): todos traducidos${sinTraducir.length ? ` (faltan ${sinTraducir.length}: ${sinTraducir.slice(0, 6).map(([k, f]) => `${f}: "${k.slice(0, 50)}"`).join(" · ")}…)` : ""}`);
const malVars = [...claves.keys()].filter((k) => k in en && vars(k) !== vars(en[k]));
ok(!malVars.length, `las {variables} coinciden${malVars.length ? `: ${malVars.slice(0, 4).map((k) => `"${k.slice(0, 40)}" → "${en[k].slice(0, 40)}"`).join(" · ")}` : ""}`);

// 2) el HTML fijo
const html = readFileSync(new URL("index.html", dir), "utf8").replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, "");
const textos = new Set();
for (const m of html.matchAll(/>([^<>]+)</g)) {
  const k = m[1].trim();
  if (k && /[A-Za-zÁÉÍÓÚáéíóúñÑ]{2}/.test(k) && !/^(Neural Drone Forge|PBDMM|English|Español|Drone Lab)$/.test(k)) textos.add(k);
}
for (const m of html.matchAll(/(?:aria-label|placeholder|title)="([^"]+)"/g)) if (/[a-záéíóúñ]{3}/i.test(m[1])) textos.add(m[1].trim());
const htmlFaltan = [...textos].filter((k) => !(k in en));
ok(!htmlFaltan.length, `${textos.size} textos fijos de index.html: todos traducidos${htmlFaltan.length ? ` (faltan ${htmlFaltan.length}: ${htmlFaltan.slice(0, 6).map((k) => `"${k.slice(0, 40)}"`).join(" · ")}…)` : ""}`);

// 3) las capas de datos
for (const nombre of ["piezas", "misiones", "entrenamiento", "pbdmm", "clientes", "trabajos", "escenarios", "software"]) {
  const f = new URL(`data/en/${nombre}.json`, dir);
  if (!existsSync(f)) { ok(false, `data/en/${nombre}.json existe`); continue; }
  const base = JSON.parse(readFileSync(new URL(`data/${nombre}.json`, dir), "utf8")), capa = JSON.parse(readFileSync(f, "utf8"));
  const ids = (x, out = new Set()) => { if (Array.isArray(x)) x.forEach((y) => ids(y, out)); else if (x && typeof x === "object") { if (x.id ?? x.k) out.add(x.id ?? x.k); Object.values(x).forEach((y) => ids(y, out)); } return out; };
  const extra = [...ids(capa)].filter((i) => !ids(base).has(i));
  ok(!extra.length, `data/en/${nombre}.json: solo ids que existen${extra.length ? ` (sobran: ${extra.slice(0, 5).join(", ")})` : ""}`);
  const m = mezclar(base, capa);
  ok(JSON.stringify(Object.keys(m)) === JSON.stringify(Object.keys(base)) || Object.keys(m).length >= Object.keys(base).length, `data/en/${nombre}.json: mezclado conserva la estructura`);
}
console.log(fallas ? `\n${fallas} pruebas fallaron.` : "\nTodas las pruebas pasan.");
process.exit(fallas ? 1 : 0);
