#!/usr/bin/env python3
"""Tenues couvrantes : repeint en tissu la peau visible des bras, du torse et des jambes
des modèles 3D (texture « cuite » models/<id>_0.webp), en gardant le visage, le cou et les mains.

    python3 outils/tenues_couvrantes.py rin seika mizuha ...      # modifie les textures
    python3 outils/tenues_couvrantes.py --apercu DOSSIER rin ...  # n'écrit que des aperçus avant/après

Principe :
  1. chaque triangle du modèle est rattaché à l'os qui le porte le plus (poids de peau) ;
  2. la teinte de peau de référence est mesurée sur la tête (visage) ;
  3. dans les triangles des bras, du torse et des jambes, chaque texel couleur peau devient du tissu
     (couleur dominante de la tenue, un peu assombrie), en conservant l'ombrage d'origine ;
  4. les texels partagés avec la tête ou les mains ne sont jamais touchés.
"""
import os
import sys
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rc_vers_glb import charger  # noqa: E402

COUVRIR = {"hips", "spine", "chest", "shL", "elL", "shR", "elR", "thL", "knL", "ftL", "thR", "knR", "ftR"}
PROTEGER = {"head", "neck", "haL", "haR"}


def hsv(rgb):
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx, mn = rgb.max(-1), rgb.min(-1)
    d = mx - mn
    h = np.zeros_like(mx)
    m = d > 1e-6
    rr = m & (mx == r)
    gg = m & (mx == g) & ~rr
    bb = m & ~rr & ~gg
    h[rr] = ((g - b)[rr] / d[rr]) % 6
    h[gg] = (b - r)[gg] / d[gg] + 2
    h[bb] = (r - g)[bb] / d[bb] + 4
    return h * 60, np.where(mx > 1e-6, d / np.maximum(mx, 1e-6), 0), mx


def peau_probable(rgb):
    h, s, v = hsv(rgb)
    return (((h <= 45) | (h >= 340)) & (s >= 0.08) & (s <= 0.62) & (v >= 0.38))


def raster(mask, tri_uv, W, H):
    """Remplit le masque (H, W) pour chaque triangle (u, v en pixels)."""
    for t in tri_uv:
        x0, y0 = np.floor(t.min(0)).astype(int)
        x1, y1 = np.ceil(t.max(0)).astype(int)
        x0, y0 = max(x0, 0), max(y0, 0)
        x1, y1 = min(x1, W - 1), min(y1, H - 1)
        if x1 < x0 or y1 < y0:
            continue
        xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        (ax, ay), (bx, by), (cx, cy) = t
        den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
        if abs(den) < 1e-9:
            mask[int(ay) % H, int(ax) % W] = True
            continue
        l1 = ((by - cy) * (xs - cx) + (cx - bx) * (ys - cy)) / den
        l2 = ((cy - ay) * (xs - cx) + (ax - cx) * (ys - cy)) / den
        l3 = 1 - l1 - l2
        e = -0.02
        inside = (l1 >= e) & (l2 >= e) & (l3 >= e)
        sub = mask[y0:y1 + 1, x0:x1 + 1]
        sub |= inside


def dilater(m, n=1):
    for _ in range(n):
        d = m.copy()
        d[1:] |= m[:-1]; d[:-1] |= m[1:]; d[:, 1:] |= m[:, :-1]; d[:, :-1] |= m[:, 1:]
        m = d
    return m


