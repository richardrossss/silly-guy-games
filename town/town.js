// Silly Guy Town: an open beach world for Reddy. Ported from Reddy mode in the &Associates game
// (the beach, the beach house, silly guys in every color, the block lawn), grown into a sandbox:
// place silly guys and blocks anywhere, build ramps, drive cars, go inside the beach house.
import * as THREE from './three.module.min.js';

const $ = (s) => document.querySelector(s);
const TOUCH = /[?&]touch=1/.test(location.search) || (!/[?&]touch=0/.test(location.search) && matchMedia('(pointer: coarse)').matches);
if (TOUCH) document.body.classList.add('touch');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rnd = (a, b) => a + Math.random() * (b - a);
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };

/* ---------------- renderer ---------------- */
const cv = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: !TOUCH, powerPreference: 'high-performance' });
const QSTEPS = [2, 1.5, 1.25, 1, 0.85, 0.7];
let qi = QSTEPS.findIndex((q) => q <= Math.min(devicePixelRatio || 1, TOUCH ? 1.25 : 2)); if (qi < 0) qi = QSTEPS.length - 1;
renderer.setPixelRatio(QSTEPS[qi]);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#8fd3ff');
scene.fog = new THREE.Fog('#bfe6ff', 90, 260);
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 600);
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
const hemi = new THREE.HemisphereLight('#ffffff', '#c9b27a', 1.1); scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff4dc', 1.6); sun.position.set(40, 80, 30); scene.add(sun);

/* ---------------- shared materials and geometry ---------------- */
const MATS = new Map();
const lam = (c) => { if (!MATS.has(c)) MATS.set(c, new THREE.MeshLambertMaterial({ color: c })); return MATS.get(c); };
const GEOS = new Map();
const boxG = (w, h, d) => { const k = `b${w},${h},${d}`; if (!GEOS.has(k)) GEOS.set(k, new THREE.BoxGeometry(w, h, d)); return GEOS.get(k); };
const cylG = (r0, r1, h, n = 10) => { const k = `c${r0},${r1},${h},${n}`; if (!GEOS.has(k)) GEOS.set(k, new THREE.CylinderGeometry(r0, r1, h, n)); return GEOS.get(k); };
const sphG = (r, n = 12) => { const k = `s${r},${n}`; if (!GEOS.has(k)) GEOS.set(k, new THREE.SphereGeometry(r, n, Math.max(6, n * 0.7 | 0))); return GEOS.get(k); };
function B(parent, color, w, h, d, x, y, z, ry = 0) { const m = new THREE.Mesh(boxG(w, h, d), typeof color === 'string' ? lam(color) : color); m.position.set(x, y + h / 2, z); m.rotation.y = ry; parent.add(m); return m; }
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); }
  return t;
}
// merge meshes into one mesh per material, in the space of `space` (a phone draws a few big things far faster)
function mergeInto(meshes, space) {
  const inv = new THREE.Matrix4(); if (space) { space.updateMatrixWorld(true); inv.copy(space.matrixWorld).invert(); }
  const buckets = new Map();
  for (const o of meshes) { const k = o.material.uuid + (o.geometry.attributes.uv ? ':uv' : ''); if (!buckets.has(k)) buckets.set(k, { mat: o.material, uv: !!o.geometry.attributes.uv, parts: [] }); buckets.get(k).parts.push(o); }
  const out = [];
  for (const b of buckets.values()) {
    let n = 0; const geos = b.parts.map((m) => { m.updateMatrixWorld(true); const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone(); g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld)); n += g.attributes.position.count; return g; });
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = b.uv ? new Float32Array(n * 2) : null; let o3 = 0, o2 = 0;
    for (const g of geos) { if (!g.attributes.normal) g.computeVertexNormals(); pos.set(g.attributes.position.array, o3); nor.set(g.attributes.normal.array, o3); if (uv && g.attributes.uv) uv.set(g.attributes.uv.array, o2); o3 += g.attributes.position.count * 3; o2 += g.attributes.position.count * 2; g.dispose(); }
    const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); mg.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); if (uv) mg.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    mg.computeBoundingSphere(); out.push(new THREE.Mesh(mg, b.mat));
  }
  return out;
}
function mergeGroup(g) { const ms = []; g.traverse((o) => { if (o.isMesh) ms.push(o); }); const merged = mergeInto(ms, g); for (const m of ms) m.parent.remove(m); for (const c of [...g.children]) g.remove(c); for (const m of merged) g.add(m); return g; }
const blob = new THREE.MeshBasicMaterial({ map: canvasTex(64, 64, (g) => { const r = g.createRadialGradient(32, 32, 4, 32, 32, 30); r.addColorStop(0, 'rgba(0,0,0,.45)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); }), transparent: true, depthWrite: false });
function shadowMesh(s) { const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s), blob); m.rotation.x = -Math.PI / 2; m.renderOrder = 1; scene.add(m); return m; }

export const COLORS = ['#e53935', '#ff8a2b', '#f7cf2a', '#2fae4a', '#1e63d6', '#8e44ad', '#ff5fb4', '#f4f4f0', '#1d1d1b'];

/* ---------------- the world: solids for walking and driving ---------------- */
// Every surface is a solid: a box (x0..x1, z0..z1, y0..y1), or a slope (height runs along x or z).
const G = 2;                              // build grid cell size (metres)
const STATICS = [];
const IX = 0, IZ = 600;                   // the beach house inside, far from the island
const ROOM = { x0: IX - 13, x1: IX + 13, z0: IZ - 10, z1: IZ + 10 };
const islandR = (x, z) => { const a = Math.atan2(z, x); return 104 + 8 * Math.sin(3 * a) + 5 * Math.sin(5 * a + 1); };
const inRoom = (x, z) => x > ROOM.x0 - 2 && x < ROOM.x1 + 2 && z > ROOM.z0 - 2 && z < ROOM.z1 + 2;
const onLand = (x, z) => Math.hypot(x, z) < islandR(x, z);
function stat(x0, x1, z0, z1, y0, y1, o = {}) { const s = { x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), y0, y1, ...o }; STATICS.push(s); return s; }
const grid = new Map();                  // "i,j" -> { items:[{t,c,r,mesh}] }
const key = (i, j) => i + ',' + j;
const SOLID = { block: 2, ramp: 2, tramp: 0.6 };
const TOPPER = { silly: 1, palm: 1 };
function groundTop(x, z) { if (inRoom(x, z)) return 0; return onLand(x, z) ? 0 : -1.1; }
function solidsAt(x, z) {
  const out = [];
  const gt = groundTop(x, z); out.push({ y0: -60, y1: gt, water: gt < 0 });
  const i = Math.floor(x / G), j = Math.floor(z / G); const cell = grid.get(key(i, j));
  if (cell) {
    let base = gt;
    for (const it of cell.items) {
      if (it.t === 'block') { out.push({ y0: base, y1: base + 2 }); base += 2; }
      else if (it.t === 'tramp') { out.push({ y0: base, y1: base + 0.6, bounce: 1 }); base += 0.6; }
      else if (it.t === 'ramp') {
        const fx = x / G - i, fz = z / G - j; const f = [fz, fx, 1 - fz, 1 - fx][it.r & 3];
        out.push({ y0: base, y1: base + 2 * clamp(f, 0, 1), ramp: 1 }); break;
      }
    }
  }
  for (const s of STATICS) {
    if (x < s.x0 || x > s.x1 || z < s.z0 || z > s.z1) continue;
    if (s.slope) { const f = s.slope === 'x' ? (x - s.x0) / (s.x1 - s.x0) : (z - s.z0) / (s.z1 - s.z0); out.push({ y0: s.y0, y1: lerp(s.ya, s.yb, f), slide: s.slide, sdir: s.sdir }); }
    else out.push(s);
  }
  return out;
}
function support(x, z, y, step) { let best = null; for (const s of solidsAt(x, z)) if (s.y1 <= y + step && (!best || s.y1 > best.y1)) best = s; return best; }
function blocked(x, z, y, h, step) { for (const s of solidsAt(x, z)) if (s.y1 > y + step && s.y0 < y + h) return true; return false; }

/* ---------------- island, sea, town ---------------- */
const pickGround = [];
{
  const pts = []; for (let k = 0; k < 96; k++) { const a = k / 96 * Math.PI * 2; const r = islandR(Math.cos(a), Math.sin(a)); pts.push(new THREE.Vector2(Math.cos(a) * r, -Math.sin(a) * r)); }
  const sandTex = canvasTex(128, 128, (g) => { g.fillStyle = '#f1dca6'; g.fillRect(0, 0, 128, 128); for (let i = 0; i < 900; i++) { g.fillStyle = Math.random() < 0.5 ? '#e6cb8f' : '#f9ebc2'; g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2); } }, 40);
  const sand = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(pts)), new THREE.MeshLambertMaterial({ map: sandTex }));
  sand.rotation.x = -Math.PI / 2; scene.add(sand); pickGround.push(sand);
  const wet = []; for (let k = 0; k < 96; k++) { const a = k / 96 * Math.PI * 2; const r = islandR(Math.cos(a), Math.sin(a)) + 7; wet.push(new THREE.Vector2(Math.cos(a) * r, -Math.sin(a) * r)); }
  const ws = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(wet)), lam('#cdb57c')); ws.rotation.x = -Math.PI / 2; ws.position.y = -0.9; scene.add(ws);
}
const sea = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), new THREE.MeshLambertMaterial({ color: '#2fa8e0', transparent: true, opacity: 0.82, emissive: '#0b5a86', emissiveIntensity: 0.25 }));
sea.rotation.x = -Math.PI / 2; sea.position.y = -0.35; scene.add(sea); pickGround.push(sea);
// the town: a lawn with a road around it
const TOWN = { x0: -76, x1: 4, z0: -50, z1: 40 };
{
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(TOWN.x1 - TOWN.x0, TOWN.z1 - TOWN.z0), new THREE.MeshLambertMaterial({ map: canvasTex(64, 64, (g) => { g.fillStyle = '#7cc957'; g.fillRect(0, 0, 64, 64); for (let i = 0; i < 300; i++) { g.fillStyle = Math.random() < 0.5 ? '#6fbb4b' : '#8bd465'; g.fillRect(Math.random() * 64, Math.random() * 64, 2, 3); } }, 20), polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
  grass.rotation.x = -Math.PI / 2; grass.position.set((TOWN.x0 + TOWN.x1) / 2, 0.02, (TOWN.z0 + TOWN.z1) / 2); scene.add(grass); pickGround.push(grass);
  const road = lam('#5a5f6a'), dash = lam('#ffffff');
  const R = { x0: TOWN.x0 + 6, x1: TOWN.x1 - 6, z0: TOWN.z0 + 6, z1: TOWN.z1 - 6 }, w = 8;
  const strip = (cx, cz, sx, sz) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz), road); m.material.polygonOffset = true; m.material.polygonOffsetFactor = -2; m.material.polygonOffsetUnits = -4; m.rotation.x = -Math.PI / 2; m.position.set(cx, 0.04, cz); scene.add(m); pickGround.push(m); };
  strip((R.x0 + R.x1) / 2, R.z0, R.x1 - R.x0 + w, w); strip((R.x0 + R.x1) / 2, R.z1, R.x1 - R.x0 + w, w);
  strip(R.x0, (R.z0 + R.z1) / 2, w, R.z1 - R.z0 - w); strip(R.x1, (R.z0 + R.z1) / 2, w, R.z1 - R.z0 - w);
  const dg = new THREE.PlaneGeometry(2, 0.35); const n = 60; const im = new THREE.InstancedMesh(dg, dash, n); const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S1 = new THREE.Vector3(1, 1, 1); let c = 0;
  const put = (x, z, rot) => { if (c >= n) return; Q.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, rot)); V.set(x, 0.06, z); M.compose(V, Q, S1); im.setMatrixAt(c++, M); };
  for (let x = R.x0 + 4; x < R.x1 - 3; x += 5) { put(x, R.z0, 0); put(x, R.z1, 0); }
  for (let z = R.z0 + 4; z < R.z1 - 3; z += 5) { put(R.x0, z, Math.PI / 2); put(R.x1, z, Math.PI / 2); }
  im.count = c; scene.add(im);
  // little town houses to drive around
  const HOUSES = [[-56, -28, '#ff9aa2', '#c0392b'], [-30, -28, '#a0d8ef', '#2f6fd6'], [-56, 8, '#ffe08a', '#e67e22'], [-30, 8, '#b8e994', '#27ae60']];
  for (const [x, z, wall, roof] of HOUSES) {
    const o = new THREE.Group(); o.position.set(x, 0, z); scene.add(o);
    B(o, wall, 9, 5, 8, 0, 0, 0); const r = new THREE.Mesh(new THREE.ConeGeometry(7, 3.4, 4), lam(roof)); r.rotation.y = Math.PI / 4; r.position.y = 6.7; o.add(r);
    B(o, '#7a4a24', 1.6, 2.8, 0.2, 0, 0, 4.05); for (const sx of [-2.8, 2.8]) B(o, '#dff3ff', 1.6, 1.4, 0.2, sx, 2.2, 4.05);
    stat(x - 4.5, x + 4.5, z - 4, z + 4, 0, 8.4);
  }
  // fountain in the middle of town
  const f = new THREE.Group(); f.position.set(-43, 0, -10); scene.add(f);
  const fr = new THREE.Mesh(cylG(4, 4.3, 0.8, 24), lam('#d8d8e0')); fr.position.y = 0.4; f.add(fr);
  const fw = new THREE.Mesh(cylG(3.5, 3.5, 0.1, 24), new THREE.MeshLambertMaterial({ color: '#59c3f0', emissive: '#1b6f9a', emissiveIntensity: 0.4 })); fw.position.y = 0.75; f.add(fw);
  const fc = new THREE.Mesh(cylG(0.5, 0.7, 2.6, 12), lam('#d8d8e0')); fc.position.y = 1.3; f.add(fc);
  stat(-47, -39, -14, -6, 0, 0.8);
}
// the beach house (outside): pale blue, white trim, a porch, the sign
const HOUSE = { x: 62, z: -6 };
const DOOR_OUT = { x: HOUSE.x + 6.6, z: HOUSE.z };
{
  const o = new THREE.Group(); o.position.set(HOUSE.x, 0, HOUSE.z); scene.add(o);
  B(o, '#9fd3e6', 10, 5.6, 9, 0, 0.4, 0); B(o, '#f4f4f0', 12, 0.4, 11, 0, 0, 0);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(8.4, 3.6, 4), lam('#f27a6a')); roof.rotation.y = Math.PI / 4; roof.position.y = 7.8; roof.scale.set(1, 1, 0.92); o.add(roof);
  B(o, '#f7cf2a', 0.2, 3, 2, 5.02, 0.4, 0); for (const z of [-3, 3]) B(o, '#dff3ff', 0.2, 1.6, 1.8, 5.02, 2.4, z);
  for (let k = 0; k < 3; k++) B(o, '#f4f4f0', 0.7, 0.13 * (k + 1), 3, 6.4 + k * 0.7 - 1.4, 0, 0).position.y = 0;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 1), new THREE.MeshBasicMaterial({ map: canvasTex(512, 80, (g) => { g.fillStyle = '#2f6fd6'; g.fillRect(0, 0, 512, 80); g.fillStyle = '#fff'; let fs = 54; g.font = `800 ${fs}px "Baloo 2", Arial`; while (g.measureText('REDDY’S BEACH HOUSE').width > 480) { fs -= 2; g.font = `800 ${fs}px "Baloo 2", Arial`; } g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('REDDY’S BEACH HOUSE', 256, 44); }) }));
  sign.position.set(5.05, 5.1, 0); sign.rotation.y = Math.PI / 2; o.add(sign);
  stat(HOUSE.x - 6, HOUSE.x + 6, HOUSE.z - 5.5, HOUSE.z + 5.5, 0, 0.4);
  stat(HOUSE.x - 5, HOUSE.x + 5, HOUSE.z - 4.5, HOUSE.z - 1.1, 0.4, 9); stat(HOUSE.x - 5, HOUSE.x + 5, HOUSE.z + 1.1, HOUSE.z + 4.5, 0.4, 9);
  stat(HOUSE.x - 5, HOUSE.x + 4.6, HOUSE.z - 1.1, HOUSE.z + 1.1, 0.4, 9);
}
// the pier, out into the sea
{
  const o = new THREE.Group(); scene.add(o);
  for (let x = 96; x < 150; x += 2) { B(o, x % 4 ? '#b98a5b' : '#a87a4c', 2, 0.25, 5, x + 1, 0.2, 24); }
  for (let x = 98; x < 150; x += 6) for (const z of [21.7, 26.3]) B(o, '#8a6240', 0.4, 2.6, 0.4, x, -2, z);
  stat(96, 150, 21.5, 26.5, 0.2, 0.45);
}
// palm trees, umbrellas, a sandcastle
function palm(parent, s = 1) {
  const o = new THREE.Group(); o.scale.setScalar(s); parent.add(o); let x = 0, y = 0;
  for (let k = 0; k < 6; k++) { const m = new THREE.Mesh(cylG(0.26 - k * 0.02, 0.3 - k * 0.02, 1.2, 7), lam(k % 2 ? '#9a7550' : '#a98460')); m.position.set(x, y + 0.6, 0); m.rotation.z = -0.06 * k; o.add(m); x += 0.08 * k; y += 1.15; }
  for (let k = 0; k < 6; k++) { const l = new THREE.Mesh(boxG(3, 0.08, 0.8), lam('#2f9a4a')); const a = k / 6 * Math.PI * 2; l.position.set(x + Math.cos(a) * 1.2, y - 0.2, Math.sin(a) * 1.2); l.rotation.y = -a; l.rotation.z = -0.4; o.add(l); }
  const n = new THREE.Mesh(sphG(0.28, 8), lam('#6b4a2a')); n.position.set(x, y - 0.3, 0.2); o.add(n);
  return o;
}
for (const [x, z, s] of [[80, -30, 1.1], [86, 14, 1.3], [74, 34, 1], [50, -40, 1.2], [92, -12, 0.9], [40, 52, 1.1], [62, 60, 1], [20, -70, 1.2], [-10, 70, 1], [-60, 66, 1.2], [-88, 30, 1], [-90, -20, 1.1], [-40, -78, 1.2], [30, 80, 0.9], [88, 44, 1]]) { const p = palm(scene, s); p.position.set(x, 0, z); p.rotation.y = rnd(0, 6); }
{
  const umb = ['#e53935', '#f7cf2a', '#1e63d6', '#2fae4a'];
  [[90, -26], [84, 30], [70, 46], [76, -46]].forEach(([x, z], i) => { const o = new THREE.Group(); o.position.set(x, 0, z); scene.add(o); B(o, '#f4f4f0', 0.12, 3.2, 0.12, 0, 0, 0); const c = new THREE.Mesh(new THREE.ConeGeometry(2.4, 0.9, 12), lam(umb[i])); c.position.y = 3.3; o.add(c); B(o, umb[(i + 1) % 4], 1.4, 0.05, 2.6, 1.4, 0.02, 0.6); });
  const o = new THREE.Group(); o.position.set(88, 0, 2); scene.add(o);
  for (const [x, z, s] of [[0, 0, 1.6], [1.5, 0.4, 0.9], [-1.3, 0.5, 1], [0.2, -1.4, 0.9]]) { B(o, '#e4c98e', s, s * 1.3, s, x, 0, z); B(o, '#e4c98e', s * 0.35, s * 0.5, s * 0.35, x, s * 1.3, z); }
  stat(85.5, 90.5, -0.5, 3.5, 0, 2.1);
}

