/* fp_live.js - the live layer of the Flight Prep page / app (shared by the artifact page and the offline app).
   FPLive(D) wires the clock, NOW screen, waypoint tracker, calls, fuel, timeline, views, theme and wake lock to the DOM. */
window.FPLive = function (D) {
  'use strict';
  var F = D.flight, T = F.trip;
  var KEY = 'fp:' + F.id;
  function def() { return { to: null, passed: -1, times: {}, done: {}, fuel: {}, theme: 'auto', wake: false }; }
  var S = def();
  try { var raw = localStorage.getItem(KEY); if (raw) S = Object.assign(def(), JSON.parse(raw)); } catch (e) { }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } }
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function hm(m) { var s = m < 0 ? '-' : ''; m = Math.abs(Math.floor(m)); return s + Math.floor(m / 60) + ':' + pad(m % 60); }
  function zt(m) { m = ((Math.round(m) % 1440) + 1440) % 1440; return pad(Math.floor(m / 60)) + pad(m % 60) + 'Z'; }
  function nowMin() { var d = new Date(); return d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60; }
  function nowHHMM() { var d = new Date(); return pad(d.getUTCHours()) + pad(d.getUTCMinutes()); }
  function parseTO(s) { s = String(s || '').replace(/\D/g, ''); if (s.length < 3 || s.length > 4) return null; var h = +s.slice(0, -2), m = +s.slice(-2); return (h > 23 || m > 59) ? null : h * 60 + m; }
  function isPlan() { return parseTO(S.to) === null; }
  function toMin() { var t = parseTO(S.to); return t === null ? F.to_plan : t; }
  // minutes after take-off; negative = take-off still ahead (up to 3 h)
  function el() { var e = nowMin() - toMin(); if (e < 0) e += 1440; if (e > 1440 - 180) e -= 1440; return e; }
  function inTxt(d) { if (d < 0) return 'overdue ' + hm(Math.ceil(-d)); if (d < 1) return 'now'; return 'in ' + (d < 60 ? Math.ceil(d) + ' min' : hm(Math.ceil(d))); }
  function isoZ(iso) { try { var d = new Date(iso); return pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + 'Z'; } catch (e) { return ''; } }

  /* ---------- confirm strip (the viewer has no confirm() dialog) */
  var onYes = null;
  function ask(text, yesLabel, fn) { $('confirm-text').textContent = text; $('confirm-yes').textContent = yesLabel; onYes = fn; $('confirm').hidden = false; }
  $('confirm-yes').addEventListener('click', function () { $('confirm').hidden = true; if (onYes) onYes(); onYes = null; });
  $('confirm-no').addEventListener('click', function () { $('confirm').hidden = true; onYes = null; });

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
  $('airborne').addEventListener('click', function () {
    var n = nowHHMM();
    if (S.to && S.to !== n) ask('Replace T/O ' + S.to + 'Z with ' + n + 'Z (now)?', 'Replace', function () { setTO(n); });
    else setTO(n);
  });

  /* ---------- waypoints table */
  var tb = document.querySelector('#wpt tbody'), nowRow, trs = [];
  D.rows.forEach(function (r) {
    var tr = document.createElement('tr'); tr.tabIndex = 0; tr.setAttribute('role', 'button');
    tr.setAttribute('aria-label', r.wpt + ' - tap when passed');
    if (r.bnd) tr.classList.add('bnd');
    var mc = r.mora == null ? '' : (r.mora > 10000 ? 'red' : (r.mora > 5000 ? 'amb' : ''));
    tr.innerHTML = '<td class="eet">' + (r.eet == null ? esc(r.label || '-') : hm(r.eet)) + '<div class="st"></div></td>' +
      '<td class="wp">' + esc(r.wpt) + '</td><td class="fir ' + r.fc + '">' + (r.bnd ? '▶ ' : '') + esc(r.fir) + '<small>' + esc(r.firname) + '</small></td>' +
      '<td>' + r.call + '</td><td>' + r.cpdlc + '</td><td>' + r.special + '</td><td>' + r.threat + '</td><td>' + r.divert + '</td>' +
      '<td class="mora ' + mc + '">' + (r.mora == null ? '-' : r.mora) + '</td>' +
      '<td class="fu">' + (r.fmin == null ? '-' : r.fmin.toFixed(1) + '<br><b>' + r.fplan.toFixed(1) + '</b>') + '</td>';
    tr.addEventListener('click', function () { tap(r.i); });
    tr.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tap(r.i); } });
    tb.appendChild(tr); trs.push(tr);
  });
  nowRow = document.createElement('tr'); nowRow.className = 'nowline'; nowRow.innerHTML = '<td colspan="10"><div></div></td>';
  function tap(i) {
    if (i <= S.passed) { for (var j = i; j <= S.passed; j++) delete S.times[j]; S.passed = i - 1; }
    else { S.times[i] = new Date().toISOString(); S.passed = i; }
    save(); paintWpt(); tick(true);
  }
  $('undo').addEventListener('click', function () { if (S.passed >= 0) { delete S.times[S.passed]; S.passed--; save(); paintWpt(); tick(true); } });
  $('reset').addEventListener('click', function () { ask('Clear all passed waypoints?', 'Clear', function () { S.passed = -1; S.times = {}; save(); paintWpt(); tick(true); }); });
  function paintWpt() {
    var e = el(), nxt = S.passed + 1;
    D.rows.forEach(function (r, i) {
      var tr = trs[i], st = tr.querySelector('.st'), h = '';
      tr.classList.toggle('passed', i <= S.passed);
      tr.classList.toggle('next', i === nxt);
      if (i <= S.passed) h = S.times[i] ? '<span class="chip ata">✓ ' + isoZ(S.times[i]) + '</span>' : '<span class="chip ata">✓</span>';
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
      nowRow.querySelector('div').textContent = 'NOW ' + hm(e) + (isPlan() ? '  (planned T/O - no T/O set)' : '');
      if (at) tb.insertBefore(nowRow, at); else tb.appendChild(nowRow);
    }
  }

  /* ---------- calls / deadlines */
  var dls = Array.prototype.slice.call(document.querySelectorAll('.dl'));
  document.querySelectorAll('button.done').forEach(function (b) {
    b.addEventListener('click', function () { var id = b.dataset.id; if (S.done[id]) delete S.done[id]; else S.done[id] = new Date().toISOString(); save(); tick(true); });
  });
  function paintCalls(e) {
    dls.forEach(function (li) {
      var cd = li.querySelector('.cd'), eet = +cd.dataset.eet, id = li.dataset.id, done = S.done[id], d = eet - e;
      li.classList.toggle('isdone', !!done); li.classList.toggle('soon', !done && d >= 0 && d <= 10); li.classList.toggle('over', !done && d < 0);
      cd.textContent = done ? 'done ' + isoZ(done) : inTxt(d);
      li.querySelector('.done').textContent = done ? 'Undo' : 'Done';
    });
    var cur = curFir(e);
    document.querySelectorAll('.slop').forEach(function (s) { s.style.outline = (cur && s.dataset.fir === cur.fir) ? '2px solid var(--mag)' : ''; });
  }
  function curFir(e) { var c = null; D.firs.forEach(function (f) { if (f.eet_min <= e) c = f; }); return c; }

  /* ---------- fuel */
  var fb = document.querySelector('#fuel tbody');
  D.rows.forEach(function (r) {
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
  (function () {
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

  /* ---------- NOW screen */
  function nextRowByTime(e) { for (var k = 0; k < D.rows.length; k++) if (D.rows[k].eet != null && D.rows[k].eet > e) return D.rows[k]; return null; }
  function card(t, k, kc, p) { return '<div class="card"><h4>' + t + '</h4><div class="k ' + (kc || '') + '">' + k + '</div>' + (p ? '<p>' + p + '</p>' : '') + '</div>'; }
  function renderNow(e) {
    $('planbanner').hidden = !isPlan();
    // next action: an open call that is overdue (up to 15 min) first, else the earliest upcoming item
    var items = [];
    D.deadlines.forEach(function (d) { if (!S.done[d.id] && d.eet >= e - 15) items.push({ t: d.eet, what: d.fir + ' ' + d.name + ': ' + d.text, kind: 'call' }); });
    D.events.forEach(function (ev) { if (ev.eet_min > e) items.push({ t: ev.eet_min, what: ev.text, kind: ev.kind }); });
    D.firs.forEach(function (f) { if (f.eet_min > e) items.push({ t: f.eet_min, what: 'Enter ' + f.fir + ' ' + f.name + ' FIR', kind: 'fir' }); });
    var nr = nextRowByTime(e); if (nr) items.push({ t: nr.eet, what: 'Waypoint ' + nr.wpt, kind: 'wpt' });
    items.sort(function (a, b) { return a.t - b.t; });
    var na = items[0], d0 = na ? na.t - e : 0;
    $('nextaction').innerHTML = na ? '<div class="in ' + (d0 < 0 ? 'red' : (d0 <= 10 && na.kind === 'call' ? 'amb' : '')) + '">' + (d0 < 0 ? '-' + hm(Math.ceil(-d0)) : hm(Math.ceil(d0))) + '</div>' +
      '<div class="what">' + esc(na.what) + '</div><div class="meta">Next action · EET ' + hm(na.t) + ' · ' + zt(toMin() + na.t) + (na.kind === 'call' ? ' · call / log-on deadline' : '') + '</div>'
      : '<div class="what">All planned items passed.</div>';
    // cards
    var c = '';
    if (nr) c += card('Next waypoint (by time)', esc(nr.wpt) + ' ' + hm(nr.eet), 'mag', inTxt(nr.eet - e) + (S.passed + 1 < D.rows.length && D.rows[S.passed + 1].wpt !== nr.wpt ? ' · ticked next: ' + esc(D.rows[S.passed + 1].wpt) : ''));
    var nf = null; D.firs.forEach(function (f) { if (!nf && f.eet_min > e) nf = f; });
    var cf = curFir(e);
    c += card('FIR', cf ? esc(cf.fir) + ' ' + esc(cf.name) : 'Before ' + esc(D.firs[0].fir), '', nf ? 'next ' + esc(nf.fir) + ' ' + esc(nf.name) + ' at ' + hm(nf.eet_min) + ' · ' + inTxt(nf.eet_min - e) : 'last FIR');
    var nd = null; D.deadlines.forEach(function (d) { if (!nd && !S.done[d.id] && d.eet >= e - 15) nd = d; });
    if (nd) { var dd = nd.eet - e; c += card('Next call / log on', 'by ' + hm(nd.eet), dd < 0 ? 'red' : (dd <= 10 ? 'amb' : ''), esc(nd.fir + ' – ' + nd.text) + ' · ' + inTxt(dd)); }
    var ne = null; D.events.forEach(function (ev) { if (!ne && ev.eet_min > e) ne = ev; });
    if (ne) c += card('Next event', hm(ne.eet_min), ne.kind === 'etops' || ne.kind === 'dp' ? 'amb' : '', esc(ne.text) + ' · ' + inTxt(ne.eet_min - e));
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
    var x = X(e); var nl = $('tl-now'); if (nl) { nl.setAttribute('x1', x); nl.setAttribute('x2', x); nl.style.display = (e >= 0 && e <= T) ? '' : 'none'; }
    var cn = $('chain-now');
    if (cn) { var vb = cn.ownerSVGElement.viewBox.baseVal, cx = 70 + (1000 - 80) * Math.max(0, Math.min(T, e)) / T; cn.setAttribute('x1', cx); cn.setAttribute('x2', cx); cn.setAttribute('y1', 26); cn.setAttribute('y2', vb.height - 18); cn.style.display = (e >= 0 && e <= T) ? '' : 'none'; }
    document.querySelectorAll('#timeline circle.dl').forEach(function (cc) { cc.classList.toggle('done', !!S.done[cc.dataset.id]); });
    renderNow(e); paintCalls(e);
    if (force || Date.now() - lastPaint > 5000) { paintWpt(); lastPaint = Date.now(); }
  }

  /* ---------- views (hash routing) */
  var views = {}; document.querySelectorAll('.view').forEach(function (v) { views[v.dataset.view] = v; });
  var tabs = document.querySelectorAll('.tabs a');
  function show() {
    var h = (location.hash || '').replace('#', ''); if (!views[h]) h = 'now';
    Object.keys(views).forEach(function (k) { views[k].hidden = (k !== h); });
    tabs.forEach(function (a) { a.classList.toggle('on', a.dataset.v === h); if (a.dataset.v === h) a.scrollIntoView({ block: 'nearest', inline: 'nearest' }); });
    window.scrollTo(0, 0); tick(true);
  }
  window.addEventListener('hashchange', show);

  /* ---------- theme + keep screen on */
  function applyTheme() {
    if (S.theme === 'dark' || S.theme === 'light') document.documentElement.setAttribute('data-theme', S.theme); else document.documentElement.removeAttribute('data-theme');
    $('theme').textContent = 'Theme: ' + S.theme;
  }
  $('theme').addEventListener('click', function () { S.theme = S.theme === 'auto' ? 'dark' : (S.theme === 'dark' ? 'light' : 'auto'); save(); applyTheme(); });
  var lock = null;
  function wake() {
    if (!S.wake) { if (lock) { try { lock.release(); } catch (e) { } lock = null; } $('wake').textContent = 'Keep screen on: off'; return; }
    if (!('wakeLock' in navigator)) { $('wake').textContent = 'Keep screen on: not available here'; return; }
    navigator.wakeLock.request('screen').then(function (l) { lock = l; $('wake').textContent = 'Keep screen on: on'; })
      .catch(function () { $('wake').textContent = 'Keep screen on: not allowed here'; });
  }
  $('wake').addEventListener('click', function () { S.wake = !S.wake; save(); wake(); });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') { tick(true); if (S.wake) wake(); } });

  applyTheme(); show(); if (S.wake) wake();
  setInterval(tick, 1000);
};
