/* fp_auto.js - Flight Prep 3.2: build a flight record (schema fpapp.flight.v1) from a parsed Lido OFP,
   in the app, with no network and no Claude. Everything here is taken from the OFP or computed from it
   (geometry, times, fuel arithmetic) plus the two shipped reference files: aptdb.json (airport positions,
   open data) and basemap.json (coastlines + FIR boundaries). Company material - CCI / AOI / CRAR / MEL /
   charts / comms tables - is NOT in here: it comes from a prep file or a library file, and the pages say so.
   window.FPAuto = { build(text, opts) -> Promise(record), buildSync(ofp, ref, opts) } */
(function () {
  var A = {};
  A.basemapUrl = './basemap.json';
  A.aptdbUrl = './aptdb.json';
  var cache = {};

  A.load = function (onprog) {
    if (cache.ref) return Promise.resolve(cache.ref);
    if (onprog) onprog('Loading the map and airport data …');
    return Promise.all([fetch(A.basemapUrl).then(function (r) { return r.json(); }), fetch(A.aptdbUrl).then(function (r) { return r.json(); })])
      .then(function (r) { cache.ref = { base: r[0], apt: r[1] }; return cache.ref; });
  };
  A.setRef = function (r) { cache.ref = r; };

  A.build = function (text, opts) {
    opts = opts || {};
    return A.load(opts.onprog).then(function (ref) {
      var ofp = (opts.ofp) || window.FPOfp.parse(text);
      return A.buildSync(ofp, ref, opts);
    });
  };

  /* ---------------------------------------------------------------- helpers */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function hm(m) { if (m == null) return '-'; m = Math.round(m); var s = m < 0 ? '-' : ''; m = Math.abs(m); return s + Math.floor(m / 60) + ':' + ('0' + (m % 60)).slice(-2); }
  function zt(m) { m = ((Math.round(m) % 1440) + 1440) % 1440; return ('0' + Math.floor(m / 60)).slice(-2) + ('0' + (m % 60)).slice(-2) + 'Z'; }
  function t1(kg) { return kg == null ? '-' : (kg / 1000).toFixed(1) + ' t'; }
  function rad(d) { return d * Math.PI / 180; }
  function gc(a, b) {   // great-circle distance in NM
    var p = rad(a[0]), q = rad(b[0]), dl = rad(b[1] - a[1]);
    return 3440.065 * Math.acos(Math.min(1, Math.sin(p) * Math.sin(q) + Math.cos(p) * Math.cos(q) * Math.cos(dl)));
  }
  function mid(a, b, f) {   // point along the great circle, fraction f
    var p1 = rad(a[0]), l1 = rad(a[1]), p2 = rad(b[0]), l2 = rad(b[1]);
    var d = 2 * Math.asin(Math.sqrt(Math.pow(Math.sin((p2 - p1) / 2), 2) + Math.cos(p1) * Math.cos(p2) * Math.pow(Math.sin((l2 - l1) / 2), 2)));
    if (!d) return [a[0], a[1]];
    var A1 = Math.sin((1 - f) * d) / Math.sin(d), B1 = Math.sin(f * d) / Math.sin(d);
    var x = A1 * Math.cos(p1) * Math.cos(l1) + B1 * Math.cos(p2) * Math.cos(l2);
    var y = A1 * Math.cos(p1) * Math.sin(l1) + B1 * Math.cos(p2) * Math.sin(l2);
    var z = A1 * Math.sin(p1) + B1 * Math.sin(p2);
    return [Math.atan2(z, Math.sqrt(x * x + y * y)) * 180 / Math.PI, Math.atan2(y, x) * 180 / Math.PI];
  }
  function inRing(pt, ring) {   // [lon,lat] ring, pt [lon,lat]
    var x = pt[0], y = pt[1], inside = false;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }
  function firOf(base, lat, lon) {   // the FIR a position is in; a non-oceanic FIR wins when they overlap
    var best = null;
    for (var i = 0; i < base.fir.length; i++) {
      var f = base.fir[i], g = f.geometry || f, polys = (g.type === 'MultiPolygon') ? g.coordinates : [g.coordinates];
      for (var p = 0; p < polys.length; p++) if (inRing([lon, lat], polys[p][0])) {
        var pr = f.properties || f;
        if (!best || String(pr.oceanic) === '0') best = pr;
      }
    }
    return best;
  }
  function firName(base, id) {
    for (var i = 0; i < base.fir.length; i++) { var f = base.fir[i], pr = f.properties || f; if (pr.id === id) return pr.name || ''; }
    return '';
  }
  function bbox(pts) {
    var b = [999, 999, -999, -999];
    pts.forEach(function (p) { b[0] = Math.min(b[0], p[1]); b[1] = Math.min(b[1], p[0]); b[2] = Math.max(b[2], p[1]); b[3] = Math.max(b[3], p[0]); });
    return b;   // [lonmin, latmin, lonmax, latmax]
  }
  function wxShort(w) {   // visibility or CAVOK out of the METAR (the report time is dropped first)
    if (!w) return '';
    var t = (w.metar || w.taf || '').replace(/\b\d{6}Z\b/g, ' ').replace(/\b\d{4}\/\d{4}\b/g, ' ');
    var m = /\b(CAVOK)\b/.exec(t) || /\b(\d{4})\b(?!KT)/.exec(t);
    return m ? m[1] : '';
  }

  /* ---------------------------------------------------------------- main */
  A.buildSync = function (O, ref, opts) {
    opts = opts || {};
    var base = ref.base, APT = ref.apt;
    var trip = O.trip_min == null ? 0 : O.trip_min;
    var extra = ((O.fuel.extra && O.fuel.extra.kg) || 0) + ((O.fuel.cont && O.fuel.cont.kg) || 0);
    var wp = O.nav.filter(function (n) { return n.t === 'WPT'; });
    var firnames = {};
    O.nav.forEach(function (n) { if (n.t === 'FIR') firnames[n.fir] = n.name; });
    O.rnotams.forEach(function (n) { if (!firnames[n.fir]) firnames[n.fir] = ''; });

    /* ---- FIR sequence: departure FIR from the boundary polygons, the rest from the OFP (FPL EET / navlog) */
    var depLL = APT[O.dep] ? [APT[O.dep][0], APT[O.dep][1]] : null;
    var arrLL = APT[O.dest] ? [APT[O.dest][0], APT[O.dest][1]] : null;
    var depF = depLL ? firOf(base, depLL[0], depLL[1]) : null;
    var depFir = depF ? depF.id : null;
    var firs = [];
    if (depFir) firs.push({ fir: depFir, name: firnames[depFir] || depF.name || '', eet_min: 0, cls: 'fir0' });
    var seq = O.fir_eet.slice();
    O.nav.forEach(function (n, i) {   // navlog markers give the order; the EET of the first waypoint after the marker
      if (n.t !== 'FIR') return;
      if (seq.filter(function (s) { return s.fir === n.fir; }).length) return;
      for (var j = i + 1; j < O.nav.length; j++) if (O.nav[j].t === 'WPT' && O.nav[j].eet != null) { seq.push({ fir: n.fir, min: O.nav[j].eet }); break; }
    });
    seq.sort(function (a, b) { return a.min - b.min; });
    seq.forEach(function (s) {
      if (firs.filter(function (f) { return f.fir === s.fir; }).length) return;
      firs.push({ fir: s.fir, name: firnames[s.fir] || firName(base, s.fir), eet_min: s.min, cls: 'fir' + (firs.length % 8) });
    });
    if (!firs.length) firs.push({ fir: '----', name: '', eet_min: 0, cls: 'fir0' });
    /* v3.5.1: the FIR sequence in time order WITH re-entries (EK348: WMFC - WIIF - WMFC - WIIF - WSJC). The flight-plan EET list
       is the time of each boundary; the navlog only prints a line near it, sometimes after the boundary waypoint. */
    var firseq = [];
    if (firs.length && firs[0].eet_min === 0) firseq.push(firs[0]);
    seq.forEach(function (s) {
      var u = firs.filter(function (f) { return f.fir === s.fir; })[0];
      var last = firseq[firseq.length - 1];
      if (last && last.fir === s.fir) return;
      firseq.push({ fir: s.fir, name: u ? u.name : (firnames[s.fir] || firName(base, s.fir)), eet_min: s.min, cls: u ? u.cls : 'fir0' });
    });
    if (!firseq.length) firseq = firs.slice();
    function segAt(e) { var c = 0; firseq.forEach(function (f, i) { if (f.eet_min <= e) c = i; }); return c; }
    function firAt(e) { return firseq[segAt(e)]; }

    /* ---- coordinates: wind-chart points, ETOPS points, airports; the rest interpolated by time */
    var CO = {}, k;
    for (k in O.coords) CO[k] = { ll: O.coords[k], src: 'ofp' };
    O.etops_pts.forEach(function (p) { if (p.lon != null) CO[p.id] = { ll: [p.lat, p.lon], src: 'ofp' }; });
    if (depLL) CO[O.dep] = { ll: depLL, src: 'apt' };
    if (arrLL) CO[O.dest] = { ll: arrLL, src: 'apt' };
    var pts = [];   // route points with time
    if (depLL) pts.push({ n: O.dep, e: 0, ll: depLL, src: 'apt', m: 0 });
    wp.forEach(function (w) {
      var nm = w.wpt.replace(/\/.*$/, '');
      var c = CO[nm] || CO[w.wpt];
      pts.push({ n: w.wpt, e: w.eet, ll: c ? c.ll : null, src: c ? c.src : null, m: 1, aw: w.aw, mora: w.mora, fmin: w.fplan });
    });
    if (arrLL && !(wp.length && wp[wp.length - 1].wpt.indexOf(O.dest) === 0)) pts.push({ n: O.dest, e: trip, ll: arrLL, src: 'apt', m: 0 });
    for (var i = 0; i < pts.length; i++) {   // interpolate the gaps
      if (pts[i].ll) continue;
      var a = null, b = null;
      for (var x = i - 1; x >= 0; x--) if (pts[x].ll) { a = pts[x]; break; }
      for (var y = i + 1; y < pts.length; y++) if (pts[y].ll) { b = pts[y]; break; }
      if (a && b && b.e != null && a.e != null && b.e > a.e && pts[i].e != null) {
        pts[i].ll = mid(a.ll, b.ll, (pts[i].e - a.e) / (b.e - a.e)); pts[i].src = 'interp';
      } else if (a) { pts[i].ll = a.ll; pts[i].src = 'interp'; }
      else if (b) { pts[i].ll = b.ll; pts[i].src = 'interp'; }
    }
    pts = pts.filter(function (p) { return p.ll; });

    /* ---- rows for the WAYPOINTS page */
    var rows = [], lastFir = (firs[0] || {}).fir || null, n = 0;   // the departure FIR is already on the stand row
    var dep_rwy = (O.route || '').match(new RegExp('^' + (O.dep || '....') + '\\/(\\S+)'));
    dep_rwy = dep_rwy ? dep_rwy[1] : null;
    var sid = (O.route || '').split(/\s+/)[1] || null;
    if (sid === 'DCT') sid = null;                            // v3.6: 'OMDB/30R DCT ANVIX' has no SID in the route string
    var arr_rwy = (O.route || '').match(new RegExp((O.dest || '....') + '\\/(\\S+)\\s*$'));
    arr_rwy = arr_rwy ? arr_rwy[1] : null;
    var f0 = firs[0];
    rows.push({ i: n++, eet: null, label: '-', wpt: 'Stand / taxi', fir: f0.fir, firname: f0.name, bnd: false,
      call: '<p class="note">No comms table loaded. The OFP has no frequencies - use the charts / AOI, or load a prep file.</p>',
      cpdlc: '', special: (O.fuel.taxi && O.fuel.taxi.min != null ? 'Taxi ' + O.fuel.taxi.min + ' min / ' + t1(O.fuel.taxi.kg) : '-'),
      threat: dep_rwy ? 'Planned RWY ' + esc(dep_rwy) + (sid ? ' · ' + esc(sid) : '') : '-', divert: '-', mora: null, fmin: null, fplan: null, fc: f0.cls });
    var lastSeg = 0, useEet = O.fir_eet && O.fir_eet.length > 0;
    function synRow(k) {   // a FIR with no waypoint of its own on the navlog: a row at the flight-plan time, so the comms change is not lost
      var f = firseq[k];
      rows.push({ i: n++, eet: f.eet_min, label: null, wpt: 'FIR boundary', fir: f.fir, firname: f.name, bnd: true, fir_eet: f.eet_min, syn: true,
        call: '<div class="cm"><div class="cmn">' + esc(f.fir) + ' ' + esc(f.name) + ' - no comms table loaded (OFP only).</div></div>',
        cpdlc: '', special: 'No waypoint in this FIR on the navlog - time from the flight-plan EET', threat: '-', divert: '-', mora: null, fmin: null, fplan: null, fc: f.cls });
    }
    wp.forEach(function (w) {
      var fr, bnd, sg = null;
      if (useEet && w.eet != null) {
        sg = segAt(w.eet);
        for (var q = lastSeg + 1; q < sg; q++) synRow(q);
        fr = firseq[sg]; bnd = sg !== lastSeg; lastSeg = sg;
      } else {
        fr = w.fir ? { fir: w.fir, name: w.firname || firnames[w.fir] || '', cls: (firs.filter(function (f) { return f.fir === w.fir; })[0] || f0).cls } : firAt(w.eet == null ? 0 : w.eet);
        bnd = fr.fir !== lastFir;
      }
      lastFir = fr.fir;
      var sp = [], th = [];
      O.etops_pts.forEach(function (p) { if (p.min === w.eet) sp.push('<b>ETOPS ' + (p.id.indexOf('ENTRY') === 0 ? 'entry' : 'exit') + '</b>' + (O.etops_min ? ' (' + O.etops_min + ' min rule)' : '')); });
      O.etps.forEach(function (p) {
        /* v3.6: the navlog row named after the point ('ETP1-2D') carries it; without such a row, the waypoint within a minute */
        var named = wp.some(function (x) { return x.wpt.indexOf(p.id) === 0; });
        if (named ? w.wpt.indexOf(p.id) !== 0 : Math.abs((p.min || -1) - (w.eet == null ? -99 : w.eet)) > 1) return;
        sp.push('<b>' + p.id + '</b> ' + hm(p.min) + ' → ' + esc(p.apt) + ': critical fuel <b>' + p.crit.toFixed(1) + ' t</b> vs ' + p.avail.toFixed(1) + ' t available');
        if (p.crit > p.avail) th.push('<b>' + p.id + ': critical fuel above the planned fuel</b> - check with dispatch');
      });
      if (w.mora != null && w.mora >= 8000) th.push('<b>MORA ' + w.mora + ' ft</b>');
      rows.push({ i: n++, eet: w.eet, label: null, wpt: w.wpt, fir: fr.fir, firname: fr.name, bnd: bnd, fir_eet: bnd && sg != null ? firseq[sg].eet_min : null,
        call: bnd ? '<div class="cm"><div class="cmn">' + esc(fr.fir) + ' ' + esc(fr.name) + ' - no comms table loaded (OFP only).</div></div>' : '',
        cpdlc: '', special: sp.join(' · ') || '-', threat: th.join(' · ') || '-', divert: '-',
        mora: w.mora, fmin: w.fplan, fplan: w.fplan == null ? null : Math.round((w.fplan + extra / 1000) * 10) / 10, fc: fr.cls, aw: w.aw || '' });
    });

    /* ---- v3.6: the area NOTAMs of the OFP on their rows - a block named after a waypoint on that waypoint, GNSS and security / conflict
       NOTAMs of a route FIR on the row where the FIR starts. 'on' = the block is a FIR or a waypoint of this route. */
    var onFir = {}, onWp = {}, doneF = {};
    firs.forEach(function (f) { onFir[f.fir] = 1; });
    wp.forEach(function (w) { onWp[w.wpt.replace(/\/.*$/, '')] = 1; });
    function blkToks(code) { return String(code).split(/[\/ ]/).filter(Boolean).map(function (x) { return onWp[x] ? x : x.slice(0, 5); }); }
    function blockOn(code) {
      if (onFir[code] || onWp[code]) return true;
      var m = /^([A-Z]{2}) [A-Z]\d+\/\d{2}$/.exec(code);                    // 'WI A4078/26': filed under the country prefix of a FIR
      if (m) return firs.some(function (f) { return f.fir.slice(0, 2) === m[1]; });
      if (/^[DRP]\d+[ \/]/.test(code)) return false;                         // 'D24 BARGAT AL HAGAT', 'R30/PEKANBARU': a danger / restricted area near an airport
      return blkToks(code).some(function (x) { return onWp[x]; });            // 'VAVIM/GESAXT636': an airway segment between two waypoints
    }
    O.rnotams.forEach(function (t) { t.on = blockOn(t.fir) || (t.sec === 'enr' && t.kind === 'conflict'); });   // a security warning Lido printed in the en-route section is never folded away
    function addTh(r, h) { r.threat = r.threat && r.threat !== '-' ? r.threat + ' · ' + h : h; }
    function idl(l) { return l.slice(0, 3).map(function (t) { return esc(t.id); }).join(', ') + (l.length > 3 ? ' +' + (l.length - 3) : ''); }
    rows.forEach(function (r) {
      var nm = String(r.wpt).replace(/\/.*$/, '');
      var wn = onFir[nm] || r.i === 0 ? [] : O.rnotams.filter(function (t) { return !t.rowed && !onFir[t.fir] && !/^[A-Z]{2} [A-Z]\d/.test(t.fir) && (t.fir === nm || blkToks(t.fir).indexOf(nm) >= 0); });
      if (wn.length) { wn.forEach(function (t) { t.rowed = 1; }); addTh(r, '<b>NOTAM ' + esc(wn[0].fir === nm ? 'at ' + nm : wn[0].fir) + '</b> ' + idl(wn) + ': ' + esc(wn[0].x.slice(0, 80)) + ' …'); }
      if ((r.bnd || r.i === 0) && !doneF[r.fir]) {
        doneF[r.fir] = 1;
        var g = O.rnotams.filter(function (t) { return t.fir === r.fir && t.kind === 'gnss'; }), c = O.rnotams.filter(function (t) { return t.fir === r.fir && t.kind === 'conflict'; });
        if (g.length) addTh(r, '<b>GNSS NOTAM</b> ' + idl(g) + ': ' + esc(g[0].x.slice(0, 70)) + ' …');
        if (c.length) addTh(r, '<b>Security / conflict NOTAM</b> ' + idl(c) + ' – WX · NOTAM page');
      }
    });

    /* ---- MORA, levels, events, deadlines */
    var mora = [];
    rows.forEach(function (r) { if (r.mora != null && r.eet != null) mora.push({ name: r.wpt, eet_min: r.eet, mora: r.mora }); });
    var maxm = mora.slice().sort(function (a, b) { return b.mora - a.mora; })[0] || null;
    var ev = [];
    var cruise = O.crz_fl ? (/FL(\d{3})/.exec(O.crz_fl) || [])[1] : null;
    var tocE = null;
    for (i = 0; i < wp.length; i++) if (wp[i].eet != null && /^(TOC|TOC\d)$/.test(wp[i].wpt)) { tocE = wp[i].eet; break; }
    if (tocE == null) { var f1 = wp.filter(function (w) { return w.eet != null; })[0]; tocE = f1 ? f1.eet : 0; }
    if (cruise) ev.push({ eet_min: tocE, kind: 'level', text: 'Cruise FL' + cruise });
    var ent = O.etops_pts.filter(function (p) { return p.id.indexOf('ENTRY') === 0; })[0];
    var exi = O.etops_pts.filter(function (p) { return p.id.indexOf('EXIT') === 0; })[0];
    if (ent) ev.push({ eet_min: ent.min, kind: 'etops', text: 'ETOPS entry' + (O.etops_apt[0] ? ' (' + O.etops_apt[0] + ')' : '') + (O.etops_min ? ' - ' + O.etops_min + ' min rule' : '') });
    O.etps.forEach(function (p) { ev.push({ eet_min: p.min, kind: 'etops', text: p.id + ' ' + hm(p.min) + ' → ' + p.apt + ' (critical fuel ' + p.crit.toFixed(1) + ' t, planned ' + p.avail.toFixed(1) + ' t)' }); });
    if (exi) ev.push({ eet_min: exi.min, kind: 'etops', text: 'ETOPS exit' + (O.etops_apt[1] ? ' (' + O.etops_apt[1] + ')' : '') });
    /* v3.6: PLND FL '330 ELSAR/350' - each step is a climb or a descent against the level before it, and it is written on its waypoint row */
    var steps = (O.plnd_fl || '').match(/([A-Z0-9]+)\/(\d{3})/g) || [];
    var lvl0 = parseInt(((O.plnd_fl || '').match(/^\s*(\d{3})\b/) || [])[1] || cruise || '0', 10);
    steps.forEach(function (st) {
      var p = st.split('/'), to = parseInt(p[1], 10), fe = null, up = lvl0 && to > lvl0;
      wp.forEach(function (w) { if (fe == null && w.wpt === p[0]) fe = w.eet; });
      ev.push({ eet_min: fe == null ? Math.max(0, trip - 40) : fe, kind: up ? 'level' : 'descent', text: (up ? 'Step climb' : 'Planned descent') + ' FL' + p[1] + ' at ' + p[0] + ' (OFP PLND FL)' });
      rows.forEach(function (r) {
        if (r.wpt !== p[0]) return;
        var tx = '<b>' + (up ? 'Step climb' : 'Descent') + ' FL' + p[1] + '</b> (OFP)';
        r.special = r.special && r.special !== '-' ? r.special + ' · ' + tx : tx;
      });
      lvl0 = to;
    });
    var tod = null;
    wp.forEach(function (w) { if (/^TOD/.test(w.wpt) && w.eet != null) tod = w.eet; });
    if (tod != null) ev.push({ eet_min: tod, kind: 'descent', text: 'TOD' + (arr_rwy ? ' - arrival ' + arr_rwy : '') });
    ev.push({ eet_min: trip, kind: 'landing', text: 'Landing ' + (O.dest || '') + (arr_rwy ? ' ' + arr_rwy : '') });
    ev.sort(function (a, b) { return a.eet_min - b.eet_min; });

    /* ---- diversion chain: nearest suitable airport over time, from the OFP's own airport list */
    var cand = {};
    function addc(icao, cls, note) {
      if (!icao || !APT[icao] || cand[icao]) return;
      cand[icao] = { icao: icao, cls: cls, note: note || '', ll: [APT[icao][0], APT[icao][1]] };
    }
    addc(O.dep, 'DEP', 'departure / return');
    addc(O.dest, 'DEST', 'destination');
    O.alts.forEach(function (a, ix) { addc(a.icao, 'ALTN', 'ALTN ' + (ix + 1) + ' · ' + a.nm + ' NM / ' + hm(a.min) + ' / ' + t1(a.kg)); });
    O.etops_apt.forEach(function (a) { addc(a, 'ETOPS', 'ETOPS weather-permissible'); });
    (O.ralt || []).forEach(function (a) { addc(a, 'ETOPS', 'RALT in the flight plan'); });
    O.wx.forEach(function (w) { if (w.role === 'ENR') addc(w.icao, 'ENR', 'enroute airport in the OFP weather list'); });
    var CA = [];
    for (k in cand) CA.push(cand[k]);
    var chain = [], cur = null;
    pts.forEach(function (p) {
      if (p.e == null) return;
      var bestA = null, bd = 1e9;
      CA.forEach(function (a) { var d = gc(p.ll, a.ll); if (d < bd) { bd = d; bestA = a; } });
      if (!bestA) return;
      if (cur && cur.icao === bestA.icao) { cur.b = p.e; if (bd < cur.nm) cur.nm = Math.round(bd); return; }
      cur = { icao: bestA.icao, cls: bestA.cls, a: cur ? cur.b : 0, b: p.e, note: bestA.note, nm: Math.round(bd) };
      chain.push(cur);
    });
    if (chain.length) chain[chain.length - 1].b = Math.max(chain[chain.length - 1].b, trip);
    chain.forEach(function (c) { var w = O.wx.filter(function (x) { return x.icao === c.icao; })[0]; c.wx = wxShort(w); });
    /* v3.6: the diversion column - the two nearest airports of the OFP's own list at each waypoint (great circle, NM). A distance, not a judgement. */
    var ptBy = {};
    pts.forEach(function (p) { if (p.e != null && ptBy[p.n + '@' + p.e] == null) ptBy[p.n + '@' + p.e] = p; });
    rows.forEach(function (r) {
      var p = r.eet == null ? null : ptBy[r.wpt + '@' + r.eet];
      if (!p || !CA.length) return;
      var near = CA.map(function (a) { return { icao: a.icao, nm: Math.round(gc(p.ll, a.ll)) }; }).sort(function (a, b) { return a.nm - b.nm; }).slice(0, 2);
      r.div2 = near;
      r.divert = near.map(function (a, i) { return (i ? '' : '<b>') + esc(a.icao) + (i ? '' : '</b>') + ' ' + a.nm; }).join(' / ');
    });

    /* ---- geography */
    var rbb = bbox(pts.map(function (p) { return p.ll; }));
    var crossed = {};
    firs.forEach(function (f) { crossed[f.fir] = 1; });
    var fir = [], firlab = [];
    base.fir.forEach(function (f) {
      var pr = f.properties || f, g = f.geometry || f, id = pr.id;
      var lb = [parseFloat(pr.label_lat), parseFloat(pr.label_lon)];
      var near = lb[0] > rbb[1] - 6 && lb[0] < rbb[3] + 6 && lb[1] > rbb[0] - 8 && lb[1] < rbb[2] + 8;
      if (!crossed[id] && !near) return;
      var polys = g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates], lines = [];
      polys.forEach(function (p) { p.forEach(function (rg) { lines.push(rg.map(function (c) { return [Math.round(c[0] * 1000) / 1000, Math.round(c[1] * 1000) / 1000]; })); }); });
      fir.push({ id: id, r: crossed[id] ? 1 : 0, lines: lines });
      if (!isNaN(lb[0])) firlab.push([id + (firnames[id] ? ' ' + firnames[id] : ''), lb[0], lb[1]]);
    });
    var PAL = ['#3d8fe0', '#d14fa0', '#2fa866', '#c99a1e', '#22a9b3', '#a8784a', '#7a7ae6', '#97a62a'];
    var apt = [], nr = 0;
    CA.forEach(function (a) {
      var ring = (a.cls === 'ALTN' || a.cls === 'DEST' || a.cls === 'DEP') ? 1 : 0;
      var w = O.wx.filter(function (x) { return x.icao === a.icao; })[0];
      apt.push({ icao: a.icao, lat: a.ll[0], lon: a.ll[1], lab: a.icao + (a.cls === 'DEST' ? ' D' : '') + (a.note ? ' - ' + a.note.replace(/ ·.*$/, '') : ''),
        ring: ring, et: a.cls === 'ETOPS' ? 1 : 0, col: ring ? PAL[(nr++) % PAL.length] : null, wx: wxShort(w) });
    });
    var route = pts.map(function (p) {
      return { n: p.n, lat: Math.round(p.ll[0] * 1e4) / 1e4, lon: Math.round(p.ll[1] * 1e4) / 1e4, e: p.e, m: p.m,
        note: (p.src === 'interp' ? 'position estimated between the OFP wind points' : ''), aw: p.aw || '' };
    });
    var etp = [];
    if (ent && ent.lon != null) etp.push({ lat: ent.lat, lon: ent.lon, e: ent.min, lab: 'ETOPS entry' + (O.etops_apt[0] ? ' (' + O.etops_apt[0] + ')' : ''), short: 'ETOPS entry ' + hm(ent.min) });
    if (exi && exi.lon != null) etp.push({ lat: exi.lat, lon: exi.lon, e: exi.min, lab: 'ETOPS exit' + (O.etops_apt[1] ? ' (' + O.etops_apt[1] + ')' : ''), short: 'ETOPS exit ' + hm(exi.min) });
    var acts = [], an = 0;
    firs.forEach(function (f) { acts.push({ n: ++an, e: f.eet_min, t: f.fir + (f.name ? ' ' + f.name : '') + ' FIR', x: 'FIR entry from the flight plan (EET ' + hm(f.eet_min) + '). No comms or regional table loaded for this FIR.', s: an % 2 ? 1 : -1 }); });
    if (ent) acts.push({ n: ++an, e: ent.min, t: 'ETOPS entry', x: 'ETOPS ' + (O.etops_min || '?') + ' min from ' + (O.etops_apt[0] || '?') + '. Weather-permissible: ' + (O.wx_perm || '-') + '.', s: an % 2 ? 1 : -1 });
    if (maxm) acts.push({ n: ++an, e: maxm.eet_min, t: 'Highest MORA ' + maxm.mora + ' ft', x: 'At ' + maxm.name + ' (' + hm(maxm.eet_min) + ') the OFP MORA is ' + maxm.mora + ' ft.', s: an % 2 ? 1 : -1 });
    var prof = { pts: [], mora: [] };
    if (cruise) prof.pts = [[0, 0], [tocE, parseInt(cruise, 10) * 100], [tod == null ? Math.max(tocE, trip - 25) : tod, parseInt(cruise, 10) * 100], [trip, 0]];
    for (i = 0; i < mora.length; i++) prof.mora.push([mora[i].eet_min, i + 1 < mora.length ? mora[i + 1].eet_min : trip, mora[i].mora]);
    var geo = { world: base.world, fir: fir, firlab: firlab, apt: apt, route: route, acts: acts, dp: [], etp: etp,
      etseg: (ent && exi) ? [[ent.min, exi.min]] : [], ifbp: { segs: [], polys: [] }, slop: {}, cpdlc: { segs: [] }, profile: prof };

    /* ---- NOTAM flags: new (started within 72 h of the flight) and short (less than 24 h) */
    var flags = {}, notes = {};
    O.notams.concat(O.rnotams).forEach(function (t) {
      var f = {};
      if (t.a != null && t.a > -4320 && t.a < 1440) f.new = 'started ' + (t.a < 0 ? Math.round(-t.a / 60) + ' h before the flight date' : 'on the flight date ' + zt(t.a));
      if (t.b != null && t.a != null && t.b - t.a <= 1440) f.short = 'valid ' + hm(t.b - t.a) + ' only';
      if (f.new || f.short) flags[t.id] = f;
    });

    /* ---- record */
    var dmap = { 0: 'SUN', 1: 'MON', 2: 'TUE', 3: 'WED', 4: 'THU', 5: 'FRI', 6: 'SAT' };
    var dow = O.date ? dmap[new Date(O.date + 'T00:00:00Z').getUTCDay()] : '';
    var ttl = (O.flt || O.csEK || 'FLIGHT') + ' ' + (O.dep_iata || O.dep) + '–' + (O.dest_iata || O.dest);
    var D = {
      /* the id ends in -auto so an auto-built flight never overwrites a prepared flight of the same day:
         both stay in FLIGHTS and you pick the one you want */
      flight: { id: (O.flt || 'FLT') + '-' + (O.date || '') + '-auto', flight: O.flt, callsign: O.csEK, dep: O.dep, arr: O.dest, dep_iata: O.dep_iata, arr_iata: O.dest_iata,
        to_plan: O.to, trip: trip, arr_off: null, std: O.std == null ? '' : ('0' + Math.floor(O.std / 60)).slice(-2) + ':' + ('0' + (O.std % 60)).slice(-2) },
      rows: rows, deadlines: [], events: ev, firs: firs, firseq: firseq, chain: chain, mora: mora, route: route.map(function (r) { return { n: r.n, e: r.e }; }),
      etops: (ent && exi) ? [ent.min, exi.min] : null,
      etops_info: (ent || O.etps.length) ? { rule_min: O.etops_min ? parseInt(O.etops_min, 10) : null,
        entry: ent ? { eet_min: ent.min, airport: O.etops_apt[0] || '' } : null, exit: exi ? { eet_min: exi.min, airport: O.etops_apt[1] || '' } : null,
        weather_permissible: O.etops_wx.map(function (w) { return { icao: w.icao, rwy: w.rwy, window_utc: zt(w.from).slice(0, 4) + '-' + zt(w.till).slice(0, 4), minima: w.min, forecast: w.fc + ' (OFP)', xwc_kt: w.xwc }; }),
        critical_fuel: O.etps.map(function (p) { return { at: p.id + ' ' + hm(p.min), to: p.apt, time: hm(p.div_min), reqd_t: p.crit, rem_t: p.avail }; }) } : null,
      fuel: { mindiv: Math.round((((O.fuel.altn && O.fuel.altn.kg) || 0) + ((O.fuel.frsv && O.fuel.frsv.kg) || 0)) / 10) / 100,
        dest_plan: (function () { var l = rows.filter(function (r) { return r.fplan != null; }); return l.length ? l[l.length - 1].fplan : 0; })() },
      geo: geo, comms_fir: {}, alts: O.alts.map(function (a) { return { icao: a.icao, rwy: a.rwy, nm: a.nm, min: a.min, kg: a.kg, route: a.route + ' FL' + a.fl }; }),
      date: O.date, levels: O.plnd_fl || '', satcom: [], nareas: [], rwy: { dep: dep_rwy, arr: arr_rwy },
      firproc: {}, firproc_src: '', mel: {}, mel_ofp: [], aptinfo: {}, divinfo: {}, divinfo_src: '', doclinks: null,
      wx: O.wx, notams: O.notams, rnotams: O.rnotams, crew_alert: O.crew_alert, dispatch: O.disp,
      notam_flags: flags, notam_notes: notes,
      apts: CA.map(function (a) { return { icao: a.icao, cls: a.cls, note: a.note }; }), ofp_route: O.route || '',
      auto: { built: new Date().toISOString().slice(0, 16).replace('T', ' ') + 'Z', ofp: O.ofpno, src: 'OFP ' + (O.ofpno || '') + ' read in the app', warn: O.warn, note: O.note || [],
        interp: route.filter(function (r) { return r.note; }).length }
    };
    var V = views(O, D, { dep_rwy: dep_rwy, arr_rwy: arr_rwy, sid: sid, extra: extra, maxm: maxm, cruise: cruise, dow: dow, pts: pts });
    return {
      schema: 'fpapp.flight.v1', id: D.flight.id, title: ttl + ' (OFP ' + (O.ofpno || '?') + ')', flight: O.flt, route: (O.dep_iata || '') + '-' + (O.dest_iata || ''),
      date: O.date, built_utc: D.auto.built, ofp: (O.ofpno || '?') + ' · auto (OFP read in the app)', min_app: '3.2.0',
      header: { callsign: O.csEK || '', fltxt: (O.flt || '') + ' ' + (O.dep_iata || '') + ' - ' + (O.dest_iata || ''), sub: (dow ? dow + ' ' : '') + (O.date || '') + ' · OFP ' + (O.ofpno || '?') + ' · auto' },
      planbanner: 'No take-off time set. Times use the planned T/O <b>' + (O.to == null ? '-' : zt(O.to)) + '</b> (STD + taxi). Tap <b>AIRBORNE NOW</b> at take-off, or type the time.',
      wpt_static: V.wpt_static, calls: '', fuel_sub: '', foot: 'Auto-built in the app from OFP ' + (O.ofpno || '?') + ' - the OFP, Emirates documentation and ATC prevail. No company tables (CCI / AOI / CRAR / MEL / charts) are included in an auto-built flight.',
      tabs: [['now', 'NOW', 'now'], ['dash', 'DASH', 'dash'], ['dep', 'DEPARTURE', 'dep'], ['waypoints', 'WAYPOINTS', 'enr'], ['tem', 'TEM', 'enr'], ['arr', 'ARRIVAL', 'arr'], ['route-map', 'MAP', 'map']],
      views: { dash: V.dash, dep: V.dep, tem: V.tem, arr: V.arr, 'route-map': V.map },
      data: D
    };
  };

  /* ---------------------------------------------------------------- generated pages */
  function tafTable(list, title, note) {
    if (!list.length) return '';
    var h = '<div class="bar"><span>' + esc(title) + '</span>' + (note ? '<small>' + esc(note) + '</small>' : '') + '</div><div class="tw"><table class="wx"><thead><tr><th>Airport</th><th>METAR / TAF (from the OFP)</th></tr></thead><tbody>';
    list.forEach(function (w) {
      h += '<tr><td><b>' + esc(w.icao) + '</b><br><small>' + esc(w.iata || '') + '</small></td><td>' +
        (w.metar ? '<b>METAR</b> ' + esc(w.metar) + '<br>' : '') + (w.taf ? '<b>TAF</b> ' + esc(w.taf) : '') + '</td></tr>';
    });
    return h + '</tbody></table></div>';
  }
  function ntBlock(list, title) {
    if (!list.length) return '';
    var byA = {}, order = [];
    list.forEach(function (t) { if (!byA[t.icao]) { byA[t.icao] = []; order.push(t.icao); } byA[t.icao].push(t); });
    var h = '<div class="bar"><span>' + esc(title) + '</span><small>' + list.length + ' NOTAMs from the OFP - full text on the WX · NOTAM page</small></div>';
    order.forEach(function (ic) {
      h += '<details class="omc"><summary><b>' + esc(ic) + '</b> - ' + byA[ic].length + ' NOTAMs</summary><ul class="gpl">';
      byA[ic].forEach(function (t) {
        h += '<li><b>' + esc(t.id) + '</b>' + (t.cat ? ' <small>' + esc(t.cat) + '</small>' : '') + ' – ' + esc(t.x.slice(0, 320)) + (t.x.length > 320 ? ' …' : '') + '</li>';
      });
      h += '</ul></details>';
    });
    return h;
  }
  /* v3.5.1: the SIGMETs of the OFP sorted by rule - which FIRs are on the route, and is the SIGMET valid while the flight is in that FIR.
     Times: planned take-off + the flight-plan EET of each FIR. The SIGMET area itself is not compared with the track. */
  function sigRoute(O, D) {
    var blocks = [], cur = null;
    String(O.sigmet || '').split('\n').forEach(function (l) {
      var m = /^\s*([A-Z]{4})\s+([A-Z][A-Z .'\/-]+?)\s+(?:OCEANIC\s+)?(?:FIR|UIR|FIR\/UIR|CTA|FIC)\s*$/.exec(l);
      if (m && !/SIGMET/.test(l)) { cur = { fir: m[1], name: m[2], lines: [] }; blocks.push(cur); return; }
      if (/^\s*[A-Z][A-Za-z ]+(SIGMETs|Advisory):\s*$/.test(l)) { cur = null; return; }
      if (cur) cur.lines.push(l);
    });
    var seq = D.firseq || D.firs || [], trip = (D.flight || {}).trip || 0, to = O.to, day = O.date ? +O.date.slice(8, 10) : null;
    function abs(ddhhmm) {
      if (day == null) return null;
      var off = +ddhhmm.slice(0, 2) - day; if (off < -15) off += 30; if (off > 15) off -= 30;
      return off * 1440 + (+ddhhmm.slice(2, 4)) * 60 + (+ddhhmm.slice(4, 6));
    }
    var on = [], off = [];
    blocks.forEach(function (b) {
      var text = b.lines.join('\n').replace(/\s+$/, ''); if (!text.trim()) return;
      var wins = [];
      seq.forEach(function (f, i) { if (f.fir === b.fir) wins.push([f.eet_min, i + 1 < seq.length ? seq[i + 1].eet_min : trip]); });
      var items = [], parts = text.split(/\n(?=\s*W[SCV]\s+SIGMET)/);
      parts.forEach(function (pt) {
        var m = /SIGMET\s+(\S+)\s+VALID\s+(\d{6})\/(\d{6})/.exec(pt); if (!m) return;
        var flat = pt.replace(/\s+/g, ' ');
        var ph = (flat.match(/\b(EMBD TSGR|EMBD TS|OBSC TSGR|OBSC TS|FRQ TSGR|FRQ TS|SQL TSGR|SQL TS|SEV TURB|SEV ICE|SEV MTW|HVY DS|HVY SS|VA ERUPTION|VA CLD|TC [A-Z]+|RDOACT CLD)\b/) || [''])[0];
        var top = (flat.match(/\bTOP (?:ABV )?FL\d{3}\b/) || [''])[0], mov = (flat.match(/\b(MOV [A-Z]{1,3}(?: \d{1,2}KT)?|STNR)\b/) || [''])[0];
        var a = abs(m[2]), z = abs(m[3]), act = null, near = null;
        if (to != null && a != null && wins.length) {
          act = wins.some(function (w) { return a <= to + w[1] && z >= to + w[0]; });
          if (!act) wins.forEach(function (w) {            // within an hour of the time in the FIR - a delay makes it valid
            var g = a > to + w[1] ? a - (to + w[1]) : (to + w[0]) - z;
            if (g >= 0 && g <= 60 && (near == null || g < near.g)) near = { g: g, after: a > to + w[1] };
          });
        }
        items.push({ id: m[1], from: m[2], to: m[3], ph: ph, top: top, mov: mov, active: act, near: near });
      });
      (wins.length ? on : off).push({ fir: b.fir, name: b.name, items: items, wins: wins, text: text });
    });
    return { on: on, off: off, n: blocks.length };
  }
  function cap(x) { return String(x || '').toLowerCase().replace(/\b[a-z]/g, function (c) { return c.toUpperCase(); }); }
  function zhm(ddhhmm) { return ddhhmm.slice(2, 6) + 'Z'; }
  function autoBar(O) {
    return '<div class="msg autobar" style="margin:0 0 10px"><b>Auto-built from OFP ' + esc(O.ofpno || '?') + '.</b> Everything on this page is taken from the OFP read in the app. ' +
      'No CCI / AOI / CRAR / MEL / charts and no comms tables - those come from a prep file or the libraries.</div>' +
      ((O.note || []).length ? '<div class="banner red"><b>Check this OFP by hand:</b> ' + (O.note || []).map(esc).join(' ') + '</div>' : '');
  }
  function views(O, D, X) {
    var V = {}, i;
    var dep = O.wx.filter(function (w) { return w.role === 'DEP'; });
    var dest = O.wx.filter(function (w) { return w.role === 'DEST'; });
    var altn = O.wx.filter(function (w) { return w.role === 'ALTN'; });
    var etw = O.wx.filter(function (w) { return w.role === 'ETOPS'; });
    var enr = O.wx.filter(function (w) { return w.role === 'ENR'; });
    var nt = function (role) { return O.notams.filter(function (t) { return t.role === role; }); };

    /* ---------- DASH */
    var h = '<div class="dhero"><div class="dhl"><h1><span class="fltno">' + esc(O.flt || '') + '</span> ' + esc(O.dep_iata || O.dep) + ' – ' + esc(O.dest_iata || O.dest) +
      '</h1><p class="sub">' + esc((X.dow ? X.dow + ' ' : '') + (O.date || '')) + ' · OFP ' + esc(O.ofpno || '?') + ' · auto-built in the app</p></div>' +
      '<div class="dac"><div class="dreg"><small>Registration</small><b>' + esc(O.reg_d || '-') + '</b><span>' + esc(O.type || '') + '</span></div>' +
      '<div class="dsel"><small>SELCAL</small><b>' + esc(O.sel || '-') + '</b></div></div></div>';
    h += '<div class="dtob"><div class="dtoc"><small>Take-off time</small><div id="dash-to"></div><p>Enter it once (UTC, HHMM) – the elapsed time, ETA, countdowns and the map on every page use it. Empty = plan (STD + taxi).</p></div>' +
      '<button type="button" class="ddiv" data-act="x-div"><svg class="ic" aria-hidden="true"><use href="#i-divert"/></svg>DIVERSION AIRPORTS</button></div>';
    h += '<div class="cells"><div class="cell cx"><span class="lab">STD · ' + esc(O.dep) + '</span><span class="big">' + (O.std == null ? '-' : zt(O.std)) + '</span>' +
      '<span class="sm">' + esc(O.dep_iata || '') + '</span>' + (X.dep_rwy ? '<span class="drp"><b>RWY ' + esc(X.dep_rwy) + '</b>' + (X.sid ? '<span>' + esc(X.sid) + '</span>' : '') + '</span>' : '') +
      '<span class="dsrc">filed in OFP ' + esc(O.ofpno || '') + ' – confirm on ATIS / clearance</span></div>' +
      '<div class="cell"><span class="lab">T/O</span><span class="big">~' + (O.to == null ? '-' : zt(O.to)) + '</span><span class="sm">taxi ' + (O.taxi_min == null ? '-' : O.taxi_min + ' min') + '</span></div>' +
      '<div class="cell cx"><span class="lab">ETA · ' + esc(O.dest) + '</span><span class="big">~' + (O.eta == null ? '-' : zt(O.eta)) + '</span><span class="sm">' + esc(O.dest_iata || '') + '</span>' +
      (X.arr_rwy ? '<span class="drp"><b>RWY ' + esc(X.arr_rwy) + '</b></span>' : '') + '<span class="dsrc">filed in OFP ' + esc(O.ofpno || '') + ' – confirm on ATIS / clearance</span></div>' +
      '<div class="cell"><span class="lab">TRIP</span><span class="big">' + hm(O.trip_min) + '</span><span class="sm">' + esc(O.crz_fl || '') + '</span></div>' +
      (O.alts[0] ? '<div class="cell"><span class="lab">ALTN</span><span class="big">' + esc(O.alts[0].icao) + ' ' + esc(O.alts[0].rwy) + '</span><span class="sm">' + O.alts[0].nm + ' NM / ' + hm(O.alts[0].min) + ' / ' + t1(O.alts[0].kg) + '</span></div>' : '') + '</div>';
    h += '<h2>Key numbers <small class="dh2s">OFP ' + esc(O.ofpno || '') + '</small></h2><div class="nums">' +
      num('T/O fuel', O.fuel.tof ? t1(O.fuel.tof.kg) : '-') + num('Trip', O.fuel.trip ? t1(O.fuel.trip.kg) : '-') +
      num('MIN DIV' + (O.alts[0] ? ' (' + O.alts[0].icao + ')' : ''), D.fuel.mindiv.toFixed(2) + ' t') +
      num('EXTRA + CONT', (X.extra / 1000).toFixed(1) + ' t') +
      num('ETOW / MTOW', ((O.wts.ETOW || 0) / 1000).toFixed(1) + ' / ' + ((O.wts.MTOW || 0) / 1000).toFixed(1) + ' t') +
      num('ELW / MLW', ((O.wts.ELWT || 0) / 1000).toFixed(1) + ' / ' + ((O.wts.MLWT || 0) / 1000).toFixed(1) + ' t') +
      num('Max MORA', X.maxm ? X.maxm.mora + ' ft ' + X.maxm.name + ' (' + hm(X.maxm.eet_min) + ')' : '-') +
      num('ETOPS', O.etops_min ? O.etops_min + ' min' : 'not ETOPS') + '</div>';
    /* rule-based highlights, each with where it comes from */
    var hi = [];
    O.etps.forEach(function (p) { if (p.crit > p.avail) hi.push([p.id + ' critical fuel', 'Critical fuel ' + p.crit.toFixed(1) + ' t is above the planned ' + p.avail.toFixed(1) + ' t at ' + hm(p.min), 'waypoints']); });
    var sig = tafFlags(dep[0], O.to), sig2 = tafFlags(dest[0], O.eta);
    if (sig) hi.push([(O.dep_iata || O.dep) + ' at take-off', sig, 'dep']);
    if (sig2) hi.push([(O.dest_iata || O.dest) + ' at the ETA', sig2, 'arr']);
    altn.concat(etw).forEach(function (w) {
      var s = tafFlags(w, w.role === 'ETOPS' ? O.to : O.eta);
      if (s) hi.push([w.icao + ' (' + (w.role === 'ETOPS' ? 'ETOPS' : 'alternate') + ')', s, 'tem']);
    });
    if (X.maxm && X.maxm.mora >= 8000) hi.push(['Terrain', 'MORA ' + X.maxm.mora + ' ft at ' + X.maxm.name + ' (' + hm(X.maxm.eet_min) + ')', 'waypoints']);
    var SG = sigRoute(O, D), sgAct = 0;
    SG.on.forEach(function (b) {
      var act = b.items.filter(function (i) { return i.active || i.near; }); if (!act.length) return; sgAct++;
      hi.push(['SIGMET ' + b.fir, cap(b.name) + ': ' + act.map(function (i) { return [i.ph, i.top, i.mov].filter(Boolean).join(' ') + ' (valid ' + zhm(i.from) + '-' + zhm(i.to) + (i.active ? '' : ', ' + i.near.g + ' min ' + (i.near.after ? 'after you leave' : 'before you enter')) + ')'; }).join('; ') +
        ' – you are in this FIR ' + b.wins.map(function (w) { return zt(O.to + w[0]) + '-' + zt(O.to + w[1]); }).join(' and '), 'tem']);
    });
    if (O.sigmet && !sgAct && (SG.on.length || SG.off.length)) hi.push(['SIGMET', 'None valid for the FIRs on your route at your times (' + (SG.on.length + SG.off.length) + ' FIRs with SIGMETs in the OFP)', 'tem']);
    else if (O.sigmet && !SG.n) hi.push(['SIGMET', O.sigmet.replace(/\s+/g, ' ').slice(0, 200), 'tem']);
    var nn = Object.keys(D.notam_flags).length;
    if (nn) hi.push(['NOTAMs', nn + ' NOTAMs are new or short-duration - see the WX · NOTAM page', 'wxnotam']);
    O.rnotams.forEach(function (t) { if (t.on && (t.kind === 'conflict' || t.kind === 'gnss')) hi.push([(t.kind === 'gnss' ? 'GNSS ' : 'Enroute ') + t.fir, t.x.slice(0, 150), 'wxnotam']); });   // v3.6: only FIRs / points of this route
    (O.crew_alert || []).slice(0, 3).forEach(function (c) {
      hi.push(['Crew alert ' + c.id, (c.title.replace(/^COMPANY NOTAM\s*-\s*/i, '') + (c.x ? ' – ' + c.x : '')).slice(0, 150), 'dep']);
    });
    if ((O.crew_alert || []).length > 3) hi.push(['Crew alerts', (O.crew_alert.length - 3) + ' more company NOTAMs in the dispatch briefing', 'dep']);
    h += '<h2>From the OFP <small class="dh2s">rule-based, not a judgement</small></h2><ul class="dthr">';
    if (!hi.length) h += '<li><span class="dtx">Nothing flagged by the rules: no crew alert, no new or short NOTAM, no critical-fuel shortfall, no significant forecast at take-off or ETA.</span></li>';
    var GOL = { wxnotam: 'WX · NOTAM', waypoints: 'WPTS', dep: 'DEP', arr: 'ARR', tem: 'TEM', 'route-map': 'MAP' };
    /* v3.6: nothing is cut off silently - up to 16 lines, then a line that says how many more there are */
    hi.slice(0, 16).forEach(function (x) { h += '<li><b class="dtag">' + esc(x[0]) + '</b><span class="dtx">' + esc(x[1]) + '</span><a class="dgo" href="#' + x[2] + '">' + esc(GOL[x[2]] || x[2].toUpperCase()) + ' ›</a></li>'; });
    if (hi.length > 16) h += '<li><b class="dtag">More</b><span class="dtx">' + (hi.length - 16) + ' more flags: ' + esc(hi.slice(16).map(function (x) { return x[0]; }).join(', ')) + '</span><a class="dgo" href="#tem">TEM ›</a></li>';
    h += '</ul><!--cov-->' + autoBar(O);   // v3.6: FPLib puts the coverage block at the marker
    V.dash = h;

    /* ---------- DEPARTURE */
    h = '<h1 class="pt">Departure – ' + esc(O.dep) + ' ' + esc((dep[0] && dep[0].name) || '') + '</h1>' + autoBar(O);
    h += '<div class="cells"><div class="cell"><span class="lab">STD</span><span class="big">' + (O.std == null ? '-' : zt(O.std)) + '</span></div>' +
      '<div class="cell"><span class="lab">RWY (filed)</span><span class="big">' + esc(X.dep_rwy || '-') + '</span><span class="sm">' + esc(X.sid || '') + '</span></div>' +
      '<div class="cell"><span class="lab">Taxi</span><span class="big">' + (O.taxi_min == null ? '-' : O.taxi_min + ' min') + '</span><span class="sm">' + (O.fuel.taxi ? t1(O.fuel.taxi.kg) : '') + '</span></div>' +
      '<div class="cell"><span class="lab">ETOW</span><span class="big">' + ((O.wts.ETOW || 0) / 1000).toFixed(1) + ' t</span><span class="sm">MTOW ' + ((O.wts.MTOW || 0) / 1000).toFixed(1) + ' t</span></div></div>';
    h += '<div class="bar"><span>Route as filed</span><small>OFP ' + esc(O.ofpno || '') + '</small></div><p class="rt">' + esc(O.route || '-') + '</p>';
    h += tafTable(dep, 'Departure weather', 'OFP weather section');
    h += ntBlock(nt('DEP'), 'Departure NOTAMs');
    if (O.crew_alert && O.crew_alert.length) {
      h += '<div class="bar"><span>Crew alert (company NOTAMs in the OFP)</span></div><ul class="gpl">';
      O.crew_alert.forEach(function (c) { h += '<li><b>' + esc(c.id) + '</b> ' + esc(c.title) + (c.x ? ' – ' + esc(c.x) : '') + '</li>'; });
      h += '</ul>';
    }
    if (O.dispatch) h += '<p class="note">Dispatch: <b>' + esc(O.dispatch.name) + '</b> · ' + esc(O.dispatch.tel) + ' (OFP).</p>';
    V.dep = h;

    /* ---------- ARRIVAL */
    h = '<h1 class="pt">Arrival – ' + esc(O.dest) + ' ' + esc((dest[0] && dest[0].name) || '') + '</h1>' + autoBar(O);
    h += '<div class="cells"><div class="cell"><span class="lab">ETA</span><span class="big">' + (O.eta == null ? '-' : zt(O.eta)) + '</span><span class="sm">STA ' + (O.sta == null ? '-' : zt(O.sta)) + '</span></div>' +
      '<div class="cell"><span class="lab">RWY (filed)</span><span class="big">' + esc(X.arr_rwy || '-') + '</span></div>' +
      '<div class="cell"><span class="lab">ELW</span><span class="big">' + ((O.wts.ELWT || 0) / 1000).toFixed(1) + ' t</span><span class="sm">MLW ' + ((O.wts.MLWT || 0) / 1000).toFixed(1) + ' t</span></div>' +
      '<div class="cell"><span class="lab">Fuel at ' + esc(O.dest) + '</span><span class="big">' + D.fuel.dest_plan.toFixed(1) + ' t</span><span class="sm">MIN DIV ' + D.fuel.mindiv.toFixed(2) + ' t</span></div></div>';
    h += '<div class="bar"><span>Planned descent</span><small>OFP PLND FL</small></div><p class="rt">' + esc(O.plnd_fl || '-') + '</p>';
    h += tafTable(dest, 'Destination weather', 'OFP weather section');
    h += '<div class="bar"><span>Destination alternates</span><small>OFP</small></div><div class="tw"><table><thead><tr><th>ALTN</th><th>RWY</th><th>NM</th><th>FL</th><th>Time</th><th>Fuel</th><th>Routing</th></tr></thead><tbody>';
    O.alts.forEach(function (a) { h += '<tr><td><b>' + esc(a.icao) + '</b></td><td>' + esc(a.rwy) + '</td><td>' + a.nm + '</td><td>' + esc(a.fl) + '</td><td>' + hm(a.min) + '</td><td>' + t1(a.kg) + '</td><td><small>' + esc(a.route) + '</small></td></tr>'; });
    h += '</tbody></table></div>';
    h += tafTable(altn, 'Alternate weather', 'OFP weather section');
    h += ntBlock(nt('DEST'), 'Destination NOTAMs') + ntBlock(nt('ALTN'), 'Alternate NOTAMs');
    V.arr = h;

    /* ---------- TEM (facts only: what the OFP says, organised) */
    h = '<h1 class="pt">Threats from the OFP</h1>' + autoBar(O) + '<!--rp-->';   // v3.6: route-pack threat / mitigation blocks go here
    h += tafTable(dep.concat(dest), 'Weather at departure and destination', 'OFP weather section');
    if (etw.length) h += tafTable(etw, 'ETOPS airports', 'weather-permissible airports in the OFP');
    if (O.etops_wx.length) {
      h += '<div class="bar"><span>ETOPS weather-permissible conditions</span><small>OFP table</small></div><div class="tw"><table><thead><tr><th>Airport</th><th>RWY</th><th>Window (UTC)</th><th>Minima</th><th>Forecast</th><th>XWC</th></tr></thead><tbody>';
      O.etops_wx.forEach(function (w) { h += '<tr><td><b>' + esc(w.icao) + '</b></td><td>' + esc(w.rwy) + '</td><td>' + zt(w.from).slice(0, 4) + ' - ' + zt(w.till).slice(0, 4) + '</td><td>' + esc(w.min) + '</td><td>' + esc(w.fc) + '</td><td>' + w.xwc + '</td></tr>'; });
      h += '</tbody></table></div>';
    }
    if (O.etps.length) {
      h += '<div class="bar"><span>Equal-time points and critical fuel</span><small>OFP ETOPS pages</small></div><div class="tw"><table><thead><tr><th>ETP</th><th>At</th><th>To</th><th>Diversion</th><th>Critical</th><th>Planned</th><th></th></tr></thead><tbody>';
      O.etps.forEach(function (p) {
        h += '<tr><td><b>' + esc(p.id) + '</b></td><td>' + hm(p.min) + '</td><td>' + esc(p.apt) + '</td><td>' + hm(p.div_min) + '</td><td>' + p.crit.toFixed(1) + ' t</td><td>' + p.avail.toFixed(1) + ' t</td><td>' +
          (p.crit > p.avail ? '<b class="bad">below plan</b>' : 'ok') + '</td></tr>';
      });
      h += '</tbody></table></div>';
    }
    if (D.mora.length) {
      var top = D.mora.slice().sort(function (a, b) { return b.mora - a.mora; }).slice(0, 6);
      h += '<div class="bar"><span>Highest MORA on the route</span><small>OFP navlog</small></div><ul class="gpl">';
      top.forEach(function (m) { h += '<li><b>' + m.mora + ' ft</b> at ' + esc(m.name) + ' (' + hm(m.eet_min) + ')</li>'; });
      h += '</ul>';
    }
    if (O.rnotams.length) {
      /* v3.6: every area section of the bulletin; the FIRs and points of this route first, the rest folded away */
      var SECN = { dep: 'around departure', enr: 'en route', altn: 'to the alternates', dest: 'around destination' };
      var rli = function (t) { return '<li><b>' + esc(t.fir) + ' ' + esc(t.id) + '</b>' + (t.kind === 'conflict' || t.kind === 'gnss' ? ' <b class="bad">' + t.kind + '</b>' : (t.kind === 'airspace' ? ' <small>(routine airspace reservation)</small>' : '')) + ' – ' + esc(t.x.slice(0, 300)) + (t.x.length > 300 ? ' …' : '') + '</li>'; };
      var onL = O.rnotams.filter(function (t) { return t.on; }), offL = O.rnotams.filter(function (t) { return !t.on; });
      h += '<div class="bar"><span>Area NOTAMs on your route</span><small>' + onL.length + ' of ' + O.rnotams.length + ' in the OFP area sections – by FIR or waypoint block</small></div>';
      if (onL.length) {
        var seenB = {}, ordB = [];
        onL.forEach(function (t) { if (!seenB[t.fir]) { seenB[t.fir] = []; ordB.push(t.fir); } seenB[t.fir].push(t); });
        ordB.forEach(function (b) {
          var l = seenB[b], flag = l.filter(function (t) { return t.kind === 'conflict' || t.kind === 'gnss'; }).length;
          h += '<details class="omc"' + (flag ? ' open' : '') + '><summary><b>' + esc(b) + '</b> ' + esc(cap(l[0].name || '')) + ' – ' + l.length + ' NOTAM' + (l.length === 1 ? '' : 's') + ' <small>(' + esc(SECN[l[0].sec] || '') + ')</small>' +
            (flag ? ' <b class="bad">' + flag + ' GNSS / security</b>' : '') + '</summary><ul class="gpl">' + l.map(rli).join('') + '</ul></details>';
        });
      } else h += '<p class="note">None of the area NOTAM blocks is a FIR or a waypoint of this route.</p>';
      if (offL.length) {
        var cnt = {}; offL.forEach(function (t) { cnt[t.fir] = (cnt[t.fir] || 0) + 1; });
        h += '<details class="omc"><summary><b>Area NOTAMs for FIRs / points not on your route</b> <small>' + Object.keys(cnt).map(function (k) { return esc(k) + ' ' + cnt[k]; }).join(', ') + '</small></summary><ul class="gpl">' + offL.map(rli).join('') + '</ul></details>';
      }
    }
    var SG2 = sigRoute(O, D);
    if (SG2.on.length) {
      h += '<div class="bar"><span>SIGMET on your route</span><small>by FIR and time (planned take-off + flight-plan EET) - the area is not compared with your track</small></div>' +
        '<div class="tw"><table><thead><tr><th>FIR</th><th>You are there</th><th>SIGMET</th><th>Valid</th><th>At your time</th></tr></thead><tbody>';
      SG2.on.forEach(function (b) {
        var win = O.to == null ? '-' : b.wins.map(function (w) { return zt(O.to + w[0]) + '-' + zt(O.to + w[1]); }).join(', ');
        b.items.forEach(function (i, k) {
          h += '<tr><td>' + (k ? '' : '<b>' + esc(b.fir) + '</b> ' + esc(cap(b.name))) + '</td><td>' + (k ? '' : win) + '</td><td>' + esc(i.id) + ' <b>' + esc([i.ph, i.top].filter(Boolean).join(' ')) + '</b> ' + esc(i.mov) +
            '</td><td>' + zhm(i.from) + '-' + zhm(i.to) + '</td><td class="' + (i.active ? 'bad' : i.near ? 'warn' : 'ok') + '">' + (i.active == null ? '?' : i.active ? 'VALID' : i.near ? 'starts / ends ' + i.near.g + ' min ' + (i.near.after ? 'after you leave' : 'before you enter') : 'not at your time') + '</td></tr>';
        });
      });
      h += '</tbody></table></div>';
      SG2.on.forEach(function (b) { h += '<details class="omc"><summary><b>' + esc(b.fir) + ' ' + esc(cap(b.name)) + '</b> - full text</summary><pre class="pre">' + esc(b.text) + '</pre></details>'; });
    }
    if (SG2.off.length) h += '<details class="omc"><summary><b>SIGMETs for FIRs not on your route</b> <small>' + SG2.off.map(function (b) { return esc(b.fir); }).join(', ') + '</small></summary><pre class="pre">' +
      esc(SG2.off.map(function (b) { return b.fir + ' ' + b.name + ' FIR\n' + b.text; }).join('\n\n')) + '</pre></details>';
    if ((O.sigmet || O.airmet) && !SG2.n) h += '<div class="bar"><span>SIGMET / AIRMET in the OFP</span></div><pre class="pre">' + esc(((O.sigmet || '') + '\n' + (O.airmet || '')).trim()) + '</pre>';
    else if (O.airmet) h += '<div class="bar"><span>AIRMET in the OFP</span></div><pre class="pre">' + esc(O.airmet.trim()) + '</pre>';
    if (O.impacts.length) {
      h += '<div class="bar"><span>Operational impacts</span><small>OFP</small></div><div class="tw"><table><thead><tr><th>Change</th><th></th><th>Burn</th><th>Time</th></tr></thead><tbody>';
      O.impacts.forEach(function (x) { h += '<tr><td>' + esc(x.grp || '') + '</td><td>' + esc(x.dir + ' ' + x.amt) + '</td><td>' + (x.burn == null ? '-' : (x.bs === 'M' ? '−' : '+') + x.burn + ' kg') + '</td><td>' + (x.time == null ? '-' : (x.ts === 'M' ? '−' : '+') + hm(x.time)) + '</td></tr>'; });
      h += '</tbody></table></div>';
    }
    if (O.remarks) h += '<div class="bar"><span>OFP remarks</span></div><pre class="pre">' + esc(O.remarks.replace(/\n{2,}/g, '\n')) + '</pre>';
    V.tem = h;

    /* ---------- MAP */
    V.map = '<h1 class="pt">Route map</h1><p class="sub">Drag to turn the Earth, pinch or double-tap to zoom, tap any symbol for details. ✈ = planned position from the OFP EETs and your T/O time (LIVE), or any time you pick on the slider (PREVIEW). It is not a GPS position.</p>' +
      '<div id="globe" class="globe"></div><p class="note">Auto-built from OFP ' + esc(O.ofpno || '?') + ': route points and EETs from the navlog, positions from the OFP wind charts' +
      (D.auto.interp ? ' (' + D.auto.interp + ' points estimated between them)' : '') + ', airports from the open airport data shipped with the app. ' +
      'FIR lines from the map data; route FIRs bold. Coastlines: Natural Earth. No company areas (IFBP, special areas) in an auto-built flight.</p>';

    /* ---------- WAYPOINTS page header block */
    V.wpt_static = '<details class="omc"><summary><b>Auto-built waypoints</b> – times, MORA and minimum fuel are the OFP navlog; ' +
      (D.auto.interp ? D.auto.interp + ' positions on the map are estimated between the OFP wind points; ' : '') +
      'there are no comms or special-area notes in an auto-built flight (no CCI / AOI / CRAR / RSI loaded). The diversion column is the two nearest airports of the OFP list with the distance in NM - not a suitability check.</summary>' +
      '<div class="tw"><table><thead><tr><th>FIR</th><th>From the flight plan</th></tr></thead><tbody>' +
      D.firs.map(function (f) { return '<tr><td><b>' + esc(f.fir) + '</b> ' + esc(f.name) + '</td><td>entry ' + hm(f.eet_min) + '</td></tr>'; }).join('') +
      '</tbody></table></div><p class="allf">Load a prep file (Claude) or the regulations library to get the comms order, CPDLC logon times, special areas and diversion notes on these rows.</p></details>';
    return V;
  }
  function num(l, v) { return '<div class="num"><span class="lab">' + esc(l) + '</span><span class="val">' + esc(v) + '</span></div>'; }
  /* significant forecast for a time (minutes from 00Z of the flight date): thunderstorms, low visibility, strong wind */
  function tafFlags(w, utcMin) {
    if (!w || !w.groups || utcMin == null) return '';
    var out = [];
    w.groups.forEach(function (g) {
      if (g.a == null || g.b == null) return;
      if (utcMin + 60 < g.a || utcMin - 60 > g.b) return;
      var x = g.x || '', f = [];
      if (/TS|CB/.test(x)) f.push('thunderstorm');
      if (/\+RA|\+SN|GR|SQ/.test(x)) f.push('heavy precipitation');
      var v = /(?:^|\s)(\d{4})(?:\s|$)/.exec(x);
      if (v && +v[1] <= 3000) f.push('visibility ' + v[1] + ' m');
      var wd = /(\d{3})(\d{2})(?:G(\d{2}))?KT/.exec(x);
      if (wd && (+wd[2] >= 25 || (wd[3] && +wd[3] >= 35))) f.push('wind ' + wd[0]);
      if (/FG|FZ/.test(x)) f.push('fog / freezing');
      if (f.length) out.push(g.t + ' ' + zt(g.a).slice(0, 4) + '/' + zt(g.b).slice(0, 4) + ': ' + f.join(', '));
    });
    return out.join(' · ');
  }

  if (typeof window !== 'undefined') window.FPAuto = A;
  if (typeof module !== 'undefined' && module.exports) module.exports = A;
})();
