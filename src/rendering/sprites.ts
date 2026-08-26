/**
 * SILENT DEPTH 《深海猎手》 — Procedural sprite factory (t-011 · ADR-003 · FR-21)
 *
 * All art is generated in code with the Canvas 2D API. Zero downloaded images,
 * zero third-party assets, zero licensing risk. Every sprite is produced by a
 * PURE function: draw*(ctx, size, opts). The only inputs are the drawing
 * context, the canvas size and an options object (palette / variant / color).
 * No module-level mutable state is read or written while drawing; drawing is
 * fully deterministic (no Math.random anywhere).
 *
 * ── Node compatibility (IMPORTANT) ─────────────────────────────────────────
 * This module is importable in Node.js (the registry tests import it there).
 * It never touches the DOM at import time: DOM types appear only in TYPE
 * positions (erased at compile time) and no canvas is created at module
 * scope. Canvas creation is deferred and guarded by a runtime check:
 *
 *   • Browser: getAtlasSprite() / createAtlasSprite() obtain canvases from
 *     the default factory (document.createElement('canvas')).
 *   • Node (vitest / headless): importing the module, reading SPRITE_MANIFEST
 *     / PALETTE / CONTACT_STATE_COLORS and calling the pure draw*() functions
 *     all work without a canvas. Creating an actual canvas requires
 *     injectCanvasFactory(fn) first; without it a clear error is thrown.
 *     Registry tests use only the manifest / data APIs — no canvas needed.
 *
 * ── DESIGN DECISIONS (recorded for Asset Engineer review) ──────────────────
 * DD-01  Atlas canvas resolution = class resolution per VISUAL_STYLE §6
 *        (128 / 256 / 512). The on-screen size at the default 8 px/km zoom is
 *        renderScalePx in the manifest (VISUAL_STYLE §5/§6: submarine ~40 px,
 *        large ships 56–64 px, small units ≤ 24 px). The renderer scales the
 *        atlas sprite to renderScalePx screen pixels.
 * DD-02  Registry `path` for procedural assets = the defining code file
 *        (src/rendering/sprites.ts); registry `sha256` = sha256 of that file
 *        (computed with node:crypto, verified by tests/unit/assets.test.ts).
 * DD-03  Contact state ring colors follow VISUAL_STYLE §3 encoding:
 *        UNKNOWN gray → SUSPECTED yellow → CLASSIFIED cyan → TRACKED blue →
 *        CONFIRMED red. Five registry entries, one per state.
 * DD-04  Weather / night / fog overlays are NOT baked into sprites
 *        (VISUAL_STYLE §11 checklist) — they are runtime full-screen
 *        overlays owned by the renderer, never by the asset factory.
 * DD-05  UI icons are drawn as vector-like path commands (SVG-path-like
 *        canvas drawing functions) at a nominal 32×32, format "svg".
 */

// ---------------------------------------------------------------------------
// Palette (VISUAL_STYLE.md §2 — muted · military · cold · underwater)
// ---------------------------------------------------------------------------

export interface PaletteColors {
  oceanBase: string;
  oceanDeep: string;
  oceanMid: string;
  oceanShallow: string;
  gridLine: string;
  rangeRing: string;
  uiPanelBg: string;
  uiPanelBorder: string;
  uiTextPrimary: string;
  uiTextDim: string;
  alert: string;
  warning: string;
  neutral: string;
  sonarPing: string;
  enemySurface: string;
  torpedoTrail: string;
  explosionFlash: string;
  explosionHot: string;
  explosionEmber: string;
  outlineBright: string;
  outlineDim: string;
  hullFill: string;
  hullDark: string;
  hullLight: string;
  deckFill: string;
  stackFill: string;
}

/** Canonical palette — single source of truth mirroring VISUAL_STYLE.md §2. */
export const PALETTE: PaletteColors = {
  oceanBase: '#050a12',
  oceanDeep: '#0a1626',
  oceanMid: '#0d2233',
  oceanShallow: '#14303f',
  gridLine: '#1c3a4d',
  rangeRing: '#2e5f74',
  uiPanelBg: 'rgba(11,21,32,0.88)',
  uiPanelBorder: '#2a4a5e',
  uiTextPrimary: '#9fb4c7',
  uiTextDim: '#5b7385',
  alert: '#d9534f',
  warning: '#e8a33d',
  neutral: '#5bc0de',
  sonarPing: '#7fd8d8',
  enemySurface: '#c0392b',
  torpedoTrail: 'rgba(232,232,232,0.30)',
  explosionFlash: '#ffd479',
  explosionHot: '#ff6b35',
  explosionEmber: '#7a2f22',
  outlineBright: 'rgba(255,255,255,0.60)',
  outlineDim: 'rgba(255,255,255,0.25)',
  hullFill: '#5a6a7a', // 现代军用灰 - 主船体颜色
  hullDark: '#3d4d5d', // 深灰色 - 阴影部分
  hullLight: '#7a8a9a', // 浅灰色 - 高光部分
  deckFill: '#4a5a6a', // 甲板灰色
  stackFill: '#3a4a5a', // 指挥塔灰色
};

