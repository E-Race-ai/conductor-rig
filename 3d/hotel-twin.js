/* Hotel.OS digital-twin viewer (procedural, illustrative building).
   Tiers: T1 LiDAR point cloud -> T2 building model -> T3 object layer -> T5 live operations.
   ES module; needs an import map for "three" and "three/addons/" (three@0.160.0).
   Auto-mounts every [data-hotel-twin] element. */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const C = { bg: 0x070B16, cloudLo: 0x0B3D91, cloudHi: 0x00C8FF, wall: 0x7FA6FF, slab: 0x0C1324, gold: 0xD4A65A,
  outlet: 0xD4A65A, switch: 0xEEF2FA, fixture: 0xFFE2A8, safety: 0xFF6B5E, robot: 0x00C8FF, hk: 0x2FD39A, sec: 0xFF6B5E, fac: 0xD4A65A, rob: 0x00C8FF, staff: 0xEEF2FA };

/* ---------- building definition (metres) ---------- */
const PH = 6.5, PX = 44, PZ = 16;   // podium: lobby + storefronts
const NF = 8, FH = 5.2, WH = 3.0, LX = 32, CZ = 1.5, DZ = 9.5;   // floors, exploded floor pitch, wall height, half length, corridor half width, half depth
function plan() {
  const walls = [];        // [x1,z1,x2,z2]
  const rooms = [];        // {x0,x1,z0,z1,side,kind}
  walls.push([-LX, -DZ, LX, -DZ], [-LX, DZ, LX, DZ], [-LX, -DZ, -LX, DZ], [LX, -DZ, LX, DZ]);
  // north rooms: 16 × 4 m
  for (let i = 0; i < 16; i++) rooms.push({ x0: -LX + i * 4, x1: -LX + (i + 1) * 4, z0: CZ, z1: DZ, side: 1, kind: 'room' });
  // south: core (8 m) + 12 rooms + BOH (8 m)
  rooms.push({ x0: -LX, x1: -24, z0: -DZ, z1: -CZ, side: -1, kind: 'core' });
  for (let i = 0; i < 12; i++) rooms.push({ x0: -24 + i * 4, x1: -20 + i * 4, z0: -DZ, z1: -CZ, side: -1, kind: 'room' });
  rooms.push({ x0: 24, x1: LX, z0: -DZ, z1: -CZ, side: -1, kind: 'boh' });
  // partitions
  rooms.forEach(r => { if (r.x0 > -LX) walls.push([r.x0, r.z0, r.x0, r.z1]); });
  // corridor walls with 1 m door gaps per room
  [CZ, -CZ].forEach(z => {
    const side = z > 0 ? 1 : -1;
    const doors = rooms.filter(r => r.side === side).map(r => (r.kind === 'core' ? r.x0 + 4 : r.x0 + 2.6));
    let x = -LX;
    doors.sort((a, b) => a - b).forEach(d => { walls.push([x, z, d - 0.5, z]); x = d + 0.5; });
    walls.push([x, z, LX, z]);
  });
  // elevator shafts in core
  [[-31, -9], [-28.5, -9]].forEach(([x, z]) => { walls.push([x, z, x + 2.2, z], [x + 2.2, z, x + 2.2, z + 2.4], [x + 2.2, z + 2.4, x, z + 2.4], [x, z + 2.4, x, z]); });
  return { walls, rooms };
}

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

