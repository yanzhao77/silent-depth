#!/usr/bin/env python3
"""传感器资产工厂主线（§33 流程）。

顺序：
    1. create_sensor_asset.py      建立资产骨架与文本产物
    2. build_sensor_assets.py      在 Blender 内构建 MASTER / LOD / 碰撞 / 预览
    3. sensor_validator.py         验证资产包
    4. build_sensor_manifest.py    重建清单、科技树、兼容矩阵与报告

用法：
    python Tools/run_sensor_factory.py --all
    python Tools/run_sensor_factory.py --sensor-id US_SONAR_LAB --skip-blender
"""
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

TOOLS_DIR = Path(__file__).resolve().parent
SENSORS_ROOT = TOOLS_DIR.parent
sys.path.insert(0, str(TOOLS_DIR))

from sensor_dataset_assets import CORE_ASSETS  # noqa: E402

BLENDER_CANDIDATES = (
    os.environ.get('BLENDER_EXE'),
    r'C:\tools\Blender Foundation\Blender 5.2\blender.exe',
    r'C:\Program Files\Blender Foundation\Blender 4.2\blender.exe',
    shutil.which('blender'),
)


def find_blender() -> str | None:
    for candidate in BLENDER_CANDIDATES:
        if candidate and Path(candidate).is_file():
            return str(candidate)
    return None


def run(command: list[str]) -> None:
    printable = ' '.join(command)
    print(f'[factory] {printable}')
    completed = subprocess.run(command, cwd=str(SENSORS_ROOT), check=False)
    if completed.returncode != 0:
        raise SystemExit(f'命令失败（{completed.returncode}）：{printable}')


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--sensor-id', action='append', default=[])
    parser.add_argument('--all', action='store_true')
    parser.add_argument('--skip-blender', action='store_true')
    parser.add_argument('--skip-previews', action='store_true')
    args = parser.parse_args()

    if args.sensor_id:
        selection = []
        for sensor_id in args.sensor_id:
            selection += ['--sensor-id', sensor_id]
    elif args.all:
        selection = ['--all']
    else:
        raise SystemExit('请指定 --all 或 --sensor-id')

    python = sys.executable
    tools = str(TOOLS_DIR)
    run([python, f'{tools}\\create_sensor_asset.py', *selection])

    blender = find_blender()
    if args.skip_blender:
        print('[factory] 跳过 Blender 构建（--skip-blender）')
    elif blender is None:
        print('[factory] 未找到 Blender 可执行文件；Blend/FBX/预览将被标记为未生成')
    else:
        command = [blender, '--background', '--factory-startup', '--python',
                   f'{tools}\\build_sensor_assets.py', '--', *selection]
        if args.skip_previews:
            command.append('--skip-previews')
        run(command)

    run([python, f'{tools}\\build_sensor_asset_manifest.py', *selection])

    validate = [python, f'{tools}\\sensor_validator.py', *selection, '--write-report']
    completed = subprocess.run(validate, cwd=str(SENSORS_ROOT), check=False)
    if completed.returncode != 0:
        print('[factory] 验证存在未通过项，继续生成清单以便查看证据')

    run([python, f'{tools}\\build_sensor_manifest.py', '--print-summary'])
    print(f'[factory] 完成：核心资产 {len(CORE_ASSETS)} 件')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
