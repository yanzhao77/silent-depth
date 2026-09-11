#!/usr/bin/env python3
"""SILENT DEPTH 潜艇传感器资产工厂共享工具。

传感器工厂与潜艇工厂、武器工厂并列，是第三套独立系统。所有产物必须由
本目录下的构建器从唯一数据源（`sensor_dataset*.py`）生成，任何构建器都不
得自行发明传感器、层级或兼容关系。

本模块只依赖标准库，便于任意本地 CPython 直接运行；Blender 内的构建器
也从这里取路径与常量，不通过本模块导入 bpy。
"""
from __future__ import annotations

import hashlib
import json
from datetime import date
from pathlib import Path
from typing import Any, Iterable, Sequence

SENSORS_ROOT = Path(__file__).resolve().parents[1]
SILENT_DEPTH_ASSETS_ROOT = SENSORS_ROOT.parent

MANIFEST_DIR = SENSORS_ROOT / 'Manifest'
TREE_DIR = SENSORS_ROOT / 'TechnologyTree'
DOC_DIR = SENSORS_ROOT / 'Documentation'
RESEARCH_DIR = DOC_DIR / 'Research'
TEMPLATE_DIR = SENSORS_ROOT / 'Templates' / 'Sensor'
MATERIAL_DIR = SENSORS_ROOT / 'Materials'

SUBMARINE_MANIFEST = SILENT_DEPTH_ASSETS_ROOT / 'Manifest' / 'submarine_manifest.json'
SUBMARINE_DATABASE = SILENT_DEPTH_ASSETS_ROOT / 'Documentation' / 'GLOBAL_SUBMARINE_DATABASE.json'

TODAY = date.today().isoformat()

# 国家目录沿用潜艇工厂的命名。
COUNTRIES = ('USA', 'Russia', 'UK', 'France', 'China', 'India')

COUNTRY_PREFIX = {
    'USA': 'US',
    'Russia': 'RU',
    'UK': 'UK',
    'France': 'FR',
    'China': 'CN',
    'India': 'IN',
    'GENERIC': 'GEN',
}

# 传感器资产按分支归档，目录名与 §22 目录规范一致。
BRANCH_DIR = {
    'PASSIVE': 'Passive',
    'ACTIVE': 'Active',
    'BOW': 'Bow',
    'FLANK': 'Flank',
    'TOWED': 'Towed',
    'HF': 'HighFrequency',
    'MINE': 'MineDetection',
    'NAV': 'Navigation',
    'PHOTONICS': 'Photonics',
    'EOIR': 'EOIR',
    'RADAR': 'Radar',
    'ESM': 'ESM',
    'PROCESSING': 'Processing',
}

# §20 统一的挂载插槽命名。
SOCKETS = (
    'SOCKET_SONAR_BOW',
    'SOCKET_SONAR_FLANK_L',
    'SOCKET_SONAR_FLANK_R',
    'SOCKET_TOWED_ARRAY',
    'SOCKET_PHOTONICS_MAST',
    'SOCKET_PERISCOPE',
    'SOCKET_RADAR',
    'SOCKET_ESM',
)

# §19 兼容性状态。
COMPATIBILITY_LEVELS = ('CONFIRMED', 'PROBABLE', 'GAMEPLAY', 'UNKNOWN', 'INCOMPATIBLE')

# 资料置信度（写入 Manifest 的 confidence 字段）。
CONFIDENCE_LEVELS = ('CONFIRMED', 'PROBABLE', 'GAMEPLAY', 'UNKNOWN')

# §28 允许的来源类型。
SOURCE_TYPES = ('official', 'government', 'manufacturer', 'reference', 'academic')

# 服役/研制状态。
SERVICE_STATUS = (
    'IN_SERVICE',
    'IN_DEVELOPMENT',
    'RETIRED',
    'HISTORICAL',
    'CONCEPT',
    'GAMEPLAY',
    'UNKNOWN',
)

# 资产状态沿用潜艇工厂词汇，并增加 DATABASE_ONLY。
ASSET_STATES = (
    'PLANNED', 'RESEARCH', 'REFERENCE', 'BLOCKOUT', 'MODELING', 'DETAILING',
    'TEXTURING', 'LOD', 'COLLISION', 'EXPORT', 'VALIDATING', 'COMPLETE',
    'FAILED', 'BLOCKED', 'DATABASE_ONLY',
)

REQUIRED_ASSET_DIRS = (
    'Source',
    'Blend',
    'FBX',
    'LOD',
    'Collision',
    'Textures',
    'Preview',
    'Documentation',
    'Validation',
)

REQUIRED_COMPLETE_FILES = (
    'Blend/{id}_MASTER.blend',
    'FBX/{id}_LOD0.fbx',
    'FBX/{id}_LOD1.fbx',
    'FBX/{id}_LOD2.fbx',
    'FBX/{id}_LOD3.fbx',
    'Collision/{id}_COLLISION.fbx',
    'Documentation/{id}_SPEC.json',
    'Documentation/{id}_README.md',
    'Documentation/{id}_MANIFEST.json',
    'Validation/{id}_VALIDATION.json',
)

# §21 预览必须覆盖的视角。
PREVIEW_VIEWS = ('Front', 'Side', 'Top', 'Perspective')


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
    """读取 FBX 二进制头版本号；非二进制 FBX 返回 None。"""
    path = Path(path)
    if not path.is_file():
        return None
    with path.open('rb') as handle:
        head = handle.read(27)
    if len(head) < 27 or b'Kaydara FBX Binary' not in head:
        return None
    return int.from_bytes(head[23:27], 'little')


def load_submarines() -> list[dict]:
    data = load_json(SUBMARINE_MANIFEST)
    return data['assets']


def submarine_ids() -> list[str]:
    return [entry['asset_id'] for entry in load_submarines()]


def csv_escape(value: Any) -> str:
    text = '' if value is None else str(value)
    if any(ch in text for ch in ',"\n\r'):
        return '"' + text.replace('"', '""') + '"'
    return text


def write_csv(path: Path, header: Sequence[str], rows: Iterable[Sequence[Any]]) -> None:
    lines = [','.join(csv_escape(cell) for cell in header)]
    lines.extend(','.join(csv_escape(cell) for cell in row) for row in rows)
    save_text(path, '\n'.join(lines) + '\n')


def research_files() -> list[Path]:
    if not RESEARCH_DIR.is_dir():
        return []
    return sorted(RESEARCH_DIR.glob('*_SENSOR_REFERENCES.json'))


def load_research_index() -> dict[str, dict]:
    """把核验产出的参考库合并成 sensor_id -> entry 的索引。"""
    index: dict[str, dict] = {}
    for path in research_files():
        try:
            data = load_json(path)
        except json.JSONDecodeError:
            continue
        for entry in data.get('entries', []):
            sensor_id = entry.get('sensor_id_candidate')
            if not sensor_id:
                continue
            index[sensor_id] = entry
    return index
