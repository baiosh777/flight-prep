/* fp_wxnt.js v3.0 (09 NOV 26) - the WX · NOTAM page (user: "a quick tab saying weather and notams, highlighting important notams,
   mostly new or short duration notams"). Data: OFP weather (D.wx), airport NOTAMs (D.notams), en-route NOTAMs (D.rnotams), company crew
   alerts (D.crew_alert); optional D.notam_flags {id: {new: why}} and D.notam_notes {id: plain-language summary} from the flight file.
   Nothing is invented: NEW = started in the last 7 days before the flight (or flagged new since the last OFP), SHORT = valid 72 h or less,
   the colour comes from key words (runway / ILS / GPS = red, taxiway / stand / navaid / lights / minima = amber). Decode helpers from fp_tools2. */
window.FPWxNt = function (X) {
  'use strict';
  var A = X.A, D = A.D, F = D.flight, T = F.trip, esc = A.esc, hm = A.hm, $ = X.$, W = X.wx;
  var KEY = 'fpapp:wn:' + F.id, ST = { pins: {}, read: {}, role: 'ALL', imp: true, act: false, sort: 'grp', open: {}, more: false, dashAll: false, v: 37 };
  try { var st0 = JSON.parse(localStorage.getItem(KEY) || '{}'); if (st0.v !== 37) { st0.sort = 'grp'; st0.role = 'ALL'; st0.v = 37; } Object.assign(ST, st0); } catch (e) { }
  if (window.FPOnline && window.FPOnline.restore) window.FPOnline.restore(D);   // v3.7: the weather last fetched on this iPad for this flight (kept for use without internet)
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
    var L = (D.notams || []).map(function (n) { var r = n.icao === F.arr ? 'DEST' : (n.icao === F.dep ? 'DEP' : n.role); return r === n.role ? n : Object.assign({}, n, { role: r }); });
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
  /* v3.7 (pilot 10 + 11 NOV): the airfields in FOUR groups, in flight order -
     dep  = departure (+ a take-off alternate when the OFP has one);
     enr  = the key en-route airfields: the fewest airfields of the 1-hour chain that cover the route, plus the ETOPS airfields;
     arr  = destination and its alternates;
     rest = every other en-route airfield - shown only after the button is pressed.
     And the NAME of the airfield in small next to its code (weather block of the OFP, else the app's airport list; never guessed). */
  var NAMES = null, namesAsked = false;
  function nameOf(ic) {
    var w = (D.wx || []).filter(function (x) { return x.icao === ic && x.name; })[0]; if (w) return w.name;
    var f = (D.firs || []).filter(function (x) { return x.fir === ic; })[0]; if (f) return (f.name || '') + ' FIR';
    if (NAMES) return (NAMES[ic] && NAMES[ic][4]) || '';
    if (!namesAsked && typeof fetch === 'function') { namesAsked = true; fetch('./aptdb.json').then(function (r) { return r.json(); }).then(function (j) { NAMES = j; render(); if ($('dash-air')) dash(); }).catch(function () { NAMES = {}; }); }
    return '';
  }
  function nm(ic, cl) { var n = nameOf(ic); return n ? ' <small class="' + (cl || 'apnm') + '">' + esc(n) + '</small>' : ''; }
  function keyEnr() {   // greedy cover of 0..T with the chain windows (a..b = minutes this airfield is within 1 hour), + ETOPS
    var C = (D.chain || []).filter(function (c) { return c.a != null && c.b != null && c.cls !== 'CA'; }), key = {}, t = 0, guard = 0;
    while (t < T && guard++ < 40) {
      var best = null; C.forEach(function (c) { if (c.a <= t + 1 && c.b > t && (!best || c.b > best.b)) best = c; });
      if (!best) { var nx = null; C.forEach(function (c) { if (c.a > t && (!nx || c.a < nx.a)) nx = c; }); if (!nx) break; t = nx.a; continue; }
      key[best.icao] = 1; t = best.b;
    }
    C.forEach(function (c) { if (/ETOPS/i.test(c.note || '')) key[c.icao] = 1; });
    return key;
  }
  var GRP = null;
  function groups() {
    if (GRP) return GRP;
    var by = {}, ord = [], key = keyEnr(), win = {};
    (D.chain || []).forEach(function (c) { if (win[c.icao] == null) win[c.icao] = c.a; });
    function put(ic, role, w) { if (!/^[A-Z]{4}$/.test(ic || '')) return; if (!by[ic]) { by[ic] = { icao: ic, role: role, w: w }; ord.push(ic); } else { if (w && !by[ic].w) by[ic].w = w; if (ordRole(role) < ordRole(by[ic].role)) by[ic].role = role; } }
    (D.wx || []).forEach(function (w) { put(w.icao, w.role, w); });
    (D.notams || []).forEach(function (n) { put(n.icao, n.role, null); });
    var G = { dep: [], enr: [], arr: [], rest: [], of: {} };
    ord.forEach(function (ic) {
      var a = by[ic]; if (ic === F.dep) a.role = 'DEP'; else if (ic === F.arr) a.role = 'DEST';
      var g = a.role === 'DEP' || /T.?O.?\s*ALT|DEP.*ALT|TALT/i.test(a.role) ? 'dep' : (a.role === 'DEST' || a.role === 'ALTN' ? 'arr' : (a.role === 'ETOPS' || key[ic] ? 'enr' : 'rest'));
      G[g].push(a); G.of[ic] = g;
    });
    G.dep.sort(function (x, y) { return (x.role === 'DEP' ? 0 : 1) - (y.role === 'DEP' ? 0 : 1); });
    G.arr.sort(function (x, y) { return (x.role === 'DEST' ? 0 : 1) - (y.role === 'DEST' ? 0 : 1); });
    G.enr.sort(function (x, y) { return (win[x.icao] == null ? 1e9 : win[x.icao]) - (win[y.icao] == null ? 1e9 : win[y.icao]); });
    GRP = G; return G;
  }
  var GT = { dep: ['Departure', 'departure airfield' ], enr: ['En route – key airfields', 'the fewest 1-hour airfields that cover the route, and the ETOPS airfields'], arr: ['Arrival and alternates', 'destination, then its alternates'], rest: ['Other en-route airfields', 'all the others'] };
  function gIdx(ic, role) { var g = groups().of[ic]; if (!g) g = role === 'ENR' ? 'enr' : 'rest'; return { dep: 0, enr: 1, arr: 2, rest: 3 }[g]; }
  function tile(a, act_name) {
    var ns = all().filter(function (n) { return n.icao === a.icao && n.role !== 'ENR'; }), act_ = ns.filter(active), worst = act_.reduce(function (m, n) { return Math.max(m, cls(n)); }, 0), nn = act_.filter(function (n) { return isNew(n) || isShort(n); }).length;
    var ws = wxSev(a.w), fo = a.w ? W.focus(a.w) : null, cov = (D.chain || []).filter(function (c) { return c.icao === a.icao; })[0], anyT = false;
    if (ws == null && a.w && a.w.groups && a.w.groups.length) {   // an airfield with no planned time: the worst of the whole TAF
      anyT = true; var base_ = W.comp(a.w.groups[0].x); ws = W.sev(base_);
      a.w.groups.slice(1).forEach(function (g) { var sv_ = W.sev(g.t === 'FM' ? W.comp(g.x) : W.comp(g.x, base_)); ws = Math.max(ws, /PROB30/.test(g.t) ? Math.min(1, sv_) : sv_); });
    }
    return '<button type="button" class="wtile" data-act="' + (act_name || 'wn-apt') + '" data-icao="' + esc(a.icao) + '"><span class="wth"><b>' + esc(a.icao) + '</b><small>' + esc(a.role) + (fo && fo.at != null ? ' · ' + esc(W.hz(fo.at)) : '') + '</small></span>' +
      '<span class="wtnm">' + esc(nameOf(a.icao) || ' ') + '</span>' +
      (a.role === 'ENR' && cov ? '<span class="wtcv">1 h cover ' + esc(hm(cov.a)) + '–' + esc(hm(cov.b)) + '</span>' : '') +
      '<span class="wtw s' + (ws == null ? 'n' : ws) + '"><i></i>WX ' + (ws == null ? 'no TAF' : SVN[ws]) + (anyT ? ' <small class="wtany">whole TAF</small>' : '') + (a.w && a.w.taf_live ? ' <em>live</em>' : '') + '</span>' +
      '<span class="wtn s' + (act_.length ? worst : 'n') + '"><i></i>NOTAM ' + act_.length + (nn ? ' · ' + nn + ' new/short' : '') + '</span></button>';
  }
  function tiles(list, act_name) { return list.length ? '<div class="wtiles">' + list.map(function (a) { return tile(a, act_name); }).join('') + '</div>' : ''; }
  /* ---------- weather cards */
  function wxCard(w) {
    var fo = W.focus(w), sv = wxSev(w), op = ST.open['wx:' + w.icao];
    return '<details class="wnwx s' + (sv == null ? 'n' : sv) + '" data-wx="' + esc(w.icao) + '"' + (op ? ' open' : '') + '><summary><b>' + esc(w.icao) + '</b> <span class="wxnm">' + esc(w.name || '') + '</span><span class="tag">' + esc(w.role) + '</span>' +
      '<span class="wxsv s' + (sv == null ? 'n' : sv) + '">' + (sv == null ? 'no TAF' : SVN[sv]) + '</span><small>' + esc(fo.lab) + '</small></summary>' +
      (w.groups ? (w.taf_live ? '<p class="wxsrc">Timeline from the <b>live TAF</b> ' + esc(w.live_taf_t || '') + ' – the OFP TAF is below, unchanged.</p>' : '') + W.tafSvg(w, fo) + W.atTxt(w, fo.at) + (fo.at2 ? W.atTxt(w, fo.at2) : '') : '<p class="note">' + esc(w.taf || 'No TAF in the OFP.') + (window.FPOnline ? ' Tap <b>Update weather</b> at the top while you have internet.' : '') + '</p>') +
      (w.live_metar ? '<code class="wxraw live"><b>METAR LIVE ' + esc(w.live_metar_t || '') + '</b> ' + esc(w.live_metar) + '</code>' : '') +
      (w.live_taf ? '<code class="wxraw live"><b>TAF LIVE ' + esc(w.live_taf_t || '') + '</b> ' + esc(w.live_taf) + '</code>' : '') +
      (w.metar ? '<code class="wxraw"><b>METAR' + (w.live_metar ? ' (OFP)' : '') + '</b> ' + esc(w.metar) + '</code>' : '') +
      (w.taf ? '<code class="wxraw"><b>TAF' + (w.live_taf ? ' (OFP)' : '') + '</b> ' + esc(w.taf) + '</code>' : '') + '</details>';
  }
  function wxCards(list) { return list.filter(function (a) { return a.w; }).map(function (a) { return wxCard(a.w); }).join(''); }
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
      '<header><button type="button" class="wnt" data-act="wn-open" data-id="' + esc(n.id) + '" aria-expanded="' + (op ? 'true' : 'false') + '"><b class="wnap">' + esc(n.icao) + '</b>' + nm(n.icao, 'wnnm') + '<span class="wnid">' + esc(n.id) + '</span><span class="tag">' + esc(n.cat || '') + '</span>' +
      '<small class="wnv">' + esc(W.absTxt(n.a)) + ' – ' + (n.b == null ? esc(n.bt || 'UFN') : esc(W.absTxt(n.b))) + '</small></button>' +
      '<span class="wnb"><button type="button" class="icb wnpin' + (ST.pins[n.id] ? ' on' : '') + '" data-act="wn-pin" data-id="' + esc(n.id) + '" aria-label="Pin to top" aria-pressed="' + (ST.pins[n.id] ? 'true' : 'false') + '"><svg class="ic" aria-hidden="true"><use href="#i-pin"/></svg></button>' +
      '<button type="button" class="icb wnrd' + (rd ? ' on' : '') + '" data-act="wn-read" data-id="' + esc(n.id) + '" aria-label="Mark as read" aria-pressed="' + (rd ? 'true' : 'false') + '"><svg class="ic" aria-hidden="true"><use href="#i-check"/></svg></button></span></header>' +
      '<div class="wnbd">' + badges(n) + '</div>' +
      (note ? '<p class="wnnote"><b>In short:</b> ' + esc(note) + '</p>' : '') +
      '<p class="wnx' + (op ? '' : ' cut') + '">' + esc(op ? n.x : shortx) + '</p>' + (op || n.x.length <= 150 ? '' : '<button type="button" class="wnmore" data-act="wn-open" data-id="' + esc(n.id) + '">' + EYE + ' full text</button>') + '</article>';
  }
  function ntList() {
    var G = groups(), base = all().filter(function (n) { return ST.role === 'ALL' || n.role === ST.role; });
    var hid = base.filter(function (n) { return n.role !== 'ENR' && G.of[n.icao] === 'rest'; }).length;
    var L = base.filter(function (n) { return ST.more || ST.role !== 'ALL' || n.role === 'ENR' || G.of[n.icao] !== 'rest'; });
    if (ST.imp) L = L.filter(important);
    if (ST.act) L = L.filter(active);
    var total = base.length, pin = function (n) { return ST.pins[n.id] ? 1 : 0; };
    function apOrd(n) { var g = G.of[n.icao], li = g ? G[g].map(function (a) { return a.icao; }).indexOf(n.icao) : 99; return gIdx(n.icao, n.role) * 1000 + (n.role === 'ENR' ? 500 : 0) + li; }
    if (ST.sort === 'imp') L.sort(function (a, b) { return score(b) - score(a) || ordRole(a.role) - ordRole(b.role) || a.a - b.a; });
    else if (ST.sort === 'time') L.sort(function (a, b) { return pin(b) - pin(a) || b.a - a.a; });
    else L.sort(function (a, b) { return apOrd(a) - apOrd(b) || a.icao.localeCompare(b.icao) || score(b) - score(a); });
    var h = '<p class="sub wncount">' + L.length + ' of ' + total + ' NOTAMs shown' + (ST.imp ? ' – important, new or short ones' : '') + (ST.act ? ', active at your time' : '') + (ST.sort === 'imp' || ST.sort === 'time' ? '. Pinned first.' : ' – in flight order.') + '</p>';
    if (!L.length) h += '<p class="note">Nothing to show with these filters.</p>';
    var last = '', lastG = -1;
    L.forEach(function (n) {
      if (ST.sort === 'grp' || ST.sort === 'apt') {
        var gi = gIdx(n.icao, n.role);
        if (gi !== lastG) { lastG = gi; h += '<div class="wngh">' + esc(GT[['dep', 'enr', 'arr', 'rest'][gi]][0]) + '</div>'; }
        if (n.icao !== last) { last = n.icao; h += '<h3 class="shh">' + esc(n.icao) + nm(n.icao, 'shn') + ' <small>' + esc(n.role === 'ENR' ? 'EN ROUTE' : n.role) + '</small></h3>'; }
      }
      h += card(n);
    });
    if (hid && ST.role === 'ALL' && !ST.more) h += '<button type="button" class="cbtn wnmoreb" data-act="wn-more">Show the NOTAMs of the other en-route airfields (' + hid + ')</button>';
    return h;
  }
  function seg(items, key, act) { return '<div class="seg wnseg">' + items.map(function (t) { return '<button type="button" data-act="' + act + '" data-v="' + t[0] + '" class="' + (ST[key] === t[0] ? 'on' : '') + '">' + t[1] + '</button>'; }).join('') + '</div>'; }
  function crew() {
    var C = D.crew_alert || []; if (!C.length) return '';
    return '<details class="wncrew"' + (ST.open.crew ? ' open' : '') + '><summary><b>Company NOTAMs · crew alert</b> <small>' + C.length + ' in the dispatch briefing</small></summary>' + C.map(function (c) { return '<p><b>' + esc(c.id) + '</b> ' + esc(c.title || '') + '<br>' + esc(c.x) + '</p>'; }).join('') + '</details>';
  }
  function liveBar() {
    if (!window.FPOnline) return '';
    return '<div class="wnon"><button type="button" class="cbtn pri" data-act="wn-live">Update weather</button><small class="' + (window.FPOnline.old && window.FPOnline.old() ? 'old' : '') + '">' + esc(window.FPOnline.label()) + '</small></div>';
  }
  function grpBlock(g, opt) {
    var G = groups(), list = G[g]; if (!list.length) return '';
    return '<div class="bar wngb"><span>' + esc(GT[g][0]) + '</span><small>' + esc(GT[g][1]) + '</small></div>' + tiles(list) + '<div class="wnwxl">' + wxCards(list) + '</div>';
  }
  function render() {
    var host = $('wxnt'); if (!host) return;
    var y = window.scrollY, G = groups();
    host.innerHTML = '<h1 class="pt">Weather &amp; NOTAMs</h1><p class="sub">OFP weather and NOTAM bulletin of ' + esc(D.date || '') + ' · times at each airfield from your take-off time · the colours are a simple decode, check the minima and the full text yourself.</p>' +
      liveBar() + crew() +
      grpBlock('dep') + grpBlock('enr') + grpBlock('arr') +
      (G.rest.length ? '<button type="button" class="cbtn wnmoreb" data-act="wn-more" aria-expanded="' + (ST.more ? 'true' : 'false') + '">' + (ST.more ? 'Hide' : 'Show') + ' the other en-route airfields (' + G.rest.length + ')</button>' + (ST.more ? grpBlock('rest') : '') : '') +
      '<div class="bar"><span>NOTAMs</span><small>new · short duration · runway / ILS / GPS red · taxiways / navaids amber</small></div>' +
      '<div class="wnf">' + seg(ROLES, 'role', 'wn-role') +
      '<div class="seg wnseg"><button type="button" data-act="wn-imp" class="' + (ST.imp ? 'on' : '') + '">' + (ST.imp ? 'Important only' : 'Showing all') + '</button><button type="button" data-act="wn-act" class="' + (ST.act ? 'on' : '') + '">Active at my time</button></div>' +
      seg([['grp', 'Flight order'], ['imp', 'By importance'], ['time', 'Newest first']], 'sort', 'wn-sort') + '</div>' +
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
    else if (a === 'wn-more') ST.more = !ST.more;
    else if (a === 'wn-dashall') { ST.dashAll = !ST.dashAll; save(); dash(); return true; }
    else if (a === 'wn-live') { if (window.FPOnline) { b.disabled = true; b.textContent = 'Refreshing …'; window.FPOnline.refresh().then(function (r) { GRP = null; render(); if ($('dash-air')) dash(); if (A.toast) A.toast(r && r.msg ? r.msg : (window.FPOnline.state.err || 'No newer weather found.')); }).catch(function () { render(); if ($('dash-air')) dash(); }); } return true; }
    else if (a === 'wn-apt') { var ic = b.dataset.icao; if (groups().of[ic] === 'rest') ST.more = true; ST.open['wx:' + ic] = 1; save(); render(); var w = document.querySelector('.wnwx[data-wx="' + ic + '"]'); if (w) w.scrollIntoView({ behavior: 'smooth', block: 'start' }); return true; }
    else return false;
    save(); render(); return true;
  }
  // details open state (weather cards, crew alerts) remembered so a re-render does not close them
  document.addEventListener('toggle', function (ev) { var d = ev.target; if (!d.matches || !d.matches('#wxnt details')) return; var k = d.dataset.wx ? 'wx:' + d.dataset.wx : (d.classList.contains('wncrew') ? 'crew' : null); if (!k) return; if (d.open) ST.open[k] = 1; else delete ST.open[k]; save(); }, true);
  function dash() {   // v3.7 (pilot 10 NOV): DASH shows the DEPARTURE and the ARRIVAL airfield only; all the others open with the button
    var sec = $('v-dash'); if (!sec) return; var host = $('dash-air');
    if (!host) { host = document.createElement('div'); host.id = 'dash-air'; host.className = 'dashair'; var hero = sec.querySelector('.dhero'); if (hero && hero.parentNode) hero.parentNode.insertBefore(host, hero.nextSibling); else sec.insertBefore(host, sec.firstChild); }
    var G = groups(), two = G.dep.filter(function (a) { return a.role === 'DEP'; }).concat(G.arr.filter(function (a) { return a.role === 'DEST'; }));
    var oth = { dep: G.dep.filter(function (a) { return a.role !== 'DEP'; }), enr: G.enr, arr: G.arr.filter(function (a) { return a.role !== 'DEST'; }), rest: G.rest }, n = oth.dep.length + oth.enr.length + oth.arr.length + oth.rest.length;
    var h = '<div class="bar"><span>Airfields now</span><small>weather at your time · active NOTAMs · tap for the WX · NOTAM page</small></div>' + liveBar().replace('class="wnon"', 'class="wnon dsh"') + tiles(two, 'wn-dash') +
      (n ? '<button type="button" class="cbtn wnmoreb" data-act="wn-dashall" aria-expanded="' + (ST.dashAll ? 'true' : 'false') + '">' + (ST.dashAll ? 'Hide' : 'Show') + ' the other airfields (' + n + ') – alternates, ETOPS, en route</button>' : '') +
      (ST.dashAll ? [['dep', 'Take-off alternate'], ['arr', 'Alternates'], ['enr', GT.enr[0]], ['rest', GT.rest[0]]].map(function (q) { return oth[q[0]].length ? '<div class="wngh">' + esc(q[1]) + '</div>' + tiles(oth[q[0]], 'wn-dash') : ''; }).join('') : '');
    if (host._h !== h) { host._h = h; host.innerHTML = h; }
  }
  var _act = act;
  act = function (b) { if (b.dataset.act === 'wn-dash') { ST.role = 'ALL'; ST.sort = 'grp'; var ic = b.dataset.icao; if (groups().of[ic] === 'rest') ST.more = true; ST.open['wx:' + ic] = 1; save(); location.hash = 'wxnotam'; setTimeout(function () { render(); var w = document.querySelector('.wnwx[data-wx="' + ic + '"]'); if (w) w.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 120); return true; } return _act(b); };
  return { render: render, dash: dash, groups: groups, nameOf: nameOf, regroup: function () { GRP = null; }, act: function (b) { return act(b); }, cls: cls, isNew: isNew, isShort: isShort, active: active, important: important, all: all };
};
