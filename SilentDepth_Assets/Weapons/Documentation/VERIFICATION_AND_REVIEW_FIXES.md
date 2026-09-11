# 审查结论与整改验证

生成时间：2026-09-11

本文记录武器资产工厂的代码审查结论（由独立只读审查分包给出）以及每一条的整改与验证证据。
所有数字来自实际产出的 JSON，不来自人工估算。

## 整改清单

| 编号 | 问题 | 状态 |
| --- | --- | --- |
| P0-1 | 跨家族几何近似重复（复制改名风险） | 已整改并验证 |
| P1-1 | 唯一性审计与生产路径不一致 | 已整改 |
| P1-2 | 生产队列永远到不了 COMPLETE，且统计口径不一致 | 已整改 |
| P1-3 | Blender 崩溃时整批失败被静默吞掉 | 已整改 |
| P1-4 | 生产决策未被执行，DEFERRED 集合仍被建模 | 已整改并如实登记 |
| P1-5 | 650 毫米武器被标为兼容，但发射接口里没有 650 毫米插座 | 已整改 |
| P1-6 | 插座命名不符合规范，且资产侧插座不存在 | 已整改（3 艘本地有模型的潜艇） |
| P1-7 | 校验器无法验证 FBX 本体，TESTED 标签偏乐观 | 已整改 |
| P2-1 | 重建采用"先归档再构建"，中断会留下半成品目录 | 已知，未整改 |
| P2-2 | Blender 路径硬编码、档案目录无清理策略 | 已知，未整改 |

### P0-1 跨家族几何近似重复（复制改名风险）

- 状态：已整改并验证
- 整改：几何工具增加"家族外形签名"：头部剖面样式、尾段样式、控制面数量、后掠、剖面比例（头部 12%-29%、尾段 8%-22% 全长）与结尾区分特征按家族派生；同家族变体仍共享基础几何（符合 Family->Variant 规则）。
- 证据：Tools/weapon_geometry_kit.py::family_shape_signature / normalize_params；Manifest/weapon_geometry_distinctness.json

### P1-1 唯一性审计与生产路径不一致

- 状态：已整改
- 整改：新增 audit_geometry_distinctness.py：审计使用与 build_weapon_assets.py 完全相同的 spec（含 family_id），并改用侧影剖面度量替代会被共同圆柱体掩盖的顶点最近邻统计。
- 证据：Tools/audit_geometry_distinctness.py；Manifest/weapon_geometry_distinctness.json

### P1-2 生产队列永远到不了 COMPLETE，且统计口径不一致

- 状态：已整改
- 整改：detect_state 改为读取 Validation/{id}_VALIDATION.json 的 PASS 结论后返回 COMPLETE；status_counts 只统计本轮生产集合，字段口径统一。
- 证据：Tools/build_production_queue.py；Manifest/weapon_production_queue.json

### P1-3 Blender 崩溃时整批失败被静默吞掉

- 状态：已整改
- 整改：批次结果解析失败（进程崩溃/被杀/未打印结果行）时，显式把该批全部武器标记 FAILED 并写入 blocking_conditions 与 retry_queue，同时保留日志尾部。
- 证据：Tools/build_weapon_assets.py::run_batch（raw_decode 解析 + 空结果兜底）

### P1-4 生产决策未被执行，DEFERRED 集合仍被建模

- 状态：已整改并如实登记
- 整改：生产决策改为数据集中显式声明：MODEL_NOW（第一批 46 个）与 MODEL_EXTENDED（第二批：数据完整且与既有平台有兼容关系的非数据库条目），共 120 个；DATABASE_ONLY 4 个不建模。重建集合不再依赖磁盘状态，命令可复现。
- 证据：Tools/weapon_production_curation.py；Tools/build_weapon_assets.py --all-built

### P1-5 650 毫米武器被标为兼容，但发射接口里没有 650 毫米插座

- 状态：已整改
- 整改：为 Akula（4 具，PUBLIC）、Sierra（2 具，PUBLIC）、Victor（2 具，PROBABLE）补充 650 毫米发射管与对应插座，并在接口中输出 tube_diameters_mm。
- 证据：Tools/data_submarine_fits.py::LARGE_TUBE_RAW

### P1-6 插座命名不符合规范，且资产侧插座不存在

