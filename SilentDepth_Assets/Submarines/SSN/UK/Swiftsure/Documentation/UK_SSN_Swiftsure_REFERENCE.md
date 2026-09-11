# UK_SSN_Swiftsure Swiftsure（快捷级）

> 资料状态：【已有】资料文档【缺失】模型【待建模】・最后更新：2026-09-10

## 1. 身份与定位

- 国家：英国（Royal Navy）
- 艇型：SSN（核动力攻击潜艇）
- 级：Swiftsure class（快捷级）
- 建造厂：Vickers Shipbuilding and Engineering Ltd.（VSEL，Barrow-in-Furness）
- 前型：Churchill class；后型：Trafalgar class
- 服役期：1973-04-17 至 2010-12-10，共建造 6 艘，全部退役
- 现役状态：全部退役，本级已无在役艇

同级 6 艘（舷号 / 服役 / 退役）：

| 艇名 | 舷号 | 退役 |
|---|---|---|
| HMS Swiftsure | S126 | 1992（试航中耐压壳受损，提前退役） |
| HMS Splendid | S106 | 2004 |
| HMS Spartan | S105 | 2006-01 |
| HMS Sovereign | S108 | 2006-09-12 |
| HMS Superb | S109 | 2008-09-26 |
| HMS Sceptre | S104 | 2010-12-10（本级最后一艘） |

【已有】本级 6 艘全部退役，公开照片充足，适合作为外形还原的参考对象。

## 2. 尺度与外形

| 项目 | 数值 |
|---|---|
| 全长 | 82.9 m |
| 艇体宽（Beam） | 9.8 m |
| 吃水 | 8.5 m |
| 排水量（标准） | 4,400 t |
| 排水量（水下） | 4,900 t |

外形特征（面向建模）：

- 艇体**在很大一段长度上保持等直径**，比前型 Churchill/Valiant 更接近圆柱形，中段没有明显收缩。【待建模】
- 与 Valiant 级相比**短 4.0 m、线型更饱满**，这是区分两级的首要外形依据。【待建模】
- **艏水平舵位置比前型更靠前**（fore-planes set further forward）。【待建模】
- 围壳（sail）位于艇体前部，舵面为艇艏水平舵 + 艉十字舵布局，无 X 型舵。【待建模】
- 鱼雷发射管比 Valiant 少一具（5 具 vs 6 具），艇艏开口排布需按 5 管还原。【待建模】
- 潜深大于前型，但外观上不体现差异。【待确认】

## 3. 动力

- 推进形式：核动力（Nuclear Reactor），压水堆。
- 具体堆型：**Rolls-Royce PWR1**【待确认】——维基信息框只写 "Nuclear Reactor"，本级与 Valiant 级同代，公开资料普遍记为 PWR1，但本次检索未取得直接引用。
- 推进器：单轴螺旋桨（本艇未采用泵喷）。【待确认】
- 限速：**潜航超过 28 kn**。
- 续航：无限（核动力）。

【缺失】反应堆功率、螺旋桨叶数、轴功率均未取得可靠公开数据。

## 4. 武备

- **发射管：5 具 533 mm（21 英寸）鱼雷发射管，全部布置在艇艏。**
- 发射管长度：**UNKNOWN**【缺失】——需要按所用鱼雷长度反推（Spearfish 弹长见下）。
- 可发射武器：

| 武器 | 口径 | 弹长 | 用途 | 备注 |
|---|---|---|---|---|
| Spearfish 鱼雷 | 533 mm | 约 7.0 m【待确认】 | 反潜／反舰重型鱼雷 | 本级主力武器 |
| UGM-84 Sub-Harpoon | 533 mm | 约 6.4 m（含运载舱）【待确认】 | 反舰导弹 | 约 2004 年前使用 |
| BGM-109 Tomahawk | 533 mm | 约 6.25 m（含助推器）【待确认】 | 对陆攻击巡航导弹 | 并非全级加装 |

- 载弹总量：UNKNOWN【缺失】（Valiant 级为 26 枚级，本级未取到明确数字）。
- 装填方式：UNKNOWN【缺失】，推测为管内 + 舱内再装填【推测】。
- 【不许推断】鱼雷管具体内构、发射系统压力参数等细节不做还原。

