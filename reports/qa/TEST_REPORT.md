# SILENT DEPTH 《深海猎手》 — QA TEST_REPORT (t-013)

**Task:** t-013 comprehensive testing — gameplay integration, determinism regression, TEST_REPORT
**Role:** QA Engineer
**Workspace:** `projects/p-004/workspace`
**Date:** (session)
**Engine state:** all 9 systems wired (world/missions/submarine/sonar/ai/combat/detection/objectives + core state machine)

---

## 1. Executive summary

- **`npm test` — 350 / 350 passed, 14 test files, ~1.3 s** (`vitest run`, node env). No failures, no skips.
- **`npx tsc --noEmit` — clean (0 errors).**
- **Determinism proven end-to-end:** a 3000-tick scripted M03 play re-run with the same seed is **byte-identical** (`JSON.stringify(snapshot)`) at **every 50th tick (60 sample points)**; a different engine seed diverges; **pause-then-resume is byte-identical** to the uninterrupted run; all five fixed missions bootstrap byte-identically.
- **Gameplay core loop exercised through the real engine:** sonar search → detect → classify → track → fire → hit → mission complete (M01 victory, M02 torpedo victory, M03 partial pipeline, M05 F9 escape, defeat paths, restart, pause/resume).
- **Critical finding (evidence-based):** a clean scripted **full M03 double-sink victory is NOT achievable in this build** — the fire-control accuracy (reliable only ≤ 0.5 km), the merchant ALERT scatter (detection ≥ 40), the destroyer's passive detection of *any* player noise, the battery budget, and the 5-torpedo/4-hit requirement compound into an unwinnable scripted scenario. Documented honestly in §6.1 with the empirical evidence. The torpedo *victory* path is covered by M02; the sink-objective logic is unit-covered (`tests/unit/missions.test.ts`).

---

## 2. Suite inventory (as-run)

| File | Tests | Gate area |
|---|---|---|
| `tests/unit/core.test.ts` | 40 | core-runtime |
| `tests/unit/submarine.test.ts` | 27 | submarine |
| `tests/unit/world.test.ts` | 22 | world / mission |
| `tests/unit/sonar.test.ts` | 33 | sonar |
| `tests/unit/ai.test.ts` | 65 | ai |
| `tests/unit/missions.test.ts` | 39 | mission |
| `tests/unit/combat.test.ts` | 36 | combat |
| `tests/unit/audio.test.ts` | 14 | audio |
| `tests/unit/assets.test.ts` | 14 | asset |
| `tests/unit/ui.test.ts` | 38 | ui (pure logic) |
| `tests/toolchain.test.ts` | 2 | toolchain |
| **`tests/integration/gameplay.test.ts`** (new) | **9** | test-gate / gameplay |
| **`tests/integration/determinism.test.ts`** (new) | **9** | test-gate / determinism |
| **`tests/unit/regression.test.ts`** (new) | **2** | test-gate / regression |
| **Total** | **350** | — |

Pre-existing suites are **292 tests** exactly as t-013's brief (core 40, submarine 27, world 22, sonar 33, ai 65, missions 39, combat 36, audio 14, assets 14, toolchain 2) **plus 38 `ui.test.ts`** (pure-logic UI suite, also pre-existing and green). **New in t-013: 20 tests** (9 gameplay + 9 determinism + 2 regression). No existing test file was modified; no `src/` file was modified.

---

## 3. New integration coverage (`tests/integration/gameplay.test.ts`)

All tests drive the **real engine** (`createGame → step`, `dt = FIXED_DT = 0.05 s`) with scripted inputs only. `getMissionDef(id)` supplies the fixed table defs (seeds 1001–1005).

