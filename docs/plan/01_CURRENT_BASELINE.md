# 当前实现与差距清单

检查日期：2026-09-14；分支：`ue4`；起始提交：`3062333`。
检查开始时 `git status --short` 无输出。本文件记录本轮源码检查和实际命令结果，
不继承旧报告中的完成率、测试数量或性能结论。

## 1. 检查边界

- 本机为 macOS 工作环境；本轮没有运行 Windows UE4 UBT 或 UE Automation。
- 没有打开真实 UE4 编辑器，没有检查二进制关卡中的全部蓝图逻辑。
- 下文“未发现”限于检查的 C++ 目录和文本配置，不等于已经穷尽二进制资产。
- 不使用“资产完成一大半”推算游戏完成百分比。

## 2. 代码事实与目标差距

| 领域 | 当前可定位事实 | 新产品尚需完成的工作 |
|---|---|---|
| 入口 | [默认地图配置](../../ue4/SilentDepthUE/Config/DefaultEngine.ini)区分游戏海洋场景与编辑器潜艇展厅 | 建立首次启动、港口与任务会话入口，不将展厅等同港口 |
| 游戏框架 | [GameMode](../../ue4/SilentDepthUE/Source/SilentDepthUE/SilentDepthGameMode.cpp)设置 Pawn 与 HUD | 接入会话、任务装载、结束与返回；没有看到完整生产流程 |
| 航行 | [Pawn](../../ue4/SilentDepthUE/Source/SilentDepthUE/SubmarinePawn.cpp)在 Tick 中积累固定步并直接调用 SubmarineStep | 将唯一仿真步进归属从表现 Pawn 移交会话拥有的仿真入口 |
| 规则 | [SubmarineCore](../../ue4/SilentDepthUE/Source/SilentDepthUE/Core/SubmarineCore.cpp)实现速度、深度、噪声、电池等 | 核潜艇资源规则需重新设计；不能把现在的耗尽上浮当首发默认 |
| 状态机 | [GameStateMachine](../../ue4/SilentDepthUE/Source/SilentDepthUE/Core/GameStateMachine.cpp)有菜单、战斗、结果状态转换 | 当前检索仅发现定义和测试引用，需生产接线和完整生命周期验证 |
| 装备效果 | [SDEquipmentEffects](../../ue4/SilentDepthUE/Source/SilentDepthUE/Core/Platform/SDEquipmentEffects.h)定义推进、传感器、防御能力 | 推进已被航行路径使用；传感器数值或防御标志不证明完整声呐与反制系统存在 |
| 科技树 | Core/TechTree 有加载、注册、解锁、研究、兼容、视图模型与测试文件 | 补产品级路线、初始拥有艇、指令执行、反馈与会话存档接线 |
| 控件 | [SDCodeWidgetBase](../../ue4/SilentDepthUE/Source/SilentDepthUE/UI/SDCodeWidgetBase.cpp)创建按钮与文字行 | 未发现 OnClicked 绑定及 CreateWidget/AddToViewport 的 C++ 生产入口；不能把行渲染测试当点击闭环 |
| HUD | [SilentDepthHUD](../../ue4/SilentDepthUE/Source/SilentDepthUE/SilentDepthHUD.cpp)绘制深度、速度、电池、噪声 | 缺目标、接触、火控、威胁、任务反馈的正式战斗界面 |
| 研究结算 | [研究账户](../../ue4/SilentDepthUE/Source/SilentDepthUE/Core/TechTree/TechTreeResearchAccount.cpp)接受任务 ID 和分数 | 检索到的调用在测试与显式探针；需接入真实任务结果并防同一场重复发奖 |
| 存档 | [SaveSubsystem](../../ue4/SilentDepthUE/Source/SilentDepthUE/SilentDepthSaveSubsystem.h)提供槽位、JSON 读写及校验接口 | 需验证会话级事务、断电恢复、运行中任务续玩和升级兼容，不能由注释推断成功 |
| 战斗系统 | 当前 C++ 文件树未发现完整接触、护航 AI、鱼雷仿真、任务结算运行时链 | 按新规格逐段建设，而不是从旧报告宣布迁移完成 |

