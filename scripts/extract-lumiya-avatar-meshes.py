#!/usr/bin/env python3
"""Extract the base avatar body meshes (geometry only) from Lumiya's recovered assets.

Usage: extract-lumiya-avatar-meshes.py <lumiya-redux checkout> <out dir>

The .lbm files use a big-endian header and morph/joint tables, with little-endian
raw vertex data. Morph targets (shape sliders) are skipped; the joint map is
translated to skeleton bone names. Output per mesh:
  <name>.bin = float32 position[3n], normal[3n], uv[2n], weight[n]; uint16 index[3f]
plus meshes.json describing counts and the joint names.
"""
import json, re, struct, sys, os
lumiya, out = sys.argv[1], sys.argv[2]
chars = lumiya + "/recovered/android/assets/character/"
ids = open(lumiya + "/recovered/src/com/lumiyaviewer/lumiya/slproto/avatar/SLSkeletonBoneID.java").read()
ordinals = [m.group(1) for m in re.finditer(r"^\s+(\w+)\((?:true|false), (?:true|false), [^)]+\)[,;]", ids, re.M)]

class Reader:
    def __init__(self, data): self.d, self.o = data, 0
    def take(self, n):
        v = self.d[self.o:self.o + n]
        assert len(v) == n, "truncated"
        self.o += n
        return v
    def be(self, fmt):
        size = struct.calcsize(">" + fmt)
        return struct.unpack(">" + fmt, self.take(size))
    def le(self, fmt, count):
        return struct.unpack("<%d%s" % (count, fmt), self.take(count * struct.calcsize(fmt)))

def load(name, extra=None):
    r = Reader(open(chars + name + ".lbm", "rb").read())
    r2 = Reader(open(chars + extra, "rb").read()) if extra else None
    r.be("3f"); r.be("3f"); r.be("4f")  # header transform (unused by the viewer)
    has_weights = r.be("b")[0] != 0
    n = r.be("i")[0]
    verts = r.le("f", n * 6)
    uvs = r.le("f", n * 2)
    weights = r.le("f", n) if has_weights else [0.0] * n
    faces = r.be("i")[0]
    indices = r.le("H", faces * 3)
    assert max(indices) < n, name + ": index out of range"
    morphs = r.be("i")[0]
    cur, count = r, 0
    for _ in range(morphs):
        if count >= 50 and r2 is not None:
            cur, count = r2, 0
        cur.be("i")                      # visual param id
        cur.be("b")                      # masked
        mv = cur.be("i")[0]
        cur.take(mv * 24 + mv * 8 + mv * 4)
        count += 1
    joint_count = cur.be("i")[0]
    joints = list(cur.be("%di" % joint_count)) if joint_count else []
    names = [ordinals[j] for j in joints]
    return {
        "vertexCount": n, "faceCount": faces, "hasWeights": has_weights, "jointNames": names,
        "position": [verts[i * 6 + k] for i in range(n) for k in range(3)],
        "normal": [verts[i * 6 + 3 + k] for i in range(n) for k in range(3)],
        "uv": list(uvs), "weight": list(weights), "index": list(indices),
    }

PARTS = {
    "hair": ("avatar_hair", None), "head": ("avatar_head", "avatar_head.lbm_0"),
    "eyelashes": ("avatar_eyelashes", None), "upperBody": ("avatar_upper_body", None),
    "lowerBody": ("avatar_lower_body", None), "eye": ("avatar_eye", None), "skirt": ("avatar_skirt", None),
}
os.makedirs(out, exist_ok=True)
meta = {}
for part, (name, extra) in PARTS.items():
    m = load(name, extra)
    n, f = m["vertexCount"], m["faceCount"]
    blob = struct.pack("<%df" % (n * 3), *m["position"]) + struct.pack("<%df" % (n * 3), *m["normal"]) \
        + struct.pack("<%df" % (n * 2), *m["uv"]) + struct.pack("<%df" % n, *m["weight"]) + struct.pack("<%dH" % (f * 3), *m["index"])
    open(os.path.join(out, part + ".bin"), "wb").write(blob)
    meta[part] = {"vertexCount": n, "faceCount": f, "hasWeights": m["hasWeights"], "jointNames": m["jointNames"]}
json.dump(meta, open(os.path.join(out, "meshes.json"), "w"), indent=1)
print({k: (v["vertexCount"], v["faceCount"], len(v["jointNames"])) for k, v in meta.items()})
