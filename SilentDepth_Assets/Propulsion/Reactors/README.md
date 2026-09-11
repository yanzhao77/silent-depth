# Reactors（反应堆）— DATABASE_ONLY

## 策略

本目录**不产出内部核反应堆工程模型**。项目规则明确禁止：

- 核燃料配方、燃料制造流程
- 核材料参数
- 反应堆内部敏感结构
- 任何功率、温度、压力、寿命数值

## 本目录允许的内容

只有公开资料层面的**世代条目**，存放在：

- `../TechnologyTree/propulsion_technology_tree.json` → `BRANCH_REACTOR`
- `../Documentation/research/powerplant_research.json` → `reactor_generations`

世代标签（T1–T10）：Early Naval Reactor、Improved Naval Reactor、Compact Reactor、
Advanced Naval Reactor、Improved Core-Life Reactor、Modern Naval Reactor、
Advanced Long-Life Reactor、Integrated Advanced Reactor、Next Generation Reactor、
Future Naval Reactor。

## 如果将来游戏需要可视化

只允许两种形式：

1. **External Module**：反应堆舱段的外部模块外形（不含内部结构）。
2. **Educational Cutaway**：明确标注为教学示意、非工程复原的剖切图。

在任何一种形式落地之前，该分支保持 `DATABASE_ONLY`。
