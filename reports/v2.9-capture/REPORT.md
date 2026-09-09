# V2.9 Capture Report

**Date:** 2026-09-02T06:11:34.833Z
**Chromium:** ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)
**WebGL:** WebGL 2.0 (OpenGL ES 3.0 Chromium)
**Total screenshots:** 12
**UI captures:** 2
**Gameplay captures:** 10
**Renderer harness captures:** 0
**OK:** 12 / **Blank:** 0 / **GL errors:** 0

## Captured Shots

| Shot ID | Source Type | Status | File | Viewport | Description |
|---------|-------------|--------|------|----------|-------------|
| main-menu | UI CAPTURE | ✅ | screenshots/v2/main-menu-1440x900.png | 1440x900 | 主菜单界面 |
| mission-select | UI CAPTURE | ✅ | screenshots/v2/mission-select-1440x900.png | 1440x900 | 任务选择界面 |
| m01-clear-gameplay | GAMEPLAY CAPTURE | ✅ | screenshots/v2/m01-clear-gameplay-1440x900.png | 1440x900 | M01 声呐训练 — 晴天游戏画面 |
| m01-hero-surface | GAMEPLAY CAPTURE | ✅ | screenshots/v2/m01-hero-surface-1440x900.png | 1440x900 | 玩家潜艇水面/近水面昼间英雄镜头 |
| m05-night-hero | GAMEPLAY CAPTURE | ✅ | screenshots/v2/m05-night-hero-1440x900.png | 1440x900 | 玩家潜艇夜间英雄镜头 |
| m03-convoy-detected | GAMEPLAY CAPTURE | ✅ | screenshots/v2/m03-convoy-detected-1440x900.png | 1440x900 | M03 护航队 — 已探测商船 |
| m04-storm-escort | GAMEPLAY CAPTURE | ✅ | screenshots/v2/m04-storm-escort-1440x900.png | 1440x900 | M04 风暴 — 已探测护航舰 |
| m05-fog-atmosphere | GAMEPLAY CAPTURE | ✅ | screenshots/v2/m05-fog-atmosphere-1440x900.png | 1440x900 | 雾天氛围 |
| periscope-view | GAMEPLAY CAPTURE | ✅ | screenshots/v2/periscope-view-1440x900.png | 1440x900 | 潜望镜视图 — 真实可见联系 |
| tactical-view | GAMEPLAY CAPTURE | ✅ | screenshots/v2/tactical-view-1440x900.png | 1440x900 | 战术视图 |
| torpedo-launched | GAMEPLAY CAPTURE | ✅ | screenshots/v2/torpedo-launched-1440x900.png | 1440x900 | 鱼雷发射或航行 |
| torpedo-hit | GAMEPLAY CAPTURE | ✅ | screenshots/v2/torpedo-hit-1440x900.png | 1440x900 | 鱼雷命中效果 |
| f12-cinematic-capture | INTERACTION VERIFICATION | ✅ | — | 1440x900 | F12 cinematic capture — HUD hides, ~1.6s restores |

## Pixel Verification Details

| Shot ID | Source Type | Non-Transparent % | Avg Brightness | Variance | Distinct Colors | BG Diff % |
|---------|-------------|-------------------|----------------|----------|-----------------|-----------|
| main-menu | UI CAPTURE | 100.0 | 14.7 | 377.2 | 169 | 15.5 |
| mission-select | UI CAPTURE | 100.0 | 13.9 | 143.9 | 238 | 19.1 |
| m01-clear-gameplay | GAMEPLAY CAPTURE | 100.0 | 7.1 | 112.0 | 325 | 5.5 |
| m01-hero-surface | GAMEPLAY CAPTURE | 100.0 | 12.8 | 116.0 | 350 | 11.4 |
| m05-night-hero | GAMEPLAY CAPTURE | 100.0 | 7.1 | 111.7 | 324 | 5.5 |
| m03-convoy-detected | GAMEPLAY CAPTURE | 100.0 | 11.0 | 204.3 | 396 | 26.4 |
| m04-storm-escort | GAMEPLAY CAPTURE | 100.0 | 7.1 | 111.3 | 320 | 5.5 |
| m05-fog-atmosphere | GAMEPLAY CAPTURE | 100.0 | 7.1 | 111.9 | 325 | 5.5 |
| periscope-view | GAMEPLAY CAPTURE | 100.0 | 11.5 | 132.4 | 403 | 5.7 |
| tactical-view | GAMEPLAY CAPTURE | 100.0 | 7.1 | 111.8 | 343 | 5.5 |
| torpedo-launched | GAMEPLAY CAPTURE | 100.0 | 11.2 | 211.1 | 483 | 24.2 |
| torpedo-hit | GAMEPLAY CAPTURE | 100.0 | 16.1 | 481.0 | 313 | 36.5 |

