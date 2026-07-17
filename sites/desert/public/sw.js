// Service Worker for offline directions and map caching
// Optimized for hot springs app - caching directions and map tiles

const CACHE_NAME = 'desertsoak-v1';
const urlsToCache = [
  '/',
  '/directory',
  '/map',
  '/about',
  '/manifest.json',
];

// Cache offline resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching app shell');
      return cache.addAll(urlsToCache);
    })
  );
});

// Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Network first strategy for dynamic content
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip same-origin POST requests etc.
  if (request.url.includes('/graphql')) return;

  // Cache strategy: Network First with Cache Fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Clone the response before caching
        const responseToCache = response.clone();

        // Cache successful responses
        if (response.status === 200) {
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }

        return response;
      })
      .catch(() => {
        // If network fails, try cache
        return caches.match(request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }

          // Return service worker offline page if available
          if (request.mode === 'navigate') {
            return caches.match('/').then((cachedResponse) => {
              return cachedResponse || new Response('Offline - App not available');
            });
          }
        });
      })
  );
});

// Cache map tiles for offline mapping
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Cache map tiles and static assets
  if (
    url.hostname.includes('tile') ||
    url.hostname.includes('openfreemap') ||
    url.hostname.includes('cartocdn') ||
    url.pathname.match(/\.(png|jpg|jpeg|svg|webp|css|js)$/)
  ) {
    event.respondWith(
      caches.open('map-tiles-v1').then((cache) => {
        return cache.match(request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse; // Return cached tile
          }

          return fetch(request).then((response) => {
            if (response.status === 200) {
              cache.put(request, response.clone()); // Cache new tiles
            }
            return response;
          });
        });
      })
    );
  }
});

// Cache directions URLs for offline navigation
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Cache Apple Maps and Google Maps links
  if (url.hostname.includes('maps.apple.com') || url.hostname.includes('maps.google.com')) {
    event.respondWith(
      caches.open('directions-v1').then((cache) => {
        return cache.match(request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }

          return fetch(request).then((response) => {
            if (response.status === 200) {
              cache.put(request, response.clone());
            }
            return response;
          });
        });
      })
    );
  }
});

// Message handler for cache management
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => caches.delete(cacheName))
      );
    });
  }

  if (event.data && event.data.type === 'CACHE_URLS') {
    event.ports[0].postMessage({ status: 'success' });
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(event.data.urls);
    });
  }
});
