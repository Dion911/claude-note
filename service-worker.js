/**
 * service-worker.js – Offline Caching
 * Dione OS – Field Notes Edition
 *
 * Strategy:
 *  - On install: pre-cache all app shell assets
 *  - On fetch: cache-first for local assets, network-first for fonts
 */

const CACHE_NAME = 'dione-os-v1';

// Assets to pre-cache on install
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/db.js',
  '/manifest.json',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap',
];

// ─── INSTALL ──────────────────────────────────────────────
self.addEventListener('install', (event) => {
  console.log('[SW] Installing…');

  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Pre-caching app shell');
        // Cache non-font assets; Google Fonts may fail in some origins
        return cache.addAll(
          PRECACHE_ASSETS.filter((url) => !url.startsWith('https://'))
        );
      })
      .then(() => self.skipWaiting())
  );
});

// ─── ACTIVATE ─────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating…');

  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => {
              console.log('[SW] Deleting old cache:', key);
              return caches.delete(key);
            })
        )
      )
      .then(() => self.clients.claim())
  );
});

// ─── FETCH ────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip chrome-extension and other non-http schemes
  if (!url.protocol.startsWith('http')) return;

  // Network-first for Google Fonts (always fresh)
  if (url.hostname.includes('fonts.g')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Cache-first for everything else (app shell)
  event.respondWith(cacheFirst(request));
});

// ─── STRATEGIES ───────────────────────────────────────────

/** Cache-first: serve from cache, fallback to network, store response */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Return offline fallback if we have index.html cached
    const fallback = await caches.match('/index.html');
    return fallback || new Response('Offline – could not load resource', { status: 503 });
  }
}

/** Network-first: try network, fallback to cache */
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('Offline', { status: 503 });
  }
}
