#!/usr/bin/env python3
"""武器数据集的派生索引与磁盘状态扫描。

所有构建脚本共用这里定义的路径规则与状态判定，保证 manifest、生产队列、
覆盖率报告三者结论一致。
"""
from __future__ import annotations

from pathlib import Path

from data_submarine_fits import SUBMARINE_FITS, SUBMARINE_LAUNCH_INTERFACES
from sdw_common import (
    CATEGORY_DIR,
    CATEGORY_LABEL,
    MANIFEST_DIR,
    TODAY,
    TREE_DIR,
    WEAPONS_ROOT,
    fbx_binary_version,
    load_submarines,
    weapon_slot,
)
from weapon_dataset import FAMILIES, FAMILIES_BY_ID, VARIANTS_BY_ID

CATEGORY_ORDER = ('TORP', 'ASM', 'LAM', 'ASW', 'SLBM', 'STRAT', 'MINE', 'DECOY', 'SPECIAL')

TIER_LABEL = {
    1: 'T1 早期基础武器',
    2: 'T2 早期制导鱼雷 / 初代潜射导弹',
    3: 'T3 冷战早期成熟鱼雷 / 初期巡航导弹',
    4: 'T4 冷战中期鱼雷 / 反舰导弹',
    5: 'T5 冷战后期先进鱼雷 / 远程导弹 / SLBM',
    6: 'T6 现代早期武器',
    7: 'T7 现代成熟武器',
    8: 'T8 现代先进武器',
    9: 'T9 新一代高端武器',
    10: 'T10 现代 / 未来顶级游戏武器',
}

PREVIEW_VIEWS = ('FRONT', 'SIDE', 'TOP', 'PERSPECTIVE')
PREVIEW_SIZES = (128, 256, 512)


def asset_dir(weapon: dict) -> Path:
    return WEAPONS_ROOT / CATEGORY_DIR[weapon['category']] / weapon['weapon_id']


def asset_paths(weapon: dict) -> dict:
    root = asset_dir(weapon)
    weapon_id = weapon['weapon_id']
    return {
        'root': root,
        'master': root / 'Blend' / f'{weapon_id}_MASTER.blend',
        'lod': [root / 'LOD' / f'{weapon_id}_LOD{i}.fbx' for i in range(4)],
        'collision': root / 'Collision' / f'{weapon_id}_COLLISION.fbx',
        'collision_manifest': root / 'Collision' / f'{weapon_id}_COLLISION.json',
        'spec': root / 'Documentation' / f'{weapon_id}_SPEC.json',
        'readme': root / 'Documentation' / f'{weapon_id}_README.md',
        'validation': root / 'Validation' / f'{weapon_id}_VALIDATION.json',
        'preview': {
            (view, size): root / 'Preview' / f'{weapon_id}_{view}_{size}.png'
            for view in PREVIEW_VIEWS for size in PREVIEW_SIZES
        },
        'icon': {
            size: root / 'Preview' / f'{weapon_id}_ICON_{size}.png' for size in PREVIEW_SIZES
        },
    }


def asset_status(weapon: dict) -> str:
    """按磁盘真实文件判定资产状态；不猜测、不预先标记完成。"""
    if weapon['asset_priority'] == 'DATABASE_ONLY':
        return 'DATABASE_ONLY'
    paths = asset_paths(weapon)
    present = {
        'master': paths['master'].is_file(),
        'lod': all(p.is_file() for p in paths['lod']),
        'collision': paths['collision'].is_file(),
        'validation': paths['validation'].is_file(),
        'preview': all(p.is_file() for p in paths['preview'].values()),
    }
    if all(present.values()):
        return 'COMPLETE'
    if any(present.values()):
        return 'PARTIAL'
    return 'PLANNED'


def fbx_versions(weapon: dict) -> dict:
    paths = asset_paths(weapon)
    versions = {f'lod{i}': fbx_binary_version(paths['lod'][i]) for i in range(4)}
    versions['collision'] = fbx_binary_version(paths['collision'])
    return versions


def fit_index() -> dict:
    """潜艇 -> 适配条目列表（data_submarine_fits 的 dict 视图）。"""
    return {
        submarine: {'submarine': submarine, 'weapons': rows}
        for submarine, rows in SUBMARINE_FITS.items()
    }


def compatible_submarines(weapon_id: str) -> list:
    """返回公开资料支持挂载该武器的潜艇（含明确标记的 GAMEPLAY 关系）。"""
    result = []
    for submarine, rows in SUBMARINE_FITS.items():
        for entry in rows:
            if entry['weapon'] == weapon_id and entry['compatibility'] in (
                'CONFIRMED', 'PROBABLE', 'GAMEPLAY',
            ):
                result.append(submarine)
                break
    return sorted(result)


def slot_index() -> dict:
    """潜艇 -> 槽位 -> 允许的武器 ID。"""
    table = {}
    for submarine, rows in SUBMARINE_FITS.items():
        slots = {}
        for entry in rows:
            weapon = VARIANTS_BY_ID.get(entry['weapon'])
            if weapon is None or entry['compatibility'] == 'INCOMPATIBLE':
                continue
            slot = weapon_slot(weapon['category'], weapon['launch_methods'])
            if slot is None:
                continue
            slots.setdefault(slot, []).append(entry['weapon'])
        table[submarine] = {k: sorted(set(v)) for k, v in sorted(slots.items())}
    return table


def strategic_variants() -> list:
    """科技树 STRAT 分支：带战略角色标签的武器（当前为 SLBM），不复制几何。"""
    return [
        weapon for weapon in VARIANTS_BY_ID.values()
        if 'strategic' in weapon.get('role_tags', ())
    ]


def sorted_variants() -> list:
    def key(weapon):
        order = CATEGORY_ORDER.index(weapon['category']) if weapon['category'] in CATEGORY_ORDER else 99
        return (weapon['country'], order, weapon['tier'], weapon['weapon_id'])

    return sorted(VARIANTS_BY_ID.values(), key=key)


def submarine_rows() -> list:
    return load_submarines()
