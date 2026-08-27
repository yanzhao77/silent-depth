# SILENT DEPTH V2.0 — Architecture Document

| Field | Value |
|---|---|
| Project | SILENT DEPTH V2.0 《深海猎手》 CINEMATIC TACTICAL SUBMARINE |
| Document | V2_ARCHITECTURE.md |
| Status | ACCEPTED |
| Supersedes | GAME_ARCHITECTURE.md §8 (Rendering Pipeline) for V2 presentation layer |

---

## 1. Current Architecture (V1 Baseline)

### 1.1 Engine Core (PRESERVE — zero changes)

The simulation engine is a pure TypeScript, headless-first deterministic system:

- **API**: `createGame(missionDef, seed) → GameHandle`, `step(handle, dt, inputs) → GameSnapshot`
- **Pipeline** (fixed order = RNG consumption order):
  1. StateMachine → 2. World → 3. Missions → 4. Submarine → 5. Sonar → 6. Periscope → 7. AI → 8. Combat → 9. Detection → 10. Objectives
- **Determinism**: Seeded mulberry32 RNG, per-system forks, no Math.random/Date.now/wall-clock
- **489 tests passing** across 28 files (unit, integration, determinism, playtest, screenshots)
- **Zero DOM dependencies** in `src/core`, `src/gameplay`, `src/sonar`, `src/ai`, `src/combat`, `src/missions`, `src/world`, `src/sim`

### 1.2 Current Renderer (REPLACE with Three.js)

- Canvas 2D top-down tactical view (`src/rendering/renderer.ts`, 941 lines)
- Layers L0-L5: ocean gradient, grid, entities, particles, weather overlays, minimap
- Procedural sprites via offscreen canvas atlas (`src/rendering/sprites.ts`)
- Particle system (`src/rendering/particles.ts`) — pool-based, 512 cap
- Camera: orthographic top-down, zoom 4–16 px/km (`src/rendering/camera.ts`)

### 1.3 Current UI (UPGRADE)

- DOM HUD layer (`src/ui/hud.ts`) — Modern AI Mission Control style (t-023)
- Menu system (`src/ui/menus.ts`) — main/settings/pause/briefing/result screens
- Input handling (`src/ui/input.ts`) — keyboard + mouse
- CSS design tokens (`src/style.css`) — glass/translucent panels

### 1.4 Asset System (EXTEND)

- All procedural sprites, zero external assets (ADR-003)
- Registry: `assets/registry.json` with sha256 + provenance
- Audio: WebAudio procedural synthesis (`src/audio/`)

### 1.5 Key Interfaces (PRESERVE)

- `GameSnapshot` — pure data, read-only view of simulation state
- `PlayerInputs` — control surface
- `EventEntry` — engine → shell event bus
- `PeriscopePublicState` — optical observation state

---

## 2. Target Architecture (V2)

### 2.1 Fundamental Principle: Simulation-Presentation Decoupling

```
┌─────────────────────────────────────────────────────┐
│            SIMULATION ENGINE (UNCHANGED)             │
│  src/core | src/gameplay | src/sonar | src/ai       │
│  src/combat | src/missions | src/world | src/sim    │
│                                                     │
│  createGame() → step() → GameSnapshot               │
│  Deterministic · Seeded RNG · No DOM                │
└──────────────────────┬──────────────────────────────┘
                       │ GameSnapshot (read-only)
                       │ EventEntry[] (append-only)
                       ▼
┌─────────────────────────────────────────────────────┐
│          RENDER STATE ADAPTER (NEW)                  │
│  src/renderer/adapter.ts                            │
│                                                     │
│  snapshotToRenderState(snapshot, prevSnapshot, alpha)│
│  → RenderState {                                    │
│      world, player, contacts, ships, torpedoes,     │
│      decoys, weather, sonar, effects, mission,      │
│      periscope, camera                              │
│    }                                                │
└──────────────────────┬──────────────────────────────┘
                       │ RenderState (pure data)
                       ▼
┌─────────────────────────────────────────────────────┐
│          THREE.JS RENDERER (NEW)                     │
│  src/renderer/three/                                │
│                                                     │
│  SceneManager     — scene graph lifecycle            │
│  CameraManager    — world/periscope/tactical cams   │
│  OceanRenderer    — procedural waves/foam/reflection│
│  ShipRenderer     — instanced ship models           │
│  SubmarineRenderer— player sub with animations      │
│  SkyRenderer      — sky dome + clouds + sun/moon    │
│  WeatherRenderer  — rain/fog/volumetric             │
│  EffectsManager   — explosions/wakes/pings/splashes │
│  LightingManager  — directional + ambient + point   │
│  PostProcessing   — tone mapping, bloom, color grade│
│  TacticalOverlay  — contact ellipses/grid/rings     │
│  PeriscopeView    — optical camera + HUD            │
│                                                     │
│  Reads RenderState ONLY. Never writes to engine.    │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│          UI LAYER (UPGRADED)                         │
│  src/ui/ (DOM overlay on top of Three.js canvas)    │
│                                                     │
│  HUD · Contacts · Fire Control · Menus              │
│  Glass/translucent · Modern typography              │
│  Receives events from engine via existing EventBus  │
└─────────────────────────────────────────────────────┘
```

