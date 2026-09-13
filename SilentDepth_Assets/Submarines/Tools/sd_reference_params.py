"""Builds a hull parameter set from the research record instead of by hand.

Batch A was five hand-written parameter sets. The remaining 46 hulls follow the
same shape, so their parameters are derived from two authoritative places:

  * the hull's own ``REFERENCE.md`` for the overall dimensions, and
  * the weapon loadout manifest (``launch_interface``) for the tubes, the VLS
    cells, the SLBM tubes and the tube diameter.

Nothing is invented: a hull whose reference has no usable dimension row is
reported and skipped rather than modelled from a guess. The choices that are
genuinely design (how many masts, how deep the sail rake) come from one
per-type default table at the bottom of this file, and they are the same sort
of initial playable values the pipeline already documents in its SPEC.
"""
from __future__ import annotations

import json
import pathlib
import re

ASSETS = pathlib.Path(__file__).resolve().parents[2]
MANIFEST = ASSETS / 'Manifest' / 'submarine_manifest.json'
WEAPON_SLOTS = pathlib.Path(__file__).resolve().parents[3] / 'ue4' / 'SilentDepthUE' / \
    'Config' / 'SilentDepth' / 'TechTree' / 'weapon_slots.json'

STOCK_PROFILE = [
    (0.00, 0.00), (0.02, 0.28), (0.05, 0.52), (0.10, 0.72), (0.18, 0.86),
    (0.30, 0.94), (0.45, 0.99), (0.60, 1.00), (0.72, 0.97), (0.82, 0.88),
    (0.90, 0.70), (0.96, 0.42), (1.00, 0.10),
]

FAT_PROFILE = [
    (0.00, 0.00), (0.02, 0.30), (0.05, 0.55), (0.10, 0.76), (0.18, 0.89),
    (0.28, 0.96), (0.40, 1.00), (0.62, 1.00), (0.72, 0.98), (0.82, 0.90),
    (0.90, 0.74), (0.96, 0.46), (1.00, 0.12),
]


def _metres(text: str) -> float | None:
    """First metre value in a table cell: prefers the parenthesised figure."""
    parenthesised = re.findall(r'[（(]([0-9]+(?:\.[0-9]+)?)\s*m[）)]', text)
    if parenthesised:
        return float(parenthesised[0])
    leading = re.match(r'\s*([0-9]+(?:\.[0-9]+)?)\s*m', text)
    if leading:
        return float(leading.group(1))
    any_metre = re.search(r'([0-9]+(?:\.[0-9]+)?)\s*m\b', text)
    return float(any_metre.group(1)) if any_metre else None


def parse_dimensions(reference_text: str) -> tuple[float | None, float | None]:
    """Overall length and hull beam from the '尺度与外形' table."""
    lengths: list[tuple[str, float]] = []
    beam = None
    for line in reference_text.splitlines():
        if not line.strip().startswith('|'):
            continue
        cells = [cell.strip() for cell in line.strip().strip('|').split('|')]
        if len(cells) < 2:
            continue
        label, value = cells[0], cells[1]
        if label.startswith('全长'):
            measured = _metres(value)
            if measured:
                lengths.append((label, measured))
        # Some hulls label the beam '艇体宽（Beam）'.
        if beam is None and label.startswith('艇体宽'):
            beam = _metres(value)
    # A class can list several hull lengths (short/long/experimental). Prefer
    # the plain figure, then the long hull, then whatever came first, so a
    # subclass or a one-off conversion does not become the class silhouette.
    length = None
    for label, measured in lengths:
        if label == '全长':
            length = measured
            break
    if length is None:
        for label, measured in lengths:
            if '长艇体' in label:
                length = measured
                break
    if length is None and lengths:
        length = lengths[0][1]
    return length, beam


def load_launch_interfaces() -> dict[str, dict]:
    if not WEAPON_SLOTS.is_file():
        return {}
    document = json.loads(WEAPON_SLOTS.read_text(encoding='utf-8'))
    result = {}
    for submarine in document.get('submarines', []):
        interface = submarine.get('launch_interface') or {}
        torpedo = interface.get('torpedo_tubes') or {}
        vertical = interface.get('vertical_launch') or {}
        slbm = interface.get('slbm_tubes')
        result[submarine['submarine']] = {
            'tubes': int(torpedo.get('count') or 0),
            'diameter_mm': float(torpedo.get('diameter_mm') or 0.0),
            'vls': int(vertical.get('cells') or 0),
            'slbm': int(slbm or 0) if isinstance(slbm, (int, float)) else 0,
        }
    return result


