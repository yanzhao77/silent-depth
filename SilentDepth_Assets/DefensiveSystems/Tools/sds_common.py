#!/usr/bin/env python3
"""Shared helpers for the SILENT DEPTH global submarine defensive system factory.

The defensive factory is data driven: every artifact under DefensiveSystems/ is
produced by a builder in this directory from the single source dataset
(``sds_dataset.py``). No builder may invent a defensive system, a tier, a socket
or a compatibility relation that is not declared in that dataset.

This module is intentionally dependency free (standard library only) so the
non-Blender builders run with any local CPython.
"""
from __future__ import annotations

import hashlib
import json
from datetime import date
from pathlib import Path
from typing import Any

# DefensiveSystems/ lives beside the existing Submarines/ and Weapons/ trees.
DEFENSIVE_ROOT = Path(__file__).resolve().parents[1]
SILENT_DEPTH_ASSETS_ROOT = DEFENSIVE_ROOT.parent
SUBMARINE_MANIFEST = SILENT_DEPTH_ASSETS_ROOT / 'Manifest' / 'submarine_manifest.json'
SUBMARINE_DATABASE = SILENT_DEPTH_ASSETS_ROOT / 'Documentation' / 'GLOBAL_SUBMARINE_DATABASE.json'
SUBMARINE_TECH_TREE = SILENT_DEPTH_ASSETS_ROOT / 'TechnologyTree' / 'technology_tree.json'

MANIFEST_DIR = DEFENSIVE_ROOT / 'Manifest'
TREE_DIR = DEFENSIVE_ROOT / 'TechnologyTree'
DOC_DIR = DEFENSIVE_ROOT / 'Documentation'
VALIDATION_DIR = DEFENSIVE_ROOT / 'Validation'
MATERIALS_DIR = DEFENSIVE_ROOT / 'Materials'
TEMPLATE_DIR = DEFENSIVE_ROOT / 'Templates' / 'DefensiveSystem'

CATEGORY_DIR = {
    'ESM': 'ESM',
    'THREAT_WARNING': 'ThreatWarning',
    'ACOUSTIC_COUNTERMEASURE': 'AcousticCountermeasure',
    'DECOY': 'Decoys',
    'NOISE_MAKER': 'NoiseMakers',
    'TORPEDO_DEFENSE': 'TorpedoDefense',
    'LAUNCHER': 'Launchers',
    'DEFENSIVE_CONTROL': 'Control',
    'ANTENNA': 'Antennas',
    'CONTROL': 'Control',
    'INTEGRATED_DEFENSE': 'Control',
}

COUNTRY_DIR = {
    'USA': 'USA',
    'Russia': 'Russia',
    'UK': 'UK',
    'France': 'France',
    'China': 'China',
    'India': 'India',
}

COUNTRY_CODE = {
    'USA': 'US',
    'Russia': 'RU',
    'UK': 'UK',
    'France': 'FR',
    'China': 'CN',
    'India': 'IN',
}

COUNTRY_LABEL_ZH = {
    'USA': '美国',
    'Russia': '俄罗斯/苏联',
    'UK': '英国',
    'France': '法国',
    'China': '中国',
    'India': '印度',
}

COMPATIBILITY_LEVELS = ('CONFIRMED', 'PROBABLE', 'GAMEPLAY', 'UNKNOWN', 'INCOMPATIBLE')

# Verification status of a *public-source claim* attached to a variant or a
# compatibility row. GAMEPLAY means the identity is a game construction, not a
# claim about real hardware.
VERIFICATION_LEVELS = ('CONFIRMED', 'PROBABLE', 'GAMEPLAY', 'UNKNOWN', 'DATABASE_ONLY')

ASSET_PRIORITIES = ('HIGH', 'MEDIUM', 'LOW', 'DATABASE_ONLY')

PRODUCTION_STATES = (
    'PLANNED', 'RESEARCH', 'REFERENCE', 'BLOCKOUT', 'MODELING', 'DETAILING',
    'TEXTURING', 'LOD', 'COLLISION', 'EXPORT', 'VALIDATING', 'COMPLETE',
    'FAILED', 'BLOCKED', 'DATABASE_ONLY',
)

