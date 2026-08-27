# SILENT DEPTH V2.0 — Implementation Plan

| Field | Value |
|---|---|
| Project | SILENT DEPTH V2.0 《深海猎手》 CINEMATIC TACTICAL SUBMARINE |
| Document | V2_IMPLEMENTATION_PLAN.md |
| Status | ACTIVE |

---

## Priority Levels

- **P0**: Foundation — must complete before anything else works
- **P1**: Core 3D experience — ships, submarines, periscope, gameplay integration
- **P2**: Enhanced experience — tactical map, effects, UI overhaul
- **P3**: Polish — performance, QA, documentation, screenshots

---

## P0: Foundation

### Task P0-01: Install Three.js + Dependencies
- **Goal**: Add Three.js as a production dependency
- **Files**: `package.json`
- **Dependencies**: None
- **Implementation**: `npm install three @types/three`
- **Tests**: Build passes, no type errors
- **Acceptance**: `npx tsc --noEmit` clean, `npx vite build` succeeds

### Task P0-02: Create RenderState Types + Adapter
- **Goal**: Define `RenderState` interface and snapshot-to-render-state converter
- **Files**: `src/renderer/types.ts`, `src/renderer/adapter.ts`, `src/renderer/visualRng.ts`
- **Dependencies**: P0-01
- **Implementation**: 
  - Define all RenderState types (player, ships, contacts, torpedoes, weather, effects)
  - Implement `snapshotToRenderState(snapshot, prevSnapshot, alpha, balance)` pure function
  - Create independent visual PRNG (xorshift32, seeded from wall clock, never engine RNG)
  - Coordinate mapping: engine (x=east,y=north) → Three.js (x=east,y=-depth,z=-north)
- **Tests**: `tests/unit/renderState.test.ts` — verify coordinate mapping, interpolation, weather derivation
- **Acceptance**: All existing tests still pass, new adapter tests pass

### Task P0-03: Three.js Scene Manager + Camera Manager
- **Goal**: Establish Three.js scene lifecycle, resize handling, camera system
- **Files**: `src/renderer/three/SceneManager.ts`, `src/renderer/three/CameraManager.ts`, `src/renderer/three/index.ts`
- **Dependencies**: P0-01, P0-02
- **Implementation**:
  - SceneManager: create scene, WebGL2 renderer, resize handler, disposal
  - CameraManager: world camera (perspective, elevated follow), periscope camera, tactical camera (ortho)
  - Smooth camera transitions (lerp position + target)
  - DPR-aware canvas sizing
- **Tests**: Smoke test — scene creation without errors in headless GL
- **Acceptance**: Empty 3D scene renders (dark ocean background)

### Task P0-04: Ocean Renderer
- **Goal**: Procedural ocean surface with waves
- **Files**: `src/renderer/three/OceanRenderer.ts`, `src/renderer/procedural/oceanShader.ts`
- **Dependencies**: P0-03
- **Implementation**:
  - Large plane geometry with vertex displacement shader
  - Gerstner wave model: sum of 4 directional waves
  - Wave parameters driven by weather kind (Calm→Storm)
  - Depth-based color gradient (shallow teal → deep navy)
  - Foam on wave crests (normal-based threshold)
  - Reflection/refraction approximation
- **Tests**: Visual validation only
- **Acceptance**: Animated ocean surface visible in browser, responds to weather changes

### Task P0-05: Sky + Lighting + Weather Visuals
- **Goal**: Atmospheric rendering — sky dome, sun/moon, fog, rain
- **Files**: `src/renderer/three/SkyRenderer.ts`, `src/renderer/three/LightingManager.ts`, `src/renderer/three/WeatherRenderer.ts`, `src/renderer/procedural/skyShader.ts`
- **Dependencies**: P0-03, P0-04
- **Implementation**:
  - Sky dome with atmospheric scattering (Rayleigh + Mie)
  - Sun/moon position based on weather kind (Night = moon)
  - Directional light (sun/moon) + ambient hemisphere light
  - Volumetric fog layer (exponential distance fog)
  - Rain particle system (Storm weather)
  - Cloud layer (procedural noise texture)
  - Weather transitions blend smoothly
- **Tests**: Visual validation
- **Acceptance**: Clear/Cloudy/Storm/Fog/Night all visually distinct

---

## P1: Core 3D Experience

### Task P1-01: Procedural Ship Geometry
- **Goal**: Generate distinguishable 3D ship models by class
- **Files**: `src/renderer/procedural/shipGeometry.ts`, `src/renderer/three/ShipRenderer.ts`
- **Dependencies**: P0-03
- **Implementation**:
  - Parametric hull generation: length/beam/draft ratios per ShipClass
  - Merchant: wide beam, low superstructure
  - Cargo: medium beam, container stacks (box arrays)
  - Tanker: long hull, cylindrical tanks, rear superstructure
  - Destroyer: narrow beam, gun turrets, bridge tower
  - Frigate: compact, radar mast
  - Visual variants: Cargo_A/B/C via superstructure variation
  - InstancedMesh for same-class ships
  - Wake trail geometry (ribbon behind moving ships)
