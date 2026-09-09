# V2.2.5 Final Cinematic Visual QA — Field Notes

## Session and scope

- Inspection method: real Chromium game instance, visual observation only.
- Source scope: current V2.2 build at `http://localhost:5173/`.
- QA constraint: no source code, configuration, gameplay, simulation, AI, sonar, mission, map, save, or rule changes are made in this review.
- The task selector shows M01 Sonar Training, M02 First Ambush, M03 Convoy Attack, M04 Heavy Escort, and M05 Silent Hunter as available.

## Early observation

The title/menu presentation is clean but utilitarian. It establishes a dark naval control-room tone, yet it does not itself sell a premium 3D scene because the menu background is near-black and has no dramatic in-engine world composition.


## M01 — Clear / player submarine

M01 在 RUNNING 状态稳定显示。清朗场景的海天色阶比菜单更可读，但玩家潜艇大部分区域仍落入近黑色，艇桥形成的剪影可见而材质、船体分区和甲板细节在该构图中不可读。中央世界画面被左右面板和底部事件区显著压缩；HUD 比世界物体更具对比与文字密度。此观察将用于潜艇、HUD、光照、海面和 Steam 截图评分。


## M01 — Active sonar

主动声呐后，右侧接触卡显示 `Large Surface`、7.4 km、方位 262°、25% 置信度和最近看见时间。此信息仍保持明确的不确定性而非伪精确目标解；但画面中的声呐回波/环形传播在当前远景与深色世界画面中并不成为强烈视觉焦点，玩家视觉首先仍落在高密度 HUD 文本而非海中声波现象。


## M02 — First Ambush initial view

M02 的清朗实战画面延续 M01 的构图问题：潜艇在中心偏左的深色海域可见总体轮廓，但由于船体正面与水下区域缺乏明确的受光分区，远看更接近黑色程序化实体而非可读的湿润钢制艇体。将以既有声呐、接触选择和鱼雷操作观察实际战斗反馈；如在正常可用流程中没有形成命中镜头，报告将如实标记为“未取得有效的游戏内镜头”，而不会使用代码或伪造截图替代。


## M02 — Combat observability

在正常游戏内流程中触发主动声呐后，M02 没有在当前时间窗口形成可选择接触，任务在 00:32 记录 `ESCAPED`。因此本轮 QA **未取得**可诚实评分的实时鱼雷尾迹、命中、爆炸、冲击波、残骸或烟雾镜头；最终报告将把战斗效果评分限定为既有可见呈现证据，并将“关键战斗时刻缺乏可复现的 Steam 截图构图”列为视觉交付差距，而非以代码实现推断画面质量。


## M04 — Storm hero scene

M04 在一秒内可明确辨认为风暴：天空具有厚重分层云纹，雨点可见，色温转冷，世界亮度下降。优点是天气类别可读，且云层比清朗场景具有更强的纵深。缺点是关键战斗画面并未形成“护航舰队穿越暴雨”的可售卖构图：玩家潜艇仍是近黑色的侧后方小物体，舰船未进入可读距离，海面在这个高度与曝光下仍像低频暗色镜面，几乎没有可识别的白沫、浪脊、喷溅或舰船尾流。HUD 覆盖和标注框进一步削弱沉浸感。因此该画面尚未达到 Steam 商店英雄截图级别。


## M05 — Night / low light

M05 可在一秒内被辨认为夜间：星点、冷暗海天和低照度剪影建立了正确氛围；但月亮、月面反射、远处船舶航行灯与雾中层次在当前画面中基本不可用作阅读线索。潜艇并非完全消失，但仅保留边缘黑影和一条不属于世界的白色方向辅助线，缺少能让玩家读出艇桥、湿润船体与水线的受光关系。夜间整体更像技术氛围背景，而不是可用于商店展示的夜海潜伏镜头；HUD 再次是亮度与密度的主导视觉元素。


## M05 — Periscope

潜望镜在视觉语言上明确属于 **C. submarine periscope**，而非通用 HUD 或 FPS 瞄具：圆形遮罩、中心十字、方位标记、镜片边缘、曝光条和潜望镜专用控制建立了正确的类别认知。其不足是光学区中的世界仍接近空的暗蓝平面，水滴、镜头失真、外部目标和远处导航灯没有形成可靠画面层次；类型/方位/距离等资料卡与底层 HUD 同时存在，造成轻度重复。作为“核心视觉卖点”，框架正确、细节尚未达到高品质潜艇游戏的电影化光学镜头标准。


## M03 — Convoy visibility

M03 已在真实 Chromium 中进入 RUNNING，并在任务简报中明确显示 4 艘 merchant 与 1 艘 escort 的车队语义。实际运行构图仍未把任何敌舰带到能核验船体、舰桥、桅杆、雷达、甲板、舷窗或导航灯的屏幕距离；当前画面再次以潜艇黑色剪影、深蓝海面和大面积 HUD 为主。因此不能把“已经存在五类舰船”误报为最终视觉上已经可区分五类舰船。对 Merchant、Cargo、Tanker、Destroyer 与 Corvette/Frigate 的结论将明确区分“任务存在”和“最终画面未取得可评级镜头”。
