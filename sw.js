/* Flight Prep service worker: keeps the app shell on the device so it opens with no internet.
   Bump VERSION when any app file changes - the app then shows "A new version is ready". Flight files are in IndexedDB, not here. */
var VERSION = 'fpapp-3.3.0';
var ASSETS = ['./', 'index.html', 'app.css', 'd3geo.js', 'fp_terrain.js', 'fp_globe.js', 'fp_live.js', 'fp_tools.js', 'fp_tools2.js', 'fp_agc.js', 'fp_amap.js', 'fp_wxnt.js', 'fp_refs.js', 'fp_regs.js', 'fp_ux.js', 'fp_mount.js', 'fp_lib.js', 'fp_online.js', 'fp_ofp.js', 'fp_auto.js', 'pdf.min.mjs', 'pdf.worker.min.mjs', 'basemap.json', 'aptdb.json', 'app3.css', 'skin_deck.css', 'skin_ops.css', 'heroscn-Bold.woff', 'heroscn-Regular.woff', 'dvmono-Bold.woff', 'poppins-Bold.woff', 'poppins-Medium.woff', 'inter-Regular.woff', 'inter-SemiBold.woff', 'inter-Bold.woff', 'inter-ExtraBold.woff', 'app.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];
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
  /* v3.3: the live weather / NOTAM files change all the time - network first, cache as the fallback */
  if (u.pathname.indexOf('/data/') >= 0) {
    e.respondWith(fetch(r).then(function (resp) { if (resp && resp.ok) { var cp = resp.clone(); caches.open(VERSION).then(function (c) { c.put(r, cp); }); } return resp; })
      .catch(function () { return caches.match(r, { ignoreSearch: true }); }));
    return;
  }
  e.respondWith(caches.match(r, { ignoreSearch: true }).then(function (c) {
    return c || fetch(r).then(function (resp) { if (resp && resp.ok) { var cp = resp.clone(); caches.open(VERSION).then(function (cc) { cc.put(r, cp); }); } return resp; });
  }));
});
