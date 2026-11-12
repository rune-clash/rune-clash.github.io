/* =============================================================================
   RUNE CLASH — BOÎTE À CONSEILS
   -----------------------------------------------------------------------------
   Les visiteurs envoient un conseil. Il arrive dans TA boîte (personne d'autre ne le voit).
   Dans l'Espace fondateur (bas de page, ou adresse …#espace-fondateur), connecté avec ton compte
   (page Compte du site : le même que dans le jeu), tu lis, tu réponds : le conseil et ta réponse s'affichent
   alors sur le site. Tu peux aussi supprimer un message sans le publier.

   Serveur : la Realtime Database Firebase du jeu.
     conseils/          boîte de réception (lisible seulement par toi)
     conseilsPublics/   conseils publiés avec ta réponse (lisibles par tous)
     conseilsDernier/   heure du dernier envoi de chaque visiteur (1 conseil par minute)
     admins/<ton uid>   te donne les droits (à créer une fois dans la console Firebase)
   Les règles de sécurité correspondantes sont dans regles-firebase-v18.json.
   ============================================================================= */
const Conseils = (function () {
  const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
  let app = null, charge = null;

  // configuration : celle de js/config.js, sinon celle du jeu (../config.js)
  function cfg() {
    let c = CONFIG.firebase;
    try { c = c || window.FIREBASE_CONFIG || (typeof firebaseConfig !== 'undefined' ? firebaseConfig : null); } catch (e) { /* */ }
    return c && c.apiKey && c.databaseURL && !/COLLE|REMPLACE|xxx/i.test(c.apiKey) ? c : null;
  }
  const script = src => new Promise((ok, ko) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => ko(new Error('reseau')); document.head.appendChild(s); });
  function connecter() {
    if (charge) return charge;
    charge = (async () => {
      const c = cfg(); if (!c) throw new Error('config');
      // Firebase est chargé par le code réseau du jeu (js/net-jeu.js) ; à défaut, ici
      if (typeof Compte !== 'undefined') await Compte.demarrer();
      if (typeof firebase === 'undefined') { await script(SDK + 'firebase-app-compat.js'); await script(SDK + 'firebase-auth-compat.js'); await script(SDK + 'firebase-database-compat.js'); }
      // les visiteurs SANS compte envoient leur conseil depuis une appli à part (« site », connexion anonyme) :
      // ainsi le jeu ne voit jamais de compte anonyme
      app = firebase.apps.find(a => a.name === 'site') || firebase.initializeApp(c, 'site');
      return app;
    })();
    charge.catch(() => { charge = null; });
    return charge;
  }
  const db = () => app.database(), auth = () => app.auth(), MAINTENANT = () => firebase.database.ServerValue.TIMESTAMP;
  // le compte du joueur (le même que dans le jeu) : appli Firebase par défaut, ouverte par js/net-jeu.js
  const avecCompte = () => typeof NET !== 'undefined' && NET.mode === 'firebase' && NET.user;
  const dbC = () => firebase.app().database();
  const raison = e => {
    const m = String(e && (e.code || e.message) || e);
    if (/config/.test(m)) return 'La boîte à conseils sera ouverte très bientôt.';
    if (/reseau|network/i.test(m)) return 'Pas de connexion au serveur. Vérifie ta connexion Internet et réessaie.';
    if (/operation-not-allowed|admin-restricted/.test(m)) return "La boîte à conseils n'est pas encore activée.";
    if (/permission|PERMISSION/.test(m)) return 'Un seul conseil par minute : attends un peu avant de renvoyer.';
    if (/wrong-password|invalid-credential|user-not-found|invalid-login/.test(m)) return 'Email ou mot de passe incorrect.';
    return "Ça n'a pas marché. Réessaie dans un instant.";
  };

  /* ---------- côté visiteur ---------- */
  async function envoyer(nom, txt) {
    await connecter();
    // connecté avec son compte : le conseil part de ce compte ; sinon connexion anonyme (appli « site »)
    const base = avecCompte() ? dbC() : db();
    const u = avecCompte() ? NET.user : auth().currentUser && auth().currentUser.isAnonymous ? auth().currentUser : (await auth().signInAnonymously()).user;
    const id = base.ref('conseils').push().key;
    const maj = {}; maj['conseils/' + id] = { txt, nom: nom || (avecCompte() && NET.me && NET.me.pseudo) || '', uid: u.uid, t: MAINTENANT() }; maj['conseilsDernier/' + u.uid] = MAINTENANT();
    await base.ref().update(maj);
  }
  async function publics(cb) {
    await connecter();
    db().ref('conseilsPublics').orderByChild('tr').limitToLast(40).on('value', s => { const v = s.val() || {}; cb(Object.keys(v).map(k => Object.assign({ id: k }, v[k])).sort((a, b) => (b.tr || 0) - (a.tr || 0))); });
  }

  /* ---------- côté fondateur : avec SON compte (le même que dans le jeu, connexion sur la page Compte) ---------- */
  async function moi() { await connecter(); return avecCompte() ? { uid: NET.user.uid, email: NET.user.email } : null; }
  async function deconnexion() { if (avecCompte()) await NET.signOut(); }
  async function estAdmin(uid) { try { return (await dbC().ref('admins/' + uid).get()).exists(); } catch (e) { return false; } }
  function boite(cb) { const r = dbC().ref('conseils'); const h = s => { const v = s.val() || {}; cb(Object.keys(v).map(k => Object.assign({ id: k }, v[k])).sort((a, b) => b.t - a.t)); }; r.on('value', h); return () => r.off('value', h); }
  function publier(c, rep) { const maj = {}; maj['conseilsPublics/' + c.id] = { q: c.txt || c.q, nom: c.nom || '', rep, t: c.t || Date.now(), tr: MAINTENANT() }; if (c.txt) maj['conseils/' + c.id] = null; return dbC().ref().update(maj); }
  const supprimer = id => dbC().ref('conseils/' + id).remove();
  const retirer = id => dbC().ref('conseilsPublics/' + id).remove();

  // statistiques anonymes des n derniers jours (lisibles seulement par le fondateur)
  async function stats(n) { await connecter(); const s = await dbC().ref('stats/j').orderByKey().limitToLast(n || 30).get(); return s.val() || {}; }
  return { cfg, envoyer, publics, deconnexion, moi, estAdmin, boite, publier, supprimer, retirer, raison, stats };
})();
