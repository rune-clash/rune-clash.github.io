#!/usr/bin/env python3
"""Exporte un modele packe de Rune Clash vers un .glb rigue standard.

    python3 outils/rc_vers_glb.py models/male.json sortie.glb

Sert a deux choses : verifier le convertisseur inverse (aller-retour), et
fournir aux outils 3D (Meshy, Blender, Mixamo) le corps de base du jeu comme
reference de proportions.
"""
import json
import os
import struct
import sys
import numpy as np

OS_MOTEUR = ["hips", "spine", "chest", "neck", "head", "shL", "elL", "haL",
             "shR", "elR", "haR", "thL", "knL", "ftL", "thR", "knR", "ftR"]


def charger(meta_path):
    meta = json.load(open(meta_path))
    bin_path = meta_path[:-5] + ".bin"
    buf = open(bin_path, "rb").read()
    q = meta.get("q")
    prims = []
    for p in meta["prims"]:
        n = p["n"]
        if q:
            qp = np.frombuffer(buf, np.int16, n * 3, p["pos"]).reshape(n, 3).astype(np.float64)
            pos = np.array(q["o"]) + qp * np.array(q["s"])
            qn = np.frombuffer(buf, np.int8, n * 3, p["nor"]).reshape(n, 3).astype(np.float64)
            lg = np.linalg.norm(qn, axis=1, keepdims=True)
            nor = qn / np.where(lg < 1e-9, 1, lg)
            r = p["uvr"]
            qu = np.frombuffer(buf, np.uint16, n * 2, p["uv"]).reshape(n, 2).astype(np.float64)
            uv = np.array(r[:2]) + qu * np.array(r[2:])
        else:
            pos = np.frombuffer(buf, np.float32, n * 3, p["pos"]).reshape(n, 3).astype(np.float64)
            nor = np.frombuffer(buf, np.float32, n * 3, p["nor"]).reshape(n, 3).astype(np.float64)
            uv = np.frombuffer(buf, np.float32, n * 2, p["uv"]).reshape(n, 2).astype(np.float64)
        jo = np.frombuffer(buf, np.uint8, n * 4, p["j"]).reshape(n, 4)
        we = np.frombuffer(buf, np.uint8, n * 4, p["w"]).reshape(n, 4).astype(np.float64)
        s = we.sum(axis=1, keepdims=True)
        we = we / np.where(s < 1e-9, 1, s)
        idx = np.frombuffer(buf, np.uint32 if p["i32"] else np.uint16, p["ni"], p["idx"]).astype(np.uint32)
        prims.append({"pos": pos, "nor": nor, "uv": uv, "j": jo, "w": we, "idx": idx, "mat": p["mat"]})
    return meta, prims


def exporter(meta_path, sortie):
    meta, prims = charger(meta_path)
    noms = [j["n"] for j in meta["J"]]
    bin_blob = bytearray()
    accessors, views = [], []

    def ajouter(arr, comp_type, type_str, cible=None):
        global_off = len(bin_blob)
        data = arr.tobytes()
        bin_blob.extend(data)
        while len(bin_blob) % 4:
            bin_blob.append(0)
        views.append({"buffer": 0, "byteOffset": global_off, "byteLength": len(data)})
        a = {"bufferView": len(views) - 1, "componentType": comp_type,
             "count": len(arr), "type": type_str}
        if type_str == "VEC3" and comp_type == 5126:
            a["min"] = arr.min(axis=0).tolist()
            a["max"] = arr.max(axis=0).tolist()
        accessors.append(a)
        return len(accessors) - 1

    meshes = []
    for p in prims:
        at = {"POSITION": ajouter(p["pos"].astype(np.float32), 5126, "VEC3"),
              "NORMAL": ajouter(p["nor"].astype(np.float32), 5126, "VEC3"),
              "TEXCOORD_0": ajouter(p["uv"].astype(np.float32), 5126, "VEC2"),
              "JOINTS_0": ajouter(p["j"].astype(np.uint8), 5121, "VEC4"),
              "WEIGHTS_0": ajouter(p["w"].astype(np.float32), 5126, "VEC4")}
        meshes.append({"primitives": [{"attributes": at,
                                       "indices": ajouter(p["idx"].astype(np.uint32), 5125, "SCALAR")}]})

    # squelette : un noeud par os, translation locale
    noeuds = []
    pos_monde = {j["n"]: j["pos"] for j in meta["J"]}
    for j in meta["J"]:
        par = j["p"]
        base = pos_monde[par] if par else [0, 0, 0]
        noeuds.append({"name": j["n"],
                       "translation": [j["pos"][i] - base[i] for i in range(3)],
                       "children": []})
    for i, j in enumerate(meta["J"]):
        if j["p"]:
            noeuds[noms.index(j["p"])]["children"].append(i)
    for nd in noeuds:
        if not nd["children"]:
            del nd["children"]
    ibm = np.array([np.array([[1, 0, 0, -pos_monde[n][0]], [0, 1, 0, -pos_monde[n][1]],
                              [0, 0, 1, -pos_monde[n][2]], [0, 0, 0, 1]], dtype=np.float32).T
                    for n in noms], dtype=np.float32).reshape(len(noms), 16)
    ibm_acc = ajouter(ibm, 5126, "MAT4")

    racine = len(noeuds)
    noeuds.append({"name": "modele", "mesh": 0, "skin": 0})
    for i in range(1, len(meshes)):
        noeuds.append({"name": "modele%d" % i, "mesh": i, "skin": 0})
    gltf = {"asset": {"version": "2.0", "generator": "Rune Clash"},
            "scene": 0,
            "scenes": [{"nodes": [0] + list(range(racine, racine + len(meshes)))}],
            "nodes": noeuds,
            "meshes": meshes,
            "skins": [{"joints": list(range(len(noms))), "inverseBindMatrices": ibm_acc, "skeleton": 0}],
            "accessors": accessors,
            "bufferViews": views,
            "buffers": [{"byteLength": len(bin_blob)}]}
    js = json.dumps(gltf, separators=(",", ":")).encode()
    while len(js) % 4:
        js += b" "
    blob = bytes(bin_blob)
    total = 12 + 8 + len(js) + 8 + len(blob)
    with open(sortie, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, total))
        f.write(struct.pack("<II", len(js), 0x4E4F534A))
        f.write(js)
        f.write(struct.pack("<II", len(blob), 0x004E4942))
        f.write(blob)
    print("ecrit", sortie, "%d Ko" % (total // 1024), "%d os" % len(noms), "%d maillages" % len(meshes))


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(__doc__)
        raise SystemExit(1)
    exporter(sys.argv[1], sys.argv[2])
