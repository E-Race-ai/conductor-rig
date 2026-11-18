/* Field Unit 3D viewer: Unitree Go2 (official BSD-3 meshes) + Gen-0/Gen-1 capture payload.
   ES module. Needs an import map for "three" and "three/addons/" (three@0.160.0).
   API: FUViewer.mount(el, {config:'gen1'|'gen0', view:'iso'|'side'|'top'|'front',
        labels:true, dims:false, explode:0, ui:true, mode:'studio'|'drawing',
        fallback:'img/url.jpg', base:'3d/'}) -> controller
   Auto-mounts every [data-fu-viewer] element (options from data-* attributes). */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

const ACC = '#00C8FF';
const HERE = new URL('.', import.meta.url).href;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- payload geometry, metres. three.js frame: +x forward, +y up, +z = robot right ---------- */
const DECK_Y = 0.352;            // top of the mounting deck
const MAST_H = 0.32;             // 25–40 cm mast (planning value 32 cm)
const PARTS_SPEC = {
  // letter, title, sub, anchor (local offset added to group pos), explode order
  x4:     { L: 'A', t: 'Insta360 X4', s: '360° video · 5.7K30 · mast', order: 5 },
  lidar:  { L: 'B', t: 'Survey LiDAR', s: 'XT32-class · Ø100 × 76 mm', order: 3 },
  cam:    { L: 'C', t: 'Global-shutter camera', s: 'HW-triggered · same bracket', order: 4 },
  jetson: { L: 'D', t: 'Jetson Orin Nano Super', s: 'Compute · PTP master', order: 2 },
  batt:   { L: 'E', t: 'Accessory battery', s: '24 V · fused · e-stop', order: 1 },
  head:   { L: 'F', t: 'Head LiDAR', s: 'Factory · navigation only', order: 0 },
};

function mats(env) {
  const m = {
    shell: new THREE.MeshPhysicalMaterial({ color: 0x8e939b, roughness: 0.5, metalness: 0.05, clearcoat: 0.25, clearcoatRoughness: 0.4 }),
    alu: new THREE.MeshStandardMaterial({ color: 0x9da3ac, roughness: 0.32, metalness: 0.95 }),
    black: new THREE.MeshStandardMaterial({ color: 0x16181c, roughness: 0.62, metalness: 0.1 }),
    white: new THREE.MeshPhysicalMaterial({ color: 0xcfd2d7, roughness: 0.4, clearcoat: 0.3 }),
    anod: new THREE.MeshStandardMaterial({ color: 0x2a2e35, roughness: 0.38, metalness: 0.85 }),
    anodLt: new THREE.MeshStandardMaterial({ color: 0x8e949d, roughness: 0.3, metalness: 0.9 }),
    matte: new THREE.MeshStandardMaterial({ color: 0x1b1e23, roughness: 0.8, metalness: 0.05 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x0a0c10, roughness: 0.06, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.03, reflectivity: 0.9 }),
    lens: new THREE.MeshPhysicalMaterial({ color: 0x07080b, roughness: 0.02, metalness: 0.4, clearcoat: 1, clearcoatRoughness: 0.0, iridescence: 0.6, iridescenceIOR: 1.6 }),
    carbon: new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.45, metalness: 0.3 }),
    led: new THREE.MeshStandardMaterial({ color: 0x111111, emissive: new THREE.Color(ACC), emissiveIntensity: 2.2 }),
    cable: new THREE.MeshStandardMaterial({ color: 0x101114, roughness: 0.7 }),
  };
  return m;
}

const rbox = (w, h, d, r = 0.004, seg = 3) => new RoundedBoxGeometry(w, h, d, seg, r);
function mesh(geo, mat, x = 0, y = 0, z = 0, cast = true) {
  const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = cast; o.receiveShadow = true; return o;
}

