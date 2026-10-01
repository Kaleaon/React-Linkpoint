#!/usr/bin/env python3
"""Extract the default avatar skeleton (data only) from Lumiya's recovered sources.

Usage: extract-lumiya-skeleton.py <lumiya-redux checkout> > src/linkpoint/avatar-data/skeleton.json
Only numeric/structural data is emitted; no Lumiya code is copied.
"""
import json, re, sys
root = sys.argv[1] + "/recovered/src/com/lumiyaviewer/lumiya/slproto/avatar/"
ids = open(root + "SLSkeletonBoneID.java").read()
enum = {}
last = -1
# jadx replaces some inlined integer constants with unrelated names (e.g. Vr...ErrorCode.*).
# Those entries continue the sequential animated index (checked against the smali: mTail3 = 0x77).
for m in re.finditer(r"^\s+(\w+)\((true|false), (true|false), (-?\d+|[\w.]+)\)[,;]", ids, re.M):
    raw = m.group(4)
    idx = int(raw) if re.fullmatch(r"-?\d+", raw) else last + 1
    if idx >= 0:
        assert idx == last + 1, (m.group(1), idx, last)
        last = idx
    enum[m.group(1)] = {"isJoint": m.group(2) == "true", "extended": m.group(3) == "true", "animIndex": idx}
assert last == 132 and enum["mTail3"]["animIndex"] == 119
src = open(root + "SLDefaultSkeleton.java").read()
vec = r"new LLVector3\(([-\d.eE]+)f, ([-\d.eE]+)f, ([-\d.eE]+)f\)"
bones, var = {}, {}
for m in re.finditer(r"SLSkeletonBone (\w+) = new SLSkeletonBone\(SLSkeletonBoneID\.(\w+), " + vec + ", " + vec + r", (null|new SLSkeletonBone\[\]\{[^}]*\}), (null|new SLSkeletonBone\[\]\{[^}]*\})\);", src):
    v, name = m.group(1), m.group(2)
    f = lambda a: [float(m.group(i)) for i in range(a, a + 3)]
    kids = [] if m.group(9) == "null" else re.findall(r"sLSkeletonBone\d*", m.group(9))
    cols = [] if m.group(10) == "null" else re.findall(r"sLSkeletonBone\d*", m.group(10))
    var[v] = name
    bones[name] = {"position": f(3), "basePosition": f(6), "children": kids, "collision": cols, **enum[name]}
for m in re.finditer(r"(sLSkeletonBone\d*)\.deform\(new LLVector3\(\), " + vec + r"\);", src):
    bones[var[m.group(1)]]["scale"] = [float(m.group(i)) for i in (2, 3, 4)]
for b in bones.values():
    b["children"] = [var[c] for c in b["children"]]
    b["collision"] = [var[c] for c in b["collision"]]
root_name = re.search(r"this\.rootBone = (sLSkeletonBone\d*);", src).group(1)
aliases = {m.group(1): m.group(2) for m in re.finditer(r'\.put\("(\w+)", (\w+)\)', ids)}
assert all(v in bones for v in aliases.values())
print(json.dumps({"root": var[root_name], "aliases": aliases, "bones": bones}, indent=1))
