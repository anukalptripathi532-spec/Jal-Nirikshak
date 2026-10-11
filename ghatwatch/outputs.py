"""Write the CSV and JSON outputs."""

import csv
import json
import os

from .data import KEY_PARAMETERS, MEASURED, fmt
from .scoring import WEIGHTINGS, is_breach


def _csv(path, header, rows):
    with open(path, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)


def evidence_rows(readings, limits):
    """Every reading, with limit and outside-limit flag where a Class B limit exists."""
    rows = []
    for r in readings:
        lim = limits.get(r.parameter)
        if lim and r.status == MEASURED:
            outside = "yes" if is_breach(r.value, lim) else "no"
        elif lim:
            outside = "unknown (not measured)" if r.status == "missing" else "no"
        else:
            outside = ""
        rows.append({
            "site": r.site, "water_body": r.water_body, "year": r.year, "festival": r.festival,
            "phase": r.phase, "parameter": r.parameter,
            "value": fmt(r.value) if r.value is not None else "",
            "status": r.status, "value_as_printed": r.value_as_printed, "unit_assumed": r.unit,
            "class_b_limit": lim.text() if lim else "no Class B limit",
            "outside_limit": outside, "scored": "yes" if r.parameter in KEY_PARAMETERS else "no",
            "report_file": r.report_file, "source_page": r.source_page or "",
            "site_match_confidence": r.site_match_confidence,
        })
    return rows


def ranking_rows(results):
    rows = []
    for g in results:
        row = {
            "rank": g.rank, "site": g.site, "water_body": g.water_body,
            "site_match_confidence": g.confidence,
            "score": round(g.score, 1), "score_low_if_missing_fine": round(g.score_low, 1),
            "score_high_if_missing_breached": round(g.score_high, 1),
            "rank_best": g.rank_best, "rank_worst": g.rank_worst,
            "durga_only_score": round(g.durga_score, 1), "durga_only_rank": g.durga_rank,
            "key_readings_measured": g.measured, "key_readings_possible": g.possible,
            "unsampled_in_tables": g.missing, "lost_to_missing_tables": g.absent,
            "missing_tables": "; ".join(f"{fest} {y}" for y, fest in g.absent_tables),
        }
        for p in KEY_PARAMETERS:
            st = g.stats[p]
            k = {"Dissolved oxygen": "do", "BOD": "bod", "pH": "ph"}[p]
            row[f"{k}_outside"] = st.breaches
            row[f"{k}_measured"] = st.measured
            row[f"{k}_breach_rate"] = round(st.breach_rate, 4)
            row[f"{k}_mean_severity"] = round(st.mean_severity, 4)
            row[f"{k}_param_score"] = round(st.score(), 4)
            w = st.worst
            row[f"{k}_worst"] = fmt(w.value) if w else ""
            row[f"{k}_worst_where"] = (f"{w.year} {w.festival} {w.phase}, {w.report_file} p.{w.source_page}"
                                       if w else "")
        rows.append(row)
    return rows


def write_all(out_dir, readings, limits, results, sens, headline, brief_en, brief_hi):
    os.makedirs(out_dir, exist_ok=True)
    ev = evidence_rows(readings, limits)
    _csv(os.path.join(out_dir, "evidence.csv"), list(ev[0]), [list(r.values()) for r in ev])
    rk = ranking_rows(results)
    _csv(os.path.join(out_dir, "ranking.csv"), list(rk[0]), [list(r.values()) for r in rk])
    _csv(os.path.join(out_dir, "sensitivity.csv"),
         ["site", "shipped_rank"] + [w.key for w in WEIGHTINGS] + ["min_rank", "max_rank"],
         [[g.site, g.rank] + [g.sensitivity_ranks[w.key] for w in WEIGHTINGS]
          + [min(g.sensitivity_ranks.values()), max(g.sensitivity_ranks.values())] for g in results])
    data = {
        "basis": {
            "yardstick": "CPCB Class B (outdoor bathing, organised); a screening yardstick, not a legal finding",
            "limits": {p: limits[p].text() for p in KEY_PARAMETERS},
            "units": "assumed; the reports print no units",
            "score": "100 x mean over DO, BOD, pH of (0.5 x breach rate + 0.5 x mean severity), measured readings only",
        },
        "headline": {
            "do_below_limit": [headline["Dissolved oxygen"]["breaches"], headline["Dissolved oxygen"]["measured"]],
            "bod_above_limit": [headline["BOD"]["breaches"], headline["BOD"]["measured"]],
            "ph_outside_range": [headline["pH"]["breaches"], headline["pH"]["measured"]],
            "do_zero_readings": len(headline["do_zero"]),
            "do_below_limit_before_immersion": [headline["do_pre_breaches"], headline["do_pre_measured"]],
            "unsampled_key_readings": headline["missing_total"],
            "missing_tables": {s: [f"{f} {y}" for y, f in v] for s, v in headline["missing_tables"].items()},
        },
        "sensitivity": {
            "weightings": [{"key": w.key, "label": w.label} for w in WEIGHTINGS],
            "top": {"site": sens["top_site"], "first_in": sens["top_count"]},
            "bottom": {"site": sens["bottom_site"], "last_in": sens["bottom_count"]},
            "middle_reorders": sens["middle_reorders"],
        },
        "ranking": rk,
    }
    with open(os.path.join(out_dir, "ranking.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    for name, text in (("brief_en.md", brief_en), ("brief_hi.md", brief_hi)):
        with open(os.path.join(out_dir, name), "w", encoding="utf-8") as f:
            f.write(text)
    return ev
