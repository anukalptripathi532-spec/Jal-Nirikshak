"""Check the CSV's DO / BOD / pH table rows against the original PDFs.

For every (year, festival, site, parameter) row whose pre / during / after values are all numbers,
look on the cited PDF page for a line holding the three printed values in order. Rows with a gap
are listed for checking by eye.

Three passes, strictest first: the three values in order on one -layout line; for the 2023 stacked
layout, pre+during on the parameter's line plus the after value on the page; or the parameter's line
in -raw (content-stream) mode holding all three in order.

Usage: python tools/verify_pdf.py PATH/TO/resources
Needs pdftotext (poppler) on PATH. Not part of run.py; the PDFs are not shipped in this repo.
"""

import os
import re
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ghatwatch.data import KEY_PARAMETERS, MEASURED, PHASES, REPORT_FILES, load_readings  # noqa: E402

PRINTED = {"Dissolved oxygen": r"D\.?\s*Oxygen", "BOD": r"BOD", "pH": r"pH"}
_cache = {}


def page_text(pdf, page, mode="-layout"):
    key = (pdf, page, mode)
    if key not in _cache:
        _cache[key] = subprocess.run(["pdftotext", mode, "-f", str(page), "-l", str(page), pdf, "-"],
                                     capture_output=True, text=True, encoding="utf-8", errors="replace").stdout
    return _cache[key]


def tokens(line):
    return re.findall(r"[-\d.]+|\S+", line)


def in_order(needles, hay):
    i = 0
    for tok in hay:
        if i < len(needles) and tok == needles[i]:
            i += 1
    return i == len(needles)


def main(res_dir):
    readings = load_readings()
    rows = {}
    for r in readings:
        if r.parameter in KEY_PARAMETERS:
            rows.setdefault((r.year, r.festival, r.site, r.parameter), {})[r.phase] = r
    ok_line, ok_split, ok_raw, failed, gaps = [], [], [], [], []
    for key, ph in sorted(rows.items()):
        rs = [ph[p] for p in PHASES]
        page = rs[0].source_page
        pdf = os.path.join(res_dir, REPORT_FILES[key[0]])
        if any(r.status != MEASURED for r in rs):
            gaps.append((key, page, [r.value_as_printed or "(blank)" for r in rs]))
            continue
        vals = [r.value_as_printed for r in rs]
        lines = page_text(pdf, page).splitlines()
        pat = re.compile(PRINTED[key[3]])
        if any(in_order(vals, tokens(l)) for l in lines):
            ok_line.append(key)
        # 2023 layout: "after" column is printed as a separate stacked column on the same page.
        elif any(pat.search(l) and in_order(vals[:2], tokens(l)) for l in lines) and \
                any(vals[2] in tokens(l) for l in lines):
            ok_split.append(key)
        # Some pages print columns out of place in -layout; -raw keeps content-stream order.
        elif any(pat.search(l) and in_order(vals, tokens(l)) for l in page_text(pdf, page, "-raw").splitlines()):
            ok_raw.append(key)
        else:
            failed.append((key, page, vals))
    total = len(ok_line) + len(ok_split) + len(ok_raw) + len(failed)
    print(f"Fully numeric DO/BOD/pH table rows: {total}")
    print(f"  three values together on one line of the cited page: {len(ok_line)}")
    print(f"  pre+during on the parameter's line, 'after' in the page's stacked after-column: {len(ok_split)}")
    print(f"  on the parameter's line in -raw mode (columns misplaced in -layout): {len(ok_raw)}")
    for k in ok_raw:
        print("   ", k)
    print(f"  not found: {len(failed)}")
    for f in failed:
        print("   ", f)
    print(f"Rows with gaps (check by eye): {len(gaps)}")
    for key, page, vals in gaps:
        print(f"   {key[0]} {key[1]:6s} p.{page:<3} {key[2]:40s} {key[3]:17s} pre/during/after = {vals}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "resources"))
