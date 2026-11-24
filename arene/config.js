/*
 * Rune Clash — Arène des Trophées
 * ================================
 * CONFIGURATION CENTRALE DU MODE. Tout ce qui règle l'Arène se trouve ici :
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
    VERSION: 1,

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
     *   cadre {id} (contour du combattant dans l'Arène)
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
      { trophees: 2000,  recompenses: [{ type: 'titre', nom: "Champion de l'Arène" }, { type: 'decor', id: 'terre' }, { type: 'pieces', n: 5000 }] },
      { trophees: 2500,  recompenses: [{ type: 'fragments', heros: 'astra', n: 30 }, { type: 'eclats', n: 200 }] },
      { trophees: 3000,  recompenses: [{ type: 'cadre', id: 'or' }, { type: 'tickets', n: 8 }, { type: 'decor', id: 'ombre' }] },
      { trophees: 4500,  recompenses: [{ type: 'titre', nom: "Légende de l'Arène" }, { type: 'pieces', n: 10000 }, { type: 'boostPieces', n: 10 }] },
      { trophees: 5000,  recompenses: [{ type: 'decor', id: 'prisme' }, { type: 'tickets', n: 12 }, { type: 'fragments', heros: 'eldiablo', n: 40 }] },
      { trophees: 7500,  recompenses: [{ type: 'cadre', id: 'prisme' }, { type: 'eclats', n: 500 }, { type: 'tickets', n: 15 }] },
      { trophees: 10000, recompenses: [{ type: 'titre', nom: "Immortel de l'Arène" }, { type: 'tickets', n: 30 }, { type: 'pieces', n: 50000 }] }
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
     * id        : identifiant du héros du jeu (modèle 3D, vignette, élément).
     * deblocage : 0 = disponible dès le départ, sinon débloqué par la Route (voir PALIERS).
     * pv        : points de vie de base.   vitesse : m/s.
     * attaque   : tir principal (3 charges, rechargées une par une).
     *   type 'tir'  : projectiles en ligne droite (projectiles, dispersion en degrés, salve…)
     *   type 'cone' : frappe immédiate en arc de cercle devant soi
     *   type 'lob'  : projectile en cloche qui passe au-dessus des murs et explose à l'arrivée
     * super     : capacité spéciale, chargée en touchant des ennemis (charge = dégâts à infliger).
     *   types : 'tir', 'ruee', 'bouclier', 'soin', 'invisibilite', 'zone', 'saut', 'attraction'
     */
    PERSONNAGES: [
      {
        id: 'rin', classe: 'Assassin', deblocage: 0,
        resume: 'Rapide et insaisissable : trois feux follets en éventail, puis une ruée enflammée.',
        pv: 3800, vitesse: 4.9,
        attaque: { nom: 'Feux follets', type: 'tir', degats: 460, portee: 5.2, rechargement: 1.25, projectiles: 3, dispersion: 22, vitesseProj: 17, rayon: 0.32 },
        super: { nom: 'Ruée du renard', type: 'ruee', charge: 3000, distance: 6.5, vitesse: 22, degats: 1100, recul: 3 }
      },
      {
        id: 'bram', classe: 'Tank', deblocage: 0,
        resume: 'Encaisse tout. Ses poings de lave frappent large et fort de près.',
        pv: 6400, vitesse: 4.0,
        attaque: { nom: 'Coulée de lave', type: 'cone', degats: 1050, portee: 3.0, angle: 70, rechargement: 1.45 },
        super: { nom: 'Carapace de magma', type: 'bouclier', charge: 3600, duree: 3.5, reduction: 0.55, rayon: 3.0, degats: 900, recul: 4 }
      },
      {
        id: 'hikari', classe: 'Tireuse d\'élite', deblocage: 0,
        resume: 'Un rayon de lumière très long et précis. Sa couronne la soigne et la protège.',
        pv: 3000, vitesse: 4.2,
        attaque: { nom: 'Rayon d\'aurore', type: 'tir', degats: 1150, portee: 10.5, rechargement: 1.9, projectiles: 1, vitesseProj: 28, rayon: 0.3 },
        super: { nom: 'Couronne de lumière', type: 'soin', charge: 3200, soin: 0.45, bouclierDuree: 3, reduction: 0.35 }
      },
      {
        id: 'mizuha', classe: 'Contrôle', deblocage: 50,
        resume: 'Ses vagues traversent les ennemis. La marée haute repousse tout le monde.',
        pv: 4200, vitesse: 4.2,
        attaque: { nom: 'Vague royale', type: 'tir', degats: 720, portee: 7.5, rechargement: 1.35, projectiles: 1, vitesseProj: 13, rayon: 0.55, perce: true },
        super: { nom: 'Marée haute', type: 'tir', charge: 3400, degats: 1000, portee: 8.5, projectiles: 1, vitesseProj: 12, rayon: 1.5, perce: true, recul: 5, soinLanceur: 0.2 }
      },
      {
        id: 'seren', classe: 'Tireuse rapide', deblocage: 100,
        resume: 'Une rafale d\'étoiles à moyenne portée. Sa constellation explose dans toutes les directions.',
        pv: 3500, vitesse: 4.4,
        attaque: { nom: 'Étoile filante', type: 'tir', degats: 340, portee: 7.0, rechargement: 1.1, projectiles: 1, salve: 3, intervalle: 0.09, vitesseProj: 21, rayon: 0.25 },
        super: { nom: 'Constellation', type: 'tir', charge: 3000, degats: 560, portee: 6.5, projectiles: 16, dispersion: 360, vitesseProj: 15, rayon: 0.32 }
      },
      {
        id: 'abyssa', classe: 'Embuscade', deblocage: 150,
        resume: 'Morsures à moyenne portée. Le leurre la rend invisible et dope sa prochaine attaque.',
        pv: 3700, vitesse: 4.5,
        attaque: { nom: 'Morsure des fonds', type: 'tir', degats: 470, portee: 6.0, rechargement: 1.35, projectiles: 2, dispersion: 8, vitesseProj: 18, rayon: 0.3 },
        super: { nom: 'Leurre', type: 'invisibilite', charge: 2800, duree: 4, bonusVitesse: 0.3, bonusProchaineAttaque: 0.8 }
      },
      {
        id: 'shiki', classe: 'Marionnettiste', deblocage: 200,
        resume: 'Ses fils ralentissent. Le fil du destin attire tous les ennemis d\'une zone.',
        pv: 3900, vitesse: 4.3,
        attaque: { nom: 'Fils du destin', type: 'tir', degats: 480, portee: 7.0, rechargement: 1.35, projectiles: 2, dispersion: 14, vitesseProj: 16, rayon: 0.28, ralenti: { duree: 1.2, facteur: 0.6 } },
        super: { nom: 'Ballet macabre', type: 'attraction', charge: 3200, portee: 7.5, rayon: 3.4, degats: 700, force: 4.5, etourdit: 0.6 }
      },
      {
        id: 'raimei', classe: 'Artilleur', deblocage: 300,
        resume: 'Ses éclairs tombent du ciel par-dessus les murs. La cage d\'éclairs étourdit.',
        pv: 3300, vitesse: 4.1,
        attaque: { nom: 'Foudre noire', type: 'lob', degats: 900, portee: 8.0, rechargement: 1.7, rayon: 1.25, delai: 0.6 },
        super: { nom: 'Cage d\'éclairs', type: 'zone', charge: 3000, portee: 8.5, rayon: 2.8, degats: 1300, delai: 0.8, etourdit: 1.3 }
      },
      {
        id: 'tsuchi', classe: 'Colosse', deblocage: 400,
        resume: 'Montagne vivante. Son saut écrase tout dans la zone d\'impact.',
        pv: 7000, vitesse: 3.8,
        attaque: { nom: 'Pas du titan', type: 'cone', degats: 880, portee: 3.2, angle: 100, rechargement: 1.75 },
        super: { nom: 'Montagne sacrée', type: 'saut', charge: 3800, portee: 7.5, rayon: 2.6, degats: 1500, etourdit: 0.9, duree: 0.65 }
      },
      {
        id: 'eldiablo', classe: 'Chevalier', deblocage: 500,
        resume: 'Sa lance transperce en ligne. Sa charge damnée traverse et projette.',
        pv: 5600, vitesse: 4.3,
        attaque: { nom: 'Lance du Néant', type: 'tir', degats: 900, portee: 4.6, rechargement: 1.35, projectiles: 1, vitesseProj: 30, rayon: 0.42, perce: true },
        super: { nom: 'Charge damnée', type: 'ruee', charge: 3400, distance: 8, vitesse: 20, degats: 1500, recul: 5.5 }
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
      MUNITIONS: 3,
      INTERVALLE_TIR_MIN: 0.28,         // délai minimal entre deux attaques
      DUREE_MAX_S: 220,                 // sécurité : au-delà, classement aux points de vie
      REGEN: { DELAI_S: 3, PCT_PAR_S: 0.12 },
      ZONE: { DEBUT_S: 20, FIN_S: 160, RAYON_FINAL: 3, DEGATS_PCT_S: 0.07, DEGATS_PCT_S_MAX: 0.22 },
      STELES: { NOMBRE: 24, PV: 3600 },
      RUNES: { BONUS_DEGATS: 0.10, BONUS_PV: 0.08, MAX: 16 },
      BRUME: { NOMBRE: 10, VISIBILITE: 3.2, REVELE_APRES_TIR_S: 1 }
    },

    /* ---------- Bots ----------
     * Le niveau s'adapte aux trophées du joueur (ou à la moyenne des vrais joueurs).
     */
    BOTS: {
      NIVEAUX: [
        { jusqua: 150,      precision: 0.55, reaction: 0.55, agressivite: 0.45, esquive: 0.15, superSage: 0.4 },
        { jusqua: 600,      precision: 0.7,  reaction: 0.4,  agressivite: 0.6,  esquive: 0.35, superSage: 0.65 },
        { jusqua: 2000,     precision: 0.82, reaction: 0.28, agressivite: 0.7,  esquive: 0.55, superSage: 0.85 },
        { jusqua: Infinity, precision: 0.9,  reaction: 0.2,  agressivite: 0.8,  esquive: 0.7,  superSage: 1 }
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
    if (x.deblocage && !C.PALIERS.some(pl => pl.trophees === x.deblocage && pl.recompenses.some(r => r.type === 'personnage' && r.id === x.id)))
      err(x.id + ' : aucun palier ne le débloque à ' + x.deblocage + ' trophées');
  });

  const gel = o => { Object.values(o).forEach(v => v && typeof v === 'object' && gel(v)); return Object.freeze(o); };
  return gel(C);
})();
