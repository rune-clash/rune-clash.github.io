/* =============================================================================
   RUNE CLASH — TEXTES DU SITE
   -----------------------------------------------------------------------------
   Tous les textes des rubriques. Modifie-les ici, le site se met à jour tout seul.
   ============================================================================= */
const CONTENU = {

  /* ---------- Accueil ---------- */
  accroche: 'Jeu de combat 3D · gratuit',
  intro: "Le Prisme s'est brisé. Dans les cinq terres, les héros ont perdu la mémoire. Ta rune vient de se réveiller.",
  supports: 'Navigateur, téléphone ou PC · aucun achat dans le jeu',

  /* ---------- Le jeu ---------- */
  lore: [
    "Le Prisme protégeait les cinq terres. Il y a dix ans, il s'est brisé, et personne ne sait vraiment pourquoi.",
    "Depuis, des failles s'ouvrent dans le ciel et dans le sol. Les héros qu'elles touchent oublient qui ils sont. Ta rune t'a choisi : traverse les cinq terres, ramène-les à eux, et découvre ce qui dort au cœur du Prisme."
  ],
  combat: [
    { t: 'Bouge et frappe', d: "Joystick d'un pouce, attaque de l'autre. Trois coups enchaînés, tout en temps réel." },
    { t: 'Le Spécial', d: 'Quatre techniques par héros : charge, rayon, téléportation, piège, soin…' },
    { t: 'La garde parfaite', d: 'Déclenche la garde juste avant le coup : aucun dégât, et du ki en plus.' },
    { t: "L'Ultime", d: "Quand l'étoile dorée est pleine, libère l'attaque la plus puissante." },
    { t: 'Le sceau de rune', d: "Trace la rune à l'écran avant la fin du temps pour une frappe énorme." },
    { t: 'Une équipe de trois', d: 'Change de héros à tout moment pendant le combat.' }
  ],
  elements: 'Feu, Eau, Foudre, Terre, Ombre et Prisme : chaque élément a son effet (brûlure, ralentissement, paralysie, brise-armure, vol de ki ; le Prisme les réunit tous).',
  modes: ['Histoire', 'En ligne', 'Classé', '1 contre 1', '2 contre 2', 'Tournoi', 'Tour des Runes', 'Raid de boss', 'Défi du jour', 'Survie', 'Événement', 'Entraînement'],
  progression: "Tout se débloque en jouant, avec des tickets d'invocation gagnés en combat et un ticket gratuit toutes les 20 minutes. Les chances sont affichées dans le jeu.",

  /* ---------- Fondateur : les grandes étapes ---------- */
  etapes: [
    { v: 'Les débuts', t: 'Un plateau de runes' },
    { v: 'Refonte', t: 'Le combat en temps réel' },
    { v: 'v9', t: 'Le mode Histoire et ses cinq régions' },
    { v: 'v11', t: 'Le passage à la 3D' },
    { v: 'v16', t: 'Des héros tous différents' },
    { v: 'v17', t: 'Fin des coffres, tout se gagne en jouant' }
  ],

  /* ---------- Mises à jour (la plus récente en premier) ----------
     Pour en ajouter une : copie un bloc { ... }, colle-le tout en haut de la liste et change le texte. */
  majs: [
    { v: '18.1', date: '12 novembre 2026', titre: 'Un seul compte pour le site et le jeu', points: [
      'Nouvelle page Compte sur le site : se connecter ou créer un compte.',
      'C’est le même compte que dans le jeu : connecté sur l’un, connecté sur l’autre (sur le même appareil).',
      'Site plus propre sur téléphone : menu, accueil, page Soutenir, tableaux.'
    ] },
    { v: '18.0', date: '12 novembre 2026', titre: 'Plus léger, plus propre', points: [
      'Le jeu se charge plus vite : 3D deux fois plus légère, code allégé, polices à part.',
      'Grand nettoyage du code : les restes des anciens coffres retirés, moins de rustines entre les versions.',
      'Statistiques anonymes (sans aucun identifiant) pour savoir si le jeu plaît ; désactivables.',
      'Le site s’ouvre tout seul après le logo.'
    ] },
    { v: '17.3', date: '12 novembre 2026', titre: 'Jeu juste et règles claires', points: [
      "Anti-triche : une sauvegarde modifiée hors du jeu est repérée, les valeurs impossibles sont corrigées, et les scores sont vérifiés par le serveur.",
      'Supprimer son compte efface maintenant tout : classements, annonces du marché, rapports de bug compris.',
      'Nouvelles pages : mentions légales, confidentialité, conditions d’utilisation.',
      'Les polices sont intégrées au jeu et au site : plus aucune requête vers Google Fonts.'
    ] },
    { v: '17.1', date: '11 novembre 2026', titre: 'Boutons de combat sur téléphone', points: [
      "Sur certains téléphones en paysage, le bouton Attaque recouvrait le Spécial : c'est corrigé.",
      'Les boutons de combat ne peuvent plus se chevaucher, quelle que soit leur taille.',
      "Mode gaucher : Esquive et Ki passent aussi de l'autre côté."
    ] },
    { v: '17.0', date: '11 novembre 2026', titre: 'Fin des coffres, nouvel accueil', points: [
      "Les coffres disparaissent : toutes les récompenses donnent des tickets d'invocation.",
      'Un ticket gratuit toutes les 20 minutes.',
      "Nouveau décor d'accueil et comparateur de statistiques.",
      'Accueil allégé sur téléphone et PC.'
    ] },
    { v: '16.0', date: '11 novembre 2026', titre: 'Des héros tous différents', points: [
      'Nouveaux héros, et les anciens redessinés : chacun a son espèce, sa silhouette et ses couleurs.'
    ] },
    { v: '15.1', date: '11 novembre 2026', titre: 'Plus de zoom accidentel', points: [
      "Sur téléphone, appuyer plusieurs fois sur un bouton ne zoome plus l'écran."
    ] },
    { v: '15.0', date: '11 novembre 2026', titre: 'Créatures et invocations', points: [
      'Invocations avec plusieurs portails, chances affichées et garantie au bout de 50 invocations.',
      "Les modes se débloquent au fil de l'Histoire.",
      'Combats plus lisibles et plus percutants.'
    ] },
    { v: '14.0', date: '10 novembre 2026', titre: 'Nouvel écran de lancement', points: [
      'Écran de chargement et menu principal refaits.',
      'La Boutique et le Marché entre joueurs sont séparés.'
    ] }
  ]
};