/** Merge an optional palette override onto the canonical palette (pure). */
export function resolvePalette(partial?: Partial<PaletteColors>): PaletteColors {
  if (!partial) return PALETTE;
  const out: PaletteColors = { ...PALETTE };
  for (const key of Object.keys(PALETTE) as (keyof PaletteColors)[]) {
    const value = partial[key];
    if (typeof value === 'string') out[key] = value;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Contact states (VISUAL_STYLE §3 ring encoding)
// ---------------------------------------------------------------------------

export type ContactState = 'UNKNOWN' | 'SUSPECTED' | 'CLASSIFIED' | 'TRACKED' | 'CONFIRMED';

export const CONTACT_STATES: readonly ContactState[] = [
  'UNKNOWN',
  'SUSPECTED',
  'CLASSIFIED',
  'TRACKED',
  'CONFIRMED',
];

export const CONTACT_STATE_COLORS: Record<ContactState, string> = {
  UNKNOWN: '#8a9aa8', // gray
  SUSPECTED: '#e8a33d', // yellow (warning)
  CLASSIFIED: '#5bc0de', // cyan (neutral / sonar)
  TRACKED: '#5b8fd9', // blue
  CONFIRMED: '#d9534f', // red (alert)
};

/** Pure lookup — defaults to UNKNOWN for unknown values. */
export function contactStateColor(state: ContactState): string {
  return CONTACT_STATE_COLORS[state] ?? CONTACT_STATE_COLORS.UNKNOWN;
}

// ---------------------------------------------------------------------------
// Sprite kinds & manifest (single source of truth for assets/registry.json)
// ---------------------------------------------------------------------------

export type SpriteKind =
  // units / ships
  | 'submarine'
  | 'merchant'
  | 'cargo'
  | 'tanker'
  | 'destroyer'
  | 'frigate'
  | 'torpedo'
  | 'decoy'
  // effects / particles
  | 'sonarPing'
  | 'explosionParticle'
  | 'torpedoWakeBubble'
  | 'depthChargeSplash'
  | 'contactUncertaintyEllipse'
  | 'contactRing'
  // map / minimap
  | 'mapGridTile'
  | 'minimapFrame'
  | 'minimapSubIcon'
  | 'minimapContactIcon'
  // UI icons
  | 'uiSonar'
  | 'uiContact'
  | 'uiTorpedo'
  | 'uiBattery'
  | 'uiHull'
  | 'uiNoise'
  | 'uiDetection'
  | 'uiDepth'
  | 'uiPause'
  | 'uiSettings'
  | 'uiMap'
  | 'uiLog';

export type SpriteFormat = 'canvas-2d' | 'svg';
export type SpriteType = 'ship' | 'unit' | 'effect' | 'map' | 'minimap' | 'icon';

export interface SpriteManifestEntry {
  /** Stable registry id, e.g. "sprite-submarine". */
  id: string;
  kind: SpriteKind;
  name: string;
  type: SpriteType;
  format: SpriteFormat;
  /** Atlas canvas width (px). For svg icons: nominal vector size. */
  width: number;
  height: number;
  /** On-screen size (px) at default 8 px/km zoom; 0 = not world-anchored. */
  renderScalePx: number;
  /** Variant discriminator, e.g. contactRing state. */
  variant?: ContactState;
}

export const SPRITE_MANIFEST: readonly SpriteManifestEntry[] = [
  // ---- ship sprites (north-up, centered, transparent bg) ----
  {
    id: 'sprite-submarine',
    kind: 'submarine',
    name: 'Submarine (player, white outline)',
    type: 'ship',
    format: 'canvas-2d',
    width: 256,
    height: 256,
    renderScalePx: 56,
  },
  {
    id: 'sprite-merchant',
    kind: 'merchant',
    name: 'Merchant — tramp steamer',
    type: 'ship',
    format: 'canvas-2d',
    width: 256,
    height: 256,
    renderScalePx: 46,
  },
  {
    id: 'sprite-cargo',
    kind: 'cargo',
    name: 'Cargo — container ship',
    type: 'ship',
    format: 'canvas-2d',
    width: 256,
    height: 256,
    renderScalePx: 48,
  },
  {
    id: 'sprite-tanker',
    kind: 'tanker',
    name: 'Tanker — long-haul tanker',
    type: 'ship',
    format: 'canvas-2d',
    width: 512,
    height: 512,
    renderScalePx: 64,
  },
  {
    id: 'sprite-destroyer',
    kind: 'destroyer',
    name: 'Destroyer — fast escort',
    type: 'ship',
    format: 'canvas-2d',
    width: 512,
    height: 512,
    renderScalePx: 60,
  },
  {
    id: 'sprite-frigate',
    kind: 'frigate',
    name: 'Frigate — compact escort',
    type: 'ship',
    format: 'canvas-2d',
    width: 512,
    height: 512,
    renderScalePx: 54,
  },
  // ---- small units ----
  {
    id: 'sprite-torpedo',
    kind: 'torpedo',
    name: 'Torpedo (north-up, heading = travel)',
    type: 'unit',
    format: 'canvas-2d',
    width: 128,
    height: 128,
    renderScalePx: 20,
  },
  {
    id: 'sprite-decoy',
    kind: 'decoy',
    name: 'Decoy — noise-maker canister',
    type: 'unit',
    format: 'canvas-2d',
    width: 128,
    height: 128,
    renderScalePx: 16,
  },
  // ---- effects / particles ----
  {
    id: 'fx-sonar-ping',
    kind: 'sonarPing',
    name: 'Sonar ping ring (expand frame)',
    type: 'effect',
    format: 'canvas-2d',
    width: 128,
    height: 128,
    renderScalePx: 0,
  },
  {
    id: 'fx-explosion-particle',
    kind: 'explosionParticle',
    name: 'Explosion particle (flash gradient)',
    type: 'effect',
    format: 'canvas-2d',
    width: 128,
    height: 128,
    renderScalePx: 0,
  },
  {
    id: 'fx-torpedo-wake-bubble',
    kind: 'torpedoWakeBubble',
    name: 'Torpedo wake bubble',
    type: 'effect',
    format: 'canvas-2d',
    width: 128,
    height: 128,
    renderScalePx: 0,
  },
  {
    id: 'fx-depth-charge-splash',
    kind: 'depthChargeSplash',
    name: 'Depth charge splash (ring + droplets)',
    type: 'effect',
    format: 'canvas-2d',
    width: 128,
    height: 128,
    renderScalePx: 0,
  },
  {
    id: 'fx-contact-uncertainty-ellipse',
    kind: 'contactUncertaintyEllipse',
    name: 'Contact uncertainty ellipse (dashed)',
    type: 'effect',
    format: 'canvas-2d',
    width: 128,
    height: 128,
    renderScalePx: 0,
  },
  {
    id: 'fx-contact-ring-UNKNOWN',
    kind: 'contactRing',
    name: 'Contact ring — UNKNOWN (gray)',
    type: 'effect',
    format: 'canvas-2d',
    width: 128,
    height: 128,
    renderScalePx: 0,
    variant: 'UNKNOWN',
  },
  {
    id: 'fx-contact-ring-SUSPECTED',
    kind: 'contactRing',
    name: 'Contact ring — SUSPECTED (yellow)',
    type: 'effect',
    format: 'canvas-2d',
    width: 128,
    height: 128,
    renderScalePx: 0,
    variant: 'SUSPECTED',
  },
  {
    id: 'fx-contact-ring-CLASSIFIED',
    kind: 'contactRing',
    name: 'Contact ring — CLASSIFIED (cyan)',
    type: 'effect',
    format: 'canvas-2d',
    width: 128,
    height: 128,
    renderScalePx: 0,
    variant: 'CLASSIFIED',
  },
  {
    id: 'fx-contact-ring-TRACKED',
    kind: 'contactRing',
    name: 'Contact ring — TRACKED (blue)',
    type: 'effect',
    format: 'canvas-2d',
    width: 128,
    height: 128,
    renderScalePx: 0,
    variant: 'TRACKED',
  },
  {
    id: 'fx-contact-ring-CONFIRMED',
    kind: 'contactRing',
    name: 'Contact ring — CONFIRMED (red)',
    type: 'effect',
    format: 'canvas-2d',
    width: 128,
    height: 128,
    renderScalePx: 0,
    variant: 'CONFIRMED',
  },
  // ---- map / minimap ----
  {
    id: 'map-grid-tile',
    kind: 'mapGridTile',
    name: 'Map grid tile (5km grid, 18% alpha)',
    type: 'map',
    format: 'canvas-2d',
    width: 128,
    height: 128,
    renderScalePx: 0,
  },
  {
    id: 'minimap-frame',
    kind: 'minimapFrame',
    name: 'Minimap frame (panel bg + border)',
    type: 'minimap',
    format: 'canvas-2d',
    width: 128,
    height: 128,
    renderScalePx: 0,
  },
  {
    id: 'minimap-sub-icon',
    kind: 'minimapSubIcon',
    name: 'Minimap player-submarine icon',
    type: 'minimap',
    format: 'canvas-2d',
    width: 128,
    height: 128,
    renderScalePx: 0,
  },
  {
    id: 'minimap-contact-icon',
    kind: 'minimapContactIcon',
    name: 'Minimap contact blip icon',
    type: 'minimap',
    format: 'canvas-2d',
    width: 128,
    height: 128,
    renderScalePx: 0,
  },
  // ---- UI icons (vector-like paths, VISUAL_STYLE §8) ----
  {
    id: 'icon-sonar',
    kind: 'uiSonar',
    name: 'UI icon — sonar',
    type: 'icon',
    format: 'svg',
    width: 32,
    height: 32,
    renderScalePx: 0,
  },
  {
    id: 'icon-contact',
    kind: 'uiContact',
    name: 'UI icon — contact',
    type: 'icon',
    format: 'svg',
    width: 32,
    height: 32,
    renderScalePx: 0,
  },
  {
    id: 'icon-torpedo',
    kind: 'uiTorpedo',
    name: 'UI icon — torpedo',
    type: 'icon',
    format: 'svg',
    width: 32,
    height: 32,
    renderScalePx: 0,
  },
  {
    id: 'icon-battery',
    kind: 'uiBattery',
    name: 'UI icon — battery',
    type: 'icon',
    format: 'svg',
    width: 32,
    height: 32,
    renderScalePx: 0,
  },
  {
    id: 'icon-hull',
    kind: 'uiHull',
    name: 'UI icon — hull integrity',
    type: 'icon',
    format: 'svg',
    width: 32,
    height: 32,
    renderScalePx: 0,
  },
  {
    id: 'icon-noise',
    kind: 'uiNoise',
    name: 'UI icon — noise',
    type: 'icon',
    format: 'svg',
    width: 32,
    height: 32,
    renderScalePx: 0,
  },
  {
    id: 'icon-detection',
    kind: 'uiDetection',
    name: 'UI icon — detection',
    type: 'icon',
    format: 'svg',
    width: 32,
    height: 32,
    renderScalePx: 0,
  },
  {
    id: 'icon-depth',
    kind: 'uiDepth',
    name: 'UI icon — depth',
    type: 'icon',
    format: 'svg',
    width: 32,
    height: 32,
    renderScalePx: 0,
  },
  {
    id: 'icon-pause',
    kind: 'uiPause',
    name: 'UI icon — pause',
    type: 'icon',
    format: 'svg',
    width: 32,
    height: 32,
    renderScalePx: 0,
  },
  {
    id: 'icon-settings',
    kind: 'uiSettings',
    name: 'UI icon — settings',
    type: 'icon',
    format: 'svg',
    width: 32,
    height: 32,
    renderScalePx: 0,
  },
  {
    id: 'icon-map',
    kind: 'uiMap',
    name: 'UI icon — map',
    type: 'icon',
    format: 'svg',
    width: 32,
    height: 32,
    renderScalePx: 0,
  },
  {
    id: 'icon-log',
    kind: 'uiLog',
    name: 'UI icon — event log',
    type: 'icon',
    format: 'svg',
    width: 32,
    height: 32,
    renderScalePx: 0,
  },
];

/** Look up a manifest entry by registry id (pure). */
export function getManifestEntry(id: string): SpriteManifestEntry | undefined {
  return SPRITE_MANIFEST.find((entry) => entry.id === id);
}

// ---------------------------------------------------------------------------
// Canvas factory (Node guard) + atlas cache
// ---------------------------------------------------------------------------

export type CanvasFactory = () => HTMLCanvasElement;

let canvasFactory: CanvasFactory | null = null;

/**
 * Inject a canvas factory for Node / headless / test environments.
 * Pass null to restore the default browser behaviour (document-based).
 */
export function injectCanvasFactory(factory: CanvasFactory | null): void {
  canvasFactory = factory;
}

function resolveCanvasFactory(): CanvasFactory {
  if (canvasFactory) return canvasFactory;
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    return (): HTMLCanvasElement => document.createElement('canvas');
  }
  throw new Error(
    '[sprites] No canvas factory available. In Node, call injectCanvasFactory(fn) ' +
      'before creating atlas sprites, or use only the pure draw*/manifest APIs.',
  );
}

const atlasCache = new Map<string, HTMLCanvasElement>();

/** Clear the sprite atlas cache (e.g. on palette change / asset reload). */
export function clearAtlasCache(): void {
  atlasCache.clear();
}

function atlasKey(kind: SpriteKind, size: number, opts: DrawOpts | undefined): string {
  return `${kind}:${size}:${opts?.variant ?? ''}:${opts?.color ?? ''}`;
}

export interface DrawOpts {
  /** Partial palette override (defaults to the canonical PALETTE). */
  palette?: Partial<PaletteColors>;
  /** Variant discriminator (e.g. contactRing state). */
  variant?: string;
  /** Primary stroke color override (icons / rings / lines). */
  color?: string;
  /** Global alpha override for linework (e.g. grid tiles). */
  alpha?: number;
  /** Grid cell size in px (drawMapGrid). */
  cellPx?: number;
}

/**
 * Create (or fetch from cache) an atlas sprite for (kind, size, opts).
 * Canvas creation is guarded: browser default factory, or an injected
 * factory in Node. The cache is keyed by (kind, size, variant, color).
 */
export function getAtlasSprite(kind: SpriteKind, size: number, opts?: DrawOpts): HTMLCanvasElement {
  const key = atlasKey(kind, size, opts);
  const cached = atlasCache.get(key);
  if (cached) return cached;
  const sprite = createAtlasSprite(kind, size, opts);
  atlasCache.set(key, sprite);
  return sprite;
}

/** Unconditionally create a fresh atlas sprite (bypasses the cache). */
export function createAtlasSprite(
  kind: SpriteKind,
  size: number,
  opts?: DrawOpts,
): HTMLCanvasElement {
  const factory = resolveCanvasFactory();
  const canvas = factory();
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('[sprites] Failed to acquire 2d context for atlas sprite');
  drawSprite(ctx, kind, size, opts);
  return canvas;
}

// ---------------------------------------------------------------------------
// Drawing helpers (pure)
// ---------------------------------------------------------------------------

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.arcTo(x + w, y, x + w, y + radius, radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
  ctx.lineTo(x + radius, y + h);
  ctx.arcTo(x, y + h, x, y + h - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}

interface LineStyle {
  color: string;
  width: number;
  alpha?: number;
  dash?: readonly number[];
}

function strokeLine(ctx: CanvasRenderingContext2D, style: LineStyle): void {
  ctx.save();
  ctx.strokeStyle = style.color;
  ctx.lineWidth = style.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (style.alpha !== undefined) ctx.globalAlpha = style.alpha;
  if (style.dash !== undefined) ctx.setLineDash(style.dash as number[]);
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Ship sprites — north-up, centered, transparent bg, muted palette
// ---------------------------------------------------------------------------

/** Base hull: blunt-nosed vessel with rounded stern, drawn along -y (north-up). */
function hullPath(
  ctx: CanvasRenderingContext2D,
  u: number,
  opts: { bowY: number; sternY: number; halfWidth: number },
): void {
  const cx = 50 * u;
  const { bowY, sternY, halfWidth } = opts;
  const hw = halfWidth * u;
  ctx.beginPath();
  // bow (top) — slightly pointed, rounded nose
  ctx.moveTo(cx, bowY * u);
  ctx.quadraticCurveTo(cx - hw * 0.55, bowY * u + hw * 0.45, cx - hw, bowY * u + hw * 1.1);
  // port side down to stern
  ctx.lineTo(cx - hw, sternY * u - hw * 0.55);
  ctx.quadraticCurveTo(cx - hw, sternY * u, cx - hw * 0.55, sternY * u + hw * 0.5);
  // rounded stern
  ctx.quadraticCurveTo(cx, sternY * u + hw * 1.0, cx + hw * 0.55, sternY * u + hw * 0.5);
  ctx.quadraticCurveTo(cx + hw, sternY * u, cx + hw, sternY * u - hw * 0.55);
  // starboard side up to bow
  ctx.lineTo(cx + hw, bowY * u + hw * 1.1);
  ctx.quadraticCurveTo(cx + hw * 0.55, bowY * u + hw * 0.45, cx, bowY * u);
  ctx.closePath();
}

function fillHull(
  ctx: CanvasRenderingContext2D,
  p: PaletteColors,
  u: number,
  bowY: number,
  sternY: number,
  halfWidth: number,
): void {
  hullPath(ctx, u, { bowY, sternY, halfWidth });
  ctx.fillStyle = p.hullFill;
  ctx.fill();
  ctx.strokeStyle = p.hullDark;
  ctx.lineWidth = Math.max(1, u * 0.55);
  ctx.stroke();
}

/** 1px outline pass — outlineBright for the player sub, outlineDim for enemies. */
function strokeOutline(ctx: CanvasRenderingContext2D, color: string, u: number): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, u * 0.6);
  ctx.stroke();
}

function fillRectRounded(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string,
): void {
  roundRectPath(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
}

/**
 * Submarine hull planform (t-028f redesign): slender teardrop silhouette of a
 * modern attack submarine — rounded bow, parallel mid body, tapered stern
 * cone. Bow 8 → stern 93.5, max half-width 7.4 (≈ 5.8:1 length-to-beam).
 */
function subHullPath(ctx: CanvasRenderingContext2D, u: number): void {
  const cx = 50 * u;
  ctx.beginPath();
  ctx.moveTo(cx, 8 * u);
  // port side: rounded bow → parallel mid body → tapered stern cone
  ctx.bezierCurveTo(cx - 3.9 * u, 9.5 * u, cx - 6.8 * u, 14 * u, cx - 7.2 * u, 20 * u);
  ctx.bezierCurveTo(cx - 7.4 * u, 27 * u, cx - 7.4 * u, 36 * u, cx - 7.3 * u, 46 * u);
  ctx.bezierCurveTo(cx - 7.2 * u, 58 * u, cx - 6.7 * u, 69 * u, cx - 5.2 * u, 78 * u);
  ctx.bezierCurveTo(cx - 3.8 * u, 86 * u, cx - 2.0 * u, 91 * u, cx, 93.5 * u);
  // starboard side (mirror)
  ctx.bezierCurveTo(cx + 2.0 * u, 91 * u, cx + 3.8 * u, 86 * u, cx + 5.2 * u, 78 * u);
  ctx.bezierCurveTo(cx + 6.7 * u, 69 * u, cx + 7.2 * u, 58 * u, cx + 7.3 * u, 46 * u);
  ctx.bezierCurveTo(cx + 7.4 * u, 36 * u, cx + 7.4 * u, 27 * u, cx + 7.2 * u, 20 * u);
  ctx.bezierCurveTo(cx + 6.8 * u, 14 * u, cx + 3.9 * u, 9.5 * u, cx, 8 * u);
  ctx.closePath();
}

/**
 * Player submarine (t-028f redesign): modern attack-submarine top-down view.
 *
 * Layered construction (all north-up, u = size/100):
 *   1. hull — horizontal gradient simulates the cylindrical pressure-hull
 *      shading (light from above-left); axial gradient darkens bow/stern.
 *   2. bow spherical sonar dome (radial gradient + section line).
 *   3. deck spine highlight + hull section lines.
 *   4. torpedo-tube hatch marks (bow, flanking the spine).
 *   5. streamlined sail with gradient, leading-edge highlight and mast
 *      details (periscope / snorkel / ESM stubs).
 *   6. sail planes (fairwater planes) — swept horizontal fins.
 *   7. stern cruciform control surfaces + upper rudder line.
 *   8. pump-jet propulsor disc with blade etchings.
 *   9. flank sonar array lines along both sides of the hull.
 *  10. dark keyline + cyan outer glow + bright inner outline (player
 *      readability per VISUAL_STYLE §3 white-outline rule).
 *
 * The palette is self-contained (deep, desaturated submarine tones) and does
 * not depend on the shared ship PALETTE — the player boat is deliberately
 * darker than surface traffic for the "hunter in the deep" read.
 */
export function drawSubmarine(ctx: CanvasRenderingContext2D, size: number, opts?: DrawOpts): void {
  void opts; // palette overrides are ignored — the player sub has a dedicated scheme
  const u = size / 100;
  const cx = 50 * u;
  ctx.save();
  ctx.clearRect(0, 0, size, size);

  // Dedicated submarine palette — brighter than before so details read at 48–64
  // px game size. The shared dark background + subtle glow provide the deep-sea
  // feel; the hull itself needs enough contrast to show the sail / planes / dome.
  const cHullDeep = '#384555';
  const cHullMid = '#526375';
  const cHullHigh = '#6e8298';
  const cHullEdge = '#1c2430';
  const cSonarDome = '#2a3745';
  const cSail = '#445566';
  const cSailHigh = '#6a7f92';
  const cDeck = '#5c6f80';
  const cPanel = '#2e3c4a';
  const cProp = '#1e2832';
  const cMark = '#8599aa';

  // ---- 1. hull body: horizontal cylinder shading + axial bow/stern darkening
  subHullPath(ctx, u);
  const hullGrad = ctx.createLinearGradient(cx - 7.5 * u, 0, cx + 7.5 * u, 0);
  hullGrad.addColorStop(0.0, cHullDeep);
  hullGrad.addColorStop(0.26, cHullMid);
  hullGrad.addColorStop(0.48, cHullHigh);
  hullGrad.addColorStop(0.74, cHullMid);
  hullGrad.addColorStop(1.0, cHullDeep);
  ctx.fillStyle = hullGrad;
  ctx.fill();

  subHullPath(ctx, u);
  const axGrad = ctx.createLinearGradient(0, 8 * u, 0, 94 * u);
  axGrad.addColorStop(0.0, 'rgba(0,0,0,0.20)');
  axGrad.addColorStop(0.2, 'rgba(0,0,0,0)');
  axGrad.addColorStop(0.78, 'rgba(0,0,0,0)');
  axGrad.addColorStop(1.0, 'rgba(0,0,0,0.32)');
  ctx.fillStyle = axGrad;
  ctx.fill();

  // ---- 2. bow spherical sonar dome
  ctx.beginPath();
  ctx.ellipse(cx, 14 * u, 6 * u, 7 * u, 0, 0, Math.PI * 2);
  const domeGrad = ctx.createRadialGradient(cx - 1.5 * u, 12 * u, 0.5 * u, cx, 14 * u, 7.5 * u);
  domeGrad.addColorStop(0, '#33404d');
  domeGrad.addColorStop(1, cSonarDome);
  ctx.fillStyle = domeGrad;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx - 6.6 * u, 20 * u);
  ctx.quadraticCurveTo(cx, 23 * u, cx + 6.6 * u, 20 * u);
  ctx.strokeStyle = cHullEdge;
  ctx.globalAlpha = 0.75;
  ctx.lineWidth = Math.max(1, u * 0.55);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // ---- 3. deck spine + hull section lines
  ctx.beginPath();
  ctx.moveTo(cx, 24 * u);
  ctx.lineTo(cx, 80 * u);
  ctx.strokeStyle = cDeck;
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = Math.max(1, u * 1.0);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.beginPath();
  for (const y of [55, 67]) {
    ctx.moveTo(cx - 5.0 * u, y * u);
    ctx.quadraticCurveTo(cx, (y + 1.6) * u, cx + 5.0 * u, y * u);
  }
  ctx.strokeStyle = cPanel;
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = Math.max(1, u * 0.5);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // ---- 4. torpedo-tube hatch marks
  ctx.beginPath();
  ctx.moveTo(cx - 3.2 * u, 25.5 * u);
  ctx.lineTo(cx - 3.2 * u, 30 * u);
  ctx.moveTo(cx + 3.2 * u, 25.5 * u);
  ctx.lineTo(cx + 3.2 * u, 30 * u);
  ctx.strokeStyle = cPanel;
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = Math.max(1, u * 0.55);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // ---- 5. streamlined sail with gradient + leading-edge highlight + masts
  const sailGrad = ctx.createLinearGradient(cx - 4.4 * u, 0, cx + 4.4 * u, 0);
  sailGrad.addColorStop(0, cHullEdge);
  sailGrad.addColorStop(0.42, cSailHigh);
  sailGrad.addColorStop(1, cSail);
  ctx.beginPath();
  ctx.moveTo(cx, 30 * u);
  ctx.bezierCurveTo(cx - 4.6 * u, 32.5 * u, cx - 5.0 * u, 36 * u, cx - 4.8 * u, 40 * u);
  ctx.lineTo(cx - 4.2 * u, 48 * u);
  ctx.quadraticCurveTo(cx, 50.5 * u, cx + 4.2 * u, 48 * u);
  ctx.lineTo(cx + 4.8 * u, 40 * u);
  ctx.bezierCurveTo(cx + 5.0 * u, 36 * u, cx + 4.6 * u, 32.5 * u, cx, 30 * u);
  ctx.closePath();
  ctx.fillStyle = sailGrad;
  ctx.fill();
  ctx.strokeStyle = cHullEdge;
  ctx.lineWidth = Math.max(1, u * 0.65);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx - 1.0 * u, 33 * u);
  ctx.quadraticCurveTo(cx - 3.0 * u, 35.5 * u, cx - 3.1 * u, 39.5 * u);
  ctx.strokeStyle = cSailHigh;
  ctx.globalAlpha = 0.95;
  ctx.lineWidth = Math.max(1, u * 0.6);
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.beginPath();
  ctx.moveTo(cx - 1.2 * u, 37 * u);
  ctx.lineTo(cx - 1.2 * u, 44 * u);
  ctx.moveTo(cx + 1.0 * u, 38 * u);
  ctx.lineTo(cx + 1.0 * u, 43.5 * u);
  ctx.strokeStyle = cPanel;
  ctx.lineWidth = Math.max(1, u * 0.6);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx - 1.2 * u, 36.2 * u, Math.max(0.8, u * 0.7), 0, Math.PI * 2);
  ctx.fillStyle = cMark;
  ctx.fill();

  // ---- 6. sail planes (fairwater planes)
  ctx.beginPath();
  ctx.moveTo(cx - 4.6 * u, 37 * u);
  ctx.lineTo(cx - 14 * u, 34.5 * u);
  ctx.lineTo(cx - 13.2 * u, 39.5 * u);
  ctx.lineTo(cx - 4.8 * u, 41 * u);
  ctx.closePath();
  ctx.moveTo(cx + 4.6 * u, 37 * u);
  ctx.lineTo(cx + 14 * u, 34.5 * u);
  ctx.lineTo(cx + 13.2 * u, 39.5 * u);
  ctx.lineTo(cx + 4.8 * u, 41 * u);
  ctx.closePath();
  const planeGrad = ctx.createLinearGradient(0, 34 * u, 0, 42 * u);
  planeGrad.addColorStop(0, cHullHigh);
  planeGrad.addColorStop(1, cHullDeep);
  ctx.fillStyle = planeGrad;
  ctx.fill();
  ctx.strokeStyle = cHullEdge;
  ctx.lineWidth = Math.max(1, u * 0.55);
  ctx.stroke();

  // ---- 7. stern cruciform control surfaces + upper rudder
  ctx.beginPath();
  ctx.moveTo(cx - 3.8 * u, 79 * u);
  ctx.lineTo(cx - 13.5 * u, 83.5 * u);
  ctx.lineTo(cx - 12.2 * u, 88.5 * u);
  ctx.lineTo(cx - 3.2 * u, 85.5 * u);
  ctx.closePath();
  ctx.moveTo(cx + 3.8 * u, 79 * u);
  ctx.lineTo(cx + 13.5 * u, 83.5 * u);
  ctx.lineTo(cx + 12.2 * u, 88.5 * u);
  ctx.lineTo(cx + 3.2 * u, 85.5 * u);
  ctx.closePath();
  const sternGrad = ctx.createLinearGradient(0, 80 * u, 0, 90 * u);
  sternGrad.addColorStop(0, cHullHigh);
  sternGrad.addColorStop(1, cHullDeep);
  ctx.fillStyle = sternGrad;
  ctx.fill();
  ctx.strokeStyle = cHullEdge;
  ctx.lineWidth = Math.max(1, u * 0.55);
  ctx.stroke();
  // upper rudder
  ctx.beginPath();
  ctx.moveTo(cx, 80 * u);
  ctx.lineTo(cx, 88 * u);
  ctx.strokeStyle = cHullEdge;
  ctx.lineWidth = Math.max(1.2, u * 1.0);
  ctx.stroke();

  // ---- 8. pump-jet propulsor disc + blade etchings
  ctx.beginPath();
  ctx.arc(cx, 92 * u, 3.2 * u, 0, Math.PI * 2);
  ctx.fillStyle = cProp;
  ctx.fill();
  ctx.strokeStyle = cMark;
  ctx.globalAlpha = 0.65;
  ctx.lineWidth = Math.max(1, u * 0.55);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
    ctx.moveTo(cx + Math.cos(a) * 0.8 * u, 92 * u + Math.sin(a) * 0.8 * u);
    ctx.lineTo(cx + Math.cos(a) * 2.8 * u, 92 * u + Math.sin(a) * 2.8 * u);
  }
  ctx.strokeStyle = cMark;
  ctx.globalAlpha = 0.75;
  ctx.lineWidth = Math.max(1, u * 0.4);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // ---- 9. flank sonar array lines
  ctx.beginPath();
  ctx.moveTo(cx - 6.3 * u, 46 * u);
  ctx.lineTo(cx - 6.0 * u, 70 * u);
  ctx.moveTo(cx + 6.3 * u, 46 * u);
  ctx.lineTo(cx + 6.0 * u, 70 * u);
  ctx.strokeStyle = cPanel;
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = Math.max(1, u * 0.5);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // ---- 10. dark keyline + cyan outer glow + bright inner outline (player id)
  subHullPath(ctx, u);
  ctx.strokeStyle = 'rgba(10, 14, 18, 0.85)';
  ctx.lineWidth = Math.max(1, u * 0.9);
  ctx.stroke();
  ctx.save();
  ctx.shadowColor = 'rgba(100, 200, 255, 0.55)';
  ctx.shadowBlur = 7 * u;
  subHullPath(ctx, u);
  ctx.strokeStyle = 'rgba(190, 220, 240, 0.75)';
  ctx.lineWidth = Math.max(1, u * 0.7);
  ctx.stroke();
  ctx.restore();
  subHullPath(ctx, u);
  ctx.strokeStyle = 'rgba(230, 242, 252, 0.85)';
  ctx.lineWidth = Math.max(1, u * 0.45);
  ctx.stroke();

  ctx.restore();
}