- 状态：已整改（3 艘本地有模型的潜艇）
- 整改：插座命名改为 SOCKET_TORPEDO_## / SOCKET_MISSILE_## / SOCKET_SLBM_## / SOCKET_VLS_##；新增 Blender 插座生成流程，为本地已有 MASTER.blend 的 3 艘潜艇增量生成插座，原始主文件不被修改；其余 51 艘因缺少潜艇模型标记 WAITING_FOR_MODEL。
- 证据：Tools/build_weapon_sockets.py；Tools/weapon_socket_pass_blender.py；Documentation/WeaponSocketReport.json

### P1-7 校验器无法验证 FBX 本体，TESTED 标签偏乐观

- 状态：已整改
- 整改：新增导出后 roundtrip 验证：把 LOD0..LOD3 与碰撞体 FBX 重新导入 Blender，实测顶点/三角面/包围盒/材质并与工厂记录比对；校验器据此才给出 TESTED。注意这是 Blender 导入器 roundtrip，不等于 UE4.27 编辑器导入。
- 证据：Tools/verify_weapon_fbx_roundtrip.py；Validation/{id}_FBX_ROUNDTRIP.json

### P2-1 重建采用"先归档再构建"，中断会留下半成品目录

- 状态：已知，未整改
- 整改：当前为归档后重建；旧产出保存在 Weapons/_archive/ 下可恢复。更好的做法是构建到 staging 目录后原子替换，留给后续迭代。
- 证据：Tools/build_weapon_assets.py::archive_existing

### P2-2 Blender 路径硬编码、档案目录无清理策略

- 状态：已知，未整改
- 整改：BLENDER_CANDIDATES 仍为固定路径；_archive/ 会随重建增长，需要人工或后续脚本清理。
- 证据：Tools/build_weapon_assets.py；Weapons/_archive/

## 验证数据

### 资产校验

- 已校验武器：120
- PASS：120　FAIL：0
- 达到 TESTED：120
- 已完成 FBX roundtrip（Blender 导入器）验证的武器：120

### 几何唯一性

- 审计武器：124
- 同尺寸跨家族武器对：88
- 近似重复违规：0
- 阈值：侧影剖面最大差异 ≥ 3.0% 弹体长度
- 最接近的一对：RU_TORP_SET65 vs CN_TORP_Yu3，最大差异 3.807%（RMS 1.235%）

### 潜艇武器插座

- 已生成插座：3 艘，共 94 个插座
- 等待潜艇模型：51 艘

- RU_SSN_Akula：20 个插座 → C:\workspace\ue4\silent-depth\SilentDepth_Assets\Submarines\SSN\Russia\Akula\Sockets\RU_SSN_Akula_SOCKETS.fbx
- RU_SSN_Yasen：42 个插座 → C:\workspace\ue4\silent-depth\SilentDepth_Assets\Submarines\SSN\Russia\Yasen\Sockets\RU_SSN_Yasen_SOCKETS.fbx
- RU_SSBN_Typhoon：32 个插座 → C:\workspace\ue4\silent-depth\SilentDepth_Assets\Submarines\SSBN\Russia\Typhoon_Project941\Sockets\RU_SSBN_Typhoon_SOCKETS.fbx

### 生产队列

- 生产集合：120
- DATABASE_ONLY：4
- 状态：{'PLANNED': 0, 'RESEARCH': 0, 'REFERENCE': 0, 'BLOCKOUT': 0, 'MODELING': 0, 'DETAILING': 0, 'TEXTURING': 0, 'LOD': 0, 'COLLISION': 0, 'EXPORT': 0, 'VALIDATING': 0, 'COMPLETE': 120, 'FAILED': 0, 'BLOCKED': 0}
- 重试队列：[]

## 仍未验证的部分（如实披露）

- UE4.27 编辑器内导入、材质重建与 LOD 切换：本机未执行 → **NOT VERIFIED**
- 预览图与图标的人工目视确认：本机未执行（只有渲染统计量：分辨率、亮度、主体覆盖率）
- 目标硬件性能（FPS、显存）：**NOT VERIFIED**
- 公开资料逐条联网核对：未执行；兼容关系基于公开知识整理并分层标注可信度
- 其余 51 艘潜艇的插座：潜艇模型尚不存在，标记 WAITING_FOR_MODEL
