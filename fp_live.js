/* fp_live.js v1.1 (05 NOV 26) - the live layer of Flight Prep (shared by the web page and the offline app).
   FPLive(D) wires the clock, fuel-check timer, alerts, NOW screen, waypoint tracker, calls, fuel, timeline,
   picture viewer, globe map (fp_globe.js), settings and navigation to the DOM. */
window.FPLive = function (D) {
  'use strict';
  var F = D.flight, T = F.trip, FC_MIN = 55;
  var KEY = 'fp:' + F.id, PKEY = 'fpapp:prefs';
  function def() { return { to: null, passed: -1, times: {}, done: {}, fuel: {}, fc: null, fcLog: [] }; }
  var S = def();
  try { var raw = localStorage.getItem(KEY); if (raw) S = Object.assign(def(), JSON.parse(raw)); } catch (e) { }
  if (!Array.isArray(S.fcLog)) S.fcLog = [];
  var P = { theme: S.theme || 'auto', fs: 1, sound: false, cols: 'auto', wake: !!S.wake };
  try { var rp = localStorage.getItem(PKEY); if (rp) P = Object.assign(P, JSON.parse(rp)); } catch (e) { }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } }
  function savePrefs() { try { localStorage.setItem(PKEY, JSON.stringify(P)); } catch (e) { } }
  function $(id) { return document.getElementById(id); }
  function on(id, ev, fn) { var el = $(id); if (el) el.addEventListener(ev, fn); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function hm(m) { var s = m < 0 ? '-' : ''; m = Math.abs(Math.floor(m)); return s + Math.floor(m / 60) + ':' + pad(m % 60); }
  function zt(m) { m = ((Math.round(m) % 1440) + 1440) % 1440; return pad(Math.floor(m / 60)) + pad(m % 60) + 'Z'; }
  function mmss(x) { x = Math.max(0, Math.floor(x)); return Math.floor(x / 60) + ':' + pad(x % 60); }
  function nowMin() { var d = new Date(); return d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60; }
  function nowHHMM() { var d = new Date(); return pad(d.getUTCHours()) + pad(d.getUTCMinutes()); }
  function parseTO(s) { s = String(s || '').replace(/\D/g, ''); if (s.length < 3 || s.length > 4) return null; var h = +s.slice(0, -2), m = +s.slice(-2); return (h > 23 || m > 59) ? null : h * 60 + m; }
  function isPlan() { return parseTO(S.to) === null; }
  function toMin() { var t = parseTO(S.to); return t === null ? F.to_plan : t; }
  // minutes after take-off; negative = take-off still ahead (up to 3 h)
  function el() { var e = nowMin() - toMin(); if (e < 0) e += 1440; if (e > 1440 - 180) e -= 1440; return e; }
  function inTxt(d) { if (d < 0) return 'overdue ' + hm(Math.ceil(-d)); if (d < 1) return 'now'; return 'in ' + (d < 60 ? Math.ceil(d) + ' min' : hm(Math.ceil(d))); }
  function isoZ(iso) { try { var d = new Date(iso); return pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + 'Z'; } catch (e) { return ''; } }
  var globe = null;

  /* ---------- confirm strip + toast (no confirm() / alert() dialogs) */
  var onYes = null;
  function ask(text, yesLabel, fn) { $('confirm-text').textContent = text; $('confirm-yes').textContent = yesLabel; onYes = fn; $('confirm').hidden = false; layoutVars(); }
  on('confirm-yes', 'click', function () { $('confirm').hidden = true; if (onYes) onYes(); onYes = null; layoutVars(); });
  on('confirm-no', 'click', function () { $('confirm').hidden = true; onYes = null; layoutVars(); });
  var toastT = null, toastUndo = null;
  function toast(text, undoFn) {
    var t = $('toast');
    if (!t) {
      t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); t.hidden = true;
      t.innerHTML = '<span></span><button type="button">Undo</button>'; document.body.appendChild(t);
      t.querySelector('button').addEventListener('click', function () { t.hidden = true; var f = toastUndo; toastUndo = null; if (f) f(); });
    }
    t.querySelector('span').textContent = text; t.querySelector('button').hidden = !undoFn; toastUndo = undoFn || null; t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; toastUndo = null; }, 7000);
  }

  /* ---------- sound (WebAudio chime; iOS needs a tap first, so every tap re-arms it) */
  var AC = null;
  function unlockAudio() {
    if (!P.sound) return;
    try {
      if (!AC) { var C = window.AudioContext || window.webkitAudioContext; if (!C) return; AC = new C(); }
      if (AC.state === 'suspended') AC.resume();
      if (navigator.audioSession) navigator.audioSession.type = 'playback';
    } catch (e) { }
  }
  function chime(n, force) {
    if (!P.sound && !force) return;
    var was = P.sound; P.sound = true; unlockAudio(); P.sound = was; if (!AC) return;
    try {
      var t0 = AC.currentTime + 0.03;
      for (var k = 0; k < (n || 2); k++) [880, 660].forEach(function (f, j) {
        var o = AC.createOscillator(), g = AC.createGain(), s = t0 + k * 0.6 + j * 0.22;
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(0.6, s + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, s + 0.2);
        o.connect(g); g.connect(AC.destination); o.start(s); o.stop(s + 0.22);
      });
    } catch (e) { }
  }
  document.addEventListener('pointerdown', unlockAudio, { passive: true });

  /* ---------- take-off time */
  var inp = $('to-input');
  inp.value = S.to || '';
  function setTO(v) { S.to = v; save(); inp.value = v || ''; inp.classList.remove('bad'); tick(true); }
  function typed() {
    var v = inp.value.replace(/\D/g, '');
    if (!v) { setTO(null); return; }
    var t = parseTO(v); if (t === null) { inp.classList.add('bad'); return; }
    setTO(pad(Math.floor(t / 60)) + pad(t % 60));
  }
  inp.addEventListener('change', typed);
  inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); typed(); } });
  on('airborne', 'click', function () {
    var n = nowHHMM();
    if (S.to && S.to !== n) ask('Replace T/O ' + S.to + 'Z with ' + n + 'Z (now)?', 'Replace', function () { setTO(n); });
    else { setTO(n); toast('Airborne ' + n + 'Z – clock running.'); }
  });

  /* ---------- fuel-check timer: every tap restarts 55:00 */
  function fcLeft() { if (!S.fc) return null; return FC_MIN * 60 - (Date.now() - new Date(S.fc).getTime()) / 1000; }
  function fcReset() {
    var prev = S.fc, prevLog = S.fcLog.slice();
    S.fc = new Date().toISOString(); S.fcLog.push(S.fc); if (S.fcLog.length > 40) S.fcLog.shift();
    save(); paintFC(); tick(true);
    toast('Fuel check at ' + isoZ(S.fc) + ' – timer restarted, 55:00.', function () { S.fc = prev; S.fcLog = prevLog; save(); paintFC(); tick(true); });
  }
  on('fc', 'click', fcReset);
  function paintFC() {
    var b = $('fc'), left = fcLeft(), t = $('fc-t'), lab = $('fc-l'), st = left === null ? 'idle' : (left <= 0 ? 'red' : (left <= 300 ? 'amb' : ''));
    if (b) {
      b.classList.remove('amb', 'red', 'idle'); if (st) b.classList.add(st);
      lab.textContent = st === 'red' ? 'FUEL CHECK DUE' : 'FUEL CHECK';
      t.textContent = left === null ? 'START' : (left > 0 ? mmss(left) : '+' + mmss(-left));
      b.setAttribute('aria-label', left === null ? 'Start the 55 minute fuel check timer' : 'Fuel check timer ' + t.textContent + ' – tap after the fuel check to restart 55 minutes');
    }
  }

  /* ---------- waypoints table */
  var tb = document.querySelector('#wpt tbody'), nowRow, trs = [], wtab = $('wpt');
  D.rows.forEach(function (r) {
    var tr = document.createElement('tr'); tr.tabIndex = 0; tr.setAttribute('role', 'button');
    tr.setAttribute('aria-label', r.wpt + ' – tap when passed');
    if (r.bnd) tr.classList.add('bnd');
    var mc = r.mora == null ? '' : (r.mora > 10000 ? 'red' : (r.mora > 5000 ? 'amb' : ''));
    tr.innerHTML = '<td class="eet"><span class="ck" aria-hidden="true"></span><span class="et">' + (r.eet == null ? esc(r.label || '-') : hm(r.eet)) + '</span><div class="st"></div></td>' +
      '<td class="wp">' + esc(r.wpt) + '</td><td class="fir ' + r.fc + '">' + (r.bnd ? '▶ ' : '') + esc(r.fir) + '<small>' + esc(r.firname) + '</small></td>' +
      '<td>' + r.call + '</td><td class="c-cpdlc">' + r.cpdlc + '</td><td>' + r.special + '</td><td>' + r.threat + '</td><td class="c-div">' + r.divert + '</td>' +
      '<td class="mora ' + mc + '">' + (r.mora == null ? '-' : r.mora) + '</td>' +
      '<td class="fu">' + (r.fmin == null ? '-' : r.fmin.toFixed(1) + '<br><b>' + r.fplan.toFixed(1) + '</b>') + '</td>';
    tr.addEventListener('click', function (ev) { if (ev.target.closest('a')) return; tap(r.i); });
    tr.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tap(r.i); } });
    tb.appendChild(tr); trs.push(tr);
  });
  nowRow = document.createElement('tr'); nowRow.className = 'nowline'; nowRow.innerHTML = '<td colspan="10"><div></div></td>';
  function tap(i) {
    if (i <= S.passed) { for (var j = i; j <= S.passed; j++) delete S.times[j]; S.passed = i - 1; }
    else { S.times[i] = new Date().toISOString(); S.passed = i; }
    save(); paintWpt(); tick(true);
  }
  on('undo', 'click', function () { if (S.passed >= 0) { delete S.times[S.passed]; S.passed--; save(); paintWpt(); tick(true); } });
  on('reset', 'click', function () { ask('Clear all passed waypoints?', 'Clear', function () { S.passed = -1; S.times = {}; save(); paintWpt(); tick(true); }); });
  on('wpt-next', 'click', function () { jumpNext(true); });
  function paintWpt() {
    var e = el(), nxt = S.passed + 1;
    D.rows.forEach(function (r, i) {
      var tr = trs[i], st = tr.querySelector('.st'), h = '';
      tr.classList.toggle('passed', i <= S.passed);
      tr.classList.toggle('next', i === nxt);
      if (i <= S.passed) h = S.times[i] ? '<span class="chip ata">' + isoZ(S.times[i]) + '</span>' : '';
      else {
        if (i === nxt) h += '<span class="chip next">NEXT</span> ';
        if (r.eet != null && r.eet < e - 1) h += '<span class="chip due">DUE</span>';
      }
      st.innerHTML = h;
    });
    if (nowRow.parentNode) nowRow.parentNode.removeChild(nowRow);
    if (e >= 0 && e <= T + 30) {
      var at = null;
      for (var k = 0; k < D.rows.length; k++) if (D.rows[k].eet != null && D.rows[k].eet > e) { at = trs[k]; break; }
      nowRow.querySelector('div').textContent = 'NOW ' + hm(e) + (isPlan() ? '  (planned T/O – no T/O set)' : '');
      if (at) tb.insertBefore(nowRow, at); else tb.appendChild(nowRow);
    }
  }
  function jumpNext(smooth) {
    var tr = document.querySelector('#wpt tr.next') || document.querySelector('#wpt tr.nowline'); if (!tr) return;
    var r = tr.getBoundingClientRect(), top = $('top').offsetHeight;
    window.scrollTo({ top: Math.max(0, window.scrollY + r.top - top - 90), behavior: smooth ? 'smooth' : 'auto' });
  }
  function isCompact() { return P.cols === 'compact' || (P.cols === 'auto' && window.innerWidth < 1000); }
  function applyCols() { var c = isCompact(); if (wtab) wtab.classList.toggle('compact', c); var t = 'Columns: ' + (c ? 'compact' : 'all'); if ($('cols')) $('cols').textContent = 'Waypoint ' + t.toLowerCase(); if ($('wcols')) $('wcols').textContent = t; }
  function toggleCols() { P.cols = isCompact() ? 'all' : 'compact'; savePrefs(); applyCols(); }
  on('cols', 'click', toggleCols); on('wcols', 'click', toggleCols);

  /* ---------- calls / deadlines */
  var dls = Array.prototype.slice.call(document.querySelectorAll('.dl'));
  function dlById(id) { for (var k = 0; k < D.deadlines.length; k++) if (D.deadlines[k].id === id) return D.deadlines[k]; return null; }
  function toggleDone(id, withToast) {
    var was = S.done[id];
    if (was) delete S.done[id]; else S.done[id] = new Date().toISOString();
    save(); tick(true);
    var d = dlById(id);
    if (withToast && !was && d) toast(d.fir + ' ' + d.name + ' – marked done at ' + isoZ(S.done[id]) + '.', function () { delete S.done[id]; save(); tick(true); });
  }
  document.querySelectorAll('button.done').forEach(function (b) { b.addEventListener('click', function () { toggleDone(b.dataset.id, false); }); });
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-done],[data-act]'); if (!b) return;
    if (b.dataset.done) { ev.preventDefault(); toggleDone(b.dataset.done, true); }
    else if (b.dataset.act === 'fc') { ev.preventDefault(); fcReset(); }
  });
  function paintCalls(e) {
    dls.forEach(function (li) {
      var cd = li.querySelector('.cd'), eet = +cd.dataset.eet, id = li.dataset.id, done = S.done[id], d = eet - e;
      li.classList.toggle('isdone', !!done); li.classList.toggle('soon', !done && d >= 0 && d <= 10); li.classList.toggle('over', !done && d < 0);
      cd.textContent = done ? 'done ' + isoZ(done) : inTxt(d);
      li.querySelector('.done').textContent = done ? 'Undo' : 'Done';
    });
    var cur = curFir(e);
    document.querySelectorAll('.slop').forEach(function (s) { s.classList.toggle('curfir', !!(cur && s.dataset.fir === cur.fir)); });
  }
  function curFir(e) { var c = null; D.firs.forEach(function (f) { if (f.eet_min <= e) c = f; }); return c; }

  /* ---------- alerts strip under the clock + chimes + tab badges */
  var fired = {};
  function paintAlerts(e) {
    var A = [], live = !isPlan();
    D.deadlines.forEach(function (d) {
      if (S.done[d.id]) return; var dd = d.eet - e;
      if (live && dd <= 10 && dd >= -15) A.push({ k: 'c:' + d.id, cls: dd < 0 ? 'red' : 'amb', d: d, dd: dd });
      if (live && dd <= 5 && dd > 4.5 && !fired['c5' + d.id]) { fired['c5' + d.id] = 1; chime(1); }
      if (live && dd <= 0 && dd > -0.5 && !fired['c0' + d.id]) { fired['c0' + d.id] = 1; chime(2); }
    });
    A.sort(function (a, b) { return a.dd - b.dd; });
    var left = fcLeft();
    if (left !== null && left <= 300) A.unshift({ k: 'fc', cls: left <= 0 ? 'red' : 'amb', fc: true });
    if (left !== null && left <= 0 && left > -30 && !fired['fc' + S.fc]) { fired['fc' + S.fc] = 1; chime(3); }
    A = A.slice(0, 3);
    var box = $('alert');
    if (box) {
      var sig = A.map(function (a) { return a.k + a.cls; }).join('|');
      if (box._sig !== sig) {
        box._sig = sig;
        box.innerHTML = A.map(function (a) {
          if (a.fc) return '<div class="al ' + a.cls + '"><span class="alk">FUEL</span><span class="alw"><b>Fuel check</b> <span class="alc" data-fc="1"></span></span><button type="button" data-act="fc">Done · restart 55:00</button></div>';
          return '<div class="al ' + a.cls + '"><span class="alk">CALL</span><a class="alw" href="#calls"><b>' + esc(a.d.fir) + ' ' + esc(a.d.name) + '</b> by ' + hm(a.d.eet) +
            ' · <span class="alc" data-eet="' + a.d.eet + '"></span><small>' + esc(a.d.text) + '</small></a><button type="button" data-done="' + esc(a.d.id) + '">Done</button></div>';
        }).join('');
        box.hidden = !A.length; layoutVars();
      }
      box.querySelectorAll('.alc').forEach(function (c) {
        if (c.dataset.fc) { var l = fcLeft(); c.textContent = l > 0 ? 'in ' + mmss(l) : 'DUE +' + mmss(-l); } else c.textContent = inTxt(+c.dataset.eet - e);
      });
    }
    var nc = 0; if (live) D.deadlines.forEach(function (d) { var dd = d.eet - e; if (!S.done[d.id] && dd <= 10 && dd >= -15) nc++; });
    badge('calls', nc ? String(nc) : '', A.some(function (a) { return !a.fc && a.cls === 'red'; }) ? 'red' : 'amb');
  }
  function badge(v, txt, cls) {
    var a = document.querySelector('#tabs a[data-v="' + v + '"]'); if (!a) return;
    var b = a.querySelector('.badge'); if (!b) { b = document.createElement('span'); b.className = 'badge'; a.appendChild(b); }
    b.textContent = txt; b.hidden = !txt; b.className = 'badge ' + cls;
  }

  /* ---------- fuel table (only if a page has one; removed from the app 05 NOV 26 - fuel checks are done in the company app) */
  var fb = document.querySelector('#fuel tbody');
  if (fb) D.rows.forEach(function (r) {
    if (r.fmin == null) return;
    var tr = document.createElement('tr');
    tr.innerHTML = '<td>' + (r.eet == null ? '-' : hm(r.eet)) + '</td><td>' + esc(r.wpt) + '</td><td>' + r.fmin.toFixed(1) + '</td><td>' + r.fplan.toFixed(1) + '</td>' +
      '<td><input type="number" inputmode="decimal" step="0.1" min="0" id="fuel-' + r.i + '" aria-label="Actual fuel at ' + esc(r.wpt) + ', tonnes"></td><td class="dmin"></td><td class="dplan"></td><td class="land"></td>';
    var input = tr.querySelector('input');
    if (S.fuel[r.i] != null) input.value = S.fuel[r.i];
    function calc() {
      var a = parseFloat(input.value), c1 = tr.querySelector('.dmin'), c2 = tr.querySelector('.dplan'), c3 = tr.querySelector('.land');
      if (isNaN(a)) { c1.textContent = c2.textContent = c3.textContent = ''; c3.className = 'land'; delete S.fuel[r.i]; save(); return; }
      S.fuel[r.i] = a; save();
      var sg = function (x) { return (x >= 0 ? '+' : '') + x.toFixed(1); };
      var land = a - (r.fplan - D.fuel.dest_plan);
      c1.textContent = sg(a - r.fmin); c2.textContent = sg(a - r.fplan); c3.textContent = land.toFixed(1) + ' t';
      c3.className = 'land ' + (land < D.fuel.mindiv ? 'bad' : (land < D.fuel.mindiv + 1 ? 'warn' : 'ok'));
      c1.className = 'dmin ' + (a < r.fmin ? 'bad' : 'ok');
    }
    input.addEventListener('input', calc); calc();
    fb.appendChild(tr);
  });

  /* ---------- timeline (static parts once, now line moves) */
  var TL = $('timeline'), X0 = 10, X1 = 990, X = function (m) { return X0 + (X1 - X0) * Math.max(0, Math.min(T, m)) / T; };
  if (TL) (function () {
    var s = '';
    D.firs.forEach(function (f, k) {
      var b = k + 1 < D.firs.length ? D.firs[k + 1].eet_min : T;
      s += '<rect x="' + X(f.eet_min) + '" y="8" width="' + (X(b) - X(f.eet_min)) + '" height="22" class="' + f.cls + '"/><text x="' + (X(f.eet_min) + 3) + '" y="23" class="t b">' + esc(f.fir) + '</text>';
    });
    if (D.etops) s += '<rect x="' + X(D.etops[0]) + '" y="32" width="' + (X(D.etops[1]) - X(D.etops[0])) + '" height="6" class="etops"/>';
    for (var h = 0; h <= T; h += 60) s += '<line x1="' + X(h) + '" y1="40" x2="' + X(h) + '" y2="70" class="grid"/><text x="' + X(h) + '" y="88" class="t c">' + hm(h) + '</text>';
    D.events.forEach(function (ev) { s += '<line x1="' + X(ev.eet_min) + '" y1="42" x2="' + X(ev.eet_min) + '" y2="58" class="ev"><title>' + esc(ev.text) + '</title></line>'; });
    D.deadlines.forEach(function (d) { s += '<circle cx="' + X(d.eet) + '" cy="66" r="5" class="dl" data-id="' + d.id + '"><title>' + esc(d.fir + ' by ' + hm(d.eet) + ': ' + d.text) + '</title></circle>'; });
    s += '<line id="tl-now" x1="0" y1="2" x2="0" y2="76" class="nowln"/>';
    TL.innerHTML = s;
  })();

  /* ---------- NOW screen: next action, up-next list, cards */
  var KIND = { call: 'CALL', fir: 'FIR', wpt: 'WPT', level: 'LEVEL', dp: 'DP', etops: 'ETOPS', descent: 'DESCENT', landing: 'LAND', fc: 'FUEL' };
  function items(e) {
    var it = [], live = true, bndEet = {};
    D.rows.forEach(function (r) { if (r.bnd && r.eet != null) bndEet[r.eet] = 1; });
    D.deadlines.forEach(function (d) { if (!S.done[d.id] && d.eet >= e - 15) it.push({ k: 'c:' + d.id, t: d.eet, what: d.fir + ' ' + d.name + ': ' + d.text, kind: 'call', id: d.id }); });
    D.events.forEach(function (ev, i) { if (ev.eet_min > e) it.push({ k: 'e:' + i, t: ev.eet_min, what: ev.text, kind: ev.kind }); });
    D.firs.forEach(function (f) { if (f.eet_min > e && !bndEet[f.eet_min]) it.push({ k: 'f:' + f.fir, t: f.eet_min, what: 'Enter ' + f.fir + ' ' + f.name + ' FIR', kind: 'fir' }); });
    D.rows.forEach(function (r) { if (r.eet != null && r.eet > e) it.push({ k: 'w:' + r.i, t: r.eet, what: r.wpt + (r.bnd ? ' ▶ ' + r.fir + ' ' + r.firname : ''), kind: r.bnd ? 'fir' : 'wpt' }); });
    var left = fcLeft(); if (left !== null) it.push({ k: 'fc', t: e + left / 60, what: 'Fuel check due (55-min timer)', kind: 'fc' });
    it.sort(function (a, b) { return a.t - b.t; });
    return it;
  }
  function stCls(x, e) { var d = x.t - e; if (x.kind === 'call' || x.kind === 'fc') return d < 0 ? 'red' : (d <= 10 ? 'amb' : ''); return ''; }
  function nextRowByTime(e) { for (var k = 0; k < D.rows.length; k++) if (D.rows[k].eet != null && D.rows[k].eet > e) return D.rows[k]; return null; }
  function card(t, k, kc, p) { return '<div class="card"><h4>' + t + '</h4><div class="k ' + (kc || '') + '">' + k + '</div>' + (p ? '<p>' + p + '</p>' : '') + '</div>'; }
  function cdTxt(d) { return d < 0 ? '-' + hm(Math.ceil(-d)) : hm(Math.ceil(d)); }
  function renderNow(e) {
    $('planbanner').hidden = !isPlan();
    var it = items(e), na = it[0];
    var box = $('nextaction'), sig = na ? na.k + stCls(na, e) : 'none';
    if (box._sig !== sig) {
      box._sig = sig;
      box.innerHTML = na ? '<div class="in" data-t="' + na.t + '"></div><div class="what"><span class="tag k-' + na.kind + '">' + (KIND[na.kind] || na.kind.toUpperCase()) + '</span> ' + esc(na.what) + '</div>' +
        '<div class="meta"><span data-meta="1"></span>' + (na.kind === 'call' ? ' <button type="button" data-done="' + esc(na.id) + '">Done</button>' : '') + (na.kind === 'fc' ? ' <button type="button" data-act="fc">Done · restart 55:00</button>' : '') + '</div>'
        : '<div class="what">All planned items passed.</div>';
    }
    if (na) {
      var d0 = na.t - e, inn = box.querySelector('.in');
      inn.textContent = cdTxt(d0); inn.className = 'in ' + stCls(na, e);
      box.querySelector('[data-meta]').textContent = 'Next action · EET ' + hm(na.t) + ' · ' + zt(toMin() + na.t) + (na.kind === 'call' ? ' · call / log-on deadline' : '');
    }
    var ul = $('upnext');
    if (ul) {
      var rest = it.slice(1, 9), us = rest.map(function (x) { return x.k + stCls(x, e); }).join('|');
      if (ul._sig !== us) {
        ul._sig = us;
        ul.innerHTML = rest.map(function (x) {
          return '<li class="un ' + stCls(x, e) + '"><span class="unin" data-t="' + x.t + '"></span><span class="tag k-' + x.kind + '">' + (KIND[x.kind] || x.kind.toUpperCase()) + '</span>' +
            '<span class="unw">' + esc(x.what) + '</span><span class="unz">' + hm(x.t) + ' · ' + zt(toMin() + x.t) + '</span>' +
            (x.kind === 'call' ? '<button type="button" data-done="' + esc(x.id) + '">Done</button>' : '') + '</li>';
        }).join('') || '<li class="un"><span class="unw">Nothing else planned.</span></li>';
      }
      ul.querySelectorAll('.unin').forEach(function (s) { s.textContent = inTxt(+s.dataset.t - e); });
    }
    // cards
    var c = '', nr = nextRowByTime(e);
    var left = fcLeft();
    c += card('Fuel check timer', left === null ? 'not started' : (left > 0 ? mmss(left) : 'DUE +' + mmss(-left)), left === null ? '' : (left <= 0 ? 'red' : (left <= 300 ? 'amb' : 'grn')),
      left === null ? 'tap FUEL CHECK at the top after a fuel check' : 'last check ' + isoZ(S.fc));
    if (nr) c += card('Next waypoint (by time)', esc(nr.wpt) + ' ' + hm(nr.eet), 'mag', inTxt(nr.eet - e) + (S.passed + 1 < D.rows.length && D.rows[S.passed + 1].wpt !== nr.wpt ? ' · ticked next: ' + esc(D.rows[S.passed + 1].wpt) : ''));
    var nf = null; D.firs.forEach(function (f) { if (!nf && f.eet_min > e) nf = f; });
    var cf = curFir(e);
    c += card('FIR', cf ? esc(cf.fir) + ' ' + esc(cf.name) : 'Before ' + esc(D.firs[0].fir), '', nf ? 'next ' + esc(nf.fir) + ' ' + esc(nf.name) + ' at ' + hm(nf.eet_min) + ' · ' + inTxt(nf.eet_min - e) : 'last FIR');
    var eta = toMin() + T;
    var lt = (((eta + F.arr_off * 60) % 1440) + 1440) % 1440;
    c += card('ETA ' + esc(F.arr), zt(eta), '', pad(Math.floor(lt / 60)) + pad(lt % 60) + ' LT · ' + (e >= 0 ? hm(Math.max(0, T - e)) + ' to go' : 'trip ' + hm(T)) + (isPlan() ? ' · planned' : ''));
    var near = D.chain.filter(function (a) { return a.a <= e && e <= a.b && a.cls !== 'CA'; }).map(function (a) { return a.icao + ' ' + a.cls; });
    c += card('Within 1 h (420 NM) now', near.length ? esc(near.slice(0, 4).join(' · ')) : 'none', near.length ? 'grn' : 'red', near.length ? 'OM-C class; CA airports not listed' : 'no D / A1 airport within 420 NM');
    var mx = 0, mw = ''; D.mora.forEach(function (p) { if (p.eet_min >= e && p.eet_min <= e + 30 && p.mora > mx) { mx = p.mora; mw = p.name; } });
    c += card('MORA next 30 min', mx ? mx + ' ft' : '-', mx > 10000 ? 'red' : (mx > 5000 ? 'amb' : ''), mx ? 'highest at ' + esc(mw) : '');
    var lp = null, np = null; D.route.forEach(function (p) { if (p.e <= e) lp = p; else if (!np) np = p; });
    c += card('Navlog (planned)', np ? esc(np.n) + ' ' + hm(np.e) : '-', '', (lp ? 'last ' + esc(lp.n) + ' ' + hm(lp.e) : 'before take-off') + (np ? ' · ' + inTxt(np.e - e) : ''));
    $('nowcards').innerHTML = c;
  }

  /* ---------- clock tick */
  var lastPaint = 0;
  function tick(force) {
    var e = el(), now = new Date();
    $('utc').textContent = pad(now.getUTCHours()) + ':' + pad(now.getUTCMinutes()) + ':' + pad(now.getUTCSeconds());
    var elb = $('elapsed'), box = elb.parentNode;
    box.classList.toggle('plan', isPlan());
    $('el-lab').textContent = isPlan() ? 'PLAN (no T/O)' : (e < 0 ? 'TO T/O' : 'ELAPSED');
    elb.textContent = e > T + 240 ? 'CHECK T/O' : hm(e);
    $('eta').textContent = zt(toMin() + T);
    if (TL) { var x = X(e), nl = $('tl-now'); if (nl) { nl.setAttribute('x1', x); nl.setAttribute('x2', x); nl.style.display = (e >= 0 && e <= T) ? '' : 'none'; } }
    var cn = $('chain-now');
    if (cn) { var vb = cn.ownerSVGElement.viewBox.baseVal, cx = 70 + (1000 - 80) * Math.max(0, Math.min(T, e)) / T; cn.setAttribute('x1', cx); cn.setAttribute('x2', cx); cn.setAttribute('y1', 26); cn.setAttribute('y2', vb.height - 18); cn.style.display = (e >= 0 && e <= T) ? '' : 'none'; }
    document.querySelectorAll('#timeline circle.dl').forEach(function (cc) { cc.classList.toggle('done', !!S.done[cc.dataset.id]); });
    paintFC(); paintAlerts(e); renderNow(e); paintCalls(e);
    if (force || Date.now() - lastPaint > 5000) { paintWpt(); lastPaint = Date.now(); }
    if (globe) globe.tick(e);
  }

  /* ---------- full-screen picture viewer (pinch / drag / double-tap / + - Fit) */
  function viewer() {
    var imgs = document.querySelectorAll('img.zoomable'); if (!imgs.length) return;
    var V = document.createElement('div'); V.className = 'viewer'; V.hidden = true; V.setAttribute('role', 'dialog'); V.setAttribute('aria-modal', 'true');
    V.innerHTML = '<div class="vbar"><b class="vt"></b><span class="vz"></span><button type="button" data-z="out" aria-label="Zoom out">−</button>' +
      '<button type="button" data-z="in" aria-label="Zoom in">+</button><button type="button" data-z="fit">Fit</button><button type="button" data-z="close" class="vclose">Close ✕</button></div>' +
      '<div class="vstage"><img alt="" draggable="false"></div><div class="vhint">Pinch or double-tap to zoom · drag to move</div>';
    document.body.appendChild(V);
    var stage = V.querySelector('.vstage'), im = V.querySelector('img'), s = 1, tx = 0, ty = 0, fit = 1, W = 1, H = 1;
    function clamp() {
      var sw = stage.clientWidth, sh = stage.clientHeight, w = W * s, h = H * s;
      tx = w <= sw ? (sw - w) / 2 : Math.min(0, Math.max(sw - w, tx));
      ty = h <= sh ? (sh - h) / 2 : Math.min(0, Math.max(sh - h, ty));
    }
    function apply() { clamp(); im.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + s + ')'; V.querySelector('.vz').textContent = Math.round(s / fit * 100) + '%'; }
    function maxS() { return Math.max(fit * 8, 2.5); }
    function doFit() { fit = Math.min(stage.clientWidth / W, stage.clientHeight / H); s = fit; tx = ty = 0; apply(); }
    function zoomAt(px, py, ns) { ns = Math.max(fit, Math.min(maxS(), ns)); var ix = (px - tx) / s, iy = (py - ty) / s; s = ns; tx = px - ix * s; ty = py - iy * s; apply(); }
    function open(src, title, w, h) {
      W = w; H = h; im.src = src; im.style.width = W + 'px'; im.style.height = H + 'px';
      V.querySelector('.vt').textContent = title || ''; V.hidden = false; document.documentElement.classList.add('noscroll');
      requestAnimationFrame(doFit);
    }
    function close() { V.hidden = true; document.documentElement.classList.remove('noscroll'); im.removeAttribute('src'); }
    imgs.forEach(function (img) {
      img.tabIndex = 0; img.setAttribute('role', 'button');
      var go = function () { open(img.src, img.dataset.title || img.alt, img.naturalWidth || +img.getAttribute('width'), img.naturalHeight || +img.getAttribute('height')); };
      img.addEventListener('click', go); img.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
      var fz = img.parentNode.querySelector('.figz'); if (fz) fz.addEventListener('click', go);
    });
    V.querySelector('.vbar').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return; var z = b.dataset.z, cx = stage.clientWidth / 2, cy = stage.clientHeight / 2;
      if (z === 'in') zoomAt(cx, cy, s * 1.6); else if (z === 'out') zoomAt(cx, cy, s / 1.6); else if (z === 'fit') doFit(); else if (z === 'close') close();
    });
    var Pp = {}, pinch = null, drag = null, lastTap = 0, lx = 0, ly = 0, moved = false;
    function pt(e) { var r = stage.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    function pts() { return Object.keys(Pp).map(function (k) { return Pp[k]; }); }
    function begin() {
      var a = pts();
      if (a.length >= 2) { pinch = { d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1, s: s, m: { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2 }, tx: tx, ty: ty }; drag = null; }
      else if (a.length === 1) { pinch = null; drag = { x: a[0].x, y: a[0].y, tx: tx, ty: ty }; }
      else { pinch = drag = null; }
    }
    stage.addEventListener('pointerdown', function (e) { try { stage.setPointerCapture(e.pointerId); } catch (x) { } if (!Object.keys(Pp).length) moved = false; Pp[e.pointerId] = pt(e); begin(); });
    stage.addEventListener('pointermove', function (e) {
      if (!Pp[e.pointerId]) return; Pp[e.pointerId] = pt(e); var a = pts();
      if (pinch && a.length >= 2) {
        var d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y), m = { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2 };
        var ns = Math.max(fit, Math.min(maxS(), pinch.s * d / pinch.d)), ix = (pinch.m.x - pinch.tx) / pinch.s, iy = (pinch.m.y - pinch.ty) / pinch.s;
        s = ns; tx = m.x - ix * s; ty = m.y - iy * s; moved = true; apply();
      } else if (drag) {
        var p = Pp[e.pointerId]; if (Math.abs(p.x - drag.x) + Math.abs(p.y - drag.y) > 6) moved = true;
        tx = drag.tx + p.x - drag.x; ty = drag.ty + p.y - drag.y; apply();
      }
    });
    function up(e) {
      var p = Pp[e.pointerId]; if (!p) return; delete Pp[e.pointerId]; begin();
      if (e.type === 'pointerup' && !Object.keys(Pp).length && !moved) {
        var now = Date.now();
        if (now - lastTap < 330 && Math.abs(p.x - lx) < 30 && Math.abs(p.y - ly) < 30) { zoomAt(p.x, p.y, s < fit * 1.8 ? fit * 3 : fit); lastTap = 0; }
        else { lastTap = now; lx = p.x; ly = p.y; }
      }
    }
    stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
    stage.addEventListener('wheel', function (e) { e.preventDefault(); var p = pt(e); zoomAt(p.x, p.y, s * Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
    V.addEventListener('gesturestart', function (e) { e.preventDefault(); });
    document.addEventListener('keydown', function (e) { if (V.hidden) return; if (e.key === 'Escape') close(); else if (e.key === '+' || e.key === '=') zoomAt(stage.clientWidth / 2, stage.clientHeight / 2, s * 1.6); else if (e.key === '-') zoomAt(stage.clientWidth / 2, stage.clientHeight / 2, s / 1.6); });
    window.addEventListener('resize', function () { if (!V.hidden) doFit(); });
  }

  /* ---------- settings: text size, sound, theme, keep screen on, waypoint columns */
  var FS = [0.85, 1, 1.15, 1.3, 1.5];
  function applyFs() { document.documentElement.style.setProperty('--z', P.fs); if ($('fs-v')) $('fs-v').textContent = Math.round(P.fs * 100) + '%'; }
  function stepFs(d) { var i = FS.indexOf(P.fs); if (i < 0) i = 1; P.fs = FS[Math.max(0, Math.min(FS.length - 1, i + d))]; savePrefs(); applyFs(); }
  on('fs-dn', 'click', function () { stepFs(-1); }); on('fs-up', 'click', function () { stepFs(1); });
  on('set-btn', 'click', function () { var s = $('settings'); s.hidden = !s.hidden; this.setAttribute('aria-expanded', String(!s.hidden)); this.classList.toggle('on', !s.hidden); layoutVars(); });
  function applySound() { if ($('sound')) $('sound').textContent = 'Sound alerts: ' + (P.sound ? 'on' : 'off'); }
  on('sound', 'click', function () { P.sound = !P.sound; savePrefs(); applySound(); if (P.sound) { unlockAudio(); chime(1); } });
  on('sound-test', 'click', function () { chime(2, true); });
  function applyTheme() {
    if (P.theme === 'dark' || P.theme === 'light') document.documentElement.setAttribute('data-theme', P.theme); else document.documentElement.removeAttribute('data-theme');
    if ($('theme')) $('theme').textContent = 'Theme: ' + P.theme;
    if (globe) globe.restyle();
  }
  on('theme', 'click', function () { P.theme = P.theme === 'auto' ? 'dark' : (P.theme === 'dark' ? 'light' : 'auto'); savePrefs(); applyTheme(); });
  var lock = null;
  function wake() {
    var b = $('wake'); if (!b) return;
    if (!P.wake) { if (lock) { try { lock.release(); } catch (e) { } lock = null; } b.textContent = 'Keep screen on: off'; return; }
    if (!('wakeLock' in navigator)) { b.textContent = 'Keep screen on: not available here'; return; }
    navigator.wakeLock.request('screen').then(function (l) { lock = l; b.textContent = 'Keep screen on: on'; })
      .catch(function () { b.textContent = 'Keep screen on: not allowed here'; });
  }
  on('wake', 'click', function () { P.wake = !P.wake; savePrefs(); wake(); });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') { tick(true); if (P.wake) wake(); } });
  window.addEventListener('pageshow', function () { tick(true); });

  /* ---------- layout: header / bottom bar heights for the sticky layout and the map height */
  function layoutVars() {
    var t = $('top'), r = document.documentElement.style;
    if (t) r.setProperty('--hdr', t.offsetHeight + 'px');
  }
  window.addEventListener('resize', function () { layoutVars(); applyCols(); });

  /* ---------- views (hash routing): NOW button + the pack sequence strip + prev / next pager */
  var views = {}; document.querySelectorAll('.view').forEach(function (v) { views[v.dataset.view] = v; });
  var navA = document.querySelectorAll('#tabs a, #nowbtn'), strip = $('tabs');
  var SEQ = ['now'], NAME = { now: 'NOW' };
  if (strip) strip.querySelectorAll('a').forEach(function (a) { NAME[a.dataset.v] = a.textContent.trim(); if (a.dataset.v !== 'flights' && views[a.dataset.v]) SEQ.push(a.dataset.v); });
  function pager(h) {
    var pg = $('pager'); if (!pg) return;
    var i = SEQ.indexOf(h); if (i < 0) { pg.innerHTML = ''; return; }
    var p = SEQ[i - 1], n = SEQ[i + 1];
    pg.innerHTML = (p ? '<a href="#' + p + '" class="pprev">◀ ' + esc(NAME[p] || p) + '</a>' : '<span></span>') + (n ? '<a href="#' + n + '" class="pnext">' + esc(NAME[n] || n) + ' ▶</a>' : '<span></span>');
  }
  function show() {
    var h = (location.hash || '').replace('#', '');
    if (!views[h]) h = 'now';
    Object.keys(views).forEach(function (k) { views[k].hidden = (k !== h); });
    navA.forEach(function (a) { var o = a.dataset.v === h; a.classList.toggle('on', o); if (o) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    var cur = strip && strip.querySelector('a.on');
    if (cur) { var sr = strip.getBoundingClientRect(), cr = cur.getBoundingClientRect(); if (cr.left < sr.left || cr.right > sr.right) strip.scrollLeft += (cr.left + cr.width / 2) - (sr.left + sr.width / 2); }
    pager(h); layoutVars(); window.scrollTo(0, 0); tick(true);
    if (h === 'waypoints') setTimeout(function () { jumpNext(false); }, 60);
    if (globe && h === 'route-map') globe.shown();
  }
  window.addEventListener('hashchange', show);

  /* ---------- globe map + picture viewer */
  var gh = $('globe');
  if (gh && D.geo && window.FPGlobe) {
    try { globe = window.FPGlobe(gh, D, { el: el, isPlan: isPlan, toMin: toMin, hm: hm, zt: zt, lastTick: function () { var i = S.passed, t = i >= 0 ? S.times[i] : null; return t ? { i: i, iso: t, wpt: D.rows[i].wpt } : null; } }); window.FPGlobeAPI = globe; } catch (e) { gh.innerHTML = '<div class="msg bad">The map could not start (' + esc(e && e.message) + ').</div>'; globe = null; }
    document.querySelectorAll('.acts li[data-eet]').forEach(function (li) {
      li.tabIndex = 0;
      var go = function () { if (globe) { globe.focusAction(+li.dataset.n); var r = gh.getBoundingClientRect(); window.scrollTo({ top: window.scrollY + r.top - $('top').offsetHeight - 8, behavior: 'smooth' }); } };
      li.addEventListener('click', go); li.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
    });
  }
  viewer();

  applyTheme(); applyFs(); applySound(); applyCols(); show(); if (P.wake) wake();
  setInterval(tick, 1000);
};