### 2.2 Data Flow Invariants

1. **Engine → RenderState → Renderer**: One-way data flow. The renderer NEVER modifies simulation state.
2. **GameSnapshot is the contract**: The adapter reads snapshots and produces a `RenderState`. The Three.js renderer consumes only `RenderState`.
3. **Visual randomness uses separate RNG**: Any particle jitter, wave noise, or visual variation uses a renderer-local PRNG, never the engine's seeded RNG.
4. **Events drive effects**: `EventEntry` from the snapshot triggers visual effects (explosions, pings, splashes) in the EffectsManager. Effects are purely presentational.
5. **Interpolation stays in the adapter**: The 20Hz→60Hz lerp (alpha = accumulator / FIXED_DT) is computed in the adapter, not in the Three.js renderer.

---

## 3. Rendering Architecture

### 3.1 Module Structure

```
src/renderer/
├── adapter.ts              # Snapshot → RenderState conversion
├── types.ts                # RenderState type definitions
├── visualRng.ts            # Independent visual PRNG (not engine RNG)
├── three/
│   ├── index.ts            # ThreeRenderer entry point
│   ├── SceneManager.ts     # Scene graph, disposal, resize
│   ├── CameraManager.ts    # World / Periscope / Tactical cameras
│   ├── OceanRenderer.ts    # Procedural ocean surface (vertex displacement)
│   ├── ShipRenderer.ts     # Instanced mesh ships with LOD
│   ├── SubmarineRenderer.ts# Player sub with articulated parts
│   ├── SkyRenderer.ts      # Sky dome, clouds, sun/moon
│   ├── WeatherRenderer.ts  # Rain particles, volumetric fog
│   ├── EffectsManager.ts   # Pooled explosions, wakes, pings, splashes
│   ├── LightingManager.ts  # Sun/moon directional + ambient + fog
│   ├── PostProcessing.ts   # Tone mapping, bloom, color grading
│   ├── TacticalOverlay.ts  # 2D overlay on 3D (contacts, grid, rings)
│   └── PeriscopeView.ts    # Optical camera + crosshair + rangefinder
├── procedural/
│   ├── submarineGeometry.ts # Procedural sub hull/conning tower/periscope
│   ├── shipGeometry.ts      # Procedural ship hulls by class
│   ├── oceanShader.ts       # GLSL vertex/fragment for ocean
│   └── skyShader.ts         # GLSL sky/atmosphere
└── __tests__/
    └── adapter.test.ts      # RenderState conversion unit tests
```

### 3.2 RenderState Definition