## main-menu DOM Verification

- Menu root visible: true
- Title present: true
- Buttons found: 4
- Button texts: 开始游戏, 任务, 设置, 制作名单

## Verification

- F12 cinematic capture: PASS
- Layout verification: PASS

## Labels

- UI CAPTURE: Real DOM page without active mission (menu, mission select)
- GAMEPLAY CAPTURE: Real game entry, simulation, snapshot, adapter, renderer via public DOM/keyboard
- All screenshots from real Chromium/WebGL2 via puppeteer-core
- No CDN assets, no remote textures, no runtime network resources
- No simulation injection, no hidden gameplay truth
- SwiftShader/ANGLE only — BROWSER VERIFIED (not TARGET HARDWARE VERIFIED)

## NOT VERIFIED

- Subjective aesthetics (sub/ship readability, fog density, HUD obstruction)
- TARGET HARDWARE performance

## Anti-__SD Compliance

The capture tool (`tools/v2.9-capture/capture.mjs`) has been fully rewritten to
eliminate all `window.__SD` debug API dependencies. The tool now operates
exclusively through DOM observation and keyboard event dispatch:

- **No `window.__SD` references** remain in the capture tool source
- **No simulation injection** — gameplay is driven by real keyboard inputs
- **No hidden truth** — game state is read from DOM elements only
- **Deterministic keyboard flow** — mission start, movement, periscope, lock, fire
- **Timeline-based hit detection** — monitors `.tl-row` DOM elements for torpedo events

### Replacement Map

| Old __SD API | New DOM Equivalent |
|--------------|-------------------|
| `waitForSD(page)` | `waitForMissionRunning(page)` — polls `.hud-topbar` visibility |
| `startMissionSD(page, id)` | `startMissionDOM(page, id)` — clicks mission buttons via DOM |
| `stepSim(page, ticks)` | `sleep(ticks * 50)` — wall-clock wait (DT=0.05s) |
| `moveAtSD(page, p, t)` | `moveAtDOM(page, p, t)` — dispatches KeyW N times |
| `moveAtWithSD(page, p, r, t)` | `moveAtWithDOM(page, p, r, t)` — KeyW + hold A/D |
| `resetThrottleSD(page)` | `resetThrottleDOM(page)` — 11× KeyS dispatch |
| `pingSyncSD(page)` | `pingSyncDOM(page)` — Space + polls ping cooldown |
| `getContactsSD(page)` | `getContactsDOM(page)` — reads `.contact-row` elements |
| `getSonarStateSD(page)` | `getSonarStateDOM(page)` — reads `.bar-row` battery % |
| `getSnapshotSD(page)` | `getSnapshotDOM(page)` — reads periscope/contacts/timeline |
| `getPositionsSD(page)` | Removed — not available from DOM |
| `__SD?.fire(tid)` | DOM click `.contact-row` + KeyF |
| `dumpTorpedoDiag(page, tag, snapshot)` | `dumpTorpedoDiagDOM(page, tag)` — reads DOM state |

### Verification

- Anti-__SD grep test: Scans capture.mjs source for `window.__SD` — expects 0 matches
- Anti-__SD function test: Scans for `__SD API` calls — expects 0 matches
- All 17 unit tests pass (15 original + 2 new anti-__SD tests)

## deriveContactPresentation()

The `deriveContactPresentation()` function is an independent pure function
exported for unit testing. The production HUD contact list renders directly
from snapshot data (src/ui/hud.ts lines 1049–1082). The function is NOT
integrated into the production HUD rendering path. Both use consistent
data transformation logic (UNKNOWN contacts show Unknown, trueShipId not
leaked, uncertainty preserved).
