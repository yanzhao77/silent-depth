#!/usr/bin/env python3
"""驱动 FBX 导出后 roundtrip 验证（调用 Blender 导入器实测）。"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from sdw_common import TODAY, save_json, weapon_asset_dir  # noqa: E402
from weapon_dataset import VARIANTS_BY_ID  # noqa: E402

BLENDER_CANDIDATES = (
    Path(r'C:\tools\Blender Foundation\Blender 5.2\blender.exe'),
    Path(r'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe'),
)
JOB_DIR = Path(__file__).resolve().parent / '_jobs'


def main() -> int:
    weapons = [
        {'weapon_id': weapon_id, 'asset_dir': str(weapon_asset_dir(variant))}
        for weapon_id, variant in sorted(VARIANTS_BY_ID.items())
        if (weapon_asset_dir(variant) / 'Blend' / f'{weapon_id}_MASTER.blend').is_file()
    ]
    JOB_DIR.mkdir(parents=True, exist_ok=True)
    job_path = JOB_DIR / 'fbx_roundtrip_jobs.json'
    save_json(job_path, {'generated_at': TODAY, 'weapons': weapons})
    blender = next((path for path in BLENDER_CANDIDATES if path.is_file()), None)
    if blender is None:
        raise SystemExit('未找到 Blender 可执行文件。')
    completed = subprocess.run(
        [str(blender), '--background', '--factory-startup', '--python',
         str(Path(__file__).resolve().parent / 'verify_weapon_fbx_roundtrip.py'),
         '--', '--job', str(job_path)],
        capture_output=True, text=True, timeout=5400,
    )
    (JOB_DIR / 'fbx_roundtrip.log').write_text(
        (completed.stdout or '') + '\n--- STDERR ---\n' + (completed.stderr or ''), encoding='utf-8')
    summary = None
    for line in (completed.stdout or '').splitlines():
        if line.startswith('FBX_ROUNDTRIP_RESULT='):
            summary = json.JSONDecoder().raw_decode(line[len('FBX_ROUNDTRIP_RESULT='):])[0]
    if summary is None:
        print(f'ROUNDTRIP_FAILED returncode={completed.returncode}')
        return 1
    print(json.dumps(summary, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
