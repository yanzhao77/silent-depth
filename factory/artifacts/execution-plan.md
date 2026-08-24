# SILENT DEPTH — EXECUTION PLAN (plan-v1)

Project: p-004 · Run: run-001 · State: RUNNING
Author: Factory Manager · Date: 2026-08-21

## 0. Objective

Produce a complete, runnable, offline, polished 2D tactical submarine ambush
game. Small-but-complete beats big-but-broken. Priority:
Gameplay > Stability > Playability > Visual Polish > Content Quantity.

## 1. Tech stack

- Language: TypeScript (strict)
- Core engine: pure TS, no DOM — deterministic seeded RNG; headless-runner for AI playtest
- Rendering: Canvas 2D via Vite; minimal DOM for HUD/menus
- Tests: Vitest (unit/integration) + headless sim tests
- Build: `vite build` → static offline `dist/`
- Save: localStorage + JSON export
- No runtime network; no external dependencies beyond dev tooling

## 2. Phase map (game phases → standard factory phases)

| # | Game phase | Factory phase | Deliverables |
|---|---|---|---|
| 0 | Production Audit | planning | audit-report, execution-plan (THIS) |
| 1 | Game Design | requirements | requirements.md, game-design.md |
| 2 | Architecture | architecture | game-architecture.md, task DAG, role contracts |
| 3 | Core Game Runtime | backend | engine boot, game state machine, mission lifecycle |
| 4 | Submarine Control | backend | movement/speed/depth/battery/noise |
| 5 | Sonar (P0) | backend | ping, passive, contacts, uncertainty, classification |
| 6 | Enemy AI | backend | state machine, convoy, escort, search behavior |
| 7 | Combat | backend | torpedo fire/travel/hit, damage, detection meter, escape |
| 8 | Mission System | backend | 5 missions + seeded mission generator + world gen |
| 9 | UI/HUD | frontend | tactical HUD, contact panel, event log, menus, results |
| 10 | Asset Factory | frontend | procedural sprites/effects, registry, provenance, license gate |
| 11 | Audio | frontend | ≥10 procedural sound effects (WebAudio) |
| 12 | Testing | testing | unit/integration/gameplay/AI/regression, all green |
| 13 | AI Playtest | testing | ≥10 headless playtests, playtest reports |
| 14 | Balance | testing | balance pass from playtest evidence → balance.json |
| 15 | Build | build | offline production build, smoke launch |
| 16 | Final Trial | build/deployment | requirement-change drill, failure-recovery drill, acceptance matrix, release |

## 3. High-level task DAG (epic tags; detailed in tasks/)

t-001 requirements/game-design (game-designer) → t-002 architecture (game-architect)
→ t-003 engine core (gameplay-engineer) → t-004 submarine control
→ t-005 sonar P0 (gameplay+ai) → t-006 enemy AI (ai-engineer)
→ t-007 combat/torpedo (gameplay-engineer) → t-008 missions+generator (level-designer)
→ t-009 world/weather (level-designer) → t-010 HUD/UI (ui-engineer)
→ t-011 procedural assets+registry (asset-engineer) → t-012 audio (audio-engineer)
→ t-013 tests (qa) → t-014 headless playtest driver + 10 playtests (playtest)
→ t-015 balance (balance) → t-016 build (build-release) → t-017 security audit (security)
→ t-018 final trial + release docs (manager)

## 4. Quality gates (contracts/gates.yaml)

game-design-gate · architecture-gate · core-runtime-gate · submarine-gate ·
sonar-gate(P0) · ai-gate · combat-gate · mission-gate · ui-gate · asset-gate ·
audio-gate · test-gate · playtest-gate · balance-gate · security-gate ·
build-gate. Any core gate FAIL → fix loop → retry → must PASS before DELIVERED.

## 5. Role contracts (contracts/*.yaml, injected into subagent delegations)

game-designer · game-architect · gameplay-engineer · ai-engineer · ui-engineer ·
asset-engineer · audio-engineer · level-designer · qa · playtest · balance ·
security · build-release. All subagents: approval policy = never.

## 6. Deliverables (final acceptance)

GAME_DESIGN.md · GAME_ARCHITECTURE.md · VISUAL_STYLE.md · ASSET_PIPELINE.md ·
AUDIO_DESIGN.md · assets/registry.json · THIRD_PARTY_ASSETS.md · TEST_REPORT ·
PLAYTEST_REPORT · BALANCE_REPORT · RELEASE_NOTES · offline runnable build ·
headless sim runner (for AI playtest + replay).

## 7. Risk register

- R1 Sonar uncertainty math too complex → start simple, iterate (P0)
- R2 Headless/browser drift → single engine code path, renderer is adapter
- R3 Balance feels bad → evidence-driven playtest → balance.json only
- R4 Audio licensing → all audio procedurally synthesized (WebAudio), zero samples
- R5 Scope creep → small-but-complete; content quantity capped at spec

## 8. Change & failure drills (PHASE 16)

- Requirement change: active-sonar-for-destroyers drill → requirement-set →
  impact → replan-propose → approve → affected tasks only.
- Failure drill: torpedo hit-detection failure → failure-record →
  recover → remediation task → fix → retest → PASS.