def traiter(id_, racine, apercu=None):
    meta, prims = charger(os.path.join(racine, "models", id_ + ".json"))
    noms = [j["n"] for j in meta["J"]]
    tex_path = os.path.join(racine, "models", meta["mats"][0]["tex"])
    img = Image.open(tex_path).convert("RGB")
    W, H = img.size
    rgb = np.asarray(img).astype(np.float64) / 255.0

    groupes = {"couvrir": [], "proteger": [], "tete": [], "torse": []}
    for p in prims:
        tri = p["idx"].reshape(-1, 3)
        # os dominant par triangle (somme des poids des 3 sommets)
        acc = np.zeros((len(tri), len(noms)))
        for k in range(3):
            v = tri[:, k]
            for c in range(4):
                np.add.at(acc, (np.arange(len(tri)), p["j"][v, c]), p["w"][v, c])
        dom = acc.argmax(1)
        uv = p["uv"][tri]  # (T, 3, 2)
        for i, d in enumerate(dom):
            n = noms[d]
            if n in PROTEGER:
                groupes["proteger"].append(uv[i])
                if n == "head":
                    groupes["tete"].append(uv[i])
            elif n in COUVRIR:
                groupes["couvrir"].append(uv[i])
                if n in ("spine", "chest", "hips"):
                    groupes["torse"].append(uv[i])

    def masque(liste, flipv):
        m = np.zeros((H, W), bool)
        if not liste:
            return m
        a = np.array(liste).copy()
        a[..., 0] *= W
        a[..., 1] = (1 - a[..., 1]) * H if flipv else a[..., 1] * H
        raster(m, a, W, H)
        return m

    # convention du jeu : la texture est envoyée à WebGL sans UNPACK_FLIP_Y, donc v = 0 est la
    # première ligne de l'image (pas d'inversion verticale).
    flipv = False

    m_tete = masque(groupes["tete"], flipv)
    m_prot = dilater(masque(groupes["proteger"], flipv), 1)
    m_couv = masque(groupes["couvrir"], flipv)
    m_torse = masque(groupes["torse"], flipv)

    # teinte de peau de référence (visage)
    px_tete = rgb[m_tete]
    peau_t = px_tete[peau_probable(px_tete)]
    if len(peau_t) < 50:
        return {"id": id_, "ok": False, "raison": "peau du visage introuvable"}
    ref = np.median(peau_t, 0)
    dist_t = np.linalg.norm(peau_t - ref, axis=1)
    seuil = max(0.12, np.percentile(dist_t, 92) * 1.25)

    s_ref = hsv(ref[None])[1][0]

    def est_peau(px):
        # proche du teint du visage ET assez saturé (exclut les tissus blancs/crème)
        return (np.linalg.norm(px - ref, axis=-1) < seuil) & peau_probable(px) & (hsv(px)[1] >= s_ref * 0.6)

    # couleur du tissu : couleur dominante non-peau du torse (sinon des membres)
    zone = m_torse if m_torse.any() else m_couv
    px_z = rgb[zone]
    non_peau = px_z[~est_peau(px_z) & (px_z.max(-1) > 0.12)]
    if len(non_peau) < 50:
        non_peau = rgb[m_couv][~est_peau(rgb[m_couv])]
    q = np.clip((non_peau * 6).astype(int), 0, 5)
    cles = q[:, 0] * 36 + q[:, 1] * 6 + q[:, 2]
    dominante = np.bincount(cles).argmax()
    tissu = np.median(non_peau[cles == dominante], 0) * 0.85

    cible = m_couv & ~m_prot & est_peau(rgb)
    cible = dilater(cible, 1) & m_couv & ~m_prot & (np.linalg.norm(rgb - ref, axis=-1) < seuil * 1.5) & peau_probable(rgb)
    lum_ref = ref.mean()
    nouveau = rgb.copy()
    lum = rgb[cible].mean(-1, keepdims=True) / max(lum_ref, 1e-3)
    nouveau[cible] = np.clip(tissu * np.clip(lum, 0.55, 1.35), 0, 1)

    part = cible.sum() / max(1, m_couv.sum())
    out = Image.fromarray((nouveau * 255 + 0.5).astype(np.uint8))
    if apercu:
        os.makedirs(apercu, exist_ok=True)
        cote = Image.new("RGB", (W, H // 2))
        cote.paste(img.resize((W // 2, H // 2)), (0, 0))
        cote.paste(out.resize((W // 2, H // 2)), (W // 2, 0))
        cote.save(os.path.join(apercu, id_ + "_avant_apres.png"))
    else:
        out.save(tex_path, "WEBP", quality=92, method=6)
    return {"id": id_, "ok": True, "saturation_peau": round(float(s_ref), 3), "peau": [round(x, 3) for x in ref], "tissu": [round(x, 3) for x in tissu],
            "texels_repeints": int(cible.sum()), "part_des_membres": round(float(part), 3)}


if __name__ == "__main__":
    args = sys.argv[1:]
    apercu = None
    if args and args[0] == "--apercu":
        apercu, args = args[1], args[2:]
    racine = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    for a in args:
        print(traiter(a, racine, apercu))
