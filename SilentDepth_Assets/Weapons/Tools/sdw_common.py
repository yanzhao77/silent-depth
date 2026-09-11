#!/usr/bin/env python3
"""Shared helpers for the SILENT DEPTH global submarine weapon asset factory.

The weapon factory is data driven: every artifact under Weapons/ is produced by a
builder in this directory from a single source dataset (weapon_dataset.py). No
builder may invent a weapon, a tier, or a compatibility relation that is not
declared in that dataset.

This module is intentionally dependency free (standard library only) so the
non-Blender builders can run with any local CPython.
"""
from __future__ import annotations

import hashlib
import json
from datetime import date
from pathlib import Path
from typing import Any

# Weapons/ lives beside the existing Submarines/ tree.
WEAPONS_ROOT = Path(__file__).resolve().parents[1]
SILENT_DEPTH_ASSETS_ROOT = WEAPONS_ROOT.parent
SUBMARINE_MANIFEST = SILENT_DEPTH_ASSETS_ROOT / 'Manifest' / 'submarine_manifest.json'
SUBMARINE_DATABASE = SILENT_DEPTH_ASSETS_ROOT / 'Documentation' / 'GLOBAL_SUBMARINE_DATABASE.json'

MANIFEST_DIR = WEAPONS_ROOT / 'Manifest'
TREE_DIR = WEAPONS_ROOT / 'TechnologyTree'
DOC_DIR = WEAPONS_ROOT / 'Documentation'
TEMPLATE_DIR = WEAPONS_ROOT / 'Templates' / 'Weapon'
VALIDATION_DIR = WEAPONS_ROOT / 'Validation'
PREVIEW_DIR = WEAPONS_ROOT / 'Preview'

COUNTRY_DIR = {
    'USA': 'USA',
    'Russia': 'Russia',
    'UK': 'UK',
    'France': 'France',
    'China': 'China',
    'India': 'India',
}

CATEGORY_DIR = {
    'TORP': 'Torpedoes',
    'ASM': 'AntiShipMissiles',
    'LAM': 'LandAttackMissiles',
    'ASW': 'AntiSubmarineMissiles',
    'SLBM': 'BallisticMissiles',
    'STRAT': 'Strategic',
    'MINE': 'Mines',
    'DECOY': 'Decoys',
    'SPECIAL': 'SpecialPayload',
}

CATEGORY_LABEL = {
    'TORP': 'Torpedo',
    'ASM': 'Anti-Ship Missile',
    'LAM': 'Land-Attack Missile',
    'ASW': 'Anti-Submarine Missile',
    'SLBM': 'Ballistic Missile',
    'STRAT': 'Strategic Missile',
    'MINE': 'Mine',
    'DECOY': 'Decoy System',
    'SPECIAL': 'Special Payload',
}

COMPATIBILITY_LEVELS = ('CONFIRMED', 'PROBABLE', 'GAMEPLAY', 'INCOMPATIBLE', 'UNKNOWN')

ASSET_PRIORITIES = ('HIGH', 'MEDIUM', 'LOW', 'DATABASE_ONLY')

PRODUCTION_STATES = (
    'PLANNED', 'RESEARCH', 'REFERENCE', 'BLOCKOUT', 'MODELING', 'DETAILING',
    'TEXTURING', 'LOD', 'COLLISION', 'EXPORT', 'VALIDATING', 'COMPLETE',
    'FAILED', 'BLOCKED',
)

TODAY = date.today().isoformat()


def load_json(path: Path) -> Any:
    return json.loads(Path(path).read_text(encoding='utf-8'))


def save_json(path: Path, data: Any) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')


def save_text(path: Path, text: str) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding='utf-8')


def sha256_file(path: Path) -> str | None:
    path = Path(path)
    if not path.is_file():
        return None
    digest = hashlib.sha256()
    with path.open('rb') as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b''):
            digest.update(chunk)
    return digest.hexdigest()


def fbx_binary_version(path: Path) -> int | None:
    path = Path(path)
    if not path.is_file():
        return None
    head = path.open('rb').read(27)
    if b'Kaydara FBX Binary' not in head:
        return None
    return int.from_bytes(head[23:27], 'little')


def load_submarines() -> list[dict]:
    data = load_json(SUBMARINE_MANIFEST)
    return data['assets']


def weapon_asset_dir(weapon: dict) -> Path:
    """Directory that owns one weapon variant asset."""
    return WEAPONS_ROOT / CATEGORY_DIR[weapon['category']] / weapon['weapon_id']


SLOT_ORDER = ('TORPEDO', 'MISSILE', 'VLS', 'SLBM', 'SPECIAL')


def weapon_slot(category: str, launch_methods) -> str | None:
    """发射接口 -> 装备槽位。无法由潜艇发射的武器返回 None。"""
    launch = set(launch_methods or ())
    if 'SLBM_TUBE' in launch:
        return 'SLBM'
    if 'VLS' in launch:
        return 'VLS'
    if 'SWIM_OUT' in launch or 'SWIM_OUT_DOCK' in launch:
        return 'SPECIAL'
    if 'TORPEDO_TUBE' in launch:
        return 'MISSILE' if category in ('ASM', 'LAM', 'ASW') else 'TORPEDO'
    return None


def iter_families(dataset: dict):
    for family in dataset['families']:
        yield family


def iter_variants(dataset: dict):
    for family in dataset['families']:
        for variant in family['variants']:
            yield family, variant


def csv_escape(value: Any) -> str:
    text = '' if value is None else str(value)
    if any(ch in text for ch in ',"\n\r'):
        return '"' + text.replace('"', '""') + '"'
    return text


def write_csv(path: Path, header: list[str], rows: list[list[Any]]) -> None:
    lines = [','.join(csv_escape(cell) for cell in header)]
    lines.extend(','.join(csv_escape(cell) for cell in row) for row in rows)
    save_text(path, '\n'.join(lines) + '\n')
