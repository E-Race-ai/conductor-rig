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
  scene.fog = new THREE.Fog(0x070B16, 120, 260);
  const camera = new THREE.PerspectiveCamera(38, 1, .5, 600);
  const mid = new THREE.Vector3(0, NF * FH / 2 - 2, 0);
  camera.position.set(68, 56, 86);
  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(mid); controls.enableDamping = true; controls.dampingFactor = .08; controls.minDistance = 14; controls.maxDistance = 190; controls.maxPolarAngle = Math.PI * .49;
  controls.autoRotate = !REDUCED; controls.autoRotateSpeed = .35;
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), .75, .45, .18); composer.addPass(bloom);
  composer.addPass(new OutputPass());

  /* floors */
  const floors = [];
  for (let f = 0; f < NF; f++) {
    const y0 = f * FH, g = new THREE.Group(); g.userData.mats = [];
    const slabM = new THREE.MeshBasicMaterial({ color: 0x0C1324, transparent: true, opacity: .9 });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(2 * LX, .18, 2 * DZ), slabM); slab.position.set(0, y0 - .09, 0); g.add(slab);
    const corM = new THREE.MeshBasicMaterial({ color: 0x14244A, transparent: true, opacity: .9 });
    const cor = new THREE.Mesh(new THREE.PlaneGeometry(2 * LX, 2 * CZ), corM); cor.rotation.x = -Math.PI / 2; cor.position.set(0, y0 + .01, 0); g.add(cor);
    const lp = [], fp = [];
    P.walls.forEach(([x1, z1, x2, z2]) => {
      lp.push(x1, y0, z1, x2, y0, z2, x1, y0 + WH, z1, x2, y0 + WH, z2);
      fp.push(x1, y0, z1, x2, y0, z2, x2, y0 + WH, z2, x1, y0, z1, x2, y0 + WH, z2, x1, y0 + WH, z1);
    });
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
    const lineM = new THREE.LineBasicMaterial({ color: 0x7FA6FF, transparent: true, opacity: .55 });
    g.add(new THREE.LineSegments(lg, lineM));
    const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3));
    const faceM = new THREE.MeshBasicMaterial({ color: 0x1A2A55, transparent: true, opacity: .16, side: THREE.DoubleSide, depthWrite: false });
    g.add(new THREE.Mesh(fg, faceM));
    // chargers in back of house
    const chM = new THREE.MeshBasicMaterial({ color: 0x3FD08A, transparent: true, opacity: .85 });
    for (let k = 0; k < 4; k++) { const d = DOCK(f, k); const b = new THREE.Mesh(new THREE.BoxGeometry(.9, .5, .4), chM); b.position.set(d.x, y0 + .25, d.z - .9); g.add(b); }
    g.userData.mats.push([slabM, .9], [corM, .9], [lineM, .55], [faceM, .16], [chM, .85]);
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
  fleet.forEach(r => {
    const col = new THREE.Color(r.k.c), g = new THREE.Group();
    const tall = r.kind === 'delivery' || r.kind === 'luggage';
    const body = new THREE.Mesh(new THREE.CylinderGeometry(.75, .85, tall ? 2.0 : 1.1, 20), new THREE.MeshBasicMaterial({ color: col }));
    body.position.y = tall ? 1.0 : .55; g.add(body);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(.6, .75, .18, 20), new THREE.MeshBasicMaterial({ color: col.clone().lerp(new THREE.Color('#ffffff'), .5) })); cap.position.y = (tall ? 2.0 : 1.1) + .09; g.add(cap);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(.32, .7, 12), new THREE.MeshBasicMaterial({ color: 0xffffff })); nose.rotation.x = Math.PI / 2; nose.position.set(0, .35, 1.0); g.add(nose);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.25, 1.5, 36), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: .8, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = .05; g.add(ring);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: col, transparent: true, opacity: .55, depthWrite: false })); halo.scale.set(6.5, 6.5, 6.5); halo.position.y = 1; g.add(halo);
    g.scale.setScalar(1.45); r.mesh = g; r.ring = ring; scene.add(g);
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
  const S = { t: 0, clock: 21 * 3600 + 40 * 60, scale: 4, paused: false, sel: fleet[0], follow: false, tour: !REDUCED, tourT: 0, tourI: 0,
    deliveries: 37, delivTimes: [372, 405, 388], lift: 52, base: 4180, log: [] };
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
      fn(r, () => { r.task = { id: tid(), label: `Deliver ${items} → ${q.label}` }; r.taskStart = S.t; log(r, `order ${r.task.id}: ${items} for ${q.label}`); });
      dwell(r, 7, 'LOADING AT DESK');
      go(r, q, 'DELIVERING');
      dwell(r, 10 + R() * 9, 'AT DOOR · GUEST PIN', () => { S.deliveries++; r.tasks++; const dtm = (S.t - r.taskStart) * 1; S.delivTimes.push(dtm); if (S.delivTimes.length > 20) S.delivTimes.shift(); log(r, `delivered to ${q.label} · ${Math.round(dtm / 60)} min ${Math.round(dtm % 60)} s`, 'ok'); r.task = { id: r.task.id, label: 'Return to front desk' }; });
      go(r, DESK, 'RETURNING');
    } else if (r.kind === 'luggage') {
      if (Math.hypot(r.x - ENTR.x, r.z - ENTR.z) > 1 || r.f !== 0) { go(r, ENTR, 'RETURNING'); return; }
      const q = randRoom(1);
      fn(r, () => { r.task = { id: tid(), label: `Luggage → ${q.label}` }; r.taskStart = S.t; log(r, `luggage check-in: 2 bags for ${q.label}`); });
      dwell(r, 9, 'LOADING LUGGAGE');
      go(r, q, 'DELIVERING');
      dwell(r, 12, 'AT DOOR · GUEST', () => { r.tasks++; log(r, `luggage delivered to ${q.label}`, 'ok'); r.task = { id: r.task.id, label: 'Return to entrance' }; });
      go(r, ENTR, 'RETURNING');
    } else if (r.kind === 'linen') {
      const f = 1 + Math.floor(R() * (NF - 1));
      if (r.f !== 0) { go(r, BOH(0), 'RETURNING'); return; }
      fn(r, () => { r.task = { id: tid(), label: `Clean linen rack → L${f + 1} back of house` }; log(r, `linen run to L${f + 1}: clean rack out, soiled rack back`); });
      dwell(r, 6, 'LIFTING RACK');
      go(r, BOH(f), 'DELIVERING');
      dwell(r, 9, 'SWAPPING RACK', () => { r.tasks++; log(r, `rack swapped on L${f + 1}`, 'ok'); r.task = { id: r.task.id, label: 'Soiled linen → laundry (L1)' }; });
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
      dwell(r, 14, 'ZONE COMPLETE', () => { r.tasks++; log(r, `zone complete · ${Math.round(r.zoneArea)} m² · 100% coverage`, 'ok'); if (r.cov) r.cov.count = 0; });
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
      r.mesh.position.set(r.x, y, r.z); r.mesh.rotation.y = r.yaw;
      const sel = r === S.sel; r.ring.scale.setScalar(sel ? 1.35 + Math.sin(time * 5) * .12 : 1);
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
    fleet.forEach(o => { const vis = focusF < 0 || o.f === focusF || o.liftY != null; o.mesh.scale.setScalar(vis ? 1.45 : 1); if (o.cov) o.cov.material.opacity = vis ? .4 : .08; });
  }
  function labels() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    fleet.forEach(r => {
      tmpV.copy(r.mesh.position); tmpV.y += r.kind === 'clean' ? 2.4 : 3.3; tmpV.project(camera);
      const el = r.lab; const vis = tmpV.z < 1;
      el.style.display = vis ? '' : 'none';
      if (vis) el.style.transform = `translate(${(tmpV.x * .5 + .5) * w}px,${(-tmpV.y * .5 + .5) * h}px) translate(-50%,-100%)`;
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
    const row = document.createElement('button'); row.type = 'button'; row.className = 'fl-row'; row.style.setProperty('--c', r.k.c);
    row.innerHTML = `<i></i><b>${r.id}</b><em>${r.model}</em><span class="fl-mode"></span><span class="fl-fl"></span><span class="fl-bat"><u></u></span>`;
    row.onclick = () => select(r, true); ui.list.appendChild(row); r.row = row;
  });
  function stopTour() { if (!S.tour) return; S.tour = false; ui.tourBtn.setAttribute('aria-pressed', 'false'); controls.autoRotate = false; }
  function select(r, follow, fromTour) {
    if (!fromTour) stopTour();
    S.sel = r; if (follow) { S.follow = true; controls.autoRotate = false; ui.followBtn.setAttribute('aria-pressed', 'true'); }
    fleet.forEach(o => o.row.classList.toggle('sel', o === r));
    r.hist.bat.length = r.hist.spd.length = 0; renderDetail(true);
  }
  ui.tourBtn.onclick = () => { S.tour = !S.tour; ui.tourBtn.setAttribute('aria-pressed', String(S.tour)); if (S.tour) { S.tourAt = 1; } else controls.autoRotate = false; };
  ui.followBtn.onclick = () => { stopTour(); S.follow = !S.follow; ui.followBtn.setAttribute('aria-pressed', String(S.follow)); controls.autoRotate = !S.follow && !REDUCED; if (!S.follow) wholeView(); };
  ui.wholeBtn.onclick = () => { stopTour(); S.follow = false; ui.followBtn.setAttribute('aria-pressed', 'false'); controls.autoRotate = !REDUCED; wholeView(); };
  ui.speedBtns.forEach(b => b.onclick = () => { S.scale = +b.dataset.s; S.paused = false; ui.speedBtns.forEach(x => x.setAttribute('aria-pressed', String(x === b))); ui.pauseBtn.setAttribute('aria-pressed', 'false'); });
  ui.pauseBtn.onclick = () => { S.paused = !S.paused; ui.pauseBtn.setAttribute('aria-pressed', String(S.paused)); };
  let camGoal = null;
  function wholeView() { camGoal = { pos: new THREE.Vector3(68, 56, 86), tgt: mid.clone() }; }
  canvas.addEventListener('pointerdown', () => { camGoal = null; stopTour(); });
  canvas.addEventListener('click', e => {
    const b = canvas.getBoundingClientRect(), mx = e.clientX - b.left, my = e.clientY - b.top; let best = null, bd = 30;
    fleet.forEach(r => { tmpV.copy(r.mesh.position); tmpV.y += 1; tmpV.project(camera); const sx = (tmpV.x * .5 + .5) * b.width, sy = (-tmpV.y * .5 + .5) * b.height, d = Math.hypot(sx - mx, sy - my); if (d < bd) { bd = d; best = r; } });
    if (best) select(best, true);
  });

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
    const m = d.querySelector('.fl-d-mode'); m.textContent = r.mode; m.style.setProperty('--m', MODEC(r.mode));
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
      const md = r.row.querySelector('.fl-mode'); md.textContent = r.mode.replace(/ · .*$/, ''); md.style.setProperty('--m', MODEC(r.mode));
      r.row.querySelector('.fl-fl').textContent = r.liftY != null ? 'lift' : `L${r.f + 1}`;
      const b = r.row.querySelector('.fl-bat u'); b.style.width = r.battery + '%'; b.style.background = r.battery < 25 ? '#FF8A5B' : r.battery < 45 ? '#F2B544' : '#3FD08A';
      r.row.title = `${r.id} · ${r.mode} · battery ${Math.round(r.battery)}%`;
      r.lab.style.setProperty('--m', MODEC(r.mode));
    });
    const active = fleet.filter(r => !/CHARG|IDLE/.test(r.mode)).length;
    const avg = S.delivTimes.reduce((a, b) => a + b, 0) / S.delivTimes.length;
    const area = S.base + fleet.reduce((a, r) => a + (r.kind === 'clean' ? r.area : 0), 0) - 3000;
    ui.kpi.active.textContent = `${active} / ${fleet.length}`; ui.kpi.deliv.textContent = S.deliveries; ui.kpi.avg.textContent = `${Math.floor(avg / 60)} min ${String(Math.round(avg % 60)).padStart(2, '0')} s`;
    ui.kpi.area.textContent = `${Math.round(area).toLocaleString()} m²`; ui.kpi.lift.textContent = S.lift;
    ui.clock.textContent = fmt(S.clock);
  }
  function renderLog() {
    if (!ui.dirtyLog) return; ui.dirtyLog = false;
    ui.log.innerHTML = S.log.slice(0, 7).map(e => `<li class="${e.lvl || ''}" style="--c:${e.c}"><time>${e.t}</time><b>${e.id}</b><span>${e.msg}</span></li>`).join('');
  }
  function renderCap() {
    const r = S.sel, on = S.follow;
    ui.cap.classList.toggle('on', on); if (!on) return;
    ui.cap.style.setProperty('--c', r.k.c);
    ui.cap.querySelector('b').textContent = `${r.id} · ${r.model}`;
    ui.cap.querySelector('span').textContent = r.task ? r.task.label : r.mode;
    ui.cap.querySelector('em').textContent = `${r.mode} · ${r.liftY != null ? 'in lift' : 'L' + (r.f + 1)} · battery ${Math.round(r.battery)}%`;
  }
  select(fleet[0], false, true);

  /* ---------- loop ---------- */
  if (!S.tour) ui.tourBtn.setAttribute('aria-pressed', 'false');
  let visible = true, running = false, last = performance.now(), uiT = 0, histT = 0;
  const kick = () => { if (!running && visible) { running = true; last = performance.now(); requestAnimationFrame(frame); } };
  new IntersectionObserver(es => es.forEach(e => { visible = e.isIntersecting; kick(); }), { rootMargin: '120px' }).observe(root);
  const resize = () => { const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); composer.setSize(w, h); bloom.resolution.set(w / 2, h / 2); camera.aspect = w / h; camera.updateProjectionMatrix(); };
  new ResizeObserver(resize).observe(canvas); resize();
  function frame(now) {
    if (!visible) { running = false; return; }
    const rdt = Math.min(.1, (now - last) / 1000); last = now;
    if (!S.paused) { const dt = rdt * S.scale, n = Math.ceil(dt / .2); for (let i = 0; i < n; i++) sim(dt / n); }
    if (S.tour) {
      if (!S.tourAt) S.tourAt = now - 11000;
      if (now - S.tourAt > 14000) {
        S.tourAt = now;
        const score = o => (/LIFT/.test(o.mode) ? 3 : /DELIVER|DOOR/.test(o.mode) ? 2.5 : /CLEAN/.test(o.mode) ? 2 : /CHARG|IDLE/.test(o.mode) ? 0 : 1) + R();
        const cand = fleet.filter(o => o !== S.sel).sort((a, b) => score(b) - score(a));
        select(cand[0], true, true); controls.autoRotate = true; controls.autoRotateSpeed = 1.1;
      }
    }
    const r = S.sel;
    if (S.follow) {
      const y = (r.liftY != null ? r.liftY : r.f) * FH;
      const goal = new THREE.Vector3(r.x, y + 1, r.z), delta = goal.clone().sub(controls.target).multiplyScalar(Math.min(1, rdt * 2.5));
      controls.target.add(delta); camera.position.add(delta);
      const dist = camera.position.distanceTo(controls.target); if (dist > 46) camera.position.lerp(controls.target, Math.min(1, rdt * 1.5) * (1 - 40 / dist));
    } else if (camGoal) {
      camera.position.lerp(camGoal.pos, Math.min(1, rdt * 2)); controls.target.lerp(camGoal.tgt, Math.min(1, rdt * 2));
      if (camera.position.distanceTo(camGoal.pos) < .5) camGoal = null;
    }
    controls.update();
    placeMeshes(now / 1000); labels();
    composer.render();
    uiT += rdt; histT += rdt;
    if (histT > .5) { histT = 0; fleet.forEach(o => { o.hist.bat.push(o.battery); o.hist.spd.push(o.speed); if (o.hist.bat.length > 90) { o.hist.bat.shift(); o.hist.spd.shift(); } }); }
    if (uiT > .25) { uiT = 0; renderList(); renderDetail(false); renderLog(); renderCap(); }
    requestAnimationFrame(frame);
  }
  kick();
}

