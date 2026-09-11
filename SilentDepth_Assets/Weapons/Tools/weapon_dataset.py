#!/usr/bin/env python3
"""Single source of truth for the SILENT DEPTH global submarine weapon library.

Every artifact under Weapons/ (manifest, technology tree, compatibility matrix,
loadout data, production queue, UI data, reports, 3D assets) is derived from this
dataset. A builder must never invent a weapon, a tier, a launch method or a
compatibility relation that is not declared here.

--------------------------------------------------------------------------------
FAMILY SCHEMA
--------------------------------------------------------------------------------
{
  "family_id":     "US_TORP_Mk48",           # stable family key
  "country":       "USA",                    # USA | Russia | UK | France | China | India | ...
  "family_name":   "Mk 48",                  # human readable family name
  "primary_category": "TORP",                # category code of the family's base geometry
  "categories":    ["TORP"],                 # categories this family spans
  "base_geometry": "us_torp_mk48",           # geometry token shared by variants
  "notes":         "..."                     # optional free text
  "variants":      [ VARIANT, ... ]
}

--------------------------------------------------------------------------------
VARIANT SCHEMA
--------------------------------------------------------------------------------
{
  "weapon_id":    "US_TORP_Mk48",            # [COUNTRY]_[CATEGORY]_[FAMILY]
  "display_name": "Mk 48 ADCAP",             # UI name
  "short_name":   "Mk48",                    # compact UI name
  "country":      "USA",
  "category":     "TORP",                    # TORP ASM LAM ASW SLBM STRAT MINE DECOY SPECIAL
  "role":         "Heavyweight torpedo",     # game role label
  "subrole":      "Modern_Heavyweight",      # category sub-classification
  "era":          "Cold War Late",           # Early / Cold War / Cold War Late / Modern / Future
  "service_years": "1972-present",
  "tier":         7,                          # GAME technology tier 1..10
  "tier_reason":  "...",                     # why this game tier, not a real-world rating
  "guidance":     "wire guided / active acoustic homing",
  "propulsion":   "thermal piston engine",
  "launch_methods": ["TORPEDO_TUBE"],        # TORPEDO_TUBE VLS SLBM_TUBE SWIM_OUT FREE_FALL
  "role_tags":    ["anti_ship", "anti_submarine"],
  "dimensions": {
      "length_m": 5.79, "diameter_m": 0.533, "mass_kg": 1582,
      "scale_source": "PUBLIC_REFERENCE",     # PUBLIC_REFERENCE | ESTIMATED | GAMEPLAY_SCALE
      "scale_note": "..."
  },
  "asset_priority": "HIGH",                   # HIGH MEDIUM LOW DATABASE_ONLY
  "geometry": {
      "kind": "torpedo",                      # see GEOMETRY_KINDS
      "features": ["pumpjet", "wire_dispenser"],  # distinctive visible features
      "params": {...}                         # kind specific, consumed by the factory
  },
  "confidence": "PUBLIC",                     # PUBLIC | GAMEPLAY | ESTIMATED
  "sources": [{"name": "...", "url": "...", "source_type": "public reference"}],
  "notes": "..."
}

--------------------------------------------------------------------------------
GEOMETRY KINDS (consumed by weapon_factory_blender.py)
--------------------------------------------------------------------------------
torpedo            axial cylinder, ogive nose, cruciform tail fins, propulsor
cruise_missile     slim cylinder, pop-out or fixed wings, tail control section
supersonic_missile solid booster + ramjet body, large tail fins, intakes
slbm               very long cylinder, blunt nose shroud, tail skirt, nozzle
glide_body         lifting body / hypersonic glide vehicle
mine               cylindrical or spherical mine body with mooring or canister
decoy              short capsule with hemispherical caps and dispenser rings
shelter            boxy dry deck shelter with hatch rings
sdv                submersible swimmer delivery vehicle with shrouded props
rocket_payload     ASW rocket with torpedo or depth-bomb payload section

--------------------------------------------------------------------------------
RULES
--------------------------------------------------------------------------------
1. Public open-source identity, class, era and size only. No engineering detail.
2. Never merge a family and a variant. Never split identical geometry into
   separate models just because the warhead or software differs.
3. Tiers are game technology tiers, never real-world ratings.
4. Compatibility is declared separately in data_submarine_fits.py and must be
   CONFIRMED, PROBABLE, GAMEPLAY or UNKNOWN - never invented as CONFIRMED.
"""
from __future__ import annotations

from data_missiles import MISSILE_FAMILIES
from data_slbm import SLBM_FAMILIES
from data_submarine_fits import SUBMARINE_FITS, SUBMARINE_LAUNCH_INTERFACES
from data_strategic import STRATEGIC_FAMILIES, STRATEGIC_SLBM_FAMILIES
from data_support import SUPPORT_FAMILIES
from data_torpedoes import TORPEDO_FAMILIES
from weapon_production_curation import decision_for, reason_for
from weapon_records import WEAPON_STATUS

