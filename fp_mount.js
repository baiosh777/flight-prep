/* fp_mount.js v3.0 (09 NOV 26) - puts a flight record (schema fpapp.flight.v1) into the page shell, then starts FPLive.
   Shared by the offline app (app.js, opt.app = true) and the web page (the record is embedded in the page).
   v3: the big pack pages (DEPARTURE / ARRIVAL with the charts) are mounted the first time they are shown, chart pictures load as
   blobs for the current theme only, the tabs are in two groups (PREPARATION / IN FLIGHT) and a WX · NOTAM page is generated here. */
window.FPMount = function (rec, opt) {
  'use strict';
  opt = opt || {};
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var M = window.FPMount;
  document.title = rec.title + (opt.app ? ' · Flight Prep' : '');
  $('cs').textContent = rec.header.callsign; $('fl-b').textContent = rec.header.fltxt; $('fl-small').textContent = rec.header.sub;
  $('planbanner').innerHTML = rec.planbanner; $('wpt-static').innerHTML = rec.wpt_static; var vc = $('v-calls'); if (vc) vc.innerHTML = rec.calls || '';
  /* ---------- pages: a section per pack page; small pages now, the big ones (> 200 KB) on first show */
  var LAZY = 200000, pending = {}, mounted = {};
  function prep(html) {   // pictures: src -> data-src, loaded as blobs by FPImg when the page is shown (only the picture of the current theme)
    return html.replace(/<img([^>]*?)\ssrc="(data:image\/[^"]+)"/g, '<img$1 data-src="$2" decoding="async"');
  }
  var sv = '';
  rec.tabs.forEach(function (t) {
    var k = t[0], html = rec.views[k];
    if (html == null) return;
    if (html.length > LAZY) { pending[k] = html; html = ''; }
    sv += '<section id="v-' + k + '" class="view" data-view="' + k + '"' + (pending[k] ? ' data-lazy="1"' : '') + ' hidden>' + prep(html) + '</section>';
  });
  var D = rec.data || {};
  var hasWx = !!((D.wx && D.wx.length) || (D.notams && D.notams.length) || (D.rnotams && D.rnotams.length));
  if (hasWx && !rec.views.wxnotam) sv += '<section id="v-wxnotam" class="view" data-view="wxnotam" hidden><div id="wxnt"></div></section>';
  if (opt.app) sv += '<section id="v-regs" class="view" data-view="regs" hidden><div id="regs"></div></section>';   // v3: regulations library (app only)
  var ph = $('static-views'); if (ph) ph.outerHTML = sv;
  M.ensure = function (k) {
    var sec = $('v-' + k); if (!sec) return false;
    if (pending[k]) { sec.innerHTML = prep(pending[k]); delete pending[k]; sec.removeAttribute('data-lazy'); mounted[k] = 1; if (window.FPRefs) window.FPRefs.scan(sec); }
    if (window.FPImg) window.FPImg.hydrate(sec);
    return true;
  };
  M.ensureAll = function () { Object.keys(pending).forEach(M.ensure); };
  M.isPending = function (k) { return !!pending[k]; };
  /* ---------- navigation: PREPARATION group, IN FLIGHT group (+ FLIGHTS in the app) */
  var META = { dash: ['DASH', 'dash'], dep: ['DEP', 'dep'], wxnotam: ['WX·NOTAM', 'wx'], tem: ['TEM', 'tem'], arr: ['ARR', 'arr'], regs: ['REGS', 'book'], now: ['NOW', 'now'], waypoints: ['WPTS', 'wpt'], 'route-map': ['MAP', 'map'], flights: ['FLIGHTS', 'folder'] };
  var FLT = { now: 1, enr: 1, map: 1 }, prep_ = [], flt = [], seen = {};
  rec.tabs.forEach(function (t) {
    var k = t[0]; if (!$('v-' + k) || seen[k]) return; seen[k] = 1;
    if (k === 'tem') { prep_.push(t); return; }   // TEM is a briefing page (threats), kept in the preparation group
    (FLT[t[2]] || k === 'now' || k === 'waypoints' || k === 'route-map' ? flt : prep_).push(t);
  });
  if (hasWx && !seen.wxnotam) { var ix = prep_.map(function (t) { return t[0]; }).indexOf('dep'); prep_.splice(ix >= 0 ? ix + 1 : prep_.length, 0, ['wxnotam', 'WX · NOTAM', 'prep']); }
  if (opt.app && $('v-regs')) prep_.push(['regs', 'Regulations (Lido CRAR / RSI)', 'prep']);
  function item(t) {
    var k = t[0], m = META[k] || [t[1], 'page'];
    return '<a href="#' + k + '" data-v="' + k + '" title="' + esc(t[1]) + '"><svg class="ic" aria-hidden="true"><use href="#i-' + m[1] + '"/></svg><span>' + esc(m[0]) + '</span></a>';
  }
  var h = '<div class="ng" data-g="prep"><small class="ngl">Preparation</small><div class="ngi">' + prep_.map(item).join('') + '</div></div>' +
    '<div class="ng" data-g="flt"><small class="ngl">In flight</small><div class="ngi">' + flt.map(item).join('') +
    '<button type="button" class="nvb" data-nav="timers" title="Timers: fuel check, custom timers"><svg class="ic" aria-hidden="true"><use href="#i-timer"/></svg><span>TIMERS</span></button>' +
    '<button type="button" class="nvb" data-nav="divert" title="Diversion and emergency helper"><svg class="ic" aria-hidden="true"><use href="#i-divert"/></svg><span>DIVERT</span></button></div></div>';
  if (opt.app) h += '<div class="ng ngf" data-g="app"><small class="ngl">App</small><div class="ngi">' + item(['flights', 'Flights', 'app']) + '</div></div>';
  $('tabs').innerHTML = h;
  $('tabs').querySelectorAll('.nvb').forEach(function (b) { b.addEventListener('click', function () { var t = $(b.dataset.nav === "timers" ? "b-timer" : "b-divert"); if (t) t.click(); }); });
  var d = document.createElement('div'); d.innerHTML = rec.foot; $('foot').textContent = d.textContent;
  window.FPRec = { built_utc: rec.built_utc, ofp: rec.ofp, id: rec.id, min_app: rec.min_app };
  // pages mounted now: pictures + reference links
  document.querySelectorAll('.view:not([data-lazy])').forEach(function (s) { if (window.FPImg) window.FPImg.hydrate(s); if (window.FPRefs) window.FPRefs.scan(s); });
  window.FPLive(rec.data);
};

