#!/usr/bin/env python3
"""传感器唯一数据源：把分支、家族、变体、核验库合成为可构建的数据结构。

任何构建器（清单、科技树、兼容矩阵、3D 资产）都必须通过本模块取数，
不得自行编造传感器、层级或兼容关系。
"""
from __future__ import annotations

from pathlib import Path

from sensor_common import (
    CONFIDENCE_LEVELS,
    SOCKETS,
    load_research_index,
    load_submarines,
    save_json,
)
from sensor_dataset_branches import BRANCH_BY_ID, BRANCHES, TIER_LADDER
from sensor_dataset_families import (
    FAMILY_ALIASES,
    GAMEPLAY_FAMILIES,
    GAMEPLAY_FAMILY_BY_BRANCH,
    GAMEPLAY_ID_PREFIX,
    REAL_FAMILIES,
    REAL_VARIANTS,
)


def gameplay_sensor_id(branch_id: str, tier: int) -> str:
    return f'{GAMEPLAY_ID_PREFIX[branch_id]}_T{tier}'


def gameplay_variant(branch: dict, tier: dict) -> dict:
    branch_id = branch['branch_id']
    return {
        'sensor_id': gameplay_sensor_id(branch_id, tier['tier']),
        'name': tier['name'],
        'family': GAMEPLAY_FAMILY_BY_BRANCH[branch_id],
        'variant': f'T{tier["tier"]}',
        'country': 'GENERIC',
        'branch': branch_id,
        'branch_tier': tier['tier'],
        'category': branch['category_label'],
        'sub_category': branch['sub_categories'][0],
        'era': 'GAME_TREE',
        'status': 'GAMEPLAY',
        'confidence': 'GAMEPLAY',
        'verification': 'gameplay-only',
        'compatible_submarines': [],
        'mount_type': 'Game ship-set mount',
        'socket': branch['sockets'][0] if branch['sockets'] else '',
        'notes': '游戏科技树占位条目，不对应任何现实型号。',
        'references': [],
    }


def normalise_real_variant(raw: dict) -> dict:
    variant = dict(raw)
    variant.setdefault('confidence', 'UNKNOWN')
    variant.setdefault('verification', 'pending-research')
    variant.setdefault('references', [])
    variant['branch_tier'] = int(variant.get('branch_tier', 1))
    variant['status'] = variant.get('status', 'UNKNOWN')
    if not variant.get('socket') or variant.get('socket') == 'NONE':
        branch = BRANCH_BY_ID[variant['branch']]
        variant['socket'] = branch['sockets'][0] if branch['sockets'] else ''
    return variant


def apply_research(variants: list[dict], research: dict[str, dict]) -> list[dict]:
    """用核验库覆盖现实候选条目的置信度与来源。

    核验不到的现实候选一律降级为 UNKNOWN，绝不允许凭推测写 CONFIRMED。
    """
    merged: list[dict] = []
    for variant in variants:
        if variant['verification'] == 'gameplay-only':
            merged.append(variant)
            continue
        hit = research.get(variant['sensor_id'])
        entry = dict(variant)
        if hit:
            confidence = hit.get('confidence', 'UNKNOWN')
            if confidence not in CONFIDENCE_LEVELS:
                confidence = 'UNKNOWN'
            entry['confidence'] = confidence
            entry['verification'] = 'research-verified' if confidence == 'CONFIRMED' else 'research-reviewed'
            entry['references'] = [ref for ref in hit.get('references', []) if ref.get('url')]
            if hit.get('status'):
                entry['status'] = hit['status']
            if hit.get('notes'):
                entry['research_notes'] = hit['notes']
            if hit.get('name') and confidence != 'UNKNOWN':
                entry['name'] = hit['name']
            researched_subs = hit.get('compatible_submarines')
            if researched_subs:
                entry['compatible_submarines'] = sorted(set(researched_subs))
        else:
            entry['confidence'] = 'UNKNOWN'
            entry['verification'] = 'unverified'
            entry['references'] = list(entry.get('references', []))
        merged.append(entry)
    return merged


def build_variants(research: dict[str, dict] | None = None) -> list[dict]:
    """每个分支每个层级都有一个游戏科技树节点，另附核验过的现实系统。

    两类条目永远并存且互相可区分：`GEN_*` 是游戏层级件，现实候选是为了把
    公开可查的型号挂到对应层级上，不会被冒充为层级本身。
    """
    research = research if research is not None else load_research_index()
    real = apply_research([normalise_real_variant(raw) for raw in REAL_VARIANTS], research)
    gameplay = [
        gameplay_variant(branch, tier)
        for branch in BRANCHES
        for tier in branch['tiers']
    ]
    return real + gameplay


