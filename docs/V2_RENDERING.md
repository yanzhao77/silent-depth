# SILENT DEPTH V2.0 — Rendering Architecture

| Field | Value |
|---|---|
| Project | SILENT DEPTH V2.0 《深海猎手》 CINEMATIC TACTICAL SUBMARINE |
| Document | V2_RENDERING.md |
| Status | ACTIVE |

---

## 1. Overview

V2 replaces the Canvas 2D top-down tactical renderer with a full Three.js 3D rendering pipeline while preserving the deterministic simulation engine unchanged.

### Architecture Layers

```
GameSnapshot (engine output, 20Hz)
    ↓ snapshotToRenderState()
RenderState (pure data bridge)
    ↓ ThreeRenderer.render()
Three.js Scene (60Hz rAF)
    ├── OceanRenderer (Gerstner wave shader)
    ├── ShipRenderer (procedural geometry per class)
    ├── SubmarineRenderer (articulated player sub)
    ├── SkyRenderer (atmospheric dome shader)
    ├── LightingManager (sun/moon + hemisphere)
    ├── WeatherRenderer (rain, fog density)
    ├── EffectsManager (pooled explosions, pings)
    └── CameraManager (world/periscope/tactical)
```

## 2. Coordinate System

| Engine | Three.js | Notes |
|--------|----------|-------|
| x = east (km) | x = right | Direct mapping |
| y = north (km) | z = -north | Inverted Z |
| depth (m, positive down) | y = -depth/1000 | Negative Y = below surface |
| heading 0° = north, CW | rotation.y = -heading × π/180 + π/2 | Compass to Three.js |

Ocean surface is at y=0. Ships sit on the surface. Submarines go negative Y.

## 3. Shader Pipeline

### Ocean Shader
- **Vertex**: 4-wave Gerstner displacement, normal approximation
- **Fragment**: Depth-based color gradient, foam on crests, specular highlights, distance fog
- **Uniforms**: uTime, uWaveHeight, uWindSpeed, uDeepColor, uShallowColor, uFogDensity, uIsNight

### Sky Shader
- **Vertex**: Pass-through world position
- **Fragment**: Atmospheric gradient, procedural cloud noise, stars at night
- **Uniforms**: uTopColor, uHorizonColor, uCloudCover, uIsNight, uTime

## 4. Procedural Geometry

All 3D models are generated at runtime from primitives — zero external assets:

### Submarine
- Hull: LatheGeometry (capsule profile, 24 segments)
- Conning tower: BoxGeometry with tapered top
- Periscope: CylinderGeometry (animated raise/lower)
- Propeller: 4-blade group (speed-dependent rotation)
- Rudder: BoxGeometry (turn animation)

### Ships (per class)
- Hull: ExtrudeGeometry from parametric Shape (boat profile)
- Merchant: Low bridge + mast
- Cargo: Container stacks (colored boxes) + rear bridge
- Tanker: Cylindrical tanks + rear superstructure
- Destroyer: Bridge tower + gun turrets + barrel + mast
- Frigate: Compact bridge + radar dome + single gun

## 5. Performance Budget

| Metric | Target | Technique |
|--------|--------|-----------|
| Draw calls | < 100 | InstancedMesh, shared materials |
| Triangles | < 500K | LOD, simple geometry |
| Textures | 0 (all procedural) | Shader-based materials |
| Particles | < 3000 | Pool-based, capped |
| FPS | 60 (modern), 30 (low-end) | Adaptive quality |

## 6. Weather Visual Mapping

| Weather | Wave Height | Fog Density | Light Intensity | Sky Color |
|---------|-------------|-------------|-----------------|-----------|
| Clear | 0.3m | 0.002 | 1.2 | Deep blue |
| Cloudy | 0.6m | 0.005 | 0.7 | Muted blue |
| Storm | 2.5m | 0.015 | 0.3 | Dark grey |
| Fog | 0.2m | 0.04 | 0.5 | White-grey |
| Night | 0.4m | 0.008 | 0.15 | Near black |


## V2.3 Addendum — Asset and Cinematic Pass

### Local GLB selection

`SubmarineRenderer` and `ShipRenderer` now consult the V3 local registry through `AssetManager`. The manager validates a local approved path, loads each source GLB once, and clones it into the visual scene. GLB selection does not change the entity transform, heading, visibility, LOD semantic, or gameplay lifecycle. A failed request leaves the previous procedural family active.

### Surface interaction and weather

The ocean fragment pass receives only the existing player position, heading and speed as visual uniforms. It adds a short local stern-foam field aligned to the existing heading, while the underlying Gerstner/wave/weather data remains unchanged. The sky shader adds a broad storm mass and reserved cold rim treatment for weather categories already supplied by the adapter. Neither effect owns weather timing or has access to simulation state.

### Combat, HUD and capture

`EffectsManager` keeps its existing event-owned effect lifetime and uses type-specific palettes: torpedo impacts are warm and brief; depth charges render a colder, wider shockwave and a short vertical water column. In the DOM, `hud--quiet` reduces visual obstruction only when the existing snapshot reports a safe, contact-free, unlocked running state. F12 applies the temporary `cinematic-capture` class, exports the WebGL canvas after a paint, and restores the DOM overlay after 1.6 seconds.
