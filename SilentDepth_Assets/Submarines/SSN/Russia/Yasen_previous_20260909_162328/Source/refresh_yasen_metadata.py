import hashlib
import json
from pathlib import Path

ASSET_ID = "RU_SSN_Yasen"
ASSET_ROOT = Path("/Users/sjw/Documents/BlenderProjects/SilentDepth_Assets")
ROOT = ASSET_ROOT / "Submarines" / "SSN" / "Russia" / "Yasen"
SPEC = ROOT / "Documentation" / f"{ASSET_ID}_SPEC.json"
MANIFEST = ASSET_ROOT / "Manifest" / "submarine_manifest.json"
STATUS = ASSET_ROOT / "Manifest" / "production_status.json"


def write_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")


def hashes():
    result = {}
    for folder in ("Blend", "FBX", "Collision", "Source", "Preview", "Validation", "Documentation", "Textures"):
        for path in (ROOT / folder).glob("**/*"):
            if not path.is_file():
                continue
            if path == SPEC:
                continue
            if path.suffix.lower() not in {".blend", ".fbx", ".py", ".png", ".json", ".md"}:
                continue
            result[str(path.relative_to(ROOT))] = hashlib.sha256(path.read_bytes()).hexdigest()
    return dict(sorted(result.items()))


sha = hashes()
spec = json.loads(SPEC.read_text())
spec["dimensions_m"] = {
    "hull_length_reference": 120.0,
    "hull_beam_reference": 13.0,
    "export_bounds_with_appendages": [123.325, 18.0, 21.15],
    "sail_body_top_z": 12.9,
    "mast_top_z": 15.35,
}
spec["validation_reports"] = {
    "build_validation": str(ROOT / "Validation" / f"{ASSET_ID}_VALIDATION.json"),
    "fbx_roundtrip": str(ROOT / "Validation" / "FBX_ROUNDTRIP.json"),
    "factory_validation": str(ROOT / "Validation" / f"{ASSET_ID}_FACTORY_VALIDATION.json"),
    "blender_agent_studio_inspect": str(ROOT / "Validation" / "BAS_INSPECT_LOD0.json"),
    "blender_agent_studio_evidence": str(ROOT / "Preview" / "BAS_Evidence_Final" / "evidence.json"),
}
spec["sha256"] = sha
spec["sha256_note"] = "SPEC self-hash is intentionally excluded to avoid recursive metadata churn."
write_json(SPEC, spec)

if MANIFEST.exists():
    manifest = json.loads(MANIFEST.read_text())
    asset = next(item for item in manifest.get("assets", []) if item.get("asset_id") == ASSET_ID)
    asset["sha256"] = sha
    asset["status"] = "VALIDATING"
    asset["previews"] = [str(path) for path in sorted((ROOT / "Preview").glob("**/*.png"))]
    asset["validation"] = str(ROOT / "Validation" / f"{ASSET_ID}_VALIDATION.json")
    write_json(MANIFEST, manifest)

if STATUS.exists():
    status = json.loads(STATUS.read_text())
    status.setdefault("status_by_asset", {})[ASSET_ID] = "VALIDATING"
    status.setdefault("blocking_conditions", {})[ASSET_ID] = "UE4.27 editor import not executed locally; Blender Agent Studio inspect/evidence and FBX roundtrip passed."
    status["updated_at"] = "2026-09-09"
    write_json(STATUS, status)

print(json.dumps({"asset_id": ASSET_ID, "hashes": len(sha), "status": "VALIDATING"}, ensure_ascii=False, indent=2))
