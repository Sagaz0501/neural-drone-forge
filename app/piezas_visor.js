// Visor de piezas GLB (página de desarrollo: http://localhost:8765/app/piezas.html).
// Carga app/modelos/<pieza>.glb (los hace blender/piezas/exportar_todo.py), los muestra girando,
// pone la punta del cautín al rojo y dice el nombre de lo que tocas (pad_GPIO23…).
import * as THREE from "three";
import { OrbitControls } from "three/addons/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const PIEZAS = ["esp32_devkitc", "soldador"];

const cont = document.getElementById("vista");
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
cont.appendChild(renderer.domElement);

const escena = new THREE.Scene();
escena.background = new THREE.Color(0x111316);
const camara = new THREE.PerspectiveCamera(35, 1, 0.001, 50);   // piezas en metros: near chiquito
const controles = new OrbitControls(camara, renderer.domElement);
controles.enableDamping = true;
controles.autoRotate = true;
controles.autoRotateSpeed = 1.2;

// un "estudio" para los reflejos de los metales: paneles que brillan dentro de una caja (como RoomEnvironment)
function ambiente() {
  const e = new THREE.Scene();
  const caja = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshBasicMaterial({ color: 0x2a2d33, side: THREE.BackSide }));
  e.add(caja);
  const panel = (w, h, pos, int) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(int, int, int), side: THREE.DoubleSide }));
    m.position.set(...pos);
    m.lookAt(0, 0, 0);
    e.add(m);
  };
  panel(4, 2, [0, 4.9, 0], 6);
  panel(2, 3, [-4.9, 1.5, 2], 3);
  panel(3, 2, [4.9, 1, -1], 2.5);
  panel(3, 1, [0, 1, -4.9], 1.5);
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(e, 0.04).texture;
  pm.dispose();
  return tex;
}
escena.environment = ambiente();
escena.environmentIntensity = 0.6;

// luz de 3 puntos (las direcciones; la distancia se ajusta al tamaño de la pieza)
const clave = new THREE.DirectionalLight(0xfff4e6, 2.2);
const relleno = new THREE.DirectionalLight(0xdde8ff, 0.6);
const contra = new THREE.DirectionalLight(0xe6f0ff, 1.6);
escena.add(clave, relleno, contra, new THREE.HemisphereLight(0xffffff, 0x202024, 0.25));

const cargador = new GLTFLoader();
let modelo = null, punta = null, brillo = null;
const info = document.getElementById("info");
const nombre = document.getElementById("nombre");

function encuadrar(obj) {
  const caja = new THREE.Box3().setFromObject(obj);
  const centro = caja.getCenter(new THREE.Vector3());
  const r = caja.getSize(new THREE.Vector3()).length() / 2;
  controles.target.copy(centro);
  const d = r / Math.sin(THREE.MathUtils.degToRad(camara.fov / 2)) * 0.9;
  camara.position.copy(centro).add(new THREE.Vector3(0.55, 0.6, 0.75).normalize().multiplyScalar(d));
  camara.near = r / 200; camara.far = r * 50; camara.updateProjectionMatrix();
  controles.minDistance = r * 0.15; controles.maxDistance = r * 8;
  clave.position.set(centro.x + r * 2, centro.y + r * 3, centro.z + r * 1.5);
  relleno.position.set(centro.x - r * 3, centro.y + r, centro.z + r);
  contra.position.set(centro.x - r, centro.y + r * 2, centro.z - r * 3);
  for (const l of [clave, relleno, contra]) l.target.position.copy(centro), l.target.updateMatrixWorld();
}

function contar(obj) {
  let mallas = 0, tris = 0;
  obj.traverse((o) => {
    if (!o.isMesh) return;
    mallas++;
    const g = o.geometry;
    tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
  });
  return { mallas, tris };
}

