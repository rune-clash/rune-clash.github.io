#!/usr/bin/env python3
"""Héroïnes pudiques : casque et voile sur les cheveux, tenues amples (moins moulantes).

    python3 outils/heroines_pudiques.py rin seika ...            # modifie models/<id>.bin et <id>_0.webp
    python3 outils/heroines_pudiques.py --apercu DOSSIER rin ... # n'écrit que des aperçus de texture

À lancer APRÈS outils/tenues_couvrantes.py (qui couvre déjà la peau des bras et des jambes).

Texture (la couleur « cuite » du modèle) :
  - visage : un ovale devant la tête (entre le menton et le haut du front visible) reste intact ;
  - casque : tout ce qui est porté par la tête AU-DESSUS du front devient un casque d'acier
    légèrement teinté de la couleur de la tenue ;
  - voile : le reste de la tête (côtés, oreilles, nuque), le cou, et les mèches longues qui
    tombent sur le dos ou les épaules (même couleur que les cheveux) deviennent un voile de
    tissu de la couleur de la tenue ;
  - l'ombrage d'origine est gardé mais adouci, pour lire un tissu ou un métal et non des mèches.
Géométrie (positions de repos du squelette ; l'animation suit, car les poids ne changent pas) :
  - poitrine aplatie : l'avant du buste est ramené vers un plan ;
  - taille droite : la taille est élargie jusqu'à la largeur du buste (tunique droite) ;
  - pantalons amples : cuisses et mollets élargis autour de l'os (moins vers l'intérieur) ;
  - les normales des sommets déplacés sont recalculées ;
  - l'auréole flottante de Seren (pièce isolée au-dessus de la tête) est retirée.
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rc_vers_glb import charger  # noqa: E402
from tenues_couvrantes import hsv, peau_probable, raster  # noqa: E402

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ACIER = np.array([0.66, 0.69, 0.74])
RETIRER_PIECES = {"seren": "aureole"}      # pièces isolées à retirer
# héros dont on ne retouche QUE la coiffe (chapeau pointu de magicien rentré en calotte), sans voile
CHAPEAU_SEUL = {"kairo": {"centre": [0.0, 1.46, -0.01], "rayons": [0.15, 0.17, 0.16]}}
REGLAGES = {                               # ajustements par héroïne (facultatifs)
    "abyssa": {"pas_de_peau": True, "ampleur": (1.5, 1.6)},      # combinaison très près du corps
    "shiki": {"meches_forcees": True, "coiffe": {"centre": [0.0, 1.47, 0.0], "rayons": [0.17, 0.18, 0.18]}},
    # Shiki : chapeau pointu rentré dans un casque arrondi autour du crâne (repère du modèle, m) ;
    # ses mèches lilas (bien distinctes de sa tenue violet sombre) sont toujours repérées
}
# amplitude des retouches de silhouette
APLATIR_BUSTE = 0.8       # part de l'avancée de la poitrine (au-delà de la ligne taille-haut du buste) retirée
ELARGIR_TAILLE = 0.75     # part de l'écart taille/buste comblée
AMPLEUR_CUISSE = 1.35     # facteur radial vers l'extérieur
AMPLEUR_MOLLET = 1.45
AMPLEUR_INTERIEUR = 1.08  # vers l'autre jambe (évite que les jambes se traversent)


# ---------------------------------------------------------------- outils communs
def os_par_triangle(p, noms):
    tri = p["idx"].reshape(-1, 3)
    acc = np.zeros((len(tri), len(noms)))
    for k in range(3):
        for c in range(4):
            np.add.at(acc, (np.arange(len(tri)), p["j"][tri[:, k], c]), p["w"][tri[:, k], c])
    return acc.argmax(1)


def poids(p, noms, nom):
    j = noms.index(nom)
    w = np.zeros(len(p["pos"]))
    for c in range(4):
        w += np.where(p["j"][:, c] == j, p["w"][:, c], 0)
    return w


def couleur_texel(img, uv):
    H, W = img.shape[:2]
    x = np.clip((uv[..., 0] * W).astype(int), 0, W - 1)
    y = np.clip((uv[..., 1] * H).astype(int), 0, H - 1)
    return img[y, x]


def masque_triangles(liste_uv, W, H):
    m = np.zeros((H, W), bool)
    if len(liste_uv):
        a = np.array(liste_uv).copy()
        a[..., 0] *= W
        a[..., 1] *= H      # convention du jeu : pas d'inversion verticale
        raster(m, a, W, H)
    return m


def dilater(m, n=1):
    for _ in range(n):
        d = m.copy()
        d[1:] |= m[:-1]; d[:-1] |= m[1:]; d[:, 1:] |= m[:, :-1]; d[:, :-1] |= m[:, 1:]
        m = d
    return m


def teintes(px, n=3, part=0.08):
    """Jusqu'à n couleurs dominantes (chacune au moins `part` des texels)."""
    q = np.clip((px * 6).astype(int), 0, 5)
    cles = q[:, 0] * 36 + q[:, 1] * 6 + q[:, 2]
    cpt = np.bincount(cles)
    out = []
    for k in np.argsort(-cpt)[:n]:
        if cpt[k] >= part * len(px):
            out.append(np.median(px[cles == k], 0))
    return out


