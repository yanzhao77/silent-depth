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

Verify: `npm test` → **489 / 489 passed (28 files)** · `npm run build` → offline-verified static bundle.

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
| **P** | Raise / lower periscope |
| **L** | Lock periscope target |
| **X** | Emergency dive |
| **Esc** | Pause menu (Pause/Resume · Restart · Abort) |
| **F12** | Screenshot (dev) |

> Mapping is implemented in `src/ui/input.ts` (GAME_DESIGN §11.2 + periscope t-026). The engine is deterministic: the same seed + same inputs always produce the same outcome.

## Periscope (t-026)

The periscope is a risk-for-reward optical observation mechanic — your only
source of **ground-truth** target data (type / speed / course / range) and the
gate to a **VISUAL CONFIRMED** fire solution.

- **Raise** (P or `RAISE PERISCOPE`): the boat auto-surfaces to the periscope
  depth layer, then the periscope raises (~3 s). Raising while too deep or at
  the wrong layer is blocked with a localized reason hint.
- **Observe**: while RAISED/OBSERVING the central workspace becomes the
  **PERISCOPE VIEW** — an optical reticle with the observed target card
  (TYPE / BEARING / RANGE / SPEED / COURSE / CLASSIFICATION / CONFIDENCE).
  Any contact in view is visually confirmed.
- **Exposure**: every second raised accrues exposure (0–100). Bands:
  LOW (green) → MEDIUM (yellow) → HIGH (orange) → CRITICAL (red). At high
  exposure the enemy may locate you — lower the periscope or dive.
- **Lock target** (L): pins the observed contact — the fire solution becomes
  **VISUAL CONFIRMED** (ground-truth inputs, no confidence penalty).
- **Warning**: firing a torpedo while the periscope is raised briefly
  broadcasts your position — a warning banner offers `LOWER PERISCOPE` /
  `EMERGENCY DIVE` (X).
- **Emergency dive** (X): drops the periscope in 0.5 s and escapes the
  exposure window.

Pause lives in the **Esc menu** (P is now the periscope key).

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
