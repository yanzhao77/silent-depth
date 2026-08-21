# SILENT DEPTH 《深海猎手》 — Release Notes

**Version:** v1.0.0 (final) · **Date:** 2026-08-21 · **Status:** DELIVERED (run-001)

> A 2D tactical submarine ambush game — fully offline, deterministic engine, procedural assets. Every claim below traces to a project artifact: TEST_REPORT, PLAYTEST SUMMARY, BALANCE_REPORT, security-report, build-report, acceptance-matrix.

---

## 1. What's in v1.0.0

### Engine — 9-system deterministic core
Nine wired systems — world, missions, submarine, sonar, AI, combat, detection, objectives, plus the core state machine (TEST_REPORT §1) — running on a fixed-tick, headless-first engine with **proven determinism**: a 3000-tick scripted mission re-run with the same seed is byte-identical at every 50th tick (60 sample points); pause-then-resume is byte-identical to the uninterrupted run (TEST_REPORT §4, `tests/integration/determinism.test.ts`).

### Gameplay features
- **Sonar with uncertainty** — active ping / passive listening, classification chain, and a permanent ±5 % speed / ±9° heading-estimate error floor that makes every contact a probabilistic picture (`sonar.test.ts`, 33 tests).
- **Enemy AI state machine** — NORMAL → SUSPICIOUS → ALERT → HUNTING escalation, last-known-position search, convoy formation, escort figure-8 patrols, volley fire and deck-gun attacks (`ai.test.ts`, 65 tests).
- **Convoy + escort scenarios** — merchant convoys guarded by destroyers/frigate across the hard missions (missions.json, GAME_DESIGN §9.1).
- **Torpedo fire control** — F6 lead-angle / F7 hit-probability fire solution; the compass-vs-math heading convention bug was root-caused and fixed (t-020 remediation, TEST_REPORT addendum).
- **5 fixed missions + seeded generator** — M01–M05 with a sequential unlock chain, plus procedurally generated missions at difficulty 1–5 (config/missions.json, `missions.test.ts`, 39 tests).
- **Procedural weather** — Clear / Cloudy / Storm / Fog / Night with per-mission weather chains; Storm reduces effective torpedo range ×0.85 (t-021; `weather.test.ts`).
- **Tactical HUD** — pure-logic UI suite covering camera math, formatters, input mapping, save schema, renderer math (`ui.test.ts`, 38 tests; `src/ui/input.ts`).
- **14 WebAudio SFX** — sonarPing, sonarReturn, passiveContact, torpedoLaunch, torpedoTravel, torpedoHit, explosion, depthCharge, engine, hullCreak, alarm, uiClick, missionSuccess, missionFailed — all synthesized, no audio files (acceptance-matrix AUDIO; `audio.test.ts`, 14 tests).
- **Procedural assets** — 34/34 asset-registry entries are procedural + CC0 with verified on-disk sha256; **zero third-party assets** (security-report §9; `assets.test.ts`, 14 tests).
- **Save system** — schema-validated, clamped, version-migrated localStorage saves with JSON blob export/import (`src/save/save.ts`; security-report addendum).
- **Headless sim / AI playtest** — the game is playable by scripted AI brains (`src/sim`); 12 recorded sessions across fixed + generated missions (PLAYTEST SUMMARY).

### Quality gates at release
- **Tests: 358 / 358 passed (16 files)** — re-run and verified on release day (`npm test`, 5.4 s). Includes unit, integration (gameplay/determinism/weather), regression and the playtest harness.
- **`tsc --noEmit`: 0 errors.**
- **Build: SUCCESS** — offline-verified static bundle, zero reachable runtime network references, no sourcemaps (build-report t-016).
- **Security: PASS** (post-UI re-verification) — zero runtime dependencies, zero runtime network calls, no injection surface, no secrets; only open item is a LOW deployment hardening note (CSP header).
- **Acceptance matrix: all gates PASS** (acceptance-matrix t-018).

## 2. Balance highlights (evidence-driven)

The t-015 balance pass made **10 evidence-based changes** to `config/balance.json` only — each driven by measured playtest/QA data, none reverted (BALANCE_REPORT):

| Change | Old → New | Measured effect |
|---|---|---|
| Torpedo hit band | 40 m → **55 m** | M02 & GEN-02 winning salvos now resolve at exactly 55 m — passes that were near-misses under the old band |
| Active-ping self-exposure | 12 → **8**/ping | M01 peak detection 36 → **24**, score 864 → **876** |
| Merchant passive detection rate | 0.015 → **0.01**/s | Slower convoy ALERT-scatter (design hierarchy kept) |
| Escort passive detection rate | 0.05 → **0.035**/s | −30 % escort escalation pressure |
| CRUISE battery drain | 0.30 → **0.22** %/s | GEN-05 survives +110 s longer |
| Surface recharging | 0.4 → **0.5** %/s | only recharge layer; still the loudest state |
| Torpedo-fired detection | 20 → **15** | post-kill exposure eased |
| Silent-stop detection sink | 2 → **2.5**/s | silent ambush pays off faster |
| F9 escape threshold | detection < 20 → **< 25** | escape window reachable after a kill |
| + t-021: Storm torpedo range factor | ×0.85 | weather now affects ballistics |

