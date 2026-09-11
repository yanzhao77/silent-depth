#!/usr/bin/env python3
"""武器资产校验器：核对产出文件、FBX 版本、几何尺寸与 LOD 递减。

校验结论只反映真实执行过的检查：
  IMPLEMENTED  文件存在但未完成全部校验
  TESTED       结构、FBX、几何与 LOD 检查全部通过
  BROWSER VERIFIED 不适用于本工具（武器资产没有浏览器路径）
所有像素级检查基于渲染输出的统计量，不代表人工目视确认。
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from sdw_common import (  # noqa: E402
    TODAY,
    WEAPONS_ROOT,
    fbx_binary_version,
    load_json,
    save_json,
    sha256_file,
    weapon_asset_dir,
)
from weapon_dataset import VARIANTS_BY_ID  # noqa: E402
from weapon_geometry_kit import build_geometry  # noqa: E402

REQUIRED_DIRS = (
    'Source', 'Blend', 'FBX', 'Collision', 'Textures', 'Preview', 'Documentation', 'Validation',
)
REQUIRED_FILES = (
    'Blend/{id}_MASTER.blend',
    'FBX/{id}_LOD0.fbx',
    'FBX/{id}_LOD1.fbx',
    'FBX/{id}_LOD2.fbx',
    'FBX/{id}_LOD3.fbx',
    'Collision/{id}_COLLISION.fbx',
    'Documentation/{id}_SPEC.json',
    'Documentation/{id}_README.md',
)
PREVIEW_FILES = (
    'Preview/Hero.png',
    'Preview/Profile.png',
    'Preview/Top.png',
    'Preview/Detail.png',
    'Preview/Icon_128.png',
    'Preview/Icon_256.png',
    'Preview/Icon_512.png',
)
FBX_BINARY_VERSION = 7400


def image_stats(path: Path) -> dict:
    """可选的像素统计：无 Pillow 时明确返回 NOT_AVAILABLE。"""
    try:
        from PIL import Image  # type: ignore
        import numpy as np  # type: ignore
    except ImportError:
        return {'status': 'NOT_AVAILABLE', 'reason': 'Pillow/numpy 不可用，未做像素统计。'}
    try:
        with Image.open(path) as image:
            array = np.asarray(image.convert('RGBA'))
    except Exception as error:  # pragma: no cover - 依赖文件系统
        return {'status': 'FAILED', 'error': f'{type(error).__name__}: {error}'}
    alpha = array[..., 3]
    coverage = float((alpha > 8).mean())
    rgb = array[..., :3]
    return {
        'status': 'OK',
        'resolution': [int(array.shape[1]), int(array.shape[0])],
        'mean_luminance': round(float(rgb.mean()), 2),
        'min_luminance': int(rgb.min()),
        'max_luminance': int(rgb.max()),
        'subject_coverage': round(coverage, 4),
    }


def validate_weapon(weapon_id: str, load_spec_from_manifest: dict | None = None) -> dict:
    variant = VARIANTS_BY_ID.get(weapon_id)
    if variant is None:
        return {'weapon_id': weapon_id, 'result': 'FAIL', 'issues': ['数据集中不存在该武器。']}
    root = weapon_asset_dir(variant)
    issues: list[str] = []
    checks: dict[str, object] = {}

    for folder in REQUIRED_DIRS:
        if not (root / folder).is_dir():
            issues.append(f'缺少目录：{folder}')
    present_files = {}
    for pattern in REQUIRED_FILES:
        path = root / pattern.format(id=weapon_id)
        present_files[pattern] = path.is_file()
        if not path.is_file():
            issues.append(f'缺少文件：{pattern.format(id=weapon_id)}')
    checks['files'] = present_files

    fbx_versions = {}
    for pattern in REQUIRED_FILES:
        if not pattern.endswith('.fbx'):
            continue
        path = root / pattern.format(id=weapon_id)
        if path.is_file():
            fbx_versions[path.name] = fbx_binary_version(path)
    checks['fbx_binary_versions'] = fbx_versions
    wrong = {name: version for name, version in fbx_versions.items() if version != FBX_BINARY_VERSION}
    if wrong:
        issues.append(f'FBX 版本不是 {FBX_BINARY_VERSION}：{wrong}')

    # 几何一致性：用同一套几何工具复算期望包围盒
    spec_for_geometry = {
        'weapon_id': weapon_id,
        'family_id': variant['family_id'],
        'base_geometry': variant.get('base_geometry') or variant['family_id'],
        'geometry': variant['geometry'],
        'dimensions': variant['dimensions'],
        'body_diameter_m': (variant['geometry'].get('params') or {}).get('body_diameter_m')
        or variant['dimensions']['diameter_m'],
    }
    geometry_checks = {}
    previous_triangles = None
    for detail, lod in enumerate(('LOD0', 'LOD1', 'LOD2', 'LOD3')):
        part = build_geometry(spec_for_geometry, detail=detail)
        bounds = part.bounds()
        stats = part.stats()
        geometry_checks[lod] = {
            'expected_vertices': stats['vertices'],
            'expected_triangles': stats['triangles'],
            'expected_length_m': round(bounds['dimensions_m'][0], 4),
        }
        if previous_triangles is not None and stats['triangles'] > previous_triangles:
            issues.append(f'{lod} 三角面数未低于上一级 LOD。')
        previous_triangles = stats['triangles']
    declared_length = float(variant['dimensions']['length_m'])
    expected_length = geometry_checks['LOD0']['expected_length_m']
    if declared_length and abs(expected_length - declared_length) / declared_length > 0.05:
        issues.append(f'几何长度 {expected_length} m 与声明长度 {declared_length} m 偏差超过 5%。')
    checks['geometry'] = geometry_checks

    build_report_path = root / 'Validation' / f'{weapon_id}_BUILD.json'
    if build_report_path.is_file():
        build_report = load_json(build_report_path)
        checks['build'] = {
            'blender': build_report.get('blender'),
            'build_seconds': build_report.get('build_seconds'),
            'collision_boxes': build_report.get('collision_boxes'),
            'lod': build_report.get('lod'),
        }
        for lod in ('LOD0', 'LOD1', 'LOD2', 'LOD3'):
            actual = (build_report.get('lod') or {}).get(lod) or {}
            expected = geometry_checks[lod]
            if actual and actual.get('triangles') != expected['expected_triangles']:
                issues.append(
                    f'{lod} 实际三角面 {actual.get("triangles")} 与几何工具期望值 '
                    f'{expected["expected_triangles"]} 不一致。'
                )
    else:
        issues.append('缺少 Validation/{id}_BUILD.json（尚未由 Blender 工厂生成）。')

    # 导出后 roundtrip：把 FBX 重新导入 Blender 实测的几何与工厂记录比对。
    roundtrip_path = root / 'Validation' / f'{weapon_id}_FBX_ROUNDTRIP.json'
    if roundtrip_path.is_file():
        roundtrip = load_json(roundtrip_path)
        checks['fbx_roundtrip'] = {
            'result': roundtrip.get('result'),
            'lod_triangles': {
                lod: (roundtrip.get('lod', {}).get(lod) or {}).get('triangles')
                for lod in ('LOD0', 'LOD1', 'LOD2', 'LOD3')
            },
            'collision_objects': (roundtrip.get('collision') or {}).get('objects'),
        }
        if roundtrip.get('result') != 'PASS':
            issues.append(f"FBX roundtrip 未通过：{roundtrip.get('errors')}")
        else:
            build_lod = (load_json(build_report_path).get('lod') if build_report_path.is_file() else None) or {}
            for lod in ('LOD0', 'LOD1', 'LOD2', 'LOD3'):
                imported = (roundtrip.get('lod', {}).get(lod) or {}).get('triangles')
                expected = (build_lod.get(lod) or {}).get('triangles')
                if imported is not None and expected is not None and imported != expected:
                    issues.append(f'{lod} roundtrip 三角面 {imported} 与工厂记录 {expected} 不一致。')
            collision = roundtrip.get('collision') or {}
            if not collision.get('objects'):
                issues.append('碰撞体 FBX 导入后没有网格对象。')
    else:
        issues.append('缺少 Validation/{id}_FBX_ROUNDTRIP.json（导出后 roundtrip 未执行）。')

    preview_checks = {}
    for pattern in PREVIEW_FILES:
        path = root / pattern
        if path.is_file():
            preview_checks[pattern] = image_stats(path)
        else:
            preview_checks[pattern] = {'status': 'MISSING'}
            if (root / 'Blend').is_dir() and list((root / 'Blend').glob('*.blend')):
                issues.append(f'缺少预览图：{pattern}')
    checks['previews'] = preview_checks
    icons_ok = all(
        preview_checks[p].get('subject_coverage', 0) > 0.01
        for p in ('Preview/Icon_256.png',)
        if preview_checks[p].get('status') == 'OK'
    )
    icons_status = preview_checks['Preview/Icon_256.png'].get('status')
    if icons_status == 'OK' and not icons_ok:
        issues.append('Icon_256.png 主体覆盖率过低，可能未正确取景。')

    label = 'TESTED' if not issues else ('IMPLEMENTED' if present_files['Blend/{id}_MASTER.blend'] else 'MISSING')
    result = 'PASS' if not issues else 'FAIL'
    return {
        'weapon_id': weapon_id,
        'category': variant['category'],
        'tier': variant['tier'],
        'asset_priority': variant['asset_priority'],
        'asset_dir': str(root),
        'result': result,
        'label': label,
        'issues': issues,
        'checks': checks,
        'sha256': {
            name: sha256_file(root / pattern.format(id=weapon_id))
            for name, pattern in (('master', REQUIRED_FILES[0]), ('lod0', REQUIRED_FILES[1]))
        },
        'validated_at': TODAY,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--weapons', nargs='*', default=None)
    parser.add_argument('--only-built', action='store_true')
    parser.add_argument('--out', default=str(WEAPONS_ROOT / 'Validation' / 'WEAPON_VALIDATION_SUMMARY.json'))
    args = parser.parse_args()

    if args.weapons:
        weapon_ids = args.weapons
    else:
        weapon_ids = sorted(VARIANTS_BY_ID)
    if args.only_built:
        weapon_ids = [
            weapon_id for weapon_id in weapon_ids
            if (weapon_asset_dir(VARIANTS_BY_ID[weapon_id]) / 'Blend' / f'{weapon_id}_MASTER.blend').is_file()
        ]

    results = []
    for weapon_id in weapon_ids:
        result = validate_weapon(weapon_id)
        root = weapon_asset_dir(VARIANTS_BY_ID[weapon_id])
        if root.is_dir() and (root / 'Blend').is_dir() and list((root / 'Blend').glob('*.blend')):
            save_json(root / 'Validation' / f'{weapon_id}_VALIDATION.json', result)
        results.append(result)

    summary = {
        'validator': 'SilentDepth_Weapon_Asset_Validator',
        'generated_at': TODAY,
        'fbx_binary_version_required': FBX_BINARY_VERSION,
        'totals': {
            'checked': len(results),
            'pass': sum(1 for r in results if r['result'] == 'PASS'),
            'fail': sum(1 for r in results if r['result'] == 'FAIL'),
            'tested': sum(1 for r in results if r.get('label') == 'TESTED'),
            'built_assets': sum(1 for r in results if r['checks']['files'].get('Blend/{id}_MASTER.blend')),
        },
        'results': results,
    }
    save_json(Path(args.out), summary)
    print(f"CHECKED={summary['totals']['checked']}")
    print(f"BUILT={summary['totals']['built_assets']}")
    print(f"PASS={summary['totals']['pass']} FAIL={summary['totals']['fail']}")
    for result in results:
        if result['checks']['files'].get('Blend/{id}_MASTER.blend') and result['issues']:
            print(f"  {result['weapon_id']}: {len(result['issues'])} 项问题 -> {result['issues'][0]}")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