function discTex(ring) {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  if (ring) { g.strokeStyle = '#fff'; g.lineWidth = 6; g.beginPath(); g.arc(32, 32, 24, 0, Math.PI * 2); g.stroke(); g.fillStyle = 'rgba(255,255,255,.9)'; g.beginPath(); g.arc(32, 32, 9, 0, Math.PI * 2); g.fill(); }
  else { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.45, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function build(scene, P) {
  const R = rng(7), L = {}, stats = { points: 0, walls: P.walls.length * NF, outlets: 0, switches: 0, fixtures: 0, safety: 0 };
  const dot = discTex(false), ring = discTex(true);
  const mk = (name) => (L[name] = Array.from({ length: NF }, () => new THREE.Group()));
  ['cloud', 'traj', 'model', 'objects', 'ops'].forEach(mk);
  const cLo = new THREE.Color(C.cloudLo), cHi = new THREE.Color(C.cloudHi), tmp = new THREE.Color();

  for (let f = 0; f < NF; f++) {
    const y0 = f * FH;
    /* T1 point cloud: walls + slab + furniture, coloured by height with intensity noise */
    const pos = [], col = [];
    const push = (x, y, z) => {
      pos.push(x + (R() - .5) * .03, y0 + y + (R() - .5) * .03, z + (R() - .5) * .03);
      const h = Math.min(1, y / WH); tmp.copy(cLo).lerp(cHi, h * .85 + R() * .15); const k = .55 + R() * .45; col.push(tmp.r * k, tmp.g * k, tmp.b * k);
    };
    P.walls.forEach(([x1, z1, x2, z2]) => {
      const len = Math.hypot(x2 - x1, z2 - z1), n = Math.floor(len * WH * 9);
      for (let i = 0; i < n; i++) { const t = R(), y = R() * WH; push(x1 + (x2 - x1) * t, y, z1 + (z2 - z1) * t); }
    });
    for (let i = 0; i < 2 * LX * 2 * DZ * 2.4; i++) push((R() * 2 - 1) * LX, 0, (R() * 2 - 1) * DZ);
    P.rooms.filter(r => r.kind === 'room').forEach(r => {   // bed + desk as scanned surfaces
      const bx = (r.x0 + r.x1) / 2, bz = r.side > 0 ? r.z1 - 2.6 : r.z0 + 2.6;
      for (let i = 0; i < 160; i++) push(bx + (R() - .5) * 2, .6, bz + (R() - .5) * 2.1);
      for (let i = 0; i < 40; i++) push(r.x0 + .5 + R() * 1.2, .75, (r.side > 0 ? r.z0 + 1.2 : r.z1 - 1.2) + (R() - .5) * .5);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    stats.points += pos.length / 3;
    const pm = new THREE.PointsMaterial({ size: .11, vertexColors: true, map: dot, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 1 });
    L.cloud[f].add(new THREE.Points(g, pm));

    /* scan trajectory: corridor + dips into rooms */
    const tp = [new THREE.Vector3(-LX + 1, y0 + .35, 0)];
    for (let x = -LX + 4; x < LX - 1; x += 8) { tp.push(new THREE.Vector3(x, y0 + .35, 0), new THREE.Vector3(x + .4, y0 + .35, (f % 2 ? -1 : 1) * 4.5), new THREE.Vector3(x + .8, y0 + .35, 0)); }
    tp.push(new THREE.Vector3(LX - 1, y0 + .35, 0));
    const tg = new THREE.BufferGeometry().setFromPoints(new THREE.CatmullRomCurve3(tp).getPoints(400));
    L.traj[f].add(new THREE.Line(tg, new THREE.LineBasicMaterial({ color: C.cloudHi, transparent: true, opacity: .45 })));
    L.traj[f].userData.curve = new THREE.CatmullRomCurve3(tp);

    /* T2 model: slab + wall outlines + faint wall faces */
    const slab = new THREE.Mesh(new THREE.BoxGeometry(2 * LX, .18, 2 * DZ), new THREE.MeshBasicMaterial({ color: C.slab, transparent: true, opacity: .92 }));
    slab.position.set(0, y0 - .09, 0); L.model[f].add(slab);
    const lp = [], fp = [];
    P.walls.forEach(([x1, z1, x2, z2]) => {
      lp.push(x1, y0, z1, x2, y0, z2, x1, y0 + WH, z1, x2, y0 + WH, z2, x1, y0, z1, x1, y0 + WH, z1, x2, y0, z2, x2, y0 + WH, z2);
      fp.push(x1, y0, z1, x2, y0, z2, x2, y0 + WH, z2, x1, y0, z1, x2, y0 + WH, z2, x1, y0 + WH, z1);
    });
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
    L.model[f].add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: C.wall, transparent: true, opacity: .9 })));
    const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3));
    L.model[f].add(new THREE.Mesh(fg, new THREE.MeshBasicMaterial({ color: 0x1A2A55, transparent: true, opacity: .32, side: THREE.DoubleSide, depthWrite: false })));

    /* T3 objects: outlets, switches, ceiling fixtures, life safety */
    const O = { outlet: [], switch: [], fixture: [], safety: [] };
    P.rooms.forEach(r => {
      const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, back = r.side > 0 ? r.z1 - .05 : r.z0 + .05, front = r.side > 0 ? r.z0 + .05 : r.z1 - .05;
      if (r.kind === 'room') {
        O.outlet.push([r.x0 + .05, .3, cz - 2], [r.x0 + .05, .3, cz + 2], [r.x1 - .05, .3, cz], [cx - 1.2, .3, back], [cx + 1.2, .3, back], [cx + 1.6, .9, front]);
        O.switch.push([r.x0 + 2.3, 1.2, front], [cx, 1.2, back - (r.side > 0 ? 1.3 : -1.3)]);
        O.fixture.push([cx, WH - .02, cz], [cx, WH - .02, front + (r.side > 0 ? 1 : -1)], [cx - 1, WH - .02, back - (r.side > 0 ? .8 : -.8)]);
        O.safety.push([cx + .6, WH - .02, cz + .4]);
      } else {
        for (let x = r.x0 + 1; x < r.x1; x += 2) O.fixture.push([x, WH - .02, cz]);
        O.outlet.push([r.x0 + .05, .3, cz], [r.x1 - .05, .3, cz]); O.switch.push([r.x0 + 3.5, 1.2, front]); O.safety.push([cx, WH - .02, cz]);
      }
    });
    for (let x = -LX + 2; x < LX; x += 4) { O.fixture.push([x, WH - .02, 0]); if ((x + LX) % 8 === 2) O.safety.push([x + 1, WH - .02, 0]); O.outlet.push([x + 1, .3, CZ - .05]); }
    const cls = { outlet: [C.outlet, 9], switch: [C.switch, 8], fixture: [C.fixture, 7], safety: [C.safety, 8] };
    Object.entries(O).forEach(([k, arr]) => {
      stats[k === 'switch' ? 'switches' : k === 'safety' ? 'safety' : k + 's'] += arr.length;
      const og = new THREE.BufferGeometry(); og.setAttribute('position', new THREE.Float32BufferAttribute(arr.flatMap(([x, y, z]) => [x, y0 + y, z]), 3));
      L.objects[f].add(new THREE.Points(og, new THREE.PointsMaterial({ color: cls[k][0], size: cls[k][1], sizeAttenuation: false, map: dot, transparent: true, depthWrite: false, opacity: 1 })));
    });
    L.objects[f].userData.O = O;
  }

  /* T5 operations: tasks, robots, staff */
  const deptCol = { Facilities: C.fac, Housekeeping: C.hk, Security: C.sec, Robotics: C.rob };
  const tasks = [
    { id: 'WO-1042', d: 'Facilities', t: 'Outlet 4F-1206-OUT-04 · no power', f: 3, p: [-21.95, .3, 5.5] },
    { id: 'HK-2210', d: 'Housekeeping', t: 'Room 2F-1207 · turnover', f: 1, p: [6, 0, -5.5] },
    { id: 'RB-0381', d: 'Robotics', t: 'Linen pickup 5F → BOH · R2', f: 4, p: [14, 0, 5.5] },
    { id: 'SEC-077', d: 'Security', t: 'Door 1F-D01 held open', f: 0, p: [-26, 0, -1.5] },
    { id: 'WO-1051', d: 'Facilities', t: 'Fixture 6F corridor · flicker', f: 5, p: [10, WH, 0] },
    { id: 'HK-2234', d: 'Housekeeping', t: 'Spill · 3F corridor', f: 2, p: [-6, 0, 0] },
    { id: 'RB-0392', d: 'Robotics', t: 'W3 · amenity kit → 7F-1712', f: 6, p: [-8, 0, 5.5] },
    { id: 'WO-1060', d: 'Facilities', t: 'FCU 3F-1310 · room warm', f: 2, p: [18, WH, 5.5] },
    { id: 'SEC-081', d: 'Security', t: 'Patrol · 8F stair door', f: 7, p: [-30, 0, -1.5] },
  ];
  tasks.forEach(tk => {
    const y0 = tk.f * FH, [x, y, z] = tk.p, colr = deptCol[tk.d];
    const lg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, y0 + y, z), new THREE.Vector3(x, y0 + 3.6, z)]);
    const tl = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: colr, transparent: true, opacity: 1 })); tl.userData.dept = tk.d; L.ops[tk.f].add(tl);
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute([x, y0 + 3.6, z], 3));
    const pin = new THREE.Points(pg, new THREE.PointsMaterial({ color: colr, size: 30, sizeAttenuation: false, map: ring, transparent: true, depthWrite: false, depthTest: false, opacity: 1 }));
    pin.userData.pulse = R() * 6; pin.userData.dept = tk.d; L.ops[tk.f].add(pin); tk.pin = pin;
  });
  for (let f = 0; f < NF; f++) {
    const y = f * FH + .05, rp = [-LX + 1, y, 0, LX - 1, y, 0, -28, y, 0, -28, y, -1.5, 28, y, 0, 28, y, -4];
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
    L.ops[f].add(new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: C.rob, transparent: true, opacity: .75 })));
  }
  { const sg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-29.4, 0, -7.8), new THREE.Vector3(-29.4, (NF - 1) * FH + WH, -7.8)]);
    L.ops[0].add(new THREE.Line(sg, new THREE.LineDashedMaterial({ color: C.rob, dashSize: .6, gapSize: .4, transparent: true, opacity: .8 })).computeLineDistances()); }
  const robots = [];
  const mkRobot = (f, x0, x1, z, speed, lift) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.2, .9), new THREE.MeshBasicMaterial({ color: C.robot, transparent: true, opacity: 1 }));
    const halo = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3)),
      new THREE.PointsMaterial({ color: C.robot, size: 46, sizeAttenuation: false, map: dot, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: .7 }));
    m.userData.dept = 'Robotics'; halo.userData.dept = 'Robotics'; m.add(halo); L.ops[f].add(m); robots.push({ m, f, x0, x1, z, speed, ph: R() * 10, lift });
  };
  mkRobot(4, -20, 26, -.9, .9); mkRobot(1, -28, 20, .9, .7); mkRobot(2, -10, 28, .95, 1.1); mkRobot(0, -24, 24, -.9, .8, true);
  const staff = [];
  [[0, -18, 0, 'Security'], [1, 6, -4, 'Housekeeping'], [2, -4, 0, 'Housekeeping'], [3, -21, 4, 'Facilities'], [5, 12, 0, 'Facilities'], [4, 20, -5, 'Housekeeping'], [6, -10, 4, 'Housekeeping'], [7, -26, 0, 'Security']].forEach(([f, x, z, dp]) => {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([x, f * FH + 1.7, z], 3));
    const p = new THREE.Points(g, new THREE.PointsMaterial({ color: C.staff, size: 9, sizeAttenuation: false, map: dot, transparent: true, depthWrite: false, opacity: 1 }));
    p.userData.dept = dp; L.ops[f].add(p); staff.push(p);
  });
  /* podium (index NF): double-height lobby, storefronts on the street side, two hotel receptions */
  {
    const pw = [[-PX, -PZ, PX, -PZ], [-PX, PZ, PX, PZ], [-PX, -PZ, -PX, PZ], [PX, -PZ, PX, PZ], [-PX + 4, 9, PX - 4, 9]];
    for (let x = -PX + 4; x <= PX - 4; x += 8) pw.push([x, 9, x, PZ]);
    [[-14, -4], [8, -4]].forEach(([x, z]) => pw.push([x, z, x + 7, z], [x + 7, z, x + 7, z + 1.2], [x + 7, z + 1.2, x, z + 1.2], [x, z + 1.2, x, z]));
    const yb = -PH, pos = [], col = [], lp = [];
    pw.forEach(([x1, z1, x2, z2]) => {
      const len = Math.hypot(x2 - x1, z2 - z1), n = Math.floor(len * PH * 6);
      for (let i = 0; i < n; i++) { const t = R(), y = R() * PH; pos.push(x1 + (x2 - x1) * t, yb + y, z1 + (z2 - z1) * t); tmp.copy(cLo).lerp(cHi, y / PH * .85 + R() * .15); const k = .55 + R() * .45; col.push(tmp.r * k, tmp.g * k, tmp.b * k); }
      lp.push(x1, yb, z1, x2, yb, z2, x1, yb + PH, z1, x2, yb + PH, z2, x1, yb, z1, x1, yb + PH, z1);
    });
    for (let i = 0; i < 2 * PX * 2 * PZ * 1.6; i++) { pos.push((R() * 2 - 1) * PX, yb, (R() * 2 - 1) * PZ); tmp.copy(cLo); const k = .4 + R() * .4; col.push(tmp.r * k, tmp.g * k, tmp.b * k); }
    stats.points += pos.length / 3; stats.walls += pw.length;
    ['cloud', 'traj', 'model', 'objects', 'ops'].forEach(n => { const g = new THREE.Group(); g.userData.y0 = yb; L[n].push(g); });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    L.cloud[NF].add(new THREE.Points(g, new THREE.PointsMaterial({ size: .11, vertexColors: true, map: dot, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 1 })));
    const sl = new THREE.Mesh(new THREE.BoxGeometry(2 * PX, .25, 2 * PZ), new THREE.MeshBasicMaterial({ color: C.slab, transparent: true, opacity: .95 })); sl.position.y = yb - .13; L.model[NF].add(sl);
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
    L.model[NF].add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: C.wall, transparent: true, opacity: .9 })));
    const sf = [], fx = [], sw = [];
    for (let x = -PX + 8; x <= PX - 4; x += 8) { sf.push([x - 4, yb + .3, 9.05], [x - 2, yb + .3, PZ - .05]); fx.push([x - 4, yb + PH - .05, 12.5], [x - 4, yb + PH - .05, 6]); sw.push([x - 1, yb + 1.2, 9.05]); }
    for (let x = -PX + 4; x < PX; x += 6) fx.push([x, yb + PH - .05, -6], [x, yb + PH - .05, 0]);
    [[C.outlet, 9, sf], [C.fixture, 7, fx], [C.switch, 8, sw]].forEach(([c, sz, arr]) => {
      stats[c === C.outlet ? 'outlets' : c === C.fixture ? 'fixtures' : 'switches'] += arr.length;
      const og = new THREE.BufferGeometry(); og.setAttribute('position', new THREE.Float32BufferAttribute(arr.flat(), 3));
      L.objects[NF].add(new THREE.Points(og, new THREE.PointsMaterial({ color: c, size: sz, sizeAttenuation: false, map: dot, transparent: true, depthWrite: false, opacity: 1 })));
    });
    // operator zones (T5): retail strip, operator A + B receptions; tower floors tinted by operator, residential excluded
    const zone = (x0, x1, z0, z1, y, c, o) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, side: THREE.DoubleSide, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); return m; };
    L.ops[NF].add(zone(-PX, PX, 9, PZ, yb + .03, 0xB07CFF, .22), zone(-PX, 0, -PZ, 9, yb + .03, C.wall, .14), zone(0, PX, -PZ, 9, yb + .03, C.gold, .14));
    for (let f = 0; f < NF; f++) { const c = f < 3 ? C.wall : f < 5 ? C.gold : 0x6F7B97; L.ops[f].add(zone(-LX, LX, -DZ, DZ, f * FH + .02, c, f < 5 ? .13 : .07)); }
  }
  Object.values(L).forEach(arr => arr.forEach(g => scene.add(g)));
  return { L, stats, tasks, robots, staff };
}

