/* Flight Prep service worker: keeps the app shell on the device so it opens with no internet.
   Bump VERSION when any app file changes - the app then shows "A new version is ready". Flight files are in IndexedDB, not here. */
var VERSION = 'fpapp-1.0.0';
var ASSETS = ['./', 'index.html', 'app.css', 'fp_live.js', 'app.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];
self.addEventListener('install', function (e) { e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(ASSETS); })); });
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); })); })
    .then(function () { return self.clients.claim(); }));
});
self.addEventListener('message', function (e) { if (e.data === 'skipWaiting') self.skipWaiting(); });
self.addEventListener('fetch', function (e) {
  var r = e.request; if (r.method !== 'GET') return;
  var u = new URL(r.url); if (u.origin !== self.location.origin) return;
  if (r.mode === 'navigate') { e.respondWith(caches.match('index.html').then(function (c) { return c || fetch(r); })); return; }
  e.respondWith(caches.match(r, { ignoreSearch: true }).then(function (c) {
    return c || fetch(r).then(function (resp) { if (resp && resp.ok) { var cp = resp.clone(); caches.open(VERSION).then(function (cc) { cc.put(r, cp); }); } return resp; });
  }));
});
