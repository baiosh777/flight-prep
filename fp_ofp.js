/* fp_ofp.js - Flight Prep 3.2: read a Lido OFP PDF in the app and parse it.
   No network, no server: pdf.js turns the PDF into layout-preserving text, then the same rules the
   Python build chain used are applied here. Nothing is invented - a value the OFP does not have stays null.
   window.FPOfp = { pdfText(file, onprog), parse(text), hm, ddFromLido } */
(function () {
  var F = {};
  F.pdfjsUrl = './pdf.min.mjs';
  F.workerUrl = './pdf.worker.min.mjs';

  /* ---------------------------------------------------------------- 1. PDF -> text (layout) */
  F.pdfText = async function (data, onprog) {
    var pdfjs = await import(F.pdfjsUrl);
    if (pdfjs.GlobalWorkerOptions) pdfjs.GlobalWorkerOptions.workerSrc = (typeof document !== 'undefined' ? new URL(F.workerUrl, document.baseURI).href : F.workerUrl);
    var buf = data instanceof ArrayBuffer ? data : await data.arrayBuffer();
    var doc = await pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
    var n = doc.numPages, pages = [], i;
    for (i = 1; i <= n; i++) {
      var pg = await doc.getPage(i);
      var tc = await pg.getTextContent();
      pages.push(tc.items.filter(function (t) { return t.str && t.str.length; }).map(function (t) {
        return { x: t.transform[4], y: t.transform[5], s: t.str, w: t.width || 0 };
      }));
      if (pg.cleanup) pg.cleanup();
      if (onprog) onprog(i, n);
    }
    if (doc.destroy) try { await doc.destroy(); } catch (e) {}
    return F.layout(pages);
  };

  /* items (per page) -> text. The OFP body is monospace: the dominant character advance gives the
     column grid, so x/cw reproduces the printed columns (indentation included, which the NOTAM and
     weather sections need). A vertical gap bigger than a line and a half becomes a blank line. */
  F.layout = function (pages) {
    var cnt = {}, cw = 7.2, best = 0, x0 = 1e9, k, p, it, w;
    for (p = 0; p < pages.length; p++) for (var j = 0; j < pages[p].length; j++) {
      it = pages[p][j];
      if (!it.w || !it.s.trim()) continue;
      w = Math.round((it.w / it.s.length) * 10) / 10;
      cnt[w] = (cnt[w] || 0) + it.s.length;
    }
    for (k in cnt) if (cnt[k] > best) { best = cnt[k]; cw = parseFloat(k); }
    /* v3.5.1: the left margin is where most lines START, not the left-most item of the whole document - one stray item
       further left (a chart page, a stamp) used to push every line of the OFP to the right and the readers then found nothing */
    var starts = {}, bestN = 0, rowMin, rk;
    for (p = 0; p < pages.length; p++) {
      rowMin = {};
      for (j = 0; j < pages[p].length; j++) {
        it = pages[p][j]; if (!it.s.trim()) continue;
        rk = Math.round(it.y / 3) * 3;
        if (rowMin[rk] == null || it.x < rowMin[rk]) rowMin[rk] = it.x;
      }
      for (rk in rowMin) { k = Math.round(rowMin[rk]); starts[k] = (starts[k] || 0) + 1; }
    }
    for (k in starts) if (starts[k] > bestN || (starts[k] === bestN && parseFloat(k) < x0)) { bestN = starts[k]; x0 = parseFloat(k); }
    if (x0 > 1e8) x0 = 0;
    var out = [];
    for (p = 0; p < pages.length; p++) {
      var rows = {}, keys = [];
      for (j = 0; j < pages[p].length; j++) {
        it = pages[p][j];
        var key = Math.round(it.y / 3) * 3;
        if (!rows[key]) { rows[key] = []; keys.push(key); }
        rows[key].push(it);
      }
      keys.sort(function (a, b) { return b - a; });
      var prev = null;
      for (var q = 0; q < keys.length; q++) {
        var cells = rows[keys[q]].slice().sort(function (a, b) { return a.x - b.x; });
        if (prev !== null && prev - keys[q] > 18) out.push('');
        prev = keys[q];
        var line = '';
        for (var c = 0; c < cells.length; c++) {
          var col = Math.max(0, Math.round((cells[c].x - x0) / cw));
          if (col > line.length) line += new Array(col - line.length + 1).join(' ');
          line += cells[c].s;
        }
        out.push(line.replace(/\s+$/, ''));
      }
      out.push('');
    }
    return out.join('\n');
  };

  /* ---------------------------------------------------------------- helpers */
  function hm(s) { return s ? parseInt(s.slice(0, 2), 10) * 60 + parseInt(s.slice(2), 10) : null; }
  F.hm = hm;
  function hmdot(h, m) { return parseInt(h, 10) * 60 + parseInt(m, 10); }
  function g(rx, s, f, grp) { var m = rx.exec(s); if (!m) return null; var v = m[grp || 1]; return f ? f(v) : v; }
  function num(v) { return v == null ? null : parseInt(v, 10); }
  function flt(v) { return v == null ? null : parseFloat(v); }
  var MON = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };
  var PAGE = /^\s*Page \d+ of \d+\s*$|^\s*[A-Z0-9]+\/\d{2}[A-Za-z]{3}\d{2}\/[A-Z]{3}-[A-Z]{3} .*OFP:.*$/;
  function ddLido(s) { // N0930.3 / E06921.3 -> degrees
    var h = s[0], v = s.slice(1), d = parseInt(v.slice(0, v.length - 4), 10), m = parseFloat(v.slice(v.length - 4));
    var x = d + m / 60; return (h === 'S' || h === 'W') ? -x : x;
  }
  F.ddFromLido = ddLido;

  /* ---------------------------------------------------------------- 2. parse */
  F.parse = function (text) {
    var T = text.replace(/\r/g, ''), L = T.split('\n');
    var CL = L.filter(function (l) { return !PAGE.test(l); });   // page furniture removed
    var C = CL.join('\n');
    var O = { warn: [], note: [] };

    /* --- identity */
    O.hdr = g(/^\s*([A-Z0-9]+\/\d\d[A-Za-z]{3}\d\d\/[A-Z]{3}-[A-Z]{3} \S+ OFP:\S+)/m, T);
    var dm = /([A-Z0-9]+)\/(\d\d)([A-Za-z]{3})(\d\d)\/([A-Z]{3})-([A-Z]{3})/.exec(O.hdr || '');
    O.cs = dm ? dm[1] : g(/\(FPL-(\w+)-/, C);
    O.csEK = (O.cs || '').replace(/^UAE/, 'EK');
    if (dm) {
      O.day = parseInt(dm[2], 10); O.mon = MON[dm[3].toUpperCase()]; O.yr = 2000 + parseInt(dm[4], 10);
      O.date = O.yr + '-' + ('0' + O.mon).slice(-2) + '-' + ('0' + O.day).slice(-2);
    }
    O.flt = g(/^(EK\d+)\s+\d\d[A-Z]{3}\s+[A-Z]{4}\//m, C) || g(/^([A-Z]{2}\d+)\s+\d\d[A-Z]{3}\s+[A-Z]{4}\//m, C);
    O.dofs = g(/^[A-Z]{2}\d+\s+(\d\d[A-Z]{3})\s/m, C);
    var ad = /([A-Z]{4})\/([A-Z]{3})-([A-Z]{4})\/([A-Z]{3})/.exec(C);
    if (ad) { O.dep = ad[1]; O.dep_iata = ad[2]; O.dest = ad[3]; O.dest_iata = ad[4]; }
    O.type = g(/[A-Z]{4}\/[A-Z]{3}-[A-Z]{4}\/[A-Z]{3}\s+(\S+)/, C);
    O.reg = g(/REG\/(\w+)/, C);
    O.reg_d = O.reg ? O.reg.slice(0, 2) + '-' + O.reg.slice(2) : null;
    O.ofpno = g(/OFP:(\d+\/\d+\/\d+)/, C);
    O.sel = g(/SEL\/(\w+)/, C);
    O.std = O.dep ? g(new RegExp('-' + O.dep + '(\\d{4})'), C.replace(/\s+/g, ' '), hm) : null;
    if (O.std == null) O.std = g(/^\s*DEP\s+(\d{4})/m, C, hm) || g(/\bDEP\s+(\d{4})\s/, C, hm);
    O.sta = g(/\bARR\s+(\d{4})\s/, C, hm);
    O.plnd_fl = g(/PLND FL:\s*(.*)/, C);
    O.cid = g(/\bCID\s+(\d+)/, C, num);
    O.crz = g(/\bCRZ\s{2,}(\S+)/, C);
    O.crz_fl = g(/CRZ FL\/TEMP\s+(\S+)/, C);
    O.gnd_dist = g(/GND DIST\s+(\d+)/, C, num);
    O.air_dist = g(/AIR DIST\s+(\d+)/, C, num);
    O.wxprog = g(/WX PROG:\s*(\d+ - \d+)/, C);

    /* route string: the line(s) between ATC CLRNC and PLND FL (the label differs per station) */
    O.route = null;
    for (var i = 0; i < CL.length; i++) {
      if (/^E\/MFT\/R\s*:|^[A-Z0-9\/]{3,14}\s*:\s*[A-Z]{4}\/\S+\s/.test(CL[i])) {   // v3.6: any label ('E/MTT/R :', 'DXBSINPCI6:') in front of DEP/RWY
        var parts = [CL[i].replace(/^[^:]*:\s*/, '')];
        for (var j = i + 1; j < CL.length && j < i + 6; j++) {
          if (!CL[j].trim() || /^[A-Z][A-Z /-]*:/.test(CL[j])) break;
          parts.push(CL[j].trim());
        }
        O.route = parts.join(' ').replace(/\s+/g, ' ').trim(); break;
      }
    }

    /* --- fuel / weights */
    /* each entry: [key, regex, group of the tag (0 = none), group of the fuel in kg, group of the time HHMM (0 = none)] */
    var FU = [['trip', /^TRIP\s+(\w{4})\s+(\d+)\s+(\d{4})/m, 1, 2, 3], ['cont', /^CONT\s+(\S+)\s+(\d+)\s+(\d{4})/m, 1, 2, 3],
      ['altn', /^ALTN\s+(\w{4})\s+(\d+)\s+(\d{4})/m, 1, 2, 3], ['frsv', /^FRSV\s+(\d+)\s+(\d{4})/m, 0, 1, 2],
      ['addl', /^ADDNL\s*(\w*)\s+(\d+)\s+(\d{4})/m, 1, 2, 3], ['extra', /^EXTRA\s+(\w+)\s+(\d+)\s+(\d{4})/m, 1, 2, 3],
      ['tof', /^T\/O FUEL\s+(\d+)/m, 0, 1, 0], ['taxi', /^TAXI\s+(\d+)\s+(\d{4})/m, 0, 1, 2]];
    O.fuel = {};
    for (i = 0; i < FU.length; i++) {
      var m = FU[i][1].exec(C);
      if (!m) { O.fuel[FU[i][0]] = null; continue; }
      O.fuel[FU[i][0]] = { tag: FU[i][2] ? (m[FU[i][2]] || null) : null, kg: num(m[FU[i][3]]), min: FU[i][4] ? hm(m[FU[i][4]]) : null };
    }
    O.fuel.ramp = g(/^RAMP FUEL\s+([\d.]+)/m, C, flt);
    O.taxi_min = O.fuel.taxi ? O.fuel.taxi.min : null;
    O.trip_min = O.fuel.trip ? O.fuel.trip.min : null;
    O.to = (O.std != null && O.taxi_min != null) ? (O.std + O.taxi_min) % 1440 : O.std;
    O.eta = (O.to != null && O.trip_min != null) ? (O.to + O.trip_min) % 1440 : null;
    O.wts = {};
    ['EZFW', 'MZFW', 'ETOW', 'MTOW', 'ELWT', 'MLWT'].forEach(function (k) { O.wts[k] = g(new RegExp(k + '\\s+(\\d+)'), C, num); });
    O.dd_tow = g(/VALID FOR TAKEOFF WEIGHT UP TO (\d+)/, C, num);
    O.etops_min = g(/- ETOPS (\d+) MINS/, C) || g(/ETOPS\s+(\d{2,3})\s+MIN/, C);
    O.wx_perm = g(/WEATHER-PERMISSIBLE AIRPORTS (\S+)/, C);
    O.disp = (function () {
      var mm = /DISP:\s*(\S+)\s+TEL:\s*(\d[\d ]*\d)/.exec(C.replace(/\n/g, ' '));
      return mm ? { name: mm[1].charAt(0) + mm[1].slice(1).toLowerCase(), tel: mm[2].trim() } : null;
    })();
    O.impacts = [];
    var irx = /(ZFW CHANGE|FL CHANGE|SPD CHANGE)?\s+(UP|DN|CI)\s*([\d.]+\s*\w*)\s+(?:BURN\s+([PM])\s*(\d+)\s+TIME\s+([PM])\s*(\d{4})|NOT AVAILABLE)/g, im;
    while ((im = irx.exec(C))) O.impacts.push({ grp: im[1] || null, dir: im[2], amt: (im[3] || '').trim(), bs: im[4] || null, burn: num(im[5]), ts: im[6] || null, time: im[7] ? hm(im[7]) : null });
    O.statcont = [];
    var srx = /^CONT (\d+)\s+(\d+)\s+(\d{4})/gm;
    while ((im = srx.exec(C))) O.statcont.push({ pct: num(im[1]), kg: num(im[2]), min: hm(im[3]) });
    O.remarks = g(/DRIFTDOWN PROCEDURES ARE VALID[^\n]*\n([\s\S]*?)\nETOPS INFORMATION/, C);

    /* --- destination alternates */
    O.alts = [];
    var am = /DEST ALTN DIST[^\n]*\n([\s\S]*?)\n\s*\n/.exec(C);
    if (am) am[1].split('\n').forEach(function (l) {
      var a = /^(\w{4})\/(\w+)\s+(\d{4})\s+(\d{3})\s+(\d{3})\s+(\w+)\s+(\d{4})\s+(\d+)\s*(.*)$/.exec(l.trim());
      if (a) O.alts.push({ icao: a[1], rwy: a[2], nm: num(a[3]), trk: a[4], fl: a[5], comp: a[6], min: hm(a[7]), kg: num(a[8]), route: (a[9] || '').trim() });
      else if (O.alts.length && l.trim()) O.alts[O.alts.length - 1].route += ' ' + l.trim();
    });

    /* --- FPL block: FIR EETs, RALT, DOF */
    var flat = C.replace(/\s+/g, ' ');
    O.fir_eet = [];
    var eet = g(/EET\/(.*?)(?:SEL\/|REG\/|RALT\/|$)/, flat);
    if (eet) { var erx = /\b([A-Z]{4})(\d{4})\b/g; while ((im = erx.exec(eet))) O.fir_eet.push({ fir: im[1], min: hm(im[2]) }); }
    O.ralt = (g(/RALT\/([A-Z ]+?)\s+(?:RMK|DOF|SEL|REG|$)/, flat) || '').trim().split(/\s+/).filter(function (x) { return /^[A-Z]{4}$/.test(x); });

    /* --- ETOPS */
    O.etops_pts = [];
    var prx = /^(ENTRY\d|EXIT\d)\s+([NS]\d+\.\d)\s+([EW]\d+\.\d)\s+\S+\s+(\d)\.(\d\d)/gm;
    while ((im = prx.exec(C))) O.etops_pts.push({ id: im[1], min: hmdot(im[4], im[5]), lat: ddLido(im[2]), lon: ddLido(im[3]) });
    var prx2 = /^(ENTRY\d|EXIT\d)\s+(\d)\.(\d\d)\s+([NS]\d+\.\d)/gm;   // the critical-point table: time + latitude only
    while ((im = prx2.exec(C))) {
      var ex = O.etops_pts.filter(function (p) { return p.id === im[1]; })[0];
      if (!ex) O.etops_pts.push({ id: im[1], min: hmdot(im[2], im[3]), lat: ddLido(im[4]), lon: null });
      else if (ex.min == null) ex.min = hmdot(im[2], im[3]);
    }
    O.etops_apt = [];
    var arx = /^([A-Z]{4})\s+LAT\/LONG\s+ATD/gm; while ((im = arx.exec(C))) O.etops_apt.push(im[1]);
    O.etps = [];
    var trx = /^(ETP\d)\s+(\d)\.(\d\d)\s+([NS]\d+\.\d)\s+(\w{4})\s+(\d+)\s+(\d+)\s+(\d)\.(\d\d)\s+(\d+)\s+([\d.]+)\s+([\d.]+)/gm;
    while ((im = trx.exec(C))) O.etps.push({ id: im[1], min: hmdot(im[2], im[3]), lat: ddLido(im[4]), apt: im[5], mora: num(im[6]) * 100, fl: num(im[7]),
      div_min: hmdot(im[8], im[9]), crit: flt(im[11]), avail: flt(im[12]) });
    O.etops_wx = [];
    var wrx = /^([A-Z]{4})\/(\w+)\s+(\d{4})\s+(\d{4})\s+(\S+)\s+(\S+)\s+([\d.]+)\s*$/gm;
    while ((im = wrx.exec(C))) O.etops_wx.push({ icao: im[1], rwy: im[2], from: hm(im[3]), till: hm(im[4]), min: im[5], fc: im[6], xwc: flt(im[7]) });

    /* --- navlog: waypoint rows, MORA, min fuel, planned fuel, FIR boundaries, airway */
    var NAV = [], fir = null, firname = null, aw = null, inNav = false;
    for (i = 0; i < L.length; i++) {
      var l = L[i], st = l.trim();
      if (/^AWY\s+TRM\s+DIST|^WPT\s+ITT/.test(st)) inNav = true;
      var b = /^-{5,}\s*(.+?) FIR\/(\w{4})-{5,}/.exec(st);
      if (b) { fir = b[2]; firname = b[1].replace(/\w\S*/g, function (w) { return w.charAt(0) + w.slice(1).toLowerCase(); }); NAV.push({ t: 'FIR', fir: fir, name: firname }); continue; }
      if (/ROUTE TO DESTINATION ALTERNATE/.test(l)) break;
      if (!inNav) continue;
      if (!/\.{4}\s+\.{4}/.test(l)) {   // only the airway line of a navlog pair can set the airway
        var aM = /^([A-Z]{1,2}\d{2,4}|DCT|[A-Z]{2,7})\s{2,}[=+]?\s*\d{3}\s+\d{1,4}\s/.exec(l);
        if (aM && /^(DCT|[A-Z]{1,2}\d{1,4}|[A-Z]{4,7})$/.test(aM[1])) aw = aM[1];
        continue;
      }
      /* the waypoint line: '<WPT> ... <EET> .... .... <MINR>'. The cheap test above keeps this regex off
         every other line of the OFP (it backtracks badly on long NOTAM text). */
      var w2 = /^([A-Z0-9_-]{2,11}(?:\/\d\d\w?)?)\s+[+=]?\s*(?:\d{3})?\s+(\S*\/\S*)?\s+(\d+)?\s+(?:[PM]\d{3})?\s*(?:\d+)?\s+(\d{4})\s+\.{4}\s+\.{4}\s+([\d.]+)/.exec(l);
      if (w2) NAV.push({ t: 'WPT', wpt: w2[1], eet: hm(w2[4]), mora: w2[3] ? parseInt(w2[3], 10) * 100 : null, fplan: flt(w2[5]), fir: fir, firname: firname, aw: aw });
    }
    O.nav = NAV;
    O.toc_fl = [];
    var crx = /^\S+\s+\d{3}\s+\d{3}\s+\S+\s+(\d{3})\s+\d{3}/gm; while ((im = crx.exec(C))) O.toc_fl.push(im[1]);

    /* --- coordinates (wind chart blocks: names row, latitude row, longitude row) */
    O.coords = {};
    for (i = 0; i < L.length - 2; i++) {
      var la = [], lo = [], x;
      var lrx = /[NS]\d{4}\.\d/g, orx = /[EW]\d{5}\.\d/g;
      while ((x = lrx.exec(L[i + 1]))) la.push({ p: x.index, v: x[0] });
      while ((x = orx.exec(L[i + 2]))) lo.push({ p: x.index, v: x[0] });
      if (!la.length || la.length !== lo.length) continue;
      var nm = [], nrx = /\S+/g; while ((x = nrx.exec(L[i]))) nm.push({ p: x.index, v: x[0] });
      for (var q2 = 0; q2 < la.length; q2++) {
        var cand = nm.filter(function (n) { return Math.abs(n.p - la[q2].p) <= 3 && /^[A-Z][A-Z0-9]{1,6}$/.test(n.v); });
        var name = cand.length ? cand[0].v : null;
        if (!name) continue;
        if (!O.coords[name]) O.coords[name] = [Math.round(ddLido(la[q2].v) * 1e4) / 1e4, Math.round(ddLido(lo[q2].v) * 1e4) / 1e4];
      }
    }

    /* --- weather, NOTAMs, crew alert */
    var d0 = O.day || null, date0 = O.date ? Date.UTC(O.yr, O.mon - 1, O.day) : null;
    O.wx = weather(CL, d0);
    var chk = { read: 0 };
    O.notams = notams(CL, date0, chk);
    O.rnotams = rnotams(CL, date0, chk);
    /* v3.6: every NOTAM header line of the bulletin must have been taken by one of the two parsers - otherwise say so */
    O.ntcheck = { hdr: 0, read: chk.read, unknown: [] };
    sections(CL).forEach(function (S) {
      var n = 0; for (var q = S.start; q < S.end; q++) if (NOTAM_HDR.test(CL[q].trim())) n++;
      if (SECT[S.title] || AREA_SEC[S.title]) O.ntcheck.hdr += n; else if (n) O.ntcheck.unknown.push(S.title + ' (' + n + ')');
    });
    O.crew_alert = crewAlert(CL);
    O.sigmet = section(CL, /^SIGMETs:/, /^[A-Z][A-Za-z]+s:|^AIRPORTLIST|^DEPARTURE AIRPORT/);
    O.airmet = section(CL, /^AIRMETs:/, /^[A-Z][A-Za-z]+s:|^AIRPORTLIST|^DEPARTURE AIRPORT/);

    if (T.replace(/\s/g, '').length < 500) O.warn.push('This PDF has almost no text - it looks like a scan or a photo. The app can only read a Lido OFP PDF saved from the briefing system.');
    else if (!O.nav.filter(function (n) { return n.t === 'WPT'; }).length) O.warn.push('The navlog was not read (no waypoints found) - the flight cannot be built from this file. If it is a Lido OFP, send it to Claude: the reader needs fixing.');
    /* v3.5.1: say loudly what was not read instead of building a page with holes */
    if (!O.fuel || !O.fuel.trip) O.note.push('FUEL BLOCK NOT READ - no fuel figures on any page.');
    if (!O.wx || !O.wx.length) O.note.push('WEATHER SECTION NOT READ - no METAR / TAF from this OFP.');
    if (!O.flt) O.note.push('Flight number not read from the header.');
    if (!O.alts || !O.alts.length) O.note.push('No alternates read.');
    if (date0 != null && O.ntcheck.hdr !== O.ntcheck.read) O.note.push('NOTAM BULLETIN: ' + O.ntcheck.hdr + ' NOTAMs printed, ' + O.ntcheck.read + ' read - ' + Math.abs(O.ntcheck.hdr - O.ntcheck.read) + ' not filed under an airport or FIR. Read the bulletin in the OFP.');
    if (O.ntcheck.unknown.length) O.note.push('NOTAM section(s) the app does not know: ' + O.ntcheck.unknown.join(', ') + ' - read them in the OFP.');
    if (!O.route) O.note.push('ROUTE STRING NOT READ (the line after ATC CLRNC) - runway, SID and the route comparison are missing.');
    if (!O.fir_eet || !O.fir_eet.length) O.note.push('No FIR times (EET/) read from the flight plan - FIR boundaries follow the navlog lines and may be late.');
    if (!O.dep || !O.dest) O.warn.push('Departure / destination not found.');
    if (!O.date) O.note.push('No flight date in the header - NOTAM and TAF times cannot be placed on the timeline.');
    if (!O.coords || !Object.keys(O.coords).length) O.note.push('No wind-chart coordinates found - all map positions are estimated from the times.');
    return O;
  };

  function section(L, start, end) {
    var i = L.findIndex(function (l) { return start.test(l.trim()); });
    if (i < 0) return null;
    var out = [];
    for (var j = i + 1; j < L.length; j++) {
      var s = L[j].trim();
      if (end.test(s) && s) break;
      if (/^(No Wx data available|NIL|NO DATA( AVAILABLE)?)$/i.test(s)) continue;   // the empty-section filler
      out.push(L[j]);
    }
    var t = out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    return (!t || /^(No Wx data available|NIL|NO DATA)/i.test(t)) ? null : t;
  }

  /* ---- TAF decoding (same model as the Python chain: minutes from 00Z of the flight date) */
  function tmin(day, hh, mm, d0) { var dd = day - d0; if (dd < -15) dd += 30; return dd * 1440 + hh * 60 + mm; }
  function parseTaf(raw, d0) {
    var tk = raw.split(/\s+/), i = 0;
    if (!tk.length) return null;
    if (['FT', 'TAF', 'FC'].indexOf(tk[0]) >= 0) i = 1;
    if (i < tk.length && /^\d{6}Z?$/.test(tk[i])) i++;
    var m = i < tk.length ? /^(\d{2})(\d{2})\/(\d{2})(\d{2})$/.exec(tk[i]) : null;
    if (!m) return null;
    var va = tmin(+m[1], +m[2], 0, d0), vb = tmin(+m[3], +m[4], 0, d0); i++;
    var gs = [], cur = { t: 'BASE', a: va, b: vb, x: [] }, per, fm, kind, j;
    while (i < tk.length) {
      var t = tk[i];
      per = i + 1 < tk.length ? /^(\d{2})(\d{2})\/(\d{2})(\d{2})$/.exec(tk[i + 1]) : null;
      if ((t === 'BECMG' || t === 'TEMPO') && per) {
        gs.push(cur); cur = { t: t, a: tmin(+per[1], +per[2], 0, d0), b: tmin(+per[3], +per[4], 0, d0), x: [] }; i += 2; continue;
      }
      if (/^PROB\d0$/.test(t)) {
        kind = t; j = i + 1;
        if (j < tk.length && tk[j] === 'TEMPO') { kind += ' TEMPO'; j++; }
        per = j < tk.length ? /^(\d{2})(\d{2})\/(\d{2})(\d{2})$/.exec(tk[j]) : null;
        if (per) { gs.push(cur); cur = { t: kind, a: tmin(+per[1], +per[2], 0, d0), b: tmin(+per[3], +per[4], 0, d0), x: [] }; i = j + 1; continue; }
      }
      fm = /^FM(\d{2})(\d{2})(\d{2})$/.exec(t);
      if (fm) { gs.push(cur); cur = { t: 'FM', a: tmin(+fm[1], +fm[2], +fm[3], d0), b: vb, x: [] }; i++; continue; }
      cur.x.push(t); i++;
    }
    gs.push(cur);
    gs.forEach(function (x) { x.x = x.x.join(' '); });
    return { va: va, vb: vb, groups: gs };
  }

  var ROLE = { 'DEPARTURE AIRPORT:': 'DEP', 'DESTINATION AIRPORT:': 'DEST', 'DESTINATION ALTERNATE:': 'ALTN', 'Critical ETOPS Airports:': 'ETOPS', 'ENROUTE AIRPORT(S):': 'ENR' };
  function weather(L, d0) {
    var out = [], role = null, cur = null, buf = '', kind = null;
    var s = L.findIndex(function (l) { return l.trim() === 'DEPARTURE AIRPORT:'; });
    if (s < 0) return out;
    function flush() {
      if (cur && kind && buf) {
        var txt = buf.replace(/\s+/g, ' ').trim().replace(/=$/, '');
        if (kind === 'SA') cur.metar = txt;
        else { cur.taf = txt; var p = parseTaf(txt, d0); if (p) { cur.va = p.va; cur.vb = p.vb; cur.groups = p.groups; } }
      }
      buf = ''; kind = null;
    }
    for (var i = s; i < L.length; i++) {
      var l = L[i], st = l.trim();
      if (/^AIRPORTLIST ENDED/.test(st)) break;
      if (ROLE[st]) { flush(); role = ROLE[st]; continue; }
      var m = /^([A-Z]{4})\/([A-Z0-9]{3})\s+(.*)$/.exec(st);
      if (m && !/^\s\s/.test(l)) {
        flush();
        cur = { icao: m[1], iata: m[2], name: m[3].replace(/\w\S*/g, function (w) { return w.charAt(0) + w.slice(1).toLowerCase(); }), role: role };
        out.push(cur); continue;
      }
      if (/^(SA|FT|FC) /.test(st)) { flush(); kind = st.slice(0, 2); buf = st; continue; }
      if (kind && st) buf += ' ' + st;
      if (/=$/.test(st)) flush();
    }
    flush();
    return out;
  }

  var NOTAM_HDR = /^([A-Z0-9]{2,4}\d{1,4}\/\d{2})(?:\s+-\s+[A-Z ]+?)?\s+VALID:\s+(\d{10})\s+-\s+(\d{10}|UFN|PERM)(?:\s+(EST))?/;
  var SECT = { 'DEPARTURE AIRPORT': 'DEP', 'DESTINATION AIRPORT': 'DEST', 'DESTINATION ALTERNATE(S)': 'ALTN', 'ETOPS SUITABLE ENROUTE AIRPORT(S)': 'ETOPS', 'ENROUTE AIRPORT(S)': 'ENR',
    'ESCAPE AIRPORT(S)': 'ENR', 'FUEL ENROUTE AIRPORT': 'ENR', 'FUEL ENROUTE AIRPORT(S)': 'ENR' };   // v3.6: + escape and fuel en-route airports (shown with the en-route airports)
  function ruleNext(L, i) { for (var q = i + 1; q < L.length && q < i + 8; q++) if (L[q].trim()) return /^-{5,}$/.test(L[q].trim()); return false; }   // the next non-blank line is a rule of '-' (a page break may sit in between)
  function vmin(s, date0) {
    var y = 2000 + +s.slice(0, 2), mo = +s.slice(2, 4) - 1, d = +s.slice(4, 6), h = +s.slice(6, 8), mi = +s.slice(8, 10);
    return Math.round((Date.UTC(y, mo, d, h, mi) - date0) / 60000);
  }
  /* v3.6: the sections of the Lido NOTAM bulletin. A title stands between two rules of '='; when a page break falls inside the
     header, blank lines sit between the title and the closing rule (EK348: DESTINATION AIRPORT was missed and its NOTAMs were
     filed under the departure). One walk finds every section, so the airport and the area parsers cannot disagree. */
  function sections(L) {
    var out = [];
    for (var i = 0; i < L.length; i++) {
      var st = L[i].trim();
      if (!/^={5,}/.test(st)) continue;
      if (/END OF LIDO-NOTAM-BULLETIN/.test(st)) { if (out.length && out[out.length - 1].end > i) out[out.length - 1].end = i; continue; }
      if (!/^={5,}$/.test(st)) continue;
      var j = i + 1; while (j < L.length && !L[j].trim()) j++;
      if (j >= L.length || j > i + 9 || /^={5,}/.test(L[j].trim())) continue;
      var k = j + 1; while (k < L.length && k < j + 9 && !L[k].trim()) k++;
      if (k < L.length && /^={5,}$/.test(L[k].trim())) {
        if (out.length && out[out.length - 1].end > i) out[out.length - 1].end = i;
        out.push({ title: L[j].trim(), start: k + 1, end: L.length }); i = k;
      }
    }
    return out;
  }
  function notams(L, date0, chk) {
    var out = [];
    if (date0 == null) return out;
    sections(L).forEach(function (S) {
      var role = SECT[S.title], apt = null, cat = '', cur = null;
      if (!role) return;
      for (var i = S.start; i < S.end; i++) {
        var l = L[i], st = l.trim();
        var m = /^([A-Z]{4})\s*\/([A-Z0-9]{3})\s+(.*?)(?:\s+- DETAILED INFO)?$/.exec(st);
        if (m && ruleNext(L, i)) { apt = m[1]; cur = null; continue; }
        var c = /^\++\s*([A-Z /]+?)\s*\++$/.exec(st);
        if (c) { cat = c[1].trim(); cur = null; continue; }
        var h = NOTAM_HDR.exec(st);
        if (h && apt) {
          cur = { icao: apt, role: role, id: h[1], cat: cat, a: vmin(h[2], date0), b: (h[3] === 'UFN' || h[3] === 'PERM') ? null : vmin(h[3], date0),
            bt: (h[3] === 'UFN' || h[3] === 'PERM') ? h[3] : '', est: !!h[4], x: [] };
          out.push(cur); if (chk) chk.read++; continue;
        }
        if (cur && st && !/^===/.test(st) && (/^\s\s/.test(l) || loose(st))) cur.x.push(st);
      }
    });
    return fin(out);
  }
  /* pasted text loses the indentation the Lido PDF has, so a NOTAM body line is also accepted when it is
     clearly not one of the structural lines (a new NOTAM, an airport, a category or a section rule). */
  function loose(st) {
    return !NOTAM_HDR.test(st) && !/^\++/.test(st) && !/^-{3,}|^={3,}/.test(st) &&
      !/^[A-Z]{4}\s*\/[A-Z0-9]{3}\s/.test(st) && !SECT[st] && !/^(ENROUTE AIRPORT\(S\)|AREA ENROUTE|EXTENDED AREA|CREW BULLETIN|CREW ALERT|Weather|AIRPORTLIST)/.test(st);
  }
  function fin(out) {
    out.forEach(function (n) {
      var x = n.x.join(' ').replace(/\s+/g, ' ').trim();
      if (x.indexOf(n.id) === 0) x = x.slice(n.id.length).trim();
      n.x = x;
    });
    return out.filter(function (n) { return n.x; });
  }
  /* v3.6: ALL area sections of the Lido NOTAM bulletin, not only 'AREA ENROUTE DEPARTURE - DESTINATION'. The FIRs next to the
     departure (Muscat, Emirates) are printed under 'EXTENDED AREA AROUND DEPARTURE', and some blocks are named after a waypoint
     ('TARDI     TARDI') - both were skipped before. sec says which section, fir is the block code (FIR designator or waypoint). */
  var AREA_SEC = { 'EXTENDED AREA AROUND DEPARTURE': 'dep', 'AREA ENROUTE DEPARTURE - DESTINATION': 'enr', 'AREA ENROUTE DESTINATION - DESTINATION ALTERNATE(S)': 'altn',
    'EXTENDED AREA AROUND DESTINATION': 'dest', 'EXTENDED AREA AROUND DESTINATION ALTERNATE AIRPORT(S)': 'altn' };
  function rnotams(L, date0, chk) {
    var out = [], seen = {};
    if (date0 == null) return out;
    sections(L).forEach(function (S) {
      var sec = AREA_SEC[S.title], fir = null, name = '', cur = null;
      if (!sec) return;
      for (var i = S.start; i < S.end; i++) {
        var l = L[i], st = l.trim();
        if (st && !/^-{3,}$/.test(st) && !NOTAM_HDR.test(st) && ruleNext(L, i)) {
          /* block headers: 'OIIX      TEHRAN FIR', 'TARDI     TARDI', 'VAVIM/GESAXT636', 'D24 BARGAT AL HAGAT', 'WI A4078/26', 'R30/PEKANBARU' */
          var m = /^([A-Z0-9]{2,6})\s{2,}(\S.*)$/.exec(st);
          if (m) { fir = m[1]; name = m[2].replace(/\s+(FIR|UIR|FIR\/UIR)$/, ''); if (name === fir) name = ''; }
          else { fir = st.replace(/\s+/g, ' '); name = ''; }
          cur = null; continue;
        }
        var h = NOTAM_HDR.exec(st);
        if (h && fir) {
          var key = fir + ' ' + h[1];
          if (chk) chk.read++;
          if (seen[key]) { cur = null; if (seen[key].secs.indexOf(sec) < 0) seen[key].secs.push(sec); continue; }      // the same NOTAM printed again (FIR + UIR block, or another section)
          cur = { fir: fir, name: name, sec: sec, secs: [sec], id: h[1], a: vmin(h[2], date0), b: (h[3] === 'UFN' || h[3] === 'PERM') ? null : vmin(h[3], date0), bt: (h[3] === 'UFN' || h[3] === 'PERM') ? h[3] : '', x: [] };
          seen[key] = cur; out.push(cur); continue;
        }
        if (cur && st && !/^---/.test(st) && (/^\s\s/.test(l) || loose(st))) cur.x.push(st);
      }
    });
    out = fin(out);
    out.forEach(function (n) {
      /* v3.5.1: daily airspace reservations (AUP, TSA / TRA) are routine - they are not a 'conflict' because the word MILITARY is in them */
      n.kind = /AIRSPACE USE PLAN|\(AUP\)|\bTSA\/TRA\b/.test(n.x.slice(0, 160)) ? 'airspace' :
        (/SECURITY|CONFLICT|PROHIBITED|ARMED|MILITARY|HOSTIL|UNAUTHORI[SZ]ED FLIGHTS|SOMALILAND/.test(n.x) ? 'conflict' : (/GNSS|\bGPS\b/.test(n.x) ? 'gnss' : 'info'));
    });
    return out;
  }
  function crewAlert(L) {
    var s = L.findIndex(function (l) { return l.trim() === 'CREW ALERT'; });
    if (s < 0) return [];
    var out = [], cur = null;
    for (var i = s + 2; i < L.length; i++) {
      var st = L[i].trim();
      if (st === 'Weather' || /^LIDO\/WEATHER/.test(st)) break;
      var m = /^(CO\d+\/\d{2})\s+(.*)$/.exec(st);
      if (m) { cur = { id: m[1], title: m[2], x: [] }; out.push(cur); continue; }
      if (cur && st) cur.x.push(st);
    }
    out.forEach(function (c) { c.x = c.x.join(' '); });
    return out;
  }

  if (typeof window !== 'undefined') window.FPOfp = F;
  if (typeof module !== 'undefined' && module.exports) module.exports = F;
})();
