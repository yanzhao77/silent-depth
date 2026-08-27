# SILENT DEPTH V2.0 — Migration Guide

| Field | Value |
|---|---|
| Project | SILENT DEPTH V2.0 《深海猎手》 CINEMATIC TACTICAL SUBMARINE |
| Document | V2_MIGRATION.md |
| Status | ACTIVE |

---

## 1. What Changed

### Added
- Three.js as production dependency
- `src/renderer/` — New V2 renderer modules (types, adapter, visualRng, three/*)
- Procedural 3D geometry generators for submarine and all ship classes
- Custom GLSL shaders for ocean and sky
- Camera system with world/periscope/tactical modes
- Effects manager for combat visuals

### Modified
- `src/main.ts` — Integrated Three.js renderer alongside existing Canvas 2D
- `package.json` — Added `three` and `@types/three` dependencies

### Unchanged (Preserved)
- All engine code (`src/core/`, `src/gameplay/`, `src/sonar/`, `src/ai/`, `src/combat/`, `src/missions/`, `src/world/`, `src/sim/`)
- All tests (489/489 passing)
- Save system (`src/save/`)
- Audio system (`src/audio/`)
- UI system (`src/ui/`) — DOM HUD still works as overlay
- Config files (`config/`)
- All keyboard controls

## 2. Backward Compatibility

- **Save files**: Fully compatible. No schema changes.
- **Missions M01-M05**: All functional with identical simulation behavior.
- **Controls**: All keys work identically (W/S/A/D/Q/E/P/L/F/R/G/X/Esc/F9/F12).
- **Headless sim**: Unchanged. `npm run sim` and `npm run playtest` work as before.
- **Canvas 2D fallback**: Still available for menus and when Three.js fails to initialize.

## 3. New Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| three | latest | WebGL 3D rendering |
| @types/three | latest | TypeScript type definitions |

Both are bundled into the production build. No runtime CDN dependencies.

## 4. Build Changes

```bash
npm install    # Now installs Three.js (~576KB)
npm test       # 489 tests pass (unchanged)
npm run build  # Produces ~816KB JS bundle (was ~241KB)
npm run dev    # Dev server works as before
```

The bundle size increase is entirely from Three.js. The game code itself grew by ~15KB for the renderer modules.

## 5. Browser Requirements

V2 requires **WebGL2** support:
- Chrome 56+
- Firefox 51+
- Safari 15+
- Edge 79+

All modern desktop browsers support WebGL2. Mobile is not targeted but may work.