# Unified mount point vocabulary. Every defensive asset that is meant to be
# attached to a hull uses exactly one of these names.
SOCKETS = {
    'SOCKET_EW_MAST': 'ESM / electronic warfare mast seat',
    'SOCKET_EW_ANTENNA': 'ESM antenna or antenna array seat',
    'SOCKET_DECOY_LAUNCHER_01': 'forward decoy launcher seat',
    'SOCKET_DECOY_LAUNCHER_02': 'aft decoy launcher seat',
    'SOCKET_COUNTERMEASURE_01': 'forward countermeasure tube seat',
    'SOCKET_COUNTERMEASURE_02': 'aft countermeasure tube seat',
}

SHARED_MATERIALS = (
    'Metal', 'DarkMetal', 'Rubber', 'Composite', 'Paint', 'Glass', 'AntennaMaterial',
)

# Single source of truth for the shared material library. Blender uses these as
# Principled BSDF inputs; UE rebuilds them as material instances.
MATERIAL_LIBRARY = {
    'Metal': {'base_color': (0.28, 0.30, 0.32), 'metallic': 0.85, 'roughness': 0.38,
              'usage_zh': '通用金属：桅杆本体、法兰、支架'},
    'DarkMetal': {'base_color': (0.06, 0.07, 0.08), 'metallic': 0.75, 'roughness': 0.52,
                  'usage_zh': '深色金属：天线罩、观察窗框、接口面板'},
    'Rubber': {'base_color': (0.02, 0.02, 0.025), 'metallic': 0.0, 'roughness': 0.86,
               'usage_zh': '橡胶：密封环、减振垫、导轨护条'},
    'Composite': {'base_color': (0.14, 0.15, 0.16), 'metallic': 0.1, 'roughness': 0.62,
                  'usage_zh': '复合材料：共形阵盖板、诱饵弹体、整流罩'},
    'Paint': {'base_color': (0.10, 0.12, 0.13), 'metallic': 0.25, 'roughness': 0.55,
              'usage_zh': '涂装表面：发射器外壳、控制台外壳'},
    'Glass': {'base_color': (0.08, 0.10, 0.12), 'metallic': 0.0, 'roughness': 0.12,
              'usage_zh': '玻璃：显控屏、换能器窗口'},
    'AntennaMaterial': {'base_color': (0.20, 0.21, 0.22), 'metallic': 0.35, 'roughness': 0.45,
                        'usage_zh': '天线介质材料：阵面、刀形天线'},
}

FBX_BINARY_VERSION = 7400
FBX_LABEL = 'FBX 2018 compatible'
UE_TARGET = 'UE4.27'

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


def sha256_file(path: Path | str | None) -> str | None:
    if not path:
        return None
    path = Path(path)
    if not path.is_file():
        return None
    digest = hashlib.sha256()
    with path.open('rb') as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b''):
            digest.update(chunk)
    return digest.hexdigest()


def fbx_binary_version(path: Path | str | None) -> int | None:
    if not path:
        return None
    path = Path(path)
    if not path.is_file():
        return None
    with path.open('rb') as handle:
        head = handle.read(27)
    if b'Kaydara FBX Binary' not in head:
        return None
    return int.from_bytes(head[23:27], 'little')


def load_submarines() -> list[dict]:
    """Submarine platform records inherited from the platform technology tree."""
    return load_json(SUBMARINE_MANIFEST)['assets']


def load_submarine_database() -> list[dict]:
    return load_json(SUBMARINE_DATABASE)['entries']


def defensive_asset_dir(asset: dict) -> Path:
    """Directory that owns one defensive 3D asset."""
    return DEFENSIVE_ROOT / CATEGORY_DIR[asset['category']] / asset['asset_id']


def variant_id(family_id: str, country: str) -> str:
    return f'{family_id}-{COUNTRY_CODE[country]}'


def csv_escape(value: Any) -> str:
    text = '' if value is None else str(value)
    if any(ch in text for ch in ',"\n\r'):
        return '"' + text.replace('"', '""') + '"'
    return text


def write_csv(path: Path, header: list[str], rows: list[list[Any]]) -> None:
    lines = [','.join(csv_escape(cell) for cell in header)]
    lines.extend(','.join(csv_escape(cell) for cell in row) for row in rows)
    save_text(path, '\n'.join(lines) + '\n')
