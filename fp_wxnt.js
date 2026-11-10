/* fp_wxnt.js v3.0 (09 NOV 26) - the WX · NOTAM page (user: "a quick tab saying weather and notams, highlighting important notams,
   mostly new or short duration notams"). Data: OFP weather (D.wx), airport NOTAMs (D.notams), en-route NOTAMs (D.rnotams), company crew
   alerts (D.crew_alert); optional D.notam_flags {id: {new: why}} and D.notam_notes {id: plain-language summary} from the flight file.
   Nothing is invented: NEW = started in the last 7 days before the flight (or flagged new since the last OFP), SHORT = valid 72 h or less,
   the colour comes from key words (runway / ILS / GPS = red, taxiway / stand / navaid / lights / minima = amber). Decode helpers from fp_tools2. */
window.FPWxNt = function (X) {
  'use strict';
  var A = X.A, D = A.D, F = D.flight, T = F.trip, esc = A.esc, hm = A.hm, $ = X.$, W = X.wx;
  var KEY = 'fpapp:wn:' + F.id, ST = { pins: {}, read: {}, role: 'ALL', imp: true, act: false, sort: 'imp', open: {} };
  try { Object.assign(ST, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(ST)); } catch (e) { } }
  var DAY = 1440, EYE = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  var RED = /\b(RWY|RUNWAY)\b[^.]{0,40}\b(CLSD|CLOSED|NOT AVBL|U\/S|UNSERVICEABLE)|\b(CLSD|CLOSED)\b[^.]{0,30}\b(RWY|RUNWAY|AD|AERODROME|AIRPORT)\b|\bAD CLSD|\bILS\b[^.]{0,50}\b(U\/S|NOT AVBL|UNSERVICEABLE|WITHDRAWN|OUT OF SER)|\b(GPS|GNSS)\b[^.]{0,40}\b(INTERFERENCE|JAMMING|SPOOFING|DEGRAD|UNRELIABLE|OUTAGE|FAILURE)|\bLVP\b|\bLOW VIS(IBILITY)? PROC|\bDISPLACED (THR|THRESHOLD)|\bTORA\b|\bRFF\w*\b[^.]{0,30}\b(CAT|REDUCED|DOWNGRADED)|\bFUEL\b[^.]{0,30}\bNOT AVBL|\bAIRSPACE\b[^.]{0,40}\b(CLSD|CLOSED|PROHIBITED|RESTRICTED)|\bPROHIBITED AREA|\bTEMPO(RARY)? RESTRICTED AREA|\bMINIMA\b[^.]{0,40}\b(RAISED|INCREASED|NOT AVBL)|\bMISSED APCH|\bRVR\b[^.]{0,30}\bU\/S|\bRADAR\b[^.]{0,40}\b(U\/S|NOT AVBL|OUT OF SER)/i;
  var AMB = /\b(TWY|TAXIWAY|TXL|TAXILANE|APRON|STAND|STANDS|PARKING)\b[^.]{0,60}\b(CLSD|CLOSED|NOT AVBL|RESTRICTED|RELOCATED|WIP|WORK)|\b(CRANE|OBST|OBSTACLE|MAST|BALLOON|DRONE|UAS)\b|\b(PAPI|VASI|APCH LGT|ALS|REIL|RTIL|CL LGT|EDGE LGT|LGT|LIGHTS?)\b[^.]{0,40}\b(U\/S|NOT AVBL|UNSERVICEABLE|OUT)|\b(VOR|DME|NDB|TACAN|LOC|GP|GLIDE)\b[^.]{0,40}\b(U\/S|NOT AVBL|UNSERVICEABLE|OUT OF SER|OUT OF CALIBRATION)|\b(SID|STAR|IAP|APCH|APPROACH|RNAV|RNP|PROC)\b[^.]{0,50}\b(NOT AVBL|SUSPENDED|WITHDRAWN|CHANGED|AMENDED|NOT AUTH)|\b(FREQ|FREQUENCY)\b[^.]{0,40}\b(CHANGED|U\/S|NOT AVBL)|\bATIS\b[^.]{0,30}\b(U\/S|NOT AVBL)|\bWIP\b|\bWORK IN PROGRESS|\bBIRD\b[^.]{0,30}\b(CONCENTRATION|ACTIVITY|HAZARD)|\bNO 180|\b180 DEG|\bPUSH ?BACK|\bFOLLOW[- ]ME|\bHOLDING (POINT|POSITION)|\bHOT ?SPOT|\bSLOT|\bPPR\b|\bCURFEW|\bNOISE|\bDE-?ICING|\bCUSTOMS|\bHANDLING|\bDIVERSION/i;
  function cls(n) { var x = n.x || ''; if (n.kind === 'conflict') return 2; if (RED.test(x)) return 2; if (AMB.test(x)) return 1; return 0; }
  function isNew(n) { var f = D.notam_flags && D.notam_flags[n.id]; if (f && f.new) return f.new === true ? 'started in the last days' : f.new; return n.a != null && n.a >= -7 * DAY ? 'started ' + (n.a >= 0 ? 'on the day of the flight' : 'within 7 days of the flight') : ''; }
  function isShort(n) { return n.b != null && n.a != null && n.b - n.a <= 72 * 60; }
  function dur(n) { if (n.b == null) return n.bt || 'UFN'; var m = n.b - n.a; return m < 60 ? Math.round(m) + ' min' : (m < DAY * 2 ? Math.round(m / 60) + ' h' : Math.round(m / DAY) + ' d'); }
  function win(n) {   // the time window that matters for this NOTAM: airport roles from the weather focus, FIRs from the planned time in the FIR
    if (n.role && n.role !== 'ENR') { var fo = W.focus({ role: n.role, icao: n.icao }); if (fo.at == null) return null; var b = fo.at2 != null ? fo.at2 : fo.at; return [fo.at - 60, b + 60]; }
    var f = (D.firs || []).filter(function (x) { return x.fir === n.fir; })[0]; if (!f) return null; var nx = D.firs[D.firs.indexOf(f) + 1];
    return [A.toMin() + f.eet_min, A.toMin() + (nx ? nx.eet_min : T)];
  }
  function active(n) { var w = win(n); if (!w) return true; return n.a <= w[1] && (n.b == null || n.b >= w[0]); }
  function starts(n) { var w = win(n); return w && n.a > w[0] && n.a <= w[1]; }
  function score(n) { var s = cls(n) * 10 + (isNew(n) ? 6 : 0) + (isShort(n) ? 5 : 0) + (active(n) ? 3 : 0) + (ST.pins[n.id] ? 100 : 0) - (ST.read[n.id] ? 50 : 0); return s; }
  function important(n) { return cls(n) > 0 || !!isNew(n) || isShort(n) || !!ST.pins[n.id]; }
  function all() {
    var L = (D.notams || []).slice();
    (D.rnotams || []).forEach(function (n) { L.push(Object.assign({ role: 'ENR', icao: n.fir, cat: (n.on === false ? 'NOT ON YOUR ROUTE · ' : '') + (n.kind || 'FIR').toUpperCase() }, n)); });   // v3.6: area blocks that are no FIR / waypoint of the route say so
    return L;
  }
  var ROLES = [['ALL', 'All'], ['DEP', 'Departure'], ['DEST', 'Destination'], ['ALTN', 'Alternates'], ['ETOPS', 'ETOPS'], ['ENR', 'En route']];
  function ordRole(r) { return { DEP: 0, DEST: 1, ALTN: 2, ETOPS: 3, ENR: 4 }[r] == null ? 5 : { DEP: 0, DEST: 1, ALTN: 2, ETOPS: 3, ENR: 4 }[r]; }
  /* ---------- airfield status tiles: weather colour (TAF at your time) + NOTAM colour (worst active) */
  var SVN = ['OK', 'CHECK', 'POOR'];
  function wxSev(w) {
    if (!w || !w.groups) return null; var fo = W.focus(w); if (fo.at == null) return null;
    var cur = W.comp(w.groups[0].x), tmp = [];
    w.groups.slice(1).forEach(function (g) { if ((g.t === 'BECMG' && g.b <= fo.at) || (g.t === 'FM' && g.a <= fo.at)) cur = g.t === 'FM' ? W.comp(g.x) : W.comp(g.x, cur); if (/TEMPO|PROB/.test(g.t) && g.a <= fo.at && g.b > fo.at) tmp.push(g); });
    return Math.max(W.sev(cur), tmp.reduce(function (m, g) { return Math.max(m, /PROB30/.test(g.t) ? Math.min(1, W.sev(W.comp(g.x))) : W.sev(W.comp(g.x))); }, 0));
  }
  function tiles() {
    var apts = [], seen = {};
    (D.wx || []).forEach(function (w) { if (/DEP|DEST|ALTN|ETOPS/.test(w.role) && !seen[w.icao]) { seen[w.icao] = 1; apts.push({ icao: w.icao, role: w.role, w: w }); } });
    (D.notams || []).forEach(function (n) { if (!seen[n.icao]) { seen[n.icao] = 1; apts.push({ icao: n.icao, role: n.role, w: null }); } });
    apts.sort(function (a, b) { return ordRole(a.role) - ordRole(b.role); });
    return '<div class="wtiles">' + apts.map(function (a) {
      var ns = (D.notams || []).filter(function (n) { return n.icao === a.icao; }), act_ = ns.filter(active), worst = act_.reduce(function (m, n) { return Math.max(m, cls(n)); }, 0), nn = act_.filter(function (n) { return isNew(n) || isShort(n); }).length;
      var ws = wxSev(a.w), fo = a.w ? W.focus(a.w) : null;
      return '<button type="button" class="wtile" data-act="wn-apt" data-icao="' + esc(a.icao) + '"><span class="wth"><b>' + esc(a.icao) + '</b><small>' + esc(a.role) + (fo && fo.at != null ? ' · ' + esc(W.hz(fo.at)) : '') + '</small></span>' +
        '<span class="wtw s' + (ws == null ? 'n' : ws) + '"><i></i>WX ' + (ws == null ? 'no TAF' : SVN[ws]) + '</span>' +
        '<span class="wtn s' + (act_.length ? worst : 'n') + '"><i></i>NOTAM ' + act_.length + (nn ? ' · ' + nn + ' new/short' : '') + '</span></button>';
    }).join('') + '</div>';
  }
  /* ---------- weather cards */
  function wxCard(w) {
    var fo = W.focus(w), sv = wxSev(w), op = ST.open['wx:' + w.icao];
    return '<details class="wnwx s' + (sv == null ? 'n' : sv) + '" data-wx="' + esc(w.icao) + '"' + (op ? ' open' : '') + '><summary><b>' + esc(w.icao) + '</b> <span class="wxnm">' + esc(w.name || '') + '</span><span class="tag">' + esc(w.role) + '</span>' +
      '<span class="wxsv s' + (sv == null ? 'n' : sv) + '">' + (sv == null ? 'no TAF' : SVN[sv]) + '</span><small>' + esc(fo.lab) + '</small></summary>' +
      (w.groups ? W.tafSvg(w, fo) + W.atTxt(w, fo.at) + (fo.at2 ? W.atTxt(w, fo.at2) : '') : '<p class="note">' + esc(w.taf || 'No TAF in the OFP.') + '</p>') +
      (w.live_metar ? '<code class="wxraw live"><b>METAR LIVE ' + esc(w.live_metar_t || '') + '</b> ' + esc(w.live_metar) + '</code>' : '') +
      (w.live_taf ? '<code class="wxraw live"><b>TAF LIVE ' + esc(w.live_taf_t || '') + '</b> ' + esc(w.live_taf) + '</code>' : '') +
      (w.metar ? '<code class="wxraw"><b>METAR' + (w.live_metar ? ' (OFP)' : '') + '</b> ' + esc(w.metar) + '</code>' : '') +
      (w.taf ? '<code class="wxraw"><b>TAF' + (w.live_taf ? ' (OFP)' : '') + '</b> ' + esc(w.taf) + '</code>' : '') + '</details>';
  }
  function wxList() {
    var L = (D.wx || []).filter(function (w) { return ST.role === 'ALL' ? w.role !== 'ENR' : (ST.role === 'ENR' ? w.role === 'ENR' : w.role === ST.role); });
    L.sort(function (a, b) { return ordRole(a.role) - ordRole(b.role); });
    if (!L.length) return '<p class="note">No OFP weather for this group.</p>';
    return L.map(wxCard).join('');
  }
  /* ---------- NOTAM cards */
  function badges(n) {
    var b = [], nw = isNew(n), c = cls(n);
    if (ST.pins[n.id]) b.push('<span class="nb pin">PINNED</span>');
    if (c === 2) b.push('<span class="nb red">' + (n.kind === 'conflict' ? 'CONFLICT' : 'CRITICAL') + '</span>'); else if (c === 1) b.push('<span class="nb amb">IMPORTANT</span>');
    if (nw) b.push('<span class="nb new" title="' + esc(nw) + '">NEW</span>');
    if (isShort(n)) b.push('<span class="nb short">SHORT · ' + esc(dur(n)) + '</span>');
    if (!active(n)) b.push('<span class="nb off">' + (starts(n) ? 'STARTS LATER' : 'NOT AT YOUR TIME') + '</span>'); else if (n.a > A.toMin() - 60 && n.role !== 'ENR') b.push('<span class="nb act">ACTIVE AT YOUR TIME</span>');
    if (n.est) b.push('<span class="nb off">EST</span>');
    return b.join('');
  }
  function card(n) {
    var c = cls(n), rd = ST.read[n.id], op = ST.open[n.id], note = D.notam_notes && D.notam_notes[n.id], shortx = n.x.length > 150 ? n.x.slice(0, 150) + '…' : n.x;
    return '<article class="wnc s' + c + (rd ? ' rd' : '') + (ST.pins[n.id] ? ' pn' : '') + (active(n) ? '' : ' na') + '" data-id="' + esc(n.id) + '">' +
      '<header><button type="button" class="wnt" data-act="wn-open" data-id="' + esc(n.id) + '" aria-expanded="' + (op ? 'true' : 'false') + '"><b class="wnap">' + esc(n.icao) + '</b><span class="wnid">' + esc(n.id) + '</span><span class="tag">' + esc(n.cat || '') + '</span>' +
      '<small class="wnv">' + esc(W.absTxt(n.a)) + ' – ' + (n.b == null ? esc(n.bt || 'UFN') : esc(W.absTxt(n.b))) + '</small></button>' +
      '<span class="wnb"><button type="button" class="icb wnpin' + (ST.pins[n.id] ? ' on' : '') + '" data-act="wn-pin" data-id="' + esc(n.id) + '" aria-label="Pin to top" aria-pressed="' + (ST.pins[n.id] ? 'true' : 'false') + '"><svg class="ic" aria-hidden="true"><use href="#i-pin"/></svg></button>' +
      '<button type="button" class="icb wnrd' + (rd ? ' on' : '') + '" data-act="wn-read" data-id="' + esc(n.id) + '" aria-label="Mark as read" aria-pressed="' + (rd ? 'true' : 'false') + '"><svg class="ic" aria-hidden="true"><use href="#i-check"/></svg></button></span></header>' +
      '<div class="wnbd">' + badges(n) + '</div>' +
      (note ? '<p class="wnnote"><b>In short:</b> ' + esc(note) + '</p>' : '') +
      '<p class="wnx' + (op ? '' : ' cut') + '">' + esc(op ? n.x : shortx) + '</p>' + (op || n.x.length <= 150 ? '' : '<button type="button" class="wnmore" data-act="wn-open" data-id="' + esc(n.id) + '">' + EYE + ' full text</button>') + '</article>';
  }
  function ntList() {
    var L = all().filter(function (n) { return ST.role === 'ALL' || n.role === ST.role; });
    if (ST.imp) L = L.filter(important);
    if (ST.act) L = L.filter(active);
    var total = all().filter(function (n) { return ST.role === 'ALL' || n.role === ST.role; }).length;
    if (ST.sort === 'imp') L.sort(function (a, b) { return score(b) - score(a) || ordRole(a.role) - ordRole(b.role) || a.a - b.a; });
    else if (ST.sort === 'time') L.sort(function (a, b) { return (ST.pins[b.id] ? 1 : 0) - (ST.pins[a.id] ? 1 : 0) || b.a - a.a; });
    else L.sort(function (a, b) { return (ST.pins[b.id] ? 1 : 0) - (ST.pins[a.id] ? 1 : 0) || ordRole(a.role) - ordRole(b.role) || a.icao.localeCompare(b.icao) || score(b) - score(a); });
    var h = '<p class="sub wncount">' + L.length + ' of ' + total + ' NOTAMs shown' + (ST.imp ? ' – important, new or short ones' : '') + (ST.act ? ', active at your time' : '') + '. Pinned first.</p>';
    if (!L.length) h += '<p class="note">Nothing to show with these filters.</p>';
    var last = '';
    L.forEach(function (n) { if (ST.sort === 'apt' && n.icao !== last) { last = n.icao; h += '<h3 class="shh">' + esc(n.icao) + ' <small>' + esc(n.role) + '</small></h3>'; } h += card(n); });
    return h;
  }
  function seg(items, key, act) { return '<div class="seg wnseg">' + items.map(function (t) { return '<button type="button" data-act="' + act + '" data-v="' + t[0] + '" class="' + (ST[key] === t[0] ? 'on' : '') + '">' + t[1] + '</button>'; }).join('') + '</div>'; }
  function crew() {
    var C = D.crew_alert || []; if (!C.length) return '';
    return '<details class="wncrew"' + (ST.open.crew ? ' open' : '') + '><summary><b>Company NOTAMs · crew alert</b> <small>' + C.length + ' in the dispatch briefing</small></summary>' + C.map(function (c) { return '<p><b>' + esc(c.id) + '</b> ' + esc(c.title || '') + '<br>' + esc(c.x) + '</p>'; }).join('') + '</details>';
  }
  function render() {
    var host = $('wxnt'); if (!host) return;
    var y = window.scrollY;
    host.innerHTML = '<h1 class="pt">Weather &amp; NOTAMs</h1><p class="sub">OFP weather and NOTAM bulletin of ' + esc(D.date || '') + ' · times at each airfield from your take-off time · the colours are a simple decode, check the minima and the full text yourself.</p>' +
      (window.FPOnline ? '<div class="wnon"><button type="button" class="cbtn" data-act="wn-live">Refresh weather / NOTAMs</button><small>' + esc(window.FPOnline.label()) + '</small></div>' : '') +
      tiles() + crew() +
      '<div class="bar"><span>Weather</span><small>TAF timeline at your time · tap for METAR / TAF</small></div><div class="wnwxl">' + wxList() + '</div>' +
      '<div class="bar"><span>NOTAMs</span><small>new · short duration · runway / ILS / GPS red · taxiways / navaids amber</small></div>' +
      '<div class="wnf">' + seg(ROLES, 'role', 'wn-role') +
      '<div class="seg wnseg"><button type="button" data-act="wn-imp" class="' + (ST.imp ? 'on' : '') + '">' + (ST.imp ? 'Important only' : 'Showing all') + '</button><button type="button" data-act="wn-act" class="' + (ST.act ? 'on' : '') + '">Active at my time</button></div>' +
      seg([['imp', 'By importance'], ['time', 'Newest first'], ['apt', 'By airport']], 'sort', 'wn-sort') + '</div>' +
      '<div class="wnl">' + ntList() + '</div>' +
      '<p class="note">Validity as published in the OFP bulletin; NEW = started within 7 days of the flight date' + (D.notam_flags ? ' or new since the last OFP of this airport' : '') + '; SHORT = valid 72 h or less. Pins and read marks stay on this iPad for this flight.</p>';
    window.scrollTo(0, y);
  }
  function act(b) {
    var a = b.dataset.act, id = b.dataset.id;
    if (a === 'wn-role') ST.role = b.dataset.v; else if (a === 'wn-sort') ST.sort = b.dataset.v; else if (a === 'wn-imp') ST.imp = !ST.imp; else if (a === 'wn-act') ST.act = !ST.act;
    else if (a === 'wn-pin') { if (ST.pins[id]) delete ST.pins[id]; else ST.pins[id] = 1; }
    else if (a === 'wn-read') { if (ST.read[id]) delete ST.read[id]; else ST.read[id] = 1; }
    else if (a === 'wn-open') { if (ST.open[id]) delete ST.open[id]; else ST.open[id] = 1; }
    else if (a === 'wn-live') { if (window.FPOnline) { b.disabled = true; b.textContent = 'Refreshing …'; window.FPOnline.refresh().then(function (r) { render(); if (A.toast) A.toast(r && r.changed ? r.changed + ' update(s) from the live file.' : (window.FPOnline.state.err || 'Nothing newer than the OFP.')); }).catch(function () { render(); }); } return true; }
    else if (a === 'wn-apt') { var ic = b.dataset.icao, n0 = (D.notams || []).filter(function (n) { return n.icao === ic; })[0]; ST.role = n0 ? n0.role : ST.role; ST.sort = 'apt'; ST.open['wx:' + ic] = 1; save(); render(); var w = document.querySelector('.wnwx[data-wx="' + ic + '"]'); if (w) w.scrollIntoView({ behavior: 'smooth', block: 'start' }); return true; }
    else return false;
    save(); render(); return true;
  }
  // details open state (weather cards, crew alerts) remembered so a re-render does not close them
  document.addEventListener('toggle', function (ev) { var d = ev.target; if (!d.matches || !d.matches('#wxnt details')) return; var k = d.dataset.wx ? 'wx:' + d.dataset.wx : (d.classList.contains('wncrew') ? 'crew' : null); if (!k) return; if (d.open) ST.open[k] = 1; else delete ST.open[k]; save(); }, true);
  function dash() {   // v3: the same airfield tiles on DASH (tap -> WX · NOTAM page), refreshed with the page
    var sec = $('v-dash'); if (!sec) return; var host = $('dash-air');
    if (!host) { host = document.createElement('div'); host.id = 'dash-air'; host.className = 'dashair'; var hero = sec.querySelector('.dhero'); if (hero && hero.parentNode) hero.parentNode.insertBefore(host, hero.nextSibling); else sec.insertBefore(host, sec.firstChild); }
    var h = '<div class="bar"><span>Airfields now</span><small>weather at your time · active NOTAMs · tap for the WX · NOTAM page</small></div>' + tiles().replace(/data-act="wn-apt"/g, 'data-act="wn-dash"');
    if (host._h !== h) { host._h = h; host.innerHTML = h; }
  }
  var _act = act;
  act = function (b) { if (b.dataset.act === 'wn-dash') { ST.role = 'ALL'; ST.sort = 'apt'; var ic = b.dataset.icao; ST.open['wx:' + ic] = 1; save(); location.hash = 'wxnotam'; setTimeout(function () { render(); var w = document.querySelector('.wnwx[data-wx="' + ic + '"]'); if (w) w.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 120); return true; } return _act(b); };
  return { render: render, dash: dash, act: function (b) { return act(b); }, cls: cls, isNew: isNew, isShort: isShort, active: active, important: important, all: all };
};
