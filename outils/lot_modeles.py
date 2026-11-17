#!/usr/bin/env python3
"""Convertit tout un dossier de modeles et les branche dans le jeu.

    python3 outils/lot_modeles.py dossier_des_glb

Chaque fichier doit porter l'identifiant du heros : eldiablo.glb, ignar.glb...
Le script convertit chacun vers models/, puis met a jour la liste MODELES_IA
dans index.html avec les heros qui ont bien un modele sur le disque.
"""
import os
import re
import sys
import glob

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from glb_vers_rc import convertir

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def lot(dossier, sortie=None):
    sortie = sortie or os.path.join(RACINE, "models")
    faits, rates = [], []
    for f in sorted(glob.glob(os.path.join(dossier, "*.glb"))):
        nom = os.path.splitext(os.path.basename(f))[0]
        print("\n=== %s ===" % nom)
        try:
            convertir(f, nom, sortie)
            faits.append(nom)
        except Exception as e:
            print("  echec :", e)
            rates.append(nom)
    return faits, rates


def brancher(sortie=None):
    """Met MODELES_IA a jour d'apres les fichiers reellement presents."""
    sortie = sortie or os.path.join(RACINE, "models")
    base = {"male", "female"}
    ids = sorted(os.path.splitext(os.path.basename(p))[0]
                 for p in glob.glob(os.path.join(sortie, "*.json")))
    ids = [i for i in ids if i not in base]
    p = os.path.join(RACINE, "index.html")
    s = open(p, encoding="utf-8").read()
    neuf = "const MODELES_IA={%s}" % ",".join('%s:"%s"' % (i, i) for i in ids)
    s2, n = re.subn(r"const MODELES_IA=\{[^}]*\}", neuf, s, count=1)
    if not n:
        raise SystemExit("MODELES_IA introuvable dans index.html")
    open(p, "w", encoding="utf-8").write(s2)
    print("\nbranches dans le jeu (%d) : %s" % (len(ids), ", ".join(ids)))
    return ids


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        raise SystemExit(1)
    faits, rates = lot(sys.argv[1])
    brancher()
    print("\n%d converti(s), %d echec(s)%s" % (len(faits), len(rates),
                                               (" : " + ", ".join(rates)) if rates else ""))