```typescript
interface RenderState {
  simTime: number;
  gameState: GameState;
  
  player: {
    position: Vec3;          // x=east, y=depth(negative), z=north (Three.js coords)
    headingDeg: number;
    speedKt: number;
    depthLayer: DepthLayer;
    depthM: number;
    pitchDeg: number;        // Derived from speed/depth transitions
    rollDeg: number;         // Visual only
    periscopeState: PeriscopePublicState;
  };
  
  ships: Array<{
    id: string;
    shipClass: ShipClass;
    position: Vec3;
    headingDeg: number;
    speedKt: number;
    aiState: AiState;
    visible: boolean;        // Only if detected by sonar/periscope
    variant: string;         // Visual variant (Cargo_A, Cargo_B, etc.)
  }>;
  
  contacts: Array<{
    id: string;
    state: ContactState;
    estimatedPosition: Vec3;
    uncertaintyEllipse: { rxKm: number; ryKm: number; rotationDeg: number };
    classification: ContactType;
    confidence: number;
    selected: boolean;
  }>;
  
  torpedoes: Array<{
    id: string;
    position: Vec3;
    headingDeg: number;
    state: TorpedoState;
  }>;
  
  decoys: Array<{
    id: string;
    position: Vec3;
  }>;
  
  weather: {
    kind: WeatherKind;
    visibilityKm: number;
    waveHeight: number;      // Derived from weather kind
    windSpeed: number;       // Derived from weather kind
    fogDensity: number;      // Derived from weather kind
    isNight: boolean;
  };
  
  effects: Array<{
    type: EffectType;
    position: Vec3;
    age: number;
    params: Record<string, number>;
  }>;
  
  mission: {
    id: string;
    phase: string;
    timer: number;
  };
}
```

### 3.3 Coordinate System Mapping

Engine uses 2D: x=east (km), y=north (km). Three.js uses 3D: x=right, y=up, z=toward camera.

Mapping:
- Engine x (east) → Three.js x
- Engine y (north) → Three.js -z (north into screen)
- Depth (metres, positive down) → Three.js y (negative = below surface)
- Ocean surface at y=0

Heading convention:
- Engine: 0°=north, clockwise
- Three.js: Convert to radians, apply to Y-axis rotation

---

## 4. Camera Architecture

### 4.1 Camera Modes

| Mode | Trigger | FOV | Behavior |
|---|---|---|---|
| World | Default | 60° | Third-person follow, elevated angle, orbit-capable |
| Periscope | P key | 40° | First-person optical, circular mask, bearing rotation |
| Tactical | Tab key | Ortho | Top-down overlay, zoom/pan, contact ellipses |

### 4.2 Transitions

- World ↔ Periscope: Smooth 0.5s dolly + FOV transition
- World ↔ Tactical: 0.3s blend
- Camera never snaps; always interpolates

---

## 5. Asset Architecture

### 5.1 Procedural Geometry Pipeline

Since we cannot use copyrighted 3D models, all geometry is procedurally generated:

- **Submarine**: Lathe geometry hull + box conning tower + cylinder periscope + propeller disc
- **Ships**: Parametric hull curves by class (length/beam/draft ratios from balance config)
- **Ocean**: PlaneGeometry with vertex shader displacement (Gerstner waves)
- **Sky**: SphereGeometry with atmospheric scattering shader

### 5.2 Asset Registry Extension

```json
{
  "id": "proc-submarine-v2",
  "type": "geometry",
  "source": "procedural",
  "format": "runtime-generated",
  "license": "CC0",
  "sha256": "N/A (generated at runtime)"
}
```

All assets remain CC0 procedural. Zero external downloads. Zero CDN.

---

## 6. UI Architecture

### 6.1 Layer Stack

```
[Three.js Canvas] ← Full viewport, renders 3D world
    ↓
[DOM Overlay]     ← Glass panels, positioned absolutely
    ├── Top Bar (mission, status, weather, settings)
    ├── Left Panel (submarine status)
    ├── Right Panel (contacts, fire control)
    ├── Bottom Timeline (event log)
    └── Periscope HUD (only when periscope active)
```

### 6.2 Design Principles

- Center viewport MUST remain clear (3D world visible)
- Panels: backdrop-filter blur, rounded corners, minimal borders
- Typography: Sans-serif UI + monospace technical data
- Color: Cold navy palette, cyan accent, severity coding
- Motion: 120-200ms transitions, no gratuitous animation

---

## 7. Performance Strategy

### 7.1 Targets

| Metric | Target | Fallback |
|---|---|---|
| FPS | 60 (modern desktop) | 30 (low-end) |
| Draw calls | < 100 | Instancing |
| Triangles | < 500K | LOD |
| Textures | < 64MB total | Procedural materials |
| Memory | < 512MB | Pool everything |

