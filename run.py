"""Build every output into outputs/.  Usage: python run.py"""

import os
import sys

from ghatwatch.brief import build_brief, word_count
from ghatwatch.data import load_limits, load_readings
from ghatwatch.outputs import write_all
from ghatwatch.render import render
from ghatwatch.scoring import headline, score_all, sensitivity_summary

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "outputs")


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    readings = load_readings()
    limits = load_limits()
    results = score_all(readings, limits)
    h = headline(readings, limits)
    sens = sensitivity_summary(results)
    brief_en, brief_hi = build_brief(readings, limits, results)

    write_all(OUT, readings, limits, results, sens, h, brief_en, brief_hi)
    page = render(readings, limits, results, h, sens, brief_en, brief_hi)
    with open(os.path.join(OUT, "report.html"), "w", encoding="utf-8") as f:
        f.write(page)
    # Same page for GitHub Pages (Settings > Pages > main / docs).
    docs = os.path.join(os.path.dirname(OUT), "docs")
    os.makedirs(docs, exist_ok=True)
    with open(os.path.join(docs, "index.html"), "w", encoding="utf-8") as f:
        f.write(page)
    open(os.path.join(docs, ".nojekyll"), "w").close()

    print(f"{len(readings)} readings, {len(results)} ghats")
    for g in results:
        print(f"  {g.rank}. {g.site:40s} {g.score:5.1f}  range {g.score_low:4.1f}-{g.score_high:4.1f}"
              f"  rank {g.rank_best}-{g.rank_worst}  durga {g.durga_rank}")
    print(f"Brief: {word_count(brief_en)} words (en), {word_count(brief_hi)} words (hi)")
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
