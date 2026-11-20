// Installable offline app: registers the service worker and shows a small status pill
// ("Saving for offline", "Ready offline", "Offline · saved copy"). Built into public/app/app.js.
(function () {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  let pill, hideT;
  function show(text, ok, stay) {
    if (!pill) {
      pill = document.createElement('div');
      pill.setAttribute('role', 'status');
      pill.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:2147483000;font:500 12px/1.2 "IBM Plex Mono",ui-monospace,monospace;' +
        'padding:7px 11px;border-radius:6px;background:rgba(11,13,16,.92);color:#E4E7EB;border:1px solid #2A3038;' +
        'box-shadow:0 4px 16px rgba(0,0,0,.35);pointer-events:none;transition:opacity .4s;letter-spacing:.02em';
      document.body.appendChild(pill);
    }
    pill.innerHTML = '<span style="display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:8px;vertical-align:1px;background:' +
      (ok ? '#3FD08A' : '#00C8FF') + '"></span>' + text;
    pill.style.opacity = '1'; clearTimeout(hideT);
    if (!stay) hideT = setTimeout(() => { pill.style.opacity = '0'; }, 4000);
  }
  navigator.serviceWorker.addEventListener('message', (e) => {
    const m = e.data || {};
    if (m.t === 'sw-progress') show('Saving for offline · ' + m.done + ' / ' + m.total, false, true);
    if (m.t === 'sw-done') show(m.miss ? 'Saved for offline · ' + m.miss + ' items will load when online' : 'Ready offline · every page saved', !m.miss);
  });
  const net = () => { if (!navigator.onLine) show('Offline · showing saved copy', true, true); else if (pill) show('Back online', true); };
  addEventListener('online', net); addEventListener('offline', net);
  addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
    if (!navigator.onLine) net();
  });
})();