function buildPayload(M, config) {
  const parts = {};
  const root = new THREE.Group();

  // deck plate on four standoffs, slotted rails
  const deck = new THREE.Group();
  deck.add(mesh(rbox(0.34, 0.006, 0.118, 0.0025), M.anod, -0.035, DECK_Y - 0.003, 0));
  for (const z of [-0.042, 0.042]) deck.add(mesh(rbox(0.32, 0.004, 0.012, 0.0015), M.anodLt, -0.035, DECK_Y + 0.002, z));
  for (const x of [-0.17, 0.10]) for (const z of [-0.04, 0.04])
    deck.add(mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.026, 16), M.alu, x, DECK_Y - 0.018, z));
  root.add(deck); parts.deck = deck;

  // E · accessory battery, low over the hips
  const batt = new THREE.Group();
  batt.add(mesh(rbox(0.13, 0.042, 0.088, 0.006), M.matte, 0, 0.021, 0));
  batt.add(mesh(rbox(0.132, 0.006, 0.09, 0.002), M.anod, 0, 0.004, 0));
  batt.add(mesh(new THREE.BoxGeometry(0.004, 0.006, 0.03), M.led, 0.066, 0.03, 0.0, false));
  batt.add(mesh(rbox(0.02, 0.014, 0.024, 0.002), M.black, -0.072, 0.02, 0.02));          // XT60 lead
  batt.position.set(-0.118, DECK_Y, 0); batt.userData.anchor = new THREE.Vector3(0.02, 0.043, 0);
  root.add(batt); parts.batt = batt;

  // D · Jetson enclosure with fin stack
  const jet = new THREE.Group();
  jet.add(mesh(rbox(0.115, 0.034, 0.095, 0.005), M.anod, 0, 0.017, 0));
  for (let i = 0; i < 9; i++) jet.add(mesh(new THREE.BoxGeometry(0.09, 0.012, 0.0022), M.anodLt, 0, 0.04, -0.036 + i * 0.009));
  jet.add(mesh(new THREE.BoxGeometry(0.003, 0.012, 0.016), M.black, 0.058, 0.016, -0.02));   // RJ45
  jet.add(mesh(new THREE.BoxGeometry(0.003, 0.006, 0.012), M.black, 0.058, 0.014, 0.012));    // USB
  jet.add(mesh(new THREE.BoxGeometry(0.002, 0.003, 0.003), M.led, 0.058, 0.027, 0.03, false));
  jet.position.set(0.0, DECK_Y, 0); jet.userData.anchor = new THREE.Vector3(0, 0.046, 0.0);
  root.add(jet); parts.jetson = jet;

  if (config === 'gen1') {
    // B · survey LiDAR on a front bracket
    const lid = new THREE.Group();
    const prof = [[0, 0], [0.050, 0], [0.0521, 0.002], [0.0521, 0.024], [0.0505, 0.026], [0.0505, 0.027]];
    const base = new THREE.LatheGeometry(prof.map(p => new THREE.Vector2(p[0], p[1])), 72);
    lid.add(mesh(base, M.alu, 0, 0, 0));
    lid.add(mesh(new THREE.CylinderGeometry(0.0495, 0.0495, 0.037, 96, 1, true), M.glass, 0, 0.0455, 0));
    const capP = [[0.0505, 0.064], [0.0521, 0.066], [0.0521, 0.073], [0.049, 0.076], [0, 0.0765]];
    lid.add(mesh(new THREE.LatheGeometry(capP.map(p => new THREE.Vector2(p[0], p[1])), 72), M.alu, 0, 0, 0));
    for (let i = 0; i < 24; i++) {  // base cooling ribs
      const a = (i / 24) * Math.PI * 2, r = 0.0522;
      const f = mesh(new THREE.BoxGeometry(0.0016, 0.018, 0.004), M.anodLt, Math.cos(a) * r, 0.012, Math.sin(a) * r);
      f.rotation.y = -a; lid.add(f);
    }
    lid.add(mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.014, 20), M.black, -0.05, 0.012, 0.0).rotateZ(Math.PI / 2));
    lid.position.set(0.12, DECK_Y + 0.05, 0); lid.userData.anchor = new THREE.Vector3(0.0, 0.0765, 0);
    // bracket
    const br = new THREE.Group();
    br.add(mesh(rbox(0.12, 0.005, 0.1, 0.002), M.anodLt, 0.125, DECK_Y + 0.0475, 0));
    for (const z of [-0.045, 0.045]) br.add(mesh(rbox(0.1, 0.048, 0.005, 0.002), M.anodLt, 0.12, DECK_Y + 0.024, z));
    root.add(br); parts.bracket = br;
    root.add(lid); parts.lidar = lid;

    // C · global-shutter camera, forward on the bracket, below the LiDAR window
    const cam = new THREE.Group();
    cam.add(mesh(rbox(0.03, 0.029, 0.029, 0.002), M.anod, 0, 0, 0));
    const lens = new THREE.CylinderGeometry(0.0145, 0.0145, 0.036, 48); lens.rotateZ(Math.PI / 2);
    cam.add(mesh(lens, M.matte, 0.033, 0, 0));
    for (const dx of [0.022, 0.04]) { const g = new THREE.CylinderGeometry(0.0152, 0.0152, 0.002, 48); g.rotateZ(Math.PI / 2); cam.add(mesh(g, M.alu, dx, 0, 0)); }
    const fg = new THREE.CircleGeometry(0.011, 48); fg.rotateY(Math.PI / 2);
    cam.add(mesh(fg, M.lens, 0.0512, 0, 0, false));
    cam.add(mesh(new THREE.BoxGeometry(0.004, 0.012, 0.016), M.black, -0.017, 0, 0));
    cam.position.set(0.2, DECK_Y + 0.030, 0); cam.userData.anchor = new THREE.Vector3(0.0, 0.0145, 0.0);
    root.add(cam); parts.cam = cam;

    // A · Insta360 X4 on a rear carbon mast
    const mast = new THREE.Group();
    mast.add(mesh(rbox(0.04, 0.012, 0.04, 0.003), M.anodLt, 0, 0.006, 0));
    mast.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, MAST_H, 32), M.carbon, 0, MAST_H / 2, 0));
    mast.add(mesh(new THREE.CylinderGeometry(0.0105, 0.0105, 0.02, 32), M.anodLt, 0, 0.05, 0));
    const x4 = new THREE.Group();
    x4.add(mesh(rbox(0.0376, 0.1236, 0.046, 0.009, 4), M.matte, 0, 0.0618, 0));
    for (const s of [-1, 1]) {
      const dome = new THREE.SphereGeometry(0.0175, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2); dome.rotateZ(-s * Math.PI / 2);
      x4.add(mesh(dome, M.lens, s * 0.0188, 0.095, 0));
      const ring = new THREE.TorusGeometry(0.0178, 0.0016, 12, 48); ring.rotateY(Math.PI / 2);
      x4.add(mesh(ring, M.alu, s * 0.0189, 0.095, 0));
    }
    x4.add(mesh(rbox(0.001, 0.032, 0.03, 0.0005), M.glass, -0.0189, 0.045, 0, false)); // screen
    x4.position.set(0, MAST_H, 0);
    mast.add(x4);
    mast.position.set(-0.205, DECK_Y, 0); mast.userData.anchor = new THREE.Vector3(0, MAST_H + 0.1236, 0.0);
    root.add(mast); parts.x4 = mast;

    // cable runs (LiDAR → Jetson, camera → Jetson, mast → Jetson)
    const tube = (pts, r = 0.0032) => { const t = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p))), 64, r, 10), M.cable, 0, 0, 0); t.userData.noOcc = true; return t; };
    root.add(tube([[0.07, DECK_Y + 0.062, 0.0], [0.05, DECK_Y + 0.035, 0.03], [0.058, DECK_Y + 0.016, 0.03]]));
    root.add(tube([[0.183, DECK_Y + 0.03, 0.0], [0.17, DECK_Y + 0.02, -0.035], [0.09, DECK_Y + 0.012, -0.052], [0.058, DECK_Y + 0.014, -0.02]], 0.0024));
    root.add(tube([[-0.197, DECK_Y + 0.06, 0.008], [-0.19, DECK_Y + 0.03, 0.03], [-0.12, DECK_Y + 0.052, 0.05], [-0.058, DECK_Y + 0.02, 0.03]], 0.0024));
  }
  // F · head LiDAR anchor only (part of the robot)
  const head = new THREE.Group(); head.position.set(0.334, 0.205, 0.0); head.userData.anchor = new THREE.Vector3(0, 0, 0);
  root.add(head); parts.head = head;

  for (const k in parts) parts[k].userData.home = parts[k].position.clone();
  return { root, parts };
}

function gridTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 1024; const g = c.getContext('2d');
  g.clearRect(0, 0, 1024, 1024);
  const step = 1024 / 40;
  for (let i = 0; i <= 40; i++) {
    const major = i % 5 === 0;
    g.strokeStyle = major ? 'rgba(160,170,185,0.22)' : 'rgba(160,170,185,0.09)'; g.lineWidth = major ? 1.4 : 1;
    g.beginPath(); g.moveTo(i * step, 0); g.lineTo(i * step, 1024); g.stroke();
    g.beginPath(); g.moveTo(0, i * step); g.lineTo(1024, i * step); g.stroke();
  }
  const rad = g.createRadialGradient(512, 512, 40, 512, 512, 512);
  rad.addColorStop(0, 'rgba(0,0,0,0)'); rad.addColorStop(0.55, 'rgba(0,0,0,0.25)'); rad.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out'; g.fillStyle = rad; g.fillRect(0, 0, 1024, 1024);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

const CSS = `
.fuv{position:relative;width:100%;min-height:320px;overflow:hidden;border-radius:4px;
 background:radial-gradient(120% 90% at 50% 38%,#141D33 0%,#0C1324 55%,#070B16 100%);font-family:"IBM Plex Sans",system-ui,sans-serif;color:#EEF2FA;
 -webkit-user-select:none;user-select:none;touch-action:pan-y}
.fuv.drawing{background:#0A1020}
.fuv canvas{display:block;width:100%!important;height:100%!important;outline:none;cursor:grab}
.fuv canvas:active{cursor:grabbing}
.fuv img.poster{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:opacity .45s;pointer-events:none}
.fuv svg.ov{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible}
.fuv .lbl{position:absolute;pointer-events:none;transition:opacity .2s;font-size:12.5px;line-height:1.25}
.fuv .lbl b{font:600 11px/1 "IBM Plex Mono",monospace;display:inline-grid;place-items:center;width:20px;height:20px;border:1px solid ${ACC};color:${ACC};border-radius:2px;margin-right:9px;vertical-align:-5px;background:rgba(7,11,22,.75)}
.fuv .lbl span{font-weight:500;letter-spacing:.005em}
.fuv .lbl i{display:block;white-space:normal;font:400 11px/1.35 "IBM Plex Mono",monospace;color:#A3AEC6;font-style:normal;margin:3px 0 0 29px}
.fuv .lbl.r{text-align:left}.fuv .lbl.l{text-align:right}.fuv .lbl.l i{margin:3px 29px 0 0}
.fuv .lbl.l b{margin:0 0 0 9px;float:right}
.fuv .lbl.off{opacity:.18}
.fuv .bal{position:absolute;width:24px;height:24px;display:grid;place-items:center;font:600 11.5px/1 "IBM Plex Mono",monospace;color:${ACC};border:1px solid ${ACC};border-radius:2px;background:rgba(7,11,22,.85);pointer-events:none;transition:opacity .2s}
.fuv .bal.off{opacity:.3}
.fuv .leg{position:absolute;right:22px;top:50%;transform:translateY(-50%);display:grid;gap:14px;width:250px;pointer-events:none}
.fuv .leg div{font-size:12.5px;line-height:1.3}
.fuv .leg b{font:600 11px/1 "IBM Plex Mono",monospace;display:inline-grid;place-items:center;width:20px;height:20px;border:1px solid ${ACC};color:${ACC};border-radius:2px;margin-right:9px;vertical-align:-5px}
.fuv .leg span{font-weight:500}.fuv .leg i{display:block;font:400 11px/1.35 "IBM Plex Mono",monospace;color:#A3AEC6;font-style:normal;margin:3px 0 0 29px}
.fuv .leg.m{right:10px;left:10px;top:36px;transform:none;width:auto;grid-template-columns:1fr 1fr;gap:6px 10px}
.fuv .leg.m div{font-size:11px}.fuv .leg.m i{display:none}.fuv .leg.m b{width:17px;height:17px;margin-right:6px;font-size:10px;vertical-align:-4px}
.fuv .tb{position:absolute;right:22px;bottom:18px;display:grid;grid-template-columns:auto auto;gap:0;border:1px solid #1C2640;font:400 10.5px/1 "IBM Plex Mono",monospace;color:#A3AEC6;pointer-events:none;background:rgba(7,11,22,.6)}
.fuv .tb span{padding:6px 9px;border-bottom:1px solid #1C2640}.fuv .tb span:nth-child(odd){color:#6B7480;border-right:1px solid #1C2640}
.fuv .tb span:nth-last-child(-n+2){border-bottom:0}.fuv .tb b{color:#EEF2FA;font-weight:500}
.fuv .dimt{font:500 11px/1 "IBM Plex Mono",monospace;fill:#C8D1E3;letter-spacing:.02em}
.fuv .ui{position:absolute;left:12px;right:12px;bottom:12px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;pointer-events:none}
.fuv .ui>*{pointer-events:auto}
.fuv .seg{display:inline-flex;border:1px solid #1C2640;border-radius:3px;overflow:hidden;background:rgba(7,11,22,.82);backdrop-filter:blur(6px)}
.fuv .seg button{all:unset;cursor:pointer;font:500 11.5px/1 "IBM Plex Mono",monospace;padding:8px 11px;color:#A3AEC6;letter-spacing:.03em}
.fuv .seg button+button{border-left:1px solid #1C2640}
.fuv .seg button[aria-pressed=true]{color:#070B16;background:#C8D1E3}
.fuv .seg button:focus-visible{outline:2px solid ${ACC};outline-offset:-2px}
.fuv .ex{display:inline-flex;align-items:center;gap:10px;font:500 11.5px/1 "IBM Plex Mono",monospace;color:#A3AEC6;border:1px solid #1C2640;border-radius:3px;padding:6px 11px;background:rgba(7,11,22,.82);backdrop-filter:blur(6px)}
.fuv .ex input{width:120px;accent-color:${ACC}}
.fuv .tag{position:absolute;left:14px;top:12px;font:500 10.5px/1.5 "IBM Plex Mono",monospace;color:#6B7480;letter-spacing:.08em;text-transform:uppercase;pointer-events:none}
.fuv .tag b{color:${ACC};font-weight:600}
@media (max-width:640px){.fuv .lbl{font-size:11px}.fuv .lbl i{display:none}.fuv .ex input{width:84px}.fuv .seg button{padding:7px 8px}}
`;
let cssDone = false;
function injectCSS() { if (cssDone) return; cssDone = true; const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); }

