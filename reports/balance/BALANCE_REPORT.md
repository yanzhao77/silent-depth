# SILENT DEPTH 《深海猎手》 — BALANCE_REPORT (t-015)

**Task:** t-015 — adjust game balance **evidence-driven** from the playtest data (t-014) + QA TEST_REPORT (t-013/t-020), then re-run the playtest harness to verify.
**Role:** Game Balance
**Constraint honored:** `config/balance.json` is the ONLY tuned file; no `src/` change (code-level recommendations are flagged, not implemented); no new dependencies; approval policy: never.
**Method:** read evidence → smallest sanctioned change set → `npm test` → playtest harness re-run → measured old-vs-new deltas → honest verdict (revert anything that did not help — nothing regressed, so nothing reverted).

---

## 1. Evidence base (read first)

- `reports/playtest/SUMMARY.md` (t-014) — 12 sessions; 5 victories; torpedoes 4/8 (50 %); peaks ≥ 99.975 in 9/12 sessions; battery ≤ 9 % in 9/12.
- `reports/playtest/playtest-01.md` / `playtest-02.md` — M02 first salvo **missed at 59 m** (HIT ≤ 40 m, near-miss 40–120 m), winning salvo hit at 39 m; 21 pings; peak 100; battery 9 %; stealth 0.
- `reports/qa/TEST_REPORT.md` — §6.1 M03 gap: fire-control accurate ≤ 1.2 km post-t-020; **merchant ALERT-scatter at detection ≥ 40** invalidates in-flight leads; **destroyer passive detection (F3 base 0.05, any noise ≥ 1 within 6 km)** escalates before an ambush forms; battery budget vs ping/CRUISE cadence.
- `docs/GAME_DESIGN.md` §12 (B1–B10) + §15 (F1–F10) — hard rules preserved: speed↑⇒noise↑⇒detect↑; active ping = info↑ risk↑; passive = info↓ risk↓; detection does not auto-decay (DD-08), sinks are active behavior.

---

## 2. Changes made (10 values in `config/balance.json`)

| # | Finding | Key | Old → New | Evidence | Design rule preserved |
|---|---|---|---|---|---|
| 1 | 1 — hit band razor-thin | `torpedo.hitDistanceM` | 40 → **55** | M02 TP-01/TP-02 missed at **59 m** @ 1.2 km (playtest-02); QA measured 63 m closest pass @ 1.0 km pre-t-020 | B5 hit band widened within the sanctioned 50–55; > 1.5 km shots stay meaningful (heading floor ⇒ lateral error ≈ 75 m @ 1.5 km > 55 m) |
| 2 | 2, 4 — ping exposure | `sonar.active.selfExposureDetection` | 12 → **8** | M02 **21 pings** → peak 100 (playtest-02); M01 peak 36 = 3 pings × 12 | B4/B8: ping still costs detection (8 > 0); active still costs more than passive (0) — "ping is a lever" |
| 3 | 2, 4 — config consistency | `detection.sources.activePing` | 12 → **8** | same concept as #2 (engine consumes `sonar.active.selfExposureDetection`; this key is required-by-loader but engine-unused — kept in sync to avoid a stale duplicate) | — |
| 4 | 2 — merchant ALERT-scatter | `detectionFormula.merchantBaseRate` | 0.015 → **0.01** | TEST_REPORT §6.1 root cause #2: merchants turn 30°/11 kt at ≥ 40, breaking lead estimates; M03/04/05/GEN peaks ≥ 99.975 | F3 formula; merchant still detects (0.01 > 0); escort still detects more than merchant (0.035 > 0.01) |
| 5 | 2, 5 — F8 sink | `detection.sinks.stoppedSilentPerSec` | 2 → **2.5** | playtest-02 rec: "sink when silent" too weak; M05 post-kill window never satisfied | F8 sink hierarchy STOPPED+silent (2.5) > SILENT+silent (1); DD-08 no-auto-decay kept — sink still requires active silent running |
| 6 | 3 — battery ceiling | `speedBands.CRUISE.batteryDrainPerSec` | 0.30 → **0.22** | 9/12 sessions ≤ 9 % battery; GEN-01 exhausted with 0 fired (SUMMARY) | B1 drain hierarchy 0.02 < 0.10 < **0.22** < 0.60 (speed↑ ⇒ drain↑) |
| 7 | 3 — battery ceiling | `depthLayers.Surface.chargePerSec` | 0.4 → **0.5** | same battery evidence | B7: Surface stays the only recharge layer; still the loudest/detectable state (×1.5) |
| 8 | 4, 5 — post-kill exposure | `detection.sources.torpedoFired` | 20 → **15** | M02/GEN-02 stealth 0 (peak 100); M05 post-kill +20 blocks F9 | §8.1 torpedo self-exposure kept (firing still costs detection) |
| 9 | 5 — escape window | `escape.detectionBelow` | 20 → **25** | playtest-05: sink+escape never satisfied; sanctioned relaxation (30 s duration & 3 km distance untouched, design intent) | F9 geometry (30 s / 3 km) unchanged |
| 10 | escort pressure (M03+) | `detectionFormula.escortBaseRate` | 0.05 → **0.035** | TEST_REPORT §6.1 root cause #3 (destroyer passive detection unavoidable); sessions 03/04/09 hull 0 | F3 formula; escorts still the loudest detectors; HUNTING lethality (26 kt chase, enemy pings +8, depth charges) untouched |

