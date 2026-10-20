// =====================================================================
// EL MULTÍMETRO en 3D (blender/piezas/multimetro.py -> app/modelos/multimetro.glb), para el escritorio del garaje y la
// mesa de soldar: la pantalla es un canvas (la lectura), la perilla gira a su modo y las puntas se mueven solas.
// Si el GLB no cargó, se dibuja uno simple aquí (mismas medidas: 80 x 158 x 30 mm, la pantalla hacia -z).
// =====================================================================
import * as THREE from "three";
import { modelo } from "./modelos3d.js";

/** Hacia dónde apunta la perilla en cada modo (grados; 90 = OFF, arriba; como las letras de multimetro.py). */
const ANGULO = { off: 90, v: 45, ohm: -30, cont: -70 };
const SIMBOLO = { v: "V⎓", ohm: "Ω", cont: "Ω", off: "" };

/**
 * Un multímetro listo para la escena. Devuelve { g, pantalla(lectura), modo(m), puntas: {roja, negra}, cables: [..],
 * bornes: {com, v} (en coordenadas de g, donde salen los cables), glb: bool }.
 * lectura = { txt: "0.12" | "OL" | "", modo: "cont"|"ohm"|"v"|"off", pita: bool }
 */
export function multimetro3d() {
  const g = modelo("multimetro") || simple();
  const lcd = document.createElement("canvas"); lcd.width = 256; lcd.height = 114;
  const tex = new THREE.CanvasTexture(lcd); tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = false; tex.anisotropy = 4;
  const scr = g.getObjectByName("pantalla");
  if (scr) scr.material = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.05, 1.05, 1.05) });
  const perilla = g.getObjectByName("perilla");
  const out = {
    g, tex, glb: !g.userData.simple,
    puntas: { roja: g.getObjectByName("punta_roja"), negra: g.getObjectByName("punta_negra") },
    cables: [g.getObjectByName("cable_rojo"), g.getObjectByName("cable_negro")].filter(Boolean),
    // las bananas en los bornes (multimetro.py BORNES; z de Blender -> -z de three), donde nacen los cables
    bornes: { v: new THREE.Vector3(0.022, 0.045, 0.058), com: new THREE.Vector3(0, 0.045, 0.058) },
    _ultima: null,
    modo(m) { if (perilla) perilla.rotation.y = THREE.MathUtils.degToRad((ANGULO[m] ?? 90) - 90); },
    pantalla(l = {}) {
      const k = `${l.txt}|${l.modo}|${l.pita}`;
      if (k === out._ultima) return;
      out._ultima = k;
      dibujarLCD(lcd.getContext("2d"), lcd.width, lcd.height, l);
      tex.needsUpdate = true;
    },
  };
  out.pantalla({ txt: "", modo: "off" });
  return out;
}

/** La pantalla de cristal líquido: verde grisáceo, dígitos negros de 7 segmentos (con la sombra de los apagados). */
function dibujarLCD(g, w, h, { txt = "", modo = "off", pita = false } = {}) {
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#a9b99c"); gr.addColorStop(1, "#8fa283");
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  if (modo === "off") return;
  g.textBaseline = "alphabetic";
  g.font = "bold 74px 'DSEG7 Classic', 'Courier New', monospace"; g.textAlign = "right";
  g.fillStyle = "rgba(40,52,36,0.10)"; g.fillText("88.88", w - 44, 92);              // los segmentos apagados
  g.fillStyle = "#18200f"; g.fillText(txt || "", w - 44, 92);
  g.font = "bold 26px sans-serif"; g.textAlign = "left";
  g.fillText(SIMBOLO[modo] || "", w - 40, 92);
  g.font = "bold 15px sans-serif";
  g.fillText(modo === "v" ? "DC" : "AUTO", 10, 22);
  if (modo === "cont") {                                                              // el parlante de la continuidad
    g.fillStyle = pita ? "#18200f" : "rgba(24,32,15,0.25)";
    g.fillRect(12, 34, 8, 12); g.beginPath(); g.moveTo(20, 34); g.lineTo(30, 26); g.lineTo(30, 54); g.lineTo(20, 46); g.fill();
    g.lineWidth = 3; g.strokeStyle = g.fillStyle;
    for (const r of [8, 14]) { g.beginPath(); g.arc(30, 40, r, -0.7, 0.7); g.stroke(); }
  }
}

/** El de siempre si no hay GLB: la funda amarilla, el frente, la pantalla, la perilla y dos puntas. */
function simple() {
  const g = new THREE.Group(); g.userData.simple = true;
  const m = (c, r = 0.5) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
  const add = (geo, mat, x, y, z, parent = g) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; parent.add(o); return o; };
  add(new THREE.BoxGeometry(0.08, 0.03, 0.158), m(0xe0a800, 0.6), 0, 0.015, 0);
  add(new THREE.BoxGeometry(0.068, 0.002, 0.144), m(0x2a2c30), 0, 0.03, 0);
  const scr = add(new THREE.PlaneGeometry(0.054, 0.024), m(0x9fb59a), 0, 0.0315, -0.044);
  scr.rotation.x = -Math.PI / 2; scr.name = "pantalla";
  const per = new THREE.Group(); per.name = "perilla"; per.position.set(0, 0.031, 0.018); g.add(per);
  add(new THREE.CylinderGeometry(0.02, 0.02, 0.006, 24), m(0x3a3d42), 0, 0.003, 0, per);
  add(new THREE.BoxGeometry(0.008, 0.007, 0.036), m(0x3a3d42), 0, 0.006, 0, per);
  for (const [nombre, col, x] of [["punta_roja", 0xb01818, 0.056], ["punta_negra", 0x151515, 0.07]]) {
    const p = new THREE.Group(); p.name = nombre; p.position.set(x, 0.007, -0.03); p.rotation.x = -Math.PI / 2 + 0.06; g.add(p);
    add(new THREE.CylinderGeometry(0.0007, 0.0002, 0.017, 8), m(0xcccccc, 0.2), 0, 0.0085, 0, p);
    add(new THREE.CylinderGeometry(0.0048, 0.0045, 0.1, 14), m(col), 0, 0.07, 0, p);
  }
  return g;
}

// ---------------- el pitido (continuidad): un tono de ~2,7 kHz que suena mientras haya continuidad ----------------
let AC = null, osc = null, vol = null;
/** on = suena; intermitente (junta fría) = el que llama lo prende y apaga a saltos. */
export function pitido(on) {
  try {
    if (!on && !osc) return;
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    if (!osc) {
      osc = AC.createOscillator(); vol = AC.createGain();
      osc.type = "square"; osc.frequency.value = 2730; vol.gain.value = 0;
      osc.connect(vol).connect(AC.destination); osc.start();
    }
    vol.gain.setTargetAtTime(on ? 0.035 : 0, AC.currentTime, 0.006);
  } catch { /* sin audio */ }
}
