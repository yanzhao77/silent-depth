# SILENT DEPTH — Acceptance Matrix (FINAL, t-018)

Run: run-001 · Project status: DELIVERED · Verified: 2026-08-21

## GAMEPLAY — all PASS (evidence: tests + playtest)

| # | Item | Evidence |
|---|---|---|
| 1 | Game launches | build + preview smoke 200s (build-report.md) |
| 2 | Mission starts | core-runtime tests; M01/M02 missions run |
| 3 | Submarine moves | submarine.test.ts (27) |
| 4 | Depth works | submarine.test.ts (layers/transitions) |
| 5 | Speed works | submarine.test.ts (bands/F1) |
| 6 | Sonar works | sonar.test.ts (33, P0) |
| 7 | Contacts work | sonar.test.ts (states/decay) |
| 8 | Classification works | sonar.test.ts (chain + vote) |
| 9 | Tracking works | sonar.test.ts (uncertainty convergence) |
| 10 | Torpedo works | combat.test.ts (36) + integration M02 |
| 11 | Enemy AI works | ai.test.ts (65: state machine/convoy/escort/search) |
| 12 | Enemy searches | ai.test.ts (patterns + LKP) |
| 13 | Player can escape | gameplay.test.ts (F9 escape) |
| 14 | Mission can succeed | playtest M01/M02/GEN-02 VICTORY |
| 15 | Mission can fail | playtest M03/M04/M05 DEFEAT; defeat-path test |
| 16 | Mission can restart | gameplay.test.ts (restart byte-identical) |

## CONTENT — all PASS

| # | Item | Evidence |
|---|---|---|
| 17 | 5 missions | config/missions.json + missions.test.ts (39) |
| 18 | Multiple enemy types | 6 ship classes in balance + sprites |
| 19 | Convoy | ai.test.ts (2×2 formation) |
| 20 | Escort | ai.test.ts (figure-8, volleys, deck gun) |
| 21 | Weather | world.test.ts (22) + t-021 storm factor |
| 22 | Difficulty | generator 1-5 + missions table |

## ASSET — all PASS

| # | Item | Evidence |
|---|---|---|
| 23 | Visual style consistent | sprites.ts follows VISUAL_STYLE; registry tests |
| 24 | Asset Registry | assets/registry.json (34 entries) |
| 25 | Asset Provenance | registry fields + sha256 real |
| 26 | License verification | license gate tests; all CC0 procedural |
| 27 | Attribution | THIRD_PARTY_ASSETS.md (zero third-party) |
| 28 | No unknown copyright assets | provenance sweep PASS (security) |

## AUDIO — all PASS (14 SFX)

sonarPing/sonarReturn/passiveContact/torpedoLaunch/torpedoTravel/torpedoHit/
explosion/depthCharge/engine/hullCreak/alarm/uiClick/missionSuccess/missionFailed
— audio.test.ts (14), AUDIO_DESIGN.md mapping to event catalogue.

## FACTORY — all PASS (persisted evidence in events.jsonl / artifact graph)

| # | Item | Evidence |
|---|---|---|
| 38 | Agent orchestration | 12 role agents traced (agent-start/complete/fail) |
| 39 | Artifact lineage | 18 artifacts, sha256, dep edges (artifact-graph) |
| 40 | Events | events.jsonl (run-001) |
| 41 | Run control | run-001: CREATED→PLANNING→READY→RUNNING→COMPLETED |
| 42 | Requirement change | rev-0002 drill: requirement-set→impact→replan-propose→approve |
| 43 | Impact analysis | impact cmd output (HIGH; tasks/artifacts mapped) |
| 44 | Replanning | plan-v2 approved; t-021 implemented + verified |
| 45 | Failure recovery | F-001 (designer), F-002 (fire control t-020), drill 2 (hit detection) — all recorded + recovered |
| 46 | Quality gates | 16 gates validated (artifact-validate records) |

## TESTING — all PASS (358 tests / 16 files)

unit (core/submarine/world/sonar/ai/missions/combat/audio/assets/ui/regression)
+ integration (gameplay/determinism/weather) + playtest harness. Determinism:
byte-identical 3000-tick snapshots.

## PLAYTEST — all PASS

| # | Item | Evidence |
|---|---|---|
| 53 | AI can launch game | sim runner (src/sim) |
| 54 | AI can play | 12 sessions, scripted brains |
| 55 | AI completes ≥1 mission | M01 (121s), M02 (2754s), GEN-02 (1393s) VICTORY |
| 56 | AI records result | reports/playtest/playtest-01..12.md + SUMMARY |
| 57 | AI identifies failure | M03/M04/M05/GEN defeats classified with evidence |
| 58 | Factory reacts | t-020 remediation + balance t-015 from findings |

## Honest NOT TESTED items

- Visual browser smoke (headless environment) — manual `npm run preview` advised.
- M03/M04/M05 scripted victories — balance limits documented (BALANCE_REPORT).
