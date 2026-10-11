"""Suggested checks per ghat, drawn from its 2023-2025 readings.

These are this project's suggestions for the officer to review. They are NOT official rules, they do not
say what caused a reading, and every item states the reading counts it rests on. The thresholds below are
our judgment call and are listed here so they can be changed in one place.
"""

from .data import BOD, DO, MEASURED, PH, fmt
from .scoring import is_breach

# A parameter counts as "often outside the limit" when at least this share of its measured readings breached.
OFTEN = 0.5


def suggested_actions(g, readings, limits):
    """List of dicts: code, en, hi, why_en, why_hi. Never empty."""
    d, b, p = g.stats[DO], g.stats[BOD], g.stats[PH]
    do_l, bod_l, ph_l = limits[DO], limits[BOD], limits[PH]
    zeros = sum(v == 0 for v in d.values)
    pre = [r for r in readings if r.site == g.site and r.parameter == DO and r.phase == "pre" and r.status == MEASURED]
    pre_breach = sum(is_breach(r.value, do_l) for r in pre)
    out = []

    if zeros:
        out.append({
            "code": "do_zero",
            "en": "Re-test dissolved oxygen before immersion and consider aeration.",
            "hi": "विसर्जन से पहले घुलित ऑक्सीजन की दोबारा जाँच करें और वायुकरण (एयरेशन) पर विचार करें।",
            "why_en": f"DO read 0 in {zeros} of {d.measured} measured readings.",
            "why_hi": f"{d.measured} मापी गई रीडिंग में से {zeros} में DO 0 था।"})
    elif d.measured and d.breach_rate >= OFTEN:
        out.append({
            "code": "do_low",
            "en": "Consider aeration and re-test dissolved oxygen before immersion.",
            "hi": "वायुकरण (एयरेशन) पर विचार करें और विसर्जन से पहले घुलित ऑक्सीजन की दोबारा जाँच करें।",
            "why_en": f"DO was below {fmt(do_l.low)} mg/l in {d.breaches} of {d.measured} measured readings.",
            "why_hi": f"{d.measured} मापी गई रीडिंग में से {d.breaches} में DO {fmt(do_l.low)} mg/l से कम था।"})
    if pre_breach:
        out.append({
            "code": "do_pre",
            "en": "Test dissolved oxygen well before the day, since it has already been low before immersion.",
            "hi": "घुलित ऑक्सीजन की जाँच दिन से काफ़ी पहले करें, क्योंकि यह विसर्जन से पहले भी कम रहा है।",
            "why_en": f"DO was below {fmt(do_l.low)} mg/l before immersion in {pre_breach} of {len(pre)} pre-immersion readings.",
            "why_hi": f"विसर्जन से पहले की {len(pre)} रीडिंग में से {pre_breach} में DO {fmt(do_l.low)} mg/l से कम था।"})
    if b.measured and b.breach_rate >= OFTEN:
        out.append({
            "code": "bod_high",
            "en": "Consider extra cleaning and removal of floating waste, then re-test BOD.",
            "hi": "अतिरिक्त सफ़ाई और तैरते कचरे को हटाने पर विचार करें, फिर BOD की दोबारा जाँच करें।",
            "why_en": f"BOD was above {fmt(bod_l.high)} mg/l in {b.breaches} of {b.measured} measured readings.",
            "why_hi": f"{b.measured} मापी गई रीडिंग में से {b.breaches} में BOD {fmt(bod_l.high)} mg/l से अधिक था।"})
    if p.breaches:
        out.append({
            "code": "ph",
            "en": "Re-test pH on the day of immersion.",
            "hi": "विसर्जन के दिन pH की दोबारा जाँच करें।",
            "why_en": f"pH was outside {fmt(ph_l.low)}-{fmt(ph_l.high)} in {p.breaches} of {p.measured} measured readings.",
            "why_hi": f"{p.measured} मापी गई रीडिंग में से {p.breaches} में pH {fmt(ph_l.low)}-{fmt(ph_l.high)} से बाहर था।"})
    gap = g.missing + g.absent
    if gap:
        out.append({
            "code": "gap",
            "en": "Take the missing samples (DO, BOD, pH) so the score rests on measured readings.",
            "hi": "छूटे हुए नमूने (DO, BOD, pH) लें ताकि स्कोर मापी गई रीडिंग पर टिके।",
            "why_en": f"{gap} of {g.possible} key readings are missing.",
            "why_hi": f"{g.possible} में से {gap} मुख्य रीडिंग नहीं हैं।"})
    if g.confidence == "medium":
        out.append({
            "code": "site",
            "en": "Confirm which water body this ghat refers to before acting.",
            "hi": "कार्रवाई से पहले पुष्टि करें कि यह घाट किस जल-निकाय को दर्शाता है।",
            "why_en": "Different reports use different names for this site, so the match is only medium confidence.",
            "why_hi": "अलग-अलग रिपोर्ट इस स्थान के लिए अलग नाम लिखती हैं, इसलिए मिलान का भरोसा केवल मध्यम है।"})
    if not out:
        out.append({
            "code": "routine",
            "en": "No check is triggered by the 2023-2025 readings; keep routine sampling.",
            "hi": "2023-2025 की रीडिंग से कोई जाँच ज़रूरी नहीं निकली; नियमित नमूने लेते रहें।",
            "why_en": "No rule above applies to this ghat's readings.",
            "why_hi": "ऊपर का कोई नियम इस घाट की रीडिंग पर लागू नहीं होता।"})
    return out
