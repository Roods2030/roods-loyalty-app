const CACHE_NAME = 'roods-pwa-v1';

// Install event - skip waiting to ensure service worker activates immediately
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

// Activate event - claim clients to ensure service worker controls the page immediately
self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

// Fetch event - Network first strategy, very basic caching just to satisfy PWA requirements
self.addEventListener('fetch', (event) => {
    event.respondWith(
        fetch(event.request).catch(async () => {
            const cache = await caches.open(CACHE_NAME);
            const cachedResponse = await cache.match(event.request);
            if (cachedResponse) {
                return cachedResponse;
            }
            // Optional: return a fallback page or offline image if the network fails and nothing is in cache
        })
    );
});