export function drawMerchant(ctx: CanvasRenderingContext2D, size: number, opts?: DrawOpts): void {
  const p = resolvePalette(opts?.palette);
  const u = size / 100;
  ctx.save();
  ctx.clearRect(0, 0, size, size);
  const cx = 50 * u;
  fillHull(ctx, p, u, 13, 83, 17);
  // deck line
  ctx.beginPath();
  ctx.moveTo(cx - 15 * u, 24 * u);
  ctx.lineTo(cx + 15 * u, 24 * u);
  ctx.strokeStyle = p.hullDark;
  ctx.lineWidth = Math.max(1, u * 0.5);
  ctx.stroke();
  // forecastle (bow raised deck)
  fillRectRounded(ctx, cx - 13 * u, 15 * u, 26 * u, 8 * u, 2 * u, p.deckFill);
  // midship bridge block
  fillRectRounded(ctx, cx - 11 * u, 40 * u, 22 * u, 15 * u, 2 * u, p.deckFill);
  // bridge windows (muted line)
  ctx.beginPath();
  ctx.moveTo(cx - 8 * u, 43 * u);
  ctx.lineTo(cx + 8 * u, 43 * u);
  ctx.strokeStyle = p.hullLight;
  ctx.lineWidth = Math.max(1, u * 0.5);
  ctx.stroke();
  // funnel amidships
  fillRectRounded(ctx, cx - 5 * u, 33 * u, 10 * u, 8 * u, 1.5 * u, p.stackFill);
  // two masts
  ctx.beginPath();
  ctx.moveTo(cx - 10 * u, 24 * u);
  ctx.lineTo(cx - 10 * u, 12 * u);
  ctx.moveTo(cx + 10 * u, 24 * u);
  ctx.lineTo(cx + 10 * u, 10 * u);
  ctx.strokeStyle = p.hullDark;
  ctx.lineWidth = Math.max(1, u * 0.6);
  ctx.stroke();
  // dim outline
  hullPath(ctx, u, { bowY: 13, sternY: 83, halfWidth: 17 });
  strokeOutline(ctx, p.outlineDim, u);
  ctx.restore();
}

