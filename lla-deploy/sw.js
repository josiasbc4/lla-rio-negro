// Service Worker — Herramienta Partidaria LLA Río Negro
// v3 — network-first para HTML/JSON, cache-first para assets
const CACHE = 'lla-membrete-v3';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './LLA BLANCO.png',
  './LLA VIOLETA.png',
  'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS).catch(() => {
        return Promise.all(ASSETS.map(a => c.add(a).catch(() => null)));
      }))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Estrategia mixta:
// - HTML / users.json → NETWORK-FIRST (siempre buscar lo último, fallback a caché si offline)
// - PNG, CSS, fuentes, libs CDN → CACHE-FIRST (rápido)
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const isHTML = event.request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname === '/' || url.pathname.endsWith('/');
  const isJSON = url.pathname.endsWith('.json');
  const networkFirst = isHTML || isJSON;

  if (networkFirst) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response && response.status === 200) {
            const cloned = response.clone();
            caches.open(CACHE).then(c => c.put(event.request, cloned)).catch(() => {});
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first para el resto
  event.respondWith(
    caches.match(event.request).then(cached => {
      const fetchPromise = fetch(event.request)
        .then(response => {
          if (response && response.status === 200 && response.type !== 'opaqueredirect') {
            const cloned = response.clone();
            caches.open(CACHE).then(c => c.put(event.request, cloned)).catch(() => {});
          }
          return response;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

// Permite a la app forzar skip waiting (para botón "actualizar")
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
