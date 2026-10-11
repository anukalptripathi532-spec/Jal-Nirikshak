"""Render outputs/report.html: one self-contained page, English / Hindi."""

import html
import json
import os

from .brief import FEST_HI, NAME_HI, PHASE_SHORT_HI, SHORT_EN, SHORT_HI, WATER_HI, to_plain
from .data import BDL_STATUS, BOD, DO, KEY_PARAMETERS, MEASURED, MISSING, ND_STATUS, PH, PHASES, fmt
from .scoring import WEIGHTINGS, is_breach, severity

PARAM_HI = {
    "pH": "pH", "Dissolved oxygen": "घुलित ऑक्सीजन (DO)", "BOD": "BOD", "COD": "COD",
    "Total solids": "कुल ठोस", "Dissolved solids": "घुले ठोस", "Suspended solids": "निलंबित ठोस",
    "Turbidity": "गंदलापन", "Conductivity": "चालकता", "Chromium": "क्रोमियम", "Lead": "लेड",
    "Zinc": "ज़िंक", "Copper": "कॉपर",
}
SHORT_PARAM = {"Dissolved oxygen": "DO"}
SHORT_PARAM_HI = {"Dissolved oxygen": "DO"}
WEIGHT_HI = {
    "shipped": "चुना गया: आधा सीमा-पार दर, आधा गंभीरता", "breach_only": "केवल सीमा-पार दर",
    "severity_only": "केवल गंभीरता", "do_only": "केवल DO", "bod_only": "केवल BOD",
    "do_double": "DO दोगुना",
}


def esc(s):
    return html.escape(str(s), quote=True)


def t(en, hi):
    """Bilingual inline text. Arguments are already-escaped HTML."""
    return f'<span class="l-en">{en}</span><span class="l-hi" lang="hi">{hi}</span>'


def md_to_html(md):
    out, in_list = [], None
    for line in md.splitlines():
        if line.startswith("# "):
            continue  # title shown separately
        if in_list and not (line.startswith("- ") or line[:2].rstrip(".").isdigit()):
            out.append(f"</{in_list}>")
            in_list = None
        if line.startswith("## "):
            out.append(f"<h3>{esc(line[3:])}</h3>")
        elif line.startswith("- "):
            if in_list != "ul":
                out.append("<ul>")
                in_list = "ul"
            out.append(f"<li>{esc(line[2:])}</li>")
        elif line[:1].isdigit() and line[1:3] == ". ":
            if in_list != "ol":
                out.append("<ol>")
                in_list = "ol"
            out.append(f"<li>{esc(line[3:])}</li>")
        elif line.strip():
            out.append(f"<p>{esc(line)}</p>")
    if in_list:
        out.append(f"</{in_list}>")
    return "\n".join(out)


def reason(g):
    """Plain-words reason for the rank, English and Hindi."""
    d, b, p = g.stats[DO], g.stats[BOD], g.stats[PH]
    zeros = sum(v == 0 for v in d.values)
    en = [f"DO below 5 in {d.breaches} of {d.measured} readings"
          + (f" ({zeros} at zero)" if zeros else ""),
          f"BOD above 3 in {b.breaches} of {b.measured}",
          f"pH outside 6.5-8.5 in {p.breaches} of {p.measured}"]
    hi = [f"DO 5 से कम: {d.measured} में से {d.breaches}" + (f" ({zeros} बार शून्य)" if zeros else ""),
          f"BOD 3 से अधिक: {b.measured} में से {b.breaches}",
          f"pH 6.5-8.5 से बाहर: {p.measured} में से {p.breaches}"]
    gap = g.missing + g.absent
    if gap:
        en.append(f"{gap} of {g.possible} key readings missing, so the score could be "
                  f"{g.score_low:.1f} to {g.score_high:.1f}")
        hi.append(f"{g.possible} में से {gap} मुख्य रीडिंग नहीं हैं, इसलिए स्कोर "
                  f"{g.score_low:.1f} से {g.score_high:.1f} तक हो सकता है")
    return "; ".join(en) + ".", "; ".join(hi) + "।"


def status_cell(r, lim):
    if r.status == MEASURED:
        shown = esc(fmt(r.value))
    elif r.status in (BDL_STATUS, ND_STATUS):
        shown = f'<span class="tag tag-low">{esc(r.status)}</span>'
    else:
        printed = r.value_as_printed or t("blank", "खाली")
        shown = (f'<span class="tag tag-miss">{t("not sampled", "नमूना नहीं")}</span>'
                 f' <span class="muted">({printed if not r.value_as_printed else esc(printed)})</span>')
    if not lim:
        flag = ''
    elif r.status == MEASURED:
        flag = (f'<span class="tag tag-bad">{t("outside", "सीमा से बाहर")}</span>' if is_breach(r.value, lim)
                else f'<span class="tag tag-ok">{t("within", "सीमा में")}</span>')
    else:
        flag = f'<span class="muted">{t("unknown", "अज्ञात")}</span>'
    return shown, flag


def evidence_table(rows, limits, key):
    head = (f"<tr><th>{t('Year', 'वर्ष')}</th><th>{t('Festival', 'पर्व')}</th><th>{t('Phase', 'चरण')}</th>"
            f"<th>{t('Test', 'जाँच')}</th><th>{t('Value', 'मान')}</th><th>{t('Unit*', 'इकाई*')}</th>"
            + (f"<th>{t('Class B limit', 'क्लास B सीमा')}</th><th>{t('Outside?', 'बाहर?')}</th>" if key else "")
            + f"<th>{t('Source', 'स्रोत')}</th></tr>")
    body = []
    for r in rows:
        lim = limits.get(r.parameter)
        shown, flag = status_cell(r, lim)
        lim_txt = esc(lim.text()) if lim else ""
        body.append(
            f"<tr><td>{r.year}</td><td>{t(esc(r.festival), FEST_HI[r.festival])}</td>"
            f"<td>{t(esc(r.phase), esc(PHASE_SHORT_HI[r.phase]))}</td>"
            f"<td>{t(esc(SHORT_PARAM.get(r.parameter, r.parameter)), esc(SHORT_PARAM_HI.get(r.parameter, PARAM_HI.get(r.parameter, r.parameter))))}</td>"
            f"<td class='num'>{shown}</td><td class='muted'>{esc(r.unit)}</td>"
            + (f"<td class='muted'>{lim_txt}</td><td>{flag}</td>" if key else "")
            + f"<td class='src'>{esc(r.report_file)} <b>p.{esc(r.source_page)}</b></td></tr>")
    return f'<div class="tscroll"><table>{head}{"".join(body)}</table></div>'


