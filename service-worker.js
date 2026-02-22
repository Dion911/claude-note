/**
 * service-worker.js – Offline Caching
 * Dione OS – Field Notes Edition
 *
 * KEY FIX: Uses self.location to derive BASE_PATH at runtime.
 * This makes the SW work correctly whether served from:
 *   - https://username.github.io/dione-os/   (GitHub Pages subdir)
 *   - https://myapp.netlify.app/              (root domain)
 *   - http://localhost:8080/                  (local dev)
 *
 * Strategy:
 *  - On install: pre-cache all app shell assets using relative-to-SW paths
 *  - On fetch: cache-first for same-origin assets, network-first for fonts
 */

const CACHE_NAME = 'dione-os-v2';

// Derive the directory where this service-worker.js lives.
// e.g. "https://user.github.io/dione-os/" → BASE_PATH = "/dione-os/"
//      "https://myapp.netlify.app/"        → BASE_PATH = "/"
const SW_URL = new URL(self.location.href);
const BASE_PATH = SW_URL.pathname.replace(/service-worker\.js$/, '');

// Build absolute URLs for pre-caching relative to the SW's own location
const PRECACHE_ASSETS = [
  BASE_PATH,                        // the directory itself → serves index.html
  `${BASE_PATH}index.html`,
  `${BASE_PATH}styles.css`,
  `${BASE_PATH}app.js`,
  `${BASE_PATH}db.js`,
  `${BASE_PATH}manifest.json`,
  `${BASE_PATH}icons/icon-192.png`,
  `${BASE_PATH}icons/icon-512.png`,
];

// ─── INSTALL ──────────────────────────────────────────────
self.addEventListener('install', (event) => {
  console.log('[SW] Installing… base path:', BASE_PATH);

  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Pre-caching app shell');
        // addAll with individual error tolerance
        return Promise.allSettled(
          PRECACHE_ASSETS.map((url) =>
            cache.add(url).catch((err) => console.warn('[SW] Could not cache:', url, err))
          )
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

  // Skip non-http schemes (chrome-extension, etc.)
  if (!url.protocol.startsWith('http')) return;

  // Network-first for Google Fonts (always want fresh)
  if (url.hostname.includes('fonts.g')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Only intercept requests on the same origin
  if (url.origin !== SW_URL.origin) return;

  // Cache-first for all same-origin assets
  event.respondWith(cacheFirst(request));
});

// ─── STRATEGIES ───────────────────────────────────────────

/**
 * Cache-first: serve from cache; on miss, fetch → cache → return.
 * On network failure, fall back to index.html (SPA shell).
 */
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
    // Offline fallback — return the cached app shell
    const fallback =
      (await caches.match(`${BASE_PATH}index.html`)) ||
      (await caches.match(BASE_PATH));
    return (
      fallback ||
      new Response('Dione OS is offline. Please reload when connected.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain' },
      })
    );
  }
}

/**
 * Network-first: try network → cache; on failure use cache.
 */
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
