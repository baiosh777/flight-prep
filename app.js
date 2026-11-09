/* Flight Prep - offline app shell. Stores flight files in IndexedDB, mounts the current flight, then hands over to FPLive (fp_live.js). */
(function () {
  'use strict';
  var APP_VERSION = '3.3.0 (10 NOV 2026)';
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
      var r = indexedDB.open('flightprep', 2);   // v3: + 'library' (regulations library, independent of the flights)
      r.onupgradeneeded = function () { var d = r.result; if (!d.objectStoreNames.contains('flights')) d.createObjectStore('flights', { keyPath: 'id' }); if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'id' }); if (!d.objectStoreNames.contains('library')) d.createObjectStore('library', { keyPath: 'kind' }); };
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
  function getMeta(id) { return req('meta', 'readonly', function (s) { return s.get(id); }); }
  function putMeta(m) { return req('meta', 'readwrite', function (s) { return s.put(m); }); }
  function putFlight(rec, extra) {   // keeps an existing turnaround link (ret / retOf) when a flight is loaded again
    return getMeta(rec.id).then(function (old) {
      var meta = { id: rec.id, title: rec.title, flight: rec.flight, route: rec.route, date: rec.date, built_utc: rec.built_utc, ofp: rec.ofp, loaded: new Date().toISOString(),
        ret: old && old.ret || null, retOf: old && old.retOf || null };
      Object.assign(meta, extra || {});
      return req('flights', 'readwrite', function (s) { return s.put(rec); }).then(function () { return putMeta(meta); });
    });
  }
  function getFlight(id) { return req('flights', 'readonly', function (s) { return s.get(id); }); }
  function listMeta() { return req('meta', 'readonly', function (s) { return s.getAll(); }).then(function (a) { return (a || []).sort(function (x, y) { return (y.date || '').localeCompare(x.date || '') || (y.loaded || '').localeCompare(x.loaded || ''); }); }); }
  function putLib(l) { return req('library', 'readwrite', function (s) { return s.put(l); }); }
  function getLib(kind) { return req('library', 'readonly', function (s) { return s.get(kind); }); }
  function libInfo(l) { var el = $('lib-info'); if (!el) return; el.innerHTML = l ? 'Regulations library: <b>' + esc(l.title) + '</b> · built ' + esc(l.built_utc) + ' · ' + (l.countries || []).length + ' countries, ' + (l.regions || []).length + ' regions (REGS page). Load a newer library file here to replace it.' : 'No regulations library yet – load the Lido RM library file Claude sends (REGS page).'; }
  function delFlight(id) { return req('flights', 'readwrite', function (s) { return s.delete(id); }).then(function () { return req('meta', 'readwrite', function (s) { return s.delete(id); }); }); }

  /* ---------- flights screen */
  var CUR = lsGet('fpapp:current');
  function msg(t, kind) { var m = $('load-msg'); m.hidden = !t; m.className = 'msg ' + (kind || ''); m.textContent = t || ''; }
  function info() {
    var t = 'Flight Prep ' + APP_VERSION + ' · ' + (offlineReady || (navigator.serviceWorker && navigator.serviceWorker.controller) ? 'works offline on this device' : 'not stored for offline use yet – open the app once with internet');
    if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then(function (e) { $('app-info').textContent = t + ' · storage used ' + (e.usage / 1e6).toFixed(1) + ' MB'; }).catch(function () { $('app-info').textContent = t; });
    else $('app-info').textContent = t;
  }
  function nameOf(list, id) { var m = list.filter(function (x) { return x.id === id; })[0]; return m ? m.flight + ' ' + m.route + ' ' + m.date : id; }
  function renderList() {
    return listMeta().then(function (list) {
      var h = '';
      if (!list.length) h = '<div class="msg">No flights yet. Tap <b>Load flight file</b> and pick the file Claude sent you.</div>';
      list.forEach(function (m) {
        h += '<div class="fcard' + (m.id === CUR ? ' cur' : '') + '" data-id="' + esc(m.id) + '"><div class="ft">' + esc(m.flight) + ' ' + esc(m.route) + ' · ' + esc(m.date) + '</div>' +
          '<div class="fm">OFP ' + esc(m.ofp) + ' · built ' + esc(m.built_utc) + (m.id === CUR ? ' · <b>open now</b>' : '') + (m.ret ? ' · <span class="pair">↩ return ' + esc(nameOf(list, m.ret)) + '</span>' : '') + (m.retOf ? ' · <span class="pair">return of ' + esc(nameOf(list, m.retOf)) + '</span>' : '') + '</div>' +
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
  /* ---------- load or paste a flight file; optionally keep it as the return flight of the open one (turnaround) */
  var curMeta = null;
  function rev(r) { return String(r || '').split('-').reverse().join('-'); }
  function ingest(text, name) {
    var rec;
    try { rec = JSON.parse(String(text || '').trim()); } catch (e) { msg('This is not a flight file (not valid JSON). Use the *_flight.json file Claude sent.', 'bad'); return; }
    if (rec && rec.schema === 'fpapp.library.v1') {   // v3: regulations library · v3.3: airport packs, FIR comms, MEL
      rec.kind = rec.kind || 'regs'; msg('Storing the library ' + rec.title + ' …');
      getLib(rec.kind).then(function (old) {
        var merged = window.FPLib ? window.FPLib.merge(old || null, rec) : rec;
        merged.kind = rec.kind;
        return putLib(merged).then(function () {
          msg('Library stored: ' + rec.title + (rec.kind === 'regs' ? ' (' + (rec.countries || []).length + ' countries). Open the REGS page.' : '. It is used by every flight from now on – reopen the flight to see it.'), 'ok');
          if (rec.kind === 'regs') { libInfo(merged); if (window.FPRegs) window.FPRegs.setLib(merged); }
          libList();
        });
      }).catch(function (e) { msg('Could not store the library (' + (e && e.message) + ').', 'bad'); });
      return;
    }
    if (!rec || rec.schema !== 'fpapp.flight.v1' || !rec.data || !rec.views) { msg('This is not a Flight Prep flight or library file. Use the *_flight.json file Claude sent.', 'bad'); return; }
    var asRet = !!(curMeta && $('asret') && $('asret').checked && rec.id !== CUR);
    msg('Storing ' + (name || rec.title) + ' …');
    putFlight(rec, asRet ? { retOf: CUR } : null).then(function () {
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () { });
      if (asRet) {
        curMeta.ret = rec.id; return putMeta(curMeta).then(function () { msg('Saved ' + rec.title + ' as the return flight of ' + curMeta.flight + ' ' + curMeta.route + '. It is offered on NOW before landing, or open it here.', 'ok'); $('asret').checked = false; renderList(); });
      }
      lsSet('fpapp:current', rec.id); msg('Loaded ' + rec.title + '.', 'ok'); location.hash = 'now'; location.reload();
    }).catch(function (e) { msg('Could not store the flight (' + (e && e.message) + '). Free some space and try again.', 'bad'); });
  }
  /* v3.2: a Lido OFP PDF (or its text) is read and built into a flight by the app itself - no Claude, no internet */
  function buildOfp(f) {
    if (!window.FPOfp || !window.FPAuto) { msg('This app build cannot read OFPs (fp_ofp.js / fp_auto.js missing).', 'bad'); return; }
    var isPdf = /\.pdf$/i.test(f.name) || f.type === 'application/pdf';
    msg('Reading ' + f.name + ' – ' + (isPdf ? 'opening the PDF' : 'reading the text') + ' …');
    var t0 = Date.now();
    (isPdf ? f.arrayBuffer().then(function (b) { return window.FPOfp.pdfText(b, function (i, n) { if (i % 10 === 0 || i === n) msg('Reading the OFP – page ' + i + ' of ' + n + ' …'); }); })
      : f.text()).then(function (text) {
        msg('Building the flight from the OFP …');
        return window.FPAuto.build(text, { onprog: function (m) { msg(m); } });
      }).then(function (rec) {
        var w = (rec.data.auto.warn || []), nt = (rec.data.auto.note || []);
        if (w.length) { msg('This does not look like a Lido OFP: ' + w.join(' '), 'bad'); return; }
        msg('Built ' + rec.title + ' in ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s' + (nt.length ? ' – note: ' + nt.join(' ') : '') + ' – storing …');
        ingest(JSON.stringify(rec), rec.title);
      }).catch(function (e) {
        msg('Could not build the flight from this file (' + (e && e.message) + '). A Lido OFP PDF or a Flight Prep flight file is expected.', 'bad');
      });
  }
  function readFile(f) {
    if (!f) return;
    if (/\.pdf$/i.test(f.name) || f.type === 'application/pdf' || /\.txt$/i.test(f.name)) { buildOfp(f); return; }
    msg('Reading ' + f.name + ' …'); var rd = new FileReader(); rd.onload = function () { ingest(rd.result, f.name); }; rd.onerror = function () { msg('Could not read the file.', 'bad'); }; rd.readAsText(f);
  }
  $('load-file').addEventListener('change', function (ev) { readFile(ev.target.files && ev.target.files[0]); ev.target.value = ''; });
  var pz = $('paste-zone');
  if (pz) {
    pz.addEventListener('paste', function (ev) {
      var cd = ev.clipboardData; if (!cd) return; ev.preventDefault();
      if (cd.files && cd.files.length) { readFile(cd.files[0]); return; }
      var t = cd.getData('text/plain') || cd.getData('text'); if (t) ingest(t, 'pasted flight'); else msg('Nothing to paste – copy the flight file first.', 'bad');
      pz.value = '';
    });
    pz.addEventListener('dragover', function (ev) { ev.preventDefault(); pz.classList.add('over'); });
    pz.addEventListener('dragleave', function () { pz.classList.remove('over'); });
    pz.addEventListener('drop', function (ev) { ev.preventDefault(); pz.classList.remove('over'); var f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0]; if (f) readFile(f); else { var t = ev.dataTransfer && ev.dataTransfer.getData('text'); if (t) ingest(t, 'dropped text'); } });
  }
  var pb = $('paste-btn');
  if (pb) pb.addEventListener('click', function () {
    if (navigator.clipboard && navigator.clipboard.read) {
      navigator.clipboard.read().then(function (items) {
        var it = items[0]; if (!it) throw new Error('empty');
        var ty = it.types.filter(function (t) { return /json|text\/plain/.test(t); })[0] || it.types[0];
        return it.getType(ty).then(function (b) { return b.text(); }).then(function (t) { ingest(t, 'pasted flight'); });
      }).catch(function () { if (navigator.clipboard.readText) navigator.clipboard.readText().then(function (t) { ingest(t, 'pasted flight'); }).catch(function () { msg('Paste was not allowed – long-press the box below and choose Paste.', 'bad'); pz && pz.focus(); }); });
    } else if (navigator.clipboard && navigator.clipboard.readText) navigator.clipboard.readText().then(function (t) { ingest(t, 'pasted flight'); }).catch(function () { msg('Long-press the box below and choose Paste.', 'bad'); pz && pz.focus(); });
    else { msg('Long-press the box below and choose Paste.', ''); pz && pz.focus(); }
  });
  function retUi() {   // the 'return flight' option is offered when a flight is open; ticked when the routes are reversed
    if (!CUR) return; getMeta(CUR).then(function (m) {
      if (!m) return; curMeta = m; $('asret-l').hidden = false; $('asret-n').textContent = m.flight + ' ' + m.route;
      window.FPReturnOf = m;
      if (m.ret) getMeta(m.ret).then(function (r) { if (r) { window.FPReturn = { id: r.id, title: r.flight + ' ' + r.route + ' ' + r.date }; } });
    }).catch(function () { });
  }
  window.FPOpenFlight = function (id) { lsSet('fpapp:current', id); location.hash = 'now'; location.reload(); };
  retUi();

  /* ---------- mount a flight (fp_mount.js), then the live layer starts */
  function cmpVer(a, b) { a = String(a || '0').split('.').map(Number); b = String(b || '0').split('.').map(Number); for (var i = 0; i < 3; i++) { if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) - (b[i] || 0); } return 0; }
  function mount(rec) {
    window.FPMount(rec, { app: true });
    if (rec.min_app && cmpVer(rec.min_app, APP_VERSION.split(' ')[0]) > 0) msg('This flight file was made for Flight Prep ' + rec.min_app + ' or newer - update the app files, some pages may not show correctly.', 'bad');
  }
  function orient() { document.body.classList.toggle('land', window.innerWidth >= 1000 && window.innerWidth > window.innerHeight); }
  orient(); window.addEventListener('resize', orient);
  function empty() {
    document.body.classList.add('empty'); $('top').classList.add('empty');
    $('tabs').innerHTML = '<a href="#flights" data-v="flights" class="on">FLIGHTS</a>';
    document.querySelectorAll('.view').forEach(function (v) { v.hidden = v.dataset.view !== 'flights'; });
    try { var p = JSON.parse(lsGet('fpapp:prefs') || '{}'); if (p.theme === 'dark' || p.theme === 'light' || p.theme === 'night') document.documentElement.setAttribute('data-theme', p.theme); var sk = p.skin || window.FP_DEFAULT_SKIN || 'pro'; if (sk !== 'cockpit') document.documentElement.setAttribute('data-skin', sk); } catch (e) { }
    function utc() { var d = new Date(), p = function (n) { return String(n).padStart(2, '0'); }; $('utc').textContent = p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) + ':' + p(d.getUTCSeconds()); }
    utc(); setInterval(utc, 1000);
  }
  /* old-flight cleanup (user 05 NOV 26): flights more than 5 days past their date are removed (not the open one) */
  function cleanup() {
    var lim = new Date(Date.now() - 5 * 864e5).toISOString().slice(0, 10);
    return listMeta().then(function (list) {
      var keep = {}; list.forEach(function (m) { if (m.id === CUR) { keep[m.id] = 1; if (m.ret) keep[m.ret] = 1; if (m.retOf) keep[m.retOf] = 1; } });
      var old = list.filter(function (m) { return !keep[m.id] && m.date && m.date < lim; });
      return Promise.all(old.map(function (m) { try { localStorage.removeItem('fp:' + m.id); } catch (e) { } return delFlight(m.id); })).then(function () { return old.length; });
    }).catch(function () { return 0; });
  }
  cleanup().then(function (n) { renderList(); if (n) msg(n + (n === 1 ? ' flight' : ' flights') + ' older than 5 days removed.', 'ok'); });
  info();
  /* v3.3: the stored libraries (airport packs, FIR comms, MEL, regulations) are put into the flight before it is mounted */
  function allLibs() {
    return Promise.all(['apt', 'fir', 'mel', 'regs'].map(function (k) { return getLib(k).catch(function () { return null; }); }))
      .then(function (a) { return { apt: a[0], fir: a[1], mel: a[2], regs: a[3] }; });
  }
  function libList() {
    var el = $('lib-list'); if (!el) return;
    allLibs().then(function (L) {
      var rows = ['apt', 'fir', 'mel', 'regs'].filter(function (k) { return L[k]; })
        .map(function (k) { return '<li>' + (window.FPLib ? window.FPLib.describe(L[k]) : k) + ' <small>· ' + esc(L[k].built_utc || '') + '</small></li>'; });
      el.innerHTML = rows.length ? '<b>Stored libraries</b><ul class="libs">' + rows.join('') + '</ul>' :
        '<b>No libraries yet.</b> Load the airport pack, FIR comms, MEL or regulations files Claude sends – they stay on the iPad and are used by every flight, including the ones the app builds from an OFP.';
    }).catch(function () { });
  }
  (CUR ? getFlight(CUR) : Promise.resolve(null)).then(function (rec) {
    if (!rec) { if (CUR) lsSet('fpapp:current', null); CUR = null; empty(); libList(); return; }
    return allLibs().then(function (L) {
      try { if (window.FPLib) window.FPLib.apply(rec, L); } catch (e) { console.log('lib', e); }
      mount(rec);
      libInfo(L.regs || null); if (L.regs && window.FPRegs) window.FPRegs.setLib(L.regs);
      libList();
    });
  }).catch(function () { empty(); });
})();
