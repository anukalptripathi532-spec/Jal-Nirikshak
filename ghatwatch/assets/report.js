(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var NS = 'http://www.w3.org/2000/svg';
  var lang = 'en';

  var STR = {
    en: {
      phase: { pre: 'Before', during: 'During', after: 'After' },
      phaseLong: { pre: 'before immersion', during: 'during immersion', after: 'one week after' },
      within: 'Within limit', outside: 'Outside limit', missing: 'Not sampled',
      limit: 'Class B limit', noTable: 'No table in report', source: 'Source',
      measured: 'measured', of: 'of', readings: 'readings',
      unitNote: 'Units are not printed in the reports; the standard unit is assumed.',
      sumOut: function (n, m, lim) { return n + ' of ' + m + ' measured readings outside the limit (' + lim + ')'; },
      sumNone: 'No readings for this selection.',
      show: 'Showing', incidents: 'incidents', showMore: 'Show 25 more',
      view: 'View as table', hide: 'Hide table', when: 'When', value: 'Value', status: 'Status',
      chartErr: 'The chart could not be drawn.', chartErrHelp: 'The readings are still available in the incident list and in each ghat’s evidence table.',
      empty: 'No readings match these filters.', emptyHelp: 'Try a different year or festival, or reset the filters.',
      emptyInc: 'No incidents match these filters.', emptyIncHelp: 'Clear the search or choose a different severity.',
      reset: 'Reset filters', copied: 'Brief copied as plain text.', copyFail: 'Could not copy. Select the text and copy it.',
      aria: function (g, w, v, s) { return g + ', ' + w + ': ' + v + ', ' + s; }
    },
    hi: {
      phase: { pre: 'पहले', during: 'दौरान', after: 'बाद' },
      phaseLong: { pre: 'विसर्जन से पहले', during: 'विसर्जन के दौरान', after: 'एक सप्ताह बाद' },
      within: 'सीमा में', outside: 'सीमा से बाहर', missing: 'नमूना नहीं',
      limit: 'क्लास B सीमा', noTable: 'रिपोर्ट में तालिका नहीं', source: 'स्रोत',
      measured: 'मापी', of: 'में से', readings: 'रीडिंग',
      unitNote: 'रिपोर्ट में इकाइयाँ छपी नहीं हैं; मानक इकाई मानी गई है।',
      sumOut: function (n, m, lim) { return m + ' मापी रीडिंग में से ' + n + ' सीमा से बाहर (' + lim + ')'; },
      sumNone: 'इस चयन के लिए कोई रीडिंग नहीं।',
      show: 'दिख रहे', incidents: 'घटनाएँ', showMore: '25 और दिखाएँ',
      view: 'तालिका देखें', hide: 'तालिका छिपाएँ', when: 'कब', value: 'मान', status: 'स्थिति',
      chartErr: 'चार्ट नहीं बन सका।', chartErrHelp: 'रीडिंग घटना सूची और हर घाट की प्रमाण तालिका में अब भी उपलब्ध हैं।',
      empty: 'इन फ़िल्टर से कोई रीडिंग नहीं मिली।', emptyHelp: 'कोई और वर्ष या पर्व चुनें, या फ़िल्टर रीसेट करें।',
      emptyInc: 'इन फ़िल्टर से कोई घटना नहीं मिली।', emptyIncHelp: 'खोज हटाएँ या कोई और गंभीरता चुनें।',
      reset: 'फ़िल्टर रीसेट करें', copied: 'सार कॉपी हो गया।', copyFail: 'कॉपी नहीं हो सका। पाठ चुनकर कॉपी करें।',
      aria: function (g, w, v, s) { return g + ', ' + w + ': ' + v + ', ' + s; }
    }
  };
  function S() { return STR[lang]; }
  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  /* ---------- language ---------- */
  var briefs = {}, DATA = null, dataErr = false;
  try { briefs = JSON.parse($('#brief-text').textContent); } catch (e) {}
  try { DATA = JSON.parse($('#gw-data').textContent); } catch (e) { dataErr = true; }
  var listeners = [];
  function setLang(l) {
    lang = l === 'hi' ? 'hi' : 'en';
    document.body.classList.toggle('hi', lang === 'hi');
    document.documentElement.lang = lang;
    $$('[data-set-lang]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-set-lang') === lang)); });
    try { localStorage.setItem('ghatwatch-lang', lang); } catch (e) {}
    listeners.forEach(function (f) { f(); });
  }
  $$('[data-set-lang]').forEach(function (b) { b.addEventListener('click', function () { setLang(b.getAttribute('data-set-lang')); }); });
  // Apply a saved Hindi choice now, before anything renders (listeners added later render in the right language).
  try { if (localStorage.getItem('ghatwatch-lang') === 'hi') setLang('hi'); } catch (e) {}

  /* ---------- segmented controls ---------- */
  function seg(root, onChange) {
    var btns = $$('button', root);
    btns.forEach(function (b) {
      b.addEventListener('click', function () {
        btns.forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        onChange(b.getAttribute('data-v'));
      });
    });
    return { get: function () { var p = btns.filter(function (b) { return b.getAttribute('aria-pressed') === 'true'; })[0]; return p ? p.getAttribute('data-v') : 'all'; },
             set: function (v) { btns.forEach(function (x) { x.setAttribute('aria-pressed', String(x.getAttribute('data-v') === v)); }); } };
  }

  /* ---------- trend chart ---------- */
  var wrap = $('#chart-wrap');
  var tip = $('#chart-tip');
  var state = { site: '0', k: 'DO', f: 'all', y: 'all', table: false };
  var ctl = {};

  function siteName(i) { var s = DATA.sites[i]; return lang === 'hi' ? s.hi : s.en; }
  function fmtN(x) { return (Math.round(x * 100) / 100).toString(); }
  function niceTicks(lo, hi, n) {
    var span = hi - lo || 1, raw = span / n, mag = Math.pow(10, Math.floor(Math.log10(raw))), r = raw / mag;
    var step = (r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10) * mag;
    var a = Math.floor(lo / step) * step, b = Math.ceil(hi / step) * step, t = [];
    for (var v = a; v <= b + step / 2; v += step) t.push(Math.round(v * 1000) / 1000);
    return t;
  }
  function eventsFor() {
    var seen = {}, ev = [];
    DATA.rows.forEach(function (r) {
      var id = r.y + '|' + r.f;
      if (!seen[id]) { seen[id] = 1; ev.push({ y: r.y, f: r.f, id: id }); }
    });
    ev.sort(function (a, b) { return a.y - b.y || (a.f === b.f ? 0 : a.f === 'Ganesh' ? -1 : 1); });
    return ev.filter(function (e) { return (state.y === 'all' || String(e.y) === state.y) && (state.f === 'all' || e.f === state.f); });
  }
  function limitText(k) { return DATA.limits[k].text; }
  function limitRegions(k) {
    var L = DATA.limits[k];
    if (L.kind === 'min') return { line: [L.low], zones: [[-Infinity, L.low]] };
    if (L.kind === 'max') return { line: [L.high], zones: [[L.high, Infinity]] };
    return { line: [L.low, L.high], zones: [[-Infinity, L.low], [L.high, Infinity]] };
  }

  function draw() {
    wrap.classList.remove('failed');
    var host = $('#chart-svg-host'), summary = $('#chart-sum');
    host.textContent = '';
    var ev = eventsFor(), k = state.k, L = DATA.limits[k], unit = L.unit;
    var rows = DATA.rows.filter(function (r) { return String(r.s) === state.site && r.k === k; });
    var title = $('#chart-title');
    title.textContent = ({ DO: lang === 'hi' ? 'घुलित ऑक्सीजन (DO)' : 'Dissolved oxygen (DO)', BOD: 'BOD', pH: 'pH' })[k] + ', ' + siteName(+state.site);
    var shown = rows.filter(function (r) { return ev.some(function (e) { return e.y === r.y && e.f === r.f; }); });
    var meas = shown.filter(function (r) { return r.v !== null; });
    var out = meas.filter(function (r) { return r.b; }).length;
    summary.textContent = shown.length ? S().sumOut(out, meas.length, limitText(k) + (unit ? ' ' + unit : '')) : S().sumNone;
    $('#chart-unit-note').textContent = S().unitNote;
    if (!ev.length || !shown.length) {
      host.innerHTML = '<div class="state"><b>' + S().empty + '</b><span>' + S().emptyHelp + '</span><button type="button" class="btn ghost" id="chart-reset">' + S().reset + '</button></div>';
      $('#chart-reset').addEventListener('click', resetChart);
      $('#chart-table').hidden = true; $('#view-table').hidden = true; $('#chart-legend').hidden = true; if ($('#phase-sum')) $('#phase-sum').textContent = '';
      wrap.classList.add('ready');
      return;
    }
    $('#view-table').hidden = false; $('#chart-legend').hidden = false;
    var W = Math.max(host.clientWidth || wrap.clientWidth || 600, 280), narrow = W < 520;
    $('#chart-unit-note').textContent = S().unitNote + (narrow ? (lang === 'hi' ? ' प = पहले, द = दौरान, बा = बाद।' : ' B = before, D = during, A = one week after.') : '');
    var H = narrow ? 320 : 340, m = { l: narrow ? 40 : 52, r: 14, t: 14, b: narrow ? 90 : 78 };
    var pw = W - m.l - m.r, ph = H - m.t - m.b;
    var vals = meas.map(function (r) { return r.v; }), reg = limitRegions(k);
    var lo = Math.min.apply(null, vals.concat(reg.line)), hi = Math.max.apply(null, vals.concat(reg.line));
    if (k !== 'pH') lo = Math.min(0, lo);
    var pad = (hi - lo) * .08 || 1; hi += pad; if (k === 'pH') lo -= pad;
    var ticks = niceTicks(lo, hi, 5); lo = ticks[0]; hi = ticks[ticks.length - 1];
    var yS = function (v) { return m.t + ph - (v - lo) / (hi - lo) * ph; };
    var gapSlots = .9, total = ev.length * 3 + (ev.length - 1) * gapSlots, slot = pw / total;
    var xOf = function (ei, pi) { return m.l + (ei * (3 + gapSlots) + pi + .5) * slot; };

    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'group', 'aria-label': title.textContent + ' (' + (unit || 'pH units') + ')', 'class': 'draw' });
    reg.zones.forEach(function (z) {
      var a = Math.max(z[0], lo), b = Math.min(z[1], hi);
      if (b > a) el('rect', { 'class': 'zone', x: m.l, width: pw, y: yS(b), height: yS(a) - yS(b) }, svg);
    });
    ticks.forEach(function (t) {
      el('line', { 'class': 'grid-line', x1: m.l, x2: m.l + pw, y1: yS(t), y2: yS(t) }, svg);
      var tx = el('text', { x: m.l - 8, y: yS(t) + 4, 'text-anchor': 'end' }, svg); tx.textContent = fmtN(t);
    });
    el('line', { x1: m.l, x2: m.l + pw, y1: m.t + ph, y2: m.t + ph, stroke: 'var(--line-strong)' }, svg);
    var yl = el('text', { transform: 'translate(12,' + (m.t + ph / 2) + ') rotate(-90)', 'text-anchor': 'middle' }, svg);
    yl.textContent = k === 'pH' ? 'pH' : k + (unit ? ' (' + unit + ')' : '');
    reg.line.forEach(function (v) { el('line', { 'class': 'limit-line', x1: m.l, x2: m.l + pw, y1: yS(v), y2: yS(v) }, svg); });
    var lt = el('text', { x: m.l + pw - 2, y: yS(reg.line[reg.line.length - 1]) - 6, 'text-anchor': 'end' }, svg);
    lt.textContent = S().limit + ': ' + limitText(k); lt.setAttribute('style', 'fill:var(--bad);font-weight:600');

    var pts = [];
    ev.forEach(function (e, ei) {
      var x0 = xOf(ei, 0) - slot / 2, x1 = xOf(ei, 2) + slot / 2;
      var fest = lang === 'hi' ? (e.f === 'Ganesh' ? 'गणेश' : 'दुर्गा') : e.f;
      if (narrow) {
        var t1 = el('text', { 'class': 'evt', x: (x0 + x1) / 2, y: H - 46, 'text-anchor': 'middle', 'font-size': 11 }, svg); t1.textContent = e.y;
        var t2 = el('text', { 'class': 'evt', x: (x0 + x1) / 2, y: H - 33, 'text-anchor': 'middle', 'font-size': 10.5 }, svg); t2.textContent = fest;
      } else {
        var tt = el('text', { 'class': 'evt', x: (x0 + x1) / 2, y: H - 30, 'text-anchor': 'middle' }, svg);
        tt.textContent = e.y + ' ' + fest;
      }
      el('line', { x1: x0 + 4, x2: x1 - 4, y1: H - (narrow ? 56 : 44), y2: H - (narrow ? 56 : 44), stroke: 'var(--line-strong)', 'stroke-width': 1 }, svg);
      var have = rows.filter(function (r) { return r.y === e.y && r.f === e.f; });
      if (!have.length) {
        var nt = el('text', { x: (x0 + x1) / 2, y: m.t + ph / 2, 'text-anchor': 'middle' }, svg);
        nt.textContent = narrow ? '–' : S().noTable;
        return;
      }
      var path = '', run = false;
      ['pre', 'during', 'after'].forEach(function (p, pi) {
        var tx = el('text', { x: xOf(ei, pi), y: H - 12, 'text-anchor': 'middle', 'font-size': narrow ? 10 : 12 }, svg);
        tx.textContent = narrow ? (lang === 'hi' ? ['प', 'द', 'बा'][pi] : S().phase[p].charAt(0)) : S().phase[p];
        var r = have.filter(function (q) { return q.p === p; })[0];
        if (r && r.v !== null) { path += (run ? 'L' : 'M') + xOf(ei, pi) + ' ' + yS(r.v) + ' '; run = true; } else run = false;
        pts.push({ r: r, p: p, x: xOf(ei, pi), e: e });
      });
      if (path) el('path', { 'class': 'series', d: path }, svg);
    });
    pts.forEach(function (q) {
      var r = q.r, g = el('g', { 'class': 'pt', tabindex: 0, role: 'img' }, svg), y;
      var when = q.e.y + ' ' + q.e.f + ', ' + S().phaseLong[q.p];
      if (!r || r.v === null) {
        y = m.t + ph + 16;
        el('circle', { 'class': 'mk-miss', cx: q.x, cy: y, r: 5 }, g);
        g.setAttribute('aria-label', S().aria(siteName(+state.site), when, S().missing, ''));
        g._tip = { head: S().missing, sub: when, src: r ? r.file + ' p.' + r.pg : '', note: r && r.pr ? '“' + r.pr + '”' : '' };
      } else {
        y = yS(r.v);
        if (r.b) { var s = 6; el('rect', { 'class': 'mk-out', x: q.x - s, y: y - s, width: s * 2, height: s * 2, transform: 'rotate(45 ' + q.x + ' ' + y + ')' }, g); }
        else el('circle', { 'class': 'mk-in', cx: q.x, cy: y, r: 5 }, g);
        g.setAttribute('aria-label', S().aria(siteName(+state.site), when, fmtN(r.v) + ' ' + unit, r.b ? S().outside : S().within));
        g._tip = { head: fmtN(r.v) + (unit ? ' ' + unit : '') + ' · ' + (r.b ? S().outside : S().within), sub: when, src: r.file + ' p.' + r.pg };
      }
      el('circle', { 'class': 'ring', cx: q.x, cy: y, r: 11 }, g);
      el('circle', { 'class': 'hit', cx: q.x, cy: y, r: 16 }, g);
      g._xy = [q.x, y];
      g.addEventListener('mouseenter', function () { showTip(g, W); });
      g.addEventListener('focus', function () { showTip(g, W); });
      g.addEventListener('mouseleave', hideTip); g.addEventListener('blur', hideTip);
    });
    host.appendChild(svg);
    drawTable(shown, ev, k, unit);
    renderPhase(shown, ev, k, unit);
    wrap.classList.add('ready');
  }
  function showTip(g, W) {
    var d = g._tip, xy = g._xy;
    tip.innerHTML = '<b></b><div class="t-sub"></div><div class="t-sub"></div>';
    tip.children[0].textContent = d.head; tip.children[1].textContent = d.sub;
    tip.children[2].textContent = d.src ? S().source + ': ' + d.src : '';
    var host = $('#chart-svg-host'), svg = $('svg', host), sc = svg.getBoundingClientRect().width / W;
    var left = xy[0] * sc, top = xy[1] * sc + host.offsetTop;
    tip.classList.add('on');
    var tw = tip.offsetWidth, th = tip.offsetHeight, maxL = wrap.clientWidth - tw - 4;
    tip.style.left = Math.max(4, Math.min(left - tw / 2, maxL)) + 'px';
    tip.style.top = (top - th - 16 < 0 ? top + 18 : top - th - 16) + 'px';
  }
  function hideTip() { tip.classList.remove('on'); }

  function drawTable(shown, ev, k, unit) {
    var T = $('#chart-table'), rows = shown.slice().sort(function (a, b) {
      return a.y - b.y || (a.f === b.f ? 0 : a.f === 'Ganesh' ? -1 : 1) || ['pre', 'during', 'after'].indexOf(a.p) - ['pre', 'during', 'after'].indexOf(b.p);
    });
    var h = '<table><thead><tr><th>' + S().when + '</th><th>' + S().value + (unit ? ' (' + unit + ')' : '') + '</th><th>' + S().status + '</th><th>' + S().source + '</th></tr></thead><tbody>';
    rows.forEach(function (r) {
      h += '<tr><td>' + r.y + ' ' + r.f + ', ' + S().phaseLong[r.p] + '</td><td class="num">' + (r.v === null ? '–' : fmtN(r.v)) + '</td><td>' +
        (r.v === null ? S().missing : r.b ? S().outside : S().within) + '</td><td class="src">' + r.file + ' p.' + r.pg + '</td></tr>';
    });
    T.innerHTML = '<div class="tscroll">' + h + '</tbody></table></div>';
    T.hidden = !state.table;
  }
  function resetChart() {
    state.f = 'all'; state.y = 'all'; ctl.f.set('all'); ctl.y.set('all'); draw();
  }
  function fail() {
    wrap.classList.remove('ready'); wrap.classList.add('failed');
    $('#chart-svg-host').innerHTML = '<div class="state err" role="alert"><b>' + S().chartErr + '</b><span>' + S().chartErrHelp + '</span></div>';
    ['#view-table', '#chart-legend'].forEach(function (s) { var n = $(s); if (n) n.hidden = true; });
  }
  function safeDraw() { try { draw(); } catch (e) { if (window.console) console.error(e); fail(); } }

  if (wrap) {
    if (dataErr || !DATA) fail();
    else {
      ctl.k = seg($('#seg-k'), function (v) { state.k = v; safeDraw(); });
      ctl.f = seg($('#seg-f'), function (v) { state.f = v; safeDraw(); });
      ctl.y = seg($('#seg-y'), function (v) { state.y = v; safeDraw(); });
      $('#sel-site').addEventListener('change', function () { state.site = this.value; safeDraw(); });
      $('#view-table').addEventListener('click', function () {
        state.table = !state.table; this.setAttribute('aria-expanded', String(state.table));
        $('#chart-table').hidden = !state.table;
        $('.l-en', this).textContent = state.table ? STR.en.hide : STR.en.view;
        $('.l-hi', this).textContent = state.table ? STR.hi.hide : STR.hi.view;
      });
      listeners.push(safeDraw);
      var lastW = 0, rt;
      var onResize = function () {
        var w = $('#chart-svg-host').clientWidth;
        if (Math.abs(w - lastW) < 2) return; lastW = w;
        clearTimeout(rt); rt = setTimeout(safeDraw, 120);
      };
      if ('ResizeObserver' in window) new ResizeObserver(onResize).observe(wrap); else window.addEventListener('resize', onResize);
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') hideTip(); });
    }
  }

  /* ---------- incidents: filter, search, sort, paging ---------- */
  var tbody = $('#inc-body');
  if (tbody) {
    var all = $$('tr', tbody), PAGE = 25, limit = PAGE;
    var f = { sev: 'all', k: 'all', f: 'all', q: '' };
    var count = $('#inc-count'), empty = $('#inc-empty'), more = $('#inc-more'), tableBox = $('#inc-tablebox');
    var sorter = $('#inc-sort');
    var render = function (fresh) {
      var q = f.q.trim().toLowerCase(), match = 0, shown = 0;
      var key = sorter.value;
      var cmp = {
        sev: function (a, b) { return b.dataset.sev_n - a.dataset.sev_n || b.dataset.y - a.dataset.y; },
        new: function (a, b) { return b.dataset.ord - a.dataset.ord || b.dataset.sev_n - a.dataset.sev_n; },
        ghat: function (a, b) { return a.dataset.site.localeCompare(b.dataset.site) || b.dataset.sev_n - a.dataset.sev_n; }
      }[key];
      all.sort(function (a, b) { return cmp(a, b); }).forEach(function (r) { tbody.appendChild(r); });
      all.forEach(function (r) {
        var ok = (f.sev === 'all' || r.dataset.sev === f.sev) && (f.k === 'all' || r.dataset.k === f.k) &&
          (f.f === 'all' || r.dataset.f === f.f) && (!q || r.dataset.search.indexOf(q) > -1);
        if (ok) match++;
        var vis = ok && shown < limit;
        if (vis) shown++;
        if (vis && r.hidden && fresh) { r.classList.add('fresh'); setTimeout(function () { r.classList.remove('fresh'); }, 300); }
        r.hidden = !vis;
      });
      tableBox.hidden = !match; empty.hidden = !!match;
      more.hidden = shown >= match;
      count.textContent = S().show + ' ' + shown + ' ' + S().of + ' ' + match + ' ' + S().incidents;
    };
    var fresh = function () { limit = PAGE; render(false); };
    $$('[data-inc]').forEach(function (n) {
      var key = n.getAttribute('data-inc');
      if (n.classList.contains('seg')) seg(n, function (v) { f[key] = v; fresh(); });
    });
    var qi = $('#inc-q'), qt;
    qi.addEventListener('input', function () { clearTimeout(qt); qt = setTimeout(function () { f.q = qi.value; fresh(); }, 120); });
    sorter.addEventListener('change', fresh);
    $('#inc-more-btn').addEventListener('click', function () { limit += PAGE; render(true); });
    $('#inc-reset').addEventListener('click', function () {
      f = { sev: 'all', k: 'all', f: 'all', q: '' }; qi.value = ''; sorter.value = 'sev';
      $$('[data-inc]').forEach(function (n) { $$('button', n).forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-v') === 'all')); }); });
      fresh();
    });
    listeners.push(function () { $$('option', sorter).forEach(function (o) { o.textContent = o.getAttribute('data-' + lang); }); render(false); });
    render(false);
  }


  /* ---------- helpers for built DOM ---------- */
  function E(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
  var FEST = { Ganesh: { en: 'Ganesh', hi: 'गणेश' }, Durga: { en: 'Durga', hi: 'दुर्गा' } };
  var fest = function (f) { return FEST[f] ? FEST[f][lang] : f; };
  var sgn = function (d) { return (d > 0 ? '+' : d < 0 ? '\u2212' : '') + fmtN(Math.abs(d)); };
  var PN = { DO: { en: 'Dissolved oxygen (DO)', hi: 'घुलित ऑक्सीजन (DO)' }, BOD: { en: 'BOD', hi: 'BOD' }, pH: { en: 'pH', hi: 'pH' } };
  var CS = {
    en: { measured: 'measured', outOf: 'outside the limit', worst: 'Worst reading', closest: 'Closest to the limit', none: 'none measured', part: 'Part score', missing: 'missing', rank: 'Rank', range: 'range',
      pick: 'Pick at least two ghats to compare.', max: 'You can compare up to three ghats. Unselect one first.', why: 'Why they differ',
      gap: function (a, b, d, P, pa, pb) { return a + ' scores ' + d + ' points ' + (d >= 0 ? 'above ' : 'below ') + b + '. The largest difference is in ' + P + ' (part score ' + pa + ' vs ' + pb + ').'; },
      overlap: 'Their score ranges overlap, so the order between them is not firm.', same: 'The part scores are the same for these two.',
      phaseTitle: 'Before, during and after immersion', phaseNote: 'These are changes between measured readings. They do not show what caused them.',
      dDuring: 'During vs before', dAfter: 'One week after vs before', preOut: 'Already outside the limit before immersion.', someMiss: 'Not every phase was sampled.' },
    hi: { measured: 'मापी', outOf: 'सीमा से बाहर', worst: 'सबसे ख़राब रीडिंग', closest: 'सीमा के सबसे नज़दीक', none: 'कोई रीडिंग नहीं', part: 'भाग स्कोर', missing: 'छूटी', rank: 'रैंक', range: 'दायरा',
      pick: 'तुलना के लिए कम से कम दो घाट चुनें।', max: 'अधिकतम तीन घाटों की तुलना हो सकती है। पहले किसी एक का चयन हटाएँ।', why: 'अंतर क्यों है',
      gap: function (a, b, d, P, pa, pb) { return a + ' का स्कोर ' + b + ' से ' + Math.abs(d) + ' अंक ' + (d >= 0 ? 'अधिक' : 'कम') + ' है। सबसे बड़ा अंतर ' + P + ' में है (भाग स्कोर ' + pa + ' बनाम ' + pb + ')।'; },
      overlap: 'इनके स्कोर दायरे मिलते हैं, इसलिए इनके बीच का क्रम पक्का नहीं है।', same: 'इन दोनों के भाग स्कोर समान हैं।',
      phaseTitle: 'विसर्जन से पहले, दौरान और बाद', phaseNote: 'ये मापी गई रीडिंग के बीच के बदलाव हैं। ये नहीं बताते कि बदलाव का कारण क्या था।',
      dDuring: 'दौरान बनाम पहले', dAfter: 'एक सप्ताह बाद बनाम पहले', preOut: 'विसर्जन से पहले ही सीमा से बाहर।', someMiss: 'हर चरण का नमूना नहीं लिया गया।' }
  };
  var CT = function () { return CS[lang]; };

  /* ---------- before / during / after summary under the chart ---------- */
  function renderPhase(shown, ev, k, unit) {
    var box = $('#phase-sum'); if (!box) return; box.textContent = '';
    var any = false, ul = E('ul', 'phase-list');
    ev.forEach(function (e) {
      var rs = shown.filter(function (r) { return r.y === e.y && r.f === e.f; }); if (!rs.length) return;
      any = true;
      var by = {}; rs.forEach(function (r) { by[r.p] = r; });
      var li = E('li'); li.appendChild(E('b', '', e.y + ' ' + fest(e.f)));
      var row = E('div', 'phase-row');
      ['pre', 'during', 'after'].forEach(function (p, i) {
        var r = by[p], c = E('span', 'ph ' + (!r || r.v === null ? 'ph-miss' : r.b ? 'ph-out' : 'ph-in'));
        c.appendChild(E('small', '', S().phase[p])); c.appendChild(E('strong', '', !r || r.v === null ? '\u2013' : fmtN(r.v)));
        row.appendChild(c);
        if (i < 2) { var ar = E('span', 'ph-arrow', '\u2192'); ar.setAttribute('aria-hidden', 'true'); row.appendChild(ar); }
      });
      if (unit) row.appendChild(E('span', 'muted small', unit));
      li.appendChild(row);
      var pre = by.pre, du = by.during, af = by.after, bits = [], ok = function (r) { return r && r.v !== null; };
      if (ok(pre) && ok(du)) bits.push(CT().dDuring + ': ' + sgn(du.v - pre.v) + (unit ? ' ' + unit : ''));
      if (ok(pre) && ok(af)) bits.push(CT().dAfter + ': ' + sgn(af.v - pre.v) + (unit ? ' ' + unit : ''));
      if (ok(pre) && pre.b) bits.push(CT().preOut);
      if (!ok(pre) || !ok(du) || !ok(af)) bits.push(CT().someMiss);
      li.appendChild(E('div', 'muted small', bits.join(' \u00b7 ')));
      ul.appendChild(li);
    });
    if (!any) return;
    box.appendChild(E('h4', '', CT().phaseTitle)); box.appendChild(ul); box.appendChild(E('p', 'muted small', CT().phaseNote));
  }

  /* ---------- compare ghats ---------- */
  var chips = $('#cmp-chips');
  if (chips && DATA && DATA.ghats) {
    var picked = $$('button', chips).filter(function (b) { return b.getAttribute('aria-pressed') === 'true'; }).map(function (b) { return +b.getAttribute('data-i'); });
    var gname = function (i) { return lang === 'hi' ? DATA.sites[i].hi : DATA.sites[i].en; };
    var renderCompare = function () {
      var out = $('#cmp-out'); out.textContent = '';
      if (picked.length < 2) { var st = E('div', 'state panel'); st.appendChild(E('b', '', CT().pick)); out.appendChild(st); return; }
      var list = picked.slice().sort(function (a, b) { return DATA.ghats[b].score - DATA.ghats[a].score; });
      var grid = E('div', 'cmp-grid cols-' + list.length);
      list.forEach(function (i) {
        var g = DATA.ghats[i], card = E('article', 'panel cmp-card');
        var head = E('div', 'cmp-head'); head.appendChild(E('span', 'rank', String(g.rank)));
        var nm = E('div'); nm.appendChild(E('h3', '', gname(i))); nm.appendChild(E('span', 'muted small', CT().range + ' ' + g.lo + '\u2013' + g.hi)); head.appendChild(nm);
        head.appendChild(E('span', 'cmp-score', String(g.score))); card.appendChild(head);
        ['DO', 'BOD', 'pH'].forEach(function (P) {
          var x = g.parts[P], frac = x.measured ? x.breaches / x.measured : 0, blk = E('div', 'cmp-param');
          blk.appendChild(E('div', 'cmp-pname', PN[P][lang]));
          var m = E('div', 'pill-meter' + (frac < .5 ? ' warn' : '')); m.setAttribute('aria-hidden', 'true');
          var f = E('i', '', Math.round(frac * 100) + '%'); f.style.width = Math.max(frac * 100, 0) + '%'; m.appendChild(f); blk.appendChild(m);
          blk.appendChild(E('div', 'small', x.breaches + ' / ' + x.measured + ' ' + CT().outOf + (x.missing ? ' \u00b7 ' + x.missing + ' ' + CT().missing : '')));
          var w = x.worst, wt = w ? fmtN(w.v) + (DATA.limits[P].unit ? ' ' + DATA.limits[P].unit : '') + ' \u00b7 ' + w.y + ' ' + fest(w.f) + ', p.' + w.pg : CT().none;
          blk.appendChild(E('div', 'muted small', (x.breaches ? CT().worst : CT().closest) + ': ' + wt));
          blk.appendChild(E('div', 'muted small', CT().part + ': ' + x.part));
          card.appendChild(blk);
        });
        grid.appendChild(card);
      });
      out.appendChild(grid);
      var why = E('div', 'panel cmp-why'); why.appendChild(E('h3', '', CT().why));
      for (var j = 0; j < list.length - 1; j++) {
        var a = DATA.ghats[list[j]], b = DATA.ghats[list[j + 1]], best = null;
        ['DO', 'BOD', 'pH'].forEach(function (P) { var d = a.parts[P].part - b.parts[P].part; if (!best || Math.abs(d) > Math.abs(best.d)) best = { P: P, d: d }; });
        var txt = best.d === 0 ? CT().same : CT().gap(gname(list[j]), gname(list[j + 1]), Math.round((a.score - b.score) * 10) / 10, PN[best.P][lang], a.parts[best.P].part, b.parts[best.P].part);
        if (a.lo <= b.hi && b.lo <= a.hi) txt += ' ' + CT().overlap;
        why.appendChild(E('p', '', txt));
      }
      out.appendChild(why);
    };
    $$('button', chips).forEach(function (b) {
      b.addEventListener('click', function () {
        var i = +b.getAttribute('data-i'), on = picked.indexOf(i) > -1, msg = $('#cmp-msg'); msg.textContent = '';
        if (on) picked = picked.filter(function (x) { return x !== i; });
        else if (picked.length >= 3) { msg.textContent = CT().max; return; }
        else picked.push(i);
        b.setAttribute('aria-pressed', String(!on)); renderCompare();
      });
    });
    listeners.push(function () { $('#cmp-msg').textContent = ''; renderCompare(); }); renderCompare();
  }

  /* ---------- suggested-checks checklist (ticks kept in this browser) ---------- */
  $$('input[data-chk]').forEach(function (cb) {
    var key = 'jn-chk:' + cb.getAttribute('data-chk'), box = cb.closest('details');
    var recount = function () {
      var cnt = $('.cnt', box), all = $$('input[data-chk]', box); cnt.textContent = '(' + all.filter(function (c) { return c.checked; }).length + '/' + all.length + ')';
    };
    try { cb.checked = localStorage.getItem(key) === '1'; } catch (e) {}
    cb.addEventListener('change', function () { try { localStorage.setItem(key, cb.checked ? '1' : '0'); } catch (e) {} recount(); });
    recount();
  });

  /* ---------- print / save the brief as PDF ---------- */
  var dl = $('#dl-pdf');
  if (dl) dl.addEventListener('click', function () {
    $('#pb-date').textContent = (lang === 'hi' ? 'मुद्रित: ' : 'Printed: ') + new Date().toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { dateStyle: 'long' });
    document.body.classList.add('print-brief');
    var off = function () { document.body.classList.remove('print-brief'); window.removeEventListener('afterprint', off); };
    window.addEventListener('afterprint', off);
    setTimeout(function () { window.print(); }, 60);
  });

  /* ---------- keyboard access for scrollable tables ---------- */
  var scrollLabel = function () { return lang === 'hi' ? 'स्क्रॉल करने योग्य तालिका' : 'Scrollable table'; };
  function scrollFocus() {
    $$('.tscroll').forEach(function (e, i) {
      if (!e.hasAttribute('tabindex')) { e.setAttribute('tabindex', '0'); e.setAttribute('role', 'region'); }
      e.setAttribute('aria-label', scrollLabel() + ' ' + (i + 1));
    });
  }
  scrollFocus(); listeners.push(scrollFocus);
  if ('MutationObserver' in window) new MutationObserver(function () { scrollFocus(); }).observe(document.body, { childList: true, subtree: true });

  /* ---------- nav highlight ---------- */
  var links = $$('.nav a'), secs = links.map(function (a) { return $(a.getAttribute('href')); });
  if ('IntersectionObserver' in window) {
    var nio = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        links.forEach(function (a) { a.setAttribute('aria-current', String(a.getAttribute('href') === '#' + e.target.id)); });
      });
    }, { rootMargin: '-30% 0px -60% 0px' });
    secs.forEach(function (s) { if (s) nio.observe(s); });
  }

  /* ---------- ghat bars ---------- */
  var cards = $$('.ghat');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.2 });
    cards.forEach(function (c) { io.observe(c); });
  } else cards.forEach(function (c) { c.classList.add('in'); });

  /* ---------- copy brief ---------- */
  var copyBtn = $('#copy'), status = $('#copy-status');
  function done(ok) {
    copyBtn.classList.remove('copied'); void copyBtn.offsetWidth;
    if (ok) { copyBtn.classList.add('copied'); setTimeout(function () { copyBtn.classList.remove('copied'); }, 1600); }
    status.textContent = ok ? S().copied : S().copyFail;
  }
  function fallback(text) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    var ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta); done(ok);
  }
  copyBtn.addEventListener('click', function () {
    var text = briefs[lang];
    if (!text) { done(false); return; }
    window.__lastCopied = text;
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { done(true); }, function () { fallback(text); });
    else fallback(text);
  });


  /* ---------- views: dashboard / files tab ---------- */
  function applyView(scroll) {
    var f = location.hash === '#files';
    document.body.classList.toggle('view-files', f);
    $$('.nav a').forEach(function (a) { if (f) a.setAttribute('aria-current', String(a.getAttribute('href') === '#files')); });
    if (f) { if (scroll) window.scrollTo(0, 0); return; }
    var id = location.hash.slice(1), t = id && document.getElementById(id);
    if (t && scroll) t.scrollIntoView();
  }
  window.addEventListener('hashchange', function () { applyView(true); });

  /* ---------- officer files (stored in this browser only) ---------- */
  var FS = {
    en: { size: 'Files over 25 MB are not accepted.', bad: 'Only PDF and CSV files can be added.', notpdf: 'does not look like a PDF.', added: 'Added', open: 'Open', remove: 'Remove', preview: 'Preview', check: 'Check',
      rows: 'rows', valid: 'readings checked', unknownCols: 'Missing required columns:', outside: 'outside the Class B limit', skipped: 'Rows skipped (no number or unknown test)', unknownGhat: 'Unknown ghat',
      ghat: 'Ghat', test: 'Test', reading: 'Reading', limit: 'Limit', when: 'When', status: 'Status', outTag: 'Outside limit', inTag: 'Within limit', noneOut: 'No readings outside the limit in this file.',
      note: 'Officer-added readings are checked on your device only. They are not part of the ranking or the incident list above.', storeErr: 'This browser could not keep the files after you close the page.',
      csvErr: 'This CSV could not be read.', close: 'Close', matched: 'Matches' },
    hi: { size: '25 MB से बड़ी फ़ाइलें नहीं ली जातीं।', bad: 'केवल PDF और CSV फ़ाइलें जोड़ी जा सकती हैं।', notpdf: 'PDF जैसी नहीं लगती।', added: 'जोड़ी गई', open: 'खोलें', remove: 'हटाएँ', preview: 'पूर्वावलोकन', check: 'जाँचें',
      rows: 'पंक्तियाँ', valid: 'रीडिंग जाँची गईं', unknownCols: 'ज़रूरी कॉलम नहीं मिले:', outside: 'क्लास B सीमा से बाहर', skipped: 'छोड़ी गई पंक्तियाँ (संख्या नहीं या अज्ञात जाँच)', unknownGhat: 'अज्ञात घाट',
      ghat: 'घाट', test: 'जाँच', reading: 'रीडिंग', limit: 'सीमा', when: 'कब', status: 'स्थिति', outTag: 'सीमा से बाहर', inTag: 'सीमा में', noneOut: 'इस फ़ाइल में कोई रीडिंग सीमा से बाहर नहीं है।',
      note: 'अधिकारी द्वारा जोड़ी गई रीडिंग केवल आपके डिवाइस पर जाँची जाती है। वे ऊपर की रैंकिंग या घटना सूची का हिस्सा नहीं हैं।', storeErr: 'पेज बंद करने के बाद यह ब्राउज़र फ़ाइलें नहीं रख सका।',
      csvErr: 'यह CSV पढ़ी नहीं जा सकी।', close: 'बंद करें', matched: 'मिलान' }
  };
  function FT() { return FS[lang]; }
  var drop = $('#drop');
  if (drop) {
    var MAX = 25 * 1024 * 1024, mem = [], dbp = null, persistOK = true, sel = null;
    var list = $('#file-list'), emptyBox = $('#file-empty'), msg = $('#file-msg');
    var openDB = function () {
      if (dbp) return dbp;
      dbp = new Promise(function (res, rej) {
        try {
          var rq = indexedDB.open('ghatwatch-files', 1);
          rq.onupgradeneeded = function () { rq.result.createObjectStore('files', { keyPath: 'id' }); };
          rq.onsuccess = function () { res(rq.result); }; rq.onerror = function () { rej(rq.error); };
        } catch (e) { rej(e); }
      });
      return dbp;
    };
    var tx = function (mode, fn) { return openDB().then(function (db) { return new Promise(function (res, rej) { var t = db.transaction('files', mode), r = fn(t.objectStore('files')); t.oncomplete = function () { res(r && r.result); }; t.onerror = function () { rej(t.error); }; }); }); };
    var loadAll = function () { return tx('readonly', function (s) { return s.getAll(); }).catch(function () { persistOK = false; return []; }); };
    var saveOne = function (rec) { return tx('readwrite', function (s) { return s.put(rec); }).catch(function () { persistOK = false; msg.textContent = FT().storeErr; }); };
    var delOne = function (id) { return tx('readwrite', function (s) { return s.delete(id); }).catch(function () {}); };

    var kb = function (n) { return n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; };
    var kindOf = function (f) { var n = f.name.toLowerCase(); return n.slice(-4) === '.pdf' || f.type === 'application/pdf' ? 'pdf' : (n.slice(-4) === '.csv' || f.type === 'text/csv' ? 'csv' : ''); };

    function renderList() {
      list.textContent = '';
      emptyBox.hidden = mem.length > 0;
      mem.slice().sort(function (a, b) { return b.added - a.added; }).forEach(function (r) {
        var li = document.createElement('li'); li.className = 'file' + (sel === r.id ? ' on' : '');
        var k = document.createElement('span'); k.className = 'kind kind-' + r.kind; k.textContent = r.kind.toUpperCase(); li.appendChild(k);
        var info = document.createElement('div'); info.className = 'finfo';
        var nm = document.createElement('b'); nm.textContent = r.name; info.appendChild(nm);
        var sub = document.createElement('span'); sub.className = 'muted small';
        sub.textContent = kb(r.size) + ' · ' + FT().added + ' ' + new Date(r.added).toLocaleString(lang === 'hi' ? 'hi-IN' : 'en-IN', { dateStyle: 'medium', timeStyle: 'short' }); info.appendChild(sub);
        li.appendChild(info);
        var act = document.createElement('div'); act.className = 'fact';
        var b1 = document.createElement('button'); b1.type = 'button'; b1.className = 'btn ghost'; b1.textContent = r.kind === 'pdf' ? PT().analyse : FT().check;
        b1.addEventListener('click', function () { show(r); }); act.appendChild(b1);
        if (r.kind === 'pdf') {
          var bp = document.createElement('button'); bp.type = 'button'; bp.className = 'btn ghost'; bp.textContent = FT().preview;
          bp.addEventListener('click', function () { sel = r.id; renderList(); showPDF(r); }); act.appendChild(bp);
          var b2 = document.createElement('button'); b2.type = 'button'; b2.className = 'btn ghost'; b2.textContent = FT().open;
          b2.addEventListener('click', function () { window.open(URL.createObjectURL(r.blob), '_blank', 'noopener'); }); act.appendChild(b2);
        }
        var b3 = document.createElement('button'); b3.type = 'button'; b3.className = 'btn ghost danger'; b3.textContent = FT().remove;
        b3.addEventListener('click', function () { mem = mem.filter(function (x) { return x.id !== r.id; }); delOne(r.id); if (sel === r.id) { sel = null; $('#csv-result').hidden = true; $('#pdf-prev').hidden = true; $('#pdf-result').hidden = true; } renderList(); });
        act.appendChild(b3); li.appendChild(act); list.appendChild(li);
      });
    }

    /* CSV: RFC 4180 style parser */
    function parseCSV(text) {
      var rows = [], row = [], cur = '', q = false, i = 0;
      if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
      for (; i < text.length; i++) {
        var c = text[i];
        if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
        else if (c === '"') q = true;
        else if (c === ',') { row.push(cur); cur = ''; }
        else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.length > 1 || row[0] !== '') rows.push(row); row = []; }
        else cur += c;
      }
      if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
      return rows;
    }
    var paramKey = function (s) { s = (s || '').toLowerCase().replace(/\s+/g, ' ').trim(); if (s === 'do' || s.indexOf('dissolved oxygen') === 0) return 'DO'; if (s.indexOf('bod') === 0) return 'BOD'; if (s === 'ph') return 'pH'; return ''; };
    var outside = function (L, v) { return L.kind === 'min' ? v < L.low : L.kind === 'max' ? v > L.high : (v < L.low || v > L.high); };
    var matchSite = function (name) {
      var n = (name || '').toLowerCase(); if (!n) return -1;
      for (var i = 0; i < DATA.sites.length; i++) { if (n.indexOf(DATA.sites[i].en.toLowerCase()) > -1) return i; }
      return -1;
    };
    function checkCSV(rec) {
      var box = $('#csv-result'); $('#pdf-prev').hidden = true; $('#pdf-result').hidden = true; box.hidden = false; box.textContent = '';
      rec.blob.text().then(function (text) {
        var rows = parseCSV(text), head = (rows[0] || []).map(function (h) { return h.trim().toLowerCase(); });
        var ix = function (n) { return head.indexOf(n); };
        var need = ['site', 'parameter', 'value'].filter(function (n) { return ix(n) < 0; });
        var h3 = document.createElement('h3'); h3.textContent = rec.name; box.appendChild(h3);
        if (need.length) {
          var e = document.createElement('div'); e.className = 'state err'; e.setAttribute('role', 'alert');
          e.innerHTML = '<b></b><span></span>'; e.firstChild.textContent = FT().unknownCols + ' ' + need.join(', ');
          e.lastChild.textContent = head.join(', ') || '—'; box.appendChild(e); return;
        }
        var data = rows.slice(1), checked = 0, skipped = 0, out = [], unknown = 0;
        data.forEach(function (r) {
          var k = paramKey(r[ix('parameter')]), v = parseFloat((r[ix('value')] || '').replace(',', '.'));
          if (!k || !isFinite(v)) { skipped++; return; }
          checked++;
          var L = DATA.limits[k], si = matchSite(r[ix('site')]); if (si < 0) unknown++;
          if (outside(L, v)) out.push({ site: r[ix('site')], si: si, k: k, v: v, L: L, when: [ix('year') > -1 ? r[ix('year')] : '', ix('festival') > -1 ? r[ix('festival')] : '', ix('phase') > -1 ? r[ix('phase')] : ''].filter(Boolean).join(' · ') });
        });
        var sum = document.createElement('ul'); sum.className = 'sev-summary';
        [[data.length, FT().rows], [checked, FT().valid], [out.length, FT().outside]].forEach(function (p) {
          var li = document.createElement('li'); var b = document.createElement('b'); b.textContent = p[0]; var s = document.createElement('span'); s.className = 'muted'; s.textContent = p[1]; li.appendChild(b); li.appendChild(s); sum.appendChild(li);
        }); box.appendChild(sum);
        if (skipped || unknown) { var p = document.createElement('p'); p.className = 'muted small'; p.textContent = (skipped ? FT().skipped + ': ' + skipped + '. ' : '') + (unknown ? FT().unknownGhat + ': ' + unknown + '.' : ''); box.appendChild(p); }
        if (!out.length) { var n = document.createElement('p'); n.textContent = FT().noneOut; box.appendChild(n); }
        else {
          var wrap = document.createElement('div'); wrap.className = 'tscroll'; var t = document.createElement('table');
          var th = '<thead><tr>' + [FT().ghat, FT().test, FT().reading, FT().limit, FT().when].map(function (x) { return '<th>' + x + '</th>'; }).join('') + '</tr></thead>';
          t.innerHTML = th; var tb = document.createElement('tbody');
          out.slice(0, 200).forEach(function (o) {
            var tr = document.createElement('tr');
            var cells = [o.si > -1 ? (lang === 'hi' ? DATA.sites[o.si].hi : DATA.sites[o.si].en) : (o.site + ' (' + FT().unknownGhat + ')'), o.k, o.v + (o.L.unit ? ' ' + o.L.unit : ''), o.L.text, o.when || '–'];
            cells.forEach(function (c, i) { var td = document.createElement('td'); td.textContent = c; if (i === 2) td.className = 'num'; tr.appendChild(td); }); tb.appendChild(tr);
          });
          t.appendChild(tb); wrap.appendChild(t); box.appendChild(wrap);
        }
        var nt = document.createElement('p'); nt.className = 'muted small'; nt.textContent = FT().note; box.appendChild(nt);
      }).catch(function () { var e = document.createElement('div'); e.className = 'state err'; e.setAttribute('role', 'alert'); e.innerHTML = '<b></b>'; e.firstChild.textContent = FT().csvErr; box.appendChild(e); });
    }
    function showPDF(rec) {
      var box = $('#pdf-prev'); $('#csv-result').hidden = true; $('#pdf-result').hidden = true; box.hidden = false; box.textContent = '';
      var h3 = document.createElement('h3'); h3.textContent = rec.name; box.appendChild(h3);
      var f = document.createElement('iframe'); f.title = rec.name; f.src = URL.createObjectURL(rec.blob); box.appendChild(f);
    }

    /* ---------- PDF analysis (pdf.js runs here in the browser; nothing is uploaded) ---------- */
    var PS = {
      en: { analyse: 'Analyse', reading: 'Reading page', of: 'of', cancel: 'Stop', stopped: 'Stopped early: only the pages read so far are analysed.',
        loadLib: 'Starting the PDF reader…', pass: 'This PDF is password protected, so it cannot be read.', badpdf: 'This file could not be read as a PDF.', generic: 'The PDF could not be analysed.',
        noText: 'This PDF has no readable text (it looks like a scan). Scanned images need OCR, which is not available here.',
        noTables: 'No water-quality tables were found.', noTablesHelp: 'This reader understands two MPPCB table layouts: immersion tables with Pre Immersion, During Immersion and After one week columns, and monthly lake-monitoring tables with April to March columns. From either it reads pH, dissolved oxygen and BOD. Reports with only species lists, maps or prose have nothing for it to read.',
        mTitle: 'Monthly lake-monitoring tables', mIntro: 'This PDF holds monthly water-quality tables (April to March), not immersion tables. Readings are checked against the same Class B limits as the dashboard. They describe the lake at its sampling stations, not the immersion ghats, so they are not compared with the dashboard or added to the ranking.',
        stations: 'sampling stations', readings: 'readings', station: 'Station', fy: 'Year',
        mHowText: 'Each value is placed under its month by its position on the page. A row is “Clear” when every value sits in a month column, is physically possible, and the highest and lowest values match the Maxi. and Mini. the report prints for that row. “Check page” means one of these failed (for example the report prints a minimum that is not in its own row, or a value such as pH 834), so open the PDF page. Words such as “Instrument disorder” or “NR” are shown as not sampled. Months run April to March, so January to March belong to the second year of “2023-24”.',
        mScope: 'Highlights use rows marked Clear only.', testAll: 'All tests', mMore: 'Show 40 more',
        pages: 'pages read', tables: 'tables found', rowsRead: 'readings rows', needCheck: 'rows to check', clear: 'Clear', partial: 'Partial', check: 'Check page',
        howRead: 'How reliable are these numbers?', howReadText: 'Each row is read from the position of its numbers under the Pre, During and After columns. “Clear” means all values were found in their columns and are physically plausible. “Partial” means a value is missing from the row. “Check page” means something looked wrong, such as an impossible value or stray text, so open the PDF page. A table whose ghat name is not in the PDF text is listed as “name not readable” and is never assigned to a ghat.',
        compare: 'Against the dashboard data', cmpMatch: 'readings match the dashboard', cmpDiff: 'differ from the dashboard', cmpNew: 'are not in the dashboard',
        highlights: 'Highlights', outsideBy: 'Outside the Class B limit', lowestDO: 'Lowest DO', highestBOD: 'Highest BOD', zeros: 'DO readings of 0', none: 'none',
        scopeNote: 'Highlights use readings marked Clear or Partial for the seven ghats in this report; if none were found they use every site in the file.',
        scope: 'Show', all: 'All sites', seven: 'The 7 ghats', other: 'Other sites', onlyOut: 'Only outside the limit', onlyCheck: 'Only rows to check', search: 'Search site',
        site: 'Site', when: 'When', page: 'Page', test: 'Test', before: 'Before', during: 'During', after: 'After', quality: 'Reading',
        unreadable: 'Name not readable', otherSite: 'Other site', showing: 'Showing', rows: 'rows', more: 'Show 40 more', download: 'Download extracted CSV', empty: 'No rows match these filters.', reset: 'Reset filters',
        outside: 'outside the limit', notSampled: 'not sampled', verify: 'Always confirm a value against the PDF page before acting on it.', year: 'Year', fest: 'Festival', unknownWhen: 'Year not read' },
      hi: { analyse: 'विश्लेषण करें', reading: 'पृष्ठ पढ़ा जा रहा है', of: 'में से', cancel: 'रोकें', stopped: 'बीच में रोका गया: अब तक पढ़े गए पृष्ठों का ही विश्लेषण हुआ।',
        loadLib: 'PDF रीडर शुरू हो रहा है…', pass: 'यह PDF पासवर्ड से सुरक्षित है, इसलिए पढ़ा नहीं जा सकता।', badpdf: 'यह फ़ाइल PDF के रूप में पढ़ी नहीं जा सकी।', generic: 'PDF का विश्लेषण नहीं हो सका।',
        noText: 'इस PDF में पढ़ने लायक पाठ नहीं है (यह स्कैन जैसा लगता है)। स्कैन की गई छवियों के लिए OCR चाहिए, जो यहाँ उपलब्ध नहीं है।',
        noTables: 'पानी की गुणवत्ता की कोई तालिका नहीं मिली।', noTablesHelp: 'यह रीडर MPPCB की दो तरह की तालिकाएँ समझता है: विसर्जन से पहले, दौरान और एक सप्ताह बाद के कॉलम वाली विसर्जन तालिकाएँ, और अप्रैल से मार्च के कॉलम वाली मासिक झील-निगरानी तालिकाएँ। दोनों से यह pH, घुलित ऑक्सीजन और BOD पढ़ता है। जिन रिपोर्टों में केवल प्रजातियों की सूची, नक्शे या लेख हैं, उनमें पढ़ने लायक कुछ नहीं है।',
        mTitle: 'मासिक झील-निगरानी तालिकाएँ', mIntro: 'इस PDF में विसर्जन तालिकाएँ नहीं, बल्कि मासिक (अप्रैल से मार्च) पानी की गुणवत्ता की तालिकाएँ हैं। रीडिंग डैशबोर्ड वाली क्लास B सीमा से ही जाँची जाती हैं। ये झील के नमूना-स्थलों की हैं, विसर्जन घाटों की नहीं, इसलिए इन्हें डैशबोर्ड से नहीं मिलाया जाता और रैंकिंग में नहीं जोड़ा जाता।',
        stations: 'नमूना-स्थल', readings: 'रीडिंग', station: 'नमूना-स्थल', fy: 'वर्ष',
        mHowText: 'हर मान पृष्ठ पर उसकी स्थिति से उसके महीने के नीचे रखा जाता है। पंक्ति “स्पष्ट” तब है जब हर मान किसी महीने के कॉलम में हो, संभव सीमा में हो, और सबसे बड़ा व सबसे छोटा मान रिपोर्ट में छपे Maxi. और Mini. से मेल खाए। “पृष्ठ जाँचें” का मतलब है इनमें से कोई जाँच विफल हुई (जैसे रिपोर्ट ऐसा न्यूनतम छापे जो उसकी पंक्ति में नहीं है, या pH 834 जैसा मान), इसलिए PDF का पृष्ठ खोलें। “Instrument disorder” या “NR” जैसे शब्द “नमूना नहीं” दिखाए जाते हैं। महीने अप्रैल से मार्च तक हैं, इसलिए जनवरी से मार्च “2023-24” के दूसरे वर्ष के हैं।',
        mScope: 'मुख्य बातें केवल “स्पष्ट” पंक्तियों से बनी हैं।', testAll: 'सभी जाँचें', mMore: '40 और दिखाएँ',
        pages: 'पृष्ठ पढ़े गए', tables: 'तालिकाएँ मिलीं', rowsRead: 'रीडिंग पंक्तियाँ', needCheck: 'जाँचने योग्य पंक्तियाँ', clear: 'स्पष्ट', partial: 'अधूरी', check: 'पृष्ठ जाँचें',
        howRead: 'ये आँकड़े कितने भरोसेमंद हैं?', howReadText: 'हर पंक्ति पहले, दौरान और बाद के कॉलम के नीचे अंकों की स्थिति देखकर पढ़ी जाती है। “स्पष्ट” का मतलब है कि सभी मान अपने कॉलम में मिले और संभव सीमा में हैं। “अधूरी” का मतलब है कि पंक्ति में कोई मान नहीं मिला। “पृष्ठ जाँचें” का मतलब है कि कुछ गड़बड़ दिखी, जैसे असंभव मान या बेमेल पाठ, इसलिए PDF का पृष्ठ खोलें। जिस तालिका का घाट-नाम PDF के पाठ में नहीं है, उसे “नाम पढ़ा नहीं जा सका” दिखाया जाता है और किसी घाट से नहीं जोड़ा जाता।',
        compare: 'डैशबोर्ड के आँकड़ों से मिलान', cmpMatch: 'रीडिंग डैशबोर्ड से मेल खाती हैं', cmpDiff: 'डैशबोर्ड से अलग हैं', cmpNew: 'डैशबोर्ड में नहीं हैं',
        highlights: 'मुख्य बातें', outsideBy: 'क्लास B सीमा से बाहर', lowestDO: 'सबसे कम DO', highestBOD: 'सबसे अधिक BOD', zeros: 'DO रीडिंग 0', none: 'कोई नहीं',
        scopeNote: 'मुख्य बातें इस रिपोर्ट के सात घाटों की “स्पष्ट” या “अधूरी” रीडिंग से बनी हैं; यदि कोई नहीं मिली तो फ़ाइल के सभी स्थान लिए गए हैं।',
        scope: 'दिखाएँ', all: 'सभी स्थान', seven: 'ये 7 घाट', other: 'अन्य स्थान', onlyOut: 'केवल सीमा से बाहर', onlyCheck: 'केवल जाँचने योग्य पंक्तियाँ', search: 'स्थान खोजें',
        site: 'स्थान', when: 'कब', page: 'पृष्ठ', test: 'जाँच', before: 'पहले', during: 'दौरान', after: 'बाद', quality: 'रीडिंग',
        unreadable: 'नाम पढ़ा नहीं जा सका', otherSite: 'अन्य स्थान', showing: 'दिख रहे', rows: 'पंक्तियाँ', more: '40 और दिखाएँ', download: 'निकाली गई CSV डाउनलोड करें', empty: 'इन फ़िल्टर से कोई पंक्ति नहीं मिली।', reset: 'फ़िल्टर रीसेट करें',
        outside: 'सीमा से बाहर', notSampled: 'नमूना नहीं', verify: 'किसी भी मान पर कार्रवाई से पहले PDF के पृष्ठ से उसकी पुष्टि करें।', year: 'वर्ष', fest: 'पर्व', unknownWhen: 'वर्ष नहीं पढ़ा' }
    };
    var PT = function () { return PS[lang]; };
    var pdfReady = null;
    function loadPdfJs() {
      if (pdfReady) return pdfReady;
      pdfReady = new Promise(function (res, rej) {
        try {
          var get = function () { return window.pdfjsLib || window['pdfjs-dist/build/pdf']; };
          if (!get()) { var s = document.createElement('script'); s.textContent = $('#pdfjs-lib').textContent; document.head.appendChild(s); }
          var lib = get(); if (!lib) throw new Error('pdf.js did not start');
          lib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([$('#pdfjs-worker').textContent], { type: 'text/javascript' }));
          res(lib);
        } catch (e) { pdfReady = null; rej(e); }
      });
      return pdfReady;
    }
    var dashMap = null;
    function dashLookup() {
      if (dashMap) return dashMap; dashMap = {};
      DATA.rows.forEach(function (r) { dashMap[r.s + '|' + r.y + '|' + r.f + '|' + r.p + '|' + r.k] = r.v; });
      return dashMap;
    }
    var nameYear = function (n) { var m = n.match(/(20\d\d)/g); return m && m.length === 1 ? +m[0] : null; };
    var FPHASE = ['pre', 'during', 'after'];

    function analysePDF(rec) {
      sel = rec.id; renderList();
      $('#csv-result').hidden = true; $('#pdf-prev').hidden = true;
      var box = $('#pdf-result'); box.hidden = false; box.textContent = '';
      box.appendChild(E('h3', '', rec.name));
      var status = E('p', 'muted small', PT().loadLib); status.setAttribute('role', 'status'); box.appendChild(status);
      var bar = E('div', 'progress'); var fill = E('i'); bar.appendChild(fill); bar.setAttribute('role', 'progressbar'); bar.setAttribute('aria-valuemin', '0'); bar.setAttribute('aria-valuemax', '100'); box.appendChild(bar);
      var stop = E('button', 'btn ghost', PT().cancel); stop.type = 'button'; var stopped = false; stop.addEventListener('click', function () { stopped = true; }); box.appendChild(stop);
      var fail = function (key) { box.textContent = ''; box.appendChild(E('h3', '', rec.name)); var e = E('div', 'state err'); e.setAttribute('role', 'alert'); e.appendChild(E('b', '', PT()[key] || PT().generic)); box.appendChild(e); };
      loadPdfJs().then(function (lib) {
        return rec.blob.arrayBuffer().then(function (buf) { return lib.getDocument({ data: new Uint8Array(buf), verbosity: 0, isEvalSupported: false }).promise; });
      }).then(function (doc) {
        var parser = GWPdf.createParser({ aliases: DATA.aliases, year: nameYear(rec.name) });
        var n = 1;
        var step = function () {
          if (stopped || n > doc.numPages) return Promise.resolve();
          return doc.getPage(n).then(function (page) {
            return page.getTextContent().then(function (tc) {
              parser.addPage(tc.items.map(function (i) { return { str: i.str, x: i.transform[4], y: i.transform[5], w: i.width }; }), n);
              page.cleanup();
            });
          }).then(function () {
            var pct = Math.round(n / doc.numPages * 100); fill.style.width = pct + '%'; bar.setAttribute('aria-valuenow', String(pct));
            status.textContent = PT().reading + ' ' + n + ' ' + PT().of + ' ' + doc.numPages; n++;
            return new Promise(function (r) { setTimeout(r, 0); }).then(step);
          });
        };
        return step().then(function () { var res = parser.result(); res.total = doc.numPages; res.stopped = stopped; return res; });
      }).then(function (res) {
        if (sel !== rec.id) return;
        renderAnalysis(box, rec, res);
      }).catch(function (e) {
        if (window.console) console.error(e);
        var nm = e && e.name;
        fail(nm === 'PasswordException' ? 'pass' : (nm === 'InvalidPDFException' || nm === 'MissingPDFException' || nm === 'FormatError') ? 'badpdf' : 'generic');
      });
    }

    // One language listener for whichever analysis is on screen (adding one per render made each toggle re-render 2^n times).
    var shownAnalysis = null;
    listeners.push(function () { var a = shownAnalysis; if (a && sel === a.rec.id && !a.box.hidden) renderAnalysis(a.box, a.rec, a.res); });

    function renderAnalysis(box, rec, res) {
      shownAnalysis = { box: box, rec: rec, res: res };
      box.textContent = '';
      box.appendChild(E('h3', '', rec.name));
      var monthly = res.monthly || [];
      if (res.pagesWithText === 0) { var e1 = E('div', 'state err'); e1.setAttribute('role', 'alert'); e1.appendChild(E('b', '', PT().noText)); box.appendChild(e1); return; }
      if (!res.rows.length && !monthly.length && res.stopped) { box.appendChild(E('p', 'note', PT().stopped)); return; }
      if (!res.rows.length && !monthly.length) { var e2 = E('div', 'state panel'); e2.appendChild(E('b', '', PT().noTables)); e2.appendChild(E('span', '', PT().noTablesHelp)); box.appendChild(e2); return; }
      if (!res.rows.length) { renderMonthly(box, rec, res); return; }
      var rows = res.rows.map(function (r) {
        var L = DATA.limits[r.param], cells = FPHASE.map(function (p) {
          var c = r.cells[p], out = null;
          if (c.state === 'num' && r.conf !== 'check') out = outsideLimit(L, c.v);
          return { raw: c.raw, v: c.v, state: c.state, out: out, p: p };
        });
        var ghat = r.site, label = ghat > -1 ? (lang === 'hi' ? DATA.sites[ghat].hi : DATA.sites[ghat].en) : (r.siteText || '');
        return { r: r, cells: cells, ghat: ghat, label: label, param: r.param, unit: L.unit };
      });
      var counts = { clear: 0, partial: 0, check: 0 }, tablesSet = {};
      rows.forEach(function (x) { counts[x.r.conf]++; tablesSet[x.r.table] = 1; });
      var sum = E('ul', 'sev-summary');
      [[res.total, PT().pages], [Object.keys(tablesSet).length, PT().tables], [rows.length, PT().rowsRead], [counts.check, PT().needCheck]].forEach(function (p) {
        var li = E('li'); li.appendChild(E('b', '', String(p[0]))); li.appendChild(E('span', 'muted', p[1])); sum.appendChild(li);
      });
      box.appendChild(sum);
      if (res.stopped) box.appendChild(E('p', 'note', PT().stopped));
      var det = E('details'); det.appendChild(E('summary', '', PT().howRead)); det.appendChild(E('p', 'muted small', PT().howReadText)); box.appendChild(det);

      // against the dashboard data
      var map = dashLookup(), cm = { match: 0, diff: 0, nw: 0 };
      rows.forEach(function (x) {
        if (x.ghat < 0 || !x.r.year || !x.r.festival || x.r.conf === 'check') return;
        x.cells.forEach(function (c) {
          if (c.state !== 'num') return;
          var d = map[x.ghat + '|' + x.r.year + '|' + x.r.festival + '|' + c.p + '|' + x.param];
          if (d === undefined) cm.nw++; else if (d === c.v) cm.match++; else cm.diff++;
        });
      });
      if (cm.match + cm.diff + cm.nw) {
        var cb = E('div', 'cmp-line'); cb.appendChild(E('b', '', PT().compare + ': '));
        cb.appendChild(document.createTextNode(cm.match + ' ' + PT().cmpMatch + ' \u00b7 ' + cm.diff + ' ' + PT().cmpDiff + ' \u00b7 ' + cm.nw + ' ' + PT().cmpNew + '.')); box.appendChild(cb);
      }

      // highlights
      var seven = rows.filter(function (x) { return x.ghat > -1 && x.r.conf !== 'check'; });
      var pool = seven.length ? seven : rows.filter(function (x) { return x.r.conf !== 'check'; });
      var nums = function (param) { var a = []; pool.forEach(function (x) { if (x.param === param) x.cells.forEach(function (c) { if (c.state === 'num') a.push({ v: c.v, x: x, c: c }); }); }); return a; };
      var whereOf = function (o) { return o.x.label + ', ' + (o.x.r.year || '?') + ' ' + (o.x.r.festival ? fest(o.x.r.festival) : '?') + ', ' + S().phaseLong[o.c.p] + ', p.' + o.x.r.page; };
      var hl = E('div', 'hl-box'); hl.appendChild(E('h4', '', PT().highlights));
      var ul = E('ul', 'hl-list');
      var outTxt = ['DO', 'BOD', 'pH'].map(function (P) { var a = nums(P); return P + ' ' + a.filter(function (o) { return outsideLimit(DATA.limits[P], o.v); }).length + '/' + a.length; }).join(' \u00b7 ');
      ul.appendChild(E('li', '', PT().outsideBy + ': ' + outTxt));
      var doN = nums('DO'), bodN = nums('BOD');
      if (doN.length) { var lo = doN.reduce(function (a, b) { return b.v < a.v ? b : a; }); ul.appendChild(E('li', '', PT().lowestDO + ': ' + fmtN(lo.v) + ' mg/l \u2013 ' + whereOf(lo))); }
      if (bodN.length) { var hi = bodN.reduce(function (a, b) { return b.v > a.v ? b : a; }); ul.appendChild(E('li', '', PT().highestBOD + ': ' + fmtN(hi.v) + ' mg/l \u2013 ' + whereOf(hi))); }
      ul.appendChild(E('li', '', PT().zeros + ': ' + (doN.filter(function (o) { return o.v === 0; }).length || PT().none)));
      hl.appendChild(ul); hl.appendChild(E('p', 'muted small', PT().scopeNote)); box.appendChild(hl);

      // filters + table
      var f = { scope: 'all', out: false, chk: false, q: '' }, limit = 40;
      var ctl = E('div', 'controls');
      var fld = function (label, node) { var d = E('div', 'field'); d.appendChild(E('span', 'fl', label)); d.appendChild(node); return d; };
      var sg = E('div', 'seg'); sg.setAttribute('role', 'group'); sg.setAttribute('aria-label', PT().scope);
      [['all', PT().all], ['seven', PT().seven], ['other', PT().other]].forEach(function (o) {
        var b = E('button', '', o[1]); b.type = 'button'; b.setAttribute('aria-pressed', String(o[0] === 'all'));
        b.addEventListener('click', function () { f.scope = o[0]; $$('button', sg).forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); limit = 40; draw(); }); sg.appendChild(b);
      });
      ctl.appendChild(fld(PT().scope, sg));
      var q = E('input'); q.type = 'search'; q.setAttribute('aria-label', PT().search); q.placeholder = PT().search; q.addEventListener('input', function () { f.q = q.value.toLowerCase(); limit = 40; draw(); });
      ctl.appendChild(fld(PT().search, q));
      var tog = function (key, text) {
        var b = E('button', 'btn ghost', text); b.type = 'button'; b.setAttribute('aria-pressed', 'false');
        b.addEventListener('click', function () { f[key] = !f[key]; b.setAttribute('aria-pressed', String(f[key])); b.classList.toggle('on', f[key]); limit = 40; draw(); }); return b;
      };
      var tw = E('div', 'field'); tw.appendChild(E('span', 'fl', '\u00a0')); var tr = E('div', 'toggles'); tr.appendChild(tog('out', PT().onlyOut)); tr.appendChild(tog('chk', PT().onlyCheck)); tw.appendChild(tr); ctl.appendChild(tw);
      box.appendChild(ctl);
      var count = E('p', 'inc-count'); count.setAttribute('role', 'status'); count.setAttribute('aria-live', 'polite'); box.appendChild(count);
      var holder = E('div'); box.appendChild(holder);
      var moreWrap = E('div', 'inc-more'); var moreBtn = E('button', 'btn ghost', PT().more); moreBtn.type = 'button'; moreBtn.addEventListener('click', function () { limit += 40; draw(); }); moreWrap.appendChild(moreBtn); box.appendChild(moreWrap);
      var actions = E('div', 'pdf-actions'); var dl = E('button', 'btn', PT().download); dl.type = 'button'; actions.appendChild(dl); box.appendChild(actions);
      box.appendChild(E('p', 'muted small', PT().verify));

      function qualityTag(c) { var t = E('span', 'tag ' + (c === 'clear' ? 'tag-ok' : c === 'partial' ? 'tag-warn' : 'tag-bad'), PT()[c]); return t; }
      function cell(c) {
        var td = E('td', 'num');
        if (c.state === 'blank') { td.appendChild(E('span', 'muted', '\u2013')); return td; }
        if (c.state === 'missing' || c.state === 'low') { td.appendChild(E('span', 'muted', c.raw)); return td; }
        var sp = E('span', c.out ? 'val out' : 'val', fmtN(c.v)); td.appendChild(sp);
        if (c.out) td.appendChild(E('span', 'sr', ' ' + PT().outside));
        return td;
      }
      function draw() {
        var shown = rows.filter(function (x) {
          if (f.scope === 'seven' && x.ghat < 0) return false;
          if (f.scope === 'other' && x.ghat > -1) return false;
          if (f.out && !x.cells.some(function (c) { return c.out; })) return false;
          if (f.chk && x.r.conf === 'clear') return false;
          if (f.q && (x.label + ' ' + x.r.siteText).toLowerCase().indexOf(f.q) < 0) return false;
          return true;
        });
        holder.textContent = '';
        var vis = shown.slice(0, limit);
        count.textContent = PT().showing + ' ' + vis.length + ' ' + PT().of + ' ' + shown.length + ' ' + PT().rows;
        moreWrap.hidden = vis.length >= shown.length;
        if (!shown.length) { var st = E('div', 'state panel'); st.appendChild(E('b', '', PT().empty)); holder.appendChild(st); return; }
        var wrap = E('div', 'tscroll'), t = document.createElement('table');
        var th = E('tr'); [PT().site, PT().when, PT().page, PT().test, PT().before, PT().during, PT().after, PT().quality].forEach(function (h) { th.appendChild(E('th', '', h)); });
        var thead = E('thead'); thead.appendChild(th); t.appendChild(thead);
        var tb = E('tbody');
        vis.forEach(function (x) {
          var tr = E('tr'); var td = E('td'); td.appendChild(E('strong', '', x.label || PT().unreadable));
          if (x.ghat < 0) td.appendChild(E('div', 'muted small', x.label ? PT().otherSite : '')); tr.appendChild(td);
          tr.appendChild(E('td', '', x.r.year ? x.r.year + ' ' + (x.r.festival ? fest(x.r.festival) : '') : PT().unknownWhen));
          tr.appendChild(E('td', 'num', 'p.' + x.r.page));
          tr.appendChild(E('td', '', x.param + (x.unit ? ' (' + x.unit + ')' : '')));
          x.cells.forEach(function (c) { tr.appendChild(cell(c)); });
          var q = E('td'); q.appendChild(qualityTag(x.r.conf)); tr.appendChild(q);
          tb.appendChild(tr);
        });
        t.appendChild(tb); wrap.appendChild(t); holder.appendChild(wrap);
      }
      dl.addEventListener('click', function () {
        var esc = function (s) { s = String(s === null || s === undefined ? '' : s); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
        var out = ['source_file,page,year,festival,site_in_pdf,matched_ghat,parameter,phase,value_as_printed,outside_class_b_limit,row_quality'];
        rows.forEach(function (x) {
          x.cells.forEach(function (c) {
            out.push([rec.name, x.r.page, x.r.year || '', x.r.festival || '', x.r.siteText, x.ghat > -1 ? DATA.sites[x.ghat].en : '', x.param, c.p, c.raw, c.out === null ? '' : (c.out ? 'yes' : 'no'), x.r.conf].map(esc).join(','));
          });
        });
        var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([out.join('\r\n') + '\r\n'], { type: 'text/csv' })); a.download = rec.name.replace(/\.pdf$/i, '') + '_extracted.csv'; a.click();
      });
      draw();
      if (monthly.length) renderMonthly(box, rec, res);
    }

    /* Monthly lake-monitoring tables: one row per station, year and test, one column per month April..March. */
    var MON = { en: ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'],
                hi: ['अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर', 'जनवरी', 'फ़रवरी', 'मार्च'] };
    function renderMonthly(box, rec, res) {
      var P = PT(), rows = res.monthly.map(function (r) {
        var L = DATA.limits[r.param];
        var cells = r.cells.map(function (c) { return { raw: c.raw, v: c.v, state: c.state, month: c.month, year: c.year, out: c.state === 'num' && r.conf !== 'check' ? outsideLimit(L, c.v) : null }; });
        return { r: r, cells: cells, unit: L.unit };
      });
      var sec = E('div', 'monthly'); box.appendChild(sec);
      sec.appendChild(E('h3', '', P.mTitle));
      sec.appendChild(E('p', 'muted small', P.mIntro));
      var stations = {}, nRead = 0, nCheck = 0;
      rows.forEach(function (x) { stations[x.r.station.toLowerCase()] = 1; if (x.r.conf === 'check') nCheck++; x.cells.forEach(function (c) { if (c.state === 'num') nRead++; }); });
      var sum = E('ul', 'sev-summary');
      [[res.total, P.pages], [Object.keys(stations).length, P.stations], [nRead, P.readings], [nCheck, P.needCheck]].forEach(function (p) {
        var li = E('li'); li.appendChild(E('b', '', String(p[0]))); li.appendChild(E('span', 'muted', p[1])); sum.appendChild(li);
      });
      sec.appendChild(sum);
      if (res.stopped) sec.appendChild(E('p', 'note', P.stopped));
      var det = E('details'); det.appendChild(E('summary', '', P.howRead)); det.appendChild(E('p', 'muted small', P.mHowText)); sec.appendChild(det);

      // highlights, from clear rows only
      var clear = rows.filter(function (x) { return x.r.conf === 'clear'; });
      var nums = function (param) { var a = []; clear.forEach(function (x) { if (x.r.param === param) x.cells.forEach(function (c) { if (c.state === 'num') a.push({ v: c.v, x: x, c: c }); }); }); return a; };
      var whereOf = function (o) { return o.x.r.station + ', ' + MON[lang][o.c.month] + ' ' + (o.c.year || '?') + ', p.' + o.x.r.page; };
      var hl = E('div', 'hl-box'); hl.appendChild(E('h4', '', P.highlights));
      var ul = E('ul', 'hl-list');
      ul.appendChild(E('li', '', P.outsideBy + ': ' + ['DO', 'BOD', 'pH'].map(function (k) { var a = nums(k); return k + ' ' + a.filter(function (o) { return outsideLimit(DATA.limits[k], o.v); }).length + '/' + a.length; }).join(' · ')));
      var doN = nums('DO'), bodN = nums('BOD');
      if (doN.length) { var lo = doN.reduce(function (a, b) { return b.v < a.v ? b : a; }); ul.appendChild(E('li', '', P.lowestDO + ': ' + fmtN(lo.v) + ' mg/l – ' + whereOf(lo))); }
      if (bodN.length) { var hi = bodN.reduce(function (a, b) { return b.v > a.v ? b : a; }); ul.appendChild(E('li', '', P.highestBOD + ': ' + fmtN(hi.v) + ' mg/l – ' + whereOf(hi))); }
      hl.appendChild(ul); hl.appendChild(E('p', 'muted small', P.mScope)); sec.appendChild(hl);

      // filters + table
      var f = { k: 'all', out: false, chk: false, q: '' }, limit = 40;
      var ctl = E('div', 'controls');
      var fld = function (label, node) { var d = E('div', 'field'); d.appendChild(E('span', 'fl', label)); d.appendChild(node); return d; };
      var sg = E('div', 'seg'); sg.setAttribute('role', 'group'); sg.setAttribute('aria-label', P.test);
      [['all', P.testAll], ['DO', 'DO'], ['BOD', 'BOD'], ['pH', 'pH']].forEach(function (o) {
        var b = E('button', '', o[1]); b.type = 'button'; b.setAttribute('aria-pressed', String(o[0] === 'all'));
        b.addEventListener('click', function () { f.k = o[0]; $$('button', sg).forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); limit = 40; draw(); }); sg.appendChild(b);
      });
      ctl.appendChild(fld(P.test, sg));
      var q = E('input'); q.type = 'search'; q.setAttribute('aria-label', P.search); q.placeholder = P.search; q.addEventListener('input', function () { f.q = q.value.toLowerCase(); limit = 40; draw(); });
      ctl.appendChild(fld(P.search, q));
      var tog = function (key, text) {
        var b = E('button', 'btn ghost', text); b.type = 'button'; b.setAttribute('aria-pressed', 'false');
        b.addEventListener('click', function () { f[key] = !f[key]; b.setAttribute('aria-pressed', String(f[key])); b.classList.toggle('on', f[key]); limit = 40; draw(); }); return b;
      };
      var tw = E('div', 'field'); tw.appendChild(E('span', 'fl', ' ')); var tr = E('div', 'toggles'); tr.appendChild(tog('out', P.onlyOut)); tr.appendChild(tog('chk', P.onlyCheck)); tw.appendChild(tr); ctl.appendChild(tw);
      sec.appendChild(ctl);
      var count = E('p', 'inc-count'); count.setAttribute('role', 'status'); count.setAttribute('aria-live', 'polite'); sec.appendChild(count);
      var holder = E('div'); sec.appendChild(holder);
      var moreWrap = E('div', 'inc-more'); var moreBtn = E('button', 'btn ghost', P.mMore); moreBtn.type = 'button'; moreBtn.addEventListener('click', function () { limit += 40; draw(); }); moreWrap.appendChild(moreBtn); sec.appendChild(moreWrap);
      var actions = E('div', 'pdf-actions'); var dl = E('button', 'btn', P.download); dl.type = 'button'; actions.appendChild(dl); sec.appendChild(actions);
      sec.appendChild(E('p', 'muted small', P.verify));

      function cell(c) {
        var td = E('td', 'num');
        if (c.state === 'blank') { td.appendChild(E('span', 'muted', '–')); return td; }
        if (c.state !== 'num') { var m = E('span', 'muted', c.raw); if (c.state === 'missing') m.title = P.notSampled; td.appendChild(m); return td; }
        td.appendChild(E('span', c.out ? 'val out' : 'val', fmtN(c.v)));
        if (c.out) td.appendChild(E('span', 'sr', ' ' + P.outside));
        return td;
      }
      function draw() {
        var shown = rows.filter(function (x) {
          if (f.k !== 'all' && x.r.param !== f.k) return false;
          if (f.out && !x.cells.some(function (c) { return c.out; })) return false;
          if (f.chk && x.r.conf === 'clear') return false;
          if (f.q && (x.r.station + ' ' + x.r.water + ' ' + x.r.fyLabel).toLowerCase().indexOf(f.q) < 0) return false;
          return true;
        });
        holder.textContent = '';
        var vis = shown.slice(0, limit);
        count.textContent = P.showing + ' ' + vis.length + ' ' + P.of + ' ' + shown.length + ' ' + P.rows;
        moreWrap.hidden = vis.length >= shown.length;
        if (!shown.length) { var st = E('div', 'state panel'); st.appendChild(E('b', '', P.empty)); holder.appendChild(st); return; }
        var wrap = E('div', 'tscroll'), t = document.createElement('table');
        var th = E('tr'); [P.station, P.fy, P.page, P.test].concat(MON[lang]).concat([P.quality]).forEach(function (h) { th.appendChild(E('th', '', h)); });
        var thead = E('thead'); thead.appendChild(th); t.appendChild(thead);
        var tb = E('tbody');
        vis.forEach(function (x) {
          var tr = E('tr'); var td = E('td'); td.appendChild(E('strong', '', x.r.station || P.unreadable));
          if (x.r.water && x.r.water !== x.r.station) td.appendChild(E('div', 'muted small', x.r.water)); tr.appendChild(td);
          tr.appendChild(E('td', '', x.r.fyLabel || P.unknownWhen));
          tr.appendChild(E('td', 'num', 'p.' + x.r.page));
          tr.appendChild(E('td', '', x.r.param + (x.unit ? ' (' + x.unit + ')' : '')));
          x.cells.forEach(function (c) { tr.appendChild(cell(c)); });
          var qd = E('td'); qd.appendChild(E('span', 'tag ' + (x.r.conf === 'clear' ? 'tag-ok' : 'tag-bad'), P[x.r.conf])); tr.appendChild(qd);
          tb.appendChild(tr);
        });
        t.appendChild(tb); wrap.appendChild(t); holder.appendChild(wrap);
      }
      dl.addEventListener('click', function () {
        var esc = function (s) { s = String(s === null || s === undefined ? '' : s); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
        var out = ['source_file,page,report_year,station,water_body,parameter,month,year,value_as_printed,outside_class_b_limit,row_quality'];
        rows.forEach(function (x) {
          x.cells.forEach(function (c) {
            if (c.state === 'blank') return;
            out.push([rec.name, x.r.page, x.r.fyLabel, x.r.station, x.r.water, x.r.param, MON.en[c.month], c.year || '', c.raw, c.out === null ? '' : (c.out ? 'yes' : 'no'), x.r.conf].map(esc).join(','));
          });
        });
        var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([out.join('\r\n') + '\r\n'], { type: 'text/csv' })); a.download = rec.name.replace(/\.pdf$/i, '') + '_monthly_extracted.csv'; a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 0);
      });
      draw();
    }
    var outsideLimit = function (L, v) { return L.kind === 'min' ? v < L.low : L.kind === 'max' ? v > L.high : (v < L.low || v > L.high); };
    function show(rec) { sel = rec.id; renderList(); if (rec.kind === 'pdf') analysePDF(rec); else { $('#pdf-result').hidden = true; checkCSV(rec); } }

    function addFiles(files) {
      msg.textContent = '';
      var problems = [], jobs = [];
      Array.prototype.forEach.call(files, function (f) {
        var k = kindOf(f);
        if (!k) { problems.push(f.name + ': ' + FT().bad); return; }
        if (f.size > MAX) { problems.push(f.name + ': ' + FT().size); return; }
        jobs.push((k === 'pdf' ? f.slice(0, 5).text().then(function (h) { return h.indexOf('%PDF') === 0; }) : Promise.resolve(true)).then(function (ok) {
          if (!ok) { problems.push(f.name + ' ' + FT().notpdf); return null; }
          var rec = { id: Date.now() + '-' + Math.random().toString(36).slice(2, 8), name: f.name, kind: k, size: f.size, added: Date.now(), blob: f };
          mem.push(rec); return saveOne(rec).then(function () { return rec; });
        }));
      });
      Promise.all(jobs).then(function (recs) {
        renderList(); var last = recs.filter(Boolean).pop(); if (last) show(last);
        if (problems.length) msg.textContent = problems.join(' ');
      });
    }
    $('#file-pick').addEventListener('click', function () { $('#file-in').click(); });
    $('#file-in').addEventListener('change', function () { addFiles(this.files); this.value = ''; });
    ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
    drop.addEventListener('drop', function (e) { if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files); });
    $('#tpl').addEventListener('click', function () {
      var blob = new Blob(['site,parameter,value,year,festival,phase\r\n'], { type: 'text/csv' });
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'ghatwatch_readings_template.csv'; a.click();
    });
    listeners.push(renderList);
    loadAll().then(function (rs) { mem = rs.filter(function (r) { return r && r.blob; }); renderList(); });
  }
  applyView(true);

})();
