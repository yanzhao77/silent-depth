#!/usr/bin/env python3
"""SilentDepth 潜艇鱼雷 muzzle 几何推导 worker。

该脚本只读取当前 Blender 后台进程打开的 .blend，不调用保存 API。
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
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

REPORT_FORMAT_VERSION = 1
WORKER_VERSION = "1.0.0"
FORWARD = Vector((1.0, 0.0, 0.0))
DEFAULT_RADIUS = 0.35
DEFAULT_MARGIN = 0.18
DEFAULT_RAY_DISTANCE = 8.0
DEFAULT_SWEEP_DISTANCE = 3.2
DEFAULT_SWEEP_SAMPLES = 7


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="SilentDepth 潜艇鱼雷 muzzle 几何推导 worker")
    parser.add_argument("--master", required=True)
    parser.add_argument("--assembly", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--expected-sha256", required=True)
    parser.add_argument("--candidates", required=True)
    parser.add_argument("--radius", type=float, default=DEFAULT_RADIUS)
    parser.add_argument("--margin", type=float, default=DEFAULT_MARGIN)
    parser.add_argument("--ray-distance", type=float, default=DEFAULT_RAY_DISTANCE)
    parser.add_argument("--sweep-distance", type=float, default=DEFAULT_SWEEP_DISTANCE)
    parser.add_argument("--sweep-samples", type=int, default=DEFAULT_SWEEP_SAMPLES)
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


def matrix_rows(matrix: Matrix) -> list[list[float]]:
    return [[round(float(matrix[row][column]), 9) for column in range(4)] for row in range(4)]


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def object_bounds(points: list[Vector]) -> dict[str, Any]:
    minimum = Vector((min(point.x for point in points), min(point.y for point in points), min(point.z for point in points)))
    maximum = Vector((max(point.x for point in points), max(point.y for point in points), max(point.z for point in points)))
    return {"max": vector3(maximum), "min": vector3(minimum)}


def evaluated_mesh_data(object_item: bpy.types.Object) -> tuple[bpy.types.Object, bpy.types.Mesh]:
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = object_item.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    return evaluated, mesh


def polygon_area_and_normal(points: list[Vector]) -> tuple[float, Vector]:
    if len(points) < 3:
        return 0.0, Vector((0.0, 0.0, 0.0))
    origin = points[0]
    normal_sum = Vector((0.0, 0.0, 0.0))
    area_sum = 0.0
    for index in range(1, len(points) - 1):
        cross = (points[index] - origin).cross(points[index + 1] - origin)
        area = cross.length * 0.5
        if area <= 1.0e-12:
            continue
        area_sum += area
        normal_sum += cross * 0.5
    if normal_sum.length == 0.0:
        return area_sum, Vector((0.0, 0.0, 0.0))
    return area_sum, normal_sum.normalized()


def object_mesh_metrics(object_item: bpy.types.Object) -> dict[str, Any]:
    if object_item.type != "MESH":
        raise ValueError(f"候选对象不是 Mesh：{object_item.name}")
    evaluated, mesh = evaluated_mesh_data(object_item)
    try:
        world_vertices = [object_item.matrix_world @ vertex.co for vertex in mesh.vertices]
        if not world_vertices:
            raise ValueError(f"候选对象没有顶点：{object_item.name}")
        weighted_normal = Vector((0.0, 0.0, 0.0))
        weighted_center = Vector((0.0, 0.0, 0.0))
        total_area = 0.0
        triangle_count = 0
        face_centers: list[list[float]] = []
        face_normals: list[list[float]] = []
        for polygon in mesh.polygons:
            points = [world_vertices[index] for index in polygon.vertices]
            area, normal = polygon_area_and_normal(points)
            if area <= 1.0e-12:
                continue
            center = sum(points, Vector((0.0, 0.0, 0.0))) / len(points)
            weighted_center += center * area
            weighted_normal += normal * area
            total_area += area
            triangle_count += max(1, len(points) - 2)
            if len(face_centers) < 12:
                face_centers.append(vector3(center))
                face_normals.append(vector3(normal))
        if total_area <= 1.0e-12 or weighted_normal.length == 0.0:
            raise ValueError(f"候选对象面积退化：{object_item.name}")
        determinant = object_item.matrix_world.to_3x3().determinant()
        return {
            "areaWeightedNormal": vector3(weighted_normal.normalized()),
            "boundsWorld": object_bounds(world_vertices),
            "determinant": round(float(determinant), 9),
            "exampleFaceCenters": face_centers,
            "exampleFaceNormals": face_normals,
            "geometryCenter": vector3(weighted_center / total_area),
            "mirrored": determinant < 0.0,
            "objectName": object_item.name,
            "objectWorldMatrix": matrix_rows(object_item.matrix_world),
            "totalArea": round(float(total_area), 9),
            "triangleCount": triangle_count,
            "vertexCount": len(world_vertices),
        }
    finally:
        evaluated.to_mesh_clear()


def source_objects_from_assembly(assembly: dict[str, Any]) -> list[str]:
    names: list[str] = []
    hull = assembly.get("hull", {})
    names.extend(str(name) for name in hull.get("sourceObjects", []))
    collision = hull.get("collision", {})
    names.extend(str(name) for name in collision.get("sourceObjects", []))
    return sorted(set(names))


def bvh_from_objects(names: Iterable[str]) -> tuple[BVHTree, dict[str, Any]]:
    vertices: list[Vector] = []
    triangles: list[tuple[int, int, int]] = []
    source_counts: dict[str, int] = {}
    for name in sorted(set(names)):
        object_item = bpy.data.objects.get(name)
        if object_item is None or object_item.type != "MESH":
            continue
        evaluated, mesh = evaluated_mesh_data(object_item)
        try:
            base = len(vertices)
            vertices.extend([object_item.matrix_world @ vertex.co for vertex in mesh.vertices])
            count = 0
            for polygon in mesh.polygons:
                poly_vertices = list(polygon.vertices)
                if len(poly_vertices) < 3:
                    continue
                for index in range(1, len(poly_vertices) - 1):
                    triangles.append((base + poly_vertices[0], base + poly_vertices[index], base + poly_vertices[index + 1]))
                    count += 1
            source_counts[name] = count
        finally:
            evaluated.to_mesh_clear()
    if not vertices or not triangles:
        raise ValueError("Hull BVH 没有可用三角面")
    return BVHTree.FromPolygons(vertices, triangles, all_triangles=True), {
        "sourceTriangleCounts": source_counts,
        "triangleCount": len(triangles),
        "vertexCount": len(vertices),
    }


def vector_from_list(values: list[float]) -> Vector:
    return Vector((float(values[0]), float(values[1]), float(values[2])))


def side_sign_from_center(metric: dict[str, Any]) -> int:
    center_y = float(metric["geometryCenter"][1])
    if center_y > 0.0:
        return 1
    if center_y < 0.0:
        return -1
    raise ValueError(f"候选对象位于艇体中心线，不能推导舷外方向：{metric['objectName']}")


def corrected_normal(metric: dict[str, Any]) -> tuple[Vector, bool, str]:
    raw = vector_from_list(metric["areaWeightedNormal"])
    if raw.length == 0.0:
        raise ValueError(f"候选对象法线为零：{metric['objectName']}")
    raw.normalize()
    side = Vector((0.0, float(side_sign_from_center(metric)), 0.0))
    if raw.dot(side) >= 0.0:
        return raw, False, "面积加权法线已具有正确舷外分量"
    return -raw, True, "面积加权法线指向艇体中心线，按门面所在舷侧翻转"


def direction_candidates(normal: Vector, sign: int) -> list[dict[str, Any]]:
    side = Vector((0.0, float(sign), 0.0))
    mixes = [(0.76, 0.24, side), (0.66, 0.34, side), (0.56, 0.44, side), (0.72, 0.28, normal), (0.62, 0.38, normal), (0.52, 0.48, normal)]
    seen: set[tuple[float, float, float]] = set()
    results: list[dict[str, Any]] = []
    for forward_weight, outward_weight, outward in mixes:
        direction = FORWARD * forward_weight + outward * outward_weight
        if direction.length == 0.0:
            continue
        direction.normalize()
        key = tuple(round(float(component), 9) for component in direction)
        if key in seen:
            continue
        seen.add(key)
        results.append(
            {
                "direction": vector3(direction),
                "forwardComponent": round(float(direction.dot(FORWARD)), 9),
                "outwardComponent": round(float(direction.dot(side)), 9),
                "weights": [forward_weight, outward_weight],
            }
        )
    return results


def raycast_clearance(bvh: BVHTree, origin: Vector, direction: Vector, max_distance: float) -> dict[str, Any]:
    hit = bvh.ray_cast(origin, direction, max_distance)
    location, _normal, index, distance = hit
    if location is None or index is None or distance is None:
        return {"hit": False, "distance": None, "faceIndex": None, "location": None}
    return {"hit": True, "distance": round(float(distance), 9), "faceIndex": int(index), "location": vector3(location)}


def nearest_clearance(bvh: BVHTree, point: Vector, max_distance: float) -> dict[str, Any]:
    location, normal, index, distance = bvh.find_nearest(point, max_distance)
    if location is None or index is None or distance is None:
        return {"distance": max_distance, "faceIndex": None, "location": None, "normal": None}
    return {"distance": round(float(distance), 9), "faceIndex": int(index), "location": vector3(location), "normal": vector3(normal)}


def sweep_clearance(bvh: BVHTree, origin: Vector, direction: Vector, samples: int, distance: float, radius: float) -> dict[str, Any]:
    min_result: dict[str, Any] | None = None
    hit = False
    sample_reports: list[dict[str, Any]] = []
    steps = max(2, samples)
    for index in range(steps):
        travel = distance * index / (steps - 1)
        point = origin + direction * travel
        nearest = nearest_clearance(bvh, point, radius * 3.0)
        entry = {"clearance": nearest["distance"], "point": vector3(point), "travelMeters": round(float(travel), 9)}
        sample_reports.append(entry)
        if min_result is None or float(nearest["distance"]) < float(min_result["distance"]):
            min_result = {**nearest, "point": vector3(point), "travelMeters": round(float(travel), 9)}
        if float(nearest["distance"]) < radius:
            hit = True
    return {"hit": hit, "minimum": min_result, "samples": sample_reports}


def derive_candidates(metrics: list[dict[str, Any]], assembly: dict[str, Any], args: argparse.Namespace) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    hull_sources = source_objects_from_assembly(assembly)
    all_scores: list[dict[str, Any]] = []
    bvh_metadata_by_candidate: dict[str, Any] = {}
    max_x = max(float(metric["boundsWorld"]["max"][0]) for metric in metrics)
    min_x = min(float(metric["boundsWorld"]["min"][0]) for metric in metrics)
    x_span = max(1.0e-9, max_x - min_x)
    for metric in sorted(metrics, key=lambda item: str(item["objectName"])):
        name = str(metric["objectName"])
        bvh, bvh_metadata = bvh_from_objects(source for source in hull_sources if source != name)
        bvh_metadata_by_candidate[name] = bvh_metadata
        normal, flipped, reason = corrected_normal(metric)
        sign = side_sign_from_center(metric)
        center = vector_from_list(metric["geometryCenter"])
        side = Vector((0.0, float(sign), 0.0))
        surface_origin = center + normal * (args.radius + args.margin)
        x_rank = (float(metric["boundsWorld"]["max"][0]) - min_x) / x_span
        for direction_report in direction_candidates(normal, sign):
            direction = vector_from_list(direction_report["direction"])
            ray = raycast_clearance(bvh, surface_origin, direction, args.ray_distance)
            sweep = sweep_clearance(bvh, surface_origin, direction, args.sweep_samples, args.sweep_distance, args.radius)
            minimum = sweep["minimum"] or {"distance": args.radius * 3.0}
            rejected: list[str] = []
            if float(direction_report["forwardComponent"]) < 0.52:
                rejected.append("发射方向 +X 分量不足")
            if float(direction_report["outwardComponent"]) < 0.24:
                rejected.append("发射方向舷外分量不足")
            if bool(ray["hit"]):
                rejected.append("短距射线命中艇体或邻近结构")
            if bool(sweep["hit"]):
                rejected.append("保守 sweep 命中艇体或邻近结构")
            if float(minimum["distance"]) < args.radius:
                rejected.append("最小清障距离小于 gameplay envelope 半径")
            score = round(
                float(minimum["distance"]) * 1.5
                + float(direction_report["forwardComponent"]) * 1.0
                + float(direction_report["outwardComponent"]) * 0.85
                + x_rank * 0.35,
                9,
            )
            all_scores.append(
                {
                    "correctedNormal": vector3(normal),
                    "direction": direction_report,
                    "flippedNormal": flipped,
                    "muzzleOrigin": vector3(surface_origin),
                    "normalCorrectionReason": reason,
                    "objectName": name,
                    "outwardVector": vector3(side),
                    "raycast": ray,
                    "rejectionReasons": rejected,
                    "score": score,
                    "status": "ACCEPTED" if not rejected else "REJECTED",
                    "sweep": sweep,
                    "xRank": round(float(x_rank), 9),
                }
            )
    return sorted(all_scores, key=lambda item: (-float(item["score"]), str(item["objectName"]), item["direction"]["direction"])), bvh_metadata_by_candidate


def best_candidate(scores: list[dict[str, Any]]) -> dict[str, Any]:
    accepted = [score for score in scores if score["status"] == "ACCEPTED"]
    if not accepted:
        raise ValueError("没有找到满足清障规则的 BowDoor 发射候选")
    return sorted(accepted, key=lambda item: (-float(item["score"]), str(item["objectName"]), item["direction"]["direction"]))[0]


def main() -> int:
    args = parse_args()
    master = Path(args.master).resolve()
    assembly_path = Path(args.assembly).resolve()
    output = Path(args.output).resolve()
    candidates = [item.strip() for item in args.candidates.split(",") if item.strip()]
    if not candidates:
        print("候选对象列表为空", file=sys.stderr)
        return 2
    if sha256(master) != args.expected_sha256:
        print("打开前后传入的 MASTER SHA-256 不一致", file=sys.stderr)
        return 5
    if Path(bpy.data.filepath).resolve() != master:
        print(f"Blender 当前打开文件不是目标 MASTER：{bpy.data.filepath}", file=sys.stderr)
        return 4
    assembly = load_json(assembly_path)
    missing = [name for name in candidates if bpy.data.objects.get(name) is None]
    if missing:
        print("候选 Mesh 不存在：" + ", ".join(missing), file=sys.stderr)
        return 3
    metrics = [object_mesh_metrics(bpy.data.objects[name]) for name in candidates]
    scores, bvh_metadata = derive_candidates(metrics, assembly, args)
    selected = best_candidate(scores)
    report = {
        "assembly": {"assetId": assembly.get("assetId"), "path": str(assembly_path)},
        "bvh": bvh_metadata,
        "candidates": metrics,
        "deterministicParameters": {
            "candidateObjects": candidates,
            "clearanceMarginMeters": args.margin,
            "envelopeLengthMeters": 7.0,
            "envelopeRadiusMeters": args.radius,
            "rayDistanceMeters": args.ray_distance,
            "sweepDistanceMeters": args.sweep_distance,
            "sweepSampleCount": args.sweep_samples,
        },
        "legacySocketRejection": {
            "directionAccepted": True,
            "oldAnchorName": "SOCKET_TORPEDO_01",
            "oldTranslation": [55.799972534, 0.0, 7.26317358],
            "reasons": [
                "旧位置位于 y=0 中线",
                "旧位置高于当前 Hull 本体顶部",
                "旧位置与当前 BowDoor evaluated geometry 没有充分对应关系",
                "旧位置不得作为正式 gameplay muzzle transform",
            ],
        },
        "master": {"path": str(master), "sha256": args.expected_sha256},
        "notRealWorldMeasurement": True,
        "reportFormatVersion": REPORT_FORMAT_VERSION,
        "semanticStatus": "GAMEPLAY_DERIVED_FROM_MASTER_GEOMETRY",
        "selected": selected,
        "workerVersion": WORKER_VERSION,
    }
    write_json(output, report)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
