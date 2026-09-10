import json
import struct

import numpy as np


SRC = r"E:\workspace\githubDownloads\silent-depth\public\assets\v3\models\hero-submarine-lod0.glb"
DST = r"C:\workspace\ue4\SilentDepthUE\Content\SourceAssets\hero-submarine-propeller.glb"


def read_glb(path):
    with open(path, "rb") as f:
        data = f.read()
    _, _, _ = struct.unpack_from("<III", data, 0)
    off = 12
    gltf = None
    bin_data = b""
    while off < len(data):
        clen, ctype = struct.unpack_from("<II", data, off)
        off += 8
        chunk = data[off:off + clen]
        off += clen
        if ctype == 0x4E4F534A:
            gltf = json.loads(chunk.decode("utf-8"))
        elif ctype == 0x004E4942:
            bin_data = chunk
    return gltf, bin_data


def write_glb(path, gltf, bin_data):
    js = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    js += b" " * ((4 - len(js) % 4) % 4)
    bin_data += b"\x00" * ((4 - len(bin_data) % 4) % 4)
    total = 12 + 8 + len(js) + 8 + len(bin_data)
    with open(path, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, total))
        f.write(struct.pack("<II", len(js), 0x4E4F534A))
        f.write(js)
        f.write(struct.pack("<II", len(bin_data), 0x004E4942))
        f.write(bin_data)


COMP = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16,
        5125: np.uint32, 5126: np.float32}
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
    return arr.reshape(count, stride).view(comp)[:, :n].astype(np.float32)


def node_local(node):
    if "matrix" in node:
        return np.array(node["matrix"], dtype=np.float32).reshape(4, 4).T
    t = node.get("translation", [0, 0, 0])
    r = node.get("rotation", [0, 0, 0, 1])
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
    m = parent @ node_local(nodes[i])
    world[i] = m
    for c in nodes[i].get("children", []):
        walk(c, m)


for r in roots:
    walk(r, np.eye(4, dtype=np.float32))

HUB = np.array([0.0, 0.0, -10.04], np.float32)
by_mat = {}
for i, nd in enumerate(nodes):
    if "mesh" not in nd or "propeller" not in str(nd.get("name", "")).lower():
        continue
    w = world.get(i, np.eye(4, dtype=np.float32))
    rot = w[:3, :3]
    nm = np.linalg.inv(rot).T
    for prim in gltf["meshes"][nd["mesh"]].get("primitives", []):
        mat = prim.get("material", 0)
        pos = read_accessor(gltf, bin_data, prim["attributes"]["POSITION"])
        norm = None
        if "NORMAL" in prim["attributes"]:
            norm = read_accessor(gltf, bin_data, prim["attributes"]["NORMAL"])
        pos4 = np.hstack([pos, np.ones((len(pos), 1), np.float32)])
        pos_t = (w @ pos4.T).T[:, :3]
        pos_t = HUB + (pos_t - HUB) * 2.0          # 2x around hub
        pos_t = pos_t - HUB                        # centre pivot at hub
        norm_t = (nm @ norm.T).T if norm is not None else np.zeros_like(pos_t)
        acc = gltf["accessors"][prim["indices"]] if "indices" in prim else None
        comp = COMP[acc["componentType"]] if acc else np.int32
        if acc:
            bvv = gltf["bufferViews"][acc["bufferView"]]
            start = bvv.get("byteOffset", 0) + acc.get("byteOffset", 0)
            idx = np.frombuffer(bin_data, dtype=comp, count=acc["count"], offset=start).astype(np.int64)
        else:
            idx = np.arange(len(pos_t), dtype=np.int64)
        b = by_mat.setdefault(mat, {"pos": [], "nrm": [], "idx": [], "base": 0})
        base = b["base"]
        b["pos"].append(pos_t); b["nrm"].append(norm_t); b["idx"].append(idx + base)
        b["base"] = base + len(pos_t)

prims = []
accs = []
views = []
blob = bytearray()


def add_view(bytes_):
    views.append({"buffer": 0, "byteOffset": len(blob), "byteLength": len(bytes_)})
    blob.extend(bytes_)
    return len(views) - 1


for mat in sorted(by_mat):
    b = by_mat[mat]
    pos = np.concatenate(b["pos"]).astype(np.float32)
    nrm = np.concatenate(b["nrm"]).astype(np.float32)
    idx = np.concatenate(b["idx"]).astype(np.uint32)
    pv = add_view(pos.tobytes()); nv = add_view(nrm.tobytes()); iv = add_view(idx.tobytes())
    pa = len(accs); accs.append({"bufferView": pv, "componentType": 5126, "count": len(pos), "type": "VEC3"})
    na = len(accs); accs.append({"bufferView": nv, "componentType": 5126, "count": len(nrm), "type": "VEC3"})
    ia = len(accs); accs.append({"bufferView": iv, "componentType": 5125, "count": len(idx), "type": "SCALAR"})
    prims.append({"attributes": {"POSITION": pa, "NORMAL": na}, "indices": ia, "material": mat})

out = {
    "asset": gltf.get("asset", {"version": "2.0"}),
    "scene": 0,
    "scenes": [{"nodes": [0], "name": "Propeller"}],
    "nodes": [{"name": "Propeller", "mesh": 0}],
    "meshes": [{"name": "Propeller", "primitives": prims}],
    "materials": gltf.get("materials", []),
    "accessors": accs,
    "bufferViews": views,
    "buffers": [{"byteLength": len(blob)}],
}
write_glb(DST, out, bytes(blob))
print("wrote", DST, "prims", len(prims))
