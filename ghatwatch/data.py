"""Load the Bhopal ghat readings and the CPCB limits.

Every reading gets a status:
  measured  - a number was printed
  BDL       - below detection limit (very low, not zero, not missing)
  ND        - not detected (very low, not zero, not missing)
  missing   - blank, "_", "-", "*", "**", "not sampled", or anything unexpected
"""

import csv
import math
import os
from dataclasses import dataclass, field

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
READINGS_CSV = os.path.join(DATA_DIR, "bhopal_ghats_2023_2025.csv")
CRITERIA_CSV = os.path.join(DATA_DIR, "cpcb_water_quality_criteria.csv")

# The three parameters that have a CPCB Class B limit in this data.
DO, BOD, PH = "Dissolved oxygen", "BOD", "pH"
KEY_PARAMETERS = (DO, BOD, PH)

# CPCB criteria names -> parameter names used in the readings CSV.
CRITERIA_NAME_MAP = {"Dissolved oxygen": DO, "BOD (5 days 20C)": BOD, "pH": PH}

PHASES = ("pre", "during", "after")
FESTIVALS = ("Ganesh", "Durga")

REPORT_FILES = {
    2023: "Idol_immer._Report_23_CPCB.pdf",
    2024: "Ganesh_and_Durga_visarjan_report-2024.pdf",
    2025: "Ganesh_and_Durga_visarjan_report-2025.pdf",
}

MEASURED, BDL_STATUS, ND_STATUS, MISSING = "measured", "BDL", "ND", "missing"


@dataclass
class Reading:
    year: int
    festival: str
    site: str
    water_body: str
    phase: str
    parameter: str
    value: float | None
    status: str
    unit: str
    value_as_printed: str
    flag: str
    site_match_confidence: str
    source_page: int | None
    site_as_printed: str = ""

    @property
    def report_file(self):
        return REPORT_FILES.get(self.year, "")


@dataclass
class Limit:
    parameter: str
    kind: str  # "min", "max" or "range"
    low: float | None = None
    high: float | None = None
    unit: str = ""
    cpcb_class: str = "B"
    designated_use: str = ""

    def text(self):
        if self.kind == "min":
            return f"at least {fmt(self.low)}"
        if self.kind == "max":
            return f"at most {fmt(self.high)}"
        return f"{fmt(self.low)} to {fmt(self.high)}"


def fmt(x):
    """Format a number without a trailing .0."""
    if x is None:
        return ""
    return f"{x:g}"


def classify(value, value_as_printed, flag):
    """Return (number or None, status) for one cell."""
    v = (value or "").strip()
    printed = (value_as_printed or "").strip().upper()
    fl = (flag or "").strip().upper()
    if v:
        try:
            x = float(v)
        except ValueError:
            return None, MISSING
        return (x, MEASURED) if math.isfinite(x) and x >= 0 else (None, MISSING)
    if fl == "BDL" or printed == "BDL":
        return None, BDL_STATUS
    if fl == "ND" or printed == "ND":
        return None, ND_STATUS
    # Blank, "_", "-", "*", "**", "not sampled" or anything unexpected.
    return None, MISSING


def normalise_water_body(wb):
    wb = (wb or "").strip()
    if wb.startswith("Lower Lake"):
        return "Lower Lake"
    return wb


def load_readings(path=READINGS_CSV):
    out = []
    with open(path, encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        need = {"year", "festival", "site", "water_body", "phase", "parameter", "value", "value_as_printed", "flag", "unit_assumed"}
        lacking = need - set(reader.fieldnames or [])
        if lacking:
            raise ValueError(f"{path}: missing column(s) {', '.join(sorted(lacking))}")
        for row in reader:
            value, status = classify(row["value"], row["value_as_printed"], row["flag"])
            page = row.get("source_page", "").strip()
            out.append(Reading(
                year=int(row["year"]),
                festival=row["festival"].strip(),
                site=row["site"].strip(),
                water_body=normalise_water_body(row["water_body"]),
                phase=row["phase"].strip(),
                parameter=row["parameter"].strip(),
                value=value,
                status=status,
                unit=row["unit_assumed"].strip(),
                value_as_printed=row["value_as_printed"].strip(),
                flag=row["flag"].strip(),
                site_match_confidence=row["site_match_confidence"].strip(),
                source_page=int(page) if page.isdigit() else None,
                site_as_printed=row.get("site_as_printed", "").strip(),
            ))
    return out


def load_limits(path=CRITERIA_CSV, cpcb_class="B"):
    """Read the Class B limits for DO, BOD and pH from the CPCB CSV."""
    limits = {}
    with open(path, encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            if row["class"].strip() != cpcb_class:
                continue
            name = CRITERIA_NAME_MAP.get(row["parameter"].strip())
            if not name:
                continue
            kind = row["limit_type"].strip()
            raw = row["limit"].strip()
            lim = Limit(name, kind, unit=row["unit"].strip(), cpcb_class=cpcb_class,
                        designated_use=row["designated_best_use"].strip())
            if kind == "range":
                lo, hi = raw.split("-")
                lim.low, lim.high = float(lo), float(hi)
            elif kind == "min":
                lim.low = float(raw)
            elif kind == "max":
                lim.high = float(raw)
            else:
                raise ValueError(f"Unknown limit type {kind!r}")
            limits[name] = lim
    missing = [p for p in KEY_PARAMETERS if p not in limits]
    if missing:
        raise ValueError(f"CPCB CSV has no Class {cpcb_class} limit for {missing}")
    return limits


def sites(readings):
    """Sites in first-appearance order."""
    seen = {}
    for r in readings:
        seen.setdefault(r.site, r)
    return list(seen)


def site_info(readings):
    info = {}
    for r in readings:
        i = info.setdefault(r.site, {"water_body": r.water_body, "confidence": r.site_match_confidence,
                                     "printed_names": set()})
        if r.site_match_confidence == "medium":
            i["confidence"] = "medium"
        if r.site_as_printed:
            i["printed_names"].add(r.site_as_printed)
    return info


def missing_tables(readings):
    """Festival-year tables present for some ghat but absent for another.

    Returns {site: [(year, festival), ...]}, detected from the data itself.
    """
    present = {}
    for r in readings:
        present.setdefault(r.site, set()).add((r.year, r.festival))
    all_tables = set().union(*present.values()) if present else set()
    return {s: sorted(all_tables - p) for s, p in present.items() if all_tables - p}
