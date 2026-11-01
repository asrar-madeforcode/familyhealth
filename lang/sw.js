/* Family Health Tracker offline cache. © 2026 Asrar Ahmed Junedi. */
const CACHE = 'familyhealth-v2.1.1';
const FILES = ['./', './index.html', './app.css', './app.js', './ocr.js', './lab.js', './monitor.js', './i18n.js', './watch.js', './care.js', './scan.js', './backup.js', './lib/nacl-fast.min.js', './devices.js', './condinfo.js', './conditions.js', './women.js', './manifest.webmanifest', './creator.jpg', './lib/jspdf.umd.min.js', './lib/jspdf.plugin.autotable.min.js', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
// Network first for the app's own pages and scripts, so a new upload shows straight away;
// the saved copy is used only when the phone is offline. Large libraries come from the saved copy.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  const big = url.pathname.includes('/lib/');
  if (big) {
    e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request).then(res => { const c = res.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return res; })));
    return;
  }
  e.respondWith(fetch(e.request, { cache: 'no-store' }).then(res => {
    if (res.ok) { const c = res.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); }
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('./index.html'))));
});
