import json
import struct
import sys


path = r"E:\workspace\githubDownloads\silent-depth\public\assets\v3\models\hero-submarine-lod0.glb"
with open(path, "rb") as f:
    data = f.read()

# GLB: 12-byte header, then chunks. First chunk is JSON.
magic, version, length = struct.unpack_from("<III", data, 0)
chunk_len, chunk_type = struct.unpack_from("<II", data, 12)
json_bytes = data[20:20 + chunk_len]
gltf = json.loads(json_bytes.decode("utf-8"))

print("asset:", gltf.get("asset", {}).get("generator", "?"))
print("nodes:", len(gltf.get("nodes", [])), "meshes:", len(gltf.get("meshes", [])))

# Global bounding box from POSITION accessors of all mesh primitives,
# transformed by node world matrices (approx). We gather raw accessor bounds first.
accessors = gltf.get("accessors", [])
v_min = [1e30, 1e30, 1e30]
v_max = [-1e30, -1e30, -1e30]
for mesh in gltf.get("meshes", []):
    for prim in mesh.get("primitives", []):
        pos = prim.get("attributes", {}).get("POSITION")
        if pos is None:
            continue
        acc = accessors[pos]
        if "min" in acc and "max" in acc:
            for i in range(3):
                v_min[i] = min(v_min[i], acc["min"][i])
                v_max[i] = max(v_max[i], acc["max"][i])

dims = [v_max[i] - v_min[i] for i in range(3)]
print("POSITION bounds (raw, gltf Y-up):")
print("  min =", [round(x, 3) for x in v_min])
print("  max =", [round(x, 3) for x in v_max])
print("  dims =", [round(x, 3) for x in dims])

# Node transforms (scale/rotation) at root level.
for i, node in enumerate(gltf.get("nodes", [])[:6]):
    print("  node[%d] name=%r translation=%s rotation=%s scale=%s matrix=%s" % (
        i,
        node.get("name"),
        node.get("translation"),
        node.get("rotation"),
        node.get("scale"),
        node.get("matrix"),
    ))

# Materials/material slots.
print("materials:", [m.get("name") for m in gltf.get("materials", [])])
print("images:", len(gltf.get("images", [])), "textures:", len(gltf.get("textures", [])))
