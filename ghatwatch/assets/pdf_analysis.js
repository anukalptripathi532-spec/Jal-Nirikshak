/* Reads DO / BOD / pH table rows out of MPPCB immersion-report pages.
 *
 * Input: for each page, the text items pdf.js reports: { str, x, y, w } (PDF units, y grows upwards).
 * The reports print one table per site with columns "Pre Immersion", "During Immersion", "After one week".
 * We rebuild lines from the y positions and put each number in the column whose header it sits under.
 *
 * It never guesses: a row is "clear" only when its values fall on the three column positions and are
 * physically plausible. Anything else is marked "partial" or "check" so a person looks at the page.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GWPdf = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var PHASES = ['pre', 'during', 'after'];
  var RANGE = { DO: [0, 25], BOD: [0, 500], pH: [0, 14] };       // physically possible, not limits
  var VALUE = /^(\d+(?:\.\d+)?|\.\d+|BDL|ND|NIL|_+|-+|\*{1,3})$/i;
  var NUMBER = /^(\d+(?:\.\d+)?|\.\d+)$/;

  function paramOf(label) {
    var s = (label || '').replace(/^\s*\d+\s*/, '').trim();
    if (/^ph\b/i.test(s)) return 'pH';
    if (/(^|\s)(d\.?\s*oxygen|dissolved\s*oxygen)\b/i.test(s) && !/solid/i.test(s)) return 'DO';
    if (/^bod\b/i.test(s)) return 'BOD';
    return '';
  }

  function toLines(items) {
    var its = items.filter(function (i) { return i.str && i.str.trim(); })
      .map(function (i) { return { s: i.str.trim(), x: i.x, y: i.y, w: i.w || 0 }; })
      .sort(function (a, b) { return b.y - a.y || a.x - b.x; });
    var lines = [];
    its.forEach(function (it) {
      var ln = lines[lines.length - 1];
      if (ln && Math.abs(ln.y - it.y) <= 4) ln.items.push(it);
      else lines.push({ y: it.y, items: [it] });
    });
    lines.forEach(function (l) { l.items.sort(function (a, b) { return a.x - b.x; }); l.text = l.items.map(function (i) { return i.s; }).join(' '); });
    return lines;
  }

  function createParser(opts) {
    opts = opts || {};
    var aliases = opts.aliases || [];                 // [{ idx, keys: ['khatlapura', ...] }]
    var st = { year: opts.year || null, festival: opts.festival || null, site: -1, siteText: '', fresh: false, done: true, cols: null, headerOnPage: false, table: 0 };
    var rows = [], pagesWithText = 0, tablesSeen = 0, pagesSeen = 0;

    function matchSite(text) {
      var t = (text || '').toLowerCase();
      for (var i = 0; i < aliases.length; i++) for (var k = 0; k < aliases[i].keys.length; k++) if (t.indexOf(aliases[i].keys[k]) > -1) return aliases[i].idx;
      return -1;
    }
    var center = function (it) { return it.x + it.w / 2; };

    function colOf(it) {
      if (!st.cols) return '';
      var c = center(it), best = '', bd = 1e9;
      PHASES.forEach(function (p) { var d = Math.abs(c - st.cols[p]); if (d < bd) { bd = d; best = p; } });
      var gap = Math.min(Math.abs(st.cols.during - st.cols.pre), Math.abs(st.cols.after - st.cols.during));
      return bd <= gap * 0.45 ? best : '';
    }

    function addPage(items, pageNo) {
      pagesSeen++; st.headerOnPage = false;
      var lines = toLines(items);
      if (!lines.length) return;
      pagesWithText++;
      lines.forEach(function (ln) {
        var txt = ln.text, m;
        if ((m = txt.match(/\b(Ganesha?|Durga)\b[^.]{0,20}Immersion/i))) st.festival = /durga/i.test(m[1]) ? 'Durga' : 'Ganesh';
        // Year only from the places the reports put it (never from prose such as "issued in the year 2010").
        ln.items.forEach(function (i) { var y = i.s.match(/^YEAR\s*[-:]?\s*(20\d\d)$/i); if (y) st.year = +y[1]; });
        if ((m = txt.match(/Immersion\s*[-–]\s*(20\d\d)\s*$/i))) st.year = +m[1];
        if (ln.items.every(function (i) { return /^20\d\d$/.test(i.s); })) st.year = +ln.items[0].s;

        // column header: positions of Pre / During / After
        var hp = ln.items.filter(function (i) { return /pre\s*immersion/i.test(i.s); })[0];
        var hd = ln.items.filter(function (i) { return /during\s*immersion/i.test(i.s); })[0];
        var ha = ln.items.filter(function (i) { return /after\s*one\s*week/i.test(i.s); })[0];
        if (hp && hd && ha) {
          st.cols = { pre: center(hp), during: center(hd), after: center(ha) };
          // No new heading since the last table header: reuse the site only when that table was split across pages
          // (it has not reached its last row, Copper). Otherwise the site is unknown; never guess.
          if (!st.fresh && st.done) { st.site = -1; st.siteText = ''; }
          st.fresh = false; st.done = false; st.headerOnPage = true; st.table++; return;
        }
        if (ha && st.cols) st.cols.after = center(ha);

        // site heading (may share a line with table text on scrambled pages, so work per item)
        var heading = ln.items.filter(function (i) {
          if (/^r\.?\s*o\.?\s*bhopal/i.test(i.s) || i.s.length <= 12) return false;
          return /bhopal/i.test(i.s) || (/(visarjan|ghat|kund|lake|dam)/i.test(i.s) && matchSite(i.s) > -1);
        })[0];
        if (heading) {
          st.siteText = heading.s.replace(/^location\s*[-:–]?\s*/i, '');
          st.site = matchSite(heading.s); st.fresh = true; tablesSeen++;
        }
        if (!st.cols) return;
        if (/^\s*\d*\s*copper\b/i.test(ln.items.map(function (i) { return i.s; }).filter(function (t, k) { return k < 2; }).join(' '))) st.done = true;

        // parameter row: label sits left of the first column
        var leftLimit = st.cols.pre - (st.cols.during - st.cols.pre) * 0.45;
        var labelItems = ln.items.filter(function (i) { return i !== heading && i.x + i.w * 0.5 < leftLimit; });
        var p = paramOf(labelItems.map(function (i) { return i.s; }).join(' '));
        if (!p) return;
        var cells = { pre: null, during: null, after: null }, stray = 0;
        ln.items.forEach(function (it) {
          if (it === heading || labelItems.indexOf(it) > -1) return;
          if (!VALUE.test(it.s)) { stray++; return; }
          var c = colOf(it);
          if (!c) { stray++; return; }
          if (cells[c]) { stray++; return; }
          cells[c] = it.s;
        });
        var got = PHASES.filter(function (k) { return cells[k] !== null; }).length;
        var vals = {}, implausible = false;
        PHASES.forEach(function (k) {
          var raw = cells[k];
          if (raw === null) { vals[k] = { raw: '', v: null, state: 'blank' }; return; }
          if (NUMBER.test(raw)) {
            var v = parseFloat(raw);
            if (v < RANGE[p][0] || v > RANGE[p][1]) implausible = true;
            vals[k] = { raw: raw, v: v, state: 'num' };
          } else vals[k] = { raw: raw, v: null, state: /^bdl$|^nd$|^nil$/i.test(raw) ? 'low' : 'missing' };
        });
        if (st.site < 0 && !st.headerOnPage) return;   // a lake or summary table, not an immersion table
        var conf = implausible || stray || !!heading ? 'check' : got === 3 ? 'clear' : 'partial';
        rows.push({ page: pageNo, param: p, site: st.site, siteText: st.siteText, year: st.year, festival: st.festival, table: st.table, cells: vals, conf: conf, line: txt });
      });
    }

    return {
      addPage: addPage,
      result: function () { return { rows: rows, pages: pagesSeen, pagesWithText: pagesWithText, tables: tablesSeen }; }
    };
  }

  return { createParser: createParser, paramOf: paramOf };
});
