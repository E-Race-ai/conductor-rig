/* Engineering doc layer: motion pause (CSS + rAF), section numbers + index, figure numbers, thin progress bar, plain lightbox. Loaded in <head>, not deferred. */
(function(){
  var D = document, root = D.documentElement, W = window;
  var RM = W.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var KEY = 'eng.motion';
  var paused = RM; try { var v = localStorage.getItem(KEY); if (v === 'off') paused = true; if (v === 'on' && !RM) paused = false; } catch (e) {}
  if (paused) root.classList.add('eng-paused');

  /* rAF gate: while paused, animation callbacks wait; resumes cleanly */
  var raf = W.requestAnimationFrame.bind(W), held = [];
  W.requestAnimationFrame = function(cb){ if (!paused) return raf(cb); held.push(cb); return -held.length; };
  function setPaused(p){
    paused = p; root.classList.toggle('eng-paused', p);
    try { localStorage.setItem(KEY, p ? 'off' : 'on'); } catch (e) {}
    D.querySelectorAll('svg').forEach(function(s){ try { p ? s.pauseAnimations() : s.unpauseAnimations(); } catch (e) {} });
    if (!p) { var q = held; held = []; q.forEach(function(cb){ raf(cb); }); }
    var b = D.getElementById('eng-motion'); if (b) b.textContent = p ? '▶ Diagram motion: off' : '❚❚ Diagram motion: on';
  }

  function ready(){
    var proj = root.getAttribute('data-proj') || 'hub';
    var code = root.getAttribute('data-sub') ? root.getAttribute('data-sub') : proj === 'fu' ? 'PRJ-02 · Site Capture' : proj === 'con' ? 'PRJ-01 · The Brain' : proj === 'os' ? 'PRJ-03 · Hotel.OS' : proj === 'aug' ? 'PRJ-04 · Robotics' : 'Accelerate Robotics';

    /* thin progress bar */
    var bar = D.createElement('div'); bar.id = 'eng-bar'; D.body.appendChild(bar);
    var tk = false; function prog(){ tk = false; var h = root.scrollHeight - innerHeight; bar.style.transform = 'scaleX(' + (h > 0 ? Math.min(1, scrollY / h) : 0) + ')'; }
    addEventListener('scroll', function(){ if (!tk) { tk = true; raf(prog); } }, { passive: true }); prog();

    /* floating back-to-top */
    var top = D.createElement('button'); top.type = 'button'; top.className = 'ar-top'; top.setAttribute('aria-label', 'Back to top'); top.textContent = '↑ Back to top';
    top.onclick = function(){ W.scrollTo({ top: 0, behavior: 'smooth' }); }; D.body.appendChild(top);
    var tv = false; function topv(){ tv = false; top.classList.toggle('show', scrollY > 900); }
    addEventListener('scroll', function(){ if (!tv) { tv = true; raf(topv); } }, { passive: true }); topv();

    /* project dock + pager + keyboard: move between projects from anywhere */
    (function(){
      var sws = [].slice.call(D.querySelectorAll('.ar-switch a')).filter(function(a){ return a.getAttribute('href') !== './'; });
      if (!sws.length) return;
      var SHORT = { 'Site Capture': 'Capture', 'The Brain': 'Brain', 'Hotel.OS': 'Hotel.OS', 'Robotics': 'Robotics' };
      var P = sws.map(function(a){ var t = a.querySelector('.sw-t'), sm = t && t.querySelector('small'); var nm = t ? t.lastChild.textContent : a.textContent;
        return { href: a.getAttribute('href'), name: nm, short: SHORT[nm] || nm, role: sm ? sm.textContent : '', c: a.style.getPropertyValue('--c'), on: a.classList.contains('on') }; });
      var idx = -1; P.forEach(function(p, i){ if (p.on) idx = i; });
      var prev = idx >= 0 ? P[(idx - 1 + P.length) % P.length] : null, next = idx >= 0 ? P[(idx + 1) % P.length] : null;
      var dock = D.createElement('nav'); dock.className = 'ar-dock' + (idx < 0 ? ' hub' : ''); dock.setAttribute('aria-label', 'Projects');
      var h = '';
      if (prev) h += '<a class="dk-arr" href="' + prev.href + '" title="Previous project: ' + prev.name + ' ( [ )" aria-label="Previous project: ' + prev.name + '">‹</a>';
      h += '<a class="dk-home" href="./" title="Program home" aria-label="Program home">⌂</a>';
      P.forEach(function(p, i){ h += '<a class="dk-p' + (i === idx ? ' on' : '') + '" href="' + p.href + '" style="--c:' + p.c + '"' + (i === idx ? ' aria-current="page"' : '') + '><i></i><span class="dk-n">' + p.name + '</span><span class="dk-s">' + p.short + '</span></a>'; });
      if (next) h += '<a class="dk-arr" href="' + next.href + '" title="Next project: ' + next.name + ' ( ] )" aria-label="Next project: ' + next.name + '">›</a>';
      dock.innerHTML = h; D.body.appendChild(dock);
      var dv = false; function dockv(){ dv = false; dock.classList.toggle('show', scrollY > 420 || root.scrollHeight <= innerHeight + 40); }
      addEventListener('scroll', function(){ if (!dv) { dv = true; raf(dockv); } }, { passive: true }); dockv();
      D.addEventListener('keydown', function(e){
        if (e.metaKey || e.ctrlKey || e.altKey || /input|textarea|select/i.test((e.target.tagName || '')) || e.target.isContentEditable) return;
        if (e.key === '[' && prev) location.href = prev.href; else if (e.key === ']' && next) location.href = next.href;
      });
      if (idx >= 0) {
        var pg = D.createElement('nav'); pg.className = 'ar-pager'; pg.setAttribute('aria-label', 'Previous and next project');
        var card = function(p, dir){ return '<a class="pg-' + dir + '" href="' + p.href + '" style="--c:' + p.c + '"><small>' + (dir === 'prev' ? '‹ Previous project' : 'Next project ›') + '</small><b>' + p.name + '</b><span>' + p.role + '</span></a>'; };
        pg.innerHTML = card(prev, 'prev') + card(next, 'next');
        var ft1 = D.querySelector('body > footer, footer.foot, .wrap > footer'); if (ft1 && ft1.parentNode) ft1.parentNode.insertBefore(pg, ft1); else D.body.appendChild(pg);
      }
    })();

    /* end of page: big "where next" buttons built from the header nav */
    var cur = D.querySelector('.ar-tabs a[aria-current]'), tabs = [].slice.call(D.querySelectorAll('.ar-tabs a')), sw = [].slice.call(D.querySelectorAll('.ar-switch a'));
    var nx = [], wsName = { con: 'The Brain', fu: 'Site Capture', os: 'Hotel.OS', aug: 'Robotics' }[proj];
    var flows = [].slice.call(D.querySelectorAll('.ar-flow a.fl-chip'));
    if (flows.length) {
      var fb = D.createElement('nav'); fb.className = 'ar-next'; fb.setAttribute('aria-label', 'Connected projects');
      fb.innerHTML = '<h2>How this project connects</h2><div class="g flow"></div>';
      flows.forEach(function(c){ var a = D.createElement('a'); a.href = c.getAttribute('href'); a.style.setProperty('--c', c.style.getPropertyValue('--c'));
        a.innerHTML = '<small></small><b></b><p></p>'; var sm = c.querySelector('small').textContent.split(' · ');
        a.firstChild.textContent = sm[0]; a.children[1].textContent = sm[1]; a.lastChild.textContent = c.querySelector('span').textContent; fb.lastChild.appendChild(a); });
      var ft0 = D.querySelector('body > footer, footer.foot, .wrap > footer'); if (ft0 && ft0.parentNode) ft0.parentNode.insertBefore(fb, ft0); else D.body.appendChild(fb);
    }
    tabs.forEach(function(a){ if (a !== cur) nx.push([wsName, a.textContent, a.getAttribute('href'), getComputedStyle(D.querySelector('.ar-bar')).getPropertyValue('--c')]); });
    sw.forEach(function(a){ if (!a.classList.contains('on')) { var t = a.querySelector('.sw-t'), sm = t && t.querySelector('small'), nm = t ? t.lastChild.textContent : a.textContent; nx.push([sm ? sm.textContent : 'Accelerate Robotics', nm === 'Program' ? 'Program home' : nm, a.getAttribute('href'), a.style.getPropertyValue('--c')]); } });
    if (nx.length && proj !== 'hub' && D.querySelector('.ar-bar')) {
      var box = D.createElement('nav'); box.className = 'ar-next'; box.id = 'next'; box.setAttribute('aria-label', 'Related documents');
      box.innerHTML = '<h2>' + (flows.length ? 'More in this program' : 'Related documents') + '</h2><div class="g"></div>';
      nx.forEach(function(n){ var a = D.createElement('a'); a.href = n[2]; a.style.setProperty('--c', n[3] || '#4D8BFF'); a.innerHTML = '<small></small><b></b>'; a.firstChild.textContent = n[0]; a.lastChild.textContent = n[1]; box.lastChild.appendChild(a); });
      var ft = D.querySelector('body > footer, footer.foot, .wrap > footer'); if (ft && ft.parentNode) ft.parentNode.insertBefore(box, ft); else D.body.appendChild(box);
    }

    /* section numbers + left index (showcase pages) */
    var secs = [].slice.call(D.querySelectorAll('section.band[id]')).filter(function(s){ return s.querySelector('h2') && s.offsetParent !== null; });
    if (secs.length >= 4) {
      root.classList.add('has-toc');
      var toc = D.createElement('nav'); toc.className = 'eng-toc'; toc.setAttribute('aria-label', 'Section index');
      toc.innerHTML = '<div class="h">' + code + '</div><div class="r">' + (root.getAttribute('data-rev') || 'Rev D · 2026-11-18 · Program team') + '</div>' + '<div class="k">On this page</div>';
      var ni = 0;
      secs.forEach(function(s){
        var h = s.querySelector('h2'), n = s.getAttribute('data-num') ? s.getAttribute('data-num') : s.getAttribute('data-appx') ? 'App. ' + s.getAttribute('data-appx') : (++ni) + '.0';
        var t = h.textContent.replace(/\s+/g, ' ').trim();
        var sp = D.createElement('span'); sp.className = 'eng-sec'; sp.textContent = n; h.insertBefore(sp, h.firstChild);
        var a = D.createElement('a'); a.href = '#' + s.id; a.innerHTML = '<i>' + n + '</i><span></span>'; a.lastChild.textContent = t.length > 46 ? t.slice(0, 44) + '…' : t;
        toc.appendChild(a);
      });
      D.body.appendChild(toc);
      var links = [].slice.call(toc.querySelectorAll('a'));
      if ('IntersectionObserver' in W) {
        var pills = [].slice.call(D.querySelectorAll('nav.top .navlinks a')), strip = D.querySelector('nav.top .navlinks'), wrap = D.querySelector('nav.top .wrap');
        var now = null;
        if (wrap) {
          now = D.createElement('span'); now.className = 'ar-now'; wrap.insertBefore(now, strip || null);
        }
        var io = new IntersectionObserver(function(es){ es.forEach(function(e){ if (e.isIntersecting) { var id = e.target.id, cur = null;
          links.forEach(function(l){ var on = l.getAttribute('href') === '#' + id; l.classList.toggle('on', on); if (on) cur = l; });
          if (cur && now) { now.innerHTML = '<i></i><span></span>'; now.firstChild.textContent = cur.firstChild.textContent; now.lastChild.textContent = cur.lastChild.textContent; }
          var hit = null; pills.forEach(function(p){ var on = p.getAttribute('href') === '#' + id; p.classList.toggle('on', on); if (on) hit = p; });
          if (hit && strip && strip.offsetParent) { var x = hit.offsetLeft - strip.offsetLeft - 24; strip.scrollTo({ left: Math.max(0, x), behavior: 'smooth' }); }
        } }); }, { rootMargin: '-35% 0px -60% 0px' });
        secs.forEach(function(s){ io.observe(s); });
      }
    }

    /* figure numbers */
    var fn = 0;
    D.querySelectorAll('figure > figcaption').forEach(function(fc){
      if (fc.closest('.pj')) return; // hub figures are pre-numbered
      if (/^\s*Fig\./.test(fc.textContent)) return;
      fn++; var s = D.createElement('span'); s.className = 'fno'; s.textContent = 'Fig. ' + fn + ' — '; fc.insertBefore(s, fc.firstChild);
    });

    /* motion control: only where something moves */
    var moving = D.querySelector('canvas, svg animate, svg animateMotion, svg animateTransform, [class*="flow"], .fan, #flowsvg, #asm, #tty, #orch');
    if (moving && proj !== 'hub') {
      var b = D.createElement('button'); b.id = 'eng-motion'; b.className = 'eng-motion'; b.type = 'button';
      b.onclick = function(){ setPaused(!paused); }; D.body.appendChild(b); setPaused(paused);
    }

    /* plain lightbox */
    var ok = function(img){ return !img.closest('a,nav,button,#eng-lb,[data-nolb],.mark') && img.naturalWidth >= 300 && img.getBoundingClientRect().width >= 60; };
    var lb = D.createElement('div'); lb.id = 'eng-lb'; lb.setAttribute('role', 'dialog'); lb.setAttribute('aria-modal', 'true'); lb.setAttribute('aria-label', 'Image viewer');
    lb.innerHTML = '<span class="cnt"></span><button class="x" aria-label="Close">Close ✕</button><button class="pv" aria-label="Previous">‹</button><button class="nx" aria-label="Next">›</button><img alt=""><div class="cap"></div>';
    D.body.appendChild(lb);
    var li = lb.querySelector('img'), lc = lb.querySelector('.cap'), ln = lb.querySelector('.cnt'), list = [], cur = 0, last = null;
    var cap = function(im){ var f = im.closest('figure'), c = f && f.querySelector('figcaption'); return (c && c.textContent.trim()) || im.alt || ''; };
    var show = function(i){ cur = (i + list.length) % list.length; var im = list[cur]; li.src = im.getAttribute('data-full') || im.currentSrc || im.src; li.alt = im.alt || ''; lc.textContent = cap(im); ln.textContent = (cur + 1) + ' / ' + list.length; };
    var open = function(im){ list = [].slice.call(D.querySelectorAll('img')).filter(ok); cur = Math.max(0, list.indexOf(im)); last = D.activeElement; lb.classList.add('open'); show(cur); D.body.style.overflow = 'hidden'; lb.querySelector('.x').focus(); };
    var close = function(){ lb.classList.remove('open'); D.body.style.overflow = ''; li.removeAttribute('src'); if (last) last.focus(); };
    lb.querySelector('.x').onclick = close; lb.querySelector('.pv').onclick = function(){ show(cur - 1); }; lb.querySelector('.nx').onclick = function(){ show(cur + 1); };
    lb.addEventListener('click', function(e){ if (e.target === lb) close(); });
    D.addEventListener('keydown', function(e){ if (!lb.classList.contains('open')) return; if (e.key === 'Escape') close(); else if (e.key === 'ArrowRight') show(cur + 1); else if (e.key === 'ArrowLeft') show(cur - 1); });
    var sx = null; lb.addEventListener('touchstart', function(e){ sx = e.touches[0].clientX; }, { passive: true });
    lb.addEventListener('touchend', function(e){ if (sx == null) return; var dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 45) show(cur + (dx < 0 ? 1 : -1)); sx = null; });
    D.addEventListener('click', function(e){ var im = e.target.closest && e.target.closest('img'); if (im && ok(im)) { e.preventDefault(); open(im); } });
    var deco = function(){ D.querySelectorAll('img').forEach(function(im){ if (!im.dataset.eng && ok(im)) { im.dataset.eng = 1; im.classList.add('eng-zoom'); im.tabIndex = 0; im.addEventListener('keydown', function(e){ if (e.key === 'Enter') open(im); }); } }); };
    addEventListener('load', deco); deco();

    /* photo callouts: tap toggles on touch */
    D.addEventListener('click', function(e){ var c = e.target.closest && e.target.closest('.sp-co'); D.querySelectorAll('.sp-co.on').forEach(function(o){ if (o !== c) o.classList.remove('on'); }); if (c) c.classList.toggle('on'); });
  }
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', ready); else ready();
})();

