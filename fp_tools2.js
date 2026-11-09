/* fp_tools2.js v1.3 (05 NOV 26) - Flight Prep tools menu: TAF timeline at ETA, NOTAMs at ETA, optional online weather,
   calculators (wind component, cold temperature, holding, units), ETOPS details, contacts / SATCOM, MEL items, ground times,
   abbreviations, self-test and the charts-page switch. Data: the flight file (OFP / pack); formulas and ICAO values are named. */
window.FPAbbr = [['ACAS', 'Airborne collision avoidance system (TCAS)'], ['ADS-B / ADS-C', 'Automatic dependent surveillance – broadcast / contract'], ['AFN', 'ATS facilities notification (CPDLC logon)'], ['AGC', 'Airport ground chart'],
  ['ALTN', 'Alternate aerodrome'], ['AOI', 'Airport operational information (Lido)'], ['ATIS', 'Automatic terminal information service'], ['BECMG', 'Becoming (TAF change group)'], ['CAVOK', 'Visibility ≥ 10 km, no cloud below 5000 ft or MSA, no CB/TCU, no significant weather'],
  ['CCI', 'Company / crew critical information page (pack)'], ['CDL', 'Configuration deviation list'], ['CONT', 'Contingency fuel'], ['CPDLC', 'Controller–pilot data link communications'], ['CRAR', 'Country rules and regulations (Lido)'],
  ['CTOT', 'Calculated take-off time'], ['DCT', 'Direct'], ['DP', 'Decision / decompression point (pack: point before which you return, after which you continue)'], ['EAT', 'Expected approach time'], ['EET', 'Estimated elapsed time (from take-off)'],
  ['EOBT', 'Estimated off-block time'], ['ETOPS', 'Extended operations (twin-engine, beyond the threshold time from an adequate airport)'], ['ETP', 'Equal time point'], ['FIR / UIR', 'Flight / upper information region'], ['FL', 'Flight level'],
  ['FCTM', 'Flight crew training manual'], ['GNSS', 'Global navigation satellite system (GPS etc.)'], ['GRF / RWYCC', 'Global reporting format / runway condition code 0–6'], ['HF', 'High frequency (3–30 MHz)'], ['HJ / HN', 'Sunrise to sunset / sunset to sunrise'],
  ['IFBP', 'IATA in-flight broadcast procedure (126.9 MHz in the AFI area)'], ['ISA', 'International standard atmosphere'], ['LRC', 'Long-range cruise'], ['MEL', 'Minimum equipment list'], ['METAR', 'Routine aerodrome weather report'],
  ['MORA', 'Minimum off-route altitude (Lido grid / route MORA)'], ['MSA', 'Minimum sector altitude'], ['NOTAM', 'Notice to airmen'], ['NNC', 'Non-normal checklist'], ['NSC / NSW', 'No significant cloud / no significant weather'],
  ['OEI', 'One engine inoperative'], ['OFP', 'Operational flight plan'], ['OM-A / OM-C', 'Operations manual part A (general) / part C (route and aerodrome)'], ['PDC', 'Pre-departure clearance'], ['PROB30/40', 'Probability 30 / 40 % (TAF)'],
  ['QFE / QNH', 'Pressure at aerodrome level / reduced to mean sea level'], ['QRH', 'Quick reference handbook'], ['RAIG', 'Route and airport information guide (company)'], ['RCF', 'Radio communication failure'], ['RNP', 'Required navigation performance'],
  ['RSI', 'Regional supplementary information (Lido)'], ['RVSM', 'Reduced vertical separation minimum (FL290–FL410)'], ['SATCOM', 'Satellite communications (Inmarsat short codes)'], ['SELCAL', 'Selective calling (HF)'], ['SIGMET / SIGWX', 'Significant meteorological information / significant weather chart'],
  ['SLOP', 'Strategic lateral offset procedure (1 or 2 NM right)'], ['TAF', 'Terminal aerodrome forecast'], ['TEMPO', 'Temporary fluctuations (< 1 h each, < half the period)'], ['TIBA', 'Traffic information broadcast by aircraft'], ['TOC / TOD', 'Top of climb / top of descent'],
  ['UFN / PERM', 'Until further notice / permanent'], ['UPR', 'User preferred route'], ['VHF', 'Very high frequency (aviation 118–137 MHz)'], ['VOLMET', 'Meteorological broadcast for aircraft in flight'], ['XWC', 'Crosswind component']];

