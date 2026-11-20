/* Live fleet view (Robotics): robots operating in the Hotel.OS digital twin, with live telemetry.
   Same illustrative tower as the program twin (hotel-twin.js). Simulated data; fields follow the
   Open-RMF fleet-state model (name, model, mode, battery, location with level, task).
   ES module; needs an import map for "three" and "three/addons/" (three@0.160.0).
   Auto-mounts every [data-fleet-live] element. */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const NF = 8, FH = 5.2, WH = 3.0, LX = 32, CZ = 1.5, DZ = 9.5;
const KIND = {
  delivery: { c: '#38D0FF', v: 1.0, drain: .055, label: 'Delivery' },
  luggage: { c: '#F2B544', v: .8, drain: .05, label: 'Luggage' },
  linen: { c: '#B49CFF', v: .9, drain: .05, label: 'Logistics' },
  clean: { c: '#3FD08A', v: .55, drain: .07, label: 'Floor care' },
};
const IMG = { 'Pudu CC1 Pro': 'img/fc-cc1pro-cut.webp', 'Pudu MT1 Vac': 'img/fc-mt1vac-cut.webp', 'Keenon S100': 'img/aug-s100-luggage-cut.webp', 'Pudu T300 Lifting': 'img/aug-base-bin-cut.webp' };

/* ---------- building (identical plan to the program twin) ---------- */
function plan() {
  const walls = [], rooms = [];
  walls.push([-LX, -DZ, LX, -DZ], [-LX, DZ, LX, DZ], [-LX, -DZ, -LX, DZ], [LX, -DZ, LX, DZ]);
  for (let i = 0; i < 16; i++) rooms.push({ x0: -LX + i * 4, x1: -LX + (i + 1) * 4, z0: CZ, z1: DZ, side: 1, kind: 'room' });
  rooms.push({ x0: -LX, x1: -24, z0: -DZ, z1: -CZ, side: -1, kind: 'core' });
  for (let i = 0; i < 12; i++) rooms.push({ x0: -24 + i * 4, x1: -20 + i * 4, z0: -DZ, z1: -CZ, side: -1, kind: 'room' });
  rooms.push({ x0: 24, x1: LX, z0: -DZ, z1: -CZ, side: -1, kind: 'boh' });
  rooms.forEach(r => { if (r.x0 > -LX) walls.push([r.x0, r.z0, r.x0, r.z1]); });
  [CZ, -CZ].forEach(z => {
    const side = z > 0 ? 1 : -1;
    const doors = rooms.filter(r => r.side === side).map(r => (r.kind === 'core' ? r.x0 + 4 : r.x0 + 2.6));
    let x = -LX;
    doors.sort((a, b) => a - b).forEach(d => { walls.push([x, z, d - 0.5, z]); x = d + 0.5; });
    walls.push([x, z, LX, z]);
  });
  [[-31, -9], [-28.5, -9]].forEach(([x, z]) => { walls.push([x, z, x + 2.2, z], [x + 2.2, z, x + 2.2, z + 2.4], [x + 2.2, z + 2.4, x, z + 2.4], [x, z + 2.4, x, z]); });
  return { walls, rooms };
}

/* ---------- places on the route graph ---------- */
const room = (f, side, i) => side > 0
  ? { f, x: -LX + i * 4 + 2.6, z: CZ + 2.6, xd: -LX + i * 4 + 2.6, label: `Room ${f + 1}${String(i + 1).padStart(2, '0')}` }
  : { f, x: -24 + i * 4 + 2.6, z: -CZ - 2.6, xd: -24 + i * 4 + 2.6, label: `Room ${f + 1}${String(17 + i).padStart(2, '0')}` };
const BOH = f => ({ f, x: 27.6, z: -5.4, xd: 26.6, label: `L${f + 1} back of house` });
const DESK = { f: 0, x: -1.4, z: -CZ - 2.4, xd: -1.4, label: 'Front desk · lobby cooler' };
const ENTR = { f: 0, x: LX - 1.5, z: 0, xd: LX - 1.5, label: 'Main entrance' };
const DOCK = (f, k) => ({ f, x: 25.6 + k * 1.7, z: -8.3, xd: 26.6, label: `Charger L${f + 1}-${k + 1}` });
const LOBBY = { x: -28, z: -4.2 };
const CARS = [{ id: 'A', x: -29.9, z: -7.8, y: 0, target: 0, busy: null, rides: 0 }, { id: 'B', x: -27.4, z: -7.8, y: 3, target: 3, busy: null, rides: 0 }];

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const R = rng(11);
const pick = a => a[Math.floor(R() * a.length)];
const randRoom = (fmin = 1) => { const f = fmin + Math.floor(R() * (NF - fmin)); return R() < .55 ? room(f, 1, Math.floor(R() * 16)) : room(f, -1, Math.floor(R() * 12)); };

function discTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.4, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/* ---------- simulation ---------- */
function makeFleet() {
  const F = [
    { id: 'W3-01', model: 'Keenon W3', kind: 'delivery', at: DESK, bat: 82 },
    { id: 'W3-02', model: 'Keenon W3', kind: 'delivery', at: DESK, bat: 31 },
    { id: 'S100-01', model: 'Keenon S100', kind: 'luggage', at: ENTR, bat: 67 },
    { id: 'T300-01', model: 'Pudu T300 Lifting', kind: 'linen', at: BOH(0), bat: 74 },
    { id: 'CC1-01', model: 'Pudu CC1 Pro', kind: 'clean', at: { f: 0, x: -30, z: -1.05, xd: -30 }, bat: 58, floor: 0 },
    { id: 'CC1-02', model: 'Pudu CC1 Pro', kind: 'clean', at: { f: 1, x: -30, z: -1.05, xd: -30 }, bat: 27, floor: 1 },
    { id: 'MT1V-01', model: 'Pudu MT1 Vac', kind: 'clean', at: { f: 4, x: -30, z: -1.05, xd: -30 }, bat: 88, floor: 4 },
    { id: 'MT1V-02', model: 'Pudu MT1 Vac', kind: 'clean', at: { f: 6, x: -30, z: -1.05, xd: -30 }, bat: 63, floor: 6 },
  ];
  return F.map(o => ({ ...o, k: KIND[o.kind], f: o.at.f, x: o.at.x, z: o.at.z, yaw: 0, speed: 0, battery: o.bat, mode: 'IDLE', steps: [], task: null,
    odo: 2.4 + R() * 6, tasks: Math.floor(3 + R() * 9), area: o.kind === 'clean' ? Math.round(600 + R() * 900) : 0, loc: .97, liftY: null,
    hist: { bat: [], spd: [] }, cov: null, lastCov: null, taskStart: 0, faults: 0 }));
}

