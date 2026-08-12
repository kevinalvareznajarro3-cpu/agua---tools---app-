/* ============================================================
   Agua&Tools — Service Worker
   ------------------------------------------------------------
   Estrategia:
   - El documento HTML principal (index.html) y las peticiones de
     navegación SIEMPRE se piden primero a la red (network-first).
     Así, cuando el Admin sube una versión nueva a GitHub Pages,
     el celular del gestor la descarga en el siguiente "pull to
     refresh" o recarga, en lugar de quedarse con una copia vieja
     guardada en caché (que era la causa de que se vieran datos
     desaparecidos o duplicados).
   - Los recursos estáticos propios del sitio (manifest, iconos)
     usan caché con actualización en segundo plano, para que la
     app cargue rápido incluso con mala conexión.
   - Firebase (Firestore/Auth) y Cloudinary NUNCA se cachean aquí:
     esas peticiones van directas a la red, sin pasar por este SW.
   - Al activarse una versión nueva de este archivo, se borran
     automáticamente todas las cachés antiguas.
   ============================================================ */

const CACHE_NAME = 'aguatools-cache-v2';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png'
];

self.addEventListener('install', (event) => {
  // Activa este SW de inmediato, sin esperar a que se cierren las pestañas viejas.
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .catch(() => {})
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Permite que la propia app (desde el botón "Nueva versión disponible")
// le pida a un service worker en espera que se active inmediatamente.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Nunca interceptar peticiones a otros orígenes (Firebase, Cloudinary, fuentes, etc.)
  // Firestore necesita ir siempre directo a la red para que onSnapshot funcione en tiempo real.
  if (url.origin !== self.location.origin) return;

  // Documento principal / navegación: red primero, caché solo como respaldo sin conexión.
  const isNavigation = req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');
  if (isNavigation) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  // Resto de archivos propios del sitio: caché primero, con actualización en segundo plano.
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