/** Cargo — container ship: boxy hull + container stacks, bridge aft. */
export function drawCargo(ctx: CanvasRenderingContext2D, size: number, opts?: DrawOpts): void {
  const p = resolvePalette(opts?.palette);
  const u = size / 100;
  ctx.save();
  ctx.clearRect(0, 0, size, size);
  const cx = 50 * u;
  fillHull(ctx, p, u, 12, 84, 18);
  // deck line
  ctx.beginPath();
  ctx.moveTo(cx - 16 * u, 25 * u);
  ctx.lineTo(cx + 16 * u, 25 * u);
  ctx.strokeStyle = p.hullDark;
  ctx.lineWidth = Math.max(1, u * 0.5);
  ctx.stroke();
  // container stacks: 2 columns × 3 rows, muted boxy blocks (distinct silhouette)
  const boxW = 8 * u;
  const boxH = 6 * u;
  const rows = [27, 35, 43];
  const cols = [-12, 3];
  const containerColors = [p.deckFill, p.hullDark, p.stackFill, p.hullLight];
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < cols.length; c++) {
      const x = cx + cols[c]! * u;
      const y = rows[r]! * u;
      fillRectRounded(
        ctx,
        x,
        y,
        boxW,
        boxH,
        1 * u,
        containerColors[(r + c) % containerColors.length]!,
      );
    }
  }
  // bridge + funnel aft (stern superstructure — distinguishes from merchant)
  fillRectRounded(ctx, cx - 10 * u, 56 * u, 20 * u, 13 * u, 2 * u, p.deckFill);
  fillRectRounded(ctx, cx - 4 * u, 49 * u, 8 * u, 8 * u, 1.5 * u, p.stackFill);
  // single mast forward
  ctx.beginPath();
  ctx.moveTo(cx + 13 * u, 25 * u);
  ctx.lineTo(cx + 13 * u, 14 * u);
  ctx.strokeStyle = p.hullDark;
  ctx.lineWidth = Math.max(1, u * 0.6);
  ctx.stroke();
  // dim outline
  hullPath(ctx, u, { bowY: 12, sternY: 84, halfWidth: 18 });
  strokeOutline(ctx, p.outlineDim, u);
  ctx.restore();
}

