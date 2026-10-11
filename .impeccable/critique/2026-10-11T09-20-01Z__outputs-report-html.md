---
target: ghat-watch/outputs/report.html
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:C:\\Users\\Anukalp\\visarjan-hack\\ghat-watch\\outputs\\report.html"
target_fingerprint: "sha256:347222fcf5b71c1d3fcb1e6628a02b5fb692810176f7ba4743bde2965d3ac583"
target_path: "C:\\Users\\Anukalp\\visarjan-hack\\ghat-watch\\outputs\\report.html"
timestamp: 2026-10-11T09-20-01Z
slug: outputs-report-html
---
Method: dual-agent (A: design review, B: detector)

Score 25/40 (Acceptable, 62%). All 10 heuristics scored. Weak: user control (2), recognition (2), flexibility (2), minimalist design (2), help (2).

Design specificity: specific in words, interchangeable in look. Reads as an analyst's report, not an officer's worklist. The score bar with a range band is the one product-specific device.

Detector: 429 warnings, mostly false positives (cramped-padding on pills and scroll wrappers, gray-on-color in dark mode). True: skipped heading (h2 to h4), flat type hierarchy (h3/h4 close to body).

Priority issues
1. [P1] No answer up front. Replace the stat tiles with a three-tier action block (send first / then / lower). Commands: clarify, layout.
2. [P1] Strict 1-7 order over overlapping ranges. Group by rank band, compact lower tiers. Command: layout.
3. [P2] Length and evidence weight (about 6,100 px desktop, 8,500 px mobile). Jump-nav, evidence summarised by test. Command: distill.
4. [P2] Weak type and colour roles: meta line small and faint, amber callouts all alike, flat headings. Commands: typeset, colorize.
5. [P2] Help last, legend far from the bar. Move a short "how this score works" to the top. Command: adapt.

Personas: BMC officer forwarding a brief (no data age, no per-ghat action, no link), Casey mobile (long scroll, crammed table), Sam accessibility (small grey meta, colour-only band).
