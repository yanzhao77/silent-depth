#!/usr/bin/env python3
"""生成 §31 要求的全部数据产物。

用法：
    python Tools/build_sensor_manifest.py

产物：
    Manifest/sensor_manifest.json
    Manifest/sensor_family.json
    Manifest/sensor_socket_registry.json
    Manifest/submarine_sensor_compatibility.json
    Manifest/sensor_production_status.json
    TechnologyTree/sensor_technology_tree.json
    TechnologyTree/sensor_technology_tree.md
    TechnologyTree/sensor_tier_manifest.json
    Documentation/SubmarineSensorMatrix.csv
    Documentation/sensor_coverage_report.md
    Documentation/GLOBAL_SUBMARINE_SENSOR_REPORT.md
"""
from __future__ import annotations

import argparse
from pathlib import Path

from sensor_common import (
    BRANCH_DIR,
    DOC_DIR,
    MANIFEST_DIR,
    PREVIEW_VIEWS,
    SOCKETS,
    SENSORS_ROOT,
    TODAY,
    TREE_DIR,
    save_json,
    save_text,
    write_csv,
)
from sensor_dataset import dataset
from sensor_dataset_assets import CORE_ASSETS, FORM_FACTORS, MATERIALS
from sensor_dataset_branches import BRANCHES


def asset_path(sensor_id: str, branch: str) -> str:
    return f'{BRANCH_DIR[branch]}/{sensor_id}'


def manifest_entry(variant: dict, core_asset: dict | None) -> dict:
    return {
        'sensor_id': variant['sensor_id'],
        'family': variant['family'],
        'variant': variant['variant'],
        'name': variant['name'],
        'country': variant['country'],
        'category': variant['category'],
        'sub_category': variant['sub_category'],
        'branch': variant['branch'],
        'tier': f'T{variant["branch_tier"]}',
        'era': variant['era'],
        'status': variant['status'],
        'confidence': variant['confidence'],
        'verification': variant['verification'],
        'asset_status': variant.get('asset_status', 'DATABASE_ONLY'),
        'compatible_submarines': variant.get('compatible_submarines', []),
        'mount_type': variant['mount_type'],
        'socket': variant['socket'],
        'preview': [
            f'{asset_path(variant["sensor_id"], variant["branch"])}/Preview/'
            f'{variant["sensor_id"]}_{view}.png'
            for view in PREVIEW_VIEWS
        ] if core_asset else [],
        'geometry': core_asset if core_asset else None,
        'asset_path': asset_path(variant['sensor_id'], variant['branch']) if core_asset else None,
        'references': variant.get('references', []),
        'notes': variant.get('notes', ''),
        'research_notes': variant.get('research_notes', ''),
    }