/* ---------------- the beach house inside ---------------- */
const DOOR_IN = { x: IX, z: ROOM.z1 - 1.5 };
const ballPit = { x0: IX + 3, x1: IX + 12, z0: IZ - 9, z1: IZ - 1, balls: null, pos: [], vel: [] };
const pianoTiles = []; let discoT = 0; const roomGuys = [];
const discoBall = new THREE.Mesh(sphG(1, 14), new THREE.MeshLambertMaterial({ color: '#dfe6ee', emissive: '#555', flatShading: true }));
const roomLights = [];
{
  const o = new THREE.Group(); scene.add(o);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.x1 - ROOM.x0, ROOM.z1 - ROOM.z0), new THREE.MeshLambertMaterial({ map: canvasTex(64, 64, (g) => { g.fillStyle = '#d9b07a'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#c99c64'; for (let y = 0; y < 64; y += 8) g.fillRect(0, y, 64, 1); for (let i = 0; i < 12; i++) g.fillRect(Math.random() * 64, (Math.random() * 8 | 0) * 8, 1, 8); }, 8) }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(IX, 0.01, IZ); o.add(floor); pickGround.push(floor);
  const wallM = lam('#bfe6f5');
  const wall = (x0, x1, z0, z1, h = 6) => { B(o, wallM, x1 - x0, h, z1 - z0, (x0 + x1) / 2, 0, (z0 + z1) / 2); stat(x0, x1, z0, z1, 0, h + 4); };
  wall(ROOM.x0 - 1, ROOM.x1 + 1, ROOM.z0 - 1, ROOM.z0); wall(ROOM.x0 - 1, ROOM.x0, ROOM.z0, ROOM.z1); wall(ROOM.x1, ROOM.x1 + 1, ROOM.z0, ROOM.z1);
  wall(ROOM.x0 - 1, IX - 1.8, ROOM.z1, ROOM.z1 + 1, 2.4); wall(IX + 1.8, ROOM.x1 + 1, ROOM.z1, ROOM.z1 + 1, 2.4);
  B(o, '#f7cf2a', 3.6, 0.3, 0.3, IX, 3.1, ROOM.z1 + 0.5);
  // trampolines
  for (const [x, z, c] of [[IX - 1, IZ - 5, '#3b8bff'], [IX - 5, IZ - 6, '#ff5fb4']]) {
    const t = new THREE.Group(); t.position.set(x, 0, z); o.add(t);
    const fr = new THREE.Mesh(cylG(1.8, 1.8, 0.5, 20), lam('#333')); fr.position.y = 0.25; t.add(fr);
    const mat = new THREE.Mesh(cylG(1.6, 1.6, 0.06, 20), lam(c)); mat.position.y = 0.52; t.add(mat);
    stat(x - 1.7, x + 1.7, z - 1.7, z + 1.7, 0, 0.55, { bounce: 1 });
  }
  // ball pit: low walls and a lot of balls
  const bw = lam('#ff8a2b');
  B(o, bw, ballPit.x1 - ballPit.x0, 0.9, 0.4, (ballPit.x0 + ballPit.x1) / 2, 0, ballPit.z0); stat(ballPit.x0, ballPit.x1, ballPit.z0 - 0.2, ballPit.z0 + 0.2, 0, 0.9);
  B(o, bw, ballPit.x1 - ballPit.x0, 0.9, 0.4, (ballPit.x0 + ballPit.x1) / 2, 0, ballPit.z1); stat(ballPit.x0, ballPit.x1, ballPit.z1 - 0.2, ballPit.z1 + 0.2, 0, 0.9);
  B(o, bw, 0.4, 0.9, ballPit.z1 - ballPit.z0, ballPit.x0, 0, (ballPit.z0 + ballPit.z1) / 2); stat(ballPit.x0 - 0.2, ballPit.x0 + 0.2, ballPit.z0, ballPit.z1, 0, 0.9);
  B(o, bw, 0.4, 0.9, ballPit.z1 - ballPit.z0, ballPit.x1, 0, (ballPit.z0 + ballPit.z1) / 2); stat(ballPit.x1 - 0.2, ballPit.x1 + 0.2, ballPit.z0, ballPit.z1, 0, 0.9);
  const NB = TOUCH ? 140 : 220; const im = new THREE.InstancedMesh(sphG(0.33, 8), new THREE.MeshLambertMaterial(), NB);
  for (let k = 0; k < NB; k++) { im.setColorAt(k, new THREE.Color(COLORS[k % 7])); ballPit.pos.push(new THREE.Vector3(rnd(ballPit.x0 + 0.5, ballPit.x1 - 0.3), 0.3 + (k % 3) * 0.28, rnd(ballPit.z0 + 0.5, ballPit.z1 - 0.5))); ballPit.vel.push(new THREE.Vector3()); }
  ballPit.balls = im; o.add(im);
  // the loft with stairs up and a slide down
  B(o, '#c98a4b', 6, 0.4, 7, IX - 9, 2.6, IZ + 6); stat(IX - 12, IX - 6, IZ + 2.5, IZ + 9.5, 2.6, 3);
  for (const x of [IX - 11.8, IX - 6.2]) B(o, '#8a5a2b', 0.3, 2.6, 0.3, x, 0, IZ + 2.8);
  for (let k = 0; k < 6; k++) { const x0 = IX - 6 + k * -0 + (5 - k) * 0.8; B(o, '#c98a4b', 0.8, 0.5 * (k + 1), 2, IX - 1.6 - k * 0.8 - 0.4, 0, IZ + 7.6); stat(IX - 1.6 - (k + 1) * 0.8, IX - 1.6 - k * 0.8, IZ + 6.6, IZ + 8.6, 0, 0.5 * (k + 1)); void x0; }
  stat(IX - 6.4, IX - 6, IZ + 6.6, IZ + 8.6, 0, 3);
  const slide = new THREE.Mesh(new THREE.PlaneGeometry(3, Math.hypot(9, 3)), new THREE.MeshLambertMaterial({ color: '#ff3b52', side: THREE.DoubleSide }));
  slide.position.set(IX - 9.5, 1.5, IZ - 2); slide.rotation.x = -Math.PI / 2 - Math.atan2(3, 9); o.add(slide);
  for (const x of [IX - 11, IX - 8]) { const r = new THREE.Mesh(boxG(0.2, 0.6, Math.hypot(9, 3)), lam('#f7cf2a')); r.position.set(x, 1.8, IZ - 2); r.rotation.x = -Math.atan2(3, 9); o.add(r); }
  stat(IX - 11, IX - 8, IZ - 6.5, IZ + 2.5, -1, 0, { slope: 'z', ya: 0.02, yb: 3, slide: 1 });
  // piano floor: step on a tile to play it
  const NOTES = [261.6, 293.7, 329.6, 392, 440, 523.3, 587.3, 659.3];
  NOTES.forEach((f, k) => { const x0 = IX - 2 + k * 1.6; const m = B(o, new THREE.MeshLambertMaterial({ color: COLORS[k % 7], emissive: '#000' }), 1.5, 0.08, 2.6, x0 + 0.75, 0.01, IZ + 7.6); pianoTiles.push({ x0, x1: x0 + 1.5, z0: IZ + 6.3, z1: IZ + 8.9, f, m, on: false }); });
  // disco button
  const btn = new THREE.Mesh(cylG(0.9, 1, 0.35, 20), new THREE.MeshLambertMaterial({ color: '#e53935', emissive: '#400' })); btn.position.set(IX + 11, 0.18, IZ + 7.5); o.add(btn); ballPit.btn = btn;
  discoBall.position.set(IX + 2, 5.2, IZ); o.add(discoBall);
  // disco spots: coloured pools on the floor that only show during the party
  const spotG = new THREE.CircleGeometry(1.6, 18);
  for (let k = 0; k < 6; k++) { const m = new THREE.Mesh(spotG, new THREE.MeshBasicMaterial({ color: COLORS[k], transparent: true, opacity: 0.55, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.set(IX - 8 + k * 3.2, 0.05, IZ + (k % 2 ? 3 : -3)); m.visible = false; o.add(m); roomLights.push(m); }
  // a couch and a rug
  B(o, '#2f6fd6', 4, 0.9, 1.6, IX + 6, 0, IZ + 3); B(o, '#2f6fd6', 4, 1.6, 0.5, IX + 6, 0, IZ + 3.9); stat(IX + 4, IX + 8, IZ + 2.2, IZ + 4.2, 0, 0.9, { bounce: 0.6 });
  const rug = new THREE.Mesh(new THREE.CircleGeometry(3, 24), lam('#ffd1ea')); rug.rotation.x = -Math.PI / 2; rug.position.set(IX - 3, 0.03, IZ + 1); o.add(rug);
}

/* ---------------- a silly guy (ported from the &Associates game's Reddy mode) ---------------- */
const faceTex = canvasTex(64, 64, (g) => { g.clearRect(0, 0, 64, 64); for (const x of [20, 44]) { g.fillStyle = '#fff'; g.beginPath(); g.ellipse(x, 24, 9, 12, 0, 0, 7); g.fill(); g.fillStyle = '#1b1b2e'; g.beginPath(); g.arc(x + 1, 27, 5, 0, 7); g.fill(); } g.fillStyle = '#5a0f1c'; g.beginPath(); g.ellipse(32, 46, 9, 6, 0, 0, 7); g.fill(); });
const faceMat = new THREE.MeshBasicMaterial({ map: faceTex, transparent: true });
const faceGeo = new THREE.PlaneGeometry(0.7, 0.7);
function makeSilly(color) {
  const g = new THREE.Group(); const fab = lam(color);
  const base = new THREE.Mesh(boxG(1, 0.5, 1), lam('#3d4466')); base.position.y = 0.25; g.add(base);
  const segs = []; let parent = g; const N = 5, h = 0.72;
  for (let k = 0; k < N; k++) { const sg = new THREE.Group(); sg.position.y = k === 0 ? 0.5 : h; parent.add(sg); const m = new THREE.Mesh(cylG(0.34, 0.38, h, 8), k % 2 ? fab : fab); m.position.y = h / 2; sg.add(m); segs.push(sg); parent = sg; }
  const top = segs[N - 1];
  const face = new THREE.Mesh(faceGeo, faceMat); face.position.set(0, 0.42, 0.37); top.add(face);
  const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.5, 6), lam('#f7cf2a')); tuft.position.y = h + 0.2; top.add(tuft);
  const arms = [];
  for (const sd of [-1, 1]) { const ag = new THREE.Group(); ag.position.set(sd * 0.32, h * 0.6, 0); segs[N - 2].add(ag); const chain = []; const a2 = new THREE.Group(); ag.add(a2); const m = new THREE.Mesh(cylG(0.1, 0.13, 1.1, 6), fab); m.rotation.z = Math.PI / 2; m.position.x = sd * 0.55; a2.add(m); chain.push(a2); arms.push({ sd, chain }); }
  return { g, segs, arms, p: Math.random() * 10, flop: 0 };
}
function animSilly(sg, dt, dance, beat, idx) {
  sg.p += dt; const down = sg.flop > 0 ? Math.sin(Math.min(1, (1.6 - sg.flop) / 0.5) * Math.PI * 0.5) : 0; sg.flop = Math.max(0, sg.flop - dt);
  if (dance) {
    const ph = beat * Math.PI * 2;
    sg.segs.forEach((s, k) => { const f = k / sg.segs.length; s.rotation.z = Math.sin(ph / 2 + idx) * 0.22 * f; s.rotation.x = 0; });
    for (const a of sg.arms) a.chain.forEach((c, k) => { c.rotation.z = (Math.sin(ph) > 0 ? 1.1 : -0.3) * a.sd * (k === 0 ? 1 : 0.4); });
    return;
  }
  sg.segs.forEach((s, k) => { const f = k / sg.segs.length; s.rotation.z = Math.sin(sg.p * 4.3 - k * 0.7) * (0.04 + f * 0.1) + down * 0.42; s.rotation.x = Math.sin(sg.p * 3.1 - k * 0.5) * 0.06 * f + down * 0.12; });
  for (const a of sg.arms) a.chain.forEach((c, k) => { c.rotation.z = Math.sin(sg.p * 7 + k + a.sd) * 0.9 * a.sd - down * 0.8 * a.sd; c.rotation.y = Math.sin(sg.p * 5 + k) * 0.4; });
}
for (const [x, z, c] of [[IX - 11, IZ - 8, '#e53935'], [IX + 11.5, IZ + 1, '#2fae4a'], [IX - 11.5, IZ - 1, '#1e63d6']]) { const s = makeSilly(c); s.g.position.set(x, 0, z); s.g.rotation.y = x < IX ? Math.PI / 2 : -Math.PI / 2; scene.add(s.g); roomGuys.push(s); }

/* ---------------- bake the fixed scenery: one mesh per material, outside and inside ---------------- */
// Palms, houses, the pier, umbrellas and the beach house's insides are hundreds of little meshes.
// They never move, so they're merged into a few big ones (a phone draws a few big things far faster).
const outGroup = new THREE.Group(), inGroup = new THREE.Group();
const insideKeep = [ballPit.balls, ballPit.btn, discoBall, ...pianoTiles.map((t) => t.m), ...roomLights, ...roomGuys.map((g) => g.g)];
{
  const keep = new Set([sea, ...pickGround, ...insideKeep]);
  scene.updateMatrixWorld(true);
  const outs = [], ins = [];
  scene.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh) return;
    for (let q = o; q; q = q.parent) if (keep.has(q)) return;
    const wp = new THREE.Vector3(); o.getWorldPosition(wp); (wp.z > 400 ? ins : outs).push(o);
  });
  const victims = [...outs, ...ins];
  for (const m of mergeInto(outs, null)) outGroup.add(m);
  for (const m of mergeInto(ins, null)) inGroup.add(m);
  for (const v of victims) v.parent.remove(v);
  // drop the now-empty groups
  for (const c of [...scene.children]) { if (c.isGroup && !c.children.length) scene.remove(c); }
  scene.add(outGroup, inGroup);
}
let showingInside = null;
const insideFloor = pickGround[pickGround.length - 1];
function showSide(inside) {
  showingInside = inside;
  inGroup.visible = inside; insideFloor.visible = inside; for (const o of insideKeep) if (o !== roomLights[0] && !roomLights.includes(o)) o.visible = inside;
  outGroup.visible = !inside; for (const g of pickGround) if (g !== insideFloor) g.visible = !inside;
}
showSide(false);

/* ---------------- Reddy (the player): little, with a big R on his shirt ---------------- */
function makeKid() {
  const root = new THREE.Group(); const body = new THREE.Group(); root.add(body);
  const shirt = lam('#2f6fd6'), skin = lam('#f2cfb3');
  const torso = new THREE.Mesh(boxG(0.62, 0.62, 0.38), shirt); torso.position.y = 0.95; body.add(torso);
  const R = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), new THREE.MeshBasicMaterial({ map: canvasTex(64, 64, (g) => { g.fillStyle = '#fff'; g.font = '800 58px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('R', 32, 36); }), transparent: true })); R.position.set(0, 0.97, 0.195); body.add(R);
  const head = new THREE.Mesh(sphG(0.34, 14), skin); head.position.y = 1.58; body.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.36, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), lam('#7a5232')); hair.position.y = 1.62; hair.rotation.x = -0.25; body.add(hair);
  for (const x of [-0.12, 0.12]) { const e = new THREE.Mesh(sphG(0.05, 6), lam('#1b1b2e')); e.position.set(x, 1.6, 0.31); body.add(e); }
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.022, 4, 10, Math.PI), lam('#7a2a20')); smile.rotation.z = Math.PI; smile.position.set(0, 1.47, 0.31); body.add(smile);
  const legs = [], arms = [];
  for (const sd of [-1, 1]) {
    const l = new THREE.Group(); l.position.set(sd * 0.16, 0.64, 0); body.add(l); const lm = new THREE.Mesh(boxG(0.22, 0.6, 0.24), lam('#3d5a80')); lm.position.y = -0.3; l.add(lm); const sh = new THREE.Mesh(boxG(0.24, 0.12, 0.32), lam('#f4f4f0')); sh.position.set(0, -0.62, 0.04); l.add(sh); legs.push(l);
    const a = new THREE.Group(); a.position.set(sd * 0.4, 1.2, 0); body.add(a); const am = new THREE.Mesh(boxG(0.16, 0.52, 0.18), shirt); am.position.y = -0.24; a.add(am); const hd = new THREE.Mesh(sphG(0.1, 6), skin); hd.position.y = -0.54; a.add(hd); arms.push(a);
  }
  scene.add(root);
  return { root, body, legs, arms, ph: 0 };
}
const kid = makeKid();
const P = { x: 84, y: 0, z: -4, vy: 0, yaw: -Math.PI / 2, grounded: true, inCar: null, water: false, lastTile: -1 };
const kidShadow = shadowMesh(1.4);

