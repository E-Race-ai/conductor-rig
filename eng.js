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
    var code = proj === 'fu' ? 'PRJ-02 · Site Capture' : proj === 'con' ? 'PRJ-01 · The Brain' : proj === 'os' ? 'PRJ-03 · Hotel.OS' : 'Accelerate Robotics';

    /* thin progress bar */
    var bar = D.createElement('div'); bar.id = 'eng-bar'; D.body.appendChild(bar);
    var tk = false; function prog(){ tk = false; var h = root.scrollHeight - innerHeight; bar.style.transform = 'scaleX(' + (h > 0 ? Math.min(1, scrollY / h) : 0) + ')'; }
    addEventListener('scroll', function(){ if (!tk) { tk = true; raf(prog); } }, { passive: true }); prog();

    /* floating back-to-top */
    var top = D.createElement('button'); top.type = 'button'; top.className = 'ar-top'; top.setAttribute('aria-label', 'Back to top'); top.textContent = '↑ Back to top';
    top.onclick = function(){ W.scrollTo({ top: 0, behavior: 'smooth' }); }; D.body.appendChild(top);
    var tv = false; function topv(){ tv = false; top.classList.toggle('show', scrollY > 900); }
    addEventListener('scroll', function(){ if (!tv) { tv = true; raf(topv); } }, { passive: true }); topv();

    /* end of page: big "where next" buttons built from the header nav */
    var cur = D.querySelector('.ar-tabs a[aria-current]'), tabs = [].slice.call(D.querySelectorAll('.ar-tabs a')), sw = [].slice.call(D.querySelectorAll('.ar-switch a'));
    var nx = [], wsName = { con: 'The Brain', fu: 'Site Capture', os: 'Hotel.OS' }[proj];
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
