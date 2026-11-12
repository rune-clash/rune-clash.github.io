/* =============================================================================
   RUNE CLASH — FONCTIONNEMENT DU SITE
   Sommaire : 1. outils · 2. textes et liens · 3. barre du haut · 4. Prisme 3D
              5. boîte à conseils · 6. espace fondateur · 7. installer · 8. démarrage
   ============================================================================= */
(function () {
  'use strict';

  /* ---------- 1. outils ---------- */
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => [...(el || document).querySelectorAll(s)];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const paras = t => esc(t).split(/\n+/).map(p => `<p>${p}</p>`).join('');
  const date = t => t ? new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

  /* ---------- 2. textes et liens ---------- */
  function remplir() {
    $$('[data-texte]').forEach(e => { const v = CONTENU[e.dataset.texte]; if (v) e.textContent = v; });
    $('#lore').innerHTML = CONTENU.lore.map(p => `<p>${esc(p)}</p>`).join('');
    $('#combat').innerHTML = CONTENU.combat.map(c => `<li><div><b>${esc(c.t)}</b><span>${esc(c.d)}</span></div></li>`).join('');
    $('#modes').innerHTML = CONTENU.modes.map(m => `<span>${esc(m)}</span>`).join('');
    const F = CONFIG.fondateur;
    $('#fondateur-nom').textContent = F.nom; $('#fondateur-role').textContent = F.role;
    $('#citation').textContent = F.citation;
    $('#fondateur-texte').innerHTML = F.texte.map(p => `<p>${esc(p)}</p>`).join('');
    $('#etapes').innerHTML = CONTENU.etapes.map(e => `<li><small>${esc(e.v)}</small><b>${esc(e.t)}</b></li>`).join('');
    $('#journal').innerHTML = CONTENU.majs.map((m, i) => `<details class="version"${i === 0 ? ' open' : ''}><summary><b>${esc(m.v)}</b><span>${esc(m.titre)}</span><small>${esc(m.date)}</small></summary><ul>${m.points.map(p => `<li>${esc(p)}</li>`).join('')}</ul></details>`).join('');
    // réseaux : bas de l'Accueil (seulement ceux qui ont un lien) et page Soutenir (tous, « Bientôt » si vide)
    const R = CONFIG.reseaux || [], lien = r => r.email ? 'mailto:' + r.email : r.url;
    // l'e-mail s'affiche en entier (avant, seulement le mot « E-mail », qui semblait traîner seul)
    $('#reseaux').innerHTML = R.filter(lien).map(r => `<li><a href="${esc(lien(r))}" rel="noopener">${esc(r.email || r.nom)}</a></li>`).join('');
    $('#reseaux-grille').innerHTML = R.map(r => lien(r)
      ? `<li><a href="${esc(lien(r))}" rel="noopener"><b>${esc(r.nom)}</b><small>${esc(r.email || r.detail || '')}</small></a></li>`
      : `<li><span class="case"><b>${esc(r.nom)}</b><small>Bientôt</small></span></li>`).join('');
    // soutenir
    const S = CONFIG.soutien, bouton = (url, txt) => url ? `<a class="btn btn-or" href="${esc(url)}" target="_blank" rel="noopener">${esc(txt)}</a>` : '<span class="btn btn-ligne bientot" aria-disabled="true">Bientôt disponible</span>';
    // boutons de paiement d'une formule : Revolut (Apple Pay ou carte) en premier, PayPal en dessous
    const payer = a => {
      if (!a.url && !a.paypal) return bouton('', '');
      const lien = (url, cls, txt) => `<a class="btn ${cls}" href="${esc(url)}" target="_blank" rel="noopener">${txt}</a>`;
      return `<div class="payer">${a.url ? lien(a.url, 'btn-or', 'Apple Pay ou carte') : ''}${a.paypal ? lien(a.paypal, a.url ? 'btn-ligne pp' : 'btn-or', 'PayPal') : ''}</div>`;
    };
    $('#offres').innerHTML = S.formules.map(a => `<article class="offre${a.conseille ? ' conseille' : ''}"><h3>${esc(a.nom)}</h3><p class="prix">${esc(a.prix)} <small>une seule fois</small></p>
      <ul>${a.avantages.map(x => `<li>${esc(x)}</li>`).join('')}</ul>${payer(a)}</article>`).join('');
    $('#unique').innerHTML = `<p><b>Paiement unique</b>Sans abonnement · Écris ton pseudo dans le message du paiement pour recevoir tes avantages.<small class="mention"><a href="#conditions">Conditions du soutien</a></small></p>`;
    $('#mur').innerHTML = (S.mur || []).length ? S.mur.map(p => `<span>${esc(p)}</span>`).join('') : '<span class="doux">Le premier nom ici, ce sera peut-être le tien.</span>';
    $('#contact').innerHTML = CONFIG.contact ? `Contact : <a href="mailto:${esc(CONFIG.contact)}">${esc(CONFIG.contact)}</a>` : '';
    $('#annee').textContent = new Date().getFullYear();
    // informations légales : un champ vide s'affiche « à compléter » en rouge (voir js/config.js, rubrique legal)
    const L = CONFIG.legal || {};
    $$('[data-legal]').forEach(el => {
      const k = el.dataset.legal, v = L[k];
      if (!v) { el.textContent = k === 'directeur' ? 'à compléter : nom et prénom d\'un parent (majeur)' : 'à compléter'; el.classList.add('a-completer'); return; }
      el.classList.remove('a-completer');
      if (k === 'email') el.innerHTML = `<a href="mailto:${esc(v)}">${esc(v)}</a>`; else el.textContent = v;
    });
    // liens
    $$('[data-lien="jouer"]').forEach(a => { a.href = CONFIG.jouer.url; });
    $$('[data-texte-lien="jouer"]').forEach(s => { s.textContent = CONFIG.jouer.texte; });
    const T = CONFIG.telecharger;
    $$('[data-lien="telecharger"]').forEach(a => { a.href = T.url || '#'; if (!T.url) a.addEventListener('click', e => { e.preventDefault(); installer(); }); });
    $$('[data-texte-lien="telecharger"]').forEach(s => { s.textContent = T.texte; });
  }

  /* ---------- 3. barre du haut (menu téléphone) ---------- */
  function barre() {
    const menu = $('#menu'), burger = $('#burger');
    burger.addEventListener('click', () => { const o = !menu.classList.contains('ouvert'); menu.classList.toggle('ouvert', o); burger.setAttribute('aria-expanded', o); });
    menu.addEventListener('click', e => { if (e.target.closest('a')) { menu.classList.remove('ouvert'); burger.setAttribute('aria-expanded', 'false'); } });
  }

  /* ---------- 3 bis. une page par rubrique ----------
     Chaque rubrique a son adresse (#jeu, #conseils…). Changer de rubrique change l'adresse,
     donc le bouton retour du téléphone ou du navigateur revient à la rubrique précédente. */
  const PAGES = ['accueil', 'jeu', 'fondateur', 'mises-a-jour', 'conseils', 'soutenir', 'espace-fondateur', 'mentions-legales', 'confidentialite', 'conditions'];
  let pageActuelle = null;
  function pageDemandee() { const h = location.hash.slice(1); return PAGES.includes(h) ? h : 'accueil'; }
  function afficherPage(id) {
    if (id === pageActuelle) return;
    PAGES.forEach(p => { const el = document.getElementById(p); el.hidden = p !== id; el.classList.remove('arrive'); });
    const el = document.getElementById(id);
    void el.offsetWidth; el.classList.add('arrive'); el.scrollTop = 0;
    $$('.barre .btn-or').forEach(b => b.classList.toggle('ici', id === 'soutenir'));
    $$('#menu a').forEach(a => { const ici = a.getAttribute('href') === '#' + id; a.classList.toggle('ici', ici); if (ici) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    document.title = id === 'accueil' ? 'Rune Clash' : (el.querySelector('h2') || {}).textContent + ' · Rune Clash';
    // le Prisme ne tourne que sur l'Accueil (et l'écran d'entrée)
    if (!document.body.classList.contains('a-l-entree')) { $('#scene').classList.toggle('cache', id !== 'accueil'); Prisme3D.mode(id === 'accueil' ? 'accueil' : 'off'); }
    if (pageActuelle === 'espace-fondateur' && couperBoite) { couperBoite(); couperBoite = null; }
    if (id === 'espace-fondateur') afficherAdmin();
    pageActuelle = id;
    // le titre de la page reçoit le focus (lecteurs d'écran, clavier) sauf à l'arrivée
    if (entreeFaite) { const t = el.querySelector('h1, h2'); if (t) { t.tabIndex = -1; t.focus({ preventScroll: true }); } }
  }

  /* ---------- 3 ter. écran d'entrée ----------
     On voit seulement le logo et le Prisme. Un clic (ou une touche) ouvre le site.
     Déjà vu pendant cette visite, ou lien direct vers une rubrique : on entre directement. */
  let entreeFaite = false;
  function entree() {
    let deja = false; try { deja = sessionStorage.getItem('rc-entree') === '1'; } catch (e) { /* */ }
    const lienDirect = PAGES.includes(location.hash.slice(1)) && location.hash !== '#accueil';
    $('#entree-aide').textContent = matchMedia('(hover: hover) and (pointer: fine)').matches ? 'Clique pour entrer' : 'Touche pour entrer';
    if (deja || lienDirect) { entrer(true); return; }
    document.body.classList.add('a-l-entree'); Prisme3D.mode('entree');
    $('#entrer').addEventListener('click', () => entrer(false));
    addEventListener('keydown', function k(e) { if (e.key === 'Enter' || e.key === ' ') { removeEventListener('keydown', k); entrer(false); } });
    // v18 : le logo s'affiche, puis le site s'ouvre tout seul (un clic l'ouvre plus tôt)
    setTimeout(() => entrer(false), (navigator.webdriver && window.__entreeMs) || CONFIG.entreeAuto || 2200);
  }
  function entrer(direct) {
    if (entreeFaite) return; entreeFaite = true;
    try { sessionStorage.setItem('rc-entree', '1'); } catch (e) { /* */ }
    const e = $('#entree'); e.classList.add('sortie'); setTimeout(() => { e.hidden = true; }, direct ? 0 : 750);
    document.body.classList.remove('a-l-entree'); document.body.classList.add('dans-site');
    const id = pageDemandee(); pageActuelle = null; afficherPage(id);
    if (!location.hash) history.replaceState(null, '', '#accueil');
  }

  /* ---------- 4. Prisme 3D ---------- */
  function prisme() {
    if (!Prisme3D.init($('#scene'))) { $('.scene-secours').hidden = false; $('#outils-3d').hidden = true; return; }
    $$('#outils-3d [data-zoom]').forEach(b => b.addEventListener('click', () => Prisme3D.zoomer(+b.dataset.zoom > 0 ? 1.2 : 0.83)));
  }

  /* ---------- 5. boîte à conseils ---------- */
  function conseils() {
    const f = $('#form-conseil'), txt = $('#c-txt'), nom = $('#c-nom'), etat = $('#c-etat'), btn = $('#c-envoyer');
    const dire = (m, err) => { etat.textContent = m; etat.classList.toggle('erreur', !!err); };
    txt.addEventListener('input', () => { $('#c-compte').textContent = `${txt.value.length} / 600`; });
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const t = txt.value.trim(), n = nom.value.trim().slice(0, 20);
      if (t.length < 5) { dire('Écris au moins quelques mots.', true); txt.focus(); return; }
      btn.disabled = true; dire('Envoi…');
      try { await Conseils.envoyer(n, t); txt.value = ''; $('#c-compte').textContent = '0 / 600'; dire("Merci ! Ton conseil est bien arrivé. S'il est retenu, il apparaîtra ici avec ma réponse."); }
      catch (err) { dire(Conseils.raison(err), true); }
      btn.disabled = false;
    });
    const zone = $('#reponses');
    if (!Conseils.cfg()) { zone.innerHTML = '<p class="doux">Les premières réponses arrivent bientôt.</p>'; return; }
    Conseils.publics(L => {
      zone.innerHTML = L.length ? L.map(c => `<article class="qr"><div class="q"><small>${esc(c.nom || 'Anonyme')} · ${date(c.t)}</small>${paras(c.q)}</div><div class="r"><b>${esc(CONFIG.fondateur.nom)}</b>${paras(c.rep)}</div></article>`).join('')
        : '<p class="doux">Pas encore de réponse publiée. Le premier conseil, ce sera peut-être le tien.</p>';
    }).catch(() => { zone.innerHTML = '<p class="doux">Les réponses ne peuvent pas être affichées pour le moment.</p>'; });
  }

  /* ---------- 6. espace fondateur (…#espace-fondateur) ---------- */
  let couperBoite = null;
  async function afficherAdmin() {
    const z = $('#admin');
    if (!Conseils.cfg()) { z.innerHTML = '<p class="doux">Le site n\'est pas encore relié au serveur du jeu. Voir LISEZMOI.md, partie « Boîte à conseils ».</p>'; return; }
    z.innerHTML = '<p class="doux">Connexion…</p>';
    let u; try { u = await Conseils.moi(); } catch (e) { z.innerHTML = `<p class="doux">${esc(Conseils.raison(e))}</p>`; return; }
    if (!u) {
      z.innerHTML = `<form class="formulaire" id="a-form"><label for="a-mail">Email de ton compte du jeu</label><input id="a-mail" type="email" autocomplete="email" required>
        <label for="a-mdp">Mot de passe</label><input id="a-mdp" type="password" autocomplete="current-password" required>
        <div class="form-bas"><span></span><button class="btn btn-or" type="submit">Se connecter</button></div><p class="etat" id="a-etat" role="status"></p></form>`;
      $('#a-form').addEventListener('submit', async e => { e.preventDefault(); $('#a-etat').textContent = 'Connexion…'; try { await Conseils.connexion($('#a-mail').value.trim(), $('#a-mdp').value); afficherAdmin(); } catch (err) { $('#a-etat').textContent = Conseils.raison(err); $('#a-etat').classList.add('erreur'); } });
      return;
    }
    if (!(await Conseils.estAdmin(u.uid))) {
      z.innerHTML = `<p>Tu es connecté, mais ce compte n'a pas encore les droits de fondateur.</p>
        <p class="doux" style="margin-top:12px">Une seule fois : dans la console Firebase, Realtime Database, crée l'entrée <code>admins</code> → <code>${esc(u.uid)}</code> avec la valeur <code>true</code>, puis recharge cette page.</p>
        <div class="actions" style="margin-top:18px"><button class="btn btn-ligne" id="a-sortir">Se déconnecter</button></div>`;
      $('#a-sortir').addEventListener('click', async () => { await Conseils.deconnexion(); afficherAdmin(); });
      return;
    }
    z.innerHTML = `<p class="doux">Connecté : ${esc(u.email)} · <button class="lien" id="a-sortir">Se déconnecter</button></p><div id="a-liste"></div><h3 class="reponses-titre">Déjà publiés</h3><div id="a-publies"></div>`;
    $('#admin').insertAdjacentHTML('beforeend', '<h3 class="reponses-titre">Statistiques anonymes · 30 derniers jours</h3><div class="tableau" id="a-stats"><p class="doux">Chargement…</p></div>');
    Conseils.stats(30).then(S => {
      const z3 = $('#a-stats'); if (!z3) return;
      const jours = Object.keys(S).sort().reverse(), n = (j, k) => (S[j] && S[j][k]) || 0, pc = (a, b) => (b ? Math.round(a / b * 100) + ' %' : '–');
      z3.innerHTML = jours.length ? `<table class="stats-table"><thead><tr><th>Jour</th><th>Visites du site</th><th>Clics Jouer</th><th>Clics soutien</th><th>Jeu ouvert</th><th>Nouveaux</th><th>Revenus J+1</th><th>Revenus J+7</th><th>Combats</th></tr></thead><tbody>${jours.map(j => `<tr><td>${j.slice(6)}/${j.slice(4, 6)}</td><td>${n(j, 'site')}</td><td>${n(j, 'jouer')}</td><td>${n(j, 'soutien')}</td><td>${n(j, 'lance')}</td><td>${n(j, 'nouveau')}</td><td>${n(j, 'r1')} <small>${pc(n(j, 'r1'), n(j, 'nouveau'))}</small></td><td>${n(j, 'r7')} <small>${pc(n(j, 'r7'), n(j, 'nouveau'))}</small></td><td>${n(j, 'combats')}</td></tr>`).join('')}</tbody></table><p class="doux" style="margin-top:8px">« Revenus J+1 » : parmi les nouveaux de ce jour-là, combien sont revenus le lendemain.</p>`
        : '<p class="doux">Pas encore de données.</p>';
    }).catch(e => { const z3 = $('#a-stats'); if (z3) z3.innerHTML = `<p class="doux">${esc(Conseils.raison(e))}</p>`; });
    Conseils.publics(L => { const z2 = $('#a-publies'); if (!z2) return; z2.innerHTML = L.length ? L.map(c => `<div class="admin-carte" data-id="${esc(c.id)}"><small>${esc(c.nom || 'Anonyme')} · ${date(c.t)}</small>${paras(c.q)}<p class="doux">Ta réponse : ${esc(c.rep)}</p><div class="actions"><button class="btn btn-ligne btn-petit" data-retirer="${esc(c.id)}">Retirer du site</button></div></div>`).join('') : '<p class="doux">Rien de publié pour l\'instant.</p>'; z2.onclick = async e => { const b = e.target.closest('[data-retirer]'); if (b) { try { await Conseils.retirer(b.dataset.retirer); } catch (err) { alerteCarte(b.closest('.admin-carte'), Conseils.raison(err)); } } }; });
    $('#a-sortir').addEventListener('click', async () => { if (couperBoite) couperBoite(); await Conseils.deconnexion(); afficherAdmin(); });
    if (couperBoite) couperBoite();
    couperBoite = Conseils.boite(L => {
      const liste = $('#a-liste'); if (!liste) return;
      liste.innerHTML = L.length ? L.map(c => `<div class="admin-carte" data-id="${esc(c.id)}"><small>${esc(c.nom || 'Anonyme')} · ${date(c.t)}</small>${paras(c.txt)}
          <label class="visuel-cache" for="r-${esc(c.id)}">Ta réponse</label><textarea id="r-${esc(c.id)}" rows="3" maxlength="1500" placeholder="Ta réponse (elle sera publiée avec le conseil)"></textarea>
          <div class="actions"><button class="btn btn-or btn-petit" data-a="publier">Publier avec ma réponse</button><button class="btn btn-ligne btn-petit" data-a="suppr">Supprimer sans publier</button></div></div>`).join('')
        : '<p class="doux" style="margin-top:18px">Aucun nouveau conseil. Les conseils publiés restent visibles plus haut, dans la rubrique Conseils.</p>';
      liste.onclick = async e => {
        const b = e.target.closest('[data-a]'); if (!b) return;
        const carte = b.closest('.admin-carte'), c = L.find(x => x.id === carte.dataset.id), rep = carte.querySelector('textarea').value.trim();
        try {
          if (b.dataset.a === 'publier') { if (!rep) { carte.querySelector('textarea').focus(); return; } await Conseils.publier(c, rep); }
          else if (b.dataset.a === 'suppr') await Conseils.supprimer(c.id);
        } catch (err) { alerteCarte(carte, Conseils.raison(err)); }
      };
    });
  }
  function alerteCarte(carte, m) { let p = carte.querySelector('.etat'); if (!p) { p = document.createElement('p'); p.className = 'etat erreur'; carte.appendChild(p); } p.textContent = m; }

  /* ---------- 7. installer ---------- */
  const inst = $('#installer');
  function installer() { if (!inst.open) inst.showModal(); }
  $('#inst-fermer').addEventListener('click', () => inst.close());
  inst.addEventListener('click', e => { if (e.target === inst) inst.close(); });

  /* ---------- 8. démarrage ---------- */
  remplir(); barre(); prisme(); conseils();
  // tableaux des pages légales : chaque case connaît le titre de sa colonne (affichage en cartes sur téléphone)
  $$('.legal table').forEach(t => { const th = [...t.querySelectorAll('thead th')].map(x => x.textContent); t.querySelectorAll('tbody tr').forEach(tr => [...tr.children].forEach((td, i) => { td.dataset.label = th[i] || ''; })); });
  entree();
  // statistiques anonymes : comptage + réglage sur la page Confidentialité
  Stats.demarrer();
  function etatStats() { const off = Stats.refuse(); $('#stats-etat').textContent = off ? 'désactivées' : 'activées'; $('#stats-bouton').textContent = off ? 'Les activer' : 'Les désactiver'; }
  etatStats();
  $('#stats-bouton').addEventListener('click', () => { Stats.activer(Stats.refuse()); etatStats(); });
  addEventListener('hashchange', () => { if (entreeFaite) afficherPage(pageDemandee()); else if (PAGES.includes(location.hash.slice(1))) entrer(false); });
  if (navigator.webdriver) window.__site = { afficherPage, entrer };
})();