/** Tanker — long, narrow hull; superstructure + funnel at stern. */
export function drawTanker(ctx: CanvasRenderingContext2D, size: number, opts?: DrawOpts): void {
  const p = resolvePalette(opts?.palette);
  const u = size / 100;
  ctx.save();
  ctx.clearRect(0, 0, size, size);
  const cx = 50 * u;
  // long narrow hull
  fillHull(ctx, p, u, 8, 88, 15);
  // pipe lines along the long deck (tanker signature)
  ctx.beginPath();
  ctx.moveTo(cx - 9 * u, 22 * u);
  ctx.lineTo(cx - 9 * u, 70 * u);
  ctx.moveTo(cx + 9 * u, 22 * u);
  ctx.lineTo(cx + 9 * u, 70 * u);
  ctx.moveTo(cx, 22 * u);
  ctx.lineTo(cx, 70 * u);
  ctx.strokeStyle = p.hullDark;
  ctx.lineWidth = Math.max(1, u * 0.45);
  ctx.stroke();
  // forecastle (small)
  fillRectRounded(ctx, cx - 9 * u, 10 * u, 18 * u, 7 * u, 2 * u, p.deckFill);
  // aft superstructure: bridge + funnel
  fillRectRounded(ctx, cx - 10 * u, 74 * u, 20 * u, 12 * u, 2 * u, p.deckFill);
  fillRectRounded(ctx, cx - 5 * u, 67 * u, 10 * u, 8 * u, 1.5 * u, p.stackFill);
  // dim outline
  hullPath(ctx, u, { bowY: 8, sternY: 88, halfWidth: 15 });
  strokeOutline(ctx, p.outlineDim, u);
  ctx.restore();
}

/** Destroyer — long narrow warship: bow gun, twin funnels, mast, DC racks. */
export function drawDestroyer(ctx: CanvasRenderingContext2D, size: number, opts?: DrawOpts): void {
  const p = resolvePalette(opts?.palette);
  const u = size / 100;
  ctx.save();
  ctx.clearRect(0, 0, size, size);
  const cx = 50 * u;
  // narrow fast hull
  fillHull(ctx, p, u, 9, 88, 13);
  // bow gun turret
  fillRectRounded(ctx, cx - 6 * u, 11 * u, 12 * u, 6 * u, 1.5 * u, p.stackFill);
  ctx.beginPath();
  ctx.moveTo(cx - 8 * u, 10 * u);
  ctx.lineTo(cx + 8 * u, 10 * u);
  ctx.strokeStyle = p.hullDark;
  ctx.lineWidth = Math.max(1, u * 0.6);
  ctx.stroke();
  // raised foredeck
  fillRectRounded(ctx, cx - 10 * u, 19 * u, 20 * u, 8 * u, 1.5 * u, p.deckFill);
  // bridge block
  fillRectRounded(ctx, cx - 9 * u, 34 * u, 18 * u, 14 * u, 2 * u, p.deckFill);
  // twin funnels (destroyer signature)
  fillRectRounded(ctx, cx - 9 * u, 28 * u, 6 * u, 7 * u, 1.2 * u, p.stackFill);
  fillRectRounded(ctx, cx + 3 * u, 28 * u, 6 * u, 7 * u, 1.2 * u, p.stackFill);
  // mast
  ctx.beginPath();
  ctx.moveTo(cx, 34 * u);
  ctx.lineTo(cx, 20 * u);
  ctx.strokeStyle = p.hullDark;
  ctx.lineWidth = Math.max(1, u * 0.6);
  ctx.stroke();
  // stern depth-charge racks
  fillRectRounded(ctx, cx - 8 * u, 78 * u, 16 * u, 6 * u, 1.5 * u, p.stackFill);
  ctx.beginPath();
  ctx.moveTo(cx - 6 * u, 78 * u);
  ctx.lineTo(cx - 6 * u, 84 * u);
  ctx.moveTo(cx + 6 * u, 78 * u);
  ctx.lineTo(cx + 6 * u, 84 * u);
  ctx.strokeStyle = p.hullLight;
  ctx.lineWidth = Math.max(1, u * 0.5);
  ctx.stroke();
  // dim outline
  hullPath(ctx, u, { bowY: 9, sternY: 88, halfWidth: 13 });
  strokeOutline(ctx, p.outlineDim, u);
  ctx.restore();
}

/** Frigate — compact warship: single funnel, bow gun, helipad aft. */
export function drawFrigate(ctx: CanvasRenderingContext2D, size: number, opts?: DrawOpts): void {
  const p = resolvePalette(opts?.palette);
  const u = size / 100;
  ctx.save();
  ctx.clearRect(0, 0, size, size);
  const cx = 50 * u;
  // compact hull
  fillHull(ctx, p, u, 11, 86, 15);
  // bow gun
  fillRectRounded(ctx, cx - 5 * u, 13 * u, 10 * u, 5 * u, 1.5 * u, p.stackFill);
  // raised foredeck
  fillRectRounded(ctx, cx - 11 * u, 21 * u, 22 * u, 7 * u, 1.5 * u, p.deckFill);
  // bridge
  fillRectRounded(ctx, cx - 9 * u, 33 * u, 18 * u, 12 * u, 2 * u, p.deckFill);
  // single funnel amidships (offset)
  fillRectRounded(ctx, cx - 4 * u, 26 * u, 8 * u, 8 * u, 1.5 * u, p.stackFill);
  // mast
  ctx.beginPath();
  ctx.moveTo(cx + 6 * u, 33 * u);
  ctx.lineTo(cx + 6 * u, 20 * u);
  ctx.strokeStyle = p.hullDark;
  ctx.lineWidth = Math.max(1, u * 0.6);
  ctx.stroke();
  // helipad aft (circle outline — frigate signature)
  ctx.beginPath();
  ctx.arc(cx, 74 * u, 9 * u, 0, Math.PI * 2);
  ctx.strokeStyle = p.hullLight;
  ctx.lineWidth = Math.max(1, u * 0.5);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - 7 * u, 74 * u);
  ctx.lineTo(cx + 7 * u, 74 * u);
  ctx.strokeStyle = p.hullDark;
  ctx.lineWidth = Math.max(1, u * 0.5);
  ctx.stroke();
  // dim outline
  hullPath(ctx, u, { bowY: 11, sternY: 86, halfWidth: 15 });
  strokeOutline(ctx, p.outlineDim, u);
  ctx.restore();
}