### 7.2 Techniques

- **InstancedMesh** for ships of same class
- **Object pooling** for particles, effects, wake trails
- **LOD**: High-poly near camera, low-poly far
- **Frustum culling**: Built-in Three.js
- **Shared materials**: One PBR material per ship class
- **No per-frame allocations**: Pre-allocate vectors, reuse objects
- **WebGL2 default**, WebGPU optional enhancement
- **Performance mode**: Reduce particles, disable post-processing, simplify ocean

---

## 8. Testing Strategy

### 8.1 Existing Tests (PRESERVE ALL)

All 489 existing tests must continue to pass unchanged. The engine is untouched.

### 8.2 New Tests

| Category | Scope | Tool |
|---|---|---|
| Adapter unit | Snapshot → RenderState correctness | Vitest |
| Renderer smoke | Three.js scene creation, no errors | Vitest + headless GL |
| Visual validation | Browser screenshots vs baseline | Manual + Playwright |
| Performance | FPS/memory/draw-calls benchmarks | Chrome DevTools |
| Integration | Full mission M01-M05 in browser | Manual QA |

---

## 9. Compatibility Strategy

### 9.1 Backward Compatibility

- All existing keyboard controls preserved (W/S/A/D/Q/E/P/L/F/R/G/X/Esc/F9/F12)
- All missions M01-M05 functional
- Save system compatible (localStorage schema unchanged)
- Headless sim runner unchanged
- AI playtest unchanged

### 9.2 Browser Support

- Chrome 90+ (WebGL2)
- Safari 15+ (WebGL2)
- Edge 90+ (WebGL2)
- Firefox 90+ (WebGL2)

### 9.3 Offline

- Zero runtime network requests
- All assets local/procedural
- Works from `file://` protocol

---

## 10. Migration Strategy

### Phase-by-Phase

1. **P0 Foundation**: Install Three.js, create adapter, build basic 3D scene
2. **P0 World**: Ocean, sky, lighting, weather visuals
3. **P1 Entities**: Procedural ship/submarine geometry, connect to simulation
4. **P1 Periscope**: 3D periscope camera, optical view, HUD
5. **P2 Tactical**: Tactical map overlay on 3D world
6. **P2 Effects**: Explosions, wakes, sonar ping visuals
7. **P2 UI**: Modern HUD redesign
8. **P3 Polish**: Performance optimization, screenshots, documentation

### Risk Mitigation

| Risk | Mitigation |
|---|---|
| Breaking simulation | Engine code is NEVER modified |
| Test regression | Run `npm test` after every commit |
| Performance | Profile early, LOD/pooling from start |
| Missing 3D models | Procedural geometry pipeline |
| Browser compat | WebGL2 baseline, feature detection |
| Scope creep | Strict phase gates, P0→P1→P2→P3 |

---

## 11. File Change Impact Matrix

| Directory | Action | Reason |
|---|---|---|
| `src/core/` | NO CHANGE | Simulation engine preserved |
| `src/gameplay/` | NO CHANGE | Submarine logic preserved |
| `src/sonar/` | NO CHANGE | Sonar system preserved |
| `src/ai/` | NO CHANGE | Enemy AI preserved |
| `src/combat/` | NO CHANGE | Combat system preserved |
| `src/missions/` | NO CHANGE | Mission system preserved |
| `src/world/` | NO CHANGE | Weather/ocean simulation preserved |
| `src/sim/` | NO CHANGE | Headless runner preserved |
| `src/save/` | NO CHANGE | Save system preserved |
| `src/audio/` | MINOR UPDATE | Add 3D spatial audio hooks |
| `src/rendering/` | REPLACE | Canvas 2D → Three.js |
| `src/renderer/` | NEW | Three.js renderer modules |
| `src/ui/` | UPGRADE | Modern HUD + periscope HUD |
| `src/main.ts` | REFACTOR | Wire Three.js renderer |
| `src/periscope/` | NO CHANGE | Engine periscope logic preserved |
| `tests/` | ADD | New renderer tests |
| `assets/` | EXTEND | Registry entries for procedural 3D |
| `config/` | NO CHANGE | Balance config preserved |
| `docs/` | UPDATE | V2 documentation |
