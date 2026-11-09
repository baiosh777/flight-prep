/* fp_refs.js v3.0 (09 NOV 26) - document references in the pack text become tappable (user: "references in the CCI / AOI or any CRAR
   to be links sending me to the corresponding document - the charts app or DocuNet"). A tap opens a card with: the document and chapter,
   the matching text captured in this flight file (AOI pages, FIR procedures), and buttons that open the document in DocuNet / the charts
   app. The links themselves come from the flight file (data.doclinks) - this shell holds no company addresses. Without doclinks the card
   still shows where the reference lives (document, chapter, page when known) so you can open it yourself. */
(function () {
  'use strict';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  // one regex, alternatives in the order they are tried; group 1 = document key, group 2 = the reference as written
  var RX = /\b((?:Lido\s+)?(?:RSI|CRAR|GEN|RM)\s+\d+(?:\.\d+)+|(?:Lido\s+)?(?:AOI|CCI|AFC|AGC|APC|IAC|SID|STAR|CCI)\s+\d+(?:[-.]\d+)+[A-Za-z]?|(?:Lido\s+)?(?:AOI|CCI)\b(?=[\s,.;:)])|OM-?[ABCD](?![A-Z0-9])(?:\s+\d+(?:\.\d+)*)?|FCOM\s+(?:NP|SP|QRH|\d+)[.\w]*|FCTM(?:\s+\d+(?:\.\d+)*)?|QRH(?:\s+[A-Z]{1,3}\.\d+(?:\.\d+)*|\s+\d+(?:\.\d+)*)?|RAIG(?:\s+[A-Z]\d*)?|FCI\s*\d+|FCN\s*\d{4}-\d+|(?:MEL|CDL)\s+\d{2}-\d{2}-\d{2}(?:-\d{2})?[A-Z]?|\b[A-Z]{1,2}\d{3,5}\/\d{2}\b|\bCC\d{2,3}(?:\/\d{2})?\b|\bCO\d{3,4}(?:\/\d{2})?\b|AIP\s+(?:SUP\s+)?\d+\/\d+)/g;
  var DOCS = {
    RSI: ['Lido Route Manual – RSI (Regional Supplementary Information)', 'rsi'], CRAR: ['Lido Route Manual – CRAR (country rules and regulations)', 'crar'], GEN: ['Lido Route Manual – GEN', 'rm'], RM: ['Lido Route Manual', 'rm'],
    AOI: ['Lido airport briefing – AOI (Airport Operational Information)', 'apt'], CCI: ['Lido airport briefing – CCI (Company Crew Information)', 'apt'], AFC: ['Lido chart – AFC (airport facility chart)', 'apt'], AGC: ['Lido chart – AGC (airport ground chart)', 'apt'], APC: ['Lido chart – APC (parking chart)', 'apt'], IAC: ['Lido chart – IAC (instrument approach)', 'apt'], SID: ['Lido chart – SID', 'apt'], STAR: ['Lido chart – STAR', 'apt'],
    'OM-A': ['Operations Manual Part A', 'oma'], 'OM-B': ['Operations Manual Part B', 'omb'], 'OM-C': ['Operations Manual Part C (route / area)', 'omc'], 'OM-D': ['Operations Manual Part D', 'omd'], FCOM: ['B777 FCOM', 'fcom'], FCTM: ['B777 FCTM', 'fctm'], QRH: ['B777 QRH', 'qrh'], RAIG: ['RAIG Performance (driftdown / depressurisation)', 'raig'],
    MEL: ['B777 MEL', 'mel'], CDL: ['B777 CDL', 'mel'], FCI: ['Flight Crew Instruction', 'fci'], FCN: ['Flight Crew Notice', 'fcn'], AIP: ['State AIP / AIP Supplement', 'aip'], NOTAM: ['NOTAM in the OFP bulletin', 'notam'], CO: ['Company NOTAM (OFP crew alert)', 'notam']
  };
  function keyOf(t) {
    var u = t.replace(/^Lido\s+/i, '').toUpperCase();
    if (/^OM-?[ABCD]/.test(u)) return 'OM-' + u.charAt(u.length - 1 === 2 ? 2 : (u.charAt(2) === '-' ? 3 : 2));
    if (/^CC\d/.test(u) || /^[A-Z]{1,2}\d{3,5}\/\d{2}$/.test(u)) return 'NOTAM';
    if (/^CO\d/.test(u)) return 'CO';
    var m = /^([A-Z]+)/.exec(u); return m ? m[1] : u;
  }
  function wrap(root) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: function (n) {
      var p = n.parentNode; if (!p || !n.nodeValue || n.nodeValue.length < 3) return NodeFilter.FILTER_REJECT;
      if (p.closest('button, a, input, textarea, select, svg, .refl, .mref, .agcwrap, .amwrap, #wpt thead, .cs, .fl, script, style')) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT; } }), list = [], n;
    while ((n = walker.nextNode())) { RX.lastIndex = 0; if (RX.test(n.nodeValue)) list.push(n); }
    list.forEach(function (tn) {
      var s = tn.nodeValue, frag = document.createDocumentFragment(), last = 0, m; RX.lastIndex = 0;
      while ((m = RX.exec(s))) {
        var k = keyOf(m[1]); if (!DOCS[k]) continue;
        if (m.index > last) frag.appendChild(document.createTextNode(s.slice(last, m.index)));
        var b = document.createElement('button'); b.type = 'button'; b.className = 'refl k-' + DOCS[k][1]; b.textContent = m[1]; b.setAttribute('data-ref', m[1]); b.setAttribute('data-k', k); b.title = DOCS[k][0];
        frag.appendChild(b); last = m.index + m[1].length;
      }
      if (last === 0) return;
      if (last < s.length) frag.appendChild(document.createTextNode(s.slice(last)));
      tn.parentNode.replaceChild(frag, tn);
    });
  }
  function scan(root) { try { wrap(root || document.getElementById('main')); } catch (e) { if (window.console) console.error('FPRefs', e); } }
  /* context: which airport does an AOI / CCI reference belong to? the nearest [data-icao], else the page (dep / arr) */
  function icaoOf(el) {
    var c = el.closest('[data-icao]'); if (c) return c.getAttribute('data-icao');
    var v = el.closest('.view'); var F = window.FPData && window.FPData.flight;
    if (v && F) { if (v.dataset.view === 'dep') return F.dep; if (v.dataset.view === 'arr') return F.arr; }
    var t = el.closest('details, .dvc, .wxc, article, tr'); if (t) { var m = /\b([A-Z]{4})\b/.exec(t.textContent); if (m && /^[OVU][A-Z]{3}$|^[A-Z]{4}$/.test(m[1])) return m[1]; }
    return F ? F.arr : '';
  }
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest('.refl'); if (!b) return;
    ev.preventDefault(); ev.stopPropagation();
    if (window.FPOpenRef) window.FPOpenRef({ ref: b.getAttribute('data-ref'), k: b.getAttribute('data-k'), doc: DOCS[b.getAttribute('data-k')], icao: icaoOf(b) });
  }, true);
  window.FPRefs = { scan: scan, DOCS: DOCS, keyOf: keyOf, RX: RX };
})();
