/* fp_lib.js - Flight Prep 3.6: the stored libraries ("do it once, keep it").
   Library files (schema fpapp.library.v1) are loaded in FLIGHTS and kept on the iPad:
     kind 'apt'  - airport packs: CCI / AOI summary, AGC with the vector map, runways / ILS / frequencies, diversion card
     kind 'fir'  - FIR comms: VHF in the order used, CPDLC log-on and its deadline, HF day / night, SATCOM, FIR notes
     kind 'mel'  - the B777 MEL
     kind 'regs' - Lido RM: CRAR countries and RSI regions (REGS page, handled by fp_regs.js)
     kind 'route' - v3.6 route packs: what was written once for DEP-DEST (FIR procedures on this routing, VHF named for it,
                   lessons, threat -> mitigation -> ref by phase). Text with **bold**, every line with its source.
   FPLib.apply() puts them into the open flight before it is mounted, so a flight the app built itself from
   an OFP gets the comms column, the airport pages and the MEL of a prepared flight. Nothing is invented here:
   every block says which library and which source it came from.
   v3.6: FPLib.apply also writes the COVERAGE block on DASH - what came from where, and what no library or rule covers. */
(function () {
  var L = {};
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function hm(m) { if (m == null) return '-'; m = Math.round(m); var s = m < 0 ? '-' : ''; m = Math.abs(m); return s + Math.floor(m / 60) + ':' + ('0' + (m % 60)).slice(-2); }
  var EYE = '<summary aria-label="More information"><svg class="ic" aria-hidden="true" viewBox="0 0 24 24"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg><span>more</span></summary>';

  function fmt(s) { return esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>'); }      // route-pack text: **bold**, nothing else
  function baseName(n) { return String(n || '').replace(/\/.*$/, ''); }
  /* route pack: the notes of the n-th entry into a FIR ('WMFC', 'WMFC#2') */
  function rpFir(RP, fir, n) { if (!RP || !RP.firs) return null; return RP.firs[fir + '#' + n] || (n === 1 ? RP.firs[fir] : null) || null; }
  function withRoute(e, o) {   // a FIR library entry with the route pack's own VHF list / notes for this routing
    if (!o) return e;
    var c = {}, k; for (k in e) c[k] = e[k];
    if (o.vhf) c.vhf = o.vhf;
    if (o.more) c.more = o.more.slice();
    if (o.more_add) c.more = (c.more || []).concat(o.more_add);
    if (o.comms) c.rnote = o.comms;
    return c;
  }
  function addCell(r, col, s) { if (!s) return; var h = fmt(s); r[col] = r[col] && r[col] !== '-' ? r[col] + ' · ' + h : h; r.rp = 1; }

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
    } else h += '<div class="cmv"><b class="cmk">VHF</b><span class="cmi nocov">not in the libraries – en-route chart / handover</span></div>';
    if (e.rnote) h += '<div class="cmn">' + esc(e.rnote) + '</div>';
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
    if (opt.rpNote) more.push(opt.rpNote);
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
    var D = rec.data, auto = !!(D.auto), used = { apt: [], fir: [], mel: false, regs: false, route: null };
    /* v3.7 (fault of 10 NOV 26: a flight file built outside the app with the libraries already written into it got the stored libraries a second
       time - CCI / AOI summary, AGC, route notes and TEM blocks twice). The app applies the libraries to a fresh record at every open and never
       stores the result, so "D._lib is already in the record" means: this file carries library content. Everything that APPENDS is then skipped. */
    var pre = !!D._lib;
    function has(view, mark) { return !!(rec.views && rec.views[view] && rec.views[view].indexOf(mark) >= 0); }
    var fl = D.flight || {};
    /* ---- v3.6 route pack of this city pair (auto-built flights only - a prepared flight keeps its own text) */
    var rkey = (fl.dep || '') + '-' + (fl.arr || '');
    var RP = (auto && libs && libs.route && libs.route.routes && libs.route.routes[rkey]) || null;
    var rpNote = RP ? 'Route pack ' + rkey + ' (' + (RP.built || '') + '): the VHF list / notes written for this routing.' : '';
    /* ---- FIR comms, procedures, SATCOM and the log-on deadlines */
    var FL = (libs && libs.fir && libs.fir.firs) || (RP ? {} : null);
    if (FL) {
      var note = libs.fir ? 'From the FIR comms library (' + (libs.fir.built_utc || '') + ') – not from this OFP.' : '';
      var dl = (D.deadlines || []).slice(), have = {};
      dl.forEach(function (d) { have[d.id] = 1; });
      (D.firs || []).forEach(function (f) {
        var e = FL[f.fir];
        if (!e) return;
        if (used.fir.indexOf(f.fir) < 0) used.fir.push(f.fir);
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
          var id = f.fir + '-logon', due = Math.max(0, f.eet_min - before), ad = (e.cpdlc && e.cpdlc.addr) || '';
          /* v3.7: a prepared flight that already has this log-on / call (same FIR, or the same time with this address) keeps its own line only */
          var dup = dl.some(function (d) { return (d.fir === f.fir && (Math.abs(d.eet - due) <= 2 || /log-?\s?on/i.test(d.text || ''))) || (ad && Math.abs(d.eet - due) <= 2 && (d.text || '').indexOf(ad) >= 0); });
          if (!have[id] && !dup) {
            var ro1 = rpFir(RP, f.fir, 1);
            /* v3.6: '+ estimate' only where a hand-written entry says so - the entries built by rule from the RSI tables give the log-on time only */
            dl.push({ id: id, fir: f.fir, name: f.name || e.name || '', eet: Math.max(0, f.eet_min - before),
              text: (ro1 && ro1.deadline ? ro1.deadline + ': by ' + hm(f.eet_min - before)
                : (e.cpdlc && e.cpdlc.addr ? 'CPDLC logon ' + e.cpdlc.addr + (e.auto ? '' : ' + estimate') : 'Call') + ' ' + before + ' min before: by ' + hm(f.eet_min - before)) });
            have[id] = 1;
          }
        }
      });
      D.deadlines = dl.sort(function (a, b) { return a.eet - b.eet; });
      /* the comms column: FIR boundary rows (and the first row) of an auto-built flight */
      var entryNo = {};
      (D.rows || []).forEach(function (r) {
        if (!auto && r.call) return;                       // a prepared flight keeps its own comms
        if (r.bnd || r.i === 0) {
          entryNo[r.fir] = (entryNo[r.fir] || 0) + 1; r.fir_n = entryNo[r.fir];
          var ro = rpFir(RP, r.fir, r.fir_n);              // v3.6: the route pack's VHF list / notes for this entry
          var e = FL[r.fir] || (ro ? { name: r.firname || '' } : null);
          if (!e) return;
          var f = (D.firs || []).filter(function (x) { return x.fir === r.fir; })[0];
          var html = commsHtml(r.fir, withRoute(e, ro), r.fir_eet != null ? r.fir_eet : (f ? f.eet_min : r.eet), { libNote: note, rpNote: ro ? rpNote : '' });   // v3.5.1: a re-entered FIR uses the time of this entry
          r.call = (r.i === 0 ? aptComms(aptOf(libs, fl.dep), 'dep') : '') + html;
        }
      });
      /* v3.6: the landing row also gets the destination's frequencies from its airport pack */
      var lastR = (D.rows || [])[(D.rows || []).length - 1];
      if (auto && lastR && lastR.i !== 0 && !lastR.aptc) { var ac = aptComms(aptOf(libs, fl.arr), 'arr'); if (ac) { lastR.call = (lastR.call || '') + ac; lastR.aptc = 1; } }
    }
    /* ---- v3.6 route pack: notes on the FIR boundary rows, on single waypoints and on the first waypoint of an airway */
    if (RP && !(pre && (D.rows || []).some(function (r) { return r.rp; }))) {
      var seenAw = {}, cnt = {};
      (D.rows || []).forEach(function (r) {
        if (r.bnd || r.i === 0) {
          var n = r.fir_n || (cnt[r.fir] = (cnt[r.fir] || 0) + 1);
          var o = rpFir(RP, r.fir, n);
          if (o) { addCell(r, 'special', o.special); addCell(r, 'threat', o.threat); }
        }
        var w = RP.wpts && RP.wpts[baseName(r.wpt)];
        if (w && (!w.fir || w.fir === r.fir)) { addCell(r, 'special', w.special); addCell(r, 'threat', w.threat); }
        var a = r.aw && RP.airways && RP.airways[r.aw];
        if (a && !seenAw[r.aw]) { seenAw[r.aw] = 1; addCell(r, 'special', a.special); addCell(r, 'threat', a.threat); }
      });
      used.route = rkey;
      if (rec.views && rec.views.tem && !has('tem', '<span>Route pack ' + esc(rkey) + '</span>')) {
        var th = rpTem(RP, D, rkey);
        rec.views.tem = rec.views.tem.indexOf('<!--rp-->') >= 0 ? rec.views.tem.replace('<!--rp-->', th) : rec.views.tem + th;
      }
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
          /* v3.7 (pilot 10 NOV: "only the AGC ... not all the charts. Too much information. Just a summary of the AOI and CCI. And notams."):
             the brief, then ONE ground chart, then the written summary; all other charts and the Lido items in full open with a button */
          var com = p.common || '', cut = com.indexOf('<h2 class="pt2">', com.indexOf('<h2 class="pt2">') + 10), nCh = (com.match(/<h2 class="pt2">/g) || []).length;
          var first = cut > 0 ? com.slice(0, cut).replace(/<small>\d+ Lido charts/, '<small>ground chart') : com, rest = cut > 0 ? com.slice(cut) : '';
          var body = p[side].html || ((p[side].top || '') + first + (p.summary || '') +
            (rest ? '<details class="omc morech"><summary><b>More charts (' + (nCh - 1) + ')</b> – the other ground, parking and facility charts of the pack</summary>' + rest + '</details>' : '') +
            (p.items ? '<details class="omc morech"><summary><b>Lido items in full</b> – CCI, AOI and AFC text, newest valid version of each</summary>' + p.items + '</details>' : ''));
          if (!body) return;
          if (has(side, '<span>Airport pack ' + esc(ic) + '</span>')) return;   // v3.7: already on the page (file with library content, or a second pass)
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
    /* v3.7: document links (DocuNet codes + section ids) kept in the regulations library - joined to what the flight file has, the flight file wins */
    if (libs && libs.regs && libs.regs.doclinks) {
      var LD = libs.regs.doclinks, FD = D.doclinks || {}, M = {}, k_;
      for (k_ in LD) M[k_] = LD[k_];
      for (k_ in FD) { if (k_ === 'docs' || k_ === 'ids' || k_ === 'apt') { var o_ = {}, j_; for (j_ in (LD[k_] || {})) o_[j_] = LD[k_][j_]; for (j_ in FD[k_]) o_[j_] = (k_ === 'docs' && o_[j_]) ? Object.assign({}, o_[j_], FD[k_][j_]) : FD[k_][j_]; M[k_] = o_; } else M[k_] = FD[k_]; }
      D.doclinks = M; used.links = true;
    }
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
      if (cards.length && rec.views && rec.views.tem && !has('tem', '<span>Countries on this route</span>')) {
        rec.views.tem += '<div class="bar"><span>Countries on this route</span><small>Lido CRAR / RSI from the regulations library – the Lido text is the authority</small></div>' + cards.join('');
        used.regs_cards = cards.length;
      }
    }
    /* the WAYPOINTS header and the TEM / DASH banners say what is loaded */
    if (auto && (used.fir.length || used.apt.length || used.route)) {
      var what = [];
      if (used.route) what.push('the route pack ' + used.route + ' (' + (RP.built || '') + ') – FIR procedures on this routing and threat → mitigation by phase');
      if (used.fir.length) what.push('comms, CPDLC log-on deadlines and FIR notes from the FIR comms library (' + used.fir.join(', ') + ')');
      if (used.apt.length) what.push('airport packs for ' + used.apt.join(', '));
      if (used.mel) what.push('the B777 MEL');
      rec.wpt_static = '<details class="omc"><summary><b>Auto-built from the OFP + stored libraries</b> – times, MORA and minimum fuel are the OFP navlog; ' +
        what.join('; ') + '.</summary><div class="tw"><table><thead><tr><th>FIR</th><th>From the flight plan</th><th>Comms library</th></tr></thead><tbody>' +
        (D.firs || []).map(function (f) {
          return '<tr><td><b>' + esc(f.fir) + '</b> ' + esc(f.name || '') + '</td><td>entry ' + hm(f.eet_min) + '</td><td>' +
            (used.fir.indexOf(f.fir) >= 0 ? 'loaded' : '<b>not loaded</b> – no frequencies for this FIR') + (rpFir(RP, f.fir, 1) ? ' · route notes' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div><p class="allf">The libraries are stored on this iPad and are used by every flight. ' +
        'The diversion column is the two nearest airports of the OFP list with the distance in NM – not a suitability check. ' +
        'What is still only in a Claude prep file: anything written for this day (NOTAM closures turned into a plan, MEL consequences, the weather read against your times).</p></details>';
      ['tem', 'dash'].forEach(function (k) {
        if (rec.views && rec.views[k]) rec.views[k] = rebar(rec.views[k], 'Loaded for this flight: ' + what.join('; ') + '.');
      });
    }
    D._lib = used;
    /* ---- v3.6 coverage: what came from where and what nothing covers - on DASH, with the list to send to Claude */
    if (auto) {
      try {
        var cv = cover(rec, libs || {}, RP, rkey);
        D.coverage = cv.data;
        if (rec.views && rec.views.dash && !has('dash', 'class="omc cov')) rec.views.dash = rec.views.dash.indexOf('<!--cov-->') >= 0 ? rec.views.dash.replace('<!--cov-->', cv.html) : rec.views.dash + cv.html;
      } catch (e) { if (typeof console !== 'undefined') console.log('coverage', e); }
    }
    return rec;
  };

  /* ---------------------------------------------------------------- v3.6 route pack -> TEM blocks (threat -> mitigation | ref) with today's times */
  function rpTem(RP, D, rkey) {
    var items = RP.tem || []; if (!items.length) return '';
    var seq = D.firseq || D.firs || [], trip = (D.flight || {}).trip || 0;
    function win(fir, n) { var c = 0; for (var i = 0; i < seq.length; i++) if (seq[i].fir === fir && ++c === n) return [seq[i].eet_min, i + 1 < seq.length ? seq[i + 1].eet_min : trip, seq[i].name || '']; return null; }
    var groups = [], by = {}, off = [];
    items.forEach(function (it) { var g = by[it.ph]; if (!g) { g = by[it.ph] = { ph: it.ph, items: [] }; groups.push(g); } g.items.push(it); });
    var tod = null; (D.events || []).forEach(function (e) { if (/^TOD/.test(e.text)) tod = e.eet_min; });
    groups.forEach(function (g) {
      var m = /^FIR:([A-Z]{4})(?:#(\d))?$/.exec(g.ph);
      if (m) {
        var w = win(m[1], +(m[2] || 1));
        if (!w) { g.skip = 1; off.push(m[1] + (m[2] ? ' (entry ' + m[2] + ')' : '')); return; }
        g.ord = w[0]; g.label = (w[2] || m[1]).toUpperCase() + ' FIR'; g.time = hm(w[0]) + '-' + hm(w[1]); g.cls = 'st-ENR';
      } else if (g.ph === 'PRE-FLIGHT') { g.ord = -2; g.label = 'PRE-FLIGHT'; g.time = 'before departure'; g.cls = 'st-DEP'; }
      else if (g.ph === 'DESCENT') { g.ord = tod == null ? trip - 26 : tod; g.label = 'DESCENT'; g.time = tod == null ? '' : 'TOD ' + hm(tod); g.cls = 'st-ARR'; }
      else { g.ord = -1; g.label = String(g.ph); g.time = ''; g.cls = 'st-ENR'; }
    });
    groups = groups.filter(function (g) { return !g.skip; }).sort(function (a, b) { return a.ord - b.ord; });
    var h = '<div class="bar"><span>Route pack ' + esc(rkey) + '</span><small>threat → mitigation | ref · written once (' + esc(RP.built || '') + '), times from this OFP</small></div>';
    groups.forEach(function (g) {
      h += '<div class="tem ' + g.cls + '"><div class="ph"><b>' + esc(g.label) + '</b><span>' + esc(g.time) + '</span></div><div class="its">';
      g.items.forEach(function (it) {
        h += '<div class="it"><div class="th"><b>' + fmt(it.t) + '</b> – ' + fmt(it.th) + '</div><div class="mi">→ ' + fmt(it.mi) + '</div><div class="ref">' + esc(it.ref || '') + '</div></div>';
      });
      h += '</div></div>';
    });
    h += '<p class="allf">' + esc(RP.src || '') + ' Static notes only: weather, NOTAMs, MEL and fuel of the day are in the tables below, from this OFP.' +
      (off.length ? ' <b>Left out, not on today\'s route:</b> ' + esc(off.join(', ')) + '.' : '') + '</p>';
    return h;
  }

  /* ---------------------------------------------------------------- v3.6 coverage report */
  var ROLE = { DEP: 'departure', DEST: 'destination', ALTN: 'alternate', ETOPS: 'ETOPS', ENR: 'en-route' }, RORD = ['DEP', 'DEST', 'ALTN', 'ETOPS', 'ENR'];
  function packKind(p) {
    if (!p) return null;
    var src = String((p.dep && p.dep.src) || (p.arr && p.arr.src) || '');
    if (p.has && p.has.brief) return { k: 'brief', t: 'written brief + charts' };
    if (/^EK\d+\s/.test(src) && ((p.dep && p.dep.html) || (p.arr && p.arr.html))) return { k: 'prep', t: 'from a prepared flight (brief + AGC of that day)' };
    if (p.has && p.has.afc) return { k: 'afc', t: 'Lido text + AFC picture' + (p.div ? ' + diversion card' : '') };
    return { k: 'text', t: 'Lido text only' + (p.div ? ' + diversion card' : ', no diversion card') };
  }
  function cover(rec, libs, RP, rkey) {
    var D = rec.data, fl = D.flight || {}, AP = (libs.apt && libs.apt.airports) || {}, FL = (libs.fir && libs.fir.firs) || null;
    var now = Date.now(), miss = [], A = [], F = [], k;
    /* --- airports by role */
    var roles = {};
    (D.apts || []).forEach(function (a) { if (!roles[a.icao]) roles[a.icao] = a.cls; });
    if (!D.apts) {
      if (fl.dep) roles[fl.dep] = 'DEP'; if (fl.arr) roles[fl.arr] = 'DEST';
      (D.alts || []).forEach(function (a) { if (a.icao && !roles[a.icao]) roles[a.icao] = 'ALTN'; });
      L.icaos(rec).forEach(function (ic) { if (!roles[ic]) roles[ic] = 'ENR'; });
    }
    Object.keys(roles).sort(function (a, b) { return (RORD.indexOf(roles[a]) - RORD.indexOf(roles[b])) || (a < b ? -1 : 1); }).forEach(function (ic) {
      var p = AP[ic], cls = roles[ic], pk = packKind(p), o = { icao: ic, role: cls, pack: pk ? pk.k : null, what: pk ? pk.t : '', date: '', rev: '', age: null, st: 'ok', why: '' };
      if (p) {
        var sideP = cls === 'DEST' ? p.arr : p.dep;
        o.date = p.built || (sideP && sideP.date) || (p.dep && p.dep.date) || (p.arr && p.arr.date) || ''; o.rev = p.rev || '';
        var t = Date.parse(o.date); if (!isNaN(t)) o.age = Math.floor((now - t) / 864e5);
        if ((cls === 'DEP' || cls === 'DEST') && pk.k === 'prep') {   // cut from a flight prepared by hand: its brief carries that day's NOTAMs and runway
          var sd = cls === 'DEP' ? p.dep : p.arr, other = !(sd && sd.html) ;
          o.st = 'part'; o.why = 'brief written for ' + String(((sd && sd.src) || (p.dep && p.dep.src) || (p.arr && p.arr.src) || '')).replace(/\s*\(.*$/, '') + ' of ' + o.date + (other ? ' (other side only)' : '') + ' – it holds that day\'s NOTAMs; no day-free brief yet';
        }
        else if ((cls === 'DEP' || cls === 'DEST') && pk.k !== 'brief') { o.st = 'part'; o.why = 'no written brief'; }
        else if ((cls === 'ALTN' || cls === 'ETOPS') && !p.div) { o.st = 'part'; o.why = 'no diversion card'; }
        if (o.age != null && o.age > 28) { o.st = o.st === 'ok' ? 'old' : o.st; o.why = (o.why ? o.why + '; ' : '') + o.age + ' days old (Lido cycle 28 days)'; }
      } else { o.st = 'no'; o.why = 'no pack'; }
      A.push(o);
    });
    var noPack = A.filter(function (a) { return a.st === 'no'; }), part = A.filter(function (a) { return a.st === 'part'; }), old = A.filter(function (a) { return a.age != null && a.age > 28; });
    RORD.forEach(function (r) {
      var l = noPack.filter(function (a) { return a.role === r; }); if (l.length) miss.push('Airport packs missing (' + ROLE[r] + '): ' + l.map(function (a) { return a.icao; }).join(', '));
    });
    if (part.length) miss.push('Airport packs incomplete: ' + part.map(function (a) { return a.icao + ' (' + ROLE[a.role] + ', ' + a.why.replace(/;.*$/, '') + ')'; }).join(', '));
    if (old.length) miss.push('Airport packs older than 28 days - refresh from DocuNet: ' + old.map(function (a) { return a.icao + ' (' + a.date + ')'; }).join(', '));
    /* --- FIRs */
    var seenF = {}, nth = {}, sq = D.firseq || D.firs || [], lastFir = sq.length ? sq[sq.length - 1].fir : null;
    (D.firseq || D.firs || []).forEach(function (f) {
      nth[f.fir] = (nth[f.fir] || 0) + 1;
      if (seenF[f.fir]) return; seenF[f.fir] = 1;
      var e0 = FL && FL[f.fir], ro = rpFir(RP, f.fir, 1), e = e0 || ro ? withRoute(e0 || {}, ro) : null;
      var vhf = !!(e && (e.vhf || []).filter(function (v) { return v.f; }).length), viaApt = false;
      if (!vhf && f.fir === lastFir && AP[fl.arr] && AP[fl.arr].div && (AP[fl.arr].div.freqs || []).length) { vhf = true; viaApt = true; }   // entered on the arrival: the airport pack's frequencies
      var o = { fir: f.fir, apt: viaApt, name: f.name || (e0 && e0.name) || '', eet: f.eet_min, lib: e0 ? (e0.auto ? 'rule' : 'hand') : null, vhf: vhf,
        cpdlc: e0 ? (e0.cpdlc && e0.cpdlc.addr ? e0.cpdlc.addr : (e0.cpdlc === null ? 'none' : '')) : '', rp: !!ro };
      F.push(o);
    });
    var noFir = F.filter(function (f) { return !f.lib; }), noVhf = F.filter(function (f) { return f.lib && !f.vhf; });
    if (noFir.length) miss.push('FIRs with no comms entry: ' + noFir.map(function (f) { return f.fir; }).join(', '));
    if (noVhf.length) miss.push('FIRs with no VHF frequency for this route: ' + noVhf.map(function (f) { return f.fir + (f.name ? ' ' + f.name : ''); }).join(', '));
    /* --- route pack against today's route */
    var skipW = /^(TOC\d?|TOD\d?|BOD\d?|BOC\d?|ENTRY\d|EXIT\d|ETP\d.*|Stand \/ taxi|FIR boundary|T\/O.*|Final.*)$/;
    var today = [], awToday = [];
    (D.rows || []).forEach(function (r) {
      var n = baseName(r.wpt); if (r.i !== 0 && !r.syn && !skipW.test(r.wpt) && !skipW.test(n) && n !== fl.arr && today.indexOf(n) < 0) today.push(n);
      if (r.aw && r.aw !== 'DCT' && awToday.indexOf(r.aw) < 0) awToday.push(r.aw);
    });
    var R = { key: rkey, pack: !!RP, rows: (D.rows || []).length, noted: (D.rows || []).filter(function (r) { return r.rp; }).length };
    function normRt(s) { return String(s || '').replace(/\/\S+/g, '').replace(/\s+/g, ' ').trim(); }
    if (RP) {
      R.built = RP.built || ''; R.src = RP.src || '';
      var best = null;
      (RP.seen || []).forEach(function (sn) {
        var nw = today.filter(function (w) { return (sn.wpts || []).indexOf(w) < 0; });
        if (!best || nw.length < best.nw.length) best = { sn: sn, nw: nw };
      });
      if (best) {
        R.seen = best.sn.ofp; R.same = !!D.ofp_route && normRt(D.ofp_route) === normRt(best.sn.route);
        R.new_wpts = best.nw; R.gone = (best.sn.wpts || []).filter(function (w) { return today.indexOf(w) < 0; });
        R.new_aw = awToday.filter(function (a) { return (best.sn.airways || []).indexOf(a) < 0; });
      }
      R.fir_no_note = F.filter(function (f) { return !f.rp && f.eet > 0; }).map(function (f) { return f.fir; });
      R.fir_new = F.filter(function (f) { return best && (best.sn.firs || []).indexOf(f.fir) < 0 && f.eet > 0; }).map(function (f) { return f.fir; });
      if (best && !R.same && (R.new_wpts.length || R.new_aw.length || R.fir_new.length))
        miss.push('Route differs from the route pack (' + best.sn.ofp + '): ' + [R.new_wpts.length ? 'new waypoints ' + R.new_wpts.join(' ') : '', R.new_aw.length ? 'new airways ' + R.new_aw.join(' ') : '',
          R.fir_new.length ? 'new FIRs ' + R.fir_new.join(' ') : ''].filter(Boolean).join('; ') + '. Today: ' + (D.ofp_route || '-'));
      else if (R.fir_no_note.length) miss.push('Route pack ' + rkey + ' has no note for: ' + R.fir_no_note.join(', '));
    } else miss.push('No route pack for ' + rkey + ' - FIR procedures on this routing, lessons and threat / mitigation are not written yet. Route: ' + (D.ofp_route || '-'));
    /* --- the OFP itself and the other libraries */
    var au = D.auto || {}, wxna = (D.wx || []).filter(function (w) { return !w.taf || /NOT AVAILABLE/i.test(w.taf); }).map(function (w) { return w.icao; });
    (au.note || []).forEach(function (n) { miss.push('OFP reader: ' + n); });
    if (wxna.length) miss.push('No TAF in this OFP for ' + wxna.length + ' of ' + (D.wx || []).length + ' stations (' + wxna.slice(0, 8).join(', ') + (wxna.length > 8 ? ' …' : '') + ') - use Refresh online on the weather page');
    if (!libs.mel) miss.push('MEL library not loaded');
    if (!libs.regs) miss.push('Regulations library (CRAR / RSI) not loaded');
    if (!libs.fir) miss.push('FIR comms library not loaded');
    var data = { apt: A, fir: F, route: R, wx_na: wxna, missing: miss };
    /* --- text for Claude */
    var hd = (fl.flight || '') + ' ' + (fl.dep || '') + '-' + (fl.arr || '') + ' ' + (D.date || '') + ' · ' + (au.src || '') + ' · Flight Prep ' + ((typeof window !== 'undefined' && window.FP_APP_VERSION) || '');
    var txt = 'Flight Prep coverage - ' + hd + '\nNOT COVERED (' + miss.length + '):\n' + (miss.length ? miss.map(function (m) { return '- ' + m; }).join('\n') : '- nothing: every airport, FIR and the route have an entry') +
      '\nUSED: ' + A.filter(function (a) { return a.pack; }).length + ' of ' + A.length + ' airport packs; FIR entries ' + F.filter(function (f) { return f.lib; }).length + ' of ' + F.length + ' (' + F.filter(function (f) { return f.vhf; }).length + ' with VHF); route pack ' + (RP ? rkey + ' ' + (RP.built || '') : 'none') + '.';
    data.text = txt;
    /* --- the block on DASH */
    var st = function (c, t) { return '<b class="cv' + c + '">' + t + '</b>'; };
    var nA = A.filter(function (a) { return a.pack; }).length, nV = F.filter(function (f) { return f.vhf; }).length;
    var h = '<details class="omc cov' + (miss.length ? ' covbad' : '') + '"><summary><b>Coverage</b> – ' + nA + ' of ' + A.length + ' airports with a pack · ' + F.filter(function (f) { return f.lib; }).length + ' of ' + F.length + ' FIRs with comms (' + nV + ' with VHF) · ' +
      (RP ? 'route pack ' + esc(rkey) : '<b class="cvno">no route pack</b>') + ' · ' + (miss.length ? '<b class="cvno">' + miss.length + ' not covered</b>' : '<b class="cvok">all covered</b>') + '</summary>';
    h += '<p class="allf">What this build took from the OFP, from which stored library and by which rule – and what nothing covers. The list at the bottom is what to send to Claude once; after that the OFP alone is enough for this route.</p>';
    h += '<div class="bar"><span>Route</span><small>' + esc(rkey) + '</small></div><ul class="gpl">';
    if (RP) {
      h += '<li>' + st('ok', 'Route pack') + ' ' + esc(rkey) + ' – built ' + esc(R.built) + '. ' + esc(R.src) + '</li>';
      if (R.seen) h += '<li>' + (R.same ? st('ok', 'Same route') + ' as ' + esc(R.seen) + '.' : (R.new_wpts.length || R.new_aw.length || R.fir_new.length ? st('no', 'Route differs') : st('ok', 'Route known')) + ' – closest: ' + esc(R.seen) + '.' +
        (R.new_wpts.length ? ' New waypoints: <b>' + esc(R.new_wpts.join(' ')) + '</b>.' : '') + (R.new_aw.length ? ' New airways: <b>' + esc(R.new_aw.join(' ')) + '</b>.' : '') + (R.fir_new.length ? ' New FIRs: <b>' + esc(R.fir_new.join(' ')) + '</b>.' : '') +
        (R.gone.length ? ' Not flown today: ' + esc(R.gone.join(' ')) + '.' : '')) + '</li>';
      h += '<li>' + R.noted + ' of ' + R.rows + ' waypoint rows carry a route-pack note; ' + ((RP.tem || []).length) + ' threat → mitigation items on TEM.</li>';
    } else h += '<li>' + st('no', 'No route pack') + ' for ' + esc(rkey) + ' – the rows carry only what the OFP and the FIR library give.</li>';
    h += '<li>Diversion column: by rule – the two nearest airports of the OFP list (distance, not suitability).</li></ul>';
    h += '<div class="bar"><span>FIRs</span><small>comms from the FIR library, route notes from the route pack</small></div><div class="tw"><table class="cvt"><thead><tr><th>FIR</th><th>Entry</th><th>Comms entry</th><th>VHF</th><th>CPDLC</th><th>Route notes</th></tr></thead><tbody>';
    F.forEach(function (f) {
      h += '<tr><td><b>' + esc(f.fir) + '</b> ' + esc(f.name) + '</td><td>' + hm(f.eet) + '</td><td>' + (f.lib === 'hand' ? st('ok', 'written by hand') : f.lib === 'rule' ? st('ok', 'by rule') + ' (RSI tables)' : st('no', 'none')) + '</td><td>' +
        (f.vhf ? st('ok', f.apt ? 'airport pack' : 'yes') : st('no', 'not covered')) + '</td><td>' + (f.cpdlc === 'none' ? 'none (RSI)' : esc(f.cpdlc || '-')) + '</td><td>' + (f.rp ? st('ok', 'yes') : (RP ? st('w', 'no') : '-')) + '</td></tr>';
    });
    h += '</tbody></table></div>';
    h += '<div class="bar"><span>Airports</span><small>' + nA + ' of ' + A.length + ' with a pack · Lido revision and date of the pack</small></div><div class="tw"><table class="cvt"><thead><tr><th>Airport</th><th>Role</th><th>Pack</th><th>Lido rev · date</th><th>Status</th></tr></thead><tbody>';
    A.forEach(function (a) {
      h += '<tr><td><b>' + esc(a.icao) + '</b></td><td>' + esc(ROLE[a.role] || a.role) + '</td><td>' + (a.pack ? esc(a.what) : '-') + '</td><td>' + esc([a.rev ? 'rev ' + a.rev : '', a.date, a.age != null ? a.age + ' d' : ''].filter(Boolean).join(' · ') || '-') + '</td><td>' +
        (a.st === 'ok' ? st('ok', 'ok') : a.st === 'no' ? st('no', 'no pack') : st('w', esc(a.why))) + '</td></tr>';
    });
    h += '</tbody></table></div>';
    h += '<div class="bar"><span>From this OFP</span><small>' + esc(au.src || '') + '</small></div><ul class="gpl"><li>' + (D.rows || []).length + ' waypoint rows, ' + (D.firseq || D.firs || []).length + ' FIR entries, ' + (D.notams || []).length + ' airport NOTAMs, ' +
      (D.rnotams || []).length + ' en-route NOTAMs, ' + (D.crew_alert || []).length + ' crew alerts, weather for ' + (D.wx || []).length + ' stations' + (wxna.length ? ' – <b class="cvno">no TAF for ' + wxna.length + '</b>' : '') + '.</li>' +
      ((au.note || []).length ? '<li>' + st('no', 'Reader notes') + ' ' + esc((au.note || []).join(' ')) + '</li>' : '<li>' + st('ok', 'Reader') + ' no section missing.</li>') +
      '<li>By rule from the OFP: FIR times (flight-plan EET), ETOPS / ETP rows, MORA flags, step climbs, SIGMET by FIR and time, NOTAM new / short flags, TAF flags at T/O and ETA.</li>' +
      '<li>Not judged by any rule: what a NOTAM means for the taxi route or the approach, MEL consequences, and the weather story of the day.</li></ul>';
    h += '<div class="bar"><span>Not covered – the list for Claude</span><small>' + miss.length + ' items</small></div><textarea id="cov-txt" class="covtxt" readonly rows="' + Math.min(14, miss.length + 4) + '">' + esc(txt) + '</textarea>' +
      '<p><button type="button" class="pri" data-act="x-covcopy">Copy the list</button></p></details>';
    return { data: data, html: h };
  }
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
    if (kind === 'route') {
      existing.routes = existing.routes || {};
      Object.keys(incoming.routes || {}).forEach(function (k) { existing.routes[k] = incoming.routes[k]; });
      existing.built_utc = incoming.built_utc || existing.built_utc;
      existing.title = 'Route packs (' + Object.keys(existing.routes).length + ')';
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
    if (l.kind === 'route') return 'Route packs: <b>' + Object.keys(l.routes || {}).sort().join(', ') + '</b>';
    if (l.kind === 'regs') return 'Regulations: <b>' + (l.countries || []).length + ' countries, ' + (l.regions || []).length + ' regions</b>';
    return esc(l.title || l.kind);
  };
  if (typeof window !== 'undefined') window.FPLib = L;
  if (typeof module !== 'undefined' && module.exports) module.exports = L;
})();