def dominante(px):
    q = np.clip((px * 6).astype(int), 0, 5)
    cles = q[:, 0] * 36 + q[:, 1] * 6 + q[:, 2]
    d = np.bincount(cles).argmax()
    return np.median(px[cles == d], 0)


# ---------------------------------------------------------------- texture : casque et voile
def casque_et_voile(id_, meta, p, noms, rgb, regl):
    H, W = rgb.shape[:2]
    tri = p["idx"].reshape(-1, 3)
    dom = os_par_triangle(p, noms)
    cen = p["pos"][tri].mean(1)
    uv = p["uv"][tri]
    col = couleur_texel(rgb, uv.mean(1))
    tete = dom == noms.index("head")
    cou = dom == noms.index("neck")
    c = cen[tete].mean(0)
    d = cen - c
    theta = np.degrees(np.arctan2(d[:, 0], d[:, 2]))      # 0° = face (+z)
    devant = tete & (d[:, 2] > 0) & (np.abs(theta) < 70)
    peau = peau_probable(col) & (not regl.get("pas_de_peau", False))
    # teint de référence : bas du visage (sous le centre de la tête), puis texels proches de ce teint
    bas = devant & peau & (cen[:, 1] < c[1])
    if bas.sum() >= 20:
        ref = np.median(col[bas], 0)
        peau = peau & (np.linalg.norm(col - ref, axis=1) < 0.13)
    vis = devant & peau
    if vis.sum() >= 30:
        y_bas, y_haut = np.percentile(cen[vis, 1], 2), np.percentile(cen[vis, 1], 96) - 0.004
        t_max = min(50.0, max(40.0, np.percentile(np.abs(theta[vis]), 85)))
    else:   # visage non couleur chair (ex. Abyssa) : proportions moyennes
        y_bas, y_haut, t_max = c[1] - 0.085, c[1] + 0.005, 52.0
    y_mid, demi = (y_bas + y_haut) / 2, (y_haut - y_bas) / 2
    ovale = devant & ((theta / t_max) ** 2 + ((cen[:, 1] - y_mid) / demi) ** 2 <= 1.25) & (cen[:, 1] >= y_bas - 0.01)
    # couleurs des cheveux = teintes dominantes de la tête hors visage, hors peau
    px = col[tete & ~ovale & ~peau]
    nuances = teintes(px, n=4, part=0.05) if len(px) > 20 else []
    cheveux = nuances[0] if nuances else None

    def est_cheveux(cc, seuil=0.17):
        if not nuances:
            return np.zeros(len(cc), bool)
        return np.min([np.linalg.norm(cc - h, axis=1) for h in nuances], axis=0) < seuil
    # mèches qui encadrent le visage (sur les côtés de l'ovale) : elles passent sous le voile
    cotes = ovale & est_cheveux(col) & ~peau & (np.abs(theta) > 28)
    ovale = ovale & ~cotes
    couvert = (tete & ~ovale) | cou
    casque = couvert & tete & (cen[:, 1] > y_haut + 0.006)
    voile = couvert & ~casque
    # couleur de la tenue (buste, hors peau et hors cheveux)
    torse = np.isin(dom, [noms.index(n) for n in ("chest", "spine", "hips")])
    pt = col[torse & ~peau]
    if cheveux is not None:
        pt = pt[np.linalg.norm(pt - cheveux, axis=1) > 0.18] if (np.linalg.norm(pt - cheveux, axis=1) > 0.18).sum() > 50 else pt
    tenue = dominante(pt) if len(pt) > 20 else np.array([0.4, 0.4, 0.45])
    # mèches longues hors de la tête : même couleur que les cheveux, sur le haut du corps
    meches = np.zeros(len(tri), bool)
    # une teinte de cheveux ne sert à repérer les mèches que si elle ne ressemble à AUCUNE teinte
    # de la tenue (sinon on repeindrait la robe : cas des cheveux blancs sur robe blanche)
    habits = (teintes(col[torse & ~peau], n=4, part=0.12) if (torse & ~peau).sum() > 20 else []) or [tenue]
    distinctes = nuances if regl.get("meches_forcees") else \
        [h for h in nuances if min(np.linalg.norm(h - x) for x in habits) > regl.get("ecart_habits", 0.18)]
    if distinctes:
        haut = np.isin(dom, [noms.index(n) for n in ("neck", "chest", "spine", "hips", "shL", "shR")])
        proche = np.min([np.linalg.norm(col - h, axis=1) for h in distinctes], axis=0) < 0.16
        meches = haut & ~tete & proche & (regl.get("meches_forcees", False) | (np.linalg.norm(col - tenue, axis=1) > 0.15))
        voile |= meches

    # couleur du voile : une teinte de la tenue, la plus éloignée des cheveux et d'un teint de peau,
    # ni trop sombre ni trop claire (sinon on croirait voir encore des cheveux)
    candidates = teintes(pt, n=5, part=0.04) if len(pt) > 20 else []
    candidates = [np.clip(cc * 0.9, 0.05, 0.9) for cc in candidates]
    candidates += [np.array([0.30, 0.34, 0.46]), np.array([0.74, 0.72, 0.66])]     # ardoise, lin
    teint = np.array([0.8, 0.62, 0.55])

    def ecart(cc):
        dh = min([np.linalg.norm(cc - h) for h in nuances]) if nuances else 1.0
        v = cc.max()
        return min(dh, np.linalg.norm(cc - teint)) - (0.4 if (v < 0.35 or v > 0.88) else 0)
    couleur_voile = max(candidates, key=ecart)
    couleur_casque = np.clip(ACIER * 0.8 + tenue * 0.2, 0, 1)

    m_ovale = dilater(masque_triangles(uv[ovale], W, H), 1)
    m_c0 = masque_triangles(uv[casque], W, H)
    m_v0 = masque_triangles(uv[voile], W, H)
    # bordure de 2 texels autour des zones repeintes (sinon le filtrage de texture fait apparaître
    # un liseré de l'ancienne couleur aux joints), sans jamais déborder sur une autre partie
    m_autres = masque_triangles(uv[~(casque | voile)], W, H) & ~m_c0 & ~m_v0
    m_casque = (m_c0 | (dilater(m_c0, 2) & ~m_autres & ~m_v0)) & ~m_ovale
    m_voile = (m_v0 | (dilater(m_v0, 2) & ~m_autres)) & ~m_ovale & ~m_casque
    lum = rgb.mean(-1)
    lum_douce = np.asarray(Image.fromarray((lum * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(4))).astype(float) / 255
    out = rgb.copy()
    # contraste faible : on garde le volume (ombre et lumière) sans le dessin des mèches
    for m, coul, contraste, bornes in ((m_casque, couleur_casque, 0.4, (0.75, 1.25)), (m_voile, couleur_voile, 0.25, (0.82, 1.12))):
        if not m.any():
            continue
        ref = np.median(lum_douce[m])
        k = np.clip((lum_douce[m] / max(ref, 1e-3)) ** contraste, *bornes)
        out[m] = np.clip(coul[None] * k[:, None], 0, 1)
    info = {"casque_texels": int(m_casque.sum()), "voile_texels": int(m_voile.sum()), "meches_triangles": int(meches.sum()),
            "meches_visage": int(cotes.sum()), "nuances_cheveux": len(nuances),
            "cheveux": None if cheveux is None else [round(float(x), 2) for x in cheveux],
            "voile": [round(float(x), 2) for x in couleur_voile], "casque": [round(float(x), 2) for x in couleur_casque]}
    return out, info


# ---------------------------------------------------------------- géométrie : tenue ample
def normales(pos, tri):
    key = np.round(pos * 4000).astype(np.int64)
    _, inv = np.unique(key, axis=0, return_inverse=True)
    inv = inv.ravel()
    a, b, c = pos[tri[:, 0]], pos[tri[:, 1]], pos[tri[:, 2]]
    fn = np.cross(b - a, c - a)
    acc = np.zeros((inv.max() + 1, 3))
    for k in range(3):
        np.add.at(acc, inv[tri[:, k]], fn)
    n = acc[inv]
    return n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)


