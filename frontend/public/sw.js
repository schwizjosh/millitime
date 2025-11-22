// Millitime Service Worker
const CACHE_NAME = 'millitime-v2';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

const urlsToCache = [
  '/',
  '/index.html',
  '/favicon.svg',
  '/manifest.json'
];

// Install event - cache resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - Network First strategy with stale cache fallback
self.addEventListener('fetch', (event) => {
  // Skip cross-origin requests
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  // For API requests and HTML, always try network first
  const url = new URL(event.request.url);
  const isAPIRequest = url.pathname.startsWith('/api');
  const isHTMLRequest = event.request.headers.get('accept')?.includes('text/html');

  if (isAPIRequest || isHTMLRequest || url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) {
    // Network-first strategy
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Check if valid response
          if (response && response.status === 200) {
            // Clone response for cache
            const responseToCache = response.clone();

            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }

          return response;
        })
        .catch(() => {
          // Network failed, try cache as fallback
          return caches.match(event.request).then((response) => {
            if (response) {
              console.log('Serving from cache (offline):', event.request.url);
              return response;
            }
            // Return a basic offline response
            return new Response('Offline - content not available', {
              status: 503,
              statusText: 'Service Unavailable',
              headers: new Headers({
                'Content-Type': 'text/plain'
              })
            });
          });
        })
    );
  } else {
    // For static assets (images, icons, etc.), use cache-first
    event.respondWith(
      caches.match(event.request)
        .then((response) => {
          return response || fetch(event.request).then((response) => {
            if (response && response.status === 200) {
              const responseToCache = response.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseToCache);
              });
            }
            return response;
          });
        })
    );
  }
});
