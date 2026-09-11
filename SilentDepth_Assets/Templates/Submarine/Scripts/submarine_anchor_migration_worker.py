#!/usr/bin/env python3
"""SilentDepth 潜艇 Anchor 迁移 worker。

该脚本从 Assembly 读取 Pivot/Socket 定义，只创建 Empty Anchor 和 Anchor Collection。
输入 .blend 不会被保存；非验证模式仅 save-as 到显式输出路径。
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path
from typing import Any, Iterable

import bpy
from mathutils import Euler, Vector

REPORT_FORMAT_VERSION = 1
WORKER_VERSION = "1.0.0"
ANCHOR_COLLECTION = "30_ANCHORS"
TOLERANCE = 1.0e-6


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="SilentDepth 潜艇 Anchor 迁移 worker")
    parser.add_argument("--input", required=True)
    parser.add_argument("--assembly", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--report", required=True)
    parser.add_argument("--expected-sha256", required=True)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--validate-existing", action="store_true")
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(argv)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def fingerprint(path: Path) -> dict[str, Any]:
    stat = path.stat()
    return {"mtimeMs": stat.st_mtime * 1000.0, "path": str(path), "sha256": sha256(path), "sizeBytes": stat.st_size}


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


def anchor_specs(assembly: dict[str, Any]) -> list[dict[str, Any]]:
    specs: list[dict[str, Any]] = []
    for part in sorted(assembly.get("parts", []), key=lambda item: str(item.get("id", ""))):
        transform = part.get("mountTransform", {})
        specs.append(
            {
                "anchorName": part["pivotAnchor"],
                "anchorType": "pivot",
                "motion": part.get("motion", {}),
                "ownerId": part.get("id"),
                "sourceObjects": part.get("sourceObjects", []),
                "transform": transform,
            }
        )
    for socket in sorted(assembly.get("sockets", []), key=lambda item: str(item.get("id", ""))):
        specs.append(
            {
                "anchorName": socket["sourceAnchor"],
                "anchorType": "socket",
                "ownerId": socket.get("id"),
                "purpose": socket.get("purpose"),
                "sourceObjects": [],
                "transform": socket.get("transform", {}),
            }
        )
    return specs


def collection() -> bpy.types.Collection:
    existing = bpy.data.collections.get(ANCHOR_COLLECTION)
    if existing is not None:
        return existing
    created = bpy.data.collections.new(ANCHOR_COLLECTION)
    bpy.context.scene.collection.children.link(created)
    return created


def expected_location(transform: dict[str, Any]) -> Vector:
    values = transform.get("translation", [0.0, 0.0, 0.0])
    return Vector((float(values[0]), float(values[1]), float(values[2])))


def expected_rotation(transform: dict[str, Any]) -> Euler:
    values = transform.get("rotationDegrees", [0.0, 0.0, 0.0])
    return Euler((math.radians(float(values[0])), math.radians(float(values[1])), math.radians(float(values[2]))), "XYZ")


def expected_scale(transform: dict[str, Any]) -> Vector:
    values = transform.get("scale", [1.0, 1.0, 1.0])
    return Vector((float(values[0]), float(values[1]), float(values[2])))


def close_vector(left: Vector, right: Vector) -> bool:
    return all(abs(float(left[index]) - float(right[index])) <= TOLERANCE for index in range(3))


def object_bounds(names: list[str]) -> dict[str, Any] | None:
    corners: list[Vector] = []
    for name in names:
        object_item = bpy.data.objects.get(name)
        if object_item is None or object_item.type != "MESH":
            continue
        corners.extend([object_item.matrix_world @ Vector(corner) for corner in object_item.bound_box])
    if not corners:
        return None
    minimum = Vector((min(point.x for point in corners), min(point.y for point in corners), min(point.z for point in corners)))
    maximum = Vector((max(point.x for point in corners), max(point.y for point in corners), max(point.z for point in corners)))
    return {"max": vector3(maximum), "min": vector3(minimum)}


def scene_summary() -> dict[str, Any]:
    return {
        "collectionCount": len(bpy.data.collections),
        "emptyObjectCount": sum(1 for item in bpy.data.objects if item.type == "EMPTY"),
        "meshObjectCount": sum(1 for item in bpy.data.objects if item.type == "MESH"),
        "objectCount": len(bpy.data.objects),
    }


def create_or_validate_anchor(spec: dict[str, Any], target_collection: bpy.types.Collection, dry_run: bool) -> dict[str, Any]:
    name = str(spec["anchorName"])
    location = expected_location(spec["transform"])
    rotation = expected_rotation(spec["transform"])
    scale = expected_scale(spec["transform"])
    existing = bpy.data.objects.get(name)
    source_bounds = object_bounds([str(item) for item in spec.get("sourceObjects", [])])
    if existing is not None:
        problems: list[str] = []
        if existing.type != "EMPTY":
            problems.append("同名对象不是 Empty")
        if not close_vector(existing.location, location):
            problems.append("同名 Anchor location 与 Assembly 不一致")
        if not close_vector(Vector(existing.rotation_euler), Vector(rotation)):
            problems.append("同名 Anchor rotation 与 Assembly 不一致")
        if not close_vector(existing.scale, scale):
            problems.append("同名 Anchor scale 与 Assembly 不一致")
        return {
            "action": "PASS_EXISTING" if not problems else "ERROR_EXISTING_MISMATCH",
            "anchorName": name,
            "anchorType": spec["anchorType"],
            "ownerId": spec.get("ownerId"),
            "problems": problems,
            "sourceBoundsWorld": source_bounds,
            "transform": {"rotationDegrees": spec["transform"].get("rotationDegrees", [0, 0, 0]), "scale": spec["transform"].get("scale", [1, 1, 1]), "translation": spec["transform"].get("translation", [0, 0, 0])},
        }
    if dry_run:
        return {
            "action": "WOULD_CREATE",
            "anchorName": name,
            "anchorType": spec["anchorType"],
            "ownerId": spec.get("ownerId"),
            "problems": [],
            "sourceBoundsWorld": source_bounds,
            "transform": {"rotationDegrees": spec["transform"].get("rotationDegrees", [0, 0, 0]), "scale": spec["transform"].get("scale", [1, 1, 1]), "translation": spec["transform"].get("translation", [0, 0, 0])},
        }
    anchor = bpy.data.objects.new(name, None)
    anchor.empty_display_type = "PLAIN_AXES"
    anchor.empty_display_size = 0.75 if spec["anchorType"] == "pivot" else 0.45
    anchor.location = location
    anchor.rotation_euler = rotation
    anchor.scale = scale
    target_collection.objects.link(anchor)
    return {
        "action": "CREATED",
        "anchorName": name,
        "anchorType": spec["anchorType"],
        "ownerId": spec.get("ownerId"),
        "problems": [],
        "sourceBoundsWorld": source_bounds,
        "transform": {"rotationDegrees": spec["transform"].get("rotationDegrees", [0, 0, 0]), "scale": spec["transform"].get("scale", [1, 1, 1]), "translation": spec["transform"].get("translation", [0, 0, 0])},
    }


def main() -> int:
    args = parse_args()
    input_path = Path(args.input).resolve()
    assembly_path = Path(args.assembly).resolve()
    output_path = Path(args.output).resolve()
    report_path = Path(args.report).resolve()
    if input_path == output_path and not args.validate_existing:
        print("输出路径不得等于输入路径", file=sys.stderr)
        return 2
    if sha256(input_path) != args.expected_sha256:
        print("打开前后传入的输入 SHA-256 不一致", file=sys.stderr)
        return 5
    if Path(bpy.data.filepath).resolve() != input_path:
        print(f"Blender 当前打开文件不是目标输入：{bpy.data.filepath}", file=sys.stderr)
        return 4
    assembly = load_json(assembly_path)
    before = fingerprint(input_path)
    before_scene = scene_summary()
    target_collection = collection()
    anchors = [create_or_validate_anchor(spec, target_collection, args.dry_run or args.validate_existing) for spec in anchor_specs(assembly)]
    problems = [problem for anchor in anchors for problem in anchor["problems"]]
    if problems:
        status = "ERROR"
    elif args.dry_run:
        status = "DRY_RUN"
    elif args.validate_existing:
        status = "PASS_EXISTING"
    else:
        status = "CREATED"
    if not args.dry_run and not args.validate_existing:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=str(output_path))
    after_input = fingerprint(input_path)
    output_fingerprint = fingerprint(output_path) if output_path.exists() else None
    report = {
        "anchorCollection": ANCHOR_COLLECTION,
        "anchors": anchors,
        "assembly": {"assetId": assembly.get("assetId"), "path": str(assembly_path)},
        "inputIntegrity": {"after": after_input, "before": before, "unchanged": before["sha256"] == after_input["sha256"] and before["sizeBytes"] == after_input["sizeBytes"] and before["mtimeMs"] == after_input["mtimeMs"]},
        "output": {"fingerprint": output_fingerprint, "path": str(output_path)},
        "reportFormatVersion": REPORT_FORMAT_VERSION,
        "sceneCounts": {"after": scene_summary(), "before": before_scene},
        "status": status,
        "workerVersion": WORKER_VERSION,
    }
    write_json(report_path, report)
    return 1 if status == "ERROR" else 0


if __name__ == "__main__":
    raise SystemExit(main())
