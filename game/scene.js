// =====================================================================
// ESCENA 3D (Three.js): cielo, luz, suelo con pasto, árboles, columnas, bodega, aros y el dron.
// La simulación usa Z arriba (como Python); Three.js usa Y arriba: V(x, y, z) hace la conversión.
// Los árboles, el pasto y las columnas son InstancedMesh: miles de copias en pocas llamadas a la
// tarjeta de video. Por eso esto va fluido y Blender en modo render no.
// =====================================================================
import * as THREE from "three";

export const V = (x, y, z) => new THREE.Vector3(x, z, -y);

// ---------------- utilidades ----------------
function rng32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function noiseCanvas(w, h, paint) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d");
  paint(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function speckle(g, w, h, base, cols, n, rmin, rmax, seed = 1) {
  const r = rng32(seed);
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) {
    g.fillStyle = cols[Math.floor(r() * cols.length)];
    g.globalAlpha = 0.25 + r() * 0.5;
    const x = r() * w, y = r() * h, rr = rmin + r() * (rmax - rmin);
    g.beginPath();
    g.arc(x, y, rr, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
}

/** Ruido suave sobre una esfera (suma de senos), para que las copas no sean pelotas perfectas. */
function wobble(n, seed, amp) {
  const r = rng32(seed);
  const ws = [];
  for (let i = 0; i < 6; i++) ws.push([(r() - 0.5) * 6, (r() - 0.5) * 6, (r() - 0.5) * 6, r() * 6.28]);
  let s = 0;
  for (const [a, b, c, p] of ws) s += Math.sin(a * n.x + b * n.y + c * n.z + p);
  return 1 + (amp * s) / ws.length * 1.6;
}

function gradientColors(geo, bottom, top, yMin, yMax) {
  const pos = geo.attributes.position;
  const cols = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const u = THREE.MathUtils.clamp((pos.getY(i) - yMin) / (yMax - yMin), 0, 1);
    for (let k = 0; k < 3; k++) cols[i * 3 + k] = bottom[k] + (top[k] - bottom[k]) * u;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(cols, 3));
  return geo;
}

// ---------------- geometrías base ----------------
function blobGeometry(amp, seed, wSeg = 22, hSeg = 14) {
  const g = new THREE.SphereGeometry(1, wSeg, hSeg);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = v.clone().normalize();
    v.multiplyScalar(wobble(n, seed, amp));
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return gradientColors(g, [0.5, 0.55, 0.5], [1.18, 1.15, 1.05], -1, 1);   // sombra abajo, luz arriba
}

function pineLayerGeometry(segs = 9) {
  // cono con la orilla en estrella (puntas de ramas que caen)
  const verts = [], idx = [];
  verts.push(0, 1.55, 0);                                     // punta
  for (let i = 0; i < segs * 2; i++) {
    const a = (i / (segs * 2)) * Math.PI * 2;
    const k = i % 2 === 0 ? 1.0 : 0.72;
    verts.push(Math.cos(a) * k, -0.12 * k, Math.sin(a) * k);
  }
  verts.push(0, 0.05, 0);                                     // centro de abajo
  const n = segs * 2;
  for (let i = 0; i < n; i++) {
    const a = 1 + i, b = 1 + ((i + 1) % n);
    idx.push(0, b, a);
    idx.push(n + 1, a, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  g.setIndex(idx);
  const ng = g.toNonIndexed();
  ng.computeVertexNormals();
  return gradientColors(ng, [0.55, 0.6, 0.55], [1.15, 1.15, 1.05], -0.15, 1.55);
}

function tuftGeometry(seed) {
  const r = rng32(seed);
  const pos = [], col = [];
  const dark = [0.05, 0.12, 0.03], light = [0.32, 0.52, 0.12];
  for (let b = 0; b < 6; b++) {
    const a = r() * Math.PI * 2, lean = 0.15 + r() * 0.45, h = 0.16 + r() * 0.22, w = 0.012 + r() * 0.012;
    const bx = (r() - 0.5) * 0.08, bz = (r() - 0.5) * 0.08;
    const px = -Math.sin(a) * w, pz = Math.cos(a) * w;
    pos.push(bx - px, 0, bz - pz, bx + px, 0, bz + pz, bx + Math.cos(a) * h * lean, h, bz + Math.sin(a) * h * lean);
    col.push(...dark, ...dark, ...light);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

// ---------------- materiales ----------------
export function makeMaterials() {
  const bark = noiseCanvas(128, 256, (g, w, h) => {
    const r = rng32(3);
    g.fillStyle = "#3b2a1c";
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) {
      g.fillStyle = r() < 0.5 ? "#21170f" : "#5a4330";
      g.globalAlpha = 0.35 + r() * 0.4;
      g.fillRect(r() * w, r() * h, 1 + r() * 3, 12 + r() * 60);
    }
  });
  const grass = noiseCanvas(256, 256, (g, w, h) => speckle(g, w, h, "#3d5a1d", ["#2c4514", "#4f6d23", "#5d7a2a", "#34501a", "#6b6a2c"], 1600, 1, 5, 7));
  const dirt = noiseCanvas(256, 256, (g, w, h) => speckle(g, w, h, "#7b6a55", ["#6a5a47", "#8a7962", "#5d4e3d", "#93836c"], 1400, 1, 4, 9));
  const concrete = noiseCanvas(256, 256, (g, w, h) => speckle(g, w, h, "#8d8c88", ["#7c7b77", "#9d9c97", "#86857f", "#a5a39d"], 1800, 1, 3, 11));
  const stripes = noiseCanvas(64, 64, (g, w, h) => {
    g.fillStyle = "#1a1a1a"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#f2b705";
    for (let i = -2; i < 4; i++) {
      g.beginPath();
      g.moveTo(i * 32, 64); g.lineTo(i * 32 + 16, 64); g.lineTo(i * 32 + 48, 0); g.lineTo(i * 32 + 32, 0); g.fill();
    }
  });
  const mat = (o) => new THREE.MeshStandardMaterial(o);
  return {
    bark: mat({ map: bark, roughness: 0.95 }),
    leaves: mat({ vertexColors: true, roughness: 0.85 }),
    pine: mat({ vertexColors: true, roughness: 0.9, flatShading: true }),
    rock: mat({ vertexColors: true, roughness: 0.9, flatShading: true }),
    grassGround: mat({ map: grass, roughness: 1 }),
    dirtGround: mat({ map: dirt, roughness: 1 }),
    concreteGround: mat({ map: concrete, roughness: 0.9 }),
    concrete: mat({ map: concrete, roughness: 0.85, color: 0xd9d6cf }),
    stripes: mat({ map: stripes, roughness: 0.6 }),
    steel: mat({ color: 0x8e9399, metalness: 0.85, roughness: 0.35 }),
    white: mat({ color: 0xffffff, roughness: 0.6 }),
    flower: mat({ roughness: 0.5, emissive: 0x111111 }),
  };
}

// ---------------- cielo, niebla y luz ----------------
export function makeSky(scene) {
  const geo = new THREE.SphereGeometry(400, 32, 16);
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x3f75b5) }, horizon: { value: new THREE.Color(0xcdd9d4) },
      sunDir: { value: new THREE.Vector3(0.5, 0.35, -0.3).normalize() } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; varying vec3 vDir;
      void main(){ float h = clamp(vDir.y, 0.0, 1.0); vec3 c = mix(horizon, top, pow(h, 0.55));
        float s = max(dot(normalize(vDir), sunDir), 0.0); c += vec3(1.0,0.85,0.6) * (pow(s, 600.0)*3.0 + pow(s, 12.0)*0.25);
        if (vDir.y < 0.0) c = horizon * 0.9; gl_FragColor = vec4(c, 1.0); }`,
  });
  const sky = new THREE.Mesh(geo, m);
  sky.frustumCulled = false;
  scene.add(sky);
  return sky;
}

export function makeLights(scene, quality) {
  const hemi = new THREE.HemisphereLight(0xc8dcef, 0x40502c, 1.1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe3bd, 2.6);
  sun.castShadow = true;
  const sz = quality === "alta" ? 2048 : 1024;
  sun.shadow.mapSize.set(sz, sz);
  const cam = sun.shadow.camera;
  cam.left = cam.bottom = -26; cam.right = cam.top = 26; cam.near = 1; cam.far = 140;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  return { hemi, sun, offset: new THREE.Vector3(32, 46, 18) };
}

// ---------------- mundo ----------------
const LEAF_GREENS = [[0.20, 0.42, 0.10], [0.26, 0.50, 0.13], [0.33, 0.55, 0.15], [0.17, 0.37, 0.10], [0.36, 0.58, 0.17], [0.22, 0.45, 0.15]];
const LEAF_FALL = [[0.85, 0.42, 0.07], [0.90, 0.62, 0.12], [0.70, 0.20, 0.06], [0.88, 0.74, 0.20]];
const LEAF_YOUNG = [[0.40, 0.64, 0.16], [0.47, 0.70, 0.20], [0.35, 0.60, 0.15]];
const PINE = [[0.10, 0.30, 0.15], [0.12, 0.34, 0.18], [0.09, 0.27, 0.16], [0.14, 0.37, 0.20]];
const FLOWERS = [0xf23052, 0xf2d126, 0x8c47e6, 0xf2f2f2, 0xf2700f, 0x4fa7f2];
const pick = (arr, u) => arr[Math.floor(u * 997) % arr.length];

export class WorldView {
  constructor(scene, mats, quality) {
    this.scene = scene; this.mats = mats; this.quality = quality;
    this.group = new THREE.Group();
    this.treeGroup = new THREE.Group();
    scene.add(this.group, this.treeGroup);
    this.geo = {
      trunk: new THREE.CylinderGeometry(0.5, 1.05, 1, 10, 1).translate(0, 0.5, 0),
      blob: blobGeometry(0.11, 5), blobBush: blobGeometry(0.16, 9, 16, 10),
      cluster: blobGeometry(0.05, 13, 9, 6), pine: pineLayerGeometry(9),
      rock: (() => {
        const g = new THREE.DodecahedronGeometry(1, 1);
        const p = g.attributes.position, v = new THREE.Vector3();
        for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); v.multiplyScalar(wobble(v.clone().normalize(), 21, 0.2)); v.y *= 0.75; p.setXYZ(i, v.x, v.y, v.z); }
        g.computeVertexNormals();
        return gradientColors(g, [0.36, 0.36, 0.34], [0.42, 0.55, 0.30], -0.4, 0.9);
      })(),
      flower: new THREE.IcosahedronGeometry(0.035, 0),
      box: new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
    };
  }

  clear() {
    for (const g of [this.group, this.treeGroup]) {
      for (const c of [...g.children]) { g.remove(c); if (c.isInstancedMesh) c.dispose(); }
    }
  }

  build(world) {
    this.clear();
    this.world = world;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), world.kind === "columnas" ? this.mats.dirtGround
      : world.kind === "bodega" ? this.mats.grassGround : this.mats.grassGround);
    ground.material.map.repeat.set(70, 70);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.name = "suelo";
    this.group.add(ground);
    this.ground = ground;
    if (world.kind !== "bodega") this.buildGrass(world);
    if (world.kind === "columnas") this.buildColumns(world.columns);
    if (world.kind === "bodega") this.buildWarehouse(world);
    this.buildTrees(world.trees, world.backdrop, world.kind === "campo" ? 0 : 1);
    if (world.kind === "campo" || world.kind === "columnas") {
      // un bosque a lo lejos: que haya horizonte
      if (!world._ring) {
        const r = rng32(77), back = [];
        for (let i = 0; i < 260; i++) {
          const a = r() * Math.PI * 2, d = 45 + r() * 30;
          back.push({ tipo: r() < 0.5 ? "pino" : "arbol", x: Math.cos(a) * d, y: Math.sin(a) * d, color: r(),
            tronco: [0.25, 5], copas: r() < 0.5 ? [[Math.cos(a) * d, Math.sin(a) * d, 5, 1.8]] :
              [[Math.cos(a) * d, Math.sin(a) * d, 3.8, 1.5], [Math.cos(a) * d, Math.sin(a) * d, 5.2, 1.1], [Math.cos(a) * d, Math.sin(a) * d, 6.2, 0.8]] });
        }
        world._ring = back;
      }
      this.buildTrees([], world._ring, 0, true);
    }
  }

  buildGrass(world) {
    const n = { alta: 30000, media: 14000, baja: 4000 }[this.quality];
    const r = rng32(17);
    const geos = [tuftGeometry(1), tuftGeometry(2)];
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    this.time = { value: 0 };
    const time = this.time;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = time;
      sh.vertexShader = "uniform float uTime;\n" + sh.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
        float sw = transformed.y * transformed.y * 6.0;
        vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        transformed.x += sin(uTime * 1.6 + ip.x * 0.35 + ip.z * 0.21) * 0.05 * sw;
        transformed.z += cos(uTime * 1.2 + ip.z * 0.30) * 0.035 * sw;`);
    };
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
    const pads = [world.spawn];
    for (const [k, geo] of geos.entries()) {
      const im = new THREE.InstancedMesh(geo, mat, n / 2);
      let i = 0;
      while (i < n / 2) {
        const rr = Math.sqrt(r()) * 42, a = r() * Math.PI * 2;
        const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
        if (pads.some((pd) => Math.hypot(pd[0] - x, pd[1] - y) < 0.9)) continue;
        p.copy(V(x, y, 0));
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 6.28);
        const sc = 0.7 + r() * 0.9;
        s.set(sc, sc * (0.8 + r() * 0.5), sc);
        im.setMatrixAt(i, m4.compose(p, q, s));
        const tone = 0.75 + r() * 0.5;
        im.setColorAt(i, c.setRGB(tone, tone * (0.95 + r() * 0.1), tone * 0.9));
        i++;
      }
      im.receiveShadow = true;
      im.frustumCulled = false;
      this.group.add(im);
    }
    // flores
    const nf = Math.floor(n / 14);
    const fm = new THREE.InstancedMesh(this.geo.flower, this.mats.flower, nf);
    for (let i = 0; i < nf; i++) {
      const rr = Math.sqrt(r()) * 38, a = r() * Math.PI * 2;
      fm.setMatrixAt(i, m4.compose(V(Math.cos(a) * rr, Math.sin(a) * rr, 0.18 + r() * 0.12), q.identity(), s.setScalar(0.8 + r() * 0.8)));
      fm.setColorAt(i, c.setHex(FLOWERS[Math.floor(r() * FLOWERS.length)]));
    }
    this.group.add(fm);
  }

  /** Árboles: troncos, copas (con racimos de hojas), pinos, arbustos y rocas. Se rehace al quitar árboles. */
  buildTrees(trees, backdrop, _x, keepOld = false) {
    if (!keepOld) {
      for (const ch of [...this.treeGroup.children]) { this.treeGroup.remove(ch); ch.dispose?.(); }
    }
    const all = [...trees.map((t) => [t, true]), ...backdrop.map((t) => [t, false])];
    const trunks = [], blobs = [], bushes = [], clusters = [], pines = [], rocks = [];
    const clustersOn = this.quality !== "baja";
    for (const [t, near] of all) {
      const u = t.color;
      if (t.tipo === "arbol" || t.tipo === "joven") {
        const rgb = t.tipo === "joven" ? pick(LEAF_YOUNG, u) : u < 0.17 ? pick(LEAF_FALL, u * 5) : pick(LEAF_GREENS, u);
        if (t.tronco) trunks.push([t.x, t.y, t.tronco[0], t.tronco[1], t.tipo === "arbol" && u >= 0.17 && u < 0.3 ? [2.6, 2.5, 2.3] : [1, 1, 1]]);
        t.copas.forEach(([x, y, z, r], k) => {
          blobs.push([x, y, z, r, rgb, (x * 13.1 + y * 7.7 + k) % 6.28]);
          if (clustersOn && near && t.tipo === "arbol") {
            const n = Math.floor(9 + 5 * r);
            for (let j = 0; j < n; j++) {
              const zf = 1 - (2 * (j + 0.5)) / n;
              if (zf < -0.3) continue;
              const rr = Math.sqrt(1 - zf * zf), th = j * 2.39996 + x;
              const cr = r * (0.26 + 0.08 * Math.sin(th * 3.1));
              const d = [rr * Math.cos(th), rr * Math.sin(th), zf];
              const tone = 0.88 + 0.25 * (0.5 + 0.5 * Math.sin(th * 1.7 + zf * 4));
              clusters.push([x + d[0] * (r * 0.92 - cr * 0.55), y + d[1] * (r * 0.92 - cr * 0.55), z + d[2] * (r * 0.92 - cr * 0.55), cr, rgb.map((v) => v * tone)]);
            }
          }
        });
      } else if (t.tipo === "pino") {
        trunks.push([t.x, t.y, t.tronco[0], t.tronco[1], [0.85, 0.8, 0.75]]);
        const rgb = pick(PINE, u);
        t.copas.forEach(([x, y, z, r], k) => pines.push([x, y, z - r * 0.5, r, rgb, k * 0.7 + u * 6]));
        // punta: tapa el tronco hasta arriba (el tronco de colisión llega hasta t.tronco[1])
        const [x, y, z, r] = t.copas[t.copas.length - 1];
        const s = Math.max(r * 0.55, (t.tronco[1] - z + 0.25) / 1.55);
        pines.push([x, y, z, s, rgb, u]);
      } else if (t.tipo === "arbusto") {
        const [x, y, z, r] = t.copas[0];
        bushes.push([x, y, z, r, pick(LEAF_GREENS, u * 3).map((v) => v * 0.85), u * 6]);
      } else {
        const [x, y, z, r] = t.copas[0];
        rocks.push([x, y, z, r, u * 6]);
      }
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), c = new THREE.Color();
    const up = new THREE.Vector3(0, 1, 0);
    const make = (geo, mat, items, set, shadow = true) => {
      if (!items.length) return;
      const im = new THREE.InstancedMesh(geo, mat, items.length);
      items.forEach((it, i) => set(im, i, it));
      im.castShadow = shadow;
      im.receiveShadow = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.computeBoundingSphere();
      this.treeGroup.add(im);
    };
    make(this.geo.trunk, this.mats.bark, trunks, (im, i, [x, y, r, h, tone]) => {
      im.setMatrixAt(i, m4.compose(V(x, y, 0), q.identity(), s.set(r, h, r)));
      im.setColorAt(i, c.setRGB(...tone));
    });
    make(this.geo.blob, this.mats.leaves, blobs, (im, i, [x, y, z, r, rgb, rot]) => {
      im.setMatrixAt(i, m4.compose(V(x, y, z), q.setFromAxisAngle(up, rot), s.setScalar(r)));
      im.setColorAt(i, c.setRGB(...rgb));
    });
    make(this.geo.cluster, this.mats.leaves, clusters, (im, i, [x, y, z, r, rgb]) => {
      im.setMatrixAt(i, m4.compose(V(x, y, z), q.identity(), s.setScalar(r)));
      im.setColorAt(i, c.setRGB(...rgb));
    }, false);
    make(this.geo.blobBush, this.mats.leaves, bushes, (im, i, [x, y, z, r, rgb, rot]) => {
      im.setMatrixAt(i, m4.compose(V(x, y, z), q.setFromAxisAngle(up, rot), s.setScalar(r)));
      im.setColorAt(i, c.setRGB(...rgb));
    });
    make(this.geo.pine, this.mats.pine, pines, (im, i, [x, y, z, r, rgb, rot]) => {
      im.setMatrixAt(i, m4.compose(V(x, y, z), q.setFromAxisAngle(up, rot), s.setScalar(r)));
      im.setColorAt(i, c.setRGB(...rgb));
    });
    make(this.geo.rock, this.mats.rock, rocks, (im, i, [x, y, z, r, rot]) => {
      im.setMatrixAt(i, m4.compose(V(x, y, z), q.setFromAxisAngle(up, rot), s.setScalar(r)));
      im.setColorAt(i, c.setRGB(1, 1, 1));
    });
  }

  buildColumns(cols) {
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    const body = new THREE.InstancedMesh(this.geo.box, this.mats.concrete, cols.length);
    const band = new THREE.InstancedMesh(this.geo.box, this.mats.stripes, cols.length);
    const cap = new THREE.InstancedMesh(this.geo.box, this.mats.steel, cols.length);
    cols.forEach((b, i) => {
      const cx = (b.min[0] + b.max[0]) / 2, cy = (b.min[1] + b.max[1]) / 2;
      const w = b.max[0] - b.min[0], d = b.max[1] - b.min[1], h = b.max[2] - b.min[2];
      body.setMatrixAt(i, m4.compose(V(cx, cy, b.min[2]), q, s.set(w, h, d)));
      band.setMatrixAt(i, m4.compose(V(cx, cy, 0), q, s.set(w + 0.04, 1.1, d + 0.04)));
      cap.setMatrixAt(i, m4.compose(V(cx, cy, b.max[2] - 0.12), q, s.set(w + 0.08, 0.12, d + 0.08)));
    });
    for (const im of [body, band, cap]) { im.castShadow = im.receiveShadow = true; this.group.add(im); }
  }

  buildWarehouse(world) {
    const COL = { pared: 0x8d969c, estanteria: 0x1f4aa8, montacargas: 0xf2b20c, columna: 0xbdbab2, letrero: 0xb81414, pallets: 0xa57a45 };
    const vis = world.visual || {};
    // piso de concreto adentro
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(36, 22), this.mats.concreteGround);
    this.mats.concreteGround.map.repeat.set(6, 4);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.01;
    floor.receiveShadow = true;
    this.group.add(floor);
    for (const b of world.boxes) {
      if (b.kind === "techo") {
        // techo visto solo desde adentro (desde arriba se ve el interior)
        const roof = new THREE.Mesh(new THREE.PlaneGeometry(b.max[0] - b.min[0], b.max[1] - b.min[1]),
          new THREE.MeshStandardMaterial({ color: 0x2b2f33, roughness: 0.9, side: THREE.FrontSide }));
        roof.rotation.x = Math.PI / 2;
        roof.position.copy(V((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, b.min[2]));
        this.group.add(roof);
        continue;
      }
      if (b.kind === "estanteria") { this.buildRack(b); continue; }
      const w = b.max[0] - b.min[0], d = b.max[1] - b.min[1], h = b.max[2] - b.min[2];
      const mesh = new THREE.Mesh(this.geo.box, b.kind === "columna" ? this.mats.concrete :
        new THREE.MeshStandardMaterial({ color: COL[b.kind] || 0x999999, roughness: b.kind === "pared" ? 0.7 : 0.55,
          metalness: b.kind === "montacargas" ? 0.2 : 0, side: b.kind === "pared" ? THREE.DoubleSide : THREE.FrontSide }));
      mesh.scale.set(w, h, d);
      mesh.position.copy(V((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, b.min[2]));
      mesh.castShadow = b.kind !== "pared";
      mesh.receiveShadow = true;
      this.group.add(mesh);
      if (b.kind === "letrero") {
        const t = label("SALIDA", "#ffffff", "#b81414", 512, 128);
        t.scale.set(4, 1, 1);
        t.position.copy(V((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, b.min[2] + 0.6));
        this.group.add(t);
      }
    }
    // lámparas
    for (const [x, y] of vis.lamps || []) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 0.4),
        new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff3dd, emissiveIntensity: 2.5 }));
      l.position.copy(V(x, y, 7.6));
      this.group.add(l);
    }
  }

  buildRack(b) {
    const g = new THREE.Group();
    const w = b.max[0] - b.min[0], d = b.max[1] - b.min[1], h = b.max[2] - b.min[2];
    const blue = new THREE.MeshStandardMaterial({ color: 0x1f4aa8, roughness: 0.45, metalness: 0.4 });
    const orange = new THREE.MeshStandardMaterial({ color: 0xf2560f, roughness: 0.5, metalness: 0.3 });
    const nUp = Math.max(2, Math.round(w / 2.7) + 1);
    for (let i = 0; i < nUp; i++) {
      const x = b.min[0] + (w * i) / (nUp - 1);
      for (const y of [b.min[1] + 0.05, b.max[1] - 0.05]) {
        const u = new THREE.Mesh(this.geo.box, blue);
        u.scale.set(0.09, h, 0.09);
        u.position.copy(V(x, y, b.min[2]));
        u.castShadow = true;
        g.add(u);
      }
    }
    const levels = 4;
    const r = rng32(Math.floor(b.min[0] * 10 + b.min[1] * 100));
    for (let k = 1; k <= levels; k++) {
      const z = b.min[2] + (h * k) / (levels + 0.4);
      for (const y of [b.min[1] + 0.05, b.max[1] - 0.05]) {
        const beam = new THREE.Mesh(this.geo.box, orange);
        beam.scale.set(w, 0.1, 0.07);
        beam.position.copy(V(b.min[0] + w / 2, y, z));
        g.add(beam);
      }
      // cajas en el estante de abajo de este nivel
      for (let x = b.min[0] + 0.6; x < b.max[0] - 0.6; x += 1.35) {
        if (r() < 0.25) continue;
        const bh = 0.35 + r() * 0.5;
        const bx = new THREE.Mesh(this.geo.box, new THREE.MeshStandardMaterial({ color: [0x9c7448, 0x8a6338, 0xb48a5a, 0xdcdcd4][Math.floor(r() * 4)], roughness: 0.9 }));
        bx.scale.set(1.1, bh, d * 0.8);
        bx.position.copy(V(x + 0.55, b.min[1] + d / 2, z - (h / (levels + 0.4)) + 0.12));
        bx.castShadow = true;
        g.add(bx);
      }
    }
    this.group.add(g);
  }
}

