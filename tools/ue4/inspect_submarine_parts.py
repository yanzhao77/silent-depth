import json
import struct

import numpy as np


path = r"E:\workspace\githubDownloads\silent-depth\public\assets\v3\models\hero-submarine-lod0.glb"
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


def node_local_matrix(node):
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


nodes = gltf.get("nodes", [])
roots = set(range(len(nodes)))
for nd in nodes:
    for c in nd.get("children", []):
        roots.discard(c)
world = {}


def walk(i, parent, pathname):
    m = parent @ node_local_matrix(nodes[i])
    world[i] = (m, pathname)
    for c in nodes[i].get("children", []):
        walk(c, m, pathname + "/" + str(nodes[c].get("name", c)))


for r in roots:
    walk(r, np.eye(4, dtype=np.float32), str(nodes[r].get("name", r)))

keywords = ("periscope", "bow", "propeller", "screw", "tail", "stern",
            "rudder", "rail", "sail", "conning", "plane", "keel", "aft", "stern")
print("%-34s %-28s %s" % ("node", "world_pos(X,Y,Z)", "in world-mesh?"))
for i, (m, pn) in world.items():
    nm = nodes[i].get("name", "")
    if any(k in nm.lower() for k in keywords):
        pos = m[:3, 3]
        print("%-34s (%7.2f, %7.2f, %7.2f)  %s" % (nm, pos[0], pos[1], pos[2], "mesh" if "mesh" in nodes[i] else ""))
