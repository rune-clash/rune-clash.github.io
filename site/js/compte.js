/* =============================================================================
   RUNE CLASH — COMPTE (se connecter / créer un compte)
   -----------------------------------------------------------------------------
   Le site et le jeu sont à la même adresse et utilisent le même serveur : c'est LE MÊME compte
   et la même session. Se connecter ici connecte aussi le jeu sur cet appareil (et inversement).
   Le code réseau est celui du jeu (js/net-jeu.js, copie de v3/net.js faite par la construction) :
   même création de compte, même pseudo, mêmes règles.
   Firebase n'est chargé que si on ouvre la page Compte, l'Espace fondateur ou si on envoie un conseil.
   ============================================================================= */
const Compte = (function () {
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CGU_VER = '2026-11-11';
  let onglet = 'in', pret = null, branche = false;

  // prépare la connexion au serveur (une seule fois)
  function demarrer() {
    if (pret) return pret;
    pret = (async () => {
      if (typeof NET === 'undefined') return false;
      if (!window.FIREBASE_CONFIG && CONFIG.firebase) window.FIREBASE_CONFIG = CONFIG.firebase;
      NET.noPresence = true;
      const ok = await NET.init();
      if (ok && !branche) { branche = true; NET.on('auth', () => { afficher(); etiquette(); }); NET.on('me', () => { afficher(); etiquette(); }); }
      return ok;
    })();
    return pret;
  }
  const connecte = () => typeof NET !== 'undefined' && NET.ready && !!NET.user;
  const complet = () => connecte() && NET.me && NET.me.pseudo;

  // libellé du lien de la barre du haut : « Se connecter » ou le pseudo
  function etiquette() {
    const a = $('#lien-compte'); if (!a) return;
    a.textContent = complet() ? NET.me.pseudo : connecte() ? 'Mon compte' : 'Se connecter';
  }

  function afficher() {
    const z = $('#compte-zone'); if (!z) return;
    if (typeof NET === 'undefined' || !NET.configured()) {
      z.innerHTML = '<p class="doux">La connexion sera disponible sur le site en ligne (rune-clash.github.io/site).</p>'; return;
    }
    if (!NET.ready) { z.innerHTML = `<p class="doux">${NET.mode === 'off' && pret ? 'Pas de connexion au serveur. Vérifie ta connexion Internet et réessaie.' : 'Connexion…'}</p>`; return; }
    if (!NET.user) return formulaire(z);
    if (!(NET.me && NET.me.pseudo)) return etapePseudo(z);
    profil(z);
  }

  function formulaire(z) {
    const up = onglet === 'up';
    z.innerHTML = `<div class="onglets-compte" role="tablist">
        <button type="button" role="tab" aria-selected="${!up}" data-onglet="in">Se connecter</button>
        <button type="button" role="tab" aria-selected="${up}" data-onglet="up">Créer un compte</button></div>
      <form class="formulaire" id="f-compte" novalidate>
        <label for="k-mail">Email</label><input id="k-mail" type="email" autocomplete="email" required>
        <label for="k-mdp">Mot de passe${up ? ' <small>(6 caractères minimum)</small>' : ''}</label><input id="k-mdp" type="password" autocomplete="${up ? 'new-password' : 'current-password'}" required minlength="6">
        ${up ? `<label for="k-mdp2">Mot de passe, encore une fois</label><input id="k-mdp2" type="password" autocomplete="new-password" required>
        <label class="case"><input type="checkbox" id="k-ok"><span>J'accepte les <a href="#conditions">conditions d'utilisation</a> (respect, pas de triche) et j'ai lu la page <a href="#confidentialite">confidentialité</a>. Mon email sert seulement à me connecter.</span></label>
        <label class="case"><input type="checkbox" id="k-age"><span>J'ai 15 ans ou plus, ou un parent est d'accord pour que je crée ce compte.</span></label>` : ''}
        <div class="form-bas">${up ? '<span></span>' : '<button type="button" class="lien" id="k-oubli">Mot de passe oublié ?</button>'}<button class="btn btn-or" type="submit">${up ? 'Créer mon compte' : 'Se connecter'}</button></div>
        <p class="etat" id="k-etat" role="status"></p>
      </form>
      <p class="mention">${up ? 'Ce compte marche aussi dans le jeu : tu y retrouveras ta progression sur tous tes appareils.' : 'C\'est le même compte que dans le jeu.'}</p>`;
    const etat = m => { $('#k-etat').textContent = m; };
    $('#f-compte').addEventListener('submit', async e => {
      e.preventDefault();
      const m = $('#k-mail').value.trim(), p = $('#k-mdp').value;
      if (!m || !p) return etat("Remplis l'email et le mot de passe.");
      if (up) {
        if (p !== $('#k-mdp2').value) return etat('Les deux mots de passe ne sont pas pareils.');
        if (!$('#k-ok').checked) return etat('Coche la case des conditions pour continuer.');
        if (!$('#k-age').checked) return etat("Coche la case de l'âge : sous 15 ans, demande d'abord à un parent.");
      }
      etat('Un instant…');
      try { if (up) await NET.signUp(m, p); else await NET.signIn(m, p); }
      catch (x) { etat(x && x.message && !x.code ? x.message : NET.msg(x)); }
    });
    const ou = $('#k-oubli');
    if (ou) ou.addEventListener('click', async () => {
      const m = $('#k-mail').value.trim(); if (!m) return etat('Écris ton email, puis appuie sur « Mot de passe oublié ? ».');
      try { await NET.reset(m); etat('Email envoyé : suis le lien pour choisir un nouveau mot de passe.'); } catch (x) { etat(NET.msg(x)); }
    });
  }

  function etapePseudo(z) {
    z.innerHTML = `<form class="formulaire" id="f-pseudo">
        <p class="doux" style="margin:0 0 6px">Dernière étape : choisis ton pseudo. C'est le nom que les autres joueurs voient dans le jeu.</p>
        <label for="k-pseudo">Pseudo <small>(3 à 16 lettres ou chiffres, pas ton vrai nom)</small></label><input id="k-pseudo" maxlength="16" autocomplete="nickname" required>
        <div class="form-bas"><button type="button" class="lien" id="k-sortir">Se déconnecter</button><button class="btn btn-or" type="submit">Valider</button></div>
        <p class="etat" id="k-etat" role="status"></p></form>`;
    const etat = m => { $('#k-etat').textContent = m; };
    $('#f-pseudo').addEventListener('submit', async e => {
      e.preventDefault();
      const p = $('#k-pseudo').value.trim(), err = NET.checkPseudo(p); if (err) return etat(err);
      etat('Un instant…');
      try { await NET.setPseudo(p, { lvl: 1, club: null, cgu: CGU_VER }); } catch (x) { etat(x && x.message && !x.code ? x.message : NET.msg(x)); }
    });
    $('#k-sortir').addEventListener('click', () => NET.signOut());
  }

  function profil(z) {
    const me = NET.me, mail = NET.user.email || '';
    z.innerHTML = `<div class="carte-compte">
        <p class="etiquette">Connecté</p>
        <p class="pseudo-compte">${esc(me.pseudo)}</p>
        <p class="doux">${esc(mail)}${me.code ? ` · code ami <b class="or">${esc(me.code)}</b>` : ''}</p>
        <p class="doux" style="margin-top:10px">Tu es aussi connecté dans le jeu sur cet appareil : ta progression y est sauvegardée en ligne et te suit sur tous tes appareils.</p>
        <div class="actions"><a class="btn btn-or" data-lien="jouer" href="${esc(CONFIG.jouer.url)}">Jouer</a><button type="button" class="btn btn-ligne" id="k-sortir">Se déconnecter</button></div>
        <p class="mention"><button type="button" class="lien" id="k-mdp">Changer de mot de passe</button> · Pour supprimer ton compte et toutes tes données : dans le jeu, Paramètres › Compte › Supprimer mon compte.</p>
        <p class="etat" id="k-etat" role="status"></p></div>`;
    $('#k-sortir').addEventListener('click', () => NET.signOut());
    $('#k-mdp').addEventListener('click', async () => { try { await NET.reset(mail); $('#k-etat').textContent = 'Email envoyé à ' + mail + ' : suis le lien pour choisir un nouveau mot de passe.'; } catch (x) { $('#k-etat').textContent = NET.msg(x); } });
  }

  // clic sur les onglets du formulaire
  document.addEventListener('click', e => { const o = e.target.closest('[data-onglet]'); if (o) { onglet = o.dataset.onglet; afficher(); } });

  // ouverture de la page Compte : on se connecte au serveur
  async function ouvrir() { afficher(); await demarrer(); afficher(); etiquette(); }
  return { ouvrir, demarrer, connecte, afficher };
})();