/** Torpedo — small capsule, nose up (north = travel direction), fins aft. */
export function drawTorpedo(ctx: CanvasRenderingContext2D, size: number, opts?: DrawOpts): void {
  const p = resolvePalette(opts?.palette);
  const u = size / 100;
  ctx.save();
  ctx.clearRect(0, 0, size, size);
  const cx = 50 * u;
  // body
  ctx.beginPath();
  ctx.moveTo(cx, 12 * u);
  ctx.bezierCurveTo(cx + 7 * u, 18 * u, cx + 6 * u, 26 * u, cx + 5 * u, 60 * u);
  ctx.lineTo(cx + 5 * u, 66 * u);
  ctx.quadraticCurveTo(cx, 70 * u, cx - 5 * u, 66 * u);
  ctx.lineTo(cx - 5 * u, 60 * u);
  ctx.bezierCurveTo(cx - 6 * u, 26 * u, cx - 7 * u, 18 * u, cx, 12 * u);
  ctx.closePath();
  ctx.fillStyle = p.hullFill;
  ctx.fill();
  ctx.strokeStyle = p.hullDark;
  ctx.lineWidth = Math.max(1, u * 0.5);
  ctx.stroke();
  // fins aft
  ctx.beginPath();
  ctx.moveTo(cx - 5 * u, 62 * u);
  ctx.lineTo(cx - 11 * u, 74 * u);
  ctx.lineTo(cx - 5 * u, 68 * u);
  ctx.moveTo(cx + 5 * u, 62 * u);
  ctx.lineTo(cx + 11 * u, 74 * u);
  ctx.lineTo(cx + 5 * u, 68 * u);
  ctx.closePath();
  ctx.fillStyle = p.stackFill;
  ctx.fill();
  ctx.strokeStyle = p.hullDark;
  ctx.lineWidth = Math.max(1, u * 0.4);
  ctx.stroke();
  // nose highlight
  ctx.beginPath();
  ctx.moveTo(cx, 16 * u);
  ctx.lineTo(cx, 24 * u);
  ctx.strokeStyle = p.hullLight;
  ctx.lineWidth = Math.max(1, u * 0.5);
  ctx.stroke();
  // dim outline
  ctx.beginPath();
  ctx.moveTo(cx, 12 * u);
  ctx.bezierCurveTo(cx + 7 * u, 18 * u, cx + 6 * u, 26 * u, cx + 5 * u, 60 * u);
  ctx.lineTo(cx + 5 * u, 66 * u);
  ctx.quadraticCurveTo(cx, 70 * u, cx - 5 * u, 66 * u);
  ctx.lineTo(cx - 5 * u, 60 * u);
  ctx.bezierCurveTo(cx - 6 * u, 26 * u, cx - 7 * u, 18 * u, cx, 12 * u);
  ctx.closePath();
  strokeOutline(ctx, p.outlineDim, u);
  ctx.restore();
}

/** Decoy — noise-maker canister with vane ring (VISUAL_STYLE §10 decoy). */
export function drawDecoy(ctx: CanvasRenderingContext2D, size: number, opts?: DrawOpts): void {
  const p = resolvePalette(opts?.palette);
  const u = size / 100;
  ctx.save();
  ctx.clearRect(0, 0, size, size);
  const cx = 50 * u;
  // canister body
  fillRectRounded(ctx, cx - 8 * u, 26 * u, 16 * u, 34 * u, 5 * u, p.hullFill);
  // top cap + strobe dot
  fillRectRounded(ctx, cx - 5 * u, 18 * u, 10 * u, 9 * u, 3 * u, p.stackFill);
  ctx.beginPath();
  ctx.arc(cx, 22 * u, 2 * u, 0, Math.PI * 2);
  ctx.fillStyle = p.sonarPing;
  ctx.fill();
  // vane ring at bottom (noise-maker)
  ctx.beginPath();
  ctx.arc(cx, 66 * u, 10 * u, 0, Math.PI * 2);
  ctx.strokeStyle = p.hullLight;
  ctx.lineWidth = Math.max(1, u * 0.6);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx, 60 * u);
  ctx.lineTo(cx, 72 * u);
  ctx.moveTo(cx - 10 * u, 66 * u);
  ctx.lineTo(cx + 10 * u, 66 * u);
  ctx.strokeStyle = p.hullLight;
  ctx.lineWidth = Math.max(1, u * 0.5);
  ctx.stroke();
  // dim outline
  roundRectPath(ctx, cx - 8 * u, 26 * u, 16 * u, 34 * u, 5 * u);
  strokeOutline(ctx, p.outlineDim, u);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Effects / particles (VISUAL_STYLE §10)
// ---------------------------------------------------------------------------

/** Sonar ping ring — expanding frame; particle system scales it over 1.2s. */
export function drawSonarPing(ctx: CanvasRenderingContext2D, size: number, opts?: DrawOpts): void {
  const p = resolvePalette(opts?.palette);
  const u = size / 100;
  ctx.save();
  ctx.clearRect(0, 0, size, size);
  const cx = 50 * u;
  const cy = 50 * u;
  // outer faint echo
  ctx.beginPath();
  ctx.arc(cx, cy, 44 * u, 0, Math.PI * 2);
  strokeLine(ctx, { color: p.sonarPing, width: Math.max(1.5, u * 1.4), alpha: 0.25 });
  // main ping ring
  ctx.beginPath();
  ctx.arc(cx, cy, 34 * u, 0, Math.PI * 2);
  strokeLine(ctx, { color: p.sonarPing, width: Math.max(2, u * 2.2), alpha: 0.85 });
  ctx.restore();
}

/** Explosion particle — flash gradient dot (palette #ffd479→#ff6b35→#7a2f22). */
export function drawExplosionParticle(
  ctx: CanvasRenderingContext2D,
  size: number,
  opts?: DrawOpts,
): void {
  const p = resolvePalette(opts?.palette);
  const u = size / 100;
  ctx.save();
  ctx.clearRect(0, 0, size, size);
  const cx = 50 * u;
  const cy = 50 * u;
  const r = 22 * u;
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  grad.addColorStop(0, p.explosionFlash);
  grad.addColorStop(0.45, p.explosionHot);
  grad.addColorStop(0.85, p.explosionEmber);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.restore();
}

/** Torpedo wake bubble — small bubble with highlight (torpedoTrail palette). */
export function drawTorpedoWakeBubble(
  ctx: CanvasRenderingContext2D,
  size: number,
  opts?: DrawOpts,
): void {
  const p = resolvePalette(opts?.palette);
  const u = size / 100;
  ctx.save();
  ctx.clearRect(0, 0, size, size);
  const cx = 50 * u;
  const cy = 50 * u;
  const r = 12 * u;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = p.torpedoTrail;
  ctx.fill();
  // highlight arc (top-left)
  ctx.beginPath();
  ctx.arc(cx - r * 0.35, cy - r * 0.35, r * 0.35, Math.PI * 0.8, Math.PI * 1.7);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = Math.max(1, u * 0.8);
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.restore();
}

/** Depth charge splash — white ring + 8 droplets (0.8s life). */
export function drawDepthChargeSplash(
  ctx: CanvasRenderingContext2D,
  size: number,
  opts?: DrawOpts,
): void {
  void opts;
  const u = size / 100;
  ctx.save();
  ctx.clearRect(0, 0, size, size);
  const cx = 50 * u;
  const cy = 50 * u;
  ctx.beginPath();
  ctx.arc(cx, cy, 30 * u, 0, Math.PI * 2);
  strokeLine(ctx, { color: '#ffffff', width: Math.max(1.5, u * 1.6), alpha: 0.7 });
  // 8 droplets
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const dx = Math.cos(angle) * 42 * u;
    const dy = Math.sin(angle) * 42 * u;
    ctx.beginPath();
    ctx.arc(cx + dx, cy + dy, 4.5 * u, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = 0.55;
    ctx.fill();
  }
  ctx.restore();
}

/** Contact uncertainty ellipse — dashed ellipse frame (FR-06 uncertainty viz). */
export function drawContactUncertaintyEllipse(
  ctx: CanvasRenderingContext2D,
  size: number,
  opts?: DrawOpts,
): void {
  const p = resolvePalette(opts?.palette);
  const u = size / 100;
  ctx.save();
  ctx.clearRect(0, 0, size, size);
  const cx = 50 * u;
  const cy = 50 * u;
  ctx.beginPath();
  ctx.ellipse(cx, cy, 38 * u, 22 * u, 0, 0, Math.PI * 2);
  strokeLine(ctx, {
    color: opts?.color ?? p.neutral,
    width: Math.max(1.5, u * 1.3),
    alpha: 0.6,
    dash: [7, 5],
  });
  // faint fill
  ctx.beginPath();
  ctx.ellipse(cx, cy, 38 * u, 22 * u, 0, 0, Math.PI * 2);
  ctx.fillStyle = opts?.color ?? p.neutral;
  ctx.globalAlpha = 0.08;
  ctx.fill();
  ctx.restore();
}

/** Contact state ring — thin ring + N/E/S/W ticks; color encodes state. */
export function drawContactRing(
  ctx: CanvasRenderingContext2D,
  size: number,
  opts?: DrawOpts,
): void {
  const u = size / 100;
  const state = isContactState(opts?.variant) ? opts!.variant! : 'UNKNOWN';
  const color = opts?.color ?? contactStateColor(state);
  ctx.save();
  ctx.clearRect(0, 0, size, size);
  const cx = 50 * u;
  const cy = 50 * u;
  const r = 42 * u;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  strokeLine(ctx, { color, width: Math.max(2, u * 2.4), alpha: 0.9 });
  // ticks at cardinal points
  const tick = 6 * u;
  const positions: [number, number, number, number][] = [
    [cx, cy - r, cx, cy - r - tick],
    [cx, cy + r, cx, cy + r + tick],
    [cx - r, cy, cx - r - tick, cy],
    [cx + r, cy, cx + r + tick, cy],
  ];
  ctx.beginPath();
  for (const [x1, y1, x2, y2] of positions) {
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
  }
  strokeLine(ctx, { color, width: Math.max(1.5, u * 1.6), alpha: 0.7 });
  ctx.restore();
}

