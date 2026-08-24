# SILENT DEPTH 《深海猎手》 — Visual Style Bible

Version: v1 · Owner: Factory Manager (escalated from designer delegation) · Status: ACCEPTED

## 1. Perspective
- Top-down (bird's-eye), north-up. No camera rotation in v1.
- All sprites drawn as viewed from directly above: hull shapes, wakes, and
  sonar effects read clearly from above.
- World is 2D Euclidean: x=east, y=north. Screen: x→right, y→down (canvas).

## 2. Color palette (muted · military · cold · underwater)
| Role | Hex | Usage |
|---|---|---|
| Deep ocean base | #050a12 | background fill |
| Ocean gradient deep | #0a1626 | open water |
| Ocean gradient mid | #0d2233 | tactical zone |
| Ocean shallow tint | #14303f | coastal/浅海 hint |
| Grid line | #1c3a4d | 5km grid, 18% alpha |
| Range ring | #2e5f74 | sonar/range rings |
| UI panel bg | #0b1520 (88% alpha) | HUD panels |
| UI panel border | #2a4a5e | 1px lines |
| UI text primary | #9fb4c7 | labels, values |
| UI text dim | #5b7385 | hints, units |
| Alert | #d9534f | danger, damage, detection high |
| Warning | #e8a33d | suspicious, low battery |
| Neutral | #5bc0de | player, friendly, sonar |
| Sonar ping | #7fd8d8 | ping wave, contact highlight |
| Enemy surface (detected) | #c0392b | hostile contact glyph |
| Torpedo trail | #e8e8e8 (30% alpha) | wake bubbles |
| Explosion flash | #ffd479 → #ff6b35 | particle gradient |
| Night overlay | #000000 (35-55% alpha) | visibility reduction |
| Fog overlay | #9fb4c7 (12-25% alpha) | fog weather |

## 3. Contrast & outlines
- Low overall contrast; information density via brightness, not saturation.
- Key interactive elements (player sub, selected contact, alerts) get 1px
  bright outline (white 60% alpha) to pop from the dark ocean.
- Contact glyphs: solid shape + thin ring; ring color encodes state
  (UNKNOWN gray → SUSPECTED yellow → CLASSIFIED cyan → TRACKED blue → CONFIRMED red).

## 4. Lighting
- Flat, minimal. No dynamic sun. Night = global overlay + reduced contact range.
- Subtle radial gradient under ships (moonlight-ish, 8% alpha) for depth.

## 5. Scale
- 1 world unit = 1 km. Screen scale: ~8 px/km at default zoom (zoomable 4-16 px/km).
- Submarine sprite ~40 px long on screen at 8 px/km; zoom adjusts sprite scale smoothly.

## 6. Sprite resolution (registry-consistent)
| Class | Canvas draw size | Asset resolution if rasterized |
|---|---|---|
| Small units (torpedo, decoy) | ≤ 24 px | 128×128 |
| Normal units (submarine, merchant, cargo) | ~40-48 px | 256×256 |
| Large units (tanker, destroyer, frigate) | ~56-64 px | 512×512 |
| UI icons | SVG/CSS | vector |
- Never use 1024/1536/2048 raster sprites in v1 (performance, §38).

## 7. UI typography
- Mono family: 'SF Mono' / 'Cascadia Code' / Consolas / monospace fallback.
- Sizes: HUD values 13px, labels 11px, log 12px, menu titles 28px, sub 14px.
- Letterspacing: titles +2px; labels +1px. Uppercase for military feel
  (e.g. "DEPTH 045 M", "SONAR", "CONTACT 03").

## 8. Icon style
- Line icons, 1.5px stroke, rounded caps, muted fill. No gradients on icons.
- Icon set: sonar ping, contact (target + ring), torpedo, battery, hull,
  noise (sound waves), detection (eye), depth (down arrow), pause, settings,
  map, log.

## 9. Animation style
- Subtle, procedural. Ease in-out on UI panels (120ms).
- Sprites: gentle 2-frame roll/bob (no rotation in v1).
- Sonar ping: expanding ring (see particles). Contact glyph blinks when new.
- Numbers tween on change (e.g. speed 12→8 animates 200ms).
- No screen shake except torpedo hit (small, 120ms decay).

## 10. Particle style
- Sonar ping: ring stroke expanding at ~1 km/s, fades 0.9→0 over 1.2s.
- Torpedo wake: 6-10 bubbles/sparks emitted per 0.1s, drift behind, 1.5s life.
- Explosion: 18-24 particles, palette #ffd479→#ff6b35→#7a2f22, 1.2s life,
  gravity none (top-down), deceleration strong.
- Depth charge splash: white ring + 8 droplets, 0.8s.
- Hull creak/battery warning: no particles; UI only.

## 11. Asset consistency checklist (for Asset Engineer)
- [ ] All ship sprites north-up, centered, transparent bg
- [ ] Same outline style & palette family (muted, cold)
- [ ] Resolutions within class limits (128/256/512)
- [ ] Every asset has registry.json entry with sha256 + source=procedural
- [ ] Weather overlays in code (not baked into sprites)
- [ ] No asset exceeds 512×512 in v1

---

## 12. v2 — Modern AI Mission Control (UI v2 · t-023)

The interface (DOM layer L6 + menu screens) was redesigned from the v1
Retro Military Console (deep navy, thin blue borders, ALL-CAPS mono, boxes)
to a **Modern AI Mission Control** surface. **This section supersedes
§2/§7/§8/§9 for the UI layer only** — the v1 canvas palette (§2), sprite
rules (§6), and particle style (§10) remain authoritative for the tactical
map and assets. CSS implementation: `src/style.css` (design tokens).

### 12.1 Design tokens (CSS custom properties)

| Token | Value | Role |
|---|---|---|
| `--color-primary` | `#22d3ee` | brand accent (cyan) — interactive, selection, focus |
| `--color-success` | `#34d399` | running/completed, battery, hits |
| `--color-warning` | `#fbbf24` | low battery, degraded, torpedo misses |
| `--color-error` | `#f87171` | damage, danger, defeat |
| `--color-info` | `#60a5fa` | neutral system info |
| `--color-muted` | `#64748b` | disabled / tertiary |
| `--surface-0` | `#0a0e14` | page background |
| `--surface-1` | `#0e141d` | workspace |
| `--surface-2` | `rgba(19,27,40,.76)` | panel / card (blurred) |
| `--surface-3` | `#1b2534` | raised / interactive |
| `--text-primary` | `#e6edf3` | primary text |
| `--text-secondary` | `#a3b3c6` | secondary text |
| `--text-muted` | `#64748b` | metadata / hints |

### 12.2 Typography (dual-font system)

- **UI text**: sans-serif stack `-apple-system, 'SF Pro Text', Inter, 'Segoe
  UI', Roboto, 'Helvetica Neue', Arial, sans-serif` — sentence case, never
  ALL-CAPS except tiny micro-labels (card titles, technical tags).
- **Technical data only** (logs, IDs, timestamps, numbers, codes, status
  chips): monospace `'SF Mono', 'JetBrains Mono', 'Cascadia Code', Consolas`.

### 12.3 Surface model & hierarchy

Layer stack: Background (`surface-0`) → Workspace (canvas map, `surface-1`)
→ Panel/Card (`surface-2` + `backdrop-filter: blur(14px)`) → Content →
Interactive (`surface-3`). Rounded corners 8–14 px, very faint borders
(`rgba(148,163,184,.1)`), soft shadows, subtle elevation on hover. Borders
are auxiliary; hierarchy comes from size/weight/color/spacing.

Primary (mission name, status chip, workspace, submarine status) → secondary
(progress bars, contacts, fire control) → tertiary (timeline) → metadata
(time, IDs, zoom) — established with type size/weight, not boxes.

### 12.4 Layout (1280×720 target, responsive-ish)

Top bar (brand · mission + status chip · spacer · weather/language/settings)
→ central framed **Mission Workspace** (canvas L0–L5 with a header row:
mission id, timer, zoom hint) → left column (Submarine Status card, Tasks,
Torpedoes) → right column (Contacts, Fire Control) → bottom **Activity
timeline** (severity-dotted event log grouped by phase). The canvas minimap
keeps its v1 bottom-right placement; panels clear it.

### 12.5 Motion

120–200 ms transitions on hover/state; status-chip pulse while RUNNING;
active-objective pulse; progress-bar width transitions. No gratuitous motion.

### 12.6 Interaction states

Visible hover on everything clickable, `:focus-visible` outlines, selected
contact highlight (primary border + tint), primary/secondary/danger button
tokens, disabled states at ~42 % opacity.
