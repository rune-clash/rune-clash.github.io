#!/usr/bin/env python3
"""Riguer automatiquement un maillage humanoide pour Rune Clash.

Les IA 3D gratuites (TRELLIS, Meshy...) rendent un maillage sans squelette.
Ce module :
  1. devine les 17 os du moteur a partir de la geometrie (coupes horizontales,
     detection des bras et des jambes) ;
  2. calcule les poids de peau (distance aux segments d'os, puis lissage) ;
  3. remet le maillage dans la pose de repos du jeu (bras le long du corps),
     pour que les animations existantes marchent sans retouche.

Utilisable seul pour diagnostiquer :
    python3 outils/rig_auto.py modele.glb
"""
import numpy as np

OS = ["hips", "spine", "chest", "neck", "head", "shL", "elL", "haL",
      "shR", "elR", "haR", "thL", "knL", "ftL", "thR", "knR", "ftR"]
PARENT = {"hips": None, "spine": "hips", "chest": "spine", "neck": "chest", "head": "neck",
          "shL": "chest", "elL": "shL", "haL": "elL",
          "shR": "chest", "elR": "shR", "haR": "elR",
          "thL": "hips", "knL": "thL", "ftL": "knL",
          "thR": "hips", "knR": "thR", "ftR": "knR"}
# squelette de reference du jeu (corps masculin), hauteur 1.656
BASE = {"hips": [0, .95, 0], "spine": [0, 1.082, .001], "chest": [0, 1.157, -.003],
        "neck": [0, 1.372, -.017], "head": [0, 1.456, -.004],
        "shL": [.139, 1.323, -.006], "elL": [.151, 1.117, -.004], "haL": [.175, .884, .015],
        "shR": [-.139, 1.323, -.006], "elR": [-.151, 1.117, -.004], "haR": [-.175, .884, .015],
        "thL": [.08, .909, -.004], "knL": [.059, .544, -.01], "ftL": [.047, .114, -.04],
        "thR": [-.08, .909, -.004], "knR": [-.059, .544, -.01], "ftR": [-.047, .114, -.04]}
BASE_H = 1.656


def _tranche(pos, y0, y1):
    s = pos[(pos[:, 1] >= y0) & (pos[:, 1] < y1)]
    return s


def fit_squelette(pos):
    """Place les 17 os dans le repere du maillage (suppose debout, Y vers le haut)."""
    H = pos[:, 1].max() - pos[:, 1].min()
    y0 = pos[:, 1].min()
    J = {}

    def rel(f):
        return y0 + f * H

    # --- tronc : centre des tranches centrales -------------------------------
    def centre(yf, bande=.04, max_x=None):
        s = _tranche(pos, rel(yf - bande), rel(yf + bande))
        if max_x is not None and len(s):
            s = s[np.abs(s[:, 0] - np.median(pos[:, 0])) < max_x]
        if not len(s):
            return np.array([0, rel(yf), 0], dtype=float)
        return np.array([np.median(s[:, 0]), rel(yf), np.median(s[:, 2])])

    larg = np.percentile(np.abs(pos[:, 0] - np.median(pos[:, 0])), 98)
    J["hips"] = centre(.53, .03, larg * .6)
    J["spine"] = centre(.63, .03, larg * .6)
    J["chest"] = centre(.72, .03, larg * .6)
    J["neck"] = centre(.845, .02, larg * .4)
    J["head"] = centre(.90, .03, larg * .5)

    # --- bras : les points les plus lateraux au-dessus de la taille ----------
    haut = pos[pos[:, 1] > rel(.45)]
    cx = np.median(pos[:, 0])
    for cote, signe in (("L", 1), ("R", -1)):
        lat = haut[(haut[:, 0] - cx) * signe > 0]
        if not len(lat):
            lat = haut
        seuil = np.percentile((lat[:, 0] - cx) * signe, 88)
        bras = lat[(lat[:, 0] - cx) * signe >= seuil]
        if len(bras) < 20:
            bras = lat
        # axe du bras par ACP
        c = bras.mean(axis=0)
        u, s, vt = np.linalg.svd(bras - c, full_matrices=False)
        axe = vt[0]
        t = (bras - c) @ axe
        a, b = bras[t.argmin()], bras[t.argmax()]
        # l'epaule est l'extremite la plus proche de l'axe du corps
        if abs(a[0] - cx) > abs(b[0] - cx):
            a, b = b, a
        epaule = a * .82 + J["chest"] * .18
        main = b * .94 + a * .06
        J["sh" + cote] = np.array([epaule[0], epaule[1], epaule[2]])
        J["ha" + cote] = np.array(main)
        J["el" + cote] = (J["sh" + cote] + J["ha" + cote]) / 2

    # --- jambes --------------------------------------------------------------
    bas = pos[pos[:, 1] < rel(.52)]
    for cote, signe in (("L", 1), ("R", -1)):
        jam = bas[(bas[:, 0] - cx) * signe >= 0]
        if len(jam) < 20:
            jam = bas
        hanche_x = cx + signe * max(1e-3, np.percentile(np.abs(jam[:, 0] - cx), 55) * .75)
        pied = jam[jam[:, 1] < rel(.08)]
        px = np.median(pied[:, 0]) if len(pied) else hanche_x
        pz = np.median(pied[:, 2]) if len(pied) else J["hips"][2]
        J["th" + cote] = np.array([hanche_x, J["hips"][1] - H * .02, J["hips"][2]])
        J["ft" + cote] = np.array([px, rel(.055), pz])
        J["kn" + cote] = (J["th" + cote] + J["ft" + cote]) / 2 + np.array([0, 0, H * .01])
    return J