/* Tool layer: site search (⌘K, /), shortcuts (?), sortable + filterable tables, copyable section links,
   contents drawer on small screens, research-page index, deep links into collapsed sections, print. */
(function(){
  var D = document, root = D.documentElement, W = window;
  function el(tag, cls, html){ var e = D.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var toastT; function toast(msg){ var t = D.getElementById('ar-toast'); if (!t) { t = el('div'); t.id = 'ar-toast'; t.setAttribute('role', 'status'); D.body.appendChild(t); } t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function(){ t.classList.remove('show'); }, 1600); }
  function typing(e){ var t = e.target; return /input|textarea|select/i.test(t.tagName || '') || t.isContentEditable; }

  function openTarget(){
    var id = decodeURIComponent(location.hash.slice(1)); if (!id) return;
    var t = D.getElementById(id);
    if (!t && D.getElementById('doc')) { var pre = id.slice(0, 18); t = [].slice.call(D.querySelectorAll('#doc h2[id],#doc h3[id]')).filter(function(h){ return h.id.indexOf(pre) === 0; })[0]; }
    if (!t) return;
    for (var p = t; p; p = p.parentElement) if (p.tagName === 'DETAILS') p.open = true;
    setTimeout(function(){ t.scrollIntoView({ block: 'start' }); }, 30);
  }

  function ready(){
    var proj = root.getAttribute('data-proj') || 'hub';

    /* ---------- research pages: index from rendered headings ---------- */
    var doc = D.getElementById('doc');
    if (doc && !D.querySelector('.eng-toc')) {
      var hs = [].slice.call(doc.querySelectorAll('h2[id]'));
      if (hs.length >= 3) {
        root.classList.add('has-toc');
        var tc = el('nav', 'eng-toc'); tc.setAttribute('aria-label', 'Section index');
        var h1 = doc.querySelector('h1');
        tc.innerHTML = '<div class="h">Research</div><div class="r"></div><div class="k">On this page</div>';
        tc.querySelector('.r').textContent = h1 ? h1.textContent.slice(0, 80) : '';
        hs.forEach(function(h, i){ var a = el('a'); a.href = '#' + h.id; a.innerHTML = '<i>' + (i + 1) + '</i><span></span>'; var tx = h.textContent.trim(); a.lastChild.textContent = tx.length > 46 ? tx.slice(0, 44) + '…' : tx; tc.appendChild(a); });
        D.body.appendChild(tc);
        if ('IntersectionObserver' in W) { var ls = [].slice.call(tc.querySelectorAll('a'));
          var io = new IntersectionObserver(function(es){ es.forEach(function(e){ if (e.isIntersecting) ls.forEach(function(l){ l.classList.toggle('on', l.getAttribute('href') === '#' + e.target.id); }); }); }, { rootMargin: '-20% 0px -70% 0px' });
          hs.forEach(function(h){ io.observe(h); }); }
      }
    }

    /* ---------- copyable section links ---------- */
    D.querySelectorAll('section.band[id] > .wrap > h2, section.band[id] h2:first-of-type, h3[id], #doc h2[id], #doc h3[id]').forEach(function(h){
      if (h.querySelector('.ar-anc') || h.closest('nav,.ui-band,.eng-toc')) return;
      var id = h.id || (h.closest('section[id]') || {}).id; if (!id) return;
      var a = el('a', 'ar-anc', '#'); a.href = '#' + id; a.setAttribute('aria-label', 'Copy link to this section'); a.title = 'Copy link to this section';
      a.addEventListener('click', function(e){ e.preventDefault(); var u = location.href.split('#')[0] + '#' + id; try { history.replaceState(null, '', '#' + id); } catch (x) {}
        (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(function(){ toast('Link copied'); }, function(){ toast('Link: ' + u); }); });
      h.appendChild(a);
    });

    /* ---------- tables: sort, filter, copy ---------- */
    D.querySelectorAll('table').forEach(function(tb){
      if (tb.closest('.ui-band,.ui-devs,nav,svg,.eng-toc,[data-nosort],.sg') || tb.dataset.tool) return;
      var head = tb.tHead && tb.tHead.rows[0], body = tb.tBodies[0]; if (!head || !body) return;
      var rows = [].slice.call(body.rows); if (rows.length < 4) return;
      if (body.querySelector('[rowspan],[colspan]') || head.querySelector('[colspan],[rowspan]')) return;
      tb.dataset.tool = 1;
      var pinned = function(r){ return /^\s*total/i.test(r.cells[0] ? r.cells[0].textContent : ''); };
      var num = function(s){ var m = s.replace(/,/g, '').match(/(?:^|[^\w.-])(-?\d+(?:\.\d+)?)/); return m ? parseFloat(m[1]) : null; };
      [].slice.call(head.cells).forEach(function(th, ci){
        if (!th.textContent.trim()) return;
        th.classList.add('ar-sortable'); th.tabIndex = 0; th.setAttribute('aria-sort', 'none'); th.title = 'Sort by ' + th.textContent.trim();
        var go = function(){
          var dir = th.getAttribute('aria-sort') === 'ascending' ? -1 : 1;
          [].slice.call(head.cells).forEach(function(c){ c.setAttribute('aria-sort', 'none'); });
          th.setAttribute('aria-sort', dir > 0 ? 'ascending' : 'descending');
          var rs = [].slice.call(body.rows), keep = rs.filter(pinned);
          rs.filter(function(r){ return !pinned(r); }).sort(function(a, b){
            var x = (a.cells[ci] || {}).textContent || '', y = (b.cells[ci] || {}).textContent || '';
            var nx = num(x), ny = num(y);
            if (nx != null && ny != null && nx !== ny) return (nx - ny) * dir;
            return x.trim().localeCompare(y.trim(), undefined, { numeric: true, sensitivity: 'base' }) * dir;
          }).concat(keep).forEach(function(r){ body.appendChild(r); });
        };
        th.addEventListener('click', go); th.addEventListener('keydown', function(e){ if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
      });
      if (rows.length >= 7) {
        var host = tb.closest('.ms-tw,.tw,.tbl') || tb;
        var bar = el('div', 'ar-tbar');
        bar.innerHTML = '<input type="search" aria-label="Filter table rows"><span class="n"></span><button type="button">Copy as CSV</button>';
        var inp = bar.firstChild, cnt = bar.children[1];
        inp.placeholder = 'Filter ' + rows.length + ' rows…';
        var upd = function(){ var q = inp.value.toLowerCase().trim().split(/\s+/).filter(Boolean), n = 0;
          [].slice.call(body.rows).forEach(function(r){ var tx = r.textContent.toLowerCase(), ok = q.every(function(w){ return tx.indexOf(w) >= 0; }); r.hidden = !ok; if (ok) n++; });
          cnt.textContent = q.length ? n + ' of ' + body.rows.length : ''; };
        inp.addEventListener('input', upd);
        bar.lastChild.addEventListener('click', function(){
          var cell = function(c){ var s = c.textContent.replace(/\s+/g, ' ').trim(); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
          var out = [[].slice.call(head.cells).map(cell).join(',')].concat([].slice.call(body.rows).filter(function(r){ return !r.hidden; }).map(function(r){ return [].slice.call(r.cells).map(cell).join(','); })).join('\n');
          (navigator.clipboard ? navigator.clipboard.writeText(out) : Promise.reject()).then(function(){ toast('Table copied as CSV'); }, function(){ toast('Copy not available'); });
        });
        host.parentNode.insertBefore(bar, host);
      }
    });

    /* ---------- search ---------- */
    var data = null, loading = null;
    var ov = el('div', 'ar-sx'); ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Search the program');
    ov.innerHTML = '<div class="sx-box"><div class="sx-in"><span aria-hidden="true">⌕</span><input type="search" placeholder="Search projects, sections, requirements, robots, devices…" aria-label="Search" autocomplete="off" spellcheck="false"><kbd>Esc</kbd></div><div class="sx-res" role="listbox"></div><div class="sx-ft"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>↵</kbd> open</span><span><kbd>/</kbd> or <kbd>⌘K</kbd> search</span><span><kbd>?</kbd> shortcuts</span></div></div>';
    D.body.appendChild(ov);
    var qi = ov.querySelector('input'), res = ov.querySelector('.sx-res'), sel = 0, hits = [], lastF = null;
    var KIND = { page: 'Page', section: 'Section', req: 'Requirement', research: 'Research' }, KW = { page: 9, section: 6, req: 5, research: 3 };
    function load(){ if (data || loading) return loading; loading = fetch('search.json').then(function(r){ return r.json(); }).then(function(j){ data = j; render(); }).catch(function(){ res.innerHTML = '<p class="sx-empty">Search index unavailable.</p>'; }); return loading; }
    function hl(s, toks){ var h = esc(s); toks.forEach(function(t){ if (t.length < 2) return; h = h.replace(new RegExp('(' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'), '<mark>$1</mark>'); }); return h; }
    function render(){
      if (!data) { res.innerHTML = '<p class="sx-empty">Loading index…</p>'; return; }
      var q = qi.value.toLowerCase().trim(), toks = q.split(/\s+/).filter(Boolean), it = data.items;
      if (!toks.length) hits = it.filter(function(x){ return x.k === 'page' && !/^(doc-|rb-|fu-)/.test(x.u); }).slice(0, 14);
      else {
        hits = [];
        it.forEach(function(x){ var tt = x.t.toLowerCase(), hay = tt + ' ' + (x.pg || '').toLowerCase() + ' ' + (x.x || '').toLowerCase();
          if (!toks.every(function(w){ return hay.indexOf(w) >= 0; })) return;
          var s = KW[x.k] || 1; if (tt.indexOf(q) >= 0) s += 40; if (tt.indexOf(q) === 0) s += 15;
          toks.forEach(function(w){ if (tt.indexOf(w) >= 0) s += 8; }); if (x.p === proj) s += 2;
          hits.push([s, x]); });
        hits = hits.sort(function(a, b){ return b[0] - a[0]; }).slice(0, 40).map(function(h){ return h[1]; });
      }
      sel = 0;
      if (!hits.length) { res.innerHTML = '<p class="sx-empty">No matches for “' + esc(q) + '”.</p>'; return; }
      res.innerHTML = (toks.length ? '' : '<div class="sx-h">Pages</div>') + hits.map(function(x, i){ var p = data.proj[x.p] || ['', '#888'];
        return '<a class="sx-r" role="option" href="' + esc(x.u) + '" data-i="' + i + '" style="--c:' + p[1] + '"><i>' + esc(p[0]) + '</i><b>' + hl(x.t, toks) + '</b><small>' + KIND[x.k] + (x.pg && x.k !== 'page' ? ' · ' + esc(x.pg) : '') + '</small>' + (x.x ? '<span>' + hl(x.x.slice(0, 160), toks) + '</span>' : '') + '</a>'; }).join('');
      mark();
    }
    function mark(){ [].slice.call(res.querySelectorAll('.sx-r')).forEach(function(a, i){ a.classList.toggle('on', i === sel); a.setAttribute('aria-selected', i === sel); if (i === sel) a.scrollIntoView({ block: 'nearest' }); }); }
    function openS(){ lastF = D.activeElement; ov.classList.add('open'); D.body.style.overflow = 'hidden'; load(); render(); setTimeout(function(){ qi.focus(); qi.select(); }, 10); }
    function closeS(){ ov.classList.remove('open'); D.body.style.overflow = ''; if (lastF && lastF.focus) lastF.focus(); }
    qi.addEventListener('input', render);
    qi.addEventListener('keydown', function(e){
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(hits.length - 1, sel + 1); mark(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); mark(); }
      else if (e.key === 'Enter') { var a = res.querySelectorAll('.sx-r')[sel]; if (a) { e.preventDefault(); a.click(); } }
    });
    res.addEventListener('click', function(e){ var a = e.target.closest('.sx-r'); if (!a) return; var u = a.getAttribute('href'), pg = u.split('#')[0], here = location.pathname.split('/').pop() || 'index.html';
      closeS(); if (pg === here && u.indexOf('#') > 0) { e.preventDefault(); location.hash = u.split('#')[1]; openTarget(); } });
    ov.addEventListener('click', function(e){ if (e.target === ov) closeS(); });

    var sb = el('button', 'ar-sbtn', '<span aria-hidden="true">⌕</span> Search <kbd>/</kbd>'); sb.type = 'button'; sb.setAttribute('aria-label', 'Search the program (/ or Command K)'); sb.onclick = openS;
    var row = D.querySelector('.ar-bar .ar-row'), exp = row && row.querySelector('.ar-exp');
    if (row) row.insertBefore(sb, exp || null); else { sb.classList.add('float'); D.body.appendChild(sb); }

    /* ---------- shortcuts help ---------- */
    var hp = el('div', 'ar-sx ar-help'); hp.setAttribute('role', 'dialog'); hp.setAttribute('aria-modal', 'true'); hp.setAttribute('aria-label', 'Keyboard shortcuts');
    hp.innerHTML = '<div class="sx-box"><div class="hp-h"><b>Keyboard shortcuts</b><button type="button" aria-label="Close">Close ✕</button></div><dl>'
      + '<dt><kbd>/</kbd> <kbd>⌘K</kbd></dt><dd>Search everything: projects, sections, requirements, research</dd>'
      + '<dt><kbd>[</kbd> <kbd>]</kbd></dt><dd>Previous / next project</dd>'
      + '<dt><kbd>g</kbd> then <kbd>h</kbd></dt><dd>Program home</dd>'
      + '<dt><kbd>c</kbd></dt><dd>Contents for this page</dd>'
      + '<dt><kbd>t</kbd></dt><dd>Back to top</dd>'
      + '<dt><kbd>?</kbd></dt><dd>This help</dd>'
      + '<dt><kbd>Esc</kbd></dt><dd>Close any panel</dd></dl><p class="hp-n">Tables: click a column heading to sort; long tables have a filter and Copy as CSV. Section headings: click # to copy a link.</p></div>';
    D.body.appendChild(hp);
    var closeH = function(){ hp.classList.remove('open'); };
    hp.querySelector('button').onclick = closeH; hp.addEventListener('click', function(e){ if (e.target === hp) closeH(); });

    /* ---------- contents drawer (below the wide-screen breakpoint) ---------- */
    var toc = D.querySelector('.eng-toc'), toggleC = null;
    if (toc) {
      var bk = el('div', 'ar-toc-bk'); D.body.appendChild(bk);
      var hd = el('button', 'ar-toc-x', 'Close ✕'); hd.type = 'button'; toc.insertBefore(hd, toc.firstChild);
      toggleC = function(on){ root.classList.toggle('toc-open', on); };
      hd.onclick = function(){ toggleC(false); }; bk.onclick = function(){ toggleC(false); };
      toc.addEventListener('click', function(e){ if (e.target.closest('a')) toggleC(false); });
      var cb = el('button', 'ar-cbtn', '<span aria-hidden="true">☰</span> Contents'); cb.type = 'button'; cb.onclick = function(){ toggleC(!root.classList.contains('toc-open')); };
      if (row) row.insertBefore(cb, sb);
    }
    var dock = D.querySelector('.ar-dock');
    if (dock) {
      var ds = el('button', 'dk-tool', '⌕'); ds.type = 'button'; ds.title = 'Search ( / )'; ds.setAttribute('aria-label', 'Search'); ds.onclick = openS; dock.appendChild(ds);
      if (toc) { var dc = el('button', 'dk-tool dk-toc', '☰'); dc.type = 'button'; dc.title = 'Contents ( c )'; dc.setAttribute('aria-label', 'Contents'); dc.onclick = function(){ toggleC(!root.classList.contains('toc-open')); }; dock.appendChild(dc); }
    }

    /* ---------- keys ---------- */
    var gPend = 0;
    D.addEventListener('keydown', function(e){
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); ov.classList.contains('open') ? closeS() : openS(); return; }
      if (e.key === 'Escape') { if (ov.classList.contains('open')) closeS(); closeH(); if (toggleC) toggleC(false); return; }
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e) || ov.classList.contains('open')) return;
      if (e.key === '/') { e.preventDefault(); openS(); }
      else if (e.key === '?') { hp.classList.toggle('open'); }
      else if (e.key === 'c' && toggleC) toggleC(!root.classList.contains('toc-open'));
      else if (e.key === 't') W.scrollTo({ top: 0, behavior: 'smooth' });
      else if (e.key === 'g') { gPend = Date.now(); }
      else if (e.key === 'h' && Date.now() - gPend < 900) location.href = './';
    });

    /* ---------- deep links + print ---------- */
    openTarget(); addEventListener('hashchange', openTarget);
    addEventListener('beforeprint', function(){ D.querySelectorAll('details').forEach(function(d){ if (!d.open) { d.open = true; d.dataset.pr = 1; } }); });
    addEventListener('afterprint', function(){ D.querySelectorAll('details[data-pr]').forEach(function(d){ d.open = false; delete d.dataset.pr; }); });
  }
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', ready); else ready();
})();