| Scenario | What it proves |
|---|---|
| **M01 Sonar Training** | Full find→classify→track loop: scripted player pings until a contact appears, converges on it, reaches **TRACKED** → `VICTORY` (no sink). Asserts the §10.1.2 **damage component = 100 (TRACKED tier, damageMax/2)**; objective 400 (find 100 + classify 150 + track 150); survival 50; contact state TRACKED; event chain `contact.detected → contact.classified → mission.victory`; grade ≥ Excellent (total ≥ 800). (The CONFIRMED +200 branch is unit-covered at `tests/unit/missions.test.ts:763`.) |
| **M02 First Ambush** | Torpedo loop end-to-end: intercept the tanker, ping+fire a salvo at ≤ 1.3 km (fresh bearing from the same-tick ping), re-fire after a near-miss, both tubes of the second salvo **hit → `ship.sunk` → `VICTORY`**. Asserts `torpedo.fired / torpedo.hit / ship.sunk / mission.victory` events, `torpedoesHit ≥ 2`, tanker hull 0, and §10.1 scoring (objective 400, damage 70 Tanker, survival 50). |
| **M03 Convoy Attack** | Partial pipeline play (victory intentionally not asserted — see §6.1): contacts form and reach CLASSIFIED/CONFIRMED; **detection meter rises with pings (F3 + ping self-exposure +12, §8.1)**; torpedo fire pipeline runs (`torpedoesFired ≥ 1`, fired→RUNNING); the destroyer escalates out of NORMAL (perception). |
| **Defeat path (API)** | `endMission(handle, 'defeat')` from MISSION_RUNNING → `DEFEAT`, `mission.phase = failed`, `mission.defeat` event, then auto `MISSION_RESULT` after `MISSION_RESULT_DELAY_S` (3 s). |
| **Defeat path (real pipeline)** | Test harness writes `player.hull = 0` into the opaque `__internal` runtime (no public hull-setter exists; documented) → the **objectives system** (slot 9) converts hull ≤ 0 → `DEFEAT` through the genuine `setOutcome → applyOutcome` path. |
| **Mission restart** | `createGame(same def, same seed)` twice → **byte-identical** initial and progressed snapshots (no cross-game state leak through the WeakMap runtimes); a different seed diverges once RNG-driven state exists (ping hits). |
| **Pause/resume** | 12-tick pause (pause-edge + 9 frozen + prevPause reset + resume-edge) mid-mission → final snapshot **byte-identical** to the uninterrupted run; `simTime` equal (paused ticks advance neither simTime nor RNG). |
| **M05 F9 escape** | Silent running + dive to Medium + creep away → `escape.escaped` within 60 s with detection < 20, event emitted exactly once, `mission.escaped` latches. |

## 4. Determinism regression (`tests/integration/determinism.test.ts`)

- **Same seed + same script → byte-identical:** 3000 ticks of a scripted M03 play (ping every 6 s, steer by contact, ping+fire at ≤ 1.7 km, rudder maneuver), `JSON.stringify(snapshot)` compared at every 50th tick — **all 60 samples identical**.
- **Different engine seed → diverges** once the scripted pings consume the per-system RNG forks.
- **Pause-then-resume vs no-pause → byte-identical** final snapshot and all 60 samples (the pause window is 12 frozen ticks: pause-edge, 9 frozen, prevPause reset, resume-edge — both edge ticks are frozen by design, ADR-004).
- **All five fixed missions** (M01–M05): two fresh games with the same def+seed are byte-identical after 100 ticks.
- The scripted brain is a **pure function of (snapshot, lastInputs)** — no wall clock, no tick-counter dependence — so the pause run resumes on the identical pre-pause snapshot. This is also the guard for the "per-game WeakMap / pending-bridge state is keyed on the live player object" contract.

## 5. Regression guards (`tests/unit/regression.test.ts`)

- **M02 scripted torpedo victory is repeatable** (same seed → identical score, sunk set, byte-identical final snapshot) — locks the scripted win against future pipeline regressions.
- **F9 escape fires exactly once per game** — locks the `escape.escaped` emission contract.

---

## 6. Coverage gaps & findings (honest evidence)

### 6.1 M03 full double-sink victory — NOT ACHIEVABLE with a clean script (finding)

