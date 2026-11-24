/*
 * Rune Clash — Runes des Trophées
 * ================================
 * CONFIGURATION CENTRALE DU MODE. Tout ce qui règle le mode se trouve ici :
 *   - nombre de combattants par partie,
 *   - trophées gagnés / perdus selon la place,
 *   - paliers de la Route des Trophées et leurs récompenses,
 *   - les 10 personnages (identité, statistiques, attaque, super, déblocage),
 *   - le matchmaking (vrais joueurs prioritaires, bots pour compléter),
 *   - les règles de l'arène (zone, stèles, runes, brume…) et le niveau des bots.
 *
 * Modifier une valeur ici suffit : le jeu, le moteur et le réseau lisent tous ce fichier.
 * Les unités de distance sont des « mètres » d'arène (un combattant fait environ 1,1 m de large).
 */
window.ARENE_CONFIG = (function () {
  'use strict';

  const C = {
    VERSION: 2,              // version du protocole réseau : deux versions différentes ne jouent pas ensemble

    /* ---------- Partie ---------- */
    NB_JOUEURS: 10,

    /* Trophées gagnés (positif) ou perdus (négatif) selon la place finale. */
    TROPHEES_PAR_PLACE: {
      1: +15, 2: +11, 3: +8, 4: +5, 5: +3,
      6: -3, 7: -5, 8: -8, 9: -11, 10: -15
    },
    /* Le compteur ne descend jamais sous cette valeur. */
    TROPHEES_MIN: 0,

    /* Pièces gagnées à chaque partie selon la place (en plus des trophées). */
    PIECES_PAR_PLACE: { 1: 120, 2: 95, 3: 80, 4: 65, 5: 55, 6: 45, 7: 35, 8: 25, 9: 20, 10: 15 },

    /* ---------- Route des Trophées ----------
     * Uniquement ces paliers (pas de palier intermédiaire).
     * Types de récompense :
     *   pieces {n} · eclats {n} · tickets {n} · parchemins {n} · soins {soin, n}
     *   fragments {heros, n} · personnage {id} · decor {id} · titre {nom}
     *   cadre {id} (contour du combattant dans le mode)
     *   bouclier {n}    : les n prochaines défaites ne coûtent aucun trophée
     *   boostPieces {n} : pièces ×2 pendant n parties
     * Une récompense se récupère dès que le RECORD de trophées atteint le palier
     * (redescendre ensuite ne la reprend pas).
     */
    PALIERS: [
      { trophees: 50,    recompenses: [{ type: 'personnage', id: 'mizuha' }, { type: 'pieces', n: 300 }] },
      { trophees: 100,   recompenses: [{ type: 'personnage', id: 'seren' }, { type: 'tickets', n: 2 }] },
      { trophees: 150,   recompenses: [{ type: 'personnage', id: 'abyssa' }, { type: 'eclats', n: 40 }] },
      { trophees: 200,   recompenses: [{ type: 'personnage', id: 'shiki' }, { type: 'bouclier', n: 1 }, { type: 'decor', id: 'feu' }] },
      { trophees: 250,   recompenses: [{ type: 'cadre', id: 'bronze' }, { type: 'pieces', n: 1000 }, { type: 'tickets', n: 2 }] },
      { trophees: 300,   recompenses: [{ type: 'personnage', id: 'raimei' }, { type: 'parchemins', n: 3 }] },
      { trophees: 350,   recompenses: [{ type: 'boostPieces', n: 5 }, { type: 'eclats', n: 80 }, { type: 'decor', id: 'eau' }] },
      { trophees: 400,   recompenses: [{ type: 'personnage', id: 'tsuchi' }, { type: 'tickets', n: 3 }] },
      { trophees: 500,   recompenses: [{ type: 'personnage', id: 'eldiablo' }, { type: 'titre', nom: 'Gladiateur' }, { type: 'pieces', n: 2000 }] },
      { trophees: 1000,  recompenses: [{ type: 'cadre', id: 'argent' }, { type: 'fragments', heros: 'kairo', n: 20 }, { type: 'decor', id: 'foudre' }] },
      { trophees: 1500,  recompenses: [{ type: 'tickets', n: 5 }, { type: 'bouclier', n: 2 }, { type: 'soins', soin: 'elixir', n: 3 }] },
      { trophees: 2000,  recompenses: [{ type: 'titre', nom: "Champion des Runes" }, { type: 'decor', id: 'terre' }, { type: 'pieces', n: 5000 }] },
      { trophees: 2500,  recompenses: [{ type: 'fragments', heros: 'astra', n: 30 }, { type: 'eclats', n: 200 }] },
      { trophees: 3000,  recompenses: [{ type: 'cadre', id: 'or' }, { type: 'tickets', n: 8 }, { type: 'decor', id: 'ombre' }] },
      { trophees: 4500,  recompenses: [{ type: 'titre', nom: "Légende des Runes" }, { type: 'pieces', n: 10000 }, { type: 'boostPieces', n: 10 }] },
      { trophees: 5000,  recompenses: [{ type: 'decor', id: 'prisme' }, { type: 'tickets', n: 12 }, { type: 'fragments', heros: 'eldiablo', n: 40 }] },
      { trophees: 7500,  recompenses: [{ type: 'cadre', id: 'prisme' }, { type: 'eclats', n: 500 }, { type: 'tickets', n: 15 }] },
      { trophees: 10000, recompenses: [{ type: 'titre', nom: "Grand Maître des Runes" }, { type: 'tickets', n: 30 }, { type: 'pieces', n: 50000 }] }
    ],

    /* Contours de combattant (récompenses « cadre »). */
    CADRES: {
      base:   { nom: 'Standard', couleur: '#9fb4d8' },
      bronze: { nom: 'Bronze',   couleur: '#d08a4e' },
      argent: { nom: 'Argent',   couleur: '#dfe8f5' },
      or:     { nom: 'Or',       couleur: '#ffd166' },
      prisme: { nom: 'Prisme',   couleur: 'arc' }
    },

    /* Noms affichés des décors de l'accueil débloqués par la Route. */
    DECORS: { feu: 'Braises', eau: 'Abysses', foudre: 'Orage', terre: 'Racines', ombre: 'Nuit sans lune', prisme: 'Prisme' },

    /* ---------- Personnages ----------
     * id          : identifiant du héros du jeu (modèle 3D, vignette, élément).
     * deblocage   : 0 = disponible dès le départ, sinon débloqué par la Route (voir PALIERS).
     * pv          : points de vie de base.   vitesse : m/s.   rechargement : secondes pour regagner UNE charge.
     * forme       : style visuel des projections (flamme, magma, lumiere, vague, etoile, abysse, fil, eclair, roc, neant = acier bleu de Fâris).
     *
     * LISTE DES COUPS (movelist), exécutée par le joueur, une pression = une charge :
     *   attaque   : étape 1        → touche Attaque
     *   combo[0]  : étape 2        → Attaque à nouveau dans la fenêtre de combo
     *   combo[1]  : étape 3, final → Attaque une 3e fois dans la fenêtre (3 charges = combo complet)
     *   elan      : Esquive puis Attaque juste après (attaque d'élan)
     *   special   : projection spéciale, payée en Ki (touche Spécial). Après 2 étapes de combo, elle coûte moins cher.
     *
     * Une étape : type 'tir' (projectiles), 'cone' (frappe en arc devant soi, angle 360 = tout autour) ou 'lob' (en cloche,
     *   passe au-dessus des murs). prep = préparation (s) avant le coup, recup = récupération (s) après.
     *   Propriétés : degats, portee, projectiles, dispersion (°), salve, vitesseProj, rayon, perce, recul (m),
     *   etourdit (s, étourdissement), ralenti {duree, facteur}, avance (m, élan vers l'avant), forme (visuel).
     * Projection spéciale : type 'tir', 'faisceau', 'ruee', 'bouclier', 'invisibilite', 'zone', 'saut', 'attraction' ; cout en Ki.
     */
    PERSONNAGES: [
      {
        id: 'rin', classe: 'Assassin', deblocage: 0, forme: 'flamme',
        resume: 'Rapide et insaisissable : enchaîne les feux follets et finit au corps à corps.',
        pv: 4100, vitesse: 4.9, rechargement: 1.1,
        attaque: { nom: 'Feu follet', type: 'tir', degats: 540, portee: 5.6, projectiles: 1, vitesseProj: 18, rayon: 0.32, prep: 0.07, recup: 0.16 },
        combo: [
          { nom: 'Queue de feu', type: 'tir', degats: 380, portee: 5.0, projectiles: 3, dispersion: 22, vitesseProj: 17, rayon: 0.3, prep: 0.08, recup: 0.18 },
          { nom: 'Brasier rusé', type: 'cone', degats: 950, portee: 2.8, angle: 100, avance: 1.2, recul: 2.2, etourdit: 0.35, prep: 0.12, recup: 0.3 }
        ],
        elan: { nom: 'Griffe du renard', type: 'cone', degats: 720, portee: 2.4, angle: 70, avance: 1.8, prep: 0.05, recup: 0.22 },
        special: { nom: 'Vague de feux follets', type: 'tir', cout: 45, degats: 520, portee: 6.5, projectiles: 7, dispersion: 50, vitesseProj: 16, rayon: 0.42, perce: true, prep: 0.18 }
      },
      {
        id: 'bram', classe: 'Tank', deblocage: 0, forme: 'magma',
        resume: 'Encaisse tout. Deux poings de lave, puis une coulée qui traverse et repousse.',
        pv: 5300, vitesse: 4.0, rechargement: 1.5,
        attaque: { nom: 'Poing de magma', type: 'cone', degats: 820, portee: 2.8, angle: 70, prep: 0.1, recup: 0.22 },
        combo: [
          { nom: 'Revers de lave', type: 'cone', degats: 840, portee: 2.8, angle: 90, recul: 1, prep: 0.1, recup: 0.24 },
          { nom: 'Coulée de lave', type: 'tir', degats: 1100, portee: 5.5, projectiles: 1, vitesseProj: 11, rayon: 0.8, perce: true, recul: 3, forme: 'onde', prep: 0.18, recup: 0.35 }
        ],
        elan: { nom: "Charge d'épaule", type: 'cone', degats: 760, portee: 2.2, angle: 60, avance: 2.2, recul: 2.5, etourdit: 0.3, prep: 0.06, recup: 0.26 },
        special: { nom: 'Carapace de magma', type: 'bouclier', cout: 55, duree: 3, reduction: 0.45, rayon: 3.0, degats: 900, recul: 4, prep: 0.15 }
      },
      {
        id: 'hikari', classe: "Tireuse d'élite", deblocage: 0, forme: 'lumiere',
        resume: "Très longue portée. Son faisceau d'aurore balaie tout sur son passage, sauf derrière un mur.",
        pv: 3500, vitesse: 4.3, rechargement: 1.6,
        attaque: { nom: "Rayon d'aube", type: 'tir', degats: 1150, portee: 10.5, projectiles: 1, vitesseProj: 28, rayon: 0.28, prep: 0.12, recup: 0.22 },
        combo: [
          { nom: "Éclat d'aurore", type: 'tir', degats: 600, portee: 9.5, projectiles: 2, dispersion: 6, vitesseProj: 28, rayon: 0.26, prep: 0.1, recup: 0.22 },
          { nom: 'Lance de lumière', type: 'tir', degats: 1250, portee: 11, projectiles: 1, vitesseProj: 32, rayon: 0.35, perce: true, recul: 1.5, prep: 0.2, recup: 0.3 }
        ],
        elan: { nom: 'Pas de lumière', type: 'tir', degats: 450, portee: 6, projectiles: 3, dispersion: 30, vitesseProj: 24, rayon: 0.26, prep: 0.05, recup: 0.2 },
        special: { nom: "Jugement d'aurore", type: 'faisceau', cout: 55, degats: 2200, portee: 12, largeur: 0.45, duree: 1.0, prep: 0.3 }
      },
      {
        id: 'mizuha', classe: 'Contrôle', deblocage: 50, forme: 'vague',
        resume: 'Ses vagues traversent tout. Son tourbillon repousse ceux qui approchent.',
        pv: 4200, vitesse: 4.2, rechargement: 1.35,
        attaque: { nom: 'Goutte royale', type: 'tir', degats: 600, portee: 7.5, projectiles: 1, vitesseProj: 15, rayon: 0.45, perce: true, prep: 0.09, recup: 0.2 },
        combo: [
          { nom: 'Vague royale', type: 'tir', degats: 700, portee: 7.5, projectiles: 1, vitesseProj: 13, rayon: 0.62, perce: true, prep: 0.1, recup: 0.22 },
          { nom: 'Tourbillon', type: 'cone', degats: 820, portee: 2.7, angle: 360, recul: 2.5, prep: 0.15, recup: 0.3 }
        ],
        elan: { nom: "Glissade d'écume", type: 'tir', degats: 460, portee: 6, projectiles: 2, dispersion: 16, vitesseProj: 16, rayon: 0.4, perce: true, prep: 0.05, recup: 0.2 },
        special: { nom: 'Marée haute', type: 'tir', cout: 50, degats: 1000, portee: 9, projectiles: 1, vitesseProj: 12, rayon: 1.6, perce: true, recul: 5, soinLanceur: 0.2, prep: 0.2 }
      },
      {
        id: 'seren', classe: 'Tireuse rapide', deblocage: 100, forme: 'etoile',
        resume: "Des rafales d'étoiles, une comète qui traverse, et une constellation dans toutes les directions.",
        pv: 3900, vitesse: 4.4, rechargement: 1.0,
        attaque: { nom: 'Étoile filante', type: 'tir', degats: 360, portee: 7.0, projectiles: 1, salve: 2, intervalle: 0.08, vitesseProj: 21, rayon: 0.25, prep: 0.06, recup: 0.18 },
        combo: [
          { nom: 'Pluie d\'étoiles', type: 'tir', degats: 300, portee: 7.0, projectiles: 1, salve: 3, intervalle: 0.08, vitesseProj: 21, rayon: 0.25, prep: 0.06, recup: 0.2 },
          { nom: 'Comète', type: 'tir', degats: 1050, portee: 8, projectiles: 1, vitesseProj: 24, rayon: 0.45, perce: true, recul: 1.5, prep: 0.16, recup: 0.28 }
        ],
        elan: { nom: 'Pas céleste', type: 'tir', degats: 340, portee: 6, projectiles: 3, dispersion: 24, vitesseProj: 20, rayon: 0.25, prep: 0.05, recup: 0.2 },
        special: { nom: 'Constellation', type: 'tir', cout: 50, degats: 560, portee: 6.5, projectiles: 16, dispersion: 360, vitesseProj: 15, rayon: 0.32, prep: 0.2 }
      },
      {
        id: 'abyssa', classe: 'Embuscade', deblocage: 150, forme: 'abysse',
        resume: 'Morsures à moyenne portée, pression qui ralentit, et un leurre pour disparaître.',
        pv: 3700, vitesse: 4.5, rechargement: 1.3,
        attaque: { nom: 'Morsure des fonds', type: 'tir', degats: 420, portee: 6.0, projectiles: 2, dispersion: 8, vitesseProj: 18, rayon: 0.3, prep: 0.07, recup: 0.18 },
        combo: [
          { nom: 'Double morsure', type: 'tir', degats: 470, portee: 6.0, projectiles: 2, dispersion: 4, vitesseProj: 19, rayon: 0.3, prep: 0.07, recup: 0.2 },
          { nom: 'Pression noire', type: 'cone', degats: 950, portee: 2.6, angle: 80, avance: 1, ralenti: { duree: 1, facteur: 0.6 }, prep: 0.12, recup: 0.3 }
        ],
        elan: { nom: 'Plongée', type: 'cone', degats: 800, portee: 2.4, angle: 70, avance: 2, prep: 0.05, recup: 0.24 },
        special: { nom: 'Leurre des fonds', type: 'invisibilite', cout: 40, duree: 4, bonusVitesse: 0.3, bonusProchaineAttaque: 0.8, prep: 0.1 }
      },
      {
        id: 'shiki', classe: 'Marionnettiste', deblocage: 200, forme: 'fil',
        resume: "Ses fils ralentissent, son nœud étourdit, et son ballet attire tout le monde vers elle.",
        pv: 3900, vitesse: 4.3, rechargement: 1.35,
        attaque: { nom: 'Fil du destin', type: 'tir', degats: 560, portee: 7.0, projectiles: 1, vitesseProj: 16, rayon: 0.28, ralenti: { duree: 1, facteur: 0.65 }, prep: 0.08, recup: 0.2 },
        combo: [
          { nom: 'Fils croisés', type: 'tir', degats: 480, portee: 7.0, projectiles: 2, dispersion: 14, vitesseProj: 16, rayon: 0.28, ralenti: { duree: 1, facteur: 0.65 }, prep: 0.08, recup: 0.22 },
          { nom: 'Nœud du destin', type: 'tir', degats: 800, portee: 7.5, projectiles: 1, vitesseProj: 18, rayon: 0.4, perce: true, etourdit: 0.4, prep: 0.15, recup: 0.3 }
        ],
        elan: { nom: 'Pas de marionnette', type: 'tir', degats: 360, portee: 6, projectiles: 3, dispersion: 30, vitesseProj: 17, rayon: 0.26, prep: 0.05, recup: 0.2 },
        special: { nom: 'Ballet macabre', type: 'attraction', cout: 45, portee: 7.5, rayon: 3.4, degats: 1050, force: 4.5, etourdit: 0.6, prep: 0.2 }
      },
      {
        id: 'raimei', classe: 'Artilleur', deblocage: 300, forme: 'eclair',
        resume: "Ses éclairs tombent du ciel par-dessus les murs. Le tonnerre final étourdit.",
        pv: 3500, vitesse: 4.1, rechargement: 1.55,
        attaque: { nom: 'Foudre noire', type: 'lob', degats: 950, portee: 8.0, rayon: 1.2, delai: 0.6, prep: 0.1, recup: 0.22 },
        combo: [
          { nom: 'Double foudre', type: 'lob', degats: 700, portee: 8.0, rayon: 1.1, delai: 0.5, prep: 0.1, recup: 0.22 },
          { nom: 'Tonnerre', type: 'lob', degats: 1000, portee: 8.5, rayon: 1.6, delai: 0.75, etourdit: 0.5, prep: 0.16, recup: 0.3 }
        ],
        elan: { nom: 'Arc électrique', type: 'tir', degats: 600, portee: 5.5, projectiles: 1, vitesseProj: 26, rayon: 0.3, prep: 0.05, recup: 0.2 },
        special: { nom: "Cage d'éclairs", type: 'zone', cout: 55, portee: 8.5, rayon: 2.8, degats: 1300, delai: 0.8, etourdit: 1.3, prep: 0.2 }
      },
      {
        id: 'tsuchi', classe: 'Colosse', deblocage: 400, forme: 'roc',
        resume: 'Montagne vivante. Ses éboulements traversent, son saut écrase tout dans la zone.',
        pv: 5100, vitesse: 3.6, rechargement: 2.0,
        attaque: { nom: 'Poing de roc', type: 'cone', degats: 660, portee: 2.9, angle: 80, prep: 0.12, recup: 0.24 },
        combo: [
          { nom: 'Pas du titan', type: 'cone', degats: 700, portee: 3.0, angle: 100, prep: 0.12, recup: 0.26 },
          { nom: 'Éboulement', type: 'tir', degats: 1000, portee: 6, projectiles: 1, vitesseProj: 10, rayon: 0.9, perce: true, recul: 2.5, etourdit: 0.3, forme: 'onde', prep: 0.22, recup: 0.38 }
        ],
        elan: { nom: 'Bélier', type: 'cone', degats: 900, portee: 2.4, angle: 70, avance: 2, recul: 3, prep: 0.06, recup: 0.28 },
        special: { nom: 'Montagne sacrée', type: 'saut', cout: 60, portee: 7.0, rayon: 2.4, degats: 1200, etourdit: 0.6, duree: 0.65, prep: 0.3 }
      },
      {
        id: 'eldiablo', classe: 'Chevalier', deblocage: 500, forme: 'neant',
        resume: 'Sa lance d\'acier transperce, sa fauche balaie large, et sa charge du serment traverse tout.',
        pv: 4700, vitesse: 4.3, rechargement: 1.5,
        attaque: { nom: 'Lance d\'acier', type: 'tir', degats: 720, portee: 4.6, projectiles: 1, vitesseProj: 30, rayon: 0.4, perce: true, prep: 0.09, recup: 0.2 },
        combo: [
          { nom: 'Fauche', type: 'cone', degats: 780, portee: 2.9, angle: 100, prep: 0.1, recup: 0.24 },
          { nom: 'Percée', type: 'tir', degats: 1150, portee: 5.5, projectiles: 1, vitesseProj: 32, rayon: 0.5, perce: true, recul: 3, etourdit: 0.35, avance: 0.8, prep: 0.16, recup: 0.32 }
        ],
        elan: { nom: 'Estoc', type: 'tir', degats: 900, portee: 5, projectiles: 1, vitesseProj: 32, rayon: 0.42, perce: true, avance: 1.5, prep: 0.05, recup: 0.24 },
        special: { nom: 'Charge du serment', type: 'ruee', cout: 55, distance: 8, vitesse: 20, degats: 1300, recul: 5.5, prep: 0.15 }
      }
    ],

    /* Pour tester : mettre à true rend les 10 personnages jouables tout de suite.
     * (Sur un serveur local, ajouter ?arene_test=1 à l'adresse a le même effet.) */
    DEBLOQUER_TOUS_LES_PERSONNAGES: false,

    /* ---------- Matchmaking ----------
     * MODE 'mixte'   : vrais joueurs en priorité, bots pour compléter jusqu'à NB_JOUEURS.
     * MODE 'joueurs' : la partie ne démarre qu'avec NB_JOUEURS vrais joueurs (aucun bot).
     * Sans compte connecté (ou sans réseau), la partie se joue en local : 1 joueur + 9 bots.
     */
    MATCHMAKING: {
      MODE: 'mixte',
      ATTENTE_MAX_S: 12,        // temps max de recherche avant de compléter avec des bots
      ATTENTE_SEUL_S: 6,        // seul dans la salle après ce délai : on lance avec des bots
      ECART_TROPHEES: 600,      // écart de trophées max pour rejoindre une salle
      SALLE_VALIDE_S: 20,       // une salle en attente plus vieille que ça est ignorée
      COMPTE_A_REBOURS_S: 3,
      ENVOI_ETAT_HZ: 10,        // fréquence d'envoi de l'état par l'hôte
      ENVOI_ENTREES_HZ: 12,     // fréquence d'envoi des commandes par les invités
      COUPURE_S: 6              // plus de nouvelles de l'hôte : partie interrompue
    },

    /* ---------- Règles de l'arène ---------- */
    REGLES: {
      TAILLE: 50,                       // côté de l'arène carrée
      RAYON_COMBATTANT: 0.55,
      /* Anti-spam : 3 charges au maximum. Chaque pression d'attaque (ou étape de combo) en consomme une.
         Une pression trop rapprochée de la précédente, ou sans charge disponible, est refusée (retour visuel et sonore). */
      CHARGES: {
        MAX: 3,
        INTERVALLE_MIN_S: 0.12,         // deux pressions plus rapprochées que ça : la seconde est refusée
        TAMPON_S: 0.15,                 // une pression un peu en avance est gardée et exécutée dès que possible
        PAUSE_RECHARGE_S: 0.35          // la recharge reprend ce délai après la dernière attaque
      },
      /* Fenêtres de combo : la pression suivante enchaîne l'étape d'après si elle arrive entre
         « mi-récupération de l'étape en cours » et « fin de récupération + FERMETURE_S ». Plus tôt : refusée (hors tampon). */
      COMBO: {
        OUVERTURE_RECUP: 0.5,           // la fenêtre s'ouvre à mi-récupération de l'étape en cours (trop tôt = refusé)
        FERMETURE_S: 0.45,              // et se ferme ce délai après la fin de la récupération
        ELAN_FENETRE_S: 0.35,           // Esquive puis Attaque dans ce délai : attaque d'élan
        ANNULATION_RECUP: 0.5,          // part de la récupération qu'une esquive ou une projection peut annuler
        REDUCTION_KI_APRES_COMBO: 0.25, // projection lancée après 2 étapes de combo : coût en Ki réduit de 25 %
        KI_BONUS_FINAL: 8               // Ki gagné quand l'étape finale touche
      },
      ESQUIVE: { DISTANCE: 3.2, DUREE_S: 0.22, INVULNERABLE_S: 0.18, RECHARGE_S: 1.6 },
      KI: {
        MAX: 100, DEPART: 20,
        PAR_SECONDE: 1.5,               // gain passif
        PAR_DEGAT_INFLIGE: 1 / 40,      // 1 point de Ki par 40 dégâts infligés à un combattant
        PAR_DEGAT_RECU: 1 / 90,
        FACTEUR_STELE: 0.25,            // frapper une stèle rapporte moins
        PAR_RUNE: 6,
        AMPLIFIE_SEUIL: 100,            // projection lancée avec le Ki plein : amplifiée (tout le Ki est consommé)
        AMPLIFIE_PUISSANCE: 1.35,
        AMPLIFIE_PORTEE: 1.2
      },
      /* Vitesse de déplacement selon l'état du combattant (1 = vitesse normale). */
      MOUVEMENT: { ATTAQUE: 0.55, PREPARATION: 0.3, FAISCEAU: 0, RECUPERATION_ETOURDI: 0.6 },
      ETOURDI_MAX_S: 2,                  // sécurité anti-blocage
      DELAI_TICK_FAISCEAU_S: 0.1,
      DUREE_MAX_S: 220,                 // sécurité : au-delà, classement aux points de vie
      REGEN: { DELAI_S: 3, PCT_PAR_S: 0.12 },
      ZONE: { DEBUT_S: 20, FIN_S: 160, RAYON_FINAL: 3, DEGATS_PCT_S: 0.07, DEGATS_PCT_S_MAX: 0.22 },
      STELES: { NOMBRE: 24, PV: 3600 },
      RUNES: { BONUS_DEGATS: 0.10, BONUS_PV: 0.08, MAX: 16 },
      /* Cachettes (fourrés de cristal) : on y est invisible à plus de VISIBILITE m des ennemis,
         sauf pendant REVELE_APRES_TIR_S après avoir attaqué ou été touché.
         Embuscade : la première attaque lancée depuis une cachette, sans être repéré, fait +EMBUSCADE_BONUS de dégâts. */
      CACHETTES: { NOMBRE: 12, VISIBILITE: 3.2, REVELE_APRES_TIR_S: 1, EMBUSCADE_BONUS: 0.2 },
      /* Décor tactique (murets, remparts, piliers, cachettes).
         RÈGLE STRICTE : destructible UNIQUEMENT dans les modes listés dans DESTRUCTIBLE_SELON_MODE (Runes des Trophées) ;
         dans tous les autres modes, le même décor est permanent (incassable).
         PV : points de vie de l'élément · SEUIL : un coup plus faible que ça ne l'abîme pas (les petits tirs ne grignotent rien). */
      DECOR: {
        DESTRUCTIBLE_SELON_MODE: { runes: true },
        MURET:    { PV: 3200, SEUIL: 500 },
        REMPART:  { PV: 5400, SEUIL: 700 },
        PILIER:   { PV: 4200, SEUIL: 600 },
        CACHETTE: { PV: 1300, SEUIL: 0, PART_DES_TIRS: 0.35 },  // un tir qui traverse un fourré lui inflige 35 % de ses dégâts
        PART_EXPLOSIONS: 1,                                       // dégâts des explosions et frappes au sol sur le décor
        THEMES: ['feu', 'eau', 'foudre', 'terre', 'ombre', 'prisme']
      }
    },

    /* ---------- Bots ----------
     * Le niveau s'adapte aux trophées du joueur (ou à la moyenne des vrais joueurs).
     */
    BOTS: {
      /* precision : visée · reaction : délai entre deux décisions (s) · agressivite · esquive : chance d'esquiver un danger
         combo : chance d'enchaîner un combo complet (avec le bon rythme) · specialSage : bon usage du Ki */
      NIVEAUX: [
        { jusqua: 150,      precision: 0.55, reaction: 0.5,  agressivite: 0.45, esquive: 0.15, combo: 0.35, specialSage: 0.4 },
        { jusqua: 600,      precision: 0.7,  reaction: 0.38, agressivite: 0.6,  esquive: 0.35, combo: 0.55, specialSage: 0.65 },
        { jusqua: 2000,     precision: 0.82, reaction: 0.28, agressivite: 0.7,  esquive: 0.55, combo: 0.75, specialSage: 0.85 },
        { jusqua: Infinity, precision: 0.9,  reaction: 0.2,  agressivite: 0.8,  esquive: 0.7,  combo: 0.9,  specialSage: 1 }
      ],
      NOMS: ['Kazeko', 'Lune_Rousse', 'Ombrefeu', 'Sora44', 'Tempêtine', 'Rokku', 'Yugen', 'Brasero', 'Nébule', 'Akari_7',
             'Hoshiko', 'Grêlon', 'Mokuzai', 'Vif-Argent', 'Taiko', 'Saphira', 'Kumo', 'Ébène', 'Raijin_9', 'Fennec']
    }
  };

  /* ---------- Vérifications : une erreur de saisie se voit tout de suite dans la console ---------- */
  const err = m => console.error('[ARENE_CONFIG] ' + m);
  for (let p = 1; p <= C.NB_JOUEURS; p++) if (typeof C.TROPHEES_PAR_PLACE[p] !== 'number') err('trophées manquants pour la place ' + p);
  const ids = C.PERSONNAGES.map(x => x.id);
  if (C.PERSONNAGES.length !== 10) err('il faut 10 personnages, il y en a ' + C.PERSONNAGES.length);
  if (new Set(ids).size !== ids.length) err('personnage en double');
  C.PALIERS.forEach((pl, i) => {
    if (i && pl.trophees <= C.PALIERS[i - 1].trophees) err('paliers non croissants à ' + pl.trophees);
    pl.recompenses.forEach(r => { if (r.type === 'personnage' && ids.indexOf(r.id) < 0) err('personnage inconnu ' + r.id); });
  });
  C.PERSONNAGES.forEach(x => {
    if (!x.attaque || !x.combo || x.combo.length !== 2 || !x.elan || !x.special) err(x.id + ' : liste de coups incomplète');
    if (!(x.special.cout > 0) || x.special.cout > C.REGLES.KI.MAX) err(x.id + ' : coût en Ki invalide');
    if (!(x.rechargement > 0)) err(x.id + ' : rechargement manquant');
    if (x.deblocage && !C.PALIERS.some(pl => pl.trophees === x.deblocage && pl.recompenses.some(r => r.type === 'personnage' && r.id === x.id)))
      err(x.id + ' : aucun palier ne le débloque à ' + x.deblocage + ' trophées');
  });

  const gel = o => { Object.values(o).forEach(v => v && typeof v === 'object' && gel(v)); return Object.freeze(o); };
  return gel(C);
})();