/* ---------------- cars ---------------- */
const CAR_TYPES = [
  { name: 'buggy', len: 3.6, wid: 1.9, h: 0.7, wheel: 0.45, cab: 'open', max: 22 },
  { name: 'jeep', len: 3.8, wid: 2.0, h: 0.9, wheel: 0.55, cab: 'roll', max: 20 },
  { name: 'icecream', len: 4.6, wid: 2.1, h: 1.0, wheel: 0.5, cab: 'truck', max: 16 },
  { name: 'monster', len: 3.8, wid: 2.2, h: 0.9, wheel: 1.0, cab: 'roll', max: 18, lift: 0.9 },
  { name: 'kart', len: 2.4, wid: 1.5, h: 0.35, wheel: 0.3, cab: 'kart', max: 25 }
];
const cars = [];
const wheelG = new THREE.CylinderGeometry(1, 1, 1, 12);
const tireMat = new THREE.MeshLambertMaterial({ map: canvasTex(32, 32, (g) => { g.fillStyle = '#222'; g.fillRect(0, 0, 32, 32); g.fillStyle = '#555'; g.fillRect(0, 0, 32, 6); g.fillRect(0, 16, 32, 6); }) });
function makeCar(type, color, x, z, yaw) {
  const T = CAR_TYPES.find((t) => t.name === type) || CAR_TYPES[0];
  const root = new THREE.Group(); const body = new THREE.Group(); root.add(body);
  const lift = (T.lift || 0) + T.wheel * 0.9;
  B(body, color, T.wid, T.h, T.len, 0, lift, 0);
  if (T.cab === 'roll') { for (const sx of [-1, 1]) B(body, '#222', 0.12, 1.1, 0.12, sx * (T.wid / 2 - 0.1), lift + T.h, -0.3); B(body, '#222', T.wid, 0.12, 0.12, 0, lift + T.h + 1.05, -0.3); B(body, '#bfe6f5', T.wid - 0.3, 0.6, 0.08, 0, lift + T.h, 0.5); }
  if (T.cab === 'open') { B(body, '#bfe6f5', T.wid - 0.3, 0.5, 0.08, 0, lift + T.h, 0.4); B(body, '#333', T.wid - 0.4, 0.5, 0.5, 0, lift + T.h - 0.1, -0.7); }
  if (T.cab === 'truck') { B(body, '#ffffff', T.wid, 1.8, T.len * 0.62, 0, lift + T.h, -T.len * 0.18); B(body, '#ff8fcf', T.wid + 0.02, 0.35, T.len * 0.62, 0, lift + T.h + 0.6, -T.len * 0.18); B(body, '#bfe6f5', T.wid - 0.3, 0.7, 0.08, 0, lift + T.h, T.len * 0.3); const cone = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.9, 10), lam('#e8b06a')); cone.rotation.x = Math.PI; cone.position.set(0, lift + T.h + 2.3, -T.len * 0.18); body.add(cone); const sc = new THREE.Mesh(sphG(0.42, 10), lam('#ff8fcf')); sc.position.set(0, lift + T.h + 2.85, -T.len * 0.18); body.add(sc); }
  if (T.cab === 'kart') { B(body, '#222', 0.5, 0.5, 0.4, 0, lift + T.h, -0.4); const sw = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.04, 6, 12), lam('#222')); sw.position.set(0, lift + T.h + 0.4, 0.4); sw.rotation.x = -0.6; body.add(sw); }
  for (const sx of [-1, 1]) B(body, '#fff7c2', 0.3, 0.18, 0.06, sx * (T.wid / 2 - 0.35), lift + T.h * 0.55, T.len / 2);
  const wheels = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const w = new THREE.Mesh(wheelG, tireMat); w.scale.set(T.wheel, 0.4 + T.wheel * 0.3, T.wheel); w.rotation.z = Math.PI / 2;
    const wg = new THREE.Group(); wg.position.set(sx * (T.wid / 2 + 0.12), T.wheel, sz * (T.len / 2 - T.wheel * 0.7)); wg.add(w); root.add(wg); wheels.push({ wg, w, front: sz > 0 });
  }
  mergeGroup(body);
  root.position.set(x, 0, z); root.rotation.y = yaw; scene.add(root);
  const car = { T, type, color, root, body, wheels, x, z, y: groundTop(x, z), vy: 0, yaw, speed: 0, steer: 0, roll: 0, shadow: shadowMesh(Math.max(T.len, T.wid) * 1.3) };
  root.traverse((o) => { o.userData.car = car; });
  cars.push(car); return car;
}

