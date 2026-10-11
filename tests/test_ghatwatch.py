import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ghatwatch.data import (BDL_STATUS, BOD, DO, MEASURED, MISSING, ND_STATUS, PH, Limit, Reading,
                            classify, load_limits, load_readings, missing_tables, normalise_water_body)
from ghatwatch import scoring
from ghatwatch.scoring import (WEIGHTINGS, headline, is_breach, param_stats, score_all, score_of,
                               sensitivity_summary, severity)
from ghatwatch.brief import build_brief

READINGS = load_readings()
LIMITS = load_limits()
RESULTS = score_all(READINGS, LIMITS)
BY_SITE = {g.site: g for g in RESULTS}


def reading(site, param, value, status=MEASURED, festival="Ganesh", phase="during", year=2024):
    return Reading(year, festival, site, "Test", phase, param, value, status, "mg/l", "", "", "high", 1)


class TestClassify(unittest.TestCase):
    def test_number(self):
        self.assertEqual(classify("2.5", "2.5", ""), (2.5, MEASURED))
        self.assertEqual(classify("0", "0", ""), (0.0, MEASURED))

    def test_bdl_and_nd_are_their_own_status(self):
        self.assertEqual(classify("", "BDL", "BDL"), (None, BDL_STATUS))
        self.assertEqual(classify("", "ND", ""), (None, ND_STATUS))
        self.assertEqual(classify("", "nd", "ND"), (None, ND_STATUS))

    def test_missing_markers(self):
        for printed, flag in [("", ""), ("_", "not sampled"), ("-", ""), ("*", "*"), ("**", "**"),
                              ("", "not sampled"), ("??", ""), ("   ", "")]:
            self.assertEqual(classify("", printed, flag), (None, MISSING), (printed, flag))

    def test_unparseable_value_is_missing(self):
        self.assertEqual(classify("abc", "abc", ""), (None, MISSING))

    def test_csv_statuses(self):
        statuses = {r.status for r in READINGS}
        self.assertEqual(statuses, {MEASURED, BDL_STATUS, MISSING})
        self.assertEqual(sum(r.status == BDL_STATUS for r in READINGS), 174)
        # No missing reading ever carries a number.
        self.assertTrue(all(r.value is None for r in READINGS if r.status != MEASURED))

    def test_water_body_normalised(self):
        self.assertEqual(normalise_water_body("Lower Lake (as printed in Durga tables)"), "Lower Lake")
        self.assertNotIn("Lower Lake (as printed in Durga tables)", {r.water_body for r in READINGS})


class TestLimits(unittest.TestCase):
    def test_limits_read_from_csv(self):
        self.assertEqual((LIMITS[DO].kind, LIMITS[DO].low), ("min", 5.0))
        self.assertEqual((LIMITS[BOD].kind, LIMITS[BOD].high), ("max", 3.0))
        self.assertEqual((LIMITS[PH].low, LIMITS[PH].high), (6.5, 8.5))

    def test_boundaries_are_not_breaches(self):
        self.assertFalse(is_breach(5.0, LIMITS[DO]))
        self.assertTrue(is_breach(4.99, LIMITS[DO]))
        self.assertFalse(is_breach(3.0, LIMITS[BOD]))
        self.assertTrue(is_breach(3.01, LIMITS[BOD]))
        self.assertFalse(is_breach(6.5, LIMITS[PH]))
        self.assertFalse(is_breach(8.5, LIMITS[PH]))
        self.assertTrue(is_breach(6.49, LIMITS[PH]))
        self.assertTrue(is_breach(8.51, LIMITS[PH]))

    def test_severity(self):
        self.assertEqual(severity(5.0, LIMITS[DO]), 0)
        self.assertAlmostEqual(severity(0, LIMITS[DO]), 1.0)
        self.assertAlmostEqual(severity(2.5, LIMITS[DO]), 0.5)
        self.assertAlmostEqual(severity(7.5, LIMITS[BOD]), 0.5)
        self.assertEqual(severity(20, LIMITS[BOD]), 1.0)
        self.assertAlmostEqual(severity(9.25, LIMITS[PH]), 0.5)
        self.assertEqual(severity(4.0, LIMITS[PH]), 1.0)


