#!/usr/bin/env python3
"""Convertit un modele glTF/GLB vers le format packe de Rune Clash.

    python3 outils/glb_vers_rc.py monstre.glb eldiablo [dossier]

Ecrit <dossier>/eldiablo.json, .bin et les textures .webp.

Deux cas :
  * le fichier contient deja un squelette -> on retrouve les 17 os du moteur
    dans le rig d'origine et on redresse la pose de repos ;
  * le fichier n'a pas de squelette (sortie habituelle des IA 3D) -> on le
    rigue automatiquement (voir rig_auto.py).

Dans les deux cas la sortie est calee comme le corps de base du jeu :
hauteur 1,656 m, pieds au sol, bassin sur l'axe.
"""
import json
import struct
import sys
import os
import io
import base64
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rig_auto import riguer, OS as OS_MOTEUR, PARENT

MOTIFS = {
    "hips":  ["hips", "pelvis", "bassin"],
    "spine": ["spine1", "spine_01", "spine", "abdomen", "colonne"],
    "chest": ["chest", "spine2", "spine3", "spine_02", "upperchest", "torso"],
    "neck":  ["neck", "cou"],
    "head":  ["head", "tete"],
    "shL":   ["shl", "lupperarm", "leftarm", "left_arm", "upperarm_l", "arm_l", "l_upperarm", "leftupperarm"],
    "elL":   ["ell", "llowerarm", "leftforearm", "lowerarm_l", "forearm_l", "l_forearm", "leftlowerarm"],
    "haL":   ["hal", "lhand", "lefthand", "hand_l", "l_hand", "main_g"],
    "shR":   ["shr", "rupperarm", "rightarm", "right_arm", "upperarm_r", "arm_r", "r_upperarm", "rightupperarm"],
    "elR":   ["elr", "rlowerarm", "rightforearm", "lowerarm_r", "forearm_r", "r_forearm", "rightlowerarm"],
    "haR":   ["har", "rhand", "righthand", "hand_r", "r_hand", "main_d"],
    "thL":   ["thl", "lupperleg", "leftupleg", "upleg_l", "thigh_l", "l_thigh", "leftthigh", "cuisse_g"],
    "knL":   ["knl", "llowerleg", "leftleg", "leg_l", "calf_l", "shin_l", "l_calf", "leftlowerleg"],
    "ftL":   ["ftl", "lfoot", "leftfoot", "foot_l", "l_foot", "pied_g"],
    "thR":   ["thr", "rupperleg", "rightupleg", "upleg_r", "thigh_r", "r_thigh", "rightthigh", "cuisse_d"],
    "knR":   ["knr", "rlowerleg", "rightleg", "leg_r", "calf_r", "shin_r", "r_calf", "rightlowerleg"],
    "ftR":   ["ftr", "rfoot", "rightfoot", "foot_r", "r_foot", "pied_d"],
}
REPLI = {"haL": "elL", "haR": "elR", "elL": "shL", "elR": "shR", "ftL": "knL", "ftR": "knR",
         "knL": "thL", "knR": "thR", "neck": "chest", "head": "neck", "chest": "spine",
         "spine": "hips", "shL": "chest", "shR": "chest", "thL": "hips", "thR": "hips"}
TYPE_N = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}
TYPE_FMT = {5120: np.int8, 5121: np.uint8, 5122: np.int16,
            5123: np.uint16, 5125: np.uint32, 5126: np.float32}
HAUTEUR = 1.89  # meme stature que les heros proceduraux apres le +14 % de la v21


# --------------------------------------------------------------------------- #
#  lecture glTF
# --------------------------------------------------------------------------- #
def lire_glb(chemin):
    data = open(chemin, "rb").read()
    if data[:4] == b"glTF":
        pos, gltf, buf = 12, None, b""
        while pos < len(data):
            lg, kind = struct.unpack("<II", data[pos:pos + 8])
            bloc = data[pos + 8:pos + 8 + lg]
            if kind == 0x4E4F534A:
                gltf = json.loads(bloc.decode("utf-8"))
            elif kind == 0x004E4942:
                buf = bloc
            pos += 8 + lg
        return gltf, buf
    gltf = json.loads(data.decode("utf-8"))
    buf = b""
    for b in gltf.get("buffers", []):
        uri = b.get("uri", "")
        if uri.startswith("data:"):
            buf += base64.b64decode(uri.split(",", 1)[1])
        elif uri:
            buf += open(os.path.join(os.path.dirname(chemin), uri), "rb").read()
    return gltf, buf


