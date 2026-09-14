# SILENT DEPTH 文档入口

更新日期：2026-09-14。

唯一产品是 UE4.27 独立游戏，目标在 Steam 发售。不再维护 Web 或进行双端玩法对照。

## 游戏规划

全部新产品规划集中在 [plan/README.md](plan/README.md)，包含 16 份设计分册、
场景矩阵、首轮参数、存档协议与内容目录。阅读前先看该目录的“最近审查待修项”。

这些资料仍是设计提案，不是已实现功能、无歧义最终规格或发售承诺。
产品决定见 [决策记录](plan/11_DECISIONS.md)，执行安排见 [开发路线](plan/09_ROADMAP.md)。

## 当前工程资料

- [科技树决策](UE4_TECH_TREE_DECISION_RECORD.md)、[科技树数据契约](UE4_TECH_TREE_SCHEMA.md)：
  当前已实现的数据与规则依据；变更时批准具体替代条款并审查兼容。
- [科技树执行记录](UE4_TECH_TREE_EXECUTION_PLAN.md)、[后续计划](UE4_TECH_TREE_NEXT_PLAN.md)：
  专项历史与工作记录；旧测试数量不能替代当前验证。
- [潜艇资产管线](SUBMARINE_MODULAR_ASSET_PIPELINE_PLAN.md)、[首批资产工单](UE4_BATCH_A_WORK_ORDER.md)：
  继续约束母版、许可、哈希、装配与导入；生产批次不等于首发可玩艇名单。
- [UE 工程入口](../ue4/README.md)：构建、当前启动行为与资产位置。
- [当前实现与差距](plan/01_CURRENT_BASELINE.md)：已检查的代码与实际验证记录。

## 历史资料

以下文件保留用于追溯，不再规定新产品玩法、数值、界面、跨端一致性或开发顺序：

- `GAME_DESIGN.md`、`GAME_ARCHITECTURE.md`：历史产品设计与架构。
- `UE4_27_MIGRATION_MASTER_PLAN.md`、`UE4_27_MIGRATION_PLAN.md`、
  `UE4_27_TARGET_ARCHITECTURE.md`、`UE4_REBUILD_PLAN.md`：已退役的移植目标与方案。
- `V2*`、`VISUAL_STYLE.md`、`AUDIO_DESIGN.md`、`ASSET_PIPELINE.md`：历史表现与工具说明。

不得据历史文件恢复浏览器工具链、同步旧平衡或执行双端轨迹比较。
旧报告的测试、帧率与视觉结论仅对当时环境有效；当前结果必须重新取得证据。
