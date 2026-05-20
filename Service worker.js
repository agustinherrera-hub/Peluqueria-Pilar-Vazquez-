const CACHE_NAME = 'vazquez-agenda-v1';
 
const ARCHIVOS_CACHE = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css'
];
 
// Instalación: guardar archivos en caché
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ARCHIVOS_CACHE).catch(err => {
        console.warn('Algunos archivos no se pudieron cachear:', err);
      });
    })
  );
  self.skipWaiting();
});
 
// Activación: borrar cachés antiguas
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});
 
// Fetch: red primero, caché como respaldo
self.addEventListener('fetch', e => {
  // Las llamadas a Google Apps Script siempre van a la red (datos en tiempo real)
  if (e.request.url.includes('script.google.com')) return;
 
  e.respondWith(
    fetch(e.request)
      .then(response => {
        // Guardar copia fresca en caché
        const copia = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, copia));
        return response;
      })
      .catch(() => {
        // Sin conexión: usar caché
        return caches.match(e.request);
      })
  );
});