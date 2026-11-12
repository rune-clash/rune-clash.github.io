# Site officiel de Rune Clash

Un site sobre, noir et or. À l'ouverture, seul le logo s'affiche avec le Prisme en 3D : un clic ouvre le site. Chaque rubrique (Accueil, Le jeu, Fondateur, Mises à jour, Conseils) est un écran à part : on passe de l'une à l'autre avec la barre du haut, sans faire défiler la page. Chaque rubrique a son adresse (…#conseils, …#fondateur) pour partager un lien direct ; un lien direct saute l'écran d'entrée, et l'écran d'entrée ne s'affiche qu'une fois par visite.

## Ce que tu modifieras le plus souvent

| Je veux… | Fichier | Où |
|---|---|---|
| changer le lien du bouton **Jouer** | `js/config.js` | `jouer.url` |
| mettre un lien de téléchargement | `js/config.js` | `telecharger.url` (vide = guide « Installer l'appli ») |
| changer mon texte de fondateur | `js/config.js` | `fondateur` |
| ajouter un réseau social | `js/config.js` | `communaute` (lien vide = caché) |
| écrire une nouvelle mise à jour | `js/contenu.js` | copier un bloc en haut de `majs` |
| changer un texte du jeu | `js/contenu.js` | la rubrique correspondante |
| changer une couleur ou une police | `css/site.css` | les variables tout en haut (`:root`) |

Garde les guillemets autour des textes et une virgule à la fin de chaque ligne d'une liste.

## Soutenir et réseaux

Tout se règle dans `js/config.js` :
- `reseaux` : colle le lien de chaque réseau (TikTok, YouTube, Instagram, Snapchat, Discord) et l'adresse e-mail. Une case vide affiche « Bientôt ».
- `soutien` : les trois soutiens uniques (0,99 €, 4,99 €, 9,99 €) : lien de paiement Revolut avec le montant déjà rempli, et leurs avantages. Un lien vide affiche « Bientôt disponible ».
- `soutien.mur` : les pseudos des personnes qui soutiennent (avec leur accord), par exemple `mur: ['LameBleue', 'Kaito']`.

Le site ne prend pas l'argent lui-même : chaque bouton mène à une page de paiement (Tipeee, Ko-fi, Patreon…). Ces services demandent d'être majeur et une pièce d'identité, donc c'est un parent qui crée le compte et reçoit les paiements.

## Informations légales (à faire avant la mise en ligne)

Les pages Mentions légales, Confidentialité et Conditions d'utilisation sont prêtes (liens en bas de l'Accueil).
Dans `js/config.js`, rubrique `legal`, remplis avec un parent :
- `directeur` : nom et prénom d'un parent. La loi demande un directeur de la publication majeur.
- `email` : l'adresse de contact du jeu.

Tant que c'est vide, les pages affichent « à compléter » en rouge. Fais relire les trois pages par un parent : je ne remplace pas un juriste.

## Mettre en ligne

Le plus simple : dans le dépôt GitHub du jeu, crée un dossier `site` et mets-y tout le contenu de ce dossier.
Adresse du site : `https://rune-clash.github.io/site/` (dépôt `rune-clash/rune-clash.github.io`). Pour un vrai nom de domaine plus tard : voir `DOMAINE.md` dans le zip du jeu.

Rangé là, le site utilise tout seul le `config.js` du jeu pour se connecter au serveur (rien à recopier).

## Boîte à conseils : à faire une seule fois

1. **Règles** : console Firebase > Realtime Database > Règles. Remplace tout par le contenu de `regles-firebase-v18.json`, puis Publier. (Ce fichier contient les règles du jeu + celles des conseils.)
2. **Connexion anonyme** : console Firebase > Authentication > Méthodes de connexion > Anonyme > Activer. C'est ce qui permet aux visiteurs d'envoyer un conseil sans créer de compte.
3. **Tes droits de fondateur** : ouvre `…/site/#espace-fondateur` (lien « Espace fondateur » en bas de page) et connecte-toi avec ton compte du jeu. La page affiche ton identifiant. Dans la console Firebase > Realtime Database > Données, ajoute `admins` > ton identifiant > `true`. Recharge la page.

Ensuite, dans l'Espace fondateur, tu vois les conseils reçus. Pour chacun : écris ta réponse et **Publier avec ma réponse** (le conseil et ta réponse apparaissent sur le site), ou **Supprimer sans publier**. Tu peux aussi retirer du site un conseil déjà publié.

Sécurité :
- un conseil n'est visible par personne d'autre que toi tant que tu ne l'as pas publié ;
- un visiteur ne peut envoyer qu'un conseil par minute, de 5 à 600 caractères ;
- le texte des visiteurs est toujours affiché comme du texte simple (personne ne peut glisser du code dans la page).

Si le site est dans un autre dépôt que le jeu, colle la configuration Firebase du jeu dans `js/config.js`, ligne `firebase`.

## Les fichiers

```
index.html               la page
css/site.css             tout le style
js/config.js             les réglages : liens, fondateur, réseaux, serveur, infos légales  ← à modifier
js/contenu.js            les textes : le jeu, étapes, mises à jour  ← à modifier
js/scene-3d.js           le Prisme en 3D (Three.js)
js/conseils.js           la boîte à conseils et l'espace fondateur
js/site.js               le fonctionnement de la page
js/vendor/three.min.js   la bibliothèque 3D (copie locale, licence MIT)
fonts/                   les polices (copies locales, licence OFL : rien n'est chargé chez Google)
regles-firebase-v18.json règles de sécurité du serveur (jeu + conseils + anti-triche)
img/                     icône et image d'aperçu de partage
```

Après la mise en ligne, remplace dans `index.html` la ligne `og:image` par l'adresse complète de `img/partage.jpg` (par exemple `https://rune-clash.com/site/img/partage.jpg`) pour que l'aperçu s'affiche quand on partage le lien.

## Tester sur ton ordinateur

Dans le dossier du site : `python3 -m http.server 8770`, puis ouvre `http://localhost:8770`.