def rentrer_coiffe(pos, w_tete, centre, rayons):
    """Ramène dans un ellipsoïde autour du crâne les sommets de la tête qui en sortent (chapeau)."""
    c, r = np.array(centre), np.array(rayons)
    rel = (pos - c) / r
    d = np.linalg.norm(rel, axis=1)
    m = (w_tete > 0.5) & (d > 1.0)
    pos = pos.copy()
    pos[m] = c + rel[m] / d[m, None] * r * 1.01
    return pos, int(m.sum())


def ample(meta, p, noms, regl=None):
    regl = regl or {}
    a_cuisse, a_mollet = regl.get("ampleur", (AMPLEUR_CUISSE, AMPLEUR_MOLLET))
    pos = p["pos"].copy()
    J = {j["n"]: np.array(j["pos"]) for j in meta["J"]}
    wc = poids(p, noms, "chest")
    ws = poids(p, noms, "spine")
    wh = poids(p, noms, "hips")
    wt = np.clip(wc + ws, 0, 1)
    # 1. poitrine aplatie : l'avant du buste est ramené vers la droite qui va de l'avant de la
    #    taille à l'avant du haut de la poitrine (une tunique tombe droit, elle ne suit pas les formes)
    def avant(y, dy=0.025):
        m = (wt + wh > 0.5) & (np.abs(pos[:, 0]) < 0.09) & (np.abs(pos[:, 1] - y) < dy)
        return pos[m, 2].max() if m.any() else None
    y_t, y_h = J["spine"][1] - 0.10, J["neck"][1] - 0.03
    z_t, z_h = avant(y_t), avant(y_h)
    if z_t is not None and z_h is not None:
        k = np.clip((pos[:, 1] - y_t) / (y_h - y_t), 0, 1)
        ligne = z_t + (z_h - z_t) * k
        dans = (pos[:, 1] > y_t) & (pos[:, 1] < y_h + 0.02) & (pos[:, 2] > ligne)
        pos[:, 2] -= np.where(dans, (pos[:, 2] - ligne) * APLATIR_BUSTE * wt, 0)
    # 2. taille droite : largeur de la taille portée vers la plus grande du buste ou des hanches
    larg = [np.percentile(np.abs(pos[w_ > 0.5, 0]), 95) for w_ in (wc, wh) if (w_ > 0.5).any()]
    if larg and (ws > 0.5).any():
        lb = max(larg)
        lt = np.percentile(np.abs(pos[ws > 0.5, 0]), 95)
        if lt < lb:
            f = 1 + (lb / lt - 1) * ELARGIR_TAILLE
            pos[:, 0] *= 1 + ws * (f - 1)
    # 3. pantalons amples autour de l'os de chaque jambe
    for cote in ("L", "R"):
        for os_, a, b, fac in (("th" + cote, "th" + cote, "kn" + cote, a_cuisse), ("kn" + cote, "kn" + cote, "ft" + cote, a_mollet)):
            w = poids(p, noms, os_)
            if not (w > 0.05).any():
                continue
            A, B = J[a], J[b]
            ab = B - A
            t = np.clip(((pos - A) @ ab) / (ab @ ab), 0, 1)
            proche = A + t[:, None] * ab
            r = pos - proche
            r[:, 1] = 0                                  # élargir à l'horizontale seulement
            vers_exterieur = np.sign(r[:, 0]) == np.sign(A[0]) if abs(A[0]) > 1e-4 else np.ones(len(pos), bool)
            f = np.where(vers_exterieur, fac, AMPLEUR_INTERIEUR)
            if os_.startswith("kn"):
                f = 1 + (f - 1) * np.clip(1.15 - t, 0, 1) ** 0.5   # pas d'ampleur sur la cheville
            pos += r * ((f - 1) * w)[:, None]
    return pos