/* ---------------- placed things: silly guys, blocks, ramps, trampolines, palms ---------------- */
const placed = new THREE.Group(); scene.add(placed);
const sillies = [];                               // { s, cell } for animation and booping
const blockMats = new Map();
const studTex = canvasTex(64, 32, (g) => { g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 32); g.fillStyle = 'rgba(0,0,0,.07)'; g.fillRect(0, 30, 32, 2); for (const [x, y] of [[40, 8], [56, 8], [40, 24], [56, 24]]) { g.fillStyle = 'rgba(0,0,0,.08)'; g.beginPath(); g.arc(x, y, 5.5, 0, 7); g.fill(); g.fillStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.arc(x - 1, y - 1, 3, 0, 7); g.fill(); } });
const blockGeo = (() => { const g = new THREE.BoxGeometry(G, 2, G); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) { const face = Math.floor(i / 4); uv.setX(i, uv.getX(i) * 0.5 + (face === 2 ? 0.5 : 0)); } return g; })();
function blockMat(c) { if (!blockMats.has(c)) blockMats.set(c, new THREE.MeshLambertMaterial({ color: c, map: studTex })); return blockMats.get(c); }
const rampGeo = (() => { // a wedge in a 2 x 2 cell, rising toward +z from 0 to 2
  const v = [-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1, -1, 2, 1, 1, 2, 1];
  const f = [0, 2, 1, 0, 3, 2, 3, 4, 5, 3, 5, 2, 0, 4, 3, 1, 2, 5, 0, 1, 5, 0, 5, 4];
  const pos = []; for (const i of f) pos.push(v[i * 3], v[i * 3 + 1], v[i * 3 + 2]);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); return g;
})();
const rampStripe = canvasTex(32, 32, (g) => { g.fillStyle = '#fff'; g.fillRect(0, 0, 32, 32); g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(0, 0, 32, 4); g.fillRect(0, 16, 32, 4); });
function makeItemMesh(it) {
  if (it.t === 'block') return new THREE.Mesh(blockGeo, blockMat(it.c));
  if (it.t === 'ramp') { const m = new THREE.Mesh(rampGeo, new THREE.MeshLambertMaterial({ color: it.c, flatShading: true })); return m; }
  if (it.t === 'tramp') { const g = new THREE.Group(); const fr = new THREE.Mesh(cylG(0.95, 0.95, 0.5, 16), lam('#333')); fr.position.y = 0.25; g.add(fr); const mat = new THREE.Mesh(cylG(0.85, 0.85, 0.06, 16), lam(it.c)); mat.position.y = 0.53; g.add(mat); return mergeGroup(g); }
  if (it.t === 'palm') { const g = new THREE.Group(); palm(g, 0.8); return mergeGroup(g); }
  if (it.t === 'silly') { const s = makeSilly(it.c); s.g.scale.setScalar(0.85); it.s = s; return s.g; }
  return new THREE.Group();
}
function layoutCell(i, j) {
  const cell = grid.get(key(i, j)); if (!cell) return;
  const cx = (i + 0.5) * G, cz = (j + 0.5) * G; let base = groundTop(cx, cz);
  for (const it of cell.items) {
    it.mesh.position.set(cx, base, cz);
    if (it.t === 'block') { it.mesh.position.y = base + 1; base += 2; }
    else if (it.t === 'tramp') base += 0.6;
    else if (it.t === 'ramp') { it.mesh.rotation.y = it.r * Math.PI / 2; }
    else it.mesh.rotation.y = it.ry || 0;
  }
}
function cellTop(i, j) { const cell = grid.get(key(i, j)); let base = groundTop((i + 0.5) * G, (j + 0.5) * G); if (cell) for (const it of cell.items) { if (it.t === 'block') base += 2; else if (it.t === 'tramp') base += 0.6; else if (it.t === 'ramp') base += 2; } return base; }
let placedCount = 0; const MAX_PLACED = TOUCH ? 260 : 420;
function addItem(i, j, t, c, r = 0, ry = 0, quiet = false) {
  if (placedCount >= MAX_PLACED) { toast('So many things!'); return false; }
  const k = key(i, j); let cell = grid.get(k); if (!cell) { cell = { i, j, items: [] }; grid.set(k, cell); }
  const top = cell.items[cell.items.length - 1];
  if (top && top.t === 'ramp') return false;                         // nothing goes on a ramp
  if (TOPPER[t] && top && TOPPER[top.t]) return false;               // one silly guy or palm per spot
  if (cell.items.length >= 9) return false;
  const it = { t, c, r, ry }; it.mesh = makeItemMesh(it); it.mesh.traverse((o) => { o.userData.cell = cell; o.userData.item = it; });
  placed.add(it.mesh);
  if (SOLID[t] && top && TOPPER[top.t]) cell.items.splice(cell.items.length - 1, 0, it); else cell.items.push(it);
  if (it.s) sillies.push({ s: it.s, it, cell });
  placedCount++; layoutCell(i, j); if (!quiet) save();
  return true;
}
function removeTop(cell) {
  const it = cell.items.pop(); if (!it) return false;
  placed.remove(it.mesh); if (it.s) { const n = sillies.findIndex((q) => q.it === it); if (n >= 0) sillies.splice(n, 1); }
  placedCount--; if (!cell.items.length) grid.delete(key(cell.i, cell.j)); else layoutCell(cell.i, cell.j); save(); return true;
}

