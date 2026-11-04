/* fp_mount.js v1.1 (05 NOV 26) - puts a flight record (schema fpapp.flight.v1) into the page shell, then starts FPLive.
   Shared by the offline app (app.js, opt.app = true) and the web page (the record is embedded in the page). */
window.FPMount = function (rec, opt) {
  'use strict';
  opt = opt || {};
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  document.title = rec.title + (opt.app ? ' · Flight Prep' : '');
  $('cs').textContent = rec.header.callsign; $('fl-b').textContent = rec.header.fltxt; $('fl-small').textContent = rec.header.sub;
  $('planbanner').innerHTML = rec.planbanner; $('wpt-static').innerHTML = rec.wpt_static; $('v-calls').innerHTML = rec.calls;
  // static pack pages, in pack order
  var sv = '';
  rec.tabs.forEach(function (t) { if (rec.views[t[0]]) sv += '<section id="v-' + t[0] + '" class="view" data-view="' + t[0] + '" hidden>' + rec.views[t[0]] + '</section>'; });
  var ph = $('static-views'); if (ph) ph.outerHTML = sv;
  // the pack sequence strip (NOW has its own button in the header); a thin gap between groups
  var h = '', g = null;
  rec.tabs.forEach(function (t) {
    if (t[0] === 'now') return;
    if (g !== null && t[2] && t[2] !== g) h += '<span class="tsep" aria-hidden="true"></span>';
    g = t[2] || g;
    h += '<a href="#' + t[0] + '" data-v="' + t[0] + '">' + esc(t[1]) + '</a>';
  });
  if (opt.app) h += '<span class="tsep" aria-hidden="true"></span><a href="#flights" data-v="flights" class="tflights">FLIGHTS</a>';
  $('tabs').innerHTML = h;
  var d = document.createElement('div'); d.innerHTML = rec.foot; $('foot').textContent = d.textContent;
  window.FPLive(rec.data);
};