ORDER_P = {p: i for i, p in enumerate(["Dissolved oxygen", "BOD", "pH", "COD", "Total solids", "Dissolved solids",
                                        "Suspended solids", "Turbidity", "Conductivity", "Chromium", "Lead",
                                        "Zinc", "Copper"])}
ORDER_F = {"Ganesh": 0, "Durga": 1}
ORDER_PH = {p: i for i, p in enumerate(PHASES)}


def ghat_card(g, readings, limits):
    rs = sorted((r for r in readings if r.site == g.site),
                key=lambda r: (ORDER_P.get(r.parameter, 99), r.year, ORDER_F[r.festival], ORDER_PH[r.phase]))
    key_rows = [r for r in rs if r.parameter in KEY_PARAMETERS]
    other_rows = [r for r in rs if r.parameter not in KEY_PARAMETERS]
    r_en, r_hi = reason(g)
    lo, hi_, sc = g.score_low, g.score_high, g.score
    rank_rng = f"{g.rank_best}" if g.rank_best == g.rank_worst else f"{g.rank_best}-{g.rank_worst}"
    notes = []
    if g.confidence == "medium":
        names = "; ".join(esc(n) for n in g.printed_names)
        notes.append(t(f"Site match confidence is medium. Ganesh tables say “Kamla Park kund”, Durga tables say "
                       f"“Lower Lake ghat”. They may be two places; kept as one site. Printed names: {names}.",
                       f"स्थान मिलान का भरोसा मध्यम है। गणेश तालिकाओं में “कमला पार्क कुंड”, दुर्गा तालिकाओं में "
                       f"“लोअर लेक घाट” लिखा है। ये दो जगहें हो सकती हैं; यहाँ एक ही माना गया है। छपे नाम: {names}।"))
    for y, fest in g.absent_tables:
        notes.append(t(f"No {fest} {y} table for this ghat in the {y} report: 3 phases × DO/BOD/pH counted as missing.",
                       f"{y} रिपोर्ट में इस घाट की {FEST_HI[fest]} {y} तालिका नहीं है: 3 चरण × DO/BOD/pH छूटे माने गए।"))
    note_html = "".join(f'<p class="note">{n}</p>' for n in notes)
    params = []
    for p in KEY_PARAMETERS:
        st = g.stats[p]
        w = st.worst
        where = (f"{w.year} {esc(w.festival)} {esc(w.phase)}, p.{w.source_page}" if w else "")
        params.append(
            f"<tr><td>{t(esc(p), esc(PARAM_HI[p]))}</td><td class='num'>{st.breaches}/{st.measured}</td>"
            f"<td class='num'>{st.missing + st.absent}</td><td class='num'>{st.mean_severity:.2f}</td>"
            f"<td class='num'>{100 * st.score():.1f}</td>"
            f"<td class='num'>{esc(fmt(w.value)) if w else ''} <span class='muted'>{where}</span></td></tr>")
    ptable = (f'<div class="tscroll"><table class="ptable"><tr><th>{t("Test", "जाँच")}</th>'
              f'<th>{t("Outside / measured", "बाहर / मापी")}</th><th>{t("Missing", "छूटी")}</th>'
              f'<th>{t("Mean severity", "औसत गंभीरता")}</th><th>{t("Part score", "भाग स्कोर")}</th>'
              f'<th>{t("Worst reading", "सबसे ख़राब रीडिंग")}</th></tr>{"".join(params)}</table></div>')
    wb_hi = WATER_HI.get(g.water_body, g.water_body)
    return f"""
<article class="ghat" id="g{g.rank}">
  <div class="ghat-head">
    <div class="rank">{g.rank}</div>
    <div class="ghat-name">
      <h4>{t(esc(g.site), esc(NAME_HI[g.site]))}{' <span class="tag tag-warn">?</span>' if g.confidence == 'medium' else ''}</h4>
      <div class="meta"><span class="chip">{t('Rank', 'रैंक')} {rank_rng}</span> <span class="chip chip-quiet">{t('Durga-only', 'केवल दुर्गा')} {g.durga_rank}</span> <span class="muted">{t(esc(g.water_body), esc(wb_hi))}</span></div>
      <div class="muted small">{g.measured} {t('of', 'में से')} {g.possible} {t('key readings measured', 'मुख्य रीडिंग मापी गईं')}</div>
    </div>
    <div class="score"><span class="big">{sc:.1f}</span><span class="muted small">{t('range', 'दायरा')} {lo:.1f}-{hi_:.1f}</span></div>
  </div>
  <div class="bar" role="img" aria-label="score {sc:.1f}, range {lo:.1f} to {hi_:.1f}">
    <div class="bar-range" style="left:{lo:.1f}%;width:{max(hi_ - lo, 0.4):.1f}%"></div>
    <div class="bar-fill" style="width:{sc:.1f}%"></div>
  </div>
  <p class="reason">{t(esc(r_en), esc(r_hi))}</p>
  {note_html}
  <details>
    <summary>{t('Evidence: every reading, with limit and report page', 'प्रमाण: हर रीडिंग, सीमा और रिपोर्ट पृष्ठ के साथ')}</summary>
    {ptable}
    <h5>{t('DO, BOD and pH (scored)', 'DO, BOD और pH (स्कोर में)')}</h5>
    {evidence_table(key_rows, limits, True)}
    <details class="inner">
      <summary>{t(f'Other tests, not scored ({len(other_rows)} readings; no Class B limit)', f'अन्य जाँचें, स्कोर में नहीं ({len(other_rows)} रीडिंग; क्लास B सीमा नहीं)')}</summary>
      {evidence_table(other_rows, limits, False)}
    </details>
  </details>
</article>"""


def tiers_of(results):
    """Tiers from the computed numbers: top 3 by shipped rank; ghats certain to rank last
    (even if every missing reading had breached); everything else in between."""
    n = len(results)
    last = [g for g in results if g.rank_best == n]
    first = [g for g in results if g.rank <= 3 and g not in last]
    middle = [g for g in results if g not in first and g not in last]
    return [("first", first), ("next", middle), ("last", last)]


TIER_LABEL = {
    "first": ("Look at first", "पहले देखें"),
    "next": ("Next", "उसके बाद"),
    "last": ("Lowest, even in the worst case", "सबसे कम, सबसे बुरी स्थिति में भी"),
}


def overlap_pair(group):
    """First pair in the group whose score ranges overlap, or None."""
    for i, a in enumerate(group):
        for b in group[i + 1:]:
            if a.score_low <= b.score_high and b.score_low <= a.score_high:
                return a, b
    return None