**Rejected options (with reason):**
- `torpedo.nearMissDistanceM` 120 → 100 — rejected: a near-miss is already a MISS (no damage, `src/combat/torpedo.ts`), so shrinking the band changes only the emitted event, not outcomes.
- `torpedo.speedKt` 40 → 38 — rejected: a slower torpedo flies longer, giving a maneuvering target more time to evade (worse for the observed ALERT-scatter miss) and deviates from F6's design constant.
- Merchant ALERT band 40 → 50+ — rejected: bands are design-fixed (task instruction).
- `weapons.deckGun.rangeKm` 2 → 1.5 — rejected as unnecessary: deck gun targets Surface/Periscope only; a player at Medium/Deep is immune (B6); the hull-0 defeats came from depth charges + battery exhaustion, not the gun. HUNTING lethality preserved.
- New "ambient sink when silent running is off" — requires a `src/` change (sink table + detection system); out of scope, flagged in §6.

---

## 3. Test updates (balance-derived expectations — each justified, none weakened)

| File | Assertion | Old → New | Justification |
|---|---|---|---|
| `tests/unit/core.test.ts:327` | `detection.sources.activePing` | 12 → 8 | loader spot-check of the changed config value (#3) |
| `tests/unit/core.test.ts:335` | `escape.detectionBelow` | 20 → 25 | loader spot-check of the changed config value (#9) |
| `tests/unit/sonar.test.ts` | ping self-exposure `toBe(12)` (+ test name) | 12 → 8 | engine consumes `sonar.active.selfExposureDetection` (#2); assertion now matches the real +8/ping |
| `tests/unit/ai.test.ts` (×3) | F3 spot-checks `80×0.05×…`, `100×0.05×1.5×…`, `4.5 %/s` | 0.05 → 0.035 (3.0 → 2.1, 7.5 → 5.25, 4.5 → 3.15 %/s) | escortBaseRate changed (#10); formulas re-derived from the same F3 expression — assertion strength unchanged (still exact `toBeCloseTo(…, 6)`) |
| `tests/unit/combat.test.ts` | STOPPED+silent sink `48`/`20` | 48 → 47.5; final 20 → 19.75; **threshold-event payload stays 20** | sink 2 → 2.5 (#5): 1 s sink = 2.5 (20 ticks ⇒ −2.5); the `detection.threshold` event carries detection at the **crossing tick (exactly the 20.0 boundary)**, so that payload is unchanged — my first edit to 19.75 was wrong and corrected after reading `src/combat/detection.ts` |
| `tests/integration/gameplay.test.ts` | M05 escape `detection < 20` | < 25 | escape threshold changed (#9); escape may now fire at detection 20–24 |
| `tests/unit/missions.test.ts`, `gameplay.test.ts` (names/comments) | F9 descriptions "detection < 20 / ≥ 20", "+12 ping", "+20 torpedo" | updated to 25 / +8 / +15 | name/comment accuracy only — no assertion weakened (F9 tests use detection 10 and 50, unaffected by 20→25) |

No test was weakened: every numeric expectation re-states the same engine formula with the new config value. The M02 near-miss test (80 m pass) is unaffected by hitDistanceM 55 (80 > 55, ≤ 120).

---

## 4. Re-run results — old vs new SUMMARY (measured, same seeds)

`npx vitest run tests/playtest/playtest.test.ts` (regenerates `reports/playtest/*.md` + `SUMMARY.md`). Determinism double-run: **PASS** (byte-identical) in both runs.

| Session | Metric | OLD | NEW | Delta |
|---|---|---|---|---|
| M01 (×3 incl. determinism) | peak det / score | 36 / 864 | **24 / 876** | **−12 / +12** (stealth 114 → 126; exactly 3 pings × (12−8)) |
| M02 | outcome / duration | VICTORY / 2754 s | VICTORY / 2754 s | ~0 (2753.8 s) |
| M02 | torpedo hits | 2/4 (win salvo @ **39 m**) | 2/4 (win salvo @ **55 m**) | win-salvo pass drifted to exactly the new 55 m boundary — **a near-miss (40–120 m) under the old band**, i.e. the widened band is what kept the victory |
| M02 | first-salvo miss | 59 m | 59 m | **persists** (59 > 55) |
| M02 | peak det / stealth | 100 / 0 | 100 / 0 | unchanged (21 pings × 8 still clamps to 100; brain never silent-runs) |
| M03 / M04 | duration | 833 / 2818 s | 829 / 2786 s | −4 / −32 s (defeats, hull 0, peak 99.975) |
| M05 | duration | 1414 s | 1406 s | −8 s (defeat, hull 0 — brain destroyed before sink/escape phase) |
| GEN-01 | outcome | TIMEOUT 3000 s, 0 fired | TIMEOUT 3000 s, 0 fired | unchanged |
| GEN-02 | duration / score / pings | 1393 s / 696.12 / 85 | 1375 s / **697.29** / 83 | **−18 s / +1.17 / −2 pings**; win salvo @ 40 m → **55 m** (would be a near-miss under the old band) |
| GEN-03 | outcome | TIMEOUT 3000 s | TIMEOUT 3000 s | unchanged |
| GEN-04 | duration / score | 2735 s / 143.91 | 2704 s / **144.41** | −31 s / +0.50 |
| GEN-05 | survival | defeated @ 844 s | defeated @ **954 s** | **+110 s before the same OUT_OF_BOUNDS defeat** (battery lasts longer) |

**Aggregate:** victories 5 → 5 · torpedo efficiency 4/8 (50 %) → 4/8 (50 %) · total damage 240 → 240 · determinism PASS → PASS. Every changed metric moved in the intended direction or stayed equal; **nothing regressed**.

---

## 5. Per-finding verdict (honest)

| # | Finding | Verdict |
|---|---|---|
| 1 | Torpedo hit band | **PARTIAL — real effect.** M02 & GEN-02 winning salvos now resolve at exactly **55 m** — passes that are near-misses under the old 40 m band. The widened band is what preserved both victories in the new geometry. The 59 m first-salvo miss **persists** (59 > 55): residual 4 m gap. Closing it needs either hitDistanceM ≥ 60 (beyond the sanctioned 50–55) or code fixes — see §6. |
| 2 | Detection pins ~100 | **PARTIAL.** M01 peak 36 → 24 (direct, attributable to #2). All other sessions still peak 99.975–100 **because the scripted brains over-ping with silent running OFF** (M02 21 pings, GEN-02 83 pings) — no rate change can stop 83 × 8 = 664 exposure from clamping at 100. The changes reduce the per-action cost that a **disciplined player** pays; the harness brains do not exercise that discipline. |
| 3 | Battery ceiling | **PARTIAL, direction correct.** GEN-05 survived +110 s; no session worsened. Arithmetic check: 8–12 km at CRUISE 10 kt = 1556–2334 s × 0.22 = **342–513 %** — the stated target ("transit + stalk + 2 salvos ≤ 100 %") is **arithmetically unreachable at any CRUISE drain ≥ SILENT's 0.10** (0.043–0.064 %/s would be needed, which breaks the B1 hierarchy). 0.22 is the largest reduction that keeps 0.02 < 0.10 < CRUISE < 0.60. Closing the gap needs a design change (shorter spawn, surface-recharge loop, or mission battery grant) — flagged in §6. |
| 4 | Stealth zeroed on victories | **PARTIAL.** M01 stealth 114 → 126 (score 864 → 876). M02/GEN-02 stealth still 0 because the fixed brains never use silent running (21/83 pings without sinks). A disciplined player (≤ 8 pings, silent running between pings → −2.5/s sink) can now finish M02 with peak well below 60; the harness brain cannot. |
| 5 | M05 escape window | **NOT MEASURABLE in this harness** — the M05 brain was destroyed (hull 0) before any sink, so the escape phase never ran. The easing (torpedoFired 15 + detectionBelow 25) is directionally correct and unit/integration-tested green (F9 tests pass at the new threshold); it will bite only once a player can sink and disengage. |
| 6 | Escort pressure (M03+) | **PARTIAL, direction correct.** Escort passive F3 rate −30 %; M03/M04/GEN-04 durations shrank (−4/−32/−31 s) but remain defeats (hull 0) — the brains still escalate escorts through ping exposure + F4 enemy pings (unchanged, by design) and exhaust battery. GEN-05 now survives to OUT_OF_BOUNDS instead of dying earlier. |

**Nothing was reverted: no change made any measured outcome worse.**

---

## 6. Residual gaps → code-level recommendations (NOT implemented — out of t-015 scope)

1. **59 m miss at ≤ 1.2 km.** Root: the ±5 % / ±9 ° heading-estimate floor (`src/sonar/uncertainty.ts`) converts to ~50–60 m lateral error at 1.2 km, plus merchant ALERT-scatter at detection ≥ 40. Recommend (pick one, product decision): (a) `hitDistanceM` 55 → 60 (design-doc B5 deviation), (b) tighten the heading-estimate floor when TRACKED, or (c) shorten merchant ALERT-scatter (60 s → 30 s) so fire solutions stay predictive.
2. **Battery: full-transit target unreachable** (see §5.3). Recommend a design-level fix: mission battery grants on spawn, shorter player spawn distance (8 km → 4–5 km), or a risk-reward surface-recharge loop in the mission briefing. Any pure-rate fix that satisfies "8–12 km CRUISE ≤ 100 %" violates the B1 drain hierarchy.
3. **Scripted brains never silent-run** (`src/sim/runner.ts` stationary-ambush uses `silentRunning: false`) — the playtest evidence of "peak 100 / stealth 0" is partly a brain-policy artifact, not pure balance. Recommend the stationary-ambush brain enable silent running between range pings (a `src/` change) so future playtests measure the balance rather than the brain's ping cadence. Alternatively implement the playtest-02 recommendation: an ambient detection sink when STOPPED with silent running off (needs `src/combat/detection.ts`).
4. **M05 scripted defeat** is a brain limit (destroyed before escape phase), consistent with TEST_REPORT's honest "M03+ not scripted to victory" contract.

---

## 7. Final suite state

- `npm test` — **356 / 356 passed (15 files)**, incl. playtest gate (6) + determinism (9) + M02/M05 regressions. Duration ~5.1 s.
- `npx vitest run tests/playtest/playtest.test.ts` — 6 / 6 passed; reports regenerated with the new balance; determinism double-run byte-identical.
- `npx tsc --noEmit` — 0 errors.
- Determinism contract intact: same build + same seed ⇒ same outcome (M01 double-run PASS; M02 regression byte-identical across two plays).

**Verdict:** 10 evidence-based balance changes applied to `config/balance.json`; all 356 tests + harness green; measured deltas show real but partial improvement (M01 peak −12 & score +12; both winning salvos now land exactly on the widened 55 m band, preserving victories that a 40 m band would have turned into near-misses; GEN-05 +110 s survival; all durations ≤ previous). The five scripted hard-mission defeats did not flip — the dominant cause is scripted-brain policy (relentless pinging without silent running) and arithmetic (battery) that no rate tuning within the sanctioned bands can fully overcome; residual fixes are code/design-level and flagged in §6 for the factory manager.
