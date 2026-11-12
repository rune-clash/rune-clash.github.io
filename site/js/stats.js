/* =============================================================================
   RUNE CLASH — STATISTIQUES ANONYMES DU SITE
   -----------------------------------------------------------------------------
   Compte, par jour et sans aucun identifiant : les visites (une par navigateur et par jour),
   les clics sur « Jouer » et les clics sur un bouton de soutien.
   Le serveur reçoit seulement « +1 » sur un compteur du jour (règles Firebase : stats/j).
   Aucune bibliothèque chargée : un simple appel web, seulement si le site est relié au serveur du jeu.
   Refusable sur la page Confidentialité (même réglage que dans le jeu : « rc_stats_off »).
   Le navigateur qui envoie « Global Privacy Control » ou « Do Not Track » n'est jamais compté.
   Tu lis les résultats dans l'Espace fondateur.
   ============================================================================= */
const Stats = (function () {
  const OFF = 'rc_stats_off', VU = 'rc_site_jour';
  const jour = () => { const d = new Date(); return String(d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()); };
  function refuse() { try { return localStorage.getItem(OFF) === '1' || navigator.globalPrivacyControl === true || navigator.doNotTrack === '1'; } catch (e) { return true; } }
  function plus(k) {
    if (refuse() || navigator.webdriver) return;
    const c = typeof Conseils !== 'undefined' && Conseils.cfg(); if (!c) return;
    const url = c.databaseURL.replace(/\/$/, '') + '/stats/j/' + jour() + '/' + k + '.json';
    try { fetch(url, { method: 'PUT', body: '{".sv":{"increment":1}}', keepalive: true }).catch(() => {}); } catch (e) { /* jamais bloquant */ }
  }
  function demarrer() {
    // une visite par navigateur et par jour
    try { if (localStorage.getItem(VU) !== jour() && !refuse()) { localStorage.setItem(VU, jour()); plus('site'); } } catch (e) { /* */ }
    document.addEventListener('click', e => {
      if (e.target.closest('[data-lien="jouer"]')) plus('jouer');
      else if (e.target.closest('.payer a')) plus('soutien');
    }, true);
  }
  function activer(oui) { try { if (oui) localStorage.removeItem(OFF); else { localStorage.setItem(OFF, '1'); localStorage.removeItem(VU); localStorage.removeItem('rc_stats'); } } catch (e) { /* */ } }
  return { demarrer, refuse, activer, jour };
})();
