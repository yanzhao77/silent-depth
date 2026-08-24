# SILENT DEPTH 《深海猎手》

**2D 战术潜艇伏击游戏** — 在不完整信息下做决策:听 → 判 → 追 → 算 → 伏 → 攻 → 藏 → 逃。

纯 TypeScript 确定性引擎(headless-first)+ Canvas 2D + WebAudio 程序化音效 + 全程序化素材。完全离线运行,零运行时依赖,零第三方素材。

## 快速开始

```bash
npm install
npm run dev        # 开发 (http://localhost:5173)
npm run preview    # 预览生产构建
npm run test       # 358 项测试 (vitest)
npm run build      # 生成离线静态构建 → dist/
```

> 直接玩:构建后打开 `dist/index.html` 即可(无需服务器)。

## 操作

| 键 | 动作 |
|---|---|
| W / S | 加速 / 减速 |
| A / D | 左转 / 右转 |
| Q / E | 深度层切换 |
| Space | 主动声呐 Ping |
| F | 发射鱼雷(选中接触) |
| R | 静默运行 |
| G | 释放假目标 Decoy |
| P | 暂停 |
| Esc | 菜单 |

## 内容

- **5 个任务**:声呐训练 → 首次伏击 → 袭击护航队 → 重装护航 → 静默猎手(夜间+浓雾+强护航)
- **核心系统**:主动/被动声呐、接触不确定性收敛、渐进分类、敌方 AI 状态机(NORMAL→…→HUNTING)、护航编队与搜索模式、无自动锁定鱼雷火控、探测计与逃脱判定、种子化任务生成器、5 种天气
- **评分**:1000 Perfect / 800 Excellent / 600 Good / 400 Poor / <400 Failed

## 文档

- [docs/README.md](docs/README.md) — 完整说明(控制/任务/评分)
- [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) — 游戏设计 + 平衡目标
- [docs/GAME_ARCHITECTURE.md](docs/GAME_ARCHITECTURE.md) — 引擎架构与事件目录
- [docs/VISUAL_STYLE.md](docs/VISUAL_STYLE.md) / [docs/AUDIO_DESIGN.md](docs/AUDIO_DESIGN.md) / [docs/ASSET_PIPELINE.md](docs/ASSET_PIPELINE.md)
- [RELEASE_NOTES.md](RELEASE_NOTES.md) — v1.0.0 发布说明
- `reports/` — 生产证据(TEST / PLAYTEST / BALANCE / SECURITY / BUILD 报告)

## 生产背景

本项目由 **DeepSeek Software Factory** 自主生产(要求 → 设计 → 架构 → 实现 → 测试 → AI Playtest → 平衡 → 构建 → 交付),作为 GAME PRODUCTION BENCHMARK。全部素材程序化生成(CC0),零第三方版权素材,零运行时网络请求。