def answer_block(results, h, do_l):
    rows = []
    for key, group in tiers_of(results):
        if not group:
            continue
        en_l, hi_l = TIER_LABEL[key]
        items = []
        for g in group:
            rng = f"{g.rank_best}" if g.rank_best == g.rank_worst else f"{g.rank_best}-{g.rank_worst}"
            items.append(
                f'<li><a href="#g{g.rank}">{t(esc(SHORT_EN[g.site]), esc(SHORT_HI[g.site]))}</a> '
                f'<span class="num">{g.score:.1f}</span> '
                f'<span class="muted small">{t("rank", "रैंक")} {rng}</span></li>')
        rows.append(f'<div class="tier tier-{key}"><div class="tier-label">{t(en_l, hi_l)}</div>'
                    f'<ul class="tier-names">{"".join(items)}</ul></div>')
    first = tiers_of(results)[0][1]
    pair = overlap_pair(first)
    if pair:
        a, b = pair
        ov_en = (f"Order within a tier is not firm. Score ranges overlap: {SHORT_EN[a.site]} "
                 f"{a.score_low:.1f}-{a.score_high:.1f} and {SHORT_EN[b.site]} {b.score_low:.1f}-{b.score_high:.1f}.")
        ov_hi = (f"एक स्तर के भीतर क्रम पक्का नहीं है। स्कोर दायरे मिलते हैं: {SHORT_HI[a.site]} "
                 f"{a.score_low:.1f}-{a.score_high:.1f} और {SHORT_HI[b.site]} {b.score_low:.1f}-{b.score_high:.1f}।")
    else:
        ov_en = ov_hi = ""
    durga = sorted(results, key=lambda g: g.durga_rank)
    d_names_en = ", ".join(SHORT_EN[g.site] for g in durga[:3])
    d_names_hi = ", ".join(SHORT_HI[g.site] for g in durga[:3])
    same = {g.site for g in durga[:3]} == {g.site for g in first}
    d_en = (f"Durga visarjan readings alone give the same three: {d_names_en}." if same
            else f"Durga visarjan readings alone put these three first: {d_names_en}.")
    d_hi = (f"केवल दुर्गा विसर्जन की रीडिंग से भी वही तीन: {d_names_hi}।" if same
            else f"केवल दुर्गा विसर्जन की रीडिंग से पहले ये तीन: {d_names_hi}।")
    pre_en = (f"DO was already below {fmt(do_l.low)} mg/l before immersion in {h['do_pre_breaches']} of "
              f"{h['do_pre_measured']} readings, so these figures alone do not show immersion as the cause.")
    pre_hi = (f"विसर्जन से पहले ही {h['do_pre_measured']} में से {h['do_pre_breaches']} रीडिंग में DO "
              f"{fmt(do_l.low)} mg/l से कम था, इसलिए केवल इन आँकड़ों से विसर्जन को कारण नहीं माना जा सकता।")
    return f"""<div class="answer">
  <div class="tiers">{"".join(rows)}</div>
  <p class="caveat">{t(esc(ov_en) + ' ' + esc(d_en), esc(ov_hi) + ' ' + esc(d_hi))}</p>
  <p class="caveat">{t(esc(pre_en), esc(pre_hi))}</p>
</div>
"""


def howto(h, do_l, bod_l, ph_l):
    return f"""<li class="l-en">Yardstick: CPCB Class B (outdoor organised bathing) - DO {esc(do_l.text())} mg/l, BOD {esc(bod_l.text())} mg/l, pH {esc(ph_l.text())}. CPCB has no class for idol immersion; Class B is the nearest designated use for water people enter. It is a screening yardstick, not a legal finding.</li>
<li class="l-hi" lang="hi">पैमाना: CPCB क्लास B (संगठित बाहरी स्नान) - DO कम से कम {fmt(do_l.low)} mg/l, BOD अधिकतम {fmt(bod_l.high)} mg/l, pH {fmt(ph_l.low)} से {fmt(ph_l.high)}। CPCB में मूर्ति विसर्जन के लिए कोई क्लास नहीं है; जिस पानी में लोग उतरते हैं, उसके लिए क्लास B सबसे नज़दीकी उपयोग है। यह जाँच का पैमाना है, कानूनी निष्कर्ष नहीं।</li>
<li class="l-en">Score: for each of DO, BOD, pH, part score = 0.5 × share of readings outside the limit + 0.5 × mean severity. Severity: DO shortfall below 5 ÷ 5; BOD excess above 3 ÷ 9 (12 or more = 1); pH distance outside 6.5-8.5 ÷ 1.5, capped at 1. Risk score = 100 × mean of the three. A reading exactly on the limit is within it. You can recompute any score by hand from the evidence table.</li>
<li class="l-hi" lang="hi">स्कोर: DO, BOD, pH हर एक के लिए भाग स्कोर = 0.5 × सीमा से बाहर रीडिंग का हिस्सा + 0.5 × औसत गंभीरता। गंभीरता: DO में 5 से कमी ÷ 5; BOD में 3 से अधिकता ÷ 9 (12 या अधिक = 1); pH का 6.5-8.5 से बाहर अंतर ÷ 1.5, अधिकतम 1। जोखिम स्कोर = तीनों का औसत × 100। ठीक सीमा पर रीडिंग सीमा में मानी गई। प्रमाण तालिका से कोई भी स्कोर हाथ से दोबारा निकाला जा सकता है।</li>
<li class="l-en">Missing is not clean. Blank, “_”, “*” and “**” cells mean not sampled; they are left out of the score and shown as missing. The score range assumes every missing reading was fine (low end) or a full breach (high end); the rank range follows from it. A ghat’s whole festival-year table missing from a report is detected from the data and counted the same way.</li>
<li class="l-hi" lang="hi">छूटी रीडिंग का मतलब साफ़ पानी नहीं। खाली, “_”, “*” और “**” का मतलब नमूना नहीं लिया गया; ये स्कोर से बाहर हैं और छूटी दिखाई गई हैं। स्कोर दायरा मानता है कि हर छूटी रीडिंग ठीक थी (निचला सिरा) या पूरी तरह सीमा से बाहर थी (ऊपरी सिरा); रैंक दायरा इसी से निकलता है। किसी घाट की पूरी पर्व-वर्ष तालिका न होना भी डेटा से पता लगाकर इसी तरह गिना गया।</li>
<li class="l-en">BDL (below detection limit) and ND (not detected) mean very low, not zero and not missing. They appear only in the metal and other unscored tests.</li>
<li class="l-hi" lang="hi">BDL (पहचान सीमा से कम) और ND (पता नहीं चला) का मतलब बहुत कम है, शून्य या छूटी नहीं। ये केवल धातु और अन्य बिना स्कोर वाली जाँचों में हैं।</li>
<li class="l-en">Units (*) are not printed in the reports; the standard unit for each test is assumed. Only 4 metals were tested (chromium, lead, zinc, copper) and Class B sets no limit for them, so they are shown but not scored. Total coliform, the other Class B limit, is not in the tables.</li>
<li class="l-hi" lang="hi">इकाइयाँ (*) रिपोर्ट में छपी नहीं हैं; हर जाँच की मानक इकाई मानी गई है। केवल 4 धातुएँ जाँची गईं (क्रोमियम, लेड, ज़िंक, कॉपर) और क्लास B में इनकी सीमा नहीं है, इसलिए ये दिखाई गई हैं पर स्कोर में नहीं। टोटल कोलीफॉर्म, क्लास B की दूसरी सीमा, तालिकाओं में नहीं है।</li>
<li class="l-en">DO was already below 5 mg/l before immersion in {h['do_pre_breaches']} of {h['do_pre_measured']} readings, so these figures alone do not show immersion as the cause. No health effects are claimed. The ranking is 2023-2025 history; no 2026 results exist. The decision is the officer’s.</li>
<li class="l-hi" lang="hi">विसर्जन से पहले ही {h['do_pre_measured']} में से {h['do_pre_breaches']} रीडिंग में DO 5 mg/l से कम था, इसलिए केवल इन आँकड़ों से विसर्जन को कारण नहीं माना जा सकता। स्वास्थ्य पर असर का कोई दावा नहीं। यह क्रम 2023-2025 का इतिहास है; 2026 के नतीजे नहीं हैं। निर्णय अधिकारी का है।</li>"""


