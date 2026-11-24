/*
 * Rune Clash — Runes des Trophées : MOTEUR DE JEU
 * ===============================================
 * Simulation pure (aucun affichage, aucun réseau) : carte, déplacements, collisions, machine à états des combattants,
 * anti-spam à 3 charges, combos, esquive, Ki et projections spéciales, zone qui rétrécit, stèles et runes, brume,
 * bots, classement 1er → 10e.
 *
 * Utilisée telle quelle :
 *   - en solo (1 joueur + 9 bots) par la session locale,
 *   - en ligne par l'HÔTE de la partie, qui fait autorité (les invités envoient leurs pressions).
 *
 * API : ARENE_MOTEUR.creerSimulation({ graine, participants }) → simulation
 *        sim.pas(dt, entrees)   entrees[slot] = { mx, my, appuis:[{act:'A'|'E'|'S', a, d}], px, py, quitte }
 *                               A = Attaque (combo), E = Esquive, S = Spécial (projection payée en Ki)
 *        sim.entreeBot(f, dt)   commandes calculées par l'IA pour le bot f (mêmes règles que le joueur)
 *        sim.instantane()       état compact à envoyer sur le réseau
 *        sim.finirSansJoueur()  termine vite la partie (après l'élimination du joueur, en solo)
 *        ARENE_MOTEUR.genererCarte(graine), deplacerSurCarte(...), visible(...), distanceLibre(...)
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

  /* Distance libre le long d'un rayon (x, y, angle) jusqu'au premier mur ou rocher (pour les faisceaux). */
  function distanceLibre(carte, x, y, a, L) {
    const dx = Math.cos(a), dy = Math.sin(a);
    let best = L;
    for (const m of carte.murs) {
      let t0 = 0, t1 = best;
      const x0 = m.x - m.w / 2, x1 = m.x + m.w / 2, y0 = m.y - m.h / 2, y1 = m.y + m.h / 2;
      let ok = true;
      for (const [p, q0, q1] of [[dx, x0 - x, x1 - x], [dy, y0 - y, y1 - y]]) {
        if (Math.abs(p) < 1e-9) { if (q0 > 0 || q1 < 0) { ok = false; break; } continue; }
        let ta = q0 / p, tb = q1 / p;
        if (ta > tb) { const z = ta; ta = tb; tb = z; }
        if (ta > t0) t0 = ta;
        if (tb < t1) t1 = tb;
        if (t0 > t1) { ok = false; break; }
      }
      if (ok && t0 < best && t0 >= 0) best = t0;
    }
    for (const o of carte.rochers) {
      const fx = x - o.x, fy = y - o.y, b = fx * dx + fy * dy, c = fx * fx + fy * fy - o.r * o.r * 0.81, disc = b * b - c;
      if (disc < 0) continue;
      const t = -b - Math.sqrt(disc);
      if (t >= 0 && t < best) best = t;
    }
    const H = carte.demi;
    const tb = Math.min(dx > 0 ? (H - x) / dx : dx < 0 ? (-H - x) / dx : 1e9, dy > 0 ? (H - y) / dy : dy < 0 ? (-H - y) / dy : 1e9);
    return Math.max(0, Math.min(best, tb));
  }

  /* ------------------------------------------------------------------ */
  /* Machine à états d'un combattant                                     */
  /* ------------------------------------------------------------------ */
  /*  libre ──Attaque──▶ attaque ──(fenêtre de combo)──▶ attaque (étape suivante, 3 au maximum)
   *    │                  │  └─(fin de récupération)──▶ libre (la fenêtre de combo reste ouverte FERMETURE_S)
   *    │                  └─(seconde moitié de la récupération)──▶ esquive | preparation
   *    ├──Esquive──▶ esquive ──(fin)──▶ libre (Attaque juste après = attaque d'élan)
   *    ├──Spécial──▶ preparation ──▶ projection (faisceau, ruée, saut) ──▶ libre
   *    │                         └──▶ libre (projections instantanées)
   *    └── un coup qui étourdit fait passer n'importe quel état (sauf ko et saut en l'air) à « etourdi » ──▶ libre
   *  Le K.O. est définitif.  Les pressions arrivent dans un tampon court et sont exécutées dès que la transition est permise.
   */
  const ETATS = ['libre', 'attaque', 'esquive', 'preparation', 'projection', 'etourdi', 'ko'];
  const ETAT_CODE = {};
  ETATS.forEach((e, i) => { ETAT_CODE[e] = i; });
  const FORMES = ['flamme', 'magma', 'lumiere', 'vague', 'etoile', 'abysse', 'fil', 'eclair', 'roc', 'neant', 'onde'];

  function etapeDef(d, etape, elan) {
    if (elan) return d.elan;
    return etape === 1 ? d.attaque : d.combo[etape - 2];
  }

  function creerSimulation(opts) {
    const carte = genererCarte(opts.graine);
    const rnd = alea((opts.graine ^ 0x9E3779B9) >>> 0);
    const zoneR0 = carte.demi * Math.SQRT2 + 2;
    const CH = R.CHARGES, CO = R.COMBO, ES = R.ESQUIVE, KI = R.KI, MV = R.MOUVEMENT;
    const S = {
      t: 0, carte, f: [], p: [], z: [], runes: [],
      steles: carte.steles.map((s, i) => ({ id: i, x: s.x, y: s.y, hp: R.STELES.PV, hpMax: R.STELES.PV })),
      zone: { cx: 0, cy: 0, r: zoneR0, pct: R.ZONE.DEGATS_PCT_S },
      fini: false, ordre: [], ev: [], nid: 1,
      stats: { refus: 0, combos: 0, finals: 0, esquives: 0, evites: 0, specials: 0, amplifies: 0 }
    };

    opts.participants.forEach((pa, i) => {
      const d = PERSO[pa.perso] || CFG.PERSONNAGES[0];
      const sp = carte.depart[i];
      S.f.push({
        slot: i, nom: pa.nom, perso: d.id, humain: !!pa.humain, uid: pa.uid || null, cadre: pa.cadre || 'base',
        bot: pa.humain ? null : niveauBot(pa.niveau || 0),
        x: sp.x, y: sp.y, vx: 0, vy: 0, ang: Math.atan2(-sp.y, -sp.x), r: R.RAYON_COMBATTANT,
        hpBase: d.pv, hpMax: d.pv, hp: d.pv, runes: 0,
        etat: 'libre', etatT: 0, att: null, combo: null, tampon: null, spec: null, proj: null, esq: null,
        charges: CH.MAX, pauseRech: 0, dernierAppuiA: -9, ki: KI.DEPART, esqCd: 0, invul: 0, finEsq: -9,
        vivant: true, place: 0, elimT: 0, kills: 0, degats: 0, dDeg: -99, dTir: -99, parQui: -1, parQuiT: -99,
        lent: 0, lentF: 1, etourdi: 0, bouclier: 0, bouclierRed: 0, invisible: 0, bonusVit: 0, bonusProchain: 0,
        salve: null, force: 0, brume: false, revele: 0, ia: null
      });
    });

    const ev = e => { if (S.ev.length < 160) S.ev.push(e); };
    const vivants = () => S.f.filter(f => f.vivant);
    const multDegats = f => 1 + f.runes * R.RUNES.BONUS_DEGATS;
    const gagnerKi = (f, n) => { if (f && f.vivant) f.ki = clamp(f.ki + n, 0, KI.MAX); };

    function majZone() {
      const Z = R.ZONE, t = S.t;
      let r = zoneR0;
      if (t > Z.DEBUT_S) r = zoneR0 + (Z.RAYON_FINAL - zoneR0) * clamp((t - Z.DEBUT_S) / (Z.FIN_S - Z.DEBUT_S), 0, 1);
      const fin2 = R.DUREE_MAX_S - 25;
      if (t > fin2) r = Z.RAYON_FINAL * clamp(1 - (t - fin2) / 20, 0, 1);
      S.zone.r = r;
      S.zone.pct = Z.DEGATS_PCT_S + (Z.DEGATS_PCT_S_MAX - Z.DEGATS_PCT_S) * clamp((t - Z.DEBUT_S) / (Z.FIN_S - Z.DEBUT_S), 0, 1);
    }

    /* ---------- changements d'état ---------- */
    function changerEtat(f, etat) {
      f.etat = etat; f.etatT = 0;
      if (etat !== 'attaque') f.att = null;
      if (etat !== 'preparation') f.spec = null;
      if (etat !== 'projection') f.proj = null;
      if (etat !== 'esquive') f.esq = null;
    }
    function etourdir(c, duree) {
      if (!c.vivant || duree <= 0 || (c.proj && c.proj.type === 'saut')) return;
      c.etourdi = Math.min(R.ETOURDI_MAX_S, Math.max(c.etourdi, duree));
      c.tampon = null; c.combo = null; c.salve = null;
      changerEtat(c, 'etourdi');
    }

    function degat(c, montant, src, opt) {
      if (!c.vivant || montant <= 0 || (c.proj && c.proj.type === 'saut')) return 0;
      if (c.invul > 0 && !(opt && opt.zone)) { ev({ k: 'evite', s: c.slot, x: +c.x.toFixed(2), y: +c.y.toFixed(2) }); S.stats.evites++; return 0; }
      if (c.bouclier > 0) montant *= 1 - c.bouclierRed;
      montant = Math.round(montant);
      c.hp -= montant; c.dDeg = S.t; c.revele = Math.max(c.revele, 0.6);
      if (c.invisible > 0 && montant > 0) c.invisible = Math.min(c.invisible, 0.4);
      gagnerKi(c, montant * KI.PAR_DEGAT_RECU);
      if (src && src !== c) {
        src.degats += montant;
        c.parQui = src.slot; c.parQuiT = S.t;
        if (!(opt && opt.sup)) gagnerKi(src, montant * KI.PAR_DEGAT_INFLIGE);
        if (opt && opt.fin && !opt.fin.kiDonne) { opt.fin.kiDonne = true; gagnerKi(src, CO.KI_BONUS_FINAL); S.stats.finals++; }
      }
      ev({ k: 'hit', x: +c.x.toFixed(2), y: +c.y.toFixed(2), n: montant, s: c.slot, o: src ? src.slot : -1, z: opt && opt.zone ? 1 : 0, fin: opt && opt.fin ? 1 : 0 });
      return montant;
    }

    function degatStele(s, montant, src, sup) {
      if (s.hp <= 0) return;
      s.hp -= Math.round(montant);
      /* seules les attaques normales rechargent le Ki (une projection ne peut pas en financer une autre) */
      if (src && !sup) gagnerKi(src, montant * KI.PAR_DEGAT_INFLIGE * KI.FACTEUR_STELE);
      ev({ k: 'stele', s: s.id, x: s.x, y: s.y });
      if (s.hp <= 0) {
        s.hp = 0;
        S.runes.push({ id: S.nid++, x: s.x, y: s.y });
        ev({ k: 'casse', x: s.x, y: s.y });
      }
    }

    function pousser(c, dx, dy, dist) {
      if (!c.vivant || dist <= 0 || (c.proj && c.proj.type === 'saut')) return;
      const L = hyp(dx, dy) || 1;
      const p = deplacerSurCarte(carte, c.x, c.y, dx / L * dist, dy / L * dist, c.r);
      c.x = p.x; c.y = p.y; c.force++;
      if (c.proj && c.proj.type === 'ruee') changerEtat(c, 'libre');
    }

    /* ---------- un coup (étape de combo, élan ou projection de type tir/cone/lob) ---------- */
    function lancerCoup(f, A, ang, dist, info) {
      /* info : { sup, fin (objet partagé par les projectiles du coup final), ampl } */
      let mult = multDegats(f) * (info.ampl ? KI.AMPLIFIE_PUISSANCE : 1);
      const portee = (A.portee || 0) * (info.ampl ? KI.AMPLIFIE_PORTEE : 1);
      if (!info.sup && f.bonusProchain) { mult *= 1 + f.bonusProchain; f.bonusProchain = 0; }
      const forme = A.forme || PERSO[f.perso].forme;
      f.ang = ang;
      if (A.type === 'tir') {
        const n = A.projectiles || 1, sp = (A.dispersion || 0) * DEG;
        const tirer1 = a => {
          const ca = Math.cos(a), sa = Math.sin(a), v = A.vitesseProj || 16;
          S.p.push({
            id: S.nid++, k: 'tir', o: f.slot, x: f.x + ca * 0.45, y: f.y + sa * 0.45, vx: ca * v, vy: sa * v,
            reste: portee, dmg: A.degats * mult, r: (A.rayon || 0.3) * (info.ampl ? 1.15 : 1), perce: !!A.perce, touches: [],
            ralenti: A.ralenti || null, recul: A.recul || 0, etourdit: A.etourdit || 0, sup: !!info.sup, fin: info.fin || null, forme
          });
        };
        for (let i = 0; i < n; i++) {
          let a = ang;
          if (sp >= TAU - 0.01) a = ang + i * TAU / n;
          else if (n > 1) a = ang - sp / 2 + sp * i / (n - 1);
          tirer1(a);
        }
        if (A.salve > 1) f.salve = { n: A.salve - 1, t: A.intervalle || 0.1, ang, A, mult, forme, portee };
        if (info.sup && A.soinLanceur) f.hp = Math.min(f.hpMax, f.hp + f.hpMax * A.soinLanceur);
      } else if (A.type === 'cone') {
        const demiA = Math.min(Math.PI, (A.angle || 60) * DEG / 2);
        for (const e of S.f) {
          if (e === f || !e.vivant) continue;
          const dx = e.x - f.x, dy = e.y - f.y, d = hyp(dx, dy);
          if (d > portee + e.r) continue;
          let da = Math.atan2(dy, dx) - ang; da = Math.atan2(Math.sin(da), Math.cos(da));
          if (Math.abs(da) <= demiA + Math.atan2(e.r, Math.max(d, 0.1)) && !segmentBloque(carte, f.x, f.y, e.x, e.y)) {
            if (degat(e, A.degats * mult, f, { sup: info.sup, fin: info.fin })) {
              if (A.recul) pousser(e, dx, dy, A.recul);
              if (A.etourdit) etourdir(e, A.etourdit);
              if (A.ralenti) { e.lent = Math.max(e.lent, A.ralenti.duree); e.lentF = A.ralenti.facteur; }
            }
          }
        }
        for (const s of S.steles) {
          if (s.hp <= 0) continue;
          const dx = s.x - f.x, dy = s.y - f.y, d = hyp(dx, dy);
          let da = Math.atan2(dy, dx) - ang; da = Math.atan2(Math.sin(da), Math.cos(da));
          if (d < portee + RAYON_STELE && Math.abs(da) <= demiA + 0.3) degatStele(s, A.degats * mult, f, info.sup);
        }
        ev({ k: 'cone', x: +f.x.toFixed(2), y: +f.y.toFixed(2), a: +ang.toFixed(2), p: portee, l: A.angle || 60, o: f.slot, f: forme, fin: info.fin ? 1 : 0 });
      } else if (A.type === 'lob') {
        const d = clamp(dist == null ? portee : dist, 1, portee);
        S.p.push({ id: S.nid++, k: 'lob', o: f.slot, x0: f.x, y0: f.y, x: f.x, y: f.y, tx: f.x + Math.cos(ang) * d, ty: f.y + Math.sin(ang) * d, t: 0, T: A.delai || 0.6, r: A.rayon, dmg: A.degats * mult, sup: !!info.sup, etourdit: A.etourdit || 0, fin: info.fin || null, forme, vx: 0, vy: 0 });
      }
    }

    function cibleSol(f, ang, dist, portee) {
      const d = clamp(dist == null ? portee : dist, 0.5, portee);
      let x = f.x + Math.cos(ang) * d, y = f.y + Math.sin(ang) * d;
      x = clamp(x, -carte.demi + 0.8, carte.demi - 0.8); y = clamp(y, -carte.demi + 0.8, carte.demi - 0.8);
      return { x, y };
    }

    /* ---------- projections spéciales (payées en Ki) ---------- */
    function coutSpecial(f) {
      const Sp = PERSO[f.perso].special;
      const apresCombo = (f.etat === 'attaque' && f.att && f.att.etape >= 2) || (f.combo && f.combo.etape >= 2 && S.t <= f.combo.ferme);
      return { cout: Math.round(Sp.cout * (apresCombo ? 1 - CO.REDUCTION_KI_APRES_COMBO : 1)), apresCombo };
    }

    function lancerSpecial(f, ang, dist, ampl) {
      const Su = PERSO[f.perso].special, mult = multDegats(f) * (ampl ? KI.AMPLIFIE_PUISSANCE : 1), pk = ampl ? KI.AMPLIFIE_PORTEE : 1;
      f.ang = ang; f.dTir = S.t; f.revele = R.BRUME.REVELE_APRES_TIR_S;
      S.stats.specials++; if (ampl) S.stats.amplifies++;
      ev({ k: 'super', s: f.slot, x: +f.x.toFixed(2), y: +f.y.toFixed(2), t: Su.type, ampl: ampl ? 1 : 0 });
      if (Su.type === 'tir' || Su.type === 'cone' || Su.type === 'lob') { lancerCoup(f, Su, ang, dist, { sup: true, ampl }); return changerEtat(f, 'libre'); }
      if (Su.type === 'faisceau') {
        const L = Su.portee * pk, tick = R.DELAI_TICK_FAISCEAU_S, n = Math.max(1, Math.round(Su.duree / tick));
        S.p.push({ id: S.nid++, k: 'faisceau', o: f.slot, a: ang, x: f.x, y: f.y, L, l: distanceLibre(carte, f.x, f.y, ang, L), w: Su.largeur * (ampl ? 1.25 : 1), t: 0, T: Su.duree, acc: 0, dmgTick: Su.degats * mult / n, vx: 0, vy: 0, r: Su.largeur });
        changerEtat(f, 'projection'); f.proj = { type: 'faisceau', T: Su.duree };
        return;
      }
      if (Su.type === 'ruee') {
        changerEtat(f, 'projection');
        f.proj = { type: 'ruee', dx: Math.cos(ang), dy: Math.sin(ang), reste: Su.distance * pk, v: Su.vitesse, dmg: Su.degats * mult, recul: Su.recul, touches: [] };
        return;
      }
      if (Su.type === 'bouclier') {
        f.bouclier = Su.duree; f.bouclierRed = Su.reduction;
        for (const e of S.f) {
          if (e === f || !e.vivant) continue;
          const dx = e.x - f.x, dy = e.y - f.y, d = hyp(dx, dy);
          if (d < Su.rayon * pk + e.r && degat(e, Su.degats * mult, f, { sup: true })) pousser(e, dx, dy, Su.recul);
        }
        ev({ k: 'onde', x: +f.x.toFixed(2), y: +f.y.toFixed(2), r: Su.rayon * pk, o: f.slot });
        return changerEtat(f, 'libre');
      }
      if (Su.type === 'invisibilite') { f.invisible = Su.duree * (ampl ? 1.3 : 1); f.bonusVit = Su.bonusVitesse; f.bonusProchain = Su.bonusProchaineAttaque * (ampl ? 1.3 : 1); return changerEtat(f, 'libre'); }
      if (Su.type === 'zone') {
        const c = cibleSol(f, ang, dist, Su.portee * pk);
        S.z.push({ id: S.nid++, k: 'zone', x: c.x, y: c.y, r: Su.rayon * (ampl ? 1.15 : 1), t: Su.delai, T: Su.delai, dmg: Su.degats * mult, etourdit: Su.etourdit, o: f.slot });
        return changerEtat(f, 'libre');
      }
      if (Su.type === 'saut') {
        const c = cibleSol(f, ang, dist, Su.portee * pk);
        for (let k = 0; k < 10 && dansObstacle(carte, c.x, c.y, f.r); k++) { c.x += (f.x - c.x) * 0.2; c.y += (f.y - c.y) * 0.2; }
        changerEtat(f, 'projection');
        f.proj = { type: 'saut', x0: f.x, y0: f.y, x1: c.x, y1: c.y, t: 0, T: Su.duree, r: Su.rayon * (ampl ? 1.15 : 1), dmg: Su.degats * mult, etourdit: Su.etourdit };
        return;
      }
      if (Su.type === 'attraction') {
        const c = cibleSol(f, ang, dist, Su.portee * pk), rr = Su.rayon * (ampl ? 1.15 : 1);
        for (const e of S.f) {
          if (e === f || !e.vivant) continue;
          const dx = c.x - e.x, dy = c.y - e.y, d = hyp(dx, dy);
          if (d < rr + e.r && degat(e, Su.degats * mult, f, { sup: true })) {
            pousser(e, dx, dy, Math.min(Su.force, Math.max(0, d - 0.6)));
            etourdir(e, Su.etourdit);
          }
        }
        ev({ k: 'attraction', x: +c.x.toFixed(2), y: +c.y.toFixed(2), r: rr, o: f.slot });
        return changerEtat(f, 'libre');
      }
      changerEtat(f, 'libre');
    }

    /* ---------- pressions (anti-spam : 3 charges, intervalle minimal, tampon) ---------- */
    function refus(f, raison) {
      S.stats.refus++;
      ev({ k: 'refus', s: f.slot, r: raison });
      return false;
    }
    function appui(f, act, a, d) {
      if (!f.vivant) return false;
      a = isFinite(a) ? +a : f.ang; d = isFinite(d) ? +d : null;
      if (act === 'A') {
        if (S.t - f.dernierAppuiA < CH.INTERVALLE_MIN_S) return refus(f, 'spam');
        if (f.tampon && f.tampon.act === 'A') return refus(f, 'spam');
        if (f.charges < 1) return refus(f, 'vide');
        if (f.etat === 'attaque' && f.att) {
          const ouvre = f.att.prep + f.att.recup * CO.OUVERTURE_RECUP;
          if (f.att.etape >= 3 && f.att.t < f.att.prep + f.att.recup - CH.TAMPON_S) return refus(f, 'tot');
          if (f.att.t < ouvre - CH.TAMPON_S) return refus(f, 'tot');
        }
        f.dernierAppuiA = S.t;
      } else if (act === 'E') {
        if (f.esqCd > 0) return refus(f, 'esquive');
      } else if (act === 'S') {
        if (f.ki < coutSpecial(f).cout) return refus(f, 'ki');
      } else return false;
      if (f.etat === 'etourdi' || f.etat === 'ko') return refus(f, 'etourdi');
      f.tampon = { act, a, d, t: CH.TAMPON_S };
      return true;
    }

    /* Essaie d'exécuter la pression en attente si la machine à états le permet. */
    function executerTampon(f) {
      const T = f.tampon;
      if (!T) return;
      const et = f.etat, A = f.att;
      const recupAnnulable = A && A.t >= A.prep + A.recup * (1 - CO.ANNULATION_RECUP);
      let fait = false;
      if (T.act === 'A') {
        if (f.charges < 1) { f.tampon = null; return void refus(f, 'vide'); }
        if (et === 'libre') {
          let etape = 1, elan = false;
          if (f.combo && S.t <= f.combo.ferme && f.combo.etape < 3) etape = f.combo.etape + 1;
          else if (S.t - f.finEsq <= CO.ELAN_FENETRE_S) elan = true;
          demarrerAttaque(f, etape, elan, T.a, T.d); fait = true;
        } else if (et === 'attaque' && A && A.etape < 3 && A.t >= A.prep + A.recup * CO.OUVERTURE_RECUP) {
          demarrerAttaque(f, A.etape + 1, false, T.a, T.d); fait = true;
        }
      } else if (T.act === 'E') {
        if (f.esqCd > 0) { f.tampon = null; return void refus(f, 'esquive'); }
        if (et === 'libre' || (et === 'attaque' && recupAnnulable)) { demarrerEsquive(f, T.a); fait = true; }
      } else if (T.act === 'S') {
        const { cout, apresCombo } = coutSpecial(f);
        if (f.ki < cout) { f.tampon = null; return void refus(f, 'ki'); }
        if (et === 'libre' || (et === 'attaque' && recupAnnulable)) {
          const ampl = f.ki >= KI.AMPLIFIE_SEUIL;
          const Su = PERSO[f.perso].special;
          changerEtat(f, 'preparation');
          f.spec = { a: T.a, d: T.d, t: 0, prep: Su.prep || 0.15, cout: ampl ? KI.MAX : cout, ampl, apresCombo };
          f.ang = T.a;
          ev({ k: 'prep', s: f.slot, a: +T.a.toFixed(2), t: Su.type, ampl: ampl ? 1 : 0 });
          fait = true;
        }
      }
      if (fait) f.tampon = null;
    }

    function demarrerAttaque(f, etape, elan, a, d) {
      const def = etapeDef(PERSO[f.perso], etape, elan);
      f.charges = Math.max(0, f.charges - 1);
      f.pauseRech = CH.PAUSE_RECHARGE_S;
      f.combo = null; f.salve = null;
      changerEtat(f, 'attaque');
      f.att = { def, etape, elan, t: 0, prep: def.prep || 0.08, recup: def.recup || 0.2, tire: false, a, d, fin: etape === 3 ? { kiDonne: false } : null };
      f.ang = a; f.dTir = S.t; f.revele = R.BRUME.REVELE_APRES_TIR_S;
      if (f.invisible > 0) f.invisible = 0;
      if (etape >= 2) S.stats.combos++;
      ev({ k: 'atk', s: f.slot, e: etape, el: elan ? 1 : 0 });
    }

    function demarrerEsquive(f, a) {
      changerEtat(f, 'esquive');
      f.combo = null; f.salve = null;
      f.esq = { dx: Math.cos(a), dy: Math.sin(a), t: 0 };
      f.invul = ES.INVULNERABLE_S; f.esqCd = ES.RECHARGE_S;
      S.stats.esquives++;
      ev({ k: 'esquive', s: f.slot, x: +f.x.toFixed(2), y: +f.y.toFixed(2), a: +a.toFixed(2) });
    }

    /* ---------- un combattant, un pas de temps ---------- */
    function vitesseDe(f) {
      const d = PERSO[f.perso];
      let k = 1;
      if (f.etat === 'attaque') k = MV.ATTAQUE;
      else if (f.etat === 'preparation') k = MV.PREPARATION;
      else if (f.etat === 'projection') k = f.proj && f.proj.type === 'faisceau' ? MV.FAISCEAU : 0;
      else if (f.etat !== 'libre') k = 0;
      return d.vitesse * k * (f.lent > 0 ? f.lentF : 1) * (f.invisible > 0 ? 1 + f.bonusVit : 1);
    }

    function majCombattant(f, dt, E) {
      const d = PERSO[f.perso];
      const x0 = f.x, y0 = f.y;
      f.etatT += dt;
      f.lent -= dt; f.bouclier -= dt; f.invisible -= dt; f.revele -= dt; f.invul -= dt; f.esqCd -= dt; f.pauseRech -= dt;
      if (f.invisible <= 0) f.bonusVit = 0;
      /* recharge des charges (une par une) et Ki passif */
      if (f.charges < CH.MAX && f.pauseRech <= 0) {
        const avant = Math.floor(f.charges);
        f.charges = Math.min(CH.MAX, f.charges + dt / d.rechargement);
        if (Math.floor(f.charges) > avant) ev({ k: 'charge', s: f.slot, n: Math.floor(f.charges) });
      }
      gagnerKi(f, KI.PAR_SECONDE * dt);

      /* pressions reçues ce pas-ci (dans l'ordre) */
      if (E.appuis) for (const p of E.appuis) appui(f, p.act, p.a, p.d);
      if (f.tampon) { f.tampon.t -= dt; }

      /* salve (rafale d'une même étape) */
      if (f.salve) {
        f.salve.t -= dt;
        if (f.salve.t <= 0) {
          const s = f.salve, a = s.ang, ca = Math.cos(a), sa = Math.sin(a), v = s.A.vitesseProj || 16;
          S.p.push({ id: S.nid++, k: 'tir', o: f.slot, x: f.x + ca * 0.45, y: f.y + sa * 0.45, vx: ca * v, vy: sa * v, reste: s.portee, dmg: s.A.degats * s.mult, r: s.A.rayon || 0.3, perce: !!s.A.perce, touches: [], ralenti: s.A.ralenti || null, recul: 0, etourdit: 0, sup: false, fin: null, forme: s.forme });
          s.n--; s.t = s.A.intervalle || 0.1;
          if (s.n <= 0) f.salve = null;
        }
      }

      /* état courant */
      switch (f.etat) {
        case 'attaque': {
          const A = f.att;
          A.t += dt;
          if (!A.tire && A.def.avance && A.prep > 0) {
            const k = Math.min(dt, Math.max(0, A.prep - (A.t - dt))) / A.prep;
            /* l'élan s'arrête au contact du premier ennemi devant (pas de traversée) */
            let pasMax = A.def.avance * k;
            const ca = Math.cos(A.a), sa = Math.sin(A.a);
            for (const e of S.f) {
              if (e === f || !e.vivant) continue;
              const rx = e.x - f.x, ry = e.y - f.y, av = rx * ca + ry * sa;
              if (av <= 0 || Math.abs(rx * sa - ry * ca) > f.r + e.r) continue;
              pasMax = Math.min(pasMax, Math.max(0, av - (f.r + e.r) - 0.05));
            }
            if (pasMax > 0) { const p = deplacerSurCarte(carte, f.x, f.y, ca * pasMax, sa * pasMax, f.r); f.x = p.x; f.y = p.y; }
          }
          if (!A.tire && A.t >= A.prep) { A.tire = true; lancerCoup(f, A.def, A.a, A.d, { sup: false, fin: A.fin }); if (A.etape === 3) ev({ k: 'final', s: f.slot }); }
          if (A.t >= A.prep + A.recup) { f.combo = { etape: A.elan ? 1 : A.etape, ferme: S.t + CO.FERMETURE_S }; changerEtat(f, 'libre'); }
          break;
        }
        case 'esquive': {
          const q = f.esq;
          q.t += dt;
          const pas = ES.DISTANCE / ES.DUREE_S * Math.min(dt, Math.max(0, ES.DUREE_S - (q.t - dt)));
          const p = deplacerSurCarte(carte, f.x, f.y, q.dx * pas, q.dy * pas, f.r);
          f.x = p.x; f.y = p.y; f.ang = Math.atan2(q.dy, q.dx);
          if (q.t >= ES.DUREE_S) { f.finEsq = S.t; changerEtat(f, 'libre'); }
          break;
        }
        case 'preparation': {
          const s = f.spec;
          s.t += dt;
          if (s.t >= s.prep) {
            f.ki = Math.max(0, f.ki - s.cout);
            lancerSpecial(f, s.a, s.d, s.ampl);
          }
          break;
        }
        case 'projection': {
          const P = f.proj;
          if (!P) { changerEtat(f, 'libre'); break; }
          if (P.type === 'saut') {
            P.t += dt;
            const k = clamp(P.t / P.T, 0, 1);
            f.x = P.x0 + (P.x1 - P.x0) * k; f.y = P.y0 + (P.y1 - P.y0) * k;
            if (k >= 1) {
              f.proj = null; resoudre(carte, f, f.r); f.force++;
              for (const e of S.f) {
                if (e === f || !e.vivant) continue;
                const dx = e.x - f.x, dy = e.y - f.y, dd = hyp(dx, dy);
                if (dd < P.r + e.r && degat(e, P.dmg, f, { sup: true })) { etourdir(e, P.etourdit); pousser(e, dx, dy, 1.2); }
              }
              for (const st of S.steles) if (st.hp > 0 && hyp(st.x - f.x, st.y - f.y) < P.r + RAYON_STELE) degatStele(st, P.dmg, f, true);
              ev({ k: 'impact', x: +f.x.toFixed(2), y: +f.y.toFixed(2), r: P.r, o: f.slot });
              changerEtat(f, 'libre');
            }
          } else if (P.type === 'ruee') {
            const pas = Math.min(P.reste, P.v * dt);
            const p = deplacerSurCarte(carte, f.x, f.y, P.dx * pas, P.dy * pas, f.r);
            const fait = hyp(p.x - f.x, p.y - f.y);
            f.x = p.x; f.y = p.y; P.reste -= pas;
            for (const e of S.f) {
              if (e === f || !e.vivant || P.touches.indexOf(e.slot) >= 0) continue;
              if (hyp(e.x - f.x, e.y - f.y) < f.r + e.r + 0.25) { P.touches.push(e.slot); if (degat(e, P.dmg, f, { sup: true })) pousser(e, P.dx, P.dy, P.recul); }
            }
            for (const st of S.steles) if (st.hp > 0 && hyp(st.x - f.x, st.y - f.y) < f.r + RAYON_STELE + 0.1 && P.touches.indexOf('s' + st.id) < 0) { P.touches.push('s' + st.id); degatStele(st, P.dmg, f, true); }
            if (P.reste <= 0.01 || fait < pas * 0.3) changerEtat(f, 'libre');
          } else if (P.type === 'faisceau') {
            if (f.etatT >= P.T + R.DELAI_TICK_FAISCEAU_S * 0.5) changerEtat(f, 'libre');
          } else changerEtat(f, 'libre');
          break;
        }
        case 'etourdi': {
          f.etourdi -= dt;
          if (f.etourdi <= 0 || f.etatT > R.ETOURDI_MAX_S) { f.etourdi = 0; changerEtat(f, 'libre'); }
          break;
        }
      }
      if (f.etat !== 'etourdi') f.etourdi = 0;

      /* la pression en attente part dès que la transition est permise ; sinon elle expire */
      if (f.tampon) {
        executerTampon(f);
        if (f.tampon && f.tampon.t <= 0) { const act = f.tampon.act; f.tampon = null; if (act === 'A') refus(f, 'tot'); }
      }

      /* déplacement libre (ou ralenti selon l'état) */
      const v = vitesseDe(f);
      if (v > 0) {
        if (E.px != null && E.py != null && isFinite(E.px) && isFinite(E.py)) {
          /* position proposée par un invité : acceptée si elle reste plausible */
          let dx = E.px - f.x, dy = E.py - f.y;
          const L = hyp(dx, dy), max = d.vitesse * 1.35 * Math.max(dt, E.dt || dt) + 0.35;
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
        if (f.etat === 'libre') { const mvx = f.x - x0, mvy = f.y - y0; if (hyp(mvx, mvy) > 0.01) f.ang = Math.atan2(mvy, mvx); }
      }
      f.vx = (f.x - x0) / Math.max(dt, 1e-3); f.vy = (f.y - y0) / Math.max(dt, 1e-3);

      if (f.hp > 0 && S.t - f.dDeg > R.REGEN.DELAI_S && S.t - f.dTir > R.REGEN.DELAI_S && f.hp < f.hpMax)
        f.hp = Math.min(f.hpMax, f.hp + f.hpMax * R.REGEN.PCT_PAR_S * dt);
      if (hyp(f.x - S.zone.cx, f.y - S.zone.cy) > S.zone.r) {
        f.hp -= f.hpMax * S.zone.pct * dt; f.dDeg = S.t;
        if (rnd() < dt * 3) ev({ k: 'hit', x: +f.x.toFixed(2), y: +f.y.toFixed(2), n: Math.round(f.hpMax * S.zone.pct / 3), s: f.slot, o: -1, z: 1 });
      }
      f.brume = dansBrume(carte, f.x, f.y);
    }

    /* ---------- projectiles et faisceaux ---------- */
    function majProjectiles(dt) {
      const garde = [];
      for (const p of S.p) {
        let vivant = true;
        const tireur = S.f[p.o];
        if (p.k === 'faisceau') {
          if (!tireur || !tireur.vivant || tireur.etat !== 'projection' || !tireur.proj || tireur.proj.type !== 'faisceau') { vivant = false; }
          else {
            p.t += dt; p.acc += dt;
            p.x = tireur.x + Math.cos(p.a) * 0.4; p.y = tireur.y + Math.sin(p.a) * 0.4;
            p.l = distanceLibre(carte, p.x, p.y, p.a, p.L);
            const tick = R.DELAI_TICK_FAISCEAU_S, ca = Math.cos(p.a), sa = Math.sin(p.a);
            while (p.acc >= tick) {
              p.acc -= tick;
              for (const e of S.f) {
                if (!e.vivant || e.slot === p.o) continue;
                const rx = e.x - p.x, ry = e.y - p.y, t = clamp(rx * ca + ry * sa, 0, p.l), dd = hyp(rx - ca * t, ry - sa * t);
                if (dd < p.w + e.r) degat(e, p.dmgTick, tireur, { sup: true });
              }
              for (const s of S.steles) {
                if (s.hp <= 0) continue;
                const rx = s.x - p.x, ry = s.y - p.y, t = clamp(rx * ca + ry * sa, 0, p.l);
                if (hyp(rx - ca * t, ry - sa * t) < p.w + RAYON_STELE) degatStele(s, p.dmgTick, tireur, true);
              }
            }
            if (p.t >= p.T) vivant = false;
          }
        } else if (p.k === 'lob') {
          p.t += dt;
          const k = clamp(p.t / p.T, 0, 1);
          p.x = p.x0 + (p.tx - p.x0) * k; p.y = p.y0 + (p.ty - p.y0) * k;
          if (k >= 1) {
            for (const e of S.f) if (e.vivant && e.slot !== p.o && hyp(e.x - p.tx, e.y - p.ty) < p.r + e.r * 0.6) { if (degat(e, p.dmg, tireur, { sup: p.sup, fin: p.fin }) && p.etourdit) etourdir(e, p.etourdit); }
            for (const s of S.steles) if (s.hp > 0 && hyp(s.x - p.tx, s.y - p.ty) < p.r + RAYON_STELE) degatStele(s, p.dmg, tireur, p.sup);
            ev({ k: 'boum', x: +p.tx.toFixed(2), y: +p.ty.toFixed(2), r: p.r, o: p.o, f: p.forme });
            vivant = false;
          }
        } else {
          const n = Math.max(1, Math.ceil(hyp(p.vx, p.vy) * dt / 0.3));
          for (let i = 0; i < n && vivant; i++) {
            const sx = p.vx * dt / n, sy = p.vy * dt / n;
            p.x += sx; p.y += sy; p.reste -= hyp(sx, sy);
            if (p.reste <= 0 || Math.abs(p.x) > carte.demi || Math.abs(p.y) > carte.demi) { vivant = false; break; }
            if (dansObstacle(carte, p.x, p.y, -0.05)) { vivant = false; ev({ k: 'mur', x: +p.x.toFixed(2), y: +p.y.toFixed(2), o: p.o, f: p.forme }); break; }
            for (const e of S.f) {
              if (!e.vivant || e.slot === p.o || (e.proj && e.proj.type === 'saut') || p.touches.indexOf(e.slot) >= 0) continue;
              if (hyp(e.x - p.x, e.y - p.y) < e.r + p.r) {
                p.touches.push(e.slot);
                if (degat(e, p.dmg, tireur, { sup: p.sup, fin: p.fin })) {
                  if (p.ralenti) { e.lent = Math.max(e.lent, p.ralenti.duree); e.lentF = p.ralenti.facteur; }
                  if (p.recul) pousser(e, p.vx, p.vy, p.recul);
                  if (p.etourdit) etourdir(e, p.etourdit);
                  if (!p.perce) { vivant = false; break; }
                }
              }
            }
            if (!vivant) break;
            for (const s of S.steles) {
              if (s.hp <= 0 || p.touches.indexOf('s' + s.id) >= 0) continue;
              if (hyp(s.x - p.x, s.y - p.y) < RAYON_STELE + p.r) {
                p.touches.push('s' + s.id);
                degatStele(s, p.dmg, tireur, p.sup);
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
          for (const e of S.f) if (e.vivant && e.slot !== z.o && hyp(e.x - z.x, e.y - z.y) < z.r + e.r * 0.5) { if (degat(e, z.dmg, src, { sup: true })) etourdir(e, z.etourdit); }
          for (const s of S.steles) if (s.hp > 0 && hyp(s.x - z.x, s.y - z.y) < z.r + RAYON_STELE) degatStele(s, z.dmg, src, true);
          ev({ k: 'foudre', x: +z.x.toFixed(2), y: +z.y.toFixed(2), r: z.r, o: z.o });
        } else garde.push(z);
      }
      S.z = garde;
    }

    function ramasser() {
      if (!S.runes.length) return;
      S.runes = S.runes.filter(ru => {
        for (const f of S.f) {
          if (!f.vivant || (f.proj && f.proj.type === 'saut')) continue;
          if (hyp(f.x - ru.x, f.y - ru.y) < f.r + 0.45 && f.runes < R.RUNES.MAX) {
            f.runes++;
            const nouv = Math.round(f.hpBase * (1 + f.runes * R.RUNES.BONUS_PV));
            f.hp += nouv - f.hpMax; f.hpMax = nouv;
            gagnerKi(f, KI.PAR_RUNE);
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
        changerEtat(f, 'ko'); f.tampon = null; f.salve = null; f.combo = null;
        S.ordre.push(f.slot);
        const tueur = f.parQui >= 0 && S.t - f.parQuiT < 4 ? S.f[f.parQui] : null;
        if (tueur && tueur !== f) tueur.kills++;
        const n = Math.min(6, f.runes + 1);
        for (let i = 0; i < n; i++) {
          const a = i / n * TAU + rnd(), dd = n > 1 ? 0.9 : 0;
          let x = f.x + Math.cos(a) * dd, y = f.y + Math.sin(a) * dd;
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
        v.sort((a, b) => a.hp / a.hpMax - b.hp / b.hpMax || a.degats - b.degats);
        let n = v.length;
        v.forEach(f => { f.place = n--; f.vivant = false; changerEtat(f, 'ko'); S.ordre.push(f.slot); });
        S.fini = true;
      }
    }

    /* ------------------------------------------------------------------ */
    /* Bots : mêmes règles que le joueur (charges, fenêtres, Ki, esquive)  */
    /* ------------------------------------------------------------------ */
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
      t += (A.prep || 0.1);
      const k = 0.3 + N.precision * 0.7;
      const px = c.x + (c.vx || 0) * t * k, py = c.y + (c.vy || 0) * t * k;
      const err = (1 - N.precision) * 0.55 * (rnd() * 2 - 1);
      return { a: Math.atan2(py - f.y, px - f.x) + err, d: hyp(px - f.x, py - f.y) };
    }

    /* Point derrière un mur proche, à l'abri de la cible (usage tactique du décor). */
    function abri(f, c) {
      let best = null, bd = 1e9;
      for (const m of carte.murs) {
        const dm = hyp(m.x - f.x, m.y - f.y);
        if (dm > 9) continue;
        const ux = m.x - c.x, uy = m.y - c.y, L = hyp(ux, uy) || 1;
        const off = Math.max(m.w, m.h) / 2 + 1.1;
        const px = m.x + ux / L * off, py = m.y + uy / L * off;
        if (dansObstacle(carte, px, py, f.r) || !segmentBloque(carte, c.x, c.y, px, py)) continue;
        const sc = hyp(px - f.x, py - f.y);
        if (sc < bd) { bd = sc; best = { x: px, y: py }; }
      }
      return best;
    }

    /* Danger imminent pour un bot : projectile qui arrive, coup de mêlée ou projection en préparation qui le vise. */
    function esquiveBot(f, N) {
      if (f.esqCd > 0 || !(f.etat === 'libre' || f.etat === 'attaque') || rnd() >= N.esquive) return null;
      let danger = null;
      for (const p of S.p) {
        if (p.k !== 'tir' || p.o === f.slot) continue;
        const rx = f.x - p.x, ry = f.y - p.y, dd = hyp(rx, ry);
        if (dd > 4) continue;
        const v = hyp(p.vx, p.vy) || 1;
        if ((rx * p.vx + ry * p.vy) / (dd * v) > 0.9) { const s = (rx * p.vy - ry * p.vx) > 0 ? 1 : -1; danger = Math.atan2(-p.vx / v * s, p.vy / v * s); break; }
      }
      /* coup au corps à corps en préparation qui vise le bot */
      if (danger == null) for (const e of S.f) {
        if (e === f || !e.vivant || e.etat !== 'attaque' || !e.att || e.att.tire || e.att.def.type !== 'cone') continue;
        const dx = f.x - e.x, dy = f.y - e.y, dd = hyp(dx, dy);
        let da = Math.atan2(dy, dx) - e.att.a; da = Math.atan2(Math.sin(da), Math.cos(da));
        if (dd < e.att.def.portee + 1 && Math.abs(da) < (e.att.def.angle || 60) * DEG / 2 + 0.3) { danger = Math.atan2(dy, dx); break; }
      }
      if (danger == null) for (const e of S.f) {
        if (e === f || !e.vivant || e.etat !== 'preparation' || !e.spec) continue;
        const dx = f.x - e.x, dy = f.y - e.y, dd = hyp(dx, dy);
        let da = Math.atan2(dy, dx) - e.spec.a; da = Math.atan2(Math.sin(da), Math.cos(da));
        if (dd < 9 && Math.abs(da) < 0.5) { danger = e.spec.a + (da > 0 ? Math.PI / 2 : -Math.PI / 2); break; }
      }
      return danger;
    }

    function entreeBot(f, dt) {
      if (!f.ia) f.ia = { next: rnd() * 0.4, mx: 0, my: 0, strafe: rnd() < 0.5 ? 1 : -1, bx: f.x, by: f.y, coince: 0, errance: null, combo: 0, delaiCombo: 0, cible: -1 };
      const B = f.ia, N = f.bot, d = PERSO[f.perso], A = d.attaque, Su = d.special;
      const out = { mx: B.mx, my: B.my, appuis: [] };
      const presser = (act, v) => out.appuis.push({ act, a: v.a, d: v.d });

      /* combo en cours : on presse dans la fenêtre, avec un rythme humain (jamais du spam) */
      if (B.combo > 0 && f.etat === 'attaque' && f.att && f.att.tire && !f.tampon) {
        const c = S.f[B.cible];
        const ouvre = f.att.prep + f.att.recup * R.COMBO.OUVERTURE_RECUP;
        if (f.att.t >= ouvre + B.delaiCombo && f.charges >= 1 && c && c.vivant) {
          const def2 = etapeDef(d, Math.min(3, f.att.etape + 1), false);
          if (hyp(c.x - f.x, c.y - f.y) <= def2.portee * (def2.type === 'cone' ? 1.05 : 0.95)) {
            presser('A', viser(f, c, def2));
            B.combo--; B.delaiCombo = (1 - N.combo) * 0.25 * rnd();
            /* après deux étapes, un bot doué finit par une projection moins chère */
            if (B.combo === 0 && f.att.etape >= 2 && rnd() < N.specialSage * 0.5 && f.ki >= Su.cout * (1 - R.COMBO.REDUCTION_KI_APRES_COMBO)) B.finSpecial = true;
          } else B.combo = 0;
        }
      }
      if (B.finSpecial && f.etat === 'attaque' && f.att && f.att.t >= f.att.prep + f.att.recup * (1 - R.COMBO.ANNULATION_RECUP)) {
        const c = S.f[B.cible];
        B.finSpecial = false;
        if (c && c.vivant) presser('S', viser(f, c, Su));
      }

      /* réflexe d'esquive : vérifié plus souvent que les décisions, mais avec un temps de réaction */
      B.reflexe = (B.reflexe || 0) - dt;
      if (B.reflexe <= 0) {
        B.reflexe = 0.12 + N.reaction * 0.4;
        const q = esquiveBot(f, N);
        if (q != null) presser('E', { a: q, d: 0 });
      }
      B.next -= dt;
      if (B.next > 0) return out;
      const pas = N.reaction * (0.7 + rnd() * 0.6);
      B.next = pas;

      if (hyp(f.x - B.bx, f.y - B.by) < 0.08 && hyp(B.mx, B.my) > 0.3 && f.etat === 'libre') B.coince += pas; else B.coince = 0;
      B.bx = f.x; B.by = f.y;
      if (B.coince > 0.8) { const a = rnd() * TAU; B.errance = { x: f.x + Math.cos(a) * 5, y: f.y + Math.sin(a) * 5, t: S.t + 1.5 }; B.coince = 0; }

      const z = S.zone, dz = hyp(f.x - z.cx, f.y - z.cy), marge = z.r - dz;
      const hpR = f.hp / f.hpMax;
      const engage = Math.min(12, 2.6 + N.agressivite * 2 + S.t / 11 + f.runes * 0.6);
      const agresseur = f.parQui >= 0 && S.t - f.parQuiT < 2.5 ? f.parQui : -1;
      /* objectif : maximiser les éliminations → achever les blessés, profiter des duels des autres */
      let cible = null, meilleur = 1e9;
      for (const e of S.f) {
        if (e === f || !e.vivant || !visible(f, e)) continue;
        const dd = hyp(e.x - f.x, e.y - f.y);
        if (dd > (e.slot === agresseur ? 12 : engage)) continue;
        const occupe = e.parQui >= 0 && e.parQui !== f.slot && S.t - e.parQuiT < 1.5;
        const score = dd * (0.45 + 0.55 * e.hp / e.hpMax) * (occupe ? 0.7 : 1) * (e.humain ? 0.92 : 1);
        if (score < meilleur) { meilleur = score; cible = e; }
      }
      const portee = A.portee + (A.type === 'cone' ? 0.3 : 0);
      let tx = null, ty = null;

      if (B.errance && S.t < B.errance.t) { tx = B.errance.x; ty = B.errance.y; }
      else if (marge < 2.2 + dz * 0.04) {
        tx = z.cx + (f.x - z.cx) * 0.25; ty = z.cy + (f.y - z.cy) * 0.25;
      } else if (cible) {
        B.cible = cible.slot;
        const dx = cible.x - f.x, dy = cible.y - f.y, dd = hyp(dx, dy) || 1, ux = dx / dd, uy = dy / dd;
        const fuir = hpR < 0.32 && cible.hp / cible.hpMax > hpR + 0.12 && rnd() > N.agressivite * 0.6;
        const ldv = A.type === 'lob' || !segmentBloque(carte, f.x, f.y, cible.x, cible.y);
        if (fuir || (f.charges < 1 && dd < portee + 2 && rnd() < N.agressivite)) {
          /* à court de charges ou en danger : se mettre à l'abri derrière un mur */
          const ab = abri(f, cible);
          if (ab) { tx = ab.x; ty = ab.y; } else { tx = f.x - ux * 4 + (z.cx - f.x) * 0.15; ty = f.y - uy * 4 + (z.cy - f.y) * 0.15; }
        } else {
          const ideal = A.type === 'cone' ? 1.0 : portee * (0.62 + (1 - N.agressivite) * 0.2);
          const k = dd > ideal ? 1 : dd < ideal * 0.55 ? -0.7 : 0;
          if (rnd() < 0.2) B.strafe = -B.strafe;
          tx = f.x + ux * k * 3 - uy * B.strafe * 2.2; ty = f.y + uy * k * 3 + ux * B.strafe * 2.2;
        }
        /* attaque : un combo complet si les 3 charges sont là, sinon une pression isolée */
        if (f.etat === 'libre' && !f.tampon && dd <= portee * 0.96 && f.charges >= 1 && ldv && rnd() < 0.45 + N.agressivite * 0.55) {
          presser('A', viser(f, cible, A));
          B.combo = f.charges >= 2.99 && rnd() < N.combo ? 2 : 0;
          B.delaiCombo = (1 - N.combo) * 0.25 * rnd();
        }
        /* Ki : projection quand la situation s'y prête */
        if (f.etat === 'libre' && !out.appuis.length && f.ki >= Su.cout && rnd() < N.specialSage * 0.6) {
          const t = Su.type, P = Su.portee || Su.distance || 7;
          const attendre = f.ki < R.KI.AMPLIFIE_SEUIL && N.specialSage > 0.8 && hpR > 0.6 && rnd() < 0.5;
          if (!attendre) {
            if ((t === 'tir' || t === 'zone' || t === 'attraction' || t === 'saut') && dd <= P * 0.9 && (t !== 'tir' || ldv)) presser('S', viser(f, cible, Su));
            else if (t === 'faisceau' && dd <= P * 0.85 && ldv && hyp(cible.vx || 0, cible.vy || 0) < 3.5) presser('S', viser(f, cible, { type: 'tir', vitesseProj: 60 }));
            else if (t === 'ruee' && ldv && (dd <= Su.distance * 0.85 || (fuir && hpR < 0.25))) presser('S', fuir ? { a: Math.atan2(-uy, -ux), d: Su.distance } : viser(f, cible, { type: 'ruee' }));
            else if (t === 'bouclier' && (dd < 3.2 || hpR < 0.5)) presser('S', { a: Math.atan2(uy, ux), d: 0 });
            else if (t === 'invisibilite' && (dd < 7 || hpR < 0.4)) presser('S', { a: 0, d: 0 });
          }
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
            if (f.etat === 'libre' && !f.tampon && dd < portee * 0.95 && f.charges >= 1.5 && (A.type === 'lob' || !segmentBloque(carte, f.x, f.y, st.x, st.y))) presser('A', { a: Math.atan2(dy, dx) + (rnd() - 0.5) * 0.1, d: dd });
          } else {
            if (!B.but || hyp(B.but.x - f.x, B.but.y - f.y) < 1.5 || rnd() < 0.05) {
              const a = rnd() * TAU, rr = rnd() * Math.min(z.r * 0.6, carte.demi * 0.7);
              B.but = { x: z.cx + Math.cos(a) * rr, y: z.cy + Math.sin(a) * rr };
            }
            tx = B.but.x; ty = B.but.y;
          }
        }
      }

      if (tx != null) {
        const dx = tx - f.x, dy = ty - f.y, dd = hyp(dx, dy);
        if (dd > 0.3) { const [ux, uy] = directionLibre(f, dx / dd, dy / dd); B.mx = ux; B.my = uy; } else { B.mx = 0; B.my = 0; }
      } else { B.mx = 0; B.my = 0; }
      out.mx = B.mx; out.my = B.my;
      return out;
    }

    /* ---------- avancer la partie ---------- */
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

    function finirSansJoueur(maxPas) {
      let n = 0;
      const lim = maxPas || 12000;
      while (!S.fini && n++ < lim) pas(1 / 20, null);
      if (!S.fini) { S.t = R.DUREE_MAX_S; verifierFin(); }
    }

    /* ---------- réseau : état compact ---------- */
    const c2 = v => Math.round(v * 100);
    function instantane() {
      const evs = S.ev; S.ev = [];
      return {
        t: c2(S.t), z: c2(S.zone.r),
        f: S.f.map(f => [c2(f.x), c2(f.y), c2(f.ang), Math.max(0, Math.round(f.hp)), Math.round(f.hpMax), f.runes, c2(f.charges), Math.round(f.ki),
          (f.vivant ? 1 : 0) | (f.etourdi > 0 ? 2 : 0) | (f.bouclier > 0 ? 4 : 0) | (f.invisible > 0 ? 8 : 0) | (f.lent > 0 ? 16 : 0) | (f.brume ? 32 : 0) | (f.revele > 0 ? 64 : 0) | (f.invul > 0 ? 128 : 0) | (f.esqCd > 0 ? 256 : 0),
          f.place, f.force, f.kills, f.proj && f.proj.type === 'saut' ? c2(clamp(f.proj.t / f.proj.T, 0, 1)) : 0, f.lent > 0 ? c2(f.lentF) : 100, f.invisible > 0 ? c2(f.bonusVit) : 0,
          ETAT_CODE[f.etat] || 0, f.att ? f.att.etape : f.combo && S.t <= f.combo.ferme ? f.combo.etape : 0, f.spec ? c2(f.spec.a) : f.proj && f.proj.type === 'ruee' ? 1 : 0, c2(Math.max(0, f.esqCd))]),
        p: S.p.map(p => p.k === 'lob' ? [p.id, 1, c2(p.x0), c2(p.y0), c2(p.tx), c2(p.ty), c2(p.t), c2(p.T), c2(p.r), p.o, p.sup ? 1 : 0, FORMES.indexOf(p.forme)]
          : p.k === 'faisceau' ? [p.id, 2, c2(p.x), c2(p.y), c2(p.a), c2(p.l), c2(p.w), c2(p.t), c2(p.T), p.o]
          : [p.id, 0, c2(p.x), c2(p.y), c2(p.vx), c2(p.vy), c2(p.r), p.o, p.sup ? 1 : 0, c2(p.reste), FORMES.indexOf(p.forme), p.fin ? 1 : 0]),
        zs: S.z.map(z => [z.id, c2(z.x), c2(z.y), c2(z.r), c2(z.t), c2(z.T), z.o]),
        ru: S.runes.map(r => [r.id, c2(r.x), c2(r.y)]),
        st: S.steles.map(s => Math.max(0, Math.round(s.hp))),
        ev: evs.slice(0, 60),
        fin: S.fini ? S.ordre.slice() : null
      };
    }

    function classement() {
      return S.f.slice().sort((a, b) => (a.place || 99) - (b.place || 99)).map(f => f.slot);
    }

    S.pas = pas;
    S.entreeBot = entreeBot;
    S.instantane = instantane;
    S.finirSansJoueur = finirSansJoueur;
    S.classement = classement;
    S.vivants = vivants;
    S.coutSpecial = f => coutSpecial(f).cout;
    return S;
  }

  return { creerSimulation, genererCarte, deplacerSurCarte, segmentBloque, dansObstacle, dansBrume, visible, niveauBot, alea, distanceLibre, etapeDef, PERSO, RAYON_STELE, ETATS, FORMES };
})();
