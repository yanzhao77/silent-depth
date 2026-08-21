# SILENT DEPTH 《深海猎手》 — Asset Pipeline (docs/ASSET_PIPELINE.md)

Version: v1 · Owner: Asset Engineer (t-011) · Status: ACCEPTED (asset-gate input)
Upstream: `artifacts/requirements.md` §3 (FR-21) · `docs/VISUAL_STYLE.md` v1 ·
`docs/GAME_ARCHITECTURE.md` §3 / §8 / §12 · ADR-003 (procedural assets)

---

## 1. What this pipeline produces

Every asset in SILENT DEPTH is **generated in code** with the Canvas 2D API —
`src/rendering/sprites.ts`. There are **zero downloaded images and zero
third-party assets** (see `assets/THIRD_PARTY_ASSETS.md`). The pipeline below
is the governance wrapper around that factory: it defines how any asset —
procedural today, external someday — enters the game, is registered, and is
validated.

```
Discover ──► Evaluate ──► License Check ──► Acquire/Generate ──► Process
   ──► Register ──► Validate ──► Integrate
```

| Stage | What happens | Owner | Gate output |
|---|---|---|---|
| 1. Discover | Identify an asset need (e.g. "new ship class sprite", "icon for depth") from FR / UI spec / design review | PM / Design | asset need note |
| 2. Evaluate | Decide the generation strategy using **source priority** (§2) and VISUAL_STYLE fit (style, palette, resolution class) | Asset Engineer | decision + rationale |
| 3. License Check | Run the **license gate** (§3). Procedural / CC0 → auto-approve. Anything Unknown/Copyright → **BLOCK**. | Asset Engineer | gate verdict |
| 4. Acquire/Generate | Procedural: write/extend a pure `draw*(ctx, size, opts)` function in `sprites.ts`. External (future): acquire per §5. | Asset Engineer | generated sprite / acquired file |
| 5. Process | Draw north-up, centered, transparent bg; muted tactical palette; resolution within class limits (128/256/512) | Asset Engineer | processed sprite |
| 6. Register | Add a `SPRITE_MANIFEST` entry in `sprites.ts` and a matching entry in `assets/registry.json` with all FR-21 fields (§4) | Asset Engineer | registry entry |
| 7. Validate | `npm test` (registry completeness, sha256, path security, ship-class coverage, resolution policy) + `npx tsc --noEmit` | QA / Asset Engineer | green tests |
| 8. Integrate | Renderer loads the sprite from the atlas (`getAtlasSprite`) or, for future raster assets, via the registry + sha256 check (§12 GAME_ARCHITECTURE) | Rendering | in-game asset |

## 2. Source priority (FR-21 §3)

When an asset is needed, sources are considered strictly in this order —
procedural is preferred for everything this game renders:

1. **Existing project assets** (reuse what already exists; registry look-up first).
2. **Procedural (generated in code)** ← *current status: 100% of assets*.
   Preferred for ocean, sonar, explosions, trails, particles, UI, map, grid,
   waves, markers, radar/indicators.
3. **AI-generated** (acceptable only for ship sprites, uniform style:
   top-down, tactical 2D, medium detail, muted palette, transparent, north-up).
4. **Verified open** (e.g. CC0 / CC BY with verified provenance + attribution).
5. **Commercial** (last resort; requires budget + licensing record).
6. **Unknown copyright = BLOCK** (never enter the pipeline).

## 3. License gate (FR-21 §3)

Every asset (procedural or external) carries a license verdict before it may be
registered. The gate is enforced for **every** registry entry by
`tests/unit/assets.test.ts` (all current entries must be CC0 + procedural).