const VIEWS = {
  iso:   { dir: [1.0, 0.42, 1.25] },
  hero:  { dir: [1.15, 0.26, 1.0], k: 0.86 },
  side:  { dir: [0.0, 0.1, 1.0] },
  top:   { dir: [0.0, 1.0, 0.0001], k: 0.72 },
  front: { dir: [1.0, 0.12, 0.0], k: 0.95 },
};

function hasWebGL() { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } }

export function mount(el, opt = {}) {
  injectCSS();
  const o = Object.assign({ config: 'gen1', view: 'iso', labels: true, dims: false, explode: 0, ui: true, mode: 'studio', fallback: '', autorotate: false }, opt);
  if (!hasWebGL()) {
    if (o.fallback) el.innerHTML = `<img src="${o.fallback}" alt="Field Unit capture configuration" style="width:100%;height:auto;display:block">`;
    return null;
  }
  el.classList.add('fuv'); if (o.mode === 'drawing') el.classList.add('drawing');
  el.innerHTML = '';
  const W = () => el.clientWidth, H = () => el.clientHeight;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: !!o.still });
  renderer.setPixelRatio(Math.min(devicePixelRatio, o.still ? 3 : 2));
  renderer.setSize(W(), H());
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.92;
  renderer.shadowMap.enabled = o.mode !== 'drawing'; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  el.appendChild(renderer.domElement);
  if (o.poster) { const ps = document.createElement('img'); ps.className = 'poster'; ps.src = o.poster; ps.alt = ''; el.appendChild(ps);
    el.addEventListener('fuviewer:ready', () => { ps.style.opacity = 0; setTimeout(() => ps.remove(), 500); }, { once: true }); }
  renderer.domElement.setAttribute('aria-label', 'Interactive 3D model of the Field Unit capture configuration. Drag to orbit, scroll or pinch to zoom.');
  renderer.domElement.tabIndex = 0;

  const scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(renderer), 0.04).texture;
  scene.environmentIntensity = 0.42;

  const camera = new THREE.PerspectiveCamera(o.mode === 'drawing' ? 6 : 20, W() / H(), 0.05, 200);
  const target = new THREE.Vector3(-0.02, o.config === 'gen1' ? 0.36 : 0.22, 0);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(target); controls.enableDamping = !REDUCED; controls.dampingFactor = 0.08;
  controls.minDistance = o.mode === 'drawing' ? 4 : 1.0; controls.maxDistance = o.mode === 'drawing' ? 30 : 4.2; controls.maxPolarAngle = Math.PI * 0.495;
  controls.enablePan = false; controls.zoomSpeed = 0.6; controls.rotateSpeed = 0.7;

  // lights
  scene.add(new THREE.HemisphereLight(0xdfe6f0, 0x070b16, 0.22));
  const key = new THREE.DirectionalLight(0xffffff, 1.9); key.position.set(0.9, 3.6, 1.1); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048); key.shadow.camera.left = -0.8; key.shadow.camera.right = 0.8; key.shadow.camera.top = 0.8; key.shadow.camera.bottom = -0.8;
  key.shadow.camera.near = 0.5; key.shadow.camera.far = 8; key.shadow.radius = 6; key.shadow.blurSamples = 16; key.shadow.bias = -0.0004; key.shadow.normalBias = 0.01;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xbcd2ff, 1.6); rim.position.set(-2.2, 1.4, -1.6); scene.add(rim);
  const fill = new THREE.DirectionalLight(0xffe4c4, 0.3); fill.position.set(-1.2, 0.6, 2.4); scene.add(fill);

  // floor: soft contact shadow + fading engineering grid
  const shadowFloor = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.ShadowMaterial({ opacity: o.mode === 'drawing' ? 0 : 0.55 }));
  shadowFloor.rotation.x = -Math.PI / 2; shadowFloor.position.y = -0.0215; shadowFloor.receiveShadow = true; scene.add(shadowFloor);
  const grid = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2), new THREE.MeshBasicMaterial({ map: gridTexture(), transparent: true, depthWrite: false, opacity: o.mode === 'drawing' ? 0.5 : 0.9 }));
  grid.rotation.x = -Math.PI / 2; grid.position.y = -0.022; scene.add(grid);

  const M = mats();
  const robot = new THREE.Group(); scene.add(robot);
  const { root: payload, parts } = buildPayload(M, o.config);
  robot.add(payload);
  const edgeGroup = new THREE.Group(); scene.add(edgeGroup);

  // overlay
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.classList.add('ov'); el.appendChild(svg);
  const tag = document.createElement('div'); tag.className = 'tag';
  tag.innerHTML = o.config === 'gen1' ? '<b>Gen-1</b> capture configuration · Go2 X carrier' : '<b>Gen-0</b> validation configuration · Go2 X + Jetson';
  if (!o.notag) el.appendChild(tag);
  if (o.titleBlock) {
    const tb = document.createElement('div'); tb.className = 'tb';
    const T = Object.assign({ Drawing: 'FU-DWG-001', Title: (o.config === 'gen1' ? 'Gen-1 capture configuration' : 'Gen-0 validation configuration'), View: '', Scale: 'NTS', Rev: 'A', Date: '2026-11-18' }, o.titleBlock === true ? {} : o.titleBlock);
    tb.innerHTML = Object.entries(T).filter(([k, v]) => v).map(([k, v]) => `<span>${k}</span><span><b>${v}</b></span>`).join('');
    el.appendChild(tb);
  }

  const labelKeys = (o.config === 'gen1' ? ['x4', 'lidar', 'cam', 'jetson', 'batt', 'head'] : ['jetson', 'batt', 'head']);
  const labels = labelKeys.map(k => {
    const d = document.createElement('div'); d.className = 'lbl';
    const sp = PARTS_SPEC[k];
    d.innerHTML = `<b>${sp.L}</b><span>${sp.t}</span><i>${sp.s}</i>`;
    el.appendChild(d); return { k, d, sp };
  });

  // UI
  let state = { view: o.view, labels: o.labels, dims: o.dims, explode: o.explode };
  if (o.ui) {
    const ui = document.createElement('div'); ui.className = 'ui';
    const seg = document.createElement('div'); seg.className = 'seg'; seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'View');
    for (const v of ['iso', 'side', 'top', 'front']) {
      const b = document.createElement('button'); b.textContent = v[0].toUpperCase() + v.slice(1); b.dataset.v = v;
      b.setAttribute('aria-pressed', v === state.view); b.onclick = () => api.setView(v); seg.appendChild(b);
    }
    const seg2 = document.createElement('div'); seg2.className = 'seg';
    const bl = document.createElement('button'); bl.textContent = 'Callouts'; bl.setAttribute('aria-pressed', state.labels); bl.onclick = () => { api.setLabels(!state.labels); bl.setAttribute('aria-pressed', state.labels); };
    const bd = document.createElement('button'); bd.textContent = 'Dimensions'; bd.setAttribute('aria-pressed', state.dims); bd.onclick = () => { api.setDims(!state.dims); bd.setAttribute('aria-pressed', state.dims); };
    seg2.append(bl, bd);
    const ex = document.createElement('label'); ex.className = 'ex';
    ex.innerHTML = `Exploded <input type="range" min="0" max="100" value="${Math.round(state.explode * 100)}" aria-label="Exploded view">`;
    ex.querySelector('input').oninput = e => api.setExplode(e.target.value / 100);
    const left = document.createElement('div'); left.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';
    left.append(seg, seg2);
    ui.append(left, ex); el.appendChild(ui);
    api_ui = { seg };
  }
  var api_ui;

  let dirty = true, visible = true, raf = 0, anim = null;
  const need = () => { dirty = true; if (!raf && visible) raf = requestAnimationFrame(loop); };
  controls.addEventListener('change', need);

  function placeCamera(v, instant) {
    if (o.mode !== 'drawing') shadowFloor.material.opacity = v === 'top' ? 0.16 : 0.55;
    const V = VIEWS[v] || VIEWS.iso;
    const dir = new THREE.Vector3(...V.dir).normalize();
    const aspect = W() / Math.max(1, H());
    const fovV = THREE.MathUtils.degToRad(camera.fov), fovH = 2 * Math.atan(Math.tan(fovV / 2) * aspect);
    const fit = Math.min(fovV, fovH) / 2;
    const dist = (fitR / Math.sin(fit)) * (o.fitMargin || (state.labels ? 1.22 : 1.08)) * (V.k || 1);
    const to = target.clone().add(dir.multiplyScalar(dist * (camera.userData.exScale || 1)));
    if (instant || REDUCED || o.still) { camera.position.copy(to); camera.lookAt(target); controls.update(); need(); return; }
    const from = camera.position.clone(); const t0 = performance.now(); const dur = 650;
    anim = (t) => { const k = Math.min(1, (t - t0) / dur); const e = k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      // slerp-ish around the target to avoid passing through the model
      const a = from.clone().sub(target), b = to.clone().sub(target);
      const len = a.length() + (b.length() - a.length()) * e;
      camera.position.copy(target).add(a.normalize().lerp(b.normalize(), e).normalize().multiplyScalar(len));
      camera.lookAt(target); if (k >= 1) anim = null; };
    need();
  }

  function applyExplode() {
    const t = state.explode;
    for (const k in parts) {
      const p = parts[k]; const ord = (PARTS_SPEC[k] || {}).order;
      if (ord === undefined || ord === 0 || !p.userData.home) continue;
      const kk = Math.min(1, Math.max(0, t * 5.2 - (ord - 1) * 0.9));
      const e = 1 - Math.pow(1 - kk, 3);
      p.position.copy(p.userData.home); p.position.y += e * (0.03 + ord * 0.03);
      if (k === 'cam') p.position.x += e * 0.06;
      if (k === 'x4') p.position.x -= e * 0.05;
    }
    if (parts.bracket) parts.bracket.position.y = (parts.lidar.position.y - parts.lidar.userData.home.y) * 0.55;
    const sc = 1 + 0.3 * t, prev = camera.userData.exScale || 1;
    if (Math.abs(sc - prev) > 1e-4) { camera.position.sub(controls.target).multiplyScalar(sc / prev).add(controls.target); camera.userData.exScale = sc; }
    if (target.userData === undefined) target.userData = {};
    const dy = 0.085 * t - (camera.userData.exLift || 0);
    if (Math.abs(dy) > 1e-5) { target.y += dy; controls.target.y += dy; camera.position.y += dy; camera.userData.exLift = 0.085 * t; }
    need();
  }

  // dimensions (computed once the robot is loaded)
  let dimDefs = []; let fitR = 0.5;
  function computeDims() {
    const box = new THREE.Box3().setFromObject(robot);
    const zF = box.max.z + 0.04;
    const groundY = -0.022;
    const topY = o.config === 'gen1' ? DECK_Y + MAST_H + 0.1236 : box.max.y;
    dimDefs = [
      { a: new THREE.Vector3(box.min.x, groundY, zF), b: new THREE.Vector3(box.max.x, groundY, zF), off: [0, -1], text: `${Math.round((box.max.x - box.min.x) * 1000)} mm overall length` },
      { a: new THREE.Vector3(box.min.x - 0.13, groundY, zF), b: new THREE.Vector3(box.min.x - 0.13, topY, zF), off: [-1, 0], text: `${Math.round((topY - groundY) * 1000)} mm` + (o.config === 'gen1' ? ' to top of X4' : ' overall height') },
    ];
    if (o.config === 'gen1') dimDefs.push({ a: new THREE.Vector3(-0.205 - 0.06, DECK_Y, zF), b: new THREE.Vector3(-0.205 - 0.06, DECK_Y + MAST_H, zF), off: [-1, 0], text: `${Math.round(MAST_H * 1000)} mm mast` });
  }

  const proj = (v) => { const p = v.clone().project(camera); return [(p.x * 0.5 + 0.5) * W(), (-p.y * 0.5 + 0.5) * H(), p.z]; };
  const ray = new THREE.Raycaster();
  let occl = {}, frame = 0;

  function overlay() {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const w = W(), h = H(), mob = w < 640;
    // callouts — two clean columns, sorted by anchor height, no crossings
    if (state.labels) {
      const items = labels.map(L => {
        const p = parts[L.k]; const wp = p.localToWorld(p.userData.anchor.clone());
        const [x, y, z] = proj(wp);
        if (frame % 6 === 0) {
          const dir = wp.clone().sub(camera.position); const dist = dir.length(); ray.set(camera.position, dir.normalize()); ray.far = dist;
          occl[L.k] = L.k !== 'head' && ray.intersectObject(robot, true).some(h => { if (h.object.userData.noOcc || h.object.isLine || h.object.isLineSegments || h.object.userData.hull || h.distance > dist - 0.03) return false; let n = h.object; while (n) { if (n === p) return false; n = n.parent; } return true; });
        }
        return { L, x, y, z, wp };
      });
      const cx = proj(target)[0];
      const balloon = o.callout === 'balloon' || (o.callout !== 'column' && mob);
      if (balloon) { placeBalloons(items, w, h, mob, cx); return dimsOverlay(); }
      if (legend) legend.style.display = 'none';
      if (camera.userData.shiftKey && camera.userData.shiftKey !== '0,0') { camera.userData.shiftKey = '0,0'; camera.userData.sx = camera.userData.sy = 0; camera.clearViewOffset(); camera.updateProjectionMatrix(); need(); }
      const leftCol = [], rightCol = [];
      for (const it of items) ((o.labelSide === 'right' ? false : o.labelSide === 'left' ? true : it.x < cx) ? leftCol : rightCol).push(it);
      const pad = mob ? 10 : 22, colW = mob ? 120 : 220, gap = mob ? 30 : 46;
      for (const [col, side] of [[leftCol, 'l'], [rightCol, 'r']]) {
        col.sort((a, b) => (a.y + (side === 'r' ? -0.45 : 0.45) * a.x) - (b.y + (side === 'r' ? -0.45 : 0.45) * b.x));
        col.forEach(it => { it.L.d.style.width = colW + 'px'; it.L.d.style.display = 'block'; it.hh = it.L.d.offsetHeight || 34; });
        let lastY = -1e9, lastH = 0; const top = mob ? 36 : 44, bottom = h - (mob ? 92 : 70);
        const ys = col.map(it => { let y = Math.max(it.y, lastY + lastH + (mob ? 8 : 14), top); lastY = y; lastH = it.hh; return y; });
        // shift up if overflowing bottom
        let over = (ys.length ? ys[ys.length - 1] : 0) - bottom;
        for (let i = ys.length - 1; i >= 0 && over > 0; i--) { ys[i] -= over; if (i > 0 && ys[i] - ys[i - 1] < col[i - 1].hh + 12) over = col[i - 1].hh + 12 - (ys[i] - ys[i - 1]); else over = 0; }
        col.forEach((it, i) => {
          const d = it.L.d; const ly = ys[i];
          const lx = side === 'r' ? w - pad - colW : pad;
          if (it.L.b) it.L.b.style.display = 'none';
          d.className = 'lbl ' + side + (occl[it.L.k] ? ' off' : '');
          d.style.left = (side === 'r' ? lx : lx) + 'px'; d.style.width = colW + 'px'; d.style.top = (ly - 10) + 'px'; d.style.display = 'block';
          const ex = side === 'r' ? lx - 8 : lx + colW + 8;
          const elbow = side === 'r' ? ex - 18 : ex + 18;
          const path = document.createElementNS(svg.namespaceURI, 'path');
          path.setAttribute('d', `M${it.x.toFixed(1)},${it.y.toFixed(1)} L${elbow.toFixed(1)},${ly.toFixed(1)} L${ex.toFixed(1)},${ly.toFixed(1)}`);
          path.setAttribute('fill', 'none'); path.setAttribute('stroke', occl[it.L.k] ? 'rgba(201,206,212,.18)' : 'rgba(201,206,212,.55)'); path.setAttribute('stroke-width', '1');
          svg.appendChild(path);
          const dot = document.createElementNS(svg.namespaceURI, 'circle');
          dot.setAttribute('cx', it.x); dot.setAttribute('cy', it.y); dot.setAttribute('r', 2.6);
          dot.setAttribute('fill', occl[it.L.k] ? 'rgba(232,163,61,.3)' : ACC); svg.appendChild(dot);
        });
      }
    } else { labels.forEach(L => { L.d.style.display = 'none'; if (L.b) L.b.style.display = 'none'; }); if (legend) legend.style.display = 'none'; }
    dimsOverlay();
  }

  // balloon callouts: lettered tags next to each part + a legend block (CAD convention)
  let legend = null;
  function placeBalloons(items, w, h, mob, cx) {
    if (!legend) {
      legend = document.createElement('div'); legend.className = 'leg';
      legend.innerHTML = labels.map(L => `<div><b>${L.sp.L}</b><span>${L.sp.t}</span><i>${L.sp.s}</i></div>`).join('');
      el.appendChild(legend);
    }
    legend.style.display = o.legend === false ? 'none' : 'grid';
    legend.classList.toggle('m', mob);
    const showLeg = o.legend !== false;
    const sy = (mob && showLeg) ? Math.round(legend.offsetHeight * 0.6) : 0;
    const sx = (!mob && showLeg) ? Math.round((legend.offsetWidth + 30) / 2) : 0;
    const key = sx + ',' + sy;
    if (key !== (camera.userData.shiftKey || '0,0')) { camera.userData.shiftKey = key; camera.userData.sx = sx; camera.userData.sy = sy;
      if (sx || sy) camera.setViewOffset(w, h, sx, -sy, w, h); else camera.clearViewOffset(); camera.updateProjectionMatrix(); need(); }
    const R = mob ? 11 : 12, D = mob ? 34 : 46;
    const pos = items.map(it => {
      const dx = it.x - cx, ang = it.L.k === 'head' ? 0.35 : (dx >= 0 ? -0.9 : -2.25);
      return { it, x: it.x + Math.cos(ang) * D, y: it.y + Math.sin(ang) * D };
    });
    for (let iter = 0; iter < 40; iter++) for (let i = 0; i < pos.length; i++) for (let j = i + 1; j < pos.length; j++) {
      const a = pos[i], b = pos[j], ddx = b.x - a.x, ddy = b.y - a.y, d = Math.hypot(ddx, ddy) || 0.01, min = 2 * R + 8;
      if (d < min) { const k = (min - d) / 2 / d; a.x -= ddx * k; a.y -= ddy * k; b.x += ddx * k; b.y += ddy * k; }
    }
    for (const P of pos) {
      const L = P.it.L; L.d.style.display = 'none';
      if (!L.b) { L.b = document.createElement('div'); L.b.className = 'bal'; L.b.textContent = L.sp.L; el.appendChild(L.b); }
      const off = occl[L.k];
      L.b.style.display = 'grid'; L.b.style.left = (P.x - R) + 'px'; L.b.style.top = (P.y - R) + 'px'; L.b.classList.toggle('off', !!off);
      const vx = P.x - P.it.x, vy = P.y - P.it.y, vl = Math.hypot(vx, vy) || 1;
      const ln = document.createElementNS(svg.namespaceURI, 'line');
      ln.setAttribute('x1', P.it.x); ln.setAttribute('y1', P.it.y); ln.setAttribute('x2', P.x - vx / vl * R); ln.setAttribute('y2', P.y - vy / vl * R);
      ln.setAttribute('stroke', off ? 'rgba(201,206,212,.2)' : 'rgba(201,206,212,.6)'); ln.setAttribute('stroke-width', 1); svg.appendChild(ln);
      const dot = document.createElementNS(svg.namespaceURI, 'circle'); dot.setAttribute('cx', P.it.x); dot.setAttribute('cy', P.it.y); dot.setAttribute('r', 2.4);
      dot.setAttribute('fill', off ? 'rgba(232,163,61,.3)' : ACC); svg.appendChild(dot);
    }
  }

  function dimsOverlay() {
    // dimensions
    if (state.dims) {
      for (const D of dimDefs) {
        const [ax, ay] = proj(D.a), [bx, by] = proj(D.b);
        const g = document.createElementNS(svg.namespaceURI, 'g');
        const ln = (x1, y1, x2, y2, op = .7) => { const l = document.createElementNS(svg.namespaceURI, 'line'); l.setAttribute('x1', x1); l.setAttribute('y1', y1); l.setAttribute('x2', x2); l.setAttribute('y2', y2); l.setAttribute('stroke', `rgba(201,206,212,${op})`); l.setAttribute('stroke-width', 1); g.appendChild(l); };
        ln(ax, ay, bx, by);
        const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1, nx = -dy / L * 6, ny = dx / L * 6;
        ln(ax - nx, ay - ny, ax + nx, ay + ny, .9); ln(bx - nx, by - ny, bx + nx, by + ny, .9);
        const t = document.createElementNS(svg.namespaceURI, 'text'); t.setAttribute('class', 'dimt');
        const mx = (ax + bx) / 2, my = (ay + by) / 2;
        if (Math.abs(dx) > Math.abs(dy)) { t.setAttribute('x', mx); t.setAttribute('y', my + 18); t.setAttribute('text-anchor', 'middle'); }
        else { const tx = mx + (D.off[0] >= 0 ? 16 : -9); t.setAttribute('x', tx); t.setAttribute('y', my); t.setAttribute('text-anchor', 'middle'); t.setAttribute('transform', `rotate(-90 ${tx} ${my})`); }
        t.textContent = D.text; g.appendChild(t); svg.appendChild(g);
      }
    }
  }

  function loop(t) {
    raf = 0;
    if (anim) anim(t);
    if (o.autorotate && !REDUCED) { controls.autoRotate = true; controls.autoRotateSpeed = 0.35; }
    const moving = controls.update();
    renderer.render(scene, camera);
    frame++; overlay();
    if ((anim || moving || controls.autoRotate || (controls.enableDamping && dirty)) && visible) { dirty = false; raf = requestAnimationFrame(loop); }
  }

  // visibility + resize
  const io = new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible) { startLoad && startLoad(); need(); } }, { rootMargin: '400px' });
  io.observe(el);
  const ro = new ResizeObserver(() => { renderer.setSize(W(), H()); camera.aspect = W() / Math.max(1, H()); if (camera.userData.sx || camera.userData.sy) camera.setViewOffset(W(), H(), camera.userData.sx || 0, -(camera.userData.sy || 0), W(), H()); camera.updateProjectionMatrix(); need(); });
  ro.observe(el);

  const api = {
    setView(v) { state.view = v; placeCamera(v); if (api_ui) api_ui.seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === v)); },
    setLabels(b) { state.labels = b; need(); },
    setDims(b) { state.dims = b; need(); },
    setExplode(x) { state.explode = x; applyExplode(); },
    ready: null,
    dispose() { io.disconnect(); ro.disconnect(); renderer.dispose(); el.innerHTML = ''; },
  };

  // load robot
  let startLoad; const gate = new Promise(r => (startLoad = r));
  if (o.eager || o.still) startLoad();
  api.ready = gate.then(() => new GLTFLoader().loadAsync(o.model || (HERE + 'assets/go2_stand.glb'))).then(gltf => {
    const matFor = { black: M.black, white: M.white, gray: M.shell, metal: M.alu };
    gltf.scene.traverse(n => {
      if (!n.isMesh) return;
      const key = Object.keys(matFor).find(k => (n.name || '').startsWith(k) || (n.parent && (n.parent.name || '').startsWith(k))) || 'gray';
      n.geometry = toCreasedNormals(n.geometry, (32 * Math.PI) / 180);
      n.material = matFor[key]; n.castShadow = true; n.receiveShadow = true;
    });
    robot.add(gltf.scene);
    if (o.mode === 'drawing') makeDrawing();
    { const bs = new THREE.Box3().setFromObject(robot).getBoundingSphere(new THREE.Sphere()); fitR = bs.radius; target.copy(bs.center); target.y -= 0.01; controls.target.copy(target); }
    computeDims(); applyExplode(); placeCamera(state.view, true);
    el.dataset.ready = '1'; el.dispatchEvent(new CustomEvent('fuviewer:ready'));
  });

  function makeDrawing() {
    const face = new THREE.MeshBasicMaterial({ color: 0x0a1020, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    const lineMat = new THREE.LineBasicMaterial({ color: 0xc9ced4, transparent: true, opacity: 0.85 });
    const accMat = new THREE.LineBasicMaterial({ color: new THREE.Color(ACC), transparent: true, opacity: 0.95 });
    const mkHull = (c) => { const m = new THREE.MeshBasicMaterial({ color: c, side: THREE.BackSide });
      m.onBeforeCompile = sh => { sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed = position + normal * 0.0016;'); }; return m; };
    const hullMat = mkHull(0xc9ced4), hullAcc = mkHull(new THREE.Color(ACC));
    robot.updateMatrixWorld(true);
    const payloadSet = new Set(); payload.traverse(n => payloadSet.add(n));
    const list = []; robot.traverse(n => { if (n.isMesh) list.push(n); });
    for (const n of list) {
      n.material = face; n.castShadow = false;
      const isPay = payloadSet.has(n);
      const eg = new THREE.EdgesGeometry(n.geometry, isPay ? 25 : 36);
      const ls = new THREE.LineSegments(eg, isPay ? accMat : lineMat);
      n.add(ls);
      const hull = new THREE.Mesh(n.geometry, isPay ? hullAcc : hullMat); hull.userData.hull = true; n.add(hull);
    }
    scene.environment = null; grid.visible = false;
    const gl = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.62, -0.022, 0), new THREE.Vector3(0.62, -0.022, 0)]), new THREE.LineBasicMaterial({ color: 0x6b7480 }));
    scene.add(gl);
  }

  placeCamera(state.view, true);
  need();
  return api;
}

const FUViewer = { mount };
window.FUViewer = FUViewer;
// auto-mount
function auto() {
  document.querySelectorAll('[data-fu-viewer]').forEach(el => {
    if (el.dataset.fuMounted) return; el.dataset.fuMounted = '1';
    const d = el.dataset;
    el.fuViewer = mount(el, { config: d.config || 'gen1', view: d.view || 'iso', labels: d.labels !== 'false', dims: d.dims === 'true',
      explode: +(d.explode || 0), ui: d.ui !== 'false', mode: d.mode || 'studio', fallback: d.fallback || '', notag: d.tag === 'false', still: d.still === 'true', poster: d.poster || '', eager: d.eager === 'true', callout: d.callout || '', legend: d.legend !== 'false' });
  });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto); else auto();
window.dispatchEvent(new CustomEvent('fuviewer:loaded'));
export default FUViewer;
