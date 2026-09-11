#!/usr/bin/env python3
"""为一个核心传感器建立资产目录骨架与文本产物（§21、§26）。

用法：
    python Tools/create_sensor_asset.py --all
    python Tools/create_sensor_asset.py --sensor-id US_SONAR_LAB

生成的文本产物：
    Source/<ID>_GEOMETRY_SPEC.json   确定性几何参数（可复跑依据）
    Documentation/<ID>_SPEC.json     资产规格
    Documentation/<ID>_README.md     资产说明
    LOD/<ID>_LOD_PLAN.json           层级预算与目标
    Textures/<ID>_MATERIALS.json     材质分配（无外部位图，保持离线）

Blend / FBX / Collision / Preview 由 `build_sensor_assets.py` 在 Blender 内生成。
"""
from __future__ import annotations

import argparse
import json

from sensor_common import (
    BRANCH_DIR,
    REQUIRED_ASSET_DIRS,
    SENSORS_ROOT,
    TODAY,
    save_json,
    save_text,
)
from sensor_dataset import dataset
from sensor_dataset_assets import CORE_ASSETS, FORM_FACTORS, MATERIALS
from sensor_dataset_branches import BRANCH_BY_ID


def asset_dir(asset: dict):
    return SENSORS_ROOT / BRANCH_DIR[asset['branch']] / asset['sensor_id']


def geometry_spec(asset: dict, variant: dict) -> dict:
    branch = BRANCH_BY_ID[asset['branch']]
    return {
        'sensor_id': asset['sensor_id'],
        'form_factor': asset['form_factor'],
        'form_factor_note': FORM_FACTORS[asset['form_factor']]['note'],
        'dimensions_m': asset['dimensions_m'],
        'axes': {'forward': '+X', 'port_starboard': 'Y', 'up': 'Z'},
        'units': 'meters (1 Blender meter = 100 Unreal Units)',
        'lod_detail_levels': {f'LOD{n}': n for n in range(4)},
        'determinism': '完全程序化构建；无随机数；同一输入必然产出同一网格。',
        'geometry_source': asset['geometry_source'],
        'source_note': asset['source_note'],
        'branch': asset['branch'],
        'branch_label_zh': branch['label_zh'],
        'socket': asset['socket'],
        'tier': f'T{variant["branch_tier"]}',
    }


def spec_document(asset: dict, variant: dict) -> dict:
    return {
        'asset_id': asset['sensor_id'],
        'generated_at': TODAY,
        'template_version': 'v1.0.0',
        'branch': asset['branch'],
        'tier': f'T{variant["branch_tier"]}',
        'country': variant['country'],
        'family': variant['family'],
        'name': variant['name'],
        'status': variant['status'],
        'confidence': variant['confidence'],
        'asset_status': 'PLANNED',
        'socket': asset['socket'],
        'geometry_source': asset['geometry_source'],
        'dimensions_m': asset['dimensions_m'],
        'materials': [material['material_id'] for material in MATERIALS],
        'compatible_submarines': variant.get('compatible_submarines', []),
        'references': variant.get('references', []),
    }


def readme(asset: dict, variant: dict) -> str:
    branch = BRANCH_BY_ID[asset['branch']]
    source = '公开外形' if asset['geometry_source'] == 'PUBLIC_FORM' else '游戏代表性外形'
    dims = asset['dimensions_m']
    return (
        f'# {asset["sensor_id"]}\n\n'
        f'- 名称：{variant["name"]}\n'
        f'- 分支：{branch["label_zh"]}（{asset["branch"]}）\n'
        f'- 层级：T{variant["branch_tier"]}\n'
        f'- 挂载插槽：{asset["socket"] or "无（软件层）"}\n'
        f'- 几何来源：{source}\n'
        f'- 代表性尺寸：长 {dims["length"]} m × 直径 {dims["diameter"]} m\n\n'
        '## 说明\n\n'
        f'{asset["source_note"]}\n\n'
        '## 约束\n\n'
        '- 只表现外形与接口，不制作真实内部结构。\n'
        '- 不记录任何分类或作战参数。\n'
        '- 纹理保持程序化材质，运行期完全离线。\n\n'
        '## 验证\n\n'
        '见 `Validation/` 目录与本资产的 `_VALIDATION.json`。\n'
    )


def lod_plan(asset: dict) -> dict:
    return {
        'sensor_id': asset['sensor_id'],
        'levels': [
            {'level': 'LOD0', 'role': '完整外形与阵元细节', 'ratio_to_source': 1.0},
            {'level': 'LOD1', 'role': '减少阵元数量', 'ratio_to_source': 0.5},
            {'level': 'LOD2', 'role': '仅保留主要体块', 'ratio_to_source': 0.25},
            {'level': 'LOD3', 'role': '轮廓锁定的最简外形', 'ratio_to_source': 0.12},
        ],
        'rules': [
            '全部 LOD 由同一程序化构建器按 detail 档位独立生成，不做 LOD1→LOD2 串联简化。',
            '轮廓件（阵面、桅杆杆体、拖曳舱体）在所有 LOD 中保留。',
            '三角计数必须自 LOD0 向 LOD3 单调不增。',
        ],
    }


def material_document(asset: dict) -> dict:
    return {
        'sensor_id': asset['sensor_id'],
        'texture_policy': '程序化材质；无外部位图；运行期完全离线。',
        'materials': MATERIALS,
    }


def create(asset: dict, variant: dict) -> dict:
    target = asset_dir(asset)
    for sub in REQUIRED_ASSET_DIRS:
        (target / sub).mkdir(parents=True, exist_ok=True)
    save_json(target / 'Source' / f'{asset["sensor_id"]}_GEOMETRY_SPEC.json', geometry_spec(asset, variant))
    save_json(target / 'Documentation' / f'{asset["sensor_id"]}_SPEC.json', spec_document(asset, variant))
    save_text(target / 'Documentation' / f'{asset["sensor_id"]}_README.md', readme(asset, variant))
    save_json(target / 'LOD' / f'{asset["sensor_id"]}_LOD_PLAN.json', lod_plan(asset))
    save_json(target / 'Textures' / f'{asset["sensor_id"]}_MATERIALS.json', material_document(asset))
    return {'sensor_id': asset['sensor_id'], 'path': str(target)}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--sensor-id', action='append', default=[])
    parser.add_argument('--all', action='store_true')
    args = parser.parse_args()

    variants = {variant['sensor_id']: variant for variant in dataset()['variants']}
    if args.sensor_id:
        wanted = set(args.sensor_id)
        assets = [asset for asset in CORE_ASSETS if asset['sensor_id'] in wanted]
        missing = wanted - {asset['sensor_id'] for asset in assets}
        if missing:
            raise SystemExit(f'未知资产 id：{sorted(missing)}')
    elif args.all:
        assets = list(CORE_ASSETS)
    else:
        raise SystemExit('请指定 --all 或 --sensor-id')

    created = []
    for asset in assets:
        variant = variants.get(asset['sensor_id'])
        if variant is None:
            raise SystemExit(f'数据集缺少变体：{asset["sensor_id"]}')
        created.append(create(asset, variant))
    print(json.dumps({'created': len(created), 'assets': created}, ensure_ascii=False, indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
