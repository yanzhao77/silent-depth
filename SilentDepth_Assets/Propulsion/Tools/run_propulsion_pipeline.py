#!/usr/bin/env python3
"""推进系统流水线驱动：批量建模 → 构建数据库 → 校验。

用法：
  python run_propulsion_pipeline.py --root <Propulsion 根> [--ids A B ...]
        [--skip-build] [--skip-database] [--skip-validate] [--no-preview]
        [--samples 32] [--blender <blender.exe>]
"""
import argparse
import json
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

DEFAULT_BLENDER = r'C:\tools\Blender Foundation\Blender 5.2\blender.exe'


def read_json(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def write_json(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')


def run(command, label):
    print(f'--- {label} ---')
    print(' '.join(str(part) for part in command))
    started = time.time()
    process = subprocess.run(command, capture_output=True, text=True, encoding='utf-8', errors='replace')
    for line in (process.stdout or '').splitlines():
        print(f'    {line}')
    if process.returncode != 0:
        for line in (process.stderr or '').splitlines()[-25:]:
            print(f'    ! {line}')
    return process.returncode, time.time() - started


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', required=True)
    parser.add_argument('--ids', nargs='*')
    parser.add_argument('--skip-build', action='store_true')
    parser.add_argument('--skip-database', action='store_true')
    parser.add_argument('--skip-validate', action='store_true')
    parser.add_argument('--no-preview', action='store_true')
    parser.add_argument('--samples', type=int, default=32)
    parser.add_argument('--blender', default=DEFAULT_BLENDER)
    args = parser.parse_args()

    root = Path(args.root).resolve()
    specs_path = root / 'Manifest' / 'propulsor_specs.json'
    specs = read_json(specs_path)['specs']
    if args.ids:
        wanted = set(args.ids)
        specs = [spec for spec in specs if spec['asset_id'] in wanted]

    report = {
        'started_at': datetime.now().isoformat(timespec='seconds'),
        'root': str(root),
        'build': [],
    }

    if not args.skip_build:
        for spec in specs:
            asset_id = spec['asset_id']
            command = [
                args.blender, '--background', '--factory-startup', '--python',
                str(root / 'Tools' / 'build_propulsor.py'), '--',
                '--spec', str(specs_path), '--id', asset_id, '--root', str(root),
                '--samples', str(args.samples),
            ]
            if args.no_preview:
                command.append('--no-preview')
            code, seconds = run(command, f'构建 {asset_id}')
            report['build'].append({
                'asset_id': asset_id,
                'exit_code': code,
                'seconds': round(seconds, 1),
                'status': 'OK' if code == 0 else 'FAIL',
            })

    if not args.skip_database:
        database_tool = root / 'Tools' / 'build_propulsion_database.py'
        if database_tool.exists():
            code, seconds = run(
                [sys.executable, str(database_tool), '--root', str(root)], '构建推进数据库'
            )
            report['database'] = {'exit_code': code, 'seconds': round(seconds, 1)}
        else:
            print('!! 未找到 build_propulsion_database.py，跳过数据库构建')
            report['database'] = {'exit_code': None, 'seconds': 0}

    if not args.skip_validate:
        validator = root / 'Tools' / 'propulsion_validator.py'
        code, seconds = run(
            [sys.executable, str(validator), '--root', str(root)], '校验推进资产'
        )
        report['validation'] = {'exit_code': code, 'seconds': round(seconds, 1)}

    report['finished_at'] = datetime.now().isoformat(timespec='seconds')
    write_json(root / 'Validation' / 'propulsion_pipeline_report.json', report)

    failed_builds = [entry['asset_id'] for entry in report['build'] if entry['status'] == 'FAIL']
    print(json.dumps({
        'built': len(report['build']),
        'build_failures': failed_builds,
        'validation_exit_code': report.get('validation', {}).get('exit_code'),
    }, indent=2, ensure_ascii=False))
    raise SystemExit(1 if failed_builds else 0)


if __name__ == '__main__':
    main()