ASSETS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets")
PKEY = {DO: "DO", BOD: "BOD", PH: "pH"}
SEV_HI = {"critical": "गंभीर", "high": "उच्च", "moderate": "मध्यम"}
SEV_EN = {"critical": "Critical", "high": "High", "moderate": "Moderate"}
PHASE_EN = {"pre": "before immersion", "during": "during immersion", "after": "one week after"}


def files_section():
    cols = [("site", "required", "Ghat name", "घाट का नाम"), ("parameter", "required", "DO, BOD or pH", "DO, BOD या pH"),
            ("value", "required", "Number", "संख्या"), ("year", "optional", "e.g. 2026", "जैसे 2026"),
            ("festival", "optional", "Ganesh or Durga", "Ganesh या Durga"), ("phase", "optional", "pre, during or after", "pre, during या after")]
    col_rows = "".join(
        f'<div class="row"><dt><code>{c}</code></dt><dd>{t(req, "ज़रूरी" if req == "required" else "वैकल्पिक")} · {t(en, hi)}</dd></div>'
        for c, req, en, hi in cols)
    return f"""<section id="files" class="view" aria-labelledby="h-files">
<div class="wrap">
  <div class="sec-head"><div>
    <h2 id="h-files">{t('Officer files', 'अधिकारी की फ़ाइलें')}</h2>
    <p>{t('Add PDF reports and CSV readings. Files stay in this browser only; nothing is uploaded anywhere. Added readings are checked against the Class B limits but are not part of the ranking.',
          'PDF रिपोर्ट और CSV रीडिंग जोड़ें। फ़ाइलें केवल इसी ब्राउज़र में रहती हैं; कहीं अपलोड नहीं होतीं। जोड़ी गई रीडिंग क्लास B सीमा से जाँची जाती हैं पर क्रम (रैंकिंग) में शामिल नहीं होतीं।')}</p>
  </div></div>
  <div class="bento">
    <div>
      <div class="drop" id="drop" role="group" aria-label="Add files">
        <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="21" fill="#fff1b8" stroke="#232323" stroke-width="1.2"/><path d="M22 29V15M22 15l-6 6M22 15l6 6" fill="none" stroke="#232323" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <b>{t('Drop PDF or CSV files here', 'PDF या CSV फ़ाइलें यहाँ छोड़ें')}</b>
        <span class="muted small">{t('PDF and CSV, up to 25 MB each', 'PDF और CSV, हर एक 25 MB तक')}</span>
        <button type="button" class="btn" id="file-pick">{t('Choose files', 'फ़ाइलें चुनें')}</button>
        <input type="file" id="file-in" multiple accept=".pdf,.csv,application/pdf,text/csv" hidden>
      </div>
      <p class="file-msg" id="file-msg" role="status" aria-live="polite"></p>
      <div class="sec-sub"><h3>{t('Your files', 'आपकी फ़ाइलें')}</h3></div>
      <ul class="files" id="file-list"></ul>
      <div class="state panel" id="file-empty"><b>{t('No files added yet', 'अभी कोई फ़ाइल नहीं जोड़ी गई')}</b><span>{t('Drop a CSV of readings or a PDF report to start.', 'शुरू करने के लिए रीडिंग की CSV या PDF रिपोर्ट छोड़ें।')}</span></div>
      <div class="panel csv-result" id="csv-result" hidden></div>
      <div class="panel pdf-prev" id="pdf-prev" hidden></div>
    </div>
    <aside class="status-panel">
      <h2>{t('CSV format', 'CSV का प्रारूप')}</h2>
      <dl>{col_rows}</dl>
      <p class="small" style="color:var(--on-dark-muted);margin:12px 0 14px">{t('The first row is the header. Names are not case sensitive. Ghat names are matched to the seven ghats in this report.', 'पहली पंक्ति शीर्षक है। नाम में बड़े-छोटे अक्षर का फ़र्क नहीं। घाट के नाम इस रिपोर्ट के सात घाटों से मिलाए जाते हैं।')}</p>
      <button type="button" class="btn yellow" id="tpl">{t('Download CSV template', 'CSV टेम्पलेट डाउनलोड करें')}</button>
      <div style="height:16px"></div>
    </aside>
  </div>
</div>
</section>
"""


def read_asset(name):
    with open(os.path.join(ASSETS, name), encoding="utf-8") as f:
        return f.read()


def sev_band(s):
    """Display band for the project's own 0-1 severity (scoring.severity). Not a CPCB category."""
    return "critical" if s >= 2 / 3 else "high" if s >= 1 / 3 else "moderate"


SEV_ICON = {
    "critical": '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1 11 6 6 11 1 6Z" fill="currentColor"/></svg>',
    "high": '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1.5 11 10.5H1Z" fill="currentColor"/></svg>',
    "moderate": '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4.2" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
}


