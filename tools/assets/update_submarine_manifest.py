"""Registers built submarine assets in the asset-library manifest.

    python tools/assets/update_submarine_manifest.py [--dry-run] [ASSET_ID ...]

The manifest (SilentDepth_Assets/Manifest/submarine_manifest.json) is the
source of truth the tech-tree sync copies into the project, so a hull that is
not registered there is invisible to the runtime. This tool fills an entry from
what a hull's build actually produced — its SPEC.json, its files and their
hashes — instead of hand-editing forty fields.

A hull is only promoted out of `PLANNED` when its master, all four LODs, the
collision FBX, a validation file and a spec exist. Anything less stays PLANNED
with a note saying what is missing, because a half-built hull must not look
finished to the loader.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
ASSETS = REPO / 'SilentDepth_Assets'
MANIFEST = ASSETS / 'Manifest' / 'submarine_manifest.json'


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, 'rb') as handle:
        for block in iter(lambda: handle.read(1 << 20), b''):
            digest.update(block)
    return digest.hexdigest()


def find_hull_root(asset_id: str) -> Path | None:
    for spec in ASSETS.glob(f'Submarines/**/{asset_id}_SPEC.json'):
        return spec.parent.parent
    return None


def build_entry(asset_id: str, existing: dict) -> tuple[dict, list[str]]:
    """Entry for one hull plus the list of missing artifacts."""
    root = find_hull_root(asset_id)
    if root is None:
        missing = ['no Documentation/<id>_SPEC.json: the hull has not been built']
        return existing, missing

    spec_path = root / 'Documentation' / f'{asset_id}_SPEC.json'
    spec = json.loads(spec_path.read_text(encoding='utf-8'))
    relative_root = root.relative_to(ASSETS).as_posix()

    # Only hulls the shared pipeline produced may be re-registered. Akula,
    # Yasen and Typhoon came from hand-built Blender masters: their SPECs carry
    # no material list, and rewriting their paths and hashes from a parametric
    # build would quietly claim those files are something they are not.
    if existing.get('master') and not spec.get('materials'):
        return existing, ['hand-built asset, not registered from the pipeline']

    artifacts = {
        'master': f'Blend/{asset_id}_MASTER.blend',
        'lod0': f'FBX/{asset_id}_LOD0.fbx',
        'lod1': f'FBX/{asset_id}_LOD1.fbx',
        'lod2': f'FBX/{asset_id}_LOD2.fbx',
        'lod3': f'FBX/{asset_id}_LOD3.fbx',
        'collision': f'Collision/{asset_id}_COLLISION.fbx',
        'validation': f'Validation/{asset_id}_VALIDATION.json',
    }
    missing = [name for name, relative in artifacts.items() if not (root / relative).is_file()]
    if missing:
        return existing, [f'{name} is missing' for name in missing]

    sources = sorted(path.relative_to(root).as_posix()
                     for path in (root / 'Source').glob('*.py'))
    previews = sorted(path.relative_to(root).as_posix()
                      for path in (root / 'Preview').glob('*.png'))
    hashes = {relative: sha256(root / relative)
              for relative in list(artifacts.values()) + sources + previews
              if (root / relative).is_file()}

    entry = dict(existing)
    entry.update({
        'asset_id': asset_id,
        'source': f'{relative_root}/{sources[0]}' if sources else '',
        'path_base': 'SilentDepth_Assets',
        'status': spec.get('status', 'VALIDATING'),
        'previews': [f'{relative_root}/{name}' for name in previews],
        'sha256': hashes,
        'limitations': spec.get('limitations', []),
    })
    # A SPEC that predates this pipeline (Akula, Yasen) carries no material or
    # texture list. Those entries keep the names recorded when they were built;
    # replacing them with an empty list would silently lose information.
    if spec.get('materials'):
        entry['materials'] = spec['materials']
    if spec.get('textures'):
        entry['textures'] = [f'{relative_root}/{name}' for name in spec['textures']]
    else:
        entry['textures'] = [f'{relative_root}/{name}'
                             for name in sorted(path.relative_to(root).as_posix()
                                                for path in (root / 'Textures').glob('*.png'))
                             ] or entry.get('textures', [])
    for name, relative in artifacts.items():
        entry[name] = f'{relative_root}/{relative}'
    return entry, []


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('asset_ids', nargs='*', help='defaults to every hull that has a SPEC')
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()

    manifest = json.loads(MANIFEST.read_text(encoding='utf-8'))
    entries = {entry['asset_id']: entry for entry in manifest['assets']}

    targets = args.asset_ids or sorted(
        spec.name[: -len('_SPEC.json')]
        for spec in ASSETS.glob('Submarines/**/*_SPEC.json'))

    changed, skipped = [], []
    for asset_id in targets:
        if asset_id not in entries:
            print(f'{asset_id}: not in the manifest, skipped')
            continue
        updated, missing = build_entry(asset_id, entries[asset_id])
        if missing:
            skipped.append((asset_id, missing))
            continue
        if updated != entries[asset_id]:
            changed.append(asset_id)
        entries[asset_id] = updated

    manifest['assets'] = [entries[entry['asset_id']] for entry in manifest['assets']]
    if not args.dry_run and changed:
        MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n',
                            encoding='utf-8')

    print(f'updated: {", ".join(changed) if changed else "nothing"}')
    for asset_id, missing in skipped:
        print(f'{asset_id}: still PLANNED ({"; ".join(missing)})')
    return 0


if __name__ == '__main__':
    sys.exit(main())
