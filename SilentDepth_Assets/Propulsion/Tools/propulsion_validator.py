#!/usr/bin/env python3
"""推进系统资产校验器（纯标准库，不需要 Blender）。

用法：
  python propulsion_validator.py --root <Propulsion 根> [--asset <ASSET_ID>]
                                 [--json-out <path>] [--no-write]

检查项见 Templates/PROPULSION_ASSET_TEMPLATE.md 第 8 节：
Blend / FBX / LOD / Collision / Origin / Scale / Material / Texture / Socket /
Manifest / Preview。
"""
import argparse
import json
from datetime import date, datetime
from pathlib import Path

VALIDATOR_VERSION = '1.0.0'
CATEGORIES = ['Propellers', 'PumpJets', 'Shafts', 'Thrusters']
LODS = [0, 1, 2, 3]
LOD_RATIO_LIMITS = {1: 0.60, 2: 0.35, 3: 0.15}
DIMENSION_TOLERANCE = 0.02
REQUIRED_SOCKET = {
    'PROPELLER': 'SOCKET_PROPULSOR',
    'PUMPJET': 'SOCKET_PUMPJET',
    'SHAFT': 'SOCKET_SHAFT',
    'THRUSTER': 'SOCKET_THRUSTER',
}
MIN_PREVIEW_BYTES = 5000