function isContactState(value: string | undefined): value is ContactState {
  return (
    value === 'UNKNOWN' ||
    value === 'SUSPECTED' ||
    value === 'CLASSIFIED' ||
    value === 'TRACKED' ||
    value === 'CONFIRMED'
  );
}

// ---------------------------------------------------------------------------
// Map grid + minimap (L1 / L5 layers)
// ---------------------------------------------------------------------------

/** Draw a full grid of lines at `cellPx` spacing (VISUAL_STYLE §2 grid color). */
export function drawMapGrid(ctx: CanvasRenderingContext2D, size: number, opts?: DrawOpts): void {
  const p = resolvePalette(opts?.palette);
  const cellPx = opts?.cellPx && opts.cellPx > 0 ? opts.cellPx : size / 2;
  ctx.save();
  ctx.clearRect(0, 0, size, size);
  ctx.beginPath();
  for (let x = 0; x <= size; x += cellPx) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, size);
  }
  for (let y = 0; y <= size; y += cellPx) {
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
  }
  strokeLine(ctx, { color: p.gridLine, width: 1, alpha: opts?.alpha ?? 0.18 });
  ctx.restore();
}

/** Minimap frame — panel bg + 1px border + corner ticks. */
export function drawMinimapFrame(
  ctx: CanvasRenderingContext2D,
  size: number,
  opts?: DrawOpts,
): void {
  const p = resolvePalette(opts?.palette);
  const u = size / 100;
  ctx.save();
  ctx.clearRect(0, 0, size, size);
  roundRectPath(ctx, 2 * u, 2 * u, 96 * u, 96 * u, 6 * u);
  ctx.fillStyle = p.uiPanelBg;
  ctx.fill();
  ctx.strokeStyle = p.uiPanelBorder;
  ctx.lineWidth = Math.max(1, u);
  ctx.stroke();
  // corner ticks
  const t = 8 * u;
  const inset = 5 * u;
  ctx.beginPath();
  ctx.moveTo(inset, inset + t);
  ctx.lineTo(inset, inset);
  ctx.lineTo(inset + t, inset);
  ctx.moveTo(size - inset - t, inset);
  ctx.lineTo(size - inset, inset);
  ctx.lineTo(size - inset, inset + t);
  ctx.moveTo(size - inset, size - inset - t);
  ctx.lineTo(size - inset, size - inset);
  ctx.lineTo(size - inset - t, size - inset);
  ctx.moveTo(inset + t, size - inset);
  ctx.lineTo(inset, size - inset);
  ctx.lineTo(inset, size - inset - t);
  strokeLine(ctx, { color: p.uiPanelBorder, width: Math.max(1, u * 0.8) });
  ctx.restore();
}

/** Minimap player-submarine icon — small north-up sub glyph in neutral. */
export function drawMinimapSubIcon(
  ctx: CanvasRenderingContext2D,
  size: number,
  opts?: DrawOpts,
): void {
  const p = resolvePalette(opts?.palette);
  const u = size / 100;
  ctx.save();
  ctx.clearRect(0, 0, size, size);
  const cx = 50 * u;
  const color = opts?.color ?? p.neutral;
  // bow triangle + tail
  ctx.beginPath();
  ctx.moveTo(cx, 24 * u);
  ctx.lineTo(cx + 14 * u, 46 * u);
  ctx.lineTo(cx + 10 * u, 58 * u);
  ctx.lineTo(cx - 10 * u, 58 * u);
  ctx.lineTo(cx - 14 * u, 46 * u);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.85;
  ctx.fill();
  // center dot
  ctx.beginPath();
  ctx.arc(cx, 50 * u, 3.5 * u, 0, Math.PI * 2);
  ctx.fillStyle = '#050a12';
  ctx.globalAlpha = 0.9;
  ctx.fill();
  ctx.restore();
}

/** Minimap contact blip — sonar-colored dot with thin ring. */
export function drawMinimapContactIcon(
  ctx: CanvasRenderingContext2D,
  size: number,
  opts?: DrawOpts,
): void {
  const p = resolvePalette(opts?.palette);
  const u = size / 100;
  ctx.save();
  ctx.clearRect(0, 0, size, size);
  const cx = 50 * u;
  const cy = 50 * u;
  ctx.beginPath();
  ctx.arc(cx, cy, 13 * u, 0, Math.PI * 2);
  ctx.fillStyle = opts?.color ?? p.sonarPing;
  ctx.globalAlpha = 0.9;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, 16 * u, 0, Math.PI * 2);
  strokeLine(ctx, { color: p.sonarPing, width: Math.max(1, u * 1.2), alpha: 0.5 });
  ctx.restore();
}

// ---------------------------------------------------------------------------
// UI icons — line style, 1.5px stroke, rounded caps, muted (VISUAL_STYLE §8)
// ---------------------------------------------------------------------------

interface IconOpts {
  color?: string;
  palette?: Partial<PaletteColors>;
}

function iconStyle(ctx: CanvasRenderingContext2D, size: number, color: string): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.5, size * 0.047);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

function iconBase(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.save();
  ctx.clearRect(0, 0, size, size);
}

function iconColor(opts: IconOpts | undefined, p: PaletteColors): string {
  return opts?.color ?? p.uiTextPrimary;
}

/** Icon — sonar: dot + concentric arcs opening upward. */
export function drawIconSonar(ctx: CanvasRenderingContext2D, size: number, opts?: IconOpts): void {
  const p = resolvePalette(opts?.palette);
  const u = size / 100;
  iconBase(ctx, size);
  const cx = 50 * u;
  const cy = 50 * u;
  iconStyle(ctx, size, iconColor(opts, p));
  ctx.beginPath();
  ctx.arc(cx, cy, 5 * u, 0, Math.PI * 2);
  ctx.fillStyle = iconColor(opts, p);
  ctx.fill();
  ctx.beginPath();
  for (const r of [17, 28, 39]) {
    ctx.moveTo(cx + r * Math.cos(-2.62), cy + r * Math.sin(-2.62));
    ctx.arc(cx, cy, r * u, -2.62, -0.52);
    ctx.moveTo(cx + r * Math.cos(0.52), cy + r * Math.sin(0.52));
    ctx.arc(cx, cy, r * u, 0.52, 2.62);
  }
  ctx.stroke();
  ctx.restore();
}

/** Icon — contact: target reticle (circle + dot + crosshair ticks). */
export function drawIconContact(
  ctx: CanvasRenderingContext2D,
  size: number,
  opts?: IconOpts,
): void {
  const p = resolvePalette(opts?.palette);
  const u = size / 100;
  iconBase(ctx, size);
  const cx = 50 * u;
  const cy = 50 * u;
  iconStyle(ctx, size, iconColor(opts, p));
  ctx.beginPath();
  ctx.arc(cx, cy, 28 * u, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, 13 * u, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, 4.5 * u, 0, Math.PI * 2);
  ctx.fillStyle = iconColor(opts, p);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx, 12 * u);
  ctx.lineTo(cx, 22 * u);
  ctx.moveTo(cx, 78 * u);
  ctx.lineTo(cx, 88 * u);
  ctx.moveTo(12 * u, cy);
  ctx.lineTo(22 * u, cy);
  ctx.moveTo(78 * u, cy);
  ctx.lineTo(88 * u, cy);
  ctx.stroke();
  ctx.restore();
}

/** Icon — torpedo: capsule with aft fins. */
export function drawIconTorpedo(
  ctx: CanvasRenderingContext2D,
  size: number,
  opts?: IconOpts,
): void {
  const p = resolvePalette(opts?.palette);
  const u = size / 100;
  iconBase(ctx, size);
  const cx = 50 * u;
  const color = iconColor(opts, p);
  iconStyle(ctx, size, color);
  ctx.beginPath();
  ctx.moveTo(cx, 12 * u);
  ctx.bezierCurveTo(cx + 6 * u, 18 * u, cx + 5 * u, 26 * u, cx + 5 * u, 56 * u);
  ctx.lineTo(cx + 5 * u, 62 * u);
  ctx.quadraticCurveTo(cx, 66 * u, cx - 5 * u, 62 * u);
  ctx.lineTo(cx - 5 * u, 56 * u);
  ctx.bezierCurveTo(cx - 5 * u, 26 * u, cx - 6 * u, 18 * u, cx, 12 * u);
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - 5 * u, 58 * u);
  ctx.lineTo(cx - 10 * u, 70 * u);
  ctx.lineTo(cx - 5 * u, 64 * u);
  ctx.moveTo(cx + 5 * u, 58 * u);
  ctx.lineTo(cx + 10 * u, 70 * u);
  ctx.lineTo(cx + 5 * u, 64 * u);
  ctx.stroke();
  ctx.restore();
}

/** Icon — battery: cell with terminal + charge bar. */
export function drawIconBattery(
  ctx: CanvasRenderingContext2D,
  size: number,
  opts?: IconOpts,
): void {
  const p = resolvePalette(opts?.palette);
  const u = size / 100;
  iconBase(ctx, size);
  const color = iconColor(opts, p);
  iconStyle(ctx, size, color);
  roundRectPath(ctx, 20 * u, 26 * u, 60 * u, 46 * u, 6 * u);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(43 * u, 16 * u);
  ctx.lineTo(43 * u, 26 * u);
  ctx.moveTo(57 * u, 16 * u);
  ctx.lineTo(57 * u, 26 * u);
  ctx.stroke();
  roundRectPath(ctx, 26 * u, 32 * u, 48 * u, 34 * u, 3 * u);
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.35;
  ctx.fill();
  ctx.restore();
}

