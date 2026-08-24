# DeepSeek Software Factory — p-004 生产记录

本目录是 **SILENT DEPTH《深海猎手》** 的完整工厂生产记录(DeepSeek Software
Factory 自主生产,Game Production Benchmark)。游戏源码见仓库根目录;这里存放
生产过程的权威文档与证据。

## 目录

| 路径 | 内容 |
|---|---|
| `artifacts/` | 阶段产物:PHASE 0 审计报告、执行计划、需求基线、实现计划 |
| `requirements/` | 需求修订历史(rev-0001 基线 + rev-0002/0003 变更 + PHASE 16 演练变更) |
| `contracts/` | 角色契约(13 个游戏角色)与 16 道质量门槛 |
| `memory/` | 架构决策记录(ADR-001..005)、失败账本(F-001/F-002)、预算账本 |
| `plans/` | 计划(plan-v1 基线 / plan-v2 需求变更重规划) |
| `reports/` | 验收矩阵、FINAL_DELIVERY_REPORT、工厂 dashboard |
| `tasks/` | 任务 DAG(t-001..t-021,含恢复/变更任务,共 28 项) |

## 关键数字(FINAL_DELIVERY_REPORT)

- 需求 28/28 覆盖,测试证据 32/32 PASS
- 任务 28 项:18 完成 / 2 恢复 / 7 取消,0 失败未恢复
- 安全 PASS,构建通过,离线产物验证通过

## 生产流水线

```
PHASE 0 审计 → 1 设计 → 2 架构 → 3-8 引擎(核心/潜艇/声呐P0/AI/战斗/任务/世界)
→ 9-11 UI/素材/音频 → 12 测试(358项) → 13 AI Playtest(12次,5胜)
→ 14 平衡(证据驱动) → 15 离线构建 → 16 终验(需求变更演练 + 失败恢复演练)
```

> 机器可读的完整运行账本(events/traces/evidence/cost/failures JSONL、runs/
> 状态机)保留在工厂本地项目目录 `projects/p-004/`,需要时可按请求归档。
