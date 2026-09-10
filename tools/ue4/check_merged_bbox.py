import json
import struct

import numpy as np


path = r"C:\workspace\ue4\SilentDepthUE\Content\SourceAssets\hero-submarine-lod0-merged.glb"
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

COMP = {5126: np.float32, 5123: np.uint16, 5125: np.uint32,
        5120: np.int8, 5121: np.uint8, 5122: np.int16}
NCOMP = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}


def read_accessor(idx):
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


vmin = np.array([1e30, 1e30, 1e30], np.float32)
vmax = np.array([-1e30, -1e30, -1e30], np.float32)
total = 0
for mesh in gltf.get("meshes", []):
    for prim in mesh.get("primitives", []):
        p = read_accessor(prim["attributes"]["POSITION"])
        vmin = np.minimum(vmin, p.min(axis=0))
        vmax = np.maximum(vmax, p.max(axis=0))
        total += len(p)

print("merged GLB verts=%d" % total)
print("min =", [round(float(v), 3) for v in vmin])
print("max =", [round(float(v), 3) for v in vmax])
print("dims =", [round(float(vmax[k] - vmin[k]), 3) for k in range(3)])
print("Z min (stern side should be ~ -10.25):", round(float(vmin[2]), 3))