/* ---------------- beach balls you can kick ---------------- */
const balls = [];
const ballTex = canvasTex(64, 32, (g) => { const c = ['#e53935', '#f4f4f0', '#1e63d6', '#f4f4f0', '#f7cf2a', '#f4f4f0', '#2fae4a', '#f4f4f0']; for (let k = 0; k < 8; k++) { g.fillStyle = c[k]; g.fillRect(k * 8, 0, 8, 32); } });
function addBall(x, z, y) { if (balls.length >= 14) { const b = balls.shift(); scene.remove(b.m); scene.remove(b.sh); } const m = new THREE.Mesh(sphG(0.7, 16), new THREE.MeshLambertMaterial({ map: ballTex })); scene.add(m); const b = { m, x, z, y: y ?? groundTop(x, z) + 3, vx: 0, vz: 0, vy: 0, sh: shadowMesh(1.6) }; m.userData.ball = b; balls.push(b); return b; }

/* ---------------- save and load ---------------- */
const SAVE_KEY = 'sgt-world-v1';
let saveT = 0;
function save() { saveT = 1; }
function doSave() {
  const items = []; for (const cell of grid.values()) items.push([cell.i, cell.j, cell.items.map((it) => [it.t, it.c, it.r || 0, +(it.ry || 0).toFixed(2)])]);
  const cs = cars.map((c) => [c.type, c.color, +c.x.toFixed(1), +c.z.toFixed(1), +c.yaw.toFixed(2)]);
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ items, cars: cs, balls: balls.length })); } catch (e) {}
}
function defaultWorld() {
  // a row of silly guys by the beach house, one of every color (like Reddy mode)
  COLORS.slice(0, 7).forEach((c, k) => addItem(Math.floor(70 / G) + 1, Math.floor((-20 + k * 3) / G), 'silly', c, 0, -Math.PI / 2, true));
  // a jump on the beach: a ramp, a gap, a landing ramp
  for (const j of [10, 11]) addItem(20, j, 'ramp', '#f7cf2a', 1, 0, true);                      // a kicker: drive off it and fly
  for (const j of [-14, -13]) { addItem(18, j, 'ramp', '#2fae4a', 1, 0, true); for (let i = 19; i < 23; i++) addItem(i, j, 'block', '#ff8a2b', 0, 0, true); } // a ramp up onto a long platform
  // a little tower and trampolines in town
  for (let k = 0; k < 3; k++) addItem(-10, -2, 'block', COLORS[k], 0, 0, true);
  addItem(-10, -2, 'silly', '#ff5fb4', 0, 0, true);
  for (const [i, j] of [[10, 10], [11, 10], [10, 11]]) addItem(i, j, 'tramp', '#3b8bff', 0, 0, true);
  // a ramp on the town road
  addItem(-20, 17, 'ramp', '#e53935', 1, 0, true); addItem(-20, 18, 'ramp', '#e53935', 1, 0, true);
  makeCar('buggy', '#e53935', 70, 10, Math.PI / 2); makeCar('jeep', '#f7cf2a', 30, -16, 0); makeCar('icecream', '#ffffff', -24, 0, Math.PI);
  makeCar('monster', '#2fae4a', 34, 34, -Math.PI / 2); makeCar('kart', '#1e63d6', -10, -45, Math.PI / 2);
  addBall(82, 8); addBall(-40, 16); addBall(IX + 2, IZ + 2, 2);
}
function load() {
  let d = null; try { d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) {}
  if (!d) { defaultWorld(); doSave(); return; }
  for (const [i, j, its] of d.items || []) for (const [t, c, r, ry] of its) addItem(i, j, t, c, r, ry, true);
  for (const [t, c, x, z, yaw] of d.cars || []) makeCar(t, c, x, z, yaw);
  for (let k = 0; k < (d.balls || 0); k++) addBall(rnd(60, 90), rnd(-30, 30));
}
load(); saveT = 0;

/* ---------------- sound and music ---------------- */
let ac = null, musicOn = true, master = null;
try { musicOn = localStorage.getItem('sgt-music') !== '0'; } catch (e) {}
function audio() { try { if (!ac) { ac = new (window.AudioContext || window.webkitAudioContext)(); master = ac.createGain(); master.gain.value = 0.9; master.connect(ac.destination); } if (ac.state === 'suspended') ac.resume(); } catch (e) {} }
function tone(f1, f2, dur, type = 'sine', vol = 0.2, delay = 0) {
  if (!ac) return; const t0 = ac.currentTime + delay; const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f1, t0); o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(vol, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(master); o.start(t0); o.stop(t0 + dur + 0.05);
}
let noiseBuf = null;
function noise(dur, vol, type, freq, delay = 0) {
  if (!ac) return; if (!noiseBuf) { noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const t0 = ac.currentTime + delay; const s = ac.createBufferSource(); s.buffer = noiseBuf; const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq;
  const g = ac.createGain(); g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); s.connect(f).connect(g).connect(master); s.start(t0); s.stop(t0 + dur + 0.05);
}
const sfx = {
  jump() { tone(300, 620, 0.16, 'triangle', 0.15); },
  boing() { tone(140, 560, 0.3, 'sine', 0.25); },
  land() { tone(180, 80, 0.1, 'sine', 0.15); },
  place() { tone(520, 780, 0.1, 'triangle', 0.18); tone(780, 1040, 0.08, 'triangle', 0.1, 0.06); },
  erase() { tone(600, 200, 0.15, 'square', 0.06); },
  boop() { tone(880, 440, 0.14, 'sine', 0.18); },
  splash() { noise(0.4, 0.25, 'lowpass', 1200); },
  door() { tone(400, 600, 0.12, 'triangle', 0.15); tone(600, 900, 0.12, 'triangle', 0.12, 0.1); },
  horn(type) { if (type === 'icecream') [659, 784, 880, 784, 659, 523].forEach((f, k) => tone(f, f, 0.18, 'square', 0.06, k * 0.16)); else { tone(392, 392, 0.3, 'square', 0.07); tone(494, 494, 0.3, 'square', 0.05); } },
  kick() { tone(220, 110, 0.12, 'sine', 0.2); noise(0.06, 0.15, 'bandpass', 900); },
  note(f) { tone(f, f, 0.5, 'triangle', 0.18); tone(f * 2, f * 2, 0.25, 'sine', 0.05); }
};
// engine hum while driving
let engine = null;
function engineSet(on, spd) {
  if (!ac) return;
  if (on && !engine) { const o = ac.createOscillator(), o2 = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter(); o.type = 'sawtooth'; o2.type = 'square'; f.type = 'lowpass'; f.frequency.value = 500; g.gain.value = 0; o.connect(f); o2.connect(f); f.connect(g).connect(master); o.start(); o2.start(); engine = { o, o2, g }; }
  if (engine) { const t = ac.currentTime; engine.g.gain.setTargetAtTime(on ? 0.035 : 0, t, 0.1); engine.o.frequency.setTargetAtTime(50 + Math.abs(spd) * 5, t, 0.1); engine.o2.frequency.setTargetAtTime(25 + Math.abs(spd) * 2.5, t, 0.1); }
}
// a chill beach loop: soft beat, warm chords, a little ukulele
const MU = { next: 0, step: 0 };
const MCH = [[261.6, 329.6, 392.0], [220.0, 261.6, 329.6], [174.6, 220.0, 261.6], [196.0, 246.9, 293.7]];
const MBASS = [130.8, 110, 87.3, 98];
setInterval(() => {
  if (!ac || !musicOn || !started) return;
  const fast = discoT > 0, ST = 60 / (fast ? 124 : 92) / 4;
  if (MU.next < ac.currentTime - 0.3) MU.next = ac.currentTime + 0.05;
  while (MU.next < ac.currentTime + 0.15) {
    const at = MU.next - ac.currentTime, s = MU.step % 16, bar = Math.floor(MU.step / 16) % 4, ch = MCH[bar];
    if (s === 0 || s === 10 || (fast && s % 4 === 0)) tone(110, 45, 0.25, 'sine', 0.25, at);
    if (s === 4 || s === 12) noise(0.07, 0.06, 'bandpass', 2000, at);
    if (s % 2 === 0) noise(0.03, s % 4 === 2 ? 0.025 : 0.012, 'highpass', 8000, at);
    if (s === 0 || s === 8) tone(MBASS[bar], MBASS[bar], ST * 6, 'sine', 0.16, at);
    if ([0, 3, 6, 8, 11, 14].includes(s)) { const f = ch[(s / 3 | 0) % 3] * (s >= 8 ? 2 : 1); tone(f, f * 0.998, 0.35, 'triangle', 0.045, at); }
    if (fast && s % 2 === 1) tone(ch[(s >> 1) % 3] * 2, ch[(s >> 1) % 3] * 2, 0.1, 'square', 0.02, at);
    MU.next += ST; MU.step++;
  }
}, 25);