const MODES = {
  t1: { k: 'T1', name: 'LiDAR capture', d: 'Registered point cloud from Site Capture, survey-controlled. Cyan line: capture trajectory.', o: { cloud: 1, traj: 1, model: 0, objects: 0, ops: 0 } },
  t2: { k: 'T2', name: 'Building model', d: 'Scan-to-BIM: slabs, walls, doors, rooms and vertical circulation, keyed to PMS room numbers.', o: { cloud: .12, traj: 0, model: 1, objects: 0, ops: 0 } },
  t3: { k: 'T3', name: 'Object layer', d: 'Every outlet, switch, fixture and life-safety device, located in 3D and given an asset ID.', o: { cloud: .06, traj: 0, model: .55, objects: 1, ops: 0 } },
  t5: { k: 'T5', name: 'Live operations', d: 'Tasks pinned to objects, robots on the route graph, staff on shift — one map for every department.', o: { cloud: 0, traj: 0, model: .5, objects: .3, ops: 1 } },
};
MODES.walk = { k: 'WALK', name: 'Walk the property', d: 'First-person walk through floor 4: 360° imagery registered to the LiDAR, so every pixel resolves to a 3D point, a room and an asset.', o: { cloud: .35, traj: 0, model: .8, objects: 1, ops: 1 } };
const ORDER = ['t1', 't2', 't3', 't5', 'walk'];