现有测试文件包含 Core、科技树、装配、存档、控件等回归基础；本轮只阅读了相关源码，
没有运行这些 UE 测试，不报告它们当前通过。

## 3. 本轮实际检查

| 命令 | 结果 | 解释 |
|---|---|---|
| `git status --short` | 开始时干净 | 本轮文档修改不覆盖既有用户改动 |
| `npm run check:runtime-data` | 退出码 1 | `_sync_manifest.json` 与资产库不匹配 |
| `npm run check:asset-pipeline` | 退出码 1；11 通过、1 警告、45 错误 | 45 项为潜艇 Validation JSON 的 SHA-256 不匹配 |
| Windows UBT | `NOT VERIFIED` | 本轮没有 Windows UE 构建环境验证 |
| UE Automation | `NOT VERIFIED` | 未执行，不引用过去结果替代 |
| 编辑器、发布包、目标硬件 | `NOT VERIFIED` | 未观察视觉、安装、操作或性能 |

资产检查解析到 54 条潜艇清单、48 个 UE 平台条目，并验证回退平台存在。
这些是条目数，不是首发艇数、可玩艇数或验收通过数。警告涉及忽略 Yasen 历史副本目录。
哈希不匹配既可能是文件确实改变，也可能是清单陈旧；必须核对来源，不直接刷新哈希掩盖原因。
本轮不修复资产或生成副本，以保持文档设计任务的边界。

## 4. 近期阻塞与处理归属

| 编号 | 风险 | 后续处理 |
|---|---|---|
| BASE-001 | 同步清单漂移 | 追溯源文件差异，确认后走既有生成器，再跑两项检查 |
| BASE-002 | 45 个验证文件哈希不匹配 | 确认来源、变更与审计有效性；有意变更才更新治理记录 |
| BASE-003 | Pawn 同时承担步进与表现 | 在新玩法接入前建立唯一会话仿真所有权，复用现有纯规则 |
| BASE-004 | 科技树控件与研究结算没有已证实的生产闭环 | 从输入到服务事务到保存到反馈做端到端接线 |
| BASE-005 | 当前数据契约与新玩法不同 | 先批准规则，再修改配置、schema、存档迁移和测试 |
| BASE-006 | 首发目标硬件与 Steam 条件未确认 | 在性能优化和平台集成前记录具名环境及发行决策 |

## 5. 后续基线更新规则

执行代码任务时记录提交、脏工作区情况、配置指纹、命令、退出码、报告位置与环境。
只更新本次确实检查过的条目；历史结果保留日期，不以“已完成”覆盖未验证状态。
此文是 2026-09-14 快照，未来的运行结果可以替代它，但须保留可追溯的证据。

## 6. 文档补充轮的范围说明

0.2 版新增场景矩阵、首轮参数、存档恢复协议和内容目录，并细化全部设计分册。
这些文件是设计提案，不增加本页已实现功能、已导入艇、通过测试或性能结论。
补充轮再次执行了 §3 的两项 npm 检查：同步清单仍漂移，资产检查仍为 11 通过、1 警告、
45 个验证文件哈希错误，二者退出码均为 1。补文档没有使这些故障自动消失。
新增的 100 个场景是待执行验收用例，不与当前代码中的 Automation 测试数量相加。

实施前应重新运行基线检查；素材、平台、输入或 schema 改动须先检查当前文件和相关 diff，
不能只按本快照或内容提案推断合法性。此轮不覆盖既有用户/本任务的未提交文件。

文档专项检查已执行：16 份设计文件、60 个本地链接、71 张表、205 个定义编号，
100 个不重复场景、8 组组合、12 个正式任务及 60 个唯一种子；未发现结构或引用错误。
六个候选平台 ID 在当前平台表和潜艇目录均存在；仅验证条目，不验证可玩性或授权。
最低首通路线 3700 研究点与全部研究成本 4000 的算术核对通过，不是实机平衡结果。
本轮仍未执行 Windows UBT、UE Automation、编辑器观察、目标硬件和 Steam 平台验证。
