# SILENT DEPTH V2.0 — Asset Pipeline

| Field | Value |
|---|---|
| Project | SILENT DEPTH V2.0 《深海猎手》 CINEMATIC TACTICAL SUBMARINE |
| Document | V2_ASSETS.md |
| Status | ACTIVE |

---

## 1. Asset Philosophy

V2 maintains the V1 principle: **zero external assets, zero CDN, zero copyrighted content**.

All 3D geometry is procedurally generated at runtime from mathematical primitives. All textures are shader-generated. All audio remains WebAudio procedural synthesis.

## 2. Procedural Geometry Registry

| Asset ID | Type | Source | License | Description |
|----------|------|--------|---------|-------------|
| proc-submarine-v2 | geometry | procedural | CC0 | Player submarine (hull, tower, periscope, propeller, rudder) |
| proc-merchant-v2 | geometry | procedural | CC0 | Merchant ship hull + superstructure |
| proc-cargo-v2 | geometry | procedural | CC0 | Cargo ship with container stacks |
| proc-tanker-v2 | geometry | procedural | CC0 | Tanker with cylindrical tanks |
| proc-destroyer-v2 | geometry | procedural | CC0 | Destroyer with turrets and mast |
| proc-frigate-v2 | geometry | procedural | CC0 | Frigate with radar dome |
| proc-ocean-v2 | shader | procedural | CC0 | Gerstner wave ocean surface |
| proc-sky-v2 | shader | procedural | CC0 | Atmospheric sky dome |

## 3. Material System

All materials use `THREE.MeshStandardMaterial` (PBR):

| Material | Color | Roughness | Metalness | Usage |
|----------|-------|-----------|-----------|-------|
| Hull dark | #2a3040 | 0.6 | 0.3 | Submarine hull |
| Tower | #354050 | 0.5 | 0.4 | Conning tower |
| Periscope | #506070 | 0.3 | 0.6 | Periscope tube |
| Propeller | #b08030 | 0.4 | 0.7 | Bronze propeller |
| Ship hull | varies | 0.7 | 0.2 | Per-class hull color |
| Superstructure | #8a8a8a | 0.5 | 0.3 | Bridge/mast |
| Containers | varied | 0.8 | 0.0 | Red/blue/green/yellow |

## 4. No External Dependencies

- No GLTF/GLB files loaded at runtime
- No texture images loaded at runtime
- No font files loaded at runtime
- No CDN URLs referenced anywhere
- Works fully offline from `file://` protocol
- All assets generated in-browser on first mission start

## 5. Asset Lifecycle

1. **Init**: Three.js renderer created on first `startMission()`
2. **Generate**: Procedural geometry built synchronously (~5ms total)
3. **Cache**: Geometry cached per ship class (clone for instances)
4. **Dispose**: All geometry/materials disposed on mission abort/end
5. **Recreate**: Fresh geometry on next mission start


## V2.3 Addendum — Local GLB Asset Pipeline

V2.3 extends the offline-first policy: approved GLB files may now be loaded from **local** `public/assets/v3/models/` paths only. They are never requested from a CDN or a runtime HTTP source. The V3 registry must record the local path, project-owned origin, CC0 license record, SHA-256 digest, LOD number, measured triangle count, material intent and the pre-existing procedural fallback. `AssetManager` rejects remote, absolute and traversal paths before the loader sees them.

| V2.3 asset family | LODs | Source | Runtime behaviour | Failure behaviour |
|---|---|---|---|---|
| Hero submarine | 0–3 | Project-owned Blender generator in `tools/assets/` | Local GLB scene cached then cloned by `SubmarineRenderer` | Existing procedural submarine family |
| Destroyer | 1–3 | Project-owned Blender generator in `tools/assets/` | Local GLB scene cached then cloned by `ShipRenderer` | Existing procedural destroyer family |
| Tanker | 1–3 | Project-owned Blender generator in `tools/assets/` | Local GLB scene cached then cloned by `ShipRenderer` | Existing procedural tanker family |

Project-owned Blender scripts and exported GLBs are source-controlled together so a model digest can be reproduced and audited. The GLB files use material groups for paint, wet hull, deck, glass and metal; they do not authorize undocumented external texture reuse. Future artist-authored texture packs must be recorded as separate local assets under the same registry and licensing gate.
