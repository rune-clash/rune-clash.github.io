#!/usr/bin/env python3
"""Fâris (ancien « El Diablo ») : chevalier d'acier au lieu d'un chevalier démoniaque.

    python3 outils/refaire_faris.py            # modifie models/eldiablo.bin et models/eldiablo_0.webp
    python3 outils/refaire_faris.py --apercu D # n'écrit que des aperçus dans le dossier D

1. Géométrie : les cornes de bélier du casque sont « rentrées » dans le casque. Chaque sommet
   porté par l'os de la tête, sur les côtés (|x| > LARGEUR_CRETE) et hors de l'ellipsoïde du
   casque, est ramené sur la surface de cet ellipsoïde. Le maillage reste d'un seul tenant
   (aucun trou), les cornes deviennent de simples renforts latéraux.
2. Texture : l'armure noire devient de l'acier poli, les lueurs rouges deviennent bleu roi, les arêtes
   claires deviennent des liserés dorés,
   l'ombrage et les arêtes claires de la texture d'origine sont conservés.
L'identifiant interne « eldiablo » est gardé pour ne casser aucune sauvegarde.
"""
import json
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rc_vers_glb import charger  # noqa: E402
from tenues_couvrantes import hsv  # noqa: E402

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# ellipsoïde du casque (repère du modèle, mètres) mesuré sur les sommets de la tête
CASQUE_CENTRE = np.array([0.0, 1.715, 0.0])
CASQUE_RAYONS = np.array([0.135, 0.175, 0.145])
LARGEUR_CRETE = 0.11   # la crête et la visière (au centre) ne sont jamais touchées
HAUTEUR_MIN = 1.60     # le col et la gorgerette ne sont jamais touchés

BLEU_ROI = 218.0       # teinte des anciennes lueurs rouges
OR_TEINTE = 43.0       # liserés dorés sur les arêtes claires
ACIER = np.array([0.62, 0.66, 0.72])


def rentrer_cornes(pos, poids_tete):
    p = pos.copy()
    rel = (p - CASQUE_CENTRE) / CASQUE_RAYONS
    r = np.linalg.norm(rel, axis=1)
    m = (poids_tete > 0.5) & (np.abs(p[:, 0]) > LARGEUR_CRETE) & (p[:, 1] > HAUTEUR_MIN) & (r > 1.0)
    p[m] = CASQUE_CENTRE + rel[m] / r[m, None] * CASQUE_RAYONS * 1.01
    return p, int(m.sum())


def hsv_vers_rgb(h, s, v):
    h = (h % 360) / 60.0
    c = v * s
    x = c * (1 - np.abs(h % 2 - 1))
    z = np.zeros_like(h)
    i = np.floor(h).astype(int) % 6
    r = np.choose(i, [c, x, z, z, x, c])
    g = np.choose(i, [x, c, c, x, z, z])
    b = np.choose(i, [z, z, x, c, c, x])
    m = v - c
    return np.stack([r + m, g + m, b + m], -1)


def recolorer(rgb):
    h, s, v = hsv(rgb)
    out = rgb.copy()
    rouge = ((h <= 25) | (h >= 330)) & (s >= 0.35) & (v >= 0.35)
    out[rouge] = hsv_vers_rgb(np.full(rouge.sum(), BLEU_ROI), np.clip(s[rouge] * 0.9, 0, 0.85),
                              np.clip(v[rouge] * 1.05, 0, 1))
    arete = ~rouge & (v >= 0.55) & (s < 0.3)
    # arêtes claires : liseré doré
    out[arete] = hsv_vers_rgb(np.full(arete.sum(), OR_TEINTE), np.full(arete.sum(), 0.5), np.clip(v[arete] * 1.02, 0, 1))
    sombre = ~rouge & ~arete & (v < 0.55)
    # acier : on relève les noirs en gardant (et en accentuant) le relief, légère teinte froide
    lum = 0.18 + (v[sombre] / 0.55) ** 1.1 * 0.7
    out[sombre] = np.clip(ACIER[None] * (lum / ACIER.mean())[:, None], 0, 1)
    return out, int(rouge.sum()), int(sombre.sum())


def main(apercu=None):
    meta_path = os.path.join(RACINE, "models", "eldiablo.json")
    meta, prims = charger(meta_path)
    noms = [j["n"] for j in meta["J"]]
    tete = noms.index("head")
    q = meta["q"]
    buf = bytearray(open(meta_path[:-5] + ".bin", "rb").read())
    total = 0
    for pm, p in zip(meta["prims"], prims):
        w = np.zeros(len(p["pos"]))
        for c in range(4):
            w += np.where(p["j"][:, c] == tete, p["w"][:, c], 0)
        neuf, n = rentrer_cornes(p["pos"], w)
        total += n
        qp = np.clip(np.round((neuf - np.array(q["o"])) / np.array(q["s"])), -32768, 32767).astype(np.int16)
        buf[pm["pos"]:pm["pos"] + qp.nbytes] = qp.tobytes()
    tex = os.path.join(RACINE, "models", meta["mats"][0]["tex"])
    img = Image.open(tex).convert("RGB")
    rgb = np.asarray(img).astype(np.float64) / 255.0
    neuf, nr, ns = recolorer(rgb)
    out = Image.fromarray((neuf * 255 + 0.5).astype(np.uint8))
    if apercu:
        os.makedirs(apercu, exist_ok=True)
        W, H = img.size
        cote = Image.new("RGB", (W, H // 2))
        cote.paste(img.resize((W // 2, H // 2)), (0, 0))
        cote.paste(out.resize((W // 2, H // 2)), (W // 2, 0))
        cote.save(os.path.join(apercu, "faris_avant_apres.png"))
    else:
        open(meta_path[:-5] + ".bin", "wb").write(bytes(buf))
        out.save(tex, "WEBP", quality=92, method=6)
    print(json.dumps({"sommets_cornes_rentres": total, "texels_rouges_vers_bleu": nr, "texels_noirs_vers_acier": ns}))


if __name__ == "__main__":
    a = sys.argv[1:]
    main(a[1] if a[:1] == ["--apercu"] else None)
