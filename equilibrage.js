/* =====================================================================
 * Rune Clash — réglages d'équilibrage de l'économie (hors Runes des Trophées)
 * ---------------------------------------------------------------------
 * Les réglages du mode Runes des Trophées (combat, trophées, Route, bots, décor)
 * sont dans arene/config.js. Les codes cadeaux sont dans cadeaux/codes.js.
 * Ici : tickets, recrutement (sans hasard), Forge runique, failles.
 * Une valeur manquante ou invalide est signalée dans la console et le jeu reprend
 * la valeur d'origine.
 * ===================================================================== */
window.EQUILIBRAGE = (function () {
  'use strict';
  const E = {
    /* Tickets de recrutement */
    TICKETS: {
      PRIX_PIECES: 500,             // 1 ticket au marché
      PRIX_PIECES_X10: 4500,        // lot de 10 tickets
      PRIX_ECLATS: 40,              // un recrutement payé en éclats quand il n'y a plus de ticket
      ACHATS_PAR_JOUR: 20,          // tickets achetables par jour avec des pièces
      GRATUIT_TOUTES_LES_MIN: 20    // un ticket gratuit toutes les N minutes
    },
    /* Recrutement d'un héros choisi : fragments par ticket selon la rareté
       [Commun, Rare, Épique, Légendaire, Mythique, Ultime] ; débloquer coûte 10/20/40/80/120/240 fragments */
    RECRUTEMENT: {
      FRAGMENTS_PAR_TICKET: [10, 8, 6, 4, 3, 2],
      BONUS_X10: 11                 // un recrutement ×10 donne les fragments de 11 tickets
    },
    /* Forge runique : rareté des objets donnés pour l'emplacement choisi (0 Commun · 1 Rare · 2 Épique · 3 Légendaire) */
    FORGE: {
      X1: [1],
      X10: [2, 2, 1, 1, 1]
    },
    /* Failles : une faille s'ouvre toutes les 2 heures ; récompense fixe en cas de victoire */
    FAILLES: {
      ECLATS: 55,
      PIECES: 500,
      PALIER_TICKETS: 1             // palier de tickets (0 → 1 ticket, 1 → 2, 2 → 3, 3 → 5, 4 → 10)
    }
  };

  /* ---------- vérifications ---------- */
  const err = m => console.error('[EQUILIBRAGE] ' + m);
  const positif = (o, k, ch) => { if (!(typeof o[k] === 'number' && o[k] >= 0)) err(ch + '.' + k + ' doit être un nombre positif'); };
  Object.keys(E.TICKETS).forEach(k => positif(E.TICKETS, k, 'TICKETS'));
  if (E.RECRUTEMENT.FRAGMENTS_PAR_TICKET.length !== 6) err('RECRUTEMENT.FRAGMENTS_PAR_TICKET : 6 valeurs attendues (une par rareté)');
  E.RECRUTEMENT.FRAGMENTS_PAR_TICKET.forEach((v, i) => { if (!(v >= 1)) err('RECRUTEMENT.FRAGMENTS_PAR_TICKET[' + i + '] doit valoir au moins 1'); });
  ['X1', 'X10'].forEach(k => E.FORGE[k].forEach(r => { if ([0, 1, 2, 3].indexOf(r) < 0) err('FORGE.' + k + ' : rareté invalide ' + r); }));
  Object.keys(E.FAILLES).forEach(k => positif(E.FAILLES, k, 'FAILLES'));
  if (E.FAILLES.PALIER_TICKETS > 4) err('FAILLES.PALIER_TICKETS : 0 à 4');

  const geler = o => { Object.values(o).forEach(v => { if (v && typeof v === 'object') geler(v); }); return Object.freeze(o); };
  return geler(E);
})();