def build_families(variants: list[dict]) -> list[dict]:
    families: dict[str, dict] = {}
    for raw in REAL_FAMILIES:
        families[raw['family_id']] = {
            'family_id': raw['family_id'],
            'label': raw['label'],
            'country': raw['country'],
            'kind': 'REAL_PUBLIC',
            'variants': [],
            'notes': raw['notes'],
        }
    for raw in GAMEPLAY_FAMILIES:
        families[raw['family_id']] = {
            'family_id': raw['family_id'],
            'label': raw['label'],
            'country': raw['country'],
            'kind': 'GAMEPLAY',
            'variants': [],
            'notes': '纯游戏科技树家族，不对应现实型号。',
        }
    for raw_id, label in FAMILY_ALIASES.items():
        families.setdefault(raw_id, {
            'family_id': raw_id,
            'label': label,
            'country': 'UNKNOWN',
            'kind': 'UNKNOWN',
            'variants': [],
            'notes': '公开资料未给出型号，族系留空。',
        })
    for variant in variants:
        family = families.setdefault(variant['family'], {
            'family_id': variant['family'],
            'label': variant['family'],
            'country': variant['country'],
            'kind': 'GAMEPLAY' if variant['verification'] == 'gameplay-only' else 'REAL_PUBLIC',
            'variants': [],
            'notes': '',
        })
        family['variants'].append({
            'sensor_id': variant['sensor_id'],
            'variant': variant['variant'],
            'name': variant['name'],
            'confidence': variant['confidence'],
            'branch': variant['branch'],
            'branch_tier': variant['branch_tier'],
        })
    return [families[key] for key in sorted(families)]


def _variant_summary(variant: dict) -> dict:
    return {
        'sensor_id': variant['sensor_id'],
        'name': variant['name'],
        'family': variant['family'],
        'country': variant['country'],
        'confidence': variant['confidence'],
        'status': variant['status'],
        'asset_status': variant.get('asset_status', 'DATABASE_ONLY'),
    }


def build_tree(variants: list[dict], asset_ids: frozenset[str] = frozenset()) -> dict:
    """§25：每个分支 T1–T10。

    每个层级节点由游戏科技树件（`GEN_*`）定义，现实候选系统作为
    `real_systems` 挂在同一层级上，二者绝不混为一谈（§29）。
    """
    by_branch: dict[str, list[dict]] = {branch['branch_id']: [] for branch in BRANCHES}
    for variant in variants:
        by_branch[variant['branch']].append(variant)

    branches = []
    for branch in BRANCHES:
        tiers = []
        for tier in branch['tiers']:
            slot = [v for v in by_branch[branch['branch_id']] if v['branch_tier'] == tier['tier']]
            node = next((v for v in slot if v['verification'] == 'gameplay-only'), None)
            real_systems = [
                _variant_summary({**v, 'asset_status': 'COMPLETE' if v['sensor_id'] in asset_ids else 'DATABASE_ONLY'})
                for v in slot if v['verification'] != 'gameplay-only'
            ]
            tiers.append({
                'tier': f'T{tier["tier"]}',
                'tier_index': tier['tier'],
                'name': tier['name'],
                'name_zh': tier['name_zh'],
                'source': tier['source'],
                'note': tier.get('note', ''),
                'sensor_id': node['sensor_id'] if node else None,
                'gameplay_node': _variant_summary({
                    **node,
                    'asset_status': 'COMPLETE' if node and node['sensor_id'] in asset_ids else 'DATABASE_ONLY',
                }) if node else None,
                'real_systems': real_systems,
            })
        branches.append({
            'branch_id': branch['branch_id'],
            'label_zh': branch['label_zh'],
            'label_en': branch['label_en'],
            'description_zh': branch['description_zh'],
            'sockets': list(branch['sockets']),
            'sub_categories': list(branch['sub_categories']),
            'tiers': tiers,
        })
    return {'tier_ladder': [dict(entry) for entry in TIER_LADDER], 'branches': branches}