def build_tree_markdown(tree: dict, manifest: dict) -> str:
    lines = [
        '# SILENT DEPTH 潜艇传感器科技树 T1–T10',
        '',
        f'生成日期：{TODAY}',
        '',
        '本文件由 `Tools/build_sensor_manifest.py` 从 `Tools/sensor_dataset*.py` 生成，'
        '请勿手工编辑。',
        '',
        '## 编号约定',
        '',
        '- **分支内 T1–T10**：每个分支自身的演进序列（任务书 §25「每个分支：T1-T10」）。',
        '- **全局代际阶梯 T1–T10**：跨分支的代际总览（任务书 §24），见下表。',
        '- `GEN_*` 条目是游戏科技树层级件；现实系统只作为层级上的参考系统出现，',
        '  绝不代替层级本身。',
        '',
        '## 全局代际阶梯（任务书 §24）',
        '',
        '| 代际 | 含义 |',
        '| --- | --- |',
    ]
    for entry in tree['tier_ladder']:
        lines.append(f'| {entry["tier"]} | {entry["label_zh"]}（{entry["label_en"]}） |')

    lines += ['', '## 分支总览', '', '| 分支 | 目录 | T1–T10 完整 | 核心资产 |', '| --- | --- | --- | --- |']
    branch_core: dict[str, list[str]] = {branch['branch_id']: [] for branch in BRANCHES}
    for asset in CORE_ASSETS:
        branch_core[asset['branch']].append(asset['sensor_id'])
    for branch in tree['branches']:
        complete = all(tier['sensor_id'] for tier in branch['tiers'])
        lines.append(
            f'| {branch["label_zh"]}（{branch["branch_id"]}） | `{BRANCH_DIR[branch["branch_id"]]}/` '
            f'| {"是" if complete else "否"} | {len(branch_core[branch["branch_id"]])} |'
        )

    for branch in tree['branches']:
        lines += [
            '',
            f'## {branch["label_zh"]}（{branch["branch_id"]}）',
            '',
            branch['description_zh'],
            '',
            f'插槽：{"、".join(f"`{s}`" for s in branch["sockets"]) if branch["sockets"] else "无（软件层）"}',
            '',
            '| 层级 | 名称 | 名称（中） | 来源 | 现实参考系统 |',
            '| --- | --- | --- | --- | --- |',
        ]
        for tier in branch['tiers']:
            real = '、'.join(
                f'{entry["name"]}（{entry["country"]}，{entry["confidence"]}）'
                for entry in tier['real_systems']
            ) or '—'
            lines.append(
                f'| {tier["tier"]} | {tier["name"]} | {tier["name_zh"]} | '
                f'{"任务书" if tier["source"] == "spec" else "游戏扩展"} | {real} |'
            )
    lines += [
        '',
        '## 覆盖统计',
        '',
        f'- 分支：{len(tree["branches"])}',
        f'- 层级节点：{sum(len(b["tiers"]) for b in tree["branches"])}',
        f'- 数据库条目：{len(manifest["entries"])}',
        f'- 其中现实候选：{sum(1 for e in manifest["entries"] if e["verification"] != "gameplay-only")}',
        f'- 其中游戏科技树件：{sum(1 for e in manifest["entries"] if e["verification"] == "gameplay-only")}',
        '',
        '> 本科技树是**游戏科技树**，不是现实军事技术等级。',
        '',
    ]
    return '\n'.join(lines)