function mount(el) {
  if (el._ht) return el._ht;
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' }); }
  catch (e) { el.classList.add('ht-fail'); return null; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setClearColor(C.bg, 1);
  const stage = el.querySelector('.ht-stage') || el; stage.appendChild(renderer.domElement);
  const scene = new THREE.Scene(); scene.fog = new THREE.Fog(C.bg, 110, 230);
  const cam = new THREE.PerspectiveCamera(32, 1, .5, 600);
  const narrow = () => el.clientWidth < 640;
  const homePos = new THREE.Vector3(), homeTgt = new THREE.Vector3(0, (NF - 1) * FH / 2 - PH / 2, 0);
  const home = () => { cam.position.set(narrow() ? -112 : -86, narrow() ? 64 : 46, narrow() ? 124 : 96); };
  home();
  homePos.copy(cam.position); const ctl = new OrbitControls(cam, renderer.domElement); if (matchMedia('(pointer: coarse)').matches && narrow()) { ctl.enabled = false; renderer.domElement.style.touchAction = 'pan-y'; } ctl.target.copy(homeTgt); ctl.enableDamping = true; ctl.dampingFactor = .08;
  ctl.minDistance = 25; ctl.maxDistance = 220; ctl.maxPolarAngle = Math.PI * .49; ctl.autoRotate = !REDUCED; ctl.autoRotateSpeed = .35;
  // ground grid
  const grid = new THREE.GridHelper(220, 88, 0x1C2640, 0x111A30); grid.position.y = -PH - .3; grid.material.transparent = true; grid.material.opacity = .55; scene.add(grid);
  const P = plan(), B = build(scene, P);

  // HUD
  const $ = (s) => el.querySelector(s);
  const st = $('[data-ht-stats]');
  if (st) st.innerHTML = [['points', B.stats.points], ['walls', B.stats.walls], ['outlets', B.stats.outlets], ['switches', B.stats.switches], ['fixtures', B.stats.fixtures], ['life safety', B.stats.safety]]
    .map(([k, v]) => `<span><b>${v.toLocaleString('en-US')}</b>${k}</span>`).join('');
  const tl = $('[data-ht-tasks]');
  if (tl) tl.innerHTML = B.tasks.map(t => `<li data-dept="${t.d}" style="--c:#${new THREE.Color({ Facilities: C.fac, Housekeeping: C.hk, Security: C.sec, Robotics: C.rob }[t.d]).getHexString()}"><b>${t.id}</b><span>${t.d} · F${t.f + 1}</span><em>${t.t}</em></li>`).join('');

  const cur = {}; Object.keys(MODES.t1.o).forEach(k => (cur[k] = 0));
  const LENS = { all: null, hk: ['Housekeeping'], fac: ['Facilities'], sec: ['Security'], rob: ['Robotics'] }; let lens = 'all';
  const lensF = (d) => (!d || !LENS[lens] || LENS[lens].includes(d)) ? 1 : .14;
  const grow = new Array(NF + 1).fill(1); let scan = 1, walkT = 0, flyHome = false, prevMode = 't1'; const WALKF = 3;
  let mode = 't1', focus = -1, auto = !REDUCED, tAuto = 0, dogT = 0;
  const btns = [...el.querySelectorAll('[data-ht-mode]')], fbtns = [...el.querySelectorAll('[data-ht-floor]')], playBtn = $('[data-ht-play]'), bar = $('.ht-prog i');
  const setMode = (m, user) => {
    mode = m; tAuto = 0;
    btns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.htMode === m)));
    const M = MODES[m]; const h = $('[data-ht-title]'), d = $('[data-ht-desc]');
    if (h) h.innerHTML = `<i>${M.k}</i>${M.name}`; if (d) d.textContent = M.d;
    el.dataset.mode = m; if (m === 't2') grow.fill(0); if (m === 't1') scan = 0;
    if (m === 'walk') { walkT = 0; ctl.enabled = false; ctl.autoRotate = false; flyHome = false; } else if (prevMode === 'walk') { flyHome = true; ctl.enabled = !(matchMedia('(pointer: coarse)').matches && narrow()); }
    prevMode = m;
    if (user) stopAuto();
  };
  const stopAuto = () => { auto = false; if (playBtn) { playBtn.setAttribute('aria-pressed', 'false'); playBtn.textContent = '▶ Play sequence'; } };
  btns.forEach(b => b.addEventListener('click', () => setMode(b.dataset.htMode, true)));
  const lbtns = [...el.querySelectorAll('[data-ht-lens]')];
  const setLens = (k) => { lens = k; lbtns.forEach(x => x.setAttribute('aria-pressed', String(x.dataset.htLens === k)));
    const ul = el.querySelector('[data-ht-tasks]'); if (ul) { const lis = [...ul.children]; lis.forEach(li => li.classList.toggle('dim', !!LENS[k] && !LENS[k].includes(li.dataset.dept)));
      lis.sort((x, y) => (x.classList.contains('dim') ? 1 : 0) - (y.classList.contains('dim') ? 1 : 0)).forEach(li => ul.appendChild(li)); }
    el.dataset.lens = k; };
  lbtns.forEach(b => b.addEventListener('click', () => { setLens(b.dataset.htLens); if (mode !== 't5' && mode !== 'walk') setMode('t5', true); else stopAuto(); }));
  fbtns.forEach(b => b.addEventListener('click', () => { focus = +b.dataset.htFloor; fbtns.forEach(x => x.setAttribute('aria-pressed', String(x === b))); }));
  if (playBtn) playBtn.addEventListener('click', () => { auto = !auto; playBtn.setAttribute('aria-pressed', String(auto)); playBtn.textContent = auto ? '❚❚ Pause sequence' : '▶ Play sequence'; if (auto) setMode(mode === 't5' ? 't1' : mode); });
  ctl.addEventListener('start', () => { ctl.autoRotate = false; });
  setMode('t1');

  let composer = null, bloom = null;
  if (!matchMedia('(pointer: coarse)').matches && !/nobloom/.test(location.search)) {
    try { composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, cam));
      bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), .5, .35, .32); composer.addPass(bloom); composer.addPass(new OutputPass()); } catch (e) { composer = null; }
    if (composer) { const lc = new THREE.Color(C.bg).convertSRGBToLinear(); renderer.setClearColor(lc, 1); }
  }
  const resize = () => { const w = stage.clientWidth, h = stage.clientHeight; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); if (composer) { composer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); composer.setSize(w, h); } };
  new ResizeObserver(resize).observe(stage); resize();

  let vis = true, last = performance.now(), raf = 0;
  const io = new IntersectionObserver(es => { vis = es[0].isIntersecting; if (vis && !raf) { last = performance.now(); raf = requestAnimationFrame(loop); } }, { threshold: .05 });
  io.observe(el);
  const dog = new THREE.Mesh(new THREE.BoxGeometry(.7, .4, .3), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }));
  const dogHalo = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3)), new THREE.PointsMaterial({ color: C.cloudHi, size: 34, sizeAttenuation: false, map: discTex(false), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  dog.add(dogHalo); scene.add(dog);
  const ringG = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 97 }, (_, i) => new THREE.Vector3(Math.cos(i / 96 * Math.PI * 2), 0, Math.sin(i / 96 * Math.PI * 2))));
  const sweeps = [0, .33, .66].map(o => { const r = new THREE.Line(ringG, new THREE.LineBasicMaterial({ color: C.cloudHi, transparent: true, opacity: 0, blending: THREE.AdditiveBlending })); r.userData.o = o; scene.add(r); return r; });

  function loop(now) {
    raf = 0; if (!vis) return;
    const dt = Math.max(0, Math.min(.05, (now - last) / 1000)); last = now; const t = now / 1000;
    const isWalk = mode === 'walk';
    if (auto) { tAuto += dt; if (bar) bar.style.transform = `scaleX(${Math.min(1, tAuto / 6.5)})`; if (tAuto > 6.5) setMode(ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length]); }
    else if (bar) bar.style.transform = 'scaleX(0)';
    const tgt = MODES[mode].o, k = 1 - Math.pow(.002, dt);
    Object.keys(cur).forEach(n => {
      cur[n] += (tgt[n] - cur[n]) * k;
      B.L[n].forEach((g, f) => {
        const ff2 = isWalk ? WALKF : focus, fo = ff2 < 0 || ff2 === f ? 1 : .05, a = cur[n] * fo;
        g.visible = a > .01;
        g.traverse(o => { if (o.material) { const base = o.userData.base ?? (o.userData.base = o.material.opacity); o.material.opacity = base * a * lensF(o.userData.dept); } });
      });
    });
    // scanning dog on the trajectory of the focused (or top) floor
    const ff = focus < 0 ? NF - 1 : focus, curve = B.L.traj[ff].userData.curve; dogT = (((dogT + dt * .035) % 1) + 1) % 1;
    const dp = curve.getPointAt(dogT); dog.position.copy(dp); dog.position.y += .2; dog.material.opacity = cur.traj; dogHalo.material.opacity = cur.traj * .8; dog.visible = cur.traj > .02;
    sweeps.forEach(r => { const ph = ((t * .45 + r.userData.o) % 1); r.position.copy(dog.position); r.position.y -= .15; r.scale.setScalar(.5 + ph * 9); r.material.opacity = (1 - ph) * .7 * cur.traj; r.visible = cur.traj > .02; });
    // floors assemble (T2) and the cloud fills in like a live scan (T1)
    if (scan < 1) { scan = Math.min(1, scan + dt / 2.6); B.L.cloud.forEach(g => g.children.forEach(pt => { if (!pt.geometry.attributes.position) return; const n = pt.geometry.attributes.position.count; pt.geometry.setDrawRange(0, Math.floor(n * (1 - Math.pow(1 - scan, 2)))); })); }
    B.L.model.forEach((g, f) => { if (grow[f] < 1) { const d = f * .14; grow[f] = Math.min(1, grow[f] + dt / .9 * (mode === 't2' && (tAuto > d || !auto) ? 1 : 0)); }
      const e = 1 - Math.pow(1 - grow[f], 3), y0 = g.userData.y0 ?? f * FH; g.scale.y = Math.max(.001, e); g.position.y = y0 * (1 - e); });
    // robots
    B.robots.forEach(r => {
      const s = (Math.sin((t + r.ph) * r.speed * .25) + 1) / 2; r.m.position.set(r.x0 + (r.x1 - r.x0) * s, r.f * FH + .45, r.z);
      if (r.lift) { const cyc = (t * .12 + r.ph) % 2; if (cyc > 1) { r.m.position.set(-29.4, (cyc - 1) * (NF - 1) * FH + .45, -7.8); } }
    });
    B.tasks.forEach(tk => { const p = .65 + .35 * Math.sin(t * 2.2 + tk.pin.userData.pulse); tk.pin.material.size = 26 + 10 * p; });
    if (isWalk) {
      walkT += dt; const span = 2 * LX - 8, x = -LX + 4 + (walkT * 2.4) % span, y = WALKF * FH + 1.6;
      const want = new THREE.Vector3(x, y, -.2), look = new THREE.Vector3(x + 8, y - .25, .15 * Math.sin(walkT * .5));
      const k2 = 1 - Math.pow(.02, dt); cam.position.lerp(want, walkT < 2.5 ? k2 * .6 : 1); ctl.target.lerp(look, walkT < 2.5 ? k2 * .6 : 1); cam.lookAt(ctl.target);
    } else {
      if (flyHome) { const k3 = 1 - Math.pow(.03, dt); cam.position.lerp(homePos, k3); ctl.target.lerp(homeTgt, k3); if (cam.position.distanceTo(homePos) < .5) flyHome = false; }
      ctl.update();
    }
    if (bloom && /bloom0/.test(location.search)) bloom.strength = 0; else if (bloom) bloom.strength = ({ t1: .75, t2: .45, t3: .3, t5: .4, walk: .3 })[mode] ?? .4;
    if (composer) composer.render(); else renderer.render(scene, cam);
    raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);
  const api = { setMode, dispose() { cancelAnimationFrame(raf); io.disconnect(); renderer.dispose(); } };
  el._ht = api; return api;
}

function boot() { document.querySelectorAll('[data-hotel-twin]').forEach(el => { try { mount(el); } catch (e) { console.error('[hotel-twin]', e); el.classList.add('ht-fail'); } }); }
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
window.HotelTwin = { mount };
