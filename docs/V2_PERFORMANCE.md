# SILENT DEPTH V2.0 — Performance Strategy

| Field | Value |
|---|---|
| Project | SILENT DEPTH V2.0 《深海猎手》 CINEMATIC TACTICAL SUBMARINE |
| Document | V2_PERFORMANCE.md |
| Status | ACTIVE |

---

## 1. Targets

| Metric | Desktop (modern) | Laptop (integrated GPU) | Low-end |
|--------|------------------|------------------------|---------|
| FPS | 60 | 45-60 | 30+ |
| Draw calls | < 80 | < 80 | < 80 |
| Triangles | < 500K | < 500K | < 200K |
| Memory | < 256MB | < 256MB | < 128MB |
| Load time | < 2s | < 3s | < 5s |

## 2. Techniques Applied

### Geometry
- All procedural (no file I/O, no network)
- Low poly counts: submarine ~2K tris, ships ~1-3K tris each
- Ocean plane: 256×256 segments (131K tris) — could be reduced to 128×128 for low-end
- Shared geometry via clone() for same-class ships

### Materials
- MeshStandardMaterial (PBR) with minimal texture maps (all color-only)
- No texture images — all colors are uniform values
- Shared materials per ship class

### Shaders
- Ocean: single vertex+fragment shader pair
- Sky: single vertex+fragment shader pair
- No post-processing pipeline in initial release (can be added later)

### Particles & Effects
- Object pooling: pre-allocated arrays, no per-frame new()
- Rain: 3000 particles max, simple PointsMaterial
- Explosions: 30 particles each, pooled
- Sonar pings: ring mesh, scaled per frame

### Rendering
- WebGL2 required (Three.js default)
- Shadow maps: 1024×1024, single directional light
- Tone mapping: ACES Filmic (built into Three.js)
- Pixel ratio capped at 2× (retina displays)

### Memory
- No texture uploads (all procedural)
- Geometry disposed on mission end
- Effect pools recycled, never growing

## 3. Adaptive Quality (Future)

A performance mode can be added that:
- Reduces ocean segments to 128×128
- Disables shadows
- Reduces rain particle count to 1000
- Simplifies sky shader (no clouds)
- Disables fog

Settings would be exposed via `save.settings.video.quality`: `'high' | 'medium' | 'low'`.

## 4. Bundle Size

| Component | Size (gzipped) |
|-----------|---------------|
| Three.js | ~148 KB |
| Game code | ~75 KB |
| CSS | ~6 KB |
| **Total** | **~229 KB** |

No external assets loaded at runtime. Total download is the HTML + JS + CSS bundle.


## V2.3 Addendum — Local GLB and Quality Budget

V2.3 changes the asset cost model from runtime-only primitives to small, local GLB families. `AssetManager` caches each source GLB once and gives renderers clones; source scenes and materials are released during disposal. The Hero Submarine uses four distance levels, while Destroyer and Tanker use three. Existing quality presets now control the render-path cost envelope: pixel ratio, shadow enable/map size, ocean segmentation, rain count, combat particle budget, post-processing and LOD-distance multiplier.

| Quality | Pixel ratio ceiling | Shadows | Ocean segments | Rain cap | Particle budget | LOD multiplier |
|---|---:|---|---:|---:|---:|---:|
| LOW | 1.0 | Off | 128 | 1,500 | 15 | 0.5 |
| MEDIUM | 1.5 | 1,024 | 200 | 2,500 | 30 | 0.8 |
| HIGH | 2.0 | 2,048 | 300 | 4,000 | 40 | 1.0 |
| ULTRA | 2.0 | 4,096 | 400 | 6,000 | 60 | 1.5 |

The V2.3 build is compilation- and regression-tested, but the automated Chromium clock is not a reliable player-hardware FPS measurement. Release performance sign-off still requires Chrome Performance recordings for M03 convoy and M04 storm on a target desktop and an integrated GPU, showing actual frame time, draw calls, GPU memory and asset-load timing.