/* ---------------- input: keyboard, touch, camera ---------------- */
const keys = {};
let started = false, building = false, tool = 'silly', color = COLORS[0];
let camYaw = Math.PI / 2, camPitch = 0.42, camDist = 11, lastOrbit = -9;
const move = { x: 0, y: 0 };                  // joystick / keys: x right, y forward
let jumpQ = false;
addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase(); if (keys[k]) return; keys[k] = true; if (!started) return;
  if (k === ' ') { jumpQ = true; e.preventDefault(); }
  if (k === 'e') action();
  if (k === 'b') setBuild(!building);
  if (k === 'h' && P.inCar) sfx.horn(P.inCar.type);
  const n = parseInt(k, 10); if (n >= 1 && n <= TOOLS.length) { setTool(TOOLS[n - 1][0]); if (!building) setBuild(true); }
  if (k.startsWith('arrow')) e.preventDefault();
});
addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
// pointers: left thumb joystick, drag to look, tap to place when building
const stickEl = $('#stick'), knob = $('#knob');
const ptrs = new Map(); let stickId = null; const stick = { x: 0, y: 0, ox: 0, oy: 0 };
let mouse = { x: -1, y: -1 };
cv.addEventListener('pointerdown', (e) => {
  if (!started) return; audio(); cv.setPointerCapture(e.pointerId);
  const p = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t0: performance.now(), moved: 0, type: e.pointerType };
  ptrs.set(e.pointerId, p);
  const stickZone = TOUCH && e.clientX < innerWidth * 0.42 && !(building && e.clientY > innerHeight - 170);
  if (stickZone && stickId == null && !(building && e.clientY < innerHeight * 0.65 && e.clientX > innerWidth * 0.2)) { stickId = e.pointerId; stick.ox = e.clientX; stick.oy = e.clientY; stick.x = stick.y = 0; stickEl.style.left = e.clientX + 'px'; stickEl.style.top = e.clientY + 'px'; stickEl.style.display = 'block'; knob.style.transform = ''; p.stick = true; }
});
cv.addEventListener('pointermove', (e) => {
  mouse = { x: e.clientX, y: e.clientY };
  const p = ptrs.get(e.pointerId); if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y; p.moved += Math.hypot(dx, dy); p.x = e.clientX; p.y = e.clientY;
  if (p.stick) { let sx = e.clientX - stick.ox, sy = e.clientY - stick.oy; const L = Math.hypot(sx, sy), R = 55; if (L > R) { sx *= R / L; sy *= R / L; } stick.x = sx / R; stick.y = -sy / R; knob.style.transform = `translate(${sx}px,${sy}px)`; return; }
  if (p.moved > 8) { camYaw -= dx * 0.008; camPitch = clamp(camPitch + dy * 0.004, 0.12, 1.1); lastOrbit = performance.now(); }
});
function ptrEnd(e) {
  const p = ptrs.get(e.pointerId); ptrs.delete(e.pointerId); if (!p) return;
  if (p.stick) { stickId = null; stick.x = stick.y = 0; stickEl.style.display = 'none'; return; }
  if (building && p.moved < 12 && performance.now() - p.t0 < 500) buildAt(e.clientX, e.clientY);
}
cv.addEventListener('pointerup', ptrEnd); cv.addEventListener('pointercancel', ptrEnd);
cv.addEventListener('wheel', (e) => { camDist = clamp(camDist + e.deltaY * 0.01, 5, 24); e.preventDefault(); }, { passive: false });
cv.addEventListener('contextmenu', (e) => e.preventDefault());
const hold = (el, fn) => { el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); audio(); fn(); }); };
hold($('#jump'), () => { jumpQ = true; });
hold($('#act'), () => action());
hold($('#horn'), () => { if (P.inCar) sfx.horn(P.inCar.type); });
$('#bHome').onclick = () => { location.href = '../'; };
$('#bBuild').onclick = () => setBuild(!building);
$('#bMusic').onclick = () => { musicOn = !musicOn; try { localStorage.setItem('sgt-music', musicOn ? '1' : '0'); } catch (e) {} $('#bMusic').style.opacity = musicOn ? 1 : 0.45; };
$('#bMusic').style.opacity = musicOn ? 1 : 0.45;

/* ---------------- build palette ---------------- */
const TOOLS = [['silly', '🕺'], ['block', '🧱'], ['ramp', '📐'], ['tramp', '🔵'], ['palm', '🌴'], ['car', '🚗'], ['ball', '⚽'], ['erase', '🧽']];
for (const [t, ic] of TOOLS) { const b = document.createElement('button'); b.className = 'tool'; b.dataset.t = t; b.textContent = ic; b.onclick = (e) => { e.stopPropagation(); setTool(t); sfx.boop(); }; $('#tools').appendChild(b); }
for (const c of COLORS) { const b = document.createElement('button'); b.className = 'sw'; b.style.background = c; b.dataset.c = c; b.onclick = (e) => { e.stopPropagation(); setColor(c); }; $('#swatches').appendChild(b); }
function setTool(t) { tool = t; document.querySelectorAll('.tool').forEach((b) => b.classList.toggle('on', b.dataset.t === t)); $('#swatches').style.display = ['silly', 'block', 'ramp', 'tramp', 'car'].includes(t) ? 'flex' : 'none'; }
function setColor(c) { color = c; document.querySelectorAll('.sw').forEach((b) => b.classList.toggle('on', b.dataset.c === c)); tone(500 + COLORS.indexOf(c) * 60, 600 + COLORS.indexOf(c) * 60, 0.08, 'triangle', 0.12); }
function setBuild(on) { building = on; $('#palette').style.display = on ? 'flex' : 'none'; $('#bBuild').classList.toggle('on', on); ghost.visible = false; }
setTool('silly'); setColor(COLORS[0]);
const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2();
function pickAt(sx, sy) {
  ndc.set(sx / innerWidth * 2 - 1, -(sy / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
  const objs = [placed, ...pickGround, ...cars.map((c) => c.root), ...balls.map((b) => b.m)];
  const hits = ray.intersectObjects(objs, true);
  for (const h of hits) { if (h.distance > 140) break; return h; }
  return null;
}
function cellFromHit(h) {
  const it = h.object.userData.item, cell = h.object.userData.cell;
  if (cell && it && (it.t === 'block' || it.t === 'tramp') && h.face && h.face.normal) {
    const n = h.face.normal.clone().transformDirection(h.object.matrixWorld);
    if (n.y > 0.6) return { i: cell.i, j: cell.j, cell };
    const p = h.point.clone().addScaledVector(n, 0.5); return { i: Math.floor(p.x / G), j: Math.floor(p.z / G) };
  }
  if (cell) return { i: cell.i, j: cell.j, cell };
  return { i: Math.floor(h.point.x / G), j: Math.floor(h.point.z / G) };
}
function buildAt(sx, sy) {
  const h = pickAt(sx, sy); if (!h) return;
  if (tool === 'erase') {
    const car = h.object.userData.car, ball = h.object.userData.ball;
    if (car && car !== P.inCar) { scene.remove(car.root); scene.remove(car.shadow); cars.splice(cars.indexOf(car), 1); sfx.erase(); save(); return; }
    if (ball) { scene.remove(ball.m); scene.remove(ball.sh); balls.splice(balls.indexOf(ball), 1); sfx.erase(); save(); return; }
    const cell = h.object.userData.cell; if (cell && removeTop(cell)) sfx.erase();
    return;
  }
  const c = cellFromHit(h); const cx = (c.i + 0.5) * G, cz = (c.j + 0.5) * G;
  if (Math.hypot(cx - me().x, cz - me().z) < 1.4 && tool !== 'silly' && tool !== 'palm' && tool !== 'ball') return; // not on top of yourself
  if (tool === 'car') { if (cars.length >= 12) { toast('Lots of cars!'); return; } const t = CAR_TYPES[cars.length % CAR_TYPES.length].name; makeCar(t, color, h.point.x, h.point.z, camYaw + Math.PI); sfx.place(); save(); return; }
  if (tool === 'ball') { addBall(h.point.x, h.point.z, h.point.y + 3); sfx.place(); save(); return; }
  // ramps go up away from you
  const a = Math.atan2(cx - me().x, cz - me().z); const r = ((Math.round(a / (Math.PI / 2)) % 4) + 4) % 4;
  const ry = Math.atan2(me().x - cx, me().z - cz);
  if (addItem(c.i, c.j, tool, color, r, tool === 'silly' || tool === 'palm' ? ry : 0)) { sfx.place(); burst(cx, cellTop(c.i, c.j) + 0.5, cz, color); }
}
// a white preview of where it goes (mouse only)
const ghost = new THREE.Mesh(boxG(G, 0.12, G), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5, depthWrite: false })); ghost.visible = false; scene.add(ghost);

/* ---------------- confetti ---------------- */
const bits = []; const bitG = new THREE.BoxGeometry(0.18, 0.18, 0.04);
function burst(x, y, z, c, n = 14) { for (let k = 0; k < n; k++) { const m = new THREE.Mesh(bitG, lam(k % 3 ? c : COLORS[k % 7])); m.position.set(x, y, z); scene.add(m); bits.push({ m, vx: rnd(-4, 4), vy: rnd(3, 8), vz: rnd(-4, 4), life: rnd(0.6, 1.1) }); } }

/* ---------------- actions: cars and doors ---------------- */
const me = () => (P.inCar ? P.inCar : P);
function nearCar() { let best = null, bd = 3.6; for (const c of cars) { const d = Math.hypot(c.x - P.x, c.z - P.z); if (d < bd && Math.abs(c.y - P.y) < 2.5) { bd = d; best = c; } } return best; }
const atDoorOut = () => Math.hypot(P.x - DOOR_OUT.x, P.z - DOOR_OUT.z) < 2.8;
const atDoorIn = () => Math.hypot(P.x - DOOR_IN.x, P.z - DOOR_IN.z) < 2.6;
function action() {
  audio();
  if (P.inCar) { const c = P.inCar; P.inCar = null; const sx = Math.cos(c.yaw) * 2.4, sz = -Math.sin(c.yaw) * 2.4; P.x = c.x + sx; P.z = c.z + sz; P.y = c.y + 0.5; P.vy = 2; kid.root.visible = true; engineSet(false, 0); sfx.door(); save(); return; }
  if (atDoorOut()) { P.x = DOOR_IN.x; P.z = DOOR_IN.z - 2; P.y = 0; P.yaw = Math.PI; camYaw = 0; sfx.door(); return; }
  if (atDoorIn()) { P.x = DOOR_OUT.x + 2; P.z = DOOR_OUT.z; P.y = 0; P.yaw = -Math.PI / 2 + Math.PI; camYaw = -Math.PI / 2; sfx.door(); return; }
  const c = nearCar(); if (c) { P.inCar = c; kid.root.visible = false; camYaw = c.yaw + Math.PI; sfx.door(); return; }
}
function actLabel() { if (P.inCar) return '🚪 Get out'; if (atDoorOut()) return '🏠 Go in'; if (atDoorIn()) return '🏖️ Go out'; if (nearCar()) return '🚗 Get in'; return ''; }

