# SILENT DEPTH V2.0 — Periscope System

| Field | Value |
|---|---|
| Project | SILENT DEPTH V2.0 《深海猎手》 CINEMATIC TACTICAL SUBMARINE |
| Document | V2_PERISCOPE.md |
| Status | ACTIVE |

---

## 1. Overview

The V2 periscope upgrades the existing engine periscope system (t-024) with a cinematic 3D optical view. The engine logic remains unchanged — only the presentation layer is enhanced.

## 2. Engine Integration

The periscope engine (`src/periscope/periscope.ts`) provides `PeriscopePublicState` in every `GameSnapshot`:

```typescript
interface PeriscopePublicState {
  state: 'SUBMERGED' | 'SURFACING' | 'RAISING' | 'RAISED' | 'OBSERVING' | 'LOWERING';
  progress: number;           // 0..1 raise/lower animation
  raisedDurationS: number;    // Exposure timer
  exposure: number;           // 0..100
  exposureBand: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  observingContactId: string | null;
  lockedContactId: string | null;
  viewBearingDeg: number;
}
```

The renderer reads this state to:
- Animate the 3D periscope mesh (raise/lower/rotate)
- Switch camera mode (world → periscope)
- Show optical HUD overlay
- Display exposure warnings

## 3. Camera Behavior

### World → Periscope Transition
1. Player presses P
2. Engine transitions periscope state: SUBMERGED → RAISING
3. Renderer smoothly interpolates camera from world position to periscope eye point
4. FOV narrows from 60° to 40° over ~0.5s
5. Circular optical mask fades in

### Periscope View
- Camera positioned at conning tower height (~15m above sub center)
- Look direction follows player heading
- Circular viewport mask (CSS clip-path or shader)
- Bearing markers around edge
- Contact highlighting when in FOV

### Periscope → World Transition
1. Player presses P again
2. Engine transitions: OBSERVING/RAISED → LOWERING
3. Camera smoothly returns to world position
4. FOV widens back to 60°
5. Optical mask fades out

## 4. Controls (Unchanged from V1)

| Key | Action |
|-----|--------|
| P | Raise/lower periscope |
| L | Lock observed target |
| X | Emergency dive (instant lower) |

## 5. Information Warfare

The periscope maintains the core design principle: **information is earned, not given**.

- Visual observation upgrades contact to ground truth (type/speed/heading/range)
- But raises exposure → detection risk
- Firing while raised adds bonus detection
- The player must balance observation time vs. safety