/* ---------- FPImg: chart pictures as blob URLs, theme-aware (img.agl = light chart, img.agd = dark chart), loaded when the page is shown */
window.FPImg = (function () {
  'use strict';
  var urls = {};
  function dark() { var t = document.documentElement.getAttribute('data-theme'); if (t === 'light') return false; if (t === 'dark' || t === 'night') return true; return !(window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches); }
  function want(img) { if (img.classList.contains('agl')) return !dark(); if (img.classList.contains('agd')) return dark(); return true; }
  function load(img) {
    var src = img.getAttribute('data-src'); if (!src) return;
    if (urls[src]) { img.src = urls[src]; img.removeAttribute('data-src'); return; }
    img.setAttribute('data-loading', '1');
    fetch(src).then(function (r) { return r.blob(); }).then(function (b) { var u = URL.createObjectURL(b); urls[src] = u; img.src = u; img.removeAttribute('data-src'); img.removeAttribute('data-loading'); })
      .catch(function () { img.src = src; img.removeAttribute('data-src'); img.removeAttribute('data-loading'); });
  }
  function hydrate(root) { (root || document).querySelectorAll('img[data-src]:not([data-loading])').forEach(function (img) { if (want(img)) load(img); }); }
  function themeChanged() { document.querySelectorAll('.view:not([hidden]) img[data-src]').forEach(function (img) { if (want(img)) load(img); }); }
  return { hydrate: hydrate, themeChanged: themeChanged };
})();
