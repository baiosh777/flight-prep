/* fp_lib.js - Flight Prep 3.5: the stored libraries ("do it once, keep it").
   Library files (schema fpapp.library.v1) are loaded in FLIGHTS and kept on the iPad:
     kind 'apt'  - airport packs: CCI / AOI summary, AGC with the vector map, runways / ILS / frequencies, diversion card
     kind 'fir'  - FIR comms: VHF in the order used, CPDLC log-on and its deadline, HF day / night, SATCOM, FIR notes
     kind 'mel'  - the B777 MEL
     kind 'regs' - Lido RM: CRAR countries and RSI regions (REGS page, handled by fp_regs.js)
   FPLib.apply() puts them into the open flight before it is mounted, so a flight the app built itself from
   an OFP gets the comms column, the airport pages and the MEL of a prepared flight. Nothing is invented here:
   every block says which library and which source it came from. */
(function () {
  var L = {};
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function hm(m) { if (m == null) return '-'; m = Math.round(m); var s = m < 0 ? '-' : ''; m = Math.abs(m); return s + Math.floor(m / 60) + ':' + ('0' + (m % 60)).slice(-2); }
  var EYE = '<summary aria-label="More information"><svg class="ic" aria-hidden="true" viewBox="0 0 24 24"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg><span>more</span></summary>';

  /* ---------------------------------------------------------------- comms block for one FIR */
  function commsHtml(fir, e, entryEet, opt) {
    opt = opt || {};
    var h = '<div class="cm">';
    var vhf = (e.vhf || []).filter(function (v) { return v.u || v.f; });
    if (vhf.length) {
      h += '<div class="cmv"><b class="cmk">VHF</b>';
      vhf.forEach(function (v, i) {
        h += '<span class="cmi"><i>' + (i + 1) + '</i> ' + esc(v.u) + (v.f ? ' <b>' + esc(v.f) + '</b>' : ' <b>by handover</b>') +
          (v.n ? ' <small>' + esc(v.n) + '</small>' : '') + '</span>';
      });
      h += '</div>';
    }
    var hf = e.hf || {};
    if (hf.sets && hf.sets.length) {
      h += '<div class="cmh"><b class="cmk">HF</b> ' + esc(hf.who || '');
      hf.sets.forEach(function (s) {
        h += ' <span class="hf">' + (s.lbl ? '<i>' + esc(s.lbl) + '</i> ' : '') + esc(s.f.join(' / ')) + '</span>';
      });
      if (hf.selcal) h += ' <span class="sel">SELCAL check</span>';
      if (hf.src) h += ' <small>(' + esc(hf.src) + ')</small>';
      h += '</div>';
    }
    if (e.cpdlc && e.cpdlc.addr) {
      var onGnd = entryEet != null && e.cpdlc.before != null && entryEet - e.cpdlc.before <= 0;   // v3.5: the departure FIR - no clock time before take-off
      var by = (entryEet != null && e.cpdlc.before != null && !onGnd) ? hm(entryEet - e.cpdlc.before) : null;
      h += '<div class="cmc"><b class="cmk">CPDLC</b> <span class="cplg">LOGON <b>' + esc(e.cpdlc.addr) + '</b>' +
        (onGnd ? ' <b>before departure</b>' : by ? ' by <b>' + esc(by) + '</b>' : (e.cpdlc.before != null ? ' <b>' + e.cpdlc.before + ' min before entry</b>' : '')) + '</span>' +
        (e.cpdlc.note ? ' <small>' + esc(e.cpdlc.note) + '</small>' : '') + '</div>';
    } else if (e.cpdlc === null) {
      h += '<div class="cmc"><b class="cmk">CPDLC</b> none in this FIR (Lido RSI) – voice and SATCOM.</div>';
    }
    if (e.call_note) h += '<div class="cmn">' + esc(e.call_note) + '</div>';
    else if (e.before != null && entryEet != null) h += '<div class="cmn">Call ' + e.before + ' min before: by <b>' + hm(entryEet - e.before) + '</b></div>';
    if (e.ifbp) h += '<div class="cmn">IFBP 126.9: listening watch from 10 min before entry.</div>';
    (e.satcom || []).forEach(function (s) {
      h += '<div class="cmn">SATCOM ' + esc(s.u || '') + (s.code ? ' ' + esc(s.code) : '') + (s.tel ? ' · ' + esc(s.tel) : '') + '</div>';
    });
    var more = (e.more || []).slice();
    if (e.src) more.push('Source: ' + e.src);
    if (opt.libNote) more.push(opt.libNote);
    if (more.length) h += '<details class="cmx">' + EYE + '<ul>' + more.map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('') + '</ul></details>';
    return h + '</div>';
  }

  /* airport frequencies (from the airport pack's diversion card: Lido AFC / AOI) */
  function aptComms(p, kind) {
    if (!p || !p.div || !p.div.freqs || !p.div.freqs.length) return '';
    var want = kind === 'dep' ? ['ATIS', 'DLV', 'DELIVERY', 'GND', 'GROUND', 'TWR', 'TOWER', 'DEP'] : ['ATIS', 'ARR', 'APP', 'DIR', 'RADAR', 'TWR', 'TOWER', 'GND', 'GROUND'];
    var skip = kind === 'dep' ? /ATIS ARR/ : /ATIS DEP/;      // v3.5: the other side's ATIS is left out
    var list = [];
    want.forEach(function (w) {
      p.div.freqs.forEach(function (f) {
        var n = String(f[0]).toUpperCase();
        if (n.indexOf(w) >= 0 && !skip.test(n) && !list.filter(function (x) { return x[0] === f[0]; }).length) list.push(f);
      });
    });
    if (!list.length) list = p.div.freqs.slice(0, 5);
    var h = '<div class="cm"><div class="cmv"><b class="cmk">VHF</b>';
    list.slice(0, 6).forEach(function (f, i) { h += '<span class="cmi"><i>' + (i + 1) + '</i> ' + esc(f[0]) + ' <b>' + esc(f[1]) + '</b></span>'; });
    h += '</div><div class="cmn">' + esc(p.icao) + ' frequencies from the airport pack (Lido AFC / AOI) – confirm on the ATIS and the chart.</div></div>';
    return h;
  }

  /* ---------------------------------------------------------------- apply the libraries to a flight record */
  L.apply = function (rec, libs) {
    if (!rec || !rec.data) return rec;
    var D = rec.data, auto = !!(D.auto), used = { apt: [], fir: [], mel: false, regs: false };
    var fl = D.flight || {};
    /* ---- FIR comms, procedures, SATCOM and the log-on deadlines */
    var FL = libs && libs.fir && libs.fir.firs;
    if (FL) {
      var note = 'From the FIR comms library (' + (libs.fir.built_utc || '') + ') – not from this OFP.';
      var dl = (D.deadlines || []).slice(), have = {};
      dl.forEach(function (d) { have[d.id] = 1; });
      (D.firs || []).forEach(function (f) {
        var e = FL[f.fir];
        if (!e) return;
        used.fir.push(f.fir);
        if (!f.name && e.name) f.name = e.name;
        D.comms_fir = D.comms_fir || {};
        if (!D.comms_fir[f.fir]) D.comms_fir[f.fir] = { vhf: ((e.vhf || [])[0] || {}).u + ' ' + (((e.vhf || [])[0] || {}).f || ''), hf: hfMap(e), who: (e.hf || {}).who || '', sel: !!(e.hf || {}).selcal };
        if (e.proc) { D.firproc = D.firproc || {}; if (!D.firproc[f.fir]) D.firproc[f.fir] = e.proc; }
        if (e.satcom && e.satcom.length) {
          D.satcom = D.satcom || [];
          e.satcom.forEach(function (s) {
            if (!D.satcom.filter(function (x) { return x.fir === f.fir && x.unit === s.u; }).length)
              D.satcom.push({ fir: f.fir, unit: s.u || '', code: s.code || '', tel: s.tel || '', src: s.src || '' });
          });
        }
        var before = (e.cpdlc && e.cpdlc.before != null) ? e.cpdlc.before : e.before;
        if (before != null && f.eet_min != null && f.eet_min > 0) {
          var id = f.fir + '-logon';
          if (!have[id]) {
            dl.push({ id: id, fir: f.fir, name: f.name || e.name || '', eet: Math.max(0, f.eet_min - before),
              text: (e.cpdlc && e.cpdlc.addr ? 'CPDLC logon ' + e.cpdlc.addr + ' + estimate' : 'Call') + ' ' + before + ' min before: by ' + hm(f.eet_min - before) });
            have[id] = 1;
          }
        }
      });
      D.deadlines = dl.sort(function (a, b) { return a.eet - b.eet; });
      /* the comms column: FIR boundary rows (and the first row) of an auto-built flight */
      (D.rows || []).forEach(function (r) {
        if (!auto && r.call) return;                       // a prepared flight keeps its own comms
        if (r.bnd || r.i === 0) {
          var e = FL[r.fir];
          if (!e) return;
          var f = (D.firs || []).filter(function (x) { return x.fir === r.fir; })[0];
          var html = commsHtml(r.fir, e, f ? f.eet_min : r.eet, { libNote: note });
          r.call = (r.i === 0 ? aptComms(aptOf(libs, fl.dep), 'dep') : '') + html;
        }
      });
    }
    /* ---- airport packs */
    var AP = libs && libs.apt && libs.apt.airports;
    if (AP) {
      L.icaos(rec).forEach(function (ic) {
        var p = AP[ic];
        if (!p) return;
        used.apt.push(ic);
        if (p.info) { D.aptinfo = D.aptinfo || {}; if (!D.aptinfo[ic]) D.aptinfo[ic] = p.info; }
        if (p.div) {
          D.divinfo = D.divinfo || {};
          if (!D.divinfo[ic]) { D.divinfo[ic] = p.div; if (p.afc && p.afc.length) D.divinfo[ic].afc = p.afc.map(function (a) { return { t: a.t, w: a.w, h: a.h, code: a.code }; }); }
        }
      });
      L._ap = AP;                                           // kept for the chart pictures of the diversion card (FPLib.img)
      if (auto) {
        ['dep', 'arr'].forEach(function (side) {
          var ic = side === 'dep' ? fl.dep : fl.arr, p = AP[ic];
          if (!p || !p[side] || !rec.views || !rec.views[side]) return;
          /* v3.5 packs: the brief for this side, then the shared summary, the charts (once) and the Lido items in full */
          var body = p[side].html || ((p[side].top || '') + (p.summary || '') + (p.common || '') + (p.items || ''));
          if (!body) return;
          rec.views[side] = rebar(rec.views[side], 'The weather, NOTAMs, runway and fuel above are from this OFP; the brief, the CCI / AOI text and the charts below come from the stored <b>' + esc(ic) + ' airport pack</b> (' + esc(p[side].src || 'prepared flight') + ').') +
            '<div class="bar"><span>Airport pack ' + esc(ic) + '</span><small>' + esc(p[side].src || '') + ' – not from this OFP</small></div>' + body;
        });
      }
    }
    /* ---- MEL */
    if (libs && libs.mel && libs.mel.items) {
      if (!D.mel || !Object.keys(D.mel).length) { D.mel = libs.mel.items; used.mel = true; }
    }
    used.regs = !!(libs && libs.regs);
    /* ---- the route's countries out of the regulations library (REGS) onto the TEM page */
    if (auto && libs && libs.regs && (libs.regs.countries || []).length) {
      var want = {}, names = [];
      (D.firs || []).forEach(function (f) {
        var e = FL && FL[f.fir];
        var nm = e && e.country;
        if (nm && !want[nm]) { want[nm] = f.fir; names.push(nm); }
      });
      var cards = [];
      names.forEach(function (nm) {
        var c = libs.regs.countries.filter(function (x) { return x.title === nm || x.title.indexOf(nm) === 0; })[0];
        if (!c) return;
        var lines = c.summary ? [].concat(c.summary) : (c.auto || []).map(function (a) { return a.x; });
        if (!lines.length) return;
        cards.push('<details class="omc"><summary><b>' + esc(c.title) + '</b> – ' + esc(want[nm]) + ' · Lido CRAR ' + esc(c.id) +
          ' · ' + c.n + ' sections' + (c.summary ? ' · summary written by Claude' : ' · key sentences picked by rule') + '</summary><ul class="gpl">' +
          lines.slice(0, 10).map(function (x) { return '<li>' + esc(typeof x === 'string' ? x : (x.x || '')) + '</li>'; }).join('') +
          '</ul><p class="allf">Full text on the REGS page.</p></details>');
      });
      if (cards.length && rec.views && rec.views.tem) {
        rec.views.tem += '<div class="bar"><span>Countries on this route</span><small>Lido CRAR / RSI from the regulations library – the Lido text is the authority</small></div>' + cards.join('');
        used.regs_cards = cards.length;
      }
    }
    /* the WAYPOINTS header and the TEM / DASH banners say what is loaded */
    if (auto && (used.fir.length || used.apt.length)) {
      var what = [];
      if (used.fir.length) what.push('comms, CPDLC log-on deadlines and FIR notes from the FIR comms library (' + used.fir.join(', ') + ')');
      if (used.apt.length) what.push('airport packs for ' + used.apt.join(', '));
      if (used.mel) what.push('the B777 MEL');
      rec.wpt_static = '<details class="omc"><summary><b>Auto-built from the OFP + stored libraries</b> – times, MORA and minimum fuel are the OFP navlog; ' +
        what.join('; ') + '.</summary><div class="tw"><table><thead><tr><th>FIR</th><th>From the flight plan</th><th>Comms library</th></tr></thead><tbody>' +
        (D.firs || []).map(function (f) {
          return '<tr><td><b>' + esc(f.fir) + '</b> ' + esc(f.name || '') + '</td><td>entry ' + hm(f.eet_min) + '</td><td>' +
            (used.fir.indexOf(f.fir) >= 0 ? 'loaded' : '<b>not loaded</b> – no frequencies for this FIR') + '</td></tr>';
        }).join('') + '</tbody></table></div><p class="allf">The libraries are stored on this iPad and are used by every flight. ' +
        'What is still only in a Claude prep file: the threat → mitigation work and anything written for this day.</p></details>';
      ['tem', 'dash'].forEach(function (k) {
        if (rec.views && rec.views[k]) rec.views[k] = rebar(rec.views[k], 'Loaded for this flight: ' + what.join('; ') + '.');
      });
    }
    D._lib = used;
    return rec;
  };
  /* the "auto-built, nothing else loaded" banner of a generated page -> what is actually loaded now */
  function rebar(html, txt) {
    return html.replace(/<div class="msg autobar"[^>]*>[\s\S]*?<\/div>/,
      '<div class="msg autobar" style="margin:0 0 10px"><b>Auto-built from the OFP, with the stored libraries.</b> ' + txt + '</div>');
  }
  function hfMap(e) {
    var o = {}, hf = e.hf || {};
    (hf.sets || []).forEach(function (s) {
      var k = /night/i.test(s.lbl) ? 'night' : (/day/i.test(s.lbl) ? 'day' : 'any');
      o[k] = (o[k] || []).concat(s.f);
    });
    return o;
  }
  /* the airports a flight can use a pack for: departure, destination, OFP alternates, the diversion chain and the map airports */
  L.icaos = function (rec) {
    var D = (rec && rec.data) || {}, fl = D.flight || {}, o = {};
    [fl.dep, fl.arr].forEach(function (x) { if (x) o[x] = 1; });
    (D.alts || []).forEach(function (a) { if (a.icao) o[a.icao] = 1; });
    (D.chain || []).forEach(function (c) { if (c.icao) o[c.icao] = 1; });
    ((D.geo || {}).apt || []).forEach(function (a) { if (a.icao) o[a.icao] = 1; });
    (D.wx || []).forEach(function (w) { if (w.icao) o[w.icao] = 1; });
    return Object.keys(o);
  };
  /* a chart picture of a stored pack (data URL), by its Lido item number - used by the diversion card */
  L.img = function (icao, code) {
    var p = L._ap && L._ap[icao]; if (!p || !p.common) return '';
    var i = p.common.indexOf('data-code="' + code + '"'); if (i < 0) return '';
    var a = p.common.indexOf('src="', i), b = a < 0 ? -1 : p.common.indexOf('"', a + 5);
    return b < 0 ? '' : p.common.slice(a + 5, b);
  };
  function aptOf(libs, icao) { return (libs && libs.apt && libs.apt.airports && libs.apt.airports[icao]) || null; }

  /* ---------------------------------------------------------------- merging library files as they are loaded */
  L.merge = function (existing, incoming) {
    if (!existing) return incoming;
    var kind = incoming.kind;
    if (kind === 'apt') {
      existing.airports = existing.airports || {};
      Object.keys(incoming.airports || {}).forEach(function (k) { existing.airports[k] = incoming.airports[k]; });
      existing.built_utc = incoming.built_utc || existing.built_utc;
      existing.title = 'Airport packs (' + Object.keys(existing.airports).length + ')';
      return existing;
    }
    if (kind === 'fir') {
      existing.firs = existing.firs || {};
      Object.keys(incoming.firs || {}).forEach(function (k) { existing.firs[k] = incoming.firs[k]; });
      existing.built_utc = incoming.built_utc || existing.built_utc;
      return existing;
    }
    return incoming;   // regs and mel are replaced whole
  };
  L.describe = function (l) {
    if (!l) return '';
    if (l.kind === 'apt') {
      var ix = l.index || l.airports || {}, ks = Object.keys(ix).sort();
      var full = ks.filter(function (k) { return ix[k] && ix[k].brief; });
      return 'Airport packs: <b>' + ks.length + '</b>' + (full.length ? ' · with a written brief: <b>' + full.join(', ') + '</b>' : '') +
        '<details class="libd"><summary>all airports</summary>' + ks.join(', ') + '</details>';
    }
    if (l.kind === 'fir') return 'FIR comms: <b>' + Object.keys(l.firs || {}).sort().join(', ') + '</b>';
    if (l.kind === 'mel') return 'MEL: <b>' + Object.keys(l.items || {}).length + ' items</b>';
    if (l.kind === 'regs') return 'Regulations: <b>' + (l.countries || []).length + ' countries, ' + (l.regions || []).length + ' regions</b>';
    return esc(l.title || l.kind);
  };
  if (typeof window !== 'undefined') window.FPLib = L;
  if (typeof module !== 'undefined' && module.exports) module.exports = L;
})();