/** Icon — hull integrity: shield with center bar + crack. */
export function drawIconHull(ctx: CanvasRenderingContext2D, size: number, opts?: IconOpts): void {
  const p = resolvePalette(opts?.palette);
  const u = size / 100;
  iconBase(ctx, size);
  const color = iconColor(opts, p);
  iconStyle(ctx, size, color);
  ctx.beginPath();
  ctx.moveTo(50 * u, 14 * u);
  ctx.lineTo(74 * u, 26 * u);
  ctx.lineTo(70 * u, 58 * u);
  ctx.lineTo(50 * u, 80 * u);
  ctx.lineTo(30 * u, 58 * u);
  ctx.lineTo(26 * u, 26 * u);
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(50 * u, 30 * u);
  ctx.lineTo(50 * u, 62 * u);
  ctx.moveTo(50 * u, 40 * u);
  ctx.lineTo(42 * u, 48 * u);
  ctx.stroke();
  ctx.restore();
}

/** Icon — noise: three wavy sound strokes. */
export function drawIconNoise(ctx: CanvasRenderingContext2D, size: number, opts?: IconOpts): void {
  const p = resolvePalette(opts?.palette);
  const u = size / 100;
  iconBase(ctx, size);
  iconStyle(ctx, size, iconColor(opts, p));
  ctx.beginPath();
  for (const x of [30, 50, 70]) {
    ctx.moveTo(x * u, 28 * u);
    ctx.quadraticCurveTo((x + 7) * u, 42 * u, x * u, 50 * u);
    ctx.quadraticCurveTo((x - 7) * u, 58 * u, x * u, 72 * u);
  }
  ctx.stroke();
  ctx.restore();
}

/** Icon — detection: eye (almond) with pupil. */
export function drawIconDetection(
  ctx: CanvasRenderingContext2D,
  size: number,
  opts?: IconOpts,
): void {
  const p = resolvePalette(opts?.palette);
  const u = size / 100;
  iconBase(ctx, size);
  const color = iconColor(opts, p);
  iconStyle(ctx, size, color);
  ctx.beginPath();
  ctx.moveTo(16 * u, 50 * u);
  ctx.quadraticCurveTo(50 * u, 20 * u, 84 * u, 50 * u);
  ctx.quadraticCurveTo(50 * u, 80 * u, 16 * u, 50 * u);
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(50 * u, 50 * u, 7 * u, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

/** Icon — depth: down arrow with baseline. */
export function drawIconDepth(ctx: CanvasRenderingContext2D, size: number, opts?: IconOpts): void {
  const p = resolvePalette(opts?.palette);
  const u = size / 100;
  iconBase(ctx, size);
  iconStyle(ctx, size, iconColor(opts, p));
  ctx.beginPath();
  ctx.moveTo(50 * u, 16 * u);
  ctx.lineTo(50 * u, 66 * u);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(50 * u, 72 * u);
  ctx.lineTo(32 * u, 52 * u);
  ctx.lineTo(68 * u, 52 * u);
  ctx.closePath();
  ctx.fillStyle = iconColor(opts, p);
  ctx.globalAlpha = 0.5;
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(22 * u, 84 * u);
  ctx.lineTo(78 * u, 84 * u);
  ctx.stroke();
  ctx.restore();
}

/** Icon — pause: two bars. */
export function drawIconPause(ctx: CanvasRenderingContext2D, size: number, opts?: IconOpts): void {
  const p = resolvePalette(opts?.palette);
  const u = size / 100;
  iconBase(ctx, size);
  const color = iconColor(opts, p);
  iconStyle(ctx, size, color);
  for (const x of [34, 56]) {
    roundRectPath(ctx, x * u, 26 * u, 10 * u, 48 * u, 3 * u);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.5;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.stroke();
  }
  ctx.restore();
}

/** Icon — settings: gear (circle + teeth). */
export function drawIconSettings(
  ctx: CanvasRenderingContext2D,
  size: number,
  opts?: IconOpts,
): void {
  const p = resolvePalette(opts?.palette);
  const u = size / 100;
  iconBase(ctx, size);
  const cx = 50 * u;
  const cy = 50 * u;
  const color = iconColor(opts, p);
  iconStyle(ctx, size, color);
  ctx.beginPath();
  ctx.arc(cx, cy, 18 * u, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const r1 = 21 * u;
    const r2 = 27 * u;
    ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
  }
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, 5 * u, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

/** Icon — map: sheet with folded corner + position dots. */
export function drawIconMap(ctx: CanvasRenderingContext2D, size: number, opts?: IconOpts): void {
  const p = resolvePalette(opts?.palette);
  const u = size / 100;
  iconBase(ctx, size);
  const color = iconColor(opts, p);
  iconStyle(ctx, size, color);
  roundRectPath(ctx, 20 * u, 16 * u, 60 * u, 68 * u, 3 * u);
  ctx.stroke();
  // folded corner
  ctx.beginPath();
  ctx.moveTo(56 * u, 16 * u);
  ctx.lineTo(56 * u, 40 * u);
  ctx.lineTo(80 * u, 40 * u);
  ctx.stroke();
  // position dots
  const dots: readonly (readonly [number, number])[] = [
    [34, 34],
    [50, 46],
    [40, 60],
    [62, 64],
  ];
  ctx.beginPath();
  for (const [dx, dy] of dots) {
    ctx.moveTo(dx * u + 2 * u, dy * u);
    ctx.arc(dx * u, dy * u, 2 * u, 0, Math.PI * 2);
  }
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.8;
  ctx.fill();
  ctx.restore();
}

/** Icon — log: document with content lines. */
export function drawIconLog(ctx: CanvasRenderingContext2D, size: number, opts?: IconOpts): void {
  const p = resolvePalette(opts?.palette);
  const u = size / 100;
  iconBase(ctx, size);
  const color = iconColor(opts, p);
  iconStyle(ctx, size, color);
  roundRectPath(ctx, 28 * u, 14 * u, 44 * u, 72 * u, 3 * u);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(36 * u, 30 * u);
  ctx.lineTo(64 * u, 30 * u);
  ctx.moveTo(36 * u, 42 * u);
  ctx.lineTo(64 * u, 42 * u);
  ctx.moveTo(36 * u, 54 * u);
  ctx.lineTo(56 * u, 54 * u);
  ctx.moveTo(36 * u, 66 * u);
  ctx.lineTo(62 * u, 66 * u);
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Dispatcher — drawSprite(ctx, kind, size, opts)
// ---------------------------------------------------------------------------

/** Draw any registered sprite kind onto ctx (pure, deterministic). */
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  kind: SpriteKind,
  size: number,
  opts?: DrawOpts,
): void {
  switch (kind) {
    case 'submarine':
      drawSubmarine(ctx, size, opts);
      break;
    case 'merchant':
      drawMerchant(ctx, size, opts);
      break;
    case 'cargo':
      drawCargo(ctx, size, opts);
      break;
    case 'tanker':
      drawTanker(ctx, size, opts);
      break;
    case 'destroyer':
      drawDestroyer(ctx, size, opts);
      break;
    case 'frigate':
      drawFrigate(ctx, size, opts);
      break;
    case 'torpedo':
      drawTorpedo(ctx, size, opts);
      break;
    case 'decoy':
      drawDecoy(ctx, size, opts);
      break;
    case 'sonarPing':
      drawSonarPing(ctx, size, opts);
      break;
    case 'explosionParticle':
      drawExplosionParticle(ctx, size, opts);
      break;
    case 'torpedoWakeBubble':
      drawTorpedoWakeBubble(ctx, size, opts);
      break;
    case 'depthChargeSplash':
      drawDepthChargeSplash(ctx, size, opts);
      break;
    case 'contactUncertaintyEllipse':
      drawContactUncertaintyEllipse(ctx, size, opts);
      break;
    case 'contactRing':
      drawContactRing(ctx, size, opts);
      break;
    case 'mapGridTile':
      drawMapGrid(ctx, size, {
        ...opts,
        cellPx: opts?.cellPx ?? size / 2,
        alpha: opts?.alpha ?? 0.18,
      });
      break;
    case 'minimapFrame':
      drawMinimapFrame(ctx, size, opts);
      break;
    case 'minimapSubIcon':
      drawMinimapSubIcon(ctx, size, opts);
      break;
    case 'minimapContactIcon':
      drawMinimapContactIcon(ctx, size, opts);
      break;
    case 'uiSonar':
      drawIconSonar(ctx, size, opts);
      break;
    case 'uiContact':
      drawIconContact(ctx, size, opts);
      break;
    case 'uiTorpedo':
      drawIconTorpedo(ctx, size, opts);
      break;
    case 'uiBattery':
      drawIconBattery(ctx, size, opts);
      break;
    case 'uiHull':
      drawIconHull(ctx, size, opts);
      break;
    case 'uiNoise':
      drawIconNoise(ctx, size, opts);
      break;
    case 'uiDetection':
      drawIconDetection(ctx, size, opts);
      break;
    case 'uiDepth':
      drawIconDepth(ctx, size, opts);
      break;
    case 'uiPause':
      drawIconPause(ctx, size, opts);
      break;
    case 'uiSettings':
      drawIconSettings(ctx, size, opts);
      break;
    case 'uiMap':
      drawIconMap(ctx, size, opts);
      break;
    case 'uiLog':
      drawIconLog(ctx, size, opts);
      break;
    default:
      // Exhaustiveness guard: a kind added to SPRITE_MANIFEST without a draw
      // case fails loudly instead of silently rendering nothing.
      throw new Error(`[sprites] no draw function registered for kind "${String(kind)}"`);
  }
}
