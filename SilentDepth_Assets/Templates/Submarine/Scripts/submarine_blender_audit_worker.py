#!/usr/bin/env python3
"""SilentDepth 潜艇 MASTER 只读审计 worker。

该脚本只在 Blender 后台进程内读取当前已打开的 .blend，不调用保存 API。
"""

from __future__ import annotations

import argparse
import fnmatch
import hashlib
import json
import math
import platform
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Iterable

import bpy
from mathutils import Matrix, Vector

REPORT_FORMAT_VERSION = 1
WORKER_VERSION = "1.0.0"
STATUSES = {"PASS", "WARNING", "ERROR", "SKIPPED", "NOT_VERIFIED"}
THRESHOLDS = {
    "zeroLengthEdgeMeters": 1.0e-6,
    "degenerateFaceAreaSquareMeters": 1.0e-10,
    "nearZeroScale": 1.0e-6,
    "unappliedScaleTolerance": 1.0e-4,
    "normalizedAxisTolerance": 0.001,
    "farAnchorHullDiagonalMultiplier": 2.0,
    "exampleLimit": 12,
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="SilentDepth 潜艇 MASTER 只读审计 worker")
    parser.add_argument("--master", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--mode", choices=["inventory-only", "assembly"], required=True)
    parser.add_argument("--assembly")
    parser.add_argument("--expected-sha256", required=True)
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(argv)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def stable_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(sort_deep(data), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def sort_deep(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: sort_deep(value[key]) for key in sorted(value.keys())}
    if isinstance(value, list):
        return [sort_deep(item) for item in value]
    return value


def sorted_names(values: Iterable[Any]) -> list[str]:
    return sorted([str(value) for value in values])


def issue(
    rule_id: str,
    status: str,
    message: str,
    context: dict[str, Any] | None = None,
    object_name: str | None = None,
    collection_name: str | None = None,
) -> dict[str, Any]:
    if status not in STATUSES:
        raise ValueError(f"未知状态：{status}")
    result: dict[str, Any] = {
        "blocksExport": status == "ERROR",
        "context": context or {},
        "message": message,
        "ruleId": rule_id,
        "status": status,
    }
    if object_name is not None:
        result["objectName"] = object_name
    if collection_name is not None:
        result["collectionName"] = collection_name
    return result


def vector3(value: Iterable[float]) -> list[float]:
    return [round(float(component), 9) for component in value]


def matrix_has_shear(matrix: Matrix) -> bool:
    vectors = [Vector((matrix[0][index], matrix[1][index], matrix[2][index])) for index in range(3)]
    normalized = [value.normalized() if value.length > 0 else value for value in vectors]
    return any(abs(normalized[left].dot(normalized[right])) > 1.0e-5 for left in range(3) for right in range(left + 1, 3))


def collection_paths() -> dict[str, list[str]]:
    by_name: dict[str, list[str]] = defaultdict(list)

    def walk(collection: bpy.types.Collection, prefix: str) -> None:
        path = collection.name if not prefix else f"{prefix}/{collection.name}"
        by_name[collection.name].append(path)
        for child in sorted(collection.children, key=lambda item: item.name):
            walk(child, path)

    for scene in sorted(bpy.data.scenes, key=lambda item: item.name):
        walk(scene.collection, "")
    return by_name


def object_collection_paths(object_item: bpy.types.Object, paths_by_name: dict[str, list[str]]) -> list[str]:
    paths: list[str] = []
    for collection in object_item.users_collection:
        paths.extend(paths_by_name.get(collection.name, [collection.name]))
    return sorted(set(paths))


def collection_inventory(paths_by_name: dict[str, list[str]]) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    for collection in sorted(bpy.data.collections, key=lambda item: item.name):
        for path in paths_by_name.get(collection.name, [collection.name]):
            entries.append(
                {
                    "childCollections": sorted_names(child.name for child in collection.children),
                    "name": collection.name,
                    "objectCount": len(collection.objects),
                    "objects": sorted_names(object_item.name for object_item in collection.objects),
                    "path": path,
                }
            )
    return sorted(entries, key=lambda item: item["path"])


def object_bounds_world(object_item: bpy.types.Object) -> dict[str, Any] | None:
    if object_item.type not in {"MESH", "EMPTY", "CURVE", "SURFACE", "META", "FONT"}:
        return None
    corners = [object_item.matrix_world @ Vector(corner) for corner in object_item.bound_box]
    if not corners:
        return None
    minimum = Vector((min(corner.x for corner in corners), min(corner.y for corner in corners), min(corner.z for corner in corners)))
    maximum = Vector((max(corner.x for corner in corners), max(corner.y for corner in corners), max(corner.z for corner in corners)))
    return {
        "max": vector3(maximum),
        "min": vector3(minimum),
    }


def object_inventory(paths_by_name: dict[str, list[str]]) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    for object_item in sorted(bpy.data.objects, key=lambda item: item.name):
        location, rotation, scale = object_item.matrix_world.decompose()
        entries.append(
            {
                "boundsWorld": object_bounds_world(object_item),
                "collections": object_collection_paths(object_item, paths_by_name),
                "dataName": object_item.data.name if getattr(object_item, "data", None) is not None else None,
                "dimensions": vector3(object_item.dimensions),
                "hideRender": bool(object_item.hide_render),
                "hidden": bool(object_item.hide_get()),
                "localLocation": vector3(object_item.location),
                "localRotationEuler": vector3(object_item.rotation_euler),
                "localScale": vector3(object_item.scale),
                "materialSlotCount": len(object_item.material_slots),
                "modifierCount": len(object_item.modifiers),
                "name": object_item.name,
                "parent": object_item.parent.name if object_item.parent else None,
                "type": object_item.type,
                "worldLocation": vector3(location),
                "worldRotationEuler": vector3(rotation.to_euler()),
                "worldScale": vector3(scale),
            }
        )
    return entries


def external_dependencies(master: Path) -> dict[str, Any]:
    paths: list[dict[str, Any]] = []
    for raw_path in sorted(str(path) for path in bpy.utils.blend_paths(absolute=True)):
        path = Path(raw_path)
        paths.append({"exists": path.exists(), "path": str(path)})
    libraries = [
        {"filepath": library.filepath, "name": library.name, "resolvedPath": str((master.parent / library.filepath).resolve())}
        for library in sorted(bpy.data.libraries, key=lambda item: item.name)
    ]
    missing = sorted([entry["path"] for entry in paths if not entry["exists"]])
    return {
        "dependencies": paths,
        "hasLinkedLibraries": len(libraries) > 0,
        "linkedLibraries": libraries,
        "missingFiles": missing,
        "missingFileCount": len(missing),
    }


def whole_mesh_bounds() -> dict[str, Any] | None:
    corners: list[Vector] = []
    for object_item in bpy.data.objects:
        if object_item.type != "MESH":
            continue
        corners.extend([object_item.matrix_world @ Vector(corner) for corner in object_item.bound_box])
    if not corners:
        return None
    minimum = Vector((min(corner.x for corner in corners), min(corner.y for corner in corners), min(corner.z for corner in corners)))
    maximum = Vector((max(corner.x for corner in corners), max(corner.y for corner in corners), max(corner.z for corner in corners)))
    diagonal = (maximum - minimum).length
    return {"diagonal": round(float(diagonal), 9), "max": vector3(maximum), "min": vector3(minimum)}


def mesh_quality_issues() -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    depsgraph = bpy.context.evaluated_depsgraph_get()
    issues: list[dict[str, Any]] = []
    summaries: list[dict[str, Any]] = []
    mesh_users: dict[str, list[str]] = defaultdict(list)

    for object_item in sorted(bpy.data.objects, key=lambda item: item.name):
        if object_item.type != "MESH":
            continue
        if object_item.data is not None:
            mesh_users[object_item.data.name].append(object_item.name)
        try:
            evaluated = object_item.evaluated_get(depsgraph)
            mesh = evaluated.to_mesh()
        except Exception as exc:  # noqa: BLE001 - Blender modifier errors vary by data-block type.
            issues.append(issue("SUBMOD-022-MODIFIER_EVAL_FAILED", "ERROR", "Modifier 或 evaluated mesh 评估失败", {"error": str(exc)}, object_item.name))
            continue
        try:
            object_issues, summary = inspect_mesh_object(object_item, mesh)
            issues.extend(object_issues)
            summaries.append(summary)
        finally:
            evaluated.to_mesh_clear()

    for mesh_name, users in sorted(mesh_users.items()):
        if len(users) > 1:
            issues.append(
                issue(
                    "SUBMOD-022-DUPLICATE_MESH_DATABLOCK",
                    "WARNING",
                    "重复 Mesh 数据块实例",
                    {"meshDataName": mesh_name, "objects": sorted(users)},
                )
            )

    return sorted_issues(issues), sorted(summaries, key=lambda item: item["objectName"])


def inspect_mesh_object(object_item: bpy.types.Object, mesh: bpy.types.Mesh) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    issues: list[dict[str, Any]] = []
    vertex_count = len(mesh.vertices)
    edge_count = len(mesh.edges)
    face_count = len(mesh.polygons)
    if vertex_count == 0:
        issues.append(issue("SUBMOD-022-NO_VERTICES", "ERROR", "Mesh 没有顶点", {}, object_item.name))
    if face_count == 0 and not object_item.hide_render:
        issues.append(issue("SUBMOD-022-NO_FACES", "WARNING", "可视 Mesh 没有面", {}, object_item.name))

    non_finite_vertices = [index for index, vertex in enumerate(mesh.vertices) if not all(math.isfinite(value) for value in vertex.co)]
    if non_finite_vertices:
        issues.append(
            issue(
                "SUBMOD-022-NON_FINITE_VERTEX",
                "ERROR",
                "Mesh 存在非有限顶点坐标",
                {"vertexIndices": limited(non_finite_vertices), "count": len(non_finite_vertices)},
                object_item.name,
            )
        )

    zero_edges = [index for index, edge in enumerate(mesh.edges) if (mesh.vertices[edge.vertices[0]].co - mesh.vertices[edge.vertices[1]].co).length <= THRESHOLDS["zeroLengthEdgeMeters"]]
    if zero_edges:
        issues.append(issue("SUBMOD-022-ZERO_LENGTH_EDGE", "WARNING", "Mesh 存在零长度边", {"edgeIndices": limited(zero_edges), "count": len(zero_edges)}, object_item.name))

    degenerate_faces = [index for index, polygon in enumerate(mesh.polygons) if polygon.area <= THRESHOLDS["degenerateFaceAreaSquareMeters"]]
    if degenerate_faces:
        issues.append(issue("SUBMOD-022-DEGENERATE_FACE", "WARNING", "Mesh 存在退化面或接近零面积面", {"faceIndices": limited(degenerate_faces), "count": len(degenerate_faces)}, object_item.name))

    if len(object_item.material_slots) == 0:
        issues.append(issue("SUBMOD-022-NO_MATERIAL_SLOT", "WARNING", "Mesh 未分配材质槽", {}, object_item.name))
    empty_material_faces = [
        index
        for index, polygon in enumerate(mesh.polygons)
        if polygon.material_index < 0 or polygon.material_index >= len(object_item.material_slots) or object_item.material_slots[polygon.material_index].material is None
    ]
    if empty_material_faces:
        issues.append(
            issue(
                "SUBMOD-022-EMPTY_MATERIAL_SLOT_FACE",
                "WARNING",
                "面引用空材质槽",
                {"faceIndices": limited(empty_material_faces), "count": len(empty_material_faces)},
                object_item.name,
            )
        )

    negative_axes = [axis for axis, value in zip(["x", "y", "z"], object_item.scale) if value < 0]
    if negative_axes:
        issues.append(issue("SUBMOD-022-NEGATIVE_SCALE", "WARNING", "对象存在负尺度", {"axes": negative_axes}, object_item.name))
    near_zero_axes = [axis for axis, value in zip(["x", "y", "z"], object_item.scale) if abs(value) <= THRESHOLDS["nearZeroScale"]]
    if near_zero_axes:
        issues.append(issue("SUBMOD-022-NEAR_ZERO_SCALE", "ERROR", "对象存在接近零的缩放", {"axes": near_zero_axes}, object_item.name))
    unapplied_axes = [axis for axis, value in zip(["x", "y", "z"], object_item.scale) if abs(abs(value) - 1.0) > THRESHOLDS["unappliedScaleTolerance"]]
    if unapplied_axes:
        issues.append(issue("SUBMOD-022-UNAPPLIED_SCALE", "WARNING", "对象存在未应用的非单位缩放", {"axes": unapplied_axes}, object_item.name))

    edge_face_counts = face_count_by_edge(mesh.polygons)
    non_manifold_edges = [edge for edge, count in edge_face_counts.items() if count != 2]
    loose_vertices, loose_edges = loose_geometry(mesh, edge_face_counts)
    if non_manifold_edges:
        issues.append(issue("SUBMOD-022-NON_MANIFOLD_EDGE", "WARNING", "Mesh 存在非流形边", {"count": len(non_manifold_edges), "examples": limited_pairs(non_manifold_edges)}, object_item.name))
    if loose_vertices:
        issues.append(issue("SUBMOD-022-LOOSE_VERTEX", "WARNING", "Mesh 存在松散顶点", {"count": len(loose_vertices), "vertexIndices": limited(loose_vertices)}, object_item.name))
    if loose_edges:
        issues.append(issue("SUBMOD-022-LOOSE_EDGE", "WARNING", "Mesh 存在松散边", {"count": len(loose_edges), "edgeIndices": limited(loose_edges)}, object_item.name))

    normals_invalid = [index for index, polygon in enumerate(mesh.polygons) if not all(math.isfinite(value) for value in polygon.normal)]
    if normals_invalid:
        issues.append(issue("SUBMOD-022-NORMAL_INVALID", "ERROR", "法线评估异常", {"faceIndices": limited(normals_invalid)}, object_item.name))
    if matrix_has_shear(object_item.matrix_world):
        issues.append(issue("SUBMOD-023-TRANSFORM_SHEAR", "WARNING", "对象世界矩阵存在剪切", {}, object_item.name))

    return issues, {
        "degenerateFaceCount": len(degenerate_faces),
        "edgeCount": edge_count,
        "faceCount": face_count,
        "looseEdgeCount": len(loose_edges),
        "looseVertexCount": len(loose_vertices),
        "nonManifoldEdgeCount": len(non_manifold_edges),
        "objectName": object_item.name,
        "vertexCount": vertex_count,
        "zeroLengthEdgeCount": len(zero_edges),
    }


def face_count_by_edge(polygons: Iterable[bpy.types.MeshPolygon]) -> Counter[tuple[int, int]]:
    counts: Counter[tuple[int, int]] = Counter()
    for polygon in polygons:
        vertices = list(polygon.vertices)
        for index, first in enumerate(vertices):
            second = vertices[(index + 1) % len(vertices)]
            counts[tuple(sorted((int(first), int(second))))] += 1
    return counts


def loose_geometry(mesh: bpy.types.Mesh, used_edges: Counter[tuple[int, int]]) -> tuple[list[int], list[int]]:
    used_vertices = {vertex for edge in used_edges for vertex in edge}
    loose_vertices = [index for index in range(len(mesh.vertices)) if index not in used_vertices]
    loose_edges = [index for index, edge in enumerate(mesh.edges) if tuple(sorted((int(edge.vertices[0]), int(edge.vertices[1])))) not in used_edges]
    return loose_vertices, loose_edges


def limited(values: list[int]) -> list[int]:
    return values[: int(THRESHOLDS["exampleLimit"])]


def limited_pairs(values: list[tuple[int, int]]) -> list[list[int]]:
    return [[first, second] for first, second in values[: int(THRESHOLDS["exampleLimit"])]]


def load_assembly(path: Path | None) -> dict[str, Any] | None:
    if path is None:
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def match_object_reference(reference: str, object_names: set[str]) -> list[str]:
    if any(token in reference for token in ["*", "?", "["]):
        return sorted(name for name in object_names if fnmatch.fnmatchcase(name, reference))
    return [reference] if reference in object_names else []


def assembly_issues(assembly: dict[str, Any] | None, paths_by_name: dict[str, list[str]], bounds: dict[str, Any] | None) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    if assembly is None:
        return (
            [issue("SUBMOD-021-025-SKIPPED_MISSING_ASSEMBLY", "SKIPPED", "缺少真实 Assembly，Assembly 相关检查已跳过", {"reason": "SKIPPED_MISSING_ASSEMBLY"})],
            [],
            empty_anchor_candidates(bounds),
        )

    object_names = {object_item.name for object_item in bpy.data.objects}
    object_by_name = {object_item.name: object_item for object_item in bpy.data.objects}
    collection_objects = collection_object_map(paths_by_name)
    issues: list[dict[str, Any]] = []
    matches: list[dict[str, Any]] = []
    owners: dict[str, str] = {}

    def register(owner: str, object_name: str) -> None:
        previous = owners.get(object_name)
        if previous is not None and previous != owner:
            issues.append(issue("SUBMOD-021-DUPLICATE_OWNERSHIP", "ERROR", "同一源对象被重复拥有", {"objectName": object_name, "firstOwner": previous, "owner": owner}, object_name))
        owners[object_name] = owner

    def match_objects(owner: str, references: Iterable[str]) -> list[str]:
        owned: list[str] = []
        for reference in references:
            matched = match_object_reference(reference, object_names)
            wildcard = any(token in reference for token in ["*", "?", "["])
            matches.append({"matchedObjects": matched, "message": "源对象匹配成功" if matched else "源对象匹配为空", "owner": owner, "reference": reference, "status": "WARNING" if matched and wildcard else "PASS" if matched else "ERROR"})
            if not matched:
                issues.append(issue("SUBMOD-021-EMPTY_OBJECT_MATCH", "ERROR", "源对象匹配为空", {"owner": owner, "reference": reference}))
            if wildcard:
                issues.append(issue("SUBMOD-021-WILDCARD_OBJECT_MATCH", "WARNING", "源对象使用通配匹配", {"owner": owner, "reference": reference, "matchedObjects": matched}))
            owned.extend(matched)
        return owned

    def match_collections(owner: str, references: Iterable[str]) -> list[str]:
        owned: list[str] = []
        for reference in references:
            matched = collection_objects.get(reference, [])
            matches.append({"matchedObjects": matched, "message": "Collection 匹配成功" if matched else "Collection 匹配为空或不存在", "owner": owner, "reference": reference, "status": "PASS" if matched else "ERROR"})
            if not matched:
                issues.append(issue("SUBMOD-021-EMPTY_COLLECTION_MATCH", "ERROR", "Collection 匹配为空或不存在", {"owner": owner, "reference": reference}))
            owned.extend(matched)
        return owned

    hull = assembly.get("hull", {})
    for name in match_objects("hull", hull.get("sourceObjects", [])) + match_collections("hull", hull.get("sourceCollections", [])):
        register("hull", name)
    collision = hull.get("collision", {})
    for name in match_objects("hull.collision", collision.get("sourceObjects", [])):
        object_item = object_by_name.get(name)
        if object_item is not None and object_item.type != "MESH":
            issues.append(issue("SUBMOD-021-COLLISION_TYPE", "ERROR", "Hull Collision 源对象必须是 Mesh", {"type": object_item.type}, name))

    for part in sorted(assembly.get("parts", []), key=lambda item: item.get("id", "")):
        part_id = part.get("id", "")
        owner = f"part:{part_id}"
        owned = match_objects(owner, part.get("sourceObjects", [])) + match_collections(owner, part.get("sourceCollections", []))
        for name in owned:
            register(owner, name)
            object_item = object_by_name.get(name)
            if object_item is not None and object_item.type != "MESH":
                issues.append(issue("SUBMOD-021-SOURCE_OBJECT_TYPE", "ERROR", "Part 源对象必须是 Mesh", {"owner": owner, "type": object_item.type}, name))
            if name.startswith(("UCX_", "UBX_", "USP_", "UCP_")):
                issues.append(issue("SUBMOD-021-COLLISION_VISUAL_OWNERSHIP", "ERROR", "Collision 对象被可视 Part 错误拥有", {"owner": owner}, name))
        pivot_name = part.get("pivotAnchor", "")
        if pivot_name not in object_by_name:
            issues.append(issue("SUBMOD-023-PIVOT_MISSING", "ERROR", "Part Pivot Anchor 不存在", {"partId": part_id, "pivotAnchor": pivot_name}))
        axis = part.get("motion", {}).get("axis", [0.0, 0.0, 0.0])
        issues.extend(axis_issues("SUBMOD-023", part_id, axis))

    known_parts = {part.get("id") for part in assembly.get("parts", [])}
    for socket in sorted(assembly.get("sockets", []), key=lambda item: item.get("id", "")):
        anchor = socket.get("sourceAnchor", "")
        if anchor not in object_by_name:
            issues.append(issue("SUBMOD-023-SOCKET_MISSING", "ERROR", "Socket Anchor 不存在", {"socketId": socket.get("id"), "sourceAnchor": anchor}))
        parent = socket.get("parent", "")
        if parent != "root" and parent not in known_parts:
            issues.append(issue("SUBMOD-023-SOCKET_PARENT_MISSING", "ERROR", "Socket parent 不存在", {"socketId": socket.get("id"), "parent": parent}))

    anchors = [anchor_report(object_item, bounds) for object_item in sorted(bpy.data.objects, key=lambda item: item.name) if object_item.name in {part.get("pivotAnchor") for part in assembly.get("parts", [])} or object_item.name in {socket.get("sourceAnchor") for socket in assembly.get("sockets", [])}]
    return sorted_issues(issues), sorted(matches, key=lambda item: f"{item['owner']}:{item['reference']}"), anchors


def collection_object_map(paths_by_name: dict[str, list[str]]) -> dict[str, list[str]]:
    result: dict[str, list[str]] = {}
    for collection in bpy.data.collections:
        objects = sorted(object_item.name for object_item in collection.objects)
        for path in paths_by_name.get(collection.name, [collection.name]):
            result[path] = objects
    return result


def axis_issues(rule_prefix: str, part_id: str, axis: list[float]) -> list[dict[str, Any]]:
    if len(axis) != 3 or not all(isinstance(value, (int, float)) and math.isfinite(float(value)) for value in axis):
        return [issue(f"{rule_prefix}-AXIS_INVALID", "ERROR", "运动轴不是 3 个有限数字", {"partId": part_id, "axis": axis})]
    length = math.sqrt(sum(float(value) * float(value) for value in axis))
    if length <= THRESHOLDS["zeroLengthEdgeMeters"]:
        return [issue(f"{rule_prefix}-ZERO_LENGTH_AXIS", "ERROR", "运动轴为零长度", {"partId": part_id, "axis": axis, "length": length})]
    if abs(length - 1.0) > THRESHOLDS["normalizedAxisTolerance"]:
        return [issue(f"{rule_prefix}-NON_NORMALIZED_AXIS", "WARNING", "运动轴未归一化", {"partId": part_id, "axis": axis, "length": length})]
    return []


def empty_anchor_candidates(bounds: dict[str, Any] | None) -> list[dict[str, Any]]:
    candidates = []
    for object_item in sorted(bpy.data.objects, key=lambda item: item.name):
        upper = object_item.name.upper()
        if object_item.type == "EMPTY" or upper.startswith(("SOCKET_", "PIVOT_", "ANCHOR_")):
            candidates.append(anchor_report(object_item, bounds, candidate_only=True))
    return candidates


def anchor_report(object_item: bpy.types.Object, bounds: dict[str, Any] | None, candidate_only: bool = False) -> dict[str, Any]:
    location, rotation, scale = object_item.matrix_world.decompose()
    distance_from_origin = location.length
    far = False
    if bounds is not None:
        diagonal = float(bounds["diagonal"])
        far = diagonal > 0 and distance_from_origin > diagonal * THRESHOLDS["farAnchorHullDiagonalMultiplier"]
    return {
        "candidateOnly": candidate_only,
        "distanceFromOrigin": round(float(distance_from_origin), 9),
        "farFromWholeHullBounds": far,
        "hasNegativeScale": any(value < 0 for value in scale),
        "hasShear": matrix_has_shear(object_item.matrix_world),
        "localLocation": vector3(object_item.location),
        "localRotationEuler": vector3(object_item.rotation_euler),
        "localScale": vector3(object_item.scale),
        "name": object_item.name,
        "parent": object_item.parent.name if object_item.parent else None,
        "type": object_item.type,
        "worldLocation": vector3(location),
        "worldRotationEuler": vector3(rotation.to_euler()),
        "worldScale": vector3(scale),
    }


def sorted_issues(values: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(values, key=lambda item: f"{item.get('ruleId', '')}:{item.get('objectName', '')}:{item.get('collectionName', '')}:{item.get('message', '')}")


def environment_report(master: Path) -> dict[str, Any]:
    return {
        "blender": {
            "buildBranch": bpy.app.build_branch.decode("utf-8", errors="replace") if isinstance(bpy.app.build_branch, bytes) else str(bpy.app.build_branch),
            "buildHash": bpy.app.build_hash.decode("utf-8", errors="replace") if isinstance(bpy.app.build_hash, bytes) else str(bpy.app.build_hash),
            "savedFileVersion": list(getattr(bpy.data, "version", [])) if getattr(bpy.data, "version", None) is not None else None,
            "version": list(bpy.app.version),
            "versionString": bpy.app.version_string,
        },
        "platform": {
            "machine": platform.machine(),
            "platform": platform.platform(),
            "system": platform.system(),
        },
        "python": {"version": sys.version.replace("\n", " ")},
        "sourceFile": str(master),
    }


def scene_report(paths_by_name: dict[str, list[str]]) -> dict[str, Any]:
    active_scene = bpy.context.scene
    unit = active_scene.unit_settings
    return {
        "activeScene": active_scene.name,
        "collections": collection_inventory(paths_by_name),
        "counts": {
            "collectionCount": len(bpy.data.collections),
            "emptyObjectCount": sum(1 for object_item in bpy.data.objects if object_item.type == "EMPTY"),
            "materialCount": len(bpy.data.materials),
            "meshObjectCount": sum(1 for object_item in bpy.data.objects if object_item.type == "MESH"),
            "objectCount": len(bpy.data.objects),
            "sceneCount": len(bpy.data.scenes),
        },
        "coordinateSystem": {"blenderForward": "+X", "blenderUp": "+Z", "unrealConversion": "1 Blender meter = 100 Unreal Units"},
        "materials": sorted_names(material.name for material in bpy.data.materials),
        "objects": object_inventory(paths_by_name),
        "scenes": sorted_names(scene.name for scene in bpy.data.scenes),
        "unitSettings": {
            "lengthUnit": unit.length_unit,
            "scaleLength": unit.scale_length,
            "system": unit.system,
        },
        "wholeMeshBounds": whole_mesh_bounds(),
    }


def main() -> int:
    args = parse_args()
    master = Path(args.master).resolve()
    output = Path(args.output).resolve()
    if not master.exists() or master.suffix != ".blend":
        print(f"MASTER 不存在或不是 .blend：{master}", file=sys.stderr)
        return 2
    if sha256(master) != args.expected_sha256:
        print("打开前后传入的 MASTER SHA-256 不一致", file=sys.stderr)
        return 5
    if Path(bpy.data.filepath).resolve() != master:
        print(f"Blender 当前打开文件不是目标 MASTER：{bpy.data.filepath}", file=sys.stderr)
        return 4

    assembly = load_assembly(Path(args.assembly).resolve()) if args.assembly else None
    paths_by_name = collection_paths()
    scene = scene_report(paths_by_name)
    mesh_issues, mesh_summaries = mesh_quality_issues()
    assembly_check_issues, matches, anchors = assembly_issues(assembly, paths_by_name, scene["wholeMeshBounds"])
    all_issues = sorted_issues(mesh_issues + assembly_check_issues)
    summary = {
        "errorCount": sum(1 for item in all_issues if item["status"] == "ERROR"),
        "notVerifiedCount": sum(1 for item in all_issues if item["status"] == "NOT_VERIFIED"),
        "skippedCount": sum(1 for item in all_issues if item["status"] == "SKIPPED"),
        "warningCount": sum(1 for item in all_issues if item["status"] == "WARNING"),
    }
    report = {
        "assemblyAudit": {
            "anchorReports": anchors,
            "matches": matches,
            "status": "SKIPPED_MISSING_ASSEMBLY" if assembly is None else "AUDITED",
        },
        "auditMode": args.mode,
        "environment": environment_report(master),
        "issues": all_issues,
        "master": {
            "assetId": master.name.removesuffix("_MASTER.blend"),
            "path": str(master),
            "sha256": args.expected_sha256,
        },
        "meshQuality": {"objects": mesh_summaries, "thresholds": THRESHOLDS},
        "reportFormatVersion": REPORT_FORMAT_VERSION,
        "scene": scene,
        "summary": summary,
        "workerVersion": WORKER_VERSION,
        "externalDependencies": external_dependencies(master),
    }
    stable_json(output, report)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