def accesseur(gltf, buf, i):
    a = gltf["accessors"][i]
    n, comp = a["count"], TYPE_N[a["type"]]
    dt = TYPE_FMT[a["componentType"]]
    if "bufferView" not in a:
        return np.zeros((n, comp), dtype=dt)
    v = gltf["bufferViews"][a["bufferView"]]
    deb = v.get("byteOffset", 0) + a.get("byteOffset", 0)
    pas = v.get("byteStride") or np.dtype(dt).itemsize * comp
    brut = np.frombuffer(buf, dtype=np.uint8, count=pas * n, offset=deb)
    brut = brut.reshape(n, pas)[:, :np.dtype(dt).itemsize * comp]
    return np.ascontiguousarray(brut).view(dt).reshape(n, comp)


def matrices_monde(gltf):
    noeuds = gltf.get("nodes", [])
    parent = {}
    for i, nd in enumerate(noeuds):
        for c in nd.get("children", []):
            parent[c] = i

    def locale(nd):
        if "matrix" in nd:
            return np.array(nd["matrix"], dtype=np.float64).reshape(4, 4).T
        m = np.eye(4)
        if "scale" in nd:
            m = m @ np.diag(list(nd["scale"]) + [1.0])
        if "rotation" in nd:
            x, y, z, w = nd["rotation"]
            r = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w), 0],
                          [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w), 0],
                          [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y), 0],
                          [0, 0, 0, 1]], dtype=np.float64)
            m = r @ m
        if "translation" in nd:
            t = np.eye(4)
            t[:3, 3] = nd["translation"]
            m = t @ m
        return m

    cache = {}

    def monde(i):
        if i in cache:
            return cache[i]
        m = locale(noeuds[i])
        if i in parent:
            m = monde(parent[i]) @ m
        cache[i] = m
        return m

    return [monde(i) for i in range(len(noeuds))]


def norm_nom(s):
    return "".join(c for c in s.lower() if c.isalnum())


def associer_os(noms):
    plats = [norm_nom(n) for n in noms]
    pris, assoc = set(), {}
    for cible, motifs in MOTIFS.items():
        for mot in motifs:
            m = norm_nom(mot)
            cands = [i for i, p in enumerate(plats) if p.endswith(m) or p == m]
            if not cands:
                cands = [i for i, p in enumerate(plats) if m in p]
            cands = [i for i in cands if i not in pris]
            if cands:
                assoc[cible] = cands[0]
                pris.add(cands[0])
                break
    return assoc


# --------------------------------------------------------------------------- #
#  materiaux et textures
# --------------------------------------------------------------------------- #
class Textures:
    def __init__(self, gltf, buf, src, nom, dossier):
        self.gltf, self.buf, self.src, self.nom, self.dossier = gltf, buf, src, nom, dossier
        self.faits = {}
        self.eclaircir = False

    def webp(self, idx_tex):
        from PIL import Image
        if idx_tex in self.faits:
            return self.faits[idx_tex]
        t = self.gltf["textures"][idx_tex]
        img = self.gltf["images"][t["source"]]
        if "bufferView" in img:
            v = self.gltf["bufferViews"][img["bufferView"]]
            brut = self.buf[v.get("byteOffset", 0):v.get("byteOffset", 0) + v["byteLength"]]
            im = Image.open(io.BytesIO(brut))
        else:
            im = Image.open(os.path.join(os.path.dirname(self.src), img["uri"]))
        im = im.convert("RGB")
        if self.eclaircir:
            a = np.asarray(im, dtype=np.float64) / 255.0
            moy = float(a.mean())
            if 0 < moy < .14:  # texture trop sombre : on remonte un peu les noirs
                g = max(.55, min(1.0, np.log(.15) / np.log(max(moy, 1e-3))))
                a = np.clip(np.power(a, g), 0, 1)
                im = Image.fromarray((a * 255).astype(np.uint8))
                print("texture eclaircie (moyenne %.3f -> %.3f)" % (moy, float(a.mean())))
        if max(im.size) > 1024:
            r = 1024 / max(im.size)
            im = im.resize((int(im.width * r), int(im.height * r)), Image.LANCZOS)
        f = "%s_%d.webp" % (self.nom, len(self.faits))
        im.save(os.path.join(self.dossier, f), "WEBP", quality=86, method=6)
        self.faits[idx_tex] = f
        return f


