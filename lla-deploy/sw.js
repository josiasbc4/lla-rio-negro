// Service Worker — Herramienta Partidaria LLA Membrete
// Cache-first strategy para funcionamiento offline
const CACHE = 'lla-membrete-v2';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './LLA BLANCO.png',
  'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS).catch(() => {
        // Fallback: cachear lo que se pueda individualmente
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

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
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