- **Tests**: Geometry generation unit tests (vertex count, bounds)
- **Acceptance**: Each ship class visually distinguishable

### Task P1-02: Procedural Submarine Geometry
- **Goal**: Player submarine with articulated parts
- **Files**: `src/renderer/procedural/submarineGeometry.ts`, `src/renderer/three/SubmarineRenderer.ts`
- **Dependencies**: P0-03
- **Implementation**:
  - Hull: lathe geometry (cigar shape)
  - Conning tower: box + fairing
  - Periscope: cylinder, animated raise/lower/rotate
  - Propeller: disc with blade geometry, rotation animation
  - Rudder: flat plate, animated with turn input
  - Torpedo tubes: 4 forward tube openings
  - Damage points: visual indicators when hull < 100%
  - Pitch animation during depth transitions
  - Roll animation at speed
  - Emergency dive animation
- **Tests**: Part hierarchy, animation state machine
- **Acceptance**: Submarine visible, periscope animates, propeller spins

### Task P1-03: Gameplay Integration
- **Goal**: Connect simulation snapshots to 3D renderer
- **Files**: `src/main.ts` (refactor), `src/renderer/three/index.ts`
- **Dependencies**: P0-02 through P1-02
- **Implementation**:
  - Replace Canvas 2D renderer with Three.js renderer in main loop
  - Feed RenderState to Three.js each frame
  - Maintain dual-rate: 20Hz sim, 60Hz render
  - Interpolation via adapter alpha
  - Event-driven effects (explosions, pings, splashes)
  - Camera follows player submarine
  - Preserve all keyboard controls
  - Keep DOM HUD overlay functional
- **Tests**: All 489 existing tests pass, M01 playable in browser
- **Acceptance**: Full mission playable with 3D visuals, all controls work

### Task P1-04: Periscope V2
- **Goal**: Cinematic periscope view with optical camera
- **Files**: `src/renderer/three/PeriscopeView.ts`
- **Dependencies**: P1-02, P1-03
- **Implementation**:
  - Periscope camera at conning tower height
  - Circular optical mask (shader or CSS clip-path)
  - Bearing rotation follows player heading
  - Target highlighting when contact in FOV
  - Range/bearing/AOB overlay (minimal HUD)
  - Zoom control
  - Lock indicator
  - Smooth raise/lower camera transition
  - Exposure warning visual (screen edge vignette)
- **Tests**: Camera transition smoothness, target detection in FOV
- **Acceptance**: P key raises periscope, optical view shows ships, L locks target

---

## P2: Enhanced Experience

### Task P2-01: Tactical Map V2
- **Goal**: 3D world with tactical overlay
- **Files**: `src/renderer/three/TacticalOverlay.ts`
- **Dependencies**: P1-03
- **Implementation**:
  - HTML/CSS overlay or Three.js sprite-based markers
  - Contact uncertainty ellipses (projected to screen space)
  - Track lines (breadcrumb trail)
  - LKP markers
  - Sonar range rings
  - Torpedo trajectory prediction lines
  - Grid overlay
  - Zoom/pan independent of world camera
  - Data sourced from same simulation snapshot
- **Tests**: Overlay accuracy vs simulation data
- **Acceptance**: Tactical information readable over 3D world

### Task P2-02: Cinematic Effects
- **Goal**: Unified effects system for combat visuals
- **Files**: `src/renderer/three/EffectsManager.ts`
- **Dependencies**: P1-03
- **Implementation**:
  - TorpedoHit: water column + explosion flash + shockwave ring + debris particles
  - NearMiss: smaller splash + bubble trail
  - DepthCharge: water geyser + pressure wave visual
  - SonarPing: expanding ring from submarine (3D sphere shell, fading)
  - TorpedoWake: ribbon/bubble trail behind running torpedo
  - ShipWake: V-shaped foam trail behind moving ships
  - WaterSplash: particle fountain for any water impact
  - All effects pooled, no per-frame allocation
  - Effect lifecycle: spawn → animate → recycle
- **Tests**: Pool management, no memory leaks
- **Acceptance**: Combat feels cinematic, effects don't drop frames

### Task P2-03: Post Processing
- **Goal**: Cinematic image quality
- **Files**: `src/renderer/three/PostProcessing.ts`
- **Dependencies**: P0-05
- **Implementation**:
  - Tone mapping (ACES filmic)
  - Bloom (subtle, for explosions/sun glint)
  - Color grading (cold blue tint, desaturated)
  - Vignette (periscope mode stronger)
  - Film grain (very subtle)
  - Performance toggle: disable all for low-end devices
- **Tests**: FPS impact measurement
- **Acceptance**: Image quality matches "cinematic" target without FPS loss