def key_rows(readings, results, limits):
    """DO/BOD/pH readings with the existing breach and severity calculations attached."""
    index = {g.site: i for i, g in enumerate(results)}
    out = []
    for r in readings:
        if r.parameter not in KEY_PARAMETERS:
            continue
        lim = limits[r.parameter]
        meas = r.status == MEASURED
        out.append({"s": index[r.site], "y": r.year, "f": r.festival, "p": r.phase, "k": PKEY[r.parameter],
                    "v": r.value if meas else None, "b": int(meas and is_breach(r.value, lim)),
                    "sev": round(severity(r.value, lim), 3) if meas else 0, "pg": r.source_page,
                    "file": r.report_file, "pr": r.value_as_printed if not meas else "", "_r": r})
    return out


def incident_rows(rows, results, limits):
    items = sorted((x for x in rows if x["b"]), key=lambda x: (-x["sev"], -x["y"]))
    body = []
    for x in items:
        r, g = x["_r"], results[x["s"]]
        lim = limits[r.parameter]
        band = sev_band(x["sev"])
        ordn = x["y"] * 10 + ORDER_F[r.festival] * 3 + ORDER_PH[r.phase]
        search = f"{g.site} {SHORT_EN[g.site]} {NAME_HI[g.site]} {r.parameter} {PKEY[r.parameter]} {r.festival} {r.year} {r.phase}".lower()
        unit = f" {esc(r.unit)}" if r.unit else ""
        body.append(
            f'<tr data-sev="{band}" data-sev_n="{x["sev"]}" data-k="{PKEY[r.parameter]}" data-f="{r.festival}" data-y="{r.year}" '
            f'data-ord="{ordn}" data-site="{esc(g.site)}" data-search="{esc(search)}" hidden>'
            f'<td><span class="sev sev-{band}">{SEV_ICON[band]}{t(SEV_EN[band], SEV_HI[band])}</span></td>'
            f'<td><strong>{t(esc(SHORT_EN[g.site]), esc(SHORT_HI[g.site]))}</strong>'
            f'<div class="muted small">{t(esc(g.water_body), esc(WATER_HI.get(g.water_body, g.water_body)))}</div></td>'
            f"<td>{t(esc(PKEY[r.parameter]), esc(SHORT_PARAM_HI.get(r.parameter, PARAM_HI.get(r.parameter, r.parameter))))}</td>"
            f'<td class="num"><strong>{esc(fmt(r.value))}</strong>{unit}'
            f'<div class="muted small">{t("limit", "सीमा")}: {esc(lim.text())}</div></td>'
            f'<td>{r.year} {t(esc(r.festival), FEST_HI[r.festival])}'
            f'<div class="muted small">{t(esc(PHASE_EN[r.phase]), esc(PHASE_SHORT_HI[r.phase]))}</div></td>'
            f'<td class="src">{esc(r.report_file)} <b>p.{esc(r.source_page)}</b></td></tr>')
    counts = {b: sum(1 for x in items if sev_band(x["sev"]) == b) for b in SEV_EN}
    return "".join(body), counts, len(items)


def seg_buttons(opts, on="all"):
    return "".join(f'<button type="button" data-v="{v}" aria-pressed="{"true" if v == on else "false"}">{label}</button>'
                   for v, label in opts)


def metric(fig, denom, label, frac, warn=False):
    pct = f"{100 * frac:.0f}%"
    return (f'<div class="metric"><div class="lab">{label}</div>'
            f'<div class="pill-meter{" warn" if warn else ""}" aria-hidden="true"><i style="width:{max(100 * frac, 0):.0f}%">{pct}</i></div>'
            f'<div class="fig">{fig}{f" <small>/ {denom}</small>" if denom else ""}</div></div>')


NAV = [("overview", "Overview", "सारांश"), ("priority", "Priority", "प्राथमिकता"), ("trends", "Trends", "रुझान"),
       ("incidents", "Incidents", "घटनाएँ"), ("ghats", "Ghats", "घाट"), ("brief", "Brief", "सार"),
       ("method", "Method", "विधि"), ("files", "Files", "फ़ाइलें")]

LOGO = ('<svg width="26" height="26" viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="14" fill="#ffd95a"/>'
        '<path d="M6 12c2.6-2.6 4.4-2.6 8 0s5.4 2.6 8 0M6 18c2.6-2.6 4.4-2.6 8 0s5.4 2.6 8 0" fill="none" stroke="#232323" stroke-width="2" stroke-linecap="round"/></svg>')


