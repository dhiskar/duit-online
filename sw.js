/* ============================================================
   DUIT — service worker
   Menyimpan kerangka aplikasi. Login dan data keuangan memerlukan internet.
   ============================================================ */
'use strict';

var CACHE = 'duit-online-shell-v1';
var ASSETS = [
  './',
  './index.html',
  './Duit.html',
  './manifest.webmanifest',
  './online.css',
  './online.js',
  './supabase-config.js',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
  './favicon-32.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      /* simpan satu per satu; satu file gagal tidak membatalkan semuanya */
      return Promise.all(ASSETS.map(function (url) {
        return cache.add(url).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        if (key !== CACHE && (key.indexOf('duit-shell-') === 0 || key.indexOf('duit-online-shell-') === 0)) return caches.delete(key);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;

  /* Halaman: coba jaringan dulu supaya update langsung terpakai,
     lalu gunakan kerangka cache jika jaringan tidak tersedia. */
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (cache) { cache.put(req, copy); });
        }
        return res;
      }).catch(function () {
        return caches.match(req).then(function (cached) {
          return cached || caches.match('./index.html') || caches.match('./Duit.html');
        });
      })
    );
    return;
  }

  /* Aset lain: cache dulu, perbarui di belakang layar. */
  event.respondWith(
    caches.match(req).then(function (cached) {
      var network = fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (cache) { cache.put(req, copy); });
        }
        return res;
      }).catch(function () { return cached; });
      return Promise.resolve(cached || network).then(function (res) {
        return res || new Response('', { status: 504, statusText: 'Offline' });
      });
    })
  );
});