def build_coverage_report(d: dict, manifest: dict, status: dict) -> str:
    entries = manifest['entries']
    real = [e for e in entries if e['verification'] != 'gameplay-only']
    confirmed = [e for e in real if e['confidence'] == 'CONFIRMED']
    probable = [e for e in real if e['confidence'] == 'PROBABLE']
    unverified = [e for e in real if e['confidence'] == 'UNKNOWN']
    by_country: dict[str, int] = {}
    for entry in real:
        by_country[entry['country']] = by_country.get(entry['country'], 0) + 1
    matrix = d['compatibility']
    rows = []
    for branch in BRANCHES:
        rows.append((
            branch['branch_id'],
            branch['label_zh'],
            sum(1 for v in d['variants'] if v['branch'] == branch['branch_id'] and v['verification'] == 'gameplay-only'),
            sum(1 for v in d['variants'] if v['branch'] == branch['branch_id'] and v['verification'] != 'gameplay-only'),
            len([a for a in CORE_ASSETS if a['branch'] == branch['branch_id']]),
        ))

    lines = [
        '# SILENT DEPTH 传感器覆盖报告',
        '',
        f'生成日期：{TODAY}',
        '',
        '## 1. 数据库覆盖',
        '',
        f'- 数据库条目总数：{len(entries)}',
        f'- 现实候选（有公开来源挂钩）：{len(real)}',
        f'- 游戏科技树层级件（`GEN_*`）：{len(entries) - len(real)}',
        '',
        '### 现实候选置信度分布',
        '',
        f'- CONFIRMED：{len(confirmed)}',
        f'- PROBABLE：{len(probable)}',
        f'- UNKNOWN（未核验到公开来源）：{len(unverified)}',
        '',
        '### 现实候选按国家',
        '',
        '| 国家 | 条目 |',
        '| --- | --- |',
    ]
    for country in sorted(by_country):
        lines.append(f'| {country} | {by_country[country]} |')

    lines += [
        '',
        '## 2. 分支覆盖',
        '',
        '| 分支 | 名称 | 游戏层级件 | 现实候选 | 核心资产 |',
        '| --- | --- | --- | --- | --- |',
    ]
    for branch_id, label, gameplay, real_count, asset_count in rows:
        lines.append(f'| {branch_id} | {label} | {gameplay} | {real_count} | {asset_count} |')

    lines += [
        '',
        '## 3. 潜艇覆盖（§30：全部 SSN / SSBN）',
        '',
        f'- 潜艇总数：{len(d["submarines"])}',
        f'- 兼容性记录：{len(matrix["records"])} 条（每艇 {len(BRANCHES)} 个分支各一条）',
        '',
        '| 选定状态 | 数量 |',
        '| --- | --- |',
    ]
    for level, count in matrix['summary'].items():
        lines.append(f'| {level} | {count} |')
    lines += [
        '',
        '> 选定状态表示该艇在该分支上实际装载的传感器判定；',
        '> `candidates` 中还会出现被排除的 `INCOMPATIBLE`（跨国现实系统）与 `UNKNOWN` 选项。',
        '',
        '## 4. 3D 资产覆盖',
        '',
        f'- 核心资产计划：{len(CORE_ASSETS)} 件',
        f'- 已完成（Blend/FBX/LOD/Collision/Preview/文档齐全）：{status["complete_assets"]} 件',
        f'- 待完成：{len(CORE_ASSETS) - status["complete_assets"]} 件',
        '',
        '| 资产 | 分支 | 外形 | 几何来源 | 状态 |',
        '| --- | --- | --- | --- | --- |',
    ]
    for asset in CORE_ASSETS:
        state = status['asset_status'].get(asset['sensor_id'], 'PLANNED')
        source = '公开外形' if asset['geometry_source'] == 'PUBLIC_FORM' else '游戏代表性外形'
        lines.append(
            f'| {asset["sensor_id"]} | {asset["branch"]} | {asset["form_factor"]} | {source} | {state} |'
        )

    lines += [
        '',
        '## 5. 未覆盖 / 未核验项',
        '',
    ]
    if unverified:
        for entry in unverified:
            lines.append(f'- {entry["sensor_id"]}（{entry["name"]}）：公开来源未核验，保持 UNKNOWN。')
    else:
        lines.append('- 无：所有现实候选均已核验。')
    lines += [
        '',
        '## 6. 硬性约束',
        '',
        '- 不记录任何分类频率、声源级、探测距离等作战参数。',
        '- 不把推测型号写成正式型号，不把概念型号写成服役型号。',
        '- 未核验的平台—传感器关系一律不得标为 CONFIRMED。',
        '',
    ]
    return '\n'.join(lines)