def render(readings, limits, results, h, sens, brief_en, brief_hi):
    card_parts = []
    for key, group in tiers_of(results):
        if group:
            en_l, hi_l = TIER_LABEL[key]
            card_parts.append(f'<h3 class="tier-h">{t(en_l, hi_l)}</h3>')
            card_parts.extend(ghat_card(g, readings, limits) for g in group)
    cards = "\n".join(card_parts)
    sens_rows = "".join(
        f"<tr><td>{t(esc(SHORT_EN[g.site]), esc(NAME_HI[g.site]))}</td>"
        + "".join(f"<td class='num{' hl' if g.sensitivity_ranks[w.key] != g.rank else ''}'>{g.sensitivity_ranks[w.key]}</td>"
                  for w in WEIGHTINGS) + "</tr>" for g in results)
    sens_head = "".join(f"<th>{t(esc(w.label.split(':')[0]), esc(WEIGHT_HI[w.key]))}</th>" for w in WEIGHTINGS)
    copy_text = json.dumps({"en": to_plain(brief_en), "hi": to_plain(brief_hi)}, ensure_ascii=False).replace("</", "<\\/")
    do_l, bod_l, ph_l = limits[DO], limits[BOD], limits[PH]
    mid = f"{sens['middle_from']}-{sens['middle_to']}"

    rows = key_rows(readings, results, limits)
    inc_html, sev_counts, inc_total = incident_rows(rows, results, limits)
    data = {
        "limits": {PKEY[p]: {"kind": limits[p].kind, "low": limits[p].low, "high": limits[p].high,
                             "text": limits[p].text().replace("at least ", "≥ ").replace("at most ", "≤ ").replace(" to ", "–"),
                             "unit": next((r.unit for r in readings if r.parameter == p and r.unit), "")}
                   for p in KEY_PARAMETERS},
        "sites": [{"en": SHORT_EN[g.site], "hi": SHORT_HI[g.site]} for g in results],
        "rows": [{k: v for k, v in x.items() if k != "_r"} for x in rows],
    }
    data_json = json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")

    years = sorted({r.year for r in readings})
    n_key = len(rows)
    n_ghats = len(results)
    site_opts = "".join(f'<option value="{i}">{esc(SHORT_EN[g.site])}</option>' for i, g in enumerate(results))
    nav = "".join(f'<a href="#{i}"{" aria-current=true" if i == "overview" else ""}>{t(en, hi)}</a>' for i, en, hi in NAV)
    total_do = h[DO]["measured"]
    metrics = "".join([
        metric(h[DO]["breaches"], h[DO]["measured"],
               t(f'<abbr title="Dissolved oxygen">DO</abbr> readings below {fmt(do_l.low)} mg/l',
                 f'<abbr title="घुलित ऑक्सीजन">DO</abbr> रीडिंग {fmt(do_l.low)} mg/l से कम'),
               h[DO]["breaches"] / h[DO]["measured"]),
        metric(h[BOD]["breaches"], h[BOD]["measured"],
               t(f'<abbr title="Biochemical oxygen demand">BOD</abbr> readings above {fmt(bod_l.high)} mg/l',
                 f'<abbr title="जैव रासायनिक ऑक्सीजन माँग">BOD</abbr> रीडिंग {fmt(bod_l.high)} mg/l से अधिक'),
               h[BOD]["breaches"] / h[BOD]["measured"]),
        metric(len(h["do_zero"]), total_do, t("DO readings of 0 (all at Bairagarh)", "DO रीडिंग 0 (सभी बैरागढ़ में)"),
               len(h["do_zero"]) / total_do),
        metric(h["do_pre_breaches"], h["do_pre_measured"],
               t("DO already below 5 before immersion", "विसर्जन से पहले ही DO 5 से कम"),
               h["do_pre_breaches"] / h["do_pre_measured"], True),
        metric(h["missing_total"], n_key, t("DO/BOD/pH readings not sampled", "DO/BOD/pH रीडिंग नहीं ली गईं"),
               h["missing_total"] / n_key, True),
    ])
    answer = answer_block(results, h, do_l)
    pill_tip = esc("Historical MPPCB readings, 2023-2025. No live sensor feed is connected.")
    all_en, all_hi = t("All", "सभी"), t("Both", "दोनों")

    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Jal Nirikshak · Visarjan water-quality monitor, Bhopal</title>
<meta name="description" content="Ranking of Bhopal's immersion ghats from 2023-2025 MPPCB water readings against CPCB Class B limits.">
<script>document.documentElement.className+=" js";</script>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500&display=swap">
<style>
{read_asset("report.css")}
</style>
</head>
<body>
<a class="skip" href="#main">{t('Skip to content', 'सामग्री पर जाएँ')}</a>
<header class="site">
  <div class="site-in">
    <a class="brand" href="#overview">{LOGO}<span>{t('Jal Nirikshak', 'जल निरीक्षक')}</span></a>
    <nav class="nav" aria-label="Sections">{nav}</nav>
    <div class="site-tools">
      <span class="status-pill" title="{pill_tip}"><i aria-hidden="true"></i><span>{t('Historical data<span class="l-long"> · not live</span>', 'पुराना डेटा<span class="l-long"> · लाइव नहीं</span>')}</span></span>
      <div class="lang" role="group" aria-label="Language">
        <button type="button" data-set-lang="en" aria-pressed="true">English</button>
        <button type="button" data-set-lang="hi" aria-pressed="false" lang="hi">हिंदी</button>
      </div>
    </div>
  </div>
</header>

<main id="main">
<div id="view-dash">
<section id="overview" class="overview" aria-labelledby="h-over">
  <div class="wrap">
    <div class="ov-grid">
      <div>
        <h1 id="h-over">{t('Jal Nirikshak, Bhopal', 'जल निरीक्षक, भोपाल')}</h1>
        <p class="for">{t('For the BMC officer planning Durga visarjan, 20 October 2026', 'दुर्गा विसर्जन (20 अक्टूबर 2026) की योजना बनाने वाले BMC अधिकारी के लिए')}</p>
        <p class="lede">{t(
    f'The {n_ghats} immersion ghats ranked by how often and how far their 2023-2025 water readings missed the CPCB Class B (outdoor bathing) limits for dissolved oxygen, BOD and pH. A screening aid, not a legal finding and not today’s water.',
    f'{n_ghats} विसर्जन घाट, इस आधार पर क्रम में कि 2023-2025 की पानी की रीडिंग घुलित ऑक्सीजन, BOD और pH के लिए CPCB क्लास B (बाहरी स्नान) सीमा से कितनी बार और कितनी दूर बाहर रहीं। यह जाँच में मदद है, कानूनी निष्कर्ष नहीं, और आज के पानी की स्थिति नहीं।')}</p>
      </div>
      <div class="bignums" role="group" aria-label="Key numbers">
        <div class="bignum"><b>{n_ghats}</b><span>{t('Ghats', 'घाट')}</span></div>
        <div class="bignum"><b>{n_key - h['missing_total']}</b><span>{t('Readings scored', 'स्कोर की रीडिंग')}</span></div>
        <div class="bignum"><b>{inc_total}</b><span>{t('Outside limit', 'सीमा से बाहर')}</span></div>
      </div>
    </div>
    <div class="metrics" role="group" aria-label="Key figures">{metrics}</div>
  </div>
</section>

<div class="wrap">
<section id="priority" aria-labelledby="h-pri">
  <div class="sec-head"><div><h2 id="h-pri">{t('Where the 2023-2025 readings point first', '2023-2025 की रीडिंग पहले कहाँ इशारा करती हैं')}</h2></div></div>
  <div class="bento">
  <div>
  {answer}
  <details class="help">
    <summary>{t('How this score works, in 30 seconds', 'यह स्कोर कैसे बनता है, 30 सेकंड में')}</summary>
    <p>{t('Each ghat is scored from 0 to 100 on dissolved oxygen, BOD and pH readings against CPCB Class B limits. A reading counts more the further it is past the limit. Missing readings are left out and shown as a range, never counted as clean.',
          'हर घाट को घुलित ऑक्सीजन, BOD और pH की रीडिंग के आधार पर CPCB क्लास B सीमा के मुकाबले 0 से 100 अंक मिलते हैं। रीडिंग सीमा से जितनी दूर, उतना अधिक असर। छूटी रीडिंग स्कोर में नहीं गिनी जातीं और दायरे में दिखती हैं, साफ़ नहीं मानी जातीं।')}
      <a href="#method">{t('Full method', 'पूरी विधि')}</a></p>
  </details>
  </div>
    <aside class="status-panel" aria-labelledby="h-status">
        <h2 id="h-status">{t('System status', 'सिस्टम स्थिति')}</h2>
        <dl>
          <div class="row"><dt>{t('Data', 'डेटा')}</dt><dd>{t(f'MPPCB reports {years[0]}-{years[-1]}', f'MPPCB रिपोर्ट {years[0]}-{years[-1]}')}</dd></div>
          <div class="row"><dt>{t('Live sensors', 'लाइव सेंसर')}</dt><dd>{t('None connected', 'कोई नहीं जुड़ा')}</dd></div>
          <div class="row"><dt>{t('Readings scored', 'स्कोर की रीडिंग')}</dt><dd class="num">{n_key - h['missing_total']} {t('of', 'में से')} {n_key}</dd></div>
          <div class="row"><dt>{t('Yardstick', 'पैमाना')}</dt><dd>{t('CPCB Class B', 'CPCB क्लास B')}</dd></div>
          <div class="row"><dt>{t('Ghats', 'घाट')}</dt><dd class="num">{n_ghats}</dd></div>
        </dl>
      </aside>
  </div>
