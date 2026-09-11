#!/usr/bin/env python3
"""几何唯一性审计：用生产路径复算几何，度量跨家族近似重复。

审查结论（P0-1）指出：仅靠"签名是否逐位相同"无法发现"差 0.5% 的复制改名"。
本审计用**侧影剖面**度量形状相似度，而不是顶点最近邻距离——后者会被共同的中段
圆柱体掩盖：两根同直径圆柱即使头尾完全不同，大部分顶点仍然落在对方表面上。

度量方式：

1. 用与 `build_weapon_assets.py` 完全相同的 spec（含 family_id）调用几何工具，
   审计与生产走同一条代码路径。
2. 沿弹体轴向取 N 个站位，统计每个站位上顶点到中轴的最大距离（含弹翼与尾鳍），
   得到该武器的侧影剖面 r(x)。
3. 对声明尺寸相同、不同 Weapon Family 的武器对，计算剖面差异的 RMS 与最大值
   （占声明长度的百分比）。**最大差异低于阈值**即视为"在游戏镜头下是同一个外形"。

输出：`Manifest/weapon_geometry_distinctness.json`
"""
from __future__ import annotations

import argparse
import math
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from sdw_common import MANIFEST_DIR, TODAY, save_json  # noqa: E402
from weapon_dataset import VARIANTS_BY_ID  # noqa: E402
from weapon_geometry_kit import build_geometry  # noqa: E402

DEFAULT_MAX_DIFF_PERCENT = 3.0  # 侧影最大差异占声明长度的百分比
STATIONS = 96


def geometry_spec(weapon_id: str) -> dict:
    variant = VARIANTS_BY_ID[weapon_id]
    params = variant['geometry'].get('params') or {}
    return {
        'weapon_id': weapon_id,
        'family_id': variant['family_id'],
        'base_geometry': variant.get('base_geometry') or variant['family_id'],
        'geometry': variant['geometry'],
        'dimensions': variant['dimensions'],
        'body_diameter_m': params.get('body_diameter_m') or variant['dimensions']['diameter_m'],
    }


def silhouette(weapon_id: str):
    import numpy as np

    spec = geometry_spec(weapon_id)
    part = build_geometry(spec, detail=0)
    points = np.asarray(part.vertices, dtype=float)
    length = float(spec['dimensions']['length_m']) or 1.0
    radius = np.sqrt(points[:, 1] ** 2 + points[:, 2] ** 2)
    edges = np.linspace(-0.5, 0.5, STATIONS + 1) * length
    profile = np.zeros(STATIONS, dtype=float)
    index = np.clip(np.digitize(points[:, 0], edges) - 1, 0, STATIONS - 1)
    for station in np.unique(index):
        profile[station] = radius[index == station].max()
    return profile / length, part.stats()


def pair_metric(a, b) -> dict:
    """侧影剖面差异：RMS / 最大值，单位＝占声明长度的百分比。"""
    import numpy as np

    delta = np.abs(a - b)
    return {
        'rms_percent': round(float(np.sqrt((delta ** 2).mean())) * 100.0, 3),
        'max_percent': round(float(delta.max()) * 100.0, 3),
    }


def audit(max_diff_percent: float) -> dict:
    stats: dict[str, dict] = {}
    profiles: dict[str, object] = {}
    dimension_groups: dict[tuple, list[str]] = defaultdict(list)

    for weapon_id, variant in VARIANTS_BY_ID.items():
        profile, stat = silhouette(weapon_id)
        profiles[weapon_id] = profile
        stats[weapon_id] = stat
        key = (round(float(variant['dimensions']['length_m']), 2),
               round(float(variant['dimensions']['diameter_m']), 2))
        dimension_groups[key].append(weapon_id)

    comparisons = []
    violations = []
    for key, members in dimension_groups.items():
        if len(members) < 2:
            continue
        for index, first in enumerate(members):
            for second in members[index + 1:]:
                if VARIANTS_BY_ID[first]['family_id'] == VARIANTS_BY_ID[second]['family_id']:
                    continue  # 同家族共享基础几何，符合规范第 20 条
                metric = pair_metric(profiles[first], profiles[second])
                record = {
                    'weapon_a': first,
                    'weapon_b': second,
                    'family_a': VARIANTS_BY_ID[first]['family_id'],
                    'family_b': VARIANTS_BY_ID[second]['family_id'],
                    'declared_length_m': key[0],
                    'declared_diameter_m': key[1],
                    **metric,
                }
                comparisons.append(record)
                if metric['max_percent'] < max_diff_percent:
                    violations.append(record)

    comparisons.sort(key=lambda item: item['max_percent'])
    return {
        'audit': 'WeaponGeometryDistinctness',
        'generated_at': TODAY,
        'method': (
            '生产同路径复算 LOD0；沿轴向 96 个站位统计含弹翼/尾鳍的最大半径得到侧影剖面，'
            '同声明尺寸、不同 Weapon Family 的武器对比较剖面 RMS 与最大差异（占声明长度百分比）。'
        ),
        'thresholds': {'silhouette_max_diff_percent_min': max_diff_percent, 'stations': STATIONS},
        'summary': {
            'weapons_audited': len(stats),
            'same_size_cross_family_pairs': len(comparisons),
            'violations': len(violations),
            'worst_pair': comparisons[0] if comparisons else None,
        },
        'violations': violations,
        'pairs': comparisons,
        'per_weapon': stats,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--threshold', type=float, default=DEFAULT_MAX_DIFF_PERCENT)
    parser.add_argument('--out', default=str(MANIFEST_DIR / 'weapon_geometry_distinctness.json'))
    args = parser.parse_args()
    result = audit(args.threshold)
    save_json(Path(args.out), result)
    summary = result['summary']
    print(f"AUDITED_WEAPONS={summary['weapons_audited']}")
    print(f"SAME_SIZE_CROSS_FAMILY_PAIRS={summary['same_size_cross_family_pairs']}")
    print(f"VIOLATIONS={summary['violations']}")
    worst = summary['worst_pair']
    if worst:
        print(f"WORST={worst['weapon_a']} vs {worst['weapon_b']} "
              f"max={worst['max_percent']}% rms={worst['rms_percent']}%")
    for item in result['violations'][:10]:
        print(f"  VIOLATION {item['weapon_a']} vs {item['weapon_b']} max={item['max_percent']}%")
    return 1 if result['violations'] else 0


if __name__ == '__main__':
    raise SystemExit(main())
