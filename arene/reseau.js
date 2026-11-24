/*
 * Rune Clash — Runes des Trophées : MATCHMAKING ET SESSIONS
 * ========================================================
 * Architecture modulaire :
 *
 *   ARENE_RESEAU.chercher(options)  → trouve une partie et rend une SESSION prête à jouer.
 *       • hors ligne / sans compte : session LOCALE immédiate (1 joueur + 9 bots) ;
 *       • en ligne : salle d'attente Firebase. Les vrais joueurs sont prioritaires ;
 *         à la fin de l'attente (ou dès que la salle est pleine), l'hôte complète avec des bots
 *         jusqu'à NB_JOUEURS. En MODE 'joueurs' (config), la partie attend 10 vrais joueurs.
 *
 *   Trois sessions, une seule interface (l'écran de jeu ne sait pas laquelle il utilise) :
 *       SessionLocale  : la simulation tourne ici, avec les bots.
 *       SessionHote    : pareil, et en plus elle reçoit les commandes des invités et publie l'état.
 *       SessionInvite  : ne simule rien ; elle envoie ses commandes et affiche l'état reçu,
 *                        avec prédiction de son propre déplacement pour rester réactive.
 *
 *   Interface commune d'une session :
 *       moi, participants, vue, enLigne, role
 *       commandes({mx,my}) · tirer({a,d}) · esquiver({a}) · superr({a,d})   (une pression = un appel ; l'anti-spam est dans le moteur)
 *       demarrer() · maj(dt) · evenements() · quitter() · arreter()
 *       onElimine(cb(place)) · onFin(cb({places, interrompue}))
 *
 * Chemins Firebase (règles dans database.rules.json, nœud « arene ») :
 *   arene/salles/{id}            { hote, etat:'attente'|'jeu', cree, tr, v, joueurs:{uid:{n,p,tr,c,t}},
 *                                  graine, participants:[…], debut }
 *   arene/salles/{id}/in/{uid}   commandes de l'invité
 *   arene/salles/{id}/etat       état publié par l'hôte
 *   arene/salles/{id}/fin        classement final
 */