</section>

<section id="trends" aria-labelledby="h-tr">
  <div class="sec-head"><div>
    <h2 id="h-tr">{t('Water-quality trends', 'पानी की गुणवत्ता के रुझान')}</h2>
    <p>{t('Every point is a printed reading from the MPPCB reports: before, during and one week after immersion, for each festival. The reports give no clock times.',
          'हर बिंदु MPPCB रिपोर्ट की छपी रीडिंग है: हर पर्व के लिए विसर्जन से पहले, दौरान और एक सप्ताह बाद। रिपोर्ट में घड़ी का समय नहीं है।')}</p>
  </div></div>
  <div class="controls">
    <div class="field"><label for="sel-site">{t('Ghat', 'घाट')}</label><select id="sel-site">{site_opts}</select></div>
    <div class="field"><span class="fl">{t('Test', 'जाँच')}</span><div class="seg" id="seg-k" role="group" aria-label="Test">{seg_buttons([('DO', 'DO'), ('BOD', 'BOD'), ('pH', 'pH')], 'DO')}</div></div>
    <div class="field"><span class="fl">{t('Festival', 'पर्व')}</span><div class="seg" id="seg-f" role="group" aria-label="Festival">{seg_buttons([('all', all_hi), ('Ganesh', t('Ganesh', 'गणेश')), ('Durga', t('Durga', 'दुर्गा'))])}</div></div>
    <div class="field"><span class="fl">{t('Time range', 'समय सीमा')}</span><div class="seg" id="seg-y" role="group" aria-label="Time range">{seg_buttons([('all', f'{years[0]}-{years[-1]}')] + [(str(y), str(y)) for y in years])}</div></div>
  </div>
  <div class="panel chart-panel">
    <div class="chart-head"><h3 id="chart-title"></h3></div>
    <p class="chart-sum" id="chart-sum" aria-live="polite"></p>
    <div class="chart-wrap" id="chart-wrap">
      <div class="skeleton" aria-hidden="true"></div>
      <noscript><div class="state noscript-msg"><b>{t('Charts need JavaScript.', 'चार्ट के लिए JavaScript चाहिए।')}</b><span>{t('Every reading is in the incident list and the evidence tables below.', 'हर रीडिंग नीचे घटना सूची और प्रमाण तालिकाओं में है।')}</span></div></noscript>
      <div id="chart-svg-host"></div>
      <div class="tip" id="chart-tip" role="tooltip"></div>
    </div>
    <ul class="legend" id="chart-legend">
      <li><svg width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="var(--teal)"/></svg>{t('Within limit', 'सीमा में')}</li>
      <li><svg width="14" height="14" aria-hidden="true"><rect x="3" y="3" width="8" height="8" fill="var(--bad)" transform="rotate(45 7 7)"/></svg>{t('Outside limit', 'सीमा से बाहर')}</li>
      <li><svg width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="2 2"/></svg>{t('Not sampled', 'नमूना नहीं')}</li>
      <li><svg width="22" height="14" aria-hidden="true"><line x1="0" x2="22" y1="7" y2="7" stroke="var(--bad)" stroke-width="1.5" stroke-dasharray="6 4"/></svg>{t('CPCB Class B limit; shaded = outside', 'CPCB क्लास B सीमा; छायांकित = बाहर')}</li>
    </ul>
    <div class="chart-foot">
      <p id="chart-unit-note"></p>
      <button type="button" class="btn ghost" id="view-table" aria-expanded="false" aria-controls="chart-table"><span class="l-en">View as table</span><span class="l-hi" lang="hi">तालिका देखें</span></button>
    </div>
    <div id="chart-table" hidden></div>
  </div>
</section>