**Net result:** victories preserved 5/5 (M01, M02, GEN-02), every changed metric moved in the intended direction or stayed equal — nothing regressed (BALANCE_REPORT §4).

## 3. Known limitations (honest)

1. **M03+ scripted victories NOT achieved.** Clean scripted victories for M03 (Convoy Attack), M04 (Heavy Escort), M05 (Silent Hunter) and several generated missions were NOT achieved by the playtest harness — recorded as DEFEAT/TIMEOUT with evidence (PLAYTEST SUMMARY; TEST_REPORT §6.1; BALANCE_REPORT §5–6). Root causes are documented: merchant ALERT-scatter at detection ≥ 40, unavoidable escort passive detection, battery-budget arithmetic, and the scripted brains' relentless pinging without silent running. The fire-control path itself is fixed (t-020) and the torpedo victory path is covered by M02. Human play may succeed where the fixed scripts fail — this is a script limitation, honestly recorded, not hidden.
2. **Visual browser smoke NOT TESTED.** The build was produced and verified in a headless environment: no real browser rendered the game. Canvas/DOM/WebAudio surfaces are covered by pure-logic unit tests only. **A manual `npm run preview` visual pass is required before you trust your eyes** (build-report; acceptance-matrix).
3. **Dev-toolchain npm audit findings (dev-only).** `npm audit` (official registry) reports 5 advisories (3 moderate, 1 high, 1 critical) in the **dev toolchain** (vite 5.4.21 / vitest 2.1.9 / esbuild 0.21.5). None ship in the game: **zero runtime dependencies**, `npm audit --omit=dev` = 0, and the built `dist/` is static JS/CSS/HTML with no sourcemaps (security-report SEC-01). Guidance: don't run `vitest ui`; upgrade vite/vitest when a non-breaking path exists.
4. **Residual balance gaps (documented, code-level):** a 59 m first-salvo miss persists (just outside the widened 55 m band), and the "full transit + stalk + 2 salvos ≤ 100 % battery" target is arithmetically unreachable within the design's speed-band hierarchy (BALANCE_REPORT §5–6).

## 4. How to run

```bash
cd projects/p-004/workspace
npm install            # dev toolchain only (vite, vitest, typescript) — zero runtime deps

npm run dev            # dev server → http://localhost:5173
npm run preview        # serve the production build → http://localhost:4173 (recommended visual pass)
npm test               # 358 tests / 16 files
npm run build          # regenerate dist/ (tsc --noEmit && vite build)
npm run sim            # headless AI simulation runner
```

**Offline:** the production build is fully static with relative asset paths (`base: './'`) — serve `dist/` from any static host, or simply open `dist/index.html` in a browser.

## 5. Key deliverable inventory

```
dist/                                   # production build (offline-verified)
  index.html                        414 B    sha256 92d9098329c1366603b3b8ac52185a64563c2e3f21685d1ea7cd043ec56afc1b
  assets/index-CQsMNzoQ.js       161,407 B   sha256 cf35fd9c88b02f1cd5da874d4e5a30303466547b2d2b346ff8981f904dc85542
  assets/index-EBHjOkg3.css        9,502 B   sha256 7afd982f19d7b81abb333de8439cad85fd0631150356bdbe5c6ca76ce38606e2
src/                                    # 9-system engine + UI + sim (17 modules)
config/                                 # balance.json · missions.json · settings.json (bundled at build time)
tests/                                  # 16 files, 358 tests (unit + integration + playtest harness)
docs/                                   # GAME_DESIGN · GAME_ARCHITECTURE · AUDIO_DESIGN · ASSET_PIPELINE · VISUAL_STYLE · README
assets/                                 # registry.json (34 procedural CC0) + THIRD_PARTY_ASSETS.md (zero third-party)
reports/                                # TEST_REPORT · PLAYTEST SUMMARY (12 sessions) · BALANCE_REPORT ·
                                        # security-report · build-report · acceptance-matrix
```

## 6. Credits

- **All game assets are procedural and CC0 (public domain):** the 34-entry asset registry is 100 % `source: procedural`, `license: CC0`, `author: DeepSeek Software Factory`, with verified sha256 on-disk hashes; `assets/THIRD_PARTY_ASSETS.md` declares **zero third-party assets** (security-report §9; `assets.test.ts`).
- **Audio:** all 14 SFX are synthesized via WebAudio — no audio files, no licensing concerns (AUDIO_DESIGN.md).
- **Runtime libraries:** none. The game has zero runtime dependencies; the only dev dependencies are the build/test toolchain (typescript, vite, vitest).
- Built and verified by the DeepSeek Software Factory pipeline (12 role agents, 18 artifacts, 16 quality gates — acceptance-matrix FACTORY section).

---

*End of release notes — v1.0.0. Known limitations are stated, not hidden; see §3 before shipping to end users.*