class TestScore(unittest.TestCase):
    def test_hand_computed_score(self):
        rs = [reading("X", DO, 6.0), reading("X", DO, 2.5),          # DO: 1/2 breach, sev 0, 0.5
              reading("X", BOD, 3.0), reading("X", BOD, 12.0),       # BOD: 1/2 breach, sev 0, 1
              reading("X", PH, 7.0), reading("X", PH, 9.25)]         # pH: 1/2 breach, sev 0, 0.5
        st = param_stats(rs, LIMITS, "X")
        # DO 0.5*0.5 + 0.5*0.25 = 0.375; BOD 0.25 + 0.25 = 0.5; pH 0.375
        self.assertAlmostEqual(st[DO].score(), 0.375)
        self.assertAlmostEqual(st[BOD].score(), 0.5)
        self.assertAlmostEqual(st[PH].score(), 0.375)
        self.assertAlmostEqual(score_of(st), 100 * (0.375 + 0.5 + 0.375) / 3)

    def test_missing_excluded_and_counted(self):
        rs = [reading("X", DO, 6.0), reading("X", DO, None, MISSING),
              reading("X", BOD, 2.0), reading("X", PH, 7.0)]
        st = param_stats(rs, LIMITS, "X")
        self.assertEqual((st[DO].measured, st[DO].missing, st[DO].possible), (1, 1, 2))
        self.assertEqual(score_of(st), 0.0)

    def test_missing_data_never_improves_a_ghat(self):
        """Score range: low end <= score <= high end, and the high end never falls below
        the score. Turning a breach into a missing reading cannot lower the worst case."""
        for g in RESULTS:
            self.assertLessEqual(g.score_low, g.score + 1e-9, g.site)
            self.assertGreaterEqual(g.score_high, g.score - 1e-9, g.site)
            if g.missing + g.absent:
                self.assertGreater(g.score_high, g.score, g.site)
            self.assertLessEqual(g.rank_best, g.rank)
            self.assertGreaterEqual(g.rank_worst, g.rank)
        base = [reading("X", DO, 1.0), reading("X", DO, 1.0), reading("X", BOD, 9.0), reading("X", PH, 7)]
        hidden = [reading("X", DO, 1.0), reading("X", DO, None, MISSING),
                  reading("X", BOD, 9.0), reading("X", PH, 7)]
        hi = scoring.combine({p: param_stats(hidden, LIMITS, "X")[p].bound_score(scoring.SHIPPED, True)
                              for p in (DO, BOD, PH)}, scoring.SHIPPED)
        self.assertGreaterEqual(hi, score_of(param_stats(base, LIMITS, "X")))

    def test_missing_counts_as_missing_not_clean(self):
        clean = [reading("X", DO, 6.0), reading("X", BOD, 2.0), reading("X", PH, 7.0)]
        with_gap = clean + [reading("X", DO, None, MISSING)]
        self.assertEqual(score_of(param_stats(with_gap, LIMITS, "X")), 0.0)
        self.assertEqual(param_stats(with_gap, LIMITS, "X")[DO].measured, 1)


