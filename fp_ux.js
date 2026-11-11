/* fp_ux.js v3.1 (09 NOV 26) - usability layer (user: "extremely professional, better, more user friendly and easier"):
   1. WAYPOINTS as leg cards (Cards | Table): the next leg expanded with its comms in large type, one tap = passed, "time" = actual time over;
   2. DASH briefing progress: one tile per preparation page with its key line and a "briefed" tick (stored per flight), progress count;
   3. sticky in-page section bar (Brief | CCI / AOI | AGC) with the current section highlighted;
   4. NOW: a clear take-off action while no T/O time is set; larger text on the in-flight pages.
   Needs window.FPCore from fp_live.js. */
window.FPUx = (function () {
  'use strict';
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var C = null;   // FPCore
  var PK = 'fpapp:ux', U = { view: 'cards' };
  try { Object.assign(U, JSON.parse(localStorage.getItem(PK) || '{}')); } catch (e) { }
  function saveU() { try { localStorage.setItem(PK, JSON.stringify(U)); } catch (e) { } }

  /* ---------- 1. leg cards ---------- */
  var legs = null, open = {};
  function buildLegs() {
    var host = $('legs'); if (!host || legs) return; host.classList.add('cmp');   /* v3.7: compact type so more waypoints fit */
    var D = C.D; legs = [];
    D.rows.forEach(function (r, i) {
      var card = document.createElement('article'); card.className = 'leg'; card.dataset.i = i;
      card.innerHTML = '<header class="lgh"><button type="button" class="lgpass" data-pass="' + i + '" aria-label="Passed ' + esc(r.wpt) + '"><span class="ck"></span></button>' +
        '<div class="lgt"><b class="lgeet">' + (r.eet == null ? esc(r.label || '–') : C.hm(r.eet)) + '</b><small class="lgz"></small><small class="lgrv" hidden></small></div>' +
        '<div class="lgn"><b>' + esc(r.wpt) + '</b><span class="lgfir ' + esc(r.fc || '') + '">' + (r.bnd ? '▶ ' : '') + esc(r.fir) + ' <small>' + esc(r.firname) + '</small></span></div>' +
        '<div class="lgst"></div><button type="button" class="lgtog" aria-label="Details" aria-expanded="false"><svg class="ic" aria-hidden="true"><use href="#i-chev"/></svg></button></header>' +
        '<div class="lgb" hidden><div class="lgcom">' + (r.call || '<p class="note">No comms change on this leg.</p>') + '</div>' +
        (r.special && r.special !== '-' ? '<div class="lgx"><small>Special</small><div>' + r.special + '</div></div>' : '') +
        (r.threat && r.threat !== '-' ? '<div class="lgx thr"><small>Threat</small><div>' + r.threat + '</div></div>' : '') +
        '<div class="lgmeta">' + (r.mora != null ? '<span class="lgm' + (r.mora > 10000 ? ' red' : (r.mora > 5000 ? ' amb' : '')) + '"><small>MORA</small><b>' + r.mora + '</b></span>' : '') +
        (r.fmin != null ? '<span class="lgm"><small>Fuel min / plan</small><b>' + r.fmin.toFixed(1) + ' / ' + r.fplan.toFixed(1) + ' t</b></span>' : '') + (r.divert && r.divert !== '-' ? '<span class="lgm"><small>Diversion</small><b>' + r.divert + '</b></span>' : '') +
        '<span class="lgact"><button type="button" class="atob" data-ato="' + i + '">set time</button></span></div></div>';
      host.appendChild(card); legs.push(card);
      function tog() { open[i] = !(open[i] != null ? open[i] : true); paintLegs(); }
      card.querySelector('.lgtog').addEventListener('click', tog);
      card.querySelector('.lgh .lgn').addEventListener('click', tog);
      card.querySelector('.lgpass').addEventListener('click', function (ev) { ev.stopPropagation(); C.tap(i); });
    });
    if (window.FPRefs) window.FPRefs.scan(host);
    if (window.FPImg) window.FPImg.hydrate(host);
  }
  function paintLegs() {
    if (!legs) return;
    var S = C.S, D = C.D, e = C.el(), nxt = S.passed + 1, ar = C.atoRow(), off = C.offMin();
    legs.forEach(function (card, i) {
      var r = D.rows[i], passed = i <= S.passed, isNext = i === nxt, exp = open[i] != null ? open[i] : true;   /* v3.7 (pilot 10 + 11 NOV): every card open, no tap needed; the arrow only closes one */
      card.classList.toggle('passed', passed); card.classList.toggle('next', isNext); card.classList.toggle('open', exp);
      card.querySelector('.lgb').hidden = !exp; card.querySelector('.lgtog').setAttribute('aria-expanded', exp ? 'true' : 'false');
      var z = card.querySelector('.lgz'), rv = card.querySelector('.lgrv'), st = card.querySelector('.lgst'), h = '';
      z.textContent = r.eet == null ? '' : C.zt(C.toMin() + r.eet);
      var show = ar >= 0 && i > ar && r.eet != null && Math.round(off) !== 0; rv.hidden = !show; if (show) rv.textContent = 'rev ' + C.hm(r.eet + off) + ' · ' + C.zt(C.toMin() + r.eet + off);
      if (passed) h = S.times[i] ? '<span class="chip ata">' + C.isoZ(S.times[i]) + '</span>' : '<span class="chip ata">passed</span>';
      else { if (isNext) h += '<span class="chip next">NEXT</span>'; if (r.eet != null && r.eet < e - 1) h += '<span class="chip due">DUE</span>'; else if (r.eet != null && isNext) h += '<span class="lgin">' + C.inTxt(r.eet - e) + '</span>'; }
      if (st._h !== h) { st._h = h; st.innerHTML = h; }
      var act = card.querySelector('.lgact'); if (act && !act.querySelector('.atob') && !act.querySelector('.atoi')) act.innerHTML = '<button type="button" class="atob" data-ato="' + i + '">set time</button>';
    });
  }
  function legsView(v) {
    U.view = v; saveU();
    var t = $('wpt'), host = $('legs'), bar = document.querySelector('.wptbar'), sw = $('wpt-view');
    if (!host) return;
    var cards = v === 'cards'; host.hidden = !cards; if (t) t.hidden = cards; if (bar) bar.hidden = cards;
    if (sw) sw.querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', b.dataset.v === v); b.setAttribute('aria-pressed', b.dataset.v === v); });
    if (cards) { buildLegs(); paintLegs(); }
  }
  function initLegs() {
    var sec = $('v-waypoints'); if (!sec || $('legs')) return;
    var tb = document.createElement('div'); tb.className = 'wtop'; tb.id = 'wpt-view';
    tb.innerHTML = '<div class="seg"><button type="button" data-v="cards" class="on">Cards</button><button type="button" data-v="table">Table</button></div>' +
      '<div class="wtopr"><button type="button" id="legs-next">Go to next</button><button type="button" id="legs-undo">Undo last</button></div>';
    var ws = $('wpt-static'); sec.insertBefore(tb, ws ? ws.nextSibling : sec.firstChild);
    var host = document.createElement('div'); host.id = 'legs'; host.className = 'legs'; tb.insertAdjacentElement('afterend', host);
    tb.querySelectorAll('.seg button').forEach(function (b) { b.addEventListener('click', function () { legsView(b.dataset.v); }); });
    $('legs-next').addEventListener('click', function () { var n = host.querySelector('.leg.next') || host.querySelector('.leg:not(.passed)'); if (n) { var r = n.getBoundingClientRect(), top = $('top').offsetHeight; window.scrollTo({ top: Math.max(0, window.scrollY + r.top - top - 70), behavior: 'smooth' }); } });
    $('legs-undo').addEventListener('click', function () { var u = $('undo'); if (u) u.click(); });
    legsView(U.view || 'cards');
  }

  /* ---------- 2. briefing progress on DASH ---------- */
  var TILES = [['dep', 'Departure', 'dep'], ['wxnotam', 'Weather & NOTAMs', 'wx'], ['tem', 'Threats (TEM)', 'tem'], ['arr', 'Arrival', 'arr']];
  function takeaway(k) {
    var D = C.D, dash = $('v-dash'), drp = dash ? dash.querySelectorAll('.drp') : [];
    function rp(i) { var x = drp[i]; return x ? Array.prototype.map.call(x.querySelectorAll('b, span'), function (s) { return s.textContent.trim(); }).filter(Boolean).join(' · ') : ''; }
    if (k === 'dep') return [rp(0), (D.wx || []).filter(function (w) { return w.role === 'DEP'; }).map(function (w) { return w.icao + ' ' + (w.metar || '').split(' ').slice(2, 5).join(' '); })[0] || ''].filter(Boolean).join(' · ');
    if (k === 'arr') return rp(1);
    if (k === 'wxnotam') { var nn = (D.notams || []); var crit = nn.filter(function (n) { return window.FPTools && false; }); var fl = D.notam_flags ? Object.keys(D.notam_flags).length : 0; return nn.length + ' NOTAMs · ' + (D.wx || []).length + ' airfields' + (fl ? ' · ' + fl + ' new at DXB' : ''); }
    if (k === 'tem') { var tem = $('v-tem'); var n = tem ? tem.querySelectorAll('.tem').length : 0; return n ? n + ' phases, threats and mitigations' : 'Threats and mitigations by phase'; }
    return '';
  }
  function dashBrief() {
    var sec = $('v-dash'); if (!sec) return; var host = $('dash-brief');
    if (!host) { host = document.createElement('div'); host.id = 'dash-brief'; host.className = 'dbrief'; var air = $('dash-air') || sec.querySelector('.dhero'); if (air && air.parentNode) air.parentNode.insertBefore(host, air.nextSibling); else sec.insertBefore(host, sec.firstChild); }
    var S = C.S, brf = S.brf || {}, tiles = TILES.filter(function (t) { return $('v-' + t[0]); }), done = tiles.filter(function (t) { return brf[t[0]]; }).length;
    var h = '<div class="bar"><span>Briefing</span><small>' + done + ' of ' + tiles.length + ' pages briefed · tap a page, mark it briefed at its end</small></div><div class="dbt">' + tiles.map(function (t) {
      var d = brf[t[0]];
      return '<a class="dbtile' + (d ? ' done' : '') + '" href="#' + t[0] + '"><span class="dbi"><svg class="ic" aria-hidden="true"><use href="#i-' + t[2] + '"/></svg></span><span class="dbtx"><b>' + esc(t[1]) + '</b><small>' + esc(takeaway(t[0]) || 'Open the page') + '</small></span><span class="dbst">' + (d ? '<svg class="ic" aria-hidden="true"><use href="#i-check"/></svg> ' + C.isoZ(d) : 'open') + '</span></a>';
    }).join('') + '</div>';
    h += melStrip();
    if (host._h !== h) { host._h = h; host.innerHTML = h; }
  }
  /* v3.3: today's MEL items (picked in Timers → MEL items, from the MEL library) on DASH */
  function melStrip() {
    var S = C.S, list = S.mel || [];
    if (!list.length) return '';
    return '<div class="bar"><span>MEL</span><small>picked for this flight · tap for the full MEL text</small></div><ul class="dmel">' +
      list.map(function (m) {
        var f = window.FPMelFind ? window.FPMelFind(m.no) : null;
        return '<li><button type="button" class="dmelb" data-act="melv" data-no="' + esc(m.no) + '"><b>' + esc(m.no) + '</b> ' +
          esc(m.title || (f ? f.t : '')) + (m.note ? ' <small>' + esc(m.note) + '</small>' : '') + '</button></li>';
      }).join('') + '</ul>';
  }
  function briefBar(k) {   // footer button on each preparation page
    var sec = $('v-' + k); if (!sec || sec.querySelector('.brfbar') || ['dash', 'now', 'waypoints', 'route-map', 'flights', 'regs', 'cockpit'].indexOf(k) >= 0) return;
    if (window.FPMount && window.FPMount.isPending && window.FPMount.isPending(k)) return;
    var d = document.createElement('div'); d.className = 'brfbar'; d.innerHTML = '<button type="button" class="brfb" data-brf="' + k + '"></button><a class="brfnext" href="#dash">Back to DASH</a>'; sec.appendChild(d);
    d.querySelector('.brfb').addEventListener('click', function () { var S = C.S; S.brf = S.brf || {}; if (S.brf[k]) delete S.brf[k]; else S.brf[k] = new Date().toISOString(); C.save(); paintBrief(); C.toast(S.brf[k] ? 'Marked as briefed.' : 'Briefed mark removed.'); });
    paintBrief();
  }
  function paintBrief() {
    var S = C.S, brf = S.brf || {};
    document.querySelectorAll('.brfb').forEach(function (b) { var k = b.dataset.brf, d = brf[k]; b.classList.toggle('on', !!d); b.innerHTML = d ? '<svg class="ic" aria-hidden="true"><use href="#i-check"/></svg> Briefed ' + C.isoZ(d) + ' – tap to undo' : 'Mark this page as briefed'; });
    if ($('dash-brief')) dashBrief();
  }

  /* ---------- 3. sticky section bar with the current section highlighted ---------- */
  var spy = null;
  function sectionBar(k) {
    var sec = $('v-' + k); if (!sec) return; var sj = sec.querySelector('.sj'); if (!sj || sj._spy) return; sj._spy = 1;
    sj.classList.add('sticky');
    /* v3.7 (pilot 11 NOV): the bar sat inside the Brief section and scrolled away with it - make it a child of the page so it holds to the end */
    var hs = sj.parentNode; while (hs && hs.parentNode && hs.parentNode !== sec) hs = hs.parentNode;
    if (hs && hs !== sj && hs.parentNode === sec) sec.insertBefore(sj, hs);
    var targets = Array.prototype.map.call(sj.querySelectorAll('.sjb'), function (b) { return $(b.dataset.to); }).filter(Boolean);
    function upd() {
      var top = ($('top') ? $('top').offsetHeight : 0) + 60, cur = null;
      targets.forEach(function (t) { if (t.getBoundingClientRect().top <= top) cur = t; });
      sj.querySelectorAll('.sjb').forEach(function (b) { b.classList.toggle('on', cur && b.dataset.to === cur.id); });
    }
    window.addEventListener('scroll', function () { if (!sec.hidden) upd(); }, { passive: true }); upd();
  }

  /* ---------- 4. NOW take-off action ---------- */
  function toCta() {
    var pb = $('planbanner'); if (!pb || $('to-cta')) return;
    var d = document.createElement('div'); d.className = 'tocta'; d.id = 'to-cta';
    d.innerHTML = '<div class="toctx"><b>Take-off time not set</b><span>All times use the planned T/O. Set it now or type it.</span></div><div class="toctb"><button type="button" class="pri" id="cta-now"><svg class="ic" aria-hidden="true"><use href="#i-plane"/></svg>Airborne now</button><label class="ctain"><input inputmode="numeric" maxlength="4" placeholder="HHMM" aria-label="Take-off time UTC"><button type="button" id="cta-set">Set</button></label></div>';
    pb.parentNode.insertBefore(d, pb.nextSibling);
    $('cta-now').addEventListener('click', function () { C.setTO(C.nowHHMM()); C.toast('Take-off time set to ' + C.nowHHMM() + 'Z.'); });
    var inp = d.querySelector('input');
    function set() { var v = inp.value.replace(/\D/g, ''); if (v.length === 4 && +v.slice(0, 2) < 24 && +v.slice(2) < 60) { C.setTO(v); inp.value = ''; inp.classList.remove('bad'); C.toast('Take-off time set to ' + v + 'Z.'); } else inp.classList.add('bad'); }
    $('cta-set').addEventListener('click', set); inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); set(); } });
  }
  function paintCta() { var d = $('to-cta'); if (d) d.hidden = !C.isPlan(); }

  /* ---------- 5. first-run welcome (once per device) ---------- */
  function welcome() {
    if (U.welcomed || !window.FPSheet) return; U.welcomed = 1; saveU();
    window.FPSheet('welcome', 'Welcome to Flight Prep 3', '<ul class="hlp wlc">' +
      '<li><b>Two groups of pages</b><span>PREPARATION (DASH, DEP, WX·NOTAM, TEM, ARR, REGS) and IN FLIGHT (NOW, WPTS, MAP, TIMERS, DIVERT). In landscape they are the rail on the left.</span></li>' +
      '<li><b>Set the take-off time</b><span>On NOW tap <b>Airborne now</b> at rotation, or type the HHMM. Every time in the app follows it.</span></li>' +
      '<li><b>Waypoints as cards</b><span>Every waypoint card is open with its frequencies; tap the ring when you pass a waypoint. <b>set time</b> types the actual time over – all later times are revised (LATE / EARLY in the header).</span></li>' +
      '<li><b>Brief and tick</b><span>DASH shows the briefing progress; at the end of each page tap <b>Mark this page as briefed</b>.</span></li>' +
      '<li><b>Tap anything blue</b><span>Frequencies open a large board; dotted references open the document card; airfield tiles open the WX·NOTAM page.</span></li>' +
      '<li><b>Help</b><span>The ? button explains the page you are on.</span></li></ul>');
  }
  /* ---------- hooks ---------- */
  function shown(h) {
    document.body.classList.toggle('flt', ['now', 'waypoints', 'route-map', 'cockpit'].indexOf(h) >= 0);
    if (h === 'waypoints') { initLegs(); paintLegs(); }
    if (h === 'dash') dashBrief();
    if (h === 'now' || h === 'cockpit') { toCta(); paintCta(); }
    briefBar(h); sectionBar(h);
    if (!U.welcomed) setTimeout(welcome, 1200);
  }
  function tick() { paintCta(); }
  return { init: function (core) { C = core; }, shown: shown, tick: tick, paintLegs: paintLegs, paintBrief: paintBrief };
})();
