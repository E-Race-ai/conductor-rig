/* The Brain · live orchestration view (illustrative simulation).
   Employees -> control plane -> sandboxes -> model router -> frontier (C0/C1) or local (C2)
   -> review gate -> Git main -> context brain. Every hop writes to the audit log.
   Auto-mounts every [data-brain-flow] element. No dependencies. */
(function () {
  'use strict';
  var REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var W = 1200, H = 640;
  var COL = { bg: '#070B16', grid: '#0F1830', line: '#24304F', text: '#EEF2FA', dim: '#8E9AB5', faint: '#5A6684',
    blue: '#4D8BFF', ctx: '#7FA6FF', gold: '#D4A65A', cyan: '#00C8FF', green: '#2FD39A', white: '#EEF2FA', red: '#FF6B5E' };
  var N = {
    leads: [['Operations staff', 40, 96], ['Finance & admin', 40, 196], ['Sales & BD', 40, 296], ['Engineering & field', 40, 396]].map(function (a) { return { t: a[0], x: a[1], y: a[2], w: 170, h: 58 }; }),
    ctx: { t: 'Central context brain', s: 'repos · specs · ADRs · decision log', x: 300, y: 64, w: 290, h: 92, c: COL.ctx },
    ctl: { t: 'Control plane', s: 'queue · policy · budgets · lifecycle', x: 300, y: 236, w: 290, h: 100, c: COL.blue },
    sb: [0, 1, 2, 3].map(function (i) { return { t: ['Ops', 'Finance', 'Sales', 'Field'][i], x: 262 + i * 96, y: 420, w: 86, h: 54 }; }),
    rt: { t: 'Model router', s: 'policy by data class', x: 668, y: 246, w: 150, h: 80, c: COL.blue },
    fr: { t: 'Frontier model APIs', s: 'C0 · C1 · zero retention', x: 930, y: 118, w: 230, h: 80, c: COL.cyan },
    lo: { t: 'Local inference', s: 'C2 · RTX 5070 Ti · on premises', x: 930, y: 370, w: 230, h: 80, c: COL.gold },
    rg: { t: 'Review gate', s: 'tests · human approval', x: 668, y: 470, w: 190, h: 62, c: COL.green },
    gm: { t: 'Git main', s: 'shared systems', x: 930, y: 470, w: 230, h: 62, c: COL.green },
  };
  function cx(n) { return n.x + n.w / 2; } function cy(n) { return n.y + n.h / 2; }
  function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function plen(p) { var L = 0; for (var i = 1; i < p.length; i++) L += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return L; }
  function pat(p, t) { var L = plen(p) * t; for (var i = 1; i < p.length; i++) { var d = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); if (L <= d) { var k = d ? L / d : 0; return [p[i - 1][0] + (p[i][0] - p[i - 1][0]) * k, p[i - 1][1] + (p[i][1] - p[i - 1][1]) * k]; } L -= d; } return p[p.length - 1]; }
  // routes
  function leadToCtl(i) { var l = N.leads[i]; return [[l.x + l.w, cy(l)], [255, cy(l)], [255, cy(N.ctl)], [N.ctl.x, cy(N.ctl)]]; }
  var ctlToCtx = [[cx(N.ctx) - 40, N.ctl.y], [cx(N.ctx) - 40, N.ctx.y + N.ctx.h]], ctxToCtl = [[cx(N.ctx) + 40, N.ctx.y + N.ctx.h], [cx(N.ctx) + 40, N.ctl.y]];
  function ctlToSb(i) { var s = N.sb[i]; return [[cx(N.ctl), N.ctl.y + N.ctl.h], [cx(N.ctl), 380], [cx(s), 380], [cx(s), s.y]]; }
  function sbToRt(i) { var s = N.sb[i]; return [[cx(s) + 10, s.y], [cx(s) + 10, 396], [640, 396], [640, cy(N.rt)], [N.rt.x, cy(N.rt)]]; }
  var rtToFr = [[N.rt.x + N.rt.w, cy(N.rt) - 14], [880, cy(N.rt) - 14], [880, cy(N.fr)], [N.fr.x, cy(N.fr)]];
  var rtToLo = [[N.rt.x + N.rt.w, cy(N.rt) + 14], [880, cy(N.rt) + 14], [880, cy(N.lo)], [N.lo.x, cy(N.lo)]];
  function sbToRg(i) { var s = N.sb[i]; return [[cx(s) - 10, s.y + s.h], [cx(s) - 10, 556], [cx(N.rg), 556], [cx(N.rg), N.rg.y + N.rg.h]]; }
  var rgToGm = [[N.rg.x + N.rg.w, cy(N.rg)], [N.gm.x, cy(N.gm)]];
  var gmToCtx = [[N.gm.x + N.gm.w, cy(N.gm)], [1186, cy(N.gm)], [1186, 22], [cx(N.ctx), 22], [cx(N.ctx), N.ctx.y]];

  function mount(el) {
    var cv = document.createElement('canvas'); el.querySelector('.bf-stage').appendChild(cv);
    var g = cv.getContext('2d'), dpr = 1, scale = 1;
    function size() { var w = cv.parentNode.clientWidth; scale = w / W; dpr = Math.min(devicePixelRatio || 1, 2); cv.width = Math.round(w * dpr); cv.height = Math.round(H * scale * dpr); cv.style.width = w + 'px'; cv.style.height = Math.round(H * scale) + 'px'; }
    new ResizeObserver(size).observe(cv.parentNode); size();
    var mix = { c2: .35 }, packets = [], audit = [], stats = { tasks: 0, local: 0, frontier: 0, merges: 0 }, spawnT = 0;
    var hud = { tasks: el.querySelector('[data-bf=tasks]'), local: el.querySelector('[data-bf=local]'), merges: el.querySelector('[data-bf=merges]') };
    [].forEach.call(el.querySelectorAll('[data-bf-mix]'), function (b) {
      b.addEventListener('click', function () { mix.c2 = +b.dataset.bfMix; [].forEach.call(el.querySelectorAll('[data-bf-mix]'), function (x) { x.setAttribute('aria-pressed', String(x === b)); }); });
    });
    function log(c) { audit.push({ c: c, t: 0 }); if (audit.length > 90) audit.shift(); }
    function job() {
      var i = Math.floor(Math.random() * 4), c2 = Math.random() < mix.c2, cls = c2 ? COL.gold : COL.cyan;
      var stages = [[leadToCtl(i), COL.white], [ctlToCtx, COL.ctx], [ctxToCtl, COL.ctx], [ctlToSb(i), COL.white], [sbToRt(i), cls], [c2 ? rtToLo : rtToFr, cls], [(c2 ? rtToLo : rtToFr).slice().reverse(), cls], [sbToRt(i).slice().reverse(), cls], [sbToRg(i), COL.green]];
      if (Math.random() < .8) stages.push([rgToGm, COL.green], [gmToCtx, COL.ctx]);
      stats.tasks++; packets.push({ st: stages, k: 0, t: 0, c2: c2, merged: stages.length > 9, spd: 1.1 + Math.random() * .5 });
    }
    function box(n, c, active) {
      g.save(); rr(g, n.x, n.y, n.w, n.h, 10); g.fillStyle = '#0B1222'; g.fill();
      g.lineWidth = active ? 2 : 1.4; g.strokeStyle = c || COL.line; if (active) { g.shadowColor = c; g.shadowBlur = 16; } g.stroke(); g.restore();
    }
    function label(n, c) {
      g.fillStyle = COL.text; g.font = '600 15px Inter, system-ui, sans-serif'; g.textAlign = 'center'; g.fillText(n.t, cx(n), cy(n) - (n.s ? 4 : -5));
      if (n.s) { g.fillStyle = COL.dim; g.font = '500 11px "IBM Plex Mono", monospace'; g.fillText(n.s, cx(n), cy(n) + 15); }
      if (c) { g.fillStyle = c; g.fillRect(n.x + 12, n.y, n.w - 24, 2); }
    }
    function route(p, c, a) { g.beginPath(); g.moveTo(p[0][0], p[0][1]); for (var i = 1; i < p.length; i++) g.lineTo(p[i][0], p[i][1]); g.strokeStyle = c; g.globalAlpha = a; g.lineWidth = 1.3; g.stroke(); g.globalAlpha = 1; }
    var glow = {};
    function frame(dt) {
      g.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
      g.fillStyle = COL.bg; g.fillRect(0, 0, W, H);
      g.strokeStyle = COL.grid; g.lineWidth = 1; g.beginPath(); for (var x = 0; x <= W; x += 24) { g.moveTo(x, 0); g.lineTo(x, H); } for (var y = 0; y <= H; y += 24) { g.moveTo(0, y); g.lineTo(W, y); } g.stroke();
      // routes
      for (var i = 0; i < 4; i++) { route(leadToCtl(i), COL.line, 1); route(ctlToSb(i), COL.line, 1); route(sbToRt(i), COL.line, 1); route(sbToRg(i), COL.line, 1); }
      route(ctlToCtx, COL.ctx, .45); route(ctxToCtl, COL.ctx, .45); route(rtToFr, COL.cyan, .5); route(rtToLo, COL.gold, .5); route(rgToGm, COL.green, .5); route(gmToCtx, COL.ctx, .35);
      // boundary: on-premises vs cloud
      g.save(); g.setLineDash([6, 6]); g.strokeStyle = '#2A3658'; g.lineWidth = 1.2; rr(g, 900, 92, 284, 134, 14); g.stroke();
      g.strokeStyle = 'rgba(212,166,90,.45)'; rr(g, 230, 40, 954, 540, 18); g.stroke(); g.restore();
      g.font = '600 10.5px "IBM Plex Mono", monospace'; g.textAlign = 'left'; g.fillStyle = COL.gold; g.fillText('ON PREMISES · THE BRAIN', 244, 34 + 22);
      g.fillStyle = COL.cyan; g.fillText('CLOUD · EGRESS C0–C1 ONLY', 914, 86 + 22);
      g.fillStyle = COL.faint; g.fillText('EVERY EMPLOYEE', 40, 80);
      g.fillText('AGENT SANDBOXES · NO PROD CREDENTIALS', 262, 498 + 18);
      // nodes
      N.leads.forEach(function (l, i) { box(l, COL.line, glow['l' + i] > 0); g.fillStyle = COL.text; g.font = '600 13.5px Inter, sans-serif'; g.textAlign = 'left'; g.fillText(l.t, l.x + 14, l.y + 25); g.fillStyle = COL.dim; g.font = '500 10.5px "IBM Plex Mono", monospace'; g.fillText('every employee · own device', l.x + 14, l.y + 43); });
      [['ctx', N.ctx], ['ctl', N.ctl], ['rt', N.rt], ['fr', N.fr], ['lo', N.lo], ['rg', N.rg], ['gm', N.gm]].forEach(function (a) { box(a[1], a[1].c, glow[a[0]] > 0); label(a[1], a[1].c); });
      N.sb.forEach(function (s, i) { box(s, COL.line, glow['s' + i] > 0); g.fillStyle = COL.text; g.font = '600 12.5px Inter, sans-serif'; g.textAlign = 'center'; g.fillText(s.t, cx(s), cy(s) - 2); g.fillStyle = COL.faint; g.font = '500 9.5px "IBM Plex Mono", monospace'; g.fillText('container', cx(s), cy(s) + 13); });
      // packets
      packets.forEach(function (p) {
        var seg = p.st[p.k], L = plen(seg[0]); p.t += dt * 260 * p.spd / Math.max(40, L);
        if (p.t >= 1) {
          var last = seg[0][seg[0].length - 1]; hit(last); log(seg[1]); p.k++; p.t = 0;
          if (p.k === 6) { if (p.c2) stats.local++; else stats.frontier++; }
          if (p.k >= p.st.length) { p.done = true; if (p.merged) stats.merges++; return; }
          seg = p.st[p.k];
        }
        var q = pat(seg[0], p.t); g.save(); g.shadowColor = seg[1]; g.shadowBlur = 14; g.fillStyle = seg[1]; g.beginPath(); g.arc(q[0], q[1], 4.2, 0, 7); g.fill(); g.restore();
      });
      packets = packets.filter(function (p) { return !p.done; });
      Object.keys(glow).forEach(function (k) { glow[k] -= dt; });
      // audit log strip
      g.fillStyle = '#0B1222'; rr(g, 40, 596, 1120, 30, 8); g.fill(); g.strokeStyle = COL.line; g.lineWidth = 1; g.stroke();
      g.fillStyle = COL.dim; g.font = '600 10.5px "IBM Plex Mono", monospace'; g.textAlign = 'left'; g.fillText('AUDIT LOG · APPEND-ONLY', 54, 615);
      audit.forEach(function (a, i) { a.t += dt; var x = 1150 - (audit.length - 1 - i) * 10; if (x < 240) return; g.globalAlpha = Math.max(.25, 1 - a.t / 9); g.fillStyle = a.c; g.fillRect(x, 603, 5, 16); });
      g.globalAlpha = 1;
      // C2 egress counter on the cloud boundary
      g.fillStyle = COL.green; g.font = '600 11px "IBM Plex Mono", monospace'; g.textAlign = 'right'; g.fillText('C2 egress: 0', 1170, 218);
      if (hud.tasks) hud.tasks.textContent = stats.tasks;
      if (hud.local) hud.local.textContent = (stats.local + stats.frontier ? Math.round(100 * stats.local / (stats.local + stats.frontier)) : 0) + '%';
      if (hud.merges) hud.merges.textContent = stats.merges;
    }
    function hit(pt) {
      var all = [['ctx', N.ctx], ['ctl', N.ctl], ['rt', N.rt], ['fr', N.fr], ['lo', N.lo], ['rg', N.rg], ['gm', N.gm]];
      N.leads.forEach(function (l, i) { all.push(['l' + i, l]); }); N.sb.forEach(function (s, i) { all.push(['s' + i, s]); });
      all.forEach(function (a) { var n = a[1]; if (pt[0] >= n.x - 2 && pt[0] <= n.x + n.w + 2 && pt[1] >= n.y - 2 && pt[1] <= n.y + n.h + 2) glow[a[0]] = .35; });
    }
    var vis = true, last = performance.now(), raf = 0;
    new IntersectionObserver(function (es) { vis = es[0].isIntersecting; if (vis && !raf) { last = performance.now(); raf = requestAnimationFrame(loop); } }, { threshold: .05 }).observe(el);
    function loop(now) {
      raf = 0; if (!vis) return;
      var dt = Math.max(0, Math.min(.05, (now - last) / 1000)); last = now;
      spawnT -= dt; if (spawnT <= 0 && packets.length < 26) { job(); spawnT = .45 + Math.random() * .5; }
      frame(dt); if (!REDUCED) raf = requestAnimationFrame(loop);
    }
    if (REDUCED) { for (var k = 0; k < 14; k++) { job(); } packets.forEach(function (p, i) { p.k = i % 8; p.t = Math.random(); }); frame(0); }
    else raf = requestAnimationFrame(loop);
  }
  function boot() { [].forEach.call(document.querySelectorAll('[data-brain-flow]'), function (el) { try { mount(el); } catch (e) { console.error('[brain-flow]', e); } }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