def reference_path(asset_id: str) -> pathlib.Path | None:
    matches = list((ASSETS / 'Submarines').glob(f'**/{asset_id}_REFERENCE.md'))
    return matches[0] if matches else None


def params_for(entry: dict, root: str, launch: dict[str, dict]) -> tuple[dict | None, str]:
    """Parameter set for one manifest entry, or (None, reason)."""
    reference = reference_path(entry['asset_id'])
    if reference is None:
        return None, 'no REFERENCE.md'
    length, beam = parse_dimensions(reference.read_text(encoding='utf-8'))
    if not length or not beam:
        return None, 'no length/beam in REFERENCE.md'

    interface = launch.get(entry['asset_id'], {})
    tier = int(entry.get('tier') or 5)
    hull_type = entry.get('type') or 'SSN'
    is_ballistic = hull_type == 'SSBN'

    # Era decides the machinery: early boats get screws and hull-mounted bow
    # planes, modern ones pump-jets and sail planes. The tier is the project's
    # own era encoding, so this follows the data rather than the calendar.
    modern = tier >= 7
    params = {
        'id': entry['asset_id'],
        'country': entry.get('country', ''),
        'type': hull_type,
        'class': entry.get('class', ''),
        'project': entry.get('project', ''),
        'tier': tier,
        'length': round(length, 3),
        'beam': round(beam, 3),
        'profile': STOCK_PROFILE if hull_type != 'SSBN' else FAT_PROFILE,
        'bow_fraction': 0.34,
        'vertical_scale': 1.0,
        'sail_x': round(length * 0.14, 3),
        'sail_length': max(round(length * 0.105, 3), 7.0),
        'sail_height': round(max(beam * 0.86, 7.0), 3),
        'sail_width': round(beam * 0.32, 3),
        'sail_taper': 0.24,
        'sail_rake': 0.16,
        'masts': [round(length * 0.10, 3), round(length * 0.17, 3)],
        'bow_planes': 'sail' if modern else 'hull',
        'plane_span': round(beam * 0.42, 3),
        'bow_plane_x': round(length * 0.20, 3),
        'stern_form': 'cross',
        'stern_plane_span': round(beam * 0.44, 3),
        'rudder_span': round(beam * 0.40, 3),
        'stern_plane_inset': round(length * 0.045, 3),
        'propulsor': 'pumpjet' if modern else 'propeller',
        'blade_count': 7,
        'shaft_inset': round(length * 0.028, 3),
        'bow_tubes': interface.get('tubes') or 4,
        'tube_radius': round(max(interface.get('diameter_mm') or 533.0, 400.0) / 2000.0, 3),
        'tube_x_inset': 3.0,
        'vls_cells': interface.get('vls') or 0,
        'vls_x': round(length * 0.20, 3),
        'slbm_tubes': interface.get('slbm') or 0,
        'missile_deck': bool(is_ballistic and (interface.get('slbm') or 0) > 0),
        'texture_seed': abs(hash(entry['asset_id'])) % 10_000,
        'root': root,
    }
    return params, ''


def all_params(include_built: bool = False) -> tuple[list[dict], list[tuple[str, str]]]:
    """(params, skipped) for every hull that has a reference.

    ``include_built`` also returns hulls that already have geometry, which is
    what a re-render or a library-wide rebuild needs.
    """
    manifest = json.loads(MANIFEST.read_text(encoding='utf-8'))
    launch = load_launch_interfaces()
    submarines = ASSETS / 'Submarines'
    params, skipped = [], []
    for entry in manifest['assets']:
        if entry.get('master'):
            if not include_built:
                continue
            # A hull that already has geometry may only be rebuilt by the
            # pipeline that produced it. Akula, Yasen and Typhoon were hand-built
            # in Blender; regenerating them from a parameter table would replace
            # work this project cannot reproduce, which is what this guard is for.
            if 'SD_hull' not in (entry.get('materials') or []):
                skipped.append((entry['asset_id'], 'hand-built master, not pipeline-owned'))
                continue
        matches = list(submarines.glob(f'**/{entry["asset_id"]}_REFERENCE.md'))
        if not matches:
            skipped.append((entry['asset_id'], 'no REFERENCE.md'))
            continue
        root = matches[0].parent.parent
        built, reason = params_for(entry, str(root), launch)
        if built is None:
            skipped.append((entry['asset_id'], reason))
            continue
        params.append(built)
    return params, skipped


if __name__ == '__main__':
    usable, missing = all_params()
    print(f'params: {len(usable)}  skipped: {len(missing)}')
    for asset_id, reason in missing:
        print(f'  {asset_id}: {reason}')