function mount(root) {
  const P = plan();
  const ui = buildUI(root);
  const canvas = ui.canvas;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setClearColor(0x070B16, 1);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05080F);
  scene.fog = new THREE.Fog(0x070B16, 120, 260);
  const camera = new THREE.PerspectiveCamera(38, 1, .5, 600);
  const mid = new THREE.Vector3(0, NF * FH / 2 - 2, 0);
  camera.position.set(74, 34, 92);
  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(mid); controls.enableDamping = true; controls.dampingFactor = .08; controls.minDistance = 14; controls.maxDistance = 190; controls.maxPolarAngle = Math.PI * .49;
  controls.autoRotate = !REDUCED; controls.autoRotateSpeed = .25;
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), .35, .3, .7); composer.addPass(bloom);
  composer.addPass(new OutputPass());

  /* floors */
  const floors = [];
  for (let f = 0; f < NF; f++) {
    const y0 = f * FH, g = new THREE.Group(); g.userData.mats = [];
    const slabM = new THREE.MeshBasicMaterial({ color: 0x0C1324, transparent: true, opacity: .72, depthWrite: false });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(2 * LX, .18, 2 * DZ), slabM); slab.position.set(0, y0 - .09, 0); g.add(slab);
    const corM = new THREE.MeshBasicMaterial({ color: 0x1B3A78, transparent: true, opacity: .8, depthWrite: false });
    const cor = new THREE.Mesh(new THREE.PlaneGeometry(2 * LX, 2 * CZ), corM); cor.rotation.x = -Math.PI / 2; cor.position.set(0, y0 + .01, 0); g.add(cor);
    const lp = [], fp = [];
    P.walls.forEach(([x1, z1, x2, z2]) => {
      lp.push(x1, y0, z1, x2, y0, z2, x1, y0 + WH, z1, x2, y0 + WH, z2);
      fp.push(x1, y0, z1, x2, y0, z2, x2, y0 + WH, z2, x1, y0, z1, x2, y0 + WH, z2, x1, y0 + WH, z1);
    });
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
    const lineM = new THREE.LineBasicMaterial({ color: 0x6E8FDB, transparent: true, opacity: .34 });
    g.add(new THREE.LineSegments(lg, lineM));
    const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3));
    const faceM = new THREE.MeshBasicMaterial({ color: 0x1A2A55, transparent: true, opacity: .1, side: THREE.DoubleSide, depthWrite: false });
    g.add(new THREE.Mesh(fg, faceM));
    // chargers in back of house
    const chM = new THREE.MeshBasicMaterial({ color: 0x3FD08A, transparent: true, opacity: .85 });
    for (let k = 0; k < 4; k++) { const d = DOCK(f, k); const b = new THREE.Mesh(new THREE.BoxGeometry(.9, .5, .4), chM); b.position.set(d.x, y0 + .25, d.z - .9); g.add(b); }
    g.userData.mats.push([slabM, .72], [corM, .8], [lineM, .34], [faceM, .1], [chM, .85]);
    scene.add(g); floors.push(g);
  }
  /* lift shafts and cars */
  const shaftM = new THREE.LineBasicMaterial({ color: 0xD4A65A, transparent: true, opacity: .35 });
  CARS.forEach(c => {
    const pts = []; [[-1.1, -1.2], [1.1, -1.2], [1.1, 1.2], [-1.1, 1.2]].forEach(([dx, dz]) => pts.push(c.x + dx, -.2, c.z + dz, c.x + dx, NF * FH - 1, c.z + dz));
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); scene.add(new THREE.LineSegments(g, shaftM));
    const box = new THREE.Mesh(new THREE.BoxGeometry(2.1, 2.6, 2.3), new THREE.MeshBasicMaterial({ color: 0xD4A65A, transparent: true, opacity: .18, depthWrite: false }));
    box.add(new THREE.LineSegments(new THREE.EdgesGeometry(box.geometry), new THREE.LineBasicMaterial({ color: 0xF2C66D })));
    scene.add(box); c.mesh = box;
  });

  /* robots */
  const glow = discTex();
  const fleet = makeFleet();
  const covGeo = new THREE.PlaneGeometry(.75, .55); covGeo.rotateX(-Math.PI / 2);
  const texL = new THREE.TextureLoader();
  const w3Tex = (() => {   // drawn Keenon-style delivery robot (no product cut-out available)
    const c = document.createElement('canvas'); c.width = 256; c.height = 400; const g = c.getContext('2d');
    const body = g.createLinearGradient(40, 0, 216, 0); body.addColorStop(0, '#C9D2DE'); body.addColorStop(.5, '#FFFFFF'); body.addColorStop(1, '#AEB8C6');
    g.fillStyle = body; g.beginPath(); g.roundRect(46, 40, 164, 300, 46); g.fill();
    g.fillStyle = '#0B1426'; g.beginPath(); g.roundRect(70, 70, 116, 78, 20); g.fill();
    g.fillStyle = '#38D0FF'; g.shadowColor = '#38D0FF'; g.shadowBlur = 18; g.beginPath(); g.roundRect(94, 96, 22, 28, 8); g.fill(); g.beginPath(); g.roundRect(140, 96, 22, 28, 8); g.fill();
    g.fillRect(60, 178, 136, 7); g.shadowBlur = 0;
    g.strokeStyle = 'rgba(11,20,38,.35)'; g.lineWidth = 3; g.beginPath(); g.moveTo(60, 230); g.lineTo(196, 230); g.moveTo(60, 284); g.lineTo(196, 284); g.stroke();
    g.fillStyle = '#1B2438'; g.beginPath(); g.roundRect(56, 330, 144, 40, 14); g.fill();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const pingGeo = new THREE.RingGeometry(1.7, 1.95, 48); pingGeo.rotateX(-Math.PI / 2);
  fleet.forEach(r => {
    const col = new THREE.Color(r.k.c), g = new THREE.Group();
    const H = { 'Keenon W3': 3.6, 'Keenon S100': 3.8, 'Pudu T300 Lifting': 3.0, 'Pudu CC1 Pro': 2.9, 'Pudu MT1 Vac': 2.4 }[r.model] || 3;
    const tex = IMG[r.model] ? texL.load(IMG[r.model], t => { t.colorSpace = THREE.SRGBColorSpace; const a = t.image.width / t.image.height; spr.scale.set(H * a, H, 1); }) : w3Tex;
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
    spr.center.set(.5, 0); spr.scale.set(H * .64, H, 1); spr.position.y = .05; spr.renderOrder = 12; g.add(spr);
    const pool = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: col, transparent: true, opacity: .75, depthWrite: false, depthTest: false, blending: THREE.NormalBlending })); pool.renderOrder = 11;
    pool.scale.set(5, 2.2, 1); pool.material.opacity = .35; pool.position.y = .2; g.add(pool);
    const ringM = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: .95, side: THREE.DoubleSide, depthWrite: false, depthTest: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.55, 1.7, 48), ringM); ring.rotation.x = -Math.PI / 2; ring.position.y = .06; ring.renderOrder = 11; g.add(ring);
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(.42, .9, 3), new THREE.MeshBasicMaterial({ color: col })); arrow.rotation.x = Math.PI / 2; arrow.position.set(0, .08, 2.35); arrow.scale.y = .25; g.add(arrow);
    const ping = new THREE.Mesh(pingGeo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0, depthWrite: false })); ping.position.y = .07;
    const pg = new THREE.Group(); pg.add(ping); scene.add(pg);
    const trailG = new THREE.BufferGeometry(); const trail = new THREE.Line(trailG, new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: .4, depthWrite: false })); trail.frustumCulled = false; scene.add(trail);
    r.mesh = g; r.ring = ring; r.spr = spr; r.pool = pool; r.arrow = arrow; r.ping = ping; r.pingG = pg; r.trail = trail; r.trailPts = []; r.pingT = R() * 2; scene.add(g);
    if (r.kind === 'clean') {
      r.cov = new THREE.InstancedMesh(covGeo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: .4, depthWrite: false }), 1800);
      r.cov.count = 0; r.cov.frustumCulled = false; scene.add(r.cov);
    }
  });
  /* destination beacon + planned path for the selected robot */
  const beacon = new THREE.Group();
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(.12, .12, 7, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .7 })); beam.position.y = 3.5; beacon.add(beam);
  const bring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.4, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .9, side: THREE.DoubleSide })); bring.rotation.x = -Math.PI / 2; bring.position.y = .06; beacon.add(bring);
  scene.add(beacon);
  const pathM = new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: .9, gapSize: .6, transparent: true, opacity: .85 });
  const pathL = new THREE.Line(new THREE.BufferGeometry(), pathM); pathL.frustumCulled = false; scene.add(pathL);

  /* ---------- simulation state ---------- */
  const S = { t: 0, clock: 21 * 3600 + 40 * 60, scale: 2, paused: false, sel: fleet[0], follow: false, tour: true, tourT: 0, tourI: 0,
    deliveries: 37, delivTimes: [372, 405, 388, 512, 298, 446, 331, 690, 402, 365, 958, 420, 384, 451, 309, 377], lift: 52, base: 4180, log: [] };
  /* GM metrics. Assumptions (est.) are shown on the page next to the dashboards. */
  const EST = { rate: 22, delivMin: 12, lugMin: 15, linenMin: 20, m2h: 400, fleetMo: 12900, fleetN: 20, target: 900 };
  const HRS = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];
  const M = { lug: 34, lin: 13, ontime: 36, total: 37, hourly: {},
    seed: { delivery: [2, 3, 4, 3, 2, 3, 4, 3, 2, 3, 3, 5], luggage: [3, 4, 2, 1, 2, 3, 5, 6, 4, 2, 1, 1], linen: [1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 1, 0], clean: [0, 0, 1, 1, 0, 0, 1, 1, 1, 1, 2, 1] } };
  M.types = { 'Towels and linen': 14, 'Amenity kits': 9, 'Snacks and water': 8, 'Chargers and other': 6, 'Luggage': 34 };
  const TYPE = it => /towel|pillow/.test(it) ? 'Towels and linen' : /amenity|toothbrush/.test(it) ? 'Amenity kits' : /snack|water/.test(it) ? 'Snacks and water' : 'Chargers and other';
  HRS.forEach((h, i) => { M.hourly[h] = { delivery: M.seed.delivery[i], luggage: M.seed.luggage[i], linen: M.seed.linen[i], clean: M.seed.clean[i] }; });
  const bump = k => { const h = Math.floor(S.clock / 3600) % 24; (M.hourly[h] = M.hourly[h] || { delivery: 0, luggage: 0, linen: 0, clean: 0 })[k]++; ui.dirtyDash = true; };
  const fmt = s => { s = Math.floor(s) % 86400; return [s / 3600, (s % 3600) / 60, s % 60].map(v => String(Math.floor(v)).padStart(2, '0')).join(':'); };
  const log = (r, msg, lvl) => { S.log.unshift({ t: fmt(S.clock), id: r ? r.id : 'Hotel.OS', c: r ? r.k.c : '#D4A65A', msg, lvl }); S.log.length = Math.min(S.log.length, 40); ui.dirtyLog = true; };
  let taskN = 412; const tid = () => `T-1120-${String(++taskN).padStart(4, '0')}`;

  let carRR = 0;
  function go(r, q, mode) {
    const p = r.planAt || r.at;
    if (p.f === q.f) r.steps.push({ t: 'move', i: 0, pts: [{ x: p.xd, z: 0 }, { x: q.xd, z: 0 }, { x: q.x, z: q.z }], mode });
    else {
      const car = CARS[(carRR++) % 2];
      r.steps.push({ t: 'move', i: 0, pts: [{ x: p.xd, z: 0 }, { x: LOBBY.x, z: 0 }, LOBBY], mode });
      r.steps.push({ t: 'call', car, f: p.f });
      r.steps.push({ t: 'move', i: 0, pts: [{ x: car.x, z: car.z }], mode: 'BOARDING LIFT ' + car.id, slow: .6 });
      r.steps.push({ t: 'ride', car, to: q.f });
      r.steps.push({ t: 'move', i: 0, pts: [LOBBY, { x: LOBBY.x, z: 0 }], mode: 'EXITING LIFT ' + car.id, slow: .6 });
      r.steps.push({ t: 'release', car });
      r.steps.push({ t: 'move', i: 0, pts: [{ x: q.xd, z: 0 }, { x: q.x, z: q.z }], mode });
    }
    r.planAt = q;
  }
  const dwell = (r, sec, mode, done) => r.steps.push({ t: 'dwell', left: sec, mode, done });
  const fn = (r, f) => r.steps.push({ t: 'fn', f });

  function planNext(r) {
    const prev = r.planAt || r.at;
    r.planAt = r.at = { f: r.f, x: r.x, z: r.z, xd: prev && Math.hypot(prev.x - r.x, prev.z - r.z) < .6 ? prev.xd : r.x };
    if (r.kind !== 'clean' && r.battery < 28) {
      const d = DOCK(0, fleet.indexOf(r) % 4);
      fn(r, () => { r.task = { id: tid(), label: `Return to ${d.label}` }; log(r, `battery ${Math.round(r.battery)}%: returning to charge`, 'warn'); });
      go(r, d, 'RETURNING TO DOCK'); r.steps.push({ t: 'charge', until: 92 });
      fn(r, () => log(r, 'charged to 92%, back in service'));
      return;
    }
    if (r.kind === 'delivery') {
      if (Math.hypot(r.x - DESK.x, r.z - DESK.z) > 1 || r.f !== 0) { go(r, DESK, 'RETURNING'); return; }
      const q = randRoom(1), items = pick(['amenity kit', 'two bath towels', 'toothbrush set', 'phone charger', 'bottled water ×4', 'snack box', 'extra pillows']);
      fn(r, () => { r.task = { id: tid(), label: `Deliver ${items} → ${q.label}`, guest: q.label }; r.taskStart = S.t; log(r, `order ${r.task.id}: ${items} for ${q.label}`); });
      dwell(r, 7, 'LOADING AT DESK');
      go(r, q, 'DELIVERING');
      dwell(r, R() < .3 ? 70 + R() * 50 : 10 + R() * 9, 'AT DOOR · GUEST PIN', () => { S.deliveries++; r.tasks++; const dtm = (S.t - r.taskStart) * 1; M.total++; if (dtm <= EST.target) M.ontime++; bump('delivery'); M.types[TYPE(items)]++; S.delivTimes.push(dtm); if (S.delivTimes.length > 16) S.delivTimes.shift(); log(r, `delivered to ${q.label} · ${Math.round(dtm / 60)} min ${Math.round(dtm % 60)} s`, 'ok'); r.task = { id: r.task.id, label: 'Return to front desk' }; });
      go(r, DESK, 'RETURNING');
    } else if (r.kind === 'luggage') {
      if (Math.hypot(r.x - ENTR.x, r.z - ENTR.z) > 1 || r.f !== 0) { go(r, ENTR, 'RETURNING'); return; }
      const q = randRoom(1);
      fn(r, () => { r.task = { id: tid(), label: `Luggage → ${q.label}`, guest: q.label }; r.taskStart = S.t; log(r, `luggage check-in: 2 bags for ${q.label}`); });
      dwell(r, 9, 'LOADING LUGGAGE');
      go(r, q, 'DELIVERING');
      dwell(r, 12, 'AT DOOR · GUEST', () => { r.tasks++; M.lug++; M.types['Luggage']++; bump('luggage'); log(r, `luggage delivered to ${q.label}`, 'ok'); r.task = { id: r.task.id, label: 'Return to entrance' }; });
      go(r, ENTR, 'RETURNING');
    } else if (r.kind === 'linen') {
      const f = 1 + Math.floor(R() * (NF - 1));
      if (r.f !== 0) { go(r, BOH(0), 'RETURNING'); return; }
      fn(r, () => { r.task = { id: tid(), label: `Clean linen rack → L${f + 1} back of house` }; log(r, `linen run to L${f + 1}: clean rack out, soiled rack back`); });
      dwell(r, 6, 'LIFTING RACK');
      go(r, BOH(f), 'DELIVERING');
      dwell(r, 9, 'SWAPPING RACK', () => { r.tasks++; M.lin++; bump('linen'); log(r, `rack swapped on L${f + 1}`, 'ok'); r.task = { id: r.task.id, label: 'Soiled linen → laundry (L1)' }; });
      go(r, BOH(0), 'RETURNING');
      dwell(r, 6, 'UNLOADING');
    } else {
      const F = r.floor, lanes = [-1.05, -.35, .35, 1.05], pts = [];
      lanes.forEach((z, i) => { const a = i % 2 ? 30 : -30, b = i % 2 ? -30 : 30; pts.push({ x: a, z }, { x: b, z }); });
      const start = { f: F, x: -30, z: -1.05, xd: -30 };
      if (r.battery < 25) {
        const d = DOCK(F, fleet.indexOf(r) % 4);
        fn(r, () => { r.task = { id: tid(), label: `Return to ${d.label}` }; log(r, `battery ${Math.round(r.battery)}%: pausing zone, returning to dock`, 'warn'); });
        go(r, d, 'RETURNING TO DOCK'); r.steps.push({ t: 'charge', until: 95 }); fn(r, () => log(r, 'charged to 95%, resuming zone')); go(r, start, 'TO ZONE'); r.planAt = start;
        return;
      }
      const zone = r.kind === 'clean' && r.model.includes('CC1') ? (F === 0 ? 'lobby corridor · wet scrub' : `L${F + 1} corridor · scrub`) : `L${F + 1} corridor · carpet vacuum`;
      fn(r, () => { r.task = { id: tid(), label: `Clean ${zone}` }; r.zoneArea = 0; log(r, `started zone: ${zone}`); });
      if (Math.hypot(r.x - start.x, r.z - start.z) > .5) r.steps.push({ t: 'move', i: 0, pts: [{ x: start.x, z: start.z }], mode: 'TO ZONE' });
      r.steps.push({ t: 'move', i: 0, pts, mode: 'CLEANING', clean: true });
      dwell(r, 14, 'ZONE COMPLETE', () => { r.tasks++; r.zonesDone = (r.zonesDone || 0) + 1; bump('clean'); log(r, `zone complete · ${Math.round(r.zoneArea)} m² · 100% coverage`, 'ok'); if (r.cov) r.cov.count = 0; });
      r.planAt = { f: F, x: pts[pts.length - 1].x, z: pts[pts.length - 1].z, xd: pts[pts.length - 1].x };
    }
  }

  const M4 = new THREE.Matrix4();
  function stepRobot(r, dt) {
    let s = r.steps[0];
    if (!s) { planNext(r); s = r.steps[0]; if (!s) return; }
    const moving = s.t === 'move';
    if (s.t === 'move') {
      const tg = s.pts[s.i], dx = tg.x - r.x, dz = tg.z - r.z, d = Math.hypot(dx, dz);
      const v = r.k.v * (s.slow || 1); r.speed += (v - r.speed) * Math.min(1, dt * 2.5);
      const st = r.speed * dt; r.mode = s.mode || 'MOVING';
      if (d <= st) { r.x = tg.x; r.z = tg.z; s.i++; if (s.i >= s.pts.length) r.steps.shift(); }
      else { r.x += dx / d * st; r.z += dz / d * st; const ty = Math.atan2(dx, dz); let dy = ty - r.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); r.yaw += dy * Math.min(1, dt * 6); }
      r.odo += Math.min(st, d) / 1000;
      if (s.clean) {
        const a = Math.min(st, d) * .55; r.area += a; r.zoneArea = (r.zoneArea || 0) + a;
        if (r.cov && (!r.lastCov || Math.hypot(r.x - r.lastCov.x, r.z - r.lastCov.z) > .45) && r.cov.count < 1800) {
          M4.makeRotationY(r.yaw); M4.setPosition(r.x, r.f * FH + .03, r.z); r.cov.setMatrixAt(r.cov.count++, M4); r.cov.instanceMatrix.needsUpdate = true; r.lastCov = { x: r.x, z: r.z };
        }
      }
    } else if (s.t === 'dwell') {
      r.speed *= .85; r.mode = s.mode; s.left -= dt; if (s.left <= 0) { r.steps.shift(); s.done && s.done(); }
    } else if (s.t === 'call') {
      r.speed *= .85; const c = s.car; r.mode = 'WAITING FOR LIFT ' + c.id;
      if (!c.busy) { c.busy = r; c.target = s.f; }
      if (c.busy === r && Math.abs(c.y - s.f) < .02) { r.steps.shift(); }
    } else if (s.t === 'ride') {
      const c = s.car; c.target = s.to; r.mode = `IN LIFT ${c.id} · L${Math.round(c.y) + 1}→L${s.to + 1}`; r.speed = 0; r.liftY = c.y;
      if (!s.logged) { s.logged = 1; S.lift++; c.rides++; log(r, `boarded lift ${c.id} at L${r.f + 1} → L${s.to + 1}`); }
      if (Math.abs(c.y - s.to) < .02) { r.f = s.to; r.liftY = null; r.steps.shift(); }
    } else if (s.t === 'release') { s.car.busy = null; r.steps.shift(); }
    else if (s.t === 'charge') { r.mode = 'CHARGING'; r.speed = 0; r.battery = Math.min(100, r.battery + dt * .45); if (r.battery >= s.until) r.steps.shift(); }
    else if (s.t === 'fn') { r.steps.shift(); s.f(); }
    r.battery = Math.max(3, r.battery - dt * (moving ? r.k.drain : r.mode === 'CHARGING' ? 0 : .008));
    if (r.mode === r._pm) r.modeT = (r.modeT || 0) + dt; else { r._pm = r.mode; r.modeT = 0; }
    const u = r.util || (r.util = { work: 900 + R() * 600, charge: 120 + R() * 200, idle: 60 + R() * 160 });
    if (/CHARG/.test(r.mode)) u.charge += dt; else if (/WAITING FOR LIFT|IDLE|COMPLETE/.test(r.mode)) u.idle += dt; else u.work += dt;
    r.loc = Math.max(.9, Math.min(.995, r.loc + (R() - .5) * .004 + (.975 - r.loc) * .02));
  }
  function stepCars(dt) {
    CARS.forEach(c => { const d = c.target - c.y, v = .55 * dt; c.y = Math.abs(d) <= v ? c.target : c.y + Math.sign(d) * v; });
  }
  function sim(dt) {
    S.t += dt; S.clock += dt;
    stepCars(dt); fleet.forEach(r => stepRobot(r, dt));
  }
  // spread the fleet out before first paint
  for (let i = 0; i < 900; i++) sim(.2);
  S.log.length = 0;
  log(null, 'night shift: 8 robots on duty · 2 lifts shared · Hotel.OS dispatch online');
  for (let i = 0; i < 60; i++) sim(.2);

  /* ---------- view updates ---------- */
  const tmpV = new THREE.Vector3();
  function placeMeshes(time) {
    fleet.forEach(r => {
      const y = (r.liftY != null ? r.liftY : r.f) * FH;
      r.mesh.position.set(r.x, y, r.z);
      const zk = THREE.MathUtils.clamp(camera.position.distanceTo(r.mesh.position) / 42, 1, 2.3); r.mesh.scale.setScalar(zk); r.zk = zk;
      r.arrow.position.set(Math.sin(r.yaw) * 2.35, .08, Math.cos(r.yaw) * 2.35); r.arrow.rotation.set(Math.PI / 2, 0, -r.yaw); r.arrow.visible = r.speed > .05;
      const sel = r === S.sel; r.ring.scale.setScalar(sel ? 1.25 + Math.sin(time * 5) * .1 : 1);
      // LiDAR ping while moving
      r.pingT += .016; const ph = (r.pingT % 2.2) / 2.2; r.pingG.position.set(r.x, y, r.z); r.ping.scale.setScalar(1 + ph * 2.6); r.ping.material.opacity = r.speed > .1 ? (1 - ph) * .18 : 0;
      // glowing trail
      const lp = r.trailPts[r.trailPts.length - 1];
      if (!lp || Math.hypot(lp.x - r.x, lp.z - r.z) > .5 || Math.abs(lp.y - y) > .3) { r.trailPts.push(new THREE.Vector3(r.x, y + .12, r.z)); if (r.trailPts.length > 48) r.trailPts.shift(); r.trail.geometry.dispose(); r.trail.geometry = new THREE.BufferGeometry().setFromPoints(r.trailPts.length > 1 ? r.trailPts : [r.trailPts[0], r.trailPts[0]]); }
    });
    CARS.forEach(c => c.mesh.position.set(c.x, c.y * FH + 1.3, c.z));
    // selected robot: path + destination beacon
    const r = S.sel, pts = []; let dest = null, df = r.f;
    const y0 = (r.liftY != null ? r.liftY : r.f) * FH + .25;
    pts.push(new THREE.Vector3(r.x, y0, r.z));
    for (const s of r.steps) {
      if (s.t === 'ride') break;
      if (s.t === 'move') { for (let i = s.i || 0; i < s.pts.length; i++) pts.push(new THREE.Vector3(s.pts[i].x, y0, s.pts[i].z)); }
    }
    const lastPlan = r.planAt; if (lastPlan) { dest = lastPlan; df = lastPlan.f; }
    pathL.geometry.dispose(); pathL.geometry = new THREE.BufferGeometry().setFromPoints(pts.length > 1 ? pts : [pts[0], pts[0]]); pathL.computeLineDistances();
    pathM.color.set(r.k.c);
    if (dest) { beacon.visible = true; beacon.position.set(dest.x, df * FH, dest.z); beacon.children.forEach(m => m.material.color.set(r.k.c)); bring.scale.setScalar(1 + (time * 1.5 % 1) * .6); bring.material.opacity = .9 - (time * 1.5 % 1) * .7; }
    else beacon.visible = false;
    // floor focus when following
    const focusF = S.follow ? (r.liftY != null ? Math.round(r.liftY) : r.f) : -1;
    floors.forEach((g, f) => { const k = focusF < 0 || f === focusF ? 1 : .22; g.userData.mats.forEach(([m, o]) => { m.opacity = o * k; }); });
    fleet.forEach(o => { const vis = focusF < 0 || o.f === focusF || o.liftY != null; o.spr.material.opacity = vis ? 1 : .18; o.pool.material.opacity = vis ? .35 : .06; o.trail.material.opacity = vis ? .4 : .06; o.ring.material.opacity = vis ? .95 : .15; if (o.cov) o.cov.material.opacity = vis ? .4 : .08; });
  }
  function labels() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const placed = [];
    const order = fleet.slice().sort((a, b) => (b === S.sel) - (a === S.sel));
    order.forEach(r => {
      tmpV.copy(r.mesh.position); tmpV.y += ((r.spr.scale.y || 3) + .6) * (r.zk || 1); tmpV.project(camera);
      const el = r.lab, x = (tmpV.x * .5 + .5) * w, y = (-tmpV.y * .5 + .5) * h;
      let vis = tmpV.z < 1 && x > 30 && x < w - 30 && y > 64 && y < h - 6;
      const bw = 78, bh = 22;
      if (vis && r !== S.sel && placed.some(p => Math.abs(p.x - x) < bw && Math.abs(p.y - y) < bh)) vis = false;
      if (vis) placed.push({ x, y });
      el.style.display = vis ? '' : 'none';
      if (vis) el.style.transform = `translate(${x}px,${y}px) translate(-50%,-100%)`;
      el.classList.toggle('sel', r === S.sel);
    });
    for (let f = 0; f < NF; f++) {
      tmpV.set(-LX - 2.5, f * FH + .4, DZ); tmpV.project(camera);
      const el = ui.floorLabs[f]; el.style.display = tmpV.z < 1 ? '' : 'none';
      el.style.transform = `translate(${(tmpV.x * .5 + .5) * w}px,${(-tmpV.y * .5 + .5) * h}px) translate(-100%,-50%)`;
    }
  }

  /* ---------- UI ---------- */
  fleet.forEach(r => {
    const lab = document.createElement('button'); lab.type = 'button'; lab.className = 'fl-lab'; lab.style.setProperty('--c', r.k.c); lab.textContent = r.id;
    lab.onclick = () => select(r, true); ui.labels.appendChild(lab); r.lab = lab;
    const row = document.createElement('button'); row.type = 'button'; row.className = 'fl-rbt'; row.style.setProperty('--c', r.k.c);
    row.innerHTML = `<i></i><b>${r.id}</b><em>${r.model.replace(/^(Pudu|Keenon) /, '')}</em><span class="fl-mode"></span><span class="fl-fl"></span><span class="fl-bat"><u></u></span>`;
    row.onclick = () => select(r, true); ui.list.appendChild(row); r.row = row;
  });
  function stopTour() { if (!S.tour) return; S.tour = false; ui.tourBtn.setAttribute('aria-pressed', 'false'); controls.autoRotate = false; }
  function select(r, follow, fromTour) {
    if (!fromTour) stopTour();
    S.sel = r; if (follow) { S.follow = true; controls.autoRotate = false; ui.followBtn.setAttribute('aria-pressed', 'true'); }
    fleet.forEach(o => o.row.classList.toggle('sel', o === r));
    r.hist.bat.length = r.hist.spd.length = 0; renderDetail(true);
  }
  ui.tourBtn.onclick = () => { S.tour = !S.tour; ui.tourBtn.setAttribute('aria-pressed', String(S.tour)); if (S.tour) { S.tourAt = 1; S.follow = false; ui.followBtn.setAttribute('aria-pressed', 'false'); wholeView(); controls.autoRotate = !REDUCED; } else controls.autoRotate = false; };
  ui.followBtn.onclick = () => { stopTour(); S.follow = !S.follow; ui.followBtn.setAttribute('aria-pressed', String(S.follow)); controls.autoRotate = !S.follow && !REDUCED; if (!S.follow) wholeView(); };
  ui.wholeBtn.onclick = () => { stopTour(); S.follow = false; ui.followBtn.setAttribute('aria-pressed', 'false'); controls.autoRotate = !REDUCED; wholeView(); };
  ui.speedBtns.forEach(b => b.onclick = () => { S.scale = +b.dataset.s; S.paused = false; ui.speedBtns.forEach(x => x.setAttribute('aria-pressed', String(x === b))); ui.pauseBtn.setAttribute('aria-pressed', 'false'); });
  ui.pauseBtn.onclick = () => { S.paused = !S.paused; ui.pauseBtn.setAttribute('aria-pressed', String(S.paused)); };
  let camGoal = null;
  const wholePos = () => { const k = camera.aspect < 1.25 ? .78 : camera.aspect < 1.6 ? .9 : 1; return new THREE.Vector3(74 * k, 34 * k + 6 * (1 - k), 92 * k); };
  function wholeView() { camGoal = { pos: wholePos(), tgt: mid.clone() }; }
  canvas.addEventListener('pointerdown', () => { camGoal = null; stopTour(); });
  canvas.addEventListener('click', e => {
    const b = canvas.getBoundingClientRect(), mx = e.clientX - b.left, my = e.clientY - b.top; let best = null, bd = 30;
    fleet.forEach(r => { tmpV.copy(r.mesh.position); tmpV.y += 1; tmpV.project(camera); const sx = (tmpV.x * .5 + .5) * b.width, sy = (-tmpV.y * .5 + .5) * b.height, d = Math.hypot(sx - mx, sy - my); if (d < bd) { bd = d; best = r; } });
    if (best) select(best, true);
  });

  const SHORT = m => /CHARG/.test(m) ? 'CHARGING' : /WAITING FOR LIFT/.test(m) ? 'WAIT LIFT' : /IN LIFT/.test(m) ? 'IN LIFT' : /BOARDING|EXITING/.test(m) ? 'LIFT' : /DOOR/.test(m) ? 'AT DOOR' : /TO DOCK/.test(m) ? 'TO DOCK' : /CLEAN/.test(m) ? 'CLEANING' : /COMPLETE/.test(m) ? 'ZONE DONE' : /LOAD|LIFTING|SWAP|UNLOAD/.test(m) ? 'HANDLING' : /RETURN/.test(m) ? 'RETURNING' : /DELIVER/.test(m) ? 'DELIVERING' : /ZONE/.test(m) ? 'TO ZONE' : m.split(' ')[0];
  const nice = m => (m.charAt(0) + m.slice(1).toLowerCase()).replace(/\bl(\d)/g, 'L$1').replace(/lift ([ab])\b/g, (x, c) => 'lift ' + c.toUpperCase()).replace(/→l(\d)/g, '→L$1').replace(/\bpin\b/, 'PIN');
  const MODEC = m => /CHARG/.test(m) ? '#3FD08A' : /CLEAN/.test(m) ? '#3FD08A' : /LIFT/.test(m) ? '#B49CFF' : /WAIT|DOOR|LOAD|SWAP|LIFTING|UNLOAD|COMPLETE/.test(m) ? '#F2B544' : /DOCK/.test(m) ? '#FF8A5B' : '#38D0FF';
  function spark(cv, arr, max, color) {
    const g = cv.getContext('2d'), w = cv.width = cv.clientWidth * 2, h = cv.height = cv.clientHeight * 2; g.clearRect(0, 0, w, h);
    if (arr.length < 2) return; g.beginPath(); arr.forEach((v, i) => { const x = i / (arr.length - 1) * w, y = h - 3 - (v / max) * (h - 6); i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.strokeStyle = color; g.lineWidth = 3; g.stroke(); g.lineTo(w, h); g.lineTo(0, h); g.closePath(); const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, color + '55'); gr.addColorStop(1, color + '00'); g.fillStyle = gr; g.fill();
  }
  function renderDetail(full) {
    const r = S.sel, d = ui.detail;
    if (full) {
      d.style.setProperty('--c', r.k.c);
      d.innerHTML = `<div class="fl-d-h"><div class="fl-thumb">${IMG[r.model] ? `<img src="${IMG[r.model]}" alt="">` : '<svg viewBox="0 0 40 40"><rect x="11" y="5" width="18" height="26" rx="6"/><rect x="14" y="9" width="12" height="8" rx="2"/><circle cx="15" cy="34" r="2.4"/><circle cx="25" cy="34" r="2.4"/></svg>'}</div>
        <div><b>${r.id}</b><span>${r.model} · ${r.k.label}</span><em class="fl-d-mode"></em></div></div>
        <div class="fl-task"><small>Task</small><b data-k="task"></b></div>
        <div class="fl-grid">
          <div><small>Battery</small><b data-k="bat"></b><canvas data-c="bat"></canvas></div>
          <div><small>Speed</small><b data-k="spd"></b><canvas data-c="spd"></canvas></div>
          <div><small>Location</small><b data-k="loc"></b></div>
          <div><small>Localisation</small><b data-k="lq"></b></div>
          <div><small>${r.kind === 'clean' ? 'Cleaned today' : 'Tasks today'}</small><b data-k="tt"></b></div>
          <div><small>Distance today</small><b data-k="odo"></b></div>
          <div><small>LiDAR</small><b data-k="lidar"></b></div>
          <div><small>Network</small><b data-k="net"></b></div>
        </div>`;
    }
    const q = k => d.querySelector(`[data-k="${k}"]`);
    const m = d.querySelector('.fl-d-mode'); m.textContent = nice(r.mode); m.style.setProperty('--m', MODEC(r.mode));
    q('task').textContent = r.task ? `${r.task.id} · ${r.task.label}` : 'Idle · awaiting dispatch';
    q('bat').textContent = `${r.battery.toFixed(1)} %`; q('spd').textContent = `${r.speed.toFixed(2)} m/s`;
    const lvl = r.liftY != null ? `lift · ${(r.liftY + 1).toFixed(1)}` : `L${r.f + 1}`;
    q('loc').textContent = `${lvl} · x ${r.x.toFixed(1)}  y ${(-r.z).toFixed(1)} · ${Math.round(((r.yaw * 180 / Math.PI) + 360) % 360)}°`;
    q('lq').textContent = `${(r.loc * 100).toFixed(1)} %`;
    q('tt').textContent = r.kind === 'clean' ? `${Math.round(r.area).toLocaleString()} m²` : `${r.tasks}`;
    q('odo').textContent = `${r.odo.toFixed(2)} km`;
    q('lidar').textContent = `${(9.8 + R() * .4).toFixed(1)} Hz · OK`;
    q('net').textContent = r.liftY != null ? 'lift · buffered' : `Wi-Fi ${-48 - Math.round(Math.abs(r.x) / 3)} dBm`;
    spark(d.querySelector('[data-c="bat"]'), r.hist.bat, 100, r.k.c); spark(d.querySelector('[data-c="spd"]'), r.hist.spd, 1.2, r.k.c);
  }
  function renderList() {
    fleet.forEach(r => {
      const md = r.row.querySelector('.fl-mode'); md.textContent = SHORT(r.mode); md.style.setProperty('--m', MODEC(r.mode));
      r.row.querySelector('.fl-fl').textContent = r.liftY != null ? 'lift' : `L${r.f + 1}`;
      const b = r.row.querySelector('.fl-bat u'); b.style.width = r.battery + '%'; b.style.background = r.battery < 25 ? '#FF8A5B' : r.battery < 45 ? '#F2B544' : '#3FD08A';
      r.row.title = `${r.id} · ${r.mode} · battery ${Math.round(r.battery)}%`;
      r.lab.style.setProperty('--m', MODEC(r.mode));
    });
    const active = fleet.filter(r => !/CHARG|IDLE/.test(r.mode)).length;
    ui.kpi.active.textContent = `${active} / ${fleet.length}`;
    ui.clock.textContent = fmt(S.clock);
  }
  function renderLog() {
    if (!ui.dirtyLog) return; ui.dirtyLog = false;
    ui.log.innerHTML = S.log.slice(0, 5).map(e => `<li class="${e.lvl || ''}" style="--c:${e.c}"><time>${e.t}</time><b>${e.id}</b><span>${e.msg}</span></li>`).join('');
  }
  function renderCap() {
    const r = S.sel, on = S.follow || S.tour;
    ui.cap.classList.toggle('on', on); if (!on) return;
    ui.cap.style.setProperty('--c', r.k.c); ui.cap.querySelector('small').textContent = S.follow ? 'Following' : 'Spotlight';
    ui.cap.querySelector('b').textContent = `${r.id} · ${r.model}`;
    ui.cap.querySelector('span').textContent = r.task ? r.task.label : r.mode;
    ui.cap.querySelector('em').textContent = `${nice(r.mode)} · ${r.liftY != null ? 'in lift' : 'L' + (r.f + 1)} · battery ${Math.round(r.battery)}%`;
  }
  /* ---------- GM operations dashboards ---------- */
  const C4 = { delivery: '#4FB8FF', luggage: '#D4A65A', linen: '#9B7BFF', clean: '#2FD39A' };
  const mmss = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  function exceptions() {
    const out = [];
    fleet.forEach(r => {
      if (/AT DOOR/.test(r.mode) && r.modeT > 45) out.push({ lv: 'amber', id: r.id, c: r.k.c, t: `At ${r.task && r.task.guest ? r.task.guest : 'guest room'} · guest has not answered for ${mmss(r.modeT)}`, a: 'Call room' });
      if (/WAITING FOR LIFT/.test(r.mode) && r.modeT > 25) out.push({ lv: 'info', id: r.id, c: r.k.c, t: `Waiting for lift ${r.mode.slice(-1)} · ${mmss(r.modeT)}`, a: 'Monitor' });
      if (r.battery < 25 && !/CHARG/.test(r.mode)) out.push({ lv: 'amber', id: r.id, c: r.k.c, t: `Battery ${Math.round(r.battery)}% · ${/DOCK/.test(r.mode) ? 'returning to dock' : 'will dock after this task'}`, a: 'Auto' });
    });
    return out;
  }
  function renderDash() {
    const V = ui.V, D = ui.D, h = Math.floor(S.clock / 3600) % 24;
    /* value strip */
    const open = fleet.filter(r => r.task && r.task.guest && /DELIVER|DOOR|LOAD/.test(r.mode));
    V('open').textContent = open.length;
    const oldest = open.reduce((m, r) => Math.max(m, S.t - r.taskStart), 0);
    V('opens').textContent = open.length ? `oldest ${mmss(oldest)} · all with robots` : 'none waiting';
    const avg = S.delivTimes.reduce((a, b) => a + b, 0) / S.delivTimes.length;
    V('resp').textContent = `${(avg / 60).toFixed(1)} min`; V('resps').textContent = `target 15 min · ${(M.ontime / M.total * 100).toFixed(0)}% on time`;
    const cl = fleet.filter(r => r.kind === 'clean'), fdone = 2 + cl.filter(r => (r.zonesDone || 0) > 0).length;
    const pctAll = (2 + cl.reduce((a, r) => a + Math.min(1, (r.zonesDone ? 1 : (r.zoneArea || 0) / 132)), 0)) / NF;
    V('fc').textContent = `${Math.round(pctAll * 100)}%`; V('fcs').textContent = `${fdone} of ${NF} floors done · ${cl.filter(r => /CLEAN/.test(r.mode)).length} cleaning now`;
    const chg = fleet.filter(r => /CHARG/.test(r.mode)).length;
    V('fleet').textContent = `${chg} charging · 0 faults`;
    const ex = exceptions(); V('att').textContent = ex.length; V('att').parentElement.classList.toggle('hot', ex.some(e => e.lv === 'amber'));
    V('atts').textContent = ex.length ? ex[0].id + ' · ' + ex[0].t.split(' · ')[0] : 'nothing needs staff';
    V('speed').textContent = S.paused ? 'simulated · paused' : S.scale === 1 ? 'simulated · real time' : `simulated · ${S.scale}× speed`;
    /* needs attention */
    D('att').innerHTML = ex.length ? ex.map(e => `<li class="${e.lv}" style="--c:${e.c}"><b>${e.id}</b><span>${e.t}</span><em>${e.a}</em></li>`).join('')
      : '<li class="ok"><b>All clear</b><span>No robot needs a person right now. Exceptions appear here as they happen.</span><em></em></li>';
    /* hourly stacked bars */
    const hrs = HRS.slice(); if (!hrs.includes(h)) { hrs.push(h); hrs.shift(); }
    const W = 660, L = 30, B = 190, bw = (W - L - 6) / hrs.length;
    const tot = hrs.map(x => { const o = M.hourly[x] || {}; return (o.delivery || 0) + (o.luggage || 0) + (o.linen || 0) + (o.clean || 0); });
    const ymax = Math.max(8, Math.ceil(Math.max(...tot) / 4) * 4);
    let g = '';
    for (let i = 0; i <= 4; i++) { const y = B - (B - 12) * i / 4; g += `<line x1="${L}" x2="${W}" y1="${y}" y2="${y}" stroke="#1A2236" stroke-width="1"/><text x="${L - 8}" y="${y + 4}" text-anchor="end" class="ax">${Math.round(ymax * i / 4)}</text>`; }
    hrs.forEach((x, i) => {
      const o = M.hourly[x] || {}; let y = B; const now = x === h, X = L + i * bw + bw * .2, w = bw * .6;
      ['clean', 'linen', 'luggage', 'delivery'].forEach(k => { const v = o[k] || 0; if (!v) return; const hh = v / ymax * (B - 12); y -= hh; g += `<rect x="${X}" y="${y}" width="${w}" height="${Math.max(0, hh - 1)}" fill="${C4[k]}" opacity="${now ? 1 : .82}"/>`; });
      g += `<text x="${X + w / 2}" y="${B + 18}" text-anchor="middle" class="ax${now ? ' axn' : ''}">${String(x).padStart(2, '0')}</text>`;
      if (now) g += `<text x="${X + w / 2}" y="${y - 7}" text-anchor="middle" class="nowl">${tot[i]} so far</text>`;
    });
    D('hourly').innerHTML = g;
    /* response time */
    const dt = S.delivTimes.slice(-16), dW = 320, dB = 140, dmax = 20, bw2 = (dW - 30) / 16, ty = dB - 15 / dmax * (dB - 10);
    let dd = '';
    [0, 5, 10, 15, 20].forEach(v => { const y = dB - v / dmax * (dB - 10); dd += `<line x1="26" x2="${dW}" y1="${y}" y2="${y}" stroke="#1A2236"/><text x="20" y="${y + 4}" text-anchor="end" class="ax">${v}</text>`; });
    dd += `<line x1="26" x2="${dW}" y1="${ty}" y2="${ty}" stroke="#D98C6A" stroke-dasharray="4 4"/><text x="${dW}" y="${ty - 5}" text-anchor="end" class="tg">target 15</text>`;
    dt.forEach((v, i) => { const mm = Math.min(dmax, v / 60), hh = mm / dmax * (dB - 10); dd += `<rect x="${30 + i * bw2 + 2}" y="${dB - hh}" width="${bw2 - 4}" height="${hh}" fill="${v > EST.target ? '#FF6B5E' : '#4FB8FF'}" opacity="${i === dt.length - 1 ? 1 : .8}"/>`; });
    dd += `<text x="30" y="${dB + 22}" class="dl">median ${(dt.slice().sort((a, b) => a - b)[8] / 60).toFixed(1)} min · ${dt.filter(v => v > EST.target).length} over target</text>`;
    D('deliv').innerHTML = dd;
    /* requests by type */
    const tt = Object.entries(M.types).sort((a, b) => b[1] - a[1]), tmax = Math.max(...tt.map(x => x[1]));
    D('types').innerHTML = tt.map(([n, v]) => `<div class="ty"><span>${n}</span><i><u style="width:${v / tmax * 100}%"></u></i><b>${v}</b></div>`).join('');
    /* floor care by floor */
    const cleaners = {}; cl.forEach(r => { cleaners[r.floor] = r; });
    const done = { 2: '20:10', 3: '20:55' }, sched = { 5: '01:00', 7: '02:30' };
    let fl = '';
    for (let f = NF - 1; f >= 0; f--) {
      const r = cleaners[f]; let pct, st, cls = '';
      if (r) { const fin = (r.zonesDone || 0) > 0; pct = fin ? 1 : Math.min(1, (r.zoneArea || 0) / 132); st = /CHARG|DOCK/.test(r.mode) ? `${r.id} charging` : fin ? `done · ${r.id} on 2nd pass` : `${r.id} · ${Math.round(pct * 100)}%`; cls = fin ? 'done' : 'live'; }
      else if (done[f]) { pct = 1; st = `done ${done[f]}`; cls = 'done'; }
      else { pct = 0; st = `scheduled ${sched[f]}`; cls = 'sched'; }
      fl += `<div class="fr ${cls}"><b>${f ? 'L' + (f + 1) : 'L1'}</b><i><u style="width:${(pct * 100).toFixed(1)}%"></u></i><span>${st}</span></div>`;
    }
    D('floors').innerHTML = fl;
    /* robot cards */
    D('cards').innerHTML = fleet.map(r => `<div class="rc" style="--c:${r.k.c};--m:${MODEC(r.mode)}"><div class="rc-img">${IMG[r.model] ? `<img src="${IMG[r.model]}" alt="">` : '<svg viewBox="0 0 40 40"><rect x="11" y="5" width="18" height="26" rx="6"/><rect x="14" y="9" width="12" height="8" rx="2"/></svg>'}</div><div class="rc-t"><b>${r.id}</b><span>${r.model}</span></div><em class="rc-s">${SHORT(r.mode).toLowerCase()}</em><div class="rc-b"><i><u style="width:${r.battery}%;background:${r.battery < 25 ? '#E07A5F' : r.battery < 45 ? '#D9A441' : '#5BBF8E'}"></u></i><span>${Math.round(r.battery)}%</span></div><p>${r.task ? r.task.label : 'Idle'} · ${r.liftY != null ? 'in lift' : 'L' + (r.f + 1)}</p></div>`).join('');
    /* availability per robot */
    D('util').innerHTML = fleet.map(r => { const u = r.util || { work: 1, charge: 0, idle: 0 }, t = u.work + u.charge + u.idle;
      return `<div class="ur"><b>${r.id}</b><i><u style="width:${u.work / t * 100}%;background:#2FD39A"></u><u style="width:${u.charge / t * 100}%;background:#4FB8FF"></u><u style="width:${u.idle / t * 100}%;background:#2C3550"></u></i><span>${Math.round(u.work / t * 100)}%</span></div>`; }).join('');
  }
  select(fleet[0], false, true);

  /* ---------- loop ---------- */
  if (!S.tour) ui.tourBtn.setAttribute('aria-pressed', 'false');
  let lowQ = /Android|iPad|iPhone|Mobile/.test(navigator.userAgent) && (navigator.hardwareConcurrency || 4) <= 8, qN = 0, qT = 0;
  if (lowQ) renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25));
  let visible = true, running = false, last = performance.now(), uiT = 0, histT = 0, dashT = 9;
  const kick = () => { if (!running && visible) { running = true; last = performance.now(); requestAnimationFrame(frame); } };
  new IntersectionObserver(es => es.forEach(e => { visible = e.isIntersecting; kick(); }), { rootMargin: '120px' }).observe(root);
  const resize = () => { const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); composer.setSize(w, h); bloom.resolution.set(w / 2, h / 2); camera.aspect = w / h; camera.updateProjectionMatrix(); };
  new ResizeObserver(resize).observe(canvas); resize(); camera.position.copy(wholePos());
  function frame(now) {
    if (!visible) { running = false; return; }
    const rdt = Math.min(.1, (now - last) / 1000); last = now;
    if (!S.paused) { const dt = rdt * S.scale, n = Math.ceil(dt / .2); for (let i = 0; i < n; i++) sim(dt / n); }
    if (S.tour) {
      if (!S.tourAt) S.tourAt = now - 10000;
      if (now - S.tourAt > 12000) {
        S.tourAt = now;
        const score = o => (/LIFT/.test(o.mode) ? 3 : /DELIVER|DOOR/.test(o.mode) ? 2.5 : /CLEAN/.test(o.mode) ? 2 : /CHARG|IDLE/.test(o.mode) ? 0 : 1) + R();
        const cand = fleet.filter(o => o !== S.sel).sort((a, b) => score(b) - score(a));
        select(cand[0], false, true); controls.autoRotate = !REDUCED; controls.autoRotateSpeed = .25;
      }
    }
    const r = S.sel;
    if (S.tour && !S.follow && !camGoal) {   // god's view: stay on the whole building, drift toward the highlighted robot's floor
      const ry = (r.liftY != null ? r.liftY : r.f) * FH, goalT = new THREE.Vector3(r.x * .25, mid.y * .6 + ry * .4, r.z * .25);
      const dT = goalT.sub(controls.target).multiplyScalar(Math.min(1, rdt * .5)); controls.target.add(dT); camera.position.add(dT);
      const want = wholePos().length(), have = camera.position.distanceTo(controls.target);
      if (Math.abs(have - want) > 2) camera.position.sub(controls.target).multiplyScalar(1 + (want / have - 1) * Math.min(1, rdt * .6)).add(controls.target);
    }
    if (S.follow) {
      const y = (r.liftY != null ? r.liftY : r.f) * FH;
      const goal = new THREE.Vector3(r.x, y + 1, r.z), delta = goal.clone().sub(controls.target).multiplyScalar(Math.min(1, rdt * 1.8));
      controls.target.add(delta); camera.position.add(delta);
      const dist = camera.position.distanceTo(controls.target); if (dist > 46) camera.position.lerp(controls.target, Math.min(1, rdt * .6) * (1 - 40 / dist));
    } else if (camGoal) {
      camera.position.lerp(camGoal.pos, Math.min(1, rdt * 1.4)); controls.target.lerp(camGoal.tgt, Math.min(1, rdt * 1.4));
      if (camera.position.distanceTo(camGoal.pos) < .5) camGoal = null;
    }
    controls.update();
    placeMeshes(now / 1000); labels();
    if (canvas.clientWidth) { if (lowQ) renderer.render(scene, camera); else composer.render(); }
    if (!lowQ && qN < 120) { qN++; if (qN === 30) qT = now; if (qN === 120 && 90000 / (now - qT) < 40) { lowQ = true; renderer.setPixelRatio(1); resize(); } }
    uiT += rdt; histT += rdt;
    if (histT > .5) { histT = 0; fleet.forEach(o => { o.hist.bat.push(o.battery); o.hist.spd.push(o.speed); if (o.hist.bat.length > 90) { o.hist.bat.shift(); o.hist.spd.shift(); } }); }
    if (uiT > .25) { uiT = 0; renderList(); renderDetail(false); renderLog(); renderCap(); }
    dashT += rdt; if (dashT > 1) { dashT = 0; renderDash(); }
    requestAnimationFrame(frame);
  }
  kick();
}

