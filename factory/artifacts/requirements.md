# SILENT DEPTH 《深海猎手》 — Requirements (v1)

Project: p-004 · Source: Creator Mode Master Production Prompt V1.0 (immutable baseline)
Status: APPROVED baseline · Revision: rev-001

## 1. Vision & Scope

A polished 2D tactical submarine ambush game (Top-down). The core experience is
**decision-making under uncertainty**, not aiming: the player hears, judges,
tracks, predicts, ambushes, attacks, hides, and escapes. Small-but-complete.
Out of scope v1: 3D, open world, real physics, multiplayer, accounts, servers.

## 2. Functional requirements

### 2.1 Core loop
MISSION START → observe → sonar search → detect contact → classify → track →
estimate course → predict intercept → choose ambush position → approach →
prepare torpedo → fire → enemy reaction → evade/reposition → mission complete →
evaluation → next mission.

### 2.2 Player submarine (FR-01)
State: position, heading, speed, depth, battery, noise, hull, torpedoes,
detection, sonarState. Actions: forward, reverse, turn L/R, change speed,
change depth, silent running, sonar ping, fire torpedo, emergency dive.

### 2.3 Speed (FR-02)
STOPPED(noise 0) · SILENT(2-4 kt, low noise) · CRUISE(8-12 kt, med noise) ·
FULL(18-22 kt, high noise). Faster ⇒ more noise ⇒ higher enemy detection
probability.

### 2.4 Depth (FR-03)
Surface · Periscope · Shallow · Medium · Deep. Depth affects noise, detection,
torpedo, battery, visibility. Game-oriented simulation, not real physics.

### 2.5 Sonar (FR-04, P0 — most important system)
Active ping propagates; on hit returns bearing, approximate range, signal
strength, contact type, confidence (e.g. Bearing 037°, Range 8.4km, Signal
Medium, UNKNOWN, 43%).

### 2.6 Contact system (FR-05)
Contacts are never instant "enemy red dots". States: UNKNOWN → SUSPECTED →
CLASSIFIED → TRACKED → CONFIRMED. Data: id, position, bearing, range,
speedEstimate, headingEstimate, classification, confidence, lastDetected,
signalStrength.

### 2.7 Sonar uncertainty (FR-06)
Information improves with tracking: first ping bearing-only → ±range → tighter
bounds → speed/heading estimates with ± errors. Never exact-by-default.

### 2.8 Passive sonar (FR-07)
Passive listening: no self-exposure, weaker info; hears engine/propeller noise,
explosions, torpedoes, depth charges. Active = info↑ risk↑; passive = info↓ risk↓.

### 2.9 Classification (FR-08)
Types: Merchant, Cargo, Tanker, Destroyer, Frigate, Submarine, Unknown.
Gradual: Unknown → Large Surface Contact → Merchant 72% → Confirmed Merchant.

### 2.10 Convoy (FR-09)
v1: 4 Merchants + 1 Destroyer. Merchants hold formation; escort patrols around.
Fleet: heading, speed, formation, spacing, patrolBehavior.

### 2.11 Enemy AI (FR-10)
States: NORMAL → SUSPICIOUS (first attack) → ALERT (anomaly) → SEARCHING
(torpedo seen) → HUNTING (submarine suspected nearby) → LOST_CONTACT.
Search via Last Known Position: search center/radius/pattern
(circular/zig-zag/expanding).

### 2.12 Torpedo (FR-11)
4-6 per mission. States: LOADED/READY/FIRED/RUNNING/HIT/MISSED/EXPIRED.
No auto-lock: player selects target; UI shows estimated intercept + hit
probability (distance/angle/target speed/torpedo speed/target maneuver/
tracking confidence; deterministic + controlled randomness).

### 2.13 Player detection & escape (FR-12)
Detection meter 0-100: 0-20 Unaware, 20-40 Suspicious, 40-60 Searching,
60-80 Hunting, 80-100 Located. Noise↑/ping/attack raise detection. Escape via
silent running, dive, course change, decoy, emergency speed; simplified model
(depth/speed/noise/Last Known Position) determines success.

### 2.14 Battery & hull (FR-13)
Battery 100%; drains for sonar/speed/silent-running; <10% → LOW BATTERY.
Hull 100%; depth-charge/collision damage; ≤0 → MISSION FAILED.

