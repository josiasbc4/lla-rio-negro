// Service Worker — Herramienta Partidaria LLA Río Negro
// v9 — network-first para HTML/JSON/JS/CSS-propio, cache-first para libs/imágenes
const CACHE = 'lla-membrete-v9';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './tailwind.css',
  './app.js',
  './reunion.js',
  './admin-lit.js',
  './manifest.json',
  './LLA BLANCO.png',
  './LLA VIOLETA.png',
  'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdn.jsdelivr.net/gh/lit/dist@3/all/lit-all.min.js'
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
// - HTML / JSON / CSS / JS propios → NETWORK-FIRST (siempre buscar lo último, fallback a caché si offline)
// - PNG, fuentes, libs CDN → CACHE-FIRST (rápido)
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const isHTML = event.request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname === '/' || url.pathname.endsWith('/');
  const isJSON = url.pathname.endsWith('.json');
  // CSS/JS propios (mismo origen) network-first para reflejar deploys al instante; los CDN quedan cache-first
  const isOwnAsset = url.origin === self.location.origin && (url.pathname.endsWith('.css') || url.pathname.endsWith('.js'));
  const networkFirst = isHTML || isJSON || isOwnAsset;

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