window.ARENE_RESEAU = (function () {
  'use strict';
  const CFG = window.ARENE_CONFIG, M = window.ARENE_MOTEUR, MM = CFG.MATCHMAKING;
  const PAS = 1 / 30;
  const hyp = Math.hypot;
  const net = () => (typeof NET !== 'undefined' ? NET : null);

  function melanger(a, rnd) {
    rnd = rnd || Math.random;
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  /* Complète la liste des humains avec des bots jusqu'à NB_JOUEURS, puis mélange les places de départ. */
  function composer(humains, graine) {
    const rnd = M.alea(graine ^ 0x5bd1e995);
    const pris = humains.map(h => h.perso);
    const restants = melanger(CFG.PERSONNAGES.map(p => p.id).filter(id => pris.indexOf(id) < 0), rnd);
    const tous = CFG.PERSONNAGES.map(p => p.id);
    const noms = melanger(CFG.BOTS.NOMS.slice(), rnd);
    const niveau = humains.length ? Math.round(humains.reduce((a, h) => a + (h.trophees || 0), 0) / humains.length) : 0;
    const liste = humains.slice(0, CFG.NB_JOUEURS).map(h => ({ nom: h.nom, perso: h.perso, humain: true, uid: h.uid || null, cadre: h.cadre || 'base', niveau: h.trophees || 0 }));
    let i = 0;
    while (liste.length < CFG.NB_JOUEURS) {
      const perso = restants.length ? restants.shift() : tous[Math.floor(rnd() * tous.length)];
      liste.push({ nom: noms[i % noms.length], perso, humain: false, uid: null, cadre: 'base', niveau });
      i++;
    }
    return melanger(liste, rnd);
  }

  /* ------------------------------------------------------------------ */
  /* Base commune des sessions qui simulent (locale et hôte)            */
  /* ------------------------------------------------------------------ */
  function sessionSimulee(participants, graine, moi) {
    const sim = M.creerSimulation({ graine, participants });
    let E = { mx: 0, my: 0 };
    const appuis = [];
    let acc = 0, actif = false, minuteur = 0, dernier = 0;
    const evLocal = [];
    const cb = { elimine: [], fin: [], pas: [] };
    let annonceElim = false, annonceFin = false;
    const S = {
      moi, participants, vue: sim, sim, enLigne: false, role: 'locale',
      entreesDistantes: {},
      commandes(e) { E = e; },
      tirer(r) { if (r && appuis.length < 6) appuis.push({ act: 'A', a: r.a, d: r.d }); },
      esquiver(r) { if (appuis.length < 6) appuis.push({ act: 'E', a: r && isFinite(r.a) ? r.a : (sim.f[moi] ? sim.f[moi].ang : 0), d: 0 }); },
      superr(r) { if (r && appuis.length < 6) appuis.push({ act: 'S', a: r.a, d: r.d }); },
      coutSpecial() { const f = sim.f[moi]; return f ? sim.coutSpecial(f) : 0; },
      onElimine(f) { cb.elimine.push(f); },
      onFin(f) { cb.fin.push(f); },
      onPas(f) { cb.pas.push(f); },
      evenements() { return evLocal.splice(0); },
      demarrer() {
        if (actif) return;
        actif = true; dernier = performance.now();
        minuteur = setInterval(tick, 1000 / 30);
      },
      maj() { /* la simulation avance toute seule (minuteur) */ },
      arreter() { actif = false; clearInterval(minuteur); },
      quitter() {
        const f = sim.f[moi];
        if (f && f.vivant && !sim.fini) { f.hp = 0; avancer(PAS); }
      },
      finirVite() { if (!sim.fini) { sim.finirSansJoueur(); collecter(); cb.pas.forEach(fn => fn(0)); verifier(); } }
    };

    function collecter() {
      if (sim.ev.length) { const l = sim.ev.splice(0); for (const e of l) evLocal.push(e); if (S._evNet) for (const e of l) S._evNet.push(e); }
      if (evLocal.length > 400) evLocal.splice(0, evLocal.length - 400);
    }
    function verifier() {
      const f = sim.f[moi];
      if (f && !f.vivant && !annonceElim) { annonceElim = true; cb.elimine.forEach(fn => fn(f.place)); }
      if (sim.fini && !annonceFin) {
        annonceFin = true;
        if (f && !annonceElim) { annonceElim = true; cb.elimine.forEach(fn => fn(f.place)); }
        const places = sim.f.map(x => x.place);
        cb.fin.forEach(fn => fn({ places, interrompue: false }));
      }
    }
    function avancer(dt) {
      const ent = {};
      for (const k in S.entreesDistantes) ent[k] = S.entreesDistantes[k];
      /* chaque pression n'est transmise qu'une fois : le tampon et l'anti-spam sont gérés par le moteur */
      ent[moi] = { mx: E.mx, my: E.my, appuis: appuis.splice(0) };
      sim.pas(dt, ent);
      for (const k in S.entreesDistantes) { const d = S.entreesDistantes[k]; d.appuis = []; d.px = d.py = null; }
      collecter();
      cb.pas.forEach(fn => fn(dt));
      verifier();
    }
    function tick() {
      if (!actif) return;
      const now = performance.now();
      acc += Math.min(0.25, (now - dernier) / 1000); dernier = now;
      let n = 0;
      while (acc >= PAS && n++ < 8) { acc -= PAS; if (!sim.fini) avancer(PAS); }
      /* fin atteinte en dehors d'un pas normal (accélération) : on annonce quand même */
      if (sim.fini && !annonceFin) { collecter(); cb.pas.forEach(fn => fn(0)); verifier(); }
      if (sim.fini && S.role === 'locale') S.arreter();
    }
    return S;
  }

  /* ---------- Session locale : 1 joueur + bots ---------- */
  function SessionLocale(participants, graine, moi) {
    const S = sessionSimulee(participants, graine, moi);
    S.role = 'locale';
    return S;
  }

  /* ---------- Session hôte : simule pour tout le monde ---------- */
  function SessionHote(ctx) {
    const { A, id, uid, participants, graine } = ctx;
    const moi = participants.findIndex(p => p.uid === uid);
    const S = sessionSimulee(participants, graine, moi);
    S.role = 'hote'; S.enLigne = true; S._evNet = [];
    const base = 'arene/salles/' + id;
    const slotDe = {};
    participants.forEach((p, i) => { if (p.uid && p.uid !== uid) slotDe[p.uid] = i; });
    const vu = {};
    let offIn = null, envoi = 0, fin = false;

    offIn = A.on(base + '/in', v => {
      if (!v) return;
      const now = performance.now();
      for (const u in v) {
        const slot = slotDe[u];
        if (slot == null) continue;
        const m = v[u] || {}, prev = vu[u] || { s: -1, tc: 0, ec: 0, sc: 0, t: now };
        if (m.s === prev.s && !m.q) continue;
        const f = S.sim.f[slot];
        const d = S.entreesDistantes[slot] || (S.entreesDistantes[slot] = { mx: 0, my: 0, appuis: [] });
        if (m.q) { d.quitte = true; }
        if (f && f.vivant && isFinite(m.px) && isFinite(m.py)) {
          /* contrôle de vraisemblance : vitesse maximale du personnage depuis le dernier message */
          const el = Math.min(0.5, (now - prev.t) / 1000), v0 = M.PERSO[f.perso].vitesse * 1.6;
          const L = hyp(m.px - f.x, m.py - f.y), max = v0 * el * 1.4 + 0.3;
          const k = L > max ? max / L : 1;
          d.px = f.x + (m.px - f.x) * k; d.py = f.y + (m.py - f.y) * k; d.dt = el;
        }
        /* chaque nouvelle pression (compteur) devient un appui ; l'anti-spam du moteur refuse l'excédent */
        const ajouter = (act, n, a, dd) => { for (let i = 0; i < Math.min(3, n); i++) d.appuis.push({ act, a, d: dd }); };
        ajouter('A', (m.tc || 0) - prev.tc, +m.ta || 0, +m.td || 0);
        ajouter('E', (m.ec || 0) - prev.ec, +m.ea || 0, 0);
        ajouter('S', (m.sc || 0) - prev.sc, +m.sa || 0, +m.sd || 0);
        vu[u] = { s: m.s, tc: m.tc || 0, ec: m.ec || 0, sc: m.sc || 0, t: now };
      }
    });

    S.onPas(dt => {
      envoi += dt;
      if (envoi >= 1 / MM.ENVOI_ETAT_HZ || S.sim.fini) {
        envoi = 0;
        S.sim.ev = S._evNet.splice(0);
        const snap = S.sim.instantane();
        A.set(base + '/etat', snap).catch(() => {});
        if (S.sim.fini && !fin) {
          fin = true;
          A.set(base + '/fin', { places: S.sim.f.map(f => f.place), t: Date.now() }).catch(() => {});
          setTimeout(() => S.arreter(), 3000);
          setTimeout(() => A.remove(base).catch(() => {}), 20000);
        }
      }
    });
    const arr0 = S.arreter;
    S.arreter = () => { arr0(); if (offIn) { offIn(); offIn = null; } };
    /* l'hôte qui quitte en pleine partie : son combattant est éliminé, mais la partie continue
       pour les autres tant que l'application reste ouverte */
    return S;
  }

  /* ---------- Session invité : affiche l'état reçu, prédit son déplacement ---------- */
  function SessionInvite(ctx) {
    const { A, id, uid, participants, graine } = ctx;
    const base = 'arene/salles/' + id;
    const moi = participants.findIndex(p => p.uid === uid);
    const carte = M.genererCarte(graine);
    const R = CFG.REGLES;
    const vue = {
      t: 0, carte, zone: { cx: 0, cy: 0, r: carte.demi * Math.SQRT2 + 2 },
      f: participants.map((p, i) => {
        const d = M.PERSO[p.perso], sp = carte.depart[i];
        return { slot: i, nom: p.nom, perso: p.perso, humain: p.humain, cadre: p.cadre || 'base', x: sp.x, y: sp.y, ang: Math.atan2(-sp.y, -sp.x), r: R.RAYON_COMBATTANT,
          hp: d.pv, hpMax: d.pv, runes: 0, charges: R.CHARGES.MAX, ki: R.KI.DEPART, vivant: true, place: 0, kills: 0, force: 0, brume: false, revele: 0,
          etourdi: 0, bouclier: 0, invisible: 0, lent: 0, sautK: 0, etat: 'libre', comboE: 0, specA: 0, esqCd: 0, invul: 0, _a: null, _b: null };
      }),
      p: [], z: [], runes: [], steles: carte.steles.map((s, i) => ({ id: i, x: s.x, y: s.y, hp: R.STELES.PV, hpMax: R.STELES.PV }))
    };
    let E = { mx: 0, my: 0 }, tc = 0, ec = 0, sc = 0, ta = 0, td = 0, ea = 0, sa = 0, sd = 0, seq = 0, envoi = 0;
    /* prédiction locale de l'esquive et retour immédiat des refus évidents */
    let dash = null, dernierA = -9, refusLocalT = -9;
    const ES = R.ESQUIVE, CH = R.CHARGES;
    let dernierEtat = performance.now(), dernierSnapT = -1, recu = 0, lentF = 1, bonusVit = 0;
    const evQ = [], cb = { elimine: [], fin: [] };
    let annonceElim = false, annonceFin = false, actif = false, offEtat = null, offFin = null, minuteur = 0;
    let projRecu = [], projT = 0;
    const DELAI = 110;

    function appliquer(s) {
      if (!s || s.t == null || s.t <= dernierSnapT) return;
      dernierSnapT = s.t; recu++;
      const now = performance.now();
      dernierEtat = now;
      vue.t = s.t / 100; vue.zone.r = s.z / 100;
      s.f.forEach((a, i) => {
        const f = vue.f[i]; if (!f) return;
        const x = a[0] / 100, y = a[1] / 100, fl = a[8];
        const force = a[10];
        f.hp = a[3]; f.hpMax = a[4]; f.runes = a[5]; f.charges = a[6] / 100; f.ki = a[7];
        f.vivant = !!(fl & 1); f.etourdi = fl & 2 ? 1 : 0; f.bouclier = fl & 4 ? 1 : 0; f.invisible = fl & 8 ? 1 : 0; f.lent = fl & 16 ? 1 : 0;
        f.brume = !!(fl & 32); f.revele = fl & 64 ? 1 : 0; f.invul = fl & 128 ? 1 : 0; f.sautK = a[12] / 100;
        f.place = a[9]; f.kills = a[11];
        f.etat = M.ETATS[a[15]] || 'libre'; f.comboE = a[16] || 0; f.specA = (a[17] || 0) / 100; f.esqCd = (a[18] || 0) / 100;
        if (i === moi && dash) f.etat = 'esquive';
        if (i === moi) {
          lentF = (a[13] != null ? a[13] : 100) / 100; bonusVit = (a[14] || 0) / 100;
          const ecart = hyp(f.x - x, f.y - y);
          const forcee = f.etat === 'projection' || f.sautK || f.etat === 'etourdi';
          if (!dash && (force !== f.force || forcee || ecart > 3 || !f.vivant || recu < 2)) { f.x = x; f.y = y; }
          else if (ecart > 1.2) { f.x += (x - f.x) * 0.3; f.y += (y - f.y) * 0.3; }
          f.force = force;
        } else {
          f._a = f._b || { x, y, ang: a[2] / 100, t: now - 100 };
          f._b = { x, y, ang: a[2] / 100, t: now };
          if (force !== f.force) { f._a = f._b; }
          f.force = force;
        }
      });
      projRecu = s.p || []; projT = now;
      vue.z = (s.zs || []).map(z => ({ id: z[0], x: z[1] / 100, y: z[2] / 100, r: z[3] / 100, t: z[4] / 100, T: z[5] / 100, o: z[6] }));
      vue.runes = (s.ru || []).map(r => ({ id: r[0], x: r[1] / 100, y: r[2] / 100 }));
      (s.st || []).forEach((hp, i) => { if (vue.steles[i]) vue.steles[i].hp = hp; });
      const tRecu = now / 1000;
      (s.ev || []).forEach(e => { e._t = tRecu; evQ.push(e); });
      if (evQ.length > 300) evQ.splice(0, evQ.length - 300);
      const me = vue.f[moi];
      if (me && !me.vivant && !annonceElim) { annonceElim = true; cb.elimine.forEach(fn => fn(me.place)); }
      if (s.fin && !annonceFin) terminer(vue.f.map(f => f.place), false);
    }
    function terminer(places, interrompue) {
      if (annonceFin) return;
      annonceFin = true;
      const me = vue.f[moi];
      if (me && !annonceElim && !interrompue) { annonceElim = true; cb.elimine.forEach(fn => fn(me.place || places[moi])); }
      cb.fin.forEach(fn => fn({ places, interrompue }));
      S.arreter();
    }

    function envoyer(force) {
      const me = vue.f[moi];
      seq++;
      const m = { s: seq, tc, ta: +ta.toFixed(3), td: +td.toFixed(2), ec, ea: +ea.toFixed(3), sc, sa: +sa.toFixed(3), sd: +sd.toFixed(2) };
      if (me && me.vivant) { m.px = +me.x.toFixed(2); m.py = +me.y.toFixed(2); }
      if (force === 'q') m.q = 1;
      return A.set(base + '/in/' + uid, m).catch(() => {});
    }

    const S = {
      moi, participants, vue, enLigne: true, role: 'invite',
      commandes(e) { E = e; },
      tirer(r) {
        const me = vue.f[moi], t = performance.now() / 1000;
        /* retour immédiat (l'hôte refusera aussi) : pression trop rapide ou plus de charge */
        if (me && (t - dernierA < CH.INTERVALLE_MIN_S || me.charges < 1)) { evQ.push({ k: 'refus', s: moi, r: me.charges < 1 ? 'vide' : 'spam', local: 1 }); refusLocalT = t; }
        else { dernierA = t; if (me) me.charges = Math.max(0, me.charges - 1); }
        tc++; ta = r.a; td = r.d || 0; envoyer();
      },
      esquiver(r) {
        const me = vue.f[moi];
        if (!me || !me.vivant) return;
        const a = r && isFinite(r.a) ? r.a : me.ang || 0;
        if (me.esqCd > 0) { evQ.push({ k: 'refus', s: moi, r: 'esquive', local: 1 }); refusLocalT = performance.now() / 1000; }
        else if (!dash && (me.etat === 'libre' || me.etat === 'attaque')) { dash = { dx: Math.cos(a), dy: Math.sin(a), t: 0 }; me.esqCd = ES.RECHARGE_S; }
        ec++; ea = a; envoyer();
      },
      superr(r) {
        const me = vue.f[moi];
        if (me && me.ki < M.PERSO[me.perso].special.cout * (1 - R.COMBO.REDUCTION_KI_APRES_COMBO)) { evQ.push({ k: 'refus', s: moi, r: 'ki', local: 1 }); refusLocalT = performance.now() / 1000; }
        sc++; sa = r.a; sd = r.d || 0; envoyer();
      },
      coutSpecial() { const me = vue.f[moi]; if (!me) return 0; const c = M.PERSO[me.perso].special.cout; return Math.round(c * (me.comboE >= 2 ? 1 - R.COMBO.REDUCTION_KI_APRES_COMBO : 1)); },
      onElimine(f) { cb.elimine.push(f); },
      onFin(f) { cb.fin.push(f); },
      evenements() {
        /* un refus déjà signalé localement n'est pas répété quand l'hôte le confirme */
        const t = performance.now() / 1000;
        return evQ.splice(0).filter(e => !(e.k === 'refus' && e.s === moi && !e.local && Math.abs((e._t || t) - refusLocalT) < 0.6));
      },
      demarrer() {
        if (actif) return;
        actif = true; dernierEtat = performance.now();
        offEtat = A.on(base + '/etat', appliquer);
        offFin = A.on(base + '/fin', v => { if (v && v.places) terminer(v.places, false); });
        A.onDisc(base + '/in/' + uid, { q: 1, s: -2 });
        minuteur = setInterval(() => {
          if (!actif) return;
          if (performance.now() - dernierEtat > MM.COUPURE_S * 1000) terminer(vue.f.map(f => f.place), true);
        }, 500);
      },
      maj(dt) {
        if (!actif) return;
        const now = performance.now();
        const me = vue.f[moi];
        /* prédiction locale : esquive, puis déplacement (même vitesse selon l'état que sur l'hôte) */
        if (me && dash) {
          dash.t += dt;
          const pas = ES.DISTANCE / ES.DUREE_S * Math.min(dt, Math.max(0, ES.DUREE_S - (dash.t - dt)));
          const p = M.deplacerSurCarte(carte, me.x, me.y, dash.dx * pas, dash.dy * pas, me.r);
          me.x = p.x; me.y = p.y; me.ang = Math.atan2(dash.dy, dash.dx); me.etat = 'esquive';
          if (dash.t >= ES.DUREE_S) dash = null;
        } else if (me && me.vivant && !me.sautK) {
          const MV = R.MOUVEMENT, k = me.etat === 'libre' ? 1 : me.etat === 'attaque' ? MV.ATTAQUE : me.etat === 'preparation' ? MV.PREPARATION : 0;
          let mx = E.mx || 0, my = E.my || 0;
          const L = hyp(mx, my);
          if (L > 1) { mx /= L; my /= L; }
          if (L > 0.05 && k > 0) {
            const v = M.PERSO[me.perso].vitesse * k * (me.lent ? lentF : 1) * (me.invisible ? 1 + bonusVit : 1);
            const p = M.deplacerSurCarte(carte, me.x, me.y, mx * v * dt, my * v * dt, me.r);
            if (me.etat === 'libre') me.ang = Math.atan2(p.y - me.y, p.x - me.x);
            me.x = p.x; me.y = p.y;
          }
        }
        if (me) { me.brume = M.dansBrume(carte, me.x, me.y); me.esqCd = Math.max(0, me.esqCd - dt); }
        /* les autres combattants : interpolation entre les deux derniers états */
        const tr = now - DELAI;
        for (const f of vue.f) {
          if (f.slot === moi || !f._b) continue;
          const a = f._a, b = f._b, k = b.t > a.t ? Math.max(0, Math.min(1.2, (tr - a.t) / (b.t - a.t))) : 1;
          f.x = a.x + (b.x - a.x) * k; f.y = a.y + (b.y - a.y) * k; f.ang = b.ang;
        }
        /* projectiles : extrapolation depuis le dernier état */
        const el = (now - projT) / 1000;
        const F = M.FORMES;
        vue.p = [];
        for (const p of projRecu) {
          if (p[1] === 1) {
            const q = { k: 'lob', id: p[0], x0: p[2] / 100, y0: p[3] / 100, tx: p[4] / 100, ty: p[5] / 100, t: p[6] / 100 + el, T: p[7] / 100, r: p[8] / 100, o: p[9], sup: !!p[10], forme: F[p[11]] };
            if (q.t < q.T) vue.p.push(q);
          } else if (p[1] === 2) {
            /* faisceau : suit son lanceur (position prédite ou interpolée) */
            const o = vue.f[p[9]], q = { k: 'faisceau', id: p[0], x: p[2] / 100, y: p[3] / 100, a: p[4] / 100, l: p[5] / 100, w: p[6] / 100, t: p[7] / 100 + el, T: p[8] / 100, o: p[9] };
            if (o) { q.x = o.x + Math.cos(q.a) * 0.4; q.y = o.y + Math.sin(q.a) * 0.4; }
            if (q.t < q.T + 0.1) vue.p.push(q);
          } else {
            const vx = p[4] / 100, vy = p[5] / 100;
            if (hyp(vx * el, vy * el) < p[9] / 100 + 0.2) vue.p.push({ k: 'tir', id: p[0], x: p[2] / 100 + vx * el, y: p[3] / 100 + vy * el, vx, vy, r: p[6] / 100, o: p[7], sup: !!p[8], forme: F[p[10]], fin: !!p[11] });
          }
        }
        for (const z of vue.z) z.t = Math.max(0, z.t - dt);
        envoi += dt;
        if (envoi >= 1 / MM.ENVOI_ENTREES_HZ) { envoi = 0; if (me && me.vivant) envoyer(); }
      },
      quitter() { if (vue.f[moi] && vue.f[moi].vivant) envoyer('q'); },
      arreter() {
        actif = false; clearInterval(minuteur);
        if (offEtat) { offEtat(); offEtat = null; }
        if (offFin) { offFin(); offFin = null; }
      }
    };
    return S;
  }

  /* ------------------------------------------------------------------ */
  /* Matchmaking                                                        */
  /* ------------------------------------------------------------------ */
  function enLigneDisponible() {
    const N = net();
    return !!(N && N.ready && N.user && N.me && N.me.pseudo && N.db && N.db() && navigator.onLine !== false);
  }

  /*
   * options : { moi:{nom, perso, trophees, cadre}, onMaj(info), onPret(session), onErreur(msg), forcerLocal }
   * info    : { etape:'recherche'|'attente'|'depart', joueurs:[{nom,perso}], attendus, restant, enLigne }
   * rend    : { annuler() }
   */
  function chercher(o) {
    let annule = false, fini = false;
    const minuteurs = [], arrets = [];
    const nettoyer = () => { minuteurs.forEach(t => clearTimeout(t) || clearInterval(t)); arrets.forEach(f => { try { f(); } catch (_) {} }); };
    const pret = s => { if (annule || fini) return; fini = true; nettoyer(); o.onPret(s); };

    function local() {
      const graine = (Math.random() * 2 ** 31) >>> 0;
      o.onMaj({ etape: 'recherche', joueurs: [{ nom: o.moi.nom, perso: o.moi.perso }], attendus: CFG.NB_JOUEURS, enLigne: false });
      const parts = composer([{ nom: o.moi.nom, perso: o.moi.perso, trophees: o.moi.trophees, cadre: o.moi.cadre, uid: 'moi' }], graine);
      let n = 1;
      const iv = setInterval(() => {
        if (annule) return;
        n = Math.min(CFG.NB_JOUEURS, n + 1 + Math.floor(Math.random() * 3));
        o.onMaj({ etape: 'recherche', joueurs: parts.filter(p => p.humain).concat(parts.filter(p => !p.humain).slice(0, n - 1)).map(p => ({ nom: p.nom, perso: p.perso, bot: !p.humain })), attendus: CFG.NB_JOUEURS, enLigne: false });
        if (n >= CFG.NB_JOUEURS) {
          clearInterval(iv);
          const moi = parts.findIndex(p => p.uid === 'moi');
          parts[moi].uid = null;
          minuteurs.push(setTimeout(() => pret(SessionLocale(parts, graine, moi)), 350));
        }
      }, 260);
      minuteurs.push(iv);
    }

    async function enLigne() {
      const N = net(), A = N.db(), uid = N.user.uid;
      const moiJ = { n: o.moi.nom, p: o.moi.perso, tr: o.moi.trophees || 0, c: o.moi.cadre || 'base', t: Date.now() };
      o.onMaj({ etape: 'recherche', joueurs: [{ nom: o.moi.nom, perso: o.moi.perso }], attendus: CFG.NB_JOUEURS, enLigne: true });

      const salles = await A.top('arene/salles', 'cree', 25).catch(() => ({}));
      if (annule) return;
      const now = Date.now();
      const candidates = Object.keys(salles || {}).map(k => Object.assign({ id: k }, salles[k])).filter(s =>
        s && s.etat === 'attente' && s.hote !== uid && s.v === CFG.VERSION && now - (s.cree || 0) < MM.SALLE_VALIDE_S * 1000 &&
        Object.keys(s.joueurs || {}).length < CFG.NB_JOUEURS && Math.abs((s.tr || 0) - moiJ.tr) <= MM.ECART_TROPHEES)
        .sort((a, b) => Object.keys(b.joueurs || {}).length - Object.keys(a.joueurs || {}).length || a.cree - b.cree);

      if (candidates.length) return rejoindre(A, uid, candidates[0].id, moiJ);
      return creer(A, uid, moiJ);
    }

    function rejoindre(A, uid, id, moiJ) {
      const base = 'arene/salles/' + id;
      A.set(base + '/joueurs/' + uid, moiJ).catch(() => {});
      A.onDisc(base + '/joueurs/' + uid, null);
      const off = A.on(base, s => {
        if (annule || fini) return;
        if (!s) { off(); return relancer(); }
        const js = s.joueurs || {};
        if (s.etat === 'attente') {
          o.onMaj({ etape: 'attente', joueurs: Object.values(js).map(j => ({ nom: j.n, perso: j.p })), attendus: CFG.NB_JOUEURS, enLigne: true, restant: Math.max(0, MM.ATTENTE_MAX_S - (Date.now() - (s.cree || Date.now())) / 1000) });
          return;
        }
        if (s.etat === 'jeu' && s.participants) {
          off();
          const parts = s.participants.map(p => ({ nom: p.n, perso: p.p, humain: !!p.h, uid: p.u || null, cadre: p.c || 'base', niveau: p.v || 0 }));
          if (!parts.some(p => p.uid === uid)) return relancer();
          A.onDisc(base + '/joueurs/' + uid, null);
          o.onMaj({ etape: 'depart', joueurs: parts.map(p => ({ nom: p.nom, perso: p.perso, bot: !p.humain })), attendus: CFG.NB_JOUEURS, enLigne: true });
          pret(SessionInvite({ A, id, uid, participants: parts, graine: s.graine }));
        }
      });
      arrets.push(off);
      arrets.push(() => { if (!fini) A.remove(base + '/joueurs/' + uid).catch(() => {}); });
    }

    function creer(A, uid, moiJ) {
      const id = A.key('arene/salles'), base = 'arene/salles/' + id, debut = Date.now();
      A.set(base, { hote: uid, etat: 'attente', cree: A.ts(), tr: moiJ.tr, v: CFG.VERSION, joueurs: { [uid]: moiJ } }).catch(e => o.onErreur && o.onErreur(e));
      A.onDisc(base, null);
      let js = { [uid]: moiJ }, regroupe = false, lance = false;
      const off = A.on(base + '/joueurs', v => { if (v) js = v; });
      arrets.push(off);
      arrets.push(() => { if (!lance) A.remove(base).catch(() => {}); });
      const iv = setInterval(async () => {
        if (annule || fini || lance) return;
        const n = Object.keys(js).length, el = (Date.now() - debut) / 1000;
        o.onMaj({ etape: 'attente', joueurs: Object.values(js).map(j => ({ nom: j.n, perso: j.p })), attendus: CFG.NB_JOUEURS, enLigne: true, restant: Math.max(0, MM.ATTENTE_MAX_S - el), hote: true });
        /* deux joueurs ont créé une salle au même moment : le plus récent rejoint l'autre */
        if (!regroupe && n === 1 && el > 1.2) {
          regroupe = true;
          const s = await A.top('arene/salles', 'cree', 25).catch(() => ({}));
          const autre = Object.keys(s || {}).map(k => Object.assign({ id: k }, s[k])).find(x => x.id !== id && x.etat === 'attente' && x.hote !== uid && x.v === CFG.VERSION &&
            Date.now() - (x.cree || 0) < MM.SALLE_VALIDE_S * 1000 && Object.keys(x.joueurs || {}).length < CFG.NB_JOUEURS && (x.cree || 0) <= Date.now() - el * 1000 &&
            Math.abs((x.tr || 0) - moiJ.tr) <= MM.ECART_TROPHEES);
          if (autre && Object.keys(js).length === 1 && !annule && !fini) {
            clearInterval(iv); off(); lance = true;
            await A.remove(base).catch(() => {});
            return rejoindre(A, uid, autre.id, moiJ);
          }
        }
        const plein = n >= CFG.NB_JOUEURS;
        const mixte = MM.MODE !== 'joueurs';
        if (plein || (mixte && ((n === 1 && el >= MM.ATTENTE_SEUL_S) || el >= MM.ATTENTE_MAX_S))) {
          lance = true; clearInterval(iv);
          const graine = (Math.random() * 2 ** 31) >>> 0;
          const humains = Object.keys(js).map(u => ({ uid: u, nom: js[u].n, perso: js[u].p, trophees: js[u].tr, cadre: js[u].c, t: js[u].t || 0 }))
            .sort((a, b) => (a.uid === uid ? -1 : b.uid === uid ? 1 : a.t - b.t)).slice(0, CFG.NB_JOUEURS);
          const parts = composer(humains, graine);
          const P = parts.map(p => ({ n: p.nom, p: p.perso, h: p.humain ? 1 : 0, u: p.uid || null, c: p.cadre, v: p.niveau }));
          await A.update(base, { etat: 'jeu', graine, participants: P, debut: Date.now() + MM.COMPTE_A_REBOURS_S * 1000 }).catch(() => {});
          off();
          o.onMaj({ etape: 'depart', joueurs: parts.map(p => ({ nom: p.nom, perso: p.perso, bot: !p.humain })), attendus: CFG.NB_JOUEURS, enLigne: true });
          pret(SessionHote({ A, id, uid, participants: parts, graine }));
        }
      }, 250);
      minuteurs.push(iv);
    }

    function relancer() {
      if (annule || fini) return;
      nettoyer(); minuteurs.length = 0; arrets.length = 0;
      setTimeout(() => { if (!annule && !fini) enLigne().catch(() => local()); }, 300);
    }

    if (!o.forcerLocal && enLigneDisponible()) enLigne().catch(e => { console.warn('[Runes des Trophées] matchmaking', e); if (!annule && !fini) { nettoyer(); local(); } });
    else local();

    return { annuler() { annule = true; nettoyer(); } };
  }

  return { chercher, enLigneDisponible, composer, SessionLocale, SessionHote, SessionInvite };
})();
