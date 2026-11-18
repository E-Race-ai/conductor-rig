/* Sparkle layer: progress bar, grain, cursor glow, tilt + glare, photo lightbox, staggered reveals, count-ups. No dependencies. */
(function(){
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FINE = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const D = document, root = D.documentElement;
  const mk = (t, id, cls) => { const e = D.createElement(t); if (id) e.id = id; if (cls) e.className = cls; return e; };

  /* reading / scroll progress */
  const bar = mk('div', 'sp-bar'); D.body.appendChild(bar);
  let ticking = false;
  const prog = () => { ticking = false; const h = root.scrollHeight - innerHeight; bar.style.transform = 'scaleX(' + (h > 0 ? Math.min(1, scrollY / h) : 0) + ')'; };
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(prog); } }, { passive: true }); prog();

  /* film grain */
  D.body.appendChild(mk('div', 'sp-grain'));

  /* cursor glow (desktop only) */
  if (FINE && !RM) {
    const g = mk('div', 'sp-glow'); D.body.appendChild(g);
    let tx = innerWidth / 2, ty = innerHeight / 3, x = tx, y = ty, run = false;
    const loop = () => { x += (tx - x) * .12; y += (ty - y) * .12; g.style.transform = 'translate(' + x + 'px,' + y + 'px)';
      if (Math.abs(tx - x) + Math.abs(ty - y) > .5) requestAnimationFrame(loop); else run = false; };
    addEventListener('pointermove', e => { tx = e.clientX; ty = e.clientY; g.style.opacity = 1; if (!run) { run = true; requestAnimationFrame(loop); } }, { passive: true });
    D.addEventListener('pointerleave', () => g.style.opacity = 0);
  }

  /* tilt + glare + shimmering border */
  const tiltSel = '.pj, a.card, [data-sp-tilt]';
  D.querySelectorAll(tiltSel).forEach(el => {
    if (el.matches('a.card,[data-shine]')) el.classList.add('sp-shine');
    if (!FINE || RM) return;
    el.classList.add('sp-tilt'); const gl = mk('i', null, 'sp-glare'); el.appendChild(gl);
    const max = +(el.dataset.spTilt || (el.classList.contains('pj') ? 4 : 6));
    el.addEventListener('pointermove', e => { const r = el.getBoundingClientRect(); const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
      el.classList.add('sp-on'); el.style.transform = 'perspective(1100px) rotateX(' + ((.5 - py) * max) + 'deg) rotateY(' + ((px - .5) * max) + 'deg) translateZ(0)';
      el.style.setProperty('--gx', px * 100 + '%'); el.style.setProperty('--gy', py * 100 + '%'); });
    el.addEventListener('pointerleave', () => { el.classList.remove('sp-on'); el.style.transform = ''; });
  });

  /* lightbox over every real photo */
  const ok = img => !img.closest('a,nav,button,#sp-lb,[data-nolb],.mark,.no-lb') && img.naturalWidth >= 300 && img.getBoundingClientRect().width >= 60;
  const lb = mk('div', 'sp-lb'); lb.setAttribute('role', 'dialog'); lb.setAttribute('aria-modal', 'true'); lb.setAttribute('aria-label', 'Photo viewer');
  lb.innerHTML = '<button class="x" aria-label="Close">✕</button><button class="pv" aria-label="Previous photo">‹</button><button class="nx" aria-label="Next photo">›</button><img alt=""><div class="cap"></div><div class="cnt"></div>';
  D.body.appendChild(lb);
  const lbImg = lb.querySelector('img'), lbCap = lb.querySelector('.cap'), lbCnt = lb.querySelector('.cnt');
  let list = [], cur = 0, lastFocus = null;
  const capOf = img => { const f = img.closest('figure'); const fc = f && f.querySelector('figcaption'); return (fc && fc.textContent.trim()) || img.getAttribute('data-cap') || img.alt || ''; };
  const show = i => { cur = (i + list.length) % list.length; const im = list[cur]; lbImg.src = im.currentSrc || im.src; lbImg.alt = im.alt || '';
    lbCap.textContent = capOf(im); lbCnt.textContent = (cur + 1) + ' / ' + list.length; lbImg.style.animation = 'none'; void lbImg.offsetWidth; lbImg.style.animation = ''; };
  const open = img => { list = [...D.querySelectorAll('img')].filter(ok); cur = Math.max(0, list.indexOf(img)); lastFocus = D.activeElement;
    lb.classList.add('open'); show(cur); D.body.style.overflow = 'hidden'; lb.querySelector('.x').focus(); };
  const close = () => { lb.classList.remove('open'); D.body.style.overflow = ''; lbImg.removeAttribute('src'); if (lastFocus) lastFocus.focus(); };
  lb.querySelector('.x').onclick = close; lb.querySelector('.pv').onclick = () => show(cur - 1); lb.querySelector('.nx').onclick = () => show(cur + 1);
  lb.addEventListener('click', e => { if (e.target === lb) close(); });
  D.addEventListener('keydown', e => { if (!lb.classList.contains('open')) return;
    if (e.key === 'Escape') close(); else if (e.key === 'ArrowRight') show(cur + 1); else if (e.key === 'ArrowLeft') show(cur - 1);
    else if (e.key === 'Tab') { const b = [...lb.querySelectorAll('button')]; const i = b.indexOf(D.activeElement); e.preventDefault(); b[(i + (e.shiftKey ? -1 : 1) + b.length) % b.length].focus(); } });
  let sx = null; lb.addEventListener('touchstart', e => { sx = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener('touchend', e => { if (sx == null) return; const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 45) show(cur + (dx < 0 ? 1 : -1)); sx = null; });
  D.addEventListener('click', e => { const img = e.target.closest('img'); if (img && ok(img)) { e.preventDefault(); open(img); } });
  const decorate = () => D.querySelectorAll('img').forEach(img => {
    if (img.dataset.spd || !ok(img)) return; img.dataset.spd = 1; img.setAttribute('tabindex', '0'); img.setAttribute('role', 'button');
    img.setAttribute('aria-label', 'Enlarge photo: ' + (img.alt || 'photo'));
    img.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(img); } });
    const p = img.parentElement; if (p && (p.tagName === 'FIGURE' || p.classList.contains('ico') || p.classList.contains('sp-photo') || p.classList.contains('plate') || p.classList.contains('pic')) && /^(static|relative)$/.test(getComputedStyle(p).position)) {
      p.classList.add('sp-ph'); if (!p.querySelector('.sp-zoomhint')) { const h = mk('span', null, 'sp-zoomhint'); h.textContent = 'ENLARGE'; p.appendChild(h); } } });
  const redecorate = () => decorate();
  D.querySelectorAll('img').forEach(i => { if (!i.complete) i.addEventListener('load', redecorate, { once: true }); });
  addEventListener('load', redecorate); decorate(); setTimeout(decorate, 1500);

  /* staggered reveals: doc pages + any [data-rv] group */
  const rvTargets = [];
  if (root.classList.contains('sp-doc')) {
    D.querySelectorAll('#doc > *, .cards > .card').forEach(el => rvTargets.push(el));
    const w = D.querySelector('.wrap'); if (w) w.prepend(mk('div', null, 'sp-dochero'));
  }
  D.querySelectorAll('[data-rv] > *').forEach(el => rvTargets.push(el));
  if (rvTargets.length && !RM && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { en.target.classList.add('sp-in'); io.unobserve(en.target); } }), { rootMargin: '0px 0px -6% 0px' });
    const groups = new Map();
    rvTargets.forEach(el => { const p = el.parentElement; const n = groups.get(p) || 0; groups.set(p, n + 1);
      el.style.setProperty('--d', Math.min(n, 6) * 0.07 + 's'); el.classList.add('sp-rv'); io.observe(el); });
    // anything already on screen
    requestAnimationFrame(() => rvTargets.forEach(el => { const r = el.getBoundingClientRect(); if (r.top < innerHeight) el.classList.add('sp-in'); }));
  }

  /* count-ups */
  const counts = D.querySelectorAll('[data-count]');
  const fmt = (v, dec) => dec ? v.toFixed(dec) : Math.round(v).toLocaleString('en-US');
  if (counts.length) {
    const run = el => { const t = +el.dataset.count, dec = +(el.dataset.dec || 0), pre = el.dataset.pre || '', suf = el.dataset.suf || '';
      if (RM) { el.textContent = pre + fmt(t, dec) + suf; return; }
      const t0 = performance.now(), dur = 1400; const step = now => { const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 4);
        el.textContent = pre + fmt(t * e, dec) + suf; if (k < 1) requestAnimationFrame(step); }; requestAnimationFrame(step); };
    const io2 = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { run(en.target); io2.unobserve(en.target); } }), { threshold: .4 });
    counts.forEach(c => io2.observe(c));
  }

  /* image callouts: tap to toggle on touch */
  D.addEventListener('click', e => { const c = e.target.closest('.sp-co'); D.querySelectorAll('.sp-co.on').forEach(o => { if (o !== c) o.classList.remove('on'); }); if (c) c.classList.toggle('on'); });
})();
