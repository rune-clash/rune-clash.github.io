/*
 * Rune Clash — Arène des Trophées : MOTEUR DE JEU
 * ===============================================
 * Simulation pure (aucun affichage, aucun réseau) : carte, déplacements, collisions,
 * attaques, supers, zone qui rétrécit, stèles et runes, brume, bots, classement 1er → 10e.
 *
 * Utilisée telle quelle :
 *   - en solo (1 joueur + 9 bots) par la session locale,
 *   - en ligne par l'HÔTE de la partie, qui fait autorité (les invités envoient leurs commandes).
 *
 * API : ARENE_MOTEUR.creerSimulation({ graine, participants }) → simulation
 *        sim.pas(dt, entrees)        avance la partie (entrees[slot] = { mx, my, tir, sup, px, py })
 *        sim.entreeBot(f, dt)        commandes calculées par l'IA pour le bot f
 *        sim.instantane()            état compact à envoyer sur le réseau
 *        sim.finirSansJoueur()       termine vite la partie (après l'élimination du joueur, en solo)
 *        ARENE_MOTEUR.genererCarte(graine), deplacerSurCarte(...), visible(...)
 */
window.ARENE_MOTEUR = (function () {
  'use strict';
  const CFG = window.ARENE_CONFIG;
  const R = CFG.REGLES;
  const TAU = Math.PI * 2, DEG = Math.PI / 180;
  const hyp = Math.hypot;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const PERSO = {};
  CFG.PERSONNAGES.forEach(p => { PERSO[p.id] = p; });
  const RAYON_STELE = 0.8;

  /* Hasard reproductible (même graine = même carte chez tous les joueurs). */
  function alea(graine) {
    let s = (graine >>> 0) || 1;
    return function () {
      s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ------------------------------------------------------------------ */
  /* Carte : murs, rochers, brumes, stèles et points de départ           */
  /* ------------------------------------------------------------------ */
  function genererCarte(graine) {
    const rnd = alea(graine), T = R.TAILLE, H = T / 2;
    const murs = [], rochers = [], brumes = [], steles = [], depart = [];
    const a0 = rnd() * TAU;
    for (let i = 0; i < CFG.NB_JOUEURS; i++) {
      const a = a0 + i * TAU / CFG.NB_JOUEURS;
      depart.push({ x: Math.cos(a) * H * 0.8, y: Math.sin(a) * H * 0.8 });
    }
    /* rotation d'un quart de tour : la carte est symétrique, donc équitable */
    const rot4 = (x, y) => [[x, y], [-y, x], [-x, -y], [y, -x]];
    const loinDesDeparts = (x, y, m) => depart.every(d => hyp(d.x - x, d.y - y) > m);
    const distRect = (m, x, y) => hyp(Math.max(Math.abs(x - m.x) - m.w / 2, 0), Math.max(Math.abs(y - m.y) - m.h / 2, 0));
    const libre = (x, y, m) => murs.every(w => distRect(w, x, y) > m) && rochers.every(r => hyp(r.x - x, r.y - y) > r.r + m);

    let essais = 0;
    while (murs.length < 7 * 4 && essais++ < 400) {
      const hor = rnd() < 0.5, L = 2.6 + rnd() * 4.2, E = 1.1;
      const w = hor ? L : E, h = hor ? E : L;
      const cx = 2.2 + rnd() * (H - 4.5), cy = 2.2 + rnd() * (H - 4.5);
      const copies = rot4(cx, cy).map(([x, y], k) => ({ x, y, w: k % 2 ? h : w, h: k % 2 ? w : h }));
      const ok = copies.every(c => {
        const coins = [[c.x - c.w / 2, c.y - c.h / 2], [c.x + c.w / 2, c.y + c.h / 2], [c.x, c.y]];
        return depart.every(d => distRect(c, d.x, d.y) > 2.6) && hyp(c.x, c.y) > 3 &&
          murs.every(m => !(Math.abs(m.x - c.x) < (m.w + c.w) / 2 + 1.7 && Math.abs(m.y - c.y) < (m.h + c.h) / 2 + 1.7)) &&
          coins.every(([x, y]) => Math.abs(x) < H - 1 && Math.abs(y) < H - 1);
      });
      if (ok) copies.forEach(c => murs.push(c));
    }
    essais = 0;
    while (rochers.length < 3 * 4 && essais++ < 300) {
      const r = 0.75 + rnd() * 0.55, cx = 2 + rnd() * (H - 4), cy = 2 + rnd() * (H - 4);
      const copies = rot4(cx, cy);
      if (copies.every(([x, y]) => loinDesDeparts(x, y, r + 2.4) && libre(x, y, r + 1.4) && hyp(x, y) > 2.5))
        copies.forEach(([x, y]) => rochers.push({ x, y, r }));
    }
    essais = 0;
    const nbBrumes = Math.max(4, Math.round(R.BRUME.NOMBRE / 4) * 4);
    while (brumes.length < nbBrumes && essais++ < 300) {
      const r = 1.9 + rnd() * 1.3, cx = 1 + rnd() * (H - 4), cy = 1 + rnd() * (H - 4);
      const copies = rot4(cx, cy);
      if (copies.every(([x, y]) => brumes.every(b => hyp(b.x - x, b.y - y) > b.r + r + 1) && loinDesDeparts(x, y, 2)))
        copies.forEach(([x, y]) => brumes.push({ x, y, r }));
    }
    /* une stèle devant chaque point de départ (même distance pour tout le monde), puis les autres au centre */
    depart.forEach(d => {
      for (let k = 0; k < 8; k++) {
        const f = 0.74 - k * 0.025, a = Math.atan2(d.y, d.x) + (k % 2 ? 1 : -1) * k * 0.03;
        const L = hyp(d.x, d.y) * f, x = Math.cos(a) * L, y = Math.sin(a) * L;
        if (libre(x, y, RAYON_STELE + 0.6)) { steles.push({ x, y }); break; }
      }
    });
    essais = 0;
    const parQuart = Math.floor((R.STELES.NOMBRE - CFG.NB_JOUEURS - 2) / 4);
    const base = steles.length;
    while (steles.length < base + parQuart * 4 && essais++ < 300) {
      const cx = 2.5 + rnd() * (H - 5), cy = 2.5 + rnd() * (H - 5);
      const copies = rot4(cx, cy);
      if (copies.every(([x, y]) => libre(x, y, RAYON_STELE + 0.9) && loinDesDeparts(x, y, 2.5) && steles.every(s => hyp(s.x - x, s.y - y) > 3)))
        copies.forEach(([x, y]) => steles.push({ x, y }));
    }
    [[2.2, 0], [-2.2, 0]].forEach(([x, y]) => { if (steles.length < R.STELES.NOMBRE && libre(x, y, RAYON_STELE + 0.5)) steles.push({ x, y }); });
    return { taille: T, demi: H, murs, rochers, brumes, steles, depart, graine };
  }

  /* ------------------------------------------------------------------ */
  /* Géométrie et collisions                                            */
  /* ------------------------------------------------------------------ */
  function resoudre(carte, p, r) {
    const H = carte.demi - r;
    for (let pass = 0; pass < 2; pass++) {
      for (const m of carte.murs) {
        const qx = clamp(p.x, m.x - m.w / 2, m.x + m.w / 2), qy = clamp(p.y, m.y - m.h / 2, m.y + m.h / 2);
        let dx = p.x - qx, dy = p.y - qy, d = hyp(dx, dy);
        if (d < r) {
          if (d < 1e-6) { /* centre dans le mur : sortie par le côté le plus proche */
            const gx = m.w / 2 - Math.abs(p.x - m.x), gy = m.h / 2 - Math.abs(p.y - m.y);
            if (gx < gy) p.x = m.x + Math.sign(p.x - m.x || 1) * (m.w / 2 + r); else p.y = m.y + Math.sign(p.y - m.y || 1) * (m.h / 2 + r);
          } else { p.x = qx + dx / d * r; p.y = qy + dy / d * r; }
        }
      }
      for (const o of carte.rochers) {
        const dx = p.x - o.x, dy = p.y - o.y, d = hyp(dx, dy), m = o.r + r;
        if (d < m) { const k = d < 1e-6 ? 1 : d; p.x = o.x + (d < 1e-6 ? m : dx / k * m); p.y = o.y + (d < 1e-6 ? 0 : dy / k * m); }
      }
      p.x = clamp(p.x, -H, H); p.y = clamp(p.y, -H, H);
    }
    return p;
  }

  /* Déplace un point avec collisions (utilisé aussi par la prédiction des invités). */
  function deplacerSurCarte(carte, x, y, dx, dy, r) {
    const n = Math.max(1, Math.ceil(hyp(dx, dy) / 0.35));
    const p = { x, y };
    for (let i = 0; i < n; i++) { p.x += dx / n; p.y += dy / n; resoudre(carte, p, r); }
    return p;
  }

  function dansObstacle(carte, x, y, marge) {
    marge = marge || 0;
    for (const m of carte.murs) if (Math.abs(x - m.x) < m.w / 2 + marge && Math.abs(y - m.y) < m.h / 2 + marge) return true;
    for (const o of carte.rochers) if (hyp(x - o.x, y - o.y) < o.r + marge) return true;
    return false;
  }

  /* Le segment (a → b) traverse-t-il un mur ou un rocher ? */
  function segmentBloque(carte, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    for (const m of carte.murs) {
      let t0 = 0, t1 = 1;
      const x0 = m.x - m.w / 2, x1 = m.x + m.w / 2, y0 = m.y - m.h / 2, y1 = m.y + m.h / 2;
      const test = (p, q) => {
        if (p === 0) return q >= 0;
        const r = q / p;
        if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
        return true;
      };
      if (test(-dx, ax - x0) && test(dx, x1 - ax) && test(-dy, ay - y0) && test(dy, y1 - ay) && t0 <= t1) return true;
    }
    for (const o of carte.rochers) {
      const L = dx * dx + dy * dy || 1, t = clamp(((o.x - ax) * dx + (o.y - ay) * dy) / L, 0, 1);
      if (hyp(ax + dx * t - o.x, ay + dy * t - o.y) < o.r * 0.9) return true;
    }
    return false;
  }

  const dansBrume = (carte, x, y) => carte.brumes.some(b => hyp(b.x - x, b.y - y) < b.r);

  /* L'observateur voit-il la cible ? (brume et invisibilité) */
  function visible(obs, c) {
    if (!c.vivant) return false;
    if (obs && obs.slot === c.slot) return true;
    const d = obs ? hyp(obs.x - c.x, obs.y - c.y) : 99;
    if (c.invisible > 0) return d < 1.6;
    if (c.brume && c.revele <= 0) return d < R.BRUME.VISIBILITE;
    return true;
  }

  /* ------------------------------------------------------------------ */
  /* Simulation                                                          */
  /* ------------------------------------------------------------------ */
  function niveauBot(trophees) {
    return CFG.BOTS.NIVEAUX.find(n => trophees <= n.jusqua) || CFG.BOTS.NIVEAUX[CFG.BOTS.NIVEAUX.length - 1];
  }

  function creerSimulation(opts) {
    const carte = genererCarte(opts.graine);
    const rnd = alea((opts.graine ^ 0x9E3779B9) >>> 0);
    const zoneR0 = carte.demi * Math.SQRT2 + 2;
    const S = {
      t: 0, carte, f: [], p: [], z: [], runes: [],
      steles: carte.steles.map((s, i) => ({ id: i, x: s.x, y: s.y, hp: R.STELES.PV, hpMax: R.STELES.PV })),
      zone: { cx: 0, cy: 0, r: zoneR0, pct: R.ZONE.DEGATS_PCT_S },
      fini: false, ordre: [], ev: [], nid: 1
    };

    opts.participants.forEach((pa, i) => {
      const d = PERSO[pa.perso] || CFG.PERSONNAGES[0];
      const sp = carte.depart[i];
      S.f.push({
        slot: i, nom: pa.nom, perso: d.id, humain: !!pa.humain, uid: pa.uid || null, cadre: pa.cadre || 'base',
        bot: pa.humain ? null : niveauBot(pa.niveau || 0),
        x: sp.x, y: sp.y, vx: 0, vy: 0, ang: Math.atan2(-sp.y, -sp.x), r: R.RAYON_COMBATTANT,
        hpBase: d.pv, hpMax: d.pv, hp: d.pv, runes: 0, mun: R.MUNITIONS, cdTir: 0, sup: 0,
        vivant: true, place: 0, elimT: 0, kills: 0, degats: 0, dDeg: -99, dTir: -99, parQui: -1, parQuiT: -99,
        lent: 0, lentF: 1, etourdi: 0, bouclier: 0, bouclierRed: 0, invisible: 0, bonusVit: 0, bonusProchain: 0,
        ruee: null, saut: null, salve: null, force: 0, brume: false, revele: 0, ia: null
      });
    });

    const ev = e => { if (S.ev.length < 120) S.ev.push(e); };
    const vivants = () => S.f.filter(f => f.vivant);
    const multDegats = f => 1 + f.runes * R.RUNES.BONUS_DEGATS;

    function majZone() {
      const Z = R.ZONE, t = S.t;
      let r = zoneR0;
      if (t > Z.DEBUT_S) r = zoneR0 + (Z.RAYON_FINAL - zoneR0) * clamp((t - Z.DEBUT_S) / (Z.FIN_S - Z.DEBUT_S), 0, 1);
      const fin2 = R.DUREE_MAX_S - 25;
      if (t > fin2) r = Z.RAYON_FINAL * clamp(1 - (t - fin2) / 20, 0, 1);
      S.zone.r = r;
      S.zone.pct = Z.DEGATS_PCT_S + (Z.DEGATS_PCT_S_MAX - Z.DEGATS_PCT_S) * clamp((t - Z.DEBUT_S) / (Z.FIN_S - Z.DEBUT_S), 0, 1);
    }

    function degat(c, montant, src, opt) {
      if (!c.vivant || montant <= 0 || c.saut) return 0;
      if (c.bouclier > 0) montant *= 1 - c.bouclierRed;
      montant = Math.round(montant);
      c.hp -= montant; c.dDeg = S.t; c.revele = Math.max(c.revele, 0.6);
      if (c.invisible > 0 && montant > 0) c.invisible = Math.min(c.invisible, 0.4);
      if (src && src !== c) {
        src.degats += montant;
        c.parQui = src.slot; c.parQuiT = S.t;
        if (!(opt && opt.sup)) src.sup = Math.min(1, src.sup + montant / PERSO[src.perso].super.charge);
      }
      ev({ k: 'hit', x: +c.x.toFixed(2), y: +c.y.toFixed(2), n: montant, s: c.slot, o: src ? src.slot : -1, z: opt && opt.zone ? 1 : 0 });
      return montant;
    }

    function degatStele(s, montant, src) {
      if (s.hp <= 0) return;
      s.hp -= Math.round(montant);
      if (src) src.sup = Math.min(1, src.sup + montant * 0.25 / PERSO[src.perso].super.charge);
      ev({ k: 'stele', s: s.id, x: s.x, y: s.y });
      if (s.hp <= 0) {
        s.hp = 0;
        S.runes.push({ id: S.nid++, x: s.x, y: s.y });
        ev({ k: 'casse', x: s.x, y: s.y });
      }
    }

    function pousser(c, dx, dy, dist) {
      if (!c.vivant || dist <= 0 || c.saut) return;
      const L = hyp(dx, dy) || 1;
      const p = deplacerSurCarte(carte, c.x, c.y, dx / L * dist, dy / L * dist, c.r);
      c.x = p.x; c.y = p.y; c.force++;
      if (c.ruee) c.ruee = null;
    }

    /* ---------- Attaques ---------- */
    function tirer(f, A, ang, dist, sup) {
      let mult = multDegats(f);
      if (!sup && f.bonusProchain) { mult *= 1 + f.bonusProchain; f.bonusProchain = 0; }
      const cx = Math.cos(ang), cy = Math.sin(ang);
      f.ang = ang;
      if (A.type === 'tir') {
        const n = A.projectiles || 1, sp = (A.dispersion || 0) * DEG;
        for (let i = 0; i < n; i++) {
          let a = ang;
          if (sp >= TAU - 0.01) a = ang + i * TAU / n;
          else if (n > 1) a = ang - sp / 2 + sp * i / (n - 1);
          const ca = Math.cos(a), sa = Math.sin(a), v = A.vitesseProj || 16;
          S.p.push({
            id: S.nid++, k: 'tir', o: f.slot, x: f.x + ca * 0.45, y: f.y + sa * 0.45, vx: ca * v, vy: sa * v,
            reste: A.portee, dmg: A.degats * mult, r: A.rayon || 0.3, perce: !!A.perce, touches: [],
            ralenti: A.ralenti || null, recul: A.recul || 0, sup: !!sup
          });
        }
        if (!sup && A.salve > 1) f.salve = { n: A.salve - 1, t: A.intervalle || 0.1, ang, A, mult };
        if (sup && A.soinLanceur) f.hp = Math.min(f.hpMax, f.hp + f.hpMax * A.soinLanceur);
      } else if (A.type === 'cone') {
        const demiA = (A.angle || 60) * DEG / 2;
        for (const e of S.f) {
          if (e === f || !e.vivant) continue;
          const dx = e.x - f.x, dy = e.y - f.y, d = hyp(dx, dy);
          if (d > A.portee + e.r) continue;
          let da = Math.atan2(dy, dx) - ang; da = Math.atan2(Math.sin(da), Math.cos(da));
          if (Math.abs(da) <= demiA + Math.atan2(e.r, Math.max(d, 0.1)) && !segmentBloque(carte, f.x, f.y, e.x, e.y)) degat(e, A.degats * mult, f, { sup });
        }
        for (const s of S.steles) {
          if (s.hp <= 0) continue;
          const dx = s.x - f.x, dy = s.y - f.y, d = hyp(dx, dy);
          let da = Math.atan2(dy, dx) - ang; da = Math.atan2(Math.sin(da), Math.cos(da));
          if (d < A.portee + RAYON_STELE && Math.abs(da) <= demiA + 0.3) degatStele(s, A.degats * mult, f);
        }
        ev({ k: 'cone', x: +f.x.toFixed(2), y: +f.y.toFixed(2), a: +ang.toFixed(2), p: A.portee, l: A.angle || 60, o: f.slot });
      } else if (A.type === 'lob') {
        const d = clamp(dist == null ? A.portee : dist, 1, A.portee);
        S.p.push({ id: S.nid++, k: 'lob', o: f.slot, x0: f.x, y0: f.y, x: f.x, y: f.y, tx: f.x + cx * d, ty: f.y + cy * d, t: 0, T: A.delai || 0.6, r: A.rayon, dmg: A.degats * mult, sup: !!sup, vx: 0, vy: 0 });
      }
    }

    function cibleSol(f, ang, dist, portee) {
      const d = clamp(dist == null ? portee : dist, 0.5, portee);
      let x = f.x + Math.cos(ang) * d, y = f.y + Math.sin(ang) * d;
      x = clamp(x, -carte.demi + 0.8, carte.demi - 0.8); y = clamp(y, -carte.demi + 0.8, carte.demi - 0.8);
      return { x, y };
    }

    function lancerSuper(f, ang, dist) {
      const Su = PERSO[f.perso].super, mult = multDegats(f);
      f.ang = ang;
      ev({ k: 'super', s: f.slot, x: +f.x.toFixed(2), y: +f.y.toFixed(2) });
      if (Su.type === 'tir' || Su.type === 'cone' || Su.type === 'lob') return tirer(f, Su, ang, dist, true);
      if (Su.type === 'ruee') { f.ruee = { dx: Math.cos(ang), dy: Math.sin(ang), reste: Su.distance, v: Su.vitesse, dmg: Su.degats * mult, recul: Su.recul, touches: [] }; return; }
      if (Su.type === 'bouclier') {
        f.bouclier = Su.duree; f.bouclierRed = Su.reduction;
        for (const e of S.f) {
          if (e === f || !e.vivant) continue;
          const dx = e.x - f.x, dy = e.y - f.y, d = hyp(dx, dy);
          if (d < Su.rayon + e.r) { degat(e, Su.degats * mult, f, { sup: true }); pousser(e, dx, dy, Su.recul); }
        }
        ev({ k: 'onde', x: +f.x.toFixed(2), y: +f.y.toFixed(2), r: Su.rayon, o: f.slot });
        return;
      }
      if (Su.type === 'soin') {
        const avant = f.hp;
        f.hp = Math.min(f.hpMax, f.hp + f.hpMax * Su.soin);
        f.bouclier = Su.bouclierDuree; f.bouclierRed = Su.reduction;
        ev({ k: 'soin', s: f.slot, n: Math.round(f.hp - avant), x: +f.x.toFixed(2), y: +f.y.toFixed(2) });
        return;
      }
      if (Su.type === 'invisibilite') { f.invisible = Su.duree; f.bonusVit = Su.bonusVitesse; f.bonusProchain = Su.bonusProchaineAttaque; return; }
      if (Su.type === 'zone') {
        const c = cibleSol(f, ang, dist, Su.portee);
        S.z.push({ id: S.nid++, k: 'zone', x: c.x, y: c.y, r: Su.rayon, t: Su.delai, T: Su.delai, dmg: Su.degats * mult, etourdit: Su.etourdit, o: f.slot });
        return;
      }
      if (Su.type === 'saut') {
        let c = cibleSol(f, ang, dist, Su.portee);
        for (let k = 0; k < 10 && dansObstacle(carte, c.x, c.y, f.r); k++) { c.x += (f.x - c.x) * 0.2; c.y += (f.y - c.y) * 0.2; }
        f.saut = { x0: f.x, y0: f.y, x1: c.x, y1: c.y, t: 0, T: Su.duree, r: Su.rayon, dmg: Su.degats * mult, etourdit: Su.etourdit };
        return;
      }
      if (Su.type === 'attraction') {
        const c = cibleSol(f, ang, dist, Su.portee);
        for (const e of S.f) {
          if (e === f || !e.vivant) continue;
          const dx = c.x - e.x, dy = c.y - e.y, d = hyp(dx, dy);
          if (d < Su.rayon + e.r) {
            degat(e, Su.degats * mult, f, { sup: true });
            pousser(e, dx, dy, Math.min(Su.force, Math.max(0, d - 0.6)));
            e.etourdi = Math.max(e.etourdi, Su.etourdit);
          }
        }
        ev({ k: 'attraction', x: +c.x.toFixed(2), y: +c.y.toFixed(2), r: Su.rayon, o: f.slot });
      }
    }

    /* ---------- Un combattant ---------- */
    function majCombattant(f, dt, E) {
      const d = PERSO[f.perso], A = d.attaque;
      const x0 = f.x, y0 = f.y;
      f.cdTir -= dt; f.lent -= dt; f.etourdi -= dt; f.bouclier -= dt; f.invisible -= dt; f.revele -= dt;
      if (f.invisible <= 0) f.bonusVit = 0;
      if (f.mun < R.MUNITIONS) f.mun = Math.min(R.MUNITIONS, f.mun + dt / A.rechargement);

      if (f.salve) {
        f.salve.t -= dt;
        if (f.salve.t <= 0 && f.vivant) {
          const s = f.salve, a = s.ang, ca = Math.cos(a), sa = Math.sin(a), v = s.A.vitesseProj || 16;
          S.p.push({ id: S.nid++, k: 'tir', o: f.slot, x: f.x + ca * 0.45, y: f.y + sa * 0.45, vx: ca * v, vy: sa * v, reste: s.A.portee, dmg: s.A.degats * s.mult, r: s.A.rayon || 0.3, perce: !!s.A.perce, touches: [], ralenti: s.A.ralenti || null, recul: 0, sup: false });
          s.n--; s.t = s.A.intervalle || 0.1;
          if (s.n <= 0) f.salve = null;
        }
      }

      if (f.saut) {
        const s = f.saut;
        s.t += dt;
        const k = clamp(s.t / s.T, 0, 1);
        f.x = s.x0 + (s.x1 - s.x0) * k; f.y = s.y0 + (s.y1 - s.y0) * k;
        if (k >= 1) {
          f.saut = null; resoudre(carte, f, f.r); f.force++;
          for (const e of S.f) {
            if (e === f || !e.vivant) continue;
            const dx = e.x - f.x, dy = e.y - f.y, dd = hyp(dx, dy);
            if (dd < s.r + e.r) { degat(e, s.dmg, f, { sup: true }); e.etourdi = Math.max(e.etourdi, s.etourdit); pousser(e, dx, dy, 1.2); }
          }
          for (const st of S.steles) if (st.hp > 0 && hyp(st.x - f.x, st.y - f.y) < s.r + RAYON_STELE) degatStele(st, s.dmg, f);
          ev({ k: 'impact', x: +f.x.toFixed(2), y: +f.y.toFixed(2), r: s.r, o: f.slot });
        }
      } else if (f.ruee) {
        const u = f.ruee, pas = Math.min(u.reste, u.v * dt);
        const p = deplacerSurCarte(carte, f.x, f.y, u.dx * pas, u.dy * pas, f.r);
        const fait = hyp(p.x - f.x, p.y - f.y);
        f.x = p.x; f.y = p.y; u.reste -= pas;
        for (const e of S.f) {
          if (e === f || !e.vivant || u.touches.indexOf(e.slot) >= 0) continue;
          if (hyp(e.x - f.x, e.y - f.y) < f.r + e.r + 0.25) { u.touches.push(e.slot); degat(e, u.dmg, f, { sup: true }); pousser(e, u.dx, u.dy, u.recul); }
        }
        for (const st of S.steles) if (st.hp > 0 && hyp(st.x - f.x, st.y - f.y) < f.r + RAYON_STELE + 0.1 && u.touches.indexOf('s' + st.id) < 0) { u.touches.push('s' + st.id); degatStele(st, u.dmg, f); }
        if (u.reste <= 0.01 || fait < pas * 0.3) f.ruee = null;
      } else if (f.etourdi <= 0) {
        const v = d.vitesse * (f.lent > 0 ? f.lentF : 1) * (f.invisible > 0 ? 1 + f.bonusVit : 1);
        if (E.px != null && E.py != null && isFinite(E.px) && isFinite(E.py)) {
          /* position proposée par un invité : acceptée si elle reste plausible */
          let dx = E.px - f.x, dy = E.py - f.y;
          const L = hyp(dx, dy), max = v * 1.35 * Math.max(dt, E.dt || dt) + 0.35;
          if (L > max) { dx *= max / L; dy *= max / L; }
          const p = deplacerSurCarte(carte, f.x, f.y, dx, dy, f.r);
          f.x = p.x; f.y = p.y;
        } else {
          let mx = E.mx || 0, my = E.my || 0;
          const L = hyp(mx, my);
          if (L > 1) { mx /= L; my /= L; }
          if (L > 0.05) {
            const p = deplacerSurCarte(carte, f.x, f.y, mx * v * dt, my * v * dt, f.r);
            f.x = p.x; f.y = p.y;
          }
        }
        const mvx = f.x - x0, mvy = f.y - y0;
        if (hyp(mvx, mvy) > 0.01 && !E.tir) f.ang = Math.atan2(mvy, mvx);

        if (E.tir && f.cdTir <= 0 && f.mun >= 1 && !f.salve) {
          f.mun -= 1; f.cdTir = R.INTERVALLE_TIR_MIN; f.dTir = S.t; f.revele = R.BRUME.REVELE_APRES_TIR_S;
          if (f.invisible > 0) f.invisible = 0;
          tirer(f, A, E.tir.a, E.tir.d, false);
          ev({ k: 'tir', s: f.slot });
        }
        if (E.sup && f.sup >= 1) {
          f.sup = 0; f.dTir = S.t; f.revele = R.BRUME.REVELE_APRES_TIR_S;
          lancerSuper(f, E.sup.a, E.sup.d);
        }
      }
      f.vx = (f.x - x0) / Math.max(dt, 1e-3); f.vy = (f.y - y0) / Math.max(dt, 1e-3);

      if (f.hp > 0 && S.t - f.dDeg > R.REGEN.DELAI_S && S.t - f.dTir > R.REGEN.DELAI_S && f.hp < f.hpMax)
        f.hp = Math.min(f.hpMax, f.hp + f.hpMax * R.REGEN.PCT_PAR_S * dt);
      if (hyp(f.x - S.zone.cx, f.y - S.zone.cy) > S.zone.r) {
        f.hp -= f.hpMax * S.zone.pct * dt; f.dDeg = S.t;
        if (Math.random() < dt * 3) ev({ k: 'hit', x: +f.x.toFixed(2), y: +f.y.toFixed(2), n: Math.round(f.hpMax * S.zone.pct / 3), s: f.slot, o: -1, z: 1 });
      }
      f.brume = dansBrume(carte, f.x, f.y);
    }

    /* ---------- Projectiles ---------- */
    function majProjectiles(dt) {
      const garde = [];
      for (const p of S.p) {
        let vivant = true;
        const tireur = S.f[p.o];
        if (p.k === 'lob') {
          p.t += dt;
          const k = clamp(p.t / p.T, 0, 1);
          p.x = p.x0 + (p.tx - p.x0) * k; p.y = p.y0 + (p.ty - p.y0) * k;
          if (k >= 1) {
            for (const e of S.f) if (e.vivant && e.slot !== p.o && hyp(e.x - p.tx, e.y - p.ty) < p.r + e.r * 0.6) degat(e, p.dmg, tireur, { sup: p.sup });
            for (const s of S.steles) if (s.hp > 0 && hyp(s.x - p.tx, s.y - p.ty) < p.r + RAYON_STELE) degatStele(s, p.dmg, tireur);
            ev({ k: 'boum', x: +p.tx.toFixed(2), y: +p.ty.toFixed(2), r: p.r, o: p.o });
            vivant = false;
          }
        } else {
          const n = Math.max(1, Math.ceil(hyp(p.vx, p.vy) * dt / 0.3));
          for (let i = 0; i < n && vivant; i++) {
            const sx = p.vx * dt / n, sy = p.vy * dt / n;
            p.x += sx; p.y += sy; p.reste -= hyp(sx, sy);
            if (p.reste <= 0 || Math.abs(p.x) > carte.demi || Math.abs(p.y) > carte.demi) { vivant = false; break; }
            if (dansObstacle(carte, p.x, p.y, -0.05)) { vivant = false; ev({ k: 'mur', x: +p.x.toFixed(2), y: +p.y.toFixed(2), o: p.o }); break; }
            for (const e of S.f) {
              if (!e.vivant || e.slot === p.o || e.saut || p.touches.indexOf(e.slot) >= 0) continue;
              if (hyp(e.x - p.x, e.y - p.y) < e.r + p.r) {
                p.touches.push(e.slot);
                degat(e, p.dmg, tireur, { sup: p.sup });
                if (p.ralenti) { e.lent = Math.max(e.lent, p.ralenti.duree); e.lentF = p.ralenti.facteur; }
                if (p.recul) pousser(e, p.vx, p.vy, p.recul);
                if (!p.perce) { vivant = false; break; }
              }
            }
            if (!vivant) break;
            for (const s of S.steles) {
              if (s.hp <= 0 || p.touches.indexOf('s' + s.id) >= 0) continue;
              if (hyp(s.x - p.x, s.y - p.y) < RAYON_STELE + p.r) {
                p.touches.push('s' + s.id);
                degatStele(s, p.dmg, tireur);
                if (!p.perce) { vivant = false; break; }
              }
            }
          }
        }
        if (vivant) garde.push(p);
      }
      S.p = garde;
    }

    function majZonesAoe(dt) {
      const garde = [];
      for (const z of S.z) {
        z.t -= dt;
        if (z.t <= 0) {
          const src = S.f[z.o];
          for (const e of S.f) if (e.vivant && e.slot !== z.o && hyp(e.x - z.x, e.y - z.y) < z.r + e.r * 0.5) { degat(e, z.dmg, src, { sup: true }); e.etourdi = Math.max(e.etourdi, z.etourdit); }
          for (const s of S.steles) if (s.hp > 0 && hyp(s.x - z.x, s.y - z.y) < z.r + RAYON_STELE) degatStele(s, z.dmg, src);
          ev({ k: 'foudre', x: +z.x.toFixed(2), y: +z.y.toFixed(2), r: z.r, o: z.o });
        } else garde.push(z);
      }
      S.z = garde;
    }

    function ramasser() {
      if (!S.runes.length) return;
      S.runes = S.runes.filter(ru => {
        for (const f of S.f) {
          if (!f.vivant || f.saut) continue;
          if (hyp(f.x - ru.x, f.y - ru.y) < f.r + 0.45 && f.runes < R.RUNES.MAX) {
            f.runes++;
            const nouv = Math.round(f.hpBase * (1 + f.runes * R.RUNES.BONUS_PV));
            f.hp += nouv - f.hpMax; f.hpMax = nouv;
            ev({ k: 'rune', s: f.slot, x: +ru.x.toFixed(2), y: +ru.y.toFixed(2) });
            return false;
          }
        }
        return true;
      });
    }

    function eliminer(liste) {
      /* plusieurs éliminations au même instant : le plus « mort » (PV les plus bas) est classé derrière */
      liste.sort((a, b) => a.hp - b.hp || a.degats - b.degats);
      let restants = vivants().length;
      for (const f of liste) {
        f.place = restants--; f.vivant = false; f.elimT = S.t; f.hp = 0;
        f.ruee = null; f.saut = null; f.salve = null;
        S.ordre.push(f.slot);
        const tueur = f.parQui >= 0 && S.t - f.parQuiT < 4 ? S.f[f.parQui] : null;
        if (tueur && tueur !== f) tueur.kills++;
        const n = Math.min(6, f.runes + 1);
        for (let i = 0; i < n; i++) {
          const a = i / n * TAU + rnd(), d = n > 1 ? 0.9 : 0;
          let x = f.x + Math.cos(a) * d, y = f.y + Math.sin(a) * d;
          if (dansObstacle(carte, x, y, 0.3)) { x = f.x; y = f.y; }
          S.runes.push({ id: S.nid++, x, y });
        }
        const cause = tueur ? 'k' : hyp(f.x - S.zone.cx, f.y - S.zone.cy) > S.zone.r ? 'z' : 'q';
        ev({ k: 'ko', s: f.slot, par: tueur ? tueur.slot : -1, c: cause, place: f.place, x: +f.x.toFixed(2), y: +f.y.toFixed(2) });
      }
    }

    function verifierFin() {
      const v = vivants();
      if (v.length <= 1 && !S.fini) {
        if (v.length === 1) { const g = v[0]; g.place = 1; S.ordre.push(g.slot); ev({ k: 'victoire', s: g.slot }); }
        S.fini = true;
      } else if (S.t >= R.DUREE_MAX_S && !S.fini) {
        /* sécurité : classement des survivants aux points de vie */
        v.sort((a, b) => a.hp / a.hpMax - b.hp / b.hpMax || a.degats - b.degats);
        let n = v.length;
        v.forEach(f => { f.place = n--; f.vivant = false; S.ordre.push(f.slot); });
        S.fini = true;
      }
    }

    /* ---------- Bots ---------- */
    function directionLibre(f, ux, uy) {
      const essais = [0, 0.5, -0.5, 1, -1, 1.5, -1.5, 2.3, -2.3];
      const a0 = Math.atan2(uy, ux);
      for (const da of essais) {
        const a = a0 + da, px = f.x + Math.cos(a) * 1.3, py = f.y + Math.sin(a) * 1.3;
        if (!dansObstacle(carte, px, py, f.r * 0.9) && Math.abs(px) < carte.demi - 0.6 && Math.abs(py) < carte.demi - 0.6) return [Math.cos(a), Math.sin(a)];
      }
      return [ux, uy];
    }

    function viser(f, c, A) {
      const dx = c.x - f.x, dy = c.y - f.y, d = hyp(dx, dy);
      const N = f.bot;
      let t = 0;
      if (A.type === 'tir') t = d / (A.vitesseProj || 16);
      else if (A.type === 'lob' || A.type === 'zone') t = A.delai || 0.6;
      const k = 0.3 + N.precision * 0.7;
      const px = c.x + (c.vx || 0) * t * k, py = c.y + (c.vy || 0) * t * k;
      const err = (1 - N.precision) * 0.55 * (rnd() * 2 - 1);
      return { a: Math.atan2(py - f.y, px - f.x) + err, d: hyp(px - f.x, py - f.y) };
    }

    function entreeBot(f, dt) {
      if (!f.ia) f.ia = { next: rnd() * 0.4, mx: 0, my: 0, strafe: rnd() < 0.5 ? 1 : -1, bx: f.x, by: f.y, coince: 0, errance: null };
      const B = f.ia, N = f.bot, d = PERSO[f.perso], A = d.attaque, Su = d.super;
      const out = { mx: B.mx, my: B.my, tir: null, sup: null };
      B.next -= dt;
      if (B.next > 0) return out;
      const pas = N.reaction * (0.7 + rnd() * 0.6);
      B.next = pas;

      /* coincé contre un obstacle ? */
      if (hyp(f.x - B.bx, f.y - B.by) < 0.08 && hyp(B.mx, B.my) > 0.3) B.coince += pas; else B.coince = 0;
      B.bx = f.x; B.by = f.y;
      if (B.coince > 0.8) { const a = rnd() * TAU; B.errance = { x: f.x + Math.cos(a) * 5, y: f.y + Math.sin(a) * 5, t: S.t + 1.5 }; B.coince = 0; }

      const z = S.zone, dz = hyp(f.x - z.cx, f.y - z.cy), marge = z.r - dz;
      const hpR = f.hp / f.hpMax;
      let cible = null, meilleur = 1e9;
      /* en début de partie, les bots préfèrent casser des stèles ; leur rayon d'engagement grandit avec le temps,
         et ils répondent toujours à qui vient de les toucher */
      const engage = Math.min(12, 2.6 + N.agressivite * 2 + S.t / 11 + f.runes * 0.6);
      const agresseur = f.parQui >= 0 && S.t - f.parQuiT < 2.5 ? f.parQui : -1;
      for (const e of S.f) {
        if (e === f || !e.vivant || !visible(f, e)) continue;
        const dd = hyp(e.x - f.x, e.y - f.y);
        if (dd > (e.slot === agresseur ? 12 : engage)) continue;
        const score = dd * (0.55 + 0.45 * e.hp / e.hpMax) * (e.humain ? 0.92 : 1);
        if (score < meilleur) { meilleur = score; cible = e; }
      }
      const portee = A.portee + (A.type === 'cone' ? 0.3 : 0);
      let tx = null, ty = null;

      if (B.errance && S.t < B.errance.t) { tx = B.errance.x; ty = B.errance.y; }
      else if (marge < 2.2 + dz * 0.04) {
        tx = z.cx + (f.x - z.cx) * 0.25; ty = z.cy + (f.y - z.cy) * 0.25;
      } else if (cible) {
        const dx = cible.x - f.x, dy = cible.y - f.y, dd = hyp(dx, dy) || 1, ux = dx / dd, uy = dy / dd;
        const fuir = hpR < 0.32 && cible.hp / cible.hpMax > hpR + 0.12 && rnd() > N.agressivite * 0.6;
        if (fuir) { tx = f.x - ux * 4 + (z.cx - f.x) * 0.15; ty = f.y - uy * 4 + (z.cy - f.y) * 0.15; }
        else {
          const ideal = A.type === 'cone' ? 1.0 : portee * (0.62 + (1 - N.agressivite) * 0.2);
          const k = dd > ideal ? 1 : dd < ideal * 0.55 ? -0.7 : 0;
          if (rnd() < 0.2) B.strafe = -B.strafe;
          tx = f.x + ux * k * 3 - uy * B.strafe * 2.2; ty = f.y + uy * k * 3 + ux * B.strafe * 2.2;
        }
        const ldv = A.type === 'lob' || !segmentBloque(carte, f.x, f.y, cible.x, cible.y);
        if (dd <= portee * 0.96 && f.mun >= 1 && ldv && rnd() < 0.5 + N.agressivite * 0.5) out.tir = viser(f, cible, A);
        if (f.sup >= 1 && rnd() < N.superSage) {
          const t = Su.type;
          if ((t === 'tir' || t === 'zone' || t === 'attraction' || t === 'saut') && dd <= (Su.portee || Su.distance || 7) * 0.9 && (t !== 'tir' || ldv)) out.sup = viser(f, cible, Su);
          else if (t === 'ruee' && ldv && (dd <= Su.distance * 0.85 || (fuir && hpR < 0.25))) out.sup = fuir ? { a: Math.atan2(-uy, -ux), d: Su.distance } : viser(f, cible, { type: 'ruee' });
          else if (t === 'bouclier' && (dd < 3.2 || hpR < 0.5)) out.sup = { a: Math.atan2(uy, ux), d: 0 };
          else if (t === 'soin' && hpR < 0.55) out.sup = { a: 0, d: 0 };
          else if (t === 'invisibilite' && (dd < 7 || hpR < 0.4)) out.sup = { a: 0, d: 0 };
        }
      } else {
        let but = null, bd = 1e9;
        for (const ru of S.runes) { const dd = hyp(ru.x - f.x, ru.y - f.y); if (dd < 11 && dd < bd && hyp(ru.x - z.cx, ru.y - z.cy) < z.r - 1) { bd = dd; but = ru; } }
        if (but) { tx = but.x; ty = but.y; }
        else {
          let st = null; bd = 1e9;
          for (const s of S.steles) { if (s.hp <= 0) continue; const dd = hyp(s.x - f.x, s.y - f.y); if (dd < 14 && dd < bd && hyp(s.x - z.cx, s.y - z.cy) < z.r - 1.5) { bd = dd; st = s; } }
          if (st) {
            const dx = st.x - f.x, dy = st.y - f.y, dd = hyp(dx, dy) || 1;
            if (dd > portee * 0.8) { tx = st.x; ty = st.y; } else { tx = f.x - dy / dd * B.strafe; ty = f.y + dx / dd * B.strafe; }
            if (dd < portee * 0.95 && f.mun >= 1.5 && (A.type === 'lob' || !segmentBloque(carte, f.x, f.y, st.x, st.y))) out.tir = { a: Math.atan2(dy, dx) + (rnd() - 0.5) * 0.1, d: dd };
          } else {
            if (!B.but || hyp(B.but.x - f.x, B.but.y - f.y) < 1.5 || rnd() < 0.05) {
              const a = rnd() * TAU, rr = rnd() * Math.min(z.r * 0.6, carte.demi * 0.7);
              B.but = { x: z.cx + Math.cos(a) * rr, y: z.cy + Math.sin(a) * rr };
            }
            tx = B.but.x; ty = B.but.y;
          }
        }
      }

      /* esquive des projectiles qui arrivent */
      if (rnd() < N.esquive) {
        for (const p of S.p) {
          if (p.k !== 'tir' || p.o === f.slot) continue;
          const rx = f.x - p.x, ry = f.y - p.y, dd = hyp(rx, ry);
          if (dd > 4.5) continue;
          const v = hyp(p.vx, p.vy) || 1;
          if ((rx * p.vx + ry * p.vy) / (dd * v) > 0.85) { const s = (rx * p.vy - ry * p.vx) > 0 ? 1 : -1; tx = f.x + p.vy / v * s * 2.5; ty = f.y - p.vx / v * s * 2.5; break; }
        }
      }

      if (tx != null) {
        const dx = tx - f.x, dy = ty - f.y, dd = hyp(dx, dy);
        if (dd > 0.3) { const [ux, uy] = directionLibre(f, dx / dd, dy / dd); B.mx = ux; B.my = uy; } else { B.mx = 0; B.my = 0; }
      } else { B.mx = 0; B.my = 0; }
      out.mx = B.mx; out.my = B.my;
      return out;
    }

    /* ---------- Avancer la partie ---------- */
    function pas(dt, entrees) {
      if (S.fini) return;
      S.t += dt;
      majZone();
      for (const f of S.f) {
        if (!f.vivant) continue;
        const E = f.bot ? entreeBot(f, dt) : (entrees && entrees[f.slot]) || {};
        if (E.quitte) { f.hp = Math.min(f.hp, 0); continue; }
        majCombattant(f, dt, E);
      }
      majProjectiles(dt);
      majZonesAoe(dt);
      ramasser();
      const morts = S.f.filter(f => f.vivant && f.hp <= 0);
      if (morts.length) eliminer(morts);
      verifierFin();
    }

    /* Plus aucun joueur humain en vie (solo) : la fin se calcule sans affichage, très vite. */
    function finirSansJoueur(maxPas) {
      let n = 0;
      const lim = maxPas || 12000;
      while (!S.fini && n++ < lim) pas(1 / 20, null);
      if (!S.fini) { S.t = R.DUREE_MAX_S; verifierFin(); }
    }

    /* ---------- Réseau : état compact ---------- */
    const c2 = v => Math.round(v * 100);
    function instantane() {
      const evs = S.ev; S.ev = [];
      return {
        t: c2(S.t), z: c2(S.zone.r),
        f: S.f.map(f => [c2(f.x), c2(f.y), c2(f.ang), Math.max(0, Math.round(f.hp)), Math.round(f.hpMax), f.runes, c2(f.mun), c2(f.sup),
          (f.vivant ? 1 : 0) | (f.etourdi > 0 ? 2 : 0) | (f.bouclier > 0 ? 4 : 0) | (f.invisible > 0 ? 8 : 0) | (f.lent > 0 ? 16 : 0) | (f.brume ? 32 : 0) | (f.revele > 0 ? 64 : 0) | (f.ruee ? 128 : 0) | (f.saut ? 256 : 0),
          f.place, f.force, f.kills, f.saut ? c2(clamp(f.saut.t / f.saut.T, 0, 1)) : 0, f.lent > 0 ? c2(f.lentF) : 100, f.invisible > 0 ? c2(f.bonusVit) : 0]),
        p: S.p.map(p => p.k === 'lob' ? [p.id, 1, c2(p.x0), c2(p.y0), c2(p.tx), c2(p.ty), c2(p.t), c2(p.T), c2(p.r), p.o, p.sup ? 1 : 0]
          : [p.id, 0, c2(p.x), c2(p.y), c2(p.vx), c2(p.vy), c2(p.r), p.o, p.sup ? 1 : 0, c2(p.reste)]),
        zs: S.z.map(z => [z.id, c2(z.x), c2(z.y), c2(z.r), c2(z.t), c2(z.T), z.o]),
        ru: S.runes.map(r => [r.id, c2(r.x), c2(r.y)]),
        st: S.steles.map(s => Math.max(0, Math.round(s.hp))),
        ev: evs.slice(0, 60),
        fin: S.fini ? S.ordre.slice() : null
      };
    }

    function classement() {
      /* slots du 1er au 10e */
      return S.f.slice().sort((a, b) => (a.place || 99) - (b.place || 99)).map(f => f.slot);
    }

    S.pas = pas;
    S.entreeBot = entreeBot;
    S.instantane = instantane;
    S.finirSansJoueur = finirSansJoueur;
    S.classement = classement;
    S.vivants = vivants;
    return S;
  }

  return { creerSimulation, genererCarte, deplacerSurCarte, segmentBloque, dansObstacle, dansBrume, visible, niveauBot, alea, PERSO, RAYON_STELE };
})();
