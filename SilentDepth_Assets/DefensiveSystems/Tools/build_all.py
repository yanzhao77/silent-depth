#!/usr/bin/env python3
"""Runs the whole defensive-system database build in dependency order."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import build_defensive_database as family_db  # noqa: E402
import sds_build_compat as compat  # noqa: E402
import sds_build_manifest as manifest  # noqa: E402
import sds_build_reports as reports  # noqa: E402
import sds_build_tree as tree  # noqa: E402
from sds_common import DOC_DIR, MANIFEST_DIR, TREE_DIR, save_json, save_text  # noqa: E402


def main() -> int:
    family_database = family_db.build_family_database()
    save_json(MANIFEST_DIR / 'defensive_system_family.json', family_database)
    print(f"FAMILIES={family_database['totals']['families']} "
          f"VARIANTS={family_database['totals']['variants']} "
          f"VERIFICATION={family_database['totals']['verification']}")

    tree_data, tier_manifest = tree.build_technology_tree()
    save_json(TREE_DIR / 'defensive_technology_tree.json', tree_data)
    save_json(TREE_DIR / 'tier_manifest.json', tier_manifest)
    print(f"TREE_NODES={tree_data['totals']['nodes']} "
          f"DATABASE_ONLY={tree_data['totals']['database_only_families']}")

    compatibility = compat.build_compatibility()
    save_json(MANIFEST_DIR / 'submarine_defensive_compatibility.json', compatibility)
    loadout = compat.build_loadout(compatibility)
    save_json(MANIFEST_DIR / 'defensive_loadout_manifest.json', loadout)
    compat.build_matrix_csv(compatibility)
    print(f"COMPAT_ROWS={compatibility['totals']['rows']} "
          f"BY_LEVEL={compatibility['totals']['by_level']} "
          f"DEMOTIONS={len(compatibility['demotions'])}")

    asset_manifest = manifest.build_asset_manifest()
    save_json(MANIFEST_DIR / 'defensive_system_manifest.json', asset_manifest)
    print(f"ASSETS={asset_manifest['totals']['assets']} "
          f"PIPELINE_COMPLETE={asset_manifest['totals']['pipeline_complete']}")

    save_path = DOC_DIR / 'defensive_coverage_report.md'
    save_text(save_path, reports.build_report())
    print(f"COVERAGE_REPORT={save_path}")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
