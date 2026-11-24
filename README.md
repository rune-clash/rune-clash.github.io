# Rune Clash 3D

Duels de héros en 3D : personnages originaux, Arène des Trophées à 10 joueurs, événements de la semaine, marché.

## Arène des Trophées (mode compétitif)
- `arene/config.js` : **tous les réglages du mode** (10 joueurs, trophées par place, paliers et récompenses de la Route, les 10 personnages, matchmaking, règles de l'arène, niveau des bots).
- `arene/moteur.js` : la simulation (déplacements, attaques, zone qui rétrécit, bots, classement 1er → 10e).
- `arene/rendu.js` : l'affichage vue de dessus et les commandes (tactile, clavier + souris, manette).
- `arene/reseau.js` : le matchmaking (vrais joueurs en priorité, bots pour compléter) et les sessions locale / hôte / invité.
- `arene/arene.css` : les styles du mode.
- Tester sur un serveur local : `python3 -m http.server`, puis ouvrir `http://localhost:8000/?arene_test=1` (les 10 personnages sont débloqués) ; `?netmock=1` simule le serveur en ligne entre plusieurs onglets.

Le jeu s'installe comme une appli depuis le navigateur du téléphone et fonctionne hors ligne après la première ouverture.

## Jeu en ligne (comptes, amis, clubs, duels)
- `config.js` : la configuration Firebase (à remplir une fois, ne pas écraser ensuite).
- `database.rules.json` : les règles de sécurité à coller dans Firebase > Realtime Database > Règles (version 19 : jeu, boîte à conseils du site, anti-triche, statistiques anonymes et salles de l'Arène des Trophées).

## Site officiel et informations légales
- `site/` : le site (mentions légales, confidentialité, conditions d'utilisation comprises). Le jeu y renvoie depuis l'inscription et les Paramètres.
- Avant la mise en ligne : remplis `site/js/config.js`, rubrique `legal` (nom d'un parent comme directeur de la publication, e-mail de contact).

## Nom de domaine
- `DOMAINE.md` : l'adresse du jeu (rune-clash.github.io) et comment passer plus tard à un vrai nom de domaine.
