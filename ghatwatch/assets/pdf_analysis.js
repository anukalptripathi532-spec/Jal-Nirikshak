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

  /* Monthly lake-monitoring tables (MPPCB "Water Quality during Year - 2023-24"): one row per test, one column per
   * month April..March, then Av. / Maxi. / Mini.  Labels vary across years ("B.O.D", "D. Oxygen", "Dissolved"). */
  var MONTHS = ['apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec', 'jan', 'feb', 'mar'];   // financial-year order
  function monthOf(s) {
    var m = (s || '').toLowerCase().match(/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(\s*\(.*)?$/);
    return m ? MONTHS.indexOf(m[1]) : -1;
  }
  function summaryOf(s) {
    if (/^av(g|erage)?\.?$/i.test(s)) return 'avg';
    if (/^max(i|imum)?\.?$/i.test(s)) return 'max';
    if (/^min(i|imum)?\.?$/i.test(s)) return 'min';
    return '';
  }
  function monthlyParamOf(label) {
    var s = (label || '').replace(/^\s*\d+\s*/, '').trim().toLowerCase().replace(/\s*\.\s*/g, '.');
    if (/solid|demand\s*\(c|chemical|c\.?\s*o\.?\s*d/.test(s)) return '';
    if (/^p\.?\s*h\b/.test(s)) return 'pH';
    if (/^b\.?\s*o\.?\s*d\b|biochemical\s*oxygen|bio-?\s*chemical\s*oxygen/.test(s)) return 'BOD';
    if (/^d\.?\s*o\.?(\s|$)|^(d|dis|diss)\.?\s*oxygen|dissolved\s*oxygen|^dissolved(\s+mg|\s*$)/.test(s)) return 'DO';
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
    var ms = { cols: null, fy: null, fyLabel: '', water: '', station: '', table: 0 }, mrows = [];

    // Text printed after "Label :" on the same line, without trailing ids such as "XGN ID: 22114" or "Cat - B".
    function afterLabel(ln, re) {
      var t = ln.text.replace(re, '').replace(/^\s*:?\s*/, '');
      return t.replace(/\s*\|?\s*XGN\s*ID.*$/i, '').replace(/\s*\(?\s*code\s*\d+\s*\)?/i, '').replace(/[.\s]*Cat\.?\s*[-–]?\s*[A-E]\s*$/i, '').replace(/\s+\d{3,6}\s*$/, '').replace(/\s+/g, ' ').replace(/[.\s]+$/, '').trim();
    }

    // Month columns from the header; a month whose name was not readable is placed between its neighbours.
    function buildCols(mx, sx) {
      var known = Object.keys(mx).map(Number).sort(function (a, b) { return a - b; });
      var steps = [];
      for (var i = 1; i < known.length; i++) steps.push((mx[known[i]] - mx[known[i - 1]]) / (known[i] - known[i - 1]));
      steps.sort(function (a, b) { return a - b; });
      var step = steps[Math.floor(steps.length / 2)];
      ms.spacing = step;
      var cols = [];
      for (var k = 0; k < 12; k++) {
        var x = mx[k];
        if (x === undefined) {
          var lo = known.filter(function (m) { return m < k; }).pop(), hi = known.filter(function (m) { return m > k; })[0];
          x = lo !== undefined && hi !== undefined ? mx[lo] + (mx[hi] - mx[lo]) * (k - lo) / (hi - lo)
            : lo !== undefined ? mx[lo] + step * (k - lo) : mx[hi] - step * (hi - k);
        }
        cols.push({ m: k, x: x });
      }
      Object.keys(sx).forEach(function (s) { cols.push({ sum: s, x: sx[s] }); });
      return cols;
    }

    function monthlyLine(ln, pageNo, lines, idx) {
      var m;
      if ((m = ln.text.match(/Water\s+Quality\s+during\s+(?:the\s+)?Year\s*[-–:]?\s*(20\d\d)\s*[-–]\s*(\d{2,4})/i))) {
        ms.fy = +m[1]; ms.fyLabel = m[1] + '-' + m[2]; ms.cols = null; ms.water = ''; ms.station = ''; return true;
      }
      if (/^Natural\s+Water\s+Resource/i.test(ln.text)) { ms.water = afterLabel(ln, /^Natural\s+Water\s+Resource/i); return true; }
      if (/^Description\s+of\s+Sampling\s+Station/i.test(ln.text)) { ms.station = afterLabel(ln, /^Description\s+of\s+Sampling\s+Station/i); return true; }

      // header: six or more month names on one line, plus the Av. / Maxi. / Mini. columns
      var mx = {}, sx = {};
      var collect = function (items) {
        items.forEach(function (it) {
          var k = monthOf(it.s), sm = summaryOf(it.s);
          if (k > -1 && mx[k] === undefined) mx[k] = it.x + it.w / 2;
          else if (sm && sx[sm] === undefined) sx[sm] = it.x + it.w / 2;
        });
      };
      collect(ln.items);
      // Some years print only the sampled months; four names plus the Av. / Maxi. / Mini. columns still fix the grid.
      if (Object.keys(mx).length >= 6 || (Object.keys(mx).length >= 4 && Object.keys(sx).length >= 2)) {
        // Header cells sometimes sit a little above or below the rest of the header line.
        for (var j = Math.max(0, idx - 2); j <= Math.min(lines.length - 1, idx + 2); j++) if (j !== idx && Math.abs(lines[j].y - ln.y) <= 14) collect(lines[j].items);
        ms.cols = buildCols(mx, sx); ms.table++; return true;
      }
      if (!ms.cols) return false;

      var monthCols = ms.cols.filter(function (c) { return c.sum === undefined; });
      var gap = ms.spacing;
      var leftLimit = monthCols[0].x - gap * 0.6;
      var labelItems = ln.items.filter(function (i) { return i.x + i.w * 0.5 < leftLimit; });
      var p = monthlyParamOf(labelItems.map(function (i) { return i.s; }).join(' '));
      if (!p) return false;

      var cells = {}, sums = {}, stray = 0;
      ln.items.forEach(function (it) {
        if (labelItems.indexOf(it) > -1) return;
        it = { s: it.s.replace(/[`'’]+$/, ''), x: it.x, w: it.w };      // "3.8`" is a typing slip in one report
        var c = it.x + it.w / 2, best = null, bd = 1e9;
        ms.cols.forEach(function (col) { var d = Math.abs(c - col.x); if (d < bd) { bd = d; best = col; } });
        if (!best || bd > gap * 0.5) { stray++; return; }
        if (best.sum) { if (NUMBER.test(it.s)) sums[best.sum] = parseFloat(it.s); return; }
        if (cells[best.m] !== undefined) { stray++; return; }
        // Words with no digits ("NA", "Instrument disorder", "NR") are a note that no reading was taken.
        if (!VALUE.test(it.s) && /\d/.test(it.s)) { stray++; cells[best.m] = { raw: it.s, v: null, state: 'missing' }; return; }
        if (!VALUE.test(it.s)) { cells[best.m] = { raw: it.s, v: null, state: 'missing' }; return; }
        if (NUMBER.test(it.s)) cells[best.m] = { raw: it.s, v: parseFloat(it.s), state: 'num' };
        else cells[best.m] = { raw: it.s, v: null, state: /^bdl$|^nd$|^nil$/i.test(it.s) ? 'low' : 'missing' };
      });
      var vals = [], nums = [], implausible = false;
      for (var k = 0; k < 12; k++) {
        var cell = cells[k] || { raw: '', v: null, state: 'blank' };
        if (cell.state === 'num') { nums.push(cell.v); if (cell.v < RANGE[p][0] || cell.v > RANGE[p][1]) implausible = true; }
        cell.month = k; cell.year = ms.fy ? ms.fy + (k >= 9 ? 1 : 0) : null;
        vals.push(cell);
      }
      if (!nums.length && !stray) return true;                   // a row with no readings at all
      // The report prints its own Maxi. / Mini.; if ours disagree, a value was probably put in the wrong month.
      var near = function (a, b) { return Math.abs(a - b) <= Math.max(0.051, Math.abs(b) * 0.01); };
      var sumOk = nums.length && (sums.max === undefined || near(Math.max.apply(null, nums), sums.max)) &&
        (sums.min === undefined || near(Math.min.apply(null, nums), sums.min));
      var conf = implausible || stray || !sumOk ? 'check' : 'clear';
      mrows.push({ page: pageNo, param: p, station: ms.station || ms.water || '', water: ms.water, fy: ms.fy, fyLabel: ms.fyLabel,
        table: ms.table, cells: vals, conf: conf, summaryChecked: sums.max !== undefined || sums.min !== undefined, line: ln.text });
      return true;
    }

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
      lines.forEach(function (ln, idx) {
        var txt = ln.text, m;
        // Monthly tables are read on their own; the immersion reader below never sees their rows (no Pre/During/After header).
        if (!st.cols && monthlyLine(ln, pageNo, lines, idx)) return;
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
      result: function () { return { rows: rows, monthly: mrows, pages: pagesSeen, pagesWithText: pagesWithText, tables: tablesSeen }; }
    };
  }

  return { createParser: createParser, paramOf: paramOf, monthlyParamOf: monthlyParamOf, MONTHS: MONTHS };
});
