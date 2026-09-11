#!/usr/bin/env python3
"""SilentDepth 潜艇 FBX 全新进程回读 worker。"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path
from typing import Any, Iterable

import bpy
from mathutils import Vector

REPORT_FORMAT_VERSION = 1
WORKER_VERSION = "1.0.0"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="SilentDepth 潜艇 FBX 回读验证 worker")
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--staging", required=True)
    parser.add_argument("--output", required=True)
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(argv)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sort_deep(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: sort_deep(value[key]) for key in sorted(value.keys())}
    if isinstance(value, list):
        return [sort_deep(item) for item in value]
    return value


def write_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(sort_deep(data), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def vector3(value: Iterable[float]) -> list[float]:
    return [round(float(component), 9) for component in value]


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def bounds(objects: list[bpy.types.Object]) -> dict[str, Any] | None:
    corners: list[Vector] = []
    for object_item in objects:
        if object_item.type != "MESH":
            continue
        corners.extend([object_item.matrix_world @ Vector(corner) for corner in object_item.bound_box])
    if not corners:
        return None
    minimum = Vector((min(point.x for point in corners), min(point.y for point in corners), min(point.z for point in corners)))
    maximum = Vector((max(point.x for point in corners), max(point.y for point in corners), max(point.z for point in corners)))
    return {"max": vector3(maximum), "min": vector3(minimum)}


def triangle_count(object_item: bpy.types.Object) -> int:
    return sum(max(1, len(poly.vertices) - 2) for poly in object_item.data.polygons)


def mesh_issues(object_item: bpy.types.Object) -> list[str]:
    issues: list[str] = []
    mesh = object_item.data
    if len(mesh.vertices) == 0:
        issues.append("NO_VERTICES")
    if len(mesh.polygons) == 0:
        issues.append("NO_FACES")
    if any(not all(math.isfinite(float(value)) for value in vertex.co) for vertex in mesh.vertices):
        issues.append("NON_FINITE_VERTEX")
    if any((mesh.vertices[edge.vertices[0]].co - mesh.vertices[edge.vertices[1]].co).length <= 1.0e-9 for edge in mesh.edges):
        issues.append("ZERO_LENGTH_EDGE")
    if any(float(poly.area) <= 1.0e-12 for poly in mesh.polygons):
        issues.append("DEGENERATE_FACE")
    if any(value < 0.0 for value in object_item.scale):
        issues.append("NEGATIVE_SCALE")
    return issues


def import_fbx(path: Path) -> list[bpy.types.Object]:
    before = {object_item.name for object_item in bpy.data.objects}
    bpy.ops.import_scene.fbx(filepath=str(path), use_custom_normals=True)
    return sorted([object_item for object_item in bpy.data.objects if object_item.name not in before], key=lambda item: item.name)


def inspect_file(staging: Path, entry: dict[str, Any]) -> dict[str, Any]:
    clear_scene()
    relative_path = str(entry["path"])
    path = staging / relative_path
    if not path.exists():
        return {"path": relative_path, "role": entry.get("role"), "status": "ERROR", "issues": ["MISSING_FILE"]}
    imported = import_fbx(path)
    mesh_objects = [object_item for object_item in imported if object_item.type == "MESH"]
    issues = [issue for object_item in mesh_objects for issue in mesh_issues(object_item)]
    imported_triangles = sum(triangle_count(object_item) for object_item in mesh_objects)
    expected_triangles = int(entry.get("triangleCount", -1))
    if expected_triangles >= 0 and imported_triangles != expected_triangles:
        issues.append("TRIANGLE_COUNT_CHANGED")
    expected_sha = str(entry.get("sha256", ""))
    actual_sha = sha256(path)
    if expected_sha and actual_sha != expected_sha:
        issues.append("SHA256_CHANGED")
    return {
        "bounds": bounds(mesh_objects),
        "importedMeshCount": len(mesh_objects),
        "importedObjectCount": len(imported),
        "issues": sorted(set(issues)),
        "materialSlotCount": sum(len(object_item.material_slots) for object_item in mesh_objects),
        "path": relative_path,
        "role": entry.get("role"),
        "sha256": actual_sha,
        "status": "PASS" if not issues else "ERROR",
        "triangleCount": imported_triangles,
    }


def main() -> int:
    args = parse_args()
    manifest_path = Path(args.manifest).resolve()
    staging = Path(args.staging).resolve()
    output = Path(args.output).resolve()
    manifest = load_json(manifest_path)
    results = [inspect_file(staging, entry) for entry in manifest.get("files", [])]
    lod_triangles = [item["triangleCount"] for item in results if str(item.get("role", "")).startswith("hull_LOD")]
    lod_strict = all(lod_triangles[index] > lod_triangles[index + 1] for index in range(len(lod_triangles) - 1))
    if not lod_strict:
        results.append({"issues": ["LOD_TRIANGLES_NOT_STRICTLY_DESCENDING"], "path": "LOD", "role": "lod_summary", "status": "ERROR"})
    report = {
        "assetId": manifest.get("assetId"),
        "files": results,
        "manifest": str(manifest_path),
        "reportFormatVersion": REPORT_FORMAT_VERSION,
        "status": "PASS" if all(item.get("status") == "PASS" for item in results) and lod_strict else "ERROR",
        "workerVersion": WORKER_VERSION,
    }
    write_json(output, report)
    return 0 if report["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
