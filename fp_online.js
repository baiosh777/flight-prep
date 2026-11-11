/* fp_online.js - Flight Prep 3.7: "Update weather" - the app reads the weather itself, from two public web sources, when the button is pressed.
   (pilot 10 NOV 26: "a button and the app to have access to a website source or even 2 to update when pressed")

   Sources - both tested from the app's own address, both allow a web page to read them (CORS), no key, any airport:
     1. MET Norway  api.met.no/weatherapi/tafmetar   TAF + METAR (the reports of the last day; the newest is used)
     2. VATSIM      metar.vatsim.net                  METAR (the newest of the two sources is shown)
   aviationweather.gov (NOAA) does not allow a web page to read it, so it cannot be used from the app.
   Optional third source: data/wx.json written by the repository job (older set-up) - read quietly if it is there.

   Nothing in the OFP is overwritten. A live report is shown as LIVE with its time and source; the TAF timeline and the tile colour
   use the live TAF when it is newer than the OFP one (or the OFP has none) and say so. The last result is kept on the iPad for
   this flight (localStorage), so it is still there without internet.
   window.FPOnline = { refresh(), restore(D), label(), old(), state } */
(function () {
  var MET = 'https://api.met.no/weatherapi/tafmetar/1.0/tafmetar.txt?icao=', VAT = 'https://metar.vatsim.net/metar.php?id=';
  var O = { state: { tried: 0, at: 0, src: [], err: '', nM: 0, nT: 0, miss: [] } };
  function p2(n) { return ('0' + n).slice(-2); }
  function key(D) { return 'fpapp:live:' + ((D.flight && D.flight.id) || ''); }
  function d0(D) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(D.date || ''); return m ? +m[3] : new Date().getUTCDate(); }
  function tmin(day, hh, mm, base) { var dd = day - base; if (dd < -15) dd += 30; if (dd > 15) dd -= 30; return dd * 1440 + hh * 60 + mm; }
  function tOf(ddhhmm, base) { var m = /^(\d{2})(\d{2})(\d{2})/.exec(ddhhmm || ''); return m ? tmin(+m[1], +m[2], +m[3], base) : null; }

  function icaos(D) {
    var s = {}, out = [];
    function add(x) { if (/^[A-Z]{4}$/.test(x || '') && !s[x]) { s[x] = 1; out.push(x); } }
    if (D.flight) { add(D.flight.dep); add(D.flight.arr); }
    (D.wx || []).forEach(function (w) { add(w.icao); });
    (D.alts || []).forEach(function (a) { add(a.icao); });
    (D.chain || []).forEach(function (c) { add(c.icao); });
    (D.notams || []).forEach(function (n) { add(n.icao); });
    return out;
  }
  /* one report per "=" (or line): [TAF|METAR|SPECI] [AMD|COR] ICAO ddhhmmZ ... ; a TAF has its validity ddhh/ddhh as the next group */
  function parse(txt, srcName, live, base) {
    String(txt || '').split(/=|\n/).forEach(function (line) {
      var t = line.replace(/\s+/g, ' ').trim(); if (!t) return;
      var tk = t.split(' '), pre = [];
      while (tk.length && /^(TAF|METAR|SPECI|AMD|COR)$/.test(tk[0])) pre.push(tk.shift());
      if (tk.length < 3 || !/^[A-Z]{4}$/.test(tk[0]) || !/^\d{6}Z$/.test(tk[1])) return;
      var ic = tk[0], isTaf = /^\d{4}\/\d{4}$/.test(tk[2]) || pre.indexOf('TAF') >= 0, when = tOf(tk[1], base), kind = isTaf ? 'taf' : 'metar';
      if (/\bNIL\b/.test(t) && tk.length < 5) return;
      var cur = live[kind][ic];
      if (!cur || when == null || cur.when == null || when >= cur.when) live[kind][ic] = { raw: tk.join(' '), time: tk[1], when: when, src: srcName };
    });
  }
  function get(url, ms) {
    var c = typeof AbortController !== 'undefined' ? new AbortController() : null, tm = c ? setTimeout(function () { c.abort(); }, ms || 15000) : 0;
    return fetch(url, c ? { signal: c.signal, cache: 'no-store' } : { cache: 'no-store' }).then(function (r) { clearTimeout(tm); return r.ok ? r.text() : null; }).catch(function () { clearTimeout(tm); return null; });
  }
  function ofpTafTime(w, base) { var m = /^(?:FT|TAF|FC)?\s*(\d{6})Z?\s+\d{4}\/\d{4}/.exec(w.taf || ''); return m ? tOf(m[1], base) : null; }

  /* put a stored / fresh result on the flight in memory */
  function apply(D, live) {
    if (!D || !live) return 0;
    var base = d0(D), n = 0, have = {}, P = (typeof window !== 'undefined' && window.FPOfp && window.FPOfp.parseTaf) || null;
    D.wx = D.wx || [];
    D.wx.forEach(function (w) { have[w.icao] = 1; });
    /* an airfield of the flight that has no weather in the OFP still gets its live reports (shown under the en-route airfields) */
    (D.chain || []).concat(D.alts || []).forEach(function (c) { if (c.icao && !have[c.icao] && (live.metar[c.icao] || live.taf[c.icao])) { have[c.icao] = 1; D.wx.push({ icao: c.icao, role: 'ENR', name: '', metar: '', taf: '', live_only: true }); } });
    D.wx.forEach(function (w) {
      var m = live.metar[w.icao], f = live.taf[w.icao];
      if (m) { w.live_metar = m.raw; w.live_metar_t = m.time + ' · ' + m.src; n++; }
      if (f) {
        w.live_taf = f.raw; w.live_taf_t = f.time + ' · ' + f.src; n++;
        var ot = ofpTafTime(w, base), og = w._ofp ? w._ofp.groups : w.groups;
        if (P && (!og || ot == null || f.when == null || f.when >= ot)) {
          var pr = P(f.raw.replace(/^[A-Z]{4}\s+/, ''), base);
          if (pr && pr.groups && pr.groups.length) { if (!w._ofp) w._ofp = { groups: w.groups, va: w.va, vb: w.vb }; w.groups = pr.groups; w.va = pr.va; w.vb = pr.vb; w.taf_live = true; }
        }
      }
    });
    return n;
  }
  O.restore = function (D) {
    try {
      var j = JSON.parse(localStorage.getItem(key(D)) || 'null'); if (!j || !j.live) return false;
      O.state.at = j.at || 0; O.state.src = j.src || []; O.state.nM = Object.keys(j.live.metar || {}).length; O.state.nT = Object.keys(j.live.taf || {}).length; O.state.miss = j.miss || [];
      apply(D, j.live); return true;
    } catch (e) { return false; }
  };
  O.refresh = function () {
    var D = window.FPCore ? window.FPCore.D : null;
    if (!D) return Promise.resolve(null);
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { O.state.err = 'No internet – the weather already on the iPad is shown.'; return Promise.resolve({ msg: O.state.err }); }
    O.state.tried++; O.state.err = '';
    var ids = icaos(D), base = d0(D), live = { metar: {}, taf: {} }, used = {}, jobs = [], i;
    for (i = 0; i < ids.length; i += 10) (function (part) { jobs.push(get(MET + part.join(','), 20000).then(function (t) { if (t != null) { used['MET Norway'] = 1; parse(t, 'MET Norway', live, base); } })); })(ids.slice(i, i + 10));
    for (i = 0; i < ids.length; i += 40) (function (part) { jobs.push(get(VAT + part.join(','), 15000).then(function (t) { if (t != null) { used.VATSIM = 1; parse(t, 'VATSIM', live, base); } })); })(ids.slice(i, i + 40));
    /* the repository job of the older set-up, if its file is there (same address as the app) */
    ['./data/wx.json', './wx.json'].forEach(function (u) {
      jobs.push(get(u + '?t=' + Date.now(), 8000).then(function (t) {
        var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) { }
        if (!j || !j.metar) return; used['repository job'] = 1;
        ids.forEach(function (ic) {
          var m = j.metar[ic], f = (j.taf || {})[ic];
          if (m && m.raw) parse(m.raw, 'repository job', live, base);
          if (f && f.raw) parse('TAF ' + String(f.raw).replace(/^TAF\s+/, ''), 'repository job', live, base);
        });
      }));
    });
    return Promise.all(jobs).then(function () {
      var nM = Object.keys(live.metar).length, nT = Object.keys(live.taf).length, src = Object.keys(used);
      if (!src.length) { O.state.err = 'No weather source answered – check the internet connection and try again.'; return { msg: O.state.err, changed: 0 }; }
      var miss = ids.filter(function (ic) { return !live.metar[ic] && !live.taf[ic]; });
      O.state.at = Date.now(); O.state.src = src; O.state.nM = nM; O.state.nT = nT; O.state.miss = miss;
      try { localStorage.setItem(key(D), JSON.stringify({ at: O.state.at, src: src, miss: miss, live: live })); } catch (e) { }
      apply(D, live);
      if (window.FPRerender) window.FPRerender();
      return { changed: nM + nT, msg: 'Weather updated: ' + nT + ' TAF, ' + nM + ' METAR for ' + ids.length + ' airfields (' + src.join(' + ') + ')' + (miss.length ? '. Nothing for ' + miss.slice(0, 6).join(', ') + (miss.length > 6 ? ' …' : '') : '') + '.' };
    });
  };
  O.old = function () { return !!O.state.at && Date.now() - O.state.at > 3 * 3600 * 1000; };
  O.label = function () {
    if (O.state.at) {
      var d = new Date(O.state.at), age = Math.round((Date.now() - O.state.at) / 60000);
      return 'Live weather read ' + p2(d.getUTCDate()) + ' ' + ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][d.getUTCMonth()] + ' ' + p2(d.getUTCHours()) + p2(d.getUTCMinutes()) + 'Z' +
        (age >= 60 ? ' (' + Math.floor(age / 60) + ' h ' + p2(age % 60) + ' ago)' : ' (' + age + ' min ago)') + ' · ' + O.state.nT + ' TAF, ' + O.state.nM + ' METAR · ' + (O.state.src || []).join(' + ') +
        (O.state.miss && O.state.miss.length ? ' · none for ' + O.state.miss.slice(0, 5).join(', ') + (O.state.miss.length > 5 ? ' …' : '') : '');
    }
    return O.state.err || 'Not read yet – tap Update weather while you have internet (sources: MET Norway, VATSIM).';
  };
  O._parse = parse; O._apply = apply;
  if (typeof window !== 'undefined') window.FPOnline = O;
  if (typeof module !== 'undefined' && module.exports) module.exports = O;
})();
