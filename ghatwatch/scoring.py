"""Risk score for each ghat against CPCB Class B (DO, BOD, pH).

For each of DO, BOD and pH, over measured readings only:
  breach rate     = readings outside the limit / measured readings
  severity (0-1)  = DO: shortfall below the minimum / the minimum
                    BOD: excess above the maximum / 9 (12 mg/l or more -> 1)
                    pH: distance outside the range / 1.5, capped at 1
  parameter score = 0.5 x breach rate + 0.5 x mean severity
  risk score      = 100 x mean of the three parameter scores

A reading exactly on the limit is not a breach.
"""

from dataclasses import dataclass, field

from .data import (BOD, DO, FESTIVALS, KEY_PARAMETERS, MEASURED, MISSING, PH, PHASES,
                   missing_tables, site_info, sites)

# Scale for severity. These are our judgement, not CPCB numbers.
BOD_SEVERITY_SPAN = 9.0   # 3 + 9 = 12 mg/l or more is full severity
PH_SEVERITY_SPAN = 1.5    # 1.5 pH units outside the range is full severity


def is_breach(value, limit):
    if limit.kind == "min":
        return value < limit.low
    if limit.kind == "max":
        return value > limit.high
    return value < limit.low or value > limit.high


def severity(value, limit):
    if not is_breach(value, limit):
        return 0.0
    if limit.parameter == DO:
        return min(1.0, (limit.low - value) / limit.low)
    if limit.parameter == BOD:
        return min(1.0, (value - limit.high) / BOD_SEVERITY_SPAN)
    if limit.parameter == PH:
        d = max(limit.low - value, value - limit.high)
        return min(1.0, d / PH_SEVERITY_SPAN)
    raise ValueError(limit.parameter)


@dataclass
class Weighting:
    key: str
    label: str
    breach_weight: float = 0.5
    severity_weight: float = 0.5
    param_weights: dict = field(default_factory=lambda: {DO: 1.0, BOD: 1.0, PH: 1.0})


WEIGHTINGS = [
    Weighting("shipped", "Shipped: half breach rate, half severity, DO / BOD / pH equal"),
    Weighting("breach_only", "Breach rate only", 1.0, 0.0),
    Weighting("severity_only", "Severity only", 0.0, 1.0),
    Weighting("do_only", "DO only", param_weights={DO: 1.0, BOD: 0.0, PH: 0.0}),
    Weighting("bod_only", "BOD only", param_weights={DO: 0.0, BOD: 1.0, PH: 0.0}),
    Weighting("do_double", "DO counted double", param_weights={DO: 2.0, BOD: 1.0, PH: 1.0}),
]
SHIPPED = WEIGHTINGS[0]


@dataclass
class ParamStats:
    parameter: str
    measured: int = 0
    breaches: int = 0
    severity_sum: float = 0.0
    missing: int = 0          # unsampled rows in the tables
    absent: int = 0           # readings lost to a missing festival-year table
    worst: object = None      # the Reading furthest outside (or nearest) the limit
    values: list = field(default_factory=list)

    @property
    def ties(self):
        """How many measured readings share the worst value."""
        return sum(v == self.worst.value for v in self.values) if self.worst else 0

    @property
    def possible(self):
        return self.measured + self.missing + self.absent

    @property
    def breach_rate(self):
        return self.breaches / self.measured if self.measured else 0.0

    @property
    def mean_severity(self):
        return self.severity_sum / self.measured if self.measured else 0.0

    def score(self, w=SHIPPED):
        return w.breach_weight * self.breach_rate + w.severity_weight * self.mean_severity

    def bound_score(self, w, high):
        """Score if every missing reading had been fine (low) or a full breach (high)."""
        n = self.possible
        if n == 0:
            return 0.0
        extra = self.missing + self.absent if high else 0
        rate = (self.breaches + extra) / n
        sev = (self.severity_sum + extra * 1.0) / n
        return w.breach_weight * rate + w.severity_weight * sev


def combine(param_scores, w):
    total_w = sum(w.param_weights[p] for p in KEY_PARAMETERS)
    return 100 * sum(param_scores[p] * w.param_weights[p] for p in KEY_PARAMETERS) / total_w


def param_stats(readings, limits, site, festivals=FESTIVALS, absent_tables=()):
    stats = {p: ParamStats(p) for p in KEY_PARAMETERS}
    for r in readings:
        if r.site != site or r.parameter not in stats or r.festival not in festivals:
            continue
        st = stats[r.parameter]
        if r.status == MEASURED:
            lim = limits[r.parameter]
            st.measured += 1
            st.values.append(r.value)
            st.breaches += is_breach(r.value, lim)
            st.severity_sum += severity(r.value, lim)
            if st.worst is None or _worse(r, st.worst, lim):
                st.worst = r
        else:
            # BDL / ND cannot occur for DO, BOD, pH here; anything not measured is missing.
            st.missing += 1
    n_absent = sum(1 for (_, fest) in absent_tables if fest in festivals) * len(PHASES)
    for st in stats.values():
        st.absent = n_absent
    return stats


def _worse(a, b, lim):
    """True if reading a is further on the bad side of the limit than b."""
    if lim.parameter == DO:
        return a.value < b.value
    if lim.parameter == BOD:
        return a.value > b.value
    mid = (lim.low + lim.high) / 2
    return abs(a.value - mid) > abs(b.value - mid)


