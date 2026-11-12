/* =============================================================================
   RUNE CLASH — RÉGLAGES DU SITE
   -----------------------------------------------------------------------------
   C'est LE fichier à modifier en premier. Tout le reste du site lit ces valeurs.
   Règles simples :
     - garde les guillemets '...' autour du texte (ou "..." si le texte contient une apostrophe) ;
     - une virgule à la fin de chaque ligne d'une liste ;
     - un lien vide '' = le bouton ou la ligne est caché automatiquement.
   ============================================================================= */
const CONFIG = {

  /* --- Bouton principal « Jouer » (en haut, au centre et en bas de la page) --- */
  jouer: {
    // '../' = le jeu est dans le dossier juste au-dessus du site (le site est dans « site/ »).
    // Ce lien marche avec n'importe quel nom de domaine (rune-clash.com, github.io…) : rien à changer le jour où tu changes d'adresse.
    url: '../',
    texte: 'Jouer maintenant'
  },

  /* --- Bouton secondaire ---
     « url » rempli : le bouton y mène directement (fichier, magasin d'applis…).
     « url » vide : le bouton ouvre le guide « Installer l'appli ». */
  telecharger: {
    url: '',
    texte: "Installer l'appli"
  },

  /* --- Fondateur --- */
  fondateur: {
    nom: 'Aykel Drira',
    role: 'Fondateur de Rune Clash',
    citation: "Je voulais un jeu de combat où l'on gagne parce qu'on joue bien, jamais parce qu'on a payé.",
    texte: [
      "Rune Clash a commencé avec une envie simple : créer le jeu de combat que j'aurais voulu trouver sur mon téléphone. Des héros originaux, des combats en temps réel, et rien à acheter pour gagner.",
      "Je suis un jeune entrepreneur. Pas de studio, pas de budget de départ : une idée, et l'envie d'aller au bout. Le jeu s'est construit version après version, en gardant ce qui marchait et en refaisant ce qui ne marchait pas.",
      "Je décide de l'univers, des personnages, de l'équilibre des combats et de ce qui entre dans le jeu. Une règle ne bougera pas : dans le jeu, tout s'obtient en jouant, et rien ne s'achète avec de l'argent réel.",
      "Le projet ne fait que commencer. Laisse-moi un conseil plus bas : je lis tout, et je réponds aux meilleurs directement sur le site."
    ]
  },

  /* --- Mes réseaux (page Soutenir + bas de l'Accueil) ---
     Colle tes liens entre les guillemets. Tant qu'un lien est vide, la case affiche « Bientôt ».
     Pour l'e-mail, mets seulement l'adresse (ex. 'runeclash.contact@gmail.com') :
     de préférence une adresse créée pour le jeu, pas ton adresse personnelle. */
  reseaux: [
    { nom: 'TikTok', detail: 'Les combats et les nouveautés', url: '' },
    { nom: 'YouTube', detail: 'Bandes-annonces et coulisses', url: '' },
    { nom: 'Instagram', detail: 'Images des nouveaux héros', url: '' },
    { nom: 'Snapchat', detail: 'Les coulisses au jour le jour', url: '' },
    { nom: 'Discord', detail: 'Discuter avec les joueurs', url: '' },
    { nom: 'E-mail', detail: 'Pour me contacter', email: 'rune-clash.officiel@proton.me' }
  ],

  /* --- Soutenir : trois soutiens uniques (on paie une seule fois, aucun abonnement) ---
     « url » : le lien Revolut avec le montant déjà rempli (bouton « Apple Pay ou carte »)
       (?amount= en centimes : 99 = 0,99 €, 499 = 4,99 €, 999 = 9,99 €).
       Sur la page Revolut, le visiteur paie avec Apple Pay, une carte ou Revolut.
     « paypal » : le lien PayPal.me avec le montant déjà rempli (/4.99EUR à la fin).
     Tant qu'un lien est vide, le bouton affiche « Bientôt disponible ».
     Les avantages sont écrits ici : tu peux les changer. */
  soutien: {
    formules: [
      { nom: 'Éclat', prix: '0,99 €', url: 'https://revolut.me/sawaldrou91?amount=99&currency=EUR', paypal: 'https://www.paypal.me/SawalDROU/0.99EUR', avantages: [
        'Ton pseudo sur le mur des soutiens du site',
        'Un merci dans la prochaine note de mise à jour'
      ] },
      { nom: 'Sceau', prix: '4,99 €', conseille: true, url: 'https://revolut.me/sawaldrou91?amount=499&currency=EUR', paypal: 'https://www.paypal.me/SawalDROU/4.99EUR', avantages: [
        "Tout ce qu'offre Éclat",
        'Tu votes pour la prochaine nouveauté du jeu (héros, mode ou décor)',
        'Les coulisses : les images de la prochaine mise à jour avant tout le monde'
      ] },
      { nom: 'Prisme', prix: '9,99 €', url: 'https://revolut.me/sawaldrou91?amount=999&currency=EUR', paypal: 'https://www.paypal.me/SawalDROU/9.99EUR', avantages: [
        "Tout ce qu'offre Sceau",
        'Je réponds à ton conseil par e-mail',
        "Tu proposes un ajout ou une modification du jeu : s'il est faisable et juste pour tous, je l'ajoute",
        'Ton nom dans les crédits du jeu'
      ] }
    ],
    // Pseudos des personnes qui soutiennent (avec leur accord), affichés sur le mur des soutiens
    mur: []
  },

  /* --- Boîte à conseils : connexion au serveur Firebase du jeu ---
     Si le site est rangé dans le dossier « site » du dépôt du jeu, laisse null :
     il utilise automatiquement le config.js du jeu.
     Sinon, colle ici le même contenu que dans le config.js du jeu, par exemple :
     firebase: { apiKey: '...', authDomain: '...', databaseURL: '...', projectId: '...', appId: '...' }, */
  firebase: null,

  /* --- Contact (adresse e-mail affichée en bas de l'Accueil ; '' pour la cacher) --- */
  contact: '',

  /* --- Écran d'entrée : durée (en millisecondes) avant que le site s'ouvre tout seul --- */
  entreeAuto: 2200,

  /* --- Informations légales (pages Mentions légales, Confidentialité, Conditions) ---
     À REMPLIR AVANT DE METTRE LE SITE EN LIGNE, avec un parent :
       - directeur : le nom et le prénom d'un parent. La loi demande que le « directeur de la publication »
         soit majeur. C'est lui qui répond légalement du site.
       - email : une adresse où l'on peut te joindre (la loi l'exige pour les demandes sur les données
         personnelles et pour signaler un contenu). Mets l'adresse pro du jeu, pas ton adresse perso.
     Tant qu'un champ est vide, la page affiche « à compléter » en rouge : c'est fait exprès, pour ne pas l'oublier. */
  legal: {
    editeur: 'Aykel Drira',
    directeur: 'Aykel Drira',
    email: 'rune-clash.officiel@proton.me',
    miseAJour: '11 novembre 2026'
  }
};