// ---------------- texto en el mundo ----------------
export function label(text, color = "#ffffff", bg = null, w = 128, h = 128) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d");
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
  g.fillStyle = color;
  g.font = `700 ${Math.floor(h * 0.62)}px "Chakra Petch", system-ui, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, w / 2, h / 2 + 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false, transparent: true }));
  sp.scale.set(0.5, 0.5, 1);
  return sp;
}

// ---------------- aros, ruta, plataformas ----------------
export const RING_COL = { cur: 0x47f08a, next: 0x3ccbff, later: 0x8fa39a };

export class RouteView {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.ringGeo = new THREE.TorusGeometry(0.5, 0.035, 12, 56);
    this.mats = {
      cur: new THREE.MeshStandardMaterial({ color: RING_COL.cur, emissive: RING_COL.cur, emissiveIntensity: 1.6 }),
      next: new THREE.MeshStandardMaterial({ color: RING_COL.next, emissive: RING_COL.next, emissiveIntensity: 1.3 }),
      later: new THREE.MeshStandardMaterial({ color: RING_COL.later, emissive: RING_COL.later, emissiveIntensity: 0.35, transparent: true, opacity: 0.75 }),
    };
    this.rings = [];
  }
  set(spawn, goals, landing = true) {
    for (const c of [...this.group.children]) this.group.remove(c);
    this.rings = [];
    // salida
    const pad = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.03, 40), new THREE.MeshStandardMaterial({ color: 0x1d2326, roughness: 0.6 }));
    disc.position.y = 0.015;
    disc.receiveShadow = true;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.025, 8, 48), new THREE.MeshStandardMaterial({ color: 0x3ccbff, emissive: 0x3ccbff, emissiveIntensity: 1.2 }));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.035;
    pad.add(disc, rim);
    pad.position.copy(V(spawn[0], spawn[1], 0));
    this.group.add(pad);
    // aros
    let prev = spawn;
    goals.forEach((g, i) => {
      const ring = new THREE.Mesh(this.ringGeo, this.mats.later);
      ring.position.copy(V(...g));
      const dir = V(g[0] - prev[0], g[1] - prev[1], g[2] - prev[2]);
      if (dir.lengthSq() < 1e-6) dir.set(1, 0, 0);
      ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.normalize());
      const num = label(String(i + 1), "#eaf2ef");
      num.position.copy(V(g[0], g[1], g[2] + 0.85));
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, Math.max(g[2] - 0.5, 0.01), 6),
        new THREE.MeshBasicMaterial({ color: 0xeaf2ef, transparent: true, opacity: 0.25 }));
      stem.position.copy(V(g[0], g[1], Math.max(g[2] - 0.5, 0.01) / 2));
      this.group.add(ring, num, stem);
      this.rings.push({ ring, num, stem });
      prev = g;
    });
    // camino punteado (solo en el editor)
    const pts = [V(spawn[0], spawn[1], 0.05), ...goals.map((g) => V(...g))];
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineDashedMaterial({ color: 0xeaf2ef, dashSize: 0.35, gapSize: 0.25, transparent: true, opacity: 0.6 }));
    line.computeLineDistances();
    this.path = line;
    this.group.add(line);
    // plataforma de llegada bajo el último aro
    if (landing && goals.length) {
      const g = goals[goals.length - 1];
      const end = new THREE.Group();
      const d2 = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.03, 40), new THREE.MeshStandardMaterial({ color: 0x1d2326, roughness: 0.6 }));
      d2.position.y = 0.015;
      const r2 = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.03, 8, 48), new THREE.MeshStandardMaterial({ color: 0x47f08a, emissive: 0x47f08a, emissiveIntensity: 1.4 }));
      r2.rotation.x = Math.PI / 2;
      r2.position.y = 0.04;
      end.add(d2, r2);
      end.position.copy(V(g[0], g[1], 0));
      this.group.add(end);
    }
    this.color(0);
  }
  color(goalIdx) {
    this.rings.forEach((r, i) => {
      const vis = i >= goalIdx;
      r.ring.visible = r.num.visible = r.stem.visible = vis;
      r.ring.material = i === goalIdx ? this.mats.cur : i === goalIdx + 1 ? this.mats.next : this.mats.later;
    });
  }
}

// ---------------- el dron (el frame de 5" del proyecto) ----------------
export function makeDrone() {
  const root = new THREE.Group();
  const body = new THREE.Group();                     // ejes del dron: X adelante, Y arriba, -Z izquierda
  root.add(body);
  const m = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, ...o });
  const carbon = m(0x141518, { roughness: 0.35 }), motor = m(0x2a2c30, { metalness: 0.9, roughness: 0.3 }),
    red = m(0xb3120f, { metalness: 0.9, roughness: 0.3 }), prop = m(0xff7a1a, { roughness: 0.4 }),
    propRear = m(0x3c4046, { roughness: 0.5 }),
    batt = m(0x15161a), label_ = m(0xf2c00c);
  const box = (sx, sy, sz, mat, x, y, z, ry = 0) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    b.position.set(x, y, z); b.rotation.y = ry; b.castShadow = true; body.add(b); return b;
  };
  const cyl = (r, h, mat, x, y, z) => {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 16), mat);
    c.position.set(x, y, z); c.castShadow = true; body.add(c); return c;
  };
  const R = 0.11;
  box(0.10, 0.004, 0.04, carbon, 0, 0.002, 0);
  const props = [];
  [45, 135, 225, 315].forEach((deg, i) => {
    const a = (deg * Math.PI) / 180;
    const x = Math.cos(a) * R, z = -Math.sin(a) * R;
    box(R, 0.004, 0.014, carbon, x / 2, 0.002, z / 2, a);
    cyl(0.014, 0.004, carbon, x, 0.002, z);
    cyl(0.013, 0.012, motor, x, 0.01, z);
    cyl(0.014, 0.006, red, x, 0.019, z);
    const p = new THREE.Group();
    const front = Math.cos(a) > 0;                    // hélices de adelante naranjas, las de atrás grises
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.125, 0.002, 0.012), front ? prop : propRear);
    blade.castShadow = true;
    p.add(blade);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.0635, 0.0635, 0.001, 32),
      new THREE.MeshBasicMaterial(front ? { color: 0xff7a1a, transparent: true, opacity: 0.3, depthWrite: false }
        : { color: 0x8a9096, transparent: true, opacity: 0.16, depthWrite: false }));
    p.add(disc);
    p.position.set(x, 0.026, z);
    p.userData = { dir: i % 2 ? -1 : 1, disc, blade };
    body.add(p);
    props.push(p);
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.003, 0.006),
      new THREE.MeshBasicMaterial({ color: Math.cos(a) > 0 ? 0x2bff5a : 0xff2a1a }));
    led.position.set(x * 0.6, -0.002, z * 0.6);
    led.rotation.y = a;
    body.add(led);
  });
  box(0.10, 0.002, 0.04, carbon, 0, 0.03, 0);
  box(0.075, 0.03, 0.035, batt, -0.005, 0.047, 0);
  box(0.05, 0.001, 0.03, label_, -0.005, 0.063, 0);
  box(0.016, 0.019, 0.019, m(0x0c0c0e), 0.04, 0.016, 0);
  const lens = cyl(0.006, 0.008, m(0x050508, { roughness: 0.05 }), 0.051, 0.016, 0);
  lens.rotation.z = Math.PI / 2;
  // la NARIZ: flecha verde encima apuntando hacia adelante y luz roja atrás (como un avión)
  const chev = new THREE.Shape();
  chev.moveTo(0.115, 0); chev.lineTo(0.035, 0.042); chev.lineTo(0.052, 0); chev.lineTo(0.035, -0.042); chev.lineTo(0.115, 0);
  const nose = new THREE.Mesh(new THREE.ShapeGeometry(chev), new THREE.MeshBasicMaterial({ color: 0x47f08a, side: THREE.DoubleSide }));
  nose.rotation.x = -Math.PI / 2;                     // plano XY -> acostado sobre el dron (X sigue siendo adelante)
  nose.position.y = 0.066;
  body.add(nose);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.012, 0.03), new THREE.MeshBasicMaterial({ color: 0xff2a1a }));
  tail.position.set(-0.046, 0.047, 0);
  body.add(tail);
  // brillo para encontrarlo desde lejos
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff7a1a }));
  beacon.position.set(0, 0.09, 0);
  body.add(beacon);
  root.scale.setScalar(1.35);
  root.userData = { body, props, beacon };
  return root;
}

/** Pone el dron donde dice la simulación (posición y roll/pitch/yaw en ejes Z-arriba). */
export function poseDrone(drone, pos, roll, pitch, yaw) {
  drone.position.copy(V(pos[0], pos[1], pos[2]));
  // R_sim = Rz(yaw) Ry(pitch) Rx(roll)  ->  en Three: Ry(yaw) Rz(-pitch) Rx(roll)
  drone.rotation.set(roll, yaw, -pitch, "YZX");
}

// ---------------- sensores y estela ----------------
export class Rays {
  constructor(scene) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(10 * 2 * 3), 3));
    g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(10 * 2 * 3), 3));
    this.lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 }));
    this.lines.frustumCulled = false;
    scene.add(this.lines);
  }
  update(pos, dirs, dists, maxLen) {
    const p = this.lines.geometry.attributes.position, c = this.lines.geometry.attributes.color;
    const o = V(...pos);
    dirs.forEach((d, i) => {
      const free0 = dists[i] >= maxLen - 1e-3;
      const L = free0 ? 0.55 : dists[i];                 // libre: solo un trocito (no ensucia la vista)
      const e = V(pos[0] + d[0] * L, pos[1] + d[1] * L, pos[2] + d[2] * L);
      p.setXYZ(i * 2, o.x, o.y, o.z);
      p.setXYZ(i * 2 + 1, e.x, e.y, e.z);
      const k = 1 - Math.min(dists[i] / maxLen, 1);
      const free = dists[i] >= maxLen - 1e-3;
      const col = free ? [0.28, 0.94, 0.54] : [1, 0.85 - 0.6 * k, 0.15];
      const a = free ? 0.35 : 1;
      c.setXYZ(i * 2, col[0] * a, col[1] * a, col[2] * a);
      c.setXYZ(i * 2 + 1, col[0], col[1], col[2]);
    });
    p.needsUpdate = c.needsUpdate = true;
  }
}

export class Trail {
  constructor(scene, n = 600) {
    this.n = n;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setDrawRange(0, 0);
    this.line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.55 }));
    this.line.frustumCulled = false;
    scene.add(this.line);
    this.count = 0;
  }
  reset() { this.count = 0; this.line.geometry.setDrawRange(0, 0); }
  push(pos) {
    const a = this.line.geometry.attributes.position;
    const v = V(...pos);
    if (this.count >= this.n) {
      a.array.copyWithin(0, 3);
      this.count = this.n - 1;
    }
    a.setXYZ(this.count, v.x, v.y, v.z);
    this.count++;
    a.needsUpdate = true;
    this.line.geometry.setDrawRange(0, this.count);
  }
}

// =====================================================================
// CAZA: pájaros (amarillos; la presa que persigue el dron, roja con una flecha encima)
// =====================================================================
export class BirdsView {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.birds = [];
    this.bodyGeo = new THREE.SphereGeometry(1, 14, 10);
    this.mats = {
      body: new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.55, emissive: 0x7a5200, emissiveIntensity: 0.45 }),
      prey: new THREE.MeshStandardMaterial({ color: 0xff5a3a, roughness: 0.5, emissive: 0xff3010, emissiveIntensity: 1.0 }),
      wing: new THREE.MeshStandardMaterial({ color: 0xfff1b8, roughness: 0.6, side: THREE.DoubleSide, emissive: 0x6b5a20, emissiveIntensity: 0.35 }),
      beak: new THREE.MeshStandardMaterial({ color: 0xff8a1a, roughness: 0.4 }),
    };
    const ws = new THREE.Shape();                    // ala: triángulo hacia -Z (izquierda del pájaro)
    ws.moveTo(0.07, 0); ws.lineTo(-0.02, 0.27); ws.lineTo(-0.11, 0.05); ws.lineTo(-0.06, 0);
    this.wingGeo = new THREE.ShapeGeometry(ws);
    // marcador de la presa + lo que el dron "sabe" de su movimiento (dónde estará en 0.6 s si sigue igual)
    this.marker = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.3, 4), new THREE.MeshBasicMaterial({ color: 0xff5a3a }));
    this.marker.rotation.x = Math.PI;
    this.marker.visible = false;
    this.group.add(this.marker);
    this.lead = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.12, gapSize: 0.08, transparent: true, opacity: 0.85 }));
    this.lead.visible = false;
    this.group.add(this.lead);
    this.bursts = [];
    this.extras = [];
  }
  makeBird() {
    const b = new THREE.Group();
    const body = new THREE.Mesh(this.bodyGeo, this.mats.body);
    body.scale.set(0.16, 0.075, 0.08);
    body.castShadow = true;
    const head = new THREE.Mesh(this.bodyGeo, this.mats.body);
    head.scale.setScalar(0.055);
    head.position.set(0.14, 0.04, 0);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.06, 6), this.mats.beak);
    beak.rotation.z = -Math.PI / 2;
    beak.position.set(0.215, 0.035, 0);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 4), this.mats.wing);
    tail.rotation.z = Math.PI / 2;
    tail.scale.set(1, 1, 0.3);
    tail.position.set(-0.19, 0.01, 0);
    const wl = new THREE.Group(), wr = new THREE.Group();
    const ml = new THREE.Mesh(this.wingGeo, this.mats.wing);
    ml.rotation.x = -Math.PI / 2;                    // el ala sale hacia -Z en el plano XZ
    const mr = ml.clone();
    mr.scale.y = -1;
    wl.add(ml); wr.add(mr);
    wl.position.set(0, 0.035, -0.04); wr.position.set(0, 0.035, 0.04);
    ml.position.z = 0; mr.position.z = 0;
    b.add(body, head, beak, tail, wl, wr);
    b.rotation.order = "YZX";
    b.scale.setScalar(1.3);
    b.userData = { body, head, wl, wr, phase: Math.random() * 6.28 };
    this.group.add(b);
    return b;
  }
  /** Editor: pájaros quietos donde los pusiste, con su número. */
  place(positions) {
    this.clearExtras();
    while (this.birds.length < positions.length) this.birds.push(this.makeBird());
    this.birds.forEach((b, i) => {
      b.visible = i < positions.length;
      if (!b.visible) return;
      const p = positions[i];
      b.position.copy(V(...p));
      b.rotation.set(0, Math.atan2(-p[1], -p[0]) + 1.2, 0);      // de lado, para que se vean las alas
      this.pose(b, 0.9, false);
      const num = label(String(i + 1), "#ffd23f");
      num.position.copy(V(p[0], p[1], p[2] + 0.55));
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, Math.max(p[2] - 0.15, 0.01), 6),
        new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.3 }));
      stem.position.copy(V(p[0], p[1], Math.max(p[2] - 0.15, 0.01) / 2));
      this.group.add(num, stem);
      this.extras.push(num, stem);
    });
    this.marker.visible = this.lead.visible = false;
  }
  clearExtras() {
    for (const o of this.extras) this.group.remove(o);
    this.extras = [];
  }
  hide() {
    this.clearExtras();
    this.birds.forEach((b) => (b.visible = false));
    this.marker.visible = this.lead.visible = false;
  }
  pose(b, flap, prey) {
    const u = b.userData;
    u.wl.rotation.x = flap;
    u.wr.rotation.x = -flap;
    const m = prey ? this.mats.prey : this.mats.body;
    if (u.body.material !== m) u.body.material = u.head.material = m;
  }
  /** Vuelo: pos/vel (interpoladas) de cada pájaro, vivos, cuál es la presa y lo que el dron estima. */
  update(pos, vel, alive, prey, est, t) {
    this.clearExtras();
    while (this.birds.length < pos.length) this.birds.push(this.makeBird());
    this.birds.forEach((b, i) => {
      b.visible = i < pos.length && alive[i];
      if (!b.visible) return;
      const p = pos[i], v = vel[i];
      b.position.copy(V(...p));
      const vh = Math.hypot(v[0], v[1]);
      if (vh > 0.05) b.rotation.set(0, Math.atan2(v[1], v[0]), Math.atan2(v[2], vh) * 0.6);
      const sp = Math.hypot(vh, v[2]);
      const u = b.userData;
      u.phase += 0.016 * (9 + 5 * sp);                       // aletea más rápido cuando huye
      this.pose(b, 0.15 + 0.75 * Math.sin(u.phase), i === prey);
    });
    const ok = prey !== null && prey >= 0 && alive[prey];
    this.marker.visible = this.lead.visible = ok;
    if (ok) {
      const p = pos[prey];
      this.marker.position.copy(V(p[0], p[1], p[2] + 0.55 + 0.06 * Math.sin(t * 6)));
      const a = this.lead.geometry.attributes.position;
      const q = V(p[0] + est[0] * 0.6, p[1] + est[1] * 0.6, p[2] + est[2] * 0.6), o = V(...p);
      a.setXYZ(0, o.x, o.y, o.z); a.setXYZ(1, q.x, q.y, q.z);
      a.needsUpdate = true;
      this.lead.geometry.computeBoundingSphere();
      this.lead.computeLineDistances();
    }
  }
  /** ¡Cazado!: plumas que salen volando. */
  burst(p) {
    const n = 26, geo = new THREE.BufferGeometry(), arr = new Float32Array(n * 3), v = [];
    for (let i = 0; i < n; i++) {
      const o = V(...p);
      arr.set([o.x, o.y, o.z], i * 3);
      const d = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 - 0.2, Math.random() - 0.5).normalize().multiplyScalar(1.5 + Math.random() * 2.5);
      v.push(d);
    }
    geo.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xfff1b8, size: 0.09, transparent: true, opacity: 1, depthWrite: false }));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.03, 8, 40), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true }));
    ring.position.copy(V(...p));
    ring.rotation.x = Math.PI / 2;
    this.group.add(pts, ring);
    this.bursts.push({ pts, ring, v, t: 0 });
  }
  tick(dt) {
    this.bursts = this.bursts.filter((b) => {
      b.t += dt;
      const a = b.pts.geometry.attributes.position;
      b.v.forEach((v, i) => {
        v.y -= 3.0 * dt;
        v.multiplyScalar(1 - 1.5 * dt);
        a.setXYZ(i, a.getX(i) + v.x * dt, a.getY(i) + v.y * dt, a.getZ(i) + v.z * dt);
      });
      a.needsUpdate = true;
      b.pts.material.opacity = Math.max(0, 1 - b.t / 1.1);
      b.ring.scale.setScalar(1 + b.t * 6);
      b.ring.material.opacity = Math.max(0, 1 - b.t / 0.5);
      if (b.t > 1.1) { this.group.remove(b.pts, b.ring); b.pts.geometry.dispose(); return false; }
      return true;
    });
  }
}
