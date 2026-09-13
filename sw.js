// ============================================================
// MARCATEMPO - Service Worker (PWA)
// ============================================================

const CACHE_NAME = 'marcatempo-v2';
const API_ORIGIN = 'https://marcatempo-api.elettimp.workers.dev';

const PRECACHE_URLS = [
  './',
  './index.html',
  './admin.html',
  './collaboratore.html',
  './logout.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', function(event) {
  console.log('[SW] Install');
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(PRECACHE_URLS).catch(function(err) {
        console.warn('[SW] Errore precache:', err);
      });
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function(event) {
  console.log('[SW] Activate');
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_NAME; })
            .map(function(k) { return caches.delete(k); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function(event) {
  if (event.request.method !== 'GET') return;

  var url = new URL(event.request.url);

  // API: sempre rete
  if (url.origin === new URL(API_ORIGIN).origin) {
    event.respondWith(
      fetch(event.request).catch(function() {
        return new Response(JSON.stringify({
          success: false,
          error: 'Sei offline. Riprova quando hai connessione.'
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // CDN: cache-first
  if (url.origin !== self.location.origin) {
    event.respondWith(
      caches.match(event.request).then(function(cached) {
        return cached || fetch(event.request).then(function(response) {
          return caches.open(CACHE_NAME).then(function(cache) {
            try { cache.put(event.request, response.clone()); } catch(e) {}
            return response;
          });
        });
      })
    );
    return;
  }

  // File locali: cache-first con fallback
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      return cached || fetch(event.request).then(function(response) {
        if (response && response.status === 200) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            try { cache.put(event.request, clone); } catch(e) {}
          });
        }
        return response;
      }).catch(function() {
        return caches.match('./index.html');
      });
    })
  );
});