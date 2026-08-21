# SILENT DEPTH 《深海猎手》

A 2D tactical submarine ambush game — you command a silent-running submarine hunting convoys by sonar alone. **Fully offline**, deterministic engine, all assets procedurally generated. v1.0.0.

## Quick start

```bash
cd projects/p-004/workspace
npm install            # dev toolchain only — the game has zero runtime dependencies
npm run dev            # dev server → http://localhost:5173
```

Production build (recommended for playing):

```bash
npm run preview        # serves the production build → http://localhost:4173
# or open dist/index.html directly (the build uses relative paths, offline-capable)
```

Verify: `npm test` → **358 / 358 passed (16 files)** · `npm run build` → offline-verified static bundle.

## Controls

| Key | Action |
|---|---|
| **W / S** | Speed up / down (±2 kt) |
| **A / D** | Rudder (A = port, D = starboard) |
| **Q / E** | Depth layer up / down (one step per press) |
| **Space** | Active sonar ping |
| **F** | Fire torpedo at the selected contact |
| **R** | Toggle silent running |
| **G** | Launch decoy |
| **P** | Pause / resume |
| **Esc** | Back to menu |

> Mapping is implemented in `src/ui/input.ts` (GAME_DESIGN §11.2). The engine is deterministic: the same seed + same inputs always produce the same outcome.

## Missions

| ID | Name | Objective | Enemy force | Torpedoes | Weather | Difficulty | Par |
|---|---|---|---|---|---|---|---|
| M01 | Sonar Training 声呐训练 | Find → classify → track 1 merchant (no sink) | 1 × Merchant | 4 | Clear | Easy | 15 min |
| M02 | First Ambush 首次伏击 | Sink 1 tanker | 1 × Tanker | 4 | Clear→Cloudy | Easy-Med | 20 min |
| M03 | Convoy Attack 袭击护航队 | Sink ≥ 2 cargo ships | 4 × Cargo + 1 × Destroyer | 5 | Cloudy→Storm | Medium | 30 min |
| M04 | Heavy Escort 重装护航 | Sink ≥ 2 and survive | 4 × Cargo + 2 × Destroyer | 4 | Storm→Fog | Hard | 35 min |
| M05 | Silent Hunter 静默猎手 | Sink ≥ 1 **and** escape | 4 × Cargo + 2 × Destroyer + 1 × Frigate | 4 | Night + Fog | Very Hard | 40 min |

- Missions unlock sequentially (M01 → M02 → …). Progress and best scores are saved locally (schema-validated localStorage).
- Beyond the 5 fixed missions, the mission generator produces seeded missions at difficulty 1–5.
- Honest note: scripted AI victories were proven for M01/M02/generated-02; M03–M05 scripted victories were **not** achieved by the harness (see RELEASE_NOTES §3) — the fire control is accurate, but escort pressure and merchant scatter make them genuinely hard.

## Scoring

Total 1000 points — Objectives 40 % (400) + Damage 20 % (200) + Detection 15 % (150) + Torpedo efficiency 10 % (100) + Time 10 % (100) + Survival/Escape 5 % (50).

| Grade | Score |
|---|---|
| Perfect | 1000 |
| Excellent | 800–999 |
| Good | 600–799 |
| Poor | 400–599 |
| Failed | < 400 |

## Architecture pointer

| Doc | What it covers |
|---|---|
| `docs/GAME_ARCHITECTURE.md` | 9-system engine (world / missions / submarine / sonar / AI / combat / detection / objectives + core state machine), headless-first design, determinism contract |
| `docs/GAME_DESIGN.md` | Design rules (FR-01…22, balance B1–B10, formulas F1–F10), missions, scoring |
| `docs/AUDIO_DESIGN.md` | 14 WebAudio-synthesized SFX and event mapping |
| `docs/ASSET_PIPELINE.md` | Procedural asset registry (34 entries, all CC0, zero third-party) |
| `docs/VISUAL_STYLE.md` | Visual style / palette / sprite specs |
| `RELEASE_NOTES.md` | v1.0.0 features, balance evidence, known limitations, file inventory, credits |

Key source locations: `src/core/` (engine + state machine), `src/sonar/` (uncertainty, classification), `src/ai/` (enemy state machine, convoy/escort), `src/combat/` (fire control, torpedoes, detection), `src/missions/` (objectives + scoring), `src/ui/` (HUD, input), `src/sim/` (headless AI playtest), `config/balance.json` (all tunable balance).