def _select_variant(branch_variants: list[dict], submarine: dict) -> tuple[dict | None, list[dict]]:
    """为一条 (潜艇, 分支) 记录选出装载传感器，并给出全部候选判定。"""
    country = submarine['country']
    asset_id = submarine['asset_id']
    hull_tier = int(submarine.get('tier') or 1)
    scored: list[tuple[int, dict, str]] = []
    for variant in branch_variants:
        if variant['verification'] == 'gameplay-only':
            status = 'GAMEPLAY'
            # 同代默认装配：潜艇代际与层级节点同号时优先，避免老艇出现在 T10 节点上。
            score = 50 - abs(hull_tier - variant['branch_tier'])
        elif variant['country'] != country:
            status = 'INCOMPATIBLE'
            score = 0
        elif asset_id in variant.get('compatible_submarines', []):
            status = 'CONFIRMED' if variant['confidence'] == 'CONFIRMED' else 'PROBABLE'
            # 同一分支上优先选平台专属条目：CONFIRMED 高于 PROBABLE，
            # 适用艇数越少越专属，其次才比较层级。
            base = 2000 if status == 'CONFIRMED' else 1000
            specificity = 100 - len(variant.get('compatible_submarines', []))
            score = base + specificity + variant['branch_tier']
        else:
            status = 'UNKNOWN'
            score = 1
        scored.append((score, variant, status))
    scored.sort(key=lambda item: (-item[0], item[1]['sensor_id']))
    selected = next((item for item in scored if item[2] in ('CONFIRMED', 'PROBABLE', 'GAMEPLAY')), None)
    selected_id = selected[1]['sensor_id'] if selected else None
    # 候选表只列现实系统与最终选中的层级件，避免 130 个游戏节点淹没判断依据。
    candidates = [
        {
            'sensor_id': variant['sensor_id'],
            'name': variant['name'],
            'country': variant['country'],
            'confidence': variant['confidence'],
            'status': status,
        }
        for _, variant, status in scored
        if variant['verification'] != 'gameplay-only' or variant['sensor_id'] == selected_id
    ]
    return (selected[1] if selected else None), candidates


def build_compatibility(variants: list[dict], submarines: list[dict] | None = None) -> dict:
    submarines = submarines or load_submarines()
    by_branch: dict[str, list[dict]] = {branch['branch_id']: [] for branch in BRANCHES}
    for variant in variants:
        by_branch[variant['branch']].append(variant)

    records = []
    for submarine in submarines:
        for branch in BRANCHES:
            branch_id = branch['branch_id']
            selected, candidates = _select_variant(by_branch[branch_id], submarine)
            records.append({
                'submarine_id': submarine['asset_id'],
                'country': submarine['country'],
                'type': submarine['type'],
                'branch': branch_id,
                'branch_label_zh': branch['label_zh'],
                'sensor_id': selected['sensor_id'] if selected else None,
                'sensor_name': selected['name'] if selected else None,
                'status': next(
                    (c['status'] for c in candidates if selected and c['sensor_id'] == selected['sensor_id']),
                    'UNKNOWN',
                ),
                'socket': (selected or {}).get('socket', ''),
                'candidates': candidates,
            })
    summary: dict[str, int] = {level: 0 for level in ('CONFIRMED', 'PROBABLE', 'GAMEPLAY', 'UNKNOWN', 'INCOMPATIBLE')}
    candidate_summary: dict[str, int] = dict(summary)
    for record in records:
        summary[record['status']] = summary.get(record['status'], 0) + 1
        for candidate in record['candidates']:
            candidate_summary[candidate['status']] = candidate_summary.get(candidate['status'], 0) + 1
    return {
        'levels': ['CONFIRMED', 'PROBABLE', 'GAMEPLAY', 'UNKNOWN', 'INCOMPATIBLE'],
        'policy': (
            'CONFIRMED 仅用于公开来源核验过的平台—传感器关系；'
            '现实系统未核验到平台关系时为 UNKNOWN，跨国现实系统为 INCOMPATIBLE；'
            'GAMEPLAY 表示游戏科技树默认装配，按「同代潜艇装配同代层级节点」的规则选取，'
            '不代表任何现实断言。'
        ),
        'summary': summary,
        'candidate_summary': candidate_summary,
        'records': records,
    }


def core_asset_ids() -> frozenset[str]:
    from sensor_dataset_assets import CORE_ASSETS
    return frozenset(asset['sensor_id'] for asset in CORE_ASSETS)


def dataset(include_research: bool = True) -> dict:
    research = load_research_index() if include_research else {}
    variants = build_variants(research)
    asset_ids = core_asset_ids()
    for variant in variants:
        variant['asset_status'] = 'PLANNED' if variant['sensor_id'] in asset_ids else 'DATABASE_ONLY'
    submarines = load_submarines()
    tree = build_tree(variants, asset_ids)
    compatibility = build_compatibility(variants, submarines)
    families = build_families(variants)
    return {
        'variants': variants,
        'families': families,
        'tree': tree,
        'compatibility': compatibility,
        'submarines': submarines,
        'sockets': list(SOCKETS),
        'research_index': research,
    }


def write_debug_dump(path: Path) -> None:
    save_json(path, dataset())
