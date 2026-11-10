/* fp_agc.js v2.0 (05 NOV 26) - interactive airport ground chart (AGC): the Lido chart with today's restrictions, zoom / pan,
   tappable numbers, closed taxiways and rings -> a card with the details. Also the in-page jump buttons of the DEPARTURE / ARRIVAL tabs.
   Markup comes from the generator: .agcx > .agcvp > .agcin > img + svg (viewBox = chart units); .agckey li[data-n]; .agcpop. */
(function () {
  'use strict';
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function AGC(root) {
    var vp = root.querySelector('.agcvp'), inner = root.querySelector('.agcin'), pop = root.querySelector('.agcpop');
    var key = {}; (root.parentNode.querySelectorAll('.agckey li[data-n]') || []).forEach(function (li) { if (li.closest('.agcwrap') === root.closest('.agcwrap')) key[li.dataset.n] = li.querySelector('.akt').innerHTML; });
    var s = 1, tx = 0, ty = 0, MAXS = 8, sel = null;
    function minS() { var ih = inner.offsetHeight, H = vp.clientHeight; return ih && H ? Math.min(1, H / ih) : 1; }
    function big() { return inner.offsetWidth * s > vp.clientWidth + 1 || inner.offsetHeight * s > vp.clientHeight + 1; }
    function apply(anim) { inner.style.transition = anim ? 'transform .25s ease' : 'none'; inner.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + s + ')'; root.classList.toggle('zoomed', s > minS() + 0.02); }
    function limits() { var W = vp.clientWidth, H = vp.clientHeight, iw = inner.offsetWidth * s, ih = inner.offsetHeight * s;
      tx = iw <= W ? (W - iw) / 2 : clamp(tx, W - iw, 0); ty = ih <= H ? (H - ih) / 2 : clamp(ty, H - ih, 0); }
    function zoomAt(ns, cx, cy, anim) { ns = clamp(ns, minS(), MAXS); var k = ns / s; tx = cx - (cx - tx) * k; ty = cy - (cy - ty) * k; s = ns; limits(); apply(anim); }
    function fit(anim) { s = minS(); tx = 0; ty = 0; limits(); apply(anim); }
    function rel(e) { var r = vp.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
    // pointers: 1 = pan, 2 = pinch
    var P = {}, start = null, moved = false, lastTap = 0, downT = null;
    vp.addEventListener('pointerdown', function (e) { if (e.pointerType === 'mouse' && e.button) return; downT = e.target; P[e.pointerId] = rel(e); vp.setPointerCapture(e.pointerId); moved = false;
      var ids = Object.keys(P); if (ids.length === 1) start = { x: P[ids[0]][0], y: P[ids[0]][1], tx: tx, ty: ty };
      if (ids.length === 2) { var a = P[ids[0]], b = P[ids[1]]; start = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), s: s, cx: (a[0] + b[0]) / 2, cy: (a[1] + b[1]) / 2, tx: tx, ty: ty }; } });
    vp.addEventListener('pointermove', function (e) { if (!P[e.pointerId]) return; P[e.pointerId] = rel(e); var ids = Object.keys(P);
      if (ids.length === 1 && start && start.d == null) { var dx = P[ids[0]][0] - start.x, dy = P[ids[0]][1] - start.y; if (Math.hypot(dx, dy) > 6) moved = true;
        if (big()) { tx = start.tx + dx; ty = start.ty + dy; limits(); apply(false); e.preventDefault(); } }
      else if (ids.length === 2 && start && start.d) { var a = P[ids[0]], b = P[ids[1]], d = Math.hypot(a[0] - b[0], a[1] - b[1]); moved = true;
        var ns = clamp(start.s * d / start.d, minS(), MAXS), k = ns / start.s; s = ns; tx = start.cx - (start.cx - start.tx) * k; ty = start.cy - (start.cy - start.ty) * k; limits(); apply(false); e.preventDefault(); } });
    function up(e) { delete P[e.pointerId]; if (!Object.keys(P).length) start = null; }
    vp.addEventListener('pointerup', function (e) { var t = downT || e.target, wasMoved = moved; up(e);
      if (wasMoved) return;
      var now = Date.now(), p = rel(e);
      var hit = t.closest && t.closest('[data-n]');
      if (hit) { show(hit.getAttribute('data-n')); lastTap = 0; return; }
      if (now - lastTap < 320) { zoomAt(s < 2.5 * minS() ? s * 2.2 : minS(), p[0], p[1], true); lastTap = 0; } else { lastTap = now; hide(); } });
    vp.addEventListener('pointercancel', up);
    vp.addEventListener('wheel', function (e) { e.preventDefault(); var p = rel(e); zoomAt(s * (e.deltaY < 0 ? 1.18 : 1 / 1.18), p[0], p[1], false); }, { passive: false });
    root.querySelectorAll('.agcctl button').forEach(function (b) { b.addEventListener('click', function () {
      var W = vp.clientWidth / 2, H = vp.clientHeight / 2, z = b.dataset.z;
      if (z === 'in') zoomAt(s * 1.6, W, H, true); else if (z === 'out') zoomAt(s / 1.6, W, H, true); else if (z === 'fit') { fit(true); hide(); }
      else if (z === 'full') { root.classList.toggle('agcfull'); document.documentElement.classList.toggle('noscroll', root.classList.contains('agcfull')); setTimeout(function () { fit(false); }, 30); } }); });
    function show(n) {
      sel = n; root.querySelectorAll('[data-n]').forEach(function (el) { el.classList.toggle('on', el.getAttribute('data-n') === n); });
      var src = (root.closest('.agcwrap') || root).querySelector('.agcsrc');
      pop.innerHTML = '<span class="kn">' + n + '</span><div>' + (key[n] || '') + (src ? '<small class="agcs">' + src.innerHTML + '</small>' : '') + '</div><button type="button" class="agcx-x" aria-label="Close">×</button>';
      pop.hidden = false; pop.querySelector('.agcx-x').onclick = hide;
      document.querySelectorAll('.agckey li[data-n]').forEach(function (li) { if (li.closest('.agcwrap') === root.closest('.agcwrap')) li.classList.toggle('on', li.dataset.n === n); });
    }
    function hide() { sel = null; pop.hidden = true; root.querySelectorAll('[data-n].on').forEach(function (el) { el.classList.remove('on'); });
      document.querySelectorAll('.agckey li.on').forEach(function (li) { if (li.closest('.agcwrap') === root.closest('.agcwrap')) li.classList.remove('on'); }); }
    function focus(n) {   // zoom to the elements of item n
      var els = root.querySelectorAll('svg [data-n="' + n + '"]'); if (!els.length) { show(n); return; }
      var svg = root.querySelector('svg'), vb = svg.viewBox.baseVal, x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      els.forEach(function (el) { var b = el.getBBox(), m = el.getCTM && el.transform && el.transform.baseVal.consolidate ? el.transform.baseVal.consolidate() : null, ox = m ? m.matrix.e : 0, oy = m ? m.matrix.f : 0;
        x0 = Math.min(x0, b.x + ox); y0 = Math.min(y0, b.y + oy); x1 = Math.max(x1, b.x + b.width + ox); y1 = Math.max(y1, b.y + b.height + oy); });
      var W = vp.clientWidth, H = vp.clientHeight, iw = inner.offsetWidth, ih = inner.offsetHeight, kx = iw / vb.width, ky = ih / vb.height;
      var bw = (x1 - x0 + 60) * kx, bh = (y1 - y0 + 60) * ky, ns = clamp(Math.min(W / bw, H / bh), 1.6, 5);
      s = ns; tx = W / 2 - ((x0 + x1) / 2) * kx * s; ty = H / 2 - ((y0 + y1) / 2) * ky * s; limits(); apply(true); show(n);
      var r = root.getBoundingClientRect(), top = document.getElementById('top'); if (r.top < 0 || r.bottom > innerHeight) window.scrollTo({ top: scrollY + r.top - (top ? top.offsetHeight : 0) - 8, behavior: 'smooth' });
    }
    root.querySelectorAll('.agcgen [data-n]').forEach(function (b) { b.addEventListener('click', function (e) { e.stopPropagation(); if (sel === b.dataset.n) hide(); else show(b.dataset.n); }); });
    root._agcFocus = focus;
    root._agcFit = function () { if (s <= minS() + 0.02 || !inner.offsetWidth) fit(false); else { limits(); apply(false); } };
    window.addEventListener('resize', root._agcFit);
    fit(false);
  }
  function init() {
    document.querySelectorAll('.agcx').forEach(function (r) { if (!r._agc) { r._agc = 1; try { AGC(r); } catch (e) { } } });
    document.querySelectorAll('.agckey li[data-n]').forEach(function (li) { if (li._k) return; li._k = 1; li.tabIndex = 0;
      var go = function () { var w = li.closest('.agcwrap'), r = w && w.querySelector('.agcx'); if (r && r._agcFocus) r._agcFocus(li.dataset.n); };
      li.addEventListener('click', go); li.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); }); });
  }
  document.addEventListener('click', function (e) {   // jump buttons inside the DEPARTURE / ARRIVAL tabs (not hash links - the hash is the page router)
    var b = e.target.closest && e.target.closest('.sjb'); if (!b) return;
    var t = document.getElementById(b.dataset.to); if (!t) return; e.preventDefault();
    var top = document.getElementById('top'); window.scrollTo({ top: scrollY + t.getBoundingClientRect().top - (top ? top.offsetHeight : 0) - 6, behavior: 'smooth' });
  });
  window.FPAgcInit = init;
  /* v3.5: a chart inside a closed <details> has no size until it is opened - load its picture and fit it then */
  document.addEventListener('toggle', function (e) {
    var d = e.target; if (!d || !d.open || !d.querySelectorAll) return;
    if (window.FPImg) window.FPImg.hydrate(d);
    setTimeout(function () { init(); d.querySelectorAll('.agcx').forEach(function (r) { if (r._agcFit) r._agcFit(); }); }, 40);
  }, true);
  window.addEventListener('hashchange', function () { setTimeout(function () { document.querySelectorAll('.agcx').forEach(function (r) { if (r._agcFit) r._agcFit(); }); }, 60); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 0); }); else setTimeout(init, 0);
  var mo = new MutationObserver(function () { if (document.querySelector('.agcx:not([data-i])')) { document.querySelectorAll('.agcx').forEach(function (r) { r.setAttribute('data-i', '1'); }); setTimeout(init, 0); } });
  mo.observe(document.documentElement, { childList: true, subtree: true });
})();
