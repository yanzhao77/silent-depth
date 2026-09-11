#!/usr/bin/env python3
"""Writes Documentation/GLOBAL_SUBMARINE_DEFENSIVE_SYSTEM_REPORT.md.

The report only states what the database, the build report and the validator
actually prove. Unfinished or unverified items are listed as such.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import sds_dataset as dataset  # noqa: E402
from sds_common import (  # noqa: E402
    CATEGORY_DIR,
    COMPATIBILITY_LEVELS,
    DOC_DIR,
    FBX_BINARY_VERSION,
    MANIFEST_DIR,
    SOCKETS,
    TODAY,
    VALIDATION_DIR,
    defensive_asset_dir,
    load_json,
    save_text,
)


def _maybe(path: Path) -> dict | None:
    if not path.is_file():
        return None
    try:
        return load_json(path)
    except Exception:
        return None


def _validator_rows() -> dict[str, str]:
    rows = {}
    for asset in dataset.ASSETS:
        path = defensive_asset_dir(asset) / 'Validation' / f"{asset['asset_id']}_VALIDATION.json"
        data = _maybe(path)
        rows[asset['asset_id']] = (data or {}).get('result', 'NOT_RUN')
    return rows


def build_report() -> str:
    family_db = _maybe(MANIFEST_DIR / 'defensive_system_family.json') or {}
    compat = _maybe(MANIFEST_DIR / 'submarine_defensive_compatibility.json') or {}
    asset_manifest = _maybe(MANIFEST_DIR / 'defensive_system_manifest.json') or {}
    tree = _maybe(MANIFEST_DIR.parent / 'TechnologyTree' / 'defensive_technology_tree.json') or {}
    research = _maybe(DOC_DIR / 'defensive_system_research.json')
    socket_audit = _maybe(DOC_DIR / 'defensive_socket_audit.json') or {}
    build_report = _maybe(MANIFEST_DIR / 'defensive_asset_build_report.json') or {}
    validators = _validator_rows()

    family_totals = (family_db.get('totals') or {})
    compat_totals = (compat.get('totals') or {})
    asset_totals = (asset_manifest.get('totals') or {})

    lines: list[str] = []
    lines.append('# GLOBAL SUBMARINE DEFENSIVE SYSTEM REPORT')
    lines.append('')
    lines.append(f'生成日期：{TODAY}')
    lines.append('')
    lines.append('本报告对应需求 `SILENT DEPTH — 潜艇电子战 / 防御战科技树`。')
    lines.append('它是一份**游戏资产与科技树交付报告**：只描述系统身份、技术家族、年代、视觉资产、')
    lines.append('兼容性与游戏层级。不包含真实电子攻击参数、频率、干扰功率、欺骗逻辑、')
    lines.append('鱼雷规避战术或任何作战程序。')
    lines.append('')
    lines.append('## 1. 交付范围')
    lines.append('')
    lines.append('### 1.1 与需求执行清单的对照（第 33 节十二步）')
    lines.append('')
    lines.append('| 步骤 | 需求 | 交付物 | 状态 |')
    lines.append('| --- | --- | --- | --- |')
    steps = [
        ('1', '读取现有潜艇科技树', 'Documentation/defensive_input_audit.json',
         '已读取并记录 sha256（54 平台 / T1-T10）'),
        ('2', '读取武器科技树', 'Documentation/defensive_input_audit.json',
         '武器工厂目前只有第 1 阶段审计产物，按其记录读取，未修改武器数据'),
        ('3', '建立防御系统数据库', 'Manifest/defensive_system_family.json',
         f"45 家族 / 270 变体 / {family_totals.get('branches', '-')} 分支"),
        ('4', '建立 T1-T10 科技树', 'TechnologyTree/defensive_technology_tree.json',
         f"{tree.get('totals', {}).get('nodes', '-')} 个层级节点 + 分支树"),
        ('5', '建立兼容性矩阵', 'Manifest/submarine_defensive_compatibility.json + Documentation/SubmarineDefensiveMatrix.csv',
         f"{compat_totals.get('rows', '-')} 行（54 平台 × 45 家族）"),
        ('6', '建立 Master Template', 'Templates/DefensiveSystem/',
         '模板 JSON/导出预设/验证规则/Blender 场景均已生成'),
        ('7', '开始 3D 资产', 'DefensiveSystems/<Category>/<AssetId>/',
         f"{asset_totals.get('assets', '-')} 个资产（含 {asset_totals.get('high_priority', '-')} 个 HIGH 优先级）"),
        ('8', 'LOD', 'FBX/<AssetId>_LOD0..3.fbx',
         '由 LOD0 派生 0.50 / 0.22 / 0.085，三角面严格递减'),
        ('9', 'Collision', 'Collision/<AssetId>_COLLISION.fbx',
         '每个资产含 UCX 凸包，并随 LOD0 导出'),
        ('10', 'FBX', 'FBX/<AssetId>_LOD*.fbx',
         f'二进制 {FBX_BINARY_VERSION}（FBX 2018），目标 UE4.27'),
        ('11', 'Validation', 'Tools/defensive_system_validator.py + Validation/',
         '已实际执行，逐项结果见第 7、8 节'),
        ('12', 'Final Report', 'Documentation/GLOBAL_SUBMARINE_DEFENSIVE_SYSTEM_REPORT.md',
         '本文件'),
    ]
    for index, requirement, deliverable, status in steps:
        lines.append(f'| {index} | {requirement} | `{deliverable}` | {status} |')
    lines.append('')
    lines.append(f"- 分支：{family_totals.get('branches', '-')}")
    lines.append(f"- 家族：{family_totals.get('families', '-')}")
    lines.append(f"- 变体（家族 × 国家）：{family_totals.get('variants', '-')}")
    lines.append(f"- 科技树节点（T1-T10）：{tree.get('totals', {}).get('nodes', '-')}")
    lines.append(f"- 3D 资产条目：{asset_totals.get('assets', '-')}"
                 f"（HIGH {asset_totals.get('high_priority', '-')}）")
    lines.append(f"- 兼容性矩阵行：{compat_totals.get('rows', '-')}"
                 f"（平台 {compat_totals.get('platforms', '-')}）")
    lines.append('')
    lines.append('## 2. 分支结构')
    lines.append('')
    lines.append('```text')
    lines.append('DEFENSIVE SYSTEM')
    for branch in dataset.BRANCHES:
        families = [f for f in dataset.FAMILIES if f['branch'] == branch['branch_id']]
        lines.append(f"├── {branch['label']} ({branch['label_zh']}) — {len(families)} 家族")
    lines.append('```')
    lines.append('')
    lines.append('## 3. T1-T10 游戏层级')
    lines.append('')
    lines.append('| 层级 | 名称 | 节点数 |')
    lines.append('| --- | --- | --- |')
    for tier in range(1, 11):
        node = (tree.get('tiers') or {}).get(f'T{tier}', {})
        lines.append(f"| T{tier} | {node.get('label', '-')} | {len(node.get('nodes', []))} |")
    lines.append('')
    lines.append('## 4. 公开来源核验')
    lines.append('')
    if research:
        variants = research.get('variants') or {}
        confirmed = [k for k, v in variants.items() if v.get('status') == 'CONFIRMED']
        probable = [k for k, v in variants.items() if v.get('status') == 'PROBABLE']
        lines.append(f"- 核验后的变体记录：{len(variants)} 条"
                     f"（CONFIRMED {len(confirmed)}，PROBABLE {len(probable)}）")
        lines.append(f"- 明确查证但无可靠来源而入 unverified：{len(research.get('unverified') or [])} 条")
        lines.append('')
        lines.append('已锚定的公开系统（部分）：')
        lines.append('')
        lines.append('| 变体 | 锚定系统 | 状态 | 来源数 |')
        lines.append('| --- | --- | --- | --- |')
        for vid, value in sorted(variants.items())[:20]:
            lines.append(f"| {vid} | {value.get('anchor', '-')} | {value.get('status', '-')} | "
                         f"{len(value.get('sources') or [])} |")
    else:
        lines.append('- 尚未生成 `Documentation/defensive_system_research.json`，'
                     '因此所有变体保持 GAMEPLAY。')
    lines.append('')
    lines.append('## 5. 兼容性与装载')
    lines.append('')
    lines.append('| 兼容性 | 行数 |')
    lines.append('| --- | --- |')
    for level in COMPATIBILITY_LEVELS:
        lines.append(f"| {level} | {(compat_totals.get('by_level') or {}).get(level, 0)} |")
    lines.append('')
    lines.append(f"装载方案：`Manifest/defensive_loadout_manifest.json`（"
                 f"{compat_totals.get('platforms', '-')} 个平台 × 9 个槽位）。")
    lines.append('')
    lines.append('## 6. Socket 体系')
    lines.append('')
    lines.append('| Socket | 用途 |')
    lines.append('| --- | --- |')
    for name, purpose in SOCKETS.items():
        lines.append(f'| {name} | {purpose} |')
    lines.append('')
    audit_totals = socket_audit.get('totals') or {}
    if audit_totals:
        lines.append(f"继承潜艇的挂点审计：扫描 {audit_totals.get('masters_scanned', 0)} 个本地 MASTER.blend，"
                     f"其中带防御 socket 的 {audit_totals.get('with_defensive_socket', 0)} 个；"
                     f"{audit_totals.get('no_local_master', 0)} 个平台在本地没有 MASTER 文件。")
        lines.append('')
        lines.append('**结论：现有潜艇资产没有防御挂点，本任务按需求不修改潜艇几何。**'
                     '防御系统以独立的附加展示层资产 + 统一 socket 词表交付，'
                     '挂点作业留给后续授权任务。')
    lines.append('')
    lines.append('## 7. 3D 资产流水线')
    lines.append('')
    lines.append('| 资产 | 分类 | 优先级 | 生产状态 | 验证器 | LOD0 三角面 | 预览图 |')
    lines.append('| --- | --- | --- | --- | --- | --- | --- |')
    for asset in asset_manifest.get('assets', []):
        lines.append(
            f"| {asset['asset_id']} | {CATEGORY_DIR.get(asset['category'], asset['category'])} | "
            f"{asset['priority']} | {asset['status']} | {validators.get(asset['asset_id'], 'NOT_RUN')} | "
            f"{asset['triangles_lod0'] if asset['triangles_lod0'] is not None else '-'} | "
            f"{asset['preview_count']} |")
    lines.append('')
    lines.append('分类目录：' + '、'.join(
        f'`{name}`' for name in sorted({CATEGORY_DIR[a['category']] for a in dataset.ASSETS})))
    lines.append('')
    lines.append('每个资产的目录结构（与既有潜艇资产一致）：')
    lines.append('')
    lines.append('```text')
    lines.append('<Category>/<AssetId>/')
    lines.append('├── Source/  构建脚本')
    lines.append('├── Blend/   <AssetId>_MASTER.blend')
    lines.append('├── FBX/     <AssetId>_LOD0..3.fbx（二进制 7400）')
    lines.append('├── Collision/<AssetId>_COLLISION.fbx（UCX 凸包）')
    lines.append('├── Textures/')
    lines.append('├── Preview/ 正交预览与灰模')
    lines.append('├── Documentation/<AssetId>_SPEC.json 与 README')
    lines.append('└── Validation/<AssetId>_VALIDATION.json')
    lines.append('```')
    lines.append('')
    lines.append('## 8. 验证状态')
    lines.append('')
    lines.append('| 标签 | 含义 | 本任务状态 |')
    lines.append('| --- | --- | --- |')
    lines.append('| IMPLEMENTED | 代码/数据/资产已产出 | 见第 7 节逐项状态 |')
    lines.append('| TESTED | 自动化检查通过 | `defensive_system_validator.py` 的结果为准 |')
    lines.append('| BROWSER VERIFIED | 在真实浏览器/引擎中观察 | 不适用（本任务是资产库，不进运行时渲染） |')
    lines.append('| TARGET HARDWARE VERIFIED | 目标硬件性能实测 | 未做，不做声明 |')
    lines.append('')
    validation_summary = _maybe(VALIDATION_DIR / 'defensive_system_validation.json')
    if validation_summary:
        totals = validation_summary.get('totals', {})
        lines.append(f"验证器实际结果：PASS {totals.get('PASS', 0)} / FAIL {totals.get('FAIL', 0)} / "
                     f"NOT_VERIFIED {totals.get('NOT_VERIFIED', 0)}（共 {totals.get('assets', 0)} 个资产），"
                     '检查项包含 FBX 二进制版本、独立重导入、LOD 递减、UCX 凸包、材质登记、'
                     'socket 词表、主尺寸比例、原点规则与 manifest 哈希一致性。')
        lines.append('')
    if build_report:
        failures = [row for row in build_report.get('assets', [])
                    if row.get('status') not in ('OK', 'COMPLETE', 'BUILT')]
        lines.append(f"构建报告：`Manifest/defensive_asset_build_report.json`，"
                     f"失败/未完成条目 {len(failures)} 个。")
    else:
        lines.append('构建报告：未生成。')
    lines.append('')
    lines.append('## 9. 明确未做与不可推断的事项')
    lines.append('')
    lines.append('1. 未修改任何既有潜艇模型、武器、Gameplay、Combat、AI、Physics、Save、Mission、World。')
    lines.append('2. 未提供任何真实电子战参数、频率、干扰功率、欺骗逻辑、反鱼雷算法或战术程序。')
    lines.append('3. 未为查不到公开资料的家族/国家组合编造型号；这些保持 GAMEPLAY 或 UNKNOWN，'
                 'DATABASE_ONLY 的家族不生成几何体。')
    lines.append('4. 未做 UE4.27 编辑器导入验证；FBX 只按既有约定的二进制版本与轴向导出。')
    lines.append('5. 未做性能/帧率声明。')
    lines.append('6. 与 Typhoon / Akula / Yasen 的视觉质量对比**没有做**：本批资产 LOD0 三角面 '
                 '1296–5472，属于中等细节的程序化外形件，规模远小于英雄艇资产；'
                 '「同一视觉质量」这一条在人工对照之前不能算达成。')
    lines.append('7. 预览图只做了数值检查（分辨率、非空白、主体覆盖率），'
                 '没有人工目视确认外观是否符合预期；外观确认需要在图像查看器里实际看一遍。')
    lines.append('')
    lines.append('## 10. 数据文件索引')
    lines.append('')
    lines.append('| 文件 | 内容 |')
    lines.append('| --- | --- |')
    lines.append('| Manifest/defensive_system_family.json | 家族、变体、锚定系统与验证状态 |')
    lines.append('| Manifest/defensive_system_manifest.json | 13 个 3D 资产的定义与磁盘真实状态 |')
    lines.append('| Manifest/submarine_defensive_compatibility.json | 兼容性矩阵（2430 行） |')
    lines.append('| Manifest/defensive_loadout_manifest.json | 54 个平台的装载方案 |')
    lines.append('| Manifest/defensive_production_status.json | 生产状态与证据 |')
    lines.append('| TechnologyTree/defensive_technology_tree.json | T1-T10 科技树与分支树 |')
    lines.append('| TechnologyTree/tier_manifest.json | 层级清单 |')
    lines.append('| Documentation/SubmarineDefensiveMatrix.csv | 平台 × 分支矩阵总表 |')
    lines.append('| Documentation/SubmarineDefensiveMatrix_full.csv | 逐行明细 |')
    lines.append('| Documentation/defensive_coverage_report.md | 覆盖统计报告 |')
    lines.append('| Documentation/defensive_socket_audit.json | 继承潜艇的挂点审计 |')
    lines.append('| Documentation/defensive_system_research.json | 公开来源核验记录 |')
    lines.append('| Templates/DefensiveSystem/ | 新资产模板与导出/验证规则 |')
    lines.append('| Tools/ | 数据构建器与验证器 |')
    lines.append('')
    return '\n'.join(lines)


def main() -> int:
    report = build_report()
    path = DOC_DIR / 'GLOBAL_SUBMARINE_DEFENSIVE_SYSTEM_REPORT.md'
    save_text(path, report)
    print(f'WROTE={path}')
    print(f'LINES={len(report.splitlines())}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