### 2.15 Missions (FR-14)
5 missions: 01 Sonar Training (find+classify+track 1 merchant), 02 First
Ambush (attack 1 transport), 03 Convoy Attack (4 Cargo + 1 Destroyer; sink ≥2),
04 Heavy Escort (4 Cargo + 2 Destroyer, stronger search, fewer torpedoes),
05 Silent Hunter (night, low visibility, limited torpedoes, strong escort,
attack + escape).

### 2.16 Mission generator (FR-15)
Input: difficulty, enemyCount, escortCount, weather, visibility, torpedoes,
battery, objective → Mission Definition. Seeded → reproducible.

### 2.17 World generation (FR-16)
Procedural ocean: color, depth gradient, noise, current, weather, visibility.
Seeded. No external maps.

### 2.18 Weather (FR-17)
Clear/Cloudy/Storm/Fog/Night; affects visibility, sonar, detection, atmosphere.

### 2.19 UI (FR-18)
Menus: Play/Missions/Settings/Credits. HUD: Map, Sonar, sub status, contacts,
torpedoes, battery, hull, detection, mission objectives. Tactical HUD: depth,
speed, heading, battery, hull, noise, detection, torpedoes + contact list
(id/type/bearing/range/speed/heading/confidence/last seen). Event log with
timestamps (SONAR CONTACT DETECTED / CONTACT CLASSIFIED / TORPEDO READY /
TORPEDO FIRED / TARGET HIT).

### 2.20 Game state & save (FR-19)
States: BOOT/MENU/MISSION_LOADING/MISSION_RUNNING/PAUSED/VICTORY/DEFEAT/
MISSION_RESULT. Save: mission progress, unlocked missions, best score,
statistics → localStorage/JSON. No accounts.

### 2.21 Scoring (FR-20)
Based on real data: objectives, damage, detection, torpedo efficiency, time,
escape. 1000 Perfect / 800 Excellent / 600 Good / 400 Poor / <400 Failed.

## 3. Asset requirements (FR-21)

Asset factory pipeline: Discover → Evaluate → License Check → Acquire/Generate →
Process → Register → Validate → Integrate. Source priority: 1) existing project
assets 2) procedural 3) AI-generated 4) verified open 5) commercial; unknown
copyright = BLOCK. Procedural preferred for ocean/sonar/explosions/trails/
particles/UI/map/grid/waves/markers/radar/indicators. AI-generated ok for ship
sprites (uniform style: top-down, tactical 2D, medium detail, muted palette,
transparent, north-up). Resolutions: small units 128×128, normal 256×256, large
512×512, UI SVG/CSS. Registry assets/registry.json (id/name/type/path/source/
author/license/licenseUrl/attribution/sha256/width/height/format/style/version/
createdAt). Provenance + THIRD_PARTY_ASSETS.md. License gate: CC0 auto-approve,
CC BY approve+attribution, CC BY-SA approve+review, CC BY-NC warn/block-commercial,
Unknown/Copyright block.

## 4. Audio requirements (FR-22)

≥10 SFX: sonar ping, passive sonar, torpedo launch/travel/hit, explosion,
depth charge, engine, hull creak, alarm, UI click, mission success/failed.
Style: dark/minimal/underwater/military/tense. Procedural synthesis (WebAudio),
no external samples → zero licensing risk.

## 5. Non-functional requirements

- NFR-1: stable 60 FPS; Canvas rendering; avoid per-frame object churn; no
  unnecessary high-res assets.
- NFR-2: fully offline at runtime; all assets/maps/missions/audio local.
- NFR-3: determinism — mission gen, AI decisions, combat seeded for replay/debug/test.
- NFR-4: security — no XSS/injection/unsafe HTML/unsafe file access/untrusted
  asset paths/external network requests/supply-chain issues.
- NFR-5: balance numbers in config/balance.json, not hard-coded.
- NFR-6: headless sim runner so AI playtest can launch/play/complete missions
  with recorded evidence.

## 6. Acceptance checklist (final)

Gameplay: launch, mission start, move, depth, speed, sonar, contacts,
classification, tracking, torpedo, enemy AI, enemy search, escape, success,
failure, restart.
Content: 5 missions, multiple enemy types, convoy, escort, weather, difficulty.
Asset: consistent style, registry, provenance, license, attribution, no unknown
copyright. Audio: all 9 categories. Factory: orchestration, artifact lineage,
events, run control, requirement change, impact, replan, failure recovery,
quality gates. Testing: unit/integration/gameplay/AI/regression/playtest/build.
Playtest: AI launches, plays, completes ≥1 mission, records results, factory
reacts to failures.
