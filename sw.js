// ============================================================
// MARCATEMPO - Service Worker (PWA)
// ============================================================

const CACHE_NAME = 'marcatempo-v1';
const API_ORIGIN = 'https://marcatempo-api.elettimp.workers.dev';

// File da mettere in cache al primo avvio (app shell)
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

// ============================================================
// INSTALL — Precarica l'app shell
// ============================================================
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

// ============================================================
// ACTIVATE — Pulisci vecchie cache
// ============================================================
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

// ============================================================
// FETCH — Strategia per tipo di richiesta
// ============================================================
self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);

  // Le chiamate alle API non vengono mai cachate (dati sempre freschi)
  if (url.origin === new URL(API_ORIGIN).origin || event.request.url.indexOf('/api/') !== -1) {
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

  // Risorse CDN (bootstrap, icons, sheetjs, chart): cache-first
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

  // File statici del sito: cache-first con fallback a rete
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      return cached || fetch(event.request).then(function(response) {
        if (response && response.status === 200 && event.request.method === 'GET') {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            try { cache.put(event.request, clone); } catch(e) {}
          });
        }
        return response;
      }).catch(function() {
        // Se offline e file non in cache, torna al login
        return caches.match('./index.html');
      });
    })
  );
});