@dataclass
class GhatResult:
    site: str
    water_body: str
    confidence: str
    stats: dict
    durga_stats: dict
    absent_tables: list
    score: float = 0.0
    score_low: float = 0.0
    score_high: float = 0.0
    rank: int = 0
    rank_best: int = 0      # highest-risk position it could take (1 = most at risk)
    rank_worst: int = 0
    durga_score: float = 0.0
    durga_rank: int = 0
    sensitivity_ranks: dict = field(default_factory=dict)
    printed_names: list = field(default_factory=list)

    @property
    def measured(self):
        return sum(s.measured for s in self.stats.values())

    @property
    def possible(self):
        return sum(s.possible for s in self.stats.values())

    @property
    def missing(self):
        return sum(s.missing for s in self.stats.values())

    @property
    def absent(self):
        return sum(s.absent for s in self.stats.values())


def score_of(stats, w=SHIPPED):
    return combine({p: stats[p].score(w) for p in KEY_PARAMETERS}, w)


def rank_by(results, key):
    """Rank 1 = highest score. Ties broken by site name for stability."""
    ordered = sorted(results, key=lambda g: (-round(key(g), 9), g.site))
    return {g.site: i + 1 for i, g in enumerate(ordered)}


def score_all(readings, limits):
    info = site_info(readings)
    gaps = missing_tables(readings)
    results = []
    for s in sites(readings):
        absent = gaps.get(s, [])
        g = GhatResult(
            site=s, water_body=info[s]["water_body"], confidence=info[s]["confidence"],
            stats=param_stats(readings, limits, s, absent_tables=absent),
            durga_stats=param_stats(readings, limits, s, festivals=("Durga",), absent_tables=absent),
            absent_tables=absent, printed_names=sorted(info[s]["printed_names"]),
        )
        g.score = score_of(g.stats)
        g.score_low = combine({p: g.stats[p].bound_score(SHIPPED, False) for p in KEY_PARAMETERS}, SHIPPED)
        g.score_high = combine({p: g.stats[p].bound_score(SHIPPED, True) for p in KEY_PARAMETERS}, SHIPPED)
        g.durga_score = score_of(g.durga_stats)
        results.append(g)

    for site, r in rank_by(results, lambda g: g.score).items():
        _get(results, site).rank = r
    for site, r in rank_by(results, lambda g: g.durga_score).items():
        _get(results, site).durga_rank = r
    for g in results:
        others = [o for o in results if o is not g]
        g.rank_best = 1 + sum(o.score_low > g.score_high for o in others)
        g.rank_worst = 1 + sum(o.score_high > g.score_low for o in others)
    for w in WEIGHTINGS:
        for site, r in rank_by(results, lambda g, w=w: score_of(g.stats, w)).items():
            _get(results, site).sensitivity_ranks[w.key] = r
    results.sort(key=lambda g: g.rank)
    return results


def _get(results, site):
    return next(g for g in results if g.site == site)


def headline(readings, limits):
    """Overall counts across all ghats."""
    out = {}
    for p in KEY_PARAMETERS:
        rs = [r for r in readings if r.parameter == p]
        meas = [r for r in rs if r.status == MEASURED]
        out[p] = {
            "measured": len(meas),
            "breaches": sum(is_breach(r.value, limits[p]) for r in meas),
            "missing": sum(r.status == MISSING for r in rs),
        }
    do_meas = [r for r in readings if r.parameter == DO and r.status == MEASURED]
    out["do_zero"] = [r for r in do_meas if r.value == 0]
    pre = [r for r in do_meas if r.phase == "pre"]
    out["do_pre_measured"] = len(pre)
    out["do_pre_breaches"] = sum(is_breach(r.value, limits[DO]) for r in pre)
    out["missing_total"] = sum(out[p]["missing"] for p in KEY_PARAMETERS)
    out["missing_sites"] = sorted({r.site for r in readings
                                   if r.parameter in KEY_PARAMETERS and r.status == MISSING})
    out["missing_tables"] = missing_tables(readings)
    return out


def sensitivity_summary(results):
    """Plain-words stability facts across the weightings."""
    n_w = len(WEIGHTINGS)
    n = len(results)
    first = {}
    last = {}
    for w in WEIGHTINGS:
        for g in results:
            if g.sensitivity_ranks[w.key] == 1:
                first[g.site] = first.get(g.site, 0) + 1
            if g.sensitivity_ranks[w.key] == n:
                last[g.site] = last.get(g.site, 0) + 1
    top_site, top_n = max(first.items(), key=lambda t: t[1])
    bot_site, bot_n = max(last.items(), key=lambda t: t[1])
    middle = []
    for g in results:
        rs = [g.sensitivity_ranks[w.key] for w in WEIGHTINGS]
        middle.append((g.site, min(rs), max(rs)))
    # Shipped ranks 3..n-1: does their order change in any weighting?
    mid_sites = [g.site for g in results if 3 <= g.rank <= n - 1]
    mid_reorders = any(
        [s for s in sorted(mid_sites, key=lambda s: _get(results, s).sensitivity_ranks[w.key])] != mid_sites
        for w in WEIGHTINGS)
    return {"n_weightings": n_w, "top_site": top_site, "top_count": top_n,
            "bottom_site": bot_site, "bottom_count": bot_n, "ranges": middle,
            "middle_from": 3, "middle_to": n - 1, "middle_reorders": mid_reorders}
