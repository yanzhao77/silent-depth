# 传感器资料核验库说明

本目录是传感器数据库的**唯一来源依据**。`Tools/build_sensor_manifest.py` 与
`Tools/sensor_dataset.py` 会读取这里的 `*_SENSOR_REFERENCES.json`，把现实候选
条目的置信度、来源与平台关系合并进 `Manifest/sensor_manifest.json`。

## 文件

| 文件 | 覆盖 |
| --- | --- |
| `WEST_SENSOR_REFERENCES.json` | 美国、英国、法国（西方体系） |
| `EAST_SENSOR_REFERENCES.json` | 俄罗斯/苏联、中国、印度 |

## 置信度规则（写入数据库时严格遵守）

- `CONFIRMED`：至少**两条独立公开来源**一致确认系统与平台的对应关系，其中至少一条为
  **官方 / 政府 / 制造商 / 专业工程媒体**。
- `PROBABLE`：只有单条来源，或仅有非专业二手参考支持。
- `GAMEPLAY`：纯游戏科技树设定，不对应现实型号。
- `UNKNOWN`：公开资料不足，或型号未公开。

核验不到的现实候选会在合并时自动降级为 `UNKNOWN`，**绝不允许凭推测写 CONFIRMED**。

## 禁止事项

1. 不记录任何分类或作战参数（频率、声源级、探测距离、灵敏度、阵列增益等）。
2. 不把推测型号写成正式型号，不把概念型号写成服役型号。
3. 不把非声呐设备写成声呐。
4. 不引用论坛猜测、未署名转载或无法打开的链接。

## 复跑

```bash
python Tools/build_sensor_manifest.py --print-summary
```
