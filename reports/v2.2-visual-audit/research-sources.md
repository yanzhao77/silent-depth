# V2.2 研究证据索引

本文件仅记录已用于 V2.2 规格的公开研究来源、其可支持的事实和使用边界。项目代码、截图和浏览器现场观察另见同目录的 `live-observations.md`。

## 竞品基准

| 编号 | 来源 | 可核验事实 / 用途 |
|---|---|---|
| C1 | [Cold Waters — Steam](https://store.steampowered.com/app/541210/Cold_Waters/) | 官方列出实时海战、40+ 舰船/潜艇类别、真实声呐与战术；用作“战术信息与舰种识别”参考。 |
| C2 | [UBOAT — Steam](https://store.steampowered.com/app/494840/UBOAT/) | 官方将其定位为 WWII 潜艇生存沙盒，并强调可用潜望镜、听音器和甲板炮；不应把其舱内/船员管理范围直接纳入本项目。 |
| C3 | [Barotrauma — Steam](https://store.steampowered.com/app/602960/Barotrauma/) | 官方明确其为 2D 科幻合作生存游戏；仅借鉴“用受限可见性放大压力”的抽象方法，拒绝其科幻、怪物与横版切面语言。 |
| C4 | [Wolfpack — Steam](https://store.steampowered.com/app/490920/Wolfpack/) | 官方说明其为第一人称多人 U-boat 模拟，强调手动操作、站位和舰船识别手册；用作拟物仪表与舰影识别参考。 |
| C5 | [Silent Hunter III — Steam](https://store.steampowered.com/app/15210/Silent_Hunter_III/) | 系列代表性商店页；结合地图/潜望镜/识别手册的历史战术语境。 |
| C6 | [Destroyer: The U-Boat Hunter — Steam](https://store.steampowered.com/app/1272010/Destroyer_The_UBoat_Hunter/) | 反潜护航视角的视觉反例与拟物岗位信息参考。 |
| C7 | [World of Warships — Graphics Update](https://worldofwarships.com/en/news/general-news/graphics-update-review/) | 用于评估商业级舰船剪影、天气和海面反射的视觉上限；不采用其街机化目标高亮。 |

## 官方视频观察

| 编号 | 来源 | 可用结论 |
|---|---|---|
| V1 | [UBOAT Full Release Official Trailer](https://www.youtube.com/watch?v=Pu93U02aUjo) | 已使用视频分析审阅了晴天、夜雾、水下、爆炸、俯视战术图、第一人称舱室、潜望镜和关键镜头切换。可借鉴黑场标题卡、窄 FOV、低照度舰影、爆炸局部照明；不能照搬全 3D 舱室、密集动态光源、物理流体或高成本粒子。 |

## 资产许可证与合规边界

| 编号 | 官方来源 | 已核验结论 |
|---|---|---|
| A1 | [Poly Haven License](https://polyhaven.com/license) | 站内 HDRI、纹理和模型为 CC0；可商用、修改、再分发，无强制署名。仅可下载实际 CC0 资产文件，不能擅自复用网站 logo、文案或示例渲染图。 |
| A2 | [Kenney Support / License](https://kenney.nl/support) | 官方说明资产页游戏资源为 CC0，可用于商业项目，无需署名；不得使用 Kenney 标识。 |
| A3 | [Quaternius FAQ](https://quaternius.com/faq.html) | 该页面未在可提取文本中给出完整许可原文；在未取得每个包附带 LICENSE 或明确资产页许可前，仅可作为候选来源，不列为已批准生产资产。 |
| A4 | [NASA Images and Media Guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/) | NASA 内容通常不受美国版权保护，但可能包含第三方版权材料；商用还受标识、背书、人物肖像等限制。仅用于参考或逐项核验后使用，不作为“自动 CC0”来源。 |
| A5 | [Sketchfab CC0 search — submarine](https://sketchfab.com/3d-models/subling-by-tom-mckendrick-9f53ad31be294554a4c4915ed823a41c) | 仅在逐项确认页面的可下载性、许可证字段、作者信息、导出格式和所含纹理后，才可进入资产闸门；不将平台级搜索结果当作许可证明。 |
| A6 | [OpenGameArt — Low Poly Ship Pack](https://opengameart.org/content/lowpoly-ship-pack) | 必须逐页读取作者声明与许可字段；可作为低优先级道具/原型候选，不自动批准为英雄资产。 |

> **合规结论。** V2.2 推荐“程序化基础 + 经验证的 CC0 PBR 材质/HDRI + 仅在单个资产页核验后才引入的 GLB”混合管线。所有外部文件在下载前必须满足项目现有 `docs/ASSET_PIPELINE.md` 的 Discover → Evaluate → License Check → Acquire → Process → Register → Validate → Integrate 流程。


## 追加核验：官方页面的直接证据

| 编号 | 直接证据 | 对 V2.2 的约束 |
|---|---|---|
| C8 | [Silent Hunter III — Steam](https://store.steampowered.com/app/15210/Silent_Hunter_III/) 明确宣传电影化图形、真实 3D 水体、昼夜、天气与历史准确的舰船/潜艇。 | 证明“电影感 + 可玩性”并不等于堆叠 HUD；可参考其环境优先、信息渐进的目标。 |
| C9 | [Destroyer: The U-Boat Hunter — Steam](https://store.steampowered.com/app/1272010/Destroyer_The_UBoat_Hunter/) 明确列出随机天气/时段、详细 Fletcher 级模型和五个 3D 岗位。 | 仅借鉴场景化仪器、天气和舰种可信度；不把完整岗位/内舱系统纳入本次 WebGL 升级。 |
| C10 | [World of Warships: Graphics Update Review](https://worldofwarships.com/en/news/general-news/graphics-update-review/) 说明其采用 HDR 光照、按图逐步调整天空/间接光；重做海面反射、日光路径、波浪和尾迹，并把效果性能优化与峰值 FPS 直接关联。 | 采用“统一光照和材料校准先行、效果要服务于判读、质量档位同时改善低/中配”的原则；不复制其 FFT 海洋、全量岛屿和商业级内容规模。 |
| C11 | [Wolfpack 官方网站](https://www.wolfpackgame.com/) 声明具有完整 U-boat 内舱与动态柴油机。 | 该沉浸上限可作取景和材质参考，但对当前项目属于范围外系统，必须使用廉价的选择性细节替代。 |
| V2 | [UBOAT Full Release Official Trailer](https://www.youtube.com/watch?v=Pu93U02aUjo) 的一手视觉分析记录了 0:03 晴天海面、0:12 夜雾、0:34 火光局部照明、0:42 水下雾/气泡、0:13 潜望镜光学环与 0:23 战术图。 | 优先采用预设化天气、黑场标题转场、窄 FOV 潜望镜、背光舰影和低成本 GPU/DOM 效果；拒绝完整动态内舱、物理流体与密集动态点光源。 |
