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
  /* level of detail (05 NOV 26 perf): Douglas-Peucker copies of the arcs; the overview draws ~10x fewer points, the full 1:50m set only when zoomed in */
  function dp(pts, tol) {
    if (pts.length <= 2) return pts;
    var keep = new Uint8Array(pts.length), st = [[0, pts.length - 1]], t2 = tol * tol; keep[0] = keep[pts.length - 1] = 1;
    while (st.length) {
      var se = st.pop(), a = se[0], b = se[1], ax = pts[a][0], ay = pts[a][1], dx = pts[b][0] - ax, dy = pts[b][1] - ay, L2 = dx * dx + dy * dy, md = -1, mi = -1;
      for (var i = a + 1; i < b; i++) {
        var qx = pts[i][0] - ax, qy = pts[i][1] - ay, d;
        if (L2 === 0) d = qx * qx + qy * qy; else { var t = (qx * dx + qy * dy) / L2; t = t < 0 ? 0 : (t > 1 ? 1 : t); qx -= t * dx; qy -= t * dy; d = qx * qx + qy * qy; }
        if (d > md) { md = d; mi = i; }
      }
      if (md > t2) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
    }
    var out = []; for (var j = 0; j < pts.length; j++) if (keep[j]) out.push(pts[j]); return out;
  }
  function buildBase(AR, minRing) {
    function arc(i) { return i < 0 ? AR[~i].slice().reverse() : AR[i]; }
    function ring(ids) { var r = []; for (var k = 0; k < ids.length; k++) { var a = arc(ids[k]); r = r.concat(k ? a.slice(1) : a); } return r; }
    function poly(p) { return p.map(ring).filter(function (r, i) { return i > 0 || r.length >= minRing; }); }
    var g = W0.land, polys = (g.type === 'Polygon' ? [g.arcs] : g.arcs).map(poly).filter(function (p) { return p.length && p[0].length >= minRing; });
    return { land: { type: 'MultiPolygon', coordinates: polys }, bord: { type: 'MultiLineString', coordinates: BIDX.map(function (j) { return AR[j]; }) } };
  }
  var cnt = {};
  W0.countries.forEach(function (g) {
    var seen = {};
    (g.type === 'Polygon' ? [g.arcs] : g.arcs).forEach(function (p) { p.forEach(function (rr) { rr.forEach(function (i) { var j = i < 0 ? ~i : i; if (!seen[j]) { seen[j] = 1; cnt[j] = (cnt[j] || 0) + 1; } }); }); });
  });
  var BIDX = Object.keys(cnt).filter(function (j) { return cnt[j] > 1; });
  var LOD = [buildBase(ARCS, 4)], LODT = [0, 0.03, 0.12];   // tolerance in degrees: full, mid, overview
  function base(pxPerDeg) {
    var lv = pxPerDeg < 16 ? 2 : (pxPerDeg < 60 ? 1 : 0);
    if (!LOD[lv]) LOD[lv] = buildBase(ARCS.map(function (a) { return dp(a, LODT[lv]); }), 4);
    return LOD[lv];
  }
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
  function firAt(e) { var c = null; (D.firseq || D.firs).forEach(function (f) { if (f.eet_min <= e) c = f; }); return c; }
  function rowOf(n) { for (var j = 0; j < D.rows.length; j++) if (D.rows[j].wpt === n) return D.rows[j]; return null; }

  /* ---------- DOM */
  var SL = G.slop || null, CP = G.cpdlc || null, PR = G.profile || null;
  var LAY = { slop: 'SLOP', cpdlc: 'CPDLC', ifbp: 'IFBP area', ncz: 'NOTAM / conflict', night: 'Night shadow', terr: 'Terrain', esc: 'Escape airports', rings: 'Rings 420 NM', fir: 'FIR lines', apt: 'Airports', wpt: 'Waypoint names', acts: 'Action points', cty: 'Borders' };
  /* v1.3 layers: NOTAM / conflict areas (OFP en-route NOTAMs: the route part inside the FIR they name, plus town areas), escape airports (TEM chain) */
  var NZ = [];
  (D.rnotams || []).forEach(function (n) {
    if (n.kind === 'info') return; var fi = null, tx = n.x.replace(/[^A-Z ]/g, '');
    D.firs.forEach(function (f) { if (new RegExp('\\b' + f.name.replace(/[^A-Za-z]/g, '').toUpperCase() + ' FIR').test(tx)) fi = f; });
    if (!fi) D.firs.forEach(function (f) { if (f.fir === n.fir) fi = f; });
    if (!fi) return; var nx = D.firs[D.firs.indexOf(fi) + 1], z = null;
    NZ.forEach(function (q) { if (q.fir === fi.fir && q.kind === n.kind) z = q; });
    if (!z) { z = { fir: fi.fir, name: fi.name, kind: n.kind, a: fi.eet_min, b: nx ? nx.eet_min : TE, ns: [] }; NZ.push(z); }
    z.ns.push(n);
  });
  var NA = (D.nareas || []).map(function (q) { return { q: q, geo: q.pts.map(function (p) { return d3.geoCircle().center([p[1], p[0]]).radius(q.r_nm / 60).precision(4)(); }) }; });
  var ESC = D.chain.filter(function (c) { return /escape/i.test(c.note); }).map(function (c) { var a = null; G.apt.forEach(function (x) { if (x.icao === c.icao) a = x; }); return a ? { c: c, a: a } : null; }).filter(Boolean);
  var TERR = null;   // terrain texture (fp_terrain.js: window.FP_TERRAIN = data URI of an equirectangular grey shaded-relief image)
  var terrLoading = false;
  function loadTerrain() { if (TERR || terrLoading || !window.FP_TERRAIN) return; terrLoading = true; var ti = new Image(); ti.onload = function () { var cc = document.createElement('canvas'); cc.width = ti.width; cc.height = ti.height; var g2 = cc.getContext('2d'); g2.drawImage(ti, 0, 0); var rgba = g2.getImageData(0, 0, ti.width, ti.height).data, one = new Uint8Array(ti.width * ti.height); for (var q = 0; q < one.length; q++) one[q] = rgba[q * 4]; TERR = { w: ti.width, h: ti.height, d: one }; cc.width = cc.height = 1; SKEY = ''; req(); }; ti.src = window.FP_TERRAIN; }   // v3: decoded when the map is first shown, not at start
  if (!NZ.length && !NA.length) delete LAY.ncz; if (!ESC.length) delete LAY.esc; if (!window.FP_TERRAIN) delete LAY.terr;
  if (!IF) delete LAY.ifbp; if (!SL) delete LAY.slop; if (!CP) delete LAY.cpdlc;
  var EXCL = ['slop', 'cpdlc', 'ifbp'];   // route overlays: one at a time so the colours stay readable
  var lay = { slop: false, cpdlc: false, ifbp: false, ncz: true, night: true, terr: true, esc: true, rings: true, fir: true, apt: true, wpt: true, acts: true, cty: true };
  try { var ls = localStorage.getItem('fpapp:glay'); if (ls) lay = Object.assign(lay, JSON.parse(ls)); } catch (e) { }
  host.innerHTML =
    '<div class="gwrap"><canvas class="gcv" role="img" aria-label="Interactive route map. Drag to turn the Earth, pinch or double-tap to zoom, tap a symbol for details."></canvas>' +
    '<div class="gbadge">✈ = planned position (OFP EET + your T/O) · not GPS</div>' +
    '<div class="gctl"><button type="button" data-g="in" aria-label="Zoom in">+</button><button type="button" data-g="out" aria-label="Zoom out">−</button>' +
    '<button type="button" data-g="route">Route</button><button type="button" data-g="follow">✈ Follow</button><button type="button" data-g="gps" aria-label="Use the iPad GPS position">◎ GPS</button><button type="button" data-g="full" aria-label="Full screen">⤢</button></div>' +
    '<div class="gpop" hidden><button type="button" class="gpx" aria-label="Close details">✕</button><div class="gpb"></div></div></div>' +
    (PR ? '<div class="gprof"><div class="gapt gback" aria-live="polite"></div><svg class="gpsvg" viewBox="0 0 1000 190" role="img" aria-label="Side view: MORA along the route, planned levels and the aircraft. Tap to preview a time."></svg><div class="gapt gahead" aria-live="polite"></div></div>' : '') +
    '<div class="gbar"><button type="button" data-g="live" class="glive">LIVE</button><button type="button" data-g="play" class="gplay" aria-label="Play the flight">▶</button>' +
    '<input type="range" class="gsl" min="0" max="' + T + '" step="1" value="0" aria-label="Time after take-off (preview)"><div class="gtime"><b></b><small></small><small class="ggps" hidden></small></div></div>' +
    '<div class="glay">' + Object.keys(LAY).map(function (k) { return '<button type="button" class="chipbtn" data-lay="' + k + '" aria-pressed="' + lay[k] + '">' + LAY[k] + '</button>'; }).join('') + '</div>';
  var wrap = host.querySelector('.gwrap'), cv = host.querySelector('canvas'), ctx = cv.getContext('2d');
  var sl = host.querySelector('.gsl'), tb = host.querySelector('.gtime b'), ts = host.querySelector('.gtime small'), pop = host.querySelector('.gpop'), gg = host.querySelector('.ggps'), badge = host.querySelector('.gbadge');
  var proj = d3.geoOrthographic().clipAngle(90).precision(1), pathD = d3.geoPath(proj, ctx), path = pathD;
  var SCV = document.createElement('canvas'), sctx = SCV.getContext('2d'), pathS = d3.geoPath(proj, sctx), gx = ctx, SKEY = '', SHITS = [], SWP = [], themeVer = 0;
  try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { C = null; themeVer++; req(); }); } catch (e) { }
  var W = 0, H = 0, DPR = 1, r0 = 100, k = 1, rot = [0, 0, 0], inited = false, raf = 0;
  var mode = 'live', pv = 0, playing = 0, follow = false, HITS = [];
  var PLANE = typeof Path2D !== 'undefined' ? new Path2D('M0,-15C1.7,-15 2.2,-12 2.2,-9.5L2.2,-3.5L14,3L14,6L2.2,2.6L2.2,9L5.5,12L5.5,14.2L0,12.8L-5.5,14.2L-5.5,12L-2.2,9L-2.2,2.6L-14,6L-14,3L-2.2,-3.5L-2.2,-9.5C-2.2,-12 -1.7,-15 0,-15Z') : null;

  var C = null, Ct = 0;
  function colors() {
    if (C) return C;
    var cs = getComputedStyle(document.documentElement), v = function (n, d) { return (cs.getPropertyValue(n) || '').trim() || d; };
    C = { bg: v('--panel', '#181c24'), ocean: v('--map-ocean', '#10202f'), land: v('--map-land', '#2c3139'), coast: v('--map-coast', '#46505c'), border: v('--map-border', '#5d6672'),
      grat: v('--map-grat', 'rgba(255,255,255,.07)'), fir: v('--map-fir', '#e5534b'), route: v('--map-route', '#f1f5fa'), text: v('--fg', '#e9eef5'), muted: v('--muted', '#9aa5b4'),
      halo: v('--map-halo', 'rgba(8,14,22,.9)'), mag: v('--mag', '#e46bd8'), grn: v('--grn', '#5ccb72'), amb: v('--amb', '#f2b33d'), etops: v('--map-etops', '#e8832a'),
      apt: v('--map-apt', '#8c96a3'), red: v('--red', '#e5534b'), cyan: v('--cyan', '#6cc6e6'), font: v('--body', 'system-ui, sans-serif') };
    Ct = Date.now(); return C;
  }
  function visible() { return !!(host.offsetParent || host.classList.contains('gfull') || host.getClientRects().length); }   // v2.0: fixed (MAP full screen) has no offsetParent
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
      var of_ = mode === 'live' && L.off ? L.off() : 0;   // v3: the clock shows real time; waypoint times are the revised estimates (Z)
      tb.textContent = (mode === 'live' ? '' : 'PREVIEW ') + zt(toM + e + of_) + ' · +' + hm(e + of_) + (Math.round(of_) ? ' · ' + (of_ > 0 ? '+' : '−') + Math.abs(Math.round(of_)) + ' min on the plan' : '');
      ts.textContent = a.n + ' ' + (L.wz ? L.wz(a.e) : hm(a.e)) + ' → ' + b.n + ' ' + (L.wz ? L.wz(b.e) : hm(b.e)) + ' · ' + Math.round(CUM[CUM.length - 1] - distAt(eC)).toLocaleString('en-GB') + ' NM to go' + (inIfbp(eC) ? ' · IFBP 126.9' : '') + (plan && mode === 'live' ? ' · no T/O set (planned)' : '');
    }
    gg.hidden = !GPS.on; if (GPS.on) { var gf = gpsFix(); gg.textContent = gf ? 'GPS ' + gpsLine(gf) + ' · ' + xcheck(gf) : 'GPS: ' + (GPS.msg || 'no recent fix') + ' – elapsed time stays the reference'; }
    badge.textContent = GPS.on ? '✈ magenta = elapsed-time position · cyan = iPad GPS (cross-check)' : '✈ = elapsed-time position (OFP EET + your T/O) · not GPS';
    updProfile();
  }
  var slRaf = 0;
  sl.addEventListener('input', function () {   // smooth scrubbing: coalesce to one update per frame, never fight a running fly animation
    stopPlay(); cancelAnimationFrame(anim); pv = +sl.value;
    if (slRaf) return;
    slRaf = requestAnimationFrame(function () { slRaf = 0; if (mode !== 'preview') setMode('preview'); else updBar(); if (follow) centerPlane(false); else req(); });
  });
  function centerPlane(animate) { var gf = mode === 'live' ? gpsFix() : null, p = gf ? [gf.lon, gf.lat] : posAt(Math.max(0, Math.min(T, curE()))); if (animate) fly(p, Math.max(k, 3), 500); else { rot = [-p[0], clampLat(-p[1]), 0]; req(); } }
  function setFollow(f) { follow = f; host.querySelector('[data-g="follow"]').classList.toggle('on', f); if (f) centerPlane(true); }

  host.addEventListener('click', function (ev) {
    var b = ev.target.closest('button'); if (!b || !host.contains(b)) return;
    var g = b.dataset.g;
    if (b.dataset.lay) {
      var key = b.dataset.lay; lay[key] = !lay[key]; b.setAttribute('aria-pressed', String(lay[key]));
      if (lay[key] && EXCL.indexOf(key) >= 0) EXCL.forEach(function (o) { if (o !== key && lay[o]) { lay[o] = false; var ob = host.querySelector('[data-lay="' + o + '"]'); if (ob) ob.setAttribute('aria-pressed', 'false'); } });
      try { localStorage.setItem('fpapp:glay', JSON.stringify(lay)); } catch (e) { }
      if (key === 'slop') showPop(lay.slop ? '<b class="gph">SLOP along the route</b><div><span class="sw g"></span> authorized · <span class="sw r"></span> not authorized · <span class="sw n"></span> not published (centreline). Tap a coloured part of the route for the details; tap it again to close.</div>' : null, false, 'hint');
      if (key === 'cpdlc') showPop(lay.cpdlc ? '<b class="gph">CPDLC along the route</b><div>Violet = CPDLC (dashed = trial). Logon address and time on the route; tap a part of the route for the details, tap again to close.</div>' : null, false, 'hint');
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
    else if (g === 'src-el') setDsrc('el');
    else if (g === 'src-gps') setDsrc('gps');
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
  function showPop(h, wide, kind, key) { if (!h) { pop.hidden = true; pop.dataset.kind = ''; pop.dataset.key = ''; req(); return; } pop.querySelector('.gpb').innerHTML = h; pop.classList.toggle('wide', !!wide); pop.dataset.kind = kind || ''; pop.dataset.key = key || ''; pop.hidden = false; pop.scrollTop = 0; req(); }
  function hit(p) {
    var best = null, bd = 26, band = null, bb = 16;
    HITS.forEach(function (h) { if (h.lo) return; var d = Math.hypot(h.x - p[0], h.y - p[1]) - (h.r || 0); if (d < bd) { bd = d; best = h; } });
    HITS.forEach(function (h) { if (!h.lo) return; var d = Math.hypot(h.x - p[0], h.y - p[1]); if (d < bb) { bb = d; band = h; } });
    // with a route overlay on (SLOP / CPDLC / IFBP) the coloured route wins unless the tap is right on a symbol
    if (band && (!best || bd > 4)) best = band;
    if (!best && IF && lay.ifbp) { var g = proj.invert(p); if (g && vis(g) && IF.polys.some(function (q) { return d3.geoContains(q.f, g); })) best = { html: ifbpHtml }; }
    if (best && best.key && !pop.hidden && pop.dataset.key === best.key) { showPop(null); return; }   // tap the same part again = close
    showPop(best ? best.html() : null, best && best.html === ifbpHtml, best && best.html === ifbpHtml ? 'ifbp' : (best && best.html === gpsHtml ? 'gps' : ''), best && best.key);
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
            if (L.onFix) try { L.onFix(GPS.fix); } catch (x) { }   // v1.3: auto-tick by GPS
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
    var f = mode === 'live' && DSRC === 'gps' ? gpsFix() : null;
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
            info: (mode === 'live' ? (DSRC === 'gps' ? 'No GPS fix – using the elapsed time. ' : '') + 'No waypoint ticked yet. ' : 'Preview. ') +
              'OFP EETs from ' + (L.isPlan() ? 'the planned T/O (no T/O set)' : 'your T/O') + '.' };
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
  var SRC = { gps: 'iPad GPS position', tick: 'Elapsed time, corrected by your last waypoint tick', plan: 'Elapsed time (T/O + OFP EETs)' };
  var DSRC = 'el'; try { DSRC = localStorage.getItem('fpapp:dsrc') === 'gps' ? 'gps' : 'el'; } catch (e) { }
  function setDsrc(v) { DSRC = v; try { localStorage.setItem('fpapp:dsrc', v); } catch (e) { } if (v === 'gps' && !GPS.on) gpsSet(true); refreshPop(true); }
  function eetAtDist(d) { for (var i = 0; i < RT.length - 1; i++) if (d <= CUM[i + 1] || i === RT.length - 2) { var L_ = CUM[i + 1] - CUM[i]; return RT[i].e + (RT[i + 1].e - RT[i].e) * (L_ ? Math.max(0, Math.min(1, (d - CUM[i]) / L_)) : 0); } return T; }
  function gpsAlong(f) { var s = snap([f.lon, f.lat]); return { s: s, d: CUM[s.k] + s.at }; }
  function xcheck(f) {   // GPS vs the elapsed-time (planned) position along the route
    var g = gpsAlong(f), eC = Math.max(0, Math.min(T, mode === 'live' ? L.el() : pv)), dp = distAt(eC), dd = g.d - dp, eg = eetAtDist(g.d), dm = eg - eC;
    if (Math.abs(dd) < 3) return 'matches the elapsed-time position';
    return Math.round(Math.abs(dd)) + ' NM ' + (dd > 0 ? 'ahead of' : 'behind') + ' the elapsed-time position (≈ ' + Math.abs(Math.round(dm)) + ' min ' + (dm > 0 ? 'early' : 'late') + ')';
  }
  function draftBox(R) {
    var gf = gpsFix();
    return '<div class="seg" role="group" aria-label="Position for the draft"><span>Position from</span><button type="button" data-g="src-el" class="' + (DSRC === 'el' ? 'on' : '') + '">Elapsed time</button>' +
      '<button type="button" data-g="src-gps" class="' + (DSRC === 'gps' ? 'on' : '') + '">iPad GPS' + (gf ? '' : ' (no fix)') + '</button></div>' +
      (gf ? '<div class="gpx2"><b>GPS cross-check:</b> <span data-xc>' + esc(xcheck(gf)) + '</span></div>' : '') +
      '<div class="gpsrc s-' + R.src + '"><b data-srcb>' + SRC[R.src] + '</b> <span data-srci>' + esc(R.info) + '</span></div>' +
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
    si.textContent = R.info; var xc = pop.querySelector('[data-xc]'), gf2 = gpsFix(); if (xc && gf2) xc.textContent = xcheck(gf2);
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
  function slopHtml(q) {
    var toM = L.toMin(), lab = { authorized: '✓ SLOP authorized', not_authorized: '✗ SLOP NOT authorized – centreline', not_published: 'SLOP not published – centreline' }[q.st] || q.st;
    return '<b class="gph">SLOP – ' + esc(q.fir) + ' ' + esc(q.name) + '</b><div class="gpst sl-' + q.st + '">' + lab + '</div><div>' + q.txt + '</div>' +
      '<div>' + hm(q.a) + ' – ' + hm(q.b) + ' (' + zt(toM + q.a) + ' – ' + zt(toM + q.b) + ')</div>' +
      (q.st === 'authorized' ? '<div>' + esc(SL.rule) + '</div>' : '<div>Fly the centreline in this FIR.</div>') + '<div class="gpn">' + esc(SL.src) + '. Tap this part of the route again to close.</div>';
  }
  function cpdlcHtml(q) {
    var toM = L.toMin();
    return '<b class="gph">CPDLC – ' + esc(q.fir) + ' ' + esc(q.name) + '</b>' +
      (q.addr ? '<div class="gpst on2">Logon <b>' + esc(q.addr) + '</b>' + (q.st === 'trial' ? ' (trial)' : '') + ' · ' + esc(q.time) + (q.dl != null ? ' → by ' + hm(q.dl) + ' · ' + zt(toM + q.dl) : '') + '</div>' +
        (q.lim && q.lim !== '-' ? '<div>Levels: ' + esc(q.lim) + '</div>' : '') + '<div>' + esc(q.note) + '</div>'
        : '<div class="gpst">No CPDLC in Lido RSI for this FIR – voice (VHF / HF) and SATCOM.</div>') +
      '<div>In the FIR ' + hm(q.a) + ' – ' + hm(q.b) + ' (' + zt(toM + q.a) + ' – ' + zt(toM + q.b) + ')</div><div class="gpn">' + esc(CP.src) + '. Tap again to close.</div>';
  }
  /* nearest 1-hour (420 NM) airport behind (return) and ahead - OM-C chain airports, CA / not usable excluded */
  var CAND = G.apt.filter(function (a) { var ch = D.chain.filter(function (c) { return c.icao === a.icao; }); return ch.length && ch.some(function (c) { return c.cls !== 'CA'; }) && !/not usable/i.test(a.lab); });
  CAND.forEach(function (a) { var s_ = snap([a.lon, a.lat]); a._along = CUM[s_.k] + s_.at; var ch = D.chain.filter(function (c) { return c.icao === a.icao; })[0]; a._cls = ch ? ch.cls : ''; });
  function nearApts(ll, along) {
    var back = null, ahead = null;
    CAND.forEach(function (a) { var o = { a: a, d: d3.geoDistance(ll, [a.lon, a.lat]) * NM };
      if (a._along <= along + 1) { if (!back || o.d < back.d) back = o; } else if (!ahead || o.d < ahead.d) ahead = o; });
    return { back: back, ahead: ahead };
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
  var SBOX = [];
  function routeBoxes() {   // keep words off the route line: small boxes every ~9 px along the projected route
    var out = [];
    for (var i = 0; i < RC.length - 1; i++) {
      var A2 = RC[i], B2 = RC[i + 1], pa = vis(A2) ? proj(A2) : null, pb = vis(B2) ? proj(B2) : null;
      var n = pa && pb ? Math.max(1, Math.ceil(Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) / 9)) : 24, ip = d3.geoInterpolate(A2, B2);
      for (var j = 0; j <= n; j++) { var q = ip(j / n); if (!vis(q)) continue; var pp = proj(q); if (pp[0] < -10 || pp[0] > W + 10 || pp[1] < -10 || pp[1] > H + 10) continue; out.push({ x: pp[0] - 4, y: pp[1] - 4, w: 8, h: 8 }); }
    }
    return out;
  }
  var LPOS = {};   // last candidate used per label - tried first next frame
  function placeLabels(c, stat) {
    var ctx = gx, nR = 0, boxes = stat ? RES.concat(routeBoxes()) : SBOX.concat(RES), wr = wrap.getBoundingClientRect();
    if (stat) nR = boxes.length;
    host.querySelectorAll('.gctl, .gbadge, .gpop:not([hidden])').forEach(function (el) { var r = el.getBoundingClientRect(); if (r.width) boxes.push({ x: r.left - wr.left - 4, y: r.top - wr.top - 4, w: r.width + 8, h: r.height + 8 }); });
    LBL.sort(function (a, b) { return (b.o.pri || 0) - (a.o.pri || 0); });
    LBL.forEach(function (l) {
      var f = l.o.font || ('600 12px ' + c.font); ctx.font = f;
      var w = ctx.measureText(l.t).width, h = l.o.size || 13, off = l.o.off || 8;
      var cand = [];
      if (l.o.center) cand = [[-w / 2, -h / 2], [-w / 2, -h - 10], [-w / 2, 10], [-w - 8, -h / 2], [8, -h / 2]];
      else [off, off + 9, off + 20].forEach(function (o2) { cand.push([o2, -h - 2], [o2, 3], [-w - o2, -h - 2], [-w - o2, 3], [-w / 2, -h - o2 - 2], [-w / 2, o2]); });
      var force = (l.o.pri || 0) >= 99, lk = force ? 'p' + l.o.pri : l.t, pq = LPOS[lk];
      if (pq != null && pq < cand.length) { var pc = cand[pq]; cand.splice(pq, 1); cand.unshift(pc); cand.orig = pq; }
      for (var q = 0; q <= cand.length; q++) {
        if (q === cand.length) { if (force !== true) break; q = 0; force = 'now'; }
        var bx = { x: l.x + cand[q][0], y: l.y + cand[q][1], w: w, h: h };
        if (bx.x < 2 || bx.y < 2 || bx.x + w > W - 2 || bx.y + h > H - 2) { if (force === 'now') { bx.x = Math.max(2, Math.min(W - w - 2, bx.x)); bx.y = Math.max(2, Math.min(H - h - 2, bx.y)); } else continue; }
        var hitb = false;
        for (var j = 0; j < boxes.length; j++) { var b = boxes[j]; if (bx.x < b.x + b.w + 3 && bx.x + bx.w + 3 > b.x && bx.y < b.y + b.h + 2 && bx.y + bx.h + 2 > b.y) { hitb = true; break; } }
        if (hitb && force !== 'now') continue;
        boxes.push(bx); LPOS[lk] = cand.orig != null ? (q === 0 ? cand.orig : (q <= cand.orig ? q - 1 : q)) : q;
        ctx.textBaseline = 'top'; ctx.textAlign = 'left';
        if (l.o.box) { ctx.fillStyle = l.o.box; rr(bx.x - 4, bx.y - 3, w + 8, h + 5, 4); ctx.fill(); }
        else { ctx.lineWidth = 4; ctx.strokeStyle = c.halo; ctx.lineJoin = 'round'; ctx.strokeText(l.t, bx.x, bx.y); }
        ctx.fillStyle = l.o.col || c.text; ctx.fillText(l.t, bx.x, bx.y);
        return;
      }
    });
    if (stat) SBOX = boxes.slice(0, RES.length).concat(boxes.slice(nR));   // the moving labels (aircraft, GPS) avoid the placed words; they have their own box, so they may cross the line
  }
  function rr(x, y, w, h, r) { gx.beginPath(); gx.moveTo(x + r, y); gx.arcTo(x + w, y, x + w, y + h, r); gx.arcTo(x + w, y + h, x, y + h, r); gx.arcTo(x, y + h, x, y, r); gx.arcTo(x, y, x + w, y, r); gx.closePath(); }
  function tri(p, s) { gx.beginPath(); gx.moveTo(p[0], p[1] - s); gx.lineTo(p[0] + s * 0.9, p[1] + s * 0.6); gx.lineTo(p[0] - s * 0.9, p[1] + s * 0.6); gx.closePath(); }
  function anti(ms) {   // anti-solar point (night centre) for a time - NOAA low-precision sun position
    var n = ms / 864e5 - 10957.5, Lm = (280.46 + 0.9856474 * n) % 360, g = ((357.528 + 0.9856003 * n) % 360) * PI / 180;
    var lam = (Lm + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * PI / 180, eps = (23.439 - 4e-7 * n) * PI / 180;
    var dec = Math.asin(Math.sin(eps) * Math.sin(lam)) * 180 / PI, ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam)) * 180 / PI;
    var eot = ((Lm - ra + 540) % 360) - 180, um = ((ms % 864e5) + 864e5) % 864e5 / 6e4, lon = -(um - 720 + eot * 4) / 4;
    lon = ((lon + 540) % 360) - 180; return [((lon + 360) % 360) - 180, -dec];
  }
  var tLast = 0, tTimer = null, TC = null;
  function terrain(x, c, LAND) {   // grey shaded relief over land - coarse while the globe moves, sharp when it stops
    var now = Date.now(), moving = now - tLast < 220; tLast = now;
    var sc = moving ? 5 : 2, q0 = Math.max(0.03, 0.5 / k), tk = [W, H, sc, Math.round(rot[0] / q0), Math.round(rot[1] / q0), k.toFixed(3), c.land].join('|');
    clearTimeout(tTimer); if (moving) tTimer = setTimeout(function () { tLast = 0; SKEY = ''; req(); }, 260);
    if (!(TC && TC.key === tk)) {
      var w = Math.ceil(W / sc), h = Math.ceil(H / sc), im = x.createImageData(w, h), o = im.data, S2 = r0 * k, cx = W / 2, cy = H / 2;
      var l0 = -rot[0] * PI / 180, f0 = -rot[1] * PI / 180, sf = Math.sin(f0), cf = Math.cos(f0), TW = TERR.w, TH = TERR.h, TD = TERR.d;
      var dk = c.land.charAt(0) === '#' && parseInt(c.land.slice(1, 3), 16) < 128, aS = dk ? 190 : 150, mS = dk ? 165 : 120, aH = dk ? 125 : 105, mH = dk ? 100 : 90;
      for (var j = 0; j < h; j++) {
        var yy = -((j + 0.5) * sc - cy) / S2;
        for (var i = 0; i < w; i++) {
          var xx = ((i + 0.5) * sc - cx) / S2, rho = Math.sqrt(xx * xx + yy * yy); if (rho >= 0.999) continue;
          var cc = Math.asin(rho), sc2 = Math.sin(cc), cc2 = Math.cos(cc);
          var lat = rho ? Math.asin(cc2 * sf + yy * sc2 * cf / rho) : f0, lon = l0 + (rho ? Math.atan2(xx * sc2, rho * cc2 * cf - yy * sc2 * sf) : 0);
          var u = Math.floor(((lon * 180 / PI + 540) % 360) / 360 * TW), v = Math.floor((90 - lat * 180 / PI) / 180 * TH); if (v < 0) v = 0; if (v >= TH) v = TH - 1; if (u >= TW) u -= TW;
          var dv = (TD[v * TW + u] - 128) / 100; if (dv > -0.02 && dv < 0.02) continue; var k2 = (j * w + i) * 4;
          if (dv < 0) { o[k2] = o[k2 + 1] = o[k2 + 2] = dk ? 0 : 30; o[k2 + 3] = Math.min(aS, -dv * mS * 1.6); } else { o[k2] = o[k2 + 1] = o[k2 + 2] = 255; o[k2 + 3] = Math.min(aH, dv * mH * 1.8); }
        }
      }
      var tc = (TC && TC.cv && TC.cv.width === w && TC.cv.height === h) ? TC.cv : document.createElement('canvas'); tc.width = w; tc.height = h; tc.getContext('2d').putImageData(im, 0, 0); TC = { key: tk, cv: tc };
    }
    x.save(); x.beginPath(); path(LAND); x.clip(); x.imageSmoothingEnabled = true; x.drawImage(TC.cv, 0, 0, W, H); x.restore();
  }
  function skey() { return [W, H, DPR, rot[0].toFixed(3), rot[1].toFixed(3), k.toFixed(4), themeVer, JSON.stringify(lay), pop.hidden ? '' : pop.offsetWidth + 'x' + pop.offsetHeight].join('|'); }
  function renderStatic(c) {
    if (SCV.width !== cv.width || SCV.height !== cv.height) { SCV.width = cv.width; SCV.height = cv.height; }
    var x = sctx; gx = sctx; path = pathS; var B = base(r0 * k * PI / 180);
    x.setTransform(DPR, 0, 0, DPR, 0, 0); x.globalAlpha = 1; x.setLineDash([]); x.lineCap = 'round'; x.lineJoin = 'round';
    x.fillStyle = c.bg; x.fillRect(0, 0, W, H);
    x.beginPath(); path(SPHERE); x.fillStyle = c.ocean; x.fill();
    x.beginPath(); path(GRAT); x.strokeStyle = c.grat; x.lineWidth = 0.7; x.stroke();
    x.beginPath(); path(B.land); x.fillStyle = c.land; x.fill(); x.strokeStyle = c.coast; x.lineWidth = 0.8; x.stroke();
    if (lay.terr && TERR) terrain(x, c, B.land);
    if (lay.cty) { x.beginPath(); path(B.bord); x.strokeStyle = c.border; x.lineWidth = 0.6; x.stroke(); }
    x.beginPath(); path(SPHERE); x.strokeStyle = c.coast; x.lineWidth = 1.2; x.stroke();
    LBL = []; HITS = []; RES = []; SWP = [];
    var big = k >= 2.2, huge = k >= 5;
    if (lay.cty && k >= 1.3) (W0.clab || []).forEach(function (l) { if (l[3] > (k < 2 ? 1 : (k < 4 ? 2 : 3))) return; var ll = [l[1], l[2]]; if (!vis(ll)) return; var p = proj(ll); if (onScreen(p)) label(l[0].toUpperCase(), p, { center: true, pri: 1, col: c.muted, font: '600 10px ' + c.font, size: 11 }); });
    if (lay.fir) {
      x.setLineDash([7, 5]);
      G.fir.forEach(function (f) { x.beginPath(); path(f.geo); x.strokeStyle = c.fir; x.globalAlpha = f.r ? 0.95 : 0.5; x.lineWidth = f.r ? 1.7 : 1.1; x.stroke(); });
      x.setLineDash([]); x.globalAlpha = 1;
      G.firlab.forEach(function (l) { var ll = [l[2], l[1]]; if (!vis(ll)) return; var p = proj(ll), cf = D.comms_fir && D.comms_fir[l[0].slice(0, 4)], fq = cf && cf.vhf ? cf.vhf.match(/\d{3}\.\d{1,3}/g) : null; if (onScreen(p)) label(l[0] + (fq ? ' · ' + fq.join(' / ') : ''), p, { center: true, pri: 2, col: c.fir, font: 'italic 600 11px ' + c.font, size: 12 }); });
    }
    if (IF && lay.ifbp) {
      var cy = c.cyan;
      IF.polys.forEach(function (q) { x.beginPath(); path(q.f); x.fillStyle = cy; x.globalAlpha = 0.22; x.fill(); x.globalAlpha = 0.9; x.setLineDash([3, 4]); x.strokeStyle = cy; x.lineWidth = 1.6; x.stroke(); x.setLineDash([]); x.globalAlpha = 1;
        if (vis(q.lab)) { var lp = proj(q.lab); if (onScreen(lp)) label('IFBP · ' + q.name, lp, { center: true, pri: 4, col: cy, font: '800 11px ' + c.font, size: 12 }); } });
      IF.segs.forEach(function (q) {
        if (q.w < q.a) { x.beginPath(); path(subLine(q.w, q.a)); x.strokeStyle = cy; x.globalAlpha = 0.2; x.lineWidth = 20; x.stroke(); }
        x.beginPath(); path(subLine(q.a, q.b)); x.strokeStyle = cy; x.globalAlpha = 0.38; x.lineWidth = 20; x.stroke(); x.globalAlpha = 1;
        for (var t = q.w; t <= q.b; t += 3) { var ll = posAt(t); if (!vis(ll)) continue; var pt = proj(ll); if (onScreen(pt)) HITS.push({ x: pt[0], y: pt[1], r: 0, lo: 1, html: ifbpHtml }); }
        var mid = posAt((q.a + q.b) / 2); if (vis(mid)) { var mp = proj(mid); if (onScreen(mp)) label('IFBP 126.9 · ' + (L.wz ? L.wz(q.a) + '–' + L.wz(q.b) : hm(q.a) + '–' + hm(q.b)), mp, { pri: 8, box: cy, col: '#06222c', font: '800 11px ' + c.font, size: 12, off: 16 }); }
        if (q.w < q.a) { var wl = posAt(q.w); if (vis(wl)) { var wp = proj(wl); if (onScreen(wp)) label('IFBP listen ' + (L.wz ? L.wz(q.w) : hm(q.w)), wp, { pri: 7, col: cy, font: '800 11px ' + c.font, size: 12, off: 12 }); } }
      });
    }
    if (SL && lay.slop) {
      var SCOL = { authorized: c.grn, not_authorized: '#e5534b', not_published: c.muted }, STX = { authorized: '#0b1a0e', not_authorized: '#ffffff', not_published: c.bg };
      SL.segs.forEach(function (q) {
        var col = SCOL[q.st] || c.muted, key = 'slop:' + q.fir;
        x.beginPath(); path(subLine(q.a, q.b)); x.strokeStyle = col; x.globalAlpha = q.st === 'not_published' ? 0.5 : 0.6; x.lineWidth = 20; x.lineCap = 'butt'; x.stroke(); x.globalAlpha = 1; x.lineCap = 'round';
        for (var t = q.a + 1; t < q.b; t += 3) { var ll = posAt(t); if (!vis(ll)) continue; var pt = proj(ll); if (onScreen(pt)) HITS.push({ x: pt[0], y: pt[1], r: 0, lo: 1, key: key, html: function () { return slopHtml(q); } }); }
        var mid = posAt((q.a + q.b) / 2); if (vis(mid)) { var mp = proj(mid); if (onScreen(mp)) label((q.st === 'authorized' ? '✓ SLOP ' : (q.st === 'not_authorized' ? '✗ SLOP ' : 'SLOP n/p ')) + q.fir, mp, { pri: 8, box: col, col: STX[q.st] || c.bg, font: '800 11px ' + c.font, size: 12, off: 16 }); }
      });
    }
    if (CP && lay.cpdlc) {
      var VIO = '#8f7cf0';
      CP.segs.forEach(function (q) {
        var key = 'cpdlc:' + q.fir;
        x.beginPath(); path(subLine(q.a, q.b)); x.lineCap = 'butt';
        if (q.addr) { x.strokeStyle = VIO; x.globalAlpha = 0.55; x.lineWidth = 20; if (q.st === 'trial') x.setLineDash([14, 8]); }
        else { x.strokeStyle = c.muted; x.globalAlpha = 0.25; x.lineWidth = 12; }
        x.stroke(); x.setLineDash([]); x.globalAlpha = 1; x.lineCap = 'round';
        for (var t = q.a + 1; t < q.b; t += 3) { var ll = posAt(t); if (!vis(ll)) continue; var pt = proj(ll); if (onScreen(pt)) HITS.push({ x: pt[0], y: pt[1], r: 0, lo: 1, key: key, html: function () { return cpdlcHtml(q); } }); }
        var mid = posAt((q.a + q.b) / 2);
        if (vis(mid)) { var mp = proj(mid); if (onScreen(mp)) label(q.addr ? 'CPDLC ' + q.addr + (q.st === 'trial' ? ' (trial)' : '') : 'no CPDLC · ' + q.fir, mp, q.addr ? { pri: 8, box: VIO, col: '#ffffff', font: '800 11px ' + c.font, size: 12, off: 16 } : { pri: 3, col: c.muted, font: '700 11px ' + c.font, size: 12, off: 14 }); }
        if (q.addr && q.dl != null) {
          var dl = posAt(q.dl); if (vis(dl)) { var dp = proj(dl); if (onScreen(dp)) {
            x.beginPath(); x.moveTo(dp[0], dp[1] - 8); x.lineTo(dp[0] + 8, dp[1]); x.lineTo(dp[0], dp[1] + 8); x.lineTo(dp[0] - 8, dp[1]); x.closePath(); x.fillStyle = VIO; x.fill(); x.strokeStyle = c.halo; x.lineWidth = 1.4; x.stroke();
            HITS.push({ x: dp[0], y: dp[1], r: 7, key: key, html: function () { return cpdlcHtml(q); } });
            label('logon ' + q.addr + ' by ' + (L.wz ? L.wz(q.dl) : hm(q.dl)), dp, { pri: 9, col: VIO, font: '800 12px ' + c.font, size: 13, off: 11 }); } }
        }
      });
    }
    if (lay.rings) {
      x.setLineDash([5, 6]);
      RINGS.forEach(function (r) { x.beginPath(); path(r.geo); x.strokeStyle = r.a.col; x.globalAlpha = 0.75; x.lineWidth = 1.4; x.stroke(); });
      x.setLineDash([]); x.globalAlpha = 1;
    }
    if (lay.ncz) {
      NA.forEach(function (n) { n.geo.forEach(function (g3, j) { x.beginPath(); path(g3); x.fillStyle = c.amb; x.globalAlpha = 0.13; x.fill(); x.globalAlpha = 0.9; x.setLineDash([4, 4]); x.strokeStyle = c.amb; x.lineWidth = 1.2; x.stroke(); x.setLineDash([]); x.globalAlpha = 1;
        var pc = n.q.pts[j], pp2 = vis([pc[1], pc[0]]) ? proj([pc[1], pc[0]]) : null; if (pp2 && j === 0) { HITS.push({ x: pp2[0], y: pp2[1], r: 16, html: (function (q) { return function () { return '<b class="gph">⚠ ' + esc(q.id) + ' (' + esc(q.fir) + ')</b><div>' + esc(q.label) + '</div><div class="gpn">Circles: ' + q.r_nm + ' NM around the towns the NOTAM names – indicative only.</div>'; }; })(n.q) }); } }); });
      NZ.forEach(function (z) {
        x.beginPath(); path(subLine(z.a, z.b)); x.strokeStyle = z.kind === 'conflict' ? c.red : c.amb; x.lineWidth = z.kind === 'conflict' ? 16 : 11; x.globalAlpha = z.kind === 'conflict' ? 0.35 : 0.3;
        if (z.kind !== 'conflict') x.setLineDash([10, 7]); x.stroke(); x.setLineDash([]); x.globalAlpha = 1;
        var m = posAt((z.a + z.b) / 2); if (!vis(m)) return; var pm = proj(m);
        x.beginPath(); x.moveTo(pm[0], pm[1] - 11); x.lineTo(pm[0] + 10, pm[1] + 7); x.lineTo(pm[0] - 10, pm[1] + 7); x.closePath(); x.fillStyle = z.kind === 'conflict' ? c.red : c.amb; x.fill(); x.lineWidth = 1.2; x.strokeStyle = c.halo; x.stroke();
        x.fillStyle = '#fff'; x.font = '800 11px ' + c.font; x.textAlign = 'center'; x.fillText('!', pm[0], pm[1] + 5); x.textAlign = 'left';
        HITS.push({ x: pm[0], y: pm[1], r: 16, html: function () { return '<b class="gph">⚠ ' + (z.kind === 'conflict' ? 'Security / conflict' : 'GNSS interference') + ' – ' + esc(z.fir) + ' ' + esc(z.name) + ' FIR</b><div>Route in this FIR ' + hm(z.a) + '–' + hm(z.b) + ' (' + zt(L.toMin() + z.a) + '–' + zt(L.toMin() + z.b) + ')</div>' +
          z.ns.map(function (n) { return '<div class="gpx2"><b>' + esc(n.id) + '</b> ' + esc(n.x.length > 420 ? n.x.slice(0, 420) + '…' : n.x) + '</div>'; }).join('') + '<div class="gpn">OFP en-route NOTAMs. The band marks the planned route inside the FIR the NOTAM names, not an exact area.</div>'; } });
      });
    }
    if (lay.esc) ESC.forEach(function (o) {
      var mid = posAt((Math.max(0, o.c.a) + Math.min(TE, o.c.b)) / 2), al = [o.a.lon, o.a.lat];
      x.beginPath(); path({ type: 'LineString', coordinates: [posAt(Math.max(0, o.c.a)), al, posAt(Math.min(TE, o.c.b))] }); x.setLineDash([2, 5]); x.strokeStyle = c.amb; x.lineWidth = 1.6; x.globalAlpha = 0.85; x.stroke(); x.setLineDash([]); x.globalAlpha = 1;
      if (vis(al)) { var pa = proj(al); label('ESC ' + o.a.icao, [pa[0] + 8, pa[1] + 14], { col: c.amb }); HITS.push({ x: pa[0], y: pa[1], r: 12, html: function () { return '<b class="gph">Escape airport ' + esc(o.a.icao) + '</b><div>TEM chain: ' + esc(o.c.cls) + ', ' + hm(o.c.a) + '–' + hm(o.c.b) + ' (' + esc(o.c.note) + ')</div><div class="gpn">Dotted lines: the route part it covers. Detailed escape routes / drift-down strategies: OFP RAIG H1 / H2 and OM-C.</div>'; } }); }
    });
    (G.etseg || []).forEach(function (s) { x.beginPath(); path(subLine(s[0], s[1])); x.strokeStyle = c.etops; x.lineWidth = 12; x.globalAlpha = 0.85; x.stroke(); x.globalAlpha = 1; });
    x.beginPath(); path(ROUTE); x.strokeStyle = c.halo; x.lineWidth = 5.5; x.stroke();
    x.beginPath(); path(ROUTE); x.strokeStyle = c.route; x.lineWidth = 2.4; x.stroke();
    // waypoints
    RT.forEach(function (w, i) {
      if (i === 0 || i === RT.length - 1) return;
      if (!w.m && !big) return;
      var ll = [w.lon, w.lat]; if (!vis(ll)) return; var p = proj(ll); if (!onScreen(p)) return;
      tri(p, w.m ? 5.5 : 4); x.fillStyle = c.route; x.fill(); x.lineWidth = 1.2; x.strokeStyle = c.halo; x.stroke(); SWP.push({ p: p, s: w.m ? 5.5 : 4, e: w.e });
      HITS.push({ x: p[0], y: p[1], r: w.m ? 4 : -14, html: function () { return wptHtml(w); } });
      if (lay.wpt && (w.m || huge)) label(w.n + (w.m ? ' ' + (L.wz ? L.wz(w.e) : hm(w.e)) : ''), p, { pri: w.m ? 6 : 3, font: (w.m ? '700 12px ' : '500 11px ') + c.font, size: w.m ? 13 : 12 });
      if (lay.wpt && w.m && w.note && huge) label(w.note, [p[0], p[1] + 14], { pri: 2, col: c.muted, font: 'italic 500 11px ' + c.font, size: 12 });
    });
    // FIR entries along the route
    (D.firseq || D.firs).forEach(function (f) {
      if (!f.eet_min) return; var ll = posAt(f.eet_min); if (!vis(ll)) return; var p = proj(ll); if (!onScreen(p)) return;
      x.beginPath(); x.arc(p[0], p[1], 6.5, 0, 2 * PI); x.strokeStyle = c.fir; x.lineWidth = 2; x.stroke();
      HITS.push({ x: p[0], y: p[1], r: 6, html: function () { return '<b class="gph">FIR entry ' + esc(f.fir) + ' ' + esc(f.name) + '</b><div>EET ' + tz(f.eet_min) + ' (FPL EET)</div>'; } });
      if (lay.fir) label('▶ ' + f.fir + ' ' + (L.wz ? L.wz(f.eet_min) : hm(f.eet_min)), p, { pri: 5, col: c.fir, font: '700 11px ' + c.font, size: 12, off: 10 });
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
      HITS.push({ x: b[0], y: b[1], r: 16, html: function () { return '<b class="gph">' + a.n + ' · ' + esc(a.t) + ' – ' + hm(a.e) + '</b><div>' + esc(a.x) + '</div>'; } });
    });
    placeLabels(c, true);
    SHITS = HITS; path = pathD; gx = ctx;
  }
  function draw() {
    raf = 0; if (!W || !visible()) return;
    var c = colors(), x = ctx; proj.translate([W / 2, H / 2]).scale(r0 * k).rotate(rot);
    var key = skey(); if (key !== SKEY) { renderStatic(c); SKEY = key; }
    x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.drawImage(SCV, 0, 0);
    x.setTransform(DPR, 0, 0, DPR, 0, 0); x.setLineDash([]); x.lineCap = 'round'; x.lineJoin = 'round';
    gx = ctx; path = pathD; HITS = SHITS.slice(); LBL = []; RES = [];
    var e = curE(), eC = Math.max(0, Math.min(T, e));
    if (lay.night) { var an = anti(Date.now() + (e - L.el()) * 60000); [90, 84, 78].forEach(function (r) { x.beginPath(); path(d3.geoCircle().center(an).radius(r).precision(3)()); x.fillStyle = 'rgba(0,6,24,' + (r === 90 ? 0.22 : 0.12) + ')'; x.fill(); }); }
    if (eC > 0) { x.beginPath(); path(subLine(0, eC)); x.strokeStyle = c.grn; x.lineWidth = 3.2; x.stroke(); }
    if (e >= 0 && e < T) { var sg = seg(eC); x.beginPath(); path({ type: 'LineString', coordinates: [posAt(eC), RC[sg.k + 1]] }); x.strokeStyle = c.mag; x.lineWidth = 3.6; x.stroke(); }
    SWP.forEach(function (w) { if (w.e > eC) return; tri(w.p, w.s); x.fillStyle = c.grn; x.fill(); x.lineWidth = 1.2; x.strokeStyle = c.halo; x.stroke(); });
    /* v3.7 (pilot 11 NOV: "not very clear which one is which ... put a line ... to see which airport is where"): the RETURN (green) and AHEAD (blue)
       airports of the two boxes under the map - a solid line from the aircraft in the colour of the box, a ring on the airport and its code + distance.
       Always drawn (it was a thin dashed line, only with the Airports layer on). */
    { var na = nearApts(posAt(eC), distAt(eC)), pp0 = posAt(eC);
      [[na.back, c.grn, '◀ ', ''], [na.ahead, c.cyan, '', ' ▶']].forEach(function (z) {
        if (!z[0] || z[0].d < 1) return; var al = [z[0].a.lon, z[0].a.lat], far = z[0].d > 420;
        x.beginPath(); path({ type: 'LineString', coordinates: [pp0, al] }); x.strokeStyle = c.halo; x.lineWidth = 5.5; x.globalAlpha = 0.8; x.stroke();
        x.beginPath(); path({ type: 'LineString', coordinates: [pp0, al] }); if (far) x.setLineDash([10, 6]); x.strokeStyle = z[1]; x.lineWidth = 3; x.globalAlpha = 1; x.stroke(); x.setLineDash([]);
        if (vis(al)) { var ap = proj(al); x.beginPath(); x.arc(ap[0], ap[1], 10, 0, 6.2832); x.strokeStyle = c.halo; x.lineWidth = 5; x.stroke(); x.beginPath(); x.arc(ap[0], ap[1], 10, 0, 6.2832); x.strokeStyle = z[1]; x.lineWidth = 3; x.stroke();
          if (onScreen(ap)) label(z[2] + z[0].a.icao + ' ' + Math.round(z[0].d) + ' NM' + z[3], ap, { pri: 10, box: z[1], col: c.bg, font: '800 11px ' + c.font, size: 12, off: 18 }); }
      });
    }
    // aircraft (planned position)
    var pp = posAt(eC);
    if (vis(pp)) {
      var p = proj(pp), ahead = posAt(eC < T - 3 ? eC + 3 : eC), behind = posAt(eC < T - 3 ? eC : eC - 3), a1 = proj(behind), a2 = proj(ahead);
      var ang = a1 && a2 ? Math.atan2(a2[0] - a1[0], -(a2[1] - a1[1])) : 0;
      x.beginPath(); x.arc(p[0], p[1], 19, 0, 2 * PI); x.fillStyle = c.mag; x.globalAlpha = 0.2; x.fill(); x.globalAlpha = 1;
      if (PLANE) { x.save(); x.translate(p[0], p[1]); x.rotate(ang); x.scale(1.2, 1.2); x.fillStyle = c.mag; x.fill(PLANE); x.lineWidth = 1.3; x.strokeStyle = c.halo; x.stroke(PLANE); x.restore(); }
      HITS.push({ x: p[0], y: p[1], r: 14, html: planeHtml });
      label((mode === 'live' ? '✈ ' : '✈ PREVIEW ') + (e < 0 ? 'on ground' : (e > T ? 'landed' : zt(L.toMin() + eC + (L.off ? L.off() : 0)) + ' · +' + hm(eC + (L.off ? L.off() : 0)))), p, { pri: 100, box: c.mag, col: '#1a0718', font: '800 12px ' + c.font, size: 13, off: 20 });
    }
    var gf = gpsFix();
    if (gf && vis([gf.lon, gf.lat])) {
      var gp = proj([gf.lon, gf.lat]), gsn = snap([gf.lon, gf.lat]), gsv = gsOf(gf, gsn), hd = gf.hdg != null && !isNaN(gf.hdg) && gsv.gps ? gf.hdg : brg(RC[gsn.k], RC[gsn.k + 1]);
      var gq = proj([gf.lon + Math.sin(hd * PI / 180) * 0.3 / Math.max(0.2, Math.cos(gf.lat * PI / 180)), gf.lat + Math.cos(hd * PI / 180) * 0.3]);
      var ga = gq ? Math.atan2(gq[0] - gp[0], -(gq[1] - gp[1])) : 0, cyc = c.cyan;
      x.beginPath(); x.arc(gp[0], gp[1], 19, 0, 2 * PI); x.fillStyle = cyc; x.globalAlpha = 0.22; x.fill(); x.globalAlpha = 1;
      if (PLANE) { x.save(); x.translate(gp[0], gp[1]); x.rotate(ga); x.scale(1.2, 1.2); x.fillStyle = cyc; x.fill(PLANE); x.lineWidth = 1.3; x.strokeStyle = c.halo; x.stroke(PLANE); x.restore(); }
      HITS.push({ x: gp[0], y: gp[1], r: 14, html: gpsHtml });
      label('◎ GPS ' + hh(mod(gf.t)) + 'Z', gp, { pri: 99, box: cyc, col: '#06222c', font: '800 12px ' + c.font, size: 13, off: 20 });
    }
    placeLabels(c, false);
  }

  /* ---------- side view: MORA along the route, planned levels, aircraft; return / ahead airports either side */
  var PV = host.querySelector('.gpsvg'), PX0 = 52, PX1 = 990, PY0 = 158, PY1 = 24, PMAX = 42000, PW = 1000, PH = 190, PFIT = false;
  /* v3.7 (pilot 10 + 11 NOV: "the vertical profile ... doesn't fill its area" in landscape): the drawing had a fixed 1000 x 190 shape and was
     letter-boxed in a wide, low box. Now 1 unit = 1 screen pixel of the box as it is, redrawn whenever the box changes (rotate, split, full screen). */
  function fitProfile() {
    if (!PV) return false; var w = Math.round(PV.clientWidth), h_ = Math.round(PV.clientHeight); if (w < 200 || h_ < 60) return false;
    if (PFIT && Math.abs(w - PW) < 3 && Math.abs(h_ - PH) < 3) return false;
    PFIT = true; PW = w; PH = h_; PX0 = 40; PX1 = PW - 8; PY1 = 20; PY0 = PH - 29; PV.setAttribute('viewBox', '0 0 ' + PW + ' ' + PH); return true;
  }
  function px(e) { return PX0 + (PX1 - PX0) * Math.max(0, Math.min(T, e)) / T; }
  function py(ft) { return PY0 - (PY0 - PY1) * Math.max(0, Math.min(PMAX, ft)) / PMAX; }
  function lvlAt(e) { var P = PR.pts; for (var i = 0; i < P.length - 1; i++) if (e <= P[i + 1][0]) { var f = P[i + 1][0] > P[i][0] ? (e - P[i][0]) / (P[i + 1][0] - P[i][0]) : 1; return P[i][1] + (P[i + 1][1] - P[i][1]) * Math.max(0, Math.min(1, f)); } return 0; }
  function drawProfile() {
    var h = '', lowBox = (PY0 - PY1) < 70, gap = PFIT ? 46 : 34;
    (D.firseq || D.firs).forEach(function (f, i) { var b = i + 1 < (D.firseq || D.firs).length ? (D.firseq || D.firs)[i + 1].eet_min : T, fw = px(b) - px(f.eet_min); h += '<rect x="' + px(f.eet_min) + '" y="2" width="' + fw + '" height="14" class="' + f.cls + '"/>' + (fw > (PFIT ? 34 : 24) ? '<text x="' + (px(f.eet_min) + 3) + '" y="13" class="ptx b">' + esc(f.fir) + '</text>' : ''); });
    (lowBox ? [20000, 40000] : [10000, 20000, 30000, 40000]).forEach(function (ft) { h += '<line x1="' + PX0 + '" x2="' + PX1 + '" y1="' + py(ft) + '" y2="' + py(ft) + '" class="pg"/><text x="' + (PX0 - 4) + '" y="' + (py(ft) + 4) + '" class="ptx r">FL' + ft / 100 + '</text>'; });
    for (var m = 0; m <= T; m += 60) h += '<line x1="' + px(m) + '" x2="' + px(m) + '" y1="' + PY1 + '" y2="' + PY0 + '" class="pg"/>';
    var hi = null;
    PR.mora.forEach(function (q) { var c_ = q[2] > 10000 ? 'mo2' : (q[2] > 5000 ? 'mo1' : 'mo0'); h += '<rect x="' + px(q[0]) + '" y="' + py(q[2]) + '" width="' + Math.max(0.6, px(q[1]) - px(q[0])) + '" height="' + (PY0 - py(q[2])) + '" class="' + c_ + '"/>'; if (!hi || q[2] > hi[2]) hi = q; });
    if (hi) h += '<text x="' + ((px(hi[0]) + px(hi[1])) / 2) + '" y="' + (py(hi[2]) - 4) + '" class="ptx c mo">MORA ' + hi[2] + '</text>';
    if (D.etops) h += '<rect x="' + px(D.etops[0]) + '" y="' + (PY0 + 1) + '" width="' + (px(D.etops[1]) - px(D.etops[0])) + '" height="5" class="pet"/>';
    h += '<polyline class="plv" points="' + PR.pts.map(function (q) { return px(q[0]) + ',' + py(q[1]); }).join(' ') + '"/>';
    var lastX = -99;
    RT.forEach(function (w, i) { if (!w.m && i !== 0 && i !== RT.length - 1) return; var xx = px(w.e); h += '<line x1="' + xx + '" x2="' + xx + '" y1="' + PY0 + '" y2="' + (PY0 + 7) + '" class="ptk"/>';
      if (xx - lastX > gap) { h += '<text x="' + xx + '" y="' + (PY0 + 18) + '" class="ptx c">' + esc(w.n) + '</text><text x="' + xx + '" y="' + (PY0 + 29) + '" class="ptx c m">' + (L.wz ? L.wz(w.e) : hm(w.e)) + '</text>'; lastX = xx; } });
    h += '<line class="pnow" x1="0" x2="0" y1="' + PY1 + '" y2="' + PY0 + '"/><g class="pgps" style="display:none"><circle r="7"/></g>' +
      '<g class="pac"><circle r="13" class="pah"/><path d="M0,-15C1.7,-15 2.2,-12 2.2,-9.5L2.2,-3.5L14,3L14,6L2.2,2.6L2.2,9L5.5,12L5.5,14.2L0,12.8L-5.5,14.2L-5.5,12L-2.2,9L-2.2,2.6L-14,6L-14,3L-2.2,-3.5L-2.2,-9.5C-2.2,-12 -1.7,-15 0,-15Z" transform="rotate(90) scale(' + (PFIT ? 0.62 : 0.85) + ')"/></g>';
    PV.innerHTML = h; if (PFIT) { var ph_ = PV.querySelector('.pah'); if (ph_) ph_.setAttribute('r', 10); }
  }
  if (PV && PR) (function () {
    fitProfile(); drawProfile();
    function refit() { if (fitProfile()) { drawProfile(); updProfile(); } }
    if (typeof ResizeObserver !== 'undefined') { try { new ResizeObserver(function () { refit(); }).observe(PV); } catch (x0) { } }
    window.addEventListener('resize', function () { setTimeout(refit, 60); }); window.addEventListener('orientationchange', function () { setTimeout(refit, 250); });
    function pick(ev) { var r = PV.getBoundingClientRect(); if (!r.width) return; var xv = (ev.clientX - r.left) / r.width * PW, e = (xv - PX0) / (PX1 - PX0) * T; stopPlay(); pv = Math.max(0, Math.min(T, e)); setMode('preview'); if (follow) centerPlane(false); }
    var dn = false;
    PV.addEventListener('pointerdown', function (ev) { dn = true; try { PV.setPointerCapture(ev.pointerId); } catch (x_) { } pick(ev); });
    PV.addEventListener('pointermove', function (ev) { if (dn) pick(ev); });
    PV.addEventListener('pointerup', function () { dn = false; }); PV.addEventListener('pointercancel', function () { dn = false; });
  })();
  function aptBox(o, dir) {
    if (!o) return '<small>' + (dir < 0 ? '◀ RETURN' : 'AHEAD ▶') + '</small><b>–</b>';
    var near = o.d <= 420, mins = Math.round(o.d / 7);
    return '<small>' + (dir < 0 ? '◀ RETURN · 1 h' : 'AHEAD · 1 h ▶') + '</small><b>' + esc(o.a.icao) + ' <i>' + esc(o.a._cls) + '</i></b><span>' + Math.round(o.d) + ' NM · ≈' + mins + ' min</span>' +
      '<em>' + (near ? 'within 420 NM' : 'beyond 1 h (420 NM)') + '</em>';
  }
  var GB = host.querySelector('.gback'), GA = host.querySelector('.gahead');
  [GB, GA].forEach(function (bx) { if (bx) { bx.setAttribute('role', 'button'); bx.tabIndex = 0; bx.addEventListener('click', function () { if (bx._ll) { setFollow(false); fly(bx._ll, Math.max(k, 3.2), 550); } }); } });   // v3.7: tap a box = the map goes to that airport
  function updProfile() {
    if (!PV || !PR) return;
    var e = curE(), eC = Math.max(0, Math.min(T, e)), xx = px(eC), yy = py(e < 0 ? 0 : lvlAt(eC));
    var pn = PV.querySelector('.pnow'); pn.setAttribute('x1', xx); pn.setAttribute('x2', xx);
    PV.querySelector('.pac').setAttribute('transform', 'translate(' + xx + ',' + yy + ')');
    PV.querySelector('.pac').classList.toggle('prev', mode !== 'live');
    var gf = gpsFix(), gp = PV.querySelector('.pgps');
    if (gf) { var ga = gpsAlong(gf), ex = px(eetAtDist(ga.d)); gp.style.display = ''; gp.setAttribute('transform', 'translate(' + ex + ',' + yy + ')'); } else gp.style.display = 'none';
    var na = nearApts(posAt(eC), distAt(eC));
    GB.innerHTML = aptBox(na.back, -1); GB.classList.toggle('far', !!na.back && na.back.d > 420); GB._ll = na.back ? [na.back.a.lon, na.back.a.lat] : null;
    GA.innerHTML = aptBox(na.ahead, 1); GA.classList.toggle('far', !!na.ahead && na.ahead.d > 420); GA._ll = na.ahead ? [na.ahead.a.lon, na.ahead.a.lat] : null;
  }

  /* ---------- public */
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(size).observe(wrap); else window.addEventListener('resize', size);
  setMode('live');
  try { if (localStorage.getItem('fpapp:gps') === '1') gpsSet(true); } catch (e) { }
  return {
    tick: function () { if (!visible()) return; if (mode === 'live') { if (follow) centerPlane(false); updBar(); } refreshPop(false); req(); },
    shown: function () { loadTerrain(); size(); updBar(); req(); },
    restyle: function () { C = null; themeVer++; req(); },
    focusAction: focusAction,
    _bench: function (n, move) { var t0 = performance.now(); for (var i = 0; i < (n || 10); i++) { if (move) rot = [rot[0] + 0.3, rot[1], 0]; draw(); } return (performance.now() - t0) / (n || 10); },
    pos: function (e) { return posAt(Math.max(0, Math.min(T, e))); },
    xcheck: function () { var f = gpsFix(); return f ? xcheck(f) : null; },   // GPS vs elapsed-time position (null without a fix)
    info: function (e) {   // for the NOW screen: planned position, distance to go, nearest 1-h airports behind / ahead, planned level, TOD
      var eC = Math.max(0, Math.min(T, e)), ll = posAt(eC), na = nearApts(ll, distAt(eC)), f = function (o) { return o ? { icao: o.a.icao, cls: o.a._cls, d: Math.round(o.d), lab: o.a.lab } : null; };
      var tod = null; if (PR) for (var i = 0; i < PR.pts.length - 1; i++) if (PR.pts[i + 1][1] < PR.pts[i][1] && PR.pts[i][1] >= 10000) { tod = PR.pts[i][0]; break; }
      return { pos: ll, togo: Math.round(CUM[CUM.length - 1] - distAt(eC)), back: f(na.back), ahead: f(na.ahead), lvl: PR ? Math.round(lvlAt(eC)) : null,
        vs: PR ? lvlAt(Math.min(T, eC + 2)) - lvlAt(Math.max(0, eC - 2)) : 0, tod: tod };
    },
    showIfbp: function () { if (IF) showPop(ifbpHtml(), true, 'ifbp'); },
    /* v1.3 helpers: best position now (GPS fix when there is one, else the elapsed-time position), along-track of a GPS fix, planned GS */
    here: function (e) { var f = gpsFix(), eC = Math.max(0, Math.min(T, e)); if (f) { var s = snap([f.lon, f.lat]); return { ll: [f.lon, f.lat], src: 'gps', acc: f.acc, gs: gsOf(f, s).v, along: CUM[s.k] + s.at, xt: s.xt }; }
      return { ll: posAt(eC), src: L.isPlan() ? 'plan' : 'time', gs: this.gsAt(eC), along: distAt(eC), xt: 0 }; },
    along: function (f) { var s = snap([f.lon, f.lat]); return { d: CUM[s.k] + s.at, xt: s.xt, gs: gsOf(f, s) }; },
    alongOf: function (n) { for (var j = 0; j < RT.length; j++) if (RT[j].n === n) return CUM[j]; return null; },
    gsAt: function (e) { var s = seg(Math.max(0, Math.min(T, e))), dt = RT[s.k + 1].e - RT[s.k].e; return dt > 0 ? (CUM[s.k + 1] - CUM[s.k]) / dt * 60 : null; },
    focusApt: function (icao) { var a = null; G.apt.forEach(function (x) { if (x.icao === icao) a = x; }); if (!a) return; setFollow(false); fly([a.lon, a.lat], Math.max(k, 3.2), 550); showPop(aptHtml(a)); },
    gps: function (on) { if (on !== undefined && !!on !== GPS.on) gpsSet(!!on); return GPS.on; },
    total: function () { return CUM[CUM.length - 1]; },
    project: function (lon, lat) { return vis([lon, lat]) ? proj([lon, lat]) : null; }
  };
};