GEOMETRY_KINDS = (
    'torpedo',
    'cruise_missile',
    'supersonic_missile',
    'slbm',
    'glide_body',
    'mine',
    'decoy',
    'shelter',
    'sdv',
    'rocket_payload',
)

FAMILIES = (
    TORPEDO_FAMILIES
    + MISSILE_FAMILIES
    + SLBM_FAMILIES
    + STRATEGIC_SLBM_FAMILIES
    + STRATEGIC_FAMILIES
    + SUPPORT_FAMILIES
)


def _flatten() -> tuple[dict, dict]:
    variants: dict[str, dict] = {}
    families: dict[str, dict] = {}
    for family in FAMILIES:
        if family['family_id'] in families:
            raise ValueError(f"duplicate family_id: {family['family_id']}")
        families[family['family_id']] = family
        for variant in family['variants']:
            # 国家、家族名与基础几何属于家族级事实，变体只需继承，避免数据分册重复书写。
            variant.setdefault('country', family['country'])
            variant.setdefault('family_id', family['family_id'])
            variant.setdefault('family_name', family['family_name'])
            variant.setdefault('base_geometry', family['base_geometry'])
            weapon_id = variant['weapon_id']
            if weapon_id in variants:
                raise ValueError(f'duplicate weapon_id: {weapon_id}')
            variants[weapon_id] = variant
    return families, variants


FAMILIES_BY_ID, VARIANTS_BY_ID = _flatten()


def _apply_production_decision() -> None:
    """给每个变体写入 3D 生产决策（不修改作者标注的 asset_priority）。"""
    for weapon_id, variant in VARIANTS_BY_ID.items():
        decision = decision_for(weapon_id, variant['asset_priority'])
        variant['production_decision'] = decision
        variant['production_reason'] = reason_for(weapon_id)


_apply_production_decision()


def audit_dataset() -> list[str]:
    """Structural self-check used by the builders and the review pass."""
    problems: list[str] = []
    for family in FAMILIES:
        for key in ('family_id', 'country', 'family_name', 'primary_category', 'categories', 'variants'):
            if key not in family:
                problems.append(f"{family.get('family_id', '?')}: missing family key {key}")
        if not family.get('variants'):
            problems.append(f"{family['family_id']}: family has no variants")
        for variant in family['variants']:
            weapon_id = variant.get('weapon_id', '?')
            prefix = f"{weapon_id}"
            for key in (
                'display_name', 'short_name', 'country', 'category', 'role', 'subrole',
                'era', 'status', 'tier', 'tier_reason', 'guidance', 'propulsion', 'launch_methods',
                'role_tags', 'dimensions', 'asset_priority', 'geometry', 'confidence',
            ):
                if key not in variant:
                    problems.append(f'{prefix}: missing key {key}')
            if variant.get('status') not in WEAPON_STATUS:
                problems.append(f'{prefix}: bad status {variant.get("status")!r}')
            if variant.get('country') != family['country']:
                problems.append(f'{prefix}: country differs from family country')
            if variant.get('category') not in family['categories']:
                problems.append(f'{prefix}: category {variant.get("category")} not declared on family')
            if not isinstance(variant.get('tier'), int) or not 1 <= variant['tier'] <= 10:
                problems.append(f'{prefix}: tier must be an int in 1..10')
            dimensions = variant.get('dimensions') or {}
            if dimensions.get('scale_source') not in ('PUBLIC_REFERENCE', 'ESTIMATED', 'GAMEPLAY_SCALE'):
                problems.append(f'{prefix}: scale_source must be declared')
            if not isinstance(dimensions.get('length_m'), (int, float)):
                problems.append(f'{prefix}: length_m must be numeric')
            if variant.get('asset_priority') not in ('HIGH', 'MEDIUM', 'LOW', 'DATABASE_ONLY'):
                problems.append(f'{prefix}: bad asset_priority')
            geometry = variant.get('geometry') or {}
            if geometry.get('kind') not in GEOMETRY_KINDS:
                problems.append(f'{prefix}: unknown geometry kind {geometry.get("kind")!r}')
    return problems


def dataset_summary() -> dict:
    from collections import Counter

    variants = list(VARIANTS_BY_ID.values())
    return {
        'families': len(FAMILIES),
        'variants': len(variants),
        'by_category': dict(sorted(Counter(v['category'] for v in variants).items())),
        'by_country': dict(sorted(Counter(v['country'] for v in variants).items())),
        'by_tier': {f'T{t}': sum(1 for v in variants if v['tier'] == t) for t in range(1, 11)},
        'by_priority': dict(sorted(Counter(v['asset_priority'] for v in variants).items())),
        'by_production_decision': dict(sorted(Counter(v.get('production_decision', 'UNKNOWN') for v in variants).items())),
        'submarines_with_fit_data': len(SUBMARINE_FITS),
        'submarines_with_launch_interface': len(SUBMARINE_LAUNCH_INTERFACES),
    }


if __name__ == '__main__':
    import json

    issues = audit_dataset()
    print(json.dumps({'summary': dataset_summary(), 'issues': issues}, indent=2, ensure_ascii=False))
    raise SystemExit(1 if issues else 0)