def retirer_piece_haute(pos, tri):
    """Ramène dans la tête les sommets de la pièce isolée la plus haute (auréole)."""
    key = np.round(pos * 4000).astype(np.int64)
    _, inv = np.unique(key, axis=0, return_inverse=True)
    inv = inv.ravel()
    t2 = inv[tri]
    par = np.arange(inv.max() + 1)

    def f(x):
        r = x
        while par[r] != r:
            r = par[r]
        while par[x] != r:
            par[x], x = r, par[x]
        return r
    for a, b, c in t2:
        ra = f(a)
        par[f(b)] = ra
        par[f(c)] = ra
    comp = np.array([f(x) for x in t2[:, 0]])
    u, cnt = np.unique(comp, return_counts=True)
    principal = u[cnt.argmax()]
    retire = 0
    for k in u:
        if k == principal:
            continue
        m = comp == k
        v = np.unique(tri[m].ravel())
        if pos[v, 1].min() > pos[:, 1].max() - 0.05:     # au sommet du modèle : l'auréole
            pos[v] = pos[v].mean(0) - np.array([0, 0.12, 0])   # triangles écrasés en un point, cachés dans la tête
            retire += int(m.sum())
    return pos, retire


# ---------------------------------------------------------------- programme
def traiter(id_, apercu=None):
    meta_path = os.path.join(RACINE, "models", id_ + ".json")
    meta, prims = charger(meta_path)
    noms = [j["n"] for j in meta["J"]]
    regl = REGLAGES.get(id_, {})
    p = prims[0]
    tex = os.path.join(RACINE, "models", meta["mats"][0]["tex"])
    rgb = np.asarray(Image.open(tex).convert("RGB")).astype(np.float64) / 255.0
    tri = p["idx"].reshape(-1, 3)
    if id_ in CHAPEAU_SEUL:
        neuf, info = rgb, {}
        pos = p["pos"].copy()
        regl = {"coiffe": CHAPEAU_SEUL[id_]}
    else:
        neuf, info = casque_et_voile(id_, meta, p, noms, rgb, regl)
        pos = ample(meta, p, noms, regl)
    out = Image.fromarray((neuf * 255 + 0.5).astype(np.uint8))
    if "coiffe" in regl:
        pos, info["coiffe_sommets"] = rentrer_coiffe(pos, poids(p, noms, "head"), **regl["coiffe"])
    if RETIRER_PIECES.get(id_) == "aureole":
        pos, info["aureole_triangles"] = retirer_piece_haute(pos, tri)
    bouge = np.linalg.norm(pos - p["pos"], axis=1) > 1e-6
    info["sommets_deplaces"] = int(bouge.sum())
    if apercu:
        os.makedirs(apercu, exist_ok=True)
        Wd, Hd = out.size
        cote = Image.new("RGB", (Wd, Hd // 2))
        cote.paste(Image.fromarray((rgb * 255).astype(np.uint8)).resize((Wd // 2, Hd // 2)), (0, 0))
        cote.paste(out.resize((Wd // 2, Hd // 2)), (Wd // 2, 0))
        cote.save(os.path.join(apercu, id_ + "_casque_voile.png"))
        return {"id": id_, **info}
    q = meta["q"]
    buf = bytearray(open(meta_path[:-5] + ".bin", "rb").read())
    pm = meta["prims"][0]
    qp = np.round((pos - np.array(q["o"])) / np.array(q["s"]))
    if ((qp < -32767) | (qp > 32767)).any():
        # la silhouette élargie sort de la plage de quantification : on l'agrandit (fichier .json mis à jour)
        lo, hi = np.minimum(pos.min(0), np.array(q["o"]) - 32767 * np.array(q["s"])), np.maximum(pos.max(0), np.array(q["o"]) + 32767 * np.array(q["s"]))
        q["o"] = [float(x) for x in (lo + hi) / 2]
        q["s"] = [float(x) for x in (hi - lo) / 2 / 32760]
        txt = open(meta_path).read()
        brut = json.loads(txt)
        brut["q"] = q
        open(meta_path, "w").write(json.dumps(brut, separators=(",", ":"), ensure_ascii=False))
        info["plage_agrandie"] = True
        qp = np.round((pos - np.array(q["o"])) / np.array(q["s"]))
    qp = np.clip(qp, -32767, 32767).astype(np.int16)
    buf[pm["pos"]:pm["pos"] + qp.nbytes] = qp.tobytes()
    nn = p["nor"].copy()
    nouv = normales(pos, tri)
    nn[bouge] = nouv[bouge]
    qn = np.clip(np.round(nn * 127), -127, 127).astype(np.int8)
    buf[pm["nor"]:pm["nor"] + qn.nbytes] = qn.tobytes()
    open(meta_path[:-5] + ".bin", "wb").write(bytes(buf))
    if id_ not in CHAPEAU_SEUL:
        out.save(tex, "WEBP", quality=92, method=6)
    return {"id": id_, **info}


if __name__ == "__main__":
    args = sys.argv[1:]
    apercu = None
    if args[:1] == ["--apercu"]:
        apercu, args = args[1], args[2:]
    for a in args:
        print(json.dumps(traiter(a, apercu), ensure_ascii=False))
