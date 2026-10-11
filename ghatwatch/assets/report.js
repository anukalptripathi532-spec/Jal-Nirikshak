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
      $('#chart-table').hidden = true; $('#view-table').hidden = true; $('#chart-legend').hidden = true;
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
      f = { sev: 'all', k: 'all', f: 'all', q: '' }; qi.value = '';
      $$('[data-inc]').forEach(function (n) { $$('button', n).forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-v') === 'all')); }); });
      fresh();
    });
    listeners.push(function () { render(false); });
    render(false);
  }

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
        var b1 = document.createElement('button'); b1.type = 'button'; b1.className = 'btn ghost'; b1.textContent = r.kind === 'pdf' ? FT().preview : FT().check;
        b1.addEventListener('click', function () { show(r); }); act.appendChild(b1);
        if (r.kind === 'pdf') {
          var b2 = document.createElement('button'); b2.type = 'button'; b2.className = 'btn ghost'; b2.textContent = FT().open;
          b2.addEventListener('click', function () { window.open(URL.createObjectURL(r.blob), '_blank', 'noopener'); }); act.appendChild(b2);
        }
        var b3 = document.createElement('button'); b3.type = 'button'; b3.className = 'btn ghost danger'; b3.textContent = FT().remove;
        b3.addEventListener('click', function () { mem = mem.filter(function (x) { return x.id !== r.id; }); delOne(r.id); if (sel === r.id) { sel = null; $('#csv-result').hidden = true; $('#pdf-prev').hidden = true; } renderList(); });
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
      var box = $('#csv-result'); $('#pdf-prev').hidden = true; box.hidden = false; box.textContent = '';
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
      var box = $('#pdf-prev'); $('#csv-result').hidden = true; box.hidden = false; box.textContent = '';
      var h3 = document.createElement('h3'); h3.textContent = rec.name; box.appendChild(h3);
      var f = document.createElement('iframe'); f.title = rec.name; f.src = URL.createObjectURL(rec.blob); box.appendChild(f);
    }
    function show(rec) { sel = rec.id; renderList(); if (rec.kind === 'pdf') showPDF(rec); else checkCSV(rec); }

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

  try { var saved = localStorage.getItem('ghatwatch-lang'); if (saved) setLang(saved); } catch (e) {}
})();