def read_json(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def write_json(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')


def fbx_binary_version(path):
    with open(path, 'rb') as handle:
        header = handle.read(27)
    if len(header) < 27 or b'Kaydara FBX Binary' not in header[:23]:
        return None
    return int.from_bytes(header[23:27], 'little')


def is_png(path):
    with open(path, 'rb') as handle:
        return handle.read(8) == b'\x89PNG\r\n\x1a\n'


class CheckList:
    def __init__(self):
        self.checks = []

    def add(self, name, ok, detail, severity='FAIL'):
        self.checks.append({
            'check': name,
            'result': 'PASS' if ok else severity,
            'detail': detail,
        })
        return ok

    def fail_count(self):
        return sum(1 for check in self.checks if check['result'] == 'FAIL')

    def warn_count(self):
        return sum(1 for check in self.checks if check['result'] == 'WARN')


def validate_asset(root, asset_id, category, kind, manifest_entry):
    asset_dir = root / category / asset_id
    checks = CheckList()

    required_files = {
        'blend': asset_dir / 'Blend' / f'{asset_id}_MASTER.blend',
        'spec': asset_dir / 'Documentation' / f'{asset_id}_SPEC.json',
        'readme': asset_dir / 'Documentation' / f'{asset_id}_README.md',
        'build_report': asset_dir / 'Validation' / f'{asset_id}_BUILD_REPORT.json',
        'collision': asset_dir / 'Collision' / f'{asset_id}_COLLISION.fbx',
    }
    for lod in LODS:
        required_files[f'lod{lod}'] = asset_dir / 'FBX' / f'{asset_id}_LOD{lod}.fbx'

    missing = [name for name, path in required_files.items() if not path.exists()]
    checks.add('files_present', not missing, f'缺失：{", ".join(missing)}' if missing else '全部存在')

    previews = sorted((asset_dir / 'Preview').glob('*.png')) if (asset_dir / 'Preview').exists() else []
    checks.add('preview_present', len(previews) > 0, f'{len(previews)} 张预览')
    if previews:
        bad = [path.name for path in previews if not is_png(path) or path.stat().st_size <= MIN_PREVIEW_BYTES]
        checks.add('preview_files', not bad, f'格式或体积不合格：{bad}' if bad else 'PNG 头与体积合格')

    fbx_versions = {}
    for name, path in required_files.items():
        if not name.startswith('lod') and name != 'collision':
            continue
        if path.exists():
            fbx_versions[name] = fbx_binary_version(path)
    wrong_version = {name: version for name, version in fbx_versions.items() if version != 7400}
    checks.add(
        'fbx_binary_version',
        bool(fbx_versions) and not wrong_version,
        f'非 7400：{wrong_version}' if wrong_version else f'{len(fbx_versions)} 个 FBX 均为 7400',
    )

    if not required_files['build_report'].exists():
        checks.add('build_report_readable', False, '缺少构建报告，后续检查无法进行')
        return finalize(asset_id, category, kind, checks, asset_dir, root)

    report = read_json(required_files['build_report'])
    lods = {entry['lod']: entry for entry in report.get('lods', [])}
    checks.add('build_report_readable', len(lods) == 4, f'LOD 条目：{sorted(lods)}')

    triangles = {lod: lods[lod]['triangles'] for lod in lods if lod in lods}
    monotonic = all(
        triangles[lod] > triangles[lod + 1]
        for lod in sorted(triangles)
        if lod + 1 in triangles
    )
    checks.add('lod_triangle_monotonic', monotonic, f'面数：{triangles}')
    if 0 in triangles and triangles[0] > 0:
        over = {
            lod: round(triangles[lod] / triangles[0], 3)
            for lod, limit in LOD_RATIO_LIMITS.items()
            if lod in triangles and triangles[lod] / triangles[0] > limit
        }
        checks.add(
            'lod_triangle_ratio',
            not over,
            f'超出建议比例：{over}' if over else '各 LOD 比例在建议范围内',
            severity='WARN',
        )

    dimensions = {lod: lods[lod]['dimensions_m'] for lod in lods}
    worst = 0.0
    worst_pair = None
    for lod, dims in dimensions.items():
        for other_lod, other_dims in dimensions.items():
            if other_lod <= lod:
                continue
            for axis in range(3):
                base = max(abs(dims[axis]), abs(other_dims[axis]), 1e-6)
                relative = abs(dims[axis] - other_dims[axis]) / base
                if relative > worst:
                    worst = relative
                    worst_pair = f'LOD{lod} vs LOD{other_lod} 轴{axis}'
    checks.add(
        'lod_dimension_consistency',
        worst <= DIMENSION_TOLERANCE,
        f'最大相对误差 {worst:.2%}（{worst_pair}）',
    )

    origin_rule = report.get('origin_rule')
    checks.add('origin_rule', bool(origin_rule), f'origin_rule = {origin_rule}')
    socket_names = [socket['name'] for socket in report.get('sockets', [])]
    has_any = any(name.startswith('SOCKET_') for name in socket_names)
    checks.add('socket_prefix', has_any, f'插槽：{socket_names}')
    expected = REQUIRED_SOCKET.get(kind)
    if expected:
        checks.add('socket_required_kind', expected in socket_names, f'缺少 {expected}' if expected not in socket_names else f'含 {expected}')

    report_checks = report.get('checks', {})
    checks.add('scale_applied', bool(report_checks.get('scale_applied')), '缩放已应用')
    checks.add('transforms_applied', bool(report_checks.get('object_transforms_applied')), '旋转已应用')
    checks.add('forbidden_names', not report_checks.get('forbidden_names'), f'{report_checks.get("forbidden_names")}')
    checks.add('uv_present', not report_checks.get('objects_missing_uv'), f'{report_checks.get("objects_missing_uv")}')
    checks.add('material_present', not report_checks.get('objects_missing_material'), f'{report_checks.get("objects_missing_material")}')

    materials = report.get('materials', [])
    default_material = [entry['name'] for entry in materials if entry['name'] == 'Material']
    checks.add('material_named', bool(materials) and not default_material, f'{len(materials)} 个材质' if not default_material else '存在默认材质名 Material')

    missing_textures = []
    for entry in materials:
        for texture in entry.get('texture_files', []) or []:
            if not (root / texture).exists():
                missing_textures.append(texture)
    checks.add('textures_resolve', not missing_textures, f'缺失贴图：{missing_textures}' if missing_textures else '无外部贴图依赖或贴图齐全', severity='WARN')

    collision = report.get('collision', {})
    collision_file = Path(collision.get('file', ''))
    collision_ok = (
        collision.get('convex_hull_count', 0) >= 1
        and collision_file.name.endswith('_COLLISION.fbx')
        and collision_file.exists()
    )
    checks.add('collision', collision_ok, f'{collision.get("objects")} 文件={collision_file.name}')

    if manifest_entry is not None:
        matches = (
            manifest_entry.get('asset_id') == asset_id
            and manifest_entry.get('category') == category
            and manifest_entry.get('kind') == kind
        )
        checks.add('manifest_consistency', matches, '清单与资产规格一致' if matches else '清单与资产规格不一致')
        paths = manifest_entry.get('paths', {})
        missing_paths = [
            key for key in ['blend', 'lod0', 'lod1', 'lod2', 'lod3', 'collision', 'spec', 'readme']
            if not (root / paths.get(key, '')).exists()
        ]
        checks.add('manifest_paths', not missing_paths, f'清单路径缺失：{missing_paths}' if missing_paths else '清单路径全部存在')

    return finalize(asset_id, category, kind, checks, asset_dir, root)


def finalize(asset_id, category, kind, checks, asset_dir, root):
    result = 'PASS' if checks.fail_count() == 0 else 'FAIL'
    return {
        'asset_id': asset_id,
        'category': category,
        'kind': kind,
        'asset_dir': str(asset_dir),
        'result': result,
        'warn_count': checks.warn_count(),
        'fail_count': checks.fail_count(),
        'checks': checks.checks,
        'issues': [check['detail'] for check in checks.checks if check['result'] == 'FAIL'],
    }


def discover_assets(root, manifest):
    assets = []
    if manifest and manifest.get('assets'):
        for entry in manifest['assets']:
            assets.append((entry['asset_id'], entry['category'], entry['kind'], entry))
        return assets
    for category in CATEGORIES:
        category_dir = root / category
        if not category_dir.exists():
            continue
        for validation_dir in category_dir.glob('*/Validation'):
            for report_path in validation_dir.glob('*_BUILD_REPORT.json'):
                report = read_json(report_path)
                assets.append((report['asset_id'], report['category'], report['kind'], None))
    return assets


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', required=True)
    parser.add_argument('--asset')
    parser.add_argument('--json-out')
    parser.add_argument('--no-write', action='store_true')
    args = parser.parse_args()

    root = Path(args.root).resolve()
    manifest_path = root / 'Manifest' / 'propulsion_manifest.json'
    manifest = read_json(manifest_path) if manifest_path.exists() else None

    assets = discover_assets(root, manifest)
    if args.asset:
        assets = [entry for entry in assets if entry[0] == args.asset]
        if not assets:
            raise SystemExit(f'未找到资产：{args.asset}')

    results = []
    manifest_entries = {entry['asset_id']: entry for entry in (manifest or {}).get('assets', [])}
    for asset_id, category, kind, manifest_entry in assets:
        result = validate_asset(root, asset_id, category, kind, manifest_entry)
        result['validated_at'] = datetime.now().isoformat(timespec='seconds')
        result['validator_version'] = VALIDATOR_VERSION
        results.append(result)
        if not args.no_write:
            write_json(root / category / asset_id / 'Validation' / f'{asset_id}_VALIDATION.json', result)
            if manifest_entry is not None:
                manifest_entry['validation'] = f'{category}/{asset_id}/Validation/{asset_id}_VALIDATION.json'

    if manifest is not None and not args.no_write:
        manifest['validated_at'] = date.today().isoformat()
        manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')

    passed = [result for result in results if result['result'] == 'PASS']
    failed = [result for result in results if result['result'] != 'PASS']
    summary = {
        'validator_version': VALIDATOR_VERSION,
        'validated_at': datetime.now().isoformat(timespec='seconds'),
        'assets': len(results),
        'passed': len(passed),
        'failed': len(failed),
        'failures': {result['asset_id']: result['issues'] for result in failed},
    }

    if args.json_out:
        write_json(args.json_out, {'summary': summary, 'results': results})

    print(json.dumps(summary, indent=2, ensure_ascii=False))
    for result in results:
        print(f"{result['result']:4} {result['asset_id']}（警告 {result['warn_count']}）")
        for issue in result['issues']:
            print(f'       - {issue}')
    raise SystemExit(0 if not failed else 1)


if __name__ == '__main__':
    main()