def materiau(gltf, tex, p, n):
    mats = gltf.get("materials") or [{}]
    m = mats[p.get("material", 0)] if p.get("material", 0) < len(mats) else {}
    pbr = m.get("pbrMetallicRoughness", {})
    f = tex.webp(pbr["baseColorTexture"]["index"]) if "baseColorTexture" in pbr else None
    col = list(pbr.get("baseColorFactor", [1, 1, 1, 1]))[:3]
    nm = m.get("name") or ("Mat%d" % n)
    kind = "SKIN" if any(k in nm.lower() for k in ("skin", "body", "peau")) else "CLOTH"
    return {"name": nm, "kind": kind, "col": col, "shade": [c * .82 for c in col],
            "tex": f, "two": bool(m.get("doubleSided")), "blend": 0, "outW": .14, "q": 1000 + n}


# --------------------------------------------------------------------------- #
#  ecriture du format packe
# --------------------------------------------------------------------------- #

CIBLE_TRIS = 14000  # budget triangles par heros (modeles IA tres denses)


def simplifier(pos, uv, idx, cible=CIBLE_TRIS):
    """Reduit le maillage en gardant les UV (quadric edge collapse texture)."""
    nf = len(idx) // 3
    if nf <= cible * 1.15:
        return pos, uv, idx
    import pymeshlab
    ms = pymeshlab.MeshSet()
    ms.add_mesh(pymeshlab.Mesh(
        vertex_matrix=np.ascontiguousarray(pos, dtype=np.float64),
        face_matrix=np.ascontiguousarray(idx.reshape(-1, 3).astype(np.int32)),
        v_tex_coords_matrix=np.ascontiguousarray(uv, dtype=np.float64)))
    ms.compute_texcoord_transfer_vertex_to_wedge()
    for essai in range(5):  # le filtre bloque sur les coutures UV : on insiste
        avant = ms.current_mesh().face_number()
        ms.meshing_decimation_quadric_edge_collapse_with_texture(
            targetfacenum=int(cible), qualitythr=.3, extratcoordw=.2,
            preserveboundary=False, boundaryweight=.4,
            optimalplacement=True, planarquadric=True)
        apres = ms.current_mesh().face_number()
        if apres <= cible * 1.05 or apres >= avant * .97:
            break
    ms.compute_texcoord_transfer_wedge_to_vertex()
    m = ms.current_mesh()
    p2 = np.asarray(m.vertex_matrix(), dtype=np.float64)
    u2 = np.asarray(m.vertex_tex_coord_matrix(), dtype=np.float64)
    f2 = np.asarray(m.face_matrix()).reshape(-1).astype(np.uint32)
    print("  simplification %d -> %d triangles" % (nf, len(f2) // 3))
    return p2, u2, f2


def normales(pos, idx):
    """Normales de sommet calculees depuis les triangles (ponderees par l'aire)."""
    tri = idx.reshape(-1, 3).astype(np.int64)
    a, b, c = pos[tri[:, 0]], pos[tri[:, 1]], pos[tri[:, 2]]
    n = np.cross(b - a, c - a)
    out = np.zeros_like(pos)
    for k in range(3):
        np.add.at(out, tri[:, k], n)
    lg = np.linalg.norm(out, axis=1, keepdims=True)
    return out / np.where(lg < 1e-12, 1, lg)


def packer(paquets, mats, repos, nom, dossier, hauteur=HAUTEUR, echelle=None):
    os.makedirs(dossier, exist_ok=True)
    tout = np.vstack([p[0] for p in paquets])
    bas, haut = tout.min(axis=0), tout.max(axis=0)
    s = echelle if echelle else hauteur / max(1e-6, haut[1] - bas[1])
    hx, hz = float(repos["hips"][0]), float(repos["hips"][2])
    dec = np.array([-hx * s, -bas[1] * s, -hz * s])
    for p in paquets:
        p[0] = p[0] * s + dec
    for o in list(repos):
        repos[o] = np.asarray(repos[o], float) * s + dec
    print("echelle %.4f -> hauteur %.3f m, %d maillages" % (s, (haut[1] - bas[1]) * s, len(paquets)))

    tout = np.vstack([p[0] for p in paquets])
    q_o = tout.min(axis=0)
    q_s = np.maximum((tout.max(axis=0) - q_o) / 65534.0, 1e-9)
    blob, prims = bytearray(), []
    for (pos, nor, uv, oi, w, idx, mat) in paquets:
        n, ni = len(pos), len(idx)
        i32 = n > 65535
        p = {"mat": mat, "n": n, "ni": ni, "i32": i32, "pos": len(blob)}
        blob += np.clip(np.round((pos - q_o) / q_s) - 32767, -32768, 32767).astype(np.int16).tobytes()
        p["nor"] = len(blob)
        blob += np.clip(np.round(nor * 127), -127, 127).astype(np.int8).tobytes()
        p["uv"] = len(blob)
        u0, v0 = uv.min(axis=0)
        us, vs = np.maximum((uv.max(axis=0) - uv.min(axis=0)) / 65535.0, 1e-9)
        blob += np.round((uv - [u0, v0]) / [us, vs]).astype(np.uint16).tobytes()
        p["uvr"] = [float(u0), float(v0), float(us), float(vs)]
        p["j"] = len(blob)
        blob += np.ascontiguousarray(oi[:, :4].astype(np.uint8)).tobytes()
        p["w"] = len(blob)
        blob += np.ascontiguousarray(w[:, :4].astype(np.uint8)).tobytes()
        p["idx"] = len(blob)
        blob += (idx.astype(np.uint32) if i32 else idx.astype(np.uint16)).tobytes()
        while len(blob) % 4:
            blob.append(0)
        prims.append(p)

    meta = {"name": nom, "k": float(s), "flip": False,
            "q": {"o": [float(q_o[i] + 32767 * q_s[i]) for i in range(3)], "s": [float(v) for v in q_s]},
            "J": [{"n": o, "p": PARENT[o], "pos": [round(float(v), 5) for v in repos[o]]} for o in OS_MOTEUR],
            "C": {o: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0,
                      round(float(-repos[o][0]), 6), round(float(-repos[o][1]), 6),
                      round(float(-repos[o][2]), 6), 1] for o in OS_MOTEUR},
            "mats": mats, "prims": prims}
    json.dump(meta, open(os.path.join(dossier, nom + ".json"), "w"), separators=(",", ":"))
    open(os.path.join(dossier, nom + ".bin"), "wb").write(bytes(blob))
    print("ecrit %s.json + %s.bin (%d Ko, %d triangles)"
          % (nom, nom, len(blob) // 1024, sum(p["ni"] for p in prims) // 3))
    return meta


# --------------------------------------------------------------------------- #
#  chemin 1 : le modele a deja un squelette
# --------------------------------------------------------------------------- #
def convertir_rigue(gltf, buf, src, nom, dossier, hauteur, echelle):
    skin = gltf["skins"][0]
    joints = skin["joints"]
    noms = [gltf["nodes"][j].get("name", "joint%d" % j) for j in joints]
    assoc = associer_os(noms)
    if "hips" not in assoc:
        raise SystemExit("bassin introuvable dans le rig : %s" % noms[:12])
    print("os retrouves : %d/17" % len(assoc))
    mondes = matrices_monde(gltf)
    if "inverseBindMatrices" in skin:
        ibm = accesseur(gltf, buf, skin["inverseBindMatrices"]).reshape(-1, 4, 4)
        ibm = np.transpose(ibm, (0, 2, 1)).astype(np.float64)
    else:
        ibm = np.array([np.linalg.inv(mondes[j]) for j in joints])
    bind = np.array([np.linalg.inv(m) for m in ibm])
    repos = {o: np.array(bind[assoc[o]][:3, 3], float) for o in OS_MOTEUR if o in assoc}
    for o in OS_MOTEUR:
        if o not in repos:
            p = PARENT[o]
            repos[o] = repos[p].copy() if p in repos else np.zeros(3)

    trans = []
    for i in range(len(joints)):
        cible = next((o for o, k in assoc.items() if k == i), None)
        while cible and cible not in repos:
            cible = REPLI.get(cible)
        if cible is None:
            pj = bind[i][:3, 3]
            cible = min(repos, key=lambda o: float(np.sum((pj - repos[o]) ** 2)))
        R = np.eye(4)
        R[:3, 3] = repos[cible]
        trans.append((R @ np.linalg.inv(bind[i]), OS_MOTEUR.index(cible)))

    tex = Textures(gltf, buf, src, nom, dossier)
    os.makedirs(dossier, exist_ok=True)
    paquets, mats = [], []
    for mesh in gltf.get("meshes", []):
        for p in mesh.get("primitives", []):
            at = p["attributes"]
            if "POSITION" not in at or "JOINTS_0" not in at:
                continue
            pos = accesseur(gltf, buf, at["POSITION"]).astype(np.float64)
            nor = accesseur(gltf, buf, at["NORMAL"]).astype(np.float64) if "NORMAL" in at else np.zeros_like(pos)
            uv = accesseur(gltf, buf, at["TEXCOORD_0"]).astype(np.float64) if "TEXCOORD_0" in at else np.zeros((len(pos), 2))
            jo = accesseur(gltf, buf, at["JOINTS_0"]).astype(np.int32)
            we = accesseur(gltf, buf, at["WEIGHTS_0"]).astype(np.float64)
            if we.max() > 1.5:
                we = we / (65535.0 if we.max() > 255 else 255.0)
            idx = accesseur(gltf, buf, p["indices"]).reshape(-1).astype(np.uint32) if "indices" in p else np.arange(len(pos), dtype=np.uint32)
            np_pos, np_nor = np.zeros_like(pos), np.zeros_like(nor)
            for c in range(jo.shape[1]):
                w = we[:, c:c + 1]
                if not w.any():
                    continue
                for ji in np.unique(jo[:, c]):
                    sel = jo[:, c] == ji
                    if not sel.any() or int(ji) >= len(trans):
                        continue
                    M = trans[int(ji)][0]
                    pts = np.hstack([pos[sel], np.ones((sel.sum(), 1))])
                    np_pos[sel] += w[sel] * (pts @ M.T)[:, :3]
                    nn = np.hstack([nor[sel], np.zeros((sel.sum(), 1))])
                    np_nor[sel] += w[sel] * (nn @ M.T)[:, :3]
            lg = np.linalg.norm(np_nor, axis=1, keepdims=True)
            np_nor = np_nor / np.where(lg < 1e-9, 1, lg)
            oi = np.vectorize(lambda j: trans[int(j)][1] if int(j) < len(trans) else 0)(jo).astype(np.uint8)
            poids = np.clip(np.round(we * 255), 0, 255).astype(np.uint8)
            mats.append(materiau(gltf, tex, p, len(mats)))
            paquets.append([np_pos, np_nor, uv, oi, poids, idx, len(mats) - 1])
    if not paquets:
        raise SystemExit("aucun maillage rigue trouve")
    return packer(paquets, mats, repos, nom, dossier, hauteur, echelle)


# --------------------------------------------------------------------------- #
#  chemin 2 : modele brut d'IA, on le rigue
# --------------------------------------------------------------------------- #
def convertir_brut(gltf, buf, src, nom, dossier, hauteur, echelle):
    mondes = matrices_monde(gltf)
    noeud_de_mesh = {}
    for i, nd in enumerate(gltf.get("nodes", [])):
        if "mesh" in nd:
            noeud_de_mesh.setdefault(nd["mesh"], i)
    tex = Textures(gltf, buf, src, nom, dossier)
    tex.eclaircir = True
    os.makedirs(dossier, exist_ok=True)
    bruts, mats = [], []
    for mi, mesh in enumerate(gltf.get("meshes", [])):
        M = mondes[noeud_de_mesh[mi]] if mi in noeud_de_mesh and mondes else np.eye(4)
        for p in mesh.get("primitives", []):
            at = p["attributes"]
            if "POSITION" not in at:
                continue
            pos = accesseur(gltf, buf, at["POSITION"]).astype(np.float64)
            pos = (np.hstack([pos, np.ones((len(pos), 1))]) @ M.T)[:, :3]
            nor = accesseur(gltf, buf, at["NORMAL"]).astype(np.float64) if "NORMAL" in at else np.zeros_like(pos)
            nor = nor @ M[:3, :3].T
            uv = accesseur(gltf, buf, at["TEXCOORD_0"]).astype(np.float64) if "TEXCOORD_0" in at else np.zeros((len(pos), 2))
            idx = accesseur(gltf, buf, p["indices"]).reshape(-1).astype(np.uint32) if "indices" in p else np.arange(len(pos), dtype=np.uint32)
            avant = len(pos)
            pos, uv, idx = simplifier(pos, uv, idx)
            if len(pos) != avant:
                nor = np.zeros_like(pos)  # recalculees plus bas
            m = materiau(gltf, tex, p, len(mats))
            m["kind"] = "MESH"  # garde la texture telle quelle
            mats.append(m)
            bruts.append([pos, nor, uv, idx, len(mats) - 1])
    if not bruts:
        raise SystemExit("aucun maillage dans le fichier")

    tout = np.vstack([b[0] for b in bruts])
    etendue = tout.max(axis=0) - tout.min(axis=0)
    if etendue[1] < max(etendue[0], etendue[2]) * .9:
        axe = int(np.argmax(etendue))
        print("modele couche sur l'axe %d : redressement" % axe)
        R = np.array([[1, 0, 0], [0, 0, 1], [0, -1, 0]], float) if axe == 2 \
            else np.array([[0, 1, 0], [-1, 0, 0], [0, 0, 1]], float)
        for b in bruts:
            b[0] = b[0] @ R.T
            b[1] = b[1] @ R.T

    tailles = [len(b[0]) for b in bruts]
    decal, idx_global = 0, []
    for b in bruts:
        idx_global.append(b[3] + decal)
        decal += len(b[0])
    pos_tout = np.vstack([b[0] for b in bruts])
    nor_tout = np.vstack([b[1] for b in bruts])
    npos, repos, W, nnor = riguer(pos_tout, np.concatenate(idx_global), nor_tout)
    ordre = np.argsort(-W, axis=1)[:, :4]
    w4 = np.take_along_axis(W, ordre, axis=1)
    w4 = w4 / np.maximum(w4.sum(axis=1, keepdims=True), 1e-9)
    paquets, d = [], 0
    for (pos, nor, uv, idx, mat), n in zip(bruts, tailles):
        sl = slice(d, d + n)
        nn = nnor[sl]
        if float(np.linalg.norm(nn, axis=1).mean()) < .5:  # le fichier n'avait pas de normales
            nn = normales(npos[sl], idx)
        paquets.append([npos[sl], nn, uv, ordre[sl].astype(np.uint8),
                        np.clip(np.round(w4[sl] * 255), 0, 255).astype(np.uint8), idx, mat])
        d += n
    return packer(paquets, mats, repos, nom, dossier, hauteur, echelle)


def convertir(src, nom, dossier="models", hauteur=HAUTEUR, echelle=None):
    gltf, buf = lire_glb(src)
    if gltf.get("skins"):
        return convertir_rigue(gltf, buf, src, nom, dossier, hauteur, echelle)
    print("pas de squelette dans le fichier : rigging automatique")
    return convertir_brut(gltf, buf, src, nom, dossier, hauteur, echelle)


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(__doc__)
        raise SystemExit(1)
    convertir(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else "models")
