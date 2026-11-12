/* =====================================================================
   NET : comptes (email + mot de passe), pseudo, sauvegarde en ligne, amis, clubs, duels.
   Serveur : Firebase (Authentication + Realtime Database). La configuration est dans config.js.
   Sans configuration (ou sans Internet), le jeu marche en « mode invité » hors ligne.
   Pour les tests : ?netmock=1 simule le serveur dans le navigateur (plusieurs onglets).
   ===================================================================== */
const NET = (function () {
  const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
  const N = { ready: false, mode: 'off', me: null, user: null, err: null, subs: {}, listeners: [] };
  const emit = (ev, d) => (N.subs[ev] || []).forEach(f => { try { f(d); } catch (e) { console.error(e); } });
  N.on = (ev, f) => { (N.subs[ev] = N.subs[ev] || []).push(f); };
  // accepte aussi le bloc collé tel quel depuis Firebase (« const firebaseConfig = {…} »)
  const raw = () => { try { return window.FIREBASE_CONFIG || (typeof firebaseConfig !== 'undefined' ? firebaseConfig : null); } catch (e) { return null; } };
  N.raw = raw;
  const cfg = () => { const c = raw(); return (c && c.apiKey && !/COLLE|REMPLACE|xxx/i.test(c.apiKey)) ? c : null; };
  N.configured = () => !!cfg() || /netmock=1/.test(location.search);
  const loadJS = src => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Chargement impossible : ' + src)); document.head.appendChild(s); });

  /* ---------- adaptateur Firebase ---------- */
  function fireAdapter(fb) {
    const auth = fb.auth(), db = fb.database(), ref = p => db.ref(p);
    return {
      auth: {
        signUp: (e, p) => auth.createUserWithEmailAndPassword(e, p).then(c => ({ uid: c.user.uid, email: c.user.email })),
        signIn: (e, p) => auth.signInWithEmailAndPassword(e, p).then(c => ({ uid: c.user.uid, email: c.user.email })),
        signOut: () => auth.signOut(), reset: e => auth.sendPasswordResetEmail(e),
        onAuth: cb => auth.onAuthStateChanged(u => cb(u ? { uid: u.uid, email: u.email } : null)),
        del: () => auth.currentUser ? auth.currentUser.delete() : Promise.resolve()
      },
      set: (p, v) => ref(p).set(v), update: (p, o) => ref(p).update(o), remove: p => ref(p).remove(),
      get: p => ref(p).get().then(s => s.val()),
      push: (p, v) => { const r = ref(p).push(); return r.set(v).then(() => r.key); },
      key: p => ref(p).push().key,
      on: (p, cb) => { const r = ref(p), h = s => cb(s.val()); r.on('value', h); return () => r.off('value', h); },
      tx: (p, fn) => ref(p).transaction(fn).then(r => ({ ok: r.committed, v: r.snapshot.val() })),
      onDisc: (p, v) => ref(p).onDisconnect().set(v),
      prefix: (p, child, pre, n) => ref(p).orderByChild(child).startAt(pre).endAt(pre + '').limitToFirst(n || 20).get().then(s => s.val() || {}),
      top: (p, child, n) => ref(p).orderByChild(child).limitToLast(n || 50).get().then(s => s.val() || {}),
      ts: () => fb.database.ServerValue.TIMESTAMP,
      inc: p => ref(p).set(fb.database.ServerValue.increment(1)),
      connected: cb => ref('.info/connected').on('value', s => cb(!!s.val()))
    };
  }
  /* ---------- adaptateur de test (aucun serveur) ---------- */
  function mockAdapter() {
    const KEY = 'rc-mockdb', bc = 'BroadcastChannel' in window ? new BroadcastChannel('rc-mockdb') : null, ls = [];
    const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
    const store = d => localStorage.setItem(KEY, JSON.stringify(d));
    const parts = p => p.split('/').filter(Boolean);
    const getAt = (d, p) => parts(p).reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), d);
    const clean = v => v === undefined ? null : JSON.parse(JSON.stringify(v == null ? null : v));
    const setAt = (d, p, v) => { const ks = parts(p); let o = d; ks.slice(0, -1).forEach(k => { if (!o[k] || typeof o[k] !== 'object') o[k] = {}; o = o[k]; }); const k = ks[ks.length - 1]; if (v == null) delete o[k]; else o[k] = clean(v); };
    const fire = () => { const d = load(); ls.forEach(l => { const v = clean(getAt(d, l.p)), s = JSON.stringify(v); if (s !== l.last) { l.last = s; l.cb(v); } }); };
    // le stockage entre onglets se propage en différé : on relit quand il est vraiment à jour
    if (bc) bc.onmessage = () => setTimeout(fire, 30);
    window.addEventListener('storage', e => { if (e.key === KEY) fire(); });
    const changed = () => { fire(); if (bc) bc.postMessage(1); };
    const write = (p, v) => { const d = load(); setAt(d, p, v); store(d); changed(); return Promise.resolve(); };
    let uidCur = sessionStorage.getItem('rc-mockuid'); const authCbs = [];
    const users = () => load().__auth || {};
    const setUser = u => { uidCur = u ? u.uid : null; if (u) sessionStorage.setItem('rc-mockuid', u.uid); else sessionStorage.removeItem('rc-mockuid'); authCbs.forEach(cb => cb(u)); };
    let n = 0; const id = () => Date.now().toString(36) + (n++).toString(36) + Math.random().toString(36).slice(2, 6);
    return {
      auth: {
        signUp: (e, p) => { const U = users(); if (U[btoa(e)]) return Promise.reject({ code: 'auth/email-already-in-use' }); if ((p || '').length < 6) return Promise.reject({ code: 'auth/weak-password' }); const u = { uid: 'u' + id(), email: e }; const d = load(); d.__auth = U; U[btoa(e)] = { p, uid: u.uid }; store(d); setUser(u); return Promise.resolve(u); },
        signIn: (e, p) => { const r = users()[btoa(e)]; if (!r || r.p !== p) return Promise.reject({ code: 'auth/invalid-credential' }); const u = { uid: r.uid, email: e }; setUser(u); return Promise.resolve(u); },
        signOut: () => { setUser(null); return Promise.resolve(); }, reset: () => Promise.resolve(),
        onAuth: cb => { authCbs.push(cb); setTimeout(() => { const U = users(); const e = Object.keys(U).find(k => U[k].uid === uidCur); cb(uidCur && e ? { uid: uidCur, email: atob(e) } : null); }, 30); },
        del: () => { const d = load(); const U = d.__auth || {}; Object.keys(U).forEach(k => { if (U[k].uid === uidCur) delete U[k]; }); store(d); setUser(null); return Promise.resolve(); }
      },
      set: write, remove: p => write(p, null),
      update: (p, o) => { const d = load(); Object.keys(o).forEach(k => setAt(d, p + '/' + k, o[k])); store(d); changed(); return Promise.resolve(); },
      get: p => Promise.resolve(clean(getAt(load(), p))),
      push: (p, v) => { const k = id(); return write(p + '/' + k, v).then(() => k); }, key: () => id(),
      on: (p, cb) => { const l = { p, cb, last: undefined }; ls.push(l); setTimeout(() => { const v = clean(getAt(load(), p)); l.last = JSON.stringify(v); cb(v); }, 0); return () => { const i = ls.indexOf(l); if (i >= 0) ls.splice(i, 1); }; },
      tx: (p, fn) => { const d = load(), cur = clean(getAt(d, p)), nv = fn(cur); if (nv === undefined) return Promise.resolve({ ok: false, v: cur }); setAt(d, p, nv); store(d); changed(); return Promise.resolve({ ok: true, v: nv }); },
      onDisc: () => Promise.resolve(),
      prefix: (p, child, pre, lim) => { const o = getAt(load(), p) || {}, out = {}; Object.keys(o).filter(k => String((o[k] || {})[child] || '').startsWith(pre)).slice(0, lim || 20).forEach(k => { out[k] = o[k]; }); return Promise.resolve(clean(out)); },
      top: (p, child, n) => { const o = getAt(load(), p) || {}, out = {}; Object.keys(o).sort((a, b) => ((o[b] || {})[child] || 0) - ((o[a] || {})[child] || 0)).slice(0, n || 50).forEach(k => { out[k] = clean(o[k]); }); return Promise.resolve(out); },
      ts: () => Date.now(), connected: cb => cb(true),
      inc: p => { const d = load(); setAt(d, p, (getAt(d, p) || 0) + 1); store(d); changed(); return Promise.resolve(); }
    };
  }

  let A = null;
  N.init = function () {
    if (N._init) return N._init;
    N._init = (async () => {
      try {
        if (/netmock=1/.test(location.search)) { A = mockAdapter(); N.mode = 'mock'; }
        else if (cfg()) {
          // (le site officiel réutilise ce fichier : Firebase n'est chargé qu'une fois)
          if (!window.firebase || !window.firebase.initializeApp) { await loadJS(SDK + 'firebase-app-compat.js'); await loadJS(SDK + 'firebase-auth-compat.js'); await loadJS(SDK + 'firebase-database-compat.js'); }
          if (!(window.firebase.apps || []).some(a => a.name === '[DEFAULT]')) window.firebase.initializeApp(cfg());
          A = fireAdapter(window.firebase); N.mode = 'firebase';
        } else { N.mode = 'off'; return false; }
        N.ready = true;
        A.auth.onAuth(async u => {
          N.user = u; N.me = null;
          // le site officiel (même adresse) lit ce repère pour savoir qu'une session est ouverte
          try { if (u) localStorage.setItem('rc_compte', '1'); else localStorage.removeItem('rc_compte'); } catch (e) { /* */ }
          if (u) { try { N.me = await A.get('users/' + u.uid); } catch (e) { N.me = null; } if (N.me) startPresence(); }
          emit('auth', u);
        });
        return true;
      } catch (e) { N.err = e; N.mode = 'off'; console.warn(e); return false; }
    })();
    return N._init;
  };
  N.db = () => A;
  const uid = () => N.user && N.user.uid;
  const low = s => String(s || '').trim().toLowerCase();

  /* ---------- erreurs lisibles ---------- */
  N.msg = e => {
    const c = (e && (e.code || e.message)) || String(e);
    const M = { 'auth/email-already-in-use': 'Cet email a déjà un compte. Connecte-toi.', 'auth/invalid-email': "L'adresse email n'est pas valide.", 'auth/weak-password': 'Mot de passe trop court (6 caractères minimum).',
      'auth/invalid-credential': 'Email ou mot de passe incorrect.', 'auth/wrong-password': 'Email ou mot de passe incorrect.', 'auth/user-not-found': 'Aucun compte avec cet email.', 'auth/too-many-requests': 'Trop d\'essais. Réessaie dans quelques minutes.',
      'auth/network-request-failed': 'Pas de connexion Internet.', 'auth/requires-recent-login': 'Reconnecte-toi puis recommence.', 'PERMISSION_DENIED': 'Le serveur a refusé (vérifie les règles de la base).' };
    const k = Object.keys(M).find(k => c.indexOf(k) >= 0); return k ? M[k] : 'Erreur : ' + c;
  };

  /* ---------- compte ---------- */
  N.signUp = (e, p) => A.auth.signUp(e.trim(), p);
  N.signIn = (e, p) => A.auth.signIn(e.trim(), p);
  N.signOut = () => { stopPresence(); return A.auth.signOut(); };
  N.reset = e => A.auth.reset(e.trim());
  const BAD = ['merde', 'pute', 'putain', 'connard', 'conne', 'salope', 'encul', 'batard', 'bâtard', 'nique', 'fdp', 'pd', 'negro', 'nazi', 'hitler', 'fuck', 'shit', 'bitch', 'dick', 'porn', 'sex', 'admin', 'moderat'];
  N.checkPseudo = p => {
    p = String(p || '').trim();
    if (p.length < 3 || p.length > 16) return 'Le pseudo doit faire entre 3 et 16 caractères.';
    if (!/^[A-Za-z0-9_À-ÿ]+$/.test(p)) return 'Lettres, chiffres et _ seulement (pas d\'espace).';
    const l = low(p).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[0@]/g, 'o').replace(/[1!]/g, 'i').replace(/3/g, 'e').replace(/[4]/g, 'a').replace(/5/g, 's');
    if (BAD.some(b => l.indexOf(b) >= 0)) return 'Ce pseudo n\'est pas autorisé.';
    return '';
  };
  N.setPseudo = async (p, prof) => {
    const err = N.checkPseudo(p); if (err) throw new Error(err);
    const r = await A.tx('pseudos/' + low(p), cur => (cur && cur !== uid()) ? undefined : uid());
    if (!r.ok) throw new Error('Ce pseudo est déjà pris.');
    const old = N.me && N.me.pseudo; if (old && low(old) !== low(p)) await A.remove('pseudos/' + low(old));
    N.me = Object.assign({}, N.me || {}, prof || {}, { pseudo: p, pl: low(p), since: (N.me && N.me.since) || Date.now() });
    await A.set('users/' + uid(), N.me); startPresence(); emit('me', N.me); return N.me;
  };
  N.updateProfile = o => { if (!uid() || !N.me) return Promise.resolve(); Object.assign(N.me, o); return A.update('users/' + uid(), o).catch(() => {}); };
  N.deleteAccount = async () => {
    const u = uid(); if (!u) return;
    if (N.beforeDelete) await N.beforeDelete().catch(() => {});
    if (N.me && N.me.club) await N.leaveClub().catch(() => {});
    const fr = (await A.get('friends/' + u)) || {}; await Promise.all(Object.keys(fr).map(f => A.remove('friends/' + f + '/' + u).catch(() => {})));
    await Promise.all(['friends/' + u, 'requests/' + u, 'saves/' + u, 'invites/' + u, 'presence/' + u].map(p => A.remove(p).catch(() => {})));
    if (N.me && N.me.pseudo) await A.remove('pseudos/' + low(N.me.pseudo)).catch(() => {});
    clearTimeout(saveT); await A.remove('users/' + u); await A.auth.del();
  };
  /* ---------- sauvegarde en ligne ---------- */
  let saveT = 0, saveData = null;
  N.saveProgress = data => { if (!uid() || !N.me) return; saveData = data; clearTimeout(saveT); saveT = setTimeout(() => { if (!uid()) return; A.set('saves/' + uid(), { t: Date.now(), d: JSON.stringify(saveData) }).catch(() => {}); }, 2500); };
  N.loadProgress = async () => { if (!uid()) return null; const s = await A.get('saves/' + uid()); if (!s || !s.d) return null; try { return { t: s.t, d: JSON.parse(s.d) }; } catch (e) { return null; } };
  /* ---------- présence ---------- */
  let presOff = null;
  // N.noPresence : le site officiel utilise le même compte sans faire apparaître le joueur « en ligne » dans le jeu
  function startPresence() { if (!uid() || presOff || N.noPresence) return; A.connected(on => { if (on && uid()) { A.onDisc('presence/' + uid(), null); A.set('presence/' + uid(), { t: Date.now() }).catch(() => {}); } }); presOff = true; }
  function stopPresence() { if (uid()) A.remove('presence/' + uid()).catch(() => {}); presOff = null; }
  N.watch = (p, cb) => { const off = A.on(p, cb); N.listeners.push(off); return off; };
  N.unwatchAll = () => { N.listeners.splice(0).forEach(f => { try { f(); } catch (e) { /* */ } }); };

  /* ---------- amis ---------- */
  N.findUser = async p => { const u = await A.get('pseudos/' + low(p)); if (!u) return null; const prof = await A.get('users/' + u); return prof ? Object.assign({ uid: u }, prof) : null; };
  N.sendRequest = async p => {
    const t = await N.findUser(p); if (!t) throw new Error('Aucun joueur avec ce pseudo.');
    if (t.uid === uid()) throw new Error("C'est toi !");
    if (await A.get('friends/' + uid() + '/' + t.uid)) throw new Error('Vous êtes déjà amis.');
    await A.set('requests/' + t.uid + '/' + uid(), { pseudo: N.me.pseudo, t: Date.now() }); return t;
  };
  N.accept = async (from, pseudo) => { await A.set('friends/' + uid() + '/' + from, { pseudo, t: Date.now() }); await A.set('friends/' + from + '/' + uid(), { pseudo: N.me.pseudo, t: Date.now() }); await A.remove('requests/' + uid() + '/' + from); };
  N.decline = from => A.remove('requests/' + uid() + '/' + from);
  N.removeFriend = f => Promise.all([A.remove('friends/' + uid() + '/' + f), A.remove('friends/' + f + '/' + uid())]);
  N.profile = u => A.get('users/' + u);
  N.presence = u => A.get('presence/' + u);

  /* ---------- clubs ---------- */
  N.checkClub = n => { n = String(n || '').trim(); if (n.length < 3 || n.length > 20) return 'Le nom doit faire entre 3 et 20 caractères.'; if (!/^[A-Za-z0-9 _À-ÿ'-]+$/.test(n)) return 'Caractères non autorisés.'; return N.checkPseudo(n.replace(/[ '-]/g, '_').slice(0, 16)) ? 'Ce nom n\'est pas autorisé.' : ''; };
  N.createClub = async (name, emblem) => {
    const err = N.checkClub(name); if (err) throw new Error(err); if (N.me.club) throw new Error('Quitte ton club actuel d\'abord.');
    const id = A.key('clubs'), r = await A.tx('clubNames/' + low(name), cur => cur ? undefined : id); if (!r.ok) throw new Error('Ce nom de club est déjà pris.');
    await A.set('clubs/' + id, { name: name.trim(), nl: low(name), emblem: emblem || 0, owner: uid(), created: Date.now(), n: 1, members: { [uid()]: { pseudo: N.me.pseudo, role: 'chef', t: Date.now() } } });
    await N.updateProfile({ club: id }); return id;
  };
  N.searchClubs = pre => A.prefix('clubs', 'nl', low(pre), 15);
  /* ---------- classements et objectif commun (étape 2) ---------- */
  /* crochets fournis par le jeu (v17.3) :
     N.blocked() : vrai si le profil est suspect → rien de compétitif n'est publié
     N.onLb(board) : retient les classements où le joueur a écrit (pour tout effacer à la suppression)
     N.beforeDelete() : efface les autres traces du joueur avant la suppression du compte */
  N.blocked = () => false; N.onLb = null; N.beforeDelete = null;
  // statistiques anonymes (v18) : « +1 » sur le compteur k du jour (aaaammjj, heure locale) ; aucun identifiant envoyé
  N.jour = t => { const d = t ? new Date(t) : new Date(); return String(d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()); };
  N.stat = (k, jour) => (A && A.inc ? A.inc('stats/j/' + (jour || N.jour()) + '/' + k).catch(() => {}) : Promise.resolve());
  N.lbSet = async (board, v) => { if (!uid() || !N.me || N.blocked()) return; if (N.onLb) N.onLb(board); const cur = await A.get('lb/' + board + '/' + uid()); if (cur && cur.v >= v && cur.p === N.me.pseudo) return; await A.set('lb/' + board + '/' + uid(), { p: N.me.pseudo, v: Math.max(v, cur ? cur.v || 0 : 0), t: A.ts() }); }; // v17.3 : heure du serveur (les règles vérifient le rythme de progression)
  N.lbTop = async board => { const o = await A.top('lb/' + board, 'v', 50); return Object.keys(o).map(k => Object.assign({ uid: k }, o[k])).sort((a, b) => b.v - a.v); };
  N.commAdd = (wk, n) => uid() && !N.blocked() ? A.tx('community/' + wk, v => (v || 0) + n) : Promise.resolve(null);
  N.commGet = wk => A.get('community/' + wk);
  N.joinClub = async id => {
    if (N.me.club) throw new Error('Quitte ton club actuel d\'abord.');
    const c = await A.get('clubs/' + id); if (!c) throw new Error('Ce club n\'existe plus.');
    if (Object.keys(c.members || {}).length >= 30) throw new Error('Ce club est complet (30 membres).');
    await A.set('clubs/' + id + '/members/' + uid(), { pseudo: N.me.pseudo, role: 'membre', t: Date.now() });
    await A.tx('clubs/' + id + '/n', n => (n || 0) + 1); await N.updateProfile({ club: id });
    N.clubPost(id, 'join').catch(() => {});
  };
  N.leaveClub = async () => {
    const id = N.me.club; if (!id) return;
    const c = await A.get('clubs/' + id);
    await A.remove('clubs/' + id + '/members/' + uid()); await A.tx('clubs/' + id + '/n', n => Math.max(0, (n || 1) - 1));
    const left = Object.keys((c && c.members) || {}).filter(k => k !== uid());
    if (c && c.owner === uid()) { if (left.length) await A.update('clubs/' + id, { owner: left[0], ['members/' + left[0] + '/role']: 'chef' }); else { await A.remove('clubs/' + id); await A.remove('clubNames/' + c.nl); } }
    await N.updateProfile({ club: null });
  };
  N.kick = async (id, member) => { await A.remove('clubs/' + id + '/members/' + member); await A.tx('clubs/' + id + '/n', n => Math.max(0, (n || 1) - 1)); };
  N.clubPost = (id, msg) => A.push('clubFeed/' + id, { u: uid(), p: N.me.pseudo, m: msg, t: Date.now() });
  N.clubBossAdd = (id, wk, dmg) => N.blocked() ? Promise.resolve() : Promise.all([A.tx('clubBoss/' + id + '/' + wk + '/total', v => (v || 0) + dmg), A.tx('clubBoss/' + id + '/' + wk + '/by/' + uid(), v => ({ p: N.me.pseudo, d: ((v && v.d) || 0) + dmg }))]);

  /* ---------- duels ---------- */
  N.createRoom = async (hero, friendUid, extra) => {
    const id = A.key('rooms');
    await A.set('rooms/' + id, Object.assign({ host: uid(), hp: N.me.pseudo, hh: hero, guest: friendUid || null, state: 'wait', t: Date.now() }, extra || {}));
    if (friendUid) await A.set('invites/' + friendUid + '/' + uid(), { room: id, p: N.me.pseudo, t: Date.now(), m: (extra && extra.m) || 'duel' });
    return id;
  };
  N.joinRoom = async (id, hero) => { const r = await A.get('rooms/' + id); if (!r || r.state !== 'wait') throw new Error('Ce duel n\'est plus disponible.'); await A.update('rooms/' + id, { guest: uid(), gp: N.me.pseudo, gh: hero, state: 'ready' }); return r; };
  N.queue = async (hero, mode, maxDiff) => {
    // file d'attente : on rejoint le plus ancien joueur qui attend dans le même mode (rapide ou classé), sinon on attend soi-même
    mode = mode || 'q';
    const q = (await A.get('queue')) || {}, now = Date.now();
    const other = Object.keys(q).filter(k => k !== uid() && !q[k].room && now - q[k].t < 60000 && (q[k].m || 'q') === mode && (maxDiff == null || Math.abs((q[k].rk || 0) - (hero.rk || 0)) <= maxDiff)).sort((a, b) => q[a].t - q[b].t)[0];
    if (other) {
      const id = await N.createRoom(hero, null, { m: mode }), r = await A.tx('queue/' + other + '/room', cur => cur ? undefined : id);
      if (r.ok) { await A.update('rooms/' + id, { guest: other }); return { room: id, host: true }; }
      await A.remove('rooms/' + id);
    }
    await A.set('queue/' + uid(), { p: N.me.pseudo, t: now, room: null, m: mode, rk: hero.rk || 0 }); A.onDisc('queue/' + uid(), null);
    return { waiting: true };
  };
  N.leaveQueue = () => uid() ? A.remove('queue/' + uid()) : Promise.resolve();
  return N;
})();