function buildUI(root) {
  root.innerHTML = `
  <div class="fl-kpis">
    <div><small>Robots working</small><b data-kpi="active">–</b></div>
    <div><small>Deliveries tonight</small><b data-kpi="deliv">–</b></div>
    <div><small>Avg delivery time</small><b data-kpi="avg">–</b></div>
    <div><small>Floor cleaned tonight</small><b data-kpi="area">–</b></div>
    <div><small>Lift rides by robots</small><b data-kpi="lift">–</b></div>
    <div class="fl-clock"><small>Site time · simulated</small><b data-clock>–</b></div>
  </div>
  <div class="fl-main">
    <div class="fl-view">
      <canvas aria-label="3D view of the hotel tower with robots moving between floors"></canvas>
      <div class="fl-labels"></div><div class="fl-flabs"></div>
      <div class="fl-ctl">
        <button type="button" data-a="tour" aria-pressed="true">▶ Tour</button>
        <button type="button" data-a="whole">Whole building</button>
        <button type="button" data-a="follow" aria-pressed="false">Follow robot</button>
        <span class="fl-sep"></span>
        <button type="button" data-s="1" aria-pressed="false">1×</button><button type="button" data-s="4" aria-pressed="true">4×</button><button type="button" data-s="12" aria-pressed="false">12×</button>
        <button type="button" data-a="pause" aria-pressed="false">❚❚</button>
      </div>
      <div class="fl-cap"><small>Now following</small><b></b><span></span><em></em></div>
      <div class="fl-legend"><span style="--c:#38D0FF">Delivery</span><span style="--c:#F2B544">Luggage</span><span style="--c:#B49CFF">Linen</span><span style="--c:#3FD08A">Floor care</span><span style="--c:#D4A65A">Lifts</span></div>
    </div>
    <aside class="fl-panel" aria-label="Fleet telemetry">
      <div class="fl-ph"><b>Fleet</b><span>tap a robot to follow it</span></div>
      <div class="fl-list"></div>
      <div class="fl-detail" aria-live="off"></div>
    </aside>
  </div>
  <div class="fl-logw"><div class="fl-ph"><b>Event stream</b><span>Hotel.OS fleet adapter</span></div><ol class="fl-log"></ol></div>`;
  const q = s => root.querySelector(s);
  return {
    canvas: q('canvas'), labels: q('.fl-labels'), list: q('.fl-list'), detail: q('.fl-detail'), log: q('.fl-log'), clock: q('[data-clock]'),
    followBtn: q('[data-a="follow"]'), tourBtn: q('[data-a="tour"]'), cap: q('.fl-cap'), wholeBtn: q('[data-a="whole"]'), pauseBtn: q('[data-a="pause"]'), speedBtns: [...root.querySelectorAll('[data-s]')],
    kpi: { active: q('[data-kpi="active"]'), deliv: q('[data-kpi="deliv"]'), avg: q('[data-kpi="avg"]'), area: q('[data-kpi="area"]'), lift: q('[data-kpi="lift"]') },
    floorLabs: Array.from({ length: NF }, (_, f) => { const e = document.createElement('span'); e.className = 'fl-flab'; e.textContent = f ? `L${f + 1}` : 'L1 lobby'; q('.fl-flabs').appendChild(e); return e; }),
    dirtyLog: true,
  };
}

function boot() { document.querySelectorAll('[data-fleet-live]').forEach(el => { try { mount(el); } catch (e) { console.error('[fleet-live]', e); el.classList.add('fl-fail'); } }); }
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