## 5. 传感器与电子设备

维基信息框给出的配置（型号未列出）：

- 艇艏声呐（bow sonar）
- 舷侧阵声呐（flank array）
- 主动截获声呐（active intercept）
- 拖曳阵声呐（towed array）
- 潜望镜：攻击潜望镜 + 搜索潜望镜（各一具）
- 避碰雷达（collision avoidance radar）

【缺失】具体型号（如 Type 2020 / 2026 / 2076 系列的具体配置与改装时间线）未在本次检索中取得，需专门补充。
【待建模】潜望镜与桅杆数量、围壳顶部布置需要按实艇照片还原——本级有"攻击 + 搜索"两具潜望镜。

## 6. 潜深与乘员

- 编制：**116 人（其中军官 13 人）**
- 工作深度：UNKNOWN【缺失】
- 极限深度：公开资料称"比 Valiant 级更深"【待确认】，无具体数字

## 7. 建模要点

建模时需要还原的关键外形特征，逐条列出：

1. 等直径艇体——中段保持圆柱剖面，不要做成前后都被收窄的梭形。【待建模】
2. 全长 82.9 m / 宽 9.8 m / 吃水 8.5 m 的整体比例。【待建模】
3. 艏水平舵位置在艇体前部靠前处（比 Valiant 更靠前）。【待建模】
4. 艉部为十字舵 + 单轴螺旋桨。【待建模】
5. 围壳外形与顶部桅杆群：两具潜望镜 + 若干天线桅。【待建模】
6. 艇艏 5 具 533 mm 发射管开口，按真实排布（单排纵向排列）建模。【待建模】
7. 消音瓦覆盖范围（本级为英国核潜艇消音瓦时代产物）【待确认】。

## 8. 待办与不确定项

**模型缺口**

- 【缺失】本艇完全没有模型：目录下无 `FBX/`、无 `Preview/`、无 `Blend/`。
- 【缺失】没有任何贴图与材质。
- 【缺失】没有碰撞体。

**资料缺口（影响建模精度）**

- 【缺失】5 具鱼雷发射管的**管长**——直接影响发射舱内构与舱盖位置。
- 【缺失】鱼雷发射管的精确间距与在艇艏断面上的排布。
- 【缺失】具体反应堆型号、功率，以及螺旋桨叶数（决定艉部造型）。
- 【缺失】舷侧阵声呐的覆盖范围与外形表现（是否在艇体表面可见）。
- 【缺失】消音瓦的分块方式与覆盖区域。
- 【待确认】工作深度与极限深度。
- 【待确认】维基信息框中"标准排水量 4,400 t"与部分资料给出的数值可能有出入，需要核对。

**需要人工确认的事项**

- 【待确认】本级是否所有艇都加装了 Tomahawk（信息框注"not all fitted"）。
- 【待确认】Sub-Harpoon 的退役时间点（约 2004 年）。

**参考图使用限制**

- 本次下载 4 张参考图，全部为公开照片（含 MOD 版权与来源不明者各若干），**仅限本地审阅，不得进入运行时资产包**。许可状态逐张记录在 `References/PROVENANCE.json`。

## 9. 资料来源

- [Swiftsure-class submarine — Wikipedia](https://en.wikipedia.org/wiki/Swiftsure-class_submarine)　访问 2026-09-10　许可：CC BY-SA 4.0
- [Swiftsure-class Submarines — Specifications — GlobalSecurity.org](https://www.globalsecurity.org/military/world/europe//hms-swiftsure-specs.htm)　访问 2026-09-10　许可：UNKNOWN
- [Swiftsure class Attack Submarine SSN — SeaForces.org](https://www.seaforces.org/marint/Royal-Navy/Submarine/Swiftsure-class.htm)　访问 2026-09-10　许可：UNKNOWN
- [Swiftsure class SSN (1971) — Naval Encyclopedia](https://naval-encyclopedia.com/cold-war/uk/swiftsure-class.php)　访问 2026-09-10　许可：UNKNOWN

本艇共下载参考图 4 张，清单见 `References/PROVENANCE.json`。
