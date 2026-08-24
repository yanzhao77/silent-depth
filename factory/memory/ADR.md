# p-004 ADR — Architecture Decision Records

## ADR-001: Headless-first engine (2026-08-21)
Decision: The entire game simulation is pure TypeScript with zero DOM
dependency, driven by a seeded RNG. The browser layer (Vite + Canvas 2D +
minimal DOM HUD) is a thin adapter over the same engine.
Rationale: (1) unit/integration/gameplay tests run in plain Node (Vitest),
fast & deterministic; (2) the AI Playtest Agent can launch, play and complete
missions headlessly via src/sim/ with real recorded evidence; (3) single code
path → no logic drift between headless and browser; (4) offline by construction.
Status: ACCEPTED (audit outcome).

## ADR-002: All numbers in config/balance.json (2026-08-21)
Decision: no hard-coded gameplay numbers; balance.json is the single source of
truth; balance agent edits only that file.
Status: ACCEPTED (master prompt §52).

## ADR-003: Procedural assets & audio only (2026-08-21)
Decision: all sprites/effects procedurally generated (Canvas), all audio
synthesized via WebAudio. Zero external samples/images → zero license risk;
assets/registry.json still records provenance (source=procedural) and the
license gate remains enforced for any future external asset.
Status: ACCEPTED (master prompt §33-44).

## ADR-004: Seeded determinism (2026-08-21)
Decision: mission gen, world gen, AI decisions and combat resolution all consume
the same seeded RNG (mulberry32-based, seed from mission definition). Same seed
→ same mission → same outcome given same player actions. Enables replay,
debugging and AI playtest comparability.
Status: ACCEPTED (master prompt §60-61).

## ADR-005: Headless sim protocol (2026-08-21)
Decision: the engine exposes a minimal, deterministic control surface that the
browser and the headless sim runner share:
- `createGame(missionDef, seed) → GameHandle`
- `step(handle, dtSeconds, inputs) → GameSnapshot`
- `inputs`: { throttle (kt target), rudder (-1..1), depthLayerTarget,
  silentRunning: bool, ping: bool, fireTorpedo: targetContactId|null,
  decoy: bool, pause: bool }
- `GameSnapshot` (pure data): player sub state, contacts (with uncertainty
  fields), enemy fleet state (AI state per ship), torpedoes, detection,
  battery, hull, noise, event log tail, mission status/objectives, score parts.
- Determinism: all randomness flows through the seeded RNG consumed by the
  engine; step() is pure w.r.t. (handle state, inputs, dt) — no wall-clock,
  no Math.random in engine.
- The sim runner (src/sim/) drives step() with a scripted action plan and
  records an audit trail for playtest reports.
Status: ACCEPTED (master prompt §60-61, NFR-6).
