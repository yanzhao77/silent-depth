#!/usr/bin/env python3
"""SilentDepth 潜艇模块 FBX 导出 worker。

导出只作用于临时 Mesh/Object，不保存输入 .blend。
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import shutil
import sys
from pathlib import Path
from typing import Any, Iterable

import bpy
from mathutils import Matrix, Vector

REPORT_FORMAT_VERSION = 1
WORKER_VERSION = "1.0.0"
LOD_RATIOS = {"LOD0": 1.0, "LOD1": 0.55, "LOD2": 0.32, "LOD3": 0.18}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="SilentDepth 潜艇模块 FBX 导出 worker")
    parser.add_argument("--input", required=True)
    parser.add_argument("--assembly", required=True)
    parser.add_argument("--staging", required=True)
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--expected-sha256", required=True)
    parser.add_argument("--dry-run", action="store_true")
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


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def vector3(value: Iterable[float]) -> list[float]:
    return [round(float(component), 9) for component in value]


def euler_matrix(transform: dict[str, Any]) -> Matrix:
    translation = transform.get("translation", [0.0, 0.0, 0.0])
    rotation = transform.get("rotationDegrees", [0.0, 0.0, 0.0])
    scale = transform.get("scale", [1.0, 1.0, 1.0])
    result = Matrix.LocRotScale(
        Vector((float(translation[0]), float(translation[1]), float(translation[2]))),
        (math.radians(float(rotation[0])), math.radians(float(rotation[1])), math.radians(float(rotation[2]))),
        Vector((float(scale[0]), float(scale[1]), float(scale[2]))),
    )
    return result


def evaluated_mesh(object_item: bpy.types.Object) -> tuple[bpy.types.Object, bpy.types.Mesh]:
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = object_item.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    return evaluated, mesh


def combined_object(name: str, source_names: list[str], local_matrix: Matrix) -> bpy.types.Object:
    vertices: list[tuple[float, float, float]] = []
    faces: list[list[int]] = []
    face_material_indices: list[int] = []
    materials: list[bpy.types.Material] = []
    material_index_by_name: dict[str, int] = {}
    for source_name in source_names:
        source = bpy.data.objects.get(source_name)
        if source is None or source.type != "MESH":
            raise ValueError(f"源对象不存在或不是 Mesh：{source_name}")
        evaluated, mesh = evaluated_mesh(source)
        try:
            base = len(vertices)
            transform = local_matrix @ source.matrix_world
            vertices.extend([tuple(transform @ vertex.co) for vertex in mesh.vertices])
            slot_map: list[int] = []
            for slot in source.material_slots:
                material = slot.material
                key = material.name if material is not None else "__EMPTY_MATERIAL__"
                if key not in material_index_by_name:
                    material_index_by_name[key] = len(materials)
                    if material is not None:
                        materials.append(material)
                    else:
                        materials.append(bpy.data.materials.new("SD_EMPTY_MATERIAL"))
                slot_map.append(material_index_by_name[key])
            for polygon in mesh.polygons:
                indices = [base + int(index) for index in polygon.vertices]
                if len(indices) < 3:
                    continue
                faces.append(indices)
                mapped = slot_map[polygon.material_index] if polygon.material_index < len(slot_map) else 0
                face_material_indices.append(mapped)
        finally:
            evaluated.to_mesh_clear()
    mesh_data = bpy.data.meshes.new(name + "_Mesh")
    mesh_data.from_pydata(vertices, [], faces)
    mesh_data.update(calc_edges=True)
    for material in materials:
        mesh_data.materials.append(material)
    for index, polygon in enumerate(mesh_data.polygons):
        if index < len(face_material_indices):
            polygon.material_index = face_material_indices[index]
    object_item = bpy.data.objects.new(name, mesh_data)
    bpy.context.scene.collection.objects.link(object_item)
    return object_item


def triangle_count(object_item: bpy.types.Object) -> int:
    return sum(max(1, len(polygon.vertices) - 2) for polygon in object_item.data.polygons)


def bounds(object_item: bpy.types.Object) -> dict[str, Any]:
    corners = [object_item.matrix_world @ Vector(corner) for corner in object_item.bound_box]
    minimum = Vector((min(point.x for point in corners), min(point.y for point in corners), min(point.z for point in corners)))
    maximum = Vector((max(point.x for point in corners), max(point.y for point in corners), max(point.z for point in corners)))
    return {"max": vector3(maximum), "min": vector3(minimum)}


def apply_decimate(object_item: bpy.types.Object, ratio: float) -> None:
    if ratio >= 0.999:
        return
    bpy.context.view_layer.objects.active = object_item
    object_item.select_set(True)
    modifier = object_item.modifiers.new("SD_TEMP_LOD_DECIMATE", "DECIMATE")
    modifier.ratio = ratio
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    object_item.select_set(False)


def export_selected(path: Path, objects: list[bpy.types.Object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for object_item in objects:
        object_item.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.export_scene.fbx(
        filepath=str(path),
        use_selection=True,
        object_types={"MESH"},
        axis_forward="X",
        axis_up="Z",
        apply_unit_scale=True,
        bake_space_transform=False,
        add_leaf_bones=False,
        path_mode="AUTO",
        use_mesh_modifiers=True,
        mesh_smooth_type="FACE",
        use_tspace=True,
    )
    bpy.ops.object.select_all(action="DESELECT")


def file_entry(path: Path, relative_path: str, role: str, object_item: bpy.types.Object) -> dict[str, Any]:
    stat = path.stat()
    return {
        "bounds": bounds(object_item),
        "materialSlotCount": len(object_item.data.materials),
        "path": relative_path,
        "role": role,
        "sha256": sha256(path),
        "sizeBytes": stat.st_size,
        "triangleCount": triangle_count(object_item),
    }


def remove_temp(object_item: bpy.types.Object) -> None:
    mesh = object_item.data
    bpy.data.objects.remove(object_item, do_unlink=True)
    bpy.data.meshes.remove(mesh, do_unlink=True)


def anchor_matrix(name: str) -> Matrix:
    anchor = bpy.data.objects.get(name)
    if anchor is None:
        raise ValueError(f"缺少 Anchor：{name}")
    return anchor.matrix_world.copy()


def main() -> int:
    args = parse_args()
    input_path = Path(args.input).resolve()
    staging = Path(args.staging).resolve()
    manifest_path = Path(args.manifest).resolve()
    assembly_path = Path(args.assembly).resolve()
    if sha256(input_path) != args.expected_sha256:
        print("打开前后传入的输入 SHA-256 不一致", file=sys.stderr)
        return 5
    if Path(bpy.data.filepath).resolve() != input_path:
        print(f"Blender 当前打开文件不是目标输入：{bpy.data.filepath}", file=sys.stderr)
        return 4
    if staging.exists() and any(staging.iterdir()):
        print(f"staging 输出目录不是空目录：{staging}", file=sys.stderr)
        return 2
    assembly = load_json(assembly_path)
    files: list[dict[str, Any]] = []
    if args.dry_run:
        write_json(manifest_path, {"assetId": assembly.get("assetId"), "dryRun": True, "reportFormatVersion": REPORT_FORMAT_VERSION})
        return 0
    staging.mkdir(parents=True, exist_ok=True)
    fbx_root = staging / "FBX"
    collision_root = staging / "Collision"
    hull_sources = [str(item) for item in assembly["hull"]["sourceObjects"]]
    previous_triangles: int | None = None
    for lod, relative_path in sorted(assembly["hull"]["lods"].items()):
        obj = combined_object(f"{assembly['assetId']}_{lod}", hull_sources, Matrix.Identity(4))
        apply_decimate(obj, LOD_RATIOS[lod])
        current_triangles = triangle_count(obj)
        if previous_triangles is not None and current_triangles >= previous_triangles:
            raise ValueError(f"{lod} 三角数量没有严格递减")
        previous_triangles = current_triangles
        out_path = staging / relative_path
        export_selected(out_path, [obj])
        files.append(file_entry(out_path, relative_path, f"hull_{lod}", obj))
        remove_temp(obj)
    for part in sorted(assembly["parts"], key=lambda item: str(item["id"])):
        source_names = [str(item) for item in part.get("sourceObjects", [])]
        local = anchor_matrix(part["pivotAnchor"]).inverted()
        obj = combined_object(part["exportName"], source_names, local)
        relative_path = f"FBX/{part['exportName']}.fbx"
        out_path = staging / relative_path
        export_selected(out_path, [obj])
        entry = file_entry(out_path, relative_path, f"part:{part['id']}", obj)
        entry["anchorWorldMatrix"] = [[round(float(value), 9) for value in row] for row in anchor_matrix(part["pivotAnchor"])]
        entry["sourceObjects"] = source_names
        files.append(entry)
        remove_temp(obj)
    collision = assembly["hull"]["collision"]
    if collision.get("strategy") == "separate_fbx":
        obj = combined_object(f"{assembly['assetId']}_COLLISION", [str(item) for item in collision.get("sourceObjects", [])], Matrix.Identity(4))
        relative_path = str(collision["path"])
        out_path = staging / relative_path
        export_selected(out_path, [obj])
        files.append(file_entry(out_path, relative_path, "collision:hull", obj))
        remove_temp(obj)
    manifest = {
        "assetId": assembly.get("assetId"),
        "axis": {"axisForward": "X", "axisUp": "Z", "applyUnitScale": True, "bakeSpaceTransform": False},
        "files": files,
        "input": {"path": str(input_path), "sha256": args.expected_sha256},
        "reportFormatVersion": REPORT_FORMAT_VERSION,
        "staging": str(staging),
        "workerVersion": WORKER_VERSION,
    }
    write_json(manifest_path, manifest)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