/* ---------------- camera body controls (desktop) ---------------- */
const cam = { on: false, lm: null, lastVT: -1, sm: null, lean: 0, go: 0, jump: false, prevY: null, prevT: 0, cool: 0, lastSeen: 0 };
async function startCamera() {
  const video = $('#video');
  const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
  video.srcObject = stream; await video.play();
  toast('Getting ready...', 30);
  const { PoseLandmarker, FilesetResolver } = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs');
  const fs = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm');
  const opts = (d) => ({ baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task', delegate: d }, runningMode: 'VIDEO', numPoses: 1, minPoseDetectionConfidence: 0.4, minPosePresenceConfidence: 0.4, minTrackingConfidence: 0.4 });
  try { cam.lm = await PoseLandmarker.createFromOptions(fs, opts('GPU')); } catch (e) { cam.lm = await PoseLandmarker.createFromOptions(fs, opts('CPU')); }
  cam.on = true; $('#pv').style.display = 'block'; toast('Lean to turn! Hands up to go! Jump!', 3);
}
function readCamera(now) {
  const video = $('#video'); if (!cam.lm || video.readyState < 2 || video.currentTime === cam.lastVT) return; cam.lastVT = video.currentTime;
  let r; try { r = cam.lm.detectForVideo(video, now); } catch (e) { return; }
  const lm = r && r.landmarks && r.landmarks[0]; if (!lm) return;
  if (!cam.sm) cam.sm = lm.map((p) => ({ x: p.x, y: p.y })); else lm.forEach((p, i) => { cam.sm[i].x += (p.x - cam.sm[i].x) * 0.6; cam.sm[i].y += (p.y - cam.sm[i].y) * 0.6; });
  const s = cam.sm, pt = (i) => ({ x: 1 - s[i].x, y: s[i].y }); // mirrored, like a mirror
  const L = pt(11), R = pt(12), hl = pt(23), hr = pt(24), lw = pt(15), rw = pt(16), nose = pt(0);
  const sw = Math.max(0.05, Math.abs(R.x - L.x)), shx = (L.x + R.x) / 2, shy = (L.y + R.y) / 2, hipx = (hl.x + hr.x) / 2;
  const lean = ((shx - hipx) / sw) * 1.4 + ((Math.max(L.y, R.y) === L.y ? 1 : -1) * Math.abs(L.y - R.y) / sw) * 0.0;
  cam.lean = Math.abs(lean) < 0.12 ? 0 : clamp((lean - Math.sign(lean) * 0.12) * 2, -1, 1);
  cam.go = (lw.y < nose.y && rw.y < nose.y) ? 1 : (lw.y < shy && rw.y < shy ? 0.6 : 0);
  const dt = cam.prevT ? (now - cam.prevT) / 1000 : 0.033; cam.prevT = now;
  if (cam.prevY != null && dt > 0 && dt < 0.3) { const vy = (shy - cam.prevY) / sw / dt; if (vy < -3 && now > cam.cool) { cam.jump = true; cam.cool = now + 700; } }
  cam.prevY = shy; cam.lastSeen = now;
  const pc = $('#pv').getContext('2d'); pc.drawImage(video, 0, 0, 200, 150);
}
$('#play').onclick = () => begin(false);
$('#playCam').onclick = () => begin(true);
async function begin(withCam) {
  audio(); started = true; $('#start').style.display = 'none'; $('#hud').style.display = 'flex'; $('#jump').style.display = TOUCH ? 'block' : 'none';
  if (withCam) { try { await startCamera(); } catch (e) { toast('No camera. Use the keys!', 3); } }
}

/* ---------------- toast ---------------- */
let toastT = 0;
function toast(t, secs = 1.6) { const el = $('#toast'); el.textContent = t; el.style.opacity = 1; toastT = secs; }

/* ---------------- the loop ---------------- */
const GRAV = 26, STEP = 0.7, CSTEP = 0.85;
let last = performance.now(), T = 0, beat = 0;
const fwd = new THREE.Vector3();
function update(dt, now) {
  T += dt; beat += dt * (discoT > 0 ? 124 : 92) / 60 / 2;
  if (cam.on) readCamera(now);
  // input
  let mx = stick.x, my = stick.y;
  if (keys['a'] || keys['arrowleft']) mx -= 1; if (keys['d'] || keys['arrowright']) mx += 1;
  if (keys['w'] || keys['arrowup']) my += 1; if (keys['s'] || keys['arrowdown']) my -= 1;
  const L = Math.hypot(mx, my); if (L > 1) { mx /= L; my /= L; }
  const camFresh = cam.on && now - cam.lastSeen < 800;
  if (cam.jump) { cam.jump = false; jumpQ = true; }

  if (P.inCar) driveCar(P.inCar, dt, mx, my, camFresh);
  else walk(dt, mx, my, camFresh);
  for (const c of cars) if (c !== P.inCar) idleCar(c, dt);

  // silly guys: wiggle, and flop when bumped
  const m = me();
  for (const q of sillies) {
    const sp = q.s.g.position; const d = Math.hypot(sp.x - m.x, sp.z - m.z);
    if (d < (P.inCar ? 2.4 : 1.3) && Math.abs(sp.y - m.y) < 3 && q.s.flop <= 0) { q.s.flop = 1.6; if (P.inCar) sfx.boing(); else sfx.boop(); }
    animSilly(q.s, dt, false, beat, 0);
  }
  roomGuys.forEach((s, k) => { const d = Math.hypot(s.g.position.x - P.x, s.g.position.z - P.z); if (d < 1.3 && s.flop <= 0) { s.flop = 1.6; sfx.boop(); } animSilly(s, dt, discoT > 0, beat, k); });
  // balls
  for (const b of balls) updateBall(b, dt);
  // inside the beach house
  if (discoT > 0) discoT -= dt;
  const inside = inRoom(P.x, P.z);
  if (inside !== showingInside) showSide(inside);
  if (inside) roomUpdate(dt); else if (hemi.intensity !== 1.1) { hemi.intensity = 1.1; hemi.color.set('#ffffff'); roomLights.forEach((m) => (m.visible = false)); }
  // confetti
  for (let k = bits.length - 1; k >= 0; k--) { const b = bits[k]; b.vy -= 18 * dt; b.m.position.x += b.vx * dt; b.m.position.y += b.vy * dt; b.m.position.z += b.vz * dt; b.m.rotation.x += dt * 8; b.life -= dt; if (b.life <= 0) { scene.remove(b.m); bits.splice(k, 1); } }
  sea.material.emissiveIntensity = 0.22 + Math.sin(T * 0.8) * 0.06;
  // UI
  const lab = actLabel(); const act = $('#act');
  act.style.display = lab ? 'block' : 'none'; if (lab && act.textContent !== lab) act.textContent = lab;
  $('#horn').style.display = P.inCar && TOUCH ? 'block' : 'none';
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('#toast').style.opacity = 0; }
  if (saveT > 0) { saveT -= dt; if (saveT <= 0) doSave(); }
  // ghost preview under the mouse while building
  if (building && !TOUCH && mouse.x >= 0 && tool !== 'erase' && tool !== 'car' && tool !== 'ball') { const h = pickAt(mouse.x, mouse.y); if (h) { const c = cellFromHit(h); ghost.position.set((c.i + 0.5) * G, cellTop(c.i, c.j) + 0.08, (c.j + 0.5) * G); ghost.visible = true; } else ghost.visible = false; } else ghost.visible = false;
}
function camRel(mx, my) { const f = new THREE.Vector3(-Math.sin(camYaw), 0, -Math.cos(camYaw)); const r = new THREE.Vector3(-f.z, 0, f.x); return { x: f.x * my + r.x * mx, z: f.z * my + r.z * mx }; }
function walk(dt, mx, my, camFresh) {
  let vx = 0, vz = 0; let spd = P.water ? 4.2 : 7.5;
  if (camFresh) { P.yaw += cam.lean * 2.4 * dt * -1; if (cam.go) { vx = Math.sin(P.yaw) * spd * cam.go; vz = Math.cos(P.yaw) * spd * cam.go; } }
  if (mx || my) { const d = camRel(mx, my); vx = d.x * spd; vz = d.z * spd; const ty = Math.atan2(d.x, d.z); P.yaw += angDiff(P.yaw, ty) * Math.min(1, dt * 12); }
  // horizontal move with sliding along walls
  const tryMove = (nx, nz) => { const r = 0.35; const ox = Math.sign(nx - P.x) * r, oz = Math.sign(nz - P.z) * r; return !blocked(nx + ox, nz + oz, P.y, 1.6, STEP) && !blocked(nx, nz, P.y, 1.6, STEP); };
  let nx = P.x + vx * dt, nz = P.z + vz * dt;
  const lim = 175; if (Math.hypot(nx, nz) > lim && !inRoom(nx, nz)) { const k = lim / Math.hypot(nx, nz); nx *= k; nz *= k; }
  if (tryMove(nx, P.z)) P.x = nx; if (tryMove(P.x, nz)) P.z = nz;
  // the slide pushes you down
  const sup0 = support(P.x, P.z, P.y, 0.05);
  if (sup0 && sup0.slide && P.grounded) { P.z -= 9 * dt; }
  // jumping and falling
  if (jumpQ && (P.grounded || P.water)) { P.vy = P.water ? 7 : 11; P.grounded = false; sfx.jump(); }
  jumpQ = false;
  P.vy -= GRAV * dt; P.y += P.vy * dt;
  const sup = support(P.x, P.z, P.y - P.vy * dt, STEP);
  const floor = sup ? sup.y1 : -1.1;
  P.water = sup && sup.water;
  if (P.water) { const surf = -0.75; if (P.y <= surf) { if (P.vy < -6) { sfx.splash(); burst(P.x, -0.3, P.z, '#bfe9ff', 10); } P.y = surf; P.vy = Math.max(0, P.vy); P.grounded = true; } }
  else if (P.y <= floor) {
    if (sup && sup.bounce && P.vy < -2) { P.vy = sup.bounce < 1 ? 9 : 17.5; P.y = floor; sfx.boing(); P.grounded = false; }
    else { if (!P.grounded && P.vy < -8) sfx.land(); P.y = floor; P.vy = 0; P.grounded = true; }
  } else if (P.y > floor + 0.05) P.grounded = false;
  // kick balls
  for (const b of balls) { const dx = b.x - P.x, dz = b.z - P.z, d = Math.hypot(dx, dz); if (d < 1.1 && Math.abs(b.y - (P.y + 0.7)) < 1.4) { const k = 1 / (d || 1); b.vx = dx * k * 9 + vx * 0.5; b.vz = dz * k * 9 + vz * 0.5; b.vy = 6; sfx.kick(); } }
  // animate Reddy
  kid.root.position.set(P.x, P.y, P.z); kid.root.rotation.y = P.yaw;
  const moving = Math.hypot(vx, vz) > 0.3; kid.ph += dt * (moving ? 11 : 0);
  const sw = moving ? Math.sin(kid.ph) * 0.7 : 0;
  kid.legs[0].rotation.x = sw; kid.legs[1].rotation.x = -sw; kid.arms[0].rotation.x = -sw * 0.8; kid.arms[1].rotation.x = sw * 0.8;
  if (!P.grounded && !P.water) { kid.arms[0].rotation.z = -2.4; kid.arms[1].rotation.z = 2.4; } else { kid.arms[0].rotation.z = -0.15; kid.arms[1].rotation.z = 0.15; }
  kid.body.position.y = P.water ? -0.4 : (moving && P.grounded ? Math.abs(Math.sin(kid.ph)) * 0.08 : 0);
  const sh = support(P.x, P.z, P.y + 0.1, 0.1); kidShadow.position.set(P.x, (sh ? Math.max(sh.y1, -0.33) : 0) + 0.03, P.z); kidShadow.visible = !P.water;
  engineSet(false, 0);
}
function driveCar(c, dt, mx, my, camFresh) {
  const T2 = c.T; let thr = my, st = mx;
  if (camFresh) { thr = cam.go ? 1 : 0; st = -cam.lean; st = -st; }
  const grounded = c.y <= c.gy + 0.06;
  if (grounded) {
    const acc = thr > 0 ? 16 : thr < 0 ? (c.speed > 0 ? 26 : 10) : 0;
    c.speed += thr * acc * dt; if (!thr) c.speed -= Math.sign(c.speed) * Math.min(Math.abs(c.speed), 7 * dt);
    c.speed = clamp(c.speed, -8, T2.max * (c.water ? 0.4 : 1));
  }
  c.steer = lerp(c.steer, st, Math.min(1, dt * 8));
  c.yaw -= c.steer * dt * clamp(c.speed / 7, -1.6, 2.2) * 0.95;
  const vx = Math.sin(c.yaw) * c.speed, vz = Math.cos(c.yaw) * c.speed;
  // move in small steps so ramps never look like walls, even when the frame rate drops
  const n = Math.max(1, Math.ceil(Math.abs(c.speed) * dt / 0.25)), sdt = dt / n;
  for (let k = 0; k < n; k++) {
    let nx = c.x + vx * sdt, nz = c.z + vz * sdt;
    const lim = 178; if (Math.hypot(nx, nz) > lim && !inRoom(nx, nz)) { const q = lim / Math.hypot(nx, nz); nx *= q; nz *= q; c.speed *= 0.9; }
    const sg = Math.sign(c.speed || 1), fx = nx + Math.sin(c.yaw) * 0.9 * sg, fz = nz + Math.cos(c.yaw) * 0.9 * sg;
    if (blocked(fx, fz, c.y, 1.4, CSTEP + 0.95) || blocked(nx, nz, c.y, 1.4, CSTEP)) { if (Math.abs(c.speed) > 5) { sfx.boing(); burst(fx, c.y + 1, fz, '#ffffff', 6); } c.speed = -c.speed * 0.35; carVertical(c, sdt * (n - k)); break; }
    c.x = nx; c.z = nz; carVertical(c, sdt);
  }
  if (jumpQ && c.y <= c.gy + 0.06) { c.vy = 8; c.y += 0.05; sfx.jump(); }
  jumpQ = false;
  // knock balls
  for (const b of balls) { const dx = b.x - c.x, dz = b.z - c.z, d = Math.hypot(dx, dz); if (d < 2.2 && Math.abs(b.y - c.y) < 2.5) { const k = 1 / (d || 1); b.vx = dx * k * (6 + Math.abs(c.speed)) + vx * 0.6; b.vz = dz * k * (6 + Math.abs(c.speed)) + vz * 0.6; b.vy = 7 + Math.abs(c.speed) * 0.3; sfx.kick(); } }
  P.x = c.x; P.z = c.z; P.y = c.y;
  carPose(c, dt);
  engineSet(true, c.speed);
}
function carVertical(c, dt) {
  const sup = support(c.x, c.z, c.y, CSTEP); const g = sup ? sup.y1 : -1.1; c.water = sup && sup.water;
  const floor = c.water ? -0.9 : g;
  const wasGrounded = c.vy <= 0.01 && c.y <= (c.gy ?? floor) + 0.06;
  if (wasGrounded) {
    if (floor >= c.y - 0.02) { const climb = (floor - c.y) / Math.max(dt, 0.001); c.lastClimb = floor > c.y + 0.001 ? Math.min(climb, 12) : Math.max(0, (c.lastClimb || 0) - dt * 12); c.y = floor; c.vy = 0; }
    else if (floor < c.y - Math.abs(c.speed) * dt * 1.1 - 0.06) { c.vy = Math.max(0.02, c.lastClimb || 0); c.lastClimb = 0; }   // off the end of a ramp: fly
    else { c.y = floor; c.vy = 0; c.lastClimb = Math.max(0, (c.lastClimb || 0) - dt * 12); }
  }
  if (c.y > floor + 0.001 && !(wasGrounded && c.y === floor)) {
    c.vy -= GRAV * dt; c.y += c.vy * dt;
    if (c.y <= floor) { if (sup && sup.bounce && c.vy < -3) { c.vy = 15; sfx.boing(); } else { if (c.vy < -8) sfx.land(); if (c.water && c.vy < -4) sfx.splash(); c.y = floor; c.vy = 0; } }
  }
  c.gy = floor;
}
function idleCar(c, dt) { if (Math.abs(c.speed) > 0.1) { c.speed -= Math.sign(c.speed) * Math.min(Math.abs(c.speed), 10 * dt); c.x += Math.sin(c.yaw) * c.speed * dt; c.z += Math.cos(c.yaw) * c.speed * dt; } carVertical(c, dt); carPose(c, dt); }
function carPose(c, dt) {
  c.root.position.set(c.x, c.y + (c.water ? -0.3 : 0), c.z); c.root.rotation.y = c.yaw;
  const air = c.y > c.gy + 0.1; c.body.rotation.x = lerp(c.body.rotation.x, air ? -clamp(c.vy * 0.03, -0.4, 0.4) : 0, Math.min(1, dt * 6));
  c.body.rotation.z = lerp(c.body.rotation.z, c.steer * clamp(c.speed / 25, -1, 1) * 0.12, Math.min(1, dt * 6));
  c.roll += c.speed * dt / Math.max(0.3, c.T.wheel);
  for (const w of c.wheels) { w.w.rotation.x = 0; w.wg.rotation.y = w.front ? -c.steer * 0.45 : 0; w.w.rotation.set(c.roll, 0, Math.PI / 2); }
  c.shadow.position.set(c.x, Math.max(c.gy, -0.33) + 0.04, c.z); c.shadow.visible = !c.water;
}
function updateBall(b, dt) {
  b.vy -= GRAV * 0.7 * dt; b.x += b.vx * dt; b.z += b.vz * dt; b.y += b.vy * dt;
  if (blocked(b.x, b.z, b.y - 0.7, 1.2, 0.3)) { b.x -= b.vx * dt; b.z -= b.vz * dt; b.vx *= -0.6; b.vz *= -0.6; }
  const sup = support(b.x, b.z, b.y - 0.7, 0.4); const floor = (sup ? sup.y1 : -1.1);
  const water = sup && sup.water;
  if (water) { if (b.y < -0.2) { b.y = -0.2; b.vy = Math.abs(b.vy) * 0.3; } b.vx *= 1 - dt * 0.8; b.vz *= 1 - dt * 0.8; }
  else if (b.y - 0.7 <= floor) { b.y = floor + 0.7; b.vy = Math.abs(b.vy) > 2 ? -b.vy * (sup && sup.bounce ? 1.05 : 0.6) : 0; b.vx *= 1 - dt * 1.5; b.vz *= 1 - dt * 1.5; }
  if (Math.hypot(b.x, b.z) > 180 && !inRoom(b.x, b.z)) { b.vx *= -1; b.vz *= -1; }
  b.m.position.set(b.x, b.y, b.z); b.m.rotation.x += b.vz * dt / 0.7; b.m.rotation.z -= b.vx * dt / 0.7;
  b.sh.position.set(b.x, Math.max(floor, -0.33) + 0.03, b.z);
}
const BPV = new THREE.Matrix4(), BPQ = new THREE.Quaternion(), BPS = new THREE.Vector3(1, 1, 1);
function roomUpdate(dt) {
  // piano tiles
  let tile = -1; pianoTiles.forEach((t, k) => { const on = P.x > t.x0 && P.x < t.x1 && P.z > t.z0 && P.z < t.z1 && P.y < 0.5; if (on) tile = k; t.m.material.emissive.set(on ? '#666' : '#000'); });
  if (tile >= 0 && tile !== P.lastTile) sfx.note(pianoTiles[tile].f); P.lastTile = tile;
  // disco button
  const bd = Math.hypot(P.x - (IX + 11), P.z - (IZ + 7.5)); if (bd < 1.1 && P.y < 0.6 && discoT <= 0) { discoT = 14; sfx.boing(); toast('DISCO!', 2); }
  ballPit.btn.position.y = bd < 1.1 ? 0.08 : 0.18;
  if (discoT > 0) {
    discoBall.rotation.y += dt * 2; discoBall.material.emissive.setHSL((T * 0.5) % 1, 0.9, 0.4);
    roomLights.forEach((m, k) => { m.visible = true; m.position.x = IX + Math.sin(T * 1.3 + k * 1.1) * 9; m.position.z = IZ + Math.cos(T * 0.9 + k * 1.7) * 7; m.material.color.setHSL((T * 0.4 + k / 6) % 1, 0.95, 0.6); });
    hemi.intensity = 0.75; hemi.color.setHSL((T * 0.3) % 1, 0.6, 0.85);
  } else if (roomLights[0].visible) { roomLights.forEach((m) => (m.visible = false)); hemi.intensity = 1.1; hemi.color.set('#ffffff'); discoBall.material.emissive.set('#555'); }
  // ball pit: balls jiggle and get pushed around
  const inPit = P.x > ballPit.x0 && P.x < ballPit.x1 && P.z > ballPit.z0 && P.z < ballPit.z1;
  ballPit.pos.forEach((p, k) => {
    const v = ballPit.vel[k];
    if (inPit) { const dx = p.x - P.x, dz = p.z - P.z, d = Math.hypot(dx, dz); if (d < 1.1) { v.x += dx / (d || 1) * 10 * dt; v.z += dz / (d || 1) * 10 * dt; v.y += 6 * dt; } }
    v.y -= 9 * dt; p.addScaledVector(v, dt); v.multiplyScalar(1 - dt * 3);
    if (p.y < 0.33 + (k % 3) * 0.25) { p.y = 0.33 + (k % 3) * 0.25; v.y = Math.abs(v.y) * 0.3; }
    p.x = clamp(p.x, ballPit.x0 + 0.5, ballPit.x1 - 0.5); p.z = clamp(p.z, ballPit.z0 + 0.5, ballPit.z1 - 0.5);
    BPV.compose(p, BPQ, BPS); ballPit.balls.setMatrixAt(k, BPV);
  });
  ballPit.balls.instanceMatrix.needsUpdate = true;
}
function updateCamera(dt) {
  const m = me(); const inside = inRoom(P.x, P.z);
  const moving = P.inCar ? Math.abs(P.inCar.speed) > 2 : (Math.abs(stick.x) + Math.abs(stick.y) > 0.2 || keys['w'] || keys['s'] || keys['arrowup'] || keys['arrowdown'] || (cam.on && cam.go));
  const behind = (P.inCar ? P.inCar.yaw : P.yaw) + Math.PI;
  if (moving && performance.now() - lastOrbit > 1500) camYaw += angDiff(camYaw, behind) * Math.min(1, dt * (P.inCar ? 2.5 : 1.2));
  const dist = inside ? 7 : P.inCar ? camDist + 3 : camDist; const pitch = inside ? Math.max(camPitch, 0.65) : camPitch;
  const tx = m.x, ty = m.y + (P.inCar ? 1.6 : 1.3), tz = m.z;
  let cx = tx + Math.sin(camYaw) * Math.cos(pitch) * dist, cz = tz + Math.cos(camYaw) * Math.cos(pitch) * dist, cy = ty + Math.sin(pitch) * dist;
  if (inside) { cx = clamp(cx, ROOM.x0 + 0.8, ROOM.x1 - 0.8); cz = clamp(cz, ROOM.z0 + 0.8, ROOM.z1 - 0.8); }
  const k = Math.min(1, dt * 8); camera.position.set(lerp(camera.position.x, cx, k), lerp(camera.position.y, Math.max(cy, ty + 0.5), k), lerp(camera.position.z, cz, k));
  if (camera.position.y < -0.1) camera.position.y = -0.1;
  camera.lookAt(tx, ty, tz);
  scene.fog.near = inside ? 30 : 90; scene.fog.far = inside ? 110 : 260;
}
camera.position.set(P.x + 10, 6, P.z);
const perf = { t: 0, n: 0, slow: 0, fast: 0 };
function frame(now) {
  const raw = now - last; const dt = Math.min(0.05, raw / 1000); last = now;
  if (started && raw < 500 && !document.hidden) {
    perf.t += raw; perf.n++; if (raw > 24) perf.slow++;
    if (perf.t > 2500) {
      if (perf.slow / perf.n > 0.3 && qi < QSTEPS.length - 1) { qi++; renderer.setPixelRatio(QSTEPS[qi]); resize(); }
      perf.t = perf.n = perf.slow = 0;
    }
  }
  if (started) update(dt, now); else { T += dt; for (const q of sillies) animSilly(q.s, dt, false, 0, 0); kid.root.position.set(P.x, P.y, P.z); }
  updateCamera(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__town = { P, cars, grid, sillies, balls, action, get building() { return building; }, setBuild, setTool, setColor, buildAt, begin, stat: () => renderer.info.render };
