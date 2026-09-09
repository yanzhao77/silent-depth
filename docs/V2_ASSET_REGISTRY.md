# SILENT DEPTH V2.1 三维资产注册表

本注册表补充 `assets/registry.json` 中既有的二维战术精灵清单，覆盖 V2.1 Visual Fidelity Pass 所使用的运行时三维资产。所有条目均在本仓库中以程序化几何或着色器生成；**未下载、嵌入或再分发任何第三方模型或纹理**。

| ID | 名称 | 类型 | 来源 | 许可 | 格式 | 分辨率 / 拓扑 | SHA-256 |
|---|---|---|---|---|---|---|---|
| `v21-submarine-procedural` | 玩家潜艇：流线型耐压艇体、艇桥、潜望镜、五叶螺旋桨与鱼雷管 | 模型 | `src/renderer/procedural/submarineGeometry.ts`，仓库内程序化生成 | CC0 / 项目自有代码 | Three.js `BufferGeometry` | Lathe 32 段；艇桥 Capsule 8×12 段 | `203625a568ffdc8c48d16ad43c521796753b4c56c04b43c644f7efcea85590f6` |
| `v21-ships-procedural` | Merchant、Cargo、Tanker、Destroyer、Frigate 五类可辨识舰船 | 模型 | `src/renderer/procedural/shipGeometry.ts`，仓库内程序化生成 | CC0 / 项目自有代码 | Three.js `BufferGeometry` | 依舰型组合 Hull、Bridge、Mast、Weapon 与 Deck 细节 | `c59e310dfcae90ffb8686716cbbae9c088db7696492cc8e7fc573c1219e98e80` |
| `v21-ocean-shader` | 三层 Gerstner 波、Fresnel 反射、波峰泡沫与深度雾海面 | 环境着色器 | `src/renderer/three/OceanRenderer.ts`，仓库内程序化生成 | CC0 / 项目自有代码 | GLSL + Three.js PlaneGeometry | 80 km × 80 km；300 × 300 网格 | `4438419c1cb4e111dc88ee3e0d47dabe666e23d425b0b3cccf69c9c69bf80b8a` |
| `v21-sky-shader` | 海军氛围天空、云层、太阳/月亮、星空与地平线雾 | 环境着色器 | `src/renderer/three/SkyRenderer.ts`，仓库内程序化生成 | CC0 / 项目自有代码 | GLSL + Three.js SphereGeometry | 半径 120 km；48 × 24 段 | `462a37dc069753b4b76b015ed083901abfd212d648b8d2f8313633fed434c7d3` |
| `v21-effects-procedural` | 声呐环、冲击波、命中闪光、烟雾/碎屑与水面扰动 | 特效 | `src/renderer/three/EffectsManager.ts`，仓库内程序化生成 | CC0 / 项目自有代码 | Three.js 几何体与点精灵 | 64 段声呐环；48 段冲击环；40 粒子池 | `753d2431767baafc0422b3df6b7c2ecc7769fb3009033ecdda55899855e674fa` |

> **许可结论。** V2.1 保持程序化资产策略。若未来引入外部模型或纹理，必须先在此表和 `assets/registry.json` 中记录来源 URL、明确许可证、文件格式、原始分辨率与 SHA-256，且不得使用来源或版权不明的资源。
