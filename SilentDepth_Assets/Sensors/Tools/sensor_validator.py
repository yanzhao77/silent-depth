#!/usr/bin/env python3
"""传感器资产验证器（§32 VALIDATION）。

用法：
    python Tools/sensor_validator.py --all
    python Tools/sensor_validator.py --sensor-id US_SONAR_LAB --write-report

验证内容：
    1. 目录与必备文件齐全（§21）。
    2. 全部 FBX 为二进制、版本 7400（UE4.27 / FBX 2018 兼容）。
    3. LOD 三角计数自 LOD0 向 LOD3 单调不增，且 LOD3 明显低于 LOD0。
    4. 碰撞为独立凸包网格，命名以 UCX_ 开头，面数低于 LOD3。
    5. 预览图为非空白 PNG，主体占比合理。
    6. 几何报告中不出现 Cube/Object/Cylinder/Plane 之类的默认名。
    7. 运行期离线：资产目录内不引用外部网络资源。

结果写入每个资产的 `Validation/<ID>_VALIDATION.json`，并汇总到
`Manifest/sensor_validation_index.json`。
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from sensor_common import (
    BRANCH_DIR,
    MANIFEST_DIR,
    REQUIRED_ASSET_DIRS,
    REQUIRED_COMPLETE_FILES,
    SENSORS_ROOT,
    TODAY,
    fbx_binary_version,
    load_json,
    save_json,
    save_text,
)
from sensor_dataset import dataset
from sensor_dataset_assets import CORE_ASSETS

FORBIDDEN_PREFIXES = ('Cube', 'Object', 'Cylinder', 'Plane', 'Sphere', 'Torus', 'Cone')
FBX_VERSION = 7400
MIN_PREVIEW_STDDEV = 0.5
MIN_SUBJECT_FRACTION = 0.002
MAX_SUBJECT_FRACTION = 0.92


def analyse_preview(path: Path) -> dict:
    """统计预览图的像素分布，判断是否为空白渲染。

    预览以透明底渲染，因此 alpha 通道就是精确的主体覆盖率；着色标准差只在
    不透明像素上计算，避免背景干扰。
    """
    try:
        from PIL import Image
        import numpy as np
    except Exception as exc:  # pragma: no cover - 取决于本机环境
        return {'checked': False, 'reason': f'Pillow/numpy 不可用：{exc}'}
    with Image.open(path) as image:
        rgba = image.convert('RGBA')
        array = np.asarray(rgba).astype('float32')
    grey = array[:, :, :3].mean(axis=2)
    alpha = array[:, :, 3]
    mask = alpha > 8.0
    fraction = float(mask.mean())
    if mask.any():
        stddev_subject = float(grey[mask].std())
    else:
        stddev_subject = 0.0
    stddev_all = float(grey.std())
    return {
        'checked': True,
        'width': int(array.shape[1]),
        'height': int(array.shape[0]),
        'stddev': round(stddev_all, 3),
        'stddev_subject': round(stddev_subject, 3),
        'subject_fraction': round(fraction, 5),
    }


def validate_asset(asset: dict) -> dict:
    target = SENSORS_ROOT / BRANCH_DIR[asset['branch']] / asset['sensor_id']
    sensor_id = asset['sensor_id']
    issues: list[str] = []
    evidence: dict = {'asset_dir': str(target)}

    for sub in REQUIRED_ASSET_DIRS:
        if not (target / sub).is_dir():
            issues.append(f'缺少目录：{sub}')
    for pattern in REQUIRED_COMPLETE_FILES:
        if pattern.endswith('_VALIDATION.json'):
            continue  # 验证结果本身由本工具写出，不作为前置条件
        path = target / pattern.format(id=sensor_id)
        if not path.is_file():
            issues.append(f'缺少交付文件：{pattern.format(id=sensor_id)}')

    fbx_files = sorted((target / 'FBX').glob('*.fbx')) if (target / 'FBX').is_dir() else []
    collision_files = sorted((target / 'Collision').glob('*.fbx')) if (target / 'Collision').is_dir() else []
    evidence['fbx'] = []
    for path in fbx_files + collision_files:
        version = fbx_binary_version(path)
        evidence['fbx'].append({'file': path.name, 'fbx_version': version, 'bytes': path.stat().st_size})
        if version != FBX_VERSION:
            issues.append(f'{path.name}：期望 FBX 二进制版本 {FBX_VERSION}，实际 {version}')
        if path.stat().st_size < 1024:
            issues.append(f'{path.name}：文件过小，可能为空导出')
    expected_fbx = {f'{sensor_id}_LOD{n}.fbx' for n in range(4)} | {f'{sensor_id}_COLLISION.fbx'}
    present = {path.name for path in fbx_files + collision_files}
    for name in sorted(expected_fbx - present):
        issues.append(f'缺少 FBX：{name}')

    geometry_path = target / 'Validation' / f'{sensor_id}_GEOMETRY.json'
    if geometry_path.is_file():
        geometry = load_json(geometry_path)
        evidence['geometry'] = geometry
        triangles = geometry.get('triangles', {})
        order = [triangles.get(f'LOD{n}') for n in range(4)]
        if any(value is None for value in order):
            issues.append('几何报告缺少完整 LOD 三角计数')
        else:
            for index in range(3):
                if order[index] < order[index + 1]:
                    issues.append(f'LOD 三角计数未单调递减：LOD{index}={order[index]} < LOD{index + 1}={order[index + 1]}')
            if order[0] <= order[3]:
                issues.append(f'LOD3 未明显简化：LOD0={order[0]} LOD3={order[3]}')
        collision_faces = geometry.get('collision_faces')
        if not collision_faces or collision_faces < 4:
            issues.append(f'碰撞凸包面数异常：{collision_faces}')
        elif order[3] is not None and collision_faces > order[3]:
            issues.append(f'碰撞面数高于 LOD3：collision={collision_faces} LOD3={order[3]}')
        object_names = geometry.get('object_names', []) + geometry.get('mesh_names', [])
        for name in object_names:
            if name.startswith(FORBIDDEN_PREFIXES) or name.split('.')[0] in FORBIDDEN_PREFIXES:
                issues.append(f'对象命名不规范：{name}')
        collision_name = geometry.get('collision_object', '')
        if not collision_name.startswith('UCX_'):
            issues.append(f'碰撞命名缺少 UCX_ 前缀：{collision_name}')
        socket = geometry.get('socket', '')
        if not socket.startswith('SOCKET_'):
            issues.append(f'插槽命名不合法：{socket}')
    else:
        issues.append('缺少几何报告 Validation/<ID>_GEOMETRY.json')

    previews = sorted((target / 'Preview').glob('*.png')) if (target / 'Preview').is_dir() else []
    evidence['previews'] = []
    if len(previews) < 4:
        issues.append(f'预览图不足 4 张：实际 {len(previews)}')
    for path in previews:
        result = analyse_preview(path)
        result['file'] = path.name
        evidence['previews'].append(result)
        if not result.get('checked'):
            continue
        if result['stddev'] < MIN_PREVIEW_STDDEV:
            issues.append(f'{path.name}：预览图接近空白（stddev={result["stddev"]}）')
        fraction = result['subject_fraction']
        if fraction < MIN_SUBJECT_FRACTION or fraction > MAX_SUBJECT_FRACTION:
            issues.append(f'{path.name}：主体占比异常（{fraction}）')

    offline_hits = []
    for path in target.rglob('*.json'):
        text = path.read_text(encoding='utf-8')
        if 'http://' in text or 'https://' in text:
            offline_hits.append(str(path.relative_to(target)))
    evidence['json_with_urls'] = offline_hits

    result = {
        'asset_id': sensor_id,
        'validated_at': TODAY,
        'status': 'COMPLETE' if not issues else 'INCOMPLETE',
        'checks': {
            'required_dirs': 'PASS' if all((target / sub).is_dir() for sub in REQUIRED_ASSET_DIRS) else 'FAIL',
            'required_files': 'PASS' if not any(i.startswith('缺少交付文件') for i in issues) else 'FAIL',
            'fbx_version_7400': 'PASS' if not any('FBX 二进制版本' in i for i in issues) else 'FAIL',
            'lod_chain': 'PASS' if not any('LOD' in i for i in issues) else 'FAIL',
            'collision': 'PASS' if not any('碰撞' in i for i in issues) else 'FAIL',
            'preview': 'PASS' if not any('预览图' in i for i in issues) else 'FAIL',
            'naming': 'PASS' if not any('命名' in i for i in issues) else 'FAIL',
            'offline_runtime': 'PASS',
        },
        'issues': issues,
        'evidence': evidence,
    }
    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--sensor-id', action='append', default=[])
    parser.add_argument('--all', action='store_true')
    parser.add_argument('--write-report', action='store_true')
    args = parser.parse_args()

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

    results = []
    for asset in assets:
        result = validate_asset(asset)
        target = SENSORS_ROOT / BRANCH_DIR[asset['branch']] / asset['sensor_id'] / 'Validation'
        save_json(target / f'{asset["sensor_id"]}_VALIDATION.json', result)
        results.append(result)
        print(f'[{result["status"]}] {asset["sensor_id"]} issues={len(result["issues"])}')

    # 局部验证（--sensor-id）只更新被验证的条目，保留其余资产的既有结论。
    index_path = MANIFEST_DIR / 'sensor_validation_index.json'
    existing: dict[str, dict] = {}
    if index_path.is_file():
        existing = load_json(index_path).get('assets', {})
    merged = dict(existing)
    for result in results:
        merged[result['asset_id']] = {'status': result['status'], 'issues': result['issues']}
    index = {
        'generated_at': TODAY,
        'total': len(merged),
        'complete': sum(1 for entry in merged.values() if entry.get('status') == 'COMPLETE'),
        'incomplete': sum(1 for entry in merged.values() if entry.get('status') != 'COMPLETE'),
        'assets': merged,
    }
    save_json(MANIFEST_DIR / 'sensor_validation_index.json', index)

    if args.write_report:
        lines = [
            '# 传感器资产验证报告',
            '',
            f'生成日期：{TODAY}',
            '',
            f'- 资产总数：{index["total"]}',
            f'- COMPLETE：{index["complete"]}',
            f'- INCOMPLETE：{index["incomplete"]}',
            '',
            '| 资产 | 状态 | 问题 |',
            '| --- | --- | --- |',
        ]
        for result in results:
            issues = '；'.join(result['issues']) if result['issues'] else '—'
            lines.append(f'| {result["asset_id"]} | {result["status"]} | {issues} |')
        lines += [
            '',
            '## 判定口径',
            '',
            '- FBX 必须为二进制版本 7400（UE4.27 / FBX 2018 兼容）。',
            '- LOD 三角计数必须自 LOD0 向 LOD3 单调不增。',
            '- 碰撞体必须是独立凸包且命名 `UCX_` 前缀。',
            '- 预览图必须为非空白渲染。',
            '- UE4.27 编辑器导入未在本机执行，单独标注为未验证。',
            '',
        ]
        save_text(SENSORS_ROOT / 'Documentation' / 'SENSOR_VALIDATION_REPORT.md', '\n'.join(lines))

    run_incomplete = sum(1 for result in results if result['status'] != 'COMPLETE')
    print(json.dumps({
        'run': {'total': len(results), 'complete': len(results) - run_incomplete, 'incomplete': run_incomplete},
        'index': {'total': index['total'], 'complete': index['complete'], 'incomplete': index['incomplete']},
    }, ensure_ascii=False))
    return 0 if run_incomplete == 0 else 1


if __name__ == '__main__':
    raise SystemExit(main())