The brief asked for "M03: fire at 2 cargo, sink both → victory". After **10+ script variants** (park & ambush, silent approach, aggressive chase, adaptive throttle, point-blank gating, decoy/dive evasion, omniscient-fire gating), no clean scripted victory exists. Root causes (each verified empirically):

1. **Torpedo accuracy is reliable only ≤ ~0.5 km.** Controlled experiments (stationary player, single cargo, real engine fire solution) measured the closest approach: bow-on-east target **@1.0 km → 63 m (near miss)**, @3.0 km → 65 m, broadside @1.0 km → 101 m; **@0.5 km → HIT**, @0.2 km → HIT. Two compounding causes: (a) the fire solution mixes the **compass bearing convention** (`contact.bearingDeg`, 0 = north) with the **math-convention target heading** (`headingEstimateDeg` derives from `ship.headingDeg`, 0 = east — see `src/ai/ship.ts` `moveShip` vs `src/sonar/contacts.ts` `compassBearing`), so the F6 AOB/lead is systematically wrong for targets not on a 45° diagonal; (b) the speed/heading estimate error has a **permanent ±5 % (±9°) floor** (`speedHeadingErrorFrac`, `uncertainty.ts`) — a 9° heading error alone produces a ~0.5–1° lead error (≈30–100 m at 1–3 km).
2. **Merchant ALERT scatter:** merchants turn 30° and speed to 11 kt whenever the shared detection meter ≥ 40 (§6.1). Any pinging (12/ping) or loud approach (F3) reaches 40+ before the fire moment, so the convoy scatters and the (lead-estimate-based) torpedo line no longer intersects the turning ship — measured misses of ~45–95 m for a 30–45° turn at 0.3–0.5 km.
3. **Destroyer passive detection is unavoidable:** F3 rate is > 0 for ANY player noise ≥ 1 within its 6 km passive range, so even a stopped, silent-running sub is sensed once the convoy closes inside 6 km → SUSPICIOUS → 2 own-ping hits → ALERT → 26 kt chase + deck gun. The convoy's arrival at firing range (0.5 km) is always after the destroyer is already on the player.
4. **Battery budget vs speed/ping cadence:** tracking the range to the 0.5 km accuracy zone needs repeated pings (2 %/ping); FULL/CRUISE bands drain 0.6/0.3 %/s; the only recharging layer (Surface) is the loudest (detectFactor 1.5). The budget closes off every combination we tried.
5. **Arithmetic:** 5 torpedoes / Cargo hull 110 / 90±10 damage → **4 hits required**; with ≥ 30 % merchant evasion and the accuracy ceiling, the margin is negative.

**Mitigation in the suite:** M03 is covered as a partial pipeline play (contacts, classification, detection exposure, fire pipeline, destroyer escalation) and the **victory path is covered by M02** (real torpedo hit/sink through the full engine) plus the unit sink-objective tests (`missions.test.ts` "M03: victory at ≥ 2 cargo sunk"). **Recommendation for the product:** fix the fire-solution convention mismatch (compass vs math heading) and re-balance merchant ALERT thresholds before M03 is considered playable at "Medium" difficulty.

### 6.2 Other gaps

- **M04 (Heavy Escort) / M05 (Silent Hunter) full missions** not played to victory end-to-end. M05's *escape* mechanic is integration-tested; the *sink-then-escape* combination and M04's survive-under-attack are covered only at the objectives-unit level. Reason: the same fire-control accuracy + escort-pressure dynamics as §6.1 make a scripted victory brittle; honest limit of this task's scope.
- **Browser-only surface: NOT TESTED.** Canvas rendering, DOM input binding, WebAudio playback require a browser; the vitest environment is node. The pre-existing `ui.test.ts` (38 tests) covers the pure UI logic (camera math, formatters, input mapping, save schema, renderer math) headlessly; actual pixels/audio are outside this task (marked **NOT TESTED — browser-only**).
- **Playtest / balance gates** (`reports/playtest`, `reports/balance`) have **no evidence yet** — those artifacts belong to other tasks; this report does not fabricate them. The **security gate has evidence**: `reports/qa/security-report.md` (t-017, CONDITIONAL PASS — ship-blocking issues none).
- **Test harness used:** the hull≤0 defeat test writes the opaque `handle.__internal` runtime (documented in the test) because no public hull-setter exists; the `endMission('defeat')` API test covers the same transition without touching internals.

