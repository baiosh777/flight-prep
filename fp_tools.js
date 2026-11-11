/* fp_tools.js v1.3 (05 NOV 26) - Flight Prep tools on top of FPLive: bottom sheet, custom timers, ETOPS / step-climb / TOD /
   ground cards, DIVERT (nearest airports, emergency, lost comms, interception), search everything, help tips, swipe between
   pages, split cockpit view support, auto-tick by GPS, dimmer, highlighter + pin to NOW, big frequency board, self-test.
   Everything shown comes from the flight file (OFP / pack) or from ICAO / Lido text quoted with its source; nothing is invented. */
window.FPTools = function (A) {
  'use strict';
  var D = A.D, S = A.S, P = A.P, F = D.flight, T = F.trip, esc = A.esc, hm = A.hm;
  function $(id) { return document.getElementById(id); }
  function on(id, ev, fn) { var x = $(id); if (x) x.addEventListener(ev, fn); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function zt(e) { return A.zt(A.toMin() + (A.rev ? A.rev(e) : e)); }   // planned EET -> UTC 'HHMMZ' (revised by the actual time over the last waypoint, v3)
  function eAbs(m) { return m - A.toMin(); }                            // minutes from 00Z of the flight date -> EET
  function eUtc(hhmm) { var s = String(hhmm || '').replace(/\D/g, ''); if (s.length < 3) return null; var m = +s.slice(0, -2) * 60 + +s.slice(-2); var x = ((m - A.toMin()) % 1440 + 1440) % 1440; return x > 720 ? x - 1440 : x; }
  function cd(d) { return d < 0 ? '-' + hm(Math.ceil(-d)) : hm(Math.ceil(d)); }
  function inT(d) { return A.inTxt(d); }
  var R = Math.PI / 180, NM = 3440.065;
  function gdist(a, b) { var la1 = a[1] * R, la2 = b[1] * R, dl = (b[0] - a[0]) * R; return 2 * Math.asin(Math.min(1, Math.sqrt(Math.pow(Math.sin((la2 - la1) / 2), 2) + Math.cos(la1) * Math.cos(la2) * Math.pow(Math.sin(dl / 2), 2)))) * NM; }
  function brg(a, b) { var y = Math.sin((b[0] - a[0]) * R) * Math.cos(b[1] * R), x = Math.cos(a[1] * R) * Math.sin(b[1] * R) - Math.sin(a[1] * R) * Math.cos(b[1] * R) * Math.cos((b[0] - a[0]) * R); return (Math.atan2(y, x) / R + 360) % 360; }
  function d3s(n) { return String(Math.round(n) % 360 || 360).padStart(3, '0'); }
  S.timers = S.timers || []; S.gnd = S.gnd || {}; S.hl = S.hl || {}; S.pins = S.pins || []; S.mel = S.mel || [];
  var G = function () { return A.globe(); };
  var X = { A: A, $: $, pad: pad, zt: zt, eAbs: eAbs, eUtc: eUtc, gdist: gdist, brg: brg, d3s: d3s, cd: cd };   // shared with fp_tools2.js

  /* ---------- bottom sheet (one at a time) */
  var SH = $('sheet'), SB = $('sheet-b'), BG = $('sheet-bg'), sheet = null;
  function openSheet(kind, title, render, opt) {
    opt = opt || {}; sheet = { kind: kind, render: render, tick: opt.tick, title: title };
    $('sheet-t').textContent = title; SH.classList.toggle('wide', !!opt.wide); SH.hidden = false; BG.hidden = false;
    SB.innerHTML = render(); SB.scrollTop = 0; document.documentElement.classList.add('noscroll');
    if (window.FPRefs && kind !== 'ref' && kind !== 'search' && kind !== 'help') window.FPRefs.scan(SB);   // v3: document references in the cards
    if (opt.after) opt.after(SB);
    var f = SB.querySelector('[autofocus]'); if (f) setTimeout(function () { f.focus(); }, 60);
  }
  function rerender() { if (!sheet) return; var y = SB.scrollTop, op = [].map.call(SB.querySelectorAll('details[data-icao][open]'), function (d) { return d.dataset.icao; }); SB.innerHTML = sheet.render(); if (window.FPRefs && sheet.kind !== 'ref' && sheet.kind !== 'search') window.FPRefs.scan(SB); op.forEach(function (ic) { var d = SB.querySelector('details[data-icao="' + ic + '"]'); if (d) d.open = true; }); SB.scrollTop = y; }
  function closeSheet() { SH.hidden = true; BG.hidden = true; sheet = null; document.documentElement.classList.remove('noscroll'); }
  X.openSheet = openSheet; X.closeSheet = closeSheet; X.rerender = rerender;
  on('sheet-x', 'click', closeSheet); on('sheet-bg', 'click', closeSheet);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && sheet) closeSheet(); });

  /* ---------- custom timers */
  var PRESET = [['SELCAL / HF check', 30, true], ['Weather update', 60, true], ['Crew check', 20, true], ['Controlled rest', 40, false], ['Oceanic / position report', 60, true]];
  function tLeft(t) { return (t.end - Date.now()) / 1000; }
  function tById(id) { for (var i = 0; i < S.timers.length; i++) if (S.timers[i].id === id) return S.timers[i]; return null; }
  function addTimer(name, min, rep, atE) {
    var end = atE != null ? Date.now() + (atE - A.el()) * 60000 : Date.now() + min * 60000;
    var t = { id: 't' + Date.now().toString(36), name: name || 'Timer', min: min || 0, end: end, rep: !!rep && !!min };
    S.timers.push(t); A.save(); A.toast(t.name + ' – ' + (atE != null ? 'at ' + zt(atE) : min + ' min') + (t.rep ? ', repeats' : '') + '.', function () { S.timers = S.timers.filter(function (x) { return x !== t; }); A.save(); A.tick(true); rerender(); });
    A.tick(true);
  }
  function timerDone(id) {
    var t = tById(id); if (!t) return; var prev = JSON.stringify(S.timers);
    if (t.rep) { t.end = Date.now() + t.min * 60000; A.toast(t.name + ' done – next in ' + t.min + ' min.', function () { S.timers = JSON.parse(prev); A.save(); A.tick(true); }); }
    else { S.timers = S.timers.filter(function (x) { return x.id !== id; }); A.toast(t.name + ' done.', function () { S.timers = JSON.parse(prev); A.save(); A.tick(true); }); }
    A.save(); A.tick(true); if (sheet && sheet.kind === 'timers') rerender();
  }
  function leftTxt(id) { var t = tById(id); if (!t) return ''; var l = tLeft(t); return l > 0 ? 'in ' + A.mmss(l) : 'DUE +' + A.mmss(-l); }
  function fcBlock() {   // v2.0: the fuel check timer lives here (no header button any more)
    var l = A.fcLeft ? A.fcLeft() : null, cls = l === null ? '' : (l <= 0 ? 'red' : (l <= 300 ? 'amb' : ''));
    return '<div class="tmr tfc ' + cls + '"><div><b>Fuel check</b><small>55-min timer · tap after each fuel check' + (S.fc ? ' · last ' + A.isoZ(S.fc) : '') + '</small></div>' +
      '<span class="tmc" data-tmfc="1">' + (l === null ? 'not running' : (l > 0 ? 'in ' + A.mmss(l) : 'DUE +' + A.mmss(-l))) + '</span><div class="tmb2"><button type="button" data-act="fc" class="pri">' + (l === null ? 'Start 55:00' : 'Done · restart') + '</button>' +
      (l !== null ? '<button type="button" data-act="x-fcstop">Stop</button>' : '') + '</div></div>';
  }
  function timersHtml() {
    var h = fcBlock() + '<div class="tml">' + (S.timers.length ? S.timers.slice().sort(function (a, b) { return a.end - b.end; }).map(function (t) {
      var l = tLeft(t);
      return '<div class="tmr ' + (l <= 0 ? 'red' : (l <= 120 ? 'amb' : '')) + '"><div><b>' + esc(t.name) + '</b><small>' + (t.rep ? 'every ' + t.min + ' min' : (t.min ? t.min + ' min' : 'at ' + A.isoZ(new Date(t.end).toISOString()))) + ' · due ' + A.isoZ(new Date(t.end).toISOString()) + '</small></div>' +
        '<span class="tmc" data-tml="' + t.id + '">' + leftTxt(t.id) + '</span><div class="tmb2"><button type="button" data-act="tm" data-id="' + t.id + '">' + (t.rep ? 'Done · restart' : 'Done') + '</button>' +
        '<button type="button" data-act="x-tm5" data-id="' + t.id + '">+5</button><button type="button" data-act="x-tmdel" data-id="' + t.id + '">Stop</button></div></div>';
    }).join('') : '<p class="note">No timers running.</p>') + '</div>';
    h += '<h3 class="shh">Quick start</h3><div class="chips">' + PRESET.map(function (p, i) { return '<button type="button" class="chipbtn" data-act="x-tmp" data-i="' + i + '">' + esc(p[0]) + ' · ' + p[1] + ' min' + (p[2] ? ' ↻' : '') + '</button>'; }).join('') + '</div>';
    h += '<h3 class="shh">New timer</h3><div class="frm"><label>Name<input id="tm-n" maxlength="40" placeholder="e.g. Call OCC"></label><label>Minutes<input id="tm-m" inputmode="numeric" maxlength="4" placeholder="30"></label>' +
      '<label>or at UTC<input id="tm-at" inputmode="numeric" maxlength="4" placeholder="HHMM"></label><label class="ckl"><input type="checkbox" id="tm-r"> repeat</label><button type="button" data-act="x-tmadd" class="pri">Start</button></div>' +
      '<p class="note">Timers show in the alert bar (2 min before and when due), in Up next and on NOW, and chime when due if sound alerts are on. Stored per flight on this iPad.</p>';
    return h;
  }
  function openTimers() { openSheet('timers', 'Timers', timersHtml, { tick: function () { SB.querySelectorAll('[data-tml]').forEach(function (s) { s.textContent = leftTxt(s.dataset.tml); });
    var f = SB.querySelector('[data-tmfc]'); if (f) { var l = A.fcLeft(); if ((l === null) !== (f.textContent === 'not running') || (l !== null && SB.querySelector('.tfc button.pri').textContent !== 'Done · restart')) { rerender(); return; } f.textContent = l === null ? 'not running' : (l > 0 ? 'in ' + A.mmss(l) : 'DUE +' + A.mmss(-l)); } } }); }
  /* v2.0: running timers (fuel check + own timers) as chips in the header - tap = Timers */
  var TMX = $('tmx'), tmxKey = '';
  function paintTmx() {
    if (!TMX) return;
    var L = [], fl = A.fcLeft ? A.fcLeft() : null;
    if (fl !== null) L.push({ id: 'fc', n: 'FUEL CHECK', l: fl, amb: 300 });
    S.timers.slice().sort(function (a, b) { return a.end - b.end; }).slice(0, 3).forEach(function (t) { L.push({ id: t.id, n: t.name.toUpperCase(), l: tLeft(t), amb: 120 }); });
    var key = L.map(function (x) { return x.id; }).join('|');
    if (key !== tmxKey) { tmxKey = key; TMX.innerHTML = L.map(function (x) { return '<button type="button" class="tmxc" data-act="x-timers" data-k="' + esc(x.id) + '"><small>' + esc(x.n) + '</small><b></b></button>'; }).join(''); }
    L.forEach(function (x) { var b = TMX.querySelector('[data-k="' + x.id + '"]'); if (!b) return; b.querySelector('b').textContent = x.l > 0 ? A.mmss(x.l) : 'DUE +' + A.mmss(-x.l); b.className = 'tmxc' + (x.l <= 0 ? ' red' : (x.l <= x.amb ? ' amb' : '')); });
    TMX.hidden = !L.length;
  }
  on('b-timer', 'click', openTimers);
  var fired = {};
  function tmAlerts() {
    var out = [];
    S.timers.forEach(function (t) {
      var l = tLeft(t);
      if (l <= 120) out.push({ k: 'tm:' + t.id + (l <= 0 ? 'd' : 's'), cls: l <= 0 ? 'red' : 'amb', tm: true, id: t.id, name: t.name, rep: t.rep });
      if (l <= 0 && l > -30 && !fired[t.id + t.end]) { fired[t.id + t.end] = 1; A.chime(2); }
    });
    return out;
  }

  /* ---------- data for the NOW cards / Up next */
  var EI = D.etops_info || null;
  var LV = D.events.filter(function (v) { return v.kind === 'level' && /FL\d{3}/.test(v.text); });
  var TOD = null;
  function tod() {
    if (TOD !== null) return TOD;
    var g = G(), i = g ? g.info(0) : null;
    if (i && i.tod != null) TOD = i.tod; else { var dv = D.events.filter(function (v) { return v.kind === 'descent'; })[0]; TOD = dv ? dv.eet_min : -1; }
    return TOD;
  }
  var GND = [['rep', 'Report'], ['brf', 'Crew briefing'], ['brd', 'Boarding'], ['dc', 'Doors closed']];
  function gndItems() {
    var out = [], std = eUtc(F.std);
    GND.forEach(function (g) { var v = S.gnd[g[0]], e = v ? eUtc(v) : null; if (e != null) out.push({ k: 'g:' + g[0], t: e, what: g[1] + ' ' + v + 'Z', kind: 'gnd' }); });
    if (std != null) out.push({ k: 'g:std', t: std, what: 'STD ' + String(F.std).replace(':', '') + 'Z (OFP)', kind: 'gnd' });
    return out.sort(function (a, b) { return a.t - b.t; });
  }
  function items(e) {
    var it = [];
    S.timers.forEach(function (t) { it.push({ k: 't:' + t.id, t: e + tLeft(t) / 60, what: t.name + ' (timer)', kind: 'tm', id: t.id }); });
    if (e < 0) gndItems().forEach(function (g) { if (g.t > e) it.push(g); });
    var td = tod();
    if (td > 0) [[td - 30, 'ATIS / arrival weather (TOD − 30)'], [td - 20, 'Approach briefing (TOD − 20)'], [td, 'Top of descent (TOD)']].forEach(function (x, i) { if (x[0] > e) it.push({ k: 'a:' + i, t: x[0], what: x[1], kind: 'arr' }); });
    return it;
  }
  function cards(e, C, card) {
    var td = tod(), eC = Math.max(0, Math.min(T, e));
    if (S.timers.length) {
      var ts = S.timers.slice().sort(function (a, b) { return a.end - b.end; }), l0 = tLeft(ts[0]);
      C.push(card('tmc', 'Timers', l0 > 0 ? esc(ts[0].name) + ' ' + Math.ceil(l0 / 60) + ' min' : 'DUE ' + esc(ts[0].name), l0 <= 0 ? 'red' : (l0 <= 120 ? 'amb' : 'grn'),
        ts.slice(1, 4).map(function (t) { return esc(t.name) + ' ' + Math.max(0, Math.ceil(tLeft(t) / 60)) + ' min'; }).join(' · '), '<button type="button" class="cbtn" data-act="x-timers">Timers</button>'));
    }
    if (e < 0) {
      var gi = gndItems().filter(function (g) { return g.t > e; });
      C.push(card('gnd', 'Ground countdown', gi.length ? gi[0].what.split(' ').slice(0, -1).join(' ') + ' ' + cd(gi[0].t - e) : 'set times', gi.length && gi[0].t - e <= 10 ? 'amb' : '',
        gi.slice(1, 4).map(function (g) { return esc(g.what) + ' ' + cd(g.t - e); }).join(' · ') || 'report, briefing, boarding, doors – from your roster', '<button type="button" class="cbtn" data-act="x-gnd">Set times</button>'));
    }
    if (EI && e < EI.exit.eet_min + 10) {
      var a = EI.entry.eet_min, b = EI.exit.eet_min, k, kc = '';
      if (e < a) { k = 'entry ' + cd(a - e); kc = a - e <= 15 ? 'amb' : ''; } else if (e <= b) { k = 'IN ETOPS · exit ' + cd(b - e); kc = 'amb'; } else k = 'exited';
      var wp = (EI.weather_permissible || [])[0], wtx = '';
      if (wp) { var w = wp.window_utc.split('-'), wa = eUtc(w[0]), wb = eUtc(w[1]); wtx = ' · ' + esc(wp.icao) + ' wx window ' + w[0] + '–' + w[1] + 'Z (' + (e < wa ? 'opens ' + cd(wa - e) : (e <= wb ? 'open, closes ' + cd(wb - e) : 'closed')) + ')'; }
      var cf = (EI.critical_fuel || [])[0];
      C.push(card('etp', 'ETOPS ' + EI.rule_min + ' min', k, kc, 'Entry ' + zt(a) + ' (' + esc(EI.entry.airport) + ') · exit ' + zt(b) + ' (' + esc(EI.exit.airport) + ')' + wtx +
        (cf ? ' · crit fuel ' + esc(cf.at) + '→' + esc(cf.to) + ' ' + cf.reqd_t.toFixed(1) + ' t vs ' + cf.rem_t.toFixed(1) + ' t' : ''), '<button type="button" class="cbtn" data-act="x-etops">ETOPS details</button>'));
    }
    var nx = null, cur = null; LV.forEach(function (v) { if (v.eet_min <= eC) cur = v; else if (!nx) nx = v; });
    if (nx && e < T) {
      var n2 = LV[LV.indexOf(nx) + 1];
      C.push(card('stc', 'Step climb', nx.text.match(/FL\d{3}/)[0] + ' ' + cd(nx.eet_min - e), nx.eet_min - e <= 10 ? 'amb' : '',
        esc(nx.text) + ' · ' + zt(nx.eet_min) + (cur ? ' · now ' + cur.text.match(/FL\d{3}/)[0] : '') + (n2 ? ' · then ' + esc(n2.text) + ' ' + zt(n2.eet_min) : '')));
    }
    if (td > 0 && e < T) {
      C.push(card('tod', 'Top of descent', e < td ? cd(td - e) : 'descending', e < td && td - e <= 30 ? 'amb' : (e >= td ? 'mag' : ''),
        'TOD ' + zt(td) + ' · ATIS ' + zt(td - 30) + ' · approach brief ' + zt(td - 20) + ' · land ' + zt(T)));
    }
    if (T2 && T2.cards) T2.cards(e, C, card);
    if (window.FPReturn && e > T - 90) C.push(card('ret', 'Turnaround – return flight', esc(window.FPReturn.title.split(' ').slice(0, 2).join(' ')), 'mag', 'Saved on this iPad: ' + esc(window.FPReturn.title) + '. Open it after landing – this flight stays stored.', '<button type="button" class="cbtn" data-act="x-ret">Open return flight</button>'));
    if (S.pins.length) C.push(card('pin', 'Pinned', S.pins.length + (S.pins.length === 1 ? ' item' : ' items'), '',
      '', '<ul class="pins">' + S.pins.map(function (p, i) { return '<li><a href="#' + p.v + '" data-act="x-pgo" data-i="' + i + '">' + esc(p.t.length > 140 ? p.t.slice(0, 140) + '…' : p.t) + '</a><button type="button" data-act="x-unpin" data-i="' + i + '" aria-label="Unpin">✕</button></li>'; }).join('') + '</ul>'));
    if (S.mel.length) C.push(card('mel', 'MEL items', S.mel.length + ' open', 'amb', S.mel.map(function (m) { var f = X.melFind ? X.melFind(m.no) : null, pr = f ? (f.v.map(function (v) { return v.pr; }).join(' ').match(/\((?:O|M-CD)\)/g) || []).filter(function (x, j, a) { return a.indexOf(x) === j; }) : []; return esc(m.no) + ' ' + esc(m.title) + (pr.length ? ' <b class="mvt">' + esc(pr.join(' / ')) + '</b>' : ''); }).join(' · '), '<button type="button" class="cbtn" data-act="x-mel">MEL items</button>'));
  }

  /* ---------- DIVERT: nearest airports, emergency, lost comms, interception */
  var divTab = 'apt';
  function curFir(e) { var c = null; (D.firseq || D.firs).forEach(function (f) { if (f.eet_min <= e) c = f; }); return c; }   // v3.5.1: firseq keeps re-entries
  function here(e) { var g = G(); return g ? g.here(e) : null; }
  function aptRows(e) {
    var h = here(e); if (!h) return null;
    var gs = h.gs || 480;
    return D.geo.apt.map(function (a) {
      var ch = D.chain.filter(function (c) { return c.icao === a.icao; }), ll = [a.lon, a.lat], d = gdist(h.ll, ll);
      var ok = ch.length && ch.some(function (c) { return c.cls !== 'CA'; }) && !/not usable/i.test(a.lab);
      var al = (D.alts || []).filter(function (x) { return x.icao === a.icao; })[0];
      var rw = (a.lab.split('|')[1] || '').trim() || (al ? al.rwy : '') || (a.icao === F.arr ? (D.rwy || {}).arr : (a.icao === F.dep ? (D.rwy || {}).dep : ''));
      var win = ch.some(function (c) { return e >= c.a && e <= c.b; });
      var wx = (D.wx || []).filter(function (w) { return w.icao === a.icao; })[0];
      return { a: a, ch: ch, d: d, trk: brg(h.ll, ll), ok: ok, rw: rw, win: win, wx: wx, t2: d / gs * 60, t1: d / 420 * 60 };
    }).sort(function (x, y) { return (y.ok - x.ok) || (x.d - y.d); });
  }
  function srcLine(h, e) {
    if (!h) return '';
    return h.src === 'gps' ? 'Position: <b>iPad GPS</b> ±' + Math.round(h.acc) + ' m · GS ' + Math.round(h.gs) + ' kt' :
      'Position: <b>planned</b> (elapsed time +' + hm(Math.max(0, Math.min(T, e))) + (h.src === 'plan' ? ', planned T/O – no T/O set' : '') + ') · planned GS ' + Math.round(h.gs || 0) + ' kt';
  }
  function divAlerts() {
    return (D.crew_alert || []).filter(function (c) { return /DIVERSION/i.test(c.title); }).map(function (c) { return '<div class="banner"><b>' + esc(c.id) + ' ' + esc(c.title) + '</b><br>' + esc(c.x) + '</div>'; }).join('');
  }
  function aptHtml(e) {   // v2.0 (user 05 NOV 26): short rows; tap one -> what you need to fly there and land
    var rows = aptRows(e), h = here(e); if (!rows) return '<p class="note">Map data not available.</p>';
    var DI = D.divinfo || {};
    var s = '<p class="sub dvpos">' + srcLine(h, e) + '</p>' + divAlerts();
    s += '<div class="dvl2">' + rows.map(function (r) {
      var I = DI[r.a.icao] || {}, role = (r.a.lab.split(' - ')[1] || '').replace(/\|.*$/, '').trim(), nm = I.name || (r.wx && r.wx.name) || '';
      var tag = r.ch.map(function (c) { return c.cls; })[0], wx = I.wx ? I.wx.sum : '';
      var rw = (I.rwys || []).map(function (x) { return x[0]; }).join(' / ') || (r.rw ? 'RWY ' + r.rw : '');
      var head = '<summary class="dvs"><b class="dvi">' + esc(r.a.icao) + '</b><span class="dvnm">' + esc(I.name || '') + (role ? ' <em>' + esc(role) + '</em>' : '') + '</span>' +
        '<span class="dvd"><b>' + Math.round(r.d) + ' NM</b> ' + d3s(r.trk) + '°T · ' + hm(Math.round(r.t2)) + '</span>' +
        '<span class="dvq">' + (tag ? '<i class="tag dv-' + esc(tag) + '">' + esc(tag) + '</i>' : '') + (rw ? '<i>' + esc(rw) + '</i>' : '') +
        (wx ? '<i class="' + (/^watch/.test(wx) ? 'w' : 'g') + '">wx ' + esc(wx.replace(/^watch: /, '')) + '</i>' : '') +
        ((I.fuel || []).length ? '<i class="f">OFP fuel</i>' : '') + (r.win ? '<i class="g">in 1-h window</i>' : '') + '</span></summary>';
      return '<details class="dvc' + (r.ok ? '' : ' no') + '" data-icao="' + esc(r.a.icao) + '">' + head + divCard(r, I) + '</details>';
    }).join('') + '</div><p class="note">Distance / true track / time from the position above (GPS ground speed or the planned GS). Tap an airport for runways, ILS, frequencies, weather, NOTAMs, a short AOI / CCI summary and OFP fuel. ' +
      esc(D.divinfo_src || '') + '. Check suitability, weather and the OFP / OM-C before deciding.</p>';
    return s;
  }
  function divCard(r, I) {
    var row = function (k, v) { return v ? '<div class="dvk"><small>' + k + '</small><div>' + v + '</div></div>' : ''; };
    var RW = I.rwys || [], oneW = RW.every(function (x) { return x[2] === RW[0][2]; });   // v3.5: the width per runway when they differ
    var rw = RW.map(function (x) { return '<b>' + esc(x[0]) + '</b> LDA ' + x[1] + ' m' + (oneW ? '' : ' x ' + x[2]); }).join(' · ') + (RW.length && oneW ? ' · ' + RW[0][2] + ' m wide' : '') + (I.elev != null ? ' · AD ELEV ' + I.elev + ' ft' : '') + (I.ta ? ' · ' + esc(I.ta) : '');
    var afc = (I.afc || []).map(function (c) { return '<button type="button" data-act="x-afc" data-icao="' + esc(r.a.icao) + '" data-code="' + esc(c.code) + '" data-t="' + esc(c.t) + '"><svg class="ic" aria-hidden="true"><use href="#i-map"/></svg>AFC ' + esc(c.code) + '</button>'; }).join('');
    var ils = (I.ils || []).map(function (x) { return esc(x[1]) + ' <b class="fq" data-fq="' + esc(x[0]) + '" data-lab="' + esc(r.a.icao + ' ' + x[1]) + '">' + esc(x[0]) + '</b>'; }).join(' · ');
    var fq = (I.freqs || []).map(function (x) { return esc(x[0]) + ' <b class="fq" data-fq="' + esc(x[1]) + '" data-lab="' + esc(r.a.icao + ' ' + x[0]) + '">' + esc(x[1]) + '</b>'; }).join(' · ');
    var wx = I.wx ? esc(I.wx.sum) + ((I.wx.metar || I.wx.taf) ? '<details class="cmx dvraw"><summary aria-label="METAR / TAF">' + EYE + '<span>METAR / TAF</span></summary><code>' + esc(I.wx.metar || '') + '</code><code>' + esc(I.wx.taf || '') + '</code></details>' : '') : '';
    var ns = I.notams || [], nt = ns.slice(0, 3).map(function (n) { return '<li>' + esc(n.t) + ' <span class="ref">' + esc(n.id) + '</span></li>'; }).join('');
    var nmore = ns.length > 3 ? '<details class="cmx"><summary>' + EYE + '<span>' + (ns.length - 3) + ' more NOTAMs</span></summary><ul>' + ns.slice(3).map(function (n) { return '<li>' + esc(n.x) + ' <span class="ref">' + esc(n.id) + '</span></li>'; }).join('') + '</ul></details>' : '';
    var F2 = ((D.aptinfo || {})[r.a.icao] || {}).facts || {};
    var cci = [I.cat ? 'Airport <b>CAT ' + esc(I.cat) + '</b>' : '', I.lvo ? esc(I.lvo) : '', I.park ? 'Parking: ' + esc(I.park) : '', I.gha ? 'Handling: ' + esc(I.gha) : '', I.brake ? 'Brake cooling: ' + esc(I.brake) : '',
      F2.RFF ? 'RFF ' + esc(F2.RFF.replace(/\.$/, '')) : '', F2.Fuel ? 'Fuel ' + esc(F2.Fuel) : '', F2.Customs ? 'Customs ' + esc(F2.Customs) : ''].filter(Boolean).join(' · ');
    var arr = (I.sum ? I.sum.map(function (x) { return '<li>' + esc(x[0]) + ' <span class="ref">' + esc(x[1]) + '</span></li>'; }) :
      (I.arr || []).concat(I.add || []).map(function (x) { return '<li>' + esc(x) + '</li>'; })).join('');
    var fuel = (I.fuel || []).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + (I.etops ? '<li>' + esc(I.etops) + '</li>' : '');
    var any = rw || ils || fq || cci || arr || nt || fuel || afc;
    return '<div class="dvb">' + (any ? row('Runways', rw) + row('ILS', ils) + row('Frequencies', fq) + row('Weather (OFP)', wx || 'no METAR / TAF in the OFP') +
      row('NOTAMs (OFP)', nt ? '<ul>' + nt + '</ul>' + nmore : 'none with runway / ILS / closure keywords') + row('AOI / CCI summary', (arr ? '<ul class="dvsum">' + arr + '</ul>' : '') + (cci ? '<div class="dvfx">' + cci + '</div>' : '')) + row('Fuel (OFP)', fuel ? '<ul>' + fuel + '</ul>' : '') :
      '<p class="note">No Lido AOI / CCI for this airport in this pack' + (r.wx ? ' – OFP weather only.' : '.') + '</p>' + (r.wx && (r.wx.metar || r.wx.taf) ? '<code>' + esc(r.wx.metar || '') + '</code><code>' + esc(r.wx.taf || '') + '</code>' : '')) +
      '<div class="dvbb"><button type="button" data-act="x-map" data-icao="' + esc(r.a.icao) + '"><svg class="ic" aria-hidden="true"><use href="#i-pin"/></svg>Show on map</button>' + afc +
      '</div></div>';
  }
  var EYE = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  function aptFacts(icao) {   // Lido AOI 1-10 facts + the AOI pages (DocuNet capture)
    var I = D.aptinfo && D.aptinfo[icao]; if (!I) return '';
    var F2 = I.facts || {}, ks = [['RFF', 'RFF'], ['Fuel', 'Fuel'], ['ATS Hours', 'ATS'], ['Customs', 'Customs']];
    var line = ks.filter(function (k) { return F2[k[0]]; }).map(function (k) { return '<span><b>' + k[1] + '</b> ' + esc(F2[k[0]].replace(/\.$/, '')) + '</span>'; }).join('');
    return (line ? '<div class="dvf">' + line + '</div>' : '') + (F2['Runway Restrictions'] ? '<div class="dvx">RWY: ' + esc(F2['Runway Restrictions']) + '</div>' : '') +
      '<details class="dvt"><summary>Lido AOI (' + I.pages.length + ' pages)</summary>' + I.pages.map(function (p) { return '<p class="rcfx"><b>' + esc(p[0]) + '</b>\n' + esc(p[1]) + '</p>'; }).join('') + '<p class="note">' + esc(I.src) + '</p></details>';
  }
  X.aptFacts = aptFacts;
  function fq(f, lab) { return '<button type="button" class="fqb fq" data-fq="' + esc(f) + '" data-lab="' + esc(lab || '') + '">' + esc(f) + '</button>'; }
  function emerHtml(e) {
    var f = curFir(Math.max(0, e)), c = f && D.comms_fir ? D.comms_fir[f.fir] : null, sat = (D.satcom || []).filter(function (x) { return f && x.fir === f.fir; });
    var s = '<div class="emh"><div><small>FIR now</small><b>' + (f ? esc(f.fir) + ' ' + esc(f.name) : '-') + '</b></div>' + (c ? '<div><small>VHF</small><b>' + esc(c.vhf) + '</b></div>' : '') +
      (c && c.hf ? '<div><small>HF ' + esc(c.who || '') + '</small><b>' + esc(Object.keys(c.hf).map(function (k) { return (k === 'any' ? '' : k + ' ') + c.hf[k].join(' '); }).join(' · ')) + '</b></div>' : '') + '</div>';
    s += '<div class="emq">' + fq('121.500', 'Emergency / guard') + fq('123.450', 'Air-to-air') + '<span class="sq"><b>7700</b>emergency</span><span class="sq"><b>7600</b>radio failure</span><span class="sq"><b>7500</b>unlawful interference</span></div>';
    if (sat.length) s += '<p class="emc">SATCOM: ' + sat.map(function (x) { return esc(x.unit) + (x.code ? ' <b>' + esc(x.code) + '</b>' : '') + (x.tel ? ' · ' + esc(x.tel) : ''); }).join(' / ') + ' <small>(' + esc(sat[0].src) + ')</small></p>';
    var ib = D.geo && D.geo.ifbp ? D.geo.ifbp.segs.filter(function (q) { return e >= q.a && e <= q.b; })[0] : null;
    if (ib) s += '<div class="banner">In the IFBP area: broadcast on 126.9 MHz (see IFBP on the map).</div>';
    var rn = (D.rnotams || []).filter(function (n) { return n.kind === 'conflict' && f && (n.fir === f.fir || new RegExp(f.name.replace(/[^A-Za-z]/g, '').toUpperCase() + ' FIR').test(n.x.replace(/[^A-Z ]/g, ''))); });
    if (rn.length) s += rn.map(function (n) { return '<div class="banner red"><b>' + esc(n.id) + '</b> ' + esc(n.x) + '</div>'; }).join('');
    var fp = f && D.firproc ? D.firproc[f.fir] : null;
    if (fp && (fp.cont || fp.cont2)) s += '<details class="nt"><summary><b>' + esc(f.fir) + ' contingency plan</b> <span class="tag">Lido CRAR</span><span class="ntx">what ATC and you do if ' + esc(f.name) + ' ATC services are disrupted (contingency routes, levels, frequencies)</span></summary><p>' + esc([fp.cont, fp.cont2].filter(Boolean).join('\n\n')) + '</p><p class="note">' + esc(D.firproc_src || '') + '</p></details>';
    var dp = D.events.filter(function (v) { return v.kind === 'dp'; });
    if (dp.length) s += '<h3 class="shh">Decompression point (OFP / pack)</h3><ul>' + dp.map(function (v) { return '<li>' + esc(v.text) + ' · EET ' + hm(v.eet_min) + ' (' + zt(v.eet_min) + ')</li>'; }).join('') + '</ul>';
    var esA = D.chain.filter(function (c) { return /escape/i.test(c.note) && e >= c.a && e <= c.b; });
    if (esA.length) s += '<p class="emc">Escape airports now (TEM chain): ' + esA.map(function (c) { return '<b>' + esc(c.icao) + '</b> ' + hm(c.a) + '–' + hm(c.b); }).join(' · ') + '</p>';
    var rows = aptRows(e); if (rows) s += '<p class="emc">Nearest suitable: ' + rows.filter(function (r) { return r.ok; }).slice(0, 3).map(function (r) { return '<b>' + esc(r.a.icao) + '</b> ' + Math.round(r.d) + ' NM ' + d3s(r.trk) + '°T ' + hm(Math.round(r.t2)); }).join(' · ') + ' <button type="button" data-act="x-dtab" data-t="apt">All airports</button></p>';
    s += '<h3 class="shh">In-flight contingency without clearance <small>Lido GEN 1.4.2.17.4.1 (ICAO Doc 4444)</small></h3><ol class="emo">' +
      '<li>Turn at least <b>30°</b> right or left to establish a parallel same-direction track <b>offset 5 NM</b> (direction: route system, traffic, alternate, SLOP, terrain).</li>' +
      '<li>Watch for traffic visually and on ACAS (TA/RA). All exterior lights ON.</li><li>Transponder on; <b>squawk 7700</b> when able; ADS-B / ADS-C emergency mode.</li>' +
      '<li>Advise ATC as soon as practicable (voice and/or CPDLC) – <b>MAYDAY</b> or <b>PAN PAN</b> ×3.</li>' +
      '<li>Broadcast on the frequency in use and on <b>121.500</b> (backup 123.450): identification, nature of the problem, intentions, position (route), level.</li>' +
      '<li>Keep the level until established on the 5 NM offset if possible (else minimise the descent rate). Then either descend <b>below FL290</b> with a <b>500 ft</b> offset from normal levels, or keep a 500 ft offset (1000 ft above FL410).</li></ol>';
    s += '<h3 class="shh">Emergency descent <small>Lido GEN 1.4.2.17.3</small></h3><ol class="emo"><li>Navigate as appropriate.</li><li>Advise ATC of the emergency descent and intentions.</li><li>Squawk <b>7700</b>; ADS-B / ADS-C emergency mode.</li><li>Exterior lights ON.</li><li>Watch for traffic (visual / ACAS).</li><li>When the descent is complete, coordinate further intentions with ATC.</li></ol>' +
      '<p class="note">Company procedures (QRH, OM-A, OM-C 12.3.3.4) and the OFP drift-down strategies (RAIG H1/H2) prevail.</p>';
    return s;
  }
  /* weather deviation (Lido GEN 1.4.2.17.4.2) and contingency offset (GEN 1.4.2.17.4.1) for the planned track and level now */
  function trackAt(e) { var R2 = D.geo.route, a = R2[0], b = R2[1]; for (var i = 0; i < R2.length - 1; i++) if (R2[i].e <= e) { a = R2[i]; b = R2[i + 1]; } return brg([a.lon, a.lat], [b.lon, b.lat]); }
  function flAt(e) { var f = null; LV.forEach(function (v) { if (v.eet_min <= e) f = +v.text.match(/FL(\d{3})/)[1]; }); return f || (LV[0] ? +LV[0].text.match(/FL(\d{3})/)[1] : null); }
  function flx(n) { return 'FL' + String(Math.round(n)).padStart(3, '0'); }
  function devHtml(e) {
    var eC = Math.max(0, Math.min(T, e)), tr = trackAt(eC), fl = flAt(eC), east = tr < 180, near = Math.min(Math.abs(tr - 0), Math.abs(tr - 180), Math.abs(tr - 360)) < 15;
    var L = east ? -3 : 3, Rr = -L, box = function (side, d) { return '<span class="' + (d < 0 ? 'r' : 'g') + '"><small>DEVIATE ' + side + ' ≥ 5 NM</small><b>' + (d < 0 ? 'DESCEND' : 'CLIMB') + ' 300 ft</b>' + (fl ? '<em>' + flx(fl) + ' → ' + (fl * 100 + d * 100).toLocaleString('en-GB') + ' ft</em>' : '') + '</span>'; };
    var s = '<p class="sub">Planned track now <b>' + d3s(tr) + '°T</b> → ' + (east ? '<b>EAST</b> (000–179°)' : '<b>WEST</b> (180–359°)') + ' · planned level <b>' + (fl ? flx(fl) : '–') + '</b> · EET ' + hm(eC) + '</p>' +
      (near ? '<div class="banner">Track within 15° of north/south: the table uses MAGNETIC track – check the magnetic course on the ND before choosing.</div>' : '');
    s += '<h3 class="shh">Weather deviation without clearance <small>Lido GEN 1.4.2.17.4.2 (ICAO Doc 4444)</small></h3><div class="big2 dev">' + box('LEFT', L) + box('RIGHT', Rr) + '</div>' +
      '<ol class="emo"><li>Ask first: “WEATHER DEVIATION REQUIRED” (or CPDLC lateral request); PAN PAN if needed.</li><li>If no clearance: deviate away from an organised track / route system if possible.</li>' +
      '<li>Broadcast identification, level, position (route) and intentions on the frequency in use and <b>121.500</b> (backup 123.450). Watch traffic (visual / ACAS). Exterior lights ON.</li>' +
      '<li>Less than 5 NM from the cleared track: stay at the assigned level. At about 5 NM: change level as in the boxes above.</li><li>Back on track: be at the assigned level within about 5 NM of the centre line. Keep trying for a clearance.</li></ol>' +
      '<div class="tw"><table class="ctab"><thead><tr><th>Cleared track (magnetic)</th><th>Deviation ≥ 5 NM</th><th>Level change</th></tr></thead><tbody><tr' + (east ? ' class="curfir"' : '') + '><td>EAST 000–179°</td><td>LEFT</td><td>DESCEND 300 ft</td></tr><tr' + (east ? ' class="curfir"' : '') + '><td>EAST 000–179°</td><td>RIGHT</td><td>CLIMB 300 ft</td></tr>' +
      '<tr' + (!east ? ' class="curfir"' : '') + '><td>WEST 180–359°</td><td>LEFT</td><td>CLIMB 300 ft</td></tr><tr' + (!east ? ' class="curfir"' : '') + '><td>WEST 180–359°</td><td>RIGHT</td><td>DESCEND 300 ft</td></tr></tbody></table></div>';
    var hl = (tr + 330) % 360, hr = (tr + 30) % 360, off = fl ? (fl > 410 ? [fl - 10, fl + 10] : [fl - 5, fl + 5]) : null;
    s += '<h3 class="shh">Contingency offset (cannot keep the clearance) <small>Lido GEN 1.4.2.17.4.1</small></h3><div class="big2"><span><small>TURN LEFT ≥ 30°</small><b>' + d3s(hl) + '°T or less</b><em>then 5 NM left, parallel ' + d3s(tr) + '°T</em></span>' +
      '<span><small>TURN RIGHT ≥ 30°</small><b>' + d3s(hr) + '°T or more</b><em>then 5 NM right, parallel ' + d3s(tr) + '°T</em></span></div>' +
      '<div class="big2"><span class="r"><small>A · DESCEND BELOW FL290, 500 ft OFFSET</small><b>FL285 · FL275 · FL265</b><em>below FL290 the normal levels are every 1000 ft</em></span>' +
      (off ? '<span><small>B · STAY HIGH, ' + (fl > 410 ? '1000' : '500') + ' ft OFFSET</small><b>' + flx(off[0]) + ' or ' + flx(off[1]) + '</b><em>from ' + flx(fl) + '</em></span>' : '') + '</div>' +
      '<p class="note">Choose the side from the route system, adjacent traffic, the alternate, any SLOP being flown and terrain (MORA). Keep the level until established on the 5 NM offset if possible; squawk 7700; advise ATC; broadcast on 121.500. Track is the planned great-circle track from the OFP waypoints (true); level is the OFP planned level, not your actual one.</p>';
    return s;
  }
  function rcfHtml(e) {
    var f = curFir(Math.max(0, e));
    var rn = (D.notams || []).filter(function (n) { return /\bRCF\b|COMMUNICATION FAILURE|COM FAILURE|RADIO FAILURE/.test(n.x); });
    var s = '<div class="emq"><span class="sq"><b>7600</b>squawk</span>' + fq('121.500', 'Blind broadcast') + '</div>' +
      '<h3 class="shh">IMC – ICAO standard <small>Annex 2, 3.6.5.2.2 (unless a regional / State procedure applies)</small></h3><ol class="emo">' +
      '<li>Try every other means (other frequencies, HF, CPDLC, SATCOM, relay by other aircraft). Squawk <b>7600</b>; transmit blind on the frequency in use and 121.500.</li>' +
      '<li><b>No surveillance:</b> keep the last assigned speed and level (or minimum flight altitude if higher) for <b>20 min</b> after failing to report over a compulsory reporting point, then adjust level and speed to the filed flight plan.</li>' +
      '<li><b>Surveillance (radar / ADS-B):</b> keep them for <b>7 min</b> after the latest of: reaching the last assigned level or minimum flight altitude, setting 7600, or failing to report over a compulsory point – then follow the filed flight plan.</li>' +
      '<li>If vectored or on an offset without a limit: rejoin the current flight-plan route no later than the next significant point (respecting minimum altitude).</li>' +
      '<li>Proceed by the current flight-plan route to the navaid / fix serving the destination; hold there if needed until descent.</li>' +
      '<li>Start descent at, or as close as possible to, the last acknowledged EAT – or, if none, the ETA from the current flight plan.</li>' +
      '<li>Fly the normal instrument approach for that navaid / fix and land, if possible, within <b>30 min</b> after the ETA or last acknowledged EAT, whichever is later.</li></ol>' +
      '<h3 class="shh">VMC</h3><p>Continue in VMC, land at the nearest suitable aerodrome and report the arrival to ATS by the quickest means.</p>' +
      (function () { var fp = f && D.firproc ? D.firproc[f.fir] : null;
        if (fp && fp.rcf) return '<h3 class="shh">' + esc(f.fir) + ' ' + esc(f.name) + ' – radio-failure procedure <small>Lido CRAR – this applies in the FIR</small></h3><div class="banner">The State procedure below applies in this FIR; the ICAO text above is the general standard.</div><p class="rcfx">' + esc(fp.rcf) + '</p><p class="note">' + esc(D.firproc_src || '') + '</p>';
        return '<p class="note">FIR now: ' + (f ? esc(f.fir) + ' ' + esc(f.name) : '-') + '. No separate radio-failure section was found in the Lido CRAR chapter of this FIR' + (D.firproc_src ? ' (' + esc(D.firproc_src) + ')' : '') + ' – the ICAO standard above applies. Lido RSI 2.7.5.5 (60 min rule) is only for the oceanic Pacific FIRs it lists.</p>'; })();
    if (rn.length) s += '<h3 class="shh">Radio-failure items in the OFP NOTAMs</h3>' + rn.map(function (n) { var i = n.x.search(/\bRCF\b|COMMUNICATION FAILURE|COM FAILURE|RADIO FAILURE/); return '<details class="nt"><summary><b>' + esc(n.icao) + '</b> ' + esc(n.id) + ' · ' + esc(n.cat) + '</summary><p>…' + esc(n.x.slice(Math.max(0, i - 80), i + 900)) + '…</p></details>'; }).join('');
    return s;
  }
  function icptHtml() {
    var sig = [['1', 'Rocks wings from a position slightly above and ahead (normally to the left), flashing nav lights; then a slow level turn (normally left) onto the desired heading.', 'You have been intercepted. Follow me.', 'Rock wings, flash nav lights, follow.'],
      ['2', 'Abrupt break-away: climbing turn of 90° or more without crossing your line of flight.', 'You may proceed.', 'Rock wings.'],
      ['3', 'Lowers the landing gear, steady landing lights on, overflies the runway (helicopter: lands).', 'Land at this aerodrome.', 'Lower the gear, landing lights on, follow, land if safe.']];
    var own = [['4', 'Raise the gear (if fitted) and flash the landing lights while passing over the runway between 1000 and 2000 ft, then circle.', 'Aerodrome you designated is inadequate.'],
      ['5', 'Regular switching on and off of all available lights (distinct from flashing lights).', 'Cannot comply.'], ['6', 'Irregular flashing of all available lights.', 'In distress.']];
    var ph1 = [['CALL SIGN', 'KOL SAIN', 'What is your call sign?'], ['FOLLOW', 'FOL-LO', 'Follow me'], ['DESCEND', 'DEE-SEND', 'Descend for landing'], ['YOU LAND', 'YOU LAAND', 'Land at this aerodrome'], ['PROCEED', 'PRO-SEED', 'You may proceed']];
    var ph2 = [['CALL SIGN (call sign)', 'KOL SAIN', 'My call sign is (call sign)'], ['WILCO', 'VILL-KO', 'Understood, will comply'], ['CAN NOT', 'KANN NOTT', 'Unable to comply'], ['REPEAT', 'REE-PEET', 'Repeat your instruction'],
      ['AM LOST', 'AM LOSST', 'Position unknown'], ['MAYDAY', 'MAYDAY', 'I am in distress'], ['HIJACK', 'HI-JACK', 'I have been hijacked'], ['LAND (place name)', 'LAAND', 'I request to land at (place name)'], ['DESCEND', 'DEE-SEND', 'I require descent']];
    var t = function (rows, hd) { return '<div class="tw"><table class="ict"><thead><tr>' + hd.map(function (x) { return '<th>' + x + '</th>'; }).join('') + '</tr></thead><tbody>' + rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + esc(c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>'; };
    return '<h3 class="shh">If intercepted</h3><ol class="emo"><li>Follow the intercepting aircraft\'s instructions and signals.</li><li>Notify the ATS unit if possible.</li>' +
      '<li>Try to contact the interceptor on <b>121.500</b> (or 243.0): call sign, nature of flight.</li><li>Squawk <b>7700</b> unless instructed otherwise by the ATS unit.</li><li>If instructions by radio conflict with visual signals, ask for clarification and follow the visual signals meanwhile (unless ATS instructions are confirmed).</li></ol>' +
      '<div class="emq">' + fq('121.500', 'Interception') + '<span class="sq"><b>7700</b>squawk</span></div>' +
      '<h3 class="shh">Interceptor signals → your response</h3>' + t(sig, ['Series', 'Interceptor', 'Meaning', 'You']) +
      '<h3 class="shh">Your signals</h3>' + t(own, ['Series', 'Signal', 'Meaning']) +
      '<h3 class="shh">Phrases – interceptor</h3>' + t(ph1, ['Phrase', 'Say', 'Meaning']) + '<h3 class="shh">Phrases – you</h3>' + t(ph2, ['Phrase', 'Say', 'Meaning']) +
      '<p class="note">ICAO Annex 2 (Appendix 1 / 2, Attachment A). Lido RSI 2.7.2.18 (MID/ASIA): NIL regional differences; State rules in the Lido CRAR prevail.</p>';
  }
  function divHtml() {
    var e = A.el(), tabs = [['apt', 'Airports'], ['emer', 'Emergency'], ['dev', 'Wx deviation · offset'], ['rcf', 'Lost comms'], ['icpt', 'Interception']];
    return '<div class="seg dvseg">' + tabs.map(function (t) { return '<button type="button" data-act="x-dtab" data-t="' + t[0] + '" class="' + (divTab === t[0] ? 'on' : '') + '">' + t[1] + '</button>'; }).join('') + '</div>' +
      (divTab === 'apt' ? aptHtml(e) : divTab === 'emer' ? emerHtml(e) : divTab === 'dev' ? devHtml(e) : divTab === 'rcf' ? rcfHtml(e) : icptHtml());
  }
  var divT = 0;
  function openDivert(tab) { if (tab) divTab = tab; openSheet('divert', 'Diversion · emergency', divHtml, { wide: true, tick: function () { if (Date.now() - divT > 30000 && divTab === 'apt') { divT = Date.now(); rerender(); } } }); divT = Date.now(); }
  on('b-divert', 'click', function () { openDivert(); });
  X.openDivert = openDivert; X.aptRows = aptRows; X.curFir = curFir;

  /* ---------- big frequency board */
  var FB = document.createElement('div'); FB.className = 'fboard'; FB.hidden = true; FB.setAttribute('role', 'dialog'); document.body.appendChild(FB);
  function board(f, lab) {   // biggest: the first frequency; any others underneath; the rest of the text as the label
    var fr = String(f).match(/\b\d{3}\.\d{1,3}\b|\b\d{4,5}\b/g) || [String(f)], main = fr[0], rest = fr.slice(1).filter(function (x, i, a) { return a.indexOf(x) === i && x !== main; });
    var txt = fr.length > 1 || String(f).length > 12 ? String(f) : '';
    FB.innerHTML = '<div class="fbl">' + esc(lab || '') + '</div><div class="fbf">' + esc(main) + '</div>' + (rest.length ? '<div class="fbs">' + rest.map(esc).join(' · ') + '</div>' : '') +
      (txt ? '<div class="fbl fbt">' + esc(txt) + '</div>' : '') + '<div class="fbh">tap anywhere to close</div>'; FB.hidden = false;
  }
  FB.addEventListener('click', function () { FB.hidden = true; });
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest('.fq, .cmi, .hf, .sc.com'); if (!b || ev.target.closest('a')) return;
    ev.preventDefault(); ev.stopPropagation();
    var tr = b.closest('tr'), lab = '';
    if (tr) { var fc = tr.querySelector('td.fir'); lab = (fc ? fc.textContent.replace('▶', '').trim() : '') + ' · ' + (tr.querySelector('td.wp') || {}).textContent; }
    if (b.dataset.fq) board(b.dataset.fq, b.dataset.lab);
    else if (b.classList.contains('cmi')) { var bb = b.querySelector('b'); board(bb ? bb.textContent : b.textContent, (b.textContent.replace(bb ? bb.textContent : '', '').replace(/^\d+/, '').trim()) + (lab ? ' · ' + lab : '')); }
    else if (b.classList.contains('hf')) board(b.textContent.trim(), 'HF' + (b.classList.contains('now') ? ' (day/night set now)' : '') + (lab ? ' · ' + lab : ''));
    else board(b.textContent.replace(/^COMMS/, '').trim(), 'Comms now');
  }, true);

  /* ---------- highlighter + pin to NOW (press and hold a paragraph on a briefing page) */
  var BLK = 'p, li, dd, dt, td, h3, h4, .cell, .num, .sug, .it';
  function blocks(v) { var sec = A.views[v]; return sec ? Array.prototype.slice.call(sec.querySelectorAll(BLK)) : []; }
  function applyHl() { Object.keys(S.hl).forEach(function (v) { var bl = blocks(v); (S.hl[v] || []).forEach(function (i) { if (bl[i]) bl[i].classList.add('hlx'); }); }); }
  var LP = null, suppress = 0, MENU = document.createElement('div'); MENU.className = 'lpmenu'; MENU.hidden = true; document.body.appendChild(MENU);
  function blockAt(t) { var b = t.closest(BLK), sec = t.closest('.view'); if (!b || !sec) return null; var v = sec.dataset.view; if (v === 'now' || v === 'flights') return null; if (b.closest('table.wpt, .gwrap, .gprof, .sheet')) return null; return { el: b, v: v }; }
  document.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    var hit = blockAt(e.target); if (!hit) return;
    LP = { x: e.clientX, y: e.clientY, hit: hit, t: setTimeout(function () { if (!LP) return; suppress = Date.now(); openMenu(LP.hit, LP.x, LP.y); LP = null; }, 600) };
  });
  ['pointermove'].forEach(function (n) { document.addEventListener(n, function (e) { if (LP && Math.abs(e.clientX - LP.x) + Math.abs(e.clientY - LP.y) > 10) { clearTimeout(LP.t); LP = null; } }); });
  ['pointerup', 'pointercancel', 'scroll'].forEach(function (n) { document.addEventListener(n, function () { if (LP) { clearTimeout(LP.t); LP = null; } }, true); });
  document.addEventListener('click', function (e) { if (MENU.contains(e.target)) return; if (Date.now() - suppress < 700) { suppress = 0; e.preventDefault(); e.stopPropagation(); } }, true);   // only the click that ends the long press
  document.addEventListener('contextmenu', function (e) { if (blockAt(e.target)) e.preventDefault(); });
  var MH = null;
  function openMenu(hit, x, y) {
    var bl = blocks(hit.v), i = bl.indexOf(hit.el); if (i < 0) return; MH = { v: hit.v, i: i, el: hit.el };
    var isH = (S.hl[hit.v] || []).indexOf(i) >= 0, isP = S.pins.some(function (p) { return p.v === hit.v && p.i === i; });
    MENU.innerHTML = '<button type="button" data-m="hl">' + (isH ? 'Remove highlight' : 'Highlight') + '</button><button type="button" data-m="pin">' + (isP ? 'Unpin from NOW' : 'Pin to NOW') + '</button><button type="button" data-m="x">Cancel</button>';
    MENU.hidden = false; var w = MENU.offsetWidth, h = MENU.offsetHeight;
    MENU.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, x - w / 2)) + 'px'; MENU.style.top = Math.max(8, Math.min(window.innerHeight - h - 8, y - h - 14)) + 'px';
    hit.el.classList.add('lpon');
  }
  MENU.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b || !MH) return; var m = b.dataset.m;
    if (m === 'hl') { var a = S.hl[MH.v] = S.hl[MH.v] || [], k = a.indexOf(MH.i); if (k >= 0) { a.splice(k, 1); MH.el.classList.remove('hlx'); } else { a.push(MH.i); MH.el.classList.add('hlx'); } A.save(); }
    if (m === 'pin') { var j = -1; S.pins.forEach(function (p, n) { if (p.v === MH.v && p.i === MH.i) j = n; }); if (j >= 0) S.pins.splice(j, 1); else S.pins.push({ v: MH.v, i: MH.i, t: MH.el.textContent.replace(/\s+/g, ' ').trim().slice(0, 400) }); A.save(); A.toast(j >= 0 ? 'Unpinned.' : 'Pinned to NOW.'); }
    MH.el.classList.remove('lpon'); MENU.hidden = true; MH = null;
  });
  document.addEventListener('pointerdown', function (e) { if (!MENU.hidden && !MENU.contains(e.target)) { MENU.hidden = true; if (MH) MH.el.classList.remove('lpon'); MH = null; } }, true);
  function goBlock(v, i) { location.hash = v; setTimeout(function () { var b = blocks(v)[i]; if (b) flash(b); }, 140); }
  function flash(el) { var r = el.getBoundingClientRect(), top = $('top').offsetHeight; window.scrollTo({ top: Math.max(0, window.scrollY + r.top - top - 60), behavior: 'smooth' }); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
  X.flash = flash;

  /* ---------- search everything */
  var IDX = null;
  function buildIdx() {
    if (window.FPMount && window.FPMount.ensureAll) window.FPMount.ensureAll();   // v3: pages not shown yet are mounted for the index
    IDX = [];
    Object.keys(A.views).forEach(function (v) {
      if (v === 'flights') return; var nm = A.name[v] || v.toUpperCase();
      if (v === 'waypoints') { document.querySelectorAll('#wpt tbody tr:not(.nowline)').forEach(function (tr) { IDX.push({ v: v, nm: nm, el: tr, t: tr.textContent.replace(/\s+/g, ' ').trim() }); }); }
      blocks(v).forEach(function (b) { if (b.closest('#wpt')) return; if (b.querySelector(BLK)) return; var t = b.textContent.replace(/\s+/g, ' ').trim(); if (t.length > 2) IDX.push({ v: v, nm: nm, el: b, t: t }); });
    });
    (D.notams || []).forEach(function (n) { IDX.push({ v: '#notam', nm: 'NOTAMs (OFP)', t: n.icao + ' ' + n.id + ' ' + n.x, n: n }); });
    (D.rnotams || []).forEach(function (n) { IDX.push({ v: '#notam', nm: 'En-route NOTAMs (OFP)', t: n.fir + ' ' + n.id + ' ' + n.x, n: n }); });
    (D.wx || []).forEach(function (w) { IDX.push({ v: '#wx', nm: 'Weather (OFP)', t: w.icao + ' ' + w.name + ' ' + (w.metar || '') + ' ' + (w.taf || '') }); });
    if (window.FPAbbr) window.FPAbbr.forEach(function (a) { IDX.push({ v: '#abbr', nm: 'Abbreviations', t: a[0] + ' – ' + a[1] }); });
  }
  var lastQ = '';
  function srHtml() {
    return '<input id="sq" type="search" class="sqi" placeholder="Search waypoints, frequencies, NOTAMs, rules…" autocomplete="off" autofocus value="' + esc(lastQ) + '"><div id="sr" class="sr">' + results(lastQ) + '</div>';
  }
  var RES = [];
  function results(q) {
    q = (q || '').trim(); if (q.length < 2) return '<p class="note">Type at least 2 characters. Searches every page of the pack, the waypoint table, OFP NOTAMs and weather, and the abbreviation list.</p>';
    if (!IDX) buildIdx();
    var w = q.toUpperCase().split(/\s+/), out = [];
    IDX.forEach(function (x) { var u = x.t.toUpperCase(); if (w.every(function (k) { return u.indexOf(k) >= 0; })) out.push(x); });
    RES = out.slice(0, 80);
    if (!out.length) return '<p class="note">Nothing found for “' + esc(q) + '”.</p>';
    var re = new RegExp('(' + w.map(function (k) { return k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|') + ')', 'gi'), last = '';
    return '<p class="note">' + out.length + ' found' + (out.length > 80 ? ' – showing 80' : '') + '</p>' + RES.map(function (x, i) {
      var u = x.t.toUpperCase(), p = u.indexOf(w[0]), s = x.t.slice(Math.max(0, p - 60), p + 160);
      var hd = x.nm !== last ? '<h3 class="shh">' + esc(x.nm) + '</h3>' : ''; last = x.nm;
      return hd + '<button type="button" class="sri" data-act="x-sgo" data-i="' + i + '">' + (p > 60 ? '…' : '') + esc(s).replace(re, '<mark>$1</mark>') + (p + 160 < x.t.length ? '…' : '') + '</button>';
    }).join('');
  }
  function openSearch() {
    openSheet('search', 'Search the pack', srHtml, { after: function (b) { var i = b.querySelector('#sq'), t = null; i.addEventListener('input', function () { clearTimeout(t); t = setTimeout(function () { lastQ = i.value; b.querySelector('#sr').innerHTML = results(lastQ); }, 120); }); } });
  }
  on('b-search', 'click', openSearch);

  /* ---------- v3: reference card (fp_refs.js) - where a reference lives, the matching text captured in this flight file, open the document */
  var DL = D.doclinks || {};
  /* v3.7 (pilot 10 + 11 NOV: "references to go to DocuNet ... same page straight away", "open the app on the iPad not webpage"):
     a reference opens DocuNet AT that section - in the DocuNet app (scheme://CODE#ID, the form DocuNet's own "document URL" gives) or on the web
     (...?manualCode=CODE&preferredRevisionId=REV&id=ID). The document codes and the section ids are DATA (flight file / regulations library:
     doclinks.scheme, .web, .docs[key].code / .revid / .ids, .ids[map][section], .apt) - this shell holds no company address.
     A section that is not in the id list opens at its nearest parent chapter (exact = false). */
  function refLink(r) {
    var dk = (r.doc || [])[1] || '', docs = DL.docs || {}, cfg = docs[dk] || docs[String(r.k || '').toLowerCase()] || null, ids = DL.ids || {};
    var code = cfg && cfg.code, rev = cfg && cfg.revid, id = '', exact = false, at = '';
    var num = (/(\d+(?:\.\d+)+)/.exec(r.ref || '') || [])[1] || '';
    if (dk === 'apt') {
      var ap = DL.apt || {}, ic = r.icao || '', reg = ic && ((ap.byIcao && ap.byIcao[ic]) || (ap.prefix && (ap.prefix[ic.slice(0, 2)] || ap.prefix[ic.charAt(0)]))), man = reg && ap.manuals && ap.manuals[reg];
      if (!man) return null; code = man.code; rev = man.revid; id = ap.idIsIcao ? ic : ''; at = (man.title || 'airport charts') + (ic ? ' – ' + ic : '');
    } else if (code && num && cfg.ids && ids[cfg.ids]) {
      var map = ids[cfg.ids], q = num; while (q) { if (map[q]) { id = map[q]; exact = q === num; at = q; break; } q = q.indexOf('.') > 0 ? q.replace(/\.\d+$/, '') : ''; }
    }
    if (!code) return null;
    var web = DL.web ? DL.web + (DL.web.indexOf('?') < 0 ? '?' : '&') + 'manualCode=' + encodeURIComponent(code) + '&preferredRevisionId=' + encodeURIComponent(rev || 'Latest') + (id ? '&id=' + encodeURIComponent(id) : '') : '';
    var app = DL.scheme ? DL.scheme + '://' + code + (id ? '#' + encodeURIComponent(id) : '') : '';
    return (app || web) ? { app: app, web: web, exact: exact, at: at, id: id, title: (cfg && (cfg.name || cfg.title)) || at } : null;
  }
  window.FPRefLink = refLink;
  function refPage(doc, ref) {   // page hint from the flight file: doclinks.docs[key].pages = {'3.139': 5066, ...} (longest matching chapter prefix)
    var pg = doc && doc.pages ? doc.pages : null; if (!pg) return null; var num = (/\d+(?:\.\d+)*/.exec(ref) || [''])[0], best = null, bl = -1;
    Object.keys(pg).forEach(function (k) { if ((num + '.').indexOf(k + '.') === 0 && k.length > bl) { bl = k.length; best = k; } });
    return best ? { ch: best, page: pg[best] } : null;
  }
  function refOffline(r) {   // text in this flight file that carries the reference
    var out = [], q = r.ref.replace(/^Lido\s+/i, ''), num = (/\d+(?:[.-]\d+)*[A-Za-z]?/.exec(q) || [''])[0];
    if (/^(AOI|CCI|AFC|AGC|APC|IAC|SID|STAR)/i.test(q) && D.aptinfo) {
      var ai = D.aptinfo[r.icao]; if (ai && ai.pages) ai.pages.forEach(function (p) {
        var title = p[0], hit = num && (title.indexOf(num) === 0 || title.indexOf(' ' + num) >= 0);
        if (!hit && /^(AOI|CCI)/i.test(q) && new RegExp('\\b' + q.split(/\s+/)[0] + '\\b', 'i').test(title) && !num) hit = true;
        if (hit) out.push({ t: r.icao + ' · ' + title, x: p[1].slice(0, 1800) + (p[1].length > 1800 ? ' …' : ''), src: ai.src });
      });
      if (!out.length && ai && ai.pages && num) ai.pages.forEach(function (p) { var i = p[1].indexOf(num); if (i >= 0 && /^(AOI|CCI)/i.test(q)) out.push({ t: r.icao + ' · ' + p[0], x: '… ' + p[1].slice(Math.max(0, i - 200), i + 900) + ' …', src: ai.src }); });
    }
    if (/^(RSI|CRAR|GEN|RM)/i.test(q) && D.firproc) Object.keys(D.firproc).forEach(function (fir) { var P = D.firproc[fir]; Object.keys(P).forEach(function (k) { var x = P[k]; if (typeof x === 'string' && num && x.indexOf(num) >= 0) { var i = x.indexOf(num); out.push({ t: fir + ' · ' + k, x: '… ' + x.slice(Math.max(0, i - 150), i + 900) + ' …', src: D.firproc_src || '' }); } }); });
    if (/^(CC|CO|[A-Z]{1,2}\d{3,5}\/)/.test(q)) { var id = q.replace(/\s+/g, ''); (D.notams || []).concat((D.rnotams || []).map(function (n) { return Object.assign({ icao: n.fir }, n); })).forEach(function (n) { if (n.id === id || n.id.indexOf(id) === 0) out.push({ t: n.icao + ' · ' + n.id, x: n.x, src: 'OFP NOTAM bulletin' }); }); (D.crew_alert || []).forEach(function (c) { if (c.id === id || c.id.indexOf(id) === 0) out.push({ t: c.id + ' · ' + (c.title || ''), x: c.x, src: 'OFP crew alert' }); }); }
    return out.slice(0, 4);
  }
  function refHtml(r) {
    var key = r.k, doc = r.doc || ['Document', ''], dk = doc[1], cfg = DL.docs && (DL.docs[dk] || DL.docs[key.toLowerCase()]) || null, pg = refPage(cfg, r.ref), off = refOffline(r);
    var h = '<div class="refh"><b>' + esc(r.ref) + '</b><span>' + esc(cfg && cfg.title || doc[0]) + (/^(AOI|CCI|AFC|AGC|APC|IAC|SID|STAR)$/.test(key) && r.icao ? ' · ' + esc(r.icao) : '') + '</span></div>';
    if (pg) h += '<p class="refw">Chapter ' + esc(pg.ch) + (cfg.name ? ' of ' + esc(cfg.name) : '') + ' starts on <b>page ' + esc(pg.page) + '</b>' + (cfg.rev ? ' <small>(' + esc(cfg.rev) + ')</small>' : '') + '.</p>';
    else if (cfg && cfg.hint) h += '<p class="refw">' + esc(cfg.hint) + '</p>';
    var btns = '', lk = refLink(r), mode = (function () { try { return localStorage.getItem('fpapp:refopen') || 'app'; } catch (e) { return 'app'; } })();
    function openBtn(u, lab, cls) { return u ? '<a class="refb ' + (cls || '') + '" href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(lab) + '</a>' : ''; }
    if (lk) {
      h += '<p class="refw">' + (lk.id ? (lk.exact ? 'Opens at <b>' + esc(lk.at) + '</b>.' : 'Opens at <b>' + esc(lk.at) + '</b> – the nearest chapter in the link list.') : 'Opens the document (no section link for this reference).') + '</p>';
      if (lk.app) btns += '<a class="refb pri" href="' + esc(lk.app) + '">Open in the DocuNet app</a>';
      if (lk.web) btns += openBtn(lk.web, 'Open on the DocuNet web page', lk.app ? '' : 'pri');
    }
    var url = cfg && cfg.url ? cfg.url : null; if (url && pg && cfg.pageUrl) url = cfg.pageUrl.replace('{page}', pg.page);
    if (url && !lk) btns += openBtn(url, 'Open ' + (cfg.app || 'the document'), 'pri');
    if (/^(AOI|CCI|AFC|AGC|APC|IAC|SID|STAR)$/.test(key) && DL.charts && DL.charts.url) btns += openBtn(DL.charts.url.replace('{icao}', r.icao || ''), 'Open ' + (DL.charts.title || 'the charts app'), url ? '' : 'pri');
    if (!lk && DL.portal && DL.portal.url && (!url || url !== DL.portal.url)) btns += openBtn(DL.portal.url, 'Open ' + (DL.portal.title || 'DocuNet'), btns ? '' : 'pri');
    if ((key === 'MEL' || key === 'CDL') && D.mel) { var mno = (/\d{2}-\d{2}-\d{2}(?:-\d{2})?[A-Z]?/.exec(r.ref) || [''])[0]; if (mno) btns = '<button type="button" class="refb pri" data-act="melv" data-no="' + esc(mno) + '">Open MEL ' + esc(mno) + ' in the app</button>' + btns.replace(' pri', ''); }
    if (key === 'NOTAM' && $('v-wxnotam')) btns = '<a class="refb pri" href="#wxnotam">Open the WX · NOTAM page</a>' + btns.replace(' pri', '');
    btns += '<button type="button" class="refb" data-act="x-refcopy" data-t="' + esc(r.ref + (pg ? ' – page ' + pg.page : '')) + '">Copy reference</button>';
    h += '<div class="refbs">' + btns + '</div>';
    if (lk) h += '<div class="refmode"><small>A tap on a reference opens:</small><div class="seg">' + [['app', 'DocuNet app'], ['web', 'DocuNet web'], ['card', 'this card']].filter(function (o) { return o[0] === 'card' || lk[o[0]]; }).map(function (o) { return '<button type="button" data-act="x-refmode" data-v="' + o[0] + '" class="' + (mode === o[0] ? 'on' : '') + '">' + o[1] + '</button>'; }).join('') + '</div><small>Hold a reference for this card.</small></div>';
    if (!DL.docs && !DL.portal) h += '<p class="note">No document links in this flight file yet – open ' + esc(doc[0]) + ' yourself' + (pg ? ' at page ' + pg.page : '') + '.</p>';
    if (off.length) h += '<h3 class="shh">In this flight file</h3>' + off.map(function (o) { return '<div class="refo"><b>' + esc(o.t) + '</b><p>' + esc(o.x) + '</p><small>' + esc(o.src) + '</small></div>'; }).join('');
    else h += '<p class="note">No captured text for this reference in the flight file.</p>';
    return h;
  }
  window.FPOpenRef = function (r) { openSheet('ref', 'Reference', function () { return refHtml(r); }); };
  window.FPSheet = function (kind, title, html) { openSheet(kind, title, function () { return html; }); };   // v3.1: simple sheets for the UX layer
  function searchGo(i) {
    var x = RES[i]; if (!x) return; closeSheet();
    if (x.v.charAt(0) === '#') { if (window.FPTools2Open) window.FPTools2Open(x.v.slice(1), x); return; }
    location.hash = x.v; setTimeout(function () { if (x.el) flash(x.el); }, x.v === 'waypoints' ? 160 : 90);
  }

  /* ---------- help tips per page */
  var HELP = {
    dash: [['Airfields now', 'Weather at your time and active NOTAMs per airfield; tap a tile for the WX · NOTAM page.', '#dash-air'], ['Briefing progress', 'One tile per preparation page with its key line; mark a page as briefed at its end and the tile turns green.', '#dash-brief']],
    _top: [['Two groups of pages', 'PREPARATION: DASH, DEP, WX · NOTAM, TEM, ARR, REGS. IN FLIGHT: NOW, WPTS, MAP, TIMERS, DIVERT. In landscape they sit in the rail on the left.', '#tabs'],
      ['ELAPSED · ETA', 'Time since T/O and the revised landing time (UTC and local): the OFP trip time, corrected by the actual time over your last waypoint (the LATE / EARLY chip). Tap ELAPSED to go to DASH, where the take-off time is entered once.', '.el'],
      ['Timer chips', 'Running timers (fuel check, crew check, weather update ...) with their countdown; amber near the end, red when due. Tap = Timers (start / done / stop).', '#tmx'],
      ['NOW', 'The overview page: next action, status strip, Up next, cards.', '#nowbtn'], ['Search · Timers · Split · Help', 'Search the whole pack, your own timers, NOW + map side by side (landscape), this help.', '.tools'],
      ['Settings', 'Text size, theme (auto / dark / night / light), dimmer, screen on, sound, swipe, auto-tick by GPS, self-test.', '#set-btn']],
    now: [['Next action', 'The next thing due, with its countdown. Calls, fuel check and IFBP broadcast have a Done button.', '#nextaction'], ['Status strip', 'Phase and level, FIR, comms (tap for the big frequency board), CPDLC, SLOP, IFBP, GPS cross-check, day/night.', '#nowstrip'],
      ['Up next', 'Everything coming: calls, waypoints, FIR entries, level changes, ETOPS, timers, ground and arrival items.', '#upnext'], ['Cards', 'Fuel check, IFBP, ETOPS, step climb, TOD, 1-hour airports, ETA, MORA, timers and pinned items.', '#nowcards'],
      ['Timeline', 'The whole flight: FIRs, ETOPS (amber), calls (dots), events (ticks) and now (magenta).', '#timeline']],
    waypoints: [['Cards or table', 'Cards: one card per leg, the next one open with its frequencies in large type; the ring on the left = passed. Table: the full comms table. The choice is remembered.', '#wpt-view'],
      ['Tap a row', 'Tick a waypoint when you pass it; tap a ticked row to step back. Auto-tick by GPS can do it for you (Settings).', '#wpt'], ['Comms column', 'VHF in order of use, HF with the day/night set highlighted, CPDLC, call deadlines with Done. Tap a frequency for the big board.', '#wpt thead'],
      ['Colours', 'Magenta = next, green = passed, amber DUE = planned time passed, MORA amber > 5000 ft, red > 10000 ft.', '.wptbar']],
    'route-map': [['Globe', 'Drag to turn, pinch or double-tap to zoom, tap a symbol for details; tap a band (SLOP, CPDLC, IFBP) to open, tap again to close.', '#globe'], ['Layers', 'Chips below the map switch layers: night shadow, terrain, NOTAM / conflict areas, escape airports and more.', '.glay'],
      ['Side view', 'MORA and planned levels with the moving aircraft; RETURN / AHEAD show the nearest 1-hour airports.', '.gprof'], ['LIVE / slider', 'LIVE follows the time; drag the slider to preview any time of the flight.', '.gbar']],
    _pack: [['Press and hold', 'Press and hold a paragraph to highlight it or pin it to NOW.', 'main'], ['Swipe', 'Swipe left / right to go to the next / previous page (switch off in Settings).', 'main'], ['Pictures', 'Tap a chart for the full-screen viewer (pinch, double-tap, Fit).', 'main']],
    cockpit: [['Split cockpit view', 'NOW on the left, map and side view on the right. Tap NOW or any page to leave; available in landscape.', '#b-split']],
    wxnotam: [['Airfield tiles', 'One tile per airfield: weather colour from the TAF at your time there (OK / CHECK / POOR, simple decode) and the active NOTAMs (red = runway / ILS / GPS, amber = taxiways / navaids / lights). Tap a tile to jump to that airfield.', '.wtiles'],
      ['NOTAM badges', 'NEW = started within 7 days of the flight (or new since the last OFP of DXB), SHORT = valid 72 h or less, CRITICAL / IMPORTANT from key words, NOT AT YOUR TIME = outside your window there.', '.wnl'],
      ['Pin · read', 'Pin keeps a NOTAM at the top; the tick greys it out as read. Both stay on this iPad for this flight. Filters: airfield group, important only, active at my time, sort.', '.wnf']],
    regs: [['Search', 'Country name, ICAO prefix (OO, VABF, OMDB), region or chapter number. The countries of this flight come first.', '#rg-q'],
      ['Country card', 'In short = summary (Claude\'s, from the Lido text) or key sentences picked by rule; below it every section of the Lido chapter, tap to open. The Lido text is the authority.', '.rglist']],
    _refs: [['Dotted references', 'Dotted blue references (CRAR 3.139, RSI 2.7.5.8, AOI 3.3, OM-A 8.5, CC54 ...) open a card: document, chapter and page, the text captured in this flight file, and buttons to open DocuNet / the charts app.', '.refl']],
    _ato: [['Time over a waypoint', 'In WAYPOINTS tap a row when you pass it, or tap "time" to type the actual time over (HHMM). Every later time is then revised by the delay or advance: the table shows "rev", the map shows the revised Z times, ETA and the Up-next list follow.', '.atob']]
  };
  var COLORS = '<div class="hcol"><span><i style="background:var(--mag)"></i>next / active</span><span><i style="background:var(--grn)"></i>done</span><span><i style="background:var(--amb)"></i>due / caution</span><span><i style="background:var(--red)"></i>overdue / warning</span><span><i style="background:var(--cyan)"></i>interactive · GPS · IFBP</span><span><i style="background:#8f7cf0"></i>CPDLC</span></div>';
  function helpHtml() {
    var v = A.cur(), list = (HELP[v] || []).concat(v === 'cockpit' ? HELP.now : []).concat(['now', 'waypoints', 'route-map', 'cockpit', 'flights', 'wxnotam', 'regs'].indexOf(v) < 0 ? HELP._pack.concat(HELP._refs) : []).concat(v === 'waypoints' ? HELP._ato : []);
    var row = function (x) { return '<li><b>' + esc(x[0]) + '</b><span>' + esc(x[1]) + '</span>' + (x[2] && x[2] !== 'main' ? '<button type="button" data-act="x-show" data-sel="' + esc(x[2]) + '">Show</button>' : '') + '</li>'; };
    return '<h3 class="shh">This page – ' + esc(A.name[v] || (v === 'cockpit' ? 'SPLIT' : v)) + '</h3><ul class="hlp">' + list.map(row).join('') + '</ul><h3 class="shh">Header</h3><ul class="hlp">' + HELP._top.map(row).join('') + '</ul><h3 class="shh">Colours</h3>' + COLORS +
      '<p class="note">Preparation aid only – the OFP, official Emirates documentation and ATC prevail.</p>';
  }
  on('b-help', 'click', function () { openSheet('help', 'Help', helpHtml); });
  function showSel(sel) { closeSheet(); var el = document.querySelector(sel); if (!el) return; if (el.closest('.top')) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); } else flash(el); }

  /* ---------- swipe between pages */
  var SW = null;
  document.addEventListener('touchstart', function (e) {
    if (!P.swipe || document.body.classList.contains('split') || sheet || e.touches.length !== 1) { SW = null; return; }
    var t = e.target;
    if (t.closest('.gwrap, .gprof, .gbar, .glay, .tw, input, textarea, select, .tabs, .viewer, .fboard, .lpmenu, .top, .sheet, .timeline, [data-noswipe]')) { SW = null; return; }
    var p = e.touches[0]; SW = { x: p.clientX, y: p.clientY, t: Date.now() };
  }, { passive: true });
  document.addEventListener('touchend', function (e) {
    if (!SW) return; var p = e.changedTouches[0], dx = p.clientX - SW.x, dy = p.clientY - SW.y, dt = Date.now() - SW.t; SW = null;
    if (dt > 700 || Math.abs(dx) < 80 || Math.abs(dy) > 50 || Math.abs(dx) < Math.abs(dy) * 2) return;
    var i = A.seq.indexOf(A.cur()); if (i < 0) return; var n = A.seq[i + (dx < 0 ? 1 : -1)]; if (!n) return;
    A.toast((dx < 0 ? '' : '◀ ') + (A.name[n] || n) + (dx < 0 ? ' ▶' : ''));
    location.hash = n;
  }, { passive: true });

  /* ---------- auto-tick by GPS */
  var lastAT = 0;
  function onFix(f) {
    if (!P.atick || Date.now() - lastAT < 8000) return; lastAT = Date.now();
    var g = G(); if (!g) return; var q = g.along(f), kt = f.spd != null && !isNaN(f.spd) ? f.spd * 1.94384 : null;
    if (kt !== null ? kt < 100 : A.isPlan()) return;            // not flying (or no speed and no T/O set)
    if (Math.abs(q.xt) > 30) return;                            // too far off the planned route
    var top = -1;
    D.rows.forEach(function (r, i) { if (i <= S.passed) return; var d = g.alongOf(r.wpt); if (d != null && q.d >= d + 1) top = i; });
    if (top < 0) return;
    var prev = { p: S.passed, t: JSON.stringify(S.times) }, gs = q.gs && q.gs.v > 60 ? q.gs.v : 480, names = [];
    for (var i = S.passed + 1; i <= top; i++) { var d0 = g.alongOf(D.rows[i].wpt); S.times[i] = new Date(Date.now() - (d0 != null ? Math.max(0, q.d - d0) / gs * 3600000 : 0)).toISOString(); names.push(D.rows[i].wpt); }
    S.passed = top; A.save(); A.paintWpt(); A.tick(true);
    A.toast('GPS: passed ' + names.slice(-3).join(', ') + ' – ticked ' + A.isoZ(S.times[top]) + '.', function () { S.passed = prev.p; S.times = JSON.parse(prev.t); A.save(); A.paintWpt(); A.tick(true); });
  }

  /* ---------- settings: dimmer, swipe, auto-tick, charts page, self-test */
  function applyDim() { var d = $('dimmer'), v = +P.dim || 0; if (d) { d.hidden = !v; d.style.opacity = v / 100; } if ($('dim')) $('dim').value = v; if ($('dim-v')) $('dim-v').textContent = v + '%'; }
  on('dim', 'input', function () { P.dim = +this.value; A.savePrefs(); applyDim(); });
  function applyNav() { if ($('swipe')) $('swipe').textContent = 'Swipe pages: ' + (P.swipe ? 'on' : 'off'); if ($('atick')) $('atick').textContent = 'Auto-tick by GPS: ' + (P.atick ? 'on' : 'off'); }
  on('swipe', 'click', function () { P.swipe = !P.swipe; A.savePrefs(); applyNav(); });
  on('atick', 'click', function () {
    P.atick = !P.atick; A.savePrefs(); applyNav();
    if (P.atick) { var g = G(); if (g) g.gps(true); A.toast(navigator.geolocation ? 'Auto-tick on: waypoints tick themselves 1 NM after you pass them (GPS, within 30 NM of the route). Undo is always offered.' : 'Auto-tick on, but this device has no location service.'); }
  });
  /* design option (v1.4 choice): cockpit (default) | glass | avionics | paper */
  var SKINS = { pro: 'Professional', deck: 'Flight Deck', ops: 'Ops Desk', avionics: 'Avionics', cockpit: 'Cockpit', glass: 'Glass', paper: 'Briefing' };
  function applySkin() { var k = SKINS[P.skin] ? P.skin : (SKINS[window.FP_DEFAULT_SKIN] ? window.FP_DEFAULT_SKIN : 'pro'); /* Professional = default style (user 09 NOV 26; Avionics was the 05 NOV default) */ if (k === 'cockpit') document.documentElement.removeAttribute('data-skin'); else document.documentElement.setAttribute('data-skin', k); var b = $('skin-b'); if (b) b.textContent = 'Style: ' + SKINS[k]; }
  var sgD = document.querySelector('#settings .sg:nth-child(2)'); if (sgD) sgD.insertAdjacentHTML('beforeend', '<button type="button" id="skin-b"></button>');
  on('skin-b', 'click', function () { var ks = Object.keys(SKINS), i = ks.indexOf(SKINS[P.skin] ? P.skin : (SKINS[window.FP_DEFAULT_SKIN] ? window.FP_DEFAULT_SKIN : 'pro')); P.skin = ks[(i + 1) % ks.length]; A.savePrefs(); applySkin(); A.applyTheme(); });
  applySkin();
  applyDim(); applyNav(); applyHl();

  /* ---------- tools menu (weather, NOTAMs, calculators, references) lives in fp_tools2.js */
  var T2 = window.FPTools2 ? window.FPTools2(X) : null;

  /* ---------- delegated actions */
  function act(b, ev) {
    var a = b.dataset.act; if (a.indexOf('x-') !== 0) { if (T2 && T2.act) T2.act(b, ev); return; }
    ev.preventDefault();
    if (a === 'x-timers') openTimers();
    else if (a === 'x-covcopy') {   // v3.6: the not-covered list of the coverage block
      var ct = document.getElementById('cov-txt'), cx = ct ? ct.value : '';
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(cx).then(function () { A.toast('Copied – paste it to Claude.'); }, function () { if (ct) { ct.focus(); ct.select(); } A.toast('Select the text and copy it.'); });
      else { if (ct) { ct.focus(); ct.select(); } A.toast('Select the text and copy it.'); }
    }
    else if (a === 'x-refcopy') { var tx = b.dataset.t; if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(tx).then(function () { A.toast('Copied: ' + tx); }, function () { A.toast(tx); }); else A.toast(tx); }
    else if (a === 'x-tmp') { var p = PRESET[+b.dataset.i]; addTimer(p[0], p[1], p[2]); rerender(); }
    else if (a === 'x-tmadd') {
      var n = $('tm-n').value.trim(), m = parseInt($('tm-m').value, 10), at = $('tm-at').value.trim(), r = $('tm-r').checked;
      if (at) { var ae = eUtc(at); if (ae == null) { A.toast('Time as HHMM, e.g. 2130.'); return; } addTimer(n || 'At ' + at + 'Z', 0, false, ae); }
      else if (m > 0 && m <= 720) addTimer(n || m + '-min timer', m, r); else { A.toast('Enter minutes (1–720) or a UTC time.'); return; }
      rerender();
    }
    else if (a === 'x-tm5') { var t = tById(b.dataset.id); if (t) { t.end += 300000; A.save(); A.tick(true); rerender(); } }
    else if (a === 'x-tmdel') { var id = b.dataset.id, prev = JSON.stringify(S.timers); S.timers = S.timers.filter(function (x) { return x.id !== id; }); A.save(); A.tick(true); rerender(); A.toast('Timer stopped.', function () { S.timers = JSON.parse(prev); A.save(); A.tick(true); }); }
    else if (a === 'x-aoi') { var ic = b.dataset.icao; openSheet('aoi', ic + ' – Lido AOI / CCI', function () { return aptFacts(ic); }, { wide: true }); }
    else if (a === 'x-div') openDivert('apt');
    else if (a === 'x-fcstop') { A.fcStop(); rerender(); }
    else if (a === 'x-dtab') { divTab = b.dataset.t; if (sheet && sheet.kind === 'divert') rerender(); else openDivert(divTab); }
    else if (a === 'x-afc') {   // v3.5: the Lido airport facility chart of a stored pack, shown in the card when asked for
      var card = b.closest('.dvb'), box = card && card.querySelector('.dvafc[data-code="' + b.dataset.code + '"]');
      if (box) { box.remove(); return; }
      var src = window.FPLib && window.FPLib.img ? window.FPLib.img(b.dataset.icao, b.dataset.code) : '';
      box = document.createElement('div'); box.className = 'dvafc'; box.setAttribute('data-code', b.dataset.code);
      box.innerHTML = src ? '<small>' + esc(b.dataset.t || '') + ' – Lido AFC from the airport pack; pinch to zoom</small><div class="dvafs"><img class="agx" src="' + src + '" alt="' + esc(b.dataset.icao) + ' AFC"></div>' : '<p class="note">The chart picture is not stored on this iPad.</p>';
      if (card) card.appendChild(box);
    }
    else if (a === 'x-map') { var icao = b.dataset.icao; closeSheet(); if (A.cur() !== 'cockpit' && A.cur() !== 'route-map') location.hash = 'route-map'; setTimeout(function () { var g = G(); if (g) g.focusApt(icao); }, 250); }
    else if (a === 'x-sgo') searchGo(+b.dataset.i);
    else if (a === 'x-show') showSel(b.dataset.sel);
    else if (a === 'x-unpin') { var k = +b.dataset.i, pp = S.pins[k]; S.pins.splice(k, 1); A.save(); A.tick(true); A.toast('Unpinned.', function () { S.pins.splice(k, 0, pp); A.save(); A.tick(true); }); }
    else if (a === 'x-ret') { if (window.FPOpenFlight && window.FPReturn) window.FPOpenFlight(window.FPReturn.id); }
    else if (a === 'x-pgo') { var q = S.pins[+b.dataset.i]; if (q) goBlock(q.v, q.i); }
    else if (T2 && T2.act) T2.act(b, ev);
  }

  /* ---------- per second / per page */
  /* flight progress line (header bottom edge) + phase chip */
  var PG = $('prog');
  if (PG) { (D.firseq || D.firs).forEach(function (f) { if (f.eet_min > 0 && f.eet_min < T) PG.insertAdjacentHTML('beforeend', '<b style="left:' + (f.eet_min / T * 100).toFixed(2) + '%"></b>'); });
    if (EI) PG.insertAdjacentHTML('beforeend', '<b class="et" style="left:' + (EI.entry.eet_min / T * 100).toFixed(2) + '%;width:' + ((EI.exit.eet_min - EI.entry.eet_min) / T * 100).toFixed(2) + '%"></b>'); }
  var TOC = LV.length ? LV[0].eet_min : 20;
  function phase(e) { var td = tod(); if (e < 0) return ['gnd', 'PRE-FLIGHT']; if (e < TOC) return ['climb', 'CLIMB']; if (td > 0 && e >= td && e < T) return ['desc', 'DESCENT']; if (e >= T) return ['land', 'LANDED']; var f = flAt(e); return ['cruise', 'CRUISE' + (f ? ' FL' + f : '')]; }
  function tick(e) {
    var pr = Math.max(0, Math.min(1, e / T)); document.documentElement.style.setProperty('--prog', pr.toFixed(4));
    var pt = $('prog-t'); if (pt) pt.textContent = e < 0 ? '' : (e >= T ? 'LANDED' : Math.round(pr * 100) + ' % · ' + hm(T - e) + ' TO GO');
    var ph = $('phase'); if (ph) { var q = phase(e); ph.hidden = false; ph.className = 'phase ph-' + q[0]; ph.textContent = q[1] + (A.isPlan() ? ' · PLAN' : ''); }
    var s = $('tm-soon');
    if (s) { var ts = S.timers.slice().sort(function (a, b) { return a.end - b.end; })[0], l = ts ? tLeft(ts) : null; s.textContent = ts ? (l > 0 ? A.mmss(l) : 'DUE') : ''; s.parentNode.classList.toggle('due', !!ts && l <= 120); }
    if (sheet && sheet.tick) sheet.tick(e);
    paintTmx();
    if (T2 && T2.tick) T2.tick(e);
  }
  function shown(h) { if (MENU) MENU.hidden = true; if (T2 && T2.shown) T2.shown(h); }
  X.act = act; X.timers = function () { return S.timers; };
  return { items: items, alerts: tmAlerts, leftTxt: leftTxt, timerDone: timerDone, act: act, cards: cards, tick: tick, shown: shown, onFix: onFix, X: X, wxnt: function () { if (T2 && T2.wxnt) T2.wxnt(); }, wn: T2 && T2.wn };
};
