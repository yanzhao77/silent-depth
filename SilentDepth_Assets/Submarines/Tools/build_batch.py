"""Builds every remaining hull whose parameters can be derived from data.

    blender --background --python Tools/build_batch.py -- [--no-preview] \
        [--only=ID,ID] [--limit=N]

One Blender session builds the whole batch: ``pipeline.run`` resets the scene
itself, so hulls do not leak into each other. A hull that fails its geometry
assertions is reported and the run continues, because one bad parameter set
must not hide the other thirty-nine.
"""
from __future__ import annotations

import sys
import traceback
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))

import sd_hull_pipeline as pipeline     # noqa: E402
import sd_reference_params as refparams  # noqa: E402


def argument(name: str) -> str | None:
    prefix = f'--{name}='
    for value in sys.argv:
        if value.startswith(prefix):
            return value[len(prefix):]
    return None


def main() -> int:
    only = argument('only')
    limit = argument('limit')
    params, skipped = refparams.all_params(include_built='--include-built' in sys.argv)
    if only:
        wanted = {item.strip() for item in only.split(',')}
        params = [item for item in params if item['id'] in wanted]
    if limit:
        params = params[:int(limit)]

    print(f'BATCH: {len(params)} hull(s) to build, {len(skipped)} skipped')
    for asset_id, reason in skipped:
        print(f'SKIP {asset_id}: {reason}')

    built, failed = [], []
    for item in params:
        try:
            pipeline.run(item)
            built.append(item['id'])
        except Exception:  # noqa: BLE001 - the report must carry on
            failed.append(item['id'])
            print(f'FAILED {item["id"]}')
            traceback.print_exc()
    print(f'BATCH_DONE built={len(built)} failed={len(failed)}')
    if failed:
        print('failed: ' + ', '.join(failed))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