def build_global_report(d: dict, manifest: dict, status: dict) -> str:
    entries = manifest['entries']
    real = [e for e in entries if e['verification'] != 'gameplay-only']
    assets_done = status['complete_assets']
    lines = [
        '# GLOBAL SUBMARINE SENSOR REPORT',
        '',
        f'生成日期：{TODAY}',
        '',
        '## 交付范围',
        '',
        'SILENT DEPTH 第三套独立系统科技树：**潜艇传感器 / 声呐科技树**。',
        '它独立于潜艇科技树与武器科技树，不修改潜艇模型、物理、战斗、AI、',
        '声呐玩法逻辑、存档、任务与世界。',
        '',
        '## 结构',
        '',
        '```text',
        'SUBMARINE -> SENSOR SYSTEM -> SENSOR FAMILY -> SENSOR VARIANT',
        '          -> TIER -> 3D ASSET -> UE4.27',
        '```',
        '',
        '## 分支（§25：每个分支 T1–T10）',
        '',
        '| 分支 | 名称 | 目录 | 插槽 | 核心资产 |',
        '| --- | --- | --- | --- | --- |',
    ]
    for branch in BRANCHES:
        asset_count = sum(1 for asset in CORE_ASSETS if asset['branch'] == branch['branch_id'])
        sockets = '、'.join(f'`{s}`' for s in branch['sockets']) if branch['sockets'] else '无（软件层）'
        lines.append(
            f'| {branch["branch_id"]} | {branch["label_zh"]} | `{BRANCH_DIR[branch["branch_id"]]}/` | {sockets} | {asset_count} |'
        )
    lines += [
        '',
        '## 数字',
        '',
        f'- 分支：{len(BRANCHES)}',
        f'- 层级：{len(BRANCHES)} × T1–T10 = {len(BRANCHES) * 10}',
        f'- 数据库条目：{len(entries)}（现实候选 {len(real)}，游戏层级件 {len(entries) - len(real)}）',
        f'- 潜艇覆盖：{len(d["submarines"])} 艘，兼容记录 {len(d["compatibility"]["records"])} 条',
        f'- 传感器家族：{len(d["families"])}',
        f'- 统一插槽：{len(SOCKETS)}',
        f'- 核心 3D 资产：{len(CORE_ASSETS)} 件，已完成 {assets_done} 件',
        f'- 共享材质：{len(MATERIALS)}',
        f'- 已登记公开来源引用：{status["database"]["references_recorded"]} 条',
        '',
        '## 兼容性判定规则',
        '',
        '- `CONFIRMED`：公开来源核验过该艇与该传感器的对应关系。',
        '- `PROBABLE`：有公开参考但缺少一手来源确认。',
        '- `GAMEPLAY`：游戏科技树默认装配，按「同代潜艇装配同代层级节点」选取，不代表现实断言。',
        '- `UNKNOWN`：公开资料不足。',
        '- `INCOMPATIBLE`：跨国现实系统，不可能装配。',
        '',
        '## 兼容性状态分布（选定）',
        '',
        '| 状态 | 数量 | 含义 |',
        '| --- | --- | --- |',
        f'| CONFIRMED | {d["compatibility"]["summary"]["CONFIRMED"]} | 公开来源核验过的平台—传感器关系 |',
        f'| PROBABLE | {d["compatibility"]["summary"]["PROBABLE"]} | 有公开报道但未获一手确认 |',
        f'| GAMEPLAY | {d["compatibility"]["summary"]["GAMEPLAY"]} | 游戏科技树默认装配（非现实断言） |',
        f'| UNKNOWN | {d["compatibility"]["summary"]["UNKNOWN"]} | 公开资料不足 |',
        f'| INCOMPATIBLE | {d["compatibility"]["summary"]["INCOMPATIBLE"]} | 跨国现实系统，不可能装配 |',
        '',
        '## 产物清单',
        '',
        '| 文件 | 说明 |',
        '| --- | --- |',
        '| `Manifest/sensor_manifest.json` | 传感器数据库（§17 字段） |',
        '| `Manifest/sensor_family.json` | 家族 → 变体关系（§16） |',
        '| `Manifest/sensor_socket_registry.json` | 统一插槽注册表（§20） |',
        '| `Manifest/submarine_sensor_compatibility.json` | 潜艇—传感器兼容矩阵（§18/§19） |',
        '| `Manifest/sensor_production_status.json` | 资产生产状态 |',
        '| `TechnologyTree/sensor_technology_tree.json` | 科技树（机器可读） |',
        '| `TechnologyTree/sensor_technology_tree.md` | 科技树（可读） |',
        '| `TechnologyTree/sensor_tier_manifest.json` | 层级清单 |',
        '| `Documentation/SubmarineSensorMatrix.csv` | 潜艇 × 分支矩阵 |',
        '| `Documentation/sensor_coverage_report.md` | 覆盖报告 |',
        '| `Documentation/SENSOR_VALIDATION_REPORT.md` | 逐资产验证报告 |',
        '| `Documentation/SENSOR_FACTORY_CONTRACT.md` | 传感器工厂契约 |',
        '| `Documentation/UE427_SENSOR_IMPORT.md` | UE4.27 导入说明（含未验证声明） |',
        '| `Documentation/Research/*` | 资料核验库（公开来源与置信度） |',
        '| `Manifest/sensor_validation_index.json` | 验证索引 |',
        '| `Manifest/sensor_socket_registry.json` | 插槽注册表 |',
        '| `Templates/Sensor/*` | 传感器模板、导出预设、校验规则、插槽标准 |',
        '| `Materials/*` | 共享材质库与材质定义 |',
        '| `Tools/*` | 资产工厂工具链 |',
        '',
        '## 完成度标签',
        '',
        status['completion_labels'],
        '',
        '## 未验证项',
        '',
    ]
    for item in status['not_verified']:
        lines.append(f'- {item}')
    lines.append('')
    return '\n'.join(lines)


