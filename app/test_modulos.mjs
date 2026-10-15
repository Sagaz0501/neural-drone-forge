// Revisión estática de los módulos del juego: node app/test_modulos.mjs
// Una función local con el mismo nombre que algo importado lo tapa (pasó con dibujarRed en el Estudio: la red no se veía).
import { readFileSync, readdirSync } from "fs";
let fallas = 0;
const ok = (c, msg) => { console.log(`${c ? "ok  " : "MAL "}  ${msg}`); if (!c) fallas++; };
const dir = new URL(".", import.meta.url);
for (const f of readdirSync(dir).filter((x) => x.endsWith(".js"))) {
  const src = readFileSync(new URL(f, dir), "utf8");
  const importados = [...src.matchAll(/^import\s*\{([^}]*)\}\s*from/gm)].flatMap((m) => m[1].split(",").map((x) => x.trim().split(/\s+as\s+/).pop()).filter(Boolean));
  // function n( · const/let/var n · for (const n of …) · (a, n) => · n =>  (todas tapan lo importado en su bloque)
  const tapa = (n) => new RegExp(`\\bfunction\\s+${n}\\s*\\(|\\b(const|let|var)\\s+${n}\\b(?!\\s*:)|\\(([^()]*[,\\s])?${n}(\\s*=[^,)]*)?(,[^()]*)?\\)\\s*=>|(^|[^.\\w$])${n}\\s*=>`, "m");
  const tapados = importados.filter((n) => tapa(n).test(src));
  ok(!tapados.length, `${f}: nada importado queda tapado por una función o variable local${tapados.length ? " → " + tapados.join(", ") : ""}`);
}
console.log(fallas ? `\n${fallas} pruebas fallaron.` : "\nTodas las pruebas pasan.");
process.exit(fallas ? 1 : 0);