class TestHeadlineNumbers(unittest.TestCase):
    def setUp(self):
        self.h = headline(READINGS, LIMITS)

    def test_row_count(self):
        self.assertEqual(len(READINGS), 1524)
        self.assertEqual(len({r.parameter for r in READINGS}), 13)

    def test_do_bod(self):
        self.assertEqual((self.h[DO]["breaches"], self.h[DO]["measured"]), (42, 116))
        self.assertEqual((self.h[BOD]["breaches"], self.h[BOD]["measured"]), (100, 112))

    def test_do_zero(self):
        zeros = self.h["do_zero"]
        self.assertEqual(len(zeros), 4)
        self.assertEqual({r.site for r in zeros}, {"Bairagarh (Sant Hirdaram) kund"})

    def test_unsampled(self):
        self.assertEqual(self.h["missing_total"], 17)
        self.assertEqual((self.h[DO]["missing"], self.h[BOD]["missing"], self.h[PH]["missing"]), (4, 8, 5))
        self.assertEqual(len(self.h["missing_sites"]), 4)

    def test_pre_immersion_do(self):
        self.assertEqual((self.h["do_pre_breaches"], self.h["do_pre_measured"]), (12, 38))

    def test_missing_tables_detected(self):
        self.assertEqual(missing_tables(READINGS), {
            "Bairagarh (Sant Hirdaram) kund": [(2025, "Durga")],
            "Malikhedi kund": [(2025, "Durga")]})

    def test_ranking(self):
        expected = [("Bairagarh (Sant Hirdaram) kund", 47.5), ("Malikhedi kund", 34.7),
                    ("Shahpura lake ghat", 32.0), ("Rani Kamlapati ghat / Kamla Park kund", 30.1),
                    ("Khatlapura ghat", 29.6), ("Hathaikheda dam / kund", 25.7), ("Prempura ghat", 16.8)]
        self.assertEqual([(g.site, round(g.score, 1)) for g in RESULTS], expected)
        self.assertEqual([g.rank for g in RESULTS], list(range(1, 8)))

    def test_sensitivity(self):
        s = sensitivity_summary(RESULTS)
        self.assertEqual(len(WEIGHTINGS), 6)
        self.assertEqual((s["top_site"], s["top_count"]), ("Bairagarh (Sant Hirdaram) kund", 5))
        self.assertEqual((s["bottom_site"], s["bottom_count"]), ("Prempura ghat", 5))
        self.assertTrue(s["middle_reorders"])

    def test_spot_checks(self):
        def get(site, year, fest, phase, param):
            [r] = [r for r in READINGS if (r.site, r.year, r.festival, r.phase, r.parameter) ==
                   (site, year, fest, phase, param)]
            return r
        b = "Bairagarh (Sant Hirdaram) kund"
        self.assertEqual((get(b, 2023, "Ganesh", "after", DO).value, get(b, 2023, "Ganesh", "after", DO).source_page), (0, 26))
        for ph in ("pre", "during"):
            r = get(b, 2023, "Durga", ph, DO)
            self.assertEqual((r.value, r.source_page), (0, 60))
        r = get("Malikhedi kund", 2025, "Ganesh", "during", DO)
        self.assertEqual((r.value, r.source_page), (0.6, 29))
        self.assertEqual(get("Malikhedi kund", 2025, "Ganesh", "pre", PH).value_as_printed, "*")
        self.assertEqual(get("Malikhedi kund", 2025, "Ganesh", "after", PH).value_as_printed, "**")
        r = get("Shahpura lake ghat", 2025, "Durga", "pre", DO)
        self.assertEqual((r.value, r.source_page), (2.5, 65))


class TestBrief(unittest.TestCase):
    def setUp(self):
        self.en, self.hi = build_brief(READINGS, LIMITS, RESULTS)

    def test_key_facts_in_brief(self):
        for s in ("42 of 116", "100 of 112", "12 of 38", "47.5", "Class B", "screening"):
            self.assertIn(s, self.en)
        for s in ("42", "116", "47.5", "बैरागढ़ (संत हिरदाराम) कुंड"):
            self.assertIn(s, self.hi)

    def test_no_markdown_in_plain_text(self):
        from ghatwatch.brief import to_plain
        plain = to_plain(self.en)
        for sym in ("**", "# ", "`"):
            self.assertNotIn(sym, plain)

    def test_length(self):
        from ghatwatch.brief import word_count
        self.assertLessEqual(word_count(self.en), 340)
        self.assertLessEqual(word_count(self.hi), 420)

    def test_no_health_claims(self):
        low = self.en.lower()
        for w in ("disease", "illness", "unsafe to", "dangerous", "toxic", "infection", "sick"):
            self.assertNotIn(w, low)


