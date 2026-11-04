/* fp_globe.js v1.0 (05 NOV 26) - interactive route globe for Flight Prep. Works offline: d3-geo (d3geo.js) + the basemap and
   route data inside the flight file (D.geo). Drag = turn the Earth, pinch / wheel / double-tap = zoom, tap = details.
   The aircraft symbol is the PLANNED position from the OFP EETs and the T/O time - the app does not know the real position. */
window.FPGlobe = function (host, D, L) {
  'use strict';
  var d3 = window.d3;
  if (!d3 || !d3.geoOrthographic) throw new Error('map library (d3-geo) not loaded');
  var G = D.geo, T = D.flight.trip, PI = Math.PI, NM = 3440.065, IF = G.ifbp || null;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var hm = L.hm, zt = L.zt;

  /* ---------- basemap: TopoJSON (quantized, delta-encoded arcs) -> land + internal borders */
  var W0 = G.world, sc = W0.transform.scale, tr = W0.transform.translate;
  var ARCS = W0.arcs.map(function (a) { var x = 0, y = 0; return a.map(function (p) { x += p[0]; y += p[1]; return [x * sc[0] + tr[0], y * sc[1] + tr[1]]; }); });
  function arc(i) { return i < 0 ? ARCS[~i].slice().reverse() : ARCS[i]; }
  function ring(ids) { var r = []; for (var k = 0; k < ids.length; k++) { var a = arc(ids[k]); r = r.concat(k ? a.slice(1) : a); } return r; }
  function geom(g) { return g.type === 'Polygon' ? { type: 'Polygon', coordinates: g.arcs.map(ring) } : { type: 'MultiPolygon', coordinates: g.arcs.map(function (p) { return p.map(ring); }) }; }
  var LAND = geom(W0.land), cnt = {};
  W0.countries.forEach(function (g) {
    var seen = {};
    (g.type === 'Polygon' ? [g.arcs] : g.arcs).forEach(function (p) { p.forEach(function (rr) { rr.forEach(function (i) { var j = i < 0 ? ~i : i; if (!seen[j]) { seen[j] = 1; cnt[j] = (cnt[j] || 0) + 1; } }); }); });
  });
  var BORD = { type: 'MultiLineString', coordinates: Object.keys(cnt).filter(function (j) { return cnt[j] > 1; }).map(function (j) { return ARCS[j]; }) };
  var SPHERE = { type: 'Sphere' }, GRAT = d3.geoGraticule10();
  G.fir.forEach(function (f) { f.geo = { type: 'MultiLineString', coordinates: f.lines }; });
  /* IFBP area: FIR polygons where the map data has them (winding fixed for d3) + the IFBP part of the route */
  if (IF) IF.polys.forEach(function (q) {
    q.f = { type: 'MultiPolygon', coordinates: q.rings.map(function (r) { var g = { type: 'Polygon', coordinates: [r] }; return d3.geoArea(g) > 2 * Math.PI ? [r.slice().reverse()] : [r]; }) };
  });
  function inIfbp(e) { if (!IF) return null; for (var j = 0; j < IF.segs.length; j++) { var g = IF.segs[j]; if (e >= g.w && e <= g.b) return g; } return null; }
  var RINGS = G.apt.filter(function (a) { return a.ring; }).map(function (a) { return { a: a, geo: d3.geoCircle().center([a.lon, a.lat]).radius(420 / 60).precision(2)() }; });

  /* ---------- route model: position, distance and leg at any EET */
  var RT = G.route, RC = RT.map(function (p) { return [p.lon, p.lat]; }), ROUTE = { type: 'LineString', coordinates: RC };
  var CUM = [0]; for (var i = 1; i < RC.length; i++) CUM.push(CUM[i - 1] + d3.geoDistance(RC[i - 1], RC[i]) * NM);
  var TE = RT[RT.length - 1].e;
  function seg(e) {
    e = Math.max(0, Math.min(TE, e));
    var k = 0; while (k < RT.length - 2 && RT[k + 1].e <= e) k++;
    var a = RT[k], b = RT[k + 1], f = b.e > a.e ? (e - a.e) / (b.e - a.e) : 1;
    return { k: k, f: Math.max(0, Math.min(1, f)) };
  }
  function posAt(e) { var s = seg(e); return d3.geoInterpolate(RC[s.k], RC[s.k + 1])(s.f); }
  function distAt(e) { var s = seg(e); return CUM[s.k] + s.f * (CUM[s.k + 1] - CUM[s.k]); }
  function subLine(e1, e2) { var a = seg(e1), b = seg(e2), c = [posAt(e1)]; for (var j = a.k + 1; j <= b.k; j++) c.push(RC[j]); c.push(posAt(e2)); return { type: 'LineString', coordinates: c }; }
  function firAt(e) { var c = null; D.firs.forEach(function (f) { if (f.eet_min <= e) c = f; }); return c; }
  function rowOf(n) { for (var j = 0; j < D.rows.length; j++) if (D.rows[j].wpt === n) return D.rows[j]; return null; }

  /* ---------- DOM */
  var LAY = { ifbp: 'IFBP area', rings: 'Rings 420 NM', fir: 'FIR lines', apt: 'Airports', wpt: 'Waypoint names', acts: 'Action points', cty: 'Borders' };
  if (!IF) delete LAY.ifbp;
  var lay = { ifbp: false, rings: true, fir: true, apt: true, wpt: true, acts: true, cty: true };
  try { var ls = localStorage.getItem('fpapp:glay'); if (ls) lay = Object.assign(lay, JSON.parse(ls)); } catch (e) { }
  host.innerHTML =
    '<div class="gwrap"><canvas class="gcv" role="img" aria-label="Interactive route map. Drag to turn the Earth, pinch or double-tap to zoom, tap a symbol for details."></canvas>' +
    '<div class="gbadge">✈ = planned position (OFP EET + your T/O) · not GPS</div>' +
    '<div class="gctl"><button type="button" data-g="in" aria-label="Zoom in">+</button><button type="button" data-g="out" aria-label="Zoom out">−</button>' +
    '<button type="button" data-g="route">Route</button><button type="button" data-g="follow">✈ Follow</button><button type="button" data-g="gps" aria-label="Use the iPad GPS position">◎ GPS</button><button type="button" data-g="full" aria-label="Full screen">⤢</button></div>' +
    '<div class="gpop" hidden><button type="button" class="gpx" aria-label="Close details">✕</button><div class="gpb"></div></div></div>' +
    '<div class="gbar"><button type="button" data-g="live" class="glive">LIVE</button><button type="button" data-g="play" class="gplay" aria-label="Play the flight">▶</button>' +
    '<input type="range" class="gsl" min="0" max="' + T + '" step="1" value="0" aria-label="Time after take-off (preview)"><div class="gtime"><b></b><small></small><small class="ggps" hidden></small></div></div>' +
    '<div class="glay">' + Object.keys(LAY).map(function (k) { return '<button type="button" class="chipbtn" data-lay="' + k + '" aria-pressed="' + lay[k] + '">' + LAY[k] + '</button>'; }).join('') + '</div>';
  var wrap = host.querySelector('.gwrap'), cv = host.querySelector('canvas'), ctx = cv.getContext('2d');
  var sl = host.querySelector('.gsl'), tb = host.querySelector('.gtime b'), ts = host.querySelector('.gtime small'), pop = host.querySelector('.gpop'), gg = host.querySelector('.ggps'), badge = host.querySelector('.gbadge');
  var proj = d3.geoOrthographic().clipAngle(90).precision(0.5), path = d3.geoPath(proj, ctx);
  var W = 0, H = 0, DPR = 1, r0 = 100, k = 1, rot = [0, 0, 0], inited = false, raf = 0;
  var mode = 'live', pv = 0, playing = 0, follow = false, HITS = [];
  var PLANE = typeof Path2D !== 'undefined' ? new Path2D('M0,-15C1.7,-15 2.2,-12 2.2,-9.5L2.2,-3.5L14,3L14,6L2.2,2.6L2.2,9L5.5,12L5.5,14.2L0,12.8L-5.5,14.2L-5.5,12L-2.2,9L-2.2,2.6L-14,6L-14,3L-2.2,-3.5L-2.2,-9.5C-2.2,-12 -1.7,-15 0,-15Z') : null;

  var C = null, Ct = 0;
  function colors() {
    if (C && Date.now() - Ct < 3000) return C;
    var cs = getComputedStyle(document.documentElement), v = function (n, d) { return (cs.getPropertyValue(n) || '').trim() || d; };
    C = { bg: v('--panel', '#181c24'), ocean: v('--map-ocean', '#10202f'), land: v('--map-land', '#2c3139'), coast: v('--map-coast', '#46505c'), border: v('--map-border', '#5d6672'),
      grat: v('--map-grat', 'rgba(255,255,255,.07)'), fir: v('--map-fir', '#e5534b'), route: v('--map-route', '#f1f5fa'), text: v('--fg', '#e9eef5'), muted: v('--muted', '#9aa5b4'),
      halo: v('--map-halo', 'rgba(8,14,22,.9)'), mag: v('--mag', '#e46bd8'), grn: v('--grn', '#5ccb72'), amb: v('--amb', '#f2b33d'), etops: v('--map-etops', '#e8832a'),
      apt: v('--map-apt', '#8c96a3'), font: v('--body', 'system-ui, sans-serif') };
    Ct = Date.now(); return C;
  }
  function visible() { return !!(host.offsetParent || host.classList.contains('gfull')); }
  function req() { if (!raf) raf = requestAnimationFrame(draw); }
  function center() { return [-rot[0], -rot[1]]; }
  function clampK(x) { return Math.max(0.75, Math.min(48, x)); }
  function clampLat(y) { return Math.max(-89, Math.min(89, y)); }

  /* ---------- sizing + initial view (whole route) */
  function size() {
    var r = wrap.getBoundingClientRect(), w = Math.round(r.width), h = Math.round(r.height);
    if (!w || !h) return;
    if (w !== W || h !== H) {
      W = w; H = h; DPR = Math.min(window.devicePixelRatio || 1, 2.5);
      cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR); cv.style.width = W + 'px'; cv.style.height = H + 'px';
      r0 = Math.min(W, H) / 2 - 6;
      if (!inited) { fitRoute(false); inited = true; }
    }
    req();
  }
  function routeView() {
    var c = d3.geoCentroid(ROUTE), R = [-c[0], -c[1], 0];
    var p = d3.geoOrthographic().clipAngle(90).rotate(R).translate([0, 0]).scale(1), b = d3.geoPath(p).bounds(ROUTE);
    var bw = Math.max(1e-6, b[1][0] - b[0][0]), bh = Math.max(1e-6, b[1][1] - b[0][1]);
    var S = Math.min((W - 160) / bw, (H - 120) / bh), mx = (b[0][0] + b[1][0]) / 2, my = (b[0][1] + b[1][1]) / 2;
    var cc = p.invert([mx + 40 / S, my - 10 / S]) || c;   // keep the route clear of the buttons (right) and the badge (top)
    return { c: cc, k: clampK(S / r0) };
  }
  function fitRoute(anim) { var v = routeView(); if (anim) fly(v.c, v.k, 600); else { rot = [-v.c[0], -v.c[1], 0]; k = v.k; } }
  var anim = 0;
  function fly(c, nk, ms) {
    var c0 = center(), k0 = k, ip = d3.geoInterpolate(c0, c), t0 = performance.now(); cancelAnimationFrame(anim);
    function step(t) {
      var u = Math.min(1, (t - t0) / ms), q = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2, p = ip(q);
      rot = [-p[0], clampLat(-p[1]), 0]; k = k0 * Math.pow(nk / k0, q); draw();
      if (u < 1) anim = requestAnimationFrame(step);
    }
    anim = requestAnimationFrame(step);
  }

  /* ---------- time: LIVE follows the clock; slider / play = preview */
  function curE() { return mode === 'live' ? L.el() : pv; }
  function stopPlay() { if (playing) { clearInterval(playing); playing = 0; host.querySelector('.gplay').textContent = '▶'; } }
  function setMode(m) { mode = m; host.querySelector('.glive').classList.toggle('on', m === 'live'); if (m === 'live') stopPlay(); updBar(); req(); }
  function updBar() {
    var e = curE(), eC = Math.max(0, Math.min(T, e)), toM = L.toMin(), plan = L.isPlan();
    if (document.activeElement !== sl) sl.value = Math.round(eC);
    var s = seg(eC), a = RT[s.k], b = RT[Math.min(RT.length - 1, s.k + 1)];
    if (e < 0) { tb.textContent = 'On ground'; ts.textContent = 'T/O in ' + hm(Math.ceil(-e)) + ' · ' + (plan ? 'planned T/O ' : 'T/O ') + zt(toM); }
    else if (e > T) { tb.textContent = 'Landed (planned)'; ts.textContent = RT[RT.length - 1].n + ' ' + zt(toM + T); }
    else {
      tb.textContent = (mode === 'live' ? '' : 'PREVIEW ') + '+' + hm(e) + ' · ' + zt(toM + e);
      ts.textContent = a.n + ' ' + hm(a.e) + ' → ' + b.n + ' ' + hm(b.e) + ' · ' + Math.round(CUM[CUM.length - 1] - distAt(eC)).toLocaleString('en-GB') + ' NM to go' + (inIfbp(eC) ? ' · IFBP 126.9' : '') + (plan && mode === 'live' ? ' · no T/O set (planned)' : '');
    }
    gg.hidden = !GPS.on; if (GPS.on) { var gf = gpsFix(); gg.textContent = gf ? 'GPS ' + gpsLine(gf) : 'GPS: ' + (GPS.msg || 'no recent fix'); }
    badge.textContent = GPS.on ? '✈ magenta = planned (OFP EET + T/O) · cyan = iPad GPS' : '✈ = planned position (OFP EET + your T/O) · not GPS';
  }
  sl.addEventListener('input', function () { stopPlay(); pv = +sl.value; setMode('preview'); if (follow) centerPlane(false); });
  function centerPlane(animate) { var gf = mode === 'live' ? gpsFix() : null, p = gf ? [gf.lon, gf.lat] : posAt(Math.max(0, Math.min(T, curE()))); if (animate) fly(p, Math.max(k, 3), 500); else { rot = [-p[0], clampLat(-p[1]), 0]; req(); } }
  function setFollow(f) { follow = f; host.querySelector('[data-g="follow"]').classList.toggle('on', f); if (f) centerPlane(true); }

  host.addEventListener('click', function (ev) {
    var b = ev.target.closest('button'); if (!b || !host.contains(b)) return;
    var g = b.dataset.g;
    if (b.dataset.lay) {
      var key = b.dataset.lay; lay[key] = !lay[key]; b.setAttribute('aria-pressed', String(lay[key])); try { localStorage.setItem('fpapp:glay', JSON.stringify(lay)); } catch (e) { }
      if (key === 'ifbp') showPop(lay.ifbp ? '<b class="gph">IFBP area on</b><div>Cyan = IFBP 126.9 (area and the IFBP part of the route; lighter = 10-min listening watch before entry). Tap it for the procedure.</div><button type="button" data-g="ifbp">Show the IFBP procedure</button>' : null);
      req(); return;
    }
    if (b.classList.contains('gpx')) { pop.hidden = true; req(); return; }
    if (g === 'in') { cancelAnimationFrame(anim); k = clampK(k * 1.6); req(); }
    else if (g === 'out') { cancelAnimationFrame(anim); k = clampK(k / 1.6); req(); }
    else if (g === 'route') { setFollow(false); fitRoute(true); }
    else if (g === 'follow') setFollow(!follow);
    else if (g === 'full') {
      var f = host.classList.toggle('gfull'); document.documentElement.classList.toggle('noscroll', f); b.textContent = f ? '✕' : '⤢'; b.setAttribute('aria-label', f ? 'Close full screen' : 'Full screen');
      setTimeout(size, 30);
    }
    else if (g === 'ifbp') showPop(ifbpHtml(), true, 'ifbp');
    else if (g === 'gps') gpsSet(!GPS.on);
    else if (g === 'flplan') { setFL(''); refreshPop(true); }
    else if (g === 'live') setMode('live');
    else if (g === 'play') {
      if (playing) { stopPlay(); return; }
      if (mode === 'live') pv = Math.max(0, Math.min(T, curE()));
      if (pv >= T) pv = 0;
      setMode('preview'); b.textContent = '❚❚';
      playing = setInterval(function () { pv = Math.min(T, pv + T / 600); if (pv >= T) stopPlay(); if (follow) centerPlane(false); updBar(); req(); }, 50);
    }
  });

  /* ---------- gestures */
  var ptrs = {}, gest = null, moved = false, tapT = 0, tapX = 0, tapY = 0, tapTimer = 0;
  function pxy(e) { var r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  function plist() { return Object.keys(ptrs).map(function (id) { return ptrs[id]; }); }
  function begin() {
    var a = plist();
    if (a.length >= 2) gest = { pinch: true, d: Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]) || 1, k: k, m: [(a[0][0] + a[1][0]) / 2, (a[0][1] + a[1][1]) / 2], rot: rot.slice() };
    else if (a.length === 1) gest = { pinch: false, p: a[0].slice(), rot: rot.slice() };
    else gest = null;
  }
  cv.addEventListener('pointerdown', function (e) { try { cv.setPointerCapture(e.pointerId); } catch (x) { } if (!plist().length) moved = false; ptrs[e.pointerId] = pxy(e); cancelAnimationFrame(anim); begin(); });
  cv.addEventListener('pointermove', function (e) {
    if (!ptrs[e.pointerId] || !gest) return; ptrs[e.pointerId] = pxy(e); var a = plist(), s;
    if (gest.pinch && a.length >= 2) {
      var m = [(a[0][0] + a[1][0]) / 2, (a[0][1] + a[1][1]) / 2];
      k = clampK(gest.k * Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]) / gest.d); s = 180 / (PI * r0 * k);
      rot = [gest.rot[0] + (m[0] - gest.m[0]) * s, clampLat(gest.rot[1] - (m[1] - gest.m[1]) * s), 0]; moved = true;
    } else if (!gest.pinch) {
      var p = ptrs[e.pointerId], dx = p[0] - gest.p[0], dy = p[1] - gest.p[1];
      if (!moved && Math.abs(dx) + Math.abs(dy) < 6) return;
      moved = true; s = 180 / (PI * r0 * k); rot = [gest.rot[0] + dx * s, clampLat(gest.rot[1] - dy * s), 0];
    }
    if (moved && follow) setFollow(false);
    req();
  });
  function up(e) {
    var p = ptrs[e.pointerId]; if (!p) return; delete ptrs[e.pointerId]; begin();
    if (e.type !== 'pointerup' || moved || plist().length) return;
    var now = Date.now();
    if (now - tapT < 330 && Math.abs(p[0] - tapX) < 30 && Math.abs(p[1] - tapY) < 30) {
      clearTimeout(tapTimer); tapT = 0; var g = proj.invert(p); if (g) fly(g, clampK(k * 2), 350);
    } else { tapT = now; tapX = p[0]; tapY = p[1]; clearTimeout(tapTimer); tapTimer = setTimeout(function () { hit(p); }, 280); }
  }
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', function (e) { e.preventDefault(); cancelAnimationFrame(anim); k = clampK(k * Math.exp(-e.deltaY * 0.0015)); req(); }, { passive: false });
  cv.addEventListener('gesturestart', function (e) { e.preventDefault(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && host.classList.contains('gfull')) host.querySelector('[data-g="full"]').click(); });

  /* ---------- details popup */
  function showPop(h, wide, kind) { if (!h) { pop.hidden = true; pop.dataset.kind = ''; req(); return; } pop.querySelector('.gpb').innerHTML = h; pop.classList.toggle('wide', !!wide); pop.dataset.kind = kind || ''; pop.hidden = false; pop.scrollTop = 0; req(); }
  function hit(p) {
    var best = null, bd = 26;
    HITS.forEach(function (h) { if (h.lo) return; var d = Math.hypot(h.x - p[0], h.y - p[1]) - (h.r || 0); if (d < bd) { bd = d; best = h; } });
    if (!best) { bd = 16; HITS.forEach(function (h) { if (!h.lo) return; var d = Math.hypot(h.x - p[0], h.y - p[1]); if (d < bd) { bd = d; best = h; } }); }
    if (!best && IF && lay.ifbp) { var g = proj.invert(p); if (g && vis(g) && IF.polys.some(function (q) { return d3.geoContains(q.f, g); })) best = { html: ifbpHtml }; }
    showPop(best ? best.html() : null, best && best.html === ifbpHtml, best && best.html === ifbpHtml ? 'ifbp' : (best && best.html === gpsHtml ? 'gps' : ''));
  }
  function tz(e) { return hm(e) + ' · ' + zt(L.toMin() + e); }
  function wptHtml(w) {
    var r = rowOf(w.n), f = firAt(w.e), h = '<b class="gph">' + esc(w.n) + '</b><div>EET ' + tz(w.e) + (f ? ' · FIR ' + esc(f.fir) + ' ' + esc(f.name) : '') + '</div>';
    if (w.note) h += '<div>' + esc(w.note) + '</div>';
    if (r) { h += '<div class="gpr">' + (r.call ? '<b>Call:</b> ' + r.call + '<br>' : '') + (r.special ? '<b>Special:</b> ' + r.special + '<br>' : '') + (r.threat ? '<b>Threat:</b> ' + r.threat + '<br>' : '') + (r.mora != null ? '<b>MORA:</b> ' + r.mora + ' ft' : '') + '</div>'; }
    return h + '<div class="gpn">' + Math.round(CUM[RT.indexOf(w)]).toLocaleString('en-GB') + ' NM from ' + esc(RT[0].n) + ' · ' + Math.round(CUM[CUM.length - 1] - CUM[RT.indexOf(w)]).toLocaleString('en-GB') + ' NM to go</div>';
  }
  function aptHtml(a) {
    var ch = D.chain.filter(function (c) { return c.icao === a.icao; });
    return '<b class="gph">' + esc(a.lab) + '</b>' + (ch.length ? '<div>Within 420 NM (1 h): ' + ch.map(function (c) { return hm(c.a) + '–' + hm(c.b) + ' (' + esc(c.cls) + (c.note ? ', ' + esc(c.note) : '') + ')'; }).join('; ') + '</div>' : '') +
      (a.wx ? '<div>' + esc(a.wx) + '</div>' : '') + '<div class="gpn">' + a.lat.toFixed(2) + ', ' + a.lon.toFixed(2) + '</div>';
  }
  function planeHtml() {
    var e = curE(), eC = Math.max(0, Math.min(T, e)), s = seg(eC), a = RT[s.k], b = RT[Math.min(RT.length - 1, s.k + 1)], f = firAt(eC);
    return '<b class="gph">✈ Planned position ' + (mode === 'live' ? '' : '(preview) ') + '+' + hm(eC) + ' · ' + zt(L.toMin() + eC) + '</b>' +
      '<div>Between ' + esc(a.n) + ' (' + hm(a.e) + ') and ' + esc(b.n) + ' (' + hm(b.e) + ')' + (f ? ' · FIR ' + esc(f.fir) + ' ' + esc(f.name) : '') + '</div>' +
      '<div>' + Math.round(CUM[CUM.length - 1] - distAt(eC)).toLocaleString('en-GB') + ' NM to go (planned track)</div>' +
      '<div class="gpn">From the OFP EETs and ' + (L.isPlan() ? 'the planned T/O (no T/O set)' : 'your T/O time') + ' – not GPS.</div>';
  }
  var DIRS = ['NORTH', 'NORTHEAST', 'EAST', 'SOUTHEAST', 'SOUTH', 'SOUTHWEST', 'WEST', 'NORTHWEST'];
  function brg(a, b) { var r = PI / 180, y = Math.sin((b[0] - a[0]) * r) * Math.cos(b[1] * r), x = Math.cos(a[1] * r) * Math.sin(b[1] * r) - Math.sin(a[1] * r) * Math.cos(b[1] * r) * Math.cos((b[0] - a[0]) * r); return (Math.atan2(y, x) / r + 360) % 360; }
  function levelAt(e) { var fl = null, first = null; D.events.forEach(function (ev) { var m = /FL(\d{3})/.exec(ev.text); if (ev.kind !== 'level' || !m) return; if (!first) first = m[1]; if (ev.eet_min <= e) fl = m[1]; }); return fl ? 'FL' + fl : (first ? 'CLIMBING FL' + first : 'FL[xxx]'); }
  /* ---------- position for the IFBP broadcast: iPad GPS (installed app) > last waypoint you ticked > plan */
  var GPS = { on: false, fix: null, msg: '', wid: null };
  function mod(ms) { var d = new Date(ms); return d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60; }
  function hh(m) { return zt(m).replace('Z', ''); }
  function gpsFix() { var f = GPS.fix; return GPS.on && f && Date.now() - f.t < 180000 && f.acc < 5000 ? f : null; }
  function gpsSet(on) {
    GPS.on = on; try { localStorage.setItem('fpapp:gps', on ? '1' : '0'); } catch (e) { }
    host.querySelector('[data-g="gps"]').classList.toggle('on', on);
    if (on) {
      if (!navigator.geolocation) GPS.msg = 'no location service on this device';
      else {
        GPS.msg = 'waiting for a fix…';
        try {
          GPS.wid = navigator.geolocation.watchPosition(function (p) {
            var c = p.coords; GPS.fix = { lat: c.latitude, lon: c.longitude, acc: c.accuracy, spd: c.speed, hdg: c.heading, t: Date.now() }; GPS.msg = '';
            updBar(); refreshPop(false); req();
          }, function (er) {
            GPS.msg = er.code === 1 ? 'location not allowed here (works in the installed app – allow Location for it)' : (er.code === 2 ? 'no GPS fix (a Wi-Fi-only iPad has no GPS)' : 'no fix yet – still trying');
            updBar(); refreshPop(false);
          }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 });
        } catch (e) { GPS.msg = 'location not available here'; }
      }
    } else { if (GPS.wid != null && navigator.geolocation) navigator.geolocation.clearWatch(GPS.wid); GPS.wid = null; GPS.fix = null; GPS.msg = ''; }
    updBar(); req(); refreshPop(true);
  }
  function snap(ll) {   // nearest leg of the planned route: along-track / cross-track (NM)
    var best = null, r = PI / 180;
    for (var i = 0; i < RC.length - 1; i++) {
      var A = RC[i], B = RC[i + 1], d12 = d3.geoDistance(A, B); if (!d12) continue;
      var d13 = d3.geoDistance(A, ll), dt = (brg(A, ll) - brg(A, B)) * r;
      var xt = Math.asin(Math.max(-1, Math.min(1, Math.sin(d13) * Math.sin(dt)))), at = Math.acos(Math.max(-1, Math.min(1, Math.cos(d13) / Math.cos(xt)))) * (Math.cos(dt) < 0 ? -1 : 1);
      var dist = at < 0 ? d13 : (at > d12 ? d3.geoDistance(B, ll) : Math.abs(xt));
      if (!best || dist * NM < best.dist) best = { k: i, at: Math.max(0, Math.min(d12, at)) * NM, xt: xt * NM, dist: dist * NM, len: d12 * NM };
    }
    return best;
  }
  function gsOf(f, s) { var kt = f.spd != null && !isNaN(f.spd) ? f.spd * 1.94384 : 0; return kt > 60 ? { v: kt, gps: true } : { v: s.len / Math.max(1, RT[s.k + 1].e - RT[s.k].e) * 60, gps: false }; }
  function gpsLine(f) { var s = snap([f.lon, f.lat]), g = gsOf(f, s); return hh(mod(f.t)) + 'Z ±' + Math.round(f.acc) + ' m · GS ' + Math.round(g.v) + ' kt' + (g.gps ? '' : ' (planned)') + ' · ' + Math.round(Math.abs(s.xt)) + ' NM ' + (s.xt >= 0 ? 'right' : 'left') + ' of track'; }
  function legAwy(i) { var a = RT[i], b = RT[Math.min(RT.length - 1, i + 1)]; return a.aw === 'DCT' ? 'DIRECT ' + b.n : (a.aw ? 'ON ' + a.aw : 'ON [airway]'); }
  function dirOf(deg) { return DIRS[Math.round(deg / 45) % 8]; }
  var FLK = 'fpapp:fl:' + D.flight.id, FLX = '';
  try { FLX = localStorage.getItem(FLK) || ''; } catch (e) { }
  function setFL(v) { FLX = String(v || '').replace(/\D/g, '').slice(0, 3); try { localStorage.setItem(FLK, FLX); } catch (e) { } }
  function rpt(eC) {
    var R = null, now = Date.now(), toM = L.toMin();
    var f = mode === 'live' ? gpsFix() : null;
    if (f) {
      var ll = [f.lon, f.lat], s = snap(ll), a = RT[s.k], b = RT[s.k + 1], gs = gsOf(f, s), tF = mod(f.t);
      var dA = d3.geoDistance(RC[s.k], ll) * NM, nI = s.k + 1, pos;
      if (dA <= 5) pos = a.n;
      else if (d3.geoDistance(ll, RC[s.k + 1]) * NM <= 5) { pos = b.n; nI = Math.min(RT.length - 1, s.k + 2); }
      else pos = Math.round(dA) + ' NM ' + dirOf(brg(RC[s.k], ll)) + ' OF ' + a.n;
      var nx = RT[nI], fo = RT[Math.min(RT.length - 1, nI + 1)];
      var trk = f.hdg != null && !isNaN(f.hdg) && gs.gps ? f.hdg : brg(RC[nI - 1], RC[nI]);
      R = { src: 'gps', e: a.e + (b.e - a.e) * (s.len ? s.at / s.len : 0), pos: pos, t: tF, next: nx.n, nextT: tF + d3.geoDistance(ll, RC[nI]) * NM / gs.v * 60, foll: fo.n, trk: trk, awy: legAwy(nI - 1),
            info: 'iPad GPS ' + gpsLine(f) + '. Estimate = distance to ' + nx.n + ' ÷ ' + (gs.gps ? 'GPS ground speed' : 'planned speed') + '.' };
    }
    if (!R && mode === 'live' && L.lastTick) {
      var tk = L.lastTick(), ri = -1;
      if (tk) for (var j = 0; j < RT.length; j++) if (RT[j].n === tk.wpt) { ri = j; break; }
      if (tk && ri >= 0 && ri < RT.length - 1) {
        var tA = mod(Date.parse(tk.iso)), dl = tA - (toM + RT[ri].e); dl = ((dl + 720) % 1440 + 1440) % 1440 - 720;   // minutes late (+) / early (-) on the plan
        var eA = mod(now) - toM - dl; eA = ((eA + 720) % 1440 + 1440) % 1440 - 720; eA = Math.max(RT[ri].e, Math.min(T, eA));
        var sk = Math.max(ri, seg(eA).k), q0 = RT[sk], q1 = RT[Math.min(RT.length - 1, sk + 1)], q2 = RT[Math.min(RT.length - 1, sk + 2)];
        var dtx = Math.round(dl) === 0 ? 'on time' : (dl > 0 ? Math.round(dl) + ' min late' : Math.round(-dl) + ' min early') + ' on the plan';
        R = { src: 'tick', e: eA, pos: q0.n, t: sk === ri ? tA : toM + q0.e + dl, next: q1.n, nextT: toM + q1.e + dl, foll: q2.n, trk: brg(RC[sk], RC[Math.min(RC.length - 1, sk + 1)]), awy: legAwy(sk),
              info: 'From your last waypoint tick: ' + tk.wpt + ' at ' + hh(tA) + 'Z (' + dtx + '). ' + (sk === ri ? '' : q0.n + ' and the estimates = planned times ' + (Math.round(dl) ? (dl > 0 ? '+' : '−') + Math.abs(Math.round(dl)) + ' min' : '') + '. ') + 'Tick the waypoints as you pass them, or use GPS.' };
      }
    }
    if (!R) {
      var sg = seg(eC), p0 = RT[sg.k], p1 = RT[Math.min(RT.length - 1, sg.k + 1)], p2 = RT[Math.min(RT.length - 1, sg.k + 2)];
      R = { src: 'plan', e: eC, pos: p0.n, t: toM + p0.e, next: p1.n, nextT: toM + p1.e, foll: p2.n, trk: brg(RC[sg.k], RC[Math.min(RC.length - 1, sg.k + 1)]), awy: legAwy(sg.k),
            info: (mode === 'live' ? 'No GPS fix and no waypoint ticked yet. ' : 'Preview. ') +
              'Planned values: OFP EETs from ' + (L.isPlan() ? 'the planned T/O (no T/O set)' : 'your T/O') + '.' };
    }
    var fr = firAt(R.e); R.fir = fr ? fr.name.toUpperCase() : '[FIR]';
    R.fl = FLX ? 'FL' + FLX : levelAt(R.e); R.flPlan = levelAt(R.e);
    return R;
  }
  function draftOf(R) {
    var cs = D.flight.callsign, dir = dirOf(R.trk);
    return 'ALL STATIONS, THIS IS ' + cs + ' IN THE ' + R.fir + ' FIR, POSITION ' + R.pos + ' AT ' + hh(R.t) + ', ' + R.fl + ', ' + dir + 'BOUND ' + R.awy +
      ', ESTIMATING ' + R.next + ' AT ' + hh(R.nextT) + ', ' + R.foll + ' NEXT. ' + cs + ', ' + R.fl + ', ' + dir + 'BOUND, ' + R.fir + ' FIR.';
  }
  var SRC = { gps: 'Actual position – iPad GPS', tick: 'Actual – your last waypoint tick', plan: 'Planned position (no actual position available)' };
  function draftBox(R) {
    return '<div class="gpsrc s-' + R.src + '"><b data-srcb>' + SRC[R.src] + '</b> <span data-srci>' + esc(R.info) + '</span></div>' +
      '<div class="gpfl"><label>Actual FL <input class="gfl" inputmode="numeric" maxlength="3" placeholder="' + R.flPlan.replace(/\D/g, '') + '" value="' + esc(FLX) + '" aria-label="Actual flight level"></label>' +
      '<span>' + (FLX ? 'typed by you' : 'empty = planned ' + esc(R.flPlan)) + '</span>' + (FLX ? '<button type="button" data-g="flplan">Use plan</button>' : '') + (GPS.on ? '' : '<button type="button" data-g="gps">◎ Use iPad GPS</button>') + '</div>' +
      '<div class="gpmsg"><small>Broadcast draft – check it against the FMC before you transmit</small><span data-draft>' + esc(draftOf(R)) + '</span></div>';
  }
  function refreshPop(full) {
    if (pop.hidden || pop.dataset.kind !== 'ifbp') return;
    if (full) { var sc = pop.scrollTop; pop.querySelector('.gpb').innerHTML = ifbpHtml(); pop.scrollTop = sc; return; }
    var R = rpt(Math.max(0, Math.min(T, curE()))), d = pop.querySelector('[data-draft]'); if (!d) return;
    d.textContent = draftOf(R); var sb = pop.querySelector('[data-srcb]'), si = pop.querySelector('[data-srci]');
    if (sb.textContent !== SRC[R.src]) { refreshPop(true); return; }
    si.textContent = R.info;
  }
  host.addEventListener('input', function (ev) { if (ev.target.classList && ev.target.classList.contains('gfl')) { setFL(ev.target.value); var R = rpt(Math.max(0, Math.min(T, curE()))); pop.querySelector('[data-draft]').textContent = draftOf(R); } });
  host.addEventListener('change', function (ev) { if (ev.target.classList && ev.target.classList.contains('gfl')) refreshPop(true); });
  function gpsHtml() {
    var f = gpsFix(); if (!f) return '<b class="gph">iPad GPS</b><div>' + esc(GPS.msg || 'no recent fix') + '</div>';
    var s = snap([f.lon, f.lat]);
    var la = Math.abs(f.lat), lo = Math.abs(f.lon), fm = function (v, w) { var dg = Math.floor(v), mn = (v - dg) * 60; return String(dg).padStart(w, '0') + '°' + mn.toFixed(1).padStart(4, '0') + "'"; };
    return '<b class="gph">◎ iPad GPS position ' + hh(mod(f.t)) + 'Z</b><div>' + (f.lat < 0 ? 'S' : 'N') + fm(la, 2) + ' ' + (f.lon < 0 ? 'W' : 'E') + fm(lo, 3) + '</div><div>' + esc(gpsLine(f)) + '</div>' +
      '<div>On the ' + esc(RT[s.k].n) + ' – ' + esc(RT[s.k + 1].n) + ' leg (' + esc(RT[s.k].aw || '?') + ').</div><div class="gpn">From the iPad location service – check against the FMC.</div>';
  }
  function ifbpHtml() {
    var e = curE(), eC = Math.max(0, Math.min(T, e)), g = inIfbp(eC), toM = L.toMin(), nx = null;
    IF.segs.forEach(function (q) { if (!nx && q.w > eC) nx = q; });
    var h = '<b class="gph">IFBP – IATA In-Flight Broadcast Procedure · 126.9</b>';
    h += '<div><b>On this route:</b> ' + IF.segs.map(function (q) { return q.firs.map(function (x) { return esc(IF.names[x] || x); }).join(' + ') + ' ' + hm(q.a) + '–' + hm(q.b) + ' (' + zt(toM + q.a) + '–' + zt(toM + q.b) + ')' + (q.a === 0 ? ', broadcast after departing' : ', listen from ' + hm(q.w) + ' · ' + zt(toM + q.w)); }).join('; ') + '.</div>';
    h += '<div class="gpst ' + (g ? 'on' : '') + '">' + (mode === 'live' ? 'Now' : 'Preview') + ' +' + hm(eC) + ': ' + (g ? (eC < g.a ? 'listening watch – IFBP area in ' + Math.ceil(g.a - eC) + ' min' : 'inside the IFBP area – broadcast at least every 20 min') : (nx ? 'outside – next IFBP listening watch from ' + hm(nx.w) + ' (' + zt(toM + nx.w) + ')' : 'no more IFBP on this route')) + '</div>';
    h += draftBox(rpt(eC));
    return h + IF.proc + '<div class="gpn">' + esc(IF.note) + ' ' + esc(IF.src) + ' Airways: OFP navlog (AWY column).</div>';
  }
  function focusAction(n) {
    var a = null; G.acts.forEach(function (x) { if (x.n === n) a = x; }); if (!a) return;
    setFollow(false); fly(posAt(a.e), Math.max(k, 3.2), 550);
    showPop('<b class="gph">' + a.n + ' · ' + esc(a.t) + ' – ' + hm(a.e) + '</b><div>' + esc(a.x) + '</div>');
  }

  /* ---------- drawing */
  function vis(ll) { return d3.geoDistance(ll, center()) < PI / 2 - 0.03; }
  function onScreen(p) { return p && p[0] > -40 && p[0] < W + 40 && p[1] > -40 && p[1] < H + 40; }
  var LBL = [], RES = [];
  function label(t, p, o) { LBL.push({ t: t, x: p[0], y: p[1], o: o || {} }); }
  function placeLabels(c) {
    var boxes = RES.slice(), wr = wrap.getBoundingClientRect();
    host.querySelectorAll('.gctl, .gbadge, .gpop:not([hidden])').forEach(function (el) { var r = el.getBoundingClientRect(); if (r.width) boxes.push({ x: r.left - wr.left - 4, y: r.top - wr.top - 4, w: r.width + 8, h: r.height + 8 }); });
    LBL.sort(function (a, b) { return (b.o.pri || 0) - (a.o.pri || 0); });
    LBL.forEach(function (l) {
      var f = l.o.font || ('600 12px ' + c.font); ctx.font = f;
      var w = ctx.measureText(l.t).width, h = l.o.size || 13, off = l.o.off || 8;
      var cand = l.o.center ? [[-w / 2, -h / 2]] : [[off, -h - 2], [off, 3], [-w - off, -h - 2], [-w - off, 3], [-w / 2, -h - off - 2], [-w / 2, off]];
      for (var q = 0; q < cand.length; q++) {
        var bx = { x: l.x + cand[q][0], y: l.y + cand[q][1], w: w, h: h };
        if (bx.x < 2 || bx.y < 2 || bx.x + w > W - 2 || bx.y + h > H - 2) continue;
        var hitb = false;
        for (var j = 0; j < boxes.length; j++) { var b = boxes[j]; if (bx.x < b.x + b.w + 3 && bx.x + bx.w + 3 > b.x && bx.y < b.y + b.h + 2 && bx.y + bx.h + 2 > b.y) { hitb = true; break; } }
        if (hitb) continue;
        boxes.push(bx);
        ctx.textBaseline = 'top'; ctx.textAlign = 'left';
        if (l.o.box) { ctx.fillStyle = l.o.box; rr(bx.x - 4, bx.y - 3, w + 8, h + 5, 4); ctx.fill(); }
        else { ctx.lineWidth = 3.2; ctx.strokeStyle = c.halo; ctx.lineJoin = 'round'; ctx.strokeText(l.t, bx.x, bx.y); }
        ctx.fillStyle = l.o.col || c.text; ctx.fillText(l.t, bx.x, bx.y);
        return;
      }
    });
  }
  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function tri(p, s) { ctx.beginPath(); ctx.moveTo(p[0], p[1] - s); ctx.lineTo(p[0] + s * 0.9, p[1] + s * 0.6); ctx.lineTo(p[0] - s * 0.9, p[1] + s * 0.6); ctx.closePath(); }
  function draw() {
    raf = 0; if (!W || !visible()) return;
    var c = colors(), x = ctx; proj.translate([W / 2, H / 2]).scale(r0 * k).rotate(rot);
    x.setTransform(DPR, 0, 0, DPR, 0, 0); x.globalAlpha = 1; x.setLineDash([]); x.lineCap = 'round'; x.lineJoin = 'round';
    x.fillStyle = c.bg; x.fillRect(0, 0, W, H);
    x.beginPath(); path(SPHERE); x.fillStyle = c.ocean; x.fill();
    x.beginPath(); path(GRAT); x.strokeStyle = c.grat; x.lineWidth = 0.7; x.stroke();
    x.beginPath(); path(LAND); x.fillStyle = c.land; x.fill(); x.strokeStyle = c.coast; x.lineWidth = 0.8; x.stroke();
    if (lay.cty) { x.beginPath(); path(BORD); x.strokeStyle = c.border; x.lineWidth = 0.6; x.stroke(); }
    x.beginPath(); path(SPHERE); x.strokeStyle = c.coast; x.lineWidth = 1.2; x.stroke();
    LBL = []; HITS = []; RES = [];
    var big = k >= 2.2, huge = k >= 5;
    if (lay.cty && k >= 1.3) (W0.clab || []).forEach(function (l) { if (l[3] > (k < 2 ? 1 : (k < 4 ? 2 : 3))) return; var ll = [l[1], l[2]]; if (!vis(ll)) return; var p = proj(ll); if (onScreen(p)) label(l[0].toUpperCase(), p, { center: true, pri: 1, col: c.muted, font: '600 10px ' + c.font, size: 11 }); });
    if (lay.fir) {
      x.setLineDash([7, 5]);
      G.fir.forEach(function (f) { x.beginPath(); path(f.geo); x.strokeStyle = c.fir; x.globalAlpha = f.r ? 0.95 : 0.5; x.lineWidth = f.r ? 1.7 : 1.1; x.stroke(); });
      x.setLineDash([]); x.globalAlpha = 1;
      G.firlab.forEach(function (l) { var ll = [l[2], l[1]]; if (!vis(ll)) return; var p = proj(ll); if (onScreen(p)) label(l[0], p, { center: true, pri: 2, col: c.fir, font: 'italic 600 11px ' + c.font, size: 12 }); });
    }
    if (IF && lay.ifbp) {
      var cy = getComputedStyle(document.documentElement).getPropertyValue('--cyan').trim() || '#6cc6e6';
      IF.polys.forEach(function (q) { x.beginPath(); path(q.f); x.fillStyle = cy; x.globalAlpha = 0.22; x.fill(); x.globalAlpha = 0.9; x.setLineDash([3, 4]); x.strokeStyle = cy; x.lineWidth = 1.6; x.stroke(); x.setLineDash([]); x.globalAlpha = 1;
        if (vis(q.lab)) { var lp = proj(q.lab); if (onScreen(lp)) label('IFBP · ' + q.name, lp, { center: true, pri: 4, col: cy, font: '800 11px ' + c.font, size: 12 }); } });
      IF.segs.forEach(function (q) {
        if (q.w < q.a) { x.beginPath(); path(subLine(q.w, q.a)); x.strokeStyle = cy; x.globalAlpha = 0.2; x.lineWidth = 20; x.stroke(); }
        x.beginPath(); path(subLine(q.a, q.b)); x.strokeStyle = cy; x.globalAlpha = 0.38; x.lineWidth = 20; x.stroke(); x.globalAlpha = 1;
        for (var t = q.w; t <= q.b; t += 3) { var ll = posAt(t); if (!vis(ll)) continue; var pt = proj(ll); if (onScreen(pt)) HITS.push({ x: pt[0], y: pt[1], r: 0, lo: 1, html: ifbpHtml }); }
        var mid = posAt((q.a + q.b) / 2); if (vis(mid)) { var mp = proj(mid); if (onScreen(mp)) label('IFBP 126.9 · ' + hm(q.a) + '–' + hm(q.b), mp, { pri: 8, box: cy, col: '#06222c', font: '800 11px ' + c.font, size: 12, off: 16 }); }
        if (q.w < q.a) { var wl = posAt(q.w); if (vis(wl)) { var wp = proj(wl); if (onScreen(wp)) label('IFBP listen ' + hm(q.w), wp, { pri: 7, col: cy, font: '800 11px ' + c.font, size: 12, off: 12 }); } }
      });
    }
    if (lay.rings) {
      x.setLineDash([5, 6]);
      RINGS.forEach(function (r) { x.beginPath(); path(r.geo); x.strokeStyle = r.a.col; x.globalAlpha = 0.75; x.lineWidth = 1.4; x.stroke(); });
      x.setLineDash([]); x.globalAlpha = 1;
    }
    (G.etseg || []).forEach(function (s) { x.beginPath(); path(subLine(s[0], s[1])); x.strokeStyle = c.etops; x.lineWidth = 12; x.globalAlpha = 0.85; x.stroke(); x.globalAlpha = 1; });
    var e = curE(), eC = Math.max(0, Math.min(T, e));
    x.beginPath(); path(ROUTE); x.strokeStyle = c.halo; x.lineWidth = 5.5; x.stroke();
    x.beginPath(); path(ROUTE); x.strokeStyle = c.route; x.lineWidth = 2.4; x.stroke();
    if (eC > 0) { x.beginPath(); path(subLine(0, eC)); x.strokeStyle = c.grn; x.lineWidth = 3.2; x.stroke(); }
    if (e >= 0 && e < T) { var sg = seg(eC); x.beginPath(); path({ type: 'LineString', coordinates: [posAt(eC), RC[sg.k + 1]] }); x.strokeStyle = c.mag; x.lineWidth = 3.6; x.stroke(); }
    // waypoints
    RT.forEach(function (w, i) {
      if (i === 0 || i === RT.length - 1) return;
      if (!w.m && !big) return;
      var ll = [w.lon, w.lat]; if (!vis(ll)) return; var p = proj(ll); if (!onScreen(p)) return;
      tri(p, w.m ? 5.5 : 4); x.fillStyle = w.e <= eC ? c.grn : c.route; x.fill(); x.lineWidth = 1.2; x.strokeStyle = c.halo; x.stroke();
      HITS.push({ x: p[0], y: p[1], r: w.m ? 4 : -14, html: function () { return wptHtml(w); } });
      if (lay.wpt && (w.m || huge)) label(w.n + (w.m ? ' ' + hm(w.e) : ''), p, { pri: w.m ? 6 : 3, font: (w.m ? '700 12px ' : '500 11px ') + c.font, size: w.m ? 13 : 12 });
      if (lay.wpt && w.m && w.note && huge) label(w.note, [p[0], p[1] + 14], { pri: 2, col: c.muted, font: 'italic 500 11px ' + c.font, size: 12 });
    });
    // FIR entries along the route
    D.firs.forEach(function (f) {
      if (!f.eet_min) return; var ll = posAt(f.eet_min); if (!vis(ll)) return; var p = proj(ll); if (!onScreen(p)) return;
      x.beginPath(); x.arc(p[0], p[1], 6.5, 0, 2 * PI); x.strokeStyle = c.fir; x.lineWidth = 2; x.stroke();
      HITS.push({ x: p[0], y: p[1], r: 6, html: function () { return '<b class="gph">FIR entry ' + esc(f.fir) + ' ' + esc(f.name) + '</b><div>EET ' + tz(f.eet_min) + ' (FPL EET)</div>'; } });
      if (lay.fir) label('▶ ' + f.fir + ' ' + hm(f.eet_min), p, { pri: 5, col: c.fir, font: '700 11px ' + c.font, size: 12, off: 10 });
    });
    // airports
    if (lay.apt) G.apt.forEach(function (a) {
      var ll = [a.lon, a.lat]; if (!vis(ll)) return; var p = proj(ll); if (!onScreen(p)) return;
      var end = a.icao === RT[0].n || a.icao === RT[RT.length - 1].n;
      x.beginPath(); x.arc(p[0], p[1], end ? 7 : 5, 0, 2 * PI); x.fillStyle = a.ring ? a.col : c.apt; x.fill(); x.lineWidth = 1.5; x.strokeStyle = c.halo; x.stroke();
      if (a.et) { x.beginPath(); x.rect(p[0] - 9, p[1] - 9, 18, 18); x.strokeStyle = c.etops; x.lineWidth = 1.6; x.stroke(); }
      RES.push({ x: p[0] - 5, y: p[1] - 5, w: 10, h: 10 });
      HITS.push({ x: p[0], y: p[1], r: 6, html: function () { return aptHtml(a); } });
      label(big || end || a.ring ? a.lab : a.icao, p, { pri: end ? 9 : (a.ring ? 7 : 4), col: a.ring ? a.col : c.muted, font: (a.ring || end ? '700 12px ' : '600 11px ') + c.font, size: 13 });
    });
    // DP + ETOPS entry / exit
    (G.dp || []).forEach(function (d) {
      var ll = [d.lon, d.lat]; if (!vis(ll)) return; var p = proj(ll); if (!onScreen(p)) return;
      x.beginPath(); x.moveTo(p[0], p[1] - 8); x.lineTo(p[0] + 8, p[1]); x.lineTo(p[0], p[1] + 8); x.lineTo(p[0] - 8, p[1]); x.closePath(); x.fillStyle = c.amb; x.fill(); x.strokeStyle = c.halo; x.lineWidth = 1.4; x.stroke();
      HITS.push({ x: p[0], y: p[1], r: 7, html: function () { return '<b class="gph">' + esc(d.lab) + '</b><div>' + esc(d.txt || '') + '</div>'; } });
      label(d.short || 'DP', p, { pri: 8, col: c.amb, font: '700 12px ' + c.font, size: 13, off: 11 });
    });
    (G.etp || []).forEach(function (d) {
      var ll = [d.lon, d.lat]; if (!vis(ll)) return; var p = proj(ll); if (!onScreen(p)) return;
      x.beginPath(); x.rect(p[0] - 5, p[1] - 5, 10, 10); x.fillStyle = c.etops; x.fill(); x.strokeStyle = c.halo; x.lineWidth = 1.2; x.stroke();
      HITS.push({ x: p[0], y: p[1], r: 6, html: function () { return '<b class="gph">' + esc(d.lab) + '</b><div>EET ' + tz(d.e) + '</div>'; } });
      label(d.short, p, { pri: 6, col: c.etops, font: '700 11px ' + c.font, size: 12, off: 10 });
    });
    // action points (numbered), offset from the route
    if (lay.acts) G.acts.forEach(function (a) {
      var ll = posAt(a.e); if (!vis(ll)) return; var p = proj(ll); if (!onScreen(p)) return;
      var q = proj(posAt(Math.min(T, a.e + 4))), q0 = proj(posAt(Math.max(0, a.e - 4)));
      var dx = q && q0 ? q[0] - q0[0] : 1, dy = q && q0 ? q[1] - q0[1] : 0, n = Math.hypot(dx, dy) || 1, sd = a.s || 1;
      var b = [p[0] - dy / n * 22 * sd, p[1] + dx / n * 22 * sd];
      x.beginPath(); x.moveTo(p[0], p[1]); x.lineTo(b[0], b[1]); x.strokeStyle = c.text; x.globalAlpha = 0.6; x.lineWidth = 1; x.stroke(); x.globalAlpha = 1;
      x.beginPath(); x.arc(b[0], b[1], 10.5, 0, 2 * PI); x.fillStyle = c.text; x.fill(); x.strokeStyle = c.halo; x.lineWidth = 1.5; x.stroke();
      x.fillStyle = c.bg; x.font = '800 12px ' + c.font; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(a.n), b[0], b[1] + 0.5);
      RES.push({ x: b[0] - 11, y: b[1] - 11, w: 22, h: 22 });
      HITS.push({ x: b[0], y: b[1], r: 10, html: function () { return '<b class="gph">' + a.n + ' · ' + esc(a.t) + ' – ' + hm(a.e) + '</b><div>' + esc(a.x) + '</div>'; } });
    });
    // aircraft (planned position)
    var pp = posAt(eC);
    if (vis(pp)) {
      var p = proj(pp), ahead = posAt(eC < T - 3 ? eC + 3 : eC), behind = posAt(eC < T - 3 ? eC : eC - 3), a1 = proj(behind), a2 = proj(ahead);
      var ang = a1 && a2 ? Math.atan2(a2[0] - a1[0], -(a2[1] - a1[1])) : 0;
      x.beginPath(); x.arc(p[0], p[1], 19, 0, 2 * PI); x.fillStyle = c.mag; x.globalAlpha = 0.2; x.fill(); x.globalAlpha = 1;
      if (PLANE) { x.save(); x.translate(p[0], p[1]); x.rotate(ang); x.scale(1.2, 1.2); x.fillStyle = c.mag; x.fill(PLANE); x.lineWidth = 1.3; x.strokeStyle = c.halo; x.stroke(PLANE); x.restore(); }
      HITS.push({ x: p[0], y: p[1], r: 14, html: planeHtml });
      label((mode === 'live' ? '✈ ' : '✈ PREVIEW ') + (e < 0 ? 'on ground' : (e > T ? 'landed' : '+' + hm(eC) + ' · ' + zt(L.toMin() + eC))), p, { pri: 100, box: c.mag, col: '#1a0718', font: '800 12px ' + c.font, size: 13, off: 20 });
    }
    var gf = gpsFix();
    if (gf && vis([gf.lon, gf.lat])) {
      var gp = proj([gf.lon, gf.lat]), gsn = snap([gf.lon, gf.lat]), gsv = gsOf(gf, gsn), hd = gf.hdg != null && !isNaN(gf.hdg) && gsv.gps ? gf.hdg : brg(RC[gsn.k], RC[gsn.k + 1]);
      var gq = proj([gf.lon + Math.sin(hd * PI / 180) * 0.3 / Math.max(0.2, Math.cos(gf.lat * PI / 180)), gf.lat + Math.cos(hd * PI / 180) * 0.3]);
      var ga = gq ? Math.atan2(gq[0] - gp[0], -(gq[1] - gp[1])) : 0, cyc = getComputedStyle(document.documentElement).getPropertyValue('--cyan').trim() || '#6cc6e6';
      x.beginPath(); x.arc(gp[0], gp[1], 19, 0, 2 * PI); x.fillStyle = cyc; x.globalAlpha = 0.22; x.fill(); x.globalAlpha = 1;
      if (PLANE) { x.save(); x.translate(gp[0], gp[1]); x.rotate(ga); x.scale(1.2, 1.2); x.fillStyle = cyc; x.fill(PLANE); x.lineWidth = 1.3; x.strokeStyle = c.halo; x.stroke(PLANE); x.restore(); }
      HITS.push({ x: gp[0], y: gp[1], r: 14, html: gpsHtml });
      label('◎ GPS ' + hh(mod(gf.t)) + 'Z', gp, { pri: 99, box: cyc, col: '#06222c', font: '800 12px ' + c.font, size: 13, off: 20 });
    }
    placeLabels(c);
  }

  /* ---------- public */
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(size).observe(wrap); else window.addEventListener('resize', size);
  setMode('live');
  try { if (localStorage.getItem('fpapp:gps') === '1') gpsSet(true); } catch (e) { }
  return {
    tick: function () { if (!visible()) return; if (mode === 'live') { if (follow) centerPlane(false); updBar(); } refreshPop(false); req(); },
    shown: function () { size(); updBar(); req(); },
    restyle: function () { C = null; req(); },
    focusAction: focusAction,
    showIfbp: function () { if (IF) showPop(ifbpHtml(), true, 'ifbp'); },
    project: function (lon, lat) { return vis([lon, lat]) ? proj([lon, lat]) : null; }
  };
};
