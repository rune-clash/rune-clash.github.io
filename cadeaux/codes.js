/* =====================================================================
 * Rune Clash — codes cadeaux
 * ---------------------------------------------------------------------
 * C'est le SEUL fichier à modifier pour ajouter, retirer ou changer un code.
 *
 * Règles appliquées par le jeu (Réglages > Compte > Code cadeau) :
 *   - un code fait exactement 6 chiffres (FORMAT) ; les espaces tapés sont retirés ;
 *   - chaque code ne sert qu'une fois par joueur (la liste des codes utilisés est
 *     gardée dans la sauvegarde) ;
 *   - si le joueur a déjà tout ce que le code donne, le code est refusé et N'EST PAS
 *     consommé (il reste utilisable plus tard si cela change).
 *
 * Récompenses possibles :
 *   { type: 'heros', id, arene: true }   héros dans la collection ; avec arene: true,
 *                                         aussi jouable dans les Runes des Trophées
 *   { type: 'tickets', n }                tickets de recrutement
 *   { type: 'pieces', n }                 pièces
 *   { type: 'eclats', n }                 éclats de rune
 *
 * Attention : le jeu tourne dans le navigateur, ces codes sont donc lisibles par qui
 * ouvre ce fichier. Ne mets ici que des cadeaux sans enjeu (pas d'argent réel).
 * ===================================================================== */
window.CODES_CADEAUX = (function () {
  'use strict';
  const FORMAT = /^[0-9]{6}$/;
  const CODES = {
    '110511': { nom: 'Fâris, le Chevalier d\'acier', recompenses: [{ type: 'heros', id: 'eldiablo', arene: true }] },
    '000000': { nom: '10 tickets de recrutement', recompenses: [{ type: 'tickets', n: 10 }] }
  };

  /* garde-fous : une erreur de saisie ici se voit tout de suite dans la console */
  const TYPES = ['heros', 'tickets', 'pieces', 'eclats'];
  Object.keys(CODES).forEach(k => {
    if (!FORMAT.test(k)) console.error('[codes cadeaux] code invalide (6 chiffres attendus) :', k);
    const c = CODES[k];
    if (!c || !Array.isArray(c.recompenses) || !c.recompenses.length) console.error('[codes cadeaux] aucune récompense pour', k);
    else c.recompenses.forEach(r => {
      if (TYPES.indexOf(r.type) < 0) console.error('[codes cadeaux] type inconnu pour', k, r.type);
      if (r.type !== 'heros' && !(r.n > 0)) console.error('[codes cadeaux] quantité manquante pour', k, r);
    });
  });
  return Object.freeze({ FORMAT, CODES: Object.freeze(CODES) });
})();