class TestActionsAndCompare(unittest.TestCase):
    """Suggested checks rest on counted readings; compare data is the same data the ranking uses."""

    def setUp(self):
        from ghatwatch.actions import suggested_actions
        from ghatwatch.render import ghat_data
        self.acts = {g.site: suggested_actions(g, READINGS, LIMITS) for g in RESULTS}
        self.data = {g.site: ghat_data(g) for g in RESULTS}

    def test_every_action_is_complete_and_bilingual(self):
        for site, acts in self.acts.items():
            self.assertTrue(acts)
            for a in acts:
                for k in ("code", "en", "hi", "why_en", "why_hi"):
                    self.assertTrue(a[k].strip(), (site, a["code"], k))

    def test_bairagarh_rules_follow_its_numbers(self):
        codes = {a["code"] for a in self.acts["Bairagarh (Sant Hirdaram) kund"]}
        self.assertIn("do_zero", codes)      # four DO readings of 0
        self.assertIn("gap", codes)          # missing readings
        why = next(a for a in self.acts["Bairagarh (Sant Hirdaram) kund"] if a["code"] == "do_zero")["why_en"]
        self.assertIn("4 of 13", why)

    def test_zero_rule_only_where_there_is_a_zero(self):
        for g in RESULTS:
            has_zero = any(v == 0 for v in g.stats[DO].values)
            self.assertEqual(has_zero, any(a["code"] == "do_zero" for a in self.acts[g.site]), g.site)

    def test_medium_confidence_site_gets_a_confirm_step(self):
        for g in RESULTS:
            self.assertEqual(g.confidence == "medium", any(a["code"] == "site" for a in self.acts[g.site]), g.site)

    def test_no_causal_or_health_claims_in_actions(self):
        for acts in self.acts.values():
            for a in acts:
                low = (a["en"] + a["why_en"]).lower()
                for w in ("caused", "because of immersion", "toxic", "unsafe", "disease", "illness", "danger"):
                    self.assertNotIn(w, low)

    def test_compare_part_scores_average_to_the_risk_score(self):
        for g in RESULTS:
            d = self.data[g.site]
            avg = sum(p["part"] for p in d["parts"].values()) / 3
            self.assertAlmostEqual(avg, g.score, delta=0.1)
            self.assertEqual((d["rank"], d["score"]), (g.rank, round(g.score, 1)))
            for p in d["parts"].values():
                self.assertLessEqual(p["breaches"], p["measured"])


class TestPdfReaderWiring(unittest.TestCase):
    """The PDF reader runs in the browser; these check it is bundled and wired to the seven ghats."""

    @classmethod
    def setUpClass(cls):
        from ghatwatch.render import SITE_ALIASES, render
        from ghatwatch.scoring import headline, sensitivity_summary
        cls.aliases = SITE_ALIASES
        h, sens = headline(READINGS, LIMITS), sensitivity_summary(RESULTS)
        en, hi = build_brief(READINGS, LIMITS, RESULTS)
        cls.page = render(READINGS, LIMITS, RESULTS, h, sens, en, hi)

    def test_every_ghat_has_name_keywords(self):
        self.assertEqual(set(self.aliases), {g.site for g in RESULTS})
        for keys in self.aliases.values():
            self.assertTrue(keys and all(k == k.lower() and len(k) > 4 for k in keys))

    def test_keywords_do_not_overlap_between_ghats(self):
        seen = {}
        for site, keys in self.aliases.items():
            for k in keys:
                for other, okeys in self.aliases.items():
                    if other != site:
                        self.assertFalse(any(k in o or o in k for o in okeys), (site, k, other))

    def test_reader_is_bundled_not_loaded_from_the_internet(self):
        for marker in ('id="pdfjs-lib"', 'id="pdfjs-worker"', "GWPdf"):
            self.assertIn(marker, self.page)
        self.assertNotIn('src="http', self.page)
        self.assertNotIn("cdn.", self.page.split("<body>")[1])

    def test_aliases_are_embedded_in_page_data(self):
        self.assertIn('"aliases"', self.page)
        self.assertIn("khatlapura", self.page)


if __name__ == "__main__":
    unittest.main()
