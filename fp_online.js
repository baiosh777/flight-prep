/* fp_online.js - Flight Prep 3.3: fresher weather and NOTAMs while the iPad still has internet.
   The app is a static page, and aviationweather.gov sends no CORS header, so the app cannot call it
   directly. Instead a scheduled job in the same GitHub repository writes data/wx.json (and, with a free
   FAA key, data/notam.json) next to the app - same origin, so the app can simply fetch it.

   Nothing is overwritten: the OFP stays the reference. A newer METAR / TAF is shown as LIVE with its
   time next to the OFP one, and a NOTAM that is not in the OFP is marked NEW SINCE THE OFP.
   window.FPOnline = { refresh(opt), state() } */
(function () {
  var O = { url: './data/wx.json', nurl: './data/notam.json', state: { tried: 0, wx: null, notam: null, err: '' } };
  function zt(d) { return ('0' + d.getUTCHours()).slice(-2) + ('0' + d.getUTCMinutes()).slice(-2) + 'Z'; }

  O.refresh = function (opt) {
    opt = opt || {};
    var D = window.FPCore ? window.FPCore.D : null;
    if (!D) return Promise.resolve(null);
    if (!navigator.onLine) { O.state.err = 'No internet - the OFP weather is shown.'; return Promise.resolve(null); }
    O.state.tried++;
    var t = Date.now();
    return Promise.all([
      fetch(O.url + '?t=' + t).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
      fetch(O.nurl + '?t=' + t).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
    ]).then(function (a) {
      var wx = a[0], nt = a[1], n = 0;
      if (wx && wx.metar) {
        O.state.wx = wx.built || '';
        (D.wx || []).forEach(function (w) {
          var m = wx.metar[w.icao], f = wx.taf[w.icao];
          if (m && m.raw && m.raw !== w.metar) { w.live_metar = m.raw; w.live_metar_t = m.time || ''; n++; }
          if (f && f.raw && f.raw !== w.taf) { w.live_taf = f.raw; w.live_taf_t = f.time || ''; n++; }
        });
      }
      if (nt && nt.notams) {
        O.state.notam = nt.built || '';
        var have = {};
        (D.notams || []).forEach(function (x) { have[x.id] = 1; });
        var add = [];
        Object.keys(nt.notams).forEach(function (ic) {
          if (!(D.wx || []).filter(function (w) { return w.icao === ic; }).length) return;   // only the airports of this flight
          (nt.notams[ic] || []).forEach(function (x) {
            if (have[x.id]) return;
            add.push({ icao: ic, role: 'LIVE', id: x.id, cat: x.cat || '', a: null, b: null, bt: '', est: false, x: x.text || '', live: true });
          });
        });
        if (add.length) { D.notams = (D.notams || []).concat(add); n += add.length; }
        O.state.new_notams = add.length;
      }
      O.state.err = (!wx && !nt) ? 'The live weather file is not on the site yet (data/wx.json).' : '';
      if (n && window.FPTools2Open === undefined) { /* no-op */ }
      if (window.FPRerender) window.FPRerender();
      return { changed: n, wx: O.state.wx, notam: O.state.notam };
    });
  };
  O.label = function () {
    if (O.state.wx) return 'Live weather ' + O.state.wx + (O.state.notam ? ' · NOTAMs ' + O.state.notam : '');
    return O.state.err || 'Not refreshed yet';
  };
  if (typeof window !== 'undefined') window.FPOnline = O;
})();
