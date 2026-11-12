# Adresse de Rune Clash

## Aujourd'hui (v18)

- Jeu : **https://rune-clash.github.io/**
- Site officiel : **https://rune-clash.github.io/site/**
- Dépôt GitHub : `rune-clash/rune-clash.github.io` (organisation gratuite « rune-clash », qui t'appartient)

L'ancienne adresse `ayk942.github.io/rune-clash` (dépôt `Ayk942/rune-clash`) ne contient plus qu'une **redirection** :
- elle envoie vers la nouvelle adresse en emportant la progression des joueurs sans compte (dans l'adresse, `#import=…`) ;
- l'appli déjà installée sur un téléphone se met à jour toute seule et part vers la nouvelle adresse.

**Ne supprime pas** le dépôt `Ayk942/rune-clash` tant que des joueurs peuvent encore utiliser l'ancienne adresse (liens dans tes bios, applis installées).

Tous les liens entre le jeu et le site sont relatifs : rien à changer dans le code si l'adresse change encore.

## Plus tard : un vrai nom de domaine (rune-clash.com, rune-clash.site…)

C'est payant (environ 10 à 30 € par an) et **c'est un parent qui l'achète** (il faut être majeur).

1. **Vérifier que le nom est libre** chez un registraire (OVHcloud ou Gandi, deux sociétés françaises). `runeclash.com` (sans tiret) appartient déjà à quelqu'un.
2. **Acheter le nom** sans aucune option (pas d'hébergement), avec le renouvellement automatique.
3. **DNS** (chez le registraire) :

   | Type | Nom | Valeur |
   |---|---|---|
   | A | @ | 185.199.108.153 |
   | A | @ | 185.199.109.153 |
   | A | @ | 185.199.110.153 |
   | A | @ | 185.199.111.153 |
   | CNAME | www | rune-clash.github.io. |

4. **GitHub** : dépôt `rune-clash.github.io` › Settings › Pages › Custom domain : le nom acheté › Save, puis cocher **Enforce HTTPS** quand c'est possible. Ne supprime jamais le fichier `CNAME` que GitHub crée.
5. **Firebase** : Authentication › Paramètres › Domaines autorisés › ajouter le nom acheté.

`rune-clash.github.io` renverra alors automatiquement vers le nouveau nom.
Attention : comme lors du passage à rune-clash.github.io, la progression des joueurs **sans compte** est liée à l'adresse. Préviens-les à l'avance de créer un compte.

## Le nom « Rune Clash »

Avant de payer de la publicité, vérifie avec un parent sur **data.inpi.fr** et **euipo.europa.eu/eSearch** qu'aucune marque « Rune Clash » n'existe déjà pour des jeux vidéo. Le mot « Clash » est très utilisé dans les jeux.
