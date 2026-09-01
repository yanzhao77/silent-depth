# V2.9 Capture Report

**Date:** 2026-09-01T03:49:10.963Z
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
| main-menu | UI CAPTURE | 100.0 | 14.7 | 377.2 | 170 | 15.5 |
| mission-select | UI CAPTURE | 100.0 | 13.9 | 143.9 | 238 | 19.1 |
| m01-clear-gameplay | GAMEPLAY CAPTURE | 100.0 | 7.1 | 112.4 | 324 | 5.5 |
| m01-hero-surface | GAMEPLAY CAPTURE | 100.0 | 12.8 | 116.3 | 343 | 11.6 |
| m05-night-hero | GAMEPLAY CAPTURE | 100.0 | 7.1 | 112.0 | 327 | 5.5 |
| m03-convoy-detected | GAMEPLAY CAPTURE | 100.0 | 11.0 | 204.6 | 393 | 26.4 |
| m04-storm-escort | GAMEPLAY CAPTURE | 100.0 | 7.1 | 111.3 | 320 | 5.6 |
| m05-fog-atmosphere | GAMEPLAY CAPTURE | 100.0 | 7.1 | 112.2 | 321 | 5.5 |
| periscope-view | GAMEPLAY CAPTURE | 100.0 | 11.5 | 131.9 | 405 | 5.7 |
| tactical-view | GAMEPLAY CAPTURE | 100.0 | 7.1 | 111.1 | 321 | 5.5 |
| torpedo-launched | GAMEPLAY CAPTURE | 100.0 | 11.1 | 208.5 | 432 | 24.0 |
| torpedo-hit | GAMEPLAY CAPTURE | 100.0 | 16.0 | 450.2 | 300 | 27.4 |

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

## deriveContactPresentation()

The `deriveContactPresentation()` function is an independent pure function
exported for unit testing. The production HUD contact list renders directly
from snapshot data (src/ui/hud.ts lines 1049–1082). The function is NOT
integrated into the production HUD rendering path. Both use consistent
data transformation logic (UNKNOWN contacts show Unknown, trueShipId not
leaked, uncertainty preserved).