| License | Verdict | Requirements |
|---|---|---|
| **CC0** (public domain) | ✅ **Auto-approve** | Register with licenseUrl `https://creativecommons.org/publicdomain/zero/1.0/`, attribution empty. |
| **CC BY** | ⚠️ Approve **+ attribution** | Record author + attribution in registry; show credits. |
| **CC BY-SA** | ⚠️ Approve **+ review** | Attribution + share-alike obligations reviewed by Security/PM; record in registry. |
| **CC BY-NC** | 🚫 Warn / **block commercial** | Not usable in any commercial context; v1 project is non-commercial only with explicit sign-off. |
| **Unknown / Copyright** | 🚫 **BLOCK** | Rejected at stage 3. Never register, never integrate. |

The gate is **conservative by default**: a source without verifiable licensing
is treated as Copyright and blocked, not as "probably fine".

## 4. Registry & sha256 validation (FR-21)

`assets/registry.json` is the single provenance ledger. Schema:

```jsonc
{
  "schema": "silent-depth-asset-registry-v1",
  "generator": "DeepSeek Software Factory — procedural asset factory (t-011)",
  "generatedAt": "<ISO-8601>",
  "licenseGate": "CC0 auto-approve — all entries procedural, zero third-party assets",
  "assets": [
    {
      "id": "sprite-submarine",          // stable unique id (matches SPRITE_MANIFEST id)
      "name": "Submarine (player, white outline)",
      "type": "ship",                    // ship | unit | effect | map | minimap | icon
      "path": "src/rendering/sprites.ts",// LOCAL relative path only — never an external URL
      "source": "procedural",            // provenance
      "author": "DeepSeek Software Factory",
      "license": "CC0",
      "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
      "attribution": "",                 // empty for CC0; filled for CC BY / CC BY-SA
      "sha256": "28ee6236…",             // REAL sha256 of the defining code (sprites.ts)
      "width": 256,                      // atlas canvas px (icon: nominal vector size)
      "height": 256,
      "format": "canvas-2d",             // canvas-2d | svg
      "style": "tactical-2d-muted",
      "version": "1.0.0",
      "createdAt": "<ISO-8601>"
    }
    // … 34 entries total
  ]
}
```

**How sha256 works here:** every entry's `sha256` is the sha256 of the file that
*defines* the asset — `src/rendering/sprites.ts` for all procedural assets
(DD-02 in sprites.ts). It is computed with `node:crypto`, never hand-written:

```bash
node -e "const c=require('crypto');const fs=require('fs');\
console.log(c.createHash('sha256').update(fs.readFileSync('src/rendering/sprites.ts')).digest('hex'))"
```

**Validation** (`tests/unit/assets.test.ts`, run by `npm test`):
- every entry has exactly the FR-21 fields, no missing keys;
- every `sha256` is a 64-char hex string **and equals** the hash of
  `sprites.ts` as read from disk — a tampered registry fails;
- every `path` is a local relative path (no `http`, `://`, leading `/`, drive letters);
- every ship class in `config/balance.json`
  (`sonar.classification.types`) has a matching `sprite-*` entry;
- resolution policy respected: raster entries are 128/256/512, nothing > 512;
- registry and `SPRITE_MANIFEST` (the in-code manifest) are **bidirectionally
  consistent** (same ids, same width/height/format);
- license gate: every entry is CC0 + procedural + correct licenseUrl.

**Runtime integration (future raster assets):** the renderer must, before
drawing, resolve the registry entry for the asset id, verify the file's sha256
against the registry value, and reject on mismatch. v1 never does this because
there are no raster files — the gate is pre-built (GAME_ARCHITECTURE §12).

## 5. Resolution policy (VISUAL_STYLE §6)

| Class | Atlas canvas (px) | On-screen size @8px/km | Examples |
|---|---|---|---|
| Small units | **128×128** | ≤ 24 px | torpedo, decoy, effects, rings, minimap, map tile |
| Normal units | **256×256** | ~40–48 px | submarine, merchant, cargo |
| Large units | **512×512** | ~56–64 px | tanker, destroyer, frigate |
| UI icons | vector (nominal 32×32) | — | 12 line icons |