function buildUI(root) {
  const host = root;
  host.innerHTML = `
  <div class="fx">
    <div class="fx-copy">
      <small>Hotel.OS on the general manager's tablet</small>
      <h3>The whole building, in one hand</h3>
      <ul>
        <li><b>Live map</b>Every robot, lift and floor, as it happens.</li>
        <li><b>Needs attention</b>Only the moments that need a person.</li>
        <li><b>Requests</b>Volume and response time against target.</li>
        <li><b>Floors</b>Cleaning progress, floor by floor.</li>
      </ul>
      <p>Shown on a Rhino T105, the tablet in the Mobile Devices plan.</p>
    </div>
    <div class="fx-dev"><div class="fx-scr">
  <div class="fa">
    <div class="fa-top"><div class="fa-prop"><span class="fa-logo"></span><div><b>The Grand</b><span>Operations</span></div></div><div class="fa-live"><i></i><span>Live</span><b data-clock>–</b></div></div>
    <div class="fa-tabs" role="tablist"><button role="tab" data-tab="live" aria-selected="true">Live</button><button role="tab" data-tab="req" aria-selected="false">Requests</button><button role="tab" data-tab="floors" aria-selected="false">Floors</button><button role="tab" data-tab="fleet" aria-selected="false">Fleet</button></div>
    <div class="fa-pane on" data-pane="live">
      <div class="fl-val">
        <div class="v"><small>Open requests</small><b data-v="open">–</b><span data-v="opens"></span></div>
        <div class="v"><small>Avg response</small><b data-v="resp">–</b><span data-v="resps"></span></div>
        <div class="v"><small>Floor care</small><b data-v="fc">–</b><span data-v="fcs"></span></div>
        <div class="v"><small>Robots working</small><b data-kpi="active">–</b><span data-v="fleet"></span></div>
        <div class="v v-att"><small>Needs attention</small><b data-v="att">–</b><span data-v="atts"></span></div>
        <div class="v"><small>Shift</small><b>Night</b><span data-v="speed"></span></div>
      </div>
      <div class="fl-main">
        <div class="fl-view">
          <canvas aria-label="3D view of the hotel with robots moving between floors"></canvas>
          <div class="fl-labels"></div><div class="fl-flabs"></div>
          <div class="fl-ctl">
            <button type="button" data-a="tour" aria-pressed="true">Tour</button>
            <button type="button" data-a="whole">Building</button>
            <button type="button" data-a="follow" aria-pressed="false">Follow</button>
            <span class="fl-sep"></span>
            <button type="button" data-s="1" aria-pressed="false">1×</button><button type="button" data-s="2" aria-pressed="true">2×</button><button type="button" data-s="4" aria-pressed="false">4×</button>
            <button type="button" data-a="pause" aria-pressed="false" aria-label="Pause">❚❚</button>
          </div>
          <div class="fl-cap"><small>Following</small><b></b><span></span><em></em></div>
          <div class="fl-legend"><span style="--c:#38D0FF">Delivery</span><span style="--c:#F2B544">Luggage</span><span style="--c:#B49CFF">Linen</span><span style="--c:#3FD08A">Floor care</span></div>
        </div>
      </div>
      <section class="d d-att"><header><div><b>Needs attention</b><span>raised by the fleet</span></div></header><ul data-d="att" class="d-attl"></ul></section>
      <div class="fl-panel">
        <section class="d"><header><div><b>Robots</b><span>tap to follow</span></div></header><div class="fl-list"></div></section>
        <div class="fl-detail"></div>
      </div>
    </div>
    <div class="fa-pane" data-pane="req">
      <section class="d"><header><div><b>Requests and jobs today</b><span>by hour</span></div><ul class="d-leg"><li style="--c:#4FB8FF">Deliveries</li><li style="--c:#D4A65A">Luggage</li><li style="--c:#9B7BFF">Linen</li><li style="--c:#2FD39A">Floor-care zones</li></ul></header><svg data-d="hourly" viewBox="0 0 660 220"></svg></section>
      <div class="fa-2">
        <section class="d"><header><div><b>Response time</b><span>last 16 deliveries · minutes</span></div></header><svg data-d="deliv" viewBox="0 0 320 170"></svg></section>
        <section class="d"><header><div><b>Requests by type</b><span>today</span></div></header><div data-d="types" class="d-types"></div></section>
      </div>
      <section class="d"><header><div><b>Activity</b><span>from the fleet adapter</span></div></header><ol class="fl-log"></ol></section>
    </div>
    <div class="fa-pane" data-pane="floors">
      <section class="d"><header><div><b>Floor care tonight</b><span>corridors and lobby</span></div></header><div data-d="floors" class="d-floors"></div></section>
    </div>
    <div class="fa-pane" data-pane="fleet">
      <div data-d="cards" class="d-cards"></div>
      <section class="d"><header><div><b>Availability today</b><span>share of time</span></div><ul class="d-leg"><li style="--c:#2FD39A">On task</li><li style="--c:#4FB8FF">Charging</li><li style="--c:#3A4560">Idle or waiting</li></ul></header><div data-d="util" class="d-util"></div></section>
    </div>
  </div>
    </div></div>
  </div>`;
  const q = s => host.querySelector(s);
  host.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => {
    host.querySelectorAll('[data-tab]').forEach(x => x.setAttribute('aria-selected', String(x === b)));
    host.querySelectorAll('[data-pane]').forEach(p => p.classList.toggle('on', p.dataset.pane === b.dataset.tab));
    window.dispatchEvent(new Event('resize'));
  });
  return {
    canvas: q('canvas'), labels: q('.fl-labels'), list: q('.fl-list'), detail: q('.fl-detail'), log: q('.fl-log'), clock: q('[data-clock]'),
    followBtn: q('[data-a="follow"]'), wholeBtn: q('[data-a="whole"]'), pauseBtn: q('[data-a="pause"]'), speedBtns: [...host.querySelectorAll('[data-s]')],
    tourBtn: q('[data-a="tour"]'), cap: q('.fl-cap'),
    kpi: { active: q('[data-kpi="active"]') }, V: k => q(`[data-v="${k}"]`), D: k => q(`[data-d="${k}"]`), dirtyDash: true,
    floorLabs: Array.from({ length: NF }, (_, f) => { const e = document.createElement('span'); e.className = 'fl-flab'; e.textContent = f ? `L${f + 1}` : 'L1'; q('.fl-flabs').appendChild(e); return e; }),
    dirtyLog: true,
  };
}

function boot() { document.querySelectorAll('[data-fleet-live]').forEach(el => { try { mount(el); } catch (e) { console.error('[fleet-live]', e); el.classList.add('fl-fail'); } }); }
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