---

## 7. Quality gate mapping (contracts/gates.yaml)

| Gate | Evidence | Status |
|---|---|---|
| core-runtime | `tests/unit/core.test.ts` (40) — state machine, determinism, pause semantics, balance loader | PASS |
| submarine | `tests/unit/submarine.test.ts` (27) — bands/noise/depth/battery/decoy/hull | PASS |
| sonar | `tests/unit/sonar.test.ts` (33) — ping/passive/uncertainty/classification/decay | PASS |
| ai | `tests/unit/ai.test.ts` (65) — states/LKP/search/convoy/attacks | PASS |
| combat | `tests/unit/combat.test.ts` (36) — fire control/lifecycle/damage/detection sinks | PASS |
| mission | `tests/unit/missions.test.ts` (39) + `world.test.ts` (22) + **gameplay M01/M02/M05** | PASS |
| ui | `tests/unit/ui.test.ts` (38, pure logic) — canvas/DOM/WebAudio **NOT TESTED** (node env) | PARTIAL |
| asset | `tests/unit/assets.test.ts` (14) — registry/licenses/hashes | PASS |
| audio | `tests/unit/audio.test.ts` (14) — SFX tables/wiring; playback **NOT TESTED** (node) | PARTIAL |
| test-gate | **`npm test` 350/350 green** + new integration/determinism/regression suites | PASS |
| playtest | `reports/playtest/` — empty (not this task) | NO EVIDENCE |
| balance | no balance report (t-015) | NO EVIDENCE |
| security | `reports/qa/security-report.md` (t-017, CONDITIONAL PASS) | PASS (per audit) |
| build | `npm run build` is the build task's gate (not re-run here beyond tsc) | tsc PASS |

## 8. How to reproduce

```bash
cd projects/p-004/workspace
npm test            # vitest run — 350 passed (14 files, ~1.3 s)
npx tsc --noEmit    # 0 errors
```

**Regression status: CLEAN.** 292 pre-existing + 38 ui + 20 new t-013 tests, all green; determinism proven byte-identical over a full 3000-tick mission; the one genuine product finding (M03 scripted victory / fire-control accuracy) is documented with evidence in §6.1.

---

## ADDENDUM — fire-control remediation (t-020, factory manager)

QA §6.1 finding (M03 victory gap) was root-caused and fixed:

- **Root cause**: `Contact.headingEstimateDeg` was derived from the enemy's
  internal math-convention heading (0=east, CCW — ai/ship.ts `x+=cos, y+=sin`)
  while contact bearings, the player and torpedoes use compass (0=north, CW).
  The F6 lead-angle AOB was therefore computed against a heading ~90° off,
  making long-range torpedo shots miss by tens of metres.
- **Fix**: src/sonar/contacts.ts converts the estimate to compass
  (`normalizeDeg(90 − ship.headingDeg + err)`); src/rendering/renderer.ts
  rotates enemy sprites with the same conversion. Verified analytically:
  F6 lead (25.5°) matches the true intercept (25.2°) for an east-moving target
  at bearing 14°/2.06 km; the old convention was ~24° off.
- **Test updates**: the M02 scripted brain (gameplay.test.ts + regression.test.ts)
  now uses a stationary ambush (STOPPED + Medium, sparse pings, fire ≤1.2 km
  with lead) — victory reproducible, byte-identical across two plays.
- **Suite**: 350/350 green; tsc clean.
- **Remaining M03 gap** (for t-015 balance): merchants ALERT-scatter at
  detection ≥ 40 and the destroyer's passive detection escalate quickly; the
  torpedo path itself is now accurate.