- **Never** 1024/1536/2048 raster sprites in v1 (performance, VISUAL_STYLE §6).
- The on-screen size is stored per sprite as `renderScalePx` in
  `SPRITE_MANIFEST`; the renderer scales the atlas sprite to that size at the
  default zoom and scales smoothly 4–16 px/km (DD-01 in sprites.ts).
- Weather / night / fog overlays are runtime full-screen overlays — **never
  baked into sprites** (VISUAL_STYLE §11 checklist).

## 6. Node compatibility of the sprite factory

`src/rendering/sprites.ts` is importable in Node.js (vitest registry tests
import it there). It never touches the DOM at import time — DOM types appear
only in type positions, and no canvas is created at module scope. Creating an
atlas canvas requires either a browser (`document.createElement('canvas')`) or
`injectCanvasFactory(fn)` in Node. The pure drawing functions
(`draw*(ctx, size, opts)`), the manifest (`SPRITE_MANIFEST`), the palette
(`PALETTE`) and contact-state colors (`CONTACT_STATE_COLORS`) work anywhere.

## 7. How to add a FUTURE EXTERNAL asset safely (gate + attribution)

1. **Discover** the need → write it as a FR-21 note.
2. **Evaluate** the source (priority order §2) — external only if procedural
   cannot satisfy it and the source is verifiable.
3. **License gate** (§3): CC0 auto-approve; CC BY → approve + attribution;
   CC BY-SA → approve + review; CC BY-NC → block-commercial; Unknown/Copyright
   → **blocked**.
4. **Acquire** the file into `assets/units|effects|ui|backgrounds|audio/` —
   **local relative path only**, never a hotlinked URL (NFR-2 offline, §12 security).
5. **Process** to the resolution class (128/256/512) and VISUAL_STYLE
   (north-up, muted, transparent).
6. **Register** in `assets/registry.json` with ALL fields: real sha256 of the
   **file**, real source/author, license, licenseUrl, attribution (name +
   source URL when required), createdAt.
7. **Validate**: `npm test` + `npx tsc --noEmit`. The test suite will reject a
   registry whose sha256 doesn't match the file and whose license isn't CC0 —
   for external assets the CC0 assertion must be relaxed **only after** the
   license gate review is recorded (update the gate test to an allowlist, e.g.
   CC0 + CC BY with attribution present).
8. **Integrate** through the registry: resolve entry → verify sha256 → draw.
9. **Update `assets/THIRD_PARTY_ASSETS.md`** — it must always truthfully state
   the third-party count and attribution list; it currently states ZERO.

## 8. Current inventory (34 assets)

| Category | Count | ids |
|---|---|---|
| Ship sprites (incl. player sub) | 6 | `sprite-submarine`, `sprite-merchant`, `sprite-cargo`, `sprite-tanker`, `sprite-destroyer`, `sprite-frigate` |
| Small units | 2 | `sprite-torpedo`, `sprite-decoy` |
| Effects / particles | 10 | `fx-sonar-ping`, `fx-explosion-particle`, `fx-torpedo-wake-bubble`, `fx-depth-charge-splash`, `fx-contact-uncertainty-ellipse`, `fx-contact-ring-{UNKNOWN,SUSPECTED,CLASSIFIED,TRACKED,CONFIRMED}` |
| Map / minimap | 4 | `map-grid-tile`, `minimap-frame`, `minimap-sub-icon`, `minimap-contact-icon` |
| UI icons | 12 | `icon-{sonar,contact,torpedo,battery,hull,noise,detection,depth,pause,settings,map,log}` |

All: `source=procedural`, `author=DeepSeek Software Factory`, `license=CC0`,
`licenseUrl=https://creativecommons.org/publicdomain/zero/1.0/`,
`attribution=""`, `format=canvas-2d|svg`, `style=tactical-2d-muted`,
`version=1.0.0`.

---

*Next stage input: `tests/unit/assets.test.ts` (asset-gate evidence) and
`src/rendering/renderer.ts` (consumes the atlas via `getAtlasSprite`).*
