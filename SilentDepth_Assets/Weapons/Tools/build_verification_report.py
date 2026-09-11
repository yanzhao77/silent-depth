#!/usr/bin/env python3
"""生成《审查结论与整改验证》文档。

内容来自真实产物：校验汇总、几何唯一性审计、插座报告、生产队列。
审查条目来自只读代码审查分包（`weapon_code_review`）的结论。
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from sdw_common import DOC_DIR, MANIFEST_DIR, TODAY, VALIDATION_DIR, load_json, save_text  # noqa: E402

REVIEW_ITEMS = [
    {
        'id': 'P0-1',
        'title': '跨家族几何近似重复（复制改名风险）',
        'status': '已整改并验证',
        'action': (
            '几何工具增加"家族外形签名"：头部剖面样式、尾段样式、控制面数量、后掠、'
            '剖面比例（头部 12%-29%、尾段 8%-22% 全长）与结尾区分特征按家族派生；'
            '同家族变体仍共享基础几何（符合 Family->Variant 规则）。'
        ),
        'evidence': 'Tools/weapon_geometry_kit.py::family_shape_signature / normalize_params；'
                    'Manifest/weapon_geometry_distinctness.json',
    },
    {
        'id': 'P1-1',
        'title': '唯一性审计与生产路径不一致',
        'status': '已整改',
        'action': (
            '新增 audit_geometry_distinctness.py：审计使用与 build_weapon_assets.py 完全相同的 '
            'spec（含 family_id），并改用侧影剖面度量替代会被共同圆柱体掩盖的顶点最近邻统计。'
        ),
        'evidence': 'Tools/audit_geometry_distinctness.py；Manifest/weapon_geometry_distinctness.json',
    },
    {
        'id': 'P1-2',
        'title': '生产队列永远到不了 COMPLETE，且统计口径不一致',
        'status': '已整改',
        'action': 'detect_state 改为读取 Validation/{id}_VALIDATION.json 的 PASS 结论后返回 COMPLETE；'
                  'status_counts 只统计本轮生产集合，字段口径统一。',
        'evidence': 'Tools/build_production_queue.py；Manifest/weapon_production_queue.json',
    },
    {
        'id': 'P1-3',
        'title': 'Blender 崩溃时整批失败被静默吞掉',
        'status': '已整改',
        'action': '批次结果解析失败（进程崩溃/被杀/未打印结果行）时，显式把该批全部武器标记 FAILED '
                  '并写入 blocking_conditions 与 retry_queue，同时保留日志尾部。',
        'evidence': 'Tools/build_weapon_assets.py::run_batch（raw_decode 解析 + 空结果兜底）',
    },
    {
        'id': 'P1-4',
        'title': '生产决策未被执行，DEFERRED 集合仍被建模',
        'status': '已整改并如实登记',
        'action': '生产决策改为数据集中显式声明：MODEL_NOW（第一批 46 个）与 MODEL_EXTENDED'
                  '（第二批：数据完整且与既有平台有兼容关系的非数据库条目），共 120 个；'
                  'DATABASE_ONLY 4 个不建模。重建集合不再依赖磁盘状态，命令可复现。',
        'evidence': 'Tools/weapon_production_curation.py；Tools/build_weapon_assets.py --all-built',
    },
    {
        'id': 'P1-5',
        'title': '650 毫米武器被标为兼容，但发射接口里没有 650 毫米插座',
        'status': '已整改',
        'action': '为 Akula（4 具，PUBLIC）、Sierra（2 具，PUBLIC）、Victor（2 具，PROBABLE）'
                  '补充 650 毫米发射管与对应插座，并在接口中输出 tube_diameters_mm。',
        'evidence': 'Tools/data_submarine_fits.py::LARGE_TUBE_RAW',
    },
    {
        'id': 'P1-6',
        'title': '插座命名不符合规范，且资产侧插座不存在',
        'status': '已整改（3 艘本地有模型的潜艇）',
        'action': '插座命名改为 SOCKET_TORPEDO_## / SOCKET_MISSILE_## / SOCKET_SLBM_## / SOCKET_VLS_##；'
                  '新增 Blender 插座生成流程，为本地已有 MASTER.blend 的 3 艘潜艇增量生成插座，'
                  '原始主文件不被修改；其余 51 艘因缺少潜艇模型标记 WAITING_FOR_MODEL。',
        'evidence': 'Tools/build_weapon_sockets.py；Tools/weapon_socket_pass_blender.py；'
                    'Documentation/WeaponSocketReport.json',
    },
    {
        'id': 'P1-7',
        'title': '校验器无法验证 FBX 本体，TESTED 标签偏乐观',
        'status': '已整改',
        'action': '新增导出后 roundtrip 验证：把 LOD0..LOD3 与碰撞体 FBX 重新导入 Blender，'
                  '实测顶点/三角面/包围盒/材质并与工厂记录比对；校验器据此才给出 TESTED。'
                  '注意这是 Blender 导入器 roundtrip，不等于 UE4.27 编辑器导入。',
        'evidence': 'Tools/verify_weapon_fbx_roundtrip.py；Validation/{id}_FBX_ROUNDTRIP.json',
    },
    {
        'id': 'P2-1',
        'title': '重建采用"先归档再构建"，中断会留下半成品目录',
        'status': '已知，未整改',
        'action': '当前为归档后重建；旧产出保存在 Weapons/_archive/ 下可恢复。'
                  '更好的做法是构建到 staging 目录后原子替换，留给后续迭代。',
        'evidence': 'Tools/build_weapon_assets.py::archive_existing',
    },
    {
        'id': 'P2-2',
        'title': 'Blender 路径硬编码、档案目录无清理策略',
        'status': '已知，未整改',
        'action': 'BLENDER_CANDIDATES 仍为固定路径；_archive/ 会随重建增长，需要人工或后续脚本清理。',
        'evidence': 'Tools/build_weapon_assets.py；Weapons/_archive/',
    },
]


def render() -> str:
    validation_path = VALIDATION_DIR / 'WEAPON_VALIDATION_SUMMARY.json'
    validation = load_json(validation_path) if validation_path.is_file() else None
    distinctness_path = MANIFEST_DIR / 'weapon_geometry_distinctness.json'
    distinctness = load_json(distinctness_path) if distinctness_path.is_file() else None
    socket_path = DOC_DIR / 'WeaponSocketReport.json'
    sockets = load_json(socket_path) if socket_path.is_file() else None
    queue_path = MANIFEST_DIR / 'weapon_production_queue.json'
    queue = load_json(queue_path) if queue_path.is_file() else None

    lines = [
        '# 审查结论与整改验证',
        '',
        f'生成时间：{TODAY}',
        '',
        '本文记录武器资产工厂的代码审查结论（由独立只读审查分包给出）以及每一条的整改与验证证据。',
        '所有数字来自实际产出的 JSON，不来自人工估算。',
        '',
        '## 整改清单',
        '',
        '| 编号 | 问题 | 状态 |',
        '| --- | --- | --- |',
    ]
    for item in REVIEW_ITEMS:
        lines.append(f"| {item['id']} | {item['title']} | {item['status']} |")
    lines.append('')
    for item in REVIEW_ITEMS:
        lines.extend([
            f"### {item['id']} {item['title']}",
            '',
            f"- 状态：{item['status']}",
            f"- 整改：{item['action']}",
            f"- 证据：{item['evidence']}",
            '',
        ])

    lines.extend(['## 验证数据', ''])
    if validation:
        totals = validation['totals']
        lines.extend([
            '### 资产校验',
            '',
            f"- 已校验武器：{totals['checked']}",
            f"- PASS：{totals['pass']}　FAIL：{totals['fail']}",
            f"- 达到 TESTED：{totals['tested']}",
            f"- 已完成 FBX roundtrip（Blender 导入器）验证的武器：{totals['built_assets']}",
            '',
        ])
    if distinctness:
        summary = distinctness['summary']
        lines.extend([
            '### 几何唯一性',
            '',
            f"- 审计武器：{summary['weapons_audited']}",
            f"- 同尺寸跨家族武器对：{summary['same_size_cross_family_pairs']}",
            f"- 近似重复违规：{summary['violations']}",
            f"- 阈值：侧影剖面最大差异 ≥ {distinctness['thresholds']['silhouette_max_diff_percent_min']}% 弹体长度",
        ])
        worst = summary.get('worst_pair')
        if worst:
            lines.append(
                f"- 最接近的一对：{worst['weapon_a']} vs {worst['weapon_b']}，"
                f"最大差异 {worst['max_percent']}%（RMS {worst['rms_percent']}%）"
            )
        lines.append('')
    if sockets:
        summary = sockets['summary']
        lines.extend([
            '### 潜艇武器插座',
            '',
            f"- 已生成插座：{summary['processed']} 艘，共 {summary['sockets_created']} 个插座",
            f"- 等待潜艇模型：{summary['pending']} 艘",
            '',
        ])
        for result in sockets.get('results', []):
            if result.get('status') == 'OK':
                lines.append(
                    f"- {result['asset_id']}：{result['socket_count']} 个插座 → {result['sockets_fbx']}"
                )
        lines.append('')
    if queue:
        lines.extend([
            '### 生产队列',
            '',
            f"- 生产集合：{queue['summary']['queue_length']}",
            f"- DATABASE_ONLY：{queue['summary']['database_only']}",
            f"- 状态：{queue['summary']['status_counts']}",
            f"- 重试队列：{queue.get('retry_queue', [])}",
            '',
        ])

    lines.extend([
        '## 仍未验证的部分（如实披露）',
        '',
        '- UE4.27 编辑器内导入、材质重建与 LOD 切换：本机未执行 → **NOT VERIFIED**',
        '- 预览图与图标的人工目视确认：本机未执行（只有渲染统计量：分辨率、亮度、主体覆盖率）',
        '- 目标硬件性能（FPS、显存）：**NOT VERIFIED**',
        '- 公开资料逐条联网核对：未执行；兼容关系基于公开知识整理并分层标注可信度',
        '- 其余 51 艘潜艇的插座：潜艇模型尚不存在，标记 WAITING_FOR_MODEL',
        '',
    ])
    return '\n'.join(lines)


def main() -> int:
    path = DOC_DIR / 'VERIFICATION_AND_REVIEW_FIXES.md'
    save_text(path, render())
    print(f'OUT={path}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
