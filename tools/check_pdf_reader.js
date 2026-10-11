// Accuracy check for the in-browser PDF reader (ghatwatch/assets/pdf_analysis.js).
//
// Runs the reader over the three original MPPCB reports and compares every row it calls "clear" with the
// verified data/bhopal_ghats_2023_2025.csv. A "clear" row that disagrees with the CSV is a failure (exit 1).
//
// Setup (dev only; the report itself needs none of this):  npm install pdfjs-dist@3.11.174
// Usage:  node tools/check_pdf_reader.js PATH/TO/resources
// The PDFs are not shipped in this repo (they are in the hackathon repo's tracks/02-visarjan-ghat-watch/resources/).

const fs = require('fs');
const path = require('path');
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
const { createParser } = require('../ghatwatch/assets/pdf_analysis.js');

const RES = process.argv[2] || 'resources';
const FILES = { 2023: 'Idol_immer._Report_23_CPCB.pdf', 2024: 'Ganesh_and_Durga_visarjan_report-2024.pdf', 2025: 'Ganesh_and_Durga_visarjan_report-2025.pdf' };
const SITES = ['Khatlapura ghat', 'Bairagarh (Sant Hirdaram) kund', 'Prempura ghat', 'Rani Kamlapati ghat / Kamla Park kund', 'Hathaikheda dam / kund', 'Malikhedi kund', 'Shahpura lake ghat'];
const ALIASES = [['khatlapura'], ['hirdaram', 'bairagarh'], ['prempura'], ['kamlapati', 'kamla park'], ['hathaikheda', 'hathai kheda', 'hatai'], ['maalikhedi', 'malikhedi', 'mali khedi'], ['shahpura']].map((k, i) => ({ idx: i, keys: k }));

function parseCSV(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.length > 1) rows.push(row); row = []; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

const csv = parseCSV(fs.readFileSync(path.join(__dirname, '..', 'data', 'bhopal_ghats_2023_2025.csv'), 'utf8'));
const H = csv[0], col = (n) => H.indexOf(n), truth = {};
csv.slice(1).forEach((r) => {
  const p = r[col('parameter')], pk = p === 'Dissolved oxygen' ? 'DO' : p === 'BOD' ? 'BOD' : p === 'pH' ? 'pH' : '';
  if (!pk) return;
  const key = [r[col('year')], r[col('festival')], SITES.indexOf(r[col('site')]), pk].join('|');
  (truth[key] = truth[key] || {})[r[col('phase')]] = { printed: r[col('value_as_printed')], value: r[col('value')] };
});

(async () => {
  let ok = 0, wrong = 0, partial = 0, check = 0, unnamed = 0; const covered = new Set(), problems = [];
  for (const year of [2023, 2024, 2025]) {
    const data = new Uint8Array(fs.readFileSync(path.join(RES, FILES[year])));
    const doc = await pdfjs.getDocument({ data, useSystemFonts: true, verbosity: 0 }).promise;
    const parser = createParser({ aliases: ALIASES, year });
    for (let n = 1; n <= doc.numPages; n++) {
      const tc = await (await doc.getPage(n)).getTextContent();
      parser.addPage(tc.items.map((i) => ({ str: i.str, x: i.transform[4], y: i.transform[5], w: i.width })), n);
    }
    parser.result().rows.forEach((r) => {
      if (r.conf === 'partial') partial++;
      if (r.conf === 'check') check++;
      if (r.site < 0) { unnamed++; return; }
      if (r.conf !== 'clear') return;
      const key = [r.year, r.festival, r.site, r.param].join('|'), t = truth[key];
      const norm = (s) => String(s || '').replace(/^_+$|^-+$|^\*+$/, '').trim();
      if (!t) { wrong++; problems.push('no ground truth for ' + key + ' p.' + r.page); return; }
      const diffs = ['pre', 'during', 'after'].filter((ph) => norm((t[ph] || {}).printed) !== norm(r.cells[ph].raw));
      if (diffs.length) { wrong++; problems.push('MISMATCH ' + key + ' p.' + r.page + ' ' + diffs.join(',')); } else { ok++; covered.add(key); }
    });
  }
  const numeric = Object.keys(truth).filter((k) => ['pre', 'during', 'after'].every((ph) => truth[k][ph] && truth[k][ph].value !== ''));
  console.log('Verified fully numeric DO/BOD/pH rows in the CSV:', numeric.length);
  console.log('  recovered exactly as "clear":', numeric.filter((k) => covered.has(k)).length);
  console.log('  "clear" rows that DISAGREE with the CSV (must be 0):', wrong);
  console.log('  rows marked partial:', partial, '| marked check:', check, '| rows for other ghats or with an unreadable name (never assigned to one of the seven):', unnamed);
  problems.slice(0, 20).forEach((p) => console.log('   ', p));
  process.exit(wrong ? 1 : 0);
})();