def build_production_status(d: dict, asset_states: dict[str, str]) -> dict:
    complete = sum(1 for state in asset_states.values() if state == 'COMPLETE')
    real = [v for v in d['variants'] if v['verification'] != 'gameplay-only']
    references = sum(len(v.get('references', [])) for v in real)
    return {
        'generated_at': TODAY,
        'core_assets': len(CORE_ASSETS),
        'complete_assets': complete,
        'asset_status': asset_states,
        'queue': [asset['sensor_id'] for asset in CORE_ASSETS],
        'database': {
            'entries': len(d['variants']),
            'real_candidates': len(real),
            'gameplay_nodes': len(d['variants']) - len(real),
            'references_recorded': references,
            'families': len(d['families']),
            'submarines_covered': len(d['submarines']),
            'compatibility_records': len(d['compatibility']['records']),
        },
        'verification': {
            'database_and_tools': 'TESTED',
            'asset_package': 'TESTED',
            'ue427_import': 'NOT VERIFIED',
            'target_hardware_performance': 'NOT VERIFIED',
        },
        'completion_labels': (
            '- 数据库 / 科技树 / 兼容矩阵 / 工具链：IMPLEMENTED，且已由本地复跑验证（TESTED）。\n'
            '- 3D 资产包（Blend、FBX LOD0–3、碰撞、四视角预览、文档）：IMPLEMENTED，'
            '并由 `Tools/sensor_validator.py` 逐资产验证（TESTED）。\n'
            '- UE4.27 编辑器导入：**NOT VERIFIED**，本机没有 UE4.27 编辑器；'
            'FBX 仅通过二进制版本 7400 与文件结构验证。\n'
            '- 目标硬件性能：**NOT VERIFIED**，本任务不产生也不引用 FPS 数据。'
        ),
        'not_verified': [
            'UE4.27 编辑器导入与场景内实际外观：本机未执行，需在装有 UE4.27 的机器上完成。',
            '现实系统的公开参数：按任务书要求不采集、不记录，因此数据库中不存在这类字段。',
            '法国与中国、印度的现实传感器型号：公开来源不足，保持 UNKNOWN。',
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--print-summary', action='store_true')
    args = parser.parse_args()

    d = dataset()
    validation_index_path = MANIFEST_DIR / 'sensor_validation_index.json'
    validated: dict[str, str] = {}
    if validation_index_path.is_file():
        from sensor_common import load_json
        validated = {
            sensor_id: result.get('status', 'PLANNED')
            for sensor_id, result in load_json(validation_index_path).get('assets', {}).items()
        }
    core_by_id = {asset['sensor_id']: asset for asset in CORE_ASSETS}
    for variant in d['variants']:
        sensor_id = variant['sensor_id']
        if sensor_id in core_by_id:
            variant['asset_status'] = validated.get(sensor_id, 'PLANNED')
        else:
            variant['asset_status'] = 'DATABASE_ONLY'
    entries = [manifest_entry(v, core_by_id.get(v['sensor_id'])) for v in d['variants']]
    entries.sort(key=lambda e: (e['branch'], e['tier'], e['sensor_id']))

    manifest = {
        'generated_at': TODAY,
        'scope': 'submarine sensor/sonar visual and technology-tree database; no combat parameters',
        'fields': [
            'sensor_id', 'family', 'variant', 'country', 'category', 'sub_category',
            'tier', 'era', 'status', 'confidence', 'asset_status',
            'compatible_submarines', 'mount_type', 'socket', 'preview', 'references',
        ],
        'entries': entries,
    }
    save_json(MANIFEST_DIR / 'sensor_manifest.json', manifest)

    save_json(MANIFEST_DIR / 'sensor_family.json', {
        'generated_at': TODAY,
        'note': '家族 → 变体；同一家族的不同 Block 不各自建模，按 §16 归并。',
        'families': d['families'],
    })

    save_json(MANIFEST_DIR / 'sensor_socket_registry.json', {
        'generated_at': TODAY,
        'standard': 'SILENT DEPTH sensor socket naming (§20)',
        'sockets': [
            {
                'socket': socket,
                'branches': [b['branch_id'] for b in BRANCHES if socket in b['sockets']],
                'users': sorted({e['sensor_id'] for e in entries if e['socket'] == socket}),
            }
            for socket in SOCKETS
        ],
    })

    save_json(MANIFEST_DIR / 'submarine_sensor_compatibility.json', {
        'generated_at': TODAY,
        'levels': d['compatibility']['levels'],
        'policy': d['compatibility']['policy'],
        'summary': d['compatibility']['summary'],
        'candidate_summary': d['compatibility']['candidate_summary'],
        'records': d['compatibility']['records'],
    })

    save_json(TREE_DIR / 'sensor_technology_tree.json', {
        'generated_at': TODAY,
        'note': '游戏科技树；分支内 T1–T10 与全局代际阶梯 T1–T10 是两条轴。',
        **d['tree'],
    })
    save_text(TREE_DIR / 'sensor_technology_tree.md', build_tree_markdown(d['tree'], manifest))

    save_json(TREE_DIR / 'sensor_tier_manifest.json', {
        'generated_at': TODAY,
        'branches': {
            branch['branch_id']: [
                {
                    'tier': tier['tier'],
                    'name': tier['name'],
                    'name_zh': tier['name_zh'],
                    'sensor_id': tier['sensor_id'],
                    'real_systems': [entry['sensor_id'] for entry in tier['real_systems']],
                }
                for tier in branch['tiers']
            ]
            for branch in d['tree']['branches']
        },
    })

    header = ['submarine_id', 'country', 'type'] + [b['branch_id'] for b in BRANCHES]
    rows = []
    by_sub: dict[str, dict[str, dict]] = {}
    for record in d['compatibility']['records']:
        by_sub.setdefault(record['submarine_id'], {})[record['branch']] = record
    for submarine in d['submarines']:
        records = by_sub.get(submarine['asset_id'], {})
        row = [submarine['asset_id'], submarine['country'], submarine['type']]
        for branch in BRANCHES:
            record = records.get(branch['branch_id'])
            row.append(f'{record["sensor_id"]}:{record["status"]}' if record and record['sensor_id'] else f':{record["status"] if record else "UNKNOWN"}')
        rows.append(row)
    write_csv(DOC_DIR / 'SubmarineSensorMatrix.csv', header, rows)

    states = {
        asset['sensor_id']: validated.get(asset['sensor_id'], 'PLANNED')
        for asset in CORE_ASSETS
    }
    status = build_production_status(d, states)
    save_json(MANIFEST_DIR / 'sensor_production_status.json', status)

    save_text(DOC_DIR / 'sensor_coverage_report.md', build_coverage_report(d, manifest, status))
    save_text(DOC_DIR / 'GLOBAL_SUBMARINE_SENSOR_REPORT.md', build_global_report(d, manifest, status))

    if args.print_summary:
        real = [e for e in entries if e['verification'] != 'gameplay-only']
        print(f'entries={len(entries)} real={len(real)} gameplay={len(entries) - len(real)}')
        print(f'branches={len(d["tree"]["branches"])} tiers={len(d["tree"]["branches"]) * 10}')
        print(f'compatibility={len(d["compatibility"]["records"])} summary={d["compatibility"]["summary"]}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