def _dist_segment(p, a, b):
    ab = b - a
    t = np.clip(((p - a) @ ab) / max(1e-9, ab @ ab), 0, 1)
    proj = a + np.outer(t, ab)
    return np.linalg.norm(p - proj, axis=1)


def poids(pos, J, idx=None, lissages=3, k=4):
    """Poids de peau : inverse de la distance aux segments d'os, puis lissage."""
    segs = []
    for o in OS:
        p = PARENT[o]
        a = J[p] if p else J[o] + np.array([0, -.05, 0])
        segs.append((np.asarray(a, float), np.asarray(J[o], float)))
    D = np.stack([_dist_segment(pos, a, b) for a, b in segs], axis=1)
    W = 1.0 / np.power(D + 1e-3, 3.2)
    # ne garder que les k os les plus proches
    ordre = np.argsort(-W, axis=1)
    masque = np.zeros_like(W, dtype=bool)
    np.put_along_axis(masque, ordre[:, :k], True, axis=1)
    W = np.where(masque, W, 0)
    W /= W.sum(axis=1, keepdims=True)

    if idx is not None and lissages:
        tri = idx.reshape(-1, 3)
        a = np.concatenate([tri[:, 0], tri[:, 1], tri[:, 2], tri[:, 1], tri[:, 2], tri[:, 0]])
        b = np.concatenate([tri[:, 1], tri[:, 2], tri[:, 0], tri[:, 0], tri[:, 1], tri[:, 2]])
        n = len(pos)
        cnt = np.bincount(a, minlength=n).astype(float)[:, None]
        cnt[cnt == 0] = 1
        for _ in range(lissages):
            acc = np.zeros_like(W)
            np.add.at(acc, a, W[b])
            W = .5 * W + .5 * (acc / cnt)
            W /= W.sum(axis=1, keepdims=True)
    return W


def _rot_entre(u, v):
    u = u / max(1e-9, np.linalg.norm(u))
    v = v / max(1e-9, np.linalg.norm(v))
    c = float(np.dot(u, v))
    if c > .9999:
        return np.eye(3)
    if c < -.9999:
        axe = np.cross(u, [1, 0, 0])
        if np.linalg.norm(axe) < 1e-6:
            axe = np.cross(u, [0, 1, 0])
        axe /= np.linalg.norm(axe)
        return -np.eye(3) + 2 * np.outer(axe, axe)
    a = np.cross(u, v)
    s = np.linalg.norm(a)
    K = np.array([[0, -a[2], a[1]], [a[2], 0, -a[0]], [-a[1], a[0], 0]])
    return np.eye(3) + K + K @ K * ((1 - c) / (s * s))


def repos_cible(J):
    """Squelette cible : directions du jeu, longueurs du modele, gauche/droite symetriques."""
    base = {k: np.array(v, float) for k, v in BASE.items()}
    lg = {}
    for o in OS:
        if o == "hips":
            continue
        lg[o] = float(np.linalg.norm(np.asarray(J[o], float) - np.asarray(J[PARENT[o]], float)))
    for g in ("sh", "el", "ha", "th", "kn", "ft"):  # meme longueur a gauche et a droite
        m = (lg[g + "L"] + lg[g + "R"]) / 2
        lg[g + "L"] = lg[g + "R"] = m
    cible = {"hips": np.array(J["hips"], float)}
    for o in OS:
        if o == "hips":
            continue
        p = PARENT[o]
        d = base[o] - base[p]
        if np.linalg.norm(d) < 1e-9:
            d = np.array([0, 1, 0.0])
        cible[o] = cible[p] + d / np.linalg.norm(d) * lg[o]
    return cible


def vers_repos(pos, J, W, nor=None):
    """Replace le maillage dans la pose de repos du jeu (et tourne les normales)."""
    cible = repos_cible(J)
    Q = {"hips": np.eye(3)}
    for o in OS:
        if o == "hips":
            continue
        p = PARENT[o]
        d = np.asarray(J[o], float) - np.asarray(J[p], float)
        e = cible[o] - cible[p]
        Q[o] = _rot_entre(Q[p] @ d, e) @ Q[p]
    out = np.zeros_like(pos)
    outn = np.zeros_like(nor) if nor is not None else None
    for i, o in enumerate(OS):
        w = W[:, i:i + 1]
        if not w.any():
            continue
        out += w * ((pos - np.asarray(J[o], float)) @ Q[o].T + cible[o])
        if outn is not None:
            outn += w * (nor @ Q[o].T)
    if outn is not None:
        lg = np.linalg.norm(outn, axis=1, keepdims=True)
        outn = outn / np.where(lg < 1e-9, 1, lg)
    return (out, cible) if outn is None else (out, cible, outn)


def riguer(pos, idx, nor=None):
    """Chaine complete : squelette, poids, remise en pose de repos."""
    J = fit_squelette(pos)
    W = poids(pos, J, idx)
    if nor is None:
        npos, cible = vers_repos(pos, J, W)
        return npos, cible, W
    npos, cible, nnor = vers_repos(pos, J, W, nor)
    return npos, cible, W, nnor


if __name__ == "__main__":
    import sys
    sys.path.insert(0, __file__.rsplit("/", 1)[0])
    from glb_vers_rc import lire_glb, accesseur
    gltf, buf = lire_glb(sys.argv[1])
    P = []
    for m in gltf.get("meshes", []):
        for p in m.get("primitives", []):
            P.append(accesseur(gltf, buf, p["attributes"]["POSITION"]).astype(float))
    pos = np.vstack(P)
    J = fit_squelette(pos)
    print("hauteur", round(pos[:, 1].max() - pos[:, 1].min(), 3))
    for o in OS:
        print(" ", o, np.round(J[o], 3))
