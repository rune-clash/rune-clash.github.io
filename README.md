# Rune Clash 3D

Duels de héros en 3D : personnages originaux, Runes des Trophées à 10 joueurs, événements de la semaine, marché.

## Runes des Trophées (mode compétitif)
- `arene/config.js` : **tous les réglages du mode** (10 joueurs, trophées par place, paliers et récompenses de la Route, les 10 personnages, matchmaking, règles de l'arène, niveau des bots).
- `arene/moteur.js` : la simulation (déplacements, attaques, zone qui rétrécit, bots, classement 1er → 10e).
- `arene/rendu.js` : l'affichage vue de dessus et les commandes (tactile, clavier + souris, manette).
- `arene/reseau.js` : le matchmaking (vrais joueurs en priorité, bots pour compléter) et les sessions locale / hôte / invité.
- `arene/arene.css` : les styles du mode.
- Combat : 3 charges anti-spam, combos par personnage (A·A·A, Esquive→A, A·A→Spécial), esquive, Ki et projections spéciales. Tous les réglages sont dans `arene/config.js` (CHARGES, COMBO, ESQUIVE, KI, MOUVEMENT, listes de coups).
- Décor tactique : murets, remparts, piliers et fourrés-cachettes. Règle stricte : destructible uniquement dans Runes des Trophées (`REGLES.DECOR.DESTRUCTIBLE_SELON_MODE`), permanent dans tous les autres modes. PV et seuil de dégâts par élément dans `REGLES.DECOR`.
- Tests automatiques (Node, sans installation) : `node outils/tests-arene/moteur.test.js`, `node outils/tests-arene/decor.test.js`, `node outils/tests-arene/reseau.test.js`, `node outils/tests-arene/equilibrage.js 160`.
- Tester sur un serveur local : `python3 -m http.server`, puis ouvrir `http://localhost:8000/?arene_test=1` (les 10 personnages sont débloqués) ; `?netmock=1` simule le serveur en ligne entre plusieurs onglets.

## Contenus conformes (v23.3)
- **Recrutement sans hasard** (remplace l'invocation au tirage) : le joueur choisit le héros ou l'emplacement d'objet et sait d'avance ce qu'il reçoit. Réglages en tête du bloc v23.3 de `index.html` (`REC23` : fragments par ticket selon la rareté, bonus ×10, objets de la Forge).
- **Fâris, le Chevalier d'acier** (ancien « El Diablo », identifiant interne `eldiablo` conservé pour les sauvegardes) : `python3 outils/refaire_faris.py` rentre les cornes dans le casque et passe l'armure noir/rouge en acier bleuté.
- **Tenues couvrantes** : `python3 outils/tenues_couvrantes.py rin seika …` repeint en tissu la peau des bras, du buste et des jambes (visage et mains intacts). `--apercu DOSSIER` produit des images avant/après sans rien modifier.
- **Rythmes coupés par défaut** (une seule fois pour les anciennes sauvegardes ; réactivables dans Réglages > Son).

Le jeu s'installe comme une appli depuis le navigateur du téléphone et fonctionne hors ligne après la première ouverture.

## Jeu en ligne (comptes, amis, clubs, duels)
- `config.js` : la configuration Firebase (à remplir une fois, ne pas écraser ensuite).
- `database.rules.json` : les règles de sécurité à coller dans Firebase > Realtime Database > Règles (version 19 : jeu, boîte à conseils du site, anti-triche, statistiques anonymes et salles des Runes des Trophées).

## Site officiel et informations légales
- `site/` : le site (mentions légales, confidentialité, conditions d'utilisation comprises). Le jeu y renvoie depuis l'inscription et les Paramètres.
- Avant la mise en ligne : remplis `site/js/config.js`, rubrique `legal` (nom d'un parent comme directeur de la publication, e-mail de contact).

## Nom de domaine
- `DOMAINE.md` : l'adresse du jeu (rune-clash.github.io) et comment passer plus tard à un vrai nom de domaine.
