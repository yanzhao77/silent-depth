#!/usr/bin/env python3
"""Referential-integrity self check for the defensive system dataset.

This is the database-side gate (the asset-side gate lives in
``defensive_system_validator.py``). It fails loudly on a dangling reference so a
broken tree can never be published as if it were complete.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import sds_dataset as dataset  # noqa: E402
from sds_common import CATEGORY_DIR, COMPATIBILITY_LEVELS, SOCKETS  # noqa: E402


def main() -> int:
    errors: list[str] = []
    warnings: list[str] = []

    branch_ids = {branch['branch_id'] for branch in dataset.BRANCHES}
    family_ids = {family['family_id'] for family in dataset.FAMILIES}
    asset_ids = set(dataset.ASSET_BY_ID)

    if len(family_ids) != len(dataset.FAMILIES):
        errors.append('duplicate family_id in FAMILIES')
    if len(asset_ids) != len(dataset.ASSETS):
        errors.append('duplicate asset_id in ASSETS')

    for family in dataset.FAMILIES:
        if family['branch'] not in branch_ids:
            errors.append(f"{family['family_id']}: unknown branch {family['branch']}")
        if not 1 <= family['tier_min'] <= family['tier_max'] <= 10:
            errors.append(f"{family['family_id']}: tier range out of 1..10")
        if family['branch'] == 'INTEGRATED_DEFENSE' and family['tier_min'] < 6:
            warnings.append(f"{family['family_id']}: integrated defense below T6")

    for tier, ladder in dataset.TIER_LADDER.items():
        if not 1 <= tier <= 10:
            errors.append(f'tier ladder key out of range: {tier}')
        for family_id in ladder['families']:
            if family_id not in family_ids:
                errors.append(f"T{tier}: unknown family {family_id}")
                continue
            family = dataset.FAMILY_BY_ID[family_id]
            if tier < family['tier_min'] or tier > family['tier_max']:
                warnings.append(f"T{tier}: {family_id} listed outside its own window "
                                f"T{family['tier_min']}-T{family['tier_max']}")

    for family_id, binding in dataset.FAMILY_ASSET_BINDING.items():
        if family_id not in family_ids:
            errors.append(f'binding for unknown family {family_id}')
        for country, asset_id in binding.items():
            if country not in dataset.COUNTRIES:
                errors.append(f'{family_id}: binding for unknown country {country}')
            if asset_id not in asset_ids:
                errors.append(f'{family_id}/{country}: unknown asset {asset_id}')

    for asset in dataset.ASSETS:
        if asset['category'] not in CATEGORY_DIR:
            errors.append(f"{asset['asset_id']}: category without directory mapping")
        if asset['branch'] not in branch_ids:
            errors.append(f"{asset['asset_id']}: unknown branch {asset['branch']}")
        if asset['family_id'] not in family_ids:
            errors.append(f"{asset['asset_id']}: unknown family {asset['family_id']}")
        for socket in asset['sockets']:
            if socket not in SOCKETS:
                errors.append(f"{asset['asset_id']}: socket {socket} outside the vocabulary")
        if not asset['dimensions_m']:
            errors.append(f"{asset['asset_id']}: no dimensions declared")

    for row in dataset.COMPATIBILITY_SEED:
        if row['family_id'] not in family_ids:
            errors.append(f"seed row references unknown family {row['family_id']}")
        if row['status'] not in COMPATIBILITY_LEVELS:
            errors.append(f"seed row status {row['status']} not a compatibility level")
        if row['status'] != 'GAMEPLAY' and not row.get('note_zh'):
            warnings.append(f"seed row {row['submarine']}/{row['family_id']} has no note")

    for slot in dataset.LOADOUT_SLOTS:
        if slot['socket'] and slot['socket'] not in SOCKETS:
            errors.append(f"loadout slot {slot['slot']}: socket outside the vocabulary")
        if slot['branch'] not in branch_ids:
            errors.append(f"loadout slot {slot['slot']}: unknown branch {slot['branch']}")

    variants = dataset.variants()
    if len(variants) != len(dataset.FAMILIES) * len(dataset.COUNTRIES):
        errors.append('variant count does not equal families x countries')
    for variant in variants:
        if variant['asset_id'] and variant['asset_id'] not in asset_ids:
            errors.append(f"{variant['variant_id']}: unknown asset binding")
        if variant['verification'] in ('CONFIRMED', 'PROBABLE') and not variant['sources']:
            errors.append(f"{variant['variant_id']}: real-world claim without sources")

    assets_without_family_binding = [
        asset['asset_id'] for asset in dataset.ASSETS
        if not any(asset['asset_id'] in binding.values()
                   for binding in dataset.FAMILY_ASSET_BINDING.values())
    ]
    for asset_id in assets_without_family_binding:
        warnings.append(f'{asset_id}: declared asset is not bound to any family')

    print(f'FAMILIES={len(dataset.FAMILIES)} ASSETS={len(dataset.ASSETS)} VARIANTS={len(variants)}')
    for warning in warnings:
        print(f'WARN {warning}')
    for error in errors:
        print(f'ERROR {error}')
    print(f'SELFCHECK={"PASS" if not errors else "FAIL"} warnings={len(warnings)} errors={len(errors)}')
    return 0 if not errors else 1


if __name__ == '__main__':
    raise SystemExit(main())
