/* fp_regs.js v3.0 (09 NOV 26) - REGS page: country rules (Lido CRAR, chapter 3) and regional information (RSI, chapter 2) from a library
   file (schema fpapp.library.v1) that is loaded once in FLIGHTS and kept on the iPad independent of the flights. Search by country name,
   ICAO prefix (OO, VABF, OMDB...), chapter number or region. A country card = summary (Claude's, marked) or auto key sentences, then the
   full Lido text section by section. User (09 NOV 26): "search for the country and see all the controls and regulations and the RSI, summarised". */
window.FPRegs = (function () {
  'use strict';
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var LIB = null, Q = '', OPEN = null, KEY = 'fpapp:regs';
  try { var st = JSON.parse(localStorage.getItem(KEY) || '{}'); Q = st.q || ''; OPEN = st.open || null; } catch (e) { }
  function save() { try { localStorage.setItem(KEY, JSON.stringify({ q: Q, open: OPEN })); } catch (e) { } }
  var FIRMAP = null;   // FIR / airport prefixes of the current flight -> country ids, so the flight's own countries come first
  function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9. ]+/g, ' ').trim(); }
  function all() { return LIB ? LIB.countries.concat(LIB.regions) : []; }
  function match(it, q) {
    if (!q) return 1;
    var t = norm(it.title), nq = norm(q), up = q.toUpperCase().trim();
    if (t === nq || it.id === q.trim()) return 100;
    if (t.indexOf(nq) === 0) return 80;
    if (t.indexOf(nq) >= 0) return 60;
    if (it.icao && it.icao.some(function (p) { return up.indexOf(p) === 0 || p.indexOf(up) === 0; })) return 50;   // 'OO', 'OOMM', 'OMDB'
    if (it.id.indexOf(q.trim()) === 0) return 40;
    if (nq.length >= 4 && it.sections.some(function (s) { return norm(s.t).indexOf(nq) >= 0; })) return 20;
    return 0;
  }
  function flightFirst(it) {
    var D = window.FPData; if (!D || !it.icao) return 0;
    var pre = [D.flight.dep, D.flight.arr].concat((D.firs || []).map(function (f) { return f.fir; })).concat((D.alts || []).map(function (a) { return a.icao; }));
    return it.icao.some(function (p) { return pre.some(function (c) { return c && c.indexOf(p) === 0; }); }) ? 1 : 0;
  }
  function list() {
    var q = Q.trim(), L = all().map(function (it) { return { it: it, m: match(it, q) }; }).filter(function (x) { return x.m > 0; });
    L.sort(function (a, b) { return b.m - a.m || flightFirst(b.it) - flightFirst(a.it) || a.it.title.localeCompare(b.it.title); });
    if (!q) L.sort(function (a, b) { return flightFirst(b.it) - flightFirst(a.it) || (a.it.id.charAt(0) === '3' ? 0 : 1) - (b.it.id.charAt(0) === '3' ? 0 : 1) || a.it.title.localeCompare(b.it.title); });
    return L.map(function (x) { return x.it; });
  }
  function row(it) {
    var ff = flightFirst(it), kind = it.id.charAt(0) === '2' ? 'RSI' : 'CRAR';
    return '<button type="button" class="rgrow' + (ff ? ' ff' : '') + '" data-act="rg-open" data-id="' + esc(it.id) + '"><span class="rgk ' + kind.toLowerCase() + '">' + kind + '</span><b>' + esc(it.title) + '</b><small>' + esc(it.id) + (it.icao && it.icao.length ? ' · ' + esc(it.icao.join(' ')) : '') + ' · ' + it.n + ' sections' + (ff ? ' · <i>this flight</i>' : '') + (it.summary ? ' · summary' : '') + '</small></button>';
  }
  function card(it) {
    var kind = it.id.charAt(0) === '2' ? 'Regional supplementary information (Lido RM chapter 2)' : 'Country rules and regulations (Lido RM chapter 3)';
    var h = '<div class="rgh"><button type="button" class="rgback" data-act="rg-back">‹ All</button><div><b>' + esc(it.title) + '</b><small>' + esc(kind) + ' · ' + esc(it.id) + (it.icao && it.icao.length ? ' · ICAO ' + esc(it.icao.join(', ')) : '') + ' · Lido RM pages ' + it.pages[0] + '–' + it.pages[1] + '</small></div></div>';
    if (it.summary && it.summary.length) {
      h += '<section class="rgsum"><h3>In short <small>summary written by Claude from the Lido text below – the Lido text is the authority</small></h3><ul>' + it.summary.map(function (s) { return '<li>' + (typeof s === 'string' ? esc(s) : '<b>' + esc(s.k || '') + '</b> ' + esc(s.x || '')) + '</li>'; }).join('') + '</ul></section>';
    } else if (it.auto && it.auto.length) {
      h += '<section class="rgsum auto"><h3>Key sentences <small>picked by rule from the text (not a summary yet)</small></h3><ul>' + it.auto.map(function (s) { return '<li><b>' + esc(s.s) + '</b> ' + esc(s.x) + '</li>'; }).join('') + '</ul></section>';
    }
    h += '<div class="rgtoc">' + it.sections.map(function (s, i) { return '<a href="#regs" data-act="rg-sec" data-i="' + i + '">' + esc(s.n) + ' ' + esc(s.t) + '</a>'; }).join('') + '</div>';
    h += '<div class="rgsecs">' + it.sections.map(function (s, i) { return '<details class="rgsec" id="rgsec-' + i + '"><summary><b>' + esc(s.n) + '</b> ' + esc(s.t) + '<small>p' + s.p + '</small></summary><div class="rgx">' + esc(s.x) + '</div></details>'; }).join('') + '</div>';
    return h;
  }
  function render() {
    var host = $('regs'); if (!host) return;
    if (!LIB) { host.innerHTML = '<h1 class="pt">Regulations</h1><p class="sub">Country rules (CRAR) and regional information (RSI) from the Lido Route Manual.</p><div class="msg">No regulations library on this iPad yet. Load the <b>library file</b> Claude sends (Lido RM RSI + CRAR) in FLIGHTS, the same way as a flight file – it stays on the iPad for every flight.</div>'; return; }
    var it = OPEN ? all().filter(function (x) { return x.id === OPEN; })[0] : null;
    if (it) { host.innerHTML = '<div class="rgwrap">' + card(it) + '</div>'; return; }
    var L = list();
    host.innerHTML = '<h1 class="pt">Regulations</h1><p class="sub">' + esc(LIB.title) + ' · ' + esc(LIB.src || '') + '</p>' +
      '<div class="rgsearch"><input id="rg-q" type="search" class="sqi" placeholder="Country, ICAO prefix (OO, VABF, OMDB), region or chapter…" value="' + esc(Q) + '" autocomplete="off"><span class="rgcount">' + L.length + ' of ' + all().length + '</span></div>' +
      '<div class="rglist">' + (L.length ? L.map(row).join('') : '<p class="note">Nothing found. Try the country name, an ICAO prefix (two letters) or a chapter number such as 3.139.</p>') + '</div>' +
      '<p class="note">' + esc(LIB.note || '') + ' Built ' + esc(LIB.built_utc || '') + '.</p>';
    var inp = $('rg-q'); if (inp) { var t = null; inp.addEventListener('input', function () { clearTimeout(t); t = setTimeout(function () { Q = inp.value; save(); var pos = inp.selectionStart; render(); var i2 = $('rg-q'); if (i2) { i2.focus(); try { i2.setSelectionRange(pos, pos); } catch (e) { } } }, 160); }); }
  }
  function act(b) {
    var a = b.dataset.act;
    if (a === 'rg-open') { OPEN = b.dataset.id; save(); render(); window.scrollTo(0, 0); return true; }
    if (a === 'rg-back') { OPEN = null; save(); render(); return true; }
    if (a === 'rg-sec') { var d = $('rgsec-' + b.dataset.i); if (d) { d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'start' }); } return true; }
    return false;
  }
  function setLib(l) { LIB = l; render(); }
  return { render: render, act: act, setLib: setLib, has: function () { return !!LIB; } };
})();