### Task P2-04: UI Overhaul
- **Goal**: Modern cinematic HUD
- **Files**: `src/ui/hud.ts`, `src/ui/menus.ts`, `src/style.css`
- **Dependencies**: P1-03
- **Implementation**:
  - Redesign HUD panels for 3D viewport context
  - Contact list with state-colored indicators
  - Fire Control card (range, bearing, AOB, speed, hit probability)
  - Submarine status (depth gauge, speed, battery bar, hull bar, noise meter)
  - Activity timeline (severity-coded event log)
  - Periscope HUD overlay (optical framing + minimal data)
  - Mission briefing/result screens updated for 3D context
  - Pause menu preserved
  - All text content sourced from simulation, no re-calculation
- **Tests**: UI tests continue to pass
- **Acceptance**: Clean, readable, cinematic UI that doesn't obscure the 3D world

---

## P3: Polish & QA

### Task P3-01: Performance Optimization
- **Goal**: Stable 60 FPS on modern hardware, 30 FPS minimum
- **Files**: Various renderer modules
- **Dependencies**: P2 complete
- **Implementation**:
  - Profile draw calls, triangle count, texture memory
  - Enable instancing where applicable
  - LOD for distant ships
  - Particle count scaling based on FPS
  - Ocean shader complexity reduction for low-end
  - Disable post-processing in performance mode
  - Pre-allocate all vectors/matrices
  - Audit GC pressure
- **Tests**: Performance benchmarks
- **Acceptance**: 60 FPS on modern laptop, graceful degradation

### Task P3-02: Full QA Pass
- **Goal**: Validate all missions and features in real browser
- **Dependencies**: P3-01
- **Implementation**:
  - Run `npm test` — all 489+ tests pass
  - Run `npm run build` — clean build
  - Browser test M01-M05
  - Test all controls (W/S/A/D/Q/E/P/L/F/R/G/X/Esc/F9/F12)
  - Test sonar, contacts, classification, fire control
  - Test periscope raise/lower/lock
  - Test tactical map
  - Test weather transitions
  - Test pause/restart/save
  - Test night/fog/storm visuals
- **Acceptance**: Zero blocking bugs

### Task P3-03: Visual Screenshots
- **Goal**: Generate V2 screenshot suite
- **Files**: `screenshots/v2/*.png`
- **Dependencies**: P3-02
- **Implementation**:
  - Capture real browser screenshots (F12 or automated)
  - Required shots: main menu, mission select, M01-M05, periscope, torpedo launch/hit, tactical map, fog, night
- **Acceptance**: 12+ screenshots in `screenshots/v2/`

### Task P3-04: Documentation Update
- **Goal**: Complete V2 documentation
- **Files**: README.md, docs/*
- **Dependencies**: P3-02
- **Implementation**:
  - Update README.md for V2.0
  - Create docs/V2_RENDERING.md
  - Create docs/V2_ASSETS.md
  - Create docs/V2_PERISCOPE.md
  - Create docs/V2_PERFORMANCE.md
  - Create docs/V2_MIGRATION.md
  - Update GAME_ARCHITECTURE.md references
  - Update VISUAL_STYLE.md for 3D era
  - Create docs/V2_FINAL_REPORT.md
- **Acceptance**: All docs current and accurate

---

## Dependency Graph

```
P0-01 (Three.js)
  └── P0-02 (Adapter)
        └── P0-03 (Scene + Camera)
              ├── P0-04 (Ocean)
              │     └── P0-05 (Sky + Lighting + Weather)
              ├── P1-01 (Ships)
              ├── P1-02 (Submarine)
              │     └── P1-04 (Periscope V2)
              └── P1-03 (Gameplay Integration) ← depends on P0-02..P1-02
                    ├── P2-01 (Tactical Map)
                    ├── P2-02 (Effects)
                    ├── P2-04 (UI Overhaul)
                    └── P2-03 (Post Processing) ← depends on P0-05
                          └── P3-01 (Performance)
                                └── P3-02 (QA)
                                      ├── P3-03 (Screenshots)
                                      └── P3-04 (Documentation)
```

---

## Acceptance Criteria Summary

| Criterion | Verification |
|---|---|
| Simulation not broken | All 489 existing tests pass |
| Deterministic behavior | determinism.test.ts passes |
| Build succeeds | `npm run build` clean |
| Browser runs | `npm run dev` + manual test |
| 3D Renderer | Three.js scene with ocean, ships, sub |
| Dynamic Weather | 5 weather kinds visually distinct |
| Periscope V2 | Optical camera + HUD |
| Tactical Map V2 | Overlay with contacts/tracks |
| Modern HUD | Glass panels, clean typography |
| Performance | 60 FPS target, 30 FPS minimum |
| Offline | No runtime network requests |
| No copyrighted assets | All procedural, CC0 |
| Documentation complete | All V2 docs written |
| Screenshots | 12+ browser captures |
