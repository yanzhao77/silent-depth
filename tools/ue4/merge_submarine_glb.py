import json
import struct

import numpy as np


SRC = r"E:\workspace\githubDownloads\silent-depth\public\assets\v3\models\hero-submarine-lod0.glb"
DST = r"C:\workspace\ue4\SilentDepthUE\Content\SourceAssets\hero-submarine-lod0-merged.glb"


def read_glb(path):
    with open(path, "rb") as f:
        data = f.read()
    magic, version, _length = struct.unpack_from("<III", data, 0)
    assert magic == 0x46546C67, "not a GLB"
    offset = 12
    json_data = None
    bin_data = b""
    while offset < len(data):
        chunk_len, chunk_type = struct.unpack_from("<II", data, offset)
        offset += 8
        chunk = data[offset:offset + chunk_len]
        offset += chunk_len
        if chunk_type == 0x4E4F534A:  # JSON
            json_data = json.loads(chunk.decode("utf-8"))
        elif chunk_type in (0x004E4942,):  # BIN
            bin_data = chunk
    return json_data, bin_data


def write_glb(path, gltf, bin_data):
    js = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    # Pad chunk lengths to 4 bytes.
    js += b" " * ((4 - len(js) % 4) % 4)
    bin_data += b"\x00" * ((4 - len(bin_data) % 4) % 4)
    total = 12 + 8 + len(js) + 8 + len(bin_data)
    with open(path, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, total))
        f.write(struct.pack("<II", len(js), 0x4E4F534A))
        f.write(js)
        f.write(struct.pack("<II", len(bin_data), 0x004E4942))
        f.write(bin_data)
    print("wrote", path, "bytes", total)


COMP = {
    5120: np.int8,
    5121: np.uint8,
    5122: np.int16,
    5123: np.uint16,
    5125: np.uint32,
    5126: np.float32,
}
NCOMP = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}


def read_accessor(gltf, bin_data, idx):
    acc = gltf["accessors"][idx]
    bv = gltf["bufferViews"][acc["bufferView"]]
    comp = COMP[acc["componentType"]]
    n = NCOMP[acc["type"]]
    count = acc["count"]
    start = bv.get("byteOffset", 0) + acc.get("byteOffset", 0)
    stride = bv.get("byteStride", comp().itemsize * n)
    arr = np.frombuffer(bin_data, dtype=np.uint8, count=count * stride, offset=start)
    arr = arr.reshape(count, stride).view(comp)[:, :n].astype(np.float32)
    return arr


def node_local_matrix(node):
    if "matrix" in node:
        m = np.array(node["matrix"], dtype=np.float32).reshape(4, 4).T
        return m
    t = node.get("translation", [0, 0, 0])
    r = node.get("rotation", [0, 0, 0, 1])  # x,y,z,w
    s = node.get("scale", [1, 1, 1])
    x, y, z, w = r
    rot = np.array([
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
    ], dtype=np.float32)
    m = np.eye(4, dtype=np.float32)
    m[:3, :3] = rot * np.array(s, dtype=np.float32)
    m[:3, 3] = t
    return m


gltf, bin_data = read_glb(SRC)
nodes = gltf.get("nodes", [])
children = {}
roots = set(range(len(nodes)))
for i, nd in enumerate(nodes):
    for c in nd.get("children", []):
        children.setdefault(i, []).append(c)
        roots.discard(c)

world = {}


def walk(i, parent):
    m = parent @ node_local_matrix(nodes[i])
    world[i] = m
    for c in nodes[i].get("children", []):
        walk(c, m)


for root in roots:
    walk(root, np.eye(4, dtype=np.float32))