function cargar(pieza) {
  for (const b of document.querySelectorAll("#lista button")) b.classList.toggle("activa", b.dataset.p === pieza);
  info.textContent = "cargando…";
  const t0 = performance.now();
  cargador.load(`modelos/${pieza}.glb`, (gltf) => {
    if (modelo) escena.remove(modelo);
    modelo = gltf.scene;
    escena.add(modelo);
    punta = modelo.getObjectByName("punta");
    if (punta) {
      punta.material = punta.material.clone();          // material propio: no pinta otras piezas
      brillo = new THREE.PointLight(0xff5a1a, 0, 0.08, 2);
      punta.add(brillo);
    } else brillo = null;
    calentar();
    encuadrar(modelo);
    const { mallas, tris } = contar(modelo);
    const pads = [];
    modelo.traverse((o) => { if (o.name.startsWith("pad_")) pads.push(o.name); });
    info.textContent = `${pieza}.glb · ${mallas} mallas · ${Math.round(tris)} triángulos · ${Math.round(performance.now() - t0)} ms` +
      (pads.length ? ` · ${pads.length} pads` : "");
    window.__pieza = { pieza, mallas, tris: Math.round(tris), pads: pads.length, punta: !!punta };   // para las pruebas
  }, undefined, (err) => { info.textContent = "error: " + (err?.message || err); console.error(err); });
}

function calentar() {
  const on = document.getElementById("caliente").checked;
  if (!punta) return;
  punta.material.emissive = new THREE.Color(on ? 0xff3a0a : 0x000000);
  punta.material.emissiveIntensity = on ? 2.2 : 0;
  if (brillo) brillo.intensity = on ? 0.06 : 0;
}

// clic (sin arrastrar) = el nombre de lo que tocaste; los pads guardan su pin en userData
const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
let abajo = null, marcado = null;
renderer.domElement.addEventListener("pointerdown", (e) => (abajo = [e.clientX, e.clientY]));
renderer.domElement.addEventListener("pointerup", (e) => {
  if (!abajo || Math.hypot(e.clientX - abajo[0], e.clientY - abajo[1]) > 4 || !modelo) return;
  const r = renderer.domElement.getBoundingClientRect();
  ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ptr, camara);
  const hit = ray.intersectObject(modelo, true)[0];
  if (marcado) { marcado.o.material = marcado.m; marcado = null; }
  if (!hit) { nombre.textContent = "—"; return; }
  // multi-material: three crea hijos sin nombre propio; sube hasta el nodo con nombre de Blender
  let o = hit.object;
  while (o.parent && o.parent !== modelo && /_\d+$/.test(o.name) && o.parent.name && o.name.startsWith(o.parent.name)) o = o.parent;
  const ud = { ...(hit.object.userData || {}), ...(o.userData || {}) };
  delete ud.name;
  nombre.textContent = o.name + (Object.keys(ud).length ? "  " + JSON.stringify(ud) : "");
  if (hit.object.isMesh) {                                // resalta lo tocado
    marcado = { o: hit.object, m: hit.object.material };
    const m = hit.object.material.clone();
    m.emissive = new THREE.Color(0x3399ff); m.emissiveIntensity = 0.8;
    hit.object.material = m;
  }
  window.__clic = o.name;
});

// lista de piezas
const lista = document.getElementById("lista");
for (const p of PIEZAS) {
  const b = document.createElement("button");
  b.textContent = p; b.dataset.p = p;
  b.onclick = () => cargar(p);
  lista.appendChild(b);
}
document.getElementById("caliente").onchange = calentar;
document.getElementById("giro").onchange = (e) => (controles.autoRotate = e.target.checked);

function tam() {
  const w = cont.clientWidth, h = cont.clientHeight;
  renderer.setSize(w, h); camara.aspect = w / h; camara.updateProjectionMatrix();
}
addEventListener("resize", tam);
tam();
renderer.setAnimationLoop(() => { controles.update(); renderer.render(escena, camara); });
cargar(new URLSearchParams(location.search).get("p") || PIEZAS[0]);

// para las pruebas: dónde cae un objeto en la pantalla (px)
window.__visor = {
  pantalla(n, dx = 0, dy = 0, dz = 0) {
    const o = modelo?.getObjectByName(n);
    if (!o) return null;
    const v = new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3()).add(new THREE.Vector3(dx, dy, dz)).project(camara);
    const r = renderer.domElement.getBoundingClientRect();
    return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height];
  },
  girar(on) { controles.autoRotate = on; },
};