<section id="incidents" aria-labelledby="h-inc">
  <div class="sec-head"><div>
    <h2 id="h-inc">{t('Alerts and incidents', 'अलर्ट और घटनाएँ')}</h2>
    <p>{t(f'{inc_total} readings of DO, BOD or pH outside the Class B limit, 2023-2025. Severity bands come from this project’s 0-1 severity (cut-offs at a third and two-thirds); they are not CPCB categories. “When” is the festival and phase, as the reports give no clock time.',
          f'DO, BOD या pH की {inc_total} रीडिंग क्लास B सीमा से बाहर, 2023-2025। गंभीरता के स्तर इस परियोजना की 0-1 गंभीरता से बने हैं (एक-तिहाई और दो-तिहाई कटऑफ); ये CPCB श्रेणियाँ नहीं हैं। “कब” पर्व और चरण है, क्योंकि रिपोर्ट में घड़ी का समय नहीं है।')}</p>
  </div></div>
  <ul class="sev-summary">
    {"".join(f'<li><b class="sev-{b}">{sev_counts[b]}</b><span class="sev sev-{b}">{SEV_ICON[b]}{t(SEV_EN[b], SEV_HI[b])}</span></li>' for b in ("critical", "high", "moderate"))}
  </ul>
  <div class="controls">
    <div class="field"><label for="inc-q">{t('Search ghat', 'घाट खोजें')}</label><input type="search" id="inc-q" placeholder="e.g. Malikhedi" autocomplete="off"></div>
    <div class="field"><span class="fl">{t('Severity', 'गंभीरता')}</span><div class="seg" data-inc="sev" role="group" aria-label="Severity">{seg_buttons([('all', all_en), ('critical', t('Critical', 'गंभीर')), ('high', t('High', 'उच्च')), ('moderate', t('Moderate', 'मध्यम'))])}</div></div>
    <div class="field"><span class="fl">{t('Test', 'जाँच')}</span><div class="seg" data-inc="k" role="group" aria-label="Test">{seg_buttons([('all', all_en), ('DO', 'DO'), ('BOD', 'BOD'), ('pH', 'pH')])}</div></div>
    <div class="field"><span class="fl">{t('Festival', 'पर्व')}</span><div class="seg" data-inc="f" role="group" aria-label="Festival">{seg_buttons([('all', all_hi), ('Ganesh', t('Ganesh', 'गणेश')), ('Durga', t('Durga', 'दुर्गा'))])}</div></div>
    <div class="field"><label for="inc-sort">{t('Sort by', 'क्रम')}</label><select id="inc-sort"><option value="sev">Severity · गंभीरता</option><option value="new">Newest · नया पहले</option><option value="ghat">Ghat A-Z · घाट</option></select></div>
  </div>
  <p class="inc-count" id="inc-count" role="status" aria-live="polite"></p>
  <div id="inc-tablebox" class="tscroll"><table class="inc-table"><thead><tr>
    <th>{t('Severity', 'गंभीरता')}</th><th>{t('Affected ghat', 'प्रभावित घाट')}</th><th>{t('Test', 'जाँच')}</th><th>{t('Reading', 'रीडिंग')}</th><th>{t('When', 'कब')}</th><th>{t('Source', 'स्रोत')}</th>
  </tr></thead><tbody id="inc-body">{inc_html}</tbody></table></div>
  <div class="state panel" id="inc-empty" hidden><b>{t('No incidents match these filters.', 'इन फ़िल्टर से कोई घटना नहीं मिली।')}</b><span>{t('Clear the search or choose a different severity.', 'खोज हटाएँ या कोई और गंभीरता चुनें।')}</span><button type="button" class="btn ghost" id="inc-reset">{t('Reset filters', 'फ़िल्टर रीसेट करें')}</button></div>
  <div class="inc-more" id="inc-more"><button type="button" class="btn ghost" id="inc-more-btn">{t('Show 25 more', '25 और दिखाएँ')}</button></div>
</section>

<section id="ghats" aria-labelledby="h-gh">
  <div class="sec-head"><div>
    <h2 id="h-gh">{t('Ranking by risk score (0-100)', 'जोखिम स्कोर के अनुसार क्रम (0-100)')}</h2>
    <p>{t('Solid bar: score from measured readings. Outlined band: score range if every missing reading had been fine (left) or had breached (right). Open a ghat for every reading with its limit and report page.',
          'ठोस पट्टी: मापी गई रीडिंग से स्कोर। रेखांकित पट्टी: स्कोर का दायरा, अगर हर छूटी रीडिंग ठीक होती (बाएँ) या सीमा से बाहर होती (दाएँ)। हर घाट खोलकर हर रीडिंग, सीमा और रिपोर्ट पृष्ठ देखें।')}</p>
  </div></div>
  {cards}
</section>

<section id="brief" aria-labelledby="h-br">
  <div class="sec-head"><div><h2 id="h-br">{t('Brief to forward', 'आगे भेजने के लिए सार')}</h2></div></div>
  <div class="panel brief">
    <div class="brief-bar">
      <span class="muted small">{t('Generated by code from the numbers above. No language model.', 'ऊपर के आँकड़ों से कोड द्वारा बना। कोई भाषा मॉडल नहीं।')}</span>
      <button type="button" class="btn" id="copy">{t('Copy brief', 'सार कॉपी करें')}</button>
    </div>
    <div class="l-en">{md_to_html(brief_en)}</div>
    <div class="l-hi" lang="hi">{md_to_html(brief_hi)}</div>
    <p class="muted small" id="copy-status" role="status" aria-live="polite"></p>
  </div>
</section>

<section id="sensitivity" aria-labelledby="h-se">
  <div class="sec-head"><div>
    <h2 id="h-se">{t('Does the order depend on our weights?', 'क्या क्रम हमारे वज़न पर निर्भर है?')}</h2>
    <p>{t(f'The weighting is our judgment call. Re-ranked under {sens["n_weightings"]} weightings: {esc(SHORT_EN[sens["top_site"]])} is first in {sens["top_count"]} of {sens["n_weightings"]}, {esc(SHORT_EN[sens["bottom_site"]])} is last in {sens["bottom_count"]} of {sens["n_weightings"]}, and ranks {mid} reorder. Trust the ends more than the middle.',
          f'वज़न हमारा निर्णय है। {sens["n_weightings"]} तरह के वज़न से दोबारा क्रम: {esc(NAME_HI[sens["top_site"]])} {sens["n_weightings"]} में से {sens["top_count"]} बार पहले, {esc(NAME_HI[sens["bottom_site"]])} {sens["n_weightings"]} में से {sens["bottom_count"]} बार आख़िरी, और रैंक {mid} का क्रम बदलता है। बीच की तुलना में सिरों पर अधिक भरोसा करें।')}</p>
  </div></div>
  <div class="tscroll"><table><thead><tr><th>{t('Ghat', 'घाट')}</th>{sens_head}</tr></thead><tbody>{sens_rows}</tbody></table></div>
  <p class="muted small">{t('Shaded: rank differs from the shipped weighting.', 'रंगीन: चुने गए वज़न से अलग रैंक।')}</p>
</section>

<section id="method" aria-labelledby="h-me">
  <div class="sec-head"><div><h2 id="h-me">{t('How to read this', 'इसे कैसे पढ़ें')}</h2></div></div>
  <ol class="howto">
{howto(h, do_l, bod_l, ph_l)}
  </ol>
</section>

<footer>
  {t('Source: MPPCB Ganesh and Durga visarjan reports 2023 (Idol_immer._Report_23_CPCB.pdf), 2024 and 2025, via the hackathon dataset. Page numbers are the PDF’s own page in that year’s report. CPCB water quality criteria. Hindi text not yet proofread by a native speaker.',
     'स्रोत: MPPCB गणेश और दुर्गा विसर्जन रिपोर्ट 2023 (Idol_immer._Report_23_CPCB.pdf), 2024 और 2025, हैकथॉन डेटासेट से। पृष्ठ संख्या उस वर्ष की रिपोर्ट PDF का पृष्ठ है। CPCB जल गुणवत्ता मानदंड। हिंदी पाठ की अभी किसी मूल भाषी ने जाँच नहीं की है।')}
</footer>
</div>
</div>
{files_section()}
</main>
<script type="application/json" id="brief-text">{copy_text}</script>
<script type="application/json" id="gw-data">{data_json}</script>
<script>
{read_asset("report.js")}
</script>
</body>
</html>
"""