# Gather per-material merged geometry.
materials = gltf.get("materials", [])
by_material = {}
world_min = np.array([1e30, 1e30, 1e30], np.float32)
world_max = np.array([-1e30, -1e30, -1e30], np.float32)
for i, nd in enumerate(nodes):
    if "mesh" not in nd:
        continue
    node_name = str(nd.get("name", ""))
    name_l = node_name.lower()
    # Remove the old standalone propeller disc (hub + five blades) from the
    # hull mesh.  The propeller shaft is kept so the bow-to-stern hull stays
    # contiguous; the new independent SM_Propeller spins at the stern tip.
    if name_l.startswith("propeller-blade") or name_l.startswith("propeller-hub"):
        continue
    mesh = gltf["meshes"][nd["mesh"]]
    w = world.get(i, np.eye(4, dtype=np.float32))
    rot = w[:3, :3]
    normal_mat = np.linalg.inv(rot).T
    for prim in mesh.get("primitives", []):
        mat = prim.get("material", 0)
        pos = read_accessor(gltf, bin_data, prim["attributes"]["POSITION"])
        norm = None
        if "NORMAL" in prim["attributes"]:
            norm = read_accessor(gltf, bin_data, prim["attributes"]["NORMAL"])
        idx = None
        if "indices" in prim:
            acc = gltf["accessors"][prim["indices"]]
            comp = COMP[acc["componentType"]]
            bv = gltf["bufferViews"][acc["bufferView"]]
            start = bv.get("byteOffset", 0) + acc.get("byteOffset", 0)
            raw = np.frombuffer(bin_data, dtype=comp, count=acc["count"], offset=start)
            idx = raw.astype(np.int64)
        else:
            idx = np.arange(len(pos), dtype=np.int64)
        # Bake world transform into vertex positions.
        pos4 = np.hstack([pos, np.ones((len(pos), 1), np.float32)])
        pos_t = (w @ pos4.T).T[:, :3]
        norm_t = (normal_mat @ norm.T).T if norm is not None else np.zeros_like(pos_t)
        world_min = np.minimum(world_min, pos_t.min(axis=0))
        world_max = np.maximum(world_max, pos_t.max(axis=0))
        bucket = by_material.setdefault(mat, {"pos": [], "nrm": [], "idx": [], "base": 0})
        base = bucket["base"]
        bucket["pos"].append(pos_t)
        bucket["nrm"].append(norm_t)
        bucket["idx"].append(idx + base)
        bucket["base"] = base + len(pos_t)

print("materials used:", sorted(by_material.keys()))
print("world-space bbox min:", [round(float(v), 3) for v in world_min])
print("world-space bbox max:", [round(float(v), 3) for v in world_max])
print("world-space dims:", [round(float(world_max[k] - world_min[k]), 3) for k in range(3)])
prims = []
accs = []
views = []
bin_bytes = bytearray()


def add_view(arr_bytes, stride=None):
    views.append({
        "buffer": 0,
        "byteOffset": len(bin_bytes),
        "byteLength": len(arr_bytes),
    } if stride is None else {
        "buffer": 0,
        "byteOffset": len(bin_bytes),
        "byteLength": len(arr_bytes),
        "byteStride": stride,
    })
    bin_bytes.extend(arr_bytes)
    return len(views) - 1


for mat in sorted(by_material.keys()):
    b = by_material[mat]
    pos = np.concatenate(b["pos"]).astype(np.float32)
    nrm = np.concatenate(b["nrm"]).astype(np.float32)
    idx = np.concatenate(b["idx"]).astype(np.uint32)
    pos_view = add_view(pos.tobytes())
    nrm_view = add_view(nrm.tobytes())
    idx_view = add_view(idx.tobytes())
    pos_acc = len(accs)
    accs.append({"bufferView": pos_view, "componentType": 5126, "count": len(pos), "type": "VEC3"})
    nrm_acc = len(accs)
    accs.append({"bufferView": nrm_view, "componentType": 5126, "count": len(nrm), "type": "VEC3"})
    idx_acc = len(accs)
    accs.append({"bufferView": idx_view, "componentType": 5125, "count": len(idx), "type": "SCALAR"})
    prims.append({
        "attributes": {"POSITION": pos_acc, "NORMAL": nrm_acc},
        "indices": idx_acc,
        "material": mat,
    })

out_gltf = {
    "asset": gltf.get("asset", {"version": "2.0"}),
    "scene": 0,
    "scenes": [{"nodes": [0], "name": "HeroSubmarine"}],
    "nodes": [{"name": "HeroSubmarine", "mesh": 0}],
    "meshes": [{"name": "HeroSubmarine", "primitives": prims}],
    "materials": materials,
    "accessors": accs,
    "bufferViews": views,
    "buffers": [{"byteLength": len(bin_bytes)}],
}
write_glb(DST, out_gltf, bytes(bin_bytes))
print("merged verts:", sum(c["base"] for c in by_material.values()))
