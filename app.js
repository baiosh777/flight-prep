/* Flight Prep - offline app shell. Stores flight files in IndexedDB, mounts the current flight, then hands over to FPLive (fp_live.js). */
(function () {
  'use strict';
  var APP_VERSION = '1.1.0 (05 NOV 2026)';
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { } }

  /* ---------- service worker: offline cache + update banner */
  var offlineReady = false;
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(function (reg) {
      function showUpdate() { $('update').hidden = false; $('update-btn').onclick = function () { if (reg.waiting) reg.waiting.postMessage('skipWaiting'); }; }
      if (reg.waiting && navigator.serviceWorker.controller) showUpdate();
      reg.addEventListener('updatefound', function () {
        var w = reg.installing; if (!w) return;
        w.addEventListener('statechange', function () { if (w.state === 'installed' && navigator.serviceWorker.controller) showUpdate(); if (w.state === 'activated') { offlineReady = true; info(); } });
      });
      navigator.serviceWorker.ready.then(function () { offlineReady = true; info(); });
    }).catch(function () { info(); });
    var reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () { if (reloading) return; reloading = true; location.reload(); });
  }

  /* ---------- IndexedDB: 'flights' (full flight file) + 'meta' (list entries) */
  var dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (res, rej) {
      var r = indexedDB.open('flightprep', 1);
      r.onupgradeneeded = function () { var d = r.result; d.createObjectStore('flights', { keyPath: 'id' }); d.createObjectStore('meta', { keyPath: 'id' }); };
      r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); };
    });
    return dbp;
  }
  function req(store, mode, fn) {
    return db().then(function (d) {
      return new Promise(function (res, rej) {
        var t = d.transaction(store, mode), rq = fn(t.objectStore(store));
        t.oncomplete = function () { res(rq ? rq.result : undefined); }; t.onerror = function () { rej(t.error); }; t.onabort = function () { rej(t.error); };
      });
    });
  }
  function putFlight(rec) {
    var meta = { id: rec.id, title: rec.title, flight: rec.flight, route: rec.route, date: rec.date, built_utc: rec.built_utc, ofp: rec.ofp, loaded: new Date().toISOString() };
    return req('flights', 'readwrite', function (s) { return s.put(rec); }).then(function () { return req('meta', 'readwrite', function (s) { return s.put(meta); }); });
  }
  function getFlight(id) { return req('flights', 'readonly', function (s) { return s.get(id); }); }
  function listMeta() { return req('meta', 'readonly', function (s) { return s.getAll(); }).then(function (a) { return (a || []).sort(function (x, y) { return (y.date || '').localeCompare(x.date || '') || (y.loaded || '').localeCompare(x.loaded || ''); }); }); }
  function delFlight(id) { return req('flights', 'readwrite', function (s) { return s.delete(id); }).then(function () { return req('meta', 'readwrite', function (s) { return s.delete(id); }); }); }

  /* ---------- flights screen */
  var CUR = lsGet('fpapp:current');
  function msg(t, kind) { var m = $('load-msg'); m.hidden = !t; m.className = 'msg ' + (kind || ''); m.textContent = t || ''; }
  function info() {
    var t = 'Flight Prep ' + APP_VERSION + ' · ' + (offlineReady || (navigator.serviceWorker && navigator.serviceWorker.controller) ? 'works offline on this device' : 'not stored for offline use yet – open the app once with internet');
    if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then(function (e) { $('app-info').textContent = t + ' · storage used ' + (e.usage / 1e6).toFixed(1) + ' MB'; }).catch(function () { $('app-info').textContent = t; });
    else $('app-info').textContent = t;
  }
  function renderList() {
    return listMeta().then(function (list) {
      var h = '';
      if (!list.length) h = '<div class="msg">No flights yet. Tap <b>Load flight file</b> and pick the file Claude sent you.</div>';
      list.forEach(function (m) {
        h += '<div class="fcard' + (m.id === CUR ? ' cur' : '') + '" data-id="' + esc(m.id) + '"><div class="ft">' + esc(m.flight) + ' ' + esc(m.route) + ' · ' + esc(m.date) + '</div>' +
          '<div class="fm">OFP ' + esc(m.ofp) + ' · built ' + esc(m.built_utc) + (m.id === CUR ? ' · <b>open now</b>' : '') + '</div>' +
          '<div class="fb">' + (m.id === CUR ? '' : '<button type="button" data-act="open">Open</button>') + '<button type="button" data-act="del">Delete</button></div></div>';
      });
      $('flist').innerHTML = h;
      $('flist').querySelectorAll('button').forEach(function (b) {
        b.addEventListener('click', function () {
          var card = b.closest('.fcard'), id = card.dataset.id;
          if (b.dataset.act === 'open') { lsSet('fpapp:current', id); location.hash = 'now'; location.reload(); return; }
          if (b.dataset.act === 'del') {
            if (b.dataset.armed) { delFlight(id).then(function () { if (id === CUR) { lsSet('fpapp:current', null); location.hash = 'flights'; location.reload(); } else renderList(); }); return; }
            b.dataset.armed = '1'; b.textContent = 'Tap again to delete'; setTimeout(function () { if (b.isConnected) { delete b.dataset.armed; b.textContent = 'Delete'; } }, 4000);
          }
        });
      });
    }).catch(function (e) { $('flist').innerHTML = '<div class="msg bad">Could not read the stored flights (' + esc(e && e.message) + ').</div>'; });
  }
  $('load-file').addEventListener('change', function (ev) {
    var f = ev.target.files && ev.target.files[0]; if (!f) return;
    msg('Loading ' + f.name + ' …');
    var rd = new FileReader();
    rd.onload = function () {
      var rec;
      try { rec = JSON.parse(rd.result); } catch (e) { msg('This file is not a flight file (it is not valid JSON). Pick the *_flight.json file Claude sent.', 'bad'); return; }
      if (!rec || rec.schema !== 'fpapp.flight.v1' || !rec.data || !rec.views) { msg('This file is not a Flight Prep flight file. Pick the *_flight.json file Claude sent.', 'bad'); return; }
      putFlight(rec).then(function () {
        if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () { });
        lsSet('fpapp:current', rec.id); msg('Loaded ' + rec.title + '.', 'ok');
        location.hash = 'now'; location.reload();
      }).catch(function (e) { msg('Could not store the flight (' + (e && e.message) + '). Free some space and try again.', 'bad'); });
    };
    rd.onerror = function () { msg('Could not read the file.', 'bad'); };
    rd.readAsText(f);
    ev.target.value = '';
  });

  /* ---------- mount a flight (fp_mount.js), then the live layer starts */
  function mount(rec) { window.FPMount(rec, { app: true }); }
  function empty() {
    document.body.classList.add('empty'); $('top').classList.add('empty');
    $('tabs').innerHTML = '<a href="#flights" data-v="flights" class="on">FLIGHTS</a>';
    document.querySelectorAll('.view').forEach(function (v) { v.hidden = v.dataset.view !== 'flights'; });
    try { var p = JSON.parse(lsGet('fpapp:prefs') || '{}'); if (p.theme === 'dark' || p.theme === 'light') document.documentElement.setAttribute('data-theme', p.theme); } catch (e) { }
    function utc() { var d = new Date(), p = function (n) { return String(n).padStart(2, '0'); }; $('utc').textContent = p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) + ':' + p(d.getUTCSeconds()); }
    utc(); setInterval(utc, 1000);
  }
  renderList(); info();
  (CUR ? getFlight(CUR) : Promise.resolve(null)).then(function (rec) {
    if (rec) mount(rec);
    else { if (CUR) lsSet('fpapp:current', null); CUR = null; empty(); }
  }).catch(function () { empty(); });
})();
