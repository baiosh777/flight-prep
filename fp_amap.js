/* fp_amap.js v2.0 (05 NOV 26) - interactive vector airport map ("Map" in the AGC section): own drawing from the Lido AGC, today's restrictions
   as numbers, zoom / pan with the SVG viewBox (sharp at any zoom), labels at constant screen size that appear with zoom (lv0-lv4) and give way
   when they collide, tap anything -> card. Markup comes from the generator (amap_emit.py): .amwrap > .amx > .amvp > svg.amsvg; .aminfo [data-id]. */
(function () {
  'use strict';
  var LV = [0, 0.8, 1.3, 2.1, 3.4];   // screen px per chart unit at which label level n appears
  var FS = { area: 11.5, bldg: 9.5, twy: 13, tora: 9.5, rwy: 13, rwyd: 10, stand: 10.5 };
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function AM(wrap) {
    var box = wrap.querySelector('.amx'), vp = wrap.querySelector('.amvp'), svg = wrap.querySelector('svg.amsvg'), pop = wrap.querySelector('.ampop');
    var VB = svg.getAttribute('data-vb').split(' ').map(Number), X0 = VB[0], Y0 = VB[1], VW = VB[2], VH = VB[3];
    var cx = X0 + VW / 2, cy = Y0 + VH / 2, s = 1, sel = null, W = 0, H = 0, cullT = null;
    var info = {}; wrap.querySelectorAll('.aminfo [data-id]').forEach(function (d) { info[d.getAttribute('data-id')] = d; });
    var scal = [].slice.call(svg.querySelectorAll('.m-sym, .m-b'));
    var labs = [].slice.call(svg.querySelectorAll('.m-l')).map(function (t) {
      var k = (t.getAttribute('class').match(/k-(\w+)/) || [])[1], lv = +(t.getAttribute('class').match(/lv(\d)/) || [0, 0])[1];
      return { el: t, x: +t.getAttribute('x'), y: +t.getAttribute('y'), p: +t.getAttribute('data-p') || 0, n: t.textContent.length, fs: FS[k] || 11, lv: lv }; });
    labs.sort(function (a, b) { return b.p - a.p; });
    function size() { W = vp.clientWidth; H = vp.clientHeight; }
    function minS() { return W && H ? Math.min(W / VW, H / VH) : 1; }
    function lim() { var hw = W / 2 / s, hh = H / 2 / s;
      cx = 2 * hw >= VW ? X0 + VW / 2 : clamp(cx, X0 + hw, X0 + VW - hw); cy = 2 * hh >= VH ? Y0 + VH / 2 : clamp(cy, Y0 + hh, Y0 + VH - hh); }
    function render() {
      if (!W) size(); if (!W) return;
      var k = 1 / s; svg.setAttribute('viewBox', (cx - W / 2 * k) + ' ' + (cy - H / 2 * k) + ' ' + (W * k) + ' ' + (H * k));
      svg.style.setProperty('--k', k);
      for (var i = 0; i < scal.length; i++) { var e = scal[i]; e.setAttribute('transform', 'translate(' + e.getAttribute('data-x') + ',' + e.getAttribute('data-y') + ') scale(' + k + ')'); }
      for (var n = 1; n < LV.length; n++) svg.classList.toggle('s' + n, s >= LV[n]);
      box.classList.toggle('zoomed', s > minS() * 1.02);
      clearTimeout(cullT); cullT = setTimeout(cull, 90);
    }
    function cull() {   // greedy: higher priority first, hide what would overlap on screen
      var vx = cx - W / 2 / s, vy = cy - H / 2 / s, kept = [];
      labs.forEach(function (L) {
        if (s < LV[L.lv]) { L.el.classList.remove('cull'); return; }
        var w = L.n * L.fs * 0.6 + 6, h = L.fs * 1.15, x = (L.x - vx) * s - w / 2, y = (L.y - vy) * s - h / 2;
        if (x > W || y > H || x + w < 0 || y + h < 0) { L.el.classList.remove('cull'); return; }
        var hit = kept.some(function (r) { return x < r[2] && x + w > r[0] && y < r[3] && y + h > r[1]; });
        L.el.classList.toggle('cull', hit); if (!hit) kept.push([x, y, x + w, y + h]);
      });
    }
    function zoomAt(ns, px, py, anim) {
      ns = clamp(ns, minS(), minS() * 14); var ux = cx + (px - W / 2) / s, uy = cy + (py - H / 2) / s;
      if (anim) return animTo(ux - (px - W / 2) / ns, uy - (py - H / 2) / ns, ns);
      s = ns; cx = ux - (px - W / 2) / s; cy = uy - (py - H / 2) / s; lim(); render();
    }
    var raf = null;
    function animTo(tx, ty, ts) {
      cancelAnimationFrame(raf); var fx = cx, fy = cy, fs = s, t0 = performance.now();
      (function step(t) { var u = Math.min(1, (t - t0) / 260), e = u < .5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
        s = fs * Math.pow(ts / fs, e); cx = fx + (tx - fx) * e; cy = fy + (ty - fy) * e; lim(); render(); if (u < 1) raf = requestAnimationFrame(step); })(t0);
    }
    function fit(anim) { size(); var m = minS(); if (anim) animTo(X0 + VW / 2, Y0 + VH / 2, m); else { s = m; cx = X0 + VW / 2; cy = Y0 + VH / 2; lim(); render(); } }
    function rel(e) { var r = vp.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
    // ---- pointers: 1 = pan, 2 = pinch, tap = card, double-tap = zoom
    var P = {}, st = null, moved = false, lastTap = 0, downT = null;
    vp.addEventListener('pointerdown', function (e) { if (e.pointerType === 'mouse' && e.button) return; cancelAnimationFrame(raf); downT = e.target; P[e.pointerId] = rel(e);
      try { vp.setPointerCapture(e.pointerId); } catch (x) { } moved = false; var ids = Object.keys(P);
      if (ids.length === 1) st = { x: P[ids[0]][0], y: P[ids[0]][1], cx: cx, cy: cy };
      if (ids.length === 2) { var a = P[ids[0]], b = P[ids[1]]; st = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), s: s, mx: (a[0] + b[0]) / 2, my: (a[1] + b[1]) / 2, cx: cx, cy: cy }; } });
    vp.addEventListener('pointermove', function (e) { if (!P[e.pointerId]) return; P[e.pointerId] = rel(e); var ids = Object.keys(P);
      if (ids.length === 1 && st && st.d == null) { var dx = P[ids[0]][0] - st.x, dy = P[ids[0]][1] - st.y; if (Math.hypot(dx, dy) > 6) moved = true;
        if (moved) { cx = st.cx - dx / s; cy = st.cy - dy / s; lim(); render(); e.preventDefault(); } }
      else if (ids.length === 2 && st && st.d) { var a = P[ids[0]], b = P[ids[1]], d = Math.hypot(a[0] - b[0], a[1] - b[1]), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2; moved = true;
        var ns = clamp(st.s * d / st.d, minS(), minS() * 14), ux = st.cx + (st.mx - W / 2) / st.s, uy = st.cy + (st.my - H / 2) / st.s;
        s = ns; cx = ux - (mx - W / 2) / s; cy = uy - (my - H / 2) / s; lim(); render(); e.preventDefault(); } });
    function up(e) { delete P[e.pointerId]; if (!Object.keys(P).length) st = null; }
    vp.addEventListener('pointerup', function (e) { var t = downT || e.target, was = moved; up(e); if (was) return;
      var now = Date.now(), p = rel(e), hit = t.closest && t.closest('[data-id],[data-n]');
      if (hit && svg.contains(hit)) { show(hit.getAttribute('data-id') || ('n:' + hit.getAttribute('data-n'))); lastTap = 0; return; }
      if (now - lastTap < 320) { zoomAt(s < 2.5 * minS() ? s * 2.4 : minS(), p[0], p[1], true); lastTap = 0; } else { lastTap = now; hide(); } });
    vp.addEventListener('pointercancel', up);
    vp.addEventListener('wheel', function (e) { e.preventDefault(); var p = rel(e); zoomAt(s * (e.deltaY < 0 ? 1.18 : 1 / 1.18), p[0], p[1], false); }, { passive: false });
    wrap.querySelectorAll('.amctl button').forEach(function (b) { b.addEventListener('click', function () { var z = b.dataset.z;
      if (z === 'in') zoomAt(s * 1.7, W / 2, H / 2, true); else if (z === 'out') zoomAt(s / 1.7, W / 2, H / 2, true); else if (z === 'fit') { fit(true); hide(); }
      else if (z === 'full') { box.classList.toggle('amfull'); document.documentElement.classList.toggle('noscroll', box.classList.contains('amfull')); setTimeout(function () { size(); fit(false); }, 30); } }); });
    // ---- cards
    function els(id) { return id.indexOf('n:') === 0 ? svg.querySelectorAll('[data-n="' + id.slice(2) + '"]') : svg.querySelectorAll('[data-id="' + CSS.escape(id) + '"]'); }
    function show(id) {
      var d = info[id]; if (!d) return; sel = id;
      svg.querySelectorAll('.on').forEach(function (e) { e.classList.remove('on'); }); els(id).forEach(function (e) { e.classList.add('on'); });
      var its = (d.getAttribute('data-i') || '').split(' ').filter(Boolean);
      var isN = id.indexOf('n:') === 0, tt = d.getAttribute('data-t');
      pop.innerHTML = (isN ? '<span class="kn">' + id.slice(2) + '</span>' : '') + '<div><b class="amt">' + (isN ? '' : tt) + '</b>' + d.innerHTML +
        (its.length ? '<span class="amrel">' + its.map(function (n) { return '<button type="button" class="amn" data-n="' + n + '">' + n + '</button>'; }).join('') + '</span>' : '') +
        '</div><button type="button" class="agcx-x" aria-label="Close">×</button>';
      pop.hidden = false; pop.querySelector('.agcx-x').onclick = hide;
      pop.querySelectorAll('.amn').forEach(function (b) { b.onclick = function (e) { e.stopPropagation(); focus('n:' + b.dataset.n); }; });
      wrap.querySelectorAll('.amchips .amn, .amchips .amc').forEach(function (b) { b.classList.toggle('on', (b.dataset.n ? 'n:' + b.dataset.n : b.dataset.id) === id); });
    }
    function hide() { sel = null; pop.hidden = true; svg.querySelectorAll('.on').forEach(function (e) { e.classList.remove('on'); });
      wrap.querySelectorAll('.amchips .on').forEach(function (b) { b.classList.remove('on'); }); }
    function focus(id) {   // zoom to the elements of id (item number, taxiway ...) and open its card
      size(); var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, n = 0;
      els(id).forEach(function (e) { var b; if (e.hasAttribute('data-x')) b = { x: +e.getAttribute('data-x') - 8, y: +e.getAttribute('data-y') - 8, width: 16, height: 16 }; else b = e.getBBox();
        x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height); n++; });
      show(id); if (!n) return;
      var ts = clamp(Math.min(W / (x1 - x0 + 70), H * 0.62 / (y1 - y0 + 70)), minS(), minS() * 6);
      animTo((x0 + x1) / 2, (y0 + y1) / 2 + H * 0.14 / ts, ts);
      var r = box.getBoundingClientRect(), top = document.getElementById('top');
      if (r.top < 0 || r.bottom > innerHeight) window.scrollTo({ top: scrollY + r.top - (top ? top.offsetHeight : 0) - 8, behavior: 'smooth' });
    }
    wrap.querySelectorAll('.amchips .amn').forEach(function (b) { b.addEventListener('click', function () { if (sel === 'n:' + b.dataset.n) hide(); else focus('n:' + b.dataset.n); }); });
    wrap.querySelectorAll('.amchips .amc').forEach(function (b) { b.addEventListener('click', function () { if (sel === b.dataset.id) hide(); else (b.dataset.id === 'ap' ? show : focus)(b.dataset.id); }); });
    wrap._amFit = function () { var old = minS(); size(); if (!W) return; if (s <= old * 1.02 || s < minS()) fit(false); else { lim(); render(); } };
    window.addEventListener('resize', wrap._amFit);
    fit(false);
  }
  function init() {
    document.querySelectorAll('.amwrap').forEach(function (w) { if (!w._am) { w._am = 1; try { AM(w); } catch (e) { console.log('amap', e); } } });
    document.querySelectorAll('.amtog').forEach(function (t) { if (t._t) return; t._t = 1;
      t.querySelectorAll('button').forEach(function (b) { b.addEventListener('click', function () {
        var sec = t.closest('section') || document, v = b.dataset.v;
        t.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); });
        sec.querySelectorAll('.amwrap').forEach(function (w) { w.hidden = v !== 'map'; if (v === 'map' && w._amFit) setTimeout(w._amFit, 0); });
        sec.querySelectorAll('.agcwrap').forEach(function (w) { w.hidden = v !== 'chart'; var r = w.querySelector('.agcx'); if (v === 'chart' && r && r._agcFit) setTimeout(r._agcFit, 0); });
        sec.querySelectorAll('.agcsub').forEach(function (w) { w.hidden = v !== 'chart'; });
      }); }); });
  }
  window.FPAmapInit = init;
  window.addEventListener('hashchange', function () { setTimeout(function () { document.querySelectorAll('.amwrap').forEach(function (w) { if (w._amFit) w._amFit(); }); }, 60); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 0); }); else setTimeout(init, 0);
  new MutationObserver(function () { if (document.querySelector('.amwrap:not([data-i])')) { document.querySelectorAll('.amwrap').forEach(function (w) { w.setAttribute('data-i', '1'); }); setTimeout(init, 0); } })
    .observe(document.documentElement, { childList: true, subtree: true });
})();