window.FPTools2 = function (X) {
  'use strict';
  var A = X.A, D = A.D, S = A.S, P = A.P, F = D.flight, T = F.trip, esc = A.esc, hm = A.hm, $ = X.$, pad = X.pad;
  var MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  var D0 = D.date ? Date.UTC(+D.date.slice(0, 4), +D.date.slice(5, 7) - 1, +D.date.slice(8, 10)) : null;
  function absTxt(m) { if (D0 == null || m == null) return ''; var d = new Date(D0 + m * 60000); return pad(d.getUTCDate()) + ' ' + MON[d.getUTCMonth()] + ' ' + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + 'Z'; }
  function hz(m) { m = ((Math.round(m) % 1440) + 1440) % 1440; return pad(Math.floor(m / 60)) + pad(m % 60) + 'Z'; }
  function etaAbs() { return A.toMin() + (A.rev ? A.rev(T) : T); }   // v3: revised ETA
  function altMin(icao) { var a = (D.alts || []).filter(function (x) { return x.icao === icao; })[0]; return a ? a.min : null; }
  function wxOf(icao) { return (D.wx || []).filter(function (w) { return w.icao === icao; })[0]; }
  /* the time window that matters for each airport (minutes from 00Z of the flight date) */
  function focus(w) {
    var to = A.toMin(), eta = etaAbs();
    if (w.role === 'DEP') return { a: to - 60, b: to + 120, at: to, lab: 'T/O ' + hz(to) };
    if (w.role === 'DEST') return { a: eta - 120, b: eta + 180, at: eta, lab: 'ETA ' + hz(eta) };
    if (w.role === 'ALTN') { var m = altMin(w.icao), x = eta + (m || 30); return { a: x - 120, b: x + 120, at: x, lab: 'ETA via DEST ' + hz(x) + (m ? '' : ' (≈)') }; }
    if (w.role === 'ETOPS') { var wp = ((D.etops_info || {}).weather_permissible || []).filter(function (q) { return q.icao === w.icao; })[0]; if (wp) { var s = wp.window_utc.split('-'), sa = +s[0].slice(0, 2) * 60 + +s[0].slice(2), sb = +s[1].slice(0, 2) * 60 + +s[1].slice(2); if (sa < to - 180) sa += 1440; if (sb < sa) sb += 1440; return { a: sa - 60, b: sb + 60, at: sa, at2: sb, lab: 'ETOPS window ' + s[0] + '–' + s[1] + 'Z' }; } }
    var ch = D.chain.filter(function (c) { return c.icao === w.icao; })[0];
    if (ch) return { a: to + ch.a - 30, b: to + ch.b + 30, at: to + ch.a, at2: to + ch.b, lab: '1-h window ' + hm(ch.a) + '–' + hm(ch.b) };
    return { a: to, b: eta, at: null, lab: '' };
  }
  /* very simple TAF decode for colour only: visibility, ceiling, weather, wind */
  function comp(x, base) {
    var c = Object.assign({ wind: null, vis: null, wx: [], cld: [] }, base || {}), tk = (x || '').split(/\s+/), hasW = false, hasC = false;
    tk.forEach(function (t) {
      if (/^(VRB|\d{3})\d{2,3}(G\d{2,3})?(KT|MPS)$/.test(t)) c.wind = t;
      else if (t === 'CAVOK') { c.vis = 9999; c.wx = []; c.cld = []; hasW = hasC = true; }
      else if (/^\d{4}$/.test(t)) c.vis = +t;
      else if (t === 'NSW') { c.wx = []; hasW = true; }
      else if (/^(NSC|SKC|NCD|CLR)$/.test(t)) { c.cld = []; hasC = true; }
      else if (/^(FEW|SCT|BKN|OVC|VV)(\d{3}|\/\/\/)(CB|TCU)?$/.test(t)) { if (!hasC) { c.cld = []; hasC = true; } c.cld.push(t); }
      else if (/^(\+|-|VC)?(TS|SH|FZ|MI|BC|DR|BL|PR)?(RA|DZ|SN|SG|PL|GR|GS|BR|FG|HZ|DU|SA|FU|VA|SQ|FC|SS|DS|PO|UP)*$/.test(t) && /[A-Z]{2}/.test(t) && t !== 'TEMPO' && t !== 'BECMG') { if (!hasW) { c.wx = []; hasW = true; } c.wx.push(t); }
    });
    return c;
  }
  function sev(c) {
    var s = 0, w = c.wx.join(' '), m;
    if (/TS|FC|SS|DS|\+RA|FG|VA|GR|SQ/.test(w)) s = 2; else if (/BR|HZ|DU|SA|RA|DZ|SH|FU|BL/.test(w)) s = 1;
    if (c.vis != null) s = Math.max(s, c.vis < 1500 ? 2 : (c.vis < 5000 ? 1 : 0));
    c.cld.forEach(function (k) { var q = /^(BKN|OVC|VV)(\d{3})/.exec(k); if (q) { var h = +q[2] * 100; s = Math.max(s, h < 500 ? 2 : (h < 1500 ? 1 : 0)); } if (/CB|TCU/.test(k)) s = Math.max(s, 1); });
    if (c.wind && (m = /(\d{2,3})(G(\d{2,3}))?KT$/.exec(c.wind))) s = Math.max(s, (+m[1] >= 25 || (m[3] && +m[3] >= 35)) ? 1 : 0);
    return s;
  }
  var SC = ['var(--grn)', 'var(--amb)', 'var(--red)'];
  function tafSvg(w, fo) {
    var a = Math.max(fo.a, w.va), b = Math.min(fo.b, w.vb); if (!(b > a)) return '<p class="note">TAF does not cover ' + esc(fo.lab) + '.</p>';
    var W = 1000, x = function (m) { return 60 + (W - 70) * (Math.max(a, Math.min(b, m)) - a) / (b - a); }, s = '<svg viewBox="0 0 ' + W + ' 78" class="tafs" role="img" aria-label="TAF timeline ' + esc(w.icao) + '">';
    for (var h = Math.ceil(a / 60) * 60; h <= b; h += 60) s += '<line x1="' + x(h) + '" y1="8" x2="' + x(h) + '" y2="62" class="pg"/><text x="' + x(h) + '" y="74" class="ptx c">' + hz(h).slice(0, 2) + '</text>';
    s += '<text x="4" y="27" class="ptx m">TREND</text><text x="4" y="51" class="ptx m">TEMPO</text>';
    var cur = comp(w.groups[0].x), segs = [{ a: w.va, c: cur }];
    w.groups.slice(1).forEach(function (g) {
      if (g.t === 'BECMG') { var nc = comp(g.x, cur); segs.push({ a: g.a, c: cur, tr: true, to: nc }); segs.push({ a: g.b, c: nc }); cur = nc; }
      else if (g.t === 'FM') { var fc = comp(g.x); segs.push({ a: g.a, c: fc }); cur = fc; }
    });
    segs.forEach(function (sg, i) { var e2 = i + 1 < segs.length ? segs[i + 1].a : w.vb; if (e2 <= a || sg.a >= b) return; var x1 = x(sg.a), x2 = x(e2);
      s += sg.tr ? '<rect x="' + x1 + '" y="16" width="' + Math.max(1, x2 - x1) + '" height="16" fill="' + SC[sev(sg.to)] + '" opacity=".45"/><rect x="' + x1 + '" y="16" width="' + Math.max(1, x2 - x1) + '" height="16" fill="url(#hatch)"/>' : '<rect x="' + x1 + '" y="16" width="' + Math.max(1, x2 - x1) + '" height="16" fill="' + SC[sev(sg.c)] + '" opacity=".75"/>'; });
    w.groups.filter(function (g) { return /TEMPO|PROB/.test(g.t); }).forEach(function (g) { if (g.b <= a || g.a >= b) return; var x1 = x(g.a), x2 = x(g.b);
      s += '<rect x="' + x1 + '" y="40" width="' + Math.max(1, x2 - x1) + '" height="16" rx="3" fill="' + SC[sev(comp(g.x))] + '" opacity="' + (/PROB30/.test(g.t) ? '.45' : '.7') + '"/><text x="' + (x1 + 4) + '" y="52" class="ptx">' + esc(g.t) + '</text>'; });
    [fo.at, fo.at2].forEach(function (m) { if (m != null && m >= a && m <= b) s += '<line x1="' + x(m) + '" y1="4" x2="' + x(m) + '" y2="64" class="pnow"/>'; });
    return s + '<defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="var(--fg)" stroke-width="1.2" opacity=".35"/></pattern></defs></svg>';
  }
  function atTxt(w, m) {
    if (m == null) return ''; var cur = w.groups[0], tmp = [];
    w.groups.slice(1).forEach(function (g) { if ((g.t === 'BECMG' && g.b <= m) || (g.t === 'FM' && g.a <= m)) cur = g; if (/TEMPO|PROB/.test(g.t) && g.a <= m && g.b > m) tmp.push(g); if (g.t === 'BECMG' && g.a <= m && g.b > m) tmp.push(g); });
    return '<p class="tafat"><b>At ' + hz(m) + ':</b> ' + esc(cur.t === 'BASE' ? w.groups[0].x : cur.t + ' ' + cur.x) + (tmp.length ? ' · <b>' + tmp.map(function (g) { return esc(g.t + ' ' + g.x); }).join(' · ') + '</b>' : '') + '</p>';
  }
  X.wx = { focus: focus, comp: comp, sev: sev, tafSvg: tafSvg, atTxt: atTxt, absTxt: absTxt, hz: hz, etaAbs: etaAbs, altMin: altMin, wxOf: wxOf };   // v3: shared with fp_wxnt.js
  var WN = null; try { WN = window.FPWxNt ? window.FPWxNt(X) : null; } catch (e) { if (window.console) console.error('FPWxNt', e); }
  var wxRole = 'arr';
  function wxHtml() {
    var R = { arr: ['DEST', 'ALTN'], etops: ['ETOPS'], dep: ['DEP'], enr: ['ENR'] }[wxRole];
    var list = (D.wx || []).filter(function (w) { return R.indexOf(w.role) >= 0; });
    var s = '<div class="seg">' + [['arr', 'Destination + alternates'], ['etops', 'ETOPS'], ['dep', 'Departure'], ['enr', 'En route']].map(function (t) { return '<button type="button" data-act="wxr" data-r="' + t[0] + '" class="' + (wxRole === t[0] ? 'on' : '') + '">' + t[1] + '</button>'; }).join('') + '</div>';
    if (!list.length) return s + '<p class="note">No weather for this group in the OFP.</p>';
    s += list.map(function (w) {
      var fo = focus(w);
      return '<div class="wxc"><div class="wxh"><b>' + esc(w.icao) + '</b> ' + esc(w.name) + ' <span class="tag">' + esc(w.role) + '</span><small>' + esc(fo.lab) + '</small></div>' +
        (w.groups ? tafSvg(w, fo) + atTxt(w, fo.at) + (fo.at2 ? atTxt(w, fo.at2) : '') : '<p class="note">' + esc(w.taf || 'No TAF in the OFP.') + '</p>') +
        '<details class="dvt"><summary>Raw METAR / TAF and groups</summary>' + (w.metar ? '<code>' + esc(w.metar) + '</code>' : '') + (w.taf ? '<code>' + esc(w.taf) + '</code>' : '') +
        (w.groups ? '<ul class="tgl">' + w.groups.map(function (g) { return '<li><b>' + esc(g.t === 'BASE' ? 'BASE' : g.t) + '</b> ' + hz(g.a) + '–' + hz(g.b) + ' ' + esc(g.x) + '</li>'; }).join('') + '</ul>' : '') + '</details></div>';
    }).join('');
    return s + '<p class="note">Bars: green / amber / red from a simple decode (visibility < 5000 / 1500 m, ceiling < 1500 / 500 ft, TS, FG, wind ≥ 25 kt or gusts ≥ 35 kt). Hatched = BECMG transition. Magenta line = your time. Check the actual minima yourself. Source: OFP weather (Lido ' + esc(D.date || '') + ').</p>';
  }
  /* ---------- NOTAMs at ETA */
  var ntRole = 'DEST', ntAll = false;
  function ntWin(n) {
    if (n.role === 'DEP' || n.role === 'DEST' || n.role === 'ALTN' || n.role === 'ETOPS') { var fo = focus({ role: n.role, icao: n.icao }); var c = fo.at2 != null ? [fo.at, fo.at2] : [fo.at, fo.at]; return [c[0] - 60, c[1] + 60]; }
    var f = D.firs.filter(function (x) { return x.fir === n.fir; })[0], nx = f ? D.firs[D.firs.indexOf(f) + 1] : null; if (!f) return null;
    return [A.toMin() + f.eet_min, A.toMin() + (nx ? nx.eet_min : T)];
  }
  function act0(n) { var w = ntWin(n); if (!w) return true; return n.a <= w[1] && (n.b == null || n.b >= w[0]); }
  function ntHtml() {
    var all = ntRole === 'ENR' ? (D.rnotams || []).map(function (n) { return Object.assign({ role: 'ENR', icao: n.fir, cat: n.kind.toUpperCase() }, n); }) : (D.notams || []).filter(function (n) { return n.role === ntRole; });
    var shown = ntAll ? all : all.filter(act0);
    var s = '<div class="seg">' + [['DEP', 'Departure'], ['DEST', 'Destination'], ['ALTN', 'Alternates'], ['ETOPS', 'ETOPS'], ['ENR', 'En route']].map(function (t) { var c = (t[0] === 'ENR' ? (D.rnotams || []).map(function (n) { return Object.assign({ role: 'ENR' }, n); }) : (D.notams || []).filter(function (n) { return n.role === t[0]; })); return '<button type="button" data-act="ntr" data-r="' + t[0] + '" class="' + (ntRole === t[0] ? 'on' : '') + '">' + t[1] + ' <small>' + c.filter(act0).length + '/' + c.length + '</small></button>'; }).join('') +
      '<button type="button" data-act="nta" class="' + (ntAll ? 'on' : '') + '">' + (ntAll ? 'Showing all' : 'Active at my time only') + '</button></div>';
    if (!shown.length) return s + '<p class="note">' + (all.length ? 'None active in the window (' + all.length + ' in the OFP – tap “Active at my time only” to show all).' : 'No NOTAMs of this group in the OFP.') + '</p>';
    var w0 = shown.length ? ntWin(shown[0]) : null;
    s += (w0 && !ntAll ? '<p class="sub">Window used: ' + (ntRole === 'ENR' ? 'time in each FIR' : absTxt(w0[0]) + ' – ' + absTxt(w0[1]) + ' (your time ± 1 h)') + '</p>' : '');
    s += shown.map(function (n) {
      var on = act0(n);
      return '<details class="nt' + (on ? '' : ' off') + (n.kind === 'conflict' ? ' red' : '') + '"><summary><b>' + esc(n.icao) + '</b> ' + esc(n.id) + ' <span class="tag">' + esc(n.cat || '') + '</span><small>' + absTxt(n.a) + ' – ' + (n.b == null ? (n.bt || 'UFN') : absTxt(n.b)) + (n.est ? ' EST' : '') + (on ? '' : ' · not active then') + '</small><span class="ntx">' + esc(n.x.slice(0, 110)) + (n.x.length > 110 ? '…' : '') + '</span></summary><p>' + esc(n.x) + '</p></details>';
    }).join('');
    return s + '<p class="note">From the OFP NOTAM bulletin (' + esc(D.date || '') + '); validity as published. Company and chart NOTAMs included.</p>';
  }
  /* ---------- destination alternates (OFP) with the forecast at the time you would get there */
  function altRows() {
    return (D.alts || []).map(function (a) {
      var w = wxOf(a.icao), at = etaAbs() + (a.min || 0), cur = null, tmp = [];
      if (w && w.groups) { cur = comp(w.groups[0].x); w.groups.slice(1).forEach(function (g) { if ((g.t === 'BECMG' && g.b <= at) || g.t === 'FM' && g.a <= at) cur = g.t === 'FM' ? comp(g.x) : comp(g.x, cur); if (/TEMPO|PROB/.test(g.t) && g.a <= at && g.b > at) tmp.push(g); }); }
      var sv = cur ? Math.max(sev(cur), tmp.reduce(function (m, g) { return Math.max(m, /PROB30/.test(g.t) ? Math.min(1, sev(comp(g.x))) : sev(comp(g.x))); }, 0)) : null;
      var nts = (D.notams || []).filter(function (n) { return n.icao === a.icao && n.a <= at + 60 && (n.b == null || n.b >= at - 60); }).length;
      return { a: a, w: w, at: at, sv: sv, tmp: tmp, nts: nts };
    });
  }
  var SVN = ['OK', 'CHECK', 'POOR'];
  function altHtml() {
    var R3 = altRows(); if (!R3.length) return '<p class="note">No destination alternates in this flight file.</p>';
    return '<p class="sub">From the OFP alternate block (distance, time, fuel from ' + esc(F.arr) + '), forecast at ' + esc(F.arr) + ' ETA + diversion time.</p>' + R3.map(function (r) {
      return '<div class="wxc"><div class="wxh"><b>' + esc(r.a.icao) + '</b> RWY ' + esc(r.a.rwy || '–') + ' <span class="tag ' + (r.sv == null ? '' : ['k-fc', 'k-etops', 'k-call'][r.sv]) + '">' + (r.sv == null ? 'no TAF' : SVN[r.sv]) + '</span><small>arr ' + hz(r.at) + '</small></div>' +
        '<div class="dvn"><b>' + r.a.nm + ' NM</b> · <b>' + hm(r.a.min) + '</b> · ' + (r.a.kg / 1000).toFixed(1) + ' t' + (r.a.route ? ' · ' + esc(r.a.route) : '') + ' · ' + r.nts + ' NOTAMs active then</div>' +
        (r.w && r.w.groups ? atTxt(r.w, r.at) : '') + (X.aptFacts ? X.aptFacts(r.a.icao) : '') + (r.w ? '<details class="dvt"><summary>METAR / TAF (OFP)</summary><code>' + esc(r.w.metar || '') + '</code><code>' + esc(r.w.taf || '') + '</code></details>' : '') + '</div>';
    }).join('') + '<p class="note">OK / CHECK / POOR is the same simple decode as the TAF timeline – check against the alternate minima.</p>';
  }
  function cards(e, C, card) {
    if (!(D.alts || []).length || e < T - 150 || e > T + 20) return;
    var R3 = altRows(), f = R3[0];
    C.push(card('alt', 'Destination alternates', esc(f.a.icao) + ' ' + hm(f.a.min), f.sv === 2 ? 'red' : (f.sv === 1 ? 'amb' : ''),
      R3.map(function (r) { return '<b>' + esc(r.a.icao) + '</b> ' + r.a.nm + ' NM ' + hm(r.a.min) + ' ' + (r.a.kg / 1000).toFixed(1) + ' t' + (r.sv != null ? ' · ' + SVN[r.sv] : ''); }).join('<br>'), '<button type="button" class="cbtn" data-act="open" data-k="alt">Alternates</button>'));
  }
  /* ---------- live weather (optional, only with internet) */
  var LKEY = 'fpapp:lwx:' + F.id;
  function lwx() { try { return JSON.parse(localStorage.getItem(LKEY) || 'null'); } catch (e) { return null; } }
  function lwxIds() { return (D.wx || []).filter(function (w) { return /DEST|ALTN|ETOPS/.test(w.role); }).map(function (w) { return w.icao; }).join(','); }
  function liveHtml(msg) {
    var L = lwx();
    return '<p class="sub">Optional: when the iPad has internet (e.g. onboard Wi-Fi), fetch current METARs and TAFs for ' + esc(lwxIds()) + ' from aviationweather.gov. Without internet the app keeps working with the OFP weather.</p>' +
      '<button type="button" class="pri" data-act="lwx">Refresh online</button>' + (msg ? '<p class="msg">' + esc(msg) + '</p>' : '') +
      (L ? '<h3 class="shh">Fetched ' + esc(L.t) + '</h3><pre class="lwx">' + esc(L.txt) + '</pre>' : '<p class="note">Nothing fetched yet.</p>');
  }
  function fetchLive() {
    var url = 'https://aviationweather.gov/api/data/metar?ids=' + lwxIds() + '&format=raw&taf=true&hours=2';
    if (!navigator.onLine) { X.rerenderWith(liveHtml('No internet connection.')); return; }
    X.rerenderWith(liveHtml('Fetching…'));
    var ctl = window.AbortController ? new AbortController() : null; var to = setTimeout(function () { if (ctl) ctl.abort(); }, 15000);
    fetch(url, ctl ? { signal: ctl.signal } : {}).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); }).then(function (t) {
      clearTimeout(to); var d = new Date(); try { localStorage.setItem(LKEY, JSON.stringify({ t: pad(d.getUTCDate()) + ' ' + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + 'Z', txt: t.trim() || '(empty answer)' })); } catch (e) { }
      X.rerenderWith(liveHtml(''));
    }).catch(function (e) { clearTimeout(to); X.rerenderWith(liveHtml('Could not fetch (' + (e && e.message || 'blocked') + '). It works in the installed app when the iPad is online; this page may block it.')); });
  }
  X.rerenderWith = function (h) { var b = $('sheet-b'); if (b) b.innerHTML = h; };
  /* ---------- calculators */
  var cTab = 'wind';
  function rwys() {
    var out = [], add = function (icao, r, lab) { if (r) String(r).split(/[\/ ,]+/).forEach(function (x) { if (/^\d{2}[LCR]?$/.test(x)) out.push({ icao: icao, r: x, lab: lab }); }); };
    add(F.dep, (D.rwy || {}).dep, 'DEP'); add(F.arr, (D.rwy || {}).arr, 'DEST'); (D.alts || []).forEach(function (a) { add(a.icao, a.rwy, 'ALTN'); });
    D.geo.apt.forEach(function (a) { var r = (a.lab.split('|')[1] || '').trim(); if (r && !out.some(function (o) { return o.icao === a.icao; })) add(a.icao, r, 'EN ROUTE'); });
    return out;
  }
  function calcHtml() {
    var tabs = [['wind', 'Wind component'], ['cold', 'Cold temperature'], ['hold', 'Holding'], ['units', 'Units']];
    var s = '<div class="seg">' + tabs.map(function (t) { return '<button type="button" data-act="ct" data-t="' + t[0] + '" class="' + (cTab === t[0] ? 'on' : '') + '">' + t[1] + '</button>'; }).join('') + '</div><div class="calc" data-calc="' + cTab + '">';
    if (cTab === 'wind') {
      s += '<div class="frm"><label>Runway<select id="cw-r"><option value="">heading below</option>' + rwys().map(function (o) { return '<option value="' + (+o.r.slice(0, 2) * 10) + '">' + esc(o.icao + ' ' + o.r + ' (' + o.lab + ')') + '</option>'; }).join('') + '</select></label>' +
        '<label>RWY heading °<input id="cw-h" inputmode="numeric" maxlength="3" placeholder="300"></label><label>Wind from °<input id="cw-d" inputmode="numeric" maxlength="3" placeholder="310"></label><label>Speed kt<input id="cw-s" inputmode="numeric" maxlength="3" placeholder="16"></label><label>Gust kt<input id="cw-g" inputmode="numeric" maxlength="3" placeholder="–"></label></div>' +
        '<div id="cw-o" class="cout"></div><p class="note">Heading from the runway number (×10, magnetic, ±5°) unless you type it. Use the same reference (ATIS = magnetic; METAR / TAF = true) for wind and runway.</p>';
    } else if (cTab === 'cold') {
      s += '<div class="frm"><label>Aerodrome elevation ft<input id="cc-e" inputmode="numeric" maxlength="5" placeholder="0"></label><label>Aerodrome temperature °C<input id="cc-t" inputmode="text" maxlength="4" placeholder="-10"></label><label>Published altitude ft (optional)<input id="cc-a" inputmode="numeric" maxlength="5" placeholder="3000"></label></div>' +
        '<div id="cc-o" class="cout"></div><p class="note">Correction = height above the aerodrome × (−ΔISA) ÷ mean layer temperature (K), ΔISA = OAT − (15 − 1.98 °C/1000 ft × elevation) – the ICAO PANS-OPS (Doc 8168) method; rounded up to 10 ft. Add to the published altitude. The OM / chart cold-temperature table and its application rules prevail.</p>';
    } else if (cTab === 'hold') {
      s += '<div class="frm"><label>Inbound course °<input id="ch-c" inputmode="numeric" maxlength="3" placeholder="360"></label><label>Turns<select id="ch-t"><option value="R">Right (standard)</option><option value="L">Left</option></select></label><label>Heading to the fix °<input id="ch-h" inputmode="numeric" maxlength="3" placeholder="090"></label><label>Level FL<input id="ch-f" inputmode="numeric" maxlength="3" placeholder="140"></label></div>' +
        '<div id="ch-o" class="cout"></div><svg id="ch-s" viewBox="-120 -120 240 240" class="hsvg" aria-hidden="true"></svg><p class="note">ICAO sectors (Doc 8168): direct 180°, teardrop 70°, parallel 110°, ±5° flexibility at the boundaries. Timing 1 min at or below FL140, 1.5 min above. Max IAS (ICAO): 230 kt to FL140, 240 kt FL140–FL200, 265 kt above FL200 (turbulence 280 kt / M0.8 with ATC clearance). FAA and some States differ – check the chart / CRAR.</p>';
    } else {
      var row = function (id, a, b) { return '<div class="cvr"><label>' + a + '<input id="' + id + 'a" inputmode="decimal"></label><span>⇄</span><label>' + b + '<input id="' + id + 'b" inputmode="decimal"></label></div>'; };
      s += row('u1', 'kg', 'lb') + '<div class="cvr"><label>Fuel kg<input id="u2a" inputmode="decimal"></label><span>⇄</span><label>litres<input id="u2b" inputmode="decimal"></label><label>US gal<input id="u2c" inputmode="decimal"></label><label>SG<input id="u2s" inputmode="decimal" value="0.80"></label></div>' +
        row('u3', 'hPa', 'inHg') + row('u4', 'metres', 'feet') + row('u5', '°C', '°F') + '<div class="cvr"><label>km<input id="u6a" inputmode="decimal"></label><span>⇄</span><label>NM<input id="u6b" inputmode="decimal"></label><label>SM<input id="u6c" inputmode="decimal"></label></div>' +
        '<div class="cvr"><label>kt<input id="u7a" inputmode="decimal"></label><span>⇄</span><label>km/h<input id="u7b" inputmode="decimal"></label><label>m/s<input id="u7c" inputmode="decimal"></label></div><p class="note">Fuel volume uses the specific gravity you enter (OFP / fuel slip).</p>';
    }
    return s + '</div>';
  }
  function num(id) { var v = ($(id) || {}).value; if (v == null || String(v).trim() === '') return null; v = parseFloat(String(v).replace(',', '.')); return isNaN(v) ? null : v; }
  function calcRun(src) {
    var o;
    if (cTab === 'wind') {
      if (src && src.id === 'cw-r' && src.value) $('cw-h').value = src.value;
      var h = num('cw-h'), d = num('cw-d'), s = num('cw-s'), g = num('cw-g'); o = $('cw-o'); if (h == null || d == null || s == null) { o.innerHTML = ''; return; }
      var r = (d - h) * Math.PI / 180, hw = s * Math.cos(r), xw = s * Math.sin(r), f = function (v) { return Math.round(Math.abs(v)); };
      o.innerHTML = '<div class="big2"><span class="' + (hw < 0 ? 'r' : 'g') + '"><small>' + (hw < 0 ? 'TAILWIND' : 'HEADWIND') + '</small><b>' + f(hw) + ' kt</b></span><span><small>CROSSWIND</small><b>' + f(xw) + ' kt ' + (xw > 0.5 ? 'from right' : (xw < -0.5 ? 'from left' : '')) + '</b></span>' +
        (g != null ? '<span><small>GUST</small><b>' + f(g * Math.cos(r)) + ' / ' + f(g * Math.sin(r)) + ' kt</b></span>' : '') + '</div><p class="note">Angle ' + Math.round(((d - h) % 360 + 540) % 360 - 180) + '° off the runway.</p>';
    } else if (cTab === 'cold') {
      var el = num('cc-e') || 0, t = num('cc-t'), pa = num('cc-a'); o = $('cc-o'); if (t == null) { o.innerHTML = ''; return; }
      var dI = t - (15 - 0.0019812 * el); if (dI >= 0) { o.innerHTML = '<p>Temperature is at or above ISA (ΔISA +' + dI.toFixed(1) + ' °C) – no cold-temperature correction.</p>'; return; }
      var corr = function (h) { return Math.ceil(h * (-dI) / (273.15 + t - 0.5 * 0.0019812 * h) / 10) * 10; };
      var hs = [200, 300, 400, 500, 1000, 1500, 2000, 3000, 4000, 5000];
      o.innerHTML = (pa != null && pa > el ? '<div class="big2"><span class="r"><small>' + Math.round(pa) + ' ft → FLY</small><b>' + (Math.round(pa) + corr(pa - el)) + ' ft</b></span><span><small>CORRECTION</small><b>+' + corr(pa - el) + ' ft</b></span></div>' : '') +
        '<p class="note">ΔISA ' + dI.toFixed(1) + ' °C</p><table class="ctab"><thead><tr><th>Height above aerodrome ft</th>' + hs.map(function (h) { return '<th>' + h + '</th>'; }).join('') + '</tr></thead><tbody><tr><td>Add ft</td>' + hs.map(function (h) { return '<td>' + corr(h) + '</td>'; }).join('') + '</tr></tbody></table>';
    } else if (cTab === 'hold') {
      var c = num('ch-c'), hd = num('ch-h'), fl = num('ch-f'), rt = ($('ch-t') || {}).value !== 'L'; o = $('ch-o'); if (c == null || hd == null) { o.innerHTML = ''; $('ch-s').innerHTML = ''; return; }
      var dd = ((hd - c) % 360 + 360) % 360; if (!rt) dd = (360 - dd) % 360;
      var en = (dd <= 110 || dd >= 290) ? 'DIRECT' : (dd < 180 ? 'TEARDROP' : 'PARALLEL'), near = [110, 180, 290].some(function (b) { return Math.abs(dd - b) <= 5; });
      var ob = (c + 180) % 360, td = (ob + (rt ? -30 : 30) + 360) % 360;
      var tm = fl == null ? '1 min at or below FL140 / 1.5 min above' : (fl <= 140 ? '1 min' : '1.5 min'), sp = fl == null ? '' : (fl <= 140 ? '230 kt' : (fl <= 200 ? '240 kt' : '265 kt'));
      o.innerHTML = '<div class="big2"><span class="g"><small>ENTRY</small><b>' + en + '</b></span><span><small>OUTBOUND</small><b>' + X.d3s(ob) + '°</b></span><span><small>LEG</small><b>' + tm + '</b></span>' + (sp ? '<span><small>MAX IAS (ICAO)</small><b>' + sp + '</b></span>' : '') + '</div>' +
        (near ? '<p class="note">Within 5° of a sector boundary – either entry is acceptable.</p>' : '') +
        '<p>' + (en === 'TEARDROP' ? 'Over the fix turn onto <b>' + X.d3s(td) + '°</b> (30° into the holding side) for the leg time, then turn ' + (rt ? 'right' : 'left') + ' to intercept the inbound course ' + X.d3s(c) + '°.' :
          en === 'PARALLEL' ? 'Over the fix turn onto the outbound heading <b>' + X.d3s(ob) + '°</b> (non-holding side) for the leg time, turn ' + (rt ? 'left' : 'right') + ' onto the holding side, back to the fix (or intercept inbound), then hold.' :
          'Over the fix turn ' + (rt ? 'right' : 'left') + ' onto the outbound heading <b>' + X.d3s(ob) + '°</b> and hold.') + '</p>';
      var rr = function (deg) { var a = (deg - c) * Math.PI / 180; return [Math.sin(a) * 100, -Math.cos(a) * 100]; }, sgn = rt ? 1 : -1;
      var sv = '<line x1="0" y1="0" x2="0" y2="110" class="hin"/><path d="M0 0 a ' + 18 + ' 18 0 0 ' + (rt ? 1 : 0) + ' ' + (36 * sgn) + ' 0 v 80 a 18 18 0 0 ' + (rt ? 1 : 0) + ' ' + (-36 * sgn) + ' 0" class="hpt"/>';
      [[110, 'p'], [180, 'p'], [290, 'p']].forEach(function (b) { var p = rr(c + 180 + sgn * (b[0] - 180) + 180); });
      var ln = function (rel) { var a = rel * Math.PI / 180; return '<line x1="0" y1="0" x2="' + (Math.sin(a) * 115).toFixed(1) + '" y2="' + (-Math.cos(a) * 115).toFixed(1) + '" class="hsec"/>'; };
      sv += ln(sgn * 110 + 180) + ln(180 + 180) + ln(sgn * 290 + 180);
      var ar = (hd - c) * Math.PI / 180; sv += '<line x1="' + (-Math.sin(ar) * 100).toFixed(1) + '" y1="' + (Math.cos(ar) * 100).toFixed(1) + '" x2="' + (-Math.sin(ar) * 14).toFixed(1) + '" y2="' + (Math.cos(ar) * 14).toFixed(1) + '" class="hac" marker-end="url(#harr)"/><circle r="4" class="hfx"/>';
      $('ch-s').innerHTML = '<defs><marker id="harr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L10 5 L0 10z" fill="var(--mag)"/></marker></defs>' + sv;
    } else {
      var id = src ? src.id : '', v = src ? num(id) : null, set = function (k, x, dp) { if ($(k) && k !== id) $(k).value = x == null || isNaN(x) ? '' : (+x.toFixed(dp == null ? 1 : dp)); };
      var sg = num('u2s') || 0.8;
      if (id === 'u1a') set('u1b', v * 2.20462, 0); if (id === 'u1b') set('u1a', v / 2.20462, 0);
      if (id === 'u2a') { set('u2b', v / sg, 0); set('u2c', v / sg / 3.78541, 0); } if (id === 'u2b') { set('u2a', v * sg, 0); set('u2c', v / 3.78541, 0); } if (id === 'u2c') { set('u2b', v * 3.78541, 0); set('u2a', v * 3.78541 * sg, 0); }
      if (id === 'u2s' && num('u2a') != null) { var k2 = num('u2a'); set('u2b', k2 / sg, 0); set('u2c', k2 / sg / 3.78541, 0); }
      if (id === 'u3a') set('u3b', v * 0.0295300, 2); if (id === 'u3b') set('u3a', v / 0.0295300, 0);
      if (id === 'u4a') set('u4b', v * 3.28084, 0); if (id === 'u4b') set('u4a', v / 3.28084, 0);
      if (id === 'u5a') set('u5b', v * 9 / 5 + 32, 0); if (id === 'u5b') set('u5a', (v - 32) * 5 / 9, 1);
      if (id === 'u6a') { set('u6b', v / 1.852, 1); set('u6c', v / 1.609344, 1); } if (id === 'u6b') { set('u6a', v * 1.852, 1); set('u6c', v * 1.852 / 1.609344, 1); } if (id === 'u6c') { set('u6a', v * 1.609344, 1); set('u6b', v * 1.609344 / 1.852, 1); }
      if (id === 'u7a') { set('u7b', v * 1.852, 0); set('u7c', v * 0.514444, 1); } if (id === 'u7b') { set('u7a', v / 1.852, 0); set('u7c', v / 3.6, 1); } if (id === 'u7c') { set('u7a', v / 0.514444, 0); set('u7b', v * 3.6, 0); }
    }
  }
  function calcAfter(b) {   // one listener pair on the sheet body, active only while a calculator is shown
    if (b._calc) return; b._calc = 1;
    b.addEventListener('input', function (e) { if (b.querySelector('.calc') && e.target.matches('.calc input, .calc select')) calcRun(e.target); });
    b.addEventListener('change', function (e) { if (b.querySelector('.calc') && e.target.matches('.calc select')) calcRun(e.target); });
  }
  /* ---------- ETOPS details */
  function etopsHtml() {
    var E = D.etops_info; if (!E) return '<p class="note">No ETOPS information in this flight file.</p>';
    var e = A.el(), row = function (p, nm) { return '<tr><td><b>' + nm + '</b></td><td>' + esc(p.airport) + '</td><td>' + hm(p.eet_min) + '</td><td>' + X.zt(p.eet_min) + '</td><td>' + (e < p.eet_min ? 'in ' + hm(Math.ceil(p.eet_min - e)) : 'passed') + '</td><td>' + esc(p.pos) + '</td></tr>'; };
    return '<p class="sub">ETOPS <b>' + E.rule_min + ' min</b> · scenario ' + esc(E.scenario || '') + '</p><div class="tw"><table class="ctab"><thead><tr><th></th><th>From / to</th><th>EET</th><th>UTC</th><th>Countdown</th><th>Position</th></tr></thead><tbody>' + row(E.entry, 'ENTRY1') + row(E.exit, 'EXIT1') + '</tbody></table></div>' +
      '<h3 class="shh">Weather-permissible airports</h3><div class="tw"><table class="ctab"><thead><tr><th>Airport</th><th>RWY</th><th>From – till</th><th>ETOPS minima</th><th>Forecast</th><th>XWC kt</th></tr></thead><tbody>' + (E.weather_permissible || []).map(function (w) { return '<tr><td><b>' + esc(w.icao) + '</b></td><td>' + esc(w.rwy || '') + '</td><td>' + esc(w.window_utc.replace('-', '–')) + 'Z</td><td>' + esc(w.minima) + '</td><td>' + esc(w.forecast) + '</td><td>' + esc(w.xwc_kt) + '</td></tr>'; }).join('') + '</tbody></table></div>' +
      '<h3 class="shh">Critical fuel</h3><div class="tw"><table class="ctab"><thead><tr><th>At</th><th>To</th><th>Time</th><th>Required t</th><th>Remaining t</th><th>Margin t</th></tr></thead><tbody>' + (E.critical_fuel || []).map(function (c) { return '<tr><td><b>' + esc(c.at) + '</b></td><td>' + esc(c.to) + '</td><td>' + esc(c.time) + '</td><td>' + c.reqd_t.toFixed(1) + '</td><td>' + c.rem_t.toFixed(1) + '</td><td class="ok">+' + (c.rem_t - c.reqd_t).toFixed(1) + '</td></tr>'; }).join('') + '</tbody></table></div>' +
      '<p class="sub">ETOPS / en-route airports in the TEM chain: ' + D.chain.filter(function (c) { return /ETOPS/i.test(c.note); }).map(function (c) { return '<b>' + esc(c.icao) + '</b> ' + esc(c.cls) + ' ' + hm(c.a) + '–' + hm(c.b) + ' (' + esc(c.note) + ')'; }).join(' · ') + '</p>' +
      '<p class="note">Source: OFP “ETOPS INFORMATION” (OFP ' + esc(D.date || '') + '). No ETP is printed in this OFP, so none is shown.</p>';
  }
  /* ---------- contacts, MEL, ground times, abbreviations */
  function contactsHtml() {
    var f = X.curFir(Math.max(0, A.el()));
    return (D.dispatch ? '<h3 class="shh">Dispatch (OFP)</h3><p class="emc">' + esc(D.dispatch.name || '') + ' · <b>' + esc(D.dispatch.tel) + '</b></p>' : '') +
      '<h3 class="shh">SATCOM short codes / phones (Lido)</h3><div class="tw"><table class="ctab"><thead><tr><th>FIR</th><th>Unit</th><th>Short code</th><th>Phone</th><th>Source</th></tr></thead><tbody>' +
      (D.satcom || []).map(function (s) { return '<tr class="' + (f && s.fir === f.fir ? 'curfir' : '') + '"><td>' + esc(s.fir) + '</td><td>' + esc(s.unit) + '</td><td><b>' + esc(s.code || '–') + '</b></td><td>' + esc(s.tel || '') + '</td><td>' + esc(s.src) + '</td></tr>'; }).join('') + '</tbody></table></div>' +
      '<p class="note">Only units listed in the Lido tables; route FIRs without an entry (e.g. Entebbe, Muscat) have no published short code there.</p>' +
      ((D.crew_alert || []).length ? '<h3 class="shh">Crew alert – company NOTAMs (OFP)</h3>' + D.crew_alert.map(function (c) { return '<details class="nt"><summary><b>' + esc(c.id) + '</b> ' + esc(c.title) + '</summary><p>' + esc(c.x) + '</p></details>'; }).join('') : '');
  }
  /* MEL: items added for this flight + the pilot parts of the B777 MEL text (D.mel, from the DocuNet capture) */
  var MDB = D.mel && D.mel.items ? D.mel.items : null, melQ = '', melOpen = '';
  function melNorm(no) { return String(no || '').toUpperCase().replace(/\s+/g, '').replace(/^MEL/, ''); }
  function melFind(no) {               // '34-58-01B' -> that variant; '34-58-01' -> all variants of the item
    no = melNorm(no); if (!MDB || !/^\d{2}-\d{2}-\d{2}/.test(no)) return null;
    var it = MDB[no.slice(0, 8)]; if (!it) return null;
    var v = no.length > 8 ? it.v.filter(function (x) { return x.id.indexOf(no) === 0; }) : it.v;
    return { no: no.slice(0, 8), t: it.t, v: v.length ? v : it.v, exact: v.length > 0 };
  }
  function melRef(t) { return esc(t).replace(/\b(\d{2}-\d{2}-\d{2}(?:-\d{2})?[A-Z]?)\b/g, function (m) { return MDB && MDB[m.slice(0, 8)] ? '<button type="button" class="mref" data-act="melv" data-no="' + m + '">' + m + '</button>' : m; }); }
  function melLines(L) { return '<ul class="mll">' + L.map(function (l) { var ind = /^[a-z]\.|^\d+\.|^[A-Z]\.(?!\w)|^NOTE/.test(l) ? (/^NOTE/.test(l) ? ' class="mn"' : (/^[a-z]\./.test(l) ? ' class="m2"' : (/^[A-Z]\./.test(l) ? ' class="m3"' : ''))) : ''; return '<li' + ind + '>' + melRef(l) + '</li>'; }).join('') + '</ul>'; }
  function melVar(v) {
    var tag = [v.iv ? 'Cat ' + v.iv : '', v.ins ? 'installed ' + v.ins : '', v.req ? 'required ' + v.req : '', v.pr].filter(Boolean).join(' · ');
    return '<div class="melv"><div class="mvh"><b>' + esc(v.id) + '</b>' + (v.h ? ' ' + esc(v.h) : '') + (tag ? '<span class="mvt">' + esc(tag) + '</span>' : '') + '</div>' +
      (v.c ? melLines(v.c) : '') +
      (v.cd ? '<h4 class="mvs cd">Crew deferral (M-CD)</h4>' + melLines(v.cd) : (/M-CD/.test(v.pr) ? '<p class="note">(M-CD) text not found in the capture – check the MEL.</p>' : '')) +
      (v.o ? '<h4 class="mvs o">Operations (O)</h4>' + melLines(v.o) : (/\(O\)/.test(v.pr) ? '<p class="note">(O) text not found in the capture – check the MEL.</p>' : '')) +
      (v.on ? '<h4 class="mvs">Operations note</h4>' + melLines(v.on) : '') +
      (v.pl && !/^As appropriate\.?$/i.test(v.pl.join(' ')) ? '<h4 class="mvs">Placard</h4>' + melLines(v.pl) : '') + '</div>';
  }
  function melText(no, open) {
    var f = melFind(no); if (!f) return MDB && /^\d{2}-\d{2}-\d{2}/.test(melNorm(no)) ? '<p class="note">' + esc(no) + ' is not in the MEL text of this file.</p>' : '';
    return '<details class="nt mlt"' + (open ? ' open' : '') + '><summary><b>MEL text</b> <small>' + esc(f.no) + ' ' + esc(f.t) + (f.exact && f.v.length === 1 ? '' : ' · ' + f.v.length + ' cases') + '</small></summary>' + f.v.map(melVar).join('') + '</details>';
  }
  var melBlob = null;
  function melHits(q) {
    q = (q || '').trim().toUpperCase(); if (!MDB || q.length < 2) return '';
    var n = melNorm(q), keys = Object.keys(MDB), A1 = [], A2 = [];
    if (!melBlob) { melBlob = {}; keys.forEach(function (k) { melBlob[k] = JSON.stringify(MDB[k].v).toUpperCase(); }); }
    keys.forEach(function (k) {
      var it = MDB[k];
      if (k.indexOf(n) === 0 || n.indexOf(k) === 0 || it.t.toUpperCase().indexOf(q) >= 0 || it.v.some(function (v) { return v.id.indexOf(n) === 0 || (v.h || '').toUpperCase().indexOf(q) >= 0; })) A1.push(k);
      else if (q.length >= 3 && melBlob[k].indexOf(q) >= 0) A2.push(k);
    });
    if (!A1.length && !A2.length) return '<p class="note">No MEL item matches “' + esc(q) + '”.</p>';
    var li = function (k) { return '<li><button type="button" data-act="melv" data-no="' + k + '"><b>' + k + '</b> ' + esc(MDB[k].t) + '</button></li>'; };
    return (A1.length ? '<ul class="mhl">' + A1.slice(0, 30).map(li).join('') + '</ul>' : '') +
      (A2.length ? '<h3 class="shh">Mentioned in the text <small>' + A2.length + ' item' + (A2.length > 1 ? 's' : '') + '</small></h3><ul class="mhl">' + A2.slice(0, 30).map(li).join('') + '</ul>' : '');
  }
  function melHtml() {
    var ofp = D.mel_ofp || [];
    return '<p class="sub">' + (ofp.length ? 'OFP MEL / CDL items: ' + ofp.map(function (n) { return MDB ? '<button type="button" class="mref" data-act="melv" data-no="' + esc(n) + '">' + esc(n) + '</button>' : esc(n); }).join(' ') : 'No MEL / CDL items are listed in this OFP.') + ' Add the tech-log items here – they stay with this flight and show on NOW.</p>' +
      '<ul class="mell">' + S.mel.map(function (m, i) { var f = melFind(m.no); return '<li><b>' + esc(m.no) + '</b> ' + esc(m.title || (f ? f.t : '')) + (function () { var t = f ? f.v.map(function (v) { return v.pr; }).filter(Boolean).filter(function (x, j, a) { return a.indexOf(x) === j; }).join(' / ') : ''; return t ? '<span class="mvt">' + esc(t) + '</span>' : ''; })() + (m.note ? '<small>' + esc(m.note) + '</small>' : '') + '<button type="button" data-act="meld" data-i="' + i + '">Remove</button>' + melText(m.no, false) + '</li>'; }).join('') + '</ul>' +
      '<div class="frm"><label>MEL item<input id="ml-n" maxlength="20" placeholder="e.g. 21-31-01" autocomplete="off"></label><label>Title<input id="ml-t" maxlength="80" placeholder="' + (MDB ? 'filled from the MEL' : 'item title') + '"></label><label>Ops note / limits<input id="ml-o" maxlength="200" placeholder="what it means for this flight"></label><button type="button" class="pri" data-act="mela">Add</button></div>' +
      (MDB ? '<h3 class="shh">Look up the MEL <small>number or words, e.g. 34-58 or GPS</small></h3><input id="ml-q" type="search" class="sqi" placeholder="MEL item or word…" value="' + esc(melQ) + '" autocomplete="off"><div id="ml-h">' + (melOpen ? melText(melOpen, true) + '<p class="mvadd"><button type="button" data-act="melp" data-no="' + esc(melOpen) + '">Add ' + esc(melOpen) + ' to this flight</button></p>' : melHits(melQ)) + '</div>' +
        '<p class="note">MEL text: ' + esc(D.mel.src || '') + ' Pilot parts only: conditions, crew deferral (M-CD), operations (O), operations note, placard. Maintenance (M) text and 777F variants are left out – the MEL / dispatch release governs.</p>'
        : '<p class="note">This flight file has no MEL text. Text you type is yours – check it against the MEL / dispatch release.</p>');
  }
  X.melFind = melFind;
  window.FPMelFind = melFind;   // v3.3: DASH strip and other pages look items up in the MEL library
  function melAfter(b) {
    if (b._mel) return; b._mel = 1;
    b.addEventListener('input', function (e) {
      if (!b.querySelector('#ml-h')) return;
      if (e.target.id === 'ml-q') { melQ = e.target.value; melOpen = ''; b.querySelector('#ml-h').innerHTML = melHits(melQ); }
      else if (e.target.id === 'ml-n') { var f = melFind(e.target.value), t = b.querySelector('#ml-t'); if (t && f && (!t.value || t.dataset.auto)) { t.value = f.t + (f.exact && f.v.length === 1 && f.v[0].h ? ' – ' + f.v[0].h : ''); t.dataset.auto = '1'; } }
      else if (e.target.id === 'ml-t') delete e.target.dataset.auto;
    });
  }
  function gndHtml() {
    var G2 = [['rep', 'Report'], ['brf', 'Crew briefing'], ['brd', 'Boarding'], ['dc', 'Doors closed']];
    return '<p class="sub">STD <b>' + esc(String(F.std).replace(':', '')) + 'Z</b> (OFP). Enter your times (UTC, HHMM) from the roster / briefing – they count down on NOW and in Up next before take-off.</p><div class="frm">' +
      G2.map(function (g) { return '<label>' + g[1] + '<input id="gn-' + g[0] + '" inputmode="numeric" maxlength="4" placeholder="HHMM" value="' + esc(S.gnd[g[0]] || '') + '"></label>'; }).join('') + '<button type="button" class="pri" data-act="gnds">Save</button></div>';
  }
  var abQ = '';
  function abbrHtml() { return '<input id="ab-q" type="search" class="sqi" placeholder="Filter…" value="' + esc(abQ) + '" autofocus><dl class="abl" id="ab-l">' + abList(abQ) + '</dl>'; }
  function abList(q) { q = (q || '').toUpperCase(); return window.FPAbbr.filter(function (a) { return !q || (a[0] + ' ' + a[1]).toUpperCase().indexOf(q) >= 0; }).map(function (a) { return '<dt>' + esc(a[0]) + '</dt><dd>' + esc(a[1]) + '</dd>'; }).join(''); }
  /* ---------- self-test */
  function selfTest() {
    var R = [], add = function (ok, t, d) { R.push([ok, t, d || '']); };
    add(!!D.rows && D.rows.length > 0, 'Flight data', (D.rows || []).length + ' waypoint rows, ' + D.firs.length + ' FIRs');
    var vs = Object.keys(A.views), empty = vs.filter(function (v) { return v !== 'flights' && A.views[v].textContent.trim().length < 20 && !A.views[v].querySelector('img, svg, canvas'); });
    add(!empty.length, 'Pages', vs.length + ' pages' + (empty.length ? ' – empty: ' + empty.join(', ') : ''));
    add(!!A.globe(), 'Route map', A.globe() ? 'globe running' : 'not available');
    add(!!D.wx && D.wx.length > 0, 'OFP weather', (D.wx || []).length + ' airports'); add(D.notams != null, 'OFP NOTAMs', (D.notams || []).length + ' airport + ' + (D.rnotams || []).length + ' en-route');
    add(!!D.etops_info, 'ETOPS data', D.etops_info ? 'entry ' + hm(D.etops_info.entry.eet_min) : 'none in this flight');
    var ls = false; try { localStorage.setItem('fp:test', '1'); localStorage.removeItem('fp:test'); ls = true; } catch (e) { } add(ls, 'Storage for ticks / timers', ls ? 'writable' : 'NOT writable (private mode?)');
    add(document.fonts ? document.fonts.check('600 14px Inter') : true, 'Fonts', document.fonts && document.fonts.check('600 14px Inter') ? 'Inter loaded' : 'system font');
    var built = window.FPRec ? window.FPRec.built_utc : '', dt = new Date();
    add(true, 'Clock', 'device UTC ' + pad(dt.getUTCHours()) + ':' + pad(dt.getUTCMinutes()) + ' on ' + dt.toISOString().slice(0, 10) + ' · flight date ' + esc(D.date || '') + (built ? ' · file built ' + esc(built) : ''));
    add(!A.isPlan(), 'Take-off time', A.isPlan() ? 'not set – planned T/O used' : 'set ' + (S.to || ''));
    var html = function () { return '<ul class="stl">' + R.map(function (r) { return '<li class="' + (r[0] === true ? 'ok' : (r[0] === null ? 'wa' : 'no')) + '"><b>' + esc(r[1]) + '</b><span>' + r[2] + '</span></li>'; }).join('') + '</ul><p class="note">Run before departure. Green = OK, amber = check, red = fix.</p>'; };
    X.openSheet('selftest', 'Self-test', html);
    var jobs = [];
    if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
      add(!!navigator.serviceWorker.controller, 'Offline (service worker)', navigator.serviceWorker.controller ? 'active' : 'not active (web page or first load)');
      if (window.caches) jobs.push(caches.keys().then(function (k) { var c = k.filter(function (x) { return /^fpapp-/.test(x); }); add(c.length ? true : null, 'Offline cache', c.join(', ') || 'none'); }));
    }
    if (navigator.storage && navigator.storage.estimate) jobs.push(navigator.storage.estimate().then(function (e) { add(e.quota ? e.usage / e.quota < 0.8 : true, 'Storage space', (e.usage / 1e6).toFixed(1) + ' MB used' + (e.quota ? ' of ' + (e.quota / 1e6).toFixed(0) + ' MB' : '')); }));
    if (navigator.permissions && navigator.permissions.query) jobs.push(navigator.permissions.query({ name: 'geolocation' }).then(function (p) { add(p.state === 'granted' ? true : null, 'Location (GPS backup)', p.state); }).catch(function () { }));
    Promise.all(jobs).then(function () { X.rerenderWith(html()); });
  }
  /* ---------- optional pages with an on/off switch: CHARTS (SIGWX, wind/temp) and APPROACH (IAC for destination / alternates) */
  var OPT = [['charts', 'Charts page', 'charts']];   // v2.0: approach page removed (user 05 NOV)
  OPT.forEach(function (o) { o.pos = A.seq.indexOf(o[0]); });
  function applyPages() {
    OPT.forEach(function (o) {
      var has = !!A.views[o[0]], b = $('pg-' + o[0]), onp = P[o[2]] !== false; if (b) b.textContent = o[1] + ': ' + (has ? (onp ? 'on' : 'off') : 'none in this flight file');
      if (!has) return; var a = document.querySelector('#tabs a[data-v="' + o[0] + '"]'); if (a) a.hidden = !onp;
      var i = A.seq.indexOf(o[0]); if (!onp && i >= 0) A.seq.splice(i, 1); if (onp && i < 0 && o.pos >= 0) A.seq.splice(Math.min(o.pos, A.seq.length), 0, o[0]);
      if (!onp && A.cur() === o[0]) location.hash = 'now';
    });
  }
  var sg = document.querySelector('#settings .sg:last-child');
  if (sg) sg.insertAdjacentHTML('beforeend', OPT.map(function (o) { return '<button type="button" id="pg-' + o[0] + '"></button>'; }).join('') + '<button type="button" id="selftest-b">Self-test</button>');
  OPT.forEach(function (o) { var b = $('pg-' + o[0]); if (b) b.addEventListener('click', function () { if (!A.views[o[0]]) return; P[o[2]] = P[o[2]] === false; A.savePrefs(); applyPages(); }); });
  if ($('selftest-b')) $('selftest-b').addEventListener('click', selfTest);
  applyPages();
  /* ---------- tools menu */
  var MENU = [['Weather & arrival', [['wx', 'TAF timeline at ETA'], ['nt', 'NOTAMs at ETA'], ['live', 'Live weather (online)']]],
    ['Calculators', [['c-wind', 'Wind component'], ['c-cold', 'Cold temperature'], ['c-hold', 'Holding entry'], ['c-units', 'Unit converter']]],
    ['Safety', [['d-emer', 'Emergency card'], ['d-dev', 'Wx deviation · offset'], ['d-rcf', 'Lost comms'], ['d-icpt', 'Interception'], ['d-apt', 'Nearest airports']]],
    ['Flight', [['alt', 'Destination alternates'], ['etops', 'ETOPS details'], ['gnd', 'Ground countdown'], ['mel', 'MEL items'], ['ct', 'Contacts / SATCOM'], ['ab', 'Abbreviations'], ['st', 'Self-test']]]];
  function menuHtml() { return MENU.map(function (g) { return '<h3 class="shh">' + g[0] + '</h3><div class="tgrid">' + g[1].map(function (x) { return '<button type="button" data-act="open" data-k="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div>'; }).join(''); }
  function open(k, x) {
    if (k === 'wx') X.openSheet('wx', 'Weather at your times', wxHtml, { wide: true });
    else if (k === 'nt' || k === 'notam') { if (x && x.n) { ntRole = x.n.role || (x.n.fir ? 'ENR' : 'DEST'); ntAll = true; } X.openSheet('nt', 'NOTAMs', ntHtml, { wide: true }); }
    else if (k === 'live') X.openSheet('live', 'Live weather', function () { return liveHtml(''); });
    else if (k.indexOf('c-') === 0) { cTab = k.slice(2); X.openSheet('calc', 'Calculators', calcHtml, { after: calcAfter }); }
    else if (k.indexOf('d-') === 0) X.openDivert(k.slice(2));
    else if (k === 'etops') X.openSheet('etops', 'ETOPS', etopsHtml, { wide: true });
    else if (k === 'alt') X.openSheet('alt', 'Destination alternates', altHtml, { wide: true });
    else if (k === 'gnd') X.openSheet('gnd', 'Ground countdown', gndHtml);
    else if (k === 'mel') { if (x && x.no) { melOpen = melNorm(x.no); melQ = ''; } X.openSheet('mel', 'MEL items', melHtml, { wide: true, after: melAfter }); }
    else if (k === 'ct') X.openSheet('ct', 'Contacts / SATCOM', contactsHtml, { wide: true });
    else if (k === 'ab' || k === 'abbr') { if (x && x.t) abQ = x.t.split(' – ')[0]; X.openSheet('ab', 'Abbreviations', abbrHtml, { after: function (b) { b.querySelector('#ab-q').addEventListener('input', function () { abQ = this.value; b.querySelector('#ab-l').innerHTML = abList(abQ); }); } }); }
    else if (k === 'st') selfTest();
    else if (k === 'menu') X.openSheet('menu', 'Tools', menuHtml);
  }
  window.FPTools2Open = open;
  window.FPRerender = X.rerender;   // v3.3: used after a live weather refresh
  var tb = $('b-tools'); if (tb) tb.addEventListener('click', function () { open('menu'); });
  function act(b, ev) {
    var a = b.dataset.act; ev.preventDefault();
    if (a.indexOf('wn-') === 0) { if (WN) WN.act(b); return; }
    if (a.indexOf('rg-') === 0) { if (window.FPRegs) window.FPRegs.act(b); return; }
    if (a === 'open') open(b.dataset.k);
    else if (a === 'wxr') { wxRole = b.dataset.r; X.rerender(); }
    else if (a === 'ntr') { ntRole = b.dataset.r; X.rerender(); } else if (a === 'nta') { ntAll = !ntAll; X.rerender(); }
    else if (a === 'lwx') fetchLive();
    else if (a === 'ct') { cTab = b.dataset.t; X.rerender(); }
    else if (a === 'x-etops') open('etops'); else if (a === 'x-gnd') open('gnd'); else if (a === 'x-mel') open('mel');
    else if (a === 'gnds') { ['rep', 'brf', 'brd', 'dc'].forEach(function (k) { var v = ($('gn-' + k).value || '').replace(/\D/g, ''); if (v.length === 4 && +v.slice(0, 2) < 24 && +v.slice(2) < 60) S.gnd[k] = v; else delete S.gnd[k]; }); A.save(); A.tick(true); X.closeSheet(); A.toast('Ground times saved.'); }
    else if (a === 'mela') { var n = melNorm($('ml-n').value.trim()) || $('ml-n').value.trim(), t = $('ml-t').value.trim(); if (!n && !t) return; var mf = melFind(n); S.mel.push({ no: n, title: t || (mf ? mf.t : ''), note: $('ml-o').value.trim() }); A.save(); A.tick(true); X.rerender(); }
    else if (a === 'melv') { melOpen = melNorm(b.dataset.no); if (!$('ml-h')) open('mel'); else { X.rerender(); var h = $('ml-h'); if (h && h.scrollIntoView) h.scrollIntoView({ block: 'start' }); } }
    else if (a === 'melp') { var pf = melFind(b.dataset.no); if (!S.mel.some(function (m) { return melNorm(m.no) === melNorm(b.dataset.no); })) { S.mel.push({ no: melNorm(b.dataset.no), title: pf ? pf.t : '', note: '' }); A.save(); A.tick(true); } melOpen = ''; X.rerender(); }
    else if (a === 'meld') { S.mel.splice(+b.dataset.i, 1); A.save(); A.tick(true); X.rerender(); }
  }
  return { act: act, cards: cards, tick: function () { }, shown: function () { }, wxnt: function () { if (WN) WN.render(); }, wn: WN };
};
